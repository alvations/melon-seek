// Updater: city rents in data/cities.json (docs/DATA_FRESHNESS.md, docs/LIVABILITY.md §4.2).
//
// What the Juice Score's rent line rests on, and how each part is refreshed:
//   rents-1br-quoted     1-bedroom city-centre / outside-centre quotes (Numbeo, 88 cities): no
//                        open feed and the terms forbid automated collection, so mode 'manual':
//                        a per-city checklist with each page month and a staleness date.
//   rents-us-hud-fmr     HUD Fair Market Rents, 30 HUD areas (40 US cities)  ┐ official bedroom
//   rents-gb-ons         ONS Price Index of Private Rents (5 UK areas)        │ ratios (2-bed ÷
//   rents-ie-rtb         RTB via CSO PxStat RIQ02 (Dublin)                   │ 1-bed, 3-bed ÷
//   rents-ch-zurich      Stadt Zürich Mietpreiserhebung (Zurich, Geneva)     │ 1-bed) behind the
//   rents-fr-olap        OLAP via data.gouv.fr (Paris)                       │ estimated 2- and
//   rents-ca-statcan     Statistics Canada 46-10-0092-01 (4 CMAs)            │ 3-bedroom rents:
//   rents-sg-hdb         HDB median rents (Singapore's third-bedroom step)   ┘ mode 'auto'
//   rents-nsw-official   NSW Rent and Sales Report: Sydney's three official rents (and the
//                        AU-sydney ratio Melbourne uses). 'auto' when the xlsx parses, else
//                        'detect' (a newer quarter on the page is a drift alert).
//   rents-bedroom-ratios the bedroomRatios table as a whole, the pooled ratio (median of six
//                        official ratios, used by 33 cities and Singapore's 2-bed step) and the
//                        whole-document validation; derived, recomputed here.
//
// 'auto' families fetch the official machine-readable release, rebuild the ratio entries of
// doc.bedroomRatios and the 2- and 3-bedroom fields of the cities that cite them (ratioKey),
// in exactly the household agent's schema (docs/process/scripts/juice-household-rents.mjs):
// local = round2(1-bedroom × ratio), USD re-derived with update-col's toUsdAt at the city's
// current fxPerUSD (so an FX change made earlier in the same run is respected). The 1-bedroom
// quotes are never touched except Sydney's official one. Nothing else in the file changes.
//
// Validation (exported, test/refresh-col.test.js): every official release must have 1 < 2 < 3
// bedroom levels; a ratio that moves more than MAX_RATIO_MOVE (15%) between releases, or a
// rent quote that moves more than MAX_LEVEL_MOVE (25%), is a 'flag' (nothing written for that
// family); the new document must pass update-col's validateDoc (1 < 2 < 3, sources with name,
// https url, asOf and class, USD = local ÷ FX), keep the same city count and keys, keep every
// outside-centre rent below the centre one (unless it already was not), and have no asOf in
// the future. A document that fails flags every result that would have written it.
//
// Optional secret HUD_API_TOKEN (free, huduser.gov): when the Federal Register shows a newer
// FMR fiscal year than HUD's eGIS feature service, the HUD USER API is asked for it. Without a
// token that case is a 'drift' alert with the steps to update by hand. huduser.gov's xlsx files
// answer scripted downloads with an HTTP 202 bot challenge, so they are not used.
import zlib from 'node:zlib';
import { result, errorResult, excerpt, relChange, isoDate, daysBetween, decodeEntities } from './lib.js';
import { RENT_PAIRS, toUsdAt, formatDoc, validateDoc, parseCsv } from '../update-col.js';

export const MODULE = Object.freeze({
  name: 'rents',
  ids: Object.freeze([
    'rents-us-hud-fmr', 'rents-gb-ons', 'rents-ie-rtb', 'rents-ch-zurich', 'rents-fr-olap', 'rents-ca-statcan', 'rents-sg-hdb',
    'rents-nsw-official', 'rents-bedroom-ratios', 'rents-1br-quoted',
  ]),
});

export const DOC_REF = 'docs/LIVABILITY.md §4.2';
export const POOLED_URL = 'https://github.com/alvations/melon-seek/blob/main/docs/LIVABILITY.md#42-rent-by-number-of-bedrooms';
/** The pooled ratio is the median of these official ratios (one per non-US source). */
export const POOL_KEYS = Object.freeze(['GB-london', 'IE', 'CH', 'FR', 'AU-sydney', 'CA-toronto']);
/** A bedroom ratio moving more than this between releases means the source changed, not the market. */
export const MAX_RATIO_MOVE = 0.15;
/** A rent quote moving more than this between releases (or a month) is held for review. */
export const MAX_LEVEL_MOVE = 0.25;
export const WEEKS_PER_MONTH = 52 / 12;
/** Manual quotes: Numbeo pages are re-read quarterly (docs/LIVABILITY.md §6), 30 days grace. */
export const QUOTE_CADENCE_DAYS = 92;
export const QUOTE_GRACE_DAYS = 30;

// ---------------------------------------------------------------- sources (URLs)

export const HUD = Object.freeze({
  service: 'https://services.arcgis.com/VTyQ9soqVukalItT/ArcGIS/rest/services/Fair_Market_Rents/FeatureServer/0',
  page: 'https://www.huduser.gov/portal/datasets/fmr.html',
  api: 'https://www.huduser.gov/hudapi/public/fmr/data/',
  fedreg: 'https://www.federalregister.gov/api/v1/documents.json?per_page=10&order=newest&conditions%5Bagencies%5D%5B%5D=housing-and-urban-development-department&conditions%5Bterm%5D=%22fair+market+rents%22+fiscal+year&fields%5B%5D=title&fields%5B%5D=publication_date&fields%5B%5D=document_number&fields%5B%5D=html_url&fields%5B%5D=type',
});
export const ONS = Object.freeze({
  page: 'https://www.ons.gov.uk/economy/inflationandpriceindices/datasets/priceindexofprivaterentsukmonthlypricestatistics',
  origin: 'https://www.ons.gov.uk',
  areas: Object.freeze({ 'GB-london': 'London', 'GB-cambridge': 'Cambridge', 'GB-oxford': 'Oxford', 'GB-manchester': 'Manchester', 'GB-scotland': 'Scotland' }),
});
export const CSO = Object.freeze({
  page: 'https://data.cso.ie/table/RIQ02',
  // JSON-RPC query: Dublin (120500), one/two/three bed (01/02/03), all property types (-), every quarter.
  query: { jsonrpc: '2.0', method: 'PxStat.Data.Cube_API.ReadDataset', params: { class: 'query', id: ['C02970V03592', 'C02969V03591', 'C03004V03625'], dimension: { C02970V03592: { category: { index: ['01', '02', '03'] } }, C02969V03591: { category: { index: ['-'] } }, C03004V03625: { category: { index: ['120500'] } } }, extension: { pivot: null, codes: false, language: { code: 'en' }, format: { type: 'JSON-stat', version: '2.0' }, matrix: 'RIQ02' }, version: '2.0' } },
  full: 'https://ws.cso.ie/public/api.restful/PxStat.Data.Cube_API.ReadDataset/RIQ02/JSON-stat/2.0/en',
});
export const CSO_QUERY_URL = `https://ws.cso.ie/public/api.jsonrpc?data=${encodeURIComponent(JSON.stringify(CSO.query))}`;
export const ZURICH = Object.freeze({
  page: 'https://data.stadt-zuerich.ch/dataset/bau_whg_mpe_mietpreis_raum_zizahl_gn_jahr_od5161',
  csv: 'https://data.stadt-zuerich.ch/dataset/bau_whg_mpe_mietpreis_raum_zizahl_gn_jahr_od5161/download/BAU516OD5161.csv',
});
export const OLAP = Object.freeze({
  page: 'https://www.data.gouv.fr/fr/datasets/resultats-nationaux-des-observatoires-locaux-des-loyers/',
  api: 'https://www.data.gouv.fr/api/1/datasets/resultats-nationaux-des-observatoires-locaux-des-loyers/',
});
export const STATCAN = Object.freeze({
  page: 'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=4610009201',
  zip: 'https://www150.statcan.gc.ca/n1/tbl/csv/46100092-eng.zip',
  // ratio key -> [GEO in the table, name used in the source text, short label]
  cmas: Object.freeze({
    'CA-toronto': ['Toronto, Census metropolitan area (CMA)', 'Toronto', 'Toronto'],
    'CA-vancouver': ['Vancouver, Census metropolitan area (CMA)', 'Vancouver', 'Vancouver'],
    'CA-montreal': ['Montréal, Census metropolitan area (CMA)', 'Montréal', 'Montréal'],
    'CA-ottawa': ['Ottawa - Gatineau (Ontario part), Census metropolitan area (CMA)', 'Ottawa - Gatineau (Ontario part)', 'Ottawa (Ontario part)'],
  }),
});
export const HDB = Object.freeze({
  page: 'https://data.gov.sg/datasets/d_23000a00c52996c55106084ed0339566/view',
  api: 'https://data.gov.sg/api/action/datastore_search?resource_id=d_23000a00c52996c55106084ed0339566&filters=%7B%22town%22%3A%22CENTRAL%22%7D&limit=1000',
});
export const NSW = Object.freeze({
  page: 'https://dcj.nsw.gov.au/about-us/families-and-communities-statistics/housing-rent-and-sales/rent-and-sales-report.html',
  origin: 'https://dcj.nsw.gov.au',
  city: 'sydney-nsw-au',
  key: 'AU-sydney',
});

