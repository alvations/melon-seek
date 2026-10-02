// melon-seek "Compstimate" — a Zestimate-style pay estimate for any role,
// computed from similarity-weighted comparable postings on the loaded board.
//
//   estimateComp(allJobs, { title, location, seniority, department, excludeId })
//     -> { low, mid, high, currency: "USD", confidence, n, comparables, scores,
//          explanation, query }
//   compstimateForJob(allJobs, job)        // estimate for one posting (excludes itself)
//   createCompstimateWidget(container, { getJobs, onSelect, query })
//     -> { update(allJobs?), setQuery(partial), getQuery(), getResult(), destroy() }
//
// Pure logic (everything except createCompstimateWidget) runs in Node.

import {
  salaryUSD, weightedPercentile, percentile, formatMoney, plural, h, uid, locationKey,
} from './shared.js';

export { percentile, weightedPercentile, salaryUSD, toUSD, FX_FALLBACK } from './shared.js';

// ---------------------------------------------------------------------------
// Title normalization
// ---------------------------------------------------------------------------

/** Abbreviations expanded before tokenizing ("Sr. SWE" -> "senior software engineer"). */
const ABBREV = {
  swe: 'software engineer', sde: 'software engineer', sw: 'software', sre: 'site reliability engineer',
  mle: 'machine learning engineer', ml: 'machine learning', pm: 'product manager',
  tpm: 'technical program manager', em: 'engineering manager', ae: 'account executive',
  sdr: 'sales development representative', bdr: 'business development representative',
  csm: 'customer success manager', se: 'solutions engineer', sa: 'solutions architect',
  ds: 'data scientist', da: 'data analyst', eng: 'engineer', engr: 'engineer', dev: 'developer',
  infra: 'infrastructure', ops: 'operations', mgr: 'manager', mgmt: 'management',
  admin: 'administrator', hr: 'people', ea: 'executive assistant', gtm: 'go to market',
  sr: 'senior', jr: 'junior', dir: 'director', assoc: 'associate', rs: 'research scientist',
  fde: 'forward deployed engineer', qa: 'quality assurance', vp: 'vp',
};

/** Token synonyms applied after stemming. */
const SYNONYM = {
  developer: 'engineer', programmer: 'engineer', engineering: 'engineer', management: 'manager',
  researcher: 'research', science: 'scientist', analytic: 'analyst', analysi: 'analyst',
  architecture: 'architect', designer: 'design', recruiting: 'recruiter', recruitment: 'recruiter',
};

/** Words that describe level, not role: dropped from tokens, used to infer seniority. */
const LEVEL_WORDS = new Set([
  'senior', 'staff', 'principal', 'lead', 'junior', 'intern', 'internship', 'head', 'director', 'vp',
  'vice', 'president', 'chief', 'distinguished', 'fellow', 'associate', 'entry', 'level', 'new', 'grad',
  'graduate', 'mid', 'i', 'ii', 'iii', 'iv', 'v', '1', '2', '3', '4', 'apprentice', 'trainee', 'founding',
]);

const STOPWORDS = new Set([
  'a', 'an', 'the', 'of', 'and', 'for', 'to', 'in', 'on', 'at', 'with', 'or', 'our', 'team', 'remote',
  'hybrid', 'onsite', 'site', 'based', 'us', 'usa', 'uk', 'emea', 'apac', 'amer', 'contract', 'contractor',
  'temporary', 'temp', 'part', 'full', 'time', 'fulltime', 'parttime', 'all', 'levels', 'role', 'position',
  'opening', 'general', 'application', 'experienced',
]);
// 'site' is a stopword only outside "site reliability" (collapsed to "sitereliability" below).

