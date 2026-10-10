// Monthly refresh: rents and living costs (scripts/refresh/rents.js, scripts/refresh/living.js).
// Fixtures in test/fixtures/refresh/{rents,living}/ are real responses captured on a GitHub runner
// on 2026-10-10 (freshness-probe.yml runs listed in docs/process/freshness-col.md), trimmed to the
// rows the parsers read. Doctored variants are built here, in a temp directory, from those files.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeContext } from '../scripts/refresh/lib.js';
import * as rents from '../scripts/refresh/rents.js';
import * as living from '../scripts/refresh/living.js';
import { validateDoc, formatDoc, toUsdAt, RENT_PAIRS } from '../scripts/update-col.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIX = path.join(ROOT, 'test', 'fixtures', 'refresh');
const NOW = new Date('2026-10-10T12:00:00Z');
const TODAY = '2026-10-10';
const DOC = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cities.json'), 'utf8'));
const fix = (mod, f) => path.join(FIX, mod, f);
const readFix = (mod, f) => fs.readFileSync(fix(mod, f));
const jsonFix = (mod, f) => JSON.parse(readFix(mod, f).toString('utf8'));
const clone = (x) => structuredClone(x);

function ctxFor(moduleName, { fixturesDir = FIX, env = {} } = {}) {
  return makeContext({ moduleName, offline: true, now: NOW, root: ROOT, fixturesDir, registry: { entries: [] }, env, log: () => {} });
}
/** A temp fixtures dir: a copy of test/fixtures/refresh/<module>/ with some files replaced. */
function doctoredFixtures(moduleName, edits) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'refresh-col-'));
  const dst = path.join(dir, moduleName);
  fs.mkdirSync(dst, { recursive: true });
  for (const f of fs.readdirSync(path.join(FIX, moduleName))) fs.copyFileSync(fix(moduleName, f), path.join(dst, f));
  for (const [f, content] of Object.entries(edits)) fs.writeFileSync(path.join(dst, f), content);
  return dir;
}
const byId = (rs) => Object.fromEntries(rs.map((r) => [r.id, r]));

// ---------------------------------------------------------------- containers

test('readZip reads the real Statistics Canada zip (deflate, data descriptors)', () => {
  const z = rents.readZip(readFix('rents', 'statcan-46100092.zip'));
  assert.deepEqual(z.names.sort(), ['46100092.csv', '46100092_MetaData.csv']);
  const csv = z.read('46100092.csv').toString('utf8');
  assert.match(csv, /^﻿?"REF_DATE","GEO","DGUID","Rental unit type","Estimates"/);
  assert.throws(() => rents.readZip(Buffer.from('not a zip')), /not a zip/);
});

test('readXlsx reads the real NSW rent tables (shared strings, numeric cells, sheets)', () => {
  const book = rents.readXlsx(readFix('rents', 'nsw-rent-tables-june-2026-trimmed.xlsx'));
  assert.deepEqual(book.sheets, ['Explanatory Notes', 'LGA', 'Postcode']);
  const rows = book.rows('LGA');
  assert.equal(rows[0][0], 'Table 1. Weekly rents statistics by NSW Local Government Area');
  assert.equal(rows[1][0], 'Reporting period: April to June 2026');
  const pc = book.rows('Postcode').find((r) => r[0] === 2000);
  assert.equal(typeof pc[0], 'number');
  assert.equal(rents.columnIndex('A1'), 0);
  assert.equal(rents.columnIndex('AB12'), 27);
  assert.equal(rents.excelDate(46235), '2026-08-01');
});

// ---------------------------------------------------------------- parsers vs the encoded data

test('HUD eGIS: FY from the layer edit date, 30 areas whose ratios equal the encoded ones', () => {
  const { fy, editDate } = rents.parseHudLayer(jsonFix('rents', 'hud-fmr-layer.json'));
  assert.equal(editDate, '2025-09-30');
  assert.equal(fy, 2026);
  const areas = Object.keys(DOC.bedroomRatios).filter((k) => k.startsWith('US:')).map((k) => k.slice(3));
  assert.equal(areas.length, 30);
  const fam = rents.parseHudAreas(jsonFix('rents', 'hud-fmr-areas.json'), areas, fy);
  assert.deepEqual(fam.missing, []);
  assert.deepEqual(fam.ratios['US:San Francisco, CA HUD Metro FMR Area'].beds, [2977, 3604, 4604]);
  for (const [k, { beds, entry }] of Object.entries(fam.ratios)) {
    const e = DOC.bedroomRatios[k];
    assert.equal(rents.round3(beds[1] / beds[0]), e.r2, `${k} r2`);
    assert.equal(rents.round3(beds[2] / beds[0]), e.r3, `${k} r3`);
    assert.equal(entry.name, e.name, `${k} name`);
    assert.equal(entry.label, e.label, `${k} label`);
  }
});

