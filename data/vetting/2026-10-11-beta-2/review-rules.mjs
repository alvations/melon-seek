// Reviewer decisions (claude via Claude Code) for data/vetting/2026-10-11-beta-2/: the second
// salary vetting of the beta boards, the first of Amazon and Meta (Amazon, Meta, Apple, Google,
// NVIDIA, Microsoft, Netflix) plus Anduril from the main site for comparison.
// Log: docs/process/vetting-beta-2.md. Method: docs/VETTING.md (rubric §5, conventions of the
// first beta review in data/vetting/2026-10-11-beta/summary.md §7).
//
// These are the per-job and per-pattern judgments the reviewer made after reading every flagged
// excerpt (1,610) and every job of the seeded sample (200, seed 2026101102), opening the posting's
// whole pay section where the excerpt was not enough (Amazon pay tables, the text above them,
// Microsoft level lines, Google country lines). verdicts.jsonl is their output. Replay:
//   node data/vetting/2026-10-11-beta-2/review-rules.mjs <company|all> --pv <published-view dir>
// (<published-view dir>: `node data/vetting/2026-10-11-beta/published-view.mjs <dir> <snapshots...>`,
// outside the repo.) It appends one verdict per job, skipping ids already in verdicts.jsonl (it
// never overwrites), so a replay of a complete file is a no-op.
//
// Every quote is an exact substring of the review input: the line's whitespace-flattened excerpt,
// one of its pay_snippets, or the posting's flattened description text (Amazon's pay table and
// the sentence above it often fall outside the 300-character excerpt). For Meta, whose only pay
// source is the structured `public_compensation` field (the description states no pay), the
// excerpt is that field's own strings ("$7,313/month to $12,667/month (US)", written by
// server/sources/meta.js#mapMetaJob from compensation_amount_minimum/maximum); `quote_source`
// says which source a quote is from. The script refuses to write a verdict whose quote is not found.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, '..', '..', '..');
const OUT = process.env.VB2_OUT || path.join(DIR, 'verdicts.jsonl'); // VB2_OUT: a dry run elsewhere
// The code that produced `parsed`: the snapshots were written by norm-8 crawls (2026-10-11
// 15:04-17:27 UTC); the build re-derives them with the worktree's norm-9 code (94cb54c,
// scripts/build-static.js#readSnapshot), which published-view.mjs repeats. Hashes: sha256 prefixes.
const PARSER_VERSION = 'git 94cb54c (norm-9) / salary.js sha256:6edbc4ffddce, amazon.js 1479634d89c3, meta.js 411fd9fdfa1e, vet.js 2072d23dfe67; snapshots crawled with norm-8, re-derived as the build does';
const REVIEWER = 'claude via Claude Code';

const args = process.argv.slice(2);
const pvAt = args.indexOf('--pv');
const PV = pvAt >= 0 ? args[pvAt + 1] : process.env.VB2_PV;
const which = args.filter((a, i) => !a.startsWith('--') && i !== pvAt + 1)[0] || 'all';
if (!PV) { console.error('usage: review-rules.mjs <company|all> --pv <published-view dir>'); process.exit(2); }
const { htmlToText } = await import(pathToFileURL(path.join(ROOT, 'server', 'sources', 'util.js')).href);

const F = { hour: 2080, day: 260, week: 52, month: 12, year: 1 };
const r2 = (n) => Math.round(n * 100) / 100;
const flat = (s) => String(s || '').replace(/\s+/g, ' ').trim();
/** The parsed Job salary back in its source interval (what the posting states). */
const orig = (p) => {
  if (!p) return null;
  const iv = p.intervalCorrected ? 'year' : p.originalInterval || 'year';
  const f = iv === 'term' && p.termWeeks ? 52 / p.termWeeks : F[iv] || 1;
  return { min: r2(p.min / f), max: r2(p.max / f), currency: p.currency, interval: iv };
};
const kindOf = (c, k) => (!c ? null : k || (c.interval === 'hour' ? 'hourly' : 'salary'));

