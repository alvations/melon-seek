import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoJobs, DEMO_CATALOGS } from '../server/demo.js';
import { extractSections, extractKeywords, inferSeniority } from '../server/keywords.js';
import { geocode } from '../server/geo.js';
import { extractCompExtras } from '../server/keywords.js';
import { parseSalary } from '../server/salary.js';
import { normalizeJobs } from '../server/normalize.js';

const COMPANIES = [
  ['anthropic', 'Anthropic', 'https://job-boards.greenhouse.io/anthropic'],
  ['anduril', 'Anduril', 'https://job-boards.greenhouse.io/andurilindustries'],
  ['openai', 'OpenAI', 'https://jobs.ashbyhq.com/openai'],
  ['greenhouse-acme', 'Acme', 'https://job-boards.greenhouse.io/acme'],
];

const RAW_KEYS = ['department', 'employmentType', 'extraLocations', 'html', 'locationText', 'postedAt', 'remote', 'reqId', 'salary', 'sourceId', 'team', 'text', 'title', 'updatedAt', 'url'];
const OPTIONAL_KEYS = ['compensationSummary', 'payRanges'];

test('built-in catalogs exist', () => {
  assert.deepEqual(DEMO_CATALOGS.sort(), ['anduril', 'anthropic', 'openai']);
});

for (const [slug, name, root] of COMPANIES) {
  test(`demoJobs(${slug}): shape, count, determinism`, () => {
    const jobs = demoJobs(slug, name);
    assert.ok(jobs.length >= 60 && jobs.length <= 150, `count ${jobs.length}`);
    assert.deepEqual(demoJobs(slug, name), jobs, 'deterministic');
    const ids = new Set();
    for (const j of jobs) {
      assert.deepEqual(Object.keys(j).filter((k) => !OPTIONAL_KEYS.includes(k)).sort(), RAW_KEYS);
      assert.match(j.sourceId, /^demo-/);
      assert.ok(!ids.has(j.sourceId));
      ids.add(j.sourceId);
      assert.equal(j.url, root);
      assert.equal(typeof j.title, 'string');
      assert.ok(Array.isArray(j.extraLocations));
      assert.equal(typeof j.remote, 'boolean');
      assert.ok(!Number.isNaN(Date.parse(j.updatedAt)));
      assert.match(j.html, /About the role/);
      assert.match(j.html, /not a real job listing/);
      assert.ok(!/<[a-z]/i.test(j.text), 'text has no tags');
    }
  });

  test(`demoJobs(${slug}): pipeline exercised`, () => {
    const jobs = demoJobs(slug, name);
    let withSalary = 0;
    let gbp = 0;
    const skills = new Set();
    const seniorities = new Set();
    for (const j of jobs) {
      const s = extractSections(j.html);
      assert.ok(s.responsibilities.length >= 4, `${j.title} resp`);
      assert.ok(s.fit.length >= 3, `${j.title} fit`);
      const kw = extractKeywords({ title: j.title, department: j.department, sections: s, text: j.text });
      kw.skills.forEach((x) => skills.add(x));
      seniorities.add(inferSeniority(j.title));
      if (/[$£€]\d/.test(j.text)) withSalary++;
      if (/£\d/.test(j.text)) gbp++;
      for (const loc of geocode([j.locationText, ...j.extraLocations])) {
        assert.ok(loc.remote || loc.lat != null, `unresolved location ${loc.name}`);
      }
    }
    const missing = 1 - withSalary / jobs.length;
    assert.ok(missing > 0.03 && missing < 0.3, `missing salary ratio ${missing}`);
    assert.ok(skills.size >= 30, `skills ${skills.size}`);
    assert.ok(seniorities.size >= 4);
    if (slug !== 'anduril') assert.ok(gbp > 0, 'some GBP salaries');
  });
}

