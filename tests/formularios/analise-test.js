// /analise/ (chat enxuto): fluxo completo no celular (390 px), CRM simulado, Pixel (fila do fbq), Turnstile, limite de 5 s, ?debug=1 e honeypot.
// Servir dist/ em :8123 (URLs sem .html) e rodar: NODE_PATH=$(npm root -g) node tests/formularios/analise-test.js
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const URL_CRM = 'https://lqxwdyjctsmirinvvyow.supabase.co/functions/v1/entrada-site';
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type,x-api-key', 'access-control-allow-methods': 'POST,OPTIONS' };
let ok = 0, bad = 0; const t = (n, c, x = '') => { c ? ok++ : bad++; console.log(c ? 'OK   ' : 'FALHA', n, c ? '' : x); };
const BASE = 'http://localhost:8123/analise/';
const WA = '(81) 99999-9999';

(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  async function abrir({ query = '', crmAtrasoMs = 0, ts = null } = {}) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    if (ts) {
      const corpo = `var o,n=0;window.__ts={render:0,reset:0};function emit(){setTimeout(function(){${ts.erro ? `o['error-callback']('${ts.erro}')` : "o.callback('tok-'+(++n))"}},${ts.atraso || 0});}window.turnstile={render:function(e,x){o=x;window.__ts.render++;emit();return 'w1'},reset:function(){window.__ts.reset++;emit()}};`;
      await ctx.route(/challenges\.cloudflare\.com/, (r) => r.fulfill({ contentType: 'application/javascript', body: corpo }));
    } else await require('./_turnstile')(ctx);
    const pedidos = []; ctx.on('request', (r) => pedidos.push(r.url()));
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
    return { ctx, pg, reqs, waUrls, pedidos };
  }
  // eventos do Pixel: o snippet do <head> guarda as chamadas na fila (fbevents.js é bloqueado nos testes)
  const fb = (pg) => pg.evaluate(() => (window.fbq && window.fbq.queue ? window.fbq.queue.map((a) => [].slice.call(a)) : []));
  const nomes = async (pg) => (await fb(pg)).filter((x) => x[0] === 'trackCustom').map((x) => x[1]);
  const opt = async (pg, texto) => { const a = pg.locator('.chat-opt', { hasText: texto }); await a.waitFor({ timeout: 8000 }); await a.click(); };
  const soft = async (pg, texto) => { const a = pg.locator('.chat-soft', { hasText: texto }); await a.waitFor({ timeout: 8000 }); await a.click(); };
  const digitar = async (pg, valor, enviarComo = null) => { await pg.locator('#ch-campo').waitFor({ timeout: 8000 }); await pg.fill('#ch-campo', valor); await pg.click('.chat-enviar'); };
  async function tresCampos(pg, pv = '40000', n = '48', parcela = '1500') { await digitar(pg, pv); await digitar(pg, n); await digitar(pg, parcela); }
  async function contato(pg, nome = 'Ana Maria Souza', wa = WA) { await digitar(pg, nome); await digitar(pg, wa); }
  const texto = (pg) => pg.locator('#chat-log').innerText();

  // =============== página: enxuta, sem escolha inicial, Pixel no <head> ===============
  let { ctx, pg, reqs, pedidos } = await abrir();
  await pg.waitForSelector('.chat-opt', { timeout: 8000 });
  const html = await (await ctx.request.get(BASE)).text(), cabeca = html.split('</head>')[0];
  t('abertura de uma linha, sem escolha inicial; pergunta do veículo com Carro / Moto / Outro e o link "Prefiro falar com a equipe"',
    /Descubra em 1 minuto se os juros do seu financiamento estão acima do normal\./.test(await texto(pg)) && JSON.stringify(await pg.locator('.chat-opt').allInnerTexts()) === '["Carro","Moto","Outro"]' && (await pg.locator('.chat-soft', { hasText: 'Prefiro falar com a equipe' }).count()) === 1 && !/Como prefere/.test(await texto(pg)));
  t('Pixel inline no <head> (init + PageView) e nenhum Analytics na página', /fbq\('init','1740412147210905'\);fbq\('track','PageView'\)/.test(cabeca) && !/googletagmanager|gtag\(/.test(html) && !pedidos.some((u) => /googletagmanager/.test(u)));
  const propria = pedidos.filter((u) => u.startsWith('http://localhost:8123'));
  t('página enxuta: só chat.css, crm.js, calc-core.js e chat.js (sem style.css, main.js, fonte Inter nem logo escuro)', propria.some((u) => /chat\.css/.test(u)) && propria.some((u) => /crm\.js/.test(u)) && propria.some((u) => /chat\.js/.test(u)) && !propria.some((u) => /style\.css|main\.js|inter-latin|logo-erase-dark|analise\.js/.test(u)), propria.join('\n'));
  const pesoBytes = ['analise/index.html', 'assets/css/chat.css', 'assets/js/crm.js', 'assets/js/calc-core.js', 'assets/js/chat.js', 'assets/img/logo-erase.webp'].reduce((s, f) => s + fs.statSync(path.join(ROOT, 'dist', f)).size, 0);
  t(`peso dos arquivos próprios abaixo de 100 KB sem compressão (${Math.round(pesoBytes / 1024)} KB)`, pesoBytes < 100 * 1024);
  t('h1 "ANÁLISE GRATUITA" (um só), noindex, fora do sitemap, rodapé com CNPJ, e-mail, Termos e Política', (html.match(/<h1[ >]/g) || []).length === 1 && /<h1 class="chat-badge">ANÁLISE GRATUITA<\/h1>/.test(html) && /<meta name="robots" content="noindex">/.test(html) && !/analise/.test(fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8')) && /59\.449\.234\/0001-63/.test(html) && /atendimento@eraseconsulta\.com\.br/.test(html) && /href="\/termos"/.test(html) && /href="\/privacidade"/.test(html));
  t('evento de etapa: RevChatIniciado ao abrir', (await nomes(pg)).includes('RevChatIniciado'));
  t('sem rolagem lateral e sem "seguro prestamista"', !(await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth)) && !/prestamista/i.test(html + fs.readFileSync(path.join(ROOT, 'assets/js/chat.js'), 'utf8')));
  await ctx.close();

  // =============== caminho completo: calculadora → prévia → contato → perguntas opcionais ===============
  ({ ctx, pg, reqs } = await abrir());
  await opt(pg, 'Carro');
  await pg.locator('#ch-campo').waitFor();
  const campo1 = await pg.evaluate(() => { const i = document.getElementById('ch-campo'); return { modo: i.getAttribute('inputmode'), soft: !!document.querySelector('.chat-soft'), dinheiro: !!document.querySelector('.chat-money span'), foco: document.activeElement === i }; });
  t('campo 1 (valor financiado): teclado numérico decimal, prefixo R$, botão discreto "Não sei esse valor"', campo1.modo === 'decimal' && campo1.soft && campo1.dinheiro && /Não sei esse valor/.test(await pg.innerText('.chat-soft')), JSON.stringify(campo1));
  await digitar(pg, '40000');
  t('valor formatado em reais no balão da pessoa', /R\$\s40\.000,00/.test(await pg.locator('.chat-msg.eu').last().innerText()));
  await pg.locator('#ch-campo').waitFor({ timeout: 8000 });
  const campo2 = await pg.evaluate(() => document.getElementById('ch-campo').getAttribute('inputmode'));
  await digitar(pg, '48'); await digitar(pg, '1.500');
  await pg.waitForSelector('.chat-tag', { timeout: 8000 });
  t('campo 2 (nº de parcelas) com teclado numérico inteiro', campo2 === 'numeric');
  const previa = await pg.locator('.chat-msg.bot', { has: pg.locator('.chat-tag') }).last().innerText();
  t('prévia acima do limite: taxa e ≈ ao ano; "parece acima da média do mercado"; só ESTIMATIVA, sem promessa', /A taxa estimada do seu financiamento é de [\d.,]+% ao mês \(≈ [\d.,]+% ao ano\)\./.test(previa) && /Sua taxa estimada parece acima da média do mercado\./.test(previa) && /ESTIMATIVA/.test(previa) && /Não indica valores a receber nem garante resultado/.test(previa) && !/tudo certo|reduz|devolu|vai receber|você tem direito/i.test(previa), previa);
  t('antes do contato: nenhum lead no CRM e nenhum evento de lead', reqs.length === 0 && !(await nomes(pg)).some((n) => /^RevLead/.test(n)));
  await pg.locator('#ch-campo').waitFor();
  t('"Quer receber a análise completa?" e depois nome digitado dentro do chat', /Quer receber a análise completa\?/.test(await texto(pg)) && /primeiro nome/.test(await pg.innerText('#chat-form label')));
  await digitar(pg, 'Ana Maria Souza');
  t('nome: só o primeiro nome vai ao balão', /^Ana$/.test(await pg.locator('.chat-msg.eu').last().innerText()));
  const legal = await pg.innerText('.chat-legal');
  await digitar(pg, WA);
  await pg.waitForSelector('.chat-opt', { timeout: 10000 });
  const C1 = reqs[0].body;
  const CHAVES = ['acao_anterior', 'contrato', 'data_hora', 'data_hora_local', 'lead_id', 'lgpd_aceite', 'nome', 'origem', 'origem_trafego', 'pagina_entrada', 'pagina_envio', 'parcelas', 'qualificado', 'respostas', 'telefone', 'turnstile', 'urgente', 'utm_campaign', 'utm_content', 'utm_medium', 'utm_source', 'utm_term', 'veiculo', 'whatsapp', 'bot-field'].sort();
  t('aviso de privacidade junto do WhatsApp', /Política de Privacidade/.test(legal));
  t('CRM: o lead é salvo ao enviar o WhatsApp — um só envio, mesmas chaves de antes (nenhum campo novo)', reqs.length === 1 && JSON.stringify(Object.keys(C1).sort()) === JSON.stringify(CHAVES), JSON.stringify({ n: reqs.length, extra: Object.keys(C1).filter((k) => !CHAVES.includes(k)), falta: CHAVES.filter((k) => !(k in C1)) }));
  t('CRM: origem do Revisional, só o primeiro nome, urgente "nao", sem contrato/parcelas ainda, token do Turnstile, lead_id', C1.origem === 'formulario-analise-revisional' && C1.nome === 'Ana' && C1.whatsapp === C1.telefone && C1.veiculo === 'Carro' && C1.parcelas === '' && C1.contrato === '' && C1.qualificado === '' && C1.urgente === 'nao' && C1.acao_anterior === '' && C1.lgpd_aceite === 'sim' && C1.turnstile === 'token-teste' && !!C1.lead_id && C1['bot-field'] === '', JSON.stringify(C1));
  t('CRM: o caminho feito e a taxa estimada vão no campo "respostas"', /^Caminho: calculadora completa \| Veículo: Carro \| Financiamento: R\$\s40\.000,00 em 48x de R\$\s1\.500,00 \| Taxa estimada: [\d.,]+% ao mês \(referência [\d.,]+% ao mês\)$/.test(C1.respostas), C1.respostas);
  t('Pixel: eventos por etapa na ordem, e nenhum evento de lead antes de responder o contrato', JSON.stringify((await nomes(pg))) === JSON.stringify(['RevChatIniciado', 'RevChatVeiculo', 'RevChatValorFinanciado', 'RevChatParcelasQtd', 'RevChatValorParcela', 'RevChatViuPrevia', 'RevChatEnviouContato']), JSON.stringify(await nomes(pg)));
  t('depois do contato salvo: duas perguntas opcionais por botão, com "Pular"', /Suas parcelas estão em dia\?/.test(await texto(pg)) && JSON.stringify(await pg.locator('.chat-opt').allInnerTexts()) === '["Em dia","Atrasadas","Com busca e apreensão"]' && (await pg.locator('.chat-soft', { hasText: 'Pular' }).count()) === 1);
  await opt(pg, 'Em dia'); await pg.waitForSelector('.chat-opt', { hasText: 'Sim, em papel' });
  const C2 = reqs[1].body;
  t('resposta das parcelas atualiza o lead: novo envio (lead_id novo), mesmo nome e WhatsApp, parcelas "Em dia", urgente "nao"', reqs.length === 2 && C2.lead_id !== C1.lead_id && C2.nome === 'Ana' && C2.whatsapp === C1.whatsapp && C2.parcelas === 'Em dia' && C2.urgente === 'nao' && /Parcelas: Em dia/.test(C2.respostas) && /^Caminho: calculadora completa/.test(C2.respostas) && C2.turnstile === 'token-teste', JSON.stringify(C2));
  t('contrato "Sim": pergunta com as três opções de sempre', /Você tem o contrato do financiamento em mãos \(papel ou PDF\)\?/.test(await texto(pg)) && JSON.stringify(await pg.locator('.chat-opt').allInnerTexts()) === '["Sim, em papel ou PDF","Não, mas posso pedir ao banco","Não tenho"]');
  await opt(pg, 'Sim, em papel ou PDF'); await pg.waitForSelector('.chat-wa', { timeout: 10000 });
  const C3 = reqs[2].body, ev3 = (await fb(pg)).filter((x) => x[0] === 'trackCustom' && /^RevLead/.test(x[1]));
  t('contrato "sim": novo envio com contrato "sim" e qualificado "sim", mantendo as parcelas', reqs.length === 3 && C3.lead_id !== C2.lead_id && C3.contrato === 'sim' && C3.qualificado === 'sim' && C3.parcelas === 'Em dia' && /Contrato: Sim, em papel ou PDF/.test(C3.respostas), JSON.stringify(C3));
  t('Pixel: RevLeadQualificado (um só evento de lead), com eventID = lead_id do envio do contrato', ev3.length === 1 && ev3[0][1] === 'RevLeadQualificado' && ev3[0][3] && ev3[0][3].eventID === C3.lead_id, JSON.stringify(ev3));
  t('Pixel: eventos das respostas opcionais', (await nomes(pg)).includes('RevChatRespondeuParcelas') && (await nomes(pg)).includes('RevChatRespondeuContrato'));
  const wa = await pg.locator('.chat-wa').getAttribute('href'), tx = decodeURIComponent(wa.split('text=')[1] || '');
  t('botão final "Quero minha ANÁLISE GRATUITA": WhatsApp com nome, taxa, dados e o pedido final; não abre sozinho', (await pg.innerText('.chat-wa')) === 'Quero minha ANÁLISE GRATUITA' && /^https:\/\/wa\.me\/5581991547396/.test(wa) && /Meu nome é Ana\./.test(tx) && /Simulação \(estimativa\): taxa de [\d.,]+% ao mês, acima da média do mercado\./.test(tx) && /Financiamento: R\$\s40\.000,00 em 48x/.test(tx) && tx.endsWith('Quero a análise gratuita do meu contrato.') && !/prestamista/i.test(tx) && /analise/.test(pg.url()), tx);
  await ctx.close();

  // =============== atrasadas = URGENTE; "Não tenho" e "Não, mas posso pedir ao banco"; "Pular" ===============
  for (const [parcelasResp, contratoResp, codigo, eventoLead] of [['Atrasadas', 'Não tenho', 'nao', 'RevLeadNaoQualificado'], ['Com busca e apreensão', 'Não, mas posso pedir ao banco', 'buscando', 'RevLeadBuscandoContrato']]) {
    ({ ctx, pg, reqs } = await abrir());
    await opt(pg, 'Moto'); await tresCampos(pg); await contato(pg); await pg.waitForSelector('.chat-opt');
    await opt(pg, parcelasResp); await pg.waitForSelector('.chat-opt', { hasText: 'Sim, em papel' });
    t(`${parcelasResp}: o chat avisa que o caso é urgente e o envio leva urgente "sim"`, /urgente/.test(await texto(pg)) && reqs[1].body.urgente === 'sim' && reqs[1].body.parcelas === parcelasResp);
    await opt(pg, contratoResp); await pg.waitForSelector('.chat-wa', { timeout: 10000 });
    const evs = (await fb(pg)).filter((x) => x[0] === 'trackCustom' && /^RevLead/.test(x[1])).map((x) => x[1]);
    t(`contrato "${contratoResp}": só ${eventoLead}, nunca RevLeadQualificado; envio com contrato "${codigo}" e urgente "sim"`, JSON.stringify(evs) === JSON.stringify([eventoLead]) && reqs[2].body.contrato === codigo && reqs[2].body.qualificado === codigo && reqs[2].body.urgente === 'sim', JSON.stringify([evs, reqs[2] && reqs[2].body]));
    t('WhatsApp leva URGENTE', /URGENTE/.test(decodeURIComponent((await pg.locator('.chat-wa').getAttribute('href')).split('text=')[1] || '')));
    await ctx.close();
  }
  ({ ctx, pg, reqs } = await abrir());
  await opt(pg, 'Carro'); await tresCampos(pg); await contato(pg); await pg.waitForSelector('.chat-opt');
  await soft(pg, 'Pular'); await pg.waitForSelector('.chat-opt', { hasText: 'Sim, em papel' }); await soft(pg, 'Pular'); await pg.waitForSelector('.chat-wa', { timeout: 10000 });
  t('"Pular" nas duas: o lead fica como foi salvo (um só envio), nenhum evento RevLead* e o botão do WhatsApp aparece', reqs.length === 1 && !(await nomes(pg)).some((n) => /^RevLead/.test(n)) && (await pg.locator('.chat-wa').count()) === 1);
  await ctx.close();

  // =============== atalhos: "Não sei esse valor" (cada campo) e "Prefiro falar com a equipe" ===============
  for (const [passos, campoNome] of [[0, 'valor financiado'], [1, 'nº de parcelas'], [2, 'valor da parcela']]) {
    ({ ctx, pg, reqs } = await abrir());
    await opt(pg, 'Moto');
    if (passos >= 1) await digitar(pg, '40000');
    if (passos >= 2) await digitar(pg, '48');
    await soft(pg, 'Não sei esse valor');
    t(`"Não sei esse valor" (${campoNome}): vai direto para nome e WhatsApp, sem prévia`, (await pg.locator('.chat-tag').count()) === 0 && /primeiro nome/.test(await pg.innerText('#chat-form label')));
    await contato(pg); await pg.waitForSelector('.chat-opt', { timeout: 10000 });
    const Cn = reqs[0].body;
    t(`"Não sei esse valor" (${campoNome}): lead entra sem taxa, com o caminho marcado em "respostas" e o evento de etapa`, reqs.length === 1 && Cn.respostas === `Caminho: não sei o valor (${campoNome}) | Veículo: Moto` && (await nomes(pg)).includes('RevChatNaoSeiValor'), Cn.respostas);
    await ctx.close();
  }
  ({ ctx, pg, reqs } = await abrir());
  await soft(pg, 'Prefiro falar com a equipe');
  t('"Prefiro falar com a equipe": vai direto para nome e WhatsApp e dispara RevChatFalarEquipe', /primeiro nome/.test(await pg.innerText('#chat-form label')) && (await nomes(pg)).includes('RevChatFalarEquipe'));
  await contato(pg, 'Rui'); await pg.waitForSelector('.chat-opt', { timeout: 10000 });
  t('"Prefiro falar com a equipe": lead sem veículo nem taxa, com o caminho em "respostas"', reqs.length === 1 && reqs[0].body.respostas === 'Caminho: falar com a equipe' && reqs[0].body.veiculo === '' && reqs[0].body.nome === 'Rui', JSON.stringify(reqs[0] && reqs[0].body));
  await ctx.close();

  // =============== prévia: "Outro" não compara; limite de 10% sobre a referência; números incoerentes ===============
  ({ ctx, pg } = await abrir());
  await opt(pg, 'Outro'); await tresCampos(pg); await pg.waitForSelector('.chat-tag');
  const pOutro = await pg.locator('.chat-msg.bot', { has: pg.locator('.chat-tag') }).last().innerText();
  t('"Outro": só a taxa e frase neutra (sem comparação), sem "tudo certo"', /A taxa estimada do seu financiamento é de/.test(pOutro) && !/acima da média/.test(pOutro) && /contrato pode ter outras cobranças/.test(pOutro) && !/tudo certo/i.test(pOutro), pOutro);
  await ctx.close();
  const bcbj = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/data/bcb-veiculos.json'), 'utf8')), refB = bcbj.valores[bcbj.ultimo_mes];
  const pmtB = (pv, i, n) => (pv * i) / (1 - Math.pow(1 + i, -n));
  for (const [fator, acima] of [[1.09, false], [1.11, true]]) {
    ({ ctx, pg } = await abrir());
    await opt(pg, 'Carro'); await tresCampos(pg, '40000', '48', pmtB(40000, (refB * fator) / 100, 48).toFixed(2).replace('.', ',')); await pg.waitForSelector('.chat-tag');
    const pb = await pg.locator('.chat-msg.bot', { has: pg.locator('.chat-tag') }).last().innerText();
    t(`limite de 10% (referência ${refB}%): taxa ${Math.round((fator - 1) * 100)}% acima ${acima ? 'diz' : 'não diz'} "parece acima da média" e não cita a referência em número`, acima ? /parece acima da média do mercado/.test(pb) : (!/acima da média/.test(pb) && /contrato pode ter outras cobranças/.test(pb)) && !/referência/.test(pb), pb);
    await ctx.close();
  }
  t('a constante do limite é uma só (calc-core.js) e vale 1,10', /MARGEM_REFERENCIA = 1\.10;/.test(fs.readFileSync(path.join(ROOT, 'assets/js/calc-core.js'), 'utf8')) && !/1\.10/.test(fs.readFileSync(path.join(ROOT, 'assets/js/chat.js'), 'utf8')));
  ({ ctx, pg, reqs } = await abrir());
  await opt(pg, 'Carro'); await tresCampos(pg, '50000', '12', '500'); await pg.waitForSelector('.chat-tag');
  t('números incoerentes: avisa que não deu para estimar e segue para o contato', /Não conseguimos estimar a taxa/.test(await pg.locator('.chat-msg.bot', { has: pg.locator('.chat-tag') }).last().innerText()) && (await nomes(pg)).includes('RevChatViuPrevia'));
  await contato(pg); await pg.waitForSelector('.chat-opt', { timeout: 10000 });
  t('números incoerentes: o lead entra com "não foi possível estimar"', /Caminho: calculadora completa .* Taxa estimada: não foi possível estimar/.test(reqs[0].body.respostas), reqs[0].body.respostas);
  await ctx.close();

  // =============== validações e honeypot ===============
  ({ ctx, pg, reqs } = await abrir());
  await opt(pg, 'Carro');
  await digitar(pg, ''); t('valor financiado vazio: avisa e não avança', /valor financiado/.test(await pg.innerText('.chat-aviso')) && (await pg.locator('.chat-tag').count()) === 0);
  await digitar(pg, '40000'); await digitar(pg, '0'); t('parcelas 0: avisa e não avança', /1 a 120/.test(await pg.innerText('.chat-aviso')));
  await digitar(pg, '121'); t('parcelas 121: avisa e não avança', /1 a 120/.test(await pg.innerText('.chat-aviso')));
  await digitar(pg, '48'); await digitar(pg, ''); t('parcela vazia: avisa e não avança', /valor da parcela/.test(await pg.innerText('.chat-aviso')));
  await digitar(pg, '1500'); await pg.waitForSelector('#ch-campo');
  await digitar(pg, 'M'); t('nome curto: avisa e não avança', /primeiro nome/.test(await pg.innerText('.chat-aviso')));
  await digitar(pg, 'Maria'); await digitar(pg, '123'); t('WhatsApp inválido: avisa e não envia', /WhatsApp válido/.test(await pg.innerText('.chat-aviso')) && reqs.length === 0);
  await pg.evaluate(() => { document.querySelector('#chat-form input[name="bot-field"]').value = 'spam'; });
  await pg.fill('#ch-campo', WA); await pg.click('.chat-enviar'); await pg.waitForTimeout(800);
  t('honeypot preenchido: nada é enviado', reqs.length === 0);
  await ctx.close();

  // =============== CRM lento, Turnstile e debug ===============
  ({ ctx, pg, reqs } = await abrir({ crmAtrasoMs: 9000 }));
  await opt(pg, 'Carro'); await tresCampos(pg); await contato(pg);
  const tLento = Date.now(); await pg.waitForSelector('.chat-opt', { timeout: 9000 });
  t('CRM lento: o chat segue em até ~6 s (limite de 5 s) para as perguntas opcionais', Date.now() - tLento < 6500, String(Date.now() - tLento));
  await ctx.close();
  ({ ctx, pg, reqs } = await abrir({ ts: { atraso: 2500 } }));
  await soft(pg, 'Prefiro falar com a equipe'); await contato(pg); await pg.waitForSelector('.chat-opt', { timeout: 10000 });
  t('Turnstile atrasado: o envio espera pelo código dentro do limite e segue', reqs.length === 1 && /^tok-\d+$/.test(reqs[0].body.turnstile), JSON.stringify(reqs[0] && reqs[0].body.turnstile));
  await ctx.close();
  ({ ctx, pg, reqs } = await abrir({ ts: { erro: '110200' } }));
  await soft(pg, 'Prefiro falar com a equipe'); await contato(pg); await pg.waitForSelector('.chat-opt', { timeout: 10000 });
  t('Turnstile com erro: o envio segue sem token e não trava', reqs.length === 1 && reqs[0].body.turnstile === null);
  await ctx.close();
  ({ ctx, pg } = await abrir({ query: '?debug=1' }));
  await soft(pg, 'Prefiro falar com a equipe'); await contato(pg); await pg.waitForSelector('.chat-debug', { timeout: 10000 });
  t('?debug=1: mostra o resultado de cada envio (CRM e Turnstile)', /debug \(contato\): crm=confirmou; turnstile=ok/.test(await pg.innerText('.chat-debug')));
  await ctx.close();

  console.log(`${ok} ok, ${bad} falha(s)`); await b.close(); process.exit(bad ? 1 : 0);
})();
