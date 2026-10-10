// Job description parsing: bullet sections, keyword facets and seniority.
// No DOM library: a small regex tokenizer walks the HTML.
import { SALES_CONDITIONAL_RE } from './salary.js';

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

// Bounded memo: normalizeJobs tokenizes each description for boilerplate
// detection, sections and keyword text; blocks are read-only to callers.
const BLOCK_MEMO = new Map();
const BLOCK_MEMO_MAX = 3000;

/** Tokenize HTML into a flat list of text blocks: {type:'h'|'li'|'p', text, bold}. */
function htmlToBlocks(html) {
  const key = String(html || '');
  const hit = BLOCK_MEMO.get(key);
  if (hit) return hit;
  const blocks = tokenizeBlocks(key);
  if (BLOCK_MEMO.size >= BLOCK_MEMO_MAX) BLOCK_MEMO.delete(BLOCK_MEMO.keys().next().value);
  BLOCK_MEMO.set(key, blocks);
  return blocks;
}

function tokenizeBlocks(html) {
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
export function extractSections(html, { skip = null } = {}) {
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
    // Bullets under a responsibilities/fit heading are role content and are
    // never treated as boilerplate (the facet guard handles ubiquitous ones).
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
    const text = skip && skip.size ? descriptionText(html, { skip }) : htmlToText(html);
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
// Board boilerplate (BUG-5): paragraphs and list items repeated on most of a
// board's postings ("About <company>", scam notices, EEO and visa policy) are
// excluded from section and keyword extraction. descriptionHtml is untouched.
// ---------------------------------------------------------------------------

/** Normalized block text used for boilerplate matching. */
function boilerplateKey(text) {
  // Block text is already entity-decoded and whitespace-collapsed by htmlToBlocks.
  return String(text || '')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .replace(/[\s.,;:!]+$/, '')
    .trim();
}

// cyrb53: small, browser-safe 53-bit string hash (collisions ~1e-6 at 1e5 blocks).
function cyrb53(str) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

const blockHash = (text) => cyrb53(boilerplateKey(text));
const BOILERPLATE_MIN_CHARS = 20; // shorter blocks (headings, "Benefits") are never boilerplate

/**
 * Hashes of paragraphs / list items that appear on at least `minShare` of a
 * board's postings. Headings are never included (they structure sections).
 * Pure and browser-safe. Returns an empty set for boards with < minJobs postings.
 * @param {string[]} htmlList  one description HTML per posting
 * @returns {Set<string>}
 */
export function boilerplateParagraphs(htmlList, { minShare = 0.5, minJobs = 5 } = {}) {
  const list = (Array.isArray(htmlList) ? htmlList : []).filter((h) => typeof h === 'string' && h);
  const out = new Set();
  if (list.length < minJobs) return out;
  const counts = new Map();
  for (const html of list) {
    const seen = new Set();
    for (const b of htmlToBlocks(html)) {
      if (isHeadingBlock(b) && !(b.type === 'p' && BULLET_P_RE.test(b.text))) continue;
      const key = boilerplateKey(b.text);
      if (key.length < BOILERPLATE_MIN_CHARS) continue;
      seen.add(cyrb53(key));
    }
    for (const h of seen) counts.set(h, (counts.get(h) || 0) + 1);
  }
  const need = Math.max(2, Math.ceil(minShare * list.length));
  for (const [h, c] of counts) if (c >= need) out.add(h);
  return out;
}

/** Plain text of a description without the blocks in `skip` (boilerplate hashes). */
export function descriptionText(html, { skip = null } = {}) {
  if (!skip || !skip.size) return htmlToText(html);
  const out = [];
  let current = null;
  for (const b of htmlToBlocks(html)) {
    const bulletPara = b.type === 'p' && BULLET_P_RE.test(b.text);
    if (!bulletPara && isHeadingBlock(b)) {
      current = classifyHeading(b.text);
      out.push(b.text);
      continue;
    }
    const inSection = current && (b.type === 'li' || bulletPara);
    if (inSection || !skip.has(blockHash(b.text))) out.push(b.text);
  }
  return out.join('\n');
}

/**
 * Facet guard: drop keyword labels present on more than `maxShare` of a
 * board's jobs (only when the board has >= minJobs jobs); such a chip cannot
 * filter anything. Returns new job objects plus what was dropped.
 * @returns {{ jobs: object[], dropped: { responsibilities: {label,count}[], fit: {label,count}[], skills: {label,count}[] } }}
 */
export function dropUbiquitousKeywords(jobs, { maxShare = 0.9, minJobs = 20 } = {}) {
  const facets = ['responsibilities', 'fit', 'skills'];
  const dropped = { responsibilities: [], fit: [], skills: [] };
  const list = Array.isArray(jobs) ? jobs : [];
  if (list.length < minJobs) return { jobs: list, dropped };
  const kill = {};
  for (const f of facets) {
    const counts = new Map();
    for (const j of list) for (const l of new Set((j && j.keywords && j.keywords[f]) || [])) counts.set(l, (counts.get(l) || 0) + 1);
    kill[f] = new Set();
    for (const [label, count] of counts) {
      if (count / list.length > maxShare) { kill[f].add(label); dropped[f].push({ label, count }); }
    }
    dropped[f].sort((a, b) => b.count - a.count);
  }
  if (!facets.some((f) => kill[f].size)) return { jobs: list, dropped };
  const out = list.map((j) => {
    if (!j || !j.keywords) return j;
    const kw = { ...j.keywords };
    for (const f of facets) if (kill[f].size && Array.isArray(kw[f])) kw[f] = kw[f].filter((l) => !kill[f].has(l));
    return { ...j, keywords: kw };
  });
  return { jobs: out, dropped };
}

/**
 * Re-derive sections + keywords for already-normalized jobs of ONE board
 * (e.g. snapshot or cache data written by older code) with boilerplate removed
 * and the facet guard applied. descriptionHtml is not modified.
 */
export function rekeyBoardJobs(jobs, opts = {}) {
  const list = Array.isArray(jobs) ? jobs : [];
  const skip = boilerplateParagraphs(list.map((j) => (j && j.descriptionHtml) || ''), opts);
  const rekeyed = list.map((j) => {
    // sections never depend on the boilerplate set (in-section bullets are protected)
    if (!j || typeof j.descriptionHtml !== 'string' || !j.descriptionHtml) return j;
    const sections = extractSections(j.descriptionHtml);
    const keywords = extractKeywords({ title: j.title || '', department: j.department || '', sections, text: descriptionText(j.descriptionHtml, { skip }) });
    return { ...j, sections, keywords };
  });
  return dropUbiquitousKeywords(rekeyed, opts.guard || {});
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

// P-17 (persona review 2026-10-10): technical contexts for three words that are mostly
// ordinary English in postings ("embedded in the business", "high autonomy").
const EMBEDDED_NOUNS = 'systems?|software|firmware|linux|c\\+\\+|c|rust|development|developers?|engineer(?:s|ing)?|devices?|hardware|electronics|processors?|processing|platforms?|targets?|programming|rtos|controllers?|microcontrollers?|computing|compute|code|coder|applications?|security|gpus?|boards?|os|environments?|products?|domain|dsp|hw|sw|ml|ai|vision|real-time|protocols?|interfaces?|communications?|mission systems?|deployments?';
const AUTONOMY_AFTER = 'software|stacks?|systems?|engineer(?:s|ing)?|algorithms?|capabilit(?:y|ies)|behaviou?rs?|pipelines?|development|research|architectures?|applications?|products?|platforms?|frameworks?|integration|solutions?|features?|modules?|simulations?|testing|code|engines?|kits?|services|missions?|c2|middleware|teams?|programs?|computers?|researchers?';
const DISCIPLINES = 'aerospace|aeronautical|electrical|electronics|computer|software|systems|manufacturing|industrial|civil|chemical|materials|physics|robotics|mechatronics|controls?|mathematics|math|computer science|engineering physics|related|biomedical|nuclear|ocean|marine';
const AUTONOMY_BEFORE = 'mission|vehicle|robot(?:ic)?|robotics|drone|aircraft|air|airborne|maritime|undersea|subsea|ground|edge|flight|uas|uav|hivemind|lattice|multi-?agent|multi-?vehicle|collaborative|full[- ]stack|onboard|end-to-end|swarm|weapons?|multi-asset|multi-domain|unsupervised|layered';

export const SKILL_LEXICON = [
  // Languages
  ['Python', 'python'],
  ['Rust', /\bRust\b/],
  ['Go', ...GO_PATTERNS],
  ['TypeScript', 'typescript'], // P-17: kept; a nice-to-have mention sorts last (orderSkills)
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
  // P-17: "AI/ML" ("articulate AI/ML concepts", "AI/ML companies") names the industry, not the skill
  ['Machine learning', 'machine learning', /(?<!\bAI\s?\/\s?)\bML\b(?!\s?\/\s?AI\b)/],
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
  ['Inference', '(?<!causal |statistical |bayesian )inference', 'model serving'], // §6a A4
  ['Evals', 'evals?', 'model evaluations?', 'benchmarks?'],
  ['Interpretability', 'interpretability', 'mechanistic'],
  ['Alignment', 'alignment research', 'ai alignment', 'alignment science', 'superalignment'], // §6a A1: bare 'alignment' was business language
  ['Multimodal', 'multi-?modal', 'vision-language'],
  ['Speech / audio', 'speech recognition', 'text-to-speech', 'speech models?', 'audio models?'], // §6a A5: not 'free speech'
  ['Recommender systems', 'recommend(?:er|ation) systems?', 'ranking systems?'],
  ['Information retrieval', 'information retrieval', 'search ranking', 'retrieval', 'rag', 'retrieval-augmented'],
  ['Agents', 'ai agents?', 'agentic', 'agents', 'tool use'],
  ['Prompt engineering', 'prompt(?:ing| engineering)'],
  ['MLOps', 'mlops', 'ml ops', 'ml infrastructure'],
  // §6a A3: 'accelerators' only with hardware context (not startup/delivery accelerators)
  ['GPUs', 'gpus?', 'accelerator (?:chips?|families|hardware|clusters?)', /\baccelerators?\b(?=[\s\S]*\b(?:TPUs?|chips?)\b)/i, /\b(?:TPUs?|chips?)\b(?=[\s\S]*\baccelerators?\b)/i],
  ['TPUs', 'tpus?', 'trainium'],
  ['Kernels', 'gpu kernels?', 'cuda kernels?', 'kernel (?:development|optimization|engineering)'],
  ['Compilers', 'compilers?', 'mlir', 'llvm', 'xla'],
  ['Performance tuning', 'performance (?:optimization|engineering|tuning)', 'profiling'],
  ['Statistics', 'statistics', 'statistical', 'causal inference', 'econometrics'],
  ['A/B testing', 'a/b test(?:s|ing)?', 'experimentation'],
  // Infrastructure / data
  ['Kubernetes', 'kubernetes', 'k8s'],
  ['Docker', 'docker', 'containeriz\\w*', 'container (?:orchestration|images?|runtime|security|hardening)'], // §6a A2: not shipping containers
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
  ['Observability', 'observability', 'prometheus', 'grafana', 'datadog', 'opentelemetry', '(?:system|infrastructure|production) monitoring'], // §6a A7
  ['SRE', 'site reliability', /\bSRE\b/],
  ['Storage systems', 'storage systems?', 'distributed storage', 'object storage', 'file systems?'],
  ['Datacenters', 'data ?cent(?:er|re)s?'],
  ['HPC', /\bHPC\b/, 'high[- ]performance computing', 'supercomput\\w*', 'slurm'],
  // §6a B: skill 'Data pipelines' dropped (resp 'Data pipelines' covers it)
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
  // P-17: a technical noun after "embedded"; not "embedded within our legal operations"
  ['Embedded', `embedded (?:(?:and|or|and/or) (?:[\\w+#-]+ ){0,2})?(?:${EMBEDDED_NOUNS})`, '(?:edge|firmware|real-time|rtos|bare-metal)\\s*(?:/|or|and)\\s*embedded'],
  ['Firmware', 'firmware'],
  ['RTOS', /\bRTOS\b/, 'real-time operating systems?', 'freertos', 'zephyr'],
  ['FPGA', 'fpgas?'],
  ['RF', /\bRF\b/, 'radio[- ]frequency', 'antennas?'],
  ['Signal processing', 'signal processing', /\bDSP\b/],
  ['Radar', 'radar'],
  ['Electronic warfare', 'electronic warfare', /\bEW\b/],
  ['PCB design', /\bPCBA?s?\b/, 'schematic capture', 'altium', 'board design'],
  ['Analog design', 'analog (?:circuit|design)', 'mixed-signal'],
  ['Power electronics', 'power electronics'], // §6a A9: batteries / power systems dropped (logistics, site generators)
  ['Robotics', 'robotics?', 'robots?'],
  ['Controls', 'control systems?', 'controls engineering', 'controls', 'feedback control'],
  ['ROS', /\bROS ?2?\b/],
  // P-17: robot/vehicle autonomy only; not "operate with a high degree of ownership and autonomy"
  ['Autonomy', /\bAutonomy\b/, `autonomy (?:${AUTONOMY_AFTER})`, `(?:${AUTONOMY_BEFORE}) autonomy`, 'autonomous systems?', 'autonomous vehicles?'],
  ['GNC', /\bGNC\b/, 'guidance,? navigation,? (?:and|&) control'],
  ['Sensor fusion', 'sensor fusion', 'kalman filter\\w*', 'state estimation'],
  ['SLAM', /\bSLAM\b/],
  ['Avionics', 'avionics'],
  ['Propulsion', 'propulsion', 'rocket engines?'],
  ['Aerodynamics', 'aerodynamic\\w*', /\bCFD\b/, 'computational fluid dynamics'],
  // P-17: not bare "mechanisms" ("VAT mechanisms", "escalation mechanisms"), and not one
  // discipline in a degree list ("BS in Computer Science, Electrical Engineering, Mechanical
  // Engineering, or a related field") or "mechanical engineering teams"
  ['Mechanical design', 'mechanical design', new RegExp(String.raw`(?<!\b(?:${DISCIPLINES})(?: engineering)?\s*(?:,|\/|\bor\b|\band\b)\s*)\bmechanical engineering\b(?!\s*(?:,|\/|\bor\b|\band\b)\s*(?:${DISCIPLINES})\b|\s+teams\b)`, 'i')],
  // P-17: not the currency ("4,300 CAD per week", "$495,000 CAD", "CAD 150,000", "30 CAD/hour")
  ['CAD', /(?<!\d[\d,.]*\s?[kKmM]?\s?|\b(?:USD|GBP|EUR|AUD)\s?\/\s?)\bCAD\b(?!\s?(?:\$|\d|\/\s?(?:hour|hr|h|year|yr|annum|month|mo|week|wk|day)\b|per\s|an?\s+(?:hour|year|week|month)\b|annually|hourly|weekly|monthly))/],
  ['SolidWorks', 'solidworks'],
  ['Siemens NX', /\bSiemens NX\b/i, /\bNX\b/],
  ['GD&T', /\bGD&T\b/i, 'geometric dimensioning'],
  ['FEA', /\bFEA\b/, 'finite element'],
  ['Composites', 'composites', 'composite (?:materials|structures|layup|manufacturing)'], // §6a A8: not 'composite tracking'
  ['Machining', 'machining', /\bCNC\b/, 'injection molding'],
  ['DFM', /\bDF[MA]\b/, 'design for manufactur\\w*'],
  ['Lean / Six Sigma', 'lean manufacturing', 'six sigma', 'kaizen'],
  ['Systems engineering', 'systems engineering', 'model-based systems', /\bMBSE\b/],
  ['Test automation', 'test automation', 'hardware-in-the-loop', /\bHIL\b/],
  ['Simulation', 'simulations?', 'digital twins?'],
  // Business
  ['Salesforce', 'salesforce', /\bSFDC\b/],
  ['HubSpot', 'hubspot'],
  ['Excel', /\bExcel\b(?! (?:at|in)\b)/, 'spreadsheets?'], // §6a A6: not the verb ('Excel at …', 'Excel in …')
  ['Tableau', 'tableau'],
  ['Looker', /\bLooker\b/],
  ['Financial modeling', 'financial model(?:s|ing|ling)?', /\bDCF\b/],
  ['FP&A', /\bFP&A\b/i, 'financial planning'],
  ['Accounting', 'accounting', /\bGAAP\b/, 'revenue recognition'],
  // §6a B: skill 'GTM' dropped (resp 'Go-to-market' covers it)
  ['Enterprise sales', 'enterprise sales', 'enterprise (?:accounts|customers|deals|software sales)', 'b2b sales', 'complex sales'],
  ['Contract negotiation', 'negotiat\\w* (?:contracts?|agreements?|deals?|terms)', 'contract negotiations?', 'contract (?:review|drafting|management)'], // §6a A10
  ['Gov contracting', 'government contract\\w*', /\bDFARS\b/, /\bFAR\b/, 'federal acquisition', 'proposal writing'],
  ['Recruiting', 'recruiting', 'talent acquisition', 'sourcing candidates'],
  ['Product management', 'product management', 'product requirements', /\bPRDs?\b/],
  // §6a B: skill 'Program management' dropped (it is a responsibility)
  // §6a B: skill 'Marketing' dropped (resp 'Marketing' covers it)
  ['SEO', /\bSEO\b/],
  ['Public policy', 'public policy', 'policy analysis', 'legislat\\w*'],
  // §6a B: skill 'Analytics' dropped (resp 'Analytics' covers it)
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
  // §6a B: resp 'Interpretability' dropped (the skill covers it)
  ['Infrastructure', 'infrastructure', 'platforms?', 'clusters?', 'compute'],
  ['Inference / serving', 'inference', 'serving', 'deploy(?:ing)? models', 'model deployment'],
  ['Performance optimization', 'optimi[sz]\\w*', 'latency', 'throughput', 'efficien\\w*', 'profil\\w*'],
  ['Scaling systems', 'scal(?:e|es|ing|able|ability)', 'high[- ]throughput', 'large[- ]scale'],
  ['Architecture', 'architect\\w*', 'system design', 'design and (?:build|implement)'],
  ['Data pipelines', 'data pipelines?', /\bETL\b/, 'datasets?', 'data (?:collection|processing|infrastructure|quality|ingestion)'],
  // §6a B: renamed from 'Evaluation'; needs model/eval context ('evaluate vendors' no longer fires)
  ['Model evaluation', 'evals?', '(?:model|ai|llm) evaluations?', 'evaluat\\w* (?:the |our )?(?:ai |ml |language |frontier )?models?', '(?:model|llm) benchmarks?', 'benchmark(?:s|ing)? (?:the |our )?models?', 'measur(?:e|ing) model (?:performance|capabilities)'],
  ['Safety', 'safety', 'alignment', 'misuse', 'harmful', 'responsible (?:ai|scaling)', 'trust (?:and|&) safety', 'safeguards'],
  ['Security', 'security(?! clearance)', 'threat (?:model|detection|intel)\\w*', 'vulnerabilit\\w*'], // §6a A11: no bare secure / protect / threats
  ['On-call / reliability', 'on-?call', 'reliab\\w*', 'uptime', 'incidents?', 'availability', /\bSRE\b/, 'outages?'],
  ['Tooling / dev experience', 'tooling', 'developer (?:experience|productivity|tools)', 'internal tools', 'ci/cd', 'build systems?'],
  ['Product development', 'build (?:new )?(?:products?|features?)', 'product development', 'ship(?:ping)? (?:new )?(?:features|products)', 'end-to-end', 'full[- ]stack', 'user-facing', 'product surfaces?'],
  ['Applied ML', 'appl(?:y|ied) (?:ml|machine learning|ai|models)', 'ml-powered', 'ai-powered'],
  ['Design', 'user experiences?', 'user interfaces?', /\bUX\b/, /\bUI\b/, 'mockups', 'wireframes', 'prototyp\\w*', 'design (?:the )?(?:user|product|visual)'],
  // §6a A14: customers/clients only after a customer verb, never 'internal clients' or 'existing customers'
  ['Customer-facing', '(?:work(?:s|ing)?(?: closely| directly)? with|support(?:s|ing)?|engag(?:e|es|ing)(?: with)?|partner(?:s|ing)?(?: closely| directly)? with|for|serv(?:e|es|ing)|help(?:s|ing)?|meet(?:s|ing)? with|liais(?:e|es|ing) with|interfac(?:e|es|ing) with) (?:our |the |key |strategic |prospective )?(?:external |enterprise )?(?:customers?|clients?)', '(?:customer|client) (?:relationships?|acquisition|engagements?)', 'customer-facing', 'client-facing', 'end users'],
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
  ['Writing / docs', 'documentation', 'technical writing', 'write (?:specs|docs|documentation|reports|policies|content)', 'whitepapers?', 'blogs?'], // §6a A12: not 'write code' / 'construction documents'
  // §6a B: bare 'analy[sz]\\w*' tightened
  ['Analytics', 'analytics', '(?:data|quantitative|statistical) analys[ie]s', 'analy[sz](?:e|es|ing) (?:the )?(?:data|metrics|results|trends|usage|performance)', 'metrics', 'dashboards?', 'insights', 'sql'],
  ['Enablement / training', 'enablement', 'workshops?', 'educat\\w*', 'train (?:users|customers|teams|operators)'],
  ['Hardware integration', 'hardware', 'bring-?up', 'subsystems?', 'sensors?', 'payloads?', 'integrat\\w* (?:with )?(?:hardware|sensors|systems|vehicles)'],
  // §6a B: resp 'Systems engineering' dropped (the skill covers it)
  // §6a B: resp 'Simulation' and 'Autonomy' dropped (the skills cover them)
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

// P-17: domain words that are a skill only in a technical role. An engineer's "Experience
// with UAVs, robotics, autonomy, embedded systems" or "Skilled in Statistics, AI/ML" is a
// skill; a sourcer's "recruiting within aerospace, robotics, autonomy" and a customer
// success manager's "articulate AI/ML concepts" are not.
const TECH_TITLE_WORDS_RE = /\b(?:engineers?|engineering|scientists?|science|research(?:ers?)?|developers?|architects?|technical|technicians?|data|machine learning|devops|programmers?|software|hardware|firmware|systems|security|infrastructure|robotics|simulation|modeling|modelling)\b/i;
const TECH_TITLE_CAPS_RE = /\b(?:ML|SRE|TPM|FDE|GNC|SWE|MTS)\b/;
/** A technical role from its title (engineer, scientist, technical program manager, ...). */
export function isTechnicalTitle(title) {
  const t = String(title || '');
  return TECH_TITLE_WORDS_RE.test(t) || TECH_TITLE_CAPS_RE.test(t);
}
const AUTONOMY_LIST_TERMS = 'networking|robotics|uavs?|uas|gnc|perception|sensor fusion|sensors?|simulation|systems integration|embedded systems|munitions|isr|mission systems|avionics|radar|ew|acoustics|machine learning|computer vision|navigation|c2|command and control|missiles|cyber|flight controls|propulsion|payloads?|ground systems|unmanned systems|aircraft';
const AIML_NOT_SKILL = 'compan(?:y|ies)|industr(?:y|ies)|space|sectors?|markets?|landscape|products?|teams?|engineers|researchers|experts|ecosystems?|startups?|businesses|firms|vendors|customers|concepts|dynamics|organi[sz]ations|leaders';
const GATED_SKILLS = compileLexicon([
  ['Machine learning', new RegExp(String.raw`(?<!\b[Ii]nterest(?:ed)?\s+in\s+|\b[Pp]assion(?:ate)?\s+(?:for|about)\s+)\b(?:AI\s?\/\s?ML|ML\s?\/\s?AI)\b(?![\s-]+(?:${AIML_NOT_SKILL})\b)`)],
  ['Autonomy', `(?:${AUTONOMY_LIST_TERMS})\\s*(?:,|and|or|&)\\s*(?:the\\s+)?autonomy`, `autonomy\\s*(?:,|and|or|&)\\s*(?:${AUTONOMY_LIST_TERMS})`],
]);
// The title alone names the skill ("Senior Mechanical Engineer: Mechanisms, Space").
const TITLE_SKILLS = compileLexicon([
  ['Mechanical design', /\b(?:mechanical|electro-?mechanical|mechatronics?|mechanisms?)\b/i],
  ['Embedded', /\bembedded\b/i],
  ['Autonomy', /\bautonom(?:y|ous)\b/i],
]);
const LEXICON_ORDER = new Map(SKILL_LEXICON.map(([label], i) => [label, i]));

const SKILL_RES = new Map(SKILLS.map(({ label, res }) => [label, res]));
for (const { label, res } of [...TITLE_SKILLS, ...GATED_SKILLS]) SKILL_RES.set(label, [...(SKILL_RES.get(label) || []), ...res]);

/** Skill labels for a job: the lexicon, plus the title-only and technical-role-only patterns (P-17), in lexicon order. */
function matchSkills(title, all) {
  const out = new Set(matchLexicon(SKILLS, all));
  for (const { label, res } of TITLE_SKILLS) if (!out.has(label) && res.some((re) => re.test(title))) out.add(label);
  if (isTechnicalTitle(title)) for (const { label, res } of GATED_SKILLS) if (!out.has(label) && res.some((re) => re.test(all))) out.add(label);
  return [...out].sort((a, b) => LEXICON_ORDER.get(a) - LEXICON_ORDER.get(b));
}
// "Familiarity with HTML, CSS, Javascript, and Typescript is appreciated" (Palantir designers),
// "Experience with Rust is a plus": the skill is real but not what the role is about.
const NICE_TO_HAVE_RE = /\b(?:a (?:big |huge |strong |nice )?plus|nice[- ]to[- ]haves?|(?:is|are|would be) (?:also |very |highly )?(?:appreciated|a bonus|helpful|desirable|welcome|beneficial)|bonus points?|(?:is |are )?not (?:required|necessary)|don['’]t need to be an expert)\b/i;
const splitSentences = (s) => String(s || '').split(/\n+|(?<=[.!?])\s+(?=[A-Z(“"])/);

/**
 * Skills in lexicon order, except that skills the posting names only in nice-to-have
 * sentences ("Familiarity with ... Typescript is appreciated", "Rust is a plus") come
 * last (P-17: a card shows the first two, and a designer's card should not lead with
 * TypeScript). The set is unchanged; only the order moves.
 */
function orderSkills(skills, { title, resp, fit, body }) {
  if (skills.length < 2) return skills;
  const core = [String(title || '')];
  let nice = false;
  for (const p of [...resp, ...fit, body]) {
    for (const s of splitSentences(p)) {
      if (NICE_TO_HAVE_RE.test(s)) nice = true;
      else core.push(s);
    }
  }
  if (!nice) return skills;
  const coreText = core.join('\n');
  const late = new Set(skills.filter((label) => !(SKILL_RES.get(label) || []).some((re) => re.test(coreText))));
  return late.size ? [...skills.filter((l) => !late.has(l)), ...skills.filter((l) => late.has(l))] : skills;
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
 * deduped; responsibilities and fit in lexicon order, skills in salience order,
 * see orderSkills).
 */
export function extractKeywords({ title = '', department = '', sections = null, text = '' } = {}) {
  const resp = (sections && sections.responsibilities) || [];
  const fit = (sections && sections.fit) || [];
  const body = String(text || '');
  const all = [title, ...resp, ...fit, body].filter(Boolean).join('\n');

  const skills = orderSkills(matchSkills(String(title || ''), all), { title, resp, fit, body });

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
  return seniorityOf(title).level;
}

/**
 * Where a title's seniority came from: 'title' when a level word decided it, 'default'
 * when the title has none and the job is "Mid" by convention. On the 2026-10 boards
 * about half the postings are 'default' (most of them at the labs, whose titles carry no
 * level), so market-comps "Mid" cells and Compstimate's Mid weighting are mostly
 * defaults. scripts/refresh/jobs.js reports the share monthly (seniority-ladder).
 */
export function seniorityBasis(title) {
  return seniorityOf(title).basis;
}

const byTitle = (level) => ({ level, basis: 'title' });
const BY_DEFAULT = Object.freeze({ level: 'Mid', basis: 'default' });

// P-3 (persona review 2026-10-10). "Account Director" / "Partner Director" are sales and
// partner titles (OpenAI's ~40 Account Directors, "Federal Account Director") and a "Test
// Director" runs test events ("Senior Staff Engineer, Test Director"): none is an
// executive, so these phrases never make a title Director+.
// ("People Business Partner Director" is an HR director, so "business partner" is left out.)
const NON_EXEC_DIRECTOR_RE = /\b(?:accounts?|(?<!\bbusiness\s)partner|client|test)\s+director\b/gi;
// A distinguished-type fellow is a senior individual-contributor rank. Any other "Fellow"
// ("Conceptual Reasoning Fellow", "SWE Fellow - Human Frontier Collective") is a
// fixed-term fellowship, filed with internships like "Anthropic Fellows Program".
const SENIOR_FELLOW_RE = /\b(?:distinguished|technical|senior|principal|corporate|chief)\s+fellows?\b/i;
const FELLOW_RE = /\bfellows?\b/i;

function seniorityOf(title) {
  const t = stripGenericStaff(String(title || ''));
  if (!t.trim()) return BY_DEFAULT;
  const exec = t.replace(NON_EXEC_DIRECTOR_RE, ' ');
  if (/\b(?:director|vp|svp|evp|vice[- ]president|head of|chief|cto|cfo|ceo|coo|ciso|cmo|cpo|president|general manager|partner,)\b/i.test(exec)
    || /^head\b/i.test(t)) return byTitle('Director+');
  if (/\b(?:intern(?:ship)?s?|fellowships?|fellows program|co-?op|apprentice(?:ship)?|summer (?:analyst|associate|student)|residency|resident)\b/i.test(t)
    || (FELLOW_RE.test(t) && !SENIOR_FELLOW_RE.test(t))) return byTitle('Intern');
  if (/\b(?:staff|principal|distinguished)\b/i.test(t) || SENIOR_FELLOW_RE.test(t)) return byTitle('Staff+');
  const isManager = /\bmanager\b/i.test(t) && !NON_PEOPLE_MANAGER.test(t);
  if (isManager || /\b(?:team lead|people lead|supervisor|engineering lead|lead,? (?:people|team))\b/i.test(t)
    || /\bmanager,\s/i.test(t) && !NON_PEOPLE_MANAGER.test(t)) return byTitle('Manager');
  if (/\b(?:senior|sr\.?|lead|iii)\b/i.test(t) || /\bIII\b/.test(t)) return byTitle('Senior');
  if (/\b(?:junior|jr\.?|associate|new grad(?:uate)?|graduate|entry[- ]level|early career)\b/i.test(t)
    || /\s(?:I|1)(?=\s*(?:[,()\-–—]|$))/.test(t)) return byTitle('Entry');
  return BY_DEFAULT;
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
  String.raw`\bequity[- ](?:research|markets?|investments?|investing|investors?|financing|capital|analysts?|analysis|deals?|transactions?|method|accounting|roll-?forwards?|administration|teams?|donations?|minded|lens|events?|instruments?|considerations?|planning|programs? managers?)\b`,
  String.raw`\b(?:their|employees['’]?)\s+equity\b`,
  String.raw`\b(?:optional\s+)?equity donation(?: matching)?\b`,
  String.raw`\bequitabl[ey]\b`,
].join('|'), 'gi');

// Nice-to-have senses of "bonus": "It's a bonus if you have", "Bonus:", "Bonus points".
const BONUS_NOISE_RE = /\[bonus\]|\bbonus\s*points?\b|\b(?:it(?:['’]s| is)|is|as|would be|a (?:big|huge|real))\s+an?\s+(?:big\s+|huge\s+|nice\s+|major\s+|real\s+)?bonus\b|\bas a bonus\b|\bbonus\s+(?:if|for|to have)\b|\bbonus\s*[:–—-]\s*(?=\S)|^\s*bonus\b(?!\s*(?:\+|,|and|eligib|plan|program|potential|structure|target))/gim;

// The sentence is about doing compensation work, not about this offer.
const COMP_DUTY_RE = /\b(?:payroll|accounting|accruals?|ASC\s?\d{3}|GAAP|SOX|audits?|tax(?:es)?|administ\w*|roll-?forwards?|footnotes?|reconcil\w*|benchmark\w*|governance|oversee|design(?:ing)?,? (?:and|&) (?:oversee|manage|run)|compensation (?:programs?|programmes?|planning|methodolog\w*|strategy|philosophy|practices|professionals?|experience|expertise|principles|governance)|incentive (?:plan )?design|experience (?:with|in|designing|managing|building)|knowledge of|familiarity with|matters|counsel|securities|negotiat\w*|structures|cap tables?|tender offers?|process stock options|equity team|equity programmes|knowledge|prior experience|valuation|dilution|financial statements?|earnings[- ]per[- ]share|counteroffers?|closing strateg\w*)\b/i;

// The sentence denies or merely hedges ("This estimate excludes ... bonus").
const COMP_NEGATION_RE = /\bnot\s+(?:be\s+)?eligible\b|\bineligible\b|\b(?:are|is|will be)\s+not\s+(?:offered|included|provided)\b|\bdoes(?:n['’]t| not) (?:include|offer)\b|\bno (?:equity|bonus|commission)\b|\bexclud(?:es?|ing)\b/i;

// Conditional boilerplate: "For sales roles, the range ... OTE ... commissions"
// (SALES_CONDITIONAL_RE, defined in server/salary.js, which uses it for on-target earnings).
const SALES_TITLE_RE = /\b(?:account executive|account director|account manager|ae\b|business development (?:rep\w*|manager|executive|director)|bdr|sdr|partner sales|sales(?!\s+(?:strategy|operations|ops|enablement|engineer\w*|compensation|analytics|systems|planning|finance|recruit\w*))\b|seller)/i;
// Sales-org roles that are not quota-carrying.
const SALES_TITLE_EXCLUDE_RE = /\b(?:enablement|pre-?sales|presales|operations|strategy|analyst|developer|recruit\w*)\b/i;

/**
 * A quota-carrying sales title ("Enterprise Account Executive", "Sales Lead", "Business
 * Development Representative"; not "Sales Enablement Lead" or "Customer Success Manager").
 * A "for sales roles" sentence applies only to these (extras here, OTE in server/salary.js).
 */
export function isSalesTitle(title) {
  const t = String(title || '');
  return SALES_TITLE_RE.test(t) && !SALES_TITLE_EXCLUDE_RE.test(t);
}
const NON_FULLTIME_TITLE_RE = /\b(?:intern(?:ship)?s?|co-?op|part[- ]time|temporary|seasonal|fellow(?:ship)?s?|contractor)\b|\((?:contract|temp|contract-to-hire)\)|,\s*contract\s*$/i;
// "... included in the majority of full time offers" does not apply to interns/contractors.
const FULLTIME_SCOPE_RE = /\bfull[- ]time\b/i;
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
  /\b(?:earn|uncapped|plus|sales)\s+commissions?\b/i,
  /\b(?:salary|base|pay|compensation)\s+(?:and|plus|with|\+)\s+commissions?\b/i,
  /\+\s*commissions?\b/i,
  /(?:•|\d[KkMm]?)\s*(?:Commission|Bonus)\b/, // Ashby summary: "$189K – $220.5K Commission
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
  const salesTitle = isSalesTitle(title);
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
    if (nonFullTime && FULLTIME_SCOPE_RE.test(seg)) continue;

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
