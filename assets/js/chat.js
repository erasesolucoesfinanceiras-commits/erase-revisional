/* /analise/ — chat enxuto para anúncios. Usa crm.js (enviarLead, Turnstile, máscaras, waLink, $) e calc-core.js (o mesmo cálculo da calculadora do site).
 *
 * Fluxo: abertura de uma linha → veículo (Carro/Moto/Outro) → valor financiado → nº de parcelas → valor da parcela (um por vez, com "Não sei esse valor")
 *        → prévia da taxa (só quem preencheu os três) → nome e WhatsApp digitados no chat → o lead é salvo no CRM → duas perguntas opcionais
 *        (parcelas em dia? contrato em mãos?) que atualizam o mesmo lead. Atalho "Prefiro falar com a equipe" vai direto para nome e WhatsApp.
 *
 * CRM: o primeiro envio cria o lead (origem "formulario-analise-revisional"). O CRM trata o mesmo lead_id como repetição e ignora; por isso cada
 * atualização das perguntas opcionais é um novo envio (lead_id novo) com o mesmo nome/WhatsApp, que o CRM junta ao lead aberto. O caminho feito e a taxa
 * estimada vão no campo "respostas" (texto) — nenhum campo novo é enviado.
 * Pixel: o snippet está no <head>; eventos por etapa (RevChat*) e os de lead de sempre (RevLeadQualificado / RevLeadBuscandoContrato / RevLeadNaoQualificado,
 * disparados quando a pessoa responde o contrato, com eventID = lead_id do envio dessa resposta).
 * ?debug=1 mostra o resultado de cada envio (CRM e Turnstile). */
