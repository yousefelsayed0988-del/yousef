const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = '/home/user/yousef';
const server = http.createServer((req,res)=>{
  let p = decodeURIComponent(req.url.split('?')[0]); if (p==='/') p='/index.html';
  const f = path.join(ROOT,p);
  if (!f.startsWith(ROOT)||!fs.existsSync(f)){res.writeHead(404);res.end();return;}
  let body = fs.readFileSync(f);
  if (p==='/index.html') body = Buffer.from(body.toString('utf8').replace('window.__QA__=0;','window.__QA__=2;'),'utf8');
  res.writeHead(200,{'Content-Type': p.endsWith('.html')?'text/html':'application/octet-stream'});
  res.end(body);
});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const port = server.address().port;
  const browser = await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--enable-webgl','--disable-gpu-sandbox']});
  const page = await browser.newPage({viewport:{width:800,height:520}});
  const errs=[];
  page.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
  page.on('console',m=>{ if(m.type()==='error'||m.type()==='warning') errs.push(m.type().toUpperCase()+': '+m.text()); });
  await page.goto(`http://127.0.0.1:${port}/index.html`,{waitUntil:'load',timeout:120000});
  await page.waitForTimeout(30000);
  // install a GL error watcher
  const r0 = await page.evaluate(()=>{
    const out={};
    out.mode = typeof MODE!=='undefined'?MODE:'?';
    out.started = typeof gameStarted!=='undefined'?gameStarted:'?';
    out.glErr = gl.getError();
    out.progs = Object.keys(PROG);
    out.mainU = Object.keys(PROG.main.u);
    out.postU = Object.keys(PROG.post.u);
    out.brightU = Object.keys(PROG.bright.u);
    out.blurU = Object.keys(PROG.blur.u);
    out.depthU = Object.keys(PROG.depth.u);
    out.targets = {RW,RH, sceneRT:!!sceneRT, A:bloomA&&[bloomA.w,bloomA.h], B:bloomB&&[bloomB.w,bloomB.h], C:bloomC&&[bloomC.w,bloomC.h], D:bloomD&&[bloomD.w,bloomD.h], shadow: shadowRT&&shadowRT.size};
    return out;
  });
  console.log(JSON.stringify(r0,null,1));
  // per-frame GL error check
  const r1 = await page.evaluate(async ()=>{
    const seen=[];
    const orig = renderFrame;
    window.renderFrame = function(dt){ orig(dt); const e=gl.getError(); if(e) seen.push(e); };
    await new Promise(r=>setTimeout(r,2000));
    return seen.slice(0,10);
  });
  console.log('GLERR after frames:', JSON.stringify(r1));
  console.log('ERRS:', JSON.stringify(errs.slice(0,30),null,1));
  await browser.close(); server.close();
})();
