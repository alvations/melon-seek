#!/usr/bin/env node
// Optional automated LLM review of the salary anomaly scan (docs/VETTING.md).
//
//   ANTHROPIC_API_KEY=... node scripts/llm-vet.js [--flags <flags.jsonl>] [--out <file>]
//       [--limit N] [--concurrency N] [--only-blocking] [--skip-reviewed]
//
//   --only-blocking  only jobs whose critical flag survived the gate (would be published)
//   --skip-reviewed  skip jobs whose same parsed salary already has a verdict in any
//                    data/vetting/<date>/verdicts.jsonl or llm-verdicts.jsonl (CI cost control)
//
// Reads flags.jsonl (scripts/vet-salaries.js), asks the Claude Messages API for
// a structured verdict per flagged job, and appends one line per job to
// data/vetting/<date>/llm-verdicts.jsonl, the same schema as the human/agent
// review's verdicts.jsonl, with reviewer = the model that answered. Lines
// already in the output are skipped, so a rerun resumes.
// Without ANTHROPIC_API_KEY it prints a message and exits 0 (CI-safe).
//
// Env:
//   VET_LLM_MODEL      model id (default claude-sonnet-5-5: cost-effective;
//                      claude-opus-5-5 for the most careful review)
//   VET_LLM_EFFORT     output_config.effort: low | medium | high (default medium)
//   VET_LLM_FALLBACKS  "default" (server-side refusal fallback, Claude API only) or "off"
//   ANTHROPIC_BASE_URL API base (default https://api.anthropic.com)
//
// Plain fetch (no SDK dependency; the project's contract allows only leaflet).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_MODEL = 'claude-sonnet-5-5';
export const API_VERSION = '2023-06-01';
export const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const RETRYABLE = new Set([408, 409, 429, 500, 502, 503, 504, 529]);

export const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    verdict: { type: 'string', enum: ['correct', 'parser_bug', 'source_ambiguous'] },
    corrected: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            min: { type: 'number' },
            max: { type: 'number' },
            currency: { type: 'string' },
            interval: { type: 'string', enum: ['hour', 'day', 'week', 'month', 'year'] },
          },
          required: ['min', 'max', 'currency', 'interval'],
        },
      ],
    },
    kind: { anyOf: [{ type: 'null' }, { type: 'string', enum: ['salary', 'stipend', 'hourly'] }] },
    evidence: { type: 'string' },
  },
  required: ['verdict', 'corrected', 'kind', 'evidence'],
};

export const SYSTEM_PROMPT = `You review salaries that a job-board parser extracted from job postings, for a site that plots postings by pay. Each request is one posting flagged by an anomaly scan. Decide what the posting actually says about pay, using only the source text you are given.

Verdicts:
- "correct": the parsed salary matches what the posting states (amount, currency, interval), even if the stated range is unusual.
- "parser_bug": the posting is clear, and the parser got it wrong: it took a non-pay amount (a project result, a deal size, funding, a budget, a bonus, a benefit or perk such as a home-office, lunch or learning stipend), missed the pay statement, kept only one end or one tier of a range, misread the currency or interval, or applied an interval from another sentence.
- "source_ambiguous": the posting itself is inconsistent or unclear (a range spanning 10x that looks like a dropped digit, annual-sized numbers labelled hourly or monthly, a currency that contradicts the stated location, structured and text ranges that disagree).

"corrected" is the salary that should be shown, in the SOURCE interval (e.g. 35 to 45 "hour", 3850 "week", 120000 "year"), or null when the posting states no pay or the stated pay cannot be trusted. Rules for corrected:
- Pay comes only from pay context: a pay keyword (salary, compensation, pay, base, wage, OTE, stipend paid for the role, hourly rate) in the same sentence, clause, or heading. A bare amount in prose is never pay.
- Benefits and perks are not pay.
- Several currencies for one amount: use the one matching the job's location countries; if several match, USD; if none, USD.
- Tiered lists (levels or locations) for one role: span the lowest minimum to the highest maximum when that span is at most 3x.
- A structured salary (from the board's own pay field) wins over the description text unless it is implausible and the text is plausible.
kind is "stipend" for a stipend, "hourly" for an hourly rate, else "salary" (null when corrected is null).
evidence: one or two sentences that quote the relevant source words verbatim, then say why.`;

/** User message for one flags.jsonl line. Only fields the reviewer needs. */
export function userMessage(line) {
  const p = line.parsed;
  const parsed = p ? {
    annual_min: p.min, annual_max: p.max, currency: p.currency,
    source_interval: p.statedInterval || p.originalInterval || 'year', text: p.text, source: line.source || p.source || null,
    ...(p.intervalCorrected ? { interval_corrected_from: p.statedInterval } : {}),
  } : null;
  return JSON.stringify({
    id: line.id, company: line.company, title: line.title, employment_type: line.employmentType || null,
    location_countries: line.countries || [], scan_flags: line.flags, quarantined_by_gate: !!line.quarantined,
    parsed_salary: parsed, source_excerpt: line.excerpt, other_pay_text: line.pay_snippets || [],
  }, null, 1);
}

