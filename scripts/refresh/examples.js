// Generated Juice tables for docs/LIVABILITY.md (the "worked examples", the
// by-household table and the score legend), computed from the code itself:
// server/juice.js (computeJuice, netForScore, GRADES) and data/cities.json.
//
// Not an updater module (scripts/refresh/run.js skips this file): it is the
// pure table generator that scripts/refresh/derived.js calls. Every function
// takes the juice module namespace and the cities document as arguments, so
// the monthly refresh can pass the versions an earlier module just rewrote
// (FX, Big Mac, rents) and the tables match the data that will ship.
//
//   renderBlock(name, juice, doc) -> Markdown text of one generated block
//   BLOCKS                        -> the block names derived.js knows (worked examples, by
//                                    household, score legend, the §3 tax-source table)
//   expectedRows(name, juice, doc) -> [cells] per row (detect mode: compare a hand-written table)
//   examplesSnapshot(juice, doc)  -> every example as data, for the archive's monthly series
//                                    (e.g. how the San Francisco $675K case changes over the years)
//
// Output format is byte-for-byte the format the hand-written tables used
// (docs/LIVABILITY.md §1, data as of 2026-10-02 / 2026-10-10), so applying the
// marker patch changes nothing but the caption line.

/** One-person worked examples: [job label, city key, salary amount, currency]. */
export const WORKED_EXAMPLES = Object.freeze([
  ['Software engineer, San Francisco', 'san-francisco-ca-us', 300000, 'USD'],
  ['Software engineer, New York', 'new-york-ny-us', 250000, 'USD'],
  ['Software engineer, Austin', 'austin-tx-us', 150000, 'USD'],
  ['Manufacturing engineer, Costa Mesa', 'costa-mesa-ca-us', 100000, 'USD'],
  ['Research engineer, London', 'london-gb', 120000, 'GBP'],
  ['Engineer, Zurich', 'zurich-ch', 150000, 'CHF'],
  ['Engineer, Berlin', 'berlin-de', 90000, 'EUR'],
  ['Engineer, Bengaluru', 'bengaluru-in', 4000000, 'INR'],
]);

/** By-household examples (each row x Just me / Couple / Family). The first is the user's $675K case. */
export const HOUSEHOLD_EXAMPLES = Object.freeze([
  ["Research engineer, San Francisco (the user's example)", 'san-francisco-ca-us', 675000, 'USD'],
  ['Software engineer, San Francisco', 'san-francisco-ca-us', 300000, 'USD'],
  ['Software engineer, New York', 'new-york-ny-us', 250000, 'USD'],
  ['Software engineer, Austin', 'austin-tx-us', 150000, 'USD'],
  ['Research engineer, London', 'london-gb', 120000, 'GBP'],
  ['Engineer, Zurich', 'zurich-ch', 150000, 'CHF'],
  ['Engineer, Sydney', 'sydney-nsw-au', 200000, 'AUD'],
  ['Engineer, Berlin', 'berlin-de', 90000, 'EUR'],
]);

/** Extra points printed under the grade table ("Other legend points"). */
export const LEGEND_POINTS = Object.freeze([25, 80, 90, 95, 99, 100]);

export const BLOCKS = Object.freeze(['juice-worked-examples/single', 'juice-worked-examples/household', 'juice-worked-examples/score-legend', 'juice-worked-examples/tax-sources']);

const MINUS = '−';
const int = (n) => Math.round(n).toLocaleString('en-US');
/** "$125,189" / "−$1,352" (U+2212, as the docs print negatives). */
export function usd(n) {
  const r = Math.round(n);
  return `${r < 0 ? MINUS : ''}$${int(Math.abs(r))}`;
}

function citiesOf(doc) {
  return Array.isArray(doc) ? doc : (doc && Array.isArray(doc.cities) ? doc.cities : []);
}
function cityByKey(doc, key) {
  const c = citiesOf(doc).find((x) => x.key === key);
  if (!c) throw Object.assign(new Error(`worked example city ${key} is not in data/cities.json`), { code: 'EXAMPLE_CITY' });
  return c;
}

/**
 * computeJuice for one example the way attachJuice does it: salary converted with
 * usdPerUnit (palette FX, then the city's Big Mac FX) and the document's NYC baseline.
 */
export function exampleJuice(juice, doc, [, cityKey, amount, currency], household = 'single') {
  const city = cityByKey(doc, cityKey);
  const per = juice.usdPerUnit(currency, city, doc);
  if (!(per > 0)) throw new Error(`no FX for ${currency}`);
  const baselineUSD = doc && doc.baseline && doc.baseline.nycBasketUSD > 0 ? doc.baseline.nycBasketUSD : undefined;
  return juice.computeJuice(amount * per, city, { household, ...(baselineUSD ? { baselineUSD } : {}) });
}

