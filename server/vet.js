// Salary vetting gate (pure, browser-safe: bundled to dist/lib/ for GitHub Pages).
//
// vetSalaries(jobs) runs over ONE company's full normalized job list (after
// per-job normalization, see normalize.js#normalizeJobs) and quarantines
// salaries that are implausible on their own or as statistical outliers:
//
//   job.salary     -> null               (never plotted, never in medians)
//   job.salaryRaw  =  what was parsed    (kept for "Pay unclear, see posting")
//   job.salaryFlag =  { codes: [...], reason: "human readable" }
//
// Checks (thresholds in VET; their justification is in docs/VETTING.md):
//   above_max         annual max > $1.2M (critical)
//   below_min         annual min < $15K on a full-time role (critical)
//   min_gt_max        min > max
//   range_ratio       max/min > VET.RATIO_QUARANTINE
//   junior_high       Intern/Fellow/Resident/Apprentice with mid > $300K/yr
//   senior_low        Director/VP with max < $60K/yr
//   hourly_high       hourly rate > $250/hour on any role, or > $200/hour on an
//                     explicitly full-time role (critical)
//   stat_outlier      log(mid) is an outlier company-wide (robust z on median/MAD:
//                     z > 3.5 or above the Tukey fence (k = 3); low side
//                     z < -4.5 and below the fence) AND within
//                     every comparison group (department, role family, pay kind)
//                     that has at least VET.MIN_GROUP members. Low-side
//                     statistical flags only apply to full-time salaried roles
//                     (hourly/stipend/contract/intern pay is legitimately low).
// Amounts are compared in USD with rough FX (USD_PER) so a GBP role is not an
// outlier against USD ones; FX only has to be right to within ~20%.

export const VET = Object.freeze({
  MAX_ANNUAL: 1_200_000,
  MIN_ANNUAL_FULLTIME: 15_000,
  RATIO_FLAG: 3,          // scan flag (human/LLM review), not a quarantine
  RATIO_QUARANTINE: 4,    // gate; legit real ranges reach 3.4x (docs/VETTING.md)
  Z: 3.5,                 // high side: |z| > 3.5 or above the Tukey fence
  Z_LOW: 4.5,             // low side: z < -4.5 AND below the Tukey fence (~6x
                          // under the median); gross low errors are caught by
                          // the $15K floor / range ratio, legit low-paid roles
                          // sit 3-5x under engineering medians (VETTING.md)
  TUKEY_K: 3,
  MIN_GROUP: 8,
  MIN_SIGMA: 0.4,         // floor on the MAD-based sigma (log units): with
                          // Z = 3.5 an outlier is >= e^1.4 ~ 4x from the median.
                          // 0.25 quarantined 6 legit low-paid roles (VETTING.md)
  JUNIOR_MAX_MID: 300_000,
  SENIOR_MIN_MAX: 60_000,
  HOURLY_MAX_FULLTIME: 200, // USD/hour on a role the source marks Full-time
  MAX_HOURLY_USD: 250,      // USD/hour on any role (lead hotfix 9947fe8; see VETTING.md)
});

export const CRITICAL_CODES = Object.freeze(['above_max', 'below_min', 'hourly_high']);

// Rough FX lives in salary.js (one table for parser bounds and this gate).
import { USD_PER, toUSD } from './salary.js';
export { USD_PER, toUSD };

const PART_TIME_RE = /part[- ]?time|intern|co-?op|contract|temporary|seasonal|casual|per diem/i;

/** Full-time unless the employment type or title says otherwise (null type counts as full-time). */
export function isFullTime(job) {
  if (job && PART_TIME_RE.test(job.employmentType || '')) return false;
  if (job && /\b(intern(ship)?|co-?op|part[- ]?time|contractor)\b/i.test(job.title || '')) return false;
  return true;
}

