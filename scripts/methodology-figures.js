// Build-time infographics and values for the methodology guide
// (docs/METHODOLOGY_GUIDE.md -> methodology/index.html, scripts/methodology.js).
//
// Everything is computed from the live code and data on every build, so the
// monthly refreshes (rents, FX, tax rules) show up without editing the copy:
//   server/juice.js     computeJuice, scoreFromNet / netForScore, GRADES, RIND,
//                       HOUSEHOLDS, livingScaleFor, LIVING_SCALE, TAX_SOURCES, FX_AS_OF
//   data/cities.json    the cities, their rents, cost index, sources and as-of dates
//   data/freshness.json refresh cadence per dataset (optional; built-in defaults otherwise)
//
//   figureContext({ juice, cities, freshness? }) -> ctx   (throws if an example city is missing)
//   renderFigure(name, ctx) -> HTML                       ({{figure:name}}; unknown name throws)
//   valueOf(key, ctx)       -> string                     ({{value:key}}; unknown key throws)
//   FIGURES, VALUES                                       the names the guide may use
//   loadFigureInputs(root, { citiesFile? }) -> { juice, cities, freshness } (Node only: reads the repo files)
//
// Charts are static SVG + CSS (no script: CSP script-src 'self'). They have no viewBox:
// x positions are percentages of the chart width and text is in CSS pixels, so a chart
// reflows from 360 px to desktop without shrinking its labels below 12 px. Each chart is
// role="img" with a <title> and <desc>, and a "Show the numbers" table. Colours come from
// the site tokens (var(--ms-*), public/styles.css) through classes in METHODOLOGY_CSS;
// identity never rests on colour alone (labels, legends, order, the table).
import { esc } from './md.js';

/** The worked example: one person on about the median posted salary (docs/LIVABILITY.md §1 calibration). */
export const EXAMPLE = Object.freeze({ city: 'san-francisco-ca-us', salaryUSD: 200000, household: 'single' });
/** Tax split examples: the same salary in six tax systems (federal + state, no state tax, national only, high social, canton, income only). */
export const TAX_SPLIT_CITIES = Object.freeze(['san-francisco-ca-us', 'austin-tx-us', 'london-gb', 'berlin-de', 'zurich-ch', 'singapore-sg']);

export const FIGURES = Object.freeze(['formula', 'waterfall', 'households', 'score-curve', 'grades', 'tax-split', 'sources', 'confidence']);

/* ------------------------------------------------------------ formatting */

const MINUS = '−';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const int = (n) => Math.round(n).toLocaleString('en-US');
/** "$69,848", "−$1,352" (U+2212, as the docs print negatives). */
export function usd(n) {
  const r = Math.round(n);
  return `${r < 0 ? MINUS : ''}$${int(Math.abs(r))}`;
}
/** Compact axis/label money: "$0", "$47.8K", "$100K", "$1.2M". */
export function usdShort(n) {
  const a = Math.abs(n);
  const s = a >= 1e6 ? `${+(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${+(a / 1e3).toFixed(a >= 1e5 ? 0 : 1)}K` : String(Math.round(a));
  return `${n < 0 ? MINUS : ''}$${s}`;
}
const pct = (part, whole) => (whole > 0 ? `${Math.round((100 * part) / whole)}%` : '0%');
const num = (x) => +x.toFixed(3); // SVG coordinates: short, stable strings

