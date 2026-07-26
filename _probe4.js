const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT='/home/user/yousef';
const server=http.createServer((req,res)=>{ let p=decodeURIComponent(req.url.split('?')[0]); if(p==='/')p='/index.html';
  const f=path.join(ROOT,p); if(!f.startsWith(ROOT)||!fs.existsSync(f)){res.writeHead(404);res.end();return;}
  let b=fs.readFileSync(f);
  if(p==='/index.html') b=Buffer.from(b.toString('utf8').replace('window.__QA__=0;','window.__QA__=1;'),'utf8');
  res.writeHead(200,{'Content-Type':p.endsWith('.html')?'text/html':'application/octet-stream'}); res.end(b); });
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r)); const port=server.address().port;
  const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--enable-webgl','--disable-gpu-sandbox']});
  const page=await browser.newPage({viewport:{width:900,height:600}});
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/index.html`,{waitUntil:'load',timeout:120000});
  await page.waitForFunction('typeof window.startGame === "function"',{timeout:120000});
  await page.waitForTimeout(20000);
  // resize leak
  const leak = await page.evaluate(()=>{
    const g=gl; let fbo=0,tex=0,dfbo=0,dtex=0;
    const cf=g.createFramebuffer.bind(g), ct=g.createTexture.bind(g), df=g.deleteFramebuffer.bind(g), dt=g.deleteTexture.bind(g);
    g.createFramebuffer=function(){fbo++;return cf();}; g.createTexture=function(){tex++;return ct();};
    g.deleteFramebuffer=function(x){dfbo++;return df(x);}; g.deleteTexture=function(x){dtex++;return dt(x);};
    let n=0;
    for (let i=0;i<10;i++){ // simulate 10 distinct window sizes
      const w=900+i*7; Object.defineProperty(window,'innerWidth',{value:w,configurable:true});
      resize(); n++;
    }
    return {resizes:n, fbCreated:fbo, texCreated:tex, fbDeleted:dfbo, texDeleted:dtex, RW, RH};
  });
  console.log('RESIZE', JSON.stringify(leak));
  await page.screenshot({path:'/tmp/claude-0/-home-user-yousef/710ecfb7-b827-55d2-bf06-e3fde3293331/scratchpad/shot.png'});
  console.log('ERRS',errs.slice(0,5));
  await browser.close(); server.close(); process.exit(0);
})().catch(e=>{console.error('FAIL',e);process.exit(1);});
