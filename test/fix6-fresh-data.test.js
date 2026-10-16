// fix6-fresh-data (2026-10-16): unit regressions for the five e2e checks that went red on the
// 2026-10-16 crawl (docs/process/fix6-fresh-data.md). No snapshot data needed: each case is the
// posting's own text or place, copied from that crawl.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { geocode, countryName, canonicalName } from '../server/geo.js';
import { normalizeLocations } from '../server/normalize.js';

const names = (s) => geocode(s).map((l) => l.name);

test('D-23: a bare "JO" at Microsoft is Jordan, with the country set (2026-10-16 crawl)', () => {
  const [jo] = geocode('JO');
  assert.equal(jo.name, 'Jordan');
  assert.equal(jo.country, 'JO');
  assert.ok(Number.isFinite(jo.lat) && Number.isFinite(jo.lng), 'Jordan has a centroid');
  assert.equal(jo.rawName, 'JO');
  assert.deepEqual(names('Amman, JO'), ['Amman, Jordan']);
});

test('D-23: Amazon\'s "Manama, BHR" is Bahrain and its "PRI" is Puerto Rico, not bare codes', () => {
  assert.deepEqual(geocode('Manama, BHR').map((l) => [l.name, l.country]), [['Manama, Bahrain', 'BH']]);
  assert.deepEqual(geocode('PRI').map((l) => [l.name, l.region, l.country]), [['Puerto Rico, US', 'PR', 'US']]);
  // The stored pair from the crawl ("San Juan, Puerto Rico" | "PRI") keeps both places, named.
  const locs = normalizeLocations({ locationText: 'San Juan, Puerto Rico', extraLocations: ['PRI'] });
  assert.ok(locs.every((l) => !/^[A-Z]{2,3}$/.test(l.name)), locs.map((l) => l.name).join(' | '));
  // Lower case is a word, not a code.
  assert.notEqual(geocode('pri')[0].country, 'US');
});

test('D-23: a bare code of a country the gazetteer lacks is named, never shown raw', () => {
  const [xk] = geocode('XK');
  assert.equal(xk.name, 'Kosovo');
  assert.equal(xk.country, 'XK');
  assert.equal(xk.lat, null, 'no invented coordinates');
  assert.equal(countryName('JO'), 'Jordan');
  assert.equal(canonicalName({ country: 'XK', lat: null, lng: null, rawName: 'XK' }), 'Kosovo');
  // Codes that are not countries stay as written ("ZZ" is Intl's "Unknown Region").
  for (const c of ['ZZ', 'EU', 'UN', 'QO', 'AA']) assert.equal(countryName(c), null, c);
  // A US state's or a known region's code keeps its region reading.
  assert.deepEqual(geocode('GA').map((l) => [l.region, l.country]), [['GA', 'US']]);
  assert.deepEqual(geocode('MD').map((l) => [l.region, l.country]), [['MD', 'US']]);
  assert.deepEqual(geocode('ON').map((l) => [l.region, l.country]), [['ON', 'CA']]);
  // Known bare codes are unchanged (DQ-1).
  assert.deepEqual(names('DE'), ['Germany']);
  assert.deepEqual(names('CA'), ['Canada']);
});

// fix3-data [static beta], tag noise: Google's AI and Infrastructure paragraph, as posted on the
// 2026-10-16 crawl. "the driving force" is on 377 postings; "the driving channel" on 3, too few to
// count as a team paragraph by itself, so a data-centre technician was tagged TPUs, GCP, Networking.
const AI2_TAIL = 'empowering the development of our cutting-edge AI models, delivering unparalleled computing power to global services, and providing the essential platforms that enable developers to build the future. From software to hardware our teams are shaping the future of world-leading hyperscale computing, with key teams working on the development of our TPUs, Vertex AI for Google Cloud, Google Global Networking, Data Center operations, systems research, and much more.';
const AI2 = (word) => `<p>We're the driving ${word} behind Google's groundbreaking innovations, ${AI2_TAIL}</p>`;
const gPosting = (title, team, own, resp, fit) => ({
  id: `google:${title.replace(/\W+/g, '')}`, company: 'google', title, department: 'Google',
  descriptionHtml: `<p>${own}</p>${team}<h3>Responsibilities</h3><ul>${resp.map((r) => `<li>${r}</li>`).join('')}</ul><h3>Minimum qualifications:</h3><ul>${fit.map((f) => `<li>${f}</li>`).join('')}</ul>`,
});

