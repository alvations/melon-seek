// Replay the F2 compensation-extras labelling / evaluation (features workstream).
//
//   node docs/process/scripts/extras-eval.mjs eval            # fixture labels vs extractCompExtras (full snapshot text when present, else excerpts)
//   node docs/process/scripts/extras-eval.mjs sample dev      # re-draw the dev sample (seed 20261002, 13/company + hard cases)
//   node docs/process/scripts/extras-eval.mjs sample holdout  # re-draw the held-out sample (seed 777001, 4/company + 40 uniform)
//   node docs/process/scripts/extras-eval.mjs audit equity|bonus  # corpus-wide evidence templates (precision audit)
//
// Needs data/snapshots/*.json (gitignored) for sample/audit; eval falls back to excerpts.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { htmlToText, compExtrasEvidence } from '../../../server/keywords.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SNAP = path.join(ROOT, 'data/snapshots');
const FIXTURE = path.join(ROOT, 'test/fixtures/extras-labels.json');

function loadAll() {
  if (!fs.existsSync(SNAP)) return [];
  const out = [];
  for (const f of fs.readdirSync(SNAP).filter((x) => x.endsWith('.json')).sort()) {
    const d = JSON.parse(fs.readFileSync(path.join(SNAP, f)));
    for (const j of d.jobs || []) out.push({ id: j.id, company: j.company, title: j.title, text: htmlToText(j.descriptionHtml || ''), salary: j.salary });
  }
  return out;
}
const fullText = (j) => j.text + '\n' + (j.salary?.text || '');

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function shuffler(seed) {
  const r = rng(seed);
  return (arr) => { const c = arr.slice(); for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; } return c; };
}

const WINDOW_RE = /\b(equity|equities|stock|RSUs?|restricted|options?|shares|ownership|bonus(?:es)?|commissions?|OTE|on[- ]target|incentives?|variable|profit[- ]sharing|LTI|grants?|ESPP)\b/gi;
function windows(text) {
  const spans = [];
  for (const m of text.matchAll(WINDOW_RE)) {
    const s = Math.max(0, m.index - 110), e = Math.min(text.length, m.index + m[0].length + 110);
    const last = spans[spans.length - 1];
    if (last && s <= last[1]) last[1] = e; else spans.push([s, e]);
  }
  return spans.map(([s, e]) => text.slice(s, e).replace(/\s+/g, ' ').trim());
}

