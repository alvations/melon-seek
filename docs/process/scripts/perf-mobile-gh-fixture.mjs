// Synthetic Greenhouse board response (GET boards-api.greenhouse.io/v1/boards/<b>/jobs?content=true)
// rebuilt from data/snapshots/<slug>.json, so the browser's LIVE path (fetch + JSON parse +
// mapGreenhouseJob + normalizeJobs) can be timed offline. Same job count, same HTML volume
// (entity-escaped like Greenhouse), salary as pay_input_ranges when the snapshot had a range.
// usage: node perf-mobile-gh-fixture.mjs <slug> <out.json>
import fs from 'node:fs';
const [slug, out] = process.argv.slice(2);
const snap = JSON.parse(fs.readFileSync(new URL(`../../../data/snapshots/${slug}.json`, import.meta.url), 'utf8'));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const jobs = snap.jobs.map((j) => {
  const names = (j.locations || []).map((l) => l.rawName || l.name);
  const s = j.salary;
  return {
    id: Number(String(j.id).split(':')[1]) || String(j.id).split(':')[1],
    internal_job_id: j.reqId ?? null,
    title: j.title,
    updated_at: j.updatedAt,
    first_published: j.postedAt ?? j.updatedAt,
    absolute_url: j.url,
    location: { name: names.join(' | ') },
    offices: [],
    departments: j.department ? [{ name: j.department }] : [],
    metadata: j.employmentType ? [{ id: 1, name: 'Employment Type', value: j.employmentType, value_type: 'single_select' }] : [],
    content: esc(j.descriptionHtml || ''),
    pay_input_ranges: s && s.currency && s.interval === 'year' ? [{ min_cents: s.min * 100, max_cents: s.max * 100, currency_type: s.currency, title: 'Annual Salary', blurb: '' }] : [],
  };
});
fs.writeFileSync(out, JSON.stringify({ jobs, meta: { total: jobs.length } }));
console.log(out, jobs.length, fs.statSync(out).size);
