// The Juice Score methodology pages, rendered as pages of the site itself, so
// "How it's calculated" never leaves the site:
//
//   methodology/            the guide: docs/METHODOLOGY_GUIDE.md (plain language) with
//                           build-time infographics (scripts/methodology-figures.js)
//   methodology/reference/  the full technical reference: docs/LIVABILITY.md as is
//   methodology/methodology.css  both pages' styles (METHODOLOGY_CSS)
//
//   static build:  scripts/build-static.js writes all three
//   server mode:   GET /methodology/, /methodology/reference/, /methodology/methodology.css
//                  (server/index.js; same renderers, so both modes match)
//
//   methodologyPages({ root, sha?, guidePath?, citiesFile? }) -> { files: { 'index.html', 'reference/index.html',
//                                                           'methodology.css' }, warnings } (Node: reads the repo)
//   renderGuidePage({ md, figures, referenceMd?, sha? }) -> HTML (figures: figureContext(...))
//   renderReferencePage({ md, sha?, depth? })            -> HTML
//   guideAnchors({ md, referenceMd })                    -> { guide, aliases, index, reference }
//
// The guide is docs/METHODOLOGY_GUIDE.md (or $MELON_METHODOLOGY_GUIDE). Without it,
// methodology/ falls back to the reference (the old single page) and the build warns.
//
// Anchors: the drawer links to methodology/#1-the-formula, which the guide must have
// (REQUIRED_GUIDE_IDS; the build fails otherwise). Every other heading id of the reference
// still works on methodology/ too: a guide section that links to reference/#<id> carries
// that id (an alias anchor), and the rest are ids in the guide's index of the reference.
//
// Asset and app links are relative to the page ("../styles.css", "../"), so they work under
// the Pages sub-path and on the server. CSP-clean: no inline script or <style> element, and
// no script at all on these pages except the site's theme-init.js.
import { mdToHtml, esc, commentField } from './md.js';
import { renderFigure, valueOf, figureContext, loadFigureInputs } from './methodology-figures.js';

/** Ids the guide must define (public/app.js JUICE_DOC links to the first). */
export const REQUIRED_GUIDE_IDS = Object.freeze(['1-the-formula']);

/** Files under docs/ that a page may link to, by their site path (from methodology/). Everything else -> text. */
const SITE_LINKS = new Map([
  ['../data/cities.json', 'api/cities.json'], // the published copy of the data
]);

