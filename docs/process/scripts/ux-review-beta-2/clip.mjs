// Clip a region at 2x: node clip.mjs <vp> <theme> <url> <x,y,w,h> <name> [js-before]
import { chromium } from 'playwright';
import { BASE, SHOTS, VP, sleep, ready } from './lib.mjs';
const [vp, theme, url, box, name, js] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ ...VP[vp], deviceScaleFactor: 2, colorScheme: theme });
await ctx.route((u) => !u.href.startsWith(BASE.replace('/melon-seek', '')) && !u.href.startsWith('data:') && !u.href.startsWith('blob:'), (r) => r.abort('blockedbyclient'));
const page = await ctx.newPage();
await page.goto(BASE + url);
await ready(page);
if (js) { const r = await page.evaluate(js); if (r !== undefined) console.log(JSON.stringify(r)); await sleep(900); }
const [x, y, w, h] = box.split(',').map(Number);
await page.screenshot({ path: `${SHOTS}/${name}.png`, clip: { x, y, width: w, height: h } });
await b.close();
