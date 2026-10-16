// Shared helpers for the 2026-10-11 salary audit (docs/process/salary-audit-data.md).
// Read-only: nothing here changes product code or data.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const imp = (...p) => import(pathToFileURL(path.join(ROOT, ...p)).href);
export const BIG_TECH = ['amazon', 'apple', 'google', 'meta', 'microsoft', 'nvidia', 'netflix'];
export const COMPARE = ['anduril', 'anthropic', 'openai'];

export function snapshotPath(slug) {
  const b = path.join(ROOT, 'data', 'beta', 'snapshots', `${slug}.json`);
  return fs.existsSync(b) ? b : path.join(ROOT, 'data', 'snapshots', `${slug}.json`);
}
export const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

/** Served list of a board in a build (dist/beta/api/jobs/<slug>.json, else dist/api/jobs), unpacked as the browser does. */
export async function servedJobs(dist, slug) {
  const api = await imp('public', 'api.js');
  for (const p of [path.join(dist, 'beta', 'api', 'jobs', `${slug}.json`), path.join(dist, 'api', 'jobs', `${slug}.json`)]) {
    if (fs.existsSync(p)) return { file: p, jobs: api.unpackJobs(readJson(p)) };
  }
  return null;
}

/** The published view computed the way scripts/build-static.js#readSnapshot does. */
export async function publishedView(snapshot) {
  const { relocateJobs, NORMALIZER_VERSION } = await imp('server', 'normalize.js');
  const { vetSalaries } = await imp('server', 'vet.js');
  const { rekeyBoardJobs } = await imp('server', 'keywords.js');
  const { upgradeStoredJobs } = await imp('server', 'sources', 'upgrade.js');
  const current = snapshot.normalizerVersion === NORMALIZER_VERSION;
  return vetSalaries(upgradeStoredJobs(current ? snapshot.jobs : relocateJobs(rekeyBoardJobs(snapshot.jobs).jobs)));
}

/** Seeded PRNG (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hyphen: '-', minus: '−', euro: '€', pound: '£', yen: '¥' };
const decode = (s) => String(s)
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
/** Plain text of a description (entities decoded twice: Greenhouse content is escaped HTML). */
export function plain(html) {
  return decode(decode(String(html || '')))
    .replace(/<(br|\/p|\/li|\/h\d|\/div)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t\u00a0]+/g, ' ');
}

// Amounts in pay text: "$141,000", "141000", "184,000.00", "€ 130,200.00", "47'000", "$153.6K".
const AMT_RE = /(\d{1,3}(?:[,'’ ]\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\s*([kK])?(?![\d])/g;
/** Every amount in the text, with its offset: [{ v, at, end }]. */
export function amounts(text) {
  const out = [];
  for (const m of String(text).matchAll(AMT_RE)) {
    let v = Number(m[1].replace(/[,'’ ]/g, ''));
    if (m[2]) v *= 1000;
    if (Number.isFinite(v)) out.push({ v, at: m.index, end: m.index + m[0].length });
  }
  return out;
}
const SEP_RE = /^[^\d\n]{0,30}$/;
const RANGE_WORD_RE = /[-–—~]|\bto\b|\band\b|\bthrough\b/i;
/** Posted (lo, hi) pairs in a text: two amounts joined by a range separator. */
export function postedPairs(text) {
  const a = amounts(text);
  const out = [];
  for (let i = 0; i + 1 < a.length; i++) {
    const gap = text.slice(a[i].end, a[i + 1].at);
    if (SEP_RE.test(gap) && RANGE_WORD_RE.test(gap) && a[i + 1].v >= a[i].v) out.push({ lo: a[i].v, hi: a[i + 1].v, at: a[i].at, end: a[i + 1].end });
  }
  return out;
}

/** The sentence (or line) of `text` around offset `at`, trimmed. "U.S.", "e.g." and "Sr." do not end a sentence. */
const ABBREV_RE = /(?:^|[^A-Za-z])(?:[A-Z]\.[A-Z]|[A-Z]|e\.g|i\.e|etc|vs|Sr|Jr|No)$/;
const endsAt = (text, i) => text[i] === '.' || text[i] === '!' || text[i] === '?'
  ? /\s/.test(text[i + 1] || ' ') && !(text[i] === '.' && ABBREV_RE.test(text.slice(Math.max(0, i - 4), i)))
  : false;
export function sentenceAt(text, at, end = at) {
  let s = at;
  while (s > 0 && text[s - 1] !== '\n' && !endsAt(text, s - 1)) s--;
  let e = end;
  while (e < text.length && text[e] !== '\n' && !endsAt(text, e)) e++;
  return text.slice(s, Math.min(text.length, e + 1)).replace(/\s+/g, ' ').trim();
}

const FACT = { hour: 2080, day: 260, week: 52, month: 12, year: 1 };
/** The salary's min/max in its posted interval (undoing toJobSalary's annualization). */
export function postedUnits(s) {
  if (s.statedAnnual) return { min: s.statedAnnual.monthly ?? s.min, max: s.max / (s.statedAnnual.paymentsPerYear || 1), f: 1 };
  const iv = s.originalInterval || 'year';
  const f = iv === 'term' ? null : FACT[iv] || 1;
  if (!f) return null;
  return { min: Math.round((s.min / f) * 100) / 100, max: Math.round((s.max / f) * 100) / 100, f };
}
const near = (a, b) => Math.abs(a - b) <= Math.max(0.011, Math.abs(b) * 0.0005);

/**
 * How the shown (min, max) relates to the posting's own text:
 *   'one-posted-range'  the pair is one range the text states
 *   'one-posted-figure' min = max, and the figure is in the text
 *   'span-of-ranges'    min and max are both posted, but from different ranges (a span our code made)
 *   'not-in-text'       a number is not in the text (structured fields, trimmed text, conversion)
 */
export function textProvenance(s, text) {
  const u = postedUnits(s);
  if (!u) return { kind: 'term', pairs: [] };
  const pairs = postedPairs(text);
  const nums = amounts(text).map((a) => a.v);
  const one = pairs.find((p) => near(p.lo, u.min) && near(p.hi, u.max));
  if (one) return { kind: 'one-posted-range', pair: one, pairs };
  if (near(u.min, u.max) && nums.some((v) => near(v, u.min))) return { kind: 'one-posted-figure', pairs };
  const loP = pairs.find((p) => near(p.lo, u.min));
  const hiP = pairs.find((p) => near(p.hi, u.max));
  if (loP && hiP) return { kind: 'span-of-ranges', lo: loP, hi: hiP, pairs };
  if (nums.some((v) => near(v, u.min)) && nums.some((v) => near(v, u.max))) return { kind: 'span-of-ranges', pairs };
  return { kind: 'not-in-text', pairs };
}

export function quantile(sorted, q) {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}
export const r3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);
