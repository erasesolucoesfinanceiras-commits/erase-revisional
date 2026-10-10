// Teste do pop-up de entrada (CRM simulado): payload/urgência por situação, textos obrigatórios, celular. Servir dist/ em :8123 (URLs sem .html) e rodar: node tests/formularios/popup-test.js
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const URL_CRM='https://lqxwdyjctsmirinvvyow.supabase.co/functions/v1/entrada-site';
const cors={'access-control-allow-origin':'*','access-control-allow-headers':'content-type,x-api-key','access-control-allow-methods':'POST,OPTIONS'};
let ok=0,bad=0;const t=(n,c,x='')=>{c?ok++:bad++;console.log(c?'OK   ':'FALHA',n,c?'':x)};
(async()=>{
 const b=await chromium.launch({args:['--no-sandbox']});
 const esperado={'Em dia':['Em dia',''],'Atrasadas':['Atrasadas',''],'Veículo com busca e apreensão':['','Já tem processo de busca e apreensão']};
 for(const [sit,[pd,ba]] of Object.entries(esperado)){
  const ctx=await b.newContext({viewport:{width:1300,height:900}});await ctx.route(/fonts\./,r=>r.abort());
  const reqs=[];await ctx.route(URL_CRM,(route,req)=>{if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:cors});reqs.push(JSON.parse(req.postData()));route.fulfill({status:200,headers:cors,contentType:'application/json',body:'{"ok":true}'})});
  const pg=await ctx.newPage();await pg.goto('http://localhost:8123/');
  t('popup não abre de imediato',await pg.locator('.popup').count()===0);
  await pg.waitForSelector('.popup',{timeout:6000});
  if(sit==='Em dia'){await pg.waitForTimeout(500);await pg.screenshot({path:'/tmp/desktop.png'});
   t('texto GRATUITA em caixa alta e aviso',/TOTALMENTE GRATUITA/.test(await pg.innerText('.free-badge'))&&/não é análise jurídica|sem valor de análise jurídica/i.test(await pg.innerText('.popup-legal')));
   t('sem campo de e-mail',await pg.locator('.popup input[type=email],.popup input[name=email]').count()===0);
   t('título sem % nem R$',!/[%$]/.test(await pg.innerText('#popup-title')));}
  if(sit==='Em dia'){ // validação: envio bloqueado, aviso listando o que falta, estado do botão antes/depois
   const btn=pg.locator('.popup-cta');
   t('botão incompleto: aria-disabled=true e texto "Preencha os dados para enviar"',await btn.getAttribute('aria-disabled')==='true'&&/Preencha os dados para enviar/.test(await btn.innerText()));
   const estiloAntes=await btn.evaluate(e=>{const c=getComputedStyle(e);return [c.backgroundColor,c.borderStyle].join('|')});
   await btn.click({force:true}); await pg.waitForTimeout(200);
   t('campos vazios: nada é enviado',reqs.length===0);
   const m=await pg.innerText('#popup-msg');
   t('aviso lista tudo o que falta',/Falta preencher: nome, WhatsApp, a situação das parcelas e a autorização de contato\./.test(m),m);
   t('campos faltantes destacados com mensagem curta (nome, WhatsApp, situação, autorização)',await pg.locator('.popup .field.invalid').count()===4&&await pg.locator('.popup .field.invalid .err:visible').count()===4);
   t('foco vai ao primeiro campo faltante (nome)',await pg.evaluate(()=>document.activeElement&&document.activeElement.id==='pp-nome'));
   await pg.fill('#pp-nome','Joao'); await pg.fill('#pp-tel','81900000000'); await pg.click('.popup-cta',{force:true}); await pg.waitForTimeout(150);
   t('nome com 1 palavra continua faltando (só nome + situação + autorização)',/Falta preencher: nome, a situação das parcelas e a autorização de contato\./.test(await pg.innerText('#popup-msg'))&&reqs.length===0,await pg.innerText('#popup-msg'));
   await pg.fill('#pp-nome','Joao Souza'); await pg.fill('#pp-tel','8190000'); await pg.click('.popup-cta',{force:true}); await pg.waitForTimeout(150);
   t('WhatsApp incompleto é recusado',/WhatsApp/.test(await pg.innerText('#popup-msg'))&&reqs.length===0);
   await pg.fill('#pp-tel','81900000000'); await pg.locator('.popup input[name=situacao][value="Atrasadas"] + span').click(); await pg.waitForTimeout(100);
   await pg.click('.popup-cta',{force:true}); await pg.waitForTimeout(150);
   t('só falta a autorização: aviso específico, nada enviado, foco na caixa',/Falta preencher: a autorização de contato\./.test(await pg.innerText('#popup-msg'))&&reqs.length===0&&await pg.evaluate(()=>document.activeElement.id==='pp-lgpd'));
   await pg.check('#pp-lgpd'); await pg.waitForTimeout(100);
   const estiloDepois=await btn.evaluate(e=>{const c=getComputedStyle(e);return [c.backgroundColor,c.borderStyle].join('|')});
   t('botão completo: aria-disabled=false, texto "Enviar dados" e estilo diferente do incompleto (não só cor)',await btn.getAttribute('aria-disabled')==='false'&&/Enviar dados/.test(await btn.innerText())&&estiloAntes!==estiloDepois&&estiloAntes.endsWith('dashed')&&!estiloDepois.endsWith('dashed'),estiloAntes+' / '+estiloDepois);
   t('aviso e destaques somem quando tudo está preenchido',(await pg.innerText('#popup-msg'))===''&&await pg.locator('.popup .field.invalid').count()===0);
   await pg.fill('#pp-nome',''); await pg.fill('#pp-tel',''); await pg.locator('.popup input[name=situacao]:checked').evaluate(e=>{e.checked=false;e.dispatchEvent(new Event('change',{bubbles:true}))}); await pg.uncheck('#pp-lgpd');
  }
  await pg.fill('#pp-nome','TESTE CLAUDE - NAO LIGAR');await pg.fill('#pp-tel','81900000000');
  await pg.locator(`.popup input[name=situacao][value="${sit}"] + span`).click();
  if(sit==='Em dia'){const w=await pg.evaluate(()=>getComputedStyle(document.querySelector('.popup input[name=situacao]:checked + span'),'::before').content);t('opção marcada tem ✓ (não só cor)',w.includes('✓'),w);}
  await pg.check('#pp-lgpd');await pg.click('.popup button[type=submit]');await pg.waitForTimeout(600);
  const r=reqs[0]||{};
  t(`${sit}: payload`,r.origem==='popup-entrada'&&r.parcelas_em_dia===pd&&r.busca_apreensao===ba&&r.status==='novo'&&r.lgpd_aceite==='sim'&&!!r.lead_id&&r.nome.startsWith('TESTE')&&!('email' in r),JSON.stringify(r));
  await ctx.close();}
 // celular
 const m=await b.newContext({viewport:{width:375,height:740},isMobile:true,hasTouch:true});await m.route(/fonts\./,r=>r.abort());
 const pm=await m.newPage();await pm.goto('http://localhost:8123/');await pm.waitForSelector('.popup',{timeout:6000});await pm.waitForTimeout(500);
 await pm.screenshot({path:'/tmp/mobile.png'});
 const sw=await pm.evaluate(()=>[document.documentElement.scrollWidth,innerWidth]);t('celular: sem rolagem horizontal',sw[0]<=sw[1],sw);
 const cl=await pm.locator('.popup-close').boundingBox();t('celular: fechar ≥44px',cl.width>=44&&cl.height>=44);
 await pm.locator('.popup-close').tap();t('celular: fecha',await pm.locator('.popup').count()===0);
 await pm.reload();await pm.waitForTimeout(500);t('não reabre na mesma sessão',await pm.locator('.popup').count()===0);
 await b.close();console.log(`${ok} ok, ${bad} falha(s)`);process.exit(bad?1:0)})();
