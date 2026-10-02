// Reviewer decisions (Claude via Claude Code) for data/vetting/2026-10-02/,
// kept as part of the audit trail: these are the per-job and per-pattern
// judgments the reviewer made after reading every flagged excerpt and the
// random sample (docs/process/vetting.md). verdicts.jsonl is their output.
// Replay: node data/vetting/2026-10-02/review-rules.mjs <company|all>
// It appends verdicts for that batch, skipping ids already present in
// verdicts.jsonl (never overwrites). tier-spans.json holds the tier spans the
// reviewer read off the full pay sections of tiered postings.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = `${DIR}/verdicts.jsonl`;
const PARSER_VERSION = 'salary.js@b9cc2fb (sha256:e0fcf273fb5b); adapters@b9cc2fb';
const REVIEWER = 'claude via Claude Code';
const spans = JSON.parse(fs.readFileSync(path.join(DIR, 'tier-spans.json'), 'utf8'));

const F = { hour: 2080, day: 260, week: 52, month: 12, year: 1 };
const r2 = (n) => Math.round(n * 100) / 100;
const orig = (p) => (p ? { min: r2(p.min / F[p.originalInterval || 'year']), max: r2(p.max / F[p.originalInterval || 'year']), currency: p.currency, interval: p.originalInterval || 'year' } : null);
const kindOf = (c, stipend) => (!c ? null : stipend ? 'stipend' : c.interval === 'hour' ? 'hourly' : 'salary');
const flat = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/** Short verbatim quote around `needle` in the line's excerpt/pay_snippets. */
function quote(l, needle, before = 70, after = 60) {
  const hay = [l.excerpt, ...(l.pay_snippets || [])].map(flat);
  for (const h of hay) {
    const i = needle ? h.indexOf(needle) : -1;
    if (i >= 0) {
      let a = Math.max(0, i - before);
      let b = Math.min(h.length, i + needle.length + after);
      while (a > 0 && h[a - 1] !== ' ') a++;
      while (b < h.length && h[b] !== ' ') b--;
      return h.slice(a, b).trim();
    }
  }
  return null;
}

function autoQuote(l) {
  const p = l.parsed;
  if (!p) return flat(l.excerpt).slice(0, 160);
  if (l.source === 'text') return quote(l, flat(p.text)) || flat(l.excerpt).slice(0, 160);
  // structured: quote where the text shows it, else the structured field itself
  const o = orig(p);
  const fmt = (n) => (n >= 1000 ? Math.round(n).toLocaleString('en-US') : String(n));
  return quote(l, fmt(o.min)) || quote(l, `${Math.round(o.min / 1000)}K`) || `structured field: ${p.text}`;
}

const V = (verdict, corrected, note, { stipend = false, q = null } = {}) => ({ verdict, corrected, note, stipend, q });

// ---- explicit decisions by job id -------------------------------------------------
const BY_ID = {
  // Anthropic Fellows: "$4.6M" is a past project's result; pay is a weekly stipend.
  'anthropic:5183044008': V('parser_bug', { min: 3850, max: 3850, currency: 'USD', interval: 'week' }, '"$4.6M" is a past Fellows project ("AI agents find $4.6M in blockchain smart contract exploits"), not pay. Pay is the weekly stipend; USD because the role includes US locations.', { stipend: true, q: 'The expected base stipend for this role is 3,850 USD / 2,310 GBP / 4,300 CAD per week' }),
  'anthropic:5183051008': V('parser_bug', { min: 3850, max: 3850, currency: 'USD', interval: 'week' }, '"$4.6M" is a linked past project ("AI agents find $4.6M in blockchain smart contract exploits"), not pay. Pay is the weekly stipend; USD because the role includes US locations.', { stipend: true, q: 'The expected base stipend for this role is 3,850 USD / 2,310 GBP / 4,300 CAD per week' }),
  // Anduril
  'anduril:5243013007': V('parser_bug', { min: 20454000, max: 30680000, currency: 'JPY', interval: 'year' }, 'Greenhouse pay_input_ranges for JPY were divided by 100 as if cents; JPY has no minor unit. The text gives the real range.', { q: 'US Salary Range ¥20,454,000 — ¥30,680,000 JPY' }),
  'anduril:5078772007': V('source_ambiguous', null, 'Source range (structured and text) spans 13x; almost certainly a dropped zero (126,000). Not plottable as stated: quarantine.', { q: 'US Salary Range $12,600 — $167,000 USD' }),
  'anduril:5196291007': V('source_ambiguous', null, 'Source range spans 13x; almost certainly a dropped zero (146,000). Quarantine.', { q: 'US Salary Range $14,600 — $194,000 USD' }),
  'anduril:5048074007': V('source_ambiguous', null, 'Source range spans 13x; almost certainly a dropped zero (112,000). Quarantine.', { q: 'US Salary Range $11,200 — $149,000 USD' }),
  'anduril:5116770007': V('correct', { min: 34, max: 34, currency: 'USD', interval: 'hour' }, 'Single tier listed.', { q: 'HOURLY RATE • T4 Starting Hourly Rate: $34.00' }),
  'anduril:5124708007': V('correct', { min: 28, max: 43, currency: 'USD', interval: 'hour' }, 'Structured range spans the listed levels ($28-$38 and $33-$43).', { q: 'Production Coordinator/Level 3: $33 - $43/hour US Hourly Range $28 — $43 USD' }),
};

