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
  page.on('pageerror',e=>errs.push('PAGEERROR: '+e.message+ '\n' + (e.stack||'').split('\n').slice(0,4).join('\n')));
  await page.goto(`http://127.0.0.1:${port}/index.html`,{waitUntil:'load',timeout:120000});
  await page.waitForTimeout(30000);

  // instrument resource creation
  await page.evaluate(()=>{
    window.__cnt = {tex:0, fbo:0, rb:0, buf:0, vao:0};
    const ct=gl.createTexture.bind(gl), cf=gl.createFramebuffer.bind(gl), cr=gl.createRenderbuffer.bind(gl);
    gl.createTexture=()=>{window.__cnt.tex++;return ct();};
    gl.createFramebuffer=()=>{window.__cnt.fbo++;return cf();};
    gl.createRenderbuffer=()=>{window.__cnt.rb++;return cr();};
    const dt=gl.deleteTexture.bind(gl), df=gl.deleteFramebuffer.bind(gl);
    window.__del={tex:0,fbo:0};
    gl.deleteTexture=(x)=>{window.__del.tex++;return dt(x);};
    gl.deleteFramebuffer=(x)=>{window.__del.fbo++;return df(x);};
  });
  // simulate window resizes
  for (const [w,h] of [[801,521],[802,522],[803,523],[804,524],[805,525]]) {
    await page.setViewportSize({width:w,height:h});
    await page.waitForTimeout(250);
  }
  const leak = await page.evaluate(()=>({created:window.__cnt, deleted:window.__del, RW, RH}));
  console.log('RESIZE LEAK:', JSON.stringify(leak));

  // quality switching
  const qres = [];
  for (const q of [0,1,2,3,4,2]) {
    const r = await page.evaluate(async (q)=>{
      const before = {tex:window.__cnt.tex, fbo:window.__cnt.fbo};
      const b=[...document.getElementById('qSeg').children].find(x=>+x.dataset.q===q);
      b.onclick();
      await new Promise(r=>setTimeout(r,600));
      return {q, S_q:S.q, shadow: shadowRT&&shadowRT.size, RW,RH,
        C:bloomC&&[bloomC.w,bloomC.h], glErr: gl.getError(),
        newTex: window.__cnt.tex-before.tex, newFbo: window.__cnt.fbo-before.fbo, del: {...window.__del}};
    }, q);
    qres.push(r);
  }
  console.log('QUALITY:', JSON.stringify(qres,null,1));
  console.log('ERRS1:', JSON.stringify(errs.slice(0,20),null,1));
  await browser.close(); server.close();
})();
