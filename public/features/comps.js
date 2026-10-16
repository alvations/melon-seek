// melon-seek market comps, "Same role elsewhere" / "Compare companies"
// (docs/strategy/ROADMAP.md §6.2 Top 1, §7.1 F1).
//
// Reads the market document built by scripts/build-market.js (format
// "melon-market-1", served at /api/market and api/market.json):
//   { basis, currency: "USD", minN, generatedAt, fx: { asOf },
//     companies: [{ slug, name, color, country, countries, ... }],
//     columns: ["company","family","seniority","n","p25","median","p75"],
//     cells: [["anthropic","ml","Senior",41,320000,365000,405000], ...],   // seniority "*" = all full-time levels
//     oteCells: [...], counts: [["xai","design","Senior",2], ...],
//     countries: [{ code, companies, n }], byCountry: { IE: { cells, oteCells, counts }, ... } }
// `cells`, `oteCells` and `counts` are each company's home country (companies[].country);
// byCountry holds the other countries (fix wave 3, BP-3). A document without a country (older
// builds, hand-made fixtures) is read as before: one pool per company.
//
//   marketComps(market, { family, seniority?, country?, kind? }) -> rows[]
//   compsForJob(market, job, { includeSelf?, country? }) -> { rows, matchedOn, family, seniority, level, kind, fallback, country }
//   compsNote(res) -> the sentence above the drawer chart ("" when there is no family)
//   familyOptions(market, { country? }) -> [{ id, label, companies, n }]
//   levelOptions(market, family, { country? }) -> [{ id, label, companies }]
//   missingLevels(market, family, { country? }) -> level ids with no row; missingLevelsNote(...) -> one line
//   missingCompanies(market, { family, level, country? }) -> [{ slug, name, why: 'few'|'levels', n }]
//   marketCountries(market) -> [{ code, companies, n }]; defaultCountry(market) -> 'US'
//   compareCountry(market, { jobs, visible, filters, job }) -> the country Compare companies shows
//   createCompsCard(container, { onPickCompany(slug, filters), market? })
//     -> { update(market, { company, jobs, visible?, filters?, job? }), setFamily(id), getFamily(), getLevel(), getCountry(), destroy(), el }
//
// rows: [{ slug, name, color, n, p25, median, p75, family, seniority, country?, current? }], sorted by
// median (high first): the shape public/viz/comps.js createCompsChart().update(rows) takes.
// Pure helpers run in Node; only createCompsCard touches the DOM.
//
// Like with like (persona review 2026-10-10, docs/process/fix-estimates.md; fix wave 3):
// - one country at a time: a posting is compared only with pay for its own country (payCountry),
//   and Compare companies shows one country, named on the card; with too few roles there, it says
//   so and never falls back to another country (shared decision 2);
// - on-target earnings (salary.kind 'ote') are compared only with on-target earnings (oteCells);
// - internships and fixed-term pay only with each other ("Intern"); "*" is every full-time level;
// - "Level not stated" (the stored 'Mid' default) is never a level match; a stated mid level
//   (Google "III", Netflix "L4": displayLevel 'Mid') is, through the "Mid-level" cells (BP-7).

import { roleFamily, FAMILY_LABELS, levelLabel, levelStated, displayLevel, levelKey, levelFromKey, NOT_STATED } from './roles.js';
import {
  formatMoney, plural, fmtCount, niceTicks, h, uid, createTooltip, preserveFocus, isOTE, isInternLike,
  payCountry, countryInSentence, locationKey,
} from './shared.js';
import { marketAsOfText } from './freshness.js';
import { renderNote } from '../viz/note.js';

const DEFAULT_COLUMNS = ['company', 'family', 'seniority', 'n', 'p25', 'median', 'p75'];
const PARSED = new WeakMap();
/** The cells' key for a stated mid level (build-market.js MID_STATED). */
const MID_STATED = levelKey('Mid');
/** Level buckets people can pick, in ladder order ('Mid' = not stated is never one). */
const LEVEL_ORDER = Object.freeze(['Intern', 'Entry', MID_STATED, 'Senior', 'Staff+', 'Manager', 'Director+']);
/** The full-time levels "missing level" lines talk about (internships are a different kind of pay). */
const LADDER = LEVEL_ORDER.filter((l) => l !== 'Intern');
/** Words for a cell's level bucket: 'Mid-level' -> 'Mid'. */
const levelWord = (bucket) => (bucket === MID_STATED ? 'Mid' : levelLabel(levelFromKey(bucket)));

/** True when the document says which country each cell's pay is for (fix wave 3 builds). */
export function hasCountries(market) {
  return !!market && typeof market === 'object' && ((market.byCountry && typeof market.byCountry === 'object') ||
    (Array.isArray(market.companies) && market.companies.some((c) => c && c.country)));
}