test('Federal Register: newest FMR fiscal-year notice is FY2027 (2026-09-01), not the FY2026 revision', () => {
  const n = rents.parseFedRegFmr(jsonFix('rents', 'fedreg-fmr.json'));
  assert.equal(n.fy, 2027);
  assert.equal(n.date, '2026-09-01');
  assert.equal(n.number, '2026-17891');
  assert.equal(n.revised, false);
});

test('HUD USER API shape (documented; no token to capture a live answer)', () => {
  assert.equal(rents.parseHudApi(null), null);
  const v = rents.parseHudApi({ data: { basicdata: [{ zip_code: 'MSA level', 'One-Bedroom': 1, 'Two-Bedroom': 2, 'Three-Bedroom': 3, year: '2027' }] } });
  assert.deepEqual(v, { beds: [1, 2, 3], year: 2027 });
});

test('ONS: editions on the dataset page; the newest is the encoded 16 September 2026 file', () => {
  const eds = rents.parseOnsEditions(readFix('rents', 'ons-pipr-page.html').toString('utf8'));
  assert.ok(eds.length >= 20);
  assert.equal(eds[0].date, '2026-09-16');
  assert.equal(eds[0].url, DOC.bedroomRatios['GB-london'].file);
  assert.equal(rents.onsEditionOf(DOC.bedroomRatios['GB-london'].file), '2026-09-16');
});

test('ONS Table 1 rows (header and London figures as printed by juice-data-probe ons2) -> encoded entry', () => {
  // The 18.6 MB xlsx is parsed by readXlsx in production; these rows mirror the real header and
  // values of the 16 September 2026 release (juice-data-probe runs 38034075871 / 38034389341).
  const head = ['Time period', 'Area code', 'Area name', 'Region or country name', 'Index', 'Monthly change', 'Annual change', 'Rental price', 'Index one bed', 'Monthly change one bed', 'Annual change one bed', 'Rental price one bed', 'Index two bed', 'Monthly change two bed', 'Annual change two bed', 'Rental price two bed', 'Index three bed', 'Monthly change three bed', 'Annual change three bed', 'Rental price three bed'];
  const row = (t, area, b) => { const r = new Array(head.length).fill(''); r[0] = t; r[2] = area; r[11] = b[0]; r[15] = b[1]; r[19] = b[2]; return r; };
  const rows = [['Table 1'], head, row(46204, 'London', [1700, 2200, 2600]), row(46235, 'London', [1760, 2232, 2643]), row(46235, 'Oxford', [1351, 1667, 2034])];
  const fam = rents.parseOnsTable1(rows, { edition: '2026-09-16', fileUrl: DOC.bedroomRatios['GB-london'].file });
  assert.deepEqual(fam.ratios['GB-london'].beds, [1760, 2232, 2643]);
  const e = DOC.bedroomRatios['GB-london'];
  assert.equal(fam.ratios['GB-london'].entry.name, e.name);
  assert.equal(fam.ratios['GB-london'].entry.label, e.label);
  assert.equal(fam.ratios['GB-london'].entry.note, e.note);
  assert.equal(fam.ratios['GB-oxford'].entry.name, DOC.bedroomRatios['GB-oxford'].name);
  assert.equal(fam.sourceAsOf, '2026-08');
});

test('CSO RIQ02 JSON-RPC query: Dublin 2025 Q4 new tenancies = the encoded IE entry', () => {
  const fam = rents.parseCsoRiq02(jsonFix('rents', 'cso-riq02-dublin.json'));
  assert.deepEqual(fam.ratios.IE.beds, [1740.68, 2253.28, 2585.87]);
  assert.equal(fam.sourceAsOf, '2025-12');
  const e = DOC.bedroomRatios.IE;
  for (const k of ['name', 'label', 'note', 'asOf']) assert.equal(fam.ratios.IE.entry[k], e[k], k);
  assert.match(rents.CSO_QUERY_URL, /^https:\/\/ws\.cso\.ie\/public\/api\.jsonrpc\?data=/);
});

