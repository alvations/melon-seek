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
  bizops: 'business operations', av: 'audio visual', hrbp: 'hr business partner', ehs: 'environmental health and safety', npi: 'new product introduction',
  // French words in Google's and Microsoft's Canadian titles (fix wave 3, BP-4: "Représentant aux
  // ventes sur le terrain II" was software engineering, "Étudiant-chercheur" had no family).
  logiciel: 'software', logiciels: 'software', developpeur: 'developer', developpeuse: 'developer',
  ingenieur: 'engineer', ingenieure: 'engineer', chercheur: 'researcher', chercheuse: 'researcher',
  recherche: 'research', ventes: 'sales', vente: 'sales', representant: 'representative', representante: 'representative',
  stagiaire: 'intern', etudiant: 'student', etudiante: 'student',
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

// expandTitle is pure and runs several times per title (roleFamily: the title, its role part and
// the department; normalizeTitle and inferSeniority again), on boards of thousands of roles: about
// 0.5 s at 4x CPU for Apple's Insights (docs/process/perf-mobile-beta.md). Results are memoized.
const EXPANDED = new Map();
const EXPANDED_MAX = 20000;

/** Lowercase, strip accents/punctuation, expand abbreviations, collapse a few compounds. */
export function expandTitle(title) {
  const key = String(title || '');
  let s = EXPANDED.get(key);
  if (s === undefined) {
    if (EXPANDED.size >= EXPANDED_MAX) EXPANDED.clear();
    EXPANDED.set(key, (s = expand(key)));
  }
  return s;
}
function expand(title) {
  let s = title.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/c\+\+/g, ' cplusplus ').replace(/c#/g, ' csharp ')
    .replace(/\bi\s*&\s*t\b/g, ' integration and test ').replace(/\bv\s*&\s*v\b/g, ' verification and validation ')
    .replace(/\bm\s*&\s*a\b/g, ' mergers and acquisitions ').replace(/\bfp\s*&\s*a\b/g, ' fpanda ')
    .replace(/\bs\s*&\s*op\b/g, ' sales and operations planning ').replace(/&/g, ' and ')
    .replace(/\bfront[\s-]?end\b/g, 'frontend').replace(/\bback[\s-]?end\b/g, 'backend')
    .replace(/\bfull[\s-]?stack\b/g, 'fullstack').replace(/\bdev[\s-]?ops\b/g, 'devops')
    .replace(/\bon[\s-]?site\b/g, 'onsite')
    .replace(/\b(responsable|gestionnaire) de compte\b/g, ' account manager ')
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
const ROLE_NOUN = /\b(engineer\w*|developer|scientist|researcher|manager|director|lead|head|analyst|designer|architect|specialist|coordinator|associate|executive|counsel|attorney|recruiter|technician|operator|writer|editor|partner|strategist|consultant|administrator|assistant|officer|planner|buyer|inspector|tutor|fellow|intern|vp|chief|representative|advisor|accountant|controller|producer|electrician|supervisor|agent|machinist|fabricator|assembler|scheduler|expert|owner|generalist|principal|member|programmer|worker|cook|drafter)\b/;

// ---------------------------------------------------------------------------
// Display titles
// ---------------------------------------------------------------------------

// Role abbreviations companies put in titles ("RE / RS", "SWE", "GTM"), written out for display.
// Only role words: domain terms (EW, GNC, SOX…) are the company's own and stay as posted.
const TITLE_ABBR = [
  [/\bRE\s*\/\s*RS\b/g, 'Research Engineer / Research Scientist'],
  [/\bRS\s*\/\s*RE\b/g, 'Research Scientist / Research Engineer'],
  [/\bTPM Manager\b/g, 'Manager, Technical Program Management'],
  [/\bSW Eng\.?(?=[\s,)]|$)/g, 'Software Engineer'],
  [/\bSWEs\b/g, 'Software Engineers'],
  [/\bSWE\b/g, 'Software Engineer'],
  [/\bTPM\b/g, 'Technical Program Manager'],
  [/\bMTS\b/g, 'Member of Technical Staff'],
  [/\bGTM\b/g, 'Go-to-Market'],
  [/\bBD\b/g, 'Business Development'],
  [/\bSr\.\s*/g, 'Senior '],
  [/\bJr\.\s*/g, 'Junior '],
];
const initials = (words) => words.split(/[\s-]+/).filter(Boolean).map((w) => w[0]).join('').toUpperCase();

