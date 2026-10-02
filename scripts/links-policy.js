// Site link policy: users must never be sent off the site except to an
// allowlisted host, and never to GitHub. Shared by scripts/build-static.js (the
// build fails on any violation) and test/links-policy.test.js.
//
// What counts as a link:
//   HTML: href / src / action / formaction attributes (not <meta content>).
//   JS (comments stripped): string literals used as href/src (`href: '…'`,
//        `.href = '…'`, `href="…"` in templates), window.open('…'),
//        location.assign/replace/href = '…'.
// Rules:
//   1. Absolute http(s) links: host must be in ALLOWED_HOSTS or be the site
//      itself (SITE_URL prefix).
//   2. github.com, raw.githubusercontent.com and the repo URL are banned in any
//      link; the repo URL is banned anywhere in shipped code.
//   3. dist only: every relative link (HTML attributes, and directory-style
//      page links in JS such as 'methodology/#1-the-formula') must resolve to a
//      file in dist, and its #anchor must exist in the target page.
import fs from 'node:fs';
import path from 'node:path';

export const ALLOWED_HOSTS = Object.freeze([
  // ATS job pages (each posting's url, "Apply" links)
  'job-boards.greenhouse.io', 'boards.greenhouse.io', 'jobs.ashbyhq.com', 'jobs.lever.co',
  // Map attribution
  'www.openstreetmap.org', 'openstreetmap.org',
  // Google Fonts (stylesheet + preconnect)
  'fonts.googleapis.com', 'fonts.gstatic.com',
]);
// IANA-reserved example domains (RFC 2606): used by dev mocks/demo data; they
// can never be a real third-party site.
export const RESERVED_HOSTS = Object.freeze(['example.com', 'www.example.com', 'example.org', 'example.net']);
export const BANNED_HOSTS = Object.freeze(['github.com', 'www.github.com', 'raw.githubusercontent.com', 'gist.github.com']);
export const REPO_RE = /github\.com\/alvations\/melon-seek/i;

const stripJsComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

/** Links in one file: [{ url, line, kind: 'abs'|'rel'|'page' }]. */
export function extractLinks(file, text) {
  const out = [];
  const lineOf = (i) => text.slice(0, i).split('\n').length;
  if (file.endsWith('.html')) {
    for (const m of text.matchAll(/\s(?:href|src|action|formaction)\s*=\s*(["'])(.*?)\1/gi)) out.push({ url: m[2], line: lineOf(m.index) });
  } else if (file.endsWith('.js')) {
    const code = stripJsComments(text);
    const pats = [
      /\b(?:href|src)\s*[:=]\s*(["'`])([^"'`]*?)\1/g,
      /\bwindow\.open\(\s*(["'`])([^"'`]*?)\1/g,
      /\blocation\.(?:assign|replace)\(\s*(["'`])([^"'`]*?)\1/g,
      /\blocation\.href\s*=\s*(["'`])([^"'`]*?)\1/g,
    ];
    for (const re of pats) for (const m of code.matchAll(re)) out.push({ url: m[2], line: null });
    // Directory-style page links in string constants, e.g. 'methodology/#1-the-formula'.
    for (const m of code.matchAll(/(["'`])((?:\.{1,2}\/)*[a-z0-9][a-z0-9_-]*\/(?:[a-z0-9_-]+\/)*(?:index\.html)?(?:#[\w-]+)?)\1/gi)) {
      out.push({ url: m[2], line: null, page: true });
    }
  }
  return out.map((l) => ({ ...l, kind: /^https?:\/\//i.test(l.url) || l.url.startsWith('//') ? 'abs' : 'rel' }));
}

function hostOf(url) {
  try { return new URL(url.startsWith('//') ? `https:${url}` : url).host.toLowerCase(); } catch { return null; }
}

/** Policy violations for one file's text (rules 1-2). */
export function checkText(file, text, { siteUrl = 'https://alvations.github.io/melon-seek/' } = {}) {
  const v = [];
  const scan = file.endsWith('.js') ? stripJsComments(text) : text;
  if (REPO_RE.test(scan)) v.push(`${file}: references the GitHub repo (${REPO_RE.source})`);
  for (const l of extractLinks(file, text)) {
    if (l.kind !== 'abs') continue;
    const host = hostOf(l.url);
    const where = `${file}${l.line ? `:${l.line}` : ''}`;
    if (!host) { v.push(`${where}: unparseable link ${l.url}`); continue; }
    if (BANNED_HOSTS.includes(host)) { v.push(`${where}: link to ${host} (${l.url})`); continue; }
    if (siteUrl && l.url.startsWith(siteUrl)) continue;
    if (!ALLOWED_HOSTS.includes(host) && !RESERVED_HOSTS.includes(host) && !/\$\{/.test(l.url)) v.push(`${where}: link to non-allowlisted host ${host} (${l.url})`);
  }
  return v;
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

const SKIP_DIST = /^(vendor|api\/desc)\//;

/** Files the policy covers under a root (public/ or dist/). */
export function policyFiles(root) {
  return walk(root).filter((f) => /\.(js|html)$/.test(f) && !SKIP_DIST.test(path.relative(root, f).split(path.sep).join('/')));
}

const idCache = new Map();
function idsIn(file) {
  if (!idCache.has(file)) idCache.set(file, new Set([...fs.readFileSync(file, 'utf8').matchAll(/\sid\s*=\s*["']([^"']+)["']/g)].map((m) => m[1])));
  return idCache.get(file);
}

/** Rule 3 for a built dist: relative links resolve, anchors exist. */
export function checkRelative(dist, file, text) {
  const v = [];
  const relFile = path.relative(dist, file).split(path.sep).join('/');
  // JS page constants resolve against the document (index.html at the root), HTML against the page.
  const baseDir = file.endsWith('.js') ? dist : path.dirname(file);
  for (const l of extractLinks(file, text)) {
    if (l.kind !== 'rel' || !l.url || /^(data|mailto|tel|blob|javascript):/i.test(l.url) || /\$\{/.test(l.url)) continue;
    if (file.endsWith('.js') && !l.page) continue; // only page-style constants in JS
    const [pathPart, hash] = l.url.split('#');
    const clean = pathPart.split('?')[0];
    let target = clean ? path.resolve(clean.startsWith('/') ? dist : baseDir, '.' + (clean.startsWith('/') ? clean : `/${clean}`)) : file;
    if (!target.startsWith(dist)) { v.push(`${relFile}: link ${l.url} escapes the site`); continue; }
    if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');
    if (!fs.existsSync(target)) { v.push(`${relFile}: broken relative link ${l.url}`); continue; }
    if (hash && target.endsWith('.html') && !idsIn(target).has(hash) && !/^[a-z]=/.test(hash) && !hash.includes('=')) {
      v.push(`${relFile}: link ${l.url}: no id="${hash}" in ${path.relative(dist, target)}`);
    }
  }
  return v;
}

/** Every violation in a built dist (rules 1-3). */
export function checkDist(dist, opts = {}) {
  idCache.clear();
  const v = [];
  for (const f of policyFiles(dist)) {
    const text = fs.readFileSync(f, 'utf8');
    const rel = path.relative(dist, f).split(path.sep).join('/');
    v.push(...checkText(rel, text, opts), ...checkRelative(dist, f, text));
  }
  return v;
}
