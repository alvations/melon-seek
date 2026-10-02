import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitLocations, geocode, GAZETTEER_SIZE } from '../server/geo.js';

test('splitLocations: separators', () => {
  assert.deepEqual(splitLocations('San Francisco, CA | New York City, NY | Seattle, WA'),
    ['San Francisco, CA', 'New York City, NY', 'Seattle, WA']);
  assert.deepEqual(splitLocations('Remote-Friendly (Travel-Required) | San Francisco, CA'),
    ['Remote-Friendly (Travel-Required)', 'San Francisco, CA']);
  assert.deepEqual(splitLocations('Costa Mesa, California, United States'), ['Costa Mesa, California, United States']);
  assert.deepEqual(splitLocations('London, UK'), ['London, UK']);
  assert.deepEqual(splitLocations('Austin, TX; Denver, CO'), ['Austin, TX', 'Denver, CO']);
  assert.deepEqual(splitLocations('Boston / Chicago'), ['Boston', 'Chicago']);
  assert.deepEqual(splitLocations('Portland, OR or Remote'), ['Portland, OR', 'Remote']);
  assert.deepEqual(splitLocations('Washington, DC & Seattle, WA'), ['Washington, DC', 'Seattle, WA']);
  assert.deepEqual(splitLocations('San Francisco, CA, New York, NY'), ['San Francisco, CA', 'New York, NY']);
  assert.deepEqual(splitLocations('San Francisco, Seattle, Austin'), ['San Francisco', 'Seattle', 'Austin']);
  assert.deepEqual(splitLocations('Remote (US, Canada)'), ['Remote (US, Canada)']);
  assert.deepEqual(splitLocations('SF | sf'), ['SF']);
  assert.deepEqual(splitLocations(''), []);
  assert.deepEqual(splitLocations(null), []);
  assert.deepEqual(splitLocations(['London, UK', 'Dublin, IE | London, UK']), ['London, UK', 'Dublin, IE']);
});

function one(str) {
  const r = geocode(str);
  assert.equal(r.length, 1, `${str} -> ${r.length}`);
  return r[0];
}

test('geocode: shape and US cities', () => {
  const sf = one('San Francisco, CA');
  assert.deepEqual(Object.keys(sf).sort(), ['city', 'country', 'lat', 'lng', 'name', 'rawName', 'region', 'remote']);
  assert.equal(sf.name, 'San Francisco, CA');
  assert.equal(sf.rawName, 'San Francisco, CA');
  assert.equal(sf.city, 'San Francisco');
  assert.equal(sf.region, 'CA');
  assert.equal(sf.country, 'US');
  assert.equal(sf.remote, false);
  assert.ok(Math.abs(sf.lat - 37.77) < 0.1 && Math.abs(sf.lng + 122.42) < 0.1);
  assert.equal(one('NYC').city, 'New York');
  assert.equal(one('New York City, NY').city, 'New York');
  assert.equal(one('Bay Area').city, 'San Francisco');
  assert.equal(one('Seattle WA').city, 'Seattle');
  assert.equal(one('Washington, D.C.').region, 'DC');
  assert.equal(one('Washington, District of Columbia, United States').region, 'DC');
  assert.equal(one('Seattle, Washington, United States').region, 'WA');
  assert.equal(one('Costa Mesa, California, United States').city, 'Costa Mesa');
  assert.equal(one('Huntsville, Alabama, United States').region, 'AL');
  assert.equal(one('Columbus, Ohio, United States').region, 'OH');
});

test('geocode: disambiguation by region/country', () => {
  assert.equal(one('Cambridge, MA').country, 'US');
  assert.equal(one('Cambridge, UK').country, 'GB');
  assert.equal(one('Melbourne, FL').country, 'US');
  assert.equal(one('Melbourne, Australia').country, 'AU');
  assert.equal(one('Arlington, VA').region, 'VA');
  assert.equal(one('Arlington, TX').region, 'TX');
});

test('geocode: international', () => {
  assert.equal(one('London, UK').country, 'GB');
  assert.equal(one('London, England, United Kingdom').city, 'London');
  assert.equal(one('Dublin, IE').country, 'IE');
  assert.equal(one('Zürich, CH').city, 'Zurich');
  assert.equal(one('Tokyo, Japan').country, 'JP');
  assert.equal(one('Bangalore').city, 'Bengaluru');
  assert.equal(one('Sydney, New South Wales, Australia').country, 'AU');
  assert.equal(one('Toronto, ON').country, 'CA');
});

