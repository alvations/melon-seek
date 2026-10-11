#!/usr/bin/env node
// Amazon and Meta pay filed with the US Department of Labor (docs/AMAZON_META.md,
// docs/process/amazon-meta-data.md).
//
// The Office of Foreign Labor Certification publishes, every quarter, the Labor Condition
// Applications (LCA: H-1B, H-1B1, E-3) and permanent labor certifications (PERM) it decided,
// with each employer's job title, worksite and offered wage. The files are US government
// works in the public domain (https://www.dol.gov/general/aboutdol/copyright). This script:
//   1. finds the latest LCA and PERM disclosure files on the OFLC performance page and
//      downloads them (--download; one request each, honest User-Agent);
//   2. streams each workbook (scripts/alt-data/xlsx.js) and keeps only the rows whose
//      employer is an Amazon or Meta entity (scripts/alt-data/employers.js), and only the
//      columns below: no names, e-mails or phone numbers of contacts, attorneys or preparers;
//   3. maps each job title to the site's role family and level (public/features/roles.js,
//      server/keywords.js) and each worksite to its canonical place (server/geo.js);
//   4. writes a small summary (counts and median annual offered wage by role family, level,
//      title and city) to data/alt/dol-amazon-meta.json.
//
//   node scripts/alt-data/dol-disclosure.js --download [--dir DIR]          # latest files from dol.gov
//   node scripts/alt-data/dol-disclosure.js --lca LCA.xlsx [--perm PERM.xlsx] # files already on disk
//   options: --out FILE (default data/alt/dol-amazon-meta.json), --rows FILE.csv (the kept rows,
//            for a workflow artifact; never committed), --print (summary to stdout), --fy N --q N
//
// These are wages employers filed for visa and green-card cases, not job postings: one row
// is one filing (it can cover several workers), the "offered wage" is the employer's stated
// range for that position, and only certified, full-time filings are used for pay.
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { openZip, firstSheet, eachRowXml, rowCells, cellAt, colLetters, sharedStrings, excelDate } from './xlsx.js';
import { matchEmployer, nearMiss, employerCandidate } from './employers.js';
import { roleFamily, readableTitle, displayLevel, levelLabel, FAMILY_LABELS, DISPLAY_LEVEL_ORDER } from '../../public/features/roles.js';
import { jobSeniority } from '../../server/keywords.js';
import { geocode } from '../../server/geo.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PERFORMANCE_PAGE = 'https://www.dol.gov/agencies/eta/foreign-labor/performance';
export const USER_AGENT = 'melon-seek/0.2 (+https://alvations.github.io/melon-seek/; open-source job-postings salary chart; US DOL disclosure files, one request per file)';
export const DEFAULT_OUT = path.join(ROOT, 'data', 'alt', 'dol-amazon-meta.json');

/**
 * The columns kept, by program, with the header names they go by (current layout first;
 * the FY2020+ layouts in the OFLC record-layout PDFs). Nothing else is read.
 */
