// melon-seek link checker (UX). Crawls the app and verifies every link users can reach.
//
//   node docs/process/scripts/link-check.mjs [--base http://127.0.0.1:5173/] [--static dist]
//        (no --base: starts its own server on a free port via test/e2e/harness.js)
//        [--fetch-external] [--external-sample 20] [--json report.json]
//
// What it checks:
//   1. In-app links on the running app (server mode) and on the static build served
//      under /melon-seek/ (like GitHub Pages): every <a href>, og:url/og:image, the
//      drawer's Apply / "View the full posting" / methodology links, "Same role elsewhere"
//      rows, the data-badge CSV link, map attribution, and the per-company share pages
//      c/<slug>/.
//      - Internal URLs must return 200 with the right content type (html / csv / png / svg /
//        json); a #fragment on an HTML page must exist as an id in that page.
//      - In-app hash links (#c=…, #job=…) are opened and must reach the expected state.
//   2. Link policy (scripts/links-policy.js, a hard rule): no in-app link may leave the site
//      except to ALLOWED_HOSTS (ATS job pages, OpenStreetMap, Google Fonts); GitHub is banned.
//   3. External links are checked for shape (https, expected host and path). The sandbox
//      blocks outbound requests, so they are reported as "not fetched" unless
//      --fetch-external (CI) is given, which HEAD-checks them (GET fallback).
//   4. Every job: url is https, on the right ATS host for its company's source
//      (greenhouse → job-boards.greenhouse.io / boards.greenhouse.io, ashby → jobs.ashbyhq.com,
//      lever → jobs.lever.co), contains the board slug, and never contains "undefined"/"null".
//   5. Markdown: relative links in README.md and docs/**/*.md resolve to files in the repo.
//
// Exit code 1 when anything is broken. The module also exports checkLinks() for
// test/e2e/links.e2e.js.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const policy = await import(pathToFileURL(path.join(ROOT, 'scripts', 'links-policy.js')).href);
const ALLOWED = new Set(policy.ALLOWED_HOSTS);
const BANNED = new Set(policy.BANNED_HOSTS);
const RESERVED = new Set(policy.RESERVED_HOSTS || []);
const SITE_URL = (process.env.SITE_URL || 'https://alvations.github.io/melon-seek/').replace(/\/?$/, '/');
const ATS_HOSTS = { greenhouse: ['job-boards.greenhouse.io', 'boards.greenhouse.io'], ashby: ['jobs.ashbyhq.com'], lever: ['jobs.lever.co'] };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.csv': 'text/csv', '.txt': 'text/plain', '.xml': 'application/xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

/* ---------------------------------------------------------------- report */
function newReport() { return { broken: [], notFetched: [], ok: 0, checked: new Set(), notes: [] }; }
const bad = (rep, where, link, reason) => rep.broken.push({ where, link, reason });

/* ------------------------------------------------- static build under a prefix */
/** Serve `dir` at `/melon-seek/` (like GitHub Pages). Resolves { base, close }. */
export function serveStatic(dir, prefix = '/melon-seek/') {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://x');
      if (!u.pathname.startsWith(prefix)) { res.writeHead(404); return res.end('not found'); }
      let f = path.join(dir, decodeURIComponent(u.pathname.slice(prefix.length)));
      if (!f.startsWith(dir)) { res.writeHead(403); return res.end(); }
      if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
      fs.readFile(f, (err, body) => {
        if (err) { res.writeHead(404, { 'content-type': 'text/html' }); return res.end('<h1>404</h1>'); }
        res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
        res.end(req.method === 'HEAD' ? undefined : body);
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve({ base: `http://127.0.0.1:${srv.address().port}${prefix}`, close: () => new Promise((r) => srv.close(r)) }));
  });
}

