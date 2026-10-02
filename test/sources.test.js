import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchGreenhouse, greenhouseUrl } from '../server/sources/greenhouse.js';
import { fetchAshby } from '../server/sources/ashby.js';
import { fetchLever } from '../server/sources/lever.js';
import { decodeHtmlContent, htmlToText } from '../server/sources/util.js';
import { resolveCompany, listCompanies } from '../server/companies.js';
import { parseSalary, toJobSalary } from '../server/salary.js';
import * as cache from '../server/cache.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(FIX, name), 'utf8'));

const realFetch = globalThis.fetch;
let calls;
function mockFetch(handler) {
  calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), opts });
    return handler(String(url), opts);
  };
}
const jsonResponse = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });

afterEach(() => { globalThis.fetch = realFetch; });

test('decodeHtmlContent handles single and double escaping', () => {
  assert.equal(decodeHtmlContent('&lt;p&gt;Hi &amp;amp; bye&lt;/p&gt;'), '<p>Hi &amp; bye</p>');
  assert.equal(decodeHtmlContent('&amp;lt;p&amp;gt;x&amp;lt;/p&amp;gt;'), '<p>x</p>');
  assert.equal(decodeHtmlContent('&lt;p&gt;We&amp;#39;re&lt;/p&gt;'), '<p>We&#39;re</p>');
  assert.equal(decodeHtmlContent('<p>already html</p>'), '<p>already html</p>');
  assert.equal(htmlToText('<p>We&#39;re &quot;great&quot;&nbsp;&#x2014; &#8212;</p><ul><li>A</li></ul>'), 'We\'re "great" — —\n\n• A');
});

test('greenhouse adapter maps and decodes jobs', async () => {
  mockFetch(() => jsonResponse(fixture('greenhouse-jobs.json')));
  const jobs = await fetchGreenhouse('anthropic');
  assert.equal(calls[0].url, greenhouseUrl('anthropic'));
  assert.ok(calls[0].url.includes('content=true'));
  assert.match(calls[0].opts.headers['User-Agent'], /melon-seek/);
  assert.ok(calls[0].opts.signal, 'uses AbortController signal');
  assert.equal(jobs.length, 3);

  const [a, b, c] = jobs;
  assert.equal(a.sourceId, '4012345008');
  assert.equal(a.title, 'Research Engineer, Interpretability');
  assert.equal(a.department, 'AI Research & Engineering');
  assert.equal(a.locationText, 'San Francisco, CA | New York City, NY');
  assert.deepEqual(a.extraLocations, ['Seattle, WA']);
  assert.equal(a.url, 'https://job-boards.greenhouse.io/anthropic/jobs/4012345008');
  assert.equal(a.updatedAt, '2026-09-30T12:00:00-04:00');
  assert.ok(a.html.startsWith('<div class="content-intro">'), 'html decoded');
  assert.ok(!a.html.includes('&lt;'));
  assert.equal(a.salary, null);
  assert.ok(a.text.includes('$320,000'));
  // Pay parsed from description text, ignoring $1B / 401(k).
  const s = parseSalary(a.text);
  assert.equal(s.min, 320000);
  assert.equal(s.max, 405000);
  assert.equal(s.currency, 'USD');

  // double-escaped content
  assert.ok(b.html.startsWith('<p>Lead a team'));
  assert.equal(parseSalary(b.text).min, 191000);
  assert.equal(b.extraLocations.length, 0);

  // pay_input_ranges
  assert.deepEqual({ min: c.salary.min, max: c.salary.max, currency: c.salary.currency, interval: c.salary.interval },
    { min: 95000, max: 120000, currency: 'GBP', interval: 'year' });
});

test('adapter throws informative errors on non-2xx and bad payloads', async () => {
  mockFetch(() => new Response('Not Found', { status: 404, statusText: 'Not Found' }));
  await assert.rejects(fetchGreenhouse('nope'), /greenhouse\/nope: HTTP 404.*board not found/);
  mockFetch(() => jsonResponse({ message: 'down' }, 503));
  await assert.rejects(fetchAshby('x'), /ashby\/x: HTTP 503/);
  mockFetch(() => jsonResponse({ ok: true }));
  await assert.rejects(fetchLever('x'), /lever\/x: unexpected response/);
  mockFetch(() => { throw new TypeError('fetch failed'); });
  await assert.rejects(fetchGreenhouse('y'), /greenhouse\/y: network error/);
});