const gradeCell = (j) => `${j.grade}${j.estimated ? ' (est.)' : ''}`;
const salaryCell = ([, , amount, currency]) => `${int(amount)} ${currency}`;
function householdLabel(juice, key) {
  const h = (juice.HOUSEHOLDS && juice.HOUSEHOLDS[key]) || { label: key, bedrooms: '?' };
  return `${h.label} (${h.bedrooms} bed)`;
}
const row = (cells) => `| ${cells.join(' | ')} |`;

/** Rows (cell arrays) of a block, without header. */
export function expectedRows(name, juice, doc) {
  if (name === 'juice-worked-examples/single') {
    return WORKED_EXAMPLES.map((ex) => {
      const j = exampleJuice(juice, doc, ex, 'single');
      return [ex[0], salaryCell(ex), usd(j.gross), usd(j.tax), usd(j.rent), usd(j.living), usd(j.net), String(j.score), gradeCell(j), j.confidence];
    });
  }
  if (name === 'juice-worked-examples/household') {
    const out = [];
    for (const ex of HOUSEHOLD_EXAMPLES) {
      (juice.HOUSEHOLD_KEYS || ['single', 'couple', 'family']).forEach((hh, i) => {
        const j = exampleJuice(juice, doc, ex, hh);
        out.push([i ? '' : ex[0], i ? '' : salaryCell(ex), householdLabel(juice, hh), usd(j.gross), usd(j.tax), usd(j.rent), usd(j.living), usd(j.net), String(j.score), gradeCell(j), j.confidence]);
      });
    }
    return out;
  }
  if (name === 'juice-worked-examples/score-legend') {
    const grades = [...juice.GRADES].sort((a, b) => b.min - a.min);
    return grades.map((g, i) => {
      const hi = i ? grades[i - 1].min - 1 : 100;
      const lo = g.min > 0 ? g.min : 1;
      const need = g.min > 0 ? `≥ ${usd(juice.netForScore(g.min))}` : '> $0';
      return [`${lo}-${hi}`, need, `**${g.label}**`, g.hint];
    }).concat([['0', '≤ $0', `**${juice.RIND.label}**`, juice.RIND.hint]]);
  }
  if (name === 'juice-worked-examples/tax-sources') {
    // docs/LIVABILITY.md §3: one row per TAX_SOURCES key, in code order.
    return Object.entries(juice.TAX_SOURCES).map(([k, s]) => [k, `${s.name}${s.approximate ? ' *(approximation)*' : ''}`, String(s.asOf), s.verified ? 'yes' : 'no', `[link](${s.url})`]);
  }
  throw new Error(`unknown generated block ${name}`);
}

export const HEADERS = Object.freeze({
  'juice-worked-examples/single': ['| Job | Salary | Gross (USD) | Tax | Rent | Living | Juice (net) | Score | Grade | Confidence |', '|---|---|---:|---:|---:|---:|---:|---:|---|---|'],
  'juice-worked-examples/household': ['| Job | Salary | Household | Gross | Tax | Rent | Living | Juice (net) | Score | Grade | Confidence |', '|---|---|---|---:|---:|---:|---:|---:|---:|---|---|'],
  'juice-worked-examples/score-legend': ['| Score | Net juice needed (`netForScore`) | Grade | Reading |', '|---:|---:|---|---|'],
  'juice-worked-examples/tax-sources': ['| Key | Rule | As of | Verified | Source |', '|---|---|---|---|---|'],
});

/** How to find each block's table in a document without markers (detect mode, insertMarkers). */
export const HEADER_PREFIX = Object.freeze({
  'juice-worked-examples/single': '| Job | Salary | Gross (USD) |',
  'juice-worked-examples/household': '| Job | Salary | Household |',
  'juice-worked-examples/score-legend': '| Score | Net juice needed',
  'juice-worked-examples/tax-sources': '| Key | Rule | As of |',
});

/** The 4-digit years in a tax asOf string ("2025 (brackets) / 2026 (SDI)", "FY2026-27", "YA2026"). */
function years(s) { return (String(s || '').match(/(?:19|20)\d\d/g) || []).map(Number); }
function span(list) {
  const v = [...new Set(list.filter(Boolean))].sort();
  if (!v.length) return 'n/a';
  return v.length === 1 ? v[0] : `${v[0]} to ${v[v.length - 1]}`;
}