(function chat() {
  const raiz = $('#chat');
  if (!raiz) return;
  const log = $('#chat-log'), acoes = $('#chat-acoes');
  const debug = new URLSearchParams(location.search).get('debug') === '1';
  const reduzir = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ORIGEM = 'formulario-analise-revisional', LIMITE_MS = 5000;
  const LIM = { carro: parseFloat(raiz.dataset.limiteCarro), moto: parseFloat(raiz.dataset.limiteMoto) };
  const TIPO = { Carro: 'carro', Moto: 'moto' }; // "Outro": sem referência (a prévia mostra só a taxa)
  const NOME_TIPO = { carro: 'carro', moto: 'moto' };
  const { brl, pct } = CalcCore;
  const SOFT = Symbol('soft');
  const R = { caminho: '', veiculo: '', pv: NaN, n: NaN, parcela: NaN, taxa: null, nome: '', wa: '', parcelas: '', contrato: '' };
  let bcb = null;

  const evento = (nome, p, opcoes) => { try { if (typeof fbq === 'function') fbq('trackCustom', nome, p || {}, opcoes); } catch (e) { /* o Pixel nunca atrapalha */ } };
  const CODIGO = { 'Sim, em papel ou PDF': 'sim', 'Não, mas posso pedir ao banco': 'buscando', 'Não tenho': 'nao' };
  const EVENTO_LEAD = { sim: 'RevLeadQualificado', buscando: 'RevLeadBuscandoContrato', nao: 'RevLeadNaoQualificado' };
  const DICAS = { 'Não, mas posso pedir ao banco': 'O banco é obrigado a fornecer uma cópia do seu contrato quando você pede.', 'Não tenho': 'Sem problema: peça uma cópia ao banco (aplicativo, central de atendimento ou agência) e, se não conseguir, a gente orienta você no WhatsApp.' };

  // a área de botões é fixa no rodapé: as mensagens rolam até ficar acima dela
  if (window.ResizeObserver) new ResizeObserver(() => document.documentElement.style.setProperty('--acoes-h', acoes.offsetHeight + 'px')).observe(acoes);
  const esperar = (ms) => new Promise((r) => setTimeout(r, reduzir ? 0 : ms));
  const rolar = () => { const u = log.lastElementChild; if (u) u.scrollIntoView({ block: 'end', behavior: reduzir ? 'auto' : 'smooth' }); };
  const rolarDepois = () => { rolar(); setTimeout(rolar, 80); setTimeout(rolar, 300); };
  function bolha(quem, conteudo, html) {
    const d = document.createElement('div');
    d.className = `chat-msg ${quem}`;
    if (html) d.innerHTML = conteudo; else d.textContent = conteudo;
    log.appendChild(d); rolar(); return d;
  }
  /** Mensagem do robô com "digitando…" curto. `html` só recebe texto fixo daqui (nunca texto digitado pela pessoa). */
  async function bot(html, ms = 450) {
    const t = document.createElement('div'); t.className = 'chat-msg bot chat-digitando'; t.setAttribute('aria-hidden', 'true'); t.innerHTML = '<i></i><i></i><i></i>';
    log.appendChild(t); rolar(); await esperar(ms); t.remove();
    return bolha('bot', html, true);
  }
  const limpo = (t) => String(t).replace(/[<>&]/g, '');

  /** Botões de resposta; `soft` = link discreto embaixo (devolve SOFT). */
  function opcoes(lista, soft) {
    return new Promise((resolve) => {
      acoes.innerHTML = '';
      const ul = document.createElement('div'); ul.className = 'chat-opcoes'; ul.setAttribute('role', 'group');
      lista.forEach((o) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'chat-opt'; b.textContent = o;
        b.addEventListener('click', () => { acoes.innerHTML = ''; resolve(o); }, { once: true });
        ul.appendChild(b);
      });
      if (soft) {
        const s = document.createElement('button'); s.type = 'button'; s.className = 'chat-soft'; s.textContent = soft;
        s.addEventListener('click', () => { acoes.innerHTML = ''; resolve(SOFT); }, { once: true });
        ul.appendChild(s);
      }
      acoes.appendChild(ul);
      const p = ul.firstChild; if (p && !reduzir) p.focus({ preventScroll: true });
      rolarDepois();
    });
  }

  /** Um campo por vez, no estilo de chat. tipo: 'moeda' | 'inteiro' | 'texto' | 'tel'. `validar(v)` devolve {valor} ou {erro}. `naoSei`: texto do link que pula o campo. */
  function campo({ rotulo, tipo, placeholder, botao = 'Continuar', validar, naoSei, legal }) {
    return new Promise((resolve) => {
      const entrada = tipo === 'moeda'
        ? `<div class="chat-money"><span>R$</span><input id="ch-campo" inputmode="decimal" maxlength="14" autocomplete="off" placeholder="${placeholder}"></div>`
        : `<input id="ch-campo" ${tipo === 'inteiro' ? 'inputmode="numeric" maxlength="3" autocomplete="off"' : tipo === 'tel' ? 'inputmode="tel" maxlength="15" autocomplete="tel"' : 'maxlength="40" autocomplete="given-name"'} placeholder="${placeholder}">`;
      acoes.innerHTML = `<form id="chat-form" novalidate>
<input type="text" name="bot-field" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
<label for="ch-campo">${rotulo}</label>
${entrada}
<p class="chat-aviso" role="alert"></p>
<button class="btn btn-primary btn-block chat-enviar" type="submit">${botao}</button>
${legal ? `<p class="chat-legal">${legal}</p>` : ''}
${naoSei ? `<button type="button" class="chat-soft">${naoSei}</button>` : ''}
</form>`;
      const f = $('#chat-form'), inp = $('#ch-campo'), aviso = $('.chat-aviso', f);
      if (tipo === 'moeda') CalcCore.maskMoney(inp);
      if (tipo === 'tel') maskPhone(inp);
      rolarDepois();
      if (!reduzir) inp.focus({ preventScroll: true });
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        if (f['bot-field'].value) return; // honeypot preenchido: é robô, descarta sem avisar
        const r = validar(inp.value.trim());
        if (r.erro) { aviso.textContent = r.erro; inp.focus(); return; }
        acoes.innerHTML = ''; resolve(r.valor);
      });
      if (naoSei) $('.chat-soft', f).addEventListener('click', () => { acoes.innerHTML = ''; resolve(SOFT); }, { once: true });
    });
  }

  // ---- texto do lead (CRM e WhatsApp) -----------------------------------
  const financ = () => (R.caminho === 'calculadora completa' ? `${brl(R.pv)} em ${R.n}x de ${brl(R.parcela)}` : '');
  const urgente = () => (R.parcelas && R.parcelas !== 'Em dia' ? 'sim' : 'nao');
  function taxaTxt() {
    if (!R.taxa) return R.caminho === 'calculadora completa' ? 'não foi possível estimar' : '';
    return `${pct(R.taxa.mensal)}% ao mês${R.taxa.ref ? ` (referência ${pct(R.taxa.limite)}% ao mês)` : ''}`;
  }
  function respostasTxt() {
    const p = [`Caminho: ${R.caminho}`];
    if (R.veiculo) p.push(`Veículo: ${R.veiculo}`);
    if (financ()) p.push(`Financiamento: ${financ()}`);
    if (taxaTxt()) p.push(`Taxa estimada: ${taxaTxt()}`);
    if (R.parcelas) p.push(`Parcelas: ${R.parcelas}`);
    if (R.contrato) p.push(`Contrato: ${R.contrato}`);
    return p.join(' | ');
  }
  function dadosDoLead() {
    const c = CODIGO[R.contrato] || '';
    return { nome: R.nome, whatsapp: R.wa, telefone: R.wa, lgpd_aceite: 'sim', veiculo: R.veiculo, parcelas: R.parcelas, contrato: c, acao_anterior: '', qualificado: c, urgente: urgente(), respostas: respostasTxt() };
  }
  function linhaDebug(ok, o) {
    if (!debug) return;
    const d = document.createElement('p'); d.className = 'chat-debug';
    d.textContent = `debug (${o}): crm=${ok ? 'confirmou' : 'não confirmou (' + (ultimoErroCRM || 'sem detalhe') + ')'}; turnstile=${tsStatus || 'não usado'}.`;
    log.appendChild(d); rolar();
  }
  /** Um envio ao CRM (limite de 5 s). Cada envio leva um lead_id novo: o CRM ignora lead_id repetido e junta o novo envio ao lead aberto do mesmo WhatsApp. */
  async function enviar(leadId, origemDoEnvio) {
    const ok = await enviarLead(ORIGEM, dadosDoLead(), { limiteMs: LIMITE_MS, leadId });
    linhaDebug(ok, origemDoEnvio);
    return ok;
  }

  // ---- prévia ----------------------------------------------------------------
  function estimar() {
    const tipo = TIPO[R.veiculo] || null;
    const i = CalcCore.resolverTaxa(R.pv, R.parcela, R.n, false);
    if (i === null) return null;
    const mensal = i * 100, anual = (Math.pow(1 + i, 12) - 1) * 100;
    let limite = 0, acima = false;
    if (tipo) {
      const { ano, mes } = { ano: 0, mes: 0 }; // sem "parcelas pagas" nesta versão: a referência é a média mais recente do Banco Central (carro) ou o limite fixo (moto)
      const ref = CalcCore.referencia(tipo, ano, mes, LIM, bcb);
      limite = ref.limite; acima = mensal >= ref.limite * CalcCore.MARGEM_REFERENCIA; // só cita a comparação se a taxa passar 10% da referência
    }
    return { mensal, anual, limite, ref: !!tipo, acima };
  }

  // ---- conversa -----------------------------------------------------------------
  async function inicio() {
    evento('RevChatIniciado');
    await bot('Descubra em 1 minuto se os juros do seu financiamento estão acima do normal.', 300);
    await bot('Que veículo você financiou?', 350);
    const v = await opcoes(['Carro', 'Moto', 'Outro'], 'Prefiro falar com a equipe');
    prepararTurnstile(); // o código do Turnstile nasce na 1ª resposta e se renova sozinho
    if (v === SOFT) { R.caminho = 'falar com a equipe'; evento('RevChatFalarEquipe'); return contato('Sem problema! Um especialista faz o cálculo com você. Para começar,'); }
    R.veiculo = v; bolha('eu', v); evento('RevChatVeiculo', { veiculo: v });
    if (TIPO[v]) CalcCore.bcbSerie().then((j) => { bcb = j; });
    return calculadora();
  }

  const num = (re, msg, min, max) => (t) => { const v = re(t); return v >= min && v <= max ? { valor: v } : { erro: msg }; };
  async function calculadora() {
    const falta = async (qual) => { R.caminho = 'não sei o valor (' + qual + ')'; bolha('eu', 'Não sei esse valor'); evento('RevChatNaoSeiValor', { campo: qual }); return contato('Sem problema! Um especialista confere esse número com você. Para continuar,'); };
    await bot('Qual foi o valor financiado?', 350);
    const pv = await campo({ rotulo: 'Valor financiado', tipo: 'moeda', placeholder: '0,00', naoSei: 'Não sei esse valor', validar: num((t) => CalcCore.parseMoney(t), 'Informe o valor financiado (ex.: 40.000).', 500, 50000000) });
    if (pv === SOFT) return falta('valor financiado');
    R.pv = pv; bolha('eu', brl(pv)); evento('RevChatValorFinanciado');
    await bot('Em quantas parcelas?', 350);
    const n = await campo({ rotulo: 'Número total de parcelas', tipo: 'inteiro', placeholder: 'Ex.: 48', naoSei: 'Não sei esse valor', validar: num((t) => parseInt(t.replace(/\D/g, ''), 10), 'Informe um número de 1 a 120.', 1, 120) });
    if (n === SOFT) return falta('nº de parcelas');
    R.n = n; bolha('eu', `${n} parcelas`); evento('RevChatParcelasQtd');
    await bot('E qual é o valor da parcela?', 350);
    const parcela = await campo({ rotulo: 'Valor da parcela', tipo: 'moeda', placeholder: '0,00', naoSei: 'Não sei esse valor', validar: num((t) => CalcCore.parseMoney(t), 'Informe o valor da parcela (ex.: 1.500).', 1, 5000000) });
    if (parcela === SOFT) return falta('valor da parcela');
    R.parcela = parcela; bolha('eu', brl(parcela)); evento('RevChatValorParcela');
    R.caminho = 'calculadora completa';
    R.taxa = estimar();
    const e = R.taxa;
    const fim = '<p class="chat-fine">Estimativa feita com os números que você informou (sistema Price, sem IOF e tarifas). Não indica valores a receber nem garante resultado.</p>';
    if (!e) {
      await bot('<p class="chat-tags"><span class="chat-tag">ESTIMATIVA</span></p><p>Não conseguimos estimar a taxa com esses números, mas a nossa equipe confere o cálculo com você.</p>', 500);
    } else {
      await bot(`<p class="chat-tags"><span class="chat-tag">ESTIMATIVA</span></p><p>A taxa estimada do seu financiamento é de <strong>${pct(e.mensal)}% ao mês</strong> (≈ ${pct(e.anual)}% ao ano).</p><p>${e.acima ? 'Sua taxa estimada <strong>parece acima da média do mercado</strong>.' : 'Essa é só uma estimativa: o contrato pode ter outras cobranças que só a análise do contrato identifica.'}</p>${fim}`, 600);
    }
    evento('RevChatViuPrevia', { resultado: !e ? 'sem_estimativa' : e.acima ? 'acima' : 'neutra' });
    return contato('Quer receber a <strong>análise completa</strong>? É gratuita. Para começar,');
  }

  async function contato(abertura) {
    await bot(`${abertura} qual é o seu <strong>primeiro nome</strong>?`, 400);
    const nome = await campo({ rotulo: 'Seu primeiro nome', tipo: 'texto', placeholder: 'Ex.: Maria', validar: (t) => { const n = t.split(/\s+/)[0] || ''; return /^\p{L}{2,}/u.test(n) ? { valor: n } : { erro: 'Informe o seu primeiro nome (mínimo 2 letras).' }; } });
    R.nome = nome; bolha('eu', nome);
    await bot(`Prazer, ${limpo(nome)}! Qual é o seu <strong>WhatsApp</strong> (com DDD)?`, 350);
    const wa = await campo({ rotulo: 'Seu WhatsApp', tipo: 'tel', placeholder: '(81) 99999-9999', botao: 'Quero minha ANÁLISE GRATUITA', legal: 'Ao enviar, você concorda com a <a href="/privacidade" target="_blank" rel="noopener">Política de Privacidade</a>: usamos seus dados só para a análise e para falar com você.', validar: (t) => (phoneOk(t) ? { valor: t } : { erro: 'Informe um WhatsApp válido, com DDD e 9 dígitos.' }) });
    R.wa = wa; bolha('eu', wa);
    evento('RevChatEnviouContato', { caminho: R.caminho });
    const ok = await enviar(uuid(), 'contato');
    await bot(`Pronto, ${limpo(nome)}! Recebemos os seus dados e um especialista da ERASE fala com você pelo WhatsApp.`, 350);
    return opcionais(ok);
  }

  async function opcionais() {
    await bot('Para agilizar a sua <strong>ANÁLISE GRATUITA</strong>, responda duas perguntas rápidas (se preferir, pule).', 350);
    await bot('Suas parcelas estão em dia?', 300);
    const p = await opcoes(['Em dia', 'Atrasadas', 'Com busca e apreensão'], 'Pular');
    if (p !== SOFT) {
      R.parcelas = p; bolha('eu', p); evento('RevChatRespondeuParcelas', { parcelas: p });
      if (p !== 'Em dia') await bot('Entendi. O seu caso é <strong>urgente</strong>: vamos priorizar o seu atendimento.', 350);
      await enviar(uuid(), 'parcelas');
    }
    await bot('Você tem o contrato do financiamento em mãos (papel ou PDF)?', 300);
    const c = await opcoes(Object.keys(CODIGO), 'Pular');
    if (c !== SOFT) {
      R.contrato = c; bolha('eu', c);
      const leadId = uuid(), codigo = CODIGO[c];
      evento('RevChatRespondeuContrato', { contrato: codigo });
      // evento de lead de sempre, na hora da resposta ao contrato (qualificado = contrato em mãos); eventID = lead_id do envio dela
      evento(EVENTO_LEAD[codigo], { urgente: urgente(), veiculo: R.veiculo, parcelas: R.parcelas, contrato: codigo }, { eventID: leadId });
      if (DICAS[c]) await bot(DICAS[c], 350);
      await enviar(leadId, 'contrato');
    }
    return final();
  }

  async function final() {
    const linhas = [`Olá! Meu nome é ${R.nome}.`];
    if (R.taxa) linhas.push(`Simulação (estimativa): taxa de ${pct(R.taxa.mensal)}% ao mês${R.taxa.acima ? ', acima da média do mercado' : ''}.`);
    if (R.veiculo) linhas.push(`Veículo: ${R.veiculo}`);
    if (financ()) linhas.push(`Financiamento: ${financ()}`);
    if (R.parcelas) linhas.push(`Parcelas: ${R.parcelas}`);
    if (R.contrato) linhas.push(`Contrato: ${R.contrato}`);
    if (urgente() === 'sim') linhas.push('URGENTE');
    linhas.push('Quero a análise gratuita do meu contrato.');
    await bot('Quando quiser, chame a equipe no WhatsApp:', 350);
    acoes.innerHTML = '';
    const a = document.createElement('a'); a.className = 'btn btn-wa btn-block chat-wa'; a.href = waLink(linhas.join('\n')); a.textContent = 'Quero minha ANÁLISE GRATUITA';
    acoes.appendChild(a); rolarDepois();
  }

  inicio();
})();
