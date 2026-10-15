// node tests/noticias/indexnow-test.js — IndexNow com site e API simulados (sem rede): só envia o que mudou, espera o deploy, nunca quebra.
const fs = require('fs'), os = require('os'), path = require('path');
const { executar, paginas } = require('../../scripts/noticias/indexnow');
let ok = 0, bad = 0; const t = (n, c, x = '') => { c ? ok++ : bad++; console.log(c ? 'OK   ' : 'FALHA', n, c ? '' : x); };
const KEY = '0123456789abcdef0123456789abcdef', SITE = 'https://site.teste';
const art = (slug, cat, extra = {}) => ({ slug, categoria: cat, titulo: 'T ' + slug, resumo: 'r', data: '2026-10-10', corpo: '<p>x</p>', fontes: [], ...extra });
const nota = (id, cat) => ({ id, categoria: cat, titulo: 'N', texto: 't', data: '2026-10-11', fontes: [] });
const dadosBase = () => ({ artigos: [art('a1', 'mercado'), art('a2', 'revisional')], notas: [nota('n1', 'mercado')], cats: ['mercado', 'revisional'] });
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'inow-')), 'estado.json');
// site simulado: `no_ar` = Set de URLs que respondem 200 (com o texto dado); a API guarda o que recebeu
function fake({ noAr, apiStatus = 200 }) {
  const posts = [], gets = [];
  const http = async (url, opts = {}) => {
    if (opts.method === 'POST') { posts.push(JSON.parse(opts.body)); return { status: apiStatus, text: async () => apiStatus === 200 ? '' : 'erro simulado' }; }
    gets.push(url); const corpo = noAr(url);
    return corpo == null ? { status: 404, text: async () => '' } : { status: 200, text: async () => corpo };
  };
  return { http, posts, gets };
}
const tudoNoAr = (d) => (url) => {
  if (url === `${SITE}/${KEY}.txt`) return KEY;
  const p = paginas(d).find((x) => x.url === url.replace(SITE, 'https://revisional.eraseconsulta.com.br')) || paginas(d).find((x) => url.endsWith(new URL(x.url).pathname));
  return p ? `pagina ${p.marca}` : null;
};
const base = (extra = {}) => ({ key: KEY, siteUrl: SITE, tentativas: 3, esperaMs: 0, dorme: async () => {}, ...extra });

