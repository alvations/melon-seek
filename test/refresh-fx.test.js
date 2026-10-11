// Monthly refresh: FX (scripts/refresh/fx.js) and Big Mac (scripts/refresh/bigmac.js) updaters,
// against responses captured from the real sources on a GitHub runner (freshness-probe.yml,
// runs 38036442949 and 38036645890, 2026-10-10): test/fixtures/refresh/{fx,bigmac}/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeContext, htmlToLines } from '../scripts/refresh/lib.js';
import * as fx from '../scripts/refresh/fx.js';
import * as bigmac from '../scripts/refresh/bigmac.js';
import { validateDoc, parseCsv, latestBigMac } from '../scripts/update-col.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIX = path.join(ROOT, 'test', 'fixtures', 'refresh');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const NOW = new Date('2026-10-10T12:00:00Z');
const noNet = () => { throw new Error('network used in an offline test'); };
const ctxFor = (moduleName, extra = {}) => makeContext({ moduleName, offline: true, now: NOW, fetchImpl: noNet, registry: { entries: [] }, ...extra });

// A fixed "before" state, independent of whatever FX the repo holds today (the monthly refresh
// moves it): every FX copy set to the Big Mac data's 2026-07-01 dollar_ex, read from the fixture.
const FX_FILES = ['data/cities.json', 'server/juice.js', 'public/viz/palette.js', 'server/salary.js', 'public/features/shared.js'];
function julyState() {
  const bm = latestBigMac(parseCsv(fs.readFileSync(path.join(FIX, 'bigmac', 'big-mac-source-data-v2.csv'), 'utf8')));
  assert.equal(bm.date, '2026-07-01');
  const perUSD = { USD: 1 };
  for (const r of Object.values(bm.byCountry)) perUSD[r.currency] = r.dollarEx;
  const files = new Map(FX_FILES.map((f) => [f, read(f)]));
  const doc = JSON.parse(files.get('data/cities.json'));
  const { doc: old } = fx.applyFxToCities(doc, { perUSD, asOf: '2026-07-01', period: '2026-07', basis: 'monthly' }, { today: '2026-07-01', name: 'Big Mac dollar_ex 2026-07-01 (test baseline)', url: 'https://github.com/TheEconomist/big-mac-data', license: 'CC BY 4.0', byCurrency: {}, urlFor: {} });
  files.set('data/cities.json', `${JSON.stringify(old, null, 2)}\n`);
  for (const f of ['server/juice.js', 'public/viz/palette.js', 'server/salary.js']) {
    let t = fx.rewriteTable(files.get(f), 'FX_PER_USD', perUSD).src;
    t = fx.rewriteDateConst(t, 'FX_AS_OF', '2026-07-01').src;
    files.set(f, t);
  }
  return files;
}
/** ctx whose repo reads see `files` first (the July baseline), then the disk. */
function ctxOn(files, extra) {
  const ctx = ctxFor('fx', extra);
  ctx.readText = (rel) => (files.has(rel) ? files.get(rel) : read(rel));
  ctx.readJson = (rel) => JSON.parse(ctx.readText(rel));
  return ctx;
}

test('fx parsers read the real ECB, FRED and Fed G.5 responses', () => {
  const ecb = fx.parseEcbMonthlyCsv(fs.readFileSync(path.join(FIX, 'fx', 'ecb-monthly-2026-09.csv'), 'utf8'));
  // The capture (2026-10-10) predates RON in the request (fix wave 4, MR-1); RON comes from the
  // daily rates when the monthly response lacks it (fx.js MONTHLY_GAP_MAX).
  for (const c of fx.ECB_CURRENCIES.filter((x) => x !== 'RON')) assert.ok(ecb[c] && ecb[c].perEUR > 0, c);
  assert.equal(ecb.USD.period, '2026-09');
  assert.ok(Math.abs(ecb.USD.perEUR - 1.1513227272727276) < 1e-12, 'September 2026 USD per EUR, as published');
  const daily = fx.parseEcbDailyXml(fs.readFileSync(path.join(FIX, 'fx', 'ecb-daily-2026-10-09.xml'), 'utf8'));
  assert.equal(daily.date, '2026-10-09');
  assert.equal(daily.perEUR.USD, 1.1206);
  assert.equal(daily.perEUR.GBP, 0.84763);
  assert.equal(daily.perEUR.RON, 5.3406, 'the ECB publishes the Romanian leu');
  assert.deepEqual(fx.parseFredCsv(fs.readFileSync(path.join(FIX, 'fx', 'fred-extaus.csv'), 'utf8')), { period: '2026-09', value: 31.7381 });
  assert.deepEqual(fx.parseFedG5(htmlToLines(fs.readFileSync(path.join(FIX, 'fx', 'fed-g5-2026-09.html'), 'utf8'))), { period: '2026-09', value: 31.7381 }, 'G.5 fallback agrees with FRED');
});

