// Design-audit screenshots of the whole app (real server on local snapshots).
// Usage: PORT=5377 node server/index.js &  then  S=<outDir> node docs/process/scripts/viz-design-audit.mjs
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const S=process.env.S;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const shots=[
 ['chart-light','#c=anthropic',1440,900,false],
 ['chart-dark','#c=anthropic',1440,900,true],
 ['ranges-light','#c=anthropic&v=ranges',1440,900,false],
 ['map-light','#c=anthropic&m=map',1440,900,false],
 ['map-dark','#c=anthropic&m=map',1440,900,true],
 ['insights-light','#c=anthropic&m=insights',1440,900,false],
 ['insights-dark','#c=anthropic&m=insights',1440,900,true],
 ['drawer-light','#c=anthropic',1440,900,false,'drawer'],
 ['drawer-dark','#c=anthropic',1440,900,true,'drawer'],
 ['mobile-chart','#c=anthropic',390,844,false],
 ['mobile-dark','#c=anthropic',390,844,true],
];
for (const [name,hash,w,h,dark,act] of shots){
  const p=await b.newPage({viewport:{width:w,height:h},colorScheme:dark?'dark':'light'});
  const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.route(/tile\.openstreetmap|basemaps/,r=>r.abort());
  await p.goto('http://localhost:5377/'+hash);await p.waitForTimeout(name.startsWith('insights')?6000:3500);
  if(act==='drawer'){ await p.click('.card >> nth=0').catch(()=>{}); await p.waitForTimeout(1500);}
  await p.screenshot({path:`${S}/audit/${name}.png`});
  console.log(name, errs.join('|')||'ok');
  await p.close();
}
await b.close();
