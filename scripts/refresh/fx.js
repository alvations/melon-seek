// Updater: exchange rates, local currency units per USD (registry id `fx-per-usd`).
//
// One table, several copies, all rewritten together so they never drift
// (test/fx-consistency.test.js checks the code copies agree):
//   data/cities.json        fx.perUSD + every city's fxPerUSD, and the USD rent fields
//                           re-derived from the quoted local rents (same rule as
//                           scripts/update-col.js: USD = round(local ÷ fxPerUSD))
//   server/juice.js         FX_PER_USD + FX_AS_OF (Juice Score conversions)
//   public/viz/palette.js   FX_PER_USD + FX_AS_OF (chart, Compstimate, market comps "approx USD")
//   server/salary.js        FX_PER_USD + EXTRA_FX_PER_USD (vetting plausibility bounds only)
//   public/features/shared.js  FX_FALLBACK.CNY (USD per CNY)
//
// Sources (all official; monthly averages of the latest complete month):
//   ECB reference rates, monthly averages (EXR M.<cur>.EUR.SP00.A), crossed through USD:
//       perUSD[c] = (c per EUR) / (USD per EUR); EUR = 1 / (USD per EUR)
//   Taiwan dollar: Federal Reserve G.5 monthly average, via FRED series EXTAUS
//       (fallback: the G.5 release page itself)
//   AED, SAR, QAR: the official US-dollar pegs (CBUAE 3.6725, SAMA 3.75, QCB 3.64)
//   Fallback when the monthly ECB series is unreachable: the ECB daily reference rates.
// Before 2026-10 this table was The Economist's Big Mac "dollar_ex" column, refreshed
// only when the Big Mac data was (twice a year), and the code copies by hand.
//
// Mode 'auto'. Validation (validateFx): every currency in use is present and positive; no
// rate moves more than 20% against the encoded one (that is a 'flag': a human checks it;
// nothing is written); > 10% is reported as a warning; pegs stay within 0.5% of the peg;
// the period is not older than the encoded one, and not in the future.
import { result, errorResult, excerpt, relChange, isoDate } from './lib.js';
import { formatDoc, RENT_PAIRS, toUsdAt } from '../update-col.js';

export const MODULE = Object.freeze({ name: 'fx', ids: ['fx-per-usd'] });

/** ECB currencies we need (everything in the tables except the pegs, TWD, EUR and USD). */
export const ECB_CURRENCIES = Object.freeze(['AUD', 'BRL', 'CAD', 'CHF', 'CNY', 'CZK', 'DKK', 'GBP', 'HKD', 'ILS', 'INR', 'JPY', 'KRW', 'MXN', 'NOK', 'NZD', 'PLN', 'RON', 'SEK', 'SGD', 'USD', 'ZAR']);
export const ECB_MONTHLY_URL = `https://data-api.ecb.europa.eu/service/data/EXR/M.${ECB_CURRENCIES.join('+')}.EUR.SP00.A?lastNObservations=3&format=csvdata`;
export const ECB_DAILY_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';
export const ECB_INFO_URL = 'https://data.ecb.europa.eu/data/datasets/EXR';
export const FRED_TWD_URL = 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=EXTAUS';
export const FED_G5_URL = 'https://www.federalreserve.gov/releases/g5/current/default.htm';
export const PEGS = Object.freeze({
  AED: Object.freeze({ perUSD: 3.6725, name: 'Central Bank of the UAE: dirham pegged at 3.6725 per US dollar (since 1997)', url: 'https://www.centralbank.ae/en/' }),
  SAR: Object.freeze({ perUSD: 3.75, name: 'Saudi Central Bank (SAMA): riyal pegged at 3.75 per US dollar (since 1986)', url: 'https://www.sama.gov.sa/en-US/Pages/default.aspx' }),
  QAR: Object.freeze({ perUSD: 3.64, name: 'Qatar Central Bank: riyal pegged at 3.64 per US dollar (since 2001)', url: 'https://www.qcb.gov.qa/en/' }),
});
export const MAX_MOVE = 0.2;
export const WARN_MOVE = 0.1;
/** Code copies of the table: file, the table constant, and an optional as-of constant. */
export const FX_CODE_COPIES = Object.freeze([
  // source: the label the product cites for the table (computeJuice inputs.fx.source); rewritten
  // with the table when the constant exists, equal to data/cities.json fx.source.name.
  Object.freeze({ file: 'server/juice.js', table: 'FX_PER_USD', asOf: 'FX_AS_OF', source: 'FX_SOURCE' }),
  Object.freeze({ file: 'public/viz/palette.js', table: 'FX_PER_USD', asOf: 'FX_AS_OF', source: 'FX_SOURCE' }),
  Object.freeze({ file: 'server/salary.js', table: 'FX_PER_USD', extra: 'EXTRA_FX_PER_USD' }),
]);
export const SHARED_FALLBACK_FILE = 'public/features/shared.js';

