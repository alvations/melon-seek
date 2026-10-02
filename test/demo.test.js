import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoJobs, DEMO_CATALOGS } from '../server/demo.js';
import { extractSections, extractKeywords, inferSeniority } from '../server/keywords.js';
import { geocode } from '../server/geo.js';

const COMPANIES = [
  ['anthropic', 'Anthropic', 'https://job-boards.greenhouse.io/anthropic'],
  ['anduril', 'Anduril', 'https://job-boards.greenhouse.io/andurilindustries'],
  ['openai', 'OpenAI', 'https://jobs.ashbyhq.com/openai'],
  ['greenhouse-acme', 'Acme', 'https://job-boards.greenhouse.io/acme'],
];

const RAW_KEYS = ['department', 'employmentType', 'extraLocations', 'html', 'locationText', 'remote', 'salary', 'sourceId', 'team', 'text', 'title', 'updatedAt', 'url'];

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
      assert.deepEqual(Object.keys(j).sort(), RAW_KEYS);
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
