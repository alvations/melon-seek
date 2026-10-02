// melon-seek role taxonomy: title normalization, role families and seniority
// inference. Pure ES module with NO imports and no DOM/Node APIs, so it loads
// unchanged in the browser, in node:test and in build scripts
// (scripts/build-market.js imports normalizeTitle / roleFamily from here or
// via compstimate.js, which re-exports everything below).
//
//   normalizeTitle("Sr. SWE, Platform")
//     -> { tokens: ["software","engineer","platform"], family: "swe", seniority: "Senior", role: "software engineer" }
//   roleFamily("Supplier Quality Control Supervisor")            -> "manufacturing"
//   roleFamily("Staff Development Engineer", { department: "Hardware Platform : Hardware Test Operations" }) -> "hardware"
//   FAMILY_LABELS.swe -> "Software engineering"
//
// Family lexicon was built against the real snapshots in data/snapshots/ and
// hand-checked on a separate random sample (docs/process/product.md, §5).

// ---------------------------------------------------------------------------
// Tokenizing
// ---------------------------------------------------------------------------

/** Abbreviations expanded before tokenizing ("Sr. SWE" -> "senior software engineer"). */
const ABBREV = {
  swe: 'software engineer', sde: 'software engineer', sw: 'software', sre: 'site reliability engineer',
  mle: 'machine learning engineer', ml: 'machine learning', pm: 'product manager',
  tpm: 'technical program manager', em: 'engineering manager', ae: 'account executive',
  sdr: 'sales development representative', bdr: 'business development representative',
  csm: 'customer success manager', se: 'solutions engineer', sa: 'solutions architect',
  ds: 'data scientist', da: 'data analyst', eng: 'engineer', engr: 'engineer', dev: 'developer',
  infra: 'infrastructure', ops: 'operations', mgr: 'manager', mgmt: 'management',
  admin: 'administrator', hr: 'people', ea: 'executive assistant', gtm: 'go to market',
  sr: 'senior', jr: 'junior', dir: 'director', assoc: 'associate', rs: 'research scientist',
  fde: 'forward deployed engineer', qa: 'quality assurance', vp: 'vp', mts: 'member of technical staff',
  mse: 'mission software engineer', gnc: 'guidance navigation and control', revops: 'revenue operations',
  bizops: 'business operations', ehs: 'environmental health and safety', npi: 'new product introduction',
};

/** Token synonyms applied after stemming. */
const SYNONYM = {
  developer: 'engineer', programmer: 'engineer', engineering: 'engineer', management: 'manager',
  researcher: 'research', science: 'scientist', analytic: 'analyst', analysi: 'analyst',
  architecture: 'architect', designer: 'design', recruiting: 'recruiter', recruitment: 'recruiter',
};

/** Words that describe level, not role: dropped from tokens, used to infer seniority. */
const LEVEL_WORDS = new Set([
  'senior', 'staff', 'principal', 'lead', 'junior', 'intern', 'internship', 'head', 'director', 'vp',
  'vice', 'president', 'chief', 'distinguished', 'fellow', 'associate', 'entry', 'level', 'new', 'grad',
  'graduate', 'mid', 'i', 'ii', 'iii', 'iv', 'v', '1', '2', '3', '4', 'apprentice', 'trainee', 'founding',
]);

const STOPWORDS = new Set([
  'a', 'an', 'the', 'of', 'and', 'for', 'to', 'in', 'on', 'at', 'with', 'or', 'our', 'team', 'remote',
  'hybrid', 'onsite', 'site', 'based', 'us', 'usa', 'uk', 'emea', 'apac', 'amer', 'contract', 'contractor',
  'temporary', 'temp', 'part', 'full', 'time', 'fulltime', 'parttime', 'all', 'levels', 'role', 'position',
  'opening', 'general', 'application', 'experienced',
]);
// 'site' is a stopword only outside "site reliability" (collapsed to "sitereliability").