test('fix3-data tag noise: a near copy of a team paragraph ("the driving channel") gives a technician no TPUs, GCP or Networking', async () => {
  const { teamParagraphs, rekeyBoardJobs, descriptionText } = await import('../server/keywords.js');
  // The paragraph as most of the board posts it, on 10 different roles (an organisation's paragraph).
  const ORG = ['Software Engineer III, Infrastructure', 'Program Manager, Data Centers', 'Site Reliability Engineer', 'Network Engineer',
    'Product Manager, Cloud', 'Technical Writer', 'Security Engineer', 'Data Scientist', 'Hardware Test Engineer'];
  const jobs = [
    ...ORG.map((t, i) => gPosting(t, AI2('force'), `Own role ${i}.`, [`Do task ${i} for the ${t}.`], [`${i + 2} years of experience.`])),
    gPosting('Hardware Engineer, TPU', AI2('force'), 'Design accelerator boards.', ['Bring up TPU boards.'], ['Experience with TPUs.']),
    gPosting('Data Center Facilities Technician, Mechanical', AI2('channel'), 'Facilities Technicians at Google data centers operate, monitor and support physical facilities conditions.',
      ['Inspect, maintain, and repair various data center systems such as piping and mechanical system components.'], ['2 years of Mechanical/HVAC experience in an industrial or commercial environment.']),
  ];
  const team = teamParagraphs(jobs.map((j) => ({ html: j.descriptionHtml, title: j.title })));
  assert.equal(team.size, 2, 'the paragraph and its near copy');
  const tech = jobs[jobs.length - 1];
  assert.ok(!/TPUs/.test(descriptionText(tech.descriptionHtml, { skip: team })), 'the near copy is left out of the skill text');
  const by = Object.fromEntries(rekeyBoardJobs(jobs).jobs.map((j) => [j.title, j.keywords.skills]));
  const skills = by['Data Center Facilities Technician, Mechanical'];
  for (const s of ['TPUs', 'GCP', 'Networking']) assert.ok(!skills.includes(s), `${s} on the technician: ${skills.join()}`);
  assert.ok(by['Hardware Engineer, TPU'].includes('TPUs'), 'a role that names TPUs in its own lists keeps them');
});

test('fix3-data tag noise: a paragraph that only shares a sentence with a team paragraph keeps its own words', async () => {
  const { teamParagraphs } = await import('../server/keywords.js');
  const own = '<p>In this role you will build the GPU fleet scheduler, written in Go and Rust, for inference across many regions and many accelerator types. From software to hardware our teams are shaping the future of world-leading hyperscale computing, with key teams working on the development of our TPUs, Vertex AI for Google Cloud, Google Global Networking, Data Center operations, systems research, and much more.</p>';
  const jobs = [
    gPosting('Software Engineer III, Infrastructure', AI2('force'), 'Build serving systems.', ['Write C++.'], ['C++.']),
    gPosting('Hardware Engineer, TPU', AI2('force'), 'Design boards.', ['Bring up boards.'], ['Boards.']),
    gPosting('Program Manager, Data Centers', AI2('force'), 'Run builds.', ['Plan launches.'], ['Programs.']),
    gPosting('Software Engineer, Fleet Scheduling', own, 'Schedule the fleet.', ['Write Go.'], ['Go.']),
  ];
  assert.equal(teamParagraphs(jobs.map((j) => ({ html: j.descriptionHtml, title: j.title }))).size, 1, 'only the repeated paragraph');
});

test('fix3-data tag noise: one role\'s text copied to a few postings is not a source of near copies', async () => {
  const { teamParagraphs } = await import('../server/keywords.js');
  // The same paragraph on 3 roles is a team paragraph (fix wave 3), but a near copy of it is only
  // left out when at least 10 roles repeat the paragraph.
  const jobs = [
    gPosting('Software Engineer III, Infrastructure', AI2('force'), 'Build serving systems.', ['Write C++.'], ['C++.']),
    gPosting('Hardware Engineer, TPU', AI2('force'), 'Design boards.', ['Bring up boards.'], ['Boards.']),
    gPosting('Program Manager, Data Centers', AI2('force'), 'Run builds.', ['Plan launches.'], ['Programs.']),
    gPosting('Data Center Facilities Technician, Mechanical', AI2('channel'), 'Maintain facilities.', ['Repair pumps.'], ['HVAC.']),
  ];
  assert.equal(teamParagraphs(jobs.map((j) => ({ html: j.descriptionHtml, title: j.title }))).size, 1);
});
