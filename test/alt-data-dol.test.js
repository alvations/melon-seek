// scripts/alt-data/: Amazon and Meta pay filed with the US Department of Labor
// (docs/AMAZON_META.md, docs/process/amazon-meta-data.md). No network: the workbooks are
// built from scripts/alt-data/sample.js in the documented FY2026 layout, and two small
// fixtures come from the real LCA_Disclosure_Data_FY2026_Q3.xlsx (its central directory,
// and its first two rows, which hold only shared-string indices and numbers).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  centralDirectory, openZip, firstSheet, eachRowXml, rowCells, cellAt, colIndex, colLetters, sharedStrings,
  xmlText, richText, excelDate, toExcelDate, xlsxBuffer, elementSplitter,
} from '../scripts/alt-data/xlsx.js';
import { normalizeEmployer, matchEmployer, nearMiss, employerCandidate } from '../scripts/alt-data/employers.js';
import {
  findDisclosureLinks, reportingPeriod, fileQuarter, annualize, displayTitle, placeName, extractWorkbook, observe,
  summarize, wageStats, quantile, toCsv, detectProgram, emitChunks, main,
} from '../scripts/alt-data/dol-disclosure.js';
import { sampleLcaRows, samplePermRows, LCA_COLUMNS_FY2026, PERSONAL_MARKERS } from '../scripts/alt-data/sample.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'alt-data');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'alt-data-dol-'));
const write = (name, rows, opts) => { const f = path.join(tmp, name); fs.writeFileSync(f, xlsxBuffer(rows, opts)); return f; };

/* ------------------------------------------------------------- employers */

test('employer names normalize across punctuation, case and corporate suffixes', () => {
  assert.equal(normalizeEmployer('Amazon.com Services LLC'), 'AMAZON COM SERVICES');
  assert.equal(normalizeEmployer('AMAZON.COM SERVICES, L.L.C.'), 'AMAZON COM SERVICES');
  assert.equal(normalizeEmployer('Amazon Development Center U.S., Inc.'), 'AMAZON DEVELOPMENT CENTER US');
  assert.equal(normalizeEmployer('Meta Platforms, Inc.'), 'META PLATFORMS');
  assert.equal(normalizeEmployer('  meta platforms technologies, llc '), 'META PLATFORMS TECHNOLOGIES');
});

test('the allow-list matches Amazon and Meta entities and nothing that merely shares a word', () => {
  const yes = {
    'Amazon.com Services LLC': ['amazon', 'Amazon.com Services LLC'],
    'AMAZON WEB SERVICES, INC.': ['amazon', 'Amazon Web Services, Inc.'],
    'Amazon Development Center U.S., Inc.': ['amazon', 'Amazon Development Center U.S., Inc.'],
    'Amazon Data Services, Inc.': ['amazon', 'Amazon Data Services, Inc.'],
    'Kuiper Systems LLC': ['amazon', 'Amazon Kuiper (Kuiper Systems LLC)'],
    'A9.com, Inc.': ['amazon', 'A9.com, Inc.'],
    'Meta Platforms, Inc.': ['meta', 'Meta Platforms, Inc.'],
    'Meta Platforms Technologies, LLC': ['meta', 'Meta Platforms Technologies, LLC'],
    'Facebook, Inc.': ['meta', 'Facebook, Inc. (now Meta Platforms, Inc.)'],
    'WhatsApp LLC': ['meta', 'WhatsApp LLC'],
  };
  for (const [name, [company, entity]] of Object.entries(yes)) assert.deepEqual(matchEmployer(name), { company, entity }, name);
  for (const name of ['Amazon Hose & Rubber Co.', 'Amazon Consulting Group LLC', 'Amazonia Foods Inc', 'Meta Systems Consulting Inc', 'Metamor Software', 'Meta Financial Group', 'Facebook Fan Club LLC', 'Example Widgets Inc', '']) {
    assert.equal(matchEmployer(name), null, name);
  }
  assert.equal(nearMiss('Amazon Hose & Rubber Co.'), 'amazon');
  assert.equal(nearMiss('Meta Systems Consulting Inc'), 'meta');
  assert.equal(nearMiss('Metamor Software'), null, '"Metamor" is not the word "Meta"');
  assert.equal(nearMiss('Amazon.com Services LLC'), null, 'a match is not a near miss');
  assert.equal(employerCandidate('Example Widgets Inc'), false);
  assert.equal(employerCandidate('Amazon Web Services, Inc.'), true);
});

/* ----------------------------------------------------------------- xlsx */

