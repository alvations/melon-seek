import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, jobsToCsv, csvFileName, csvReadme, CSV_COLUMNS } from '../server/export.js';

// Minimal RFC 4180 parser for round-trip checks.
function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\r' && text[i + 1] === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

test('csvCell: quoting, numbers, booleans, null, formula injection', () => {
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(undefined), '');
  assert.equal(csvCell(320000), '320000');
  assert.equal(csvCell(NaN), '');
  assert.equal(csvCell(true), 'true');
  assert.equal(csvCell('plain'), 'plain');
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('line1\r\nline2'), '"line1\nline2"');
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell('+1 555'), "'+1 555");
  assert.equal(csvCell('-cmd'), "'-cmd");
  assert.equal(csvCell('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(csvCell('\tx'), "'\tx");
});

test('jobsToCsv: columns, facts only, vetted salary, F4 dates, round-trip', () => {
  const jobs = [
    {
      id: 'acme:1', title: 'Engineer, "Platform"', department: 'Eng', team: null, seniority: 'Senior',
      locations: [{ name: 'San Francisco, CA' }, { name: 'New York City, NY' }], remote: false,
      salary: { min: 200000, max: 250000, mid: 225000, currency: 'USD' },
      postedAt: '2026-09-01T00:00:00.000Z', firstSeenAt: '2026-09-02T06:00:00.000Z',
      url: 'https://example.test/1', descriptionHtml: '<p>SECRET DESCRIPTION</p>', sections: { responsibilities: ['x'] },
    },
    { id: 'acme:2', title: '=cmd()', locations: [], remote: true, salary: null, salaryRaw: { min: 1, max: 2 }, url: null },
  ];
  const csv = jobsToCsv(jobs, { mode: 'snapshot' });
  assert.ok(!csv.includes('SECRET'), 'no descriptions');
  assert.ok(csv.endsWith('\r\n'));
  const rows = parseCsv(csv);
  assert.deepEqual(rows[0], [...CSV_COLUMNS]);
  assert.deepEqual(rows[0], ['id', 'title', 'department', 'team', 'seniority', 'locations', 'remote', 'salary_min', 'salary_max', 'salary_currency', 'posted_at', 'first_seen_at', 'url', 'data_mode']);
  assert.equal(rows.length, 3);
  const r1 = Object.fromEntries(rows[0].map((k, i) => [k, rows[1][i]]));
  assert.deepEqual(r1, {
    id: 'acme:1', title: 'Engineer, "Platform"', department: 'Eng', team: '', seniority: 'Senior',
    locations: 'San Francisco, CA | New York City, NY', remote: 'false', salary_min: '200000', salary_max: '250000',
    salary_currency: 'USD', posted_at: '2026-09-01T00:00:00.000Z', first_seen_at: '2026-09-02T06:00:00.000Z',
    url: 'https://example.test/1', data_mode: 'snapshot',
  });
  const r2 = Object.fromEntries(rows[0].map((k, i) => [k, rows[2][i]]));
  assert.equal(r2.title, "'=cmd()");
  assert.equal(r2.remote, 'true');
  assert.deepEqual([r2.salary_min, r2.salary_max, r2.salary_currency], ['', '', ''], 'quarantined pay is not exported');
  assert.equal(jobsToCsv([]), CSV_COLUMNS.join(',') + '\r\n');
});

test('file name and README', () => {
  assert.equal(csvFileName('anthropic', { date: '2026-10-02T07:00:00Z' }), 'melon-seek-anthropic-2026-10-02.csv');
  assert.equal(csvFileName('anthropic', { mode: 'demo', date: '2026-10-02T07:00:00Z' }), 'melon-seek-anthropic-2026-10-02-demo.csv');
  assert.equal(csvFileName('a"b/c', { date: '2026-10-02' }), 'melon-seek-a_b_c-2026-10-02.csv');
  const readme = csvReadme({ generatedAt: '2026-10-02T00:00:00Z', companies: [{ slug: 'anthropic', name: 'Anthropic', rows: 638, mode: 'snapshot' }] });
  for (const col of CSV_COLUMNS) assert.ok(readme.includes(col.split('_')[0]), col);
  assert.match(readme, /anthropic\.csv {2}Anthropic, 638 rows \(snapshot\)/);
  assert.match(readme, /Descriptions are not included/);
});