/** Countries with market data, most salaried postings first: [{ code, companies, n }]. */
export function marketCountries(market) {
  if (!hasCountries(market)) return [];
  if (Array.isArray(market.countries) && market.countries.length) return market.countries;
  const t = new Map();
  for (const co of market.companies || []) if (co?.country) { const x = t.get(co.country) || { code: co.country, companies: 0, n: 0 }; x.companies++; x.n += co.used || 0; t.set(co.country, x); }
  return [...t.values()].sort((a, b) => b.n - a.n);
}

/** The country a comparison uses when nothing else says (the one with most postings), or null. */
export function defaultCountry(market) {
  return marketCountries(market)[0]?.code || null;
}

/**
 * Market cells as objects (cached per market document). Tolerates object cells too.
 * `kind` 'ote' reads the on-target-earnings cells instead of the base-pay ones. Each cell carries
 * `country` when the document has countries (home-country cells first, then byCountry).
 */
export function marketCells(market, kind = 'base') {
  if (!market || typeof market !== 'object') return [];
  const key = kind === 'ote' ? 'oteCells' : 'cells';
  const src = market[key];
  if (!Array.isArray(src)) return [];
  let byKind = PARSED.get(market);
  if (!byKind) PARSED.set(market, (byKind = {}));
  if (byKind[kind]) return byKind[kind];
  const cols = Array.isArray(market.columns) && market.columns.length ? market.columns : DEFAULT_COLUMNS;
  const info = new Map((market.companies || []).map((c) => [c.slug, c]));
  const withCountry = hasCountries(market);
  const out = [];
  const read = (list, country) => {
    for (const raw of list) {
      const c = Array.isArray(raw) ? Object.fromEntries(cols.map((k, i) => [k, raw[i]])) : raw;
      if (!c || !c.company || !c.family || !(c.n > 0) || !Number.isFinite(c.median)) continue;
      const co = info.get(c.company) || {};
      out.push({
        slug: c.company, name: co.name || c.company, color: co.color || null,
        n: c.n, p25: c.p25, median: c.median, p75: c.p75,
        family: c.family, seniority: c.seniority || '*',
        ...(withCountry ? { country: c.country || country || co.country || null } : {}),
      });
    }
  };
  read(src, null);
  if (withCountry) for (const [code, o] of Object.entries(market.byCountry || {})) if (Array.isArray(o?.[key])) read(o[key], code);
  byKind[kind] = out;
  return out;
}

/** Below-minN groups: [{ slug, family, seniority, n, country? }]. */
function marketCounts(market) {
  if (!market || typeof market !== 'object') return [];
  const withCountry = hasCountries(market);
  const home = new Map((market.companies || []).map((c) => [c.slug, c.country || null]));
  const out = [];
  const read = (list, country) => {
    for (const raw of Array.isArray(list) ? list : []) {
      const [slug, family, seniority, n] = raw;
      if (n > 0) out.push({ slug, family, seniority, n, ...(withCountry ? { country: country || home.get(slug) || null } : {}) });
    }
  };
  read(market.counts, null);
  if (withCountry) for (const [code, o] of Object.entries(market.byCountry || {})) read(o?.counts, code);
  return out;
}

const byMedian = (a, b) => b.median - a.median || b.n - a.n || String(a.name).localeCompare(String(b.name));
/** The country a reader filters on: the given one, else the document's main one; null = no filter. */
const countryOf = (market, country) => (hasCountries(market) ? String(country || defaultCountry(market) || '').toUpperCase() || null : null);
const inCountry = (c, country) => !country || c.country === country;

/**
 * One row per company for a role family, at one seniority bucket ("*" = all full-time levels,
 * the default; "Mid-level" = a stated mid level), for one country (default: the market's main
 * country). `kind: 'ote'` compares on-target earnings. Cells already satisfy n >= market.minN.
 */
export function marketComps(market, { family, seniority, country, kind = 'base' } = {}) {
  if (!family) return [];
  const level = seniority && seniority !== 'Any' ? seniority : '*';
  const where = countryOf(market, country);
  return marketCells(market, kind)
    .filter((c) => c.family === family && c.seniority === level && inCountry(c, where))
    .map((c) => ({ ...c }))
    .sort(byMedian);
}

