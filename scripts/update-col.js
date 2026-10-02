#!/usr/bin/env node
// Refresh the machine-readable parts of data/cities.json (the Juice Score inputs).
//
//   node scripts/update-col.js                 fetch the latest Big Mac data from GitHub and update in place
//   node scripts/update-col.js --csv <file>    use a local copy of big-mac-source-data-v2.csv (offline / tests)
//   node scripts/update-col.js --dry-run       print what would change, write nothing
//   node scripts/update-col.js --out <file>    write somewhere other than data/cities.json
//
// What it refreshes (open, machine-readable source):
//   The Economist's Big Mac index source data (CC BY 4.0, github.com/TheEconomist/big-mac-data),
//   latest release date in the file:
//     - doc.bigMac.byCountry[ISO2]  local price, currency, dollar_ex, dollar price
//     - doc.fx.perUSD[currency]     local currency units per USD (Big Mac "dollar_ex")
//     - city.bigMacUSD, city.fxPerUSD
//     - city.rent1brCenterUSD / rent1brOutsideUSD, re-converted from the quoted local-currency
//       rents at the refreshed FX (the local quotes themselves are NOT touched)
//   and the matching `sources.*.asOf` dates.
//
// What it does NOT touch: quoted rents (local), costIndex, tax rules. Those come from sources
// without an open machine-readable feed; see docs/LIVABILITY.md "Refreshing" for the manual steps.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CITIES_FILE = path.join(ROOT, 'data', 'cities.json');
export const BIG_MAC_CSV_URL = 'https://raw.githubusercontent.com/TheEconomist/big-mac-data/master/source-data/big-mac-source-data-v2.csv';
export const BIG_MAC_REPO_URL = 'https://github.com/TheEconomist/big-mac-data';
export const BIG_MAC_LICENSE = 'Data CC BY 4.0, code MIT (The Economist)';

/** ISO 3166 alpha-3 (as used by the Big Mac data) -> alpha-2 (as used by server/geo.js). */
export const ISO3_TO_ISO2 = Object.freeze({
  USA: 'US', CAN: 'CA', MEX: 'MX', BRA: 'BR', ARG: 'AR', CHL: 'CL', COL: 'CO', PER: 'PE', URY: 'UY', CRI: 'CR',
  GBR: 'GB', IRL: 'IE', FRA: 'FR', DEU: 'DE', NLD: 'NL', BEL: 'BE', CHE: 'CH', AUT: 'AT', ITA: 'IT', ESP: 'ES',
  PRT: 'PT', SWE: 'SE', NOR: 'NO', DNK: 'DK', FIN: 'FI', EST: 'EE', LVA: 'LV', LTU: 'LT', POL: 'PL', CZE: 'CZ',
  HUN: 'HU', ROU: 'RO', BGR: 'BG', GRC: 'GR', HRV: 'HR', SVK: 'SK', SVN: 'SI', TUR: 'TR', UKR: 'UA', MDA: 'MD',
  ISR: 'IL', ARE: 'AE', SAU: 'SA', QAT: 'QA', KWT: 'KW', BHR: 'BH', OMN: 'OM', JOR: 'JO', LBN: 'LB', EGY: 'EG',
  ZAF: 'ZA', IND: 'IN', PAK: 'PK', JPN: 'JP', KOR: 'KR', CHN: 'CN', HKG: 'HK', TWN: 'TW', SGP: 'SG', MYS: 'MY',
  IDN: 'ID', PHL: 'PH', THA: 'TH', VNM: 'VN', AUS: 'AU', NZL: 'NZ',
});

/** Minimal RFC-4180-ish CSV parser (handles quoted fields). Returns array of row objects. */
export function parseCsv(text) {
  const rows = [];
  let field = '';
  let row = [];
  let quoted = false;
  const s = String(text).replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); if (row.some((x) => x !== '')) rows.push(row); }
  const [header, ...body] = rows;
  if (!header) return [];
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

/**
 * Latest release in the Big Mac source data: { date, byCountry: { ISO2: {...} } }.
 * Rows without a usable price or exchange rate are skipped.
 */
export function latestBigMac(rows) {
  let date = '';
  for (const r of rows) if (r.date && r.date > date) date = r.date;
  const byCountry = {};
  for (const r of rows) {
    if (r.date !== date) continue;
    const iso2 = ISO3_TO_ISO2[r.iso_a3];
    const localPrice = Number(r.local_price);
    const dollarEx = Number(r.dollar_ex);
    if (!iso2 || !(localPrice > 0) || !(dollarEx > 0)) continue;
    byCountry[iso2] = {
      name: r.name,
      currency: r.currency_code,
      localPrice,
      dollarEx,
      dollarPrice: round(localPrice / dollarEx, 2),
    };
  }
  return { date, byCountry };
}

function round(n, d = 0) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

/** USD conversion of a local-currency amount at `perUSD` units per dollar, rounded to whole dollars. */
export function toUsdAt(amountLocal, perUSD) {
  return amountLocal == null || !(perUSD > 0) ? null : Math.round(amountLocal / perUSD);
}

/**
 * Apply a parsed Big Mac release to a cities document. Pure: returns a new doc plus a list of
 * human-readable changes. Throws if the release is implausibly small (bad download).
 */
