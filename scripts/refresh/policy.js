// Updater: product-policy constants (docs/DATA_FRESHNESS.md; log docs/process/freshness-jobs.md).
//
// These are OUR choices (score anchors, grade cut-offs, vetting bounds, parser bounds,
// annualization factors, listing-age buckets, minN, the LLM-review model id, confidence
// rules). They are never auto-updated. Each gets a 'manual' Result with:
//   - a review checklist and a staleness date: lastReviewed (registry `lastReviewed`, else the
//     entry's asOf, else POLICY[id].lastReviewed) + cadence + grace. The clock is NOT the
//     registry's lastChecked, which the orchestrator bumps on every run;
//   - drift checks that every copy of a constant (code, UI copy, docs) still says the same;
//   - a cheap data check on the newest snapshots where one exists (the share of Juice scores
//     that clip at 100, grade mix, pay sitting near a vetting bound, groups suppressed by minN,
//     ...), shared with scripts/refresh/jobs.js (loaded once per run).
// Status: 'flag' when a copy disagrees or a data check says the policy no longer fits,
// 'stale' when the review is past due, else 'ok'. llm-vet-config is 'detect': with
// ANTHROPIC_API_KEY it asks the Models API whether the default model id still exists.
import { netForShownScore } from './examples.js';
import fs from 'node:fs';
import path from 'node:path';
import { result, errorResult, isoDate, extractConst, findFigure, excerptAround, daysBetween } from './lib.js';
import { loadDeps, loadJobData, reviewDue, quantile } from './jobs.js';

export const MODULE = Object.freeze({
  name: 'policy',
  ids: [
    'juice-score-anchors', 'juice-grades', 'juice-confidence-rules',
    'salary-vetting-bounds', 'salary-interval-factors', 'salary-parser-bounds',
    'llm-vet-config', 'listing-freshness-buckets', 'market-comps-policy', 'runtime-versions',
  ],
});

/**
 * Review cadence per group (registry `reviewCadence` / `cadence` win) and why.
 * lastReviewed: the date the constants were last set or reviewed by a person.
 */
export const POLICY = Object.freeze({
  'juice-score-anchors': { lastReviewed: '2026-10-02', cadence: 'yearly', why: 'tuned on one day of real postings; pay, tax and rent move yearly (re-check after the January tax-year updates)' },
  'juice-grades': { lastReviewed: '2026-10-02', cadence: 'yearly', why: 'reviewed with the score anchors' },
  'juice-confidence-rules': { lastReviewed: '2026-10-10', cadence: 'yearly', why: 'follows the source classes of cities.json and TAX_SOURCES; the monthly data check catches class changes in between' },
  'salary-vetting-bounds': { lastReviewed: '2026-10-02', cadence: 'quarterly', why: 'tuned on 8 boards; new boards (the /beta big-tech sites) keep arriving and VETTING.md §8 asks for a re-check per new board' },
  'salary-interval-factors': { lastReviewed: '2026-10-02', cadence: 'yearly', why: 'conventions (2080 h = 52 x 40); only a methodology decision changes them' },
  'salary-parser-bounds': { lastReviewed: '2026-10-02', cadence: 'yearly', why: 'nominal USD bounds erode with wage inflation (a few % a year)' },
  'llm-vet-config': { lastReviewed: '2026-10-06', cadence: 'quarterly', why: 'model ids and beta headers retire on a schedule' },
  'listing-freshness-buckets': { lastReviewed: '2026-10-02', cadence: 'yearly', why: 'UX choice; only changes with the filter design' },
  'market-comps-policy': { lastReviewed: '2026-10-02', cadence: 'yearly', why: 'minN 3 and $100 rounding are privacy/noise choices; revisit as boards grow' },
  'runtime-versions': { lastReviewed: '2026-10-10', cadence: 'semiannual', why: 'Node majors reach end of life every April; a new LTS starts each October' },
});

/** Data-check bounds (justified in docs/process/freshness-jobs.md §3). */
export const POLICY_BOUNDS = Object.freeze({
  juiceAt100MaxShare: 0.01,  // the old log curve put 1.7% of jobs at 100 and was replaced for it
  juiceRindMaxShare: 0.05,   // calibration had 1% Rind; 5x that means costs or tax are off
  juiceP90Score: [80, 95],   // LIVABILITY: the 90th percentile should score ~85-90 with headroom
  gradeMaxShare: 0.6,        // one grade holding 60%+ of scored jobs stops discriminating
  nearBoundShare: 0.01,      // > 1% of salaried pay within 10% of a quarantine bound
  nearBoundBand: 0.1,
  bucketMaxShare: 0.8,       // one listing-age bucket holding 80%+ of dated postings
  suppressedMaxShare: 0.5,   // more than half the salaried jobs' exact comps cells suppressed by minN
});

const pct = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1000) / 10);
const finding = (key, encoded, official, unit, note, url = null) => ({ key, encoded, official, unit, url, note });
const SEV = { ok: 0, skipped: 1, stale: 2, drift: 3, flag: 4, error: 5 };
const worst = (a, b) => (SEV[b] > SEV[a] ? b : a);

/** Staleness of a policy group's human review. */
export function policyReview(ctx, id) {
  const entry = ctx.entry ? ctx.entry(id) : undefined;
  const d = POLICY[id] || {};
  const merged = { ...entry, lastReviewed: (entry && entry.lastReviewed) || (entry && entry.asOf) || d.lastReviewed, reviewCadence: (entry && (entry.reviewCadence || (entry.cadence !== 'ad-hoc' ? entry.cadence : null))) || d.cadence };
  return reviewDue(merged, id, ctx.now || new Date());
}

function finish(ctx, id, mode, status, { summary, findings = [], evidence = [], checklist = [], sourceAsOf = null }) {
  const rv = policyReview(ctx, id);
  let st = status;
  if (st === 'ok' && rv.due) st = 'stale';
  const why = POLICY[id] ? POLICY[id].why : '';
  return result(id, mode, st, {
    sourceAsOf: sourceAsOf || rv.lastReviewed || null,
    summary: `${summary}; review ${rv.cadence}${rv.dueDate ? `, next due ${rv.dueDate}` : ''}${rv.due ? ' (PAST DUE)' : ''}`,
    findings: [...findings, finding('review cadence', rv.cadence, rv.dueDate, 'next due', why)],
    evidence,
    checklist,
  });
}

const read = (ctx, file) => { try { return ctx.readText(file); } catch { return null; } };
const constOf = (ctx, file, name) => { const t = read(ctx, file); return t == null ? undefined : extractConst(t, name); };
const scored = (boards) => boards.flatMap((b) => b.jobs.filter((j) => j && j.salary && j.juice && j.juice.best).map((j) => j.juice.best));

