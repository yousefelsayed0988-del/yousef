const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = '/home/user/yousef';
const server = http.createServer((req,res)=>{
  let p = decodeURIComponent(req.url.split('?')[0]); if (p==='/') p='/index.html';
  const f = path.join(ROOT,p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  let body = fs.readFileSync(f);
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
  page.on('console',m=>{ if(m.type()==='error') errs.push('CONSOLE: '+m.text()); });
  await page.goto(`http://127.0.0.1:${port}/index.html`,{waitUntil:'load',timeout:120000});
  await page.waitForFunction('typeof window.startGame === "function"',{timeout:120000});
  await page.waitForTimeout(20000);
  const r = await page.evaluate(()=>{
    const out = {};
    out.txKeys = Object.keys(TX).length;
    out.hasTrimPaint = !!TX.trimPaint;
    out.hasOakBoards = !!TX.oakBoards;
    try { startGame(); } catch(e){ out.startErr = e.message; }
    out.statics = WORLD.statics.map(s=>s.tex);
    out.staticsMissingTex = WORLD.statics.filter(s=>!TX[s.tex]).map(s=>s.tex);
    out.itemCount = items.length;
    const byType = {}; for (const it of items) byType[it.type]=(byType[it.type]||0)+1;
    out.byType = byType;
    // duplicate cells?
    const seen = new Map(); let dup=0;
    for (const it of items){ const k=it.x+','+it.y; if(seen.has(k)) dup++; seen.set(k,it.type); }
    out.dupCells = dup;
    out.ledgerLen = LEDGER.length;
    out.ledgerIdx = items.filter(i=>i.type==='ledger').map(i=>i.idx);
    out.missingModels = [...new Set(items.filter(i=>!WORLD.itemModels[i.type]).map(i=>i.type))];
    out.TEXINFO = TEXINFO;
    return out;
  });
  console.log(JSON.stringify(r,null,1));
  console.log('ERRS', JSON.stringify(errs.slice(0,20),null,1));
  await browser.close(); server.close(); process.exit(0);
})().catch(e=>{console.error('FAIL',e);process.exit(1);});
