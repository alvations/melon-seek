// Synthetic boards for the incremental-crawl tests (test/incremental-*.test.js): one mutable
// model per adapter, built from the recorded fixtures (test/fixtures/bigtech-*.json and the
// stable boards' fixtures), served by a fetch stand-in that counts list and detail requests.
// No network: installFetch throws on any URL no board serves.
//
//   const b = BOARDS.microsoft(20);   b.add(); b.editVisible(id); b.editSilent(id); b.close(id)
//   b.handler(url, init) -> Response | null;  b.counts = { list, detail, probe }
//   b.shortList = n   lists n fewer postings than the board's count (a partial list)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { amazonRows, amazonSite, metaRecords, metaPageHtml } from './amazon-meta-synth.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(FIX, name), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const json = (obj, status = 200, headers = {}) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...headers } });
const text = (s, status = 200, type = 'text/plain', headers = {}) => new Response(s, { status, headers: { 'content-type': type, ...headers } });
const EIGHTFOLD_ROBOTS = 'User-agent: *\nDisallow: /\nAllow: /careers\nAllow: /api/apply\nAllow: /api/pcsx\n';

/** The shared model: ordered ids -> { row, detail }, edits and closures. */
function model(make, { visible, silent }) {
  const items = new Map();
  let next = 0;
  const m = {
    items, counts: { list: 0, detail: 0, probe: 0 }, shortList: 0, absentButOpen: new Set(),
    add() { const i = next++; const it = make(i); items.set(String(it.id), it); return String(it.id); },
    editVisible(id) { visible(items.get(String(id)), next++); },
    editSilent(id) { silent(items.get(String(id)), next++); },
    close(id) { items.delete(String(id)); },
    ids() { return [...items.keys()]; },
    /** Listed items: all, minus `shortList` from the end and minus absentButOpen (still served). */
    listed() { const l = [...items.values()].filter((it) => !m.absentButOpen.has(String(it.id))); return m.shortList ? l.slice(0, Math.max(0, l.length - m.shortList)) : l; },
    reset() { m.counts = { list: 0, detail: 0, probe: 0 }; },
  };
  return m;
}

/* -------------------------------------------------------------- Eightfold */

function eightfold(host, rec, api, n) {
  const pcsx = api === 'pcsx';
  const DETAIL_KEYS = pcsx ? ['jobDescription', 'publicUrl', 'efcustomTextWorkSite', 'efcustomTextRequiredTravel', 'efcustomTextCurrentProfession', 'efcustomTextTaDisciplineName', 'efcustomTextRoletype', 'efcustomTextEmploymentType'] : ['job_description', 'custom_JD'];
  const base = clone(rec);
  const desc = pcsx ? 'jobDescription' : 'job_description';
  const make = (i) => {
    const id = 7000000 + i;
    const row = { ...base, id, name: `${base.name} ${i}`, ...(pcsx ? { postedTs: 1791500000 + i, displayJobId: String(500000 + i) } : { t_update: 1791500000 + i, display_job_id: `JR${500000 + i}` }) };
    for (const k of DETAIL_KEYS) delete row[k];
    if (!pcsx) row[desc] = '';
    const detail = { ...base, id, name: row.name, [desc]: `<p>Role ${i}.</p>${base[desc]}` };
    return { id, row, detail };
  };
  const m = model(make, {
    visible: (it, k) => { it.row.name += ` v${k}`; it.detail.name = it.row.name; if (pcsx) it.row.postedTs += 1000; else it.row.t_update += 1000; it.detail[desc] = `<p>Edited ${k}.</p>${it.detail[desc]}`; },
    silent: (it, k) => { it.detail[desc] = `<p>Silently edited ${k}.</p>${it.detail[desc]}`; },
  });
  for (let i = 0; i < n; i++) m.add();
  m.handler = (url) => {
    const u = new URL(url);
    if (u.host !== host) return null;
    if (u.pathname === '/robots.txt') return text(EIGHTFOLD_ROBOTS);
    const listPath = pcsx ? '/api/pcsx/search' : '/api/apply/v2/jobs';
    if (u.pathname === listPath) {
      m.counts.list++;
      const start = Number(u.searchParams.get('start')) || 0;
      const rows = m.listed().slice(start, start + 10).map((it) => clone(it.row));
      const count = m.items.size;
      return json(pcsx ? { status: 200, data: { count, positions: rows } } : { count, positions: rows });
    }
    const id = pcsx && u.pathname === '/api/pcsx/position_details' ? u.searchParams.get('position_id') : (/^\/api\/apply\/v2\/jobs\/(\d+)$/.exec(u.pathname) || [])[1];
    if (id) {
      const it = m.items.get(String(id));
      if (m.probing) m.counts.probe++; else m.counts.detail++;
      if (!it) return json({ status: 404, error: 'not found' }, 404);
      return json(pcsx ? { status: 200, data: clone(it.detail) } : clone(it.detail));
    }
    return text('no', 404);
  };
  return m;
}

