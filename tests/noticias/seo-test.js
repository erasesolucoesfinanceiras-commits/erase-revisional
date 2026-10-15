// node tests/noticias/seo-test.js — SEO: títulos/descrições, imagens de prévia leves, dados estruturados, alt, fonte própria, cache, guias e llms.txt.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const S = require(path.join(ROOT, 'scripts/site'));
let ok = 0, bad = 0; const t = (n, c, x = '') => { c ? ok++ : bad++; console.log(c ? 'OK   ' : 'FALHA', n, c ? '' : x); };
const ler = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const paginas = [...fs.readdirSync(ROOT).filter((f) => f.endsWith('.html') && f !== '404.html'), ...fs.readdirSync(path.join(ROOT, 'noticias')).map((f) => 'noticias/' + f)];
const meta = (h, re) => (re.exec(h) || [])[1] || '';

const longos = [], curtas = [];
for (const f of paginas) { const h = ler(f); const ti = meta(h, /<title>(.*?)<\/title>/), de = meta(h, /name="description" content="(.*?)"/); if (ti.length > 62) longos.push(`${f}:${ti.length}`); if (de.length < 70 || de.length > 160) curtas.push(`${f}:${de.length}`); }
t('títulos de até ~60 caracteres em todas as páginas', !longos.length, longos.join(' '));
t('descrições entre 70 e 160 caracteres em todas as páginas', !curtas.length, curtas.join(' '));
t('tituloSeo: corta em pausa natural ou palavra inteira, sem terminar em conector', S.tituloSeo('Juros acima da média são abusivos? O que diz o STJ sobre o tema agora') === 'Juros acima da média são abusivos?' && S.tituloSeo('Título curto') === 'Título curto' && !/\s(de|da|do|e|em|com|que)$/i.test(S.tituloSeo('PF apura fraude em financiamentos veiculares com uso de biometria em Minas Gerais e mais coisas')));
t('descSeo: até 160 caracteres', S.descSeo('palavra '.repeat(60)).length <= 161 && S.descSeo('curta') === 'curta');

// imagens de prévia
const og = fs.readdirSync(path.join(ROOT, 'assets/img')).filter((f) => /^og-.*\.jpg$/.test(f)).map((f) => 'assets/img/' + f).concat(fs.existsSync(path.join(ROOT, 'assets/img/og')) ? fs.readdirSync(path.join(ROOT, 'assets/img/og')).map((f) => 'assets/img/og/' + f) : []);
const pesadas = og.filter((f) => fs.statSync(path.join(ROOT, f)).size >= 150 * 1024);
t('imagens de prévia são JPG com menos de 150 KB', og.length >= 11 && !pesadas.length && og.every((f) => fs.readFileSync(path.join(ROOT, f)).slice(0, 2).toString('hex') === 'ffd8'), pesadas.join(' '));
const arts = JSON.parse(ler('data/articles.json'));
const comFoto = arts.filter((a) => a.foto);
t('artigo com foto usa og/<slug>.jpg (foto real) no og:image e no JSON-LD; sem foto, a imagem da categoria', comFoto.every((a) => { const h = ler(`noticias/${a.slug}.html`), u = `/assets/img/og/${a.slug}.jpg`; return h.includes(`og:image" content="https://revisional.eraseconsulta.com.br${u}`) && h.includes(`"image":["https://revisional.eraseconsulta.com.br${u}"]`) && fs.existsSync(path.join(ROOT, u.slice(1))); }) && arts.filter((a) => !a.foto).every((a) => ler(`noticias/${a.slug}.html`).includes(`/assets/img/og-article-${a.categoria}.jpg`)));
t('foto principal do artigo tem alt descritivo (o título)', arts.every((a) => ler(`noticias/${a.slug}.html`).includes(`class="article-cover" alt="${S.esc(a.titulo)}"`)));

// dados estruturados da capa
const home = ler('index.html'), ld = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/s.exec(home)[1]);
const g = ld['@graph'] || [];
t('capa: JSON-LD com Organization (nome, url, logo) e WebSite', g.some((x) => x['@type'] === 'Organization' && x.name && x.url && x.logo) && g.some((x) => x['@type'] === 'WebSite' && x.name && x.url), JSON.stringify(ld).slice(0, 200));
t('JSON-LD da capa sem e-mail, telefone ou endereço', !/telephone|email|address/i.test(JSON.stringify(ld)));

