// melon-seek one-line notes (fix-density, docs/process/fix-density.md).
//
// The user (2026-10-11): the chart's notes line read "564 postings with salary · row medians: pay in the US (55
// paid elsewhere left out) · 46 on-target earnings, not in the medians · …", four lines on a phone. The rule
// now, for every secondary line around the main views (the chart's notes, the stats line, the map's legend
// notes, the Insights and Pay estimate captions, the drawer's pay block, the empty states):
//
//   - the line shows at most one line, on a phone and on a desktop, with the one or two facts a job seeker
//     needs at a glance ("564 with pay · 81 without");
//   - every other caveat (left-out counts, on-target earnings, the exchange-rate date, …) is kept, in plain
//     words, in a short list behind one small "Details" text button (aria-expanded, aria-controls), the same
//     pattern everywhere.
//
// renderNote(host, { line, details, label, key, cls }) fills `host` (its class gets "ms-note"):
//   line     string | Node | array of them: the one visible line (none: the button stands alone);
//   details  array of items (string | Node | array of them; empty items are dropped): the list;
//   label    the button's words (default "Details");
//   key      remembers the open state across re-renders (a filter change re-renders the chart's notes);
//   cls      extra classes for host;
//   about    the id of what the button details (a card's heading); with a line, the button is described by both.
// A-9 (docs/REVIEW.md): every button is named "Details" and described (aria-describedby) by its line, or by
// `about`, so a screen reader's button list can tell them apart. Its arrow is CSS with empty alternative text.
// It returns host, and keeps keyboard focus on the button when a re-render replaces it.
// noteLine(opts) is the same on a new <div> (or opts.tag).
//
// Plain DOM calls only (createElement, setAttribute, appendChild, replaceChildren, addEventListener), so the
// widgets' fake-DOM unit tests (test/features.test.js) can build it too.

const open = new Set();
let seq = 0;

const empty = (x) => x == null || x === false || x === '' || (Array.isArray(x) && !x.some((y) => !empty(y)));

function put(parent, x) {
  if (empty(x)) return;
  if (Array.isArray(x)) { for (const y of x) put(parent, y); return; }
  parent.appendChild(typeof x === 'object' ? x : document.createTextNode(String(x)));
}
function make(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

export function renderNote(host, { line = null, details = [], label = 'Details', key = null, cls = '', about = null } = {}) {
  const active = typeof document !== 'undefined' ? document.activeElement : null;
  const hadFocus = !!(active && host.contains?.(active) && active.className === 'ms-note__more');
  const base = String(host.className || '').split(/\s+/).filter((c) => c && c !== 'ms-note' && c !== 'is-open');
  const classes = [...new Set([...base, 'ms-note', ...String(cls).split(/\s+/).filter(Boolean)])];
  const items = (details || []).filter((d) => !empty(d));
  const parts = [];
  if (items.length || !empty(line)) host.dataset.noteId ||= `ms-note-${++seq}`;
  const lineId = `${host.dataset.noteId}-line`;
  if (!empty(line)) { const text = make('span', 'ms-note__line'); text.id = lineId; put(text, line); parts.push(text); }
  let isOpen = false;
  if (items.length) {
    const listId = `${host.dataset.noteId}-list`;
    isOpen = key != null && open.has(key);
    const btn = make('button', 'ms-note__more');
    btn.setAttribute('type', 'button');
    btn.textContent = label;
    btn.setAttribute('aria-expanded', String(isOpen));
    btn.setAttribute('aria-controls', listId);
    const desc = [about, empty(line) ? null : lineId].filter(Boolean).join(' ');
    if (desc) btn.setAttribute('aria-describedby', desc);
    const list = make('ul', 'ms-note__list');
    list.id = listId;
    list.hidden = !isOpen;
    for (const it of items) { const li = make('li'); put(li, it); list.appendChild(li); }
    btn.addEventListener('click', (e) => {
      e.stopPropagation?.();
      const now = list.hidden;
      list.hidden = !now;
      btn.setAttribute('aria-expanded', String(now));
      host.classList?.toggle('is-open', now);
      if (key != null) { if (now) open.add(key); else open.delete(key); }
    });
    parts.push(btn, list);
  }
  host.className = [...classes, ...(isOpen ? ['is-open'] : [])].join(' ');
  host.replaceChildren(...parts);
  if (hadFocus) host.querySelector?.('.ms-note__more')?.focus({ preventScroll: true });
  return host;
}

export function noteLine({ tag = 'div', ...opts } = {}) {
  return renderNote(document.createElement(tag), opts);
}

/**
 * fix-phone-text (fitLine): show the first of `variants` that fits on one line, else the last one, wrapping (never cut).
 * Every variant says the same thing; a shorter one leaves a fact to its line's Details. `el` is a block that clips
 * (an ellipsis is drawn at any overflow, so the fit is measured to the sub-pixel) or an inline span inside a line
 * that wraps (then a second line box is what doesn't fit). Re-fits when its line's width changes.
 */
export function fitLine(el, variants) {
  const list = variants.filter(Boolean);
  if (!list.length) return el;
  const boxOf = () => { let b = el; while (b.parentElement && getComputedStyle(b).display === 'inline') b = b.parentElement; return b; };
  const over = () => {
    const r = document.createRange();
    r.selectNodeContents(el);
    const mids = [];
    for (const x of r.getClientRects()) { if (x.width < 0.5) continue; const m = x.top + x.height / 2; if (!mids.some((t) => Math.abs(t - m) < 6)) mids.push(m); }
    if (mids.length > 1) return true;
    const box = boxOf(), cs = getComputedStyle(box), b = box.getBoundingClientRect(), t = r.getBoundingClientRect();
    return t.right > b.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight) + 0.01
      || t.left < b.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft) - 0.01;
  };
  // The text is replaced only to try a variant, so a line that already fits is never touched.
  const fit = () => {
    for (const v of list) {
      if (el.textContent !== v) el.textContent = v;
      if (!over()) { el.classList.remove('is-wrapped'); return; }
    }
    el.classList.add('is-wrapped');
  };
  el.textContent = list[0];
  if (typeof ResizeObserver !== 'function') return el;
  let w = -1, watched = null;
  const ro = new ResizeObserver(() => {
    if (!el.isConnected) { ro.disconnect(); return; }
    const box = boxOf();
    if (box !== watched) { watched = box; if (box !== el) ro.observe(box); }
    const now = box.getBoundingClientRect().width;
    if (Math.abs(now - w) < 0.5) return;
    w = now;
    fit();
  });
  ro.observe(el);
  return el;
}
