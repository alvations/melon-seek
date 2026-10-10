// melon-seek "Compstimate" — a Zestimate-style pay estimate for any role,
// computed from similarity-weighted comparable postings on the loaded board.
//
//   estimateComp(allJobs, { title, location, seniority, department, excludeId, excludeIds })
//     -> { low, mid, high, currency: "USD", confidence, n, comparables, scores,
//          explanation, query }
//   compstimateForJob(allJobs, job, { excludeIds }?)  // estimate for one posting (excludes itself)
//   backtest(jobs, { seed = 20261002, maxN = 500 })
//     -> { medianAbsPctError, within10Pct, n, seed, skipped }   // percents, 1 decimal
//   accuracyLine(meta) -> "Typically within ±8% (tested on 500 listed salaries, Oct 2026)" | null
//   displayConfidence(result, meta) -> "High"|"Medium"|"Low" (Low when backtest error > 25%)
//   createCompstimateWidget(container, { getJobs, getMeta, onSelect, query })
//     -> { update(allJobs?, meta?), setQuery(partial), getQuery(), getResult(), destroy() }
//
// Pure logic (everything except createCompstimateWidget) runs in Node with no
// DOM at import time. The role taxonomy is in roles.js (no imports at all).

import {
  salaryUSD, weightedPercentile, percentile, median, formatMoney, plural, h, uid, locationKey,
  payLocations, isOTE, payKind, isInternLike, countryName, countryInSentence, OTE_LABEL,
} from './shared.js';
import {
  normalizeTitle, familySim, rolePart, roleFamily, FAMILY_LABELS, SENIORITY_LADDER,
  levelLabel, levelStated, SENIORITY_DISPLAY_ORDER,
} from './roles.js';
import { compstimateAsOfText } from './freshness.js';

export { percentile, weightedPercentile, salaryUSD, toUSD, FX_FALLBACK } from './shared.js';
// Role taxonomy lives in roles.js (no imports, Node-safe); re-exported for callers.
export {
  normalizeTitle, roleFamily, inferSeniority, expandTitle, rolePart, familySim,
  FAMILY_LABELS, SENIORITY_LADDER,
} from './roles.js';

// ---------------------------------------------------------------------------
// Similarity
// ---------------------------------------------------------------------------

const LEVEL_INDEX = { Intern: 0, Entry: 1, Mid: 2, Senior: 3, Manager: 3.5, 'Staff+': 4, 'Director+': 5 };

/**
 * 1 for the same level, decaying with ladder distance (Manager sits between
 * Senior and Staff+). With no level asked for, interns and executives are
 * down-weighted (they are separate pay classes) and everyone else counts fully.
 */
export function senioritySim(a, b) {
  if (!a) return b === 'Intern' ? 0.25 : b === 'Director+' ? 0.5 : 1;
  if (!b) return 0.5;
  const ia = LEVEL_INDEX[a], ib = LEVEL_INDEX[b];
  if (ia == null || ib == null) return a === b ? 1 : 0.5;
  const d = Math.abs(ia - ib);
  return d === 0 ? 1 : d <= 0.5 ? 0.55 : d <= 1 ? 0.35 : d <= 1.5 ? 0.2 : d <= 2 ? 0.1 : 0.03;
}

function deptSim(q, d) {
  if (!q) return 1;
  if (!d) return 0.7;
  return q.trim().toLowerCase() === String(d).trim().toLowerCase() ? 1 : 0.5;
}

/**
 * Resolve a free-text location ("San Francisco", "London, UK", "US", "Remote")
 * against the locations present in the data. Returns { key, city, region,
 * country, remote } or null when the query is empty.
 */
export function resolveLocation(query, jobs = []) {
  const q = String(query || '').trim();
  if (!q) return null;
  const lq = q.toLowerCase();
  if (/\bremote\b/.test(lq)) {
    const m = q.match(/\(([A-Za-z]{2})\)/);
    return { key: 'Remote', city: null, region: null, country: m ? m[1].toUpperCase() : null, remote: true };
  }
  let regionHit = null, countryHit = null;
  for (const j of jobs) {
    for (const l of j.locations || []) {
      if (l.remote) continue;
      const names = [l.city, l.name].filter(Boolean).map((s) => s.toLowerCase());
      if (names.includes(lq)) return { key: locationKey(l), city: l.city || null, region: l.region || null, country: l.country || null, remote: false };
      if (!countryHit && l.country && l.country.toLowerCase() === lq) countryHit = { key: q, city: null, region: null, country: l.country, remote: false };
      if (!regionHit && l.region && l.region.toLowerCase() === lq) regionHit = { key: q, city: null, region: l.region, country: l.country || null, remote: false };
    }
  }
  if (countryHit) return countryHit;
  if (regionHit) return regionHit;
  if (/^[a-z]{2}$/i.test(q)) return { key: q, city: null, region: null, country: q.toUpperCase(), remote: false };
  return { key: q, city: q.split(',')[0].trim(), region: null, country: null, remote: false };
}

function sameText(a, b) { return !!a && !!b && String(a).toLowerCase() === String(b).toLowerCase(); }

/**
 * Location similarity in [0,1] between a resolved query location and a job. Only the locations
 * the posting's pay applies to count (payLocations): a US range on a role also listed in Sydney
 * says nothing about Sydney.
 */
export function locationSim(ql, job) {
  return ql ? locSim(ql, payLocations(job), job) : 1;
}

function locSim(ql, locs, job) {
  if (!ql) return 1;
  if (!locs.length) return job.remote && ql.remote ? 1 : 0.5;
  let best = 0;
  for (const l of locs) {
    let s;
    if (ql.remote) {
      s = l.remote ? 1 : (!ql.country || sameText(l.country, ql.country)) ? 0.6 : 0.3;
    } else if (ql.city) {
      if (!l.remote && (sameText(l.city, ql.city) || sameText(l.name, ql.city) || sameText(locationKey(l), ql.key))) s = 1;
      else if (ql.country && sameText(l.country, ql.country)) s = !l.remote && ql.region && sameText(l.region, ql.region) ? 0.75 : 0.6;
      else if (!ql.country) s = 0.4;
      else s = 0.25;
    } else if (ql.region) {
      s = sameText(l.region, ql.region) ? 1 : sameText(l.country, ql.country) ? 0.6 : 0.25;
    } else {
      s = sameText(l.country, ql.country) ? 1 : 0.25;
    }
    if (s > best) best = s;
  }
  return best;
}

/** Inverse document frequency of title tokens across a pool of normalized titles. */
function buildIdf(normed) {
  const df = new Map();
  for (const n of normed) for (const t of n.tokens) df.set(t, (df.get(t) || 0) + 1);
  const N = normed.length;
  return (t) => Math.log(1 + N / (1 + (df.get(t) || 0)));
}

// Prepared, read-only index per jobs array (keyed by array identity + length),
// so repeated estimates over the same board (widget typing, backtest) don't
// re-normalize every title. Callers must not mutate items of a cached array.
const INDEX_CACHE = new WeakMap();

