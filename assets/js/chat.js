/* /analise/ — chat enxuto para anúncios. Usa crm.js (enviarLead, Turnstile, máscaras, waLink, $) e calc-core.js (o mesmo cálculo da calculadora do site).
 *
 * Fluxo: abertura de uma linha → veículo (Carro/Moto/Outro) → valor financiado → nº de parcelas → valor da parcela (um por vez, com "Não sei esse valor")
 *        → prévia da taxa (só quem preencheu os três) → nome → "parcelas em dia?" → "contrato em mãos?" → WhatsApp (sem botão: "É esse número?" com
 *        "Sim, enviar" / "Corrigir") → um único envio ao CRM com tudo → abre o WhatsApp da ERASE na mesma aba (link de reserva só se o navegador bloquear).
 *        Atalho "Prefiro falar com a equipe" (e "Não sei esse valor") vai para o nome e segue as mesmas perguntas.
 *
 * CRM: um único envio (origem "formulario-analise-revisional") com as respostas, a urgência e o caminho/taxa estimada no campo "respostas" (texto):
 * nenhum campo novo é enviado.
 * Pixel: o snippet está no <head>; eventos por etapa (RevChat*); RevLeadQualificado sai quando o lead é enviado (eventID = lead_id do envio); ao responder o
 * contrato seguem RevLeadBuscandoContrato / RevLeadNaoQualificado, como antes.
 * ?debug=1 mostra o resultado do envio (CRM e Turnstile) e não abre o WhatsApp sozinho. */
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
  acoes.setAttribute('data-clarity-mask', 'true'); // campos, confirmação do número e botões
  if (window.ResizeObserver) new ResizeObserver(() => document.documentElement.style.setProperty('--acoes-h', acoes.offsetHeight + 'px')).observe(acoes);
  const esperar = (ms) => new Promise((r) => setTimeout(r, reduzir ? 0 : ms));
  const rolar = () => { const u = log.lastElementChild; if (u) u.scrollIntoView({ block: 'end', behavior: reduzir ? 'auto' : 'smooth' }); };
  const rolarDepois = () => { rolar(); setTimeout(rolar, 80); setTimeout(rolar, 300); };
  function bolha(quem, conteudo, html, mascarar) {
    const d = document.createElement('div');
    d.className = `chat-msg ${quem}`;
    if (quem === 'eu' || mascarar) d.setAttribute('data-clarity-mask', 'true'); // o que a pessoa digita e os valores do financiamento nunca vão ao Clarity
    if (html) d.innerHTML = conteudo; else d.textContent = conteudo;
    log.appendChild(d); rolar(); return d;
  }
  /** Mensagem do robô com "digitando…" curto. `html` só recebe texto fixo daqui (nunca texto digitado pela pessoa). */
  async function bot(html, ms = 450, mascarar) {
    const t = document.createElement('div'); t.className = 'chat-msg bot chat-digitando'; t.setAttribute('aria-hidden', 'true'); t.innerHTML = '<i></i><i></i><i></i>';
    log.appendChild(t); rolar(); await esperar(ms); t.remove();
    return bolha('bot', html, true, mascarar);
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
  function campo({ rotulo, tipo, placeholder, botao = 'Continuar', validar, naoSei }) {
    return new Promise((resolve) => {
      const entrada = tipo === 'moeda'
        ? `<div class="chat-money"><span>R$</span><input id="ch-campo" inputmode="decimal" maxlength="14" autocomplete="off" placeholder="${placeholder}"></div>`
        : `<input id="ch-campo" ${tipo === 'inteiro' ? 'inputmode="numeric" maxlength="3" autocomplete="off"' : tipo === 'tel' ? 'inputmode="tel" maxlength="15" autocomplete="tel" enterkeyhint="go"' : 'maxlength="40" autocomplete="given-name"'} placeholder="${placeholder}">`;
      acoes.innerHTML = `<form id="chat-form" novalidate>
<input type="text" name="bot-field" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
<label for="ch-campo">${rotulo}</label>
${entrada}
<p class="chat-aviso" role="alert"></p>
<button class="btn btn-primary btn-block chat-enviar" type="submit">${botao}</button>
${naoSei ? `<button type="button" class="chat-soft">${naoSei}</button>` : ''}
</form>`;
      const f = $('#chat-form'), inp = $('#ch-campo'), aviso = $('.chat-aviso', f);
      if (tipo === 'moeda') CalcCore.maskMoney(inp);
      if (tipo === 'tel') maskPhone(inp);
      rolarDepois();
      if (!reduzir) inp.focus({ preventScroll: true });
      let feito = false;
      const tentar = () => { // valida e, se estiver certo, avança (uma vez só)
        if (feito) return;
        if (f['bot-field'].value) return; // honeypot preenchido: é robô, descarta sem avisar
        const r = validar(inp.value.trim());
        if (r.erro) { aviso.textContent = r.erro; return; }
        feito = true; acoes.innerHTML = ''; resolve(r.valor);
      };
      f.addEventListener('submit', (e) => { e.preventDefault(); tentar(); inp.focus(); });
      // Enter / OK do teclado do celular: o formulário tem 2 campos de texto (o isca do honeypot), então o envio implícito não acontece sozinho
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); tentar(); } });
      if (naoSei) $('.chat-soft', f).addEventListener('click', () => { acoes.innerHTML = ''; resolve(SOFT); }, { once: true });
    });
  }

  /** Pergunta o WhatsApp sem botão: quando o número está completo e passa nas checagens, mostra "É esse número?" com "Sim, enviar" e "Corrigir". */
  function perguntarWhatsApp(inicial) {
    return new Promise((resolve) => {
      acoes.innerHTML = `<form id="chat-form" novalidate>
<input type="text" name="bot-field" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
<label for="ch-campo">Seu WhatsApp (com DDD)</label>
<input id="ch-campo" inputmode="tel" maxlength="15" autocomplete="tel" enterkeyhint="go" placeholder="(81) 99999-0000">
<p class="chat-aviso" role="alert"></p>
<p class="chat-legal">Ao enviar, você concorda com a <a href="/privacidade" target="_blank" rel="noopener">Política de Privacidade</a>: usamos seus dados só para a análise e para falar com você.</p>
</form>`;
      const f = $('#chat-form'), inp = $('#ch-campo'), aviso = $('.chat-aviso', f);
      maskPhone(inp);
      if (inicial) inp.value = inicial;
      rolarDepois();
      if (!reduzir) { inp.focus({ preventScroll: true }); inp.setSelectionRange(inp.value.length, inp.value.length); }
      let espera = null;
      const conferir = () => {
        if (f['bot-field'].value) return; // honeypot preenchido: é robô, descarta sem avisar
        const r = checarWhatsApp(inp.value.trim());
        if (r.erro) { aviso.textContent = r.erro; return; }
        clearTimeout(espera);
        const numero = r.valor;
        acoes.innerHTML = `<div class="chat-opcoes" role="group"><p class="chat-conf">É esse número? <strong>${numero}</strong></p><button type="button" class="chat-opt chat-opt-forte" data-r="sim">Sim, enviar</button><button type="button" class="chat-opt" data-r="corrigir">Corrigir</button></div>`;
        rolarDepois();
        const sim = $('[data-r="sim"]', acoes); if (!reduzir) sim.focus({ preventScroll: true });
        sim.addEventListener('click', () => { acoes.innerHTML = ''; evento('RevChatConfirmouNumero'); resolve(numero); }, { once: true });
        $('[data-r="corrigir"]', acoes).addEventListener('click', () => { evento('RevChatCorrigirNumero'); perguntarWhatsApp(numero).then(resolve); }, { once: true });
      };
      f.addEventListener('submit', (e) => { e.preventDefault(); clearTimeout(espera); conferir(); });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(espera); conferir(); } });
      inp.addEventListener('input', () => { // número completo (10 ou 11 dígitos) e parado por um instante: confere (aviso ou confirmação); nunca envia sozinho
        clearTimeout(espera); aviso.textContent = '';
        if (inp.value.replace(/\D/g, '').length >= 10) espera = setTimeout(conferir, reduzir ? 0 : 700);
      });
    });
  }

  /** WhatsApp: DDD + 9 dígitos, DDD que existe, celular começa com 9 e sem sequência óbvia. Devolve {valor} ou {erro} (aviso curto). */
  const GENERICO = 'Confira o número com DDD, ex.: (81) 99999-0000';
  function checarWhatsApp(texto) {
    const d = texto.replace(/\D/g, '');
    if (d.length === 10) return { erro: 'Faltou o 9 na frente do número?' };
    if (d.length !== 11 || !DDDS.has(d.slice(0, 2)) || d[2] !== '9') return { erro: GENERICO };
    const assin = d.slice(2); // 9 dígitos do celular
    const passo = (x) => { const k = +x[1] - +x[0]; return Math.abs(k) === 1 && [...x].every((c, i) => i === 0 || +c - +x[i - 1] === k); };
    if (/^(\d)\1+$/.test(assin) || /^(\d)\1+$/.test(d) || passo(assin.slice(1)) || passo(assin)) return { erro: GENERICO };
    return { valor: texto };
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
    if (v === SOFT) { R.caminho = 'falar com a equipe'; evento('RevChatFalarEquipe'); return seguir('Sem problema! Um especialista faz o cálculo com você. Para começar,'); }
    R.veiculo = v; bolha('eu', v); evento('RevChatVeiculo', { veiculo: v });
    if (TIPO[v]) CalcCore.bcbSerie().then((j) => { bcb = j; });
    return calculadora();
  }

  /** Depois da calculadora (ou dos atalhos): nome → parcelas em dia? → contrato em mãos? → WhatsApp (com confirmação) → envio único e abertura do WhatsApp. */
  async function seguir(abertura) {
    await bot(`${abertura} qual é o seu <strong>primeiro nome</strong>?`, 400);
    const nome = await campo({ rotulo: 'Seu primeiro nome', tipo: 'texto', placeholder: 'Ex.: Maria', validar: (t) => { const n = t.split(/\s+/)[0] || ''; return /^\p{L}{2,}/u.test(n) ? { valor: n } : { erro: 'Informe o seu primeiro nome (mínimo 2 letras).' }; } });
    R.nome = nome; bolha('eu', nome);
    await perguntas();
    await bot('Por último, qual é o seu <strong>WhatsApp</strong> (com DDD)? A equipe da ERASE fala com você por lá.', 350);
    R.wa = await perguntarWhatsApp('');
    bolha('eu', R.wa);
    return enviarEAbrir();
  }

  async function perguntas() {
    await bot(`Prazer, ${limpo(R.nome)}! Suas parcelas estão em dia?`, 350);
    const p = await opcoes(['Em dia', 'Atrasadas', 'Com busca e apreensão']);
    R.parcelas = p; bolha('eu', p); evento('RevChatRespondeuParcelas', { parcelas: p });
    if (p !== 'Em dia') await bot('Entendi. O seu caso é <strong>urgente</strong>: vamos priorizar o seu atendimento.', 350);
    await bot('Você tem o contrato do financiamento em mãos (papel ou PDF)?', 350);
    const c = await opcoes(Object.keys(CODIGO));
    R.contrato = c; bolha('eu', c);
    const codigo = CODIGO[c];
    evento('RevChatRespondeuContrato', { contrato: codigo });
    // os dois eventos de contrato que já existiam; o RevLeadQualificado sai quando o lead é enviado (abaixo)
    if (codigo !== 'sim') evento(EVENTO_LEAD[codigo], { urgente: urgente(), veiculo: R.veiculo, parcelas: R.parcelas, contrato: codigo }, { eventID: uuid() });
    if (DICAS[c]) await bot(DICAS[c], 350);
  }

  const mensagemWa = () => {
    const v = R.veiculo ? `${R.veiculo === 'Outro' ? 'outro veículo' : R.veiculo.toLowerCase()}` : '';
    return `Olá! Sou ${R.nome}, fiz a análise no site.${v ? ` Financiamento de ${v}.` : ''} Quero minha análise GRATUITA.${CODIGO[R.contrato] === 'sim' ? ' Tenho o contrato e posso enviar aqui.' : ''}`;
  };
  /** "Sim, enviar": um único envio ao CRM com tudo; RevLeadQualificado; espera o envio e o evento (até ~1,5 s) e abre o WhatsApp na mesma aba. Sem botão: só se o navegador bloquear, aparece o link de reserva. */
  async function enviarEAbrir() {
    const leadId = uuid();
    evento('RevChatEnviouContato', { caminho: R.caminho });
    // lead enviado = lead qualificado; eventID = lead_id deste envio (a API de Conversões do CRM usa o mesmo id)
    evento('RevLeadQualificado', { caminho: R.caminho, veiculo: R.veiculo, urgente: urgente() }, { eventID: leadId });
    const espera = tsToken ? 1500 : 3500; // com o código do Turnstile pronto o envio sai na hora; sem ele, espera um pouco mais para não perder o lead
    const envio = enviarLead(ORIGEM, dadosDoLead(), { limiteMs: LIMITE_MS, leadId, keepalive: true }).then((ok) => { linhaDebug(ok, 'envio'); return ok; });
    await Promise.race([envio, new Promise((r) => setTimeout(r, espera))]); // o envio segue em segundo plano (keepalive) mesmo se a página sair
    const link = waLink(mensagemWa());
    const reserva = () => { acoes.innerHTML = `<a class="chat-wa-reserva btn btn-wa btn-block" href="${link}">Toque aqui para falar com a equipe no WhatsApp</a>`; rolarDepois(); };
    if (debug) { reserva(); return; } // em ?debug=1 nada abre sozinho
    evento('RevChatAbriuWhatsApp');
    location.href = link;
    setTimeout(() => { if (document.visibilityState === 'visible') reserva(); }, 3000); // WhatsApp não abriu (bloqueio do navegador): link de reserva
  }

  const num = (re, msg, min, max) => (t) => { const v = re(t); return v >= min && v <= max ? { valor: v } : { erro: msg }; };
  async function calculadora() {
    const falta = async (qual) => { R.caminho = 'não sei o valor (' + qual + ')'; bolha('eu', 'Não sei esse valor'); evento('RevChatNaoSeiValor', { campo: qual }); return seguir('Sem problema! Um especialista confere esse número com você. Para continuar,'); };
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
      await bot('<p class="chat-tags"><span class="chat-tag">ESTIMATIVA</span></p><p>Não conseguimos estimar a taxa com esses números, mas a nossa equipe confere o cálculo com você.</p>', 500, true);
    } else {
      await bot(`<p class="chat-tags"><span class="chat-tag">ESTIMATIVA</span></p><p>A taxa estimada do seu financiamento é de <strong>${pct(e.mensal)}% ao mês</strong> (≈ ${pct(e.anual)}% ao ano).</p><p>${e.acima ? 'Sua taxa estimada <strong>parece acima da média do mercado</strong>. A <strong>ANÁLISE</strong> do seu contrato é <strong>GRATUITA</strong>.' : 'Mesmo quando a taxa parece dentro da média, o contrato pode ter cobranças abusivas. A <strong>ANÁLISE</strong> do seu contrato é <strong>GRATUITA</strong>.'}</p>${fim}`, 600, true);
    }
    evento('RevChatViuPrevia', { resultado: !e ? 'sem_estimativa' : e.acima ? 'acima' : 'neutra' });
    return seguir('Quer receber a <strong>análise completa</strong>? É gratuita. Para começar,');
  }

  inicio();
})();
