import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  extractSections, extractKeywords, inferSeniority, classifyHeading,
  extractCompExtras, compExtrasEvidence,
  yearsOfExperience, yearsBucket, htmlToText, decodeEntities,
  SKILL_LEXICON, RESPONSIBILITY_LEXICON, FIT_LEXICON,
} from '../server/keywords.js';

const ANTHROPIC_HTML = `
<h2>About Anthropic</h2><p>Anthropic's mission is to create reliable, interpretable, and steerable AI systems.</p>
<ul><li>Benefit that should be ignored</li></ul>
<h2>About the role</h2><p>You will work on large-scale training.</p>
<h2>Responsibilities:</h2>
<ul>
  <li>Design and run experiments on <strong>large language models</strong></li>
  <li><p>Build distributed training infrastructure in PyTorch &amp; JAX</p></li>
  <li>Partner closely with researchers across teams</li>
</ul>
<h2>You may be a good fit if you:</h2>
<ul>
  <li>Have 5+ years of software engineering experience</li>
  <li>Are proficient in Python and Rust</li>
  <li>Thrive in fast-paced, ambiguous environments</li>
</ul>
<h2>Strong candidates may also:</h2>
<ul><li>Have a PhD in machine learning</li><li>Have published at NeurIPS</li></ul>
<h2>Deadline to apply:</h2><p>None.</p>
<h2>Logistics</h2><ul><li>We do sponsor visas!</li></ul>`;

test('extractSections: Anthropic h2 format', () => {
  const s = extractSections(ANTHROPIC_HTML);
  assert.deepEqual(s.responsibilities, [
    'Design and run experiments on large language models',
    'Build distributed training infrastructure in PyTorch & JAX',
    'Partner closely with researchers across teams',
  ]);
  assert.deepEqual(s.fit, [
    'Have 5+ years of software engineering experience',
    'Are proficient in Python and Rust',
    'Thrive in fast-paced, ambiguous environments',
    'Have a PhD in machine learning',
    'Have published at NeurIPS',
  ]);
});

test('extractSections: <p><strong>, <b>, plain "Heading:" and ALL CAPS headings', () => {
  const html = `
    <p><strong>WHAT YOU'LL DO</strong></p><ul><li>Design GNC algorithms</li><li>Support flight tests</li></ul>
    <p>REQUIRED QUALIFICATIONS</p><ul><li>BS in Aerospace Engineering</li></ul>
    <b>Preferred Qualifications</b><ul><li>Active Secret clearance</li></ul>
    <p>In this role, you will:</p><ul><li>Ship features</li></ul>
    <p><b>You might thrive in this role if you:</b></p><ul><li>Love debugging</li></ul>
    <p><strong>Benefits</strong></p><ul><li>Free lunch</li></ul>`;
  const s = extractSections(html);
  assert.deepEqual(s.responsibilities, ['Design GNC algorithms', 'Support flight tests', 'Ship features']);
  assert.deepEqual(s.fit, ['BS in Aerospace Engineering', 'Active Secret clearance', 'Love debugging']);
});

test('extractSections: <br>-separated bullet paragraphs', () => {
  const html = '<p><strong>Requirements</strong><br>• 3+ years of Go<br>• Kubernetes experience</p>';
  assert.deepEqual(extractSections(html).fit, ['3+ years of Go', 'Kubernetes experience']);
});

test('extractSections: falls back to "You will"/"You\'ll" sentences', () => {
  const s = extractSections("<p>We are a startup. You will build our API. You'll own on-call. You have 3 years of C++.</p>");
  assert.deepEqual(s.responsibilities, ['You will build our API.', "You'll own on-call."]);
  assert.deepEqual(s.fit, ['You have 3 years of C++.']);
});

test('extractSections: empty / garbage input', () => {
  assert.deepEqual(extractSections(''), { responsibilities: [], fit: [] });
  assert.deepEqual(extractSections(null), { responsibilities: [], fit: [] });
  assert.deepEqual(extractSections('<ul><li>orphan bullet</li></ul>'), { responsibilities: [], fit: [] });
  assert.doesNotThrow(() => extractSections('<p>unterminated <b>bold <li>x'));
});

test('classifyHeading', () => {
  assert.equal(classifyHeading('Responsibilities:'), 'responsibilities');
  assert.equal(classifyHeading('What you’ll do'), 'responsibilities');
  assert.equal(classifyHeading('Day-to-day'), 'responsibilities');
  assert.equal(classifyHeading('You may be a good fit if you:'), 'fit');
  assert.equal(classifyHeading('Strong candidates may also:'), 'fit');
  assert.equal(classifyHeading("What we're looking for"), 'fit');
  assert.equal(classifyHeading('In this role, you will need'), 'fit');
  assert.equal(classifyHeading('Nice to have'), 'fit');
  assert.equal(classifyHeading('Benefits'), null);
  assert.equal(classifyHeading('About Anthropic'), null);
});

