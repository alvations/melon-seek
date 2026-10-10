#!/usr/bin/env node
// Annual review and monthly mini-report from the archive (docs/DATA_ARCHIVE.md "Reports").
//
//   node scripts/archive/report.js --year YYYY [--company X] [--archive DIR] [--write] [--json] [--now ISO]
//   node scripts/archive/report.js --month YYYY-MM [--archive DIR] [--write] [--json]
//   node scripts/archive/report.js --auto [--archive DIR] [--now ISO]
//
// Without --write the Markdown goes to stdout (--json prints the JSON instead). --write puts
// both in the archive: reports/annual/YYYY[-company].md|json, reports/monthly/YYYY-MM.md|json.
// --auto (workflows): a monthly report for every complete month that has none, the annual
// review of each year touched (a year in progress is "year to date"), and in January the
// final review of the year before.
//
// Annual review, per company: postings over the year by month, opened and closed, median
// pay by family x level and its change within the year and year over year, jobs whose
// posted range changed (count and size); cross-company and cross-level comparisons over
// time; Juice by city over time; reference-data changes (FX, rents, tax by jurisdiction,
// every other dataset). Figures are posted base pay ranges (midpoints, USD at the FX each
// version was converted with); quarantined pay is never included.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  MONTH_RE, monthOf, monthEnd, monthsBetween, nextMonth, readTable, readState, readJson, readJsonl, writeIfChanged,
  writeManifest, parseArgs, archiveDir, iso, dist, round1, codeSha,
} from './lib.js';
import { allVersions, view } from './jobs.js';
import { referenceIndex, readVersion } from './reference.js';
import { computeMonth, pendingMonths } from './monthly.js';
import { writeReadme } from './ingest.js';

export const MIN_N = 3;
const LADDER = ['Intern', 'Entry', 'Mid', 'Senior', 'Staff+', 'Manager', 'Director+'];

/* ------------------------------------------------------------ helpers */

const pct = (a, b) => (a > 0 && b > 0 ? round1(((b - a) / a) * 100) : null);
const money = (n) => (n == null ? '-' : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : `$${Math.round(n / 1000)}K`);
const signed = (p) => (p == null ? '-' : `${p > 0 ? '+' : ''}${p}%`);
const esc = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const table = (head, rows) => (rows.length ? [`| ${head.join(' | ')} |`, `| ${head.map((h, i) => (i ? '---:' : '---')).join(' | ')} |`, ...rows.map((r) => `| ${r.map(esc).join(' | ')} |`)].join('\n') : '_No data._');

