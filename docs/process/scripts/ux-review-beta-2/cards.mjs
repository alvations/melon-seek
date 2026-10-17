// Cards for chosen postings: visible text, pill width vs card, title lines, clipping. Screenshot each.
import { launch, VP, BASE, SHOTS, sleep, ready } from './lib.mjs';
import fs from 'node:fs';
const picks = JSON.parse(fs.readFileSync(new URL('./picks.json', import.meta.url), 'utf8'));
const jobs = {};
const title = (slug, id) => { jobs[slug] ||= JSON.parse(fs.readFileSync(new URL(`./jobs-${slug}.json`, import.meta.url), 'utf8')).jobs; return jobs[slug].find((j) => j.id === id)?.title; };
const vps = (process.argv[2] || 'd1440,p390').split(',');
const kinds = (process.argv[3] || 'levels,places,minimum,shift,term,foreign,hourly,longtitle').split(',');
const b = await launch();
for (const vp of vps) {
  const ctx = await b.newContext({ ...VP[vp], colorScheme: 'light' });
  await ctx.route((u) => !u.href.startsWith(BASE.replace('/melon-seek', '')) && !u.href.startsWith('data:') && !u.href.startsWith('blob:'), (r) => r.abort('blockedbyclient'));
  const page = await ctx.newPage();
  for (const [slug, P] of Object.entries(picks)) for (const k of kinds) {
    const id = P[k]; if (!id) continue;
    const t = title(slug, id); if (!t) continue;
    const site = slug === 'anduril' ? '' : 'beta/';
    await page.goto('about:blank'); await page.goto(`${BASE}/${site}#c=${slug}&q=${encodeURIComponent(t)}`); await ready(page); await sleep(400);
    if (vp.startsWith('p')) { await page.evaluate(() => document.querySelector('#sheetHandle')?.click()); await sleep(800); }
    const card = page.locator(`#resultsList article.card[data-id="${id}"]`);
    if (!(await card.count())) { console.log(vp, slug, k, 'card not in list'); continue; }
    await card.scrollIntoViewIfNeeded().catch(() => {});
    const m = await card.evaluate((e) => {
      const pill = e.querySelector('.sal-pill, .pay-pill, .pill, [class*=pill]');
      const ttl = e.querySelector('.card-title, h3');
      const lines = (el) => { if (!el) return 0; const r = document.createRange(); r.selectNodeContents(el); const mids = []; for (const x of r.getClientRects()) { if (x.width < .5) continue; const m = x.top + x.height / 2; if (!mids.some((t) => Math.abs(t - m) < 6)) mids.push(m); } return mids.length; };
      const cut = [...e.querySelectorAll('*')].filter((x) => x.children.length === 0 && x.scrollWidth > x.clientWidth + 1 && /hidden|ellipsis/.test(getComputedStyle(x).overflow + getComputedStyle(x).textOverflow)).map((x) => `${x.className}: "${x.textContent.trim().slice(0, 50)}"`);
      return { text: e.innerText.replace(/\s+/g, ' '), pill: pill?.textContent, pillW: pill ? Math.round(pill.getBoundingClientRect().width) : 0, pillLines: lines(pill), cardW: Math.round(e.getBoundingClientRect().width), titleLines: lines(ttl), cut, pillTitle: pill?.title?.slice(0, 200) };
    });
    console.log(vp, slug, k, JSON.stringify(m));
    const box = await card.boundingBox();
    if (box && box.y >= 0) await page.screenshot({ path: `${SHOTS}/card-${slug}-${k}-${vp}-light.png`, clip: { x: Math.max(0, box.x - 6), y: Math.max(0, box.y - 6), width: Math.min(box.width + 12, VP[vp].viewport.width - Math.max(0, box.x - 6)), height: box.height + 12 } }).catch(() => {});
  }
  await ctx.close();
}
await b.close();
