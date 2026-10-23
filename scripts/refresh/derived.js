// Monthly refresh, updater module "derived": generated docs, counts, the methodology
// page, the share card and the tests that pin data values (docs/DATA_FRESHNESS.md).
//
// It runs LAST (scripts/refresh/run.js MODULE_ORDER), and reads every file through the
// orchestrator's overlay, so the tables it generates use the FX, Big Mac and rent values
// an earlier module just wrote. server/juice.js and data/cities.json are loaded from the
// overlay too (copied to a temp dir and imported), never from a stale disk copy.
//
// Two mechanisms:
//   auto    marker blocks in Markdown,
//             <!-- freshness:begin juice-worked-examples/single -->
//             ...generated...
//             <!-- freshness:end juice-worked-examples/single -->
//           regenerated from the code (scripts/refresh/examples.js); a difference is
//           'changed' with `writes`. A doc without the markers yet is checked in detect
//           mode instead (the hand-written table must equal the generated one).
//   detect  hand-written figures (README / docs counts, constants quoted in prose),
//           each a rule { file, re (capture groups), expect(facts) }; a mismatch is
//           'drift' with the encoded and computed values; a rule whose anchor text
//           is gone is 'error' (the rule no longer checks anything; fix the rule).
//
// Registry ids (data/freshness.json; also the archive's dataset keys):
//   readme-counts, docs-counts, juice-worked-examples, juice-calibration-doc,
//   methodology-page, og-card, e2e-pinned-values. (share-pages is rebuilt by every
//   Pages build from the day's snapshots; the orchestrator's pipeline handler covers it.)
//
// Also exported for the site: publicFreshness(registry) -> the client-safe subset that
// scripts/build-static.js publishes as api/freshness.json and server/index.js serves at
// /api/freshness (public/features/freshness.js reads it for the "as of" labels).
//
// CLI (helpers for humans; nothing here writes files):
//   node scripts/refresh/derived.js --insert-markers docs/LIVABILITY.md > out.md
//       the doc with the generated blocks wrapped in markers (idempotent; re-apply after edits)
//   node scripts/refresh/derived.js --og-hashes > test/fixtures/refresh/derived/og-render.json
//       record the share card's source and PNG hashes after re-rendering it (scripts/build-og.mjs)
//   node scripts/refresh/derived.js --public data/freshness.json
//       print the published subset
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { result, errorResult, staleness, isPipelineEntry, isoDate, addDays, extractConst, ROOT } from './lib.js';
import * as EX from './examples.js';

export const MODULE = Object.freeze({
  name: 'derived',
  ids: ['readme-counts', 'docs-counts', 'juice-worked-examples', 'juice-calibration-doc', 'methodology-page', 'og-card', 'e2e-pinned-values'],
});

export const LIVABILITY = 'docs/LIVABILITY.md';
export const OG_CARD = 'public/og/card.html';
export const OG_PNG = 'public/og/melon-seek-og.png';
export const OG_MANIFEST = 'test/fixtures/refresh/derived/og-render.json';

// ---------------------------------------------------------------- marker blocks

const BEGIN = (id) => `<!-- freshness:begin ${id} -->`;
const END = (id) => `<!-- freshness:end ${id} -->`;
const BLOCK_RE = /<!-- freshness:begin ([\w./-]+) -->\n([\s\S]*?)\n<!-- freshness:end ([\w./-]+) -->/g;

/** Marker blocks in a text: [{ id, content (trimmed), start, end, closedBy }]. */
export function parseBlocks(text) {
  const out = [];
  for (const m of String(text).matchAll(BLOCK_RE)) out.push({ id: m[1], content: m[2].trim(), start: m.index, end: m.index + m[0].length, closedBy: m[3] });
  return out;
}

/**
 * Keep a hand-edited table header (e.g. "Verified 2026-10-02") when it has the generated
 * header's prefix and column count: the header is prose, the rows are data.
 */
export function keepHeader(id, generated, old) {
  const prefix = EX.HEADER_PREFIX[id];
  const head = (EX.HEADERS[id] || [])[0];
  if (!prefix || !head || !old) return generated;
  const cols = (l) => l.split('|').length;
  const prev = String(old).split('\n').find((l) => l.startsWith(prefix));
  if (!prev || prev === head || cols(prev) !== cols(head)) return generated;
  return generated.split('\n').map((l) => (l === head ? prev : l)).join('\n');
}

/** A complete block (markers + content with blank lines around it, as written to the docs). */
export function blockText(id, content) { return `${BEGIN(id)}\n\n${content.trim()}\n\n${END(id)}`; }

/**
 * Regenerate every marker block whose id `render` knows.
 * -> { text, changed: [ids], unknown: [ids], mismatched: [ids] }
 */
export function replaceBlocks(text, render) {
  const changed = [];
  const unknown = [];
  const mismatched = [];
  const out = String(text).replace(BLOCK_RE, (whole, id, content, closer) => {
    if (closer !== id) { mismatched.push(id); return whole; }
    let next;
    try { next = render(id); } catch (err) { if (err && err.code === 'UNKNOWN_BLOCK') { unknown.push(id); return whole; } throw err; }
    if (next == null) { unknown.push(id); return whole; }
    next = keepHeader(id, next, content);
    if (next.trim() !== content.trim()) changed.push(id);
    return blockText(id, next);
  });
  return { text: out, changed, unknown, mismatched };
}

/** Lines of the table whose header starts with `prefix` (header and separator included), or null. */
function findTable(lines, prefix) {
  const i = lines.findIndex((l) => l.startsWith(prefix));
  if (i < 0) return null;
  let j = i;
  while (j < lines.length && lines[j].startsWith('|')) j++;
  return { start: i, end: j }; // [start, end)
}

/**
 * Wrap the generated tables of docs/LIVABILITY.md in marker blocks (idempotent: a block
 * that already has markers is left alone), then fill them with `render(id)`. This is how
 * the marker patch was made, and how to re-apply it after someone edits the doc.
 */
