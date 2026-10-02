import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || 'playwright');
const OUT = '/home/user/melon-seek/docs/screenshots/audit/';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const c = await b.newContext({ viewport: { width: 1440, height: 900 } }); await c.route((u) => !u.href.startsWith('http://127.0.0.1'), (r) => r.abort());
const p = await c.newPage(); await p.goto('http://127.0.0.1:5311/#c=anthropic'); await p.waitForSelector('#resultsList .card'); await p.waitForTimeout(800);
const desc = () => p.evaluate(() => { const e = document.activeElement; const cs = getComputedStyle(e); const ring = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 || cs.boxShadow !== 'none'; return `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : ''} "${(e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 40)}" ring=${ring}`; });
const seq = []; let firstCard = null;
for (let i = 1; i <= 120; i++) { await p.keyboard.press('Tab'); const d = await desc(); seq.push(d); if (!firstCard && /article.*card/.test(d)) { firstCard = i; } }
console.log('first 30 tab stops:\n' + seq.slice(0, 30).map((s, i) => `${i + 1} ${s}`).join('\n'));
console.log('tabs to first card:', firstCard, '| no-ring stops:', seq.filter((s) => s.endsWith('ring=false')).slice(0, 10));
await p.screenshot({ path: OUT + 'kbd-focus.png' });
// company menu by keyboard
await p.focus('#companyMenuBtn'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
console.log('after Enter on menu:', await desc()); await p.keyboard.type('anduril'); await p.keyboard.press('Enter'); await p.waitForTimeout(3000);
console.log('hash', await p.evaluate(() => location.hash), 'focus', await desc());
// quick chip by keyboard
await p.focus('#quickChips [data-pop=sen]'); await p.keyboard.press('Enter'); await p.waitForTimeout(300); console.log('popover focus', await desc());
await p.keyboard.press('Space'); await p.waitForTimeout(300); console.log('hash after space', await p.evaluate(() => location.hash));
await p.keyboard.press('Escape'); await p.waitForTimeout(200); console.log('after Esc focus', await desc());
// slider by keyboard
await p.focus('#filterBody input.range--lo'); for (let i = 0; i < 5; i++) await p.keyboard.press('ArrowRight'); await p.waitForTimeout(400); console.log('slider hash', await p.evaluate(() => location.hash));
// map pins keyboard
await p.focus('.topbar [data-mode=map]'); await p.keyboard.press('Enter'); await p.waitForTimeout(1500);
const pinsFocusable = await p.evaluate(() => [...document.querySelectorAll('#mapHost .leaflet-marker-icon')].map((e) => e.tabIndex));
console.log('pin tabindex', pinsFocusable.slice(0, 8));
await b.close();
