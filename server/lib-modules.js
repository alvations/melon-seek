// Single source of truth for the browser-safe server modules.
//
// These are served to the browser as /lib/<path> by server/index.js (server
// mode) and copied to dist/lib/ by scripts/build-static.js (static mode), so
// public/api.js can `import('./lib/<path>')` the same way in both modes.
// Every listed module must be pure ES (no node: imports, process, Buffer) and
// may import only other listed modules. test/server.test.js checks both.

/** Top-level modules under server/. */
export const LIB_MODULES = Object.freeze([
  'companies.js', 'normalize.js', 'salary.js', 'vet.js', 'geo.js', 'keywords.js', 'demo.js', 'juice.js',
]);

/** Every *.js file directly in server/<LIB_SOURCES_DIR>/ is also browser-safe. */
export const LIB_SOURCES_DIR = 'sources';

const SOURCE_RE = new RegExp(`^${LIB_SOURCES_DIR}/[a-z0-9][a-z0-9_-]*\\.js$`, 'i');

/** True if `rel` (e.g. "juice.js", "sources/lever.js") may be served to the browser. */
export function isLibModule(rel) {
  return typeof rel === 'string' && (LIB_MODULES.includes(rel) || SOURCE_RE.test(rel));
}
