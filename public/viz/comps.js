// melon-seek market comps chart: "Same role elsewhere" (ROADMAP §7.1 F1).
//
// createCompsChart(container, { onSelect(slug) })
//   -> { update(rows, { current?, sort? }), destroy() }
//
// rows: [{ slug, name, color, n, p25, median, p75, current? }] in approx USD/yr.
// One compact 28px row per company: a P25–P75 range bar with a median tick on a
// shared salary axis, styled like the chart's "ranges" view, plus the median as
// text on the right. The current company (`current` option or `row.current`)
// is emphasized. Keyboard: the chart is a listbox (arrows, Home/End, Enter).
// Rows are sorted by median (high first) unless `sort: false`.

import { colorFor, formatMoney, niceTicks, onThemeChange } from './palette.js';
import { robustBounds } from './chart.js';

const ROW_H = 28;
const ROW_H_TOUCH = 44; // phones: every row is a 44px tap target (docs/QA.md M-8)
const rowHeight = () => (globalThis.matchMedia?.('(max-width: 860px)').matches ? ROW_H_TOUCH : ROW_H);
const AXIS_H = 20;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
const plural = (n, one, many = one + 's') => `${Number(n).toLocaleString()} ${n === 1 ? one : many}`;
const ok = v => v != null && Number.isFinite(+v);

