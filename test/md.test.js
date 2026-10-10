// scripts/md.js: the tiny markdown renderer behind the /methodology/ pages (guide and reference).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mdToHtml, commentField } from '../scripts/md.js';
import { renderReferencePage } from '../scripts/methodology.js';

test('a link whose label is a code span keeps the code (QA M-6)', () => {
  const { html } = mdToHtml('Code: [`server/juice.js`](../server/juice.js) and [`a` + `b`](#x).');
  assert.ok(!html.includes('undefined'), html);
  assert.match(html, /<code>server\/juice\.js<\/code>/);
  assert.match(html, /<a href="#x"><code>a<\/code> \+ <code>b<\/code><\/a>/);
});

test('the reference page never renders a lost placeholder as "undefined"', () => {
  const html = renderReferencePage({ md: readFileSync(new URL('../docs/LIVABILITY.md', import.meta.url), 'utf8') });
  const text = html.replace(/<code>[^<]*<\/code>/g, '').replace(/<[^>]+>/g, '');
  assert.ok(!/\bundefined\b/.test(text), 'found "undefined" outside a code span');
  assert.ok(!/[\u0000\u0001]/.test(html), 'placeholder byte leaked');
});

test('HTML comments are dropped (generated-block markers never show on the page)', () => {
  const md = 'Before.\n\n<!-- freshness:begin x/y -->\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n<!-- freshness:end x/y -->\n\n<!-- melon:generated juice-worked-examples start -->\n<!--\nmulti-line\n-->\nAfter.\n\n```\n<!-- kept in code -->\n```';
  const { html } = mdToHtml(md);
  assert.doesNotMatch(html, /freshness:|melon:generated|multi-line/);
  assert.match(html, /<table>/);
  assert.match(html, /<p>Before\.<\/p>/);
  assert.match(html, /<p>After\.<\/p>/);
  assert.match(html, /&lt;!-- kept in code --&gt;/, 'comments inside code fences stay');
  assert.match(mdToHtml('<!-- note --> Text after.').html, /<p>Text after\.<\/p>/, 'text after "-->" on the same line is kept');
  assert.equal(commentField('<!-- description: A short\n  summary. -->\n# T', 'description'), 'A short summary.');
  assert.equal(commentField('# T', 'description'), null);
});

test('heading ids: GitHub slugs, {#custom} ids, duplicates numbered', () => {
  const { headings, html } = mdToHtml('## 1. The formula\n\n## Score {#score-curve}\n\n## Again\n\n## Again');
  assert.deepEqual(headings.map((h) => h.id), ['1-the-formula', 'score-curve', 'again', 'again-1']);
  assert.match(html, /<h2 id="score-curve">Score <a class="anchor"/, 'the {#id} text is not shown');
  assert.throws(() => mdToHtml('## A {#x}\n\n## B {#x}'), /duplicate heading id/);
});

test('placeholders: {{figure:…}} blocks and {{value:…}} text; anything unknown throws', () => {
  const figure = (n) => `<figure data-figure="${n}"></figure>`;
  const value = (k) => { if (k === 'a.b') return '$1,000'; throw new Error(`unknown value ${k}`); };
  const { html, blocks } = mdToHtml('# T\n\nPay {{value:a.b}} a year.\n\n{{figure:waterfall}}\n\n| x | {{value:a.b}} |\n|---|---|\n| 1 | 2 |', { figure, value });
  assert.match(html, /<p>Pay \$1,000 a year\.<\/p>/);
  assert.match(html, /<figure data-figure="waterfall"><\/figure>/);
  assert.match(html, /<th>\$1,000<\/th>/, 'values work in tables');
  assert.ok(blocks.some((b) => b.heading && b.heading.id === 't'));
  assert.ok(!html.includes('{{'));
  assert.throws(() => mdToHtml('x {{value:nope}}', { figure, value }), /unknown value nope/);
  assert.throws(() => mdToHtml('a {{figure:waterfall}} b', { figure, value }), (e) => e.code === 'MD_PLACEHOLDER' && /own/.test(e.message));
  assert.throws(() => mdToHtml('a {{typo:x}} b', { figure, value }), (e) => e.code === 'MD_PLACEHOLDER' && /unknown placeholder/.test(e.message));
  assert.throws(() => mdToHtml('a {{value:a.b}}', { value: () => '*bold*' }), /Markdown syntax/);
  // Without placeholder callbacks (the reference page) text is left alone.
  assert.match(mdToHtml('literal {{x}}').html, /literal \{\{x\}\}/);
});

test('GitHub alerts become callouts; plain blockquotes stay', () => {
  const { html } = mdToHtml('> [!NOTE]\n> Hello **x**.\n\n> Plain quote.');
  assert.match(html, /<aside class="callout callout--note" role="note"><p class="callout-title">Note<\/p><p>Hello <strong>x<\/strong>\.<\/p><\/aside>/);
  assert.match(html, /<blockquote><p>Plain quote\.<\/p><\/blockquote>/);
});

test('docs/LIVABILITY.md renders the same blocks it always did (reference page)', () => {
  const md = readFileSync(new URL('../docs/LIVABILITY.md', import.meta.url), 'utf8');
  const { html, headings, blocks } = mdToHtml(md);
  assert.equal(blocks.map((b) => b.html).join('\n'), html);
  assert.ok(headings.some((h) => h.id === '1-the-formula'));
  assert.doesNotMatch(html, /&lt;!--/, 'no comment shown as text');
});