function buildIndex(jobs) {
  const pool = [];
  for (const job of jobs) {
    if (!job) continue;
    const pay = salaryUSD(job);
    if (!pay) continue;
    const locs = payLocations(job);
    pool.push({
      job, pay, norm: normalizeTitle(job.title, { department: job.department }), locs,
      countries: new Set(locs.map((l) => String(l?.country || '').toUpperCase()).filter(Boolean)),
    });
  }
  const idf = buildIdf(pool.map((p) => p.norm));
  for (const p of pool) {
    p.tset = new Set(p.norm.tokens);
    p.jSum = p.norm.tokens.reduce((a, t) => a + idf(t), 0);
  }
  return { pool, idf, jobs };
}

function indexFor(allJobs) {
  const jobs = Array.isArray(allJobs) ? allJobs : [];
  if (!Array.isArray(allJobs)) return buildIndex(jobs);
  const hit = INDEX_CACHE.get(allJobs);
  if (hit && hit.length === allJobs.length) return hit.index;
  const index = buildIndex(jobs);
  INDEX_CACHE.set(allJobs, { length: allJobs.length, index });
  return index;
}

/** IDF-weighted overlap: 0.7 * coverage of the query's tokens + 0.3 * precision. */
function tokenSim(qTokens, qSum, p, idf) {
  if (!qTokens.length || !p.jSum) return 0;
  let inter = 0;
  for (const t of qTokens) if (p.tset.has(t)) inter += idf(t);
  return 0.7 * (inter / qSum) + 0.3 * (inter / p.jSum);
}

// Selection thresholds.
const MIN_WEIGHT = 0.02;        // absolute floor for a comparable
const REL_WEIGHT = 0.12;        // ... and at least 12% of the best match's weight
const MAX_COMPARABLES = 500;     // safety cap only; the relative cut does the real work
const LOW_P = 0.15, HIGH_P = 0.85;

/**
 * Similarity-weighted pay estimate. See docs/process/product.md for the formula.
 * Jobs without a usable salary (or with an unknown currency) are ignored.
 * Returns low/mid/high rounded to $1K (null when there is nothing to compare).
 *
 * Like with like (persona review 2026-10-10, docs/process/fix-estimates.md):
 * - Place: a query location with a country uses only postings whose pay applies in that country
 *   (payLocations). Pay from another country is never used; with none, there is no estimate
 *   (reason 'no-local-pay').
 * - Level: an Intern query (or `internLike: true`) uses only internships and fixed-term pay;
 *   any other query leaves them out (reason 'no-intern-pay' when there are none). "Level not
 *   stated" (the stored 'Mid' default) is never named as a level in the basis line.
 * - Kind: on-target earnings and base pay are never pooled. The estimate uses whichever kind
 *   carries more of the similarity weight, and says which (`kind`: 'base' | 'ote').
 * `basis` describes the comparables actually used ({ level, place, fallback }); see basisParts().
 */
export function estimateComp(allJobs, query = {}) {
  const q = {
    title: String(query.title || '').trim(),
    location: String(query.location || '').trim(),
    seniority: String(query.seniority || '').trim(),
    department: String(query.department || '').trim(),
    excludeId: query.excludeId ?? null,
  };
  const excl = query.excludeIds ? new Set(query.excludeIds) : null;
  // `within`: restrict comparables to these job ids (the Insights pool) while location
  // resolution and IDF still use the whole board, so an unrestricted pool gives exactly
  // the same numbers as no restriction (drawer = Insights, Rule 8).
  const within = query.within ? (query.within instanceof Set ? query.within : new Set(query.within)) : null;
  const qn = normalizeTitle(q.title, { department: q.department || null });
  const level = q.seniority || qn.seniority || '';
  const asked = levelStated(level) ? level : ''; // 'Mid' = level not stated: never named as a level
  const internQ = typeof query.internLike === 'boolean' ? query.internLike : level === 'Intern';
  const ix = indexFor(allJobs);
  const ql = resolveLocation(q.location, ix.jobs);
  const country = ql && ql.country ? String(ql.country).toUpperCase() : null;
  const used = { ...q, seniority: level, family: qn.family, tokens: qn.tokens, location: ql?.key || '' };

  const empty = (explanation, reason) => ({
    low: null, mid: null, high: null, currency: 'USD', confidence: 'Low', n: 0,
    comparables: [], scores: [], explanation, query: used, reason, kind: null, basis: null, country,
  });
  const hasTitle = qn.tokens.length > 0;
  const qSum = qn.tokens.reduce((a, t) => a + ix.idf(t), 0);
  const scored = [];
  let candidates = 0, sameTerm = 0;
  for (const p of ix.pool) {
    if (q.excludeId != null && p.job.id === q.excludeId) continue;
    if (excl && excl.has(p.job.id)) continue;
    if (within && !within.has(p.job.id)) continue;
    candidates += 1;
    if (isInternLike(p.job) !== internQ) continue; // never across the intern / full-time line
    sameTerm += 1;
    if (country && !p.countries.has(country)) continue; // never another country's pay (payLocations)
    const ts = hasTitle ? 0.7 * tokenSim(qn.tokens, qSum, p, ix.idf) + 0.3 * familySim(qn.family, p.norm.family) : 1;
    // Weighting keeps "no level word" close to "no level word" (a title feature: the backtest error
    // rises from 10.7% to 13.3% at Anduril without it); the basis line never calls it a level.
    const w = ts * ts * senioritySim(level, p.job.seniority) * deptSim(q.department, p.job.department) * locSim(ql, p.locs, p.job);
    scored.push({ job: p.job, pay: p.pay, titleSim: ts, w });
  }
  if (!scored.length) {
    if (!candidates) return empty('No roles on this board publish pay, so there is nothing to compare against yet.', 'no-pay');
    if (!sameTerm) {
      return empty(internQ
        ? 'No internship or fixed-term role here lists pay, and full-time pay is not used for an internship.'
        : 'No full-time role here lists pay, and internship pay is not used for a full-time role.', internQ ? 'no-intern-pay' : 'no-fulltime-pay');
    }
    return empty(`No similar role in ${countryInSentence(country)} lists pay here, and pay from other countries is not used.`, 'no-local-pay');
  }
  const order = (a, b) => b.w - a.w || String(b.job.updatedAt || '').localeCompare(String(a.job.updatedAt || '')) || String(a.job.id).localeCompare(String(b.job.id));
  scored.sort(order);
  if (!(scored[0].w >= MIN_WEIGHT)) {
    return empty(q.title
      ? `No roles with published pay look comparable to “${q.title}”. Try a broader title.`
      : 'No comparable roles with published pay.', 'no-match');
  }
  // One kind of pay: on-target earnings are never pooled with base pay.
  const firstCut = Math.max(MIN_WEIGHT, REL_WEIGHT * scored[0].w);
  let wOte = 0, wBase = 0;
  for (const p of scored) { if (p.w < firstCut) break; if (isOTE(p.job)) wOte += p.w; else wBase += p.w; }
  const kind = wOte > wBase ? 'ote' : 'base';
  const sameKind = wOte > 0 ? scored.filter((p) => payKind(p.job) === kind) : scored;
  const best = sameKind[0].w;
  const cut = Math.max(MIN_WEIGHT, REL_WEIGHT * best);
  const comps = [];
  for (const p of sameKind) { if (p.w < cut || comps.length >= MAX_COMPARABLES) break; comps.push(p); }

  const mids = comps.map((p) => [p.pay.mid, p.w]);
  const band = [];
  for (const p of comps) band.push([p.pay.min, p.w * 0.25], [p.pay.mid, p.w * 0.5], [p.pay.max, p.w * 0.25]);
  let mid = weightedPercentile(mids, 0.5);
  let low = weightedPercentile(band, LOW_P);
  let high = weightedPercentile(band, HIGH_P);
  low = Math.min(low, mid); high = Math.max(high, mid);
  const r = (x) => Math.round(x / 1000) * 1000;
  mid = r(mid); low = r(low); high = r(high);

  const sumW = comps.reduce((s, p) => s + p.w, 0);
  const sumW2 = comps.reduce((s, p) => s + p.w * p.w, 0);
  const nEff = (sumW * sumW) / sumW2;
  const top = comps.slice(0, 5);
  const topSim = top.reduce((s, p) => s + p.w, 0) / top.length;
  const spread = mid > 0 ? (high - low) / mid : Infinity;
  // No title = a board-wide figure, never more than Low confidence.
  const confidence = !hasTitle ? 'Low'
    : nEff >= 5 && topSim >= 0.5 && spread <= 0.6 ? 'High'
    : nEff >= 2 && topSim >= 0.25 && spread <= 1 ? 'Medium' : 'Low';

  const close = comps.filter((p) => p.titleSim >= 0.75).length;
  const converted = comps.filter((p) => p.pay.converted).length;
  const what = [
    hasTitle ? `“${q.title}”` : 'any role',
    asked ? `at ${asked} level` : '',
    ql ? (ql.remote ? 'for remote work' : `in or near ${ql.key}`) : '',
    q.department ? `in ${q.department}` : '',
  ].filter(Boolean).join(' ');
  const detail =
    `Low and High leave out the lowest and highest ${LOW_P * 100}% of their posted pay` +
    (converted ? `; ${converted} ${converted === 1 ? 'range' : 'ranges'} in other currencies converted at approximate rates.` : '.') +
    (kind === 'ote' ? ' These roles post on-target earnings (base plus commission at target), so this is too.' : '') +
    (!hasTitle ? ' Add a role title for a sharper estimate.'
      : confidence === 'Low' ? ' Few close matches, so treat this as a rough guide.' : '');
  const explanation =
    `Weighted by similarity to ${what} across ${plural(comps.length, 'salaried role')}` +
    (hasTitle ? ` (${close} with a closely matching title). ` : '. ') + detail;

  return {
    low, mid, high, currency: 'USD', confidence, n: comps.length,
    comparables: comps.slice(0, 5).map((p) => p.job),
    scores: comps.slice(0, 5).map((p) => Math.round(p.w * 100) / 100),
    explanation, detail, query: used,
    reason: null, kind, country,
    basis: describeComparables(comps, { asked, internQ, ql, country }),
  };
}

