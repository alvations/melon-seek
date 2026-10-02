import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || 'playwright');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
for (const base of ['http://127.0.0.1:5311/', 'http://127.0.0.1:5310/melon-seek/']) {
  const c = await b.newContext(); await c.route((u) => !u.href.startsWith('http://127.0.0.1'), (r) => r.abort());
  const p = await c.newPage(); const cdp = await c.newCDPSession(p); await cdp.send('Network.enable');
  const m = new Map(); const out = []; const blocked = [];
  cdp.on('Network.responseReceived', (e) => m.set(e.requestId, e.response.url));
  cdp.on('Network.loadingFinished', (e) => m.has(e.requestId) && out.push([m.get(e.requestId).replace(base, ''), Math.round(e.encodedDataLength / 1024)]));
  p.on('requestfailed', (r) => blocked.push(r.url().slice(0, 90)));
  await p.goto(base + '#c=anthropic'); await p.waitForSelector('#resultsList .card'); await p.waitForTimeout(2000);
  console.log('==', base); console.log(out.sort((a, b) => b[1] - a[1]).map(([u, k]) => `${k}KB ${u.slice(0, 70)}`).join('\n')); console.log('blocked:', blocked);
  await c.close();
}
await b.close();
