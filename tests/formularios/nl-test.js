// Teste dos formulários (Playwright + CRM simulado). Pré-requisitos: site gerado em dist/ (npm run build) servido em http://localhost:8123
// (qualquer servidor estático que redirecione /x.html -> /x) e Playwright instalado. Rodar da raiz do repositório: node tests/formularios/nl-test.js
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const URL_CRM='https://lqxwdyjctsmirinvvyow.supabase.co/functions/v1/entrada-site';
const KEY='erase_site_179340d5359c433abb6011ee7c881e3e79f932e261ce4b04ac037debf431bf6e';
const cors={'access-control-allow-origin':'*','access-control-allow-headers':'content-type,x-api-key','access-control-allow-methods':'POST,OPTIONS'};
let ok=0,bad=0; const t=(n,c,x='')=>{c?ok++:bad++; console.log(c?'OK   ':'FALHA',n,c?'':x);};
(async()=>{
 const b=await chromium.launch({args:['--no-sandbox']}); const ctx=await b.newContext({viewport:{width:1300,height:900}}); await ctx.route(/fonts\./,r=>r.abort());
 const reqs=[]; let n=0; await ctx.route(URL_CRM,(route,req)=>{ if(req.method()==='OPTIONS') return route.fulfill({status:204,headers:cors}); n++; reqs.push({h:req.headers(),b:JSON.parse(req.postData())});
   return n===1?route.fulfill({status:500,headers:cors,body:'{"error":"x"}',contentType:'application/json'}):route.fulfill({status:200,headers:cors,body:'{"ok":true}',contentType:'application/json'}); });
 await ctx.addInitScript(()=>sessionStorage.setItem('erase-popup','1'));
 const pg=await ctx.newPage(); await pg.goto('http://localhost:8123/');
 const nota=pg.locator('.newsletter-note');
 t('frase exata abaixo do formulário', (await nota.innerText()).startsWith('Ao se inscrever, você concorda em receber e-mails da ERASE e pode cancelar quando quiser.'));
 t('link para a Política de Privacidade (/privacidade)', await nota.locator('a').getAttribute('href')==='/privacidade' && /Pol[ií]tica de Privacidade/.test(await nota.locator('a').innerText()));
 const [yForm,yNota]=await Promise.all([pg.locator('#newsletter-form').boundingBox(),nota.boundingBox()]); t('nota fica embaixo do campo de e-mail', yNota.y>=yForm.y+yForm.height-1);
 await pg.fill('#nl-email','ana@teste.com'); await pg.click('#newsletter-form button'); await pg.waitForTimeout(500);
 t('falha: mensagem de erro e e-mail mantido', /Não conseguimos enviar/.test(await pg.innerText('#newsletter-msg')) && await pg.inputValue('#nl-email')==='ana@teste.com');
 await pg.click('#newsletter-form button'); await pg.waitForTimeout(500);
 t('2ª tentativa: sucesso e campo limpo', /Pronto/.test(await pg.innerText('#newsletter-msg')) && await pg.inputValue('#nl-email')==='');
 const c=reqs[1].b; t('corpo: email + lgpd_aceite="sim" + origem + bot-field vazio', c.email==='ana@teste.com' && c.lgpd_aceite==='sim' && c.origem==='newsletter' && c['bot-field']==='', JSON.stringify(c));
 t('corpo só tem esses campos (com campos de campanha, sem lead_id)', JSON.stringify(Object.keys(c).sort())===JSON.stringify(['bot-field','email','lgpd_aceite','origem','origem_trafego','pagina_entrada','pagina_envio','utm_source','utm_medium','utm_campaign','utm_term','utm_content'].sort()), Object.keys(c).join());
 t('headers: x-api-key e JSON', reqs[1].h['x-api-key']===KEY && /application\/json/.test(reqs[1].h['content-type']));
 await pg.fill('#nl-email','invalido'); await pg.click('#newsletter-form button'); await pg.waitForTimeout(200); t('e-mail inválido não envia', n===2 && /válido/.test(await pg.innerText('#newsletter-msg')));
 await b.close(); console.log(`\n${ok} ok, ${bad} falha(s)`); process.exit(bad?1:0);
})();
