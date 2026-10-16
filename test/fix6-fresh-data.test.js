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
