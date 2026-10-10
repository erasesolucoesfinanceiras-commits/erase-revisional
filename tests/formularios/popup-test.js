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
