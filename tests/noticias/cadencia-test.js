// node tests/noticias/cadencia-test.js — guias escritos à mão não adiam o artigo do robô.
const CAD = require('../../scripts/noticias/cadencia');
let ok = 0, bad = 0; const t = (n, c, x = '') => { c ? ok++ : bad++; console.log(c ? 'OK   ' : 'FALHA', n, c ? '' : x); };
const arts = [{ slug: 'g', tipo: 'guia', data: '2026-10-15', fora_da_cadencia: true }, { slug: 'n', tipo: 'noticia', data: '2026-10-14' }, { slug: 'g0', tipo: 'guia', data: '2026-10-02' }];
t('o último artigo é a notícia de 14/10, não o guia manual de 15/10', CAD.maisRecente(arts).slug === 'n');
t('guia manual publicado "hoje" não conta como o artigo do dia', !CAD.temArtigoDe(arts, '2026-10-15') && CAD.temArtigoDe(arts, '2026-10-14'));
t('guia do próprio robô (sem a marca) continua contando', CAD.temArtigoDe([...arts, { slug: 'g2', tipo: 'guia', data: '2026-10-16' }], '2026-10-16'));
const real = require('../../data/articles.json');
t('os 3 guias novos estão marcados e o último artigo real é 14/10 ou mais novo do robô', real.filter((a) => a.fora_da_cadencia).length === 3 && CAD.maisRecente(real).data >= '2026-10-14' && !CAD.maisRecente(real).fora_da_cadencia);
console.log(`${ok} ok, ${bad} falha(s)`); process.exit(bad ? 1 : 0);
