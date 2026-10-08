#!/usr/bin/env node
// Gera as imagens do site (capas por categoria, favicon, og-image). Ferramenta de desenvolvimento:
// os arquivos gerados ficam versionados em assets/img. Os PNGs usam o Playwright (Chromium local).
//   node scripts/make-images.js
const fs = require('fs');
const path = require('path');
const IMG = path.join(__dirname, '..', 'assets', 'img');
fs.mkdirSync(IMG, { recursive: true });

const BLUE = '#3FA9F5';
const covers = {
  revisional: { a: '#0b2a44', b: '#7e22ce', glyph: 'percent' },
  financeiro: { a: '#0b2a44', b: '#0a6cb3', glyph: 'bars' },
  mercado: { a: '#0b2a44', b: '#be185d', glyph: 'car' },
  'energia-solar': { a: '#0b2a44', b: '#b45309', glyph: 'sun' },
  imoveis: { a: '#0b2a44', b: '#0f766e', glyph: 'house' },
  'consorcio-seguros': { a: '#0b2a44', b: '#4338ca', glyph: 'shield' },
  'credito-pessoal': { a: '#0b2a44', b: '#9f1239', glyph: 'card' },
  'credito-rural': { a: '#0b2a44', b: '#4d7c0f', glyph: 'leaf' },
  'empresas-mei': { a: '#0b2a44', b: '#0e7490', glyph: 'bag' },
  economia: { a: '#0b2a44', b: '#334155', glyph: 'line' },
};

function glyph(kind) {
  const s = 'stroke="#fff" stroke-opacity=".9" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" fill="none"';
  if (kind === 'percent') return `<g ${s}><path d="M920 150 L680 470"/><circle cx="700" cy="190" r="48"/><circle cx="900" cy="430" r="48"/></g>`;
  if (kind === 'bars') return `<g ${s}><path d="M640 450V330M760 450V230M880 450V290M1000 450V150"/><path d="M600 470H1040"/></g>`;
  if (kind === 'sun') return `<g ${s}><circle cx="820" cy="300" r="70"/><path d="M820 150v50M820 400v50M670 300h50M920 300h50M714 194l35 35M891 371l35 35M926 194l-35 35M749 371l-35 35"/></g>`;
  if (kind === 'house') return `<g ${s}><path d="M650 320L820 180l170 140"/><path d="M690 290v170h260V290"/><path d="M790 460V370h60v90"/></g>`;
  if (kind === 'shield') return `<g ${s}><path d="M820 160l150 56v110c0 80-60 130-150 160-90-30-150-80-150-160V216z"/><path d="M760 320l45 45 80-90"/></g>`;
  if (kind === 'card') return `<g ${s}><rect x="660" y="210" width="320" height="200" rx="26"/><path d="M660 270h320M700 350h90"/></g>`;
  if (kind === 'leaf') return `<g ${s}><path d="M700 440C690 300 780 190 960 170c10 170-80 270-230 280"/><path d="M700 440c60-90 120-150 200-200"/></g>`;
  if (kind === 'bag') return `<g ${s}><rect x="650" y="230" width="340" height="220" rx="24"/><path d="M760 230v-40a30 30 0 0 1 30-30h60a30 30 0 0 1 30 30v40M650 330h340"/></g>`;
  if (kind === 'line') return `<g ${s}><path d="M630 440L740 320l90 60 150-200"/><path d="M910 180h70v70"/></g>`;
  return `<g ${s}><path d="M640 400h-30v-80l34-80a28 28 0 0 1 26-18h200a28 28 0 0 1 26 18l34 80v80h-30"/><path d="M610 320h400"/><circle cx="700" cy="400" r="32"/><circle cx="920" cy="400" r="32"/><path d="M732 400h156"/></g>`;
}

for (const [k, c] of Object.entries(covers)) {
  fs.writeFileSync(path.join(IMG, `cover-${k}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 600" role="img" aria-hidden="true">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.a}"/><stop offset="1" stop-color="${c.b}"/></linearGradient>
<radialGradient id="r" cx=".85" cy=".1" r=".7"><stop offset="0" stop-color="${BLUE}" stop-opacity=".55"/><stop offset="1" stop-color="${BLUE}" stop-opacity="0"/></radialGradient></defs>
<rect width="1200" height="600" fill="url(#g)"/><rect width="1200" height="600" fill="url(#r)"/>
<g opacity=".08" fill="#fff"><circle cx="160" cy="520" r="240"/><circle cx="1100" cy="40" r="180"/></g>
${glyph(c.glyph)}
</svg>
`);
}

const icon = (size, rx) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}"><rect width="64" height="64" rx="${rx}" fill="${BLUE}"/><path d="M42 17H24a3 3 0 0 0-3 3v24a3 3 0 0 0 3 3h18M21 32h17" stroke="#04121f" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`;
fs.writeFileSync(path.join(IMG, 'favicon.svg'), icon(64, 14) + '\n');

const ogHtml = (cat) => {
  const c = cat ? covers[cat] : { a: '#05070a', b: '#0a6cb3' };
  const sub = cat ? JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'config.json'), 'utf8')).categorias[cat].nome : 'Descubra a taxa real do seu financiamento';
  return `<html><body style="margin:0;width:1200px;height:630px;font-family:Inter,system-ui,sans-serif;background:linear-gradient(135deg,${c.a},${c.b});color:#fff;display:flex;flex-direction:column;justify-content:center;padding:0 90px;box-sizing:border-box;position:relative;overflow:hidden">
<div style="position:absolute;right:-120px;top:-160px;width:620px;height:620px;border-radius:50%;background:${BLUE};opacity:.35;filter:blur(40px)"></div>
<div style="display:flex;align-items:center;gap:22px;font-weight:800;font-size:64px;letter-spacing:.04em">ERASE<span style="width:3px;height:56px;background:rgba(255,255,255,.5)"></span><span style="font-size:26px;font-weight:600;letter-spacing:.24em;color:${BLUE}">REVISIONAL</span></div>
<div style="font-size:${cat ? 64 : 60}px;font-weight:800;line-height:1.1;margin-top:40px;max-width:900px">${sub}</div>
<div style="font-size:28px;opacity:.85;margin-top:22px">Calculadora gratuita de juros de financiamento de veículos</div></body></html>`;
};

(async () => {
  let chromium;
  try { chromium = require('playwright').chromium; }
  catch (e) { chromium = require(path.join(require('child_process').execSync('npm root -g').toString().trim(), 'playwright')).chromium; }
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const shot = async (html, w, h, file) => {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.setContent(html); await p.waitForTimeout(150);
    await p.screenshot({ path: path.join(IMG, file) }); await p.close();
  };
  await shot(ogHtml(null), 1200, 630, 'og-image.png');
  for (const k of Object.keys(covers)) await shot(ogHtml(k), 1200, 630, `og-article-${k}.png`);
  await shot(`<body style="margin:0">${icon(32, 7)}</body>`, 32, 32, 'favicon-32.png');
  await shot(`<body style="margin:0">${icon(180, 0)}</body>`, 180, 180, 'apple-touch-icon.png');
  await b.close();
  console.log('Imagens geradas em assets/img');
})();