test('the real FY2026 Q3 LCA workbook: its central directory parses (sheet 228 MB compressed, strings last)', () => {
  const buf = fs.readFileSync(path.join(FIX, 'lca-fy2026-q3-central-directory.bin'));
  const cd = centralDirectory(buf);
  assert.equal(cd.entries.length, 10);
  assert.equal(cd.cdOffset, 251850229);
  const sheet = cd.entries.find((e) => e.name === 'xl/worksheets/sheet1.xml');
  assert.deepEqual([sheet.method, sheet.compressedSize, sheet.offset], [8, 239419295, 3303]);
  assert.ok(sheet.size > 1.5e9, 'the sheet inflates to about 1.5 GB, so it must be streamed');
  const ss = cd.entries.find((e) => e.name === 'xl/sharedStrings.xml');
  assert.ok(ss.offset > sheet.offset, 'shared strings come after the sheet');
});

test('the real FY2026 Q3 LCA rows: header and first row parse, employer in T and wage in BV', () => {
  const text = fs.readFileSync(path.join(FIX, 'lca-fy2026-q3-rows-1-2.xml'), 'utf8');
  assert.match(text, /<dimension ref="A1:CT1032736"\/>/);
  const rows = text.match(/<row\b[\s\S]*?<\/row>/g);
  const header = rowCells(rows[0]);
  assert.equal(header.size, LCA_COLUMNS_FY2026.length, '98 header cells, as in the record layout');
  assert.ok([...header.values()].every((c) => c.t === 's'), 'header names are shared strings');
  const row = rowCells(rows[1]);
  assert.equal(colLetters(LCA_COLUMNS_FY2026.indexOf('EMPLOYER_NAME')), 'T');
  assert.equal(row.get(colIndex('T')).t, 's', 'the employer is a shared string');
  assert.equal(cellAt(rows[1], 'T').v, row.get(colIndex('T')).v, 'the fast lookup finds the same cell');
  assert.deepEqual([row.get(colIndex('BV')).v, row.get(colIndex('BW')).v], ['65', '85'], 'wage range as numbers');
  assert.equal(excelDate(row.get(colIndex('C')).v), '2025-02-07', 'dates are serial numbers');
  assert.equal(colLetters(LCA_COLUMNS_FY2026.length - 1), 'CT');
});

test('xml helpers: entities, Excel escapes, rich text and element splitting across chunks', () => {
  assert.equal(xmlText('A &amp; B &lt;x&gt; &#233;&#x41;_x000D_'), 'A & B <x> éA\r');
  assert.equal(richText('<r><t>Senior </t></r><r><rPr/><t xml:space="preserve">Engineer</t></r><rPh><t>ignored</t></rPh>'), 'Senior Engineer');
  const got = [];
  const s = elementSplitter('row', (x) => got.push(x));
  for (const chunk of ['<sheetData><ro', 'w r="1"><c r="A1"><v>1</v></c></r', 'ow><rowBreaks/><row r="2"/>', '<row r="3">x</row></sheetData>']) s.push(chunk);
  s.end();
  assert.deepEqual(got, ['<row r="1"><c r="A1"><v>1</v></c></row>', '<row r="2"/>', '<row r="3">x</row>']);
  assert.equal(colIndex('A'), 0);
  assert.equal(colIndex('CT'), 97);
  assert.equal(colLetters(27), 'AB');
  assert.equal(excelDate(toExcelDate('2026-06-30')), '2026-06-30');
  assert.equal(excelDate('not a date'), null);
});

test('a workbook round-trips: shared and inline strings, numbers, the first sheet, wanted strings only', async () => {
  for (const inline of [false, true]) {
    const f = write(`rt-${inline}.xlsx`, [['NAME', 'PAY'], ['Amazon & Co <x>', 12.5], [null, 'last']], { inline });
    const zip = await openZip(f);
    assert.equal(await firstSheet(zip), 'xl/worksheets/sheet1.xml');
    const rows = [];
    await eachRowXml(zip, 'xl/worksheets/sheet1.xml', (x) => rows.push(rowCells(x)));
    const ss = await sharedStrings(zip, { want: new Set([1]), test: (s) => /amazon/i.test(s) });
    const v = (c) => (c.t === 's' ? ss.strings.get(Number(c.v)) : c.v);
    assert.equal(rows.length, 3);
    assert.equal(rows[1].get(1).v, '12.5');
    assert.equal(rows[2].has(0), false, 'empty cells are absent');
    if (inline) assert.equal(rows[1].get(0).v, 'Amazon & Co <x>');
    else {
      assert.equal(v(rows[0].get(1)), 'PAY');
      assert.equal(ss.strings.has(0), false, 'only wanted strings are kept');
      assert.deepEqual([...ss.matches], [2]);
    }
  }
  // A ranged download of the last bytes still yields absolute entry offsets.
  const whole = fs.readFileSync(path.join(tmp, 'rt-false.xlsx'));
  const tail = centralDirectory(whole.subarray(whole.length - 600));
  const full = centralDirectory(whole, 0);
  assert.deepEqual(tail.entries.map((e) => e.offset), full.entries.map((e) => e.offset));
  assert.throws(() => centralDirectory(whole.subarray(whole.length - 100)), /need \d+ more bytes/, 'too short a tail says how much more it needs');
});

