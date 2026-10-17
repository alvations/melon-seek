// fix-sec-3 lane (docs/process/fix-sec-3.md): tests for the security fixes beyond the to-dos un-todo'd in
// test/beta-security-review.test.js and test/beta-security-review-2.test.js. Each block names its finding in
// docs/REVIEW.md. Equivalence checks run the new code against a frozen copy of the old one, on the real fixtures,
// so a fix that bounds a parser cannot change what it reads from real pages.
// No network: fixtures only, and the slow-parser checks run in a worker with a hard limit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIX = path.join(ROOT, 'test', 'fixtures');
const imp = (...p) => import(pathToFileURL(path.join(ROOT, ...p)).href);
const fixture = (slug) => JSON.parse(fs.readFileSync(path.join(FIX, `bigtech-${slug}.json`), 'utf8'));

/* ------------------------------------------------------------ S-4 residual */

const BETA = ['amazon', 'apple', 'google', 'meta', 'microsoft', 'netflix', 'nvidia'];

/** Each beta fixture's raw postings, through its own adapter's mapper. */
async function betaRaws(slug) {
  const { mapEightfoldJob, EIGHTFOLD_BOARDS } = await imp('server', 'sources', 'eightfold.js');
  const { mapAmazonJob } = await imp('server', 'sources', 'amazon.js');
  const { mapAppleJob } = await imp('server', 'sources', 'apple.js');
  const { mapGoogleJob } = await imp('server', 'sources', 'google.js');
  const { mapMetaJob } = await imp('server', 'sources', 'meta.js');
  return fixture(slug).records.map((r) => {
    if (EIGHTFOLD_BOARDS[slug]) return mapEightfoldJob(r, EIGHTFOLD_BOARDS[slug]);
    if (slug === 'amazon') return mapAmazonJob(r);
    if (slug === 'apple') return mapAppleJob(r.row, r.detail);
    if (slug === 'google') return mapGoogleJob(r, {});
    return mapMetaJob(r, { id: r.id, url: `https://www.metacareers.com/profile/job_details/${r.id}/` });
  });
}