/** Pure: Juice distribution checks. -> { n, at100, rind, p90, p50, problems: [] } */
export function juiceDistribution(bests, { scoreFromNet }) {
  const n = bests.length;
  const scores = bests.map((b) => Math.round(scoreFromNet(b.net)));
  const at100 = scores.filter((s) => s >= 100).length;
  const rind = bests.filter((b) => !(b.net > 0)).length;
  const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
  const p90 = r1(quantile(scores, 0.9));
  const problems = [];
  if (n && at100 / n > POLICY_BOUNDS.juiceAt100MaxShare) problems.push(`${pct(at100 / n)}% of scored jobs round to 100 (bound ${pct(POLICY_BOUNDS.juiceAt100MaxShare)}%): the curve clips at the top`);
  if (n && rind / n > POLICY_BOUNDS.juiceRindMaxShare) problems.push(`${pct(rind / n)}% of scored jobs are Rind (net <= 0; bound ${pct(POLICY_BOUNDS.juiceRindMaxShare)}%)`);
  if (n && p90 != null && (p90 < POLICY_BOUNDS.juiceP90Score[0] || p90 > POLICY_BOUNDS.juiceP90Score[1])) problems.push(`90th-percentile score ${p90} is outside ${POLICY_BOUNDS.juiceP90Score.join('-')}`);
  return { n, at100, rind, p50: r1(quantile(scores, 0.5)), p90, netP90: quantile(bests.map((b) => b.net), 0.9), problems };
}

/** Pure: share of each grade among scored bests; problems when one grade dominates. */
export function gradeMix(bests) {
  const n = bests.length;
  const counts = {};
  for (const b of bests) counts[b.grade || '?'] = (counts[b.grade || '?'] || 0) + 1;
  const problems = Object.entries(counts).filter(([, c]) => n && c / n > POLICY_BOUNDS.gradeMaxShare).map(([g, c]) => `${g} holds ${pct(c / n)}% of scored jobs (bound ${pct(POLICY_BOUNDS.gradeMaxShare)}%)`);
  return { n, counts, shares: Object.fromEntries(Object.entries(counts).map(([g, c]) => [g, pct(c / n)])), problems };
}

/**
 * Pure: vetted salaried pay sitting near a quarantine bound (USD, annual).
 * -> { n, near: { above_max, below_min, range_ratio, hourly_high }, maxUSD, maxRatio }
 */
export function nearBounds(jobs, { VET, toUSD, isFullTime }, band = POLICY_BOUNDS.nearBoundBand) {
  const near = { above_max: 0, below_min: 0, range_ratio: 0, hourly_high: 0 };
  let n = 0, maxUSD = 0, maxRatio = 0, maxAt = null;
  for (const j of jobs) {
    const s = j && j.salary;
    if (!s) continue;
    n++;
    const cur = String(s.currency || 'USD').toUpperCase();
    const max = toUSD(Number(s.max), cur) ?? Number(s.max);
    const min = toUSD(Number(s.min), cur) ?? Number(s.min);
    if (max > maxUSD) { maxUSD = max; maxAt = `${j.id} ${j.title}`; }
    if (min > 0 && s.max / s.min > maxRatio) maxRatio = s.max / s.min;
    if (max >= VET.MAX_ANNUAL * (1 - band)) near.above_max++;
    if (isFullTime(j) && min <= VET.MIN_ANNUAL_FULLTIME * (1 + band)) near.below_min++;
    if (s.min > 0 && s.max / s.min >= VET.RATIO_QUARANTINE * (1 - band)) near.range_ratio++;
    if (s.originalInterval === 'hour' && max / 2080 >= VET.MAX_HOURLY_USD * (1 - band)) near.hourly_high++;
  }
  return { n, near, maxUSD: Math.round(maxUSD), maxAt, maxRatio: Math.round(maxRatio * 100) / 100 };
}

/** Pure: how many salaried, family-assigned jobs lose their exact comps cell / family roll-up to minN. */
export function minNSuppression(boards, { roleFamily, usdMid }, minN) {
  const groups = new Map();
  const fam = new Map();
  let n = 0;
  const keys = [];
  for (const b of boards) for (const j of b.jobs) {
    if (!j || !j.salary || usdMid(j.salary) == null) continue;
    let f = null;
    try { f = roleFamily(j.title || '', j); } catch { f = null; }
    if (!f) continue;
    n++;
    const k = `${b.slug}|${f}|${j.seniority || 'Mid'}`;
    const kf = `${b.slug}|${f}`;
    groups.set(k, (groups.get(k) || 0) + 1);
    fam.set(kf, (fam.get(kf) || 0) + 1);
    keys.push([k, kf]);
  }
  const exact = keys.filter(([k]) => groups.get(k) < minN).length;
  const family = keys.filter(([, kf]) => fam.get(kf) < minN).length;
  return { n, exactSuppressed: exact, familySuppressed: family, exactShare: n ? exact / n : null, familyShare: n ? family / n : null, groups: groups.size, suppressedGroups: [...groups.values()].filter((c) => c < minN).length };
}

export const NODE_SCHEDULE_URL = 'https://raw.githubusercontent.com/nodejs/Release/main/schedule.json';
export const NODE_EOL_WARN_DAYS = 120;

/**
 * Pure: Node majors the repo runs on. package.json `engines.node` (the minimum major of a
 * ">=N" / "^N" / "N.x" range) and every `node-version:` in the workflows, with a
 * `${{ matrix.node }}` resolved from that file's `node: [..]` matrix.
 * -> [{ where, major }]
 */
