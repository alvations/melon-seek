// In-page probe for the iOS Simulator job (test/e2e/webkit/ios-sim-menu.mjs). The driver's server adds it to
// /melon-seek/beta/index.html only; it is never part of a build. It reports to the driver with same-origin fetches:
//   - every touchstart's client point (the driver calibrates screen points to CSS px with one tap);
//   - after each touch ends, the company menu's geometry (as test/e2e/beta-mobile-qa-2.e2e.js menuGeom measures it);
//   - it runs the driver's commands ("open-menu", "close-menu", "reset") polled from /qa-cmd.
(function () {
  const post = (kind, data) => fetch('/qa-log', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind, data, t: Date.now() }) }).catch(() => {});
  const geom = () => {
    const pop = document.querySelector('#popover');
    if (!pop || pop.hidden) return { open: false };
    const body = pop.querySelector('.pop-body'), list = pop.querySelector('.company-list');
    if (!list) return { open: true, list: null };
    const items = [...list.querySelectorAll('.company-item')];
    const last = items[items.length - 1];
    const vv = window.visualViewport;
    const edge = vv ? vv.height + vv.offsetTop : innerHeight;
    const seen = (e) => {
      const r = e.getBoundingClientRect(), lr = list.getBoundingClientRect(), br = body.getBoundingClientRect();
      const top = Math.max(r.top, lr.top, br.top, vv ? vv.offsetTop : 0), bottom = Math.min(r.bottom, lr.bottom, br.bottom, edge);
      return Math.max(0, bottom - top) / r.height;
    };
    const R = (e) => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; };
    return {
      open: true, pop: R(pop), body: R(body), list: R(list), search: R(pop.querySelector('input.fsearch')),
      vv: vv ? [Math.round(vv.offsetTop), Math.round(vv.height)] : null, inner: [innerWidth, innerHeight], page: [scrollX, scrollY],
      bodyScroll: [Math.round(body.scrollTop), body.scrollHeight - body.clientHeight],
      listScroll: [Math.round(list.scrollTop), list.scrollHeight - list.clientHeight],
      last: last && last.querySelector('.company-item-name').textContent, lastSeen: last ? Math.round(seen(last) * 100) / 100 : 0,
      fullRows: items.filter((i) => seen(i) > 0.99).map((i) => i.querySelector('.company-item-name').textContent),
      focus: document.activeElement && (document.activeElement.className || document.activeElement.tagName),
      kbOpen: document.body.classList.contains('kb-open'),
    };
  };
  addEventListener('touchstart', (e) => { const t = e.touches[0]; post('touch', { x: t.clientX, y: t.clientY }); }, { passive: true, capture: true });
  addEventListener('touchend', () => setTimeout(() => post('geom', geom()), 900), { passive: true, capture: true });
  const ready = setInterval(() => {
    if (document.querySelector('#resultsList .card[data-id]')) { clearInterval(ready); const b = document.querySelector('#companyMenuBtn').getBoundingClientRect(); post('ready', { btn: [b.left, b.top, b.right, b.bottom].map(Math.round), ua: navigator.userAgent, inner: [innerWidth, innerHeight], dpr: devicePixelRatio, screen: [screen.width, screen.height] }); }
  }, 300);
  let seq = 0;
  setInterval(async () => {
    try {
      const r = await fetch(`/qa-cmd?after=${seq}`);
      const cmd = await r.json();
      if (!cmd || !cmd.id) return;
      seq = cmd.id;
      if (cmd.name === 'open-menu') { if (document.querySelector('#popover').hidden) document.querySelector('#companyMenuBtn').click(); }
      if (cmd.name === 'close-menu') { const x = document.querySelector('#popover .pop-head .icon-btn'); if (x) x.click(); }
      if (cmd.name === 'blur') document.activeElement && document.activeElement.blur();
      setTimeout(() => post('geom', geom()), 900);
    } catch { /* driver gone */ }
  }, 400);
})();