/** "2026-07-01" -> "1 July 2026", "2026-09" -> "September 2026", "2026" -> "2026". */
export function fmtDate(s) {
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?/.exec(String(s || ''));
  if (!m) return String(s || 'n/a');
  if (m[3]) return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
  if (m[2]) return `${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
  return m[1];
}
/** Months ("YYYY-MM[-DD]") as a range: "September 2026", "May–October 2026", "October 2025–June 2026". */
export function monthRange(list) {
  const v = [...new Set(list.map((s) => (/^\d{4}-\d{2}/.exec(String(s || '')) || [])[0]).filter(Boolean))].sort();
  if (!v.length) return 'n/a';
  const [lo, hi] = [v[0], v[v.length - 1]];
  if (lo === hi) return fmtDate(lo);
  if (lo.slice(0, 4) === hi.slice(0, 4)) return `${MONTHS[Number(lo.slice(5, 7)) - 1]}–${fmtDate(hi)}`;
  return `${fmtDate(lo)}–${fmtDate(hi)}`;
}
const years = (s) => (String(s || '').match(/(?:19|20)\d\d/g) || []).map(Number);
const yearSpan = (ys) => { const v = [...new Set(ys)].sort(); return !v.length ? 'n/a' : v.length === 1 ? String(v[0]) : `${v[0]}–${v[v.length - 1]}`; };
/** A publisher-style short name: the text before the first comma, colon, semicolon or bracket. */
const shortName = (name) => String(name || '').split(/[,:;(]/)[0].trim();
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
/**
 * Publisher names in plain words (no unexplained abbreviations), matched on the data's own source
 * names; anything unknown falls back to the source's short name with known abbreviations expanded.
 */
const PUBLISHERS = Object.freeze([
  [/^HUD\b|Housing and Urban Development/i, 'US Department of Housing and Urban Development (HUD) Fair Market Rents'],
  [/^ONS\b|Office for National Statistics/i, 'UK Office for National Statistics (ONS) private rents'],
  [/Residential Tenancies Board/i, "Ireland's Residential Tenancies Board rent index"],
  [/^Statistics Canada/i, 'Statistics Canada rent statistics'],
  [/^Statistik Stadt Z(ü|u)rich/i, 'City of Zurich statistics office (Statistik Stadt Zürich)'],
  [/Observatoire des loyers|\bOLAP\b/i, 'Paris-area rent observatory (Observatoire des loyers de l\'agglomération parisienne)'],
  [/^NSW\b|New South Wales/i, 'New South Wales Department of Communities and Justice'],
  [/Housing (&|and) Development Board/i, "Singapore's Housing & Development Board"],
  [/\bECB\b|European Central Bank/i, 'European Central Bank (ECB) reference rates'],
  [/Big Mac/i, "The exchange rates published with The Economist's Big Mac index data"],
  [/Households Below Average Income|OECD equivalence/i, "The UK Department for Work and Pensions' scale for comparing households of different sizes, in its version that leaves out housing (the modified scale of the Organisation for Economic Co-operation and Development)"],
]);
const ABBR = Object.freeze({ NSW: 'New South Wales', HUD: 'US Department of Housing and Urban Development', ONS: 'UK Office for National Statistics', CSO: "Ireland's Central Statistics Office", DWP: 'UK Department for Work and Pensions', OECD: 'Organisation for Economic Co-operation and Development', BLS: 'US Bureau of Labor Statistics' });
export function plainPublisher(name) {
  const hit = PUBLISHERS.find(([re]) => re.test(String(name || '')));
  if (hit) return hit[1];
  return shortName(name).replace(/\b[A-Z]{2,5}\b/g, (a) => ABBR[a] || a);
}

/* ------------------------------------------------------------ context */

const CADENCE_DEFAULTS = Object.freeze({
  'job-postings': 'daily', 'fx-per-usd': 'monthly', 'bigmac-prices': 'semiannual', 'rents-1br-quoted': 'quarterly',
  'rents-bedroom-ratios': 'monthly', 'cost-index': 'quarterly', 'nyc-basket': 'monthly', 'living-scale': 'yearly', tax: 'yearly',
});
const CADENCE_TEXT = Object.freeze({
  daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly', semiannual: 'Twice a year', yearly: 'Yearly', 'ad-hoc': 'When the method changes',
});

/**
 * Everything the figures and values need, computed once per page.
 * @param {{ juice: object, cities: object, freshness?: object|null }} inputs
 */
export function figureContext({ juice, cities: doc, freshness = null }) {
  if (!juice || typeof juice.computeJuice !== 'function') throw new Error('methodology figures: server/juice.js (computeJuice) is required');
  const list = juice.citiesOf ? juice.citiesOf(doc) : (doc && doc.cities) || [];
  if (!list.length) throw new Error('methodology figures: data/cities.json has no cities');
  const baselineUSD = doc && doc.baseline && doc.baseline.nycBasketUSD > 0 ? doc.baseline.nycBasketUSD : undefined;
  const J = (city, salaryUSD, household = 'single') => juice.computeJuice(salaryUSD, city, { household, ...(baselineUSD ? { baselineUSD } : {}) });
  const byKey = new Map(list.map((c) => [c.key, c]));
  const need = (key) => {
    const c = byKey.get(key);
    if (!c) throw Object.assign(new Error(`methodology figures: example city ${key} is not in data/cities.json`), { code: 'FIGURE_CITY' });
    return c;
  };

  const exCity = need(EXAMPLE.city);
  const example = { city: exCity, salaryUSD: EXAMPLE.salaryUSD, j: J(exCity, EXAMPLE.salaryUSD, EXAMPLE.household) };
  const hhKeys = juice.HOUSEHOLD_KEYS || Object.keys(juice.HOUSEHOLDS || { single: 1 });
  const households = hhKeys.map((key) => {
    const preset = (juice.householdOf ? juice.householdOf(key) : juice.HOUSEHOLDS[key]);
    return { key, preset, scale: juice.livingScaleFor ? juice.livingScaleFor(key) : 1, j: J(exCity, EXAMPLE.salaryUSD, key) };
  });
  const taxSplit = TAX_SPLIT_CITIES.filter((k) => byKey.has(k)).map((k) => ({ city: byKey.get(k), j: J(byKey.get(k), EXAMPLE.salaryUSD) }));
  if (taxSplit.length < 4) throw new Error(`methodology figures: only ${taxSplit.length} of the tax-split example cities are in data/cities.json`);
  taxSplit.sort((a, b) => b.j.tax - a.j.tax);

  // Confidence today, per city, for one person (the tax part does not depend on the salary).
  const confidence = { high: 0, medium: 0, low: 0, none: 0 };
  for (const c of list) {
    try { confidence[J(c, EXAMPLE.salaryUSD).confidence] += 1; } catch { confidence.none += 1; }
  }

  const entries = new Map(((freshness && freshness.entries) || []).map((e) => [e.id, e]));
  const cadence = (id) => {
    if (id === 'tax') {
      const tally = new Map();
      for (const e of entries.values()) if (e.group === 'tax' && e.cadence) tally.set(e.cadence, (tally.get(e.cadence) || 0) + 1);
      const top = [...tally].sort((a, b) => b[1] - a[1])[0];
      return top ? top[0] : CADENCE_DEFAULTS.tax;
    }
    return (entries.get(id) && entries.get(id).cadence) || CADENCE_DEFAULTS[id] || 'ad-hoc';
  };

  // Past due (an entry's `stale`, as api/freshness.json and loadFigureInputs carry it); 'tax' is any tax entry.
  const due = (ids) => (ids || []).some((id) => (id === 'tax'
    ? [...entries.values()].some((e) => e.group === 'tax' && e.stale)
    : !!(entries.get(id) && entries.get(id).stale)));

  const countries = new Set(list.map((c) => c.country).filter(Boolean));
  const taxSources = Object.values(juice.TAX_SOURCES || {});
  return { juice, doc, list, example, households, taxSplit, confidence, cadence, due, countries, taxSources, freshness: !!freshness };
}

/* ------------------------------------------------------------ values */

function srcOf(city, field) { return (city.sources && city.sources[field]) || null; }

function rentAsOf(ctx) { return monthRange(ctx.list.map((c) => (srcOf(c, 'rent1brCenterLocal') || {}).asOf)); }
/**
 * P-13: the dates behind the 2- and 3-bedroom rents (most are the 1-bedroom rent × an official
 * bedroom ratio, so their source date is the ratio's), for US cities (`us: true`) or the rest.
 * '' when there are none.
 */
function bedroomsAsOf(ctx, us) {
  const dates = ctx.list.filter((c) => (c.country === 'US') === us)
    .flatMap((c) => ['rent2brCenterLocal', 'rent3brCenterLocal'].map((f) => (srcOf(c, f) || {}).asOf));
  return dates.some(Boolean) ? monthRange(dates) : '';
}
/** "1-bedroom rents May–October 2026; 2- and 3-bedroom rents October 2025 in US cities and January 2025–October 2026 elsewhere". */
function rentDates(ctx) {
  const us = bedroomsAsOf(ctx, true), other = bedroomsAsOf(ctx, false);
  const big = [us && `${us} in US cities`, other && `${other} ${us ? 'elsewhere' : 'everywhere'}`].filter(Boolean).join(' and ');
  return `1-bedroom rents ${rentAsOf(ctx)}${big ? `; 2- and 3-bedroom rents ${big}` : ''}`;
}
function livingAsOf(ctx) { return monthRange(ctx.list.map((c) => (srcOf(c, 'costIndex') || {}).asOf)); }
function taxReviewed(ctx) {
  const r = ctx.taxSources.map((s) => s.reviewed).filter(Boolean).sort();
  return r.length ? fmtDate(r[r.length - 1]) : yearSpan(ctx.taxSources.flatMap((s) => years(s.asOf)));
}
function grade(ctx, label) { return (ctx.juice.GRADES || []).find((g) => g.label === label); }
/**
 * The smallest whole-dollar Juice left whose ROUNDED score reaches `min` (what computeJuice shows
 * and grades: score = Math.round(scoreFromNet(net))). For 70 that is about netForScore(69.5), not
 * netForScore(70). Used for every grade threshold and legend point on the page.
 */
export function netForShownScore(juice, min) {
  if (!(min > 0)) return 0;
  const shown = (n) => Math.round(juice.scoreFromNet(n));
  let n = Math.max(1, Math.ceil(juice.netForScore(min - 0.5)));
  while (n > 1 && shown(n - 1) >= min) n--;
  while (shown(n) < min) n++;
  return n;
}

const VALUE_FNS = {
  'example.city': (c) => c.example.city.name,
  'example.salary': (c) => usd(c.example.salaryUSD),
  'example.gross': (c) => usd(c.example.j.gross),
  'example.tax': (c) => usd(c.example.j.tax),
  'example.rent': (c) => usd(c.example.j.rent),
  'example.living': (c) => usd(c.example.j.living),
  'example.net': (c) => usd(c.example.j.net),
  'example.score': (c) => String(c.example.j.score),
  'example.grade': (c) => c.example.j.grade,
  'example.taxRate': (c) => pct(c.example.j.tax, c.example.j.gross),
  'example.household': (c) => c.households[0].preset.label,
  'cities.count': (c) => String(c.list.length),
  'countries.count': (c) => String(c.countries.size),
  'fx.asOf': (c) => fmtDate(c.juice.FX_AS_OF || (c.doc.fx && c.doc.fx.asOf)),
  'tax.asOf': (c) => taxReviewed(c),
  'tax.years': (c) => yearSpan(c.taxSources.flatMap((s) => years(s.asOf))),
  'tax.rules': (c) => String(c.taxSources.length),
  'rent.asOf': (c) => rentAsOf(c),
  'rent.bedrooms.us': (c) => bedroomsAsOf(c, true) || 'n/a',
  'rent.bedrooms.other': (c) => bedroomsAsOf(c, false) || 'n/a',
  'rent.dates': (c) => rentDates(c),
  'rent.method': () => 'A 2- or 3-bedroom rent is the city\'s 1-bedroom rent times an official figure for how much more a bigger home costs there, so its date is the date of that bedroom data.',
  'living.asOf': (c) => livingAsOf(c),
  'nyc.basket': (c) => usd((c.doc.baseline && c.doc.baseline.nycBasketUSD) || c.juice.NYC_BASKET_USD),
  'score.k': (c) => usd(c.juice.SCORE_ANCHORS.K),
  'score.fullGlass': (c) => usd(c.juice.SCORE_ANCHORS.fullGlassUSD),
  'grade.juicy.min': (c) => String(grade(c, 'Juicy').min),
  'grade.ripe.min': (c) => String(grade(c, 'Ripe').min),
  'grade.juicy.net': (c) => usd(netForShownScore(c.juice, grade(c, 'Juicy').min)),
  'grade.ripe.net': (c) => usd(netForShownScore(c.juice, grade(c, 'Ripe').min)),
  'household.couple.scale': (c) => c.juice.livingScaleFor('couple').toFixed(2),
  'household.family.scale': (c) => c.juice.livingScaleFor('family').toFixed(2),
  'confidence.high': (c) => String(c.confidence.high),
  'confidence.medium': (c) => String(c.confidence.medium),
  'confidence.low': (c) => String(c.confidence.low),
};
export const VALUES = Object.freeze(Object.keys(VALUE_FNS));

/** The text for {{value:key}}; an unknown key throws (the build fails loudly). */
export function valueOf(key, ctx) {
  const fn = VALUE_FNS[key];
  if (!fn) throw Object.assign(new Error(`unknown placeholder {{value:${key}}} (known: ${VALUES.join(', ')})`), { code: 'UNKNOWN_VALUE' });
  const v = fn(ctx);
  if (v == null || v === '' || /undefined|NaN/.test(String(v))) throw new Error(`placeholder {{value:${key}}} has no value (${v})`);
  return String(v);
}

/* ------------------------------------------------------------ SVG helpers */

/** Decorative stroke icons (24-unit grid); they take the site's icon styling (public/styles.css svg rule). */
const ICONS = {
  gross: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.8"/><path d="M6 9.5v5M18 9.5v5"/>',
  tax: '<path d="M6 3h12v18l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4L6 21z"/><path d="m9.5 14.5 5-5"/><circle cx="9.7" cy="9.7" r=".9"/><circle cx="14.3" cy="14.3" r=".9"/>',
  rent: '<path d="M3.5 11 12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5h4v5"/>',
  living: '<path d="M4 9h16l-1.6 10.2a1.5 1.5 0 0 1-1.5 1.3H7.1a1.5 1.5 0 0 1-1.5-1.3z"/><path d="M8.5 9 11 4M15.5 9 13 4M9.5 13v4M14.5 13v4"/>',
  net: '<path d="M3 9a9 9 0 0 0 18 0z"/><path d="M5.7 9a6.3 6.3 0 0 0 12.6 0"/><path d="M10 12.3v.5M14 12.3v.5M12 14.6v.5"/>',
  adult: '<circle cx="12" cy="7" r="3.3"/><path d="M5.5 20.5a6.5 6.5 0 0 1 13 0"/>',
  child: '<circle cx="12" cy="10" r="2.6"/><path d="M7.4 20.5a4.6 4.6 0 0 1 9.2 0"/>',
  bed: '<path d="M3 19v-9M21 19v-5a2 2 0 0 0-2-2h-9v5M3 16.5h18"/><circle cx="6.5" cy="13" r="1.6"/>',
};
const icon = (name, cls = 'mf-ico') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;

/** Open an accessible chart <svg> (percentage x, pixel y and text). */
function svgOpen(id, height, title, desc, cls = '') {
  return `<svg class="mf-svg${cls ? ` ${cls}` : ''}" role="img" aria-labelledby="${id}-t ${id}-d" width="100%" height="${height}" style="height:${height}px" focusable="false">`
    + `<title id="${id}-t">${esc(title)}</title><desc id="${id}-d">${esc(desc)}</desc>`;
}
const P = (x) => `${num(x)}%`;
const table = (caption, head, rows, numeric = []) => `<details class="mf-data"><summary>Show the numbers</summary><div class="table-wrap"><table><caption class="sr-only">${esc(caption)}</caption><thead><tr>${
  head.map((h, k) => `<th scope="col"${numeric.includes(k) ? ' class="num"' : ''}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${
  rows.map((r) => `<tr>${r.map((c, k) => (k === 0 ? `<th scope="row">${esc(c)}</th>` : `<td${numeric.includes(k) ? ' class="num"' : ''}>${esc(c)}</td>`)).join('')}</tr>`).join('')}</tbody></table></div></details>`;
const figure = (name, body, caption = '') => `<figure class="mf mf--${name}" id="fig-${name}" data-figure="${name}">${body}${caption ? `<figcaption class="mf-cap">${caption}</figcaption>` : ''}</figure>`;
const gradeClass = (g) => `juice--${String(g).toLowerCase()}`;
const chip = (j) => `<span class="mf-chip ${gradeClass(j.grade)}"><span class="mf-chip-score">${esc(j.score)}</span> ${esc(j.grade)}</span>`;
const placeName = (city) => city.name;
/** Plain text: "one person (Just me) on $200,000 a year in San Francisco, CA" (escape where used). */
const exampleText = (ctx) => `one person (${ctx.households[0].preset.label}) on ${usd(ctx.example.salaryUSD)} a year in ${placeName(ctx.example.city)}`;
const TAX_BASIS = Object.freeze({ joint: 'taxed jointly', individual: 'taxed individually' });

/* ------------------------------------------------------------ figures */

function formulaFigure(ctx) {
  const j = ctx.example.j;
  const step = (kind, op, opWord, label, note, amount) => `<li class="mf-step mf-step--${kind}">`
    + `<span class="mf-op" aria-hidden="true">${op}</span>${opWord ? `<span class="sr-only">${opWord} </span>` : ''}`
    + `<span class="mf-step-head">${icon(kind)}<strong class="mf-step-label">${esc(label)}</strong></span>`
    + `<span class="mf-step-note">${esc(note)}</span>`
    + `<span class="mf-step-amount">${amount}</span></li>`;
  const steps = [
    step('gross', '', '', 'Gross pay', 'Posted base pay, per year, in US dollars', esc(usd(j.gross))),
    step('tax', MINUS, 'minus', 'Tax', 'Income tax at every level, plus social insurance', esc(usd(-j.tax))),
    step('rent', MINUS, 'minus', 'Rent', '12 months in the city centre, sized to the household', esc(usd(-j.rent))),
    step('living', MINUS, 'minus', 'Living costs', `Everyday spending except rent, scaled by household`, esc(usd(-j.living))),
    step('net', '=', 'equals', 'Juice left', 'What is left for everything else', `${esc(usd(j.net))} ${chip(j)}`),
  ];
  return figure('formula', `<ol class="mf-flow" aria-label="The Juice Score formula">${steps.join('')}</ol>`,
    `The amounts are the worked example: ${esc(exampleText(ctx))}. The score comes from Juice left alone.`);
}

function waterfallFigure(ctx) {
  const j = ctx.example.j;
  const G = j.gross > 0 ? j.gross : 1;
  const rows = [
    { kind: 'gross', label: 'Gross pay', value: usd(j.gross), x0: 0, x1: G },
    { kind: 'cost', label: 'Tax', value: usd(-j.tax), x0: G - j.tax, x1: G },
    { kind: 'cost', label: 'Rent', value: usd(-j.rent), x0: G - j.tax - j.rent, x1: G - j.tax },
    { kind: 'cost', label: 'Living costs', value: usd(-j.living), x0: Math.max(0, j.net), x1: G - j.tax - j.rent },
    { kind: 'net', label: 'Juice left', value: usd(j.net), x0: 0, x1: Math.max(0, j.net) },
  ];
  const RH = 50; // row: label line, then a 14 px bar
  const id = 'fig-waterfall-svg';
  let s = svgOpen(id, rows.length * RH + 2,
    `Worked example: ${j.score} (${j.grade}) for ${exampleText(ctx)}`,
    `Gross pay ${usd(j.gross)} minus tax ${usd(j.tax)}, rent ${usd(j.rent)} and living costs ${usd(j.living)} leaves ${usd(j.net)} of Juice a year, a score of ${j.score} (${j.grade}).`);
  rows.forEach((r, k) => {
    const y = k * RH;
    const share = r.kind === 'gross' ? '' : ` · ${pct(Math.abs(r.x1 - r.x0), G)}`;
    s += `<text class="mf-t${r.kind === 'net' ? ' mf-strong' : ''}" x="0" y="${y + 16}">${esc(r.label)}</text>`;
    s += `<text class="mf-t mf-num${r.kind === 'net' ? ' mf-strong' : ''}" x="100%" y="${y + 16}" text-anchor="end">${esc(r.value)}<tspan class="mf-m">${esc(share)}</tspan></text>`;
    s += `<rect class="mf-track" x="0" y="${y + 26}" width="100%" height="14" rx="4"/>`;
    if (r.x1 > r.x0) s += `<rect class="mf-bar mf-bar--${r.kind}" x="${P((100 * r.x0) / G)}" y="${y + 26}" width="${P((100 * (r.x1 - r.x0)) / G)}" height="14" rx="4"><title>${esc(`${r.label}: ${r.value}`)}</title></rect>`;
    // Step connector: where this bar starts, the next one ends (a waterfall reads left).
    if (k > 0 && k < rows.length - 1) s += `<line class="mf-link" x1="${P((100 * r.x0) / G)}" x2="${P((100 * r.x0) / G)}" y1="${y + 40}" y2="${y + RH + 26}"/>`;
  });
  s += '</svg>';
  const head = `<p class="mf-kicker">${icon('net', 'mf-ico mf-ico--sm')}<span>${esc(cap(exampleText(ctx)))}</span></p>`;
  const result = `<p class="mf-result"><span>Juice left <strong>${esc(usd(j.net))}</strong> a year</span> <span aria-hidden="true">→</span> <span>score ${chip(j)}</span></p>`;
  const tp = j.taxParts || {};
  const data = table('Worked example', ['Line', 'Amount a year', 'Share of gross pay'], [
    ['Gross pay', usd(j.gross), '100%'],
    ['Tax: income', usd(-(tp.income || 0)), pct(tp.income || 0, G)],
    ['Tax: regional', usd(-(tp.regional || 0)), pct(tp.regional || 0, G)],
    ['Tax: social', usd(-(tp.social || 0)), pct(tp.social || 0, G)],
    ['Rent', usd(-j.rent), pct(j.rent, G)],
    ['Living costs', usd(-j.living), pct(j.living, G)],
    ['Juice left', usd(j.net), pct(j.net, G)],
    ['Score', `${j.score} (${j.grade})`, ''],
  ], [1, 2]);
  return figure('waterfall', head + s + result + data,
    `Each grey bar is a cost peeled off the pay above it. Confidence: ${esc(j.confidence)}. Computed by the site's own code from today's data.`);
}

function peopleGlyph(preset) {
  const n = preset.adults + preset.children;
  const icons = [...Array(preset.adults).fill('adult'), ...Array(preset.children).fill('child')];
  return `<span class="mf-people" data-n="${n}">${icons.map((k) => icon(k, `mf-ico mf-ico--${k}`)).join('')}</span>`;
}

function householdsFigure(ctx) {
  const G0 = Math.max(...ctx.households.map((h) => h.j.gross), 1);
  const cards = ctx.households.map((h, k) => {
    const { j, preset } = h;
    const people = `${preset.adults} adult${preset.adults === 1 ? '' : 's'}${preset.children ? `, ${preset.children} children` : ''}`;
    const beds = `${preset.bedrooms}-bedroom home`;
    const id = `fig-households-${k}`;
    const G = j.gross > 0 ? j.gross : G0;
    const parts = [['tax', j.tax], ['rent', j.rent], ['living', j.living]];
    let x = 0;
    let bar = svgOpen(id, 22, `${preset.label}: Juice left is ${pct(Math.max(0, j.net), G)} of gross pay`,
      `${preset.label} (${people}, ${beds}): tax ${usd(j.tax)}, rent ${usd(j.rent)}, living costs ${usd(j.living)}, Juice left ${usd(j.net)} of ${usd(j.gross)}.`, 'mf-svg--mini');
    for (const [kind, v] of parts) {
      const w = (100 * Math.max(0, v)) / G;
      if (w > 0) bar += `<rect class="mf-seg mf-bar--cost mf-seg--${kind}" x="${P(x)}" y="4" width="${P(w)}" height="14"><title>${esc(`${cap(kind === 'living' ? 'living costs' : kind)}: ${usd(v)}`)}</title></rect>`;
      x += w;
    }
    if (j.net > 0) bar += `<rect class="mf-seg mf-bar--net" x="${P(x)}" y="4" width="${P(100 - x)}" height="14"><title>${esc(`Juice left: ${usd(j.net)}`)}</title></rect>`;
    bar += '</svg>';
    const row = (label, value) => `<div class="mf-hh-row"><dt>${label}</dt><dd class="mf-num">${value}</dd></div>`;
    const notes = [`${pct(Math.max(0, j.net), G)} of pay left`, `${j.confidence} confidence`, TAX_BASIS[j.taxBasis], j.estimated ? '≈ estimate' : null].filter(Boolean);
    return `<li class="mf-hh-card">`
      + `<div class="mf-hh-glyphs" aria-hidden="true">${peopleGlyph(preset)}<span class="mf-beds">${Array(preset.bedrooms).fill(0).map(() => icon('bed', 'mf-ico mf-ico--bed')).join('')}</span></div>`
      + `<h3 class="mf-hh-name">${esc(preset.label)}</h3><p class="mf-hh-who">${esc(people)} · ${esc(beds)}</p>`
      + `<dl class="mf-hh-facts">${row('Rent', esc(usd(j.rent)))}${row(`Living costs <span class="mf-m">× ${esc(h.scale.toFixed(2))}</span>`, esc(usd(j.living)))}${row('Tax', esc(usd(j.tax)))}</dl>`
      + `<div class="mf-hh-net"><span>Juice left <strong class="mf-num">${esc(usd(j.net))}</strong></span> ${chip(j)}</div>`
      + `${bar}<p class="mf-hh-share mf-m">${esc(notes.join(' · '))}</p>`
      + '</li>';
  }).join('');
  const legend = `<ul class="mf-legend" aria-hidden="true"><li><span class="mf-key mf-bar--cost"></span>Tax, rent and living costs</li><li><span class="mf-key mf-bar--net"></span>Juice left</li></ul>`;
  return figure('households', `<p class="mf-kicker">${icon('rent', 'mf-ico mf-ico--sm')}<span>The same ${esc(usd(ctx.example.salaryUSD))} salary in ${esc(placeName(ctx.example.city))}, for each household</span></p>${legend}<ul class="mf-hh">${cards}</ul>`,
    `Rent is for the bedrooms shown; living costs are one person's × the household scale (${ctx.households.map((h) => `${esc(h.preset.label)} × ${esc(h.scale.toFixed(2))}`).join(', ')}). Bigger homes' rents are mostly estimates, so those results are rated lower.`);
}

function scoreCurveFigure(ctx) {
  const J = ctx.juice;
  const full = J.SCORE_ANCHORS.fullGlassUSD;
  const maxX = Math.ceil((full * 1.04) / 50000) * 50000;
  const top = 18, h = 200, base = top + h; // score 100 at `top`, 0 at `base`
  const yOf = (score) => num(base - (h * score) / 100);
  const xOf = (net) => (100 * net) / maxX;
  const grades = [...J.GRADES].sort((a, b) => b.min - a.min); // Juicy, Ripe, Dry
  const id = 'fig-score-curve-svg';
  const ripe = grade(ctx, 'Ripe'), juicy = grade(ctx, 'Juicy');
  const ex = ctx.example.j;
  let s = svgOpen(id, base + 46, 'Juice left to score: a curve that rises fast, then levels off',
    `Score = 100 × (1 − e^(−Juice left ÷ ${usd(J.SCORE_ANCHORS.K)})). ${grades.map((g, i) => `${g.label} ${g.min > 0 ? g.min : 1}–${i ? grades[i - 1].min - 1 : 100}`).join(', ')}; Rind is 0 (nothing left). `
    + `${ripe.label} starts at ${usd(netForShownScore(J, ripe.min))} left a year, ${juicy.label} at ${usd(netForShownScore(J, juicy.min))}; 100 needs ${usd(full)}. The example, ${usd(ex.net)} left, scores ${ex.score}.`);
  // Grade bands (score ranges), lightest at the bottom.
  grades.forEach((g, i) => {
    const hi = i ? grades[i - 1].min : 100;
    const y1 = yOf(hi), y0 = yOf(g.min);
    s += `<rect class="mf-band ${gradeClass(g.label)}" x="0" y="${y1}" width="100%" height="${num(y0 - y1)}"/>`;
    s += `<text class="mf-t mf-band-label" x="100%" dx="-8" y="${num(y0 - 8)}" text-anchor="end">${esc(g.label)} <tspan class="mf-m">${g.min > 0 ? g.min : 1}–${i ? hi - 1 : 100}</tspan></text>`;
  });
  for (const g of grades) if (g.min > 0) s += `<line class="mf-grid" x1="0" x2="100%" y1="${yOf(g.min)}" y2="${yOf(g.min)}"/>`;
  s += `<line class="mf-axis" x1="0" x2="100%" y1="${base}" y2="${base}"/>`;
  // The curve: a nested, stretched viewBox (0..1000 × 0..100) with a non-scaling 2 px stroke.
  const pts = [];
  for (let k = 0; k <= 120; k++) { const net = (maxX * k) / 120; pts.push(`${num((1000 * net) / maxX)},${num(100 - J.scoreFromNet(net))}`); }
  // Inline size: public/styles.css sizes every bare <svg> as an 18 px icon.
  s += `<svg class="mf-plot" x="0" y="${top}" width="100%" height="${h}" style="width:100%;height:${h}px" viewBox="0 0 1000 100" preserveAspectRatio="none" overflow="visible" aria-hidden="true"><path class="mf-curve" d="M${pts.join('L')}" vector-effect="non-scaling-stroke"/></svg>`;
  // Full glass: the first net that shows 100.
  s += `<line class="mf-mark" x1="${P(xOf(full))}" x2="${P(xOf(full))}" y1="${top - 4}" y2="${yOf(88)}"/>`;
  s += `<text class="mf-t mf-small" x="${P(xOf(full))}" dx="-6" y="${top + 26}" text-anchor="end">100 needs ${esc(usdShort(full))}</text>`;
  // Grade thresholds on the curve, labelled below-right (always under the rising curve).
  for (const g of [ripe, juicy]) {
    const net = netForShownScore(J, g.min);
    s += `<circle class="mf-dot" cx="${P(xOf(net))}" cy="${yOf(J.scoreFromNet(net))}" r="4.5"><title>${esc(`${g.label} starts at ${g.min}: ${usd(net)} left a year`)}</title></circle>`;
    s += `<text class="mf-t mf-small" x="${P(xOf(net))}" dx="9" y="${num(yOf(g.min) + 15)}">${g.min} at ${esc(usdShort(net))}</text>`;
  }
  // The worked example (legend above the chart names it).
  if (ex.net > 0 && ex.net < maxX) s += `<circle class="mf-dot mf-dot--ex" cx="${P(xOf(ex.net))}" cy="${yOf(ex.score)}" r="6"><title>${esc(`Example: ${usd(ex.net)} left, score ${ex.score}`)}</title></circle>`;
  // x axis
  const step = maxX >= 400000 ? 100000 : 50000;
  for (let v = 0; v <= maxX; v += step) {
    const x = xOf(v);
    const anchor = v === 0 ? 'start' : x >= 99.9 ? 'end' : 'middle';
    s += `<line class="mf-tick" x1="${P(x)}" x2="${P(x)}" y1="${base}" y2="${base + 4}"/><text class="mf-t mf-small mf-num" x="${P(x)}" y="${base + 18}" text-anchor="${anchor}">${esc(usdShort(v))}</text>`;
  }
  s += `<text class="mf-t mf-small mf-m" x="0" y="${base + 38}">Juice left per year (US dollars)</text>`;
  s += `<text class="mf-t mf-small mf-m" x="0" y="12">Score</text>`;
  s += '</svg>';
  const legend = `<ul class="mf-legend"><li><span class="mf-key mf-key--dot mf-key--ex" aria-hidden="true"></span>Worked example: ${esc(usd(ex.net))} left → ${esc(ex.score)} (${esc(ex.grade)})</li><li><span class="mf-key mf-key--dot" aria-hidden="true"></span>Where a grade starts</li></ul>`;
  const K = J.SCORE_ANCHORS.K;
  const rowsAt = [25, ripe.min, juicy.min, 80, 90, 95, 99, 100].map((sc) => [sc, netForShownScore(J, sc)]);
  rowsAt.push([Math.round(J.scoreFromNet(K)), K]);
  rowsAt.sort((a, b) => a[1] - b[1]);
  const data = table('Score curve', ['Score', 'Juice left needed a year', 'Grade'],
    rowsAt.map(([sc, net]) => [String(sc), `${usd(net)}${net === K ? ' (the curve\'s scale)' : ''}`, J.gradeFor(sc, net)]), [1]);
  return figure('score-curve', legend + s + data,
    `The same curve for every job, company and city. Each extra ${esc(usd(J.SCORE_ANCHORS.K))} of Juice closes about 63% of the gap that is left to 100.`);
}

function gradesFigure(ctx) {
  const J = ctx.juice;
  const grades = [...J.GRADES].sort((a, b) => b.min - a.min);
  const rows = grades.map((g, i) => {
    const hi = i ? grades[i - 1].min - 1 : 100;
    const lo = g.min > 0 ? g.min : 1;
    const need = g.min > 0 ? `${usd(netForShownScore(J, g.min))} or more left a year` : 'more than $0 left';
    return { label: g.label, range: `${lo}–${hi}`, need, hint: g.hint, lo, hi };
  });
  rows.push({ label: J.RIND.label, range: '0', need: 'nothing left: costs reach or pass the salary', hint: J.RIND.hint, lo: 0, hi: 0 });
  // A 0-100 ruler with the grade ranges (ordinal melon ramp; each range labelled in text).
  const id = 'fig-grades-svg';
  let s = svgOpen(id, 46, 'Grades on the 0 to 100 score scale',
    rows.map((r) => `${r.label} ${r.range}`).join(', '), 'mf-svg--ruler');
  // Score s sits at x = s%: Rind [0, 1), Dry [1, 45), Ripe [45, 70), Juicy [70, 100].
  for (const r of rows) {
    const x0 = r.lo, x1 = r.hi >= 100 ? 100 : r.hi + 1;
    s += `<rect class="mf-ruler ${gradeClass(r.label)}" x="${P(x0)}" y="6" width="${P(x1 - x0)}" height="12"><title>${esc(`${r.label}: ${r.range}`)}</title></rect>`;
    if (r.hi > 0) s += `<text class="mf-t mf-small" x="${P((x0 + x1) / 2)}" y="38" text-anchor="middle">${esc(r.label)}</text>`;
  }
  for (const t of [0, ...grades.map((g) => g.min).filter((m) => m > 0), 100]) s += `<line class="mf-tick" x1="${P(t)}" x2="${P(t)}" y1="18" y2="23"/>`;
  s += '</svg>';
  const list = `<ul class="mf-grades">${rows.map((r) => `<li class="mf-grade"><span class="mf-chip ${gradeClass(r.label)}">${esc(r.label)}</span><span class="mf-grade-range mf-num">${esc(r.range)}</span><span class="mf-grade-need">${esc(r.need)}</span><span class="mf-grade-hint mf-m">${esc(cap(r.hint))}</span></li>`).join('')}</ul>`;
  return figure('grades', s + list, 'The grade comes from the rounded score, so the badge always matches the number on it.');
}

function taxSplitFigure(ctx) {
  const items = ctx.taxSplit;
  const max = Math.max(...items.map((t) => t.j.tax), 1);
  const RH = 50;
  const id = 'fig-tax-split-svg';
  const parts = [['income', 'Income tax'], ['regional', 'Regional tax'], ['social', 'Social insurance']];
  let s = svgOpen(id, items.length * RH + 2, `Tax on ${usd(ctx.example.salaryUSD)} in ${items.length} cities, split into income, regional and social`,
    items.map(({ city, j }) => `${city.name}: ${usd(j.tax)} (${pct(j.tax, j.gross)} of pay): income ${usd(j.taxParts.income)}, regional ${usd(j.taxParts.regional)}, social ${usd(j.taxParts.social)}`).join('. ') + '.');
  items.forEach(({ city, j }, k) => {
    const y = k * RH;
    s += `<text class="mf-t" x="0" y="${y + 16}">${esc(placeName(city))}</text>`;
    s += `<text class="mf-t mf-num" x="100%" y="${y + 16}" text-anchor="end">${esc(usd(j.tax))}<tspan class="mf-m"> · ${esc(pct(j.tax, j.gross))} of pay</tspan></text>`;
    s += `<rect class="mf-track" x="0" y="${y + 26}" width="100%" height="14" rx="4"/>`;
    let x = 0;
    for (const [key, label] of parts) {
      const v = (j.taxParts && j.taxParts[key]) || 0;
      if (v <= 0) continue;
      const w = (100 * v) / max;
      s += `<rect class="mf-seg mf-tax--${key}" x="${P(x)}" y="${y + 26}" width="${P(w)}" height="14"><title>${esc(`${city.name}: ${label.toLowerCase()} ${usd(v)}`)}</title></rect>`;
      x += w;
    }
  });
  s += '</svg>';
  const legend = `<ul class="mf-legend">${parts.map(([key, label]) => `<li><span class="mf-key mf-tax--${key}" aria-hidden="true"></span>${esc(label)}</li>`).join('')}</ul>`;
  const data = table('Tax split by city', ['City', 'Income', 'Regional', 'Social', 'Total', 'Share of pay'],
    items.map(({ city, j }) => [placeName(city), usd(j.taxParts.income), usd(j.taxParts.regional), usd(j.taxParts.social), usd(j.tax), pct(j.tax, j.gross)]), [1, 2, 3, 4, 5]);
  return figure('tax-split', `<p class="mf-kicker">${icon('tax', 'mf-ico mf-ico--sm')}<span>Tax for one person on ${esc(usd(ctx.example.salaryUSD))} a year, worked out in each city's own currency</span></p>${legend}${s}${data}`,
    'Bars are in the order income, regional, social, longest total on top. Regional is state, province, canton or city income tax; social is compulsory employee social insurance.');
}

function sourcesFigure(ctx) {
  const { doc, list, juice } = ctx;
  const count = (field) => {
    const m = new Map();
    for (const c of list) {
      const s = srcOf(c, field);
      if (!s) continue;
      const k = s.class === 'estimate' ? 'estimate' : /numbeo/i.test(s.name || '') ? 'Numbeo' : shortName(s.name);
      m.set(k, (m.get(k) || 0) + 1);
    }
    return m;
  };
  const cities = (n) => `${n} cit${n === 1 ? 'y' : 'ies'}`;
  const rent1 = count('rent1brCenterLocal');
  const rent1Text = [...rent1].sort((a, b) => b[1] - a[1]).map(([k, n]) => (k === 'Numbeo' ? `Numbeo, a crowd-sourced website (${cities(n)})` : k === 'estimate' ? `estimated (${cities(n)})` : `${plainPublisher(k)} (${cities(n)})`)).join('; ');
  const ci = count('costIndex');
  const ciText = [...ci].sort((a, b) => b[1] - a[1]).map(([k, n]) => (k === 'Numbeo' ? `Numbeo's monthly costs for one person, excluding rent, as an index where New York = 100 (${cities(n)})` : k === 'estimate' ? `estimated from a comparable city (${cities(n)})` : `${k} (${cities(n)})`)).join('; ');
  const ratios = Object.entries(doc.bedroomRatios || {}).filter(([k, v]) => k !== 'description' && v && typeof v === 'object');
  const pubs = [...new Set(ratios.filter(([k]) => /^[A-Z]{2}/.test(k)).map(([, v]) => plainPublisher(v.name)).filter((n) => n && !/^(pooled|median)\b/i.test(n)))];
  const ratioText = `Estimated: the 1-bedroom rent × how much rents rise per extra bedroom, from official rent statistics: ${pubs.join('; ')}${ratios.some(([k]) => /pooled/i.test(k)) ? '. Other countries use the median of these' : ''}`;
  const ratioUS = bedroomsAsOf(ctx, true), ratioOther = bedroomsAsOf(ctx, false);
  const ratioAsOf = ratioUS && ratioOther ? `${ratioUS} in US cities; ${ratioOther} elsewhere` : (ratioUS || ratioOther || monthRange(ratios.map(([, v]) => v.asOf)));
  const verified = ctx.taxSources.filter((s) => s.verified).length;
  const taxYears = yearSpan(ctx.taxSources.flatMap((s) => years(s.asOf)));
  const fxSrc = (doc.fx && doc.fx.source && doc.fx.source.name) || 'Exchange rates';
  const base = doc.baseline || {};
  const baseSrc = (base.sources && base.sources.nycBasketUSD) || {};
  const hh = ctx.example.j.inputs && ctx.example.j.inputs.household;
  const rows = [
    ['Gross pay', 'Each job posting\'s base-pay range (its midpoint), from the company\'s job board', 'The latest postings', ctx.cadence('job-postings'), ['job-postings']],
    ['Exchange rates', plainPublisher(fxSrc), fmtDate(juice.FX_AS_OF || (doc.fx && doc.fx.asOf)), ctx.cadence('fx-per-usd'), ['fx-per-usd']],
    ['Tax', `Official tax rules for ${ctx.taxSources.length} countries, states, provinces and cities (${verified} checked line by line against the official source)`, `Tax years ${taxYears}; checked ${taxReviewed(ctx)}`, ctx.cadence('tax'), ['tax']],
    ['Rent, 1 bedroom', cap(rent1Text), rentAsOf(ctx), ctx.cadence('rents-1br-quoted'), ['rents-1br-quoted', 'rents-nsw-official']],
    ['Rent, 2 and 3 bedrooms', ratioText, ratioAsOf, ctx.cadence('rents-bedroom-ratios'), ['rents-bedroom-ratios', 'rents-us-hud-fmr', 'rents-gb-ons', 'rents-ie-rtb', 'rents-ch-zurich', 'rents-fr-olap', 'rents-ca-statcan', 'rents-sg-hdb']],
    ['Living costs', cap(ciText), livingAsOf(ctx), ctx.cadence('cost-index'), ['cost-index']],
    ['New York living costs (the index base)', `${usd(base.nycBasketUSD || juice.NYC_BASKET_USD)} a year: ${shortName(baseSrc.name) || 'Numbeo'}, one person, excluding rent`, fmtDate(baseSrc.asOf), ctx.cadence('nyc-basket'), ['nyc-basket']],
    ['Household scale (living costs)', plainPublisher((hh && hh.source && hh.source.name) || (juice.LIVING_SCALE && juice.LIVING_SCALE.name)), fmtDate(hh && hh.source && hh.source.asOf), ctx.cadence('living-scale'), ['living-scale']],
  ];
  const head = ['Input', 'Where it comes from', 'As of', 'Refreshed'];
  // P-14: the app shows "as of" dates only; the maintenance status ("update due") lives here.
  const refreshed = (cad, ids) => `${CADENCE_TEXT[cad] || cap(String(cad))}${ctx.due(ids) ? ' · update due' : ''}`;
  const body = rows.map(([what, src, asOf, cad, ids]) => `<tr><th scope="row" data-label="${head[0]}">${esc(what)}</th><td data-label="${head[1]}">${esc(src)}</td><td data-label="${head[2]}">${esc(asOf)}</td><td data-label="${head[3]}">${esc(refreshed(cad, ids))}</td></tr>`).join('');
  return figure('sources', `<div class="mf-table-wrap"><table class="mf-sources"><caption class="sr-only">Data sources, their as-of dates and how often they are refreshed</caption><colgroup><col class="mf-col-what"><col class="mf-col-src"><col class="mf-col-asof"><col class="mf-col-cad"></colgroup><thead><tr>${head.map((x) => `<th scope="col">${x}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`,
    `Read from <code>data/cities.json</code> and the tax rules in the code when this page was built${ctx.freshness ? '; refresh schedule from <code>data/freshness.json</code>' : ''}. Every city's own sources are in the technical reference.`);
}

function confidenceFigure(ctx) {
  const total = ctx.list.length;
  const levels = [
    ['high', 'High', 3, 'Official or open data, such as government statistics, for rent and living costs, and a tax rule checked line by line against an official source.'],
    ['medium', 'Medium', 2, 'At least one figure comes from a crowd-sourced website, or part of the tax rule could not be checked or is simplified.'],
    ['low', 'Low', 1, 'At least one figure is an estimate (a borrowed or derived number). Outside the US, also any result whose rent or living costs are not official or open data.'],
  ];
  const meter = (n, label) => `<span class="mf-meter" aria-hidden="true">${[1, 2, 3].map((k) => `<span class="mf-meter-seg${k <= n ? ' is-on' : ''}"></span>`).join('')}</span><span class="sr-only">${label} confidence</span>`;
  const cards = levels.map(([key, label, n, text]) => `<li class="mf-conf mf-conf--${key}"><div class="mf-conf-head">${meter(n, label)}<strong>${label}</strong></div><p>${esc(text)}</p><p class="mf-conf-count"><strong class="mf-num">${ctx.confidence[key]}</strong> <span class="mf-m">of ${total} cities today, for one person</span></p></li>`).join('');
  return figure('confidence', `<ul class="mf-confs">${cards}</ul>`,
    'A result is as sure as its weakest input: rent, living costs or tax. Couple and Family results are usually lower, because bigger homes\' rents are estimates. ≈ marks a result that uses an estimate.');
}

const FIGURE_FNS = {
  formula: formulaFigure, waterfall: waterfallFigure, households: householdsFigure, 'score-curve': scoreCurveFigure,
  grades: gradesFigure, 'tax-split': taxSplitFigure, sources: sourcesFigure, confidence: confidenceFigure,
};

/** The HTML for {{figure:name}}; an unknown name throws (the build fails loudly). */
export function renderFigure(name, ctx) {
  const fn = FIGURE_FNS[name];
  if (!fn) throw Object.assign(new Error(`unknown placeholder {{figure:${name}}} (known: ${FIGURES.join(', ')})`), { code: 'UNKNOWN_FIGURE' });
  return fn(ctx);
}

/** Node only: the live inputs, read from the repo (server/juice.js, data/cities.json or `citiesFile`, data/freshness.json if present). */
export async function loadFigureInputs(root, { citiesFile = null } = {}) {
  const [{ readFile }, path, { pathToFileURL }] = await Promise.all([import('node:fs/promises'), import('node:path'), import('node:url')]);
  const juice = await import(pathToFileURL(path.join(root, 'server', 'juice.js')).href);
  const cities = JSON.parse(await readFile(citiesFile || path.join(root, 'data', 'cities.json'), 'utf8'));
  let freshness = null;
  try { freshness = JSON.parse(await readFile(path.join(root, 'data', 'freshness.json'), 'utf8')); } catch { freshness = null; }
  if (freshness && Array.isArray(freshness.entries)) {
    // The sources table's "update due": staleness at the build time (MELON_BUILT_AT pins it), as api/freshness.json.
    try {
      const { staleness } = await import(pathToFileURL(path.join(root, 'scripts', 'refresh', 'lib.js')).href);
      const t = Date.parse(process.env.MELON_BUILT_AT || '');
      const now = Number.isFinite(t) ? new Date(t) : new Date();
      freshness = { ...freshness, entries: freshness.entries.map((e) => (e && e.id && !e.retired ? { ...e, stale: !!staleness(e, now).overdue } : e)) };
    } catch { /* no refresh lib: no status column */ }
  }
  return { juice, cities, freshness };
}