test('Stadt Zürich CSV: 2026 new private tenancies, whole city = the encoded CH entry', () => {
  const fam = rents.parseZurichCsv(readFix('rents', 'zurich-rents-whole-city.csv').toString('utf8'));
  assert.deepEqual(fam.ratios.CH.beds, [1834, 2250, 2690]);
  for (const k of ['name', 'label', 'asOf']) assert.equal(fam.ratios.CH.entry[k], DOC.bedroomRatios.CH[k], k);
});

test('OLAP: data.gouv.fr lists the 2025 national file; Paris new-tenant medians = the encoded FR entry', () => {
  const files = rents.parseOlapDataset(jsonFix('rents', 'olap-dataset.json'));
  assert.equal(files[0].year, 2025);
  assert.equal(files[0].url, DOC.bedroomRatios.FR.file);
  const fam = rents.parseOlapCsv(readFix('rents', 'olap-2025-paris.csv').toString('latin1'), files[0]);
  assert.deepEqual(fam.ratios.FR.beds, [1180, 1750, 2548]);
  for (const k of ['name', 'label', 'note', 'asOf', 'file']) assert.equal(fam.ratios.FR.entry[k], DOC.bedroomRatios.FR[k], k);
});

test('Statistics Canada 46-10-0092-01: 2026 Q2 asking rents for the four CMAs = the encoded entries', () => {
  const fam = rents.parseStatcanZip(readFix('rents', 'statcan-46100092.zip'));
  assert.deepEqual(fam.ratios['CA-toronto'].beds, [2090, 2650, 3270]);
  for (const k of ['CA-toronto', 'CA-vancouver', 'CA-montreal', 'CA-ottawa']) {
    for (const f of ['name', 'label', 'note', 'asOf']) assert.equal(fam.ratios[k].entry[f], DOC.bedroomRatios[k][f], `${k} ${f}`);
  }
});

test('HDB: Central Area 2026 Q2 3-room S$3,300, 4-room S$4,600 = the encoded SG entry', () => {
  const h = rents.parseHdb(jsonFix('rents', 'hdb-central-all.json'));
  assert.equal(h.quarter, '2026 Q2');
  assert.equal(h.r3m, 3300);
  assert.equal(h.r4m, 4600);
  const e = rents.sgEntry(DOC.bedroomRatios.pooled.r2, h);
  for (const k of ['name', 'label', 'note', 'asOf']) assert.equal(e[k], DOC.bedroomRatios.SG[k], k);
});

test('NSW: page lists the June 2026 quarter; LGA + postcode 2000 rows reproduce Sydney\'s encoded sources', () => {
  const eds = rents.parseNswEditions(readFix('rents', 'nsw-page.html').toString('utf8'));
  assert.equal(eds[0].asOf, '2026-06');
  const book = rents.readXlsx(readFix('rents', 'nsw-rent-tables-june-2026-trimmed.xlsx'));
  const lga = rents.parseNswLga(book.rows('LGA'));
  assert.deepEqual(lga.weekly, [819, 1150, 1550]);
  assert.deepEqual(lga.bonds, [2862, 1737, 277]);
  const cbd = rents.parseNswPostcode(book.rows('Postcode'));
  assert.deepEqual(cbd, [915, 1400, 2300]);
  const t = rents.nswTexts(eds[0], lga.weekly, lga.bonds, cbd);
  const syd = DOC.cities.find((c) => c.key === 'sydney-nsw-au');
  assert.equal(t.name, syd.sources.rent1brCenterLocal.name);
  assert.equal(t.note, syd.sources.rent1brCenterLocal.note);
  assert.equal(t.label, DOC.bedroomRatios['AU-sydney'].label);
  // Re-applying the same quarter changes nothing (exact schema round trip).
  const w = clone(DOC);
  const res = rents.applyNsw(w, eds[0], { ...lga, cbd });
  assert.deepEqual(res.changes, []);
  assert.equal(formatDoc(w), formatDoc(DOC));
});

test('every family, applied to the current data, is a no-op (the updater keeps the household agent\'s schema)', () => {
  const areas = Object.keys(DOC.bedroomRatios).filter((k) => k.startsWith('US:')).map((k) => k.slice(3));
  const fams = [
    rents.parseHudAreas(jsonFix('rents', 'hud-fmr-areas.json'), areas, 2026),
    rents.parseCsoRiq02(jsonFix('rents', 'cso-riq02-dublin.json')),
    rents.parseZurichCsv(readFix('rents', 'zurich-rents-whole-city.csv').toString('utf8')),
    rents.parseOlapCsv(readFix('rents', 'olap-2025-paris.csv').toString('latin1'), rents.parseOlapDataset(jsonFix('rents', 'olap-dataset.json'))[0]),
    rents.parseStatcanZip(readFix('rents', 'statcan-46100092.zip')),
  ];
  const w = clone(DOC);
  for (const f of fams) {
    assert.deepEqual(rents.validateFamily(w, f, { today: TODAY }).problems, []);
    assert.deepEqual(rents.applyFamily(w, f).changes, []);
  }
  assert.equal(formatDoc(w), formatDoc(DOC));
});

