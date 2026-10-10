#!/usr/bin/env node
// Maintenance tool for the freshness registry, data/freshness.json (docs/DATA_FRESHNESS.md).
//
//   node scripts/refresh/registry.js --check              validate the registry (exit 1 on problems)
//   node scripts/refresh/registry.js --sync-tax [--write]  add/update one `tax-<key>` entry per
//                                                         TAX_SOURCES key in server/juice.js
//   node scripts/refresh/registry.js --merge <fragment.json ...> [--write]
//                                                         merge registry entries handed over by
//                                                         an auditor/updater (by id; fields in the
//                                                         fragment win, consumers are unioned)
//   node scripts/refresh/registry.js --lines [--write]     re-resolve "file:line SYMBOL" references
//                                                         whose line moved (owners and consumers), and
//                                                         roll year-suffixed extract constants forward
//   node scripts/refresh/registry.js --summary             counts by type, cadence, mode, before
// Without --write it prints what would change. The registry is data: this tool never
// invents values, it only copies them from the code (TAX_SOURCES) or from fragments.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ROOT, jsonText, isoDate } from './lib.js';
import { validateRegistry } from './run.js';

const REG = path.join(ROOT, 'data', 'freshness.json');

export function readRegistry() { return JSON.parse(fs.readFileSync(REG, 'utf8')); }

/**
 * Tax-year label from TAX_SOURCES (`2026`, `2026/27`, `2026-27`, `FY2026-27`, `YA2026`,
 * `2025 (brackets) / 2026 (SDI)`) -> { taxYear, asOf } where asOf is the first day the
 * encoded rules apply. Fiscal-year starts by jurisdiction (GB 6 Apr, AU/NZ ... ) come from
 * TAX_YEAR_START. Returns asOf null when the label cannot be read.
 */
export const TAX_YEAR_START = Object.freeze({
  GB: '04-06', IN: '04-01', AU: '07-01', NZ: '04-01', HK: '04-01', JP: '01-01', SG: '01-01',
});
export function taxYearOf(label, key) {
  const s = String(label || '');
  const years = [...s.matchAll(/(?:FY|YA)?(\d{4})/g)].map((m) => Number(m[1]));
  if (!years.length) return { taxYear: null, asOf: null };
  const y = Math.min(...years); // a mixed label ("2025 (brackets) / 2026 (SDI)") counts from its oldest part
  const country = String(key).split('-')[0];
  if (/^YA\d{4}/.test(s)) return { taxYear: s, asOf: `${y - 1}-01-01` }; // Singapore: YA2026 taxes 2025 income
  const md = TAX_YEAR_START[country] || '01-01';
  return { taxYear: s, asOf: `${y}-${md}` };
}

const latest = (a, b) => (!b || a > b ? a : b);

