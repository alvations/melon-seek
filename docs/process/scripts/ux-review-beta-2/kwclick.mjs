// The drawer's "Keywords  click to filter" on a phone; the pay label chips' titles; the Ranges legend title.
import { launch, openPage, SHOTS, sleep } from './lib.mjs';
const b = await launch();
const { ctx, page } = await openPage(b, 'p390', 'light', '/beta/#c=google&job=google%3A104405499448828614');
await sleep(1200);
const kw = page.locator('#drawer .d-kw').first();
if (await kw.count()) {
  await kw.scrollIntoViewIfNeeded();
  await sleep(300);
  console.log('kw text:', (await kw.innerText()).slice(0, 80).replace(/\s+/g, ' '));
  const box = await kw.boundingBox();
  await page.screenshot({ path: `${SHOTS}/touch-drawer-keywords-click-p390-light.png`, clip: { x: 0, y: Math.max(0, box.y - 60), width: 390, height: Math.min(260, 844 - Math.max(0, box.y - 60)) } });
}
const labels = await page.$$eval('#drawer .pay-label', (els) => els.map((e) => ({ text: e.textContent, title: e.title, tab: e.tabIndex })));
console.log('pay labels', JSON.stringify(labels));
const titles = await page.$$eval('#drawer [title]', (els) => els.map((e) => `${e.tagName.toLowerCase()}.${e.className}: "${e.textContent.trim().slice(0, 40)}" title="${e.title.slice(0, 160)}"`));
console.log(titles.join('\n'));
await ctx.close();
await b.close();
