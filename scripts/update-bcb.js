#!/usr/bin/env node
// Baixa a série histórica MENSAL de taxa média de juros do Banco Central (SGS) e grava
// assets/data/bcb-veiculos.json, usado pela calculadora para comparar a taxa do contrato
// com a média do mês em que ele foi assinado.
//   node scripts/update-bcb.js
//
// ATENÇÃO — confirmar antes do primeiro uso: o código da série abaixo precisa ser conferido
// no portal SGS (https://www3.bcb.gov.br/sgspub) como "Taxa média mensal de juros das operações
// de crédito com recursos livres - Pessoas físicas - Aquisição de veículos" (% a.m.).
const fs = require('fs');
const path = require('path');

const SERIE_SGS = Number(process.env.BCB_SERIE || 20749); // a confirmar (ver comentário acima)
const OUT = path.join(__dirname, '..', 'assets', 'data', 'bcb-veiculos.json');

(async () => {
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${SERIE_SGS}/dados?formato=json`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`BCB HTTP ${res.status} em ${url}`);
  const linhas = await res.json();
  if (!Array.isArray(linhas) || !linhas.length) throw new Error('Série vazia');

  const valores = {};
  for (const { data, valor } of linhas) {
    const [, mm, aaaa] = data.split('/'); // dd/mm/aaaa
    const v = parseFloat(String(valor).replace(',', '.'));
    if (Number.isFinite(v)) valores[`${aaaa}-${mm}`] = v;
  }
  const meses = Object.keys(valores).sort();
  const json = {
    serie: SERIE_SGS,
    descricao: 'Taxa média mensal de juros - crédito livre - pessoas físicas - aquisição de veículos (% a.m.)',
    fonte: `Banco Central do Brasil — SGS ${SERIE_SGS}`,
    primeiro_mes: meses[0], ultimo_mes: meses[meses.length - 1],
    valores,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(json, null, 1) + '\n');
  console.log(`OK — ${meses.length} meses (${json.primeiro_mes} a ${json.ultimo_mes}); último valor: ${valores[json.ultimo_mes]}% a.m.`);
})().catch((e) => { console.error(e.message); process.exit(1); });