// ---------------------------------------------------------------- small helpers

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const round2 = (x) => Math.round(x * 100) / 100;
export const round3 = (x) => Math.round(x * 1000) / 1000;
const grp = (n) => Number(n).toLocaleString('en-US');
const grp2 = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const QUARTER_WORD = ['first', 'second', 'third', 'fourth'];
const ym = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
/** 'YYYY-MM' (or 'YYYY') -> 'YYYY-MM-01' for registry asOf; null if not a date. */
export function dayOf(asOf) {
  if (!asOf) return null;
  const s = String(asOf);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01`;
  if (/^\d{4}$/.test(s)) return `${s}-01-01`;
  return null;
}
/** Is a 'YYYY[-MM[-DD]]' date later than today ('YYYY-MM-DD')? Compares at the granularity given. */
export function inFuture(asOf, today) {
  const s = String(asOf || '');
  if (!/^\d{4}(-\d{2}(-\d{2})?)?$/.test(s)) return false;
  return s > String(today).slice(0, s.length);
}
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------------------------------------------------------------- zip and xlsx (no dependencies)

/**
 * Minimal zip reader (store / deflate, central directory; no zip64, no encryption).
 * -> { names: [...], read(name) -> Buffer | null }
 */
export function readZip(buf) {
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip archive (no end-of-central-directory record)');
  const count = buf.readUInt16LE(eocd + 10);
  const cdOff = buf.readUInt32LE(eocd + 16);
  if (cdOff === 0xffffffff || count === 0xffff) throw new Error('zip64 archives are not supported');
  const entries = new Map();
  let p = cdOff;
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error(`bad central directory entry at ${p}`);
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28);
    const xlen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const lho = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    entries.set(name, { method, csize, usize, lho });
    p += 46 + nlen + xlen + clen;
  }
  return {
    names: [...entries.keys()],
    read(name) {
      const e = entries.get(name);
      if (!e) return null;
      if (buf.readUInt32LE(e.lho) !== 0x04034b50) throw new Error(`bad local header for ${name}`);
      const start = e.lho + 30 + buf.readUInt16LE(e.lho + 26) + buf.readUInt16LE(e.lho + 28);
      const data = buf.subarray(start, start + e.csize);
      if (e.method === 0) return Buffer.from(data);
      if (e.method === 8) return zlib.inflateRawSync(data);
      throw new Error(`zip method ${e.method} not supported (${name})`);
    },
  };
}

const xmlText = (s) => decodeEntities(String(s).replace(/<[^>]+>/g, ''));
/** 'AB12' -> 27 (0-based column index). */
export function columnIndex(ref) {
  const m = /^([A-Z]+)/.exec(ref || '');
  if (!m) return -1;
  let n = 0;
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}
/** Excel serial date -> 'YYYY-MM-DD' (1900 date system). */
export function excelDate(serial) {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(Number(serial) * 86400000));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * Minimal .xlsx reader. -> { sheets: [names], rows(sheetName, { keep }) -> array of rows }
 * Each row is an array of cell values (numbers for numeric cells, strings otherwise, '' for
 * gaps). `keep(rowXml)` may skip rows before they are decoded (the ONS Table 1 sheet has
 * tens of thousands of rows). Rows are found with Buffer.indexOf, so a sheet of several
 * hundred MB never becomes one string.
 */
export function readXlsx(buf) {
  const zip = readZip(buf);
  const text = (name) => { const b = zip.read(name); return b ? b.toString('utf8') : null; };
  const wb = text('xl/workbook.xml');
  if (!wb) throw new Error('not an xlsx workbook (no xl/workbook.xml)');
  const rels = text('xl/_rels/workbook.xml.rels') || '';
  const target = {};
  for (const m of rels.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = /\bId="([^"]+)"/.exec(m[1]);
    const t = /\bTarget="([^"]+)"/.exec(m[1]);
    if (id && t) target[id[1]] = t[1].replace(/^\/?xl\//, '').replace(/^\//, '');
  }
  const sheets = [];
  for (const m of wb.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const name = /\bname="([^"]*)"/.exec(m[1]);
    const rid = /\br:id="([^"]+)"/.exec(m[1]) || /\bid="([^"]+)"/.exec(m[1]);
    if (name && rid && target[rid[1]]) sheets.push({ name: decodeEntities(name[1]), file: `xl/${target[rid[1]]}` });
  }
  let shared = null;
  const sharedStrings = () => {
    if (shared) return shared;
    shared = [];
    const ss = zip.read('xl/sharedStrings.xml');
    if (!ss) return shared;
    let pos = 0;
    const open = Buffer.from('<si');
    const close = Buffer.from('</si>');
    for (;;) {
      const a = ss.indexOf(open, pos);
      if (a < 0) break;
      const selfClose = ss.indexOf('/>', a);
      const gt = ss.indexOf('>', a);
      if (selfClose >= 0 && selfClose < gt) { shared.push(''); pos = gt + 1; continue; }
      const b = ss.indexOf(close, a);
      if (b < 0) break;
      const si = ss.toString('utf8', a, b);
      const parts = [...si.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]);
      shared.push(decodeEntities(parts.join('')));
      pos = b + close.length;
    }
    return shared;
  };
  function rows(sheetName, { keep } = {}) {
    const sh = sheets.find((s) => s.name === sheetName);
    if (!sh) throw new Error(`sheet "${sheetName}" not found (sheets: ${sheets.map((s) => s.name).join(', ')})`);
    const xml = zip.read(sh.file);
    if (!xml) throw new Error(`sheet file ${sh.file} missing`);
    const strings = sharedStrings();
    const out = [];
    const open = Buffer.from('<row');
    const close = Buffer.from('</row>');
    let pos = 0;
    for (;;) {
      const a = xml.indexOf(open, pos);
      if (a < 0) break;
      const gt = xml.indexOf('>', a);
      if (xml[gt - 1] === 0x2f) { pos = gt + 1; continue; } // <row .../> (empty)
      const b = xml.indexOf(close, gt);
      if (b < 0) break;
      pos = b + close.length;
      const rowXml = xml.toString('utf8', a, b);
      if (keep && !keep(rowXml, strings)) continue;
      const row = [];
      for (const c of rowXml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1];
        const body = c[2] || '';
        const ref = /\br="([A-Z]+\d+)"/.exec(attrs);
        const t = (/\bt="([^"]+)"/.exec(attrs) || [])[1] || 'n';
        const idx = ref ? columnIndex(ref[1]) : row.length;
        let v = '';
        const vm = /<v>([\s\S]*?)<\/v>/.exec(body);
        if (t === 's') v = vm ? strings[Number(vm[1])] ?? '' : '';
        else if (t === 'inlineStr') v = xmlText((/<is>([\s\S]*?)<\/is>/.exec(body) || [])[1] || '');
        else if (t === 'str' || t === 'e') v = vm ? decodeEntities(vm[1]) : '';
        else if (t === 'b') v = vm ? vm[1] === '1' : '';
        else if (vm) { const num = Number(vm[1]); v = Number.isFinite(num) ? num : decodeEntities(vm[1]); }
        while (row.length < idx) row.push('');
        row[idx] = v;
      }
      out.push(row);
    }
    return out;
  }
  return { sheets: sheets.map((s) => s.name), rows, sharedStrings };
}

/**
 * A readXlsx `keep` filter: keep a row when one of its text cells (shared or inline string) is in
 * `wanted` (a Set of exact strings, or a predicate). Lets a 90 MB sheet be scanned without decoding
 * every row.
 */
export function keepRowsWith(wanted) {
  const ok = typeof wanted === 'function' ? wanted : (t) => wanted.has(t);
  return (rowXml, strings) => {
    for (const m of rowXml.matchAll(/<c\b([^>]*?)>([\s\S]*?)<\/c>/g)) {
      if (/\bt="s"/.test(m[1])) { const v = /<v>(\d+)<\/v>/.exec(m[2]); if (v && ok(strings[Number(v[1])] ?? '')) return true; }
      else if (/\bt="(inlineStr|str)"/.test(m[1])) { const t = xmlText((/<(?:t|v)\b[^>]*>([\s\S]*?)<\/(?:t|v)>/.exec(m[2]) || [])[1] || ''); if (ok(t)) return true; }
    }
    return false;
  };
}

// ---------------------------------------------------------------- JSON-stat

/** Decode a JSON-stat 2.0 dataset into records { [dimId]: label, ..., value }. */
export function jsonStatRecords(ds) {
  const d = ds && ds.result ? ds.result : ds;
  if (!d || !Array.isArray(d.id) || !Array.isArray(d.size)) throw new Error('not a JSON-stat 2.0 dataset');
  const cats = d.id.map((id) => {
    const c = d.dimension[id].category;
    const idx = c.index;
    const order = Array.isArray(idx) ? idx : Object.keys(idx).sort((a, b) => idx[a] - idx[b]);
    return order.map((code) => ({ code, label: (c.label && c.label[code]) ?? code }));
  });
  const total = d.size.reduce((a, b) => a * b, 1);
  const out = [];
  const val = (i) => (Array.isArray(d.value) ? d.value[i] : d.value[String(i)]);
  for (let i = 0; i < total; i++) {
    const v = val(i);
    if (v == null) continue;
    const rec = { value: v };
    let rem = i;
    for (let k = d.id.length - 1; k >= 0; k--) {
      const pos = rem % d.size[k];
      rem = Math.floor(rem / d.size[k]);
      rec[d.id[k]] = cats[k][pos].label;
      rec[`${d.id[k]}#code`] = cats[k][pos].code;
    }
    out.push(rec);
  }
  return { records: out, updated: d.updated || null, label: d.label || null };
}

// ---------------------------------------------------------------- parsers: one per source family
// Each returns { sourceAsOf: 'YYYY-MM', release, ratios: { [ratioKey]: { beds: [b1, b2, b3], entry: {...} } } }
// where `entry` holds only the fields the release determines (label, name, asOf, note, file).

/** HUD eGIS layer metadata -> { editDate, fy }. A data edit from July on publishes the next fiscal year. */
export function parseHudLayer(meta) {
  const ms = meta && meta.editingInfo && (meta.editingInfo.dataLastEditDate || meta.editingInfo.lastEditDate);
  if (!ms) throw new Error('HUD eGIS layer metadata has no editingInfo.lastEditDate');
  const d = new Date(ms);
  return { editDate: isoDate(d), fy: d.getUTCFullYear() + (d.getUTCMonth() >= 6 ? 1 : 0) };
}
/** Federal Register search -> newest FMR fiscal-year notice { fy, date, number, url, title } or null. */
export function parseFedRegFmr(json) {
  let best = null;
  for (const r of (json && json.results) || []) {
    const m = /^Fair Market Rents\b.*?Fiscal Year (\d{4})(.*)$/i.exec(r.title || '');
    if (!m) continue;
    const fy = Number(m[1]);
    const revised = /revis|correction|extension/i.test(m[2]);
    if (!best || fy > best.fy || (fy === best.fy && !revised && best.revised)) best = { fy, revised, date: r.publication_date, number: r.document_number, url: r.html_url, title: r.title };
  }
  return best;
}
export function hudQueryUrl(areas) {
  const where = `FMR_AREANAME IN (${[...areas].sort().map((a) => `'${a.replace(/'/g, "''")}'`).join(',')})`;
  const q = new URLSearchParams({ where, outFields: 'FMR_CODE,FMR_AREANAME,FMR_0BDR,FMR_1BDR,FMR_2BDR,FMR_3BDR,FMR_4BDR', returnGeometry: 'false', returnDistinctValues: 'true', orderByFields: 'FMR_AREANAME', f: 'json' });
  return `${HUD.service}/query?${q.toString()}`;
}
export function hudEntry(area, fy, beds, via = HUD.service) {
  return {
    label: `HUD FY${fy} Fair Market Rents, ${area}`,
    name: `HUD Fair Market Rents FY${fy} (40th-percentile gross rent incl. utilities), ${area}: 1 bedroom $${grp(beds[0])}, 2 bedrooms $${grp(beds[1])}, 3 bedrooms $${grp(beds[2])}`,
    url: HUD.page,
    asOf: `${fy - 1}-10`,
    via,
  };
}
/** eGIS query result -> family for the given areas (keys 'US:<area>'). */
export function parseHudAreas(json, areas, fy) {
  if (json && json.error) throw new Error(`HUD eGIS query error: ${JSON.stringify(json.error).slice(0, 200)}`);
  const feats = (json && json.features) || [];
  const byName = new Map();
  for (const f of feats) { const a = f.attributes || {}; if (a.FMR_AREANAME) byName.set(a.FMR_AREANAME, a); }
  const ratios = {};
  const missing = [];
  const codes = {};
  for (const area of areas) {
    const a = byName.get(area);
    if (!a) { missing.push(area); continue; }
    const beds = [a.FMR_1BDR, a.FMR_2BDR, a.FMR_3BDR].map(Number);
    ratios[`US:${area}`] = { beds, entry: hudEntry(area, fy, beds) };
    codes[area] = a.FMR_CODE;
  }
  return { sourceAsOf: `${fy - 1}-10`, release: `FY${fy}`, ratios, missing, codes };
}
/** HUD USER API /fmr/data/{entityid} response -> [1, 2, 3 bedroom] or null (shape documented, not yet verified). */
export function parseHudApi(json) {
  const d = json && json.data;
  if (!d) return null;
  let b = d.basicdata;
  if (Array.isArray(b)) b = b.find((x) => /msa level/i.test(String(x.zip_code || ''))) || b[0];
  if (!b) return null;
  const beds = [b['One-Bedroom'], b['Two-Bedroom'], b['Three-Bedroom']].map(Number);
  return beds.every((x) => x > 0) ? { beds, year: Number(b.year || d.year) || null } : null;
}