// fonte própria e cache
t('fonte Inter hospedada no site: sem pedidos ao Google Fonts em nenhuma página, com preload', paginas.every((f) => !/fonts\.(googleapis|gstatic)\.com/.test(ler(f))) && home.includes('rel="preload" href="/assets/fonts/inter-latin.woff2"') && fs.statSync(path.join(ROOT, 'assets/fonts/inter-latin.woff2')).size > 10000 && /@font-face[^}]*inter-latin\.woff2/.test(ler('assets/css/style.css')));
const pub = ler('scripts/publish.js');
t('cache: CSS, JS e fonte por 1 ano (immutable); imagens 7 dias; sem regra /assets/* sobreposta', ['/assets/css/*', '/assets/js/*', '/assets/fonts/*'].every((p) => new RegExp(p.replace('*', '\\*') + '\\n\\s+Cache-Control: public, max-age=31536000, immutable').test(pub)) && /\/assets\/img\/\*\n\s+Cache-Control: public, max-age=604800/.test(pub) && !/^\/assets\/\*$/m.test(pub) && /font-src 'self'/.test(pub));

// guias novos e llms.txt
const guias = (S.config.guiasDaCapa || []).map((s) => arts.find((a) => a.slug === s));
const palavras = (a) => a.corpo.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
t('3 guias novos (busca e apreensão, seguro prestamista, juros abusivos): tipo guia, fontes oficiais, 500 a 900 palavras', guias.length === 3 && guias.every((a) => a && a.tipo === 'guia' && a.fontes.length >= 2 && a.fontes.every((f) => /^https:\/\/[^/]*\.(gov\.br|jus\.br)\//.test(f.url)) && palavras(a) >= 500 && palavras(a) <= 900) && /busca-e-apreensao/.test(guias[0].slug) && /prestamista/.test(guias[1].slug) && /juros-abusivos/.test(guias[2].slug), guias.map((a) => a && palavras(a)).join(','));
const tx = (a) => a.corpo.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
t('guia busca e apreensão: 5 dias para pagar a INTEGRALIDADE (vencidas e vincendas, Tema 722); mora por carta ao endereço do contrato (Tema 1132), carta não recebida não anula; Lei 14.711/2023 (extrajudicial, cartório, sem processo)',
  /integralidade da dívida/.test(tx(guias[0])) && /vincendas/.test(tx(guias[0])) && /Tema 722/.test(tx(guias[0])) && /Tema 1132/.test(tx(guias[0])) && /endereço indicado no contrato/.test(tx(guias[0])) && /não ter recebido a notificação, por si só, não impede nem anula/.test(tx(guias[0])) && /Lei 14\.711\/2023/.test(tx(guias[0])) && /extrajudicial/.test(tx(guias[0])) && /cartório/.test(tx(guias[0])) && /sem processo judicial/.test(tx(guias[0])) && guias[0].fontes.some((f) => /l14711/.test(f.url)) && guias[0].fontes.some((f) => /cod_tema_inicial=1132/.test(f.url)) && guias[0].fontes.some((f) => /cod_tema_inicial=722/.test(f.url)));
t('guia juros abusivos: Súmula 382 (12% ao ano não é abusivo por si só), referência = muito acima da média do Banco Central na mesma operação e época, sem prometer vitória',
  /Súmula 382/.test(tx(guias[2])) && /12% ao ano não são abusivos por si só/.test(tx(guias[2])) && /muito acima da média para a mesma operação e na mesma época/.test(tx(guias[2])) && /nem mesmo estar muito acima garante um resultado favorável/.test(tx(guias[2])) && !/(vai|vão|pode) (ganhar|vencer)|ação ganha|garantid/i.test(tx(guias[2])));
t('capa cita os 3 guias (seção "Guias para entender o seu contrato") e as palavras-chave no texto de abertura', guias.every((a) => home.includes(`/noticias/${a.slug}`)) && /busca e apreensão/.test(home) && /seguro prestamista/.test(home));
const llms = ler('llms.txt');
t('llms.txt: Sobre, Como produzimos, categorias e guias; sem a cidade', ['/sobre', '/como-produzimos', '/categoria-revisional', 'busca-e-apreensao', 'prestamista', 'juros abusivos'].every((x) => llms.includes(x)) && !/Lagoa dos Gatos/.test(llms));
const robots = ler('robots.txt');
t('robots.txt libera o site, aponta o sitemap e a chave do IndexNow não é bloqueada', /Allow: \//.test(robots) && !/Disallow/.test(robots) && /Sitemap: https:\/\/revisional\.eraseconsulta\.com\.br\/sitemap\.xml/.test(robots));
console.log(`${ok} ok, ${bad} falha(s)`); process.exit(bad ? 1 : 0);
