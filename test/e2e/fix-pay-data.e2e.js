// fix-pay-data lane e2e (persona review of the main site, 2026-10-10): the pay-data fields
// reach users on every path.
//   - server mode: the real server upgrades the stored norm-5 snapshots (relocateJobs);
//   - static build: dist/ and dist/beta/ bundles (npm run build re-derives from snapshots);
//   - browser live path: the copied dist/lib/normalize.js run in Chromium on a live board.
// P-1 kind 'ote', P-3 levels, P-8 termWeeks / term pay, P-9 Victoria BC and Alexandria NSW,
// P-17 keyword tags. Unit tests: test/fix-pay-data.test.js.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, assert, assertEq, skip } from './harness.js';
import { unpackJobs } from '../../public/api.js';

async function getJson(baseUrl, p) {
  const r = await fetch(baseUrl + p);
  return { status: r.status, body: await r.json() };
}

const SALES_OTE = /\b(?:account executive|sales)\b/i;

/** Problems with one company's pay-data fields (empty = all good). */
function payDataProblems(slug, jobs) {
  const p = [];
  const byTitle = (re) => jobs.filter((j) => re.test(j.title));
  if (slug === 'anthropic') {
    const ae = byTitle(SALES_OTE).filter((j) => j.salary && !/enablement|strategy|operations/i.test(j.title));
    const ote = ae.filter((j) => j.salary.kind === 'ote');
    if (ae.length && ote.length < ae.length * 0.8) p.push(`only ${ote.length}/${ae.length} salaried sales titles have salary.kind "ote"`);
    const re = byTitle(/^Research Engineer/).filter((j) => j.salary);
    if (re.some((j) => j.salary.kind === 'ote')) p.push('a Research Engineer range is labelled OTE');
    const fellows = byTitle(/Fellows Program/).filter((j) => j.salary);
    if (fellows.length && !fellows.every((j) => j.salary.termWeeks === 17 && j.salary.originalInterval === 'week')) p.push(`Fellows termWeeks ${fellows.map((j) => j.salary.termWeeks)}`);
    if (fellows.some((j) => j.keywords.skills.includes('CAD'))) p.push('"CAD" skill from "4,300 CAD" on the Fellows');
    const crf = byTitle(/^Conceptual Reasoning Fellow$/)[0];
    if (crf) {
      if (crf.seniority !== 'Intern') p.push(`Conceptual Reasoning Fellow is ${crf.seniority}`);
      if (!crf.salary || crf.salary.originalInterval !== 'term' || crf.salary.termWeeks !== 17) p.push(`Conceptual Reasoning Fellow pay ${JSON.stringify(crf.salary)}`);
    }
  }
  if (slug === 'openai') {
    const fad = byTitle(/Federal Account Director/);
    if (fad.some((j) => j.seniority === 'Director+')) p.push('Federal Account Director is Director+');
    if (byTitle(/^Account Director/).some((j) => j.seniority === 'Director+')) p.push('an Account Director is Director+');
  }
  if (slug === 'cohere') {
    const ann = byTitle(/Data Annotation Specialist/);
    if (ann.some((j) => j.locations.some((l) => l.country === 'AU'))) p.push('a Canada-only annotation role lists Australia');
    if (ann.some((j) => j.locations.some((l) => !l.remote && l.country == null))) p.push('an annotation role has a location with no country (Winnipeg / Halifax)');
  }
  if (slug === 'anduril') {
    const alex = jobs.filter((j) => j.locations.some((l) => /Alexandria, New South Wales/.test(l.rawName || '')));
    if (alex.some((j) => j.locations.some((l) => /Alexandria/.test(l.name)))) p.push('"Alexandria, New South Wales" is a separate place');
    const interns = byTitle(/^2027 .*Intern$/).filter((j) => j.salary && j.salary.originalInterval === 'hour');
    if (interns.length && !interns.some((j) => j.salary.termWeeks === 12)) p.push('no 12-week internship has termWeeks 12');
  }
  return p;
}

const STABLE = ['anthropic', 'openai', 'cohere', 'anduril'];

