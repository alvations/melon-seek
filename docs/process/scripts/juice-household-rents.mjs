#!/usr/bin/env node
// Adds 2- and 3-bedroom city-centre rents to data/cities.json (docs/process/juice-household.md,
// docs/LIVABILITY.md §4.2). Idempotent: re-running rewrites the same fields from the tables below.
//
//   node docs/process/scripts/juice-household-rents.mjs [--dry-run]
//
// Every figure below was read on 2026-10-10 from the official dataset named in its source,
// downloaded on a GitHub Actions runner by .github/workflows/juice-data-probe.yml (the agent
// sandbox cannot reach these hosts); the run logs are cited in the process log.
//
// Two methods:
//   direct  the official source publishes new-letting rents by bedroom count for the city centre,
//           on the same basis as a 1-bedroom figure: all three bedroom counts come from it
//           (class "official"), and the 1-bedroom figure is replaced too.
//   ratio   otherwise the city keeps its 1-bedroom figure, and the 2- and 3-bedroom rents are that
//           figure × the bedroom ratio published by an official source for the same city, region or
//           country (class "estimate", with the method and ratio recorded). Where no country source
//           was found, the pooled median of the official ratios below is used, and says so.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toUsdAt, formatDoc, validateDoc } from '../../../scripts/update-col.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const FILE = path.join(ROOT, 'data', 'cities.json');
const DOC_REF = 'docs/LIVABILITY.md §4.2';
const WEEKS = 52 / 12; // weekly rent -> monthly