test('extractKeywords: facets from sections', () => {
  const sections = extractSections(ANTHROPIC_HTML);
  const kw = extractKeywords({ title: 'Research Engineer, Pretraining', department: 'AI Research', sections, text: htmlToText(ANTHROPIC_HTML) });
  for (const s of ['Python', 'Rust', 'PyTorch', 'JAX', 'LLMs', 'Distributed training']) assert.ok(kw.skills.includes(s), `skill ${s}`);
  for (const r of ['Research', 'Infrastructure', 'Cross-functional']) assert.ok(kw.responsibilities.includes(r), `resp ${r}`);
  for (const f of ['5+ yrs', 'PhD', 'Publications', 'Fast-paced', 'Ambiguity', 'Visa sponsorship']) assert.ok(kw.fit.includes(f), `fit ${f}`);
  assert.equal(kw.fit[0], '5+ yrs');
  // Stable lexicon order + no dupes
  assert.equal(new Set(kw.skills).size, kw.skills.length);
  assert.ok(kw.skills.indexOf('Python') < kw.skills.indexOf('PyTorch'));
});

test('extractKeywords: Go / C++ / C# / R handling', () => {
  const sk = (text) => extractKeywords({ text }).skills;
  assert.ok(sk('Experience with Python, Go, or Rust').includes('Go'));
  assert.ok(sk('Services written in Go').includes('Go'));
  assert.ok(sk('Golang microservices').includes('Go'));
  assert.ok(!sk('Go above and beyond. Ready to go?').includes('Go'));
  assert.ok(!sk('Own our go-to-market motion').includes('Go'));
  assert.ok(sk('Own our go-to-market motion').includes('GTM'));
  assert.ok(sk('Strong C++ skills').includes('C++'));
  assert.ok(sk('Unity and C# experience').includes('C#'));
  assert.ok(!sk('Experience with R and SAS').some((x) => x === 'R'));
  assert.ok(!sk('JavaScript only').includes('Java'));
  assert.ok(!sk('PostgreSQL').includes('SQL'));
  assert.ok(sk('PostgreSQL').includes('Postgres'));
  assert.ok(!sk('We need an active security clearance').includes('Security'));
});

test('extractKeywords: fit falls back to text, global facets scan whole text', () => {
  const kw = extractKeywords({
    title: 'Embedded Software Engineer',
    sections: { responsibilities: ['Write firmware for drones'], fit: ['BS in Computer Engineering'] },
    text: 'Must be a U.S. Person due to ITAR. Requires an active Secret security clearance. Travel up to 20%.',
  });
  assert.ok(kw.fit.includes("Bachelor's"));
  assert.ok(kw.fit.includes('Security clearance'));
  assert.ok(kw.fit.includes('US citizenship'));
  assert.ok(kw.fit.includes('Travel'));
  assert.ok(kw.skills.includes('Firmware'));
  const fb = extractKeywords({ text: 'At least five years of experience. PhD preferred.' });
  assert.ok(fb.fit.includes('5+ yrs') && fb.fit.includes('PhD'));
});

test('extractKeywords: tolerates missing input', () => {
  assert.deepEqual(extractKeywords(), { responsibilities: [], fit: [], skills: [] });
  assert.deepEqual(extractKeywords({ title: '', sections: null, text: null }), { responsibilities: [], fit: [], skills: [] });
});

test('years of experience', () => {
  assert.equal(yearsOfExperience('5+ years of experience'), 5);
  assert.equal(yearsOfExperience('at least 3 years'), 3);
  assert.equal(yearsOfExperience('five years of industry experience'), 5);
  assert.equal(yearsOfExperience('3-5 years in a related role; 8+ years preferred'), 8);
  assert.equal(yearsOfExperience('a decade of experience'), 10);
  assert.equal(yearsOfExperience('founded 50 years ago'), null);
  assert.equal(yearsOfExperience('nothing here'), null);
  assert.equal(yearsBucket(1), '1+ yrs');
  assert.equal(yearsBucket(4), '3+ yrs');
  assert.equal(yearsBucket(7), '5+ yrs');
  assert.equal(yearsBucket(9), '8+ yrs');
  assert.equal(yearsBucket(12), '10+ yrs');
});

