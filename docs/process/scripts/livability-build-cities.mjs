#!/usr/bin/env node
// One-off assembler for data/cities.json (livability workstream). Replayable:
//
//   node docs/process/scripts/livability-build-cities.mjs --csv <big-mac-source-data-v2.csv>
//   node docs/process/scripts/livability-build-cities.mjs            # fetches the CSV from GitHub raw
//
// It embeds every figure that was quoted from a web source (with the page and the
// month the page showed), derives costIndex the same way for every city, then hands
// the document to scripts/update-col.js (applyBigMac) for the machine-readable parts
// (Big Mac price, FX, USD conversions). Re-running it overwrites data/cities.json,
// so after the first build, refresh with `node scripts/update-col.js` instead and
// edit quoted figures in data/cities.json directly (see docs/LIVABILITY.md).
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normKey } from '../../../server/geo.js';
import { parseCsv, latestBigMac, applyBigMac, formatDoc, BIG_MAC_CSV_URL, CITIES_FILE } from '../../../scripts/update-col.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const RETRIEVED = '2026-10-02';
const NUMBEO = (slug) => `https://www.numbeo.com/cost-of-living/in/${slug}`;
const VIA = 'Read from the Numbeo page through web-search result snippets on 2026-10-02 (direct page fetches are blocked in the build sandbox). Numbeo is crowd-sourced and commercial: individual figures are quoted with attribution; the dataset is not redistributed.';

// New York City baseline (Numbeo, Sep 2026): single-person monthly costs excluding rent.
const NYC_SINGLE = { usd: 1665.2, eur: 1466.0 };

