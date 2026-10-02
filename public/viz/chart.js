// melon-seek salary landscape chart.
//
// createChart(container, { onSelect(job), onHover(job|null), onClusterSelect(jobs, label) })
//   -> { update(jobs, { view, groupBy, colorBy }), highlight(jobId|null),
//        clearSelection(), destroy() }
//
// Two views share one approx-USD salary axis, a slim sticky midpoint
// distribution strip, and a muted notes line under the chart:
//
// - "clusters" (default): one calm row per group (department by default;
//   groupBy "none" gives a single "All roles" row). Postings are binned by
//   midpoint and each bin is one circle sized by count (sqrt scale) over a soft
//   P25–P75 band with a median tick. Click a circle or a row label to call
//   onClusterSelect(jobs, label).
// - "ranges" (detail): one min–max range bar per posting, with a midpoint dot,
//   sorted by midpoint and optionally grouped into bands. Click calls onSelect(job).
//
// Plain DOM. Hover and keyboard focus only toggle classes and never re-render.

import {
  colorFor, assignColors, otherColor, slotColor, inkOn, OTHER_KEY, SLOT_COUNT, formatMoney,
  formatCurrency, toUSD, isForeign, hasFx, niceTicks, median, onThemeChange, prefersReducedMotion, isDark,
} from './palette.js';

export const VIEWS = Object.freeze(['clusters', 'ranges']);
export const DEFAULT_VIEW = 'clusters';

const ROW_H = 22;          // ranges: one posting
const HEAD_H = 30;         // ranges: group band header
const HIST_H = 28;         // distribution strip
const CROW_H = 52;         // clusters: one group row (wide)
const CROW_LABEL_H = 22;   // clusters, narrow: label line above the plot
const CROW_PLOT_H = 44;    // clusters, narrow: plot height
const BIN_STEPS = [10000, 20000, 25000, 50000, 100000, 200000, 250000, 500000];
const MIN_BIN_PX = 34;     // a bin must be wide enough for a readable, countable circle
const SENIORITY_ORDER = ['Director+', 'Manager', 'Staff+', 'Senior', 'Mid', 'Entry', 'Intern'];
const ALL_ROLES = 'All roles';

const INTERVAL_ADJ = { hour: 'hourly', day: 'daily', week: 'weekly', month: 'monthly' };
const DIM_LABEL = { department: 'department', location: 'location', seniority: 'seniority' };

/** Category key for a job along a dimension. */
export function keyOf(job, dim) {
  if (dim === 'department') return job.department || 'No department';
  if (dim === 'seniority') return job.seniority || 'Unspecified';
  if (dim === 'location') return primaryLocation(job);
  return 'All';
}

function primaryLocation(job) {
  const locs = job.locations || [];
  const onsite = locs.find(l => !l.remote);
  if (onsite) return onsite.city || onsite.name || 'Unknown';
  if (job.remote || locs.some(l => l.remote)) return 'Remote';
  return 'Unknown';
}

function locationText(job) {
  const locs = job.locations || [];
  if (!locs.length) return job.remote ? 'Remote' : '';
  const names = locs.map(l => l.name || l.city).filter(Boolean);
  return names.length > 3 ? `${names.slice(0, 3).join(' · ')} +${names.length - 3}` : names.join(' · ');
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function plural(n, one, many = one + 's') { return `${n.toLocaleString()} ${n === 1 ? one : many}`; }

function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q, i = Math.floor(pos), f = pos - i;
  return i + 1 < sorted.length ? sorted[i] + (sorted[i + 1] - sorted[i]) * f : sorted[i];
}

const moneyRange = (a, b) => `${formatMoney(a)}–${formatMoney(b)}`;

