// fix3-data lane e2e (fix wave 3, 2026-10-11; docs/process/fix3-data.md): the pay and data fields
// of the beta persona review (BP-1, BP-2 Juice side, BP-5, BP-8, BP-9, BP-11, BP-14, BP-15, tag
// noise) reach users on both sites:
//   - static build: the dist/ and dist/beta/ bundles, re-derived from the stored snapshots (norm-8);
//   - browser: the bundled lib/juice.js and lib/normalize.js, run in Chromium on the shipped lists.
// Each test skips without a build (`npm run build`). Unit tests: test/fix3-data.test.js.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, assert, skip } from './harness.js';
import { unpackJobs, descPath } from '../../public/api.js';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const DIST = () => path.resolve(process.env.BETA_QA_DIST || path.join(ROOT, 'dist'));

/** A bundled list (unpacked), or null. */
function bundle(site, slug) {
  const file = path.join(DIST(), site, 'api', 'jobs', `${slug}.json`);
  if (!fs.existsSync(file)) return null;
  const body = JSON.parse(fs.readFileSync(file, 'utf8'));
  return body.mode === 'snapshot' ? unpackJobs(body) : null;
}

/** A job's sections: from the list, else from its description file (lists over budget move them). */
function sectionsOf(site, job) {
  const s = job.sections || {};
  if ((s.responsibilities || []).length || (s.fit || []).length) return s;
  const file = path.join(DIST(), site, descPath(job));
  if (!fs.existsSync(file)) return s;
  return JSON.parse(fs.readFileSync(file, 'utf8')).sections || s;
}

/** True when every "CAD" in the title and description is within 30 characters of an amount. */
function onlyCurrencyCad(site, job) {
  const file = path.join(DIST(), site, descPath(job));
  const html = typeof job.descriptionHtml === 'string' && job.descriptionHtml ? job.descriptionHtml : fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).descriptionHtml || '' : '';
  const text = `${job.title}\n${html.replace(/<[^>]+>/g, ' ')}`;
  const hits = [...text.matchAll(/\bCAD\b/g)];
  return hits.length > 0 && hits.every((m) => /[\d$]/.test(text.slice(Math.max(0, m.index - 30), m.index + 33)));
}

const ABBREV_RE = /\b(?:Mgmt|Mgr|SW|Sys|Eng|Engng|Engr|Ops|Bus|Mktg|Prod)\b/;
const IC_DIRECTOR_RE = /\b(?<!executive\s)(?:art|creative|technical)\s+director\b/i;
const STORES = { 'Piazza Liberty, Italy': 'Milan', 'Via del Corso, Italy': 'Rome', 'Shinsaibashi, Japan': 'Osaka', 'Umeda, Japan': 'Osaka', 'Rosny 2, France': 'Paris', 'Campania, Italy': 'Naples', 'Dublinas, Ireland': 'Dublin' };