// ---------------------------------------------------------------- living parsers

test('BLS v1: CPI-U NY less shelter and the CE 2024 cross-check (one $23,261, two $41,922, four $56,160)', () => {
  const bls = living.parseBls(jsonFix('living', 'bls-v1-cpi-ce.json'));
  assert.equal(bls[living.CPI_NY_LESS_SHELTER][0].value, 307.227);
  const c = living.cpiChange(bls[living.CPI_NY_LESS_SHELTER], '2026-09');
  assert.equal(c.baseMonth, '2026-08');
  assert.equal(c.latestMonth, '2026-08');
  assert.equal(c.change, 0);
  const ce = living.ceRatios(bls);
  assert.equal(ce.year, 2024);
  assert.deepEqual([ce.spend.one, ce.spend.two, ce.spend.four], [23261, 41922, 56160]);
  assert.equal(ce.couple.toFixed(2), '1.80');
  assert.equal(ce.family.toFixed(2), '2.41');
  assert.throws(() => living.parseBls({ status: 'REQUEST_NOT_PROCESSED', message: ['daily threshold'] }), /REQUEST_NOT_PROCESSED/);
});

test('gov.scot HBAI table: after-housing-costs weights 0.58 / 0.42 / 0.20', () => {
  const t = living.parseEquivalenceTable(readFix('living', 'govscot-equivalisation.html').toString('utf8'));
  assert.equal(t.AHC['First Adult'], 0.58);
  assert.equal(t.AHC.Spouse, 0.42);
  assert.equal(t.AHC['Children aged under 14 years'], 0.2);
  assert.equal(t.BHC['First Adult'], 0.67);
  assert.equal(living.scaleFor({ firstAdult: 0.58, extraAdult: 0.42, child: 0.2 }, { adults: 2, children: 2 }).toFixed(3), '2.414');
});

// ---------------------------------------------------------------- validators

test('validateFamily: 1 < 2 < 3 bedrooms, ratio moves > 15% and level moves > 25% are problems', () => {
  const ok = { ratios: { IE: { beds: [1740.68, 2253.28, 2585.87], entry: { asOf: '2025-12' } } } };
  assert.deepEqual(rents.validateFamily(DOC, ok, { today: TODAY }).problems, []);
  const notRising = { ratios: { IE: { beds: [1740.68, 1700, 2585.87], entry: {} } } };
  assert.match(rents.validateFamily(DOC, notRising, { today: TODAY }).problems.join(' '), /do not rise/);
  const jump = { ratios: { 'US:San Francisco, CA HUD Metro FMR Area': { beds: [2977, 5000, 6000], entry: {} } } };
  const p = rents.validateFamily(DOC, jump, { today: TODAY }).problems.join(' ');
  assert.match(p, /r2 1\.211 -> 1\.68 moves/);
  assert.match(p, /2-bedroom level 3604 -> 5000/);
  const future = { sourceAsOf: '2027-01', ratios: {} };
  assert.match(rents.validateFamily(DOC, future, { today: TODAY }).problems.join(' '), /in the future/);
  const older = { ratios: { IE: { beds: [1740.68, 2253.28, 2585.87], entry: { asOf: '2025-09' } } } };
  assert.match(rents.validateFamily(DOC, older, { today: TODAY }).problems.join(' '), /older than the encoded/);
});

test('validateRentDoc: the current data passes (Mountain View outside > centre is a pre-existing warning)', () => {
  const { problems, warnings } = rents.validateRentDoc(DOC, DOC, { today: TODAY });
  assert.deepEqual(problems, []);
  assert.ok(warnings.some((w) => /mountain-view-ca-us/.test(w)));
});

