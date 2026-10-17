// fix-sec-3 lane (docs/process/fix-sec-3.md): tests for the security fixes beyond the to-dos un-todo'd in
// test/beta-security-review.test.js and test/beta-security-review-2.test.js. Each block names its finding in
// docs/REVIEW.md. Equivalence checks run the new code against a frozen copy of the old one, on the real fixtures,
// so a fix that bounds a parser cannot change what it reads from real pages.
// No network: fixtures only, and the slow-parser checks run in a worker with a hard limit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIX = path.join(ROOT, 'test', 'fixtures');
const imp = (...p) => import(pathToFileURL(path.join(ROOT, ...p)).href);
const fixture = (slug) => JSON.parse(fs.readFileSync(path.join(FIX, `bigtech-${slug}.json`), 'utf8'));

/* ------------------------------------------------------------ S-4 residual */

const BETA = ['amazon', 'apple', 'google', 'meta', 'microsoft', 'netflix', 'nvidia'];

/** Each beta fixture's raw postings, through its own adapter's mapper. */
async function betaRaws(slug) {
  const { mapEightfoldJob, EIGHTFOLD_BOARDS } = await imp('server', 'sources', 'eightfold.js');
  const { mapAmazonJob } = await imp('server', 'sources', 'amazon.js');
  const { mapAppleJob } = await imp('server', 'sources', 'apple.js');
  const { mapGoogleJob } = await imp('server', 'sources', 'google.js');
  const { mapMetaJob } = await imp('server', 'sources', 'meta.js');
  return fixture(slug).records.map((r) => {
    if (EIGHTFOLD_BOARDS[slug]) return mapEightfoldJob(r, EIGHTFOLD_BOARDS[slug]);
    if (slug === 'amazon') return mapAmazonJob(r);
    if (slug === 'apple') return mapAppleJob(r.row, r.detail);
    if (slug === 'google') return mapGoogleJob(r, {});
    return mapMetaJob(r, { id: r.id, url: `https://www.metacareers.com/profile/job_details/${r.id}/` });
  });
}

