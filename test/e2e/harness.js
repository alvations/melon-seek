// Minimal e2e harness: test registry, assertions, server lifecycle, browser resolution.
// Not part of `npm test` (needs a browser). Run via `node scripts/e2e.js`.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readdirSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export class AssertionError extends Error {}
export function assert(cond, msg) {
  if (!cond) throw new AssertionError(msg || 'assertion failed');
}
export function assertEq(actual, expected, msg) {
  if (actual !== expected) {
    throw new AssertionError(`${msg || 'not equal'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

/** Resolve the `playwright` package (repo node_modules, NODE_PATH, or $PLAYWRIGHT_MODULE). */
export async function loadPlaywright() {
  const candidates = [];
  if (process.env.PLAYWRIGHT_MODULE) candidates.push(process.env.PLAYWRIGHT_MODULE);
  candidates.push('playwright', 'playwright-core');
  const req = createRequire(path.join(ROOT, 'package.json'));
  for (const c of candidates) {
    try {
      const resolved = req.resolve(c, { paths: [ROOT, ...(process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean)] });
      const mod = await import(pathToFileURL(resolved).href);
      const pw = mod.chromium ? mod : mod.default;
      if (pw && pw.chromium) return pw;
    } catch { /* try next */ }
  }
  return null;
}

/** Find a preinstalled Chromium (never downloads). */
export function findChromium() {
  if (process.env.CHROMIUM_PATH && existsSync(process.env.CHROMIUM_PATH)) return process.env.CHROMIUM_PATH;
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers'].filter(Boolean);
  for (const root of roots) {
    if (!existsSync(root)) continue;
    const dirs = readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse();
    for (const d of dirs) {
      for (const rel of ['chrome-linux/chrome', 'chrome-linux64/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
        const p = path.join(root, d, rel);
        if (existsSync(p)) return p;
      }
    }
  }
  return undefined; // let playwright use its own default
}

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.unref();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

/** Spawn the real server (`node server/index.js`) on a free port; resolves {baseUrl, stop, logs}. */
export async function startServer({ timeoutMs = 20000 } = {}) {
  const port = await freePort();
  const logs = [];
  const child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => logs.push(String(d)));
  child.stderr.on('data', (d) => logs.push(String(d)));
  let exited = null;
  child.on('exit', (code) => { exited = code; });
  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (exited !== null) throw new Error(`server exited early (code ${exited}):\n${logs.join('')}`);
    try {
      const r = await fetch(`${baseUrl}/api/companies`);
      if (r.ok) break;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  if (Date.now() >= deadline) {
    child.kill();
    throw new Error(`server did not become ready on ${baseUrl}:\n${logs.join('')}`);
  }
  return {
    baseUrl,
    logs,
    stop: () => new Promise((resolve) => {
      if (exited !== null) return resolve();
      child.once('exit', () => resolve());
      child.kill('SIGTERM');
      setTimeout(() => { try { child.kill('SIGKILL'); } catch {} resolve(); }, 3000).unref();
    }),
  };
}

/** Tiny sequential test runner: failures are collected, not fatal. */
export function createSuite() {
  const tests = [];
  const results = [];
  return {
    test(name, fn) { tests.push({ name, fn }); },
    async run(ctx, grep = null) {
      for (const t of tests) {
        if (grep && !grep.test(t.name)) continue;
        const start = Date.now();
        try {
          await t.fn(ctx);
          results.push({ name: t.name, ok: true, ms: Date.now() - start });
          console.log(`  ✓ ${t.name} (${Date.now() - start}ms)`);
        } catch (err) {
          results.push({ name: t.name, ok: false, ms: Date.now() - start, error: err });
          console.log(`  ✗ ${t.name}\n      ${String(err && err.message || err).split('\n').join('\n      ')}`);
        }
      }
      return results;
    },
  };
}