/** Messages API request body for one line. */
export function buildRequest(line, { model = DEFAULT_MODEL, effort = 'medium', fallbacks = 'default' } = {}) {
  const body = {
    model,
    max_tokens: 4000,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: `Review this flagged posting and return the verdict JSON.\n\n${userMessage(line)}` }],
    output_config: { effort, format: { type: 'json_schema', schema: VERDICT_SCHEMA } },
  };
  if (fallbacks === 'default') body.fallbacks = 'default';
  return body;
}

export function headers(apiKey, { fallbacks = 'default' } = {}) {
  const h = { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': API_VERSION };
  if (fallbacks === 'default') h['anthropic-beta'] = FALLBACK_BETA;
  return h;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * POST with retries on 408/409/429/5xx/529 and network errors (exponential
 * backoff with jitter, honoring retry-after). 4xx other than those are not
 * retried. Returns the parsed JSON body.
 */
export async function postMessages(body, { apiKey, baseUrl = 'https://api.anthropic.com', fetchImpl = fetch, retries = 4, baseDelayMs = 1000, fallbacks = 'default', sleepImpl = sleep } = {}) {
  const url = `${baseUrl.replace(/\/$/, '')}/v1/messages`;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    let res;
    try {
      res = await fetchImpl(url, { method: 'POST', headers: headers(apiKey, { fallbacks }), body: JSON.stringify(body) });
    } catch (err) {
      lastErr = new Error(`network error: ${err && err.message}`);
      if (attempt < retries) { await sleepImpl(baseDelayMs * 2 ** attempt * (0.5 + Math.random())); continue; }
      throw lastErr;
    }
    if (res.ok) return res.json();
    let detail = '';
    try { const j = await res.json(); detail = j && j.error ? `${j.error.type}: ${j.error.message}` : JSON.stringify(j).slice(0, 300); } catch { /* non-JSON */ }
    lastErr = Object.assign(new Error(`HTTP ${res.status}${detail ? ` ${detail}` : ''}`), { status: res.status });
    if (!RETRYABLE.has(res.status) || attempt === retries) throw lastErr;
    const ra = Number(res.headers && res.headers.get && res.headers.get('retry-after'));
    await sleepImpl(Number.isFinite(ra) && ra > 0 ? ra * 1000 : baseDelayMs * 2 ** attempt * (0.5 + Math.random()));
  }
  throw lastErr;
}

/** Verdict object from a Messages API response (checks stop_reason first). */
export function parseVerdict(resp) {
  if (!resp || !Array.isArray(resp.content)) throw new Error('malformed response (no content)');
  if (resp.stop_reason === 'refusal') {
    const cat = resp.stop_details && resp.stop_details.category;
    throw Object.assign(new Error(`model declined (refusal${cat ? `: ${cat}` : ''})`), { refusal: true });
  }
  if (resp.stop_reason === 'max_tokens') throw new Error('response truncated (max_tokens)');
  const text = resp.content.filter((b) => b && b.type === 'text').map((b) => b.text).join('');
  let v;
  try { v = JSON.parse(text); } catch { throw new Error(`response is not JSON: ${text.slice(0, 120)}`); }
  if (!['correct', 'parser_bug', 'source_ambiguous'].includes(v.verdict)) throw new Error(`bad verdict ${v.verdict}`);
  if (v.corrected != null && !(Number.isFinite(v.corrected.min) && Number.isFinite(v.corrected.max))) throw new Error('bad corrected salary');
  return v;
}

/** "git <sha> / salary.js sha256:<12>" identifying the parser that produced `parsed`. */
export function parserVersion() {
  let git = null;
  try { git = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { /* not a checkout */ }
  let hash = null;
  try { hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'server', 'salary.js'))).digest('hex').slice(0, 12); } catch { /* missing */ }
  return `${git ? `git ${git}` : 'git ?'} / salary.js sha256:${hash || '?'}`;
}

/** Latest data/vetting/<date>/flags.jsonl. */
function latestFlags() {
  const dir = path.join(ROOT, 'data', 'vetting');
  if (!fs.existsSync(dir)) return null;
  const dates = fs.readdirSync(dir).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && fs.existsSync(path.join(dir, d, 'flags.jsonl'))).sort();
  return dates.length ? path.join(dir, dates[dates.length - 1], 'flags.jsonl') : null;
}

/**
 * Review every line of flagsFile not yet in outFile. Returns counts.
 * Writes each verdict as soon as it arrives (the trail survives interruption).
 */
/** Same job + same parsed salary = same review question. */
export function reviewKey(l) {
  const p = l.parsed;
  return `${l.id}|${p ? `${p.min}|${p.max}|${p.currency}` : 'none'}`;
}