const sig = (x, n = 6) => Number(Number(x).toPrecision(n));
const lastDayOfMonth = (period) => { const [y, m] = period.split('-').map(Number); return isoDate(new Date(Date.UTC(y, m, 0))); };

// ---------------------------------------------------------------- parsers

/** ECB SDMX CSV -> { [currency]: { period: 'YYYY-MM', perEUR } } for each currency's latest period. */
export function parseEcbMonthlyCsv(text) {
  const lines = String(text).trim().split(/\r?\n/);
  const head = lines[0].split(',');
  const iCur = head.indexOf('CURRENCY');
  const iDen = head.indexOf('CURRENCY_DENOM');
  const iPer = head.indexOf('TIME_PERIOD');
  const iVal = head.indexOf('OBS_VALUE');
  const iFreq = head.indexOf('FREQ');
  if ([iCur, iPer, iVal].some((i) => i < 0)) throw new Error('ECB CSV: missing CURRENCY / TIME_PERIOD / OBS_VALUE columns');
  const out = {};
  for (const line of lines.slice(1)) {
    const f = line.split(',');
    if (iFreq >= 0 && f[iFreq] !== 'M') continue;
    if (iDen >= 0 && f[iDen] !== 'EUR') continue;
    const cur = f[iCur];
    const period = f[iPer];
    const v = Number(f[iVal]);
    if (!/^\d{4}-\d{2}$/.test(period) || !(v > 0)) continue;
    if (!out[cur] || period > out[cur].period) out[cur] = { period, perEUR: v };
  }
  return out;
}

/** ECB eurofxref-daily.xml -> { date, perEUR: { [currency]: rate } }. */
export function parseEcbDailyXml(xml) {
  const date = (/time=['"](\d{4}-\d{2}-\d{2})['"]/.exec(xml) || [])[1] || null;
  const perEUR = {};
  for (const m of String(xml).matchAll(/currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]/g)) perEUR[m[1]] = Number(m[2]);
  if (!date || !perEUR.USD) throw new Error('ECB daily XML: no date or no USD rate');
  return { date, perEUR };
}

/** FRED fredgraph CSV (observation_date,SERIES) -> { period: 'YYYY-MM', value } (latest). */
export function parseFredCsv(text) {
  const rows = String(text).trim().split(/\r?\n/).slice(1).map((l) => l.split(',')).filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r[0]) && Number(r[1]) > 0);
  if (!rows.length) throw new Error('FRED CSV: no observations');
  const [d, v] = rows[rows.length - 1];
  return { period: d.slice(0, 7), value: Number(v) };
}

