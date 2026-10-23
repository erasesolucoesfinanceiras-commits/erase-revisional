/* Núcleo de cálculo compartilhado pela calculadora do site (calculator.js) e pela calculadora do chat /analise (analise.js).
 * Matemática: Tabela Price  PMT = PV · i / (1 − (1+i)^−n); dado PMT, PV e n, a taxa "i" é achada por bisseção.
 * Referência: carro = média mensal do Banco Central NO MÊS DA ASSINATURA (/assets/data/bcb-veiculos.json); sem a série ou o mês, limite fixo de data/config.json. */
const CalcCore = (function () {
  const bcbSerie = () => fetch('/assets/data/bcb-veiculos.json').then((r) => (r.ok ? r.json() : null)).then((j) => (j && j.valores ? j : null)).catch(() => null);

  /** Referência (% a.m.) para o tipo e o mês de assinatura. */
  function referencia(tipo, ano, mes, LIMITES, bcb) {
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
  /** Tabela Price ANTECIPADA (1ª parcela paga no ato da assinatura): PMT_no_ato = PMT / (1 + i), como na Calculadora do Cidadão do BC. */
  function pmtPriceNoAto(pv, i, n) {
    return pmtPrice(pv, i, n) / (1 + i);
  }
  /** Taxa mensal (decimal) por bisseção; null se não houver taxa positiva coerente. `noAto`: 1ª parcela paga no ato. */
  function resolverTaxa(pv, pmt, n, noAto = false) {
    const prest = noAto ? pmtPriceNoAto : pmtPrice;
    if (pmt * n <= pv) return null;
    let lo = 1e-9, hi = 1;
    if (prest(pv, hi, n) < pmt) return null;
    for (let k = 0; k < 200; k++) {
      const mid = (lo + hi) / 2;
      if (prest(pv, mid, n) < pmt) lo = mid; else hi = mid;
      if (hi - lo < 1e-13) break;
    }
    return (lo + hi) / 2;
  }

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

  /** Data de assinatura ESTIMADA: hoje menos as parcelas já pagas (sem parcelas pagas → sem data → referência atual). */
  function estimarData(pagas) {
    if (!(pagas >= 0)) return { mes: 0, ano: 0 };
    const hoje = new Date(), t = hoje.getFullYear() * 12 + hoje.getMonth() - pagas;
    return { ano: Math.floor(t / 12), mes: (t % 12) + 1 };
  }


  return { bcbSerie, referencia, pmtPrice, pmtPriceNoAto, resolverTaxa, brl, pct, fmt2, parseMoney, maskMoney, estimarData };
})();