/* ------------------------------------------------------------ internal fetch */
const pageCache = new Map();
async function fetchInternal(url) {
  if (pageCache.has(url)) return pageCache.get(url);
  const p = (async () => {
    try {
      const res = await fetch(url, { redirect: 'manual' });
      const type = res.headers.get('content-type') || '';
      const body = /text\/html|json|csv|text\/plain/.test(type) ? await res.text() : (await res.arrayBuffer(), '');
      return { status: res.status, type, body };
    } catch (err) { return { status: 0, type: '', body: '', error: String(err.message || err) }; }
  })();
  pageCache.set(url, p);
  return p;
}
function expectedType(u) {
  const p = u.pathname;
  if (/\/api\/export$/.test(p) || p.endsWith('.csv')) return /text\/csv/;
  if (p.endsWith('/') || p.endsWith('.html')) return /text\/html/;
  const ext = path.extname(p);
  if (ext === '.png') return /image\/png/;
  if (ext === '.svg') return /image\/svg\+xml/;
  if (ext === '.json' || /\/api\//.test(p)) return /application\/json/;
  if (ext === '.css') return /text\/css/;
  if (ext === '.js' || ext === '.mjs') return /javascript/;
  return null;
}
async function checkInternal(rep, where, url) {
  const key = `int ${url}`;
  if (rep.checked.has(key)) return;
  rep.checked.add(key);
  const u = new URL(url);
  const frag = u.hash.slice(1);
  u.hash = '';
  const r = await fetchInternal(u.href);
  if (r.status !== 200) return bad(rep, where, url, `HTTP ${r.status || r.error}`);
  const want = expectedType(u);
  if (want && !want.test(r.type)) return bad(rep, where, url, `content-type ${r.type} (expected ${want})`);
  if (frag && /text\/html/.test(r.type) && !frag.includes('=')) {
    const id = decodeURIComponent(frag);
    if (!new RegExp(`\\sid=["']${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`).test(r.body)) return bad(rep, where, url, `#${id} not found in page`);
  }
  rep.ok++;
}

/* ------------------------------------------------------------ external links */
function classifyExternal(rep, where, url, { expectHost = null } = {}) {
  let u;
  try { u = new URL(url); } catch { return bad(rep, where, url, 'malformed URL'); }
  if (/undefined|null/.test(url)) bad(rep, where, url, 'contains "undefined"/"null"');
  if (u.protocol !== 'https:') bad(rep, where, url, 'not https');
  if (BANNED.has(u.hostname) || policy.REPO_RE.test(url)) return bad(rep, where, url, 'link policy: GitHub links are banned in the app');
  if (!ALLOWED.has(u.hostname) && !RESERVED.has(u.hostname)) return bad(rep, where, url, `link policy: off-site host ${u.hostname} is not allowlisted`);
  if (expectHost && !expectHost.includes(u.hostname)) return bad(rep, where, url, `expected host ${expectHost.join(' / ')}`);
  const key = `ext ${url}`;
  if (!rep.checked.has(key)) { rep.checked.add(key); rep.notFetched.push({ where, link: url }); }
}
/** --fetch-external (CI): HEAD (then GET) a sample of external links. */
async function fetchExternal(rep, sample) {
  const seen = new Set();
  const list = rep.notFetched.filter((x) => !seen.has(x.link) && seen.add(x.link));
  const pick = list.filter((x) => !/\/jobs\//.test(x.link)).concat(list.filter((x) => /\/jobs\//.test(x.link)).slice(0, sample));
  const fetched = new Set();
  for (const x of pick) {
    let status = 0;
    try {
      let res = await fetch(x.link, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(15000) });
      if (res.status === 405 || res.status === 403) res = await fetch(x.link, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(15000) });
      status = res.status;
    } catch (err) { status = 0; x.error = String(err.message || err); }
    fetched.add(x.link);
    if (status >= 400 || status === 0) bad(rep, x.where, x.link, `external HTTP ${status || x.error}`);
    else rep.ok++;
  }
  rep.notFetched = rep.notFetched.filter((x) => !fetched.has(x.link));
}

/* ------------------------------------------------------------- page crawl */
async function collectFromPage(page) {
  return page.evaluate(() => {
    const out = [];
    for (const a of document.querySelectorAll('a[href]')) if (!a.closest('[hidden]')) out.push({ href: a.getAttribute('href'), abs: a.href, text: (a.textContent || a.getAttribute('aria-label') || '').trim().slice(0, 60), download: a.hasAttribute('download') });
    for (const m of document.querySelectorAll('meta[property="og:url"], meta[property="og:image"], meta[name="twitter:image"]')) out.push({ href: m.content, abs: m.content, text: m.getAttribute('property') || m.name, meta: true });
    return out;
  });
}