export function insertMarkers(text, render, blocks = EX.BLOCKS) {
  const present = new Set(parseBlocks(text).map((b) => b.id));
  let lines = String(text).split('\n');
  for (const id of blocks) {
    if (present.has(id)) continue;
    const t = findTable(lines, EX.HEADER_PREFIX[id]);
    if (!t) continue;
    let { start, end } = t;
    let tail = [];
    if (id === 'juice-worked-examples/household') {
      // Take the "**By household** (...):" caption above the table into the block.
      let k = start - 1;
      while (k >= 0 && !lines[k].trim()) k--;
      let p = k;
      while (p > 0 && lines[p - 1].trim()) p--;
      if (k >= 0 && lines[p].startsWith('**By household**')) start = p;
    }
    if (id === 'juice-worked-examples/single') {
      // The heading keeps no date: the generated caption carries the as-of.
      for (let k = start - 1; k >= 0 && k >= start - 3; k--) {
        if (/^### Worked examples\b/.test(lines[k])) { lines[k] = '### Worked examples (generated from the code)'; break; }
      }
    }
    if (id === 'juice-worked-examples/score-legend') {
      // Take "Other legend points: ... 100 = $X." into the block; the rest of that paragraph stays after it.
      let k = end;
      while (k < lines.length && !lines[k].trim()) k++;
      if (k < lines.length && lines[k].startsWith('Other legend points:')) {
        let e = k;
        while (e < lines.length && lines[e].trim()) e++;
        const para = lines.slice(k, e).join('\n');
        const m = /^Other legend points:[\s\S]*?\b100 = \$[\d,]+\./.exec(para);
        if (m) {
          const rest = para.slice(m[0].length).replace(/^\s+/, '');
          tail = rest ? ['', ...rest.split('\n')] : [];
          end = e;
        }
      }
    }
    const block = blockText(id, keepHeader(id, render(id), lines.slice(start, end).join('\n'))).split('\n');
    lines = [...lines.slice(0, start), ...block, ...tail, ...lines.slice(end)];
  }
  return lines.join('\n');
}

/** Detect mode for a block that has no markers yet: the doc's table vs the generated rows. */
export function compareUnmarked(text, id, juice, cities) {
  const lines = String(text).split('\n');
  const t = findTable(lines, EX.HEADER_PREFIX[id]);
  if (!t) return { found: false, findings: [] };
  const docRows = lines.slice(t.start + 2, t.end);
  const want = EX.expectedRows(id, juice, cities).map((cells) => `| ${cells.join(' | ')} |`);
  const findings = [];
  for (let k = 0; k < Math.max(docRows.length, want.length); k++) {
    if (docRows[k] !== want[k]) findings.push({ key: `${id} row ${k + 1}`, encoded: docRows[k] ?? '(missing)', official: want[k] ?? '(not generated)', unit: 'table row', url: null, note: 'docs/LIVABILITY.md differs from the code' });
  }
  if (id === 'juice-worked-examples/score-legend') {
    const flat = String(text).replace(/\s+/g, ' ');
    const sentence = EX.legendSentence(juice);
    if (!flat.includes(sentence)) {
      const m = /Other legend points:[^.]*?100 = \$[\d,]+\./.exec(flat);
      findings.push({ key: `${id} legend points`, encoded: m ? m[0] : '(missing)', official: sentence, unit: 'sentence', url: null, note: 'rounded-score thresholds (examples.js netForShownScore)' });
    }
  }
  return { found: true, findings };
}

// ---------------------------------------------------------------- loading code from the overlay

/**
 * Import repo modules as the overlay sees them (pending writes included): the files are
 * copied to a temp dir with their relative layout and the first one is imported.
 */
export async function importFromOverlay(ctx, rels) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'refresh-derived-'));
  try {
    fs.writeFileSync(path.join(dir, 'package.json'), '{ "type": "module" }\n');
    for (const rel of rels) {
      const f = path.join(dir, rel);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, ctx.readText(rel));
    }
    return await import(pathToFileURL(path.join(dir, rels[0])).href);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- facts the rules compare against

const int = (n) => Math.round(n).toLocaleString('en-US');
const sorted = (list) => [...list].map((s) => String(s).trim()).filter(Boolean).sort((a, b) => a.localeCompare(b)).join(', ');
/** "A, B and C" / "A, B, and C" -> ['A', 'B', 'C']. */
export function nameList(s) { return String(s).replace(/\s+/g, ' ').split(/,\s*(?:and\s+)?|\s+and\s+/).map((x) => x.trim()).filter(Boolean); }
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function countBy(list, fn) { const m = new Map(); for (const x of list) { const k = fn(x); m.set(k, (m.get(k) || 0) + 1); } return m; }

/** Everything the detect rules compare against, computed from code and data (no network). */
export async function loadFacts(ctx) {
  const F = { errors: [] };
  const read = (rel) => { try { return ctx.readText(rel); } catch { return null; } };
  try { F.cities = ctx.readJson('data/cities.json'); } catch (err) { F.errors.push(`data/cities.json: ${err.message}`); }
  try { F.juice = await importFromOverlay(ctx, ['server/juice.js', 'server/geo.js']); } catch (err) { F.errors.push(`server/juice.js: ${err.message}`); }
  try { F.companiesMod = await importFromOverlay(ctx, ['server/companies.js']); } catch (err) { F.errors.push(`server/companies.js: ${err.message}`); }
  const src = (rel) => read(rel) || '';
  F.const = (rel, name) => { const s = read(rel); return s == null ? undefined : extractConst(s, name); };
  F.read = read;

  if (F.cities && Array.isArray(F.cities.cities)) {
    const list = F.cities.cities;
    const S = (c, f) => (c.sources && c.sources[f]) || {};
    F.cityCount = list.length;
    F.usCount = list.filter((c) => c.country === 'US').length;
    F.bigMacCountries = Object.keys((F.cities.bigMac && F.cities.bigMac.byCountry) || {}).length;
    F.bigMacAsOf = (F.cities.bigMac && F.cities.bigMac.asOf) || null;
    F.rent2Official = list.filter((c) => S(c, 'rent2brCenterLocal').class === 'official').length;
    F.rent2Estimate = list.filter((c) => S(c, 'rent2brCenterLocal').class === 'estimate').length;
    F.pooled = list.filter((c) => S(c, 'rent2brCenterLocal').ratioKey === 'pooled').length;
    F.proxies = list.filter((c) => S(c, 'costIndex').estimated && /^proxy\b/i.test(S(c, 'costIndex').method || '')).length;
    F.comparisonDerived = list.filter((c) => S(c, 'costIndex').estimated && !/^proxy\b/i.test(S(c, 'costIndex').method || '')).length;
    F.numbeoFields = list.reduce((n, c) => n + ['rent1brCenterLocal', 'rent1brOutsideLocal', 'costIndex'].filter((f) => S(c, f).terms === 'numbeo-terms').length, 0);
    const numbeoRent = list.map((c) => S(c, 'rent1brCenterLocal')).filter((s) => s.terms === 'numbeo-terms' || s.class === 'aggregator');
    const months = numbeoRent.map((s) => String(s.asOf || '').slice(0, 7)).filter(Boolean).sort();
    const modes = [...countBy(months, (m) => m)].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    F.rentMonths = { min: months[0] || null, max: months[months.length - 1] || null, total: numbeoRent.length, mode: modes[0] ? modes[0][0] : null, modeCount: modes[0] ? modes[0][1] : 0 };
    F.baselineMonthly = F.cities.baseline && F.cities.baseline.monthlyUSD;
    F.baselineAnnual = F.cities.baseline && F.cities.baseline.nycBasketUSD;
    const syd = list.find((c) => /^sydney-/.test(c.key));
    F.sydney = syd ? { rent1: syd.rent1brCenterLocal, replaced: S(syd, 'rent1brCenterLocal').replaced && S(syd, 'rent1brCenterLocal').replaced.value } : null;
  }
  if (F.juice && F.cities) {
    const J = F.juice;
    F.scales = Object.fromEntries((J.HOUSEHOLD_KEYS || []).map((k) => [k, J.livingScaleFor(k)]));
    F.K = J.SCORE_ANCHORS.K;
    F.curve = J.SCORE_ANCHORS.curve;
    F.fullGlass = J.SCORE_ANCHORS.fullGlassUSD;
    F.gradeMins = J.GRADES.map((g) => g.min).filter((m) => m > 0).sort((a, b) => a - b);
    F.fxAsOf = J.FX_AS_OF;
    F.nycBasketCode = J.NYC_BASKET_USD;
    const conf = { usMedium: 0, usLow: 0, usHigh: 0, nonUsLow: 0, nonUsOther: 0 };
    for (const c of F.cities.cities) {
      let j;
      try { j = J.computeJuice(200000, c, { baselineUSD: F.cities.baseline && F.cities.baseline.nycBasketUSD }); } catch { continue; }
      if (c.country === 'US') conf[j.confidence === 'medium' ? 'usMedium' : j.confidence === 'low' ? 'usLow' : 'usHigh']++;
      else conf[j.confidence === 'low' ? 'nonUsLow' : 'nonUsOther']++;
    }
    F.confidence = conf;
  }
  if (F.companiesMod) {
    const stable = F.companiesMod.listCompanies();
    const all = F.companiesMod.listCompanies({ channel: 'beta' });
    F.stable = stable;
    F.beta = all.filter((c) => c.channel === 'beta');
  }
  F.backtest = F.const('server/index.js', 'BACKTEST_OPTS');
  F.listBudget = F.const('scripts/build-static.js', 'LIST_BUDGET');
  F.marketMax = F.const('scripts/build-static.js', 'MARKET_MAX_BYTES');
  F.marketMinN = F.const('scripts/build-market.js', 'MIN_N');
  F.freshTtl = F.const('server/cache.js', 'FRESH_TTL_MS');
  F.freshness = F.const('server/history.js', 'FRESHNESS');
  try { F.engines = JSON.parse(src('package.json')).engines; } catch { F.engines = null; }
  try { const m = /^\s*node:\s*\[([^\]]+)\]/m.exec(src('.github/workflows/ci.yml')); F.ciNode = m ? m[1].split(',').map((x) => x.trim()) : null; } catch { F.ciNode = null; }
  const snap = src('.github/workflows/snapshot.yml');
  // retention-days of the upload step that names this artifact (within that step only).
  const ret = (name) => { const m = new RegExp(`\\n\\s+name: ${name}[ \\t]*(?=\\n)(?:(?!\\n\\s*- )[\\s\\S])*?retention-days: (\\d+)`).exec(snap); return m ? Number(m[1]) : null; };
  F.retention = { snapshots: ret('job-board-snapshots'), ledger: ret('history-ledger') };
  return F;
}

