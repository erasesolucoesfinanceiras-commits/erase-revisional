#!/usr/bin/env node
// Copia SÓ os arquivos públicos do site para dist/ (saída do Cloudflare Pages).
// Assim scripts/, data/, README, .github etc. não ficam acessíveis na internet.
//   node scripts/publish.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST);

const KEY = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'config.json'), 'utf8')).indexnowKey; // arquivo de verificação do IndexNow
const raiz = fs.readdirSync(ROOT).filter((f) => /\.html$/.test(f) || ['robots.txt', 'sitemap.xml', 'llms.txt', '_redirects', KEY && `${KEY}.txt`].includes(f));
for (const f of raiz) fs.copyFileSync(path.join(ROOT, f), path.join(DIST, f));

// Cabeçalhos do Cloudflare Pages. O arquivo é GERADO aqui (dist/_headers), não fica na raiz do repositório.
// ATENÇÃO: nunca coloque X-Robots-Tag em regra de caminho (/*): o domínio oficial tem de ser indexável.
const HEADERS = `# Gerado por scripts/publish.js.
# Cache: CSS, JS e fonte têm versão/nome fixo (?v= muda a cada alteração) => 1 ano. Imagens podem ser trocadas sob o mesmo nome
# (refazer foto de artigo): 7 dias. Dados (série do Banco Central) mudam todo mês: 1 hora. NÃO deixe duas regras com Cache-Control casando o mesmo caminho.
/assets/css/*
  Cache-Control: public, max-age=31536000, immutable

/assets/js/*
  Cache-Control: public, max-age=31536000, immutable

/assets/fonts/*
  Cache-Control: public, max-age=31536000, immutable

/assets/img/*
  Cache-Control: public, max-age=604800, stale-while-revalidate=86400

/assets/data/*
  Cache-Control: public, max-age=3600

/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: DENY
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Content-Security-Policy-Report-Only: default-src 'self'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://challenges.cloudflare.com https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: https:; connect-src 'self' https://lqxwdyjctsmirinvvyow.supabase.co https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://cloudflareinsights.com; frame-src https://challenges.cloudflare.com https://www.instagram.com; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'

# Não indexar SÓ os endereços temporários do Cloudflare (*.pages.dev e prévias). O domínio oficial
# (revisional.eraseconsulta.com.br) não casa com estes padrões e continua indexável.
https://:project.pages.dev/*
  X-Robots-Tag: noindex
https://:version.:project.pages.dev/*
  X-Robots-Tag: noindex
`;
fs.writeFileSync(path.join(DIST, '_headers'), HEADERS);
for (const d of ['assets', 'noticias']) fs.cpSync(path.join(ROOT, d), path.join(DIST, d), { recursive: true });

for (const obrigatorio of ['index.html', '404.html', 'sitemap.xml', '_headers']) {
  if (!fs.existsSync(path.join(DIST, obrigatorio))) { console.error('Faltando em dist/: ' + obrigatorio); process.exit(1); }
}
console.log(`OK — dist/ com ${raiz.length} arquivos na raiz + _headers + assets/ + noticias/`);
