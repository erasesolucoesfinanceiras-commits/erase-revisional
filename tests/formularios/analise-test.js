// /analise/ (chat de filtro): fluxo completo no celular, payload ao CRM (CRM simulado), WhatsApp, Pixel, limite de 5 s, ?debug=1 e honeypot.
// Servir dist/ em :8123 (URLs sem .html) e rodar: node tests/formularios/analise-test.js
const { chromium } = require('playwright');
const URL_CRM = 'https://lqxwdyjctsmirinvvyow.supabase.co/functions/v1/entrada-site';
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type,x-api-key', 'access-control-allow-methods': 'POST,OPTIONS' };
let ok = 0, bad = 0; const t = (n, c, x = '') => { c ? ok++ : bad++; console.log(c ? 'OK   ' : 'FALHA', n, c ? '' : x); };
const BASE = 'http://localhost:8123/analise/';

(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  async function abrir({ query = '', crmAtrasoMs = 0, consent = 'nao' } = {}) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    await require('./_turnstile')(ctx);
    await ctx.addInitScript((c) => { try { localStorage.setItem('erase-cookies', c); } catch (e) {} window.__fb = []; window.fbq = function () { window.__fb.push([].slice.call(arguments)); }; }, consent);
    await ctx.route(/fonts\.|googletagmanager|connect\.facebook/, (r) => r.abort());
    const reqs = [], waUrls = [];
    await ctx.route(URL_CRM, async (route, req) => {
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      reqs.push({ body: JSON.parse(req.postData()), headers: req.headers() });
      if (crmAtrasoMs) await new Promise((r) => setTimeout(r, crmAtrasoMs));
      route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: '{"ok":true}' }).catch(() => {});
    });
    await ctx.route(/wa\.me/, (route) => { waUrls.push(route.request().url()); route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>wa</h1>' }); });
    const pg = await ctx.newPage();
    await pg.goto(BASE + query);
    return { ctx, pg, reqs, waUrls };
  }
  const responder = async (pg, texto) => { const alvo = pg.locator('.chat-opt', { hasText: texto }); await alvo.waitFor({ timeout: 8000 }); await alvo.click(); };
  async function percorrer(pg, [v, p, c, a]) { await responder(pg, v); await responder(pg, p); await responder(pg, c); await responder(pg, a); await pg.waitForSelector('#chat-form', { timeout: 10000 }); }
  async function enviar(pg, nome, wa) { await pg.fill('#ch-nome', nome); await pg.fill('#ch-wa', wa); await pg.click('.chat-enviar'); }

  // ---- página: destaque, noindex, sem pop-up, sem rolagem lateral
  let { ctx, pg } = await abrir();
  await pg.waitForSelector('.chat-msg.bot:not(.chat-digitando)');
  const badge = await pg.locator('.chat-badge').boundingBox();
  t('"ANÁLISE GRATUITA" em caixa alta, visível no topo (celular)', (await pg.innerText('.chat-badge')) === 'ANÁLISE GRATUITA' && badge && badge.y >= 0 && badge.y < 80 && badge.x + badge.width <= 390);
  t('mensagem inicial do chat traz ANÁLISE GRATUITA em caixa alta', /ANÁLISE GRATUITA/.test(await pg.innerText('.chat-msg.bot:not(.chat-digitando)')));
  t('noindex na página; fora do menu e do sitemap', /<meta name="robots" content="noindex">/.test(await pg.content()) && !/analise/.test(require('fs').readFileSync(require('path').join(__dirname, '../../sitemap.xml'), 'utf8')));
  await pg.waitForTimeout(3300);
  t('pop-up de captação nunca abre aqui', (await pg.locator('.popup').count()) === 0);
  t('sem rolagem horizontal (390 px)', await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await pg.setViewportSize({ width: 360, height: 640 });
  t('sem rolagem horizontal (360 px)', await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await ctx.close();

  // ---- banner de cookies não cobre os botões (primeira visita: sem escolha gravada)
  ({ ctx, pg } = await abrir({ consent: '' }));
  const opt = pg.locator('.chat-opt').first(); await opt.waitFor({ timeout: 8000 });
  const bar = await pg.locator('.cookie-bar').count();
  // sem ID de Google Analytics/Pixel configurado não há banner; se houver, os botões ficam acima dele
  if (bar) { const bx = await pg.locator('.cookie-bar').boundingBox(), ob = await opt.boundingBox(); t('botões do chat acima do banner de cookies', ob.y + ob.height <= bx.y + 1, JSON.stringify({ ob, bx })); } else t('sem banner de cookies sem GA/Pixel configurado (nada a cobrir)', true);
  await ctx.close();

  // ---- cenário A: carro / atrasadas / contrato sim / ação não, com UTM
  ({ ctx, pg, reqs, waUrls } = await abrir({ query: '?utm_source=meta&utm_campaign=revisional-out' }));
  await percorrer(pg, ['Carro', 'Atrasadas', 'Sim, em papel ou PDF', 'Não']);
  t('atrasadas: mensagem de urgência', /urgente/.test(await pg.locator('#chat-log').innerText()));
  await enviar(pg, 'Maria Souza', '(81) 99999-9999');
  await pg.waitForURL(/wa\.me/, { timeout: 6000 });
  const A = reqs[0].body, H = reqs[0].headers;
  t('CRM: origem nova, x-api-key, turnstile, bot-field vazio, LGPD "sim"', A.origem === 'formulario-analise-revisional' && /^erase_site_/.test(H['x-api-key']) && A.turnstile === 'token-teste' && A['bot-field'] === '' && A.lgpd_aceite === 'sim');
  t('CRM: só o primeiro nome; whatsapp e telefone iguais', A.nome === 'Maria' && A.whatsapp === '(81) 99999-9999' && A.telefone === A.whatsapp);
  t('CRM: campos novos (veiculo, parcelas, contrato, acao_anterior, qualificado, urgente, respostas)', A.veiculo === 'Carro' && A.parcelas === 'Atrasadas' && A.contrato === 'sim' && A.acao_anterior === 'Não' && A.qualificado === 'sim' && A.urgente === 'sim' && A.respostas === 'Veículo: Carro | Parcelas: Atrasadas | Contrato: Sim, em papel ou PDF | Ação revisional anterior: Não', JSON.stringify(A));
  t('CRM: lead_id, data/hora e UTMs', /^[0-9a-f-]{20,}$/.test(A.lead_id) && !!A.data_hora && A.utm_source === 'meta' && A.utm_campaign === 'revisional-out' && A.origem_trafego === 'meta' && A.pagina_envio === '/analise/');
  const urlWa = decodeURIComponent(waUrls[0] || '');
  t('WhatsApp da ERASE abre com as respostas na mensagem', /wa\.me\/5581991547396/.test(urlWa) && /Maria/.test(urlWa) && /Carro/.test(urlWa) && /Atrasadas/.test(urlWa) && /Sim, em papel ou PDF/.test(urlWa) && /ANÁLISE GRATUITA/.test(urlWa) && /URGENTE/.test(urlWa), urlWa);
  await ctx.close();

  // ---- cenário B: contrato "pedir ao banco" → buscando + dica; Pixel RevLeadBuscandoContrato
  ({ ctx, pg, reqs, waUrls } = await abrir());
  await percorrer(pg, ['Moto', 'Em dia', 'Não, mas posso pedir ao banco', 'Sim']);
  t('dica: o banco é obrigado a fornecer o contrato', /O banco é obrigado a fornecer uma cópia do seu contrato/.test(await pg.locator('#chat-log').innerText()));
  await enviar(pg, 'João', '(11) 98888-7777'); await pg.waitForURL(/wa\.me/, { timeout: 6000 });
  const B = reqs[0].body, fbB = await pg.evaluate(() => window.__fb).catch(() => null);
  t('contrato "buscando": qualificado buscando, urgente nao', B.contrato === 'buscando' && B.qualificado === 'buscando' && B.urgente === 'nao' && B.veiculo === 'Moto' && B.acao_anterior === 'Sim');
  await ctx.close();
  // o Pixel é lido antes da navegação: refaz lendo o stub no momento do clique
  for (const [resp, evento] of [[['Moto', 'Em dia', 'Não, mas posso pedir ao banco', 'Sim'], 'RevLeadBuscandoContrato'], [['Carro', 'Em dia', 'Sim, em papel ou PDF', 'Não'], 'RevLeadQualificado'], [['Caminhão ou máquina agrícola', 'Com busca e apreensão', 'Não tenho', 'Sim'], 'RevLeadNaoQualificado']]) {
    ({ ctx, pg, reqs } = await abrir({ query: '?debug=1', crmAtrasoMs: 0 }));
    await percorrer(pg, resp); await enviar(pg, 'Ana', '(21) 97777-6666'); await pg.waitForSelector('.chat-wa', { timeout: 8000 });
    const fb = await pg.evaluate(() => window.__fb), C = reqs[0].body;
    t(`Pixel: ${evento}`, fb.some((x) => x[0] === 'trackCustom' && x[1] === evento), JSON.stringify(fb));
    if (evento === 'RevLeadNaoQualificado') t('"Não tenho": dica orienta sem descartar; qualificado nao; urgente sim (busca e apreensão)', /Sem problema/.test(await pg.locator('#chat-log').innerText()) && C.contrato === 'nao' && C.qualificado === 'nao' && C.urgente === 'sim' && C.veiculo === 'Caminhão ou máquina agrícola');
    await ctx.close();
  }

  // ---- 5 s: CRM lento → segue para o WhatsApp; motivo só com ?debug=1
  ({ ctx, pg, reqs, waUrls } = await abrir({ crmAtrasoMs: 9000 }));
  await percorrer(pg, ['Carro', 'Em dia', 'Sim, em papel ou PDF', 'Não']);
  const t0 = Date.now(); await enviar(pg, 'Rui', '(81) 99999-9999'); await pg.waitForURL(/wa\.me/, { timeout: 8000 }); const dt = Date.now() - t0;
  t('CRM lento (9 s): segue para o WhatsApp em até ~6 s', dt < 6500, `${dt} ms`);
  await ctx.close();
  ({ ctx, pg, reqs } = await abrir({ query: '?debug=1', crmAtrasoMs: 9000 }));
  await percorrer(pg, ['Carro', 'Em dia', 'Sim, em papel ou PDF', 'Não']); await enviar(pg, 'Rui', '(81) 99999-9999');
  await pg.waitForSelector('.chat-debug', { timeout: 8000 });
  t('?debug=1 mostra o motivo da falha e não sai sozinho da página', /debug: o CRM não confirmou \((.*tempo_esgotado.*)\)/.test(await pg.innerText('.chat-debug')) && /analise/.test(pg.url()) && (await pg.locator('.chat-wa').count()) === 1);
  await ctx.close();
  ({ ctx, pg } = await abrir({ crmAtrasoMs: 9000 }));
  await percorrer(pg, ['Carro', 'Em dia', 'Sim, em papel ou PDF', 'Não']); await enviar(pg, 'Rui', '(81) 99999-9999'); await pg.waitForURL(/wa\.me/, { timeout: 8000 });
  t('sem ?debug=1 nenhum motivo de falha aparece', true); await ctx.close();

  // ---- validação e honeypot
  ({ ctx, pg, reqs } = await abrir());
  await percorrer(pg, ['Carro', 'Em dia', 'Sim, em papel ou PDF', 'Não']);
  await enviar(pg, 'M', '123'); await pg.waitForTimeout(300);
  t('nome curto ou WhatsApp inválido: avisa e não envia', /primeiro nome/.test(await pg.innerText('#chat-aviso')) && reqs.length === 0);
  await pg.fill('#ch-nome', 'Maria'); await pg.fill('#ch-wa', '123'); await pg.click('.chat-enviar'); await pg.waitForTimeout(300);
  t('WhatsApp inválido: avisa e não envia', /WhatsApp válido/.test(await pg.innerText('#chat-aviso')) && reqs.length === 0);
  await pg.evaluate(() => { document.querySelector('#chat-form input[name="bot-field"]').value = 'spam'; });
  await pg.fill('#ch-wa', '(81) 99999-9999'); await pg.click('.chat-enviar'); await pg.waitForTimeout(800);
  t('honeypot preenchido: nada é enviado e a página não sai', reqs.length === 0 && /analise/.test(pg.url()));
  await ctx.close();

  console.log(`${ok} ok, ${bad} falha(s)`); await b.close(); process.exit(bad ? 1 : 0);
})();
