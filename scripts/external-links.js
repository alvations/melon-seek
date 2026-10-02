// External link check (CI, GitHub-hosted runners; the dev sandbox blocks egress).
// Owner: devops. The browser crawl and link policy stay in
// docs/process/scripts/link-check.mjs and test/e2e/links.e2e.js; this script
// only fetches outbound URLs, so it needs no browser and no server.
//
//   node scripts/external-links.js --jobs <src>    seeded sample of Apply URLs per built-in company
//   node scripts/external-links.js --docs          http(s) URLs in README.md and docs/**/*.md
//   node scripts/external-links.js --site          SITE_URL and SITE_URL/methodology/
//
// <src> is a built dist directory (api/companies.json + api/jobs/<slug>.json),
// a deployed site URL (the same files over https), or a snapshots directory
// (data/snapshots/<slug>.json). Boards in demo mode are skipped: their URLs
// are synthetic.
//
// Options: --per-company 20, --seed <s> (default: today's UTC date, so a day's
// reruns pick the same jobs), --summary <file> (markdown; CI passes
// $GITHUB_STEP_SUMMARY), --json <file>, --timeout <ms> (15000),
// --concurrency <n> (8).
// Each URL gets HEAD, then GET when HEAD is refused (403/405/501) or fails.
// A Greenhouse redirect to `?error=true` counts as a closed posting.
// The exit code is 1 when any checked URL is broken (CI decides whether that blocks).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'melon-seek-link-check/1 (+https://alvations.github.io/melon-seek/)';
// Placeholders and hosts that are never real outbound links in the docs.
const SKIP_HOST = /^(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|(?:[\w-]+\.)*example\.(?:com|org|net)|[\w-]+\.local)$/i;

