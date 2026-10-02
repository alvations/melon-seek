// Deterministic FAKE jobs (contract Job shape) for public/features/demo.html and
// test/features.test.js. Not used by the app. Every company name ends in
// "(demo)" so nothing here can be mistaken for a real posting.

const CITIES = [
  { name: 'San Francisco, CA', city: 'San Francisco', region: 'CA', country: 'US', lat: 37.77, lng: -122.42, w: 10, pay: 1 },
  { name: 'New York City, NY', city: 'New York', region: 'NY', country: 'US', lat: 40.71, lng: -74.01, w: 5, pay: 0.98 },
  { name: 'Seattle, WA', city: 'Seattle', region: 'WA', country: 'US', lat: 47.61, lng: -122.33, w: 4, pay: 0.95 },
  { name: 'Austin, TX', city: 'Austin', region: 'TX', country: 'US', lat: 30.27, lng: -97.74, w: 2, pay: 0.86 },
  { name: 'Washington, DC', city: 'Washington', region: 'DC', country: 'US', lat: 38.9, lng: -77.04, w: 2, pay: 0.9 },
  { name: 'London, UK', city: 'London', region: 'England', country: 'GB', lat: 51.51, lng: -0.13, w: 3, pay: 0.62, cur: 'GBP' },
  { name: 'Dublin, Ireland', city: 'Dublin', region: null, country: 'IE', lat: 53.35, lng: -6.26, w: 1, pay: 0.6, cur: 'EUR' },
  { name: 'Zurich, Switzerland', city: 'Zurich', region: null, country: 'CH', lat: 47.37, lng: 8.54, w: 1, pay: 0.78, cur: 'CHF' },
];
const REMOTE = { name: 'Remote (US)', city: null, region: null, country: 'US', lat: 39.8, lng: -98.6, remote: true };

const DEPTS = [
  { name: 'AI Research & Engineering', base: 330000, titles: ['Research Engineer, {t}', 'Research Scientist, {t}', 'ML Engineer, {t}'], teams: ['Interpretability', 'Pretraining', 'Alignment', 'Inference', 'RL'], skills: ['Python', 'PyTorch', 'JAX', 'CUDA', 'Distributed systems', 'LLMs'], w: 4 },
  { name: 'Engineering', base: 265000, titles: ['Software Engineer, {t}', 'Infrastructure Engineer, {t}', 'Engineering Manager, {t}'], teams: ['Platform', 'Developer Experience', 'Data Infrastructure', 'Security', 'Product'], skills: ['Python', 'Go', 'Rust', 'TypeScript', 'React', 'Kubernetes', 'AWS', 'Terraform', 'SQL'], w: 5 },
  { name: 'Product', base: 250000, titles: ['Product Manager, {t}', 'Product Designer, {t}'], teams: ['API', 'Enterprise', 'Consumer'], skills: ['SQL', 'Figma', 'LLMs'], w: 2 },
  { name: 'Go To Market', base: 185000, titles: ['Account Executive, {t}', 'Solutions Architect, {t}', 'Partner Manager, {t}'], teams: ['Enterprise', 'Startups', 'Public Sector'], skills: ['Salesforce', 'Python', 'LLMs'], w: 3 },
  { name: 'Operations', base: 160000, titles: ['Program Manager, {t}', 'Recruiter, {t}', 'Finance Analyst, {t}'], teams: ['People', 'Finance', 'Workplace'], skills: ['SQL', 'Excel'], w: 2 },
  { name: 'Legal & Policy', base: 220000, titles: ['Policy Analyst, {t}', 'Product Counsel, {t}'], teams: ['Global Affairs', 'Privacy'], skills: [], w: 1 },
];

const LEVELS = [
  ['Intern', 0.35, '', 0.5], ['Entry', 0.68, '', 1.5], ['Mid', 0.86, '', 3], ['Senior', 1.0, 'Senior ', 3.5],
  ['Staff+', 1.3, 'Staff ', 1.6], ['Manager', 1.15, '', 0], ['Director+', 1.55, 'Head of ', 0.4],
];

const RESP = ['Model training', 'Infrastructure', 'Cross-functional', 'Research', 'Customer-facing', 'Evaluation', 'Data pipelines', 'Mentorship', 'Roadmapping', 'Safety', 'Scaling', 'Hiring'];
const FIT = ['5+ yrs', '3+ yrs', 'PhD', 'Startup experience', 'Publications', 'Leadership', 'Clearance', "Bachelor's", '8+ yrs'];

