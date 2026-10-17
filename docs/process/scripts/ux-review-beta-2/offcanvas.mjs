// 1024: the filter panel's Reset / Close / "Show roles" sit off screen; can the keyboard reach them?
import { launch, openPage, SHOTS, sleep } from './lib.mjs';
const b = await launch();
const { ctx, page } = await openPage(b, 'd1024', 'light', '/beta/#c=google');
const info = await page.evaluate(() => ['#filters', '#filtersClear', '#filtersClose', '#filtersDone'].map((s) => { const e = document.querySelector(s); const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { s, x: [Math.round(r.left), Math.round(r.right)], vis: cs.visibility, inert: !!e.closest('[inert]'), hidden: !!e.closest('[hidden]'), ariaHidden: e.closest('[aria-hidden=true]') ? true : false, disp: cs.display }; }));
console.log(JSON.stringify(info));
// Tab through the page and record focus that lands off screen
const off = [];
for (let i = 0; i < 40; i++) {
  await page.keyboard.press('Tab');
  const f = await page.evaluate(() => { const e = document.activeElement; const r = e.getBoundingClientRect(); return { id: e.id, cls: e.className, txt: (e.innerText || e.getAttribute('aria-label') || '').trim().slice(0, 30), x: Math.round(r.left), r: Math.round(r.right), y: Math.round(r.top) }; });
  if (f.r <= 0 || f.x >= 1024 || f.y < -5) off.push(f);
}
console.log('focus off screen:', JSON.stringify(off));
await ctx.close();
await b.close();
