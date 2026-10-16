// melon-seek "Market insights" panel: skill premiums, pay by department,
// hot locations and fit requirements for the jobs currently in view.
//
//   createInsights(container, { onFilter({ type, value }) })
//     -> { update(filteredJobs, allJobs), destroy() }
//   type is "skill" | "department" | "location" | "responsibility" | "fit";
//   value is the label shown (skill / department / location key / keyword).
//   Location keys are a Location's city (or name); remote roles use "Remote".
//
// Pure stats helpers are exported for tests and reuse.

import {
  salaryUSD, percentile, median, formatMoney, formatDelta, formatPct, plural, fmtCount, niceTicks,
  jobLocationKeys, countryName, isOTE, h, createTooltip, preserveFocus, uid, payAt, pricedPlaces, toUSD,
} from './shared.js';
import { formatAsOf, asOf as registryAsOf } from './freshness.js';
import { FX_AS_OF } from '../viz/palette.js';
import { noteLine } from '../viz/note.js';

/** MR-2: " at Jul 2026 exchange rates", the rates every "approx. USD" figure here uses (registry, else the table's own). */
const fxAsOf = () => ` at ${formatAsOf(registryAsOf('fx-per-usd') || FX_AS_OF)} exchange rates`;
/** MR-3: how the posted pay behind these figures is read (the site's methodology guide). */
const PAY_DOC = 'methodology/#how-is-the-posted-pay-read';

/**
 * Smallest sample a Market insights statistic is shown for (persona review 2026-10-10, P-6):
 * a median, box, share bar or pay difference needs at least this many roles behind it (salaried
 * roles for pay, roles in view for shares). Below it the panel says "not enough roles".
 */
export const MIN_SAMPLE = 5;
/**
 * A pay difference (skill or requirement vs all roles in view) is "tied" when more than this share
 * of its roles post the very same range: the figure then repeats one pay band, so eight skills
 * read "+$38K" alike. Tied differences are left out, and the panel says so.
 */
export const TIE_SHARE = 0.5;

/** ' · postings as of 9 Oct 2026' for the board's fetchedAt ('' without one). */
const postedAsOf = (asOf) => { const d = formatAsOf(asOf, 'day'); return d ? ` · postings as of ${d}` : ''; };

export { percentile, median, salaryUSD, toUSD } from './shared.js';

// ---------------------------------------------------------------------------
// Pure stats
// ---------------------------------------------------------------------------

/**
 * A job's base pay midpoint in approx USD, or null. On-target earnings (base plus commission at
 * target) are never pooled with base pay (shared decision 3), so they count as "no base pay" here.
 */
function midOf(job) { if (isOTE(job)) return null; const p = salaryUSD(job); return p ? p.mid : null; }

const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);

/** True when more than TIE_SHARE of the values are the same posted figure (to the dollar). */
export function isTied(values, share = TIE_SHARE) {
  const v = (values || []).filter((x) => Number.isFinite(x));
  if (!v.length) return false;
  const c = new Map();
  let top = 0;
  for (const x of v) { const k = Math.round(x); const n = (c.get(k) || 0) + 1; c.set(k, n); if (n > top) top = n; }
  return top / v.length > share;
}

/** The app's location key (public/app.js locKey): city, else name; remote entries by their name. */
const appKey = (l) => (l.remote ? l.name || 'Remote' : l.city || l.name);

/**
 * Keys (app style) of the places a posting has pay posted for (payAt in shared.js: a place's own row of
 * salary.ranges, or the posting's one range in that place's country; fix-pay-at-place).
 */
export function payPlaceKeys(job) {
  const out = new Set();
  for (const l of pricedPlaces(job)) { const k = appKey(l); if (k) out.add(k); }
  return [...out];
}

function kw(job, facet) {
  const list = job?.keywords?.[facet];
  return Array.isArray(list) ? [...new Set(list.filter(Boolean))] : [];
}