function expand(title) {
  let s = String(title || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/c\+\+/g, ' cplusplus ').replace(/c#/g, ' csharp ').replace(/&/g, ' and ')
    .replace(/\bfront[\s-]?end\b/g, 'frontend').replace(/\bback[\s-]?end\b/g, 'backend')
    .replace(/\bfull[\s-]?stack\b/g, 'fullstack').replace(/\bdev[\s-]?ops\b/g, 'devops')
    .replace(/\bon[\s-]?site\b/g, 'onsite')
    .replace(/[^a-z0-9+]+/g, ' ');
  s = s.split(' ').filter(Boolean).map((w) => ABBREV[w] || w).join(' ');
  return s.replace(/\bsite reliability\b/g, 'sitereliability').replace(/\bmachine learning\b/g, 'machinelearning');
}

function stem(w) {
  if (w.length > 4 && w.endsWith('s') && !/(ss|us|is)$/.test(w)) w = w.slice(0, -1);
  return SYNONYM[w] || w;
}

/**
 * Normalize a job title into comparable role tokens.
 *   normalizeTitle("Sr. SWE, Platform") ->
 *     { tokens: ["software","engineer","platform"], family: "swe", seniority: "Senior", role: "software engineer" }
 */
export function normalizeTitle(title) {
  const raw = String(title || '');
  const rolePart = raw.split(/\s*(?:,|\s[-–—|:]\s|\()\s*/)[0] || raw;
  const expanded = expand(raw);
  const tokens = [];
  const seen = new Set();
  for (const w of expanded.split(' ')) {
    if (!w || LEVEL_WORDS.has(w) || STOPWORDS.has(w)) continue;
    const t = stem(w);
    if (t && !seen.has(t)) { seen.add(t); tokens.push(t); }
  }
  const roleExpanded = expand(rolePart);
  const role = roleExpanded.split(' ').filter((w) => w && !LEVEL_WORDS.has(w) && !STOPWORDS.has(w)).join(' ');
  return {
    tokens,
    family: roleFamily(rolePart) || roleFamily(raw),
    seniority: inferSeniority(raw),
    role,
  };
}

/** Role families, tested in order against the expanded title text. */
const FAMILIES = [
  ['eng-manager', /\b(engineer(ing)? manager|manager (of )?engineer(ing)?|(director|head|vp) (of )?engineer(ing)?)\b/],
  ['data', /\b(data (scientist|science|engineer\w*|analyst|analytics)|analytics|business intelligence)\b/],
  ['design', /\b(designer|design lead|ux|ui|user experience|user research\w*)\b/],
  ['legal', /\b(counsel|legal|attorney|lawyer|paralegal|policy|compliance|privacy|regulatory)\b/],
  ['people', /\b(recruit\w*|talent|people|human resources|sourcer)\b/],
  ['finance', /\b(financ\w*|accountant|accounting|tax|treasury|controller|payroll)\b/],
  ['sales', /\b(account (executive|manager|director)|sales|business development|solutions? (architect|engineer|consultant)|partner\w*|customer success|go to market|forward deployed|deployment strategist)\b/],
  ['marketing', /\b(marketing|communications|comms|content|brand|growth|community|events)\b/],
  ['product', /\b(product (manager|management|lead|owner|director)|(head|director|vp) (of )?product)\b/],
  ['program', /\b(program manager|project manager|technical program|chief of staff|operations|strategy)\b/],
  ['support', /\b(support|customer (experience|service)|technical account)\b/],
  ['ml', /\b(machinelearning|research (engineer|scientist)|scientist|researcher|research|ai|deep learning|nlp|computer vision|interpretability|alignment|pretraining|reinforcement learning|llm)\b/],
  ['hardware', /\b(electrical|mechanical|hardware|firmware|embedded|rf|avionics|manufacturing|propulsion|aerospace|structural|thermal|test engineer|integration engineer|systems engineer|technician)\b/],
  ['security', /\b(security|offensive|red team|threat|detection)\b/],
  ['swe', /\b(software|engineer|sitereliability|devops|infrastructure|platform|backend|frontend|fullstack|mobile|ios|android|web)\b/],
];

/** Partial credit between related families (symmetric). */
const FAMILY_AFFINITY = {
  'swe|security': 0.6, 'swe|ml': 0.45, 'swe|data': 0.45, 'ml|data': 0.55, 'swe|eng-manager': 0.4,
  'swe|hardware': 0.35, 'product|program': 0.35, 'sales|support': 0.4, 'sales|marketing': 0.3,
  'product|design': 0.25, 'eng-manager|program': 0.25,
};

/** Role family id for a title, or null when nothing matches. */
export function roleFamily(title) {
  const s = expand(title);
  for (const [id, re] of FAMILIES) if (re.test(s)) return id;
  return null;
}

function familySim(a, b) {
  if (!a || !b) return 0.35;
  if (a === b) return 1;
  return FAMILY_AFFINITY[`${a}|${b}`] ?? FAMILY_AFFINITY[`${b}|${a}`] ?? 0;
}

/** Seniority guessed from a free-text title (null when the title has no level words). */
export function inferSeniority(title) {
  const s = expand(title);
  if (/\b(intern|internship|apprentice)\b/.test(s)) return 'Intern';
  if (/\b(chief|vp|vice president|head|director)\b/.test(s)) return 'Director+';
  if (/\b(staff|principal|distinguished|fellow)\b/.test(s)) return 'Staff+';
  if (/\bmanager\b/.test(s) && !/\b(product|program|project|account|partner\w*|marketing|success|community|office|operations|territory|sales)\s+manager\b/.test(s)) return 'Manager';
  if (/\b(senior|lead)\b/.test(s)) return 'Senior';
  if (/\b(junior|new grad|graduate|entry|associate|trainee)\b/.test(s)) return 'Entry';
  return null;
}

// ---------------------------------------------------------------------------
// Similarity
// ---------------------------------------------------------------------------

export const SENIORITY_LADDER = ['Intern', 'Entry', 'Mid', 'Senior', 'Staff+', 'Manager', 'Director+'];
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

/** Location similarity in [0,1] between a resolved query location and a job. */
export function locationSim(ql, job) {
  if (!ql) return 1;
  const locs = job.locations || [];
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

/** IDF-weighted overlap: 0.7 * coverage of the query's tokens + 0.3 * precision. */
function tokenSim(qTokens, jTokens, idf) {
  if (!qTokens.length || !jTokens.length) return 0;
  const js = new Set(jTokens);
  let inter = 0, qSum = 0, jSum = 0;
  for (const t of qTokens) { const w = idf(t); qSum += w; if (js.has(t)) inter += w; }
  for (const t of jTokens) jSum += idf(t);
  return 0.7 * (inter / qSum) + 0.3 * (inter / jSum);
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
 */
export function estimateComp(allJobs, query = {}) {
  const q = {
    title: String(query.title || '').trim(),
    location: String(query.location || '').trim(),
    seniority: String(query.seniority || '').trim(),
    department: String(query.department || '').trim(),
    excludeId: query.excludeId ?? null,
  };
  const qn = normalizeTitle(q.title);
  const level = q.seniority || qn.seniority || '';
  const ql = resolveLocation(q.location, allJobs || []);
  const used = { ...q, seniority: level, family: qn.family, tokens: qn.tokens, location: ql?.key || '' };

  const pool = [];
  for (const job of allJobs || []) {
    if (!job || (q.excludeId != null && job.id === q.excludeId)) continue;
    const pay = salaryUSD(job);
    if (pay) pool.push({ job, pay, norm: normalizeTitle(job.title) });
  }
  const empty = (explanation) => ({
    low: null, mid: null, high: null, currency: 'USD', confidence: 'Low', n: 0,
    comparables: [], scores: [], explanation, query: used,
  });
  if (!pool.length) return empty('No roles with published pay to compare against.');

  const idf = buildIdf(pool.map((p) => p.norm));
  const hasTitle = qn.tokens.length > 0;
  for (const p of pool) {
    const ts = hasTitle ? 0.7 * tokenSim(qn.tokens, p.norm.tokens, idf) + 0.3 * familySim(qn.family, p.norm.family) : 1;
    p.titleSim = ts;
    p.w = ts * ts * senioritySim(level, p.job.seniority) * deptSim(q.department, p.job.department) * locationSim(ql, p.job);
  }
  pool.sort((a, b) => b.w - a.w || String(b.job.updatedAt || '').localeCompare(String(a.job.updatedAt || '')));
  const best = pool[0].w;
  if (!(best >= MIN_WEIGHT)) {
    return empty(q.title
      ? `No roles with published pay look comparable to “${q.title}”. Try a broader title.`
      : 'No comparable roles with published pay.');
  }
  const cut = Math.max(MIN_WEIGHT, REL_WEIGHT * best);
  const comps = pool.filter((p) => p.w >= cut).slice(0, MAX_COMPARABLES);

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
    level ? `at ${level} level` : '',
    ql ? (ql.remote ? 'for remote work' : `in or near ${ql.key}`) : '',
    q.department ? `in ${q.department}` : '',
  ].filter(Boolean).join(' ');
  const explanation =
    `Weighted by similarity to ${what} across ${plural(comps.length, 'salaried role')}` +
    (hasTitle ? ` (${close} with a closely matching title).` : '.') +
    ` Range is the ${LOW_P * 100}th–${HIGH_P * 100}th percentile of their posted pay bands` +
    (converted ? `; ${converted} non-USD ${converted === 1 ? 'band' : 'bands'} converted at approximate rates.` : '.') +
    (!hasTitle ? ' Add a role title for a sharper estimate.'
      : confidence === 'Low' ? ' Few close matches, so treat this as a rough guide.' : '');

  return {
    low, mid, high, currency: 'USD', confidence, n: comps.length,
    comparables: comps.slice(0, 5).map((p) => p.job),
    scores: comps.slice(0, 5).map((p) => Math.round(p.w * 100) / 100),
    explanation, query: used,
  };
}

/** Compstimate for one posting (e.g. in a job drawer), excluding the posting itself. */
export function compstimateForJob(allJobs, job) {
  if (!job) return estimateComp(allJobs, {});
  const onsite = (job.locations || []).find((l) => !l.remote);
  const loc = onsite ? locationKey(onsite) : job.remote ? 'Remote' : '';
  return estimateComp(allJobs, {
    title: job.title, seniority: job.seniority || '', department: job.department || '', location: loc, excludeId: job.id,
  });
}

// ---------------------------------------------------------------------------
// Form option helpers (pure, exported for tests)
// ---------------------------------------------------------------------------

const LEVEL_PREFIX = /^(?:(?:senior|sr\.?|staff|principal|lead|junior|jr\.?|associate|head of|director of|distinguished)\s+)+/i;

/** Datalist suggestions: role titles without level prefixes, most common first. */
export function titleSuggestions(jobs, limit = 250) {
  const count = new Map();
  const bump = (t) => { if (t) count.set(t, (count.get(t) || 0) + 1); };
  for (const j of jobs || []) {
    const t = String(j.title || '').replace(LEVEL_PREFIX, '').replace(/\s+(?:I{1,3}|IV|[1-4])$/, '').trim();
    if (!t) continue;
    const role = t.split(/\s*(?:,|\s[-–—|:]\s|\()\s*/)[0].trim();
    bump(role);
    if (role !== t) bump(t);
  }
  return [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([t]) => t);
}

/** Location options [{ value, label, count }] sorted by count (Remote included). */
export function locationOptions(jobs) {
  const count = new Map();
  for (const j of jobs || []) {
    const keys = new Set((j.locations || []).map(locationKey).filter(Boolean));
    if (!keys.size && j.remote) keys.add('Remote');
    for (const k of keys) count.set(k, (count.get(k) || 0) + 1);
  }
  return [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([value, n]) => ({ value, label: value, count: n }));
}

function defaultTitle(jobs) {
  return titleSuggestions((jobs || []).filter((j) => salaryUSD(j)), 1)[0] || '';
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

function jobMeta(job) {
  const loc = (job.locations || [])[0];
  const where = loc ? (loc.remote ? loc.name || 'Remote' : loc.city || loc.name) : job.remote ? 'Remote' : '';
  const more = (job.locations || []).length > 1 ? ` +${job.locations.length - 1}` : '';
  return [where && where + more, job.seniority, job.department].filter(Boolean).join(' · ');
}

function payRange(job) {
  const p = salaryUSD(job);
  if (!p) return '—';
  const a = formatMoney(p.min), b = formatMoney(p.max);
  return (a === b ? a : `${a}–${b}`) + (p.converted ? '*' : '');
}

/**
 * Compact Compstimate form + result card.
 * @param {HTMLElement} container
 * @param {{ getJobs?: () => Job[], onSelect?: (job) => void, query?: object, headingLevel?: number }} opts
 */
export function createCompstimateWidget(container, { getJobs, onSelect, query: initial, headingLevel = 2 } = {}) {
  const id = { head: uid('comp'), title: uid('comp-t'), list: uid('comp-dl'), loc: uid('comp-l'), sen: uid('comp-s') };
  let jobs = [];
  let result = null;
  let query = { title: '', location: '', seniority: '', department: '', ...(initial || {}) };
  let autoTitle = !query.title;
  let timer = 0;

  const titleInput = h('input', {
    id: id.title, class: 'ms-comp__input', type: 'text', list: id.list, autocomplete: 'off',
    spellcheck: 'false', placeholder: 'e.g. Software Engineer', value: query.title,
    'aria-describedby': `${id.head}-sub`,
  });
  const datalist = h('datalist', { id: id.list });
  const locSelect = h('select', { id: id.loc, class: 'ms-comp__select' });
  const senSelect = h('select', { id: id.sen, class: 'ms-comp__select' });
  const resultEl = h('div', { class: 'ms-comp__result' });
  const live = h('p', { class: 'msf-sr', 'aria-live': 'polite', 'aria-atomic': 'true' });
  const hTag = `h${Math.min(6, Math.max(1, headingLevel))}`;
  const subTag = `h${Math.min(6, Math.max(1, headingLevel + 1))}`;

  const root = h('section', { class: 'ms-comp', 'aria-labelledby': id.head },
    h('header', { class: 'ms-comp__head' },
      h(hTag, { id: id.head, class: 'ms-comp__title' }, 'Compstimate'),
      h('p', { id: `${id.head}-sub`, class: 'ms-comp__sub' }, 'Estimated base pay for a role, from comparable postings on this board.')),
    h('form', { class: 'ms-comp__form', role: 'search', 'aria-label': 'Compstimate role details', onsubmit: (e) => { e.preventDefault(); run(); } },
      h('div', { class: 'msf-field msf-field--wide' }, h('label', { for: id.title }, 'Role title'), titleInput, datalist),
      h('div', { class: 'msf-field' }, h('label', { for: id.loc }, 'Location'), locSelect),
      h('div', { class: 'msf-field' }, h('label', { for: id.sen }, 'Level'), senSelect)),
    resultEl, live);
  container.appendChild(root);

  titleInput.addEventListener('input', () => {
    autoTitle = false;
    query.title = titleInput.value;
    clearTimeout(timer);
    timer = setTimeout(run, 160);
  });
  titleInput.addEventListener('change', () => { query.title = titleInput.value; run(); });
  locSelect.addEventListener('change', () => { query.location = locSelect.value; run(); });
  senSelect.addEventListener('change', () => { query.seniority = senSelect.value; run(); });

  function fillOptions() {
    datalist.replaceChildren(...titleSuggestions(jobs).map((t) => h('option', { value: t })));
    const locs = locationOptions(jobs);
    if (query.location && !locs.some((o) => o.value === query.location)) query.location = '';
    locSelect.replaceChildren(
      h('option', { value: '' }, 'Any location'),
      ...locs.map((o) => h('option', { value: o.value, selected: o.value === query.location }, `${o.label} (${o.count})`)));
    locSelect.value = query.location;
    const levels = new Map();
    for (const j of jobs) if (j.seniority) levels.set(j.seniority, (levels.get(j.seniority) || 0) + 1);
    senSelect.replaceChildren(
      h('option', { value: '' }, 'Any level'),
      ...SENIORITY_LADDER.filter((s) => levels.has(s) || s === query.seniority)
        .map((s) => h('option', { value: s }, `${s} (${levels.get(s) || 0})`)));
    senSelect.value = query.seniority;
  }

  function run() {
    clearTimeout(timer);
    result = estimateComp(jobs, query);
    render();
  }

  function render() {
    resultEl.replaceChildren();
    if (!jobs.length) {
      resultEl.appendChild(h('p', { class: 'ms-comp__empty' }, 'Load a job board to estimate pay.'));
      live.textContent = '';
      return;
    }
    if (result.mid == null) {
      resultEl.appendChild(h('div', { class: 'ms-comp__card ms-comp__card--empty' },
        h('p', { class: 'ms-comp__empty-title' }, 'No estimate yet'),
        h('p', { class: 'ms-comp__empty' }, result.explanation)));
      live.textContent = result.explanation;
      return;
    }
    const { low, mid, high, confidence, n } = result;
    const market = jobs.map(salaryUSD).filter(Boolean).map((p) => p.mid);
    let lo = Math.min(percentile(market, 0.05), low), hi = Math.max(percentile(market, 0.95), high);
    if (!(hi > lo)) { lo = low * 0.8; hi = high * 1.2 || 1; }
    const pad = (hi - lo) * 0.04; lo -= pad; hi += pad;
    const pos = (v) => `${((v - lo) / (hi - lo)) * 100}%`;
    const rangeLabel = `Estimated range ${formatMoney(low)} to ${formatMoney(high)}, within this board's typical pay spread of ${formatMoney(percentile(market, 0.05))} to ${formatMoney(percentile(market, 0.95))}`;

    const card = h('div', { class: 'ms-comp__card' },
      h('div', { class: 'ms-comp__eyebrow' }, 'Estimated base salary'),
      h('div', { class: 'ms-comp__hero-row' },
        h('span', { class: 'ms-comp__hero' }, formatMoney(mid)),
        h('span', { class: 'ms-comp__per' }, 'USD / yr')),
      h('div', { class: `ms-comp__conf ms-comp__conf--${confidence.toLowerCase()}` },
        signalIcon(CONF_LEVEL[confidence]),
        h('span', { class: 'ms-comp__conf-label' }, `${confidence} confidence`),
        h('span', { class: 'ms-comp__conf-n' }, `based on ${plural(n, 'comparable role')}`)),
      h('div', { class: 'ms-comp__range' },
        h('div', { class: 'ms-comp__range-ends' },
          h('span', null, h('span', { class: 'ms-comp__k' }, 'Low '), h('b', null, formatMoney(low))),
          h('span', null, h('span', { class: 'ms-comp__k' }, 'High '), h('b', null, formatMoney(high)))),
        h('div', { class: 'ms-comp__track', role: 'img', 'aria-label': rangeLabel },
          h('span', { class: 'ms-comp__band', style: { left: pos(low), width: `calc(${pos(high)} - ${pos(low)})` } }),
          h('span', { class: 'ms-comp__dot', style: { left: pos(mid) } })),
        h('div', { class: 'ms-comp__scale', 'aria-hidden': 'true' },
          h('span', null, formatMoney(lo + pad)), h('span', null, 'board pay spread (P5–P95)'), h('span', null, formatMoney(hi - pad)))),
      h('p', { class: 'ms-comp__explain' }, result.explanation));

    const list = h('ol', { class: 'ms-comp__list' }, result.comparables.map((job, i) => {
      const score = Math.round((result.scores[i] ?? 0) * 100);
      const btn = h('button', {
        type: 'button', class: 'ms-comp__item', dataset: { key: `comp:${job.id}` },
        'aria-label': `${job.title}, ${jobMeta(job)}, pays ${payRange(job).replace('–', ' to ')}, ${score}% match. Open role.`,
        onclick: () => onSelect && onSelect(job),
      },
      h('span', { class: 'ms-comp__item-main' },
        h('span', { class: 'ms-comp__item-title' }, job.title),
        h('span', { class: 'ms-comp__item-meta' }, jobMeta(job))),
      h('span', { class: 'ms-comp__item-side' },
        h('span', { class: 'ms-comp__item-pay' }, payRange(job)),
        h('span', { class: 'ms-comp__match' }, `${score}% match`)));
      return h('li', null, btn);
    }));
    const foot = result.comparables.some((j) => salaryUSD(j)?.converted)
      ? h('p', { class: 'ms-comp__foot' }, '* converted to USD at approximate rates') : null;

    resultEl.append(card,
      h('div', { class: 'ms-comp__comps' },
        h(subTag, { class: 'ms-comp__comps-title' }, 'Most comparable roles'),
        list, foot));
    live.textContent = `Compstimate ${formatMoney(mid)}, range ${formatMoney(low)} to ${formatMoney(high)}, ${confidence.toLowerCase()} confidence, based on ${plural(n, 'comparable role')}.`;
  }

  function update(allJobs) {
    jobs = Array.isArray(allJobs) ? allJobs : (typeof getJobs === 'function' ? getJobs() || [] : []);
    if (autoTitle) {
      query.title = defaultTitle(jobs);
      titleInput.value = query.title;
      autoTitle = true;
    }
    fillOptions();
    run();
  }

  function setQuery(partial = {}) {
    query = { ...query, ...partial };
    if (partial.title != null) { titleInput.value = query.title; autoTitle = false; }
    fillOptions();
    run();
  }

  if (typeof getJobs === 'function') update(); else render();

  return {
    update,
    setQuery,
    getQuery: () => ({ ...query }),
    getResult: () => result,
    destroy() { clearTimeout(timer); root.remove(); },
    el: root,
  };
}