/* ------------------------------------------------------------------ Apple */

function apple(n) {
  const recs = fixture('bigtech-apple.json').records;
  const us = recs.find((r) => r.detail && /between \$/.test(JSON.stringify(r.detail.postingFooters || '')));
  const make = (i) => {
    const req = String(200700000 + i);
    const id = `${req}-0157`;
    const row = { ...clone(us.row), id, positionId: req, postingTitle: `${us.row.postingTitle} ${i}`, transformedPostingTitle: `role-${i}` };
    const detail = { ...clone(us.detail), id, jobNumber: req, postingTitle: row.postingTitle, description: `Role ${i}. ${us.detail.description || ''}` };
    return { id, row, detail };
  };
  const m = model(make, {
    visible: (it, k) => { it.row.postingTitle += ` v${k}`; it.detail.postingTitle = it.row.postingTitle; it.detail.description = `Edited ${k}. ${it.detail.description}`; },
    silent: (it, k) => { it.detail.description = `Silently edited ${k}. ${it.detail.description}`; },
  });
  for (let i = 0; i < n; i++) m.add();
  m.handler = (url, init) => {
    const u = new URL(url);
    if (u.host === 'jobs.apple.com' && u.pathname === '/robots.txt') return new Response('Moved', { status: 301, headers: { location: 'https://apple.com/pagenotfound' } });
    if (u.host === 'apple.com') return text('<html>not found</html>', 404, 'text/html');
    if (u.host !== 'jobs.apple.com') return null;
    if (u.pathname === '/api/v1/search') {
      m.counts.list++;
      const page = JSON.parse(init.body).page;
      const rows = m.listed().slice((page - 1) * 20, page * 20).map((it) => clone(it.row));
      return json({ res: { searchResults: rows, totalRecords: m.items.size } });
    }
    if (u.pathname.startsWith('/api/v1/jobDetails/')) {
      const id = decodeURIComponent(u.pathname.split('/').pop());
      if (m.probing) m.counts.probe++; else m.counts.detail++;
      const it = m.items.get(id);
      return it ? json({ res: clone(it.detail) }) : json({ error: 'not found' }, 404);
    }
    return text('no', 404);
  };
  return m;
}

/* ----------------------------------------------------------------- Google */