/** ONS landing page HTML -> editions [{ date: 'YYYY-MM-DD', url }] newest first. */
export function parseOnsEditions(html) {
  const out = [];
  const seen = new Set();
  for (const m of String(html).matchAll(/href="([^"]*\/datasets\/priceindexofprivaterentsukmonthlypricestatistics\/(\d{1,2})([a-z]+)(\d{4})\/[^"]+\.xlsx)"/gi)) {
    const mi = MONTHS.indexOf(m[3].toLowerCase());
    if (mi < 0) continue;
    const date = `${m[4]}-${String(mi + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
    const url = decodeEntities(m[1]).startsWith('http') ? decodeEntities(m[1]) : `${ONS.origin}${decodeEntities(m[1])}`;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ date, url });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}
/** Edition date ('YYYY-MM-DD') encoded in an ONS file URL, or null. */
export function onsEditionOf(url) {
  const m = /priceindexofprivaterentsukmonthlypricestatistics\/(\d{1,2})([a-z]+)(\d{4})\//i.exec(String(url || ''));
  if (!m) return null;
  const mi = MONTHS.indexOf(m[2].toLowerCase());
  return mi < 0 ? null : `${m[3]}-${String(mi + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}
function cellDate(v) {
  if (typeof v === 'number') return excelDate(v);
  const s = String(v || '').trim();
  let m;
  if ((m = /^(\d{4})-(\d{2})(-\d{2})?/.exec(s))) return `${m[1]}-${m[2]}-01`;
  if ((m = /^([A-Za-z]{3,9})[\s-]+(\d{4})$/.exec(s))) { const mi = MONTHS.findIndex((x) => x.startsWith(m[1].toLowerCase().slice(0, 3))); return mi < 0 ? null : `${m[2]}-${String(mi + 1).padStart(2, '0')}-01`; }
  return null;
}
/**
 * ONS PIPR Table 1 rows -> family. Header row has 'Time period', 'Area name', 'Rental price one bed',
 * 'Rental price two bed', 'Rental price three bed' (read from the 16 September 2026 release).
 */
export function parseOnsTable1(rows, { edition, fileUrl, areas = ONS.areas } = {}) {
  const hi = rows.findIndex((r) => r.some((c) => String(c).trim() === 'Area name') && r.some((c) => String(c).trim() === 'Time period'));
  if (hi < 0) throw new Error('ONS Table 1: header row (Time period, Area name) not found');
  const h = rows[hi].map((c) => String(c).trim());
  const col = (name) => { const i = h.indexOf(name); if (i < 0) throw new Error(`ONS Table 1: column "${name}" not found`); return i; };
  const cT = col('Time period'), cA = col('Area name'), c1 = col('Rental price one bed'), c2 = col('Rental price two bed'), c3 = col('Rental price three bed');
  const wanted = new Map(Object.entries(areas).map(([k, a]) => [a, k]));
  const latest = {};
  for (const r of rows.slice(hi + 1)) {
    const key = wanted.get(String(r[cA] ?? '').trim());
    if (!key) continue;
    const t = cellDate(r[cT]);
    const beds = [r[c1], r[c2], r[c3]].map(Number);
    if (!t || !beds.every((x) => x > 0)) continue;
    if (!latest[key] || t > latest[key].t) latest[key] = { t, beds };
  }
  const ratios = {};
  let asOf = null;
  const ed = edition ? new Date(`${edition}T00:00:00Z`) : null;
  const editionText = ed ? `${ed.getUTCDate()} ${cap(MONTHS[ed.getUTCMonth()])} ${ed.getUTCFullYear()}` : null;
  for (const [key, { t, beds }] of Object.entries(latest)) {
    const month = `${cap(MONTHS[Number(t.slice(5, 7)) - 1])} ${t.slice(0, 4)}`;
    const area = areas[key];
    ratios[key] = {
      beds,
      entry: {
        label: `ONS private rents, ${area}, ${month}`,
        name: `ONS Price Index of Private Rents, ${month}: mean monthly private rent by bedrooms, ${area} (1 bed £${beds[0]}, 2 bed £${beds[1]}, 3 bed £${beds[2]})`,
        asOf: t.slice(0, 7),
        ...(fileUrl ? { file: fileUrl } : {}),
        ...(editionText ? { note: `All private tenancies (not only new lets), Table 1 of the ${editionText} release.` } : {}),
      },
    };
    if (!asOf || t.slice(0, 7) > asOf) asOf = t.slice(0, 7);
  }
  return { sourceAsOf: asOf, release: edition ? `edition ${edition}` : asOf, ratios };
}

/** CSO RIQ02 JSON-stat (Dublin query or the full cube) -> family for 'IE'. */
export function parseCsoRiq02(json) {
  const { records, updated } = jsonStatRecords(json);
  const want = { 'One bed': 0, 'Two bed': 1, 'Three bed': 2 };
  const byQ = new Map();
  for (const r of records) {
    if (r.C03004V03625 !== 'Dublin' || r.C02969V03591 !== 'All property types' || !(r.C02970V03592 in want)) continue;
    const q = r['TLIST(Q1)'];
    if (!byQ.has(q)) byQ.set(q, [null, null, null]);
    byQ.get(q)[want[r.C02970V03592]] = Number(r.value);
  }
  const quarters = [...byQ.keys()].filter((q) => byQ.get(q).every((x) => x > 0)).sort();
  const q = quarters.pop();
  if (!q) throw new Error('RIQ02: no quarter with Dublin one/two/three bed rents');
  const m = /^(\d{4})Q([1-4])$/.exec(q);
  if (!m) throw new Error(`RIQ02: unexpected quarter label ${q}`);
  const beds = byQ.get(q);
  const qn = Number(m[2]);
  const upd = updated ? String(updated).slice(0, 10) : null;
  return {
    sourceAsOf: ym(m[1], qn * 3),
    release: `${m[1]} Q${qn}`,
    updated: upd,
    ratios: {
      IE: {
        beds,
        entry: {
          label: `RTB new tenancies, Dublin, ${m[1]} Q${qn}`,
          name: `Residential Tenancies Board Rent Index via CSO PxStat table RIQ02, ${m[1]} Q${qn}: standardised average monthly rent for new tenancies, Dublin, all property types (1 bed €${grp2(beds[0])}, 2 bed €${grp2(beds[1])}, 3 bed €${grp2(beds[2])})`,
          asOf: ym(m[1], qn * 3),
          note: `Quarter ${m[1]} Q${qn}${upd ? ` (table updated ${upd})` : ''}. New tenancies registered with the RTB, county Dublin.`,
        },
      },
    },
  };
}

/** Stadt Zürich BAU516OD5161.csv -> family for 'CH' (private flats let in the last 2 years, whole city, medians). */
export function parseZurichCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length || !('qu50' in rows[0])) throw new Error('Zurich CSV: no qu50 column');
  const pick = rows.filter((r) => r.RaumeinheitLang === 'Ganze Stadt' && r.GliederungLang === 'Neubezug bis 2 Jahre' && r.GemeinnuetzigLang === 'Nicht gemeinnützig' && r.EinheitLang === 'Wohnung' && r.PreisartLang === 'netto');
  const years = [...new Set(pick.map((r) => r.StichtagDatJahr))].sort();
  for (const y of years.reverse()) {
    const by = Object.fromEntries(pick.filter((r) => r.StichtagDatJahr === y).map((r) => [r.ZimmerSort, r]));
    const beds = ['2', '3', '4'].map((z) => Number(by[z] && by[z].qu50));
    if (!beds.every((x) => x > 0)) continue;
    const mon = Number(String(by['2'].StichtagDatMonat || '').split('.')[1]) || 4;
    const month = cap(MONTHS[mon - 1]);
    return {
      sourceAsOf: ym(y, mon),
      release: `${month} ${y}`,
      ratios: {
        CH: {
          beds,
          entry: {
            label: `Stadt Zürich new tenancies, ${month} ${y}`,
            name: `Statistik Stadt Zürich, Mietpreiserhebung ${month} ${y}: median net rent of private (not non-profit) flats let in the last 2 years, whole city, by rooms (2 rooms CHF ${grp(beds[0])}, 3 rooms CHF ${grp(beds[1])}, 4 rooms CHF ${grp(beds[2])}; 2 / 3 / 4 rooms = 1 / 2 / 3 bedrooms)`,
            asOf: ym(y, mon),
          },
        },
      },
    };
  }
  throw new Error('Zurich CSV: no year with 2, 3 and 4 room medians for new private tenancies');
}

/** data.gouv.fr dataset JSON -> [{ year, url }] of the national CSV files, newest first. */
export function parseOlapDataset(json) {
  const out = [];
  for (const r of (json && json.resources) || []) {
    const m = /\/datagouv\/(\d{4})\/Base_OP_\1_Nationale\.csv$/i.exec(r.url || '');
    if (m) out.push({ year: Number(m[1]), url: r.url, modified: r.last_modified || null });
  }
  return out.sort((a, b) => b.year - a.year);
}
/** OLAP national CSV (semicolon, Latin-1) -> family for 'FR' (Paris intra-muros, tenants of less than a year). */
export function parseOlapCsv(text, { year, url } = {}) {
  const lines = String(text).split(/\r?\n/).filter(Boolean);
  const head = lines[0].split(';');
  const at = (name) => { const i = head.indexOf(name); if (i < 0) throw new Error(`OLAP CSV: column ${name} not found`); return i; };
  const cAgg = at('agglomeration'), cZone = at('Zone_complementaire'), cType = at('Type_habitat'), cEp = at('epoque_construction_homogene'), cAnc = at('anciennete_locataire_homogene'), cP = at('nombre_pieces_homogene'), cMed = at('loyer_mensuel_median'), cSurf = at('surface_moyenne'), cYear = at('Data_year');
  const want = { 'Ensemble 2P': 0, 'Ensemble 3P': 1, 'Ensemble 4P+': 2 };
  const beds = [null, null, null];
  let surf4 = null;
  let dataYear = year || null;
  for (const l of lines.slice(1)) {
    const f = l.split(';');
    if (f[cAgg] !== 'Paris intra-muros' || f[cZone] || f[cType] || f[cEp] || !/^1\.\s*Moins de 1 an$/.test(f[cAnc] || '') || !(f[cP] in want)) continue;
    const v = Number(String(f[cMed]).replace(',', '.'));
    if (v > 0) beds[want[f[cP]]] = v;
    if (f[cP] === 'Ensemble 4P+') surf4 = Number(String(f[cSurf]).replace(',', '.')) || null;
    dataYear = Number(f[cYear]) || dataYear;
  }
  if (!beds.every((x) => x > 0)) throw new Error('OLAP CSV: Paris intra-muros new-tenant medians by rooms not found');
  return {
    sourceAsOf: `${dataYear}-01`,
    release: `loyers ${dataYear}`,
    ratios: {
      FR: {
        beds,
        entry: {
          label: `OLAP new tenants, Paris, ${dataYear}`,
          name: `Observatoire des loyers de l'agglomération parisienne (OLAP), loyers ${dataYear}, Paris intra-muros, tenants who moved in less than a year ago: median monthly rent excluding charges by rooms (2 rooms €${grp(beds[0])}, 3 rooms €${grp(beds[1])}, 4 or more rooms €${grp(beds[2])}; 2 / 3 / 4+ rooms = 1 / 2 / 3+ bedrooms)`,
          asOf: `${dataYear}-01`,
          ...(url ? { file: url } : {}),
          note: `Rents at 1 January ${dataYear} (data year ${dataYear}).${surf4 ? ` The "4 or more rooms" class averages ${surf4} m², so it overstates a typical 3-bedroom flat.` : ''}`,
        },
      },
    },
  };
}

/** Statistics Canada 46100092-eng.zip -> family for the four CMAs (average asking rents). */
export function parseStatcanZip(buf) {
  const zip = readZip(buf);
  const name = zip.names.find((n) => /^\d+\.csv$/.test(n));
  if (!name) throw new Error(`StatCan zip: data CSV not found (${zip.names.join(', ')})`);
  const rows = parseCsv(zip.read(name).toString('utf8'));
  const unit = { 'Apartment - 1 bedroom': 0, 'Apartment - 2 bedrooms': 1, 'Apartment - 3 or more bedrooms': 2 };
  const ratios = {};
  let asOf = null;
  for (const [key, [geo, nameText, short]] of Object.entries(STATCAN.cmas)) {
    const byDate = new Map();
    for (const r of rows) {
      if (r.GEO !== geo || r.Estimates !== 'Average asking rent' || !(r['Rental unit type'] in unit)) continue;
      const v = Number(r.VALUE);
      if (!(v > 0)) continue;
      if (!byDate.has(r.REF_DATE)) byDate.set(r.REF_DATE, [null, null, null]);
      byDate.get(r.REF_DATE)[unit[r['Rental unit type']]] = v;
    }
    const ref = [...byDate.keys()].filter((d) => byDate.get(d).every((x) => x > 0)).sort().pop();
    if (!ref) continue;
    const beds = byDate.get(ref);
    const [y, mo] = ref.split('-').map(Number);
    const q = Math.floor((mo - 1) / 3) + 1;
    ratios[key] = {
      beds,
      entry: {
        label: `Statistics Canada asking rents, ${short}, ${y} Q${q}`,
        name: `Statistics Canada table 46-10-0092-01, Quarterly rent statistics, ${y} Q${q}: average asking rent for apartments by bedrooms, ${nameText} census metropolitan area (1 bedroom $${beds[0]}, 2 bedrooms $${beds[1]}, 3 or more bedrooms $${beds[2]})`,
        asOf: ref,
        note: `Asking rents of listed apartments (new lettings), produced with CMHC. REF_DATE ${ref} is the ${QUARTER_WORD[q - 1]} quarter.`,
      },
    };
    if (!asOf || ref > asOf) asOf = ref;
  }
  if (!Object.keys(ratios).length) throw new Error('StatCan 46-10-0092-01: none of the four CMAs found');
  return { sourceAsOf: asOf, release: asOf, ratios };
}

/** data.gov.sg HDB median rents (town CENTRAL) -> { quarter, r3m, r4m, step, asOf } for the latest quarter with both. */
export function parseHdb(json) {
  const recs = (json && json.result && json.result.records) || [];
  if (!recs.length) throw new Error('HDB: no records');
  const byQ = new Map();
  for (const r of recs) {
    if (String(r.town).toUpperCase() !== 'CENTRAL') continue;
    const v = Number(r.median_rent);
    if (!(v > 0)) continue;
    if (!byQ.has(r.quarter)) byQ.set(r.quarter, {});
    byQ.get(r.quarter)[r.flat_type] = v;
  }
  const q = [...byQ.keys()].filter((k) => byQ.get(k)['3-RM'] > 0 && byQ.get(k)['4-RM'] > 0).sort().pop();
  if (!q) throw new Error('HDB: no quarter with Central Area 3-room and 4-room medians');
  const m = /^(\d{4})-Q([1-4])$/.exec(q);
  if (!m) throw new Error(`HDB: unexpected quarter ${q}`);
  const { '3-RM': r3m, '4-RM': r4m } = byQ.get(q);
  return { quarter: `${m[1]} Q${m[2]}`, r3m, r4m, step: r4m / r3m, asOf: ym(m[1], Number(m[2]) * 3), total: json.result.total };
}
export function sgEntry(pooled2, hdb) {
  return {
    label: `pooled official ratio and HDB Central Area 4-room ÷ 3-room, ${hdb.quarter}`,
    name: `Pooled 2-bedroom ÷ 1-bedroom ratio ${pooled2.toFixed(3)}, then Housing & Development Board via data.gov.sg, median rent by town and flat type, ${hdb.quarter}, Central Area: 3-room S$${grp(hdb.r3m)}, 4-room S$${grp(hdb.r4m)} (3-room = 2 bedrooms, 4-room = 3 bedrooms)`,
    asOf: hdb.asOf,
    note: `Public-housing flats; no 2-room (1-bedroom) median is published for the Central Area, so only the 3-bedroom ÷ 2-bedroom step (${hdb.step.toFixed(3)}) is taken from it.`,
  };
}

/** NSW Rent and Sales page HTML -> rent table editions [{ month, year, asOf, url }] newest first. */
export function parseNswEditions(html) {
  const out = [];
  const seen = new Set();
  for (const m of String(html).matchAll(/href="([^"]*rent-tables-([a-z]+)-(\d{4})-quarter\.xlsx)"/gi)) {
    const mi = MONTHS.indexOf(m[2].toLowerCase());
    if (mi < 0) continue;
    const url = m[1].startsWith('http') ? m[1] : `${NSW.origin}${m[1]}`;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ month: cap(MONTHS[mi]), year: Number(m[3]), asOf: ym(m[3], mi + 1), url });
  }
  return out.sort((a, b) => b.asOf.localeCompare(a.asOf));
}
/** asOf ('YYYY-MM') of an NSW rent-tables file URL, or null. */
export function nswEditionOf(url) {
  const m = /rent-tables-([a-z]+)-(\d{4})-quarter\.xlsx/i.exec(String(url || ''));
  const mi = m ? MONTHS.indexOf(m[1].toLowerCase()) : -1;
  return mi < 0 ? null : ym(m[2], mi + 1);
}
const num = (v) => { const n = Number(String(v ?? '').replace(/[,$\s]/g, '')); return Number.isFinite(n) && String(v ?? '').trim() !== '' ? n : null; };
/**
 * NSW rent tables (xlsx rows of the 'LGA' sheet) -> { weekly: [1, 2, 3 bed], bonds: [...] } for the
 * City of Sydney LGA, flats/units. Header: 'Local Government Area (LGA)', 'Dwelling Types',
 * 'Number of Bedrooms', 'Median Weekly Rent for New Bonds $', 'New Bonds Lodged No.'.
 */