/**
 * "Same role elsewhere" for a posting: other companies with the same role family, kind of pay
 * and level, with pay for the same country (payCountry). The posting's own company is excluded
 * unless `includeSelf`, in which case its row (when present) is flagged `current: true`.
 *
 * - Pay for another country is never used (shared decision 2): with too few same-country roles,
 *   there are no rows and compsNote says so.
 * - An internship or fixed-term role is compared only with internships ("Intern"); there is never
 *   a fallback across the intern / full-time line (P-11).
 * - A stated level (displayLevel: a stated mid level too, BP-7) falls back to every full-time level
 *   when no other company has 3+ salaried postings at it (fallback 'too-few-at-level').
 * - "Level not stated" is never a level match: such a posting is compared with every full-time
 *   level (fallback 'level-not-stated', P-3).
 * - On-target earnings are compared only with on-target earnings (P-1).
 *
 * @returns {{ rows: object[], matchedOn: "family+seniority"|"family"|null, family: string|null,
 *   seniority: string|null, level: string|null, bucket: string|null, kind: 'base'|'ote', country: string|null,
 *   fallback: null|'level-not-stated'|'too-few-at-level'|'intern-too-few'|'no-peers'|'no-family' }}
 *   `level` is the level compared as people read it and as the app's Seniority filter takes it
 *   ("Intern", a level, "Mid" for a stated mid level, or "*" for every full-time level); `bucket` is
 *   the cells' key for it ("Mid-level" for a stated mid level); `fallback` says why it is not the
 *   posting's own level, or why there are no rows; `country` is the country compared (null for a
 *   document without countries).
 */
export function compsForJob(market, job, { includeSelf = false, country = null } = {}) {
  const family = job ? roleFamily(job.title || '', job) : null;
  const seniority = job?.seniority || null;
  const self = job?.company || null;
  const kind = isOTE(job) ? 'ote' : 'base';
  const where = hasCountries(market) ? countryOf(market, country || payCountry(job)) : null;
  // `level` is what people read and what the app's Seniority filter takes (a stated mid level is
  // 'Mid'); `bucket` is the cells' key ('Mid-level').
  const res = (rows, matchedOn, bucket, fallback) => ({ rows, matchedOn, family, seniority, level: bucket && bucket !== '*' ? levelFromKey(bucket) : bucket, bucket, kind, fallback, country: where });
  if (!family) return { ...res([], null, null, 'no-family'), family: null };
  const pick = (rows) => {
    const others = rows.filter((r) => r.slug !== self);
    if (!others.length) return null;
    return includeSelf ? rows.map((r) => (r.slug === self ? { ...r, current: true } : r)) : others;
  };
  const comps = (level) => marketComps(market, { family, seniority: level, country: where, kind });
  if (isInternLike(job)) {
    const interns = pick(comps('Intern'));
    return interns ? res(interns, 'family+seniority', 'Intern', null) : res([], null, 'Intern', 'intern-too-few');
  }
  const shown = displayLevel(job || {});
  const stated = shown !== NOT_STATED && shown !== 'Intern' && levelStated(levelKey(shown));
  const bucket = stated ? levelKey(shown) : null;
  const exact = stated ? pick(comps(bucket)) : null;
  if (exact) return res(exact, 'family+seniority', bucket, null);
  const loose = pick(comps('*'));
  if (loose) return res(loose, 'family', '*', stated ? 'too-few-at-level' : 'level-not-stated');
  return res([], null, null, 'no-peers');
}

/**
 * The sentence above the drawer's "Same role elsewhere" chart, true to what is compared and where.
 * With no rows (no other company lists same-country pay) it says so; "" only without a family.
 */
export function compsNote(res) {
  if (!res || !res.family) return '';
  const fam = FAMILY_LABELS[res.family] || res.family || 'these';
  const pay = res.kind === 'ote' ? 'posted on-target earnings (base plus commission at target)' : 'posted base pay';
  const where = res.country ? ` in ${countryInSentence(res.country)}` : '';
  const elsewhere = res.country ? ' Pay for other countries isn’t used.' : '';
  if (!res.rows || !res.rows.length) {
    if (res.level === 'Intern') return `No other company lists pay for ${fam} internships or fixed-term roles${where}, so there is nothing to compare yet.${elsewhere}`;
    return `No other company lists ${res.kind === 'ote' ? 'on-target earnings' : 'pay'} for ${fam} roles${where}, so there is nothing to compare yet.${elsewhere}`;
  }
  if (res.level === 'Intern') return `${fam} internships and fixed-term roles${where}: median and middle half of ${pay} as a yearly rate (in US dollars).`;
  if (res.matchedOn === 'family+seniority') return `${fam} roles at ${levelWord(res.bucket || res.level)} level${where}: median and middle half of ${pay} (in US dollars).`;
  if (res.fallback === 'too-few-at-level') return `Too few ${levelWord(levelKey(res.seniority))} ${fam} roles elsewhere list pay${where}, so this compares ${fam} roles${where ? ' there' : ''} at every full-time level (${pay}, in US dollars).`;
  return `This posting doesn’t state a level, so this compares ${fam} roles${where} at every full-time level (${pay}, in US dollars).`;
}

