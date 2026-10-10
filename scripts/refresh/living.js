// Updater: the Juice Score's living-cost line (docs/DATA_FRESHNESS.md, docs/LIVABILITY.md §1, §4, §7).
//
//   living = costIndex / 100 × NYC basket × household scale
//
//   cost-index    per-city costIndex (New York = 100) in data/cities.json, derived from Numbeo's
//                 single-person estimates excluding rent (class aggregator / estimate, terms
//                 numbeo-terms). An aggregator figure: there is no open feed and the terms forbid
//                 automated collection, so mode 'manual': per-city staleness from each source's
//                 page month and a checklist. The official replacement (BEA Regional Price Parities
//                 for US metros, Eurostat / World Bank ICP price levels elsewhere) is the D6 plan in
//                 docs/LIVABILITY.md §7; it needs a decision and, for BEA, a BEA_API_KEY.
//   nyc-basket    NYC_BASKET_USD in server/juice.js and baseline.nycBasketUSD in data/cities.json
//                 ($19,982: Numbeo New York single-person basket × 12, page month 2026-09). Mode
//                 'detect': (1) the two copies must agree; (2) the BLS CPI-U for New York-Newark-
//                 Jersey City, all items less shelter (series CUURS12ASA0L2, not seasonally
//                 adjusted; BLS public API v1, no key) is compared between the baseline's page month
//                 and the latest month; a move of BASKET_DRIFT (3%) or more is a 'drift' alert with
//                 the CPI-indexed figure as the proposal. Nothing is written: the figure lives in
//                 code (server/juice.js) and is a Numbeo number, so a person decides.
//   living-scale  LIVING_SCALE in server/juice.js: the after-housing-costs modified OECD scale (DWP
//                 HBAI: first adult 0.58, further adults 0.42, children under 14 0.20). Product
//                 policy resting on an official methodology. Mode 'detect': (1) the weights are
//                 re-read from the Scottish Government's HBAI methodology page; (2) the BLS Consumer
//                 Expenditure Survey cross-check (spending excluding housing, insurance/pensions and
//                 cash contributions, two-person and four-person ÷ one-person units) is recomputed;
//                 a newer CE year than the one cited in server/juice.js is a review alert.
import { result, errorResult, daysBetween, extractConst, constInitializer } from './lib.js';

export const MODULE = Object.freeze({ name: 'living', ids: Object.freeze(['cost-index', 'nyc-basket', 'living-scale']) });

export const BLS_API = 'https://api.bls.gov/publicAPI/v1/timeseries/data/';
/** With the optional BLS_API_KEY secret the same request goes to v2 (higher daily limits). */
export const BLS_API_V2 = 'https://api.bls.gov/publicAPI/v2/timeseries/data/';
/** CPI-U, New York-Newark-Jersey City NY-NJ-PA (area S12A), all items less shelter (SA0L2), not seasonally adjusted. */
export const CPI_NY_LESS_SHELTER = 'CUURS12ASA0L2';
/** Same area, all items (reported for context only). */
export const CPI_NY_ALL = 'CUURS12ASA0';
/** CE by size of consumer unit: LB0502 one person, LB0504 two, LB0506 four (docs/LIVABILITY.md §1). */
export const CE_SIZES = Object.freeze({ one: 'LB0502', two: 'LB0504', four: 'LB0506' });
export const CE_ITEMS = Object.freeze(['TOTALEXP', 'HOUSING', 'INSPENSN', 'CASHCONT']);
export const CE_SERIES = Object.freeze(Object.values(CE_SIZES).flatMap((sz) => CE_ITEMS.map((it) => `CXU${it}${sz}M`)));
export const GOVSCOT_URL = 'https://www.gov.scot/publications/poverty-in-scotland-methodology/pages/income-equivalisation/';
/** A CPI move (between the basket's page month and the latest month) that warrants re-reading the basket. */
export const BASKET_DRIFT = 0.03;
export const COST_INDEX_CADENCE_DAYS = 92;
export const COST_INDEX_GRACE_DAYS = 30;