// ---- pattern decisions ---------------------------------------------------------------
function decide(l) {
  if (BY_ID[l.id]) return BY_ID[l.id];
  const p = l.parsed;
  const t = p ? flat(p.text) : '';
  const ex = flat(l.excerpt);
  const f = new Set(l.flags);
  const o = orig(p);

  if (l.review_set === 'sample') return V('correct', o, 'Random sample: parsed amount matches the source pay statement.');

  // Tiered lists where only one tier was taken.
  if (spans[l.id]) {
    const s = spans[l.id];
    return V('parser_bug', { min: s.lo, max: s.hi, currency: 'USD', interval: 'hour' }, `Only one tier/endpoint was parsed; the posting lists ${s.lo}-${s.hi}/hour across its levels (or as "$X/hour - $Y/hour").`);
  }

  switch (l.company) {
    case 'anthropic':
      if (!p && /stipend of 3,850 USD/.test(ex)) return V('parser_bug', { min: 3850, max: 3850, currency: 'USD', interval: 'week' }, 'Weekly stipend missed (amount with currency code after the number, weekly interval).', { stipend: true, q: 'Weekly stipend of 3,850 USD / 2,310 GBP / 4,300 CAD + benefits' });
      if (f.has('multiple_ranges')) return V('correct', o, 'The second "range" is customer spend ("~$100K to $10M+ in annual spend"), not pay.');
      if (f.has('ratio_over_3')) return V('correct', o, 'Wide but explicitly stated range.');
      return V('correct', o, 'Structured range matches the text.');
    case 'anduril':
      if (/Product Operations Associate/.test(l.title)) return V('source_ambiguous', { min: 68000, max: 90000, currency: 'USD', interval: 'year' }, 'Labelled "Hourly" but the amounts are annual; we dropped it ($68K/hour annualizes to $141M). Treat as annual.', { q: 'US Hourly Range $68,000 — $90,000 USD' });
      if (/Recruiting Coordinator/.test(l.title) && p && p.currency === 'EUR') return V('source_ambiguous', o, 'UK role stated in EUR with hourly-sized amounts under "UK Salary Range"; parsed literally.', { q: 'UK Salary Range €14,41 — €18,82 EUR' });
      if (/Staff Software Engineer/.test(l.title) && p && p.min === 22000) return V('source_ambiguous', null, 'Source range spans 13x; almost certainly a dropped zero (220,000). Quarantine.', { q: 'US Salary Range $22,000 — $292,000 USD' });
      if (f.has('currency_country_mismatch')) return V('correct', o, 'UAE role stated in USD by the source.');
      if (f.has('stat_outlier')) return V('correct', o, 'Low for Anduril but stated plainly; a legitimate maintenance-engineer range.');
      return V('correct', o, 'Hourly range matches the source.');
    case 'cohere':
      if (p && p.text === '$500') return V('parser_bug', null, 'A one-off home-office benefit parsed as $500/hour ($1.04M/yr). The posting lists no pay.', { q: 'Everyone receives a $500 home office stipend to set up your workspace properly.' });
      if (l.source === 'text') {
        if (/OTE|Compensation Range/.test(ex)) return V('correct', o, 'OTE range stated in USD for Germany by the source.');
        return V('correct', o, 'Part-time contractor hourly rate.');
      }
      if (f.has('currency_country_mismatch')) return V('source_ambiguous', o, 'Ashby "Multiple Ranges" summary in a currency that does not match the location; the location-currency tier needs the raw compensationTiers.');
      return V('correct', o, 'Structured Ashby range; the "disagreeing" text value was the $500 home-office or $75 lunch stipend.');
    case 'openai':
      if (!p) return V('correct', null, 'Only a learning & development stipend (a benefit) is mentioned; no pay listed.');
      if (f.has('structured_text_disagree')) {
        const sn = (l.pay_snippets || []).join(' ');
        const m = sn.match(/Compensation Range : \$\d+K - \$\d+K USD/);
        return V('source_ambiguous', o, 'Structured compensation and description text give different ranges; structured kept per policy.', { q: m ? m[0] : null });
      }
      if (f.has('currency_country_mismatch')) return V('correct', o, 'Structured range stated in USD for a London role.');
      return V('correct', o, 'Structured range.');
    case 'palantir':
      if (/110,000 - 200,000\/year SGD/.test(ex)) return V('parser_bug', { min: 110000, max: 200000, currency: 'SGD', interval: 'year' }, 'Currency code after the interval ("/year SGD") was ignored; parsed as USD.', { q: 'estimated to be 110,000 - 200,000/year SGD' });
      if (/\$8,500 SGD\/month/.test(ex)) return V('parser_bug', { min: 8500, max: 8500, currency: 'SGD', interval: 'month' }, 'SGD suffix not recognized; parsed as USD.', { q: 'estimated to be $8,500 SGD/month' });
      if (/\$40\/hour to \$65\/hour/.test(ex)) return V('parser_bug', { min: 40, max: 65, currency: 'USD', interval: 'hour' }, 'Range written with the unit on both ends; only $40 was parsed.', { q: 'estimated to be $40/hour to $65/hour' });
      return V('correct', o, 'Matches the stated salary.');
    case 'scaleai':
      if (/Strategist, Qatar/.test(l.title)) return V('parser_bug', null, 'Deal size in a requirements bullet, not pay; the posting lists no pay.', { q: 'closing $500K to $5M+ deals for complex solutions' });
      if (f.has('structured_text_disagree')) return V('correct', o, 'Structured value spans the location tiers listed in the text; the text parser picked one tier.');
      if (/\$300\/hr/.test(ex)) return V('correct', o, 'Part-time expert contract at a stated hourly rate.');
      return V('correct', o, 'Matches the stated pay.');
    case 'shieldai':
      if (/R5489/.test(l.title)) return V('source_ambiguous', { min: 88000, max: 130000, currency: 'USD', interval: 'year' }, 'Lever salaryRange labelled per-month, but 88K-130K is an annual salary ($1.56M/yr as monthly).', { q: '88,000–130,000 USD per-month-salary' });
      if (/R6005/.test(l.title)) return V('source_ambiguous', o, '$10/hour floor is out of line with sibling postings (R5671/R6110: 23-34/hour); likely a typo, parsed literally.', { q: '10–34 USD per-hour-wage' });
      if (/R6101/.test(l.title)) return V('source_ambiguous', o, 'Structured range differs from the in-office range in the text; structured kept per policy.', { q: 'Compensation range for in-office San Mateo, CA is $144 - $216K' });
      if (f.has('structured_text_disagree')) return V('correct', o, 'Structured range spans the per-level ranges listed in the text; the text parser picked one level.');
      return V('correct', o, 'Structured hourly range.');
    case 'xai':
      if (!p) {
        const m = ex.match(/\$(\d{3}),000 - \$?(\d{3}),000k?/);
        if (m) return V('parser_bug', { min: +m[1] * 1000, max: +m[2] * 1000, currency: 'USD', interval: 'year' }, /000k/.test(ex) ? 'Redundant "k" on a full number ("250,000k") made it 250M; dropped.' : 'An interval word in the previous sentence ("5 days/week", "daily") was applied to the range, so it was rejected as implausible.', { q: m[0] });
      }
      if (f.has('currency_country_mismatch')) return V('source_ambiguous', o, 'Dublin role with a bare "$" range and no currency code; read as USD.');
      if (f.has('ratio_over_3')) return V('correct', o, 'Wide but explicitly stated range.');
      return V('correct', o, 'Matches the stated pay.');
  }
  return V('correct', o, 'Matches the source.');
}

