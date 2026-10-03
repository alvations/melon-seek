// In-browser proof for the live path (docs/process/perf-mobile.md): with the page's CSP,
// getJobs() of the new api.js (unpack-worker.js) equals getJobs() of a reference api.js
// (e.g. the pre-change one copied to <dist>/api-old.js), for live Greenhouse responses
// served from gh-<slug>.json (perf-mobile-gh-fixture.mjs).
// usage: NODE_PATH=... node perf-mobile-worker-check.mjs <baseUrl> <fixture dir> [slugs]
import { createRequire } from 'node:module';
import fs from 'node:fs'; import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [base, dir, slugs = 'anthropic,anduril'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*boards-api.greenhouse.io*' }, { urlPattern: '*fonts.g*' }, { urlPattern: '*api.ashbyhq.com*' }] });
cdp.on('Fetch.requestPaused', (e) => {
  const m = e.request.url.match(/boards\/([^/]+)\/jobs/);
  const slug = m && { anthropic: 'anthropic', andurilindustries: 'anduril' }[m[1]];
  const f = slug && path.join(dir, `gh-${slug}.json`);
  if (!f || !fs.existsSync(f)) return cdp.send('Fetch.failRequest', { requestId: e.requestId, errorReason: 'Failed' });
  cdp.send('Fetch.fulfillRequest', { requestId: e.requestId, responseCode: 200, responseHeaders: [{ name: 'content-type', value: 'application/json' }, { name: 'access-control-allow-origin', value: '*' }], body: fs.readFileSync(f).toString('base64') });
});
const errors = []; page.on('console', (m) => { if (m.type() === 'error' && /Content Security|worker/i.test(m.text())) errors.push(m.text()); });
await page.goto(`${base}#c=openai`);
await page.waitForSelector('#resultsList .card[data-id]', { state: 'attached', timeout: 60000 });
for (const slug of slugs.split(',')) {
  const r = await page.evaluate(async (slug) => {
    const deep = (a, b) => { if (a === b) return true; if (typeof a !== typeof b || !a || !b || typeof a !== 'object') return Number.isNaN(a) && Number.isNaN(b); if (Array.isArray(a) !== Array.isArray(b)) return false; const ka = Object.keys(a), kb = Object.keys(b); return ka.length === kb.length && ka.every((k, i) => k === kb[i] && deep(a[k], b[k])); };
    const nu = await import(`./api.js?check=${slug}`), old = await import(`./api-old.js?check=${slug}`);
    let t = performance.now(); const A = await nu.getJobs(slug); const tNew = performance.now() - t;
    t = performance.now(); const B = await old.getJobs(slug); const tOld = performance.now() - t;
    const strip = ({ fetchedAt, jobs, ...r }) => r; // fetchedAt is "now"; F4 ages derive from it
    const sameDropped = String(A.jobs.droppedKeywords && Object.keys(A.jobs.droppedKeywords)) === String(B.jobs.droppedKeywords && Object.keys(B.jobs.droppedKeywords));
    return { slug, mode: [A.mode, B.mode], n: [A.jobs.length, B.jobs.length], equal: deep(A.jobs, B.jobs) && deep(strip(A), strip(B)), keyOrderAndValues: 'deep, key order included', sameDropped, msNew: Math.round(tNew), msOld: Math.round(tOld) };
  }, slug);
  console.log(JSON.stringify(r));
}
const workers = page.workers().map((w) => w.url().split('/').pop());
console.log('workers', workers, 'csp/worker errors', errors);
await b.close();