/** Serve ROOT/dist under /melon-seek/ (the GitHub Pages layout) on a free port. */
async function serveDist() {
  const dist = path.join(ROOT, 'dist');
  if (!fs.existsSync(path.join(dist, 'index.html'))) return null;
  const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    let p = path.join(dist, decodeURIComponent(u.pathname.replace(/^\/melon-seek\//, '')));
    if (!p.startsWith(dist) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
    if (fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
    res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(fs.readFileSync(p));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { base: `http://127.0.0.1:${server.address().port}/melon-seek`, close: () => new Promise((r) => server.close(r)) };
}

export function registerFixPayDataTests(suite) {
  suite.test('fix-pay-data: [server] OTE, termWeeks, levels, locations and tags on the upgraded snapshots', async (ctx) => {
    const problems = [];
    for (const slug of STABLE) {
      const { status, body } = await getJson(ctx.baseUrl, `/api/jobs?company=${slug}`);
      assertEq(status, 200, `${slug} status`);
      if (body.mode !== 'snapshot' && body.mode !== 'cache' && body.mode !== 'live') continue;
      for (const pr of payDataProblems(slug, body.jobs)) problems.push(`${slug}: ${pr}`);
    }
    assert(problems.length === 0, problems.join('\n'));
  });

  for (const site of ['', 'beta']) {
    suite.test(`fix-pay-data: [static ${site || 'main'}] the bundle re-derives the pay data from the stored snapshots`, async () => {
      const dir = path.join(ROOT, 'dist', site, 'api', 'jobs');
      if (!fs.existsSync(dir)) skip(`dist/${site} not built (npm run build)`);
      const problems = [];
      let checked = 0;
      for (const slug of STABLE) {
        const file = path.join(dir, `${slug}.json`);
        if (!fs.existsSync(file)) continue;
        const body = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (body.mode !== 'snapshot') continue;
        checked++;
        for (const pr of payDataProblems(slug, unpackJobs(body))) problems.push(`${slug}: ${pr}`);
      }
      if (!checked) skip('no real snapshots bundled');
      // Beta boards: India and Israel offices were filed in Indiana and Illinois before norm-6.
      for (const slug of ['microsoft', 'nvidia']) {
        const file = path.join(dir, `${slug}.json`);
        if (!site || !fs.existsSync(file)) continue;
        const jobs = unpackJobs(JSON.parse(fs.readFileSync(file, 'utf8')));
        const wrong = jobs.flatMap((j) => j.locations).filter((l) => /, (?:IN|IL)$/.test(l.rawName || '') && /District|, (?:KA|TS|MH|UP|HR|TN), IN$/.test(l.rawName) && l.country === 'US');
        if (wrong.length) problems.push(`${slug}: ${wrong.length} India/Israel locations filed in the US, e.g. ${wrong[0].rawName}`);
        // DQ-1: Eightfold writes "City, Region, CC" or a bare "CC"; one whose CC is not US is not in the US.
        const shape = (raw) => { const p = String(raw || '').split(',').map((s) => s.trim()); return p.length !== 2 && /^[A-Z]{2}$/.test(p[p.length - 1]) && p[p.length - 1] !== 'US'; };
        const us = jobs.flatMap((j) => j.locations).filter((l) => l.country === 'US' && shape(l.rawName));
        if (us.length) problems.push(`${slug}: ${us.length} "City, Region, CC" / "CC" locations filed in the US, e.g. ${us[0].rawName}`);
      }
      assert(problems.length === 0, problems.join('\n'));
    });
  }

  suite.test('fix-pay-data: [browser] dist/lib/normalize.js labels a live board the same way', async (ctx) => {
    const st = await serveDist();
    if (!st) skip('dist/ not built (npm run build)');
    ctx.cleanup.push(() => st.close());
    const page = await ctx.browser.newPage();
    ctx.cleanup.push(() => page.close());
    await page.goto(`${st.base}/`, { waitUntil: 'domcontentloaded' });
    const out = await page.evaluate(async () => {
      const { normalizeJobs } = await import('./lib/normalize.js');
      const boiler = '<p>The annual compensation range for this role is listed below. For sales roles, the range provided is the role’s On Target Earnings ("OTE") range, meaning that the range includes both the sales commissions/sales bonuses target and annual base salary for the role.</p>';
      const raws = [
        { sourceId: '1', title: 'Strategic Account Executive, Banking', locationText: 'New York City, NY', html: boiler, salary: { min: 380000, max: 450000, currency: 'USD', interval: 'year', text: 'Annual Salary: 380,000–450,000 USD' } },
        { sourceId: '2', title: 'Research Engineer, Pretraining', locationText: 'San Francisco, CA', html: boiler, salary: { min: 350000, max: 850000, currency: 'USD', interval: 'year', text: 'Annual Salary: 350,000–850,000 USD' } },
        { sourceId: '3', title: 'Anthropic Fellows Program, AI Safety & Security', locationText: 'London, UK', html: '<p>Compensation</p><p>The expected base stipend for this role is 3,850 USD / 2,310 GBP / 4,300 CAD per week, with an expectation of 40 hours per week for 4 months (with possible extension).</p><p>Program Duration: The program runs for 4 months, full-time.</p>' },
        { sourceId: '4', title: 'Federal Account Director, National Security', locationText: 'Washington, DC', html: '<p>Sell to federal agencies.</p>' },
        { sourceId: '5', title: 'Data Annotation Specialist', locationText: 'Canada', extraLocations: ['Toronto', 'Winnipeg', 'Victoria'], html: '<p>Remote work within Canada.</p>' },
        { sourceId: '6', title: 'Production Technician', locationText: 'Alexandria, New South Wales, Australia', html: '<p>Build hardware.</p>' },
      ];
      const jobs = normalizeJobs(raws, { slug: 'anthropic', name: 'Anthropic' });
      return jobs.map((j) => ({ title: j.title, kind: j.salary && j.salary.kind, termWeeks: j.salary && j.salary.termWeeks, currency: j.salary && j.salary.currency, seniority: j.seniority, places: j.locations.map((l) => `${l.name}|${l.country}`), skills: j.keywords.skills }));
    });
    assertEq(out[0].kind, 'ote', 'sales range is OTE');
    assertEq(out[1].kind, 'salary', 'research range is base pay');
    assertEq([out[2].termWeeks, out[2].currency, out[2].kind].join(), '17,GBP,stipend', 'Fellows stipend for 17 weeks in London');
    assert(!out[2].skills.includes('CAD'), 'no CAD skill from the currency');
    assertEq(out[3].seniority, 'Mid', 'Account Director is not Director+');
    assert(out[4].places.every((p) => p.endsWith('|CA')), `Canada only: ${out[4].places}`);
    assertEq(out[5].places.join(), 'Sydney, Australia|AU', 'Alexandria, NSW is Sydney');
  });
}