/** Registry entries for every TAX_SOURCES key (pure). `existing` keeps hand-written fields. */
export function taxEntries(TAX_SOURCES, existing = new Map(), { today = isoDate() } = {}) {
  const out = [];
  for (const [key, src] of Object.entries(TAX_SOURCES)) {
    const id = `tax-${key.toLowerCase()}`;
    const prev = existing.get(id) || {};
    const { taxYear, asOf } = taxYearOf(src.asOf, key);
    const name = src.name || `${key} tax rules`;
    out.push({
      id,
      group: 'tax',
      description: `Tax rules for ${key}: ${name}`,
      type: 'static-constant-from-a-source',
      owners: prev.owners || [`server/juice.js TAX_SOURCES['${key}']`, `server/juice.js RULES.${key.split('-')[0]}`],
      values: prev.values || name,
      consumers: prev.consumers || [
        { at: 'server/juice.js taxFor()', surface: 'drawer Juice block (Tax line: income / regional / social)' },
        { at: 'public/viz/map.js juiceAt()', surface: 'map (Juice colour mode)' },
        { at: 'public/app.js juice badge, Juice filter and sort', surface: 'list badge, filters' },
        { at: 'docs/LIVABILITY.md §3 tax table', surface: 'methodology page' },
        { at: 'test/juice*.test.js', surface: 'tests (tax golden vectors)' },
      ],
      source: { name, url: src.url, licence: prev.source?.licence || 'official publication (public sector information)' },
      asOf: asOf || prev.asOf || null,
      taxYear,
      cadence: 'yearly',
      graceDays: prev.graceDays ?? 60,
      mode: prev.mode || 'detect',
      updater: prev.updater || 'scripts/refresh/tax.js',
      checklist: prev.checklist || [
        `Open ${src.url} and find the schedule for the next tax year.`,
        `Update the brackets, allowances, caps and rates for ${key} in server/juice.js (RULES / the constants it uses).`,
        `Update TAX_SOURCES['${key}'] (asOf, url, verified: true only after checking the official schedule) and docs/LIVABILITY.md §3.`,
        'Update or add the golden vectors in the tax tests, then npm test.',
        'Run node scripts/refresh/registry.js --sync-tax --write and regenerate the worked examples.',
      ],
      validator: prev.validator || 'scripts/refresh/tax.js (official figures vs encoded, newer tax year published) + test/juice*.test.js golden vectors',
      before: prev.before || 'manual, yearly (docs/LIVABILITY.md §6 step 3); no automatic check',
      // TAX_SOURCES.reviewed is the date the tax rules were last checked against the source.
      lastChecked: /^\d{4}-\d{2}-\d{2}$/.test(String(src.reviewed || '')) ? latest(src.reviewed, prev.lastChecked) : (prev.lastChecked || null),
      verified: !!src.verified,
      archive: true,
      extract: prev.extract || [{ file: 'server/juice.js', const: 'TAX_SOURCES', as: 'TAX_SOURCES' }],
      ...(prev.notes ? { notes: prev.notes } : {}),
      ...(src.verified ? {} : { notes: [prev.notes, 'TAX_SOURCES marks this schedule unverified'].filter(Boolean).join('; ') }),
    });
  }
  return out;
}

/** Merge fragment entries into the registry by id (pure). */
export function mergeEntries(reg, fragment) {
  const out = structuredClone(reg);
  const byId = new Map(out.entries.map((e, i) => [e.id, i]));
  const added = [];
  const updated = [];
  for (const f of fragment) {
    if (!f || !f.id) continue;
    if (byId.has(f.id)) {
      const cur = out.entries[byId.get(f.id)];
      const consumers = [...(cur.consumers || [])];
      for (const c of f.consumers || []) if (!consumers.some((x) => x.at === c.at && x.surface === c.surface)) consumers.push(c);
      const owners = [...new Set([...(cur.owners || []), ...(f.owners || [])])];
      const next = { ...cur };
      for (const [k, v] of Object.entries(f)) {
        const empty = v == null || v === '' || (Array.isArray(v) && !v.length);
        if (empty && cur[k] != null && !(Array.isArray(cur[k]) && !cur[k].length)) continue; // never blank out a value
        if (k === 'checklist' && Array.isArray(v) && Array.isArray(cur[k])) next[k] = [...new Set([...cur[k], ...v])];
        else if (k === 'notes' && typeof v === 'string' && typeof cur[k] === 'string' && !cur[k].includes(v)) next[k] = v.includes(cur[k]) ? v : `${cur[k]} ${v}`;
        else next[k] = v;
      }
      out.entries[byId.get(f.id)] = { ...next, owners, consumers };
      updated.push(f.id);
    } else {
      out.entries.push(f);
      byId.set(f.id, out.entries.length - 1);
      added.push(f.id);
    }
  }
  return { reg: out, added, updated };
}

/**
 * Re-resolve "path:line SYMBOL" references: when SYMBOL is no longer on that line, look
 * for `const|function|let SYMBOL` (or the bare symbol) and update the line number.
 */
