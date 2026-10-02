// Keyboard / ARIA / reduced-motion checks for the viz layer (REVIEW.md M3, L4, L6).
// Usage: node docs/process/scripts/viz-a11y-check.mjs [outDir]   (PORT env, default 5288)
// Prints a JSON report; see docs/process/viz.md section 5 for expected values.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PUB = path.join(ROOT, 'public'), LEAFLET = path.join(ROOT, 'node_modules/leaflet/dist');
const OUT = path.resolve(process.argv[2] || 'viz-shots'); fs.mkdirSync(OUT, { recursive: true });
const PORT = +process.env.PORT || 5288;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const f = u.startsWith('/vendor/leaflet/') ? path.join(LEAFLET, u.slice(16)) : path.join(PUB, u);
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
}).listen(PORT);
let pw; for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright', '/opt/node-tools/node_modules/playwright/index.mjs'].filter(Boolean)) { try { pw = await import(m); break; } catch {} }
const { chromium } = pw;
const b=await chromium.launch({executablePath:process.env.CHROMIUM||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const out={};
// ---- chart ----
let p=await b.newPage({viewport:{width:1280,height:820},reducedMotion:'reduce'});
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route(/basemaps/,r=>r.abort());
await p.goto('http://localhost:'+PORT+'/viz/demo.html?groupBy=seniority&colorBy=department');await p.waitForTimeout(500);
out.listboxChildren=await p.evaluate(()=>{const lb=document.querySelector('[role=listbox]');
  // every element with text inside listbox must be within an option or group header aria-hidden
  const bad=[...lb.querySelectorAll('*')].filter(e=>!e.closest('[role=option]')&&!e.closest('[aria-hidden=true]')&&!['group','none','option'].includes(e.getAttribute('role'))&&e.children.length===0&&e.textContent.trim());
  return {groups:lb.querySelectorAll('[role=group]').length, options:lb.querySelectorAll('[role=option]').length, strayText:bad.length, firstGroup:lb.querySelector('[role=group]').getAttribute('aria-label'), firstOption:lb.querySelector('[role=option]').getAttribute('aria-label')};});
await p.focus('.ms-chart__body');
for(let i=0;i<3;i++) await p.keyboard.press('ArrowDown');
const before=await p.evaluate(()=>{const a=document.querySelector('.ms-row.is-active');return {id:__viz.jobs.find(j=>j.title&&a.getAttribute('aria-label').startsWith(j.title))&&a.getAttribute('aria-label'), sel:a.getAttribute('aria-selected'), ad:document.querySelector('[role=listbox]').getAttribute('aria-activedescendant')===a.id}});
await p.selectOption('#groupBy','none');await p.waitForTimeout(150);
out.afterRerender=await p.evaluate(()=>{const a=document.querySelector('.ms-row.is-active');return a?{label:a.getAttribute('aria-label'),sel:a.getAttribute('aria-selected'),ad:document.querySelector('[role=listbox]').getAttribute('aria-activedescendant')===a.id}:null});
out.activeKept = before.id===out.afterRerender?.label;
out.activeRing=await p.evaluate(()=>getComputedStyle(document.querySelector('.ms-row.is-active'),'::before').boxShadow);
await p.focus('.ms-chart__body');await p.keyboard.press('End');
out.endIsLast=await p.evaluate(()=>{const rows=document.querySelectorAll('.ms-row');return rows[rows.length-1].classList.contains('is-active')});
await p.evaluate(()=>{document.querySelector('.ms-chart__scroll').scrollTop=0;});
await p.evaluate(()=>{const j=__viz.jobs.filter(j=>j.salary); __viz.chart.highlight(document.querySelectorAll('.ms-row')[150]&&[...document.querySelectorAll('.ms-row')][150].getAttribute('aria-label')&&null)});
out.reducedScroll=await p.evaluate(()=>{const ids=[...document.querySelectorAll('.ms-row')];const sc=document.querySelector('.ms-chart__scroll');sc.scrollTop=0;
  // pick the job at row 150 via public API
  const label=ids[150].getAttribute('aria-label');const job=__viz.jobs.find(j=>j.salary&&label.startsWith(j.title+','));
  return new Promise(res=>{let found=null;for(const j of __viz.jobs){__viz.chart.highlight(j.id);const h=document.querySelector('.ms-row.is-highlighted');if(h===ids[150]){found=j;break}} sc.scrollTop=0;__viz.chart.highlight(null);__viz.chart.highlight(found.id);res(sc.scrollTop)})});
await p.screenshot({path:OUT+'/a11y-chart-active.png'});
await p.close();
// ---- map ----
p=await b.newPage({viewport:{width:1280,height:820},reducedMotion:'reduce'});p.on('pageerror',e=>errs.push(e.message));
await p.route(/basemaps/,r=>r.abort());
await p.goto('http://localhost:'+PORT+'/viz/demo.html?mode=map');await p.waitForTimeout(1200);
await p.focus('.ms-pin-icon');
const z0=await p.evaluate(()=>__viz.map.leaflet.getZoom());
out.pinName=await p.evaluate(()=>document.activeElement.getAttribute('aria-label')+' | role='+document.activeElement.getAttribute('role'));
await p.keyboard.press('Enter');await p.waitForTimeout(300);
out.mapAfterEnter=await p.evaluate(z0=>({zoomBefore:z0,zoom:__viz.map.leaflet.getZoom(),focusOnPin:document.activeElement.classList.contains('ms-pin-icon'),focused:document.activeElement.getAttribute('aria-label'),log:document.getElementById('log').innerText.split('\n')[0]}),z0);
await p.keyboard.press('Space');await p.waitForTimeout(300);
out.mapAfterSpace=await p.evaluate(()=>({zoom:__viz.map.leaflet.getZoom(),focusOnPin:document.activeElement.classList.contains('ms-pin-icon'),log:document.getElementById('log').innerText.split('\n').slice(0,2)}));
// zoom with keyboard '-' while pin focused -> zoom out, focus kept
await p.evaluate(()=>__viz.map.leaflet.zoomOut(2,{animate:false}));await p.waitForTimeout(300);
out.afterZoomOut=await p.evaluate(()=>({zoom:__viz.map.leaflet.getZoom(),focusOnPin:document.activeElement.classList.contains('ms-pin-icon'),focused:document.activeElement.getAttribute('aria-label')}));
await p.screenshot({path:OUT+'/a11y-map-focus.png'});
out.errs=errs;
console.log(JSON.stringify(out,null,1));
await b.close();
server.close();