test('salary text format and ranges', () => {
  const a = demoJobs('anthropic', 'Anthropic');
  const m = a.map((j) => /Annual Salary: \$([\d,]+)—\$([\d,]+) USD/.exec(j.text)).filter(Boolean);
  assert.ok(m.length > 40);
  for (const [, lo, hi] of m) {
    const min = +lo.replace(/,/g, '');
    const max = +hi.replace(/,/g, '');
    assert.ok(min >= 150000 && max <= 690000 && max > min, `${min}-${max}`);
  }
  const london = a.filter((j) => j.locationText === 'London, UK' && /£/.test(j.text));
  assert.ok(london.every((j) => /£[\d,]+—£[\d,]+ GBP/.test(j.text)));
  const d = demoJobs('anduril', 'Anduril');
  for (const j of d) {
    const x = /\$([\d,]+)—\$([\d,]+) USD/.exec(j.text);
    if (x) assert.ok(+x[1].replace(/,/g, '') >= 90000 && +x[2].replace(/,/g, '') <= 350000);
  }
  // OpenAI demo mimics Ashby structured compensation.
  const o = demoJobs('openai', 'OpenAI');
  assert.ok(o.some((j) => j.salary && j.salary.min > 0 && j.salary.currency === 'USD'));
});

test('different companies get different catalogs; custom name is escaped', () => {
  const a = demoJobs('anthropic', 'Anthropic').map((j) => j.title);
  const b = demoJobs('anduril', 'Anduril').map((j) => j.title);
  assert.notDeepEqual(a, b);
  assert.ok(b.some((t) => /GNC|Embedded|Manufacturing/.test(t)));
  const evil = demoJobs('lever-x', '<script>alert(1)</script>');
  assert.ok(evil.every((j) => !j.html.includes('<script>')));
  assert.equal(evil[0].url, 'https://jobs.lever.co/x');
  assert.equal(demoJobs('mystery', 'Mystery')[0].url, null);
  assert.equal(demoJobs('mystery', 'Mystery', { source: 'ashby', board: 'm' })[0].url, 'https://jobs.ashbyhq.com/m');
});

const BASE = Date.UTC(2026, 8, 30, 12);
const DAY = 86400000;

test('F4: postedAt spread 1-400 days across freshness bands; updatedAt >= postedAt; reqId', () => {
  for (const [slug, name] of COMPANIES) {
    const jobs = demoJobs(slug, name);
    const bands = { new: 0, active: 0, stale: 0, evergreen: 0 };
    for (const j of jobs) {
      const age = (BASE - Date.parse(j.postedAt)) / DAY;
      assert.ok(age >= 1 && age <= 401, `${slug} age ${age}`);
      assert.ok(Date.parse(j.updatedAt) >= Date.parse(j.postedAt), 'updated after posted');
      assert.ok(Date.parse(j.updatedAt) <= BASE);
      bands[age <= 7 ? 'new' : age < 60 ? 'active' : age < 180 ? 'stale' : 'evergreen']++;
    }
    for (const [b, n] of Object.entries(bands)) assert.ok(n >= 3, `${slug} ${b} ${n}`);
    assert.ok(bands.evergreen < jobs.length * 0.35, 'evergreen is a minority');
    const reqIds = jobs.map((j) => j.reqId);
    if (slug === 'openai') assert.ok(reqIds.every((r) => r === null), 'Ashby has no reqId');
    else {
      assert.ok(reqIds.every((r) => typeof r === 'string' && r.startsWith('DEMO-')));
      assert.equal(new Set(reqIds).size, reqIds.length);
    }
  }
});

