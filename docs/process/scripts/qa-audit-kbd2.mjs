import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || 'playwright');
const OUT = '/home/user/melon-seek/docs/screenshots/audit/';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const c = await b.newContext({ viewport: { width: 1440, height: 900 } }); await c.route((u) => !u.href.startsWith('http://127.0.0.1'), (r) => r.abort());
const p = await c.newPage(); await p.goto('http://127.0.0.1:5311/#c=anthropic'); await p.waitForSelector('#resultsList .card'); await p.waitForTimeout(800);
for (const id of ['salary', 'dept', 'loc', 'sen', 'remote', 'more']) {
  await p.focus(`#quickChips [data-pop=${id}]`); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
  const f = await p.evaluate(() => { const e = document.activeElement; return `${e.tagName} ${e.className} in-popover=${!!e.closest('#popover')}`; });
  console.log(id, '->', f);
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
}
await p.focus('#filterBody input.range--lo'); await p.waitForTimeout(200);
const r = await p.locator('#filterBody .salary-ctl').boundingBox();
await p.screenshot({ path: OUT + 'kbd-slider-focus.png', clip: { x: r.x - 10, y: r.y - 10, width: r.width + 20, height: 140 } });
await b.close();