export function parseNswLga(rows, { lga = 'Sydney' } = {}) {
  const hi = rows.findIndex((r) => r.some((c) => /^Local Government Area/i.test(String(c))) && r.some((c) => /^Number of Bedrooms$/i.test(String(c).trim())));
  if (hi < 0) throw new Error('NSW LGA sheet: header row not found');
  const h = rows[hi].map((c) => String(c).trim());
  const find = (re) => { const i = h.findIndex((c) => re.test(c)); if (i < 0) throw new Error(`NSW LGA sheet: column ${re} not found`); return i; };
  const cL = find(/^Local Government Area/i), cD = find(/^Dwelling Types?$/i), cB = find(/^Number of Bedrooms$/i), cM = find(/^Median Weekly Rent for New Bonds/i), cN = find(/^New Bonds Lodged/i);
  const want = { '1 bedroom': 0, '2 bedrooms': 1, '3 bedrooms': 2 };
  const weekly = [null, null, null];
  const bonds = [null, null, null];
  for (const r of rows.slice(hi + 1)) {
    if (String(r[cL]).trim() !== lga || !/flat|unit/i.test(String(r[cD]))) continue;
    const k = want[String(r[cB]).trim().toLowerCase()];
    if (k == null || weekly[k] != null) continue; // the LGA repeats under each region grouping: first row wins
    weekly[k] = num(r[cM]);
    bonds[k] = num(r[cN]);
  }
  if (!weekly.every((x) => x > 0)) throw new Error(`NSW LGA sheet: ${lga} flats/units 1-3 bedroom medians not found`);
  return { weekly, bonds };
}
/** NSW 'Postcode' sheet rows -> flats/units 1/2/3-bedroom median weekly rents for one postcode (cross-check), or null. */
export function parseNswPostcode(rows, postcode = 2000) {
  const hi = rows.findIndex((r) => String(r[0]).trim() === 'Postcode' && r.some((c) => /^Number of Bedrooms$/i.test(String(c).trim())));
  if (hi < 0) return null;
  const h = rows[hi].map((c) => String(c).trim());
  const cD = h.findIndex((c) => /^Dwelling Types?$/i.test(c));
  const cB = h.findIndex((c) => /^Number of Bedrooms$/i.test(c));
  const cM = h.findIndex((c) => /^Median Weekly Rent for New Bonds/i.test(c));
  if (cD < 0 || cB < 0 || cM < 0) return null;
  const want = { '1 bedroom': 0, '2 bedrooms': 1, '3 bedrooms': 2 };
  const out = [null, null, null];
  for (const r of rows.slice(hi + 1)) {
    if (Number(r[0]) !== Number(postcode) || !/flat|unit/i.test(String(r[cD]))) continue;
    const k = want[String(r[cB]).trim().toLowerCase()];
    if (k != null && out[k] == null) out[k] = num(r[cM]);
  }
  return out.every((x) => x > 0) ? out : null;
}

// ---------------------------------------------------------------- validation

