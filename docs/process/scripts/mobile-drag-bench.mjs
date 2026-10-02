// Mobile audit (docs/process/mobile.md). Chromium only; iOS emulated by UA + viewport + touch.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright') /* NODE_PATH=<dir>/node_modules */;
const [url, css = ''] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const out = [];
for (let run = 0; run < 3; run++) {
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  const p = await c.newPage(); const cdp = await c.newCDPSession(p);
  await p.goto(url); await p.waitForSelector('#resultsList .card[data-id]', { timeout: 60000 });
  if (css) await p.evaluate((v) => document.querySelectorAll('#resultsList .card').forEach((c) => { c.style.contentVisibility = v; }), css);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await sleep(4000);
  const pt = (x, y) => [{ x, y, id: 1 }];
  for (const [y0, y1] of [[775, 300], [180, 700], [775, 200]]) {
    await p.evaluate(() => { window.__f = []; let l = performance.now(); const f = window.__f; const lp = (t) => { if (window.__f !== f) return; f.push(t - l); l = t; requestAnimationFrame(lp); }; requestAnimationFrame(lp); });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(195, y0) });
    for (let i = 1; i <= 20; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(195, y0 + (y1 - y0) * i / 20) }); await sleep(16); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(500);
    const f = await p.evaluate(() => { const f = window.__f; window.__f = null; return f.slice(1); });
    out.push(Math.round(Math.max(...f)));
  }
  await c.close();
}
console.log(css ? 'with css' : 'as is', out.join(' '));
await b.close();
