import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || 'playwright');
const OUT = '/home/user/melon-seek/docs/screenshots/audit/';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }); await c.route((u) => !u.href.startsWith('http://127.0.0.1'), (r) => r.abort());
const p = await c.newPage(); p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await p.goto('http://127.0.0.1:5311/#c=anthropic'); await p.waitForSelector('#resultsList .card'); await p.waitForTimeout(1000);
await p.screenshot({ path: OUT + 'phone-01-landing.png' });
const sheet = await p.locator('#results').boundingBox(); console.log('results sheet top', sheet.y, 'first card visible?', await p.locator('#resultsList .card').first().isVisible(), (await p.locator('#resultsList .card').first().boundingBox())?.y);
await p.locator('#sheetHandle').tap(); await p.waitForTimeout(600); await p.screenshot({ path: OUT + 'phone-02-sheet.png' });
await p.locator('#resultsList .card').first().tap(); await p.waitForTimeout(2500); await p.screenshot({ path: OUT + 'phone-03-drawer.png' });
await p.locator('#drawer .d-juice').scrollIntoViewIfNeeded(); await p.waitForTimeout(300); await p.screenshot({ path: OUT + 'phone-04-drawer-juice.png' });
const applyBox = await p.locator('#drawer .apply').boundingBox(); console.log('apply', applyBox);
await p.keyboard.press('Escape'); await p.waitForTimeout(500);
await p.locator('.topbar [data-mode=insights]').tap(); await p.waitForTimeout(2000); await p.screenshot({ path: OUT + 'phone-05-insights.png' });
// tap target sizes
const small = await p.evaluate(() => [...document.querySelectorAll('button, a, input, select, [role=button]')].filter((e) => e.offsetParent && getComputedStyle(e).visibility !== 'hidden').map((e) => { const r = e.getBoundingClientRect(); return [r.width, r.height, (e.getAttribute('aria-label') || e.textContent || e.className).trim().slice(0, 30)]; }).filter(([w, h]) => w > 0 && (w < 24 || h < 24)));
console.log('targets < 24px:', small.length, JSON.stringify(small.slice(0, 12)));
await b.close();