async function crawlApp(rep, browser, base, label) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(/tile\.openstreetmap|basemaps|cartocdn|arcgis|fonts\.g/, (r) => r.abort());
  const origin = new URL(base).origin;
  const appPath = new URL(base).pathname;
  const handle = async (where, links) => {
    for (const l of links) {
      if (!l.href || l.href === '#') continue;
      if (/^(mailto|tel|javascript):/i.test(l.href)) { if (/^javascript:/i.test(l.href)) bad(rep, where, l.href, 'javascript: link'); continue; }
      if (l.meta) {
        // Static build: og:url/og:image must be absolute under SITE_URL (crawlers need absolute URLs);
        // they map onto this deployment. Server mode serves public/ as-is, where they are relative by design.
        if (label === 'static') {
          if (!l.href.startsWith(SITE_URL)) { bad(rep, where, l.href, `${l.text} is not under SITE_URL ${SITE_URL}`); continue; }
          await checkInternal(rep, `${where} (${l.text})`, new URL(l.href.slice(SITE_URL.length), base).href);
        } else if (!/^https?:/.test(l.href) && !/og:url/.test(l.text)) await checkInternal(rep, `${where} (${l.text})`, new URL(l.href, base).href);
        continue;
      }
      const u = new URL(l.abs);
      if (u.origin === origin) {
        const samePage = u.pathname === appPath || u.pathname === `${appPath}index.html`;
        if (samePage && u.hash) await checkHashLink(rep, page.context(), base, `${where}: “${l.text}”`, u.hash);
        else if (!samePage || u.search) await checkInternal(rep, `${where}: “${l.text}”`, u.href);
      } else classifyExternal(rep, `${where}: “${l.text}”`, u.href);
    }
  };
  await page.goto(base); await page.waitForSelector('.card[data-id]', { timeout: 20000 });
  await page.waitForTimeout(500);
  await handle(`${label} app shell`, await collectFromPage(page));
  // Data-badge popover: CSV download
  await page.click('#dataBadge'); await page.waitForTimeout(250);
  await handle(`${label} data-badge popover`, await collectFromPage(page));
  await page.keyboard.press('Escape');
  // Drawer for the first few jobs: Apply, full posting, methodology, Same role elsewhere rows
  for (let i = 0; i < 3; i++) {
    await page.click(`.card[data-id] >> nth=${i}`); await page.waitForSelector('.drawer.is-open'); await page.waitForTimeout(900);
    await page.evaluate(() => { for (const d of document.querySelectorAll('#drawer details')) d.open = true; });
    await page.waitForTimeout(150);
    const title = (await page.textContent('#drawerTitle'))?.trim();
    await handle(`${label} drawer “${title}”`, await collectFromPage(page));
    // "Same role elsewhere": each row must open the target company with filters (hash state)
    const rows = await page.$$('#drawer .d-comps:not([hidden]) .ms-comps__row:not(.is-current)');
    if (i === 0 && rows.length) {
      await rows[0].click(); await page.waitForSelector('.card[data-id]'); await page.waitForTimeout(600);
      const h = await page.evaluate(() => location.hash);
      const p = new URLSearchParams(h.slice(1));
      if (!p.get('c') || !p.get('rf')) bad(rep, `${label} drawer “${title}” Same role elsewhere`, h, 'row did not open a company with a role filter');
      else rep.ok++;
      await page.goBack(); await page.waitForTimeout(600);
      if (!(await page.$('.drawer.is-open'))) { await page.click(`.card[data-id] >> nth=${i}`); await page.waitForSelector('.drawer.is-open'); }
    }
    await page.keyboard.press('Escape'); await page.waitForTimeout(250);
  }
  // Map attribution links
  await page.click('.topbar .seg [data-mode="map"]'); await page.waitForTimeout(1200);
  await handle(`${label} map`, await collectFromPage(page));
  // Company switcher entries are in-app hash state: each must load its board
  const slugs = await page.evaluate(async () => (await (await fetch(new URL('api/companies' + (window.MELON_STATIC ? '.json' : ''), location.href))).json()).map((c) => c.slug)).catch(() => []);
  for (const slug of slugs) await checkHashLink(rep, page.context(), base, `${label} company menu → ${slug}`, `#c=${slug}`);
  if (errors.length) for (const e of errors) bad(rep, `${label} page`, base, `page error: ${e}`);
  await ctx.close();
  return slugs;
}