export function resolveLines(reg, root = ROOT) {
  const cache = new Map();
  const lines = (f) => {
    if (!cache.has(f)) { try { cache.set(f, fs.readFileSync(path.join(root, f), 'utf8').split('\n')); } catch { cache.set(f, null); } }
    return cache.get(f);
  };
  const moved = [];
  const fix = (ref) => {
    const m = /^([\w./-]+\.\w+):(\d+)\s+([A-Za-z_$][\w$.]*)/.exec(ref);
    if (!m) return ref;
    const [, file, ln, sym] = m;
    const L = lines(file);
    if (!L) return ref;
    const base = sym.split('.')[0];
    if ((L[Number(ln) - 1] || '').includes(base)) return ref;
    let i = L.findIndex((l) => new RegExp(`(?:const|let|var|function|class)\\s+${base.replace(/\$/g, '\\$')}\\b`).test(l));
    if (i < 0) i = L.findIndex((l) => l.includes(base));
    if (i < 0) return ref;
    const next = ref.replace(`${file}:${ln}`, `${file}:${i + 1}`);
    moved.push(`${ref} -> ${file}:${i + 1}`);
    return next;
  };
  const out = structuredClone(reg);
  for (const e of out.entries) {
    e.owners = (e.owners || []).map(fix);
    e.consumers = (e.consumers || []).map((c) => ({ ...c, at: fix(c.at) }));
  }
  return { reg: out, moved };
}

// ---------------------------------------------------------------- generated docs

export const DOC_FILE = path.join(ROOT, 'docs', 'DATA_FRESHNESS.md');
export const DOC_BEGIN = '<!-- freshness:inventory:begin (generated by node scripts/refresh/registry.js --docs --write; do not edit by hand) -->';
export const DOC_END = '<!-- freshness:inventory:end -->';

