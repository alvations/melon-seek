// melon·seek — development mock of the HTTP API (loaded only with ?mock=1).
import { roleFamily } from './features/compstimate.js';
// Synthesizes deterministic, contract-shaped Jobs so the UI can be built
// without the backend. Never used in normal operation.

const COMPANIES = [
  { slug: 'anthropic', name: 'Anthropic', source: 'greenhouse', board: 'anthropic', color: '#d97757' },
  { slug: 'anduril', name: 'Anduril', source: 'greenhouse', board: 'andurilindustries', color: '#3b5bdb' },
  { slug: 'openai', name: 'OpenAI', source: 'ashby', board: 'openai', color: '#10a37f' },
];

// Mode per company exercises every badge state.
const MODES = { anthropic: 'live', anduril: 'snapshot', openai: 'demo' };

const CITIES = [
  { name: 'San Francisco, CA', city: 'San Francisco', region: 'CA', country: 'US', lat: 37.77, lng: -122.42, w: 10 },
  { name: 'New York City, NY', city: 'New York', region: 'NY', country: 'US', lat: 40.71, lng: -74.01, w: 5 },
  { name: 'Seattle, WA', city: 'Seattle', region: 'WA', country: 'US', lat: 47.61, lng: -122.33, w: 4 },
  { name: 'Costa Mesa, CA', city: 'Costa Mesa', region: 'CA', country: 'US', lat: 33.64, lng: -117.92, w: 3 },
  { name: 'Washington, DC', city: 'Washington', region: 'DC', country: 'US', lat: 38.9, lng: -77.04, w: 2 },
  { name: 'Austin, TX', city: 'Austin', region: 'TX', country: 'US', lat: 30.27, lng: -97.74, w: 1 },
  { name: 'London, UK', city: 'London', region: 'England', country: 'GB', lat: 51.51, lng: -0.13, w: 3 },
  { name: 'Dublin, Ireland', city: 'Dublin', region: null, country: 'IE', lat: 53.35, lng: -6.26, w: 1 },
  { name: 'Zurich, Switzerland', city: 'Zurich', region: null, country: 'CH', lat: 47.37, lng: 8.54, w: 1 },
  { name: 'Tokyo, Japan', city: 'Tokyo', region: null, country: 'JP', lat: 35.68, lng: 139.69, w: 1 },
  { name: 'Sydney, Australia', city: 'Sydney', region: 'NSW', country: 'AU', lat: -33.87, lng: 151.21, w: 1 },
];

// Crude livability inputs for the mock Juice Score (annual USD). Real values: data/cities.json + server/juice.js.
const LIVING = {
  'San Francisco': { rent: 44145, living: 18184, tax: [0.24, 0.42] }, 'New York': { rent: 52446, living: 19982, tax: [0.25, 0.43] },
  Seattle: { rent: 30000, living: 16500, tax: [0.18, 0.36] }, 'Costa Mesa': { rent: 32388, living: 15626, tax: [0.22, 0.4] },
  Washington: { rent: 30500, living: 17000, tax: [0.23, 0.41] }, Austin: { rent: 23088, living: 14127, tax: [0.18, 0.36] },
  London: { rent: 32766, living: 17244, tax: [0.28, 0.45] }, Dublin: { rent: 28000, living: 16000, tax: [0.3, 0.48] },
  Zurich: { rent: 34074, living: 22320, tax: [0.2, 0.33], estimated: true }, Tokyo: { rent: 16000, living: 13500, tax: [0.22, 0.42] },
  Sydney: { rent: 26000, living: 15500, tax: [0.26, 0.44] },
};
const FX = { USD: 1, GBP: 1.27, EUR: 1.09 };
function mockJuice(salary, locations) {
  if (!salary) return null;
  const gross = Math.round(salary.mid * (FX[salary.currency] ?? 1));
  const byLocation = locations.filter((l) => !l.remote && LIVING[l.city]).map((l) => {
    const c = LIVING[l.city];
    const rate = Math.min(c.tax[1], c.tax[0] + gross / 2_000_000);
    const tax = Math.round(gross * rate), rent = c.rent, living = c.living;
    const net = gross - tax - rent - living;
    const score = net <= 0 ? 0 : Math.max(0, Math.min(100, Math.round((100 * Math.log(1 + net / 10000)) / Math.log(26))));
    const grade = score >= 70 ? 'Juicy' : score >= 45 ? 'Ripe' : score >= 1 ? 'Dry' : 'Rind';
    return { locationName: l.name, city: l.city.toLowerCase().replace(/\W+/g, '-'), cityName: l.city, gross, tax, rent, living, net, score, grade,
      rentBurden: Math.round((rent / Math.max(1, gross - tax)) * 100) / 100, bigMacs: Math.round(net / 5.69), estimated: !!c.estimated,
      taxParts: { income: Math.round(tax * 0.7), regional: Math.round(tax * 0.12), social: tax - Math.round(tax * 0.7) - Math.round(tax * 0.12) } };
  });
  if (!byLocation.length) return null;
  const best = byLocation.slice().sort((a, b) => b.score - a.score || b.net - a.net)[0];
  return { best, byLocation, salaryUSD: { min: salary.min, max: salary.max, mid: gross } };
}

