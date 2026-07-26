const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = '/home/user/yousef';
const server = http.createServer((req,res)=>{
  let p = decodeURIComponent(req.url.split('?')[0]); if (p==='/') p='/index.html';
  const f = path.join(ROOT,p);
  if (!f.startsWith(ROOT)||!fs.existsSync(f)){res.writeHead(404);res.end();return;}
  let body = fs.readFileSync(f);
  if (p==='/index.html') body = Buffer.from(body.toString('utf8').replace('window.__QA__=0;','window.__QA__=1;'),'utf8');
  res.writeHead(200,{'Content-Type': p.endsWith('.html')?'text/html':'application/octet-stream'});
  res.end(body);
});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const port = server.address().port;
  const browser = await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--enable-webgl','--disable-gpu-sandbox']});
  const page = await browser.newPage({viewport:{width:800,height:520}});
  const errs=[]; page.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
  await page.goto(`http://127.0.0.1:${port}/index.html`,{waitUntil:'load',timeout:120000});
  await page.waitForTimeout(25000);
  const out = await page.evaluate(()=>{
    const log=[];
    setMode('play'); P.alive=true; V.active=true; V.busy=0; V.stun=0;
    // put a box down at a known spot offset from the cell centre
    P.boxes = 3;
    // choose the player's cell, drop the box near a corner
    P.x = Math.floor(P.x)+0.08; P.z = Math.floor(P.z)+0.08;
    placeMusicBox();
    const box = THROWN.find(t=>t.kind==='box');
    log.push('box placed at '+box.x.toFixed(2)+','+box.z.toFixed(2)+' life='+box.life+' smashT='+box.smashT);
    // teleport the Lodger to the arrival ring: 0.85 from the cell centre
    const cx = Math.floor(box.x)+0.5, cz = Math.floor(box.z)+0.5;
    V.x = cx + 0.85; V.z = cz;
    log.push('V at '+V.x.toFixed(2)+','+V.z.toFixed(2)+'  dist to box='+Math.hypot(V.x-box.x,V.z-box.z).toFixed(2));
    // force him into investigate on this lure
    updateThrown(0.016);
    const smashes = [];
    const origSmash = window.smashLureAt;
    let n=0;
    window.smashLureAt = function(l){ n++; return origSmash(l); };
    // run 50 simulated seconds
    let boxAlive=[], busySpikes=0, prevBusy=0;
    for (let i=0;i<3000;i++){
      // keep him pinned near the arrival ring (no real pathing needed: he stops when busy)
      try{ updateThrown(0.016); updateBoons(0.016); updateVillain(0.016); }catch(e){ log.push('THROW '+e.message); break; }
      if (V.busy>prevBusy+1) busySpikes++;
      prevBusy=V.busy;
      if (i%250===0){ const b=THROWN.find(t=>t.kind==='box'); boxAlive.push(b?+b.life.toFixed(1):null); }
    }
    const b = THROWN.find(t=>t.kind==='box');
    log.push('after 48s: box still in THROWN = '+!!b + (b?(' life='+b.life.toFixed(1)+' smashT='+b.smashT+' until='+b.until):''));
    log.push('smashLureAt calls = '+n+', busy re-spikes = '+busySpikes);
    log.push('box life samples: '+JSON.stringify(boxAlive));
    log.push('boxSet items live: '+items.filter(i=>i.type==='boxSet').map(i=>i.live).join(','));
    return log;
  });
  console.log(out.join('\n'));
  console.log('ERRS:', JSON.stringify(errs.slice(0,10)));
  await browser.close(); server.close();
})();