/** Canonical UI / docs surface for a consumer's free-text surface label. */
export const SURFACES = Object.freeze([
  ['drawer Juice block', /juice block|tax line|waterfall|household switch|juice/i],
  ['chart', /chart/i],
  ['map', /\bmap\b/i],
  ['Same role elsewhere', /same role elsewhere/i],
  ['Compare companies', /compare/i],
  ['Compstimate', /compstimate/i],
  ['Insights', /insights/i],
  ['list, badges, filters', /list|badge|filter|sort|chip|card/i],
  ['drawer (pay, dates, labels)', /drawer|pay label|posting/i],
  ['methodology page', /methodology/i],
  ['README', /readme/i],
  ['OG image, share pages', /og\b|og image|share|preview/i],
  ['docs', /docs?\b|livability|vetting|strategy|contract|process/i],
  ['API / data files', /api|json|server|build|pipeline|archive|data/i],
  ['tests', /test|e2e|golden|fixture/i],
]);
export function surfaceOf(label) {
  for (const [name, re] of SURFACES) if (re.test(String(label || ''))) return name;
  return 'other';
}
const md = (x) => String(x ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const short = (x, n = 90) => { const t = md(x); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const link = (src) => (src && src.url ? `[${short(src.name, 60)}](${src.url})` : short(src && src.name, 60));

/** The generated inventory section of docs/DATA_FRESHNESS.md (pure). */
export function renderInventory(reg) {
  const live = reg.entries.filter((e) => !e.retired);
  const sum = summary(reg);
  const kv = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ');
  const out = [DOC_BEGIN, '', `Generated from \`data/freshness.json\` (updated ${reg.updated}). ${live.length} entries.`, '',
    `- **By type:** ${kv(sum.type)}`, `- **By cadence (how often the source really changes):** ${kv(sum.cadence)}`,
    `- **By mechanism:** ${kv(sum.mode)} (auto = fetch + validate + review PR; detect = compare with the official source and open an issue; manual = checklist with a due date)`,
    `- **Entries that had no update mechanism before this work:** ${sum.noMechanismBefore}`, ''];
  const order = ['daily', 'weekly', 'monthly', 'quarterly', 'semiannual', 'yearly', 'ad-hoc'];
  out.push('### By cadence', '');
  for (const c of order) {
    const rows = live.filter((e) => e.cadence === c);
    if (!rows.length) continue;
    out.push(`#### ${c} (${rows.length})`, '', '| Id | What | Type | Mechanism | Updater | As of | Source |', '|---|---|---|---|---|---|---|');
    for (const e of rows) out.push(`| \`${e.id}\` | ${short(e.description)} | ${e.type} | ${e.mode} | ${short(e.updater, 50)} | ${e.asOf || '-'}${e.taxYear ? ` (tax year ${md(e.taxYear)})` : ''} | ${link(e.source)} |`);
    out.push('');
  }
  out.push('### By surface (where users see it)', '', 'Each dataset is listed under every surface that shows it or computes from it.', '');
  const bySurface = new Map();
  for (const e of live) for (const c of e.consumers || []) {
    const s = surfaceOf(c.surface);
    if (!bySurface.has(s)) bySurface.set(s, new Map());
    const m = bySurface.get(s);
    if (!m.has(e.id)) m.set(e.id, []);
    m.get(e.id).push(c.at);
  }
  const surfOrder = [...SURFACES.map(([n]) => n), 'other'];
  for (const s of surfOrder) {
    const m = bySurface.get(s);
    if (!m) continue;
    out.push(`<details><summary><strong>${s}</strong> (${m.size} datasets)</summary>`, '', '| Id | Where (file:line) |', '|---|---|');
    for (const [id, ats] of [...m.entries()].sort()) out.push(`| \`${id}\` | ${[...new Set(ats)].slice(0, 6).map((a) => `\`${md(a)}\``).join(', ')}${ats.length > 6 ? ` +${ats.length - 6}` : ''} |`);
    out.push('', '</details>', '');
  }
  out.push('### No update mechanism before (and what each has now)', '', '| Id | Before | Now |', '|---|---|---|');
  for (const e of live.filter((x) => /^none/i.test(String(x.before || '')))) out.push(`| \`${e.id}\` | ${short(e.before, 70)} | ${e.mode}: ${short(e.updater, 60)} |`);
  out.push('', '### Every entry', '');
  for (const e of live) {
    out.push(`<details><summary><code>${e.id}</code>: ${short(e.description, 120)}</summary>`, '');
    out.push(`- **Type / cadence / mechanism:** ${e.type} · ${e.cadence}${e.graceDays != null ? ` (+${e.graceDays} days grace)` : ''} · ${e.mode} via \`${md(e.updater)}\``);
    out.push(`- **Values:** ${short(e.values, 400)}`);
    out.push(`- **As of:** ${e.asOf || '-'}${e.taxYear ? ` · tax year ${md(e.taxYear)}` : ''} · last checked ${e.lastChecked || '-'}`);
    out.push(`- **Source:** ${link(e.source)}${e.source && e.source.licence ? ` (${short(e.source.licence, 120)})` : ''}`);
    out.push(`- **Defined in:** ${(e.owners || []).map((o) => `\`${md(o)}\``).join(', ')}`);
    out.push(`- **Used in:** ${(e.consumers || []).map((c) => `\`${md(c.at)}\` (${md(c.surface)})`).join('; ')}`);
    out.push(`- **Validator:** ${short(e.validator, 400)}`);
    out.push(`- **Before:** ${short(e.before, 300)}`);
    if (e.checklist && e.checklist.length) { out.push('- **Checklist:**'); for (const s2 of e.checklist) out.push(`  - [ ] ${md(s2)}`); }
    if (e.notes) out.push(`- **Notes:** ${short(e.notes, 600)}`);
    out.push('', '</details>', '');
  }
  out.push(DOC_END);
  return out.join('\n');
}

/** Replace the generated block in the doc text (or append it). */
export function spliceInventory(docText, block) {
  const i = docText.indexOf(DOC_BEGIN);
  const j = docText.indexOf(DOC_END);
  if (i >= 0 && j > i) return docText.slice(0, i) + block + docText.slice(j + DOC_END.length);
  return `${docText.replace(/\s*$/, '')}\n\n${block}\n`;
}

/**
 * Re-point archive extracts whose year-suffixed constant was rolled over by a tax-year update
 * (e.g. FR_PASS_2025 -> FR_PASS_2026, US_FED_2026 -> US_FED_2027): when `const NAME_YYYY` is
 * gone and the same name with another year exists, use the newest one. Pure on the registry;
 * reads the source files. -> { reg, renamed: ['id: OLD -> NEW'] }
 */
export function rollExtracts(reg, root = ROOT) {
  const out = structuredClone(reg);
  const renamed = [];
  const srcCache = new Map();
  const src = (f) => { if (!srcCache.has(f)) { try { srcCache.set(f, fs.readFileSync(path.join(root, f), 'utf8')); } catch { srcCache.set(f, null); } } return srcCache.get(f); };
  for (const e of out.entries) for (const spec of e.extract || []) {
    const m = spec.const && /^(.*_)(\d{4})$/.exec(spec.const);
    const text = m && src(spec.file);
    if (!text || new RegExp(`(?:const|let|var)\\s+${spec.const}\\b`).test(text)) continue;
    const years = [...text.matchAll(new RegExp(`(?:const|let|var)\\s+${m[1]}(\\d{4})\\b`, 'g'))].map((x) => x[1]).sort();
    if (!years.length) continue;
    const next = `${m[1]}${years[years.length - 1]}`;
    renamed.push(`${e.id}: ${spec.const} -> ${next}`);
    if (spec.as === spec.const) spec.as = next;
    spec.const = next;
  }
  return { reg: out, renamed };
}

export function summary(reg) {
  const by = (k) => reg.entries.reduce((m, e) => { const v = e[k] ?? '-'; m[v] = (m[v] || 0) + 1; return m; }, {});
  const noneBefore = reg.entries.filter((e) => /^none/i.test(String(e.before || ''))).map((e) => e.id);
  return { entries: reg.entries.length, type: by('type'), cadence: by('cadence'), mode: by('mode'), group: by('group'), noMechanismBefore: noneBefore.length };
}

async function main(argv) {
  const write = argv.includes('--write');
  let reg = readRegistry();
  const before = jsonText(reg);
  if (argv.includes('--check')) {
    const p = validateRegistry(reg);
    for (const x of p) console.log(`problem: ${x}`);
    console.log(p.length ? `${p.length} problem(s)` : `registry ok (${reg.entries.length} entries)`);
    return p.length ? 1 : 0;
  }
  if (argv.includes('--summary')) { console.log(JSON.stringify(summary(reg), null, 2)); return 0; }
  if (argv.includes('--docs')) {
    const cur = fs.readFileSync(DOC_FILE, 'utf8');
    const next = spliceInventory(cur, renderInventory(reg));
    if (next === cur) { console.log('docs/DATA_FRESHNESS.md inventory up to date'); return 0; }
    if (write) { fs.writeFileSync(DOC_FILE, next); console.log('wrote docs/DATA_FRESHNESS.md inventory'); return 0; }
    console.log('docs/DATA_FRESHNESS.md inventory is out of date (add --write)');
    return 1;
  }
  if (argv.includes('--sync-tax')) {
    const { TAX_SOURCES } = await import(pathToFileURL(path.join(ROOT, 'server', 'juice.js')).href);
    const existing = new Map(reg.entries.map((e) => [e.id, e]));
    const tax = taxEntries(TAX_SOURCES, existing);
    const ids = new Set(tax.map((e) => e.id));
    const stale = reg.entries.filter((e) => e.group === 'tax' && !ids.has(e.id) && !e.retired);
    for (const e of stale) { e.retired = isoDate(); console.log(`retired ${e.id} (no longer in TAX_SOURCES)`); }
    ({ reg } = mergeEntries(reg, tax));
    console.log(`tax entries: ${tax.length}`);
  }
  const mi = argv.indexOf('--merge');
  if (mi >= 0) {
    for (const f of argv.slice(mi + 1).filter((a) => !a.startsWith('--'))) {
      const frag = JSON.parse(fs.readFileSync(f, 'utf8'));
      const r = mergeEntries(reg, Array.isArray(frag) ? frag : frag.entries || []);
      reg = r.reg;
      console.log(`${f}: added ${r.added.length}, updated ${r.updated.length}`);
    }
  }
  if (argv.includes('--lines')) {
    const r = resolveLines(reg);
    reg = r.reg;
    for (const m of r.moved) console.log(`moved: ${m}`);
    const x = rollExtracts(reg);
    reg = x.reg;
    for (const m of x.renamed) console.log(`extract rolled over: ${m}`);
  }
  const after = jsonText({ ...reg, updated: jsonText(reg) === before ? reg.updated : isoDate() });
  if (after === before) { console.log('no change'); return 0; }
  const p = validateRegistry(JSON.parse(after));
  for (const x of p.slice(0, 30)) console.log(`problem: ${x}`);
  if (write) { fs.writeFileSync(REG, after); console.log(`wrote ${path.relative(process.cwd(), REG)}`); } else console.log('(dry run; add --write)');
  return 0;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { console.error(e.stack || e); process.exit(2); });