/* ------------------------------------------------------------ posting text */
const texts = new Map();
function postingText(l) {
  if (!texts.has(l.company)) {
    const f = path.join(PV, `${l.company}.json`);
    const m = new Map();
    if (fs.existsSync(f)) for (const j of JSON.parse(fs.readFileSync(f, 'utf8')).jobs) m.set(j.id, j);
    texts.set(l.company, m);
  }
  const j = texts.get(l.company).get(l.id);
  return j ? flat(htmlToText(j.descriptionHtml || '')) : '';
}

/** Review-input sources, in preference order: [name, text]. */
function sources(l) {
  const own = flat(l.parsed && l.parsed.text).slice(0, 300);
  const ex = flat(l.excerpt);
  const out = [];
  if (ex && (ex !== own || l.company === 'meta' || (l.company === 'amazon' && l.source === 'structured'))) out.push([ex === own ? 'structured_field' : 'excerpt', ex]);
  for (const s of l.pay_snippets || []) out.push(['pay_snippets', flat(s)]);
  const t = postingText(l);
  if (t) out.push(['posting_text', t]);
  return out;
}

/** An exact substring of the line's sources around `needle` (word-trimmed): { q, src }. */
function quote(l, needle, before = 60, after = 70) {
  if (!needle) return null;
  for (const [src, h] of sources(l)) {
    const i = h.indexOf(needle);
    if (i < 0) continue;
    let a = Math.max(0, i - before);
    let b = Math.min(h.length, i + needle.length + after);
    while (a > 0 && a < i && h[a - 1] !== ' ') a++;
    while (b < h.length && b > i + needle.length && h[b] !== ' ') b--;
    return { q: h.slice(a, b).trim(), src };
  }
  return null;
}
const quoteAny = (l, needles, ...rest) => { for (const n of needles) { const q = quote(l, n, ...rest); if (q) return q; } return null; };

const fmtComma = (n) => (Number.isInteger(n) ? n.toLocaleString('en-US') : n.toFixed(2));
const fmt2 = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** A quote of the parsed amount as the posting writes it (several house styles). */
function amountQuote(l, before = 60, after = 70) {
  const o = orig(l.parsed);
  if (!o) return null;
  const forms = [];
  for (const v of [o.min, o.max]) {
    forms.push(`${fmt2(v)} ${o.currency}`, `$${fmtComma(v)}`, `${fmtComma(v)} ${o.currency}`, `$${v}`, `€${v}`, `zł${v}`, `kr${v}`, `kr.${v}`, `€ ${fmtComma(v)}`, `€ ${fmt2(v)}`, `£ ${fmt2(v)}`, `£ ${fmtComma(v)}`, `kr ${fmtComma(v)}`, `Kč ${fmtComma(v)}`, `zł ${fmtComma(v)}`, `lei ${fmt2(v)}`, `lei${v}`, `CAD $${fmtComma(v)}`, `$${fmt2(v)}`, `$${v.toFixed(2)}`, `$${fmtComma(v)}/year`, `$${fmtComma(v)}/month`, `CA$${fmtComma(v)}`, `€${fmtComma(v)}`, `PLN${fmtComma(v)}`, `${fmtComma(v)}`);
  }
  return quoteAny(l, forms, before, after);
}
/** The Amazon pay-table row the salary is (salary.text is the row as posted). */
const rowQuote = (l) => (l.parsed && l.parsed.text ? quote(l, flat(l.parsed.text), 0, 0) : null);

const V = (verdict, corrected, note, { kind = null, q = null } = {}) => ({ verdict, corrected, note, kind, q });

