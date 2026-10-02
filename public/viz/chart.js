// melon-seek salary landscape chart.
//
// createChart(container, { onSelect(job), onHover(job|null) })
//   -> { update(jobs, { groupBy, colorBy }), highlight(jobId|null), destroy() }
//
// Each job with a salary is a horizontal min–max range bar with a midpoint dot
// on an annual-salary x axis (approx USD for non-USD postings), sorted by
// midpoint (high -> low), optionally grouped into labelled bands with a group
// median marker. A midpoint distribution strip and the x axis stay sticky on
// top while the rows scroll. Plain DOM (no SVG per row); hover never re-renders.

import {
  colorFor, assignColors, otherColor, OTHER_KEY, SLOT_COUNT, formatMoney, formatCurrency,
  toUSD, isForeign, hasFx, niceTicks, median, onThemeChange, prefersReducedMotion,
} from './palette.js';

const ROW_H = 22;
const HEAD_H = 30;
const HIST_H = 44;
const SENIORITY_ORDER = ['Director+', 'Manager', 'Staff+', 'Senior', 'Mid', 'Entry', 'Intern'];

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

export function createChart(container, { onSelect, onHover } = {}) {
  container.classList.add('ms-chart');
  container.replaceChildren();

  const head = el('div', 'ms-chart__head');
  const legend = el('div', 'ms-chart__legend');
  legend.setAttribute('role', 'group');
  legend.setAttribute('aria-label', 'Legend');
  const notes = el('div', 'ms-chart__notes');
  head.append(legend, notes);

  const scroll = el('div', 'ms-chart__scroll');
  const sticky = el('div', 'ms-chart__sticky');
  const hist = el('div', 'ms-chart__hist');
  const axis = el('div', 'ms-chart__axis');
  sticky.append(hist, axis);
  const body = el('div', 'ms-chart__body');
  body.tabIndex = 0;
  body.setAttribute('role', 'listbox');
  body.setAttribute('aria-label', 'Salary ranges, use arrow keys to move and Enter to open');
  const grid = el('div', 'ms-chart__grid');
  const rowsEl = el('div', 'ms-chart__rows');
  grid.setAttribute('aria-hidden', 'true');
  rowsEl.setAttribute('role', 'none');
  body.append(grid, rowsEl);
  scroll.append(sticky, body);

  const empty = el('div', 'ms-chart__empty');
  empty.hidden = true;
  container.append(head, scroll, empty);

  const tip = el('div', 'ms-viz-tip');
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  document.body.append(tip);

  const uid = 'ms-row-' + Math.random().toString(36).slice(2, 8);
  let jobs = [];
  let opts = { groupBy: 'none', colorBy: 'none' };
  let plotted = [];          // [{ job, lo, hi, mid, key }]
  let rowByJob = new Map();  // jobId -> row element
  let itemByRow = [];        // row index -> plotted item
  let highlighted = null;
  let hoverIdx = -1;
  let activeIdx = -1;
  let width = 0;
  let raf = 0;

  // ---------- data prep ----------
  function prepare() {
    plotted = [];
    let noSalary = 0, fxCount = 0, unknownFx = new Set();
    for (const job of jobs) {
      const s = job.salary;
      if (!s || (s.min == null && s.max == null)) { noSalary++; continue; }
      const cur = (s.currency || 'USD').toUpperCase();
      const min = s.min ?? s.max, max = s.max ?? s.min;
      if (isForeign(cur)) { if (hasFx(cur)) fxCount++; else unknownFx.add(cur); }
      const lo = toUSD(Math.min(min, max), cur), hi = toUSD(Math.max(min, max), cur);
      const mid = s.mid != null ? toUSD(s.mid, cur) : (lo + hi) / 2;
      if (!isFinite(lo) || !isFinite(hi)) { noSalary++; continue; }
      plotted.push({ job, lo, hi, mid, cur, key: keyOf(job, opts.colorBy) });
    }
    return { noSalary, fxCount, unknownFx: [...unknownFx] };
  }

  function colorKeys() {
    if (opts.colorBy === 'none') return { top: [], counts: new Map() };
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

  // ---------- render ----------
  function render() {
    raf = 0;
    width = scroll.clientWidth || container.clientWidth || 800;
    const { noSalary, fxCount, unknownFx } = prepare();
    const { top, counts, ordered } = colorKeys();
    const topSet = new Set(top);
    const colorOf = p => opts.colorBy === 'none' ? null : (topSet.has(p.key) ? colorFor(p.key) : otherColor());

    renderLegend(top, counts, ordered);
    renderNotes(noSalary, fxCount, unknownFx);

    // Keep the keyboard-active row on the same job across re-renders (filters, resize);
    // never let a stale index point at a different job.
    const activeJobId = itemByRow[activeIdx]?.job.id ?? null;
    activeIdx = -1;
    body.removeAttribute('aria-activedescendant');
    rowByJob = new Map();
    itemByRow = [];
    hoverIdx = -1;
    hideTip();

    if (!plotted.length) {
      scroll.hidden = true;
      empty.hidden = false;
      empty.replaceChildren(
        el('div', 'ms-chart__empty-title', jobs.length ? 'No published salaries' : 'No postings to plot'),
        el('div', 'ms-chart__empty-sub', jobs.length
          ? `${plural(jobs.length, 'posting')} match, but none list a salary range.`
          : 'Try widening the filters.'),
      );
      return;
    }
    scroll.hidden = false;
    empty.hidden = true;

    // Layout
    const narrow = width < 520;
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
    container.classList.toggle('ms-chart--narrow', narrow);

    renderHist(x, d0, d1, plotL, plotW, labelW);
    renderAxis(nt.ticks, x, fxCount > 0, labelW, narrow);

    // Rows
    const frag = document.createDocumentFragment();
    const gridFrag = document.createDocumentFragment();
    const gs = groups();
    let y = 0;
    let idx = 0;
    let gi = 0;
    for (const g of gs) {
      let parent = frag;
      if (g.name != null) {
        const wrap = el('div', 'ms-chart__grp');
        wrap.setAttribute('role', 'group');
        wrap.setAttribute('aria-label', `${g.name}, ${plural(g.items.length, 'posting')}, median ${formatMoney(g.median)}`);
        frag.append(wrap);
        parent = wrap;
        gi++;
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
    // Gridlines
    for (const t of nt.ticks) {
      const gl = el('div', 'ms-chart__gridline');
      gl.style.left = x(t) + 'px';
      gridFrag.prepend(gl);
    }
    grid.replaceChildren(gridFrag);
    rowsEl.replaceChildren(frag);
    body.style.height = (y + 8) + 'px';

    // Scroll mode: scroll internally only when the container constrains height;
    // otherwise flow with the page so the sticky header sticks to the viewport.
    container.classList.remove('ms-chart--flow');
    if (scroll.scrollHeight <= scroll.clientHeight + 1) container.classList.add('ms-chart--flow');

    if (highlighted) applyHighlight(highlighted, false);
    if (activeJobId != null) {
      const i = itemByRow.findIndex(p => p.job.id === activeJobId);
      if (i >= 0) setActive(i, false);
    }
  }

  function optionName(p) {
    const approx = isForeign(p.cur) && hasFx(p.cur);
    const range = Math.round(p.lo / 1000) === Math.round(p.hi / 1000)
      ? formatMoney(p.lo) : `${formatMoney(p.lo)} to ${formatMoney(p.hi)}`;
    const where = [p.job.department, primaryLocation(p.job)].filter(Boolean).join(', ');
    return `${p.job.title || 'Untitled'}, ${range}${approx ? ' approx USD' : ''}${where ? ', ' + where : ''}`;
  }

  function rangeText(p) {
    if (Math.round(p.lo / 1000) === Math.round(p.hi / 1000)) return (isForeign(p.cur) && hasFx(p.cur) ? '≈' : '') + formatMoney(p.lo);
    return (isForeign(p.cur) && hasFx(p.cur) ? '≈' : '') + `${formatMoney(p.lo)}–${formatMoney(p.hi)}`;
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

  function renderNotes(noSalary, fxCount, unknownFx) {
    notes.replaceChildren();
    const parts = [];
    parts.push(el('span', 'ms-note ms-note--strong', plural(plotted.length, 'posting') + ' with salary'));
    if (noSalary) parts.push(el('span', 'ms-note', `${plural(noSalary, 'posting')} without published salary`));
    if (fxCount) {
      const n = el('span', 'ms-note', `${fxCount.toLocaleString()} non-USD shown as approx USD`);
      n.title = 'Converted with a static exchange-rate table (GBP, EUR, CAD, AUD, JPY, SGD, CHF). Approximate.';
      parts.push(n);
    }
    if (unknownFx.length) parts.push(el('span', 'ms-note', `${unknownFx.join(', ')} plotted unconverted`));
    parts.forEach((p, i) => { if (i) notes.append(el('span', 'ms-note__sep', '·')); notes.append(p); });
  }

  function renderHist(x, d0, d1, plotL, plotW, labelW) {
    const nb = Math.max(16, Math.min(60, Math.round(plotW / 10)));
    const bw = (d1 - d0) / nb;
    const bins = new Array(nb).fill(0);
    for (const p of plotted) bins[Math.min(nb - 1, Math.max(0, Math.floor((p.mid - d0) / bw)))]++;
    const maxB = Math.max(...bins);
    hist.replaceChildren();
    hist.style.height = HIST_H + 'px';
    const cap = el('div', 'ms-hist__cap');
    cap.style.width = labelW + 'px';
    cap.append(el('div', 'ms-hist__title', 'Midpoint distribution'),
      el('div', 'ms-hist__sub', `median ${formatMoney(median(plotted.map(p => p.mid)))}`));
    hist.append(cap);
    const pxW = plotW / nb;
    bins.forEach((n, i) => {
      if (!n) return;
      const b = el('div', 'ms-hist__bin');
      const h = Math.max(2, Math.round((n / maxB) * (HIST_H - 8)));
      b.style.left = (plotL + i * pxW + (pxW > 4 ? 1 : 0)) + 'px';
      b.style.width = Math.max(1, pxW - (pxW > 4 ? 2 : 0)) + 'px';
      b.style.height = h + 'px';
      b.dataset.n = n;
      b.dataset.a = d0 + i * bw;
      b.dataset.b = d0 + (i + 1) * bw;
      hist.append(b);
    });
    const med = median(plotted.map(p => p.mid));
    const ml = el('div', 'ms-hist__median');
    ml.style.left = x(med) + 'px';
    hist.append(ml);
  }

  function renderAxis(ticks, x, approx, labelW, narrow) {
    axis.replaceChildren();
    const cap = el('div', 'ms-axis__cap', narrow ? (approx ? 'Approx USD / yr' : 'USD / yr') : (approx ? 'Annual salary · approx USD' : 'Annual salary · USD'));
    cap.style.width = labelW + 'px';
    axis.append(cap);
    const minGap = 44;
    let lastX = -Infinity;
    ticks.forEach((t, i) => {
      const px = x(t);
      if (px - lastX < minGap && i !== ticks.length - 1) return;
      lastX = px;
      const tk = el('div', 'ms-axis__tick', formatMoney(t));
      tk.style.left = px + 'px';
      axis.append(tk);
    });
  }

  // ---------- interaction ----------
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
    const v = el('div', 'ms-tip__value', native + (cur !== 'USD' ? ` ${cur}` : ''));
    tip.append(v);
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

  function showBinTip(b) {
    tip.replaceChildren(
      el('div', 'ms-tip__value', plural(+b.dataset.n, 'posting')),
      el('div', 'ms-tip__meta', `midpoint ${formatMoney(+b.dataset.a)} – ${formatMoney(+b.dataset.b)}`),
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
    const r = e.target.closest?.('.ms-row');
    setHover(r ? +r.dataset.idx : -1, e);
  };
  const onLeave = () => setHover(-1);
  const onClick = e => {
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

  const onKey = e => {
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
  };

  rowsEl.addEventListener('pointermove', onMove);
  rowsEl.addEventListener('pointerleave', onLeave);
  rowsEl.addEventListener('click', onClick);
  hist.addEventListener('pointermove', onHistMove);
  hist.addEventListener('pointerleave', onHistLeave);
  body.addEventListener('keydown', onKey);
  body.addEventListener('blur', () => setHover(-1));
  scroll.addEventListener('scroll', () => { if (!tip.hidden) hideTip(); }, { passive: true });

  function scrollToRow(r, smooth = false) {
    const behavior = smooth && !prefersReducedMotion() ? 'smooth' : 'auto';
    const stickyH = sticky.offsetHeight;
    if (container.classList.contains('ms-chart--flow')) {
      const b = r.getBoundingClientRect();
      if (b.top < stickyH + 8 || b.bottom > innerHeight - 8) r.scrollIntoView({ block: 'center', behavior });
      return;
    }
    const top = r.offsetTop + body.offsetTop;
    const viewTop = scroll.scrollTop + stickyH;
    const viewBot = scroll.scrollTop + scroll.clientHeight;
    if (top < viewTop + 4 || top + ROW_H > viewBot - 4) {
      scroll.scrollTo({ top: top - stickyH - (scroll.clientHeight - stickyH) / 2 + ROW_H / 2, behavior });
    }
  }

  function applyHighlight(id, scrollIt) {
    rowsEl.querySelector('.ms-row.is-highlighted')?.classList.remove('is-highlighted');
    const r = id != null ? rowByJob.get(id) : null;
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
    update(nextJobs, o = {}) {
      jobs = Array.isArray(nextJobs) ? nextJobs : [];
      opts = { groupBy: o.groupBy || 'none', colorBy: o.colorBy || 'none' };
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      render();
    },
    highlight(jobId) {
      highlighted = jobId ?? null;
      if (highlighted == null) rowsEl.querySelector('.ms-row.is-highlighted')?.classList.remove('is-highlighted');
      else applyHighlight(highlighted, true);
    },
    destroy() {
      ro.disconnect();
      offTheme();
      if (raf) cancelAnimationFrame(raf);
      tip.remove();
      container.replaceChildren();
      container.classList.remove('ms-chart', 'ms-chart--flow', 'ms-chart--narrow');
    },
  };
}
