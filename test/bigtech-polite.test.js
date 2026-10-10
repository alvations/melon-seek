// Beta channel plumbing: the polite HTTP client (server/sources/polite.js), the
// channel-aware registry (server/companies.js) and `snapshot.js --channel`.
// docs/CONTRACT.md v3, docs/DATA_SOURCES.md §7.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  politeRequest, politeJson, robotsRules, robotsAllows, checkRobots, resetRobots, setMinInterval, resetRateLimits,
  cookieJar, mapLimit, newStats, BOT_USER_AGENT,
} from '../server/sources/polite.js';
import { listCompanies, getCompany, resolveCompany, SOURCES } from '../server/companies.js';
import { targetsFor, fitSnapshot, trimDescription } from '../scripts/snapshot.js';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; setMinInterval(null); resetRateLimits(); resetRobots(); });

const STABLE = ['anthropic', 'anduril', 'openai', 'scaleai', 'xai', 'cohere', 'palantir', 'shieldai'];
const BETA = ['google', 'microsoft', 'meta', 'apple', 'netflix', 'amazon', 'nvidia'];

test('registry: listCompanies() default is exactly the stable list; beta adds the big-tech boards', () => {
  assert.deepEqual(listCompanies().map((c) => c.slug), STABLE);
  assert.deepEqual(listCompanies({ channel: 'stable' }).map((c) => c.slug), STABLE);
  assert.deepEqual(listCompanies({ channel: 'beta' }).map((c) => c.slug), [...STABLE, ...BETA]);
  assert.deepEqual(listCompanies({ channel: 'all' }).map((c) => c.slug), [...STABLE, ...BETA]);
  assert.ok(listCompanies().every((c) => !('channel' in c) && !('live' in c)), 'stable entries are unchanged objects');
  for (const c of listCompanies({ channel: 'beta' }).filter((x) => x.channel === 'beta')) {
    assert.equal(c.live, false, `${c.slug} is snapshot-only`);
    assert.match(c.color, /^#[0-9a-f]{6}$/i);
  }
  assert.throws(() => listCompanies({ channel: 'nightly' }), /Unknown channel/);
  // getCompany resolves any channel and names it.
  assert.equal(getCompany('microsoft').channel, 'beta');
  assert.equal(getCompany('microsoft').source, 'eightfold');
  assert.equal(getCompany('anthropic').channel, 'stable');
  assert.equal(getCompany('tesla'), null, 'Tesla is left out (Akamai blocks every plain request)');
  assert.equal(resolveCompany({ company: 'nvidia' }).board, 'nvidia');
  // Custom boards stay greenhouse | ashby | lever; beta sources are built-in only.
  assert.deepEqual(SOURCES, ['greenhouse', 'ashby', 'lever']);
  assert.throws(() => resolveCompany({ source: 'eightfold', board: 'microsoft' }), (e) => e.status === 400);
});

test('snapshot targets: no args = stable only; --channel beta = the beta boards only; explicit slugs win', () => {
  assert.deepEqual(targetsFor([]), STABLE);
  assert.deepEqual(targetsFor(['--channel', 'stable']), STABLE);
  assert.deepEqual(targetsFor(['--channel', 'beta']), BETA);
  assert.deepEqual(targetsFor(['--channel=all']), [...STABLE, ...BETA]);
  assert.deepEqual(targetsFor(['nvidia', 'anthropic']), ['nvidia', 'anthropic']);
  assert.throws(() => targetsFor(['--channel', 'x']), /unknown channel/);
  assert.throws(() => targetsFor(['--nope']), /unknown option/);
});

test('fitSnapshot trims descriptions (keeping pay paragraphs) only when over the cap', () => {
  const pay = '<p>The base pay range for this role is between $150,400 and $277,600.</p>';
  const jobs = Array.from({ length: 50 }, (_, i) => ({ id: `x:${i}`, descriptionHtml: `<p>${'word '.repeat(4000)}</p>${pay}` }));
  const payload = (list, t) => ({ t, jobs: list });
  const small = fitSnapshot(jobs, payload, 10 * 1024 * 1024);
  assert.equal(small.trimmedTo, null);
  assert.equal(small.jobs, jobs);
  const fit = fitSnapshot(jobs, payload, 400 * 1024);
  assert.ok(fit.trimmedTo > 0 && fit.bytes <= 400 * 1024, `trimmed to ${fit.trimmedTo}, ${fit.bytes} bytes`);
  assert.ok(fit.jobs[0].descriptionHtml.includes('$150,400 and $277,600'), 'pay paragraph kept');
  assert.ok(fit.jobs[0].descriptionHtml.includes('Full description on the posting page'));
  assert.equal(trimDescription('<p>short</p>', 100), '<p>short</p>');
});

test('fitSnapshot caps a board that is still too big: salaried postings first, then the newest, marked jobsCapped', () => {
  const day = 864e5;
  const jobs = Array.from({ length: 600 }, (_, i) => ({
    id: `x:${i}`, salary: i % 3 ? { min: 100000, max: 150000 } : null,
    postedAt: new Date(Date.UTC(2026, 0, 1) + i * day).toISOString(),
    sections: { responsibilities: ['r'.repeat(1500)], fit: [] }, descriptionHtml: `<p>${'w '.repeat(3000)}</p>`,
  }));
  const payload = (list, t, capped) => ({ t, capped, jobs: list });
  const r = fitSnapshot(jobs, payload, 1024 * 1024);
  assert.ok(r.bytes <= 1024 * 1024);
  assert.equal(r.trimmedTo, 800, 'descriptions trimmed to the shortest step first');
  assert.ok(r.capped && r.capped.total === 600 && r.capped.kept === r.jobs.length && r.jobs.length < 600);
  const salaried = jobs.filter((j) => j.salary).length;
  const keptSalaried = r.jobs.filter((j) => j.salary).length;
  assert.ok(keptSalaried === r.jobs.length || keptSalaried === salaried, 'no posting without pay is kept while a salaried one is dropped');
  const small = fitSnapshot(jobs, payload, 300 * 1024);
  assert.ok(small.jobs.length < salaried && small.jobs.every((j) => j.salary), 'a tight cap keeps salaried postings only');
  const kept = new Set(small.jobs.map((j) => j.id));
  assert.ok(kept.has('x:599') && !kept.has('x:1'), 'newest salaried first');
  const order = small.jobs.map((j) => Number(j.id.slice(2)));
  assert.deepEqual(order, [...order].sort((a, b) => a - b), 'original order kept');
});

test('robots.txt: RFC 9309 groups, longest match, Allow on ties, wildcards', () => {
  // The Eightfold tenants (Microsoft, NVIDIA, Netflix) as served on 2026-10-10.
  const eightfold = 'User-agent: *\nDisallow: /\nAllow: /careers\nAllow: /api/apply\nAllow: /api/pcsx\nAllow: /api/events\n';
  const r = robotsRules(eightfold);
  assert.equal(robotsAllows(r, '/api/pcsx/search?domain=microsoft.com&start=0').allowed, true);
  assert.equal(robotsAllows(r, '/api/apply/v2/jobs/1?domain=netflix.com').allowed, true);
  assert.equal(robotsAllows(r, '/careers/job/1970393557037774').allowed, true);
  assert.equal(robotsAllows(r, '/api/other').allowed, false);
  // Google: paged results are disallowed, single postings and the sitemap are not.
  const google = [
    'User-agent: *', 'Disallow: /search', 'Disallow: /about/careers/applications/jobs/results?page=',
    'Disallow: /about/careers/applications/jobs/results/?page=', 'Disallow: /about/careers/applications/jobs/results?*&page=',
    'Disallow: /about/careers/applications/jobs/results/?*&page=', '', 'User-agent: Yandex', 'Disallow: /about/careers/applications/jobs/results',
  ].join('\n');
  const g = robotsRules(google);
  assert.equal(robotsAllows(g, '/about/careers/applications/jobs/results/?page=2').allowed, false);
  assert.equal(robotsAllows(g, '/about/careers/applications/jobs/results/?location=X&page=2').allowed, false);
  assert.equal(robotsAllows(g, '/about/careers/applications/jobs/results/123-software-engineer').allowed, true);
  assert.equal(robotsAllows(g, '/about/careers/applications/jobs/sitemap.xml').allowed, true);
  // Our own group wins over *; an empty Disallow allows everything.
  const own = robotsRules('User-agent: *\nDisallow: /\n\nUser-agent: melon-seek\nDisallow:\n');
  assert.equal(robotsAllows(own, '/anything').allowed, true);
  assert.equal(robotsAllows(robotsRules('User-agent: AhrefsBot\nDisallow: /\nUser-agent: *\nDisallow: /internal\n'), '/en/search.json').allowed, true);
  assert.equal(robotsAllows(robotsRules('User-agent: *\nDisallow: /*.json$\n'), '/a.json').allowed, false);
  assert.equal(robotsAllows(robotsRules('User-agent: *\nDisallow: /*.json$\n'), '/a.json?x=1').allowed, true);
});

test('checkRobots: refuses disallowed paths, follows redirects, 4xx = no rules, 5xx = do not crawl', async () => {
  setMinInterval(0);
  const seen = [];
  globalThis.fetch = async (url) => {
    seen.push(String(url));
    const u = new URL(url);
    if (u.host === 'a.test') return new Response('User-agent: *\nDisallow: /api/\n', { status: 200 });
    if (u.host === 'b.test') return new Response('Moved', { status: 301, headers: { location: 'https://c.test/pagenotfound' } });
    if (u.host === 'c.test') return new Response('<html><body>Not found</body></html>', { status: 200, headers: { 'content-type': 'text/html' } });
    if (u.host === 'd.test') return new Response('nope', { status: 403 });
    return new Response('down', { status: 503 });
  };
  await assert.rejects(checkRobots('https://a.test', ['/api/jobs']), (e) => e.code === 'robots' && /disallows \/api\/jobs/.test(e.message));
  const ok = await checkRobots('https://b.test', ['/api/v1/search']);
  assert.equal(ok[0].allowed, true, 'robots.txt redirected to an HTML page: no rules');
  assert.ok(seen.includes('https://c.test/pagenotfound'));
  assert.equal((await checkRobots('https://d.test', ['/x']))[0].allowed, true);
  await assert.rejects(checkRobots('https://e.test', ['/x'], { label: 't' }), (e) => e.code === 'robots');
});

test('politeRequest: honest User-Agent, per-host spacing, backoff on 429/5xx with Retry-After, never retries 403', async () => {
  setMinInterval(40);
  const calls = [];
  let n429 = 0;
  globalThis.fetch = async (url, opts) => {
    calls.push({ url: String(url), at: Date.now(), headers: opts.headers, redirect: opts.redirect });
    if (String(url).endsWith('/busy') && n429++ < 1) return new Response('slow down', { status: 429, headers: { 'retry-after': '0' } });
    if (String(url).endsWith('/blocked')) return new Response('Access Denied', { status: 403 });
    return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const stats = newStats();
  const t0 = Date.now();
  await Promise.all([1, 2, 3].map((i) => politeJson(`https://x.test/p${i}`, { stats })));
  assert.ok(Date.now() - t0 >= 75, 'three requests to one host are spaced');
  const gaps = calls.slice(1).map((c, i) => c.at - calls[i].at);
  assert.ok(gaps.every((g) => g >= 35), `gaps ${gaps}`);
  assert.equal(calls[0].headers['User-Agent'], BOT_USER_AGENT);
  assert.match(BOT_USER_AGENT, /^melon-seek\/\S+ \(\+https:\/\/alvations\.github\.io\/melon-seek\//);
  assert.ok(!/Mozilla|Chrome|Safari/.test(BOT_USER_AGENT), 'no browser impersonation');
  assert.equal(calls[0].redirect, 'manual');
  assert.deepEqual(await politeJson('https://y.test/busy', { stats }), { ok: true });
  assert.equal(stats.retries, 1);
  assert.equal(stats.statuses[429], 1);
  const before = calls.length;
  await assert.rejects(politeRequest('https://z.test/blocked', { stats }), (e) => e.status === 403 && /not retried/.test(e.message));
  assert.equal(calls.length - before, 1, '403 is not retried');
  assert.equal(stats.requests, 6);
});

test('politeRequest: the cookie jar sends back only what the site set', async () => {
  setMinInterval(0);
  const sent = [];
  globalThis.fetch = async (url, opts) => {
    sent.push(opts.headers.Cookie || null);
    const h = new Headers({ 'content-type': 'application/json' });
    h.append('set-cookie', '_vs=abc; Path=/; HttpOnly');
    h.append('set-cookie', '_vscid=1; Path=/');
    return new Response('{}', { status: 200, headers: h });
  };
  const jar = cookieJar();
  await politeJson('https://jar.test/a', { jar });
  await politeJson('https://jar.test/b', { jar });
  assert.equal(sent[0], null);
  assert.equal(sent[1], '_vs=abc; _vscid=1');
});

test('mapLimit runs at most N at once and collects errors', async () => {
  let live = 0;
  let peak = 0;
  const { results, errors } = await mapLimit([1, 2, 3, 4, 5], 2, async (x) => {
    live++; peak = Math.max(peak, live);
    await new Promise((r) => setTimeout(r, 5));
    live--;
    if (x === 3) throw new Error('boom');
    return x * 10;
  });
  assert.equal(peak, 2);
  assert.deepEqual(results, [10, 20, undefined, 40, 50]);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].index, 2);
});

test('pipeline: beta adapters registered; { jobs } results normalized; live tasks refused for live: false companies', async () => {
  const { ADAPTERS, fetchLive, runTask } = await import('../server/pipeline.js');
  for (const s of ['eightfold', 'amazon', 'apple', 'google', 'meta']) assert.equal(typeof ADAPTERS[s], 'function', s);
  for (const c of listCompanies({ channel: 'beta' })) assert.equal(typeof ADAPTERS[c.source], 'function', `${c.slug} has an adapter`);
  const orig = ADAPTERS.eightfold;
  const seen = [];
  try {
    ADAPTERS.eightfold = async (board, opts) => {
      seen.push({ board, opts });
      opts.log && opts.log('hello');
      return { jobs: [{ sourceId: '1', title: 'Software Engineer', locationText: 'Redmond, WA, US', extraLocations: [], html: '<p>x</p>', text: 'x', url: 'https://apply.careers.microsoft.com/careers/job/1', salary: null }], stats: {} };
    };
    const logs = [];
    const jobs = await fetchLive(getCompany('microsoft'), { log: (m) => logs.push(m) });
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].id, 'microsoft:1');
    assert.equal(seen[0].board, 'microsoft');
    assert.deepEqual(logs, ['hello']);
    await assert.rejects(runTask({ type: 'live', company: getCompany('microsoft') }), (e) => e.code === 'live_disabled');
    assert.equal(seen.length, 1, 'the refused live task made no request');
  } finally {
    ADAPTERS.eightfold = orig;
  }
});
