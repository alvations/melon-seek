// Updater: every Juice Score tax rule (registry ids `tax-<TAX_SOURCES key in lower case>`).
// Mode 'detect' (or 'manual'): tax rules are NEVER written by the refresh. A mismatch or a
// newer tax year becomes a 'drift' result with evidence, for a human (or the juice-tax
// process) to update server/juice.js, its golden tests, docs/LIVABILITY.md §3 and
// TAX_SOURCES together. See docs/process/freshness-tax.md and docs/DATA_FRESHNESS.md.
//
// What is checked lives in scripts/refresh/tax-watch.js (data only). For each watch entry:
//   1. encoded figures are read from the SOURCE TEXT of server/juice.js: TAX_PARAMS when
//      it exists (docs/process/patches/freshness-tax-export.diff), else the named constant
//      (extractConst, `{year}` filled from TAX_SOURCES[key].asOf), else a literal matched
//      inside a rule block (`US_STATE.CA`, `RULES.IE`, `fn:caPayroll`);
//   2. the official page(s) are fetched (HTML, gov.uk Content API JSON or PDF), reduced to
//      normalized text lines, cut to a section and the figure extracted with a regex;
//   3. encoded and official values are compared exactly (or within a stated tolerance);
//   4. newYear signals look for the next tax year's figures being published (the IRS
//      inflation-adjustment release, SSA wage base, HMRC's next "rates and thresholds",
//      CRA's next EI maximum, ...); a match is drift even when every number still matches;
//   5. validators: schedule shape (thresholds strictly increasing, rates in [0, 0.7) and
//      non-decreasing), caps rising year over year, encoded tax year current or previous.
// Result per id: ok | drift | flag | error (page moved, extractor no longer matches) |
// stale (manual entry past its review date) | skipped (offline, no fixture). Never 'changed'.
// An optional ADVISORY LLM second opinion (ctx.llm, ANTHROPIC_API_KEY) never sets a status.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  htmlToLines, pdfToText, parseMoney, parsePercent, sameNumber, extractConst, constInitializer,
  result, excerpt, isoDate, parseDate, addDays,
} from './lib.js';
import { WATCH, TAX_FILE, CONSUMERS, COMMON_VALIDATOR } from './tax-watch.js';

export const MODULE = Object.freeze({ name: 'tax', ids: Object.freeze(WATCH.map((w) => w.id)) });

/** Registry id for a TAX_SOURCES key (stable: it is also the archive dataset key). */
export const idForKey = (key) => `tax-${String(key).toLowerCase()}`;

// ---------------------------------------------------------------- years and placeholders

/** First (or last) 4-digit year in a TAX_SOURCES asOf: '2026/27' -> 2026, 'YA2026' -> 2026, 'FY2026-27' -> 2026. */
export function taxYearFromAsOf(asOf, pick = 'first') {
  const years = String(asOf ?? '').match(/(?<!\d)(19|20)\d\d(?!\d)/g);
  if (!years) return null;
  return Number(pick === 'last' ? years[years.length - 1] : pick === 'max' ? years.sort().at(-1) : years[0]);
}

/** Fill {year} {year1} {year2} {prev} {yy1} {yy2} {later} in a string (regex or URL). */
export function fill(s, year) {
  if (typeof s !== 'string' || !Number.isFinite(year)) return s;
  const yy = (y) => String(y % 100).padStart(2, '0');
  const later = Array.from({ length: 8 }, (_, i) => year + 1 + i).join('|');
  const map = { year, year1: year + 1, year2: year + 2, prev: year - 1, yy1: yy(year + 1), yy2: yy(year + 2), later: `(?:${later})` };
  return s.replace(/\{(year|year1|year2|prev|yy1|yy2|later)\}/g, (m, k) => String(map[k]));
}

/** The tax year in force at `today` for a jurisdiction whose year starts on MM-DD (e.g. '04-06'). */
export function currentTaxYear(today, yearStart = '01-01') {
  const d = parseDate(today);
  const y = d.getUTCFullYear();
  const [mm, dd] = String(yearStart).split('-').map(Number);
  return d.getTime() >= Date.UTC(y, (mm || 1) - 1, dd || 1) ? y : y - 1;
}

/** First day of tax year `year + 1` (when the encoded figures stop applying). */
export function nextYearStart(year, yearStart = '01-01') {
  const [mm, dd] = String(yearStart).split('-').map(Number);
  return isoDate(new Date(Date.UTC(year + 1, (mm || 1) - 1, dd || 1)));
}

// ---------------------------------------------------------------- reading encoded values

/** Evaluate a numeric / array literal from source ('1e6', '[[12000, 0.03], [INF, 0.04]]'). */
export function evalLiteral(s) {
  const t = String(s).trim();
  if (!/^[\s\d.,eE+\-[\]INFIfinity_]*$/.test(t)) return undefined;
  try {
    // eslint-disable-next-line no-new-func
    return Function('INF', 'Infinity', `"use strict"; return (${t.replace(/_/g, '')});`)(Infinity, Infinity);
  } catch {
    return undefined;
  }
}

function scanTo(src, i, stopAtDepth0) {
  // returns the index of the first char at depth 0 matching stopAtDepth0 (a Set), skipping strings/comments
  let depth = 0;
  let quote = null;
  for (; i < src.length; i++) {
    const c = src[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '/' && src[i + 1] === '/') { const nl = src.indexOf('\n', i); i = nl < 0 ? src.length : nl; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 1; continue; }
    if (depth === 0 && stopAtDepth0.has(c)) return i;
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') { if (depth === 0) return i; depth--; }
  }
  return src.length;
}