test('validateRentDoc: quote moves > 25%, USD != local / FX, new outside >= centre, city changes, future asOf', () => {
  const bump = clone(DOC);
  const sf = bump.cities.find((c) => c.key === 'san-francisco-ca-us');
  sf.rent1brCenterLocal = Math.round(sf.rent1brCenterLocal * 1.3 * 100) / 100;
  sf.rent1brCenterUSD = toUsdAt(sf.rent1brCenterLocal, sf.fxPerUSD);
  assert.match(rents.validateRentDoc(bump, DOC, { today: TODAY }).problems.join(' '), /san-francisco-ca-us: rent1brCenterLocal .* moves 30\.0%/);
  const usd = clone(DOC);
  usd.cities[0].rent2brCenterUSD += 5;
  assert.match(rents.validateRentDoc(usd, DOC, { today: TODAY }).problems.join(' '), /rent2brCenterUSD .* != rent2brCenterLocal ÷ fxPerUSD/);
  const out = clone(DOC);
  const ldn = out.cities.find((c) => c.key === 'london-gb');
  ldn.rent1brOutsideLocal = ldn.rent1brCenterLocal + 1;
  ldn.rent1brOutsideUSD = toUsdAt(ldn.rent1brOutsideLocal, ldn.fxPerUSD);
  assert.match(rents.validateRentDoc(out, DOC, { today: TODAY }).problems.join(' '), /london-gb: outside-centre rent/);
  const fewer = clone(DOC);
  fewer.cities.pop();
  assert.match(rents.validateRentDoc(fewer, DOC, { today: TODAY }).problems.join(' '), /city count changed: 89 -> 88/);
  const renamed = clone(DOC);
  renamed.cities[3].key = 'somewhere-else';
  assert.match(rents.validateRentDoc(renamed, DOC, { today: TODAY }).problems.join(' '), /city keys/);
  const fut = clone(DOC);
  fut.cities[0].sources.rent1brOutsideLocal.asOf = '2026-11';
  assert.match(rents.validateRentDoc(fut, DOC, { today: TODAY }).problems.join(' '), /2026-11 is in the future/);
  const nourl = clone(DOC);
  delete nourl.cities[5].sources.costIndex.url;
  assert.match(rents.validateRentDoc(nourl, DOC, { today: TODAY }).problems.join(' '), /sources\.costIndex has no url/);
  const badRatio = clone(DOC);
  badRatio.bedroomRatios.IE.r3 = 1.1;
  assert.match(rents.validateRentDoc(badRatio, DOC, { today: TODAY }).problems.join(' '), /bedroomRatios\.IE: r2 1\.294 \/ r3 1\.1/);
});

test('inFuture compares at the precision given', () => {
  assert.equal(rents.inFuture('2026-10', TODAY), false);
  assert.equal(rents.inFuture('2026-11', TODAY), true);
  assert.equal(rents.inFuture('2026', TODAY), false);
  assert.equal(rents.inFuture('2026-10-11', TODAY), true);
  assert.equal(rents.dayOf('2026-06'), '2026-06-01');
});

// ---------------------------------------------------------------- check(): offline, real fixtures

test('rents check() offline: one Result per id; HUD FY2027 drift, the rest ok, Numbeo quotes stale', async () => {
  const rs = await rents.check(ctxFor('rents'));
  assert.deepEqual(rs.map((r) => r.id), [...rents.MODULE.ids]);
  const r = byId(rs);
  assert.equal(r['rents-us-hud-fmr'].status, 'drift');
  assert.equal(r['rents-us-hud-fmr'].mode, 'detect');
  assert.equal(r['rents-us-hud-fmr'].findings[0].official, 'FY2027');
  assert.ok(r['rents-us-hud-fmr'].checklist.some((s) => /HUD_API_TOKEN/.test(s)));
  for (const id of ['rents-gb-ons', 'rents-ie-rtb', 'rents-ch-zurich', 'rents-fr-olap', 'rents-ca-statcan', 'rents-sg-hdb', 'rents-nsw-official', 'rents-bedroom-ratios']) {
    assert.equal(r[id].status, 'ok', `${id}: ${r[id].summary}`);
    assert.deepEqual(r[id].writes, []);
  }
  assert.equal(r['rents-1br-quoted'].mode, 'manual');
  assert.equal(r['rents-1br-quoted'].status, 'stale');
  assert.equal(r['rents-1br-quoted'].sourceAsOf, '2026-05-01');
  assert.ok(r['rents-1br-quoted'].checklist.some((s) => /reston-va-us/.test(s)));
  for (const x of rs) {
    assert.ok(x.summary.length > 10, x.id);
    for (const e of x.evidence) assert.ok(String(e.excerpt).length <= 400);
  }
});

