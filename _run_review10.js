const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT='/home/user/yousef';
const src = fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const i = src.indexOf('<script>', src.indexOf('__TEXPACK__')); // main script
// take the LAST script block
const j = src.lastIndexOf('<script>'); const k = src.lastIndexOf('</script>');
const body = src.slice(j+8, k);
// candidate call targets
const calls = [...new Set([...body.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)\s*\(/g)].map(m=>m[1]))];
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
  await page.goto(`http://127.0.0.1:${port}/index.html`,{waitUntil:'load',timeout:120000});
  await page.waitForTimeout(22000);
  const missing = await page.evaluate((names)=>{
    const out=[];
    for(const n of names){
      let t;
      try { t = eval('typeof '+n); } catch(e){ t='ERR'; }
      if (t === 'undefined' || t === 'ERR') out.push(n+':'+t);
    }
    return out;
  }, calls);
  console.log('CANDIDATE CALLS NOT RESOLVABLE AS GLOBALS ('+missing.length+' of '+calls.length+'):');
  console.log(missing.join('\n'));
  await browser.close(); server.close();
})();
