/* Calculadora de juros — carregada depois de main.js (usa $, $$, maskPhone, phoneOk,
 * emailOk, queueLead e waLink de lá).
 *
 * Matemática: Tabela Price  PMT = PV · i / (1 − (1+i)^−n)
 * Dado PMT, PV e n, a taxa "i" é encontrada por bisseção (a função é crescente em i).
 *
 * Referência de comparação:
 *  - carro: média mensal do Banco Central NO MÊS DA ASSINATURA, lida de
 *    /assets/data/bcb-veiculos.json (gerado por scripts/update-bcb.js). Se o arquivo
 *    ou o mês não existir, usa o limite fixo de data/config.json.
 *  - moto e agrícola: limite fixo de data/config.json.
 */
const FREE_BADGE_TXT = 'ANÁLISE DO CONTRATO 100% GRATUITA';
(function () {
  const root = $('#calculadora');
  if (!root) return;

  const LIMITES = {
    carro: parseFloat(root.dataset.limiteCarro),
    moto: parseFloat(root.dataset.limiteMoto),
    agricola: parseFloat(root.dataset.limiteAgricola),
  };
  const NOMES = { carro: 'carro', moto: 'moto', agricola: 'veículo agrícola' };
  const QUITADO = 'Já quitei o financiamento', ATRASADAS = 'Atrasadas';
  const ANO_INICIO = 2000; // a série do Banco Central começa em 06/2000

  // ---- Série histórica do Banco Central (opcional) --------------------
  let bcb = null;
  fetch('/assets/data/bcb-veiculos.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => { if (j && j.valores) { bcb = j; onChange(); } })
    .catch(() => { /* sem série: usa os limites fixos */ });

  /** Referência (% a.m.) para o tipo e o mês de assinatura. */
  function referencia(tipo, ano, mes) {
    const fixa = { limite: LIMITES[tipo], historico: false };
    if (tipo !== 'carro' || !bcb || !ano || !mes) return fixa;
    const chave = `${ano}-${String(mes).padStart(2, '0')}`;
    let k = chave;
    if (bcb.valores[k] === undefined && bcb.ultimo_mes && chave > bcb.ultimo_mes) k = bcb.ultimo_mes; // mês ainda não publicado
    const v = bcb.valores[k];
    return typeof v === 'number' ? { limite: v, historico: true, chave: k, solicitado: chave } : fixa;
  }

  // ---- Matemática ----------------------------------------------------
  function pmtPrice(pv, i, n) {
    if (i === 0) return pv / n;
    return (pv * i) / (1 - Math.pow(1 + i, -n));
  }
  /** Taxa mensal (decimal) por bisseção; null se não houver taxa positiva coerente. */
  function resolverTaxa(pv, pmt, n) {
    if (pmt * n <= pv) return null;
    let lo = 1e-9, hi = 1;
    if (pmtPrice(pv, hi, n) < pmt) return null;
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
  const f = { total: $('#valor_total'), entrada: $('#entrada'), parcela: $('#parcela'), n: $('#n_parcelas'), pagas: $('#pagas') };
  const c = { nome: $('#lead-nome'), wa: $('#lead-wa'), email: $('#lead-email'), lgpd: $('#lgpd'), banco: $('#banco'), cidade: $('#cidade'), estado: $('#estado') };
  const mesSel = $('#mes_assinatura'), anoSel = $('#ano_assinatura'), atras = $('#atrasadas');
  [f.total, f.entrada, f.parcela].forEach(maskMoney);
  maskPhone($('#lead-wa'));
  for (let y = new Date().getFullYear(); y >= ANO_INICIO; y--) anoSel.add(new Option(String(y), String(y)));

  const panel = $('#analise'), panelBody = $('#panel-body'), status = $('#status'), actions = $('#result-actions');
  const progressFill = $('#progress-fill'), progressText = $('#progress-text'), progressBar = $('#progress');
  let ultimoEnvio = null;

  const radio = (name) => { const el = form.querySelector(`input[name="${name}"]:checked`); return el ? el.value : ''; };
  const tipo = () => radio('tipo') || 'carro';

  function dados() {
    const emDia = radio('parcelas_em_dia');
    const n = parseInt(f.n.value, 10);
    return {
      total: parseMoney(f.total.value), entrada: parseMoney(f.entrada.value), parcela: parseMoney(f.parcela.value), n,
      pagas: emDia === QUITADO ? n : (f.pagas.value === '' ? NaN : parseInt(f.pagas.value, 10)),
      emDia, atrasadas: atras.value === '' ? NaN : parseInt(atras.value, 10),
      busca: radio('busca_apreensao'),
      mes: parseInt(mesSel.value, 10) || 0, ano: parseInt(anoSel.value, 10) || 0,
    };
  }
  const contato = () => ({ nome: c.nome.value.trim().replace(/\s+/g, ' '), whatsapp: c.wa.value.trim(), email: c.email.value.trim(), lgpd: c.lgpd.checked });

  /** Itens obrigatórios (true = preenchido) — alimenta a barra de progresso. */
  function itens(d) {
    const k = contato(), ok = (v) => !Number.isNaN(v) && v !== undefined;
    const lista = [ok(d.total), ok(d.entrada), ok(d.parcela), ok(d.n), d.emDia === QUITADO || ok(d.pagas),
      !!(d.mes && d.ano), !!d.emDia, !!d.busca, !!k.nome, !!k.whatsapp, k.lgpd];
    if (d.emDia === ATRASADAS) lista.push(ok(d.atrasadas));
    return lista;
  }

  /** Valida e devolve {campo: mensagem}. */
  function validar(d) {
    const e = {};
    if (!(d.total > 0)) e.valor_total = 'Informe o valor do veículo';
    if (Number.isNaN(d.entrada)) e.entrada = 'Informe a entrada (pode ser 0)';
    else if (d.total > 0 && d.entrada >= d.total) e.entrada = 'A entrada deve ser menor que o valor do veículo';
    if (!(d.parcela > 0)) e.parcela = 'Informe a parcela atual';
    if (!(d.n > 0)) e.n_parcelas = 'Selecione o total de parcelas';

    if (!d.mes || !d.ano) e.assinatura = 'Informe o mês e o ano da assinatura';
    const agora = new Date(), meses = agora.getFullYear() * 12 + agora.getMonth() + 1 - (d.ano * 12 + d.mes);
    if (d.mes && d.ano && meses < 0) e.assinatura = 'A data da assinatura não pode ser no futuro';

    if (d.emDia !== QUITADO) {
      if (Number.isNaN(d.pagas) || d.pagas < 0) e.pagas = 'Informe quantas parcelas já pagou';
      else if (d.n > 0 && d.pagas >= d.n) e.pagas = 'Parcelas pagas deve ser menor que o total financiado';
      else if (d.mes && d.ano && meses >= 0 && d.pagas > meses + 1) e.pagas = 'Mais parcelas pagas do que meses desde a assinatura';
    }
    if (!d.emDia) e.parcelas_em_dia = 'Escolha uma opção';
    if (d.emDia === ATRASADAS && (Number.isNaN(d.atrasadas) || d.atrasadas < 1 || (d.n > 0 && d.atrasadas > d.n))) e.atrasadas = 'Informe quantas parcelas estão atrasadas';
    if (!d.busca) e.busca_apreensao = 'Escolha uma opção';

    const k = contato();
    if (k.nome.split(' ').filter((w) => w.length >= 2).length < 2) e.nome = 'Informe seu nome completo (não abrevie)';
    if (!phoneOk(k.whatsapp)) e.whatsapp = 'WhatsApp inválido — use DDD + 9 dígitos';
    if (k.email && !emailOk(k.email)) e.email = 'E-mail inválido';
    if (!k.lgpd) e.lgpd = 'É necessário autorizar o contato para ver o resultado';
    return e;
  }

  // ---- Painel "Análise em tempo real" ---------------------------------
  function setProgress(lista) {
    const qtd = lista.filter(Boolean).length, tot = lista.length, p = Math.round((qtd / tot) * 100);
    progressFill.style.width = p + '%';
    progressBar.setAttribute('aria-valuenow', p);
    progressText.textContent = qtd === 0 ? 'Preencha seus dados para iniciar...' : qtd < tot ? `${qtd} de ${tot} campos preenchidos` : 'Tudo preenchido — pronto para calcular';
  }

  const mm = (ano, mes) => `${String(mes).padStart(2, '0')}/${ano}`;
  function textoRef(ref, t) {
    return ref.historico
      ? `média do Banco Central em ${mm(...ref.chave.split('-').map(Number))}: ${pct(ref.limite)}% ao mês`
      : `referência de ${pct(ref.limite)}% ao mês para ${NOMES[t]}`;
  }

  function painelColetando(d, lista) {
    const pronto = lista.every(Boolean) && Object.keys(validar(d)).length === 0;
    panel.dataset.state = pronto ? 'pronto' : 'coletando';
    status.textContent = pronto ? 'Pronto' : 'Coletando';
    const t = tipo(), ref = referencia(t, d.ano, d.mes);
    const financiado = d.total > 0 && d.entrada >= 0 && d.total > d.entrada ? d.total - d.entrada : null;
    const steps = [d.parcela > 0 && d.n > 0, d.total > 0 && d.entrada >= 0 && !!(d.mes && d.ano), pronto];
    panelBody.innerHTML = `
      <h2 class="panel-title">${pronto ? 'Tudo certo! Falta só calcular' : 'Aguardando seu contrato...'}</h2>
      <p>${pronto
        ? `Clique em <strong>Calcular minha taxa</strong>: ao enviar seus dados, mostramos a taxa embutida no seu contrato e a comparação com a média de mercado para <span id="tipo-label">${NOMES[t]}</span>.`
        : `À medida que você preencher o formulário, preparamos o cálculo e, depois do envio dos seus dados, mostramos o resultado: calculamos a taxa que está sendo cobrada e comparamos com a média de mercado para <span id="tipo-label">${NOMES[t]}</span>.`}</p>
      ${financiado ? `<div class="kv"><div><small>Valor financiado</small><b>${brl(financiado)}</b></div><div><small>${ref.historico ? 'Média do BC na assinatura' : `Referência (${NOMES[t]})`}</small><b>${pct(ref.limite)}% a.m.</b></div></div>` : ''}
      <ul class="steps-list">
        <li class="${steps[0] ? 'done' : ''}"><i></i>Identificar a taxa real do contrato</li>
        <li class="${steps[1] ? 'done' : ''}"><i></i>Cruzar com a referência do período da assinatura</li>
        <li class="${steps[2] ? 'done' : ''}"><i></i>Estimar a economia nas parcelas restantes</li>
      </ul>`;
    actions.hidden = true;
  }

  function onChange() {
    // pergunta condicional: atrasadas / quitado
    const emDia = radio('parcelas_em_dia');
    $('#atrasadas-box').hidden = emDia !== ATRASADAS;
    $('#pagas-field').hidden = emDia === QUITADO;
    const d = dados(), lista = itens(d);
    setProgress(lista);
    painelColetando(d, lista);
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

  // ---- Cálculo + lead ----------------------------------------------------
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const d = dados(), erros = validar(d);
    mostrarErros(erros);
    if (Object.keys(erros).length) {
      const primeiro = $('.field.invalid', form);
      if (primeiro) { primeiro.scrollIntoView({ block: 'center', behavior: 'smooth' }); const i = $('input:not([type=radio]), select', primeiro) || $('input', primeiro); if (i) i.focus({ preventScroll: true }); }
      return;
    }
    const pv = d.total - d.entrada, i = resolverTaxa(pv, d.parcela, d.n);
    if (i === null) {
      panel.dataset.state = 'coletando'; status.textContent = 'Revisar dados'; actions.hidden = true;
      panelBody.innerHTML = `<h2 class="panel-title">Não conseguimos calcular</h2>
        <p class="msg-bad">Com esses números a parcela multiplicada pelo prazo não supera o valor financiado (ou a taxa resultante seria irreal). Confira o valor do veículo, a entrada, a parcela e o prazo.</p>`;
      return;
    }
    const t = tipo(), ref = referencia(t, d.ano, d.mes), limite = ref.limite;
    const mensal = i * 100, anual = (Math.pow(1 + i, 12) - 1) * 100, acima = mensal > limite;
    const quitado = d.emDia === QUITADO, restantes = quitado ? 0 : d.n - d.pagas;
    let economia = 0, porParcela = 0;
    if (acima && restantes > 0) { porParcela = d.parcela - pmtPrice(pv, limite / 100, d.n); economia = porParcela * restantes; }

    const escala = Math.max(limite * 2, mensal * 1.15);
    const wFill = Math.min(100, (mensal / escala) * 100), wMark = (limite / escala) * 100;
    const nota = ref.historico
      ? `Comparação com a média do Banco Central no mês da assinatura (${mm(...ref.chave.split('-').map(Number))}${ref.chave !== ref.solicitado ? ', mês mais recente disponível' : ''}).`
      : (t === 'carro' && bcb ? 'Média do mês da assinatura indisponível; usamos a referência atual.' : `Referência fixa para ${NOMES[t]}.`);
    panel.dataset.state = 'resultado'; status.textContent = 'Resultado';
    panelBody.innerHTML = `
      <p class="small-note" style="margin:0">Taxa de juros calculada (${NOMES[t]})</p>
      <div class="rate-big">${pct(mensal)}% <small style="font-size:1rem;font-weight:600;color:var(--muted)">ao mês</small></div>
      <p style="margin:2px 0 0">≈ ${pct(anual)}% ao ano · financiado ${brl(pv)}</p>
      <div class="cmp ${acima ? 'over' : ''}" aria-label="Comparação com a referência">
        <div class="cmp-track"><div class="cmp-fill" style="width:0" data-w="${wFill}"></div><div class="cmp-mark" style="left:${wMark}%" title="Referência"></div></div>
        <div class="cmp-labels"><span>0%</span><span>Referência: ${pct(limite)}% a.m.</span><span>${pct(escala)}%</span></div>
        <p class="fine" style="margin:6px 0 0">${nota}</p>
      </div>
      <div class="verdict ${acima ? 'over' : ''}">${acima ? 'Acima do parâmetro de referência' : 'Dentro do parâmetro de referência'}</div>
      <p>${acima
        ? `Sua taxa está <strong>${pct(mensal - limite)} ponto(s) percentual(is)</strong> acima da ${textoRef(ref, t)}. Isso é um indício que vale investigar, não uma conclusão sobre o contrato.`
        : `Pela taxa de juros, seu contrato parece estar dentro da média de mercado (<strong>${textoRef(ref, t)}</strong>).`}</p>
      <p>${acima
        ? `<strong>A economia mostrada é só uma estimativa, feita com os números que você informou.</strong> A análise do contrato é que permite conferir esses números e verificar se há outras cobranças, como seguro prestamista e tarifas, que esta simulação não enxerga.`
        : `<strong>Mas esta calculadora é só uma estimativa da taxa de juros.</strong> O contrato pode incluir seguro prestamista, tarifas e outras cobranças dentro da parcela, e isso só aparece na leitura do contrato. A análise do contrato pode verificar se há algo a questionar nesses itens.`}</p>
      ${acima ? '' : '<p class="fine" style="margin-top:0">Esta simulação não indica valores a receber.</p>'}
      <div class="free-badge" role="note">${FREE_BADGE_TXT}</div>
      ${acima && restantes > 0 ? `<div class="saving"><small>Economia estimada nas parcelas restantes (${restantes})</small><b>${brl(economia)}</b>
        <p>≈ ${brl(porParcela)} por parcela, caso o contrato estivesse na taxa de referência. É uma estimativa comparativa: <strong>não indica valores a receber</strong> e a diferença não é devida a você por qualquer instituição.</p></div>` : ''}
      ${acima && quitado ? '<p class="fine">Como o financiamento já foi quitado, não há parcelas restantes para estimar. A diferença acima é apenas uma comparação de taxas e não indica valores a receber.</p>' : ''}
      <p class="fine">Cálculo pelo sistema Price com os números informados. Não considera IOF, tarifas, seguros (inclusive seguro prestamista) ou encargos. Não é análise jurídica.</p>`;

    // --- Lead: grava (fila com reenvio) com TODAS as respostas ---
    const k = contato();
    const lead = {
      nome: k.nome, whatsapp: k.whatsapp, email: k.email, lgpd_aceite: 'sim',
      status: acima ? 'novo_acima_do_limite' : 'novo_dentro_do_limite',
      resultado: acima ? 'acima_do_limite' : 'dentro_do_limite',
      tipo: t, banco: c.banco.value.trim(),
      valor_total: d.total.toFixed(2), entrada: d.entrada.toFixed(2), valor_financiado: pv.toFixed(2),
      parcela: d.parcela.toFixed(2), n_parcelas: String(d.n), parcelas_pagas: String(d.pagas),
      taxa_calculada: mensal.toFixed(4), limite_referencia: String(limite), economia_estimada: acima ? economia.toFixed(2) : '0.00',
      parcelas_em_dia: d.emDia, parcelas_atrasadas: d.emDia === ATRASADAS ? String(d.atrasadas) : '',
      busca_apreensao: d.busca,
      mes_assinatura: String(d.mes).padStart(2, '0'), ano_assinatura: String(d.ano), data_assinatura: `${d.ano}-${String(d.mes).padStart(2, '0')}`,
      seguro: radio('seguro'), contrato_em_maos: radio('contrato_em_maos'), acao_revisional_anterior: radio('acao_revisional_anterior'),
      cidade: c.cidade.value.trim(), estado: c.estado.value, horario_contato: radio('horario_contato'),
      referencia_periodo: ref.historico ? ref.chave : 'atual', media_bcb_periodo: ref.historico ? ref.limite.toFixed(2) : '',
      fonte_referencia: ref.historico ? `BCB SGS ${bcb.serie || ''}`.trim() : 'limite_fixo_config',
    };
    const chave = JSON.stringify(lead);
    let enviado = Promise.resolve(true);
    if (chave !== ultimoEnvio) { // mesmo formulário reenviado = só recalcula, sem lead duplicado
      ultimoEnvio = chave;
      enviado = queueLead({ form: 'calculadora', crm: 'calculadora', data: lead }).enviado;
    }

    const msgWa = acima
      ? `Olá! Meu nome é ${k.nome}. Fiz a simulação na ERASE Revisional para ${NOMES[t]} e a taxa calculada foi de ${pct(mensal)}% ao mês. Gostaria de falar com um especialista.`
      : `Olá! Meu nome é ${k.nome}. Fiz a simulação na ERASE Revisional para ${NOMES[t]}, a taxa calculada foi de ${pct(mensal)}% ao mês (dentro da referência) e gostaria de pedir a análise gratuita do contrato.`;
    actions.hidden = false;
    actions.innerHTML = `<a class="btn btn-wa btn-block" target="_blank" rel="noopener noreferrer" href="${waLink(msgWa)}">${acima ? 'Falar com um especialista no WhatsApp' : 'Quero a análise gratuita do contrato'}</a>
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
  form.addEventListener('change', (e) => {
    const fl = e.target.closest('.field'); if (fl) fl.classList.remove('invalid');
    onChange();
  });
  onChange();
})();
