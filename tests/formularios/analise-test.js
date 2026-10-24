// /analise/ (chat enxuto): fluxo completo no celular (390 px), CRM simulado, Pixel (fila do fbq), Turnstile, WhatsApp com confirmação e abertura automática, ?debug=1 e honeypot.
// Servir dist/ em :8123 (URLs sem .html) e rodar: NODE_PATH=$(npm root -g) node tests/formularios/analise-test.js
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const URL_CRM = 'https://lqxwdyjctsmirinvvyow.supabase.co/functions/v1/entrada-site';
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type,x-api-key', 'access-control-allow-methods': 'POST,OPTIONS' };
let ok = 0, bad = 0; const t = (n, c, x = '') => { c ? ok++ : bad++; console.log(c ? 'OK   ' : 'FALHA', n, c ? '' : x); };
const BASE = 'http://localhost:8123/analise/';
const WA = '(81) 98421-7365';
const GENERICO = 'Confira o número com DDD, ex.: (81) 99999-0000';

(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  // wa: 'ok' = o WhatsApp abre (a navegação acontece); '204' = o navegador "bloqueia" (a página fica, para ler a fila do Pixel e o link de reserva)
  async function abrir({ query = '', crmAtrasoMs = 0, ts = null, wa = 'ok' } = {}) {
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
    await ctx.route(/wa\.me/, (route) => { waUrls.push(route.request().url()); wa === '204' ? route.fulfill({ status: 204 }) : route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>wa</h1>' }); });
    const pg = await ctx.newPage();
    await pg.goto(BASE + query);
    return { ctx, pg, reqs, waUrls, pedidos };
  }
  // eventos do Pixel: o snippet do <head> guarda as chamadas na fila (fbevents.js é bloqueado nos testes)
  const fb = (pg) => pg.evaluate(() => (window.fbq && window.fbq.queue ? window.fbq.queue.map((a) => [].slice.call(a)) : []));
  const nomes = async (pg) => (await fb(pg)).filter((x) => x[0] === 'trackCustom').map((x) => x[1]);
  const opt = async (pg, texto) => { const a = pg.locator('.chat-opt', { hasText: texto }); await a.waitFor({ timeout: 8000 }); await a.click(); };
  const soft = async (pg, texto) => { const a = pg.locator('.chat-soft', { hasText: texto }); await a.waitFor({ timeout: 8000 }); await a.click(); };
  const digitar = async (pg, valor) => { await pg.locator('#ch-campo').waitFor({ timeout: 8000 }); await pg.fill('#ch-campo', valor); await pg.click('.chat-enviar'); };
  async function tresCampos(pg, pv = '40000', n = '48', parcela = '1500') { await digitar(pg, pv); await digitar(pg, n); await digitar(pg, parcela); }
  const texto = (pg) => pg.locator('#chat-log').innerText();
  const previa = (pg) => pg.locator('.chat-msg.bot', { has: pg.locator('.chat-tag') }).last().innerText();
  // depois dos 3 campos (ou do atalho): nome, "parcelas em dia?", contrato; para no campo do WhatsApp
  async function ateWhatsApp(pg, { nome = 'Ana Maria Souza', parcelas = 'Em dia', contrato = 'Sim, em papel ou PDF' } = {}) {
    await digitar(pg, nome); await opt(pg, parcelas); await opt(pg, contrato); await pg.locator('#ch-campo').waitFor({ timeout: 8000 });
  }
  const confirmar = async (pg, numero = WA) => { await pg.fill('#ch-campo', numero); await pg.keyboard.press('Enter'); await pg.locator('[data-r="sim"]').waitFor({ timeout: 4000 }); };
  const sim = (pg) => pg.locator('[data-r="sim"]').click();
  const msgWa = (u) => decodeURIComponent((u.split('text=')[1] || ''));

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
  const fonte = fs.readFileSync(path.join(ROOT, 'assets/js/chat.js'), 'utf8');
  t('sem rolagem lateral; sem "seguro prestamista"; sem o botão "Quero minha ANÁLISE GRATUITA" no código do chat', !(await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth)) && !/prestamista/i.test(html + fonte) && !/Quero minha ANÁLISE GRATUITA/.test(fonte));
  await ctx.close();

  // =============== caminho completo: calculadora → prévia → nome → parcelas → contrato → WhatsApp → confirmação → envio único → WhatsApp abre ===============
  ({ ctx, pg, reqs } = await abrir({ wa: '204' }));
  await opt(pg, 'Carro');
  await pg.locator('#ch-campo').waitFor();
  const campo1 = await pg.evaluate(() => { const i = document.getElementById('ch-campo'); return { modo: i.getAttribute('inputmode'), soft: !!document.querySelector('.chat-soft'), dinheiro: !!document.querySelector('.chat-money span') }; });
  t('campo 1 (valor financiado): teclado numérico decimal, prefixo R$, botão discreto "Não sei esse valor"', campo1.modo === 'decimal' && campo1.soft && campo1.dinheiro && /Não sei esse valor/.test(await pg.innerText('.chat-soft')), JSON.stringify(campo1));
  await digitar(pg, '40000');
  t('valor formatado em reais no balão da pessoa', /R\$\s40\.000,00/.test(await pg.locator('.chat-msg.eu').last().innerText()));
  await pg.locator('#ch-campo').waitFor({ timeout: 8000 });
  t('campo 2 (nº de parcelas) com teclado numérico inteiro', (await pg.evaluate(() => document.getElementById('ch-campo').getAttribute('inputmode'))) === 'numeric');
  await digitar(pg, '48'); await digitar(pg, '1.500');
  await pg.waitForSelector('.chat-tag', { timeout: 8000 });
  const p1 = await previa(pg);
  t('prévia acima do limite: taxa e ≈ ao ano; "parece acima da média do mercado"; ANÁLISE GRATUITA; sem promessa', /A taxa estimada do seu financiamento é de [\d.,]+% ao mês \(≈ [\d.,]+% ao ano\)\./.test(p1) && /Sua taxa estimada parece acima da média do mercado\./.test(p1) && /ANÁLISE do seu contrato é GRATUITA/.test(p1) && /ESTIMATIVA/.test(p1) && /Não indica valores a receber nem garante resultado/.test(p1) && !/tudo certo|reduz|devolu|vai receber|você tem direito|prestamista/i.test(p1), p1);
  await pg.locator('#ch-campo').waitFor();
  t('depois da prévia vem o NOME (não o WhatsApp); nada foi enviado ainda', /primeiro nome/.test(await pg.innerText('#chat-form label')) && reqs.length === 0);
  await digitar(pg, 'Ana Maria Souza');
  await pg.locator('.chat-opt', { hasText: 'Em dia' }).waitFor();
  t('"Suas parcelas estão em dia?" por botão (um toque): Em dia / Atrasadas / Com busca e apreensão — sem "Pular"', /Suas parcelas estão em dia\?/.test(await texto(pg)) && JSON.stringify(await pg.locator('.chat-opt').allInnerTexts()) === '["Em dia","Atrasadas","Com busca e apreensão"]' && (await pg.locator('.chat-soft').count()) === 0);
  await opt(pg, 'Em dia');
  await pg.locator('.chat-opt', { hasText: 'Sim, em papel' }).waitFor();
  t('"Você tem o contrato em mãos?" com as três opções de sempre, antes do WhatsApp', /Você tem o contrato do financiamento em mãos \(papel ou PDF\)\?/.test(await texto(pg)) && JSON.stringify(await pg.locator('.chat-opt').allInnerTexts()) === '["Sim, em papel ou PDF","Não, mas posso pedir ao banco","Não tenho"]' && reqs.length === 0);
  await opt(pg, 'Sim, em papel ou PDF');
  await pg.locator('#ch-campo').waitFor();
  const wa0 = await pg.evaluate(() => ({ botao: document.querySelectorAll('.chat-enviar').length, modo: document.getElementById('ch-campo').getAttribute('inputmode'), enter: document.getElementById('ch-campo').getAttribute('enterkeyhint'), legal: !!document.querySelector('.chat-legal a[href="/privacidade"]'), rotulo: document.querySelector('#chat-form label').textContent }));
  t('WhatsApp por último: campo sem botão, teclado de telefone com "go", aviso de privacidade; nenhum envio e nenhum RevLeadQualificado ainda', wa0.botao === 0 && wa0.modo === 'tel' && wa0.enter === 'go' && wa0.legal && /WhatsApp/.test(wa0.rotulo) && reqs.length === 0 && !(await nomes(pg)).includes('RevLeadQualificado'), JSON.stringify(wa0));
  await pg.fill('#ch-campo', WA); // sem apertar nada: número completo e válido → pergunta de confirmação (nunca envia sozinho)
  await pg.locator('[data-r="sim"]').waitFor({ timeout: 4000 });
  const conf = await pg.evaluate(() => ({ texto: document.querySelector('.chat-conf').textContent, botoes: [...document.querySelectorAll('#chat-acoes .chat-opt')].map((x) => x.textContent), dentro: [...document.querySelectorAll('#chat-acoes .chat-opt')].every((x) => { const r = x.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && r.height >= 44; }) }));
  t('número completo e válido: "É esse número? (81) 98421-7365" com "Sim, enviar" e "Corrigir" (visíveis, ≥ 44 px, sem envio ainda)', conf.texto === 'É esse número? (81) 98421-7365' && JSON.stringify(conf.botoes) === '["Sim, enviar","Corrigir"]' && conf.dentro && reqs.length === 0, JSON.stringify(conf));
  await pg.waitForTimeout(1800);
  t('a confirmação espera a pessoa: sem avanço automático (nenhum envio, nenhuma abertura do WhatsApp)', reqs.length === 0 && (await pg.locator('[data-r="sim"]').count()) === 1);
  await pg.locator('[data-r="corrigir"]').click();
  await pg.locator('#ch-campo').waitFor();
  t('"Corrigir" volta ao campo com o número para editar e dispara RevChatCorrigirNumero', (await pg.inputValue('#ch-campo')) === WA && (await nomes(pg)).includes('RevChatCorrigirNumero'));
  await pg.fill('#ch-campo', '(81) 98421-7366'); await pg.keyboard.press('Enter'); await pg.locator('[data-r="sim"]').waitFor({ timeout: 4000 });
  await sim(pg);
  await pg.locator('.chat-wa-reserva').waitFor({ timeout: 6000 });
  const C1 = reqs[0] && reqs[0].body;
  const CHAVES = ['acao_anterior', 'contrato', 'data_hora', 'data_hora_local', 'lead_id', 'lgpd_aceite', 'nome', 'origem', 'origem_trafego', 'pagina_entrada', 'pagina_envio', 'parcelas', 'qualificado', 'respostas', 'telefone', 'turnstile', 'urgente', 'utm_campaign', 'utm_content', 'utm_medium', 'utm_source', 'utm_term', 'veiculo', 'whatsapp', 'bot-field'].sort();
  t('"Sim, enviar": UM só envio ao CRM, com as mesmas chaves de antes (nenhum campo novo)', reqs.length === 1 && JSON.stringify(Object.keys(C1).sort()) === JSON.stringify(CHAVES), JSON.stringify({ n: reqs.length, extra: C1 && Object.keys(C1).filter((k) => !CHAVES.includes(k)), falta: C1 && CHAVES.filter((k) => !(k in C1)) }));
  t('CRM: tudo no mesmo envio — origem do Revisional, primeiro nome, WhatsApp, veículo, parcelas "Em dia", urgente "nao", contrato "sim" e qualificado "sim", token do Turnstile, lead_id', C1.origem === 'formulario-analise-revisional' && C1.nome === 'Ana' && C1.whatsapp === '(81) 98421-7366' && C1.telefone === C1.whatsapp && C1.veiculo === 'Carro' && C1.parcelas === 'Em dia' && C1.urgente === 'nao' && C1.contrato === 'sim' && C1.qualificado === 'sim' && C1.acao_anterior === '' && C1.lgpd_aceite === 'sim' && C1.turnstile === 'token-teste' && !!C1.lead_id && C1['bot-field'] === '', JSON.stringify(C1));
  t('CRM: caminho, financiamento, taxa estimada, parcelas e contrato no campo "respostas"', /^Caminho: calculadora completa \| Veículo: Carro \| Financiamento: R\$\s40\.000,00 em 48x de R\$\s1\.500,00 \| Taxa estimada: [\d.,]+% ao mês \(referência [\d.,]+% ao mês\) \| Parcelas: Em dia \| Contrato: Sim, em papel ou PDF$/.test(C1.respostas), C1.respostas);
  const evs = await fb(pg), custom = evs.filter((x) => x[0] === 'trackCustom');
  const ordem = custom.map((x) => x[1]);
  t('Pixel: eventos por etapa (os de hoje + confirmou o número, clicou em corrigir e abriu o WhatsApp), na ordem, com RevLeadQualificado no envio', JSON.stringify(ordem) === JSON.stringify(['RevChatIniciado', 'RevChatVeiculo', 'RevChatValorFinanciado', 'RevChatParcelasQtd', 'RevChatValorParcela', 'RevChatViuPrevia', 'RevChatRespondeuParcelas', 'RevChatRespondeuContrato', 'RevChatCorrigirNumero', 'RevChatConfirmouNumero', 'RevChatEnviouContato', 'RevLeadQualificado', 'RevChatAbriuWhatsApp']), JSON.stringify(ordem));
  const q = custom.filter((x) => /^RevLead/.test(x[1]));
  t('Pixel: um só RevLeadQualificado, com eventID = lead_id do envio; contrato "sim" não dispara outro evento de lead', q.length === 1 && q[0][1] === 'RevLeadQualificado' && q[0][3] && q[0][3].eventID === C1.lead_id, JSON.stringify(q));
  const urlWa = pg.url(), waAbriu = await pg.evaluate(() => 1);
  const href = await pg.locator('.chat-wa-reserva').getAttribute('href');
  t('WhatsApp da ERASE (mesmo número de sempre) com a mensagem pronta curta, incluindo "Tenho o contrato e posso enviar aqui."', /^https:\/\/wa\.me\/5581991547396\?text=/.test(href) && msgWa(href) === 'Olá! Sou Ana, fiz a análise no site. Financiamento de carro. Quero minha análise GRATUITA. Tenho o contrato e posso enviar aqui.', msgWa(href));
  t('sem o botão "Quero minha análise gratuita": só o link de reserva "Toque aqui para falar com a equipe no WhatsApp", que aparece porque o navegador não abriu', (await pg.locator('.chat-wa').count()) === 0 && /Toque aqui para falar com a equipe no WhatsApp/.test(await pg.innerText('.chat-wa-reserva')));
  await ctx.close();

  // =============== o WhatsApp abre sozinho, na mesma aba; CRM lento não segura ===============
  ({ ctx, pg, reqs } = await abrir({ crmAtrasoMs: 9000 }));
  await opt(pg, 'Carro'); await tresCampos(pg); await ateWhatsApp(pg, { contrato: 'Não tenho' });
  await confirmar(pg); const tAbre = Date.now(); await sim(pg);
  await pg.waitForURL(/wa\.me/, { timeout: 6000 });
  t('"Sim, enviar": abre o WhatsApp na mesma aba, sem botão, em até ~1,5 s (mesmo com o CRM lento; o envio segue em segundo plano)', Date.now() - tAbre < 2600 && reqs.length === 1, String(Date.now() - tAbre));
  t('mensagem sem a frase do contrato quando a pessoa não tem o contrato', msgWa(pg.url()) === 'Olá! Sou Ana, fiz a análise no site. Financiamento de carro. Quero minha análise GRATUITA.', msgWa(pg.url()));
  await ctx.close();

  // =============== atrasadas / busca e apreensão = URGENTE; eventos de contrato; urgência no mesmo envio ===============
  for (const [parcelasResp, contratoResp, codigo, eventoLead] of [['Atrasadas', 'Não tenho', 'nao', 'RevLeadNaoQualificado'], ['Com busca e apreensão', 'Não, mas posso pedir ao banco', 'buscando', 'RevLeadBuscandoContrato']]) {
    ({ ctx, pg, reqs } = await abrir({ wa: '204' }));
    await opt(pg, 'Moto'); await tresCampos(pg);
    await digitar(pg, 'Ana'); await opt(pg, parcelasResp);
    await pg.waitForFunction(() => /urgente/.test(document.getElementById('chat-log').innerText), null, { timeout: 4000 }).catch(() => {});
    t(`${parcelasResp}: o chat avisa que o caso é urgente`, /urgente/.test(await texto(pg)));
    await opt(pg, contratoResp); await pg.locator('#ch-campo').waitFor(); await confirmar(pg); await sim(pg); await pg.locator('.chat-wa-reserva').waitFor({ timeout: 6000 });
    const evsL = (await nomes(pg)).filter((n) => /^RevLead/.test(n));
    t(`${parcelasResp} + contrato "${contratoResp}": um só envio com urgente "sim", contrato "${codigo}"; eventos ${eventoLead} + RevLeadQualificado`, reqs.length === 1 && reqs[0].body.urgente === 'sim' && reqs[0].body.parcelas === parcelasResp && reqs[0].body.contrato === codigo && reqs[0].body.qualificado === codigo && JSON.stringify(evsL.sort()) === JSON.stringify([eventoLead, 'RevLeadQualificado'].sort()), JSON.stringify([evsL, reqs[0] && reqs[0].body]));
    await ctx.close();
  }

  // =============== atalhos: "Não sei esse valor" (cada campo) e "Prefiro falar com a equipe" ===============
  for (const [passos, campoNome] of [[0, 'valor financiado'], [1, 'nº de parcelas'], [2, 'valor da parcela']]) {
    ({ ctx, pg, reqs } = await abrir({ wa: '204' }));
    await opt(pg, 'Moto');
    if (passos >= 1) await digitar(pg, '40000');
    if (passos >= 2) await digitar(pg, '48');
    await soft(pg, 'Não sei esse valor');
    t(`"Não sei esse valor" (${campoNome}): vai para o nome, sem prévia, e depois segue as mesmas perguntas`, (await pg.locator('.chat-tag').count()) === 0 && /primeiro nome/.test(await pg.innerText('#chat-form label')));
    await ateWhatsApp(pg, { nome: 'Ana', parcelas: 'Atrasadas', contrato: 'Sim, em papel ou PDF' }); await confirmar(pg); await sim(pg); await pg.locator('.chat-wa-reserva').waitFor({ timeout: 6000 });
    const Cn = reqs[0].body;
    t(`"Não sei esse valor" (${campoNome}): envio único sem taxa, com o caminho em "respostas", urgência e contrato`, reqs.length === 1 && Cn.respostas === `Caminho: não sei o valor (${campoNome}) | Veículo: Moto | Parcelas: Atrasadas | Contrato: Sim, em papel ou PDF` && Cn.urgente === 'sim' && Cn.contrato === 'sim' && (await nomes(pg)).includes('RevChatNaoSeiValor'), Cn.respostas);
    await ctx.close();
  }
  ({ ctx, pg, reqs } = await abrir({ wa: '204' }));
  await soft(pg, 'Prefiro falar com a equipe');
  t('"Prefiro falar com a equipe": vai para o nome e dispara RevChatFalarEquipe', /primeiro nome/.test(await pg.innerText('#chat-form label')) && (await nomes(pg)).includes('RevChatFalarEquipe'));
  await ateWhatsApp(pg, { nome: 'Rui', parcelas: 'Em dia', contrato: 'Não tenho' }); await confirmar(pg); await sim(pg); await pg.locator('.chat-wa-reserva').waitFor({ timeout: 6000 });
  t('"Prefiro falar com a equipe": envio único sem veículo nem taxa, caminho em "respostas"; mensagem do WhatsApp sem a frase do financiamento', reqs.length === 1 && reqs[0].body.respostas === 'Caminho: falar com a equipe | Parcelas: Em dia | Contrato: Não tenho' && reqs[0].body.veiculo === '' && msgWa(await pg.locator('.chat-wa-reserva').getAttribute('href')) === 'Olá! Sou Rui, fiz a análise no site. Quero minha análise GRATUITA.', JSON.stringify(reqs[0] && reqs[0].body));
  await ctx.close();

  // =============== prévia: "Outro" não compara; limite de 10% sobre a referência; números incoerentes ===============
  ({ ctx, pg } = await abrir());
  await opt(pg, 'Outro'); await tresCampos(pg); await pg.waitForSelector('.chat-tag');
  const pOutro = await previa(pg);
  t('"Outro": só a taxa e a frase "Mesmo quando a taxa parece dentro da média, o contrato pode ter cobranças abusivas. A ANÁLISE do seu contrato é GRATUITA."', /A taxa estimada do seu financiamento é de/.test(pOutro) && /Mesmo quando a taxa parece dentro da média, o contrato pode ter cobranças abusivas\. A ANÁLISE do seu contrato é GRATUITA\./.test(pOutro) && !/parece acima da média/.test(pOutro), pOutro);
  await ctx.close();
  const bcbj = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/data/bcb-veiculos.json'), 'utf8')), refB = bcbj.valores[bcbj.ultimo_mes];
  const pmtB = (pv, i, n) => (pv * i) / (1 - Math.pow(1 + i, -n));
  for (const [fator, acima] of [[1.09, false], [1.11, true]]) {
    ({ ctx, pg } = await abrir());
    await opt(pg, 'Carro'); await tresCampos(pg, '40000', '48', pmtB(40000, (refB * fator) / 100, 48).toFixed(2).replace('.', ',')); await pg.waitForSelector('.chat-tag');
    const pb = await previa(pg);
    t(`limite de 10% (referência ${refB}%): taxa ${Math.round((fator - 1) * 100)}% acima ${acima ? 'diz "parece acima da média"' : 'usa a frase de cobranças abusivas, sem citar Banco Central nem referência'}`, acima ? /parece acima da média do mercado/.test(pb) : (/Mesmo quando a taxa parece dentro da média, o contrato pode ter cobranças abusivas/.test(pb) && !/Banco Central|referência|acima da média/.test(pb) && !/tudo certo|prestamista/i.test(pb)), pb);
    await ctx.close();
  }
  t('a constante do limite é uma só (calc-core.js) e vale 1,10', /MARGEM_REFERENCIA = 1\.10;/.test(fs.readFileSync(path.join(ROOT, 'assets/js/calc-core.js'), 'utf8')) && !/1\.10/.test(fonte));
  ({ ctx, pg, reqs } = await abrir({ wa: '204' }));
  await opt(pg, 'Carro'); await tresCampos(pg, '50000', '12', '500'); await pg.waitForSelector('.chat-tag');
  t('números incoerentes: avisa que não deu para estimar e segue para o nome', /Não conseguimos estimar a taxa/.test(await previa(pg)) && (await nomes(pg)).includes('RevChatViuPrevia'));
  await ateWhatsApp(pg); await confirmar(pg); await sim(pg); await pg.locator('.chat-wa-reserva').waitFor({ timeout: 6000 });
  t('números incoerentes: o lead entra com "não foi possível estimar"', /Caminho: calculadora completa .* Taxa estimada: não foi possível estimar/.test(reqs[0].body.respostas), reqs[0].body.respostas);
  await ctx.close();

  // =============== WhatsApp: regras do número, confirmação, honeypot ===============
  ({ ctx, pg, reqs } = await abrir());
  await soft(pg, 'Prefiro falar com a equipe'); await ateWhatsApp(pg);
  const INVALIDOS = [
    ['(81) 8421-7365', 'Faltou o 9 na frente do número?'],
    ...['00', '10', '20', '23', '25', '26', '29', '30', '36', '39', '40', '50', '52', '56', '57', '58', '59', '60', '70', '72', '76', '78', '80', '90'].map((d) => [`(${d}) 98421-7365`, GENERICO]),
    ['(81) 88421-7365', GENERICO], ['(81) 99999-9999', GENERICO], ['(11) 11111-1111', GENERICO],
    ['(81) 98765-4321', GENERICO], ['(81) 91234-5678', GENERICO], ['(81) 123456789', GENERICO], ['(81) 9842', GENERICO],
  ];
  const falhas = [];
  for (const [num, msg] of INVALIDOS) {
    await pg.fill('#ch-campo', num); await pg.keyboard.press('Enter');
    const av = await pg.innerText('.chat-aviso'), ainda = (await pg.locator('#ch-campo').count()) === 1 && (await pg.locator('[data-r="sim"]').count()) === 0;
    if (av !== msg || !ainda) falhas.push(`${num} => "${av}" ${ainda ? '' : '(passou!)'}`);
  }
  t(`números barrados (${INVALIDOS.length} casos: 10 dígitos, DDD inexistente, sem 9, sequências): aviso curto embaixo do campo e a confirmação não aparece`, falhas.length === 0 && reqs.length === 0, falhas.join(' | '));
  await pg.fill('#ch-campo', '(81) 8421-7365'); await pg.waitForTimeout(1300);
  t('10 dígitos digitados e parados: depois de um instante aparece "Faltou o 9 na frente do número?" (sem apertar nada)', /Faltou o 9 na frente do número\?/.test(await pg.innerText('.chat-aviso')) && (await pg.locator('[data-r="sim"]').count()) === 0);
  await pg.fill('#ch-campo', '(11) 99999-0000'); await pg.keyboard.press('Enter'); await pg.locator('[data-r="sim"]').waitFor({ timeout: 3000 });
  t('o exemplo do aviso, (11) 99999-0000, passa nas checagens e vai para a confirmação', /É esse número\? \(11\) 99999-0000/.test(await pg.innerText('.chat-conf')) && reqs.length === 0);
  await ctx.close();
  ({ ctx, pg, reqs } = await abrir());
  await soft(pg, 'Prefiro falar com a equipe'); await ateWhatsApp(pg);
  await pg.evaluate(() => { document.querySelector('#chat-form input[name="bot-field"]').value = 'spam'; });
  await pg.fill('#ch-campo', WA); await pg.keyboard.press('Enter'); await pg.waitForTimeout(1500);
  t('honeypot preenchido: não aparece a confirmação e nada é enviado', (await pg.locator('[data-r="sim"]').count()) === 0 && reqs.length === 0);
  await ctx.close();

  // =============== validações dos campos ===============
  ({ ctx, pg, reqs } = await abrir());
  await opt(pg, 'Carro');
  await digitar(pg, ''); t('valor financiado vazio: avisa e não avança', /valor financiado/.test(await pg.innerText('.chat-aviso')) && (await pg.locator('.chat-tag').count()) === 0);
  await digitar(pg, '40000'); await digitar(pg, '0'); t('parcelas 0: avisa e não avança', /1 a 120/.test(await pg.innerText('.chat-aviso')));
  await digitar(pg, '121'); t('parcelas 121: avisa e não avança', /1 a 120/.test(await pg.innerText('.chat-aviso')));
  await digitar(pg, '48'); await digitar(pg, ''); t('parcela vazia: avisa e não avança', /valor da parcela/.test(await pg.innerText('.chat-aviso')));
  await digitar(pg, '1500'); await pg.waitForSelector('#ch-campo');
  await digitar(pg, 'M'); t('nome curto: avisa e não avança', /primeiro nome/.test(await pg.innerText('.chat-aviso')));
  await ctx.close();

  // =============== Turnstile, link de reserva em ?debug=1 ===============
  ({ ctx, pg, reqs } = await abrir({ ts: { erro: '110200' }, wa: '204' }));
  await soft(pg, 'Prefiro falar com a equipe'); await ateWhatsApp(pg); await confirmar(pg); await sim(pg); await pg.locator('.chat-wa-reserva').waitFor({ timeout: 7000 });
  t('Turnstile com erro: o envio segue sem token e o WhatsApp abre mesmo assim', reqs.length === 1 && reqs[0].body.turnstile === null);
  await ctx.close();
  ({ ctx, pg } = await abrir({ query: '?debug=1', wa: '204' }));
  await soft(pg, 'Prefiro falar com a equipe'); await ateWhatsApp(pg); await confirmar(pg); await sim(pg); await pg.waitForSelector('.chat-debug', { timeout: 8000 });
  t('?debug=1: mostra o resultado do envio (CRM e Turnstile), não abre o WhatsApp sozinho e mostra o link de reserva', /debug \(envio\): crm=confirmou; turnstile=ok/.test(await pg.innerText('.chat-debug')) && (await pg.locator('.chat-wa-reserva').count()) === 1 && /analise/.test(pg.url()));
  await ctx.close();

  console.log(`${ok} ok, ${bad} falha(s)`); await b.close(); process.exit(bad ? 1 : 0);
})();