test('inferSeniority', () => {
  const cases = {
    'Research Intern': 'Intern',
    'Anthropic Fellows Program, AI Safety': 'Intern',
    'AI Safety Fellowship': 'Intern',
    'Software Engineer I': 'Entry',
    'Junior Data Analyst': 'Entry',
    'Software Engineer (New Grad)': 'Entry',
    'Research Engineer': 'Mid',
    'Product Manager': 'Mid',
    'Technical Program Manager': 'Mid',
    'Senior Software Engineer': 'Senior',
    'Sr. Mechanical Engineer': 'Senior',
    'Staff Research Engineer': 'Staff+',
    'Principal Engineer': 'Staff+',
    'Distinguished Engineer': 'Staff+',
    'Engineering Manager, Inference': 'Manager',
    'Senior Engineering Manager': 'Manager',
    'Research Manager, Interpretability': 'Manager',
    'Director of Engineering': 'Director+',
    'VP, Sales': 'Director+',
    'Head of Policy': 'Director+',
    'Chief Security Officer': 'Director+',
    '': 'Mid',
  };
  for (const [t, want] of Object.entries(cases)) assert.equal(inferSeniority(t), want, t);
});

test('inferSeniority: "Member of Technical Staff" / MTS is a generic IC title', () => {
  const cases = {
    // Generic IC titles as posted by Cohere / xAI and other labs -> Mid
    'Member of Technical Staff': 'Mid',
    'Member of Technical Staff, Pretraining': 'Mid',
    'Member of Technical Staff - Inference': 'Mid',
    'Member of Technical Staff, Applied ML (Search)': 'Mid',
    'Member of the Technical Staff, Model Efficiency': 'Mid',
    'Member of Technical Staff (MTS), Infrastructure': 'Mid',
    'Founding Member of Technical Staff': 'Mid',
    'MTS, Post-Training': 'Mid',
    'MTS - Agents': 'Mid',
    'Technical Staff, Data': 'Mid',
    'Technical Staff Member, Security': 'Mid',
    'Members of Technical Staff - Grok': 'Mid',
    // A level word alongside still wins
    'Senior Member of Technical Staff': 'Senior',
    'Senior MTS, Distributed Systems': 'Senior',
    'SMTS, Platform': 'Senior',
    'Member of Technical Staff, Senior Software Engineer': 'Senior',
    'Principal Member of Technical Staff': 'Staff+',
    'Principal MTS': 'Staff+',
    'PMTS, Inference': 'Staff+',
    'LMTS, Data Platform': 'Staff+',
    'Staff Member of Technical Staff': 'Staff+',
    'Member of Technical Staff, Engineering Manager': 'Manager',
    'Member of Technical Staff Intern': 'Intern',
    // Real "Staff" level elsewhere is unchanged
    'Staff Software Engineer': 'Staff+',
    'Staff Research Scientist, Interpretability': 'Staff+',
  };
  for (const [t, want] of Object.entries(cases)) assert.equal(inferSeniority(t), want, t);
});

test('entity decoding and lexicon sizes', () => {
  assert.equal(decodeEntities('A &amp; B &#8212; C&rsquo;s &#x2014;'), 'A & B — C’s —');
  assert.ok(SKILL_LEXICON.length >= 140, `skills ${SKILL_LEXICON.length}`);
  assert.ok(RESPONSIBILITY_LEXICON.length >= 40);
  assert.ok(FIT_LEXICON.length >= 25);
});

// ---------------------------------------------------------------- F2 comp extras

test('extractCompExtras: equity senses', () => {
  const eq = (t, o) => extractCompExtras(t, o).equity;
  assert.equal(eq('$310K – $460K • Offers Equity'), true);
  assert.equal(eq('Total compensation may also include Restricted Stock units, sign-on bonus and other incentives.'), true);
  assert.equal(eq('Pay within range listed + Bonus + Benefits + Equity'), true);
  assert.equal(eq('Compensation packages for eligible roles include base salary, equity, and benefits.'), true);
  assert.equal(eq('Employees are also granted Stock Options upon board approval.'), true);
  assert.equal(eq('Growth: Competitive compensation, equity options, and opportunities for development.'), true);
  // DEI and other non-compensation senses
  assert.equal(eq('We are committed to pay equity and to diversity, equity and inclusion.'), false);
  assert.equal(eq('Advance health equity for underserved communities.'), false);
  assert.equal(eq('Palantir promotes a culture of diversity, equity, and inclusion.'), false);
  assert.equal(eq('Our benefits include optional equity donation matching.'), false);
  assert.equal(eq('7+ years in private equity, growth equity or investment banking.'), false);
  assert.equal(eq('Partner closely with the equity team to process stock options.'), false);
  assert.equal(eq('Are proficient in payroll processing for compensation types (regular, severance, and equity).'), false);
  assert.equal(eq('Interns/Part-time not eligible for bonus, benefits or equity.'), false);
  // full-time-scoped boilerplate does not apply to interns or contractors
  const ft = 'Highly competitive equity grants are included in the majority of full time offers.';
  assert.equal(eq(ft, { title: 'Software Engineer' }), true);
  assert.equal(eq(ft, { title: 'Software Engineering Intern' }), false);
  assert.equal(eq(ft, { title: 'Senior Technical Recruiter (Contract)' }), false);
});