export function applyBigMac(doc, bm, { minCountries = 20 } = {}) {
  if (!bm || !bm.date || Object.keys(bm.byCountry).length < minCountries) {
    throw new Error(`Big Mac data looks incomplete (${bm ? Object.keys(bm.byCountry).length : 0} countries); refusing to update`);
  }
  const out = structuredClone(doc);
  const changes = [];
  const src = {
    name: `The Economist Big Mac index, source data v2 (release ${bm.date})`,
    url: BIG_MAC_CSV_URL,
    repo: BIG_MAC_REPO_URL,
    license: BIG_MAC_LICENSE,
    asOf: bm.date,
  };

  // Country table (only countries the dataset uses, so diffs stay small).
  const used = new Set(out.cities.map((c) => c.country));
  const prevBm = out.bigMac?.byCountry || {};
  const byCountry = {};
  for (const iso2 of [...used].sort()) {
    const row = bm.byCountry[iso2];
    if (row) byCountry[iso2] = row;
    else if (prevBm[iso2]) { byCountry[iso2] = prevBm[iso2]; changes.push(`bigMac ${iso2}: not in ${bm.date} release, kept previous`); }
  }
  if (out.bigMac?.asOf !== bm.date) changes.push(`bigMac release ${out.bigMac?.asOf || '(none)'} -> ${bm.date}`);
  out.bigMac = { asOf: bm.date, source: src, byCountry };

  // FX table (local units per USD), from the same release.
  const perUSD = { ...(out.fx?.perUSD || {}), USD: 1 };
  for (const iso2 of Object.keys(byCountry)) {
    const { currency, dollarEx } = byCountry[iso2];
    if (bm.byCountry[iso2]) perUSD[currency] = dollarEx;
  }
  out.fx = {
    asOf: bm.date,
    note: 'Local currency units per US dollar, from the Big Mac data "dollar_ex" column (Refinitiv/LSEG rates as published by The Economist).',
    source: { ...src, name: `The Economist Big Mac index source data v2, dollar_ex column (release ${bm.date})` },
    perUSD: Object.fromEntries(Object.entries(perUSD).sort(([a], [b]) => a.localeCompare(b))),
  };

  for (const city of out.cities) {
    city.sources = city.sources || {};
    const row = bm.byCountry[city.country];
    if (row) {
      if (city.bigMacUSD !== row.dollarPrice) changes.push(`${city.key}: bigMacUSD ${city.bigMacUSD} -> ${row.dollarPrice}`);
      city.bigMacUSD = row.dollarPrice;
      city.sources.bigMacUSD = {
        ...src,
        name: `The Economist Big Mac index (${row.name}, ${row.localPrice} ${row.currency} at ${row.dollarEx} ${row.currency}/USD)`,
      };
    }
    const fx = out.fx.perUSD[city.currency];
    if (fx > 0) {
      if (city.fxPerUSD !== fx) changes.push(`${city.key}: fxPerUSD ${city.fxPerUSD} -> ${fx}`);
      city.fxPerUSD = fx;
      city.sources.fxPerUSD = { ...out.fx.source };
      for (const [usdField, localField] of [['rent1brCenterUSD', 'rent1brCenterLocal'], ['rent1brOutsideUSD', 'rent1brOutsideLocal']]) {
        if (city[localField] == null) continue;
        const usd = toUsdAt(city[localField], fx);
        if (city[usdField] !== usd) changes.push(`${city.key}: ${usdField} ${city[usdField]} -> ${usd}`);
        city[usdField] = usd;
        const local = city.sources[localField] || {};
        city.sources[usdField] = {
          name: `${local.name || localField} converted to USD at ${fx} ${city.currency}/USD`,
          url: local.url || src.url,
          asOf: local.asOf || bm.date,
          fxAsOf: bm.date,
          method: `${localField} ÷ fxPerUSD`,
          ...(local.estimated ? { estimated: true } : {}),
        };
      }
    }
  }
  return { doc: out, changes };
}

/** Stable JSON text for data/cities.json (2-space indent, trailing newline). */
export function formatDoc(doc) {
  return JSON.stringify(doc, null, 2) + '\n';
}

async function readCsv(arg) {
  if (arg) return fs.readFile(path.resolve(arg), 'utf8');
  const res = await fetch(BIG_MAC_CSV_URL, { headers: { 'user-agent': 'melon-seek update-col' } });
  if (!res.ok) throw new Error(`GET ${BIG_MAC_CSV_URL} -> HTTP ${res.status}`);
  return res.text();
}

async function main(argv) {
  const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
  const dry = argv.includes('--dry-run');
  const outFile = path.resolve(opt('--out') || CITIES_FILE);
  const doc = JSON.parse(await fs.readFile(CITIES_FILE, 'utf8'));
  const bm = latestBigMac(parseCsv(await readCsv(opt('--csv'))));
  const { doc: next, changes } = applyBigMac(doc, bm);
  const before = formatDoc(doc);
  const after = formatDoc(next);
  if (before === after) {
    console.log(`cities.json already up to date (Big Mac release ${bm.date}).`);
    return;
  }
  next.updated = new Date().toISOString().slice(0, 10);
  console.log(`Big Mac release ${bm.date}: ${changes.length} change(s)`);
  for (const c of changes.slice(0, 40)) console.log(`  ${c}`);
  if (changes.length > 40) console.log(`  ... ${changes.length - 40} more`);
  if (dry) { console.log('(dry run, nothing written)'); return; }
  await fs.writeFile(outFile, formatDoc(next));
  console.log(`wrote ${path.relative(process.cwd(), outFile) || outFile}`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(`update-col failed: ${err.message}`);
    process.exit(1);
  });
}
