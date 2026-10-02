// Mobile audit (docs/process/mobile.md). Chromium only; iOS emulated by UA + viewport + touch.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright') /* NODE_PATH=<dir>/node_modules */;
const [base, shots] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const c = await b.newContext({ viewport: { width: 390, height: 844 }, userAgent: IOS, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
const cdp = await c.newCDPSession(p);
const ok = (name, v, extra = '') => console.log(`${v ? 'PASS' : 'FAIL'} ${name} ${extra}`);
await p.goto(base + '#c=anthropic'); await p.waitForSelector('#resultsList .card[data-id]'); await sleep(800);
ok('no Leaflet tag in the startup HTML', !(await p.evaluate(async () => (await (await fetch(location.pathname)).text()).includes('leaflet.js'))));
// chip -> filter sheet at section
await p.tap('.chip--drop[data-pop="loc"]'); await sleep(600);
const sec = await p.evaluate(() => { const s = [...document.querySelectorAll('#filters .fsec')][2]; const r = s.getBoundingClientRect(); return { open: document.body.classList.contains('filters-open'), title: s.querySelector('.fsec-title').textContent, top: Math.round(r.top), pop: !document.querySelector('#popover').hidden }; });
ok('Location chip opens full-screen filters at Location', sec.open && !sec.pop && sec.top < 200, JSON.stringify(sec));
await p.screenshot({ path: `${shots}/after-390-filters-location.png` });
// pick a location, chart must update after closing
const sigBefore = await p.evaluate(() => document.querySelector('#chartHost').innerHTML.length);
await p.locator('#filters .fsec').nth(2).locator('.check').first().tap(); await sleep(500);
const label = await p.textContent('#filtersDone');
await p.tap('#filtersDone'); await sleep(1200);
const sigAfter = await p.evaluate(() => document.querySelector('#chartHost').innerHTML.length);
ok('"Show N roles" closes the sheet and the chart catches up', sigAfter !== sigBefore && !(await p.evaluate(() => document.body.classList.contains('filters-open'))), `${label}; chart html ${sigBefore}->${sigAfter}`);
await p.tap('#clearAll'); await sleep(600);
// sheet drag: handle up to full, then handle down to peek
const pt = (x, y) => [{ x, y, id: 1 }];
const drag = async (y0, y1) => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(195, y0) }); for (let i = 1; i <= 15; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(195, y0 + (y1 - y0) * i / 15) }); await sleep(16); } await sleep(150); /* rest, then lift */ await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(600); };
const hy = async () => p.$eval('#sheetHandle', (e) => e.getBoundingClientRect().top + 12);
await drag(await hy(), 420); let st = await p.evaluate(() => document.body.dataset.sheet); ok('slow drag up from peek snaps to half', st === 'half', st);
await p.screenshot({ path: `${shots}/after-390-sheet-half.png` });
await drag(await hy(), 150); st = await p.evaluate(() => document.body.dataset.sheet); ok('drag up from half snaps to full', st === 'full', st);
await p.screenshot({ path: `${shots}/after-390-sheet-full.png` });
// full: list scrolls natively
const ly = await p.$eval('#resultsList', (e) => e.getBoundingClientRect().top + 300);
await drag(ly + 200, ly - 200); const stp = await p.$eval('#resultsList', (e) => e.scrollTop); st = await p.evaluate(() => document.body.dataset.sheet);
ok('full sheet: list scrolls, sheet stays', stp > 100 && st === 'full', `scrollTop=${stp}`);
// flick down from handle -> peek
const fy = await hy(); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(195, fy) }); for (let i = 1; i <= 4; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(195, fy + 40 * i) }); await sleep(10); } await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(600);
st = await p.evaluate(() => document.body.dataset.sheet); ok('flick down from full goes one snap (half)', st === 'half', st);
await p.tap('#sheetHandle'); await sleep(400); await p.tap('#sheetHandle'); await sleep(400);
st = await p.evaluate(() => document.body.dataset.sheet); ok('handle tap cycles half -> full -> peek', st === 'peek', st);
// card tap opens the full-screen page; back arrow closes; browser Back also closes
await p.tap('#sheetHandle'); await sleep(500);
await p.locator('#resultsList .card').first().tap(); await p.waitForSelector('#drawer.is-open'); await sleep(400);
const d = await p.evaluate(() => { const r = document.querySelector('#drawer').getBoundingClientRect(); const b = document.querySelector('#drawerClose').getBoundingClientRect(); return { w: r.width, h: r.height, backLeft: Math.round(b.left), backIcon: getComputedStyle(document.querySelector('#drawerClose .ico-back')).display }; });
ok('card tap opens a full-screen page with Back at top-left', d.w === 390 && d.h === 844 && d.backLeft < 20 && d.backIcon !== 'none', JSON.stringify(d));
await p.tap('#drawerClose'); await sleep(500);
ok('Back arrow closes the page', await p.evaluate(() => !document.querySelector('#drawer').classList.contains('is-open')));
await p.locator('#resultsList .card').first().tap(); await p.waitForSelector('#drawer.is-open'); await sleep(300);
await p.goBack(); await sleep(500);
ok('browser/hardware Back closes the page', await p.evaluate(() => !document.querySelector('#drawer').classList.contains('is-open') && !/job=/.test(location.hash)));
// mode change collapses the sheet (UX-10)
await p.tap('.seg [data-mode="map"]'); await sleep(300);
ok('switching mode collapses the sheet to peek (UX-10)', (await p.evaluate(() => document.body.dataset.sheet)) === 'peek');
await p.waitForSelector('#mapHost .leaflet-marker-icon', { state: 'attached', timeout: 15000 });
ok('map opens (Leaflet loaded lazily)', await p.evaluate(() => typeof L === 'object' && !!document.querySelector('link[href*="leaflet.css"]')));
// keyboard: company popover lifts to the top when kb-open
await p.tap('#companyMenuBtn'); await sleep(400);
await p.evaluate(() => { document.body.classList.add('kb-open'); document.documentElement.style.setProperty('--vvh', '480px'); }); await sleep(200);
const pop = await p.$eval('#popover', (e) => { const r = e.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom) }; });
ok('with the keyboard up, bottom sheets move above it', pop.top < 70 && pop.bottom <= 480, JSON.stringify(pop));
await p.screenshot({ path: `${shots}/after-390-company-keyboard.png` });
await p.evaluate(() => document.body.classList.remove('kb-open')); await p.keyboard.press('Escape');
console.log('page errors:', errs.length ? errs : 'none');
// reduced motion
const c2 = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
const p2 = await c2.newPage(); await p2.goto(base + '#c=anthropic'); await p2.waitForSelector('#resultsList .card[data-id]');
const td = await p2.$eval('#results', (e) => getComputedStyle(e).transitionDuration);
ok('prefers-reduced-motion: sheet snaps without animation', parseFloat(td) < 0.001, td);
await b.close();
