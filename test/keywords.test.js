import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractSections, extractKeywords, inferSeniority, classifyHeading,
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

test('entity decoding and lexicon sizes', () => {
  assert.equal(decodeEntities('A &amp; B &#8212; C&rsquo;s &#x2014;'), 'A & B — C’s —');
  assert.ok(SKILL_LEXICON.length >= 140, `skills ${SKILL_LEXICON.length}`);
  assert.ok(RESPONSIBILITY_LEXICON.length >= 40);
  assert.ok(FIT_LEXICON.length >= 25);
});