test('S-4 residual: every real beta posting link is kept exactly as its adapter built it', async () => {
  const { normalizeJob } = await imp('server', 'normalize.js');
  const { getCompany } = await imp('server', 'companies.js');
  for (const slug of BETA) {
    const raws = await betaRaws(slug);
    assert.ok(raws.length, slug);
    for (const raw of raws) {
      assert.match(raw.url, /^https:\/\//, `${slug}: ${raw.url}`);
      assert.equal(normalizeJob(raw, getCompany(slug)).url, raw.url, `${slug} ${raw.sourceId}`);
    }
  }
});

test('S-4 residual: Amazon job_path values on www.amazon.jobs are kept verbatim; anything else becomes the canonical page', async () => {
  const { amazonPostingUrl, mapAmazonJob } = await imp('server', 'sources', 'amazon.js');
  for (const r of fixture('amazon').records) {
    // The old code joined origin and job_path with no check: for real rows the new result is identical.
    assert.equal(mapAmazonJob(r).url, r.job_path ? `https://www.amazon.jobs${r.job_path}` : `https://www.amazon.jobs/en/jobs/${r.id_icims}`);
  }
  for (const p of ['@evil.example/x', '.evil.example/x', ':8443/x', "javascript:alert('x')", 'x@evil.example/']) {
    assert.equal(amazonPostingUrl({ id_icims: '3012345', job_path: p }), 'https://www.amazon.jobs/en/jobs/3012345', p);
  }
  assert.equal(amazonPostingUrl({ id_icims: '3012345', job_path: null }), 'https://www.amazon.jobs/en/jobs/3012345');
  assert.equal(amazonPostingUrl({ id_icims: '1', job_path: '/en/jobs/1/sde-ii' }), 'https://www.amazon.jobs/en/jobs/1/sde-ii');
});

test('S-4 residual: a beta built-in keeps only https links on its own posting hosts; stable and custom boards keep any http(s) link', async () => {
  const { postingUrl } = await imp('server', 'normalize.js');
  const { getCompany } = await imp('server', 'companies.js');
  const drop = {
    amazon: ['https://www.amazon.jobs@evil.example/x', 'https://evil.example/en/jobs/1', 'http://www.amazon.jobs/en/jobs/1', 'https://www.amazon.jobs:8443/en/jobs/1', 'https://user:pw@www.amazon.jobs/en/jobs/1', 'https://jobs.apple.com/en-us/details/1'],
    google: ['https://www.google.com/search?q=x', 'https://www.google.com/about/careers/../../url?q=https://evil.example', 'https://careers.google.com.evil.example/jobs/1', 'https://www.google.com.evil.example/about/careers/x'],
    apple: ['https://jobs.apple.com.evil.example/x', 'https://www.apple.com/x'],
    meta: ['https://www.facebook.com/careers/1', 'https://metacareers.com.evil.example/'],
    microsoft: ['https://explore.jobs.netflix.net/careers/job/1'],
    netflix: ['https://apply.careers.microsoft.com/careers/job/1'],
    nvidia: ['https://evil.myworkdayjobs.com/x'],
  };
  const keep = {
    amazon: ['https://www.amazon.jobs/en/jobs/3012345/software-dev-engineer'],
    google: ['https://www.google.com/about/careers/applications/jobs/results/123-x', 'https://careers.google.com/jobs/results/123/'],
    apple: ['https://jobs.apple.com/en-us/details/200612345/x'],
    meta: ['https://www.metacareers.com/profile/job_details/1234567/'],
    microsoft: ['https://apply.careers.microsoft.com/careers/job/1970393556632811'],
    netflix: ['https://explore.jobs.netflix.net/careers/job/790300000001'],
    nvidia: ['https://jobs.nvidia.com/careers/job/893375056870', 'https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite/job/x'],
  };
  for (const slug of BETA) {
    const c = getCompany(slug);
    for (const u of drop[slug]) assert.equal(postingUrl(u, c), null, `${slug} kept ${u}`);
    for (const u of keep[slug]) assert.equal(postingUrl(u, c), u, `${slug} dropped ${u}`);
  }
  // Stable built-ins and custom boards: any absolute http(s) link, as before.
  for (const c of [getCompany('anthropic'), { slug: 'greenhouse-amazon', name: 'Amazon', source: 'greenhouse', board: 'amazon', custom: true }]) {
    for (const u of ['https://job-boards.greenhouse.io/x/jobs/1', 'http://example.com/x']) assert.equal(postingUrl(u, c), u, `${c.slug} ${u}`);
    assert.equal(postingUrl("javascript:alert('x')", c), null);
  }
  assert.equal(postingUrl('https://evil.example/x'), 'https://evil.example/x', 'no company: the old scheme-only rule');
});

test('S-4 residual: scripts/links-policy.js keeps the same posting allowlist, now built from the registry entries', async () => {
  const policy = await imp('scripts', 'links-policy.js');
  const { postingRule } = await imp('server', 'companies.js');
  // The literal lists links-policy.js had before the move (f53a270).
  assert.deepEqual([...policy.BETA_POSTING_HOSTS], [
    'careers.google.com', 'apply.careers.microsoft.com', 'jobs.careers.microsoft.com', 'careers.microsoft.com', 'www.metacareers.com',
    'jobs.apple.com', 'explore.jobs.netflix.net', 'jobs.netflix.com', 'www.amazon.jobs', 'jobs.nvidia.com', 'nvidia.wd5.myworkdayjobs.com',
  ]);
  assert.deepEqual([...policy.BETA_POSTING_PREFIXES], ['https://www.google.com/about/careers/']);
  const { listCompanies } = await imp('server', 'companies.js');
  for (const c of listCompanies({ channel: 'beta', includePaused: true })) {
    const rule = postingRule(c);
    if (c.channel === 'beta') assert.ok(rule && rule.hosts.length, `${c.slug}: no posting hosts`);
    else assert.equal(rule, null, `${c.slug}: a stable board keeps any http(s) link`);
    // The rule is looked up by slug, so a caller's partial copy (no postingHosts field) still gets it.
    if (c.channel === 'beta') assert.deepEqual(postingRule({ slug: c.slug, name: c.name }), rule);
  }
  assert.equal(postingRule({ slug: 'amazon', custom: true }), null, 'never for a custom board');
});

/* ------------------------------------------------------------------ S-10 */

/** Run `body` (a function source taking no args) in a worker; resolve its ms, or reject after limitMs. */
function timedInWorker(body, limitMs) {
  const src = `const { parentPort } = require('node:worker_threads');
(async () => { const t0 = performance.now(); await (${body})(); parentPort.postMessage(performance.now() - t0); })()
  .catch((e) => parentPort.postMessage('error: ' + e.message));`;
  return new Promise((resolve, reject) => {
    const w = new Worker(src, { eval: true });
    const timer = setTimeout(() => { w.terminate(); reject(new Error(`still running after ${limitMs} ms`)); }, limitMs);
    w.once('message', (m) => { clearTimeout(timer); w.terminate(); typeof m === 'number' ? resolve(m) : reject(new Error(m)); });
    w.once('error', (e) => { clearTimeout(timer); reject(e); });
  });
}
const url = (...p) => JSON.stringify(pathToFileURL(path.join(ROOT, ...p)).href);
const LIMIT = 2000; // linear code does each of these in a few ms; before the fix they took 1 to 60 s

// More hostile shapes than the review's own tests (test/beta-security-review-2.test.js "S-10"): every way the old
// regexes backtracked, each 64-256 KB.
test('S-10: the Meta parsers stay linear on every unclosed-tag shape (256 KB each under 2 s)', async () => {
  const ms = await timedInWorker(`async () => {
    const m = await import(${url('server', 'sources', 'meta.js')});
    const n = 262144;
    m.parseMetaAmount('$' + ' '.repeat(n)); m.parseMetaAmount(' '.repeat(n) + '$' + ' '.repeat(n) + '1');
    m.parseMetaSitemap('<loc>' + 'a'.repeat(n)); m.parseMetaSitemap('<loc>a '.repeat(n / 7)); m.parseMetaSitemap('<url><loc>' + ' '.repeat(n));
    m.extractMetaPage('<script type="application/ld+json">'.repeat(n / 35), '1');
    m.extractMetaPage('<script '.repeat(n / 8) + '>', '1');
    m.extractMetaPage('<script type="application/ld+json">{}</script>'.repeat(n / 46), '1');
  }`, LIMIT * 2);
  assert.ok(ms < LIMIT * 2, `${Math.round(ms)} ms`);
});

test('S-10: familyOfTitle reads at most 500 characters of a title, whatever brackets it holds', async () => {
  const ms = await timedInWorker(`async () => {
    const f = await import(${url('server', 'families.js')});
    f.familyOfTitle('（'.repeat(65536)); f.familyOfTitle('(a'.repeat(32768) + ')'); f.familyOfTitle('Software Engineer, ' + 'x'.repeat(262144));
  }`, LIMIT);
  assert.ok(ms < LIMIT, `${Math.round(ms)} ms`);
  const { familyOfTitle } = await imp('server', 'families.js');
  assert.equal(familyOfTitle(`Software Engineer, ${'x '.repeat(400)}`), familyOfTitle('Software Engineer, x'));
});

test('S-10: the DOL tools (xlsx reader, employer names) stay linear on hostile XML and names (64 KB under 2 s)', async () => {
  const ms = await timedInWorker(`async () => {
    const x = await import(${url('scripts', 'alt-data', 'xlsx.js')});
    const e = await import(${url('scripts', 'alt-data', 'employers.js')});
    const n = 65536;
    x.rowCells('<c'.repeat(n / 2)); x.rowCells('<c>'.repeat(n / 3)); x.rowCells('<c '.repeat(n / 3) + '>'); x.rowCells('<c r="A1">' + '<v>'.repeat(n / 3) + '</c>');
    x.rowCells('<c t="inlineStr"><is>' + '<t>'.repeat(n / 3) + '</is></c>');
    x.richText('<t>'.repeat(n / 3)); x.richText('<t '.repeat(n / 3)); x.richText('<t '.repeat(n / 3) + '>'); x.richText('<rPh'.repeat(n / 4)); x.richText('<rPh>' + '<t>a'.repeat(n / 4));
    e.normalizeEmployer('INC '.repeat(n / 4)); e.normalizeEmployer('A'.repeat(n) + ' LLC'.repeat(n / 4));
  }`, LIMIT);
  assert.ok(ms < LIMIT, `${Math.round(ms)} ms`);
});

/* Frozen copies of the parsers as they were at f53a270, for the equivalence checks below. */
const OLD = {
  parseMetaAmount(s) {
    const m = /^\s*([A-Z]{3}\s?|[A-Z]{0,2}\$|£|€|¥|₹|₪)?\s*([\d,]+(?:\.\d+)?)\s*([A-Z]{3})?\s*(?:\/|per\s+)?\s*(year|yr|hour|hr|month|week|day)?/i.exec(String(s || ''));
    if (!m) return null;
    const value = Number(m[2].replace(/,/g, ''));
    if (!Number.isFinite(value) || value <= 0) return null;
    const iv = String(m[4] || 'year').toLowerCase();
    return { value, symbol: (m[1] || m[3] || '').trim(), interval: /^h/.test(iv) ? 'hour' : /^mo/.test(iv) ? 'month' : /^w/.test(iv) ? 'week' : /^d/.test(iv) ? 'day' : 'year' };
  },
  sitemapBlocks(text) { return /<url>/.test(text) ? text.split(/<url>/).slice(1) : [...text.matchAll(/<loc>[\s\S]*?<\/loc>/g)].map((m) => m[0]); },
  jsonLd(html) {
    const out = [];
    for (const m of String(html).matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
      try { const v = JSON.parse(m[1]); for (const x of Array.isArray(v) ? v : [v]) if (x && x['@type'] === 'JobPosting') out.push(x); } catch {}
    }
    return out;
  },
  richText(body) {
    const b = String(body).replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
    const runs = [];
    for (const m of b.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g)) runs.push(m[1] || '');
    return runs;
  },
  cells(rowXml) {
    return [...rowXml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)].map((m) => [m[1], m[2] ?? null]);
  },
  normalizeEmployer(name) {
    let s = String(name || '').toUpperCase().replace(/&/g, ' AND ').replace(/[^A-Z0-9]+/g, ' ').trim();
    s = s.replace(/\bU S\b/g, 'US');
    for (let prev = null; prev !== s;) { prev = s; s = s.replace(/\s+(?:INC|INCORPORATED|LLC|L L C|CORP|CORPORATION|CO|COMPANY|LTD|LIMITED|LP|LLP|PLLC|PC|NA)$/, '').trim(); }
    return s;
  },
};

