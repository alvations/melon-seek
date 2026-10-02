// melon-seek market comps, "Same role elsewhere" / "Compare companies"
// (docs/strategy/ROADMAP.md §6.2 Top 1, §7.1 F1).
//
// Reads the market document built by scripts/build-market.js (format
// "melon-market-1", served at /api/market and api/market.json):
//   { basis, currency: "USD", minN, generatedAt, fx: { asOf },
//     companies: [{ slug, name, color, ... }],
//     columns: ["company","family","seniority","n","p25","median","p75"],
//     cells: [["anthropic","ml","Senior",41,320000,365000,405000], ...] }   // seniority "*" = all levels
//
//   marketComps(market, { family, seniority?, country? }) -> rows[]
//   compsForJob(market, job, { includeSelf? }) -> { rows, matchedOn, family, seniority }
//   familyOptions(market) -> [{ id, label, companies, n }]
//   createCompsCard(container, { onPickCompany(slug, filters), market? })
//     -> { update(market, { company, jobs }), setFamily(id), getFamily(), destroy(), el }
//
// rows: [{ slug, name, color, n, p25, median, p75, family, seniority, current? }], sorted by
// median (high first): the shape public/viz/comps.js createCompsChart().update(rows) takes.
// Pure helpers run in Node; only createCompsCard touches the DOM.

import { roleFamily, FAMILY_LABELS } from './roles.js';
import { formatMoney, plural, niceTicks, h, uid, createTooltip, preserveFocus } from './shared.js';

const DEFAULT_COLUMNS = ['company', 'family', 'seniority', 'n', 'p25', 'median', 'p75'];
const PARSED = new WeakMap();

/** Market cells as objects (cached per market document). Tolerates object cells too. */
export function marketCells(market) {
  if (!market || typeof market !== 'object' || !Array.isArray(market.cells)) return [];
  const hit = PARSED.get(market);
  if (hit) return hit;
  const cols = Array.isArray(market.columns) && market.columns.length ? market.columns : DEFAULT_COLUMNS;
  const info = new Map((market.companies || []).map((c) => [c.slug, c]));
  const out = [];
  for (const raw of market.cells) {
    const c = Array.isArray(raw) ? Object.fromEntries(cols.map((k, i) => [k, raw[i]])) : raw;
    if (!c || !c.company || !c.family || !(c.n > 0) || !Number.isFinite(c.median)) continue;
    const co = info.get(c.company) || {};
    out.push({
      slug: c.company, name: co.name || c.company, color: co.color || null,
      n: c.n, p25: c.p25, median: c.median, p75: c.p75,
      family: c.family, seniority: c.seniority || '*',
    });
  }
  PARSED.set(market, out);
  return out;
}

const byMedian = (a, b) => b.median - a.median || b.n - a.n || String(a.name).localeCompare(String(b.name));

/**
 * One row per company for a role family, at one seniority bucket ("*" = all levels,
 * the default). `country` is accepted for interface stability; melon-market-1 has no
 * country dimension, so it is ignored. Cells already satisfy n >= market.minN.
 */
export function marketComps(market, { family, seniority, country } = {}) { // eslint-disable-line no-unused-vars
  if (!family) return [];
  const level = seniority && seniority !== 'Any' ? seniority : '*';
  return marketCells(market)
    .filter((c) => c.family === family && c.seniority === level)
    .map((c) => ({ ...c }))
    .sort(byMedian);
}

/**
 * "Same role elsewhere" for a posting: other companies with the same role family and
 * seniority; if none has n >= minN at that seniority, falls back to the family across
 * all levels (matchedOn "family"). The posting's own company is excluded unless
 * `includeSelf`, in which case its row (when present) is flagged `current: true`.
 * @returns {{ rows: object[], matchedOn: "family+seniority"|"family"|null, family: string|null, seniority: string|null }}
 */
