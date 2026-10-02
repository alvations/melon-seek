#!/usr/bin/env node
// Render the social share card: public/og/card.html -> public/og/melon-seek-og.png
// (1200x630 PNG, used as og:image / twitter:image; see docs/process/social.md).
//
// The PNG is committed, so neither CI nor the Pages deploy needs a browser.
// Re-run this only when card.html changes, then commit both files.
//
//   PW_DIR=<dir with node_modules/playwright-core> node scripts/build-og.mjs
//
// Playwright is NOT a dependency of this repo. Install it outside the repo:
//   mkdir -p /tmp/pw && (cd /tmp/pw && npm init -y && npm i playwright-core)
// Chromium: $CHROMIUM_PATH, else /opt/pw-browsers/chromium-*/chrome-linux/chrome,
// else whatever Playwright already has installed. This script never downloads
// a browser (no `playwright install`).
//
// Options: --out <png> (default public/og/melon-seek-og.png)
//          --html <file> (default public/og/card.html)
// Google Fonts (Inter) is fetched by the page; HTTPS_PROXY is passed to
// Chromium if set. If Inter can't load, the card falls back to a system sans
// and the script warns.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? path.resolve(args[i + 1]) : dflt; };
const HTML = opt('--html', path.join(ROOT, 'public', 'og', 'card.html'));
const OUT = opt('--out', path.join(ROOT, 'public', 'og', 'melon-seek-og.png'));
const WIDTH = 1200;
const HEIGHT = 630;
const MAX_BYTES = 5 * 1024 * 1024; // LinkedIn's og:image limit

function loadPlaywright() {
  const dirs = [process.env.PW_DIR, process.cwd(), ROOT].filter(Boolean);
  for (const dir of dirs) {
    const req = createRequire(path.join(path.resolve(dir), 'noop.js'));
    for (const name of ['playwright-core', 'playwright']) {
      try { return req(name); } catch { /* try next */ }
    }
  }
  throw new Error('playwright-core not found. Install it outside the repo (see the header of scripts/build-og.mjs) and set PW_DIR to that directory.');
}

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = '/opt/pw-browsers';
  if (!fs.existsSync(base)) return undefined; // let Playwright use its own install
  const dirs = fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse();
  for (const d of dirs) {
    const exe = path.join(base, d, 'chrome-linux', 'chrome');
    if (fs.existsSync(exe)) return exe;
  }
  return undefined;
}

/** { width, height } from a PNG's IHDR chunk, or null if it isn't a PNG. */
export function pngSize(buf) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length < 24 || !buf.subarray(0, 8).equals(sig) || buf.toString('latin1', 12, 16) !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

async function main() {
  const { chromium } = loadPlaywright();
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const browser = await chromium.launch({
    executablePath: findChromium(),
    ...(proxy ? { proxy: { server: proxy, bypass: process.env.NO_PROXY || process.env.no_proxy || undefined } } : {}),
  });
  try {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1, colorScheme: 'light' });
    // Fetch web fonts from Node rather than Chromium: Node trusts the CAs in
    // NODE_EXTRA_CA_CERTS (needed behind TLS-inspecting proxies), Chromium may not.
    await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, async (route) => {
      try { await route.fulfill({ response: await route.fetch() }); } catch { await route.abort(); }
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('requestfailed', (r) => errors.push(`request failed: ${r.url()} (${r.failure() && r.failure().errorText})`));
    await page.goto(pathToFileURL(HTML).href, { waitUntil: 'networkidle', timeout: 30_000 });
    const inter = await page.evaluate(async () => {
      await document.fonts.ready;
      return ['500', '700', '800'].every((w) => document.fonts.check(`${w} 20px Inter`)) &&
        [...document.fonts].some((f) => f.family.replace(/"/g, '') === 'Inter' && f.status === 'loaded');
    });
    if (!inter) console.warn('! Inter did not load (offline or blocked?); the card used the fallback font. Re-run with network access before committing.');
    for (const e of errors) console.warn(`! ${e}`);
    // Nothing in the card may spill past the 1200x630 frame.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight);
    if (overflow) console.warn('! card.html overflows 1200x630; check the layout');
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    await page.screenshot({ path: OUT, type: 'png', clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
  } finally {
    await browser.close();
  }
  const buf = fs.readFileSync(OUT);
  const dim = pngSize(buf);
  if (!dim || dim.width !== WIDTH || dim.height !== HEIGHT) throw new Error(`unexpected PNG size ${JSON.stringify(dim)}`);
  if (buf.length > MAX_BYTES) throw new Error(`PNG is ${buf.length} bytes, over LinkedIn's 5 MB limit`);
  console.log(`Wrote ${path.relative(ROOT, OUT)}: ${dim.width}x${dim.height}, ${(buf.length / 1024).toFixed(0)} KiB`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  main().catch((err) => {
    console.error(`build-og failed: ${err.message}`);
    process.exit(1);
  });
}