/* -------------------------------------------------------------- by job id */
const BY_ID = {
  // New (VT-14): a Mexico-only posting's "$" is the peso; read as USD.
  'amazon:SF260124856': (l) => V('parser_bug', { min: 12569, max: 12569, currency: 'MXN', interval: 'month' }, 'A Mexico-only posting ("Work from home in Mexico ONLY for Yucatán and Puebla"): "$" is the Mexican peso. MXN 12,569 a month is about US$723 (17.386 MXN per USD, FX_PER_USD); the site publishes US$12,569 a month, US$150,828 a year, about 17 times too high, for a customer-service associate. A bare "$" on a posting whose places are all in Mexico should be MXN, as it is CAD for Canada-only postings (VETTING.md §2).', { q: quote(l, 'Monthly Salary: $12,569', 75, 0) }),
  // Microsoft Romania: correct lei pay quarantined by the statistical layer (VT-16).
  'microsoft:1970393556864608': (l) => V('correct', { min: 90500, max: 135700, currency: 'RON', interval: 'year' }, 'The posted Romanian range, read correctly since fix wave 4 (MR-1). The gate quarantines it as a low statistical outlier ($24.7K against Microsoft\'s $166K company median): a false positive, because every comparison group (department, role family, pay kind) mixes countries, and Romanian pay is about a seventh of U.S. pay (VT-16).', { q: amountQuote(l) }),
  'microsoft:1970393557014754': (l) => V('correct', { min: 83000, max: 107800, currency: 'RON', interval: 'year' }, 'Same as microsoft:1970393556864608: the posted Romanian IC1 range, quarantined by the low-side statistics ($20.8K against a $166K median). Gate false positive (VT-16).', { q: amountQuote(l) }),
  // VT-1 re-check: no Brazil pay is stated; null is right since fix wave 4.
  'microsoft:1970393556980229': (l) => V('correct', null, 'Re-check of VT-1 (fixed): the only lines are the U.S. national and SF Bay Area / NYC ranges, and the job is in São Paulo State, Brazil, so no salary is right. The scan still flags missed_salary because the U.S. line is pay context; a parser rule rejects it as another country\'s pay.', { q: quote(l, 'across the U.S. is USD $75,400 - $167,900 per year', 40, 0) }),
  // Netflix (same as 2026-10-11-beta).
  'netflix:790298021069': (l) => V('source_ambiguous', null, 'A 6.5x range for one L4 role ($71,040 to $464,000); other Netflix L4 ranges in this crawl are about 1.6x. Probably a typo in the minimum. The gate quarantines it (range_ratio): correct. Same verdict as 2026-10-11-beta.', { q: quote(l, 'The range for this role is $71,040.00 - $464,000.00.', 0, 0) }),
  'netflix:790312403200': (l) => V('correct', { min: 737000, max: 1430000, currency: 'USD', interval: 'year' }, 'A real, written-out posted range ("The range for this role is ..."); Netflix pays all cash. Above the gate\'s $1.2M bound, so quarantined (above_max) by policy: the known false positive VT-10, still open.', { q: quote(l, 'The range for this role is $737,000.00 - $1,430,000.00.', 0, 0) }),
  // Anduril (main site, for comparison): same decisions as the 2026-10-02 and 2026-10-11-beta reviews.
  'anduril:5078772007': (l) => V('source_ambiguous', null, 'Source range spans 13x; almost certainly a dropped zero (126,000). Quarantined (below_min, range_ratio). Same verdict as 2026-10-02.', { q: quoteAny(l, ['$12,600 — $167,000', '12,600–167,000'], 30, 10) }),
  'anduril:5196291007': (l) => V('source_ambiguous', null, 'Source range spans 13x; almost certainly a dropped zero (146,000). Quarantined. Same verdict as 2026-10-02.', { q: quoteAny(l, ['$14,600 — $194,000', '14,600–194,000'], 30, 10) }),
  'anduril:5048074007': (l) => V('source_ambiguous', null, 'Source range spans 13x; almost certainly a dropped zero (112,000). Quarantined. Same verdict as 2026-10-02.', { q: quoteAny(l, ['$11,200 — $149,000', '11,200–149,000'], 30, 10) }),
  'anduril:5209998007': (l) => V('source_ambiguous', null, 'Source range spans 13x; almost certainly a dropped zero (220,000). Quarantined (range_ratio). Same verdict as 2026-10-02.', { q: quoteAny(l, ['$22,000 — $292,000', '22,000–292,000'], 30, 10) }),
  'anduril:5209999007': (l) => V('source_ambiguous', null, 'Source range spans 13x; almost certainly a dropped zero (220,000). Quarantined (range_ratio).', { q: quoteAny(l, ['$22,000 — $292,000', '22,000–292,000'], 30, 10) }),
  'anduril:5047568007': (l) => V('correct', { min: 147000, max: 195000, currency: 'USD', interval: 'year' }, 'UAE role stated in USD by the source (Greenhouse pay range under "US Salary Range"). Same verdict as 2026-10-02 (rubric: USD for a non-US office is correct): no other country is named.', { q: quoteAny(l, ['$147,000 — $195,000', '147,000–195,000'], 30, 10) }),
  'anduril:5247875007': (l) => V('source_ambiguous', { min: 14.41, max: 18.82, currency: 'EUR', interval: 'hour' }, 'UK role stated in EUR with hourly-sized amounts under "UK Salary Range"; parsed literally. Same verdict as 2026-10-02.', { q: quote(l, '€14,41 — €18,82 EUR', 20, 0) }),
  'anduril:5256999007': (l) => V('source_ambiguous', { min: 220000, max: 292000, currency: 'USD', interval: 'year' }, 'Labelled "US Hourly Range" but the amounts are an annual salary for a Senior Computer Vision Engineer; read as annual (intervalCorrected). Correct handling of a source label error.', { q: quote(l, 'US Hourly Range', 0, 30) }),
};