export const FIELDS = Object.freeze({
  lca: {
    caseNumber: ['CASE_NUMBER'], status: ['CASE_STATUS'], received: ['RECEIVED_DATE'], decision: ['DECISION_DATE'],
    visa: ['VISA_CLASS'], title: ['JOB_TITLE'], soc: ['SOC_CODE'], socTitle: ['SOC_TITLE'], fullTime: ['FULL_TIME_POSITION'],
    begin: ['BEGIN_DATE'], workers: ['TOTAL_WORKER_POSITIONS'], employer: ['EMPLOYER_NAME'],
    city: ['WORKSITE_CITY'], state: ['WORKSITE_STATE'],
    wageFrom: ['WAGE_RATE_OF_PAY_FROM'], wageTo: ['WAGE_RATE_OF_PAY_TO'], wageUnit: ['WAGE_UNIT_OF_PAY'],
    pw: ['PREVAILING_WAGE'], pwUnit: ['PW_UNIT_OF_PAY'], pwLevel: ['PW_WAGE_LEVEL'],
  },
  perm: {
    caseNumber: ['CASE_NUMBER'], status: ['CASE_STATUS'], received: ['RECEIVED_DATE'], decision: ['DECISION_DATE'],
    title: ['JOB_TITLE'], soc: ['PWD_SOC_CODE'], socTitle: ['PWD_SOC_TITLE'], fullTime: ['OTHER_REQ_IS_FULLTIME_EMP'],
    employer: ['EMP_BUSINESS_NAME', 'EMPLOYER_NAME'],
    city: ['PRIMARY_WORKSITE_CITY', 'WORKSITE_CITY'], state: ['PRIMARY_WORKSITE_STATE', 'WORKSITE_STATE'],
    wageFrom: ['JOB_OPP_WAGE_FROM', 'WAGE_OFFER_FROM_9089'], wageTo: ['JOB_OPP_WAGE_TO', 'WAGE_OFFER_TO_9089'],
    wageUnit: ['JOB_OPP_WAGE_PER', 'WAGE_OFFER_UNIT_OF_PAY_9089'],
  },
});
const REQUIRED = ['status', 'title', 'employer', 'wageFrom', 'wageUnit'];

/** Certified outcomes used for pay (a denied or withdrawn filing is counted, not priced). */
export const PAY_STATUSES = Object.freeze({ lca: ['certified'], perm: ['certified', 'certified-expired'] });
/** Annual pay bounds for a usable offered wage (a typo such as "$15" a year is left out). */
export const WAGE_BOUNDS = Object.freeze({ min: 20000, max: 1500000 });
const FACTORS = { year: 1, month: 12, 'bi-weekly': 26, biweekly: 26, week: 52, hour: 2080 }; // as server/salary.js
const QUARTER_END = { 1: '12-31', 2: '03-31', 3: '06-30', 4: '09-30' };

const log = (msg) => process.stderr.write(`[dol] ${msg}\n`);

/* --------------------------------------------------------------- files */

/** Disclosure-file links on the OFLC performance page: [{ program, fy, q, url }], newest first. */
export function findDisclosureLinks(html, base = 'https://www.dol.gov') {
  const out = [];
  const seen = new Set();
  for (const m of String(html).matchAll(/href="([^"]*?\b(LCA|PERM)_Disclosure_Data_FY(\d{4})_Q(\d)\.xlsx)"/gi)) {
    const url = new URL(m[1].replace(/^(https?:\/\/[^/]+)\/{2,}/, '$1/'), base).href.replace(/([^:])\/{2,}/g, '$1/');
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ program: m[2].toLowerCase(), fy: Number(m[3]), q: Number(m[4]), url });
  }
  return out.sort((a, b) => b.fy - a.fy || b.q - a.q);
}

/** The reporting period of a fiscal-year-to-date file: FY2026 Q3 -> 2025-10-01 to 2026-06-30. */
export function reportingPeriod(fy, q) {
  if (!fy || !q || !QUARTER_END[q]) return null;
  return { from: `${fy - 1}-10-01`, to: `${q === 1 ? fy - 1 : fy}-${QUARTER_END[q]}` };
}

/** FY and quarter from a file name ("LCA_Disclosure_Data_FY2026_Q3.xlsx"). */
export function fileQuarter(name) {
  const m = /FY_?(\d{4})_Q(\d)/i.exec(String(name || ''));
  return m ? { fy: Number(m[1]), q: Number(m[2]) } : null;
}

async function get(url, { accept = '*/*', timeoutMs = 120000 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { headers: { 'user-agent': USER_AGENT, accept }, signal: ctrl.signal, redirect: 'follow' });
      if ((res.status === 429 || res.status >= 500) && attempt < 3) { await new Promise((r) => setTimeout(r, 5000 * (attempt + 1))); continue; }
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
      return { res, timer };
    } catch (err) {
      clearTimeout(timer);
      if (attempt >= 3 || /HTTP 4\d\d/.test(err.message)) throw err;
      await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
    }
  }
}