test('living check() offline: cost-index manual (stale cities listed), nyc-basket and living-scale ok', async () => {
  const rs = await living.check(ctxFor('living'));
  assert.deepEqual(rs.map((r) => r.id), [...living.MODULE.ids]);
  const r = byId(rs);
  assert.equal(r['cost-index'].mode, 'manual');
  assert.equal(r['cost-index'].status, 'stale');
  assert.ok(r['cost-index'].checklist.some((s) => /BEA Regional Price Parities/.test(s)));
  assert.equal(r['nyc-basket'].status, 'ok', r['nyc-basket'].summary);
  assert.equal(r['nyc-basket'].sourceAsOf, '2026-08-01');
  assert.equal(r['living-scale'].status, 'ok', r['living-scale'].summary);
});

test('check() never throws: no fixtures at all -> skipped / error, one Result per id', async () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'refresh-col-empty-'));
  for (const [mod, M] of [['rents', rents], ['living', living]]) {
    const rs = await M.check(ctxFor(mod, { fixturesDir: empty }));
    assert.deepEqual(rs.map((r) => r.id).sort(), [...M.MODULE.ids].sort());
    for (const x of rs) assert.ok(['skipped', 'error', 'ok', 'stale'].includes(x.status), `${x.id} ${x.status}`);
    assert.ok(rs.some((x) => x.status === 'skipped'));
  }
  // A broken repo file (unreadable cities.json) is an error per id, not a throw.
  const bad = { ...ctxFor('rents'), readJson: () => { throw new Error('boom'); } };
  const rs = await rents.check(bad);
  assert.equal(rs.length, rents.MODULE.ids.length);
  assert.ok(rs.every((x) => x.status === 'error'));
});

// ---------------------------------------------------------------- doctored fixtures

test('doctored HUD release (SF 2-bedroom $3,604 -> $5,000) is a flag; nothing is written', async () => {
  const j = jsonFix('rents', 'hud-fmr-areas.json');
  const f = j.features.find((x) => x.attributes.FMR_AREANAME === 'San Francisco, CA HUD Metro FMR Area');
  f.attributes.FMR_2BDR = 5000;
  const dir = doctoredFixtures('rents', { 'hud-fmr-areas.json': JSON.stringify(j) });
  const r = byId(await rents.check(ctxFor('rents', { fixturesDir: dir })));
  assert.equal(r['rents-us-hud-fmr'].status, 'flag');
  assert.match(r['rents-us-hud-fmr'].summary, /moves 38\.\d% \(> 15%\)/);
  assert.deepEqual(r['rents-us-hud-fmr'].writes, []);
  assert.ok(Object.values(r).every((x) => !x.writes.length));
});

