// Auditoria da matemática da calculadora contra a Calculadora do Cidadão do Banco Central
// (Financiamento com prestações fixas — Tabela Price). Testa o CÓDIGO REAL de assets/js/calculator.js.
//   node --test tests/calculadora/price.test.js
// Tolerâncias: R$ 0,05 na prestação e 0,01 ponto percentual na taxa.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'calculator.js'), 'utf8');
const trecho = src.slice(src.indexOf('function pmtPrice'), src.indexOf('// ---- Formatação'));
const ctx = {};
vm.runInNewContext(`${trecho};this.pmtPrice=pmtPrice;this.resolverTaxa=resolverTaxa;`, ctx);
const { pmtPrice, resolverTaxa } = ctx;

const TOL_REAIS = 0.05, TOL_PP = 0.01;
const perto = (obtido, esperado, tol, rotulo) => assert.ok(Math.abs(obtido - esperado) <= tol, `${rotulo}: obtido ${obtido.toFixed(4)}, esperado ${esperado} (tolerância ${tol})`);

// Referência da Calculadora do Cidadão: prestação com 1ª parcela no fim do mês 1 e "no ato"
const PRESTACAO = [
  { pv: 50000, i: 1.99, n: 48, pmt: 1626.78, noAto: 1595.04 },
  { pv: 30000, i: 2.49, n: 36, pmt: 1271.58, noAto: 1240.68 },
  { pv: 80000, i: 1.49, n: 60, pmt: 2026.26, noAto: 1996.51 },
];
const TAXA = [
  { pv: 50000, parcela: 1650, n: 48, taxa: 2.0598 },
  { pv: 30000, parcela: 1300, n: 36, taxa: 2.6334 },
  { pv: 80000, parcela: 1900, n: 60, taxa: 1.2437 },
];

for (const c of PRESTACAO) {
  test(`prestação Price: PV ${c.pv}, ${c.i}% a.m., ${c.n}x = ${c.pmt}`, () => perto(pmtPrice(c.pv, c.i / 100, c.n), c.pmt, TOL_REAIS, 'prestação'));
}
for (const c of TAXA) {
  test(`taxa real a partir da parcela: PV ${c.pv}, parcela ${c.parcela}, ${c.n}x = ${c.taxa}% a.m.`, () => perto(resolverTaxa(c.pv, c.parcela, c.n) * 100, c.taxa, TOL_PP, 'taxa'));
}
test('ida e volta: a taxa encontrada reproduz a parcela informada', () => {
  for (const c of TAXA) perto(pmtPrice(c.pv, resolverTaxa(c.pv, c.parcela, c.n), c.n), c.parcela, 0.005, 'parcela');
});
test('sem juros (parcela × prazo ≤ valor financiado) não devolve taxa', () => assert.strictEqual(resolverTaxa(10000, 200, 48), null));

// 1ª parcela NO ATO: a calculadora do portal NÃO tem essa opção (hoje trata sempre a 1ª parcela 1 mês depois).
// Marcados como "todo": documentam a divergência sem derrubar a suíte. Quando houver suporte, remova o `todo`.
const noAto = typeof ctx.pmtPrecoNoAto === 'function' ? ctx.pmtPrecoNoAto : null;
for (const c of PRESTACAO) {
  test(`prestação com 1ª parcela no ato: PV ${c.pv}, ${c.i}% a.m., ${c.n}x = ${c.noAto}`, { todo: 'o portal ainda não calcula 1ª parcela no ato' }, () => {
    assert.ok(noAto, 'função de 1ª parcela no ato não existe em assets/js/calculator.js');
    perto(noAto(c.pv, c.i / 100, c.n), c.noAto, TOL_REAIS, 'prestação no ato');
  });
}

// Referência de mercado: série SGS 25471 (taxa média mensal, PF, aquisição de veículos) do Banco Central
test('série do Banco Central: SGS 25471, mensal, valores plausíveis', () => {
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'data', 'bcb-veiculos.json'), 'utf8'));
  assert.strictEqual(j.serie, 25471);
  assert.match(j.ultimo_mes, /^\d{4}-\d{2}$/);
  assert.ok(j.valores[j.ultimo_mes] > 0.3 && j.valores[j.ultimo_mes] < 8, 'último valor fora do intervalo de % ao mês');
  assert.ok(Object.keys(j.valores).length >= 200, 'série curta demais');
});
