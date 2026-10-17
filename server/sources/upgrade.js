// Read-time upgrade of stored big-tech snapshots (beta fix wave, 2026-10-10;
// docs/process/fix-beta-sources.md). Snapshots keep normalized Jobs, not the boards' raw
// records, so adapter fixes reach the site only after the next crawl. This applies them to
// the stored Jobs whenever a snapshot is read (scripts/build-static.js#readSnapshot and
// server/pipeline.js, after relocateJobs), so the current bundle shows them now:
//   - Apple: one posting per requisition with each place's pay (DQ-2); no store names as
//     places, links encoded once, Part-time only when the posting backs it (DQ-9);
//   - NVIDIA: hybrid- or on-site-tagged postings are not remote (DQ-12);
//   - Google: decoded titles (DQ-16), the brand as the department (D-24);
//   - every board: talent pools and general applications get `pool: true` (DQ-11);
//   - Amazon (fix wave 5): the pay table read again from the stored description, so each row
//     carries its places (DQ-33), virtual rows for unlisted states are dropped (DQ-41), identical
//     rows are one zone, and a stated minimum, shift differential, lower base or annual figure is
//     labelled (VT-17, VT-18, VT-19). The stored primary row (salary.text) stays the salary;
//   - Meta (fix wave 5, DQ-42 / VT-20): salary.country from the range's "(IT)" tag;
//   - NVIDIA and Amazon (fix-data-3, UX-32): natural department names (displayDepartments); the
//     snapshot keeps the board's own.
// Location fixes (DQ-4, DQ-10, D-23) need nothing here: relocateJobs re-geocodes stored
// locations with server/geo.js. Pure and idempotent: a snapshot crawled with the fixed
// adapters passes through unchanged. Unlike relocateJobs it may return FEWER jobs (Apple
// copies merge), so the archive ingest, which pairs stored and upgraded jobs by index, must
// not use it.
import { upgradeAppleJobs } from './apple.js';
import { upgradeEightfoldJobs } from './eightfold.js';
import { upgradeGoogleJobs } from './google.js';
import { markTalentPools } from './pool.js';
import { amazonPayTable, amazonSalary, amazonPlace } from './amazon.js';
import { annualize } from '../salary.js';
import { deriveSalary, withPayPlaces } from '../normalize.js';
import { vetSalaries } from '../vet.js';
import { htmlToText } from './util.js';
import { departmentDisplayName } from '../families.js';

/** One stored Amazon Job with its pay re-read from the stored table, or the same object. */
function upgradeAmazonJob(j) {
  if (!j || typeof j.id !== 'string' || !j.id.startsWith('amazon:')) return j;
  const sal = j.salary || j.salaryRaw;
  if (!sal || sal.source !== 'structured' || typeof sal.text !== 'string' || !j.descriptionHtml) return j;
  // The stored salary is one table row (its line); a salary written by the current adapter (an
  // annual figure, VT-19; rows with places) is not, and stays as it is.
  if (amazonPayTable(`<p>${sal.text}</p>`).length !== 1) return j;
  if (Array.isArray(sal.ranges) && sal.ranges.some((r) => r && Array.isArray(r.locations))) return j;
  let table = amazonPayTable(j.descriptionHtml);
  // The adapter kept every row in salary.ranges (label = the row's place, numbers as posted).
  const own = amazonPayTable(`<p>${sal.text}</p>`)[0];
  const rs = Array.isArray(sal.ranges) ? sal.ranges.filter((r) => r && r.label && Number.isFinite(r.min) && Number.isFinite(r.max)) : [];
  const storedRows = rs.map((r) => {
    const row = { location: String(r.label), min: r.min, max: r.max, currency: r.currency, interval: r.interval || 'year', line: `${r.label} - ${r.min} - ${r.max} ${r.currency} ${r.interval}` };
    if (own && own.location.startsWith(row.location) && own.min === r.min && own.max === r.max && own.currency === r.currency && own.interval === row.interval) row.line = sal.text;
    return row;
  });
  if (!table.some((r) => r.line === sal.text)) {
    // VT-22: the stored description was trimmed and lost rows, the salary's own row among them: the
    // table is rebuilt from the stored ranges.
    table = storedRows.length > 1 ? storedRows : [own];
    if (!table.some((r) => r.line === sal.text)) table = [own, ...table];
  } else if (storedRows.length > 1) {
    // SB-1 (salary audit): a trimmed description can keep the salary's own row and lose others
    // (scripts/snapshot.js#trimDescription kept 4 pay paragraphs). Every stored row the stored table
    // no longer has is added back, so no place loses the range the posting gave it.
    // Same place (the row's city) and the same yearly figures: a range stored yearly matches its hourly row.
    const same = (a, b) => (amazonPlace(a.location).city || '') === (amazonPlace(b.location).city || '') && a.currency === b.currency
      && annualize(a.min, a.interval) === annualize(b.min, b.interval) && annualize(a.max, a.interval) === annualize(b.max, b.interval);
    const lost = storedRows.filter((r) => !table.some((t) => same(t, r)));
    if (lost.length) table = [...table, ...lost];
  }
  const text = htmlToText(j.descriptionHtml);
  const res = amazonSalary({}, table, { places: j.locations || [], primary: sal.text, text });
  if (!res.salary) return j;
  const fresh = withPayPlaces(deriveSalary({ title: j.title || '', employmentType: j.employmentType || '', text, html: '', salary: res.salary, payRanges: res.payRanges }, j.locations || []), res.payPlaces, j.locations || []);
  if (!fresh) return j;
  const out = { ...j, salary: fresh };
  delete out.salaryRaw;
  delete out.salaryFlag;
  return out;
}

