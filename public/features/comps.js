// melon-seek market comps, "Same role elsewhere" / "Compare companies"
// (docs/strategy/ROADMAP.md §6.2 Top 1, §7.1 F1).
//
// Reads the market document built by scripts/build-market.js (format
// "melon-market-1", served at /api/market and api/market.json):
//   { basis, currency: "USD", minN, generatedAt, fx: { asOf },
//     companies: [{ slug, name, color, ... }],
//     columns: ["company","family","seniority","n","p25","median","p75"],
//     cells: [["anthropic","ml","Senior",41,320000,365000,405000], ...],   // seniority "*" = all full-time levels
//     oteCells: [...], counts: [["xai","design","Senior",2], ...] }
//
//   marketComps(market, { family, seniority?, country?, kind? }) -> rows[]
//   compsForJob(market, job, { includeSelf? }) -> { rows, matchedOn, family, seniority, level, kind, fallback }
//   compsNote(res) -> the sentence above the drawer chart ("" when there are no rows)
//   familyOptions(market) -> [{ id, label, companies, n }]
//   levelOptions(market, family) -> [{ id, label, companies }]
//   missingCompanies(market, { family, level }) -> [{ slug, name, why: 'few'|'levels', n }]
//   createCompsCard(container, { onPickCompany(slug, filters), market? })
//     -> { update(market, { company, jobs, visible?, filters?, job? }), setFamily(id), getFamily(), getLevel(), destroy(), el }
//
// rows: [{ slug, name, color, n, p25, median, p75, family, seniority, current? }], sorted by
// median (high first): the shape public/viz/comps.js createCompsChart().update(rows) takes.
// Pure helpers run in Node; only createCompsCard touches the DOM.
//
// Like with like (persona review 2026-10-10, docs/process/fix-estimates.md):
// - on-target earnings (salary.kind 'ote') are compared only with on-target earnings (oteCells);
// - internships and fixed-term pay only with each other ("Intern"); "*" is every full-time level;
// - "Level not stated" (the stored 'Mid' default) is never a level match.

import { roleFamily, FAMILY_LABELS, levelLabel, levelStated, SENIORITY_DISPLAY_ORDER } from './roles.js';
import { formatMoney, plural, fmtCount, niceTicks, h, uid, createTooltip, preserveFocus, isOTE, isInternLike } from './shared.js';
import { marketAsOfText } from './freshness.js';

const DEFAULT_COLUMNS = ['company', 'family', 'seniority', 'n', 'p25', 'median', 'p75'];
const PARSED = new WeakMap();

/**
 * Market cells as objects (cached per market document). Tolerates object cells too.
 * `kind` 'ote' reads the on-target-earnings cells instead of the base-pay ones.
 */
export function marketCells(market, kind = 'base') {
  if (!market || typeof market !== 'object') return [];
  const src = kind === 'ote' ? market.oteCells : market.cells;
  if (!Array.isArray(src)) return [];
  let byKind = PARSED.get(market);
  if (!byKind) PARSED.set(market, (byKind = {}));
  if (byKind[kind]) return byKind[kind];
  const cols = Array.isArray(market.columns) && market.columns.length ? market.columns : DEFAULT_COLUMNS;
  const info = new Map((market.companies || []).map((c) => [c.slug, c]));
  const out = [];
  for (const raw of src) {
    const c = Array.isArray(raw) ? Object.fromEntries(cols.map((k, i) => [k, raw[i]])) : raw;
    if (!c || !c.company || !c.family || !(c.n > 0) || !Number.isFinite(c.median)) continue;
    const co = info.get(c.company) || {};
    out.push({
      slug: c.company, name: co.name || c.company, color: co.color || null,
      n: c.n, p25: c.p25, median: c.median, p75: c.p75,
      family: c.family, seniority: c.seniority || '*',
    });
  }
  byKind[kind] = out;
  return out;
}

const byMedian = (a, b) => b.median - a.median || b.n - a.n || String(a.name).localeCompare(String(b.name));

/**
 * One row per company for a role family, at one seniority bucket ("*" = all full-time levels,
 * the default). `country` is accepted for interface stability; melon-market-1 has no
 * country dimension, so it is ignored. `kind: 'ote'` compares on-target earnings.
 * Cells already satisfy n >= market.minN.
 */
export function marketComps(market, { family, seniority, country, kind = 'base' } = {}) { // eslint-disable-line no-unused-vars
  if (!family) return [];
  const level = seniority && seniority !== 'Any' ? seniority : '*';
  return marketCells(market, kind)
    .filter((c) => c.family === family && c.seniority === level)
    .map((c) => ({ ...c }))
    .sort(byMedian);
}

