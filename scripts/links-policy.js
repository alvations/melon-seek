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
//   1. Absolute http(s) links: host must be in ALLOWED_HOSTS, or the URL must
//      start with an ALLOWED_PREFIXES entry (a careers section of a shared
//      host, such as www.google.com/about/careers/), or be the site itself
//      (SITE_URL prefix).
//   2. github.com, raw.githubusercontent.com and the repo URL are banned in any
//      link; the repo URL is banned anywhere in shipped code.
//   3. dist only: every relative link (HTML attributes, and directory-style
//      page links in JS such as 'methodology/#1-the-formula') must resolve to a
//      file in dist, and its #anchor must exist in the target page.
//   4. dist only (checkMethodology): where the technical reference is built
//      (methodology/reference/, docs/LIVABILITY.md), methodology/ (the guide) exists
//      and carries every one of the reference's heading ids, so an old link such as
//      methodology/#3-tax-model or #score-curve-and-grades still lands on the guide
//      (scripts/methodology.js gives each one a home there).
import fs from 'node:fs';
import path from 'node:path';

// Big-tech career sites (beta channel only, docs/CONTRACT.md "v3 additions"): the
// posting pages ("Apply" links) of the beta companies, as the adapters in
// server/sources/ build them (docs/DATA_SOURCES.md §7). Hosts that only serve careers
// are allowed whole; a shared host only under its careers path (BETA_POSTING_PREFIXES).
// Tesla is not listed: its site blocks plain requests, so it is not on the beta site.
// The stable site never links to any of them (scripts/build-static.js#betaLeaks).
export const BETA_POSTING_HOSTS = Object.freeze([
  'careers.google.com', // Google's former careers host (postings: BETA_POSTING_PREFIXES)
  'apply.careers.microsoft.com', 'jobs.careers.microsoft.com', 'careers.microsoft.com', // Microsoft (Eightfold)
  'www.metacareers.com', // Meta
  'jobs.apple.com', // Apple
  'explore.jobs.netflix.net', 'jobs.netflix.com', // Netflix (Eightfold)
  'www.amazon.jobs', // Amazon
  'jobs.nvidia.com', 'nvidia.wd5.myworkdayjobs.com', // NVIDIA (Eightfold; applications on Workday)
]);
export const BETA_POSTING_PREFIXES = Object.freeze([
  'https://www.google.com/about/careers/', // Google: www.google.com/about/careers/applications/jobs/results/<id>
]);

export const ALLOWED_HOSTS = Object.freeze([
  // ATS job pages (each posting's url, "Apply" links)
  'job-boards.greenhouse.io', 'boards.greenhouse.io', 'jobs.ashbyhq.com', 'jobs.lever.co',
  ...BETA_POSTING_HOSTS,
  // Map attribution
  'www.openstreetmap.org', 'openstreetmap.org',
  // No font hosts: Inter is self-hosted (public/fonts/).
]);
/** URL prefixes allowed on hosts that are not allowed whole (https only, path-scoped). */
export const ALLOWED_PREFIXES = Object.freeze([...BETA_POSTING_PREFIXES]);
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

/** Under an ALLOWED_PREFIXES entry? Compared on the parsed URL, so "…/careers/../x" or "careers.evil" can't pass. */
function underAllowedPrefix(url) {
  let u;
  try { u = new URL(url.startsWith('//') ? `https:${url}` : url); } catch { return false; }
  return ALLOWED_PREFIXES.some((p) => `${u.protocol}//${u.host.toLowerCase()}${u.pathname}`.startsWith(p));
}

/** True when an absolute link may leave the site (rule 1; GitHub is never allowed). */
export function isAllowedLink(url, { siteUrl = 'https://alvations.github.io/melon-seek/' } = {}) {
  const host = hostOf(url);
  if (!host || BANNED_HOSTS.includes(host)) return false;
  if (siteUrl && url.startsWith(siteUrl)) return true;
  return ALLOWED_HOSTS.includes(host) || RESERVED_HOSTS.includes(host) || underAllowedPrefix(url);
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
    if (!ALLOWED_HOSTS.includes(host) && !RESERVED_HOSTS.includes(host) && !underAllowedPrefix(l.url) && !/\$\{/.test(l.url)) v.push(`${where}: link to non-allowlisted host ${host} (${l.url})`);
  }
  return v;
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

// Third-party Leaflet and the job-description data; also inside the beta copy (dist/beta/).
const SKIP_DIST = /^(beta\/)?(vendor|api\/desc)\//;

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

/** Rule 4: the guide (methodology/) keeps every heading id of the reference (methodology/reference/). */
export function checkMethodology(dist) {
  const v = [];
  for (const prefix of ['', 'beta/']) {
    const ref = path.join(dist, prefix, 'methodology', 'reference', 'index.html');
    if (!fs.existsSync(ref)) continue;
    const guide = path.join(dist, prefix, 'methodology', 'index.html');
    if (!fs.existsSync(guide)) { v.push(`${prefix}methodology/index.html missing (the reference is built, the guide is not)`); continue; }
    const have = idsIn(guide);
    const headings = [...fs.readFileSync(ref, 'utf8').matchAll(/<h[1-6]\s+id\s*=\s*["']([^"']+)["']/g)].map((m) => m[1]);
    if (!headings.length) v.push(`${prefix}methodology/reference/index.html has no headings`);
    for (const id of headings) {
      if (!have.has(id)) v.push(`${prefix}methodology/index.html: no id="${id}" (old links to methodology/#${id} would break; methodology/reference/ has it)`);
    }
  }
  return v;
}

/** Every violation in a built dist (rules 1-4). */
export function checkDist(dist, opts = {}) {
  idCache.clear();
  const v = [];
  for (const f of policyFiles(dist)) {
    const text = fs.readFileSync(f, 'utf8');
    const rel = path.relative(dist, f).split(path.sep).join('/');
    v.push(...checkText(rel, text, opts), ...checkRelative(dist, f, text));
  }
  v.push(...checkMethodology(dist));
  return v;
}
