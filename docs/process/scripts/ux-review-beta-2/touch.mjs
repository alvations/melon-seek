// Touch: what a tap shows on a phone, and whether a floating tip goes away on a tap elsewhere or a scroll.
import { launch, openPage, SHOTS, sleep } from './lib.mjs';
const b = await launch();
const slug = process.argv[2] || 'google';
const theme = 'light';
const tipState = (page) => page.evaluate(() => [...document.querySelectorAll('.ms-tip, [role=tooltip], .tooltip, .ms-insights__tip, .msi-tip')].filter((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && +cs.opacity > 0.05 && !e.hidden; }).map((e) => ({ cls: e.className, text: e.innerText.replace(/\s+/g, ' ').slice(0, 160), box: [Math.round(e.getBoundingClientRect().left), Math.round(e.getBoundingClientRect().top), Math.round(e.getBoundingClientRect().width), Math.round(e.getBoundingClientRect().height)] })));
const report = async (page, label) => { const t = await tipState(page); console.log(label, JSON.stringify(t)); return t; };
const tapAt = async (page, sel, label, n = 0) => {
  const loc = page.locator(sel).nth(n);
  if (!(await loc.count())) { console.log(label, 'NOT FOUND', sel); return false; }
  await loc.scrollIntoViewIfNeeded().catch(() => {});
  await loc.tap({ timeout: 5000 }).catch((e) => console.log(label, 'tap failed', e.message.slice(0, 80)));
  await sleep(500);
  return true;
};
// 1. Chart circle
{
  const { ctx, page } = await openPage(b, 'p390', theme, `/beta/#c=${slug}`);
  await tapAt(page, '#chartHost .ms-bin:not(.ms-bin--overflow)', 'circle', 3);
  const t = await report(page, 'after circle tap');
  await page.screenshot({ path: `${SHOTS}/touch-${slug}-circle-p390-${theme}.png` });
  const drawerOpen = await page.evaluate(() => !!document.querySelector('#drawer.is-open, #drawer[aria-hidden=false]'));
  const listTitle = await page.evaluate(() => document.querySelector('#resultsTitle')?.innerText);
  console.log('  drawer?', drawerOpen, 'results', listTitle);
  // tap empty space in the toolbar
  await page.touchscreen.tap(200, 380); await sleep(400);
  await report(page, '  after tap elsewhere');
  await page.mouse.wheel(0, 300); await sleep(400);
  await report(page, '  after scroll');
  // row label
  await tapAt(page, '#chartHost .ms-crow__label', 'row label', 1);
  await report(page, 'after row label tap');
  console.log('  results', await page.evaluate(() => document.querySelector('#resultsTitle')?.innerText));
  await page.screenshot({ path: `${SHOTS}/touch-${slug}-rowlabel-p390-${theme}.png` });
  // edge chip
  await page.goto('about:blank'); await page.goto(`${(await import('./lib.mjs')).BASE}/beta/#c=${slug}`); await (await import('./lib.mjs')).ready(page);
  await tapAt(page, '#chartHost .ms-bin--overflow', 'edge chip', 0);
  await report(page, 'after edge chip tap');
  await page.screenshot({ path: `${SHOTS}/touch-${slug}-edgechip-p390-${theme}.png` });
  await ctx.close();
}
// 2. Ranges bar
{
  const { ctx, page } = await openPage(b, 'p390', theme, `/beta/#c=${slug}&v=ranges`);
  await tapAt(page, '#chartHost .ms-row', 'ranges row', 2);
  await report(page, 'after ranges bar tap');
  console.log('  drawer?', await page.evaluate(() => document.querySelector('#drawer')?.className), 'hash', await page.evaluate(() => location.hash));
  await page.screenshot({ path: `${SHOTS}/touch-${slug}-rangesbar-p390-${theme}.png` });
  await page.touchscreen.tap(200, 380); await sleep(400);
  await report(page, '  after tap elsewhere');
  await ctx.close();
}
// 3. Map pin
{
  const { ctx, page } = await openPage(b, 'p390', theme, `/beta/#c=${slug}&m=map`);
  await sleep(1500);
  await tapAt(page, '#mapHost .ms-pin', 'pin', 0);
  await report(page, 'after pin tap');
  await page.screenshot({ path: `${SHOTS}/touch-${slug}-pin-p390-${theme}.png` });
  await page.touchscreen.tap(30, 600); await sleep(400);
  await report(page, '  after tap elsewhere');
  await ctx.close();
}
// 4. Insights: tap a bar / row in the first cards
{
  const { ctx, page } = await openPage(b, 'p390', theme, `/beta/#c=${slug}&m=insights`);
  await sleep(2500);
  const sels = await page.evaluate(() => [...new Set([...document.querySelectorAll('#insightsHost [class*=bar], #insightsHost [class*=row], #insightsHost [class*=box]')].map((e) => '.' + [...e.classList][0]))].slice(0, 12));
  console.log('insights candidates', sels);
  for (const s of sels.slice(0, 6)) { if (await tapAt(page, `#insightsHost ${s}`, `insights ${s}`, 1)) { await report(page, `after insights ${s} tap`); await page.touchscreen.tap(20, 200); await sleep(300); await report(page, '  after tap elsewhere'); } }
  await page.screenshot({ path: `${SHOTS}/touch-${slug}-insights-p390-${theme}.png` });
  await ctx.close();
}
await b.close();