/** Families present in the market (all-levels cells) for one country, most widely covered first. */
export function familyOptions(market, { country } = {}) {
  const where = countryOf(market, country);
  const agg = new Map();
  for (const c of marketCells(market)) {
    if (c.seniority !== '*' || !inCountry(c, where)) continue;
    const a = agg.get(c.family) || { id: c.family, label: FAMILY_LABELS[c.family] || c.family, companies: 0, n: 0 };
    a.companies += 1;
    a.n += c.n;
    agg.set(c.family, a);
  }
  return [...agg.values()].sort((a, b) => b.companies - a.companies || b.n - a.n || a.label.localeCompare(b.label));
}

/**
 * Stated levels a family can be compared at in one country, ladder order: [{ id, label, companies }].
 * id is the cell bucket ("Mid-level" for a stated mid level, which reads "Mid").
 */
export function levelOptions(market, family, { country } = {}) {
  const where = countryOf(market, country);
  const count = new Map();
  for (const c of marketCells(market)) {
    if (c.family !== family || c.seniority === '*' || !levelStated(c.seniority) || !inCountry(c, where)) continue;
    count.set(c.seniority, (count.get(c.seniority) || 0) + 1);
  }
  return LEVEL_ORDER.filter((l) => count.has(l)).map((l) => ({ id: l, label: l === 'Intern' ? 'Intern or fixed-term' : levelWord(l), companies: count.get(l) }));
}

/** Full-time levels with no company row for a family in one country (ladder order). */
export function missingLevels(market, family, { country } = {}) {
  if (!market || !family) return [];
  const have = new Set(levelOptions(market, family, { country }).map((o) => o.id));
  return LADDER.filter((l) => !have.has(l));
}

/**
 * One plain line on why a level is missing from the Level choice (persona review, beta 55+:
 * "Design has no Mid", "Policy has no Director+"):
 *   "Mid and Director+ aren't in the Level list: no company lists pay for 3 or more Design roles at those levels in the US."
 * "" when every level is there, or when the family has no row at any level.
 */
export function missingLevelsNote(market, family, { country } = {}) {
  const missing = missingLevels(market, family, { country });
  if (!missing.length || missing.length === LADDER.length) return '';
  const fam = FAMILY_LABELS[family] || family;
  const words = missing.map(levelWord);
  const one = words.length === 1;
  const list = one ? words[0] : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
  const where = countryOf(market, country);
  const minN = market.minN || 3;
  return `${list} ${one ? "isn't" : "aren't"} in the Level list: no company lists pay for ${minN} or more ${fam} roles at ${one ? 'that level' : 'those levels'}${where ? ` in ${countryInSentence(where)}` : ''}.`;
}

/** n per company for a family at a bucket in one country, from the cells and the below-minN counts. */
function bucketN(market, family, level, where) {
  const n = new Map();
  for (const c of marketCells(market)) if (c.family === family && c.seniority === level && inCountry(c, where)) n.set(c.slug, c.n);
  for (const c of marketCounts(market)) {
    if (c.family === family && c.seniority === level && inCountry(c, where)) n.set(c.slug, (n.get(c.slug) || 0) + c.n);
  }
  return n;
}

/**
 * Companies the comparison leaves out, and why (I-8: they used to vanish silently):
 * 'few' = 1 or 2 salaried postings there (below minN); 'levels' = it has postings in the family
 * but most state no level, so "no Staff+ row" would not mean "no Staff+ roles" (P-3).
 * Companies with no salaried posting in the family (in that country) are not listed.
 */
export function missingCompanies(market, { family, level = '', country } = {}) {
  if (!market || !family) return [];
  const where = countryOf(market, country);
  const bucket = level || '*';
  const shown = new Set(marketComps(market, { family, seniority: bucket, country: where }).map((r) => r.slug));
  const here = bucketN(market, family, bucket, where);
  const levelled = level && level !== 'Intern';
  const all = levelled ? bucketN(market, family, '*', where) : null;
  // The stored 'Mid' bucket holds stated mid levels too; only the rest states no level.
  const mid = levelled ? bucketN(market, family, 'Mid', where) : null;
  const midStated = levelled ? bucketN(market, family, MID_STATED, where) : null;
  const out = [];
  for (const co of market.companies || []) {
    if (shown.has(co.slug)) continue;
    const n = here.get(co.slug) || 0;
    const total = all ? all.get(co.slug) || 0 : 0;
    const unstated = levelled ? Math.max(0, (mid.get(co.slug) || 0) - (midStated.get(co.slug) || 0)) : 0;
    if (all && total >= (market.minN || 3) && unstated / total >= 0.5) out.push({ slug: co.slug, name: co.name || co.slug, why: 'levels', n: total });
    else if (n > 0) out.push({ slug: co.slug, name: co.name || co.slug, why: 'few', n });
  }
  return out;
}