function rng(seed) {
  let s = 0;
  for (const c of String(seed)) s = (s * 31 + c.charCodeAt(0)) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(r, items) {
  const total = items.reduce((a, b) => a + (b.w ?? 1), 0);
  let x = r() * total;
  for (const it of items) { x -= it.w ?? 1; if (x <= 0) return it; }
  return items[items.length - 1];
}

function sample(r, arr, n) {
  const copy = arr.slice(), out = [];
  while (out.length < n && copy.length) out.push(copy.splice(Math.floor(r() * copy.length), 1)[0]);
  return out;
}

/** n deterministic fake jobs for a fake company slug. */
export function fakeJobs(slug = 'acme', n = 140) {
  const r = rng(slug);
  const companyName = `${slug[0].toUpperCase()}${slug.slice(1)} (demo)`;
  const jobs = [];
  for (let i = 0; i < n; i++) {
    const dept = pick(r, DEPTS);
    const team = dept.teams[Math.floor(r() * dept.teams.length)];
    let tmpl = dept.titles[Math.floor(r() * dept.titles.length)];
    const isManager = /Manager, \{t\}$/.test(tmpl) && /Engineering/.test(tmpl);
    const lv = isManager ? LEVELS[5] : pick(r, LEVELS.map((l) => ({ l, w: l[3] }))).l;
    let title = tmpl.replace('{t}', team);
    if (lv[0] === 'Intern') title = title.replace(/,.*/, '') + ' Intern';
    else if (lv[2]) title = lv[2] + (lv[2] === 'Head of ' ? team : title);
    const remote = r() < 0.09;
    const city = remote ? null : pick(r, CITIES);
    const locations = [];
    if (remote) locations.push({ ...REMOTE });
    else {
      const { w, pay, cur, ...loc } = city;
      locations.push({ ...loc, remote: false });
      if (r() < 0.25) {
        const c2 = pick(r, CITIES);
        if (c2 !== city) { const { w: _w, pay: _p, cur: _c, ...l2 } = c2; locations.push({ ...l2, remote: false }); }
      }
    }
    const geo = remote ? 0.92 : city.pay;
    const fit = sample(r, FIT, 1 + Math.floor(r() * 3));
    const skills = sample(r, dept.skills, Math.min(dept.skills.length, 1 + Math.floor(r() * 4)));
    let salary = null;
    if (r() < 0.84) {
      const skillBoost = (skills.includes('CUDA') ? 1.12 : 1) * (skills.includes('Rust') ? 1.06 : 1) * (skills.includes('Excel') ? 0.9 : 1);
      const phd = fit.includes('PhD') ? 1.1 : 1;
      const usdMid = dept.base * lv[1] * geo * skillBoost * phd * (0.86 + r() * 0.28);
      const cur = remote ? 'USD' : city.cur || 'USD';
      const fx = { USD: 1, GBP: 1.27, EUR: 1.09, CHF: 1.13 }[cur];
      const mid = usdMid / fx;
      const spread = 0.12 + r() * 0.14;
      const min = Math.round((mid * (1 - spread)) / 5000) * 5000;
      const max = Math.round((mid * (1 + spread)) / 5000) * 5000;
      const sym = { USD: '$', GBP: '£', EUR: '€', CHF: 'CHF ' }[cur];
      salary = { min, max, mid: (min + max) / 2, currency: cur, interval: 'year', text: `${sym}${min.toLocaleString('en-US')}—${sym}${max.toLocaleString('en-US')} ${cur}` };
    }
    const id = 4000000 + Math.floor(r() * 999999);
    jobs.push({
      id: `${slug}:${id}`,
      company: slug, companyName,
      title, department: dept.name, team,
      employmentType: lv[0] === 'Intern' ? 'Intern' : 'Full-time',
      seniority: lv[0],
      locations, remote,
      salary,
      url: `https://example.com/${slug}/jobs/${id}`,
      updatedAt: new Date(Date.parse('2026-10-01T12:00:00Z') - Math.floor(r() * 60) * 864e5).toISOString(),
      descriptionHtml: `<p>Demo posting for ${title}.</p>`,
      sections: { responsibilities: [], fit: [] },
      keywords: { responsibilities: sample(r, RESP, 2 + Math.floor(r() * 3)), fit, skills },
    });
  }
  return jobs;
}