/** Does this pay location sit at the query's place (city / name / app key)? */
function atPlace(l, ql) {
  if (!l || l.remote) return false;
  return sameText(l.city, ql.city) || sameText(l.name, ql.city) || sameText(locationKey(l), ql.key) || sameText(locKeyOf(l), ql.key);
}

/**
 * What the comparables actually are, for the basis line (P-2): their level relative to the level
 * asked for, and their place relative to the place asked for. Strings, or null for "not asked".
 */
function describeComparables(comps, { asked, internQ, ql, country }) {
  const W = comps.reduce((s, p) => s + p.w, 0) || 1;
  let lvl = null;
  if (internQ) {
    lvl = comps.every((p) => p.job.seniority === 'Intern') ? 'Intern' : 'internships and fixed-term roles';
  } else if (asked) {
    const share = comps.reduce((s, p) => s + (p.job.seniority === asked ? p.w : 0), 0) / W;
    lvl = share > 0.999 ? asked : share >= 0.5 ? `mostly ${asked}` : 'mixed levels';
  }
  let place = null, fallback = null, missing = null;
  if (ql) {
    const name = country ? countryInSentence(country) : '';
    const pl = (p) => payLocations(p.job);
    if (ql.remote) {
      const remote = comps.filter((p) => pl(p).some((l) => l.remote)).length;
      place = remote === comps.length ? (country ? `remote in ${name}` : 'remote')
        : country ? `remote and on-site in ${name}` : 'remote and on-site';
    } else if (ql.city) {
      const here = comps.filter((p) => pl(p).some((l) => atPlace(l, ql))).length;
      if (here === comps.length) place = ql.key;
      else if (here > 0) place = country ? `${ql.key} and elsewhere in ${name}` : `${ql.key} and other places`;
      else {
        fallback = 'city';
        missing = ql.key;
        place = country ? `elsewhere in ${name} (none in ${ql.key} lists pay)` : `other places (none in ${ql.key} lists pay)`;
      }
    } else if (ql.region) {
      const here = comps.filter((p) => pl(p).some((l) => sameText(l.region, ql.region))).length;
      place = here === comps.length ? ql.region : country ? `${ql.region} and elsewhere in ${name}` : ql.region;
    } else if (country) {
      place = countryName(country);
    }
  }
  return { level: lvl, place, fallback, missing };
}

/** The basis parts of an estimate: [level, place] as far as the query asked for them. */
export function basisParts(result) {
  const b = result && result.basis;
  if (!b) return [];
  return [b.level, b.place].filter(Boolean);
}

/** The app's location key (public/app.js locKey): city, or the remote entry's own name ("Remote (US)"). */
export function locKeyOf(l) {
  if (!l) return null;
  return l.remote ? l.name || 'Remote' : l.city || l.name || 'Unknown';
}

/**
 * The location a posting is estimated for: its first on-site key, else its first remote key,
 * among the locations its pay applies to (all of them when it lists no pay).
 */
export function jobLocationQuery(job) {
  const locs = job ? payLocations(job) : [];
  const onsite = locs.find((l) => !l.remote);
  if (onsite) return locKeyOf(onsite);
  const remote = locs.find((l) => l.remote);
  return remote ? locKeyOf(remote) : job?.remote ? 'Remote' : '';
}

/**
 * Compstimate for one posting (the drawer, and the backtest), excluding the posting itself.
 * Title, level and location only; no department and no filters (task force Rule 8), so
 * Insights with the same three fields edited shows the same numbers.
 * `opts.excludeIds` drops more postings (the backtest passes the job's duplicates).
 */
export function compstimateForJob(allJobs, job, opts = {}) {
  if (!job) return estimateComp(allJobs, {});
  return estimateComp(allJobs, {
    title: job.title, seniority: job.seniority || '', department: '', location: jobLocationQuery(job),
    excludeId: job.id, excludeIds: opts.excludeIds || null, internLike: isInternLike(job),
  });
}

// ---------------------------------------------------------------------------
// Backtest (published accuracy, ROADMAP F3)
// ---------------------------------------------------------------------------

/** Seed the build and server use (2026-10-02). */
export const BACKTEST_SEED = 20261002;
/** Above this median absolute % error, estimates are labelled "Low confidence". */
export const ACCURACY_LOW_THRESHOLD = 25;