export function compsForJob(market, job, { includeSelf = false } = {}) {
  const family = job ? roleFamily(job.title || '', job) : null;
  const seniority = job?.seniority || null;
  const self = job?.company || null;
  if (!family) return { rows: [], matchedOn: null, family: null, seniority };
  const pick = (rows) => {
    const others = rows.filter((r) => r.slug !== self);
    if (!others.length) return null;
    return includeSelf ? rows.map((r) => (r.slug === self ? { ...r, current: true } : r)) : others;
  };
  const exact = seniority ? pick(marketComps(market, { family, seniority })) : null;
  if (exact) return { rows: exact, matchedOn: 'family+seniority', family, seniority };
  const loose = pick(marketComps(market, { family }));
  if (loose) return { rows: loose, matchedOn: 'family', family, seniority };
  return { rows: [], matchedOn: null, family, seniority };
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

/** Most common family among a company's salaried jobs that the market covers for 2+ companies. */
function defaultFamily(market, jobs) {
  const opts = familyOptions(market);
  const covered = new Set(opts.filter((o) => o.companies >= 2).map((o) => o.id));
  const count = new Map();
  for (const j of jobs || []) {
    if (!j || !j.salary) continue;
    const f = roleFamily(j.title || '', j);
    if (f && covered.has(f)) count.set(f, (count.get(f) || 0) + 1);
  }
  const top = [...count].sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : (opts.find((o) => o.companies >= 2) || opts[0])?.id || null;
}

// ---------------------------------------------------------------------------
// Insights card (browser)
// ---------------------------------------------------------------------------

/**
 * "Compare companies" card for Insights mode: a role-family picker and one range row
 * per company (P25–P75 bar, median tick, shared axis). Clicking a row calls
 * onPickCompany(slug, { family, familyLabel, seniority: null }).
 */
export function createCompsCard(container, { onPickCompany, market: initialMarket, headingLevel = 3 } = {}) {
  const hl = Math.min(5, Math.max(1, headingLevel));
  const ids = { head: uid('cmp-h'), select: uid('cmp-f'), sub: uid('cmp-s') };
  let market = null;
  let company = null;
  let jobs = [];
  let family = null;
  let userPicked = false;

  const select = h('select', { id: ids.select, class: 'ms-comp__select msi-compare__select', 'aria-describedby': ids.sub });
  const body = h('div', { class: 'msi-compare__body' });
  const foot = h('p', { class: 'msi-foot msi-compare__foot' });
  const live = h('p', { class: 'msf-sr', 'aria-live': 'polite', 'aria-atomic': 'true' });
  const root = h('section', { class: 'ms-insights ms-compare', 'aria-labelledby': ids.head },
    h('div', { class: 'msi-card' },
      h('header', { class: 'msi-card__head' },
        h(`h${hl}`, { id: ids.head, class: 'msi-card__title' }, 'Compare companies'),
        h('p', { id: ids.sub, class: 'msi-card__sub' }, 'Posted base pay for the same kind of role at each tracked company. Bar = middle 50%, tick = median.')),
      h('div', { class: 'msf-field msi-compare__field' }, h('label', { for: ids.select }, 'Role family'), select),
      body, foot, live));
  container.appendChild(root);
  const tip = createTooltip(root);

  select.addEventListener('change', () => { family = select.value || null; userPicked = true; render(); });

  function fillSelect() {
    const opts = familyOptions(market);
    if (family && !opts.some((o) => o.id === family)) family = null;
    if (!family || !userPicked) family = defaultFamily(market, jobs) || family;
    select.replaceChildren(...opts.map((o) => h('option', { value: o.id }, `${o.label} (${plural(o.companies, 'company', 'companies')})`)));
    select.value = family || '';
    select.disabled = !opts.length;
  }

  function render() {
    tip.hide();
    preserveFocus(root, () => {
      body.replaceChildren();
      const rows = marketComps(market, { family });
      const label = FAMILY_LABELS[family] || family || '';
      if (!market || !Array.isArray(market.cells)) {
        body.appendChild(h('p', { class: 'msi-empty' }, 'Company comparisons appear once market data is loaded.'));
        foot.textContent = '';
        live.textContent = '';
        return;
      }
      if (!rows.length) {
        body.appendChild(h('p', { class: 'msi-empty' }, `No company has ${market.minN || 3}+ salaried postings in this family yet.`));
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
              'aria-label': `${r.name}${cur ? ' (this company)' : ''}: median ${formatMoney(r.median)}, middle 50% ${formatMoney(r.p25)} to ${formatMoney(r.p75)}, ${plural(r.n, 'salaried posting')}. ${cur ? '' : `Switch to ${r.name} with this role family.`}`,
              onclick: () => { tip.hide(); if (onPickCompany) onPickCompany(r.slug, { family, familyLabel: label, seniority: null }); },
            },
            h('span', { class: 'msi-row__label' },
              h('i', { class: 'msi-swatch', style: r.color ? { background: r.color } : null, 'aria-hidden': 'true' }),
              h('span', { class: 'msi-row__name' }, r.name),
              h('span', { class: 'msi-row__n' }, String(r.n)),
              cur ? h('span', { class: 'msi-row__tag' }, 'this company') : null),
            h('span', { class: 'msi-row__value' }, formatMoney(r.median)),
            h('span', { class: 'msi-box', 'aria-hidden': 'true' },
              ticks.map((t) => h('span', { class: 'msi-grid', style: { left: x(t) } })),
              h('span', { class: 'msi-box__iqr', style: { left: x(r.p25), width: `max(4px, calc(${x(r.p75)} - ${x(r.p25)}))` } }),
              h('span', { class: 'msi-box__med', style: { left: x(r.median) } })));
            tip.bind(btn, () => ({ value: `${formatMoney(r.median)} median`, label: r.name, rows: [['Middle 50%', `${formatMoney(r.p25)} – ${formatMoney(r.p75)}`], ['Salaried postings', String(r.n)]] }));
            return btn;
          }),
          h('div', { class: 'msi-axis', 'aria-hidden': 'true' },
            h('span', { class: 'msi-axis__pad' }),
            h('span', { class: 'msi-axis__track' }, ticks.map((t) => h('span', { class: 'msi-axis__tick', style: { left: x(t) } }, formatMoney(t)))),
            h('span', { class: 'msi-axis__pad msi-axis__pad--end' })));
        body.appendChild(list);
      }
      const asOf = market.fx?.asOf ? ` FX as of ${market.fx.asOf}.` : '';
      foot.textContent = `${capitalize(market.basis || 'posted base pay ranges')}, midpoints in approx. USD; companies need ${market.minN || 3}+ salaried postings. Equity and bonus aren't included.${asOf}`;
      live.textContent = rows.length ? `${label}: ${plural(rows.length, 'company', 'companies')} compared.` : '';
    });
    fitAxes(root);
  }

  function update(nextMarket, { company: slug, jobs: nextJobs } = {}) {
    if (nextMarket !== undefined) market = nextMarket;
    if (slug !== undefined) company = slug;
    if (nextJobs !== undefined) jobs = Array.isArray(nextJobs) ? nextJobs : [];
    fillSelect();
    render();
  }

  if (initialMarket) update(initialMarket); else render();

  return {
    update,
    setFamily(id) { family = id || null; userPicked = !!id; fillSelect(); render(); },
    getFamily: () => family,
    destroy() { tip.destroy(); root.remove(); },
    el: root,
  };
}

function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

/** Keep axis labels inside the track and drop interior ticks that would collide. */
function fitAxes(root) {
  if (!root.isConnected) return;
  for (const track of root.querySelectorAll('.msi-axis__track')) {
    const ticks = [...track.querySelectorAll('.msi-axis__tick')];
    const tr = track.getBoundingClientRect();
    if (!ticks.length || !tr.width) continue;
    let prevRight = -Infinity;
    for (const t of ticks) {
      t.style.visibility = ''; t.style.transform = '';
      let r = t.getBoundingClientRect();
      const dl = tr.left - r.left, dr = r.right - tr.right;
      if (dl > 0 || dr > 0) { const dx = dl > 0 ? dl : -dr; t.style.transform = `translateX(calc(-50% + ${dx}px))`; r = { left: r.left + dx, right: r.right + dx }; }
      if (r.left < prevRight + 8) t.style.visibility = 'hidden'; else prevRight = r.right;
    }
  }
}
