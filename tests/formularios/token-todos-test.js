// Todo formulário que envia lead ao CRM manda o token do Turnstile no campo "turnstile" (desktop e 390 px).
// Rodar: servir dist/ em http://localhost:8123 (npm run publish) e: NODE_PATH=$(npm root -g) node tests/formularios/token-todos-test.js
const { chromium } = require('playwright');
const URL_CRM = 'https://lqxwdyjctsmirinvvyow.supabase.co/functions/v1/entrada-site';
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type,x-api-key', 'access-control-allow-methods': 'POST,OPTIONS' };
let pass = 0, fail = 0; const t = (n, c, x = '') => { (c ? pass++ : fail++); console.log(c ? 'OK   ' : 'FALHA', n, c ? '' : x); };
const B = 'http://localhost:8123';
const FLUXOS = {
  async analise(pg) {
    await pg.locator('.chat-soft', { hasText: 'Prefiro falar com a equipe' }).click();
    await pg.locator('#ch-campo').waitFor({ timeout: 8000 }); await pg.fill('#ch-campo', 'Ana'); await pg.click('.chat-enviar');
    await pg.locator('.chat-opt', { hasText: 'Em dia' }).click({ timeout: 8000 });
    await pg.locator('.chat-opt', { hasText: 'Não tenho' }).click({ timeout: 8000 });
    await pg.locator('#ch-campo').waitFor({ timeout: 8000 }); await pg.fill('#ch-campo', '(81) 98421-7365'); await pg.keyboard.press('Enter');
    await pg.locator('[data-r="sim"]').click({ timeout: 8000 });
  },
  async popup(pg) {
    await pg.waitForSelector('.popup', { timeout: 6000 }); await pg.fill('#pp-nome', 'Joao Souza'); await pg.fill('#pp-tel', '81991547396');
    await pg.locator('.popup input[name=situacao][value="Em dia"] + span').click(); await pg.check('#pp-lgpd'); await pg.click('.popup button[type=submit]');
  },
  async contato(pg) { await pg.fill('#c-nome', 'Rui'); await pg.fill('#c-email', 'rui@t.com'); await pg.fill('#c-msg', 'Olá, preciso de ajuda'); await pg.click('#contact-form button[type=submit]'); },
  async newsletter(pg) { await pg.fill('#nl-email', 'ana@teste.com'); await pg.click('#newsletter-form button'); },
  async newsletterLateral(pg) { await pg.fill('#sb-email', 'ana@teste.com'); await pg.check('#sb-lgpd'); await pg.click('#sb-news-form button[type=submit]'); },
  async calculadora(pg) {
    await pg.selectOption('#n_parcelas', '48'); await pg.fill('#valor_financiado', '40000'); await pg.fill('#parcela', '1500'); await pg.fill('#pagas', '10');
    await pg.locator('input[name=situacao][value="Em dia"] + span').click(); await pg.fill('#lead-nome', 'Maria Silva'); await pg.fill('#lead-wa', '81991547396'); await pg.check('#lgpd'); await pg.click('#calc-btn');
  },
};
const PAGINAS = { analise: '/analise', popup: '/', contato: '/contato.html', newsletter: '/', newsletterLateral: '/radar', calculadora: '/calculadora.html' };
const ORIGEM = { analise: 'formulario-analise-revisional', popup: 'popup-entrada', contato: 'contato', newsletter: 'newsletter', newsletterLateral: 'newsletter', calculadora: 'calculadora' };
(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  for (const [nomeVp, vp] of [['desktop', { width: 1300, height: 900 }], ['390px', { width: 390, height: 844 }]]) {
    for (const f of Object.keys(FLUXOS)) {
      const ctx = await b.newContext({ viewport: vp, hasTouch: vp.width < 600 }); await require('./_turnstile')(ctx); await ctx.route(/fonts\./, (r) => r.abort());
      await ctx.route(/googletagmanager|connect\.facebook/, (r) => r.abort());
      const reqs = [];
      await ctx.route(URL_CRM, (route, req) => { if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors }); reqs.push(JSON.parse(req.postData())); route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: '{"ok":true}' }); });
      await ctx.route(/wa\.me/, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: 'wa' }));
      if (f !== 'popup') await ctx.addInitScript(() => sessionStorage.setItem('erase-popup', '1'));
      const pg = await ctx.newPage(); await pg.goto(B + PAGINAS[f]);
      await FLUXOS[f](pg); await pg.waitForTimeout(1500);
      t(`${f} (${nomeVp}): envia ao CRM com turnstile = token do widget`, reqs.length >= 1 && reqs[0].origem === ORIGEM[f] && reqs[0].turnstile === 'token-teste', JSON.stringify(reqs[0] && { o: reqs[0].origem, t: reqs[0].turnstile, n: reqs.length }));
      await ctx.close();
    }
  }
  await b.close(); console.log(`\n${pass} ok, ${fail} falha(s)`); process.exit(fail ? 1 : 0);
})();
