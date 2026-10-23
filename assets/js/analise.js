/* /analise/ — chat de filtro para anúncios. 4 perguntas (botões), primeiro nome + WhatsApp, envio ao CRM (origem "formulario-analise-revisional")
 * e abertura do WhatsApp da ERASE com as respostas. Usa main.js: enviarLead, phoneOk, maskPhone, waLink, ultimoErroCRM, $ e $$.
 * Início: "Como prefere fazer sua simulação?" — "Calcular com a equipe" segue as 4 perguntas; "Calcular agora" abre o painel da calculadora (calc-core.js, o mesmo cálculo do site), mostra o resumo em balão, pede nome + WhatsApp e só então mostra a ESTIMATIVA.
 * ?debug=1 mostra o resultado do envio (CRM e Turnstile, com o código de erro da Cloudflare) e não abre o WhatsApp sozinho; sem isso, a pessoa segue para o WhatsApp sem ver erro. */
(function analise() {
  const raiz = $('#chat');
  if (!raiz) return;
  const log = $('#chat-log'), acoes = $('#chat-acoes'), prog = $('#chat-progresso');
  const debug = new URLSearchParams(location.search).get('debug') === '1';
  const reduzir = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ORIGEM = 'formulario-analise-revisional', LIMITE_MS = 5000;
  const R = {}; // respostas em texto
  const LIM = { carro: parseFloat(raiz.dataset.limiteCarro), moto: parseFloat(raiz.dataset.limiteMoto), agricola: parseFloat(raiz.dataset.limiteAgricola) };
  const TIPO = { 'Carro': 'carro', 'Moto': 'moto', 'Caminhão ou máquina agrícola': 'agricola' };
  const NOME_TIPO = { carro: 'carro', moto: 'moto', agricola: 'veículo agrícola' };
  let bcb = null; CalcCore.bcbSerie().then((j) => { bcb = j; }); // série do Banco Central (opcional): sem ela usa o limite fixo

  const PERGUNTAS = [
    { id: 'veiculo', texto: 'Que veículo você financiou?', opcoes: ['Carro', 'Moto', 'Caminhão ou máquina agrícola'] },
    { id: 'parcelas', texto: 'Como estão as parcelas?', opcoes: ['Em dia', 'Atrasadas', 'Com busca e apreensão'] },
    { id: 'contrato', texto: 'Você tem o contrato do financiamento?', opcoes: ['Sim, em papel ou PDF', 'Não, mas posso pedir ao banco', 'Não tenho'],
      dicas: { 'Não, mas posso pedir ao banco': 'O banco é obrigado a fornecer uma cópia do seu contrato quando você pede.', 'Não tenho': 'Sem problema: peça uma cópia ao banco (aplicativo, central de atendimento ou agência) e, se não conseguir, a gente orienta você no WhatsApp.' } },
    { id: 'acao', texto: 'Já entrou com ação revisional antes?', opcoes: ['Sim', 'Não'] },
  ];

  // a área de botões é fixa no rodapé: as mensagens rolam até ficar acima dela
  if (window.ResizeObserver) new ResizeObserver(() => document.documentElement.style.setProperty('--acoes-h', acoes.offsetHeight + 'px')).observe(acoes);
  prepararTurnstile(); // o token do Turnstile já nasce ao abrir a página: na hora do envio ele está pronto (renova sozinho se vencer)
  const esperar = (ms) => new Promise((r) => setTimeout(r, reduzir ? 0 : ms));
  const rolar = () => { const u = log.lastElementChild; if (u) u.scrollIntoView({ block: 'end', behavior: reduzir ? 'auto' : 'smooth' }); };
  const rolarDepois = () => { rolar(); setTimeout(rolar, 80); setTimeout(rolar, 300); }; // a área fixa de botões muda de altura logo depois de aparecer
  function bolha(quem, conteudo, html) {
    const d = document.createElement('div');
    d.className = `chat-msg ${quem}`;
    if (html) d.innerHTML = conteudo; else d.textContent = conteudo;
    log.appendChild(d); rolar(); return d;
  }
  /** Mensagem do robô com "digitando…" curto. `html` só recebe texto fixo daqui (nunca texto digitado pela pessoa). */
  async function bot(html, ms = 550) {
    const t = document.createElement('div'); t.className = 'chat-msg bot chat-digitando'; t.setAttribute('aria-hidden', 'true'); t.innerHTML = '<i></i><i></i><i></i>';
    log.appendChild(t); rolar(); await esperar(ms); t.remove();
    return bolha('bot', html, true);
  }
  const progresso = (n) => { prog.textContent = n ? `Pergunta ${n} de ${PERGUNTAS.length}` : ' '; };

  function opcoes(lista) {
    return new Promise((resolve) => {
      acoes.innerHTML = '';
      const ul = document.createElement('div'); ul.className = 'chat-opcoes'; ul.setAttribute('role', 'group');
      lista.forEach((o) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'chat-opt'; b.textContent = o;
        b.addEventListener('click', () => { acoes.innerHTML = ''; resolve(o); }, { once: true });
        ul.appendChild(b);
      });
      acoes.appendChild(ul);
      const p = ul.firstChild; if (p && !reduzir) p.focus({ preventScroll: true });
      rolarDepois();
    });
  }

  const CODIGO = { 'Sim, em papel ou PDF': 'sim', 'Não, mas posso pedir ao banco': 'buscando', 'Não tenho': 'nao' };
  const EVENTO_PIXEL = { sim: 'RevLeadQualificado', buscando: 'RevLeadBuscandoContrato', nao: 'RevLeadNaoQualificado' };

  async function conversa() {
    await bot('Olá! Aqui é a ERASE. Vou fazer uma <strong>ANÁLISE GRATUITA</strong> do seu financiamento.', 400);
    for (;;) {
      await bot('Como prefere fazer sua simulação?');
      const modo = await opcoes(['Calcular agora', 'Calcular com a equipe no WhatsApp']);
      bolha('eu', modo);
      if (modo !== 'Calcular agora') return equipe();
      if (await calcular()) return; // se a pessoa fechar o painel, volta a perguntar
    }
  }

  async function equipe() {
    await bot('Perfeito! São só 4 perguntas rápidas.', 400);
    for (let i = 0; i < PERGUNTAS.length; i++) {
      const q = PERGUNTAS[i];
      progresso(i + 1);
      await bot(q.texto);
      const r = await opcoes(q.opcoes);
      bolha('eu', r); R[q.id] = r;
      if (q.dicas && q.dicas[r]) await bot(q.dicas[r]);
      if (q.id === 'parcelas' && r !== 'Em dia') await bot('Entendi. Pelo que você contou, o caso é <strong>urgente</strong>: vamos priorizar o seu atendimento.');
    }
    progresso(0);
    await bot('Para finalizar, me diga só o seu <strong>primeiro nome</strong> e o seu <strong>WhatsApp</strong>. Um especialista da ERASE manda a sua <strong>ANÁLISE GRATUITA</strong> por lá.');
    formulario();
  }

  function formulario(modo) {
    acoes.innerHTML = `<form id="chat-form" novalidate>
<input type="text" name="bot-field" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
<label for="ch-nome">Seu primeiro nome</label>
<input id="ch-nome" name="nome" maxlength="40" autocomplete="given-name" placeholder="Ex.: Maria" required>
<label for="ch-wa">Seu WhatsApp (com DDD)</label>
<input id="ch-wa" name="whatsapp" inputmode="tel" maxlength="15" autocomplete="tel" placeholder="(81) 99999-9999" required>
<p class="chat-aviso" id="chat-aviso" role="alert"></p>
<button class="btn btn-primary btn-block chat-enviar" type="submit">${modo === 'calc' ? 'Ver minha estimativa' : 'Receber minha ANÁLISE GRATUITA no WhatsApp'}</button>
<p class="chat-legal">Ao enviar, você concorda com a <a href="/privacidade" target="_blank" rel="noopener">Política de Privacidade</a>: usamos seus dados só para a análise e para falar com você.</p>
</form>`;
    const f = $('#chat-form'), aviso = $('#chat-aviso'), btn = $('.chat-enviar', f);
    maskPhone(f.whatsapp);
    rolarDepois();
    if (!reduzir) f.nome.focus({ preventScroll: true });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (f['bot-field'].value) return; // honeypot preenchido: é robô, descarta sem avisar
      const nome = f.nome.value.trim().split(/\s+/)[0] || '', wa = f.whatsapp.value.trim();
      if (!/^\p{L}{2,}/u.test(nome)) { aviso.textContent = 'Informe o seu primeiro nome (mínimo 2 letras).'; f.nome.focus(); return; }
      if (!phoneOk(wa)) { aviso.textContent = 'Informe um WhatsApp válido, com DDD e 9 dígitos.'; f.whatsapp.focus(); return; }
      aviso.textContent = '';
      btn.disabled = true; btn.textContent = 'Enviando…'; f.inert = true;
      await (modo === 'calc' ? finalizarCalc(nome, wa) : finalizar(nome, wa));
    });
  }

  /** Pixel + CRM, iguais nos dois caminhos: o evento sai na hora do envio (qualificado = contrato em mãos) e o lead entra uma vez só, com lead_id = eventID. */
  async function enviarLeadDoChat(nome, wa, respostas, acao) {
    const contrato = CODIGO[R.contrato] || 'nao', urgente = R.parcelas === 'Em dia' ? 'nao' : 'sim';
    const dados = { nome, whatsapp: wa, telefone: wa, lgpd_aceite: 'sim', veiculo: R.veiculo, parcelas: R.parcelas, contrato, acao_anterior: acao, qualificado: contrato, urgente, respostas };
    const leadId = uuid(); // vai ao CRM como lead_id e ao Pixel como eventID: a API de Conversões do CRM usa o mesmo id e a Meta não conta em dobro
    // O evento sai assim que a pessoa envia (não espera o CRM): qualificado = contrato em mãos ('sim'); cada resposta dispara um só evento, com o nome exato.
    try { if (typeof fbq === 'function') fbq('trackCustom', EVENTO_PIXEL[contrato], { urgente, veiculo: R.veiculo, parcelas: R.parcelas, contrato }, { eventID: leadId }); } catch (e) { /* o Pixel nunca atrapalha */ }
    const ok = await enviarLead(ORIGEM, dados, { limiteMs: LIMITE_MS, leadId }); // sem sucesso ou passou de 5 s: segue mesmo assim
    return { ok, urgente };
  }
  function linhaDebug(ok) {
    const d = document.createElement('p'); d.className = 'chat-debug'; d.textContent = `debug: crm=${ok ? 'confirmou' : 'não confirmou (' + (ultimoErroCRM || 'sem detalhe') + ')'}; turnstile=${tsStatus || 'não usado'}. Nada foi aberto sozinho.`; acoes.appendChild(d);
  }

  async function finalizar(nome, wa) {
    const respostas = `Veículo: ${R.veiculo} | Parcelas: ${R.parcelas} | Contrato: ${R.contrato} | Ação revisional anterior: ${R.acao}`;
    const { ok, urgente } = await enviarLeadDoChat(nome, wa, respostas, R.acao);
    const texto = `Olá! Meu nome é ${nome}. Quero a ANÁLISE GRATUITA do meu financiamento.\n${respostas.replace(/ \| /g, '\n')}${urgente === 'sim' ? '\nURGENTE' : ''}`;
    const link = waLink(texto);
    acoes.innerHTML = '';
    bolha('eu', `${nome} · ${wa}`);
    await bot(`Pronto, ${nome.replace(/[<>&]/g, '')}! Abrindo o WhatsApp da ERASE com as suas respostas para a sua <strong>ANÁLISE GRATUITA</strong>.`, 300);
    const a = document.createElement('a'); a.className = 'btn btn-wa btn-block chat-wa'; a.href = link; a.textContent = 'Abrir o WhatsApp agora';
    acoes.appendChild(a); rolarDepois();
    if (debug) { linhaDebug(ok); return; }
    setTimeout(() => { location.href = link; }, 900);
  }

  // ---- "Calcular agora": painel da calculadora, resumo em balão, nome + WhatsApp e só então a estimativa ----------------------------
  const PARCELAS_OPTS = [12, 18, 24, 30, 36, 42, 48, 54, 60, 66, 72, 84, 96];
  const DICA_CONTRATO = PERGUNTAS[2].dicas;
  const mm = (chave) => { const [a, m] = chave.split('-'); return `${m}/${a}`; };
  const pillsRadio = (nome, lista) => lista.map((o, i) => `<label class="calc-pill"><input type="radio" name="${nome}" value="${o}"${i === 0 ? ' required' : ''}><span>${o}</span></label>`).join('');

  /** Abre o painel por cima do chat. Resolve com os dados validados, ou null se a pessoa fechar. */
  function painel() {
    return new Promise((resolve) => {
      const ant = document.activeElement;
      const ov = document.createElement('div'); ov.className = 'calc-painel'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-labelledby', 'cp-titulo');
      ov.innerHTML = `<form class="calc-folha" id="calc-painel-form" novalidate>
<div class="calc-topo"><span class="calc-badge">ANÁLISE GRATUITA</span><button type="button" class="calc-fechar" aria-label="Fechar a calculadora">×</button></div>
<h2 id="cp-titulo">Simulação do seu financiamento</h2>
<p class="calc-nota">É só uma <strong>estimativa</strong>, feita com os números que você informar.</p>
<fieldset class="calc-grupo" data-campo="tipo"><legend>Que veículo você financiou?</legend><div class="calc-pills">${pillsRadio('cp-tipo', Object.keys(TIPO))}</div><small class="err" data-err="tipo">Escolha uma opção</small></fieldset>
<div class="field" data-campo="pv"><label for="cp-pv">Valor financiado</label><div class="money"><span>R$</span><input id="cp-pv" inputmode="decimal" maxlength="14" autocomplete="off" placeholder="0,00"></div><small class="err" data-err="pv">Informe o valor financiado</small></div>
<div class="field" data-campo="parcela"><label for="cp-parcela">Valor da parcela</label><div class="money"><span>R$</span><input id="cp-parcela" inputmode="decimal" maxlength="14" autocomplete="off" placeholder="0,00"></div><small class="err" data-err="parcela">Informe o valor da parcela</small></div>
<div class="field" data-campo="n"><label for="cp-n">Quantas parcelas financiou?</label><select id="cp-n"><option value="">Selecione</option>${PARCELAS_OPTS.map((n) => `<option value="${n}">${n} parcelas</option>`).join('')}</select><small class="err" data-err="n">Selecione o total de parcelas</small></div>
<div class="field" data-campo="pagas"><label for="cp-pagas">Quantas parcelas já pagou? <span class="opt">(opcional)</span></label><div class="money suffix"><input id="cp-pagas" type="number" inputmode="numeric" min="0" max="999" step="1" placeholder="0"><span>meses</span></div><small class="err" data-err="pagas">Deve ser menor que o total de parcelas</small></div>
<fieldset class="calc-grupo" data-campo="sit"><legend>Como estão as parcelas?</legend><div class="calc-pills">${pillsRadio('cp-sit', PERGUNTAS[1].opcoes)}</div><small class="err" data-err="sit">Escolha uma opção</small></fieldset>
<fieldset class="calc-grupo" data-campo="contrato"><legend>Você tem o contrato do financiamento?</legend><div class="calc-pills">${pillsRadio('cp-contrato', PERGUNTAS[2].opcoes)}</div><small class="hint" id="cp-dica"></small><small class="err" data-err="contrato">Escolha uma opção</small></fieldset>
<p class="calc-aviso" id="cp-aviso" role="alert"></p>
<button type="submit" class="btn btn-primary btn-block">Concluir</button>
</form>`;
      document.body.appendChild(ov); raiz.inert = true; document.body.style.overflow = 'hidden';
      const f = $('#calc-painel-form', ov), $c = (id) => $(id, ov), pv = $c('#cp-pv'), parcela = $c('#cp-parcela');
      CalcCore.maskMoney(pv); CalcCore.maskMoney(parcela);
      const fim = (v) => { document.removeEventListener('keydown', tecla); ov.remove(); raiz.inert = false; document.body.style.overflow = ''; if (ant && ant.focus) ant.focus({ preventScroll: true }); resolve(v); };
      const tecla = (e) => { if (e.key === 'Escape') fim(null); };
      document.addEventListener('keydown', tecla);
      $('.calc-fechar', ov).addEventListener('click', () => fim(null));
      const radio = (nome) => { const el = f.querySelector(`input[name="${nome}"]:checked`); return el ? el.value : ''; };
      f.addEventListener('change', (e) => {
        const g = e.target.closest('[data-campo]'); if (g) g.classList.remove('invalid');
        if (e.target.name === 'cp-contrato') $c('#cp-dica').textContent = DICA_CONTRATO[e.target.value] || '';
      });
      f.addEventListener('input', (e) => { const g = e.target.closest('[data-campo]'); if (g) g.classList.remove('invalid'); });
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const d = { veiculo: radio('cp-tipo'), pv: CalcCore.parseMoney(pv.value), parcela: CalcCore.parseMoney(parcela.value), n: parseInt($c('#cp-n').value, 10), pagas: $c('#cp-pagas').value === '' ? NaN : parseInt($c('#cp-pagas').value, 10), parcelas: radio('cp-sit'), contrato: radio('cp-contrato') };
        const erros = {};
        if (!d.veiculo) erros.tipo = 1;
        if (!(d.pv > 0)) erros.pv = 1;
        if (!(d.parcela > 0)) erros.parcela = 1;
        if (!(d.n > 0)) erros.n = 1;
        if (d.pagas >= 0 && d.n > 0 && d.pagas >= d.n) erros.pagas = 1;
        if (!d.parcelas) erros.sit = 1;
        if (!d.contrato) erros.contrato = 1;
        $$('[data-campo]', f).forEach((g) => g.classList.toggle('invalid', !!erros[g.dataset.campo]));
        const aviso = $c('#cp-aviso');
        if (Object.keys(erros).length) { aviso.textContent = 'Falta preencher os campos destacados.'; const p = $('.invalid', f); if (p) { p.scrollIntoView({ block: 'center' }); const i = $('input, select', p); if (i) i.focus({ preventScroll: true }); } return; }
        if (d.parcela * d.n <= d.pv) { aviso.textContent = 'Com esses números, a parcela vezes o prazo não passa do valor financiado. Confira o valor financiado, a parcela e o prazo.'; $c('#cp-pv').focus(); return; }
        aviso.textContent = '';
        fim(d);
      });
      const primeiro = $('input[name="cp-tipo"]', ov); if (primeiro) primeiro.focus({ preventScroll: true });
    });
  }

  /** Resumo, taxa e referência (mesmo cálculo do site, via calc-core.js). `i` é null se não houver taxa coerente. */
  function estimar(d) {
    const tipo = TIPO[d.veiculo], i = CalcCore.resolverTaxa(d.pv, d.parcela, d.n, false);
    const { ano, mes } = CalcCore.estimarData(d.pagas), ref = CalcCore.referencia(tipo, ano, mes, LIM, bcb);
    const mensal = i === null ? null : i * 100;
    return { tipo, mensal, anual: i === null ? null : (Math.pow(1 + i, 12) - 1) * 100, limite: ref.limite, acima: mensal !== null && mensal > ref.limite, textoRef: ref.historico ? `média do Banco Central em ${mm(ref.chave)}` : `referência para ${NOME_TIPO[tipo]}` };
  }

  async function calcular() {
    await bot('Ótimo! Vou abrir a calculadora. Preencha com os dados do seu financiamento: é só uma <strong>estimativa</strong>.', 400);
    const d = await painel();
    if (!d) { await bot('Sem problema. Quando quiser, é só escolher de novo.', 300); return false; }
    Object.assign(R, { veiculo: d.veiculo, parcelas: d.parcelas, contrato: d.contrato, acao: '', calc: d });
    const financ = `${CalcCore.brl(d.pv)} em ${d.n}x de ${CalcCore.brl(d.parcela)}${d.pagas >= 0 ? ` (${d.pagas} pagas)` : ''}`;
    R.financ = financ;
    bolha('eu', `${d.veiculo} · ${financ} · Parcelas: ${d.parcelas} · Contrato: ${d.contrato}`);
    await bot('Para ver a sua <strong>estimativa</strong>, me diga só o seu <strong>primeiro nome</strong> e o seu <strong>WhatsApp</strong>. Um especialista da ERASE faz a sua <strong>ANÁLISE GRATUITA</strong> do contrato por lá.');
    formulario('calc');
    return true;
  }

  async function finalizarCalc(nome, wa) {
    const d = R.calc, e = estimar(d), pct = CalcCore.pct;
    const taxa = e.mensal === null ? 'não foi possível estimar' : `${pct(e.mensal)}% ao mês (referência ${pct(e.limite)}% ao mês)`;
    // Sem campo novo no CRM: a simulação e o resultado vão como texto no campo "respostas", que já existe.
    const respostas = `Simulação feita na calculadora do chat | Veículo: ${R.veiculo} | Financiamento: ${R.financ} | Parcelas: ${R.parcelas} | Contrato: ${R.contrato} | Taxa estimada: ${taxa}`;
    const { ok, urgente } = await enviarLeadDoChat(nome, wa, respostas, '');
    acoes.innerHTML = '';
    bolha('eu', `${nome} · ${wa}`);
    const alerta = '<p class="chat-alerta"><strong>Atenção:</strong> além dos juros, o seu contrato <strong>pode ter</strong> cobranças abusivas ou indevidas embutidas, e só a análise do contrato consegue identificar isso. Vale conferir.</p>';
    const fim = '<p class="chat-fine">Isto é uma <strong>estimativa</strong>, feita com os números que você informou (sistema Price, sem IOF e tarifas). Não indica valores a receber nem substitui a <strong>ANÁLISE GRATUITA</strong> do contrato.</p>';
    const topo = '<p class="chat-tags"><span class="chat-tag">ANÁLISE GRATUITA</span><span class="chat-tag chat-tag-2">ESTIMATIVA</span></p>';
    const corpo = e.mensal === null
      ? '<p>Não conseguimos estimar a taxa com esses números. Sem problema: a equipe faz o cálculo com você no WhatsApp.</p>'
      : `<p>Pelos números que você informou, a taxa estimada do seu financiamento é de <strong>${pct(e.mensal)}% ao mês</strong> (≈ ${pct(e.anual)}% ao ano).</p><p>${e.acima ? `Ela está <strong>acima</strong> da referência de ${pct(e.limite)}% ao mês (${e.textoRef}). Isso é um indício que vale investigar, não uma conclusão.` : `Ela está dentro da referência de ${pct(e.limite)}% ao mês (${e.textoRef}).`}</p>`;
    await bot(topo + corpo + alerta + fim, 600);
    const resumo = e.mensal === null ? 'Simulação feita no chat (não foi possível estimar a taxa).' : `Simulação (estimativa): taxa de ${pct(e.mensal)}% ao mês, ${e.acima ? 'acima' : 'dentro'} da referência de ${pct(e.limite)}% ao mês.`;
    const texto = `Olá! Meu nome é ${nome}. Quero a ANÁLISE GRATUITA do meu financiamento.\n${resumo}\nVeículo: ${R.veiculo}\nFinanciamento: ${R.financ}\nParcelas: ${R.parcelas}\nContrato: ${R.contrato}${urgente === 'sim' ? '\nURGENTE' : ''}`;
    const a = document.createElement('a'); a.className = 'btn btn-wa btn-block chat-wa'; a.href = waLink(texto); a.textContent = 'Falar com a equipe';
    acoes.appendChild(a); rolarDepois();
    if (debug) linhaDebug(ok);
  }

  conversa();
})();