test('extractCompExtras: bonus senses', () => {
  const bn = (t, o) => extractCompExtras(t, o).bonus;
  assert.equal(bn('This role is eligible for an annual performance bonus.'), true);
  assert.equal(bn('$189K – $290K • Offers Equity • Offers Commission'), true);
  assert.equal(bn('$189K – $290K • Offers Equity • $189K – $220.5K Commission • Multiple Ranges'), true);
  assert.equal(bn('$72,000 - $95,000 USD base salary + commission'), true);
  assert.equal(bn('Sales Commission: This role is eligible to earn commissions.'), true);
  assert.equal(bn('Competitive base salary and commission structure'), true);
  assert.equal(bn('The figure above represents On-Target Earnings (OTE).'), true);
  // nice-to-have, verb and hedge senses
  assert.equal(bn("It's a bonus if you have: experience with Kubernetes"), false);
  assert.equal(bn('Bonus: paper at top-tier venues.'), false);
  assert.equal(bn('Bonus points if you have shipped Rust.'), false);
  assert.equal(bn('Experience with collective communication is a bonus.'), false);
  assert.equal(bn('Design, build, and commission automated manufacturing systems.'), false);
  assert.equal(bn('Commission, operate and maintain facilities.'), false);
  assert.equal(bn('This estimate excludes the value of any potential sign-on bonus.'), false);
  assert.equal(bn('Own close for payroll, bonus, severance and commissions accruals.'), false);
  // "For sales roles ... OTE" counts only on a sales title
  const ote = 'For sales roles, the range provided is the role’s On Target Earnings ("OTE") range, including sales commissions.';
  assert.equal(bn(ote, { title: 'Enterprise Account Executive, Banking' }), true);
  assert.equal(bn(ote, { title: 'Research Engineer, Pretraining' }), false);
  assert.equal(bn(ote, { title: 'Sales Enablement Lead' }), false);
});

test('extractCompExtras: input handling', () => {
  assert.deepEqual(extractCompExtras(''), { equity: false, bonus: false });
  assert.deepEqual(extractCompExtras(null), { equity: false, bonus: false });
  assert.deepEqual(extractCompExtras(undefined, { title: 'x' }), { equity: false, bonus: false });
  assert.deepEqual(extractCompExtras('<ul><li>Salary + bonus + equity</li></ul>'), { equity: true, bonus: true });
  const ev = compExtrasEvidence('Base pay is one part. Offer package: Pay + Bonus + Benefits + Equity');
  assert.equal(ev.evidence.bonus.length, 1);
});

// Hand-labelled real postings (data/snapshots, 2026-10-02): excerpts + gold labels.
// Gate: precision >= 0.95 per facet (task requirement); recall tracked too.
test('extractCompExtras: precision/recall on hand-labelled postings (test/fixtures/extras-labels.json)', () => {
  const fx = JSON.parse(fs.readFileSync(new URL('./fixtures/extras-labels.json', import.meta.url), 'utf8'));
  assert.ok(fx.items.length >= 100, `labelled ${fx.items.length}`);
  const res = {};
  for (const split of ['dev', 'holdout', 'all']) {
    const items = fx.items.filter((x) => split === 'all' || x.split === split);
    for (const f of ['equity', 'bonus']) {
      const c = { tp: 0, fp: 0, fn: 0 };
      for (const x of items) {
        const p = extractCompExtras(x.excerpt, { title: x.title })[f];
        if (p && x[f]) c.tp++; else if (p) c.fp++; else if (x[f]) c.fn++;
      }
      res[`${split}.${f}`] = { precision: c.tp / Math.max(1, c.tp + c.fp), recall: c.tp / Math.max(1, c.tp + c.fn), ...c };
    }
  }
  for (const [k, r] of Object.entries(res)) {
    assert.ok(r.precision >= 0.95, `${k} precision ${r.precision.toFixed(3)} (${JSON.stringify(r)})`);
    assert.ok(r.recall >= 0.9, `${k} recall ${r.recall.toFixed(3)} (${JSON.stringify(r)})`);
  }
});
