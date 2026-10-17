// What the screen shows in the first seconds after clicking Insights on Amazon (desktop, no throttling).
import { launch, openPage, sleep, SHOTS } from './lib.mjs';
import os from 'node:os';
const b = await launch();
const { ctx, page } = await openPage(b, 'd1440', 'light', '/beta/#c=amazon');
await sleep(1500);
console.log('load', os.loadavg()[0].toFixed(1));
const t0 = Date.now();
await page.locator('button[data-mode=insights]').first().click({ noWaitAfter: true });
for (const at of [120, 600, 1500, 3000]) {
  const wait = at - (Date.now() - t0);
  if (wait > 0) await sleep(wait);
  const s = await page.evaluate(() => ({ mode: document.querySelector('button[data-mode=insights]')?.getAttribute('aria-pressed') || document.querySelector('button[data-mode=insights]')?.className, host: (document.querySelector('#insightsHost')?.innerText || '').replace(/\s+/g, ' ').slice(0, 100), busy: !!document.querySelector('#insightsHost [aria-busy=true], #insightsPanel [aria-busy=true], .skeleton') }));
  console.log(Date.now() - t0, 'ms', JSON.stringify(s));
  await page.screenshot({ path: `${SHOTS}/insights-wait-${at}-d1440-light.png` });
}
await ctx.close();
await b.close();
