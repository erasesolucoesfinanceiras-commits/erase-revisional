// node tests/noticias/rodizio-test.js — categorias vazias vão primeiro; sem vazias o rodízio fica como era.
const assert = require('assert');
const { ordemDeTemas, vazias, TODOS } = require('../../scripts/noticias/temas');
const sem = ordemDeTemas(5, ['mercado']);
assert.deepStrictEqual(ordemDeTemas(5, ['mercado'], []), sem, 'sem vazias nada muda');
const v = vazias([{ categoria: 'revisional' }], [{ categoria: 'mercado' }]);
assert(!v.includes('revisional') && !v.includes('mercado') && v.length === TODOS.length - 2, 'vazia = sem artigo e sem nota');
const o = ordemDeTemas(5, ['imoveis'], ['credito-rural', 'imoveis', 'empresas-mei']);
assert.deepStrictEqual(o.slice(0, 2), ['credito-rural', 'empresas-mei'], 'vazias primeiro');
assert.strictEqual(o[o.length - 1], 'imoveis', 'tema já usado hoje vai para o fim');
assert.strictEqual(new Set(o).size, TODOS.length, 'todos os temas continuam na lista, sem repetir');
console.log('OK rodizio');