// ------------------------------------------------------------------ official sources
const S = {
  nsw: {
    name: 'NSW Department of Communities and Justice, Rent and Sales Report, June quarter 2026: median weekly rent for new bonds, Sydney local government area (City of Sydney), flats and units',
    url: 'https://dcj.nsw.gov.au/about-us/families-and-communities-statistics/housing-rent-and-sales/rent-and-sales-report.html',
    file: 'https://dcj.nsw.gov.au/content/dam/dcj/dcj-website/documents/about-us/families-and-communities-statistics/housing-and-rent-sales/rent-tables-june-2026-quarter.xlsx',
    asOf: '2026-06', license: 'NSW Government open data (CC BY 4.0 per docs/LIVABILITY.md §7; licence line not re-read on the page)', class: 'official',
    note: 'New bonds lodged in the quarter, i.e. new leases. Flats and units: 1 bedroom $819, 2 bedrooms $1,150, 3 bedrooms $1,550 a week (2,862 / 1,737 / 277 new bonds). Monthly = weekly × 52 ÷ 12. Cross-check, postcode 2000 (the CBD): $915 / $1,400 / $2,300.',
  },
  ons: (area, month, beds) => ({
    name: `ONS Price Index of Private Rents, ${month}: mean monthly private rent by bedrooms, ${area} (1 bed £${beds[0]}, 2 bed £${beds[1]}, 3 bed £${beds[2]})`,
    url: 'https://www.ons.gov.uk/economy/inflationandpriceindices/datasets/priceindexofprivaterentsukmonthlypricestatistics',
    file: 'https://www.ons.gov.uk/file?uri=/economy/inflationandpriceindices/datasets/priceindexofprivaterentsukmonthlypricestatistics/16september2026/priceindexofprivaterentsukmonthlypricestatistics.xlsx',
    asOf: '2026-08', license: 'Open Government Licence v3.0', class: 'official',
    note: 'All private tenancies (not only new lets), Table 1 of the 16 September 2026 release.',
  }),
  rtb: {
    name: 'Residential Tenancies Board Rent Index via CSO PxStat table RIQ02, 2025 Q4: standardised average monthly rent for new tenancies, Dublin, all property types (1 bed €1,740.68, 2 bed €2,253.28, 3 bed €2,585.87)',
    url: 'https://data.cso.ie/table/RIQ02',
    file: 'https://ws.cso.ie/public/api.restful/PxStat.Data.Cube_API.ReadDataset/RIQ02/JSON-stat/2.0/en',
    asOf: '2025-12', license: 'CC BY 4.0 (CSO)', class: 'official',
    note: 'Quarter 2025 Q4 (table updated 2026-05-14). New tenancies registered with the RTB, county Dublin.',
  },
  zurich: {
    name: 'Statistik Stadt Zürich, Mietpreiserhebung April 2026: median net rent of private (not non-profit) flats let in the last 2 years, whole city, by rooms (2 rooms CHF 1,834, 3 rooms CHF 2,250, 4 rooms CHF 2,690; 2 / 3 / 4 rooms = 1 / 2 / 3 bedrooms)',
    url: 'https://data.stadt-zuerich.ch/dataset/bau_whg_mpe_mietpreis_raum_zizahl_gn_jahr_od5161',
    file: 'https://data.stadt-zuerich.ch/dataset/bau_whg_mpe_mietpreis_raum_zizahl_gn_jahr_od5161/download/BAU516OD5161.csv',
    asOf: '2026-04', license: 'Stadt Zürich Open Government Data (licence as stated on the dataset page)', class: 'official',
    note: 'Swiss room counts include the living room, so a 2-room flat has one bedroom.',
  },
  statcan: (cma, beds) => ({
    name: `Statistics Canada table 46-10-0092-01, Quarterly rent statistics, 2026 Q2: average asking rent for apartments by bedrooms, ${cma} census metropolitan area (1 bedroom $${beds[0]}, 2 bedrooms $${beds[1]}, 3 or more bedrooms $${beds[2]})`,
    url: 'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=4610009201',
    file: 'https://www150.statcan.gc.ca/n1/tbl/csv/46100092-eng.zip',
    asOf: '2026-04', license: 'Statistics Canada Open Licence', class: 'official',
    note: 'Asking rents of listed apartments (new lettings), produced with CMHC. REF_DATE 2026-04 is the second quarter.',
  }),
  hdb: {
    name: 'Housing & Development Board via data.gov.sg, median rent by town and flat type, 2026 Q2, Central Area: 3-room S$3,300, 4-room S$4,600 (3-room = 2 bedrooms, 4-room = 3 bedrooms)',
    url: 'https://data.gov.sg/datasets/d_23000a00c52996c55106084ed0339566/view',
    asOf: '2026-06', license: 'Singapore Open Data Licence', class: 'official',
    note: 'Public-housing flats; no 2-room (1-bedroom) median is published for the Central Area, so only the 3-bedroom ÷ 2-bedroom step (1.394) is taken from it.',
  },
  olap: {
    name: "Observatoire des loyers de l'agglomération parisienne (OLAP), loyers 2025, Paris intra-muros, tenants who moved in less than a year ago: median monthly rent excluding charges by rooms (2 rooms €1,180, 3 rooms €1,750, 4 or more rooms €2,548; 2 / 3 / 4+ rooms = 1 / 2 / 3+ bedrooms)",
    url: 'https://www.data.gouv.fr/fr/datasets/resultats-nationaux-des-observatoires-locaux-des-loyers/',
    file: 'https://www.observatoires-des-loyers.org/datagouv/2025/Base_OP_2025_Nationale.csv',
    asOf: '2025-01', license: 'Licence Ouverte / Open Licence 2.0', class: 'official',
    note: 'Rents at 1 January 2025 (data year 2025). The "4 or more rooms" class averages 99 m², so it overstates a typical 3-bedroom flat.',
  },
};

// Official bedroom ratios: [2-bedroom ÷ 1-bedroom, 3-bedroom ÷ 1-bedroom] and their source.
const R = {
  'GB-london': { r: [2232 / 1760, 2643 / 1760], src: S.ons('London', 'August 2026', [1760, 2232, 2643]) },
  'GB-cambridge': { r: [1613 / 1256, 1907 / 1256], src: S.ons('Cambridge', 'August 2026', [1256, 1613, 1907]) },
  'GB-oxford': { r: [1667 / 1351, 2034 / 1351], src: S.ons('Oxford', 'August 2026', [1351, 1667, 2034]) },
  'GB-manchester': { r: [1233 / 1003, 1433 / 1003], src: S.ons('Manchester', 'August 2026', [1003, 1233, 1433]) },
  'GB-scotland': { r: [911 / 702, 1172 / 702], src: S.ons('Scotland', 'August 2026', [702, 911, 1172]) },
  IE: { r: [2253.28 / 1740.68, 2585.87 / 1740.68], src: S.rtb },
  CH: { r: [2250 / 1834, 2690 / 1834], src: S.zurich },
  FR: { r: [1750 / 1180, 2548 / 1180], src: S.olap },
  'AU-sydney': { r: [1150 / 819, 1550 / 819], src: S.nsw },
  'CA-toronto': { r: [2650 / 2090, 3270 / 2090], src: S.statcan('Toronto', [2090, 2650, 3270]) },
  'CA-vancouver': { r: [3030 / 2280, 4150 / 2280], src: S.statcan('Vancouver', [2280, 3030, 4150]) },
  'CA-montreal': { r: [1820 / 1480, 2260 / 1480], src: S.statcan('Montréal', [1480, 1820, 2260]) },
  'CA-ottawa': { r: [2360 / 1900, 2740 / 1900], src: S.statcan('Ottawa - Gatineau (Ontario part)', [1900, 2360, 2740]) },
};

