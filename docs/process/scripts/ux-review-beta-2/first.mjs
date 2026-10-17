// First impression: /beta/ with no hash, every viewport and theme. Times to first card and to ready.
import { launch, openPage, SHOTS, sleep, BASE, VP } from './lib.mjs';
const b = await launch();
const vps = (process.argv[2] || 'd1440,d1280,d1024,t768,p390').split(',');
const themes = (process.argv[3] || 'light,dark').split(',');
const path = process.argv[4] || '/beta/';
const tag = process.argv[5] || 'first';
for (const vp of vps) for (const theme of themes) {
  const t0 = Date.now();
  const { ctx, page } = await openPage(b, vp, theme, path, { wait: false });
  await page.waitForSelector('#resultsList article.card', { timeout: 90000 }).catch(() => {});
  const tCard = Date.now() - t0;
  await page.waitForFunction(() => { const t = document.querySelector('#resultsTitle'); return t && t.querySelector('strong') && !/Loading/.test(t.textContent); }, null, { timeout: 90000 });
  const tReady = Date.now() - t0;
  await sleep(900);
  const info = await page.evaluate(() => {
    const q = (s) => [...document.querySelectorAll(s)].filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.innerText.replace(/\s+/g, ' ').trim());
    return {
      hash: location.hash, title: document.title,
      company: q('#companyBtn, .company-btn')[0],
      tagline: q('#tagline, .tagline'), stats: q('#statsLine'), results: q('#resultsTitle'), badge: q('#dataBadge, .data-badge'),
      beta: q('.beta-tag, .beta-notice'), notes: q('.ms-note'), juice: q('.juice-scale, .juice-note, #juiceScale'),
      hscroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  console.log(JSON.stringify({ vp, theme, tCard, tReady, ...info }));
  await page.screenshot({ path: `${SHOTS}/${tag}-${vp}-${theme}.png` });
  await ctx.close();
}
await b.close();
