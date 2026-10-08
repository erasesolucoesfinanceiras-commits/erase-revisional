// Temas das notícias automáticas. O slug do tema é o mesmo slug da categoria em data/config.json.
// Veículos (revisional + mercado) saem em ~metade das vezes; os outros 8 temas se revezam na outra metade.
const TEMAS = {
  revisional: { queries: ["juros financiamento veículo revisão contrato", "busca e apreensão financiamento veículo", "seguro prestamista financiamento STJ", "financiamento de moto juros abusivos"], palavras: "financiamento veículo juros revisão STJ prestamista busca apreensão", nome: 'Revisional de juros (veículos)', foco: 'juros de financiamento de carro, moto e máquinas agrícolas, revisão de contrato (revisional), busca e apreensão, seguro prestamista, tarifas e seguros embutidos, decisões do STJ e direitos do consumidor' },
  mercado: { queries: ["lançamento carro novo preço Brasil", "carros elétricos híbridos Brasil vendas", "Fenabrave emplacamentos", "Anfavea produção veículos", "lançamento moto trator colheitadeira"], palavras: "carro moto veículo lançamento elétrico híbrido emplacamentos Fenabrave Anfavea trator", nome: 'Lançamentos e tecnologia (veículos)', foco: 'lançamentos de carros, motos e máquinas agrícolas, preços, elétricos e híbridos, segurança, conectividade e o mercado (Fenabrave, Anfavea, montadoras)' },
  'energia-solar': { queries: ["energia solar financiamento", "geração distribuída regras Aneel", "tarifa de energia elétrica Aneel", "painel solar crédito"], palavras: "solar energia geração distribuída Aneel tarifa fotovoltaic", nome: 'Energia solar', foco: 'mercado de energia solar, regras de geração distribuída, tarifas de energia, financiamento de sistemas solares, crédito negado e como conseguir aprovação' },
  imoveis: { queries: ["financiamento imobiliário juros Caixa", "financiamento habitacional regras", "Minha Casa Minha Vida crédito", "taxa de juros crédito imobiliário"], palavras: "imobiliário habitacional Caixa financiamento moradia", nome: 'Mercado imobiliário', foco: 'financiamento habitacional, juros do crédito imobiliário, programas habitacionais, regras dos bancos e da Caixa, renegociação de financiamento imobiliário' },
  'consorcio-seguros': { queries: ["consórcio regras Banco Central", "seguro financiamento venda casada", "consórcio de veículo", "seguro prestamista"], palavras: "consórcio seguro venda casada Susep", nome: 'Consórcio e seguros', foco: 'consórcio de veículo e de imóvel, seguros embutidos em financiamentos, venda casada, regras da SUSEP e do Banco Central para consórcios' },
  'credito-pessoal': { queries: ["superendividamento renegociação dívidas", "cartão de crédito juros rotativo", "consignado empréstimo regras", "golpe financeiro Pix empréstimo", "score nome sujo Serasa"], palavras: "cartão consignado dívida score renegociação golpe empréstimo rotativo", nome: 'Crédito pessoal e dívidas', foco: 'cartão de crédito, cheque especial, consignado, empréstimo pessoal, score, nome sujo, renegociação de dívidas (Desenrola e semelhantes) e golpes financeiros' },
  'credito-rural': { queries: ["Plano Safra crédito rural juros", "financiamento máquinas agrícolas", "Pronaf crédito", "crédito rural renegociação"], palavras: "Plano Safra rural Pronaf agro agrícola crédito", nome: 'Crédito rural e agronegócio', foco: 'Plano Safra, financiamento de máquinas e insumos agrícolas, juros do crédito rural, Pronaf e regras do Manual de Crédito Rural' },
  'empresas-mei': { queries: ["Pronampe crédito pequenas empresas", "crédito MEI capital de giro", "endividamento empresas inadimplência", "microcrédito empreendedor"], palavras: "MEI Pronampe empresas capital de giro pequenas negócios", nome: 'Empresas e MEI', foco: 'capital de giro, crédito para pequenos negócios e MEI, Pronampe e endividamento empresarial' },
  financeiro: { queries: ["Banco Central nova regra bancos", "Pix novas regras", "tarifas bancárias", "inadimplência juros médios Banco Central", "CMN resolução crédito"], palavras: "Banco Central CMN Pix tarifa inadimplência bancos juros", nome: 'Bancos e sistema financeiro', foco: 'novas regras do Banco Central e do CMN, Pix, tarifas bancárias, juros médios, inadimplência no país' },
  economia: { queries: ["Copom Selic decisão", "inflação IPCA", "Banco Central política monetária crédito", "STJ decisão juros financiamento", "projeto de lei crédito financiamento consumidor"], palavras: "Copom Selic inflação IPCA Banco Central STJ STF crédito", nome: 'Economia e política monetária', foco: 'Copom e Selic, inflação, decisões do Banco Central e do CMN, STJ e STF, leis e projetos no Congresso e medidas do governo sobre crédito e financiamento. Sempre explicar o que isso muda para quem tem ou vai fazer um financiamento' },
};
const VEICULOS = ['revisional', 'mercado'];
const OUTROS = ['energia-solar', 'imoveis', 'consorcio-seguros', 'credito-pessoal', 'credito-rural', 'empresas-mei', 'financeiro', 'economia'];
const TODOS = [...VEICULOS, ...OUTROS]; // ordem da lista: usada para "pular para o próximo tema"

/** Tema da vez: slots pares = veículos (alternando revisional/mercado); ímpares = rodízio dos demais. */
function temaDaVez(slot) {
  return slot % 2 === 0 ? VEICULOS[(slot / 2) % VEICULOS.length] : OUTROS[((slot - 1) / 2) % OUTROS.length];
}
/** Ordem de tentativa: começa no tema da vez e segue a lista; `evitar` (temas já usados hoje) vão para o fim. */
function ordemDeTemas(slot, evitar = []) {
  const i = TODOS.indexOf(temaDaVez(slot));
  const ordem = [...TODOS.slice(i), ...TODOS.slice(0, i)];
  return [...ordem.filter((t) => !evitar.includes(t)), ...ordem.filter((t) => evitar.includes(t))];
}

module.exports = { TEMAS, TODOS, VEICULOS, OUTROS, temaDaVez, ordemDeTemas };
