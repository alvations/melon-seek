// States: loading (delayed list), error (aborted list), empty search, the badge popover, the beta tag, a Pay unclear role.
import { launch, VP, BASE, SHOTS, sleep, ready } from './lib.mjs';
const b = await launch();
const vps = (process.argv[2] || 'd1440,p390').split(',');
const read = (page) => page.evaluate(() => {
  const q = (s) => [...document.querySelectorAll(s)].filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean);
  return { title: document.title, results: q('#resultsTitle'), stats: q('#statsLine'), badge: q('#dataBadge .badge-label'), overlay: q('#vizOverlay .state-card'), list: q('#resultsList .state-card'), chartNotes: q('#chartHost .ms-chart__foot'), filters: q('#filterBody').map((t) => t.slice(0, 160)), toast: q('#toast') };
});
for (const vp of vps) {
  const mk = async () => { const ctx = await b.newContext({ ...VP[vp], colorScheme: 'light' }); await ctx.route((u) => !u.href.startsWith(BASE.replace('/melon-seek', '')) && !u.href.startsWith('data:') && !u.href.startsWith('blob:'), (r) => r.abort('blockedbyclient')); return ctx; };
  // loading: hold the board's list for 6 s
  {
    const ctx = await mk();
    await ctx.route(/\/api\/jobs\/apple\.json/, async (r) => { await sleep(6000); await r.continue(); });
    const page = await ctx.newPage();
    page.goto(`${BASE}/beta/#c=apple`).catch(() => {});
    await sleep(2500);
    console.log(vp, 'LOADING', JSON.stringify(await read(page)));
    await page.screenshot({ path: `${SHOTS}/state-loading-${vp}-light.png` });
    await ctx.close();
  }
  // error: abort the board's list
  {
    const ctx = await mk();
    await ctx.route(/\/api\/jobs\/apple\.json/, (r) => r.abort('failed'));
    const page = await ctx.newPage();
    await page.goto(`${BASE}/beta/#c=apple`).catch(() => {});
    await sleep(4000);
    console.log(vp, 'ERROR', JSON.stringify(await read(page)));
    await page.screenshot({ path: `${SHOTS}/state-error-${vp}-light.png` });
    await ctx.close();
  }
  // empty search, and a filter combination with no result
  {
    const ctx = await mk();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/beta/#c=meta&q=zzqxnomatch`); await ready(page); await sleep(500);
    console.log(vp, 'EMPTY', JSON.stringify(await read(page)));
    await page.screenshot({ path: `${SHOTS}/state-empty-${vp}-light.png` });
    await page.goto('about:blank'); await page.goto(`${BASE}/beta/#c=netflix&smin=900000`); await ready(page); await sleep(500);
    console.log(vp, 'EMPTY-PAY', JSON.stringify(await read(page)));
    await page.screenshot({ path: `${SHOTS}/state-empty-pay-${vp}-light.png` });
    // badge popover
    await page.goto('about:blank'); await page.goto(`${BASE}/beta/#c=amazon`); await ready(page); await sleep(500);
    await page.locator('#dataBadge').click(); await sleep(500);
    console.log(vp, 'BADGE', JSON.stringify(await page.evaluate(() => { const p = document.querySelector('#popover'); return p && !p.hidden ? p.innerText.replace(/\s+/g, ' ') : null; })));
    await page.screenshot({ path: `${SHOTS}/state-badge-${vp}-light.png` });
    await page.keyboard.press('Escape');
    // beta tag
    const tag = await page.evaluate(() => { const t = document.querySelector('.beta-tag'); if (!t) return null; const r = t.getBoundingClientRect(); return { text: t.innerText, href: t.getAttribute('href'), title: t.title, aria: t.getAttribute('aria-label'), w: Math.round(r.width), h: Math.round(r.height) }; });
    console.log(vp, 'BETA TAG', JSON.stringify(tag));
    await ctx.close();
  }
}
await b.close();