test('doctored RTB quarter (Dublin 2-bed €2,253.28 -> €2,400): changed, pooled ratio re-derived, writes pass validateDoc', async () => {
  const j = jsonFix('rents', 'cso-riq02-dublin.json');
  const d = j.result;
  const tIdx = d.dimension['TLIST(Q1)'].category.index;
  const t = (Array.isArray(tIdx) ? tIdx : Object.keys(tIdx).sort((a, b) => tIdx[a] - tIdx[b])).indexOf('20254');
  const bIdx = d.dimension.C02970V03592.category.index;
  const b = (Array.isArray(bIdx) ? bIdx : Object.keys(bIdx).sort((x, y) => bIdx[x] - bIdx[y])).indexOf('02');
  const i = t * d.size[2] + b; // ids: STATISTIC, TLIST(Q1), bedrooms, property type, location (sizes 1, 73, 3, 1, 1)
  assert.equal(d.value[i], 2253.28);
  d.value[i] = 2400;
  const dir = doctoredFixtures('rents', { 'cso-riq02-dublin.json': JSON.stringify(j) });
  const rs = await rents.check(ctxFor('rents', { fixturesDir: dir }));
  const r = byId(rs);
  assert.equal(r['rents-ie-rtb'].status, 'changed', r['rents-ie-rtb'].summary);
  assert.equal(r['rents-bedroom-ratios'].status, 'changed', r['rents-bedroom-ratios'].summary);
  const w = r['rents-ie-rtb'].writes;
  assert.equal(w.length, 1);
  assert.equal(w[0].file, 'data/cities.json');
  assert.equal(r['rents-bedroom-ratios'].writes[0].content, w[0].content);
  const next = JSON.parse(w[0].content);
  assert.deepEqual(validateDoc(next), []);
  assert.deepEqual(rents.validateRentDoc(next, DOC, { today: TODAY }).problems, []);
  assert.equal(next.cities.length, DOC.cities.length);
  assert.deepEqual(next.cities.map((c) => c.key), DOC.cities.map((c) => c.key));
  // Dublin: 2-bed = 1-bed × 2400 / 1740.68 (cents), USD = local ÷ FX; IE entry rewritten.
  const dub = next.cities.find((c) => c.key === 'dublin-ie');
  const dub0 = DOC.cities.find((c) => c.key === 'dublin-ie');
  assert.equal(dub.rent2brCenterLocal, Math.round(dub0.rent1brCenterLocal * (2400 / 1740.68) * 100) / 100);
  assert.equal(dub.rent2brCenterUSD, toUsdAt(dub.rent2brCenterLocal, dub.fxPerUSD));
  assert.equal(dub.rent3brCenterLocal, dub0.rent3brCenterLocal);
  assert.equal(next.bedroomRatios.IE.r2, rents.round3(2400 / 1740.68));
  assert.match(next.bedroomRatios.IE.name, /2 bed €2,400\.00/);
  assert.equal(dub.sources.rent2brCenterLocal.ratio, next.bedroomRatios.IE.r2);
  // IE is a pooled member: the pooled r2 moved and every pooled city followed; Singapore's 2-bed too.
  assert.notEqual(next.bedroomRatios.pooled.r2, DOC.bedroomRatios.pooled.r2);
  assert.equal(next.bedroomRatios.pooled.asOf, '2026-10');
  const ber = next.cities.find((c) => c.key === 'berlin-de');
  assert.equal(ber.sources.rent2brCenterLocal.ratio, next.bedroomRatios.pooled.r2);
  assert.equal(next.bedroomRatios.SG.r2, next.bedroomRatios.pooled.r2);
  // Only rent fields, their sources and bedroomRatios changed; 1-bedroom quotes untouched.
  for (const c of next.cities) {
    const c0 = DOC.cities.find((x) => x.key === c.key);
    for (const f of ['rent1brCenterLocal', 'rent1brOutsideLocal', 'rent1brCenterUSD', 'rent1brOutsideUSD', 'costIndex', 'fxPerUSD', 'bigMacUSD']) assert.equal(c[f], c0[f], `${c.key} ${f}`);
  }
  for (const k of Object.keys(DOC)) if (!['cities', 'bedroomRatios'].includes(k)) assert.deepEqual(next[k], DOC[k], k);
});

test('a newer NSW quarter on the page: read from the xlsx when present (changed), else a drift alert', async () => {
  const html = readFix('rents', 'nsw-page.html').toString('utf8').replace(/rent-tables-june-2026-quarter\.xlsx/g, 'rent-tables-september-2026-quarter.xlsx');
  const newUrl = 'https://dcj.nsw.gov.au/content/dam/dcj/dcj-website/documents/about-us/families-and-communities-statistics/housing-and-rent-sales/rent-tables-september-2026-quarter.xlsx';
  // 1. No xlsx for the new quarter in the fixtures: detect-and-alert.
  let dir = doctoredFixtures('rents', { 'nsw-page.html': html });
  let r = byId(await rents.check(ctxFor('rents', { fixturesDir: dir })));
  assert.equal(r['rents-nsw-official'].status, 'drift');
  assert.equal(r['rents-nsw-official'].mode, 'detect');
  assert.equal(r['rents-nsw-official'].sourceAsOf, '2026-09-01');
  assert.ok(r['rents-nsw-official'].checklist.length);
  // 2. The (real, June) tables served as the new quarter's file: parsed and applied.
  const urls = jsonFix('rents', 'urls.json');
  urls[newUrl] = 'nsw-rent-tables-june-2026-trimmed.xlsx';
  dir = doctoredFixtures('rents', { 'nsw-page.html': html, 'urls.json': JSON.stringify(urls) });
  r = byId(await rents.check(ctxFor('rents', { fixturesDir: dir })));
  assert.equal(r['rents-nsw-official'].status, 'changed', r['rents-nsw-official'].summary);
  const next = JSON.parse(r['rents-nsw-official'].writes[0].content);
  const syd = next.cities.find((c) => c.key === 'sydney-nsw-au');
  assert.equal(syd.sources.rent1brCenterLocal.asOf, '2026-09');
  assert.match(syd.sources.rent2brCenterLocal.name, /September quarter 2026/);
  assert.equal(syd.sources.rent2brCenterLocal.file, newUrl);
  assert.equal(syd.rent1brCenterLocal, 3549);
  assert.deepEqual(validateDoc(next), []);
  const mel = next.cities.find((c) => c.key === 'melbourne-vic-au');
  assert.match(mel.sources.rent2brCenterLocal.name, /September quarter 2026/);
});

