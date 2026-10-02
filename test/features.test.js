// Unit tests for public/features/* (Compstimate + Market insights pure logic).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  estimateComp, compstimateForJob, normalizeTitle, roleFamily, inferSeniority, senioritySim,
  resolveLocation, locationSim, titleSuggestions, locationOptions, SENIORITY_LADDER,
  backtest, accuracyLine, accuracyFrom, isLowAccuracy, displayConfidence, ACCURACY_LOW_THRESHOLD, BACKTEST_SEED,
  FAMILY_LABELS, queryFromState, FAMILY_TITLES,
} from '../public/features/compstimate.js';
import fsSync from 'node:fs';
import * as roles from '../public/features/roles.js';
import { marketCells, marketComps, compsForJob, familyOptions } from '../public/features/comps.js';
import {
  percentile, median, skillPremiums, deptBoxes, hotLocations, fitRequirements,
  topResponsibilities, summaryStats,
} from '../public/features/insights.js';
import { weightedPercentile, toUSD, salaryUSD, formatDelta, formatPct, h, FX_FALLBACK } from '../public/features/shared.js';
import { fakeJobs } from '../public/features/demo-data.js';
import { FX_TO_USD } from '../public/viz/palette.js';
const GBP = FX_TO_USD.GBP; // live palette rate, so FX refreshes don't break these tests

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
    // centres: 100 at 0.45, 200 at 0.95 -> p50 interpolates 10% of the way
    assert.equal(weightedPercentile([[100, 9], [200, 1]], 0.5), 110);
    assert.equal(weightedPercentile([[100, 1], [200, 9]], 0.5), 190);
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
    near(toUSD(100000, 'GBP'), 100000 * GBP, 1);
    near(toUSD(100000, 'inr'), 100000 * (FX_TO_USD.INR ?? FX_FALLBACK.INR), 1e-6);
    assert.equal(toUSD(100, 'XYZ'), null);
    assert.equal(toUSD(null, 'USD'), null);
  });
  test('salaryUSD derives mid, converts, annualizes obvious hourly values', () => {
    const p = salaryUSD({ salary: { min: 100000, max: 140000, currency: 'GBP', interval: 'year' } });
    near(p.mid, 120000 * GBP, 1);
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
    assert.equal(roleFamily('Policy Analyst'), 'policy');
    assert.equal(roleFamily('Data Scientist'), 'data');
    assert.equal(roleFamily('Electrical Engineer'), 'hardware');
    assert.equal(roleFamily('Pastry Chef'), 'facilities'); // food services
    assert.equal(roleFamily('Zzz Qqq'), null);
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
    near(lon.mid, 90000 * GBP, 15000);
    const ql = resolveLocation('Seattle', jobs);
    assert.equal(ql.country, 'US');
    const nyQ = resolveLocation('New York', [...jobs, job({ locations: [NYC] })]);
    assert.ok(locationSim(nyQ, jobs.find((j) => j.id === 'sea')) > locationSim(nyQ, jobs[5]));
    assert.equal(locationSim(resolveLocation('Remote', jobs), job({ locations: [REMOTE_US] })), 1);
    assert.equal(locationSim(null, jobs[0]), 1);
  });

  test('converts non-USD bands and says so', () => {
    const r = estimateComp([job({ title: 'Research Engineer', locations: [LON], mid: 100000, currency: 'GBP' })], { title: 'Research Engineer' });
    near(r.mid, 100000 * GBP, 1000);
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

// ---------------------------------------------------------------------------
// v2: role families on real titles (from data/snapshots, hand-checked)
// ---------------------------------------------------------------------------

describe('role families: 20 fixed real titles', () => {
  // [title, department, expected family] — real postings from data/snapshots/*.json
  // (see docs/process/product.md §5 for the 300-title hand check).
  const REAL = [
    ['Research Engineer, Production Model Post-Training', 'AI Research & Engineering', 'ml'],
    ['Staff Software Engineer, Android', 'Engineering & Design - Product', 'swe'],
    ['Enterprise Account Executive, System Integrators', 'Sales', 'sales'],
    ['Customer Success Manager', 'Sales', 'support'],
    ['Product Designer, Safeguards', 'Engineering & Design - Product', 'design'],
    ['Senior Member of Technical Staff, Multimodal AI', 'Modeling', 'ml'],
    ['Member of Technical Staff - Voice Product', 'Product', 'swe'],
    ['Forward Deployed Software Engineer - Korea Forward Deployed', null, 'solutions'],
    ['Deployment Strategist - US Government', null, 'solutions'],
    ['Technical Program Manager, AI Delivery, Korea', 'Product Management & Program Management', 'program'],
    ['Senior Product Sourcing Engineer, General', 'Templates: ENG', 'supply-chain'],
    ['Lead Manufacturing Engineer, Avionics', 'Manufacturing : Manufacturing Engineering', 'hardware'],
    ['Quality Control Inspector', 'Manufacturing : Quality Control : Production Operations', 'manufacturing'],
    ['Staff Engineer, Landing Gear Systems (RX) (R5372)', 'X-BAT Division', 'hardware'],
    ['Senior V-BAT Air Vehicle Operator, Field Integration and Test (R5130)', 'Aircraft Operations Division', 'field-ops'],
    ['AI Tutor - Portuguese', 'Human Data', 'ai-training'],
    ['HVAC Supervisor (Chilled Water Systems) - Memphis', 'Data Center', 'facilities'],
    ['Safeguards Enforcement Analyst, Bio Harms', 'Safeguards (Trust & Safety)', 'trust-safety'],
    ['Sr Lead FP&A - Aircraft (R5609)', 'Finance Division', 'finance'],
    ['Engineering Manager, Agent Oversight', 'Applications Platform Engineering', 'eng-manager'],
  ];
  for (const [title, department, want] of REAL) {
    test(`${want} <- ${title}`, () => {
      assert.equal(roleFamily(title, { department }), want);
      assert.ok(FAMILY_LABELS[want], `label for ${want}`);
    });
  }
  test('roles.js is the same implementation, importable with no DOM', () => {
    assert.equal(typeof globalThis.document, 'undefined');
    assert.equal(roles.roleFamily('Senior SWE'), roleFamily('Senior SWE'));
    assert.deepEqual(roles.normalizeTitle('Sr. SWE, Platform', { department: 'Engineering' }).tokens, ['software', 'engineer', 'platform']);
    assert.equal(roles.rolePart('Human Data - Business Operations Analyst'), 'Business Operations Analyst');
    // department only decides when the title is generic
    assert.equal(roleFamily('Staff Development Engineer', { department: 'Hardware Platform : Hardware Test Operations' }), 'hardware');
    assert.equal(roleFamily('Staff Development Engineer'), 'swe');
    assert.equal(roleFamily('Software Engineer', { department: 'Manufacturing' }), 'swe');
  });
});

// ---------------------------------------------------------------------------
// v2: backtest + published accuracy (F3)
// ---------------------------------------------------------------------------

describe('backtest', () => {
  // deterministic board: 4 families x levels, a few duplicates and one no-pay job
  const board = [];
  const fams = [['Software Engineer', 200000], ['Account Executive', 130000], ['Research Scientist', 320000], ['Recruiter', 120000]];
  for (const [t, base] of fams) {
    ['Mid', 'Senior', 'Staff+'].forEach((lvl, li) => {
      for (let k = 0; k < 6; k++) board.push(job({ title: (lvl === 'Senior' ? 'Senior ' : lvl === 'Staff+' ? 'Staff ' : '') + t, seniority: lvl, mid: base * (1 + li * 0.3) * (0.92 + 0.03 * k), id: `${t}-${lvl}-${k}` }));
    });
  }
  board.push(job({ mid: null, id: 'nopay' }));

  test('deterministic: same seed -> same result; input order does not matter', () => {
    const a = backtest(board, { seed: 7, maxN: 30 });
    const b = backtest(board.slice().reverse(), { seed: 7, maxN: 30 });
    assert.deepEqual(a, b);
    assert.equal(a.seed, 7);
    assert.equal(a.n + a.skipped, 30);
  });

  test('different seeds sample different jobs; maxN caps the sample', () => {
    const r1 = backtest(board, { seed: 1, maxN: 10 });
    const r2 = backtest(board, { seed: 2, maxN: 10 });
    assert.ok(r1.n + r1.skipped === 10 && r2.n + r2.skipped === 10);
    const all = backtest(board, { seed: 1, maxN: 500 });
    assert.equal(all.n + all.skipped, board.length - 1, 'only vetted (salary !== null) jobs are tested');
    assert.notDeepEqual([r1.medianAbsPctError, r1.within10Pct], [r2.medianAbsPctError, r2.within10Pct]);
  });

  test('error metric: percent numbers, small on a consistent board', () => {
    const r = backtest(board, { seed: BACKTEST_SEED });
    assert.equal(r.seed, 20261002);
    assert.ok(r.medianAbsPctError >= 0 && r.medianAbsPctError < 10, `median error ${r.medianAbsPctError}%`);
    assert.ok(r.within10Pct >= 50 && r.within10Pct <= 100);
    assert.equal(Math.round(r.medianAbsPctError * 10) / 10, r.medianAbsPctError, 'one decimal');
  });

  test('duplicates (same title + same range) are left out with the tested job', () => {
    const dup = [];
    for (let i = 0; i < 5; i++) dup.push(job({ title: 'Widget Engineer', mid: 100000, id: `w${i}` }));
    for (let i = 0; i < 5; i++) dup.push(job({ title: 'Gizmo Engineer', mid: 200000, id: `x${i}` }));
    const r = backtest(dup, { seed: 3 });
    // with duplicates excluded, each job is estimated from the *other* title: ~100% / ~50% error
    assert.ok(r.medianAbsPctError > 40, `got ${r.medianAbsPctError}`);
    // plain leave-one-out finds an exact twin: ~0% error (why the default dedupes)
    assert.equal(backtest(dup, { seed: 3, dedupe: 'none' }).medianAbsPctError, 0);
    // same title + range in another city is still a twin by default, but not for "title+location"
    const multi = [
      ...[0, 1, 2].map((i) => job({ title: 'Widget Engineer', mid: 100000, locations: [SF], id: `sf${i}` })),
      ...[0, 1, 2].map((i) => job({ title: 'Widget Engineer', mid: 100000, locations: [NYC], id: `ny${i}` })),
      ...[0, 1, 2].map((i) => job({ title: 'Gizmo Engineer', mid: 200000, locations: [SEA], id: `se${i}` })),
    ];
    assert.ok(backtest(multi, { seed: 3, dedupe: 'title' }).medianAbsPctError > 40);
    assert.ok(backtest(multi, { seed: 3, dedupe: 'title+location' }).medianAbsPctError < backtest(multi, { seed: 3 }).medianAbsPctError);
    // the held-out job itself is never a comparable
    const solo = [job({ title: 'Widget Engineer', mid: 100000, id: 'a' }), job({ title: 'Gadget Engineer', mid: 300000, id: 'b' })];
    assert.ok(backtest(solo, { seed: 1, dedupe: 'none' }).medianAbsPctError > 50);
  });

  test('empty / unsalaried input', () => {
    assert.deepEqual(backtest([], { seed: 1 }), { medianAbsPctError: null, within10Pct: null, n: 0, seed: 1, skipped: 0 });
    assert.equal(backtest([job({ mid: null })]).n, 0);
    assert.equal(backtest(null).n, 0);
  });

  test('accuracy line + Low-confidence threshold (> 25%)', () => {
    const meta = { compstimate: { medianAbsPctError: 8.3, within10Pct: 55.8, n: 500, seed: 20261002, computedAt: 'x' } };
    assert.equal(accuracyLine(meta), 'Typically within ±8% (tested on 500 listed salaries)');
    assert.equal(accuracyLine(meta.compstimate), accuracyLine(meta), 'accepts meta or meta.compstimate');
    assert.equal(accuracyLine({ compstimate: { ...meta.compstimate, n: 1 } }), 'Typically within ±8% (tested on 1 listed salary)');
    assert.equal(accuracyLine({ medianAbsPctError: 0.3, n: 133 }), 'Typically within ±1% (tested on 133 listed salaries)', 'floored at ±1%');
    assert.equal(accuracyLine(null), null);
    assert.equal(accuracyLine({ compstimate: null }), null);
    assert.equal(accuracyFrom({ compstimate: { medianAbsPctError: null, n: 0 } }), null);
    assert.equal(ACCURACY_LOW_THRESHOLD, 25);
    const est = { mid: 300000, confidence: 'High' };
    assert.equal(isLowAccuracy({ compstimate: { medianAbsPctError: 25, n: 9 } }), false, 'exactly 25% is not above');
    assert.equal(isLowAccuracy({ compstimate: { medianAbsPctError: 25.1, n: 9 } }), true);
    assert.equal(displayConfidence(est, meta), 'High');
    assert.equal(displayConfidence(est, { compstimate: { medianAbsPctError: 31, n: 120 } }), 'Low');
    assert.equal(displayConfidence(est, null), 'High');
    assert.equal(displayConfidence({ mid: null, confidence: 'High' }, meta), 'Low');
  });
});

// ---------------------------------------------------------------------------
// v2: market comps (F1)
// ---------------------------------------------------------------------------

describe('market comps', () => {
  const market = {
    format: 'melon-market-1', basis: 'posted base pay ranges', currency: 'USD', minN: 3,
    companies: [{ slug: 'anthropic', name: 'Anthropic', color: '#d97757' }, { slug: 'openai', name: 'OpenAI', color: '#10a37f' }, { slug: 'xai', name: 'xAI', color: null }],
    columns: ['company', 'family', 'seniority', 'n', 'p25', 'median', 'p75'],
    cells: [
      ['anthropic', 'ml', 'Senior', 41, 320000, 365000, 405000],
      ['anthropic', 'ml', '*', 90, 300000, 350000, 400000],
      ['openai', 'ml', 'Senior', 12, 330000, 380000, 420000],
      ['openai', 'ml', '*', 60, 310000, 360000, 410000],
      ['xai', 'ml', '*', 5, 200000, 300000, 400000],
      ['xai', 'swe', '*', 8, 180000, 250000, 300000],
      ['openai', 'swe', 'Mid', 2, 1, 2, 3], // below minN: never shown even if present
    ],
  };
  // a cell with n < minN should never be emitted by the builder; the reader is defensive anyway
  market.cells = market.cells.filter((c) => c[3] >= market.minN);

  test('marketCells parses rows with company name/color; cached per document', () => {
    const cells = marketCells(market);
    assert.equal(cells.length, 6);
    assert.deepEqual(cells[0], { slug: 'anthropic', name: 'Anthropic', color: '#d97757', n: 41, p25: 320000, median: 365000, p75: 405000, family: 'ml', seniority: 'Senior' });
    assert.equal(marketCells(market), cells);
    assert.deepEqual(marketCells(null), []);
    assert.deepEqual(marketCells({ cells: 'x' }), []);
  });

  test('marketComps: one row per company, sorted by median; "*" by default', () => {
    const all = marketComps(market, { family: 'ml' });
    assert.deepEqual(all.map((r) => r.slug), ['openai', 'anthropic', 'xai']);
    assert.ok(all.every((r) => r.seniority === '*' && r.n >= 3));
    const senior = marketComps(market, { family: 'ml', seniority: 'Senior', country: 'US' });
    assert.deepEqual(senior.map((r) => [r.slug, r.median]), [['openai', 380000], ['anthropic', 365000]]);
    assert.deepEqual(marketComps(market, { family: 'nope' }), []);
    assert.deepEqual(marketComps(market, {}), []);
    for (const k of ['slug', 'name', 'color', 'n', 'p25', 'median', 'p75']) assert.ok(k in all[0], k);
  });

  test('compsForJob: family+seniority, excluding own company; falls back to family', () => {
    const rs = { company: 'anthropic', title: 'Research Scientist, Interpretability', department: 'AI Research & Engineering', seniority: 'Senior' };
    const a = compsForJob(market, rs);
    assert.equal(a.matchedOn, 'family+seniority');
    assert.equal(a.family, 'ml');
    assert.deepEqual(a.rows.map((r) => r.slug), ['openai']);
    const withSelf = compsForJob(market, rs, { includeSelf: true });
    assert.deepEqual(withSelf.rows.map((r) => [r.slug, !!r.current]), [['openai', false], ['anthropic', true]]);
    const staff = compsForJob(market, { ...rs, seniority: 'Staff+' });
    assert.equal(staff.matchedOn, 'family');
    assert.deepEqual(staff.rows.map((r) => r.slug), ['openai', 'xai']);
    const swe = compsForJob(market, { company: 'xai', title: 'Software Engineer', seniority: 'Mid' });
    assert.deepEqual([swe.matchedOn, swe.rows.length], [null, 0], 'no other company has swe');
    const odd = compsForJob(market, { company: 'xai', title: 'Zzz Qqq' });
    assert.deepEqual([odd.matchedOn, odd.family, odd.rows.length], [null, null, 0]);
    assert.equal(compsForJob(null, rs).rows.length, 0);
  });

  test('familyOptions: families with labels, most companies first', () => {
    const opts = familyOptions(market);
    assert.deepEqual(opts.map((o) => [o.id, o.companies]), [['ml', 3], ['swe', 1]]);
    assert.equal(opts[0].label, 'AI research & ML engineering');
  });
});

// ---------------------------------------------------------------------------
// wave 2: UX-9 prefill, DES-9 tokens, A11Y-1 contrast
// ---------------------------------------------------------------------------

describe('queryFromState (UX-9)', () => {
  test('open job wins: title, level, department, first on-site city', () => {
    const j = job({ title: 'Engineering Manager, Platform', seniority: 'Manager', locations: [REMOTE_US, NYC] });
    assert.deepEqual(queryFromState({ job: j, search: 'ignored', family: 'swe' }),
      { title: 'Engineering Manager, Platform', seniority: 'Manager', department: 'Engineering', location: 'New York' });
    assert.equal(queryFromState({ job: job({ locations: [REMOTE_US] }) }).location, 'Remote');
  });
  test('search text, then role family; single level/location only', () => {
    assert.deepEqual(queryFromState({ search: '  Recruiter ', family: 'swe', seniority: ['Senior'], location: ['London'] }),
      { title: 'Recruiter', seniority: 'Senior', location: 'London', department: '' });
    const q = queryFromState({ family: 'eng-manager', seniority: ['Manager', 'Senior'], location: 'San Francisco' });
    assert.deepEqual(q, { title: 'Engineering Manager', seniority: '', location: 'San Francisco', department: '' });
    assert.deepEqual(queryFromState({}), { title: '', seniority: '', location: '', department: '' });
    for (const id of Object.keys(FAMILY_LABELS)) assert.ok(FAMILY_TITLES[id], `title for ${id}`);
    for (const id of Object.keys(FAMILY_LABELS)) assert.equal(roleFamily(FAMILY_TITLES[id]), id, `${FAMILY_TITLES[id]} maps back to ${id}`);
  });
});

describe('features.css tokens and contrast (DES-9, A11Y-1)', () => {
  const css = fsSync.readFileSync(new URL('../public/features/features.css', import.meta.url), 'utf8');
  const lum = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
      .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const fallback = (block, name) => block.match(new RegExp(`--_${name}: var\\(--ms-${name}, (#[0-9a-f]{6})\\)`))[1];
  test('no hard-coded blue/red; diverging pair uses app tokens', () => {
    assert.doesNotMatch(css, /#2a78d6|#e34948|#3987e5|#e66767/i);
    assert.match(css, /--_pos: var\(--ms-accent/);
    assert.match(css, /--_neg: var\(--ms-danger/);
    assert.match(css, /--_faint: var\(--_muted\)/);
  });
  test('muted text fallbacks clear 4.5:1 on surface and bg, light and dark', () => {
    const light = css.slice(0, css.indexOf('@media (prefers-color-scheme: dark)'));
    const dark = css.slice(css.indexOf(':root[data-theme="dark"]'));
    for (const block of [light, dark]) {
      const muted = fallback(block, 'muted');
      for (const bg of ['surface', 'bg']) {
        const r = ratio(muted, fallback(block, bg));
        assert.ok(r >= 4.5, `${muted} on ${bg} ${r.toFixed(2)}:1`);
      }
    }
    // the app's own tokens (public/styles.css): muted on white / surface-2
    assert.ok(ratio('#5c6474', '#ffffff') >= 4.5 && ratio('#5c6474', '#f0f2f5') >= 4.5);
  });
});