/** Problems with one bundled board (empty = all good). */
function problems(site, slug, jobs) {
  const p = [];
  const sal = jobs.filter((j) => j.salary);
  // BP-1: a fixed-term salary always says how it was stated.
  const term = sal.filter((j) => j.salary.termWeeks > 0);
  const noInterval = term.filter((j) => !j.salary.originalInterval);
  if (noInterval.length) p.push(`${noInterval.length} of ${term.length} fixed-term salaries have no originalInterval, e.g. ${noInterval[0].title}`);
  if (slug === 'google' && term.length && !term.some((j) => j.salary.originalInterval === 'year')) p.push('no Google yearly-rate internship reads originalInterval "year"');
  // BP-5: no "CAD" skill on a posting whose every "CAD" is next to an amount (the currency).
  const cad = sal.filter((j) => j.salary.currency === 'CAD' && (j.keywords.skills || []).includes('CAD') && onlyCurrencyCad(site, j));
  if (cad.length) p.push(`${cad.length} Canadian-dollar postings carry the "CAD" skill from the currency alone, e.g. ${cad[0].title}`);
  // BP-8: plain department names.
  if (['nvidia', 'microsoft'].includes(slug)) {
    const ab = [...new Set(jobs.map((j) => j.department).filter((d) => d && ABBREV_RE.test(d)))];
    if (ab.length) p.push(`${ab.length} department names still abbreviated: ${ab.slice(0, 4).join('; ')}`);
  }
  // BP-9: part-time hourly pay is marked.
  if (slug === 'apple') {
    const pt = sal.filter((j) => /part/i.test(j.employmentType || '') && j.salary.originalInterval === 'hour');
    const unmarked = pt.filter((j) => j.salary.partTime !== true);
    if (!pt.length) p.push('no Apple part-time hourly posting');
    if (unmarked.length) p.push(`${unmarked.length} of ${pt.length} Apple part-time hourly postings lack salary.partTime`);
  }
  // BP-11: creative and technical directors are not Director+ from the title alone. VT-8 (fix wave 5, lead
  // decision): a level the company states itself wins, so Microsoft's "Art M6" (its manager track) stays Director+.
  const dir = jobs.filter((j) => IC_DIRECTOR_RE.test(j.title) && j.seniority === 'Director+' && j.seniorityBasis !== 'pay');
  if (dir.length) p.push(`${dir.length} art/creative/technical directors are Director+, e.g. ${dir[0].title}`);
  // BP-14: Google separates required and preferred qualifications.
  if (slug === 'google') {
    const sample = jobs.filter((_, i) => i % 25 === 0);
    const split = sample.filter((j) => (sectionsOf(site, j).preferred || []).length > 0);
    if (split.length < sample.length * 0.9) p.push(`only ${split.length} of ${sample.length} sampled Google postings have sections.preferred`);
  }
  // BP-15: store names and "Dublinas" are their city.
  for (const l of jobs.flatMap((j) => j.locations || [])) {
    const want = STORES[l.rawName];
    if (want && l.city !== want) p.push(`"${l.rawName}" is ${l.city || l.name}, not ${want}`);
  }
  // Tag noise: technician cards carry no TPUs, GCP or Transformers; no "Evals" on a field-repair manager.
  if (slug === 'google') {
    const tech = jobs.filter((j) => /^Data Center (?:Facilities )?Technician/.test(j.title) && (j.keywords.skills || []).some((s) => ['TPUs', 'GCP', 'Transformers'].includes(s)));
    if (tech.length) p.push(`${tech.length} data-centre technician postings tagged TPUs/GCP/Transformers, e.g. ${tech[0].title}: ${tech[0].keywords.skills}`);
  }
  if (slug === 'microsoft') {
    const fr = jobs.filter((j) => /Field Repair/.test(j.title) && (j.keywords.skills || []).includes('Evals'));
    if (fr.length) p.push(`"Evals" on ${fr[0].title}`);
  }
  return p;
}