test('adapter aborts after timeout', async () => {
  const { fetchJson } = await import('../server/sources/util.js');
  mockFetch((url, opts) => new Promise((_, reject) => {
    opts.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  }));
  await assert.rejects(fetchJson('https://example.test/x', { timeoutMs: 20, label: 't' }), /timed out/);
});

test('ashby adapter maps jobs, skips unlisted, builds salary', async () => {
  mockFetch(() => jsonResponse(fixture('ashby-board.json')));
  const jobs = await fetchAshby('openai');
  assert.ok(calls[0].url.startsWith('https://api.ashbyhq.com/posting-api/job-board/openai'));
  assert.ok(calls[0].url.includes('includeCompensation=true'));
  assert.equal(jobs.length, 3, 'unlisted skipped');
  const [mts, intern, se] = jobs;
  assert.equal(mts.title, 'Member of Technical Staff, Inference');
  assert.equal(mts.department, 'Applied AI');
  assert.equal(mts.team, 'Inference');
  assert.equal(mts.employmentType, 'Full-time');
  assert.equal(mts.locationText, 'San Francisco');
  assert.deepEqual(mts.extraLocations, ['New York City']);
  assert.equal(mts.remote, false);
  assert.equal(mts.url, 'https://jobs.ashbyhq.com/openai/1b2c3d4e-0000-4000-8000-000000000001');
  assert.deepEqual(mts.salary, { min: 310000, max: 460000, currency: 'USD', interval: 'year', text: '$310K – $460K • Offers Equity' });
  assert.equal(intern.remote, true);
  assert.equal(intern.salary.interval, 'hour');
  assert.equal(toJobSalary(intern.salary).min, 124800);
  assert.equal(se.salary, null, 'no structured salary');
  assert.equal(parseSalary(se.text).currency, 'GBP');
});

test('lever adapter combines lists and maps salaryRange', async () => {
  mockFetch(() => jsonResponse(fixture('lever-postings.json')));
  const jobs = await fetchLever('example');
  assert.equal(calls[0].url, 'https://api.lever.co/v0/postings/example?mode=json');
  assert.equal(jobs.length, 2);
  const [be, sup] = jobs;
  assert.equal(be.title, 'Senior Backend Engineer');
  assert.equal(be.department, 'Engineering');
  assert.equal(be.team, 'Platform');
  assert.equal(be.employmentType, 'Full-time');
  assert.equal(be.locationText, 'Toronto, ON');
  assert.deepEqual(be.extraLocations, ['Vancouver, BC']);
  assert.ok(be.html.includes("<h3>What you'll do</h3><ul><li>Design APIs in Go</li>"));
  assert.ok(be.html.includes('learning stipend'));
  assert.equal(be.salary.min, 150000);
  assert.equal(be.salary.currency, 'CAD');
  assert.equal(be.salary.interval, 'year');
  assert.equal(be.updatedAt, new Date(1758000000000).toISOString());
  assert.equal(be.remote, false);
  assert.equal(sup.remote, true);
  assert.equal(sup.salary, null);
  const s = parseSalary(sup.text);
  assert.deepEqual([s.min, s.max, s.interval], [25, 32, 'hour']);
});

