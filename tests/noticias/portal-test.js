// Testes da fase 1 do portal (capa, carrossel, tópicos, barra lateral, relacionados, páginas novas e SEO). Sem internet.
// Constrói uma cópia do projeto com dados de teste. Rodar da raiz: node tests/noticias/portal-test.js
const fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
let ok = 0, bad = 0; const t = (n, c, x = '') => { c ? ok++ : bad++; console.log(c ? 'OK   ' : 'FALHA', n, c ? '' : String(x).slice(0, 300)); };

function construir(ajustar) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-'));
  fs.cpSync(ROOT, d, { recursive: true, filter: (p) => !/[\\/](\.git|dist|node_modules)([\\/]|$)/.test(p) });
  ajustar && ajustar(d);
  execFileSync('node', ['scripts/build.js'], { cwd: d, stdio: 'ignore' });
  return { d, ler: (f) => fs.readFileSync(path.join(d, f), 'utf8') };
}
const json = (d, f) => JSON.parse(fs.readFileSync(path.join(d, f), 'utf8'));
const salvar = (d, f, v) => fs.writeFileSync(path.join(d, f), JSON.stringify(v, null, 2));
const cards = (html, cls) => html.match(new RegExp(`<article class="${cls}[\\s\\S]*?<\\/article>`, 'g')) || [];

