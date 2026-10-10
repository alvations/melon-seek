// Juice tax probe (owner: juice-tax, docs/process/juice-tax.md).
// Downloads official tax documents the agent sandbox cannot reach (IRS, FTB, HMRC, CRA, ATO,
// NTA, ESTV, ...) and prints the lines that matter to the job log, so the tax rules in
// server/juice.js can be checked against primary sources. Read-only: it writes nothing back.
//
// REQUESTS (env, JSON): [{ "url": "...", "grep": "regex", "ctx": 1, "max": 120,
//                          "start": 0, "len": 120, "name": "label", "ua": "curl/8", "width": 400 }]
//   grep  case-insensitive regex; prints matching lines with `ctx` lines around them, at most
//         `max` lines. Without grep it prints `len` lines from `start`.
//   ua    optional User-Agent override (some sites answer 403 to a browser UA without JS)
//   width characters printed per line (default 400)
// PDFs go through pdftotext -layout; HTML is reduced to text lines.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const reqs = JSON.parse(process.env.REQUESTS || '[]');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'juice-probe-'));

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', euro: '€', pound: '£', yen: '¥', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', hellip: '…', middot: '·', times: '×', shy: '' };
function htmlToLines(html) {
  let s = html.replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|head)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\s*(br|\/p|\/div|\/li|\/tr|\/h\d|\/table|\/section|\/article|\/dd|\/dt|li|tr|p|h\d)\b[^>]*>/gi, '\n')
    .replace(/<\s*\/?(td|th)\b[^>]*>/gi, ' | ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
      if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
      return ENT[e.toLowerCase()] ?? m;
    });
  return s.split('\n').map((l) => l.replace(/[ \t ]+/g, ' ').replace(/(\s*\|\s*)+/g, ' | ').trim()).filter((l) => l && l !== '|');
}

function show(lines, r) {
  const max = r.max || 150;
  const W = r.width || 400;
  if (!r.grep) {
    const start = r.start || 0;
    lines.slice(start, start + (r.len || 120)).forEach((l, i) => console.log(`${String(start + i).padStart(5)}: ${l.slice(0, W)}`));
    return;
  }
  const re = new RegExp(r.grep, 'i');
  const ctx = r.ctx ?? 1;
  const keep = new Set();
  lines.forEach((l, i) => { if (re.test(l)) for (let k = i - ctx; k <= i + ctx; k++) if (k >= 0 && k < lines.length) keep.add(k); });
  const idx = [...keep].sort((a, b) => a - b);
  let printed = 0;
  let last = -2;
  for (const i of idx) {
    if (printed >= max) { console.log(`  ... (${idx.length - printed} more lines)`); break; }
    if (i !== last + 1) console.log('  --');
    console.log(`${String(i).padStart(5)}: ${lines[i].slice(0, W)}`);
    last = i;
    printed++;
  }
  if (!idx.length) console.log('  (no match)');
}

for (const [n, r] of reqs.entries()) {
  console.log(`\n===== [${n}] ${r.name || ''} ${r.url}`);
  try {
    const res = await fetch(r.url, { headers: { 'user-agent': r.ua || UA, accept: '*/*', 'accept-language': 'en,de;q=0.8,fr;q=0.6' }, redirect: 'follow', signal: AbortSignal.timeout(60000) });
    const buf = Buffer.from(await res.arrayBuffer());
    const type = res.headers.get('content-type') || '';
    console.log(`status ${res.status} type ${type} bytes ${buf.length} final ${res.url}`);
    let lines;
    if (/pdf/i.test(type) || buf.subarray(0, 5).toString() === '%PDF-') {
      const f = path.join(tmp, `doc${n}.pdf`);
      fs.writeFileSync(f, buf);
      lines = execFileSync('pdftotext', ['-layout', f, '-'], { encoding: 'utf8', maxBuffer: 1 << 28 }).split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim());
    } else {
      lines = htmlToLines(buf.toString('utf8'));
    }
    console.log(`lines ${lines.length}`);
    show(lines, r);
  } catch (e) {
    console.log(`ERROR ${e.name}: ${e.message}`);
  }
}
