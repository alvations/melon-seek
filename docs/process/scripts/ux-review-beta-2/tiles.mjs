// The Market insights stat tiles at 1440: is "$188K–$252K" cut?
import { launch, openPage, SHOTS, sleep } from './lib.mjs';
const b = await launch();
for (const [slug, site] of [['apple', 'beta'], ['anduril', '']]) {
  const { ctx, page } = await openPage(b, 'd1440', 'light', `/${site ? site + '/' : ''}#c=${slug}&m=insights`);
  await sleep(2500);
  const t = page.locator('.msi-stat').nth(1);
  await t.scrollIntoViewIfNeeded();
  const info = await t.evaluate((e) => { const v = e.querySelector('.msi-stat__value'); const cs = getComputedStyle(v); return { text: v.textContent, sw: v.scrollWidth, cw: v.clientWidth, ov: cs.overflow, to: cs.textOverflow, ws: cs.whiteSpace }; });
  console.log(slug, JSON.stringify(info));
  const box = await page.locator('.msi-stat').first().boundingBox();
  await page.screenshot({ path: `${SHOTS}/insights-tiles-${slug}-d1440-light.png`, clip: { x: box.x - 10, y: box.y - 10, width: 760, height: box.height + 20 } });
  await ctx.close();
}
await b.close();
