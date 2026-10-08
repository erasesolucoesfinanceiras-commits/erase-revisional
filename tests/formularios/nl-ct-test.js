// Teste dos formulários (Playwright + CRM simulado). Pré-requisitos: site gerado em dist/ (npm run build) servido em http://localhost:8123
// (qualquer servidor estático que redirecione /x.html -> /x) e Playwright instalado. Rodar da raiz do repositório: node tests/formularios/nl-ct-test.js
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const URL_CRM='https://lqxwdyjctsmirinvvyow.supabase.co/functions/v1/entrada-site';
const KEY='erase_site_179340d5359c433abb6011ee7c881e3e79f932e261ce4b04ac037debf431bf6e';
const cors={'access-control-allow-origin':'*','access-control-allow-headers':'content-type,x-api-key','access-control-allow-methods':'POST,OPTIONS'};
const CAMP=['origem_trafego','pagina_entrada','pagina_envio','utm_source','utm_medium','utm_campaign','utm_term','utm_content'];
let ok=0,bad=0; const t=(n,c,x='')=>{c?ok++:bad++; console.log(c?'OK   ':'FALHA',n,c?'':x);};
(async()=>{
 const b=await chromium.launch({args:['--no-sandbox']});
 async function ctxNovo(){ const ctx=await b.newContext({viewport:{width:1300,height:900}}); await ctx.route(/fonts\./,r=>r.abort()); const reqs=[]; let n=0;
   await ctx.route(URL_CRM,(route,req)=>{ if(req.method()==='OPTIONS') return route.fulfill({status:204,headers:cors}); n++; reqs.push({h:req.headers(),b:JSON.parse(req.postData())});
     return n===1?route.fulfill({status:500,headers:cors,body:'{"error":"x"}',contentType:'application/json'}):route.fulfill({status:200,headers:cors,body:'{"ok":true}',contentType:'application/json'}); });
   await ctx.addInitScript(()=>sessionStorage.getItem('erase-popup')||sessionStorage.setItem('erase-popup','1')); return {ctx,reqs}; }
 const LINK='/?utm_source=google&utm_medium=email&utm_campaign=boasvindas&utm_term=juros&utm_content=cta1';
 // ---------- NEWSLETTER (chegou por link com campanha, na home)
 { const {ctx,reqs}=await ctxNovo(); const pg=await ctx.newPage(); await pg.goto('http://localhost:8123'+LINK);
   await pg.fill('#nl-email','ana@teste.com'); await pg.click('#newsletter-form button'); await pg.waitForTimeout(500);
   t('newsletter: falha -> erro e e-mail mantido', /Não conseguimos enviar/.test(await pg.innerText('#newsletter-msg')) && await pg.inputValue('#nl-email')==='ana@teste.com');
   await pg.click('#newsletter-form button'); await pg.waitForTimeout(500);
   t('newsletter: 2ª tentativa -> sucesso', /Pronto/.test(await pg.innerText('#newsletter-msg')));
   const c=reqs[1].b;
   t('newsletter: UTMs do link', c.utm_source==='google' && c.utm_medium==='email' && c.utm_campaign==='boasvindas' && c.utm_term==='juros' && c.utm_content==='cta1', JSON.stringify(c));
   t('newsletter: origem_trafego/pagina_entrada/pagina_envio', c.origem_trafego==='google' && c.pagina_entrada===LINK && c.pagina_envio==='/', JSON.stringify([c.origem_trafego,c.pagina_entrada,c.pagina_envio]));
   t('newsletter: email + lgpd + origem + bot-field vazio', c.email==='ana@teste.com' && c.lgpd_aceite==='sim' && c.origem==='newsletter' && c['bot-field']==='');
   t('newsletter: conjunto exato de campos (sem lead_id/data_hora)', JSON.stringify(Object.keys(c).sort())===JSON.stringify(['bot-field','email','lgpd_aceite','origem',...CAMP].sort()), Object.keys(c).join());
   t('newsletter: headers', reqs[1].h['x-api-key']===KEY && /application\/json/.test(reqs[1].h['content-type'])); await ctx.close(); }
 // ---------- NEWSLETTER sem campanha: campos presentes e vazios, origem "direto"
 { const {ctx,reqs}=await ctxNovo(); const pg=await ctx.newPage(); await pg.goto('http://localhost:8123/');
   await pg.fill('#nl-email','b@t.com'); await pg.click('#newsletter-form button'); await pg.waitForTimeout(400); await pg.click('#newsletter-form button'); await pg.waitForTimeout(400);
   const c=reqs[1].b; t('newsletter sem campanha: utm_* vazios, origem "direto"', c.utm_source==='' && c.utm_campaign==='' && c.origem_trafego==='direto' && c.pagina_entrada==='/', JSON.stringify(c)); await ctx.close(); }
 // ---------- CONTATO (entrou pela home com campanha e foi para /contato)
 { const {ctx,reqs}=await ctxNovo(); const pg=await ctx.newPage(); await pg.goto('http://localhost:8123'+LINK); await pg.goto('http://localhost:8123/contato');
   await pg.fill('#c-nome','Rui'); await pg.fill('#c-email','rui@t.com'); await pg.fill('#c-msg','Olá, preciso de ajuda');
   await pg.click('#contact-form button[type=submit]'); await pg.waitForTimeout(500);
   t('contato: falha -> erro e dados mantidos', /Não conseguimos enviar/.test(await pg.innerText('#contact-msg')) && await pg.inputValue('#c-msg')==='Olá, preciso de ajuda');
   await pg.click('#contact-form button[type=submit]'); await pg.waitForTimeout(500);
   t('contato: 2ª tentativa -> sucesso', /recebida/.test(await pg.innerText('#contact-msg')));
   const c=reqs[1].b;
   t('contato: UTMs preservados entre páginas', c.utm_source==='google' && c.utm_medium==='email' && c.utm_campaign==='boasvindas' && c.utm_term==='juros' && c.utm_content==='cta1', JSON.stringify(c));
   t('contato: origem_trafego, pagina_entrada (1ª página), pagina_envio (/contato)', c.origem_trafego==='google' && c.pagina_entrada===LINK && c.pagina_envio==='/contato', JSON.stringify([c.origem_trafego,c.pagina_entrada,c.pagina_envio]));
   t('contato: nome/email/mensagem + origem + bot-field vazio', c.nome==='Rui' && c.email==='rui@t.com' && c.mensagem.startsWith('Olá') && c.origem==='contato' && c['bot-field']==='');
   t('contato: conjunto exato de campos (com lead_id)', JSON.stringify(Object.keys(c).sort())===JSON.stringify(['bot-field','email','mensagem','nome','origem','lead_id',...CAMP].sort()), Object.keys(c).join());
   t('contato: headers', reqs[1].h['x-api-key']===KEY && /application\/json/.test(reqs[1].h['content-type'])); await ctx.close(); }
 await b.close(); console.log(`\n${ok} ok, ${bad} falha(s)`); process.exit(bad?1:0);
})();
