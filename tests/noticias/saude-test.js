// Saúde do sistema no resumo semanal. Rodar da raiz: node tests/noticias/saude-test.js
const { saude, htmlSaude } = require('../../scripts/noticias/saude');
let bad = 0; const t = (n, c, x = '') => { if (!c) bad++; console.log(c ? 'OK   ' : 'FALHA', n, c ? '' : x); };
const ev = [
  { evento: 'publicado', tipo: 'artigo' }, { evento: 'publicado', tipo: 'artigo' }, { evento: 'publicado', tipo: 'nota' },
  { evento: 'foto_escolhida', slug: 'a', fonte: 'Pixabay' }, { evento: 'foto_escolhida', slug: 'b', fonte: 'Unsplash' }, { evento: 'foto_padrao', slug: 'c' },
  { evento: 'foto_padrao', slug: 'd' }, { evento: 'foto_escolhida', slug: 'd', fonte: 'Unsplash' }, // d: caiu na categoria e depois ganhou foto
  { evento: 'erro' }, { evento: 'rodada_falhou' }, { evento: 'gemini', acao: 'espera_e_repete' }, { evento: 'gemini', acao: 'proximo_modelo' }, { evento: 'tema_trocado' },
];
const s = saude(ev);
t('conta só artigos (nota não entra)', s.artigos === 2);
t('fotos: vale a última decisão de cada artigo', s.fotos.pixabay === 1 && s.fotos.unsplash === 2 && s.fotos.categoria === 1, JSON.stringify(s.fotos));
t('falhas e tentativas extras', s.falhas === 2 && s.extras === 3, JSON.stringify(s));
t('semana vazia não quebra', saude([]).artigos === 0 && /Saúde do sistema/.test(htmlSaude(saude([]))));
t('html mostra os números', /1 Pixabay · 2 Unsplash/.test(htmlSaude(s)));
process.exit(bad ? 1 : 0);
