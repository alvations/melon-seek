// Talent pools and general applications (DQ-11, docs/process/data-check-beta.md): postings that
// collect interest for roles in general instead of hiring for one opening. Job.pool = true marks
// them (docs/CONTRACT.md v5); the app labels them. Pure, no imports (server/lib-modules.js).
//
// The posting's own words decide, never a guess from a long title or a stale date:
//   - the title: "Expression of Interest - Rigging" (Netflix, Anthropic), "Open Career
//     Opportunities, Waymo" and "Open Sales Career Opportunities, CapitalG Portfolio Companies"
//     (Google), "Client Partner (Leisure Vertical) - Join Our Talent Network" (Apple),
//     "COLM 2026 - General Interest" (Scale AI);
//   - the description: "This posting is not for a specific job opening and by submitting your
//     resume you are expressing interest in being contacted about this type of role" (Apple).
// Checked against all 13 snapshots of 2026-10-10 (log: docs/process/fix-beta-sources.md): no
// other title or description matches, and "Talent Acquisition Partner", "Talent Sourcer",
// "Internship Opportunities" and a description that mentions a "talent pool" do not.

const TITLE_RE = /\bexpressions? of interest\b|^open\b.{0,60}\bcareer opportunities\b|\bjoin our talent (?:network|community|pool)\b|\bgeneral (?:interest|application)$/i;
const PREFILTER_RE = /\bnot\s+for\b/i;
const TEXT_RE = /\b(?:this|the) (?:posting|position|role|listing|requisition) is not for (?:a |an )?(?:specific|particular|current) (?:job )?(?:opening|vacancy|position|role)\b/i;

/**
 * True when a posting is a talent pool or general application rather than one opening.
 * `job`: a Job ({ title, descriptionHtml }) or a RawJob ({ title, html, text }).
 */
export function isTalentPool(job) {
  if (!job) return false;
  const title = String(job.title || '').replace(/\s+/g, ' ').trim();
  if (TITLE_RE.test(title)) return true;
  const raw = typeof job.text === 'string' && job.text ? job.text : String(job.descriptionHtml || job.html || '');
  if (!PREFILTER_RE.test(raw)) return false; // cheap: most descriptions never say "not for a"
  return TEXT_RE.test(raw.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' '));
}

/** Jobs with `pool: true` set on talent pools (new objects for those; the rest unchanged). */
export function markTalentPools(jobs) {
  return (jobs || []).map((j) => (j && typeof j === 'object' && !j.pool && isTalentPool(j) ? { ...j, pool: true } : j));
}