/** Every committed verdicts.jsonl / llm-verdicts.jsonl under data/vetting/. */
export function reviewedFiles(dir = path.join(ROOT, 'data', 'vetting')) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).flatMap((d) => ['verdicts.jsonl', 'llm-verdicts.jsonl'].map((f) => path.join(dir, d, f))).filter((f) => fs.existsSync(f));
}

export async function run({ flagsFile, outFile, apiKey, env = process.env, fetchImpl = fetch, limit = Infinity, concurrency = 4, onlyBlocking = false, skipReviewed = [], log = console.log, sleepImpl } = {}) {
  const model = env.VET_LLM_MODEL || DEFAULT_MODEL;
  const effort = env.VET_LLM_EFFORT || 'medium';
  const fallbacks = env.VET_LLM_FALLBACKS === 'off' ? 'off' : 'default';
  const baseUrl = env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
  const lines = fs.readFileSync(flagsFile, 'utf8').split('\n').filter(Boolean).map((s) => JSON.parse(s));
  const done = new Set(fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8').split('\n').filter(Boolean).map((s) => JSON.parse(s).id) : []);
  // Earlier reviews (committed verdicts / llm-verdicts) of the same parsed salary need no new call.
  const seen = new Set();
  for (const f of skipReviewed) {
    for (const s of fs.readFileSync(f, 'utf8').split('\n').filter(Boolean)) { try { seen.add(reviewKey(JSON.parse(s))); } catch { /* skip bad line */ } }
  }
  const todo = lines.filter((l) => !done.has(l.id) && !seen.has(reviewKey(l)) && (!onlyBlocking || (l.critical && !l.quarantined))).slice(0, limit);
  const version = parserVersion();
  const counts = { reviewed: 0, skipped: lines.length - todo.length, errors: 0, verdicts: {}, input_tokens: 0, output_tokens: 0 };
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  let next = 0;
  async function worker() {
    while (next < todo.length) {
      const line = todo[next++];
      try {
        const resp = await postMessages(buildRequest(line, { model, effort, fallbacks }), { apiKey, baseUrl, fetchImpl, fallbacks, ...(sleepImpl ? { sleepImpl } : {}) });
        const v = parseVerdict(resp);
        const rec = {
          id: line.id, url: line.url, company: line.company, title: line.title, review_set: 'flagged', flags: line.flags,
          parsed: line.parsed, corrected: v.corrected, verdict: v.verdict, kind: v.corrected ? v.kind : null, evidence: v.evidence,
          reviewer: resp.model || model, reviewed_at: new Date().toISOString(), parser_version: version,
          llm: { requested_model: model, effort, stop_reason: resp.stop_reason, usage: resp.usage ? { input_tokens: resp.usage.input_tokens, output_tokens: resp.usage.output_tokens, cache_read_input_tokens: resp.usage.cache_read_input_tokens || 0 } : null },
        };
        fs.appendFileSync(outFile, JSON.stringify(rec) + '\n');
        counts.reviewed++;
        counts.verdicts[v.verdict] = (counts.verdicts[v.verdict] || 0) + 1;
        if (resp.usage) { counts.input_tokens += resp.usage.input_tokens || 0; counts.output_tokens += resp.usage.output_tokens || 0; }
      } catch (err) {
        counts.errors++;
        log(`  ! ${line.id}: ${err.message}`);
        if (err.status === 401 || err.status === 403) throw err; // bad key: stop everything
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, todo.length)) }, worker));
  return { model, ...counts };
}

async function main() {
  const argv = process.argv.slice(2);
  const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log('llm-vet: ANTHROPIC_API_KEY is not set; skipping the automated LLM review (nothing to do).');
    return;
  }
  const flagsFile = path.resolve(opt('--flags') || latestFlags() || '');
  if (!fs.existsSync(flagsFile)) { console.log(`llm-vet: no flags file (${opt('--flags') || 'data/vetting/<date>/flags.jsonl'}); run scripts/vet-salaries.js first.`); return; }
  const outFile = path.resolve(opt('--out') || path.join(path.dirname(flagsFile), 'llm-verdicts.jsonl'));
  const r = await run({
    flagsFile, outFile, apiKey,
    limit: opt('--limit') ? Number(opt('--limit')) : Infinity,
    concurrency: opt('--concurrency') ? Number(opt('--concurrency')) : 4,
    onlyBlocking: argv.includes('--only-blocking'),
    skipReviewed: argv.includes('--skip-reviewed') ? reviewedFiles().filter((f) => path.resolve(f) !== outFile) : [],
  });
  console.log(`llm-vet: ${r.model}: reviewed ${r.reviewed}, skipped ${r.skipped} (already reviewed or filtered), errors ${r.errors}; verdicts ${JSON.stringify(r.verdicts)}; tokens in ${r.input_tokens} / out ${r.output_tokens} -> ${path.relative(ROOT, outFile)}`);
  if (r.errors && !r.reviewed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((err) => { console.error(`llm-vet failed: ${err.message}`); process.exit(1); });
}