/* -------------------------------------------------------------- dol.gov */

test('disclosure links: newest first, double slashes fixed, relative links resolved', () => {
  const html = `
    <a href="https://www.dol.gov//media/LCA_Disclosure_Data_FY2026_Q3.xlsx">LCA_Dislclosure_Data_FY2026_Q3.xlsx</a>
    <a href="/sites/dolgov/files/ETA/oflc/pdfs/LCA_Disclosure_Data_FY2025_Q4.xlsx">x</a>
    <a href="https://www.dol.gov/media/PERM_Disclosure_Data_FY2026_Q3.xlsx">y</a>
    <a href="/sites/dolgov/files/ETA/oflc/pdfs/PERM_Disclosure_Data_FY2025_Q4.xlsx">z</a>
    <a href="/sites/dolgov/files/ETA/oflc/pdfs/FY26Q3/LCA_Record_Layout_FY2026_Q3.pdf">layout</a>`;
  const links = findDisclosureLinks(html);
  assert.deepEqual(links.map((l) => [l.program, l.fy, l.q]), [['lca', 2026, 3], ['perm', 2026, 3], ['lca', 2025, 4], ['perm', 2025, 4]]);
  assert.equal(links[0].url, 'https://www.dol.gov/media/LCA_Disclosure_Data_FY2026_Q3.xlsx');
  assert.equal(links[2].url, 'https://www.dol.gov/sites/dolgov/files/ETA/oflc/pdfs/LCA_Disclosure_Data_FY2025_Q4.xlsx');
  assert.deepEqual(reportingPeriod(2026, 3), { from: '2025-10-01', to: '2026-06-30' });
  assert.deepEqual(reportingPeriod(2026, 1), { from: '2025-10-01', to: '2025-12-31' });
  assert.deepEqual(reportingPeriod(2025, 4), { from: '2024-10-01', to: '2025-09-30' });
  assert.deepEqual(fileQuarter('/x/PERM_Disclosure_Data_FY2026_Q3.xlsx'), { fy: 2026, q: 3 });
});

test('wages are made annual with the site\'s factors; titles and places are tidied', () => {
  assert.equal(annualize('65', 'Hour'), 135200);
  assert.equal(annualize(3000, 'Bi-Weekly'), 78000);
  assert.equal(annualize(2000, 'Week'), 104000);
  assert.equal(annualize('14,000.00', 'Month'), 168000);
  assert.equal(annualize('$150,000', 'Year'), 150000);
  assert.equal(annualize(150000, 'Fortnight'), null);
  assert.equal(annualize(null, 'Year'), null);
  assert.equal(displayTitle('SOFTWARE DEVELOPMENT ENGINEER II'), 'Software Development Engineer II');
  assert.equal(displayTitle('SR. SOFTWARE DEV ENGINEER, AWS'), 'Senior Software Dev Engineer, AWS');
  assert.equal(displayTitle('Applied Scientist II'), 'Applied Scientist II');
  assert.equal(placeName('SEATTLE', 'WA'), 'Seattle, WA');
  assert.equal(placeName('MENLO PARK', 'CA'), 'Menlo Park, CA');
  assert.equal(placeName('', 'WA'), 'WA');
  assert.deepEqual(wageStats([100, 300, 200, 400]), { n: 4, p25: 200, median: 300, p75: 300 });
  assert.equal(quantile([1, 2, 3, 4], 0.5), 2.5);
});

/* -------------------------------------------------------- the whole run */

