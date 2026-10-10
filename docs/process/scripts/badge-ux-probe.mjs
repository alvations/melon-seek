// Badge timeline probe (docs/process/badge-ux.md): serve a static build under /melon-seek/,
// simulate the live boards with Playwright routes, and sample the data badge (class, shown
// label, dot animation, results count) every 150 ms, plus whether a live request is in flight.
// Usage: NODE_PATH=<dir with playwright> node docs/process/scripts/badge-ux-probe.mjs <distDir> <scenario>
//          [--widths=1440,390] [--schemes=light,dark] [--shots=<dir>] [--tag=before|after] [--pendpop=1]
//          [--json=<file>] [--ms=7000] [--delay=300 --company=anduril (near)] [--household=family] [--cpu=4]
// Scenarios: late (live 2.5 s after the bundle), early (bundle slowed to 1.5 s), fail (HTTP 500),
// netfail (network error), bundleonly (live: false), ashby, lever (quiet CORS failure), near, loading.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const req = createRequire(import.meta.url);
const PW = process.env.PLAYWRIGHT_MODULE || req.resolve('playwright', { paths: (process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean) });
const pw = await import(pathToFileURL(PW).href);
const { chromium } = pw.chromium ? pw : pw.default;
const CHROME = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const [dist, scenario = 'late'] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const opt = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=') || null;
const shots = opt('shots');
const tag = opt('tag') || 'now';
const jsonOut = opt('json');
const widths = (opt('widths') || '1440').split(',').map(Number);
const schemes = (opt('schemes') || 'light').split(',');
const reduced = !!opt('reduced');

const { unpackJobs } = await import(pathToFileURL(path.join(dist, 'api.js')).href).catch(() => ({ unpackJobs: (b) => b.jobs }));

function serve(dir) {
  const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.csv': 'text/csv', '.woff2': 'font/woff2' };
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (!u.pathname.startsWith('/melon-seek/')) { res.writeHead(302, { location: '/melon-seek/' }); return res.end(); }
    let p = path.join(dir, decodeURIComponent(u.pathname.slice('/melon-seek/'.length)));
    if (!p.startsWith(dir)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
    if (!fs.existsSync(p)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(fs.readFileSync(p));
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ base: `http://127.0.0.1:${server.address().port}/melon-seek`, close: () => new Promise((rr) => server.close(rr)) })));
}

