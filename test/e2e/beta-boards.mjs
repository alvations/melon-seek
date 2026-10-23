// The beta site's boards, from the registry (server/companies.js): every non-paused company of the beta channel.
// e2e files that mean "every big-tech board" read them here, so a board added (Amazon and Meta, 2026-10-11) or resumed
// is tested without editing each file (qa-suite-beta T-1: three files kept five hand-written boards for 12 days).
import { COMPANIES } from '../../server/companies.js';

export const BETA_COMPANIES = Object.freeze(COMPANIES.filter((c) => c.channel === 'beta' && !c.paused));
/** Slugs, in registry order. */
export const BETA_BOARDS = Object.freeze(BETA_COMPANIES.map((c) => c.slug));
/** slug -> the name the company menu shows. */
export const BETA_NAMES = Object.freeze(Object.fromEntries(BETA_COMPANIES.map((c) => [c.slug, c.name])));
/** The hosts (no "www.") a board's postings may link to: its postingHosts and the hosts of its postingPrefixes. */
export function postingHostsOf(slug) {
  const c = BETA_COMPANIES.find((x) => x.slug === slug);
  if (!c) return new Set();
  return new Set([...(c.postingHosts || []), ...(c.postingPrefixes || []).map((p) => new URL(p).hostname)].map((h) => h.replace(/^www\./, '')));
}