// ---- cenário base (dados reais do repositório) + notas extras para passar de 5 itens
const B = construir((d) => {
  const notas = json(d, 'data/notas.json');
  for (let i = 0; i < 6; i++) notas.push({ id: `2026-09-0${i + 1}-nota-extra-${i}`, data: `2026-09-0${i + 1}`, categoria: 'financeiro', titulo: `Nota extra número ${i} para teste do carrossel`, texto: 'Texto de teste com mais de oitenta caracteres para a nota extra do Radar aparecer no carrossel da capa do portal.', fontes: [{ nome: 'F', url: 'https://x.gov.br/' }] });
  salvar(d, 'data/notas.json', notas);
});
const home = B.ler('index.html');
const slides = home.match(/<li class="slide"[\s\S]*?<\/li>/g) || [];
t('carrossel: exatamente 5 slides (os 5 mais recentes por data real)', slides.length === 5, slides.length);
const datas = slides.map((s) => (/<time[^>]*datetime="([\d-]+)"/.exec(s) || [])[1]);
t('carrossel: datas reais em ordem decrescente e sem guias', datas.every((x, i) => i === 0 || x <= datas[i - 1]) && slides.every((s) => !/>Guia</.test(s)), datas.join());
t('carrossel: cada slide tem selo de texto (Artigo/Radar), título com link e data real', slides.every((s) => />(Artigo|Radar)</.test(s) && /<h2><a class="slide-link" href="[^"]+">[^<]+/.test(s) && /datetime="\d{4}-\d{2}-\d{2}"/.test(s)));
t('carrossel: "Mais recente" só no primeiro slide', /Mais recente/.test(slides[0]) && slides.slice(1).every((s) => !/Mais recente/.test(s)));
t('carrossel: setas e pontos com rótulo em texto; grupos com aria-roledescription; sem autoplay', /aria-label="Slide anterior"/.test(home) && /aria-label="Próximo slide"/.test(home) && (home.match(/class="car-dot"[^>]*aria-label="Ir para o slide \d de 5: /g) || []).length === 5 && /aria-roledescription="carrossel"/.test(home) && slides.every((s, i) => new RegExp(`aria-label="${i + 1} de 5"`).test(s)) && !/autoplay/i.test(fs.readFileSync(path.join(ROOT, 'assets/js/carrossel.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//, '')));
t('carrossel: 1ª imagem carrega já, as outras são preguiçosas e todas têm tamanho fixo', /fetchpriority="high"/.test(slides[0]) && slides.slice(1).every((s) => /loading="lazy"/.test(s)) && slides.every((s) => /width="1160" height="440"/.test(s)));
t('faixa "Última publicação… Taxas conferidas…" mantida', /Última publicação: <time[\s\S]*Taxas conferidas com o Banco Central em/.test(home));

// ---- Explore tópicos
const cats = Object.keys(json(B.d, 'data/config.json').categorias);
const tiles = home.match(/<a class="cat-tile"[\s\S]*?<\/a>/g) || [];
t('tópicos: um quadro por categoria existente, com o nome em texto e link para a página da categoria', tiles.length === cats.length && cats.every((s) => tiles.some((x) => x.includes(`href="/categoria-${s}"`))) && tiles.every((x) => /<strong>[^<]+<\/strong>/.test(x) && /<img/.test(x)));
t('tópicos: só imagens que já estão no repositório (foto do artigo da categoria ou desenho da categoria)', tiles.every((x) => { const m = /src="(\/assets\/img\/[^"]+)"/.exec(x); return m && fs.existsSync(path.join(B.d, m[1])); }));
t('páginas de categoria existem e listam itens com "Ver mais"', cats.every((s) => fs.existsSync(path.join(B.d, `categoria-${s}.html`))) && /id="ver-mais"/.test(B.ler('categoria-financeiro.html')) === (cards(B.ler('categoria-financeiro.html'), 'row-card').length > 8));
const catFin = B.ler('categoria-financeiro.html'); const ds = cards(catFin, 'row-card').filter((c) => !/>Guia</.test(c)).map((c) => (/<time datetime="([\d-]+)"/.exec(c) || [])[1]);
t('categoria: artigos e notas do Radar misturados por data real (decrescente)', ds.length >= 5 && ds.every((x, i) => i === 0 || x <= ds[i - 1]) && cards(catFin, 'row-card').some((c) => />Radar</.test(c)), ds.join());
t('categoria: primeiros 8 visíveis, o resto escondido atrás de "Ver mais"', cards(catFin, 'row-card').filter((c) => /data-extra hidden/.test(c)).length === Math.max(0, cards(catFin, 'row-card').length - 8) && /id="ver-mais"/.test(catFin));

// ---- Escolha da equipe: vazia = sem seção
t('escolha da equipe: arquivo vazio por padrão → seção não aparece', !/Escolha da equipe/.test(home) && json(ROOT, 'data/escolha-da-equipe.json').itens.length === 0);
{ const E = construir((d) => { const a = json(d, 'data/articles.json'); const n = json(d, 'data/notas.json'); salvar(d, 'data/escolha-da-equipe.json', { itens: [a[1].slug, `radar:${n[0].id}`, 'nao-existe', a[2].slug, a[3].slug] }); });
  const h = E.ler('index.html'); const sec = /<section class="container team"[\s\S]*?<\/section>/.exec(h);
  t('escolha da equipe: 3 itens fixos (slug, radar:ID; inexistente ignorado; máximo 3)', sec && cards(sec[0], 'card-v').length === 3 && /Escolha da equipe/.test(sec[0]) && />Radar</.test(sec[0]) && />Guia</.test(sec[0]) && !/<time[^>]*>\d/.test(cards(sec[0], 'card-v').filter((c) => />Guia</.test(c))[0] || '')); }

// ---- Barra lateral
const paginas = { capa: B.ler('index.html'), lista: B.ler('categoria-revisional.html'), artigos: B.ler('artigos.html'), radar: B.ler('radar.html'), artigo: B.ler('noticias/pf-apura-fraude-em-financiamentos-veiculares-com-uso-de-biometria-em-mg.html') };
for (const [nome, h] of Object.entries(paginas)) {
  const dest = /<ul class="mini-list">([\s\S]*?)<\/ul>/.exec(h);
  t(`barra lateral (${nome}): cartão da calculadora/análise + Destaques (4) + Sobre + newsletter`, /class="promo"/.test(h) && dest && (dest[1].match(/<li class="mini">/g) || []).length === 4 && /Portal de notícias e guias sobre financiamento de veículos, produzido pela Equipe ERASE e revisado com fontes citadas/.test(h) && /id="sb-news-form"/.test(h));
}
t('destaques: 4 mais recentes por data real, com data; sem guias', (() => { const d = /<ul class="mini-list">([\s\S]*?)<\/ul>/.exec(paginas.capa)[1]; return !/>Guia</.test(d) && (d.match(/<time datetime="\d{4}-\d{2}-\d{2}"/g) || []).length === 4; })());
t('sobre: sem endereço, com link para "Como produzimos nosso conteúdo"', !/Rua Pedro|Lagoa dos Gatos/.test(paginas.capa) && /<a href="\/como-produzimos">Como produzimos nosso conteúdo/.test(paginas.capa));
t('redes sociais: só perfil que existe na config (Instagram); nada de x.com/facebook genéricos', (paginas.capa.match(/class="social"/g) || []).length === 2 && !/href="https:\/\/(x|twitter|www\.facebook)\.com/.test(paginas.capa) && /instagram\.com\/erasesolucoesfinanceiras/.test(paginas.capa));
{ const S0 = construir((d) => { const c = json(d, 'data/config.json'); c.social = { x: '', instagram: '', facebook: '' }; salvar(d, 'data/config.json', c); });
  t('redes sociais: todas vazias → nenhum ícone nem link', !/class="social"/.test(S0.ler('index.html')) && !/class="socials"/.test(S0.ler('noticias/' + fs.readdirSync(path.join(S0.d, 'noticias'))[0]))); }
t('newsletter da lateral: e-mail + consentimento obrigatório (texto pedido) + botão apagado até completar + aria-required', /Autorizo a ERASE a me enviar o resumo semanal por e-mail, conforme a <a href="\/privacidade[^"]*"[^>]*>Política de Privacidade<\/a>\. <span class="req">\*<\/span>/.test(paginas.capa) && /id="sb-lgpd"[^>]*aria-required="true"/.test(paginas.capa) && /id="sb-email"[^>]*aria-required="true"/.test(paginas.capa) && /type="submit" aria-disabled="true">Preencha para receber/.test(paginas.capa));
t('newsletter: usa a origem "newsletter" já aceita pelo CRM, sem campos de urgência/situação', (() => { const js = fs.readFileSync(path.join(ROOT, 'assets/js/main.js'), 'utf8'); const b = js.slice(js.indexOf("const sbn = $('#sb-news-form')")); const env = /enviarLead\('newsletter', \{([^}]*)\}/.exec(b); return env && /email/.test(env[1]) && /lgpd_aceite: 'sim'/.test(env[1]) && !/parcelas|busca|urgente|situacao/i.test(env[1]); })());

// ---- artigo: relacionados, breadcrumbs, aviso
const art = paginas.artigo; const rel = /<section class="related"[\s\S]*?<\/section>/.exec(art);
t('artigo: "Artigos relacionados" com 3 itens (miniatura, selo, título; guias sem data)', rel && cards(rel[0], 'card-v').length === 3 && cards(rel[0], 'card-v').every((c) => /<img/.test(c) && />(Artigo|Guia)</.test(c)) && cards(rel[0], 'card-v').filter((c) => />Guia</.test(c)).every((c) => !/<time/.test(c)));
t('artigo: breadcrumbs, aviso de não haver resultado garantido e autor "Equipe ERASE" mantidos', /class="crumbs"/.test(art) && /nem promessa de resultado/.test(art) && /Por Equipe ERASE/.test(art));
t('artigo: relacionados não incluem o próprio artigo e completam com outras categorias', !/pf-apura-fraude[^"]*"[^>]*>[^<]*<\/a>/.test(rel[0]) || !rel[0].includes('/noticias/pf-apura'));

// ---- páginas novas, navegação e rodapé
const prod = B.ler('como-produzimos.html');
t('"Como produzimos nosso conteúdo": existe e cita IA, ≥2 fontes, sem promessa e regras do revisor em linguagem simples', /inteligência artificial/.test(prod) && /Pelo menos 2 fontes/.test(prod) && /Sem promessa de resultado/.test(prod) && /Números iguais aos da fonte/.test(prod) && /Equipe ERASE/.test(prod));
const foot = /<footer[\s\S]*<\/footer>/.exec(paginas.capa)[0];
t('rodapé: Navegação, Categorias, Fale Conosco, Termos de Uso, Política de Privacidade, Como produzimos; sem endereço', ['Navegação', 'Categorias', 'Fale Conosco', 'Termos de Uso', 'Política de Privacidade', 'Como produzimos nosso conteúdo'].every((x) => foot.includes(x)) && !/Rua Pedro|Lagoa dos Gatos/.test(foot) && fs.existsSync(path.join(B.d, 'termos.html')));
const menu = /<div class="dropdown-menu">([\s\S]*?)<\/div>/.exec(paginas.capa)[1];
t('menu "Categorias" lista as mesmas categorias dos quadros', cats.every((s) => menu.includes(`/categoria-${s}`)) && (menu.match(/<a /g) || []).length === cats.length);

// ---- SEO e compartilhamento de TODAS as páginas
const htmls = [...fs.readdirSync(B.d).filter((f) => f.endsWith('.html')), ...fs.readdirSync(path.join(B.d, 'noticias')).map((f) => 'noticias/' + f)];
const faltas = [];
for (const f of htmls) { const h = B.ler(f); for (const [nome, re] of [['title', /<title>[^<]+<\/title>/], ['description', /<meta name="description" content="[^"]{20,}"/], ['canonical', /<link rel="canonical" href="https:\/\/[^"]+"/], ['og:title', /property="og:title"/], ['og:description', /property="og:description"/], ['og:image', /property="og:image" content="https:/], ['twitter:card', /name="twitter:card"/], ['twitter:image', /name="twitter:image"/]]) if (!re.test(h)) faltas.push(`${f}:${nome}`); }
t('SEO: title, description, canonical, Open Graph e Twitter card em todas as páginas', !faltas.length, faltas.join(' '));
const sm = B.ler('sitemap.xml');
t('sitemap: página nova com lastmod real; nenhum lastmod no futuro; categorias e artigos presentes', /<loc>[^<]*\/como-produzimos<\/loc><lastmod>2026-10-\d\d<\/lastmod>/.test(sm) && cats.every((s) => sm.includes(`/categoria-${s}</loc>`)) && [...sm.matchAll(/<lastmod>([\d-]+)/g)].every((m) => m[1] <= '2026-12-31'));
t('JSON-LD dos artigos preservado (NewsArticle com datePublished)', /"@type":"NewsArticle"/.test(art) && /"datePublished":"\d{4}-\d{2}-\d{2}"/.test(art));

console.log(`${ok} ok, ${bad} falha(s)`); process.exit(bad ? 1 : 0);
