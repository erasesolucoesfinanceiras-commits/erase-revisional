// Honeypot (bot-field) na calculadora e no pop-up: preenchido = descartado em silêncio (sem aviso, sem envio ao CRM). Servir dist/ em :8123 e rodar: node tests/formularios/honeypot-test.js
const { chromium } = require('playwright');
let ok = 0, bad = 0; const t = (n, c, x = '') => { c ? ok++ : bad++; console.log(c ? 'OK   ' : 'FALHA', n, c ? '' : x); };
(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const novo = async () => { const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); await require('./_turnstile')(ctx); await ctx.route(/fonts\.|googletagmanager/, (r) => r.abort()); const reqs = []; await ctx.route(/supabase\.co/, (r) => { reqs.push(r.request().method()); r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: '{"ok":true}' }); }); return { ctx, reqs }; };
  // calculadora: sem honeypot um envio vazio mostra os avisos de campos obrigatórios; com o honeypot preenchido nada acontece
  let { ctx, reqs } = await novo(); let pg = await ctx.newPage();
  await pg.goto('http://localhost:8123/calculadora'); await pg.evaluate(() => localStorage.setItem('erase-cookies', 'nao'));
  await pg.click('#calc-btn'); await pg.waitForTimeout(300);
  const comAvisos = await pg.locator('.field.invalid, .err:visible').count();
  await pg.reload(); await pg.fill('input[name="bot-field"]', 'spam', { force: true }).catch(() => pg.evaluate(() => { document.querySelector('input[name="bot-field"]').value = 'spam'; }));
  await pg.evaluate(() => { document.querySelector('input[name="bot-field"]').value = 'spam'; }); await pg.click('#calc-btn'); await pg.waitForTimeout(400);
  const semAvisos = await pg.locator('.field.invalid, .err:visible').count();
  t('calculadora: envio vazio mostra avisos; com honeypot preenchido é descartado em silêncio e nada vai ao CRM', comAvisos > 0 && semAvisos === 0 && reqs.length === 0, JSON.stringify({ comAvisos, semAvisos, reqs }));
  await ctx.close();
  // pop-up
  ({ ctx, reqs } = await novo()); pg = await ctx.newPage();
  await pg.addInitScript(() => localStorage.setItem('erase-cookies', 'nao'));
  await pg.goto('http://localhost:8123/'); await pg.waitForSelector('.popup', { timeout: 6000 });
  await pg.click('.popup-cta', { force: true }); await pg.waitForTimeout(300);
  const avisoNormal = (await pg.innerText('#popup-msg')).trim();
  await pg.evaluate(() => { document.querySelector('#popup-form input[name="bot-field"]').value = 'spam'; document.querySelector('#popup-msg').textContent = ''; });
  await pg.click('.popup-cta', { force: true }); await pg.waitForTimeout(300);
  const avisoComHp = (await pg.innerText('#popup-msg')).trim();
  t('pop-up: envio vazio avisa o que falta; com honeypot preenchido é descartado em silêncio e nada vai ao CRM', avisoNormal.length > 0 && avisoComHp === '' && reqs.length === 0, JSON.stringify({ avisoNormal, avisoComHp, reqs }));
  console.log(`${ok} ok, ${bad} falha(s)`); await b.close(); process.exit(bad ? 1 : 0);
})();