/** Deterministic PRNG (mulberry32) seeded from a string. */
export function rng(seed) {
  let h = 1779033703 ^ String(seed).length;
  for (const ch of String(seed)) { h = Math.imul(h ^ ch.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `n` items picked without replacement (partial Fisher-Yates), stable for a seed. */
export function sample(items, n, seed) {
  const a = [...items];
  const r = rng(seed);
  const k = Math.min(n, a.length);
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(r() * (a.length - i));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, k);
}

/** Apply URL of every job in a list body (packed melon-packed-1/2 or plain). */
export function jobUrls(body) {
  const prefix = (body && body.shared && body.shared.urlPrefix) || '';
  return ((body && body.jobs) || []).map((j) => (typeof j.url === 'string' && j.url ? prefix + j.url : null)).filter(Boolean);
}

async function readJson(src, rel) {
  if (/^https?:\/\//.test(src)) {
    const res = await fetch(new URL(rel, src.replace(/\/?$/, '/')), { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
  return JSON.parse(fs.readFileSync(path.join(src, rel), 'utf8'));
}

/** [{ slug, name, mode, urls }] for the built-in companies, from a dist dir, site URL or snapshots dir. */
export async function loadBoards(src) {
  const { COMPANIES } = await import(pathToFileURL(path.join(ROOT, 'server', 'companies.js')).href);
  const isDist = /^https?:\/\//.test(src) || fs.existsSync(path.join(src, 'api', 'companies.json'));
  const out = [];
  for (const c of COMPANIES) {
    try {
      const body = await readJson(src, isDist ? `api/jobs/${c.slug}.json` : `${c.slug}.json`);
      out.push({ slug: c.slug, name: c.name, mode: body.mode || 'snapshot', urls: jobUrls(body) });
    } catch (err) {
      out.push({ slug: c.slug, name: c.name, mode: 'missing', urls: [], error: String(err.message || err) });
    }
  }
  return out;
}

/** http(s) URLs in README.md and docs/**\/*.md: [{ url, files: [...] }]. */
export function docUrls(root = ROOT) {
  const files = ['README.md'];
  const walk = (d) => {
    for (const e of fs.readdirSync(path.join(root, d), { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else if (e.name.endsWith('.md')) files.push(p);
    }
  };
  if (fs.existsSync(path.join(root, 'docs'))) walk('docs');
  const seen = new Map();
  for (const f of files) {
    if (!fs.existsSync(path.join(root, f))) continue;
    const text = fs.readFileSync(path.join(root, f), 'utf8');
    for (const m of text.matchAll(/https?:\/\/[^\s<>"'`)\]|*]+/g)) {
      const url = m[0].replace(/[.,;:!?]+$/, '');
      let u; try { u = new URL(url); } catch { continue; }
      // Templates and placeholders (`<slug>`, `${x}`, `{board}`, `…`) are not links.
      // `acme` is the docs' example board slug.
      if (SKIP_HOST.test(u.hostname) || /[{}$…<>]|%7B|%24|\/acme\b/.test(url) || !u.hostname.includes('.')) continue;
      if (!seen.has(url)) seen.set(url, new Set());
      seen.get(url).add(f);
    }
  }
  return [...seen].map(([url, fset]) => ({ url, files: [...fset].sort() }));
}

/** HEAD, falling back to GET. -> { status, finalUrl, ok, reason } */
export async function checkUrl(url, { timeout = 15000 } = {}) {
  const once = async (method) => {
    const res = await fetch(url, { method, redirect: 'follow', headers: { 'user-agent': UA, accept: 'text/html,*/*' }, signal: AbortSignal.timeout(timeout) });
    if (method === 'GET') { try { await res.body?.cancel(); } catch { /* ignore */ } }
    return res;
  };
  let res = null;
  let error = null;
  try { res = await once('HEAD'); } catch (err) { error = err; }
  if (!res || [403, 405, 501].includes(res.status)) {
    try { res = await once('GET'); error = null; } catch (err) { error = err; }
  }
  if (!res) return { status: 0, finalUrl: url, ok: false, reason: String((error && (error.cause?.code || error.name || error.message)) || 'fetch failed') };
  const finalUrl = res.url || url;
  if (res.status >= 400) return { status: res.status, finalUrl, ok: false, reason: `HTTP ${res.status}` };
  if (/[?&]error=true\b/.test(finalUrl)) return { status: res.status, finalUrl, ok: false, reason: 'closed posting (redirected to the board with ?error=true)' };
  return { status: res.status, finalUrl, ok: true, reason: '' };
}

async function mapLimit(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

/** Run the selected groups. -> { groups: [{ name, checked, broken: [...], notes: [...] }] } */
export async function run({ jobs = null, docs = false, site = false, siteUrl, perCompany = 20, seed, timeout = 15000, concurrency = 8 }) {
  siteUrl = String(siteUrl || process.env.SITE_URL || 'https://alvations.github.io/melon-seek/').replace(/\/?$/, '/');
  seed = seed || new Date().toISOString().slice(0, 10);
  const groups = [];
  const probe = (list) => mapLimit(list, concurrency, async (x) => ({ ...x, ...(await checkUrl(x.url, { timeout })) }));

  if (jobs) {
    const g = { name: 'Job Apply URLs', checked: 0, broken: [], notes: [`source ${jobs}; seed "${seed}"; ${perCompany} per company`] };
    for (const b of await loadBoards(jobs)) {
      if (b.mode === 'missing') { g.notes.push(`${b.name}: no list (${b.error})`); continue; }
      if (b.mode === 'demo') { g.notes.push(`${b.name}: demo data, skipped`); continue; }
      const picked = sample(b.urls, perCompany, `${seed}:${b.slug}`).map((url) => ({ url, where: b.name }));
      const res = await probe(picked);
      const broken = res.filter((r) => !r.ok);
      g.checked += res.length;
      g.broken.push(...broken);
      g.notes.push(`${b.name} (${b.mode}): ${res.length - broken.length}/${res.length} OK of ${b.urls.length} jobs`);
    }
    groups.push(g);
  }

  const docList = docs || site ? docUrls() : [];
  // Only URLs under SITE_URL are the site's own (required); anything else, even
  // on the same host, is an ordinary doc link (advisory).
  const own = (url) => url.replace(/\/?$/, '/').startsWith(siteUrl);
  const ownDocs = docList.filter((d) => own(d.url));
  if (docs) {
    const g = { name: 'Doc URLs (README.md, docs/**/*.md)', checked: 0, broken: [], notes: [] };
    const third = docList.filter((d) => !own(d.url)).map((d) => ({ url: d.url, where: d.files.join(', ') }));
    const res = await probe(third);
    g.checked = res.length;
    g.broken = res.filter((r) => !r.ok);
    g.notes.push(`${third.length} third-party URLs in ${new Set(docList.flatMap((d) => d.files)).size} files; ${ownDocs.length} under ${siteUrl} are checked under "Site"`);
    groups.push(g);
  }

  if (site) {
    const g = { name: `Site (${siteUrl})`, checked: 0, broken: [], notes: [] };
    const pages = [{ url: siteUrl, where: 'site root' }, { url: `${siteUrl}methodology/`, where: 'methodology page' }];
    const urls = new Map(pages.map((p) => [p.url, p]));
    for (const d of ownDocs) if (!urls.has(d.url)) urls.set(d.url, { url: d.url, where: d.files.join(', ') });
    const res = await probe([...urls.values()]);
    g.checked = res.length;
    g.broken = res.filter((r) => !r.ok);
    groups.push(g);
  }
  return { seed, siteUrl, groups };
}

export function markdown({ groups }) {
  const esc = (s) => String(s).replace(/\|/g, '\\|');
  const lines = ['### External link check', ''];
  for (const g of groups) {
    lines.push(`**${g.name}**: ${g.broken.length ? `${g.broken.length} broken` : 'all OK'} (${g.checked} checked)`, '');
    for (const n of g.notes) lines.push(`- ${n}`);
    if (g.notes.length) lines.push('');
    if (g.broken.length) {
      lines.push('| where | URL | result |', '| --- | --- | --- |');
      for (const b of g.broken) lines.push(`| ${esc(b.where)} | ${esc(b.url)} | ${esc(b.reason)} |`);
      lines.push('');
    }
  }
  return lines.join('\n') + '\n';
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const argv = process.argv.slice(2);
  const arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
  const opts = {
    jobs: arg('--jobs'),
    docs: argv.includes('--docs'),
    site: argv.includes('--site'),
    siteUrl: arg('--site-url'),
    perCompany: Number(arg('--per-company', 20)),
    seed: arg('--seed'),
    timeout: Number(arg('--timeout', 15000)),
    concurrency: Number(arg('--concurrency', 8)),
  };
  if (!opts.jobs && !opts.docs && !opts.site) {
    console.error('usage: node scripts/external-links.js [--jobs <dist|site URL|snapshots dir>] [--docs] [--site] [--summary file] [--json file]');
    process.exit(2);
  }
  const out = await run(opts);
  const md = markdown(out);
  process.stdout.write(md);
  const summary = arg('--summary');
  if (summary) fs.appendFileSync(summary, md);
  const json = arg('--json');
  if (json) fs.writeFileSync(json, JSON.stringify(out, null, 2));
  for (const g of out.groups) for (const b of g.broken) console.log(`::${g.name.startsWith('Site') ? 'error' : 'warning'} title=Broken link (${g.name})::${b.where}: ${b.url} -> ${b.reason}`);
  process.exitCode = out.groups.some((g) => g.broken.length) ? 1 : 0;
}
