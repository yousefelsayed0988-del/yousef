const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = '/home/user/yousef';
const server = http.createServer((req,res)=>{
  let p = decodeURIComponent(req.url.split('?')[0]); if (p==='/') p='/index.html';
  const f = path.join(ROOT,p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200,{'Content-Type': p.endsWith('.html')?'text/html':'application/octet-stream'});
  res.end(fs.readFileSync(f));
});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const port = server.address().port;
  const browser = await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--enable-webgl','--disable-gpu-sandbox']});
  const page = await browser.newPage({viewport:{width:800,height:520}});
  const errs=[]; page.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
  await page.goto(`http://127.0.0.1:${port}/index.html`,{waitUntil:'load',timeout:120000});
  await page.waitForFunction('typeof window.startGame === "function"',{timeout:120000});
  await page.waitForTimeout(18000);
  const r = await page.evaluate(()=>{
    const out = {seedsWithDup:0, worstUnique:99, tot:0, errs:[]};
    for (let s=0;s<300;s++){
      try{
        generateLevel((s*2654435761)>>>0);
        const cells = new Set();
        for (const it of items) cells.add(it.x+','+it.y);
        out.tot++;
        if (cells.size < items.length) out.seedsWithDup++;
        out.worstUnique = Math.min(out.worstUnique, cells.size);
      }catch(e){ out.errs.push(s+': '+e.message); if(out.errs.length>3) break; }
    }
    return out;
  });
  console.log('SEEDS', JSON.stringify(r));

  // GPU leak on restart
  const leak = await page.evaluate(()=>{
    const g = gl;
    let vaos=0, bufs=0, dels=0, dbufs=0;
    const cv = g.createVertexArray.bind(g), cb = g.createBuffer.bind(g);
    const dv = g.deleteVertexArray.bind(g), db = g.deleteBuffer.bind(g);
    g.createVertexArray = function(){ vaos++; return cv(); };
    g.createBuffer = function(){ bufs++; return cb(); };
    g.deleteVertexArray = function(x){ dels++; return dv(x); };
    g.deleteBuffer = function(x){ dbufs++; return db(x); };
    for (let i=0;i<3;i++) startGame();
    return {vaosCreated:vaos, buffersCreated:bufs, vaosDeleted:dels, buffersDeleted:dbufs};
  });
  console.log('LEAK', JSON.stringify(leak));
  console.log('ERRS', JSON.stringify(errs.slice(0,10)));
  await browser.close(); server.close(); process.exit(0);
})().catch(e=>{console.error('FAIL',e);process.exit(1);});
