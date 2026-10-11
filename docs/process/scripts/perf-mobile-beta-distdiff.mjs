// Two builds made with the same MELON_BUILT_AT / GITHUB_SHA: every data file must be byte-identical,
// except the job lists, which may differ only by shared.vetted. Prints any other differing file.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const [a, b] = process.argv.slice(2).map((p) => path.resolve(p));
const walk = (d, base = d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name), base) : [path.relative(base, path.join(d, e.name))]));
const fa = walk(a).sort(), fb = walk(b).sort();
assert.deepEqual(fa, fb, 'same file list');
let lists = 0, same = 0; const other = [];
for (const f of fa) {
  const x = fs.readFileSync(path.join(a, f)), y = fs.readFileSync(path.join(b, f));
  if (x.equals(y)) { same++; continue; }
  if (/(^|\/)api\/jobs\/[^/]+\.json$/.test(f)) {
    const px = JSON.parse(x), py = JSON.parse(y);
    delete px.shared.vetted; delete py.shared.vetted;
    assert.deepStrictEqual(px, py, f);
    assert.equal(JSON.stringify(px), JSON.stringify(py), `${f} key order`);
    lists++;
    continue;
  }
  other.push(f);
}
console.log(`${fa.length} files: ${same} byte-identical, ${lists} job lists equal but for shared.vetted; other differences: ${other.join(', ') || 'none'}`);