/** Top-level members of an object literal text '{ A: ..., B(g) {...}, 'C-D': ... }' -> [{ key, text, offset }]. */
export function objectMembers(objText) {
  const out = [];
  const s = String(objText || '');
  const open = s.indexOf('{');
  if (open < 0) return out;
  let i = open + 1;
  while (i < s.length) {
    const m = /^(?:[\s,]|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*(?:(['"])([^'"]+)\1|([A-Za-z_$][\w$]*))\s*(?=[:(])/.exec(s.slice(i));
    if (!m) break;
    const key = m[2] || m[3];
    const start = i + m[0].length;
    const end = scanTo(s, start, new Set([',']));
    out.push({ key, text: s.slice(start, end), offset: start });
    if (s[end] === '}' || end >= s.length) break;
    i = end + 1;
  }
  return out;
}

/** Keys of a top-level `const NAME = { ... }` object in source (e.g. RULES, US_STATE, CA_PROV). */
export function objectKeys(src, name) {
  const init = constInitializer(src, name);
  return init ? objectMembers(init).map((m) => m.key) : [];
}

/** Source text of a rule block: 'US_STATE.CA', 'RULES.IE', 'CA_PROV.ON', 'fn:caPayroll'. */
export function blockText(src, spec) {
  if (spec.startsWith('fn:')) {
    const name = spec.slice(3);
    const m = new RegExp(`function\\s+${name}\\s*\\(`).exec(src);
    if (!m) return null;
    const brace = src.indexOf('{', m.index);
    const end = scanTo(src, brace + 1, new Set());
    return src.slice(m.index, end + 1);
  }
  const [obj, key] = spec.split('.');
  const init = constInitializer(src, obj);
  if (!init) return null;
  const member = objectMembers(init).find((x) => x.key === key);
  return member ? member.text : null;
}

/** 1-based line in src where a block / constant starts (for registry `owners`). */
export function locatorLine(src, loc, year) {
  const l = Array.isArray(loc) ? loc.find((x) => x.const || x.block) : loc;
  if (!l) return null;
  let idx = -1;
  if (l.const) idx = src.search(new RegExp(`(?:const|let|var)\\s+${fill(l.const, year)}\\s*=`));
  else if (l.block && l.block.startsWith('fn:')) idx = src.search(new RegExp(`function\\s+${l.block.slice(3)}\\s*\\(`));
  else if (l.block) {
    const [obj, key] = l.block.split('.');
    const at = src.search(new RegExp(`(?:const|let|var)\\s+${obj}\\s*=`));
    if (at >= 0) {
      const rel = src.slice(at).search(new RegExp(`\\n\\s*(?:'${key}'|${key.replace(/-/g, '\\-')})\\s*[:(]`));
      idx = rel >= 0 ? at + rel + 1 : at;
    }
  }
  return idx < 0 ? null : src.slice(0, idx).split('\n').length;
}

function getPath(obj, dotted) {
  return String(dotted).split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/** Apply path ('[3][0]', 'single[5][0]', "['MD-COUNTY']") / column / slice / scale / add to a resolved value. */
export function selectValue(v, a = {}) {
  let x = v;
  if (a.path) for (const m of String(a.path).matchAll(/\[(\d+)\]|\['([^']+)'\]|\.?([A-Za-z_$][\w$-]*)/g)) x = x == null ? undefined : x[m[1] != null ? Number(m[1]) : (m[2] ?? m[3])];
  if (a.column != null && Array.isArray(x)) x = x.map((row) => (Array.isArray(row) ? row[a.column] : undefined));
  if (Array.isArray(x) && a.column === 0) x = x.filter((t) => t !== Infinity);
  if (a.slice && Array.isArray(x)) x = x.slice(a.slice[0], a.slice[1]);
  const tf = (n) => (typeof n === 'number' ? Number(((n * (a.scale ?? 1)) + (a.add ?? 0)).toPrecision(12)) : n);
  return Array.isArray(x) ? x.map(tf) : tf(x);
}

/**
 * Resolve an encoded locator (or a list of alternatives, first that resolves wins) against
 * the juice.js source text. -> { value, where } | { error }
 *   { params: 'US.ssWageBase' }                       TAX_PARAMS (when exported)
 *   { const: 'US_FED_{year}', path?, column?, slice? } a top-level constant
 *   { block: 'US_STATE.CA', match: '<regex, 1 group>', nth?, path?, column?, slice? }
 */
export function resolveEncoded(src, loc, { year, params } = {}) {
  const alts = Array.isArray(loc) ? loc : [loc];
  const tried = [];
  for (const a of alts) {
    if (!a) continue;
    let v;
    let where;
    if (a.params) {
      where = `TAX_PARAMS.${a.params}`;
      v = params ? getPath(params, a.params) : undefined;
    } else if (a.const) {
      where = fill(a.const, year);
      v = extractConst(src, where);
    } else if (a.block) {
      where = a.block;
      const text = blockText(src, a.block);
      if (text != null && a.match) {
        const re = new RegExp(fill(a.match, year), 'g');
        const ms = [...text.matchAll(re)];
        const m = ms.at(a.nth ?? 0);
        where = `${a.block} /${a.match}/${a.nth ? `[${a.nth}]` : ''}`;
        v = m ? evalLiteral(m[1]) : undefined;
      }
    }
    if (v === undefined) { tried.push(where); continue; }
    const value = selectValue(v, a);
    if (value === undefined || (Array.isArray(value) && value.some((x) => x === undefined))) { tried.push(`${where} (path)`); continue; }
    return { value, where };
  }
  return { error: `encoded value not found in ${TAX_FILE} (tried ${tried.join(', ') || 'nothing'})` };
}

// ---------------------------------------------------------------- reading official documents

/** Normalize text lines: zero-width chars, odd spaces, full-width %, dashes, edge pipes. */
export function normalizeLines(lines) {
  return lines.map((l) => String(l)
    .replace(/[​‌‍⁠﻿­]/g, '')
    .replace(/[    　]/g, ' ')
    .replace(/％/g, '%').replace(/[‐-―−]/g, '-').replace(/[‘’]/g, "'")
    .replace(/[ \t]+/g, ' ').trim()
    .replace(/^\|\s*/, '').replace(/\s*\|$/, '').trim())
    .filter((l) => l && l !== '|');
}

/** Text of an official document: gov.uk Content API JSON, PDF (pdftotext) or HTML. */
export function documentText(buffer, { contentType = '', url = '' } = {}) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(String(buffer));
  if (buf.subarray(0, 5).toString() === '%PDF-' || /pdf/i.test(contentType)) {
    const t = pdfToText(buf);
    if (t == null) throw Object.assign(new Error(`cannot read PDF ${url}: pdftotext (poppler-utils) is not installed`), { code: 'NO_PDFTOTEXT' });
    return { text: normalizeLines(t.split('\n')).join('\n'), kind: 'pdf', meta: {} };
  }
  const raw = buf.toString('utf8');
  if (/^\s*[[{]/.test(raw) && (/json/i.test(contentType) || /\/api\//.test(url) || /\.json$/.test(url))) {
    let j;
    try { j = JSON.parse(raw); } catch { j = null; }
    if (j) {
      const html = [];
      (function walk(o, k) {
        if (typeof o === 'string') { if (/<\w|\n/.test(o) || k === 'title' || k === 'description') html.push(o); } else if (Array.isArray(o)) o.forEach((x) => walk(x, k)); else if (o && typeof o === 'object') for (const [kk, v] of Object.entries(o)) if (kk !== 'links') walk(v, kk);
      })(j.details ? { title: j.title, details: j.details } : j);
      return { text: normalizeLines(htmlToLines(html.join('\n<p>'))).join('\n'), kind: 'json', meta: { updated: j.public_updated_at || j.updated_at || null } };
    }
  }
  return { text: normalizeLines(htmlToLines(raw)).join('\n'), kind: 'html', meta: {} };
}

/** Best-effort "page last updated" date on an official page -> 'YYYY-MM-DD' | null. */
export function pageDate(text, meta = {}) {
  if (meta.updated) return isoDate(meta.updated);
  const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  let m;
  if ((m = /(?:Last Reviewed or Updated|Date modified|Last updated(?: on)?|Updated|Vérifié le)\s*:?\s*(\d{1,2})[-\s]([A-Za-zé]{3,})[a-zé]*[-\s,]+(\d{4})/i.exec(text))) {
    const mon = MON[m[2].slice(0, 3).toLowerCase()] || { avr: 4, fév: 2, déc: 12, aoû: 8, jui: 7 }[m[2].slice(0, 3).toLowerCase()];
    if (mon) return isoDate(new Date(Date.UTC(+m[3], mon - 1, +m[1])));
  }
  if ((m = /(?:Last updated(?: on)?|Updated|Date modified)\s*:?\s*([A-Z][a-z]+)\s+(\d{1,2}),\s*(\d{4})/.exec(text))) {
    const mon = MON[m[1].slice(0, 3).toLowerCase()];
    if (mon) return isoDate(new Date(Date.UTC(+m[3], mon - 1, +m[2])));
  }
  if ((m = /(?:Last updated|Date modified)\s*:?\s*(\d{4})-(\d{2})-(\d{2})/i.exec(text))) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = /Last updated:?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i.exec(text))) return isoDate(new Date(Date.UTC(+m[3], +m[1] - 1, +m[2])));
  return null;
}

/** Cut text to a section: start (regex or list of regexes found in sequence) .. end (regex). */
export function sectionOf(text, section, year) {
  if (!section) return { text, offset: 0 };
  let at = 0;
  for (const s of [].concat(section.start || [])) {
    const re = new RegExp(fill(s, year), 'im');
    const m = re.exec(text.slice(at));
    if (!m) return { error: `section start /${fill(s, year)}/ not found` };
    at += m.index + (section.includeStart === false ? m[0].length : 0);
  }
  let end = text.length;
  if (section.end) {
    const re = new RegExp(fill(section.end, year), 'im');
    const from = at + 1;
    const m = re.exec(text.slice(from));
    if (m) end = from + m.index;
  }
  return { text: text.slice(at, end), offset: at };
}

function parseCapture(cap, spec) {
  const s = String(cap).trim();
  let v;
  if (spec.parse === 'percent') v = parsePercent(s);
  else if (spec.parse === 'number') { const n = Number(s.replace(/[,\s]/g, '')); v = Number.isFinite(n) ? n : null; }
  else v = parseMoney(s);
  if (v == null) return null;
  return Number(((v * (spec.scale ?? 1)) + (spec.add ?? 0)).toPrecision(12));
}

/**
 * Extract an official figure from document text.
 * spec: { section?, extract: regex (1 capture group), all?, nth?, sort?, slice?, cumulative?, parse, scale? }
 * -> { value, excerpt } | { error }
 */
export function extractFigure(text, spec, year) {
  const sec = sectionOf(text, spec.section, year);
  if (sec.error) return { error: sec.error };
  const reSrc = fill(spec.extract, year);
  const re = new RegExp(reSrc, `gim${spec.dotAll ? 's' : ''}`);
  const ms = [...sec.text.matchAll(re)];
  if (!ms.length) return { error: `no match for /${reSrc}/${spec.section ? ' in the section' : ''}` };
  const at = (spec.all ? ms[0] : ms.at(spec.nth ?? 0)) || ms[0];
  const ex = excerpt(sec.text, at.index, 400);
  if (!spec.all) {
    const m = ms.at(spec.nth ?? 0);
    if (!m) return { error: `match #${spec.nth} of /${reSrc}/ not found (${ms.length} matches)` };
    const v = parseCapture(m[1] ?? m[0], spec);
    return v == null ? { error: `could not parse "${m[1]}"` } : { value: v, excerpt: excerpt(sec.text, m.index, 400) };
  }
  let vals = ms.map((m) => parseCapture(m[1] ?? m[0], spec));
  if (vals.some((v) => v == null)) return { error: `could not parse every match of /${reSrc}/` };
  if (spec.sort === 'asc') vals.sort((a, b) => a - b);
  if (spec.slice) vals = vals.slice(spec.slice[0], spec.slice[1]);
  if (spec.cumulative) { let acc = 0; vals = vals.map((v) => Number((acc += v).toPrecision(12))); }
  return { value: vals, excerpt: ex };
}

/** Compare encoded vs official (numbers or equal-length arrays) within an absolute tolerance. */
export function compareValues(encoded, official, tol = 0) {
  if (Array.isArray(encoded) || Array.isArray(official)) {
    if (!Array.isArray(encoded) || !Array.isArray(official)) return { equal: false, note: 'shape differs' };
    if (encoded.length !== official.length) return { equal: false, note: `${encoded.length} encoded vs ${official.length} official values` };
    const diffs = encoded.map((e, i) => (sameNumber(e, official[i], tol) ? null : i)).filter((i) => i != null);
    return { equal: !diffs.length, note: diffs.length ? `differs at index ${diffs.join(', ')}` : '' };
  }
  return { equal: sameNumber(encoded, official, tol), note: '' };
}

// ---------------------------------------------------------------- validators (exported, tested)

/** Problems with a bracket schedule [[upTo, rate]] / [[upTo, r0, r1]] (empty = fine). */
export function validateSchedule(brackets, { maxRate = 0.7, allowRateDecrease = false, label = 'schedule' } = {}) {
  const problems = [];
  if (!Array.isArray(brackets) || !brackets.length) return [`${label}: not a bracket list`];
  let prevUp = -Infinity;
  let prevRate = -Infinity;
  brackets.forEach((b, i) => {
    if (!Array.isArray(b) || b.length < 2) { problems.push(`${label}[${i}]: not [upTo, rate]`); return; }
    const [up, ...rates] = b;
    if (!(typeof up === 'number') || Number.isNaN(up)) problems.push(`${label}[${i}]: threshold ${up} is not a number`);
    else if (!(up > prevUp)) problems.push(`${label}[${i}]: threshold ${up} is not above ${prevUp}`);
    if (up === Infinity && i !== brackets.length - 1) problems.push(`${label}[${i}]: Infinity before the last bracket`);
    for (const r of rates) {
      if (!(r >= 0 && r < maxRate)) problems.push(`${label}[${i}]: rate ${r} outside [0, ${maxRate})`);
      if (!allowRateDecrease && r < prevRate - 1e-12) problems.push(`${label}[${i}]: rate ${r} below the previous ${prevRate}`);
      prevRate = Math.max(prevRate, r);
    }
    prevUp = up;
  });
  if (brackets.length && brackets[brackets.length - 1][0] !== Infinity) problems.push(`${label}: last bracket is not open-ended (Infinity)`);
  return problems;
}

/** Caps / wage bases / allowances must not fall year over year unless the source says so. */
export function validateRising(prev, next, { allowDecrease = false, label = 'cap' } = {}) {
  if (!Number.isFinite(prev) || !Number.isFinite(next) || allowDecrease) return [];
  return next < prev ? [`${label} falls from ${prev} to ${next}: confirm against the source before updating`] : [];
}

/** The encoded tax year must be the current or the previous one at `today` (older = flag). */
export function validateTaxYear(taxYear, today, yearStart = '01-01') {
  if (!Number.isFinite(taxYear)) return ['encoded tax year unknown (TAX_SOURCES asOf has no year)'];
  const cur = currentTaxYear(today, yearStart);
  if (taxYear < cur - 1) return [`encoded tax year ${taxYear} is older than the previous tax year (${cur - 1}; current ${cur})`];
  if (taxYear > cur + 1) return [`encoded tax year ${taxYear} is more than a year ahead of the current tax year ${cur}`];
  return [];
}

/**
 * Coverage: every RULES jurisdiction, US state, US locality, Canadian province and TAX_SOURCES
 * key must be covered by a watch entry. -> { required, covered, missing, unknown }
 */
export function coverage(src, watch = WATCH, taxSources = null) {
  const tax = taxSources || extractConst(src, 'TAX_SOURCES') || {};
  const required = new Set([
    ...objectKeys(src, 'RULES'),
    ...objectKeys(src, 'US_STATE').map((k) => `US-${k}`),
    ...objectKeys(src, 'US_LOCAL').map((k) => `US-LOCAL-${k}`),
    ...objectKeys(src, 'CA_PROV').map((k) => `CA-${k}`),
    ...Object.keys(tax),
  ]);
  const covered = new Set(watch.flatMap((w) => [w.key, ...(w.covers || [])]));
  return {
    required: [...required].sort(),
    covered: [...covered].sort(),
    missing: [...required].filter((k) => !covered.has(k)).sort(),
    unknown: [...covered].filter((k) => !required.has(k)).sort(),
  };
}

// ---------------------------------------------------------------- the check

function readParams(src) {
  try { return extractConst(src, 'TAX_PARAMS') || null; } catch { return null; }
}

async function fetchDoc(ctx, cache, url, headers) {
  if (cache.has(url)) return cache.get(url);
  const p = (async () => {
    try {
      const r = await ctx.fetchBuffer(url, headers ? { headers } : undefined);
      if (r.fixture && /\.404\.\w+$/.test(r.fixture)) return { url, status: 404, absent: true, fetchedAt: r.fetchedAt };
      const doc = documentText(r.buffer, { contentType: r.contentType, url });
      return { url, status: r.status, fetchedAt: r.fetchedAt, ...doc };
    } catch (err) {
      if (err && (err.status === 404 || err.status === 410)) return { url, status: err.status, absent: true, fetchedAt: ctx.today };
      return { url, error: err, fetchedAt: ctx.today };
    }
  })();
  cache.set(url, p);
  return p;
}

function sourceUrls(entry, figSpec, year) {
  const src = figSpec.src ? entry.sources[figSpec.src] : null;
  if (figSpec.src && !src) return { error: `watch list: unknown source "${figSpec.src}"` };
  const urls = [].concat(figSpec.url || (src && (src.urls || src.url)) || []).map((u) => fill(u, year));
  if (!urls.length) return { error: 'watch list: figure has no url' };
  if (src && src.forYear != null && src.forYear !== year) return { error: `watch list: source "${figSpec.src}" is the tax year ${src.forYear} document but the encoded tax year is ${year}; point it at the ${year} document` };
  return { urls, headers: src && src.headers };
}

/** Check one watch entry. Never throws. */
export async function checkEntry(ctx, entry, { src, taxSources, params, cache = new Map() }) {
  const mode = entry.mode || 'detect';
  const ts = taxSources[entry.key];
  const asOf = ts && ts.asOf;
  const yearOf = (pick) => taxYearFromAsOf(asOf, pick || entry.yearFrom || 'first') ?? entry.taxYear;
  const year = yearOf();
  const findings = [];
  const evidence = [];
  const problems = [];
  const errors = [];
  let drift = 0;
  let notices = 0;
  let sourceAsOf = null;
  const encodedByKey = new Map();
  const checklist = checklistFor(entry, ts, year);

  if (!ts) errors.push(`TAX_SOURCES has no "${entry.key}" entry`);
  for (const p of validateTaxYear(year, ctx.today, entry.yearStart)) problems.push(p);
  for (const loc of entry.schedules || []) {
    const r = resolveEncoded(src, loc, { year, params });
    if (r.error) errors.push(`schedule: ${r.error}`);
    else for (const p of validateSchedule(r.value, { label: r.where, allowRateDecrease: [].concat(loc).some((l) => l && l.allowRateDecrease) })) problems.push(p);
  }

  const addEvidence = (url, fetchedAt, ex) => {
    if (evidence.length < 8 && ex && !evidence.some((e) => e.url === url && e.excerpt === ex)) evidence.push({ url, fetchedAt, excerpt: ex.slice(0, 400) });
  };

  // figures
  for (const fig of entry.figures || []) {
    const fy = fig.yearFrom ? yearOf(fig.yearFrom) : year;
    const enc = resolveEncoded(src, fig.encoded, { year: fy, params });
    if (enc.error) { errors.push(`${fig.key}: ${enc.error}`); findings.push({ key: fig.key, encoded: null, official: null, unit: fig.unit, url: null, note: `error: ${enc.error}` }); continue; }
    encodedByKey.set(fig.key, enc.value);
    if (!fig.official || fig.official === 'manual' || fig.official.extract === 'manual') {
      const o = fig.official && typeof fig.official === 'object' ? fig.official : {};
      if (mode === 'detect' || fig.listManual !== false) findings.push({ key: fig.key, encoded: enc.value, official: null, unit: fig.unit, url: o.url ? fill(o.url, fy) : null, note: `manual: ${o.note || 'not machine-checked; verify by hand'}` });
      continue;
    }
    const su = sourceUrls(entry, fig.official, fy);
    if (su.error) { errors.push(`${fig.key}: ${su.error}`); findings.push({ key: fig.key, encoded: enc.value, official: null, unit: fig.unit, url: null, note: `error: ${su.error}` }); continue; }
    let got = null;
    let lastErr = null;
    let usedUrl = su.urls[0];
    for (const url of su.urls) {
      const doc = await fetchDoc(ctx, cache, url, su.headers);
      usedUrl = url;
      if (doc.error) { lastErr = doc.error; if (doc.error.code === 'FIXTURE_MISSING') continue; continue; }
      if (doc.absent) { lastErr = new Error(`HTTP ${doc.status} ${url}`); continue; }
      const ex = extractFigure(doc.text, fig.official, fy);
      if (ex.error) { lastErr = new Error(ex.error); continue; }
      got = { ...ex, doc };
      break;
    }
    if (!got) {
      const msg = lastErr ? lastErr.message : 'not extracted';
      if (lastErr && lastErr.code === 'FIXTURE_MISSING') errors.push({ skipped: true, msg: `${fig.key}: ${msg}` });
      else errors.push(`${fig.key}: ${msg}`);
      findings.push({ key: fig.key, encoded: enc.value, official: null, unit: fig.unit, url: usedUrl, note: `error: extractor failed (${msg}); the page may have moved or changed layout` });
      continue;
    }
    if (!sourceAsOf) sourceAsOf = pageDate(got.doc.text, got.doc.meta);
    const cmp = compareValues(enc.value, got.value, fig.tolerance || 0);
    addEvidence(usedUrl, got.doc.fetchedAt, got.excerpt);
    if (!cmp.equal) {
      drift++;
      findings.push({ key: fig.key, encoded: enc.value, official: got.value, unit: fig.unit, url: usedUrl, note: `mismatch${cmp.note ? ` (${cmp.note})` : ''}${fig.tolerance ? `; tolerance ${fig.tolerance}` : ''}${fig.note ? `; ${fig.note}` : ''}` });
    } else if (fig.reportOk) {
      findings.push({ key: fig.key, encoded: enc.value, official: got.value, unit: fig.unit, url: usedUrl, note: 'matches' });
    }
  }

  // newer tax year published?
  for (const ny of entry.newYear || []) {
    const fy = ny.yearFrom ? yearOf(ny.yearFrom) : year;
    const url = fill(ny.url || (entry.sources[ny.src] && entry.sources[ny.src].url), fy);
    const doc = await fetchDoc(ctx, cache, url, ny.src && entry.sources[ny.src] && entry.sources[ny.src].headers);
    if (doc.absent) { if (!ny.absentOk) errors.push(`newYear ${url}: HTTP ${doc.status}`); continue; }
    if (doc.error) {
      if (doc.error.code === 'FIXTURE_MISSING') { if (!ny.absentOk) errors.push({ skipped: true, msg: `newYear: ${doc.error.message}` }); continue; }
      errors.push(`newYear ${url}: ${doc.error.message}`);
      continue;
    }
    const re = new RegExp(fill(ny.signal, fy), 'im');
    const m = re.exec(doc.text);
    if (!m) continue;
    const label = fill(ny.label || `tax year ${fy + 1} figures published`, fy);
    let official = m[0].slice(0, 120);
    if (ny.value) {
      const v = parseCapture(m[1] ?? '', ny.value);
      if (v != null) {
        official = v;
        const prev = ny.compareTo ? encodedByKey.get(ny.compareTo) : null;
        if (ny.expect === 'rise' && prev != null) for (const p of validateRising(prev, v, { label: `${ny.compareTo} (${fy} -> ${fy + 1})` })) problems.push(p);
      }
    }
    addEvidence(url, doc.fetchedAt, excerpt(doc.text, m.index, 400));
    if (ny.notice) { notices++; findings.push({ key: 'notice', encoded: year, official, unit: ny.unit || '', url, note: `notice: ${label}` }); continue; }
    drift++;
    findings.push({ key: ny.compareTo ? `${ny.compareTo} (${fy + 1})` : 'newer tax year', encoded: ny.compareTo ? encodedByKey.get(ny.compareTo) ?? String(year) : String(year), official, unit: ny.unit || (ny.compareTo ? '' : 'tax year'), url, note: `newer tax year published: ${label}` });
  }

  for (const p of problems) findings.push({ key: 'validator', encoded: null, official: null, unit: '', url: null, note: `validator: ${p}` });

  // optional advisory LLM second opinion (never sets the status)
  if (mode === 'detect' && entry.llm !== false && !ctx.offline) {
    try { for (const f of await llmSecondOpinion(ctx, entry, year, encodedByKey, cache)) findings.push(f); } catch { /* advisory only */ }
  }

  const hard = errors.filter((e) => typeof e === 'string');
  const skipped = errors.filter((e) => typeof e === 'object' && e.skipped);
  const checkedFigures = (entry.figures || []).filter((f) => f.official && f.official !== 'manual' && f.official.extract !== 'manual').length;
  const parts = [];
  const mismatches = findings.filter((f) => /^mismatch/.test(f.note || '')).length;
  if (mismatches) parts.push(`${mismatches} figure(s) differ from the official source`);
  const newer = findings.filter((f) => /^newer tax year/.test(f.note || ''));
  if (newer.length) parts.push(newer.map((f) => f.note.replace(/^newer tax year published: /, '')).join('; '));
  if (problems.length) parts.push(`${problems.length} validator problem(s)`);
  if (hard.length) parts.push(`${hard.length} check(s) failed: ${hard[0]}${hard.length > 1 ? ' …' : ''}`);
  if (notices) parts.push(`${notices} notice(s)`);
  const base = { sourceAsOf, findings, evidence, checklist };
  const label = `${entry.key} tax year ${year ?? '?'}`;

  if (mode === 'manual') return manualResult(ctx, entry, year, label, base, problems, hard);
  let status;
  if (drift) status = 'drift';
  else if (problems.length) status = 'flag';
  else if (hard.length) status = 'error';
  else if (skipped.length && checkedFigures && skipped.length >= checkedFigures) status = 'skipped';
  else status = 'ok';
  const summary = status === 'ok'
    ? `${label}: ${checkedFigures} figure(s) match the official source; no newer tax year published${notices ? `; ${notices} notice(s)` : ''}`
    : status === 'skipped' ? `${label}: offline, no fixture (${skipped[0].msg})` : `${label}: ${parts.join('; ')}`;
  return result(entry.id, 'detect', status, { summary, ...base });
}

function manualResult(ctx, entry, year, label, base, problems, hard) {
  // Due: the encoded figures stop applying when the next tax year starts; the entry is stale
  // grace days after that, unless someone reviewed it since the CURRENT tax year started
  // (registry lastChecked), i.e. confirmed that nothing newer than the encoded year exists.
  const reg = ctx.entry ? ctx.entry(entry.id) : undefined;
  const grace = (reg && reg.graceDays) ?? entry.graceDays ?? 60;
  const ends = Number.isFinite(year) ? nextYearStart(year, entry.yearStart) : null;
  const cur = currentTaxYear(ctx.today, entry.yearStart);
  const curStart = nextYearStart(cur - 1, entry.yearStart);
  const from = ends && ends > curStart ? ends : curStart; // the review must be newer than this
  const due = ends ? isoDate(addDays(from, grace)) : null;
  const checked = reg && reg.lastChecked;
  const confirmed = !!(checked && ends && year < cur + 1 && checked >= from && ends <= ctx.today);
  const overdue = due && ctx.today > due && !confirmed;
  const status = problems.length ? 'flag' : overdue ? 'stale' : 'ok';
  const when = confirmed
    ? `reviewed on ${checked} (no figures newer than tax year ${year}); next review due by ${isoDate(addDays(nextYearStart(cur, entry.yearStart), grace))}`
    : due ? `${overdue ? `past due since ${due}` : `review due by ${due}`} (tax year ${year} ends ${addDays(ends, -1).toISOString().slice(0, 10)}, +${grace} days grace)` : 'no due date (tax year unknown)';
  const unresolved = hard.length ? `; ${hard.length} encoded figure(s) not found in ${TAX_FILE} (update scripts/refresh/tax-watch.js)` : '';
  const summary = `${label}: manual (${entry.manualReason || 'no machine-readable official page'}); ${when}${problems.length ? `; ${problems.join('; ')}` : ''}${unresolved}`;
  return result(entry.id, 'manual', status, { summary, ...base, sourceAsOf: null });
}

/** The exact human steps for an entry (drift / stale). */
export function checklistFor(entry, ts, year) {
  const urls = [...new Set([...(entry.sources ? Object.values(entry.sources).flatMap((s) => [].concat(s.urls || s.url)) : []).map((u) => fill(u, (year || 0) + 1)), ...(ts && ts.url ? [ts.url] : [])])];
  const owners = [...new Set([...(entry.figures || []).map((f) => (Array.isArray(f.encoded) ? f.encoded.find((x) => x.const || x.block) : f.encoded)).filter(Boolean).map((l) => fill(l.const || l.block, year))])];
  return [
    `Read the official ${entry.jurisdiction} figures for the newest tax year at: ${urls.join(' , ') || '(see TAX_SOURCES)'}${entry.expectedPublication ? ` (usually published: ${entry.expectedPublication})` : ''}.`,
    `Update server/juice.js tax section: ${owners.join(', ') || 'the rule for this jurisdiction'} (thresholds, rates, allowances, caps).${owners.some((o) => /_\d{4}\b/.test(o)) ? ` Rename the year-suffixed constants for the new year (e.g. ${owners.find((o) => /_\d{4}\b/.test(o))} -> ${owners.find((o) => /_\d{4}\b/.test(o)).replace(/_(\d{4})\b/, (m, y) => `_${Number(y) + 1}`)}) and point TAX_PARAMS at them if it exists.` : ''}`,
    `Update TAX_SOURCES['${entry.key}']: name (figures and tax year), url, asOf (new tax year), verified: true only after checking against the official source, checkedVia.`,
    'Recompute the golden tax tests by hand from the official schedule (test/juice*.test.js and the tax golden fixtures) and update them in the same change.',
    `Update docs/LIVABILITY.md §3 (the ${entry.key} row: rule, as of, verified) and regenerate the worked examples (docs/LIVABILITY.md §1, README) if the Juice numbers move.`,
    'If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture the fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.',
    'Run npm test, then record the review: lastChecked in data/freshness.json (freshness lead) and the new version in the archive.',
  ];
}

const LLM_MAX_CHARS = 12000;
/** Advisory: ask ctx.llm to read the primary page into figures; report disagreements. */
export async function llmSecondOpinion(ctx, entry, year, encodedByKey, cache) {
  if (typeof ctx.llm !== 'function' || !(ctx.env && ctx.env.ANTHROPIC_API_KEY)) return [];
  const first = (entry.figures || []).find((f) => f.official && f.official.src);
  if (!first) return [];
  const su = sourceUrls(entry, first.official, year);
  if (su.error) return [];
  const doc = await fetchDoc(ctx, cache, su.urls[0], su.headers);
  if (!doc.text) return [];
  const keys = (entry.figures || []).filter((f) => encodedByKey.has(f.key) && f.official && f.official.src === first.official.src).map((f) => f.key);
  if (!keys.length) return [];
  const prompt = `You read official tax publications. From the page text below (${su.urls[0]}), give the figures for tax year ${year} (${entry.jurisdiction}, single filer) as JSON: {"<key>": number or [numbers]}. Keys: ${JSON.stringify(keys)}. Rates as fractions (6.2% -> 0.062). Use null when the page does not state a figure. Reply with JSON only.\n\n${doc.text.slice(0, LLM_MAX_CHARS)}`;
  const answer = await ctx.llm(prompt, { maxTokens: 1200 });
  if (!answer) return [];
  let parsed;
  try { parsed = JSON.parse(String(answer).replace(/^[^{]*/, '').replace(/[^}]*$/, '')); } catch { return []; }
  const out = [];
  for (const k of keys) {
    const v = parsed[k];
    if (v == null) continue;
    const cmp = compareValues(encodedByKey.get(k), v, 0);
    if (!cmp.equal) out.push({ key: k, encoded: encodedByKey.get(k), official: v, unit: '', url: su.urls[0], note: 'advisory: LLM second opinion disagrees (not used for the status; verify by hand)' });
  }
  return out;
}

/** check(ctx): one Result per watch entry, never throws. */
export async function check(ctx) {
  let src;
  try { src = ctx.readText(TAX_FILE); } catch (err) {
    return WATCH.map((w) => result(w.id, w.mode || 'detect', 'error', { summary: `cannot read ${TAX_FILE}: ${err.message}` }));
  }
  let taxSources;
  try { taxSources = extractConst(src, 'TAX_SOURCES') || {}; } catch { taxSources = {}; }
  let params = readParams(src);
  if (!Object.keys(taxSources).length && ctx.root && !ctx.taxSourceText) {
    // TAX_SOURCES is not a plain literal any more: fall back to the module's exports.
    try {
      const mod = await import(pathToFileURL(path.join(ctx.root, TAX_FILE)).href);
      taxSources = mod.TAX_SOURCES || {};
      params = params || mod.TAX_PARAMS || null;
    } catch { /* reported per entry below */ }
  }
  const cache = new Map();
  const cov = coverage(src, WATCH, taxSources);
  const out = [];
  for (const entry of WATCH) {
    try {
      out.push(await checkEntry(ctx, entry, { src, taxSources, params, cache }));
    } catch (err) {
      out.push(result(entry.id, entry.mode || 'detect', 'error', { summary: `tax check failed: ${err && err.message}` }));
    }
  }
  // A jurisdiction without a watch entry is itself an alert, attached to the federal entry.
  if (cov.missing.length && out[0]) {
    out[0].findings.push({ key: 'coverage', encoded: cov.missing, official: null, unit: '', url: null, note: `validator: jurisdictions without a watch entry in scripts/refresh/tax-watch.js: ${cov.missing.join(', ')}` });
    if (out[0].status === 'ok') { out[0].status = 'flag'; out[0].summary = `${out[0].summary}; ${cov.missing.length} jurisdiction(s) have no watch entry`; }
  }
  return out;
}

// ---------------------------------------------------------------- registry entries (hand-off)

/** Registry entries for data/freshness.json, built from the watch list and the current source. */
export function registryEntries(src, { taxSources = extractConst(src, 'TAX_SOURCES') || {} } = {}) {
  const tsLine = (key) => {
    const at = src.search(/export const TAX_SOURCES\s*=/);
    const rel = src.slice(at).search(new RegExp(`\\n\\s*(?:'${key}'|${key})\\s*:`));
    return rel < 0 ? null : src.slice(0, at + rel + 1).split('\n').length;
  };
  return WATCH.map((w) => {
    const ts = taxSources[w.key] || {};
    const year = taxYearFromAsOf(ts.asOf, w.yearFrom || 'first') ?? w.taxYear;
    const owners = [];
    const extract = [];
    for (const f of w.figures || []) {
      const locs = Array.isArray(f.encoded) ? f.encoded : [f.encoded];
      const l = locs.find((x) => x && (x.const || x.block));
      if (!l) continue;
      const name = fill(l.const || l.block, year);
      const line = locatorLine(src, l, year);
      const own = `${TAX_FILE}:${line ?? '?'} ${name}`;
      if (!owners.includes(own)) owners.push(own);
      if (l.const && !extract.some((e) => e.const === name)) extract.push({ file: TAX_FILE, const: name, as: name });
    }
    owners.push(`${TAX_FILE}:${tsLine(w.key) ?? '?'} TAX_SOURCES['${w.key}']`);
    const first = w.sources && Object.values(w.sources)[0];
    const sourceUrl = first ? fill([].concat(first.urls || first.url)[0], year) : ts.url;
    const detectFigures = (w.figures || []).filter((f) => f.official && f.official !== 'manual' && f.official.extract !== 'manual').length;
    const asOfDate = Number.isFinite(year) ? `${year}-${w.yearStart || '01-01'}` : null;
    return {
      id: w.id,
      group: 'juice-tax',
      description: `Juice Score tax rule: ${w.jurisdiction} (TAX_SOURCES['${w.key}']${w.covers && w.covers.length ? `, also ${w.covers.join(', ')}` : ''})`,
      type: 'static-constant-from-a-source',
      owners,
      values: w.values || ts.name || '',
      consumers: CONSUMERS,
      source: { name: ts.name || (first && first.name) || w.jurisdiction, url: ts.url || sourceUrl, licence: w.licence || 'official publication; tax rates and thresholds are statutory facts' },
      detectSources: w.mode === 'manual' ? [] : Object.values(w.sources || {}).map((x) => ({ name: x.name, url: fill([].concat(x.urls || x.url)[0], year) })),
      asOf: asOfDate,
      taxYear: year,
      cadence: w.cadence || 'yearly',
      graceDays: w.graceDays ?? 60,
      mode: w.mode || 'detect',
      updater: 'scripts/refresh/tax.js',
      checklist: checklistFor(w, ts, year),
      validator: `${COMMON_VALIDATOR}${w.mode === 'manual' ? '' : ` ${detectFigures} figure(s) compared with the official page, plus ${(w.newYear || []).length} newer-tax-year signal(s).`}`,
      before: 'manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check',
      lastChecked: w.lastChecked || ts.reviewed || null,
      archive: true,
      ...(extract.length ? { extract } : {}),
      expectedPublication: w.expectedPublication || null,
      notes: [w.notes, w.manualReason ? `manual: ${w.manualReason}` : null, ts.verified === false ? 'TAX_SOURCES marks this rule unverified' : null, ts.approximate ? 'approximate model' : null].filter(Boolean).join('; ') || undefined,
    };
  });
}