/** A seeded generator of strings made of `tokens` (mulberry32), for the old-versus-new checks. */
function* fuzz(tokens, n, maxLen, seed = 20261017) {
  let a = seed >>> 0;
  const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (let k = 0; k < n; k++) {
    let s = '';
    const len = 1 + Math.floor(rnd() * maxLen);
    for (let i = 0; i < len; i++) s += tokens[Math.floor(rnd() * tokens.length)];
    yield s;
  }
}

test('S-10: parseMetaAmount reads every real and sample amount exactly as before', async () => {
  const { parseMetaAmount } = await imp('server', 'sources', 'meta.js');
  const amounts = new Set(['$173,000/year', ' $173,000/year ', '£95,000 per year', 'USD 50/hour', 'CA$120,000', '€80.000', '₹ 2,500,000', 'S$ 120000/yr', '$85.50/hr', '173000 USD', 'GBP 60,000 per month', '$1,000 / week', 'A$ 90 per day', '', 'n/a', '$0', '¥8,000,000']);
  for (const p of fixture('meta').records) for (const c of p.public_compensation) for (const v of Object.values(c)) if (typeof v === 'string' && v) amounts.add(v);
  for (const s of fuzz(['$', '£', 'USD', ' ', '1', '73', ',', '000', '.', '50', '/', 'year', 'hr', 'per ', 'EUR', '\n'], 3000, 12)) amounts.add(s);
  for (const s of [...amounts, null, undefined]) assert.deepEqual(parseMetaAmount(s), OLD.parseMetaAmount(s), JSON.stringify(s));
});

