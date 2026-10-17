#!/usr/bin/env node
// monthly-refresh.yml's commit step (S-9 residual, docs/REVIEW.md "beta review 2026-10-16"): four of the files the
// refresh may commit are code that reaches visitors' browsers (server/juice.js and server/salary.js through /lib/,
// public/viz/palette.js and public/features/shared.js directly). The FX writer (scripts/refresh/fx.js) changes only
// values in them:
//   - the rows of the multi-line FX_PER_USD table, "  CODE: number," (keys are never added or dropped);
//   - FX_AS_OF = 'YYYY-MM-DD' and FX_SOURCE = '<label>' (a plain one-line string);
//   - salary.js's one-line EXTRA_FX_PER_USD table and shared.js's FX_FALLBACK CNY rate.
// With exactly those values masked, each refreshed copy must equal HEAD's (the branch tip, which the step has
// already checked equals the tested commit for these files), so any other change, a code line above all, is
// refused. Node built-ins only; it reads no remote content and runs no npm.
//
//   node .github/scripts/fx-values-only.mjs <file>...   (in the repo, after the refreshed files were copied in)
//   exit 0: every listed code file changes FX values only (other files are ignored); 1: refused, with the line.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

export const FX_CODE_FILES = Object.freeze(['server/juice.js', 'server/salary.js', 'public/viz/palette.js', 'public/features/shared.js']);
const NUM = '[0-9][0-9.]*(?:e-?[0-9]+)?';
const ROW = new RegExp(`^(  [A-Z]{3}): ${NUM},$`);
const TABLE_START = /^(?:export )?const FX_PER_USD = Object\.freeze\(\{$/;
const AS_OF = /^((?:export )?const FX_AS_OF = ')[0-9]{4}-[0-9]{2}-[0-9]{2}(';)$/;
const SOURCE = /^((?:export )?const FX_SOURCE = ')[^'\\`$]*(';)$/;
const EXTRA = new RegExp(`^const EXTRA_FX_PER_USD = Object\\.freeze\\(\\{ [A-Z]{3}: ${NUM}(?:, [A-Z]{3}: ${NUM})* \\}\\);$`);
const FALLBACK = new RegExp(`^(export const FX_FALLBACK = Object\\.freeze\\(\\{ \\.\\.\\.\\(palette\\.FX_TO_USD \\|\\| \\{ USD: 1 \\}\\), CNY: )${NUM}( \\}\\);)$`);

/** `text` with every value the FX writer may change replaced by "#". */
export function fxSkeleton(text) {
  let inTable = false;
  return String(text).split('\n').map((l) => {
    let m;
    if (inTable) {
      if (l === '});') { inTable = false; return l; }
      return (m = ROW.exec(l)) ? `${m[1]}: #,` : l;
    }
    if (TABLE_START.test(l)) { inTable = true; return l; }
    if ((m = AS_OF.exec(l)) || (m = SOURCE.exec(l)) || (m = FALLBACK.exec(l))) return `${m[1]}#${m[2]}`;
    if (EXTRA.test(l)) return l.replace(new RegExp(`([A-Z]{3}): ${NUM}`, 'g'), '$1: #');
    return l;
  }).join('\n');
}

/** null when `after` changes only FX values of `before`, else { line, before, after } of the first other change. */
export function fxOnlyDiff(before, after) {
  const a = fxSkeleton(before).split('\n');
  const b = fxSkeleton(after).split('\n');
  const rawA = String(before).split('\n');
  const rawB = String(after).split('\n');
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) return { line: i + 1, before: rawA[i] ?? null, after: rawB[i] ?? null };
  }
  return null;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  let bad = 0;
  for (const f of process.argv.slice(2).filter((x) => FX_CODE_FILES.includes(x))) {
    let base;
    try { base = execFileSync('git', ['show', `HEAD:${f}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); } catch {
      console.log(`::error::refusing to publish '${f}': not in the branch tip`);
      bad++;
      continue;
    }
    const d = fxOnlyDiff(base, fs.readFileSync(f, 'utf8'));
    if (d) {
      console.log(`::error::refusing to publish '${f}': line ${d.line} changes more than an FX value the refresh writes (was ${JSON.stringify(String(d.before).slice(0, 160))}, now ${JSON.stringify(String(d.after).slice(0, 160))})`);
      bad++;
    }
  }
  process.exit(bad ? 1 : 0);
}
