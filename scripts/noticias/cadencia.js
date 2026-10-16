// Cadência dos artigos (1 a cada 2 dias): só contam os artigos do robô. Guias escritos à mão levam "fora_da_cadencia": true em data/articles.json
// (a data deles é a de publicação real, mas não pode adiar o próximo artigo de notícia).
const contam = (artigos) => artigos.filter((a) => !a.fora_da_cadencia);
const maisRecente = (artigos) => contam(artigos).reduce((m, a) => (!m || a.data > m.data ? a : m), null);
const temArtigoDe = (artigos, dia) => contam(artigos).some((a) => a.data === dia);
module.exports = { contam, maisRecente, temArtigoDe };
