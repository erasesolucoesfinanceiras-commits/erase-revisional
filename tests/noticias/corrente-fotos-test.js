// Corrente de fotos (Pixabay -> Unsplash -> foto da categoria), com os dois serviços simulados. Rodar da raiz: node tests/noticias/corrente-fotos-test.js
// Precisa do pacote sharp (npm i --no-save sharp); sem ele o teste é pulado.
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
let sharp; try { sharp = require('sharp'); } catch (e) { console.log('PULADO: sharp não instalado'); process.exit(0); }
let bad = 0; const t = (n, c, x = '') => { if (!c) bad++; console.log(c ? 'OK   ' : 'FALHA', n, c ? '' : x); };
const P = require('../../scripts/photos');
t('termos visuais: inflação/Selic/MEI ganham dinheiro, calculadora e loja pequena', ['ipca inflation', 'selic rate', 'mei small business'].every((q, i) => P.buscasDe(q, 'economia').some((b) => /grocery|coins|calculator|shop|stall/.test(b))));

(async () => {
  const img = await sharp({ create: { width: 1700, height: 900, channels: 3, background: '#336699' } }).jpeg().toBuffer();
  const reg = { dl: 0, pix: 0, uns: 0 }; let pixModo = 'ok';
  const srv = http.createServer((q, r) => {
    const u = new URL(q.url, 'http://x'); const porta = srv.address().port;
    if (u.pathname.startsWith('/img')) { r.setHeader('content-type', 'image/jpeg'); return r.end(img); }
    if (u.pathname.startsWith('/dl')) { reg.dl++; return r.end('{}'); }
    if (u.pathname.startsWith('/pix')) { reg.pix++; if (pixModo === '429') { r.statusCode = 429; return r.end(); } return r.end(JSON.stringify({ hits: pixModo === 'vazio' ? [] : [{ id: 5, tags: 'car, contract', largeImageURL: `http://localhost:${porta}/img`, user: 'pix', user_id: 1, pageURL: 'https://pixabay.com/p5' }] })); }
    reg.uns++;
    r.end(JSON.stringify({ results: [
      { id: 'logo1', width: 3000, height: 2000, alt_description: 'car with logo on door', tags: [{ title: 'car' }], urls: { raw: `http://localhost:${porta}/img?x=1` }, user: { name: 'A', links: { html: 'https://unsplash.com/@a' } }, links: { html: 'https://unsplash.com/photos/logo1', download_location: `http://localhost:${porta}/dl1` } },
      { id: 'ok2', width: 3000, height: 2000, alt_description: 'car keys and contract on desk', tags: [{ title: 'car' }], urls: { raw: `http://localhost:${porta}/img?x=1` }, user: { name: 'Beto', links: { html: 'https://unsplash.com/@beto' } }, links: { html: 'https://unsplash.com/photos/ok2', download_location: `http://localhost:${porta}/dl2` } }] }));
  });
  await new Promise((r) => srv.listen(0, r)); const porta = srv.address().port;
  const rodar = async (env, usadas = []) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'corr-'));
    Object.assign(process.env, { PHOTOS_ROOT: tmp, PIXABAY_BASE: `http://localhost:${porta}/pix`, UNSPLASH_BASE: `http://localhost:${porta}`, ...env });
    for (const k of ['PIXABAY_API_KEY', 'UNSPLASH_ACCESS_KEY']) if (!(k in env)) delete process.env[k];
    delete require.cache[require.resolve('../../scripts/photos')]; const Q = require('../../scripts/photos');
    const f = await Q.fetchPhoto('s', 'car contract', usadas, { categoria: 'revisional', titulo: 'x' });
    return { f, tmp, motivo: Q.motivoDaFalha() };
  };
  const ambas = { PIXABAY_API_KEY: 'k', UNSPLASH_ACCESS_KEY: 'k' };
  let r = await rodar(ambas);
  t('Pixabay acha: usa o Pixabay e nem chama o Unsplash', r.f && r.f.fonte === 'Pixabay' && !reg.uns);
  pixModo = '429'; r = await rodar(ambas);
  t('Pixabay no limite (429): cai no Unsplash, descarta a foto com logo no texto, credita autor com utm e avisa o download', r.f && r.f.fonte === 'Unsplash' && r.f.id === 'u-ok2' && /unsplash\.com\/@beto\?utm_source/.test(r.f.autorUrl) && /photos\/ok2\?utm_source/.test(r.f.pagina) && reg.dl === 1, JSON.stringify(r.f));
  t('Unsplash grava as 3 versões WebP', [480, 960, 1280].every((w) => fs.existsSync(path.join(r.tmp, 'assets/img/news', `s-${w}.webp`))));
  pixModo = 'vazio'; r = await rodar(ambas);
  t('Pixabay sem nada relevante: também cai no Unsplash', r.f && r.f.fonte === 'Unsplash');
  pixModo = 'ok'; r = await rodar(ambas, [5]);
  t('foto já usada em outro artigo não se repete (vai para a próxima fonte)', r.f && r.f.fonte === 'Unsplash');
  r = await rodar(ambas, [5, 'u-ok2']);
  t('tudo esgotado: devolve null (o site usa a foto da categoria) e explica o motivo', r.f === null && /Pixabay/.test(r.motivo) && /Unsplash/.test(r.motivo), r.motivo);
  pixModo = '429'; r = await rodar({ PIXABAY_API_KEY: 'k' });
  t('só Pixabay e ele fora do ar: null com "busca indisponível" (quem refaz mantém a foto atual)', r.f === null && /^busca indisponível/.test(r.motivo), r.motivo);
  r = await rodar({});
  t('sem nenhuma chave: null, sem quebrar', r.f === null);
  srv.close(); process.exit(bad ? 1 : 0);
})();