export function createCompsChart(container, { onSelect } = {}) {
  container.classList.add('ms-comps');
  container.replaceChildren();
  const axis = el('div', 'ms-comps__axis');
  axis.setAttribute('aria-hidden', 'true');
  const list = el('div', 'ms-comps__list');
  list.tabIndex = 0;
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', 'Same role at other companies: median and middle 50% of posted pay. Arrow keys move, Enter opens');
  const grid = el('div', 'ms-comps__grid');
  grid.setAttribute('aria-hidden', 'true');
  const note = el('div', 'ms-comps__note', 'Posted base pay, approx USD/yr · bar = middle 50%, tick = median');
  container.append(axis, list, note);
  const tip = el('div', 'ms-viz-tip');
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  document.body.append(tip);

  const uid = 'ms-comps-' + Math.random().toString(36).slice(2, 8);
  let rows = [];
  let opts = {};
  let items = [];       // rendered rows (sorted), with .el
  let active = -1;
  let hover = -1;
  let raf = 0;

  function render() {
    raf = 0;
    const activeSlug = items[active]?.slug ?? null;
    active = -1; hover = -1;
    list.removeAttribute('aria-activedescendant');
    tip.hidden = true;
    const current = opts.current ?? rows.find(r => r.current)?.slug ?? null;
    items = rows.map(r => ({ ...r, current: r.slug === current || !!r.current }));
    const has = r => ok(r.median) && r.n > 0;
    if (opts.sort !== false) items.sort((a, b) => (has(b) - has(a)) || (b.median ?? 0) - (a.median ?? 0));

    const width = container.clientWidth || 360;
    const rowH = rowHeight();
    container.style.setProperty('--ms-comps-row', rowH + 'px');
    const narrow = width < 420;
    container.classList.toggle('ms-comps--narrow', narrow);
    const labelW = Math.round(Math.max(88, Math.min(180, width * (narrow ? 0.34 : 0.32))));
    const valW = narrow ? 46 : 52;
    const plotL = labelW + 8, plotW = Math.max(60, width - plotL - valW - 8);
    const vals = items.filter(has).flatMap(r => [r.p25 ?? r.median, r.p75 ?? r.median, r.median].map(Number));
    list.replaceChildren(grid);
    axis.replaceChildren();
    container.classList.toggle('ms-comps--empty', !vals.length);
    if (!vals.length) {
      list.append(el('div', 'ms-comps__empty', rows.length ? 'No posted ranges to compare yet' : 'No comparable roles found'));
      list.style.height = '';
      return;
    }
    // Robust domain (same rule as the main chart), padded and snapped to nice ticks.
    const [lo, hi] = robustBounds(vals);
    const pad = Math.max((hi - lo) * 0.06, 5000);
    const nt = niceTicks(Math.max(0, lo - pad), hi + pad, Math.max(4, Math.min(6, Math.floor(plotW / 60))));
    const d0 = Math.max(0, nt.start), d1 = nt.end > d0 ? nt.end : d0 + 1;
    const x = v => plotL + ((Math.min(d1, Math.max(d0, v)) - d0) / (d1 - d0)) * plotW;

    let lastX = -Infinity;
    for (const t of nt.ticks) {
      if (t < d0 || t > d1) continue;
      if (x(t) - lastX >= 42) { // skip labels that would collide; gridlines stay
        const tk = el('div', 'ms-comps__tick', formatMoney(t));
        tk.style.left = x(t) + 'px';
        axis.append(tk);
        lastX = x(t);
      }
      const gl = el('div', 'ms-comps__gridline');
      gl.style.left = x(t) + 'px';
      grid.append(gl);
    }

    items.forEach((r, i) => {
      const row = el('div', 'ms-comps__row' + (r.current ? ' is-current' : ''));
      row.style.height = rowH + 'px';
      row.id = `${uid}-${i}`;
      row.dataset.i = i;
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', 'false');
      const color = r.color || colorFor(r.slug || r.name);
      row.style.setProperty('--c', color);
      const name = el('div', 'ms-comps__name');
      name.style.width = labelW + 'px';
      name.append(el('span', 'ms-comps__sw'), el('span', 'ms-comps__label', r.name || r.slug));
      if (r.n > 0) name.append(el('span', 'ms-comps__n', String(r.n)));
      row.append(name);
      if (has(r)) {
        const a = x(r.p25 ?? r.median), b = x(r.p75 ?? r.median);
        const bar = el('div', 'ms-comps__bar');
        bar.style.left = a + 'px';
        bar.style.width = Math.max(4, b - a) + 'px';
        if (b - a < 4) bar.style.left = (a - 2) + 'px';
        const tick = el('div', 'ms-comps__median');
        tick.style.left = x(r.median) + 'px';
        row.append(bar, tick);
        if ((r.p75 ?? r.median) > d1) { const o = el('div', 'ms-comps__over', '›'); o.style.left = (x(d1) + 3) + 'px'; row.append(o); }
        const v = el('div', 'ms-comps__val', formatMoney(r.median));
        v.style.width = valW + 'px';
        row.append(v);
        row.setAttribute('aria-label', `${r.name || r.slug}${r.current ? ' (this company)' : ''}: median ${formatMoney(r.median)}, middle 50% ${formatMoney(r.p25 ?? r.median)} to ${formatMoney(r.p75 ?? r.median)}, ${plural(r.n, 'posting')}`);
      } else {
        const v = el('div', 'ms-comps__nodata', 'no posted range');
        v.style.left = plotL + 'px';
        row.append(v);
        row.setAttribute('aria-label', `${r.name || r.slug}${r.current ? ' (this company)' : ''}: no posted range`);
      }
      r.el = row;
      list.append(row);
    });
    list.style.height = (items.length * rowH) + 'px';
    if (activeSlug != null) { const i = items.findIndex(r => r.slug === activeSlug); if (i >= 0) setActive(i, false); }
  }

  function showTip(i, cx, cy) {
    const r = items[i];
    if (!r) { tip.hidden = true; return; }
    tip.replaceChildren();
    if (ok(r.median) && r.n > 0) {
      tip.append(el('div', 'ms-tip__value', `${formatMoney(r.median)} median`));
      tip.append(el('div', 'ms-tip__sub', `middle 50%: ${formatMoney(r.p25 ?? r.median)}–${formatMoney(r.p75 ?? r.median)} · approx USD`));
    } else {
      tip.append(el('div', 'ms-tip__value', 'No posted range'));
    }
    tip.append(el('div', 'ms-tip__title', (r.name || r.slug) + (r.current ? ' · this company' : '')));
    if (r.n > 0) tip.append(el('div', 'ms-tip__meta', plural(r.n, 'posting')));
    if (onSelect && !r.current) tip.append(el('div', 'ms-tip__meta', 'Click to see these roles'));
    tip.hidden = false;
    const pad = 14, tw = tip.offsetWidth, th = tip.offsetHeight;
    let left = cx + pad, top = cy + pad;
    if (left + tw > innerWidth - 8) left = cx - tw - pad;
    if (top + th > innerHeight - 8) top = cy - th - pad;
    tip.style.transform = `translate(${Math.max(8, left)}px, ${Math.max(8, top)}px)`;
  }

  function setHover(i, e) {
    if (hover >= 0 && hover !== i) items[hover]?.el?.classList.remove('is-hover');
    hover = i;
    if (i < 0) { tip.hidden = true; return; }
    items[i]?.el?.classList.add('is-hover');
    if (e) showTip(i, e.clientX, e.clientY);
    else { const b = items[i].el.getBoundingClientRect(); showTip(i, b.left + b.width / 2, b.bottom); }
  }

  function setActive(i, announce = true) {
    const prev = items[active]?.el;
    prev?.classList.remove('is-active');
    prev?.setAttribute('aria-selected', 'false');
    active = i;
    const r = items[i]?.el;
    if (!r) { active = -1; list.removeAttribute('aria-activedescendant'); return; }
    r.classList.add('is-active');
    r.setAttribute('aria-selected', 'true');
    list.setAttribute('aria-activedescendant', r.id);
    if (announce) { r.scrollIntoView?.({ block: 'nearest' }); setHover(i); }
  }

  const select = i => { const r = items[i]; if (r) onSelect?.(r.slug); };
  list.addEventListener('pointermove', e => { const r = e.target.closest?.('.ms-comps__row'); setHover(r ? +r.dataset.i : -1, e); });
  list.addEventListener('pointerleave', () => setHover(-1));
  list.addEventListener('click', e => { const r = e.target.closest?.('.ms-comps__row'); if (r) { setActive(+r.dataset.i, false); select(+r.dataset.i); } });
  list.addEventListener('blur', () => setHover(-1));
  list.addEventListener('keydown', e => {
    const n = items.length;
    if (!n) return;
    const k = e.key;
    let i = null;
    if (k === 'ArrowDown') i = active < 0 ? 0 : Math.min(n - 1, active + 1);
    else if (k === 'ArrowUp') i = active < 0 ? 0 : Math.max(0, active - 1);
    else if (k === 'Home') i = 0;
    else if (k === 'End') i = n - 1;
    else if ((k === 'Enter' || k === ' ') && active >= 0) { e.preventDefault(); select(active); return; }
    else if (k === 'Escape') {
      // D-8: the first Esc clears the list's own state (tooltip, active row) and is consumed; with
      // nothing left to clear it bubbles, so the drawer around the list closes.
      if (hover < 0 && active < 0) return;
      e.preventDefault();
      setHover(-1); setActive(-1);
      return;
    }
    if (i == null) return;
    e.preventDefault();
    setActive(i);
  });

  const schedule = () => { if (!raf) raf = requestAnimationFrame(render); };
  let lastW = 0;
  const ro = new ResizeObserver(() => { const w = container.clientWidth; if (Math.abs(w - lastW) >= 1) { lastW = w; schedule(); } });
  ro.observe(container);
  const offTheme = onThemeChange(schedule);

  return {
    /** rows: [{ slug, name, color, n, p25, median, p75, current? }]; options: { current: slug, sort: true }. */
    update(next, o = {}) {
      rows = Array.isArray(next) ? next.filter(Boolean) : [];
      opts = o || {};
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      render();
    },
    destroy() {
      ro.disconnect();
      offTheme();
      if (raf) cancelAnimationFrame(raf);
      tip.remove();
      container.replaceChildren();
      container.classList.remove('ms-comps', 'ms-comps--empty');
    },
  };
}