test('fx: cross rates through USD, pegs, and the as-of is the last day of the averaged month', () => {
  const t = fx.buildTable({ ecb: { period: '2026-09', perEUR: { USD: 1.25, GBP: 0.9, JPY: 150 } }, twd: { period: '2026-09', value: 31.5 } }, ['GBP', 'JPY', 'EUR', 'USD', 'AED', 'TWD']);
  assert.equal(t.perUSD.USD, 1);
  assert.equal(t.perUSD.EUR, 0.8);
  assert.equal(t.perUSD.GBP, 0.72);
  assert.equal(t.perUSD.JPY, 120);
  assert.equal(t.perUSD.AED, 3.6725);
  assert.equal(t.perUSD.TWD, 31.5);
  assert.equal(t.asOf, '2026-09-30');
  assert.deepEqual(t.missing, []);
  const d = fx.buildTable({ ecbDaily: { date: '2026-10-09', perEUR: { USD: 1.1206, GBP: 0.84763 } } }, ['GBP', 'TWD']);
  assert.equal(d.basis, 'daily');
  assert.deepEqual(d.missing, ['TWD'], 'a source that is down is reported, not invented');
});

test('fx validator: > 20% in a month is a flag, > 10% a warning, pegs and dates checked', () => {
  const prev = { USD: 1, GBP: 0.75, JPY: 150, AED: 3.6725 };
  assert.deepEqual(fx.validateFx(prev, { USD: 1, GBP: 0.76, JPY: 151, AED: 3.6725 }, { needed: Object.keys(prev) }).problems, []);
  const big = fx.validateFx(prev, { USD: 1, GBP: 0.95, JPY: 151, AED: 3.6725 }, { needed: Object.keys(prev) });
  assert.match(big.problems.join(), /GBP moved 26\.7%/);
  assert.match(fx.validateFx(prev, { USD: 1, GBP: 0.85, JPY: 151, AED: 3.6725 }, { needed: Object.keys(prev) }).warnings.join(), /GBP moved 13\.3%/);
  assert.match(fx.validateFx(prev, { USD: 1, GBP: 0.75, JPY: 150, AED: 3.9 }, { needed: Object.keys(prev) }).problems.join(), /AED .* peg/);
  assert.match(fx.validateFx(prev, { USD: 1, GBP: 0.75, JPY: 150 }, { needed: Object.keys(prev) }).problems.join(), /AED: no rate/);
  assert.match(fx.validateFx(prev, prev, { needed: ['USD'], asOf: '2027-01-31', today: '2026-10-10' }).problems.join(), /future/);
  assert.match(fx.validateFx(prev, prev, { needed: ['USD'], asOf: '2026-05-31', prevAsOf: '2026-07-01' }).problems.join(), /older/);
});

test('fx: rewriting a code table keeps its keys, order and layout', () => {
  const src = "// x\nexport const FX_AS_OF = '2026-07-01';\nexport const FX_PER_USD = Object.freeze({\n  AED: 3.67285,\n  GBP: 0.74187,\n  USD: 1,\n});\nconst EXTRA = Object.freeze({ QAR: 3.64, CNY: 7.14 });\n";
  const t = fx.rewriteTable(src, 'FX_PER_USD', { GBP: 0.745338, AED: 3.6725, ZZZ: 9 });
  assert.ok(t.found);
  assert.match(t.src, /export const FX_PER_USD = Object\.freeze\(\{\n {2}AED: 3\.6725,\n {2}GBP: 0\.745338,\n {2}USD: 1,\n\}\);/);
  assert.doesNotMatch(t.src, /ZZZ/, 'never adds a key');
  assert.deepEqual(t.changed.map((c) => c.key), ['FX_PER_USD.AED', 'FX_PER_USD.GBP']);
  const e = fx.rewriteTable(t.src, 'EXTRA', { CNY: 6.69 });
  assert.match(e.src, /const EXTRA = Object\.freeze\(\{ QAR: 3\.64, CNY: 6\.69 \}\);/);
  const d = fx.rewriteDateConst(e.src, 'FX_AS_OF', '2026-09-30');
  assert.ok(d.changed);
  assert.match(d.src, /FX_AS_OF = '2026-09-30'/);
  assert.equal(fx.rewriteTable(src, 'NOPE', {}).found, false);
  const sh = fx.rewriteSharedFallback("export const FX_FALLBACK = Object.freeze({ ...(palette.FX_TO_USD || { USD: 1 }), CNY: 0.14 });", { CNY: 6.69 });
  assert.match(sh.src, /CNY: 0\.1495 \}\);$/);
});

