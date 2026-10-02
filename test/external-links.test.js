// scripts/external-links.js (CI external link check). Owner: devops.
// Runs against a local mock server; the real check runs on GitHub's runners.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sample, jobUrls, checkUrl, run, markdown } from '../scripts/external-links.js';

function mock() {
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const send = (code, headers = {}) => { res.writeHead(code, { 'content-type': 'text/html', ...headers }); res.end(req.method === 'HEAD' ? undefined : 'x'); };
    if (u.pathname === '/ok' || u.pathname.startsWith('/jobs/ok') || u.pathname === '/board') return send(200);
    if (u.pathname === '/nohead') return send(req.method === 'HEAD' ? 405 : 200);
    if (u.pathname === '/closed') return send(302, { location: '/board?error=true' });
    if (u.pathname === '/melon-seek/') return send(200);
    return send(404);
  });
  return new Promise((resolve) => srv.listen(0, '127.0.0.1', () => resolve({ base: `http://127.0.0.1:${srv.address().port}`, close: () => new Promise((r) => srv.close(r)) })));
}

test('sample is seeded, without duplicates, and capped at the list size', () => {
  const items = Array.from({ length: 100 }, (_, i) => i);
  const a = sample(items, 20, '2026-10-02:anthropic');
  assert.deepEqual(a, sample(items, 20, '2026-10-02:anthropic'));
  assert.notDeepEqual(a, sample(items, 20, '2026-10-03:anthropic'));
  assert.equal(new Set(a).size, 20);
  assert.equal(sample([1, 2, 3], 20, 's').length, 3);
  assert.deepEqual(jobUrls({ shared: { urlPrefix: 'https://h/jobs/' }, jobs: [{ url: '1' }, { url: null }, { url: '2' }] }), ['https://h/jobs/1', 'https://h/jobs/2']);
  assert.deepEqual(jobUrls({ jobs: [{ url: 'https://h/a' }] }), ['https://h/a']);
});

test('checkUrl: HEAD with GET fallback, 404, closed Greenhouse posting, unreachable', async () => {
  const m = await mock();
  try {
    assert.equal((await checkUrl(`${m.base}/ok`)).ok, true);
    const nohead = await checkUrl(`${m.base}/nohead`);
    assert.equal(nohead.ok, true, 'HEAD 405 falls back to GET');
    assert.deepEqual([(await checkUrl(`${m.base}/gone`)).ok, (await checkUrl(`${m.base}/gone`)).reason], [false, 'HTTP 404']);
    assert.match((await checkUrl(`${m.base}/closed`)).reason, /closed posting/);
    assert.equal((await checkUrl('http://127.0.0.1:1/x', { timeout: 2000 })).ok, false);
  } finally { await m.close(); }
});

test('run: per-company job sample from a dist (demo boards skipped) and the site pages', async () => {
  const m = await mock();
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'melon-extlinks-'));
  try {
    fs.mkdirSync(path.join(dist, 'api', 'jobs'), { recursive: true });
    fs.writeFileSync(path.join(dist, 'api', 'companies.json'), '[]');
    const jobs = Array.from({ length: 30 }, (_, i) => ({ url: i === 0 ? 'gone' : `ok${i}` }));
    fs.writeFileSync(path.join(dist, 'api', 'jobs', 'anthropic.json'), JSON.stringify({ mode: 'snapshot', format: 'melon-packed-2', shared: { urlPrefix: `${m.base}/jobs/` }, jobs }));
    fs.writeFileSync(path.join(dist, 'api', 'jobs', 'openai.json'), JSON.stringify({ mode: 'demo', jobs: [{ url: `${m.base}/gone` }] }));
    const out = await run({ jobs: dist, site: true, siteUrl: `${m.base}/melon-seek/`, perCompany: 30, seed: 't', timeout: 3000 });
    const [j, s] = out.groups;
    assert.equal(j.checked, 30, 'all 30 anthropic URLs; openai (demo) skipped; boards without a list noted');
    assert.deepEqual(j.broken.map((b) => b.url), [`${m.base}/jobs/gone`]);
    assert.ok(j.notes.some((n) => /OpenAI: demo data, skipped/.test(n)));
    assert.ok(j.notes.some((n) => /Anduril: no list/.test(n)));
    assert.equal(s.checked, 2);
    assert.deepEqual(s.broken.map((b) => b.url), [`${m.base}/melon-seek/methodology/`]);
    assert.match(markdown(out), /\*\*Site \(.*\)\*\*: 1 broken/);
  } finally { await m.close(); fs.rmSync(dist, { recursive: true, force: true }); }
});
