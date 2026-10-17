// Amazon's first-page preview: what the screen says while the big list loads, and what changes when it lands.
// node preview.mjs <vp> <theme> <cpuRate> [slug]
import { launch, VP, BASE, SHOTS, sleep } from './lib.mjs';
const [vp = 'p390', theme = 'light', rate = '4', slug = 'amazon'] = process.argv.slice(2);
const b = await launch();
const ctx = await b.newContext({ ...VP[vp], colorScheme: theme });
await ctx.route((u) => !u.href.startsWith(BASE.replace('/melon-seek', '')) && !u.href.startsWith('data:') && !u.href.startsWith('blob:'), (r) => r.abort('blockedbyclient'));
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: +rate });
// Fast 4G-ish: 9 Mbit/s down, 150 ms RTT (perf-mobile-beta-2's profile).
await cdp.send('Network.enable');
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 9e6 / 8, uploadThroughput: 1.5e6 / 8 });
const t0 = Date.now();
page.goto(`${BASE}/beta/#c=${slug}`).catch(() => {});
const seen = [];
let last = '';
let shot = 0;
for (let i = 0; i < 200; i++) {
  await sleep(250);
  const s = await page.evaluate(() => {
    const q = (sel) => { const e = document.querySelector(sel); return e && e.getBoundingClientRect().width ? e.innerText.replace(/\s+/g, ' ').trim() : ''; };
    const cards = [...document.querySelectorAll('#resultsList article.card')];
    return {
      results: q('#resultsTitle'), stats: q('#statsLine'), badge: q('#dataBadge .data-badge__label, #dataBadge'), notes: [...document.querySelectorAll('.ms-note')].map((e) => e.innerText.replace(/\s+/g, ' ').trim()).join(' | '),
      cards: cards.length, first: cards[0]?.querySelector('.card-title, h3')?.textContent.trim().slice(0, 40) || '',
      chart: document.querySelectorAll('.ms-bin').length, sheet: q('#sheetHandle, .sheet-peek'),
      filters: document.querySelectorAll('#filterPanel input[type=checkbox]').length, busy: document.querySelector('[aria-busy="true"]')?.id || '',
      skeleton: document.querySelectorAll('.skeleton, [class*=skel]').length,
    };
  }).catch(() => null);
  if (!s) continue;
  const key = JSON.stringify({ ...s });
  if (key !== last) {
    const t = Date.now() - t0;
    console.log(t, key);
    last = key;
    if (shot < 8) { await page.screenshot({ path: `${SHOTS}/preview-${slug}-${vp}-${theme}-${shot}.png` }); shot++; }
  }
  if (s.results && !/Loading/.test(s.results) && s.chart > 0 && i > 8) { await sleep(1500); await page.screenshot({ path: `${SHOTS}/preview-${slug}-${vp}-${theme}-done.png` }); break; }
}
await b.close();
