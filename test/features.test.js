// Unit tests for public/features/* (Compstimate + Market insights pure logic).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  estimateComp, compstimateForJob, normalizeTitle, roleFamily, inferSeniority, senioritySim,
  resolveLocation, locationSim, titleSuggestions, locationOptions, SENIORITY_LADDER,
} from '../public/features/compstimate.js';
import {
  percentile, median, skillPremiums, deptBoxes, hotLocations, fitRequirements,
  topResponsibilities, summaryStats,
} from '../public/features/insights.js';
import { weightedPercentile, toUSD, salaryUSD, formatDelta, formatPct, h, FX_FALLBACK } from '../public/features/shared.js';
import { fakeJobs } from '../public/features/demo-data.js';

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

let seq = 0;
const SF = { name: 'San Francisco, CA', city: 'San Francisco', region: 'CA', country: 'US', lat: 37.77, lng: -122.42, remote: false };
const NYC = { name: 'New York City, NY', city: 'New York', region: 'NY', country: 'US', lat: 40.71, lng: -74.01, remote: false };
const SEA = { name: 'Seattle, WA', city: 'Seattle', region: 'WA', country: 'US', lat: 47.61, lng: -122.33, remote: false };
const LON = { name: 'London, UK', city: 'London', region: 'England', country: 'GB', lat: 51.51, lng: -0.13, remote: false };
const REMOTE_US = { name: 'Remote (US)', city: null, region: null, country: 'US', lat: null, lng: null, remote: true };