(async () => {
  // as URLs reais usam o siteUrl da config; para o teste o site simulado responde a qualquer host
  const respondeTudo = (d) => { const por = new Map(paginas(d).map((p) => [p.url, p])); return (url) => { if (url === `${SITE}/${KEY}.txt`) return KEY; const p = por.get(url); return p ? `ok ${p.marca}` : null; }; };
  const d1 = dadosBase(), f1 = tmp(), logs = [];
  let s = fake({ noAr: respondeTudo(d1) });
  let r = await executar(base({ dados: d1, estadoFile: f1, http: s.http, log: (x) => logs.push(x) }));
  t('1º envio: manda todas as páginas (artigos, capa, /artigos, radar, categorias) em JSON com host, key, keyLocation, urlList', r.resultado === 'enviado' && s.posts.length === 1 && s.posts[0].host === 'site.teste' && s.posts[0].key === KEY && s.posts[0].keyLocation === `${SITE}/${KEY}.txt` && s.posts[0].urlList.length === paginas(d1).length && paginas(d1).length === 2 + 1 + 1 + 1 + 2, JSON.stringify(r));
  s = fake({ noAr: respondeTudo(d1) });
  r = await executar(base({ dados: d1, estadoFile: f1, http: s.http, log: () => {} }));
  t('nada mudou: não reenvia (nem consulta o site)', r.resultado === 'nada_novo' && s.posts.length === 0 && s.gets.length === 0);

  // artigo novo em "revisional": só o artigo, a capa, /artigos, radar? (radar não muda) e a categoria dele
  const d2 = { artigos: [art('a3', 'revisional', { data: '2026-10-12' }), ...d1.artigos], notas: d1.notas, cats: d1.cats };
  s = fake({ noAr: respondeTudo(d2) });
  r = await executar(base({ dados: d2, estadoFile: f1, http: s.http, log: () => {} }));
  const urls2 = (s.posts[0] || { urlList: [] }).urlList.map((u) => new URL(u).pathname).sort();
  t('artigo novo: envia só o artigo novo, a capa, /artigos e a categoria que mudou (não reenvia os outros artigos, radar nem a outra categoria)', JSON.stringify(urls2) === JSON.stringify(['/', '/artigos', '/categoria-revisional', '/noticias/a3']), urls2.join(' '));

  // deploy atrasado: lista no ar ainda sem o artigo novo => fica pendente; no run seguinte envia
  const d3 = { artigos: [art('a4', 'mercado', { data: '2026-10-13' }), ...d2.artigos], notas: d1.notas, cats: d1.cats };
  const velho = respondeTudo(d2), novo = respondeTudo(d3), f3 = f1;
  s = fake({ noAr: (u) => (u === `${SITE}/${KEY}.txt` ? KEY : /a4$/.test(u) ? null : (/\/(artigos|categoria-mercado)?$/.test(new URL(u).pathname) ? velho(u) : novo(u))) });
  let esperas = 0;
  r = await executar(base({ dados: d3, estadoFile: f3, http: s.http, dorme: async () => { esperas++; }, log: (x) => logs.push(x) }));
  t('deploy não pronto: tenta várias vezes, espera entre elas e não envia o que não está no ar (nem o artigo novo)', esperas === 2 && (!s.posts.length || !s.posts[0].urlList.some((u) => /a4$/.test(u))), JSON.stringify({ r, esperas, posts: s.posts }));
  const pend = paginas(d3).filter((p) => lerSig(f3, p.url) !== p.sig).map((p) => new URL(p.url).pathname);
  t('URLs pendentes não são perdidas (seguem sem assinatura gravada)', pend.includes('/noticias/a4'), pend.join(' '));
  s = fake({ noAr: novo });
  r = await executar(base({ dados: d3, estadoFile: f3, http: s.http, log: () => {} }));
  t('próximo run, com o deploy pronto: envia o pendente', r.resultado === 'enviado' && s.posts[0].urlList.some((u) => /noticias\/a4$/.test(u)), JSON.stringify(r));

  // chave não publicada
  const d4 = { ...d3, artigos: [art('a5', 'mercado', { data: '2026-10-14' }), ...d3.artigos] };
  s = fake({ noAr: (u) => (u === `${SITE}/${KEY}.txt` ? null : respondeTudo(d4)(u)) });
  r = await executar(base({ dados: d4, estadoFile: f3, http: s.http, log: () => {} }));
  t('arquivo da chave fora do ar: não envia', r.resultado === 'chave_nao_publicada' && s.posts.length === 0);

  // IndexNow recusa (429/500): registra a resposta, não lança, URLs seguem pendentes
  const lg = [];
  s = fake({ noAr: respondeTudo(d4), apiStatus: 429 });
  r = await executar(base({ dados: d4, estadoFile: f3, http: s.http, log: (x) => lg.push(x) }));
  t('API recusou (429): registra status e resposta no log, sem lançar, e não marca como enviado', r.resultado === 'recusado' && lg[0].status === 429 && /erro simulado/.test(lg[0].resposta) && paginas(d4).some((p) => lerSig(f3, p.url) !== p.sig));
  // rede caindo
  const lg2 = [];
  r = await executar(base({ dados: d4, estadoFile: tmp(), http: async () => { throw new Error('rede fora'); }, log: (x) => lg2.push(x), tentativas: 2 }));
  t('rede fora do ar: não lança, registra no log', ['chave_nao_publicada', 'erro'].includes(r.resultado) && lg2.length === 1);
  r = await executar(base({ dados: d4, estadoFile: tmp(), http: fake({ noAr: respondeTudo(d4) }).http, log: () => { throw new Error('log quebrado'); } }));
  t('até o log falhando não lança', typeof r === 'object');
  r = await executar(base({ key: '', dados: d4, estadoFile: tmp(), http: fake({ noAr: () => null }).http, log: () => {} }));
  t('sem chave configurada: não faz nada', r.resultado === 'sem_chave');

  // arquivo da chave e headers/robots
  const cfg = require('../../data/config.json'), root = path.join(__dirname, '..', '..');
  t('config tem chave de 32 hex e o arquivo <chave>.txt tem só a chave', /^[0-9a-f]{32}$/.test(cfg.indexnowKey) && fs.readFileSync(path.join(root, `${cfg.indexnowKey}.txt`), 'utf8') === cfg.indexnowKey);
  t('robots.txt não bloqueia a chave (Allow: /) e _headers não tem redirecionamento nem noindex para ela', /Allow: \//.test(fs.readFileSync(path.join(root, 'robots.txt'), 'utf8')) && !/Disallow/i.test(fs.readFileSync(path.join(root, 'robots.txt'), 'utf8')) && !fs.existsSync(path.join(root, '_redirects')) && !/noindex[\s\S]*\*\.txt/.test(fs.readFileSync(path.join(root, 'scripts/publish.js'), 'utf8')));
  console.log(`${ok} ok, ${bad} falha(s)`); process.exit(bad ? 1 : 0);
})();
function lerSig(f, url) { try { return JSON.parse(fs.readFileSync(f, 'utf8')).enviados[url]; } catch (e) { return undefined; } }