function google(n) {
  const { records } = fixture('bigtech-google.json');
  const tpl = records.find((r) => /salary range|\$\d/.test(JSON.stringify(r[10] || ''))) || records[0];
  const slugOf = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const make = (i) => {
    const id = String(90000000000000000n + BigInt(i));
    const rec = clone(tpl);
    rec[0] = id;
    rec[1] = `${tpl[1]} ${i}`;
    return { id, row: { lastmod: '2026-10-01' }, detail: rec };
  };
  const m = model(make, {
    visible: (it, k) => { it.row.lastmod = `2026-10-${String(10 + (k % 18)).padStart(2, '0')}`; it.detail[1] += ` v${k}`; },
    silent: (it, k) => { it.detail[10] = [null, `<p>Silently edited ${k}.</p>${(it.detail[10] || [])[1] || ''}`]; },
  });
  for (let i = 0; i < n; i++) m.add();
  m.handler = (url, init) => {
    const u = new URL(url);
    if (u.host !== 'www.google.com') return null;
    if (u.pathname === '/robots.txt') return text('User-agent: *\nDisallow: /about/careers/applications/jobs/results/?page=\n');
    if (u.pathname.endsWith('/jobs/sitemap.xml')) {
      m.counts.list++;
      const urls = m.listed().map((it) => `<url><loc>https://careers.google.com/jobs/results/${it.id}-${slugOf(it.detail[1])}/</loc><lastmod>${it.row.lastmod}</lastmod></url>`).join('');
      return text(`<?xml version="1.0"?><urlset>${urls}</urlset>`, 200, 'text/xml');
    }
    if (u.pathname.endsWith('/batchexecute')) {
      m.counts.detail++;
      const id = JSON.parse(JSON.parse(decodeURIComponent(String(init.body).slice(6)))[0][0][1])[0];
      const it = m.items.get(id);
      return text(`)]}'\n\n${JSON.stringify([['wrb.fr', 'sf9Qmf', JSON.stringify(it ? [clone(it.detail)] : [null]), null, null, null, 'generic']])}`, 200, 'application/json');
    }
    return text('no', 404);
  };
  return m;
}

/* ------------------------------------------------------------------- Meta */

function meta(n) {
  const recs = metaRecords({ total: n + 200, seed: 3, ldOnly: 0 });
  let k0 = 0;
  const make = () => {
    const p = clone(recs[k0++]);
    return { id: p.id, row: { lastmod: '2026-10-01T00:00:00Z' }, detail: p };
  };
  const m = model(make, {
    visible: (it, k) => { it.row.lastmod = `2026-10-${String(10 + (k % 18)).padStart(2, '0')}T00:00:00Z`; it.detail.title += ` v${k}`; it.detail.ld.title = it.detail.title; },
    silent: (it, k) => { it.detail.description_html = `<p>Silently edited ${k}.</p>${it.detail.description_html}`; },
  });
  for (let i = 0; i < n; i++) m.add();
  m.withLastmod = true;
  m.handler = (url) => {
    const u = new URL(url);
    if (u.host !== 'www.metacareers.com') return null;
    if (u.pathname === '/robots.txt') return text('User-agent: *\nDisallow: /ajax/\nDisallow: /login/\n');
    if (u.pathname === '/jobsearch/sitemap.xml') {
      m.counts.list++;
      const urls = m.listed().map((it) => `<url><loc>https://www.metacareers.com/profile/job_details/${it.id}/</loc>${m.withLastmod ? `<lastmod>${it.row.lastmod}</lastmod>` : ''}</url>`).join('');
      return text(`<urlset>${urls}</urlset>`, 200, 'text/xml');
    }
    const id = (/^\/profile\/job_details\/(\d+)\/$/.exec(u.pathname) || [])[1];
    if (id) {
      m.counts.detail++;
      const it = m.items.get(id);
      return it ? text(metaPageHtml(it.detail), 200, 'text/html') : text('<html>gone</html>', 404, 'text/html');
    }
    return text('no', 404);
  };
  return m;
}

/* ----------------------------------------------------------------- Amazon */

