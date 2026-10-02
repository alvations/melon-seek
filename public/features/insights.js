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
  salaryUSD, percentile, median, formatMoney, formatDelta, formatPct, plural, niceTicks,
  jobLocationKeys, h, createTooltip, preserveFocus, uid,
} from './shared.js';

export { percentile, median, salaryUSD, toUSD } from './shared.js';

// ---------------------------------------------------------------------------
// Pure stats
// ---------------------------------------------------------------------------

function midOf(job) { const p = salaryUSD(job); return p ? p.mid : null; }

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
 *   -> { baseline, salaried, items: [{ skill, n, count, median, premium }] }
 * `n` = salaried jobs with the skill; `count` = all jobs with the skill.
 */
export function skillPremiums(jobs = [], { limit = 12, minCount = 3 } = {}) {
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
  const items = [...by.values()]
    .filter((e) => e.mids.length >= minCount)
    .sort((a, b) => b.mids.length - a.mids.length || b.count - a.count || a.skill.localeCompare(b.skill))
    .slice(0, limit)
    .map((e) => {
      const med = median(e.mids);
      return { skill: e.skill, n: e.mids.length, count: e.count, median: med, premium: baseline == null ? null : med - baseline };
    })
    .sort((a, b) => b.premium - a.premium || b.n - a.n);
  return { baseline, salaried: mids.length, items };
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
 */
export function hotLocations(jobs = [], { limit = 8 } = {}) {
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
      if (m != null) e.mids.push(m);
    }
  }
  return [...by.values()]
    .sort((a, b) => b.count - a.count || a.location.localeCompare(b.location))
    .slice(0, limit)
    .map(({ mids, ...e }) => ({ ...e, salaried: mids.length, median: median(mids) }));
}

/**
 * Share of roles asking for each fit keyword ("PhD", "5+ yrs" ...), plus the
 * median pay of those roles vs the overall median.
 *   -> { total, baseline, items: [{ label, count, pct, median, premium }] }
 * median/premium are null when fewer than `minPremiumN` of those roles list pay.
 */
