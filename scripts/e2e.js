#!/usr/bin/env node
// End-to-end suite: real server + headless Chromium via Playwright.
// Usage: node scripts/e2e.js [--api-only] [--headed] [--grep=<regex>] [--list] [--shard=<i>/<n> [--timings=<log>]]
//                            [--max-skips=<n>]
//   --list           print the tests the run would take (after --grep and --shard), start nothing, exit 0.
//   --shard=i/n      run the i-th of n contiguous slices of the test list (1-based), so CI can run the ~900 tests in
//                    n parallel jobs. Slices keep the registration order; with --timings=<an earlier e2e log> they
//                    are cut at equal time (each test weighs its last duration), else at equal test counts.
//   --max-skips=n    exit 1 when more than n tests skip (E2E_MAX_SKIPS): a build without a board turns that board's
//                    tests into skips, which pass (qa-suite-beta T-5).
// Not part of `npm test` (needs a browser). Playwright is NOT a repo dependency:
//   npm i playwright --no-save            (or install anywhere and set NODE_PATH / PLAYWRIGHT_MODULE)
// Uses a preinstalled Chromium (PLAYWRIGHT_BROWSERS_PATH, /opt/pw-browsers, or CHROMIUM_PATH).
import fs from 'node:fs';
import { createSuite, loadPlaywright, findChromium, startServer, playwrightInfo } from '../test/e2e/harness.js';
import { registerApiTests } from '../test/e2e/api.e2e.js';
import { registerUiTests } from '../test/e2e/ui.e2e.js';
import { registerLinkTests } from '../test/e2e/links.e2e.js';
import { registerMobileQaTests } from '../test/e2e/mobile-qa.e2e.js';
import { registerDesktopQaTests } from '../test/e2e/desktop-qa.e2e.js';
import { registerMethodologyTests } from '../test/e2e/methodology.e2e.js';
import { registerBadgeTests } from '../test/e2e/badge.e2e.js';
import { registerFixVizTests } from '../test/e2e/fix-viz.e2e.js';
import { registerFixEstimatesTests } from '../test/e2e/fix-estimates.e2e.js';
import { registerFixAppTests } from '../test/e2e/fix-app.e2e.js';
import { registerBetaDesktopQaTests } from '../test/e2e/beta-desktop-qa.e2e.js';
import { registerBetaMobileQaTests } from '../test/e2e/beta-mobile-qa.e2e.js';
import { registerBetaMobileQa2Tests } from '../test/e2e/beta-mobile-qa-2.e2e.js';
import { registerBetaMobileQa3Tests } from '../test/e2e/beta-mobile-qa-3.e2e.js';
import { registerFixPayDataTests } from '../test/e2e/fix-pay-data.e2e.js';
import { registerFixBetaAppTests } from '../test/e2e/fix-beta-app.e2e.js';
import { registerFix3AppTests } from '../test/e2e/fix3-app.e2e.js';
import { registerFix3CompareTests } from '../test/e2e/fix3-compare.e2e.js';
import { registerFix3DataTests } from '../test/e2e/fix3-data.e2e.js';
import { registerFixViz3Tests } from '../test/e2e/fix3-viz.e2e.js';
import { registerBetaA11yTests } from '../test/e2e/beta-a11y.e2e.js';
import { registerFixCompanyScrollTests } from '../test/e2e/fix-company-scroll.e2e.js';
import { registerBetaDesktopQa2Tests } from '../test/e2e/beta-desktop-qa-2.e2e.js';
import { registerBetaDesktopQa3Tests } from '../test/e2e/beta-desktop-qa-3.e2e.js';
import { registerBetaVizReviewTests } from '../test/e2e/beta-viz-review.e2e.js';
import { registerBetaUxReviewTests } from '../test/e2e/beta-ux-review.e2e.js';
import { registerFix4AppTests } from '../test/e2e/fix4-app.e2e.js';
import { registerFixDensityTests } from '../test/e2e/fix-density.e2e.js';
import { registerGoogleGroupingTests } from '../test/e2e/google-grouping.e2e.js';
import { registerVizEvenTests } from '../test/e2e/viz-even.e2e.js';
import { registerBetaA11y2Tests } from '../test/e2e/beta-a11y-2.e2e.js';
import { registerBetaVizReviewTests2 } from '../test/e2e/beta-viz-review-2.e2e.js';
import { registerBetaUxReview2Tests } from '../test/e2e/beta-ux-review-2.e2e.js';
import { registerFixTouchTipsTests } from '../test/e2e/fix-touch-tips.e2e.js';
import { registerFixPhoneControlsTests } from '../test/e2e/fix-phone-controls.e2e.js';
import { registerFixSec3Tests } from '../test/e2e/fix-sec-3.e2e.js';
import { registerFixData3Tests } from '../test/e2e/fix-data-3.e2e.js';
import { registerPhoneMatrixTests } from '../test/e2e/phone-matrix.e2e.js';
import { registerFixPhoneTextTests } from '../test/e2e/fix-phone-text.e2e.js';
import { registerFixPayAtPlaceTests } from '../test/e2e/fix-pay-at-place.e2e.js';
import { registerBetaMobileQa4Tests } from '../test/e2e/beta-mobile-qa-4.e2e.js';
import { registerBetaCoverageTests } from '../test/e2e/beta-coverage.e2e.js';
import { registerFixViz5Tests } from '../test/e2e/fix-viz-5.e2e.js';
import { registerBetaDesktopQa4Tests } from '../test/e2e/beta-desktop-qa-4.e2e.js';
import { registerFixQa4Tests } from '../test/e2e/fix-qa4.e2e.js';
import { registerFixMr3Tests } from '../test/e2e/fix-mr-3.e2e.js';

