// Dump each board's jobs (through the app's own api.js) to <scratch>/ux-review-beta-2/jobs-<slug>.json.
import { launch, openPage, BASE, BOARDS } from './lib.mjs';
import fs from 'node:fs';
const b = await launch();
const { ctx, page } = await openPage(b, 'd1440', 'light', '/beta/#c=netflix');
for (const [slug, site] of BOARDS) {
  const base = `${BASE}/${site ? site + '/' : ''}`.replace(/\/$/, '');
  const jobs = await page.evaluate(async ({ base, slug }) => {
    const api = await import(`${base}/api.js`);
    const r = await api.getJobs({ company: slug });
    return { mode: r.mode, meta: r.meta ? Object.keys(r.meta) : null, n: r.jobs.length, jobs: r.jobs.map((j) => ({ id: j.id, title: j.title, department: j.department, team: j.team, brand: j.brand, departmentBasis: j.departmentBasis, location: j.location, locations: j.locations, salary: j.salary, seniority: j.seniority, remote: j.remote, employmentType: j.employmentType, termWeeks: j.termWeeks })) };
  }, { base, slug });
  fs.writeFileSync(new URL(`./jobs-${slug}.json`, import.meta.url), JSON.stringify(jobs));
  console.log(slug, jobs.mode, jobs.n, jobs.meta);
}
await ctx.close();
await b.close();