// ------------------------------------------------------------------ city assignments
// direct: official values for all three bedroom counts (monthly local currency).
const DIRECT = {
  'sydney-nsw-au': { beds: [819 * WEEKS, 1150 * WEEKS, 1550 * WEEKS], src: S.nsw },
};
// ratio: city key -> ratio key (cities not listed use the pooled ratio).
const RATIO_OF = {
  'london-gb': 'GB-london', 'cambridge-gb': 'GB-cambridge', 'oxford-gb': 'GB-oxford', 'manchester-gb': 'GB-manchester',
  'edinburgh-gb': 'GB-scotland', 'dublin-ie': 'IE', 'zurich-ch': 'CH', 'geneva-ch': 'CH', 'paris-fr': 'FR',
  'melbourne-vic-au': 'AU-sydney', // Victoria's Rental Report host timed out on every run; the NSW inner-city ratio stands in
  'toronto-on-ca': 'CA-toronto', 'vancouver-bc-ca': 'CA-vancouver', 'montreal-qc-ca': 'CA-montreal', 'ottawa-on-ca': 'CA-ottawa',
  'singapore-sg': 'SG',
};

// Pooled ratio: median of the non-US official ratios above (one per source, so London stands for the UK).
const POOL_KEYS = ['GB-london', 'IE', 'CH', 'FR', 'AU-sydney', 'CA-toronto'];
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const POOLED = [0, 1].map((i) => median(POOL_KEYS.map((k) => R[k].r[i])));
// Singapore: the pooled 2-bedroom ratio, then HDB's Central Area 4-room ÷ 3-room step for the third bedroom.
R.SG = { r: [POOLED[0], POOLED[0] * (4600 / 3300)], src: { ...S.hdb, name: `Pooled 2-bedroom ÷ 1-bedroom ratio ${POOLED[0].toFixed(3)}, then ${S.hdb.name}` } };

const brief = (s) => ({ name: s.name, url: s.url, asOf: s.asOf });

