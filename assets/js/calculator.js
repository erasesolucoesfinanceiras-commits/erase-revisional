/* Calculadora de juros — carregada depois de main.js (usa $, $$, maskPhone, phoneOk,
 * queueLead e waLink de lá).
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
  const QUITADO = 'Já quitei';
  // Mesmos nomes de campo e valores do pop-up (o CRM marca URGENTE se atrasado ou busca e apreensão).
  const SITUACAO = {
    'Em dia': { parcelas_em_dia: 'Em dia', busca_apreensao: '' },
    'Atrasado': { parcelas_em_dia: 'Atrasadas', busca_apreensao: '' },
    'Busca e apreensão': { parcelas_em_dia: '', busca_apreensao: 'Já tem processo de busca e apreensão' },
    [QUITADO]: { parcelas_em_dia: 'Já quitei o financiamento', busca_apreensao: '' },
  };

  // ---- Série histórica do Banco Central (opcional) --------------------
  let bcb = null;
  fetch('/assets/data/bcb-veiculos.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => { if (j && j.valores) { bcb = j; if (!ultimoEnvio) onChange(); } }) // não apaga um resultado já exibido
    .catch(() => { /* sem série: usa os limites fixos */ });

  /** Referência (% a.m.) para o tipo e o mês de assinatura. */
  function referencia(tipo, ano, mes) {
    const fixa = { limite: LIMITES[tipo], historico: false };
    if (tipo !== 'carro' || !bcb) return fixa;
    // sem data estimada (nenhuma parcela paga informada): usa a última média publicada pelo BC
    const chave = ano && mes ? `${ano}-${String(mes).padStart(2, '0')}` : bcb.ultimo_mes;
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
  /** Campo em reais: digitar 50000, 50.000 ou 50.000,00 vira R$ 50.000,00 (ao sair do campo; durante a digitação só põe os pontos de milhar). */
  const fmt2 = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function parseMoney(str) {
    const s = String(str).trim().replace(/[^\d.,]/g, '');
    if (!/\d/.test(s)) return NaN;
    if (s.includes(',')) return parseFloat(s.replace(/\./g, '').replace(',', '.'));
    if (/^\d+\.\d{1,2}$/.test(s)) return parseFloat(s); // "50.5" = 50,50
    return parseFloat(s.replace(/\./g, '')); // "50.000" ou "50000"
  }
  function maskMoney(input) {
    input.addEventListener('input', () => {
      const pos = input.selectionStart, antes = input.value.slice(0, pos).replace(/[^\d,]/g, '').length;
      const [int, ...resto] = input.value.replace(/[^\d,]/g, '').split(',');
      const inteiro = int.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
      input.value = resto.length ? `${inteiro},${resto.join('').slice(0, 2)}` : inteiro;
      let n = 0, i = 0; // devolve o cursor para a mesma posição lógica
      while (i < input.value.length && n < antes) { if (/[\d,]/.test(input.value[i])) n++; i++; }
      input.setSelectionRange(i, i);
    });
    input.addEventListener('blur', () => { const v = parseMoney(input.value); if (!Number.isNaN(v)) input.value = fmt2(v); });
  }

  // ---- Elementos -----------------------------------------------------
  const form = $('#calc-form');
  const f = { pv: $('#valor_financiado'), parcela: $('#parcela'), n: $('#n_parcelas'), pagas: $('#pagas') };
  const c = { nome: $('#lead-nome'), wa: $('#lead-wa'), lgpd: $('#lgpd') };
  [f.pv, f.parcela].forEach(maskMoney);
  maskPhone($('#lead-wa'));

  const panel = $('#analise'), panelBody = $('#panel-body'), status = $('#status'), actions = $('#result-actions');
  const progressFill = $('#progress-fill'), progressText = $('#progress-text'), progressBar = $('#progress');
  let ultimoEnvio = null;

  const radio = (name) => { const el = form.querySelector(`input[name="${name}"]:checked`); return el ? el.value : ''; };
  const tipo = () => radio('tipo') || 'carro';

  /** Data de assinatura ESTIMADA: hoje menos as parcelas já pagas (sem parcelas pagas → sem data → referência atual). */
  function estimarData(pagas) {
    if (!(pagas >= 0)) return { mes: 0, ano: 0 };
    const hoje = new Date(), t = hoje.getFullYear() * 12 + hoje.getMonth() - pagas;
    return { ano: Math.floor(t / 12), mes: (t % 12) + 1 };
  }

  function dados() {
    const sit = radio('situacao');
    const n = parseInt(f.n.value, 10);
    const pagas = sit === QUITADO ? n : (f.pagas.value === '' ? NaN : parseInt(f.pagas.value, 10));
    return { pv: parseMoney(f.pv.value), parcela: parseMoney(f.parcela.value), n, pagas, sit, ...estimarData(pagas) };
  }
  const contato = () => ({ nome: c.nome.value.trim().replace(/\s+/g, ' '), whatsapp: c.wa.value.trim(), lgpd: c.lgpd.checked });

  /** Itens obrigatórios (true = preenchido) — alimenta a barra de progresso. */
  function itens(d) {
    const k = contato();
    return [!!d.sit, !!k.nome, !!k.whatsapp, k.lgpd];
  }

  /** Valida e devolve {campo: mensagem}. Só situação, nome, WhatsApp e LGPD são obrigatórios; os demais, se preenchidos, precisam fazer sentido. */
  function validar(d) {
    const e = {};
    if (!d.sit) e.situacao = 'Escolha uma opção';
    if (d.sit !== QUITADO && d.pagas >= 0 && d.n > 0 && d.pagas >= d.n) e.pagas = 'Parcelas pagas deve ser menor que o total financiado';
    const k = contato();
    if (k.nome.split(' ').filter((w) => w.length >= 2).length < 2) e.nome = 'Informe seu nome completo (não abrevie)';
    if (!phoneOk(k.whatsapp)) e.whatsapp = 'WhatsApp inválido — use DDD + 9 dígitos';
    if (!k.lgpd) e.lgpd = 'É necessário autorizar o contato para enviar';
    return e;
  }

  // ---- Painel "Análise em tempo real" ---------------------------------
  function setProgress(lista) {
    const qtd = lista.filter(Boolean).length, tot = lista.length, p = Math.round((qtd / tot) * 100);
    progressFill.style.width = p + '%';
    progressBar.setAttribute('aria-valuenow', p);
    progressText.textContent = qtd === 0 ? 'Preencha seus dados para iniciar...' : qtd < tot ? `${qtd} de ${tot} campos obrigatórios` : 'Pronto para enviar';
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
    const financiado = d.pv > 0 ? d.pv : null;
    const steps = [d.parcela > 0 && d.n > 0, d.pv > 0 && !!(d.mes && d.ano), pronto];
    panelBody.innerHTML = `
      <h2 class="panel-title">${pronto ? 'Tudo certo! Falta só calcular' : 'Aguardando seu contrato...'}</h2>
      <p>${pronto
        ? `Clique em <strong>Calcular minha taxa</strong>: ao enviar seus dados, mostramos a taxa embutida no seu contrato (se você informou valor financiado, parcela e número de parcelas) e a comparação com a média de mercado para <span id="tipo-label">${NOMES[t]}</span>.`
        : `À medida que você preencher o formulário, preparamos o cálculo e, depois do envio dos seus dados, mostramos o resultado: calculamos a taxa que está sendo cobrada e comparamos com a média de mercado para <span id="tipo-label">${NOMES[t]}</span>.`}</p>
      ${financiado ? `<div class="kv"><div><small>Valor financiado</small><b>${brl(financiado)}</b></div><div><small>${ref.historico ? 'Média do BC no período' : `Referência (${NOMES[t]})`}</small><b>${pct(ref.limite)}% a.m.</b></div></div>` : ''}
      <ul class="steps-list">
        <li class="${steps[0] ? 'done' : ''}"><i></i>Identificar a taxa real do contrato</li>
        <li class="${steps[1] ? 'done' : ''}"><i></i>Cruzar com a referência do período estimado da assinatura</li>
        <li class="${steps[2] ? 'done' : ''}"><i></i>Estimar a economia nas parcelas restantes</li>
      </ul>`;
    actions.hidden = true;
  }

  function onChange() {
    // pergunta condicional: quitado não tem parcelas já pagas a informar
    $('#pagas-field').hidden = radio('situacao') === QUITADO;
    const d = dados(), lista = itens(d);
    setProgress(lista);
    // aviso + destaque dos campos que faltam para mostrar a taxa na hora (não são obrigatórios)
    const falta = { valor_financiado: !(d.pv > 0), parcela: !(d.parcela > 0), n_parcelas: !(d.n > 0) };
    for (const [id, m] of Object.entries(falta)) $('#' + id).closest('.field').classList.toggle('falta', m);
    $('#calc-warn').hidden = !Object.values(falta).some(Boolean);
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
    const k = contato(), t = tipo(), sit = SITUACAO[d.sit];
    const completo = d.pv > 0 && d.parcela > 0 && d.n > 0;
    const pv = d.pv, i = completo ? resolverTaxa(pv, d.parcela, d.n) : null;
    const num = (v, dec = 2) => (v > 0 ? v.toFixed(dec) : '');
    const baseLead = {
      nome: k.nome, whatsapp: k.whatsapp, lgpd_aceite: 'sim', tipo: t,
      valor_financiado: num(pv), parcela: num(d.parcela), n_parcelas: num(d.n, 0), parcelas_pagas: d.pagas >= 0 ? String(d.pagas) : '',
      parcelas_em_dia: sit.parcelas_em_dia, busca_apreensao: sit.busca_apreensao,
      // data de assinatura ESTIMADA (hoje menos as parcelas pagas); vazia se não há parcelas pagas
      mes_assinatura: d.mes ? String(d.mes).padStart(2, '0') : '', ano_assinatura: d.ano ? String(d.ano) : '', data_assinatura: d.mes ? `${d.ano}-${String(d.mes).padStart(2, '0')}` : '',
    };
    if (i === null) { // dados do financiamento incompletos (ou sem taxa coerente): envia o lead e avisa que o especialista calcula
      const lead = { ...baseLead, status: 'novo_sem_calculo', resultado: 'nao_calculado', taxa_calculada: '', limite_referencia: '', economia_estimada: '', referencia_periodo: '', media_bcb_periodo: '', fonte_referencia: '' };
      const chave = JSON.stringify(lead);
      let enviado = Promise.resolve(true);
      if (chave !== ultimoEnvio) { ultimoEnvio = chave; enviado = queueLead({ form: 'calculadora', crm: 'calculadora', data: lead }).enviado; }
      panel.dataset.state = 'resultado'; status.textContent = 'Recebido';
      panelBody.innerHTML = `<h2 class="panel-title">Recebemos seus dados!</h2>
        <p>Um especialista vai calcular sua taxa e falar com você no WhatsApp.</p>
        ${completo ? '<p class="msg-bad">Não conseguimos calcular na hora: com esses números a parcela multiplicada pelo prazo não supera o valor financiado (ou a taxa seria irreal). Se quiser, confira o valor financiado, a parcela e o prazo.</p>' : ''}
        <div class="free-badge" role="note">${FREE_BADGE_TXT}</div>`;
      actions.hidden = false;
      actions.innerHTML = `<a class="btn btn-wa btn-block" target="_blank" rel="noopener noreferrer" href="${waLink(`Olá! Meu nome é ${k.nome}. Fiz a simulação na ERASE Revisional para ${NOMES[t]} e gostaria de falar com um especialista.`)}">Falar com um especialista no WhatsApp</a>
        <p class="send-status" id="send-status" role="status"></p>`;
      enviado.then((ok) => { if (!ok) { const el = $('#send-status'); if (el) el.textContent = 'Vamos reenviar seus dados automaticamente em segundo plano. Você não perde nada.'; } });
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const ref = referencia(t, d.ano, d.mes), limite = ref.limite;
    const mensal = i * 100, anual = (Math.pow(1 + i, 12) - 1) * 100, acima = mensal > limite;
    const quitado = d.sit === QUITADO, restantes = quitado ? 0 : d.n - d.pagas; // sem parcelas pagas: NaN → sem estimativa de economia
    let economia = 0, porParcela = 0;
    if (acima && restantes > 0) { porParcela = d.parcela - pmtPrice(pv, limite / 100, d.n); economia = porParcela * restantes; }

    const escala = Math.max(limite * 2, mensal * 1.15);
    const wFill = Math.min(100, (mensal / escala) * 100), wMark = (limite / escala) * 100;
    const nota = ref.historico && !d.ano
      ? `Sem o número de parcelas pagas, usamos a média mais recente do Banco Central (${mm(...ref.chave.split('-').map(Number))}).`
      : ref.historico
      ? `Comparação com a média do Banco Central no mês estimado da assinatura (${mm(...ref.chave.split('-').map(Number))}${ref.chave !== ref.solicitado ? ', mês mais recente disponível' : ''}).`
      : (t === 'carro' && bcb ? 'Média do mês estimado da assinatura indisponível; usamos a referência atual.' : `Referência fixa para ${NOMES[t]}.`);
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
    const lead = {
      ...baseLead,
      status: acima ? 'novo_acima_do_limite' : 'novo_dentro_do_limite',
      resultado: acima ? 'acima_do_limite' : 'dentro_do_limite',
      taxa_calculada: mensal.toFixed(4), limite_referencia: String(limite), economia_estimada: acima ? economia.toFixed(2) : '0.00',
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
