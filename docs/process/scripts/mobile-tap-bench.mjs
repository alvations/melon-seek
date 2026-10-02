// Mobile audit (docs/process/mobile.md). Chromium only; iOS emulated by UA + viewport + touch.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright') /* NODE_PATH=<dir>/node_modules */;
const [url] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
const p = await c.newPage(); const cdp = await c.newCDPSession(p);
await p.goto(url); await p.waitForSelector('#resultsList .card[data-id]', { timeout: 60000 });
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
await sleep(3000);
await p.tap('#filtersToggle'); await sleep(800);
await p.evaluate(() => { window.__ev = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'click' || e.name === 'pointerup') window.__ev.push(Math.round(e.duration)); }).observe({ type: 'event', durationThreshold: 16, buffered: false }); });
const res = [];
for (let i = 0; i < 4; i++) {
  const box = await p.locator('#filters .check').nth(i % 2).boundingBox();
  await p.evaluate(() => { window.__t = null; const btn = document.querySelector('#filtersDone'); const before = btn.textContent; const t0 = performance.now();
    const mo = new MutationObserver(() => { if (btn.textContent !== before) { mo.disconnect(); requestAnimationFrame(() => setTimeout(() => { window.__t = performance.now() - t0; }, 0)); } }); mo.observe(btn, { childList: true, characterData: true, subtree: true }); });
  await p.touchscreen.tap(box.x + 40, box.y + box.height / 2);
  await p.waitForFunction(() => window.__t != null, null, { timeout: 20000 });
  res.push(Math.round(await p.evaluate(() => window.__t)));
  await sleep(1200);
}
console.log('tap->Show N updated+frame (ms):', res.join(' '), '| event timing (click/pointerup ms):', (await p.evaluate(() => window.__ev)).join(' '));
await b.close();
