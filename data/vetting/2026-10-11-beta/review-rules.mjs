// Reviewer decisions (Claude via Claude Code) for data/vetting/2026-10-11-beta/: the first
// salary vetting of the beta boards (Apple, Google, Microsoft, NVIDIA, Netflix) plus Anduril
// from the main site for comparison. Log: docs/process/vetting-beta.md. Method: docs/VETTING.md.
//
// These are the per-job and per-pattern judgments the reviewer made after reading every
// flagged excerpt (578) and every job of the seeded sample (150, seed 20261011), opening the
// full pay section of the posting where the excerpt was not enough. verdicts.jsonl is their
// output. Replay:
//   node data/vetting/2026-10-11-beta/review-rules.mjs <company|all>
// It appends one verdict per job for that batch, skipping ids already in verdicts.jsonl
// (never overwrites), so a replay of a complete file is a no-op.
//
// Every evidence quote is an exact substring of the review input (the flags/sample line's
// whitespace-flattened excerpt or pay_snippets, which are themselves substrings of the
// posting's flattened text). The script refuses to write a verdict whose quote is not.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, 'verdicts.jsonl');
// The code that produced `parsed`: the snapshots were written by norm-7 crawls (2026-10-11
// 06:38-08:00 UTC); the build re-derives them with the worktree's norm-8 code (6f69079), which
// gives the same numbers for all 16,182 jobs (only norm-8 labels change). salary.js sha256 below.
const PARSER_VERSION = 'git 6f69079 (norm-8) / salary.js sha256:bea9f3bd206d (last changed a69e461); snapshots crawled with norm-7';
const REVIEWER = 'claude via Claude Code';

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

/**
 * The line's source text: its excerpt and pay snippets. When the scan could not locate the
 * salary in the posting (a level group's joined text, "IC3: …; IC4: …"), the excerpt is the
 * salary's own text, not the posting's, so it is left out.
 */
const sourceHay = (l) => [flat(l.excerpt) === flat(l.parsed && l.parsed.text).slice(0, 300) ? null : l.excerpt, ...(l.pay_snippets || [])].filter(Boolean).map(flat);

/** An exact substring of the line's source text around `needle` (word-trimmed). */
function quote(l, needle, before = 60, after = 70) {
  const hay = sourceHay(l);
  for (const h of hay) {
    const i = needle ? h.indexOf(needle) : -1;
    if (i < 0) continue;
    let a = Math.max(0, i - before);
    let b = Math.min(h.length, i + needle.length + after);
    while (a > 0 && a < i && h[a - 1] !== ' ') a++;
    while (b < h.length && b > i + needle.length && h[b] !== ' ') b--;
    return h.slice(a, b).trim();
  }
  return null;
}
/** First of several needles that quotes. */
const quoteAny = (l, needles, ...rest) => { for (const n of needles) { const q = quote(l, n, ...rest); if (q) return q; } return null; };

const fmtComma = (n) => (Number.isInteger(n) ? n.toLocaleString('en-US') : n.toFixed(2));
/** A quote of the parsed amount as the posting writes it (several house styles). */
function amountQuote(l) {
  const o = orig(l.parsed);
  if (!o) return null;
  const forms = [];
  for (const v of [o.min, o.max]) {
    forms.push(`$${fmtComma(v)}`, `${fmtComma(v)} ${o.currency}`, `$${v}`, `€${v}`, `zł${v}`, `kr${v}`, `kr.${v}`, `€ ${fmtComma(v)}`, `£ ${fmtComma(v)}`, `kr ${fmtComma(v)}`, `Kč ${fmtComma(v)}`, `zł ${fmtComma(v)}`, `CAD $${fmtComma(v)}`, `$${fmtComma(v)}.00`, `$${v.toFixed(2)}`, `${fmtComma(v)}`);
  }
  return quoteAny(l, forms);
}

const V = (verdict, corrected, note, { kind = null, q = null } = {}) => ({ verdict, corrected, note, kind, q });