const JUNIOR_RE = /\b(intern(ship)?|co-?op|fellow(ship)?s?|resident|residency|apprentice(ship)?)\b/i;
const SENIOR_RE = /\b(director|vp|svp|evp|vice president)\b/i;
const NOT_JUNIOR_RE = /\b(technical|distinguished|senior|principal|research) fellow\b/i;

/** 'junior' | 'senior' | null from the title. */
export function titleClass(title) {
  const t = String(title || '');
  if (JUNIOR_RE.test(t) && !NOT_JUNIOR_RE.test(t)) return 'junior';
  if (SENIOR_RE.test(t) && !/\b(assistant|associate|coordinator) to\b/i.test(t)) return 'senior';
  return null;
}

const FAMILIES = [
  ['intern', /\b(intern(ship)?|co-?op|fellow(ship)?|resident|residency|apprentice)\b/i],
  ['hourly-ops', /\b(technician|operator|assembler|associate, (warehouse|supply|shipping|materials)|warehouse|forklift|machinist|welder|barista|cook|porter|custodian|janitor|food|driver|security officer|receiving)\b/i],
  ['annotation', /\b(annotat\w*|tutor|labeler|rater|data specialist)\b/i],
  ['executive', /\b(director|vp|vice president|head of|chief|president)\b/i],
  ['manager', /\bmanager\b/i],
  ['research', /\b(research(er)?|scientist)\b/i],
  ['engineering', /\b(engineer(ing)?|developer|architect|sre|devops|programmer|member of technical staff|mts)\b/i],
  ['sales', /\b(account|sales|business development|bdr|sdr|solutions|customer success|partner)\b/i],
  ['recruiting', /\b(recruit\w*|sourc\w*|talent|people|hr|human resources)\b/i],
  ['ops', /\b(operations|program|project|coordinator|specialist|analyst|strategist)\b/i],
];

/** Coarse role family from the title (first match wins). */
export function roleFamily(title) {
  const t = String(title || '');
  for (const [name, re] of FAMILIES) if (re.test(t)) return name;
  return 'other';
}

/** Pay kind of a Job salary: explicit kind, else hourly when the source interval was hourly. */
export function payKind(salary) {
  if (!salary) return null;
  if (salary.kind) return salary.kind;
  return salary.originalInterval === 'hour' ? 'hourly' : 'salary';
}