/** The single BLS v1 request (25 series max, no key): CPI first, then the CE series. */
export function blsRequest(year) {
  return { seriesid: [CPI_NY_LESS_SHELTER, CPI_NY_ALL, ...CE_SERIES], startyear: String(year - 2), endyear: String(year) };
}

// ---------------------------------------------------------------- parsers

/** BLS v1 response -> { [seriesId]: [{ year, period, month, value }] } (newest first; M13 annual averages dropped). */
export function parseBls(json) {
  if (!json || json.status !== 'REQUEST_SUCCEEDED') throw new Error(`BLS API: ${json ? json.status : 'no response'} ${json && json.message ? JSON.stringify(json.message).slice(0, 200) : ''}`);
  const out = {};
  for (const s of (json.Results && json.Results.series) || []) {
    out[s.seriesID] = (s.data || [])
      .filter((p) => p.period !== 'M13' && p.value !== '-' && Number.isFinite(Number(p.value)))
      .map((p) => ({ year: Number(p.year), period: p.period, month: /^M\d\d$/.test(p.period) ? Number(p.period.slice(1)) : null, value: Number(p.value) }))
      .sort((a, b) => b.year - a.year || (b.month || 0) - (a.month || 0));
  }
  return out;
}

/** CPI change between the basket's page month ('YYYY-MM') and the latest month. */
export function cpiChange(points, baseMonth) {
  const monthly = (points || []).filter((p) => p.month);
  if (!monthly.length) throw new Error('no monthly CPI points');
  const ym = (p) => `${p.year}-${String(p.month).padStart(2, '0')}`;
  const latest = monthly[0];
  const base = monthly.find((p) => ym(p) <= baseMonth);
  if (!base) throw new Error(`no CPI point at or before ${baseMonth}`);
  return { baseMonth: ym(base), base: base.value, latestMonth: ym(latest), latest: latest.value, change: latest.value / base.value - 1 };
}

/** CE spending excluding housing, insurance/pensions and cash contributions, per unit size, for the latest year with all series. */
export function ceRatios(bySeries) {
  const years = new Set();
  for (const id of CE_SERIES) for (const p of bySeries[id] || []) years.add(p.year);
  for (const year of [...years].sort((a, b) => b - a)) {
    const v = (it, sz) => { const p = (bySeries[`CXU${it}${sz}M`] || []).find((x) => x.year === year); return p ? p.value : null; };
    const spend = {};
    let ok = true;
    for (const [k, sz] of Object.entries(CE_SIZES)) {
      const parts = CE_ITEMS.map((it) => v(it, sz));
      if (parts.some((x) => x == null)) { ok = false; break; }
      spend[k] = parts[0] - parts[1] - parts[2] - parts[3];
    }
    if (ok) return { year, spend, couple: spend.two / spend.one, family: spend.four / spend.one };
  }
  return null;
}