/** Write the module's proposed files into a scratch tree and load them as modules. */
async function materialize(writes, base = new Map()) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'refresh-fx-'));
  const put = (rel, text) => { const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
  for (const rel of ['server/juice.js', 'server/geo.js', 'public/viz/palette.js', 'server/salary.js', 'data/cities.json']) put(rel, base.get(rel) ?? read(rel));
  for (const w of writes) put(w.file, w.content);
  const load = (rel) => import(`${pathToFileURL(path.join(dir, rel)).href}?t=${Date.now()}`);
  return { dir, load, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test('fx check() offline: one validated update across cities.json and every code copy', async () => {
  const base = julyState();
  const [r] = await fx.check(ctxOn(base));
  assert.equal(r.id, 'fx-per-usd');
  assert.equal(r.status, 'changed', r.summary);
  assert.equal(r.sourceAsOf, '2026-09-30');
  const files = r.writes.map((w) => w.file).sort();
  for (const f of ['data/cities.json', 'public/viz/palette.js', 'server/juice.js', 'server/salary.js']) assert.ok(files.includes(f), `writes ${f}`);
  const t = await materialize(r.writes, base);
  try {
    const doc = JSON.parse(fs.readFileSync(path.join(t.dir, 'data/cities.json'), 'utf8'));
    assert.deepEqual(validateDoc(doc), [], 'USD rents re-derived at the new FX');
    assert.equal(doc.fx.asOf, '2026-09-30');
    assert.equal(doc.fx.perUSD.AED, 3.6725);
    for (const c of doc.cities) assert.equal(c.fxPerUSD, doc.fx.perUSD[c.currency], c.key);
    assert.equal(doc.bigMac.asOf, JSON.parse(read('data/cities.json')).bigMac.asOf, 'Big Mac untouched by the FX updater');
    const juice = await t.load('server/juice.js');
    const palette = await t.load('public/viz/palette.js');
    const salary = await t.load('server/salary.js');
    assert.equal(juice.FX_AS_OF, '2026-09-30');
    assert.equal(palette.FX_AS_OF, '2026-09-30');
    for (const [c, v] of Object.entries(palette.FX_PER_USD)) {
      assert.equal(juice.FX_PER_USD[c], v, `juice ${c}`);
      assert.equal(salary.FX_PER_USD[c], v, `salary ${c}`);
      assert.equal(doc.fx.perUSD[c], v, `cities.json ${c}`);
    }
  } finally { t.cleanup(); }
});

test('fx check() is idempotent: on the refreshed tree it reports ok', async () => {
  const base = julyState();
  const [first] = await fx.check(ctxOn(base));
  assert.equal(first.status, 'changed');
  const files = new Map([...base, ...first.writes.map((w) => [w.file, w.content])]);
  const [second] = await fx.check(ctxOn(files));
  assert.equal(second.status, 'ok', second.summary);
  assert.deepEqual(second.writes, []);
});

test('fx check(): a doctored month with a 30% move is flagged and writes nothing', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'refresh-fxfix-'));
  try {
    fs.mkdirSync(path.join(dir, 'fx'));
    const csv = fs.readFileSync(path.join(FIX, 'fx', 'ecb-monthly-2026-09.csv'), 'utf8')
      .replace(/(EXR\.M\.GBP\.EUR\.SP00\.A,M,GBP,EUR,SP00,A,2026-09,)[\d.]+/, '$11.12');
    fs.writeFileSync(path.join(dir, 'fx', 'm.csv'), csv);
    fs.copyFileSync(path.join(FIX, 'fx', 'fred-extaus.csv'), path.join(dir, 'fx', 'f.csv'));
    fs.writeFileSync(path.join(dir, 'fx', 'urls.json'), JSON.stringify({ [fx.ECB_MONTHLY_URL]: 'm.csv', [fx.FRED_TWD_URL]: 'f.csv' }));
    const [r] = await fx.check(ctxOn(julyState(), { fixturesDir: dir }));
    assert.equal(r.status, 'flag', r.summary);
    assert.match(r.summary, /GBP moved/);
    assert.deepEqual(r.writes, []);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('fx check(): ECB monthly down -> daily fallback; nothing reachable -> error, never ok', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'refresh-fxfix-'));
  try {
    fs.mkdirSync(path.join(dir, 'fx'));
    fs.copyFileSync(path.join(FIX, 'fx', 'ecb-daily-2026-10-09.xml'), path.join(dir, 'fx', 'd.xml'));
    fs.writeFileSync(path.join(dir, 'fx', 'urls.json'), JSON.stringify({ [fx.ECB_DAILY_URL]: 'd.xml' }));
    // online-style failures: a fetch that answers 503 for the monthly API
    const fetchImpl = async (url) => {
      if (url === fx.ECB_DAILY_URL) return new Response(fs.readFileSync(path.join(dir, 'fx', 'd.xml')), { status: 200 });
      return new Response('down', { status: 503 });
    };
    const live = makeContext({ moduleName: 'fx', now: NOW, fetchImpl, registry: { entries: [] } });
    const base = julyState();
    live.readText = (rel) => (base.has(rel) ? base.get(rel) : read(rel));
    live.readJson = (rel) => JSON.parse(live.readText(rel));
    const [r] = await fx.check(live);
    assert.equal(r.status, 'changed', r.summary);
    assert.equal(r.sourceAsOf, '2026-10-09');
    assert.match(r.summary, /daily/);
    const down = async () => new Response('down', { status: 503 });
    const [e] = await fx.check(makeContext({ moduleName: 'fx', now: NOW, fetchImpl: down, registry: { entries: [] } }));
    assert.equal(e.status, 'error');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('bigmac: the real source CSV parses to the encoded 2026-07-01 release (ok, nothing to write)', async () => {
  const [r] = await bigmac.check(ctxFor('bigmac'));
  assert.equal(r.status, 'ok', r.summary);
  assert.equal(r.sourceAsOf, '2026-07-01');
});

test('bigmac: a newer release updates prices only; a > 40% jump is flagged', () => {
  const doc = JSON.parse(read('data/cities.json'));
  const bm = latestBigMac(parseCsv(fs.readFileSync(path.join(FIX, 'bigmac', 'big-mac-source-data-v2.csv'), 'utf8')));
  const next = { date: '2027-01-01', byCountry: Object.fromEntries(Object.entries(bm.byCountry).map(([k, v]) => [k, { ...v, dollarPrice: Math.round(v.dollarPrice * 1.05 * 100) / 100 }])) };
  assert.deepEqual(bigmac.validateBigMac(doc, next, { today: '2027-01-10' }).problems, []);
  const { doc: out, changes } = bigmac.applyBigMacPrices(doc, next, { today: '2027-01-10' });
  assert.equal(out.bigMac.asOf, '2027-01-01');
  assert.ok(changes.length > 20);
  assert.deepEqual(out.fx, doc.fx, 'FX is the fx updater\'s job');
  for (const c of out.cities) assert.equal(c.bigMacUSD, out.bigMac.byCountry[c.country].dollarPrice, c.key);
  assert.deepEqual(validateDoc(out), []);
  const jump = { date: '2027-01-01', byCountry: { ...next.byCountry, GB: { ...next.byCountry.GB, dollarPrice: next.byCountry.GB.dollarPrice * 2 } } };
  assert.match(bigmac.validateBigMac(doc, jump, { today: '2027-01-10' }).problems.join(), /GB dollar price .* moves more than 40%/);
  assert.match(bigmac.validateBigMac(doc, { ...next, date: '2027-07-01' }, { today: '2027-01-10' }).problems.join(), /future/);
});
