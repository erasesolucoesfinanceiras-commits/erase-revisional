// Teste dos formulários (Playwright + CRM simulado). Pré-requisitos: site gerado em dist/ (npm run build) servido em http://localhost:8123
// (qualquer servidor estático que redirecione /x.html -> /x) e Playwright instalado. Rodar da raiz do repositório: node tests/formularios/crm-test.js
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const URL_CRM='https://lqxwdyjctsmirinvvyow.supabase.co/functions/v1/entrada-site';
const KEY='erase_site_179340d5359c433abb6011ee7c881e3e79f932e261ce4b04ac037debf431bf6e';
const CAMPOS_CALC='nome whatsapp lgpd_aceite tipo valor_financiado parcela n_parcelas parcelas_pagas parcelas_em_dia busca_apreensao mes_assinatura ano_assinatura data_assinatura status resultado taxa_calculada limite_referencia economia_estimada referencia_periodo media_bcb_periodo fonte_referencia data_hora data_hora_local origem_trafego pagina_entrada pagina_envio utm_source utm_medium utm_campaign utm_term utm_content lead_id'.split(' ');
const CAMPOS_POPUP='nome telefone parcelas_em_dia busca_apreensao lgpd_aceite status lead_id data_hora data_hora_local origem_trafego utm_source utm_medium utm_campaign utm_term utm_content pagina_entrada pagina_envio'.split(' ');
let pass=0, fail=0; const t=(nome,cond,extra='')=>{ (cond?pass++:fail++); console.log((cond?'OK   ':'FALHA'),nome, cond?'':extra); };
const cors={'access-control-allow-origin':'*','access-control-allow-headers':'content-type,x-api-key','access-control-allow-methods':'POST,OPTIONS'};
(async()=>{
 const b=await chromium.launch({args:['--no-sandbox']});
 async function novo(modo){ // modo: função (n)=> 'ok'|'500'|'okfalse'|'abort'
   const ctx=await b.newContext({viewport:{width:1300,height:900}}); await ctx.route(/fonts\./,r=>r.abort());
   const reqs=[]; let n=0, outros=[];
   await ctx.route(URL_CRM, async (route,req)=>{
     if(req.method()==='OPTIONS') return route.fulfill({status:204,headers:cors});
     n++; reqs.push({headers:req.headers(), body:JSON.parse(req.postData()), n});
     const m=modo(n);
     if(m==='abort') return route.abort();
     if(m==='500') return route.fulfill({status:500,headers:cors,contentType:'application/json',body:'{"error":"x"}'});
     if(m==='okfalse') return route.fulfill({status:200,headers:cors,contentType:'application/json',body:'{"ok":false}'});
     return route.fulfill({status:200,headers:cors,contentType:'application/json',body:'{"ok":true}'});
   });
   await ctx.route('http://localhost:8123/**',(route,req)=>{ if(req.method()==='POST') outros.push(req.url()); route.continue(); });
   await ctx.addInitScript(()=>sessionStorage.setItem('erase-popup','1'));
   return {ctx,reqs,outros};
 }
 // ---- NEWSLETTER
 { const {ctx,reqs,outros}=await novo(n=>n===1?'500':'ok'); const pg=await ctx.newPage(); await pg.goto('http://localhost:8123/');
   await pg.fill('#nl-email','ana@teste.com'); await pg.click('#newsletter-form button');
   await pg.waitForTimeout(400);
   t('newsletter: falha mostra mensagem de erro', /Não conseguimos enviar/.test(await pg.innerText('#newsletter-msg')));
   t('newsletter: falha mantém o e-mail digitado', await pg.inputValue('#nl-email')==='ana@teste.com');
   await pg.click('#newsletter-form button'); await pg.waitForTimeout(400);
   t('newsletter: 2ª tentativa dá sucesso e limpa', /Pronto/.test(await pg.innerText('#newsletter-msg')) && await pg.inputValue('#nl-email')==='');
   const r=reqs[1]; t('newsletter: corpo/headers', r.body.origem==='newsletter' && r.body.email==='ana@teste.com' && r.body['bot-field']==='' && r.headers['x-api-key']===KEY && /application\/json/.test(r.headers['content-type']), JSON.stringify(r.body));
   t('newsletter: sem lead_id (como antes)', !('lead_id' in r.body));
   t('newsletter: nenhum POST ao Netlify (/)', outros.length===0, outros.join()); await ctx.close(); }
 // ---- CONTATO
 { const {ctx,reqs}=await novo(n=>n===1?'okfalse':'ok'); const pg=await ctx.newPage(); await pg.goto('http://localhost:8123/contato.html');
   await pg.fill('#c-nome','Rui'); await pg.fill('#c-email','rui@t.com'); await pg.fill('#c-msg','Olá, preciso de ajuda');
   await pg.click('#contact-form button[type=submit]'); await pg.waitForTimeout(400);
   t('contato: 200 com {"ok":false} conta como falha', /Não conseguimos enviar/.test(await pg.innerText('#contact-msg')) && await pg.inputValue('#c-msg')==='Olá, preciso de ajuda');
   await pg.click('#contact-form button[type=submit]'); await pg.waitForTimeout(400);
   t('contato: sucesso depois', /recebida/.test(await pg.innerText('#contact-msg')));
   const r=reqs[1].body; t('contato: campos', r.origem==='contato' && r.nome==='Rui' && r.email==='rui@t.com' && r.mensagem.startsWith('Olá') && r['bot-field']===''); await ctx.close(); }
 // ---- POPUP
 { const {ctx,reqs}=await novo(n=>n===1?'abort':'ok'); const pg=await ctx.newPage(); await pg.addInitScript(()=>sessionStorage.removeItem('erase-popup'));
   await pg.goto('http://localhost:8123/?utm_source=google&utm_medium=cpc'); await pg.waitForSelector('.popup',{timeout:6000});
   await pg.fill('#pp-nome','Joao Souza'); await pg.fill('#pp-tel','81991547396'); await pg.locator('.popup input[name=situacao][value="Em dia"] + span').click(); await pg.check('#pp-lgpd');
   await pg.click('.popup button[type=submit]'); await pg.waitForTimeout(500);
   t('popup: falha de rede mostra erro e mantém dados', /Não conseguimos enviar/.test(await pg.innerText('#popup-msg')) && await pg.inputValue('#pp-nome')==='Joao Souza' && await pg.isVisible('.popup'));
   await pg.click('.popup button[type=submit]'); await pg.waitForTimeout(500);
   t('popup: 2ª tentativa dá sucesso', /Recebemos/.test(await pg.innerText('#popup-msg')));
   const a=reqs[0].body, c=reqs[1].body;
   t('popup: mesmo lead_id nas tentativas do mesmo envio', a.lead_id && a.lead_id===c.lead_id);
   t('popup: campos exatos', JSON.stringify(Object.keys(c).filter(k=>k!=='origem'&&k!=='bot-field').sort())===JSON.stringify([...CAMPOS_POPUP].sort()), JSON.stringify(Object.keys(c)));
   t('popup: origem/UTM/bot-field', c.origem==='popup-entrada' && c.utm_source==='google' && c.utm_medium==='cpc' && c.origem_trafego==='google' && c['bot-field']==='' && c.status==='novo' && c.lgpd_aceite==='sim'); await ctx.close(); }
 // ---- CALCULADORA
 { const {ctx,reqs,outros}=await novo(n=>n===1?'500':'ok'); const pg=await ctx.newPage(); await pg.goto('http://localhost:8123/calculadora.html?utm_source=meta&utm_campaign=teste');
   await pg.selectOption('#n_parcelas','48'); await pg.fill('#valor_financiado','40000'); await pg.fill('#parcela','1500'); await pg.fill('#pagas','10');
   await pg.locator('input[name=situacao][value="Em dia"] + span').click();
   await pg.fill('#lead-nome','Maria Silva'); await pg.fill('#lead-wa','81991547396'); await pg.check('#lgpd');
   await pg.click('#calc-btn'); await pg.waitForTimeout(600);
   t('calc: CRM falhou -> NÃO mostra resultado', (await pg.getAttribute('#analise','data-state'))!=='resultado' && (await pg.locator('.rate-big').count())===0);
   t('calc: CRM falhou -> mensagem amigável e botão volta', /Não conseguimos enviar/.test(await pg.innerText('#calc-msg')) && await pg.isEnabled('#calc-btn'));
   t('calc: CRM falhou -> dados mantidos', await pg.inputValue('#valor_financiado')==='40.000,00' && await pg.inputValue('#lead-nome')==='Maria Silva');
   await pg.click('#calc-btn'); await pg.waitForTimeout(900);
   t('calc: após confirmação mostra o resultado', (await pg.getAttribute('#analise','data-state'))==='resultado' && (await pg.locator('.rate-big').count())===1);
   const a=reqs[0].body, c=reqs[1].body;
   t('calc: mesmo lead_id nas 2 tentativas', a.lead_id && a.lead_id===c.lead_id);
   const ks=Object.keys(c).filter(k=>k!=='origem'&&k!=='bot-field').sort();
   t('calc: nomes de campos idênticos aos anteriores', JSON.stringify(ks)===JSON.stringify([...CAMPOS_CALC].sort()), 'extra/faltando: '+JSON.stringify([ks.filter(k=>!CAMPOS_CALC.includes(k)), CAMPOS_CALC.filter(k=>!ks.includes(k))]));
   t('calc: origem=calculadora, bot-field vazio, UTM, headers', c.origem==='calculadora' && c['bot-field']==='' && c.utm_source==='meta' && c.utm_campaign==='teste' && reqs[1].headers['x-api-key']===KEY && /application\/json/.test(reqs[1].headers['content-type']));
   t('calc: valores (taxa 2,7119 / status)', c.taxa_calculada==='2.7119' && c.status==='novo_acima_do_limite' && c.resultado==='acima_do_limite' && c.valor_financiado==='40000.00', JSON.stringify([c.taxa_calculada,c.status]));
   t('calc: nenhum POST ao Netlify (/)', outros.length===0, outros.join());
   await pg.click('#calc-btn'); await pg.waitForTimeout(500); t('calc: reenvio idêntico não duplica lead', reqs.length===2, 'reqs='+reqs.length);
   await ctx.close(); }
 // ---- CALC: erro de rede (abort) e timeout
 { const {ctx}=await novo(()=> 'abort'); const pg=await ctx.newPage(); await pg.goto('http://localhost:8123/calculadora.html');
   await pg.selectOption('#n_parcelas','48'); await pg.fill('#valor_financiado','40000'); await pg.fill('#parcela','1500'); await pg.fill('#pagas','10');
   await pg.locator('input[name=situacao][value="Em dia"] + span').click();
   await pg.fill('#lead-nome','Maria Silva'); await pg.fill('#lead-wa','81991547396'); await pg.check('#lgpd'); await pg.click('#calc-btn'); await pg.waitForTimeout(600);
   t('calc: sem rede -> sem resultado', (await pg.locator('.rate-big').count())===0 && /Não conseguimos/.test(await pg.innerText('#calc-msg'))); await ctx.close(); }
 await b.close(); console.log(`\n${pass} ok, ${fail} falha(s)`); process.exit(fail?1:0);
})();