/** "rent 2025-10 to 2026-09 · living costs 2026-09 · FX 2026-07-01 · tax years 2025 to 2026": the as-of dates of the inputs a block used. */
export function inputsAsOf(results) {
  const rent = [], living = [], fx = [], tax = [];
  for (const j of results) {
    const i = j.inputs || {};
    rent.push(i.rent && i.rent.source && i.rent.source.asOf);
    living.push(i.costIndex && i.costIndex.source && i.costIndex.source.asOf);
    fx.push(i.fx && i.fx.asOf);
    for (const s of (i.tax && i.tax.sources) || []) tax.push(...years(s.asOf).map(String));
  }
  return `rent ${span(rent)} · living costs ${span(living)} · FX ${span(fx)} · tax years ${span(tax)}`;
}

function blockResults(name, juice, doc) {
  if (name === 'juice-worked-examples/single') return WORKED_EXAMPLES.map((ex) => exampleJuice(juice, doc, ex, 'single'));
  if (name === 'juice-worked-examples/household') return HOUSEHOLD_EXAMPLES.flatMap((ex) => (juice.HOUSEHOLD_KEYS || ['single', 'couple', 'family']).map((hh) => exampleJuice(juice, doc, ex, hh)));
  return [];
}

/** True when every example has the same tax for all households (the tax model has no household rules yet). */
export function singleFilerTaxEverywhere(juice, doc) {
  return HOUSEHOLD_EXAMPLES.every((ex) => {
    const taxes = (juice.HOUSEHOLD_KEYS || ['single', 'couple', 'family']).map((hh) => exampleJuice(juice, doc, ex, hh).tax);
    return taxes.every((t) => t === taxes[0]);
  });
}

/** "Other legend points: 25 = $23,015, ..., 100 = $423,866." */
export function legendSentence(juice) {
  return `Other legend points: ${LEGEND_POINTS.map((s) => `${s} = ${usd(juice.netForScore(s))}`).join(', ')}.`;
}

const GENERATED_BY ='Generated by `scripts/refresh/examples.js` from `server/juice.js` and `data/cities.json`; the monthly refresh regenerates it, so do not edit it by hand.';

/** Full Markdown of one generated block (what sits between its freshness markers). */
export function renderBlock(name, juice, doc) {
  const [head, sep] = HEADERS[name] || [];
  if (!head) throw new Error(`unknown generated block ${name}`);
  const table = [head, sep, ...expectedRows(name, juice, doc).map(row)].join('\n');
  if (name === 'juice-worked-examples/score-legend') return `${table}\n\n${legendSentence(juice)}`;
  if (name === 'juice-worked-examples/tax-sources') return table;
  const asOf = inputsAsOf(blockResults(name, juice, doc));
  if (name === 'juice-worked-examples/single') {
    return `_Data as of: ${asOf}. ${GENERATED_BY}_\n\n${table}`;
  }
  const filer = singleFilerTaxEverywhere(juice, doc) ? ', single-filer tax for every household until the tax model\'s household rules land; see §3' : ', tax by household as modelled in §3';
  return `**By household** (generated from the code${filer}). _Data as of: ${asOf}. ${GENERATED_BY}_\n\n${table}`;
}

/** Every worked example as data (one record per example x household), for the archive. */
export function examplesSnapshot(juice, doc, { computedAt = null } = {}) {
  const pick = (j) => {
    const i = j.inputs || {};
    return {
      gross: j.gross, tax: j.tax, taxParts: j.taxParts, rent: j.rent, living: j.living, net: j.net, score: j.score, grade: j.grade,
      estimated: !!j.estimated, confidence: j.confidence,
      inputsAsOf: {
        rent: (i.rent && i.rent.source && i.rent.source.asOf) || null,
        costIndex: (i.costIndex && i.costIndex.source && i.costIndex.source.asOf) || null,
        fx: (i.fx && i.fx.asOf) || null,
        tax: ((i.tax && i.tax.sources) || []).map((s) => ({ key: s.key, asOf: s.asOf })),
      },
    };
  };
  const rows = [];
  for (const ex of WORKED_EXAMPLES) rows.push({ table: 'single', job: ex[0], city: ex[1], amount: ex[2], currency: ex[3], household: 'single', ...pick(exampleJuice(juice, doc, ex, 'single')) });
  for (const ex of HOUSEHOLD_EXAMPLES) {
    for (const hh of juice.HOUSEHOLD_KEYS || ['single', 'couple', 'family']) rows.push({ table: 'household', job: ex[0], city: ex[1], amount: ex[2], currency: ex[3], household: hh, ...pick(exampleJuice(juice, doc, ex, hh)) });
  }
  return {
    format: 'melon-worked-examples-1', computedAt,
    model: { scoreAnchors: juice.SCORE_ANCHORS, fxAsOf: juice.FX_AS_OF || null, nycBasketUSD: (doc && doc.baseline && doc.baseline.nycBasketUSD) || null, citiesUpdated: (doc && doc.updated) || null },
    rows,
  };
}
