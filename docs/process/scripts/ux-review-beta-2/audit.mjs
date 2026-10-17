// Layout and contrast audit: horizontal scroll, contrast < 4.5:1, text < 12 px, clipped text, controls off screen,
// and (phone) tap targets < 44 px. Views: chart, ranges, the top role's drawer, Insights.
import fs from 'node:fs';
import { launch, openPage, sleep, BASE, ready } from './lib.mjs';
const fn = fs.readFileSync(new URL('./audit-fn.js', import.meta.url), 'utf8');
const vps = (process.argv[2] || 'd1440,d1280,d1024,t768,p390').split(',');
const boards = (process.argv[3] || 'amazon,google,meta').split(',');
const views = (process.argv[4] || 'chart,ranges,drawer,insights').split(',');
const themes = (process.argv[5] || 'light,dark').split(',');
const b = await launch();
const out = [];
for (const vp of vps) for (const theme of themes) for (const c of boards) {
  const { ctx, page } = await openPage(b, vp, theme, `/beta/#c=${c}`);
  const phone = vp.startsWith('p');
  const first = await page.evaluate(() => document.querySelector('#resultsList .card')?.dataset.id);
  for (const v of views) {
    const hash = v === 'chart' ? `c=${c}` : v === 'ranges' ? `c=${c}&v=ranges` : v === 'insights' ? `c=${c}&m=insights` : `c=${c}&job=${encodeURIComponent(first)}`;
    if (v !== 'chart') { await page.goto('about:blank'); await page.goto(`${BASE}/beta/#${hash}`); await ready(page); await sleep(v === 'insights' ? 2500 : 900); }
    const r = await page.evaluate(`(${fn})({ phone: ${phone} })`);
    const rec = { vp, theme, c, v, ...r };
    out.push(rec);
    const n = (k) => r[k].length;
    console.log(`### ${vp} ${theme} ${c} ${v} hscroll=${r.hscroll} contrast=${n('contrast')} small=${n('small')} clipped=${n('clipped')} offscreen=${n('offscreen')} tap=${n('tap')}`);
    for (const k of ['contrast', 'small', 'clipped', 'offscreen', 'tap']) if (r[k].length) console.log(`  ${k}: ` + r[k].slice(0, 12).join(' | '));
  }
  await ctx.close();
}
fs.writeFileSync(new URL(`./audit-${process.argv[6] || 'run'}.json`, import.meta.url), JSON.stringify(out, null, 1));
await b.close();