test('LCA sample: only Amazon and Meta rows are kept, near misses listed, people never read', async () => {
  const f = write('LCA_Disclosure_Data_FY2026_Q3.xlsx', sampleLcaRows());
  const got = await extractWorkbook(f);
  assert.equal(got.program, 'lca');
  assert.equal(got.rowsScanned, sampleLcaRows().length - 1);
  assert.equal(got.records.length, 15);
  assert.deepEqual(got.nearMisses.map((n) => [n.company, n.name]), [['amazon', 'Amazon Hose & Rubber Co.'], ['meta', 'Meta Systems Consulting Inc']]);
  const text = JSON.stringify(got.records);
  for (const marker of PERSONAL_MARKERS) assert.ok(!text.includes(marker), `${marker} must never be read`);
  assert.ok(!text.includes('00-0000000'), 'the FEIN column is not kept');
  const keys = new Set(got.records.flatMap((r) => Object.keys(r)));
  assert.ok(!keys.has('EMPLOYER_POC_EMAIL') && !keys.has('PREPARER_LAST_NAME'));
});

test('the columns are found by name, so a reordered or inline-string file reads the same', async () => {
  const rows = sampleLcaRows();
  const order = rows[0].map((_, i) => i).reverse();
  const shuffled = rows.map((r) => order.map((i) => r[i]));
  const a = await extractWorkbook(write('lca-a.xlsx', rows));
  const b = await extractWorkbook(write('lca-b.xlsx', shuffled, { inline: true }));
  const strip = (x) => x.records.map(({ program, ...r }) => r).sort((p, q) => p.caseNumber.localeCompare(q.caseNumber));
  assert.deepEqual(strip(b), strip(a));
  assert.equal(detectProgram(samplePermRows()[0]), 'perm');
  assert.equal(detectProgram(['FOO', 'BAR']), null);
  await assert.rejects(extractWorkbook(write('bad.xlsx', [['FOO', 'BAR'], ['a', 'b']])), /not an LCA or PERM/);
});

test('observations: family, level, place, annual wage and which filings are priced', () => {
  const base = { program: 'lca', company: 'amazon', entity: 'Amazon.com Services LLC', status: 'Certified', fullTime: 'Y', wageUnit: 'Year', city: 'SEATTLE', state: 'WA' };
  const o = observe({ ...base, title: 'SOFTWARE DEVELOPMENT ENGINEER II', wageFrom: 150000, wageTo: 200000, socTitle: 'Software Developers' });
  assert.deepEqual([o.title, o.family, o.level, o.city, o.wageFrom, o.wageTo, o.wage, o.priced], ['Software Development Engineer II', 'swe', 'Mid', 'Seattle, WA', 150000, 200000, 175000, true]);
  assert.equal(observe({ ...base, title: 'Sr. Software Development Engineer', wageFrom: 190000 }).level, 'Senior');
  assert.equal(observe({ ...base, title: 'Software Engineer', wageFrom: 190000 }).level, 'Not stated', 'no level word: not stated, as on the site');
  assert.equal(observe({ ...base, title: 'Applied Scientist II', wageFrom: 190000 }).family, 'ml');
  assert.equal(observe({ ...base, title: 'Economist', wageFrom: 190000 }).family, 'other');
  assert.equal(observe({ ...base, title: 'Data Engineer', wageFrom: 64.9, wageTo: 85, wageUnit: 'Hour' }).wage, 155896);
  assert.equal(observe({ ...base, title: 'X', status: 'Withdrawn', wageFrom: 150000 }).priced, false);
  assert.equal(observe({ ...base, title: 'X', fullTime: 'N', wageFrom: 150000 }).priced, false);
  assert.equal(observe({ ...base, title: 'X', wageFrom: 15, wageUnit: 'Year' }).priced, false, 'below the bound');
  assert.equal(observe({ ...base, program: 'perm', title: 'X', status: 'Certified-Expired', wageFrom: 150000 }).priced, true);
});