const DEPTS = [
  { name: 'AI Research & Engineering', base: 330000, titles: ['Research Engineer, {t}', 'Research Scientist, {t}', 'ML Engineer, {t}'], teams: ['Interpretability', 'Pretraining', 'Alignment', 'Inference', 'RL'] },
  { name: 'Engineering', base: 260000, titles: ['Software Engineer, {t}', 'Infrastructure Engineer, {t}', 'Engineering Manager, {t}'], teams: ['Platform', 'Developer Experience', 'Data Infrastructure', 'Security', 'Product'] },
  { name: 'Product', base: 250000, titles: ['Product Manager, {t}', 'Product Designer, {t}'], teams: ['API', 'Enterprise', 'Consumer'] },
  { name: 'Go To Market', base: 190000, titles: ['Account Executive, {t}', 'Solutions Architect, {t}', 'Partner Manager, {t}'], teams: ['Enterprise', 'Startups', 'Public Sector'] },
  { name: 'Operations', base: 160000, titles: ['Program Manager, {t}', 'Recruiter, {t}', 'Finance Analyst, {t}'], teams: ['People', 'Finance', 'Workplace'] },
  { name: 'Legal & Policy', base: 220000, titles: ['Policy Analyst, {t}', 'Product Counsel, {t}'], teams: ['Global Affairs', 'Privacy'] },
  { name: 'Hardware', base: 210000, titles: ['Electrical Engineer, {t}', 'Mechanical Engineer, {t}', 'Systems Engineer, {t}'], teams: ['Autonomy', 'Sensors', 'Propulsion'] },
];

const SENIORITY = [
  ['Intern', 0.35, ''], ['Entry', 0.62, ''], ['Mid', 0.85, ''], ['Senior', 1.0, 'Senior '],
  ['Staff+', 1.3, 'Staff '], ['Manager', 1.15, ''], ['Director+', 1.55, 'Head of '],
];

const KW = {
  responsibilities: ['Model training', 'Infrastructure', 'Cross-functional', 'Research', 'Customer-facing', 'Evaluation', 'Data pipelines', 'Mentorship', 'Roadmapping', 'Safety', 'Scaling', 'Hiring', 'Incident response', 'Prototyping'],
  fit: ['5+ yrs', '3+ yrs', 'PhD', 'Startup experience', 'Publications', 'Leadership', 'Clearance', 'Remote-friendly', 'Fast-paced', 'Bachelor\'s'],
  skills: ['Python', 'PyTorch', 'Kubernetes', 'Rust', 'Go', 'TypeScript', 'React', 'JAX', 'CUDA', 'SQL', 'AWS', 'GCP', 'Terraform', 'C++', 'Distributed systems', 'LLMs', 'Spark'],
};

const BULLETS = {
  responsibilities: [
    'Design, build and operate systems that train frontier-scale models',
    'Partner with research and product teams to ship new capabilities',
    'Own reliability and performance for critical services',
    'Write clear technical documents and drive alignment across teams',
    'Build evaluation tooling that measures model behavior',
    'Mentor engineers and raise the bar for code quality',
  ],
  fit: [
    'Have significant software engineering experience',
    'Are comfortable working in a fast-moving, ambiguous environment',
    'Care about the societal impacts of your work',
    'Have experience with large-scale distributed systems',
    'Communicate clearly with technical and non-technical partners',
  ],
};

