const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT='/home/user/yousef';
const server = http.createServer((req,res)=>{
  let p=decodeURIComponent(req.url.split('?')[0]); if(p==='/')p='/index.html';
  const f=path.join(ROOT,p); if(!f.startsWith(ROOT)||!fs.existsSync(f)){res.writeHead(404);res.end();return;}
  let b=fs.readFileSync(f);
  if(p==='/index.html') b=Buffer.from(b.toString('utf8').replace('window.__QA__=0;','window.__QA__=1;'),'utf8');
  res.writeHead(200,{'Content-Type':p.endsWith('.html')?'text/html':'application/octet-stream'}); res.end(b);
});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const port=server.address().port;
  const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--enable-webgl','--disable-gpu-sandbox']});
  const page=await browser.newPage({viewport:{width:800,height:520}});
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/index.html`,{waitUntil:'load',timeout:120000});
  await page.waitForTimeout(25000);
  const out=await page.evaluate(()=>{
    const log=[];
    log.push('typeof smashLureAt = '+(typeof smashLureAt));
    try { smashLureAt({x:0,z:0}); log.push('direct call: no throw'); }
    catch(e){ log.push('direct call threw: '+e.name+': '+e.message); }

    setMode('play'); P.alive=true; V.active=true; V.busy=0; V.stun=0; P.boxes=3;
    // find two floor cells far apart
    const floors=[]; for(let y=0;y<MH;y++)for(let x=0;x<MW;x++) if(!solid(x,y)) floors.push({x,y});
    const a=floors[0];
    let b=null,bd=0; for(const f of floors){const d=Math.hypot(f.x-a.x,f.y-a.y); if(d>bd){bd=d;b=f;}}
    // player drops the box near the corner of cell a, then runs to b
    P.x=a.x+0.06; P.z=a.y+0.06;
    placeMusicBox();
    P.x=b.x+0.5; P.z=b.y+0.5;
    updateThrown(0.016);
    const box=THROWN.find(t=>t.kind==='box');
    const cx=Math.floor(box.x)+0.5, cz=Math.floor(box.z)+0.5;
    log.push('box at '+box.x.toFixed(2)+','+box.z.toFixed(2)+' cell centre '+cx+','+cz+
             '  offset='+Math.hypot(box.x-cx,box.z-cz).toFixed(2)+'  player at '+P.x+','+P.z);
    resetMind();
    V.mind.conf=0.30; V.mind.lastKnown=null;
    NOISE.level=0; NOISE.alertT=0; NOISE.heardAt=null;
    // stand him just inside the arrival ring, on the far side from the box
    const ux=(cx-box.x)/Math.hypot(cx-box.x,cz-box.z), uz=(cz-box.z)/Math.hypot(cx-box.x,cz-box.z);
    V.x=cx+ux*0.88; V.z=cz+uz*0.88;
    log.push('V at '+V.x.toFixed(2)+','+V.z.toFixed(2)+
             '  d(centre)='+Math.hypot(V.x-cx,V.z-cz).toFixed(2)+
             '  d(box)='+Math.hypot(V.x-box.x,V.z-box.z).toFixed(2));
    setVState('investigate');
    let thrown=null;
    try { updateVillain(0.016); } catch(e){ thrown=e.name+': '+e.message+' || '+String(e.stack).split('\n')[1]; }
    log.push('updateVillain -> '+(thrown||('no throw, state='+V.state+' busy='+V.busy)));
    return log;
  });
  console.log(out.join('\n')); console.log('PAGEERRS',JSON.stringify(errs.slice(0,5)));
  await browser.close(); server.close();
})();