// ---------------------------------------------------------------- detect rules

const need = (v, what) => { if (v == null || (typeof v === 'number' && !Number.isFinite(v))) throw new Error(`${what} unavailable`); return v; };
const monthName = (iso) => { const m = /^(\d{4})-(\d{2})/.exec(String(iso || '')); return m ? `${MONTH_NAMES[Number(m[2]) - 1]} ${m[1]}` : null; };
const scale = (x) => String(Number(need(x, 'living scale').toFixed(2)));

/**
 * Hand-written figures in README.md. Each: { key, file, re, expect(F) -> string | string[],
 * norm?(captures) -> string | string[], note }. Captures and expectations compare as strings.
 */
export const README_RULES = Object.freeze([
  { key: 'cities in api/cities.json', file: 'README.md', re: /the Juice Score inputs \((\d[\d,]*) cities\)/, expect: (F) => int(need(F.cityCount, 'city count')) },
  { key: 'built-in companies (intro)', file: 'README.md', re: /\*\*Company switcher\*\* — built-in ([\s\S]*?),\s+plus\b/, norm: ([s]) => sorted(nameList(s)), expect: (F) => sorted(need(F.stable, 'companies').map((c) => c.name)), note: 'server/companies.js listCompanies() (stable channel)' },
  { key: 'built-in companies (API reference)', file: 'README.md', re: /Built-ins: ([\s\S]*?)\.\s+Stable companies/, norm: ([s]) => sorted([...s.matchAll(/`([a-z0-9_-]+)`\s*\(([a-z]+)\/`([^`]+)`\)/g)].map((m) => `${m[1]} ${m[2]}/${m[3]}`)), expect: (F) => sorted(need(F.stable, 'companies').map((c) => `${c.slug} ${c.source}/${c.board}`)), note: 'slug, source and board of every stable built-in' },
  { key: 'beta big-tech companies', file: 'README.md', re: /big-tech career sites \(([^;]+);/, norm: ([s]) => sorted(nameList(s)), expect: (F) => sorted(need(F.beta, 'beta companies').map((c) => c.name)), note: 'listCompanies({ channel: "beta" }) minus the stable ones' },
  { key: 'Compstimate backtest seed and size', file: 'README.md', re: /seed (\d+), up to (\d+)\s+jobs/, expect: (F) => [String(need(F.backtest, 'BACKTEST_OPTS').seed), String(F.backtest.maxN)], note: 'server/index.js BACKTEST_OPTS' },
  { key: 'per-company list budget (MB)', file: 'README.md', re: /Each list is kept under ([\d.]+) MB/, expect: (F) => String(need(F.listBudget, 'LIST_BUDGET') / 1e6), note: 'scripts/build-static.js LIST_BUDGET' },
  { key: 'list budget, real-data sentence (MB)', file: 'README.md', re: /every list is under ([\d.]+) MB/, expect: (F) => String(need(F.listBudget, 'LIST_BUDGET') / 1e6) },
  { key: 'market.json cap (kB)', file: 'README.md', re: /Vetted base-pay ranges only, ≤ (\d+) kB/, expect: (F) => String(need(F.marketMax, 'MARKET_MAX_BYTES') / 1000), note: 'scripts/build-static.js MARKET_MAX_BYTES' },
  { key: 'board cache TTL (minutes, responsible use)', file: 'README.md', re: /caches each board for \*\*(\d+) minutes\*\*/, expect: (F) => String(need(F.freshTtl, 'FRESH_TTL_MS') / 60000), note: 'server/cache.js FRESH_TTL_MS' },
  { key: 'board cache TTL (minutes, data modes)', file: 'README.md', re: /A fetch younger than (\d+) minutes exists/, expect: (F) => String(need(F.freshTtl, 'FRESH_TTL_MS') / 60000) },
  { key: 'snapshot artifact retention (days)', file: 'README.md', re: /artifact\s+\*\*`job-board-snapshots`\*\*, kept for (\d+) days/, expect: (F) => String(need(F.retention.snapshots, 'snapshot.yml retention')), note: '.github/workflows/snapshot.yml' },
  { key: 'ledger artifact retention (days)', file: 'README.md', re: /\*\*(\d+)-day retention\*\*/, expect: (F) => String(need(F.retention.ledger, 'snapshot.yml ledger retention')), note: '.github/workflows/snapshot.yml' },
  { key: 'minimum Node version', file: 'README.md', re: /Node >= (\d+), one runtime dependency/, expect: (F) => (/(\d+)/.exec(need(F.engines && F.engines.node, 'package.json engines.node')) || [])[1] },
  { key: 'CI Node matrix', file: 'README.md', re: /runs the tests on Node (\d+) and (\d+)/, expect: (F) => need(F.ciNode, '.github/workflows/ci.yml matrix.node'), note: '.github/workflows/ci.yml strategy.matrix.node (runtime-versions)' },
  {
    key: 'share-page title example (format)', file: 'README.md', re: /title, such as "([^"]+)"/,
    // Illustrative (a real title on some day); only its shape must match scripts/build-static.js#sharePage.
    norm: ([s]) => (/^(.+) jobs by salary · [\d,]+ roles? · median \$\d+(?:\.\d)?[KM]$/.test(s.replace(/\s+/g, ' ')) ? 'format ok' : `unexpected format: ${s}`),
    expect: () => 'format ok', note: 'illustrative example; the numbers are a dated sample, the format must match the share pages',
  },
]);

/** Hand-written figures in docs/** (LIVABILITY, CONTRACT). Same rule shape as README_RULES. */
export const DOCS_RULES = Object.freeze([
  { key: 'cities (header)', file: LIVABILITY, re: /\(\.\.\/data\/cities\.json\) \((\d+) cities\)/, expect: (F) => String(need(F.cityCount, 'city count')) },
  { key: 'cities (§4)', file: LIVABILITY, re: /## 4\. Data: `data\/cities\.json`\s+(\d+) cities:/, expect: (F) => String(need(F.cityCount, 'city count')) },
  { key: 'cities (limitations)', file: LIVABILITY, re: /outside the (\d+) cities get no juice/, expect: (F) => String(need(F.cityCount, 'city count')) },
  { key: 'cities (coverage plan)', file: LIVABILITY, re: /\*\*Resulting coverage\*\* \((\d+) cities\)/, expect: (F) => String(need(F.cityCount, 'city count')) },
  { key: 'formula: NYC basket and household scales', file: LIVABILITY, re: /NYC basket = \$([\d,]+) \/ year for one person; scale ([\d.]+) · ([\d.]+) · ([\d.]+)/, expect: (F) => [int(need(F.nycBasketCode, 'NYC_BASKET_USD')), scale(F.scales.single), scale(F.scales.couple), scale(F.scales.family)], note: 'server/juice.js NYC_BASKET_USD, livingScaleFor()' },
  { key: 'household table: couple scale', file: LIVABILITY, re: /\| `couple` \| 2 adults \| 2-bedroom, city centre \| ([\d.]+) \|/, expect: (F) => scale(F.scales.couple) },
  { key: 'household table: family scale', file: LIVABILITY, re: /\| `family` \| [^|]+\| 3-bedroom, city centre \| ([\d.]+) \|/, expect: (F) => scale(F.scales.family) },
  { key: 'scale comparison: scale used', file: LIVABILITY, re: /\| \*\*Scale used\*\* \(DWP after-housing-costs, rescaled\) \| \*\*([\d.]+)\*\* \| \*\*([\d.]+)\*\* \|/, expect: (F) => [scale(F.scales.couple), scale(F.scales.family)] },
  { key: 'formula: score curve K', file: LIVABILITY, re: /score\s+= 100 × \(1 − e\^\(−net \/ \$([\d,]+)\)\)/, expect: (F) => int(need(F.K, 'SCORE_ANCHORS.K')) },
  { key: 'score curve anchor K (prose)', file: LIVABILITY, re: /\*\*K = \$([\d,]+)\*\* of annual juice/, expect: (F) => int(need(F.K, 'SCORE_ANCHORS.K')) },
  { key: 'full glass net', file: LIVABILITY, re: /A rounded \*\*100 needs at least \$([\d,]+) net\*\*/, expect: (F) => int(need(F.fullGlass, 'fullGlassUSD')) },
  { key: 'SCORE_ANCHORS literal', file: LIVABILITY, re: /`SCORE_ANCHORS = \{ curve: '(\w+)', K: (\d+),\s+fullGlassUSD: (\d+) \}`/, expect: (F) => [need(F.curve, 'curve'), String(F.K), String(F.fullGlass)] },
  { key: 'grade boundaries', file: LIVABILITY, re: /The score boundaries \((\d+) \/ (\d+)\)/, expect: (F) => need(F.gradeMins, 'GRADES').map(String) },
  { key: 'confidence counts', file: LIVABILITY, re: /US cities are medium \((\d+)\) or low \((\d+):[^)]*\);\s+all (\d+) non-US cities are low/, expect: (F) => { const c = need(F.confidence, 'confidence'); return [String(c.usMedium), String(c.usLow), String(c.nonUsOther ? `${c.nonUsLow} (+${c.nonUsOther} not low)` : c.nonUsLow)]; }, note: 'computeJuice() confidence for every city' },
  { key: 'Big Mac countries and release', file: LIVABILITY, re: /All (\d+) countries in the\s+dataset are in the (\d{4}-\d{2}-\d{2}) release/, expect: (F) => [String(need(F.bigMacCountries, 'bigMac.byCountry')), need(F.bigMacAsOf, 'bigMac.asOf')] },
  // the sources-table row: `bigMacUSD` alone since FX has its own row (freshness-lead-livability-refresh.diff), or the older combined row
  { key: 'Big Mac release (sources table)', file: LIVABILITY, re: /\| `bigMacUSD`(?:, `fxPerUSD`, `\*USD` conversions)? \|[^\n]*?\| release (\d{4}-\d{2}-\d{2}) \|/, expect: (F) => need(F.bigMacAsOf, 'bigMac.asOf') },
  { key: 'bedroom rents: direct (official) cities', file: LIVABILITY, re: /\*\*Direct \(official, (\d+) city\)\.\*\*/, expect: (F) => String(need(F.rent2Official, 'rent classes')) },
  { key: 'bedroom rents: ratio (estimate) cities', file: LIVABILITY, re: /\*\*Ratio \(estimate, (\d+) cities\)\.\*\*/, expect: (F) => String(need(F.rent2Estimate, 'rent classes')) },
  { key: 'bedroom rents: pooled-ratio cities (§4.2)', file: LIVABILITY, re: /\*\*Everyone else \((\d+) cities:/, expect: (F) => String(need(F.pooled, 'pooled')) },
  { key: 'bedroom rents: pooled-ratio cities (sources)', file: LIVABILITY, re: /same \((\d+) other cities\)/, expect: (F) => String(need(F.pooled, 'pooled')) },
  { key: 'US cities (sources table)', file: LIVABILITY, re: /\(US, (\d+) cities\)/, expect: (F) => String(need(F.usCount, 'US count')) },
  { key: 'US cities (Numbeo plan)', file: LIVABILITY, re: /\| US rent \((\d+) cities\)/, expect: (F) => String(need(F.usCount, 'US count')) },
  { key: 'Numbeo rent page months', file: LIVABILITY, re: /page month, (\d{4}-\d{2}) to (\d{4}-\d{2}) \((\d+) of (\d+) are (\d{4}-\d{2})\)/, expect: (F) => { const r = need(F.rentMonths, 'rent months'); return [r.min, r.max, String(r.modeCount), String(r.total), r.mode]; }, note: 'sources.rent1brCenterLocal.asOf of the Numbeo-sourced cities' },
  { key: 'NYC basket arithmetic', file: LIVABILITY, re: /\$([\d,.]+)\/month × 12 = \*\*\$([\d,]+)\*\*/, expect: (F) => [Number(need(F.baselineMonthly, 'baseline.monthlyUSD')).toLocaleString('en-US', { maximumFractionDigits: 1 }), int(need(F.baselineAnnual, 'baseline.nycBasketUSD'))] },
  { key: 'cost-index metro proxies', file: LIVABILITY, re: /\*\*Metro proxy \((\d+) cities\)\.\*\*/, expect: (F) => String(need(F.proxies, 'proxies')) },
  { key: 'cost-index comparison-derived', file: LIVABILITY, re: /\*\*Comparison-derived \((\d+) cities\)\.\*\*/, expect: (F) => String(need(F.comparisonDerived, 'comparison-derived')) },
  { key: 'Numbeo figures to replace', file: LIVABILITY, re: /That is\s+(\d+) figures plus 1/, expect: (F) => String(need(F.numbeoFields, 'numbeo fields')), note: 'fields with terms "numbeo-terms" (centre rent, outside rent, cost index)' },
  // Only the pre-refresh sentence states a month; the current text names FX_AS_OF instead (no rule needed).
  { key: 'FX table month', file: LIVABILITY, optional: true, re: /set to the\s+Big Mac data's (\w+ \d{4}) `dollar_ex`/, expect: (F) => need(monthName(F.fxAsOf), 'FX_AS_OF'), note: 'server/juice.js FX_AS_OF' },
  { key: 'Sydney official 1-bedroom rent', file: LIVABILITY, re: /official one, A\$([\d,]+) instead of A\$([\d,]+)\)/, expect: (F) => { const s = need(F.sydney, 'Sydney'); return [int(s.rent1), int(need(s.replaced, 'replaced'))]; } },
  { key: 'market.json cap (KB)', file: 'docs/CONTRACT.md', re: /`api\/market\.json` \(≤(\d+) KB/, expect: (F) => String(need(F.marketMax, 'MARKET_MAX_BYTES') / 1000) },
  { key: 'market comps minimum n', file: 'docs/CONTRACT.md', re: /n ≥ (\d+) per cell/, expect: (F) => String(need(F.marketMinN, 'build-market MIN_N')) },
  { key: 'listing freshness buckets (days)', file: 'docs/CONTRACT.md', re: /\(≤(\d+), (\d+)–(\d+), (\d+)–(\d+), ≥(\d+) days\)/, expect: (F) => { const f = need(F.freshness, 'history FRESHNESS'); return [f.NEW_MAX, f.NEW_MAX + 1, f.ACTIVE_MAX, f.ACTIVE_MAX + 1, f.STALE_MAX, f.STALE_MAX + 1].map(String); }, note: 'server/history.js FRESHNESS' },
]);

/**
 * Unit and e2e tests that pin a DATA value (not a code constant): when the monthly
 * refresh changes the data, these fail. `optional: true` means "the pin may be gone"
 * (it was made relational); then there is nothing to check.
 */
export const TEST_PINS = Object.freeze([
  { key: 'juice.test.js pins the Big Mac release date', file: 'test/juice.test.js', re: /assert\.equal\(DOC\.bigMac\.asOf, '(\d{4}-\d{2}-\d{2})'/, expect: (F) => need(F.bigMacAsOf, 'bigMac.asOf'), optional: true, note: 'fails as soon as the monthly Big Mac refresh lands a new release; docs/process/patches/freshness-derived-test-pins.diff makes it relational' },
]);

/** Run detect rules over the files. -> { findings, missing, checked } */
export function runRules(rules, F, read) {
  const findings = [];
  const missing = [];
  let checked = 0;
  for (const r of rules) {
    const text = read(r.file);
    const m = text == null ? null : r.re.exec(text);
    if (!m) { if (!r.optional) missing.push({ key: r.key, file: r.file }); continue; }
    let want;
    try { want = r.expect(F); } catch (err) { missing.push({ key: r.key, file: r.file, note: err.message }); continue; }
    const caps = m.slice(1).map((s) => String(s).replace(/\s+/g, ' ').trim());
    const got = r.norm ? r.norm(caps) : caps.length === 1 ? caps[0] : caps;
    checked++;
    const a = JSON.stringify(got);
    const b = JSON.stringify(want);
    if (a !== b) findings.push({ key: r.key, encoded: got, official: want, unit: r.file, url: null, note: r.note || 'computed from code and data' });
  }
  return { findings, missing, checked };
}

function rulesResult(id, rules, F, ctx, what) {
  const read = (rel) => { try { return ctx.readText(rel); } catch { return null; } };
  const { findings, missing, checked } = runRules(rules, F, read);
  const evidence = findings.slice(0, 5).map((f) => ({ url: f.unit, fetchedAt: ctx.today, excerpt: `${f.key}: doc says ${JSON.stringify(f.encoded)}, code/data say ${JSON.stringify(f.official)}`.slice(0, 400) }));
  const miss = missing.map((x) => ({ key: x.key, encoded: null, official: null, unit: x.file, url: null, note: x.note ? `could not compute: ${x.note}` : 'anchor text not found: the sentence changed, so this figure is no longer checked; update the rule in scripts/refresh/derived.js' }));
  const checklist = [
    `Fix each figure in ${what} listed above to the "official / new" value (it is computed from the code and data files named in the note).`,
    'If a sentence was reworded, update its rule (README_RULES / DOCS_RULES in scripts/refresh/derived.js) so the figure stays checked.',
    'Run `node --test test/refresh-derived.test.js` and `node scripts/refresh/run.js --offline --dry-run --only derived`.',
  ];
  if (findings.length) return result(id, 'detect', 'drift', { summary: `${findings.length} of ${checked} figure(s) in ${what} disagree with the code/data${missing.length ? `; ${missing.length} rule(s) found no anchor` : ''}`, findings: [...findings, ...miss], evidence, checklist, sourceAsOf: ctx.today });
  if (missing.length) return result(id, 'detect', 'error', { summary: `${missing.length} figure rule(s) in ${what} found no anchor text (${missing.map((x) => x.key).join('; ')}); ${checked} checked and equal`, findings: miss, checklist });
  return result(id, 'detect', 'ok', { summary: `${checked} figure(s) in ${what} match the code and data`, sourceAsOf: ctx.today });
}

// ---------------------------------------------------------------- the individual checks

function workedExamples(ctx, F) {
  const id = 'juice-worked-examples';
  if (!F.juice || !F.cities) return result(id, 'auto', 'error', { summary: `cannot load the Juice inputs: ${F.errors.join('; ')}` });
  const text = ctx.readText(LIVABILITY);
  const render = (blockId) => {
    if (!EX.BLOCKS.includes(blockId)) throw Object.assign(new Error(`unknown block ${blockId}`), { code: 'UNKNOWN_BLOCK' });
    return EX.renderBlock(blockId, F.juice, F.cities);
  };
  const marked = new Set(parseBlocks(text).map((b) => b.id));
  const rep = replaceBlocks(text, render);
  const findings = [];
  for (const u of rep.unknown) findings.push({ key: u, encoded: u, official: null, unit: 'marker', url: null, note: `unknown generated block id (known: ${EX.BLOCKS.join(', ')})` });
  for (const u of rep.mismatched) findings.push({ key: u, encoded: u, official: null, unit: 'marker', url: null, note: 'begin/end markers do not match' });
  const unmarked = EX.BLOCKS.filter((b) => !marked.has(b));
  let notFound = 0;
  for (const b of unmarked) {
    const cmp = compareUnmarked(text, b, F.juice, F.cities);
    if (!cmp.found) { notFound++; findings.push({ key: b, encoded: null, official: null, unit: LIVABILITY, url: null, note: 'table not found (no markers and no hand-written table)' }); }
    findings.push(...cmp.findings);
  }
  const asOf = EX.inputsAsOf(EX.WORKED_EXAMPLES.map((ex) => EX.exampleJuice(F.juice, F.cities, ex)));
  // The month's computed examples go to the archive (run.js writeArchivePayloads): a time series
  // of the same jobs through every data and tax update, for the annual review.
  const archive = { dataset: id, asOf: ctx.today, source: 'scripts/refresh/examples.js', json: EX.examplesSnapshot(F.juice, F.cities, { computedAt: ctx.today }) };
  const checklist = ['Apply docs/process/patches/freshness-derived-livability-markers.diff (or `node scripts/refresh/derived.js --insert-markers docs/LIVABILITY.md`), so the refresh regenerates these tables itself.', 'Otherwise copy the generated rows from this report into docs/LIVABILITY.md.'];
  if (rep.unknown.length || rep.mismatched.length) return result(id, 'auto', 'error', { summary: 'broken freshness markers in docs/LIVABILITY.md', findings, checklist });
  if (rep.changed.length) {
    return result(id, 'auto', 'changed', {
      summary: `regenerated ${rep.changed.join(', ')} in docs/LIVABILITY.md (${asOf})${findings.length ? `; ${findings.length} difference(s) in unmarked tables` : ''}`,
      writes: [{ file: LIVABILITY, content: rep.text }], findings, sourceAsOf: ctx.today, archive,
      evidence: [{ url: LIVABILITY, fetchedAt: ctx.today, excerpt: `blocks regenerated from server/juice.js + data/cities.json: ${rep.changed.join(', ')}` }],
    });
  }
  if (findings.length) {
    return result(id, unmarked.length === EX.BLOCKS.length ? 'detect' : 'auto', notFound === findings.length ? 'error' : 'drift', {
      summary: `${findings.length} generated-table difference(s) in docs/LIVABILITY.md (${unmarked.length} table(s) without markers)`, findings, checklist, sourceAsOf: ctx.today, archive,
      evidence: findings.slice(0, 3).map((f) => ({ url: LIVABILITY, fetchedAt: ctx.today, excerpt: `${f.key}: ${String(f.official).slice(0, 300)}` })),
    });
  }
  const how = unmarked.length ? `${marked.size} marked block(s) current; ${unmarked.length} hand-written table(s) equal the code (markers not applied yet)` : `${marked.size} marked block(s) current`;
  return result(id, unmarked.length === EX.BLOCKS.length ? 'detect' : 'auto', 'ok', { summary: `${how} (${asOf})`, sourceAsOf: ctx.today, archive, ...(unmarked.length ? { checklist } : {}) });
}

async function methodologyPage(ctx) {
  const id = 'methodology-page';
  const checklist = [
    'Make sure scripts/md.js drops HTML comments (reference implementation and test: docs/process/patches/freshness-derived-md-comments.diff, for the md.js owner), so freshness markers never show on the reference page.',
    'Run `npm run build` and open dist/methodology/: every generated table renders and #1-the-formula exists (the drawer links to it).',
  ];
  let md;
  try { md = ctx.readText(LIVABILITY); } catch (err) { return errorResult(id, 'detect', err, { checklist }); }
  // The reference page renders docs/LIVABILITY.md unchanged. scripts/methodology.js is being
  // redesigned (guide + reference), so use whichever renderer it exports, else md.js itself.
  let html;
  try {
    const mod = await import(pathToFileURL(path.join(ctx.root, 'scripts', 'methodology.js')).href);
    const renderer = [mod.renderReferencePage, mod.renderMethodologyPage].find((f) => typeof f === 'function');
    if (renderer) html = renderer({ md });
    else html = (await import(pathToFileURL(path.join(ctx.root, 'scripts', 'md.js')).href)).mdToHtml(md).html;
    if (typeof html !== 'string') throw new Error('renderer returned no HTML');
  } catch (err) { return result(id, 'detect', 'error', { summary: `rendering docs/LIVABILITY.md failed: ${err.message}`, checklist }); }
  const findings = [];
  if (/freshness:(begin|end)/.test(html)) findings.push({ key: 'marker comments visible', encoded: 'shown as text', official: 'hidden', unit: 'dist/methodology/index.html', url: null, note: 'scripts/md.js renders HTML comments as text; apply the md.js patch' });
  if (!/\sid="1-the-formula"/.test(html)) findings.push({ key: '#1-the-formula anchor', encoded: 'missing', official: 'present', unit: 'dist/methodology/index.html', url: null, note: 'the drawer Juice link (public/app.js JUICE_DOC) targets it' });
  const mdTables = (md.match(/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/gm) || []).length;
  const htmlTables = (html.match(/<table>/g) || []).length;
  if (htmlTables < mdTables) findings.push({ key: 'tables rendered', encoded: htmlTables, official: mdTables, unit: 'tables', url: null, note: 'a Markdown table did not render' });
  for (const b of parseBlocks(md)) {
    const head = (EX.HEADERS[b.id] || [])[0];
    const firstCell = head && head.split('|')[1].trim().replace(/`/g, '');
    if (firstCell && !html.includes(`>${firstCell}<`) && !html.includes(firstCell)) findings.push({ key: `${b.id} rendered`, encoded: 'missing', official: 'present', unit: 'table', url: null, note: 'generated block not on the page' });
  }
  if (findings.length) return result(id, 'detect', 'flag', { summary: `the methodology page rendered from docs/LIVABILITY.md has ${findings.length} problem(s)`, findings, checklist });
  return result(id, 'detect', 'ok', { summary: `methodology page renders: ${htmlTables} table(s), ${parseBlocks(md).length} generated block(s), anchors intact; rebuilt from docs/LIVABILITY.md by every Pages build`, sourceAsOf: ctx.today });
}

/** { width, height } of a PNG (IHDR), or null. */
export function pngSize(buf) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buf || buf.length < 24 || !buf.subarray(0, 8).equals(sig) || buf.toString('latin1', 12, 16) !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');

/** The illustrative figures on the share card: headline median and count, the per-row counts, the pins. */
export function cardFigures(html) {
  const s = String(html);
  const head = /Median <tspan class="t-strong">\$(\d+)K<\/tspan> · (\d+) roles/.exec(s);
  const rows = [...s.matchAll(/class="t-rowsub"[^>]*>(\d+) roles</g)].map((m) => Number(m[1]));
  const pins = [...s.matchAll(/class="pin[^"]*"[^>]*>\$(\d+)K <span class="n">(\d+)<\/span>/g)].map((m) => ({ k: Number(m[1]), n: Number(m[2]) }));
  const remote = /Remote <span class="muted">· (\d+) roles/.exec(s);
  return { medianK: head ? Number(head[1]) : null, roles: head ? Number(head[2]) : null, rows, pins, remote: remote ? Number(remote[1]) : null, illustrative: /illustrative, not data/.test(s) };
}

/** What --og-hashes prints: the hashes of the card source and the committed PNG. */
export function ogManifest(root = ROOT, now = new Date()) {
  return { card: OG_CARD, cardSha256: sha256(fs.readFileSync(path.join(root, OG_CARD))), png: OG_PNG, pngSha256: sha256(fs.readFileSync(path.join(root, OG_PNG))), renderedAt: isoDate(now), by: 'scripts/build-og.mjs' };
}

function ogCard(ctx) {
  const id = 'og-card';
  const checklist = [
    'Review public/og/card.html: its salaries and counts are illustrative (no company); keep them plausible against current medians (Insights) and keep the headline count equal to the sum of the rows.',
    'If card.html changed: install playwright-core outside the repo (`npm i --prefix "$RUNNER_TEMP/pw" playwright-core`), then `PW_DIR="$RUNNER_TEMP/pw" CHROMIUM_PATH=/usr/local/share/chromium/chrome-linux/chrome node scripts/build-og.mjs` (ubuntu-latest has Chromium; locally use /opt/pw-browsers).',
    `Record the new hashes: \`node scripts/refresh/derived.js --og-hashes > ${OG_MANIFEST}\`, and commit card.html, the PNG and the manifest together.`,
    'After the deploy, re-scrape the preview (LinkedIn Post Inspector, Facebook Sharing Debugger; docs/process/social.md).',
    'Set lastChecked for og-card in data/freshness.json.',
  ];
  let html;
  let png;
  try {
    html = ctx.readText(OG_CARD);
    png = fs.readFileSync(path.join(ctx.root, OG_PNG));
  } catch (err) { return errorResult(id, 'manual', err, { checklist }); }
  const findings = [];
  const fig = cardFigures(html);
  if (!fig.illustrative) findings.push({ key: 'illustrative disclaimer', encoded: 'missing', official: 'present', unit: OG_CARD, url: null, note: 'the card comment must say its numbers are illustrative, not data' });
  if (fig.roles == null) findings.push({ key: 'headline', encoded: null, official: 'Median $NNNK · N roles', unit: OG_CARD, url: null, note: 'headline not found' });
  else if (fig.rows.length && fig.rows.reduce((a, b) => a + b, 0) !== fig.roles) findings.push({ key: 'headline count = sum of rows', encoded: fig.roles, official: fig.rows.reduce((a, b) => a + b, 0), unit: 'roles', url: null, note: 'the illustrative chart must add up' });
  const dim = pngSize(png);
  if (!dim || dim.width !== 1200 || dim.height !== 630) findings.push({ key: 'PNG size', encoded: dim, official: { width: 1200, height: 630 }, unit: 'px', url: null, note: 'og:image:width/height in public/index.html say 1200x630' });
  if (png.length >= 5 * 1024 * 1024) findings.push({ key: 'PNG bytes', encoded: png.length, official: '< 5 MB', unit: 'bytes', url: null, note: "LinkedIn's og:image limit" });
  let manifest = null;
  try { manifest = JSON.parse(ctx.readText(OG_MANIFEST)); } catch { /* none yet */ }
  if (!manifest) findings.push({ key: 'render manifest', encoded: 'missing', official: OG_MANIFEST, unit: 'file', url: null, note: 'no record of which card.html the PNG was rendered from' });
  else {
    if (manifest.cardSha256 !== sha256(Buffer.from(html))) findings.push({ key: 'card.html changed since the PNG was rendered', encoded: manifest.cardSha256, official: sha256(Buffer.from(html)), unit: 'sha256', url: null, note: 're-render the PNG (checklist)' });
    if (manifest.pngSha256 !== sha256(png)) findings.push({ key: 'PNG differs from the recorded render', encoded: manifest.pngSha256, official: sha256(png), unit: 'sha256', url: null, note: 'record the new hashes (checklist step 3)' });
  }
  const evidence = [{ url: OG_CARD, fetchedAt: ctx.today, excerpt: `illustrative headline: median $${fig.medianK}K, ${fig.roles} roles; rows ${fig.rows.join('+')}; pins ${fig.pins.map((p) => `$${p.k}K·${p.n}`).join(', ')}; remote ${fig.remote}` }];
  const sourceAsOf = manifest && manifest.renderedAt ? manifest.renderedAt : null;
  if (findings.length) return result(id, 'manual', 'drift', { summary: `share card: ${findings.map((f) => f.key).join('; ')}`, findings, evidence, checklist, sourceAsOf });
  const e = ctx.entry(id);
  if (e) {
    const s = staleness(e, ctx.now);
    if (s.overdue) return result(id, 'manual', 'stale', { summary: `share card review past due by ${-s.dueInDays} day(s) (illustrative figures; cadence ${e.cadence})`, evidence, checklist, sourceAsOf });
  }
  return result(id, 'manual', 'ok', { summary: `share card consistent (illustrative, ${dim.width}x${dim.height}, ${Math.round(png.length / 1024)} KiB, PNG matches card.html)`, evidence, checklist, sourceAsOf });
}

function calibrationDoc(ctx, F) {
  const id = 'juice-calibration-doc';
  const checklist = [
    'Restore real snapshots (`gh run download --repo alvations/melon-seek --name job-board-snapshots --dir data/snapshots`).',
    'Run `node docs/process/scripts/livability-juice-distribution.mjs` (and `--old` for the comparison column) and update the "Calibration (real snapshots, <date>)" paragraph and table in docs/LIVABILITY.md §1.',
    'If the 90th-percentile score leaves 85-90 or jobs reach 100 again, raise it with the product owner before re-tuning K (juice-score-anchors is product policy).',
    'Set lastChecked (and asOf to the snapshot date) for juice-calibration-doc in data/freshness.json.',
  ];
  let text;
  try { text = ctx.readText(LIVABILITY); } catch (err) { return errorResult(id, 'manual', err, { checklist }); }
  const m = /\*\*Calibration \(real snapshots, (\d{4}-\d{2}-\d{2})\)\.\*\*/.exec(text);
  const k = /\*\*New \(K \$(\d+)K\)\*\*/.exec(text);
  const findings = [];
  if (!m) findings.push({ key: 'calibration paragraph', encoded: null, official: '**Calibration (real snapshots, YYYY-MM-DD).**', unit: LIVABILITY, url: null, note: 'not found' });
  if (k && F.K != null && Number(k[1]) * 1000 !== F.K) findings.push({ key: 'calibration column K', encoded: `$${k[1]}K`, official: `$${F.K / 1000}K`, unit: 'USD', url: null, note: 'the table was calibrated for another K: re-run the calibration' });
  if (findings.length) return result(id, 'manual', 'flag', { summary: `calibration table out of step with the code: ${findings.map((f) => f.key).join('; ')}`, findings, checklist, sourceAsOf: m ? m[1] : null });
  const e = ctx.entry(id);
  if (e) {
    const s = staleness(e, ctx.now);
    if (s.overdue) return result(id, 'manual', 'stale', { summary: `calibration from real snapshots of ${m[1]} is past its review (cadence ${e.cadence})`, checklist, sourceAsOf: m[1] });
  }
  return result(id, 'manual', 'ok', { summary: `calibration table dated ${m[1]}, K matches the code`, checklist, sourceAsOf: m[1] });
}

/** Job ids pinned in e2e tests: [{ file, slug, id }]. */
export function pinnedJobIds(files) {
  const out = [];
  for (const [file, text] of files) {
    const seen = new Set();
    for (const m of String(text).matchAll(/['"`]([a-z0-9-]+):(\d{6,})['"`]|job=([a-z0-9-]+)%3A(\d{6,})/g)) {
      const slug = m[1] || m[3];
      const id = `${slug}:${m[2] || m[4]}`;
      if (!seen.has(id)) { seen.add(id); out.push({ file, slug, id }); }
    }
  }
  return out;
}

function e2ePins(ctx, F) {
  const id = 'e2e-pinned-values';
  const checklist = [
    'For a pinned job id that is gone from the snapshot: pick a current job with the same properties (see the test name) or keep the predicate fallback from docs/process/patches/freshness-derived-test-pins.diff.',
    'For a unit test pinning a data value: make it relational (compare with the value read before the call), as the test-pins patch does for the Big Mac date.',
    'Tax golden vectors (test/juice.test.js) and fixture-based tests are intentional: they change only with the tax rules (tax-* entries) or their fixtures.',
  ];
  const dir = path.join(ctx.root, 'test', 'e2e');
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.e2e.js')).map((f) => [`test/e2e/${f}`, ctx.readText(`test/e2e/${f}`)]); } catch { /* none */ }
  const pins = pinnedJobIds(files);
  const findings = [];
  const read = (rel) => { try { return ctx.readText(rel); } catch { return null; } };
  const unit = runRules(TEST_PINS, F, read);
  findings.push(...unit.findings.map((f) => ({ ...f, note: TEST_PINS.find((r) => r.key === f.key).note })));
  const unchecked = [];
  const slugs = [...new Set(pins.map((p) => p.slug))];
  for (const slug of slugs) {
    const rel = `data/snapshots/${slug}.json`;
    if (!ctx.exists(rel)) { unchecked.push(slug); continue; }
    let ids;
    try { ids = new Set((ctx.readJson(rel).jobs || []).map((j) => j && j.id)); } catch { unchecked.push(slug); continue; }
    for (const p of pins.filter((x) => x.slug === slug)) {
      if (!ids.has(p.id)) findings.push({ key: `${p.file}: ${p.id}`, encoded: p.id, official: 'not in the current snapshot', unit: 'job id', url: null, note: 'the posting closed; the test falls back or skips' });
    }
  }
  const evidence = pins.length ? [{ url: 'test/e2e', fetchedAt: ctx.today, excerpt: `pinned job ids: ${pins.map((p) => `${p.id} (${p.file})`).join(', ')}`.slice(0, 400) }] : [];
  if (findings.length) return result(id, 'detect', 'drift', { summary: `${findings.length} pinned test value(s) no longer match the data`, findings, evidence, checklist, sourceAsOf: ctx.today });
  if (unchecked.length && pins.length) return result(id, 'detect', 'skipped', { summary: `unit-test pins ok; ${pins.length} pinned e2e job id(s) not checked: no data/snapshots/${unchecked.join(', ')}.json in this checkout (restore the job-board-snapshots artifact)`, evidence, checklist });
  return result(id, 'detect', 'ok', { summary: `${unit.checked} unit-test pin(s) match the data; ${pins.length} pinned e2e job id(s) present in the snapshots`, evidence, sourceAsOf: ctx.today });
}

// ---------------------------------------------------------------- the published subset (site)

/**
 * Client-safe subset of data/freshness.json for api/freshness.json and GET /api/freshness:
 * id, description, type, asOf, taxYear, source { name, url }, cadence, lastChecked, stale
 * (at `now`) and staleAfter (the last day the entry counts as fresh, so the browser can
 * judge staleness on the viewer's clock). No file paths, checklists or notes.
 */
export function publicFreshness(registry, { now = new Date() } = {}) {
  const list = registry && Array.isArray(registry.entries) ? registry.entries : [];
  const entries = list.filter((e) => e && e.id && !e.retired).map((e) => {
    const s = staleness(e, now);
    const out = { id: e.id, description: e.description || '', type: e.type || null, asOf: e.asOf || null };
    if (e.taxYear != null) out.taxYear = e.taxYear;
    out.source = e.source ? { name: e.source.name || null, url: e.source.url || null } : null;
    out.cadence = e.cadence || null;
    out.lastChecked = e.lastChecked || null;
    // MR-26: a daily pipeline entry (the postings) is as fresh as the build that read it: never stale, no staleAfter.
    const pipeline = isPipelineEntry(e);
    out.stale = !pipeline && !!s.overdue;
    out.staleAfter = pipeline || s.dueInDays == null ? null : isoDate(addDays(now, s.dueInDays));
    return out;
  });
  // Always a document (entries [] without a registry): the site fetches it, and a 404 would be a console error.
  return { format: 'melon-freshness-public-1', updated: (registry && registry.updated) || null, generatedAt: isoDate(now), ...(list.length ? {} : { missing: true }), entries };
}

// ---------------------------------------------------------------- check()

export async function check(ctx) {
  let F;
  try { F = await loadFacts(ctx); } catch (err) { return MODULE.ids.map((id) => errorResult(id, 'detect', err)); }
  const safe = async (id, mode, fn) => { try { return await fn(); } catch (err) { return errorResult(id, mode, err); } };
  return [
    await safe('readme-counts', 'detect', () => rulesResult('readme-counts', README_RULES, F, ctx, 'README.md')),
    await safe('docs-counts', 'detect', () => rulesResult('docs-counts', DOCS_RULES, F, ctx, 'docs/LIVABILITY.md and docs/CONTRACT.md')),
    await safe('juice-worked-examples', 'auto', () => workedExamples(ctx, F)),
    await safe('juice-calibration-doc', 'manual', () => calibrationDoc(ctx, F)),
    await safe('methodology-page', 'detect', () => methodologyPage(ctx)),
    await safe('og-card', 'manual', () => ogCard(ctx)),
    await safe('e2e-pinned-values', 'detect', () => e2ePins(ctx, F)),
  ];
}

// ---------------------------------------------------------------- CLI

async function cli(argv) {
  const [cmd, arg] = argv;
  if (cmd === '--og-hashes') { process.stdout.write(`${JSON.stringify(ogManifest(), null, 2)}\n`); return 0; }
  if (cmd === '--public') {
    const reg = JSON.parse(fs.readFileSync(path.resolve(arg || path.join(ROOT, 'data', 'freshness.json')), 'utf8'));
    process.stdout.write(`${JSON.stringify(publicFreshness(reg), null, 2)}\n`);
    return 0;
  }
  if (cmd === '--insert-markers') {
    const rel = arg || LIVABILITY;
    const ctx = { root: ROOT, readText: (r) => fs.readFileSync(path.join(ROOT, r), 'utf8'), readJson: (r) => JSON.parse(fs.readFileSync(path.join(ROOT, r), 'utf8')) };
    const juice = await importFromOverlay(ctx, ['server/juice.js', 'server/geo.js']);
    const cities = ctx.readJson('data/cities.json');
    const text = insertMarkers(fs.readFileSync(path.resolve(ROOT, rel), 'utf8'), (id) => EX.renderBlock(id, juice, cities));
    process.stdout.write(text);
    return 0;
  }
  console.error('usage: node scripts/refresh/derived.js --insert-markers [docs/LIVABILITY.md] | --og-hashes | --public [data/freshness.json]\n(the monthly check runs through scripts/refresh/run.js --only derived)');
  return 2;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) cli(process.argv.slice(2)).then((c) => process.exit(c), (err) => { console.error(err && err.stack ? err.stack : err); process.exit(2); });