function fmt(n) {
  if (!Number.isFinite(n)) return String(n);
  if (n >= 1e6) return `$${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e5) return `$${Math.round(n / 1e3)}K`;
  if (n >= 1e3) return `$${(Math.round(n / 100) / 10).toLocaleString('en-US')}K`;
  return `$${Math.round(n)}`;
}

/**
 * Per-job checks that need no population: bounds, range sanity, title fit.
 * Returns [{ code, reason }]. `salary` defaults to job.salary (annualized Job shape).
 */
export function salaryChecks(job, salary = job && job.salary) {
  const out = [];
  if (!salary) return out;
  const cur = String(salary.currency || 'USD').toUpperCase();
  const min = Number(salary.min);
  const max = Number(salary.max);
  const mid = salary.mid != null ? Number(salary.mid) : (min + max) / 2;
  const usd = (n) => toUSD(n, cur) ?? n;
  const tag = cur === 'USD' ? '' : ` (${cur} ${Math.round(max).toLocaleString('en-US')} ≈ USD)`;
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    out.push({ code: 'not_numeric', reason: 'salary min/max are not numbers' });
    return out;
  }
  if (usd(max) > VET.MAX_ANNUAL) out.push({ code: 'above_max', reason: `annual max ${fmt(usd(max))}${tag} is above the ${fmt(VET.MAX_ANNUAL)} plausibility bound` });
  if (usd(min) < VET.MIN_ANNUAL_FULLTIME && isFullTime(job)) out.push({ code: 'below_min', reason: `annual min ${fmt(usd(min))} is below ${fmt(VET.MIN_ANNUAL_FULLTIME)} for a full-time role` });
  if (min > max) out.push({ code: 'min_gt_max', reason: 'min is greater than max' });
  else if (min > 0 && max / min > VET.RATIO_QUARANTINE) out.push({ code: 'range_ratio', reason: `range ${fmt(min)}–${fmt(max)} spans ${(max / min).toFixed(1)}x (more than ${VET.RATIO_QUARANTINE}x)` });
  // Hourly rates (Job salary keeps the source interval in originalInterval).
  if (salary.originalInterval === 'hour') {
    const rate = usd(max) / 2080;
    const ft = /full/i.test((job && job.employmentType) || '');
    if (rate > VET.MAX_HOURLY_USD) out.push({ code: 'hourly_high', reason: `hourly rate ${fmt(rate)}/hr is above the ${fmt(VET.MAX_HOURLY_USD)}/hr plausibility bound` });
    else if (ft && rate > VET.HOURLY_MAX_FULLTIME) out.push({ code: 'hourly_high', reason: `hourly rate ${fmt(rate)}/hr is implausible for a full-time role (more than ${fmt(VET.HOURLY_MAX_FULLTIME)}/hr)` });
  }
  const tc = titleClass(job && job.title);
  if (tc === 'junior' && usd(mid) > VET.JUNIOR_MAX_MID) out.push({ code: 'junior_high', reason: `${fmt(usd(mid))}/yr is implausible for an intern/fellow/resident title` });
  if (tc === 'senior' && usd(max) < VET.SENIOR_MIN_MAX) out.push({ code: 'senior_low', reason: `${fmt(usd(max))}/yr is implausible for a director/VP title` });
  return out;
}

/* ----------------------------------------------------------- statistics */

function median(sorted) {
  const n = sorted.length;
  if (!n) return NaN;
  return n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}

function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Robust summary of numbers: median, MAD-based sigma (1.4826*MAD, floored), Tukey fences. */
export function robustStats(values, { k = VET.TUKEY_K, minSigma = VET.MIN_SIGMA } = {}) {
  const s = values.filter(Number.isFinite).sort((a, b) => a - b);
  const med = median(s);
  const mad = median(s.map((v) => Math.abs(v - med)).sort((a, b) => a - b));
  const sigma = Math.max(1.4826 * mad, minSigma);
  const q1 = quantile(s, 0.25);
  const q3 = quantile(s, 0.75);
  const iqr = Math.max(q3 - q1, minSigma);
  return { n: s.length, median: med, mad, sigma, q1, q3, lo: q1 - k * iqr, hi: q3 + k * iqr };
}

/**
 * { z, fence, outlier } for x against stats; fence is 'low' | 'high' | null.
 * High side: z > Z or above the fence. Low side: z < -Z_LOW and below the fence.
 */
export function outlierScore(x, st, { z = VET.Z, zLow = VET.Z_LOW } = {}) {
  const zz = (x - st.median) / st.sigma;
  const fence = x < st.lo ? 'low' : x > st.hi ? 'high' : null;
  const outlier = zz > 0 ? zz > z || fence === 'high' : zz < -zLow && fence === 'low';
  return { z: zz, outlier, fence };
}

const logMidUSD = (s) => {
  const mid = s.mid != null ? Number(s.mid) : (Number(s.min) + Number(s.max)) / 2;
  const usd = toUSD(mid, s.currency || 'USD');
  return usd > 0 ? Math.log(usd) : NaN;
};

/**
 * Statistical outliers among jobs (indexes into `jobs`). Only jobs with a
 * salary and no hard-check failure take part. A job is an outlier only if it
 * is one company-wide AND inside every group it belongs to that has at least
 * MIN_GROUP members (department, role family, pay kind): a $45K warehouse
 * role is low company-wide but normal among warehouse roles.
 */
export function statOutliers(jobs, { exclude = new Set() } = {}) {
  const pts = [];
  jobs.forEach((j, i) => {
    if (!j || !j.salary || exclude.has(i)) return;
    const x = logMidUSD(j.salary);
    if (!Number.isFinite(x)) return;
    pts.push({ i, x, groups: [`dept:${j.department || '-'}`, `family:${roleFamily(j.title)}`, `kind:${payKind(j.salary)}`] });
  });
  const result = new Map();
  if (pts.length < VET.MIN_GROUP) return result;
  const all = robustStats(pts.map((p) => p.x));
  const byGroup = new Map();
  for (const p of pts) for (const g of p.groups) { if (!byGroup.has(g)) byGroup.set(g, []); byGroup.get(g).push(p.x); }
  const groupStats = new Map();
  for (const [g, xs] of byGroup) if (xs.length >= VET.MIN_GROUP) groupStats.set(g, robustStats(xs));
  for (const p of pts) {
    const c = outlierScore(p.x, all);
    if (!c.outlier) continue;
    // Low side: full-time salaried roles only (hourly/stipend/contract/intern pay is legitimately low).
    if (c.z < 0 && (!isFullTime(jobs[p.i]) || payKind(jobs[p.i].salary) !== 'salary')) continue;
    let agree = true;
    const detail = [`company z=${c.z.toFixed(1)}${c.fence ? `, ${c.fence} fence` : ''}`];
    for (const g of p.groups) {
      const st = groupStats.get(g);
      if (!st) continue;
      const r = outlierScore(p.x, st);
      // Must be an outlier in the same direction within the group too.
      if (!r.outlier || Math.sign(r.z) !== Math.sign(c.z)) { agree = false; break; }
      detail.push(`${g} z=${r.z.toFixed(1)}`);
    }
    if (agree) result.set(p.i, { z: c.z, detail: detail.join('; '), median: Math.exp(all.median) });
  }
  return result;
}

/**
 * Vet one company's normalized jobs. Returns a new array; quarantined jobs are
 * copies with salary null, salaryRaw and salaryFlag. Jobs already quarantined
 * are left as they are (idempotent).
 */
export function vetSalaries(jobs, { stats = true } = {}) {
  if (!Array.isArray(jobs)) return jobs;
  const flags = new Map();
  jobs.forEach((j, i) => {
    if (!j || !j.salary) return;
    const c = salaryChecks(j);
    if (c.length) flags.set(i, c);
  });
  if (stats) {
    for (const [i, o] of statOutliers(jobs, { exclude: new Set(flags.keys()) })) {
      flags.set(i, [{ code: 'stat_outlier', reason: `pay ${fmt(toUSD(jobs[i].salary.mid, jobs[i].salary.currency) ?? jobs[i].salary.mid)}/yr is a statistical outlier for this company (median ${fmt(o.median)}; ${o.detail})` }]);
    }
  }
  if (!flags.size) return jobs;
  return jobs.map((j, i) => {
    const f = flags.get(i);
    if (!f) return j;
    return { ...j, salary: null, salaryRaw: j.salary, salaryFlag: { codes: f.map((x) => x.code), reason: `Pay unclear: ${f.map((x) => x.reason).join('; ')}` } };
  });
}

/**
 * Jobs whose salary passed the gate, for aggregates (market comps, the
 * Compstimate backtest, medians). Applies vetSalaries per company (the
 * statistics are per company; idempotent on already-vetted jobs) and keeps
 * only jobs with a plotted salary. Never read salaryRaw for numbers.
 */
export function vettedSalaried(jobs) {
  if (!Array.isArray(jobs)) return [];
  const byCompany = new Map();
  for (const j of jobs) {
    if (!j) continue;
    const k = j.company || '';
    if (!byCompany.has(k)) byCompany.set(k, []);
    byCompany.get(k).push(j);
  }
  const out = [];
  for (const group of byCompany.values()) for (const j of vetSalaries(group)) if (j.salary) out.push(j);
  return out;
}
