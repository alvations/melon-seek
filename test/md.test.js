// scripts/md.js: the tiny markdown renderer behind the /methodology/ page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mdToHtml } from '../scripts/md.js';
import { renderMethodologyPage } from '../scripts/methodology.js';

test('a link whose label is a code span keeps the code (QA M-6)', () => {
  const { html } = mdToHtml('Code: [`server/juice.js`](../server/juice.js) and [`a` + `b`](#x).');
  assert.ok(!html.includes('undefined'), html);
  assert.match(html, /<code>server\/juice\.js<\/code>/);
  assert.match(html, /<a href="#x"><code>a<\/code> \+ <code>b<\/code><\/a>/);
});

test('the methodology page never renders a lost placeholder as "undefined"', () => {
  const html = renderMethodologyPage({ md: readFileSync(new URL('../docs/LIVABILITY.md', import.meta.url), 'utf8') });
  const text = html.replace(/<code>[^<]*<\/code>/g, '').replace(/<[^>]+>/g, '');
  assert.ok(!/\bundefined\b/.test(text), 'found "undefined" outside a code span');
  assert.ok(!/[\u0000\u0001]/.test(html), 'placeholder byte leaked');
});