test('S-10: the Meta sitemap and JSON-LD readers find exactly what the old regexes found', async () => {
  const { parseMetaSitemap, metaJsonLd, extractMetaPage, META_ORIGIN } = await imp('server', 'sources', 'meta.js');
  const oldSitemap = (xml) => {
    const out = []; const seen = new Set();
    for (const b of OLD.sitemapBlocks(String(xml || ''))) {
      const loc = /<loc>\s*([^<\s]+)\s*<\/loc>/.exec(b);
      const u = loc && /\/(?:profile\/job_details|jobs)\/(\d{6,})/.exec(loc[1]);
      if (!u || seen.has(u[1])) continue;
      seen.add(u[1]);
      const lm = /<lastmod>\s*([^<\s]+)\s*<\/lastmod>/.exec(b);
      out.push({ id: u[1], url: `${META_ORIGIN}/profile/job_details/${u[1]}/`, ...(lm ? { lastmod: lm[1] } : {}) });
    }
    return out;
  };
  const ids = fixture('meta').records.map((p) => p.id);
  const real = [
    `<urlset>${ids.map((id) => `<url><loc>https://www.metacareers.com/profile/job_details/${id}/</loc><lastmod>2026-10-10</lastmod></url>`).join('')}</urlset>`,
    ids.map((id) => `<loc>\n  https://www.metacareers.com/jobs/${id}/\n</loc>`).join('\n'),
  ];
  for (const s of [...real, ...fuzz(['<loc>', '</loc>', 'https://www.metacareers.com/jobs/1234567/', '/profile/job_details/7654321/', ' ', '\n', '<url>', '<lastmod>', '</lastmod>', '2026-10-10', '<', 'x'], 3000, 14)]) {
    assert.deepEqual(parseMetaSitemap(s), oldSitemap(s), JSON.stringify(s));
  }
  assert.equal(parseMetaSitemap(real[1]).length, ids.length);
  // JSON-LD: the fixture's pages as metacareers.com sends them (test/bigtech-sources.test.js metaPage), then shuffled tags.
  const page = (p) => `<html><head><script type="application/ld+json" nonce="x">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'JobPosting', title: p.ld.title, description: p.ld.description, datePosted: p.ld.datePosted })}</script></head><body><script>require(["x"])</script></body></html>`;
  for (const p of fixture('meta').records) {
    const html = page(p);
    assert.deepEqual(metaJsonLd(html), OLD.jsonLd(html));
    assert.equal(extractMetaPage(html, p.id).title, p.ld.title);
  }
  const LD = '{"@type":"JobPosting","title":"x"}';
  for (const s of fuzz(['<script', ' ', 'type="application/ld+json"', '>', '</script>', LD, `[${LD}]`, 'x', '<scripts', '\n', 'nonce="a"', '<'], 4000, 14)) {
    assert.deepEqual(metaJsonLd(s), OLD.jsonLd(s), JSON.stringify(s));
  }
});

