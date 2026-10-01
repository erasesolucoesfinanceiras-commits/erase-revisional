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
  const panel = $('#analise'), panelBody = $('#panel-body'), status = $('#status');
  const leadBox = $('#lead-box'), leadForm = $('#lead-form');
  const progressFill = $('#progress-fill'), progressText = $('#progress-text'), progressBar = $('#progress');
  let resultado = null; // último cálculo (usado no lead)

  const tipo = () => form.tipo.value;
  const dados = () => ({
    total: parseMoney(f.total.value), entrada: parseMoney(f.entrada.value), parcela: parseMoney(f.parcela.value),
    n: parseInt(f.n.value, 10), pagas: f.pagas.value === '' ? NaN : parseInt(f.pagas.value, 10),
  });
  const preenchidos = (d) => [d.total, d.entrada, d.parcela, d.n, d.pagas].filter((v) => !Number.isNaN(v) && v !== undefined).length;

  /** Valida e devolve {erros:{campo:msg}} — campos obrigatórios e coerência. */
  function validar(d) {
    const e = {};
    if (!(d.total > 0)) e.valor_total = 'Informe o valor do veículo';
    if (Number.isNaN(d.entrada)) e.entrada = 'Informe a entrada (pode ser 0)';
    else if (d.total > 0 && d.entrada >= d.total) e.entrada = 'A entrada deve ser menor que o valor do veículo';
    if (!(d.parcela > 0)) e.parcela = 'Informe a parcela atual';
    if (!(d.n > 0)) e.n_parcelas = 'Selecione o total de parcelas';
    if (Number.isNaN(d.pagas) || d.pagas < 0) e.pagas = 'Informe quantas parcelas já pagou';
    else if (d.n > 0 && d.pagas >= d.n) e.pagas = 'Parcelas pagas deve ser menor que o total financiado';
    return e;
  }

  // ---- Painel "Análise em tempo real" ---------------------------------
  function setProgress(qtd) {
    const p = Math.round((qtd / 5) * 100);
    progressFill.style.width = p + '%';
    progressBar.setAttribute('aria-valuenow', p);
    progressText.textContent = qtd === 0 ? 'Preencha seus dados para iniciar...' : qtd < 5 ? `${qtd} de 5 campos preenchidos` : 'Tudo preenchido — pronto para calcular';
  }

  function painelColetando(d, qtd) {
    const pronto = qtd === 5 && Object.keys(validar(d)).length === 0;
    panel.dataset.state = pronto ? 'pronto' : 'coletando';
    status.textContent = pronto ? 'Pronto' : 'Coletando';
    const financiado = d.total > 0 && d.entrada >= 0 && d.total > d.entrada ? d.total - d.entrada : null;
    const steps = [qtd >= 3 && d.parcela > 0, qtd >= 4, pronto];
    panelBody.innerHTML = `
      <h2 class="panel-title">${pronto ? 'Tudo certo! Falta só calcular' : 'Aguardando seu contrato...'}</h2>
      <p>${pronto
        ? `Clique em <strong>Calcular minha taxa</strong> para ver a taxa embutida no seu contrato e a comparação com a média de mercado para <span id="tipo-label">${NOMES[tipo()]}</span>.`
        : `À medida que você preencher o formulário, calculamos a taxa que está sendo cobrada e comparamos com a média de mercado para <span id="tipo-label">${NOMES[tipo()]}</span>.`}</p>
      ${financiado ? `<div class="kv"><div><small>Valor financiado</small><b>${brl(financiado)}</b></div><div><small>Referência (${NOMES[tipo()]})</small><b>${pct(LIMITES[tipo()])}% a.m.</b></div></div>` : ''}
      <ul class="steps-list">
        <li data-step="1" class="${steps[0] ? 'done' : ''}"><i></i>Identificar a taxa real do contrato</li>
        <li data-step="2" class="${steps[1] ? 'done' : ''}"><i></i>Cruzar com a faixa de referência do mercado</li>
        <li data-step="3" class="${steps[2] ? 'done' : ''}"><i></i>Estimar a economia nas parcelas restantes</li>
      </ul>`;
    leadBox.hidden = true;
  }

  function onChange() {
    resultado = null;
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
      panel.dataset.state = 'coletando'; status.textContent = 'Revisar dados'; leadBox.hidden = true;
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
    resultado = { tipo: t, mensal, anual, acima, economia, financiado: pv, ...d };

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
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = $('.cmp-fill', panelBody); if (el) el.style.width = el.dataset.w + '%';
    }));
    leadBox.hidden = false;
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // ---- Lead (após o cálculo) -----------------------------------------
  maskPhone($('#lead-wa'));
  leadForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (!resultado) return;
    const nome = leadForm.nome.value.trim(), wa = leadForm.whatsapp.value.trim();
    const erros = {};
    if (nome.split(/\s+/).filter(Boolean).length < 2) erros.nome = 'Informe seu nome completo (não abrevie)';
    if (!phoneOk(wa)) erros.whatsapp = 'WhatsApp inválido';
    mostrarErros(erros);
    if (Object.keys(erros).length) return;

    const r = resultado;
    const msgTxt = `Olá! Meu nome é ${nome}. Fiz a simulação na ERASE Revisional para ${NOMES[r.tipo]} e a taxa calculada foi de ${pct(r.mensal)}% ao mês. Gostaria de falar com um especialista.`;
    // Abre o WhatsApp de forma síncrona (dentro do gesto do usuário) para não ser bloqueado.
    window.open(waLink(msgTxt), '_blank', 'noopener');

    const msg = $('#lead-msg'); msg.textContent = 'Obrigado! Abrimos o WhatsApp para você continuar a conversa.';
    const lead = {
      nome, whatsapp: wa, tipo: r.tipo,
      valor_total: String(r.total), entrada: String(r.entrada), parcela: String(r.parcela),
      n_parcelas: String(r.n), parcelas_pagas: String(r.pagas), taxa_calculada: r.mensal.toFixed(4),
    };
    enviarParaCRM('calculadora', { ...lead, telefone: wa, acima_do_limite: r.acima, economia_estimada: Number(r.economia.toFixed(2)) });
    postNetlify('calculadora', lead).catch((err) => console.error('Netlify Forms:', err));
  });

  // ---- Eventos ------------------------------------------------------
  form.addEventListener('input', (e) => {
    const fl = e.target.closest('.field'); if (fl) fl.classList.remove('invalid');
    onChange();
  });
  form.addEventListener('change', onChange);
  onChange();
})();