/* ----------------------------------------------------------- Amazon rules */
// The text right above Amazon's pay table says what the figures are.
const AMZ_FLOOR_RE = /See below the minimum gross base salary for this position|The minimum (?:gross )?base pay salary for this position is listed below|The minimum base pay for this position is [A-Z]{3} [\d,.]+ monthly/;
const AMZ_AT_RE = /The minimum basic salary for this position is EUR [\d']+ gross annually/;
const AMZ_SHIFT_RE = /including the base pay rate plus the highest available shift differential/;
const AMZ_LOWER_RE = /(?:Pay starts at \$[\d.]+ ?per hour|The starting pay for this role in Washington State is up to \$[\d.]+ ?\/ ?hour)/;

function amazon(l) {
  const p = l.parsed;
  const o = orig(p);
  const f = new Set(l.flags);
  const t = postingText(l);
  const row = rowQuote(l);
  const single = p && p.min === p.max;
  const placeNote = p && Array.isArray(p.ranges) && new Set(p.ranges.map((r) => `${r.min}|${r.max}`)).size > 1
    ? ` The table prices ${p.ranges.length} places with ${new Set(p.ranges.map((r) => `${r.min}|${r.max}`)).size} different ranges; the salary is the primary location's row (DATA_SOURCES §7a), which is right, but every other place is shown and Juiced on it too (VT-15).`
    : '';
  if (!p) return V('correct', null, 'No pay stated.', { q: null });

  // Austria: a monthly table figure next to an annual minimum the text states (14 monthly salaries).
  if (AMZ_AT_RE.test(t) && p.originalInterval === 'month') {
    const m = AMZ_AT_RE.exec(t);
    return V('source_ambiguous', o, `The table gives ${o.min.toLocaleString('en-US')} EUR a month, which the site annualizes x12 to ${p.min.toLocaleString('en-US')} EUR; the same posting says "${m[0]}". Austrian salaries are paid 14 times a year, and 14 x the monthly figure is about 47,000, so the published annual figure is about 14% low (VT-19). Shown as posted per month; the annual figure needs the 14-payment rule.`, { q: quote(l, m[0], 0, 0) });
  }
  // EU minimum-pay tables: a single floor figure presented as the pay (VT-17).
  if (single && AMZ_FLOOR_RE.test(t) && p.currency !== 'USD' && p.currency !== 'CAD') {
    const m = AMZ_FLOOR_RE.exec(t);
    const stated = /The base pay for this position is PLN [\d,.]+ monthly\./.exec(t);
    if (stated && t.includes(`The base pay for this position is PLN ${o.min} monthly.`)) {
      return V('correct', o, `The posting states the base pay plainly ("${stated[0]}") and the table's minimum is the same figure, so this one is the pay, not only a floor.`, { q: quote(l, stated[0], 0, 0) });
    }
    return V('parser_bug', null, `The figure is a statutory minimum, not the role's pay: the text above the table says "${m[0]}", and the posting adds that Amazon may offer more. A single floor figure is published as a fixed salary (${o.min.toLocaleString('en-US')} ${o.currency} per ${o.interval}). By the parser's own rule a floor is not pay (VETTING.md §2, "Floors and area bands are not pay"), so corrected is null; see VT-17 for the alternative of a labelled minimum ("from ...").`, { q: quote(l, m[0], 0, 0) });
  }
  // Text figures lower than the table's (the table includes the highest shift differential).
  if (AMZ_LOWER_RE.test(t) && f.has('structured_text_disagree')) {
    const m = AMZ_LOWER_RE.exec(t);
    return V('source_ambiguous', o, `Two figures: the text says "${m[0]}", the pay table (structured) gives ${o.min}-${o.max} ${o.currency}/hour, which Amazon says is the starting pay "including the base pay rate plus the highest available shift differential". Structured wins (rubric); the published hourly rate is the top-shift starting rate, above the posting's own base (VT-18).`, { q: quote(l, m[0], 0, 0) });
  }
  if (AMZ_LOWER_RE.test(t) && AMZ_SHIFT_RE.test(t)) {
    const m = AMZ_LOWER_RE.exec(t);
    return V('source_ambiguous', o, `Two figures: "${m[0]}" and the pay table's ${o.min}-${o.max} ${o.currency}/hour "including the base pay rate plus the highest available shift differential". Structured wins (rubric); the published rate includes the top shift differential (VT-18).`, { q: quote(l, m[0], 0, 0) });
  }
  if (l.id === 'amazon:SF260124856') return BY_ID[l.id](l);
  // PERM-style text: "(40 hours / week, 8:00am-5:00pm, Salary Range $137488 - $178400)".
  if (f.has('interval_corrected')) {
    return V('correct', o, 'A labour-certification style line: "40 hours / week" made the range look weekly; the numbers are an annual salary, read as annual (intervalCorrected), and the posting\'s own "(yr)" line or the job agrees.', { q: quoteAny(l, ['Salary Range $', 'Salary Range: $'], 40, 40) });
  }
  if (p.source === 'text') {
    return V('correct', o, sample(l) ? 'Sample: the posting\'s salary sentence, as parsed.' : 'Matches the salary sentence.', { q: amountQuote(l) || quoteAny(l, ['Salary Range'], 0, 60) });
  }
  if (p.originalInterval === 'hour') {
    const shift = AMZ_SHIFT_RE.test(t) ? ' The table is the starting pay "including the base pay rate plus the highest available shift differential" (VT-18: the label should say so).' : '';
    const pt = p.partTime ? ` Part-time role (partTime${p.hoursPerWeek ? `, ${p.hoursPerWeek} hours a week stated` : ', no weekly hours read, so no Juice'}).` : '';
    return V('correct', o, `Hourly row of the pay table for the primary location, as posted.${shift}${pt}${placeNote}`, { q: row || amountQuote(l) });
  }
  if (p.originalInterval === 'month') {
    return V('correct', o, `Monthly row of the pay table, as posted ("See below the gross base salary for this position"), annualized x12.${placeNote}`, { q: row || amountQuote(l) });
  }
  if (f.has('structured_text_disagree')) {
    return V('correct', o, `The pay table's row for the primary location, as posted; the scan's text parse read another row of the same table (the rows differ by place).${placeNote}`, { q: row || amountQuote(l) });
  }
  return V('correct', o, `${sample(l) ? 'Sample: the' : 'The'} pay table's row for the primary location, as posted ("The base salary range for this position is listed below").${placeNote}`, { q: row || amountQuote(l) });
}

/* ------------------------------------------------------------- Meta rules */
function meta(l) {
  const p = l.parsed;
  const o = orig(p);
  const q = quote(l, flat(p.text).replace(/ \+ bonus.*$/, ''), 0, 40);
  if (l.id === 'meta:902109179409028') return V('correct', o, 'Meta posts one range, for Italy ("(IT)"); the job lists Madrid, Paris, Milan and London. The number is right for Milan, but salary.country is not set from the comp\'s country_code, so the Spanish and French places show and Juice Italian pay (VT-20).', { q });
  if (p.originalInterval === 'month') return V('correct', o, 'Meta\'s structured intern pay ("$X/month to $Y/month"), annualized x12; bonus and equity are named, not added.', { q });
  return V('correct', o, `${sample(l) ? 'Sample: ' : ''}Meta's structured base range (public_compensation) for the job's country; "+ bonus + equity" is named, never added to the numbers. The description states no pay, so this field is the only source.`, { q });
}

/* ---------------------------------------------- other boards (re-checks) */
const sample = (l) => l.review_set === 'sample';
function others(l) {
  const p = l.parsed;
  const o = orig(p);
  const f = new Set(l.flags);
  switch (l.company) {
    case 'apple':
      if (p && p.ranges && p.ranges.length > 1) return V('correct', o, `Apple's per-place footers (${p.ranges.map((r) => r.label).join(' / ')}), spanned (spread ${p.spread}x); since fix wave 4 each place shows and Juices its own range (salary.ranges[].locations, salary.places).`, { kind: p.kind === 'hourly' ? 'hourly' : 'salary', q: amountQuote(l) });
      if (p && p.originalInterval === 'hour') return V('correct', o, `Hourly range as posted ("between $X and $Y/hr").${p.partTime ? ' Part-time: partTime is set, the yearly figure is a 2,080-hour equivalent.' : ''}`, { q: quote(l, 'The base pay range for this role is between', 0, 50) || amountQuote(l) });
      return V('correct', o, sample(l) ? 'Sample: the footer\'s base pay range, as parsed.' : 'Matches the footer\'s base pay range.', { q: quote(l, 'The base pay range for this role is between', 0, 50) || amountQuote(l) });
    case 'google':
      if (f.has('multi_currency')) return V('correct', o, `One pay line per country; the parser took the ${o.currency} line for the job's own country (job countries ${l.countries.join(', ')}: the US line when the job has a US location, else the first location's country that has a line) and sets salary.country, so the other countries' places are not shown on it (VT-5 fixed).`, { q: amountQuote(l) });
      if (p && p.currency === 'RON') return V('correct', o, 'Romanian pay in lei, read since fix wave 4 (VT-2/MR-1).', { q: amountQuote(l) });
      return V('correct', o, sample(l) ? 'Sample: the job\'s country line, as parsed.' : 'Matches the country line.', { q: amountQuote(l) });
    case 'microsoft':
      if (f.has('multiple_ranges') && p) return V('correct', o, `One national range per country; the parser took the ${o.currency} line of the job's country (${l.countries.join(', ')}).`, { q: amountQuote(l) });
      if (p && p.originalInterval === 'hour') return V('correct', o, 'Microsoft posts this role\'s national (or SF Bay Area / NYC) range per hour; parsed as stated, by level where the posting lists several.', { q: amountQuote(l) || quote(l, 'per hour', 90, 0) });
      if (p && p.originalInterval === 'month') return V('correct', o, 'Monthly intern/postdoc pay as posted ("... per month"), annualized x12.', { q: amountQuote(l) || quote(l, 'per month', 90, 0) });
      if (p && p.currency === 'RON') return V('correct', o, 'Romanian pay in lei, read since fix wave 4 (VT-2/MR-1).', { q: amountQuote(l) });
      return V('correct', o, sample(l) ? 'Sample: the national (or SF Bay Area / NYC) range for the job\'s country and level, as parsed.' : 'Matches the national range.', { q: amountQuote(l) });
    case 'netflix': {
      const nq = amountQuote(l) || quoteAny(l, ['The hourly range for this role is', 'The overall market range for this role is typically', 'The range for this role is'], 0, 45);
      if (p && p.originalInterval === 'hour') return V('correct', o, `Hourly range as posted${/,\d\d-/.test(flat(l.excerpt)) ? ' (decimal commas: "$32,69- $40,38 an hour" is $32.69-$40.38)' : ''}.`, { q: nq });
      return V('correct', o, sample(l) ? 'Sample: "The range for this role is ..." (Netflix pays all cash), as parsed; a bare "$" on a Canada-only posting is CAD.' : 'Matches the stated range.', { q: nq });
    }
    case 'nvidia':
      if (p && p.originalInterval === 'hour') return V('correct', o, `Intern hourly rate as posted ("The hourly rate for our interns is ...").${f.has('ratio_over_3') ? ` A wide (${p.spread}x) but explicitly stated range for all intern levels and degrees; under the 4x quarantine bound, labelled as a wide range.` : ''}`, { q: quote(l, 'The hourly rate for our interns is', 0, 30) || amountQuote(l) });
      return V('correct', o, sample(l) ? 'Sample: the base salary range (both levels spanned when the posting lists two), as parsed.' : 'Matches the base salary range.', { q: amountQuote(l) });
    case 'anduril':
      if (p && p.originalInterval === 'hour') return V('correct', o, `Hourly range as posted${l.source === 'structured' ? ' (Greenhouse pay range)' : ''}; tiered lists are spanned.`, { q: amountQuote(l) || quoteAny(l, ['US Hourly Range', 'HOURLY RATE', 'Hourly Rate', 'US Salary Range'], 0, 40) });
      return V('correct', o, sample(l) ? 'Sample: Greenhouse pay range, matches "US Salary Range" in the text.' : 'Matches the source.', { q: amountQuote(l) });
  }
  return V('correct', o, 'Matches the source.', { q: amountQuote(l) });
}

function decide(l) {
  if (BY_ID[l.id]) return BY_ID[l.id](l);
  if (l.company === 'amazon') return amazon(l);
  if (l.company === 'meta') return meta(l);
  return others(l);
}

/* -------------------------------------------------------------------- run */
const done = new Set(fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8').trim().split('\n').filter(Boolean).map((s) => JSON.parse(s).id) : []);
const read = (f, set) => fs.readFileSync(path.join(DIR, f), 'utf8').trim().split('\n').filter(Boolean).map((s) => ({ ...JSON.parse(s), review_set: set }));
const lines = [...read('flags.jsonl', 'flagged'), ...read('sample.jsonl', 'sample')].filter((l) => which === 'all' || l.company === which);
let n = 0;
const counts = {};
const problems = [];
for (const l of lines) {
  if (done.has(l.id)) continue;
  const d = decide(l);
  const qq = d.q || null;
  if (!qq || !qq.q || !sources(l).some(([, h]) => h.includes(flat(qq.q)))) { problems.push(`${l.id}: quote not found in the review input: ${JSON.stringify(qq)}`); continue; }
  const rec = {
    id: l.id, url: l.url, company: l.company, title: l.title, review_set: l.review_set,
    ...(l.sample_seed ? { sample_seed: l.sample_seed } : {}),
    flags: l.flags, parsed: l.parsed, corrected: d.corrected, verdict: d.verdict,
    kind: kindOf(d.corrected, d.kind),
    quote: flat(qq.q), quote_source: qq.src,
    evidence: `"${flat(qq.q)}" — ${d.note}`,
    reviewer: REVIEWER, reviewed_at: new Date().toISOString(), parser_version: PARSER_VERSION,
  };
  fs.appendFileSync(OUT, `${JSON.stringify(rec)}\n`);
  done.add(l.id);
  n++;
  counts[d.verdict] = (counts[d.verdict] || 0) + 1;
}
console.log(`${which}: appended ${n} verdicts`, counts);
for (const p of problems.slice(0, 40)) console.error(`  NOT WRITTEN ${p}`);
if (problems.length > 40) console.error(`  ... ${problems.length - 40} more`);
process.exitCode = problems.length ? 1 : 0;
