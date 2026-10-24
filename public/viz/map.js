// melon-seek job map (Leaflet, global `L`).
//
// createMap(container, { onSelect(job), onAreaSelect(jobs, label), onColorModeChange(mode),
//                        colorMode?: 'pay' | 'juice',
//                        tiles?: { url, attribution, maxZoom, subdomains, dark: 'filter' | url } })
//   -> { update(jobs, { fit, colorMode, places, placeTest }), highlight(jobId|null), invalidateSize(),
//        setJuiceNote(text) (an "as of" line under the Juice legend), colorMode (getter), destroy(), leaflet }
//
// Jobs are aggregated per location (lat/lng rounded to 0.1°; a job with several
// locations counts in each), then greedily clustered in screen space so pills
// never overlap at the current zoom. Each cluster is a Zillow-style price-tag
// pill: median salary (approx USD) + count badge, filled on a one-hue
// sequential scale by median. Remote-only postings live in a "Remote" control.
// A posting's pay counts only at the places it was posted for, at the pay posted there
// (payAt in public/features/shared.js: a place's own row of salary.ranges, else the posting's
// one range in the pay currency's countries), so US pay is never the median of a Sydney or
// London pin, and Microsoft's Mountain View pin is its SF Bay Area range (fix-pay-at-place,
// V-39); the posting is still counted there. A cluster is "<place> + N nearby" only when its places are within NEAR_KM
// of each other; otherwise it names its two biggest places ("San Francisco, New
// York and 2 more"). Offline, place names show under the pins. Every pin keeps its name
// (fix wave 3): a name that would run into another pin or name goes above its pin, then in a
// shorter form ("Shanghai and 52 more"), then beside the pin; only when none of those fit is the
// pin merged into its nearest neighbour, whose name then counts it.
// Location filter (fix wave 3, BP-2): update(jobs, { places, placeTest }) pins only the filtered
// places (placeMatcher in chart.js; app.js passes its own locMatches), so roles that also list
// other cities no longer pin those cities; the tooltip counts them ("12 of these are also listed
// in other places").
// A "Pay | Juice" segmented control switches pin color to the Juice Score
// (docs/LIVABILITY.md): the median score at that location on a stepped ramp with
// breaks at 45 and 70 (Dry / Ripe / Juicy); pins without juice data are neutral.
// The grade also shows without colour (ROADMAP §8 adds no colours): Juicy pins are
// filled, Ripe pins tinted with a solid ring, Dry pins an outline with a dashed ring
// (Rind dotted), and the legend's swatches match.
// Basemap: OpenStreetMap standard tiles by default (no API key). Dark mode
// inverts the tile pane only with a CSS filter (pins are never filtered), or
// swaps to `tiles.dark` when that is a URL. If tiles fail, the container
// keeps a styled background, a graticule and labelled pins.

import {
  formatMoney, toUSD, median, payColor, paySteps, inkOn, onThemeChange, isDark, prefersReducedMotion,
  juiceColor, juiceGrade, juiceNetForScore, JUICE_BREAKS, isForeign, hasFx, FX_AS_OF,
} from './palette.js';
import { payAt, payCovers, placeRowCount, notBasePay, headlineMedian, medianText } from '../features/shared.js';
// M-23: pin counts as "4.5K", like the chart's circles; the exact count is in pinName().
import { shortCount, placeMatcher, FX_DOC, FX_SOURCE_SHORT } from './chart.js';
import { renderNote } from './note.js';
import { isTouchInput } from '../features/shared.js';

export const COLOR_MODES = Object.freeze(['pay', 'juice']);
/** I-10: how full a Juice pin (and its legend swatch) is drawn, by grade. */
export const GRADE_FILL = Object.freeze({ Juicy: 'full', Ripe: 'half', Dry: 'none', Rind: 'none' });

/** Default basemap: OSM standard tiles (no key). Usage policy: attribution visible, no prefetch. */
export const OSM_TILES = Object.freeze({
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19,
  dark: 'filter',
});
const BASE_MIN_ZOOM = 2; // lowered per dataset by fitToData() when the pins need it
/** B-7 (fix-ui-6): a pin's pointer reaches this far under its price tag, to the place (.ms-pin: 7 px). */
const PIN_TIP = 7;
/** B-7: the air a pin keeps from the map's own controls and the attribution, in px. */
const CONTROL_GAP = 2;
const CLUSTER_W = 76;  // px: pill width + gap
const CLUSTER_H = 34;  // px: pill height + gap (labels add more when offline)
const LABEL_GAP = 5;   // px between a pin and a place name moved above it (viz.css .ms-pin__label--above)
const MERGE_PASSES = 6; // draw(): at most this many merges of pins whose names find no room
/**
 * V-17: a pin shows a pay median only when at least this many of its postings post pay for its
 * places; with fewer it reads "48 jobs" and its tooltip gives the one or two figures. Any pin whose
 * median rests on part of its postings says how many ("median $101K from 28 with pay for here").
 */
export const MIN_PIN_PAY = 3;
/**
 * V-43 (fix-viz-5): a pin whose median rests on fewer than this share of its postings says so on the pin: its count
 * reads "5 of 434" (postings with pay for here, of its postings), not "434", so "$76K · 434" no longer reads as the
 * median of 434 postings when 5 post pay for there.
 */
export const MIN_PIN_SHARE = 0.25;
/** V-43: the count on a priced pin: "434", or "5 of 434" when its median rests on under MIN_PIN_SHARE of them ('' for one). */
export function pinCountText(c) {
  if (!c || c.median == null || c.few) return '';
  const k = c.based ?? c.salaried; // the postings the median rests on
  if (k < c.n * MIN_PIN_SHARE) return `${shortCount(k)} of ${pinCount(c)}`;
  return c.n > 1 ? pinCount(c) : '';
}
/**
 * BN-1 (fix-app-6): a pin's postings under a Location filter, its own first: "83+294" when 294 of them are listed only
 * for its country or state (aggregate `wide`), so a town's own count is not hidden in a country's.
 */
export function pinCount(c) {
  const w = Math.min(c?.wide || 0, c?.n || 0);
  return w ? `${shortCount(c.n - w)}+${shortCount(w)}` : shortCount(c?.n || 0);
}
/**
 * V-45 (fix-viz-5): a place pinned where the gazetteer has no town of its own is approximate: a town it does not know
 * (server/geo.js locationPrecision 'centroid'), or a place named only by its state ('region') or country ('country'),
 * pinned at that centre ("Luxembourg, LUX" sat at the country's centre unmarked).
 */
export const isApproxPrecision = (p) => p === 'centroid' || p === 'region' || p === 'country';
/**
 * UX-45 (fix-viz-5): the money left a year at which a shown Juice Score starts. Scores are shown rounded, so a 45 (Ripe)
 * starts at 44.5: $47,103, and a 70 (Juicy) at 69.5: $94,996 (docs/METHODOLOGY_GUIDE.md), the figures the list's scale
 * and the drawer's badge give (app.js juiceScaleText, palette.js juiceNetForScore). The map's legend wrote netForScore(45)
 * and netForScore(70), "$48K" and "$96K". `netForScore` is the live server/juice.js one (palette.js's mirror without it).
 */
