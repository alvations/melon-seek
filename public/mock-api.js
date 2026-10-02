// melon·seek — development mock of the HTTP API (loaded only with ?mock=1).
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
    jobs.push({
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
    });
  }
  return jobs;
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
