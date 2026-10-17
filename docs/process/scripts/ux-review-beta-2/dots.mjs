// Circle labels on the clusters chart: text wider than its circle, ink contrast on the circle's fill,
// overlapping circles, and whether the biggest circle in a row is the one labelled.
import { launch, openPage, BOARDS, url } from './lib.mjs';
import fs from 'node:fs';
const CONTRAST = fs.readFileSync(new URL('./contrast-fn.js', import.meta.url), 'utf8');
const b = await launch();
const vps = (process.argv[2] || 'd1440,p390').split(',');
const themes = (process.argv[3] || 'light,dark').split(',');
const only = process.argv[4] ? process.argv[4].split(',') : null;
for (const vp of vps) for (const theme of themes) for (const [slug, site] of BOARDS) {
  if (only && !only.includes(slug)) continue;
  const { ctx, page } = await openPage(b, vp, theme, url(slug, site));
  if (vp.startsWith('p')) { await page.locator('#sheetHandle').tap().catch(() => {}); await page.waitForTimeout(200); await page.locator('#sheetHandle').tap().catch(() => {}); await page.waitForTimeout(500); }
  const r = await page.evaluate((cfn) => {
    const contrast = eval(cfn);
    const out = { wide: [], ink: [], overlap: [], unlabelledBigger: [] };
    const rows = [...document.querySelectorAll('.ms-row, .ms-crow, [class*="ms-row"]')];
    const bins = [...document.querySelectorAll('.ms-bin:not(.ms-bin--overflow)')];
    for (const bin of bins) {
      const dot = bin.querySelector('.ms-bin__dot');
      if (!dot) continue;
      const t = dot.textContent.trim();
      const dr = dot.getBoundingClientRect();
      if (t) {
        const range = document.createRange(); range.selectNodeContents(dot);
        const tr = range.getBoundingClientRect();
        if (tr.width > dr.width - 2) out.wide.push(`"${t}" text ${tr.width.toFixed(1)}px in a ${dr.width.toFixed(1)}px circle`);
        const c = contrast(dot);
        if (c < 4.5) out.ink.push(`"${t}" ${c.toFixed(2)}:1 (${getComputedStyle(dot).color} on ${getComputedStyle(dot).backgroundColor})`);
      }
    }
    // overlap between neighbouring circles in the same row container
    const byParent = new Map();
    for (const bin of bins) { const p = bin.parentElement; if (!byParent.has(p)) byParent.set(p, []); byParent.get(p).push(bin); }
    for (const [p, list] of byParent) {
      const ds = list.map((bin) => ({ t: bin.querySelector('.ms-bin__dot')?.textContent.trim() || '', r: bin.querySelector('.ms-bin__dot').getBoundingClientRect(), label: bin.getAttribute('aria-label') || '' }));
      ds.sort((a, b) => a.r.left - b.r.left);
      for (let i = 1; i < ds.length; i++) {
        const a = ds[i - 1], c = ds[i];
        const gap = c.r.left - a.r.right;
        if (gap < -0.5) out.overlap.push(`${gap.toFixed(1)}px: "${a.label.slice(0, 50)}" | "${c.label.slice(0, 50)}"`);
      }
      const labelled = ds.filter((d) => d.t);
      const maxW = Math.max(...ds.map((d) => d.r.width));
      for (const l of labelled) for (const d of ds) if (!d.t && d.r.width > l.r.width + 1) out.unlabelledBigger.push(`labelled "${l.t}" ${l.r.width.toFixed(0)}px < unlabelled ${d.r.width.toFixed(0)}px (${d.label.slice(0, 40)})`);
    }
    return out;
  }, CONTRAST);
  console.log(vp, theme, slug, JSON.stringify(r));
  await ctx.close();
}
await b.close();
