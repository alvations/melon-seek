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
  const f = u.startsWith('/vendor/leaflet/') ? path.join(LEAFLET, u.slice(16)) : u.startsWith('/lib/') ? path.join(ROOT, 'server', u.slice(5)) : path.join(PUB, u); // /lib/ = browser-safe server modules, as server/index.js serves them
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
}).listen(PORT);
let pw; for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright', '/opt/node-tools/node_modules/playwright/index.mjs'].filter(Boolean)) { try { pw = await import(m); break; } catch {} }
const { chromium } = pw;
const b=await chromium.launch({executablePath:process.env.CHROMIUM||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const out={};
// ---- chart ----
let p=await b.newPage({viewport:{width:1280,height:820},reducedMotion:'reduce'});
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route(/basemaps|tile\.openstreetmap\.org/,r=>r.abort());
await p.goto('http://localhost:'+PORT+'/viz/demo.html?view=ranges&groupBy=seniority&colorBy=department');await p.waitForTimeout(500);
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
// ---- clusters view (default) ----
p=await b.newPage({viewport:{width:1280,height:520},reducedMotion:'reduce'});p.on('pageerror',e=>errs.push(e.message));
await p.route(/basemaps|tile\.openstreetmap\.org/,r=>r.abort());
await p.goto('http://localhost:'+PORT+'/viz/demo.html');await p.waitForTimeout(500);
const C={};
C.structure=await p.evaluate(()=>{const lb=document.querySelector('[role=listbox]');
  const bad=[...lb.querySelectorAll('*')].filter(e=>!e.closest('[role=option]')&&!e.closest('[aria-hidden=true]')&&!['group','none','option'].includes(e.getAttribute('role'))&&e.children.length===0&&e.textContent.trim());
  return {view:__viz.chart.view, label:lb.getAttribute('aria-label'), groups:lb.querySelectorAll('[role=group]').length, options:lb.querySelectorAll('[role=option]').length, circles:lb.querySelectorAll('.ms-bin').length, strayText:bad.length,
    firstGroup:lb.querySelector('[role=group]').getAttribute('aria-label'), firstLabelOption:lb.querySelector('.ms-crow__label').getAttribute('aria-label'), firstCircle:lb.querySelector('.ms-bin').getAttribute('aria-label'),
    minHit:Math.min(...[...lb.querySelectorAll('.ms-bin')].map(e=>Math.min(e.offsetWidth,e.offsetHeight)))};});
await p.focus('.ms-chart__body');
const act=()=>p.evaluate(()=>{const a=document.querySelector('.is-active');return a&&{label:a.getAttribute('aria-label'),sel:a.getAttribute('aria-selected'),ad:document.querySelector('[role=listbox]').getAttribute('aria-activedescendant')===a.id,tip:!document.querySelector('.ms-viz-tip').hidden}});
await p.keyboard.press('ArrowRight'); C.afterRight1=await act();
await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowRight'); C.afterRight3=await act();
await p.keyboard.press('ArrowDown'); C.afterDown=await act();
await p.keyboard.press('Enter'); await p.waitForTimeout(100);
C.afterEnter=await p.evaluate(()=>({log:document.getElementById('log').innerText.split('\n')[0], selected:document.querySelectorAll('.ms-bin.is-selected').length}));
C.activeRing=await p.evaluate(()=>getComputedStyle(document.querySelector('.ms-bin.is-active .ms-bin__dot')).boxShadow);
await p.selectOption('#theme','dark'); await p.waitForTimeout(200);
C.afterThemeRerender=await act(); C.activeKept=C.afterThemeRerender?.label===C.afterDown?.label;
C.selectedKept=await p.evaluate(()=>document.querySelectorAll('.ms-bin.is-selected').length);
await p.click('.ms-crow__label >> nth=2'); await p.waitForTimeout(100);
C.labelClick=await p.evaluate(()=>({log:document.getElementById('log').innerText.split('\n')[0], rowSelected:document.querySelectorAll('.ms-crow.is-selected').length}));
C.highlight=await p.evaluate(()=>{const sc=document.querySelector('.ms-chart__scroll');sc.scrollTop=0;
  const rows=[...document.querySelectorAll('.ms-crow')];const last=rows[rows.length-1];const idx=+last.querySelector('.ms-bin').dataset.r;
  const job=__viz.jobs.find(j=>j.salary&&(j.department||'No department')===last.querySelector('.ms-crow__name').textContent);
  __viz.chart.highlight(job.id);const h=document.querySelector('.ms-bin.is-highlighted');return {highlighted:!!h, inLastRow:last.contains(h), scrollTopSync:sc.scrollTop}});
await p.screenshot({path:OUT+'/a11y-clusters.png'});
out.clusters=C;
await p.close();
// ---- comps chart ----
p=await b.newPage({viewport:{width:1280,height:820},reducedMotion:'reduce'});p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:'+PORT+'/viz/demo.html?mode=comps');await p.waitForTimeout(500);
await p.focus('#compsWide .ms-comps__list');
await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowDown');
out.comps=await p.evaluate(()=>{const lb=document.querySelector('#compsWide [role=listbox]');const a=lb.querySelector('.is-active');
  return {options:lb.querySelectorAll('[role=option]').length, current:lb.querySelector('.is-current')?.getAttribute('aria-label'), active:a?.getAttribute('aria-label'), ad:lb.getAttribute('aria-activedescendant')===a?.id, ring:getComputedStyle(a,'::before').boxShadow}});
await p.keyboard.press('Enter'); await p.waitForTimeout(50);
out.comps.enterLog=await p.evaluate(()=>document.getElementById('log').innerText.split('\n')[0]);
await p.close();
// ---- robust axis: one bad value must not squash the chart; it becomes a keyboard-reachable marker ----
p=await b.newPage({viewport:{width:1280,height:820},reducedMotion:'reduce'});p.on('pageerror',e=>errs.push(e.message));
await p.route(/basemaps|tile\.openstreetmap\.org/,r=>r.abort());
await p.goto('http://localhost:'+PORT+'/viz/demo.html?outlier=1');await p.waitForTimeout(500);
await p.focus('.ms-chart__body'); await p.keyboard.press('ArrowRight'); await p.keyboard.press('End');
out.overflow=await p.evaluate(()=>{const a=document.querySelector('.is-active');const t=[...document.querySelectorAll('.ms-axis__tick')].map(e=>e.textContent);
  return {axisMax:t[t.length-1], active:a?.getAttribute('aria-label'), isOverflow:a?.classList.contains('ms-bin--overflow'), tip:document.querySelector('.ms-viz-tip').innerText.replace(/\n/g,' | ')}});
await p.keyboard.press('Enter'); await p.waitForTimeout(100);
out.overflow.enterLog=await p.evaluate(()=>document.getElementById('log').innerText.split('\n').slice(0,2));
await p.close();
// ---- map ----
p=await b.newPage({viewport:{width:1280,height:820},reducedMotion:'reduce'});p.on('pageerror',e=>errs.push(e.message));
await p.route(/basemaps|tile\.openstreetmap\.org/,r=>r.abort());
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
