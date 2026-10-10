// Updater: The Economist's Big Mac index prices (registry id `bigmac-prices`).
//
// Source: github.com/TheEconomist/big-mac-data, source-data/big-mac-source-data-v2.csv
// (data CC BY 4.0, code MIT). Two releases a year (January and July), so a monthly run
// usually finds nothing new and returns 'ok'.
//
// Mode 'auto': on a newer release it rewrites, in data/cities.json, `bigMac` (the
// per-country table), every city's `bigMacUSD` + `sources.bigMacUSD`, and
// `sourceNotes['big-mac']`. It does NOT touch FX: exchange rates are the `fx` module's job
// (scripts/refresh/fx.js), so the two can be refreshed and reviewed separately. The
// parsing reuses scripts/update-col.js (parseCsv, latestBigMac), which also still works
// on its own for the old all-in-one refresh.
//
// Validation (validateBigMac): >= 20 countries; every country the cities use is present
// or kept from the previous release; dollar price in [1, 12] USD; the release date is
// not in the future and not older than the encoded one; a country whose dollar price
// moves more than 40% between releases is a 'flag' (nothing written).
import { result, errorResult, excerpt, relChange, isoDate } from './lib.js';
import { parseCsv, latestBigMac, formatDoc, BIG_MAC_CSV_URL, BIG_MAC_REPO_URL, BIG_MAC_LICENSE } from '../update-col.js';

export const MODULE = Object.freeze({ name: 'bigmac', ids: ['bigmac-prices'] });
export const MAX_RELEASE_MOVE = 0.4;
export const PRICE_BOUNDS_USD = Object.freeze([1, 12]);

/** Problems with a parsed release relative to the current document (empty = fine). */
export function validateBigMac(doc, bm, { today = isoDate() } = {}) {
  const problems = [];
  const warnings = [];
  const n = Object.keys(bm.byCountry || {}).length;
  if (!bm.date || n < 20) problems.push(`release looks incomplete: ${n} countries, date ${bm.date || '-'}`);
  if (bm.date && bm.date > today) problems.push(`release date ${bm.date} is in the future`);
  const prevDate = doc.bigMac && doc.bigMac.asOf;
  if (prevDate && bm.date && bm.date < prevDate) problems.push(`release ${bm.date} is older than the encoded ${prevDate}`);
  const used = [...new Set(doc.cities.map((c) => c.country))];
  for (const iso2 of used) {
    const row = bm.byCountry[iso2];
    if (!row) { warnings.push(`${iso2} not in release ${bm.date}; previous price kept`); continue; }
    if (!(row.dollarPrice >= PRICE_BOUNDS_USD[0] && row.dollarPrice <= PRICE_BOUNDS_USD[1])) problems.push(`${iso2} dollar price ${row.dollarPrice} outside ${PRICE_BOUNDS_USD.join('-')} USD`);
    const prev = doc.bigMac && doc.bigMac.byCountry && doc.bigMac.byCountry[iso2];
    const ch = prev ? relChange(prev.dollarPrice, row.dollarPrice) : null;
    if (ch != null && Math.abs(ch) > MAX_RELEASE_MOVE) problems.push(`${iso2} dollar price ${prev.dollarPrice} -> ${row.dollarPrice} (${(ch * 100).toFixed(0)}%) moves more than ${MAX_RELEASE_MOVE * 100}%`);
  }
  return { problems, warnings };
}

/**
 * Apply a release's PRICES to a cities document (pure). FX, rents and everything else are
 * left exactly as they are. -> { doc, changes: [{ key, encoded, official }] }
 */
export function applyBigMacPrices(doc, bm, { today = isoDate() } = {}) {
  const out = structuredClone(doc);
  const changes = [];
  const src = {
    name: `The Economist Big Mac index, source data v2 (release ${bm.date})`,
    class: 'open',
    url: BIG_MAC_CSV_URL,
    repo: BIG_MAC_REPO_URL,
    license: BIG_MAC_LICENSE,
    asOf: bm.date,
  };
  const used = new Set(out.cities.map((c) => c.country));
  const prev = (out.bigMac && out.bigMac.byCountry) || {};
  const byCountry = {};
  for (const iso2 of [...used].sort()) {
    const row = bm.byCountry[iso2];
    if (row) {
      byCountry[iso2] = row;
      if (!prev[iso2] || prev[iso2].dollarPrice !== row.dollarPrice) changes.push({ key: `bigMac.byCountry.${iso2}.dollarPrice`, encoded: prev[iso2] ? prev[iso2].dollarPrice : null, official: row.dollarPrice, unit: 'USD' });
    } else if (prev[iso2]) byCountry[iso2] = prev[iso2];
  }
  if (!out.bigMac || out.bigMac.asOf !== bm.date) changes.unshift({ key: 'bigMac.asOf', encoded: out.bigMac ? out.bigMac.asOf : null, official: bm.date });
  out.bigMac = { asOf: bm.date, source: src, byCountry };
  out.sourceNotes = { ...(out.sourceNotes || {}), 'big-mac': `${src.name}. ${BIG_MAC_LICENSE}. ${BIG_MAC_REPO_URL}` };
  for (const city of out.cities) {
    const row = bm.byCountry[city.country];
    if (!row) continue;
    city.bigMacUSD = row.dollarPrice;
    city.sources = city.sources || {};
    city.sources.bigMacUSD = {
      name: `The Economist Big Mac index: ${row.name}, ${row.localPrice} ${row.currency} at ${row.dollarEx}/USD`,
      url: src.url,
      asOf: bm.date,
      class: 'open',
      note: 'big-mac',
    };
  }
  if (changes.length) out.updated = today;
  return { doc: out, changes };
}

export async function check(ctx) {
  const id = 'bigmac-prices';
  try {
    const res = await ctx.fetchText(BIG_MAC_CSV_URL);
    const rows = parseCsv(res.text);
    const bm = latestBigMac(rows);
    const doc = ctx.readJson('data/cities.json');
    const { problems, warnings } = validateBigMac(doc, bm, { today: ctx.today });
    const evidence = [{ url: BIG_MAC_CSV_URL, fetchedAt: res.fetchedAt, excerpt: excerpt(res.text.split('\n').filter((l) => l.endsWith(bm.date)).slice(0, 4).join(' / ')) }];
    if (problems.length) {
      return [result(id, 'auto', 'flag', { summary: `Big Mac release ${bm.date || '?'} failed validation: ${problems.slice(0, 3).join('; ')}`, sourceAsOf: bm.date || null, evidence, findings: problems.map((p) => ({ key: 'validation', note: p })) })];
    }
    const { doc: next, changes } = applyBigMacPrices(doc, bm, { today: ctx.today });
    const before = formatDoc(doc);
    const after = formatDoc(next);
    if (!changes.length || before === after) {
      return [result(id, 'auto', 'ok', { summary: `latest release ${bm.date} already encoded (${Object.keys(doc.bigMac.byCountry).length} countries)`, sourceAsOf: bm.date, evidence })];
    }
    return [result(id, 'auto', 'changed', {
      summary: `new Big Mac release ${bm.date} (was ${doc.bigMac && doc.bigMac.asOf}): ${changes.length - 1} country price(s) changed${warnings.length ? `; ${warnings.join('; ')}` : ''}`,
      sourceAsOf: bm.date,
      findings: changes,
      evidence,
      writes: [{ file: 'data/cities.json', content: after }],
    })];
  } catch (err) {
    return [errorResult(id, 'auto', err)];
  }
}
