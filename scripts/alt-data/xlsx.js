// Minimal streaming XLSX reader with no dependencies (docs/process/amazon-meta-data.md).
//
// The US Department of Labor publishes its disclosure files as .xlsx workbooks of
// 100-250 MB (one sheet, several GB of XML once inflated), so nothing here holds a whole
// sheet or the whole shared-string table in memory:
//   - the zip's central directory is read from the end of the file (ZIP64 aware);
//   - an entry is streamed through zlib.createInflateRaw;
//   - rows are cut out of the sheet XML one at a time;
//   - shared strings are resolved only for the indices a caller asks for.
//
//   const zip = await openZip(file);
//   const sheet = await firstSheet(zip);                     // 'xl/worksheets/sheet1.xml'
//   const header = await readHeader(zip, sheet);             // [{ col, ref }...] (shared-string refs unresolved)
//   await eachRow(zip, sheet, (row) => {...});               // row: Map col -> { t, v } (raw cells)
//   const strings = await sharedStrings(zip, { want: Set });  // Map index -> string
import fs from 'node:fs';
import zlib from 'node:zlib';
import { Readable } from 'node:stream';

const EOCD_SIG = 0x06054b50;
const ZIP64_LOCATOR_SIG = 0x07064b50;
const ZIP64_EOCD_SIG = 0x06064b50;
const CDH_SIG = 0x02014b50;
const LFH_SIG = 0x04034b50;
const MAX_TAIL = 65557 + 20 + 56; // EOCD (22) + longest comment (65535) + ZIP64 locator and record

/* ------------------------------------------------------------------ zip */

function readAt(fd, pos, len) {
  const buf = Buffer.alloc(len);
  let off = 0;
  while (off < len) {
    const n = fs.readSync(fd, buf, off, len - off, pos + off);
    if (!n) break;
    off += n;
  }
  return off === len ? buf : buf.subarray(0, off);
}

const u64 = (buf, at) => Number(buf.readBigUInt64LE(at));

/**
 * Central-directory entries from a buffer holding the end of a zip file.
 * `tailStart` is the absolute file offset of buf[0]; pass null when the file size is not
 * known (a ranged download of the last bytes): the entries' absolute offsets are still
 * right, because the directory sits directly before the end record.
 * @returns {{ entries: Array<{ name, method, compressedSize, size, offset, flags }>, cdOffset, cdSize, tailStart }}
 */
export function centralDirectory(buf, tailStart = null) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip file (no end-of-central-directory record)');
  let total = buf.readUInt16LE(eocd + 10);
  let cdSize = buf.readUInt32LE(eocd + 12);
  let cdOffset = buf.readUInt32LE(eocd + 16);
  const loc = eocd - 20;
  if ((total === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) && loc >= 0 && buf.readUInt32LE(loc) === ZIP64_LOCATOR_SIG) {
    const recAbs = u64(buf, loc + 8);
    if (tailStart == null) tailStart = recAbs - (loc - 56); // the ZIP64 record (56 bytes) sits right before its locator
    const rec = recAbs - tailStart;
    if (rec < 0 || buf.readUInt32LE(rec) !== ZIP64_EOCD_SIG) throw new Error('ZIP64 end record not in the buffer');
    total = u64(buf, rec + 32);
    cdSize = u64(buf, rec + 40);
    cdOffset = u64(buf, rec + 48);
  } else if (tailStart == null) {
    tailStart = cdOffset + cdSize - eocd; // the directory ends where the end record starts
  }
  let p = cdOffset - tailStart;
  if (p < 0) throw new Error(`central directory starts before the buffer (need ${-p} more bytes)`);
  const entries = [];
  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(p) !== CDH_SIG) throw new Error(`bad central directory entry ${n}`);
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    let compressedSize = buf.readUInt32LE(p + 20);
    let size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    let offset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    // ZIP64 extended information (0x0001): the 0xFFFFFFFF fields, in order size, compressed, offset.
    let e = p + 46 + nameLen;
    const end = e + extraLen;
    while (e + 4 <= end) {
      const id = buf.readUInt16LE(e);
      const len = buf.readUInt16LE(e + 2);
      if (id === 0x0001) {
        let q = e + 4;
        if (size === 0xffffffff) { size = u64(buf, q); q += 8; }
        if (compressedSize === 0xffffffff) { compressedSize = u64(buf, q); q += 8; }
        if (offset === 0xffffffff) { offset = u64(buf, q); q += 8; }
      }
      e += 4 + len;
    }
    entries.push({ name, method, compressedSize, size, offset, flags });
    p = end + commentLen;
  }
  return { entries, cdOffset, cdSize, tailStart };
}