const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
/** Fed G.5 release page (HTML lines) -> { period, value } for a country row ('TAIWAN'). */
export function parseFedG5(lines, country = 'TAIWAN') {
  const head = lines.find((l) => /average rates of exchange in ([A-Z]+) (\d{4})/i.test(l));
  const m = head && /average rates of exchange in ([A-Z]+) (\d{4})/i.exec(head);
  if (!m) throw new Error('G.5: no "average rates of exchange in <MONTH> <YEAR>" line');
  const month = MONTHS.indexOf(m[1].toUpperCase()) + 1;
  const i = lines.findIndex((l) => l.replace(/[*|\s]/g, '') === country);
  if (i < 0 || month < 1) throw new Error(`G.5: no ${country} row`);
  const num = lines.slice(i + 1, i + 5).map((l) => Number(l.replace(/[|\s]/g, ''))).find((x) => x > 0);
  if (!num) throw new Error(`G.5: no rate after ${country}`);
  return { period: `${m[2]}-${String(month).padStart(2, '0')}`, value: num };
}

// ---------------------------------------------------------------- table building

/** EUR-based rates -> USD-based perUSD table (USD = 1, EUR = 1 / USD per EUR). */
export function crossToUsd(perEUR, currencies) {
  const usd = perEUR.USD;
  if (!(usd > 0)) throw new Error('no USD per EUR rate');
  const out = { USD: 1, EUR: sig(1 / usd) };
  for (const c of currencies) {
    if (c === 'USD' || c === 'EUR') continue;
    if (perEUR[c] > 0) out[c] = sig(perEUR[c] / usd);
  }
  return out;
}

/**
 * Assemble the new table from fetched parts.
 * parts: { ecb: { period, perEUR } | null, ecbDaily: { date, perEUR } | null, twd: { period, value } | null }
 * -> { perUSD, period, asOf, basis: 'monthly'|'daily', missing: [], notes: [] }
 */
export function buildTable(parts, needed) {
  const notes = [];
  let perUSD;
  let period;
  let asOf;
  let basis;
  if (parts.ecb) {
    period = parts.ecb.period;
    asOf = lastDayOfMonth(period);
    perUSD = crossToUsd(parts.ecb.perEUR, needed);
    basis = 'monthly';
  } else if (parts.ecbDaily) {
    asOf = parts.ecbDaily.date;
    period = asOf.slice(0, 7);
    perUSD = crossToUsd(parts.ecbDaily.perEUR, needed);
    basis = 'daily';
    notes.push(`ECB monthly averages unavailable; used the daily reference rates of ${asOf}`);
  } else throw new Error('no ECB rates');
  for (const [c, p] of Object.entries(PEGS)) perUSD[c] = p.perUSD;
  if (parts.twd) {
    perUSD.TWD = sig(parts.twd.value);
    if (parts.twd.period !== period) notes.push(`TWD is the ${parts.twd.period} average (others ${period})`);
  }
  const missing = needed.filter((c) => !(perUSD[c] > 0));
  return { perUSD: Object.fromEntries(Object.entries(perUSD).sort(([a], [b]) => a.localeCompare(b))), period, asOf, basis, missing, notes };
}

/** { problems, warnings, moves: [{ currency, encoded, official, change }] } */
export function validateFx(prev, next, { needed = Object.keys(prev), today = isoDate(), prevAsOf = null, asOf = null } = {}) {
  const problems = [];
  const warnings = [];
  const moves = [];
  for (const c of needed) {
    const v = next[c];
    if (!(Number.isFinite(v) && v > 0)) { problems.push(`${c}: no rate`); continue; }
    const ch = relChange(prev[c], v);
    moves.push({ currency: c, encoded: prev[c] ?? null, official: v, change: ch });
    if (ch != null && Math.abs(ch) > MAX_MOVE) problems.push(`${c} moved ${(ch * 100).toFixed(1)}% (${prev[c]} -> ${v}); more than ${MAX_MOVE * 100}% needs a human check`);
    else if (ch != null && Math.abs(ch) > WARN_MOVE) warnings.push(`${c} moved ${(ch * 100).toFixed(1)}%`);
  }
  for (const [c, p] of Object.entries(PEGS)) if (next[c] != null && Math.abs(next[c] / p.perUSD - 1) > 0.005) problems.push(`${c} ${next[c]} is off its ${p.perUSD} peg`);
  if (next.USD !== 1) problems.push('USD must be 1');
  if (asOf && asOf > today) problems.push(`as-of ${asOf} is in the future`);
  if (asOf && prevAsOf && asOf < prevAsOf) problems.push(`as-of ${asOf} is older than the encoded ${prevAsOf}`);
  return { problems, warnings, moves };
}

