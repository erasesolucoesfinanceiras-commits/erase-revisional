#!/usr/bin/env node
// Baixa a série histórica MENSAL do Banco Central (SGS 25471: taxa média mensal de juros,
// pessoas físicas, aquisição de veículos, em % ao mês, desde 06/2000) e grava
// assets/data/bcb-veiculos.json, usado pela calculadora para comparar a taxa do contrato
// com a média do mês em que ele foi assinado.
//   node scripts/update-bcb.js        (rodado pelo workflow .github/workflows/bcb.yml)
const fs = require('fs');
const path = require('path');

const SERIE_SGS = Number(process.env.BCB_SERIE || 25471);
const OUT = process.env.BCB_SAIDA || path.join(__dirname, '..', 'assets', 'data', 'bcb-veiculos.json'); // BCB_SAIDA/BCB_URL: só para testes
const URL = process.env.BCB_URL || `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${SERIE_SGS}/dados?formato=json`;

async function baixar() {
  let erro;
  for (let t = 1; t <= 4; t++) { // a API do BC às vezes falha de forma intermitente
    try {
      const res = await fetch(URL, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) { erro = e; console.error(`Tentativa ${t} falhou: ${e.message}`); await new Promise((r) => setTimeout(r, 3000 * t)); }
  }
  throw new Error(`Não foi possível baixar ${URL}: ${erro && erro.message}`);
}

const hojeBR = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
/** Se a série baixada é igual à gravada, mantém a data antiga (nada mudou); se mudou, é a data de hoje (Brasília). */
function dataDaAtualizacao(valores) {
  try { const antigo = JSON.parse(fs.readFileSync(OUT, 'utf8')); if (JSON.stringify(antigo.valores) === JSON.stringify(valores) && antigo.atualizado_em) return antigo.atualizado_em; } catch (e) { /* primeira gravação */ }
  return hojeBR();
}

(async () => {
  const linhas = await baixar();
  if (!Array.isArray(linhas) || !linhas.length) throw new Error('Série vazia');

  const valores = {};
  for (const { data, valor } of linhas) {
    const [, mm, aaaa] = String(data).split('/'); // dd/mm/aaaa
    const v = parseFloat(String(valor).replace(',', '.'));
    if (Number.isFinite(v)) valores[`${aaaa}-${mm}`] = v;
  }
  const meses = Object.keys(valores).sort();
  const ultimo = valores[meses[meses.length - 1]];

  // Travas: nunca sobrescrever com dados parciais ou na unidade errada (% ao ano ≈ 20–60).
  if (meses.length < 200) throw new Error(`Série curta demais (${meses.length} meses) — abortando.`);
  if (!(ultimo > 0.3 && ultimo < 8)) throw new Error(`Último valor (${ultimo}) não parece % ao mês — confira a série ${SERIE_SGS}.`);
  if (meses.some((m) => !(valores[m] > 0 && valores[m] < 20))) throw new Error('Há valores fora do intervalo plausível para % ao mês.');

  const json = {
    serie: SERIE_SGS,
    descricao: 'Taxa média mensal de juros - pessoas físicas - aquisição de veículos (% ao mês)',
    fonte: `Banco Central do Brasil — SGS ${SERIE_SGS}`,
    conferido_em: hojeBR(), // data da última consulta ao BCB que funcionou e trouxe dados (se a consulta falhar, o script sai antes e a anterior fica)
    atualizado_em: dataDaAtualizacao(valores), // data REAL em que a série mudou (a capa mostra "Taxas do Banco Central atualizadas em ...")
    primeiro_mes: meses[0], ultimo_mes: meses[meses.length - 1],
    valores,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(json, null, 1) + '\n');
  console.log(`OK — ${meses.length} meses (${json.primeiro_mes} a ${json.ultimo_mes}); último valor: ${ultimo}% a.m.`);
})().catch((e) => { console.error(e.message); process.exit(1); });
