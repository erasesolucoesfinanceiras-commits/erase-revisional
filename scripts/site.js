// Layout compartilhado (head, menu, rodapé, pop-up espelho, cards).
// Usado por scripts/build.js — não edite as páginas .html à mão: rode `node scripts/build.js`.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const readJSON = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const config = readJSON('data/config.json');
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
const absUrl = (p) => config.siteUrl.replace(/\/$/, '') + p;
const coverUrl = (a) => `/assets/img/cover-${a.categoria}.svg`;

const ICON = {
  sun: '<svg class="i-sun" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg class="i-moon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  x: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M18.2 2h3.3l-7.2 8.3L22.8 22h-6.6l-5.2-6.8L5 22H1.7l7.7-8.8L1.2 2H8l4.7 6.2L18.2 2zm-1.2 18h1.8L7 3.9H5.1L17 20z"/></svg>',
  instagram: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>',
  facebook: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M14 8.5V6.9c0-.8.2-1.2 1.3-1.2H17V2.2C16.700 2.200 15.700 2 14.600 2 12.100 2 10.500 3.500 10.500 6.300v2.200H8v3.500h2.500V22H14v-10h2.700l.4-3.500H14z"/></svg>',
  car: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 17H3v-5l2-5a2 2 0 0 1 1.9-1.3h10.200A2 2 0 0 1 19 7l2 5v5h-2"/><path d="M3 12h18"/><circle cx="7.500" cy="17" r="2"/><circle cx="16.500" cy="17" r="2"/><path d="M9.500 17h5"/></svg>',
  shield: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l8 3v6c0 4.500-3.200 8-8 9-4.800-1-8-4.500-8-9V6l8-3z"/><path d="M9 12l2 2 4-4"/></svg>',
  calc: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 11h2M14 11h2M8 15h2M14 15h2M8 19h2M14 19h2"/></svg>',
  people: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.500"/><path d="M2.500 20c.5-3.500 3-5.500 6.500-5.500s6 2 6.500 5.500"/><path d="M16 4.500a3.500 3.500 0 0 1 0 7M18 14.800c1.800.7 3 2.400 3.500 5.200"/></svg>',
};

const FORMS = {
  'popup-entrada': ['nome', 'telefone', 'email', 'pagina'],
  calculadora: ['nome', 'whatsapp', 'tipo', 'valor_total', 'entrada', 'parcela', 'n_parcelas', 'parcelas_pagas', 'taxa_calculada'],
  newsletter: ['email'],
  contato: ['nome', 'email', 'mensagem'],
};

// Formulários espelho (ocultos) — a Netlify precisa vê-los no HTML estático
// do build, já que os formulários reais são enviados via JavaScript.
function hiddenForms(names) {
  return names
    .map(
      (n) =>
        `<form name="${n}" data-netlify="true" netlify-honeypot="bot-field" hidden>` +
        `<input type="hidden" name="form-name" value="${n}">` +
        `<input name="bot-field">` +
        FORMS[n].map((f) => `<input name="${f}">`).join('') +
        `</form>`
    )
    .join('\n');
}

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
<link rel="stylesheet" href="/assets/css/style.css">
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>\n` : ''}</head>`;
}

