import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || 'playwright');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
for (const slug of ['anthropic', 'anduril']) {
const c = await b.newContext({ viewport: { width: 1440, height: 900 } }); await c.route((u) => !u.href.startsWith('http://127.0.0.1'), (r) => r.abort());
const p = await c.newPage(); const cdp = await c.newCDPSession(p);
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start');
await p.goto('http://127.0.0.1:5311/#c=' + slug); await p.waitForSelector('#resultsList .card'); await p.waitForTimeout(1500);
const { profile } = await cdp.send('Profiler.stop');
const byId = new Map(profile.nodes.map((n) => [n.id, n])); const self = new Map();
const dt = profile.timeDeltas; profile.samples.forEach((id, i) => { const n = byId.get(id); const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').slice(-2).join('/')}:${n.callFrame.lineNumber + 1}`; self.set(k, (self.get(k) || 0) + (dt[i] || 0) / 1000); });
// inclusive by file
const file = new Map(); for (const [k, v] of self) { const f = k.split(' ')[1]?.split(':')[0] || '?'; file.set(f, (file.get(f) || 0) + v); }
console.log('==', slug, 'self time top fns:'); console.log([...self].filter(([k]) => !/^\((idle|program|garbage)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${v.toFixed(0)}ms ${k}`).join('\n'));
console.log('by file:', [...file].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k}=${v.toFixed(0)}ms`).join(', '));
await c.close(); }
await b.close();