/** Headline numbers for a set of jobs. */
export function summaryStats(jobs = []) {
  const mids = jobs.map(midOf).filter((v) => v != null);
  return {
    total: jobs.length,
    salaried: mids.length,
    payShare: jobs.length ? mids.length / jobs.length : 0,
    remoteShare: jobs.length ? jobs.filter((j) => j.remote).length / jobs.length : 0,
    median: median(mids),
    p25: percentile(mids, 0.25),
    p75: percentile(mids, 0.75),
  };
}

/**
 * Pay premium per skill: median USD mid of salaried jobs listing the skill minus
 * the median of all salaried jobs given. The `limit` most frequent skills with
 * at least `minCount` salaried jobs are returned, sorted by premium (desc).
 *   -> { baseline, salaried, items: [{ skill, n, count, median, premium }], average, dropped }
 * `n` = salaried jobs with the skill; `count` = all jobs with the skill.
 * `stat: 'mean'` makes the premium the difference of averages (the panel's choice: medians of
 * banded pay tie, so many skills showed the same figure); `dropTied` leaves out skills whose roles
 * mostly post one identical range (isTied); `dropped` counts skills with enough roles left out as tied.
 */
export function skillPremiums(jobs = [], { limit = 12, minCount = 3, stat = 'median', dropTied = false } = {}) {
  const mids = [];
  const by = new Map();
  for (const j of jobs) {
    const m = midOf(j);
    if (m != null) mids.push(m);
    for (const s of kw(j, 'skills')) {
      let e = by.get(s);
      if (!e) by.set(s, (e = { skill: s, count: 0, mids: [] }));
      e.count += 1;
      if (m != null) e.mids.push(m);
    }
  }
  const baseline = median(mids);
  const average = mean(mids);
  const ref = stat === 'mean' ? average : baseline;
  const enough = [...by.values()].filter((e) => e.mids.length >= minCount);
  const kept = enough.filter((e) => !(dropTied && isTied(e.mids)));
  const items = kept
    .sort((a, b) => b.mids.length - a.mids.length || b.count - a.count || a.skill.localeCompare(b.skill))
    .slice(0, limit)
    .map((e) => {
      const med = median(e.mids);
      const v = stat === 'mean' ? mean(e.mids) : med;
      const it = { skill: e.skill, n: e.mids.length, count: e.count, median: med, premium: ref == null ? null : v - ref };
      if (stat === 'mean') it.average = v;
      return it;
    })
    .sort((a, b) => b.premium - a.premium || b.n - a.n);
  return { baseline, salaried: mids.length, items, average, dropped: enough.length - kept.length };
}

/**
 * Pay distribution per department (USD mids), sorted by median (desc).
 *   -> [{ department, n, min, p10, p25, median, p75, p90, max }]
 * Jobs without a department are grouped as "Other" unless `includeOther` is false.
 */
export function deptBoxes(jobs = [], { minCount = 1, includeOther = true } = {}) {
  const by = new Map();
  for (const j of jobs) {
    const m = midOf(j);
    if (m == null) continue;
    const d = j.department || (includeOther ? 'Other' : null);
    if (!d) continue;
    if (!by.has(d)) by.set(d, []);
    by.get(d).push(m);
  }
  return [...by].filter(([, v]) => v.length >= minCount).map(([department, v]) => ({
    department, n: v.length,
    min: Math.min(...v), p10: percentile(v, 0.1), p25: percentile(v, 0.25), median: percentile(v, 0.5),
    p75: percentile(v, 0.75), p90: percentile(v, 0.9), max: Math.max(...v),
  })).sort((a, b) => b.median - a.median || b.n - a.n);
}

/**
 * Roles per location key (a multi-location job counts once in each city),
 * with the median USD pay of those roles. Sorted by count (desc).
 *   -> [{ location, country, remote, count, salaried, median }]
 * The pay of a role counts only in the places it was posted for, at the pay posted there (payAt, P-6 and
 * V-40): five US contractor roles that also list Sydney give Sydney a count, not a "Sydney median", and
 * Microsoft's New York roles count at their New York range, not the U.S. one.
 * `median` is null below `minSalaried` roles with pay there.
 */