/**
 * Title for display: role abbreviations written out, and a "(FDE)" that only repeats the words
 * before it ("Forward Deployed Engineer (FDE)") dropped. The posted title is kept by the caller.
 * @param {string} title
 * @returns {string}
 */
export function readableTitle(title) {
  // UX-32: a list number left at the front of a posted title ("8. Mixed Signal Design Engineer") is not part
  // of the role's name; the drawer still shows the posted title ("Posted as …").
  let t = String(title || '').replace(/^\s*\d{1,2}[.)]\s+(?=[A-Za-z])/, '');
  // "Forward Deployed Engineer (FDE)" / "Go-To-Market (GTM)" -> drop the repeat: the
  // parenthesis spells the initials of words earlier in the title.
  t = t.replace(/\s*\(([A-Z]{2,5})\)/g, (m, ab, at) => {
    const ws = t.slice(0, at).split(/[^A-Za-z]+/).filter(Boolean);
    for (let i = 0; i + ab.length <= ws.length; i++) if (initials(ws.slice(i, i + ab.length).join(' ')) === ab) return '';
    return m;
  });
  const hasMgr = /\bmanager\b/i.test(t);
  t = t.replace(/\bMLE\b/g, hasMgr ? 'Machine Learning Engineering' : 'Machine Learning Engineer');
  t = t.replace(/\bFDE\b/g, /\bengineer\b/i.test(t.replace(/\bFDE\b/g, '')) && !hasMgr ? 'Forward Deployed Engineer' : 'Forward Deployed Engineering');
  for (const [re, to] of TITLE_ABBR) t = t.replace(re, to);
  return t.replace(/\s{2,}/g, ' ').replace(/\s+([,)])/g, '$1').trim();
}

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
  chip: 'Chip design & silicon engineering',
  manufacturing: 'Manufacturing, production & technicians',
  'supply-chain': 'Supply chain & procurement',
  facilities: 'Facilities, construction & data centers',
  'dc-tech': 'Data center technicians',
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
 * Chip design and silicon engineering (fix wave 3, BP-4): verification, physical design, DFT,
 * RTL, mixed-signal and analog IC, layout and mask design, timing, EDA. 193 NVIDIA postings fell
 * through to software engineering and Apple's ~600 silicon roles sat in hardware, so a design
 * verification engineer was compared with software or mechanical engineers. A title that names
 * software, firmware, a compiler or a driver is left to those families ("Senior C++ Software
 * Engineer - Chip Design Tools" stays software, "SoC Firmware Engineer" stays hardware).
 * Tested after program, product, sales and business operations ("SoC Program Manager" is program).
 */
const CHIP = /^(?!.*\b(software|firmware|fw|compiler|drivers?)\b).*\b(asic|rtl|vlsi|socs?|dft|dfx|atpg|sta|static timing|timing (analysis|closure|signoff|design|engineer\w*)|physical (design|synthesis|verification)|logic synthesis|place and route|pnr|formal verification|design verification(?! test)|dv (engineer|lead)|(cpu|gpu|npu|tpu|soc|ip|asic|chip|full chip|fc|block|unit|subsystem|graphics|pcie|ddr|usb|serdes|ams|mixed signal|analog|digital|memory|cache) (design )?verification|chips?|chipsets?|full chip|silicon|(pre|post) (silicon|si)|(?<!printed )circuits?|mixed signal|ams|(ic|analog|digital|rfic|custom|memory|mask|cell|chip|full custom) layout|mask design|standard cell|cell (library|modeling|characterization)|serdes|sram|logic design|rtl design|micro ?architect\w*|(cpu|gpu|npu|tpu|soc|asic) (architect\w*|design\w*|core|rtl|physical|logic|integration)|ic (design\w*|layout|packaging|verification|engineer\w*)|rfic|photonics? ic|interposer|(fe|frontend) implementation|package design|eda|tape ?out|upf|signoff|clock (tree|distribution)|semiconductors?)\b/;
// Chip words that turn a "design manager" or "designer" into chip design ("CPU Cache Subsystem Senior Design Manager").
const CHIP_CONTEXT = /\b(cpu|gpu|npu|tpu|socs?|asic|rtl|silicon|circuits?|mixed signal|vlsi|chips?|cache subsystem|memory subsystem|design verification|physical design|formal verification)\b/;
// Technicians on a data-center floor (Google "Data Center Technician III", Microsoft "Critical
// Environment Technician"): their own family, not the data-center engineers and real-estate
// managers in facilities (fix wave 3, BP-4: a Google technician compared with Anthropic's $362K
// data-center engineers).
const DC_CONTEXT = /\b(data ?centers?|datacenters?|critical environment)\b/;
const TECHNICIAN = /\btechnicians?\b/;

/**
 * Specific families, tested in order against the expanded text. Order matters:
 * earlier, narrower families win ("Product Sourcing Engineer" -> supply-chain,
 * "Facilities Maintenance Technician" -> facilities before manufacturing).
 * A bare "engineer"/"developer" is NOT here: it is the last-resort swe fallback.
 */
const FAMILIES = [
  ['ai-training', /\b(ai tutor|tutor|subject matter expert|human frontier collective|annotat\w+|data labeler|rater)\b/],
  ['eng-manager', /\b(engineer(ing)? manager|manager (of )?(software )?engineer(ing)?|(director|head|vp) (of )?(software )?engineer(ing)?|tech(nical)? lead manager|manager (\w+ ){0,3}engineering)\b/],
  ['product', /\b(product (manager|management|lead|owner|director)|(head|director|vp) (of )?product\b|assistant product owner)/],
  ['people', /\b(recruit\w*|talent|people|human resources|sourcer|compensation|benefits|payroll partner|learning and development|hr business partner|hr)\b/],
  ['admin', /\b(executive assistant|administrative|office manager|receptionist|executive business partner|executive operations|front desk)\b/],
  ['finance', /\b(financ\w*\b(?! (services|systems))|accountant|accounting|accounts (payable|receivable)|tax|treasury|(?<!(flight|memory|cache|display|dma|interrupt|motor|storage|ddr|dram|pcie|usb|management|embedded|io) )controller|payroll|fpanda|audit\w*|billing|order to cash|revenue manager|investor relations|pricing)\b/],
  ['support', /\b(support|customer success|customer (experience|service|learning|education)|technical account manager|user operations|technical (training|education|instructor))\b/],
  ['solutions', /\b(solutions? (architect\w*|engineer\w*|consultant|lead|specialist|principal)|sales engineer|forward deployed|deployment (strategist|lead)|ai deployment specialist|(?<!(cloud|itav|it) )deployment engineer|applied ai (engineer\w*|architect)|customer engineer|field (application|solutions) engineer|(?<!(fe|frontend|physical|soc|rtl|design) )implementation (engineer|manager|consultant|lead)|technical success|ai advisory|engagement manager|delivery (lead|manager)|(field|executive|enterprise|principal|customer) architect|field engineer|technical deployment)\b/],
  ['supply-chain', /\b(supply (chain|planner|planning)|demand (and supply|planner|planning)|sourcing|procurement|buyer|purchasing|materials? (planner|associate|handler|manager|management|coordinator|specialist)|capacity (planner|planning)|logistics|warehous\w*|inventory|shipping|receiving|sales and operations planning|master scheduler|subcontracts?|supplier (development|management)|vendor manager|commodity|expediter|cost value engineer)\b/],
  ['legal', /\b(counsel|legal|attorney|lawyer|paralegal|compliance|regulatory|export control|trade control|patent|contracts? (manager|administrator|specialist|lead|director|negotiator|management|operations))\b/],
  ['trust-safety', /\b(trust and safety|safeguards?|enforcement|(?<!(signal|power|software) )integrity|content moderation|moderator|user safety|abuse|harms?|safety operations|child safety|fraud|anti money laundering|aml|bsa|investigator)\b/],
  ['policy', /\b(public policy|policy|global affairs|external affairs|government (affairs|relations)|economic development|public affairs)\b/],
  ['security', /\b(security|offensive|red team|threat|detection and response|customer trust|insider risk|nnpi|information assurance|cyber)\b/],
  ['facilities', /\b(facilit\w*|construction|electrician|hvac|plumb\w*|iron worker|carpenter|millwright|data ?center|real estate|workplace|environmental,? health|health and safety|environmental safety|janitor\w*|custodian|cook|chef|culinary|food|land develop\w*|site (acquisition|selection|operations)|fiber|industrial compute|development planner|barista|commissioning)\b/],
  ['design', /\b((?<!(structural|mechanical|electrical|pcb|hardware|rf|cad|layout|circuit|ic|asic|analog|digital|logic|rtl|mask|chip|silicon|soc|board) )designer|(?<!(physical|chip|asic|soc|rtl|logic|circuit|ic|silicon|analog|digital|integration|cpu|gpu|board|mask|layout|co) )design (lead|manager|director)|(head|director|vp) (of )?design\b(?! (verification|engineer\w*))|ux|ui|user experience|user research\w*|creative director)\b/],
  ['marketing', /\b(marketing|communications|comms|content|brand|community|events|public relations|writer|editor|documentation|producer|social media|growth (marketing|lead|manager)|lifecycle|campaigns?|copywriter)\b/],
  ['sales', /\b(account (executive|manager|director|associate|lead|strategist)|sales|business development|capture|partnerships?|partner (manager|director|lead|enablement|development|success)|partner\b|channel|alliances?|reseller|renewals|go to market|deal team|district manager|agency development|strategic pursuits|commercial lead|proposals?|developer relations|(sales|revenue|partner|reseller|go to market|business development representative|leader|customer) enablement)\b/],
  ['data', /\b(data (scientist|science|engineer\w*|analyst|analytics|governance|platform|strategy)|analytics|business intelligence|enterprise data|data (acquisition|strategist|operations)|economists?|econometric\w*)\b/],
  ['it', /\b(it|information technology|help ?desk|service desk|systems? administrator|sysadmin|enterprise (applications|systems)|business systems|corporate network|endpoint|netsuite|workday|asset management|audio visual|network operations|financ\w* systems)\b/],
  ['manufacturing', /\b(technician|assembler|assembly|machinist|cnc|fabricat\w*|welder|welding|inspector|inspection|production (associate|coordinator|supervisor|manager|lead|operator|planner|control|technician|worker|operations)|((vp|head|director|deputy head|manager) (of )?production)|manufacturing (associate|technician|operator|supervisor|lead|manager|specialist)|factory|maintenance (lead|technician|supervisor|manager)|quality\b(?! (assurance )?engineer)|metrology|machine operator|sheet metal|wire harness|solder\w*|line lead|shift lead)\b/],
  // "Operator" only for vehicles, flight test and ranges (persona review 2026-10-10: a bare
  // "operator" put Anthropic's Life Sciences Operator beside drone operators). Plain deployment
  // engineers are software or IT; only deployment-and-training and in-country deployment are field work.
  ['field-ops', /\b((air vehicle|vehicle|uas|uav|drone|flight( test)?|test|range|mission|sensor|payload|radar|robot) operator|mission operations|field (service|services|operations|support)|deployments? and training|international deployment|mission readiness|training (lead|coordinator|specialist|instructor)|instructor|trainer|range (safety|operations)|sustainment\b(?! engineer))/],
  ['program', /\b(program (manager|management|director|lead|assistant|coordinator|analyst|specialist)|programs\b|project (manager|management|coordinator|lead)|technical program|pmo|configuration (manager|management|analyst)|change control|mission (manager|director)|product operations)\b/],
  ['bizops', /\b(business (operations|affairs)|strategy|strategic (operations|initiatives|execution|planning|projects)|chief of staff|corporate development|mergers and acquisitions|operations (analyst|manager|lead|associate|specialist|director)|revenue operations|deal operations|transformation|operations\b(?! (engineer|analysis)))/],
  ['chip', CHIP],
  ['ml', /\b(machinelearning|research (engineer|scientist)|scientist|research\w*|ai|deep learning|nlp|computer vision|perception|interpretability|alignment|pretraining|post training|reinforcement learning|llm|multimodal)\b/],
  ['swe', /\b(software|distributed systems)\b/], // an explicit software role beats hardware words ("GNC Software Engineer", Netflix "Distributed Systems Engineer")
  ['hardware', /\b(electrical|mechanical|electromechanical|hardware|firmware|embedded|fpga|asic|silicon|pcba?|rf|antenna|avionics|aero\w*|propulsion|structures?|structural|thermal|mechanisms?|fluid systems|landing gear|flight (controls?|controllers?|sciences|test)|guidance navigation and control|controls engineer|scada|power (electronics|systems)|battery|energy storage|actuators?|optic\w*|sensors?|payloads?|weapons|munitions|energetics|rocket|space systems|satellite|systems (engineer|engineering|architect|integration)|mission (systems|engineer)|seit|integration and test|test (and evaluation|engineer|operations|conductor|infrastructure|instrumentation)|reliability (engineer|test)|hardware test|dev(elopment)? test|hil|human factors|emc|emi|new product introduction|quality engineer|manufacturing (engineer\w*|process|test)|materials engineer|chief engineer|sustainment engineer|cad|drafter|modell?ing and simulation|simulation (engineer|analyst)|operations analysis|robotics hardware|air vehicles?|(signal|power) integrity|board (design|product|bring up|level|layout|engineer\w*))\b/],
  ['swe', /\b(software|sitereliability|devops|infrastructure|platform|backend|frontend|fullstack|mobile|ios|android|web|cloud|distributed systems|compiler|kernel|product engineer|test automation|sdet|network engineer|performance (engineer|modeling)|inference engineer|security engineer|autonomy)\b/],
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
  ['chip', /\b(asic|phys design|physical design|mask design|mixed signal|silicon|vlsi|soc)\b|^engineer verification$/],
  ['hardware', /\b(hardware|mechanical|electrical|propulsion|aircraft|x bat|v bat|space|test operations|quality|reliability|systems engineering|flight|avionics|engineering services)\b/],
  ['swe', /\b(software|infrastructure|platform|applications)\b/],
  ['program', /\b(program management|programs)\b/],
  ['field-ops', /\b(deployments?|field operations|mission operations)\b/],
];

const GENERIC_ENGINEER = /\b(engineer\w*|developer|programmer)\b/;
const TECH_STAFF = /\bmember technical staff\b|\bmember of technical staff\b|\btechnical staff\b/;
const ML_HINT = /\b(training|model\w*|research|post|pretrain\w*|multimodal|rl|reasoning|eval\w*|alignment|interpretability|synthetic data|data|inference|agents?|safety)\b/;

// Phrases that decide the family wherever they appear in the title.
const PRIORITY = [
  ['ai-training', /\b(human frontier collective|ai tutor)\b/],
  ['trust-safety', /\bfinancial crimes?\b/],
  ['security', /\b(cross domain|gsoc|security operations center)\b/],
];

function firstFamily(text) {
  for (const [id, re] of FAMILIES) if (re.test(text)) return id;
  return null;
}

// "National security" names the customer or the field, not security work: "Head of National
// Security Sales" is sales, and a "National Security Partnerships Lead" in Public Policy is policy
// (persona review 2026-10-10, P-11). The phrase is masked before the family rules run.
const NATSEC = /\b(national|international|homeland) security\b/g;
// "Silicon Valley" is a place, not chip work.
const SILICON_VALLEY = /\bsilicon valley\b/g;
const POLICY_DEPT = /\b(public policy|global affairs|government affairs|government and public policy)\b/;
// Research fellowships ("Anthropic Fellows Program, AI Safety & Security") are research, whatever the topic.
const FELLOWSHIP = /\b(fellows program|fellowship program|research fellowship)\b/;
const RESEARCH_DEPT = /\b(research|ai research)\b/;

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
  const mask = (s) => s.replace(NATSEC, 'natsec').replace(SILICON_VALLEY, 'siliconvalley');
  const full = mask(expandTitle(title));
  if (!full) return null;
  const role = mask(expandTitle(rolePart(title)));
  const deptText = dept ? mask(expandTitle(dept)) : '';
  // Data-center technicians, whatever else the title names ("SR. Data Center Technician IT Support").
  if (TECHNICIAN.test(full) && DC_CONTEXT.test(`${full} ${deptText}`)) return 'dc-tech';
  if (TECH_STAFF.test(full)) return ML_HINT.test(`${full} ${deptText}`) ? 'ml' : 'swe';
  for (const [id, re] of PRIORITY) if (re.test(full)) return id;
  if (FELLOWSHIP.test(full) && (RESEARCH_DEPT.test(deptText) || /\b(ai|research|machinelearning|safety)\b/.test(full))) return 'ml';
  let fam = firstFamily(role) || firstFamily(full);
  // A sales, security or solutions title in a public-policy department is government-affairs work.
  if (['sales', 'security', 'solutions'].includes(fam) && POLICY_DEPT.test(deptText)) fam = 'policy';
  // Context overrides: building-systems engineers, and policy work inside Trust & Safety.
  if (fam === 'manufacturing' && /\bengineer\b/.test(full)) fam = 'hardware'; // "Staff Engineer, Quality"
  if (fam === 'hardware' && (/\b(facilit\w*|construction)\b/.test(full) ||
    (/\bdata ?center\b/.test(full) && /\b(electrical|mechanical|controls)\b/.test(full)))) fam = 'facilities';
  if (fam === 'policy' && /\bsecurity\b/.test(deptText)) fam = 'security';
  // Technicians, operators and ops staff on a data-center campus are facilities work.
  if (['manufacturing', 'bizops', 'field-ops'].includes(fam) && /\bdata ?center\b/.test(`${full} ${deptText}`)) fam = 'facilities';
  if (fam === 'policy' && /\b(safeguards|trust and safety|integrity)\b/.test(deptText)) fam = 'trust-safety';
  // A design manager or designer of chips is chip design ("CPU Cache Subsystem Senior Design Manager").
  if (fam === 'design' && CHIP_CONTEXT.test(full)) fam = 'chip';
  // Microsoft's design managers in Technical Program Management run data-center design, not UX.
  if (fam === 'design' && /\bprogram manage\w*\b/.test(deptText) && !/\b(ux|ui|product design|user experience|visual|graphic|interaction|brand)\b/.test(full)) fam = 'program';
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
  'hardware|chip': 0.85, 'swe|chip': 0.5, 'dc-tech|facilities': 0.7, 'dc-tech|manufacturing': 0.5, 'dc-tech|it': 0.4, 'dc-tech|support': 0.3,
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

/**
 * server/keywords.js stores 'Mid' for every title that names no level (about half of all
 * postings): the stored default. The stored value stays 'Mid'.
 */
export const LEVEL_NOT_STATED = 'Mid';
/** The level people see for a posting whose level is only the default (displayLevel). */
export const NOT_STATED = 'Not stated';

/**
 * Shared decision 1 (beta fix wave, 2026-10-10): the level a job seeker sees for a posting.
 * server/normalize.js sets `job.seniorityBasis`: 'title' (the title named the level, e.g. a
 * company ladder rung that means mid level, Google "III" or Netflix "L4", stored as 'Mid'),
 * 'pay' (the pay sentence named it, Microsoft "IC6") or 'default'. A stored 'Mid' whose basis is
 * 'default' or missing is the default, so it reads NOT_STATED; any other level is shown as stored.
 * Cards, the Seniority filter, the chart's grouping, the drawer and saved-search names all use it;
 * stored data keeps 'Mid'. levelLabel(displayLevel(job)) is the words to show.
 *   displayLevel({ seniority: 'Mid' })                           -> 'Not stated'
 *   displayLevel({ seniority: 'Mid', seniorityBasis: 'title' })  -> 'Mid'
 *   displayLevel({ seniority: 'Senior' })                        -> 'Senior'
 * @param {{ seniority?: string|null, seniorityBasis?: 'title'|'pay'|'default'|null }} job
 * @returns {string} a SENIORITY_LADDER level or NOT_STATED
 */
export function displayLevel(job) {
  const level = job && job.seniority;
  if (!level || level === NOT_STATED) return NOT_STATED;
  if (level === LEVEL_NOT_STATED && (!job.seniorityBasis || job.seniorityBasis === 'default')) return NOT_STATED;
  return level;
}
/** Words for a displayLevel() value: NOT_STATED (or nothing) reads "Level not stated"; a level reads as itself ("Mid"). */
export function levelLabel(level) {
  return !level || level === NOT_STATED ? 'Level not stated' : level;
}
/**
 * True for a stored level that can be compared across companies (market comps, Compstimate's
 * "at Senior level"): anything but the stored 'Mid' (mostly the default) and NOT_STATED.
 */
export function levelStated(level) {
  return !!level && level !== LEVEL_NOT_STATED && level !== NOT_STATED;
}
/** Stored levels in the order people see them: 'Mid' (mostly the default) goes last. */
export const SENIORITY_DISPLAY_ORDER = Object.freeze([...SENIORITY_LADDER.filter((l) => l !== LEVEL_NOT_STATED), LEVEL_NOT_STATED]);
/** displayLevel() values in the order people see them: the ladder, then "Level not stated" last. */
export const DISPLAY_LEVEL_ORDER = Object.freeze([...SENIORITY_LADDER, NOT_STATED]);

/**
 * The value that stands for a displayLevel() value in links (s=) and in selects. "Level not stated"
 * keeps the stored 'Mid', which is what earlier links, saved searches and stored levels mean by it;
 * a mid level the posting states is 'Mid-level'. levelFromKey() reads one back.
 *   levelKey('Not stated') -> 'Mid', levelKey('Mid') -> 'Mid-level', levelKey('Senior') -> 'Senior'
 */
export const MID_STATED_KEY = 'Mid-level';
export function levelKey(level) {
  if (!level || level === NOT_STATED) return LEVEL_NOT_STATED;
  return level === LEVEL_NOT_STATED ? MID_STATED_KEY : level;
}
/** levelKey() reversed: 'Mid' (and the old 'Unspecified') -> 'Not stated', 'Mid-level' -> 'Mid'. */
export function levelFromKey(key) {
  if (key === LEVEL_NOT_STATED || key === 'Unspecified') return NOT_STATED;
  return key === MID_STATED_KEY ? LEVEL_NOT_STATED : key;
}

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