/** Problems with one official release's levels and ratios against the encoded entries. */
export function validateFamily(doc, fam, { today = isoDate() } = {}) {
  const problems = [];
  const warnings = [];
  if (fam.sourceAsOf && inFuture(fam.sourceAsOf, today)) problems.push(`release ${fam.sourceAsOf} is in the future`);
  for (const [key, { beds, entry }] of Object.entries(fam.ratios || {})) {
    const prev = doc.bedroomRatios && doc.bedroomRatios[key];
    if (!prev) { warnings.push(`${key}: not in bedroomRatios (no city uses it); ignored`); continue; }
    if (!(beds.length === 3 && beds.every((x) => Number.isFinite(x) && x > 0))) { problems.push(`${key}: levels ${beds.join(' / ')} are not three positive numbers`); continue; }
    if (!(beds[0] < beds[1] && beds[1] < beds[2])) problems.push(`${key}: bedroom levels ${beds.join(' < ')} do not rise (1 < 2 < 3 bedrooms)`);
    const r = [beds[1] / beds[0], beds[2] / beds[0]];
    for (const [i, f] of [[0, 'r2'], [1, 'r3']]) {
      const ch = relChange(prev[f], r[i]);
      if (ch != null && Math.abs(ch) > MAX_RATIO_MOVE) problems.push(`${key}: ${f} ${prev[f]} -> ${round3(r[i])} moves ${(ch * 100).toFixed(1)}% (> ${MAX_RATIO_MOVE * 100}%)`);
    }
    const old = levelsInText(prev.name);
    if (old) beds.forEach((b, i) => { const ch = relChange(old[i], b); if (ch != null && Math.abs(ch) > MAX_LEVEL_MOVE) problems.push(`${key}: ${i + 1}-bedroom level ${old[i]} -> ${b} moves ${(ch * 100).toFixed(1)}% (> ${MAX_LEVEL_MOVE * 100}%)`); });
    if (entry.asOf && prev.asOf && entry.asOf < prev.asOf) problems.push(`${key}: release ${entry.asOf} is older than the encoded ${prev.asOf}`);
  }
  return { problems, warnings };
}
/** The three bedroom levels quoted in a source name ('1 bed £1760, 2 bed £2232, 3 bed £2643', '$2,977', ...), or null. */
export function levelsInText(name) {
  const s = String(name || '');
  const m = /1 (?:bed(?:room)?|bedroom)\s*[£$€]?\s*([\d,.]+)[^\d]+2 (?:bed(?:room)?s?)\s*[£$€]?\s*([\d,.]+)[^\d]+3 (?:or more )?(?:bed(?:room)?s?)\s*[£$€]?\s*([\d,.]+)/i.exec(s)
    || /2 rooms (?:CHF |€)?([\d,.]+), 3 rooms (?:CHF |€)?([\d,.]+), 4 (?:or more )?rooms (?:CHF |€)?([\d,.]+)/i.exec(s);
  if (!m) return null;
  const v = m.slice(1, 4).map((x) => Number(x.replace(/,/g, '')));
  return v.every((x) => x > 0) ? v : null;
}

/**
 * Whole-document checks for a refreshed cities.json against the one before it.
 * -> { problems (block the write), warnings }
 */