export function hotLocations(jobs = [], { limit = 8, minSalaried = 1 } = {}) {
  const by = new Map();
  for (const j of jobs) {
    const m = midOf(j);
    for (const key of jobLocationKeys(j)) {
      let e = by.get(key);
      if (!e) {
        const loc = (j.locations || []).find((l) => (l.remote ? 'Remote' : l.city || l.name) === key);
        by.set(key, (e = { location: key, country: loc?.country || null, remote: key === 'Remote', count: 0, mids: [] }));
      }
      e.count += 1;
      if (m == null) continue;
      // V-40 (fix-pay-at-place): a place's median takes each role's pay posted for that place (payAt: its own
      // row, or the posting's one range in that country), never another city's row or another country's pay.
      const here = (j.locations || []).filter((l) => l && (l.remote ? 'Remote' : l.city || l.name) === key);
      const at = here.length ? payAt(j, here.length === 1 ? here[0] : here) : key === 'Remote' && !(j.locations || []).length ? payAt(j) : null;
      const v = at ? toUSD(at.mid, at.currency) : null;
      if (v != null) e.mids.push(v);
    }
  }
  return [...by.values()]
    .sort((a, b) => b.count - a.count || a.location.localeCompare(b.location))
    .slice(0, limit)
    .map(({ mids, ...e }) => ({ ...e, salaried: mids.length, median: mids.length >= minSalaried ? median(mids) : null }));
}

/**
 * Share of roles asking for each fit keyword ("PhD", "5+ yrs" ...), plus the
 * median pay of those roles vs the overall median.
 *   -> { total, baseline, items: [{ label, count, pct, median, premium }] }
 * median/premium are null when fewer than `minPremiumN` of those roles list pay.
 * Panel options (P-6): `minTotal` (pct is null with fewer roles in view), `stat: 'mean'` (premium
 * as a difference of averages) and `dropTied` (no premium when most of the roles post one range).
 */
export function fitRequirements(jobs = [], { limit = 8, facet = 'fit', minPremiumN = 3, minTotal = 0, stat = 'median', dropTied = false } = {}) {
  const by = new Map();
  const mids = [];
  for (const j of jobs) {
    const m = midOf(j);
    if (m != null) mids.push(m);
    for (const f of kw(j, facet)) {
      let e = by.get(f);
      if (!e) by.set(f, (e = { label: f, count: 0, mids: [] }));
      e.count += 1;
      if (m != null) e.mids.push(m);
    }
  }
  const baseline = median(mids);
  const ref = stat === 'mean' ? mean(mids) : baseline;
  const total = jobs.length;
  const items = [...by.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit)
    .map((e) => {
      const enough = e.mids.length >= minPremiumN && !(dropTied && isTied(e.mids));
      const med = enough ? median(e.mids) : null;
      const v = !enough ? null : stat === 'mean' ? mean(e.mids) : med;
      const it = { label: e.label, count: e.count, pct: total && total >= minTotal ? e.count / total : null, median: med, premium: v == null || ref == null ? null : v - ref };
      if (stat === 'mean') it.average = v;
      return it;
    });
  return { total, baseline, items };
}

/** Most common responsibility keywords: [{ label, count, pct }]. */
export function topResponsibilities(jobs = [], { limit = 12 } = {}) {
  return fitRequirements(jobs, { limit, facet: 'responsibilities' }).items
    .map(({ label, count, pct }) => ({ label, count, pct }));
}

// ---------------------------------------------------------------------------
// Panel (browser)
// ---------------------------------------------------------------------------

/**
 * fix-density: a card's subtitle is one short line (`subtitle`); how to read the card (`more`) and its
 * footnotes (`notes`) are behind one "Details" (viz/note.js).
 */
function card(title, subtitle, body, { id = uid('ins'), headTag = 'h3', extra = null, more = [], notes = [] } = {}) {
  const details = [...[].concat(more), ...[].concat(notes)].filter(Boolean);
  return h('section', { class: 'msi-card', 'aria-labelledby': id },
    h('header', { class: 'msi-card__head' },
      h(headTag, { id, class: 'msi-card__title' }, title),
      subtitle || details.length ? noteLine({ cls: 'msi-card__sub', line: subtitle, details, key: `ins:${title}`, about: id }) : null,
      extra),
    body);
}

