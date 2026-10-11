// Site link policy (scripts/links-policy.js): users are never sent to GitHub,
// and never off the site except to allowlisted hosts; every relative link and
// #anchor in the built site resolves. Owner: devops. The build also enforces it.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const policy = await import(pathToFileURL(path.join(ROOT, 'scripts', 'links-policy.js')).href);
let TMP, DIST;
let FIXTURE = null; // the beta company bundled from the one-posting fixture

before(async () => {
  TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'melon-links-'));
  DIST = path.join(TMP, 'dist');
  // Input folders of its own for both sites, so the build never reads the local data/ (with the
  // beta snapshots present it took over a minute and timed out under load): the stable companies
  // are demo, and the beta copy carries one big-tech company from a one-posting fixture (its list,
  // share page and posting link on a career host), the other beta companies are left out.
  const dirs = Object.fromEntries(['snaps', 'hist', 'beta-snaps', 'beta-hist'].map((d) => [d, path.join(TMP, d)]));
  for (const d of Object.values(dirs)) fs.mkdirSync(d);
  const { normalizeJobs } = await import(pathToFileURL(path.join(ROOT, 'server', 'normalize.js')).href);
  const { getCompany } = await import(pathToFileURL(path.join(ROOT, 'server', 'companies.js')).href);
  const apple = getCompany('apple');
  if (apple) {
    FIXTURE = apple.slug;
    const jobs = normalizeJobs([{
      sourceId: '200000001', title: 'Software Engineer, Maps', locationText: 'Cupertino, CA', extraLocations: [],
      html: '<p>Build maps.</p>', text: 'Build maps.', url: 'https://jobs.apple.com/en-us/details/200000001/software-engineer-maps', salary: null,
    }], apple);
    const { slug, name, source, board, color } = apple;
    fs.writeFileSync(path.join(dirs['beta-snaps'], 'apple.json'), JSON.stringify({ company: { slug, name, source, board, color }, mode: 'snapshot', fetchedAt: '2026-10-10T12:00:00.000Z', error: null, jobs }));
  }
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'build-static.js'), '--out', DIST], {
    cwd: ROOT, encoding: 'utf8', timeout: 120000,
    env: {
      ...process.env, MELON_SNAPSHOT_DIR: dirs.snaps, MELON_HISTORY_DIR: dirs.hist,
      MELON_BETA_SNAPSHOT_DIR: dirs['beta-snaps'], MELON_BETA_HISTORY_DIR: dirs['beta-hist'], MELON_BETA_COMPANIES: '',
    },
  });
  assert.equal(r.status, 0, `build failed (it enforces the link policy):\n${r.stdout}\n${r.stderr}`);
});
after(() => { if (TMP) fs.rmSync(TMP, { recursive: true, force: true }); });

test('public/**/*.{js,html}: no GitHub links, only allowlisted hosts', () => {
  const v = policy.policyFiles(path.join(ROOT, 'public'))
    .flatMap((f) => policy.checkText(path.relative(ROOT, f), fs.readFileSync(f, 'utf8')));
  assert.deepEqual(v, []);
});

test('built dist: no GitHub links, only allowlisted hosts, every relative link and #anchor resolves', () => {
  if (FIXTURE) assert.ok(fs.existsSync(path.join(DIST, 'beta', 'c', FIXTURE, 'index.html')), `the beta copy carries ${FIXTURE} from the fixture`);
  assert.deepEqual(policy.checkDist(DIST), []);
});

test('the Juice "How it\'s calculated" link is on-site and lands on the formula section', () => {
  const app = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
  const m = /const JUICE_DOC = '([^']+)'/.exec(app);
  assert.ok(m, 'JUICE_DOC constant');
  assert.doesNotMatch(m[1], /^https?:|github/i, 'relative, not GitHub');
  const [p, hash] = m[1].split('#');
  const page = fs.readFileSync(path.join(DIST, p, 'index.html'), 'utf8');
  assert.match(page, new RegExp(`id="${hash}"`), `methodology page has #${hash}`);
  assert.match(page, /<a href="\.\.\/">← Back to the jobs<\/a>/, 'link back to the app');
  assert.match(page, /href="\.\.\/styles\.css"/, 'uses the site stylesheet');
  assert.doesNotMatch(page, /href="[^"]*github/i, 'no link to GitHub (source citations are shown as text)');
});

test('the policy catches violations (negative cases)', () => {
  const t = (file, text) => policy.checkText(file, text);
  assert.equal(t('a.js', "h('a', { href: 'https://github.com/alvations/melon-seek/blob/main/docs/X.md' })").length >= 1, true);
  assert.equal(t('a.js', "el.href = 'https://evil.example.org.attacker.net/x';").length, 1);
  assert.equal(t('a.html', '<a href="https://raw.githubusercontent.com/x/y">x</a>').length, 1);
  assert.equal(t('a.html', '<a href="https://tracker.io/">x</a>').length, 1);
  assert.equal(t('a.js', "// see https://github.com/foo (a comment, not a link)").length, 0);
  assert.equal(t('a.html', '<a href="https://jobs.lever.co/acme/1">apply</a>').length, 0);
  assert.equal(t('a.html', '<link href="https://fonts.googleapis.com/css2">').length, 1, 'fonts are self-hosted');
  // Relative links that don't resolve, or anchors that don't exist, fail in dist.
  const bad = path.join(TMP, 'bad');
  fs.mkdirSync(path.join(bad, 'methodology'), { recursive: true });
  fs.writeFileSync(path.join(bad, 'methodology', 'index.html'), '<h2 id="ok">x</h2>');
  fs.writeFileSync(path.join(bad, 'index.html'), '<a href="missing.html">a</a><a href="methodology/#nope">b</a><a href="methodology/#ok">c</a>');
  fs.writeFileSync(path.join(bad, 'app.js'), "const DOC = 'methodology/#gone';");
  const v = policy.checkDist(bad);
  assert.equal(v.length, 3, v.join('\n'));
});

test('big-tech posting pages (beta channel): career hosts allowed whole, shared hosts only under their careers path', () => {
  const t = (url) => policy.checkText('a.html', `<a href="${url}">apply</a>`).length;
  for (const ok of ['https://www.amazon.jobs/en/jobs/123/x', 'https://jobs.apple.com/en-us/details/200', 'https://www.metacareers.com/jobs/1/',
    'https://explore.jobs.netflix.net/careers/job/7', 'https://jobs.careers.microsoft.com/global/en/job/1', 'https://apply.careers.microsoft.com/careers/job/2',
    'https://jobs.nvidia.com/careers/job/893', 'https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite/job/x',
    'https://www.google.com/about/careers/applications/jobs/results/1-swe']) assert.equal(t(ok), 0, ok);
  for (const bad of ['https://www.google.com/search?q=x', 'https://www.google.com/about/careersx/', 'https://www.google.com/about/careers/../../maps',
    'http://www.google.com/about/careers/x', 'https://www.tesla.com/careers/search/job/1', 'https://careers.google.com.evil.example.org/', 'https://www.amazon.com/dp/x']) assert.equal(t(bad), 1, bad);
  assert.equal(policy.isAllowedLink('https://jobs.apple.com/x'), true);
  assert.equal(policy.isAllowedLink('https://github.com/x'), false, 'GitHub stays banned');
  for (const h of policy.BETA_POSTING_HOSTS) assert.ok(policy.ALLOWED_HOSTS.includes(h), `${h} allowed`);
  for (const p of policy.BETA_POSTING_PREFIXES) assert.ok(p.startsWith('https://') && p.endsWith('/'), `${p}: https, path-scoped`);
});
