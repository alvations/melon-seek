// Gate threshold study for the second beta vetting (docs/process/vetting-beta-2.md, summary.md §5).
// Runs server/vet.js#vetSalaries with changed thresholds on a COPY of the gate (server/vet.js and
// server/salary.js are copied to a temp dir and their constants replaced there; the repo's gate is
// never edited), over un-quarantined published lists (published-view.mjs --ungated), and scores each
// quarantine against the reviewers' verdicts (this folder's, data/vetting/2026-10-11-beta/ and
// data/vetting/2026-10-02/).
//
//   node data/vetting/2026-10-11-beta-2/gate-study.mjs <ungated-dir> [--ids]
//
// A quarantine of a job whose verdict (same parsed min/max) says the parse is right is a false
// positive; a job whose verdict corrects it (isWrong) and that stays published is a false negative.
// Variants (all optional, off in "shipped"):
//   MAX_ANNUAL, RATIO_QUARANTINE   the constants;
//   CUR_GROUP                      the statistics also compare a job with the other jobs paid in its
//                                  currency (a `cur:<code>` group, used only when it has at least
//                                  MIN_GROUP members, like every group);
//   CUR_TEXT                       a hard check: a text-parsed salary whose currency is none of the
//                                  job's countries' currencies (the Mexico "$" case, VT-14). Not
//                                  proposed: it also quarantines reviewed-right main-site postings
//                                  (Cohere's explicit USD for Germany, xAI's bare "$" in Dublin); the
//                                  Mexico case belongs in the parser's currency rule instead.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const [dir] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const showIds = process.argv.includes('--ids');
if (!dir) { console.error('usage: gate-study.mjs <ungated-dir> [--ids]'); process.exit(2); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-study-'));
fs.writeFileSync(path.join(tmp, 'package.json'), '{"type":"module"}\n');
fs.copyFileSync(path.join(ROOT, 'server', 'salary.js'), path.join(tmp, 'salary.js'));
let vet = fs.readFileSync(path.join(ROOT, 'server', 'vet.js'), 'utf8');
const swap = (from, to) => { if (!vet.includes(from)) throw new Error(`gate-study: server/vet.js changed, cannot find ${JSON.stringify(from)}`); vet = vet.replace(from, to); };
swap('export const VET = Object.freeze({\n  MAX_ANNUAL: 1_200_000,', 'const OV = (globalThis.VET_OVERRIDE || {});\nexport const VET = Object.freeze({\n  MAX_ANNUAL: OV.MAX_ANNUAL ?? 1_200_000,');
swap('  RATIO_QUARANTINE: 4,', '  RATIO_QUARANTINE: OV.RATIO_QUARANTINE ?? 4,');
swap('pts.push({ i, x, groups: [`dept:${j.department || \'-\'}`, `family:${roleFamily(j.title)}`, `kind:${payKind(j.salary)}`] });',
  'pts.push({ i, x, groups: [`dept:${j.department || \'-\'}`, `family:${roleFamily(j.title)}`, `kind:${payKind(j.salary)}`, ...(OV.CUR_GROUP ? [`cur:${String(j.salary.currency || \'USD\').toUpperCase()}`] : [])] });');
const CC = "{US:'USD',CA:'CAD',GB:'GBP',UK:'GBP',CH:'CHF',JP:'JPY',KR:'KRW',IN:'INR',SG:'SGD',AU:'AUD',NZ:'NZD',IL:'ILS',AE:'AED',SA:'SAR',QA:'QAR',PL:'PLN',SE:'SEK',NO:'NOK',DK:'DKK',CZ:'CZK',HK:'HKD',TW:'TWD',CN:'CNY',BR:'BRL',MX:'MXN',ZA:'ZAR',RO:'RON',IE:'EUR',DE:'EUR',FR:'EUR',NL:'EUR',ES:'EUR',IT:'EUR',BE:'EUR',AT:'EUR',FI:'EUR',PT:'EUR',LU:'EUR',GR:'EUR',EE:'EUR',LV:'EUR',LT:'EUR',SK:'EUR',SI:'EUR',HR:'EUR',MT:'EUR',CY:'EUR',BG:'EUR'}";
swap('  const tc = titleClass(job && job.title);', `  if (OV.CUR_TEXT && salary.source === 'text' && job && Array.isArray(job.locations)) { const M = ${CC}; const want = [...new Set(job.locations.map((l) => l && M[l.country]).filter(Boolean))]; if (want.length && !want.includes(cur)) out.push({ code: 'currency_country', reason: \`pay read as \${cur}, but the job is paid in \${want.join(', ')}\` }); }\n  const tc = titleClass(job && job.title);`);
fs.writeFileSync(path.join(tmp, 'vet.js'), vet);

const lists = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => ({ slug: path.basename(f, '.json'), jobs: JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).jobs }));
const verdicts = new Map();
for (const f of [path.join(HERE, 'verdicts.jsonl'), path.join(ROOT, 'data', 'vetting', '2026-10-11-beta', 'verdicts.jsonl'), path.join(ROOT, 'data', 'vetting', '2026-10-02', 'verdicts.jsonl')]) {
  if (!fs.existsSync(f)) continue;
  for (const l of fs.readFileSync(f, 'utf8').split('\n').filter(Boolean)) {
    const v = JSON.parse(l);
    const k = `${v.id}|${v.parsed ? v.parsed.min : ''}|${v.parsed ? v.parsed.max : ''}`;
    if (!verdicts.has(k)) verdicts.set(k, v);
  }
}
// A verdict says the published salary is wrong when its corrected value differs from what was
// parsed (null, or another min, max, currency or interval). A source_ambiguous verdict whose
// corrected value is the parsed one (structured wins, a label error read right) is not wrong.
const F = { hour: 2080, day: 260, week: 52, month: 12, year: 1 };
const close = (a, b) => Math.abs(a - b) <= Math.max(0.011, Math.abs(b) * 0.001);
function isWrong(v) {
  if (v.verdict === 'correct') return false;
  const p = v.parsed; const c = v.corrected;
  if (!p) return !!c;
  if (!c) return true;
  const iv = p.intervalCorrected ? 'year' : p.originalInterval || 'year';
  const f = iv === 'term' && p.termWeeks ? 52 / p.termWeeks : F[iv] || 1;
  return !(close(c.min, p.min / f) && close(c.max, p.max / f) && c.currency === p.currency && c.interval === iv);
}
const VARIANTS = [
  ['shipped', {}],
  ['MAX_ANNUAL $1.5M', { MAX_ANNUAL: 1_500_000 }],
  ['RATIO_QUARANTINE 3.5x', { RATIO_QUARANTINE: 3.5 }],
  ['+ currency group in the statistics', { CUR_GROUP: true }],
  ['+ currency_country check (text pay)', { CUR_TEXT: true }],
  ['proposed: $1.5M + currency group', { MAX_ANNUAL: 1_500_000, CUR_GROUP: true }],
];
let i = 0;
for (const [name, ov] of VARIANTS) {
  globalThis.VET_OVERRIDE = ov;
  const { vetSalaries } = await import(`${pathToFileURL(path.join(tmp, 'vet.js')).href}?v=${i++}`);
  let total = 0; let bad = 0; let fp = 0; let unreviewed = 0; let fn = 0; let wrong = 0; let correct = 0;
  const per = []; const ids = [];
  for (const { slug, jobs } of lists) {
    const out = vetSalaries(jobs);
    const q = out.filter((j) => j.salaryFlag);
    if (q.length) per.push(`${slug} ${q.length}`);
    total += q.length;
    for (const j of q) {
      const v = verdicts.get(`${j.id}|${j.salaryRaw.min}|${j.salaryRaw.max}`);
      const tag = !v ? 'unreviewed' : !isWrong(v) ? 'FP' : 'bad';
      if (tag === 'FP') fp++; else if (tag === 'bad') bad++; else unreviewed++;
      ids.push(`${j.id}(${tag}:${j.salaryFlag.codes.join('+')})`);
    }
    // Reviewed jobs of THIS review (so each job is scored once, on today's parse).
    for (const j of out) {
      const s = j.salary || j.salaryRaw;
      if (!s) continue;
      const v = verdicts.get(`${j.id}|${s.min}|${s.max}`);
      if (!v || !String(v.parser_version).includes('94cb54c')) continue;
      if (!isWrong(v)) correct++;
      else { wrong++; if (j.salary) fn++; }
    }
  }
  console.log(`${name.padEnd(38)} quarantined ${String(total).padStart(3)} | wrong ${bad} | false positives ${fp} | unreviewed ${unreviewed} | reviewed today: right ${correct}, wrong ${wrong}, wrong and published ${fn} | ${per.join(', ')}`);
  if (showIds) console.log(`   ${ids.join(' ')}`);
}
fs.rmSync(tmp, { recursive: true, force: true });
