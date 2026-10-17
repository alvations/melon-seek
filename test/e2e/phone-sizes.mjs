// The phone sizes every phone check covers. The user, 2026-10-16: "Make sure we check for all phone sizes from
// iPhone mini to razr to duo or something". CSS viewport sizes (width x height in CSS px), device pixel ratio, and
// the platform (its user agent and engine family). Foldables and dual-screen devices are listed per posture.
// Used by test/e2e/webkit/phone-smoke.mjs, test/e2e/phone-matrix.e2e.js and the QA templates; fix lanes and QA
// passes test their phone changes on every entry.
const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
const ANDROID_UA = (model) => `Mozilla/5.0 (Linux; Android 15; ${model}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36`;

const ios = (name, width, height, dpr) => ({ name, width, height, dpr, platform: 'ios', ua: IOS_UA });
const android = (name, width, height, dpr, model) => ({ name, width, height, dpr, platform: 'android', ua: ANDROID_UA(model) });

/** Portrait phones, narrowest first. */
export const PHONES = Object.freeze([
  android('Galaxy Fold (folded)', 280, 653, 3, 'SM-F900U'),            // the narrowest phone screen in use
  ios('iPhone SE (1st gen)', 320, 568, 2),
  android('Galaxy Z Fold 5 (cover)', 344, 882, 2.625, 'SM-F946U'),
  android('Galaxy S8 / small Android', 360, 740, 4, 'SM-G950U'),
  android('Galaxy Z Flip 5', 360, 880, 3, 'SM-F731U'),
  ios('iPhone 13 mini', 375, 812, 3),
  ios('iPhone SE (3rd gen)', 375, 667, 2),
  ios('iPhone 15 / 16', 393, 852, 3),
  ios('iPhone 13 / 14', 390, 844, 3),
  android('Pixel 8', 412, 915, 2.625, 'Pixel 8'),
  android('Motorola razr (inner, open)', 412, 1005, 2.625, 'motorola razr 50 ultra'),
  ios('iPhone 15 Pro Max', 430, 932, 3),
  android('Surface Duo (one screen)', 540, 720, 2.5, 'Surface Duo'),
  android('Galaxy Z Fold 5 (open)', 690, 829, 2.625, 'SM-F946U'),
]);

/** Postures that are not a plain portrait phone: cover screens, spanned dual screens, landscape. */
export const POSTURES = Object.freeze([
  android('Motorola razr (cover screen)', 352, 355, 3, 'motorola razr 40 ultra'),
  android('Surface Duo (spanned, two screens)', 1114, 720, 2.5, 'Surface Duo'),
  // The Duo turned a quarter: two 720x540 screens stacked, a 34 px hinge across at y 540–574 (fix-phone-sizes).
  android('Surface Duo (spanned, stacked)', 720, 1114, 2.5, 'Surface Duo'),
  ios('iPhone 13 mini (landscape)', 812, 375, 3),
  ios('iPhone SE (3rd gen, landscape)', 667, 375, 2),
  android('Motorola razr (inner, landscape)', 1005, 412, 2.625, 'motorola razr 50 ultra'),
]);

export const ALL_SIZES = Object.freeze([...PHONES, ...POSTURES]);

/** Playwright context options for one entry (isMobile is Chromium-only; WebKit takes the rest). */
export function contextFor(d, engine = 'chromium') {
  const o = { viewport: { width: d.width, height: d.height }, deviceScaleFactor: d.dpr, hasTouch: true, userAgent: d.ua };
  if (engine !== 'firefox') o.isMobile = true;
  return o;
}