test('doctored living sources: CPI +4% since the basket month and a changed HBAI weight are drift alerts', async () => {
  const bls = jsonFix('living', 'bls-v1-cpi-ce.json');
  const s = bls.Results.series.find((x) => x.seriesID === living.CPI_NY_LESS_SHELTER);
  s.data.unshift({ year: '2026', period: 'M10', periodName: 'October', latest: 'true', value: String(Math.round(307.227 * 1.04 * 1000) / 1000), footnotes: [{}] });
  const html = readFix('living', 'govscot-equivalisation.html').toString('utf8').replace('<td>0.58</td>', '<td>0.60</td>');
  const dir = doctoredFixtures('living', { 'bls-v1-cpi-ce.json': JSON.stringify(bls), 'govscot-equivalisation.html': html });
  const r = byId(await living.check(ctxFor('living', { fixturesDir: dir })));
  assert.equal(r['nyc-basket'].status, 'drift');
  const f = r['nyc-basket'].findings.find((x) => /CPI-indexed/.test(x.key));
  assert.equal(f.official, Math.round(19982 * (Math.round(307.227 * 1.04 * 1000) / 1000) / 307.227));
  assert.equal(r['living-scale'].status, 'drift');
  assert.equal(r['living-scale'].findings[0].key, 'LIVING_SCALE.firstAdult');
});

test('quote staleness: every Numbeo-quoted field, due = page month + 92 + 30 days', () => {
  const rows = rents.quoteStaleness(DOC, TODAY);
  assert.ok(rows.length >= 170);
  assert.ok(!rows.some((x) => x.key === 'sydney-nsw-au' && x.field === 'rent1brCenterLocal'), 'official Sydney figure is not a quote');
  const r = rows.find((x) => x.key === 'reston-va-us' && x.field === 'rent1brCenterLocal');
  assert.equal(r.asOf, '2026-05');
  assert.equal(r.overdue, true);
  assert.ok(rows.filter((x) => x.asOf === '2026-09').every((x) => !x.overdue));
});

test('USD fields stay local ÷ FX after an FX change made earlier in the same run (overlay order)', () => {
  const w = clone(DOC);
  const dub = w.cities.find((c) => c.key === 'dublin-ie');
  dub.fxPerUSD = 0.9; // as if fx.js moved EUR earlier in the run
  for (const [u, l] of RENT_PAIRS) dub[u] = toUsdAt(dub[l], dub.fxPerUSD);
  const fam = { ratios: { IE: { beds: [1740.68, 2400, 2585.87], entry: { asOf: '2025-12' } } } };
  rents.applyFamily(w, fam);
  assert.equal(dub.rent2brCenterUSD, toUsdAt(dub.rent2brCenterLocal, 0.9));
  assert.deepEqual(validateDoc(w).filter((p) => p.startsWith('dublin-ie')), []);
});

test('orchestrator: run.js runs rents + living offline (dry run) with no registry problems and writes nothing', async () => {
  const { runRefresh, loadModules } = await import('../scripts/refresh/run.js');
  const mods = (await loadModules()).filter((m) => m.name === 'rents' || m.name === 'living');
  assert.deepEqual(mods.map((m) => m.name).sort(), ['living', 'rents']);
  const ids = mods.flatMap((m) => m.ids);
  const entries = ids.map((id) => ({ id, description: `test entry for ${id}`, type: 'static-data', owners: ['data/cities.json'], consumers: [{ at: 'server/juice.js', surface: 'drawer Juice block' }], source: { name: 'test', url: 'https://example.org/' }, asOf: '2026-09-01', cadence: 'monthly', mode: 'manual', updater: 'manual', checklist: ['x'], validator: 'test/refresh-col.test.js', before: 'none', lastChecked: '2026-10-01' }));
  const before = fs.readFileSync(path.join(ROOT, 'data', 'cities.json'), 'utf8');
  const rep = await runRefresh({ offline: true, dryRun: true, now: '2026-10-10', registry: { format: 'melon-freshness-1', entries }, modules: mods, log: () => {} });
  assert.deepEqual(rep.problems, []);
  assert.equal(rep.results.length, ids.length);
  assert.deepEqual(rep.dataFiles, []);
  assert.equal(rep.counts.error || 0, 0);
  assert.equal(fs.readFileSync(path.join(ROOT, 'data', 'cities.json'), 'utf8'), before);
});