/**
 * "Same role elsewhere" for a posting: other companies with the same role family, kind of pay
 * and level. The posting's own company is excluded unless `includeSelf`, in which case its row
 * (when present) is flagged `current: true`.
 *
 * - An internship or fixed-term role is compared only with internships ("Intern"); there is never
 *   a fallback across the intern / full-time line (P-11).
 * - A stated level falls back to every full-time level when no other company has 3+ salaried
 *   postings at it (fallback 'too-few-at-level').
 * - "Level not stated" is never a level match: such a posting is compared with every full-time
 *   level (fallback 'level-not-stated', P-3).
 * - On-target earnings are compared only with on-target earnings (P-1).
 *
 * @returns {{ rows: object[], matchedOn: "family+seniority"|"family"|null, family: string|null,
 *   seniority: string|null, level: string|null, kind: 'base'|'ote',
 *   fallback: null|'level-not-stated'|'too-few-at-level'|'intern-too-few'|'no-peers'|'no-family' }}
 *   `level` is the bucket compared ("Intern", a level, or "*"); `fallback` says why it is not
 *   the posting's own level, or why there are no rows.
 */
export function compsForJob(market, job, { includeSelf = false } = {}) {
  const family = job ? roleFamily(job.title || '', job) : null;
  const seniority = job?.seniority || null;
  const self = job?.company || null;
  const kind = isOTE(job) ? 'ote' : 'base';
  const res = (rows, matchedOn, level, fallback) => ({ rows, matchedOn, family, seniority, level, kind, fallback });
  if (!family) return { ...res([], null, null, 'no-family'), family: null };
  const pick = (rows) => {
    const others = rows.filter((r) => r.slug !== self);
    if (!others.length) return null;
    return includeSelf ? rows.map((r) => (r.slug === self ? { ...r, current: true } : r)) : others;
  };
  if (isInternLike(job)) {
    const interns = pick(marketComps(market, { family, seniority: 'Intern', kind }));
    return interns ? res(interns, 'family+seniority', 'Intern', null) : res([], null, 'Intern', 'intern-too-few');
  }
  const stated = levelStated(seniority) && seniority !== 'Intern';
  const exact = stated ? pick(marketComps(market, { family, seniority, kind })) : null;
  if (exact) return res(exact, 'family+seniority', seniority, null);
  const loose = pick(marketComps(market, { family, kind }));
  if (loose) return res(loose, 'family', '*', stated ? 'too-few-at-level' : 'level-not-stated');
  return res([], null, null, 'no-peers');
}

/** The sentence above the drawer's "Same role elsewhere" chart, true to what is compared. */
export function compsNote(res) {
  if (!res || !res.rows || !res.rows.length) return '';
  const fam = FAMILY_LABELS[res.family] || res.family || 'these';
  const pay = res.kind === 'ote' ? 'posted on-target earnings (base plus commission at target)' : 'posted base pay';
  if (res.level === 'Intern') return `${fam} internships and fixed-term roles: median and middle half of ${pay} as a yearly rate (approx USD).`;
  if (res.matchedOn === 'family+seniority') return `${fam} roles at ${res.level} level: median and middle half of ${pay} (approx USD).`;
  if (res.fallback === 'too-few-at-level') return `Too few ${res.seniority} ${fam} roles elsewhere list pay, so this compares ${fam} roles at every full-time level (${pay}, approx USD).`;
  return `This posting doesn't state a level, so this compares ${fam} roles at every full-time level (${pay}, approx USD).`;
}

/** Families present in the market (all-levels cells), most widely covered first. */
export function familyOptions(market) {
  const agg = new Map();
  for (const c of marketCells(market)) {
    if (c.seniority !== '*') continue;
    const a = agg.get(c.family) || { id: c.family, label: FAMILY_LABELS[c.family] || c.family, companies: 0, n: 0 };
    a.companies += 1;
    a.n += c.n;
    agg.set(c.family, a);
  }
  return [...agg.values()].sort((a, b) => b.companies - a.companies || b.n - a.n || a.label.localeCompare(b.label));
}

/** Stated levels a family can be compared at, ladder order: [{ id, label, companies }]. */
export function levelOptions(market, family) {
  const count = new Map();
  for (const c of marketCells(market)) {
    if (c.family !== family || c.seniority === '*' || !levelStated(c.seniority)) continue;
    count.set(c.seniority, (count.get(c.seniority) || 0) + 1);
  }
  return SENIORITY_DISPLAY_ORDER.filter((l) => count.has(l)).map((l) => ({ id: l, label: l === 'Intern' ? 'Intern or fixed-term' : levelLabel(l), companies: count.get(l) }));
}

