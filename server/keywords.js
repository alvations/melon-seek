// Job description parsing: bullet sections, keyword facets and seniority.
// No DOM library: a small regex tokenizer walks the HTML.

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘',
  ldquo: '“', rdquo: '”', mdash: '—', ndash: '–', hellip: '…', bull: '•', middot: '·',
  trade: '™', reg: '®', copy: '©', eacute: 'é', egrave: 'è', uuml: 'ü', ouml: 'ö', auml: 'ä',
  ntilde: 'ñ', ccedil: 'ç', pound: '£', euro: '€', yen: '¥', cent: '¢', times: '×', shy: '',
  zwj: '', zwnj: '', ensp: ' ', emsp: ' ', thinsp: ' ',
};

export function decodeEntities(s) {
  return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return Number.isFinite(code) ? String.fromCodePoint(code) : m; } catch { return m; }
    }
    const v = NAMED_ENTITIES[e.toLowerCase()];
    return v === undefined ? m : v;
  });
}

function cleanText(s) {
  return decodeEntities(s)
    .replace(/[​ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanBullet(s) {
  return cleanText(s)
    .replace(/^[\s•·▪●◦‣∙*\-–—]+/, '')
    .replace(/[\s;,]+$/, '')
    .trim();
}

/** Plain text from HTML (block tags become newlines). */
export function htmlToText(html) {
  return decodeEntities(
    String(html || '')
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<\/?(p|div|li|ul|ol|h[1-6]|br|tr|section|article|header|blockquote|table)\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t ]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

const BLOCK_TAGS = new Set([
  'p', 'div', 'li', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'br', 'tr', 'td', 'th',
  'section', 'article', 'header', 'footer', 'blockquote', 'table', 'hr', 'dl', 'dt', 'dd',
]);
const BOLD_TAGS = new Set(['strong', 'b']);

/** Tokenize HTML into a flat list of text blocks: {type:'h'|'li'|'p', text, bold}. */
function htmlToBlocks(html) {
  const src = String(html || '')
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  const blocks = [];
  let buf = '';
  let boldChars = 0;
  let liDepth = 0;
  let headingDepth = 0;
  let boldDepth = 0;

  const flush = () => {
    const text = cleanText(buf);
    if (text) {
      const nonSpace = text.replace(/\s|[:：]/g, '').length || 1;
      blocks.push({
        type: headingDepth > 0 ? 'h' : liDepth > 0 ? 'li' : 'p',
        text,
        bold: boldChars / nonSpace >= 0.8,
      });
    }
    buf = '';
    boldChars = 0;
  };

  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>|([^<]+)|(<)/g;
  let m;
  while ((m = re.exec(src))) {
    if (m[4] !== undefined || m[5] !== undefined) {
      const t = m[4] !== undefined ? m[4] : m[5];
      buf += t;
      if (boldDepth > 0) boldChars += decodeEntities(t).replace(/\s|[:：]/g, '').length;
      continue;
    }
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    if (BOLD_TAGS.has(tag)) {
      boldDepth = Math.max(0, boldDepth + (closing ? -1 : 1));
      continue;
    }
    if (!BLOCK_TAGS.has(tag)) {
      buf += ' ';
      continue;
    }
    if (tag === 'br' && liDepth > 0) {
      buf += ' ';
      continue;
    }
    flush();
    if (/^h[1-6]$/.test(tag)) headingDepth = Math.max(0, headingDepth + (closing ? -1 : 1));
    else if (tag === 'li') liDepth = Math.max(0, liDepth + (closing ? -1 : 1));
  }
  flush();
  return blocks;
}

// ---------------------------------------------------------------------------
// Section classification
// ---------------------------------------------------------------------------

const RESP_HEADING_RE = /responsib|what you(?:'|’)?ll do|what you will do|you will|in this role|the role|day[- ]to[- ]day|what you(?:'|’)?ll be doing|your impact|key duties|duties|the job|what you(?:'|’)?ll work on|the opportunity|your mission/i;
const FIT_HEADING_RE = /good fit|qualifications|requirements|you have|you may be|about you|strong candidates|we(?:'|’)?re looking|we are looking|ideal candidate|preferred|bonus|nice to have|what we look for|minimum|basic|thrive|you(?:'|’)?ll need|you will need|you(?:'|’)?ll bring|you will bring|you will have|must have|who you are|skills|experience|what you bring|you might/i;
const FIT_STRONG_RE = /good fit|qualifications|requirements|you(?:'|’)?ll need|you will (?:need|bring|have)|you(?:'|’)?ll bring|must have|strong candidates|ideal candidate|thrive|nice to have|bonus/i;

/** Classify a heading text: "responsibilities" | "fit" | null. */
export function classifyHeading(text) {
  const t = String(text || '');
  const r = RESP_HEADING_RE.exec(t);
  const f = FIT_HEADING_RE.exec(t);
  if (r && f) {
    if (FIT_STRONG_RE.test(t)) return 'fit';
    return r.index <= f.index ? 'responsibilities' : 'fit';
  }
  if (r) return 'responsibilities';
  if (f) return 'fit';
  return null;
}

function isHeadingBlock(b) {
  if (b.type === 'h') return b.text.length <= 140;
  if (b.type !== 'p') return false;
  if (b.text.length > 110) return false;
  if (b.bold) return true;
  if (/[:：]\s*$/.test(b.text)) return true;
  // ALL-CAPS short line: "WHAT YOU'LL DO"
  if (b.text.length <= 60 && /[A-Z]/.test(b.text) && b.text === b.text.toUpperCase()) return true;
  return false;
}

const BULLET_P_RE = /^[•·▪●◦‣∙*\-–—]\s+/;

function dedupeList(list) {
  const seen = new Set();
  const out = [];
  for (const x of list) {
    const k = x.toLowerCase();
    if (!x || seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

function sentences(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z“"])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Parse job description HTML into bullet lists grouped under headings.
 * Returns { responsibilities: string[], fit: string[] }.
 */
export function extractSections(html) {
  const out = { responsibilities: [], fit: [] };
  if (!html) return out;
  const blocks = htmlToBlocks(html);
  let current = null;
  for (const b of blocks) {
    const bulletPara = b.type === 'p' && BULLET_P_RE.test(b.text);
    if (!bulletPara && isHeadingBlock(b)) {
      current = classifyHeading(b.text);
      continue;
    }
    if (b.type === 'li' || bulletPara) {
      if (current) {
        const t = cleanBullet(b.text);
        if (t.length >= 3) out[current].push(t);
      }
    }
  }
  out.responsibilities = dedupeList(out.responsibilities);
  out.fit = dedupeList(out.fit);

  if (!out.responsibilities.length && !out.fit.length) {
    // Fallback: prose descriptions — sentences starting "You will"/"You'll".
    const text = htmlToText(html);
    for (const s of sentences(text)) {
      if (/^you(?:'|’)?ll\b|^you will\b/i.test(s) && !/^you will (?:need|have)\b/i.test(s)) {
        out.responsibilities.push(cleanBullet(s));
      } else if (/^(?:you have|you are|you bring|you(?:'|’)?re|you will (?:need|have))\b/i.test(s)) {
        out.fit.push(cleanBullet(s));
      }
    }
    out.responsibilities = dedupeList(out.responsibilities);
    out.fit = dedupeList(out.fit);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Lexicons
// Each entry: [label, ...patterns]. A string pattern is matched
// case-insensitively with alphanumeric boundaries; a RegExp is used as-is
// (so case-sensitive matches like /\bGTM\b/ stay case-sensitive).
// ---------------------------------------------------------------------------

const B = (src, flags = 'i') => new RegExp(`(?<![A-Za-z0-9])(?:${src})(?![A-Za-z0-9])`, flags);

const LANGS_FOR_GO = 'Python|Rust|Java|C\\+\\+|C#|TypeScript|JavaScript|Scala|Kotlin|Ruby|Node(?:\\.js)?|Elixir|Haskell|Swift|C';
const GO_PATTERNS = [
  /\bGolang\b/i,
  new RegExp(`(?:${LANGS_FOR_GO})(?:\\s*,\\s*(?:and\\s+|or\\s+)?|\\s*\\/\\s*|\\s+(?:and|or)\\s+)Go\\b(?![-'’])`),
  new RegExp(`(?<![\\w-])Go(?:\\s*,\\s*(?:and\\s+|or\\s+)?|\\s*\\/\\s*|\\s+(?:and|or)\\s+)(?:${LANGS_FOR_GO})\\b`),
  /\b(?:in|using|with|like|e\.g\.,?|including|written in|experience in)\s+Go\b(?![-'’])/,
  /\bGo\s+(?:programming|language|services|microservices|backend|codebase)\b/,
];

export const SKILL_LEXICON = [
  // Languages
  ['Python', 'python'],
  ['Rust', /\bRust\b/],
  ['Go', ...GO_PATTERNS],
  ['TypeScript', 'typescript'],
  ['JavaScript', 'javascript', /\bJS\b/],
  ['Java', /\bJava\b/],
  ['C++', /(?<![\w+])C\+\+(?![\w+])/, /\bCpp\b/],
  ['C#', /(?<![\w#])C#(?![\w#])/],
  ['Scala', 'scala'],
  ['Kotlin', 'kotlin'],
  ['Swift', /\bSwift(?:UI)?\b/],
  ['Objective-C', 'objective-c'],
  ['Ruby', /\bRuby\b/],
  ['PHP', /\bPHP\b/],
  ['Elixir', /\bElixir\b/],
  ['Haskell', 'haskell'],
  ['OCaml', 'ocaml'],
  ['MATLAB', 'matlab', /\bSimulink\b/],
  ['Bash', 'bash', 'shell scripting'],
  ['SQL', 'sql'],
  ['GraphQL', 'graphql'],
  ['Verilog', 'verilog', 'systemverilog'],
  ['VHDL', 'vhdl'],
  // Web / app frameworks
  ['React', /\bReact(?:\.js|JS)?\b/, 'react native'],
  ['Node.js', /\bNode(?:\.js|JS)\b/i],
  ['Next.js', /\bNext\.js\b/i],
  ['Vue', /\bVue(?:\.js)?\b/],
  ['Angular', /\bAngular\b/],
  ['Django', /\bDjango\b/i],
  ['Flask', /\bFlask\b/],
  ['FastAPI', 'fastapi'],
  ['Rails', /\bRails\b/, 'ruby on rails'],
  ['Spring', /\bSpring Boot\b/i],
  ['gRPC', 'grpc', 'protobuf', 'protocol buffers'],
  ['REST APIs', 'rest(?:ful)? apis?'],
  ['iOS', /\biOS\b/],
  ['Android', /\bAndroid\b/],
  // ML / AI
  ['PyTorch', 'pytorch', 'torch'],
  ['JAX', /\bJAX\b/],
  ['TensorFlow', 'tensorflow'],
  ['CUDA', 'cuda'],
  ['Triton', /\bTriton\b/],
  ['NumPy', 'numpy'],
  ['pandas', /\bpandas\b/i],
  ['scikit-learn', 'scikit-learn', 'sklearn'],
  ['Hugging Face', 'hugging ?face'],
  ['Machine learning', 'machine learning', /\bML\b/],
  ['Deep learning', 'deep learning', 'neural networks?'],
  ['LLMs', 'llms?', 'large language models?', 'language models?', 'foundation models?', 'frontier models?'],
  ['Transformers', 'transformers?(?: models?| architectures?)?'],
  ['RL', 'reinforcement learning', /\bRL\b/],
  ['RLHF', 'rlhf', 'rlaif', 'reinforcement learning from human feedback'],
  ['NLP', 'nlp', 'natural language processing'],
  ['Computer vision', 'computer vision', /\bCV\b(?= (?:models|systems|pipelines|research))/],
  ['Distributed training', 'distributed training', 'model parallel(?:ism)?', 'data parallel(?:ism)?', 'pipeline parallel(?:ism)?', 'fsdp'],
  ['Pretraining', 'pre-?training'],
  ['Fine-tuning', 'fine-?tun(?:e|es|ed|ing)', 'post-?training'],
  ['Inference', 'inference', 'model serving'],
  ['Evals', 'evals?', 'model evaluations?', 'benchmarks?'],
  ['Interpretability', 'interpretability', 'mechanistic'],
  ['Alignment', 'alignment research', 'ai alignment', 'alignment'],
  ['Multimodal', 'multi-?modal', 'vision-language'],
  ['Speech / audio', 'speech recognition', 'text-to-speech', 'speech', 'audio models?'],
  ['Recommender systems', 'recommend(?:er|ation) systems?', 'ranking systems?'],
  ['Information retrieval', 'information retrieval', 'search ranking', 'retrieval', 'rag', 'retrieval-augmented'],
  ['Agents', 'ai agents?', 'agentic', 'agents', 'tool use'],
  ['Prompt engineering', 'prompt(?:ing| engineering)'],
  ['MLOps', 'mlops', 'ml ops', 'ml infrastructure'],
  ['GPUs', 'gpus?', 'accelerators?'],
  ['TPUs', 'tpus?', 'trainium'],
  ['Kernels', 'gpu kernels?', 'cuda kernels?', 'kernel (?:development|optimization|engineering)'],
  ['Compilers', 'compilers?', 'mlir', 'llvm', 'xla'],
  ['Performance tuning', 'performance (?:optimization|engineering|tuning)', 'profiling'],
  ['Statistics', 'statistics', 'statistical', 'causal inference', 'econometrics'],
  ['A/B testing', 'a/b test(?:s|ing)?', 'experimentation'],
  // Infrastructure / data
  ['Kubernetes', 'kubernetes', 'k8s'],
  ['Docker', 'docker', 'containers?', 'containeriz\\w*'],
  ['Terraform', 'terraform', 'infrastructure as code', 'pulumi'],
  ['AWS', /\bAWS\b/, 'amazon web services'],
  ['GCP', /\bGCP\b/, 'google cloud'],
  ['Azure', 'azure'],
  ['Spark', /\bSpark\b/, /\bPySpark\b/i],
  ['Kafka', 'kafka'],
  ['Airflow', 'airflow'],
  ['dbt', /\bdbt\b/],
  ['Snowflake', /\bSnowflake\b/],
  ['BigQuery', 'bigquery'],
  ['Databricks', 'databricks'],
  ['Postgres', 'postgres(?:ql)?'],
  ['MySQL', 'mysql'],
  ['Redis', 'redis'],
  ['Elasticsearch', 'elasticsearch', 'opensearch'],
  ['Linux', 'linux', 'unix'],
  ['Networking', 'networking', 'tcp/ip', 'bgp', 'network (?:engineering|protocols)'],
  ['Distributed systems', 'distributed systems?'],
  ['Microservices', 'microservices?', 'service-oriented'],
  ['CI/CD', 'ci/cd', 'continuous (?:integration|delivery|deployment)', 'github actions', 'jenkins'],
  ['Observability', 'observability', 'monitoring', 'prometheus', 'grafana', 'datadog', 'opentelemetry'],
  ['SRE', 'site reliability', /\bSRE\b/],
  ['Storage systems', 'storage systems?', 'distributed storage', 'object storage', 'file systems?'],
  ['Datacenters', 'data ?cent(?:er|re)s?'],
  ['HPC', /\bHPC\b/, 'high[- ]performance computing', 'supercomput\\w*', 'slurm'],
  ['Data pipelines', 'data pipelines?', /\bETL\b/, 'data engineering'],
  ['Cloud infrastructure', 'cloud infrastructure', 'cloud platforms?', 'cloud computing'],
  // Security
  ['Security', 'security(?! clearance)', 'cyber ?security', 'infosec'],
  ['Cryptography', 'cryptograph\\w*', 'encryption', /\bPKI\b/],
  ['Pen testing', 'penetration test(?:s|ing)?', 'pen-?test(?:s|ing)?', 'red team(?:ing|s)?', 'offensive security'],
  ['Threat modeling', 'threat model(?:s|ing|ling)?'],
  ['Incident response', 'incident response', 'forensics'],
  ['Detection engineering', 'detection engineering', /\bSIEM\b/, 'threat detection'],
  ['IAM', /\bIAM\b/, 'identity and access management', 'access control'],
  ['AppSec', 'application security', 'appsec', 'secure code review'],
  ['Vulnerability research', 'vulnerability research', 'exploit development', 'fuzzing', 'reverse engineering'],
  // Hardware / defense
  ['Embedded', 'embedded'],
  ['Firmware', 'firmware'],
  ['RTOS', /\bRTOS\b/, 'real-time operating systems?', 'freertos', 'zephyr'],
  ['FPGA', 'fpgas?'],
  ['RF', /\bRF\b/, 'radio[- ]frequency', 'antennas?'],
  ['Signal processing', 'signal processing', /\bDSP\b/],
  ['Radar', 'radar'],
  ['Electronic warfare', 'electronic warfare', /\bEW\b/],
  ['PCB design', /\bPCBA?s?\b/, 'schematic capture', 'altium', 'board design'],
  ['Analog design', 'analog (?:circuit|design)', 'mixed-signal'],
  ['Power electronics', 'power electronics', 'power systems', 'batter(?:y|ies)'],
  ['Robotics', 'robotics?', 'robots?'],
  ['Controls', 'control systems?', 'controls engineering', 'controls', 'feedback control'],
  ['ROS', /\bROS ?2?\b/],
  ['Autonomy', 'autonomy', 'autonomous systems?', 'autonomous vehicles?'],
  ['GNC', /\bGNC\b/, 'guidance,? navigation,? (?:and|&) control'],
  ['Sensor fusion', 'sensor fusion', 'kalman filter\\w*', 'state estimation'],
  ['SLAM', /\bSLAM\b/],
  ['Avionics', 'avionics'],
  ['Propulsion', 'propulsion', 'rocket engines?'],
  ['Aerodynamics', 'aerodynamic\\w*', /\bCFD\b/, 'computational fluid dynamics'],
  ['Mechanical design', 'mechanical design', 'mechanical engineering', 'mechanisms'],
  ['CAD', /\bCAD\b/],
  ['SolidWorks', 'solidworks'],
  ['Siemens NX', /\bSiemens NX\b/i, /\bNX\b/],
  ['GD&T', /\bGD&T\b/i, 'geometric dimensioning'],
  ['FEA', /\bFEA\b/, 'finite element'],
  ['Composites', 'composites?'],
  ['Machining', 'machining', /\bCNC\b/, 'injection molding'],
  ['DFM', /\bDF[MA]\b/, 'design for manufactur\\w*'],
  ['Lean / Six Sigma', 'lean manufacturing', 'six sigma', 'kaizen'],
  ['Systems engineering', 'systems engineering', 'model-based systems', /\bMBSE\b/],
  ['Test automation', 'test automation', 'hardware-in-the-loop', /\bHIL\b/],
  ['Simulation', 'simulations?', 'digital twins?'],
  // Business
  ['Salesforce', 'salesforce', /\bSFDC\b/],
  ['HubSpot', 'hubspot'],
  ['Excel', /\bExcel\b/, 'spreadsheets?'],
  ['Tableau', 'tableau'],
  ['Looker', /\bLooker\b/],
  ['Financial modeling', 'financial model(?:s|ing|ling)?', /\bDCF\b/],
  ['FP&A', /\bFP&A\b/i, 'financial planning'],
  ['Accounting', 'accounting', /\bGAAP\b/, 'revenue recognition'],
  ['GTM', /\bGTM\b/, 'go[- ]to[- ]market'],
  ['Enterprise sales', 'enterprise sales', 'enterprise (?:accounts|customers|deals|software sales)', 'b2b sales', 'complex sales'],
  ['Contract negotiation', 'negotiat\\w*', 'contract (?:review|drafting|management)'],
  ['Gov contracting', 'government contract\\w*', /\bDFARS\b/, /\bFAR\b/, 'federal acquisition', 'proposal writing'],
  ['Recruiting', 'recruiting', 'talent acquisition', 'sourcing candidates'],
  ['Product management', 'product management', 'product requirements', /\bPRDs?\b/],
  ['Program management', 'program management', /\bPMP\b/, 'project management'],
  ['Marketing', 'marketing', 'demand generation', 'campaigns?'],
  ['SEO', /\bSEO\b/],
  ['Public policy', 'public policy', 'policy analysis', 'legislat\\w*'],
  ['Analytics', 'analytics', 'data analysis', 'business intelligence'],
  // Design
  ['Figma', 'figma'],
  ['UX research', 'ux research', 'user research', 'usability (?:testing|studies)'],
  ['Prototyping', 'prototyp\\w*'],
  ['Design systems', 'design systems?'],
  ['Interaction design', 'interaction design', 'ux design', 'user experience design'],
  ['Visual design', 'visual design', 'typography', 'brand design'],
];

export const RESPONSIBILITY_LEXICON = [
  ['Model training', 'train(?:ing)? (?:large |frontier |new |our )?(?:language |ml |machine learning )?models?', 'pre-?training', 'post-?training', 'fine-?tun\\w*', 'training runs?'],
  ['Research', 'research(?:ing)?', 'novel (?:methods|approaches|techniques)', 'run experiments', 'experiments?', 'publish\\w*'],
  ['Interpretability', 'interpretability', 'mechanistic', 'understand(?:ing)? (?:how )?models? (?:work|internals)'],
  ['Infrastructure', 'infrastructure', 'platforms?', 'clusters?', 'compute'],
  ['Inference / serving', 'inference', 'serving', 'deploy(?:ing)? models', 'model deployment'],
  ['Performance optimization', 'optimi[sz]\\w*', 'latency', 'throughput', 'efficien\\w*', 'profil\\w*'],
  ['Scaling systems', 'scal(?:e|es|ing|able|ability)', 'high[- ]throughput', 'large[- ]scale'],
  ['Architecture', 'architect\\w*', 'system design', 'design and (?:build|implement)'],
  ['Data pipelines', 'data pipelines?', /\bETL\b/, 'datasets?', 'data (?:collection|processing|infrastructure|quality|ingestion)'],
  ['Evaluation', 'evals?', 'evaluat\\w*', 'benchmark\\w*', 'measur(?:e|ing) (?:model )?(?:performance|capabilities)'],
  ['Safety', 'safety', 'alignment', 'misuse', 'harmful', 'responsible (?:ai|scaling)', 'trust (?:and|&) safety', 'safeguards'],
  ['Security', 'security(?! clearance)', 'secure', 'threats?', 'vulnerabilit\\w*', 'protect\\w*'],
  ['On-call / reliability', 'on-?call', 'reliab\\w*', 'uptime', 'incidents?', 'availability', /\bSRE\b/, 'outages?'],
  ['Tooling / dev experience', 'tooling', 'developer (?:experience|productivity|tools)', 'internal tools', 'ci/cd', 'build systems?'],
  ['Product development', 'build (?:new )?(?:products?|features?)', 'product development', 'ship(?:ping)? (?:new )?(?:features|products)', 'end-to-end', 'full[- ]stack', 'user-facing', 'product surfaces?'],
  ['Applied ML', 'appl(?:y|ied) (?:ml|machine learning|ai|models)', 'ml-powered', 'ai-powered'],
  ['Design', 'user experiences?', 'interfaces?', /\bUX\b/, /\bUI\b/, 'mockups', 'wireframes', 'prototyp\\w*', 'design (?:the )?(?:user|product|visual)'],
  ['Customer-facing', 'customers?', 'clients?', 'end users'],
  ['Customer support', 'customer success', 'onboard(?:ing)? (?:customers|users)', 'technical support', 'troubleshoot\\w*', 'support tickets'],
  ['Cross-functional', 'cross-?functional\\w*', 'partner (?:closely )?with', 'collaborat\\w* (?:closely )?with', 'work closely with', 'across teams'],
  ['Technical leadership', 'technical (?:leadership|direction|vision|lead)', 'tech lead', 'set (?:the )?technical', 'own (?:the )?(?:architecture|technical)'],
  ['Mentoring', 'mentor\\w*', 'coach\\w*', 'grow (?:the )?(?:team|engineers)'],
  ['People management', 'manag(?:e|ing) (?:a |the )?team', 'direct reports', 'people manag\\w*', 'lead (?:a|the) team of', 'performance reviews', 'career development'],
  ['Hiring', 'hir(?:e|ing)', 'recruit\\w*', 'interview\\w*', 'build (?:out )?(?:the|a) team'],
  ['Strategy', 'strateg\\w*', 'roadmaps?', 'vision', 'prioritiz\\w*'],
  ['Program management', 'program manag\\w*', 'coordinat\\w*', 'timelines?', 'milestones?', 'schedules?', 'track progress'],
  ['Operations', 'operations', 'operational', 'processes', 'workflows?', 'logistics'],
  ['Process improvement', 'process improvement', 'continuous improvement', 'streamlin\\w*', 'automat(?:e|ing) (?:manual )?(?:processes|workflows)'],
  ['Policy', 'polic(?:y|ies)', 'regulat\\w*', 'government', 'legislat\\w*', 'lawmakers', 'policymakers'],
  ['Compliance', 'complian\\w*', 'audits?', 'certif\\w*', /\bITAR\b/, /\bSOC ?2\b/, 'fedramp', /\bCMMC\b/],
  ['Legal', 'legal', 'contracts?', 'counsel', 'litigation', 'intellectual property'],
  ['Finance', 'financ\\w*', 'budgets?', 'forecast\\w*', 'accounting', /\bP&L\b/],
  ['Go-to-market', 'go[- ]to[- ]market', /\bGTM\b/, 'pipeline generation', 'sales cycles?', 'quota', 'close (?:deals|new business)', 'revenue', 'sales'],
  ['Partnerships', 'partnerships?', 'alliances', 'ecosystem', 'channel partners'],
  ['Business development', 'business development', 'capture', 'new business', 'proposals?', /\bRFPs?\b/],
  ['Marketing', 'marketing', 'campaigns?', 'brand', 'demand gen\\w*', 'messaging', 'launch(?:es)?'],
  ['Communications', 'communicat\\w*', 'stakeholders?', 'present(?:ing|ations?)', 'executive (?:updates|briefings)'],
  ['Writing / docs', 'writ(?:e|ing)', 'documentation', 'document\\w*', 'technical (?:specs?|reports?)', 'whitepapers?', 'blog posts?'],
  ['Analytics', 'analy[sz]\\w*', 'metrics', 'dashboards?', 'insights', 'sql'],
  ['Enablement / training', 'enablement', 'workshops?', 'educat\\w*', 'train (?:users|customers|teams|operators)'],
  ['Hardware integration', 'hardware', 'bring-?up', 'subsystems?', 'sensors?', 'payloads?', 'integrat\\w* (?:with )?(?:hardware|sensors|systems|vehicles)'],
  ['Systems engineering', 'systems engineering', 'requirements (?:definition|management|traceability|flow-?down)', 'interface control'],
  ['Simulation', 'simulat\\w*', 'digital twins?', 'modeling and simulation'],
  ['Autonomy', 'autonom\\w*'],
  ['Field testing', 'field (?:test\\w*|operations|deploy\\w*|work)', 'flight test\\w*', 'test ranges?', 'in the field', 'test events?'],
  ['Manufacturing', 'manufactur\\w*', 'production lines?', 'assembly', 'factory', 'factories', 'production (?:ramp|scale|floor)'],
  ['Supply chain', 'supply chain', 'suppliers?', 'vendors?', 'procure\\w*', 'sourcing'],
  ['Mission / defense', 'mission', 'warfighters?', 'defen[cs]e', 'military', /\bDoD\b/, 'national security', 'armed forces'],
];

export const FIT_LEXICON = [
  // Years-of-experience buckets are computed separately and come first.
  ['PhD', /\bPh\.?\s?D\.?(?![a-z])/i, 'doctorate', 'doctoral'],
  ["Master's", 'master(?:\'|’)?s', /\bM\.?S\.?(?= (?:degree|in)\b)/, 'msc'],
  ['MBA', /\bMBA\b/],
  ["Bachelor's", 'bachelor(?:\'|’)?s', /\bB\.?[SA]\.?(?= (?:degree|in)\b)/, 'bsc', 'undergraduate degree', 'degree in'],
  ['Degree or equivalent', 'equivalent (?:practical |professional )?experience', 'or equivalent', 'no degree required'],
  ['Publications', 'publications?', 'published', 'first-author', 'neurips', 'icml', 'iclr', 'peer-reviewed'],
  ['Research experience', 'research experience', 'research background', 'conducting research', 'research (?:engineering|scientist) experience'],
  ['Production experience', 'production (?:systems|environments?|code|ml|services)', 'shipped', 'deployed (?:to|in) production'],
  ['Large-scale systems', 'large-?scale', 'at scale', 'distributed systems', 'high-?scale'],
  ['Technical depth', 'deep (?:technical|expertise|understanding|knowledge)', 'strong (?:technical|engineering|programming|coding|software engineering) (?:background|skills|foundation)', 'expert(?:ise)? in', 'proficien\\w*'],
  ['Hands-on', 'hands-?on', 'build things', 'tinker\\w*'],
  ['Startup experience', 'start-?ups?', 'early-stage', '0 to 1', 'zero to one', 'zero-to-one', '0-1', 'founding'],
  ['Leadership', 'leadership', 'led (?:teams|projects|initiatives|efforts)', 'leading (?:teams|projects|cross-functional|initiatives)', 'track record of leading'],
  ['Management experience', 'management experience', 'managed (?:a )?teams?', 'people manag\\w*', 'managing (?:engineers|teams|people)', 'direct reports'],
  ['Strong communication', 'communicat\\w*', 'written and verbal', 'verbal and written', 'articulate', 'explain complex'],
  ['Collaboration', 'collaborat\\w*', 'team player', 'low ego', 'work well with'],
  ['Ambiguity', 'ambigu\\w*', 'unstructured', 'undefined problems', 'uncertainty', 'open-ended'],
  ['Fast-paced', 'fast-?paced', 'move quickly', 'rapid(?:ly)? (?:changing|evolving|iterat\\w*)', 'high-velocity', 'quick(?:ly)? iterat\\w*'],
  ['Self-directed', 'self-?(?:directed|starter|motivated)', 'independently', 'ownership', 'take initiative', 'proactive'],
  ['Learning mindset', 'learn quickly', 'eager to learn', 'curiosity', 'curious', 'growth mindset', 'pick up new'],
  ['Pragmatic', 'pragmatic', 'bias (?:for|toward|towards) action', 'get things done', 'results-oriented', 'scrappy'],
  ['Detail-oriented', 'detail-?oriented', 'attention to detail', 'meticulous', 'rigor(?:ous)?'],
  ['Analytical', 'analytical', 'data-driven', 'quantitative', 'problem[- ]solv\\w*'],
  ['Customer empathy', 'customer (?:empathy|obsess\\w*|focus\\w*)', 'empath\\w*', 'user needs', 'customer-centric'],
  ['Open source', 'open[- ]source'],
  ['Mission-driven', 'mission', 'passion(?:ate)? (?:about|for)', 'care (?:deeply )?about (?:the )?(?:impact|mission)'],
  ['AI safety interest', 'ai safety', 'safe and beneficial', 'beneficial ai', 'alignment', 'responsible ai', 'societal impacts?'],
  ['Defense / aerospace', 'defen[cs]e (?:industry|sector|tech\\w*|programs?)', /\bDoD\b/, 'aerospace', 'military', 'government (?:customers|programs)'],
];

// Fit facets that are worth scanning in the whole description (often stated
// outside the bullet lists, e.g. legal boilerplate).
export const FIT_GLOBAL_LEXICON = [
  ['Security clearance', 'security clearance', 'secret clearance', 'ts/sci', 'top secret', 'clearances?', 'clearable'],
  ['US citizenship', 'u\\.?s\\.? (?:citizen(?:ship)?s?|persons?)', 'citizenship', /\bITAR\b/],
  ['Travel', 'travel\\w*'],
  ['Visa sponsorship', 'visa sponsorship', 'sponsor (?:visas|work authorization)', 'we do sponsor visas'],
];

function compileLexicon(lex) {
  return lex.map(([label, ...pats]) => ({
    label,
    res: pats.map((p) => (p instanceof RegExp ? p : B(p))),
  }));
}

const SKILLS = compileLexicon(SKILL_LEXICON);
const RESP = compileLexicon(RESPONSIBILITY_LEXICON);
const FIT = compileLexicon(FIT_LEXICON);
const FIT_GLOBAL = compileLexicon(FIT_GLOBAL_LEXICON);

function matchLexicon(compiled, hay) {
  const out = [];
  if (!hay) return out;
  for (const { label, res } of compiled) {
    if (res.some((re) => re.test(hay))) out.push(label);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Years of experience
// ---------------------------------------------------------------------------

const WORD_NUMS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20,
};
const NUM = `(\\d{1,2}|${Object.keys(WORD_NUMS).join('|')})`;
const YEARS_RE = new RegExp(
  `\\b${NUM}(?:\\s*(?:\\+|plus)|-plus)?(?:\\s*(?:-|–|—|to)\\s*\\d{1,2})?\\s*\\+?\\s*(?:or more\\s+)?(?:full[- ]time\\s+)?years?(?:['’])?(?!\\s+(?:old|ago))`,
  'gi',
);

/** Minimum years of experience mentioned (largest stated minimum), or null. */
export function yearsOfExperience(text) {
  if (!text) return null;
  let best = null;
  for (const m of String(text).matchAll(YEARS_RE)) {
    const raw = m[1].toLowerCase();
    const n = WORD_NUMS[raw] ?? parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1 || n > 30) continue;
    best = best == null ? n : Math.max(best, n);
  }
  if (best == null && /\ba decade\b/i.test(text)) best = 10;
  return best;
}

export function yearsBucket(n) {
  if (n == null) return null;
  if (n >= 10) return '10+ yrs';
  if (n >= 8) return '8+ yrs';
  if (n >= 5) return '5+ yrs';
  if (n >= 3) return '3+ yrs';
  if (n >= 1) return '1+ yrs';
  return null;
}

// ---------------------------------------------------------------------------
// extractKeywords
// ---------------------------------------------------------------------------

/**
 * Keyword facets for a job: { responsibilities, fit, skills } (display labels,
 * deduped, in lexicon order).
 */
export function extractKeywords({ title = '', department = '', sections = null, text = '' } = {}) {
  const resp = (sections && sections.responsibilities) || [];
  const fit = (sections && sections.fit) || [];
  const body = String(text || '');
  const all = [title, ...resp, ...fit, body].filter(Boolean).join('\n');

  const skills = matchLexicon(SKILLS, all);

  const respHay = [title, ...(resp.length ? resp : [body, department])].filter(Boolean).join('\n');
  const responsibilities = matchLexicon(RESP, respHay);

  const fitHay = (fit.length ? fit : [body]).join('\n');
  const fitOut = [];
  const bucket = yearsBucket(yearsOfExperience(fitHay));
  if (bucket) fitOut.push(bucket);
  fitOut.push(...matchLexicon(FIT, fitHay));
  fitOut.push(...matchLexicon(FIT_GLOBAL, [fitHay, all].join('\n')));

  return {
    responsibilities: [...new Set(responsibilities)],
    fit: [...new Set(fitOut)],
    skills: [...new Set(skills)],
  };
}

// ---------------------------------------------------------------------------
// Seniority
// ---------------------------------------------------------------------------

const NON_PEOPLE_MANAGER = /\b(?:product|program|project|account|accounts|partner|partnerships?|success|relationship|community|case|territory|channel|marketing|campaign|solutions|deal|operations|events?|office|facilities|supply|procurement|contracts?|portfolio|category|release|brand|content|sales|business|capture|test|configuration|quality|logistics|risk|vendor|asset|property|benefits|payroll|lifecycle|growth)\s+(?:\w+\s+)?manager\b/i;

/**
 * Seniority bucket from a job title:
 * "Intern"|"Entry"|"Mid"|"Senior"|"Staff+"|"Manager"|"Director+".
 */
// "Member of Technical Staff" / "MTS" is the AI labs' generic IC title
// (Cohere, xAI, OpenAI, Salesforce...), not a Staff-level marker. Ladder
// abbreviations keep their level: SMTS = Senior, LMTS/PMTS = Staff+.
const MTS_ABBREV = [
  [/\bSMTS\b/gi, ' Senior '],
  [/\bLMTS\b/gi, ' Staff '],
  [/\bPMTS\b/gi, ' Principal '],
];
const MTS_PHRASE_RE = /\b(?:(?:a\s+)?members?\s+of\s+(?:the\s+)?technical\s+staff|technical\s+staff(?:\s+members?)?|members?\s+of\s+(?:the\s+)?staff|MTS)\b/gi;

function stripGenericStaff(title) {
  let t = title;
  for (const [re, rep] of MTS_ABBREV) t = t.replace(re, rep);
  return t.replace(MTS_PHRASE_RE, ' ').replace(/\s+/g, ' ').trim();
}

export function inferSeniority(title) {
  const t = stripGenericStaff(String(title || ''));
  if (!t.trim()) return 'Mid';
  if (/\b(?:director|vp|svp|evp|vice[- ]president|head of|chief|cto|cfo|ceo|coo|ciso|cmo|cpo|president|general manager|partner,)\b/i.test(t)
    || /^head\b/i.test(t)) return 'Director+';
  if (/\b(?:intern(?:ship)?s?|fellowships?|fellows program|co-?op|apprentice(?:ship)?|summer (?:analyst|associate|student)|residency|resident)\b/i.test(t)
    ) return 'Intern';
  if (/\b(?:staff|principal|distinguished|fellow)\b/i.test(t)) return 'Staff+';
  const isManager = /\bmanager\b/i.test(t) && !NON_PEOPLE_MANAGER.test(t);
  if (isManager || /\b(?:team lead|people lead|supervisor|engineering lead|lead,? (?:people|team))\b/i.test(t)
    || /\bmanager,\s/i.test(t) && !NON_PEOPLE_MANAGER.test(t)) return 'Manager';
  if (/\b(?:senior|sr\.?|lead|iii)\b/i.test(t) || /\bIII\b/.test(t)) return 'Senior';
  if (/\b(?:junior|jr\.?|associate|new grad(?:uate)?|graduate|entry[- ]level|early career)\b/i.test(t)
    || /\s(?:I|1)(?=\s*(?:[,()\-–—]|$))/.test(t)) return 'Entry';
  return 'Mid';
}

// ---------------------------------------------------------------------------
// Compensation extras (F2): does the posting say the offer includes equity
// and/or a bonus / commission? Evaluated against hand-labelled real postings
// in test/fixtures/extras-labels.json (see docs/process/features.md).
// ---------------------------------------------------------------------------

// "equity" senses that are not employee equity: DEI, finance subject matter,
// donation programmes. Removed before matching.
const EQUITY_NOISE_RE = new RegExp([
  String.raw`\b(?:pay|health|healthcare|racial|gender|social|educational|digital|internal|external|compensation|salary|wage|income|housing|economic|brand|home|private|growth|public|sweat|negative|positive|shareholders?['’]?|stockholders?['’]?)\s+equity\b`,
  String.raw`\bdiversity,?\s+(?:and\s+)?equity\b`,
  String.raw`\bequity,?\s+(?:and|&)\s+(?:inclusion|belonging|diversity|access|justice)\b`,
  String.raw`\bequity,\s*(?:inclusion|belonging)\b`,
  String.raw`\bDE&?I&?B?\b`,
  String.raw`\bequity[- ](?:research|markets?|investments?|investing|investors?|financing|capital|analysts?|analysis|deals?|transactions?|method|accounting|roll-?forwards?|administration|team|donations?|minded|lens)\b`,
  String.raw`\b(?:optional\s+)?equity donation(?: matching)?\b`,
  String.raw`\bequitabl[ey]\b`,
].join('|'), 'gi');

// Nice-to-have senses of "bonus": "It's a bonus if you have", "Bonus:", "Bonus points".
const BONUS_NOISE_RE = /\[bonus\]|\bbonus\s*points?\b|\b(?:it(?:['’]s| is)|is|as|would be|a (?:big|huge|real))\s+an?\s+(?:big\s+|huge\s+|nice\s+|major\s+|real\s+)?bonus\b|\bas a bonus\b|\bbonus\s+(?:if|for|to have)\b|\bbonus\s*[:–—-]\s*(?=\S)|^\s*bonus\b(?!\s*(?:\+|,|and|eligib|plan|program|potential|structure|target))/gim;

// The sentence is about doing compensation work, not about this offer.
const COMP_DUTY_RE = /\b(?:payroll|accounting|accruals?|ASC\s?\d{3}|GAAP|SOX|audits?|tax(?:es)?|administ\w*|roll-?forwards?|footnotes?|reconcil\w*|benchmark\w*|governance|oversee|design(?:ing)?,? (?:and|&) (?:oversee|manage|run)|compensation (?:programs?|programmes?|planning|methodolog\w*|strategy|philosophy|practices|professionals?|experience|expertise|principles|governance)|incentive (?:plan )?design|experience (?:with|in|designing|managing|building)|knowledge of|familiarity with|matters|counsel|securities|negotiat\w*|structures|cap tables?|tender offers?|process stock options|equity team|equity programmes)\b/i;

// The sentence denies or merely hedges ("This estimate excludes ... bonus").
const COMP_NEGATION_RE = /\bnot\s+(?:be\s+)?eligible\b|\bineligible\b|\b(?:are|is|will be)\s+not\s+(?:offered|included|provided)\b|\bdoes(?:n['’]t| not) (?:include|offer)\b|\bno (?:equity|bonus|commission)\b|\bexclud(?:es?|ing)\b/i;

// Conditional boilerplate: "For sales roles, the range ... OTE ... commissions".
const SALES_CONDITIONAL_RE = /\b(?:for|in|on)\s+(?:sales|commissioned|quota[- ]carrying|commission[- ]eligible)\s+roles\b/i;
const SALES_TITLE_RE = /\b(?:account executive|account director|account manager|ae\b|business development (?:rep\w*|manager|executive|director)|bdr|sdr|partner sales|sales(?!\s+(?:strategy|operations|ops|enablement|engineer\w*|compensation|analytics|systems|planning|finance|recruit\w*))\b|seller)/i;
const NON_FULLTIME_TITLE_RE = /\b(?:intern(?:ship)?s?|co-?op|part[- ]time|temporary|temp|seasonal|fellow(?:ship)?s?|contractor)\b/i;
const NON_FULLTIME_MENTION_RE = /\b(?:intern(?:ship)?s?|co-?ops?|part[- ]time|temporary|fellows?|contractors?)\b/i;

const COMP_CUE_RE = /\b(?:compensation|salary|salaries|base pay|pay\b|total rewards|offer package|package|benefits|401\s?\(?k\)?|remuneration|perks)\b/i;

const EQUITY_STRONG = [
  /\boffers?\s+equity\b/i,
  /\bRSUs?\b/,
  /\brestricted stock(?: units?)?\b/i,
  /\bstock[- ]options?\b/i,
  /\bstock (?:grants?|awards?|compensation|units?|purchase plan|plan)\b/i,
  /\bstock-based\b/i,
  /\bemployee stock\b/i,
  /\bESPP\b/,
  /\bequity(?:[- ]based)?\s+(?:grants?|awards?|packages?|compensation|participation|options?|refresh(?:ers?)?|stakes?|incentives?|upside)\b/i,
  /\b(?:meaningful|significant|generous|competitive|attractive)\s+(?:equity|ownership stake)\b/i,
  /\bownership stake\b/i,
  /\b(?:granted|receive|eligible for|includes?|including|plus|and|with)\s+(?:an?\s+)?(?:annual\s+|initial\s+)?equity\b/i,
  /\+\s*equity\b/i,
];

const BONUS_STRONG = [
  /\b(?:sign[- ]?on|signing|joining|hiring|annual|performance(?:[- ]based)?|year[- ]end|retention|relocation|quarterly|target|discretionary|cash|spot|completion|incentive|variable)\s+bonus(?:es)?\b/i,
  /\bbonus(?:es)?\s+(?:eligib\w*|plan|program(?:me)?s?|potential|opportunit\w*|structure|target|pool|payments?|scheme)\b/i,
  /\b(?:eligible for|eligibility for|qualify for)\s+(?:an?\s+|our\s+)?(?:annual\s+|discretionary\s+|performance\s+)?bonus/i,
  /\bbonus[- ]eligible\b/i,
  /\+\s*bonus\b/i,
  /\boffers?\s+(?:a\s+)?(?:bonus|commission)\b/i,
  /\bOTE\b/,
  /\bon[- ]target earnings\b/i,
  /\bcommission(?:s)?\s+(?:structure|plan|opportunit\w*|eligib\w*|scheme|rate|target)\b/i,
  /\bcommission-based\b/i,
  /\b(?:earn|uncapped|plus|and|with|sales)\s+commissions?\b/i,
  /\+\s*commissions?\b/i,
  /\beligible (?:for|to earn) (?:sales )?commissions?\b/i,
  /\b(?:incentive|variable) (?:compensation|pay|plan|comp)\b/i,
  /\bshort[- ]term incentives?\b/i,
  /\bprofit[- ]sharing\b/i,
];

function compSegments(text) {
  return String(text || '')
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z(“"])/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/**
 * Like extractCompExtras but also returns the sentences that decided each facet.
 * @returns {{equity:boolean, bonus:boolean, evidence:{equity:string[], bonus:string[]}}}
 */
export function compExtrasEvidence(text, { title = '' } = {}) {
  let src = String(text || '');
  if (/<(?:p|li|ul|div|br|h[1-6])\b/i.test(src)) src = htmlToText(src);
  const salesTitle = SALES_TITLE_RE.test(title);
  const nonFullTime = NON_FULLTIME_TITLE_RE.test(title);
  const evidence = { equity: [], bonus: [] };
  const vetoed = { equity: false, bonus: false };

  for (const seg of compSegments(src)) {
    const eqText = seg.replace(EQUITY_NOISE_RE, ' ');
    const bnText = seg.replace(BONUS_NOISE_RE, ' ');
    const hasEq = /\bequity\b|\bstock\b|\bRSUs?\b|\bESPP\b|\bownership stake\b/i.test(eqText);
    const hasBn = /\bbonus(?:es)?\b|\bcommissions?\b|\bOTE\b|on[- ]target|incentive|variable|profit[- ]sharing/i.test(bnText);
    if (!hasEq && !hasBn) continue;

    if (COMP_NEGATION_RE.test(seg)) {
      // "Interns/Part-time not eligible for bonus, benefits or equity" applies to this posting.
      if (nonFullTime && NON_FULLTIME_MENTION_RE.test(seg)) {
        if (hasEq) vetoed.equity = true;
        if (hasBn) vetoed.bonus = true;
      }
      continue;
    }
    if (COMP_DUTY_RE.test(seg)) continue;
    if (SALES_CONDITIONAL_RE.test(seg) && !salesTitle) continue;

    if (hasEq && (EQUITY_STRONG.some((re) => re.test(eqText)) || (/\bequity\b/i.test(eqText) && COMP_CUE_RE.test(eqText)))) {
      evidence.equity.push(seg);
    }
    if (hasBn && (BONUS_STRONG.some((re) => re.test(bnText)) || (/\bbonus(?:es)?\b/i.test(bnText) && COMP_CUE_RE.test(bnText)))) {
      evidence.bonus.push(seg);
    }
  }
  return {
    equity: evidence.equity.length > 0 && !vetoed.equity,
    bonus: evidence.bonus.length > 0 && !vetoed.bonus,
    evidence,
  };
}

/**
 * Compensation extras stated in a posting (F2).
 * equity: RSUs, stock options, equity grants, "Offers Equity", "+ Equity"...
 * bonus: signing/annual/performance bonus, commission, OTE, incentive comp...
 * Rejects DEI senses ("pay equity", "diversity, equity and inclusion"),
 * nice-to-have "bonus" ("It's a bonus if you have"), compensation *work*
 * (payroll, equity accounting), negations and hedges, and "For sales roles"
 * boilerplate unless `title` looks like a sales role.
 * @param {string} text  description text (HTML is accepted) plus any salary summary text
 * @param {{title?: string}} [opts]
 * @returns {{equity: boolean, bonus: boolean}}
 */
export function extractCompExtras(text, opts = {}) {
  const { equity, bonus } = compExtrasEvidence(text, opts);
  return { equity, bonus };
}