/** Open base+hash in a fresh page and check the state it promises. */
async function checkHashLink(rep, ctx, base, where, hash) {
  const key = `hash ${base}${hash}`;
  if (rep.checked.has(key)) return;
  rep.checked.add(key);
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  if (!p.has('c') && !p.has('job') && !p.has('m')) {
    const id = hash.slice(1);
    const page = await ctx.newPage();
    await page.goto(base); await page.waitForTimeout(300);
    const exists = await page.evaluate((id) => !!document.getElementById(id), id);
    await page.close();
    return exists ? rep.ok++ : bad(rep, where, hash, `#${id} target missing`);
  }
  const page = await ctx.newPage();
  try {
    await page.goto(base + hash);
    await page.waitForFunction(() => document.querySelector('.card[data-id]') || document.querySelector('.list-empty'), null, { timeout: 20000 });
    await page.waitForTimeout(300);
    const st = await page.evaluate(() => ({ hash: location.hash, company: document.querySelector('#companyMenuBtn .company-name')?.textContent || '', drawer: !!document.querySelector('.drawer.is-open'), mode: document.documentElement.dataset.mode }));
    const got = new URLSearchParams(st.hash.slice(1));
    if (p.get('c') && got.get('c') !== p.get('c')) bad(rep, where, hash, `opened c=${got.get('c')}`);
    else if (p.get('job') && !st.drawer) bad(rep, where, hash, 'job link did not open the drawer');
    else if (p.get('m') && st.mode !== p.get('m')) bad(rep, where, hash, `opened mode ${st.mode}`);
    else rep.ok++;
  } catch (err) { bad(rep, where, hash, String(err.message || err).split('\n')[0]); }
  await page.close();
}

/** Share pages c/<slug>/ (static build): 200 html, og tags under SITE_URL, and they lead into the app. */
async function checkSharePages(rep, browser, base, slugs) {
  const ctx = await browser.newContext();
  for (const slug of slugs) {
    const url = new URL(`c/${slug}/`, base).href;
    const r = await fetchInternal(url);
    if (r.status !== 200 || !/text\/html/.test(r.type)) { bad(rep, `share page ${slug}`, url, `HTTP ${r.status} ${r.type}`); continue; }
    const og = r.body.match(/property="og:url" content="([^"]*)"/)?.[1];
    if (og !== `${SITE_URL}c/${slug}/`) bad(rep, `share page ${slug}`, og || '(none)', 'og:url should be its own SITE_URL path');
    const img = r.body.match(/property="og:image" content="([^"]*)"/)?.[1];
    if (!img?.startsWith(SITE_URL)) bad(rep, `share page ${slug}`, img || '(none)', 'og:image not under SITE_URL');
    else await checkInternal(rep, `share page ${slug} og:image`, new URL(img.slice(SITE_URL.length), base).href);
    for (const m of r.body.matchAll(/\s(?:href|src)=["']([^"']+)["']/g)) {
      const u = new URL(m[1], url);
      if (u.origin === new URL(base).origin) { if (!u.hash || u.pathname !== new URL(base).pathname) await checkInternal(rep, `share page ${slug}`, u.href); }
      else classifyExternal(rep, `share page ${slug}`, u.href);
    }
    const page = await ctx.newPage();
    try {
      await page.goto(url); await page.waitForSelector('.card[data-id]', { timeout: 20000 });
      const h = await page.evaluate(() => location.hash);
      if (new URLSearchParams(h.slice(1)).get('c') !== slug) bad(rep, `share page ${slug}`, url, `redirected to ${h}`); else rep.ok++;
    } catch (err) { bad(rep, `share page ${slug}`, url, `did not lead into the app: ${String(err.message).split('\n')[0]}`); }
    await page.close();
  }
  await ctx.close();
}

/* ---------------------------------------------------------------- job URLs */
async function checkJobUrls(rep, base, slugs, label) {
  const companies = await (await fetch(new URL(label === 'static' ? 'api/companies.json' : 'api/companies', base))).json();
  for (const c of companies) {
    if (slugs.length && !slugs.includes(c.slug)) continue;
    let body;
    try { body = await (await fetch(new URL(`api/jobs?company=${encodeURIComponent(c.slug)}`, base))).json(); } catch (err) { bad(rep, `jobs ${c.slug}`, '', `could not load: ${err.message}`); continue; }
    const hosts = ATS_HOSTS[c.source] || [];
    let n = 0;
    for (const j of body.jobs || []) {
      const where = `job ${j.id} (${c.name})`;
      if (typeof j.url !== 'string' || !j.url) { bad(rep, where, String(j.url), 'missing url'); continue; }
      if (/undefined|null/.test(j.url)) { bad(rep, where, j.url, 'contains "undefined"/"null"'); continue; }
      let u; try { u = new URL(j.url); } catch { bad(rep, where, j.url, 'malformed'); continue; }
      if (u.protocol !== 'https:') { bad(rep, where, j.url, 'not https'); continue; }
      if (!hosts.includes(u.hostname)) { bad(rep, where, j.url, `host ${u.hostname}, expected ${hosts.join(' / ')} for ${c.source}`); continue; }
      if (c.board && !u.pathname.toLowerCase().includes(`/${String(c.board).toLowerCase()}`)) { bad(rep, where, j.url, `path does not contain board "${c.board}"`); continue; }
      n++;
      classifyExternal(rep, where, j.url, { expectHost: hosts });
    }
    rep.ok += n;
    rep.notes.push(`${label}: ${n} job URLs checked for ${c.name} (mode ${body.mode})`);
  }
}