function job({ title = 'Software Engineer', seniority = 'Mid', department = 'Engineering', locations = [SF],
  mid = 200000, spread = 0.15, currency = 'USD', salary, skills = [], fit = [], responsibilities = [], id } = {}) {
  seq += 1;
  const s = salary !== undefined ? salary
    : mid == null ? null
      : { min: Math.round(mid * (1 - spread)), max: Math.round(mid * (1 + spread)), mid, currency, interval: 'year', text: '' };
  return {
    id: id || `t:${seq}`, company: 't', companyName: 'Test', title, department, team: null, employmentType: 'Full-time',
    seniority, locations, remote: locations.some((l) => l.remote), salary: s, url: '', updatedAt: null,
    descriptionHtml: '', sections: { responsibilities: [], fit: [] }, keywords: { responsibilities, fit, skills },
  };
}

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${a} ≈ ${b} (±${tol})`);

// ---------------------------------------------------------------------------
// stats helpers
// ---------------------------------------------------------------------------

describe('percentile / median', () => {
  test('linear interpolation (numpy default)', () => {
    assert.equal(percentile([4, 1, 3, 2], 0.5), 2.5);
    assert.equal(percentile([1, 2, 3, 4], 0), 1);
    assert.equal(percentile([1, 2, 3, 4], 1), 4);
    assert.equal(percentile([1, 2, 3, 4], 0.25), 1.75);
    assert.equal(percentile([10, 20, 30, 40, 50], 0.9), 46);
  });
  test('ignores non-finite values, clamps p, handles empty', () => {
    assert.equal(percentile([null, 5, NaN, undefined, 'x', 15], 0.5), 10);
    assert.equal(percentile([], 0.5), null);
    assert.equal(percentile(null, 0.5), null);
    assert.equal(percentile([7], 0.3), 7);
    assert.equal(percentile([1, 2], 5), 2);
    assert.equal(median([3, 1, 2]), 2);
  });
});

describe('weightedPercentile', () => {
  test('equal weights interpolate between centres', () => {
    assert.equal(weightedPercentile([[1, 1], [3, 1]], 0.5), 2);
    assert.equal(weightedPercentile([[1, 1], [3, 1]], 0.1), 1); // clamps below first centre
    assert.equal(weightedPercentile([[1, 1], [3, 1]], 0.95), 3);
  });
  test('heavier weight pulls the median', () => {
    const m = weightedPercentile([[100, 9], [200, 1]], 0.5);
    assert.ok(m < 110, `got ${m}`);
  });
  test('empty / zero weights -> null; single -> value', () => {
    assert.equal(weightedPercentile([], 0.5), null);
    assert.equal(weightedPercentile([[5, 0]], 0.5), null);
    assert.equal(weightedPercentile([[5, 2]], 0.9), 5);
  });
});

describe('FX + salary', () => {
  test('toUSD uses palette rates, fallback table, null for unknown', () => {
    assert.equal(toUSD(100, 'USD'), 100);
    near(toUSD(100000, 'GBP'), 127000, 1);
    near(toUSD(100000, 'inr'), 100000 * FX_FALLBACK.INR, 1e-6);
    assert.equal(toUSD(100, 'XYZ'), null);
    assert.equal(toUSD(null, 'USD'), null);
  });
  test('salaryUSD derives mid, converts, annualizes obvious hourly values', () => {
    const p = salaryUSD({ salary: { min: 100000, max: 140000, currency: 'GBP', interval: 'year' } });
    near(p.mid, 120000 * 1.27, 1);
    assert.equal(p.converted, true);
    assert.equal(salaryUSD({ salary: null }), null);
    assert.equal(salaryUSD({ salary: { min: 1, max: 2, currency: 'XYZ' } }), null);
    near(salaryUSD({ salary: { min: 50, max: 50, interval: 'hour', currency: 'USD' } }).mid, 104000, 1);
  });
  test('formatting', () => {
    assert.equal(formatDelta(42000), '+$42K');
    assert.equal(formatDelta(-18000), '−$18K');
    assert.equal(formatDelta(100), '±$0');
    assert.equal(formatPct(0.384), '38%');
    assert.equal(formatPct(0.004), '<1%');
  });
});

// ---------------------------------------------------------------------------
// title normalization
// ---------------------------------------------------------------------------

describe('title normalization', () => {
  test('abbreviations, level words and synonyms', () => {
    const n = normalizeTitle('Sr. SWE, Platform');
    assert.deepEqual(n.tokens, ['software', 'engineer', 'platform']);
    assert.equal(n.family, 'swe');
    assert.equal(n.seniority, 'Senior');
    assert.deepEqual(normalizeTitle('Software Developer').tokens, normalizeTitle('Software Engineer').tokens);
    assert.deepEqual(normalizeTitle('ML Engineer').tokens, normalizeTitle('Machine Learning Engineer').tokens);
    assert.deepEqual(normalizeTitle('Staff Back-end Engineer II').tokens, ['backend', 'engineer']);
  });
  test('role families', () => {
    assert.equal(roleFamily('Product Designer'), 'design');
    assert.equal(roleFamily('Product Counsel'), 'legal');
    assert.equal(roleFamily('Product Manager, API'), 'product');
    assert.equal(roleFamily('Account Executive, Startups'), 'sales');
    assert.equal(roleFamily('Research Scientist, Alignment'), 'ml');
    assert.equal(roleFamily('Engineering Manager, Platform'), 'eng-manager');
    assert.equal(roleFamily('Policy Analyst'), 'legal');
    assert.equal(roleFamily('Data Scientist'), 'data');
    assert.equal(roleFamily('Electrical Engineer'), 'hardware');
    assert.equal(roleFamily('Pastry Chef'), null);
    // the role part before the comma wins over the team name
    assert.equal(normalizeTitle('Software Engineer, Inference').family, 'swe');
  });
  test('inferSeniority', () => {
    assert.equal(inferSeniority('Staff Software Engineer'), 'Staff+');
    assert.equal(inferSeniority('Senior Product Manager'), 'Senior');
    assert.equal(inferSeniority('Engineering Manager, Platform'), 'Manager');
    assert.equal(inferSeniority('Head of Product'), 'Director+');
    assert.equal(inferSeniority('Software Engineer Intern'), 'Intern');
    assert.equal(inferSeniority('New Grad Software Engineer'), 'Entry');
    assert.equal(inferSeniority('Software Engineer'), null);
  });
  test('senioritySim decays with ladder distance', () => {
    assert.equal(senioritySim('Senior', 'Senior'), 1);
    assert.ok(senioritySim('Senior', 'Staff+') > senioritySim('Senior', 'Entry'));
    assert.ok(senioritySim('', 'Intern') < senioritySim('', 'Mid'));
    assert.deepEqual(SENIORITY_LADDER, ['Intern', 'Entry', 'Mid', 'Senior', 'Staff+', 'Manager', 'Director+']);
  });
});

// ---------------------------------------------------------------------------
// estimateComp
// ---------------------------------------------------------------------------

describe('estimateComp', () => {
  const swe = Array.from({ length: 8 }, (_, i) => job({ title: i % 2 ? 'Senior Software Engineer, Platform' : 'Senior Software Engineer', seniority: 'Senior', mid: 200000 + i * 2000 }));
  const ae = Array.from({ length: 8 }, () => job({ title: 'Account Executive', department: 'Sales', seniority: 'Mid', mid: 120000 }));
  const board = [...swe, ...ae];

  test('"Senior SWE" matches Software Engineers, not sales', () => {
    const r = estimateComp(board, { title: 'Senior SWE' });
    near(r.mid, 207000, 6000);
    assert.equal(r.currency, 'USD');
    assert.ok(r.comparables.length <= 5 && r.comparables.length > 0);
    assert.ok(r.comparables.every((j) => /Software Engineer/.test(j.title)));
    assert.equal(r.n, 8);
    assert.equal(r.confidence, 'High');
    assert.ok(r.low <= r.mid && r.mid <= r.high);
    assert.equal(r.scores.length, r.comparables.length);
    assert.match(r.explanation, /8 salaried roles/);
  });

  test('seniority match shifts the estimate', () => {
    const jobs = [
      ...Array.from({ length: 5 }, () => job({ title: 'Software Engineer', seniority: 'Mid', mid: 150000 })),
      ...Array.from({ length: 5 }, () => job({ title: 'Staff Software Engineer', seniority: 'Staff+', mid: 320000 })),
    ];
    const staff = estimateComp(jobs, { title: 'Software Engineer', seniority: 'Staff+' });
    const mid = estimateComp(jobs, { title: 'Software Engineer', seniority: 'Mid' });
    assert.ok(staff.mid > mid.mid);
    near(staff.mid, 320000, 25000);
    near(mid.mid, 150000, 25000);
    // a level word in the title is used when no level is selected
    assert.equal(estimateComp(jobs, { title: 'Staff Software Engineer' }).query.seniority, 'Staff+');
  });

  test('location: same city > same country > other country', () => {
    const jobs = [
      ...Array.from({ length: 4 }, () => job({ locations: [SF], mid: 220000 })),
      ...Array.from({ length: 4 }, () => job({ locations: [LON], mid: 90000, currency: 'GBP' })),
      job({ locations: [SEA], mid: 200000, id: 'sea' }),
    ];
    const sf = estimateComp(jobs, { title: 'Software Engineer', location: 'San Francisco' });
    const lon = estimateComp(jobs, { title: 'Software Engineer', location: 'London' });
    assert.ok(sf.mid > lon.mid, `${sf.mid} > ${lon.mid}`);
    near(lon.mid, 90000 * 1.27, 15000);
    const ql = resolveLocation('Seattle', jobs);
    assert.equal(ql.country, 'US');
    const nyQ = resolveLocation('New York', [...jobs, job({ locations: [NYC] })]);
    assert.ok(locationSim(nyQ, jobs.find((j) => j.id === 'sea')) > locationSim(nyQ, jobs[5]));
    assert.equal(locationSim(resolveLocation('Remote', jobs), job({ locations: [REMOTE_US] })), 1);
    assert.equal(locationSim(null, jobs[0]), 1);
  });

  test('converts non-USD bands and says so', () => {
    const r = estimateComp([job({ title: 'Research Engineer', locations: [LON], mid: 100000, currency: 'GBP' })], { title: 'Research Engineer' });
    near(r.mid, 127000, 1000);
    assert.equal(r.n, 1);
    assert.equal(r.confidence, 'Low');
    assert.match(r.explanation, /converted at approximate rates/);
  });

  test('ignores jobs without usable pay; empty and unmatched queries give nulls', () => {
    const noPay = [job({ mid: null }), job({ salary: { min: 1, max: 2, currency: 'XYZ' } })];
    const r = estimateComp(noPay, { title: 'Software Engineer' });
    assert.deepEqual([r.low, r.mid, r.high, r.n, r.comparables.length], [null, null, null, 0, 0]);
    assert.equal(r.confidence, 'Low');
    assert.equal(estimateComp([], {}).mid, null);
    assert.equal(estimateComp(null, {}).mid, null);
    const chef = estimateComp(board, { title: 'Pastry Chef' });
    assert.equal(chef.mid, null);
    assert.match(chef.explanation, /Pastry Chef/);
  });

  test('department preference', () => {
    const jobs = [
      ...Array.from({ length: 3 }, () => job({ title: 'Program Manager', department: 'Engineering', mid: 250000 })),
      ...Array.from({ length: 3 }, () => job({ title: 'Program Manager', department: 'Operations', mid: 150000 })),
    ];
    const eng = estimateComp(jobs, { title: 'Program Manager', department: 'Engineering' });
    const ops = estimateComp(jobs, { title: 'Program Manager', department: 'Operations' });
    assert.ok(eng.mid > ops.mid);
    assert.equal(eng.comparables[0].department, 'Engineering');
  });

  test('no title -> board-wide estimate capped at Low confidence', () => {
    const r = estimateComp(board, {});
    assert.equal(r.n, board.length);
    assert.equal(r.confidence, 'Low');
    assert.match(r.explanation, /Add a role title/);
  });

  test('excludeId / compstimateForJob exclude the posting itself', () => {
    const target = job({ title: 'Senior Software Engineer', seniority: 'Senior', mid: 999000, id: 'target' });
    const jobs = [...board, target];
    const r = compstimateForJob(jobs, target);
    assert.ok(!r.comparables.some((j) => j.id === 'target'));
    assert.ok(r.mid < 300000);
    assert.equal(estimateComp(jobs, { title: 'x', excludeId: 'target' }).comparables.some((j) => j.id === 'target'), false);
  });

  test('invariants on a realistic fake board', () => {
    const jobs = fakeJobs('acme', 140);
    for (const q of [{ title: 'Software Engineer' }, { title: 'Senior SWE', location: 'San Francisco' }, { title: 'Research Engineer', seniority: 'Staff+' },
      { title: 'Account Executive', location: 'London' }, { title: 'Recruiter', location: 'Remote' }, { title: 'Product Designer', seniority: 'Senior' }]) {
      const r = estimateComp(jobs, q);
      assert.ok(r.mid > 0, JSON.stringify(q));
      assert.ok(r.low <= r.mid && r.mid <= r.high, JSON.stringify(q));
      assert.ok(['High', 'Medium', 'Low'].includes(r.confidence));
      assert.ok(r.comparables.length <= 5);
      for (let i = 1; i < r.scores.length; i++) assert.ok(r.scores[i - 1] >= r.scores[i]);
      assert.ok(r.comparables.every((j) => j.salary));
    }
    // Staff research pays more than mid-level recruiting
    assert.ok(estimateComp(jobs, { title: 'Research Engineer', seniority: 'Staff+' }).mid > estimateComp(jobs, { title: 'Recruiter', seniority: 'Mid' }).mid);
  });

  test('form helpers', () => {
    const jobs = [job({ title: 'Senior Software Engineer, Platform' }), job({ title: 'Software Engineer' }), job({ title: 'Staff Software Engineer', locations: [NYC, SF] }), job({ title: 'Recruiter', locations: [REMOTE_US] })];
    const t = titleSuggestions(jobs);
    assert.equal(t[0], 'Software Engineer');
    assert.ok(t.includes('Software Engineer, Platform'));
    assert.ok(!t.some((x) => /^(Senior|Staff) /.test(x)));
    const locs = locationOptions(jobs);
    assert.deepEqual(locs[0], { value: 'San Francisco', label: 'San Francisco', count: 3 });
    assert.ok(locs.some((o) => o.value === 'Remote' && o.count === 1));
  });
});

// ---------------------------------------------------------------------------
// insights stats
// ---------------------------------------------------------------------------

describe('insights stats', () => {
  const jobs = [
    job({ mid: 100000, skills: ['Python'], fit: ['PhD'], responsibilities: ['Research'] }),
    job({ mid: 200000, skills: ['Python'], fit: ['PhD', '5+ yrs'], responsibilities: ['Research'] }),
    job({ mid: 300000, skills: ['Python', 'Python'], fit: ['PhD'], responsibilities: ['Hiring'] }),
    job({ mid: 100000, skills: ['Go'], fit: ['5+ yrs'], department: 'Sales', locations: [NYC, SF] }),
    job({ mid: 100000, skills: ['Go'], department: 'Sales', locations: [NYC] }),
    job({ mid: 100000, skills: ['Go'], department: 'Sales', locations: [REMOTE_US] }),
    job({ mid: 150000, department: null }),
    job({ mid: null, skills: ['Go', 'Rust'], fit: ['PhD'] }),
  ];

  test('skillPremiums: median with skill minus overall median', () => {
    const r = skillPremiums(jobs);
    assert.equal(r.baseline, 100000); // median of 100,200,300,100,100,100,150
    assert.equal(r.salaried, 7);
    assert.deepEqual(r.items.map((i) => i.skill), ['Python', 'Go']);
    assert.deepEqual(r.items[0], { skill: 'Python', n: 3, count: 3, median: 200000, premium: 100000 });
    assert.equal(r.items[1].premium, 0);
    assert.equal(r.items[1].count, 4); // unsalaried job still counted
    assert.equal(skillPremiums(jobs, { minCount: 4 }).items.length, 0);
    assert.equal(skillPremiums(jobs, { limit: 1 }).items.length, 1);
    assert.deepEqual(skillPremiums([]).items, []);
  });

  test('deptBoxes: percentiles per department, sorted by median', () => {
    const eng = [100, 200, 300, 400, 500].map((k) => job({ mid: k * 1000 }));
    const sales = [50, 60].map((k) => job({ mid: k * 1000, department: 'Sales' }));
    const boxes = deptBoxes([...sales, ...eng, job({ mid: 70000, department: null }), job({ mid: null })]);
    assert.deepEqual(boxes.map((b) => b.department), ['Engineering', 'Other', 'Sales']);
    const e = boxes[0];
    assert.equal(e.n, 5);
    near(e.p10, 140000, 1e-6); near(e.p25, 200000, 1e-6); near(e.median, 300000, 1e-6);
    near(e.p75, 400000, 1e-6); near(e.p90, 460000, 1e-6);
    assert.ok(e.min <= e.p10 && e.p90 <= e.max);
    assert.equal(deptBoxes(sales, { minCount: 3 }).length, 0);
    assert.equal(deptBoxes([job({ department: null })], { includeOther: false }).length, 0);
  });

  test('hotLocations: multi-location jobs count once per city; remote bucket', () => {
    const locs = hotLocations(jobs);
    const byKey = Object.fromEntries(locs.map((l) => [l.location, l]));
    assert.equal(byKey['San Francisco'].count, 6);
    assert.equal(byKey['New York'].count, 2);
    assert.equal(byKey['New York'].median, 100000);
    assert.equal(byKey.Remote.remote, true);
    assert.equal(byKey.Remote.count, 1);
    assert.equal(locs[0].location, 'San Francisco');
    assert.equal(hotLocations(jobs, { limit: 2 }).length, 2);
  });

  test('fitRequirements: share of roles and pay premium', () => {
    const r = fitRequirements(jobs);
    assert.equal(r.total, 8);
    const phd = r.items.find((i) => i.label === 'PhD');
    assert.equal(phd.count, 4);
    assert.equal(phd.pct, 0.5);
    assert.equal(phd.median, 200000);
    assert.equal(phd.premium, 100000);
    const five = r.items.find((i) => i.label === '5+ yrs');
    assert.equal(five.median, null); // only 2 salaried -> below minPremiumN
    assert.equal(r.items[0].label, 'PhD');
  });

  test('topResponsibilities + summaryStats', () => {
    assert.deepEqual(topResponsibilities(jobs)[0], { label: 'Research', count: 2, pct: 0.25 });
    const s = summaryStats(jobs);
    assert.equal(s.total, 8);
    assert.equal(s.salaried, 7);
    assert.equal(s.median, 100000);
    near(s.remoteShare, 1 / 8, 1e-9);
    assert.equal(summaryStats([]).median, null);
  });
});

// ---------------------------------------------------------------------------
// DOM helper safety (REVIEW.md L9) with a minimal fake document
// ---------------------------------------------------------------------------

describe('h() DOM builder', () => {
  function withFakeDocument(fn) {
    class El {
      constructor(tag) { this.tagName = tag; this.attrs = {}; this.listeners = {}; this.children = []; this.dataset = {}; this.style = { setProperty(k, v) { this[k] = v; } }; }
      setAttribute(k, v) { this.attrs[k] = String(v); }
      addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }
      appendChild(c) { this.children.push(c); return c; }
    }
    const prev = globalThis.document;
    globalThis.document = { createElement: (t) => new El(t), createElementNS: (_ns, t) => new El(t), createTextNode: (text) => ({ text }) };
    try { fn(); } finally { if (prev === undefined) delete globalThis.document; else globalThis.document = prev; }
  }

  test('blocks on* string attributes and unsafe URLs; keeps function handlers', () => {
    withFakeDocument(() => {
      const fn = () => {};
      const el = h('a', {
        onclick: 'alert(1)', ONMOUSEOVER: 'alert(2)', onfocus: fn, href: 'javascript:alert(3)',
        srcdoc: '<script>x</script>', title: 'ok', class: 'c',
      }, 'text <b>not html</b>');
      assert.equal(el.attrs.onclick, undefined);
      assert.equal(el.attrs.ONMOUSEOVER, undefined);
      assert.equal(el.attrs.href, undefined);
      assert.equal(el.attrs.srcdoc, undefined);
      assert.equal(el.attrs.title, 'ok');
      assert.equal(el.attrs.class, 'c');
      assert.deepEqual(el.listeners.focus, [fn]);
      assert.deepEqual(el.children, [{ text: 'text <b>not html</b>' }]);
      assert.equal(h('a', { href: 'https://example.com/x' }).attrs.href, 'https://example.com/x');
      assert.equal(h('a', { href: '#frag' }).attrs.href, '#frag');
      assert.equal(h('a', { href: ' data:text/html,hi' }).attrs.href, undefined);
    });
  });
});