function rng(seed) {
  let s = 0;
  for (const c of seed) s = (s * 31 + c.charCodeAt(0)) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function weighted(r, items) {
  const total = items.reduce((a, b) => a + (b.w || 1), 0);
  let x = r() * total;
  for (const it of items) { x -= it.w || 1; if (x <= 0) return it; }
  return items[items.length - 1];
}

function sample(r, arr, n) {
  const copy = arr.slice();
  const out = [];
  while (out.length < n && copy.length) out.push(copy.splice(Math.floor(r() * copy.length), 1)[0]);
  return out;
}

function makeJobs(company) {
  const r = rng(company.slug);
  // openai is large (~900) to exercise list/chart performance at real-board scale.
  const n = company.slug === 'anthropic' ? 142 : company.slug === 'openai' ? 900 : 96 + Math.floor(r() * 30);
  const depts = company.slug === 'anduril' ? DEPTS : DEPTS.filter((d) => d.name !== 'Hardware');
  const jobs = [];
  for (let i = 0; i < n; i++) {
    const dept = depts[Math.floor(Math.pow(r(), 1.4) * depts.length)];
    const team = dept.teams[Math.floor(r() * dept.teams.length)];
    const sen = SENIORITY[Math.min(SENIORITY.length - 1, Math.floor(Math.pow(r(), 1.2) * SENIORITY.length))];
    let title = dept.titles[Math.floor(r() * dept.titles.length)].replace('{t}', team);
    if (sen[0] === 'Intern') title = title.replace(/,.*/, '') + ' Intern';
    else if (sen[2]) title = sen[2] + title;
    const remoteOnly = r() < 0.1;
    const locs = [];
    if (remoteOnly) {
      locs.push({ name: 'Remote (US)', city: null, region: null, country: 'US', lat: 39.8, lng: -98.6, remote: true });
    } else {
      const first = weighted(r, CITIES);
      locs.push(first);
      if (r() < 0.3) { const second = weighted(r, CITIES); if (second !== first) locs.push(second); }
      if (r() < 0.08) locs.push({ name: 'Remote-Friendly (US)', city: null, region: null, country: 'US', lat: null, lng: null, remote: true });
    }
    const locations = locs.map(({ w, ...l }) => ({ remote: false, ...l }));
    const intl = locations[0].country !== 'US';
    let salary = null;
    if (r() < 0.86) {
      const mid = dept.base * sen[1] * (0.82 + r() * 0.36) * (intl ? 0.72 : 1);
      const spread = 0.12 + r() * 0.16;
      const min = Math.round((mid * (1 - spread)) / 5000) * 5000;
      const max = Math.round((mid * (1 + spread)) / 5000) * 5000;
      const cur = locations[0].country === 'GB' ? 'GBP' : locations[0].country === 'IE' || locations[0].country === 'CH' ? 'EUR' : 'USD';
      const sym = { USD: '$', GBP: '£', EUR: '€' }[cur];
      salary = { min, max, mid: (min + max) / 2, currency: cur, interval: 'year', text: `${sym}${min.toLocaleString()}—${sym}${max.toLocaleString()} ${cur}` };
    }
    const keywords = {
      responsibilities: sample(r, KW.responsibilities, 2 + Math.floor(r() * 3)),
      fit: sample(r, KW.fit, 1 + Math.floor(r() * 3)),
      skills: sample(r, KW.skills.slice(0, 6 + Math.floor(r() * 11)), 2 + Math.floor(r() * 4)),
    };
    const sections = {
      responsibilities: sample(r, BULLETS.responsibilities, 3 + Math.floor(r() * 3)),
      fit: sample(r, BULLETS.fit, 2 + Math.floor(r() * 3)),
    };
    const updatedAt = new Date(Date.parse('2026-10-01T12:00:00Z') - Math.floor(r() * 75) * 864e5).toISOString();
    const id = 4000000 + Math.floor(r() * 999999);
    const descriptionHtml =
      `<h2>About the role</h2><p>${company.name} is looking for a <strong>${title}</strong> to join the ${team} team.</p>` +
      `<h3>Responsibilities</h3><ul>${sections.responsibilities.map((b) => `<li>${b}</li>`).join('')}</ul>` +
      `<h3>You may be a good fit if you</h3><ul>${sections.fit.map((b) => `<li>${b}</li>`).join('')}</ul>` +
      (salary ? `<p>The expected salary range for this position is: <b>${salary.text}</b></p>` : '') +
      `<p><a href="https://example.com/benefits" onclick="alert(1)">Benefits</a></p>` +
      `<script>window.__pwned = true</script><img src="x" onerror="window.__pwned=true">`;
    // A few salaries "quarantined" the way server/vet.js does (salary null + salaryFlag).
    let salaryRaw, salaryFlag;
    if (salary && i % 41 === 7) {
      salaryRaw = { ...salary, min: salary.min * 12, max: salary.max * 12, text: `${salary.text} per month` };
      salaryFlag = { codes: ['above_max'], reason: 'Pay unclear: annualized max above $1.2M (likely a monthly figure read as yearly)' };
      salary = null;
    }
    jobs.push({
      ...(salaryFlag ? { salaryRaw, salaryFlag } : {}),
      id: `${company.slug}:${id}`,
      company: company.slug,
      companyName: company.name,
      title,
      department: dept.name,
      team,
      employmentType: sen[0] === 'Intern' ? 'Intern' : r() < 0.06 ? 'Contract' : 'Full-time',
      seniority: sen[0],
      locations,
      remote: locations.some((l) => l.remote),
      salary,
      url: `https://job-boards.greenhouse.io/${company.board}/jobs/${id}`,
      updatedAt,
      descriptionHtml,
      sections,
      keywords,
      juice: mockJuice(salary, locations),
      ...listingFields(r, updatedAt),
      extras: { equity: r() < 0.55, bonus: r() < 0.3 },
    });
    if (salary) {
      salary.spread = Math.round((salary.max / salary.min) * 100) / 100;
      salary.zones = r() < 0.12 ? 2 + Math.floor(r() * 2) : 1;
    }
  }
  return jobs;
}

// F4 listing fields (contract v2). Ledger "started" 400 days before the mock's today.
const MOCK_TODAY = Date.parse('2026-10-02T12:00:00Z');
function listingFields(r, updatedAt) {
  const age = Math.floor(Math.pow(r(), 1.8) * 420);
  const minimum = age > 380;
  const postedAt = minimum ? null : new Date(MOCK_TODAY - age * 864e5).toISOString();
  const firstSeenAt = new Date(MOCK_TODAY - Math.min(age, 380) * 864e5).toISOString();
  const freshness = age <= 7 ? 'new' : age < 60 ? 'active' : age < 180 ? 'stale' : 'evergreen';
  const repost = r() < 0.07 ? { count: 1 + Math.floor(r() * 3), firstSeenAt: new Date(MOCK_TODAY - (age + 60) * 864e5).toISOString() } : null;
  return { postedAt, firstSeenAt, ageDays: minimum ? 380 : age, ageIsMinimum: minimum, freshness, repost, updatedAt };
}

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

export async function mockApi(path) {
  const url = new URL(path, location.origin);
  await delay(250 + Math.random() * 250);
  if (url.pathname === '/api/companies') return COMPANIES;
  if (url.pathname === '/api/jobs') {
    let company = COMPANIES.find((c) => c.slug === url.searchParams.get('company'));
    if (!company) {
      const board = url.searchParams.get('board');
      if (!board) throw new Error('Unknown company');
      company = { slug: board, name: url.searchParams.get('name') || board, source: url.searchParams.get('source'), board, color: null };
      if (board === 'empty') return { company, mode: 'live', fetchedAt: new Date().toISOString(), error: null, jobs: [] };
      if (board === 'fail') throw new Error('HTTP 502: upstream timeout');
    }
    const mode = MODES[company.slug] || 'demo';
    return {
      company,
      mode,
      fetchedAt: mode === 'snapshot' ? '2026-09-30T08:00:00Z' : new Date().toISOString(),
      error: mode === 'demo' ? `fetch ${company.source}/${company.board} failed: getaddrinfo ENOTFOUND api.${company.source}.io` : null,
      // Like the static deploy: the list omits descriptionHtml; getJobDetail() supplies it.
      jobs: makeJobs(company).map(({ descriptionHtml, ...rest }) => rest),
      meta: { compstimate: { medianAbsPctError: 0.14, within10Pct: 0.41, n: 96, seed: 1, computedAt: new Date().toISOString() }, history: { since: '2025-08-28T00:00:00Z', runs: 400 } },
    };
  }
  throw new Error('404 ' + url.pathname);
}

// Same interface as public/api.js.
export const getCompanies = () => mockApi('/api/companies');
export function getJobs(query, { refresh } = {}) {
  const p = new URLSearchParams(query);
  if (refresh) p.set('refresh', '1');
  return mockApi(`/api/jobs?${p}`);
}

const detailCache = new Map();
export async function getJobDetail(job) {
  await delay(300);
  if (!detailCache.size || !detailCache.has(job.id)) {
    const company = COMPANIES.find((c) => c.slug === job.company) || { slug: job.company, name: job.companyName, board: job.company };
    for (const j of makeJobs(company)) detailCache.set(j.id, j.descriptionHtml);
  }
  if (job.title.includes('Intern')) throw new Error('mock: detail unavailable'); // exercises the failure path
  return { ...job, descriptionHtml: detailCache.get(job.id) || '' };
}

/** F1 market comps fixture: per company × role family × seniority, n ≥ 3, posted base pay (approx USD). */
let marketCache = null;
export async function getMarket() {
  await delay(120);
  if (marketCache) return marketCache;
  const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); const i = (s.length - 1) * p; const lo = Math.floor(i); return Math.round(s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo)); };
  const cells = [];
  for (const c of COMPANIES) {
    const groups = new Map();
    for (const j of makeJobs(c)) {
      if (!j.salary) continue;
      const fam = roleFamily(j.title);
      if (!fam) continue;
      const k = `${fam}|${j.seniority}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(j.salary.mid * (FX[j.salary.currency] ?? 1));
    }
    for (const [k, mids] of groups) {
      if (mids.length < 3) continue;
      const [family, seniority] = k.split('|');
      cells.push({ company: c.slug, name: c.name, family, seniority, n: mids.length, p25: q(mids, 0.25), median: q(mids, 0.5), p75: q(mids, 0.75) });
    }
  }
  marketCache = { basis: 'posted base pay ranges', currency: 'USD', generatedAt: new Date().toISOString(), cells };
  return marketCache;
}