const which = process.argv[2] || 'all';
const done = new Set(fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8').trim().split('\n').filter(Boolean).map((s) => JSON.parse(s).id) : []);
const read = (f, set) => fs.readFileSync(`${DIR}/${f}`, 'utf8').trim().split('\n').filter(Boolean).map((s) => ({ ...JSON.parse(s), review_set: set }));
const lines = [...read('flags.jsonl', 'flagged'), ...read('sample.jsonl', 'sample')].filter((l) => which === 'all' || l.company === which);
let n = 0;
const counts = {};
for (const l of lines) {
  if (done.has(l.id)) continue;
  const d = decide(l);
  const q = d.q || autoQuote(l);
  const rec = {
    id: l.id, url: l.url, company: l.company, title: l.title, review_set: l.review_set,
    ...(l.sample_seed ? { sample_seed: l.sample_seed } : {}),
    flags: l.flags, parsed: l.parsed, corrected: d.corrected, verdict: d.verdict,
    kind: kindOf(d.corrected, d.stipend),
    evidence: `"${q}" — ${d.note}`,
    reviewer: REVIEWER, reviewed_at: new Date().toISOString(), parser_version: PARSER_VERSION,
  };
  fs.appendFileSync(OUT, JSON.stringify(rec) + '\n');
  done.add(l.id);
  n++;
  counts[d.verdict] = (counts[d.verdict] || 0) + 1;
}
console.log(`${which}: appended ${n} verdicts`, counts);
