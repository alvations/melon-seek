// Link previews (Open Graph / Twitter cards): static tags in public/index.html,
// the committed share card PNG, server-mode serving, and the absolute URLs and
// per-company share pages that scripts/build-static.js writes for GitHub Pages.
// See docs/process/social.md.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const CARD = path.join(PUBLIC, 'og', 'melon-seek-og.png');
const DEFAULT_SITE = 'https://alvations.github.io/melon-seek/';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'melon-og-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** All <meta property|name=... content=...> in the <head>, as [key, content] pairs. */
function headMeta(html) {
  const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i);
  assert.ok(head, 'page has a <head>');
  const out = [];
  for (const tag of head[1].match(/<meta\b[^>]*>/gi) || []) {
    const k = tag.match(/\s(?:property|name)\s*=\s*(["'])(.*?)\1/i);
    const v = tag.match(/\scontent\s*=\s*(["'])(.*?)\1/i);
    if (k && v) out.push([k[2].toLowerCase(), unesc(v[2])]);
  }
  return out;
}
const metaMap = (html) => {
  const m = new Map();
  for (const [k, v] of headMeta(html)) if (!m.has(k)) m.set(k, v);
  return m;
};

/** Width/height from the PNG IHDR chunk. */
function pngSize(buf) {
  assert.ok(buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'PNG signature');
  assert.equal(buf.toString('latin1', 12, 16), 'IHDR', 'first chunk is IHDR');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const REQUIRED = [
  'og:type', 'og:title', 'og:description', 'og:url', 'og:image',
  'og:image:width', 'og:image:height', 'og:image:alt',
  'twitter:card', 'twitter:title', 'twitter:description', 'twitter:image',
];

/** Checks shared by public/index.html and every built page. */
function assertCompleteTags(m, where) {
  for (const k of REQUIRED) assert.ok(m.get(k) && m.get(k).trim(), `${where}: ${k} present and non-empty`);
  assert.equal(m.get('og:type'), 'website', `${where}: og:type`);
  assert.equal(m.get('twitter:card'), 'summary_large_image', `${where}: twitter:card`);
  assert.equal(m.get('og:image:width'), '1200', `${where}: og:image:width`);
  assert.equal(m.get('og:image:height'), '630', `${where}: og:image:height`);
  assert.equal(m.get('twitter:image'), m.get('og:image'), `${where}: twitter:image matches og:image`);
}

test('index.html has every link-preview tag in its static <head>', () => {
  const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
  const m = metaMap(html);
  assertCompleteTags(m, 'public/index.html');
  // One of each, so crawlers can't pick a stale duplicate.
  const counts = {};
  for (const [k] of headMeta(html)) counts[k] = (counts[k] || 0) + 1;
  for (const k of REQUIRED) assert.equal(counts[k], 1, `exactly one ${k}`);
  // Server mode keeps relative URLs; the static build makes them absolute.
  for (const k of ['og:url', 'og:image', 'twitter:image']) assert.doesNotMatch(m.get(k), /^[a-z]+:/i, `${k} is relative in public/index.html`);
  const img = m.get('og:image').replace(/^\.?\//, '');
  assert.ok(fs.existsSync(path.join(PUBLIC, img)), `og:image ${img} exists under public/`);
  assert.ok(m.get('og:title').length <= 90, 'og:title short enough not to be truncated');
  assert.ok(m.get('og:description').length <= 200, 'og:description is a sentence or two');
});

test('share card is a 1200x630 PNG under 5 MB (LinkedIn limits)', () => {
  const buf = fs.readFileSync(CARD);
  const { width, height } = pngSize(buf);
  assert.equal(width, 1200);
  assert.equal(height, 630);
  const ratio = width / height;
  assert.ok(ratio > 1.88 && ratio < 1.93, `aspect ratio ~1.91:1 (got ${ratio.toFixed(3)})`);
  assert.ok(buf.length < 5 * 1024 * 1024, `under 5 MB (got ${buf.length} bytes)`);
  const m = metaMap(fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8'));
  assert.equal(Number(m.get('og:image:width')), width, 'og:image:width matches the file');
  assert.equal(Number(m.get('og:image:height')), height, 'og:image:height matches the file');
  assert.ok(fs.existsSync(path.join(PUBLIC, 'og', 'card.html')), 'card source (og/card.html) is committed next to it');
});

test('server mode serves the card as image/png and the page with its tags', async () => {
  process.env.MELON_CACHE_DIR = path.join(tmp, 'server-cache');
  process.env.MELON_SNAPSHOT_DIR = path.join(tmp, 'server-snapshots');
  process.env.MELON_HISTORY_DIR = path.join(tmp, 'server-history');
  const { createServer } = await import('../server/index.js');
  const server = createServer({ log: false });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const img = await fetch(`${base}/og/melon-seek-og.png`);
    assert.equal(img.status, 200);
    assert.equal(img.headers.get('content-type'), 'image/png');
    assert.ok(Buffer.from(await img.arrayBuffer()).equals(fs.readFileSync(CARD)), 'served bytes match the file');
    const page = await fetch(`${base}/`);
    assert.equal(page.status, 200);
    const m = metaMap(await page.text());
    assertCompleteTags(m, 'GET /');
  } finally {
    await new Promise((r) => server.close(r));
  }
});

/* ------------------------------------------------------------ static build */

// A small real-looking snapshot for one company; the rest fall back to demo.
const job = (n, title, min, max) => ({
  id: `anthropic:${n}`, company: 'anthropic', companyName: 'Anthropic', title,
  department: 'Research', team: null, employmentType: 'Full-time', seniority: 'Senior',
  locations: [{ name: 'San Francisco, CA', city: 'San Francisco', region: 'CA', country: 'US', lat: 37.77, lng: -122.42 }],
  remote: false,
  salary: min == null ? null : { min, max, mid: (min + max) / 2, currency: 'USD', interval: 'year', text: `$${min}-$${max}` },
  url: `https://example.com/jobs/${n}`, updatedAt: '2026-10-01T00:00:00.000Z',
  descriptionHtml: `<p>${title}</p>`, sections: { responsibilities: [], fit: [] },
  keywords: { responsibilities: [], fit: [], skills: [] },
});
const SNAP_DIR = path.join(tmp, 'snapshots');
fs.mkdirSync(SNAP_DIR, { recursive: true });
fs.writeFileSync(path.join(SNAP_DIR, 'anthropic.json'), JSON.stringify({
  fetchedAt: '2026-10-01T12:00:00.000Z',
  jobs: [job(1, 'Research Engineer', 120000, 180000), job(2, 'Research Scientist', 200000, 300000), job(3, 'Staff Engineer', 350000, 450000), job(4, 'Recruiter', null, null)],
}));

const run = promisify(execFile);
async function build(name, siteUrl) {
  const out = path.join(tmp, name);
  const env = { ...process.env, MELON_SNAPSHOT_DIR: SNAP_DIR, MELON_HISTORY_DIR: path.join(SNAP_DIR, '..', 'og-history') };
  delete env.SITE_URL;
  if (siteUrl !== undefined) env.SITE_URL = siteUrl;
  await run(process.execPath, [path.join(ROOT, 'scripts', 'build-static.js'), '--out', out], { cwd: ROOT, env, maxBuffer: 16 * 1024 * 1024 });
  return out;
}
// Both builds run at once; each test awaits its own (the no-op catch only
// stops an early failure from being reported as an unhandled rejection).
const builds = {
  dflt: build('dist-default'),
  custom: build('dist-custom', 'https://example.org/jobs'),
};
for (const p of Object.values(builds)) p.catch(() => {});
const read = (dir, ...p) => fs.readFileSync(path.join(dir, ...p), 'utf8');
function htmlFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...htmlFiles(p));
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

test('static build: absolute og URLs with the default SITE_URL, card bundled', async () => {
  const out = await builds.dflt;
  const m = metaMap(read(out, 'index.html'));
  assertCompleteTags(m, 'dist/index.html');
  assert.equal(m.get('og:url'), DEFAULT_SITE);
  assert.equal(m.get('og:image'), `${DEFAULT_SITE}og/melon-seek-og.png`);
  assert.equal(m.get('twitter:image'), `${DEFAULT_SITE}og/melon-seek-og.png`);
  assert.ok(fs.readFileSync(path.join(out, 'og', 'melon-seek-og.png')).equals(fs.readFileSync(CARD)), 'dist/og/melon-seek-og.png copied');
  assert.ok(!fs.existsSync(path.join(out, 'og', 'card.html')), 'card source is not published');
  // No page in the bundle is left with a relative or http social URL.
  for (const f of htmlFiles(out)) {
    for (const [k, v] of headMeta(read(f))) {
      if (['og:url', 'og:image', 'twitter:image'].includes(k)) assert.match(v, /^https:\/\//, `${path.relative(out, f)}: ${k}=${v}`);
    }
  }
});

test('static build: per-company share pages', async () => {
  const out = await builds.dflt;
  const html = read(out, 'c', 'anthropic', 'index.html');
  const m = metaMap(html);
  assertCompleteTags(m, 'dist/c/anthropic/index.html');
  // 4 roles; median of 150K, 250K, 400K midpoints.
  assert.equal(m.get('og:title'), 'Anthropic jobs by salary · 4 roles · median $250K');
  assert.equal(m.get('twitter:title'), m.get('og:title'));
  assert.match(m.get('og:description'), /3 of 4 roles list pay/);
  assert.match(m.get('og:description'), /1 Oct 2026/);
  assert.equal(m.get('og:url'), `${DEFAULT_SITE}c/anthropic/`, 'og:url is the share page itself, not the app');
  assert.equal(m.get('og:image'), `${DEFAULT_SITE}og/melon-seek-og.png`);
  assert.match(html, /location\.replace\("\.\.\/\.\.\/#c=anthropic"/, 'script sends people to the app with the company preselected');
  assert.match(html, /<a href="\.\.\/\.\.\/#c=anthropic">/, 'no-JS fallback link');
  assert.doesNotMatch(html, /http-equiv\s*=\s*["']?refresh/i, 'no meta refresh (crawlers would follow it away from these tags)');
  // Demo data never puts pay figures in a preview.
  const demo = metaMap(read(out, 'c', 'anduril', 'index.html'));
  assert.equal(demo.get('og:title'), 'Anduril jobs by salary');
  assert.doesNotMatch(demo.get('og:description'), /\$|median/);
});

test('static build honours SITE_URL (no trailing slash, other host)', async () => {
  const out = await builds.custom;
  const m = metaMap(read(out, 'index.html'));
  assert.equal(m.get('og:url'), 'https://example.org/jobs/');
  assert.equal(m.get('og:image'), 'https://example.org/jobs/og/melon-seek-og.png');
  assert.equal(m.get('twitter:image'), 'https://example.org/jobs/og/melon-seek-og.png');
  const c = metaMap(read(out, 'c', 'anthropic', 'index.html'));
  assert.equal(c.get('og:url'), 'https://example.org/jobs/c/anthropic/');
  assert.equal(c.get('og:image'), 'https://example.org/jobs/og/melon-seek-og.png');
});
