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
    P.boxes = 3;
    P.x = Math.floor(P.x)+0.08; P.z = Math.floor(P.z)+0.08;
    placeMusicBox();
    updateThrown(0.016);
    const box = THROWN.find(t=>t.kind==='box');
    const lure = LURES.find(l=>l.kind==='box');
    log.push('BEFORE: box.life='+box.life+'  box.until='+box.until+'  lure='+JSON.stringify(lure));
    smashLureAt(lure);
    log.push('AFTER smashLureAt: box.life='+box.life+'  box.until='+box.until+'  box.smashT='+box.smashT);
    log.push('boxSet item live -> '+items.filter(i=>i.type==='boxSet').map(i=>i.live).join(','));
    // next frame: is it still a lure?
    updateThrown(0.016);
    const lure2 = LURES.find(l=>l.kind==='box');
    log.push('NEXT FRAME lure still present: '+JSON.stringify(lure2));
    // does it still chime?
    let chimes=0; const orig=SFX.musicBox; SFX.musicBox=function(){chimes++;};
    for(let i=0;i<600;i++) updateThrown(0.016);   // ~10s
    SFX.musicBox=orig;
    const b=THROWN.find(t=>t.kind==='box');
    log.push('10s later: box present='+!!b+(b?(' life='+b.life.toFixed(1)):'')+'  chimes played='+chimes);
    const l3 = LURES.find(l=>l.kind==='box');
    log.push('and still a lure: '+JSON.stringify(l3));
    return log;
  });
  console.log(out.join('\n'));
  console.log('ERRS:', JSON.stringify(errs.slice(0,10)));
  await browser.close(); server.close();
})();
