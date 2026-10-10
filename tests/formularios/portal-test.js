// Testes no navegador da fase 1 do portal (carrossel, barra lateral, newsletter, tamanhos). Servir dist/ em :8123 (URLs sem .html).
// Rodar da raiz: node tests/formularios/portal-test.js
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const URL_CRM = 'https://lqxwdyjctsmirinvvyow.supabase.co/functions/v1/entrada-site';
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type,x-api-key', 'access-control-allow-methods': 'POST,OPTIONS' };
let ok = 0, bad = 0; const t = (n, c, x = '') => { c ? ok++ : bad++; console.log(c ? 'OK   ' : 'FALHA', n, c ? '' : x); };
const PAGS = ['/', '/noticias/pf-apura-fraude-em-financiamentos-veiculares-com-uso-de-biometria-em-mg', '/categoria-revisional', '/artigos', '/radar', '/como-produzimos'];
(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const novo = async (vp, extra = {}) => { const ctx = await b.newContext({ viewport: vp, ...extra }); await ctx.addInitScript(() => sessionStorage.setItem('erase-popup', '1')); await ctx.route(/fonts\.|googletagmanager/, (r) => r.abort()); return ctx; };

  // ---- tamanhos: sem rolagem horizontal, em claro e escuro
  for (const [w, h] of [[1366, 768], [390, 844], [1920, 950]]) {
    for (const tema of ['light', 'dark']) {
      const ctx = await novo({ width: w, height: h }); const pg = await ctx.newPage(); const falhas = [];
      await pg.addInitScript((tm) => { try { localStorage.setItem('erase-theme', tm); } catch (e) { /* */ } }, tema);
      for (const u of PAGS) { await pg.goto('http://localhost:8123' + u); await pg.waitForTimeout(150); const r = await pg.evaluate(() => [document.documentElement.scrollWidth, innerWidth, document.documentElement.getAttribute('data-theme')]); if (r[0] > r[1] || r[2] !== tema) falhas.push(u + JSON.stringify(r)); }
      t(`${w}x${h} (${tema}): nenhuma página tem rolagem horizontal`, !falhas.length, falhas.join(' '));
      await ctx.close();
    }
  }
  { const ctx = await novo({ width: 1366, height: 768 }); const pg = await ctx.newPage(); await pg.goto('http://localhost:8123/'); await pg.waitForTimeout(300);
    const m = await pg.evaluate(() => { const s = document.querySelector('.slide'); return { h: s.offsetHeight, imgs: [...document.querySelectorAll('.slide img, .cat-tile img, .mini-thumb img')].every((i) => i.getAttribute('width') && i.getAttribute('height')), lazy: [...document.querySelectorAll('.cat-tile img, .mini-thumb img')].every((i) => i.getAttribute('loading') === 'lazy'), semScriptExterno: [...document.scripts].every((s) => !s.src || s.src.startsWith(location.origin) || /googletagmanager/.test(s.src)) }; });
    t('1366x768: carrossel com altura fixa (340–440), imagens com largura/altura e preguiçosas, sem script externo', m.h >= 340 && m.h <= 440 && m.imgs && m.lazy && m.semScriptExterno, JSON.stringify(m));
    const h1 = await pg.evaluate(() => document.querySelector('.carousel').offsetHeight); await pg.waitForTimeout(500); t('carrossel: altura não muda depois de carregar (sem deslocar o layout)', (await pg.evaluate(() => document.querySelector('.carousel').offsetHeight)) === h1);
    await ctx.close(); }

  // ---- carrossel
  { const ctx = await novo({ width: 1366, height: 768 }); const pg = await ctx.newPage(); await pg.goto('http://localhost:8123/'); await pg.waitForTimeout(300);
    const n = await pg.locator('.slide').count();
    t('carrossel: setas/pontos visíveis com JS; seta anterior desabilitada no 1º slide', await pg.locator('.car-nav').isVisible() && await pg.locator('.car-prev').isDisabled() && (await pg.locator('.car-dot').count()) === n);
    t('carrossel: só o slide visível é acessível (os outros ficam inert)', await pg.evaluate(() => [...document.querySelectorAll('.slide')].filter((s) => !s.hasAttribute('inert')).length === 1));
    await pg.click('.car-next'); await pg.waitForTimeout(700);
    t('carrossel: próximo → 2º ponto marcado (aria-current + contador em texto "2 / N")', await pg.locator('.car-dot').nth(1).getAttribute('aria-current') === 'true' && (await pg.innerText('.car-count')).replace(/\s+/g, '') === `2/${n}`);
    await pg.locator('.car-dot').nth(0).focus(); await pg.keyboard.press('ArrowRight'); await pg.waitForTimeout(700);
    t('carrossel: setas do teclado nos pontos mudam de slide', await pg.locator('.car-dot').nth(1).getAttribute('aria-current') === 'true' || await pg.locator('.car-dot').nth(2).getAttribute('aria-current') === 'true');
    await pg.click('.car-dot >> nth=0'); await pg.waitForTimeout(1800); const antes = await pg.evaluate(() => document.querySelector('.carousel-track').scrollLeft); await pg.waitForTimeout(3500);
    t('carrossel: sem autoplay (nada muda sozinho)', (await pg.evaluate(() => document.querySelector('.carousel-track').scrollLeft)) === antes && await pg.locator('.car-dot').nth(0).getAttribute('aria-current') === 'true');
    await ctx.close(); }
  { const ctx = await novo({ width: 1366, height: 768 }, { reducedMotion: 'reduce' }); const pg = await ctx.newPage(); await pg.goto('http://localhost:8123/'); await pg.waitForTimeout(300);
    await pg.click('.car-next'); await pg.waitForTimeout(80);
    t('prefers-reduced-motion: o carrossel troca de slide sem animação', (await pg.evaluate(() => document.querySelector('.carousel-track').scrollLeft)) >= (await pg.evaluate(() => document.querySelector('.carousel-track').clientWidth)) - 2);
    await ctx.close(); }
  { const ctx = await novo({ width: 1366, height: 768 }, { javaScriptEnabled: false }); const pg = await ctx.newPage(); await pg.goto('http://localhost:8123/'); await pg.waitForTimeout(200);
    t('sem JS: carrossel vira faixa rolável e os controles ficam escondidos', !(await pg.locator('.car-nav').isVisible()) && (await pg.locator('.slide').count()) >= 1 && await pg.evaluate(() => getComputedStyle(document.querySelector('.carousel-track')).overflowX === 'auto'));
    await ctx.close(); }

  // ---- newsletter da barra lateral (CRM simulado)
  async function news(modo) {
    const ctx = await novo({ width: 1366, height: 768 }); const reqs = [];
    await ctx.route(URL_CRM, (route, req) => { if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors }); reqs.push(JSON.parse(req.postData())); route.fulfill({ status: modo === 'erro' ? 500 : 200, headers: cors, contentType: 'application/json', body: modo === 'erro' ? '{"error":"x"}' : '{"ok":true}' }); });
    const pg = await ctx.newPage(); await pg.goto('http://localhost:8123/?utm_source=google'); await pg.waitForTimeout(300); return { ctx, pg, reqs };
  }
  { const { ctx, pg, reqs } = await news('ok'); const btn = pg.locator('#sb-news-form button[type=submit]');
    t('newsletter: botão apagado (aria-disabled + texto) até completar', await btn.getAttribute('aria-disabled') === 'true' && /Preencha para receber/.test(await btn.innerText()));
    await btn.click({ force: true }); await pg.waitForTimeout(200);
    t('newsletter: clique incompleto não envia, lista o que falta e destaca os campos', reqs.length === 0 && /Falta preencher: e-mail válido e a autorização de envio\./.test(await pg.innerText('#sb-msg')) && (await pg.locator('#sb-news-form .field.invalid').count()) === 2 && await pg.evaluate(() => document.activeElement.id === 'sb-email'));
    await pg.fill('#sb-email', 'ana@teste'); await pg.check('#sb-lgpd'); await btn.click({ force: true }); await pg.waitForTimeout(150);
    t('newsletter: e-mail inválido continua bloqueando', reqs.length === 0 && /e-mail válido/.test(await pg.innerText('#sb-msg')));
    await pg.fill('#sb-email', 'ana@teste.com'); await pg.waitForTimeout(100);
    t('newsletter: completo → botão normal ("Receber novidades", aria-disabled=false)', await btn.getAttribute('aria-disabled') === 'false' && /Receber novidades/.test(await btn.innerText()));
    await btn.click(); await pg.waitForTimeout(500); const r = reqs[0] || {};
    t('newsletter: envio com origem "newsletter", e-mail e consentimento, sem campos de urgência', reqs.length === 1 && r.origem === 'newsletter' && r.email === 'ana@teste.com' && r.lgpd_aceite === 'sim' && r['bot-field'] === '' && r.utm_source === 'google' && !('parcelas_em_dia' in r) && !('busca_apreensao' in r) && !('status' in r), JSON.stringify(r));
    t('newsletter: mensagem de sucesso e formulário limpo', /Pronto!/.test(await pg.innerText('#sb-msg')) && (await pg.inputValue('#sb-email')) === '' && await btn.getAttribute('aria-disabled') === 'true');
    await ctx.close(); }
  { const { ctx, pg, reqs } = await news('erro'); await pg.fill('#sb-email', 'ana@teste.com'); await pg.check('#sb-lgpd'); await pg.click('#sb-news-form button[type=submit]'); await pg.waitForTimeout(500);
    t('newsletter: falha do CRM mostra erro e mantém os dados', /Não conseguimos enviar/.test(await pg.innerText('#sb-msg')) && (await pg.inputValue('#sb-email')) === 'ana@teste.com' && reqs.length === 1);
    await ctx.close(); }

  await b.close(); console.log(`${ok} ok, ${bad} falha(s)`); process.exit(bad ? 1 : 0);
})();
