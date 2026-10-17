// Reduced motion and focus rings on the new controls (Details buttons, stacked Ranges rows, Company filter).
import { chromium } from 'playwright';
import { BASE, VP, sleep, ready, SHOTS } from './lib.mjs';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
for (const rm of ['no-preference', 'reduce']) {
  const ctx = await b.newContext({ ...VP.d1440, reducedMotion: rm });
  await ctx.route((u) => !u.href.startsWith(BASE.replace('/melon-seek', '')) && !u.href.startsWith('data:') && !u.href.startsWith('blob:'), (r) => r.abort('blockedbyclient'));
  const page = await ctx.newPage();
  await page.goto(`${BASE}/beta/#c=google`); await ready(page);
  const t = await page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const d = (e) => e ? getComputedStyle(e).transitionDuration + ' / anim ' + getComputedStyle(e).animationDuration : null;
    return { dot: d(q('.ms-bin__dot')), drawer: d(q('#drawer')), sheet: d(q('#results')), card: d(q('#resultsList article.card')), note: d(q('.ms-note__more')) };
  });
  console.log(rm, JSON.stringify(t));
  await ctx.close();
}
// focus rings: Tab to the stats line's Details and the chart notes' Details
const ctx = await b.newContext({ ...VP.d1440 });
await ctx.route((u) => !u.href.startsWith(BASE.replace('/melon-seek', '')) && !u.href.startsWith('data:') && !u.href.startsWith('blob:'), (r) => r.abort('blockedbyclient'));
const page = await ctx.newPage();
await page.goto(`${BASE}/beta/#c=google`); await ready(page);
for (const sel of ['#statsLine .ms-note__more', '#chartHost .ms-chart__foot .ms-note__more', '#groupBy']) {
  await page.locator(sel).first().focus();
  await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab');
  await sleep(150);
  const r = await page.evaluate((sel) => { const e = document.querySelector(sel); const cs = getComputedStyle(e); return { active: document.activeElement === e, outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`, shadow: cs.boxShadow.slice(0, 60) }; }, sel);
  console.log('focus', sel, JSON.stringify(r));
  const box = await page.locator(sel).first().boundingBox();
  await page.screenshot({ path: `${SHOTS}/focus-${sel.replace(/[^a-z]+/gi, '-')}-d1440-light.png`, clip: { x: Math.max(0, box.x - 40), y: Math.max(0, box.y - 12), width: Math.min(300, box.width + 80), height: box.height + 24 } });
}
await ctx.close();
await b.close();