test('the summary: counts, medians by family, level, title and city, and nothing personal (CLI end to end)', async () => {
  const lca = write('LCA_Disclosure_Data_FY2026_Q3.xlsx', sampleLcaRows());
  const perm = write('PERM_Disclosure_Data_FY2026_Q3.xlsx', samplePermRows());
  const out = path.join(tmp, 'summary.json');
  const rows = path.join(tmp, 'rows.csv');
  const code = await main(['--lca', lca, '--perm', perm, '--out', out, '--rows', rows]);
  assert.equal(code, 0);
  const s = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(s.schema, 1);
  assert.match(s.title, /US Department of Labor/);
  assert.match(s.notes[0], /^Not job postings/);
  assert.deepEqual(s.sources.map((x) => [x.program, x.fiscalYear, x.quarter, x.reportingPeriod.to]), [['lca', 2026, 3, '2026-06-30'], ['perm', 2026, 3, '2026-06-30']]);
  const a = s.companies.amazon;
  assert.deepEqual(a.entities[0], { entity: 'Amazon.com Services LLC', lca: 6, perm: 3 });
  assert.deepEqual([a.lca.filings, a.lca.priced, a.lca.byStatus], [10, 8, { certified: 9, withdrawn: 1 }]);
  assert.equal(a.lca.wage.median, 180000);
  assert.deepEqual(a.lca.byFamily.map((f) => f.family), ['swe', 'ml', 'data', 'solutions'], 'site family order');
  assert.deepEqual(a.lca.byFamily[0], { family: 'swe', label: 'Software engineering', n: 5, p25: 177500, median: 182500, p75: 187500 });
  assert.deepEqual(a.lca.byLevel.map((l) => l.level), ['Entry', 'Mid', 'Senior', 'Not stated']);
  assert.deepEqual(a.lca.byPrevailingWageLevel.map((l) => l.pwLevel), ['I', 'II', 'III']);
  assert.deepEqual(a.lca.byTitle, [{ title: 'Software Development Engineer II', family: 'swe', level: 'Mid', n: 3, p25: 180000, median: 182500, p75: 185000 }]);
  assert.deepEqual(a.lca.byCity, [{ city: 'Seattle, WA', n: 4, p25: 172100, median: 182500, p75: 190600 }]);
  assert.deepEqual([a.perm.filings, a.perm.priced, a.perm.wage.median], [3, 3, 180000]);
  const m = s.companies.meta;
  assert.deepEqual([m.lca.filings, m.lca.priced, m.lca.wage.median, m.perm.priced], [5, 4, 215000, 1]);
  assert.deepEqual(m.lca.byLevel.map((l) => l.label), ['Level not stated']);
  assert.equal(s.nearMisses.length, 2);
  const csv = fs.readFileSync(rows, 'utf8');
  assert.equal(csv.trim().split('\n').length, 1 + 20);
  for (const text of [JSON.stringify(s), csv]) for (const marker of PERSONAL_MARKERS) assert.ok(!text.includes(marker), marker);
  assert.ok(fs.statSync(out).size < 64 * 1024, 'a commit-sized summary');
  assert.equal(toCsv([]).split('\n')[0].split(',')[0], 'program');
  assert.equal(await main([]), 2, 'no input: usage');
});

test('the committed summary, when present, has the shape and only Amazon and Meta', () => {
  const f = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'alt', 'dol-amazon-meta.json');
  if (!fs.existsSync(f)) return; // written by the workflow the lead adds (docs/process/patches/amazon-meta-data-workflow.diff)
  const s = JSON.parse(fs.readFileSync(f, 'utf8'));
  assert.equal(s.schema, 1);
  assert.deepEqual(Object.keys(s.companies), ['amazon', 'meta']);
  for (const c of Object.values(s.companies)) for (const e of c.entities) assert.ok(matchEmployer(e.entity) || /Amazon|Meta|Facebook|Instagram|WhatsApp|Siculus|Kuiper|A9/.test(e.entity));
  const text = JSON.stringify(s);
  assert.ok(!/@[a-z0-9-]+\.[a-z]{2,}/i.test(text.replace(/https?:\/\/\S+/g, '')), 'no e-mail addresses');
  assert.ok(fs.statSync(f).size < 512 * 1024, 'commit-sized');
});

test('the summary travels through a job log: emitChunks output decodes with freshness-probe.mjs', () => {
  const buf = Buffer.from(JSON.stringify({ hello: 'Amazon and Meta', n: [1, 2, 3] }, null, 2).repeat(200));
  const lines = [];
  emitChunks('dol-amazon-meta.json', buf, { out: (l) => lines.push(`2026-10-11T12:00:00.0000000Z ${l}`) });
  assert.ok(lines.length >= 3);
  const logFile = path.join(tmp, 'job.log');
  fs.writeFileSync(logFile, `﻿${lines.join('\n')}\n`);
  const outDir = path.join(tmp, 'decoded');
  const decoder = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.github', 'scripts', 'freshness-probe.mjs');
  const r = spawnSync(process.execPath, [decoder, '--decode', logFile, outDir], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /sha256 ok/);
  assert.deepEqual(fs.readFileSync(path.join(outDir, 'dol-amazon-meta.json')), buf);
});

test('summarize with no rows still reports every program read', () => {
  const s = summarize([], { sources: [{ program: 'lca' }], generatedAt: '2026-10-11T00:00:00.000Z' });
  assert.equal(s.companies.amazon.lca.filings, 0);
  assert.equal(s.companies.amazon.lca.wage.median, null);
  assert.equal(s.companies.amazon.perm, undefined);
});
