#!/usr/bin/env node
// iOS Simulator Safari check of the phone company menu (docs/process/qa-mobile-beta-2.md, M-28 to M-30), for the
// macOS job of .github/workflows/webkit-phone.yml. Needs Xcode (xcrun simctl) and idb (`idb ui tap|swipe`).
//
//   node test/e2e/webkit/ios-sim-menu.mjs --dist dist --out ios-sim [--devices "iPhone 16,iPhone SE (3rd generation)"]
//
// For each device it boots a simulator, opens /melon-seek/beta/#c=apple in Safari and then, with real touch input:
//   1. taps the company menu button (a real tap, so it also shows whether opening it brings up the keyboard: M-29);
//   2. swipes up on the company rows 6 times;
//   3. taps the search box (the real on-screen keyboard opens) and swipes the rows 6 times again.
// Screenshots go to <out>/<device>-<step>.png, every measurement to <out>/<device>.json, and one line per step to
// <out>/result.txt. A step fails when the last company ("Shield AI") is not fully visible after the swipes, or when
// the sheet sits outside the visible area with the keyboard up. The page itself is the build, unchanged; the
// server adds test/e2e/webkit/qa-probe.js to beta/index.html so the page can report its geometry.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const DIST = path.resolve(arg('dist', 'dist'));
const OUT = path.resolve(arg('out', 'ios-sim'));
const DEVICES = (arg('devices', process.env.IOS_DEVICES || 'iPhone 16,iPhone SE (3rd generation)')).split(',').map((s) => s.trim()).filter(Boolean);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const say = (line) => { console.log(line); results.push(line); fs.writeFileSync(path.join(OUT, 'result.txt'), results.join('\n') + '\n'); };

