// fix-phone-controls: before / after screenshots for each finding, on a phone (390x844) and a desktop, in light and
// dark (docs/process/fix-phone-controls.md). Usage, with Playwright on NODE_PATH:
//   node docs/process/scripts/fix-phone-controls-shots.mjs --dist <build> --state before|after [--out docs/screenshots/fix-phone-controls]
// Writes <ID>-<phone|desktop>-<light|dark>-<state>.png. Each scene opens a fresh page; other hosts are aborted.
// A-10 and UX-56 change what a screen reader and the Tab key meet, so their scenes label it on the page: each
// checklist's group name (A-10), and where keyboard focus is (UX-56). M-47's keyboard is the earlier passes'
// simulated one, drawn as a grey block.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); const i = process.argv.indexOf(`--${k}`); return a ? a.slice(k.length + 3) : i > 0 ? process.argv[i + 1] : d; };
const dist = path.resolve(arg('dist', 'dist'));
const state = arg('state', 'after');
const out = path.resolve(arg('out', 'docs/screenshots/fix-phone-controls'));
const only = arg('only', '');
const req = createRequire(import.meta.url);
const pwPath = (process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean).map((p) => path.join(p, 'playwright')).find((p) => fs.existsSync(p)) || 'playwright';
const { chromium } = req(pwPath);
fs.mkdirSync(out, { recursive: true });

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = http.createServer((q, res) => {
  const u = new URL(q.url, 'http://x');
  let p = path.join(dist, decodeURIComponent(u.pathname.replace(/^\/melon-seek\//, '')));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!p.startsWith(dist) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  const type = MIME[path.extname(p)] || 'application/octet-stream';
  const body = fs.readFileSync(p);
  if (/text|javascript|json|svg/.test(type) && /gzip/.test(q.headers['accept-encoding'] || '')) { res.writeHead(200, { 'content-type': type, 'content-encoding': 'gzip' }); return res.end(zlib.gzipSync(body)); }
  res.writeHead(200, { 'content-type': type });
  res.end(body);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const beta = `${origin}/melon-seek/beta/`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
const DEV = {
  phone: { viewport: { width: 390, height: 844 }, userAgent: IOS, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
};
const ready = (page) => page.waitForFunction(() => { const t = document.querySelector('#resultsTitle'); return t && t.querySelector('strong') && !/Loading/.test(t.textContent); }, null, { timeout: 120000 });
const KEYBOARD_INIT = (kb) => {
  const desc = Object.getOwnPropertyDescriptor(VisualViewport.prototype, 'height');
  Object.defineProperty(VisualViewport.prototype, 'height', { configurable: true, get() { const a = document.activeElement; return a && a.matches && a.matches('input:not([type=checkbox]):not([type=radio]):not([type=range])') ? innerHeight - kb : desc.get.call(this); } });
  const fire = () => setTimeout(() => visualViewport.dispatchEvent(new Event('resize')), 30);
  document.addEventListener('focusin', fire);
  document.addEventListener('focusout', fire);
};
/** A caption fixed at the top of the page (what the shot shows that pixels alone do not). */
const caption = (page, text) => page.evaluate((text) => {
  const c = document.createElement('div');
  c.textContent = text;
  Object.assign(c.style, { position: 'fixed', left: '8px', right: '8px', bottom: '8px', zIndex: 99999, padding: '6px 10px', font: '600 13px system-ui, sans-serif', background: '#111c', color: '#fff', borderRadius: '6px', pointerEvents: 'none' });
  document.body.append(c);
}, text);

async function scene(id, dev, theme, fn) {
  const name = `${id}-${dev}-${theme}-${state}.png`;
  const context = await browser.newContext({ ...DEV[dev], colorScheme: theme });
  await context.route((u) => !u.href.startsWith(origin) && !u.href.startsWith('data:') && !u.href.startsWith('blob:'), (r) => r.abort('blockedbyclient'));
  try {
    const page = await fn(context);
    await page.screenshot({ path: path.join(out, name) });
    console.log(`  ${name}`);
  } catch (e) {
    console.log(`  ${name}: FAILED ${e.message.split('\n')[0]}`);
  } finally {
    await context.close();
  }
}
/** Amazon with its list held back, so its first-page preview stays up. */
async function held(context, dev) {
  let release;
  const gate = new Promise((r) => { release = r; });
  await context.route(/\/api\/jobs\/amazon\.json/, async (r) => { await gate; await r.continue().catch(() => {}); });
  const page = await context.newPage();
  await page.goto(`${beta}#c=amazon`);
  await page.waitForSelector('#resultsList .card[data-preview-id]', { timeout: 60000 });
  await sleep(500);
  if (dev === 'phone') { await page.tap('#sheetHandle'); await sleep(700); }
  page.release = release;
  return page;
}
const open = async (context, hash) => { const page = await context.newPage(); await page.goto(`${beta}#${hash}`); await ready(page); await sleep(900); return page; };

const SCENES = {
  'M-43': (dev) => async (context) => {
    const page = await held(context, dev);
    const card = page.locator('#resultsList .card[data-preview-id]').nth(1);
    if (dev === 'phone') await card.tap(); else await card.click();
    await sleep(450);
    await caption(page, '0.4 s after a tap on the 2nd card, Amazon\'s whole list still loading');
    return page;
  },
  'A-11': (dev) => async (context) => {
    const page = await held(context, dev);
    await page.evaluate(() => document.querySelectorAll('#resultsList .card[data-preview-id]')[2].focus());
    await page.keyboard.press('ArrowDown');
    await sleep(300);
    const where = await page.evaluate(() => { const c = document.activeElement; const all = [...document.querySelectorAll('#resultsList .card')]; return c?.matches?.('.card') ? `card ${all.indexOf(c) + 1}` : c === document.body ? 'the page (lost)' : c?.tagName; });
    await caption(page, `Focus on preview card 3, then ArrowDown: focus is on ${where}`);
    return page;
  },
  'M-40': (dev) => async (context) => {
    const page = await open(context, 'c=amazon');
    if (dev === 'phone') {
      await page.evaluate(() => document.querySelector('#quickChips [data-pop=dept]').scrollIntoView({ inline: 'center' }));
      await page.tap('#quickChips [data-pop=dept]');
      await sleep(1000);
      await page.evaluate(() => [...document.querySelectorAll('#filterBody .check-label')].find((e) => /--Technical$/.test(e.textContent))?.scrollIntoView({ block: 'center' }));
    } else {
      await page.click('#quickChips [data-pop=dept]');
      await page.waitForSelector('#popover .dept-filter label.check');
    }
    await sleep(400);
    return page;
  },
  'A-10': (dev) => async (context) => {
    const page = await open(context, 'c=google');
    if (dev === 'phone') { await page.tap('#quickChips [data-pop=dept]'); await sleep(1000); } else { await page.click('#quickChips [data-pop=dept]'); await page.waitForSelector('#popover .dept-filter label.check'); }
    await sleep(300);
    await page.evaluate(() => {
      for (const g of document.querySelectorAll('.dept-filter [role=group].checklist')) {
        if (!g.getClientRects().length) continue;
        const ids = (g.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean);
        const name = (g.getAttribute('aria-label') || ids.map((i) => document.getElementById(i)?.textContent.trim() || '').join(' ')).trim();
        const tagEl = document.createElement('div');
        tagEl.textContent = `screen reader: “group${name ? `, ${name}` : ' (no name)'}”`;
        Object.assign(tagEl.style, { font: '600 12px system-ui, sans-serif', color: name ? '#0b7a5c' : '#b3261e', margin: '2px 0 4px' });
        g.before(tagEl);
        g.style.outline = `2px dashed ${name ? '#0b7a5c' : '#b3261e'}`;
      }
    });
    if (dev === 'phone') await page.evaluate(() => document.querySelector('#filterBody .dept-filter')?.scrollIntoView({ block: 'start' }));
    return page;
  },
  'M-47': (dev) => async (context) => {
    const land = dev === 'phone';
    if (land) await context.addInitScript(KEYBOARD_INIT, 190);
    const page = await context.newPage();
    if (land) await page.setViewportSize({ width: 844, height: 390 });
    await page.goto(`${beta}#c=amazon&m=insights`);
    await ready(page);
    await page.waitForSelector('#compHost input.ms-comp__input', { timeout: 60000 });
    await sleep(1200);
    const field = page.locator('#compHost input.ms-comp__input >> visible=true').first();
    await field.evaluate((e) => e.scrollIntoView({ block: 'end' }));
    await sleep(300);
    if (land) await field.tap(); else await field.click();
    await sleep(1000);
    if (land) {
      await page.evaluate(() => { const k = document.createElement('div'); Object.assign(k.style, { position: 'fixed', left: 0, right: 0, bottom: 0, height: '190px', background: '#8889', zIndex: 99998 }); k.textContent = 'keyboard (simulated, 190 px)'; Object.assign(k.style, { font: '600 14px system-ui', color: '#fff', display: 'grid', placeItems: 'center' }); document.body.append(k); });
    }
    return page;
  },
  'UX-56': (dev) => async (context) => {
    const page = await context.newPage();
    if (dev === 'desktop') await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto(`${beta}#c=google`);
    await ready(page);
    await sleep(800);
    // Tab until focus is on the filter sheet's controls or past them (at most 40 presses), then say where it is.
    let f = null;
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      f = await page.evaluate(() => { const e = document.activeElement; const r = e.getBoundingClientRect(); return { name: (e.getAttribute('aria-label') || e.innerText || e.id || e.tagName).trim().replace(/\s+/g, ' ').slice(0, 28), inFilters: !!e.closest('#filters'), on: r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight, x: Math.round(r.left) }; });
      if (f.inFilters || f.name === 'Group roles by') break; // the closed sheet's controls come before the chart's in the page
    }
    await caption(page, f.inFilters ? `Tab reached “${f.name}” in the closed filter sheet, off screen at x=${f.x}: focus is lost` : `Tab skips the closed filter sheet: focus on “${f.name}”${f.on ? '' : ' (off screen)'}`);
    return page;
  },
  'UX-57': (dev) => async (context) => {
    const page = await open(context, 'c=amazon');
    const btn = page.locator('#chartHost .ms-note__more >> visible=true').first();
    if (await btn.count()) { await btn.click(); await sleep(400); }
    const n = await page.evaluate(() => [...document.querySelectorAll('#vizToolbar button, #vizToolbar select')].filter((e) => e.getClientRects().length).length);
    await caption(page, `Chart view toolbar: ${n} controls; the chart notes' Details is open`);
    return page;
  },
};

try {
  for (const [id, mk] of Object.entries(SCENES)) {
    if (only && !only.split(',').includes(id)) continue;
    for (const dev of ['phone', 'desktop']) for (const theme of ['light', 'dark']) await scene(id, dev, theme, mk(dev));
  }
} finally {
  await browser.close();
  server.close();
}