// ------------------------------------------------------------------ 1-bedroom audit (cross-checks)
// Official or open figures each audited city's 1-bedroom city-centre rent was compared with
// (docs/LIVABILITY.md §4.2, "Audit"). Recorded on sources.rent1brCenterLocal.audit; not used in the formula.
const SAFMR = (zips, median, lo, hi) => ({
  name: `HUD FY2026 Small Area Fair Market Rents, 1 bedroom, median of central ZIP codes ${zips} (range $${lo}-$${hi}); 40th-percentile gross rent incl. utilities`,
  url: 'https://www.huduser.gov/portal/datasets/fmr/smallarea/index.html', via: 'https://services.arcgis.com/VTyQ9soqVukalItT/ArcGIS/rest/services/HUD_PDR_Small_Area_Fair_Market_Rents/FeatureServer/1',
  asOf: '2025-10', value: median, class: 'official', basis: 'not the same measure: 40th percentile of recent movers incl. utilities, from survey data that lags the market',
});
const ZORI = (v) => ({ name: 'Zillow Observed Rent Index, city, all homes plus multifamily, August 2026 (smoothed)', url: 'https://www.zillow.com/research/data/', asOf: '2026-08', value: v, class: 'aggregator', basis: 'all unit sizes, market listings; cross-check only' });
export const AUDIT = {
  'san-francisco-ca-us': [SAFMR('94102-94111, 94133, 94158', 3025, 2510, 3910), ZORI(4682), { name: 'Zumper National Rent Report, September 2026, 1-bedroom median', url: 'https://www.zumper.com/rent-research/national-rent-report', asOf: '2026-09', value: 4400, class: 'aggregator', basis: 'listings, whole city; cross-check only' }],
  'new-york-ny-us': [SAFMR('10001-10038 (Manhattan)', 3990, 3270, 3990), ZORI(4154)],
  'seattle-wa-us': [SAFMR('98101, 98104, 98109, 98121, 98122', 2920, 1920, 3210), ZORI(2234)],
  'boston-ma-us': [SAFMR('02108-02116, 02210', 3510, 3090, 3710), ZORI(3338)],
  'austin-tx-us': [SAFMR('78701-78705', 2165, 1690, 2350), ZORI(1586)],
  'washington-dc-us': [SAFMR('20001, 20005, 20009, 20036, 20037', 2820, 2330, 3020), ZORI(2517)],
  'london-gb': [{ ...brief(S.ons('London', 'August 2026', [1760, 2232, 2643])), value: 1760, class: 'official', basis: 'mean of all private tenancies, London region' },
    { name: 'ONS Price Index of Private Rents, August 2026, mean 1-bedroom rent: Westminster £2,548, Kensington and Chelsea £2,640, Islington £2,178, Camden £2,054', url: S.ons('', '', [0, 0, 0]).url, asOf: '2026-08', value: 2548, class: 'official', basis: 'Westminster shown; central boroughs £2,054-£2,640' }],
  'zurich-ch': [{ name: 'Statistik Stadt Zürich, Mietpreiserhebung 2026: median net rent, private 2-room flats, Altstadt (Kreis 1), all tenancies (n = 58)', url: S.zurich.url, asOf: '2026-04', value: 2194, class: 'official', basis: 'city centre, all tenancies' },
    { name: 'Statistik Stadt Zürich, Mietpreiserhebung 2026: median net rent, private 2-room flats let in the last 2 years, whole city', url: S.zurich.url, asOf: '2026-04', value: 1834, class: 'official', basis: 'new tenancies, whole city' }],
  'toronto-on-ca': [{ ...brief(S.statcan('Toronto', [2090, 2650, 3270])), value: 2090, class: 'official', basis: 'asking rents, whole census metropolitan area' },
    { name: 'CMHC Rental Market Survey October 2025 (Statistics Canada table 34-10-0133-01): average rent, 1 bedroom, Toronto, row and apartment structures', url: 'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3410013301', asOf: '2025-10', value: 1761, class: 'official', basis: 'all occupied purpose-built rentals (sitting tenants)' }],
  'sydney-nsw-au': [{ name: 'NSW Rent and Sales Report, June quarter 2026, postcode 2000 (Sydney CBD), flats, 1 bedroom: $915 a week', url: S.nsw.url, asOf: '2026-06', value: Math.round(915 * WEEKS), class: 'official', basis: 'CBD postcode, new bonds' }],
  'singapore-sg': [{ name: 'HDB median rent 2026 Q2, Central Area: 3-room (2-bedroom) S$3,300, 4-room S$4,600; no 2-room (1-bedroom) median published', url: S.hdb.url, asOf: '2026-06', value: null, class: 'official', basis: 'public housing; no 1-bedroom figure to compare' }],
  'tokyo-jp': [{ name: 'Statistics Bureau of Japan, 2023 Housing and Land Survey: average monthly rent of rented dwellings, Tokyo ¥87,118 (as quoted by MUFG Bank)', url: 'https://www.e-stat.go.jp/', asOf: '2023-10', value: 87118, class: 'official', basis: 'all rented dwellings of every size and ward; not comparable to a central 1-bedroom' }],
  'paris-fr': [{ name: "OLAP loyers 2025, Paris intra-muros, 2-room flats, tenants who moved in less than a year ago: median €1,180 excluding charges", url: S.olap.url, asOf: '2025-01', value: 1180, class: 'official', basis: 'new tenants, whole of Paris' }],
  'berlin-de': [{ name: 'Investitionsbank Berlin, Wohnungsmarktbericht 2025: median asking rent €15.78/m² net cold (Mitte €20.00/m²); Berliner Mietspiegel 2024 average €7.21/m² (existing contracts)', url: 'https://www.ibb.de/de/publikationen/berliner-wohnungsmarkt/aktuelle-ausgabe.html', asOf: '2025', value: 1200, class: 'estimate', basis: 'Mitte asking rent × an assumed 60 m² (estimate; no official per-flat figure)' }],
  'dublin-ie': [{ ...brief(S.rtb), value: 1740.68, class: 'official', basis: 'new tenancies, county Dublin (city-centre postal districts are not published)' }],
};