function emptyNote(text) { return h('p', { class: 'msi-empty' }, text); }
/** UX-55: "$188K–252K", the cards' range (one currency sign, never "$188K–$252K"). */
function moneySpan(lo, hi) {
  const a = formatMoney(lo), b = formatMoney(hi);
  const sign = a.match(/^[^\d]*/)[0];
  return `${a}–${sign && b.startsWith(sign) ? b.slice(sign.length) : b}`;
}

/**
 * @param {HTMLElement} container
 * @param {{ onFilter?: (f: {type: string, value: string}) => void, headingLevel?: number }} opts
 */
export function createInsights(container, { onFilter, headingLevel = 2 } = {}) {
  const hl = Math.min(5, Math.max(1, headingLevel));
  const headId = uid('ins-h');
  const root = h('section', { class: 'ms-insights', 'aria-labelledby': headId });
  container.appendChild(root);
  const tip = createTooltip(root);
  const body = h('div', { class: 'ms-insights__body' });
  const header = h('header', { class: 'ms-insights__head' });
  root.append(header, body);
  const fire = (type, value) => { tip.hide(); if (onFilter) onFilter({ type, value }); };

  function row(type, value, label, children, tooltip) {
    const el = h('button', {
      type: 'button', class: 'msi-row', dataset: { key: `${type}:${value}` }, 'aria-label': label,
      onclick: () => fire(type, value),
    }, children);
    if (tooltip) tip.bind(el, tooltip);
    return el;
  }

  // (a) skill premium -------------------------------------------------------
  // P-6: averages (medians of banded pay tie), at least MIN_SAMPLE roles with pay, no tied groups.
  function skillCard(jobs) {
    const { average, items, salaried, dropped } = skillPremiums(jobs, { minCount: MIN_SAMPLE, stat: 'mean', dropTied: true });
    const sub = average == null || salaried < MIN_SAMPLE ? 'Average pay of roles listing each skill vs. all roles in view.'
      : `Average pay of roles listing each skill vs. the ${formatMoney(average)} average of all roles in view.`;
    if (!items.length || salaried < MIN_SAMPLE) {
      return card('Skill premium', 'Average pay by skill, vs. all roles', emptyNote(!salaried ? 'None of these roles publish pay.'
        : `Not enough roles to compare skills: each needs ${MIN_SAMPLE} or more roles with pay, and not mostly one posted range.`), { headTag: `h${hl + 1}`, more: sub });
    }
    const maxAbs = Math.max(...items.map((i) => Math.abs(i.premium)), 1);
    const rows = items.map((it) => {
      const frac = Math.abs(it.premium) / maxAbs * 50;
      const pos = it.premium >= 0;
      const delta = formatDelta(it.premium);
      return row('skill', it.skill,
        `${it.skill}: average ${formatMoney(it.average)}, ${delta.replace('−', 'minus ')} vs. all roles in view, ${plural(it.n, 'role')} with pay. Filter by this skill.`,
        [
          h('span', { class: 'msi-row__label' }, h('span', { class: 'msi-row__name' }, it.skill), h('span', { class: 'msi-row__n' }, fmtCount(it.n))),
          h('span', { class: 'msi-div', 'aria-hidden': 'true' },
            h('span', { class: `msi-div__bar ${pos ? 'msi-div__bar--pos' : 'msi-div__bar--neg'}`, style: pos ? { left: '50%', width: `${frac}%` } : { right: '50%', width: `${frac}%` } }),
            h('span', { class: 'msi-div__zero' })),
          h('span', { class: `msi-row__value ${pos ? 'is-pos' : 'is-neg'}` }, delta),
        ],
        () => ({ value: `${delta} · ${formatMoney(it.average)} average`, label: it.skill, rows: [['Salaried roles', String(it.n)], ['All roles listing it', String(it.count)], ['Average of all roles in view', formatMoney(average)]] }));
    });
    const legend = h('div', { class: 'msi-legend', 'aria-hidden': 'true' },
      h('span', null, h('i', { class: 'msi-key msi-key--neg' }), 'Pays less'),
      h('span', null, h('i', { class: 'msi-key msi-key--pos' }), 'Pays more'),
      h('span', { class: 'msi-legend__n' }, '# = roles with pay')); // UX-61
    const foot = dropped > 0
      ? h('span', { class: 'msi-foot' }, `${plural(dropped, 'skill')} left out: most of ${dropped === 1 ? 'its' : 'their'} roles post the same range, so the difference would only repeat one pay band. Skills need ${MIN_SAMPLE}+ roles with pay.`) : null;
    return card('Skill premium', 'Average pay by skill, vs. all roles', [h('div', { class: 'msi-rows msi-rows--div' }, rows, legend)], { headTag: `h${hl + 1}`, more: sub, notes: foot });
  }

  // (b) salary by department --------------------------------------------------
  function deptCard(jobs, allJobs) {
    // P-6: a box needs MIN_SAMPLE salaried roles; smaller departments are counted, not drawn.
    const allBoxes = deptBoxes(jobs);
    const boxes = allBoxes.filter((b) => b.n >= MIN_SAMPLE).slice(0, 10);
    const hidden = allBoxes.length - boxes.length;
    const sub = 'Box: the middle half of salaries. Whiskers: most salaries (all but the top and bottom tenth). Tick: the median.';
    if (!boxes.length) {
      return card('Pay by department', 'Middle half of pay, and the median', emptyNote(allBoxes.length
        ? `Not enough roles with pay to draw a department: each needs ${MIN_SAMPLE} or more.` : 'None of these roles publish pay.'), { headTag: `h${hl + 1}`, more: sub });
    }
    // Stable axis: domain from all jobs so filtering doesn't rescale the plot.
    const domainMids = (allJobs.length ? allJobs : jobs).map(midOf).filter((v) => v != null);
    let lo = Math.min(percentile(domainMids, 0.02), ...boxes.map((b) => b.p10));
    let hi = Math.max(percentile(domainMids, 0.98), ...boxes.map((b) => b.p90));
    const pad = (hi - lo) * 0.04 || 1000;
    lo = Math.max(0, lo - pad); hi += pad;
    const ticks = niceTicks(lo, hi, 5).ticks.filter((t) => t >= lo && t <= hi);
    const x = (v) => `${((v - lo) / (hi - lo || 1)) * 100}%`;
    const grid = () => ticks.map((t) => h('span', { class: 'msi-grid', style: { left: x(t) } }));
    const rows = boxes.map((b) => row('department', b.department,
      `${b.department}: median ${formatMoney(b.median)}, middle half ${formatMoney(b.p25)} to ${formatMoney(b.p75)}, most roles ${formatMoney(b.p10)} to ${formatMoney(b.p90)}, ${plural(b.n, 'role')}. Filter by this department.`,
      [
        h('span', { class: 'msi-row__label' }, h('span', { class: 'msi-row__name' }, b.department), h('span', { class: 'msi-row__n' }, fmtCount(b.n))),
        h('span', { class: 'msi-row__value' }, formatMoney(b.median)),
        h('span', { class: 'msi-box', 'aria-hidden': 'true' }, grid(),
          h('span', { class: 'msi-box__whisker', style: { left: x(b.p10), width: `calc(${x(b.p90)} - ${x(b.p10)})` } }),
          h('span', { class: 'msi-box__iqr', style: { left: x(b.p25), width: `max(4px, calc(${x(b.p75)} - ${x(b.p25)}))` } }),
          h('span', { class: 'msi-box__med', style: { left: x(b.median) } })),
      ],
      () => ({ value: `${formatMoney(b.median)} median`, label: b.department, rows: [['Most roles', `${formatMoney(b.p10)} – ${formatMoney(b.p90)}`], ['Middle half', `${formatMoney(b.p25)} – ${formatMoney(b.p75)}`], ['Roles with pay', String(b.n)]] })));
    const axis = h('div', { class: 'msi-axis', 'aria-hidden': 'true' },
      h('span', { class: 'msi-axis__pad' }),
      h('span', { class: 'msi-axis__track' }, ticks.map((t) => h('span', { class: 'msi-axis__tick', style: { left: x(t) } }, formatMoney(t)))),
      h('span', { class: 'msi-axis__pad msi-axis__pad--end' }));
    const foot = hidden > 0
      ? h('span', { class: 'msi-foot' }, `${plural(hidden, 'department')} with fewer than ${MIN_SAMPLE} roles with pay not shown.`) : null;
    return card('Pay by department', 'Middle half of pay, and the median', [h('div', { class: 'msi-rows msi-rows--box' }, rows, axis)], { headTag: `h${hl + 1}`, more: sub, notes: foot });
  }

  // (c) hot locations -------------------------------------------------------
  // P-6: a place's median uses only roles whose pay is posted for that place (payAt), from at
  // least MIN_SAMPLE of them.
  function locCard(jobs) {
    const locs = hotLocations(jobs, { limit: 8, minSalaried: MIN_SAMPLE });
    const sub = `Where the openings are. Multi-location roles count in each city; a median uses only pay posted for that place, from ${MIN_SAMPLE} or more roles.`;
    if (!locs.length) return card('Hot locations', 'Where the openings are', emptyNote('No locations listed.'), { headTag: `h${hl + 1}`, more: sub });
    const max = Math.max(...locs.map((l) => l.count));
    const medianText = (l) => (l.median != null ? formatMoney(l.median) : l.salaried ? `too few with pay here (${l.salaried})` : 'no pay posted for this place');
    const head = h('div', { class: 'msi-cols', 'aria-hidden': 'true' }, h('span', null, 'Location'), h('span'), h('span', null, 'Roles'), h('span', null, 'Median'));
    const rows = locs.map((l) => row('location', l.location,
      `${l.location}${l.country && !l.remote ? `, ${countryName(l.country)}` : ''}: ${plural(l.count, 'role')}, median pay ${medianText(l)}. Filter by this location.`,
      [
        h('span', { class: 'msi-row__label' }, h('span', { class: 'msi-row__name' }, l.location), l.country && !l.remote ? h('span', { class: 'msi-row__tag' }, countryName(l.country)) : null),
        h('span', { class: 'msi-bar', 'aria-hidden': 'true' }, h('span', { class: 'msi-bar__fill', style: { width: `${(l.count / max) * 100}%` } })),
        h('span', { class: 'msi-row__value msi-row__value--count' }, String(l.count)),
        h('span', { class: 'msi-row__value' }, l.median == null ? '—' : formatMoney(l.median)),
      ],
      () => ({ value: `${plural(l.count, 'role')}`, label: l.location, rows: [['Median pay', l.median == null ? '—' : formatMoney(l.median)], ['With pay posted for this place', String(l.salaried)]] })));
    return card('Hot locations', 'Where the openings are', h('div', { class: 'msi-rows msi-rows--loc' }, head, rows), { headTag: `h${hl + 1}`, more: sub });
  }

  // (d) fit requirements + responsibilities ---------------------------------
  function fitCard(jobs) {
    // P-6: no share bars from fewer than MIN_SAMPLE roles; pay differences as in skillCard.
    const { total, items } = fitRequirements(jobs, { limit: 8, minTotal: MIN_SAMPLE, minPremiumN: MIN_SAMPLE, stat: 'mean', dropTied: true });
    const resp = topResponsibilities(jobs, { limit: 10 });
    const sub = `Share of the ${plural(total, 'role')} in view that ask for each; the difference is average pay vs. all roles in view.`;
    const parts = [];
    if (total < MIN_SAMPLE && items.length) {
      parts.push(emptyNote(`Not enough roles in view to show shares: ${plural(total, 'role')}, and shares need ${MIN_SAMPLE} or more.`));
    } else if (items.length) {
      parts.push(h('div', { class: 'msi-rows msi-rows--fit' }, items.map((f) => row('fit', f.label,
        `${f.label}: ${formatPct(f.pct)} of roles (${fmtCount(f.count)} of ${fmtCount(total)})${f.premium == null ? '' : `, average pay ${formatDelta(f.premium).replace('−', 'minus ')} vs. all roles`}. Filter by this requirement.`,
        [
          h('span', { class: 'msi-row__label' }, h('span', { class: 'msi-row__name' }, f.label)),
          h('span', { class: 'msi-meter', 'aria-hidden': 'true' }, h('span', { class: 'msi-meter__fill', style: { width: `${f.pct * 100}%` } })),
          h('span', { class: 'msi-row__value' }, formatPct(f.pct)),
          h('span', { class: `msi-row__delta${f.premium == null ? '' : f.premium >= 0 ? ' is-pos' : ' is-neg'}` }, f.premium == null ? '' : formatDelta(f.premium)),
        ],
        () => ({ value: `${formatPct(f.pct)} of roles`, label: f.label, rows: [['Roles', `${fmtCount(f.count)} of ${fmtCount(total)}`], ['Average pay', f.average == null ? 'not enough roles with pay' : formatMoney(f.average)], ['vs. all roles', formatDelta(f.premium)]] })))));
    } else {
      parts.push(emptyNote('No requirements detected in these postings.'));
    }
    if (resp.length) {
      parts.push(h('div', { class: 'msi-chips-wrap' },
        h(`h${hl + 2}`, { class: 'msi-mini-title' }, 'Common responsibilities'),
        h('ul', { class: 'msi-chips' }, resp.map((r) => h('li', null, row('responsibility', r.label,
          `${r.label}: ${plural(r.count, 'role')} (${formatPct(r.pct)}). Filter by this responsibility.`,
          [h('span', null, r.label), h('span', { class: 'msi-chip__n' }, fmtCount(r.count))]))))));
    }
    const c = card('What roles ask for', `Share of the ${plural(total, 'role')} in view`, parts, { headTag: `h${hl + 1}`, more: sub });
    c.querySelectorAll('.msi-chips .msi-row').forEach((el) => el.classList.add('msi-chip'));
    return c;
  }

  function stats(jobs) {
    const s = summaryStats(jobs);
    const enough = s.salaried >= MIN_SAMPLE;
    const tile = (label, value, note) => h('div', { class: 'msi-stat' },
      h('div', { class: 'msi-stat__label' }, label),
      h('div', { class: 'msi-stat__value' }, value),
      note ? h('div', { class: 'msi-stat__note' }, note) : null);
    return h('div', { class: 'msi-stats', role: 'list' },
      // UX-53 / UX-61 (fix-phone-text): "of 2,781 with pay" (it read "of 2,781 salaried ro…" at 360). UX-55: a range is
      // written like the cards ("$188K–252K"), so the tile no longer cuts its number at 1440.
      [tile('Median base pay', enough ? formatMoney(s.median) : '—', !s.salaried ? 'no pay published' : enough ? `of ${fmtCount(s.salaried)} with pay` : `too few with pay (${s.salaried})`),
        tile('Middle half', enough && s.p25 != null ? moneySpan(s.p25, s.p75) : '—', 'of roles with pay'),
        tile('Pay published', formatPct(s.payShare), `${fmtCount(s.salaried)} of ${fmtCount(s.total)}`),
        tile('Remote-eligible', formatPct(s.remoteShare), plural(jobs.filter((j) => j.remote).length, 'role'))]
        .map((t) => { t.setAttribute('role', 'listitem'); return t; }));
  }

  /**
   * @param {Job[]} filteredJobs  the roles in view
   * @param {Job[]} allJobs  the whole board
   * @param {{ asOf?: string|null, places?: string[]|null }} [opts]  places: the location filter's
   *   keys (app.js S.l). With places, pay figures use only roles whose pay is posted for one of
   *   them, at the pay posted for those places (payAt, P-6 and fix-pay-at-place); the others count
   *   as roles without pay for this view.
   */
  function update(filteredJobs = [], allJobs = filteredJobs, { asOf = null, places = null } = {}) {
    const jobs0 = Array.isArray(filteredJobs) ? filteredJobs : [];
    const all = Array.isArray(allJobs) ? allJobs : jobs0;
    const where = Array.isArray(places) && places.length ? new Set(places) : null;
    let elsewhere = 0;
    const jobs = !where ? jobs0 : jobs0.map((j) => {
      if (!j?.salary) return j;
      const at = payAt(j, (l) => where.has(appKey(l)));
      if (!at) { elsewhere += 1; return { ...j, salary: null }; }
      // The pay posted for the places picked (a place's own row), as the chart and the stats line price it.
      const s = j.salary;
      return at.min === s.min && at.max === s.max && at.currency === String(s.currency || 'USD').toUpperCase() ? j
        : { ...j, salary: { ...s, min: at.min, max: at.max, mid: at.mid, currency: at.currency } };
    });
    const ote = jobs.filter((j) => isOTE(j)).length;
    // fix-density: the header's one line ("All 5,000 roles", "120 of 5,000 roles match"); the rates, dates,
    // left-out counts and the pay guide behind "Details" (viz/note.js).
    const notes = [
      ote ? `${plural(ote, 'role')} posting on-target earnings (base plus commission) left out of pay figures` : '',
      elsewhere ? `${plural(elsewhere, 'role')} whose pay is posted for other places or countries left out of pay figures` : '',
    ].filter(Boolean);
    tip.hide();
    preserveFocus(root, () => {
      header.replaceChildren(
        h(`h${hl}`, { id: headId, class: 'ms-insights__title' }, 'Market insights'),
        noteLine({ cls: 'ms-insights__sub', key: 'ins-head', about: headId,
          line: !all.length ? 'No roles loaded yet.' : jobs.length === all.length ? `All ${plural(all.length, 'role')} on this board` : `${fmtCount(jobs.length)} of ${plural(all.length, 'role')} match your filters`,
          details: !all.length ? [] : [
            `Pay in approx. US dollars${fxAsOf()}`,
            postedAsOf(asOf).replace(/^ · p/, 'P'),
            ...notes,
            h('a', { href: PAY_DOC, target: '_blank', rel: 'noopener noreferrer' }, 'How pay is read'),
          ] }));
      if (!jobs.length) {
        body.replaceChildren(emptyNote(all.length ? 'No roles match the current filters.' : 'Insights appear once a job board is loaded.'));
        return;
      }
      body.replaceChildren(stats(jobs),
        h('div', { class: 'msi-cards' }, skillCard(jobs), deptCard(jobs, all), locCard(jobs0), fitCard(jobs)));
    });
    if (root.isConnected) fitAxes();
  }
  // Hide axis labels that would collide (greedy, first/last kept) and keep
  // edge labels inside their track. Re-run when the panel resizes.
  // Reads and writes in phases (tracks, resets, ticks, then the writes): two layouts instead of one
  // per tick. Transforms and visibility move no other box, so every rect is the same as before.
  function fitAxes() {
    const axes = [];
    for (const track of root.querySelectorAll('.msi-axis__track')) {
      const ticks = [...track.querySelectorAll('.msi-axis__tick')];
      if (ticks.length) axes.push({ track, ticks, tr: track.getBoundingClientRect() });
    }
    const shown = axes.filter((a) => a.tr.width);
    for (const { ticks } of shown) for (const t of ticks) { t.style.visibility = ''; t.style.transform = ''; }
    for (const a of shown) a.boxes = a.ticks.map((t) => t.getBoundingClientRect());
    for (const { tr, ticks, boxes } of shown) {
      const rects = ticks.map((t, i) => {
        let r = boxes[i];
        const dl = tr.left - r.left, dr = r.right - tr.right;
        if (dl > 0 || dr > 0) {
          const dx = dl > 0 ? dl : -dr;
          t.style.transform = `translateX(calc(-50% + ${dx}px))`;
          r = { left: r.left + dx, right: r.right + dx };
        }
        return r;
      });
      const gap = 8;
      const last = rects.length - 1;
      let prevRight = rects[0].right;
      for (let i = 1; i < last; i++) {
        const ok = rects[i].left >= prevRight + gap && rects[i].right <= rects[last].left - gap;
        ticks[i].style.visibility = ok ? '' : 'hidden';
        if (ok) prevRight = rects[i].right;
      }
      if (last > 0 && rects[last].left < rects[0].right + gap) ticks[last].style.visibility = 'hidden';
    }
  }
  let raf = 0;
  const ro = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(fitAxes); }) : null;
  ro?.observe(root);

  update([], []);
  return { update, destroy() { ro?.disconnect(); cancelAnimationFrame(raf); tip.destroy(); root.remove(); }, el: root };
}