/** Stored Amazon Jobs -> as the current adapter reads their pay (fix wave 5), re-vetted. */
export function upgradeAmazonJobs(jobs) {
  if (!Array.isArray(jobs) || !jobs.some((j) => j && typeof j.id === 'string' && j.id.startsWith('amazon:'))) return jobs;
  let changed = false;
  const out = jobs.map((j) => { const u = upgradeAmazonJob(j); if (u !== j) changed = true; return u; });
  return changed ? vetSalaries(out) : jobs;
}

/** Stored Meta Jobs: salary.country from the range's own tag ("€89,000/year to €114,000/year + bonus + equity (IT)"). */
export function upgradeMetaJobs(jobs) {
  if (!Array.isArray(jobs)) return jobs;
  let changed = false;
  const fix = (s) => {
    if (!s || s.country || s.source !== 'structured') return s;
    const m = /\(([A-Z]{2})\)\s*$/.exec(String(s.text || ''));
    if (!m) return s;
    changed = true;
    return { ...s, country: m[1] === 'UK' ? 'GB' : m[1] };
  };
  const out = jobs.map((j) => {
    if (!j || typeof j.id !== 'string' || !j.id.startsWith('meta:')) return j;
    const s = fix(j.salary);
    const r = fix(j.salaryRaw);
    return s === j.salary && r === j.salaryRaw ? j : { ...j, ...(j.salary ? { salary: s } : {}), ...(j.salaryRaw ? { salaryRaw: r } : {}) };
  });
  return changed ? out : jobs;
}

// UX-32 (fix-data-3): the boards whose department names are inverted job families or carry a "--" qualifier.
const DISPLAY_BOARDS = new Set(['nvidia', 'amazon']);

/**
 * UX-32 (fix-data-3): NVIDIA's and Amazon's department names as natural group names (server/families.js
 * departmentDisplayName: "Engineer, ASIC" -> "ASIC Engineering", "Intern" -> "Internships",
 * "Project/Program/Product Management--Technical" -> "Technical Project, Program and Product Management").
 * Read time only, like the brand (upgradeGoogleJobs): snapshots and the history ledger keep the board's own
 * name, so fingerprints do not change, and an old link or saved search with the board's name still finds the
 * department (public/app.js maps it with the same function). The name is not copied onto each job: as a field on
 * 2,389 Amazon and 2,594 NVIDIA postings it made the lists 3% and 6% bigger (gzip). Idempotent
 * (departmentDisplayName of a shown name is that name). Pure; the same jobs, never fewer.
 */
export function displayDepartments(jobs) {
  if (!Array.isArray(jobs)) return jobs;
  let changed = false;
  const out = jobs.map((j) => {
    if (!j || !DISPLAY_BOARDS.has(j.company) || typeof j.department !== 'string' || !j.department) return j;
    const shown = departmentDisplayName(j.department);
    if (shown === j.department) return j;
    changed = true;
    return { ...j, department: shown };
  });
  return changed ? out : jobs;
}

/** Stored Jobs of one board -> the same Jobs as the current adapters would have produced. */
export function upgradeStoredJobs(jobs) {
  if (!Array.isArray(jobs)) return jobs;
  return displayDepartments(markTalentPools(upgradeMetaJobs(upgradeAmazonJobs(upgradeGoogleJobs(upgradeEightfoldJobs(upgradeAppleJobs(jobs)))))));
}