/** Daily rows by company, date-sorted. */
function dailyByCompany(dir) {
  const out = {};
  for (const r of readTable(dir, 'daily')) (out[r.company] || (out[r.company] = [])).push(r);
  for (const k of Object.keys(out)) out[k].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

const cellMap = (row) => {
  const m = new Map();
  for (const c of (row && row.cells) || []) m.set(`${c[0]}|${c[1]}`, { family: c[0], level: c[1], n: c[2], p10: c[3], p25: c[4], p50: c[5], p75: c[6], p90: c[7] });
  return m;
};

/** Last daily row of each month for one company. */
function monthEnds(rows) {
  const out = new Map();
  for (const r of rows) out.set(r.date.slice(0, 7), r);
  return out;
}

/**
 * Sum of daily counters over the rows that match. A company's first-ever row (since: null)
 * is its baseline: its postings were already there, so they do not count as opened.
 */
function sums(rows, pred) {
  const s = { opened: 0, reopened: 0, closed: 0, unseen: 0, changed: 0, payChanged: 0, sourceChanged: 0, days: 0 };
  for (const r of rows) {
    if (!pred(r)) continue;
    s.days++;
    if (r.since == null) continue;
    for (const k of Object.keys(s)) if (k !== 'days') s[k] += r[k] || 0;
  }
  return s;
}

/** Pay changes (a new version whose salary differs from the one before) with sizes. */
export function rangeChanges(versions, { from, to }) {
  const byId = new Map();
  for (const v of versions) (byId.get(v.id) || byId.set(v.id, []).get(v.id)).push(v);
  const out = [];
  for (const list of byId.values()) {
    list.sort((a, b) => a.seq - b.seq);
    for (let i = 1; i < list.length; i++) {
      const cur = list[i];
      const prev = list[i - 1];
      if (cur.validFrom < from || cur.validFrom > to) continue;
      if (cur.cause === 'reopened' || !cur.changed || !cur.changed.includes('salary')) continue;
      const a = prev.salary;
      const b = cur.salary;
      const sameCur = a && b && a.currency === b.currency;
      out.push({
        id: cur.id, company: cur.company, title: cur.titleReadable || cur.title, at: cur.validFrom, cause: cur.cause,
        from: a ? { min: a.min, max: a.max, currency: a.currency } : null, to: b ? { min: b.min, max: b.max, currency: b.currency } : null,
        midChangePct: sameCur ? pct(a.mid ?? (a.min + a.max) / 2, b.mid ?? (b.min + b.max) / 2) : null,
        kind: !a && b ? 'pay added' : a && !b ? 'pay removed' : !sameCur ? 'currency changed' : 'range changed',
      });
    }
  }
  return out.sort((x, y) => (x.at < y.at ? -1 : x.at > y.at ? 1 : x.id < y.id ? -1 : 1));
}

/** Flatten a JSON value to { "a.b[0]": leaf }. */
export function flatten(v, prefix = '', out = {}) {
  if (v && typeof v === 'object') {
    const entries = Array.isArray(v) ? v.map((x, i) => [`[${i}]`, x]) : Object.entries(v).map(([k, x]) => [prefix ? `.${k}` : k, x]);
    if (!entries.length) out[prefix || '(root)'] = Array.isArray(v) ? '[]' : '{}';
    for (const [k, x] of entries) flatten(x, `${prefix}${k}`, out);
  } else out[prefix || '(root)'] = v;
  return out;
}

/** Leaf changes between two JSON values: [{ path, from, to }]. */
export function diffJson(a, b) {
  const fa = flatten(a);
  const fb = flatten(b);
  const out = [];
  for (const k of new Set([...Object.keys(fa), ...Object.keys(fb)])) {
    if (JSON.stringify(fa[k]) !== JSON.stringify(fb[k])) out.push({ path: k, from: fa[k] ?? null, to: fb[k] ?? null });
  }
  return out.sort((x, y) => (x.path < y.path ? -1 : 1));
}

/* ------------------------------------------------------------ reference data */

function referenceSection(dir, { from, to }) {
  const rows = referenceIndex(dir);
  const datasets = [...new Set(rows.map((r) => r.dataset))].sort();
  const out = { datasets: [], fx: [], rents: [], tax: [], taxYears: [] };
  for (const ds of datasets) {
    const versions = rows.filter((r) => r.dataset === ds && r.kind === 'version');
    const inRange = versions.filter((r) => r.recordedAt >= from && r.recordedAt <= to);
    const before = versions.filter((r) => r.recordedAt < from);
    const base = before.length ? before[before.length - 1] : inRange[0];
    const last = inRange.length ? inRange[inRange.length - 1] : null;
    const entry = { dataset: ds, versionsInPeriod: inRange.length, totalVersions: versions.length, firstAsOf: versions[0] && versions[0].asOf, latestAsOf: versions.length ? versions[versions.length - 1].asOf : null, changes: 0, sample: [] };
    if (base && last && base !== last) {
      let d = [];
      try { d = diffJson(readVersion(dir, base), readVersion(dir, last)); } catch { d = []; }
      entry.changes = d.length;
      entry.sample = d.slice(0, 15);
      entry.from = { asOf: base.asOf, recordedAt: base.recordedAt };
      entry.to = { asOf: last.asOf, recordedAt: last.recordedAt };
      if (/fx/.test(ds)) for (const c of d) { const m = /^perUSD\.([A-Z]{3})$/.exec(c.path); if (m) out.fx.push({ dataset: ds, currency: m[1], from: c.from, to: c.to, changePct: pct(c.from, c.to) }); }
      if (ds === 'repo.cities' || /rent/.test(ds)) {
        const A = readVersion(dir, base);
        const B = readVersion(dir, last);
        const cityList = (x) => (Array.isArray(x) ? x : (x && x.cities) || []);
        const amap = new Map(cityList(A).map((c) => [c.key, c]));
        for (const c of cityList(B)) {
          const o = amap.get(c.key);
          if (!o) continue;
          for (const k of Object.keys(c).filter((k) => /^rent.*USD$/.test(k))) if (o[k] !== c[k]) out.rents.push({ city: c.key, field: k, from: o[k] ?? null, to: c[k], changePct: pct(o[k], c[k]) });
        }
      }
      if (ds === 'repo.tax-probe' || /^tax/.test(ds)) for (const c of d) out.tax.push({ dataset: ds, ...c });
    }
    for (const r of versions) if (r.taxYear != null) out.taxYears.push({ dataset: ds, taxYear: r.taxYear, asOf: r.asOf, recordedAt: r.recordedAt });
    out.datasets.push(entry);
  }
  return out;
}

/* ------------------------------------------------------------ the annual review */

export async function annualReport(dir, { year, company = null, now = new Date().toISOString() } = {}) {
  const Y = String(year);
  const from = `${Y}-01-01T00:00:00.000Z`;
  const yearEnd = `${Y}-12-31T23:59:59.999Z`;
  const to = now < yearEnd ? now : yearEnd;
  const ytd = now < yearEnd;
  const companies = readState(dir, 'companies', {});
  const daily = dailyByCompany(dir);
  const slugs = Object.keys(daily).filter((s) => !company || s === company).sort();
  const months = monthsBetween(`${Y}-01`, monthOf(to));
  const report = { format: 'melon-archive-report-1', kind: 'annual', year: Number(Y), company, ytd, generatedAt: now, through: to, basis: 'posted base pay ranges; midpoints in USD at the FX each version was converted with; quarantined pay excluded', minN: MIN_N, companies: [], crossCompany: [], crossLevel: [], juice: { months: [], cities: [] }, reference: null };

  for (const slug of slugs) {
    const rows = daily[slug].filter((r) => r.observedAt >= from && r.observedAt <= to);
    if (!rows.length) continue;
    const prevYear = daily[slug].filter((r) => r.date.slice(0, 4) === String(Number(Y) - 1));
    const ends = monthEnds(rows);
    const first = rows[0];
    const last = rows[rows.length - 1];
    const lastPrev = prevYear.length ? prevYear[prevYear.length - 1] : null;
    const monthly = months.filter((m) => ends.has(m)).map((m) => {
      const e = ends.get(m);
      const s = sums(rows, (r) => r.date.slice(0, 7) === m);
      return { month: m, postings: e.postings, salaried: e.salaried, quarantined: e.quarantined, opened: s.opened + s.reopened, closed: s.closed + s.unseen, changed: s.changed, payChanged: s.payChanged, medianUSD: e.usd && e.usd.p50, asOf: e.observedAt };
    });
    const total = sums(rows, () => true);
    const a = cellMap(first);
    const b = cellMap(last);
    const p = cellMap(lastPrev);
    const cells = [];
    for (const [k, c] of b) {
      if (c.n < MIN_N || c.family === '*') continue;
      const s = a.get(k);
      const y = p.get(k);
      cells.push({ family: c.family, level: c.level, n: c.n, start: s && s.n >= MIN_N ? s.p50 : null, end: c.p50, withinYearPct: s && s.n >= MIN_N ? pct(s.p50, c.p50) : null, prevYearEnd: y && y.n >= MIN_N ? y.p50 : null, yoyPct: y && y.n >= MIN_N ? pct(y.p50, c.p50) : null });
    }
    cells.sort((x, y) => (x.family < y.family ? -1 : x.family > y.family ? 1 : LADDER.indexOf(x.level) - LADDER.indexOf(y.level)));
    const versions = allVersions(dir, slug).map(view);
    const changes = rangeChanges(versions, { from, to });
    const sized = changes.filter((c) => c.midChangePct != null);
    report.companies.push({
      slug, name: (companies[slug] && companies[slug].name) || slug, channel: (companies[slug] && companies[slug].channel) || null,
      firstObserved: first.observedAt, lastObserved: last.observedAt, days: rows.length,
      postings: { start: first.postings, end: last.postings, peak: Math.max(...rows.map((r) => r.postings)) },
      opened: total.opened + total.reopened, closed: total.closed + total.unseen, changed: total.changed,
      medianUSD: { start: first.usd && first.usd.p50, end: last.usd && last.usd.p50, withinYearPct: pct(first.usd && first.usd.p50, last.usd && last.usd.p50), prevYearEnd: lastPrev && lastPrev.usd ? lastPrev.usd.p50 : null, yoyPct: lastPrev && lastPrev.usd ? pct(lastPrev.usd.p50, last.usd && last.usd.p50) : null },
      monthly, cells,
      rangeChanges: {
        count: changes.length, sized: sized.length, up: sized.filter((c) => c.midChangePct > 0).length, down: sized.filter((c) => c.midChangePct < 0).length,
        byKind: changes.reduce((m, c) => { m[c.kind] = (m[c.kind] || 0) + 1; return m; }, {}),
        bySource: changes.reduce((m, c) => { m[c.cause] = (m[c.cause] || 0) + 1; return m; }, {}),
        midChangePct: dist(sized.map((c) => c.midChangePct), round1),
        largest: sized.slice().sort((x, y) => Math.abs(y.midChangePct) - Math.abs(x.midChangePct)).slice(0, 10),
      },
    });
  }

  // Cross-company (same family x level, several companies) and cross-level (ladder per company), by month.
  const byCell = new Map();
  const ladders = [];
  for (const c of report.companies) {
    const rows = daily[c.slug].filter((r) => r.observedAt >= from && r.observedAt <= to);
    const ends = monthEnds(rows);
    const ladder = { company: c.slug, months: {} };
    for (const [m, r] of ends) {
      for (const cell of cellMap(r).values()) {
        if (cell.n < MIN_N) continue;
        if (cell.family === '*') { (ladder.months[m] || (ladder.months[m] = {}))[cell.level] = { n: cell.n, p50: cell.p50 }; continue; }
        if (cell.level === '*') continue;
        const k = `${cell.family}|${cell.level}`;
        if (!byCell.has(k)) byCell.set(k, { family: cell.family, level: cell.level, companies: {} });
        ((byCell.get(k).companies[c.slug]) || (byCell.get(k).companies[c.slug] = {}))[m] = { n: cell.n, p50: cell.p50 };
      }
    }
    ladders.push(ladder);
  }
  report.crossCompany = [...byCell.values()].filter((x) => Object.keys(x.companies).length >= 2)
    .sort((x, y) => (x.family < y.family ? -1 : x.family > y.family ? 1 : LADDER.indexOf(x.level) - LADDER.indexOf(y.level)));
  report.crossLevel = ladders.filter((l) => Object.keys(l.months).length);

  // Juice by city over time: frozen monthly tables, plus a provisional current month.
  const juiceMonths = [];
  for (const m of months) {
    const file = path.join(dir, 'monthly', m, 'juice.jsonl');
    if (fs.existsSync(file)) juiceMonths.push({ month: m, provisional: false, rows: readJsonl(file) });
  }
  const lastMonth = monthOf(to);
  if (!juiceMonths.some((j) => j.month === lastMonth) && !company) {
    try {
      const m = await computeMonth(dir, lastMonth, { now, asOf: to });
      if (m.juice.length) juiceMonths.push({ month: lastMonth, provisional: true, rows: m.juice });
    } catch { /* juice model unavailable */ }
  }
  const cityMap = new Map();
  for (const jm of juiceMonths) {
    report.juice.months.push({ month: jm.month, provisional: jm.provisional });
    for (const r of jm.rows) {
      if (r.kind !== 'city' || r.n < MIN_N) continue;
      if (!cityMap.has(r.key)) cityMap.set(r.key, { city: r.key, name: r.name, months: {} });
      cityMap.get(r.key).months[jm.month] = { n: r.n, p50: r.score.p50, netUSD: r.netUSD && r.netUSD.p50 };
    }
  }
  report.juice.cities = [...cityMap.values()].sort((a, b) => {
    const n = (x) => Math.max(...Object.values(x.months).map((v) => v.n));
    return n(b) - n(a) || (a.city < b.city ? -1 : 1);
  });

  report.reference = company ? null : referenceSection(dir, { from, to });
  return report;
}

export function annualMarkdown(r) {
  const out = [];
  const title = r.company ? `${r.company} ${r.year}` : String(r.year);
  out.push(`# melon-seek annual review: ${title}${r.ytd ? ' (year to date)' : ''}`, '');
  out.push(`Generated ${r.generatedAt.slice(0, 10)} from the data archive, through ${r.through.slice(0, 10)}. Basis: ${r.basis}. Cells need n >= ${r.minN}.`, '');
  out.push('## Companies', '');
  out.push('Postings and medians compare the first and the latest observation in the period; opened and closed exclude a company\'s first-ever observation (its baseline).', '');
  out.push(table(['company', 'channel', 'observed', 'days', 'postings first', 'latest', 'peak', 'opened', 'closed', 'changed', 'median first', 'median latest', 'within year', 'YoY'],
    r.companies.map((c) => [c.slug, c.channel || '-', `${c.firstObserved.slice(0, 10)} to ${c.lastObserved.slice(0, 10)}`, c.days, c.postings.start, c.postings.end, c.postings.peak, c.opened, c.closed, c.changed, money(c.medianUSD.start), money(c.medianUSD.end), signed(c.medianUSD.withinYearPct), c.medianUSD.prevYearEnd == null ? 'n/a' : signed(c.medianUSD.yoyPct)])), '');
  for (const c of r.companies) {
    out.push(`### ${c.name} (${c.slug})`, '');
    out.push('Postings by month (at the last observation of the month):', '');
    out.push(table(['month', 'postings', 'salaried', 'quarantined', 'opened', 'closed', 'changed', 'pay changed', 'median'], c.monthly.map((m) => [m.month, m.postings, m.salaried, m.quarantined, m.opened, m.closed, m.changed, m.payChanged, money(m.medianUSD)])), '');
    out.push('Median pay by family and level:', '');
    out.push(table(['family', 'level', 'n', 'first in period', 'latest', 'within year', 'end of last year', 'YoY'], c.cells.map((x) => [x.family, x.level, x.n, money(x.start), money(x.end), signed(x.withinYearPct), money(x.prevYearEnd), signed(x.yoyPct)])), '');
    const rc = c.rangeChanges;
    out.push(`Posted ranges that changed: **${rc.count}** (${Object.entries(rc.byKind).map(([k, v]) => `${v} ${k}`).join(', ') || 'none'}; ${Object.entries(rc.bySource).map(([k, v]) => `${v} ${k === 'source' ? 'with a posting edit' : 'from re-derivation only'}`).join(', ') || '-'}). Of ${rc.sized} with a comparable midpoint: ${rc.up} up, ${rc.down} down; median change ${signed(rc.midChangePct.p50)} (p10 ${signed(rc.midChangePct.p10)}, p90 ${signed(rc.midChangePct.p90)}).`, '');
    if (rc.largest.length) out.push(table(['when', 'posting', 'from', 'to', 'mid change'], rc.largest.map((x) => [x.at.slice(0, 10), `${x.title} (${x.id})`, x.from ? `${x.from.min}-${x.from.max} ${x.from.currency}` : '-', x.to ? `${x.to.min}-${x.to.max} ${x.to.currency}` : '-', signed(x.midChangePct)])), '');
  }
  const ms = [...new Set(r.crossCompany.flatMap((x) => Object.values(x.companies).flatMap((v) => Object.keys(v))))].sort();
  out.push('## Cross-company comparisons (same family and level)', '');
  out.push('Median USD midpoint per company at the end of each month.', '');
  if (!r.crossCompany.length) out.push('_No family and level has n >= 3 at two or more companies yet._', '');
  for (const x of r.crossCompany) {
    out.push(`**${x.family} / ${x.level}**`, '');
    out.push(table(['company', ...ms], Object.entries(x.companies).sort().map(([slug, v]) => [slug, ...ms.map((m) => (v[m] ? `${money(v[m].p50)} (n ${v[m].n})` : '-'))])), '');
  }
  out.push('## Cross-level comparisons (all families)', '');
  for (const l of r.crossLevel) {
    const lm = Object.keys(l.months).sort();
    out.push(`**${l.company}**`, '');
    out.push(table(['level', ...lm], LADDER.filter((lv) => lm.some((m) => l.months[m][lv])).map((lv) => [lv, ...lm.map((m) => (l.months[m][lv] ? `${money(l.months[m][lv].p50)} (n ${l.months[m][lv].n})` : '-'))])), '');
  }
  if (!r.company) {
    const jm = r.juice.months.map((m) => m.month);
    out.push('## Juice Score by city over time', '');
    out.push(`Median Juice Score (single household, city-centre 1-bedroom) of the jobs whose best location is the city; months: ${r.juice.months.map((m) => `${m.month}${m.provisional ? ' (provisional)' : ''}`).join(', ') || 'none'}.`, '');
    out.push(table(['city', ...jm], r.juice.cities.slice(0, 40).map((c) => [c.name || c.city, ...jm.map((m) => (c.months[m] ? `${c.months[m].p50} (n ${c.months[m].n})` : '-'))])), '');
    const ref = r.reference;
    out.push('## Reference data', '');
    out.push(table(['dataset', 'versions this year', 'all versions', 'first as of', 'latest as of', 'leaf changes'], ref.datasets.map((d) => [d.dataset, d.versionsInPeriod, d.totalVersions, d.firstAsOf || '-', d.latestAsOf || '-', d.changes])), '');
    out.push('FX (units per USD):', '');
    out.push(ref.fx.length ? table(['dataset', 'currency', 'from', 'to', 'change'], ref.fx.map((f) => [f.dataset, f.currency, f.from, f.to, signed(f.changePct)])) : '_No FX change recorded in this period._', '');
    out.push('Rents (USD per month):', '');
    out.push(ref.rents.length ? table(['city', 'field', 'from', 'to', 'change'], ref.rents.slice(0, 60).map((x) => [x.city, x.field, x.from, x.to, signed(x.changePct)])) : '_No rent change recorded in this period._', '');
    out.push('Tax (probe of every jurisdiction; values are annual tax in local currency):', '');
    out.push(ref.tax.length ? table(['dataset', 'path', 'from', 'to'], ref.tax.slice(0, 60).map((x) => [x.dataset, x.path, x.from, x.to])) : '_No tax change recorded in this period._', '');
    if (ref.taxYears.length) out.push(table(['dataset', 'tax year', 'as of', 'recorded'], ref.taxYears.map((t) => [t.dataset, t.taxYear, t.asOf, t.recordedAt.slice(0, 10)])), '');
  }
  return out.join('\n') + '\n';
}

/* ------------------------------------------------------------ the monthly mini-report */

export async function monthlyReport(dir, { month, now = new Date().toISOString() } = {}) {
  const from = `${month}-01T00:00:00.000Z`;
  const to = monthEnd(month) < now ? monthEnd(month) : now;
  const prevM = (() => { const [y, m] = month.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; })();
  const daily = dailyByCompany(dir);
  const companies = [];
  const movers = [];
  for (const slug of Object.keys(daily).sort()) {
    const rows = daily[slug].filter((r) => r.observedAt >= from && r.observedAt <= to);
    if (!rows.length) continue;
    const prev = daily[slug].filter((r) => r.date.slice(0, 7) === prevM);
    const end = rows[rows.length - 1];
    const prevEnd = prev.length ? prev[prev.length - 1] : rows[0];
    const s = sums(rows, () => true);
    const changes = rangeChanges(allVersions(dir, slug).map(view), { from, to });
    companies.push({ slug, postings: end.postings, salaried: end.salaried, quarantined: end.quarantined, opened: s.opened + s.reopened, closed: s.closed + s.unseen, changed: s.changed, payChanged: s.payChanged, rangeChanges: changes.length, medianUSD: end.usd && end.usd.p50, vsPrevious: pct(prevEnd.usd && prevEnd.usd.p50, end.usd && end.usd.p50), previousFrom: prevEnd.date });
    const a = cellMap(prevEnd);
    for (const [k, c] of cellMap(end)) {
      const o = a.get(k);
      if (!o || o.n < MIN_N || c.n < MIN_N || c.family === '*' || c.level === '*') continue;
      const d = pct(o.p50, c.p50);
      if (d != null && Math.abs(d) >= 5) movers.push({ company: slug, family: c.family, level: c.level, from: o.p50, to: c.p50, changePct: d, n: c.n });
    }
  }
  movers.sort((x, y) => Math.abs(y.changePct) - Math.abs(x.changePct));
  const audit = {
    newFlags: readTable(dir, 'audit/flags').filter((f) => String(f.firstSeenAt).slice(0, 7) === month).length,
    verdicts: readTable(dir, 'audit/verdicts').filter((v) => String(v.recordedAt).slice(0, 7) === month).length,
    vettingRuns: readTable(dir, 'audit/runs').filter((v) => String(v.at).slice(0, 7) === month).length,
    refreshResults: readTable(dir, 'audit/refresh').filter((v) => String(v.ranAt).slice(0, 7) === month).length,
  };
  const compFile = path.join(dir, 'monthly', month, 'compstimate.jsonl');
  const compstimate = fs.existsSync(compFile) ? readJsonl(compFile).map((c) => ({ company: c.company, medianAbsPctError: c.medianAbsPctError ?? null, within10Pct: c.within10Pct ?? null, n: c.n ?? 0 })) : [];
  return { format: 'melon-archive-report-1', kind: 'monthly', month, generatedAt: now, through: to, minN: MIN_N, companies, movers: movers.slice(0, 25), compstimate, audit, reference: referenceSection(dir, { from, to }) };
}

export function monthlyMarkdown(r) {
  const out = [`# melon-seek monthly report: ${r.month}`, '', `Generated ${r.generatedAt.slice(0, 10)} from the data archive, through ${r.through.slice(0, 10)}. Posted base pay, USD midpoints; quarantined pay excluded.`, ''];
  out.push(table(['company', 'postings', 'salaried', 'quarantined', 'opened', 'closed', 'changed', 'pay changed', 'ranges changed', 'median', 'vs previous'], r.companies.map((c) => [c.slug, c.postings, c.salaried, c.quarantined, c.opened, c.closed, c.changed, c.payChanged, c.rangeChanges, money(c.medianUSD), `${signed(c.vsPrevious)} (vs ${c.previousFrom})`])), '');
  out.push('## Biggest moves in median pay (family and level, n >= 3, at least 5%)', '');
  out.push(r.movers.length ? table(['company', 'family', 'level', 'from', 'to', 'change', 'n'], r.movers.map((m) => [m.company, m.family, m.level, money(m.from), money(m.to), signed(m.changePct), m.n])) : '_None._', '');
  if (r.compstimate.length) out.push('## Compstimate backtest', '', table(['company', 'median abs % error', 'within 10%', 'n'], r.compstimate.map((c) => [c.company, c.medianAbsPctError ?? '-', c.within10Pct ?? '-', c.n])), '');
  out.push('## Reference data recorded this month', '');
  const ds = r.reference.datasets.filter((d) => d.versionsInPeriod);
  out.push(ds.length ? table(['dataset', 'new versions', 'latest as of', 'leaf changes'], ds.map((d) => [d.dataset, d.versionsInPeriod, d.latestAsOf, d.changes])) : '_None._', '');
  out.push('## Audit', '', `New distinct vetting flags: ${r.audit.newFlags}; verdicts recorded: ${r.audit.verdicts}; vetting runs: ${r.audit.vettingRuns}; monthly-refresh results: ${r.audit.refreshResults}.`, '');
  return out.join('\n') + '\n';
}

/* ------------------------------------------------------------ writing */

function write(dir, rel, report, md) {
  writeIfChanged(path.join(dir, `${rel}.json`), JSON.stringify(report, null, 1) + '\n');
  writeIfChanged(path.join(dir, `${rel}.md`), md);
}

/** --auto: monthly reports for complete months without one, then the touched years' reviews. */
export async function autoReports(dir, { now = new Date().toISOString(), log = console.log } = {}) {
  const obs = readTable(dir, 'observations').filter((o) => o.status === 'folded');
  if (!obs.length) return [];
  const first = obs.reduce((m, o) => (o.observedAt < m ? o.observedAt : m), obs[0].observedAt);
  const cur = monthOf(now);
  const done = [];
  const years = new Set();
  for (const m of monthsBetween(monthOf(first), cur)) {
    if (m >= cur) break;
    if (fs.existsSync(path.join(dir, 'reports', 'monthly', `${m}.md`))) continue;
    const r = await monthlyReport(dir, { month: m, now });
    write(dir, `reports/monthly/${m}`, r, monthlyMarkdown(r));
    done.push(`reports/monthly/${m}`);
    years.add(m.slice(0, 4));
  }
  // January: the year before gets its final review (December just completed).
  if (cur.endsWith('-01')) years.add(String(Number(cur.slice(0, 4)) - 1));
  if (!fs.existsSync(path.join(dir, 'reports', 'annual', `${cur.slice(0, 4)}.md`)) && monthOf(first) <= cur) years.add(cur.slice(0, 4));
  for (const y of [...years].sort()) {
    if (y < first.slice(0, 4)) continue;
    const r = await annualReport(dir, { year: y, now });
    write(dir, `reports/annual/${y}`, r, annualMarkdown(r));
    done.push(`reports/annual/${y}`);
  }
  for (const d of done) log(`report: wrote ${d}.md/.json`);
  return done;
}

async function main(argv) {
  const a = parseArgs(argv, { booleans: ['write', 'json', 'auto'] });
  const dir = archiveDir(a.archive);
  const now = iso(a.now) || new Date().toISOString();
  if (a.auto) {
    await autoReports(dir, { now });
    writeReadme(dir);
    writeManifest(dir, { now, generator: `scripts/archive@${(await codeSha()) || 'unknown'}` });
    return 0;
  }
  let report;
  let md;
  let rel;
  if (a.month) {
    if (!MONTH_RE.test(String(a.month))) { console.error('report: --month YYYY-MM'); return 2; }
    report = await monthlyReport(dir, { month: String(a.month), now });
    md = monthlyMarkdown(report);
    rel = `reports/monthly/${a.month}`;
  } else if (a.year) {
    if (!/^\d{4}$/.test(String(a.year))) { console.error('report: --year YYYY'); return 2; }
    const company = a.company ? String(a.company) : null;
    report = await annualReport(dir, { year: String(a.year), company, now });
    md = annualMarkdown(report);
    rel = `reports/annual/${a.year}${company ? `-${company}` : ''}`;
  } else {
    console.error('usage: node scripts/archive/report.js --year YYYY [--company X] | --month YYYY-MM | --auto  [--archive DIR] [--write] [--json]');
    return 2;
  }
  if (a.write) {
    write(dir, rel, report, md);
    writeManifest(dir, { now, generator: `scripts/archive@${(await codeSha()) || 'unknown'}` });
    console.error(`report: wrote ${rel}.md and ${rel}.json`);
  } else if (a.json) process.stdout.write(JSON.stringify(report, null, 1) + '\n');
  else process.stdout.write(md);
  return 0;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) process.exit(await main(process.argv.slice(2)));

export { nextMonth, pendingMonths, readJson };