const listNames = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** "Not shown: Cohere (fewer than 3 postings with pay); xAI (doesn't state levels for most of these roles)." */
export function missingNote(missing, minN = 3) {
  const few = missing.filter((m) => m.why === 'few').map((m) => m.name);
  const lev = missing.filter((m) => m.why === 'levels').map((m) => m.name);
  const parts = [];
  if (few.length) parts.push(`${listNames(few)} (fewer than ${minN} postings with pay)`);
  if (lev.length) parts.push(`${listNames(lev)} (${lev.length === 1 ? "doesn't" : "don't"} state levels for most of these roles)`);
  return parts.length ? `Not shown: ${parts.join('; ')}.` : '';
}

/** Most common family among salaried jobs that the market covers for 2+ companies (null if none). */
function defaultFamily(market, jobs, country) {
  const opts = familyOptions(market, { country });
  const covered = new Set(opts.filter((o) => o.companies >= 2).map((o) => o.id));
  const count = new Map();
  for (const j of jobs || []) {
    if (!j || !j.salary) continue;
    const f = j._family ?? roleFamily(j.title || '', j);
    if (f && covered.has(f)) count.set(f, (count.get(f) || 0) + 1);
  }
  const top = [...count].sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : null;
}

/** The comparable level bucket of a posting: 'Intern', a stated level ('Mid-level' for mid), or ''. */
function jobBucket(job) {
  if (isInternLike(job)) return 'Intern';
  const shown = displayLevel(job || {});
  return shown !== NOT_STATED && levelStated(levelKey(shown)) ? levelKey(shown) : '';
}

/**
 * The cell bucket for a Seniority filter value. The app's filter holds displayLevel() values
 * (shared decision 1): 'Mid' is a stated mid level, 'Not stated' the default; link keys
 * ('Mid-level') are read too. '' when the value is not a comparable level.
 */
function filterBucket(v) {
  if (v === 'Mid' || v === MID_STATED) return MID_STATED;
  return v && v !== NOT_STATED && levelStated(v) ? v : '';
}

/**
 * The family and level the card opens on (I-8): the open job's, else the role-family filter and
 * a single stated level filter, else the most common family among the roles in view, else the
 * board's. Never "Level not stated". `country` limits the choice to families with rows there.
 * @returns {{ family: string|null, level: string }}  level '' = every full-time level
 */
export function compareDefaults(market, { jobs = [], visible = null, filters = {}, job = null, country } = {}) {
  const opts = familyOptions(market, { country });
  const ok = (f) => !!f && opts.some((o) => o.id === f);
  const s = Array.isArray(filters?.s) ? filters.s : filters?.s ? [filters.s] : [];
  const jobFam = job ? job._family ?? roleFamily(job.title || '', job) : null;
  const family = (ok(jobFam) && jobFam) || (ok(filters?.rf) && filters.rf)
    || (Array.isArray(visible) && visible.length ? defaultFamily(market, visible, country) : null)
    || defaultFamily(market, jobs, country) || (opts.find((o) => o.companies >= 2) || opts[0])?.id || null;
  const want = job ? jobBucket(job) : s.length === 1 ? filterBucket(s[0]) : '';
  return { family, level: want && levelOptions(market, family, { country }).some((o) => o.id === want) ? want : '' };
}

/**
 * The country Compare companies shows (shared decision 2): the open job's pay country, else the
 * country of the places in the location filter (the one most of the roles in view are paid in),
 * else the country most of the salaried roles in view (then on the board) are paid in, else the
 * market's main country. null for a document without countries.
 */
export function compareCountry(market, { jobs = [], visible = null, filters = {}, job = null } = {}) {
  if (!hasCountries(market)) return null;
  if (job) { const c = payCountry(job); if (c) return c; }
  const places = new Set(Array.isArray(filters?.l) ? filters.l : filters?.l ? [filters.l] : []);
  let wanted = null;
  if (places.size) {
    wanted = new Set();
    for (const j of [...(visible || []), ...(jobs || [])]) {
      for (const l of j?.locations || []) if (l?.country && places.has(locationKey(l))) wanted.add(String(l.country).toUpperCase());
    }
    if (!wanted.size) wanted = null;
  }
  const top = (list) => {
    const count = new Map();
    for (const j of list || []) {
      if (!j || !j.salary) continue;
      const c = payCountry(j);
      if (c && (!wanted || wanted.has(c))) count.set(c, (count.get(c) || 0) + 1);
    }
    return [...count].sort((a, b) => b[1] - a[1] || (a[0] === 'US' ? -1 : b[0] === 'US' ? 1 : a[0] < b[0] ? -1 : 1))[0]?.[0] || null;
  };
  return top(visible) || top(jobs) || (wanted ? [...wanted].sort()[0] : null) || defaultCountry(market);
}

