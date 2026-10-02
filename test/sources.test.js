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
  assert.deepEqual(slugs, ['anthropic', 'anduril', 'openai']);
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