const round2 = (x) => Math.round(x * 100) / 100;
const round3 = (x) => Math.round(x * 1000) / 1000;
const POOLED_URL = 'https://github.com/alvations/melon-seek/blob/main/docs/LIVABILITY.md#42-rent-by-number-of-bedrooms';

function setRent(c, n, local, source) {
  c[`rent${n}brCenterLocal`] = round2(local);
  c[`rent${n}brCenterUSD`] = toUsdAt(c[`rent${n}brCenterLocal`], c.fxPerUSD);
  c.sources[`rent${n}brCenterLocal`] = source;
  c.sources[`rent${n}brCenterUSD`] = {
    name: `rent${n}brCenterLocal ÷ fxPerUSD`,
    url: source.url,
    asOf: source.asOf,
    fxAsOf: c.sources.fxPerUSD?.asOf,
    class: source.class,
    ...(source.terms ? { terms: source.terms } : {}),
    ...(source.estimated ? { estimated: true, method: `see rent${n}brCenterLocal (${DOC_REF})` } : {}),
  };
}

// Short labels for the per-city source names (the full source text is in doc.bedroomRatios).
const LABEL = {
  'GB-london': 'ONS private rents, London, August 2026', 'GB-cambridge': 'ONS private rents, Cambridge, August 2026',
  'GB-oxford': 'ONS private rents, Oxford, August 2026', 'GB-manchester': 'ONS private rents, Manchester, August 2026',
  'GB-scotland': 'ONS private rents, Scotland, August 2026', IE: 'RTB new tenancies, Dublin, 2025 Q4',
  CH: 'Stadt Zürich new tenancies, April 2026', FR: 'OLAP new tenants, Paris, 2025', 'AU-sydney': 'NSW new bonds, Sydney local government area, June quarter 2026',
  'CA-toronto': 'Statistics Canada asking rents, Toronto, 2026 Q2', 'CA-vancouver': 'Statistics Canada asking rents, Vancouver, 2026 Q2',
  'CA-montreal': 'Statistics Canada asking rents, Montréal, 2026 Q2', 'CA-ottawa': 'Statistics Canada asking rents, Ottawa (Ontario part), 2026 Q2',
  SG: 'pooled official ratio and HDB Central Area 4-room ÷ 3-room, 2026 Q2',
  pooled: 'pooled official ratios (median of London, Dublin, Zurich, Paris, Sydney and Toronto)',
};