const args = new Set(process.argv.slice(2));
const apiOnly = args.has('--api-only');
const grepArg = process.argv.find((a) => a.startsWith('--grep='));
const grep = grepArg ? new RegExp(grepArg.slice(7), 'i') : null;
const listOnly = args.has('--list');
const valueOf = (k) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
const shardArg = valueOf('shard');
const shard = shardArg ? (/^(\d+)\/(\d+)$/.exec(shardArg) || []).slice(1).map(Number) : null;
if (shardArg && !(shard.length === 2 && shard[0] >= 1 && shard[0] <= shard[1])) { console.error(`e2e: --shard=${shardArg}: expected i/n with 1 <= i <= n`); process.exit(2); }
const maxSkips = valueOf('max-skips') ?? process.env.E2E_MAX_SKIPS ?? null;

/** Contiguous slices of `names` with about equal weight (a test's ms in an earlier log, else the median; 1 without a log). */
function shardOf(names, [i, n], logFile) {
  const ms = new Map();
  if (logFile) {
    for (const m of fs.readFileSync(logFile, 'utf8').matchAll(/^ {2}[\u2713\u2717] (.*) \((\d+)ms\)$/gm)) ms.set(m[1], Number(m[2]));
  }
  const known = [...ms.values()].sort((a, b) => a - b);
  const fallback = known.length ? known[Math.floor(known.length / 2)] : 1;
  const w = names.map((x) => ms.get(x) ?? fallback);
  const total = w.reduce((a, b) => a + b, 0);
  const out = new Set();
  let acc = 0;
  names.forEach((x, k) => {
    const mid = acc + w[k] / 2; // a test belongs to the slice its midpoint falls in
    acc += w[k];
    if (Math.min(n - 1, Math.floor((mid / total) * n)) === i - 1) out.add(x);
  });
  return out;
}

const pw = apiOnly || listOnly ? null : await loadPlaywright();
if (!apiOnly && !listOnly && !pw) {
  console.error(
    'e2e: the `playwright` package was not found.\n' +
    '  Install it without touching package.json:  npm i playwright --no-save\n' +
    '  or install elsewhere and run with NODE_PATH=/that/dir/node_modules (or PLAYWRIGHT_MODULE=/path/to/playwright).\n' +
    '  A Chromium build is also needed: set PLAYWRIGHT_BROWSERS_PATH / CHROMIUM_PATH, or run `npx playwright install chromium`.\n' +
    '  Run API checks only with: node scripts/e2e.js --api-only',
  );
  process.exit(2);
}

const server = listOnly ? null : await startServer();
if (server) console.log(`e2e: server at ${server.baseUrl}`);
const suite = createSuite();
const ctx = { baseUrl: server?.baseUrl ?? null, data: {}, notes: [], cleanup: [], pw, browser: null };
registerApiTests(suite);

let browser = null;
let relaunches = 0;
/**
 * Stop on SIGTERM, SIGHUP and SIGINT (qa-suite-beta T-12). Playwright's own handlers (launch's handleSIGTERM and
 * handleSIGHUP, on by default) close the browser on SIGTERM or SIGHUP and let the process run on, so a `timeout`, a
 * tool's time limit or a stopped session closed Chromium mid-run and every later test failed on "Target page, context
 * or browser has been closed" (the 2026-10-17 gate runs ended at their own `timeout 5400`, exit 124). Here the run stops
 * before its next test, the test in progress ends now (the browser closes), and the summary says how many did not run.
 * A second signal exits at once.
 */
