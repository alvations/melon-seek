import { createRequire } from 'node:module'; import fs from 'node:fs'; const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || 'playwright');
const AXE = process.env.AXE || 'axe.min.js';
const OUT = '/home/user/melon-seek/docs/screenshots/audit/';
const BASE = process.env.BASE || 'http://127.0.0.1:5311/';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const results = {};
async function scan(name, { scheme = 'light', viewport = { width: 1440, height: 900 }, prep = async () => {} } = {}) {
  const c = await b.newContext({ viewport, colorScheme: scheme, bypassCSP: true }); await c.route((u) => !u.href.startsWith('http://127.0.0.1'), (r) => r.abort());
  const p = await c.newPage(); await p.goto(BASE + '#c=anthropic'); await p.waitForSelector('#resultsList .card'); await p.waitForTimeout(800);
  await prep(p); await p.waitForTimeout(800);
  await p.addScriptTag({ path: AXE });
  const r = await p.evaluate(async () => { const res = await axe.run(document, { resultTypes: ['violations'] }); return res.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, help: v.help, eg: v.nodes.slice(0, 40).map((x) => x.target.join(' ') + (x.any?.[0]?.message ? ' :: ' + x.any[0].message.slice(0, 140) : '')) })); });
  results[name] = r; console.log('==', name); for (const v of r) console.log(`${v.impact} ${v.id} x${v.n}: ${v.help}\n    ${v.eg.join('\n    ')}`);
  await c.close();
}
await scan('light-landing');
await scan('dark-landing', { scheme: 'dark' });
await scan('light-drawer', { prep: async (p) => { await p.locator('#resultsList .card').first().click(); await p.waitForTimeout(2500); } });
await scan('dark-drawer', { scheme: 'dark', prep: async (p) => { await p.locator('#resultsList .card').first().click(); await p.waitForTimeout(2500); } });
await scan('light-map', { prep: async (p) => { await p.locator('.topbar [data-mode=map]').click(); await p.waitForTimeout(1500); } });
await scan('light-insights', { prep: async (p) => { await p.locator('.topbar [data-mode=insights]').click(); await p.waitForTimeout(2500); } });
await scan('light-more-popover', { prep: async (p) => { await p.locator('#quickChips [data-pop=more]').click(); } });
await scan('mobile-landing', { viewport: { width: 390, height: 844 } });
fs.writeFileSync(process.env.AXE_OUT || 'axe.json', JSON.stringify(results, null, 1));
await b.close();