// ---------------------------------------------------------------- rewriting the copies

function formatTableBody(entries, indent = '  ') {
  return entries.map(([c, v]) => `${indent}${c}: ${v},`).join('\n');
}

/**
 * Rewrite `const NAME = Object.freeze({ ... })` in JS source with new values for the keys it
 * already has (keys are never added or dropped; a key with no new value keeps its old one).
 * Handles both the multi-line form and the one-line `{ A: 1, B: 2 }` form.
 * -> { src, changed: [{ key, encoded, official }], kept: [keys without a new value], found }
 */
export function rewriteTable(src, name, values) {
  const re = new RegExp(`((?:export\\s+)?const\\s+${name}\\s*=\\s*Object\\.freeze\\(\\{)([\\s\\S]*?)(\\}\\))`);
  const m = re.exec(src);
  if (!m) return { src, changed: [], kept: [], found: false };
  const body = m[2];
  const pairs = [...body.matchAll(/([A-Z]{3})\s*:\s*([\d.]+(?:e-?\d+)?)/g)].map((x) => [x[1], Number(x[2])]);
  const changed = [];
  const kept = [];
  const next = pairs.map(([k, v]) => {
    const nv = values[k];
    if (!(nv > 0)) { kept.push(k); return [k, v]; }
    if (nv !== v) changed.push({ key: `${name}.${k}`, encoded: v, official: nv });
    return [k, nv];
  });
  const multiline = body.includes('\n');
  const newBody = multiline ? `\n${formatTableBody(next)}\n` : ` ${next.map(([k, v]) => `${k}: ${v}`).join(', ')} `;
  return { src: src.slice(0, m.index) + m[1] + newBody + m[3] + src.slice(m.index + m[0].length), changed, kept, found: true };
}

/** Rewrite `const NAME = 'YYYY-MM-DD'`. -> { src, changed: bool, found } */
export function rewriteDateConst(src, name, date) {
  const re = new RegExp(`((?:export\\s+)?const\\s+${name}\\s*=\\s*['"])(\\d{4}-\\d{2}-\\d{2})(['"])`);
  const m = re.exec(src);
  if (!m) return { src, changed: false, found: false };
  return { src: src.replace(re, `$1${date}$3`), changed: m[2] !== date, found: true, before: m[2] };
}

/** Rewrite `const NAME = '...'` (a one-line string constant). -> { src, changed: bool, found } */
export function rewriteStringConst(src, name, value) {
  const re = new RegExp(`((?:export\\s+)?const\\s+${name}\\s*=\\s*)'((?:[^'\\\\\\n]|\\\\.)*)'`);
  const m = re.exec(src);
  if (!m) return { src, changed: false, found: false };
  const lit = String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return { src: src.slice(0, m.index) + `${m[1]}'${lit}'` + src.slice(m.index + m[0].length), changed: m[2] !== lit, found: true, before: m[2] };
}