/** A Greenhouse board response made from the bundled list (ids and pay preserved). */
function greenhouseBody(slug, { drop = 0 } = {}) {
  const body = JSON.parse(fs.readFileSync(path.join(dist, 'api', 'jobs', `${slug}.json`), 'utf8'));
  const jobs = unpackJobs(body).slice(drop);
  return JSON.stringify({ jobs: jobs.map((j) => ({
    id: Number(String(j.id).split(':').pop()) || String(j.id).split(':').pop(),
    title: j.title,
    location: { name: (j.locations || []).map((l) => l && l.name).filter(Boolean).join(' | ') },
    departments: j.department ? [{ name: j.department }] : [],
    content: '',
    absolute_url: j.url,
    updated_at: j.updatedAt || null,
    first_published: j.postedAt || null,
    metadata: [],
    pay_input_ranges: j.salary && j.salary.min != null ? [{ min_cents: Math.round(j.salary.min * 100), max_cents: Math.round((j.salary.max ?? j.salary.min) * 100), currency_type: j.salary.currency || 'USD', title: j.salary.interval === 'hour' ? 'Hourly' : 'Annual Salary' }] : [],
  })) });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SCEN = {
  // live Greenhouse board lands 2.5 s after the bundle
  late: { hash: 'c=anthropic', live: { delay: 2500, status: 200 } },
  // live lands first (bundle slowed down)
  early: { hash: 'c=anthropic', live: { delay: 100, status: 200 }, bundleDelay: 1500 },
  // live fails (HTTP 500) after 1.5 s
  fail: { hash: 'c=anthropic', live: { delay: 1500, status: 500 } },
  // live fails at the network level (CORS-like) after 1.5 s
  netfail: { hash: 'c=anthropic', live: { delay: 1500, abort: true } },
  // bundle-only company (live: false): no browser fetch at all
  bundleonly: { hash: 'c=anthropic', live: { delay: 100, status: 200 }, liveFalse: 'anthropic' },
  // Ashby board (OpenAI) that lands 2.5 s after the bundle
  ashby: { hash: 'c=openai', live: { delay: 2500, status: 200, ashby: true } },
  // first paint: bundle and live both slow
  loading: { hash: 'c=anthropic', live: { delay: 9000, status: 200 }, bundleDelay: 6000 },
  // Lever (quiet CORS source) that fails at the network level
  lever: { hash: 'c=palantir', live: { delay: 1500, abort: true, lever: true } },
  // live lands just after the bundle (race window); --delay=, --company=
  near: { hash: `c=${opt('company') || 'anduril'}`, live: { delay: Number(opt('delay') || 300), status: 200 } },
};

async function run(width, scheme) {
  const sc = SCEN[scenario];
  if (!sc) throw new Error(`unknown scenario ${scenario}`);
  const st = await serve(path.resolve(dist));
  const browser = await chromium.launch({ executablePath: CHROME });
  const height = width >= 800 ? 900 : 844;
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, deviceScaleFactor: 1, reducedMotion: reduced ? 'reduce' : 'no-preference', ...(width < 800 ? { isMobile: true, hasTouch: true } : {}) });
  const origin = new URL(st.base).origin;
  const net = [];
  const t0 = Date.now();
  const T = () => Date.now() - t0;
  await context.route((u) => u.origin !== origin, async (route) => {
    const url = route.request().url();
    const isGh = /boards-api\.greenhouse\.io\/v1\/boards\//.test(url);
    const isAshby = /api\.ashbyhq\.com\/posting-api\/job-board\//.test(url);
    const isLever = /api\.lever\.co\/v0\/postings\//.test(url);
    if (!(isGh || isAshby || isLever)) return route.abort('blockedbyclient');
    const rec = { url: url.replace(/\?.*/, ''), start: T(), end: null, outcome: null };
    net.push(rec);
    await sleep(sc.live.delay);
    rec.end = T();
    if (sc.live.abort) { rec.outcome = 'network-fail'; return route.abort('failed'); }
    if (sc.live.status !== 200) { rec.outcome = `HTTP ${sc.live.status}`; return route.fulfill({ status: sc.live.status, headers: { 'access-control-allow-origin': '*' }, body: '{}' }); }
    rec.outcome = 'ok';
    if (isGh) {
      const slug = /boards\/([^/]+)/.exec(url)[1] === 'anthropic' ? 'anthropic' : 'anduril';
      return route.fulfill({ status: 200, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: greenhouseBody(slug, { drop: 5 }) });
    }
    return route.fulfill({ status: 200, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: JSON.stringify({ jobs: [] }) });
  });
  if (sc.bundleDelay) {
    await context.route(/\/api\/jobs\/[^/]+\.json$/, async (route) => { await sleep(sc.bundleDelay); route.continue(); });
  }
  if (sc.liveFalse) {
    await context.route(/\/api\/companies\.json$/, async (route) => {
      const r = await route.fetch();
      const list = await r.json();
      for (const c of list) if (c.slug === sc.liveFalse) c.live = false;
      route.fulfill({ response: r, body: JSON.stringify(list) });
    });
  }
  if (opt('household')) await context.addInitScript((hh) => { try { localStorage.setItem('melon-seek.household.v1', JSON.stringify(hh)); } catch {} }, opt('household'));
  const page = await context.newPage();
  if (opt('cpu')) { const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(opt('cpu')) }); }
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${st.base}/#${sc.hash}`);
  const samples = [];
  const sample = () => page.evaluate(() => {
    const b = document.querySelector('#dataBadge');
    const dot = b && b.querySelector('.badge-dot');
    const lab = b && b.querySelector('.badge-label');
    const cs = dot ? getComputedStyle(dot) : null;
    const anims = dot ? dot.getAnimations().map((a) => `${a.animationName}:${a.effect.getTiming().iterations}:${a.playState}`) : [];
    const before = lab ? getComputedStyle(lab, '::before').content : null;
    return {
      cls: b ? b.className : null,
      hidden: b ? b.hidden : null,
      label: lab ? lab.textContent : null,
      shown: before && before !== 'none' && before !== 'normal' ? before.replace(/^"|"$/g, '') : (lab ? lab.textContent : null),
      short: lab?.dataset.short, tiny: lab?.dataset.tiny, micro: lab?.dataset.micro,
      anim: cs ? `${cs.animationName} ${cs.animationDuration} x${cs.animationIterationCount}` : null,
      anims: anims.join(','),
      title: b ? b.title : null,
      count: document.querySelector('#resultsTitle')?.innerText.replace(/\s+/g, ' ').slice(0, 60) || null,
      live: document.querySelector('#badgeLive, [data-badge-live]')?.textContent || null,
    };
  }).catch((e) => ({ err: e.message }));
  let shotLoading = false, shotPending = false;
  const end = T() + Number(opt('ms') || 7000);
  while (T() < end) {
    const s = { t: T(), pending: net.some((r) => r.end == null), ...(await sample()) };
    samples.push(s);
    if (shots) {
      if (/is-loading/.test(s.cls) && !shotLoading && scenario === 'loading' && s.t > 1500) {
        shotLoading = true;
        await page.screenshot({ path: path.join(shots, `${tag}-loading-${width}-${scheme}.png`), clip: { x: 0, y: 0, width, height: width >= 800 ? 64 : 120 } });
      }
      if (s.pending && /is-snapshot|is-demo/.test(s.cls) && !shotPending) {
        shotPending = true;
        await page.screenshot({ path: path.join(shots, `${tag}-${scenario}-pending-${width}-${scheme}.png`), clip: { x: 0, y: 0, width, height: width >= 800 ? 64 : 120 } });
        if (opt('pendpop')) {
          await page.click('#dataBadge');
          await sleep(300);
          const vb = await page.locator('#dataBadge').boundingBox();
          const pb = await page.locator('#popover').boundingBox();
          const vp = page.viewportSize();
          const x0 = Math.max(0, Math.min(vb.x, pb.x) - 8), y0 = Math.max(0, Math.min(vb.y, pb.y) - 8);
          const x1 = Math.min(vp.width, Math.max(vb.x + vb.width, pb.x + pb.width) + 8), y1 = Math.min(vp.height, Math.max(vb.y + vb.height, pb.y + pb.height) + 8);
          await page.screenshot({ path: path.join(shots, `${tag}-${scenario}-pending-popover-${width}-${scheme}.png`), clip: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } });
          await page.keyboard.press('Escape');
        }
      }
    }
    await sleep(150);
  }
  // Settled state.
  const settled = { t: T(), pending: net.some((r) => r.end == null), ...(await sample()) };
  if (shots) {
    await page.screenshot({ path: path.join(shots, `${tag}-${scenario}-settled-${width}-${scheme}.png`), clip: { x: 0, y: 0, width, height: width >= 800 ? 64 : 120 } });
    await page.click('#dataBadge');
    await sleep(400);
    const vb = await page.locator('#dataBadge').boundingBox();
    const pb = await page.locator('#popover').boundingBox();
    const vp = page.viewportSize();
    const x0 = Math.max(0, Math.min(vb.x, pb.x) - 8), y0 = Math.max(0, Math.min(vb.y, pb.y) - 8);
    const x1 = Math.min(vp.width, Math.max(vb.x + vb.width, pb.x + pb.width) + 8), y1 = Math.min(vp.height, Math.max(vb.y + vb.height, pb.y + pb.height) + 8);
    await page.screenshot({ path: path.join(shots, `${tag}-${scenario}-popover-${width}-${scheme}.png`), clip: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } });
    const pop = await page.locator('#popover').innerText().catch(() => '');
    settled.popover = pop.replace(/\s+/g, ' ').slice(0, 400);
    await page.keyboard.press('Escape');
  } else {
    await page.click('#dataBadge');
    await sleep(300);
    settled.popover = (await page.locator('#popover').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 400);
    await page.keyboard.press('Escape');
  }
  await browser.close();
  await st.close();
  return { scenario, width, scheme, net, samples, settled, errors };
}

const out = [];
for (const w of widths) for (const s of schemes) {
  const r = await run(w, s);
  out.push(r);
  // Compress the timeline: print each change.
  console.log(`\n=== ${tag} ${scenario} ${w}px ${s} ===`);
  console.log('network:', JSON.stringify(r.net));
  let last = '';
  for (const x of r.samples) {
    const key = `${x.cls}|${x.shown}|${x.anim}|${x.pending}|${x.count}`;
    if (key !== last) { console.log(`t=${String(x.t).padStart(5)}ms pending=${x.pending ? 'Y' : 'n'} cls="${x.cls}" shown="${x.shown}" anim="${x.anim}" [${x.anims}] count="${x.count}"`); last = key; }
  }
  console.log('settled:', JSON.stringify({ cls: r.settled.cls, shown: r.settled.shown, label: r.settled.label, short: r.settled.short, tiny: r.settled.tiny, micro: r.settled.micro, anim: r.settled.anim, anims: r.settled.anims, title: r.settled.title }));
  console.log('popover:', r.settled.popover);
  if (r.errors.length) console.log('page errors:', r.errors);
}
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(out, null, 1));