/** Lowercase, strip accents/punctuation, expand abbreviations, collapse a few compounds. */
export function expandTitle(title) {
  let s = String(title || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/c\+\+/g, ' cplusplus ').replace(/c#/g, ' csharp ').replace(/&/g, ' and ')
    .replace(/\bfront[\s-]?end\b/g, 'frontend').replace(/\bback[\s-]?end\b/g, 'backend')
    .replace(/\bfull[\s-]?stack\b/g, 'fullstack').replace(/\bdev[\s-]?ops\b/g, 'devops')
    .replace(/\bon[\s-]?site\b/g, 'onsite').replace(/\bi\s*&\s*t\b/g, 'integration and test')
    .replace(/\bv\s*&\s*v\b/g, 'verification and validation')
    .replace(/\bm\s*&\s*a\b/g, 'mergers and acquisitions').replace(/\bfp\s*&\s*a\b/g, 'fpanda')
    .replace(/\bs\s*&\s*op\b/g, 'sales and operations planning')
    .replace(/[^a-z0-9+]+/g, ' ');
  s = s.split(' ').filter(Boolean).map((w) => ABBREV[w] || w).join(' ');
  return s.replace(/\bsite reliability\b/g, 'sitereliability').replace(/\bmachine learning\b/g, 'machinelearning');
}

function stem(w) {
  if (w.length > 4 && w.endsWith('s') && !/(ss|us|is)$/.test(w)) w = w.slice(0, -1);
  return SYNONYM[w] || w;
}

// A segment of the title that names the role (vs a team / location / req id).
const SEGMENT_SPLIT = /\s*(?:,|;|\s[-–—|:]\s|[-–—]\s|\s[-–—]|\(|\)|\|)\s*/;
const ROLE_NOUN = /\b(engineer\w*|developer|scientist|research\w*|manager|director|lead|head|analyst|designer|architect|specialist|coordinator|associate|executive|counsel|attorney|recruiter|technician|operator|writer|editor|partner|strategist|consultant|administrator|assistant|officer|planner|buyer|inspector|tutor|fellow|intern|vp|chief|representative|advisor|accountant|controller|producer|electrician|supervisor|agent|machinist|fabricator|assembler|scheduler|expert|owner|generalist|principal|member|programmer|worker|cook|drafter)\b/;

/** The title segment that names the role: "Human Data - Business Operations Analyst" -> "Business Operations Analyst". */
export function rolePart(title) {
  const raw = String(title || '');
  const segs = raw.split(SEGMENT_SPLIT).map((x) => x.trim()).filter(Boolean);
  return segs.find((s) => ROLE_NOUN.test(expandTitle(s))) || segs[0] || raw;
}

// ---------------------------------------------------------------------------
// Role families
// ---------------------------------------------------------------------------

/** Display labels for every family id (order = picker order). */
export const FAMILY_LABELS = Object.freeze({
  swe: 'Software engineering',
  ml: 'AI research & ML engineering',
  data: 'Data science & analytics',
  security: 'Security',
  'eng-manager': 'Engineering management',
  hardware: 'Hardware & systems engineering',
  manufacturing: 'Manufacturing, production & technicians',
  'supply-chain': 'Supply chain & procurement',
  facilities: 'Facilities, construction & data centers',
  'field-ops': 'Field operations & test',
  product: 'Product management',
  design: 'Design',
  program: 'Program & project management',
  bizops: 'Business operations & strategy',
  solutions: 'Solutions & forward-deployed engineering',
  sales: 'Sales & partnerships',
  support: 'Customer support & success',
  marketing: 'Marketing, comms & content',
  legal: 'Legal & contracts',
  policy: 'Policy & government affairs',
  'trust-safety': 'Trust & safety',
  people: 'People & recruiting',
  finance: 'Finance & accounting',
  it: 'IT & enterprise systems',
  admin: 'Executive & administrative support',
  'ai-training': 'AI tutors & expert contributors',
});

/**
 * Specific families, tested in order against the expanded text. Order matters:
 * earlier, narrower families win ("Product Sourcing Engineer" -> supply-chain,
 * "Facilities Maintenance Technician" -> facilities before manufacturing).
 * A bare "engineer"/"developer" is NOT here: it is the last-resort swe fallback.
 */
const FAMILIES = [
  ['ai-training', /\b(ai tutor|tutor|subject matter expert|human frontier collective|annotat\w+|data labeler|rater)\b/],
  ['eng-manager', /\b(engineer(ing)? manager|manager (of )?(software )?engineer(ing)?|(director|head|vp) (of )?(software )?engineer(ing)?|tech lead manager)\b/],
  ['product', /\b(product (manager|management|lead|owner|director)|(head|director|vp) (of )?product\b|assistant product owner)/],
  ['people', /\b(recruit\w*|talent|people|human resources|sourcer|compensation|benefits|payroll partner|learning and development|hr business partner)\b/],
  ['finance', /\b(financ\w*|accountant|accounting|accounts (payable|receivable)|tax|treasury|controller|payroll|fpanda|audit\w*|billing|order to cash|revenue manager|investor relations)\b/],
  ['solutions', /\b(solutions? (architect|engineer\w*|consultant|lead|specialist|principal)|sales engineer|forward deployed|deployment (strategist|lead)|applied ai (engineer|architect)|customer engineer|field (application|solutions) engineer|implementation (engineer|manager|consultant|lead)|technical success|ai advisory|engagement manager|delivery (lead|manager))\b/],
  ['support', /\b(support|customer success|customer (experience|service|learning|education)|technical account manager|user operations)\b/],
  ['supply-chain', /\b(supply (chain|planner|planning)|demand (and supply|planner|planning)|sourcing|procurement|buyer|purchasing|materials? (planner|associate|handler|manager|coordinator|specialist)|logistics|warehous\w*|inventory|shipping|receiving|sales and operations planning|master scheduler|subcontracts?|supplier (development|management)|vendor manager|commodity|expediter|cost value engineer)\b/],
  ['legal', /\b(counsel|legal|attorney|lawyer|paralegal|compliance|regulatory|export control|trade control|patent|contracts? (manager|administrator|specialist|lead|director|negotiator|management))\b/],
  ['trust-safety', /\b(trust and safety|safeguards?|enforcement|integrity|content moderation|moderator|user safety|abuse|harms?)\b/],
  ['policy', /\b(public policy|policy|global affairs|external affairs|government (affairs|relations)|economic development|public affairs)\b/],
  ['security', /\b(security|offensive|red team|threat|detection and response|customer trust|insider risk|nnpi|information assurance|cyber)\b/],
  ['facilities', /\b(facilit\w*|construction|electrician|hvac|plumb\w*|iron worker|carpenter|millwright|data ?center|real estate|workplace|environmental,? health|health and safety|environmental safety|janitor\w*|custodian|cook|chef|culinary|food|power generation|energy storage|land developer|site (acquisition|selection)|fiber)\b/],
  ['design', /\b(designer|design lead|ux|ui|user experience|user research\w*|creative director)\b/],
  ['marketing', /\b(marketing|communications|comms|content|brand|community|events|public relations|writer|editor|documentation|producer|social media|growth|copywriter)\b/],
  ['sales', /\b(account (executive|manager|director|associate|lead|strategist)|sales|business development|capture|partnerships?|partner (manager|director|lead|enablement|development|success)|partner\b|channel|alliances?|reseller|renewals|go to market|deal team|district manager|agency development|strategic pursuits|commercial lead|proposals?)\b/],
  ['data', /\b(data (scientist|science|engineer\w*|analyst|analytics|governance|platform|strategy)|analytics|business intelligence|enterprise data)\b/],
  ['it', /\b(it|information technology|help ?desk|service desk|systems? administrator|sysadmin|enterprise (applications|systems)|business systems|corporate network|endpoint|netsuite|workday)\b/],
  ['admin', /\b(executive assistant|administrative|office manager|receptionist|executive business partner)\b/],
  ['manufacturing', /\b(technician|assembler|assembly|machinist|cnc|fabricat\w*|welder|welding|inspector|inspection|production (associate|coordinator|supervisor|manager|lead|operator|planner|control|technician|worker|operations)|((vp|head|director|deputy head|manager) (of )?production)|manufacturing (associate|technician|operator|supervisor|lead|manager)|quality\b(?! engineer)|metrology|machine operator|sheet metal|wire harness|solder\w*|line lead|shift lead|tooling)\b/],
  ['field-ops', /\b(operator|mission operations|field (service|services|operations|support)|deployment(s)? (and training|specialist|engineer|manager)|mission readiness|training (lead|coordinator|specialist|instructor)|instructor|range (safety|operations))\b/],
  ['program', /\b(program (manager|management|director|lead|assistant|coordinator|analyst|specialist)|programs\b|project (manager|management|coordinator|lead)|technical program|pmo|configuration (manager|management|analyst)|change control|mission (manager|director)|product operations)\b/],
  ['bizops', /\b(business (operations|affairs)|strategy|strategic (operations|initiatives|execution|planning|projects)|chief of staff|corporate development|mergers and acquisitions|operations (analyst|manager|lead|associate|specialist|director)|revenue operations|deal operations|transformation)\b/],
  ['ml', /\b(machinelearning|research (engineer|scientist)|scientist|research\w*|ai|deep learning|nlp|computer vision|perception|interpretability|alignment|pretraining|post training|reinforcement learning|llm|multimodal)\b/],
  ['hardware', /\b(electrical|mechanical|electromechanical|hardware|firmware|embedded|fpga|asic|silicon|pcba?|rf|antenna|avionics|aero\w*|propulsion|structures?|structural|thermal|mechanisms?|fluid systems|landing gear|flight (controls|sciences|test|software)|guidance navigation and control|controls engineer|scada|power (electronics|systems)|battery|actuators?|optic\w*|sensors?|payloads?|weapons|munitions|energetics|rocket|space systems|satellite|systems (engineer|engineering|architect|integration)|mission (systems|engineer)|seit|integration and test|test (and evaluation|engineer|operations|conductor|infrastructure|instrumentation)|reliability (engineer|test)|hardware test|dev(elopment)? test|hil|human factors|emc|emi|new product introduction|quality engineer|manufacturing (engineer\w*|process|test)|materials engineer|chief engineer|sustainment engineer|cad|drafter|modeling and simulation|simulation (engineer|analyst)|operations analysis|robotics hardware)\b/],
  ['swe', /\b(software|sitereliability|devops|infrastructure|platform|backend|frontend|fullstack|mobile|ios|android|web|cloud|distributed systems|compiler|kernel|product engineer|test automation|sdet|network engineer|performance engineer|inference engineer|security engineer)\b/],
];

/** Department text -> family, used only when the title alone is not specific. */
const DEPT_HINTS = [
  ['ai-training', /\bhuman (data|frontier)/],
  ['facilities', /\b(data ?center|facilit|real estate|ehs|workplace|construction|compute)\b/],
  ['supply-chain', /\b(supply chain|procurement|sourcing|logistics|warehous)/],
  ['manufacturing', /\b(manufactur\w*|production)\b/],
  ['finance', /\b(financ\w*|accounting)\b/],
  ['legal', /\b(legal|business affairs)\b/],
  ['people', /\b(people|talent|recruit\w*|human resources)\b/],
  ['policy', /\b(policy|global affairs|government affairs)\b/],
  ['trust-safety', /\b(safeguards|trust and safety)\b/],
  ['security', /\bsecurity\b/],
  ['marketing', /\b(marketing|communications|brand|events)\b/],
  ['sales', /\b(sales|go to market|revenue|growth|business development|capture|partnerships)\b/],
  ['support', /\b(support|user operations|customer success|customer experience)\b/],
  ['product', /\bproduct management\b/],
  ['ml', /\b(research|modeling|model|ai research)\b/],
  ['it', /\b(it|corporate technology|business systems)\b/],
  ['hardware', /\b(hardware|mechanical|electrical|propulsion|aircraft|x bat|v bat|space|test operations|quality|reliability|systems engineering|flight|avionics|engineering services)\b/],
  ['swe', /\b(software|infrastructure|platform|applications)\b/],
  ['program', /\b(program management|programs)\b/],
  ['field-ops', /\b(deployments?|field operations|mission operations)\b/],
];

const GENERIC_ENGINEER = /\b(engineer\w*|developer|programmer)\b/;
const TECH_STAFF = /\bmember technical staff\b|\bmember of technical staff\b|\btechnical staff\b/;
const ML_HINT = /\b(training|model\w*|research|post|pretrain\w*|multimodal|rl|reasoning|eval\w*|alignment|interpretability|synthetic data|data|inference|agents?|safety)\b/;

function firstFamily(text) {
  for (const [id, re] of FAMILIES) if (re.test(text)) return id;
  return null;
}

/**
 * Role family id for a title (null when nothing matches). Tries the role
 * segment, then the whole title, then the department (if given), then a bare
 * "engineer" -> "swe". "Member of Technical Staff" is ml when the team or
 * department looks like modelling/research, else swe.
 * @param {string} title
 * @param {{ department?: string|null }|string} [ctx] department text (or a ctx object / Job)
 */
export function roleFamily(title, ctx) {
  const dept = typeof ctx === 'string' ? ctx : ctx && typeof ctx === 'object' ? ctx.department : null;
  const full = expandTitle(title);
  if (!full) return null;
  const role = expandTitle(rolePart(title));
  const deptText = dept ? expandTitle(dept) : '';
  if (TECH_STAFF.test(full)) return ML_HINT.test(`${full} ${deptText}`) ? 'ml' : 'swe';
  const fam = firstFamily(role) || firstFamily(full);
  if (fam) return fam;
  if (deptText) {
    for (const [id, re] of DEPT_HINTS) {
      if (!re.test(deptText)) continue;
      if (id === 'manufacturing' && GENERIC_ENGINEER.test(full)) return 'hardware';
      return id;
    }
  }
  return GENERIC_ENGINEER.test(full) ? 'swe' : null;
}

/** Partial credit between related families (symmetric). */
const FAMILY_AFFINITY = {
  'swe|security': 0.6, 'swe|ml': 0.45, 'swe|data': 0.45, 'ml|data': 0.55, 'swe|eng-manager': 0.4,
  'swe|hardware': 0.35, 'product|program': 0.35, 'sales|support': 0.4, 'sales|marketing': 0.3,
  'product|design': 0.25, 'eng-manager|program': 0.25, 'swe|solutions': 0.5, 'sales|solutions': 0.45,
  'hardware|manufacturing': 0.35, 'manufacturing|supply-chain': 0.3, 'program|bizops': 0.4,
  'swe|it': 0.4, 'security|it': 0.35, 'hardware|field-ops': 0.35, 'policy|legal': 0.35,
  'policy|trust-safety': 0.4, 'facilities|manufacturing': 0.25, 'swe|ai-training': 0, 'ml|ai-training': 0,
};

/** Similarity of two family ids in [0,1] (0.35 when either is unknown). */
export function familySim(a, b) {
  if (!a || !b) return 0.35;
  if (a === b) return 1;
  return FAMILY_AFFINITY[`${a}|${b}`] ?? FAMILY_AFFINITY[`${b}|${a}`] ?? 0;
}

// ---------------------------------------------------------------------------
// Seniority
// ---------------------------------------------------------------------------

export const SENIORITY_LADDER = Object.freeze(['Intern', 'Entry', 'Mid', 'Senior', 'Staff+', 'Manager', 'Director+']);

/** Seniority guessed from a free-text title (null when the title has no level words). */
export function inferSeniority(title) {
  const s = expandTitle(title);
  if (/\b(intern|internship|apprentice)\b/.test(s)) return 'Intern';
  if (/\b(chief|vp|vice president|head|director)\b/.test(s)) return 'Director+';
  if (/\b(staff|principal|distinguished|fellow)\b/.test(s)) return 'Staff+';
  if (/\bmanager\b/.test(s) && !/\b(product|program|project|account|partner\w*|marketing|success|community|office|operations|territory|sales)\s+manager\b/.test(s)) return 'Manager';
  if (/\b(senior|lead)\b/.test(s)) return 'Senior';
  if (/\b(junior|new grad|graduate|entry|associate|trainee)\b/.test(s)) return 'Entry';
  return null;
}

// ---------------------------------------------------------------------------
// normalizeTitle
// ---------------------------------------------------------------------------

/**
 * Normalize a job title into comparable role tokens plus family and level.
 * @param {string} title
 * @param {{ department?: string|null }|string} [ctx] optional department (improves family for generic titles)
 * @returns {{ tokens: string[], family: string|null, seniority: string|null, role: string }}
 */
export function normalizeTitle(title, ctx) {
  const raw = String(title || '');
  const tokens = [];
  const seen = new Set();
  for (const w of expandTitle(raw).split(' ')) {
    if (!w || LEVEL_WORDS.has(w) || STOPWORDS.has(w)) continue;
    const t = stem(w);
    if (t && !seen.has(t)) { seen.add(t); tokens.push(t); }
  }
  const role = expandTitle(rolePart(raw)).split(' ').filter((w) => w && !LEVEL_WORDS.has(w) && !STOPWORDS.has(w)).join(' ');
  return { tokens, family: roleFamily(raw, ctx), seniority: inferSeniority(raw), role };
}
