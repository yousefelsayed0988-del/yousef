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
  const res = await page.evaluate(async ()=>{
    const setLocs = new Set();
    for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(gl))){
      if (/^uniform(Matrix)?[1-4]/.test(k)){
        const orig = gl[k].bind(gl);
        gl[k] = function(loc, ...rest){ setLocs.add(loc); return orig(loc, ...rest); };
      }
    }
    // also record texture unit bindings per active program at draw time
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(r,120))));
    const out = {};
    for (const name of Object.keys(PROG)){
      const p = PROG[name];
      const unset = [];
      for (const u of Object.keys(p.u)) if (!setLocs.has(p.u[u])) unset.push(u);
      out[name] = unset;
    }
    return out;
  });
  console.log('UNIFORMS DECLARED BUT NOT SET IN A FRAME:', JSON.stringify(res,null,1));
  // repeat at Low quality (bloom off, no shadows)
  const res2 = await page.evaluate(async ()=>{
    const b=[...document.getElementById('qSeg').children].find(x=>+x.dataset.q===0); b.onclick();
    await new Promise(r=>setTimeout(r,900));
    const setLocs = new Set();
    for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(gl))){
      if (/^uniform(Matrix)?[1-4]/.test(k)){
        const orig = gl[k].bind(gl);
        gl[k] = function(loc, ...rest){ setLocs.add(loc); return orig(loc, ...rest); };
      }
    }
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(r,120))));
    const out = {};
    for (const name of Object.keys(PROG)){
      const p = PROG[name]; const unset=[];
      for (const u of Object.keys(p.u)) if (!setLocs.has(p.u[u])) unset.push(u);
      out[name]=unset;
    }
    return out;
  });
  console.log('AT LOW QUALITY:', JSON.stringify(res2,null,1));
  console.log('ERRS',JSON.stringify(errs.slice(0,5)));
  await browser.close(); server.close();
})();