/** Download the newest LCA and PERM files into `dir`: { lca: { file, url, fy, q, bytes, lastModified }, perm }. */
export async function downloadLatest(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const { res, timer } = await get(PERFORMANCE_PAGE, { accept: 'text/html' });
  const html = await res.text();
  clearTimeout(timer);
  const links = findDisclosureLinks(html);
  const out = {};
  for (const program of ['lca', 'perm']) {
    const link = links.find((l) => l.program === program);
    if (!link) throw new Error(`no ${program.toUpperCase()} disclosure file linked from ${PERFORMANCE_PAGE}`);
    const file = path.join(dir, path.basename(new URL(link.url).pathname));
    const t0 = Date.now();
    const got = await get(link.url, { timeoutMs: 30 * 60 * 1000 });
    await pipeline(Readable.fromWeb(got.res.body), fs.createWriteStream(file));
    clearTimeout(got.timer);
    const bytes = fs.statSync(file).size;
    const head = Buffer.alloc(2);
    const fd = fs.openSync(file, 'r'); fs.readSync(fd, head, 0, 2, 0); fs.closeSync(fd);
    if (head.toString('latin1') !== 'PK') throw new Error(`${link.url} is not an xlsx (zip) file`);
    out[program] = { file, url: link.url, fy: link.fy, q: link.q, bytes, lastModified: got.res.headers.get('last-modified') };
    log(`downloaded ${link.url}: ${(bytes / 1048576).toFixed(1)} MB in ${Math.round((Date.now() - t0) / 1000)} s`);
  }
  return out;
}

/* ------------------------------------------------------------- extract */

function columnMap(names, program) {
  const idx = new Map(names.map((n, i) => [String(n || '').trim().toUpperCase(), i]));
  const cols = {};
  for (const [field, aliases] of Object.entries(FIELDS[program])) {
    const hit = aliases.find((a) => idx.has(a));
    if (hit != null) cols[field] = idx.get(hit);
  }
  const missing = REQUIRED.filter((f) => cols[f] == null);
  if (missing.length) throw new Error(`${program.toUpperCase()} file lacks ${missing.map((f) => FIELDS[program][f][0]).join(', ')} (header: ${names.slice(0, 12).join(', ')}, ...)`);
  return cols;
}

/** 'lca' or 'perm' from a header row. */
export function detectProgram(names) {
  const set = new Set(names.map((n) => String(n || '').trim().toUpperCase()));
  if (set.has('WAGE_RATE_OF_PAY_FROM') && set.has('EMPLOYER_NAME')) return 'lca';
  if (set.has('EMP_BUSINESS_NAME') || set.has('JOB_OPP_WAGE_FROM') || set.has('WAGE_OFFER_FROM_9089')) return 'perm';
  return null;
}

/**
 * Stream one disclosure workbook and return the Amazon and Meta rows (kept columns only).
 * @returns {Promise<{ program, columns: string[], rowsScanned, records: object[], nearMisses: Array<{ company, name, filings }> }>}
 */