export function juiceCutoff(score, netForScore = null) {
  if (typeof netForScore !== 'function') return juiceNetForScore(score);
  return netForScore(Math.max(0, Number(score) - 0.5));
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fxMonth = (iso) => { const m = /^(\d{4})-(\d{2})/.exec(String(iso || '')); return m ? `${MONTHS[+m[2] - 1]} ${m[1]}` : String(iso || ''); };

let measureCtx = null;
/** Text width in px for a CSS font (canvas, no layout). */
function textWidth(text, font) {
  try {
    measureCtx ||= document.createElement('canvas').getContext('2d');
    measureCtx.font = font || '12px system-ui, sans-serif';
    return measureCtx.measureText(String(text)).width;
  } catch { return String(text).length * 7; }
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function midUSD(job) {
  const s = job.salary;
  if (!s || (s.min == null && s.max == null)) return null;
  const cur = s.currency || 'USD';
  const mid = s.mid ?? ((s.min ?? s.max) + (s.max ?? s.min)) / 2;
  return toUSD(mid, cur);
}

function locLabel(l) {
  // Outside the US the canonical name already spells the country ("Tokyo, Japan", "Sydney, Australia").
  if (l.city && l.country && l.country !== 'US' && l.name && !l.remote) return l.name;
  if (l.city) return l.region && l.region !== l.city ? `${l.city}, ${l.region}` : (l.country && l.country !== l.city ? `${l.city}, ${l.country}` : l.city);
  return l.name || 'Unknown';
}

const plural = (n, one, many = one + 's') => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/** A no-pay pin's text: "361 jobs", "1.1K jobs" (M-23's short count, never "1.117" or "1,117"). */
export function jobsText(n) { return `${shortCount(n)} ${n === 1 ? 'job' : 'jobs'}`; }

/** Places closer than this to a cluster's biggest place are "nearby" (a metro area, not a coast). */
export const NEAR_KM = 150;

/** Great-circle distance in km between two { lat, lng }. */
export function distanceKm(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Aggregate jobs into { places: [{key,lat,lng,label,city,jobs,paid,priceOf,also,wide}], remote: jobs[], remotePaid,
 * remotePriceOf }.
 * A job counts at every place it lists; `paid` (a Set of job ids) holds the jobs with pay posted there
 * (payAt in public/features/shared.js: the place's own row of salary.ranges, or the posting's one range in
 * that place's country), and `remotePaid` those with pay posted for their remote location. `priceOf(job)`
 * is a paid job's pay at that place, in approx US dollars (V-39, fix-pay-at-place: Microsoft's Mountain View
 * pin at its SF Bay Area range, not the U.S. headline; Amazon's Cupertino pin at Cupertino's row).
 * With a Location filter (`places`, the filter's keys, and `placeTest(job, location)`, the host's
 * own match; see chart.js placeMatcher) only the filtered places are pinned:
 * - a location the filter leaves out gets no pin; `also` (job ids) marks the roles at a place
 *   that also list such a location;
 * - a location with no city that the filter takes in ("United States", "Ohio, US": app.js I-6, a
 *   city pick also finds roles that list only its country or state) counts at the filtered cities
 *   it covers, not at the country's centre; `wide` (job ids) marks those roles. It keeps a pin of
 *   its own only when the filter names it, or covers no city on the map;
 * - the Remote bucket holds only roles whose remote location the filter takes in.
 */
export function aggregate(jobs, { places: filter = null, placeTest = null } = {}) {
  const test = placeMatcher(filter, placeTest);
  const named = new Set(filter == null ? [] : (typeof filter === 'string' ? [filter] : [...filter]));
  const places = new Map();
  const remote = [];
  const remotePaid = new Set();
  const remoteAt = new Map(); // job id -> its remote Locations with posted pay
  const wide = []; // [{ job, l, seen }] country- or state-wide locations to count at the filtered cities
  const homes = new Map(); // job id -> Set of place keys (under a filter, for `also`)
  const others = new Set(); // job ids that list a location outside the filter
  let unplaced = 0; // V-44: postings with no place at all and not remote: on no pin and not in Remote, so counted
  // `rows`: the posting prices its places on rows of their own (salary.ranges), so a pin keeps which of its places
  // it is at (locsAt) to price it there; a posting with one range is its headline at every place it covers.
  const at = (job, l, hasPay, key, seen, rows = false) => {
    let p = places.get(key);
    if (!p) {
      const locsAt = new Map(); // job id -> its Locations here that have posted pay
      p = { key, lat: +l.lat, lng: +l.lng, label: locLabel(l), city: l.city || null, country: up(l.country), region: up(l.region), loc: l,
        jobs: [], locNames: new Map(), paid: new Set(), also: new Set(), wide: new Set(), locsAt, priceOf: pricer((j) => locsAt.get(j.id)) };
      places.set(key, p);
    }
    if (!p.locNames.has(job.id)) { p.jobs.push(job); p.locNames.set(job.id, new Set()); }
    p.locNames.get(job.id).add(norm(l.name || locLabel(l)));
    if (hasPay && payCovers(job, l)) {
      p.paid.add(job.id);
      if (rows) {
        const ls = p.locsAt.get(job.id);
        if (ls) { if (!ls.includes(l)) ls.push(l); } else p.locsAt.set(job.id, [l]);
      }
    }
    seen?.add(key);
    return p;
  };
  for (const job of jobs) {
    let isRemote = false;
    const seen = new Set();
    if (!test && !job.remote && !(job.locations || []).some(Boolean)) { unplaced++; continue; }
    const hasPay = !!job.salary && (job.salary.min != null || job.salary.max != null);
    const rows = hasPay && placeRowCount(job) > 0;
    for (const l of job.locations || []) {
      if (!l) continue;
      if (test && !test(job, l)) { others.add(job.id); continue; } // a place outside the filter: not pinned
      if (l.remote) { isRemote = true; continue; }
      if (test && !l.city && !named.has(l.name)) { wide.push({ job, l, hasPay, seen, rows }); continue; }
      if (l.lat == null || l.lng == null || !isFinite(l.lat) || !isFinite(l.lng)) continue;
      at(job, l, hasPay, `${l.lat.toFixed(1)},${l.lng.toFixed(1)}`, seen, rows);
    }
    if (test) homes.set(job.id, seen);
    // D-4: the Remote bucket is exactly the Remote filter (job.remote), also for roles that have a pin.
    // Under a Location filter it holds the roles whose remote location is one of the filtered places.
    if (test ? isRemote : (isRemote || job.remote)) {
      remote.push(job);
      // Pay counts for Remote when it is posted for a remote location, or when the posting names none.
      if (hasPay) {
        const here = (job.locations || []).filter((l) => l && l.remote && (!test || test(job, l)) && payCovers(job, l));
        if (here.length) { remotePaid.add(job.id); if (rows) remoteAt.set(job.id, here); } else if (!isRemote && !test) remotePaid.add(job.id);
      }
    }
  }
  if (wide.length) {
    const cities = [...places.values()].filter((p) => p.city);
    for (const { job, l, hasPay, seen, rows } of wide) {
      const c = up(l.country), r = up(l.region);
      const hit = cities.filter((p) => p.country === c && (!r || p.region === r));
      // BN-1 (fix-app-6): `wide` holds the postings here only through their country or state (not also listed here).
      if (hit.length) for (const p of hit) { const own = p.locNames.has(job.id); const q = at(job, l, hasPay, p.key, seen, rows); if (!own) q.wide.add(job.id); }
      else if (l.lat != null && l.lng != null && isFinite(l.lat) && isFinite(l.lng)) at(job, l, hasPay, `${l.lat.toFixed(1)},${l.lng.toFixed(1)}`, seen, rows);
    }
  }
  for (const id of others) for (const key of homes.get(id) || []) places.get(key).also.add(id);
  return { places: [...places.values()], remote, remotePaid, remotePriceOf: pricer((j) => remoteAt.get(j.id)), unplaced };
}
const up = (s) => (s ? String(s).toUpperCase() : '');

/**
 * fix-pay-at-place: a job's pay at some of its Locations, approx USD midpoint (payAt: one place's own row, or
 * the span of the places' rows), else its headline midpoint (`locs` empty: a remote posting that names no place).
 */
function priceAtUSD(job, locs) {
  const r = locs && locs.length ? payAt(job, locs.length === 1 ? locs[0] : locs) : null;
  return r?.usd ? r.usd.mid : midUSD(job);
}
/** BN-2 (fix-app-6): the currency of that pay (a place's own row can be in its own currency). */
function curAt(job, locs) {
  const r = locs && locs.length ? payAt(job, locs.length === 1 ? locs[0] : locs) : null;
  return String((r?.usd ? r.currency : job.salary?.currency) || 'USD').toUpperCase();
}
/** A pin's priceOf(job): its pay here (priceAtUSD); priceOf.cur(job) is that pay's currency (BN-2). */
function pricer(locsOf) {
  const f = (j) => priceAtUSD(j, locsOf(j));
  f.cur = (j) => curAt(j, locsOf(j));
  return f;
}

/**
 * { n, salaried, elsewhere, median } for jobs at a place: the median (approx USD) is over the jobs
 * in `paid` only (pay posted here); `elsewhere` counts salaried jobs whose pay is for
 * another country or other places. Without `paid` every salary counts. `priceOf(job)` is a job's pay
 * here (aggregate's place.priceOf, V-39); without it, the posting's headline midpoint.
 */
export function summarize(jobs, paid = null, priceOf = null) {
  const base = [], ote = [], nb = [];
  let elsewhere = 0, fx = 0;
  for (const j of jobs) {
    const head = midUSD(j);
    if (head == null) continue;
    if (paid && !paid.has(j.id)) { elsewhere++; continue; }
    const v = (priceOf && priceOf(j)) ?? head;
    const cur = priceOf?.cur ? priceOf.cur(j) : String(j.salary.currency || 'USD').toUpperCase();
    // BP-13: base pay, as the stats line and the chart; MR-28 (fix-viz-5): nor a stated minimum, shift-inclusive or
    // part-time pay (shared.js notBasePay), which are counted at the pin and used only when nothing else is left.
    (notBasePay(j) ? nb : j.salary.kind === 'ote' ? ote : base).push({ usd: v, cur, hourly: j.salary.partTime === true && j.salary.originalInterval === 'hour' });
    if (isForeign(j.salary.currency) && hasFx(j.salary.currency)) fx++;
  }
  const pool = base.length ? base : ote.length ? ote : nb;
  const salaried = base.length + ote.length + nb.length;
  // BN-2 (fix-app-6): shared.js headlineMedian, as the stats line, the chart's caption and Insights' tiles: MR-39's main
  // currency, written in that currency (`price`: "CA$101K" for a Toronto pin, never a bare "$" for converted pay).
  const hm = headlineMedian(pool);
  // V-17: `few` when too few postings post pay here for the pin to show a price (pinPrice).
  const few = hm.n > 0 && hm.n < MIN_PIN_PAY;
  const one = (x) => medianText(headlineMedian([x]));
  const only = few ? pool.slice().sort((x, y) => x.usd - y.usd) : null;
  return { n: jobs.length, salaried, elsewhere, fx, few, only: only && only.map((x) => x.usd), onlyText: only && only.map(one), median: hm.median,
    price: hm.median != null ? medianText(hm) : null, cur: hm.cur, basis: hm.basis,
    based: hm.n, notBaseLeft: base.length || ote.length ? nb.length : 0, notBaseOnly: !base.length && !ote.length && nb.length > 0 };
}

/** BN-2: a pin's median as the stats line writes it (summarize's `price`), else in US dollars. */
const pinPrice = (c) => c.price || formatMoney(c.median);

const shortPlace = (p) => p.city || String(p.label || '').split(',')[0].trim() || 'Unknown';

/**
 * Plain label for a cluster of places (members[0] is its biggest): the place itself; "<place> + N
 * nearby" when every member is within NEAR_KM of it; otherwise its two biggest areas by name,
 * "San Francisco, New York and 2 more" (never "+ N nearby" for places a continent apart).
 */
export function clusterLabel(members) {
  if (!members?.length) return 'Unknown';
  const lead = members[0];
  if (members.length === 1) return lead.label;
  if (members.every((m) => distanceKm(m, lead) <= NEAR_KM)) return `${lead.label} + ${members.length - 1} nearby`;
  const names = areaNames(members);
  if (!names.length) return `${lead.label} and ${members.length - 1} more`;
  if (names.length === 1) return `${names[0]} and ${members.length - 1} more`;
  return members.length === 2 ? `${names[0]} and ${names[1]}` : `${names[0]}, ${names[1]} and ${members.length - 2} more`;
}

/** A cluster's areas (places within NEAR_KM of each other), biggest first, named by their city. */
function areaNames(members) {
  const areas = [];
  for (const m of members.slice().sort((a, b) => b.jobs.length - a.jobs.length)) {
    const a = areas.find((x) => distanceKm(x.lead, m) <= NEAR_KM);
    if (a) a.n += m.jobs.length; else areas.push({ lead: m, n: m.jobs.length });
  }
  areas.sort((a, b) => b.n - a.n);
  // Name cities; a region or country-wide place ("United States") is counted in "more".
  return [...new Set(areas.filter((a) => a.lead.city).map((a) => shortPlace(a.lead)))];
}

/**
 * The short form of clusterLabel, for a pin whose full name has no room: one place name, no state
 * or country ("Columbus", "Mountain View + 1 nearby", "Shanghai and 52 more"). Still honest: far
 * places are never "nearby".
 */
export function shortLabel(members) {
  if (!members?.length) return 'Unknown';
  const lead = members[0];
  if (members.length === 1) return shortPlace(lead);
  if (members.every((m) => distanceKm(m, lead) <= NEAR_KM)) return `${shortPlace(lead)} + ${members.length - 1} nearby`;
  return `${areaNames(members)[0] || shortPlace(lead)} and ${members.length - 1} more`;
}

/**
 * Where each pin's place name goes (offline: no basemap names). `items`: [{ pin, box?, full, short,
 * h, n }] with `pin` the pin's rect, `box` the name's measured rect below the pin (else made from
 * `full` (width) and `h` (height)), `short` the width of the short form, `n` the pin's count.
 * Biggest pin first, each name takes the first free spot: below, above, the short form below and
 * above, then beside the pin (right, left; full, then short). Below and above slide inward at the
 * map's edges. A spot is free when it is inside `host` and touches no pin but its own and no name
 * placed before. Returns, in input order, [{ where: 'below'|'above'|'right'|'left'|'hidden',
 * short, shift, box }]; a hidden name's pin is merged into its neighbour by the map.
 */
export function layoutLabels(items, host, { edge = 4, gapAbove = LABEL_GAP, gapBelow = 7, gapSide = 6 } = {}) {
  const hit = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  const out = new Array(items.length);
  const placed = [];
  const order = items.map((it, i) => i).sort((a, b) => (items[b].n || 0) - (items[a].n || 0) || a - b);
  for (const i of order) {
    const it = items[i];
    const pin = it.pin;
    const h = it.box ? it.box.bottom - it.box.top : it.h;
    const cx = it.box ? (it.box.left + it.box.right) / 2 : (pin.left + pin.right) / 2;
    const top0 = it.box ? it.box.top : pin.bottom + gapBelow;
    const cy = (pin.top + pin.bottom) / 2;
    const fullW = it.box ? it.box.right - it.box.left : it.full;
    const shortW = Math.min(fullW, it.short ?? fullW);
    const spots = [];
    for (const short of shortW < fullW ? [false, true] : [false]) {
      const w = short ? shortW : fullW;
      let left = cx - w / 2, shift = 0;
      if (left + w > host.right - edge) shift = host.right - edge - (left + w);
      if (left + shift < host.left + edge) shift = host.left + edge - left;
      left += shift;
      spots.push({ where: 'below', short, shift, box: { left, right: left + w, top: top0, bottom: top0 + h } });
      spots.push({ where: 'above', short, shift, box: { left, right: left + w, top: pin.top - gapAbove - h, bottom: pin.top - gapAbove } });
    }
    for (const short of shortW < fullW ? [false, true] : [false]) {
      const w = short ? shortW : fullW;
      const v = { top: cy - h / 2, bottom: cy + h / 2 };
      spots.push({ where: 'right', short, shift: 0, box: { left: pin.right + gapSide, right: pin.right + gapSide + w, ...v } });
      spots.push({ where: 'left', short, shift: 0, box: { left: pin.left - gapSide - w, right: pin.left - gapSide, ...v } });
    }
    // The hit test pads names by 2 px across and 1 px up and down, so names never touch.
    const pad = (b) => ({ left: b.left - 2, right: b.right + 2, top: b.top - 1, bottom: b.bottom + 1 });
    const inside = (b) => b.left >= host.left + edge - 0.5 && b.right <= host.right - edge + 0.5 && b.top >= host.top && b.bottom <= host.bottom;
    const free = (b) => inside(b) && !placed.some((p) => hit(p, pad(b))) && !items.some((o) => o !== it && hit(o.pin, pad(b)));
    const spot = spots.find((s) => free(s.box));
    if (spot) { placed.push(pad(spot.box)); out[i] = spot; } else out[i] = { where: 'hidden', short: false, shift: 0, box: spots[0].box };
  }
  return out;
}

const norm = s => String(s || '').trim().toLowerCase();

/**
 * The Juice entry for `job` at a place: the job.juice.byLocation[] entry whose
 * locationName matches one of the job's location names there (best score if
 * several), else job.juice.best when its locationName matches. Never borrows
 * another city's score (a London juice must not color the SF pin).
 */
export function juiceAt(job, names) {
  const j = job?.juice;
  if (!j || !names?.size) return null;
  let hit = null;
  for (const e of j.byLocation || []) {
    if (e && names.has(norm(e.locationName)) && Number.isFinite(e.score) && (!hit || e.score > hit.score)) hit = e;
  }
  if (!hit && j.best && names.has(norm(j.best.locationName)) && Number.isFinite(j.best.score)) hit = j.best;
  return hit;
}

/** Median juice over a cluster: { score, net, n (jobs with juice), grade } or null. */
function summarizeJuice(jobs, members, scale) {
  // Each job's place names in the cluster, in one pass over the members' entries (the same sets as
  // looking every job up in every member, which took 0.5 s at 4x CPU for Apple's world view).
  const namesOf = new Map();
  for (const m of members) {
    for (const [id, nms] of m.locNames) {
      let s = namesOf.get(id);
      if (!s) namesOf.set(id, (s = new Set()));
      for (const nm of nms) s.add(nm);
    }
  }
  const none = new Set();
  const scores = [], nets = [];
  for (const job of jobs) {
    const e = juiceAt(job, namesOf.get(job.id) || none);
    if (!e) continue;
    scores.push(e.score);
    if (Number.isFinite(e.net)) nets.push(e.net);
  }
  if (!scores.length) return null;
  const score = Math.round(median(scores));
  const net = nets.length ? median(nets) : (scale?.netForScore || juiceNetForScore)(score);
  return { score, net, n: scores.length, grade: juiceGrade(score, net, scale?.breaks) };
}

/**
 * Normalize a Juice scale: { netForScore(score), breaks: [ripeMin, juicyMin] }. Accepts the
 * server/juice.js module itself ({ netForScore, GRADES }) or a plain object.
 */
function toJuiceScale(src) {
  if (!src || typeof src.netForScore !== 'function') return null;
  let breaks = Array.isArray(src.breaks) ? src.breaks.slice(0, 2) : null;
  if (!breaks && Array.isArray(src.GRADES)) {
    const mins = src.GRADES.map(g => +g.min).filter(v => v > 0).sort((a, b) => a - b);
    if (mins.length >= 2) breaks = [mins[0], mins[mins.length - 1]];
  }
  if (!breaks || breaks.length < 2 || !breaks.every(Number.isFinite)) breaks = [...JUICE_BREAKS];
  return { netForScore: src.netForScore, breaks };
}

export function createMap(container, { onSelect, onAreaSelect, onColorModeChange, colorMode: initialMode, juiceScale, tiles: tileOpts } = {}) {
  const T = { ...OSM_TILES, ...(tileOpts || {}) };
  const darkUrl = typeof T.dark === 'string' && T.dark !== 'filter' ? T.dark : null;
  if (typeof L === 'undefined') throw new Error('melon-seek map: Leaflet global `L` not loaded');
  container.classList.add('ms-map');
  container.replaceChildren();
  const host = el('div', 'ms-map__canvas');
  container.append(host);

  const map = L.map(host, {
    zoomControl: true, worldCopyJump: true, minZoom: BASE_MIN_ZOOM, maxZoom: 16,
    zoomSnap: 0.5, attributionControl: true,
  }).setView([30, -20], 2);
  map.attributionControl.setPrefix(false);

  // Graticule below tiles: visible only when tiles are missing.
  map.createPane('ms-graticule').style.zIndex = 150;
  const gratLines = [];
  for (let lat = -60; lat <= 75; lat += 15) gratLines.push([[lat, -540], [lat, 540]]);
  for (let lng = -540; lng <= 540; lng += 15) gratLines.push([[-85, lng], [85, lng]]);
  L.polyline(gratLines, { pane: 'ms-graticule', interactive: false, className: 'ms-graticule-line', weight: 1, smoothFactor: 1 }).addTo(map);

  let tileErrors = 0, tileOk = 0, probe = 'idle'; // probe: idle | pending | ok | bad
  const urlFor = dark => (dark && darkUrl ? darkUrl : T.url);
  const tiles = L.tileLayer(urlFor(isDark()), {
    maxZoom: T.maxZoom ?? 19,
    attribution: T.attribution,
    ...(T.subdomains ? { subdomains: T.subdomains } : {}),
    detectRetina: false,
    crossOrigin: true,                          // lets the one-off status probe below read the response
    referrerPolicy: 'strict-origin-when-cross-origin', // OSM requires a Referer
    keepBuffer: 1,                              // no extra prefetching beyond Leaflet's minimum
  });
  const setOffline = on => {
    if (container.classList.contains('ms-map--offline') === on) return;
    container.classList.toggle('ms-map--offline', on);
    if (places.length) draw(); // labels change pin footprint -> recluster
  };
  const applyDark = dark => container.classList.toggle('ms-map--dark', !!dark && !darkUrl && T.dark === 'filter');
  applyDark(isDark());
  tiles.on('tileerror', () => { tileErrors++; if (!tileOk) setOffline(true); });
  // A tile can "load" while being an error image (for example "API key required" or
  // "Access blocked", served with a 4xx status). Check the first loaded tile's HTTP
  // status once, re-reading it from the HTTP cache, before trusting tileload.
  tiles.on('tileload', e => {
    if (probe === 'bad') return;
    if (probe === 'ok') { tileOk++; setOffline(false); return; }
    if (probe === 'pending') return;
    probe = 'pending';
    const src = e.tile?.src;
    const done = ok => {
      probe = ok ? 'ok' : 'bad';
      container.classList.toggle('ms-map--tiles-bad', !ok);
      if (ok) { tileOk++; setOffline(false); } else setOffline(true);
    };
    if (!src || typeof fetch !== 'function') { done(true); return; }
    fetch(src, { mode: 'cors', cache: 'force-cache', credentials: 'omit', referrerPolicy: 'strict-origin-when-cross-origin' })
      .then(r => done(r.ok))
      .catch(() => done(true)); // CORS or network quirk: the <img> loaded, so trust it
  });
  tiles.addTo(map);
  // If nothing loads at all (blocked silently), treat as offline after a moment.
  const offlineTimer = setTimeout(() => { if (!tileOk) setOffline(true); }, 4000);

  // Remote control
  const RemoteControl = L.Control.extend({
    options: { position: 'bottomleft' },
    onAdd() {
      const b = L.DomUtil.create('button', 'ms-remote');
      b.type = 'button';
      L.DomEvent.disableClickPropagation(b);
      L.DomEvent.on(b, 'click', () => { if (remoteJobs.length) onAreaSelect?.(remoteJobs, 'Remote'); });
      return b;
    },
  });
  const remoteCtl = new RemoteControl().addTo(map);
  const remoteBtn = remoteCtl.getContainer();
  // V-44 (fix-viz-5): postings that list no place are on no pin and not in Remote; the map says how many (one line,
  // above the Remote button), so none goes uncounted. They are in the list and on the chart.
  const UnplacedControl = L.Control.extend({
    options: { position: 'bottomleft' },
    onAdd() { const d = L.DomUtil.create('div', 'ms-map__unplaced'); d.hidden = true; return d; },
  });
  const unplacedEl = new UnplacedControl().addTo(map).getContainer();
  let unplaced = 0;
  function drawUnplaced() {
    unplacedEl.hidden = !unplaced;
    const long = unplaced ? `${plural(unplaced, 'posting')} ${unplaced === 1 ? 'lists' : 'list'} no place, so not on the map` : '';
    // fix-app-6 (fix-ui-6's Razr cover screen, 352x355: the map is about 123 px tall): the long line covered the pins, so a
    // short map gets the short one; the whole sentence stays in its title.
    const short = unplaced && container.getBoundingClientRect().height < 220;
    unplacedEl.textContent = short ? `${shortCount(unplaced)} with no place` : long;
    unplacedEl.title = long;
  }
  map.on('resize', () => { if (unplaced) drawUnplaced(); });

  // "Pay | Juice" segmented control (+ the Juice legend when active)
  let colorMode = COLOR_MODES.includes(initialMode) ? initialMode : 'pay';
  const ModeControl = L.Control.extend({
    options: { position: 'topright' },
    onAdd() {
      const box = L.DomUtil.create('div', 'ms-modes');
      L.DomEvent.disableClickPropagation(box);
      L.DomEvent.disableScrollPropagation(box);
      const seg = L.DomUtil.create('div', 'ms-modes__seg', box);
      seg.setAttribute('role', 'radiogroup');
      seg.setAttribute('aria-label', 'Pin color');
      for (const [mode, label, hint] of [['pay', 'Pay', 'Colour pins by median salary'], ['juice', 'Juice', 'Colour pins by median Juice: the money left a year after tax, rent and living costs']]) {
        const b = L.DomUtil.create('button', 'ms-modes__btn', seg);
        b.type = 'button';
        b.dataset.mode = mode;
        b.textContent = label;
        b.title = hint;
        b.setAttribute('role', 'radio');
        L.DomEvent.on(b, 'click', () => setColorMode(mode, true));
        L.DomEvent.on(b, 'keydown', e => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            L.DomEvent.preventDefault(e);
            const next = colorMode === 'pay' ? 'juice' : 'pay';
            setColorMode(next, true);
            seg.querySelector(`[data-mode="${next}"]`)?.focus();
          }
        });
      }
      const legend = L.DomUtil.create('div', 'ms-modes__legend', box);
      legend.setAttribute('aria-label', 'Juice Score legend');
      // V-16 / MR-13: the Pay legend (one fixed dollar scale), shown in Pay mode.
      const payLegend = L.DomUtil.create('div', 'ms-modes__pay', box);
      payLegend.setAttribute('role', 'group');
      payLegend.setAttribute('aria-label', 'Pay legend');
      return box;
    },
  });
  const modeBox = new ModeControl().addTo(map).getContainer();
  // Juice scale (grade breaks + netForScore for the legend $ labels). Prefer the live
  // server/juice.js module (served at /lib/juice.js, bundled as dist/lib/juice.js) so a
  // re-tuned SCORE_ANCHORS / GRADES updates the legend and pin steps with no viz change.
  let jScale = toJuiceScale(juiceScale) || { netForScore: juiceNetForScore, breaks: [...JUICE_BREAKS] };
  let juiceNote = ''; // "As of: rent … · FX … · tax …" for the scores shown (app.js, public/features/freshness.js)
  function renderJuiceLegend() {
    const legend = modeBox.querySelector('.ms-modes__legend');
    if (!legend) return;
    legend.replaceChildren();
    const [b1, b2] = jScale.breaks;
    const nf = s => formatMoney(juiceCutoff(s, jScale.netForScore)); // UX-45: the list's and the drawer's cut-offs
    // I-10: each grade has its own fill (outline, tint, solid), the same as the pins, so the
    // grades read without telling shades of red apart; the dollars are the money left a year.
    for (const [grade, scoreTxt, range] of [
      ['Dry', `< ${b1}`, `under ${nf(b1)}`],
      ['Ripe', `${b1}–${b2 - 1}`, `${nf(b1)}–${nf(b2)}`],
      ['Juicy', `${b2}+`, `${nf(b2)} or more`],
    ]) {
      const row = L.DomUtil.create('div', 'ms-modes__key', legend);
      const sw = L.DomUtil.create('span', 'ms-modes__sw', row);
      sw.dataset.grade = grade;
      sw.dataset.fill = GRADE_FILL[grade];
      L.DomUtil.create('span', 'ms-modes__grade', row).textContent = `${grade} ${scoreTxt}`;
      const net = L.DomUtil.create('span', 'ms-modes__net', row);
      net.append(range, el('span', 'ms-modes__unit', ' left a year')); // phones: the dollars only
    }
    // V-28: the no-data pins are gray (viz.css), as this line and its swatch say.
    // fix-density: one line, and the data's dates ("As of: rent May–Sep 2026 · …") behind "Details".
    const none = L.DomUtil.create('div', 'ms-modes__none ms-modes__juicenote', legend);
    const asOf = String(juiceNote || '').replace(/^As of:\s*/i, '').split(/\s+·\s+/).filter(Boolean);
    renderNote(none, {
      line: [el('span', 'ms-modes__sw ms-modes__sw--none'), 'Gray: no Juice data'],
      details: asOf.length ? [`Data as of: ${asOf.join(', ')}`] : [],
      key: 'map-juice',
    });
  }
  /**
   * V-16 / MR-13: what a Pay pin's colour and figures are. Five fixed steps of approx US dollars
   * (palette.js PAY_BREAKS), then one line: median posted base pay, the exchange rates' month
   * (linked to the methodology, MR-2) and what the small number is.
   */
  function renderPayLegend() {
    const box = modeBox.querySelector('.ms-modes__pay');
    if (!box) return;
    box.replaceChildren();
    // Five equal chips; the dollar breaks sit under the edges between them.
    const steps = paySteps();
    const scale = el('div', 'ms-modes__scale');
    const marks = el('div', 'ms-modes__marks');
    marks.setAttribute('aria-hidden', 'true');
    steps.forEach((st, i) => {
      const sw = el('span', 'ms-modes__chip');
      sw.style.background = st.color;
      sw.title = st.lo == null ? `Median under ${formatMoney(st.hi)}` : st.hi == null ? `Median ${formatMoney(st.lo)} or more` : `Median ${formatMoney(st.lo)} to ${formatMoney(st.hi)}`;
      sw.setAttribute('role', 'img');
      sw.setAttribute('aria-label', sw.title);
      scale.append(sw);
      if (st.hi != null) { // "$100K"; phones drop the "$" so the four breaks fit (viz.css)
        const m = el('span', 'ms-modes__mark');
        m.append(el('span', 'ms-modes__cur', '$'), formatMoney(st.hi).replace(/^\$/, ''));
        m.style.left = `${((i + 1) / steps.length) * 100}%`;
        marks.append(m);
      }
    });
    scale.append(marks);
    // fix-density: the legend says what the colour is in a few words; what the small number is, the
    // exchange rates' month (MR-2) and the pin's minimum are behind "Details".
    const what = el('div', 'ms-modes__none ms-modes__paywhat');
    const a = el('a', 'ms-modes__fx', `${fxMonth(FX_AS_OF)} exchange rates`);
    a.href = FX_DOC;
    a.title = `Fixed rates as of ${fxMonth(FX_AS_OF)}: ${FX_SOURCE_SHORT}`;
    renderNote(what, {
      line: [el('span', 'ms-modes__long', 'Median base pay a year'), el('span', 'ms-modes__short', 'Median pay')],
      details: [
        'Colour: the median posted base pay a year, in approx US dollars',
        'Figure: that median in the currency its postings are paid in (CA$, €, £), as the cards show pay', // BN-2
        ['Other currencies converted at ', a],
        'Small number: postings; "5 of 434" when the median rests on under a quarter of them (the rest post no pay, or pay for other places)',
        `A pin shows a median only when ${MIN_PIN_PAY} or more of its postings post pay for its places`,
      ],
      key: 'map-pay',
    });
    box.append(scale, what);
  }
  function setJuiceScale(src) {
    const sc = toJuiceScale(src);
    if (!sc) return false;
    jScale = sc;
    renderJuiceLegend();
    paintModeControl();
    if (places.length) draw();
    return true;
  }
  if (!juiceScale) {
    import(new URL('../lib/juice.js', import.meta.url).href)
      .then(mod => { if (!destroyed) setJuiceScale(mod); })
      .catch(() => { /* no juice.js here (e.g. the viz demo): keep the palette mirror */ });
  }
  let destroyed = false;
  // V-26: which places the gazetteer only knows by their state or country (server/geo.js
  // locationPrecision 'centroid', served as lib/geo.js): their pins say they are approximate.
  let precisionOf = null;
  import(new URL('../lib/geo.js', import.meta.url).href)
    .then(mod => { if (!destroyed && typeof mod.locationPrecision === 'function') { precisionOf = mod.locationPrecision; if (places.length) draw(); } })
    .catch(() => { /* no geo.js here (the viz demo): no approximate marks */ });
  const isApprox = (m) => {
    if (!precisionOf || !m.loc) return false;
    if (m.approx == null) { try { m.approx = isApproxPrecision(precisionOf(m.loc)); } catch { m.approx = false; } } // V-45
    return m.approx;
  };

  function paintModeControl() {
    for (const b of modeBox.querySelectorAll('.ms-modes__btn')) {
      const on = b.dataset.mode === colorMode;
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
      b.classList.toggle('is-on', on);
    }
    modeBox.classList.toggle('ms-modes--juice', colorMode === 'juice');
    modeBox.classList.toggle('ms-modes--pay', colorMode === 'pay');
    for (const sw of modeBox.querySelectorAll('.ms-modes__sw')) sw.style.setProperty('--pin-hue', juiceHue());
  }
  function setColorMode(mode, fromUser) {
    if (!COLOR_MODES.includes(mode) || mode === colorMode) return;
    colorMode = mode;
    container.classList.toggle('ms-map--juice', mode === 'juice');
    paintModeControl();
    if (places.length) draw();
    if (fromUser) onColorModeChange?.(mode);
  }
  container.classList.toggle('ms-map--juice', colorMode === 'juice');
  renderJuiceLegend();
  renderPayLegend();
  paintModeControl();

  // Offline note control
  const NoteControl = L.Control.extend({
    options: { position: 'topright' },
    onAdd() { const d = L.DomUtil.create('div', 'ms-map__offline-note'); d.textContent = 'Basemap unavailable · pins still work'; return d; },
  });
  new NoteControl().addTo(map);

  const markerLayer = L.layerGroup().addTo(map);
  let mergeCovered = false; // fix-viz-5: after a fit, pins still under a control join their neighbour (clearOfControls)
  let places = [];
  let remoteJobs = [];
  let remotePaid = new Set();
  let remotePriceOf = null;
  let clusters = [];
  let highlighted = null;
  let lastSig = null;
  let pendingFit = false;
  let first = true;

  /**
   * Greedy screen-space clusters at the current zoom. `joins` (lead place key -> the lead place key
   * of the cluster it joins) folds a cluster whose name found no room into its neighbour (draw);
   * `cache` (members -> summary) keeps the summaries of the clusters a merge pass did not change.
   */
  function cluster(joins = null, cache = null) {
    const zoom = map.getZoom();
    const pts = places
      .map(p => ({ p, pt: map.project([p.lat, p.lng], zoom) }))
      .sort((a, b) => b.p.jobs.length - a.p.jobs.length);
    const ch = container.classList.contains('ms-map--offline') ? CLUSTER_H + 16 : CLUSTER_H;
    let out = [];
    for (const { p, pt } of pts) {
      let target = null;
      for (const c of out) {
        if (Math.abs(c.pt.x - pt.x) < CLUSTER_W && Math.abs(c.pt.y - pt.y) < ch) { target = c; break; }
      }
      if (target) target.members.push(p);
      else out.push({ pt, members: [p], lead: p });
    }
    if (joins?.size) {
      const root = (k) => { for (let i = 0; i < 64 && joins.has(k); i++) k = joins.get(k); return k; };
      const groups = new Map();
      for (const c of out) if (root(c.lead.key) === c.lead.key) groups.set(c.lead.key, { ...c, members: [...c.members] });
      for (const c of out) {
        const r = root(c.lead.key);
        if (r === c.lead.key) continue;
        const g = groups.get(r);
        if (g) g.members.push(...c.members); else groups.set(c.lead.key, { ...c, members: [...c.members] });
      }
      out = [...groups.values()];
    }
    return out.map(c => {
      // A merge pass (draw) re-summarizes only the clusters it changed: same members, same summary.
      const sig = c.members.length === 1 ? c.lead.key : c.members.map(m => m.key).join(';');
      const hit = cache?.get(sig);
      if (hit) return { ...hit, pt: c.pt, marker: null, pinEl: null };
      const ids = new Set();
      const jobs = [];
      const paid = new Set();
      const also = new Set(), wide = new Set(), ownHere = new Set();
      // V-39 (fix-pay-at-place): each posting at the pay posted for its places in this pin (payAt).
      let priceOf = c.members.length === 1 ? c.members[0].priceOf : null;
      const locsAt = priceOf ? null : new Map();
      for (const m of c.members) {
        for (const j of m.jobs) if (!ids.has(j.id)) { ids.add(j.id); jobs.push(j); }
        for (const id of m.paid || []) paid.add(id);
        for (const id of m.also || []) also.add(id);
        for (const id of m.wide || []) wide.add(id);
        for (const j of m.jobs) if (!m.wide?.has(j.id)) ownHere.add(j.id); // BN-1: listed at one of the cluster's places
        if (locsAt) for (const [id, ls] of m.locsAt || []) { const all = locsAt.get(id); if (all) { for (const l of ls) if (!all.includes(l)) all.push(l); } else locsAt.set(id, ls.slice()); }
      }
      if (!priceOf) priceOf = pricer((j) => locsAt.get(j.id));
      for (const id of ownHere) wide.delete(id);
      const label = clusterLabel(c.members);
      const res = {
        lat: c.lead.lat, lng: c.lead.lng, pt: c.pt, members: c.members, jobs, ids, label, short: shortLabel(c.members), also: also.size, wide: wide.size,
        approx: c.members.filter(isApprox),
        ...summarize(jobs, paid, priceOf), juice: summarizeJuice(jobs, c.members, jScale),
      };
      cache?.set(sig, res);
      return res;
    });
  }

  /**
   * Under a Location filter: how many of a pin's roles also list a place the filter leaves out, and
   * how many list only a country or state that takes the place in (aggregate `also`, `wide`).
   */
  function filterLines(c) {
    const out = [];
    if (c.also) out.push(`${c.also.toLocaleString()} of these ${c.also === 1 ? 'is' : 'are'} also listed in other places, not shown with this location filter`);
    if (c.wide) out.push(`${c.wide.toLocaleString()} ${c.wide === 1 ? 'lists' : 'list'} only a country or state, not a city`);
    return out;
  }

  function tooltipContent(c) {
    const root = el('div', 'ms-map-tip__inner');
    if (colorMode === 'juice') {
      const J = c.juice;
      root.append(el('div', 'ms-tip__value', J ? `🍉 ${J.score} · ${J.grade}` : 'No Juice data'));
      root.append(el('div', 'ms-tip__sub', J
        ? `median ${formatMoney(J.net)}/yr left after rent, tax and living costs`
        : 'Juice needs a published salary and a known city'));
      root.append(el('div', 'ms-tip__title', c.label));
      root.append(el('div', 'ms-tip__meta', `${plural(c.n, 'posting')} · ${(J?.n || 0).toLocaleString()} with Juice${c.median != null ? ` · pay median ${pinPrice(c)}` : ''}`));
      for (const t of filterLines(c)) root.append(el('div', 'ms-tip__meta', t));
    } else {
      const priced = hasPrice(c);
      root.append(el('div', 'ms-tip__value', priced ? `${pinPrice(c)} median` : jobsText(c.n)));
      root.append(el('div', 'ms-tip__title', c.label));
      root.append(el('div', 'ms-tip__meta', priced
        ? `${plural(c.n, 'posting')} · ${c.salaried.toLocaleString()} with salary for here`
        : c.few
          ? `${plural(c.n, 'posting')} · ${c.salaried.toLocaleString()} with salary for here (${(c.onlyText || c.only.map((v) => formatMoney(v))).join(', ')}), too few for a median`
          : `${plural(c.n, 'posting')} · ${c.elsewhere ? 'no pay posted for here' : 'no pay listed'}`)); // UX-61: the cards' words
      const based = c.based ?? c.salaried;
      if (priced && based < c.n) root.append(el('div', 'ms-tip__meta', `The median is of ${based.toLocaleString()} (${Math.max(1, Math.round((100 * based) / c.n))}%), not of all ${c.n.toLocaleString()}`));
      if (priced && c.notBaseLeft) root.append(el('div', 'ms-tip__meta', `${plural(c.notBaseLeft, 'posting')} with a stated minimum, top shift pay or part-time pay left out of the median`)); // MR-28
      if (c.elsewhere) root.append(el('div', 'ms-tip__meta', `${plural(c.elsewhere, 'posting')} ${c.elsewhere === 1 ? 'lists' : 'list'} pay for another country only, so not in the median`));
      if (c.fx && (priced || c.few)) root.append(el('div', 'ms-tip__meta', `Pay in other currencies converted at ${fxMonth(FX_AS_OF)} exchange rates`)); // MR-2
      for (const t of filterLines(c)) root.append(el('div', 'ms-tip__meta', t));
    }
    // V-26: a place the gazetteer only knows by its state or country is pinned at that centre.
    if (c.approx?.length) root.append(el('div', 'ms-tip__meta', c.members.length === 1
      ? `Approximate: pinned at the centre of ${c.approx[0].region ? 'its state or region' : 'its country'}, not at the town itself`
      : `${c.approx.length === 1 ? '1 of these places is' : `${c.approx.length} of these places are`} approximate: pinned at the centre of ${c.approx.length === 1 ? 'its' : 'their'} state or country`));
    const counts = new Map();
    for (const j of c.jobs) counts.set(j.title, (counts.get(j.title) || 0) + 1);
    const top = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const list = el('ul', 'ms-tip__roles');
    for (const [t, n] of top.slice(0, 4)) {
      const li = el('li');
      li.append(el('span', 'ms-tip__role', t), el('span', 'ms-tip__n', n > 1 ? `×${n}` : ''));
      list.append(li);
    }
    root.append(list);
    if (top.length > 4) root.append(el('div', 'ms-tip__meta', `+${top.length - 4} more roles`));
    return root;
  }

  /** One melon hue for every grade (the Juicy step); the fill level tells the grades apart. */
  function juiceHue() { return juiceColor(jScale.breaks[1], jScale.breaks); }

  /** V-17: the pin shows a price only when its median rests on MIN_PIN_PAY or more postings. */
  const hasPrice = (c) => c.median != null && !c.few;
  function pinElement(c) {
    const pin = el('div', 'ms-pin');
    if (colorMode === 'juice') {
      const J = c.juice;
      if (J) {
        const hue = juiceHue();
        pin.dataset.grade = J.grade;
        pin.dataset.fill = GRADE_FILL[J.grade] || 'none';
        pin.style.setProperty('--pin-hue', hue);
        if (pin.dataset.fill === 'full') {
          pin.style.setProperty('--pin-bg', hue);
          pin.style.setProperty('--pin-fg', inkOn(hue));
        }
        pin.classList.add('ms-pin--juice');
      } else {
        pin.classList.add('ms-pin--nosalary', 'ms-pin--juice');
      }
      pin.append(el('span', 'ms-pin__price', J ? `🍉 ${J.score}` : '🍉 –'));
      if (c.n > 1) pin.append(el('span', 'ms-pin__count', shortCount(c.n)));
      pin.append(el('span', 'ms-pin__label', c.label));
      return pin;
    }
    if (hasPrice(c)) {
      const bg = payColor(c.median); // V-16: one fixed dollar scale (palette.js PAY_BREAKS), not the pins on screen
      pin.style.setProperty('--pin-bg', bg);
      pin.style.setProperty('--pin-fg', inkOn(bg));
      pin.append(el('span', 'ms-pin__price', pinPrice(c)));
      // V-43 (fix-viz-5): "5 of 434" when the median rests on few of the pin's postings.
      const count = pinCountText(c);
      if (count) pin.append(el('span', /\bof\b/.test(count) ? 'ms-pin__count ms-pin__count--of' : 'ms-pin__count', count));
    } else {
      pin.classList.add('ms-pin--nosalary');
      pin.append(el('span', 'ms-pin__price', c.wide ? `${pinCount(c)} jobs` : jobsText(c.n))); // "1.1K jobs", like the "4.5K" counts
    }
    pin.append(el('span', 'ms-pin__label', c.label));
    return pin;
  }

  function pinName(c) {
    if (colorMode === 'juice') {
      const J = c.juice;
      return `${c.label}: ${plural(c.n, 'posting')}, ${J ? `Juice ${J.score}, ${J.grade}, median ${formatMoney(J.net)} a year left` : 'no Juice data'}`;
    }
    const approx = c.approx?.length ? (c.members.length === 1 ? ', approximate place' : `, ${c.approx.length} approximate ${c.approx.length === 1 ? 'place' : 'places'}`) : '';
    const based = c.based ?? c.salaried;
    const pay = hasPrice(c)
      ? `, median ${pinPrice(c)}${based < c.n ? ` from ${based.toLocaleString()} with pay for here` : ''}${based < c.n * MIN_PIN_SHARE ? ` (${Math.round((100 * based) / c.n)}% of them)` : ''}`
      : c.few ? `, ${c.salaried.toLocaleString()} with pay for here, too few for a median` : c.elsewhere ? ', no pay posted for here' : ', no pay listed';
    const wide = c.wide ? `, ${c.wide.toLocaleString()} of them listed only for its country or state` : ''; // BN-1
    return `${c.label}: ${plural(c.n, 'posting')}${wide}${pay}${approx}`;
  }

  function draw() {
    // Keep keyboard focus on "the same" pin across re-clustering (zoom, activation fly-to):
    // remember a place key of the focused cluster and refocus whichever new cluster contains it.
    const focused = clusters.find(c => c.marker?.getElement() && c.marker.getElement() === document.activeElement);
    const focusedKeys = focused ? new Set(focused.members.map(p => p.key)) : null;
    const focusedLead = focused?.members[0]?.key; // members[0] is the cluster's lead place
    // Every pin keeps its place name: a pin whose name finds no room (placeLabels) is merged into
    // its nearest neighbour, and the clusters are drawn again (offline only; a few passes at most).
    const joins = new Map(), cache = new Map();
    let refocus = null;
    for (let pass = 0; ; pass++) {
      markerLayer.clearLayers();
      clusters = cluster(joins, cache);
      refocus = drawMarkers(focusedKeys, focusedLead);
      const hidden = placeLabels();
      if (mergeCovered) for (const c of coveredClusters()) if (!hidden.includes(c)) hidden.push(c);
      if (!hidden.length || pass >= MERGE_PASSES || clusters.length < 2) break;
      mergeInto(hidden, joins);
    }
    refocus?.focus({ preventScroll: true });
    applyHighlight();
  }

  /** Fold each pin in `hidden` (smallest first) into its nearest pin on screen (cluster joins). */
  function mergeInto(hidden, joins) {
    const gone = new Set();
    for (const h of hidden.slice().sort((a, b) => a.n - b.n)) {
      const hk = h.members[0].key;
      if (gone.has(hk)) continue;
      let best = null, bd = Infinity;
      for (const t of clusters) {
        const tk = t.members[0].key;
        if (t === h || gone.has(tk) || t.off) continue; // D-31: never into a pin off the map
        const d = (t.pt.x - h.pt.x) ** 2 + (t.pt.y - h.pt.y) ** 2;
        if (d < bd) { bd = d; best = t; }
      }
      if (best) { joins.set(hk, best.members[0].key); gone.add(hk); }
    }
  }

  /**
   * fix-touch-tips: the open tooltip inside the map (it ran 216 px off a 390 px phone): beside its pin near a side
   * when it fits there, else above the pin (below it near the top), slid sideways to stay 8 px inside. A slid
   * tooltip hides its arrow, which would point past the pin. Re-run when the map moves under an open tooltip.
   */
  let tipMarker = null;
  function fitTooltip(m) {
    const t = m.getTooltip?.(), node = t?.getElement?.();
    if (!t || !node || !m.isTooltipOpen()) return;
    const pt = map.latLngToContainerPoint(m.getLatLng()), size = map.getSize();
    const pad = 8;
    // The part of the map on screen, in the map's own px (a short landscape screen scrolls part of it away).
    const box = map.getContainer().getBoundingClientRect();
    const v = { l: Math.max(0, -box.left), r: Math.min(size.x, innerWidth - box.left), t: Math.max(0, -box.top), b: Math.min(size.y, innerHeight - box.top) };
    // A small map (a 280 px phone, the Razr's 352x355 cover screen) gets a tooltip no bigger than that part; the
    // lines that do not fit are cut at the bottom (the figures come first).
    node.style.maxWidth = `${Math.max(120, v.r - v.l - 2 * pad)}px`;
    node.style.maxHeight = `${Math.max(60, v.b - v.t - 2 * pad)}px`;
    node.style.overflow = 'hidden';
    const w = node.offsetWidth, h = node.offsetHeight;
    const fitsY = (top) => top >= v.t + pad && top + h <= v.b - pad;
    let dir, off;
    if (pt.x - v.l < 160 && pt.x + 60 + w <= v.r - pad && fitsY(pt.y - 18 - h / 2)) { dir = 'right'; off = [54, -18]; }
    else if (v.r - pt.x < 160 && pt.x - 60 - w >= v.l + pad && fitsY(pt.y - 18 - h / 2)) { dir = 'left'; off = [-54, -18]; }
    else {
      const half = w / 2;
      const dx = w + 2 * pad >= v.r - v.l ? (v.l + v.r) / 2 - pt.x : Math.min(Math.max(0, v.l + pad + half - pt.x), v.r - pad - half - pt.x);
      // Above the pin (its top edge is 42 px over the point, with Leaflet's margin), else below it (12 px under);
      // with room for neither, below it, slid up to stay inside the map.
      if (pt.y - 42 - h >= v.t + pad) { dir = 'top'; off = [Math.round(dx), -36]; }
      else {
        dir = 'bottom';
        const top = Math.max(v.t + pad, Math.min(v.b - pad - h, pt.y + 12));
        off = [Math.round(dx), Math.round(top - pt.y - 6)];
      }
    }
    node.classList.toggle('ms-map-tip--slid', (dir === 'top' || dir === 'bottom') && (Math.abs(off[0]) > 4 || (dir === 'bottom' && off[1] !== 6)));
    const o = L.point(t.options.offset || [0, 0]);
    if (t.options.direction !== dir || o.x !== off[0] || o.y !== off[1]) { t.options.direction = dir; t.options.offset = L.point(off); t.update(); }
  }
  map.on('moveend zoomend', () => { if (tipMarker) fitTooltip(tipMarker); });

  /** One marker per cluster; returns the pin to refocus (see draw). */
  function drawMarkers(focusedKeys, focusedLead) {
    let refocus = null;
    // Draw small clusters first so big ones sit on top.
    const order = clusters.slice().sort((a, b) => a.n - b.n);
    order.forEach((c, i) => {
      const pinEl = pinElement(c);
      pinEl.setAttribute('aria-hidden', 'true'); // name comes from the button's aria-label
      c.pinEl = pinEl;
      const icon = L.divIcon({ className: 'ms-pin-icon', html: pinEl, iconSize: [0, 0], iconAnchor: [0, 0] });
      const m = L.marker([c.lat, c.lng], { icon, keyboard: true, title: '', riseOnHover: false, zIndexOffset: i });
      c.marker = m;
      m.bindTooltip(() => tooltipContent(c), { direction: 'top', offset: [0, -36], className: 'ms-map-tip', opacity: 1 });
      // fix-touch-tips: a pin's tooltip is for a mouse or the keyboard. A tap selects the place at once (the list
      // then shows its roles), so a tap never opens it: Leaflet opens it on click, focus and mouseover (which a
      // phone emulates after a tap), all through the marker's openTooltip. Once open, it is kept inside the map.
      const openTip = m.openTooltip;
      m.openTooltip = function (...args) { return isTouchInput() ? this : openTip.apply(this, args); };
      m.on('tooltipopen', () => { tipMarker = m; fitTooltip(m); });
      m.on('tooltipclose', () => { if (tipMarker === m) tipMarker = null; });
      m.on('mouseover', () => { m.setZIndexOffset(100000); pinEl.classList.add('is-hover'); });
      m.on('mouseout', () => { m.setZIndexOffset(i); pinEl.classList.remove('is-hover'); });
      const activate = () => {
        onAreaSelect?.(c.jobs, c.label);
        if (c.jobs.length === 1) onSelect?.(c.jobs[0]);
        const animate = !prefersReducedMotion();
        if (c.members.length > 1) {
          const b = L.latLngBounds(c.members.map(p => [p.lat, p.lng])).pad(0.3);
          if (animate) map.flyToBounds(b, { maxZoom: 12, duration: 0.6 });
          else map.fitBounds(b, { maxZoom: 12, animate: false });
        } else {
          const z = Math.min(12, Math.max(map.getZoom() + 2, 9));
          if (z > map.getZoom()) {
            if (animate) map.flyTo([c.lat, c.lng], z, { duration: 0.6 });
            else map.setView([c.lat, c.lng], z, { animate: false });
          }
        }
      };
      m.on('click', activate);
      m.on('keydown', e => {
        const k = e.originalEvent.key;
        if (k === 'Enter' || k === ' ' || k === 'Spacebar') { e.originalEvent.preventDefault(); activate(); }
      });
      m.addTo(markerLayer);
      const iconEl = m.getElement();
      iconEl?.setAttribute('aria-label', pinName(c));
      if (focusedKeys && iconEl) {
        // Prefer the cluster holding the old lead place; else any cluster sharing a member.
        if (c.members.some(p => p.key === focusedLead)) refocus = iconEl;
        else if (!refocus && c.members.some(p => focusedKeys.has(p.key))) refocus = iconEl;
      }
    });
    return refocus;
  }

  /**
   * P-6: offline, place names show under the pins. Biggest cluster first, each name takes the first
   * free spot (layoutLabels): below its pin, above it, the short form ("Shanghai and 52 more")
   * below or above, then beside the pin; a name near the map's left or right edge slides inward.
   * Returns the clusters whose name found no room anywhere (draw merges them into a neighbour).
   * One read of every box, then the writes, so it costs one layout per pass.
   */
  function placeLabels() {
    if (!container.classList.contains('ms-map--offline')) return [];
    const host = container.getBoundingClientRect();
    if (!host.width || !host.height) return []; // hidden: placed again when it gets a size
    const items = [];
    for (const c of clusters) {
      const lab = c.pinEl?.querySelector('.ms-pin__label');
      if (!lab || !c.pinEl.isConnected) continue;
      lab.classList.remove('ms-pin__label--hidden', 'ms-pin__label--above', 'ms-pin__label--right', 'ms-pin__label--left');
      lab.style.marginLeft = '';
      if (lab.textContent !== c.label) lab.textContent = c.label;
      items.push({ c, lab, n: c.n });
    }
    if (!items.length) return [];
    const font = getComputedStyle(items[0].lab).font;
    for (const it of items) {
      it.pin = it.c.pinEl.getBoundingClientRect();
      it.box = it.lab.getBoundingClientRect();
      // V-24 / D-31: a pin off the map has no name on it, and is never merged for want of room.
      it.off = it.pin.right <= host.left || it.pin.left >= host.right || it.pin.bottom <= host.top || it.pin.top >= host.bottom;
      // The short form's width: its text width plus the name's own padding (measured on the full form).
      const extra = (it.box.right - it.box.left) - textWidth(it.c.label, font);
      it.short = it.c.short && it.c.short !== it.c.label ? textWidth(it.c.short, font) + extra : it.box.right - it.box.left;
    }
    for (const it of items) { it.c.off = it.off; if (it.off) it.lab.classList.add('ms-pin__label--hidden'); }
    const on = items.filter((it) => !it.off);
    const spots = layoutLabels(on, host);
    const hidden = [];
    on.forEach((it, i) => {
      const s = spots[i];
      if (s.where === 'hidden') { it.lab.classList.add('ms-pin__label--hidden'); hidden.push(it.c); return; }
      if (s.short) it.lab.textContent = it.c.short;
      if (s.where !== 'below') it.lab.classList.add(`ms-pin__label--${s.where}`);
      if (s.shift) it.lab.style.marginLeft = `${Math.round(s.shift)}px`;
    });
    return hidden;
  }

  function drawRemote() {
    remoteBtn.replaceChildren();
    remoteBtn.hidden = !remoteJobs.length;
    if (!remoteJobs.length) return;
    const s = summarize(remoteJobs, remotePaid, remotePriceOf);
    remoteBtn.append(el('span', 'ms-remote__icon', '🌐'), el('span', 'ms-remote__label', 'Remote'),
      el('span', 'ms-remote__n', s.n.toLocaleString()));
    if (s.median != null) remoteBtn.append(el('span', 'ms-remote__price', pinPrice(s)));
    remoteBtn.title = `${plural(s.n, 'remote posting')}${s.median != null ? ` · median ${pinPrice(s)}` : ''} — show list`;
    remoteBtn.setAttribute('aria-label', remoteBtn.title);
  }

  function applyHighlight() {
    for (const c of clusters) c.pinEl?.classList.toggle('is-pulse', highlighted != null && c.ids.has(highlighted));
    remoteBtn.classList.toggle('is-pulse', highlighted != null && remoteJobs.some(j => j.id === highlighted));
  }

  // Initial fit so every price pin is fully visible. Pins are ~70–90px wide pills
  // centred on their point and ~31px tall above it, so pad by about half a pin
  // horizontally, add the pin height on top, and lower minZoom when needed so a
  // board spanning SF–London–Tokyo still fits a narrow column. A hidden (0×0)
  // container defers the fit until it gets a size (ResizeObserver/invalidateSize).
  function fitToData() {
    const size = map.getSize();
    if (!size.x || !size.y) { pendingFit = true; return; }
    pendingFit = false;
    fitFresh = true;
    mergeCovered = false;
    const pts = places.map(p => [p.lat, p.lng]);
    if (!pts.length) { map.setView([30, -20], BASE_MIN_ZOOM, { animate: false }); return; }
    if (pts.length === 1) { map.setView(pts[0], 10, { animate: false }); return; }
    const bounds = L.latLngBounds(pts);
    const padX = Math.round(Math.min(90, size.x / 6));
    const padY = Math.round(Math.min(48, size.y / 8));
    const top = padY + 32;
    const bottom = padY + (container.classList.contains('ms-map--offline') ? 18 : 0);
    map.setMinZoom(0); // getBoundsZoom clamps to minZoom, so measure unclamped first
    const z = map.getBoundsZoom(bounds, false, L.point(padX * 2, top + bottom));
    map.setMinZoom(Math.min(BASE_MIN_ZOOM, Math.max(0, Math.floor(z * 2) / 2)));
    map.fitBounds(bounds, { paddingTopLeft: [padX, top], paddingBottomRight: [padX, bottom], maxZoom: 11, animate: false });
  }

  /**
   * fix-viz-5 (fix-phone-sizes' Razr finding): after a fit, no price pin sits under the map's own controls (on the Razr
   * cover screen, 352x355, the Remote button and the attribution covered the third pin). Zoom out half a step at a time,
   * at most four, while one does; the pins then gather toward the middle (and merge, keeping every place's name).
   */
  function clearOfControls() {
    const box = container.getBoundingClientRect();
    const inside = (r) => r.top >= box.top && r.bottom <= box.bottom && r.left >= box.left && r.right <= box.right;
    const covered = () => {
      const ctl = controlBoxes();
      let n = 0;
      for (const p of container.querySelectorAll('.ms-pin')) { const r = pinFootprint(p); if (r && (!inside(r) || ctl.some((c) => nearHit(r, c)))) n++; }
      return n;
    };
    // B-7 (fix-ui-6): a small pan first, at the fitted zoom, so no pin is merged away by zooming out. Every pin moves with
    // a pan, so the offsets are tried on the pins' boxes (up to 32 px up or down and 24 px sideways, nearest first) and
    // the map pans once, to the nearest that clears them all: Apple on the Razr cover screen needs 12 px up (its pins
    // span 100 of the map's 123 px and the attribution takes the foot's 17), and on the 280 px Fold 4 px right and 8 px
    // down at once. True when a pan clears every pin; otherwise the map stays where it was.
    const panClear = () => {
      const ctl = controlBoxes();
      const pins = [...container.querySelectorAll('.ms-pin')].map(pinFootprint).filter(Boolean);
      const clearAt = (dx, dy) => pins.every((r) => {
        const q = { left: r.left + dx, right: r.right + dx, top: r.top + dy, bottom: r.bottom + dy };
        return inside(q) && !ctl.some((c) => nearHit(q, c));
      });
      const offsets = [];
      for (let dy = -32; dy <= 32; dy += 2) for (let dx = -24; dx <= 24; dx += 2) if (dx || dy) offsets.push([dx, dy]);
      offsets.sort((a, b) => Math.abs(a[0]) + Math.abs(a[1]) - Math.abs(b[0]) - Math.abs(b[1]));
      const hit = offsets.find(([dx, dy]) => clearAt(dx, dy));
      if (!hit) return false;
      map.panBy([-hit[0], -hit[1]], { animate: false }); // panBy moves the view: the pins move the other way
      if (!covered()) return true;
      map.panBy([hit[0], hit[1]], { animate: false }); // a pan across the date line moved them otherwise: back
      return false;
    };
    // A re-check after a resize (the sheet settling) starts from the pins as they are: one merged at a size the map
    // no longer has comes back.
    if (mergeCovered) { mergeCovered = false; draw(); }
    if (!covered() || panClear()) return;
    for (let k = 0; k < 4; k++) {
      if (!covered() || map.getZoom() - 0.5 < 0) break;
      const z = map.getZoom() - 0.5;
      if (z < map.getMinZoom()) map.setMinZoom(z);
      map.off('zoomend', draw);
      map.setZoom(z, { animate: false });
      map.on('zoomend', draw);
      draw();
    }
    // At the widest zoom (a 352x123 map shows the whole world), a small pan clears the controls instead.
    if (!covered() || panClear()) return;
    // Still covered (a whole world in 123 px): such a pin joins its nearest neighbour, whose name then counts it, as a
    // pin whose name finds no room does (draw), until the user moves the map.
    mergeCovered = true;
    draw();
  }
  /**
   * The boxes of the map's own controls that take taps (the Pay | Juice box, zoom, Remote, the attribution). The
   * offline note is left out: it shows only when the basemap fails, and the pins' names are under them then.
   */
  const controlBoxes = () => [...container.querySelectorAll('.leaflet-control')].filter((e) => !e.classList.contains('ms-map__offline-note') && !e.classList.contains('ms-map__unplaced'))
    .map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
  /** The clusters whose pin is under one of the map's controls (clearOfControls). */
  function coveredClusters() {
    const ctl = controlBoxes();
    return clusters.filter((c) => { const r = c.pinEl && pinFootprint(c.pinEl); return r && ctl.some((b) => nearHit(r, b)); });
  }
  /**
   * B-7 (fix-ui-6): what of a pin must stay clear of the controls: its price tag and its pointer, down to the place it
   * points at (PIN_TIP px under the tag; the pointer is a pseudo-element, outside the tag's box). Null when not drawn.
   */
  function pinFootprint(p) {
    const r = p.getBoundingClientRect();
    if (!(r.width > 0)) return null;
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom + PIN_TIP };
  }
  /** A box within CONTROL_GAP px of a control's box (the pins keep a little air from the map's controls). */
  const nearHit = (a, b) => a.left < b.right + CONTROL_GAP && a.right > b.left - CONTROL_GAP && a.top < b.bottom + CONTROL_GAP && a.bottom > b.top - CONTROL_GAP;

  map.on('zoomend', draw);

  // fix-viz-5: until the user moves the map, a resize after the fit (the phone's sheet settling) re-checks the controls.
  let fitFresh = false;
  for (const ev of ['pointerdown', 'wheel', 'keydown']) container.addEventListener(ev, () => { fitFresh = false; mergeCovered = false; }, { passive: true });
  const ro = new ResizeObserver(() => {
    map.invalidateSize({ pan: false });
    if (pendingFit && map.getSize().x && map.getSize().y) { fitToData(); draw(); clearOfControls(); }
    else {
      if (placeLabels().length) draw(); // the map's edges moved; a name with no room merges its pin
      if (fitFresh && map.getSize().x && map.getSize().y) clearOfControls();
    }
  });
  ro.observe(container);
  const offTheme = onThemeChange(dark => {
    applyDark(dark);
    renderPayLegend(); // the steps have their own dark colours
    paintModeControl();
    if (darkUrl) tiles.setUrl(urlFor(dark));
    draw();
  });

  return {
    update(jobs, { fit, colorMode: mode, places: filter = null, placeTest = null } = {}) {
      jobs = Array.isArray(jobs) ? jobs : [];
      if (mode != null) setColorMode(mode, false); // programmatic (e.g. from the URL hash): no callback
      // BP-2: with a Location filter only its places are pinned (placeTest: the host's own match).
      const keys = filter == null ? [] : (typeof filter === 'string' ? [filter] : [...filter]).filter(Boolean);
      ({ places, remote: remoteJobs, remotePaid, remotePriceOf, unplaced } = aggregate(jobs, keys.length ? { places: keys, placeTest } : {}));
      // Default: refit only when the dataset identity (set of companies) or the filtered places change.
      const sig = [...new Set(jobs.map(j => j.company))].sort().join('|') + `\u0000${keys.slice().sort().join('|')}`;
      const doFit = fit ?? (first || sig !== lastSig);
      lastSig = sig;
      if (jobs.length) first = false;
      map.invalidateSize({ pan: false });
      if (doFit) {
        map.off('zoomend', draw);
        fitToData();
        map.on('zoomend', draw);
      }
      draw();
      drawRemote();
      drawUnplaced();
      if (doFit && !pendingFit) clearOfControls();
    },
    highlight(jobId) { highlighted = jobId ?? null; applyHighlight(); },
    /** Override the Juice scale: a juice.js-like module or { netForScore(score), breaks: [45, 70] }. */
    setJuiceScale,
    /** The data as-of line under the Juice legend ('' hides it). */
    setJuiceNote(text) {
      const next = String(text || '');
      if (next === juiceNote) return;
      juiceNote = next;
      renderJuiceLegend();
      paintModeControl();
    },
    /** Current pin color mode: 'pay' | 'juice'. */
    get colorMode() { return colorMode; },
    invalidateSize() {
      map.invalidateSize({ pan: false });
      const fitNow = pendingFit;
      if (fitNow) fitToData();
      draw();
      if (fitNow && !pendingFit) clearOfControls();
    },
    destroy() {
      destroyed = true;
      clearTimeout(offlineTimer);
      ro.disconnect();
      offTheme();
      map.remove();
      container.replaceChildren();
      container.classList.remove('ms-map', 'ms-map--offline', 'ms-map--dark', 'ms-map--tiles-bad', 'ms-map--juice');
    },
    /** The underlying Leaflet map (escape hatch). */
    get leaflet() { return map; },
  };
}