/** Link policy for a rendered doc `depth` folders below the site root: keep in-site targets, turn the rest into text. */
function linkPolicy(depth, { guide = false } = {}) {
  const up = '../'.repeat(depth);
  return (href) => {
    if (SITE_LINKS.has(href)) return up + SITE_LINKS.get(href);
    if (guide && /^reference\/(#[A-Za-z0-9][\w-]*)?$/.test(href)) return href; // the reference page, next door
    return null;
  };
}

const DEFAULT_DESCRIPTION = "How melon·seek's Juice Score is calculated: the formula, tax model, data sources and limitations.";

/**
 * The shared <head> and site bar. `up` is the path to the site root ("../" or "../../").
 * D-37: the beta copy (channel 'beta') says so like the app does: <html data-channel="beta">, "melon·seek
 * beta" in the title and the brand. (No link to the main site: each site's links must stay inside it,
 * scripts/links-policy.js; the app's Beta tag, one tap away, links there.)
 */
const isBeta = (channel) => channel === 'beta';
function head({ title, description, up, css, channel = 'stable' }) {
  return `<!doctype html>
<html lang="en"${isBeta(channel) ? ' data-channel="beta"' : ''}>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)} — melon·seek${isBeta(channel) ? ' beta' : ''}</title>
  <meta name="description" content="${esc(description)}">
  <meta name="color-scheme" content="light dark">
  <link rel="icon" href="${up}favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="${up}styles.css">
  <link rel="stylesheet" href="${css}">
  <script src="${up}theme-init.js"></script>
</head>`;
}
function siteBar(up, extra = '', channel = 'stable') {
  const beta = isBeta(channel);
  return `<nav class="doc-top" aria-label="Site">
    <a class="doc-brand" href="${up}"><img src="${up}favicon.svg" alt="" width="22" height="22"> melon·seek${beta ? ' beta' : ''}</a>
    <span class="doc-top-links">${extra}<a href="${up}">← Back to the jobs</a></span>
  </nav>`;
}

/* ---------------------------------------------------------------- reference */

/**
 * The full technical reference (docs/LIVABILITY.md), at methodology/reference/ (depth 2), or at
 * methodology/ itself (depth 1) when there is no guide.
 * @param {{ md: string, sha?: string|null, depth?: 1|2 }} opts
 */
export function renderReferencePage({ md, sha = null, depth = 2, channel = 'stable' } = {}) {
  const up = '../'.repeat(depth);
  const guide = depth === 2 ? '../' : null;
  const { html, headings } = mdToHtml(md, { link: linkPolicy(depth) });
  const title = (headings.find((h) => h.level === 1) || { text: 'Juice Score methodology' }).text;
  const toc = headings.filter((h) => h.level === 2)
    .map((h) => `<li><a href="#${esc(h.id)}">${esc(h.text)}</a></li>`).join('');
  return `${head({ title: guide ? `${title} (technical reference)` : title, description: DEFAULT_DESCRIPTION, up, css: guide ? '../methodology.css' : 'methodology.css', channel })}
<body class="doc-body">
  ${siteBar(up, guide ? `<a href="${guide}">How it works</a>` : '', channel)}
  <main class="doc-page" id="main">
    <p class="doc-note">The full technical reference behind the Juice Score shown in each job's drawer, kept in step with the code.${guide ? ` New here? <a href="${guide}">Read the plain-language guide with charts</a>.` : ''} An estimate, not financial advice.</p>
    ${toc ? `<nav class="doc-toc" aria-label="Contents"><strong>Contents</strong><ol>${toc}</ol></nav>` : ''}
    ${html}
    <footer class="doc-foot">Rendered from <code>docs/LIVABILITY.md</code>${sha ? ` at build <code>${esc(String(sha).slice(0, 12))}</code>` : ''}. Source references are shown as text; open them yourself if you want to check a figure. ${guide ? `<a href="${guide}">The guide</a> · ` : ''}<a href="${up}">Back to melon·seek</a>.</footer>
  </main>
</body>
</html>
`;
}

/* ---------------------------------------------------------------- guide */

const isHeading = (b, level) => b.heading && b.heading.level === level;
const REF_LINK = /href="reference\/#([A-Za-z0-9][\w-]*)"/g;

/** Group the guide's blocks: [{ heading, blocks }] per h2, with the intro (before the first h2) first. */
function sectionsOf(blocks) {
  const h1 = blocks.findIndex((b) => isHeading(b, 1));
  const title = h1 >= 0 ? blocks[h1].heading : null;
  const rest = blocks.filter((_, k) => k !== h1);
  const intro = [];
  const sections = [];
  for (const b of rest) {
    if (isHeading(b, 2)) sections.push({ heading: b.heading, head: b.html, blocks: [] });
    else if (sections.length) sections[sections.length - 1].blocks.push(b);
    else intro.push(b);
  }
  return { title, intro, sections };
}

/**
 * Which reference ids land where on the guide page (from the guide's blocks):
 *  guide:   ids the guide defines itself (its headings);
 *  aliases: Map(guide h2 id -> [reference ids]) for sections that link to reference/#<id>;
 *  index:   the remaining reference ids, given to entries of the reference index;
 *  reference: the reference's headings.
 */
function anchorsFor(sections, headings, referenceMd) {
  const taken = new Set(headings.map((h) => h.id));
  const ref = referenceMd ? mdToHtml(referenceMd).headings : [];
  const refIds = new Set(ref.map((h) => h.id));
  const aliases = new Map();
  for (const s of sections) {
    for (const m of s.blocks.map((b) => b.html).join('').matchAll(REF_LINK)) {
      const id = m[1];
      if (taken.has(id) || !refIds.has(id)) continue;
      taken.add(id);
      if (!aliases.has(s.heading.id)) aliases.set(s.heading.id, []);
      aliases.get(s.heading.id).push(id);
    }
  }
  return { guide: new Set(headings.map((h) => h.id)), aliases, index: ref.filter((h) => !taken.has(h.id)).map((h) => h.id), reference: ref };
}

/** The anchor map of a guide (placeholders stubbed): see anchorsFor. */
export function guideAnchors({ md, referenceMd = null }) {
  const { blocks, headings } = mdToHtml(md, { link: linkPolicy(1, { guide: true }), figure: () => '<figure></figure>', value: () => '0' });
  return anchorsFor(sectionsOf(blocks).sections, headings, referenceMd);
}

/** "<h2 …>1. The formula <a…>" -> a numbered badge before "The formula" (text and id unchanged). */
function numberBadge(h2html) {
  return h2html.replace(/^(<h2 [^>]*>)(\d+)\.\s+/, '$1<span class="g-num" aria-hidden="true">$2</span><span class="sr-only">$2. </span>');
}

/** Section body: bold-title + list pairs become cards, Q&A h3 groups a grid, "More detail" a link row. */
function sectionBody(blocks) {
  const out = [];
  const qa = blocks.filter((b) => isHeading(b, 3));
  const faq = qa.length >= 2 && qa.every((b) => /\?\s*$/.test(b.heading.text));
  let faqItems = null;
  const emit = (html) => (faqItems ? faqItems[faqItems.length - 1].push(html) : out.push(html));
  let groups = [];
  const flushGroups = () => {
    if (!groups.length) return;
    emit(groups.length > 1 ? `<div class="g-groups">${groups.join('')}</div>` : groups[0]);
    groups = [];
  };
  for (let k = 0; k < blocks.length; k++) {
    const b = blocks[k];
    const next = blocks[k + 1];
    const title = /^<p><strong>([^<]+)<\/strong><\/p>$/.exec(b.html);
    if (title && next && /^<(ul|ol)>/.test(next.html)) {
      const wide = next.html.length > 700 ? ' g-group--wide' : '';
      groups.push(`<div class="g-group${wide}"><p class="g-group-title">${title[1]}</p>${next.html}</div>`);
      k++;
      continue;
    }
    flushGroups();
    if (faq && isHeading(b, 3)) {
      if (!faqItems) { faqItems = []; out.push('\u0000FAQ\u0000'); }
      faqItems.push([b.html]);
      continue;
    }
    emit(/^<p>More detail:/.test(b.html) ? b.html.replace(/^<p>/, '<p class="g-more">') : b.html);
  }
  flushGroups();
  const body = out.join('\n');
  return faqItems ? body.replace('\u0000FAQ\u0000', `<div class="g-faq">${faqItems.map((item) => `<div class="g-qa">${item.join('\n')}</div>`).join('')}</div>`) : body;
}

/** The index of the reference: every heading, with the old ids that need a home here. */
function referenceIndex(reference, indexIds) {
  const give = new Set(indexIds);
  const item = (h) => `<li${give.has(h.id) ? ` id="${esc(h.id)}"` : ''}><a href="reference/#${esc(h.id)}">${esc(h.level === 1 ? 'Overview' : h.text)}</a>`;
  let html = '';
  let open = false;
  for (const h of reference.filter((x) => x.level <= 3)) {
    if (h.level <= 2) {
      if (open) html += '</ul></li>';
      open = false;
      html += item(h);
      if (h.level === 2) { html += '<ul>'; open = true; } else html += '</li>';
    } else html += `${item(h)}</li>`;
  }
  if (open) html += '</ul></li>';
  html = html.replace(/<ul><\/ul>/g, '');
  return `<nav class="g-refindex" aria-label="Sections of the technical reference"><p class="g-refindex-title">Every section of the technical reference</p><ol>${html}</ol></nav>`;
}

/**
 * The guide (docs/METHODOLOGY_GUIDE.md), at methodology/. Unknown placeholders throw.
 * @param {{ md: string, figures: object, referenceMd?: string|null, sha?: string|null }} opts
 *   figures: scripts/methodology-figures.js figureContext(...) for this build's data
 */
export function renderGuidePage({ md, figures, referenceMd = null, sha = null, channel = 'stable' } = {}) {
  if (!figures) throw new Error('renderGuidePage: figures (figureContext) are required');
  const description = commentField(md, 'description') || DEFAULT_DESCRIPTION;
  const { blocks, headings } = mdToHtml(md, {
    link: linkPolicy(1, { guide: true }),
    figure: (name) => renderFigure(name, figures),
    value: (key) => valueOf(key, figures),
  });
  const ids = new Set(headings.map((h) => h.id));
  const missing = REQUIRED_GUIDE_IDS.filter((id) => !ids.has(id));
  if (missing.length) throw Object.assign(new Error(`docs/METHODOLOGY_GUIDE.md has no heading with id ${missing.map((m) => `#${m}`).join(', ')} (the drawer's "How it's calculated" link needs it; heading "1. The formula" or "## … {#1-the-formula}")`), { code: 'GUIDE_ANCHOR' });

  const { title, intro, sections } = sectionsOf(blocks);
  const anchors = anchorsFor(sections, headings, referenceMd);

  // Hero: the title, the one-line definition (first intro paragraph) and the formula at a glance.
  const ledeAt = intro.findIndex((b) => /^<p>/.test(b.html));
  const lede = ledeAt >= 0 ? intro[ledeAt].html.replace(/^<p>/, '<p class="g-lede">') : '';
  const introRest = intro.filter((_, k) => k !== ledeAt).map((b) => b.html).join('\n');
  const v = (k) => esc(valueOf(k, figures));
  const hero = `<header class="g-hero">
      <p class="g-eyebrow"><span aria-hidden="true">🍉</span> Juice Score · methodology</p>
      <h1 id="${esc(title ? title.id : 'top')}">${esc(title ? title.text : 'How the Juice Score works')}</h1>
      ${lede}
      <p class="g-eq"><span class="g-term">Gross pay</span><span class="g-op">−</span><span class="g-term">Tax</span><span class="g-op">−</span><span class="g-term">Rent</span><span class="g-op">−</span><span class="g-term">Living costs</span><span class="g-op">=</span><span class="g-term g-term--net">Juice left</span></p>
      <ul class="g-facts">
        <li><strong>${v('cities.count')}</strong> cities in <strong>${v('countries.count')}</strong> countries</li>
        <li><strong>${v('tax.rules')}</strong> tax rules, checked ${v('tax.asOf')}</li>
        <li>1-bedroom rents <strong>${v('rent.asOf')}</strong></li>
        <li title="${v('rent.method')}">2- and 3-bedroom rents <strong>${v('rent.bedrooms.us')}</strong> in US cities</li>
      </ul>
      <p class="g-hero-links"><a class="g-btn g-btn--primary" href="#1-the-formula">See the formula</a><a class="g-btn" href="reference/">Full technical reference</a></p>
    </header>`;

  const tocItems = sections.map((s) => `<li><a href="#${esc(s.heading.id)}">${esc(s.heading.text)}</a></li>`).join('');
  const lastRefSection = [...sections].reverse().find((s) => /reference/i.test(s.heading.text));
  const indexHtml = anchors.reference.length ? referenceIndex(anchors.reference, anchors.index) : '';
  const secHtml = sections.map((s) => {
    const alias = (anchors.aliases.get(s.heading.id) || []).map((id) => `<span class="g-alias" id="${esc(id)}"></span>`).join('');
    const callout = /limitation|leave|doesn.t (count|include)|not (count|include)/i.test(s.heading.text) ? ' g-sec--callout' : '';
    const extra = s === lastRefSection ? indexHtml : '';
    return `<section class="g-sec${callout}" aria-labelledby="${esc(s.heading.id)}">${alias}${numberBadge(s.head)}\n${sectionBody(s.blocks)}${extra}</section>`;
  }).join('\n');
  const orphanIndex = !lastRefSection && indexHtml ? `<section class="g-sec" aria-label="Technical reference">${indexHtml}</section>` : '';

  return `${head({ title: title ? title.text : 'Juice Score methodology', description, up: '../', css: 'methodology.css', channel })}
<body class="doc-body guide-body">
  <a class="skip-link" href="#main">Skip to content</a>
  ${siteBar('../', '<a class="doc-top-ref" href="reference/">Technical reference</a>', channel)}
  <div class="g-wrap">
    <nav class="g-toc g-toc--side" aria-label="On this page"><p class="g-toc-title">On this page</p><ol>${tocItems}</ol><p class="g-toc-more"><a href="reference/">Technical reference →</a></p></nav>
    <main class="g-main" id="main">
      ${hero}
      <details class="g-toc g-toc--compact"><summary>On this page</summary><nav aria-label="On this page (compact)"><ol>${tocItems}</ol></nav></details>
      ${introRest ? `<section class="g-intro" aria-label="A worked example">${introRest}</section>` : ''}
      ${secHtml}
      ${orphanIndex}
      <footer class="doc-foot">Rendered from <code>docs/METHODOLOGY_GUIDE.md</code>; every chart and number on this page is computed at build time from <code>server/juice.js</code> and <code>data/cities.json</code>${sha ? ` (build <code>${esc(String(sha).slice(0, 12))}</code>)` : ''}. <a href="reference/">Full technical reference</a> · <a href="../">Back to melon·seek</a>.</footer>
    </main>
  </div>
</body>
</html>
`;
}

/**
 * Node only: both pages and the stylesheet from the repo files, as { files: { path under
 * methodology/: content }, warnings }. Throws (err.code 'NO_REFERENCE') without docs/LIVABILITY.md,
 * and on any guide error (unknown placeholder, missing #1-the-formula): the build must fail loudly.
 */
export async function methodologyPages({ root, sha = null, guidePath = null, citiesFile = null, channel = 'stable' } = {}) {
  const [{ readFile }, { existsSync }, path] = await Promise.all([import('node:fs/promises'), import('node:fs'), import('node:path')]);
  const refFile = path.join(root, 'docs', 'LIVABILITY.md');
  if (!existsSync(refFile)) throw Object.assign(new Error('docs/LIVABILITY.md missing'), { code: 'NO_REFERENCE' });
  const referenceMd = await readFile(refFile, 'utf8');
  const guideFile = guidePath || (typeof process !== 'undefined' && process.env.MELON_METHODOLOGY_GUIDE) || path.join(root, 'docs', 'METHODOLOGY_GUIDE.md');
  const warnings = [];
  const files = { 'reference/index.html': renderReferencePage({ md: referenceMd, sha, channel }), 'methodology.css': METHODOLOGY_CSS };
  if (existsSync(guideFile)) {
    const figures = figureContext(await loadFigureInputs(root, { citiesFile }));
    files['index.html'] = renderGuidePage({ md: await readFile(guideFile, 'utf8'), figures, referenceMd, sha, channel });
  } else {
    warnings.push(`${path.relative(root, guideFile)} missing; methodology/ shows the technical reference instead of the guide`);
    files['index.html'] = renderReferencePage({ md: referenceMd, sha, depth: 1, channel });
  }
  return { files, warnings };
}

export const METHODOLOGY_CSS = `/* melon-seek methodology pages (generated by scripts/methodology.js). Uses the site's tokens (public/styles.css). */
/* The app shell's body is a fixed, non-scrolling flex column; a document page scrolls normally. */
html:has(body.doc-body) { height: auto; }
/* No smooth scrolling: a deep link from the drawer (#1-the-formula) must land at once. */
body.doc-body { display: block; height: auto; min-height: 100%; overflow-x: hidden; overflow-y: auto; background: var(--ms-bg); }
.doc-page { max-width: 880px; min-width: 0; box-sizing: border-box; overflow-wrap: break-word; margin: 0 auto; padding: 24px 20px 64px; color: var(--ms-text); font-family: var(--ms-font); line-height: 1.6; }
.doc-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 20px; border-bottom: 1px solid var(--ms-border); background: var(--ms-surface); position: sticky; top: 0; z-index: 5; }
.doc-top a { color: var(--ms-accent); font-weight: 600; text-decoration: none; }
.doc-top a:hover { text-decoration: underline; }
.doc-top-links { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; justify-content: flex-end; }
.doc-brand { display: inline-flex; align-items: center; gap: 8px; color: var(--ms-text) !important; }
@media (max-width: 520px) { .doc-top { padding: 10px 16px; } .doc-top-ref { display: none; } }
.doc-page h1 { font-size: 1.9rem; line-height: 1.2; margin: 8px 0 12px; }
.doc-page h2 { font-size: 1.35rem; margin: 40px 0 10px; padding-top: 8px; border-top: 1px solid var(--ms-border); }
.doc-page h3 { font-size: 1.1rem; margin: 28px 0 8px; }
.doc-page h1, .doc-page h2, .doc-page h3, .doc-page h4, .g-main [id] { scroll-margin-top: 76px; }
.doc-page .anchor, .g-main .anchor { opacity: 0; margin-left: 6px; color: var(--ms-muted); text-decoration: none; font-weight: 400; }
.g-main .anchor { position: absolute; }
.doc-page :is(h1, h2, h3, h4):hover .anchor, .g-main :is(h2, h3):hover .anchor, .doc-page .anchor:focus, .g-main .anchor:focus { opacity: 1; }
.doc-page :target { background: var(--ms-amber-bg, transparent); }
.doc-page a, .g-main a { color: var(--ms-accent); }
.doc-page code, .g-main code { font-family: var(--ms-mono); font-size: 0.88em; background: var(--ms-surface-2); padding: 1px 5px; border-radius: 4px; overflow-wrap: anywhere; }
.doc-page pre { background: var(--ms-surface-2); border: 1px solid var(--ms-border); border-radius: var(--ms-radius-sm, 6px); padding: 12px 14px; overflow-x: auto; max-width: 100%; box-sizing: border-box; white-space: pre; }
.doc-page pre code { background: none; padding: 0; }
.doc-page .table-wrap, .g-main .table-wrap { overflow-x: auto; max-width: 100%; margin: 12px 0; -webkit-overflow-scrolling: touch; }
.doc-page table, .g-main table { border-collapse: collapse; font-size: 0.9rem; }
.doc-page table { min-width: 60%; }
.doc-page th, .doc-page td, .g-main th, .g-main td { border: 1px solid var(--ms-border); padding: 6px 10px; vertical-align: top; text-align: left; }
.doc-page th, .g-main thead th { background: var(--ms-surface-2); }
.doc-page blockquote { margin: 12px 0; padding: 4px 14px; border-left: 3px solid var(--ms-border-strong, var(--ms-border)); color: var(--ms-muted); }
.doc-page .ref-url, .g-main .ref-url { color: var(--ms-muted); font-size: 0.85em; word-break: break-all; }
.doc-toc { background: var(--ms-surface); border: 1px solid var(--ms-border); border-radius: var(--ms-radius-sm, 6px); padding: 10px 16px; margin: 16px 0 8px; }
.doc-toc ol { margin: 4px 0; padding-left: 20px; }
.doc-note { color: var(--ms-muted); font-size: 0.9rem; }
.doc-foot { margin-top: 48px; padding-top: 12px; border-top: 1px solid var(--ms-border); color: var(--ms-muted); font-size: 0.85rem; line-height: 1.6; }
.callout { margin: 16px 0; padding: 12px 16px; border-radius: 10px; background: var(--ms-surface-2); border-left: 4px solid var(--ms-border-strong); }
.callout--warning, .callout--caution { background: var(--ms-amber-bg); border-left-color: var(--ms-amber-border); }
.callout--tip { background: var(--ms-accent-soft); border-left-color: var(--ms-accent); }
.callout-title { margin: 0 0 4px; font-weight: 700; }
.callout > p:last-child { margin-bottom: 0; }

/* ---- Guide (methodology/) ---- */
.guide-body { color: var(--ms-text); font-family: var(--ms-font); }
.g-wrap { max-width: 1120px; margin: 0 auto; padding: 0 20px 72px; display: grid; grid-template-columns: minmax(0, 1fr); gap: 0 48px; box-sizing: border-box; }
.g-main { min-width: 0; max-width: 760px; font-size: 16px; line-height: 1.65; overflow-wrap: break-word; }
.g-main p, .g-main li { max-width: 70ch; }
.g-main :is(.g-sec, .g-intro, .g-group, .g-qa, .callout, blockquote) > :is(ul, ol) { padding-left: 1.3em; }
.g-main :is(.g-sec, .g-intro, .g-group, .g-qa, .callout, blockquote) > :is(ul, ol) > li + li { margin-top: 6px; }
.g-main strong { font-weight: 650; }
.g-hero { padding: 36px 0 26px; }
.g-eyebrow { margin: 0; font-size: 13px; font-weight: 650; letter-spacing: .04em; text-transform: uppercase; color: var(--ms-muted); }
.g-hero h1 { font-size: clamp(2rem, 1.4rem + 2.6vw, 2.75rem); line-height: 1.1; letter-spacing: -.02em; margin: 10px 0 14px; }
.g-lede { font-size: 1.2rem; line-height: 1.55; margin: 0 0 18px; }
.g-eq { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; margin: 0 0 18px; font-weight: 650; font-size: 15px; }
.g-term { padding: 4px 11px; border-radius: 99px; background: var(--ms-surface-2); white-space: nowrap; }
.g-term--net { background: color-mix(in srgb, var(--ms-juice-juicy) 18%, transparent); }
.g-op { color: var(--ms-muted); }
.g-facts { list-style: none; display: flex; flex-wrap: wrap; gap: 6px 22px; padding: 0; margin: 0; font-size: 14px; color: var(--ms-muted); }
.g-facts li { margin: 0 !important; }
.g-facts strong { color: var(--ms-text); }
.g-hero-links { display: flex; flex-wrap: wrap; gap: 10px; margin: 20px 0 0; }
.g-btn { display: inline-flex; align-items: center; min-height: 40px; padding: 0 16px; border-radius: var(--ms-radius-sm); border: 1px solid var(--ms-border-strong); background: var(--ms-surface); color: var(--ms-text) !important; font-weight: 650; font-size: 14px; text-decoration: none; }
.g-btn:hover { background: var(--ms-surface-2); }
.g-btn--primary { background: var(--ms-accent); border-color: transparent; color: var(--ms-accent-text) !important; }
.g-btn--primary:hover { background: var(--ms-accent-strong); }
.g-toc ol { list-style: none; margin: 0; padding: 0; }
.g-toc li { margin: 0; max-width: none; }
.g-toc a { display: block; padding: 6px 12px; border-left: 2px solid var(--ms-border); color: var(--ms-muted); text-decoration: none; font-size: 14px; line-height: 1.35; }
.g-toc a:hover { color: var(--ms-text); border-left-color: var(--ms-accent); }
.g-toc-title { margin: 0 0 8px; font-size: 12px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--ms-muted); }
.g-toc-more { margin: 14px 0 0; font-size: 14px; }
.g-toc-more a { border: 0; padding-left: 12px; color: var(--ms-accent); font-weight: 600; }
.g-toc--side { display: none; }
.g-toc--compact { margin: 0 0 8px; border: 1px solid var(--ms-border); border-radius: 12px; background: var(--ms-surface); }
.g-toc--compact > summary { min-height: 44px; display: flex; align-items: center; padding: 0 16px; font-weight: 650; cursor: pointer; }
.g-toc--compact nav { padding: 0 8px 12px; }
@media (min-width: 1040px) {
  .g-wrap { grid-template-columns: 210px minmax(0, 760px); }
  .g-toc--side { display: block; position: sticky; top: 64px; align-self: start; max-height: calc(100vh - 72px); overflow-y: auto; padding: 40px 0 24px; }
  .g-toc--compact { display: none; }
}
.g-intro { padding: 6px 0 4px; }
.g-sec { padding-top: 44px; }
.g-sec h2 { font-size: 1.6rem; line-height: 1.2; letter-spacing: -.01em; margin: 0 0 14px; padding-top: 22px; border-top: 1px solid var(--ms-border); }
.g-sec h3 { font-size: 1.08rem; margin: 26px 0 6px; }
.g-num { display: inline-grid; place-items: center; vertical-align: 3px; margin-right: 12px; min-width: 32px; height: 32px; border-radius: 99px; background: var(--ms-surface-2); color: var(--ms-muted); font-size: 15px; font-weight: 700; font-variant-numeric: tabular-nums; }
.g-main :is(h2, h3, li):target, .g-alias:target + h2 { background: var(--ms-amber-bg); border-radius: 6px; }
.g-alias { display: block; height: 0; scroll-margin-top: 76px; }
.g-main blockquote { margin: 18px 0; padding: 12px 16px; border-left: 4px solid var(--ms-border-strong); border-radius: 0 10px 10px 0; background: var(--ms-surface-2); color: var(--ms-text); }
.g-main blockquote p { margin: 0; }
.g-main blockquote p + p { margin-top: 8px; }
.g-more { margin: 18px 0 0; font-size: 14px; color: var(--ms-muted); }
.g-groups { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; margin: 16px 0; }
.g-group { padding: 14px 16px; border: 1px solid var(--ms-border); border-radius: 12px; background: var(--ms-surface); }
.g-group--wide { grid-column: 1 / -1; }
.g-group-title { margin: 0 0 6px; font-weight: 700; }
.g-group ul { margin: 0; }
.g-sec--callout .g-group { border-top: 4px solid var(--ms-amber-border); background: color-mix(in srgb, var(--ms-amber-bg) 45%, var(--ms-surface)); }
.g-faq { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; margin-top: 16px; }
.g-qa { padding: 4px 16px 14px; border: 1px solid var(--ms-border); border-radius: 12px; background: var(--ms-surface); }
.g-qa h3 { margin: 12px 0 6px; font-size: 1rem; line-height: 1.35; }
.g-qa p { margin: 0; font-size: 15px; }
.g-qa p + p { margin-top: 8px; }
.g-refindex { margin: 18px 0 0; padding: 16px 18px; border: 1px solid var(--ms-border); border-radius: 12px; background: var(--ms-surface); font-size: 14px; }
.g-refindex-title { margin: 0 0 8px; font-weight: 700; }
.g-refindex ol { list-style: none; padding: 0; margin: 0; columns: 2 260px; column-gap: 28px; }
.g-refindex ol > li { break-inside: avoid; margin: 0 0 8px; }
.g-refindex ul { list-style: none; margin: 2px 0 0; padding: 0 0 0 12px; border-left: 1px solid var(--ms-border); }
.g-refindex ul li { margin: 2px 0 0; color: var(--ms-muted); }
.g-refindex li { max-width: none; }
.guide-body .doc-foot { margin-top: 56px; }

/* ---- Figures (scripts/methodology-figures.js) ---- */
/* Tax-split slots: site tokens in light; in dark, steps chosen for the dark surface (both sets pass
   the dataviz palette validator for adjacent pairs, docs/process/methodology-ux.md). */
:root { --mf-tax-income: var(--ms-blue); --mf-tax-regional: var(--ms-amber); --mf-tax-social: var(--ms-accent); --mf-band: .14; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --mf-tax-income: #3987e5; --mf-tax-regional: #c98500; --mf-tax-social: #199e70; --mf-band: .2; } }
:root[data-theme="dark"] { --mf-tax-income: #3987e5; --mf-tax-regional: #c98500; --mf-tax-social: #199e70; --mf-band: .2; }
.mf { container-type: inline-size; margin: 22px 0; padding: 18px 18px 14px; border: 1px solid var(--ms-border); border-radius: 14px; background: var(--ms-surface); box-shadow: var(--ms-shadow-sm); min-width: 0; }
@media (max-width: 520px) { .mf { padding: 14px 12px 12px; } }
.doc-body .mf svg.mf-svg { display: block; width: 100%; overflow: visible; fill: var(--ms-text); stroke: none; stroke-width: 0; font-family: var(--ms-font); }
.doc-body .mf .mf-ico { width: 22px; height: 22px; color: var(--ms-muted); }
.doc-body .mf .mf-ico--sm { width: 18px; height: 18px; }
.mf-t { fill: var(--ms-text); font-size: 14px; font-weight: 500; }
.mf-small { font-size: 12.5px; }
.mf-m { fill: var(--ms-muted); color: var(--ms-muted); font-weight: 400; }
.mf-strong { font-weight: 700; }
.mf-num { font-variant-numeric: tabular-nums; }
.mf-track { fill: var(--ms-surface-2); }
.mf-bar--gross { fill: color-mix(in srgb, var(--ms-muted) 62%, var(--ms-surface)); background: color-mix(in srgb, var(--ms-muted) 62%, var(--ms-surface)); }
.mf-bar--cost { fill: color-mix(in srgb, var(--ms-faint) 42%, var(--ms-surface)); background: color-mix(in srgb, var(--ms-faint) 42%, var(--ms-surface)); }
.mf-bar--net { fill: var(--ms-juice-juicy); background: var(--ms-juice-juicy); }
.mf-seg, .mf-ruler { stroke: var(--ms-surface); stroke-width: 2px; }
.mf-tax--income { fill: var(--mf-tax-income); background: var(--mf-tax-income); }
.mf-tax--regional { fill: var(--mf-tax-regional); background: var(--mf-tax-regional); }
.mf-tax--social { fill: var(--mf-tax-social); background: var(--mf-tax-social); }
.mf-link, .mf-grid { stroke: var(--ms-border-strong); stroke-width: 1px; }
.mf-axis, .mf-tick, .mf-mark { stroke: var(--ms-faint); stroke-width: 1px; }
.mf-band { fill: var(--_j, var(--ms-juice-dry)); fill-opacity: var(--mf-band); }
.mf-ruler { fill: var(--_j, var(--ms-juice-dry)); }
.mf-curve { fill: none; stroke: var(--ms-juice-juicy); stroke-width: 2.5px; stroke-linejoin: round; stroke-linecap: round; }
.mf-dot { fill: var(--ms-text); stroke: var(--ms-surface); stroke-width: 2px; }
.mf-dot--ex { fill: var(--ms-juice-juicy); }
.mf-kicker { display: flex; align-items: center; gap: 8px; margin: 0 0 12px; font-size: 14px; font-weight: 600; color: var(--ms-text); max-width: none !important; }
.mf-legend { list-style: none; display: flex; flex-wrap: wrap; gap: 4px 18px; padding: 0 !important; margin: 0 0 12px; font-size: 13px; color: var(--ms-muted); }
.mf-legend li { margin: 0 !important; display: inline-flex; align-items: center; }
.mf-key { display: inline-block; flex: none; width: 12px; height: 12px; border-radius: 3px; margin-right: 7px; }
.mf-key--dot { border-radius: 50%; background: var(--ms-text); box-shadow: 0 0 0 2px var(--ms-surface); }
.mf-key--ex { width: 14px; height: 14px; background: var(--ms-juice-juicy); }
.mf-cap { margin: 12px 0 0; font-size: 13px; line-height: 1.5; color: var(--ms-muted); }
.mf-result { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; margin: 6px 0 0; font-size: 15px; max-width: none !important; }
.mf-result strong { font-size: 18px; }
.mf-chip { display: inline-flex; align-items: center; gap: 5px; padding: 1px 10px; border-radius: 99px; font-size: 13px; font-weight: 650; color: var(--ms-text); white-space: nowrap; background: color-mix(in srgb, var(--_j, var(--ms-juice-dry)) 22%, transparent); }
.mf-chip-score { font-weight: 800; font-variant-numeric: tabular-nums; }
.mf-data { margin-top: 10px; }
.mf-data > summary { width: fit-content; cursor: pointer; font-size: 13px; font-weight: 600; color: var(--ms-accent); border-radius: 4px; }
.mf-data table { font-size: 13px; margin: 0; }
.mf-data th[scope="row"] { font-weight: 600; background: none; }
.mf .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
/* formula: a receipt (one line per term) in narrow figures, a five-step flow in wide ones */
.mf-flow { list-style: none; margin: 0; padding: 0 !important; display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; }
.mf-step { position: relative; display: grid; grid-template-columns: 26px minmax(0, 1fr) auto; grid-template-areas: "op head amount" ". note note"; align-items: center; gap: 2px 10px; margin: 0 !important; padding: 10px 12px; border-radius: 12px; background: var(--ms-surface-2); max-width: none !important; }
.mf-step--net { background: color-mix(in srgb, var(--ms-juice-juicy) 16%, var(--ms-surface)); }
.doc-body .mf .mf-step--net .mf-ico { color: var(--ms-juice-juicy); }
.mf-op { grid-area: op; display: grid; place-items: center; width: 24px; height: 24px; border-radius: 99px; background: var(--ms-surface); color: var(--ms-text); font-weight: 700; font-size: 16px; line-height: 1; box-shadow: 0 0 0 1px var(--ms-border-strong); }
.mf-op:empty { visibility: hidden; }
.mf-step-head { grid-area: head; display: flex; align-items: center; gap: 8px; min-width: 0; }
.mf-step-label { font-size: 15px; }
.mf-step-note { grid-area: note; font-size: 13px; line-height: 1.45; color: var(--ms-muted); }
.mf-step-amount { grid-area: amount; justify-self: end; display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: 4px 6px; font-weight: 700; font-size: 16px; font-variant-numeric: tabular-nums; }
@container (min-width: 700px) {
  .mf-flow { grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 16px; }
  .mf-step { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; padding: 14px 12px; }
  .mf-op { position: absolute; left: -8px; top: 50%; transform: translate(-50%, -50%); z-index: 1; }
  .mf-op:empty { display: none; }
  .mf-step-amount { margin-top: auto; justify-content: flex-start; }
}
/* households */
.mf-hh { list-style: none; margin: 0; padding: 0 !important; display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
@container (min-width: 600px) { .mf-hh { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
.mf-hh-card { display: flex; flex-direction: column; margin: 0 !important; padding: 14px; border: 1px solid var(--ms-border); border-radius: 12px; background: var(--ms-bg); max-width: none !important; }
.mf-hh-glyphs { display: flex; align-items: flex-end; justify-content: space-between; gap: 8px; min-height: 26px; color: var(--ms-text); }
.mf-people, .mf-beds { display: inline-flex; align-items: flex-end; gap: 0; }
.doc-body .mf .mf-ico--adult { width: 24px; height: 24px; color: var(--ms-text); margin-right: -3px; }
.doc-body .mf .mf-ico--child { width: 18px; height: 18px; color: var(--ms-text); margin-right: -2px; }
.doc-body .mf .mf-ico--bed { width: 20px; height: 20px; color: var(--ms-muted); }
.mf-hh-name { margin: 10px 0 0 !important; font-size: 16px; }
.mf-hh-who { margin: 2px 0 0; font-size: 13px; line-height: 1.4; color: var(--ms-muted); }
.mf-hh-facts { margin: 12px 0 10px; display: grid; gap: 4px; font-size: 14px; }
.mf-hh-row { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.mf-hh-row dt { color: var(--ms-muted); }
.mf-hh-row dt .mf-m { font-size: 13px; }
.mf-hh-row dd { margin: 0; text-align: right; }
.mf-hh-net { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px; margin-top: auto; padding-top: 10px; border-top: 1px solid var(--ms-border); font-size: 14px; }
.mf-hh-net strong { font-size: 18px; }
.mf-hh-share { margin: 4px 0 0; font-size: 12.5px; }
.mf-svg--mini { margin-top: 6px; }
/* grades */
.mf-grades { list-style: none; margin: 10px 0 0; padding: 0 !important; display: grid; }
.mf-grade { display: grid; grid-template-columns: 84px 60px minmax(0, 1fr); gap: 2px 12px; align-items: baseline; margin: 0 !important; padding: 10px 0; border-top: 1px solid var(--ms-border); max-width: none !important; }
.mf-grade .mf-chip { justify-self: start; }
.mf-grade-range { font-weight: 700; }
.mf-grade-need { font-size: 15px; }
.mf-grade-hint { grid-column: 3; font-size: 14px; }
@container (max-width: 479px) {
  .mf-grade { grid-template-columns: auto minmax(0, 1fr); }
  .mf-grade-need, .mf-grade-hint { grid-column: 1 / -1; }
}
/* sources */
.mf-table-wrap { overflow-x: auto; }
.mf-sources { width: 100%; font-size: 14px !important; table-layout: fixed; }
.mf-col-what { width: 20%; } .mf-col-src { width: 44%; } .mf-col-asof { width: 22%; } .mf-col-cad { width: 14%; }
.mf-sources td, .mf-sources th { padding: 8px 10px; }
.mf-sources th[scope="row"] { background: none; font-weight: 650; }
@container (max-width: 599px) {
  .mf-sources thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .mf-sources, .mf-sources tbody, .mf-sources tr, .mf-sources th, .mf-sources td { display: block; border: 0 !important; }
  .mf-sources tr { padding: 10px 0; border-top: 1px solid var(--ms-border) !important; }
  .mf-sources tr:first-child { border-top: 0 !important; }
  .mf-sources th[scope="row"], .mf-sources td { padding: 2px 0 !important; }
  .mf-sources th[scope="row"] { font-size: 15px; padding-bottom: 4px !important; }
  .mf-sources td::before { content: attr(data-label) ": "; color: var(--ms-muted); font-weight: 600; }
}
/* confidence */
.mf-confs { list-style: none; margin: 0; padding: 0 !important; display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; }
@container (min-width: 600px) { .mf-confs { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
.mf-conf { margin: 0 !important; padding: 14px; border: 1px solid var(--ms-border); border-radius: 12px; background: var(--ms-bg); max-width: none !important; }
.mf-conf-head { display: flex; align-items: center; gap: 10px; font-size: 16px; }
.mf-conf p { margin: 8px 0 0; font-size: 14px; line-height: 1.5; }
.mf-conf-count strong { font-size: 22px; margin-right: 2px; }
.mf-meter { display: inline-flex; gap: 3px; }
.mf-meter-seg { width: 14px; height: 8px; border-radius: 2px; background: var(--ms-surface-3); box-shadow: inset 0 0 0 1px var(--ms-border-strong); }
.mf-meter-seg.is-on { background: var(--ms-text); box-shadow: none; }
@media (forced-colors: active) { .mf-meter-seg.is-on, .mf-key, .mf-chip { forced-color-adjust: none; } }
`;
