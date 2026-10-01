/* Calculadora de juros — carregada depois de main.js (usa $, $$, postNetlify,
 * enviarParaCRM, maskPhone, phoneOk, waLink e as constantes CRM_* de lá).
 *
 * Matemática: Tabela Price  PMT = PV · i / (1 − (1+i)^−n)
 * Dado PMT, PV e n, a taxa "i" é encontrada por bisseção (a função é crescente em i).
 */
(function () {
  const root = $('#calculadora');
  if (!root) return;

  // Limites de referência (% a.m.) e dado do Banco Central vêm de data/config.json via atributos data-*.
  const LIMITES = {
    carro: parseFloat(root.dataset.limiteCarro),
    moto: parseFloat(root.dataset.limiteMoto),
    agricola: parseFloat(root.dataset.limiteAgricola),
  };
  const NOMES = { carro: 'carro', moto: 'moto', agricola: 'veículo agrícola' };

  // ---- Matemática ----------------------------------------------------
  /** Parcela Price para valor presente pv, taxa i (decimal ao mês) e n parcelas. */
  function pmtPrice(pv, i, n) {
    if (i === 0) return pv / n;
    return (pv * i) / (1 - Math.pow(1 + i, -n));
  }

  /**
   * Resolve a taxa mensal (decimal) por bisseção.
   * Retorna null se não houver taxa positiva que produza essa parcela.
   */
  function resolverTaxa(pv, pmt, n) {
    if (pmt * n <= pv) return null; // soma das parcelas ≤ valor financiado ⇒ taxa ≤ 0
    let lo = 1e-9, hi = 1; // 0,0000001% a 100% ao mês
    if (pmtPrice(pv, hi, n) < pmt) return null; // acima de 100% a.m.: dados incoerentes
    for (let k = 0; k < 200; k++) {
      const mid = (lo + hi) / 2;
      if (pmtPrice(pv, mid, n) < pmt) lo = mid; else hi = mid;
      if (hi - lo < 1e-13) break;
    }
    return (lo + hi) / 2;
  }

  // ---- Formatação / máscara ---------------------------------------
  const brl = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const pct = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function maskMoney(input) {
    input.addEventListener('input', () => {
      const d = input.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
      input.value = d === '' ? '' : (parseInt(d, 10) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    });
  }
  const parseMoney = (s) => (s === '' ? NaN : parseFloat(s.replace(/\./g, '').replace(',', '.')));

  // ---- Elementos -----------------------------------------------------
  const form = $('#calc-form');
  const f = {
    total: $('#valor_total'), entrada: $('#entrada'), parcela: $('#parcela'),
    n: $('#n_parcelas'), pagas: $('#pagas'),
  };
  [f.total, f.entrada, f.parcela].forEach(maskMoney);
  maskPhone($('#lead-wa'));
  const c = { nome: $('#lead-nome'), wa: $('#lead-wa'), email: $('#lead-email'), lgpd: $('#lgpd'), banco: $('#banco') };
  const panel = $('#analise'), panelBody = $('#panel-body'), status = $('#status');
  const actions = $('#result-actions');
  const progressFill = $('#progress-fill'), progressText = $('#progress-text'), progressBar = $('#progress');
  let ultimoEnvio = null; // evita lead duplicado se a pessoa clicar de novo sem mudar nada

  const tipo = () => form.tipo.value;
  const dados = () => ({
    total: parseMoney(f.total.value), entrada: parseMoney(f.entrada.value), parcela: parseMoney(f.parcela.value),
    n: parseInt(f.n.value, 10), pagas: f.pagas.value === '' ? NaN : parseInt(f.pagas.value, 10),
  });
  const contato = () => ({
    nome: c.nome.value.trim().replace(/\s+/g, ' '), whatsapp: c.wa.value.trim(), email: c.email.value.trim(), lgpd: c.lgpd.checked,
  });
  const TOTAL_CAMPOS = 8; // 5 do financiamento + nome + WhatsApp + aceite LGPD
  const preenchidos = (d) => {
    const k = contato();
    return [d.total, d.entrada, d.parcela, d.n, d.pagas].filter((v) => !Number.isNaN(v) && v !== undefined).length
      + (k.nome ? 1 : 0) + (k.whatsapp ? 1 : 0) + (k.lgpd ? 1 : 0);
  };

  /** Valida e devolve {campo: mensagem} — obrigatórios e coerência. */
  function validar(d) {
    const e = {};
    if (!(d.total > 0)) e.valor_total = 'Informe o valor do veículo';
    if (Number.isNaN(d.entrada)) e.entrada = 'Informe a entrada (pode ser 0)';
    else if (d.total > 0 && d.entrada >= d.total) e.entrada = 'A entrada deve ser menor que o valor do veículo';
    if (!(d.parcela > 0)) e.parcela = 'Informe a parcela atual';
    if (!(d.n > 0)) e.n_parcelas = 'Selecione o total de parcelas';
    if (Number.isNaN(d.pagas) || d.pagas < 0) e.pagas = 'Informe quantas parcelas já pagou';
    else if (d.n > 0 && d.pagas >= d.n) e.pagas = 'Parcelas pagas deve ser menor que o total financiado';
    const k = contato();
    const palavras = k.nome.split(' ').filter((w) => w.length >= 2);
    if (palavras.length < 2) e.nome = 'Informe seu nome completo (não abrevie)';
    if (!phoneOk(k.whatsapp)) e.whatsapp = 'WhatsApp inválido — use DDD + 9 dígitos';
    if (k.email && !emailOk(k.email)) e.email = 'E-mail inválido';
    if (!k.lgpd) e.lgpd = 'É necessário autorizar o contato para ver o resultado';
    return e;
  }

  // ---- Painel "Análise em tempo real" ---------------------------------
  function setProgress(qtd) {
    const p = Math.round((qtd / TOTAL_CAMPOS) * 100);
    progressFill.style.width = p + '%';
    progressBar.setAttribute('aria-valuenow', p);
    progressText.textContent = qtd === 0 ? 'Preencha seus dados para iniciar...' : qtd < TOTAL_CAMPOS ? `${qtd} de ${TOTAL_CAMPOS} campos preenchidos` : 'Tudo preenchido — pronto para calcular';
  }

  function painelColetando(d, qtd) {
    const pronto = qtd === TOTAL_CAMPOS && Object.keys(validar(d)).length === 0;
    panel.dataset.state = pronto ? 'pronto' : 'coletando';
    status.textContent = pronto ? 'Pronto' : 'Coletando';
    const financiado = d.total > 0 && d.entrada >= 0 && d.total > d.entrada ? d.total - d.entrada : null;
    const steps = [d.parcela > 0 && d.n > 0, d.total > 0 && d.entrada >= 0 && d.pagas >= 0, pronto];
    panelBody.innerHTML = `
      <h2 class="panel-title">${pronto ? 'Tudo certo! Falta só calcular' : 'Aguardando seu contrato...'}</h2>
      <p>${pronto
        ? `Clique em <strong>Calcular minha taxa</strong>: ao enviar seus dados, mostramos a taxa embutida no seu contrato e a comparação com a média de mercado para <span id="tipo-label">${NOMES[tipo()]}</span>.`
        : `À medida que você preencher o formulário, calculamos a taxa que está sendo cobrada e comparamos com a média de mercado para <span id="tipo-label">${NOMES[tipo()]}</span>.`}</p>
      ${financiado ? `<div class="kv"><div><small>Valor financiado</small><b>${brl(financiado)}</b></div><div><small>Referência (${NOMES[tipo()]})</small><b>${pct(LIMITES[tipo()])}% a.m.</b></div></div>` : ''}
      <ul class="steps-list">
        <li data-step="1" class="${steps[0] ? 'done' : ''}"><i></i>Identificar a taxa real do contrato</li>
        <li data-step="2" class="${steps[1] ? 'done' : ''}"><i></i>Cruzar com a faixa de referência do mercado</li>
        <li data-step="3" class="${steps[2] ? 'done' : ''}"><i></i>Estimar a economia nas parcelas restantes</li>
      </ul>`;
    actions.hidden = true;
  }

  function onChange() {
    const d = dados(), qtd = preenchidos(d);
    setProgress(qtd);
    painelColetando(d, qtd);
  }

  function mostrarErros(erros) {
    $$('.field', form).forEach((fl) => {
      const el = $('[data-err]', fl);
      if (!el) return;
      const msg = erros[el.dataset.err];
      fl.classList.toggle('invalid', !!msg);
      if (msg) el.textContent = msg;
    });
  }

  // ---- Cálculo ---------------------------------------------------------
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const d = dados(), erros = validar(d);
    mostrarErros(erros);
    if (Object.keys(erros).length) {
      const primeiro = $('.field.invalid input, .field.invalid select', form);
      if (primeiro) primeiro.focus();
      return;
    }
    const pv = d.total - d.entrada;
    const i = resolverTaxa(pv, d.parcela, d.n);
    if (i === null) {
      panel.dataset.state = 'coletando'; status.textContent = 'Revisar dados'; actions.hidden = true;
      panelBody.innerHTML = `<h2 class="panel-title">Não conseguimos calcular</h2>
        <p class="msg-bad">Com esses números a parcela multiplicada pelo prazo não supera o valor financiado (ou a taxa resultante seria irreal). Confira o valor do veículo, a entrada, a parcela e o prazo.</p>`;
      return;
    }
    const t = tipo(), limite = LIMITES[t];
    const mensal = i * 100;
    const anual = (Math.pow(1 + i, 12) - 1) * 100;
    const acima = mensal > limite;
    const restantes = d.n - d.pagas;
    let economia = 0, porParcela = 0;
    if (acima) {
      porParcela = d.parcela - pmtPrice(pv, limite / 100, d.n);
      economia = porParcela * restantes;
    }

    const escala = Math.max(limite * 2, mensal * 1.15);
    const wFill = Math.min(100, (mensal / escala) * 100), wMark = (limite / escala) * 100;
    panel.dataset.state = 'resultado'; status.textContent = 'Resultado';
    panelBody.innerHTML = `
      <p class="small-note" style="margin:0">Taxa de juros calculada (${NOMES[t]})</p>
      <div class="rate-big">${pct(mensal)}% <small style="font-size:1rem;font-weight:600;color:var(--muted)">ao mês</small></div>
      <p style="margin:2px 0 0">≈ ${pct(anual)}% ao ano · financiado ${brl(pv)}</p>
      <div class="cmp ${acima ? 'over' : ''}" aria-label="Comparação com o limite de referência">
        <div class="cmp-track"><div class="cmp-fill" style="width:0" data-w="${wFill}"></div><div class="cmp-mark" style="left:${wMark}%" title="Referência"></div></div>
        <div class="cmp-labels"><span>0%</span><span>Referência: ${pct(limite)}% a.m.</span><span>${pct(escala)}%</span></div>
      </div>
      <div class="verdict ${acima ? 'over' : ''}">${acima ? 'Acima do parâmetro de referência' : 'Dentro do parâmetro de referência'}</div>
      <p>${acima
        ? `Sua taxa está <strong>${pct(mensal - limite)} ponto(s) percentual(is)</strong> acima da referência de ${pct(limite)}% ao mês para ${NOMES[t]}. Isso é um indício que vale investigar, não uma conclusão sobre o contrato.`
        : `Sua taxa está dentro da referência de ${pct(limite)}% ao mês para ${NOMES[t]}. Ainda assim, vale comparar propostas e, se quiser, falar com um especialista.`}</p>
      ${acima ? `<div class="saving"><small>Economia estimada nas parcelas restantes (${restantes})</small><b>${brl(economia)}</b>
        <p>≈ ${brl(porParcela)} por parcela, caso o contrato estivesse na taxa de referência. É uma estimativa comparativa: <strong>não indica valores a receber</strong> e a diferença não é devida a você por qualquer instituição.</p></div>` : ''}
      <p class="fine">Cálculo pelo sistema Price com os números informados. Não considera IOF, tarifas, seguros ou encargos. Não é análise jurídica.</p>`;

    // --- Lead: grava (fila com reenvio) ANTES de mostrar o resultado ---
    const k = contato();
    const lead = {
      nome: k.nome, whatsapp: k.whatsapp, email: k.email, lgpd_aceite: 'sim',
      status: acima ? 'novo_acima_do_limite' : 'novo_dentro_do_limite',
      resultado: acima ? 'acima_do_limite' : 'dentro_do_limite',
      tipo: t, banco: c.banco.value.trim(),
      valor_total: d.total.toFixed(2), entrada: d.entrada.toFixed(2), valor_financiado: pv.toFixed(2),
      parcela: d.parcela.toFixed(2), n_parcelas: String(d.n), parcelas_pagas: String(d.pagas),
      taxa_calculada: mensal.toFixed(4), limite_referencia: String(limite), economia_estimada: acima ? economia.toFixed(2) : '0.00',
    };
    const chave = JSON.stringify(lead);
    let enviado = Promise.resolve(true);
    if (chave !== ultimoEnvio) { // mesmo formulário reenviado = só recalcula, sem lead duplicado
      ultimoEnvio = chave;
      enviado = queueLead({ form: 'calculadora', crm: 'calculadora', data: lead }).enviado;
    }

    const msgWa = `Olá! Meu nome é ${k.nome}. Fiz a simulação na ERASE Revisional para ${NOMES[t]} e a taxa calculada foi de ${pct(mensal)}% ao mês. Gostaria de falar com um especialista.`;
    actions.hidden = false;
    actions.innerHTML = `<a class="btn btn-wa btn-block" target="_blank" rel="noopener noreferrer" href="${waLink(msgWa)}">Falar com um especialista no WhatsApp</a>
      <p class="send-status" id="send-status" role="status">Recebemos seus dados. Um especialista entrará em contato, sem compromisso.</p>`;
    enviado.then((ok) => {
      if (!ok) { const el = $('#send-status'); if (el) el.textContent = 'Recebemos seus dados e vamos reenviá-los automaticamente em segundo plano. Você não perde nada.'; }
    });
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = $('.cmp-fill', panelBody); if (el) el.style.width = el.dataset.w + '%';
    }));
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // ---- Eventos ------------------------------------------------------
  form.addEventListener('input', (e) => {
    const fl = e.target.closest('.field'); if (fl) fl.classList.remove('invalid');
    onChange();
  });
  form.addEventListener('change', onChange);
  onChange();
})();
