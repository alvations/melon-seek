// Open data CSV (F7, docs/strategy/ROADMAP.md §7.1 F7).
//
// Pure ES module, browser-safe (in server/lib-modules.js): used by the
// server's GET /api/export?company=, and by scripts/build-static.js for
// dist/data/<slug>.csv + dist/data/README.txt.
//
// Facts only: no description text. RFC 4180 (CRLF, quoted when needed), UTF-8.
// Text cells that a spreadsheet would run as a formula (leading = + - @ tab CR)
// are prefixed with an apostrophe.
//
// D-49 (fix-qa4, 2026-10-17): every pay figure says what it is. salary_min/max are the range the job card shows
// (salaryRange), salary_kind says what kind of figure it is (salaryKind), and salary_ranges lists every range the
// posting states for a place or a level (salaryRows). The README is written per site (csvReadme `channel`): the
// beta site's big-tech files come from each company's own careers site, base pay only.

export const CSV_COLUMNS = Object.freeze([
  'id', 'title', 'department', 'team', 'seniority', 'locations', 'remote',
  'salary_min', 'salary_max', 'salary_currency', 'posted_at', 'first_seen_at', 'url',
  // D-49: before data_mode, which stays last ("demo" rows end in ",demo"); every other column keeps its place.
  'salary_kind', 'salary_ranges', 'data_mode',
]);

/** salary_kind values (D-49), in the order the drawer's pay caption checks them (public/app.js drawerContent). */
export const SALARY_KINDS = Object.freeze(['ote', 'minimum', 'shift', 'part-time', 'fixed-term', 'hourly', 'salary']);