/* -------------------------------------------------------------- by job id */
const MS_BR = 'microsoft:1970393556980229';
const BY_ID = {
  // VT-1: the only range in the posting is the U.S. one; the job is in São Paulo, Brazil.
  [MS_BR]: V('parser_bug', null, 'The posting gives only the U.S. national range ("across the U.S. is USD ...") and its SF Bay Area / NYC range; the job is in São Paulo State, Brazil. The parser used the U.S. line for a Brazil-only job (salary.country US, currency USD), so another country\'s pay is plotted under Brazil. No pay is stated for Brazil: show none.', { q: 'Critical Environment Ops M3 - The typical base pay range for this role across the U.S. is USD $75,400 - $167,900 per year.' }),
  // Netflix: a 6.5x stated range at L4 (the gate quarantines it, range_ratio).
  'netflix:790298021069': V('source_ambiguous', null, 'A 6.5x range for one L4 role ($71,040 to $464,000) is not a usable posted range; Netflix L4 ranges elsewhere in this crawl are about 1.6x (e.g. $250,000 - $413,000). Probably a typo in the minimum. The gate quarantines it (range_ratio): correct.', { q: 'The range for this role is $71,040.00 - $464,000.00.' }),
  // Netflix L7: real, written-out range above the $1.2M bound (policy quarantine, VETTING.md §2).
  'netflix:790312403200': V('correct', { min: 737000, max: 1430000, currency: 'USD', interval: 'year' }, 'A real, written-out posted range ("The range for this role is ..."); Netflix pays all cash. It is above the gate\'s $1.2M bound, so the gate quarantines it (above_max) by policy: a known false positive (VETTING.md §2 "Above the bound").', { q: 'The range for this role is $737,000.00 - $1,430,000.00.' }),
  // VT-3: Netflix intern market band, stated as total compensation.
  'netflix:790315673635': V('parser_bug', null, 'Not this role\'s base pay: an "overall market range for Netflix Internships" (a band for every internship, like the sales "range for roles in this area" the parser already rejects) that the next sentence says "is based on total compensation (vs. only base salary)". The project\'s base-pay-only rule (DATA_SOURCES.md §7a) makes it no salary. Published as base hourly pay $40-$110/hr.', { q: 'The overall market range for Netflix Internships is typically $40/hour - $110/hour. This market range is based on total compensation (vs. only base salary)' }),
  'netflix:790317917022': V('parser_bug', null, 'Same as netflix:790315673635: a market band for all Netflix internships, "based on total compensation (vs. only base salary)", published as base hourly pay $40-$85/hr.', { q: 'The overall market range for Netflix Internships is typically $40/hour - $85/hour. This market range is based on total compensation (vs. only base salary)' }),
  // Anduril (main site, for comparison): same decisions as the 2026-10-02 review of the same ids.
  'anduril:5078772007': V('source_ambiguous', null, 'Source range (structured and text) spans 13x; almost certainly a dropped zero (126,000). Quarantined (below_min, range_ratio). Same verdict as 2026-10-02.', { q: 'US Salary Range $12,600 — $167,000 USD' }),
  'anduril:5196291007': V('source_ambiguous', null, 'Source range spans 13x; almost certainly a dropped zero (146,000). Quarantined. Same verdict as 2026-10-02.', { q: 'US Salary Range $14,600 — $194,000 USD' }),
  'anduril:5048074007': V('source_ambiguous', null, 'Source range spans 13x; almost certainly a dropped zero (112,000). Quarantined. Same verdict as 2026-10-02.', { q: 'US Salary Range $11,200 — $149,000 USD' }),
  'anduril:5209998007': V('source_ambiguous', null, 'Source range spans 13x; almost certainly a dropped zero (220,000). Quarantined (range_ratio). Same verdict as 2026-10-02.', { q: 'US Salary Range $22,000 — $292,000 USD' }),
  'anduril:5209999007': V('source_ambiguous', null, 'Source range spans 13x; almost certainly a dropped zero (220,000). Quarantined (range_ratio).', { q: 'US Salary Range $22,000 — $292,000 USD' }),
  'anduril:5047568007': V('correct', { min: 147000, max: 195000, currency: 'USD', interval: 'year' }, 'UAE role stated in USD by the source (Greenhouse pay range under Anduril\'s "US Salary Range" label). Same verdict as 2026-10-02 (rubric: USD for a non-US office is correct). Compare VT-1: there the text names another country.', { q: 'US Salary Range $147,000 — $195,000 USD' }),
  'anduril:5247875007': V('source_ambiguous', { min: 14.41, max: 18.82, currency: 'EUR', interval: 'hour' }, 'UK role stated in EUR with hourly-sized amounts under "UK Salary Range"; parsed literally. Same verdict as 2026-10-02.', { q: 'UK Salary Range €14,41 — €18,82 EUR' }),
  'anduril:5256999007': V('source_ambiguous', { min: 220000, max: 292000, currency: 'USD', interval: 'year' }, 'Labelled "US Hourly Range" but the amounts are an annual salary for a Senior Computer Vision Engineer; read as annual (intervalCorrected). Correct handling of a source label error (class S2 of 2026-10-02).', { q: 'US Hourly Range $220,000 — $292,000 USD' }),
};