/** Open a zip on disk: { file, size, entries, entry(name) }. */
export async function openZip(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const len = Math.min(size, MAX_TAIL);
    let tail = readAt(fd, size - len, len);
    let cd;
    try {
      cd = centralDirectory(tail, size - len);
    } catch (err) {
      // A directory larger than the tail: read it whole from the offset the end record names.
      const m = /need (\d+) more bytes/.exec(err.message);
      if (!m) throw err;
      const extra = Number(m[1]);
      tail = readAt(fd, size - len - extra, len + extra);
      cd = centralDirectory(tail, size - len - extra);
    }
    const byName = new Map(cd.entries.map((x) => [x.name, x]));
    return { file, size, entries: cd.entries, entry: (name) => byName.get(name) || null };
  } finally {
    fs.closeSync(fd);
  }
}

/** A readable stream of one entry's inflated bytes. */
export function entryStream(zip, entry) {
  const fd = fs.openSync(zip.file, 'r');
  let lfh;
  try { lfh = readAt(fd, entry.offset, 30); } finally { fs.closeSync(fd); }
  if (lfh.readUInt32LE(0) !== LFH_SIG) throw new Error(`bad local header for ${entry.name}`);
  const start = entry.offset + 30 + lfh.readUInt16LE(26) + lfh.readUInt16LE(28);
  if (!entry.compressedSize) return Readable.from([]);
  const raw = fs.createReadStream(zip.file, { start, end: start + entry.compressedSize - 1, highWaterMark: 1 << 20 });
  if (entry.method === 0) return raw;
  if (entry.method !== 8) throw new Error(`unsupported compression method ${entry.method} for ${entry.name}`);
  const inflate = zlib.createInflateRaw({ chunkSize: 1 << 20 });
  raw.on('error', (err) => inflate.destroy(err));
  return raw.pipe(inflate);
}

/* ------------------------------------------------------------------ xml */

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
/** XML text -> string: entities, numeric references and Excel's _xHHHH_ escapes. */
export function xmlText(s) {
  return String(s)
    .replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e]))
    .replace(/_x([0-9A-Fa-f]{4})_/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

/** Text of an <si> or <is> body: every <t> outside phonetic runs (<rPh>), joined. */
export function richText(body) {
  const b = String(body).replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  let out = '';
  for (const m of b.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g)) out += m[1] ? xmlText(m[1]) : '';
  return out;
}

/**
 * Feed text chunks; `onElement(xml)` gets each complete `<tag ...>...</tag>` (or `<tag/>`)
 * for the named tag, in order. Returns { push(chunk), end() }.
 */
export function elementSplitter(tag, onElement) {
  const open = `<${tag}`;
  const close = `</${tag}>`;
  let buf = '';
  const isBoundary = (ch) => ch === '>' || ch === ' ' || ch === '/' || ch === '\t' || ch === '\n' || ch === '\r';
  function drain() {
    let pos = 0;
    for (;;) {
      let s = buf.indexOf(open, pos);
      while (s >= 0 && s + open.length < buf.length && !isBoundary(buf[s + open.length])) s = buf.indexOf(open, s + 1);
      if (s < 0 || s + open.length >= buf.length) { buf = s < 0 ? buf.slice(Math.max(pos, buf.length - open.length)) : buf.slice(s); return; }
      const gt = buf.indexOf('>', s);
      if (gt < 0) { buf = buf.slice(s); return; }
      if (buf[gt - 1] === '/') { onElement(buf.slice(s, gt + 1)); pos = gt + 1; continue; }
      const e = buf.indexOf(close, gt);
      if (e < 0) { buf = buf.slice(s); return; }
      onElement(buf.slice(s, e + close.length));
      pos = e + close.length;
    }
  }
  return {
    push(chunk) { buf += chunk; drain(); },
    end() { drain(); buf = ''; },
  };
}

/** Run `onElement` over every <tag> element of an entry. Resolves when done; `stop()` ends early. */
export function eachElement(zip, entry, tag, onElement) {
  return new Promise((resolve, reject) => {
    const stream = entryStream(zip, entry);
    stream.setEncoding('utf8');
    let stopped = false;
    const stop = () => { if (!stopped) { stopped = true; stream.destroy(); resolve(); } };
    const split = elementSplitter(tag, (xml) => { if (!stopped) onElement(xml, stop); });
    stream.on('data', (c) => { try { split.push(c); } catch (err) { stopped = true; stream.destroy(); reject(err); } });
    stream.on('end', () => { if (!stopped) { split.end(); resolve(); } });
    stream.on('error', (err) => { if (!stopped) reject(err); });
  });
}

/* ---------------------------------------------------------------- sheet */