function amazon(n) {
  const all = amazonRows({ total: n + 100, seed: 4 });
  const rows = all.slice(0, n);
  const spare = all.slice(n);
  const site = amazonSite(rows);
  const m = {
    rows, counts: { list: 0, detail: 0, probe: 0 },
    add() { const r = spare.shift(); rows.push(r); return String(r.id_icims); },
    editVisible(id) { const r = rows.find((x) => String(x.id_icims) === String(id)); r.title += ' II'; r.description = `Edited. ${r.description}`; },
    editSilent(id) { m.editVisible(id); },
    close(id) { const i = rows.findIndex((x) => String(x.id_icims) === String(id)); rows.splice(i, 1); },
    ids() { return rows.map((r) => String(r.id_icims)); },
    reset() { m.counts = { list: 0, detail: 0, probe: 0 }; },
    handler(url, init) {
      const u = new URL(url);
      if (u.host === 'www.amazon.jobs' && u.pathname.startsWith('/en/jobs/')) {
        m.counts.probe++;
        const id = u.pathname.split('/').pop();
        return rows.some((r) => String(r.id_icims) === id) ? text('', 200, 'text/html') : text('', 404, 'text/html');
      }
      const r = site(url, init);
      if (r && u.pathname === '/en/search.json') m.counts.list++;
      return r;
    },
  };
  return m;
}

/* ------------------------------------------------------- stable (list-only) */

function listOnly({ host, pathRe, file, pick, wrap, idKey, edit }) {
  const tpl = pick(fixture(file));
  const make = (i) => { const r = clone(tpl[i % tpl.length]); r[idKey] = typeof r[idKey] === 'number' ? 4000000 + i : `${String(r[idKey]).slice(0, -6)}${String(100000 + i)}`; if ('isListed' in r) r.isListed = true; return { id: r[idKey], row: r, detail: null }; };
  const m = model(make, { visible: (it, k) => edit(it.row, k), silent: (it, k) => edit(it.row, k) });
  m.handler = (url) => {
    const u = new URL(url);
    if (u.host !== host || !pathRe.test(u.pathname)) return null;
    m.counts.list++;
    return json(wrap(m.listed().map((it) => clone(it.row))));
  };
  return m;
}

export const BOARDS = {
  microsoft: (n) => eightfold('apply.careers.microsoft.com', fixture('bigtech-microsoft.json').records[0], 'pcsx', n),
  nvidia: (n) => eightfold('jobs.nvidia.com', fixture('bigtech-nvidia.json').records[0], 'pcsx', n),
  netflix: (n) => eightfold('explore.jobs.netflix.net', fixture('bigtech-netflix.json').records[0], 'classic', n),
  apple,
  google,
  meta,
  amazon,
  anthropic: (n) => { const m = listOnly({ host: 'boards-api.greenhouse.io', pathRe: /\/v1\/boards\/anthropic\/jobs$/, file: 'greenhouse-jobs.json', pick: (f) => f.jobs, wrap: (jobs) => ({ jobs, meta: { total: jobs.length } }), idKey: 'id', edit: (r, k) => { r.title += ` v${k}`; r.updated_at = `2026-10-${String(10 + (k % 18)).padStart(2, '0')}T00:00:00Z`; } }); for (let i = 0; i < n; i++) m.add(); return m; },
  openai: (n) => { const m = listOnly({ host: 'api.ashbyhq.com', pathRe: /\/posting-api\/job-board\/openai$/, file: 'ashby-board.json', pick: (f) => f.jobs, wrap: (jobs) => ({ apiVersion: '1', jobs }), idKey: 'id', edit: (r, k) => { r.title += ` v${k}`; } }); for (let i = 0; i < n; i++) m.add(); return m; },
  palantir: (n) => { const m = listOnly({ host: 'api.lever.co', pathRe: /\/v0\/postings\/palantir$/, file: 'lever-postings.json', pick: (f) => f, wrap: (jobs) => jobs, idKey: 'id', edit: (r, k) => { r.text += ` v${k}`; } }); for (let i = 0; i < n; i++) m.add(); return m; },
};

/** Detail boards (the delta applies); the rest are list-only. */
export const DETAIL_BOARDS = ['apple', 'google', 'microsoft', 'nvidia', 'netflix', 'meta'];

/** Replace globalThis.fetch with these boards. Returns { restore() }. */
export function serve(...boards) {
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    for (const b of boards) { const r = b.handler(String(url), init); if (r) return r; }
    throw new TypeError(`fetch failed: no network in this test (${url})`);
  };
  return { restore: () => { globalThis.fetch = real; } };
}
