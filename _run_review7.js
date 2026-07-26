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
    log.push('typeof smashLureAt = '+ (typeof smashLureAt));
    setMode('play'); P.alive=true; V.active=true; V.busy=0; V.stun=0; P.boxes=3;
    placeMusicBox();
    updateThrown(0.016);
    const box=THROWN.find(t=>t.kind==='box');
    const lure=LURES.find(l=>l.kind==='box');
    log.push('lure='+JSON.stringify(lure));
    // put him on the lure's cell so the investigate arrival branch fires
    resetMind();
    V.mind.conf = 0.3;
    V.mind.lastKnown = {x:Math.floor(box.x), y:Math.floor(box.z)};
    V.x = Math.floor(box.x)+0.5; V.z = Math.floor(box.z)+0.5;
    NOISE.level = 0;
    let thrown=null, ticks=-1;
    for(let i=0;i<600;i++){
      updateThrown(0.05); updateBoons(0.05);
      NOISE.level = 0; V.mind.conf = 0.30;
      setVState('investigate');
      V.x = Math.floor(box.x)+0.5; V.z = Math.floor(box.z)+0.5-0.85;
      try{ updateVillain(0.05); }catch(e){ thrown = e.message+' | '+String(e.stack).split('\n')[1]; ticks=i; break; }
    }
    log.push('updateVillain threw: '+thrown+'  at tick '+ticks+'  V.state='+V.state+' V.busy='+V.busy);
    return log;
  });
  console.log(out.join('\n')); console.log('PAGEERRS', JSON.stringify(errs.slice(0,5)));
  await browser.close(); server.close();
})();
