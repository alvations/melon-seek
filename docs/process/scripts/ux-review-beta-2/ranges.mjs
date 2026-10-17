// Ranges view: stacked rows ("N roles", "×N"), the Group select, edge clipping; screenshot and row texts.
import { launch, openPage, SHOTS, sleep } from './lib.mjs';
const b = await launch();
const vp = process.argv[2] || 'd1440';
const theme = process.argv[3] || 'light';
for (const slug of (process.argv[4] || 'amazon,microsoft,google,nvidia').split(',')) {
  const { ctx, page } = await openPage(b, vp, theme, `/beta/#c=${slug}&v=ranges`);
  await sleep(600);
  const info = await page.evaluate(() => {
    const sel = document.querySelector('#groupBy');
    const rows = [...document.querySelectorAll('#chartHost .ms-row')].slice(0, 30).map((r) => {
      const lab = r.querySelector('.ms-row__label');
      const cnt = r.querySelector('.ms-row__count');
      const bar = r.querySelector('.ms-row__bar');
      const over = r.querySelector('.ms-row__over');
      const lr = lab?.getBoundingClientRect();
      return { label: lab?.textContent.trim(), labelCut: lab ? lab.scrollWidth > lab.clientWidth + 1 : null, count: cnt?.textContent.trim() || '', bar: bar ? Math.round(bar.getBoundingClientRect().width) : null, over: over?.textContent || '', aria: r.getAttribute('aria-label')?.slice(0, 140), title: r.title?.slice(0, 160) };
    });
    const groupLabel = document.querySelector('label[for=groupBy], .viz-group-label, #vizControls label')?.textContent.trim();
    return { group: sel ? { value: sel.value, text: sel.selectedOptions[0]?.textContent, title: sel.title, label: groupLabel, opts: [...sel.options].map((o) => o.textContent) } : null, rows };
  });
  console.log(slug, JSON.stringify(info.group));
  for (const r of info.rows) console.log('  ', JSON.stringify(r));
  await page.screenshot({ path: `${SHOTS}/ranges-${slug}-${vp}-${theme}.png` });
  // hover a stacked row to read its tip
  const stacked = page.locator('#chartHost .ms-row', { has: page.locator('.ms-row__count') }).first();
  if (await stacked.count() && !vp.startsWith('p')) {
    const bar = stacked.locator('.ms-row__bar').first();
    await bar.hover().catch(() => {}); await sleep(400);
    const tip = await page.evaluate(() => [...document.querySelectorAll('.ms-tip')].filter((e) => !e.hidden).map((e) => e.innerText.replace(/\s+/g, ' ')).join(' | '));
    console.log('  stacked tip:', tip.slice(0, 400));
    await page.screenshot({ path: `${SHOTS}/ranges-${slug}-stacked-tip-${vp}-${theme}.png` });
  }
  await ctx.close();
}
await b.close();
