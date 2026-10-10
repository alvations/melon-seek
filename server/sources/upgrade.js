// Read-time upgrade of stored big-tech snapshots (beta fix wave, 2026-10-10;
// docs/process/fix-beta-sources.md). Snapshots keep normalized Jobs, not the boards' raw
// records, so adapter fixes reach the site only after the next crawl. This applies them to
// the stored Jobs whenever a snapshot is read (scripts/build-static.js#readSnapshot and
// server/pipeline.js, after relocateJobs), so the current bundle shows them now:
//   - Apple: one posting per requisition with each place's pay (DQ-2); no store names as
//     places, links encoded once, Part-time only when the posting backs it (DQ-9);
//   - NVIDIA: hybrid- or on-site-tagged postings are not remote (DQ-12);
//   - Google: decoded titles (DQ-16), the brand as the department (D-24);
//   - every board: talent pools and general applications get `pool: true` (DQ-11).
// Location fixes (DQ-4, DQ-10, D-23) need nothing here: relocateJobs re-geocodes stored
// locations with server/geo.js. Pure and idempotent: a snapshot crawled with the fixed
// adapters passes through unchanged. Unlike relocateJobs it may return FEWER jobs (Apple
// copies merge), so the archive ingest, which pairs stored and upgraded jobs by index, must
// not use it.
import { upgradeAppleJobs } from './apple.js';
import { upgradeEightfoldJobs } from './eightfold.js';
import { upgradeGoogleJobs } from './google.js';
import { markTalentPools } from './pool.js';

/** Stored Jobs of one board -> the same Jobs as the current adapters would have produced. */
export function upgradeStoredJobs(jobs) {
  if (!Array.isArray(jobs)) return jobs;
  return markTalentPools(upgradeGoogleJobs(upgradeEightfoldJobs(upgradeAppleJobs(jobs))));
}