// [geoCity, region, country, currency, numbeoSlug, centre, outside, pageMonth, single, extra]
//   single: { usd?, eur?, local? } monthly single-person cost excl. rent as quoted
//   extra:  { tax, nearby, aliases, proxy, derive, publishedIndex, crossCheck, note, centreUrl }
const C = [
  // ---------------------------------------------------------------- United States
  ['San Francisco', 'CA', 'US', 'USD', 'San-Francisco', 3678.75, 2618.75, '2026-09', { usd: 1514.6 }, { publishedIndex: 90.32, crossCheck: zumper(4400, '2026-09', 'https://www.zumper.com/rent-research/national-rent-report', 'Zumper National Rent Report, Sep 2026: SF one-bedroom median at an all-time high, $180 below NYC') }],
  ['New York', 'NY', 'US', 'USD', 'New-York', 4370.50, 2976.47, '2026-09', { usd: 1665.2, eur: 1466.0 }, { tax: { local: 'NYC' }, nearby: ['Brooklyn'], crossCheck: zumper(4580, '2026-09', 'https://www.zumper.com/rent-research/national-rent-report', 'Zumper National Rent Report, Sep 2026: NYC one-bedroom median') }],
  ['Seattle', 'WA', 'US', 'USD', 'Seattle', 2454.06, 1955.80, '2026-09', { usd: 1565.0, eur: 1384.5 }, { crossCheck: zumper(1960, '2026-09', 'https://www.zumper.com/rent-research/seattle-wa', 'Zumper Seattle page (updated 29 Sep 2026): median one-bedroom') }],
  ['Boston', 'MA', 'US', 'USD', 'Boston', 3400.50, 2604.67, '2026-09', { usd: 1524.2 }, {}],
  ['Austin', 'TX', 'US', 'USD', 'Austin', 1924.00, 1288.33, '2026-09', { usd: 1177.0 }, { crossCheck: zumper(1520, '2026-09', 'https://www.zumper.com/rent-research/austin-tx', 'Zumper Austin page (updated 29 Sep 2026): median one-bedroom') }],
  ['Washington', 'DC', 'US', 'USD', 'Washington', 2688.12, 2196.36, '2026-09', { usd: 1594.9, eur: 1401.1 }, { crossCheck: zumper(2250, '2026-07', 'https://www.zumper.com/rent-research/washington-dc', 'Zumper Washington DC page (July 2026 data): one-bedroom') }],
  ['Los Angeles', 'CA', 'US', 'USD', 'Los-Angeles', 2549.80, 2375.00, '2026-09', { usd: 1484.7 }, { nearby: ['Santa Monica', 'El Segundo', 'Hawthorne', 'Torrance', 'Long Beach'] }],
  ['Chicago', 'IL', 'US', 'USD', 'Chicago', 2400.00, 1679.31, '2026-09', { usd: 1270.6 }, {}],
  ['Denver', 'CO', 'US', 'USD', 'Denver', 2026.54, 1678.08, '2026-09', { usd: 1304.8 }, { nearby: ['Aurora'] }],
  ['Atlanta', 'GA', 'US', 'USD', 'Atlanta', 2089.00, 1521.67, '2026-09', { usd: 1348.7 }, {}],
  ['Columbus', 'OH', 'US', 'USD', 'Columbus', 1543.62, 1102.89, '2026-09', { usd: 1219.3 }, { tax: { local: 'COLUMBUS' } }],
  ['Costa Mesa', 'CA', 'US', 'USD', 'Costa-Mesa', 2699.00, 2466.67, '2026-08', null, { proxy: 'irvine-ca-us' }],
  ['Huntsville', 'AL', 'US', 'USD', 'Huntsville', 1392.00, 986.12, '2026-08', { usd: 1049.6 }, {}],
  ['Reston', 'VA', 'US', 'USD', 'Reston', 2333.33, 1566.67, '2026-05', null, { proxy: 'arlington-va-us', nearby: ['Herndon', 'Chantilly', 'Dulles', 'Sterling', 'McLean', 'Tysons', 'Fairfax'] }],
  ['San Diego', 'CA', 'US', 'USD', 'San-Diego', 3344.71, 2382.86, '2026-09', { usd: 1407.6, eur: 1232.8 }, { nearby: ['Carlsbad'] }],
  ['Palo Alto', 'CA', 'US', 'USD', 'Palo-Alto', 3600.00, 3148.75, '2026-09', null, { proxy: 'san-jose-ca-us' }],
  ['San Jose', 'CA', 'US', 'USD', 'San-Jose', 3085.56, 2630.00, '2026-09', { usd: 1492.4 }, { nearby: ['Santa Clara', 'Cupertino'] }],
  ['Sunnyvale', 'CA', 'US', 'USD', 'Sunnyvale', 3292.50, 2912.50, '2026-09', null, { proxy: 'san-jose-ca-us' }],
  ['Mountain View', 'CA', 'US', 'USD', 'Mountain-View', 2898.75, 3028.33, '2026-08', null, { proxy: 'san-jose-ca-us', note: 'Numbeo shows outside-centre above centre for Mountain View (few submissions); kept as quoted.' }],
  ['Menlo Park', 'CA', 'US', 'USD', 'Menlo-Park-CA-United-States', 3166.67, 2266.67, '2026-05', null, { proxy: 'san-jose-ca-us', nearby: ['Redwood City'] }],
  ['Bellevue', 'WA', 'US', 'USD', 'Bellevue', 2734.00, 2055.00, '2026-06', null, { proxy: 'seattle-wa-us', nearby: ['Kirkland'] }],
  ['Redmond', 'WA', 'US', 'USD', 'Redmond', 2900.00, 2510.00, '2026-06', null, { proxy: 'seattle-wa-us' }],
  ['Cambridge', 'MA', 'US', 'USD', 'Cambridge-MA', 3425.00, 2877.50, '2026-06', null, { proxy: 'boston-ma-us' }],
  ['Arlington', 'VA', 'US', 'USD', 'Arlington', 2457.78, 1994.29, '2026-06', { usd: 1389.2 }, { nearby: ['Alexandria'] }],
  ['Dallas', 'TX', 'US', 'USD', 'Dallas', 1791.82, 1433.75, '2026-08', { usd: 1304.3 }, { nearby: ['Plano'] }],
  ['Houston', 'TX', 'US', 'USD', 'Houston', 1700.27, 1434.25, '2026-09', { usd: 1117.2 }, {}],
  ['Miami', 'FL', 'US', 'USD', 'Miami', 2600.00, 2158.46, '2026-08', { usd: 1449.4, eur: 1246.6 }, {}],
  ['Philadelphia', 'PA', 'US', 'USD', 'Philadelphia', 1971.19, 1354.15, '2026-09', { usd: 1385.3, eur: 1206.8 }, { tax: { local: 'PHILADELPHIA' } }],
  ['Pittsburgh', 'PA', 'US', 'USD', 'Pittsburgh', 1570.00, 1126.20, '2026-08', { usd: 1200.0 }, { tax: { local: 'PITTSBURGH' } }],
  ['Raleigh', 'NC', 'US', 'USD', 'Raleigh', 1742.22, 1281.20, '2026-08', { usd: 1170.2 }, { nearby: ['Durham'] }],
  ['Portland', 'OR', 'US', 'USD', 'Portland', 2036.19, 1585.64, '2026-09', { usd: 1501.2 }, { tax: { local: 'PORTLAND' } }],
  ['Salt Lake City', 'UT', 'US', 'USD', 'Salt-Lake-City', 1640.90, 1372.73, '2026-09', { usd: 1121.5 }, { nearby: ['Lehi'] }],
  ['Phoenix', 'AZ', 'US', 'USD', 'Phoenix', 1764.38, 1435.00, '2026-09', { usd: 1302.9 }, { nearby: ['Tempe', 'Scottsdale', 'Chandler', 'Mesa'] }],
  ['Minneapolis', 'MN', 'US', 'USD', 'Minneapolis', 1778.29, 1284.29, '2026-09', { usd: 1282.2, eur: 1126.4 }, {}],
  ['Baltimore', 'MD', 'US', 'USD', 'Baltimore', 1760.00, 1067.67, '2026-08', { usd: 1298.0, eur: 1122.7 }, { tax: { local: 'MD-COUNTY' }, nearby: ['Columbia', 'Fort Meade', 'Annapolis Junction'] }],
  ['Irvine', 'CA', 'US', 'USD', 'Irvine', 2890.00, 2432.50, '2026-06', { usd: 1302.1 }, { nearby: ['Santa Ana', 'Anaheim'] }],
  ['Colorado Springs', 'CO', 'US', 'USD', 'Colorado-Springs', 1731.43, 1533.33, '2026-07', { usd: 1276.3 }, {}],
  ['Boulder', 'CO', 'US', 'USD', 'Boulder', 2396.00, 1812.00, '2026-08', null, { derive: { from: 'colorado-springs-co-us', factor: 0.993, text: 'Numbeo city comparison: Boulder 0.7% cheaper than Colorado Springs excluding rent' } }],
  ['Detroit', 'MI', 'US', 'USD', 'Detroit', 1520.00, 937.40, '2026-07', { usd: 1181.5 }, { tax: { local: 'DETROIT' } }],
  ['Nashville', 'TN', 'US', 'USD', 'Nashville', 1932.44, 1398.22, '2026-08', { usd: 1242.0 }, {}],
  // ---------------------------------------------------------------- Europe
  ['London', 'England', 'GB', 'GBP', 'London', 2150.00, 1730.77, '2026-09', { eur: 1264.8, local: 1080.4 }, { publishedIndex: 85.9 }],
  ['Cambridge', 'England', 'GB', 'GBP', 'Cambridge', 1567.92, 1320.00, '2026-09', { usd: 1187.2, local: 887.9 }, {}],
  ['Oxford', 'England', 'GB', 'GBP', 'Oxford', 1710.00, 1272.50, '2026-06', { eur: 1063.7, local: 908.6 }, {}],
  ['Manchester', 'England', 'GB', 'GBP', 'Manchester', 1355.36, 942.82, '2026-09', { eur: 966.5, local: 828.7 }, {}],
  ['Edinburgh', 'Scotland', 'GB', 'GBP', 'Edinburgh', 1204.62, 896.67, '2026-09', { usd: 1192.5, local: 896.5 }, { tax: { region: 'SCT' } }],
  ['Dublin', null, 'IE', 'EUR', 'Dublin', 2202.00, 1979.79, '2026-09', { eur: 1092.8 }, {}],
  ['Zurich', null, 'CH', 'CHF', 'Zurich', 2512.86, 2026.88, '2026-09', { usd: 1859.3, local: 1549.8 }, { tax: { region: 'ZH' }, publishedIndex: '118.5 to 123.1 (Numbeo 2026 index as quoted in press coverage)' }],
  ['Geneva', null, 'CH', 'CHF', 'Geneva', 2312.50, 1752.00, '2026-09', { usd: 1664.1, local: 1379.5 }, { tax: { region: 'GE' } }],
  ['Paris', 'Ile-de-France', 'FR', 'EUR', 'Paris', 1386.05, 1032.64, '2026-09', { eur: 1046.4 }, { note: 'Low confidence: an earlier snippet for this page showed EUR 772 / 618 with these figures as the range maxima; a second, more specific snippet gave EUR 1,386.05 / 1,032.64 as the averages. Verify on the next manual refresh.' }],
  ['Berlin', null, 'DE', 'EUR', 'Berlin', 1316.15, 995.20, '2026-09', { usd: 1190.2, eur: 1049.3 }, {}],
  ['Munich', 'Bavaria', 'DE', 'EUR', 'Munich', 1512.75, 1126.69, '2026-09', { usd: 1223.4, eur: 1074.8 }, {}],
  ['Amsterdam', null, 'NL', 'EUR', 'Amsterdam', 2307.69, 1709.09, '2026-09', { usd: 1300.8, eur: 1134.4 }, {}],
  ['Madrid', null, 'ES', 'EUR', 'Madrid', 1341.15, 1042.93, '2026-09', { usd: 930.5, eur: 819.2 }, { tax: { region: 'MD' } }],
  ['Barcelona', null, 'ES', 'EUR', 'Barcelona', 1463.85, 1142.85, '2026-09', { eur: 827.3 }, { tax: { region: 'CT' } }],
  ['Lisbon', null, 'PT', 'EUR', 'Lisbon', 1419.23, 1067.20, '2026-09', { eur: 760.9 }, {}],
  ['Milan', null, 'IT', 'EUR', 'Milan', 1522.73, 1040.77, '2026-09', { eur: 1050.6 }, {}],
  ['Vienna', null, 'AT', 'EUR', 'Vienna', 1127.00, 809.38, '2026-09', { eur: 999.1 }, {}],
  ['Brussels', null, 'BE', 'EUR', 'Brussels', 1196.67, 1030.77, '2026-09', { usd: 1191.7, eur: 1054.2 }, {}],
  ['Stockholm', null, 'SE', 'SEK', 'Stockholm', 17000.00, 10636.25, '2026-09', { usd: 1274.6, local: 12641.3 }, {}],
  ['Copenhagen', null, 'DK', 'DKK', 'Copenhagen', 13311.82, 9691.67, '2026-09', { eur: 1207.7, local: 9028.1 }, {}],
  ['Oslo', null, 'NO', 'NOK', 'Oslo', 19234.73, 14519.08, '2026-09', { usd: 1533.0, local: 14577.2 }, {}],
  ['Helsinki', null, 'FI', 'EUR', 'Helsinki', 1095.23, 807.33, '2026-09', { eur: 1016.3 }, {}],
  ['Warsaw', null, 'PL', 'PLN', 'Warsaw', 4683.41, 3748.10, '2026-09', { local: 3531.3 }, {}],
  ['Krakow', null, 'PL', 'PLN', 'Krakow-Cracow', 3584.38, 2897.37, '2026-09', { usd: 872.0, local: 3349.5 }, {}],
  ['Prague', null, 'CZ', 'CZK', 'Prague', 24752.29, 21060.25, '2026-09', { eur: 803.9, local: 19638.3 }, {}],
  ['Tallinn', null, 'EE', 'EUR', 'Tallinn', 725.31, 513.12, '2026-09', { usd: 1088.5, eur: 956.3 }, {}],
  // ---------------------------------------------------------------- Middle East
  ['Tel Aviv', null, 'IL', 'ILS', 'Tel-Aviv-Yafo', 6696.43, 4966.15, '2026-08', { local: 4912.9 }, { note: 'The snippet gave a USD figure as "approximately"; the ILS figure is used.' }],
  ['Dubai', null, 'AE', 'AED', 'Dubai', 8842.11, 5559.76, '2026-09', { usd: 1143.7, local: 4200.4 }, {}],
  ['Abu Dhabi', null, 'AE', 'AED', 'Abu-Dhabi', 7222.14, 5069.17, '2026-09', { eur: 865.3, local: 3617.5 }, {}],
  ['Riyadh', null, 'SA', 'SAR', 'Riyadh', 4426.06, 3120.00, '2026-09', { usd: 900.4, local: 3382.0 }, {}],
  // ---------------------------------------------------------------- Asia-Pacific
  ['Tokyo', null, 'JP', 'JPY', 'Tokyo', 198131.58, 107070.59, '2026-09', { eur: 780.3, local: 139737.6 }, {}],
  ['Osaka', null, 'JP', 'JPY', 'Osaka', 110666.67, 80222.22, '2026-09', { usd: 787.0, local: 120767.4 }, {}],
  ['Seoul', null, 'KR', 'KRW', 'Seoul', 1188235.29, 831000.00, '2026-09', { eur: 984.0, local: 1517297.3 }, {}],
  ['Singapore', null, 'SG', 'SGD', 'Singapore', 3804.35, 2730.95, '2026-09', { usd: 1180.6, eur: 1049.6, local: 1510.3 }, {}],
  ['Hong Kong', null, 'HK', 'HKD', 'Hong-Kong', 17632.00, 13190.48, '2026-09', { local: 8913.6 }, {}],
  ['Taipei', null, 'TW', 'TWD', 'Taipei', 28210.53, 15384.62, '2026-09', { local: 27227.4 }, {}],
  ['Bengaluru', null, 'IN', 'INR', 'Bangalore', 30103.45, 17379.85, '2026-09', { eur: 309.0, local: 33805.7 }, { tax: { local: 'PROF-TAX' } }],
  ['Hyderabad', null, 'IN', 'INR', 'Hyderabad', 22380.95, 12647.30, '2026-08', null, { tax: { local: 'PROF-TAX' }, derive: { from: 'mumbai-in', factor: 0.839, text: 'Numbeo city comparison: Hyderabad 16.1% cheaper than Mumbai excluding rent' } }],
  ['Mumbai', null, 'IN', 'INR', 'Mumbai', 60500.00, 34478.26, '2026-09', { local: 36817.5 }, { tax: { local: 'PROF-TAX' } }],
  ['New Delhi', null, 'IN', 'INR', 'Delhi', 26416.67, 14740.00, '2026-09', { usd: 352.1, local: 33782.0 }, { nearby: ['Gurugram', 'Noida'] }],
  ['Sydney', 'NSW', 'AU', 'AUD', 'Sydney', 3645.00, 2610.38, '2026-10', { local: 1823.4 }, { note: 'A first snippet mixed in figures from Sydney, Nova Scotia; the Australian page (Oct 2026) was re-queried.' }],
  ['Melbourne', 'VIC', 'AU', 'AUD', 'Melbourne', 2435.44, 2005.65, '2026-09', { usd: 1220.0, local: 1738.8 }, {}],
  ['Auckland', null, 'NZ', 'NZD', 'Auckland', 2263.30, 2133.83, '2026-09', { usd: 1054.2, local: 1843.2 }, {}],
  // ---------------------------------------------------------------- Canada, Latin America
  ['Toronto', 'ON', 'CA', 'CAD', 'Toronto', 2282.89, 2020.15, '2026-10', { usd: 1008.7, local: 1436.5 }, {}],
  ['Ottawa', 'ON', 'CA', 'CAD', 'Ottawa', 2108.33, 1740.67, '2026-09', { usd: 1071.3, local: 1491.3 }, {}],
  ['Montreal', 'QC', 'CA', 'CAD', 'Montreal', 1740.74, 1386.59, '2026-09', { usd: 922.9, local: 1305.6 }, {}],
  ['Vancouver', 'BC', 'CA', 'CAD', 'Vancouver', 2507.24, 2155.77, '2026-09', { usd: 1002.0, local: 1421.0 }, {}],
  ['Mexico City', null, 'MX', 'MXN', 'Mexico-City', 19977.27, 13500.00, '2026-08', { local: 14161.3 }, { centreUrl: 'https://www.numbeo.com/cost-of-living/compare_cities.jsp?country1=Mexico&city1=Mexico+City&country2=Brazil&city2=Sao+Paulo' }],
  ['Sao Paulo', null, 'BR', 'BRL', 'Sao-Paulo', 3453.16, 2175.21, '2026-09', { usd: 702.7, local: 3598.3 }, {}],
];

