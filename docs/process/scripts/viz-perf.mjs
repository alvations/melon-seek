// PERF-2 check: chart.update() cost at 4x CPU throttle on real snapshot data.
// Usage: serve public/ on :5299 (/lib -> server/, /vendor/leaflet -> node_modules/leaflet/dist),
//   save /api/jobs?company=anthropic|anduril from the real server to $S/<slug>.json, then
//   S=<dir> node docs/process/scripts/viz-perf.mjs  -> sync ms, filter-update ms, long tasks, DOM rows.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const p=await b.newPage({viewport:{width:390,height:844}});
await p.route(/tile\.openstreetmap/,r=>r.abort());
await p.goto('http://localhost:5299/viz/demo.html');await p.waitForTimeout(800);
const cdp=await p.context().newCDPSession(p);
const res={};
for (const co of ['anthropic','anduril']){
  const fs=await import('node:fs');const jobs=JSON.parse(fs.readFileSync(process.env.S+'/'+co+'.json','utf8')).jobs;await p.evaluate(j=>{window.__jobs=j;},jobs);
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  for (const view of ['clusters','ranges']){
    const r=await p.evaluate(async view=>{
      // long-task observer
      const longs=[];const po=new PerformanceObserver(l=>{for(const e of l.getEntries())longs.push(Math.round(e.duration))});po.observe({type:'longtask',buffered:false});
      const t=performance.now();__viz.chart.update(window.__jobs,{view});const sync=performance.now()-t;
      await new Promise(r=>setTimeout(r,1500));po.disconnect();
      // second update (filter tweak)
      const t2=performance.now();__viz.chart.update(window.__jobs.slice(0, Math.floor(window.__jobs.length*0.8)),{view});const sync2=performance.now()-t2;
      await new Promise(r=>setTimeout(r,800));
      return {sync:Math.round(sync),filter:Math.round(sync2),longTasks:longs,rows:document.querySelectorAll('.ms-row,.ms-bin').length,n:window.__jobs.length};
    },view);
    res[co+'/'+view]=r;
  }
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
}
console.log(JSON.stringify(res));
await b.close();
