// Medição sem aviso de cookies (GA e Pixel ao abrir), Política de Privacidade, regras de abertura do pop-up por página. Rodar: node tests/formularios/cookies-popup-test.js (precisa de Playwright)
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..','..');
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.webp':'image/webp','.svg':'image/svg+xml','.png':'image/png','.json':'application/json'};
const srv=http.createServer((q,r)=>{let u=decodeURIComponent(q.url.split('?')[0]);let f=path.join(root,u);if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f+='/index.html';else if(!fs.existsSync(f)&&fs.existsSync(f+'.html'))f+='.html';if(!fs.existsSync(f)){r.statusCode=404;return r.end()}r.setHeader('content-type',mime[path.extname(f)]||'application/octet-stream');r.end(fs.readFileSync(f))}).listen(8768,async()=>{
 const b=await chromium.launch();let ok=0,bad=0;const t=(n,c,x='')=>{c?ok++:bad++;console.log(c?'OK   ':'FALHA',n,c?'':x)};
 const novo=async(vp)=>{const c=await b.newContext({viewport:vp});c.route(/googletagmanager|connect\.facebook|fonts\.|turnstile|challenges/,r=>r.abort());return c};
 // 1) sem aviso de cookies: GA e Pixel carregam ao abrir qualquer página
 let ctx=await novo({width:1280,height:800}),pg=await ctx.newPage();
 const gaReq=[];const fbReq=[];ctx.on('request',r=>{if(/googletagmanager/.test(r.url()))gaReq.push(r.url());if(/connect\.facebook\.net/.test(r.url()))fbReq.push(r.url())});
 await pg.goto('http://localhost:8768/contato');await pg.waitForTimeout(800);
 t('sem barra de cookies e sem link "Preferências de cookies" no rodapé',await pg.locator('.cookie-bar,[data-cookie-prefs]').count()===0);
 t('GA carrega ao abrir a página, sem aceite',gaReq.length===1&&await pg.evaluate(()=>typeof window.gtag==='function'));
 t('Pixel carrega ao abrir (fbevents.js), com init e PageView na fila',fbReq.length===1&&/fbevents\.js/.test(fbReq[0])&&await pg.evaluate(()=>typeof window.fbq==='function'&&window.fbq.queue.some(a=>a[0]==='init'&&a[1]==='1740412147210905')&&window.fbq.queue.some(a=>a[0]==='track'&&a[1]==='PageView')));
 await pg.evaluate(()=>localStorage.setItem('erase-cookies','nao'));await pg.reload();await pg.waitForTimeout(500);
 t('não resta lógica de escolha: mesmo com "erase-cookies=nao" antigo no navegador, GA e Pixel carregam',gaReq.length===2&&fbReq.length===2);
 t('o código de aceite foi removido do JS (sem erase-cookies, sem cookie-bar)',!/erase-cookies|cookie-bar|data-cookie-prefs/.test(fs.readFileSync(path.join(root,'assets/js/main.js'),'utf8')+fs.readFileSync(path.join(root,'assets/css/style.css'),'utf8')));
 // 2) Política de Privacidade
 const h=fs.readFileSync(path.join(root,'privacidade.html'),'utf8');
 t('Política: Meta Pixel e GA carregam ao abrir qualquer página, base legal legítimo interesse (sem "se você aceitar")',/Meta Pixel/.test(h)&&/legítimo interesse/.test(h)&&/quando você abre qualquer página/.test(h)&&!/sem o seu aceite|Se você aceitar|Preferências de cookies|consentimento para cookies/.test(h)&&!/cookies de estatística e de anúncios só funcionam/.test(h));
 t('Política: como recusar (navegador, janela anônima, complemento do Google, preferências de anúncios da Meta com link oficial, oposição por e-mail)',/bloquear ou apagar os cookies/.test(h)&&/janela anônima/.test(h)&&h.includes('tools.google.com/dlpage/gaoptout')&&h.includes('href="https://www.meta.com/pt-br/help/accounts-center/1894490827562393/"')&&/oposição/.test(h));
 t('Política cita o Cloudflare Turnstile, dados técnicos do navegador e o link oficial do Turnstile Privacy Addendum',/Cloudflare Turnstile/.test(h)&&/dados técnicos do seu navegador/.test(h)&&h.includes('href="https://www.cloudflare.com/turnstile-privacy-policy/"'));
 t('Política descreve o chat /analise (respostas, CRM, Meta, Cloudflare, Google)',/Chat de análise gratuita \(\/analise\)/.test(h)&&/primeiro nome, WhatsApp e as suas respostas/.test(h)&&/e a Meta \(Meta Pixel/.test(h)&&/a Cloudflare \(hospedagem/.test(h));
 t('Política tem base legal, prazos de guarda, canal do titular sem encarregado, controladora com CNPJ e transferência internacional',/base legal/.test(h)&&/executar o contrato/.test(h)&&/até 12 meses após o último contato/.test(h)&&/até 5 anos após o fim do contrato/.test(h)&&/não indicamos encarregado/.test(h)&&/CNPJ 59\.449\.234\/0001-63/.test(h)&&(h.match(/mailto:atendimento@eraseconsulta\.com\.br/g)||[]).length>=2&&/Cloudflare, Supabase, Meta, Google e Microsoft\) podem armazenar ou processar os dados em servidores fora do Brasil/.test(h));
 t('Política: Microsoft Clarity (análise de navegação anônima, dados digitados mascarados, legítimo interesse, link da Microsoft) e na lista de fornecedores',/Microsoft Clarity/.test(h)&&/registra, de forma anônima, cliques, rolagem e movimentos/.test(h)&&/são mascarados e não são enviados ao Clarity/.test(h)&&/Google Analytics, Meta Pixel e Microsoft Clarity\), nos apoiamos no nosso <strong>legítimo interesse/.test(h)&&h.includes('href="https://privacy.microsoft.com/privacystatement"')&&/a Microsoft \(Microsoft Clarity, conforme a seção 6\)/.test(h)&&/o Microsoft Clarity carregam quando você abre a página/.test(h));
 t('Termos não dizem mais que cookies dependem de consentimento',!/só são ativados depois do seu consentimento/.test(fs.readFileSync(path.join(root,'termos.html'),'utf8')));
 // 3) pop-up
 const popup=async(url,vp,acoes)=>{const c=await novo(vp);await c.addInitScript(()=>localStorage.setItem('erase-cookies','nao'));const p=await c.newPage();await p.goto('http://localhost:8768'+url);await p.waitForTimeout(3300);const antes=await p.locator('.popup').count();await acoes(p);await p.waitForTimeout(600);return [antes,await p.locator('.popup').count()]};
 let r=await popup('/',{width:1280,height:800},async()=>{});t('capa: abre em 2,5 s',r[0]===1,r);
 for(const u of ['/privacidade','/termos','/sobre','/contato']){r=await popup(u,{width:1280,height:800},async p=>{await p.evaluate(()=>scrollTo(0,document.body.scrollHeight));await p.waitForTimeout(500)});t(`${u}: nunca abre (nem rolando)`,r[0]===0&&r[1]===0,r)}
 const art='/noticias/'+fs.readdirSync(root+'/noticias').find(f=>/emplacamentos/.test(f)).replace('.html','');
 r=await popup(art,{width:390,height:760},async p=>{await p.evaluate(()=>scrollTo(0,40));await p.waitForTimeout(300)});t('artigo: não abre em 3 s nem com rolagem curta',r[0]===0&&r[1]===0,r);
 r=await popup(art,{width:390,height:760},async p=>{await p.evaluate(()=>{const a=document.querySelector('main article');const r=a.getBoundingClientRect();scrollTo(0,scrollY+r.top+r.height*0.45)});await p.waitForTimeout(500)});t('artigo: abre depois de rolar cerca de metade do texto',r[0]===0&&r[1]===1,r);
 r=await popup('/radar',{width:1280,height:800},async p=>{await p.evaluate(()=>scrollTo(0,document.body.scrollHeight))});t('radar: só abre depois de rolar',r[0]===0&&r[1]===1,r);
 console.log(`${ok} ok, ${bad} falha(s)`);await b.close();srv.close();});