// Leading characters a spreadsheet may run as a formula (checked on the raw
// value, before line endings are normalized, so a leading CR or LF counts too).
const FORMULA_RE = /^[=+\-@\t\r\n]/;
// Review V10: quote on separators of either locale (comma or semicolon), quotes, CR, LF.
const QUOTE_RE = /[",;\r\n]/;

/** One CSV cell. Numbers and booleans are written as-is; text is quoted when needed. */
export function csvCell(v) {
  if (v == null) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  let s = String(v);
  if (FORMULA_RE.test(s)) s = `'${s}`;
  s = s.replace(/\r\n?/g, '\n');
  return QUOTE_RE.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const finite = (v) => v != null && v !== '' && Number.isFinite(Number(v));
const cur = (s, r = null) => String((r && r.currency) || s.currency || 'USD').toUpperCase();
/** Pay stated per week, per month or for the whole programme, or a stipend: fixed-term pay (public/app.js isFixedPay). */
const fixedPay = (s) => s.originalInterval === 'week' || s.originalInterval === 'month' || s.originalInterval === 'term' || s.kind === 'stipend';

/**
 * D-49: what a salary's figure is, as the job card and the drawer say it: 'ote' (on-target earnings: base plus
 * commission at target), 'minimum' (a stated minimum, "from €46K"), 'shift' (hourly pay including the highest shift
 * differential), 'part-time' (part-time hourly pay), 'fixed-term' (pay per week, per month or for a whole programme),
 * 'hourly' (an hourly rate), else 'salary' (a yearly base-pay range). Two that both hold are joined with "+"
 * ("shift+part-time": Amazon's reduced-time shift roles). null without a salary.
 */
export function salaryKind(s) {
  if (!s) return null;
  const k = [];
  if (s.kind === 'ote') k.push('ote');
  if (s.kind === 'minimum') k.push('minimum');
  if (s.includesShiftDifferential) k.push('shift');
  if (s.partTime === true) k.push('part-time');
  if (s.termWeeks > 0 && fixedPay(s)) k.push('fixed-term');
  if (!k.length) k.push(s.kind === 'hourly' || s.originalInterval === 'hour' ? 'hourly' : 'salary');
  return k.join('+');
}

/**
 * The posting's ranges for its places, as the card reads them (public/app.js payRanges): two or more rows in the
 * salary's currency with a number and a name (a label or places). null otherwise.
 */
function placeRows(s) {
  const c = cur(s);
  const rs = Array.isArray(s.ranges) ? s.ranges.filter((r) => r && finite(r.min) && (r.label || (Array.isArray(r.locations) && r.locations.length)) && cur(s, r) === c) : [];
  return rs.length > 1 ? rs : null;
}

/**
 * D-49: the range the job card shows, yearly, in salary.currency: [min, max].
 *   - A posting with a range per place (Amazon, Apple, Microsoft): the lowest to the highest of its ranges (the card's
 *     "$60K–129K · 5 places"), not one place's row (the headline is Amazon's search city: amazon:10371179's 82,700 to
 *     117,100 is Bellevue's).
 *   - A stated minimum: [min, null], as the card's "from €46K" (it was written 46000,46000, as if exact).
 *   - On-target earnings and everything else: salary.min and salary.max (a span of levels is salary_kind's figure
 *     with each level in salary_ranges).
 * [null, null] without a salary.
 */
export function salaryRange(s) {
  if (!s) return [null, null];
  const min = finite(s.min) ? Number(s.min) : finite(s.max) ? Number(s.max) : null;
  const max = finite(s.max) ? Number(s.max) : min;
  if (s.kind === 'minimum') return [min, null];
  const rs = s.kind === 'ote' ? null : placeRows(s);
  if (!rs) return [min, max];
  let lo = min ?? Infinity, hi = max ?? -Infinity;
  for (const r of rs) { lo = Math.min(lo, Number(r.min)); hi = Math.max(hi, Number(r.max ?? r.min)); }
  return [lo, hi];
}

/** A row's name: its label, else the places it was posted for. */
const rowName = (r) => String(r.label || (Array.isArray(r.locations) ? r.locations.join(' / ') : '') || '').replace(/\s+/g, ' ').trim();
const amounts = (r) => { const a = Math.round(Number(r.min)), b = Math.round(Number(r.max ?? r.min)); return `${a}-${b}`; };

/**
 * D-49: every range the posting states for a level or a place, yearly: "Level 4: 168000-264500 USD | Level 5:
 * 196000-310500 USD" (salary.levels, two or more), then "New York: 73600-128800 USD | Nashville: 60200-105400 USD | …"
 * (salary.ranges, every row, in its own currency). '' when the posting states one range.
 */
export function salaryRows(s) {
  if (!s) return '';
  const out = [];
  const lv = Array.isArray(s.levels) ? s.levels.filter((l) => l && l.label && finite(l.min)) : [];
  if (lv.length > 1) for (const l of lv) out.push(`${rowName(l)}: ${amounts(l)} ${cur(s, l)}`);
  const rs = Array.isArray(s.ranges) ? s.ranges.filter((r) => r && finite(r.min)) : [];
  if (rs.length > 1) for (const r of rs) out.push(`${rowName(r) || 'Unnamed'}: ${amounts(r)} ${cur(s, r)}`);
  return out.join(' | ');
}

/**
 * Jobs -> CSV text (header + one row per job).
 * Salary columns are the vetted, annualized pay range the job card shows, in the posting's currency, with what kind of
 * figure it is (salary_kind) and every range it states per place or level (salary_ranges); empty when the salary is
 * missing or was quarantined.
 * @param {Job[]} jobs
 * @param {{ mode?: string }} [opts]  data mode for the data_mode column (live, cache, snapshot, demo)
 */
export function jobsToCsv(jobs, { mode = '' } = {}) {
  const rows = [CSV_COLUMNS.join(',')];
  for (const j of jobs || []) {
    if (!j) continue;
    const s = j.salary || null;
    const locs = Array.isArray(j.locations) ? j.locations.map((l) => l && l.name).filter(Boolean).join(' | ') : '';
    const [min, max] = salaryRange(s);
    rows.push([
      j.id, j.title, j.department, j.team, j.seniority, locs, j.remote === true,
      min, max, s ? s.currency : null,
      j.postedAt || null, j.firstSeenAt || null, j.url,
      salaryKind(s), s ? salaryRows(s) || null : null, mode || null,
    ].map(csvCell).join(','));
  }
  return rows.join('\r\n') + '\r\n';
}

/** Download file name, e.g. melon-seek-anthropic-2026-10-02.csv (…-demo.csv for demo data). */
export function csvFileName(slug, { mode = '', date = new Date().toISOString() } = {}) {
  const safe = String(slug || 'jobs').replace(/[^a-z0-9-_.]/gi, '_');
  return `melon-seek-${safe}-${String(date).slice(0, 10)}${mode === 'demo' ? '-demo' : ''}.csv`;
}

/**
 * D-49: the job-board APIs the main site's boards come from, by `source` (docs/DATA_SOURCES.md §1, §3, §4). A big-tech
 * board's careers site is named by the build (scripts/build-static.js CAREERS_SITES, as `sourceText`): this module
 * ships in the main site's lib/, which names no beta company or host.
 */
export const JOB_BOARD_SOURCES = Object.freeze({
  greenhouse: 'Greenhouse job board API',
  ashby: 'Ashby posting API',
  lever: 'Lever postings API',
});

/**
 * data/README.txt for the static build. `channel`: 'stable' (the main site: Greenhouse, Ashby and Lever boards) or
 * 'beta' (those plus the big-tech careers sites). `companies`: [{ slug, name, rows, mode, source?, sourceText?,
 * channel? }]; each file's source is `sourceText` (a careers site, from the build) or its job-board API.
 */
export function csvReadme({ generatedAt = new Date().toISOString(), companies = [], channel = 'stable' } = {}) {
  const beta = channel === 'beta' || companies.some((c) => c && c.channel === 'beta');
  const lines = [
    'melon-seek open data',
    '',
    `Generated: ${generatedAt}`,
    '',
    'One CSV per company: data/<slug>.csv (UTF-8, comma-separated, RFC 4180).',
    ...(beta ? [
      'Each row is one job posting as published by the company itself: a big-tech',
      'company\'s file comes from its own careers site, the others from their job board',
      '(Greenhouse, Ashby or Lever). Each file\'s source is listed under Files.',
      'Big-tech pay is base pay only, as each company posts it: equity, bonus and',
      'benefits are never added. On-target earnings (salary_kind "ote") are base plus',
      'commission at target, as posted, and are marked so.',
    ] : [
      'Each row is one job posting as published on the company\'s own job board',
      '(Greenhouse, Ashby or Lever).',
    ]),
    'Descriptions are not included; follow the url column to the original posting.',
    'Please attribute "melon-seek" and the company.',
    '',
    'Columns:',
    '  id               melon-seek id, "<company>:<posting id>"',
    '  title, department, team, seniority (inferred from the title)',
    '  locations        location names, separated by " | "',
    '  remote           true when the posting is marked remote',
    '  salary_min/max   the posted pay range the job card shows, annualized (hourly x 2080,',
    '                   monthly x 12), in salary_currency; empty when not posted or when it',
    '                   failed the plausibility checks (docs/VETTING.md). salary_kind says',
    '                   what the figure is. A posting with a range per place: the lowest to',
    '                   the highest of them (each one is in salary_ranges). A stated minimum:',
    '                   salary_max is empty. Equity and bonus are never included.',
    '  posted_at        date the board reports the posting was first published',
    '  first_seen_at    first melon-seek snapshot that saw the posting',
    '  url              the original posting',
    '  salary_kind      what salary_min/max is, as the job card says:',
    '                     salary      a yearly base-pay range',
    '                     hourly      an hourly base-pay rate',
    '                     ote         on-target earnings: base plus commission at target',
    '                     minimum     a stated minimum base pay; the offer can be higher',
    '                     shift       hourly pay including the highest shift differential',
    '                     part-time   part-time hourly pay (x 2080 as if full time)',
    '                     fixed-term  pay per week, per month or for a whole programme',
    '                   two that both hold are joined with "+" (shift+part-time)',
    '  salary_ranges    every range the posting states for a level or a place, yearly,',
    '                   "<level or place>: <min>-<max> <currency>", separated by " | ";',
    '                   empty when it states one range',
    '  data_mode        live | cache | snapshot | demo ("demo" rows are synthetic)',
    '',
    'Changed on 2026-10-17: salary_kind and salary_ranges were added before data_mode.',
    'salary_min/max used to be the posting\'s headline range: one place\'s range when it',
    'posts a range per place, and a stated minimum written as both min and max.',
    '',
    'Text cells starting with = + - @ are prefixed with an apostrophe.',
  ];
  if (companies.length) {
    lines.push('', 'Files:');
    for (const c of companies) {
      const src = c.sourceText || JOB_BOARD_SOURCES[c.source] || null;
      lines.push(`  ${c.slug}.csv  ${c.name || c.slug}${c.rows != null ? `, ${c.rows} rows` : ''}${c.mode ? ` (${c.mode})` : ''}${src ? `; ${src}` : ''}`);
    }
  }
  return lines.join('\n') + '\n';
}