export function validateRentDoc(next, prev, { today = isoDate(), maxMove = MAX_LEVEL_MOVE } = {}) {
  const problems = [...validateDoc(next)];
  const warnings = [];
  const pk = (prev.cities || []).map((c) => c.key);
  const nk = (next.cities || []).map((c) => c.key);
  if (pk.length !== nk.length) problems.push(`city count changed: ${pk.length} -> ${nk.length}`);
  else if (pk.join('|') !== nk.join('|')) problems.push('city keys or their order changed');
  const before = new Map((prev.cities || []).map((c) => [c.key, c]));
  for (const c of next.cities || []) {
    const p = before.get(c.key);
    if (c.rent1brOutsideLocal != null && c.rent1brCenterLocal != null && !(c.rent1brOutsideLocal < c.rent1brCenterLocal)) {
      const was = p && p.rent1brOutsideLocal != null && !(p.rent1brOutsideLocal < p.rent1brCenterLocal);
      (was ? warnings : problems).push(`${c.key}: outside-centre rent ${c.rent1brOutsideLocal} is not below the centre rent ${c.rent1brCenterLocal}${was ? ' (already so before this refresh)' : ''}`);
    }
    if (!p) continue;
    for (const [, lf] of RENT_PAIRS) {
      const ch = relChange(p[lf], c[lf]);
      if (ch != null && Math.abs(ch) > maxMove) problems.push(`${c.key}: ${lf} ${p[lf]} -> ${c[lf]} moves ${(ch * 100).toFixed(1)}% (> ${maxMove * 100}%)`);
    }
    for (const [f, s] of Object.entries(c.sources || {})) {
      if (!s || typeof s !== 'object') continue;
      for (const k of ['class', 'url', 'asOf']) if (s[k] == null || s[k] === '') problems.push(`${c.key}: sources.${f} has no ${k}`);
    }
  }
  for (const [k, e] of Object.entries(next.bedroomRatios || {})) {
    if (k === 'description') continue;
    if (!(e.r2 > 1 && e.r3 > e.r2)) problems.push(`bedroomRatios.${k}: r2 ${e.r2} / r3 ${e.r3} must satisfy 1 < r2 < r3`);
    if (!/^https:\/\//.test(e.url || '') || !e.asOf) problems.push(`bedroomRatios.${k}: needs an https url and asOf`);
  }
  walkAsOf(next, '', (p, v) => { if (inFuture(v, today)) problems.push(`${p} = ${v} is in the future`); });
  return { problems, warnings };
}
function walkAsOf(o, p, fn) {
  if (Array.isArray(o)) { o.forEach((x, i) => walkAsOf(x, `${p}[${i}]`, fn)); return; }
  if (!o || typeof o !== 'object') return;
  for (const [k, v] of Object.entries(o)) {
    const q = p ? `${p}.${k}` : k;
    if ((k === 'asOf' || k === 'fxAsOf') && typeof v === 'string') fn(q, v);
    else if (v && typeof v === 'object') walkAsOf(v, q, fn);
  }
}

// ---------------------------------------------------------------- applying releases (pure)

/** Rebuild the 2- and 3-bedroom fields of every city citing ratioKey `key`. Mutates `doc`. */
export function rederiveCities(doc, key, r, entry) {
  const touched = [];
  for (const c of doc.cities) {
    let hit = false;
    for (const n of [2, 3]) {
      const lf = `rent${n}brCenterLocal`;
      const uf = `rent${n}brCenterUSD`;
      const src = c.sources && c.sources[lf];
      if (!src || src.ratioKey !== key || c.rent1brCenterLocal == null) continue;
      const ratio = r[n - 2];
      const local = round2(c.rent1brCenterLocal * ratio);
      c[lf] = local;
      c[uf] = toUsdAt(local, c.fxPerUSD);
      c.sources[lf] = {
        ...src,
        name: `Estimate: 1-bedroom rent × ${ratio.toFixed(3)}, the ${n}-bedroom ÷ 1-bedroom ratio of ${entry.label}`,
        url: entry.url,
        asOf: entry.asOf,
        method: `rent1brCenterLocal × ${ratio.toFixed(3)} (${DOC_REF})`,
        ratio: round3(ratio),
      };
      const us = c.sources[uf];
      if (us) c.sources[uf] = { ...us, url: entry.url, asOf: entry.asOf, ...(c.sources.fxPerUSD && c.sources.fxPerUSD.asOf ? { fxAsOf: c.sources.fxPerUSD.asOf } : {}) };
      hit = true;
    }
    if (hit) touched.push(c.key);
  }
  return touched;
}

/**
 * Apply one family's release to `doc` (mutated). Only entries whose content changes are rewritten.
 * -> { changes: [{ key, encoded, official, unit, note }], ratios: { key: [r2, r3] unrounded }, cities: [...] }
 */
export function applyFamily(doc, fam) {
  const changes = [];
  const ratios = {};
  const cities = new Set();
  for (const [key, { beds, entry }] of Object.entries(fam.ratios || {})) {
    const prev = doc.bedroomRatios && doc.bedroomRatios[key];
    if (!prev) continue;
    const r = [beds[1] / beds[0], beds[2] / beds[0]];
    ratios[key] = r;
    const next = { ...prev, ...entry, r2: round3(r[0]), r3: round3(r[1]) };
    if (same(next, prev)) continue;
    if (prev.r2 !== next.r2) changes.push({ key: `bedroomRatios.${key}.r2`, encoded: prev.r2, official: next.r2, unit: 'ratio', note: entry.label });
    if (prev.r3 !== next.r3) changes.push({ key: `bedroomRatios.${key}.r3`, encoded: prev.r3, official: next.r3, unit: 'ratio', note: entry.label });
    if (prev.asOf !== next.asOf) changes.push({ key: `bedroomRatios.${key}.asOf`, encoded: prev.asOf, official: next.asOf, note: entry.label });
    if (prev.r2 === next.r2 && prev.r3 === next.r3 && prev.asOf === next.asOf) changes.push({ key: `bedroomRatios.${key}`, encoded: prev.label, official: next.label, note: 'source text updated' });
    doc.bedroomRatios[key] = next;
    for (const k of rederiveCities(doc, key, r, next)) cities.add(k);
  }
  return { changes, ratios, cities: [...cities] };
}

/** Recompute the pooled ratio from the six member ratios (unrounded where this run fetched them). Mutates doc. */
export function applyPooled(doc, fresh = {}, { today = isoDate() } = {}) {
  const br = doc.bedroomRatios;
  const member = (k) => fresh[k] || (br[k] ? [br[k].r2, br[k].r3] : null);
  const ms = POOL_KEYS.map(member);
  if (ms.some((x) => !x)) throw new Error(`pooled ratio: missing member ${POOL_KEYS.filter((k, i) => !ms[i]).join(', ')}`);
  const pooled = [0, 1].map((i) => median(ms.map((m) => m[i])));
  const prev = br.pooled;
  const next = { ...prev, asOf: today.slice(0, 7), r2: round3(pooled[0]), r3: round3(pooled[1]) };
  if (!prev || (prev.r2 === next.r2 && prev.r3 === next.r3)) return { changed: false, pooled, changes: [], cities: [] };
  br.pooled = next;
  const cities = rederiveCities(doc, 'pooled', pooled, next);
  return {
    changed: true,
    pooled,
    cities,
    changes: [
      { key: 'bedroomRatios.pooled.r2', encoded: prev.r2, official: next.r2, unit: 'ratio', note: `median of ${POOL_KEYS.join(', ')}` },
      { key: 'bedroomRatios.pooled.r3', encoded: prev.r3, official: next.r3, unit: 'ratio', note: `median of ${POOL_KEYS.join(', ')}` },
    ],
  };
}

/** Singapore: pooled 2-bedroom ratio, then HDB's 4-room ÷ 3-room step. Mutates doc. */
export function applySg(doc, pooled2, hdb) {
  const prev = doc.bedroomRatios.SG;
  if (!prev) return { changes: [], cities: [] };
  const r = [pooled2, pooled2 * hdb.step];
  const next = { ...prev, ...sgEntry(pooled2, hdb), r2: round3(r[0]), r3: round3(r[1]) };
  if (same(next, prev)) return { changes: [], cities: [] };
  doc.bedroomRatios.SG = next;
  const changes = [];
  if (prev.r2 !== next.r2) changes.push({ key: 'bedroomRatios.SG.r2', encoded: prev.r2, official: next.r2, unit: 'ratio' });
  if (prev.r3 !== next.r3) changes.push({ key: 'bedroomRatios.SG.r3', encoded: prev.r3, official: next.r3, unit: 'ratio', note: `HDB ${hdb.quarter} 4-room ÷ 3-room ${hdb.step.toFixed(3)}` });
  if (prev.asOf !== next.asOf) changes.push({ key: 'bedroomRatios.SG.asOf', encoded: prev.asOf, official: next.asOf });
  return { changes, cities: rederiveCities(doc, 'SG', r, next) };
}

/** NSW source texts for a quarter. */
export function nswTexts(ed, weekly, bonds, cbd) {
  const name = `NSW Department of Communities and Justice, Rent and Sales Report, ${ed.month} quarter ${ed.year}: median weekly rent for new bonds, Sydney local government area (City of Sydney), flats and units`;
  const b = bonds && bonds.every((x) => x > 0) ? ` (${bonds.map(grp).join(' / ')} new bonds)` : '';
  const x = cbd && cbd.every((v) => v > 0) ? ` Cross-check, postcode 2000 (the CBD): ${cbd.map((v) => `$${grp(v)}`).join(' / ')}.` : '';
  const note = `New bonds lodged in the quarter, i.e. new leases. Flats and units: 1 bedroom $${grp(weekly[0])}, 2 bedrooms $${grp(weekly[1])}, 3 bedrooms $${grp(weekly[2])} a week${b}. Monthly = weekly × 52 ÷ 12.${x}`;
  return { name, note, label: `NSW new bonds, Sydney local government area, ${ed.month} quarter ${ed.year}` };
}
/** Sydney's official 1/2/3-bedroom rents and the AU-sydney ratio from an NSW quarter. Mutates doc. */
export function applyNsw(doc, ed, { weekly, bonds, cbd }) {
  const c = doc.cities.find((x) => x.key === NSW.city);
  if (!c) throw new Error(`${NSW.city} not in cities.json`);
  const t = nswTexts(ed, weekly, bonds, cbd);
  const monthly = weekly.map((w) => round2(w * WEEKS_PER_MONTH));
  const changes = [];
  [1, 2, 3].forEach((n, i) => {
    const lf = `rent${n}brCenterLocal`;
    const uf = `rent${n}brCenterUSD`;
    const src = c.sources[lf] || {};
    if (c[lf] !== monthly[i]) changes.push({ key: `${NSW.city}.${lf}`, encoded: c[lf], official: monthly[i], unit: c.currency, note: `$${weekly[i]} a week × 52 ÷ 12` });
    c[lf] = monthly[i];
    c[uf] = toUsdAt(monthly[i], c.fxPerUSD);
    c.sources[lf] = { ...src, name: t.name, asOf: ed.asOf, file: ed.url, ...(n === 1 ? { note: t.note } : {}) };
    const us = c.sources[uf];
    if (us) c.sources[uf] = { ...us, asOf: ed.asOf, ...(c.sources.fxPerUSD && c.sources.fxPerUSD.asOf ? { fxAsOf: c.sources.fxPerUSD.asOf } : {}) };
  });
  const fam = { sourceAsOf: ed.asOf, ratios: { [NSW.key]: { beds: weekly, entry: { label: t.label, name: t.name, asOf: ed.asOf, file: ed.url, note: t.note } } } };
  const res = applyFamily(doc, fam);
  return { changes: [...changes, ...res.changes], ratios: res.ratios, cities: [NSW.city, ...res.cities] };
}

// ---------------------------------------------------------------- manual quotes

/** Per-city staleness of the Numbeo-quoted 1-bedroom rents. */
export function quoteStaleness(doc, today, { cadenceDays = QUOTE_CADENCE_DAYS, graceDays = QUOTE_GRACE_DAYS } = {}) {
  const rows = [];
  for (const c of doc.cities) {
    for (const f of ['rent1brCenterLocal', 'rent1brOutsideLocal']) {
      const s = c.sources && c.sources[f];
      if (!s || s.class === 'official' || s.class === 'open' || c[f] == null) continue;
      const age = daysBetween(dayOf(s.asOf), today);
      const due = age == null ? null : cadenceDays + graceDays - age;
      rows.push({ key: c.key, name: c.name, field: f, value: c[f], currency: c.currency, asOf: s.asOf, url: s.url, class: s.class, ageDays: age, dueInDays: due, overdue: due != null && due < 0 });
    }
  }
  return rows;
}
export const QUOTE_CHECKLIST = Object.freeze([
  'Numbeo terms forbid automated collection and do not clear reuse (docs/LIVABILITY.md §4.1); the replacement plan and decision D6 are in §7. Until D6 is decided, re-read the figures by hand only.',
  'For each city below, open sources.rent1brCenterLocal.url and read "1 bedroom apartment in city centre" and "... outside of centre" (local currency).',
  'Update rent1brCenterLocal / rent1brOutsideLocal and set sources.*.asOf to the page month and retrieved to today; keep class "aggregator" and terms "numbeo-terms".',
  'Re-derive the 2- and 3-bedroom rents (1-bedroom × the city\'s ratio in bedroomRatios) and the USD fields: `node scripts/refresh/run.js --only rents --offline` reports them; `node scripts/update-col.js --dry-run` re-converts USD.',
  'Run `node --test test/juice.test.js test/juice-household.test.js test/refresh-col.test.js`, then set lastChecked of rents-1br-quoted in data/freshness.json.',
]);

// ---------------------------------------------------------------- the check

const FAMILY_MODE = 'auto';

async function fetchHud(ctx, doc) {
  const areas = [...new Set(doc.cities.map((c) => c.sources && c.sources.rent2brCenterLocal && c.sources.rent2brCenterLocal.ratioKey).filter((k) => k && k.startsWith('US:')))].map((k) => k.slice(3)).sort();
  const layer = await ctx.fetchJson(`${HUD.service}?f=json`);
  const { editDate, fy } = parseHudLayer(layer.json);
  const q = await ctx.fetchJson(hudQueryUrl(areas));
  const fam = parseHudAreas(q.json, areas, fy);
  const evidence = [
    { url: `${HUD.service}?f=json`, fetchedAt: layer.fetchedAt, excerpt: `Fair_Market_Rents layer, data last edited ${editDate} (FY${fy})` },
    { url: HUD.service, fetchedAt: q.fetchedAt, excerpt: excerpt(Object.entries(fam.ratios).slice(0, 4).map(([k, v]) => `${k.slice(3)}: ${v.beds.join('/')}`).join('; ')) },
  ];
  let notice = null;
  try {
    const fr = await ctx.fetchJson(HUD.fedreg);
    notice = parseFedRegFmr(fr.json);
    if (notice) evidence.push({ url: notice.url, fetchedAt: fr.fetchedAt, excerpt: `${notice.title} (Federal Register ${notice.number}, ${notice.date})` });
  } catch (err) {
    if (err && err.code === 'FIXTURE_MISSING') throw err;
    ctx.log(`Federal Register check failed: ${err.message}`);
  }
  const encodedFy = Math.max(0, ...Object.entries(doc.bedroomRatios).filter(([k]) => k.startsWith('US:')).map(([, e]) => Number((/FY(\d{4})/.exec(e.label || '') || [])[1]) || 0));
  fam.extra = { editDate, fy, encodedFy, notice, areas };
  // A newer fiscal year than the eGIS service carries: ask the HUD USER API when a token is configured.
  const token = ctx.env && ctx.env.HUD_API_TOKEN;
  if (notice && notice.fy > fy && token && !ctx.offline) {
    const ratios = {};
    for (const area of areas) {
      const code = fam.codes[area];
      if (!code) continue;
      try {
        const r = await ctx.fetchJson(`${HUD.api}${encodeURIComponent(code)}?year=${notice.fy}`, { headers: { authorization: `Bearer ${token}` } });
        const v = parseHudApi(r.json);
        if (v) ratios[`US:${area}`] = { beds: v.beds, entry: hudEntry(area, notice.fy, v.beds, `${HUD.api}${code}?year=${notice.fy}`) };
      } catch (err) { ctx.log(`HUD USER API ${code}: ${err.message}`); }
    }
    if (Object.keys(ratios).length === Object.keys(fam.ratios).length) {
      fam.ratios = ratios;
      fam.sourceAsOf = `${notice.fy - 1}-10`;
      fam.release = `FY${notice.fy} (HUD USER API)`;
      fam.extra.fy = notice.fy;
      evidence.push({ url: HUD.api, fetchedAt: ctx.today, excerpt: `HUD USER API FY${notice.fy}: ${Object.keys(ratios).length} areas` });
    } else evidence.push({ url: HUD.api, fetchedAt: ctx.today, excerpt: `HUD USER API returned ${Object.keys(ratios).length} of ${Object.keys(fam.ratios).length} areas for FY${notice.fy}; eGIS FY${fy} kept` });
  }
  fam.evidence = evidence;
  if (fam.missing.length) fam.warnings = [`HUD areas not in the eGIS answer: ${fam.missing.join('; ')}`];
  return fam;
}

async function fetchOns(ctx, doc) {
  const page = await ctx.fetchText(ONS.page);
  const eds = parseOnsEditions(page.text);
  if (!eds.length) throw new Error('ONS dataset page: no xlsx edition links found');
  const latest = eds[0];
  const encoded = Object.keys(ONS.areas).map((k) => onsEditionOf(doc.bedroomRatios[k] && doc.bedroomRatios[k].file)).filter(Boolean).sort().pop() || null;
  const evidence = [{ url: ONS.page, fetchedAt: page.fetchedAt, excerpt: `latest edition ${latest.date}: ${latest.url}; encoded edition ${encoded || '-'}` }];
  if (encoded && latest.date <= encoded) return { upToDate: true, sourceAsOf: doc.bedroomRatios['GB-london'] && doc.bedroomRatios['GB-london'].asOf, release: `edition ${encoded}`, ratios: {}, evidence };
  // A newer edition: read Table 1 of its xlsx (about 19 MB).
  try {
    const x = await ctx.fetchBuffer(latest.url);
    const book = readXlsx(x.buffer);
    const rows = book.rows('Table 1', { keep: keepRowsWith(new Set([...Object.values(ONS.areas), 'Area name', 'Time period'])) });
    const fam = parseOnsTable1(rows, { edition: latest.date, fileUrl: latest.url });
    fam.evidence = [...evidence, { url: latest.url, fetchedAt: x.fetchedAt, excerpt: excerpt(Object.entries(fam.ratios).map(([k, v]) => `${ONS.areas[k]} ${v.entry.asOf}: ${v.beds.join('/')}`).join('; ')) }];
    return fam;
  } catch (err) {
    if (err && err.code === 'FIXTURE_MISSING') return { newerUnread: latest, error: `the ${latest.date} edition is not in the offline fixtures`, evidence, ratios: {} };
    return { newerUnread: latest, error: err.message, evidence, ratios: {} };
  }
}

async function fetchCso(ctx) {
  let res;
  try { res = await ctx.fetchJson(CSO_QUERY_URL); } catch (err) {
    if (err && err.code === 'FIXTURE_MISSING') throw err;
    ctx.log(`CSO JSON-RPC query failed (${err.message}); reading the full RIQ02 cube`);
    res = await ctx.fetchJson(CSO.full);
  }
  if (res.json && res.json.error) throw new Error(`CSO PxStat error: ${JSON.stringify(res.json.error).slice(0, 200)}`);
  const fam = parseCsoRiq02(res.json);
  fam.evidence = [{ url: CSO.page, fetchedAt: res.fetchedAt, excerpt: `RIQ02 ${fam.release}, Dublin, all property types: ${fam.ratios.IE.beds.join(' / ')} (updated ${fam.updated || '-'})` }];
  return fam;
}

async function fetchZurich(ctx) {
  const res = await ctx.fetchText(ZURICH.csv);
  const fam = parseZurichCsv(res.text);
  fam.evidence = [{ url: ZURICH.csv, fetchedAt: res.fetchedAt, excerpt: `${fam.release}: 2/3/4 rooms ${fam.ratios.CH.beds.join(' / ')} (new private tenancies, whole city, median net rent)` }];
  return fam;
}

async function fetchOlap(ctx) {
  const ds = await ctx.fetchJson(OLAP.api);
  const files = parseOlapDataset(ds.json);
  if (!files.length) throw new Error('data.gouv.fr: no Base_OP_<year>_Nationale.csv resource');
  const latest = files[0];
  const csv = await ctx.fetchBuffer(latest.url);
  const fam = parseOlapCsv(csv.buffer.toString('latin1'), { year: latest.year, url: latest.url });
  fam.evidence = [
    { url: OLAP.api, fetchedAt: ds.fetchedAt, excerpt: `latest national file: loyers ${latest.year} (${latest.url}, modified ${latest.modified || '-'})` },
    { url: latest.url, fetchedAt: csv.fetchedAt, excerpt: `Paris intra-muros, moins de 1 an, 2P/3P/4P+ median ${fam.ratios.FR.beds.join(' / ')}` },
  ];
  return fam;
}

async function fetchStatcan(ctx) {
  const res = await ctx.fetchBuffer(STATCAN.zip);
  const fam = parseStatcanZip(res.buffer);
  fam.evidence = [{ url: STATCAN.zip, fetchedAt: res.fetchedAt, excerpt: excerpt(Object.entries(fam.ratios).map(([k, v]) => `${k} ${v.entry.asOf}: ${v.beds.join('/')}`).join('; ')) }];
  return fam;
}

async function fetchHdb(ctx) {
  const res = await ctx.fetchJson(HDB.api);
  const hdb = parseHdb(res.json);
  return { hdb, sourceAsOf: hdb.asOf, release: hdb.quarter, evidence: [{ url: HDB.page, fetchedAt: res.fetchedAt, excerpt: `HDB ${hdb.quarter}, Central Area: 3-room S$${hdb.r3m}, 4-room S$${hdb.r4m} (step ${hdb.step.toFixed(3)})` }] };
}

async function fetchNsw(ctx, doc) {
  const page = await ctx.fetchText(NSW.page);
  const eds = parseNswEditions(page.text);
  if (!eds.length) throw new Error('NSW Rent and Sales page: no rent-tables xlsx link found');
  const latest = eds[0];
  const c = doc.cities.find((x) => x.key === NSW.city);
  const encoded = nswEditionOf(c && c.sources && c.sources.rent1brCenterLocal && c.sources.rent1brCenterLocal.file) || (c && c.sources && c.sources.rent1brCenterLocal && c.sources.rent1brCenterLocal.asOf) || null;
  const evidence = [{ url: NSW.page, fetchedAt: page.fetchedAt, excerpt: `latest rent tables: ${latest.month} quarter ${latest.year} (${latest.url}); encoded ${encoded || '-'}` }];
  if (encoded && latest.asOf <= encoded) return { upToDate: true, ed: latest, sourceAsOf: encoded, evidence };
  try {
    const x = await ctx.fetchBuffer(latest.url);
    const book = readXlsx(x.buffer);
    const lga = parseNswLga(book.rows('LGA', { keep: keepRowsWith((t) => t === 'Sydney' || /^Local Government Area/.test(t)) }));
    let cbd = null;
    try { cbd = parseNswPostcode(book.rows('Postcode', { keep: (rowXml, strings) => /<c r="A\d+"[^>]*>\s*<v>2000<\/v>/.test(rowXml) || keepRowsWith(new Set(['Postcode']))(rowXml, strings) })); } catch { cbd = null; }
    lga.cbd = cbd;
    return { ed: latest, lga, sourceAsOf: latest.asOf, evidence: [...evidence, { url: latest.url, fetchedAt: x.fetchedAt, excerpt: `Sydney LGA, flats/units, median weekly rent for new bonds: ${lga.weekly.join(' / ')} (1/2/3 bedrooms)` }] };
  } catch (err) {
    if (err && err.code === 'FIXTURE_MISSING') return { newerUnread: latest, error: `the ${latest.month} ${latest.year} tables are not in the offline fixtures`, evidence };
    return { newerUnread: latest, error: err.message, evidence };
  }
}

const FAMILIES = [
  { id: 'rents-us-hud-fmr', fetch: fetchHud, label: 'HUD Fair Market Rents' },
  { id: 'rents-gb-ons', fetch: fetchOns, label: 'ONS Price Index of Private Rents' },
  { id: 'rents-ie-rtb', fetch: fetchCso, label: 'RTB / CSO RIQ02' },
  { id: 'rents-ch-zurich', fetch: fetchZurich, label: 'Stadt Zürich Mietpreiserhebung' },
  { id: 'rents-fr-olap', fetch: fetchOlap, label: 'OLAP (data.gouv.fr)' },
  { id: 'rents-ca-statcan', fetch: fetchStatcan, label: 'Statistics Canada 46-10-0092-01' },
];

const CHECKLISTS = {
  'rents-us-hud-fmr': [
    'HUD publishes the next fiscal year\'s Fair Market Rents in August/September (Federal Register notice), effective 1 October.',
    'Preferred: add a free HUD USER API token (huduser.gov > "HUD User API") as the repository secret HUD_API_TOKEN; the monthly refresh then reads the new year automatically.',
    'By hand: for each HUD area in bedroomRatios (keys "US:<area>"), read the 1-, 2- and 3-bedroom FMRs of the new fiscal year (huduser.gov FMR documentation system, or the eGIS service once HUD updates it), update the area\'s name/label/asOf ("<FY-1>-10") and r2 = 2BR/1BR, r3 = 3BR/1BR (3 decimals).',
    'Re-derive each US city\'s rent2brCenterLocal / rent3brCenterLocal = rent1brCenterLocal × ratio (round to cents) and the USD fields, then run `node --test test/juice.test.js test/juice-household.test.js test/refresh-col.test.js`.',
  ],
  'rents-gb-ons': [
    'Open the ONS dataset page and download the newest priceindexofprivaterentsukmonthlypricestatistics.xlsx.',
    'In Table 1, take the latest month\'s "Rental price one bed / two bed / three bed" for London, Cambridge, Oxford, Manchester and Scotland.',
    'Update bedroomRatios GB-* (label, name, asOf, file, note, r2, r3) and re-derive the five UK cities\' 2- and 3-bedroom rents; London also feeds the pooled ratio.',
  ],
  'rents-nsw-official': [
    'Open the NSW Rent and Sales Report page and download the newest "Rent tables <month> <year> quarter" xlsx.',
    'Sheet LGA, Local Government Area "Sydney", Dwelling Types flats/units: the median weekly rent for new bonds for 1, 2 and 3 bedrooms.',
    'Monthly = weekly × 52 ÷ 12: update Sydney\'s rent1/2/3brCenterLocal and their sources (name, asOf, file, note), bedroomRatios AU-sydney (Melbourne uses it; it also feeds the pooled ratio), then re-derive the USD fields and run the tests.',
  ],
};

function familyChecklist(id) {
  return CHECKLISTS[id] || [
    'Open the source named in the result, read the latest 1-, 2- and 3-bedroom figures, and update the matching bedroomRatios entry (label, name, asOf, r2, r3).',
    'Re-derive the 2- and 3-bedroom rents of the cities that cite it (sources.rent2brCenterLocal.ratioKey) and the USD fields; run the Juice tests.',
  ];
}

export async function check(ctx) {
  const results = [];
  let doc;
  try {
    doc = ctx.readJson('data/cities.json');
  } catch (err) {
    return MODULE.ids.map((id) => errorResult(id, id === 'rents-1br-quoted' ? 'manual' : 'auto', err));
  }
  const prev = structuredClone(doc);
  const work = structuredClone(doc);
  const fresh = {}; // unrounded member ratios fetched in this run
  let poolTouched = false;

  // 1. The official ratio families.
  for (const F of FAMILIES) {
    try {
      const fam = await F.fetch(ctx, work);
      const ev = fam.evidence || [];
      if (fam.newerUnread) {
        results.push(result(F.id, 'detect', 'drift', {
          summary: `${F.label}: a newer release is published (${fam.newerUnread.date || fam.newerUnread.asOf}) but could not be read automatically: ${fam.error}. Update by hand.`,
          sourceAsOf: dayOf(fam.newerUnread.date || fam.newerUnread.asOf),
          findings: [{ key: 'release', encoded: null, official: fam.newerUnread.date || fam.newerUnread.asOf, url: fam.newerUnread.url, note: fam.error }],
          evidence: ev,
          checklist: familyChecklist(F.id),
        }));
        continue;
      }
      if (fam.upToDate) {
        results.push(result(F.id, FAMILY_MODE, 'ok', { summary: `${F.label}: latest release (${fam.release}) already encoded`, sourceAsOf: dayOf(fam.sourceAsOf), evidence: ev }));
        continue;
      }
      const { problems, warnings } = validateFamily(work, fam, { today: ctx.today });
      if (fam.warnings) warnings.push(...fam.warnings);
      if (problems.length) {
        results.push(result(F.id, FAMILY_MODE, 'flag', { summary: `${F.label} ${fam.release}: failed validation, nothing written: ${problems.slice(0, 3).join('; ')}`, sourceAsOf: dayOf(fam.sourceAsOf), evidence: ev, findings: problems.map((p) => ({ key: 'validation', note: p })), checklist: familyChecklist(F.id) }));
        continue;
      }
      const res = applyFamily(work, fam);
      Object.assign(fresh, res.ratios);
      if (res.changes.length && POOL_KEYS.some((k) => res.changes.some((c) => c.key.startsWith(`bedroomRatios.${k}.`) || c.key === `bedroomRatios.${k}`))) poolTouched = true;
      const x = fam.extra;
      const newerFy = x && x.notice && x.notice.fy > x.fy;
      if (res.changes.length) {
        results.push(result(F.id, FAMILY_MODE, 'changed', {
          summary: `${F.label} ${fam.release}: ${res.changes.filter((c) => c.unit === 'ratio').length} ratio(s) changed, ${res.cities.length} cit${res.cities.length === 1 ? 'y' : 'ies'} re-derived${warnings.length ? `; ${warnings.join('; ')}` : ''}${newerFy ? `; FY${x.notice.fy} is published but not readable without HUD_API_TOKEN` : ''}`,
          sourceAsOf: dayOf(fam.sourceAsOf), findings: res.changes, evidence: ev,
        }));
      } else if (newerFy) {
        results.push(result(F.id, 'detect', 'drift', {
          summary: `HUD FY${x.notice.fy} Fair Market Rents are published (Federal Register ${x.notice.number}, ${x.notice.date}) but HUD's eGIS service still serves FY${x.fy} (data edited ${x.editDate}), which matches the encoded ratios; set HUD_API_TOKEN or update by hand`,
          sourceAsOf: dayOf(fam.sourceAsOf),
          findings: [{ key: 'HUD FMR fiscal year', encoded: `FY${x.encodedFy}`, official: `FY${x.notice.fy}`, url: x.notice.url, note: `${x.notice.title}; eGIS FY${x.fy} matches all ${Object.keys(fam.ratios).length} encoded areas` }],
          evidence: ev,
          checklist: familyChecklist(F.id),
        }));
      } else {
        results.push(result(F.id, FAMILY_MODE, 'ok', { summary: `${F.label} ${fam.release}: matches the ${Object.keys(fam.ratios).length} encoded ratio(s)${warnings.length ? `; ${warnings.join('; ')}` : ''}`, sourceAsOf: dayOf(fam.sourceAsOf), evidence: ev }));
      }
    } catch (err) {
      results.push(errorResult(F.id, FAMILY_MODE, err));
    }
  }

  // 2. Sydney (official, all three bedroom counts).
  try {
    const n = await fetchNsw(ctx, work);
    if (n.newerUnread) {
      results.push(result('rents-nsw-official', 'detect', 'drift', {
        summary: `NSW rent tables for the ${n.newerUnread.month} ${n.newerUnread.year} quarter are published (encoded: ${work.cities.find((c) => c.key === NSW.city).sources.rent1brCenterLocal.asOf}) but could not be read automatically: ${n.error}`,
        sourceAsOf: dayOf(n.newerUnread.asOf), evidence: n.evidence, checklist: CHECKLISTS['rents-nsw-official'],
        findings: [{ key: 'release', encoded: work.cities.find((c) => c.key === NSW.city).sources.rent1brCenterLocal.asOf, official: n.newerUnread.asOf, url: n.newerUnread.url, note: n.error }],
      }));
    } else if (n.upToDate) {
      results.push(result('rents-nsw-official', 'auto', 'ok', { summary: `NSW Rent and Sales Report: latest rent tables (${n.ed.month} quarter ${n.ed.year}) already encoded`, sourceAsOf: dayOf(n.sourceAsOf), evidence: n.evidence }));
    } else {
      const fam = { sourceAsOf: n.ed.asOf, ratios: { [NSW.key]: { beds: n.lga.weekly, entry: { asOf: n.ed.asOf } } } };
      const { problems } = validateFamily(work, fam, { today: ctx.today });
      const c = work.cities.find((x) => x.key === NSW.city);
      n.lga.weekly.forEach((w, i) => { const was = c[`rent${i + 1}brCenterLocal`]; const ch = relChange(was, w * WEEKS_PER_MONTH); if (ch != null && Math.abs(ch) > MAX_LEVEL_MOVE) problems.push(`${NSW.city}: ${i + 1}-bedroom rent ${was} -> ${round2(w * WEEKS_PER_MONTH)} moves ${(ch * 100).toFixed(1)}%`); });
      if (problems.length) {
        results.push(result('rents-nsw-official', 'auto', 'flag', { summary: `NSW ${n.ed.month} ${n.ed.year} quarter failed validation, nothing written: ${problems.slice(0, 3).join('; ')}`, sourceAsOf: dayOf(n.ed.asOf), evidence: n.evidence, findings: problems.map((p) => ({ key: 'validation', note: p })), checklist: CHECKLISTS['rents-nsw-official'] }));
      } else {
        const res = applyNsw(work, n.ed, n.lga);
        Object.assign(fresh, res.ratios);
        poolTouched = true;
        results.push(result('rents-nsw-official', 'auto', 'changed', { summary: `NSW ${n.ed.month} ${n.ed.year} quarter: Sydney's 1/2/3-bedroom rents and the AU-sydney ratio updated (${res.cities.length} cities)`, sourceAsOf: dayOf(n.ed.asOf), findings: res.changes, evidence: n.evidence }));
      }
    }
  } catch (err) {
    results.push(errorResult('rents-nsw-official', 'auto', err));
  }

  // 3. The pooled ratio (when a member changed), then Singapore's third-bedroom step (HDB).
  let pooledRes = { changed: false, changes: [], cities: [] };
  const poolProblems = [];
  try {
    if (poolTouched) {
      pooledRes = applyPooled(work, fresh, { today: ctx.today });
      for (const [i, f] of [[0, 'r2'], [1, 'r3']]) {
        const ch = relChange(prev.bedroomRatios.pooled[f], pooledRes.pooled[i]);
        if (ch != null && Math.abs(ch) > MAX_RATIO_MOVE) poolProblems.push(`pooled ${f} ${prev.bedroomRatios.pooled[f]} -> ${round3(pooledRes.pooled[i])} moves ${(ch * 100).toFixed(1)}%`);
      }
    }
  } catch (err) {
    poolProblems.push(err.message);
  }
  try {
    const h = await fetchHdb(ctx);
    const pooled2 = pooledRes.changed ? pooledRes.pooled[0] : work.bedroomRatios.pooled.r2;
    const sgPrev = work.bedroomRatios.SG;
    const step = h.hdb.step;
    const prevStep = sgPrev ? sgPrev.r3 / sgPrev.r2 : null;
    const ch = relChange(prevStep, step);
    if (inFuture(h.sourceAsOf, ctx.today) || (ch != null && Math.abs(ch) > MAX_RATIO_MOVE)) {
      results.push(result('rents-sg-hdb', 'auto', 'flag', { summary: `HDB ${h.hdb.quarter}: Central Area 4-room ÷ 3-room step ${step.toFixed(3)} (was ${prevStep && prevStep.toFixed(3)}) failed validation; nothing written`, sourceAsOf: dayOf(h.sourceAsOf), evidence: h.evidence, findings: [{ key: 'validation', encoded: prevStep && round3(prevStep), official: round3(step), note: `step moved more than ${MAX_RATIO_MOVE * 100}% or the quarter is in the future` }] }));
    } else {
      const res = applySg(work, pooled2, h.hdb);
      if (res.changes.length) {
        results.push(result('rents-sg-hdb', 'auto', 'changed', { summary: `HDB ${h.hdb.quarter}: Singapore ratios updated (step ${step.toFixed(3)}${pooledRes.changed ? ', new pooled 2-bedroom ratio' : ''})`, sourceAsOf: dayOf(h.sourceAsOf), findings: res.changes, evidence: h.evidence }));
      } else {
        results.push(result('rents-sg-hdb', 'auto', 'ok', { summary: `HDB ${h.hdb.quarter}: Central Area step ${step.toFixed(3)} matches the encoded Singapore ratio`, sourceAsOf: dayOf(h.sourceAsOf), evidence: h.evidence }));
      }
    }
  } catch (err) {
    results.push(errorResult('rents-sg-hdb', 'auto', err));
  }

  // 4. The table as a whole: pooled ratio + whole-document validation.
  const { problems, warnings } = validateRentDoc(work, prev, { today: ctx.today });
  const allProblems = [...poolProblems, ...problems];
  const after = formatDoc(work);
  const before = formatDoc(prev);
  const writes = after !== before && !allProblems.length ? [{ file: 'data/cities.json', content: after }] : [];
  if (allProblems.length && after !== before) {
    for (const r of results) {
      if (r.status !== 'changed') continue;
      r.status = 'flag';
      r.summary = `data/cities.json failed validation, nothing written: ${allProblems.slice(0, 3).join('; ')}. ${r.summary}`;
    }
  }
  for (const r of results) if (r.status === 'changed') r.writes = writes;
  const pooledEntry = work.bedroomRatios.pooled;
  if (allProblems.length && after !== before) {
    results.push(result('rents-bedroom-ratios', 'auto', 'flag', { summary: `refreshed bedroom rents failed validation: ${allProblems.slice(0, 3).join('; ')}`, sourceAsOf: dayOf(pooledEntry.asOf), findings: allProblems.map((p) => ({ key: 'validation', note: p })) }));
  } else if (pooledRes.changed) {
    results.push(result('rents-bedroom-ratios', 'auto', 'changed', { summary: `pooled ratio ${pooledEntry.r2} / ${pooledEntry.r3} (median of ${POOL_KEYS.join(', ')}); ${pooledRes.cities.length} cities re-derived${warnings.length ? `; ${warnings.length} warning(s)` : ''}`, sourceAsOf: dayOf(pooledEntry.asOf), findings: pooledRes.changes, writes }));
  } else {
    const n = Object.keys(work.bedroomRatios).filter((k) => k !== 'description').length;
    results.push(result('rents-bedroom-ratios', 'auto', 'ok', {
      summary: `${n} bedroom ratios; pooled ${pooledEntry.r2} / ${pooledEntry.r3} unchanged; the refreshed document passes validateDoc and the rent checks${warnings.length ? ` (${warnings.length} pre-existing warning(s): ${warnings.slice(0, 2).join('; ')})` : ''}`,
      sourceAsOf: dayOf(pooledEntry.asOf),
      findings: warnings.map((w) => ({ key: 'warning', note: w })),
    }));
  }

  // 5. The Numbeo-quoted 1-bedroom rents (manual).
  try {
    const rows = quoteStaleness(work, ctx.today);
    const overdue = rows.filter((r) => r.overdue).sort((a, b) => a.dueInDays - b.dueInDays);
    const oldest = rows.map((r) => r.asOf).sort()[0] || null;
    const cities = new Set(rows.map((r) => r.key));
    const lines = overdue.map((r) => `${r.name} (${r.key}): ${r.field} = ${r.value} ${r.currency}, page month ${r.asOf}, ${-r.dueInDays} day(s) past due: ${r.url}`);
    const base = { sourceAsOf: dayOf(oldest), findings: overdue.slice(0, 60).map((r) => ({ key: `${r.key}.${r.field}`, encoded: r.value, unit: r.currency, url: r.url, note: `page month ${r.asOf}, ${-r.dueInDays} day(s) past due` })), checklist: [...QUOTE_CHECKLIST, ...lines] };
    if (overdue.length) {
      const nCities = new Set(overdue.map((r) => r.key)).size;
      results.push(result('rents-1br-quoted', 'manual', 'stale', { ...base, summary: `${nCities} of ${cities.size} cities have a Numbeo-quoted 1-bedroom rent past due (page month + ${QUOTE_CADENCE_DAYS} + ${QUOTE_GRACE_DAYS} days; oldest ${oldest}); no automatic feed (terms)` }));
    } else {
      const next = rows.map((r) => r.dueInDays).filter((x) => x != null).sort((a, b) => a - b)[0];
      results.push(result('rents-1br-quoted', 'manual', 'ok', { ...base, checklist: QUOTE_CHECKLIST.slice(), summary: `${cities.size} cities with Numbeo-quoted 1-bedroom rents; none past due (next due in ${next} day(s), oldest page month ${oldest})` }));
    }
  } catch (err) {
    results.push(errorResult('rents-1br-quoted', 'manual', err));
  }

  // Keep MODULE.ids order.
  const order = new Map(MODULE.ids.map((id, i) => [id, i]));
  return results.sort((a, b) => order.get(a.id) - order.get(b.id));
}