export async function extractWorkbook(file, { program = null } = {}) {
  const t0 = Date.now();
  const zip = await openZip(file);
  const sheet = await firstSheet(zip);
  let headerXml = null;
  await eachRowXml(zip, sheet, (xml, stop) => { headerXml = xml; stop(); });
  if (!headerXml) throw new Error(`${file}: empty sheet`);
  const headerCells = rowCells(headerXml);
  const headerIdx = new Set([...headerCells.values()].filter((c) => c.t === 's').map((c) => Number(c.v)));
  // Pass 1: header names, and which shared strings could be an Amazon or Meta employer name.
  const pass1 = await sharedStrings(zip, { want: headerIdx, test: (s) => employerCandidate(s) });
  const width = Math.max(...headerCells.keys()) + 1;
  const names = Array.from({ length: width }, (_, i) => {
    const c = headerCells.get(i);
    return !c ? '' : c.t === 's' ? pass1.strings.get(Number(c.v)) || '' : c.v;
  });
  const prog = program || detectProgram(names);
  if (!prog) throw new Error(`${file}: not an LCA or PERM disclosure file (header: ${names.slice(0, 8).join(', ')}, ...)`);
  const cols = columnMap(names, prog);
  const keep = new Set(Object.values(cols));
  const empLetters = colLetters(cols.employer);
  // Pass 2: rows whose employer cell is a candidate; only the kept columns are parsed.
  const raw = [];
  const want = new Set();
  let rowsScanned = 0;
  let first = true;
  await eachRowXml(zip, sheet, (xml) => {
    if (first) { first = false; return; }
    rowsScanned++;
    const emp = cellAt(xml, empLetters);
    if (!emp) return;
    const candidate = emp.t === 's' ? pass1.matches.has(Number(emp.v)) : employerCandidate(emp.v);
    if (!candidate) return;
    const cells = rowCells(xml, keep);
    for (const c of cells.values()) if (c.t === 's') want.add(Number(c.v));
    raw.push(cells);
  });
  // Pass 3: resolve the shared strings those rows use.
  const pass3 = await sharedStrings(zip, { want });
  const value = (c) => (!c ? null : c.t === 's' ? pass3.strings.get(Number(c.v)) ?? null : c.v);
  const records = [];
  const misses = new Map();
  for (const cells of raw) {
    const rec = { program: prog };
    for (const [field, col] of Object.entries(cols)) rec[field] = value(cells.get(col));
    const hit = matchEmployer(rec.employer);
    if (hit) records.push({ ...rec, company: hit.company, entity: hit.entity });
    else {
      const company = nearMiss(rec.employer);
      if (company) {
        const key = `${company}\u0000${String(rec.employer).trim()}`;
        misses.set(key, (misses.get(key) || 0) + 1);
      }
    }
  }
  const nearMisses = [...misses].map(([k, filings]) => { const [company, name] = k.split('\u0000'); return { company, name, filings }; })
    .sort((a, b) => b.filings - a.filings || a.name.localeCompare(b.name));
  log(`${path.basename(file)}: ${prog.toUpperCase()}, ${rowsScanned} rows scanned, ${records.length} Amazon/Meta rows, ${nearMisses.length} near-miss names, ${Math.round((Date.now() - t0) / 1000)} s`);
  return { program: prog, columns: names, rowsScanned, records, nearMisses };
}

/* ------------------------------------------------------------- mapping */

const num = (v) => {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
};

/** Annual amount for a wage and its unit ("Hour", "Bi-Weekly", "Year"); null when unknown. */
export function annualize(amount, unit) {
  const n = num(amount);
  const f = FACTORS[String(unit || '').trim().toLowerCase().replace(/\s+/g, '')];
  return n == null || !f ? null : Math.round(n * f);
}

const date = (v) => {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (Number.isFinite(n)) return excelDate(n);
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
};