function sample(which) {
  const all = loadAll();
  const byCo = {};
  for (const j of all) (byCo[j.company] ||= []).push(j);
  const picked = new Map();
  const add = (j, why) => { if (!picked.has(j.id)) picked.set(j.id, { ...j, why }); };
  if (which === 'dev') {
    const shuffle = shuffler(20261002);
    for (const arr of Object.values(byCo)) shuffle(arr).slice(0, 13).forEach((j) => add(j, 'random'));
    const hard = [
      ['dei', (j) => /(pay|health|racial|gender|social) equity|diversity,? equity|equity,? (and|&) inclusion|equity,? inclusion/i.test(fullText(j)), 6],
      ['bonus-nice-to-have', (j) => /it[’']?s a bonus|bonus if|\bbonus\s*:|bonus points|as a bonus|is a bonus/i.test(j.text), 8],
      ['commission-verb', (j) => /\b[Cc]ommission(ing)?\b(?! structure| plan|s\b)/.test(j.text), 5],
      ['equity-duty', (j) => /(payroll|securities|equity compensation matters|equity research|equity structures|cap table|private equity)/i.test(j.text), 6],
      ['anthropic-sales', (j) => j.company === 'anthropic' && /account executive|sales|business development|partner|customer success|solutions|GTM|go-to-market/i.test(j.title), 6],
      ['shield-intern', (j) => j.company === 'shieldai' && /intern|part[- ]time|fellow/i.test(j.title), 3],
      ['palantir-lti-only', (j) => j.company === 'palantir' && /long-term incentives/i.test(j.text) && !/Restricted Stock/i.test(j.text) && !/sign-on bonus/i.test(j.text), 4],
      ['openai-commission', (j) => /Offers Commission/.test(fullText(j)), 3],
      ['scale-commission', (j) => /eligible to earn commissions/.test(j.text), 2],
      ['xai-commission', (j) => /\+ commission/.test(j.text), 2],
      ['multi-range', (j) => /Multiple Ranges|\(\d+ ranges\)/.test(fullText(j)), 3],
    ];
    for (const [why, pred, n] of hard) shuffle(all.filter(pred)).slice(0, n).forEach((j) => add(j, why));
  } else {
    const fx = JSON.parse(fs.readFileSync(FIXTURE));
    const dev = new Set(fx.items.filter((x) => x.split === 'dev').map((x) => x.id));
    const pool = all.filter((j) => !dev.has(j.id));
    const shuffle = shuffler(777001);
    const by = {};
    for (const j of pool) (by[j.company] ||= []).push(j);
    for (const arr of Object.values(by)) shuffle(arr).slice(0, 4).forEach((j) => add(j, 'holdout'));
    shuffle(pool).filter((j) => !picked.has(j.id)).slice(0, 40).forEach((j) => add(j, 'holdout'));
  }
  // Print for labelling (label from the windows, before looking at predictions).
  [...picked.values()].forEach((x, i) => {
    console.log(`#${i} ${x.id} | ${x.title} | why=${x.why} | sal=${x.salary?.text || null}`);
    for (const w of windows(fullText(x))) console.log('   - ' + w.slice(0, 300));
  });
}

function evaluate() {
  const fx = JSON.parse(fs.readFileSync(FIXTURE));
  const snap = new Map(loadAll().map((j) => [j.id, j]));
  const stat = {};
  let usedFull = 0;
  for (const x of fx.items) {
    const j = snap.get(x.id);
    const text = j ? fullText(j) : x.excerpt;
    if (j) usedFull++;
    const r = compExtrasEvidence(text, { title: x.title });
    for (const split of [x.split, 'all']) for (const f of ['equity', 'bonus']) {
      const s = (stat[`${split}.${f}`] ||= { tp: 0, fp: 0, fn: 0, tn: 0 });
      s[r[f] ? (x[f] ? 'tp' : 'fp') : (x[f] ? 'fn' : 'tn')]++;
      if (split === 'all' && r[f] !== x[f]) console.log(`${r[f] ? 'FP' : 'FN'} ${f} ${x.id} ${x.title} :: ${r.evidence[f].join(' || ').slice(0, 200)}`);
    }
  }
  console.log(`items ${fx.items.length} (full snapshot text for ${usedFull}, excerpts for the rest)`);
  for (const [k, s] of Object.entries(stat)) console.log(k.padEnd(16), JSON.stringify(s), 'precision', (s.tp / Math.max(1, s.tp + s.fp)).toFixed(3), 'recall', (s.tp / Math.max(1, s.tp + s.fn)).toFixed(3));
}

function audit(f) {
  const per = {};
  const tmpl = new Map();
  for (const j of loadAll()) {
    const r = compExtrasEvidence(fullText(j), { title: j.title });
    const p = (per[j.company] ||= { n: 0, equity: 0, bonus: 0 });
    p.n++; if (r.equity) p.equity++; if (r.bonus) p.bonus++;
    for (const s of r.evidence[f]) {
      const k = s.replace(/[\d$£€.,]+[KkMm]?/g, '#').replace(/\s+/g, ' ').slice(0, 160);
      const e = tmpl.get(k) || { n: 0, ex: s, title: j.title }; e.n++; tmpl.set(k, e);
    }
  }
  console.table(per);
  for (const e of [...tmpl.values()].sort((a, b) => b.n - a.n)) console.log(`[${e.n}] ${e.title} :: ${e.ex.slice(0, 240)}`);
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === 'sample') sample(arg === 'holdout' ? 'holdout' : 'dev');
else if (cmd === 'audit') audit(arg === 'bonus' ? 'bonus' : 'equity');
else evaluate();
