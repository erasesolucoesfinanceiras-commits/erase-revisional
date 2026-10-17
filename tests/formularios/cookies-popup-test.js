// Cookies e pop-up: GA só após aceite, banner no celular, regras de abertura do pop-up por página. Rodar: node tests/formularios/cookies-popup-test.js (precisa de Playwright)
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..','..');
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.webp':'image/webp','.svg':'image/svg+xml','.png':'image/png','.json':'application/json'};
const srv=http.createServer((q,r)=>{let u=decodeURIComponent(q.url.split('?')[0]);let f=path.join(root,u);if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f+='/index.html';else if(!fs.existsSync(f)&&fs.existsSync(f+'.html'))f+='.html';if(!fs.existsSync(f)){r.statusCode=404;return r.end()}r.setHeader('content-type',mime[path.extname(f)]||'application/octet-stream');r.end(fs.readFileSync(f))}).listen(8768,async()=>{
 const b=await chromium.launch();let ok=0,bad=0;const t=(n,c,x='')=>{c?ok++:bad++;console.log(c?'OK   ':'FALHA',n,c?'':x)};
 const novo=async(vp)=>{const c=await b.newContext({viewport:vp});c.route(/googletagmanager|connect\.facebook|fonts\.|turnstile|challenges/,r=>r.abort());return c};
 // 1) GA só após aceite
 let ctx=await novo({width:1280,height:800}),pg=await ctx.newPage();
 const gaReq=[];const fbReq=[];ctx.on('request',r=>{if(/googletagmanager/.test(r.url()))gaReq.push(r.url());if(/connect\.facebook\.net/.test(r.url()))fbReq.push(r.url())});
 await pg.goto('http://localhost:8768/privacidade');await pg.waitForTimeout(800);
 t('Política de Privacidade cita o Meta Pixel e o aceite (Pixel configurado)',/Meta Pixel/.test(fs.readFileSync(path.join(root,'privacidade.html'),'utf8'))&&/sem o seu aceite o Pixel não é carregado/.test(fs.readFileSync(path.join(root,'privacidade.html'),'utf8')));
 t('Política cita o Cloudflare Turnstile, dados técnicos do navegador e o link oficial do Turnstile Privacy Addendum',(h=>/Cloudflare Turnstile/.test(h)&&/dados técnicos do seu navegador/.test(h)&&h.includes('href="https://www.cloudflare.com/turnstile-privacy-policy/"'))(fs.readFileSync(path.join(root,'privacidade.html'),'utf8')));
 t('banner cita o Google Analytics e a Meta (Pixel configurado)',/Google Analytics/.test(await pg.innerText('.cookie-bar'))&&/Meta/.test(await pg.innerText('.cookie-bar')));
 t('Pixel da Meta não carrega antes do aceite',fbReq.length===0&&await pg.evaluate(()=>!window.fbq));
 t('banner aparece na 1ª visita',await pg.locator('.cookie-bar').count()===1);
 t('GA não carrega antes do aceite',gaReq.length===0&&await pg.evaluate(()=>!window.gtag));
 await pg.click('.cookie-bar [data-c=sim]');await pg.waitForTimeout(500);
 t('após aceitar: GA é carregado e banner some',gaReq.length===1&&await pg.locator('.cookie-bar').count()===0&&await pg.evaluate(()=>typeof window.gtag==='function'));
 t('após aceitar: Pixel carrega (fbevents.js), com PageView na fila',fbReq.length===1&&/fbevents\.js/.test(fbReq[0])&&await pg.evaluate(()=>typeof window.fbq==='function'&&window.fbq.queue.some(a=>a[0]==='init'&&a[1]==='1740412147210905')&&window.fbq.queue.some(a=>a[0]==='track'&&a[1]==='PageView')));
 await pg.reload();await pg.waitForTimeout(500);
 t('aceite lembrado: sem banner e GA carrega de novo',await pg.locator('.cookie-bar').count()===0&&gaReq.length===2);
 await pg.click('[data-cookie-prefs]');t('"Preferências de cookies" reabre o banner',await pg.locator('.cookie-bar').count()===1);
 await pg.click('.cookie-bar [data-c=nao]');await pg.reload();await pg.waitForTimeout(500);
 t('recusa lembrada: sem banner, sem GA e sem Pixel',await pg.locator('.cookie-bar').count()===0&&gaReq.length===2&&fbReq.length===2&&await pg.evaluate(()=>!window.fbq));
 // 2) celular: barra baixa, não cobre o fim da página
 ctx=await novo({width:390,height:760});pg=await ctx.newPage();await pg.goto('http://localhost:8768/contato');await pg.waitForTimeout(600);
 const m=await pg.evaluate(()=>{const r=document.querySelector('.cookie-bar').getBoundingClientRect();return{h:r.height,pad:parseFloat(document.body.style.paddingBottom),vh:innerHeight}});
 t('celular: banner usa menos de 20% da altura e reserva o espaço no fim da página',m.h<m.vh*0.2&&m.pad>=m.h-1,JSON.stringify(m));
 await pg.screenshot({path:'/tmp/ck-mob.png'});
 // 3) pop-up
 const popup=async(url,vp,acoes)=>{const c=await novo(vp);await c.addInitScript(()=>localStorage.setItem('erase-cookies','nao'));const p=await c.newPage();await p.goto('http://localhost:8768'+url);await p.waitForTimeout(3300);const antes=await p.locator('.popup').count();await acoes(p);await p.waitForTimeout(600);return [antes,await p.locator('.popup').count()]};
 let r=await popup('/',{width:1280,height:800},async()=>{});t('capa: abre em 2,5 s',r[0]===1,r);
 for(const u of ['/privacidade','/termos','/sobre','/contato']){r=await popup(u,{width:1280,height:800},async p=>{await p.evaluate(()=>scrollTo(0,document.body.scrollHeight));await p.waitForTimeout(500)});t(`${u}: nunca abre (nem rolando)`,r[0]===0&&r[1]===0,r)}
 const art='/noticias/'+fs.readdirSync(root+'/noticias').find(f=>/emplacamentos/.test(f)).replace('.html','');
 r=await popup(art,{width:390,height:760},async p=>{await p.evaluate(()=>scrollTo(0,40));await p.waitForTimeout(300)});t('artigo: não abre em 3 s nem com rolagem curta',r[0]===0&&r[1]===0,r);
 r=await popup(art,{width:390,height:760},async p=>{await p.evaluate(()=>{const a=document.querySelector('main article');const r=a.getBoundingClientRect();scrollTo(0,scrollY+r.top+r.height*0.45)});await p.waitForTimeout(500)});t('artigo: abre depois de rolar cerca de metade do texto',r[0]===0&&r[1]===1,r);
 r=await popup('/radar',{width:1280,height:800},async p=>{await p.evaluate(()=>scrollTo(0,document.body.scrollHeight))});t('radar: só abre depois de rolar',r[0]===0&&r[1]===1,r);
 console.log(`${ok} ok, ${bad} falha(s)`);await b.close();srv.close();});