let stopSignal = null;
const SIGNAL_CODES = { SIGHUP: 1, SIGINT: 2, SIGTERM: 15 };
for (const sig of Object.keys(SIGNAL_CODES)) {
  process.on(sig, () => {
    if (stopSignal) process.exit(128 + SIGNAL_CODES[sig]);
    stopSignal = sig;
    console.log(`\n  ! ${sig}: stopping; the test in progress ends now and the rest are not run`);
    suite.stop(sig);
    if (browser) browser.close().catch(() => {});
  });
}
if (!apiOnly) {
  const executablePath = findChromium();
  let disconnected = false;
  const launch = async () => {
    const b = await pw.chromium.launch({ headless: !args.has('--headed'), executablePath, handleSIGTERM: false, handleSIGHUP: false, handleSIGINT: false });
    b.on('disconnected', () => { disconnected = true; });
    return b;
  };
  if (!listOnly) {
    browser = await launch();
    ctx.browser = browser;
    console.log(`e2e: playwright ${playwrightInfo.path}`);
    console.log(`e2e: chromium ${browser.version()} (${executablePath || 'playwright default'})`);
  }
  // A real crash (the browser disconnected and no signal asked for it): relaunch, so one crash fails one test.
  ctx.ensureBrowser = async () => {
    if (stopSignal || !disconnected) return;
    disconnected = false;
    relaunches += 1;
    console.log(`  ! the browser disconnected on its own; relaunching it (${relaunches})`);
    browser = ctx.browser = await launch();
  };
  registerUiTests(suite);
  registerLinkTests(suite); // T-4 (qa-suite-beta): written for this suite, never registered until 2026-10-23
  registerMobileQaTests(suite);
  registerDesktopQaTests(suite);
  registerBadgeTests(suite);
  registerMethodologyTests(suite);
  registerFixVizTests(suite);
  registerFixEstimatesTests(suite);
  registerFixAppTests(suite);
  registerBetaDesktopQaTests(suite);
  registerBetaMobileQaTests(suite);
  registerBetaMobileQa2Tests(suite);
  registerBetaMobileQa3Tests(suite);
  registerFixPayDataTests(suite);
  registerFixBetaAppTests(suite);
  registerFix3AppTests(suite);
  registerFix3CompareTests(suite);
  registerFix3DataTests(suite);
  registerFixViz3Tests(suite);
  registerBetaA11yTests(suite);
  registerFixCompanyScrollTests(suite);
  registerBetaDesktopQa2Tests(suite);
  registerBetaVizReviewTests(suite);
  registerBetaUxReviewTests(suite);
  registerFix4AppTests(suite);
  registerFixDensityTests(suite);
  registerGoogleGroupingTests(suite);
  registerVizEvenTests(suite);
  registerBetaA11y2Tests(suite);
  registerBetaDesktopQa3Tests(suite);
  registerBetaVizReviewTests2(suite);
  registerBetaUxReview2Tests(suite);
  registerFixTouchTipsTests(suite);
  registerFixPhoneControlsTests(suite);
  registerFixSec3Tests(suite);
  registerFixData3Tests(suite);
  registerPhoneMatrixTests(suite);
  registerFixPhoneTextTests(suite);
  registerFixPayAtPlaceTests(suite);
  registerBetaMobileQa4Tests(suite);
  registerBetaCoverageTests(suite);
  registerFixViz5Tests(suite);
  registerBetaDesktopQa4Tests(suite);
  registerFixQa4Tests(suite);
  registerFixMr3Tests(suite);
}

const only = shard ? shardOf(suite.names(grep), shard, valueOf('timings')) : null;
if (listOnly) {
  const names = suite.names(grep).filter((x) => !only || only.has(x));
  for (const x of names) console.log(x);
  console.error(`e2e: ${names.length} tests${shard ? ` in shard ${shard.join('/')}` : ''}`);
  process.exit(0);
}
if (shard) console.log(`e2e: shard ${shard.join('/')}: ${only.size} of ${suite.names(grep).length} tests`);

let results;
try {
  results = await suite.run(ctx, grep, { only });
} finally {
  if (browser) await browser.close().catch(() => {});
  await server.stop();
}
const failed = results.filter((r) => !r.ok);
if (relaunches) console.log(`e2e: the browser was relaunched ${relaunches} time(s) after it disconnected on its own`);
const stop = suite.stopped();
if (stop) console.log(`e2e: stopped by ${stop.reason}: ${results.length} tests ran, ${stop.notRun} not run`);
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
const tooManySkips = maxSkips != null && skipped > Number(maxSkips);
if (skipped) {
  const why = new Map();
  for (const r of results.filter((x) => x.skipped)) why.set(r.reason, (why.get(r.reason) || 0) + 1);
  console.log(`\ne2e: skipped, by reason${tooManySkips ? ` (more than --max-skips=${maxSkips}: the run fails)` : ''}:`);
  for (const [r, k] of [...why].sort((a, b) => b[1] - a[1])) console.log(`  ${k} × ${r}`);
}
if (stop) process.exit(128 + SIGNAL_CODES[stop.reason]);
process.exit(failed.length || tooManySkips ? 1 : 0);
