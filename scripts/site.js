// Layout compartilhado (head, menu, rodapé, pop-up espelho, cards).
// Usado por scripts/build.js — não edite as páginas .html à mão: rode `node scripts/build.js`.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const readJSON = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const config = readJSON('data/config.json');
// A série do BC (scripts/update-bcb.js) manda; config.bc é só o fallback até ela existir.
try {
  const { valores, ultimo_mes: m } = readJSON('assets/data/bcb-veiculos.json');
  const mes = new Date(m + '-15T12:00:00Z').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  config.bc = { taxaMedia: valores[m], mesReferencia: mes };
} catch (e) { if (e.code !== 'ENOENT') throw e; }
// Versão do CSS na URL: evita que um style.css antigo em cache (1h) quebre o HTML novo.
// Versão (hash do conteúdo) dos .js na URL: um main.js antigo em cache (1h, no navegador ou na borda) nunca atende uma página nova.
const assetVer = (rel) => { try { return require('crypto').createHash('md5').update(fs.readFileSync(path.join(ROOT, rel.replace(/^\//, '')))).digest('hex').slice(0, 8); } catch (e) { return ''; } };
const jsUrl = (p) => `${p}?v=${assetVer(p)}`;
const cssVer = require('crypto').createHash('md5').update(fs.readFileSync(path.join(ROOT, 'assets/css/style.css'))).digest('hex').slice(0, 8);
const loadNotas = () => {
  try { return readJSON('data/notas.json').sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : a.id < b.id ? 1 : -1)); }
  catch (e) { if (e.code === 'ENOENT') return []; throw e; }
};
const loadArticles = () =>
  readJSON('data/articles.json').sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0));

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const fmtPct = (n) => n.toFixed(2).replace('.', ',');

const fmtData = (iso) =>
  new Date(iso + 'T12:00:00Z').toLocaleDateString('pt-BR', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });

const catNome = (slug) => config.categorias[slug].nome;
const catUrl = (slug) => `/categoria-${slug}.html`;
const artUrl = (a) => `/noticias/${a.slug}.html`;
// URLs públicas sem ".html" (o Cloudflare Pages redireciona /x.html -> /x).
const semHtml = (p) => p.replace(/\.html$/, '');
const absUrl = (p) => config.siteUrl.replace(/\/$/, '') + semHtml(p);
const coverUrl = (a) => `/assets/img/cover-${a.categoria}.svg`;
// Capa: foto WebP (scripts/photos.js) em 3 tamanhos; sem foto, ou se ela não carregar, volta ao desenho SVG.
const PHOTO_WIDTHS = [480, 960, 1280]; // manter igual a WIDTHS em photos.js
const coverImg = (a, { width, height, sizes, eager = false, cls = '' }) => {
  const base = `${cls ? `class="${cls}" ` : ''}alt="" width="${width}" height="${height}" ${eager ? 'fetchpriority="high"' : 'loading="lazy" decoding="async"'}`;
  if (!a.foto) return `<img src="${coverUrl(a)}" ${base}>`;
  const srcset = PHOTO_WIDTHS.map((w) => `/assets/img/news/${a.slug}-${w}.webp ${w}w`).join(', ');
  return `<img src="/assets/img/news/${a.slug}-960.webp" srcset="${srcset}" sizes="${sizes}" ${base} onerror="this.onerror=null;this.removeAttribute('srcset');this.src='${coverUrl(a)}'">`;
};

const ICON = {
  sun: '<svg class="i-sun" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg class="i-moon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  x: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M18.2 2h3.3l-7.2 8.3L22.8 22h-6.6l-5.2-6.8L5 22H1.7l7.7-8.8L1.2 2H8l4.7 6.2L18.2 2zm-1.2 18h1.8L7 3.9H5.1L17 20z"/></svg>',
  instagram: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>',
  facebook: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M14 8.5V6.9c0-.8.2-1.2 1.3-1.2H17V2.2C16.700 2.200 15.700 2 14.600 2 12.100 2 10.500 3.500 10.500 6.300v2.200H8v3.500h2.500V22H14v-10h2.700l.4-3.500H14z"/></svg>',
  mail: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
  car: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 17H3v-5l2-5a2 2 0 0 1 1.9-1.3h10.200A2 2 0 0 1 19 7l2 5v5h-2"/><path d="M3 12h18"/><circle cx="7.500" cy="17" r="2"/><circle cx="16.500" cy="17" r="2"/><path d="M9.500 17h5"/></svg>',
  shield: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l8 3v6c0 4.500-3.200 8-8 9-4.800-1-8-4.500-8-9V6l8-3z"/><path d="M9 12l2 2 4-4"/></svg>',
  calc: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 11h2M14 11h2M8 15h2M14 15h2M8 19h2M14 19h2"/></svg>',
  people: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.500"/><path d="M2.500 20c.5-3.500 3-5.500 6.500-5.500s6 2 6.500 5.500"/><path d="M16 4.500a3.500 3.500 0 0 1 0 7M18 14.800c1.800.7 3 2.400 3.500 5.200"/></svg>',
};

// Google Analytics 4: o ID fica só em data/config.json ("gaId"). Com o marcador G-XXXXXXXXXX (ou vazio) nada é carregado.
const gaOk = /^G-[A-Z0-9]{6,}$/.test(config.gaId || '') && !/^G-X+$/.test(config.gaId);
const gaSnippet = () => gaOk
  ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${config.gaId}"></script>\n<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${config.gaId}');</script>\n`
  : '';

function head({ title, desc, path: p, image, type = 'website', jsonld, noindex }) {
  const url = absUrl(p);
  const img = absUrl(image || '/assets/img/og-image.png');
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
${noindex ? '<meta name="robots" content="noindex">\n' : ''}<link rel="canonical" href="${url}">
<meta property="og:type" content="${type}">
<meta property="og:site_name" content="${esc(config.siteNome)}">
<meta property="og:locale" content="pt_BR">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${img}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${img}">
<link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/assets/img/favicon-32.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png">
<script>try{var t=localStorage.getItem('erase-theme');document.documentElement.setAttribute('data-theme',t==='dark'?'dark':'light')}catch(e){document.documentElement.setAttribute('data-theme','light')}</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/css/style.css?v=${cssVer}">
${gaSnippet()}${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>\n` : ''}</head>`;
}

function header(active) {
  const cur = (k) => (active === k ? ' aria-current="page"' : '');
  const cats = Object.keys(config.categorias)
    .map((s) => `<a href="${catUrl(s)}"${active === 'cat-' + s ? ' aria-current="page"' : ''}>${esc(catNome(s))}</a>`)
    .join('');
  return `<a class="skip" href="#conteudo">Pular para o conteúdo</a>
<header class="site-header">
<div class="container nav">
<a class="logo" href="/" aria-label="ERASE Revisional — início"><img class="logo-img logo-light" src="/assets/img/logo-erase.webp" alt="" width="147" height="26"><img class="logo-img logo-dark" src="/assets/img/logo-erase-dark.webp" alt="" width="147" height="26"><span class="logo-sep" aria-hidden="true"></span><span class="logo-sub">REVISIONAL</span></a>
<nav class="nav-links" id="menu" aria-label="Principal">
<a href="/"${cur('home')}>Início</a>
<a href="/artigos.html"${cur('artigos')}>Artigos</a>
<a href="/radar.html"${cur('radar')}>Radar</a>
<div class="dropdown">
<button class="dropdown-btn" type="button" aria-expanded="false" aria-haspopup="true">Categorias <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.500" stroke-linecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>
<div class="dropdown-menu">${cats}</div>
</div>
</nav>
<div class="nav-actions">
<button class="theme-toggle" type="button" aria-label="Alternar tema claro/escuro">${ICON.sun}${ICON.moon}</button>
<a class="btn btn-primary btn-sm" href="/calculadora.html">Simular agora</a>
<button class="nav-toggle" type="button" aria-label="Abrir menu" aria-expanded="false" aria-controls="menu"><span></span><span></span><span></span></button>
</div>
</div>
</header>`;
}

function footer() {
  const e = config.empresa;
  // Dados da empresa: preencha razaoSocial/cnpj em data/config.json (aparecem aqui automaticamente).
  const dados = [e.razaoSocial, e.cnpj && `CNPJ ${e.cnpj}`].filter(Boolean).join(' · ');
  // Ícone só aparece quando há URL real em data/config.json (evita link morto).
  const soc = (k, label) => !config.social[k] ? '' :
    `<a class="social" href="${esc(config.social[k])}" target="_blank" rel="noopener noreferrer" aria-label="${label}">${ICON[k]}</a>`;
  return `<footer class="site-footer">
<div class="container">
<div class="footer-grid">
<div>
<a class="logo" href="/" aria-label="ERASE Revisional — início"><img class="logo-img logo-light" src="/assets/img/logo-erase.webp" alt="" width="147" height="26"><img class="logo-img logo-dark" src="/assets/img/logo-erase-dark.webp" alt="" width="147" height="26"><span class="logo-sep" aria-hidden="true"></span><span class="logo-sub">REVISIONAL</span></a>
<p class="footer-desc">Notícias sobre financiamento de veículos e uma calculadora gratuita para você descobrir a taxa de juros real do seu contrato.</p>
${(() => { const r = `${soc('x', 'X')}${soc('instagram', 'Instagram')}${soc('facebook', 'Facebook')}`; return r ? `<div class="socials">${r}</div>` : ''; })()}
</div>
<div>
<h3>Navegação</h3>
<ul><li><a href="/">Início</a></li><li><a href="/calculadora.html">Calculadora</a></li><li><a href="/radar.html">Radar</a></li><li><a href="/como-produzimos.html">Como produzimos nosso conteúdo</a></li><li><a href="/contato.html">Fale Conosco</a></li></ul>
</div>
<div>
<h3>Categorias</h3>
<ul>${Object.keys(config.categorias).map((s) => `<li><a href="${catUrl(s)}">${esc(catNome(s))}</a></li>`).join('')}</ul>
</div>
</div>
<div class="legal">
<p>ERASE Revisional é uma ferramenta de simulação operada pela ERASE Soluções Financeiras. Não somos uma instituição financeira, correspondente bancário nem escritório de advocacia. O resultado é uma estimativa baseada em médias de mercado e nos dados informados, e não constitui parecer, consultoria ou promessa de resultado. Os percentuais de referência têm como fonte a taxa média de juros divulgada pelo Banco Central do Brasil para crédito livre, pessoas físicas, aquisição de veículos. A análise do contrato é realizada pela ERASE Soluções Financeiras.</p>
${dados ? `<p class="company">${esc(dados)}</p>` : ''}
<p class="legal-links"><a href="/termos.html">Termos de Uso</a> · <a href="/privacidade.html">Política de Privacidade</a> · <a href="/como-produzimos.html">Como produzimos nosso conteúdo</a></p>
<p class="copy">© ERASE Soluções Financeiras</p>
</div>
</div>
</footer>`;
}

// Monta a página completa.
function page({ meta, active, body, scripts = [] }) {
  return `${head(meta)}
<body data-wa="${esc(config.whatsapp)}">
${header(active)}
<main id="conteudo">
${body}
</main>
${footer()}
<script src="${jsUrl('/assets/js/main.js')}" defer></script>
${scripts.map((s) => `<script src="${jsUrl(s)}" defer></script>`).join('\n')}
</body>
</html>
`;
}

// Cards -----------------------------------------------------------------
/** Tipo do conteúdo: "guia" (atemporal: sem data nos cards) ou "noticia" (atual). Sem o campo, vale "noticia". */
const ehGuia = (a) => a.tipo === 'guia';
const seloTxt = (a) => (ehGuia(a) ? 'Guia' : 'Artigo');
const selo = (txt, cls = '') => `<span class="selo${cls ? ' ' + cls : ''}">${esc(txt)}</span>`;
/**
 * Ordem da capa e da página Artigos (SÓ datas reais): primeiro o que é datado (artigos de notícia e, se `notas`, notas do Radar),
 * do mais novo ao mais antigo; guias ficam abaixo, em posição fixa, ordenados por "atualizado" (revisão real) quando houver.
 * Nunca usa "data de hoje": a data de cada item é a que foi gravada na publicação.
 */
function ordenarConteudo(artigos, notas = []) {
  const datados = [...artigos.filter((a) => !ehGuia(a)).map((a) => ({ tipo: 'artigo', data: a.data, a })), ...notas.map((n) => ({ tipo: 'radar', data: n.data, n }))]
    .sort((x, y) => (x.data < y.data ? 1 : x.data > y.data ? -1 : x.tipo === y.tipo ? 0 : x.tipo === 'artigo' ? -1 : 1));
  const guias = artigos.filter(ehGuia).sort((x, y) => { const dx = x.atualizado || '', dy = y.atualizado || ''; return dx < dy ? 1 : dx > dy ? -1 : 0; });
  return { datados, guias };
}
/** Maior data real de publicação (artigos e notas): é a "Última publicação" da capa. */
const ultimaPublicacao = (artigos, notas = []) => [...artigos.map((a) => a.data), ...notas.map((n) => n.data)].sort().pop() || '';

function rowCard(a, hidden) {
  const guia = ehGuia(a);
  return `<article class="row-card"${hidden ? ' data-extra hidden' : ''}>
<a class="row-thumb" href="${artUrl(a)}" tabindex="-1" aria-hidden="true">${coverImg(a, { width: 168, height: 112, sizes: '(max-width: 600px) 100vw, 168px' })}</a>
<div class="row-body">
<div class="row-tags">${selo(seloTxt(a), guia ? 'selo-guia' : 'selo-artigo')}<a class="tag" href="${catUrl(a.categoria)}">${esc(catNome(a.categoria))}</a></div>
<h3><a href="${artUrl(a)}">${esc(a.titulo)}</a></h3>
<p>${esc(a.resumo)}</p>
${guia ? (a.atualizado ? `<time datetime="${a.atualizado}">Atualizado em ${fmtData(a.atualizado)}</time>` : '') : `<time datetime="${a.data}">${fmtData(a.data)}</time>`}
</div>
</article>`;
}
/** Nota do Radar no mesmo formato de card (leva à própria nota em /radar). */
function rowCardNota(n, hidden) {
  const href = `/radar.html#${esc(n.id)}`;
  return `<article class="row-card"${hidden ? ' data-extra hidden' : ''}>
<a class="row-thumb" href="${href}" tabindex="-1" aria-hidden="true">${coverImg({ categoria: n.categoria, slug: n.id }, { width: 168, height: 112, sizes: '(max-width: 600px) 100vw, 168px' })}</a>
<div class="row-body">
<div class="row-tags">${selo('Radar', 'selo-radar')}<a class="tag" href="${catUrl(n.categoria)}">${esc(catNome(n.categoria))}</a></div>
<h3><a href="${href}">${esc(n.titulo)}</a></h3>
<p>${esc(n.texto)}</p>
<time datetime="${n.data}">${fmtData(n.data)}</time>
</div>
</article>`;
}
/** Lista mista (capa): datados + guias; `itens` vem de ordenarConteudo. */
const cardDe = (it, hidden) => (it.tipo === 'radar' ? rowCardNota(it.n, hidden) : rowCard(it.a || it, hidden));

// Veículos e lançamentos levam à calculadora; os demais temas levam à análise gratuita da ERASE (Fale Conosco).
const usaContato = (cat) => !!cat && (config.categorias[cat] || {}).cta === 'contato';

function promoCard(cat) {
  if (usaContato(cat)) return `<aside class="promo" aria-label="Análise gratuita da ERASE">
<span class="badge">Análise gratuita</span>
<h3>Tem dúvida sobre o seu contrato ou a sua dívida?</h3>
<p>Conte o seu caso para a ERASE. <strong>ANÁLISE TOTALMENTE GRATUITA</strong>, sem compromisso.</p>
<a class="btn btn-primary btn-block" href="/contato.html">Falar com a ERASE</a>
<small>Informação geral. Não é análise jurídica nem promessa de resultado.</small>
</aside>`;
  return `<aside class="promo" aria-label="Calculadora de juros">
<span class="badge">Simulação gratuita</span>
<h3>Quanto você paga de juros no seu financiamento?</h3>
<p>Descubra a taxa mensal real do seu contrato em pouco mais de um minuto e compare com a referência do Banco Central. <strong>ANÁLISE TOTALMENTE GRATUITA</strong>.</p>
<a class="btn btn-primary btn-block" href="/calculadora.html">Calcular minha taxa agora</a>
<small>Resultado estimado. Não é análise jurídica nem indica valores a receber.</small>
</aside>`;
}

function trustBadges() {
  return `<section class="trust container" aria-label="Por que confiar">
<div class="trust-item">${ICON.shield}<div><h3>Simulação segura</h3><p>Seus dados são usados só para devolver a análise e permitir o contato, se você quiser.</p></div></div>
<div class="trust-item">${ICON.calc}<div><h3>Cálculo transparente</h3><p>Resolvemos a taxa pelo sistema Price, com os números que você informa.</p></div></div>
<div class="trust-item">${ICON.people}<div><h3>Atendimento humano</h3><p>Se quiser, um especialista da ERASE entra em contato. Sem compromisso.</p></div></div>
</section>`;
}


// ---------------------------------------------------------------- Portal: itens, cards verticais, carrossel, categorias, barra lateral
const dadosCache = {};
const dados = () => (dadosCache.d = dadosCache.d || { artigos: loadArticles(), notas: loadNotas() });
/** Normaliza artigo, nota ou guia para um "item" de card: href, título, data (só real), selo e imagem. Guias não têm data. */
function itemDe(x) {
  if (x.tipo === 'radar') return { tipo: 'radar', href: `/radar.html#${esc(x.n.id)}`, titulo: x.n.titulo, resumo: x.n.texto, data: x.n.data, cat: x.n.categoria, ref: { categoria: x.n.categoria, slug: x.n.id }, selo: 'Radar', cls: 'selo-radar' };
  const a = x.a || x;
  return ehGuia(a)
    ? { tipo: 'guia', href: artUrl(a), titulo: a.titulo, resumo: a.resumo, data: '', atualizado: a.atualizado || '', cat: a.categoria, ref: a, selo: 'Guia', cls: 'selo-guia' }
    : { tipo: 'artigo', href: artUrl(a), titulo: a.titulo, resumo: a.resumo, data: a.data, cat: a.categoria, ref: a, selo: 'Artigo', cls: 'selo-artigo' };
}
const dataHtml = (i) => (i.tipo === 'guia' ? (i.atualizado ? `<time datetime="${i.atualizado}">Atualizado em ${fmtData(i.atualizado)}</time>` : '') : `<time datetime="${i.data}">${fmtData(i.data)}</time>`);
/** Os N itens mais recentes por data real (artigos de notícia e notas do Radar; guias ficam de fora). */
const maisRecentes = (n, artigos = dados().artigos, notas = dados().notas) => ordenarConteudo(artigos, notas).datados.slice(0, n);

/** Card vertical (Escolha da equipe, Relacionados). */
function cardV(x) {
  const i = itemDe(x);
  return `<article class="card-v">
<a class="card-v-img" href="${i.href}" tabindex="-1" aria-hidden="true">${coverImg(i.ref, { width: 360, height: 240, sizes: '(max-width: 600px) 100vw, 360px' })}</a>
<div class="card-v-body">
<div class="row-tags">${selo(i.selo, i.cls)}<a class="tag" href="${catUrl(i.cat)}">${esc(catNome(i.cat))}</a></div>
<h3><a href="${i.href}">${esc(i.titulo)}</a></h3>
${dataHtml(i)}
</div>
</article>`;
}
/** Item pequeno (barra lateral "Destaques"). */
function miniItem(x) {
  const i = itemDe(x);
  return `<li class="mini">
<a class="mini-thumb" href="${i.href}" tabindex="-1" aria-hidden="true">${coverImg(i.ref, { width: 88, height: 66, sizes: '88px' })}</a>
<div class="mini-body">${selo(i.selo, i.cls)}<a class="mini-title" href="${i.href}">${esc(i.titulo)}</a>${dataHtml(i)}</div>
</li>`;
}

/** Carrossel de destaques (sem script externo; funciona sem JS como faixa rolável). Autoplay DESLIGADO de propósito. */
function carrossel(itens) {
  const n = itens.length;
  const slides = itens.map((x, k) => {
    const i = itemDe(x);
    const img = coverImg(i.ref, { width: 1160, height: 440, sizes: '(max-width: 1200px) 100vw, 1160px', eager: k === 0, cls: 'slide-img' });
    return `<li class="slide" id="slide-${k + 1}" role="group" aria-roledescription="slide" aria-label="${k + 1} de ${n}">
${img}
<a class="slide-cover" href="${i.href}" tabindex="-1" aria-hidden="true"></a>
<div class="slide-text">
<div class="row-tags">${k === 0 ? selo('Mais recente', 'selo-destaque') : ''}${selo(i.selo, i.cls)}<span class="tag tag-on-img">${esc(catNome(i.cat))}</span></div>
<h2><a class="slide-link" href="${i.href}">${esc(i.titulo)}</a></h2>
<p>${esc(i.resumo.length > 170 ? i.resumo.slice(0, 167).replace(/\s+\S*$/, '') + '…' : i.resumo)}</p>
<time class="featured-date" datetime="${i.data}">${fmtData(i.data)}</time>
</div>
</li>`;
  }).join('\n');
  const dots = itens.map((x, k) => `<button type="button" class="car-dot" data-i="${k}" aria-label="Ir para o slide ${k + 1} de ${n}: ${esc(itemDe(x).titulo)}" aria-controls="slide-${k + 1}"${k === 0 ? ' aria-current="true"' : ''}><span aria-hidden="true"></span></button>`).join('');
  return `<section class="container carousel" aria-roledescription="carrossel" aria-label="Destaques recentes" data-total="${n}">
<div class="carousel-viewport">
<ul class="carousel-track" id="car-track">
${slides}
</ul>
</div>
${n > 1 ? `<div class="car-nav" hidden>
<button type="button" class="car-btn car-prev" aria-label="Slide anterior"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></button>
<div class="car-dots" role="group" aria-label="Escolher slide">${dots}</div>
<span class="car-count" aria-hidden="true"><span class="car-cur">1</span> / ${n}</span>
<button type="button" class="car-btn car-next" aria-label="Próximo slide"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button>
</div>` : ''}
</section>`;
}

/** Imagem de uma categoria: foto do artigo mais novo dela, ou o desenho (degradê com ícone) que já existe no repositório. */
function imgDaCategoria(slug) {
  const a = dados().artigos.filter((x) => x.categoria === slug && x.foto).sort((x, y) => (x.data < y.data ? 1 : -1))[0];
  return coverImg(a || { categoria: slug }, { width: 480, height: 320, sizes: '(max-width: 600px) 50vw, 240px' });
}
/** "Explore tópicos": um quadro por categoria existente (nome em texto sobre a imagem). */
function exploreTopicos() {
  const { artigos, notas } = dados();
  const quadros = Object.keys(config.categorias).map((s) => {
    const n = artigos.filter((a) => a.categoria === s).length + notas.filter((x) => x.categoria === s).length;
    return `<li><a class="cat-tile" href="${catUrl(s)}">${imgDaCategoria(s)}<span class="cat-tile-text"><strong>${esc(catNome(s))}</strong><small>${n} ${n === 1 ? 'item' : 'itens'}</small></span></a></li>`;
  }).join('\n');
  return `<section class="container explore" aria-labelledby="explore-t">
<div class="section-head"><h2 id="explore-t">Explore tópicos</h2></div>
<ul class="cat-grid">
${quadros}
</ul>
</section>`;
}

/** "Escolha da equipe": até 3 itens fixos de data/escolha-da-equipe.json (slug de artigo/guia, "radar:ID" ou {tipo, slug|id}). Vazio = sem seção. */
function escolhaDaEquipe() {
  let cfg; try { cfg = readJSON('data/escolha-da-equipe.json'); } catch (e) { return ''; }
  const { artigos, notas } = dados();
  const itens = (Array.isArray(cfg) ? cfg : cfg.itens || []).map((e) => {
    const chave = typeof e === 'string' ? e : e.id || e.slug || '';
    const radar = (typeof e === 'object' && e.tipo === 'radar') || String(chave).startsWith('radar:');
    if (radar) { const n = notas.find((x) => x.id === String(chave).replace(/^radar:/, '')); return n && { tipo: 'radar', n, data: n.data }; }
    const a = artigos.find((x) => x.slug === chave); return a && { tipo: ehGuia(a) ? 'guia' : 'artigo', a, data: a.data };
  }).filter(Boolean).slice(0, 3);
  if (!itens.length) return '';
  return `<section class="container team" aria-labelledby="team-t">
<div class="section-head"><h2 id="team-t">Escolha da equipe</h2></div>
<div class="card-grid">${itens.map((x) => cardV(x.tipo === 'guia' ? x.a : x)).join('\n')}</div>
</section>`;
}

/** Artigos relacionados (fim do artigo): 3 da mesma categoria por data real; se faltar, completa com os mais recentes. */
function relacionados(a) {
  const { artigos } = dados();
  const outros = artigos.filter((x) => x.slug !== a.slug);
  const ord = (lista) => { const o = ordenarConteudo(lista); return [...o.datados.map((d) => d.a), ...o.guias]; };
  const mesma = ord(outros.filter((x) => x.categoria === a.categoria));
  const resto = ord(outros.filter((x) => x.categoria !== a.categoria));
  const tres = [...mesma, ...resto].slice(0, 3);
  if (!tres.length) return '';
  return `<section class="related" aria-labelledby="rel-t">
<h2 id="rel-t">Artigos relacionados</h2>
<div class="card-grid">${tres.map((x) => cardV(x)).join('\n')}</div>
</section>`;
}

/** Redes sociais: só os perfis que existem em data/config.json (campo vazio = nada é mostrado). */
const socialLinks = () => ['x', 'instagram', 'facebook'].filter((k) => config.social[k])
  .map((k) => `<a class="social" href="${esc(config.social[k])}" target="_blank" rel="noopener noreferrer" aria-label="${{ x: 'X', instagram: 'Instagram', facebook: 'Facebook' }[k]} da ERASE (abre em nova aba)">${ICON[k]}</a>`).join('');

/** Barra lateral completa: cartão (calculadora ou análise), Destaques, Sobre (+ redes) e newsletter. */
function sidebar(cat) {
  const dest = maisRecentes(4);
  const redes = socialLinks();
  return `<div class="side-col">
${promoCard(cat)}
${dest.length ? `<section class="side-box" aria-labelledby="sb-dest"><h2 id="sb-dest">Destaques</h2><ul class="mini-list">${dest.map(miniItem).join('\n')}</ul></section>` : ''}
<section class="side-box" aria-labelledby="sb-sobre"><h2 id="sb-sobre">Sobre</h2>
<p>Portal de notícias e guias sobre financiamento de veículos, produzido pela Equipe ERASE e revisado com fontes citadas.</p>
<p><a href="/como-produzimos.html">Como produzimos nosso conteúdo</a></p>
${redes ? `<div class="socials" aria-label="Redes sociais">${redes}</div>` : ''}
</section>
<section class="side-box" aria-labelledby="sb-news"><h2 id="sb-news">Receba as novidades</h2>
<form id="sb-news-form" class="side-news" novalidate>
<div class="field" data-campo="email"><label for="sb-email">E-mail <span class="req">*</span></label><input id="sb-email" name="email" type="email" inputmode="email" autocomplete="email" placeholder="seu@email.com" aria-required="true" aria-describedby="sb-err-email"><small class="err" id="sb-err-email">Informe um e-mail válido</small></div>
<input type="text" name="bot-field" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
<div class="field check" data-campo="lgpd"><label><input type="checkbox" id="sb-lgpd" name="lgpd" aria-required="true" aria-describedby="sb-err-lgpd"><span>Autorizo a ERASE a me enviar o resumo semanal por e-mail, conforme a <a href="/privacidade.html" target="_blank" rel="noopener">Política de Privacidade</a>. <span class="req">*</span></span></label><small class="err" id="sb-err-lgpd">Marque para autorizar o envio</small></div>
<button class="btn btn-primary btn-block" type="submit" aria-disabled="true">Preencha para receber</button>
<p class="form-msg" id="sb-msg" role="status" aria-live="polite"></p>
</form>
</section>
</div>`;
}

function ctaBanner(cat) {
  if (usaContato(cat)) return `<section class="container"><div class="cta-banner">
<div><h2>Quer entender melhor o seu contrato ou a sua dívida?</h2><p>Conte o seu caso para a ERASE. <strong>ANÁLISE TOTALMENTE GRATUITA</strong>, sem compromisso e sem promessa de resultado.</p></div>
<a class="btn btn-primary btn-lg" href="/contato.html">Falar com a ERASE</a>
</div></section>`;
  return `<section class="container"><div class="cta-banner">
<div><h2>Será que seu financiamento está acima da média?</h2><p>Informe parcela, valor financiado e prazo. A calculadora mostra a taxa mensal embutida e como ela se compara à referência. <strong>ANÁLISE TOTALMENTE GRATUITA</strong>.</p></div>
<a class="btn btn-primary btn-lg" href="/calculadora.html">Calcular minha taxa agora</a>
</div></section>`;
}

const FREE_TXT = 'ANÁLISE DO CONTRATO 100% GRATUITA';
const freeBadge = (cls = '') => `<p class="free-badge ${cls}" role="note">${FREE_TXT}</p>`;

module.exports = {
  FREE_TXT, freeBadge,
  ROOT, config, loadArticles, loadNotas, ehGuia, selo, seloTxt, ordenarConteudo, ultimaPublicacao, rowCardNota, cardDe, readJSON, itemDe, dataHtml, maisRecentes, cardV, miniItem, carrossel, exploreTopicos, escolhaDaEquipe, relacionados, sidebar, socialLinks, usaContato, esc, fmtPct, fmtData, catNome, catUrl, artUrl, absUrl, coverUrl, coverImg,
  ICON, page, rowCard, promoCard, trustBadges, ctaBanner,
};
