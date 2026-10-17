// Google: job-family departments, the Company group-by and the Company filter.
import { launch, openPage, SHOTS, sleep, BASE, ready } from './lib.mjs';
const b = await launch();
const vp = process.argv[2] || 'd1440';
const theme = process.argv[3] || 'light';
const phone = vp.startsWith('p');
const { ctx, page } = await openPage(b, vp, theme, '/beta/#c=google');
const go = async (h, settle = 800) => { await page.goto('about:blank'); await page.goto(`${BASE}/beta/#${h}`); await ready(page); await sleep(settle); };
console.log('group options', JSON.stringify(await page.$$eval('#groupBy option', (o) => o.map((x) => ({ v: x.value, t: x.textContent, title: x.title })))));
console.log('group title', await page.$eval('#groupBy', (e) => e.title));
// Company grouping
await go('c=google&g=brand');
const rows = await page.$$eval('#chartHost .ms-crow__label', (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ')));
console.log('brand rows', JSON.stringify(rows));
await page.screenshot({ path: `${SHOTS}/google-company-group-${vp}-${theme}.png` });
// Department chip popover
await go('c=google');
const chip = page.locator('#quickChips button', { hasText: 'Department' }).first();
await chip.click(); await sleep(600);
const pop = await page.evaluate(() => { const p = document.querySelector('#popover'); return p && !p.hidden ? p.innerText.replace(/\n+/g, ' | ').slice(0, 900) : null; });
console.log('dept popover', pop);
await page.screenshot({ path: `${SHOTS}/google-dept-popover-${vp}-${theme}.png` });
// where is the "Grouped by job title" note, and is it on screen?
const note = await page.evaluate(() => [...document.querySelectorAll('*')].filter((e) => e.children.length === 0 && /Grouped by job title/.test(e.textContent)).map((e) => { const r = e.getBoundingClientRect(); return { tag: e.tagName, cls: e.className, top: Math.round(r.top), h: Math.round(r.height), vis: r.width > 0, inView: r.top < innerHeight && r.bottom > 0 }; }));
console.log('job-title note (popover open)', JSON.stringify(note));
await page.keyboard.press('Escape');
// Company filter: YouTube
await go('c=google&b=YouTube');
console.log('b=YouTube results', await page.$eval('#resultsTitle', (e) => e.innerText), '| quickbar', await page.$eval('#quickChips', (e) => e.innerText.replace(/\s+/g, ' ')));
console.log('rows', JSON.stringify(await page.$$eval('#chartHost .ms-crow__label', (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ')))));
await page.screenshot({ path: `${SHOTS}/google-youtube-filter-${vp}-${theme}.png` });
// cards that say "No department"
await go('c=google&q=YouTube');
const nodept = await page.$$eval('#resultsList article.card', (els) => els.slice(0, 40).map((e) => e.querySelector('.card-dept')?.textContent).filter((t) => /No department/.test(t || '')).length);
console.log('cards with "No department" in first 40 for q=YouTube', nodept);
await ctx.close();
await b.close();