function zumper(value, asOf, url, name) {
  return { name, value, currency: 'USD', url, asOf, kind: 'aggregator public report', note: 'Cross-check only (city-wide median, not city centre); not used in the formula.' };
}

export function cityKey(city, region, country) {
  const slug = normKey(city).replace(/ /g, '-');
  return ['US', 'CA', 'AU'].includes(country) && region ? `${slug}-${normKey(region).replace(/ /g, '-')}-${country.toLowerCase()}` : `${slug}-${country.toLowerCase()}`;
}

function singleUsd(single, fxPerUSD) {
  if (!single) return null;
  if (single.usd != null) return { usd: single.usd, basis: `$${single.usd} (USD as shown by Numbeo)`, ratio: single.usd / NYC_SINGLE.usd, nyc: `$${NYC_SINGLE.usd}` };
  if (single.eur != null) return { basis: `€${single.eur} (EUR as shown by Numbeo)`, ratio: single.eur / NYC_SINGLE.eur, nyc: `€${NYC_SINGLE.eur}` };
  if (single.local != null && fxPerUSD > 0) {
    const usd = single.local / fxPerUSD;
    return { usd, basis: `${single.local} local currency converted at the Big Mac data FX (${fxPerUSD}/USD) = $${usd.toFixed(1)}`, ratio: usd / NYC_SINGLE.usd, nyc: `$${NYC_SINGLE.usd}`, fx: true };
  }
  return null;
}