test('S-10: familyOfTitle gives every real Google title the same family as before', async () => {
  const { familyOfTitle } = await imp('server', 'families.js');
  // The old module is this one with the two S-10 lines reverted (families.js has no imports, so it loads from a data: URL).
  const src = fs.readFileSync(path.join(ROOT, 'server', 'families.js'), 'utf8');
  const oldSrc = src.replace("String(title || '').slice(0, 500)", "String(title || '')").replace('/[（(][^（(）)]{0,200}[）)]/g', '/[（(][^）)]*[）)]/g');
  assert.ok(!oldSrc.includes('.slice(0, 500)') && oldSrc.includes('/[（(][^）)]*[）)]/g'), 'the S-10 lines were found and reverted');
  const old = await import(`data:text/javascript;base64,${Buffer.from(oldSrc).toString('base64')}`);
  const titles = [...JSON.parse(fs.readFileSync(path.join(FIX, 'google-families-sample.json'), 'utf8')).rows.map((r) => r.title), ...fixture('google').records.map((r) => r.title)];
  assert.ok(titles.length > 300);
  // Brackets as real titles have them: a pair at a time, never nested (0 of the 37,619 titles crawled on 2026-10-16 nest them).
  for (const t of fuzz(['Software Engineer', 'Manager', ', ', ' - ', ' (L5)', ' (Remote)', '（东京）', ' YouTube', 'Data Center Technician', 'Trust and Safety', 'Sales', ' | ', 'Ingeniero', 'Analyst'], 2000, 8)) titles.push(t);
  for (const t of titles) assert.equal(familyOfTitle(t), old.familyOfTitle(t), t);
});

