// Fix wave 3, app lane (docs/process/fix3-app.md): unit tests for the pure search helpers in public/app.js
// (BP-12 British and American spellings, BP-6 place names in the Location search) and source checks for the
// app-side rules of the shared decisions. public/app.js is a browser module (DOM, top-level await), so the
// self-contained block between its "pure: search words" markers is run here on its own; the browser-side
// behaviour is covered by test/e2e/fix3-app.e2e.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const start = src.indexOf('/* ---- pure: search words and place names');
const end = src.indexOf('/* ---- end pure ---- */');
assert.ok(start > 0 && end > start, 'the pure block is marked in public/app.js');
// eslint-disable-next-line no-new-func
const { foldText, spellingVariants, placeMatcher } = new Function(`${src.slice(start, end)}\nreturn { foldText, spellingVariants, placeMatcher };`)();

const has = (w, v) => spellingVariants(w).includes(v);

test('BP-12: a word finds its British or American spelling, both ways (shared decision 5)', () => {
  for (const [uk, us] of [['centre', 'center'], ['centres', 'centers'], ['defence', 'defense'], ['programme', 'program'], ['programmes', 'programs'],
    ['organisation', 'organization'], ['organisational', 'organizational'], ['optimise', 'optimize'], ['prioritising', 'prioritizing'],
    ['analyse', 'analyze'], ['labour', 'labor'], ['colour', 'color'], ['behavioural', 'behavioral'], ['favourite', 'favorite'],
    ['neighbourhood', 'neighborhood'], ['modelling', 'modeling'], ['travellers', 'travelers'], ['counsellor', 'counselor'], ['catalogue', 'catalog'],
    ['licence', 'license'], ['metre', 'meter'], ['theatre', 'theater'], ['fulfilment', 'fulfillment'], ['paediatric', 'pediatric'], ['ageing', 'aging']]) {
    assert.ok(has(uk, us), `${uk} -> ${us}: ${spellingVariants(uk)}`);
    assert.ok(has(us, uk), `${us} -> ${uk}: ${spellingVariants(us)}`);
  }
});

test('BP-12: no variant turns one real word into another', () => {
  for (const [w, not] of [['laboratory', 'labouratory'], ['colorado', 'colourado'], ['honorary', 'honourary'], ['rigorous', 'rigourous'],
    ['filing', 'filling'], ['order', 'ourder'], ['analysis', 'analyzis'], ['center', 'centr']]) {
    assert.ok(!has(w, not), `${w} must not become ${not}`);
  }
  for (const w of ['engineer', 'manager', 'senior', 'data', 'intern', 'size', 'c++', 'co-op', 'ml']) {
    assert.deepEqual(spellingVariants(w).filter((v) => v !== w).filter((v) => /^(engineer|manager|senior|data|intern|size|c\+\+|co-op|ml)$/.test(v)), [], w);
  }
  assert.deepEqual(spellingVariants('engineer'), ['engineer'], 'an ordinary word is only itself');
  assert.deepEqual(spellingVariants('manager'), ['manager']);
});

test('BP-6: foldText drops accents and folds the letters Unicode does not decompose', () => {
  assert.equal(foldText('Zürich'), 'zurich');
  assert.equal(foldText('München'), 'munchen');
  assert.equal(foldText('Łódź'), 'lodz');
  assert.equal(foldText('København'), 'kobenhavn');
  assert.equal(foldText('Straße'), 'strasse');
  assert.equal(foldText('Málaga'), 'malaga');
});

test('BP-6: a Location search matches a country\'s places and a city\'s local name', () => {
  const name = (c) => ({ IE: 'Ireland', DE: 'Germany', IL: 'Israel', CA: 'Canada', GB: 'United Kingdom', US: 'United States', AT: 'Austria', CH: 'Switzerland', KR: 'South Korea' }[c] || c);
  const m = (q, label, country) => placeMatcher(q, name)(label, country);
  assert.ok(m('Ireland', 'Dublin', 'IE'), '"Ireland" lists Dublin');
  assert.ok(m('ire', 'Dublin', 'IE'), 'as it is typed');
  assert.ok(!m('land', 'Dublin', 'IE'), 'a country matches from a word start, not inside a word');
  assert.ok(m('Israel', 'Tel Aviv', 'IL') && m('Israel', 'Haifa District', 'IL'));
  assert.ok(m('Germany', 'Munich', 'DE') && m('Deutschland', 'Berlin', 'DE'), 'English and local country names');
  assert.ok(m('München', 'Munich', 'DE') && m('Munchen', 'Munich', 'DE') && m('muench', 'Munich', 'DE'), 'München is Munich');
  assert.ok(m('Köln', 'Cologne', 'DE') && m('Wien', 'Vienna', 'AT') && m('Zürich', 'Zurich', 'CH'), 'local names');
  assert.ok(m('Munich', 'München', 'DE'), 'and the other way, when a board uses the local name');
  assert.ok(m('UK', 'London', 'GB') && m('England', 'Manchester', 'GB') && m('USA', 'Austin', 'US'), 'everyday country names');
  assert.ok(m('korea', 'Seoul', 'KR'), 'a word of the country name');
  assert.ok(m('Dub', 'Dublin', 'IE'), 'a place name still matches as before');
  assert.ok(!m('Ireland', 'London', 'GB') && !m('Germany', 'Zurich', 'CH') && !m('Atlantis', 'Dublin', 'IE'), 'no stray matches');
  assert.ok(!m('Ireland', 'Remote (US)', null), 'no country, no country match');
});

test('shared decisions in the app: the pay rule, how pay was stated, part-time pay and Juice', () => {
  // Decision 1: one rule for "pay applies here", used by the pay filter, sort, stats, Juice and the card.
  assert.match(src, /const payHere = \(j, F = viewSpec\) =>/);
  // fix-app-6 (BN-6): the pay filter's test is salWhy(), which says why it hides a posting.
  assert.match(src, /salActive && \(!payHere\(j, F\)|if \(!payHere\(j, F\)\) return 'elsewhere';/, 'the pay filter');
  assert.match(src, /if \(!payHere\(j, F\)\) continue;/, 'the stats line');
  assert.match(src, /Pay posted for \$\{where\} only/, 'the card');
  assert.doesNotMatch(src, /applied as posted/, 'the currencyMismatch fallback is retired');
  // Decision 3: only week, month, term or a stipend is fixed-term pay.
  assert.match(src, /const isFixedPay = \(s\) => !!s && \(s\.originalInterval === 'week' \|\| s\.originalInterval === 'month' \|\| s\.originalInterval === 'term' \|\| s\.kind === 'stipend'\);/);
  // Decision 4: part-time hourly pay is shown hourly; a yearly figure says it is full time.
  assert.match(src, /If full-time \(2,080 hours\)/);
  // BP-17: On-site is not remote.
  assert.match(src, /if \(F\.r === 'onsite' && j\.remote\) out\.push\('r'\);/);
});
