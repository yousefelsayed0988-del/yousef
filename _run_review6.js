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
    const c={buf:0,vao:0,del_buf:0,del_vao:0};
    const cb=gl.createBuffer.bind(gl), cv=gl.createVertexArray.bind(gl);
    gl.createBuffer=()=>{c.buf++;return cb();}; gl.createVertexArray=()=>{c.vao++;return cv();};
    const db=gl.deleteBuffer.bind(gl), dv=gl.deleteVertexArray.bind(gl);
    gl.deleteBuffer=x=>{c.del_buf++;return db(x);}; gl.deleteVertexArray=x=>{c.del_vao++;return dv(x);};
    const snaps=[];
    snaps.push(JSON.stringify(c));
    startGame();
    snaps.push(JSON.stringify(c));
    startGame();
    snaps.push(JSON.stringify(c));
    return {snaps, stack: (()=>{ try{ null.x }catch(e){return ''} })()};
  });
  console.log(JSON.stringify(out));
  await browser.close(); server.close();
})();
