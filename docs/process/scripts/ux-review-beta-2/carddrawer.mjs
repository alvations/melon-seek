// A card (found by a search for its title) and its drawer, side by side; prints the card's pill and the drawer's headline.
// node carddrawer.mjs <vp> <theme> <slug> <jobId> <search> <name>
import { launch, openPage, SHOTS, sleep, BASE, ready } from './lib.mjs';
const [vp, theme, slug, id, q, name] = process.argv.slice(2);
const b = await launch();
const { ctx, page } = await openPage(b, vp, theme, `/beta/#c=${slug}&q=${encodeURIComponent(q)}`);
const card = page.locator(`#resultsList article.card[data-id="${id}"]`);
if (vp.startsWith('p')) { await page.locator('#sheetHandle').tap().catch(() => {}); await sleep(700); }
if (await card.count()) {
  await card.scrollIntoViewIfNeeded();
  const t = await card.evaluate((e) => ({ text: e.innerText.replace(/\s+/g, ' '), pill: e.querySelector('.sal-pill, .pay-pill, [class*=pill]')?.textContent, pillTitle: e.querySelector('.sal-pill, .pay-pill, [class*=pill]')?.title }));
  console.log('card', JSON.stringify(t));
  const box = await card.boundingBox();
  await page.screenshot({ path: `${SHOTS}/${name}-card-${vp}-${theme}.png`, clip: { x: Math.max(0, box.x - 8), y: Math.max(0, box.y - 8), width: Math.min(box.width + 16, VPW(vp) - Math.max(0, box.x - 8)), height: box.height + 16 } }).catch((e) => console.log("card shot failed", e.message.slice(0, 60)));
  await card.click();
} else {
  console.log('card not found; opening by hash');
  await page.goto(`${BASE}/beta/#c=${slug}&job=${encodeURIComponent(id)}`); await ready(page);
}
await sleep(1200);
const d = await page.evaluate(() => {
  const dr = document.querySelector('#drawer');
  const q = (s) => dr.querySelector(s)?.innerText.replace(/\s+/g, ' ').trim();
  return { amt: q('.d-sal-amt'), top: q('.d-sal-top'), levels: q('.d-sal-levels'), tiers: q('.d-tiers'), labels: q('.pay-labels'), pct: q('.d-pct-text'), note: q('.d-pay-note'), juice: q('.d-juice')?.slice(0, 300) };
});
console.log('drawer', JSON.stringify(d));
await page.screenshot({ path: `${SHOTS}/${name}-drawer-${vp}-${theme}.png` });
function VPW(v) { return { d1440: 1440, d1280: 1280, d1024: 1024, t768: 768, p390: 390, p360: 360 }[v]; }
await ctx.close();
await b.close();