/* ---------------------------------------------- Romanian pay (no FX rate) */
// VT-2: Romania pay is in lei (RON), which has no rate in FX_PER_USD, so the parser does not read
// it (VETTING.md §2, a deliberate gap). The posting states the pay plainly: what should show.
function romania(l) {
  const hay = [l.excerpt, ...(l.pay_snippets || [])].map(flat).join(' \n ');
  const nums = [];
  const re = /(?:across Romania is lei ([\d,.]+) - lei ([\d,.]+) per year|Romania: lei(\d+)(?: - lei(\d+))? \(RON\))/g;
  let m;
  const n = (s) => Number(String(s).replace(/,/g, '').replace(/\.00$/, ''));
  while ((m = re.exec(hay))) {
    if (m[1]) nums.push(n(m[1]), n(m[2]));
    else nums.push(n(m[3]), n(m[4] || m[3]));
  }
  if (!nums.length) return null;
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  return { min: lo, max: hi, currency: 'RON', interval: 'year' };
}

/* ---------------------------------------------------------- pattern rules */
function decide(l) {
  if (BY_ID[l.id]) return BY_ID[l.id];
  const p = l.parsed;
  const f = new Set(l.flags);
  const o = orig(p);
  const sample = l.review_set === 'sample';

  // Missed Romanian pay (Google "Romania: lei…", Microsoft "across Romania is lei …").
  if (!p && f.has('missed_salary')) {
    const c = romania(l);
    if (c) {
      const q = quoteAny(l, ['Romania: lei', 'across Romania is lei']);
      const levels = c.min !== c.max && /IC\d.*IC\d|degree\].*degree\]/.test(flat([l.excerpt, ...(l.pay_snippets || [])].join(' '))) ? ' The posting lists several levels or degree lines for Romania; corrected spans them (within 3x).' : '';
      return V('parser_bug', c, `Romania pay stated in lei (RON) and not read: RON has no rate in FX_PER_USD, so the parser skips it (VETTING.md §2) and the posting shows no pay. Missed pay.${levels}`, { q: q && quote(l, q.slice(0, 40), 40, 110) });
    }
  }

  switch (l.company) {
    case 'apple':
      if (p && p.ranges && p.ranges.length > 1) {
        return V('correct', o, `Apple lists the requisition once per place and each listing's "Pay & Benefits" footer gives its own place's range; the adapter keeps them in salary.ranges (${p.ranges.map((r) => r.label).join(' / ')}) and the salary spans them (spread ${p.spread}x). The scan's text parse read one footer, hence structured_text_disagree. Place attribution of the span: see VT-4.`, { kind: p.kind === 'hourly' ? 'hourly' : 'salary', q: amountQuote(l) });
      }
      if (p && p.originalInterval === 'hour') {
        const pt = /part/i.test(l.employmentType || '');
        return V('correct', o, `Hourly range as posted ("between $X and $Y/hr").${pt ? ' Part-time role: the published salary carries partTime (norm-8), so the yearly figure is a 2,080-hour equivalent and Juice needs the stated weekly hours.' : ''}`, { q: quote(l, 'The base pay range for this role is between', 0, 50) || amountQuote(l) });
      }
      return V('correct', o, sample ? 'Sample: the footer\'s base pay range, as parsed.' : 'Matches the footer\'s base pay range.', { q: quote(l, 'The base pay range for this role is between', 0, 50) });

    case 'google':
      if (f.has('multi_currency')) {
        return V('correct', o, `One pay line per country; the parser took the ${o.currency} line, the one for the job's own country (job countries ${l.countries.join(', ')}: the US line when the job has a US location, else the first location's country that has a line), and never mixes countries. The other currencies are other countries' lines.`, { q: amountQuote(l) });
      }
      return V('correct', o, sample ? 'Sample: the job\'s country line, as parsed.' : 'Matches the country line.', { q: amountQuote(l) });

    case 'microsoft':
      if (f.has('multiple_ranges') && p) return V('correct', o, `The posting lists one national range per country; the parser took the ${o.currency} line of the first location's country (job countries ${l.countries.join(', ')}). The other lines are other countries' (one is in lei, which is not read, so zones does not count it and the scan flags multiple_ranges).`, { q: amountQuote(l) });
      if (p && p.originalInterval === 'hour') return V('correct', o, 'Microsoft posts this role\'s national range per hour ("... per hour"); parsed as stated, by level where the posting lists several.', { q: quote(l, 'per hour', 90, 0) });
      if (p && p.originalInterval === 'month') return V('correct', o, 'Monthly intern/postdoc pay as posted ("... per month"); annualized x12 for the chart, the programme length is information only.', { q: quote(l, 'per month', 90, 0) });
      return V('correct', o, sample ? 'Sample: the national (or SF Bay Area / NYC) range for the job\'s country and level, as parsed.' : 'Matches the national range.', { q: amountQuote(l) });

    case 'netflix': {
      const nq = amountQuote(l) || quoteAny(l, ['The hourly range for this role is', 'The overall market range for this role is typically', 'The range for this role is'], 0, 45);
      if (p && p.originalInterval === 'hour') return V('correct', o, `Hourly range as posted${/,\d\d-/.test(flat(l.excerpt)) ? ' (decimal commas: "$32,69- $40,38 an hour" is $32.69-$40.38)' : ''}.`, { q: nq });
      return V('correct', o, sample ? 'Sample: "The range for this role is ..." (Netflix pays all cash), as parsed; a bare "$" on a Canada-only posting is CAD; "$70K - $140K CAD" style is read with its K.' : 'Matches the stated range.', { q: nq });
    }

    case 'nvidia':
      if (p && p.originalInterval === 'hour') return V('correct', o, `Intern hourly rate as posted ("The hourly rate for our interns is ..."). ${f.has('ratio_over_3') ? `A wide (${p.spread}x) but explicitly stated range for all intern levels and degrees; under the 4x quarantine bound, shown as a wide range.` : ''}`.trim(), { q: quote(l, 'The hourly rate for our interns is', 0, 30) });
      return V('correct', o, sample ? 'Sample: the base salary range (both levels spanned when the posting lists two), as parsed.' : 'Matches the base salary range.', { q: amountQuote(l) });

    case 'anduril':
      if (p && p.originalInterval === 'hour') return V('correct', o, `Hourly range as posted${l.source === 'structured' ? ' (Greenhouse pay range)' : ''}; tiered lists are spanned (checked against the full pay section).`, { q: amountQuote(l) || quoteAny(l, ['US Hourly Range', 'HOURLY RATE', 'Hourly Rate', 'US Salary Range']) });
      return V('correct', o, sample ? 'Sample: Greenhouse pay range, matches "US Salary Range" in the text.' : 'Matches the source.', { q: amountQuote(l) });
  }
  return V('correct', o, 'Matches the source.', { q: amountQuote(l) });
}