const ACRONYM = new Set(['II', 'III', 'IV', 'VI', 'VII', 'AWS', 'AI', 'ML', 'SDE', 'SDET', 'IT', 'UX', 'UI', 'QA', 'HR', 'VP', 'US', 'BI', 'TPM', 'PM', 'GPU', 'SOC', 'ASIC', 'RF', 'AR', 'VR', 'XR', 'EC2', 'S3', 'L4', 'L5', 'L6', 'L7', 'NLP', 'LLM', 'SRE']);
/** "SOFTWARE DEVELOPMENT ENGINEER II" -> "Software Development Engineer II" (mixed case is kept). */
export function displayTitle(title) {
  const t = String(title || '').replace(/\s+/g, ' ').trim();
  if (/[a-z]/.test(t)) return readableTitle(t);
  return readableTitle(t.replace(/[A-Z0-9][A-Z0-9'.]*/g, (w) => (ACRONYM.has(w) || /\d/.test(w) && w.length <= 3 ? w : w[0] + w.slice(1).toLowerCase())));
}

const titleKey = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** "SEATTLE" + "WA" -> "Seattle, WA" (server/geo.js), else the words title-cased. */
export function placeName(city, state) {
  const c = String(city || '').replace(/\s+/g, ' ').trim();
  const s = String(state || '').trim();
  if (!c) return s || null;
  const [g] = geocode(s ? `${c}, ${s}` : c);
  if (g && g.city && g.country === 'US') return g.name;
  const tc = c.toLowerCase().replace(/\b[a-z]/g, (m) => m.toUpperCase());
  return s ? `${tc}, ${s.toUpperCase()}` : tc;
}

/** One kept row -> the observation the summary is built from. */
export function observe(rec) {
  const program = rec.program;
  const title = displayTitle(rec.title);
  const level = jobSeniority({ title, company: rec.company });
  const wageFrom = annualize(rec.wageFrom, rec.wageUnit);
  const wageTo = annualize(rec.wageTo, rec.wageUnit);
  const wage = wageFrom == null ? null : wageTo != null && wageTo > wageFrom ? Math.round((wageFrom + wageTo) / 2) : wageFrom;
  const status = String(rec.status || '').trim().toLowerCase();
  const fullTime = rec.fullTime == null ? null : /^(y|yes|1|true)$/i.test(String(rec.fullTime).trim());
  const priced = PAY_STATUSES[program].includes(status) && fullTime !== false && wage != null && wage >= WAGE_BOUNDS.min && wage <= WAGE_BOUNDS.max;
  return {
    program, company: rec.company, entity: rec.entity, status, visa: rec.visa || null,
    title, family: roleFamily(title, { department: rec.socTitle || null }) || 'other',
    level: displayLevel({ seniority: level.level, seniorityBasis: level.basis }),
    soc: rec.soc || null, socTitle: rec.socTitle || null,
    city: placeName(rec.city, rec.state), state: rec.state ? String(rec.state).trim().toUpperCase() : null,
    fullTime, workers: num(rec.workers), wageFrom, wageTo, wage, priced,
    pwLevel: rec.pwLevel ? String(rec.pwLevel).trim().toUpperCase() : null,
    prevailing: annualize(rec.pw, rec.pwUnit),
    received: date(rec.received), decision: date(rec.decision),
  };
}

/* ------------------------------------------------------------- summary */

/** Quantile (linear between closest ranks) of sorted numbers. */
export function quantile(sorted, p) {
  if (!sorted.length) return null;
  const at = (sorted.length - 1) * p;
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
}

const round100 = (n) => (n == null ? null : Math.round(n / 100) * 100);
const PW_LEVELS = ['I', 'II', 'III', 'IV'];

/** { n, p25, median, p75 } of annual wages, rounded to $100. */
export function wageStats(values) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  return { n: v.length, p25: round100(quantile(v, 0.25)), median: round100(quantile(v, 0.5)), p75: round100(quantile(v, 0.75)) };
}

function groupStats(obs, keyOf, { min = 1, limit = Infinity, extra = null } = {}) {
  const groups = new Map();
  for (const o of obs) {
    const k = keyOf(o);
    if (k == null) continue;
    let g = groups.get(k);
    if (!g) groups.set(k, (g = []));
    g.push(o);
  }
  return [...groups].map(([key, list]) => ({ key, ...(extra ? extra(list) : {}), ...wageStats(list.map((o) => o.wage)) }))
    .filter((g) => g.n >= min).sort((a, b) => b.n - a.n || String(a.key).localeCompare(String(b.key))).slice(0, limit);
}

const mostCommon = (list, f) => {
  const c = new Map();
  for (const o of list) c.set(f(o), (c.get(f(o)) || 0) + 1);
  return [...c].sort((a, b) => b[1] - a[1])[0][0];
};

/** The per-program block of one company. */
export function programSummary(obs, { titleLimit = 40, cityLimit = 30, minGroup = 3 } = {}) {
  const priced = obs.filter((o) => o.priced);
  const status = {};
  for (const o of obs) status[o.status || 'unknown'] = (status[o.status || 'unknown'] || 0) + 1;
  const order = (list, ids) => list.sort((a, b) => ids.indexOf(a.key) - ids.indexOf(b.key));
  const families = Object.keys(FAMILY_LABELS).concat('other');
  return {
    filings: obs.length,
    byStatus: status,
    workerPositions: obs.reduce((s, o) => s + (o.workers || 0), 0) || null,
    priced: priced.length,
    decisions: obs.length ? { first: obs.map((o) => o.decision).filter(Boolean).sort()[0] || null, last: obs.map((o) => o.decision).filter(Boolean).sort().at(-1) || null } : null,
    wage: wageStats(priced.map((o) => o.wage)),
    wageFrom: wageStats(priced.map((o) => o.wageFrom)),
    byFamily: order(groupStats(priced, (o) => o.family), families).map(({ key, ...s }) => ({ family: key, label: FAMILY_LABELS[key] || 'Other', ...s })),
    byLevel: order(groupStats(priced, (o) => o.level), DISPLAY_LEVEL_ORDER).map(({ key, ...s }) => ({ level: key, label: levelLabel(key), ...s })),
    byPrevailingWageLevel: order(groupStats(priced.filter((o) => PW_LEVELS.includes(o.pwLevel)), (o) => o.pwLevel), PW_LEVELS)
      .map(({ key, ...s }) => ({ pwLevel: key, ...s })),
    byTitle: groupStats(priced, (o) => titleKey(o.title), { min: minGroup, limit: titleLimit, extra: (list) => ({ title: mostCommon(list, (o) => o.title), family: mostCommon(list, (o) => o.family), level: mostCommon(list, (o) => o.level) }) })
      .map(({ key, ...s }) => s),
    byCity: groupStats(priced.filter((o) => o.city), (o) => o.city, { min: minGroup, limit: cityLimit }).map(({ key, ...s }) => ({ city: key, ...s })),
  };
}

/**
 * The committed summary: per company, the entities matched, and per program the counts and
 * median offered wages. `sources` describes each file read.
 */
export function summarize(observations, { sources = [], nearMisses = [], generatedAt = new Date().toISOString(), ...opts } = {}) {
  const companies = {};
  for (const company of ['amazon', 'meta']) {
    const mine = observations.filter((o) => o.company === company);
    const entities = new Map();
    for (const o of mine) {
      const e = entities.get(o.entity) || { entity: o.entity, lca: 0, perm: 0 };
      e[o.program]++;
      entities.set(o.entity, e);
    }
    const block = { entities: [...entities.values()].sort((a, b) => b.lca + b.perm - (a.lca + a.perm) || a.entity.localeCompare(b.entity)) };
    for (const program of ['lca', 'perm']) {
      const obs = mine.filter((o) => o.program === program);
      if (obs.length || sources.some((s) => s.program === program)) block[program] = programSummary(obs, opts);
    }
    companies[company] = block;
  }
  return {
    schema: 1,
    title: 'Pay filed with the US Department of Labor: Amazon and Meta',
    generatedAt,
    notes: [
      'Not job postings. Each row is an employer filing with the US Department of Labor: a Labor Condition Application (LCA: H-1B, H-1B1, E-3) or a permanent labor certification (PERM). One filing can cover several workers.',
      'Wages are the employer\'s offered wage for that position, made annual (hour x 2080, week x 52, bi-weekly x 26, month x 12). "wage" is the middle of the stated range (or its lower end when only one figure is given); "wageFrom" is the lower end.',
      `Only certified, full-time filings with an annual wage between $${WAGE_BOUNDS.min.toLocaleString('en-US')} and $${WAGE_BOUNDS.max.toLocaleString('en-US')} are priced. Medians and quartiles are rounded to $100; groups smaller than ${opts.minGroup || 3} filings are left out of the title and city lists.`,
      'Role family and level come from the job title with the site\'s own rules (public/features/roles.js, server/keywords.js). "Prevailing wage level" (I-IV) is the Department of Labor\'s wage level for the occupation and area, not the company\'s level.',
      'Source: US Department of Labor, Office of Foreign Labor Certification disclosure data (public domain, https://www.dol.gov/general/aboutdol/copyright). Contact, attorney and preparer columns are never read.',
    ],
    sources,
    companies,
    nearMisses: nearMisses.slice(0, 60),
  };
}

/* ----------------------------------------------------------------- csv */

const CSV_COLS = ['program', 'company', 'entity', 'status', 'visa', 'title', 'family', 'level', 'soc', 'socTitle', 'city', 'state', 'fullTime', 'workers', 'wageFrom', 'wageTo', 'wage', 'priced', 'pwLevel', 'prevailing', 'received', 'decision'];
const csvCell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function toCsv(observations) {
  return `${CSV_COLS.join(',')}\n${observations.map((o) => CSV_COLS.map((c) => csvCell(o[c])).join(',')).join('\n')}\n`;
}

/* ----------------------------------------------------------------- cli */

export async function main(argv = process.argv.slice(2)) {
  const opt = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : null; };
  const has = (name) => argv.includes(`--${name}`);
  const files = [];
  if (has('download')) {
    const dir = opt('dir') || fs.mkdtempSync(path.join(process.env.RUNNER_TEMP || process.env.TMPDIR || '/tmp', 'dol-'));
    const got = await downloadLatest(dir);
    for (const program of ['lca', 'perm']) files.push({ program, ...got[program] });
  }
  for (const program of ['lca', 'perm']) {
    const f = opt(program);
    if (f) files.push({ program, file: f, ...(fileQuarter(f) || {}), bytes: fs.statSync(f).size });
  }
  if (!files.length) {
    process.stderr.write('usage: dol-disclosure.js --download [--dir DIR] | --lca FILE [--perm FILE] [--out FILE] [--rows FILE.csv] [--print]\n');
    return 2;
  }
  const observations = [];
  const sources = [];
  const nearMisses = [];
  for (const f of files) {
    const fy = Number(opt('fy')) || f.fy || null;
    const q = Number(opt('q')) || f.q || null;
    const got = await extractWorkbook(f.file, { program: f.program });
    const obs = got.records.map(observe);
    observations.push(...obs);
    nearMisses.push(...got.nearMisses.map((n) => ({ program: got.program, ...n })));
    sources.push({
      program: got.program, file: path.basename(f.file), url: f.url || null, fiscalYear: fy, quarter: q,
      reportingPeriod: reportingPeriod(fy, q), lastModified: f.lastModified || null, bytes: f.bytes || null,
      rowsScanned: got.rowsScanned, amazonMetaRows: got.records.length,
    });
  }
  const summary = summarize(observations, { sources, nearMisses: nearMisses.sort((a, b) => b.filings - a.filings) });
  const out = opt('out') || DEFAULT_OUT;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(summary, null, 2)}\n`);
  log(`wrote ${out} (${fs.statSync(out).size} bytes)`);
  const rows = opt('rows');
  if (rows) { fs.writeFileSync(rows, toCsv(observations)); log(`wrote ${rows} (${observations.length} rows)`); }
  if (has('print')) process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  for (const c of ['amazon', 'meta']) {
    for (const p of ['lca', 'perm']) {
      const b = summary.companies[c][p];
      if (b) log(`${c} ${p}: ${b.filings} filings, ${b.priced} priced, median $${b.wage.median ?? '-'}`);
    }
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => { process.exitCode = code; }, (err) => { process.stderr.write(`[dol] ${err.stack || err.message}\n`); process.exitCode = 1; });
}