// ---------------------------------------------------------------------------
// Insights card (browser)
// ---------------------------------------------------------------------------

/**
 * "Compare companies" card for Insights mode: a role-family picker, a level picker, and one range
 * row per company (middle-half bar, median tick, shared axis). Clicking a row calls
 * onPickCompany(slug, { family, familyLabel, seniority }).
 *
 * It follows the view (I-8): update(market, { company, jobs, visible, filters, job }) opens it on
 * the open job's family and level, else the role-family and level filters, else the most common
 * family among the roles in view. A family or level the user picks in the card sticks until the
 * role-family or level filter, or the open job, changes. Companies left out are named, with why.
 * It compares one country (compareCountry), named in the subtitle and the footnote; a level with no
 * row is explained in one line under the pickers (missingLevelsNote). No new control.
 */
export function createCompsCard(container, { onPickCompany, market: initialMarket, headingLevel = 3 } = {}) {
  const hl = Math.min(5, Math.max(1, headingLevel));
  const ids = { head: uid('cmp-h'), select: uid('cmp-f'), level: uid('cmp-l'), sub: uid('cmp-s') };
  let market = null;
  let company = null;
  let jobs = [];
  let view = { visible: null, filters: {}, job: null };
  let family = null;
  let level = '';
  let country = null;
  let userPicked = false;
  let levelPicked = false;
  let followed = null; // the filters the picks were made under

  const select = h('select', { id: ids.select, class: 'ms-comp__select msi-compare__select', 'aria-describedby': ids.sub });
  const levelSelect = h('select', { id: ids.level, class: 'ms-comp__select msi-compare__select' });
  const body = h('div', { class: 'msi-compare__body' });
  const levelsEl = h('p', { class: 'msi-foot msi-compare__levels', hidden: true });
  const missingEl = h('p', { class: 'msi-foot msi-compare__missing', hidden: true });
  const foot = h('p', { class: 'msi-foot msi-compare__foot' });
  const live = h('p', { class: 'msf-sr', 'aria-live': 'polite', 'aria-atomic': 'true' });
  // fix-density: the subtitle is one line; how to read the bars and the card's footnotes (levels missing,
  // companies left out, what pay is compared, dates) are behind its "Details" (viz/note.js).
  const sub = h('div', { id: ids.sub, class: 'msi-card__sub' });
  let subWhere = '';
  const renderSub = () => renderNote(sub, { line: `Posted pay${subWhere}, by company`, key: 'ins:compare',
    details: ['For the same kind of role at each tracked company. Bar: the middle half of salaries. Tick: the median.', levelsEl, missingEl, foot] });
  // The level picker sits beside the family picker inside the card (no new main-view control).
  const fields = h('div', { class: 'msi-compare__fields', style: { display: 'flex', flexWrap: 'wrap', gap: '0 10px' } },
    h('div', { class: 'msf-field msi-compare__field', style: { flex: '2 1 220px' } }, h('label', { for: ids.select }, 'Role family'), select),
    h('div', { class: 'msf-field msi-compare__field', style: { flex: '1 1 150px' } }, h('label', { for: ids.level }, 'Level'), levelSelect));
  const root = h('section', { class: 'ms-insights ms-compare', 'aria-labelledby': ids.head },
    h('div', { class: 'msi-card' },
      h('header', { class: 'msi-card__head' },
        h(`h${hl}`, { id: ids.head, class: 'msi-card__title' }, 'Compare companies'),
        sub),
      fields, body, live));
  container.appendChild(root);
  renderSub();
  const tip = createTooltip(root);

  select.addEventListener('change', () => { family = select.value || null; userPicked = true; fillLevels(); render(); });
  levelSelect.addEventListener('change', () => { level = levelSelect.value || ''; levelPicked = true; render(); });

  const opts = () => ({ country });
  function fillSelect() {
    country = compareCountry(market, { jobs, ...view });
    const fams = familyOptions(market, opts());
    const def = compareDefaults(market, { jobs, ...view, country });
    // A pick in the card sticks until the role-family or level filter, or the open job, changes.
    const f = view.filters || {};
    const sig = JSON.stringify([f.rf || '', [].concat(f.s || []), view.job?.id || null, country]);
    if (sig !== followed) { followed = sig; userPicked = false; levelPicked = false; }
    if (family && !fams.some((o) => o.id === family)) { family = null; userPicked = false; }
    if (!family || !userPicked) family = def.family || family;
    if (!levelPicked) level = def.level;
    select.replaceChildren(...fams.map((o) => h('option', { value: o.id }, `${o.label} (${plural(o.companies, 'company', 'companies')})`)));
    select.value = family || '';
    select.disabled = !fams.length;
    fillLevels();
  }

  function fillLevels() {
    const lv = levelOptions(market, family, opts());
    if (level && !lv.some((o) => o.id === level)) { level = ''; levelPicked = false; }
    levelSelect.replaceChildren(h('option', { value: '' }, 'Every full-time level'),
      ...lv.map((o) => h('option', { value: o.id }, `${o.label} (${plural(o.companies, 'company', 'companies')})`)));
    levelSelect.value = level;
    levelSelect.disabled = !market || !family;
  }

  function render() {
    tip.hide();
    preserveFocus(root, () => {
      body.replaceChildren();
      const where = country ? ` in ${countryInSentence(country)}` : '';
      subWhere = where;
      const rows = marketComps(market, { family, seniority: level || '*', country });
      const label = FAMILY_LABELS[family] || family || '';
      const levelName = level === 'Intern' ? 'internships and fixed-term roles' : level ? `${levelWord(level)} roles` : 'full-time roles';
      if (!market || !Array.isArray(market.cells)) {
        body.appendChild(h('p', { class: 'msi-empty' }, 'Company comparisons appear once market data is loaded.'));
        foot.textContent = '';
        missingEl.hidden = true;
        levelsEl.hidden = true;
        live.textContent = '';
        return;
      }
      // Why a level is missing from the Level choice, in one line (persona review, beta 55+).
      const why = family ? missingLevelsNote(market, family, opts()) : '';
      levelsEl.textContent = why;
      levelsEl.hidden = !why;
      if (!family) {
        // No family has rows in this country: say so; pay for other countries is never used.
        body.appendChild(h('p', { class: 'msi-empty' }, `Too few roles${where} list pay to compare companies yet. Pay for other countries isn't used.`));
      } else if (!rows.length) {
        body.appendChild(h('p', { class: 'msi-empty' }, `No company has ${market.minN || 3}+ salaried ${levelName} in this family${where} yet.`));
      } else {
        let lo = Math.min(...rows.map((r) => r.p25)), hi = Math.max(...rows.map((r) => r.p75));
        const pad = (hi - lo) * 0.06 || 10000;
        lo = Math.max(0, lo - pad); hi += pad;
        const ticks = niceTicks(lo, hi, 4).ticks.filter((t) => t >= lo && t <= hi);
        const x = (v) => `${((v - lo) / (hi - lo || 1)) * 100}%`;
        const list = h('div', { class: 'msi-rows msi-rows--box msi-rows--compare' },
          rows.map((r) => {
            const cur = r.slug === company;
            const btn = h('button', {
              type: 'button', class: `msi-row${cur ? ' is-current' : ''}`, dataset: { key: `company:${r.slug}` },
              'aria-label': `${r.name}${cur ? ' (this company)' : ''}: median ${formatMoney(r.median)}, middle half ${formatMoney(r.p25)} to ${formatMoney(r.p75)}, ${plural(r.n, 'salaried posting')}${where}. ${cur ? '' : `Switch to ${r.name} with this role family${level ? ' and level' : ''}.`}`,
              onclick: () => { tip.hide(); if (onPickCompany) onPickCompany(r.slug, { family, familyLabel: label, seniority: level ? levelFromKey(level) : null }); },
            },
            h('span', { class: 'msi-row__label' },
              h('i', { class: 'msi-swatch', style: r.color ? { background: r.color } : null, 'aria-hidden': 'true' }),
              h('span', { class: 'msi-row__name' }, r.name),
              h('span', { class: 'msi-row__n' }, fmtCount(r.n)),
              cur ? h('span', { class: 'msi-row__tag' }, 'this company') : null),
            h('span', { class: 'msi-row__value' }, formatMoney(r.median)),
            h('span', { class: 'msi-box', 'aria-hidden': 'true' },
              ticks.map((t) => h('span', { class: 'msi-grid', style: { left: x(t) } })),
              h('span', { class: 'msi-box__iqr', style: { left: x(r.p25), width: `max(4px, calc(${x(r.p75)} - ${x(r.p25)}))` } }),
              h('span', { class: 'msi-box__med', style: { left: x(r.median) } })));
            // fix-touch-tips: another company's row says how to open it; on touch the first tap shows this tip.
            tip.bind(btn, () => ({ value: `${formatMoney(r.median)} median`, label: r.name, rows: [['Middle half', `${formatMoney(r.p25)} – ${formatMoney(r.p75)}`], ['Salaried postings', String(r.n)]] }),
              { action: cur ? null : 'see these roles' });
            return btn;
          }),
          h('div', { class: 'msi-axis', 'aria-hidden': 'true' },
            h('span', { class: 'msi-axis__pad' }),
            h('span', { class: 'msi-axis__track' }, ticks.map((t) => h('span', { class: 'msi-axis__tick', style: { left: x(t) } }, formatMoney(t)))),
            h('span', { class: 'msi-axis__pad msi-axis__pad--end' })));
        body.appendChild(list);
      }
      // Companies left out, with the reason (I-8, P-3).
      const note = family ? missingNote(missingCompanies(market, { family, level, country }), market.minN || 3) : '';
      missingEl.textContent = note;
      missingEl.hidden = !note;
      // Postings and FX dates (docs/DATA_FRESHNESS.md): the market document's, the registry's FX when loaded.
      const dated = marketAsOfText(market, rows.map((r) => r.slug));
      const asOf = dated ? ` ${dated}.` : '';
      const what = level === 'Intern'
        ? `Posted internship and fixed-term pay${where}, as a yearly rate`
        : `${capitalize(market.basis || 'posted base pay ranges')} of ${level ? `${levelWord(level)} ` : ''}full-time roles${where}`;
      const left = level === 'Intern' ? '' : ' Internships, fixed-term programmes and on-target earnings (sales pay that includes commission) are left out.';
      const only = country ? ` Only pay for roles${where} is compared.` : '';
      foot.textContent = `${what}, midpoints in approx. US dollars; companies need ${market.minN || 3}+ salaried postings${country ? ' there' : ''}.${left} Equity and bonus aren't included.${only}${asOf}`;
      live.textContent = rows.length ? `${label}${level ? `, ${level === 'Intern' ? 'internships' : levelWord(level)}` : ''}${where}: ${plural(rows.length, 'company', 'companies')} compared.` : '';
    });
    renderSub();
    fitAxes(root);
  }

  /**
   * @param {object} nextMarket  the market document (undefined keeps the current one)
   * @param {{ company?: string, jobs?: Job[], visible?: Job[], filters?: { rf?, s?, l? }, job?: Job|null }} [opts]
   *   jobs = the board; visible = the roles in view; filters = the app's role-family, level and
   *   location filters; job = the open drawer job, if any.
   */
  function update(nextMarket, { company: slug, jobs: nextJobs, visible, filters, job } = {}) {
    if (nextMarket !== undefined) market = nextMarket;
    if (slug !== undefined) company = slug;
    if (nextJobs !== undefined) jobs = Array.isArray(nextJobs) ? nextJobs : [];
    if (visible !== undefined) view = { ...view, visible: Array.isArray(visible) ? visible : null };
    if (filters !== undefined) view = { ...view, filters: filters || {} };
    if (job !== undefined) view = { ...view, job: job || null };
    fillSelect();
    render();
  }

  if (initialMarket) update(initialMarket); else render();

  return {
    update,
    setFamily(id) { family = id || null; userPicked = !!id; fillLevels(); render(); },
    getFamily: () => family,
    getLevel: () => level,
    getCountry: () => country,
    destroy() { tip.destroy(); root.remove(); },
    el: root,
  };
}