function header(active) {
  const cur = (k) => (active === k ? ' aria-current="page"' : '');
  const cats = Object.keys(config.categorias)
    .map((s) => `<a href="${catUrl(s)}"${active === 'cat-' + s ? ' aria-current="page"' : ''}>${esc(catNome(s))}</a>`)
    .join('');
  return `<a class="skip" href="#conteudo">Pular para o conteúdo</a>
<header class="site-header">
<div class="container nav">
<a class="logo" href="/" aria-label="ERASE Revisional — início"><span class="logo-main">ERASE</span><span class="logo-sep" aria-hidden="true"></span><span class="logo-sub">REVISIONAL</span></a>
<nav class="nav-links" id="menu" aria-label="Principal">
<a href="/"${cur('home')}>Início</a>
<a href="/artigos.html"${cur('artigos')}>Artigos</a>
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
  // Dados da empresa: preencha razaoSocial/cnpj/endereco em data/config.json (aparecem aqui automaticamente).
  const dados = [e.razaoSocial, e.cnpj && `CNPJ ${e.cnpj}`, e.endereco].filter(Boolean).join(' · ');
  const soc = (k, label) =>
    `<a class="social" href="${esc(config.social[k])}" target="_blank" rel="noopener noreferrer" aria-label="${label}">${ICON[k]}</a>`;
  return `<footer class="site-footer">
<div class="container">
<div class="footer-grid">
<div>
<a class="logo" href="/" aria-label="ERASE Revisional — início"><span class="logo-main">ERASE</span><span class="logo-sep" aria-hidden="true"></span><span class="logo-sub">REVISIONAL</span></a>
<p class="footer-desc">Notícias sobre financiamento de veículos e uma calculadora gratuita para você descobrir a taxa de juros real do seu contrato.</p>
<div class="socials">${soc('x', 'X')}${soc('instagram', 'Instagram')}${soc('facebook', 'Facebook')}</div>
</div>
<div>
<h3>Navegação</h3>
<ul><li><a href="/">Início</a></li><li><a href="/calculadora.html">Calculadora</a></li><li><a href="/contato.html">Fale Conosco</a></li></ul>
</div>
<div>
<h3>Categorias</h3>
<ul>${Object.keys(config.categorias).map((s) => `<li><a href="${catUrl(s)}">${esc(catNome(s))}</a></li>`).join('')}</ul>
</div>
</div>
<div class="legal">
<p>ERASE Revisional é uma ferramenta de simulação operada pela ERASE Soluções Financeiras. Não somos uma instituição financeira, correspondente bancário nem escritório de advocacia. O resultado é uma estimativa baseada em médias de mercado e nos dados informados, e não constitui parecer, consultoria ou promessa de resultado. Os percentuais de referência têm como fonte a taxa média de juros divulgada pelo Banco Central do Brasil para crédito livre, pessoas físicas, aquisição de veículos. A avaliação de casos individuais é conduzida por escritório de advocacia parceiro.</p>
<!-- TODO: CNPJ e endereço da empresa — preencha "empresa.cnpj" e "empresa.endereco" em data/config.json e rode: node scripts/build.js -->
${dados ? `<p class="company">${esc(dados)}</p>` : ''}
<p class="legal-links"><a href="/termos.html">Termos de uso</a> · <a href="/privacidade.html">Política de Privacidade</a></p>
<p class="copy">© ERASE Soluções Financeiras</p>
</div>
</div>
</footer>`;
}

// Monta a página completa. `forms` = formulários espelho extras desta página.
function page({ meta, active, body, forms = [], scripts = [] }) {
  return `${head(meta)}
<body data-wa="${esc(config.whatsapp)}">
${header(active)}
<main id="conteudo">
${body}
</main>
${footer()}
${hiddenForms(['popup-entrada', ...forms])}
<script src="/assets/js/main.js" defer></script>
${scripts.map((s) => `<script src="${s}" defer></script>`).join('\n')}
</body>
</html>
`;
}

// Cards -----------------------------------------------------------------
function rowCard(a, hidden) {
  return `<article class="row-card"${hidden ? ' data-extra hidden' : ''}>
<a class="row-thumb" href="${artUrl(a)}" tabindex="-1" aria-hidden="true"><img src="${coverUrl(a)}" alt="" width="168" height="112" loading="lazy"></a>
<div class="row-body">
<a class="tag" href="${catUrl(a.categoria)}">${esc(catNome(a.categoria))}</a>
<h3><a href="${artUrl(a)}">${esc(a.titulo)}</a></h3>
<p>${esc(a.resumo)}</p>
<time datetime="${a.data}">${fmtData(a.data)}</time>
</div>
</article>`;
}

function promoCard() {
  return `<aside class="promo" aria-label="Calculadora de juros">
<span class="badge">Simulação gratuita</span>
<h3>Quanto você paga de juros no seu financiamento?</h3>
<p>Descubra a taxa mensal real do seu contrato em pouco mais de um minuto e compare com a referência do Banco Central.</p>
<a class="btn btn-primary btn-block" href="/calculadora.html">Calcular minha taxa agora</a>
<small>Resultado estimado. Não é análise jurídica nem indica valores a receber.</small>
</aside>`;
}

function trustBadges() {
  return `<section class="trust container" aria-label="Por que confiar">
<div class="trust-item">${ICON.shield}<div><h3>Simulação segura</h3><p>Seus dados são usados só para devolver a análise e permitir o contato, se você quiser.</p></div></div>
<div class="trust-item">${ICON.calc}<div><h3>Cálculo transparente</h3><p>Resolvemos a taxa pelo sistema Price, com os números que você informa.</p></div></div>
<div class="trust-item">${ICON.people}<div><h3>Atendimento humano</h3><p>Se quiser, um especialista parceiro entra em contato. Sem compromisso.</p></div></div>
</section>`;
}

function ctaBanner() {
  return `<section class="container"><div class="cta-banner">
<div><h2>Será que seu financiamento está acima da média?</h2><p>Informe parcela, valor financiado e prazo. A calculadora mostra a taxa mensal embutida e como ela se compara à referência.</p></div>
<a class="btn btn-primary btn-lg" href="/calculadora.html">Calcular minha taxa agora</a>
</div></section>`;
}

module.exports = {
  ROOT, config, loadArticles, esc, fmtPct, fmtData, catNome, catUrl, artUrl, absUrl, coverUrl,
  ICON, page, rowCard, promoCard, trustBadges, ctaBanner,
};
