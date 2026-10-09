// Teste da calculadora (Playwright + CRM simulado). Pré-requisitos: site gerado em dist/ servido em http://localhost:8123 e Playwright.
// Rodar da raiz do repositório: node tests/formularios/calc-test.js
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const URL_CRM='https://lqxwdyjctsmirinvvyow.supabase.co/functions/v1/entrada-site';
const KEY='erase_site_179340d5359c433abb6011ee7c881e3e79f932e261ce4b04ac037debf431bf6e';
let ok=0,bad=0; const t=(n,c,x='')=>{c?ok++:bad++; console.log(c?'OK   ':'FALHA',n,c?'':x);};
const cors={'access-control-allow-origin':'*','access-control-allow-headers':'content-type,x-api-key','access-control-allow-methods':'POST,OPTIONS'};
(async()=>{
 const b=await chromium.launch({args:['--no-sandbox']});
 async function rodar(modo, fn){
   const ctx=await b.newContext({viewport:{width:1300,height:900}}); await ctx.route(/fonts\./,r=>r.abort());
   const reqs=[]; let n=0, posts=[];
   await ctx.route(URL_CRM, async (route,req)=>{ if(req.method()==='OPTIONS') return route.fulfill({status:204,headers:cors});
     n++; reqs.push({h:req.headers(),b:JSON.parse(req.postData())}); const m=modo(n);
     if(m==='abort') return route.abort(); if(m==='500') return route.fulfill({status:500,headers:cors,body:'{"error":"x"}',contentType:'application/json'});
     return route.fulfill({status:200,headers:cors,body:'{"ok":true}',contentType:'application/json'}); });
   await ctx.route('http://localhost:8123/**',(route,req)=>{ if(req.method()==='POST') posts.push(req.url()); route.continue(); });
   await ctx.addInitScript(()=>sessionStorage.setItem('erase-popup','1'));
   const pg=await ctx.newPage(); await pg.goto('http://localhost:8123/calculadora.html?utm_source=meta&utm_campaign=teste');
   await pg.selectOption('#n_parcelas','48'); await pg.fill('#valor_financiado','40000'); await pg.fill('#parcela','1500'); await pg.fill('#pagas','10');
   await pg.locator('input[name=situacao][value="Em dia"] + span').click();
   await pg.fill('#lead-nome','Maria Silva'); await pg.fill('#lead-wa','81991547396'); await pg.check('#lgpd');
   await fn(pg,reqs,posts); await ctx.close();
 }
 await rodar(n=>n===1?'500':'ok', async (pg,reqs,posts)=>{
   await pg.click('#calc-btn'); await pg.waitForTimeout(600);
   t('calc: CRM falhou -> NÃO mostra resultado', (await pg.getAttribute('#analise','data-state'))!=='resultado' && (await pg.locator('.rate-big').count())===0);
   t('calc: CRM falhou -> mensagem amigável, botão volta, dados mantidos', /Não conseguimos enviar/.test(await pg.innerText('#calc-msg')) && await pg.isEnabled('#calc-btn') && await pg.inputValue('#lead-nome')==='Maria Silva');
   await pg.click('#calc-btn'); await pg.waitForTimeout(900);
   t('calc: confirmado -> mostra o resultado', (await pg.getAttribute('#analise','data-state'))==='resultado' && (await pg.locator('.rate-big').count())===1);
   const a=reqs[0].b, c=reqs[1].b;
   t('calc: mesmo lead_id nas 2 tentativas', a.lead_id && a.lead_id===c.lead_id);
   t('calc: origem, bot-field vazio, UTM, headers', c.origem==='calculadora' && c['bot-field']==='' && c.utm_source==='meta' && c.utm_campaign==='teste' && reqs[1].h['x-api-key']===KEY && /application\/json/.test(reqs[1].h['content-type']));
   t('calc: taxa 2,7119 e status', c.taxa_calculada==='2.7119' && /acima/.test(c.status), JSON.stringify([c.taxa_calculada,c.status]));
   t('calc: nenhum POST ao Netlify (/)', posts.length===0, posts.join());
   console.log('     campos enviados:', Object.keys(c).length, '→', Object.keys(c).join(','));
   await pg.click('#calc-btn'); await pg.waitForTimeout(500); t('calc: reenvio idêntico não duplica lead', reqs.length===2, 'reqs='+reqs.length);
 });
 await rodar(()=>'abort', async (pg)=>{ await pg.click('#calc-btn'); await pg.waitForTimeout(600);
   t('calc: sem rede -> sem resultado e com aviso', (await pg.locator('.rate-big').count())===0 && /Não conseguimos/.test(await pg.innerText('#calc-msg'))); });

 // ---- 1ª parcela no ato + total pago / total de juros (calculadora atual)
 const taxaPrice=(pv,p,n,noAto)=>{ const f=(i)=>{ const m=pv*i/(1-Math.pow(1+i,-n)); return noAto? m/(1+i): m; }; let lo=1e-9,hi=1; for(let k=0;k<200;k++){ const mid=(lo+hi)/2; if(f(mid)<p) lo=mid; else hi=mid; } return (lo+hi)/2*100; };
 await rodar(()=>'ok', async (pg,reqs)=>{
   t('no ato: campo existe, é opcional e vem marcado como "Não"', await pg.locator('input[name=primeira_no_ato][value="Não"]').isChecked() && !(await pg.locator('input[name=primeira_no_ato][value="Sim"]').isChecked()) && /1ª parcela foi paga no ato/.test(await pg.innerText('[data-group=primeira_no_ato]')));
   await pg.click('#calc-btn'); await pg.waitForTimeout(900);
   const txt=await pg.innerText('#panel-body');
   t('totais: mostra total pago (parcela × prazo) e total de juros', /Total pago no contrato/.test(txt) && /72\.000,00/.test(txt) && /Total de juros/.test(txt) && /32\.000,00/.test(txt), txt.slice(0,300));
   t('totais: linguagem simples + aviso de estimativa', /Em palavras simples/.test(txt) && /estimativa e não substitui a análise do contrato/.test(txt));
   t('no ato "Não": taxa enviada = Price comum', reqs[0].b.taxa_calculada===taxaPrice(40000,1500,48,false).toFixed(4), reqs[0].b.taxa_calculada);
   t('no ato "Não": campos enviados ao CRM não mudaram (34)', Object.keys(reqs[0].b).length===34, Object.keys(reqs[0].b).length+'');
 });
 await rodar(()=>'ok', async (pg,reqs)=>{
   await pg.locator('input[name=primeira_no_ato][value="Sim"] + span').click();
   await pg.click('#calc-btn'); await pg.waitForTimeout(900);
   const txt=await pg.innerText('#panel-body');
   t('no ato "Sim": taxa = Price antecipada (maior que a comum)', reqs[0].b.taxa_calculada===taxaPrice(40000,1500,48,true).toFixed(4) && taxaPrice(40000,1500,48,true)>taxaPrice(40000,1500,48,false), reqs[0].b.taxa_calculada+' vs '+taxaPrice(40000,1500,48,true).toFixed(4));
   t('no ato "Sim": resultado informa o cálculo com 1ª parcela no ato', /1ª parcela paga no ato/.test(txt));
   t('no ato "Sim": totais continuam parcela × prazo', /72\.000,00/.test(txt) && /32\.000,00/.test(txt));
 });
 await b.close(); console.log(`\n${ok} ok, ${bad} falha(s)`); process.exit(bad?1:0);
})();
