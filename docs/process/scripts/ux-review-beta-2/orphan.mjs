// UX-44: the stats line when no role in view has pay. Find a filter with 0 paid roles, then read the line.
import { launch, openPage, SHOTS, sleep, BASE, ready } from './lib.mjs';
const b = await launch();
for (const vp of ['d1440', 'p390']) {
  const { ctx, page } = await openPage(b, vp, 'light', '/beta/#c=google&m=map');
  await sleep(1500);
  await page.locator('#mapHost .ms-pin').first().click({ force: true }).catch(() => {});
  await sleep(1000);
  const s = await page.evaluate(() => ({ hash: location.hash, stats: document.querySelector('#statsLine')?.innerText.replace(/\s+/g, ' '), line: document.querySelector('#statsLine .ms-note__line')?.innerText, results: document.querySelector('#resultsTitle')?.innerText }));
  console.log(vp, JSON.stringify(s));
  await page.screenshot({ path: `${SHOTS}/orphan-details-map-${vp}-light.png` });
  // same filter in Chart mode
  await page.goto('about:blank'); await page.goto(`${BASE}/beta/${s.hash.replace('m=map', 'm=chart')}`); await ready(page); await sleep(800);
  const c = await page.evaluate(() => ({ hash: location.hash, stats: document.querySelector('#statsLine')?.innerText.replace(/\s+/g, ' '), notes: document.querySelector('#chartHost .ms-chart__foot')?.innerText.replace(/\s+/g, ' ') }));
  console.log(vp, 'chart', JSON.stringify(c));
  await page.screenshot({ path: `${SHOTS}/orphan-details-chart-${vp}-light.png` });
  await ctx.close();
}
await b.close();