export function createChart(container, { onSelect, onHover, onClusterSelect } = {}) {
  container.classList.add('ms-chart');
  container.replaceChildren();

  const head = el('div', 'ms-chart__head');
  const legend = el('div', 'ms-chart__legend');
  legend.setAttribute('role', 'group');
  legend.setAttribute('aria-label', 'Legend');
  head.append(legend);

  const scroll = el('div', 'ms-chart__scroll');
  const sticky = el('div', 'ms-chart__sticky');
  const hist = el('div', 'ms-chart__hist');
  const axis = el('div', 'ms-chart__axis');
  sticky.append(hist, axis);
  const body = el('div', 'ms-chart__body');
  body.tabIndex = 0;
  body.setAttribute('role', 'listbox');
  const grid = el('div', 'ms-chart__grid');
  const rowsEl = el('div', 'ms-chart__rows');
  grid.setAttribute('aria-hidden', 'true');
  rowsEl.setAttribute('role', 'none');
  body.append(grid, rowsEl);
  scroll.append(sticky, body);

  const foot = el('div', 'ms-chart__foot');
  const empty = el('div', 'ms-chart__empty');
  empty.hidden = true;
  container.append(head, scroll, empty, foot);

  const tip = el('div', 'ms-viz-tip');
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  document.body.append(tip);

  const uid = 'ms-c' + Math.random().toString(36).slice(2, 8);
  let jobs = [];
  let opts = { view: DEFAULT_VIEW, groupBy: 'department', colorBy: 'none' };
  let plotted = [];          // [{ job, lo, hi, mid, cur, key }]
  let highlighted = null;
  let width = 0;
  let raf = 0;
  // ranges view state
  let rowByJob = new Map();  // jobId -> row element
  let itemByRow = [];        // row index -> plotted item
  let hoverIdx = -1;
  let activeIdx = -1;
  // clusters view state
  let cRows = [];            // [{ key, name, all, items, median, p25, p75, color, ink, el, labelEl, bins: [...] }]
  let binByJob = new Map();  // jobId -> bin
  let cActive = null;        // { r, i } (i = -1: the row label)
  let cHover = null;         // bin element
  let selectedKey = null;    // "rowKey\0binStart" or "rowKey\0*"

  // ---------- data prep ----------
  function prepare() {
    plotted = [];
    let noSalary = 0, fxCount = 0;
    const unknownFx = new Set();
    for (const job of jobs) {
      const s = job.salary;
      if (!s || (s.min == null && s.max == null)) { noSalary++; continue; }
      const cur = (s.currency || 'USD').toUpperCase();
      const min = s.min ?? s.max, max = s.max ?? s.min;
      if (isForeign(cur)) { if (hasFx(cur)) fxCount++; else unknownFx.add(cur); }
      const lo = toUSD(Math.min(min, max), cur), hi = toUSD(Math.max(min, max), cur);
      const mid = s.mid != null ? toUSD(s.mid, cur) : (lo + hi) / 2;
      if (!isFinite(lo) || !isFinite(hi) || !isFinite(mid)) { noSalary++; continue; }
      plotted.push({ job, lo, hi, mid, cur, key: keyOf(job, opts.colorBy) });
    }
    return { noSalary, fxCount, unknownFx: [...unknownFx] };
  }

  // ---------- render (shared) ----------
  function render() {
    raf = 0;
    width = scroll.clientWidth || container.clientWidth || 800;
    const stats = prepare();
    const clusters = opts.view === 'clusters';
    container.classList.toggle('ms-chart--clusters', clusters);
    container.classList.toggle('ms-chart--ranges', !clusters);
    body.setAttribute('aria-label', clusters
      ? `Salary clusters by ${opts.groupBy === 'none' ? 'all roles' : DIM_LABEL[opts.groupBy] || opts.groupBy}. Arrow keys move, Enter selects`
      : 'Salary ranges, use arrow keys to move and Enter to open');

    // Keep the keyboard-active option on the same thing across re-renders;
    // never let a stale index point at something else.
    const activeJobId = itemByRow[activeIdx]?.job.id ?? null;
    const activeCKey = cActive ? cKeyOf(cActive.r, cActive.i) : null;
    activeIdx = -1; cActive = null; hoverIdx = -1; cHover = null;
    body.removeAttribute('aria-activedescendant');
    rowByJob = new Map(); itemByRow = []; binByJob = new Map(); cRows = [];
    hideTip();

    const narrow = width < 520;
    container.classList.toggle('ms-chart--narrow', narrow);

    if (!plotted.length) {
      head.hidden = true;
      scroll.hidden = true;
      empty.hidden = false;
      empty.replaceChildren(
        el('div', 'ms-chart__empty-title', jobs.length ? 'No published salaries' : 'No postings to plot'),
        el('div', 'ms-chart__empty-sub', jobs.length
          ? `${plural(jobs.length, 'posting')} match, but none list a salary range.`
          : 'Try widening the filters.'),
      );
      renderNotes(stats, narrow);
      return;
    }
    scroll.hidden = false;
    empty.hidden = true;

    if (clusters) {
      head.hidden = true;
      renderClusters(stats, narrow);
      if (activeCKey) { const a = cFindKey(activeCKey); if (a) setCActive(a.r, a.i, false); }
    } else {
      renderRanges(stats, narrow);
      if (activeJobId != null) {
        const i = itemByRow.findIndex(p => p.job.id === activeJobId);
        if (i >= 0) setActive(i, false);
      }
    }
    renderNotes(stats, narrow);

    // Scroll mode: scroll internally only when the container constrains height;
    // otherwise flow with the page so the sticky header sticks to the viewport.
    container.classList.remove('ms-chart--flow');
    if (scroll.scrollHeight <= scroll.clientHeight + 1) container.classList.add('ms-chart--flow');

    if (highlighted) applyHighlight(highlighted, false);
  }

  function renderNotes({ noSalary, fxCount, unknownFx }, narrow) {
    foot.replaceChildren();
    const parts = [];
    if (plotted.length) parts.push(`${plural(plotted.length, 'posting')} with salary`);
    if (noSalary) parts.push(`${plural(noSalary, 'posting')} without published salary`);
    if (fxCount) parts.push(`${fxCount.toLocaleString()} non-USD shown as approx USD`);
    if (unknownFx.length) parts.push(`${unknownFx.join(', ')} plotted unconverted`);
    if (narrow && plotted.length) parts.push('annual salary');
    foot.textContent = parts.join(' · ');
    foot.title = fxCount ? 'Non-USD salaries are converted with a static exchange-rate table (GBP, EUR, CAD, AUD, JPY, SGD, CHF). Approximate.' : '';
    foot.hidden = !parts.length;
  }

  function renderHist(x, d0, d1, plotL, plotW, labelW) {
    const nb = Math.max(16, Math.min(60, Math.round(plotW / 10)));
    const bw = (d1 - d0) / nb;
    const bins = new Array(nb).fill(0);
    for (const p of plotted) bins[Math.min(nb - 1, Math.max(0, Math.floor((p.mid - d0) / bw)))]++;
    const maxB = Math.max(...bins);
    hist.replaceChildren();
    hist.style.height = HIST_H + 'px';
    const med = median(plotted.map(p => p.mid));
    if (labelW > 0) {
      const cap = el('div', 'ms-hist__cap');
      cap.style.width = labelW + 'px';
      cap.append(el('span', 'ms-hist__title', 'Median '), el('span', 'ms-hist__sub', formatMoney(med)));
      hist.append(cap);
    }
    const pxW = plotW / nb;
    bins.forEach((n, i) => {
      if (!n) return;
      const b = el('div', 'ms-hist__bin');
      const h = Math.max(2, Math.round((n / maxB) * (HIST_H - 6)));
      b.style.left = (plotL + i * pxW + (pxW > 4 ? 1 : 0)) + 'px';
      b.style.width = Math.max(1, pxW - (pxW > 4 ? 2 : 0)) + 'px';
      b.style.height = h + 'px';
      b.dataset.n = n;
      b.dataset.a = d0 + i * bw;
      b.dataset.b = d0 + (i + 1) * bw;
      hist.append(b);
    });
    const ml = el('div', 'ms-hist__median');
    ml.style.left = x(med) + 'px';
    hist.append(ml);
  }

  function renderAxis(ticks, x, approx, labelW, narrow) {
    axis.replaceChildren();
    if (labelW > 0) {
      const cap = el('div', 'ms-axis__cap', narrow ? (approx ? 'Approx USD / yr' : 'USD / yr') : (approx ? 'Annual salary · approx USD' : 'Annual salary · USD'));
      cap.style.width = labelW + 'px';
      axis.append(cap);
    }
    const minGap = 52;
    let lastX = -Infinity;
    ticks.forEach(t => {
      const px = x(t);
      if (px - lastX < minGap) return;
      lastX = px;
      const tk = el('div', 'ms-axis__tick', formatMoney(t));
      tk.style.left = px + 'px';
      axis.append(tk);
    });
  }

  function renderGridlines(ticks, x, frag) {
    for (const t of ticks) {
      const gl = el('div', 'ms-chart__gridline');
      gl.style.left = x(t) + 'px';
      frag.prepend(gl);
    }
  }

  // ======================= clusters view =======================
  function renderClusters(stats, narrow) {
    const labelW = narrow ? 0 : Math.round(Math.max(150, Math.min(260, width * 0.26)));
    const plotL = narrow ? 16 : labelW + 16;
    const padR = narrow ? 16 : 32;
    const plotW = Math.max(80, width - plotL - padR);
    const mids = plotted.map(p => p.mid);
    const lo = Math.min(...mids), hi = Math.max(...mids);
    const span = Math.max(1, hi - lo);
    const step = span > 1500000 ? 250000 : span > 300000 ? 100000 : 50000;
    const d0 = Math.max(0, Math.floor(lo / step) * step);
    let d1 = Math.ceil((hi + 1) / step) * step;
    if (d1 <= d0) d1 = d0 + step;
    const x = v => plotL + ((v - d0) / (d1 - d0)) * plotW;
    const ticks = [];
    for (let t = d0; t <= d1 + 1; t += step) ticks.push(t);
    container.style.setProperty('--ms-plot-l', plotL + 'px');
    container.style.setProperty('--ms-label-w', labelW + 'px');
    renderHist(x, d0, d1, plotL, plotW, labelW);
    renderAxis(ticks, x, stats.fxCount > 0, labelW, narrow);

    // Rows
    const dim = opts.groupBy;
    const m = new Map();
    const rowOf = k => { if (!m.has(k)) m.set(k, { key: k, name: k, all: [], items: [] }); return m.get(k); };
    for (const job of jobs) rowOf(dim === 'none' ? ALL_ROLES : keyOf(job, dim)).all.push(job);
    for (const p of plotted) rowOf(dim === 'none' ? ALL_ROLES : keyOf(p.job, dim)).items.push(p);
    cRows = [...m.values()];
    // A lone row ("All roles", or a single group) gets more height and bigger circles.
    const solo = cRows.length === 1;
    // Bin width: the smallest standard step that leaves room for a readable circle.
    const pxPer = plotW / (d1 - d0);
    const minBinPx = solo ? 46 : MIN_BIN_PX;
    const binW = BIN_STEPS.find(b => b * pxPer >= minBinPx) || BIN_STEPS[BIN_STEPS.length - 1];
    const binPx = binW * pxPer;
    for (const r of cRows) {
      const s = r.items.map(p => p.mid).sort((a, b) => a - b);
      r.median = quantile(s, 0.5); r.p25 = quantile(s, 0.25); r.p75 = quantile(s, 0.75);
      const bm = new Map();
      for (const p of r.items) {
        const start = Math.floor(p.mid / binW) * binW;
        if (!bm.has(start)) bm.set(start, []);
        bm.get(start).push(p);
      }
      r.bins = [...bm].sort((a, b) => a[0] - b[0]).map(([start, items]) => ({ start, end: start + binW, items, row: r }));
    }
    cRows.sort((a, b) => (b.items.length ? 1 : 0) - (a.items.length ? 1 : 0)
      || (b.median ?? 0) - (a.median ?? 0) || b.all.length - a.all.length);

    // Color: the row's category color (identity is named by the row label).
    if (dim === 'none') {
      for (const r of cRows) r.color = slotColor(0);
    } else {
      const byCount = cRows.slice().sort((a, b) => b.all.length - a.all.length || a.key.localeCompare(b.key)).map(r => r.key);
      const top = new Set(byCount.length > SLOT_COUNT ? byCount.slice(0, SLOT_COUNT - 1) : byCount);
      assignColors([...top]);
      for (const r of cRows) { r.other = !top.has(r.key); r.color = r.other ? (isDark() ? '#8d8c86' : otherColor()) : colorFor(r.key); }
    }
    for (const r of cRows) r.ink = inkOn(r.color);

    const plotH = narrow ? (solo ? 72 : CROW_PLOT_H) : (solo ? 92 : CROW_H);
    const rowH = narrow ? CROW_LABEL_H + plotH : plotH;
    const rMax = Math.max(6, Math.min(binPx / 2 - 1.5, plotH / 2 - 9, solo ? 30 : 16));
    const rMin = Math.min(4.5, rMax);

    const maxN = Math.max(1, ...cRows.flatMap(r => r.bins.map(b => b.items.length)));
    const frag = document.createDocumentFragment();
    const gridFrag = document.createDocumentFragment();
    cRows.forEach((r, ri) => {
      const row = el('div', r.other ? 'ms-crow ms-crow--other' : 'ms-crow');
      row.setAttribute('role', 'group');
      const sub = r.items.length
        ? `${plural(r.all.length, 'role')} · median ${formatMoney(r.median)}`
        : `${plural(r.all.length, 'role')} · no published salary`;
      row.setAttribute('aria-label', `${r.name}, ${sub.replace(' · ', ', ')}`);
      row.style.height = rowH + 'px';
      row.style.setProperty('--c', r.color);
      row.style.setProperty('--c-ink', r.ink);
      r.el = row;

      const lab = el('div', 'ms-crow__label');
      lab.setAttribute('role', 'option');
      lab.setAttribute('aria-selected', 'false');
      lab.setAttribute('aria-label', `${r.name}: all ${plural(r.all.length, 'role')}${r.items.length ? `, median ${formatMoney(r.median)}` : ', no published salary'}`);
      lab.id = `${uid}-${ri}-L`;
      lab.dataset.r = ri; lab.dataset.i = -1;
      if (!narrow) lab.style.width = labelW + 'px';
      const sw = el('span', 'ms-crow__swatch');
      const txt = el('span', 'ms-crow__text');
      txt.append(el('span', 'ms-crow__name', r.name), el('span', 'ms-crow__sub', sub));
      lab.append(sw, txt);
      lab.title = `Show all ${plural(r.all.length, 'role')} in ${r.name}`;
      r.labelEl = lab;
      row.append(lab);

      const plot = el('div', 'ms-crow__plot');
      plot.setAttribute('role', 'none');
      plot.style.top = (narrow ? CROW_LABEL_H : 0) + 'px';
      plot.style.height = plotH + 'px';
      let bandL = null, bandR = null;
      if (r.items.length) {
        const bandH = Math.round(Math.min(2 * rMax + 8, plotH - 10));
        const bx0 = x(r.p25), bx1 = x(r.p75);
        const band = el('div', 'ms-crow__band');
        band.setAttribute('aria-hidden', 'true');
        const bw = Math.max(bandH, bx1 - bx0 + bandH * 0.6);
        bandL = (bx0 + bx1) / 2 - bw / 2; bandR = bandL + bw;
        band.style.left = bandL + 'px';
        band.style.width = bw + 'px';
        band.style.height = bandH + 'px';
        band.style.marginTop = (-bandH / 2) + 'px';
        plot.append(band);
        const med = el('div', 'ms-crow__median');
        med.setAttribute('aria-hidden', 'true');
        med.style.left = x(r.median) + 'px';
        med.style.height = (bandH + 10) + 'px';
        med.style.marginTop = (-(bandH + 10) / 2) + 'px';
        plot.append(med);
      } else {
        const none = el('div', 'ms-crow__none', 'No published salaries');
        none.style.left = plotL + 'px';
        plot.append(none);
      }
      r.bins.forEach((b, bi) => {
        const n = b.items.length;
        const rad = Math.max(rMin, rMax * Math.sqrt(n / maxN));
        const cx = x((b.start + b.end) / 2);
        const hit = Math.max(24, Math.min(binPx, 2 * rad + 6));
        const bin = el('div', bandL != null && cx >= bandL && cx <= bandR ? 'ms-bin ms-bin--inband' : 'ms-bin');
        bin.setAttribute('role', 'option');
        bin.setAttribute('aria-selected', 'false');
        const approx = b.items.some(p => isForeign(p.cur) && hasFx(p.cur));
        bin.setAttribute('aria-label', `${plural(n, 'role')}, ${formatMoney(b.start)} to ${formatMoney(b.end)}${approx ? ' approx USD' : ''}, ${r.name}`);
        bin.id = `${uid}-${ri}-${bi}`;
        bin.dataset.r = ri; bin.dataset.i = bi;
        bin.style.left = (cx - hit / 2) + 'px';
        bin.style.width = hit + 'px';
        bin.style.height = Math.max(hit, 2 * rad + 6) + 'px';
        const dot = el('span', 'ms-bin__dot');
        dot.style.width = dot.style.height = (2 * rad) + 'px';
        if (n >= 2 && rad >= 8) {
          dot.textContent = n > 999 ? '999+' : String(n);
          if (rad < 11) dot.classList.add('ms-bin__dot--sm');
        }
        bin.append(dot);
        plot.append(bin);
        b.el = bin;
        for (const p of b.items) binByJob.set(p.job.id, b);
        if (selectedKey === cKeyOf(ri, bi)) bin.classList.add('is-selected');
      });
      if (selectedKey === cKeyOf(ri, -1)) row.classList.add('is-selected');
      row.append(plot);
      frag.append(row);
    });
    renderGridlines(ticks, x, gridFrag);
    grid.replaceChildren(gridFrag);
    rowsEl.replaceChildren(frag);
    body.style.height = (cRows.length * rowH + 8) + 'px';
  }

  function cKeyOf(r, i) {
    const row = cRows[r];
    if (!row) return null;
    return i < 0 ? `${row.key}\u0000*` : (row.bins[i] ? `${row.key}\u0000${row.bins[i].start}` : null);
  }
  function cFindKey(key) {
    for (let r = 0; r < cRows.length; r++) {
      if (cKeyOf(r, -1) === key) return { r, i: -1 };
      for (let i = 0; i < cRows[r].bins.length; i++) if (cKeyOf(r, i) === key) return { r, i };
    }
    return null;
  }
  const cEl = (r, i) => (i < 0 ? cRows[r]?.labelEl : cRows[r]?.bins[i]?.el) || null;

  function clusterLabel(r, i) {
    const row = cRows[r];
    if (i < 0) return row.name;
    const b = row.bins[i];
    return `${row.name} · ${moneyRange(b.start, b.end)}`;
  }

  function activateCluster(r, i) {
    const row = cRows[r];
    if (!row) return;
    rowsEl.querySelectorAll('.is-selected').forEach(n => n.classList.remove('is-selected'));
    selectedKey = cKeyOf(r, i);
    const list = i < 0 ? row.all : row.bins[i].items.map(p => p.job);
    if (i < 0) row.el.classList.add('is-selected'); else row.bins[i].el.classList.add('is-selected');
    onClusterSelect?.(list, clusterLabel(r, i));
    if (list.length === 1) onSelect?.(list[0]);
  }

  function showClusterTip(b) {
    const n = b.items.length;
    tip.replaceChildren();
    tip.append(el('div', 'ms-tip__value', plural(n, 'role')));
    const approx = b.items.some(p => isForeign(p.cur) && hasFx(p.cur));
    tip.append(el('div', 'ms-tip__sub', `${moneyRange(b.start, b.end)} midpoint${approx ? ' · approx USD' : ''}`));
    tip.append(el('div', 'ms-tip__title', b.row.name));
    const counts = new Map();
    for (const p of b.items) { const t = p.job.title || 'Untitled'; counts.set(t, (counts.get(t) || 0) + 1); }
    const top = [...counts].sort((a, c) => c[1] - a[1] || a[0].localeCompare(c[0]));
    const list = el('ul', 'ms-tip__roles');
    for (const [t, k] of top.slice(0, 4)) {
      const li = el('li');
      li.append(el('span', 'ms-tip__role', t), el('span', 'ms-tip__n', k > 1 ? `×${k}` : ''));
      list.append(li);
    }
    tip.append(list);
    if (top.length > 4) tip.append(el('div', 'ms-tip__meta', `+${top.length - 4} more titles`));
    tip.hidden = false;
  }

  function setCHover(binEl, evt) {
    if (binEl === cHover) { if (binEl && evt) placeTip(evt.clientX, evt.clientY); return; }
    cHover?.classList.remove('is-hover');
    cHover = binEl;
    if (!binEl) { hideTip(); onHover?.(null); return; }
    binEl.classList.add('is-hover');
    const b = cRows[+binEl.dataset.r].bins[+binEl.dataset.i];
    showClusterTip(b);
    if (evt) placeTip(evt.clientX, evt.clientY);
    else { const bb = binEl.getBoundingClientRect(); placeTip(bb.right - 6, bb.bottom - 6); }
    if (b.items.length === 1) onHover?.(b.items[0].job);
  }

  function setCActive(r, i, announce = true) {
    const prev = rowsEl.querySelector('.is-active');
    prev?.classList.remove('is-active');
    prev?.setAttribute('aria-selected', 'false');
    const e = cEl(r, i);
    if (!e) { cActive = null; body.removeAttribute('aria-activedescendant'); return; }
    cActive = { r, i };
    e.classList.add('is-active');
    e.setAttribute('aria-selected', 'true');
    body.setAttribute('aria-activedescendant', e.id);
    if (announce) {
      scrollToRow(cRows[r].el);
      if (i >= 0) setCHover(e); else setCHover(null);
    }
  }

  function onClusterKey(e) {
    if (!cRows.length) return;
    const cur = cActive || { r: 0, i: -2 };
    const row = cRows[cur.r];
    let { r, i } = cur;
    const k = e.key;
    if (k === 'ArrowRight') i = cur.i === -2 ? -1 : Math.min(row.bins.length - 1, cur.i + 1);
    else if (k === 'ArrowLeft') i = Math.max(-1, cur.i - 1);
    else if (k === 'Home') i = -1;
    else if (k === 'End') i = row.bins.length - 1;
    else if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'PageDown' || k === 'PageUp') {
      const d = (k === 'ArrowDown' ? 1 : k === 'ArrowUp' ? -1 : k === 'PageDown' ? 5 : -5);
      if (cur.i === -2) { r = 0; i = -1; } else {
        r = Math.max(0, Math.min(cRows.length - 1, cur.r + d));
        if (cur.i < 0 || !cRows[r].bins.length) i = -1;
        else {
          // nearest circle by salary in the target row
          const at = (row.bins[cur.i].start + row.bins[cur.i].end) / 2;
          let best = 0, bd = Infinity;
          cRows[r].bins.forEach((b, bi) => { const dd = Math.abs((b.start + b.end) / 2 - at); if (dd < bd) { bd = dd; best = bi; } });
          i = best;
        }
      }
    } else if ((k === 'Enter' || k === ' ') && cActive) {
      e.preventDefault();
      activateCluster(cActive.r, cActive.i);
      return;
    } else if (k === 'Escape') { setCHover(null); return; }
    else return;
    e.preventDefault();
    if (i === -2) i = -1;
    setCActive(r, i);
  }

  // ======================= ranges view =======================
  function colorKeys() {
    if (opts.colorBy === 'none') return { top: [], counts: new Map(), ordered: [] };
    const counts = new Map();
    for (const p of plotted) counts.set(p.key, (counts.get(p.key) || 0) + 1);
    const ordered = [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a) || String(a).localeCompare(String(b)));
    // A 9th+ key folds into Other only when there are more than 8 keys.
    const top = ordered.length > SLOT_COUNT ? ordered.slice(0, SLOT_COUNT - 1) : ordered;
    assignColors(top);
    return { top, counts, ordered };
  }

  function groups() {
    if (opts.groupBy === 'none') return [{ name: null, items: plotted.slice().sort((a, b) => b.mid - a.mid) }];
    const m = new Map();
    for (const p of plotted) {
      const k = keyOf(p.job, opts.groupBy);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(p);
    }
    const out = [...m].map(([name, items]) => ({
      name, items: items.sort((a, b) => b.mid - a.mid), median: median(items.map(i => i.mid)),
    }));
    if (opts.groupBy === 'seniority') {
      const rank = n => { const i = SENIORITY_ORDER.indexOf(n); return i < 0 ? 99 : i; };
      out.sort((a, b) => rank(a.name) - rank(b.name) || b.median - a.median);
    } else {
      out.sort((a, b) => b.median - a.median || b.items.length - a.items.length);
    }
    return out;
  }

  function renderRanges(stats, narrow) {
    const { top, counts, ordered } = colorKeys();
    const topSet = new Set(top);
    const colorOf = p => opts.colorBy === 'none' ? null : (topSet.has(p.key) ? colorFor(p.key) : otherColor());
    renderLegend(top, counts, ordered);
    head.hidden = legend.hidden;

    const labelW = Math.round(Math.max(narrow ? 92 : 140, Math.min(300, width * 0.3)));
    const padR = narrow ? 16 : 28;
    const plotL = labelW + 12;
    const plotW = Math.max(80, width - plotL - padR);
    const lo = Math.min(...plotted.map(p => p.lo));
    const hi = Math.max(...plotted.map(p => p.hi));
    const nt = niceTicks(lo, hi, Math.max(2, Math.floor(plotW / 90)));
    const d0 = nt.start, d1 = nt.end > nt.start ? nt.end : nt.start + 1;
    const x = v => plotL + ((v - d0) / (d1 - d0)) * plotW;
    container.style.setProperty('--ms-plot-l', plotL + 'px');
    container.style.setProperty('--ms-label-w', labelW + 'px');

    renderHist(x, d0, d1, plotL, plotW, labelW);
    renderAxis(nt.ticks, x, stats.fxCount > 0, labelW, narrow);

    const frag = document.createDocumentFragment();
    const gridFrag = document.createDocumentFragment();
    let y = 0;
    let idx = 0;
    for (const g of groups()) {
      let parent = frag;
      if (g.name != null) {
        const wrap = el('div', 'ms-chart__grp');
        wrap.setAttribute('role', 'group');
        wrap.setAttribute('aria-label', `${g.name}, ${plural(g.items.length, 'posting')}, median ${formatMoney(g.median)}`);
        frag.append(wrap);
        parent = wrap;
        const h = el('div', 'ms-group');
        h.setAttribute('aria-hidden', 'true');
        h.style.height = HEAD_H + 'px';
        const name = el('div', 'ms-group__name');
        name.style.width = labelW + 'px';
        name.append(el('span', 'ms-group__title', g.name), el('span', 'ms-group__count', g.items.length.toLocaleString()));
        name.title = `${g.name} · ${plural(g.items.length, 'posting')}`;
        h.append(name);
        const mx = x(g.median);
        const ml = el('div', 'ms-group__median', `median ${formatMoney(g.median)}`);
        ml.style.left = mx + 'px';
        if (mx > width - 110) ml.classList.add('ms-group__median--left');
        h.append(ml);
        wrap.append(h);
        y += HEAD_H;
        const line = el('div', 'ms-chart__median');
        line.style.left = mx + 'px';
        line.style.top = (y - 6) + 'px';
        line.style.height = (g.items.length * ROW_H + 6) + 'px';
        gridFrag.append(line);
      }
      for (const p of g.items) {
        const r = el('div', 'ms-row');
        r.style.height = ROW_H + 'px';
        r.dataset.idx = idx;
        r.setAttribute('role', 'option');
        r.setAttribute('aria-selected', 'false');
        r.setAttribute('aria-label', optionName(p));
        r.id = `${uid}-${idx}`;
        const lab = el('div', 'ms-row__label', p.job.title || 'Untitled');
        lab.style.width = labelW + 'px';
        const bx0 = x(p.lo), bx1 = x(p.hi);
        const bar = el('div', 'ms-row__bar');
        bar.style.left = bx0 + 'px';
        bar.style.width = Math.max(0, bx1 - bx0) + 'px';
        const dot = el('div', 'ms-row__dot');
        dot.style.left = x(p.mid) + 'px';
        const c = colorOf(p);
        if (c) { bar.style.background = c; dot.style.background = c; }
        const val = el('div', 'ms-row__val', rangeText(p));
        if (bx1 + 120 < width) { val.style.left = (bx1 + 10) + 'px'; }
        else { val.style.right = (width - bx0 + 10) + 'px'; val.classList.add('ms-row__val--left'); }
        r.append(lab, bar, dot, val);
        parent.append(r);
        itemByRow[idx] = p;
        rowByJob.set(p.job.id, r);
        idx++;
        y += ROW_H;
      }
    }
    renderGridlines(nt.ticks, x, gridFrag);
    grid.replaceChildren(gridFrag);
    rowsEl.replaceChildren(frag);
    body.style.height = (y + 8) + 'px';
  }

  function optionName(p) {
    const approx = isForeign(p.cur) && hasFx(p.cur);
    const range = Math.round(p.lo / 1000) === Math.round(p.hi / 1000)
      ? formatMoney(p.lo) : `${formatMoney(p.lo)} to ${formatMoney(p.hi)}`;
    const where = [p.job.department, primaryLocation(p.job)].filter(Boolean).join(', ');
    return `${p.job.title || 'Untitled'}, ${range}${approx ? ' approx USD' : ''}${where ? ', ' + where : ''}`;
  }

  function rangeText(p) {
    const pre = isForeign(p.cur) && hasFx(p.cur) ? '≈' : '';
    if (Math.round(p.lo / 1000) === Math.round(p.hi / 1000)) return pre + formatMoney(p.lo);
    return pre + moneyRange(p.lo, p.hi);
  }

  function renderLegend(top, counts, ordered) {
    legend.replaceChildren();
    legend.hidden = opts.colorBy === 'none';
    if (legend.hidden) return;
    legend.append(el('span', 'ms-legend__title', `By ${DIM_LABEL[opts.colorBy] || opts.colorBy}`));
    const add = (key, n, color) => {
      const item = el('span', 'ms-legend__item');
      const sw = el('span', 'ms-legend__swatch');
      sw.style.background = color;
      item.append(sw, el('span', 'ms-legend__key', key), el('span', 'ms-legend__n', n.toLocaleString()));
      item.title = `${key}: ${plural(n, 'posting')}`;
      legend.append(item);
    };
    for (const k of top) add(k, counts.get(k), colorFor(k));
    const rest = ordered.slice(top.length);
    if (rest.length) add(`${OTHER_KEY} (${rest.length})`, rest.reduce((s, k) => s + counts.get(k), 0), otherColor());
  }

  function setHover(i, evt) {
    if (i === hoverIdx) { if (i >= 0 && evt) placeTip(evt.clientX, evt.clientY); return; }
    if (hoverIdx >= 0) rowsEl.querySelector(`.ms-row[data-idx="${hoverIdx}"]`)?.classList.remove('is-hover');
    hoverIdx = i;
    if (i < 0) { hideTip(); onHover?.(null); return; }
    const r = rowsEl.querySelector(`.ms-row[data-idx="${i}"]`);
    r?.classList.add('is-hover');
    showJobTip(itemByRow[i]);
    if (evt) placeTip(evt.clientX, evt.clientY);
    else if (r) { const b = r.getBoundingClientRect(); placeTip(b.left + parseFloat(container.style.getPropertyValue('--ms-plot-l')), b.bottom); }
    onHover?.(itemByRow[i].job);
  }

  function showJobTip(p) {
    const j = p.job, s = j.salary;
    tip.replaceChildren();
    const cur = (s.currency || 'USD').toUpperCase();
    const native = s.min === s.max || s.max == null || s.min == null
      ? formatCurrency(s.min ?? s.max, cur)
      : `${formatCurrency(s.min, cur)} – ${formatCurrency(s.max, cur)}`;
    tip.append(el('div', 'ms-tip__value', native + (cur !== 'USD' ? ` ${cur}` : '')));
    if (isForeign(cur) && hasFx(cur)) tip.append(el('div', 'ms-tip__sub', `≈ ${formatMoney(p.lo)} – ${formatMoney(p.hi)} USD (approx)`));
    const orig = s.originalInterval || (s.interval && s.interval !== 'year' ? s.interval : null);
    if (orig && orig !== 'year') tip.append(el('div', 'ms-tip__sub', `Annualized from ${INTERVAL_ADJ[orig] || orig} pay`));
    tip.append(el('div', 'ms-tip__title', j.title || 'Untitled'));
    const meta = [j.department, locationText(j)].filter(Boolean).join(' · ');
    if (meta) tip.append(el('div', 'ms-tip__meta', meta));
    const meta2 = [j.seniority, j.employmentType].filter(Boolean).join(' · ');
    if (meta2) tip.append(el('div', 'ms-tip__meta', meta2));
    tip.hidden = false;
  }

  function setActive(i, announce = true) {
    const prev = rowsEl.querySelector('.ms-row.is-active');
    prev?.classList.remove('is-active');
    prev?.setAttribute('aria-selected', 'false');
    activeIdx = i;
    const r = rowsEl.querySelector(`.ms-row[data-idx="${i}"]`);
    if (!r) { activeIdx = -1; body.removeAttribute('aria-activedescendant'); return; }
    r.classList.add('is-active');
    r.setAttribute('aria-selected', 'true');
    body.setAttribute('aria-activedescendant', r.id);
    if (announce) { scrollToRow(r); setHover(i); }
  }

  function onRangesKey(e) {
    const n = itemByRow.length;
    if (!n) return;
    const page = Math.max(1, Math.floor((scroll.clientHeight - sticky.offsetHeight) / ROW_H) - 1);
    const step = { ArrowDown: 1, ArrowUp: -1, PageDown: page, PageUp: -page }[e.key];
    if (step != null) {
      e.preventDefault();
      setActive(activeIdx < 0 ? 0 : Math.max(0, Math.min(n - 1, activeIdx + step)));
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      setActive(e.key === 'Home' ? 0 : n - 1);
    } else if ((e.key === 'Enter' || e.key === ' ') && activeIdx >= 0) {
      e.preventDefault();
      onSelect?.(itemByRow[activeIdx].job);
    } else if (e.key === 'Escape') { setHover(-1); }
  }

  // ---------- shared interaction ----------
  function showBinTip(b) {
    tip.replaceChildren(
      el('div', 'ms-tip__value', plural(+b.dataset.n, 'posting')),
      el('div', 'ms-tip__meta', `midpoint ${moneyRange(+b.dataset.a, +b.dataset.b)}`),
    );
    tip.hidden = false;
  }

  function placeTip(cx, cy) {
    const pad = 14;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let left = cx + pad, top = cy + pad;
    if (left + tw > innerWidth - 8) left = cx - tw - pad;
    if (top + th > innerHeight - 8) top = cy - th - pad;
    tip.style.transform = `translate(${Math.max(8, left)}px, ${Math.max(8, top)}px)`;
  }

  function hideTip() { tip.hidden = true; }

  const onMove = e => {
    if (opts.view === 'clusters') { setCHover(e.target.closest?.('.ms-bin') || null, e); return; }
    const r = e.target.closest?.('.ms-row');
    setHover(r ? +r.dataset.idx : -1, e);
  };
  const onLeave = () => { if (opts.view === 'clusters') setCHover(null); else setHover(-1); };
  const onClick = e => {
    if (opts.view === 'clusters') {
      const t = e.target.closest?.('.ms-bin, .ms-crow__label');
      if (!t) return;
      const r = +t.dataset.r, i = +t.dataset.i;
      setCActive(r, i, false);
      activateCluster(r, i);
      return;
    }
    const r = e.target.closest?.('.ms-row');
    if (!r) return;
    const p = itemByRow[+r.dataset.idx];
    if (p) { setActive(+r.dataset.idx, false); onSelect?.(p.job); }
  };
  const onHistMove = e => {
    const b = e.target.closest?.('.ms-hist__bin');
    hist.querySelectorAll('.ms-hist__bin.is-hover').forEach(n => n !== b && n.classList.remove('is-hover'));
    if (!b) { hideTip(); return; }
    b.classList.add('is-hover');
    showBinTip(b);
    placeTip(e.clientX, e.clientY);
  };
  const onHistLeave = () => { hist.querySelectorAll('.is-hover').forEach(n => n.classList.remove('is-hover')); hideTip(); };
  const onKey = e => (opts.view === 'clusters' ? onClusterKey(e) : onRangesKey(e));

  rowsEl.addEventListener('pointermove', onMove);
  rowsEl.addEventListener('pointerleave', onLeave);
  rowsEl.addEventListener('click', onClick);
  hist.addEventListener('pointermove', onHistMove);
  hist.addEventListener('pointerleave', onHistLeave);
  body.addEventListener('keydown', onKey);
  body.addEventListener('blur', onLeave);
  scroll.addEventListener('scroll', () => { if (!tip.hidden) hideTip(); }, { passive: true });

  function scrollToRow(r, smooth = false) {
    const behavior = smooth && !prefersReducedMotion() ? 'smooth' : 'auto';
    const stickyH = sticky.offsetHeight;
    if (container.classList.contains('ms-chart--flow')) {
      const b = r.getBoundingClientRect();
      if (b.top < stickyH + 8 || b.bottom > innerHeight - 8) r.scrollIntoView({ block: 'center', behavior });
      return;
    }
    const h = r.offsetHeight || ROW_H;
    const top = r.offsetTop + body.offsetTop;
    const viewTop = scroll.scrollTop + stickyH;
    const viewBot = scroll.scrollTop + scroll.clientHeight;
    if (top < viewTop + 4 || top + h > viewBot - 4) {
      scroll.scrollTo({ top: top - stickyH - (scroll.clientHeight - stickyH) / 2 + h / 2, behavior });
    }
  }

  function applyHighlight(id, scrollIt) {
    rowsEl.querySelectorAll('.is-highlighted').forEach(n => n.classList.remove('is-highlighted'));
    if (id == null) return;
    if (opts.view === 'clusters') {
      const b = binByJob.get(id);
      if (!b) return;
      b.el.classList.add('is-highlighted');
      if (scrollIt) scrollToRow(b.row.el, true);
      return;
    }
    const r = rowByJob.get(id);
    if (!r) return;
    r.classList.add('is-highlighted');
    if (scrollIt) scrollToRow(r, true);
  }

  // ---------- lifecycle ----------
  const schedule = () => { if (!raf) raf = requestAnimationFrame(render); };
  let lastW = 0;
  const ro = new ResizeObserver(() => {
    const w = scroll.clientWidth || container.clientWidth;
    if (Math.abs(w - lastW) >= 1) { lastW = w; schedule(); }
  });
  ro.observe(container);
  const offTheme = onThemeChange(schedule);

  return {
    /**
     * @param {object[]} nextJobs
     * @param {{view?: 'clusters'|'ranges', groupBy?: 'none'|'department'|'location'|'seniority',
     *          colorBy?: 'none'|'department'|'location'|'seniority'}} o
     *   view defaults to "clusters". groupBy defaults to "department" in clusters and
     *   "none" in ranges. colorBy applies to the ranges view only; in clusters the
     *   row's category color is named by the row label.
     */
    update(nextJobs, o = {}) {
      jobs = Array.isArray(nextJobs) ? nextJobs : [];
      const view = VIEWS.includes(o.view) ? o.view : DEFAULT_VIEW;
      if (view !== opts.view) { selectedKey = null; activeIdx = -1; cActive = null; }
      opts = {
        view,
        groupBy: o.groupBy || (view === 'clusters' ? 'department' : 'none'),
        colorBy: o.colorBy || 'none',
      };
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      render();
    },
    highlight(jobId) {
      highlighted = jobId ?? null;
      applyHighlight(highlighted, highlighted != null);
    },
    /** Clear the selected cluster/row state (visual only; no callback). */
    clearSelection() {
      selectedKey = null;
      rowsEl.querySelectorAll('.is-selected').forEach(n => n.classList.remove('is-selected'));
    },
    get view() { return opts.view; },
    destroy() {
      ro.disconnect();
      offTheme();
      if (raf) cancelAnimationFrame(raf);
      tip.remove();
      container.replaceChildren();
      container.classList.remove('ms-chart', 'ms-chart--flow', 'ms-chart--narrow', 'ms-chart--clusters', 'ms-chart--ranges');
    },
  };
}