function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

/** Keep axis labels inside the track and drop interior ticks that would collide. */
function fitAxes(root) {
  if (!root.isConnected) return;
  // Reads and writes in phases (tracks, resets, ticks, then the writes): two layouts instead of one
  // per tick. Transforms and visibility move no other box, so every rect is the same as before.
  const axes = [];
  for (const track of root.querySelectorAll('.msi-axis__track')) {
    const ticks = [...track.querySelectorAll('.msi-axis__tick')];
    const tr = track.getBoundingClientRect();
    if (ticks.length && tr.width) axes.push({ ticks, tr });
  }
  for (const { ticks } of axes) for (const t of ticks) { t.style.visibility = ''; t.style.transform = ''; }
  for (const a of axes) a.boxes = a.ticks.map((t) => t.getBoundingClientRect());
  for (const { ticks, tr, boxes } of axes) {
    let prevRight = -Infinity;
    for (const [i, t] of ticks.entries()) {
      let r = boxes[i];
      const dl = tr.left - r.left, dr = r.right - tr.right;
      if (dl > 0 || dr > 0) { const dx = dl > 0 ? dl : -dr; t.style.transform = `translateX(calc(-50% + ${dx}px))`; r = { left: r.left + dx, right: r.right + dx }; }
      if (r.left < prevRight + 8) t.style.visibility = 'hidden'; else prevRight = r.right;
    }
  }
}
