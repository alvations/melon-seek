// Feedback after a click on Amazon's whole board (22,179): time to the first visible change (and to the chart),
// measured in the page with requestAnimationFrame after the input event. Desktop 1440, no throttling.
import { launch, openPage, sleep } from './lib.mjs';
import os from 'node:os';
const b = await launch();
const slug = process.argv[2] || 'amazon';
const { ctx, page } = await openPage(b, 'd1440', 'light', `/beta/#c=${slug}`);
await sleep(1500);
console.log('load', os.loadavg().map((x) => x.toFixed(1)).join(' '));
// a helper in the page: watch a selector's text and the chart host for the first change after a trigger
await page.evaluate(() => {
  window.__watch = (sels) => new Promise((res) => {
    const t0 = performance.now();
    const snap = () => sels.map((s) => document.querySelector(s)?.innerText || '').join('|');
    const chart = () => document.querySelector('#chartHost')?.innerHTML.length || 0;
    const a = snap(), c = chart();
    let first = null, chartAt = null;
    const tick = () => {
      const now = performance.now();
      if (first == null && snap() !== a) first = now - t0;
      if (chartAt == null && chart() !== c) chartAt = now - t0;
      if ((first != null && chartAt != null) || now - t0 > 8000) return res({ first: first && Math.round(first), chart: chartAt && Math.round(chartAt) });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
});
const run = async (label, act, sels = ['#resultsTitle', '#statsLine']) => {
  const p = page.evaluate((s) => window.__watch(s), sels);
  await sleep(30);
  const t = Date.now();
  await act();
  const r = await p;
  console.log(label, JSON.stringify(r), 'act', Date.now() - t, 'ms');
  await sleep(1200);
};
await run('department checkbox', () => page.locator('#filterBody .check-label', { hasText: 'Software Development' }).first().click());
await run('department checkbox off', () => page.locator('#filterBody .check-label', { hasText: 'Software Development' }).first().click());
await run('sort Lowest pay', () => page.selectOption('#sortBy', { label: 'Lowest pay' }), ['#resultsList']);
await run('search "data"', () => page.fill('#search', 'data'));
await run('clear search', () => page.fill('#search', ''));
await run('Ranges view', () => page.locator('button', { hasText: /^Ranges$/ }).first().click(), ['#chartHost']);
await run('Clusters view', () => page.locator('button', { hasText: /^Clusters$/ }).first().click(), ['#chartHost']);
await run('open a card', () => page.locator('#resultsList article.card').nth(2).click(), ['#drawer']);
await page.keyboard.press('Escape'); await sleep(800);
await run('Insights', () => page.locator('button[data-mode=insights]').first().click(), ['#insightsHost', '#compHost']);
await run('Map', () => page.locator('button[data-mode=map]').first().click(), ['#mapHost']);
console.log('load', os.loadavg().map((x) => x.toFixed(1)).join(' '));
await ctx.close();
await b.close();
