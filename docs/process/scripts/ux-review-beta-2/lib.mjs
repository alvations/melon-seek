import { chromium } from 'playwright';
export const BASE = process.env.BASE || 'http://127.0.0.1:5482/melon-seek';
export const SHOTS = process.env.SHOTS_DIR || '/home/user/melon-seek/.claude/worktrees/agent-af29c49e4f4fc6d19/docs/screenshots/ux-review-beta-2';
export const VP = {
  d1440: { viewport: { width: 1440, height: 900 } },
  d1280: { viewport: { width: 1280, height: 800 } },
  d1024: { viewport: { width: 1024, height: 768 } },
  t768: { viewport: { width: 768, height: 1024 }, hasTouch: true },
  p390: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  p360: { viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function launch() { return chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', timeout: 60000 }); }
export async function openPage(browser, vp = 'd1440', theme = 'light', url = '/beta/#c=apple', { wait = true, timeout = 90000 } = {}) {
  const ctx = await browser.newContext({ ...VP[vp], colorScheme: theme });
  await ctx.route((u) => !u.href.startsWith(BASE.replace('/melon-seek', '')) && !u.href.startsWith('data:') && !u.href.startsWith('blob:'), (r) => r.abort('blockedbyclient'));
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.goto(BASE + url);
  if (wait) await ready(page, timeout);
  return { ctx, page };
}
export async function ready(page, timeout = 90000) {
  await page.waitForFunction(() => { const t = document.querySelector('#resultsTitle'); return t && t.querySelector('strong') && !/Loading/.test(t.textContent); }, null, { timeout });
  await sleep(700);
}
export const BOARDS = [['amazon', 'beta'], ['apple', 'beta'], ['google', 'beta'], ['meta', 'beta'], ['microsoft', 'beta'], ['nvidia', 'beta'], ['netflix', 'beta'], ['anduril', '']];
export function url(slug, site, extra = '') { return `/${site ? site + '/' : ''}#c=${slug}${extra}`; }
// Hard stop so nothing hangs.
setTimeout(() => { console.log('HARD TIMEOUT'); process.exit(3); }, +(process.env.HARD || 900000)).unref();