/** Rewrite the CNY entry of shared.js FX_FALLBACK (USD per CNY, 4 significant digits). */
export function rewriteSharedFallback(src, perUSD) {
  const re = /(FX_FALLBACK\s*=\s*Object\.freeze\([^;\n]*?CNY\s*:\s*)([\d.]+)/;
  const m = re.exec(src);
  if (!m || !(perUSD.CNY > 0)) return { src, changed: [], found: !!m };
  const v = sig(1 / perUSD.CNY, 4);
  const old = Number(m[2]);
  return { src: src.replace(re, `$1${v}`), changed: old === v ? [] : [{ key: 'FX_FALLBACK.CNY (USD per CNY)', encoded: old, official: v }], found: true };
}

/** Apply a table to the cities document (pure). -> { doc, changes } */
export function applyFxToCities(doc, table, meta) {
  const out = structuredClone(doc);
  const changes = [];
  const used = [...new Set(out.cities.map((c) => c.currency))];
  const perUSD = { ...(out.fx && out.fx.perUSD) };
  for (const c of Object.keys(perUSD)) if (table.perUSD[c] > 0) perUSD[c] = table.perUSD[c];
  for (const c of used) if (perUSD[c] == null && table.perUSD[c] > 0) perUSD[c] = table.perUSD[c];
  const src = { name: meta.name, class: 'official', url: meta.url, license: meta.license, asOf: table.asOf, period: table.period, basis: table.basis };
  out.fx = {
    asOf: table.asOf,
    period: table.period,
    note: `Local currency units per US dollar: ${table.basis === 'monthly' ? `${table.period} monthly averages` : `daily rates of ${table.asOf}`} of the ECB euro reference rates crossed through USD; TWD from the Federal Reserve G.5 (FRED EXTAUS); AED, SAR and QAR at their official US-dollar pegs. Refreshed monthly by scripts/refresh/fx.js.`,
    source: src,
    perUSD: Object.fromEntries(Object.entries(perUSD).sort(([a], [b]) => a.localeCompare(b))),
  };
  for (const city of out.cities) {
    const fx = out.fx.perUSD[city.currency];
    if (!(fx > 0)) continue;
    city.sources = city.sources || {};
    if (city.fxPerUSD !== fx) changes.push({ key: `${city.key}.fxPerUSD`, encoded: city.fxPerUSD, official: fx });
    city.fxPerUSD = fx;
    city.sources.fxPerUSD = { name: `${city.currency} per USD: ${city.currency === 'USD' ? 'base currency' : meta.byCurrency[city.currency] || meta.name}`, url: meta.urlFor[city.currency] || meta.url, asOf: table.asOf, class: 'official' };
    for (const [usdField, localField] of RENT_PAIRS) {
      if (city[localField] == null) continue;
      const usd = toUsdAt(city[localField], fx);
      if (city[usdField] !== usd) changes.push({ key: `${city.key}.${usdField}`, encoded: city[usdField], official: usd, unit: 'USD/month' });
      city[usdField] = usd;
      const local = city.sources[localField] || {};
      city.sources[usdField] = {
        name: `${localField} ÷ fxPerUSD (${fx} ${city.currency}/USD, ${table.asOf})`,
        url: local.url || meta.url,
        asOf: local.asOf || table.asOf,
        fxAsOf: table.asOf,
        ...(local.class ? { class: local.class } : {}),
        ...(local.terms ? { terms: local.terms } : {}),
        ...(local.estimated ? { estimated: true, method: local.method } : {}),
      };
    }
  }
  out.updated = meta.today;
  return { doc: out, changes };
}

// ---------------------------------------------------------------- check

async function fetchParts(ctx) {
  const parts = { ecb: null, ecbDaily: null, twd: null };
  const evidence = [];
  const errors = [];
  try {
    const r = await ctx.fetchText(ECB_MONTHLY_URL);
    const latest = parseEcbMonthlyCsv(r.text);
    const periods = ECB_CURRENCIES.map((c) => latest[c] && latest[c].period).filter(Boolean);
    const period = periods.sort()[0]; // the latest month every currency has
    if (!latest.USD || periods.length < ECB_CURRENCIES.length) throw new Error(`ECB monthly: ${periods.length}/${ECB_CURRENCIES.length} currencies`);
    const perEUR = {};
    // re-read at the common period when a currency is ahead of the others
    const all = String(r.text).split(/\r?\n/);
    for (const c of ECB_CURRENCIES) {
      const line = all.find((l) => l.startsWith(`EXR.M.${c}.EUR.SP00.A,`) && l.includes(`,${period},`));
      perEUR[c] = line ? Number(line.split(',')[7]) : latest[c].perEUR;
    }
    parts.ecb = { period, perEUR };
    evidence.push({ url: ECB_MONTHLY_URL, fetchedAt: r.fetchedAt, excerpt: excerpt(all.filter((l) => /EXR\.M\.(USD|GBP|JPY)\./.test(l) && l.includes(period)).map((l) => l.split(',').slice(2, 3).concat(l.split(',').slice(6, 8)).join(' ')).join(' / ')) });
  } catch (err) {
    if (err.code === 'FIXTURE_MISSING') throw err;
    errors.push(`ECB monthly: ${err.message}`);
    try {
      const r = await ctx.fetchText(ECB_DAILY_URL);
      parts.ecbDaily = parseEcbDailyXml(r.text);
      evidence.push({ url: ECB_DAILY_URL, fetchedAt: r.fetchedAt, excerpt: excerpt(r.text.slice(r.text.indexOf('<Cube time'), r.text.indexOf('<Cube time') + 300)) });
    } catch (err2) { errors.push(`ECB daily: ${err2.message}`); }
  }
  try {
    const r = await ctx.fetchText(FRED_TWD_URL, { headers: { 'user-agent': 'curl/8.5.0 (melon-seek-refresh)' } });
    parts.twd = parseFredCsv(r.text);
    evidence.push({ url: FRED_TWD_URL, fetchedAt: r.fetchedAt, excerpt: r.text.trim().split(/\r?\n/).slice(-2).join(' / ') });
  } catch (err) {
    errors.push(`FRED EXTAUS: ${err.message}`);
    try {
      const { htmlToLines } = await import('./lib.js');
      const r = await ctx.fetchText(FED_G5_URL);
      parts.twd = parseFedG5(htmlToLines(r.text));
      evidence.push({ url: FED_G5_URL, fetchedAt: r.fetchedAt, excerpt: `G.5 ${parts.twd.period}: TAIWAN DOLLAR ${parts.twd.value}` });
    } catch (err2) { errors.push(`Fed G.5: ${err2.message}`); }
  }
  return { parts, evidence, errors };
}

export async function check(ctx) {
  const id = 'fx-per-usd';
  try {
    const doc = ctx.readJson('data/cities.json');
    const prev = { ...(doc.fx && doc.fx.perUSD) };
    const needed = [...new Set([...Object.keys(prev), ...doc.cities.map((c) => c.currency)])].sort();
    const { parts, evidence, errors } = await fetchParts(ctx);
    if (!parts.ecb && !parts.ecbDaily) return [result(id, 'auto', 'error', { summary: `no FX source reachable: ${errors.join('; ')}`, evidence })];
    // The code copies carry a few currencies no city uses (salary.js EXTRA_FX_PER_USD: CNY, ZAR,
    // QAR; shared.js FX_FALLBACK.CNY): convert every ECB currency and peg, validate the ones in use.
    const table = buildTable(parts, [...new Set([...needed, ...ECB_CURRENCIES, ...Object.keys(PEGS)])]);
    if (!parts.twd && prev.TWD) { table.perUSD.TWD = prev.TWD; table.notes.push('TWD source unreachable; kept the encoded rate'); }
    const missing = needed.filter((c) => !(table.perUSD[c] > 0));
    const v = validateFx(prev, table.perUSD, { needed, today: ctx.today, prevAsOf: doc.fx && doc.fx.asOf, asOf: table.asOf });
    if (missing.length) v.problems.push(`missing ${missing.join(', ')}`);
    const findings = v.moves.filter((m) => m.encoded !== m.official).map((m) => ({ key: `perUSD.${m.currency}`, encoded: m.encoded, official: m.official, unit: `${m.currency}/USD`, note: m.change == null ? 'new' : `${m.change >= 0 ? '+' : ''}${(m.change * 100).toFixed(2)}%` }));
    const notes = [...table.notes, ...errors.map((e) => `fallback used: ${e}`), ...v.warnings];
    if (v.problems.length) {
      return [result(id, 'auto', 'flag', { summary: `FX ${table.period} failed validation, nothing written: ${v.problems.slice(0, 4).join('; ')}`, sourceAsOf: table.asOf, findings, evidence })];
    }
    const meta = {
      today: ctx.today,
      name: `ECB euro reference rates, ${table.basis === 'monthly' ? `monthly averages ${table.period}` : `daily ${table.asOf}`}, crossed through USD; TWD Federal Reserve G.5; AED/SAR/QAR official pegs`,
      url: table.basis === 'monthly' ? ECB_INFO_URL : ECB_DAILY_URL,
      license: 'ECB statistics: reuse permitted with source acknowledgement; Federal Reserve data: public domain',
      byCurrency: { ...Object.fromEntries(Object.entries(PEGS).map(([c, p]) => [c, p.name])), TWD: 'Federal Reserve G.5 monthly average (FRED EXTAUS)' },
      urlFor: { ...Object.fromEntries(Object.entries(PEGS).map(([c, p]) => [c, p.url])), TWD: FRED_TWD_URL },
    };
    const writes = [];
    const allChanges = [];
    const { doc: nextDoc, changes } = applyFxToCities(doc, table, meta);
    const tableChanged = findings.length > 0 || (doc.fx && doc.fx.asOf) !== table.asOf;
    if (tableChanged) {
      writes.push({ file: 'data/cities.json', content: formatDoc(nextDoc) });
      allChanges.push(...changes);
    }
    for (const copy of FX_CODE_COPIES) {
      if (!ctx.exists(copy.file)) continue;
      let src = ctx.readText(copy.file);
      const t = rewriteTable(src, copy.table, table.perUSD);
      if (!t.found) { notes.push(`${copy.file}: ${copy.table} not found (format changed?)`); continue; }
      src = t.src;
      let changed = t.changed.length > 0;
      if (copy.asOf) { const d = rewriteDateConst(src, copy.asOf, table.asOf); if (d.found) { src = d.src; changed = changed || d.changed; } }
      if (copy.source) { const l = rewriteStringConst(src, copy.source, meta.name); if (l.found) { src = l.src; changed = changed || l.changed; } }
      if (copy.extra) { const e = rewriteTable(src, copy.extra, table.perUSD); if (e.found && e.changed.length) { src = e.src; changed = true; allChanges.push(...e.changed.map((x) => ({ ...x, key: `${copy.file} ${x.key}` }))); } }
      if (changed) writes.push({ file: copy.file, content: src });
    }
    if (ctx.exists(SHARED_FALLBACK_FILE)) {
      const s = rewriteSharedFallback(ctx.readText(SHARED_FALLBACK_FILE), table.perUSD);
      if (s.changed.length) { writes.push({ file: SHARED_FALLBACK_FILE, content: s.src }); allChanges.push(...s.changed); }
    }
    if (!writes.length) {
      return [result(id, 'auto', 'ok', { summary: `FX ${table.period} (${table.basis}) matches every copy`, sourceAsOf: table.asOf, evidence, findings: notes.map((n) => ({ key: 'note', note: n })) })];
    }
    const big = v.moves.filter((m) => m.change != null).sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 3).map((m) => `${m.currency} ${(m.change * 100).toFixed(1)}%`);
    return [result(id, 'auto', 'changed', {
      summary: `FX ${table.period} ${table.basis} averages (was as of ${doc.fx && doc.fx.asOf}): ${findings.length} rate(s) changed, largest ${big.join(', ')}; ${writes.length} file(s); ${allChanges.filter((c) => /USD$/.test(c.key)).length} USD rent field(s) re-derived${notes.length ? `. Notes: ${notes.join('; ')}` : ''}`,
      sourceAsOf: table.asOf,
      findings: [...findings, ...notes.map((n) => ({ key: 'note', note: n }))],
      evidence,
      writes,
    })];
  } catch (err) {
    return [errorResult(id, 'auto', err)];
  }
}
