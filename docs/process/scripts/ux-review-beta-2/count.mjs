// Simplicity budget: visible controls on first load, per area and viewport; beta (Google, Amazon) vs main (Anduril).
import { launch, openPage } from './lib.mjs';
const b = await launch();
const areas = { topbar: '.topbar', quickbar: '.quickbar', viz: '#vizToolbar', results: '#results > header, #results .results-head, #results .results-header' };
for (const vp of ['d1440', 'd1280', 'd1024', 't768', 'p390']) {
  for (const [label, url] of [['google', '/beta/#c=google'], ['amazon', '/beta/#c=amazon'], ['anduril(main)', '/#c=anduril']]) {
    const { ctx, page } = await openPage(b, vp, 'light', url);
    const r = await page.evaluate((areas) => {
      const out = {};
      const vis = (e) => { const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false; const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || +cs.opacity < 0.05) return false; if (e.closest('[hidden]')) return false; return r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight; };
      for (const [k, sel] of Object.entries(areas)) {
        const root = document.querySelector(sel);
        if (!root) { out[k] = null; continue; }
        const ctrls = [...root.querySelectorAll('button, a[href], select, input:not([type=hidden]), [role=button], [tabindex="0"]')].filter(vis).filter((e) => !e.closest('.sr-only'));
        out[k] = { n: ctrls.length, names: ctrls.map((e) => (e.getAttribute('aria-label') || e.innerText || e.value || e.placeholder || e.id || e.tagName).trim().replace(/\s+/g, ' ').slice(0, 22)) };
      }
      return out;
    }, areas);
    console.log(vp, label, Object.entries(r).map(([k, v]) => `${k}=${v ? v.n : '-'}`).join(' '), '|', Object.entries(r).map(([k, v]) => v ? `${k}: ${v.names.join(', ')}` : '').join(' || ').slice(0, 600));
    await ctx.close();
  }
}
await b.close();
