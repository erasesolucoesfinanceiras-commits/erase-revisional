// fetchRetry: repete em erro de rede/429/5xx, não repete em 404. Rodar da raiz: node tests/noticias/retry-test.js
process.env.RETRY_ESCALA = '0.001';
const http = require('http'); const { fetchRetry } = require('../../scripts/retry');
let bad = 0; const t = (n, c) => { if (!c) bad++; console.log(c ? 'OK   ' : 'FALHA', n); };
let n = 0, modo = '';
const srv = http.createServer((q, r) => { n++; const falha = modo === '500' ? n < 3 : modo === '404' ? true : false; r.statusCode = modo === '404' ? 404 : falha ? 500 : 200; r.end('x'); });
srv.listen(0, async () => {
  const u = `http://localhost:${srv.address().port}/`;
  modo = '500'; n = 0; let r = await fetchRetry(u); t('5xx duas vezes e depois ok: devolve 200 na 3ª tentativa', r.status === 200 && n === 3);
  modo = '404'; n = 0; r = await fetchRetry(u); t('404 não repete', r.status === 404 && n === 1);
  modo = '500'; n = 0; r = await fetchRetry(u, {}, { vezes: 2 }); t('esgotou as tentativas: devolve a última resposta (o chamador decide)', r.status === 500 && n === 2);
  srv.close(); let erro = false; try { await fetchRetry(u, {}, { vezes: 2 }); } catch (e) { erro = true; } t('rede fora do ar: lança o erro depois de repetir', erro);
  process.exit(bad ? 1 : 0);
});