test('geocode: states and countries -> centroids', () => {
  const tx = one('Texas');
  assert.equal(tx.region, 'TX');
  assert.equal(tx.city, null);
  assert.ok(tx.lat != null);
  const de = one('Germany');
  assert.equal(de.country, 'DE');
  assert.ok(de.lat > 45 && de.lat < 56);
  // Unknown city in a known state -> state centroid, city name kept.
  const paris = one('Paris, Texas');
  assert.equal(paris.region, 'TX');
  assert.equal(paris.city, 'Paris');
});

test('geocode: remote', () => {
  const r = one('Remote');
  assert.equal(r.remote, true);
  assert.equal(r.lat, null);
  const us = one('Remote (US)');
  assert.equal(us.remote, true);
  assert.equal(us.country, 'US');
  assert.ok(us.lat != null);
  assert.equal(one('US Remote').country, 'US');
  assert.equal(one('Remote - Canada').country, 'CA');
  assert.equal(one('Anywhere').remote, true);
  const both = geocode('Remote-Friendly (Travel-Required) | San Francisco, CA');
  assert.equal(both.length, 2);
  assert.equal(both[0].remote, true);
  assert.equal(both[0].country, null);
  assert.equal(both[1].remote, false);
});

test('geocode: unknown keeps name, null coords', () => {
  const u = one('Xyzzyville');
  assert.equal(u.name, 'Xyzzyville');
  assert.equal(u.rawName, 'Xyzzyville');
  assert.equal(u.lat, null);
  assert.equal(u.lng, null);
  assert.equal(u.remote, false);
  assert.deepEqual(geocode(''), []);
  assert.deepEqual(geocode(undefined), []);
});

test('gazetteer size', () => {
  assert.ok(GAZETTEER_SIZE.cities >= 200, `cities ${GAZETTEER_SIZE.cities}`);
  assert.equal(GAZETTEER_SIZE.states, 52);
  assert.ok(GAZETTEER_SIZE.countries >= 50);
});

test('UX-3: canonical display names collapse variants; rawName keeps the source string', () => {
  const name = (x) => one(x).name;
  // remote variants
  for (const r of ['Remote-Friendly US (Travel Required)', 'Remote-Friendly, United States', 'US - Remote', 'Remote (US)', 'Remote, USA']) assert.equal(name(r), 'Remote (US)', r);
  for (const r of ['Remote-Friendly (Travel-Required)', 'Remote-Friendly (Travel Required)', 'Remote', 'Anywhere']) assert.equal(name(r), 'Remote', r);
  assert.equal(name('Ontario - Remote'), 'Remote (CA)');
  assert.equal(name('Remote-Friendly, Australia'), 'Remote (AU)');
  // region / prefecture / format duplicates collapse to one city name
  assert.equal(name('Tokyo Prefecture'), 'Tokyo, Japan');
  assert.equal(name('Tokyo'), 'Tokyo, Japan');
  assert.equal(name('Tokyo, Japan'), 'Tokyo, Japan');
  assert.equal(name('Costa Mesa, California, United States'), 'Costa Mesa, CA');
  assert.equal(name('Seattle WA'), 'Seattle, WA');
  assert.equal(name('New York City, NY'), 'New York, NY');
  assert.equal(name('NYC'), 'New York, NY');
  assert.equal(name('Washington, District of Columbia, United States'), 'Washington, DC');
  assert.equal(name('London, England, United Kingdom'), 'London, UK');
  assert.equal(name('Zürich, CH'), 'Zurich, Switzerland');
  assert.equal(name('Singapore'), 'Singapore');
  // region-only and country-only
  assert.equal(name('Ontario, CAN'), 'Ontario, Canada');
  assert.equal(name('Ontario, Canada'), 'Ontario, Canada');
  assert.equal(name('Texas'), 'Texas, US');
  assert.equal(name('Germany'), 'Germany');
  const r = one('Remote-Friendly US (Travel Required)');
  assert.equal(r.rawName, 'Remote-Friendly US (Travel Required)');
  assert.equal(one('Tokyo Prefecture').rawName, 'Tokyo Prefecture');
});