/* ---------------------------------------------------------------- markdown */
export function checkMarkdown(rep, root = ROOT) {
  const files = ['README.md'];
  const walk = (d) => { for (const e of fs.readdirSync(path.join(root, d), { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.md')) files.push(p); } };
  if (fs.existsSync(path.join(root, 'docs'))) walk('docs');
  for (const f of files) {
    if (!fs.existsSync(path.join(root, f))) continue;
    const text = fs.readFileSync(path.join(root, f), 'utf8').replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
    const links = [...text.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g), ...text.matchAll(/<a\s[^>]*href=["']([^"']+)["']/g)].map((m) => m[1]);
    for (const raw of links) {
      if (/^(https?:|mailto:|tel:)/i.test(raw) || raw.startsWith('#') || raw.startsWith('<')) continue;
      const target = decodeURIComponent(raw.replace(/[?#].*$/, ''));
      if (!target) continue;
      const abs = path.resolve(path.join(root, path.dirname(f)), target);
      if (!abs.startsWith(root)) { bad(rep, f, raw, 'points outside the repo'); continue; }
      if (!fs.existsSync(abs)) bad(rep, f, raw, 'file not found');
      else rep.ok++;
    }
  }
  return files.length;
}

/* ------------------------------------------------------------------- main */
/**
 * @param {{ base: string, browser: object, staticDir?: string|null, fetchExternal?: boolean, externalSample?: number }} o
 */
export async function checkLinks({ base, browser, staticDir = path.join(ROOT, 'dist'), fetchExternal: doFetch = false, externalSample = 20 }) {
  const rep = newReport();
  base = base.replace(/\/?$/, '/');
  const slugs = await crawlApp(rep, browser, base, 'server');
  await checkJobUrls(rep, base, slugs, 'server');
  if (staticDir && fs.existsSync(path.join(staticDir, 'index.html'))) {
    const st = await serveStatic(staticDir);
    try {
      const sslugs = await crawlApp(rep, browser, st.base, 'static');
      await checkSharePages(rep, browser, st.base, sslugs);
    } finally { await st.close(); }
  } else rep.notes.push(`static build not found at ${staticDir} (run npm run build); static checks skipped`);
  const mdFiles = checkMarkdown(rep);
  rep.notes.push(`markdown: ${mdFiles} files`);
  if (doFetch) await fetchExternal(rep, externalSample);
  const uniq = (arr) => [...new Map(arr.map((x) => [`${x.where}|${x.link}|${x.reason}`, x])).values()];
  return { broken: uniq(rep.broken), notFetched: [...new Set(rep.notFetched.map((x) => x.link))].length, ok: rep.ok, notes: rep.notes };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
  // Without --base/BASE, start our own server on a free port (same as the e2e harness).
  let server = null;
  let base = arg('--base', process.env.BASE || null);
  if (!base) {
    const { startServer } = await import(pathToFileURL(path.join(ROOT, 'test', 'e2e', 'harness.js')).href);
    server = await startServer();
    base = server.baseUrl;
  }
  const req = createRequire(path.join(process.env.PW_DIR || ROOT, 'noop.js'));
  let pw; try { pw = req('playwright-core'); } catch { pw = req('playwright'); }
  const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers') ? fs.readdirSync('/opt/pw-browsers').filter((d) => /^chromium-\d+$/.test(d)).map((d) => `/opt/pw-browsers/${d}/chrome-linux/chrome`)[0] : undefined);
  const browser = await pw.chromium.launch({ executablePath: exe });
  try {
    const out = await checkLinks({ base, browser, staticDir: arg('--static', path.join(ROOT, 'dist')), fetchExternal: process.argv.includes('--fetch-external'), externalSample: Number(arg('--external-sample', 20)) });
    const json = arg('--json');
    if (json) fs.writeFileSync(json, JSON.stringify(out, null, 2));
    console.log(JSON.stringify({ ok: out.ok, broken: out.broken.length, notFetched: out.notFetched, notes: out.notes }, null, 2));
    for (const b of out.broken) console.log(`BROKEN  ${b.where}\n        ${b.link}\n        → ${b.reason}`);
    process.exitCode = out.broken.length ? 1 : 0;
  } finally { await browser.close(); if (server) await server.stop(); }
}
