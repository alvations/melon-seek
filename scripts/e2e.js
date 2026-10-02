#!/usr/bin/env node
// End-to-end suite: real server + headless Chromium via Playwright.
// Usage: node scripts/e2e.js [--api-only] [--headed] [--grep=<regex>]
// Not part of `npm test` (needs a browser). Playwright is NOT a repo dependency:
//   npm i playwright --no-save            (or install anywhere and set NODE_PATH / PLAYWRIGHT_MODULE)
// Uses a preinstalled Chromium (PLAYWRIGHT_BROWSERS_PATH, /opt/pw-browsers, or CHROMIUM_PATH).
import { createSuite, loadPlaywright, findChromium, startServer, playwrightInfo } from '../test/e2e/harness.js';
import { registerApiTests } from '../test/e2e/api.e2e.js';
import { registerUiTests } from '../test/e2e/ui.e2e.js';

const args = new Set(process.argv.slice(2));
const apiOnly = args.has('--api-only');
const grepArg = process.argv.find((a) => a.startsWith('--grep='));
const grep = grepArg ? new RegExp(grepArg.slice(7), 'i') : null;

const pw = apiOnly ? null : await loadPlaywright();
if (!apiOnly && !pw) {
  console.error(
    'e2e: the `playwright` package was not found.\n' +
    '  Install it without touching package.json:  npm i playwright --no-save\n' +
    '  or install elsewhere and run with NODE_PATH=/that/dir/node_modules (or PLAYWRIGHT_MODULE=/path/to/playwright).\n' +
    '  A Chromium build is also needed: set PLAYWRIGHT_BROWSERS_PATH / CHROMIUM_PATH, or run `npx playwright install chromium`.\n' +
    '  Run API checks only with: node scripts/e2e.js --api-only',
  );
  process.exit(2);
}

const server = await startServer();
console.log(`e2e: server at ${server.baseUrl}`);
const suite = createSuite();
const ctx = { baseUrl: server.baseUrl, data: {}, notes: [], cleanup: [], pw, browser: null };
registerApiTests(suite);

let browser = null;
if (!apiOnly) {
  const executablePath = findChromium();
  browser = await pw.chromium.launch({ headless: !args.has('--headed'), executablePath });
  ctx.browser = browser;
  console.log(`e2e: playwright ${playwrightInfo.path}`);
  console.log(`e2e: chromium ${browser.version()} (${executablePath || 'playwright default'})`);
  registerUiTests(suite);
}

let results;
try {
  results = await suite.run(ctx, grep);
} finally {
  if (browser) await browser.close().catch(() => {});
  await server.stop();
}
const failed = results.filter((r) => !r.ok);
if (ctx.notes.length) {
  console.log('\ne2e notes (non-fatal observations):');
  for (const n of [...new Set(ctx.notes)]) console.log(`  * ${n}`);
}
const skipped = results.filter((r) => r.skipped).length;
console.log(`\ne2e: ${results.length - failed.length - skipped}/${results.length} passed, ${failed.length} failed${skipped ? `, ${skipped} skipped` : ''}`);
if (failed.length) {
  for (const f of failed) console.log(`  - ${f.name}`);
  if (process.env.E2E_SERVER_LOGS) console.log('\nserver logs:\n' + server.logs.join(''));
}
process.exit(failed.length ? 1 : 0);
