// Link checks for the e2e suite (UX). Register from scripts/e2e.js:
//   import { registerLinkTests } from '../test/e2e/links.e2e.js';
//   ... registerLinkTests(suite);   // after registerUiTests(suite), needs ctx.browser
// The checks live in docs/process/scripts/link-check.mjs (also a CLI). External links are
// shape-checked only (the sandbox blocks outbound requests); CI can add --fetch-external.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, assert } from './harness.js';

const mod = () => import(pathToFileURL(path.join(ROOT, 'docs', 'process', 'scripts', 'link-check.mjs')).href);
const fmt = (list) => list.slice(0, 12).map((b) => `\n  ${b.where}: ${b.link} → ${b.reason}`).join('') + (list.length > 12 ? `\n  …and ${list.length - 12} more` : '');

export function registerLinkTests(suite) {
  suite.test('Links: README and docs/**/*.md relative links resolve to repo files', async () => {
    const { checkMarkdown } = await mod();
    const rep = { broken: [], ok: 0 };
    checkMarkdown(rep);
    assert(!rep.broken.length, `broken markdown links:${fmt(rep.broken)}`);
  });

  suite.test('Links: every in-app link, hash link, share page and job URL (server + static build)', async (ctx) => {
    const { checkLinks } = await mod();
    const out = await checkLinks({ base: ctx.baseUrl, browser: ctx.browser });
    for (const n of out.notes) ctx.notes.push(`links: ${n}`);
    ctx.notes.push(`links: ${out.ok} OK, ${out.notFetched} external links shape-checked (not fetched in this sandbox)`);
    assert(!out.broken.length, `${out.broken.length} broken link(s):${fmt(out.broken)}`);
  });
}