/** Serve the build under /melon-seek/ on a free port, or null without a beta build. */
async function serveDist() {
  const dist = DIST();
  if (!fs.existsSync(path.join(dist, 'beta', 'index.html'))) return null;
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

export function registerFix3DataTests(suite) {
  for (const site of ['', 'beta']) {
    suite.test(`fix3-data: [static ${site || 'main'}] pay labels, tags, levels, sections, departments and places in the bundle`, async () => {
      const dir = path.join(DIST(), site, 'api', 'jobs');
      if (!fs.existsSync(dir)) skip(`dist/${site} not built (npm run build)`);
      const slugs = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
      const out = [];
      let checked = 0;
      for (const slug of slugs) {
        const jobs = bundle(site, slug);
        if (!jobs) continue;
        checked++;
        for (const pr of problems(site, slug, jobs)) out.push(`${slug}: ${pr}`);
      }
      if (!checked) skip('no real snapshots bundled');
      if (site === 'beta') for (const slug of ['google', 'microsoft', 'nvidia', 'apple']) if (!bundle(site, slug)) out.push(`${slug} is not bundled on the beta site`);
      assert(out.length === 0, out.join('\n'));
    });
  }

  suite.test('fix3-data: [browser] lib/juice.js gives no Juice from another country\'s pay or part-time hourly pay, and says why', async (ctx) => {
    const st = await serveDist();
    if (!st) skip('dist/beta not built (npm run build)');
    ctx.cleanup.push(() => st.close());
    const page = await ctx.browser.newPage();
    ctx.cleanup.push(() => page.close());
    await page.goto(`${st.base}/beta/`, { waitUntil: 'domcontentloaded' });
    const out = await page.evaluate(async () => {
      const api = await import('./api.js');
      const juice = await import('./lib/juice.js');
      const cities = await (await fetch('./api/cities.json')).json();
      const load = async (slug) => api.unpackJobs(await (await fetch(`./api/jobs/${slug}.json`)).json());
      const cohere = await load('cohere');
      const apple = await load('apple');
      juice.attachJuiceAll(cohere, cities);
      juice.attachJuiceAll(apple, cities);
      const all = [...cohere, ...apple];
      return {
        mismatch: all.filter((j) => j.juice && j.juice.byLocation.some((e) => e.currencyMismatch)).length,
        london: cohere.filter((j) => j.salary && j.salary.currency === 'CAD' && j.locations.some((l) => l.city === 'London') && !j.locations.some((l) => l.country === 'CA' && l.city))
          .map((j) => ({ title: j.title, juice: !!j.juice, why: j.juiceMissing && j.juiceMissing.code, text: j.juiceMissing && j.juiceMissing.text })),
        partTime: apple.filter((j) => j.salary && j.salary.partTime).map((j) => ({ hours: j.salary.hoursPerWeek || null, juice: !!j.juice, why: j.juiceMissing && j.juiceMissing.code })),
      };
    });
    assert(out.mismatch === 0, `${out.mismatch} postings still score Juice with currencyMismatch`);
    assert(out.london.length > 0, 'Cohere has a Canadian-dollar London posting');
    for (const l of out.london) assert(!l.juice && l.why === 'pay-other-country' && /Canadian dollars/.test(l.text), `${l.title}: ${JSON.stringify(l)}`);
    assert(out.partTime.length > 0, 'Apple has part-time hourly postings');
    for (const p of out.partTime) {
      if (p.hours) continue;
      assert(!p.juice && p.why === 'part-time-hours', `part-time without hours: ${JSON.stringify(p)}`);
    }
  });

  suite.test('fix3-data: [browser] lib/normalize.js splits required and preferred lists and keeps team paragraphs out of skills on a live board', async (ctx) => {
    const st = await serveDist();
    if (!st) skip('dist/ not built (npm run build)');
    ctx.cleanup.push(() => st.close());
    const page = await ctx.browser.newPage();
    ctx.cleanup.push(() => page.close());
    await page.goto(`${st.base}/`, { waitUntil: 'domcontentloaded' });
    const out = await page.evaluate(async () => {
      const { normalizeJobs } = await import('./lib/normalize.js');
      const team = '<p>Chrome is dedicated to building a better, more open web. Chrome is available across all major platforms — iOS, Android, Windows, Mac, Linux and Chrome OS.</p>';
      const post = (id, title, own, fit, pref, resp) => ({
        sourceId: id, title, locationText: 'Mountain View, CA',
        html: `<h3>Minimum qualifications:</h3><ul>${fit.map((x) => `<li>${x}</li>`).join('')}</ul><h3>Preferred qualifications:</h3><ul>${pref.map((x) => `<li>${x}</li>`).join('')}</ul><h3>About the job</h3><p>${own}</p>${team}<h3>Responsibilities</h3><ul>${resp.map((x) => `<li>${x}</li>`).join('')}</ul>`,
      });
      const raws = [
        post('1', 'Product Manager I, Chrome Web Store', 'Keep the Web Store safe.', ['3 years of experience in product management.'], ['5 years of experience in trust and safety.'], ['Lead the extension review strategy.']),
        post('2', 'Software Engineer, Chrome iOS', 'Build Chrome for iOS.', ['Experience with iOS development in Swift.'], ['Experience with Objective-C.'], ['Write iOS code.']),
        post('3', 'Technical Program Manager, Chrome', 'Run Chrome releases.', ['5 years of program management.'], ['Experience with browsers.'], ['Coordinate releases.']),
      ];
      return normalizeJobs(raws, { slug: 'acme', name: 'Acme' }).map((j) => ({ title: j.title, fit: j.sections.fit, preferred: j.sections.preferred || null, skills: j.keywords.skills, years: j.keywords.fit.filter((x) => /yrs/.test(x)) }));
    });
    assert(out[0].preferred && out[0].preferred.length === 1 && out[0].fit.length === 1, `split: ${JSON.stringify(out[0])}`);
    assert(out[0].years.join() === '3+ yrs', `the required years: ${out[0].years}`);
    assert(!out[0].skills.includes('iOS'), `no iOS from the team paragraph: ${out[0].skills}`);
    assert(out[1].skills.includes('iOS'), `the iOS engineer keeps iOS: ${out[1].skills}`);
  });
}
