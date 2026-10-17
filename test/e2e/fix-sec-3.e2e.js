// fix-sec-3 lane (docs/process/fix-sec-3.md), S-4 residual (docs/REVIEW.md "beta review 2026-10-16"): when a
// posting's link is dropped (the normalizer keeps only http(s), and for a beta company only its own posting hosts),
// the drawer used to render the "Apply on <company>'s careers site" button anyway, naming this site's own host and
// with no href. Now it shows no button and one line, "No link to the posting". The server-mode lists are patched
// in the browser (route), so this runs on any data, demo included.
import { assert } from './harness.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isExternal = (url, origin) => !!url && !url.startsWith(origin) && !url.startsWith('data:') && !url.startsWith('blob:');

async function openWithLinks(ctx, setUrl) {
  const context = await ctx.browser.newContext({ viewport: { width: 1440, height: 900 } });
  ctx.cleanup.push(() => context.close());
  const origin = new URL(ctx.baseUrl).origin;
  await context.route((u) => isExternal(u.href, origin), (r) => r.abort('blockedbyclient'));
  // The list and the per-posting detail both carry `url`: rewrite both.
  await context.route(/\/api\/jobs?\?/, async (route) => {
    const r = await route.fetch();
    let body;
    try { body = await r.json(); } catch { return route.fulfill({ response: r }); }
    for (const j of Array.isArray(body.jobs) ? body.jobs : []) j.url = setUrl(j);
    if (body.job) body.job.url = setUrl(body.job);
    if (body.url !== undefined) body.url = setUrl(body);
    return route.fulfill({ response: r, body: JSON.stringify(body) });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(`${ctx.baseUrl}/#c=anthropic`);
  await page.locator('#resultsTitle strong').first().waitFor({ timeout: 30000 });
  await sleep(400);
  await page.locator('#resultsList .card[data-id]').first().click();
  await page.locator('#drawer .d-title').waitFor({ timeout: 8000 });
  await sleep(400);
  return { page, errors };
}

export function registerFixSec3Tests(suite) {
  for (const [label, setUrl] of [['no link (dropped by the normalizer)', () => null], ['a javascript: link (an old snapshot)', () => "javascript:window.__x='apply'"]]) {
    suite.test(`fix-sec-3: [S-4 residual] a posting with ${label} has no Apply button, and the drawer says "No link to the posting"`, async (ctx) => {
      const { page, errors } = await openWithLinks(ctx, setUrl);
      const apply = await page.locator('#drawer a.apply').count();
      const foot = (await page.locator('#drawer .drawer-foot').innerText()).trim();
      assert(apply === 0, `the drawer still renders an Apply button (${apply}); foot reads "${foot}"`);
      assert(/^No link to the posting$/m.test(foot), `foot reads "${foot}"`);
      assert(await page.locator('#drawer .drawer-foot button[aria-label="Copy link to this role"]').count() === 1, 'the Copy link button stays');
      assert(!errors.length, errors.join(' | '));
    });
  }

  suite.test('fix-sec-3: [S-4 residual] a posting with a real link keeps its Apply button and host', async (ctx) => {
    const { page, errors } = await openWithLinks(ctx, (j) => j.url);
    const a = page.locator('#drawer a.apply');
    assert(await a.count() === 1, 'no Apply button');
    const href = await a.getAttribute('href');
    assert(/^https:\/\//.test(href || ''), `href ${href}`);
    assert((await a.locator('.apply-host').innerText()) === new URL(href).hostname.replace(/^www\./, ''), 'host shown under Apply');
    assert(!errors.length, errors.join(' | '));
  });
}