test('companies registry and resolveCompany', () => {
  const slugs = listCompanies().map((c) => c.slug);
  assert.deepEqual(slugs, ['anthropic', 'anduril', 'openai', 'scaleai', 'xai', 'cohere', 'palantir', 'shieldai']);
  for (const c of listCompanies()) {
    assert.match(c.color, /^#[0-9a-f]{6}$/i, `${c.slug} color`);
    assert.ok(['greenhouse', 'ashby', 'lever'].includes(c.source));
  }
  assert.deepEqual(['scaleai', 'xai', 'cohere', 'palantir', 'shieldai'].map((s) => { const c = resolveCompany({ company: s }); return `${c.source}/${c.board}`; }),
    ['greenhouse/scaleai', 'greenhouse/xai', 'ashby/cohere', 'lever/palantir', 'lever/shieldai']);
  assert.throws(() => resolveCompany({ company: 'mistral' }), (e) => e.status === 404, 'mistral removed (0 jobs live)');
  assert.equal(resolveCompany({ source: 'lever', board: 'palantir' }).slug, 'palantir');
  assert.equal(resolveCompany({ company: 'anduril' }).board, 'andurilindustries');
  assert.equal(resolveCompany(new URLSearchParams('company=openai')).source, 'ashby');
  const c = resolveCompany({ source: 'lever', board: 'acme-co', name: 'Acme' });
  assert.equal(c.slug, 'lever-acme-co');
  assert.equal(c.name, 'Acme');
  assert.ok(c.color);
  assert.equal(resolveCompany({ source: 'greenhouse', board: 'anthropic' }).slug, 'anthropic');
  assert.throws(() => resolveCompany({ source: 'workday', board: 'x' }), (e) => e.status === 400);
  assert.throws(() => resolveCompany({ source: 'lever', board: '../etc' }), (e) => e.status === 400);
  assert.throws(() => resolveCompany({ company: 'nope' }), (e) => e.status === 404);
  assert.throws(() => resolveCompany({}), (e) => e.status === 400);
});

test('cache stores to disk and reports freshness', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'melon-cache-'));
  cache.setCacheDir(dir);
  assert.equal(await cache.getCached('acme'), null);
  await cache.setCached('acme', [{ id: 'acme:1' }]);
  assert.ok(fs.existsSync(path.join(dir, 'acme.json')));
  let hit = await cache.getCached('acme');
  assert.equal(hit.fresh, true);
  assert.deepEqual(hit.data, [{ id: 'acme:1' }]);
  cache.clearMemory();
  const old = new Date(Date.now() - 31 * 60 * 1000).toISOString();
  fs.writeFileSync(path.join(dir, 'old.json'), JSON.stringify({ fetchedAt: old, data: [1] }));
  hit = await cache.getCached('old');
  assert.equal(hit.fresh, false);
  assert.deepEqual(hit.data, [1]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('slug validation rejects dot-only and edge-dot slugs (L1)', () => {
  for (const bad of ['.', '..', '...', 'a..b', '.hidden', 'trailing.', '-x', 'x-', '_x', 'a/b', 'a b', '', 'x'.repeat(101)]) {
    assert.throws(() => resolveCompany({ source: 'greenhouse', board: bad }), (e) => e.status === 400, `rejects ${JSON.stringify(bad)}`);
  }
  for (const ok of ['a', 'anthropic', 'andurilindustries', 'acme-co', 'acme_co', 'acme.io', 'x'.repeat(100)]) {
    assert.equal(resolveCompany({ source: 'lever', board: ok }).board, ok);
  }
});

test('fetchJson: no redirects, typed errors, body-size cap (L2)', async () => {
  const { fetchJson, UpstreamError } = await import('../server/sources/util.js');
  mockFetch(() => jsonResponse({ ok: 1 }));
  assert.deepEqual(await fetchJson('https://example.test/a', { label: 't' }), { ok: 1 });
  assert.equal(calls[0].opts.redirect, 'error');

  mockFetch(() => new Response('x'.repeat(10), { status: 200, headers: { 'content-length': String(10 * 1024 * 1024 * 1024) } }));
  await assert.rejects(fetchJson('https://example.test/big', { label: 't' }), (e) => e instanceof UpstreamError && e.code === 'too_large');

  // Streamed body without content-length that exceeds the cap.
  mockFetch(() => new Response(new ReadableStream({
    start(c) { for (let i = 0; i < 5; i++) c.enqueue(new TextEncoder().encode('a'.repeat(1000))); c.close(); },
  }), { status: 200 }));
  await assert.rejects(fetchJson('https://example.test/stream', { label: 't', maxBytes: 2500 }), (e) => e.code === 'too_large');

  mockFetch(() => new Response('nope', { status: 404, statusText: 'Not Found' }));
  await assert.rejects(fetchJson('https://example.test/404', { label: 't' }), (e) => e.code === 'http' && e.status === 404);
  mockFetch(() => new Response('{bad json', { status: 200 }));
  await assert.rejects(fetchJson('https://example.test/bad', { label: 't' }), (e) => e.code === 'invalid_json');
  mockFetch(() => { throw new TypeError('fetch failed', { cause: new Error('unexpected redirect') }); });
  await assert.rejects(fetchJson('https://example.test/redir', { label: 't' }), (e) => e.code === 'network');

  // Multi-byte UTF-8 split across chunks decodes correctly.
  const bytes = new TextEncoder().encode(JSON.stringify({ s: '£95k – €80.000' }));
  mockFetch(() => new Response(new ReadableStream({
    start(c) { for (const b of bytes) c.enqueue(new Uint8Array([b])); c.close(); },
  }), { status: 200 }));
  assert.deepEqual(await fetchJson('https://example.test/utf8', { label: 't' }), { s: '£95k – €80.000' });
});

test('cache: custom boards are LRU-bounded in memory and on disk (H1)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'melon-lru-'));
  cache.setCacheDir(dir);
  cache.setCacheLimits({ memory: 2, disk: 3 });
  try {
    await cache.setCached('anthropic', [0]);
    for (const slug of ['lever-a', 'lever-b', 'lever-c']) {
      await cache.setCached(slug, [slug], { custom: true });
      await new Promise((r) => setTimeout(r, 15)); // distinct mtimes
    }
    assert.deepEqual(cache.memoryKeys(), ['anthropic', 'lever-b', 'lever-c'], 'oldest custom evicted, built-in kept');
    await cache.getCached('lever-b', { custom: true }); // touch -> most recent
    await cache.setCached('lever-d', ['d'], { custom: true });
    assert.deepEqual(cache.memoryKeys(), ['anthropic', 'lever-b', 'lever-d']);
    await new Promise((r) => setTimeout(r, 15));
    await cache.setCached('lever-e', ['e'], { custom: true });
    const files = fs.readdirSync(path.join(dir, 'custom')).sort();
    assert.equal(files.length, 3);
    assert.ok(files.includes('lever-e.json') && files.includes('lever-d.json'));
    assert.ok(fs.existsSync(path.join(dir, 'anthropic.json')), 'built-in file is never pruned');
    // Evicted from memory but still on disk -> read back.
    cache.clearMemory();
    assert.deepEqual((await cache.getCached('lever-d', { custom: true })).data, ['d']);
    assert.equal(await cache.getCached('lever-a', { custom: true }), null);
  } finally {
    cache.setCacheLimits({ memory: 50, disk: 100 });
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('browser-bundled modules use no Node-only APIs', () => {
  const root = path.join(FIX, '..', '..', 'server');
  const files = ['companies.js', 'normalize.js', 'salary.js', ...fs.readdirSync(path.join(root, 'sources')).map((f) => `sources/${f}`)];
  for (const f of files) {
    const code = fs.readFileSync(path.join(root, f), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!/\bfrom\s+['"]node:|\bimport\s*\(\s*['"]node:|\brequire\s*\(/.test(code), `${f}: node import`);
    assert.ok(!/(?<![.?\w])(process\.|Buffer\b|__dirname)/.test(code), `${f}: node global`);
  }
});

test('adapters pass a per-call body cap to fetchJson', async () => {
  for (const [fn, file] of [[fetchGreenhouse, 'greenhouse-jobs.json'], [fetchAshby, 'ashby-board.json'], [fetchLever, 'lever-postings.json']]) {
    mockFetch(() => jsonResponse(fixture(file)));
    await assert.rejects(fn('x', { maxBytes: 500 }), (e) => e.code === 'too_large', `${fn.name} honours maxBytes`);
    mockFetch(() => jsonResponse(fixture(file)));
    assert.ok((await fn('x', { maxBytes: 10 * 1024 * 1024 })).length > 0, `${fn.name} under the cap`);
  }
});

test('greenhouse pay_input_ranges -> structured salary (cents, tiers, hourly, fallback)', async () => {
  mockFetch(() => jsonResponse(fixture('greenhouse-pay-ranges.json')));
  const jobs = await fetchGreenhouse('andurilindustries');
  assert.ok(calls[0].url.includes('content=true') && calls[0].url.includes('pay_transparency=true'));
  const [tiers, hourly, none, mixed] = jobs;
  // Several tiers: overall min and max of the tiers (structured beats the text range).
  assert.deepEqual({ ...tiers.salary, text: undefined }, { min: 133000, max: 249000, currency: 'USD', interval: 'year', text: undefined });
  assert.match(tiers.salary.text, /133,000–249,000 USD \(3 ranges\)/);
  // Interval comes from title/blurb only.
  assert.deepEqual([hourly.salary.min, hourly.salary.max, hourly.salary.interval], [28, 36, 'hour']);
  assert.equal(toJobSalary(hourly.salary).min, 28 * 2080);
  // Empty ranges -> null here; normalize falls back to parsing the text.
  assert.equal(none.salary, null);
  const parsed = parseSalary(none.text);
  assert.deepEqual([parsed.min, parsed.max, parsed.currency], [90000, 115000, 'GBP']);
  // End to end through normalize: structured salary used, text fallback when absent.
  const { normalizeJob } = await import('../server/normalize.js');
  const co = { slug: 'anduril', name: 'Anduril' };
  assert.equal(normalizeJob(tiers, co).salary.mid, 191000);
  assert.deepEqual([normalizeJob(none, co).salary.min, normalizeJob(none, co).salary.currency], [90000, 'GBP']);
  // Ranges in another currency than the first are not mixed in.
  assert.deepEqual([mixed.salary.min, mixed.salary.max, mixed.salary.currency], [180000, 220000, 'AUD']);
});

test('F4: adapters emit postedAt and reqId; updatedAt keeps its meaning', async () => {
  mockFetch(() => jsonResponse(fixture('greenhouse-jobs.json')));
  const gh = await fetchGreenhouse('anthropic');
  assert.equal(gh[0].postedAt, '2026-07-14T14:00:00.000Z', 'first_published, as UTC ISO');
  assert.equal(gh[0].updatedAt, '2026-09-30T12:00:00-04:00', 'updated_at unchanged');
  assert.equal(gh[0].reqId, '4001', 'internal_job_id as string');
  assert.equal(gh[1].postedAt, null, 'no first_published -> null, never updated_at');
  assert.equal(gh[1].reqId, '4002');

  mockFetch(() => jsonResponse(fixture('ashby-board.json')));
  const ab = await fetchAshby('openai');
  assert.equal(ab[0].postedAt, '2026-09-20T17:01:32.123Z');
  assert.equal(ab[0].updatedAt, '2026-09-20T17:01:32.123+00:00');
  assert.equal(ab[0].reqId, null);

  mockFetch(() => jsonResponse(fixture('lever-postings.json')));
  const lv = await fetchLever('example');
  assert.equal(lv[0].postedAt, new Date(1758000000000).toISOString());
  assert.equal(lv[0].reqId, null);

  // normalize carries them onto the Job.
  const { normalizeJob } = await import('../server/normalize.js');
  const j = normalizeJob(gh[0], { slug: 'anthropic', name: 'Anthropic' });
  assert.deepEqual([j.postedAt, j.reqId, j.updatedAt], ['2026-07-14T14:00:00.000Z', '4001', '2026-09-30T12:00:00-04:00']);
  const bad = normalizeJob({ ...gh[0], postedAt: 'not a date', reqId: '' }, { slug: 'anthropic', name: 'Anthropic' });
  assert.deepEqual([bad.postedAt, bad.reqId], [null, null]);
});

test('F2: normalize sets job.extras from keywords.extractCompExtras (feature-detected)', async () => {
  const { normalizeJob, compExtras } = await import('../server/normalize.js');
  const kw = await import('../server/keywords.js');
  const co = { slug: 'openai', name: 'OpenAI' };
  mockFetch(() => jsonResponse(fixture('ashby-board.json')));
  const [mts] = await fetchAshby('openai');
  const j = normalizeJob(mts, co);
  assert.ok(j.extras && typeof j.extras.equity === 'boolean' && typeof j.extras.bonus === 'boolean');
  if (typeof kw.extractCompExtras === 'function') {
    // "$310K – $460K • Offers Equity" lives in the compensation summary, not the description.
    assert.equal(j.extras.equity, true);
    const dei = normalizeJob({ ...mts, html: '<p>We are committed to pay equity and diversity, equity and inclusion.</p>', text: '', compensationSummary: null, salary: null }, co);
    assert.equal(dei.extras.equity, false);
    const bonus = normalizeJob({ ...mts, html: '<p>Total compensation includes base salary, an annual performance bonus and RSUs.</p>', text: '', compensationSummary: null, salary: null }, co);
    assert.deepEqual(bonus.extras, { equity: true, bonus: true });
  }
  assert.deepEqual(compExtras({}, '', ''), { equity: false, bonus: false });
});