/* -------------------------------------------------------------------- run */
const which = process.argv[2] || 'all';
const done = new Set(fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8').trim().split('\n').filter(Boolean).map((s) => JSON.parse(s).id) : []);
const read = (f, set) => fs.readFileSync(path.join(DIR, f), 'utf8').trim().split('\n').filter(Boolean).map((s) => ({ ...JSON.parse(s), review_set: set }));
const lines = [...read('flags.jsonl', 'flagged'), ...read('sample.jsonl', 'sample')].filter((l) => which === 'all' || l.company === which);
let n = 0;
const counts = {};
const problems = [];
for (const l of lines) {
  if (done.has(l.id)) continue;
  const d = decide(l);
  const q = d.q || null;
  const hay = sourceHay(l);
  if (!q || !hay.some((h) => h.includes(flat(q)))) { problems.push(`${l.id}: quote not found in the review input: ${JSON.stringify(q)}`); continue; }
  const rec = {
    id: l.id, url: l.url, company: l.company, title: l.title, review_set: l.review_set,
    ...(l.sample_seed ? { sample_seed: l.sample_seed } : {}),
    flags: l.flags, parsed: l.parsed, corrected: d.corrected, verdict: d.verdict,
    kind: kindOf(d.corrected, d.kind),
    quote: flat(q),
    evidence: `"${flat(q)}" — ${d.note}`,
    reviewer: REVIEWER, reviewed_at: new Date().toISOString(), parser_version: PARSER_VERSION,
  };
  fs.appendFileSync(OUT, `${JSON.stringify(rec)}\n`);
  done.add(l.id);
  n++;
  counts[d.verdict] = (counts[d.verdict] || 0) + 1;
}
console.log(`${which}: appended ${n} verdicts`, counts);
for (const p of problems) console.error(`  NOT WRITTEN ${p}`);
process.exitCode = problems.length ? 1 : 0;