/** mulberry32: tiny deterministic PRNG in [0,1). */
function rng(seed) {
  let a = (Number(seed) >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Seeded leave-one-out backtest of Compstimate. Pure; no DOM.
 *
 * Vetted jobs are those with `salary !== null` and a usable USD salary. They are
 * sorted by id (so the input order doesn't matter), and `maxN` of them are drawn
 * with a seeded partial Fisher–Yates. Each drawn job is estimated with
 * compstimateForJob() from all *other* vetted jobs (title, level, department,
 * first on-site city), and its error is |estimate.mid − posted mid| / posted mid.
 * "Other" also excludes the job's duplicates: by default (`dedupe: "title"`) every
 * vetted job with the same normalized title (level words, punctuation and
 * abbreviations normalized) AND an identical posted range (min, max, currency),
 * in ANY location. One req listed per city would otherwise find an exact twin and
 * make the error look near zero. `dedupe: "none"` is plain leave-one-out (for
 * diagnostics); `"title+location"` only drops twins in the same location set;
 * `dedupe: "role"` is a stress test that also drops postings of
 * the same role segment ("Backend Software Engineer - Defense" vs "- Apps") with
 * an identical range.
 *
 * @param {Job[]} jobs
 * @param {{ seed?: number, maxN?: number, dedupe?: "title"|"title+location"|"none"|"role" }} [opts]
 * @returns {{ medianAbsPctError: number|null, within10Pct: number|null, n: number, seed: number, skipped: number }}
 *   medianAbsPctError and within10Pct are PERCENT numbers with one decimal
 *   (14.2 means 14.2%); n is the number of jobs that got an estimate; skipped
 *   counts drawn jobs with no comparable to estimate from.
 */
export function backtest(jobs, { seed = BACKTEST_SEED, maxN = 500, dedupe = 'title' } = {}) {
  const vetted = (Array.isArray(jobs) ? jobs : []).filter((j) => j && j.salary != null && salaryUSD(j))
    .slice().sort((a, b) => (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0));
  const k = Math.max(0, Math.min(vetted.length, Math.floor(Number(maxN) || 0)));
  const order = vetted.map((_, i) => i);
  const rand = rng(seed);
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(rand() * (order.length - i));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const range = (j) => `${j.salary.min}|${j.salary.max}|${String(j.salary.currency || 'USD').toUpperCase()}`;
  const titleKey = (t) => normalizeTitle(t).tokens.slice().sort().join(' ');
  const place = (j) => (j.locations || []).map((l) => l.remote ? 'remote' : String(l.city || l.name || '').toLowerCase()).sort().join('+');
  const dupKey = dedupe === 'none' ? (j) => `id:${j.id}`
    : dedupe === 'role' ? (j) => `${titleKey(rolePart(j.title))}|${range(j)}`
    : dedupe === 'title+location' ? (j) => `${titleKey(j.title)}|${place(j)}|${range(j)}`
    : (j) => `${titleKey(j.title)}|${range(j)}`;
  const groups = new Map();
  for (const j of vetted) {
    const key = dupKey(j);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(j.id);
  }
  const errs = [];
  let skipped = 0;
  for (const i of order.slice(0, k)) {
    const job = vetted[i];
    const est = compstimateForJob(vetted, job, { excludeIds: groups.get(dupKey(job)) });
    const actual = salaryUSD(job).mid;
    if (est.mid == null || !(actual > 0)) { skipped += 1; continue; }
    errs.push(Math.abs(est.mid - actual) / actual);
  }
  const r1 = (x) => Math.round(x * 1000) / 10;
  return {
    medianAbsPctError: errs.length ? r1(median(errs)) : null,
    within10Pct: errs.length ? r1(errs.filter((e) => e <= 0.10 + 1e-9).length / errs.length) : null,
    n: errs.length,
    seed: Number(seed),
    skipped,
  };
}

/** Pull { medianAbsPctError, n, ... } out of a response meta, a meta.compstimate object, or null. */
export function accuracyFrom(meta) {
  if (!meta || typeof meta !== 'object') return null;
  const acc = 'compstimate' in meta ? meta.compstimate : meta;
  return acc && Number.isFinite(acc.medianAbsPctError) && acc.n > 0 ? acc : null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Oct 2026" for the backtest's computedAt (the data it was measured on), or null. */
export function accuracyAsOf(meta) {
  const acc = accuracyFrom(meta);
  const t = acc && acc.computedAt ? Date.parse(acc.computedAt) : NaN;
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * "Typically within ±14% (tested on 500 listed salaries, Oct 2026)", or null without a
 * backtest. The month is the backtest's computedAt (left out when it is missing).
 */
export function accuracyLine(meta) {
  const acc = accuracyFrom(meta);
  if (!acc) return null;
  const asOf = accuracyAsOf(meta);
  // Floor at ±1%: boards with standard pay bands can back-test near 0%, and "±0%" reads as broken.
  return `Typically within ±${Math.max(1, Math.round(acc.medianAbsPctError))}% (tested on ${plural(acc.n, 'listed salary', 'listed salaries')}${asOf ? `, ${asOf}` : ''})`;
}

/** True when the board's backtest error is above ACCURACY_LOW_THRESHOLD (estimates are then "Low confidence"). */
export function isLowAccuracy(meta) {
  const acc = accuracyFrom(meta);
  return !!acc && acc.medianAbsPctError > ACCURACY_LOW_THRESHOLD;
}

/** The confidence to display: the estimate's own, forced to "Low" when the board's backtest error is above 25%. */
export function displayConfidence(result, meta) {
  if (!result || result.mid == null) return 'Low';
  return isLowAccuracy(meta) ? 'Low' : result.confidence;
}

// ---------------------------------------------------------------------------
// Form option helpers (pure, exported for tests)
// ---------------------------------------------------------------------------

const LEVEL_PREFIX = /^(?:(?:senior\+?|sr\.?|staff\+?|principal|lead|junior|jr\.?|associate|head of|director of|distinguished)\s+)+/i;

const GENERIC_ROLE = /^(?:manager|senior manager|director|senior director|lead|head|engineer|associate|specialist|analyst|staff|member|principal|vp|chief)$/i;

/** Datalist suggestions: role titles without level prefixes, most common first. */
export function titleSuggestions(jobs, limit = 250) {
  const count = new Map();
  const bump = (t) => { if (t) count.set(t, (count.get(t) || 0) + 1); };
  for (const j of jobs || []) {
    const t = String(j.title || '').replace(LEVEL_PREFIX, '').replace(/\s+(?:I{1,3}|IV|[1-4])$/, '').trim();
    if (!t) continue;
    const role = t.split(/\s*(?:,|\s[-–—|:]\s|\()\s*/)[0].trim();
    // A bare level/generic word ("Manager, Revenue Accounting" -> "Manager") is not a role title.
    if (!GENERIC_ROLE.test(role)) bump(role);
    if (role !== t) bump(t);
  }
  return [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([t]) => t);
}

/** Location options [{ value, label, count }] sorted by count (Remote included). */
export function locationOptions(jobs) {
  const count = new Map();
  for (const j of jobs || []) {
    const keys = new Set((j.locations || []).map(locKeyOf).filter(Boolean));
    if (!keys.size && j.remote) keys.add('Remote');
    for (const k of keys) count.set(k, (count.get(k) || 0) + 1);
  }
  return [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([value, n]) => ({ value, label: value, count: n }));
}

/** A representative, searchable title per role family (used to prefill from a family filter). */
export const FAMILY_TITLES = Object.freeze({
  swe: 'Software Engineer', ml: 'Research Engineer', data: 'Data Scientist', security: 'Security Engineer',
  'eng-manager': 'Engineering Manager', hardware: 'Hardware Engineer', manufacturing: 'Manufacturing Technician',
  'supply-chain': 'Supply Chain Manager', facilities: 'Facilities Manager', 'field-ops': 'Field Operations',
  product: 'Product Manager', design: 'Product Designer', program: 'Technical Program Manager',
  bizops: 'Business Operations', solutions: 'Solutions Architect', sales: 'Account Executive',
  support: 'Customer Success Manager', marketing: 'Marketing Manager', legal: 'Counsel', policy: 'Policy Manager',
  'trust-safety': 'Trust and Safety Analyst', people: 'Recruiter', finance: 'Finance Manager',
  it: 'IT Systems Engineer', admin: 'Executive Assistant', 'ai-training': 'AI Tutor',
});

// ---------------------------------------------------------------------------
// Inputs from the app's filters (Compstimate task force spec, §3.2)
// ---------------------------------------------------------------------------

const arr = (v) => (Array.isArray(v) ? v.filter((x) => x != null && x !== '') : v ? [v] : []);
const famOf = (j) => j._family ?? roleFamily(j.title || '', j);
const deptOf = (j) => j.department || 'No department';
// Location keys of the places a posting's pay applies to (payLocations): a US range listed in
// Sydney is not a Sydney comparable (shared decision 2, persona review 2026-10-10).
const keysOf = (j) => payLocations(j).map(locKeyOf);

/**
 * Pure: the Insights Compstimate's pool, query and copy for the current filters
 * and the user's per-field edits.
 *
 * Fields follow the filters until edited (Rule 1). Each field owns some filters:
 * Title owns department `d` and role family `rf`; Location owns `l` and remote `r`;
 * Level owns seniority `s`. The pool (Rule 3) is the salaried board jobs that pass the
 * filters of every *following* field (same matching as app.js failures()); an edited
 * field's filters are ignored. Other filters (search, chips, salary, ...) never narrow
 * the pool; `visible` (jobs passing all non-salary filters) only picks the auto title.
 *
 * @param {{ d?, rf?, l?, r?, s? }} state  the app's filter values
 * @param {{ title?: string, location?: string, seniority?: string }} edits  a key present = edited
 * @param {Job[]} jobs  the whole board
 * @param {{ visible?: Job[], company?: string }} [opts]
 * @returns {{ pool: Job[], query: object, autoTitle: boolean, auto: string, filtered: boolean,
 *   basisParts: string[], display: { location: string, seniority: string }, labels: { location: string, seniority: string } }}
 */
export function compstimateInputs(state = {}, edits = {}, jobs = [], { visible = null } = {}) {
  const F = { d: arr(state.d), rf: state.rf || '', l: arr(state.l), r: state.r || 'any', s: arr(state.s) };
  const ed = edits || {};
  const titleF = !('title' in ed), locF = !('location' in ed), levF = !('seniority' in ed);
  const passTitle = (j) => (!F.d.length || F.d.includes(deptOf(j))) && (!F.rf || famOf(j) === F.rf);
  const passLoc = (j) => (!F.l.length || keysOf(j).some((k) => F.l.includes(k)))
    && (F.r !== 'remote' || j.remote) && (F.r !== 'onsite' || (j.locations || []).some((l) => !l.remote));
  const passLev = (j) => !F.s.length || F.s.includes(j.seniority || 'Unspecified');
  const salaried = (jobs || []).filter((j) => j && salaryUSD(j));
  const pool = salaried.filter((j) => (!titleF || passTitle(j)) && (!locF || passLoc(j)) && (!levF || passLev(j)));

  // Auto title: most common role among visible jobs that are also in the pool (so it always fits
  // the level/location in effect), else the most common role in the pool.
  const inPool = new Set(pool.map((j) => j.id));
  const vis = Array.isArray(visible) ? visible.filter((j) => j && inPool.has(j.id)) : pool;
  // A role-family filter names the role: estimate the family's representative title
  // (e.g. "Software Engineer"), not whichever single posting title is most common.
  const auto = (F.rf && FAMILY_TITLES[F.rf]) || titleSuggestions(vis, 1)[0] || titleSuggestions(pool, 1)[0] || '';
  const title = titleF ? auto : String(ed.title || '');
  const location = locF ? (F.l.length === 1 ? F.l[0] : !F.l.length && F.r === 'remote' ? 'Remote' : '') : String(ed.location || '');
  const seniority = levF ? (F.s.length === 1 && F.s[0] !== 'Unspecified' ? F.s[0] : '') : String(ed.seniority || '');

  const titleParts = titleF ? [...F.d, ...(F.rf ? [FAMILY_LABELS[F.rf] || F.rf] : [])] : [];
  const lvl = (s) => (s === 'Unspecified' ? s : levelLabel(s));
  const levParts = (levF ? F.s : seniority ? [seniority] : []).map(lvl);
  const locParts = locF ? [...F.l, ...(F.r === 'remote' ? ['Remote'] : F.r === 'onsite' ? ['On-site'] : [])] : location ? [location] : [];
  const filtered = (titleF && titleParts.length > 0) || (levF && F.s.length > 0) || (locF && locParts.length > 0);
  // Pool restrictions the estimate's own basis does not describe (P-2: the basis line names the
  // comparables' level and place, not the filter's): a stated single level or a single place is
  // described from the comparables; several levels, "level not stated", remote or on-site come
  // from the filters, which every comparable passes.
  const levPool = levF && F.s.length && !(F.s.length === 1 && levelStated(F.s[0]) && F.s[0] !== 'Unspecified') ? F.s.map(lvl) : [];
  const locPool = locF && !(F.l.length === 1) ? locParts : [];

  const locLabel = locF && F.l.length > 1 ? `${F.l.join(' or ')} (filters)`
    : locF && !F.l.length && F.r === 'remote' ? 'Remote (filters)'
    : locF && F.l.length !== 1 && F.r === 'onsite' ? 'On-site (filters)' : 'Any location';
  const levLabel = levF && (F.s.length > 1 || (F.s.length === 1 && F.s[0] === 'Unspecified')) ? `${F.s.map(lvl).join(' or ')} (filters)` : 'Any level';

  return {
    pool,
    query: { title, location, seniority, department: '' },
    autoTitle: titleF,
    auto,
    filtered,
    basisParts: [...titleParts, ...levParts, ...locParts],
    poolParts: [...titleParts, ...levPool, ...locPool],
    display: { location: locF ? (F.l.length === 1 ? F.l[0] : '') : location, seniority: levF ? seniority : String(ed.seniority || '') },
    labels: { location: locLabel, seniority: levLabel },
  };
}

/** "Based on 37 similar roles at Anthropic, Sales · London" (Rule 7). */
export function basisLine(n, company, parts = []) {
  return `Based on ${plural(n, 'similar role')} at ${company || 'this company'}${parts.length ? `, ${parts.join(' · ')}` : ''}`;
}

/** Below this many comparables (or pool size) no figure is shown (Rule 6). */
export const MIN_COMPARABLES = 3;

/** Insights estimate for compstimateInputs(): the board, restricted to the pool. */
export function estimateForInputs(jobs, inputs) {
  const r = estimateInputsResult(jobs, inputs);
  return r.mid == null || r.n < MIN_COMPARABLES ? null : r;
}

/**
 * The Insights estimate with its reason kept: estimateComp() restricted to the pool. When the
 * pool is too small and the company has no pay at all for the query's country (or for
 * internships), the result carries that reason, the same one the drawer gives (P-2: one
 * function gives the same answer to the drawer and to Insights).
 */
export function estimateInputsResult(jobs, inputs) {
  if (!inputs) return estimateComp([], {});
  if (inputs.pool.length >= MIN_COMPARABLES) {
    const r = estimateComp(jobs, { ...inputs.query, within: inputs.pool.map((j) => j.id) });
    if (r.mid != null) return r;
  }
  const whole = estimateComp(jobs, inputs.query);
  if (['no-local-pay', 'no-intern-pay', 'no-fulltime-pay', 'no-pay'].includes(whole.reason)) return whole;
  return { ...estimateComp([], {}), query: whole.query, reason: 'too-few', country: whole.country };
}

/** The basis line of an estimate: count, company, then what the comparables are (P-2). */
export function estimateBasisLine(result, company, extra = []) {
  return basisLine(result?.n || 0, company, [...extra, ...basisParts(result)]);
}

/** Why there is no figure, in plain words (drawer and Insights share it). */
export function noEstimateText(result, company = 'this company') {
  const where = result?.country ? countryInSentence(result.country) : 'this place';
  switch (result?.reason) {
    case 'no-local-pay': return `No similar role at ${company} in ${where} lists pay, so there is no pay estimate. Pay from other countries isn't used.`;
    case 'no-intern-pay': return `No internship or fixed-term role at ${company} lists pay, so there is no pay estimate. Full-time pay isn't used for internships.`;
    case 'no-fulltime-pay': return `No full-time role at ${company} lists pay, so there is no pay estimate. Internship pay isn't used for full-time roles.`;
    case 'no-pay': return `No role at ${company} lists pay yet, so there is nothing to estimate from.`;
    default: return `Too few similar roles at ${company} list pay for a pay estimate.`;
  }
}

/**
 * What a surface shows for an estimate (drawer and Insights): whether a figure may be shown,
 * its label, confidence, basis line, and the accuracy line (never at low confidence, P-2).
 * @returns {{ ok: boolean, reason: string|null, label?: string, kind?: string, confidence?: string,
 *   basis?: string, accuracy?: string|null, caution?: string|null }}
 */
export function estimateView(result, { company = 'this company', meta = null, extra = [] } = {}) {
  const ok = !!result && result.mid != null && Number.isFinite(result.mid) && result.n >= MIN_COMPARABLES;
  if (!ok) return { ok: false, reason: noEstimateText(result, company) };
  const confidence = displayConfidence(result, meta);
  const low = confidence === 'Low';
  return {
    ok: true,
    reason: null,
    kind: result.kind || 'base',
    label: result.kind === 'ote' ? `Estimated ${OTE_LABEL[0].toLowerCase()}${OTE_LABEL.slice(1)}` : 'Estimated base salary',
    confidence,
    basis: estimateBasisLine(result, company, extra),
    accuracy: low ? null : accuracyLine(meta),
    caution: !low ? null : isLowAccuracy(meta)
      ? `Past estimates at ${company} missed by more than ${ACCURACY_LOW_THRESHOLD}%, so treat this as a rough guide.`
      : 'Few close matches, so treat this as a rough guide.',
  };
}

/**
 * The Insights range bar's scale: its two ends are real values and the labels say them (P-2:
 * "$78K … $279K" labelled a bar whose High of $381K sat inside it). Ends are the lowest and highest
 * of the estimate's Low/High and the 5th/95th percentile of the pool's pay, rounded out to $10K.
 * @returns {{ lo: number, hi: number, pos: (v: number) => number }}  pos in [0,100]
 */
export function rangeScale(low, high, mids = []) {
  const p5 = percentile(mids, 0.05), p95 = percentile(mids, 0.95);
  let lo = Math.min(low, p5 ?? low), hi = Math.max(high, p95 ?? high);
  lo = Math.max(0, Math.floor(lo / 10000) * 10000);
  hi = Math.ceil(hi / 10000) * 10000;
  if (!(hi > lo)) hi = lo + 10000;
  return { lo, hi, pos: (v) => Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100)) };
}

// ---------------------------------------------------------------------------
// Widget (browser)
// ---------------------------------------------------------------------------

const CONF_LEVEL = { High: 3, Medium: 2, Low: 1 };

function signalIcon(level) {
  const bars = [0, 1, 2].map((i) => h('svg:rect', {
    x: 1 + i * 6, y: 11 - i * 4, width: 4, height: 4 + i * 4, rx: 1,
    class: i < level ? 'ms-comp__sig-on' : 'ms-comp__sig-off',
  }));
  return h('svg:svg', { viewBox: '0 0 18 16', width: 18, height: 16, 'aria-hidden': 'true', class: 'ms-comp__sig' }, bars);
}

/** Comparable row meta: the pay location that matched the query (else the first), level, department. */
function jobMeta(job, locQuery) {
  const locs = payLocations(job);
  const want = String(locQuery || '').toLowerCase();
  const hit = want ? locs.find((l) => [locKeyOf(l), l.city, l.name].some((x) => x && x.toLowerCase() === want))
    || (/remote/.test(want) ? locs.find((l) => l.remote) : null) : null;
  const loc = hit || locs[0];
  const where = loc ? locKeyOf(loc) : job.remote ? 'Remote' : '';
  const more = locs.length > 1 ? ` +${locs.length - 1}` : '';
  return [where && where + more, levelLabel(job.seniority), job.department].filter(Boolean).join(' · ');
}

function payRange(job) {
  const p = salaryUSD(job);
  if (!p) return '—';
  const a = formatMoney(p.min), b = formatMoney(p.max);
  return (a === b ? a : `${a}–${b}`) + (p.converted ? '*' : '');
}

function hashIds(list) {
  let x = 2166136261;
  for (const j of list) { const s = String(j.id); for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } x ^= 44; }
  return `${list.length}:${(x >>> 0).toString(36)}`;
}

/**
 * Compact Compstimate form + result card for Insights.
 *
 * Feed it with setContext({ board, visible, filters, company, meta }) on every app
 * render: fields follow the filters until the user edits them; it re-estimates only when
 * the (company, pool, query, accuracy) signature changes. update(jobs, meta) is the
 * filter-less shortcut. setQuery(partial) sets fields as edits ("" title = following).
 *
 * @param {HTMLElement} container
 * @param {{ getJobs?, getMeta?, onSelect?, query?, headingLevel? }} opts
 */
export function createCompstimateWidget(container, { getJobs, getMeta, onSelect, query: initial, headingLevel = 2 } = {}) {
  const id = { head: uid('comp'), title: uid('comp-t'), list: uid('comp-dl'), loc: uid('comp-l'), sen: uid('comp-s') };
  let ctx = { board: [], visible: null, filters: {}, company: '', meta: null };
  const edits = {};
  for (const k of ['title', 'location', 'seniority']) if (initial && initial[k] != null && String(initial[k]).trim() !== '') edits[k] = String(initial[k]);
  let inputs = null;
  let result = null;
  let full = null; // the estimate with its reason, also when no figure is shown
  let lastSig = null;
  let renders = 0;
  let timer = 0;

  const titleInput = h('input', {
    id: id.title, class: 'ms-comp__input', type: 'text', list: id.list, autocomplete: 'off',
    spellcheck: 'false', placeholder: 'e.g. Software Engineer', 'aria-describedby': `${id.head}-sub`,
  });
  const datalist = h('datalist', { id: id.list });
  const locSelect = h('select', { id: id.loc, class: 'ms-comp__select' });
  const senSelect = h('select', { id: id.sen, class: 'ms-comp__select' });
  const autoLine = h('p', { class: 'ms-comp__auto', hidden: true });
  const resetBtn = h('button', { type: 'button', class: 'ms-comp__reset', hidden: true, onclick: () => reset() }, 'Reset to filters');
  const resultEl = h('div', { class: 'ms-comp__result' });
  const live = h('p', { class: 'msf-sr', 'aria-live': 'polite', 'aria-atomic': 'true' });
  const hTag = `h${Math.min(6, Math.max(1, headingLevel))}`;
  const subTag = `h${Math.min(6, Math.max(1, headingLevel + 1))}`;

  const root = h('section', { class: 'ms-comp', 'aria-labelledby': id.head },
    h('header', { class: 'ms-comp__head' },
      h(hTag, { id: id.head, class: 'ms-comp__title' }, 'Pay estimate'),
      h('p', { id: `${id.head}-sub`, class: 'ms-comp__sub' }, 'Estimated pay from similar roles. Follows your filters until you change a field.')),
    h('form', { class: 'ms-comp__form', role: 'search', 'aria-label': 'Pay estimate role details', onsubmit: (e) => { e.preventDefault(); commitTitle(); } },
      h('div', { class: 'msf-field msf-field--wide' }, h('label', { for: id.title }, 'Role title'), titleInput, datalist),
      h('div', { class: 'msf-field' }, h('label', { for: id.loc }, 'Location'), locSelect),
      h('div', { class: 'msf-field' }, h('label', { for: id.sen }, 'Level'), senSelect)),
    h('div', { class: 'ms-comp__formfoot' }, autoLine, resetBtn),
    resultEl, live);
  container.appendChild(root);

  let typing = false; // a keystroke not yet committed (the 250 ms debounce)
  function commitTitle() {
    clearTimeout(timer);
    typing = false;
    const v = titleInput.value.trim();
    if (v) edits.title = titleInput.value; else delete edits.title; // emptying = following again
    refresh();
  }
  titleInput.addEventListener('input', () => { typing = true; clearTimeout(timer); timer = setTimeout(commitTitle, 250); });
  titleInput.addEventListener('change', commitTitle);
  locSelect.addEventListener('change', () => { edits.location = locSelect.value; refresh(); });
  senSelect.addEventListener('change', () => { edits.seniority = senSelect.value; refresh(); });

  function reset() {
    for (const k of Object.keys(edits)) delete edits[k];
    refresh();
    titleInput.focus({ preventScroll: true });
  }

  function fillForm() {
    const board = ctx.board;
    const salaried = board.filter((j) => salaryUSD(j));
    // Never overwrite what the user is typing; a *following* title is written even while the field
    // has focus (D-5: after "Reset to filters", which focuses it, Back left a stale title). A field
    // the user just emptied stays empty until they leave it.
    if (document.activeElement !== titleInput || (!typing && !('title' in edits) && titleInput.value !== '')) titleInput.value = inputs.query.title;
    datalist.replaceChildren(...titleSuggestions(salaried).map((t) => h('option', { value: t })));
    // Every location on the board is selectable (not only ones with posted pay), so
    // a drawer estimate for, e.g., a Singapore role can be reproduced here exactly.
    // The count shows how many roles there list pay.
    const paid = new Map(locationOptions(salaried).map((o) => [o.value, o.count]));
    const locs = locationOptions(board).map((o) => ({ ...o, count: paid.get(o.value) || 0 }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
    const locVal = inputs.display.location;
    if (locVal && !locs.some((o) => o.value === locVal)) locs.push({ value: locVal, label: locVal, count: 0 });
    locSelect.replaceChildren(h('option', { value: '' }, inputs.labels.location),
      ...locs.map((o) => h('option', { value: o.value }, o.count ? `${o.label} (${o.count})` : `${o.label} (no listed pay)`)));
    locSelect.value = locVal;
    const levels = new Map();
    for (const j of salaried) if (j.seniority) levels.set(j.seniority, (levels.get(j.seniority) || 0) + 1);
    const senVal = inputs.display.seniority;
    // "Level not stated" (the stored 'Mid' default) is listed last (shared decision 1).
    senSelect.replaceChildren(h('option', { value: '' }, inputs.labels.seniority),
      ...SENIORITY_DISPLAY_ORDER.filter((s) => levels.has(s) || s === senVal).map((s) => h('option', { value: s }, `${levelLabel(s)} (${levels.get(s) || 0})`)));
    senSelect.value = senVal;
    const edited = Object.keys(edits).length > 0;
    resetBtn.hidden = !edited;
    autoLine.hidden = !(inputs.autoTitle && inputs.query.title);
    autoLine.textContent = autoLine.hidden ? ''
      : `Showing the most common role ${inputs.filtered ? 'in your filters' : 'on this board'}: “${inputs.query.title}”. Type any title.`;
  }

  /** Recompute inputs; re-estimate and re-render only if the signature changed (Rule 10). */
  function refresh() {
    inputs = compstimateInputs(ctx.filters, edits, ctx.board, { visible: ctx.visible });
    const acc = accuracyFrom(ctx.meta);
    const sig = JSON.stringify([ctx.company, hashIds(ctx.board), hashIds(inputs.pool), inputs.query, inputs.labels, inputs.basisParts,
      Object.keys(edits).sort(), acc ? [acc.medianAbsPctError, acc.n] : null]);
    if (sig === lastSig) return false;
    lastSig = sig;
    fillForm();
    full = estimateInputsResult(ctx.board, inputs);
    result = full.mid == null || full.n < MIN_COMPARABLES ? null : full;
    render();
    return true;
  }

  function render() {
    renders += 1;
    resultEl.replaceChildren();
    const company = ctx.company || 'this company';
    const meta = ctx.meta;
    if (!ctx.board.length) {
      resultEl.appendChild(h('p', { class: 'ms-comp__empty' }, 'Load a job board to estimate pay.'));
      live.textContent = '';
      return;
    }
    const what = [inputs.query.title ? `“${inputs.query.title}”` : '', ...inputs.basisParts].filter(Boolean).join(' · ') || 'these filters';
    const view = estimateView(result, { company, meta, extra: inputs.poolParts });
    if (!view.ok) {
      // The drawer gives the same reason for the same role (P-2: one answer for both).
      const why = full && full.reason && full.reason !== 'too-few' ? ` ${noEstimateText(full, company)}` : '';
      const msg = `Not enough comparable roles with posted pay at ${company} for ${what}.${why} Remove a filter or try a broader title.`;
      resultEl.appendChild(h('div', { class: 'ms-comp__card ms-comp__card--empty' },
        h('p', { class: 'ms-comp__empty-title' }, 'Not enough comparable roles'),
        h('p', { class: 'ms-comp__empty' }, msg)));
      live.textContent = msg;
      return;
    }
    const { low, mid, high } = result;
    const { confidence, accuracy, caution, basis } = view;
    // The bar's scale: real ends, labelled with their values (P-2), from pay of the same kind.
    const market = inputs.pool.filter((j) => payKind(j) === (result.kind || 'base') && isInternLike(j) === (result.query.seniority === 'Intern')).map((j) => salaryUSD(j).mid);
    const scale = rangeScale(low, high, market.length ? market : [low, high]);
    const pos = (v) => `${scale.pos(v)}%`;
    const scaleName = inputs.filtered ? 'pay of roles in these filters' : 'pay of roles at this company';
    const level = levelStated(inputs.query.seniority) ? ` at ${inputs.query.seniority} level` : '';
    const place = inputs.query.location ? (/remote/i.test(inputs.query.location) ? ' for remote work' : ` in or near ${inputs.query.location}`) : '';

    const card = h('div', { class: 'ms-comp__card' },
      h('div', { class: 'ms-comp__eyebrow' }, view.label),
      h('div', { class: 'ms-comp__hero-row' },
        h('span', { class: 'ms-comp__hero' }, formatMoney(mid)),
        h('span', { class: 'ms-comp__per' }, 'USD / yr')),
      h('div', { class: `ms-comp__conf ms-comp__conf--${confidence.toLowerCase()}` },
        signalIcon(CONF_LEVEL[confidence]),
        h('span', { class: 'ms-comp__conf-label' }, `${confidence} confidence`)),
      h('div', { class: 'ms-comp__conf-n ms-comp__basis' }, basis),
      // No accuracy claim at low confidence (P-2: "low confidence" beside "within ±8%").
      accuracy ? h('div', { class: 'ms-comp__accuracy' }, accuracy)
        : caution ? h('div', { class: 'ms-comp__accuracy is-low' }, caution) : null,
      h('div', { class: 'ms-comp__range' },
        h('div', { class: 'ms-comp__range-ends' },
          h('span', null, h('span', { class: 'ms-comp__k' }, 'Low '), h('b', null, formatMoney(low))),
          h('span', null, h('span', { class: 'ms-comp__k' }, 'High '), h('b', null, formatMoney(high)))),
        h('div', { class: 'ms-comp__track', role: 'img', 'aria-label': `Estimated range ${formatMoney(low)} to ${formatMoney(high)}, on a scale from ${formatMoney(scale.lo)} to ${formatMoney(scale.hi)} that covers most ${scaleName}` },
          h('span', { class: 'ms-comp__band', style: { left: pos(low), width: `calc(${pos(high)} - ${pos(low)})` } }),
          h('span', { class: 'ms-comp__dot', style: { left: pos(mid) } })),
        h('div', { class: 'ms-comp__scale', 'aria-hidden': 'true' },
          h('span', null, formatMoney(scale.lo)), h('span', null, scaleName), h('span', null, formatMoney(scale.hi)))),
      h('p', { class: 'ms-comp__explain' }, `Weighted by similarity to “${inputs.query.title}”${level}${place}. ${result.detail}`),
      compstimateAsOfText({ fetchedAt: ctx.asOf, meta }) ? h('p', { class: 'ms-comp__asof' }, compstimateAsOfText({ fetchedAt: ctx.asOf, meta })) : null);

    const list = h('ol', { class: 'ms-comp__list' }, result.comparables.map((job, i) => {
      const score = Math.round((result.scores[i] ?? 0) * 100);
      const m = jobMeta(job, inputs.query.location);
      return h('li', null, h('button', {
        type: 'button', class: 'ms-comp__item', dataset: { key: `comp:${job.id}` },
        'aria-label': `${job.title}, ${m}, pays ${payRange(job).replace('–', ' to ')}, ${score}% match. Open role.`,
        onclick: () => onSelect && onSelect(job),
      },
      h('span', { class: 'ms-comp__item-main' },
        h('span', { class: 'ms-comp__item-title' }, job.title),
        h('span', { class: 'ms-comp__item-meta' }, m)),
      h('span', { class: 'ms-comp__item-side' },
        h('span', { class: 'ms-comp__item-pay' }, payRange(job)),
        h('span', { class: 'ms-comp__match' }, `${score}% match`))));
    }));
    const foot = result.comparables.some((j) => salaryUSD(j)?.converted)
      ? h('p', { class: 'ms-comp__foot' }, '* converted to USD at approximate rates') : null;
    resultEl.append(card, h('div', { class: 'ms-comp__comps' }, h(subTag, { class: 'ms-comp__comps-title' }, 'Most comparable roles'), list, foot));
    live.textContent = `Pay estimate ${formatMoney(mid)}, range ${formatMoney(low)} to ${formatMoney(high)}, ${confidence.toLowerCase()} confidence. ${basis}.${accuracy ? ` ${accuracy}.` : caution ? ` ${caution}` : ''}`;
  }

  /**
   * The app's current state. Call on every render; cheap when nothing relevant changed.
   * @param {{ board: Job[], visible?: Job[], filters?: { d?, rf?, l?, r?, s? }, company?: string, meta?: object }} next
   */
  function setContext(next = {}) {
    ctx = {
      board: Array.isArray(next.board) ? next.board : ctx.board,
      visible: next.visible !== undefined ? next.visible : ctx.visible,
      filters: next.filters || {},
      company: next.company ?? ctx.company,
      meta: next.meta !== undefined ? next.meta : ctx.meta,
      asOf: next.asOf !== undefined ? next.asOf : ctx.asOf, // the board's fetchedAt, for the "as of" line
    };
    return refresh();
  }

  /** Filter-less shortcut: the whole board, following fields. */
  function update(allJobs, respMeta) {
    const board = Array.isArray(allJobs) ? allJobs : (typeof getJobs === 'function' ? getJobs() || [] : []);
    const meta = respMeta !== undefined ? respMeta : (typeof getMeta === 'function' ? getMeta() ?? null : ctx.meta);
    return setContext({ board, visible: null, filters: ctx.filters, meta });
  }

  /** Set fields as edits (title "" returns Title to following). */
  function setQuery(partial = {}) {
    for (const k of ['title', 'location', 'seniority']) {
      if (!(k in partial)) continue;
      if (k === 'title' && !String(partial.title || '').trim()) delete edits.title; else edits[k] = String(partial[k] ?? '');
    }
    if ('title' in partial) titleInput.value = partial.title || '';
    return refresh();
  }

  if (typeof getJobs === 'function') update(); else refresh();

  return {
    update,
    setContext,
    setQuery,
    setMeta(meta) { ctx = { ...ctx, meta }; return refresh(); },
    reset,
    getQuery: () => ({ ...(inputs ? inputs.query : {}) }),
    getEdits: () => ({ ...edits }),
    getInputs: () => inputs,
    getResult: () => result,
    renderCount: () => renders,
    destroy() { clearTimeout(timer); root.remove(); },
    el: root,
  };
}