export function nodeVersionsInUse(pkgText, workflows) {
  const out = [];
  try {
    const range = JSON.parse(pkgText || '{}').engines?.node;
    const m = range && /(\d+)/.exec(range);
    if (m) out.push({ where: `package.json engines.node "${range}" (minimum)`, major: Number(m[1]) });
  } catch { /* no package.json */ }
  for (const [file, text] of workflows) {
    const lines = String(text || '').split('\n');
    const matrix = /^\s*node:\s*\[([^\]]+)\]/m.exec(text || '');
    lines.forEach((l, i) => {
      const m = /node-version:\s*(.+?)\s*$/.exec(l);
      if (!m) return;
      const v = m[1].replace(/["']/g, '');
      if (/matrix\.node/.test(v) && matrix) for (const x of matrix[1].split(',')) { const n = parseInt(x, 10); if (n) out.push({ where: `${file}:${i + 1} matrix`, major: n }); }
      else { const n = parseInt(v, 10); if (n) out.push({ where: `${file}:${i + 1}`, major: n }); }
    });
  }
  return out;
}
/** Pure: each major against the release schedule at `today`: [{ major, end, past, daysLeft, where: [..] }]. */
export function nodeEol(inUse, schedule, today) {
  const by = new Map();
  for (const u of inUse) { const e = by.get(u.major) || { major: u.major, where: [] }; e.where.push(u.where); by.set(u.major, e); }
  return [...by.values()].sort((a, b) => a.major - b.major).map((e) => {
    const s = schedule && schedule[`v${e.major}`];
    const end = s && s.end ? s.end : null;
    const daysLeft = end ? daysBetween(today, end) : null;
    return { ...e, end, lts: !!(s && s.lts), past: daysLeft != null && daysLeft < 0, daysLeft };
  });
}

/** Numbers a doc states, by regex: [{ key, doc, code, ok }]. */
function docChecks(text, checks) {
  return checks.map(([key, re, code, parse = 'money']) => {
    const v = text == null ? null : findFigure(text, re, parse);
    return { key, doc: v, code, ok: v != null && Math.abs(v - code) < 1e-9 * Math.max(1, Math.abs(code)) };
  });
}

export async function check(ctx) {
  let D, data;
  try { D = await loadDeps(); } catch (err) { return MODULE.ids.map((id) => errorResult(id, 'manual', new Error(`product modules failed to load: ${err.message}`))); }
  try { data = await loadJobData(ctx, { D }); } catch (err) { data = { boards: [], problems: [err.message], cities: null }; }
  let juice, vet, salary, history, llmVet;
  try {
    [juice, vet, salary, history, llmVet] = await Promise.all([
      import('../../server/juice.js'), import('../../server/vet.js'), import('../../server/salary.js'), import('../../server/history.js'), import('../llm-vet.js'),
    ]);
  } catch (err) { return MODULE.ids.map((id) => errorResult(id, 'manual', new Error(`policy modules failed to load: ${err.message}`))); }
  const boards = (data.boards || []).filter((b) => b.mode !== 'demo');
  const haveData = boards.length > 0;
  const dataNote = haveData ? `${boards.length} boards` : 'no snapshots (data checks not run)';
  const asOf = haveData ? boards.map((b) => isoDate(b.fetchedAt)).filter(Boolean).sort().pop() : null;
  const out = [];
  const safe = async (id, mode, fn) => { try { out.push(await fn()); } catch (err) { out.push(errorResult(id, mode, err)); } };
  const liv = read(ctx, 'docs/LIVABILITY.md');
  const vettingDoc = read(ctx, 'docs/VETTING.md');

  // ---- Juice score anchors
  await safe('juice-score-anchors', 'manual', () => {
    const A = juice.SCORE_ANCHORS;
    const findings = [];
    const evidence = [];
    let status = 'ok';
    const expectFull = Math.ceil(A.K * Math.log(200));
    if (A.fullGlassUSD !== expectFull || Math.round(juice.scoreFromNet(A.fullGlassUSD)) !== 100 || Math.round(juice.scoreFromNet(A.fullGlassUSD - 1)) >= 100) {
      status = 'flag'; findings.push(finding('SCORE_ANCHORS.fullGlassUSD', expectFull, A.fullGlassUSD, 'USD', 'must be the smallest net whose rounded score is 100'));
    }
    const pal = constOf(ctx, 'public/viz/palette.js', 'JUICE_ANCHORS');
    if (!pal || pal.K !== A.K || pal.fullGlassUSD !== A.fullGlassUSD) { status = 'flag'; findings.push(finding('public/viz/palette.js JUICE_ANCHORS', `K ${A.K}, fullGlassUSD ${A.fullGlassUSD}`, pal ? `K ${pal.K}, fullGlassUSD ${pal.fullGlassUSD}` : 'missing', '', 'browser fallback copy of the curve disagrees with server/juice.js')); }
    for (const c of docChecks(liv, [['LIVABILITY K', /K = \$([\d,]+K?)/, A.K], ['LIVABILITY K (curve section)', /\*\*K = \$([\d,]+K?)\*\*/, A.K], ['LIVABILITY rounded-100 net', /100 needs at least \$([\d,]+)/, A.fullGlassUSD]])) {
      if (!c.ok) { status = 'flag'; findings.push(finding(`docs/LIVABILITY.md ${c.key}`, c.code, c.doc, 'USD', 'hand-written figure differs from server/juice.js')); }
    }
    let summary = `K $${A.K.toLocaleString('en-US')}, full glass $${A.fullGlassUSD.toLocaleString('en-US')}`;
    if (haveData) {
      const jd = juiceDistribution(scored(boards), juice);
      if (jd.problems.length) status = 'flag';
      findings.push(finding('scored jobs at 100', `<= ${pct(POLICY_BOUNDS.juiceAt100MaxShare)}%`, jd.n ? pct(jd.at100 / jd.n) : null, '% of scored', `${jd.at100}/${jd.n}`));
      findings.push(finding('Rind (net <= 0)', `<= ${pct(POLICY_BOUNDS.juiceRindMaxShare)}%`, jd.n ? pct(jd.rind / jd.n) : null, '% of scored', `${jd.rind}/${jd.n}`));
      findings.push(finding('90th-percentile score', POLICY_BOUNDS.juiceP90Score.join('-'), jd.p90, 'score', `net at p90 $${Math.round(jd.netP90 || 0).toLocaleString('en-US')}; median score ${jd.p50}`));
      const cal = liv && /\|\s*90th\s*\|\s*\$[\d,]+\s*\|\s*\$([\d,]+)\s*\|\s*\d+\s*\|\s*\*\*(\d+)\*\*/.exec(liv);
      if (cal) findings.push(finding('LIVABILITY calibration p90 (2026-10-02)', `net $${cal[1]}, score ${cal[2]}`, `net $${Math.round(jd.netP90 || 0).toLocaleString('en-US')}, score ${jd.p90}`, '', 'hand-written calibration table (registry juice-calibration-doc); regenerate with docs/process/scripts/livability-juice-distribution.mjs'));
      summary += `; ${jd.n} scored jobs: ${jd.at100} at 100, ${jd.rind} Rind, p90 score ${jd.p90}${jd.problems.length ? ` (${jd.problems.join('; ')})` : ''}`;
    } else summary += `; ${dataNote}`;
    if (liv) evidence.push({ url: 'docs/LIVABILITY.md', fetchedAt: ctx.today, excerpt: excerptAround(liv, /100 needs at least/) });
    return finish(ctx, 'juice-score-anchors', 'manual', status, {
      summary, findings, evidence, sourceAsOf: asOf,
      checklist: [
        'Run `node docs/process/scripts/livability-juice-distribution.mjs` on the latest snapshots (or read this Result\'s findings).',
        'Check: no posting rounds to 100, Rind stays about 1%, and the 90th-percentile net scores 85-90. If not, propose a new K to the user in a PR (never auto-tuned).',
        'If K changes: server/juice.js SCORE_ANCHORS (+ its calibration comment), public/viz/palette.js JUICE_ANCHORS, public/mock-api.js, docs/LIVABILITY.md curve, legend points and calibration tables, test/juice.test.js pins, in one commit.',
        'Set lastReviewed for juice-score-anchors in data/freshness.json.',
      ],
    });
  });

  // ---- Juice grades
  await safe('juice-grades', 'manual', () => {
    const findings = [];
    let status = 'ok';
    const mins = juice.GRADES.map((g) => g.min).filter((m) => m > 0).sort((a, b) => a - b);
    const breaks = constOf(ctx, 'public/viz/palette.js', 'JUICE_BREAKS');
    if (!Array.isArray(breaks) || breaks.join() !== mins.join()) { status = 'flag'; findings.push(finding('public/viz/palette.js JUICE_BREAKS', mins.join(', '), Array.isArray(breaks) ? breaks.join(', ') : 'missing', 'score', 'map colour steps disagree with server/juice.js GRADES')); }
    const app = read(ctx, 'public/app.js') || '';
    const [lo, hi] = mins;
    for (const [label, re] of [['Juicy', new RegExp(`score ${hi}\\+`)], ['Ripe', new RegExp(`${lo}[–-]${hi - 1}`)], ['Dry', new RegExp(`under ${lo}`)]]) {
      if (!re.test(app)) { status = 'flag'; findings.push(finding(`public/app.js JUICE_GRADES ${label}`, String(re), 'not found', '', 'grade chip tooltip copy no longer matches GRADES')); }
    }
    for (const c of docChecks(liv, [[`LIVABILITY Juicy net (score ${hi})`, new RegExp(`${hi}-100 \\| ≥ \\$([\\d,]+)`), netForShownScore(juice, hi)], [`LIVABILITY Ripe net (score ${lo})`, new RegExp(`${lo}-${hi - 1} \\| ≥ \\$([\\d,]+)`), netForShownScore(juice, lo)]])) {
      if (!c.ok) { status = 'flag'; findings.push(finding(`docs/LIVABILITY.md ${c.key}`, c.code, c.doc, 'USD', 'grade table differs from the rounded-score thresholds (examples.js netForShownScore)')); }
    }
    let summary = `grades ${juice.GRADES.map((g) => `${g.label} >= ${g.min}`).join(', ')}, Rind when net <= 0`;
    if (haveData) {
      const gm = gradeMix(scored(boards));
      if (gm.problems.length) status = 'flag';
      findings.push(finding('grade mix', 'calibration 2026-10-02: Juicy 46%, Ripe 39%, Dry 14%, Rind 1%', Object.entries(gm.shares).map(([g, s]) => `${g} ${s}%`).join(', '), '% of scored', gm.problems.join('; ') || `${gm.n} scored jobs`));
      summary += `; mix ${Object.entries(gm.shares).map(([g, s]) => `${g} ${s}%`).join(', ')}${gm.problems.length ? ` (${gm.problems.join('; ')})` : ''}`;
    } else summary += `; ${dataNote}`;
    return finish(ctx, 'juice-grades', 'manual', status, {
      summary, findings, sourceAsOf: asOf,
      checklist: [
        'Review together with juice-score-anchors on the latest grade mix (findings).',
        'Any change: server/juice.js GRADES, public/viz/palette.js JUICE_BREAKS, public/app.js JUICE_GRADES tooltips, public/viz/map.js legend copy, public/mock-api.js, docs/LIVABILITY.md grade table and test/juice.test.js, in one commit.',
        'Set lastReviewed for juice-grades in data/freshness.json.',
      ],
    });
  });

  // ---- Juice confidence rules
  await safe('juice-confidence-rules', 'manual', () => {
    const findings = [];
    let status = 'ok';
    const copy = constOf(ctx, 'scripts/update-col.js', 'SOURCE_CLASSES');
    if (!Array.isArray(copy) || copy.join() !== juice.SOURCE_CLASSES.join()) { status = 'flag'; findings.push(finding('scripts/update-col.js SOURCE_CLASSES', juice.SOURCE_CLASSES.join(', '), Array.isArray(copy) ? copy.join(', ') : 'missing', '', 'the validator copy differs from server/juice.js')); }
    const cities = data.cities && Array.isArray(data.cities.cities) ? data.cities.cities : [];
    const classes = {};
    for (const c of cities) for (const s of Object.values(c.sources || {})) if (s && typeof s === 'object') { const k = s.class || '(none)'; classes[k] = (classes[k] || 0) + 1; }
    const unknown = Object.keys(classes).filter((k) => k !== '(none)' && !juice.SOURCE_CLASSES.includes(k));
    if (unknown.length) { status = 'flag'; findings.push(finding('cities.json source classes', juice.SOURCE_CLASSES.join(', '), unknown.join(', '), '', 'classes the confidence rule does not know (counted as aggregator)')); }
    findings.push(finding('cities.json source classes', null, Object.entries(classes).map(([k, v]) => `${k} ${v}`).join(', '), 'sources', 'informational'));
    // Confidence of every city at a fixed salary, vs the counts LIVABILITY.md states.
    const tally = { US: {}, other: {} };
    for (const c of cities) {
      let conf = null;
      try { conf = juice.computeJuice(150000, c).confidence; } catch { conf = 'n/a'; }
      const t = tally[c.country === 'US' ? 'US' : 'other'];
      t[conf] = (t[conf] || 0) + 1;
    }
    const m = liv && /US cities are medium \((\d+)\) or low \((\d+)[^)]*\);\s*all (\d+) non-US cities are low/.exec(liv);
    if (m) {
      const docSays = `US medium ${m[1]}, US low ${m[2]}, non-US low ${m[3]}`;
      const now = `US medium ${tally.US.medium || 0}, US low ${tally.US.low || 0}, non-US low ${tally.other.low || 0}`;
      const same = +m[1] === (tally.US.medium || 0) && +m[2] === (tally.US.low || 0) && +m[3] === (tally.other.low || 0) && !(tally.other.medium || tally.other.high);
      if (!same) status = 'flag';
      findings.push(finding('docs/LIVABILITY.md Guardrails counts', docSays, `${now}${tally.US.high ? `, US high ${tally.US.high}` : ''}${tally.other.medium || tally.other.high ? `, non-US medium ${tally.other.medium || 0} / high ${tally.other.high || 0}` : ''}`, 'cities', same ? 'matches' : 'hand-written counts are out of date'));
    } else findings.push(finding('docs/LIVABILITY.md Guardrails counts', null, JSON.stringify(tally), 'cities', 'doc sentence not found (reworded?)'));
    if (haveData) {
      const conf = {};
      for (const b of scored(boards)) conf[b.confidence || '?'] = (conf[b.confidence || '?'] || 0) + 1;
      findings.push(finding('scored jobs by confidence', null, Object.entries(conf).map(([k, v]) => `${k} ${v}`).join(', '), 'jobs', 'best location of each scored job'));
    }
    return finish(ctx, 'juice-confidence-rules', 'manual', status, {
      summary: `confidence: lowest of rent, cost index and tax; non-US low unless rent and cost index are official/open/user; ${cities.length} cities checked${status === 'flag' ? ' (a copy or the doc counts differ)' : ''}`,
      findings,
      checklist: [
        'After any cities.json source-class change or TAX_SOURCES verified flag change, re-read this Result\'s counts and update docs/LIVABILITY.md "Guardrails".',
        'Keep scripts/update-col.js SOURCE_CLASSES equal to server/juice.js SOURCE_CLASSES.',
        'Yearly: re-read the rule (CLASS_CONFIDENCE, confidenceFor) against the sources actually used; set lastReviewed.',
      ],
    });
  });

  // ---- Salary vetting bounds
  await safe('salary-vetting-bounds', 'manual', () => {
    const V = vet.VET;
    const findings = [];
    let status = 'ok';
    const docs = docChecks(vettingDoc, [
      ['above_max', /annual max > \*\*\$([\d.]+M)\*\*/, V.MAX_ANNUAL],
      ['below_min', /annual min < \*\*\$([\d.]+K)\*\*/, V.MIN_ANNUAL_FULLTIME],
      ['hourly_high any role', /hourly rate > \*\*\$(\d+)\/hr\*\* on any role/, V.MAX_HOURLY_USD],
      ['hourly_high full-time', /or > \*\*\$(\d+)\/hr\*\* on a role/, V.HOURLY_MAX_FULLTIME],
      ['range_ratio', /max\/min > \*\*(\d+(?:\.\d+)?)×\*\*/, V.RATIO_QUARANTINE, 'number'],
      ['junior_high', /mid > \*\*\$(\d+K)\/yr\*\*/, V.JUNIOR_MAX_MID],
      ['senior_low', /max < \*\*\$(\d+K)\/yr\*\*/, V.SENIOR_MIN_MAX],
      ['MIN_GROUP', /\*\*at least (\d+)\*\* members/, V.MIN_GROUP, 'number'],
      ['MIN_SIGMA', /σ = max\(1\.4826 · MAD, \*\*(\d+(?:\.\d+)?)\*\*\)/, V.MIN_SIGMA, 'number'],
      ['Z high', /z > \*\*(\d+(?:\.\d+)?)\*\*/, V.Z, 'number'],
      ['Z low', /z < \*\*[−-](\d+(?:\.\d+)?)\*\*/, V.Z_LOW, 'number'],
    ]);
    for (const c of docs) if (!c.ok) { status = 'flag'; findings.push(finding(`docs/VETTING.md ${c.key}`, c.code, c.doc, '', c.doc == null ? 'figure not found in the doc (reworded?)' : 'doc and server/vet.js VET disagree')); }
    let summary = `VET ${Object.entries(V).map(([k, v]) => `${k} ${v}`).join(', ')}; docs ${docs.filter((c) => c.ok).length}/${docs.length} figures match`;
    if (haveData) {
      const all = boards.flatMap((b) => b.jobs);
      const nb = nearBounds(all, { VET: V, toUSD: vet.toUSD, isFullTime: vet.isFullTime });
      for (const [code, c] of Object.entries(nb.near)) {
        const sh = nb.n ? c / nb.n : 0;
        if (sh > POLICY_BOUNDS.nearBoundShare) status = 'flag';
        findings.push(finding(`published pay within ${pct(POLICY_BOUNDS.nearBoundBand)}% of ${code}`, `<= ${pct(POLICY_BOUNDS.nearBoundShare)}%`, pct(sh), '% of salaried', `${c}/${nb.n}${sh > POLICY_BOUNDS.nearBoundShare ? ': the bound cuts into real pay, re-justify it' : ''}`));
      }
      const doc850 = vettingDoc && findFigure(vettingDoc, /highest real posted base in the data is \$([\d.]+K)/);
      findings.push(finding('highest published max (USD)', doc850, nb.maxUSD, 'USD/yr', `${nb.maxAt || '-'}; docs/VETTING.md cites the 2026-10-02 figure`));
      const doc34 = vettingDoc && findFigure(vettingDoc, /Real stated ranges reach (\d+(?:\.\d+)?)×/, 'number');
      findings.push(finding('widest published range (max/min)', doc34, nb.maxRatio, 'x', `quarantine above ${V.RATIO_QUARANTINE}x`));
      const gate = {};
      for (const b of boards) for (const [k, v] of Object.entries(b.scan.gateCodes || {})) gate[k] = (gate[k] || 0) + v;
      findings.push(finding('quarantines by code', null, Object.entries(gate).map(([k, v]) => `${k} ${v}`).join(', ') || 'none', 'postings', 'see salary-vetting-flags for per-company trends'));
      summary += `; ${nb.n} published salaries checked against the bounds`;
    } else summary += `; ${dataNote}`;
    return finish(ctx, 'salary-vetting-bounds', 'manual', status, {
      summary, findings, sourceAsOf: asOf,
      checklist: [
        'Quarterly and for every new board: `node scripts/vet-salaries.js --sample 25 --seed 20261002` into data/vetting/<date>/, review the flags (docs/VETTING.md §5), and note the stat_outlier count per board (VETTING.md §8).',
        'If published pay sits near a bound (findings), re-justify the threshold in docs/VETTING.md §3 or move it; nominal USD bounds need a yearly inflation look.',
        'Keep docs/VETTING.md §3 figures equal to server/vet.js VET; MAX_ANNUAL must equal server/salary.js MAX_ANNUAL (salary-parser-bounds).',
        'Set lastReviewed for salary-vetting-bounds in data/freshness.json.',
      ],
    });
  });

  // ---- Annualization factors
  await safe('salary-interval-factors', 'manual', () => {
    const findings = [];
    let status = 'ok';
    const ref = constOf(ctx, 'server/salary.js', 'FACTORS');
    const copies = [
      ['scripts/vet-salaries.js FACT', constOf(ctx, 'scripts/vet-salaries.js', 'FACT')],
      ['scripts/vet-salaries.js UNFACT', constOf(ctx, 'scripts/vet-salaries.js', 'UNFACT')],
      ['data/vetting/2026-10-02/review-rules.mjs F', constOf(ctx, 'data/vetting/2026-10-02/review-rules.mjs', 'F')],
    ];
    if (!ref) { status = 'error'; findings.push(finding('server/salary.js FACTORS', null, null, '', 'not found as a literal')); }
    else for (const [where, v] of copies) if (!v || JSON.stringify(v) !== JSON.stringify(ref)) { status = 'flag'; findings.push(finding(where, JSON.stringify(ref), v ? JSON.stringify(v) : 'missing', '', 'copy of the annualization factors differs')); }
    const shared = read(ctx, 'public/features/shared.js') || '';
    const vetSrc = read(ctx, 'server/vet.js') || '';
    if (ref && !(new RegExp(`\\? ${ref.hour} :`).test(shared) && new RegExp(`\\? ${ref.month} :`).test(shared))) { status = 'flag'; findings.push(finding('public/features/shared.js salaryUSD', `${ref.hour} h, ${ref.month} months`, 'differs', '', 'defensive annualization in the browser no longer uses the same factors')); }
    if (ref && !new RegExp(`/ ${ref.hour}\\b`).test(vetSrc)) { status = 'flag'; findings.push(finding('server/vet.js hourly rate', `/ ${ref.hour}`, 'differs', '', 'hourly cap uses another hours-per-year figure')); }
    if (ref) findings.push(finding('server/salary.js FACTORS', null, JSON.stringify(ref), '', 'hour x2080 = 52 weeks x 40 h; day x260; week x52; month x12'));
    if (haveData) {
      const iv = {};
      let n = 0;
      for (const b of boards) for (const j of b.jobs) if (j && j.salary) { n++; const k = j.salary.originalInterval || 'year'; iv[k] = (iv[k] || 0) + 1; }
      findings.push(finding('published salaries by source interval', null, Object.entries(iv).map(([k, v]) => `${k} ${v}`).join(', '), 'postings', `${n - (iv.year || 0)} of ${n} annualized with these factors`));
    }
    return finish(ctx, 'salary-interval-factors', 'manual', status, {
      summary: `annualization ${ref ? Object.entries(ref).map(([k, v]) => `${k} x${v}`).join(', ') : '-'}; ${copies.length + 2} copies checked${status === 'flag' ? ' (a copy differs)' : ''}`,
      findings,
      checklist: [
        'Change server/salary.js FACTORS, scripts/vet-salaries.js FACT/UNFACT, server/vet.js (/2080), public/features/shared.js salaryUSD, server/export.js csvReadme text, README and docs/VETTING.md together.',
        'data/vetting/<date>/review-rules.mjs is an audit record of a past review: leave old ones alone; new reviews copy the current factors.',
        'Set lastReviewed for salary-interval-factors in data/freshness.json.',
      ],
    });
  });

  // ---- Parser bounds
  await safe('salary-parser-bounds', 'manual', () => {
    const findings = [];
    let status = 'ok';
    const V = vet.VET;
    const PLAUSIBLE = constOf(ctx, 'server/salary.js', 'PLAUSIBLE_ANNUAL_MIN');
    const TIER = constOf(ctx, 'server/salary.js', 'TIER_MAX_RATIO');
    const GH = constOf(ctx, 'server/sources/greenhouse.js', 'MAX_TIER_SPAN');
    const pairs = [
      ['salary.js MAX_ANNUAL = vet.js VET.MAX_ANNUAL', salary.MAX_ANNUAL, V.MAX_ANNUAL],
      ['salary.js PLAUSIBLE_ANNUAL_MIN = vet.js VET.MIN_ANNUAL_FULLTIME', PLAUSIBLE, V.MIN_ANNUAL_FULLTIME],
      ['salary.js TIER_MAX_RATIO = greenhouse.js MAX_TIER_SPAN', TIER, GH],
    ];
    for (const [k, a, b] of pairs) if (a !== b) { status = 'flag'; findings.push(finding(k, b, a, '', 'the two copies disagree')); }
    for (const c of docChecks(vettingDoc, [['text candidate range', /a text candidate must be \$([\d.]+K)–\$[\d.]+M per/, salary.MIN_ANNUAL], ['toJobSalary hard max', /refuses values outside \$[\d.]+K–\$([\d.]+M)/, salary.HARD_MAX_ANNUAL], ['tier span', /when the span is\s+at most (\d+)×/, TIER, 'number']])) {
      if (!c.ok) { status = 'flag'; findings.push(finding(`docs/VETTING.md ${c.key}`, c.code, c.doc, '', c.doc == null ? 'figure not found in the doc (reworded?)' : 'doc and server/salary.js disagree')); }
    }
    if (haveData) {
      let n = 0, nearMin = 0, nearMax = 0, lo = Infinity, hi = 0;
      for (const b of boards) for (const j of b.jobs) {
        const s = j && j.salary;
        if (!s) continue;
        n++;
        const cur = String(s.currency || 'USD').toUpperCase();
        const mn = salary.toUSD(Number(s.min), cur) ?? Number(s.min);
        const mx = salary.toUSD(Number(s.max), cur) ?? Number(s.max);
        lo = Math.min(lo, mn); hi = Math.max(hi, mx);
        if (mn <= salary.MIN_ANNUAL * (1 + POLICY_BOUNDS.nearBoundBand)) nearMin++;
        if (mx >= salary.MAX_ANNUAL * (1 - POLICY_BOUNDS.nearBoundBand)) nearMax++;
      }
      for (const [k, c] of [['MIN_ANNUAL', nearMin], ['MAX_ANNUAL', nearMax]]) {
        if (n && c / n > POLICY_BOUNDS.nearBoundShare) status = 'flag';
        findings.push(finding(`published pay within ${pct(POLICY_BOUNDS.nearBoundBand)}% of ${k}`, `<= ${pct(POLICY_BOUNDS.nearBoundShare)}%`, n ? pct(c / n) : null, '% of salaried', `${c}/${n}`));
      }
      findings.push(finding('published annual range (USD)', `${salary.MIN_ANNUAL}..${salary.MAX_ANNUAL}`, `${Math.round(lo)}..${Math.round(hi)}`, 'USD/yr', 'lowest min and highest max among published salaries'));
    }
    return finish(ctx, 'salary-parser-bounds', 'manual', status, {
      summary: `parser bounds $${salary.MIN_ANNUAL.toLocaleString('en-US')}..$${salary.MAX_ANNUAL.toLocaleString('en-US')} (hard max $${salary.HARD_MAX_ANNUAL.toLocaleString('en-US')}), tier span <= ${TIER}x${status === 'flag' ? '; a copy or a data check disagrees' : ''}`,
      findings, sourceAsOf: asOf,
      checklist: [
        'Yearly: check the bounds still sit outside the published distribution (findings); nominal USD bounds erode with wage inflation.',
        'Keep salary.js MAX_ANNUAL = vet.js VET.MAX_ANNUAL, PLAUSIBLE_ANNUAL_MIN = VET.MIN_ANNUAL_FULLTIME, TIER_MAX_RATIO = greenhouse.js MAX_TIER_SPAN, and docs/VETTING.md §2.',
        'Run `npm test` (test/salary.test.js, test/fixtures/real-salary-cases.json) after any change; set lastReviewed.',
      ],
    });
  });

  // ---- LLM review config (detect: the model id still exists)
  await safe('llm-vet-config', 'detect', async () => {
    const findings = [];
    const evidence = [];
    let status = 'ok';
    const model = llmVet.DEFAULT_MODEL;
    const copies = [
      ['.github/workflows/pages.yml VET_LLM_MODEL default', /VET_LLM_MODEL:\s*\$\{\{\s*vars\.VET_LLM_MODEL \|\| '([^']+)'/, read(ctx, '.github/workflows/pages.yml')],
      ['docs/VETTING.md default', /VET_LLM_MODEL \(default ([a-z0-9.-]+)/, vettingDoc],
      ['scripts/refresh/lib.js REFRESH_LLM_MODEL default', /REFRESH_LLM_MODEL \|\| '([^']+)'/, read(ctx, 'scripts/refresh/lib.js')],
    ];
    for (const [where, re, text] of copies) {
      const m = text && re.exec(text);
      if (!m) findings.push(finding(where, model, null, '', 'not found (reworded?)'));
      else if (m[1] !== model) { status = 'flag'; findings.push(finding(where, model, m[1], '', 'another default model id than scripts/llm-vet.js DEFAULT_MODEL')); }
    }
    findings.push(finding('scripts/llm-vet.js', null, `model ${model}, anthropic-version ${llmVet.API_VERSION}, beta ${llmVet.FALLBACK_BETA}`, '', 'max_tokens 4000, effort medium, concurrency 4; pages.yml --limit 100'));
    const key = ctx.env && ctx.env.ANTHROPIC_API_KEY;
    if (!key || ctx.offline) findings.push(finding('Models API', model, null, '', `not checked (${ctx.offline ? 'offline' : 'no ANTHROPIC_API_KEY'})`));
    else {
      let base = 'https://api.anthropic.com';
      try { base = llmVet.checkBaseUrl(ctx.env.ANTHROPIC_BASE_URL || base).replace(/\/$/, ''); } catch { /* keep default */ }
      const url = `${base}/v1/models/${encodeURIComponent(model)}`;
      try {
        const r = await ctx.fetchJson(url, { headers: { 'x-api-key': key, 'anthropic-version': llmVet.API_VERSION } });
        const ok = r.json && (r.json.id === model || r.json.type === 'model');
        if (!ok) status = 'drift';
        findings.push(finding('Models API', model, r.json && r.json.id, '', ok ? `listed${r.json.display_name ? ` as ${r.json.display_name}` : ''}` : 'unexpected answer', url));
        evidence.push({ url, fetchedAt: r.fetchedAt, excerpt: JSON.stringify(r.json).slice(0, 300) });
      } catch (err) {
        if (err && err.status === 404) { status = 'drift'; findings.push(finding('Models API', model, 'not found (HTTP 404)', '', 'the default model id is gone: pick the current model and update every copy', url)); }
        else findings.push(finding('Models API', model, null, '', `not checked: ${err && err.message}`, url));
      }
    }
    return finish(ctx, 'llm-vet-config', 'detect', status, {
      summary: `advisory salary review model ${model}${status === 'drift' ? ' is no longer listed by the Models API' : status === 'flag' ? '; a copy names another model' : ''}`,
      findings, evidence,
      checklist: [
        'Quarterly: confirm DEFAULT_MODEL in scripts/llm-vet.js is a current model (Models API, or https://docs.anthropic.com/en/docs/about-claude/model-deprecations), and that the fallback beta header is still accepted.',
        'Change scripts/llm-vet.js DEFAULT_MODEL, pages.yml VET_LLM_MODEL default, docs/VETTING.md §6 and scripts/refresh/lib.js REFRESH_LLM_MODEL together (or set the repository variable VET_LLM_MODEL).',
        'Set lastReviewed for llm-vet-config in data/freshness.json.',
      ],
    });
  });

  // ---- Listing-age buckets
  await safe('listing-freshness-buckets', 'manual', () => {
    const F = history.FRESHNESS;
    const findings = [];
    let status = 'ok';
    const app = read(ctx, 'public/app.js') || '';
    const evergreen = F.STALE_MAX + 1;
    if (!new RegExp(`_age >= ${evergreen}\\b`).test(app) || !new RegExp(`${evergreen}\\+ days`).test(app)) { status = 'flag'; findings.push(finding('public/app.js 180-day threshold', `${evergreen} (FRESHNESS.STALE_MAX + 1)`, 'differs', 'days', 'the hide-old filter / drawer note no longer match server/history.js')); }
    const demo = constOf(ctx, 'server/demo.js', 'AGE_BUCKETS');
    if (Array.isArray(demo)) {
      const his = demo.map((b) => b.hi).filter(Number.isFinite);
      const want = [F.NEW_MAX, F.ACTIVE_MAX, F.STALE_MAX];
      if (want.some((w) => !his.includes(w))) { status = 'flag'; findings.push(finding('server/demo.js AGE_BUCKETS', want.join(', '), his.join(', '), 'days', 'demo listing ages no longer straddle the buckets')); }
    }
    let summary = `new <= ${F.NEW_MAX}, active <= ${F.ACTIVE_MAX}, stale <= ${F.STALE_MAX}, evergreen >= ${evergreen} days`;
    if (haveData) {
      const tot = { new: 0, active: 0, stale: 0, evergreen: 0, unknown: 0 };
      for (const b of boards) for (const [k, v] of Object.entries(b.freshness || {})) tot[k] = (tot[k] || 0) + v;
      const dated = tot.new + tot.active + tot.stale + tot.evergreen;
      const top = Object.entries(tot).filter(([k]) => k !== 'unknown').sort((a, b) => b[1] - a[1])[0];
      if (dated >= 50 && top && top[1] / dated > POLICY_BOUNDS.bucketMaxShare) { status = 'flag'; findings.push(finding(`bucket ${top[0]}`, `<= ${pct(POLICY_BOUNDS.bucketMaxShare)}%`, pct(top[1] / dated), '% of dated postings', 'one bucket holds most postings: the freshness filter stops discriminating')); }
      findings.push(finding('postings by bucket', null, Object.entries(tot).map(([k, v]) => `${k} ${v}`).join(', '), 'postings', dated ? `${dated} with an age (postedAt or ledger)` : 'no ages: snapshots lack postedAt and no ledger was restored'));
      summary += `; ${dated} dated postings`;
    } else summary += `; ${dataNote}`;
    return finish(ctx, 'listing-freshness-buckets', 'manual', status, {
      summary, findings, sourceAsOf: asOf,
      checklist: [
        'Yearly: look at the bucket mix (findings); the buckets are a UX choice, change them only with the filter design.',
        'Any change: server/history.js FRESHNESS, public/app.js (180-day filter, drawer note, Listed filter 7/30/90), server/demo.js AGE_BUCKETS, public/mock-api.js, docs/CONTRACT.md, test/history.test.js and the e2e tests together.',
        'Set lastReviewed for listing-freshness-buckets in data/freshness.json.',
      ],
    });
  });

  // ---- Market comps policy (minN, rounding, fallback)
  await safe('market-comps-policy', 'manual', () => {
    const findings = [];
    let status = 'ok';
    const minN = D.MIN_N;
    const compsSrc = read(ctx, 'public/features/comps.js') || '';
    const fallbacks = [...compsSrc.matchAll(/minN \|\| (\d+)/g)].map((m) => Number(m[1]));
    if (fallbacks.some((v) => v !== minN)) { status = 'flag'; findings.push(finding('public/features/comps.js minN fallback copy', minN, fallbacks.join(', '), 'postings', 'UI copy falls back to another minN than scripts/build-market.js MIN_N')); }
    const mk = read(ctx, 'scripts/build-market.js') || '';
    if (!/Math\.round\(n \/ 100\) \* 100/.test(mk)) findings.push(finding('scripts/build-market.js rounding', '$100', 'changed?', '', 'round100 not found; check the documented $100 rounding'));
    let summary = `minN ${minN}, medians rounded to $100, Same role elsewhere falls back from family+seniority to family`;
    if (haveData) {
      const s = minNSuppression(boards, { roleFamily: D.roleFamily, usdMid: D.usdMid }, minN);
      if (s.exactShare != null && s.exactShare > POLICY_BOUNDS.suppressedMaxShare) status = 'flag';
      findings.push(finding('salaried jobs whose exact cell is suppressed', `<= ${pct(POLICY_BOUNDS.suppressedMaxShare)}%`, pct(s.exactShare), '% of salaried with a family', `${s.exactSuppressed}/${s.n}; ${s.suppressedGroups}/${s.groups} company x family x level groups under minN; family roll-up suppressed for ${s.familySuppressed}`));
      summary += `; ${pct(s.exactShare)}% of salaried jobs fall back from their exact cell`;
    } else summary += `; ${dataNote}`;
    return finish(ctx, 'market-comps-policy', 'manual', status, {
      summary, findings, sourceAsOf: asOf,
      checklist: [
        'Yearly: read the suppression share (findings). Raising minN hides more cells; lowering it exposes single postings (privacy, noise).',
        'Any change: scripts/build-market.js MIN_N, public/features/comps.js copy fallbacks, docs/CONTRACT.md, test/market.test.js together.',
        'Set lastReviewed for market-comps-policy in data/freshness.json.',
      ],
    });
  });

  // ---- Node runtime versions (package.json engines, workflow node-version) vs the Node release schedule
  await safe('runtime-versions', 'manual', async () => {
    const wfDir = path.join(ctx.root, '.github', 'workflows');
    let files = [];
    try { files = fs.readdirSync(wfDir).filter((f) => /\.ya?ml$/.test(f)).sort(); } catch { files = []; }
    const inUse = nodeVersionsInUse(read(ctx, 'package.json'), files.map((f) => [`.github/workflows/${f}`, read(ctx, `.github/workflows/${f}`)]));
    let sched;
    try { sched = await ctx.fetchJson(NODE_SCHEDULE_URL); } catch (err) {
      const missing = err && err.code === 'FIXTURE_MISSING';
      return result('runtime-versions', 'manual', missing ? 'skipped' : 'error', { summary: `Node release schedule not read (${err && err.message}); in use: ${[...new Set(inUse.map((u) => u.major))].join(', ')}`, findings: inUse.map((u) => finding(u.where, null, u.major, 'Node major', 'not checked')) });
    }
    const rows = nodeEol(inUse, sched.json, ctx.today);
    const findings = [];
    let status = 'ok';
    for (const r of rows) {
      if (r.past) status = 'flag';
      const soon = !r.past && r.daysLeft != null && r.daysLeft <= NODE_EOL_WARN_DAYS;
      findings.push(finding(`Node ${r.major}`, r.end ? `end of life ${r.end}` : 'not in the schedule', r.past ? `PAST EOL by ${-r.daysLeft} days` : r.daysLeft != null ? `${r.daysLeft} days left${soon ? ' (soon)' : ''}` : 'unknown', '', `${r.where.join('; ')}${r.lts ? '' : ' (not an LTS line)'}`, NODE_SCHEDULE_URL));
    }
    const supported = Object.entries(sched.json || {}).filter(([k, v]) => /^v\d+$/.test(k) && v.lts && v.end && v.end >= ctx.today && v.start <= ctx.today).map(([k]) => Number(k.slice(1))).sort((a, b) => a - b);
    return finish(ctx, 'runtime-versions', 'manual', status, {
      summary: `Node majors in use ${rows.map((r) => r.major).join(', ')}; supported LTS lines today ${supported.join(', ') || '-'}${status === 'flag' ? `; past end of life: ${rows.filter((r) => r.past).map((r) => `${r.major} (${r.end})`).join(', ')}` : ''}`,
      findings,
      evidence: [{ url: NODE_SCHEDULE_URL, fetchedAt: sched.fetchedAt, excerpt: JSON.stringify(Object.fromEntries(rows.map((r) => [`v${r.major}`, (sched.json || {})[`v${r.major}`]]))).slice(0, 400) }],
      checklist: [
        `Compare package.json engines and every workflow node-version (ci.yml matrix included) with the Node release schedule (${NODE_SCHEDULE_URL}).`,
        'Drop majors past end of life from the CI matrix and raise engines.node to the oldest supported LTS; add the newest LTS to the matrix.',
        'Run `npm test` on the new versions (CI matrix) before merging; set lastReviewed for runtime-versions in data/freshness.json.',
      ],
    });
  });

  const byId = new Map(out.map((r) => [r.id, r]));
  return MODULE.ids.map((id) => byId.get(id) || result(id, 'manual', 'error', { summary: 'no result produced' }));
}