/** "AB12" -> 27 (zero-based column of a cell reference). */
export function colIndex(ref) {
  let n = 0;
  for (const ch of String(ref)) {
    const c = ch.charCodeAt(0);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

const CELL_RE = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
const ATTR = (attrs, name) => {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(attrs);
  return m ? m[1] : null;
};

/**
 * Cells of one <row> element: Map col -> { t, v }. `t` is the cell type ('s' shared string
 * index, 'inlineStr', 'str', 'n', 'b', 'e', 'd'); `v` is the raw value (an inline string is
 * already decoded). `only` (a Set of columns) skips the others.
 */
export function rowCells(rowXml, only = null) {
  const cells = new Map();
  let next = 0;
  for (const m of rowXml.matchAll(CELL_RE)) {
    const attrs = m[1];
    const ref = ATTR(attrs, 'r');
    const col = ref ? colIndex(ref) : next;
    next = col + 1;
    if (only && !only.has(col)) continue;
    const t = ATTR(attrs, 't') || 'n';
    const body = m[2] || '';
    let v = null;
    if (t === 'inlineStr') v = richText((/<is>([\s\S]*?)<\/is>/.exec(body) || [])[1] || '');
    else {
      const vm = /<v>([\s\S]*?)<\/v>/.exec(body);
      v = vm ? xmlText(vm[1]) : null;
    }
    if (v != null && v !== '') cells.set(col, { t, v });
  }
  return cells;
}

/** The row number of a <row r="N"> element (null if absent). */
export function rowNumber(rowXml) {
  const m = /^<row\b[^>]*?\br="(\d+)"/.exec(rowXml);
  return m ? Number(m[1]) : null;
}

/**
 * The cell of column `col` in a row element, found without parsing the other cells
 * (a fast pre-filter for a 100k-row sheet): { t, v } or null. Needs `r=` references.
 */
export function cellAt(rowXml, colLetters) {
  const n = rowNumber(rowXml);
  if (n == null) return rowCells(rowXml, new Set([colIndex(colLetters)])).get(colIndex(colLetters)) || null;
  const at = rowXml.indexOf(`<c r="${colLetters}${n}"`);
  if (at < 0) return null;
  const end = rowXml.indexOf('</c>', at);
  const selfEnd = rowXml.indexOf('/>', at);
  const gt = rowXml.indexOf('>', at);
  const xml = selfEnd >= 0 && selfEnd < gt + 1 ? rowXml.slice(at, selfEnd + 2) : rowXml.slice(at, end + 4);
  return rowCells(xml).get(colIndex(colLetters)) || null;
}

/** Column letters for a zero-based index: 0 -> "A", 27 -> "AB". */
export function colLetters(i) {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** The workbook's first sheet entry name (from xl/workbook.xml and its rels, else sheet1). */
export async function firstSheet(zip) {
  const wb = zip.entry('xl/workbook.xml');
  const rels = zip.entry('xl/_rels/workbook.xml.rels');
  if (wb && rels) {
    let rid = null;
    await eachElement(zip, wb, 'sheet', (xml, stop) => { rid = ATTR(xml, 'r:id') || ATTR(xml, 'id'); stop(); });
    let target = null;
    await eachElement(zip, rels, 'Relationship', (xml, stop) => {
      if (ATTR(xml, 'Id') === rid) { target = ATTR(xml, 'Target'); stop(); }
    });
    if (target) {
      const name = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
      if (zip.entry(name)) return name;
    }
  }
  const sheets = zip.entries.map((e) => e.name).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => Number(/(\d+)\.xml$/.exec(a)[1]) - Number(/(\d+)\.xml$/.exec(b)[1]));
  if (!sheets.length) throw new Error('no worksheet in the workbook');
  return sheets[0];
}

/** Every row of a sheet, in order: onRow(rowXml, stop). */
export function eachRowXml(zip, sheetName, onRow) {
  return eachElement(zip, zip.entry(sheetName), 'row', onRow);
}

/**
 * Shared strings by index. `want` (a Set of indices) keeps only those; `test(str, i)` adds
 * any string it returns true for to `matches` (a Set of indices). Strings are never all held.
 * @returns {Promise<{ strings: Map<number,string>, matches: Set<number>, count: number }>}
 */
export async function sharedStrings(zip, { want = null, test = null } = {}) {
  const entry = zip.entry('xl/sharedStrings.xml');
  const strings = new Map();
  const matches = new Set();
  if (!entry) return { strings, matches, count: 0 };
  let i = 0;
  await eachElement(zip, entry, 'si', (xml) => {
    const needed = !want || want.has(i);
    if (needed || test) {
      const body = xml.endsWith('/>') ? '' : xml.slice(xml.indexOf('>') + 1, -5);
      const s = richText(body);
      if (needed) strings.set(i, s);
      if (test && test(s, i)) matches.add(i);
    }
    i++;
  });
  return { strings, matches, count: i };
}

/** Excel serial date (1900 system) -> 'YYYY-MM-DD'; null outside 1950-2100. */
export function excelDate(serial) {
  const n = Number(serial);
  if (!Number.isFinite(n) || n < 18264 || n > 73051) return null;
  return new Date(Math.round((n - 25569) * 86400000)).toISOString().slice(0, 10);
}