/** n per company for a family at a bucket, from the cells and the below-minN counts. */
function bucketN(market, family, level) {
  const n = new Map();
  for (const c of marketCells(market)) if (c.family === family && c.seniority === level) n.set(c.slug, c.n);
  for (const raw of Array.isArray(market?.counts) ? market.counts : []) {
    const [slug, fam, lev, k] = raw;
    if (fam === family && lev === level && k > 0) n.set(slug, (n.get(slug) || 0) + k);
  }
  return n;
}

/**
 * Companies the comparison leaves out, and why (I-8: they used to vanish silently):
 * 'few' = 1 or 2 salaried postings there (below minN); 'levels' = it has postings in the family
 * but most state no level, so "no Staff+ row" would not mean "no Staff+ roles" (P-3).
 * Companies with no salaried posting in the family are not listed.
 */
export function missingCompanies(market, { family, level = '' } = {}) {
  if (!market || !family) return [];
  const bucket = level || '*';
  const shown = new Set(marketComps(market, { family, seniority: bucket }).map((r) => r.slug));
  const here = bucketN(market, family, bucket);
  const levelled = level && level !== 'Intern';
  const all = levelled ? bucketN(market, family, '*') : null;
  const unstated = levelled ? bucketN(market, family, 'Mid') : null;
  const out = [];
  for (const co of market.companies || []) {
    if (shown.has(co.slug)) continue;
    const n = here.get(co.slug) || 0;
    const total = all ? all.get(co.slug) || 0 : 0;
    if (all && total >= (market.minN || 3) && (unstated.get(co.slug) || 0) / total >= 0.5) out.push({ slug: co.slug, name: co.name || co.slug, why: 'levels', n: total });
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
function defaultFamily(market, jobs) {
  const opts = familyOptions(market);
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

/**
 * The family and level the card opens on (I-8): the open job's, else the role-family filter and
 * a single stated level filter, else the most common family among the roles in view, else the
 * board's. Never "Level not stated".
 * @returns {{ family: string|null, level: string }}  level '' = every full-time level
 */
export function compareDefaults(market, { jobs = [], visible = null, filters = {}, job = null } = {}) {
  const opts = familyOptions(market);
  const ok = (f) => !!f && opts.some((o) => o.id === f);
  const s = Array.isArray(filters?.s) ? filters.s : filters?.s ? [filters.s] : [];
  const jobFam = job ? job._family ?? roleFamily(job.title || '', job) : null;
  const family = (ok(jobFam) && jobFam) || (ok(filters?.rf) && filters.rf)
    || (Array.isArray(visible) && visible.length ? defaultFamily(market, visible) : null)
    || defaultFamily(market, jobs) || (opts.find((o) => o.companies >= 2) || opts[0])?.id || null;
  const want = job ? (isInternLike(job) ? 'Intern' : levelStated(job.seniority) ? job.seniority : '')
    : s.length === 1 && levelStated(s[0]) ? s[0] : '';
  return { family, level: want && levelOptions(market, family).some((o) => o.id === want) ? want : '' };
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
  let userPicked = false;
  let levelPicked = false;
  let followed = null; // the filters the picks were made under

  const select = h('select', { id: ids.select, class: 'ms-comp__select msi-compare__select', 'aria-describedby': ids.sub });
  const levelSelect = h('select', { id: ids.level, class: 'ms-comp__select msi-compare__select' });
  const body = h('div', { class: 'msi-compare__body' });
  const missingEl = h('p', { class: 'msi-foot msi-compare__missing', hidden: true });
  const foot = h('p', { class: 'msi-foot msi-compare__foot' });
  const live = h('p', { class: 'msf-sr', 'aria-live': 'polite', 'aria-atomic': 'true' });
  // The level picker sits beside the family picker inside the card (no new main-view control).
  const fields = h('div', { class: 'msi-compare__fields', style: { display: 'flex', flexWrap: 'wrap', gap: '0 10px' } },
    h('div', { class: 'msf-field msi-compare__field', style: { flex: '2 1 220px' } }, h('label', { for: ids.select }, 'Role family'), select),
    h('div', { class: 'msf-field msi-compare__field', style: { flex: '1 1 150px' } }, h('label', { for: ids.level }, 'Level'), levelSelect));
  const root = h('section', { class: 'ms-insights ms-compare', 'aria-labelledby': ids.head },
    h('div', { class: 'msi-card' },
      h('header', { class: 'msi-card__head' },
        h(`h${hl}`, { id: ids.head, class: 'msi-card__title' }, 'Compare companies'),
        h('p', { id: ids.sub, class: 'msi-card__sub' }, 'Posted pay for the same kind of role at each tracked company. Bar: the middle half of salaries. Tick: the median.')),
      fields, body, missingEl, foot, live));
  container.appendChild(root);
  const tip = createTooltip(root);

  select.addEventListener('change', () => { family = select.value || null; userPicked = true; fillLevels(); render(); });
  levelSelect.addEventListener('change', () => { level = levelSelect.value || ''; levelPicked = true; render(); });

  function fillSelect() {
    const opts = familyOptions(market);
    const def = compareDefaults(market, { jobs, ...view });
    // A pick in the card sticks until the role-family or level filter, or the open job, changes.
    const f = view.filters || {};
    const sig = JSON.stringify([f.rf || '', [].concat(f.s || []), view.job?.id || null]);
    if (sig !== followed) { followed = sig; userPicked = false; levelPicked = false; }
    if (family && !opts.some((o) => o.id === family)) { family = null; userPicked = false; }
    if (!family || !userPicked) family = def.family || family;
    if (!levelPicked) level = def.level;
    select.replaceChildren(...opts.map((o) => h('option', { value: o.id }, `${o.label} (${plural(o.companies, 'company', 'companies')})`)));
    select.value = family || '';
    select.disabled = !opts.length;
    fillLevels();
  }

  function fillLevels() {
    const opts = levelOptions(market, family);
    if (level && !opts.some((o) => o.id === level)) { level = ''; levelPicked = false; }
    levelSelect.replaceChildren(h('option', { value: '' }, 'Every full-time level'),
      ...opts.map((o) => h('option', { value: o.id }, `${o.label} (${plural(o.companies, 'company', 'companies')})`)));
    levelSelect.value = level;
    levelSelect.disabled = !market || !family;
  }

  function render() {
    tip.hide();
    preserveFocus(root, () => {
      body.replaceChildren();
      const rows = marketComps(market, { family, seniority: level || '*' });
      const label = FAMILY_LABELS[family] || family || '';
      const levelName = level === 'Intern' ? 'internships and fixed-term roles' : level ? `${level} roles` : 'full-time roles';
      if (!market || !Array.isArray(market.cells)) {
        body.appendChild(h('p', { class: 'msi-empty' }, 'Company comparisons appear once market data is loaded.'));
        foot.textContent = '';
        missingEl.hidden = true;
        live.textContent = '';
        return;
      }
      if (!rows.length) {
        body.appendChild(h('p', { class: 'msi-empty' }, `No company has ${market.minN || 3}+ salaried ${levelName} in this family yet.`));
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
              'aria-label': `${r.name}${cur ? ' (this company)' : ''}: median ${formatMoney(r.median)}, middle half ${formatMoney(r.p25)} to ${formatMoney(r.p75)}, ${plural(r.n, 'salaried posting')}. ${cur ? '' : `Switch to ${r.name} with this role family${level ? ' and level' : ''}.`}`,
              onclick: () => { tip.hide(); if (onPickCompany) onPickCompany(r.slug, { family, familyLabel: label, seniority: level || null }); },
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
            tip.bind(btn, () => ({ value: `${formatMoney(r.median)} median`, label: r.name, rows: [['Middle half', `${formatMoney(r.p25)} – ${formatMoney(r.p75)}`], ['Salaried postings', String(r.n)]] }));
            return btn;
          }),
          h('div', { class: 'msi-axis', 'aria-hidden': 'true' },
            h('span', { class: 'msi-axis__pad' }),
            h('span', { class: 'msi-axis__track' }, ticks.map((t) => h('span', { class: 'msi-axis__tick', style: { left: x(t) } }, formatMoney(t)))),
            h('span', { class: 'msi-axis__pad msi-axis__pad--end' })));
        body.appendChild(list);
      }
      // Companies left out, with the reason (I-8, P-3).
      const note = missingNote(missingCompanies(market, { family, level }), market.minN || 3);
      missingEl.textContent = note;
      missingEl.hidden = !note;
      // Postings and FX dates (docs/DATA_FRESHNESS.md): the market document's, the registry's FX when loaded.
      const dated = marketAsOfText(market, rows.map((r) => r.slug));
      const asOf = dated ? ` ${dated}.` : '';
      const what = level === 'Intern'
        ? 'Posted internship and fixed-term pay, as a yearly rate'
        : `${capitalize(market.basis || 'posted base pay ranges')} of ${level ? `${level} ` : ''}full-time roles`;
      const left = level === 'Intern' ? '' : ' Internships, fixed-term programmes and on-target earnings (sales pay that includes commission) are left out.';
      const place = Array.isArray(view.filters?.l) && view.filters.l.length ? ' Pay is from every location each company lists, not only the location you filtered on.' : '';
      foot.textContent = `${what}, midpoints in approx. US dollars; companies need ${market.minN || 3}+ salaried postings.${left} Equity and bonus aren't included.${place}${asOf}`;
      live.textContent = rows.length ? `${label}${level ? `, ${level === 'Intern' ? 'internships' : level}` : ''}: ${plural(rows.length, 'company', 'companies')} compared.` : '';
    });
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