/* ---------------------------------------------------------------- server: the build plus the probe */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.csv': 'text/csv', '.woff2': 'font/woff2' };
let log = [];
let cmd = { id: 0 };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/qa-log' && req.method === 'POST') {
    let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { try { log.push(JSON.parse(b)); } catch { /* ignore */ } res.end('ok'); });
    return;
  }
  if (u.pathname === '/qa-cmd') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(cmd.id > Number(u.searchParams.get('after') || 0) ? cmd : {})); }
  if (u.pathname === '/melon-seek/qa-probe.js') { res.setHeader('content-type', 'text/javascript'); return res.end(fs.readFileSync(path.join(HERE, 'qa-probe.js'))); }
  if (!u.pathname.startsWith('/melon-seek/')) { res.writeHead(302, { location: '/melon-seek/' }); return res.end(); }
  let p = path.join(DIST, decodeURIComponent(u.pathname.slice('/melon-seek/'.length)));
  if (!p.startsWith(DIST)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  let body = fs.readFileSync(p);
  if (p === path.join(DIST, 'beta', 'index.html')) body = Buffer.from(String(body).replace('</body>', '<script src="/melon-seek/qa-probe.js"></script></body>'));
  res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(body);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
console.log(`serving ${DIST} at ${ORIGIN}/melon-seek/`);

const sh = (cmdName, args) => execFileSync(cmdName, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
const waitFor = async (pred, ms = 30000) => { const t0 = Date.now(); for (;;) { const hit = log.slice().reverse().find(pred); if (hit) return hit; if (Date.now() - t0 > ms) return null; await sleep(250); } };
const send = (name) => { cmd = { id: cmd.id + 1, name }; };

function udidFor(name) {
  const all = JSON.parse(sh('xcrun', ['simctl', 'list', 'devices', 'available', '-j'])).devices;
  for (const list of Object.values(all)) for (const d of list) if (d.name === name) return d.udid;
  const type = JSON.parse(sh('xcrun', ['simctl', 'list', 'devicetypes', '-j'])).devicetypes.find((t) => t.name === name);
  if (!type) throw new Error(`no simulator device type "${name}"`);
  const runtime = JSON.parse(sh('xcrun', ['simctl', 'list', 'runtimes', '-j'])).runtimes.filter((r) => r.isAvailable && /iOS/.test(r.name)).pop();
  return sh('xcrun', ['simctl', 'create', `qa-${name}`, type.identifier, runtime.identifier]).trim();
}

let failed = 0;
for (const device of DEVICES) {
  const tag = device.replace(/\W+/g, '-').replace(/-+$/, '');
  const measures = [];
  let udid;
  try {
    udid = udidFor(device);
    try { sh('xcrun', ['simctl', 'boot', udid]); } catch { /* already booted */ }
    sh('xcrun', ['simctl', 'bootstatus', udid, '-b']);
    const idb = (...a) => sh('idb', ['ui', ...a, '--udid', udid]);
    const snap = (step) => { try { sh('xcrun', ['simctl', 'io', udid, 'screenshot', path.join(OUT, `${tag}-${step}.png`)]); } catch (e) { console.log('screenshot failed', e.message); } };
    log = [];
    sh('xcrun', ['simctl', 'openurl', udid, `${ORIGIN}/melon-seek/beta/#c=apple`]);
    const ready = await waitFor((e) => e.kind === 'ready', 120000);
    if (!ready) throw new Error('the page never showed a card (no "ready" from the probe)');
    measures.push(ready);
    await sleep(1500);
    snap('1-landing');
    // 1. a real tap on the company menu button. The page fills the screen (viewport-fit=cover), so CSS px are points;
    // the probe's touchstart gives the exact offset, and the tap is repeated once if it missed.
    const [bl, bt, br, bb] = ready.data.btn;
    let off = { x: 0, y: 0 };
    let tapAt = { x: (bl + br) / 2, y: (bt + bb) / 2 };
    for (let attempt = 0; attempt < 2; attempt++) {
      log = log.filter((e) => e.kind !== 'touch' && e.kind !== 'geom');
      idb('tap', String(Math.round(tapAt.x)), String(Math.round(tapAt.y)));
      const t = await waitFor((e) => e.kind === 'touch', 5000);
      if (t) off = { x: tapAt.x - t.data.x, y: tapAt.y - t.data.y };
      const g0 = await waitFor((e) => e.kind === 'geom', 5000);
      if (g0?.data?.open) break;
      // Missed: aim again with the offset the probe measured from this tap.
      tapAt = { x: (bl + br) / 2 + off.x, y: (bt + bb) / 2 + off.y };
      await sleep(800);
    }
    let g = (await waitFor((e) => e.kind === 'geom', 5000))?.data;
    if (!g?.open) { send('open-menu'); await sleep(1500); g = (await waitFor((e) => e.kind === 'geom' && e.data.open, 5000))?.data; say(`${device}: the real tap missed the menu button; opened it from the page instead`); }
    measures.push({ step: 'menu-open', off, g });
    snap('2-menu-open');
    say(`${device}: menu open: focus "${g?.focus}", keyboard ${g?.kbOpen ? 'UP' : 'down'} (visual viewport ${g?.vv}), ${g?.fullRows?.length} rows fully visible`);
    // 2. and 3.: swipe the rows, before and after the keyboard opens
    const swipeRows = async (label) => {
      let cur = g;
      for (let i = 0; i < 6; i++) {
        const top = Math.max(cur.list[1], cur.body[1], cur.vv ? cur.vv[0] : 0), bottom = Math.min(cur.list[3], cur.body[3], cur.vv ? cur.vv[0] + cur.vv[1] : 9999);
        if (bottom - top < 24) break;
        const x = (cur.list[0] + cur.list[2]) / 2 + off.x;
        log = log.filter((e) => e.kind !== 'geom');
        idb('swipe', String(Math.round(x)), String(Math.round(top + (bottom - top) * 0.85 + off.y)), String(Math.round(x)), String(Math.round(top + (bottom - top) * 0.15 + off.y)), '--duration', '0.35');
        cur = (await waitFor((e) => e.kind === 'geom', 5000))?.data || cur;
        measures.push({ step: `${label}-swipe-${i + 1}`, g: cur });
      }
      return cur;
    };
    const a = await swipeRows('rows');
    snap('3-menu-swiped');
    const passA = a.lastSeen >= 0.99;
    if (!passA) failed++;
    say(`${device}: ${passA ? 'PASS' : 'FAIL'} swipes on the rows: ${a.last} ${Math.round(a.lastSeen * 100)}% visible (list ${a.listScroll}, sheet body ${a.bodyScroll}, page ${a.page})`);
    // the keyboard: a real tap on the search box
    log = log.filter((e) => e.kind !== 'geom');
    idb('tap', String(Math.round((a.search[0] + a.search[2]) / 2 + off.x)), String(Math.round((a.search[1] + a.search[3]) / 2 + off.y)));
    await sleep(2000);
    g = (await waitFor((e) => e.kind === 'geom', 5000))?.data || a;
    measures.push({ step: 'keyboard', g });
    snap('4-keyboard');
    const sheetVisible = !g.vv || (g.pop[1] >= g.vv[0] - 1 && g.pop[3] <= g.vv[0] + g.vv[1] + 1);
    if (!sheetVisible) failed++;
    say(`${device}: ${sheetVisible ? 'PASS' : 'FAIL'} keyboard up: sheet ${g.pop[1]}-${g.pop[3]} in a visual viewport from ${g.vv?.[0]} tall ${g.vv?.[1]}, ${g.fullRows?.length} rows fully visible`);
    const b = await swipeRows('keyboard');
    snap('5-keyboard-swiped');
    const passB = b.lastSeen >= 0.99;
    if (!passB) failed++;
    say(`${device}: ${passB ? 'PASS' : 'FAIL'} keyboard up, swipes on the rows: ${b.last} ${Math.round(b.lastSeen * 100)}% visible (list ${b.listScroll}, sheet body ${b.bodyScroll})`);
  } catch (e) {
    failed++;
    say(`${device}: ERROR ${e.message}`);
  } finally {
    fs.writeFileSync(path.join(OUT, `${tag}.json`), JSON.stringify({ device, udid, measures, log }, null, 1));
    if (udid) { try { sh('xcrun', ['simctl', 'shutdown', udid]); } catch { /* ignore */ } }
  }
}
server.close();
process.exit(failed ? 1 : 0);
