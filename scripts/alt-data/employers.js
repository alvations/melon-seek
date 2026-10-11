// Which employer names in the US Department of Labor disclosure files are Amazon or Meta
// (docs/process/amazon-meta-data.md decision 6).
//
// Employers file under their legal entity names ("Amazon.com Services LLC", "Meta
// Platforms, Inc."), written many ways ("AMAZON.COM SERVICES, LLC", "Amazon Web Services,
// Inc"). A name is normalized (upper case, punctuation to spaces, corporate suffixes off) and
// then matched against an explicit allow-list per company. Anything else that merely
// contains a keyword ("AMAZON", "META", "FACEBOOK") is a near miss: it is never counted,
// but the summary lists it with its filing count, so a person can extend or confirm the list.
//
// Separate brands with their own careers sites (Audible, Twitch, Zoox, Whole Foods, Ring,
// Zappos, IMDb, One Medical; Oculus before it became Meta Platforms Technologies) are not
// matched: the beta site's Amazon and Meta boards would be www.amazon.jobs and
// www.metacareers.com.

const SUFFIX_RE = /\s+(?:INC|INCORPORATED|LLC|L L C|CORP|CORPORATION|CO|COMPANY|LTD|LIMITED|LP|LLP|PLLC|PC|NA)$/;

/** "Amazon.com Services, LLC." -> "AMAZON COM SERVICES". */
export function normalizeEmployer(name) {
  let s = String(name || '').toUpperCase().replace(/&/g, ' AND ').replace(/[^A-Z0-9]+/g, ' ').trim();
  // "U S" (from "U.S.") stays two letters; collapse it so "U S" and "US" match alike.
  s = s.replace(/\bU S\b/g, 'US');
  for (let prev = null; prev !== s;) { prev = s; s = s.replace(SUFFIX_RE, '').trim(); }
  return s;
}

/**
 * Allow-list: [company, canonical entity label, pattern on the normalized name].
 * Sources: the entity names Amazon and Meta use in their own filings and careers-site
 * footers ("© 1996-2026, Amazon.com, Inc. or its affiliates"; "Meta Platforms, Inc."),
 * and the subsidiaries that recruit through those two sites.
 */
export const ENTITIES = Object.freeze([
  ['amazon', 'Amazon.com Services LLC', /^AMAZON COM SERVICES$/],
  ['amazon', 'Amazon.com, Inc.', /^AMAZON COM$/],
  ['amazon', 'Amazon Web Services, Inc.', /^AMAZON WEB SERVICES$/],
  ['amazon', 'Amazon Development Center U.S., Inc.', /^AMAZON DEVELOPMENT CENTER(?: US)?$/],
  ['amazon', 'Amazon Data Services, Inc.', /^AMAZON DATA SERVICES$/],
  ['amazon', 'Amazon Fulfillment Services, Inc.', /^AMAZON FULFILLMENT SERVICES$/],
  ['amazon', 'Amazon Technologies, Inc.', /^AMAZON TECHNOLOGIES$/],
  ['amazon', 'Amazon Capital Services, Inc.', /^AMAZON CAPITAL SERVICES$/],
  ['amazon', 'Amazon Logistics, Inc.', /^AMAZON LOGISTICS$/],
  ['amazon', 'Amazon Advertising LLC', /^AMAZON ADVERTISING$/],
  ['amazon', 'Amazon Payments, Inc.', /^AMAZON PAYMENTS$/],
  ['amazon', 'Amazon Retail LLC', /^AMAZON RETAIL$/],
  ['amazon', 'Amazon Media Group LLC', /^AMAZON MEDIA GROUP$/],
  ['amazon', 'Amazon Content Services LLC', /^AMAZON CONTENT SERVICES$/],
  ['amazon', 'Amazon Studios LLC', /^AMAZON STUDIOS$/],
  ['amazon', 'Amazon Robotics LLC', /^AMAZON ROBOTICS$/],
  ['amazon', 'Amazon Lab126', /^(?:AMAZON )?LAB ?126$/],
  ['amazon', 'Amazon Kuiper (Kuiper Systems LLC)', /^(?:AMAZON KUIPER(?: [A-Z ]+)?|KUIPER (?:SYSTEMS|GOVERNMENT SOLUTIONS))$/],
  ['amazon', 'Amazon Digital Services LLC', /^AMAZON DIGITAL SERVICES$/],
  ['amazon', 'Amazon Corporate LLC', /^AMAZON CORPORATE$/],
  ['amazon', 'Amazon Prime Air', /^AMAZON PRIME AIR$/],
  ['amazon', 'A9.com, Inc.', /^A9 COM$/],
  ['meta', 'Meta Platforms, Inc.', /^META PLATFORMS$/],
  ['meta', 'Meta Platforms Technologies, LLC', /^META PLATFORMS TECHNOLOGIES$/],
  ['meta', 'Facebook, Inc. (now Meta Platforms, Inc.)', /^FACEBOOK$/],
  ['meta', 'Facebook Technologies, LLC (now Meta Platforms Technologies)', /^FACEBOOK TECHNOLOGIES$/],
  ['meta', 'Meta Payments Inc. (formerly Facebook Payments)', /^(?:META|FACEBOOK) PAYMENTS$/],
  ['meta', 'Instagram, LLC', /^INSTAGRAM$/],
  ['meta', 'WhatsApp LLC', /^WHATSAPP$/],
  ['meta', 'Siculus, Inc. (Meta data centers)', /^SICULUS$/],
]);

const KEYWORD = { amazon: /\bAMAZON|\bKUIPER\b|\bA9\b/, meta: /\bMETA\b|\bFACEBOOK|\bINSTAGRAM\b|\bWHATSAPP\b|\bSICULUS\b/ };

/** { company, entity } for an Amazon or Meta employer name, else null. */
export function matchEmployer(name) {
  const n = normalizeEmployer(name);
  if (!n) return null;
  for (const [company, entity, re] of ENTITIES) if (re.test(n)) return { company, entity };
  return null;
}

/** 'amazon' / 'meta' for a name that has a keyword but is not on the allow-list, else null. */
export function nearMiss(name) {
  if (matchEmployer(name)) return null;
  const n = normalizeEmployer(name);
  for (const [company, re] of Object.entries(KEYWORD)) if (re.test(n)) return company;
  return null;
}

/** True when a name is worth resolving in the first pass (a match or a near miss). */
export function employerCandidate(name) {
  const n = normalizeEmployer(name);
  return KEYWORD.amazon.test(n) || KEYWORD.meta.test(n);
}
