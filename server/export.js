// Open data CSV (F7, docs/strategy/ROADMAP.md §7.1 F7).
//
// Pure ES module, browser-safe (in server/lib-modules.js): used by the
// server's GET /api/export?company=, and by scripts/build-static.js for
// dist/data/<slug>.csv + dist/data/README.txt.
//
// Facts only: no description text. RFC 4180 (CRLF, quoted when needed), UTF-8.
// Text cells that a spreadsheet would run as a formula (leading = + - @ tab CR)
// are prefixed with an apostrophe.

export const CSV_COLUMNS = Object.freeze([
  'id', 'title', 'department', 'team', 'seniority', 'locations', 'remote',
  'salary_min', 'salary_max', 'salary_currency', 'posted_at', 'first_seen_at', 'url', 'data_mode',
]);

const FORMULA_RE = /^[=+\-@\t\r]/;

/** One CSV cell. Numbers and booleans are written as-is; text is quoted when needed. */
export function csvCell(v) {
  if (v == null) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  let s = String(v).replace(/\r\n?/g, '\n');
  if (FORMULA_RE.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Jobs -> CSV text (header + one row per job).
 * Salary columns are the vetted, annualized base-pay range in the posting's
 * currency; empty when the salary is missing or was quarantined.
 * @param {Job[]} jobs
 * @param {{ mode?: string }} [opts]  data mode for the data_mode column (live, cache, snapshot, demo)
 */
export function jobsToCsv(jobs, { mode = '' } = {}) {
  const rows = [CSV_COLUMNS.join(',')];
  for (const j of jobs || []) {
    if (!j) continue;
    const s = j.salary || null;
    const locs = Array.isArray(j.locations) ? j.locations.map((l) => l && l.name).filter(Boolean).join(' | ') : '';
    rows.push([
      j.id, j.title, j.department, j.team, j.seniority, locs, j.remote === true,
      s ? s.min : null, s ? s.max : null, s ? s.currency : null,
      j.postedAt || null, j.firstSeenAt || null, j.url, mode || null,
    ].map(csvCell).join(','));
  }
  return rows.join('\r\n') + '\r\n';
}

/** Download file name, e.g. melon-seek-anthropic-2026-10-02.csv (…-demo.csv for demo data). */
export function csvFileName(slug, { mode = '', date = new Date().toISOString() } = {}) {
  const safe = String(slug || 'jobs').replace(/[^a-z0-9-_.]/gi, '_');
  return `melon-seek-${safe}-${String(date).slice(0, 10)}${mode === 'demo' ? '-demo' : ''}.csv`;
}

/** data/README.txt for the static build. */
export function csvReadme({ generatedAt = new Date().toISOString(), companies = [] } = {}) {
  const lines = [
    'melon-seek open data',
    '',
    `Generated: ${generatedAt}`,
    '',
    'One CSV per company: data/<slug>.csv (UTF-8, comma-separated, RFC 4180).',
    'Each row is one job posting as published on the company\'s own job board',
    '(Greenhouse, Ashby or Lever). Descriptions are not included; follow the url',
    'column to the original posting. Please attribute "melon-seek" and the company.',
    '',
    'Columns:',
    '  id               melon-seek id, "<company>:<posting id>"',
    '  title, department, team, seniority (inferred from the title)',
    '  locations        location names, separated by " | "',
    '  remote           true when the posting is marked remote',
    '  salary_min/max   posted BASE pay range, annualized (hourly x 2080, monthly x 12),',
    '                   in salary_currency; empty when not posted or when it failed the',
    '                   plausibility checks (docs/VETTING.md). Equity and bonus excluded.',
    '  posted_at        date the board reports the posting was first published',
    '  first_seen_at    first melon-seek snapshot that saw the posting',
    '  url              the original posting',
    '  data_mode        live | cache | snapshot | demo ("demo" rows are synthetic)',
    '',
    'Text cells starting with = + - @ are prefixed with an apostrophe.',
  ];
  if (companies.length) {
    lines.push('', 'Files:');
    for (const c of companies) lines.push(`  ${c.slug}.csv  ${c.name || c.slug}${c.rows != null ? `, ${c.rows} rows` : ''}${c.mode ? ` (${c.mode})` : ''}`);
  }
  return lines.join('\n') + '\n';
}