/** The HBAI equivalence table on the gov.scot page -> { BHC: {...}, AHC: {...} } keyed by row label. */
export function parseEquivalenceTable(html) {
  const t = /<table\b[\s\S]*?<\/table>/i.exec(String(html));
  if (!t) throw new Error('gov.scot page: no table');
  const rows = [...t[0].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => [...m[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => c[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim()));
  const head = rows.find((r) => r.includes('BHC') && r.includes('AHC'));
  if (!head) throw new Error('gov.scot page: no BHC / AHC header');
  const iB = head.indexOf('BHC');
  const iA = head.indexOf('AHC');
  const out = { BHC: {}, AHC: {} };
  for (const r of rows) {
    if (r === head || r.length < Math.max(iA, iB) + 1) continue;
    const label = r[0];
    const b = Number(r[iB]);
    const a = Number(r[iA]);
    if (label && Number.isFinite(a) && Number.isFinite(b)) { out.BHC[label] = b; out.AHC[label] = a; }
  }
  if (!Object.keys(out.AHC).length) throw new Error('gov.scot page: no equivalence values');
  return out;
}

/** Living-cost multiplier for a household under a scale (same formula as server/juice.js livingScaleFor). */
export function scaleFor(scale, h) {
  return (scale.firstAdult + scale.extraAdult * Math.max(0, h.adults - 1) + scale.child * h.children) / scale.firstAdult;
}

/** Per-city staleness of the costIndex sources (page month + cadence + grace). */
export function costIndexStaleness(doc, today, { cadenceDays = COST_INDEX_CADENCE_DAYS, graceDays = COST_INDEX_GRACE_DAYS } = {}) {
  return doc.cities.map((c) => {
    const s = (c.sources && c.sources.costIndex) || {};
    const asOf = s.asOf || null;
    const day = asOf && /^\d{4}-\d{2}$/.test(asOf) ? `${asOf}-01` : asOf;
    const age = daysBetween(day, today);
    const due = age == null ? null : cadenceDays + graceDays - age;
    return { key: c.key, name: c.name, value: c.costIndex, class: s.class || null, estimated: !!s.estimated, asOf, url: s.url || null, method: s.method || null, ageDays: age, dueInDays: due, overdue: due != null && due < 0 };
  });
}

export const COST_INDEX_CHECKLIST = Object.freeze([
  'costIndex is an aggregator figure (Numbeo single-person estimate excluding rent ÷ New York\'s); the terms forbid automated collection and do not clear reuse (docs/LIVABILITY.md §4.1). Decision D6 (§7) is open: until then re-read by hand only.',
  'For each city below, open sources.costIndex.url, read "Estimated monthly costs for a single person (without rent)" (USD if shown, else EUR ÷ New York\'s EUR figure, else local ÷ fxPerUSD), and set costIndex = 100 × city ÷ New York (one decimal is enough); update sources.costIndex.method, asOf (page month) and retrieved.',
  'Re-read New York first: if its basket changed, update baseline.nycBasketUSD in data/cities.json AND NYC_BASKET_USD in server/juice.js (test/juice.test.js keeps them equal), then every city\'s costIndex.',
  'Metro proxies (Costa Mesa, Reston, Palo Alto, Sunnyvale, Mountain View, Menlo Park, Bellevue, Redmond, Cambridge MA) copy their metro\'s index; Boulder and Hyderabad are comparison-derived (docs/LIVABILITY.md §4 "Estimates").',
  'Official replacement (D6, not automatic yet): US metros from BEA Regional Price Parities (goods + other services, i.e. excluding housing; needs BEA_API_KEY), rescaled to New York MSA = 100; EU/EFTA from Eurostat price level indices (prc_ppp_ind, household consumption excluding housing); elsewhere World Bank ICP 2021 price levels extrapolated with CPI.',
  'Run `node --test test/juice.test.js test/juice-household.test.js`, then set lastChecked of cost-index in data/freshness.json.',
]);
export const BASKET_CHECKLIST = Object.freeze([
  'The NYC basket is Numbeo\'s New York single-person estimate excluding rent × 12 (docs/LIVABILITY.md §4); re-read it on the Numbeo New York page by hand (terms forbid scraping).',
  'Or, as an interim, index it by the BLS CPI-U New York all items less shelter (CUURS12ASA0L2) from the page month to the latest month: the proposed figure is in the finding.',
  'Change BOTH baseline.nycBasketUSD (and baseline.monthlyUSD, sources.nycBasketUSD.name/asOf) in data/cities.json and NYC_BASKET_USD in server/juice.js; test/juice.test.js fails if they differ.',
  'Re-generate the worked examples in docs/LIVABILITY.md §1 (living column) and run `npm test`.',
]);
export const SCALE_CHECKLIST = Object.freeze([
  'LIVING_SCALE (server/juice.js) is product policy resting on the DWP HBAI after-housing-costs modified OECD scale; review it yearly, when BLS publishes a new Consumer Expenditure Survey year (September) or when DWP changes its methodology.',
  'Compare the scale (couple 1.72, two adults + two children 2.41) with the CE ratios in the findings; a gap of more than ~15% is a reason to discuss changing the scale, not to change it automatically.',
  'If the scale or the cited CE year changes: update LIVING_SCALE and its comment in server/juice.js, the household table in docs/LIVABILITY.md §1, test/juice-household.test.js, and set lastChecked of living-scale in data/freshness.json.',
]);

// ---------------------------------------------------------------- the check

function readJuiceConsts(ctx) {
  const src = ctx.readText('server/juice.js');
  const basket = extractConst(src, 'NYC_BASKET_USD');
  const scale = extractConst(src, 'LIVING_SCALE');
  const households = extractConst(src, 'HOUSEHOLDS');
  const init = constInitializer(src, 'LIVING_SCALE') || '';
  const i = src.indexOf('export const LIVING_SCALE');
  const comment = i > 0 ? src.slice(Math.max(0, i - 1500), i) : '';
  const ceYear = Number((/Consumer Expenditure Survey (\d{4})/.exec(comment) || /Consumer Expenditure Survey (\d{4})/.exec(src) || [])[1]) || null;
  return { basket, scale, households, ceYear, hasScale: !!init };
}

export async function check(ctx) {
  const out = [];
  let doc;
  let consts;
  try {
    doc = ctx.readJson('data/cities.json');
    consts = readJuiceConsts(ctx);
  } catch (err) {
    return MODULE.ids.map((id) => errorResult(id, id === 'cost-index' ? 'manual' : 'detect', err));
  }

  // cost-index: manual, per-city staleness.
  try {
    const rows = costIndexStaleness(doc, ctx.today);
    const overdue = rows.filter((r) => r.overdue).sort((a, b) => a.dueInDays - b.dueInDays);
    const oldest = rows.map((r) => r.asOf).filter(Boolean).sort()[0] || null;
    const classes = {};
    for (const r of rows) classes[r.class || 'none'] = (classes[r.class || 'none'] || 0) + 1;
    const lines = overdue.map((r) => `${r.name} (${r.key}): costIndex ${r.value}, page month ${r.asOf}, ${-r.dueInDays} day(s) past due: ${r.url}`);
    const base = {
      sourceAsOf: oldest ? `${oldest}-01`.slice(0, 10) : null,
      findings: overdue.slice(0, 60).map((r) => ({ key: `${r.key}.costIndex`, encoded: r.value, unit: 'index (NYC = 100)', url: r.url, note: `page month ${r.asOf}, ${-r.dueInDays} day(s) past due${r.estimated ? '; estimate (proxy)' : ''}` })),
      checklist: [...COST_INDEX_CHECKLIST, ...lines],
    };
    const mix = Object.entries(classes).map(([k, v]) => `${v} ${k}`).join(', ');
    if (overdue.length) out.push(result('cost-index', 'manual', 'stale', { ...base, summary: `${overdue.length} of ${rows.length} cities' costIndex past due (page month + ${COST_INDEX_CADENCE_DAYS} + ${COST_INDEX_GRACE_DAYS} days; oldest ${oldest}; sources ${mix}); aggregator figure, no automatic feed` }));
    else {
      const next = rows.map((r) => r.dueInDays).filter((x) => x != null).sort((a, b) => a - b)[0];
      out.push(result('cost-index', 'manual', 'ok', { ...base, checklist: COST_INDEX_CHECKLIST.slice(), summary: `${rows.length} cities' costIndex within cadence (next due in ${next} day(s); sources ${mix}); aggregator figure, no automatic feed` }));
    }
  } catch (err) {
    out.push(errorResult('cost-index', 'manual', err));
  }

  // One BLS request serves both detect checks (v1 allows 25 series and ~25 requests a day per IP).
  let bls = null;
  let blsErr = null;
  let blsRes = null;
  try {
    const year = Number(ctx.today.slice(0, 4));
    const key = !ctx.offline && ctx.env && ctx.env.BLS_API_KEY;
    const body = { ...blsRequest(year), ...(key ? { registrationkey: key } : {}) };
    blsRes = await ctx.fetchText(key ? BLS_API_V2 : BLS_API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    bls = parseBls(JSON.parse(blsRes.text));
  } catch (err) { blsErr = err; }

  // nyc-basket: copies agree + CPI drift since the page month.
  try {
    const encoded = doc.baseline && doc.baseline.nycBasketUSD;
    const src = (doc.baseline && doc.baseline.sources && doc.baseline.sources.nycBasketUSD) || {};
    const findings = [];
    if (consts.basket !== encoded) findings.push({ key: 'NYC_BASKET_USD vs baseline.nycBasketUSD', encoded: consts.basket, official: encoded, unit: 'USD/yr', note: 'server/juice.js and data/cities.json disagree' });
    if (!bls) throw blsErr || new Error('BLS response missing');
    const cpi = cpiChange(bls[CPI_NY_LESS_SHELTER], String(src.asOf || '').slice(0, 7));
    const proposed = Math.round(encoded * (1 + cpi.change));
    const evidence = [{ url: BLS_API, fetchedAt: blsRes.fetchedAt, excerpt: `${CPI_NY_LESS_SHELTER} (CPI-U New York-Newark-Jersey City, all items less shelter, NSA): ${cpi.baseMonth} ${cpi.base} -> ${cpi.latestMonth} ${cpi.latest} (${(cpi.change * 100).toFixed(2)}%)${bls[CPI_NY_ALL] && bls[CPI_NY_ALL][0] ? `; all items ${bls[CPI_NY_ALL][0].year}-${String(bls[CPI_NY_ALL][0].month).padStart(2, '0')} ${bls[CPI_NY_ALL][0].value}` : ''}` }];
    const drift = Math.abs(cpi.change) >= BASKET_DRIFT;
    if (drift) findings.push({ key: 'baseline.nycBasketUSD (CPI-indexed)', encoded, official: proposed, unit: 'USD/yr', url: 'https://www.bls.gov/cpi/regional-resources.htm', note: `CPI-U NY less shelter ${cpi.baseMonth} -> ${cpi.latestMonth}: ${(cpi.change * 100).toFixed(1)}% (threshold ${BASKET_DRIFT * 100}%)` });
    const sourceAsOf = `${cpi.latestMonth}-01`;
    if (findings.length) out.push(result('nyc-basket', 'detect', 'drift', { summary: findings.map((f) => `${f.key}: ${f.encoded} vs ${f.official}`).join('; '), sourceAsOf, findings, evidence, checklist: BASKET_CHECKLIST.slice() }));
    else out.push(result('nyc-basket', 'detect', 'ok', { summary: `$${encoded.toLocaleString('en-US')} (Numbeo ${src.asOf}) in both copies; NY CPI less shelter moved ${(cpi.change * 100).toFixed(2)}% from ${cpi.baseMonth} to ${cpi.latestMonth} (alert at ${BASKET_DRIFT * 100}%), CPI-indexed figure $${proposed.toLocaleString('en-US')}`, sourceAsOf, evidence, checklist: BASKET_CHECKLIST.slice() }));
  } catch (err) {
    out.push(errorResult('nyc-basket', 'detect', err));
  }

  // living-scale: weights on the official page + CE cross-check year.
  try {
    const sc = consts.scale;
    if (!sc || !(sc.firstAdult > 0)) throw new Error('LIVING_SCALE not readable from server/juice.js');
    const findings = [];
    const evidence = [];
    const page = await ctx.fetchText(GOVSCOT_URL);
    const tab = parseEquivalenceTable(page.text);
    const a = tab.AHC;
    const official = { firstAdult: a['First Adult'], extraAdult: a.Spouse, child: a['Children aged under 14 years'] };
    evidence.push({ url: GOVSCOT_URL, fetchedAt: page.fetchedAt, excerpt: `AHC: first adult ${official.firstAdult}, spouse ${official.extraAdult}, subsequent adults ${a['Subsequent Adults']}, children under 14 ${official.child}, 14 and over ${a['Children aged 14 years and over']}` });
    for (const k of ['firstAdult', 'extraAdult', 'child']) if (!(Math.abs(official[k] - sc[k]) < 1e-9)) findings.push({ key: `LIVING_SCALE.${k}`, encoded: sc[k], official: official[k], url: GOVSCOT_URL, note: 'HBAI after-housing-costs weight differs' });
    if (a['Subsequent Adults'] != null && Math.abs(a['Subsequent Adults'] - sc.extraAdult) > 1e-9) findings.push({ key: 'LIVING_SCALE.extraAdult (subsequent adults)', encoded: sc.extraAdult, official: a['Subsequent Adults'], url: GOVSCOT_URL });
    const hh = consts.households || {};
    const couple = hh.couple ? scaleFor(sc, hh.couple) : null;
    const family = hh.family ? scaleFor(sc, hh.family) : null;
    let ce = null;
    if (bls) {
      ce = ceRatios(bls);
      if (ce) {
        evidence.push({ url: BLS_API, fetchedAt: blsRes.fetchedAt, excerpt: `BLS CE ${ce.year}, spending excluding housing, insurance/pensions and cash contributions: one person $${Math.round(ce.spend.one).toLocaleString('en-US')}, two $${Math.round(ce.spend.two).toLocaleString('en-US')}, four $${Math.round(ce.spend.four).toLocaleString('en-US')} (ratios ${ce.couple.toFixed(2)} / ${ce.family.toFixed(2)})` });
        if (consts.ceYear && ce.year > consts.ceYear) findings.push({ key: 'BLS CE cross-check year', encoded: consts.ceYear, official: ce.year, url: 'https://www.bls.gov/cex/tables.htm', note: `new CE year: couple ${ce.couple.toFixed(2)} vs scale ${couple && couple.toFixed(2)}, family ${ce.family.toFixed(2)} vs ${family && family.toFixed(2)}; review the scale` });
      }
    } else if (blsErr && blsErr.code !== 'FIXTURE_MISSING') ctx.log(`BLS CE cross-check skipped: ${blsErr.message}`);
    const summaryTail = `scale couple ${couple && couple.toFixed(3)}, family ${family && family.toFixed(3)}${ce ? `; BLS CE ${ce.year} ${ce.couple.toFixed(2)} / ${ce.family.toFixed(2)}` : '; CE cross-check unavailable'}`;
    if (findings.length) out.push(result('living-scale', 'detect', 'drift', { summary: `${findings.map((f) => `${f.key}: ${f.encoded} -> ${f.official}`).join('; ')} (${summaryTail})`, sourceAsOf: ce ? `${ce.year}-01-01` : null, findings, evidence, checklist: SCALE_CHECKLIST.slice() }));
    else out.push(result('living-scale', 'detect', 'ok', { summary: `HBAI AHC weights ${official.firstAdult} / ${official.extraAdult} / ${official.child} match LIVING_SCALE; ${summaryTail} (CE year cited in server/juice.js: ${consts.ceYear || '-'})`, sourceAsOf: ce ? `${ce.year}-01-01` : null, evidence, checklist: SCALE_CHECKLIST.slice() }));
  } catch (err) {
    out.push(errorResult('living-scale', 'detect', err));
  }
  return out;
}