test('F2: demo text exercises equity / bonus extras, DEI and nice-to-have negatives', () => {
  for (const [slug, name] of COMPANIES) {
    const jobs = demoJobs(slug, name);
    const ex = jobs.map((j) => extractCompExtras([j.text, j.compensationSummary, j.salary && j.salary.text].filter(Boolean).join('\n'), { title: j.title }));
    const eq = ex.filter((x) => x.equity).length;
    const bn = ex.filter((x) => x.bonus).length;
    assert.ok(eq > 5 && eq < jobs.length, `${slug} equity ${eq}/${jobs.length}`);
    assert.ok(bn > 3 && bn < jobs.length / 2, `${slug} bonus ${bn}/${jobs.length}`);
    assert.ok(jobs.some((j) => /diversity, equity and inclusion/.test(j.text)), 'DEI sense present');
    assert.ok(jobs.some((j) => /It's a bonus if you have/.test(j.text)), 'nice-to-have bonus present');
  }
  // interns never get the full-time-only equity line credited
  const anduril = demoJobs('anduril', 'Anduril').filter((j) => /\bIntern(ship)?\b/.test(j.title));
  assert.ok(anduril.length > 0);
  for (const j of anduril) assert.equal(extractCompExtras(j.text, { title: j.title }).equity, false);
  // sales roles carry commission
  const sales = demoJobs('openai', 'OpenAI').filter((j) => /Account Executive/.test(j.title) && j.compensationSummary);
  assert.ok(sales.length > 0 && sales.every((j) => /Offers Commission/.test(j.compensationSummary)));
});

test('F2: some demo postings have multi-zone pay (text and structured)', () => {
  for (const [slug, name] of COMPANIES) {
    const jobs = demoJobs(slug, name);
    const zoned = jobs.filter((j) => /all other US locations/.test(j.text) || (j.salary && j.salary.zones > 1));
    assert.ok(zoned.length >= 3 && zoned.length < jobs.length * 0.3, `${slug} zoned ${zoned.length}`);
    if (slug === 'openai') {
      for (const j of zoned) {
        assert.equal(j.salary.zones, 2);
        assert.equal(j.payRanges.length, 2);
        assert.match(j.compensationSummary, /Multiple Ranges/);
      }
    } else {
      for (const j of zoned) assert.equal(parseSalary(j.text).zones, 2, j.title);
    }
  }
});

test('BUG-5: demo boilerplate is on every posting but never becomes a board-wide chip', () => {
  const triggers = { anthropic: ['Interpretability', 'Multimodal', 'RL'], anduril: ['Computer vision', 'Networking', 'Sensor fusion', 'Security'], openai: ['Security'], 'greenhouse-acme': ['Kubernetes', 'AWS', 'Security'] };
  for (const [slug, name] of COMPANIES) {
    const raw = demoJobs(slug, name);
    assert.ok(raw.every((j) => j.html.includes(`About ${name}`)), 'shared About blurb on every posting');
    const jobs = normalizeJobs(raw, { slug, name });
    assert.ok(Array.isArray(jobs.droppedKeywords?.skills), 'droppedKeywords recorded');
    const counts = new Map();
    for (const j of jobs) for (const f of ['skills', 'responsibilities', 'fit']) for (const l of new Set(j.keywords[f])) counts.set(`${f}:${l}`, (counts.get(`${f}:${l}`) || 0) + 1);
    for (const [k, n] of counts) assert.ok(n / jobs.length <= 0.9, `${slug} ${k} on ${n}/${jobs.length}`);
    for (const t of triggers[slug]) {
      const n = counts.get(`skills:${t}`) || 0;
      assert.ok(n < jobs.length * 0.6, `${slug} boilerplate skill ${t} on ${n}/${jobs.length}`);
    }
    assert.ok(jobs.every((j, i) => j.descriptionHtml === raw[i].html), 'descriptionHtml untouched');
    assert.ok(jobs.some((j) => j.extras.equity), 'extras still read the full text');
  }
  // Anduril's per-role intro says "autonomous systems" on every posting (not exact
  // boilerplate), so the 90% guard catches it.
  const anduril = normalizeJobs(demoJobs('anduril', 'Anduril'), { slug: 'anduril', name: 'Anduril' });
  assert.ok(anduril.droppedKeywords.skills.some((d) => d.label === 'Autonomy'));
});
