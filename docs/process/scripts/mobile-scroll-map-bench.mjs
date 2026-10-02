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
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }); await sleep(3500);
// open the sheet fully (new UI: handle cycles; old UI: toggles open)
await p.tap('#sheetHandle'); await sleep(500);
if (await p.evaluate(() => document.body.dataset.sheet === 'half')) { await p.tap('#sheetHandle'); await sleep(500); }
await p.evaluate(() => { window.__f = []; let l = performance.now(); const f = window.__f; const lp = (t) => { if (window.__f !== f) return; f.push(t - l); l = t; requestAnimationFrame(lp); }; requestAnimationFrame(lp); });
const pt = (x, y) => [{ x, y, id: 1 }];
for (let k = 0; k < 10; k++) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(195, 760) });
  for (let i = 1; i <= 12; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(195, 760 - 500 * i / 12) }); await sleep(16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(120);
}
await sleep(600);
const f = (await p.evaluate(() => { const f = window.__f; window.__f = null; return f.slice(1); }));
const cards = await p.evaluate(() => document.querySelectorAll('#resultsList .card').length);
console.log(`deep scroll: worst ${Math.round(Math.max(...f))} ms, frames>50: ${f.filter(x => x > 50).length}/${f.length}, cards now ${cards}`);
// collapse, then time Map tap -> first pin
await p.evaluate(() => { const h = document.querySelector('#sheetHandle'); for (let i = 0; i < 3 && (document.body.classList.contains('sheet-open')); i++) h.click(); });
await sleep(500);
const t = await p.evaluate(() => new Promise((res) => { const t0 = performance.now(); document.querySelector('.seg [data-mode="map"]').click();
  const chk = () => document.querySelector('#mapHost .leaflet-marker-icon') ? res(Math.round(performance.now() - t0)) : requestAnimationFrame(chk); chk(); }));
console.log(`map tap -> first pin: ${t} ms`);
await b.close();
