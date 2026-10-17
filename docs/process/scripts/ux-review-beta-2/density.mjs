// Text-density inventory: every secondary line on every board at p390, p360 and d1440 (light).
// node density.mjs <vps> <boards> -> density-<board>-<vp>.json, plus screenshots of the key views.
import { launch, VP, BASE, SHOTS, sleep, ready, BOARDS } from './lib.mjs';
import fs from 'node:fs';
const LEAFS = fs.readFileSync(new URL('./leafs-fn.js', import.meta.url), 'utf8');
const picks = JSON.parse(fs.readFileSync(new URL('./picks.json', import.meta.url), 'utf8'));
const vps = (process.argv[2] || 'p390,p360,d1440').split(',');
const only = process.argv[3] ? process.argv[3].split(',') : null;
const shots = process.env.SHOTS !== '0';
const b = await launch();
async function leafs(page, root, opts) { return page.evaluate(({ fn, root, opts }) => eval(fn)(root, opts), { fn: LEAFS, root, opts }); }
for (const vp of vps) for (const [slug, site] of BOARDS) {
  if (only && !only.includes(slug)) continue;
  const phone = vp.startsWith('p');
  const ctx = await b.newContext({ ...VP[vp], colorScheme: 'light' });
  await ctx.route((u) => !u.href.startsWith(BASE.replace('/melon-seek', '')) && !u.href.startsWith('data:') && !u.href.startsWith('blob:'), (r) => r.abort('blockedbyclient'));
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  const base = `${BASE}/${site ? site + '/' : ''}`;
  const go = async (hash, settle = 800) => { await page.goto('about:blank'); await page.goto(`${base}#${hash}`); await ready(page); await sleep(settle); };
  const out = { slug, vp, views: {} };
  const rec = async (view, roots, opts = {}) => {
    const all = [];
    for (const r of roots) all.push(...await leafs(page, r, opts));
    // de-duplicate by path+text
    const seen = new Set();
    out.views[view] = all.filter((x) => { const k = x.path + x.text; if (seen.has(k)) return false; seen.add(k); return true; });
  };
  const shot = async (view) => { if (shots && (vp === 'p390' || vp === 'd1440')) await page.screenshot({ path: `${SHOTS}/density-${slug}-${vp}-${view}.png` }); };
  // 1. Chart (Clusters)
  await go(`c=${slug}`);
  await rec('chart', ['#vizToolbar', '#chartHost', '#results > header, #results .results-head, #resultsTitle', '#topbar, header.topbar, .topbar', '.juice-scale', '#tagline'], { minWords: 1, exclude: '.ms-crow__name, article.card' });
  await shot('chart');
  // phone: the sheet raised, to read the list's lines (juice scale) and the card meta rows
  if (phone) {
    await page.locator('#sheetHandle').tap().catch(() => {}); await sleep(700);
    await rec('sheet', ['#results'], { minWords: 1, exclude: 'article.card .card-title' });
    await shot('sheet');
  } else {
    await rec('list', ['#results'], { minWords: 1, exclude: 'article.card .card-title' });
  }
  // 2. Ranges
  await go(`c=${slug}&v=ranges`);
  await rec('ranges', ['#vizToolbar', '#chartHost'], { minWords: 1, exclude: '.ms-row__name, .ms-rrow__name' });
  await shot('ranges');
  // 3. Map
  await go(`c=${slug}&m=map`, 2000);
  await rec('map', ['#mapHost', '#vizToolbar'], { minWords: 1, exclude: '.leaflet-tile-pane' });
  await shot('map');
  // Juice mode of the map
  const juiceBtn = page.locator('#mapHost button', { hasText: /^Juice$/ }).first();
  if (await juiceBtn.count()) { await juiceBtn.click().catch(() => {}); await sleep(900); await rec('mapJuice', ['#mapHost'], { minWords: 1, exclude: '.leaflet-tile-pane' }); await shot('mapjuice'); }
  // 4. Insights
  await go(`c=${slug}&m=insights`, 1500);
  await page.waitForFunction(() => /roles/.test(document.querySelector('#insightsPanel .ms-insights__sub')?.textContent || ''), null, { timeout: 60000 }).catch(() => {});
  await sleep(800);
  await rec('insights', ['#insightsHost', '#compHost', '#insightsPanel', '#compsCardHost'], { minWords: 1 });
  await shot('insights');
  // 5. Filters panel (the notes under each section)
  await go(`c=${slug}`);
  if (phone) { await page.locator('#filtersToggle').tap().catch(() => {}); await sleep(700); }
  await rec('filters', ['#filters'], { minWords: 3, exclude: '.check, label' });
  if (phone) await shot('filters');
  // 6. Drawers
  await go(`c=${slug}`);
  const first = await page.evaluate(() => document.querySelector('#resultsList .card')?.dataset.id);
  const P = { top: first, ...(picks[slug] || {}) };
  for (const [k, id] of Object.entries(P)) {
    if (!id) continue;
    await go(`c=${slug}&job=${encodeURIComponent(id)}`, 1100);
    await rec(`drawer:${k}`, ['#drawer'], { minWords: 1, exclude: '.desc, .d-desc, .d-bullets, .kw-group, .drawer-head, .d-title, .bullets' });
    if (['top', 'nopay', 'levels', 'places', 'minimum', 'shift', 'term', 'foreign'].includes(k)) await shot(`drawer-${k}`);
  }
  // 7. Empty search
  await go(`c=${slug}&q=zzqxnomatch`, 600);
  await rec('empty', ['#vizOverlay', '#resultsList', '#vizToolbar'], { minWords: 1 });
  out.errors = errs;
  fs.writeFileSync(new URL(`./density-${slug}-${vp}.json`, import.meta.url), JSON.stringify(out, null, 1));
  console.log(vp, slug, Object.fromEntries(Object.entries(out.views).map(([k, v]) => [k, v.length])), errs.length ? 'ERR ' + errs.join('|').slice(0, 200) : '');
  await ctx.close();
}
await b.close();