test('S-4 residual: every real beta posting link is kept exactly as its adapter built it', async () => {
  const { normalizeJob } = await imp('server', 'normalize.js');
  const { getCompany } = await imp('server', 'companies.js');
  for (const slug of BETA) {
    const raws = await betaRaws(slug);
    assert.ok(raws.length, slug);
    for (const raw of raws) {
      assert.match(raw.url, /^https:\/\//, `${slug}: ${raw.url}`);
      assert.equal(normalizeJob(raw, getCompany(slug)).url, raw.url, `${slug} ${raw.sourceId}`);
    }
  }
});

test('S-4 residual: Amazon job_path values on www.amazon.jobs are kept verbatim; anything else becomes the canonical page', async () => {
  const { amazonPostingUrl, mapAmazonJob } = await imp('server', 'sources', 'amazon.js');
  for (const r of fixture('amazon').records) {
    // The old code joined origin and job_path with no check: for real rows the new result is identical.
    assert.equal(mapAmazonJob(r).url, r.job_path ? `https://www.amazon.jobs${r.job_path}` : `https://www.amazon.jobs/en/jobs/${r.id_icims}`);
  }
  for (const p of ['@evil.example/x', '.evil.example/x', ':8443/x', "javascript:alert('x')", 'x@evil.example/']) {
    assert.equal(amazonPostingUrl({ id_icims: '3012345', job_path: p }), 'https://www.amazon.jobs/en/jobs/3012345', p);
  }
  assert.equal(amazonPostingUrl({ id_icims: '3012345', job_path: null }), 'https://www.amazon.jobs/en/jobs/3012345');
  assert.equal(amazonPostingUrl({ id_icims: '1', job_path: '/en/jobs/1/sde-ii' }), 'https://www.amazon.jobs/en/jobs/1/sde-ii');
});

test('S-4 residual: a beta built-in keeps only https links on its own posting hosts; stable and custom boards keep any http(s) link', async () => {
  const { postingUrl } = await imp('server', 'normalize.js');
  const { getCompany } = await imp('server', 'companies.js');
  const drop = {
    amazon: ['https://www.amazon.jobs@evil.example/x', 'https://evil.example/en/jobs/1', 'http://www.amazon.jobs/en/jobs/1', 'https://www.amazon.jobs:8443/en/jobs/1', 'https://user:pw@www.amazon.jobs/en/jobs/1', 'https://jobs.apple.com/en-us/details/1'],
    google: ['https://www.google.com/search?q=x', 'https://www.google.com/about/careers/../../url?q=https://evil.example', 'https://careers.google.com.evil.example/jobs/1', 'https://www.google.com.evil.example/about/careers/x'],
    apple: ['https://jobs.apple.com.evil.example/x', 'https://www.apple.com/x'],
    meta: ['https://www.facebook.com/careers/1', 'https://metacareers.com.evil.example/'],
    microsoft: ['https://explore.jobs.netflix.net/careers/job/1'],
    netflix: ['https://apply.careers.microsoft.com/careers/job/1'],
    nvidia: ['https://evil.myworkdayjobs.com/x'],
  };
  const keep = {
    amazon: ['https://www.amazon.jobs/en/jobs/3012345/software-dev-engineer'],
    google: ['https://www.google.com/about/careers/applications/jobs/results/123-x', 'https://careers.google.com/jobs/results/123/'],
    apple: ['https://jobs.apple.com/en-us/details/200612345/x'],
    meta: ['https://www.metacareers.com/profile/job_details/1234567/'],
    microsoft: ['https://apply.careers.microsoft.com/careers/job/1970393556632811'],
    netflix: ['https://explore.jobs.netflix.net/careers/job/790300000001'],
    nvidia: ['https://jobs.nvidia.com/careers/job/893375056870', 'https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite/job/x'],
  };
  for (const slug of BETA) {
    const c = getCompany(slug);
    for (const u of drop[slug]) assert.equal(postingUrl(u, c), null, `${slug} kept ${u}`);
    for (const u of keep[slug]) assert.equal(postingUrl(u, c), u, `${slug} dropped ${u}`);
  }
  // Stable built-ins and custom boards: any absolute http(s) link, as before.
  for (const c of [getCompany('anthropic'), { slug: 'greenhouse-amazon', name: 'Amazon', source: 'greenhouse', board: 'amazon', custom: true }]) {
    for (const u of ['https://job-boards.greenhouse.io/x/jobs/1', 'http://example.com/x']) assert.equal(postingUrl(u, c), u, `${c.slug} ${u}`);
    assert.equal(postingUrl("javascript:alert('x')", c), null);
  }
  assert.equal(postingUrl('https://evil.example/x'), 'https://evil.example/x', 'no company: the old scheme-only rule');
});

test('S-4 residual: scripts/links-policy.js keeps the same posting allowlist, now built from the registry entries', async () => {
  const policy = await imp('scripts', 'links-policy.js');
  const { postingRule } = await imp('server', 'companies.js');
  // The literal lists links-policy.js had before the move (f53a270).
  assert.deepEqual([...policy.BETA_POSTING_HOSTS], [
    'careers.google.com', 'apply.careers.microsoft.com', 'jobs.careers.microsoft.com', 'careers.microsoft.com', 'www.metacareers.com',
    'jobs.apple.com', 'explore.jobs.netflix.net', 'jobs.netflix.com', 'www.amazon.jobs', 'jobs.nvidia.com', 'nvidia.wd5.myworkdayjobs.com',
  ]);
  assert.deepEqual([...policy.BETA_POSTING_PREFIXES], ['https://www.google.com/about/careers/']);
  const { listCompanies } = await imp('server', 'companies.js');
  for (const c of listCompanies({ channel: 'beta', includePaused: true })) {
    const rule = postingRule(c);
    if (c.channel === 'beta') assert.ok(rule && rule.hosts.length, `${c.slug}: no posting hosts`);
    else assert.equal(rule, null, `${c.slug}: a stable board keeps any http(s) link`);
    // The rule is looked up by slug, so a caller's partial copy (no postingHosts field) still gets it.
    if (c.channel === 'beta') assert.deepEqual(postingRule({ slug: c.slug, name: c.name }), rule);
  }
  assert.equal(postingRule({ slug: 'amazon', custom: true }), null, 'never for a custom board');
});