async function main(argv) {
  const i = argv.indexOf('--csv');
  const csv = i >= 0 ? await fs.readFile(path.resolve(argv[i + 1]), 'utf8') : await (await fetch(BIG_MAC_CSV_URL)).text();
  const bm = latestBigMac(parseCsv(csv));
  const fxOf = (cur) => (cur === 'USD' ? 1 : Object.values(bm.byCountry).find((r) => r.currency === cur)?.dollarEx);

  const cities = [];
  const byKey = new Map();
  for (const [city, region, country, currency, slug, centre, outside, month, single, extra] of C) {
    const key = cityKey(city, region, country);
    const page = NUMBEO(slug);
    const quote = (what) => ({
      name: `Numbeo, Cost of Living in ${city}: 1 bedroom apartment ${what} (rent per month, ${currency})`,
      url: page,
      asOf: month,
      retrieved: RETRIEVED,
      kind: 'aggregator (crowd-sourced, commercial)',
      via: VIA,
      ...(extra.note ? { note: extra.note } : {}),
    });
    const rec = {
      key,
      name: city,
      city,
      region: region || null,
      country,
      currency,
      aliases: extra.aliases || [],
      nearby: extra.nearby || [],
      tax: { country, region: extra.tax?.region ?? (country === 'US' ? region : ['CA'].includes(country) ? region : null), local: extra.tax?.local || null },
      rent1brCenterLocal: centre,
      rent1brOutsideLocal: outside,
      rent1brCenterUSD: null,
      rent1brOutsideUSD: null,
      costIndex: null,
      bigMacUSD: null,
      fxPerUSD: null,
      sources: {
        rent1brCenterLocal: { ...quote('in city centre'), ...(extra.centreUrl ? { url: extra.centreUrl } : {}), ...(extra.crossCheck ? { crossCheck: extra.crossCheck } : {}) },
        rent1brOutsideLocal: { ...quote('outside of centre'), ...(extra.centreUrl ? { url: extra.centreUrl } : {}) },
      },
    };
    const s = singleUsd(single, fxOf(currency));
    if (s) {
      rec.costIndex = Math.round(1000 * s.ratio) / 10;
      rec.sources.costIndex = {
        name: `Derived from Numbeo, Cost of Living in ${city}: estimated monthly costs for a single person, excluding rent`,
        url: page,
        asOf: month,
        retrieved: RETRIEVED,
        kind: 'derived from aggregator figure',
        method: `100 × ${s.basis} ÷ New York ${s.nyc} (Numbeo, 2026-09)`,
        via: VIA,
        ...(extra.publishedIndex != null ? { crossCheck: { name: 'Numbeo Cost of Living Index (NYC = 100, excl. rent)', value: extra.publishedIndex } } : {}),
      };
    }
    cities.push({ rec, extra, month, page });
    byKey.set(key, rec);
  }
  // Second pass: proxies and comparison-derived cost indexes (estimates).
  for (const { rec, extra, month, page } of cities) {
    if (rec.costIndex != null) continue;
    if (extra.proxy) {
      const p = byKey.get(extra.proxy);
      rec.costIndex = p.costIndex;
      rec.sources.costIndex = {
        name: `Estimated: ${p.name} cost index used for ${rec.name} (same metro area)`,
        url: p.sources.costIndex.url,
        asOf: p.sources.costIndex.asOf,
        estimated: true,
        method: `proxy: Numbeo shows no single-person estimate for ${rec.name}; uses ${p.key} (${p.costIndex}). See docs/LIVABILITY.md#estimates`,
      };
    } else if (extra.derive) {
      const p = byKey.get(extra.derive.from);
      rec.costIndex = Math.round(10 * p.costIndex * extra.derive.factor) / 10;
      rec.sources.costIndex = {
        name: `Estimated from ${extra.derive.text}`,
        url: `https://www.numbeo.com/cost-of-living/compare_cities.jsp`,
        cityPage: page,
        asOf: month,
        estimated: true,
        method: `${p.key} costIndex ${p.costIndex} × ${extra.derive.factor} (Numbeo comparison statement). See docs/LIVABILITY.md#estimates`,
      };
    } else {
      throw new Error(`${rec.key}: no cost index input`);
    }
  }

  const doc = {
    name: 'melon-seek cities: Juice Score inputs',
    description: 'Per-city rent, cost-of-living index, Big Mac price, FX and tax jurisdiction used by server/juice.js. Every numeric field has a sources entry (name, url, asOf). Estimates are marked estimated: true. See docs/LIVABILITY.md.',
    version: 1,
    updated: RETRIEVED,
    license: 'Numbeo figures are quoted individually with attribution (numbeo.com terms apply to their data). Big Mac data: The Economist, CC BY 4.0. Compilation: same license as this repository.',
    baseline: {
      nycBasketUSD: Math.round(NYC_SINGLE.usd * 12),
      monthlyUSD: NYC_SINGLE.usd,
      description: 'Annual single-person living costs excluding rent in New York City (Numbeo estimate × 12). Living cost for any city = costIndex / 100 × this.',
      sources: {
        nycBasketUSD: { name: 'Numbeo, Cost of Living in New York: estimated monthly costs for a single person excluding rent ($1,665.2 / €1,466.0) × 12', url: NUMBEO('New-York'), asOf: '2026-09', retrieved: RETRIEVED, via: VIA },
        crossCheck: { name: 'BLS Consumer Expenditure Survey 2024, one-person consumer units: total average annual expenditures $48,794 (includes shelter; personal insurance and pensions $4,329)', url: 'https://fred.stlouisfed.org/series/CXUTOTALEXPLB0502M', asOf: '2024', note: 'National average, all categories; shows the Numbeo basket is a lean, non-housing basket.' },
      },
    },
    fx: null,
    bigMac: null,
    cities: cities.map((c) => c.rec),
  };
  const { doc: out } = applyBigMac(doc, bm);
  await fs.writeFile(CITIES_FILE, formatDoc(out));
  console.log(`wrote ${path.relative(ROOT, CITIES_FILE)}: ${out.cities.length} cities, Big Mac ${bm.date}`);
}

main(process.argv.slice(2)).catch((err) => { console.error(err); process.exit(1); });
