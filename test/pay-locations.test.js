// Shared helpers the 2026-10-10 persona fix lanes build on: which locations a posting's pay
// covers (payLocations) and the job-seeker label for the default level (levelLabel).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COUNTRY_CURRENCY as BROWSER } from '../public/viz/palette.js';
import { COUNTRY_CURRENCY as SERVER } from '../server/salary.js';
import { payLocations } from '../public/features/shared.js';
import { levelLabel, displayLevel, LEVEL_NOT_STATED, NOT_STATED } from '../public/features/roles.js';

const loc = (city, country, remote = false) => ({ name: city, city, country, remote });

test('the browser country-currency table equals server/salary.js', () => {
  assert.deepEqual({ ...BROWSER }, { ...SERVER });
});

test('payLocations keeps the locations in the pay currency\'s countries', () => {
  // Real Anduril posting: US hourly range, listed in 4 US cities and Sydney.
  const job = { salary: { currency: 'USD' }, locations: [loc('Costa Mesa', 'US'), loc('Seattle', 'US'), loc('Sydney', 'AU')] };
  assert.deepEqual(payLocations(job).map((l) => l.city), ['Costa Mesa', 'Seattle']);
  const gbp = { salary: { currency: 'GBP' }, locations: [loc('London', 'GB'), loc('San Francisco', 'US')] };
  assert.deepEqual(payLocations(gbp).map((l) => l.city), ['London']);
  const eur = { salary: { currency: 'eur' }, locations: [loc('Dublin', 'IE'), loc('Zurich', 'CH')] };
  assert.deepEqual(payLocations(eur).map((l) => l.city), ['Dublin']);
});

test('payLocations returns every location when it cannot tell', () => {
  const none = { salary: { currency: 'USD' }, locations: [loc('Toronto', 'CA'), loc('London', 'GB')] };
  assert.equal(payLocations(none).length, 2, 'no location uses USD');
  const noPay = { salary: null, locations: [loc('Sydney', 'AU'), loc('Austin', 'US')] };
  assert.equal(payLocations(noPay).length, 2);
  const remote = { salary: { currency: 'USD' }, locations: [{ name: 'Remote', remote: true }, loc('Sydney', 'AU')] };
  assert.deepEqual(payLocations(remote).map((l) => l.name), ['Remote']);
  assert.deepEqual(payLocations({}), []);
});

test('levelLabel: the default level reads "Level not stated"; real levels are unchanged', () => {
  // Shared decision 1 (beta fix wave): people see levelLabel(displayLevel(job)); the stored default stays 'Mid'.
  assert.equal(LEVEL_NOT_STATED, 'Mid');
  assert.equal(levelLabel(displayLevel({ seniority: 'Mid' })), 'Level not stated');
  assert.equal(levelLabel(NOT_STATED), 'Level not stated');
  assert.equal(levelLabel(null), 'Level not stated');
  assert.equal(levelLabel('Mid'), 'Mid', 'a stated mid level (Google "III", basis "title") reads Mid');
  for (const l of ['Intern', 'Entry', 'Senior', 'Staff+', 'Manager', 'Director+']) assert.equal(levelLabel(l), l);
});
