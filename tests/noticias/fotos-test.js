// Testes da escolha/refação de fotos (Pixabay e Gemini simulados). Rodar da raiz: node tests/noticias/fotos-test.js
// (a parte de imagem precisa do pacote sharp: npm i --no-save sharp; sem ele, só essa parte é pulada)
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const ROOT = path.join(__dirname, '..', '..');
let ok = 0, bad = 0; const t = (n, c, x = '') => { c ? ok++ : bad++; console.log(c ? 'OK   ' : 'FALHA', n, c ? '' : x); };
const P = require(path.join(ROOT, 'scripts/photos'));
const hit = (id, tags) => ({ id, tags, largeImageURL: 'u' + id, user: 'u', user_id: 1, pageURL: 'p' + id });

(async () => {
  // ---- escolher
  const deps = (porBusca, visao = async () => ({ ok: true })) => ({ buscar: async (q) => { const h = porBusca[q]; if (h instanceof Error) throw h; return h || []; }, baixar: async (u) => Buffer.from(u), visao });
  let e = await P.escolher({ buscas: ['a', 'b'], categoria: 'revisional', titulo: 'x', deps: deps({ a: [hit(1, 'house, wood, hut'), hit(2, 'calculator, coins')], b: [hit(3, 'car, keys, contract')] }) });
  t('fotos: casinha/calculadora/moedas (sem relação com veículo) são descartadas; vale a de carro/contrato da busca seguinte', e.hit && e.hit.id === 3 && e.meta.consulta === 'b' && /carro|termo|etiquetas/.test(e.meta.porque), JSON.stringify(e.meta || e));
  e = await P.escolher({ buscas: ['a'], categoria: 'revisional', deps: deps({ a: [hit(1, 'man, car, contract, portrait'), hit(2, 'car, documents')] }) });
  t('fotos: foto sem pessoas vem antes da foto com pessoas', e.hit.id === 2);
  e = await P.escolher({ buscas: ['a'], categoria: 'revisional', deps: deps({ a: [hit(1, 'man, car, portrait')] }) });
  t('fotos: com pessoas só quando não há opção (e registra o porquê)', e.hit.id === 1 && /pessoas/.test(e.meta.porque));
  e = await P.escolher({ buscas: ['a'], categoria: 'revisional', deps: deps({ a: [hit(1, 'car, blood'), hit(2, 'car, nude')] }) });
  t('fotos: etiquetas impróprias nunca passam', !e.hit && /nenhuma foto adequada/.test(e.motivo));
  e = await P.escolher({ buscas: ['a'], categoria: 'revisional', deps: deps({ a: [hit(1, 'car, road'), hit(2, 'car, contract')] }, async (b) => (String(b) === 'u1' ? { ok: false, motivo: 'filtro visual: imagem imprópria' } : { ok: true })) });
  t('fotos: o filtro visual reprova e passa para a próxima candidata', e.hit.id === 2 && e.meta.filtro_visual === 'aprovada');
  e = await P.escolher({ buscas: ['a'], usadas: [2], categoria: 'revisional', deps: deps({ a: [hit(2, 'car, contract')] }) });
  t('fotos: foto já usada (inclusive a atual) não é escolhida de novo', !e.hit);
  e = await P.escolher({ buscas: ['a', 'b'], categoria: 'revisional', deps: deps({ a: new Error('Pixabay HTTP 500'), b: new Error('Pixabay HTTP 500') }) });
  t('fotos: todas as buscas falhando = "busca indisponível" (não "sem foto adequada")', /^busca indisponível/.test(e.motivo), e.motivo);
  t('fotos: buscas = termos do artigo primeiro, depois reserva da categoria, sem repetir', JSON.stringify(P.buscasDe(['car keys contract', 'vehicle documents'], 'revisional').slice(0, 3)) === '["car keys contract","vehicle documents","car dealership"]', JSON.stringify(P.buscasDe(['car keys contract'], 'revisional')));

  // ---- processar (modos)
  const lista = () => [{ slug: 'a', categoria: 'revisional', titulo: 'A', foto: { id: 10 }, foto_refazer: true, foto_buscas: ['car keys contract'] }, { slug: 'b', categoria: 'financeiro', titulo: 'B', foto: { id: 11 } }, { slug: 'c', categoria: 'mercado', titulo: 'C' }];
  const logs = []; const logFn = (ev, d) => logs.push([ev, d.slug]);
  P.ultimaEscolha = () => ({ foto_id: 99, porque: 'teste' });
  let l = lista(), chamadas = [];
  let r = await P.processar(l, { modo: 'marcadas' }, async (slug, q, usadas) => { chamadas.push([slug, q, usadas]); return { id: 20 }; }, logFn, () => {});
  t('refazer (marcadas): só o marcado é refeito, a foto antiga entra em "usadas", flag some, foto nova gravada', r.length === 1 && l[0].foto.id === 20 && !l[0].foto_refazer && l[1].foto.id === 11 && !l[2].foto && chamadas[0][2].includes(10) && chamadas[0][1][0] === 'car keys contract', JSON.stringify([r, chamadas]));
  t('refazer: registra "foto_escolhida" no log', logs.some((x) => x[0] === 'foto_escolhida' && x[1] === 'a'));
  l = lista(); r = await P.processar(l, { modo: 'slug', slug: 'b' }, async () => ({ id: 21 }), logFn, () => {});
  t('refazer (slug): troca só o artigo pedido, mesmo sem marca', r.length === 1 && l[1].foto.id === 21 && l[0].foto.id === 10 && l[0].foto_refazer);
  let falhou = false; try { await P.processar(lista(), { modo: 'slug', slug: 'nao-existe' }, async () => null, logFn, () => {}); } catch (x) { falhou = /slug/.test(x.message); }
  t('refazer (slug inexistente): erro claro', falhou);
  l = lista(); let apagados = []; P.motivoDaFalha = () => 'nenhuma foto adequada: x';
  r = await P.processar(l, { modo: 'slug', slug: 'a' }, async () => null, logFn, (a) => apagados.push(a.slug));
  t('refazer sem foto adequada: cai na imagem padrão (foto removida, arquivos apagados, flag limpa) e registra', !l[0].foto && !l[0].foto_refazer && apagados[0] === 'a' && logs.some((x) => x[0] === 'foto_padrao' && x[1] === 'a'));
  l = lista(); P.motivoDaFalha = () => 'busca indisponível: Pixabay HTTP 500'; apagados = [];
  r = await P.processar(l, { modo: 'marcadas' }, async () => null, logFn, (a) => apagados.push(a.slug));
  t('refazer com Pixabay fora do ar: MANTÉM a foto atual (não troca por imagem padrão por causa de pane)', l[0].foto.id === 10 && l[0].foto_refazer && !apagados.length && r[0].resultado === 'mantida');
  l = lista(); P.motivoDaFalha = () => ''; r = await P.processar(l, { modo: 'faltantes' }, async () => ({ id: 30 }), logFn, () => {});
  t('faltantes: só quem não tem foto (comportamento de sempre)', r.length === 1 && l[2].foto.id === 30 && l[0].foto.id === 10);

  // ---- fetchPhoto de ponta a ponta (Pixabay falso + sharp)
  let sharp; try { sharp = require('sharp'); } catch (x) { console.log('PULADO fetchPhoto de ponta a ponta: sharp não instalado (npm i --no-save sharp)'); }
  if (sharp) {
    const img = await sharp({ create: { width: 1300, height: 800, channels: 3, background: '#336699' } }).jpeg().toBuffer();
    const srv = await new Promise((res) => { const s = http.createServer((q, s2) => { if (q.url.startsWith('/img')) { s2.setHeader('content-type', 'image/jpeg'); return s2.end(img); } const porta = s.address().port; const url = new URL(q.url, 'http://x'); const consulta = url.searchParams.get('q'); s2.setHeader('content-type', 'application/json');
      s2.end(JSON.stringify({ hits: consulta === 'car keys contract' ? [{ id: 777, tags: 'car, keys, contract', largeImageURL: `http://localhost:${porta}/img`, user: 'fotografo', user_id: 5, pageURL: 'https://pixabay.com/photos/x-777/' }] : [{ id: 1, tags: 'house, wood', largeImageURL: `http://localhost:${porta}/img`, user: 'z', user_id: 1, pageURL: 'p' }] })); }); s.listen(0, () => res(s)); });
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'foto-'));
     const out = await new Promise((res) => { const pr = require('child_process').spawn('node', ['-e', `process.env.PHOTOS_ROOT=${JSON.stringify(tmp)};` + "const P=require('./scripts/photos');P.fetchPhoto('slug-teste',['house wood','car keys contract'],[],{categoria:'revisional',titulo:'Fraude em financiamento de veículo'}).then(f=>console.log('F '+JSON.stringify({f,e:P.ultimaEscolha()})))"], { cwd: ROOT, env: { ...process.env, PIXABAY_API_KEY: 'k', PIXABAY_BASE: `http://localhost:${srv.address().port}/api/`, GEMINI_API_KEY: '', PHOTOS_ROOT: tmp } }); let so = '', se = ''; pr.stdout.on('data', (d) => (so += d)); pr.stderr.on('data', (d) => (se += d)); pr.on('close', () => res({ stdout: so, stderr: se })); });
    srv.close();
    const m = /F (.*)/.exec(out.stdout || ''); const r2 = m && JSON.parse(m[1]);
    t('fetchPhoto: busca da casinha é descartada, a de carro/contrato vale; crédito do autor e registro do porquê', r2 && r2.f && r2.f.id === 777 && r2.f.autor === 'fotografo' && r2.f.pagina.includes('777') && r2.e.consulta === 'car keys contract' && /etiquetas/.test(r2.e.porque), (out.stdout || '') + (out.stderr || '').slice(-300));
    t('fetchPhoto: grava as 3 versões WebP (480/960/1280)', [480, 960, 1280].every((w) => fs.existsSync(path.join(tmp, 'assets/img/news', `slug-teste-${w}.webp`))));
  }
  // ---- capa: item sem foto usa a foto da categoria; categoria sem foto cai no SVG e é avisada
  {
    const S = require(path.join(ROOT, 'scripts/site')), dir = path.join(ROOT, 'assets/img/cat'), f = path.join(dir, 'economia-960.webp'), existia = fs.existsSync(f);
    const semFoto = () => S.coverImg({ categoria: 'economia', slug: 'x' }, { width: 1, height: 1, sizes: '1px' });
    if (!existia) { t('capa: categoria sem foto cai no SVG e aparece em catSemFoto()', /cover-economia\.svg/.test(semFoto()) && P.catSemFoto().includes('economia')); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(f, ''); }
    t('capa: item sem foto própria usa a foto da categoria (nunca o ícone)', /cat\/economia-960\.webp/.test(semFoto()) && !/\.svg/.test(semFoto()));
    t('capa: foto do artigo que falha ao carregar volta para a foto da categoria', /onerror=.*cat\/economia-960\.webp/.test(S.coverImg({ categoria: 'economia', slug: 'x', foto: { id: 1 } }, { width: 1, height: 1, sizes: '1px' })));
    if (!existia) fs.rmSync(f);
  }
  // ---- notas do Radar: foto própria quando existe; imagem padrão varia entre a foto da categoria e as dos artigos da categoria
  {
    const S = require(path.join(ROOT, 'scripts/site')), tam = { width: 1, height: 1, sizes: '1px' };
    t('radar: nota com foto usa assets/img/news/<id>', /news\/2026-x-960\.webp/.test(S.coverImg({ categoria: 'revisional', slug: '2026-x', foto: { id: 'p1' } }, tam)));
    const srcs = new Set(['a', 'bb', 'ccc', 'dddd', 'eeeee', 'ffffff', 'g7'].map((id) => /src="([^"]+)"/.exec(S.coverImg({ categoria: 'revisional', slug: id }, tam))[1]));
    t('capa: imagem padrão não é sempre a mesma quando a categoria tem fotos de artigos', srcs.size > 1, [...srcs].join(' '));
    t('capa: a escolha da imagem padrão é estável (mesmo id, mesma imagem)', S.coverImg({ categoria: 'revisional', slug: 'a' }, tam) === S.coverImg({ categoria: 'revisional', slug: 'a' }, tam));
  }
  console.log(`${ok} ok, ${bad} falha(s)`); process.exit(bad ? 1 : 0);
})();