export function applyBedroomRents(doc, { usRatios = {} } = {}) {
  const out = structuredClone(doc);
  const log = [];
  const ratios = {};
  for (const c of out.cities) {
    c.sources = c.sources || {};
    const d = DIRECT[c.key];
    if (d) {
      const prev = c.rent1brCenterLocal;
      const prevSrc = c.sources.rent1brCenterLocal;
      const official = (n) => ({ ...brief(d.src), file: d.src.file, class: 'official', license: d.src.license, note: d.src.note, bedrooms: n });
      // The 1-bedroom figure moves to the official source as well (same basis for all three).
      c.rent1brCenterLocal = round2(d.beds[0]);
      c.rent1brCenterUSD = toUsdAt(c.rent1brCenterLocal, c.fxPerUSD);
      // Re-runs keep the record of the figure that was replaced the first time.
      const replaced = prevSrc?.class === 'official' && prevSrc?.url === d.src.url && prevSrc.replaced
        ? prevSrc.replaced
        : { value: prev, name: prevSrc?.name, url: prevSrc?.url, asOf: prevSrc?.asOf, class: prevSrc?.class, ...(prevSrc?.terms ? { terms: prevSrc.terms } : {}) };
      c.sources.rent1brCenterLocal = { ...official(1), replaced, ...(AUDIT[c.key] ? { audit: AUDIT[c.key] } : {}) };
      c.sources.rent1brCenterUSD = { name: 'rent1brCenterLocal ÷ fxPerUSD', url: d.src.url, asOf: d.src.asOf, fxAsOf: c.sources.fxPerUSD?.asOf, class: 'official' };
      setRent(c, 2, d.beds[1], { ...official(2), note: undefined });
      setRent(c, 3, d.beds[2], { ...official(3), note: undefined });
      log.push(`${c.key}: direct ${d.beds.map((x) => Math.round(x)).join(' / ')} (1-bedroom was ${replaced.value})`);
      continue;
    }
    const base = c.rent1brCenterLocal;
    if (base == null) continue;
    if (AUDIT[c.key]) c.sources.rent1brCenterLocal = { ...c.sources.rent1brCenterLocal, audit: AUDIT[c.key] };
    const us = c.country === 'US' ? usRatios[c.key] : null;
    const rk = us ? `US:${us.area}` : RATIO_OF[c.key] || 'pooled';
    const ratio = us ? { r: us.r, src: us.src } : rk !== 'pooled' ? R[rk] : { r: POOLED, src: null };
    const label = us ? `HUD FY2026 Fair Market Rents, ${us.area}` : LABEL[rk];
    ratios[rk] = ratio.src
      ? { label, ...brief(ratio.src), ...(ratio.src.via ? { via: ratio.src.via } : {}), ...(ratio.src.file ? { file: ratio.src.file } : {}), ...(ratio.src.license ? { license: ratio.src.license } : {}), ...(ratio.src.note ? { note: ratio.src.note } : {}), r2: round3(ratio.r[0]), r3: round3(ratio.r[1]) }
      : { label, name: `Median of the official ratios (${POOL_KEYS.join(', ')}), used where no official bedroom breakdown was found`, url: POOLED_URL, asOf: '2026-10', pooled: POOL_KEYS, r2: round3(POOLED[0]), r3: round3(POOLED[1]) };
    const baseSrc = c.sources.rent1brCenterLocal || {};
    for (const n of [2, 3]) {
      const r = ratio.r[n - 2];
      setRent(c, n, base * r, {
        name: `Estimate: 1-bedroom rent × ${r.toFixed(3)}, the ${n}-bedroom ÷ 1-bedroom ratio of ${label}`,
        url: ratio.src ? ratio.src.url : POOLED_URL,
        asOf: ratio.src ? ratio.src.asOf : '2026-10',
        class: 'estimate',
        estimated: true,
        method: `rent1brCenterLocal × ${r.toFixed(3)} (${DOC_REF})`,
        ratio: round3(r),
        ratioKey: rk,
        ...(baseSrc.terms ? { terms: baseSrc.terms } : {}),
      });
    }
    log.push(`${c.key}: ratio ${ratio.r.map((x) => x.toFixed(3)).join(' / ')} (${rk})`);
  }
  out.bedroomRatios = {
    description: 'Official bedroom ratios (2-bedroom ÷ 1-bedroom = r2, 3-bedroom ÷ 1-bedroom = r3) behind the estimated rent2brCenterLocal / rent3brCenterLocal fields (sources.*.ratioKey). See docs/LIVABILITY.md §4.2.',
    ...Object.fromEntries(Object.entries(ratios).sort(([a], [b]) => a.localeCompare(b))),
  };
  return { doc: out, log };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const doc = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const { US_RATIOS } = await import('./juice-household-hud.mjs');
  const { doc: next, log } = applyBedroomRents(doc, { usRatios: US_RATIOS });
  for (const l of log) console.log(l);
  console.log(`pooled ratio ${POOLED.map((x) => x.toFixed(3)).join(' / ')}`);
  const problems = validateDoc(next);
  if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
  if (process.argv.includes('--dry-run')) { console.log('(dry run)'); process.exit(0); }
  fs.writeFileSync(FILE, formatDoc(next));
  console.log(`wrote ${path.relative(ROOT, FILE)}`);
}