export function fitRequirements(jobs = [], { limit = 8, facet = 'fit', minPremiumN = 3 } = {}) {
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
  const total = jobs.length;
  const items = [...by.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit)
    .map((e) => {
      const med = e.mids.length >= minPremiumN ? median(e.mids) : null;
      return { label: e.label, count: e.count, pct: total ? e.count / total : 0, median: med, premium: med == null || baseline == null ? null : med - baseline };
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

function card(title, subtitle, body, { id = uid('ins'), headTag = 'h3', extra = null } = {}) {
  return h('section', { class: 'msi-card', 'aria-labelledby': id },
    h('header', { class: 'msi-card__head' },
      h(headTag, { id, class: 'msi-card__title' }, title),
      subtitle ? h('p', { class: 'msi-card__sub' }, subtitle) : null,
      extra),
    body);
}

function emptyNote(text) { return h('p', { class: 'msi-empty' }, text); }

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
  function skillCard(jobs) {
    const { baseline, items, salaried } = skillPremiums(jobs);
    const sub = baseline == null ? 'Median pay of roles listing each skill vs. all roles in view.'
      : `Median pay of roles listing each skill vs. the ${formatMoney(baseline)} median of roles in view.`;
    if (!items.length) {
      return card('Skill premium', sub, emptyNote(salaried ? 'Not enough salaried roles list skills to compare.' : 'None of these roles publish pay.'), { headTag: `h${hl + 1}` });
    }
    const maxAbs = Math.max(...items.map((i) => Math.abs(i.premium)), 1);
    const rows = items.map((it) => {
      const frac = Math.abs(it.premium) / maxAbs * 50;
      const pos = it.premium >= 0;
      const delta = formatDelta(it.premium);
      return row('skill', it.skill,
        `${it.skill}: median ${formatMoney(it.median)}, ${delta.replace('−', 'minus ')} vs. median, ${plural(it.n, 'salaried role')}. Filter by this skill.`,
        [
          h('span', { class: 'msi-row__label' }, h('span', { class: 'msi-row__name' }, it.skill), h('span', { class: 'msi-row__n' }, String(it.n))),
          h('span', { class: 'msi-div', 'aria-hidden': 'true' },
            h('span', { class: `msi-div__bar ${pos ? 'msi-div__bar--pos' : 'msi-div__bar--neg'}`, style: pos ? { left: '50%', width: `${frac}%` } : { right: '50%', width: `${frac}%` } }),
            h('span', { class: 'msi-div__zero' })),
          h('span', { class: `msi-row__value ${pos ? 'is-pos' : 'is-neg'}` }, delta),
        ],
        () => ({ value: `${delta} · ${formatMoney(it.median)} median`, label: it.skill, rows: [['Salaried roles', String(it.n)], ['All roles listing it', String(it.count)], ['Baseline median', formatMoney(baseline)]] }));
    });
    const legend = h('div', { class: 'msi-legend', 'aria-hidden': 'true' },
      h('span', null, h('i', { class: 'msi-key msi-key--neg' }), 'Pays less'),
      h('span', null, h('i', { class: 'msi-key msi-key--pos' }), 'Pays more'),
      h('span', { class: 'msi-legend__n' }, '# = salaried roles'));
    return card('Skill premium', sub, h('div', { class: 'msi-rows msi-rows--div' }, rows, legend), { headTag: `h${hl + 1}` });
  }

  // (b) salary by department --------------------------------------------------
  function deptCard(jobs, allJobs) {
    // A box needs a few points: prefer departments with 3+ salaried roles.
    const allBoxes = deptBoxes(jobs);
    const solid = allBoxes.filter((b) => b.n >= 3);
    const boxes = (solid.length ? solid : allBoxes).slice(0, 10);
    const hidden = allBoxes.length - boxes.length;
    const sub = 'Middle 50% of pay (box), 10th–90th percentile (whiskers), median (tick).';
    if (!boxes.length) return card('Pay by department', sub, emptyNote('None of these roles publish pay.'), { headTag: `h${hl + 1}` });
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
      `${b.department}: median ${formatMoney(b.median)}, middle 50% ${formatMoney(b.p25)} to ${formatMoney(b.p75)}, 10th to 90th percentile ${formatMoney(b.p10)} to ${formatMoney(b.p90)}, ${plural(b.n, 'role')}. Filter by this department.`,
      [
        h('span', { class: 'msi-row__label' }, h('span', { class: 'msi-row__name' }, b.department), h('span', { class: 'msi-row__n' }, String(b.n))),
        h('span', { class: 'msi-row__value' }, formatMoney(b.median)),
        h('span', { class: 'msi-box', 'aria-hidden': 'true' }, grid(),
          h('span', { class: 'msi-box__whisker', style: { left: x(b.p10), width: `calc(${x(b.p90)} - ${x(b.p10)})` } }),
          h('span', { class: 'msi-box__iqr', style: { left: x(b.p25), width: `max(4px, calc(${x(b.p75)} - ${x(b.p25)}))` } }),
          h('span', { class: 'msi-box__med', style: { left: x(b.median) } })),
      ],
      () => ({ value: `${formatMoney(b.median)} median`, label: b.department, rows: [['P10–P90', `${formatMoney(b.p10)} – ${formatMoney(b.p90)}`], ['P25–P75', `${formatMoney(b.p25)} – ${formatMoney(b.p75)}`], ['Salaried roles', String(b.n)]] })));
    const axis = h('div', { class: 'msi-axis', 'aria-hidden': 'true' },
      h('span', { class: 'msi-axis__pad' }),
      h('span', { class: 'msi-axis__track' }, ticks.map((t) => h('span', { class: 'msi-axis__tick', style: { left: x(t) } }, formatMoney(t)))),
      h('span', { class: 'msi-axis__pad msi-axis__pad--end' }));
    const foot = hidden > 0
      ? h('p', { class: 'msi-foot' }, `${plural(hidden, 'department')} with fewer than 3 salaried roles not shown.`) : null;
    return card('Pay by department', sub, [h('div', { class: 'msi-rows msi-rows--box' }, rows, axis), foot], { headTag: `h${hl + 1}` });
  }

  // (c) hot locations -------------------------------------------------------
  function locCard(jobs) {
    const locs = hotLocations(jobs, { limit: 8 });
    const sub = 'Where the openings are. Multi-location roles count in each city.';
    if (!locs.length) return card('Hot locations', sub, emptyNote('No locations listed.'), { headTag: `h${hl + 1}` });
    const max = Math.max(...locs.map((l) => l.count));
    const head = h('div', { class: 'msi-cols', 'aria-hidden': 'true' }, h('span', null, 'Location'), h('span'), h('span', null, 'Roles'), h('span', null, 'Median'));
    const rows = locs.map((l) => row('location', l.location,
      `${l.location}${l.country && !l.remote ? `, ${l.country}` : ''}: ${plural(l.count, 'role')}, median pay ${l.median == null ? 'not published' : formatMoney(l.median)}. Filter by this location.`,
      [
        h('span', { class: 'msi-row__label' }, h('span', { class: 'msi-row__name' }, l.location), l.country && !l.remote ? h('span', { class: 'msi-row__tag' }, l.country) : null),
        h('span', { class: 'msi-bar', 'aria-hidden': 'true' }, h('span', { class: 'msi-bar__fill', style: { width: `${(l.count / max) * 100}%` } })),
        h('span', { class: 'msi-row__value msi-row__value--count' }, String(l.count)),
        h('span', { class: 'msi-row__value' }, l.median == null ? '—' : formatMoney(l.median)),
      ],
      () => ({ value: `${plural(l.count, 'role')}`, label: l.location, rows: [['Median pay', l.median == null ? '—' : formatMoney(l.median)], ['With published pay', String(l.salaried)]] })));
    return card('Hot locations', sub, h('div', { class: 'msi-rows msi-rows--loc' }, head, rows), { headTag: `h${hl + 1}` });
  }

  // (d) fit requirements + responsibilities ---------------------------------
  function fitCard(jobs) {
    const { total, items } = fitRequirements(jobs, { limit: 8 });
    const resp = topResponsibilities(jobs, { limit: 10 });
    const sub = `Share of the ${plural(total, 'role')} in view that ask for each.`;
    const parts = [];
    if (items.length) {
      parts.push(h('div', { class: 'msi-rows msi-rows--fit' }, items.map((f) => row('fit', f.label,
        `${f.label}: ${formatPct(f.pct)} of roles (${f.count} of ${total})${f.premium == null ? '' : `, median pay ${formatDelta(f.premium).replace('−', 'minus ')} vs. all roles`}. Filter by this requirement.`,
        [
          h('span', { class: 'msi-row__label' }, h('span', { class: 'msi-row__name' }, f.label)),
          h('span', { class: 'msi-meter', 'aria-hidden': 'true' }, h('span', { class: 'msi-meter__fill', style: { width: `${f.pct * 100}%` } })),
          h('span', { class: 'msi-row__value' }, formatPct(f.pct)),
          h('span', { class: `msi-row__delta${f.premium == null ? '' : f.premium >= 0 ? ' is-pos' : ' is-neg'}` }, f.premium == null ? '' : formatDelta(f.premium)),
        ],
        () => ({ value: `${formatPct(f.pct)} of roles`, label: f.label, rows: [['Roles', `${f.count} of ${total}`], ['Median pay', formatMoney(f.median)], ['vs. all roles', formatDelta(f.premium)]] })))));
    } else {
      parts.push(emptyNote('No requirements detected in these postings.'));
    }
    if (resp.length) {
      parts.push(h('div', { class: 'msi-chips-wrap' },
        h(`h${hl + 2}`, { class: 'msi-mini-title' }, 'Common responsibilities'),
        h('ul', { class: 'msi-chips' }, resp.map((r) => h('li', null, row('responsibility', r.label,
          `${r.label}: ${plural(r.count, 'role')} (${formatPct(r.pct)}). Filter by this responsibility.`,
          [h('span', null, r.label), h('span', { class: 'msi-chip__n' }, String(r.count))]))))));
    }
    const c = card('What roles ask for', sub, parts, { headTag: `h${hl + 1}` });
    c.querySelectorAll('.msi-chips .msi-row').forEach((el) => el.classList.add('msi-chip'));
    return c;
  }

  function stats(jobs, allJobs) {
    const s = summaryStats(jobs);
    const tile = (label, value, note) => h('div', { class: 'msi-stat' },
      h('div', { class: 'msi-stat__label' }, label),
      h('div', { class: 'msi-stat__value' }, value),
      note ? h('div', { class: 'msi-stat__note' }, note) : null);
    return h('div', { class: 'msi-stats', role: 'list' },
      [tile('Median base pay', formatMoney(s.median), s.median == null ? 'no pay published' : `of ${plural(s.salaried, 'salaried role')}`),
        tile('Middle 50%', s.p25 == null ? '—' : `${formatMoney(s.p25)}–${formatMoney(s.p75)}`, 'P25 to P75'),
        tile('Pay published', formatPct(s.payShare), `${s.salaried} of ${s.total}`),
        tile('Remote-eligible', formatPct(s.remoteShare), plural(jobs.filter((j) => j.remote).length, 'role'))]
        .map((t) => { t.setAttribute('role', 'listitem'); return t; }));
  }

  function update(filteredJobs = [], allJobs = filteredJobs) {
    const jobs = Array.isArray(filteredJobs) ? filteredJobs : [];
    const all = Array.isArray(allJobs) ? allJobs : jobs;
    tip.hide();
    preserveFocus(root, () => {
      header.replaceChildren(
        h(`h${hl}`, { id: headId, class: 'ms-insights__title' }, 'Market insights'),
        h('p', { class: 'ms-insights__sub' }, !all.length ? 'No roles loaded yet.'
          : jobs.length === all.length
          ? `All ${plural(all.length, 'role')} on this board · pay in approx. USD`
          : `${jobs.length} of ${plural(all.length, 'role')} match your filters · pay in approx. USD`));
      if (!jobs.length) {
        body.replaceChildren(emptyNote(all.length ? 'No roles match the current filters.' : 'Insights appear once a job board is loaded.'));
        return;
      }
      body.replaceChildren(stats(jobs, all),
        h('div', { class: 'msi-cards' }, skillCard(jobs), deptCard(jobs, all), locCard(jobs), fitCard(jobs)));
    });
    if (root.isConnected) fitAxes();
  }

  // Hide axis labels that would collide (greedy, first/last kept) and keep
  // edge labels inside their track. Re-run when the panel resizes.
  function fitAxes() {
    for (const track of root.querySelectorAll('.msi-axis__track')) {
      const ticks = [...track.querySelectorAll('.msi-axis__tick')];
      if (!ticks.length) continue;
      const tr = track.getBoundingClientRect();
      if (!tr.width) continue;
      for (const t of ticks) { t.style.visibility = ''; t.style.transform = ''; }
      const rects = ticks.map((t) => {
        let r = t.getBoundingClientRect();
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
