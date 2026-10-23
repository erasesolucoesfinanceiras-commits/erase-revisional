// /analise/ (chat de filtro): fluxo completo no celular, payload ao CRM (CRM simulado), WhatsApp, Pixel, limite de 5 s, ?debug=1 e honeypot.
// Servir dist/ em :8123 (URLs sem .html) e rodar: node tests/formularios/analise-test.js
const { chromium } = require('playwright');
const URL_CRM = 'https://lqxwdyjctsmirinvvyow.supabase.co/functions/v1/entrada-site';
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type,x-api-key', 'access-control-allow-methods': 'POST,OPTIONS' };
let ok = 0, bad = 0; const t = (n, c, x = '') => { c ? ok++ : bad++; console.log(c ? 'OK   ' : 'FALHA', n, c ? '' : x); };
const BASE = 'http://localhost:8123/analise/';

(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  async function abrir({ query = '', crmAtrasoMs = 0, consent = 'nao', semStub = false, ts = null, validade = 0 } = {}) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    if (ts) { // Turnstile falso configurável: atraso, erro e contagem de gerações (window.__ts)
      const corpo = `var o,n=0;window.__ts={render:0,reset:0};function emit(){setTimeout(function(){${ts.erro ? `o['error-callback']('${ts.erro}')` : "o.callback('tok-'+(++n))"}},${ts.atraso || 0});}window.turnstile={render:function(e,x){o=x;window.__ts.render++;emit();return 'w1'},reset:function(){window.__ts.reset++;emit()}};`;
      await ctx.route(/challenges\.cloudflare\.com/, (r) => r.fulfill({ contentType: 'application/javascript', body: corpo }));
    } else await require('./_turnstile')(ctx);
    if (validade) await ctx.addInitScript((v) => { window.TS_VALIDADE_MS = v; }, validade);
    await ctx.addInitScript(([c, stub]) => { try { if (c) localStorage.setItem('erase-cookies', c); } catch (e) {} if (stub) { window.__fb = []; window.fbq = function () { window.__fb.push([].slice.call(arguments)); }; } }, [consent, !semStub]);
    const trackers = []; ctx.on('request', (r) => { if (/googletagmanager|connect\.facebook\.net/.test(r.url())) trackers.push(r.url()); });
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
    return { ctx, pg, reqs, waUrls, trackers };
  }
  const responder = async (pg, texto) => { const alvo = pg.locator('.chat-opt', { hasText: texto }); await alvo.waitFor({ timeout: 8000 }); await alvo.click(); };
  async function percorrer(pg, [v, p, c, a]) { await responder(pg, 'Calcular com a equipe no WhatsApp'); await responder(pg, v); await responder(pg, p); await responder(pg, c); await responder(pg, a); await pg.waitForSelector('#chat-form', { timeout: 10000 }); }
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

  // ---- cookies: sem banner; Analytics e Pixel carregam ao abrir; rodapé discreto com o aviso; recusa anterior vale
  let tr;
  ({ ctx, pg, trackers: tr } = await abrir({ consent: '', semStub: true }));
  await pg.waitForSelector('.chat-opt', { timeout: 8000 });
  t('sem banner de cookies com botões na /analise/', (await pg.locator('.cookie-bar').count()) === 0);
  t('Google Analytics e Meta Pixel carregam direto, sem esperar aceite', tr.some((u) => /googletagmanager\.com\/gtag\/js\?id=G-/.test(u)) && tr.some((u) => /connect\.facebook\.net.*fbevents\.js/.test(u)) && await pg.evaluate(() => typeof window.fbq === 'function' && window.fbq.queue.some((a) => a[0] === 'init' && a[1] === '1740412147210905') && window.fbq.queue.some((a) => a[0] === 'track' && a[1] === 'PageView')), JSON.stringify(tr));
  const rod = pg.locator('.chat-rodape'), rb = await rod.boundingBox(), fs0 = await rod.evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  t('rodapé pequeno e discreto com o aviso e o link da Política de Privacidade, visível sem cobrir o chat', /Ao continuar, você aceita a Política de Privacidade\./.test(await rod.innerText()) && (await rod.locator('a[href="/privacidade"]').count()) === 1 && fs0 <= 13 && rb.y + rb.height <= 844 && (await pg.evaluate(() => getComputedStyle(document.querySelector('.chat-rodape')).position)) === 'static');
  t('não sobra espaço vazio do Turnstile no chat', await pg.evaluate(() => { const c = document.getElementById('turnstile-caixa'); return !c || c.getBoundingClientRect().height === 0; }));
  await ctx.close();
  ({ ctx, pg, trackers: tr } = await abrir({ consent: 'nao', semStub: true }));
  await pg.waitForSelector('.chat-opt', { timeout: 8000 });
  t('sem escolha de cookies: mesmo com recusa antiga no navegador, Analytics e Pixel carregam', tr.length >= 2 && (await pg.locator('.cookie-bar').count()) === 0);
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
    const custom = fb.filter((x) => x[0] === 'trackCustom');
    t(`Pixel: ${evento} (um só evento, nome exato, eventID = lead_id enviado ao CRM)`, custom.length === 1 && custom[0][1] === evento && custom[0][3] && custom[0][3].eventID === C.lead_id && /^[\w-]{8,}$/.test(C.lead_id), JSON.stringify(fb));
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
  t('?debug=1 mostra o resultado (CRM e Turnstile) e não sai sozinho da página', /debug: crm=não confirmou \(.*tempo_esgotado.*\); turnstile=ok/.test(await pg.innerText('.chat-debug')) && /analise/.test(pg.url()) && (await pg.locator('.chat-wa').count()) === 1);
  await ctx.close();
  ({ ctx, pg } = await abrir({ crmAtrasoMs: 9000 }));
  await percorrer(pg, ['Carro', 'Em dia', 'Sim, em papel ou PDF', 'Não']); await enviar(pg, 'Rui', '(81) 99999-9999'); await pg.waitForURL(/wa\.me/, { timeout: 8000 });
  t('sem ?debug=1 nenhum motivo de falha aparece', true); await ctx.close();

  // ---- Turnstile: token já pronto ao abrir, espera dentro do limite, código de erro no debug, renovação
  ({ ctx, pg, reqs } = await abrir({ ts: { atraso: 300 } }));
  await pg.waitForTimeout(1200);
  const gerados = await pg.evaluate(() => window.__ts.render + window.__ts.reset);
  t('token do Turnstile gerado ao abrir a página (antes de qualquer pergunta)', gerados === 1, String(gerados));
  await percorrer(pg, ['Carro', 'Em dia', 'Sim, em papel ou PDF', 'Não']); await enviar(pg, 'Ana', '(81) 99999-9999'); await pg.waitForURL(/wa\.me/, { timeout: 6000 });
  t('o envio usa o token pronto', reqs[0].body.turnstile === 'tok-1', String(reqs[0].body.turnstile));
  await ctx.close();
  ({ ctx, pg, reqs } = await abrir({ ts: { atraso: 7000 } }));
  await percorrer(pg, ['Carro', 'Em dia', 'Sim, em papel ou PDF', 'Não']);
  const tw = Date.now(); await enviar(pg, 'Ana', '(81) 99999-9999'); await pg.waitForURL(/wa\.me/, { timeout: 8000 });
  t('token ainda não pronto: espera por ele dentro do limite de 5 s e envia com o token', reqs[0].body.turnstile === 'tok-1' && Date.now() - tw < 5500, JSON.stringify({ tk: reqs[0].body.turnstile, ms: Date.now() - tw }));
  await ctx.close();
  ({ ctx, pg, reqs } = await abrir({ query: '?debug=1', ts: { erro: '110200' } }));
  await percorrer(pg, ['Carro', 'Em dia', 'Sim, em papel ou PDF', 'Não']);
  const te = Date.now(); await enviar(pg, 'Ana', '(81) 99999-9999'); await pg.waitForSelector('.chat-debug', { timeout: 8000 });
  t('erro do Turnstile: o código (110200) aparece no debug e o envio não fica esperando à toa', /turnstile=sem token \(110200\)/.test(await pg.innerText('.chat-debug')) && reqs[0].body.turnstile === null && Date.now() - te < 3000, JSON.stringify({ ms: Date.now() - te, tk: reqs[0] && reqs[0].body.turnstile }));
  await ctx.close();
  ({ ctx, pg, reqs } = await abrir({ ts: { atraso: 100 }, validade: 1500 }));
  await pg.waitForTimeout(4600);
  const regerados = await pg.evaluate(() => window.__ts.render + window.__ts.reset);
  await percorrer(pg, ['Carro', 'Em dia', 'Sim, em papel ou PDF', 'Não']); await enviar(pg, 'Ana', '(81) 99999-9999'); await pg.waitForURL(/wa\.me/, { timeout: 6000 });
  t('token vence: renova sozinho e o envio usa o mais novo', regerados >= 3 && /^tok-([2-9]|\d{2,})$/.test(reqs[0].body.turnstile), JSON.stringify({ regerados, tk: reqs[0].body.turnstile }));
  await ctx.close();
  ({ ctx, pg } = await abrir({ query: '?debug=1' }));
  await percorrer(pg, ['Carro', 'Em dia', 'Sim, em papel ou PDF', 'Não']); await enviar(pg, 'Ana', '(81) 99999-9999'); await pg.waitForSelector('.chat-debug', { timeout: 8000 });
  t('debug com sucesso: crm=confirmou; turnstile=ok', /debug: crm=confirmou; turnstile=ok/.test(await pg.innerText('.chat-debug')));
  await ctx.close();

  // ---- Pixel não depende do CRM: com o CRM fora do ar, o evento do lead qualificado sai igual (e só ele)
  ({ ctx, pg } = await abrir({ query: '?debug=1', crmAtrasoMs: 9000 }));
  await percorrer(pg, ['Carro', 'Em dia', 'Sim, em papel ou PDF', 'Não']); await enviar(pg, 'Ana', '(81) 99999-9999');
  await pg.waitForTimeout(800);
  const fbCedo = await pg.evaluate(() => window.__fb.filter((x) => x[0] === 'trackCustom').map((x) => x[1]));
  t('RevLeadQualificado sai na hora do envio, sem esperar o CRM', JSON.stringify(fbCedo) === '["RevLeadQualificado"]', JSON.stringify(fbCedo));
  await ctx.close();
  t('endereço do site contém "revisional" (regra da conversão personalizada)', /revisional/.test(JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '../../data/config.json'), 'utf8')).siteUrl));

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


  // =============== CALCULADORA DENTRO DO CHAT ("Calcular agora") ===============
  const pill = (pg, txt) => pg.locator('.calc-pill', { hasText: txt }).first().click();
  async function painelCompleto(pg, { tipo = 'Carro', pv = '40000', parcela = '1500', n = '48', pagas = '10', sit = 'Em dia', contrato = 'Sim, em papel ou PDF' } = {}) {
    await responder(pg, 'Calcular agora'); await pg.waitForSelector('.calc-painel', { timeout: 8000 });
    await pill(pg, tipo); await pg.fill('#cp-pv', pv); await pg.fill('#cp-parcela', parcela); await pg.selectOption('#cp-n', n); await pg.fill('#cp-pagas', pagas);
    await pill(pg, sit); await pill(pg, contrato); await pg.click('.calc-folha button[type=submit]');
  }
  // primeira pergunta
  ({ ctx, pg } = await abrir());
  await pg.waitForSelector('.chat-opt', { timeout: 8000 });
  t('1ª pergunta: "Como prefere fazer sua simulação?" com os dois botões', /Como prefere fazer sua simulação\?/.test(await pg.locator('#chat-log').innerText()) && JSON.stringify(await pg.locator('.chat-opt').allInnerTexts()) === '["Calcular agora","Calcular com a equipe no WhatsApp"]');
  await ctx.close();
  // painel: abre, valida, fecha
  ({ ctx, pg, reqs } = await abrir());
  await responder(pg, 'Calcular agora'); await pg.waitForSelector('.calc-painel', { timeout: 8000 });
  const pn = await pg.evaluate(() => { const f = document.querySelector('.calc-folha').getBoundingClientRect(); return { dentro: f.left >= 0 && f.right <= innerWidth && f.bottom <= innerHeight + 1, rolaX: document.documentElement.scrollWidth > innerWidth, dialogo: document.querySelector('.calc-painel').getAttribute('role'), inerte: document.getElementById('chat').inert, foco: document.activeElement.name, badge: document.querySelector('.calc-badge').textContent }; });
  t('painel sobre o chat (390 px): cabe na tela, sem rolagem lateral, é diálogo, chat inerte, foco no 1º campo, ANÁLISE GRATUITA em caixa alta', pn.dentro && !pn.rolaX && pn.dialogo === 'dialog' && pn.inerte && pn.foco === 'cp-tipo' && pn.badge === 'ANÁLISE GRATUITA', JSON.stringify(pn));
  await pg.click('.calc-folha button[type=submit]');
  t('painel vazio: avisa, destaca os campos e não fecha', (await pg.locator('.calc-painel .invalid').count()) >= 5 && /Falta preencher/.test(await pg.innerText('#cp-aviso')) && (await pg.locator('.calc-painel').count()) === 1);
  await pill(pg, 'Carro'); await pg.fill('#cp-pv', '50000'); await pg.fill('#cp-parcela', '500'); await pg.selectOption('#cp-n', '12'); await pill(pg, 'Em dia'); await pill(pg, 'Sim, em papel ou PDF'); await pg.click('.calc-folha button[type=submit]');
  t('números incoerentes (parcela × prazo ≤ valor): avisa e não fecha', /parcela vezes o prazo/.test(await pg.innerText('#cp-aviso')) && (await pg.locator('.calc-painel').count()) === 1);
  await pg.keyboard.press('Escape'); await pg.locator('.chat-opt', { hasText: 'Calcular agora' }).waitFor({ timeout: 6000 });
  t('Esc fecha o painel, o chat volta a perguntar e nada foi enviado', (await pg.locator('.calc-painel').count()) === 0 && !(await pg.evaluate(() => document.getElementById('chat').inert)) && (await pg.locator('.chat-opt', { hasText: 'Calcular agora' }).count()) === 1 && reqs.length === 0);
  await ctx.close();

  // caminho "acima": resumo em balão, nome + WhatsApp, só então a estimativa
  let baseChaves;
  ({ ctx, pg, reqs } = await abrir({ crmAtrasoMs: 300 })); // referência: mesmas chaves do caminho da equipe
  await percorrer(pg, ['Carro', 'Em dia', 'Sim, em papel ou PDF', 'Não']); await enviar(pg, 'Ana', '(81) 99999-9999'); await pg.waitForURL(/wa\.me/, { timeout: 6000 });
  baseChaves = Object.keys(reqs[0].body).sort(); await ctx.close();

  ({ ctx, pg, reqs } = await abrir({ crmAtrasoMs: 300 }));
  await painelCompleto(pg); await pg.waitForSelector('#chat-form', { timeout: 10000 });
  const resumo = await pg.locator('.chat-msg.eu').last().innerText();
  t('painel fecha e o chat mostra o balão com o resumo do que foi preenchido', (await pg.locator('.calc-painel').count()) === 0 && /Carro/.test(resumo) && /R\$\s40\.000,00 em 48x de R\$\s1\.500,00 \(10 pagas\)/.test(resumo) && /Em dia/.test(resumo) && /Sim, em papel ou PDF/.test(resumo), resumo);
  t('antes do envio: nenhum lead no CRM, nenhum evento do Pixel e nenhuma estimativa na tela', reqs.length === 0 && (await pg.evaluate(() => window.__fb.filter((x) => x[0] === 'trackCustom').length)) === 0 && (await pg.locator('.chat-tag').count()) === 0 && /Ver minha estimativa/.test(await pg.innerText('.chat-enviar')));
  await enviar(pg, 'Ana Maria Souza', '(81) 99999-9999'); await pg.waitForSelector('.chat-wa', { timeout: 9000 });
  const C2 = reqs[0].body, fb2 = await pg.evaluate(() => window.__fb.filter((x) => x[0] === 'trackCustom'));
  t('CRM: um lead só, mesma origem e mesmos campos do chat atual (nenhum campo novo)', reqs.length === 1 && C2.origem === 'formulario-analise-revisional' && JSON.stringify(Object.keys(C2).sort()) === JSON.stringify(baseChaves), JSON.stringify({ n: reqs.length, extra: Object.keys(C2).filter((k) => !baseChaves.includes(k)), falta: baseChaves.filter((k) => !(k in C2)) }));
  t('CRM: só o primeiro nome, urgente "nao" (em dia), contrato sim, acao_anterior vazio, token do Turnstile, lead_id', C2.nome === 'Ana' && C2.urgente === 'nao' && C2.contrato === 'sim' && C2.qualificado === 'sim' && C2.acao_anterior === '' && C2.turnstile === 'token-teste' && C2.telefone === C2.whatsapp && !!C2.lead_id, JSON.stringify(C2));
  t('CRM: a simulação e o resultado vão como texto no campo "respostas"', /^Simulação feita na calculadora do chat \|/.test(C2.respostas) && /R\$\s40\.000,00 em 48x/.test(C2.respostas) && /Taxa estimada: [\d.,]+% ao mês \(referência [\d.,]+% ao mês\)/.test(C2.respostas), C2.respostas);
  t('Pixel: um só evento, RevLeadQualificado, eventID = lead_id', fb2.length === 1 && fb2[0][1] === 'RevLeadQualificado' && fb2[0][3].eventID === C2.lead_id, JSON.stringify(fb2));
  const res = await pg.locator('.chat-msg.bot').last().innerText(), resHtml = await pg.locator('.chat-msg.bot').last().innerHTML();
  t('resultado: ESTIMATIVA e ANÁLISE GRATUITA em caixa alta, taxa e referência', /ESTIMATIVA/.test(res) && /ANÁLISE GRATUITA/.test(res) && /taxa estimada do seu financiamento é de [\d.,]+% ao mês/.test(res) && /referência de [\d.,]+% ao mês/.test(res) && /acima/.test(res), res);
  t('resultado: alerta sobre cobranças abusivas ou indevidas em tom de possibilidade; nunca "tudo certo" nem valor a recuperar', /pode ter cobranças abusivas ou indevidas embutidas/.test(res) && /Vale conferir/.test(res) && !/tudo certo|nada a recuperar|não há o que recuperar|você tem direito|vai receber/i.test(res), res);
  const wa2 = await pg.locator('.chat-wa').getAttribute('href'), tx2 = decodeURIComponent(wa2.split('text=')[1] || '');
  t('botão "Falar com a equipe": WhatsApp com nome, resumo da estimativa e dados, sem pedir nada de novo', /Falar com a equipe/.test(await pg.innerText('.chat-wa')) && /^https:\/\/wa\.me\/5581991547396/.test(wa2) && /Meu nome é Ana\./.test(tx2) && /Simulação \(estimativa\): taxa de [\d.,]+% ao mês, acima da referência/.test(tx2) && /Financiamento: R\$\s40\.000,00 em 48x/.test(tx2) && !/URGENTE/.test(tx2), tx2);
  await pg.waitForTimeout(1500);
  t('não abre o WhatsApp sozinho: a pessoa lê o resultado e clica', /analise/.test(pg.url()));
  await pg.click('.chat-wa'); await pg.waitForURL(/wa\.me/, { timeout: 6000 });
  t('o clique abre o WhatsApp e o lead continua sendo um só', /wa\.me/.test(pg.url()) && reqs.length === 1);
  await ctx.close();

  // caminho "dentro da referência": o alerta continua e não diz que está tudo certo
  ({ ctx, pg, reqs } = await abrir());
  await painelCompleto(pg, { parcela: '1100' }); await pg.waitForSelector('#chat-form', { timeout: 10000 }); await enviar(pg, 'Rui', '(81) 99999-9999'); await pg.waitForSelector('.chat-wa', { timeout: 9000 });
  const res3 = await pg.locator('.chat-msg.bot').last().innerText();
  t('juros dentro da média: "dentro da referência", mas o alerta de cobranças abusivas ou indevidas continua, sem "tudo certo"', /dentro da referência/.test(res3) && /pode ter cobranças abusivas ou indevidas/.test(res3) && !/tudo certo|nada a recuperar|não há o que recuperar/i.test(res3) && /ESTIMATIVA/.test(res3), res3);
  await ctx.close();

  // atrasadas + contrato "buscando": urgente, evento Buscando (um só)
  ({ ctx, pg, reqs } = await abrir());
  await painelCompleto(pg, { tipo: 'Moto', sit: 'Atrasadas', contrato: 'Não, mas posso pedir ao banco' }); await pg.waitForSelector('#chat-form', { timeout: 10000 }); await enviar(pg, 'Lia', '(81) 98888-7777'); await pg.waitForSelector('.chat-wa', { timeout: 9000 });
  const fb4 = await pg.evaluate(() => window.__fb.filter((x) => x[0] === 'trackCustom').map((x) => x[1])), tx4 = decodeURIComponent((await pg.locator('.chat-wa').getAttribute('href')).split('text=')[1] || '');
  t('atrasadas: urgente "sim"; contrato "buscando" dispara só RevLeadBuscandoContrato; WhatsApp leva URGENTE', reqs[0].body.urgente === 'sim' && reqs[0].body.veiculo === 'Moto' && reqs[0].body.contrato === 'buscando' && JSON.stringify(fb4) === '["RevLeadBuscandoContrato"]' && /URGENTE/.test(tx4), JSON.stringify({ u: reqs[0].body.urgente, fb4 }));
  await ctx.close();
  ({ ctx, pg, reqs } = await abrir());
  await painelCompleto(pg, { tipo: 'Caminhão ou máquina agrícola', sit: 'Com busca e apreensão', contrato: 'Não tenho' }); await pg.waitForSelector('#chat-form', { timeout: 10000 }); await enviar(pg, 'Lia', '(81) 98888-7777'); await pg.waitForSelector('.chat-wa', { timeout: 9000 });
  const fb5 = await pg.evaluate(() => window.__fb.filter((x) => x[0] === 'trackCustom').map((x) => x[1]));
  t('busca e apreensão: urgente "sim"; "Não tenho" dispara só RevLeadNaoQualificado (nunca o qualificado)', reqs[0].body.urgente === 'sim' && reqs[0].body.contrato === 'nao' && JSON.stringify(fb5) === '["RevLeadNaoQualificado"]', JSON.stringify(fb5));
  await ctx.close();

  // CRM lento/fora do ar: estimativa aparece em ~5 s e o evento do Pixel já saiu
  ({ ctx, pg, reqs } = await abrir({ crmAtrasoMs: 9000 }));
  await painelCompleto(pg); await pg.waitForSelector('#chat-form', { timeout: 10000 });
  const tLento = Date.now(); await enviar(pg, 'Ana', '(81) 99999-9999'); await pg.waitForSelector('.chat-wa', { timeout: 9000 });
  t('CRM lento: a estimativa e o botão aparecem em até ~6 s (limite de 5 s), com o Pixel já disparado', Date.now() - tLento < 6500 && (await pg.evaluate(() => window.__fb.filter((x) => x[0] === 'trackCustom').length)) === 1, String(Date.now() - tLento));
  await ctx.close();

  // debug no caminho da calculadora
  ({ ctx, pg } = await abrir({ query: '?debug=1' }));
  await painelCompleto(pg); await pg.waitForSelector('#chat-form', { timeout: 10000 }); await enviar(pg, 'Ana', '(81) 99999-9999'); await pg.waitForSelector('.chat-debug', { timeout: 9000 });
  t('?debug=1 no caminho da calculadora: mostra crm e turnstile', /debug: crm=confirmou; turnstile=ok/.test(await pg.innerText('.chat-debug')));
  await ctx.close();

  // texto proibido
  const fsx = require('fs'), pth = require('path');
  const arqs = ['assets/js/analise.js', 'assets/js/calc-core.js', 'analise/index.html'].map((f) => fsx.readFileSync(pth.join(__dirname, '../..', f), 'utf8'));
  t('a expressão "seguro prestamista" não aparece no chat nem no código da calculadora do chat', arqs.every((x) => !/prestamista/i.test(x)));
  t('/analise/ ainda tem um só h1 e o Pixel/CRM não ganharam evento ou campo novo (eventos: só os 3 de sempre)', (arqs[2].match(/<h1[ >]/g) || []).length === 1 && JSON.stringify([...arqs[0].matchAll(/Rev[A-Za-z]+/g)].map((m) => m[0]).filter((v, i, a) => a.indexOf(v) === i).sort()) === JSON.stringify(['RevLeadBuscandoContrato', 'RevLeadNaoQualificado', 'RevLeadQualificado']));

  console.log(`${ok} ok, ${bad} falha(s)`); await b.close(); process.exit(bad ? 1 : 0);
})();