test('S-10: the DOL xlsx reader reads the real LCA rows and every cell shape exactly as before', async () => {
  const x = await imp('scripts', 'alt-data', 'xlsx.js');
  const oldRich = (body) => OLD.richText(body).map((t) => (t ? x.xmlText(t) : '')).join('');
  const oldRowCells = (rowXml) => {
    const cells = new Map(); let next = 0;
    for (const [attrs, b] of OLD.cells(rowXml)) {
      const attr = (name) => { const m = new RegExp(`\\b${name}="([^"]*)"`).exec(attrs); return m ? m[1] : null; };
      const ref = attr('r'); const col = ref ? x.colIndex(ref) : next; next = col + 1;
      const t = attr('t') || 'n'; const body = b || ''; let v = null;
      if (t === 'inlineStr') v = oldRich((/<is>([\s\S]*?)<\/is>/.exec(body) || [])[1] || '');
      else { const vm = /<v>([\s\S]*?)<\/v>/.exec(body); v = vm ? x.xmlText(vm[1]) : null; }
      if (v != null && v !== '') cells.set(col, { t, v });
    }
    return cells;
  };
  const rows = fs.readFileSync(path.join(FIX, 'alt-data', 'lca-fy2026-q3-rows-1-2.xml'), 'utf8').match(/<row\b[\s\S]*?<\/row>/g);
  assert.equal(rows.length, 2);
  for (const r of rows) assert.deepEqual([...x.rowCells(r)], [...oldRowCells(r)]);
  assert.equal(x.rowCells(rows[0]).size, 98, 'the 98 header cells');
  for (const s of fuzz(['<c', '<c ', '<c r="B2"', ' t="inlineStr"', ' t="s"', '>', '/>', '</c>', '<v>', '</v>', '1', 'x', ' ', '<is>', '</is>', '<t>', '</t>', '<t ', '<t/>', '<rPh>', '</rPh>', '<rPhx', '"', '<col', '&amp;'], 5000, 16)) {
    assert.deepEqual(x.cellElements(s).map((c) => [c.attrs, c.body]), OLD.cells(s), JSON.stringify(s));
    assert.deepEqual([...x.rowCells(s)], [...oldRowCells(s)], JSON.stringify(s));
    assert.equal(x.richText(s), oldRich(s), JSON.stringify(s));
  }
});

test('S-10: normalizeEmployer gives every real employer name the same key as before', async () => {
  const { normalizeEmployer, ENTITIES } = await imp('scripts', 'alt-data', 'employers.js');
  const names = ['Amazon.com Services LLC', 'AMAZON.COM SERVICES, L.L.C.', 'Amazon Development Center U.S., Inc.', 'Meta Platforms, Inc.', '  meta platforms technologies, llc ', 'Amazon Web Services, Inc', 'AMAZON & CO INC', 'Facebook, Inc. (now Meta Platforms, Inc.)', ...ENTITIES.map((e) => e[1])];
  for (const s of fuzz(['AMAZON', 'Meta', ' ', '.', ',', 'INC', 'LLC', 'L L C', 'CO', 'U.S.', '&', 'SERVICES', 'Platforms', '-'], 2000, 10)) names.push(s);
  for (const n of names) assert.equal(normalizeEmployer(n), OLD.normalizeEmployer(n), n);
});
