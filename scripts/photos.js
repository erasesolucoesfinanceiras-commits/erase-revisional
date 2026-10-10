#!/usr/bin/env node
// Foto de capa dos artigos (Pixabay, licença livre p/ uso comercial). Usa PIXABAY_API_KEY.
// As imagens são BAIXADAS e salvas em assets/img/news (o Pixabay proíbe hotlink).
//   node scripts/photos.js          -> preenche `foto` dos artigos que ainda não têm (e roda o build)
// Importável: fetchPhoto(slug, consulta, usadas, { categoria, titulo }) -> objeto `foto` ou null (nunca lança).
// Sem foto adequada: devolve null e o site usa a imagem padrão (capa SVG da categoria).
// Escolha: só entram fotos RELACIONADAS ao assunto (as etiquetas da foto têm de conter termos do tema: carro, veículo, contrato,
// documento...), sem etiquetas impróprias, e que passem num filtro visual do Gemini (sem imagem sexual, violenta ou perturbadora).
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ARTICLES = path.join(ROOT, 'data', 'articles.json');
const DIR = path.join(ROOT, 'assets', 'img', 'news');
const WIDTHS = [480, 960, 1280]; // manter igual a PHOTO_WIDTHS em site.js
const VEICULO = 'car cars vehicle vehicles auto automobile motorcycle motorbike truck road driving dealership showroom contract contracts document documents signing signature insurance'.split(' ');
// Buscas de reserva (em inglês), em ordem, ligadas ao assunto da categoria.
const FALLBACK_Q = {
  revisional: 'car loan contract', financeiro: 'car financing documents', mercado: 'new cars dealership',
  'energia-solar': 'solar panels roof', imoveis: 'house keys real estate', 'consorcio-seguros': 'car insurance documents',
  'credito-pessoal': 'credit card payment', 'credito-rural': 'tractor farm field', 'empresas-mei': 'small business owner',
  economia: 'economy finance chart',
};
const MAIS_BUSCAS = { revisional: ['car contract signing', 'vehicle documents'], financeiro: ['car buying contract', 'vehicle financing'], mercado: ['car showroom', 'cars road'], 'consorcio-seguros': ['vehicle insurance', 'car contract'] };
// Termos que as etiquetas da foto precisam ter para valer como "ligada ao assunto".
const TEMA = {
  revisional: VEICULO, financeiro: VEICULO, mercado: VEICULO, 'consorcio-seguros': VEICULO,
  'energia-solar': 'solar panel panels energy roof photovoltaic'.split(' '), imoveis: 'house home real estate apartment building keys mortgage'.split(' '),
  'credito-pessoal': 'credit card payment debt bank money wallet'.split(' '), 'credito-rural': 'tractor farm field agriculture harvest crop machinery'.split(' '),
  'empresas-mei': 'business shop office entrepreneur store small worker'.split(' '), economia: 'economy finance chart money bank graph inflation'.split(' '),
};
const IMPROPRIAS = new Set('nude naked sexy erotic lingerie bikini porn violence blood corpse dead death murder war weapon gun rifle skull terror explosion drug drugs injury accident crash wreck hospital surgery'.split(' '));
let motivo = '';

const tagsDe = (p) => String(p.tags || '').toLowerCase().split(/[,\s]+/).filter(Boolean);
/** Pontos de relação com o assunto: etiquetas da foto que estão nos termos do tema. 0 = não serve. */
function relacao(p, categoria) {
  const t = tagsDe(p);
  if (t.some((x) => IMPROPRIAS.has(x))) return -1;
  const termos = new Set(TEMA[categoria] || []);
  return t.filter((x) => termos.has(x)).length;
}

/** Filtro visual (Gemini): sem imagem sexual, violenta ou perturbadora e ligada ao assunto. Se o Gemini não responder, vale o filtro por etiquetas + safesearch. */
async function visaoAprova(buf, titulo, categoria) {
  try {
    const { chamar, extrairJSON } = require('./noticias/gemini');
    const sharp = require('sharp');
    const mini = await sharp(buf).resize({ width: 640 }).jpeg({ quality: 70 }).toBuffer();
    const { texto } = await chamar({ imagem: { mime: 'image/jpeg', base64: mini.toString('base64') }, temperatura: 0.1, sistema: 'Você é um moderador de imagens de um portal de notícias financeiras. Responda apenas JSON.',
      prompt: `Avalie esta foto para ilustrar um artigo sobre "${titulo || categoria}" (crédito e financiamento, foco em veículos).\nResponda APENAS JSON: {"segura": true|false, "relacionada": true|false, "motivo": "uma frase"}\n"segura" = false se tiver conteúdo sexual, nudez, violência, sangue, armas, acidente grave, sofrimento, ou qualquer coisa perturbadora ou imprópria para Google/redes sociais.\n"relacionada" = false se os objetos principais não tiverem relação com o assunto (por exemplo, uma casinha de madeira num artigo sobre financiamento de veículo).` });
    const r = extrairJSON(texto);
    if (r.segura !== true) return { ok: false, motivo: 'filtro visual: imagem imprópria (' + String(r.motivo || '').slice(0, 80) + ')' };
    if (r.relacionada !== true) return { ok: false, motivo: 'filtro visual: sem relação com o assunto (' + String(r.motivo || '').slice(0, 80) + ')' };
    return { ok: true };
  } catch (e) { console.error('Filtro visual indisponível (' + e.message.slice(0, 80) + '): vale o filtro por etiquetas.'); return { ok: true, semVisao: true }; }
}

async function fetchPhoto(slug, consulta, usadas = [], ctx = {}) {
  motivo = '';
  const key = process.env.PIXABAY_API_KEY;
  if (!key) { motivo = 'PIXABAY_API_KEY ausente'; console.error('PIXABAY_API_KEY ausente: artigo ficará com a imagem padrão.'); return null; }
  const categoria = ctx.categoria;
  const buscas = [...new Set([consulta, FALLBACK_Q[categoria], ...(MAIS_BUSCAS[categoria] || [])].filter(Boolean))];
  try {
    const sharp = require('sharp');
    const rejeitadas = [];
    for (const q of buscas) {
      const r = await fetch(`https://pixabay.com/api/?key=${key}&q=${encodeURIComponent(q)}&image_type=photo&orientation=horizontal&safesearch=true&min_width=1280&per_page=50&lang=en`);
      if (!r.ok) { rejeitadas.push(`busca "${q}": Pixabay HTTP ${r.status}`); continue; }
      const hits = ((await r.json()).hits || []).filter((x) => !usadas.includes(x.id)).map((x) => ({ x, pts: relacao(x, categoria) })).filter((h) => h.pts > 0).sort((a, b) => b.pts - a.pts);
      if (!hits.length) { rejeitadas.push(`busca "${q}": nenhuma foto com etiquetas ligadas ao assunto`); continue; }
      for (const { x: p } of hits.slice(0, 4)) {
        const img = await fetch(p.largeImageURL); // 1280 px de largura
        if (!img.ok) { rejeitadas.push(`download HTTP ${img.status}`); continue; }
        const buf = Buffer.from(await img.arrayBuffer());
        const v = await visaoAprova(buf, ctx.titulo, categoria);
        if (!v.ok) { rejeitadas.push(v.motivo + ` [${p.id}]`); continue; }
        fs.mkdirSync(DIR, { recursive: true });
        for (const w of WIDTHS) await sharp(buf).resize({ width: w, withoutEnlargement: true }).webp({ quality: 72 }).toFile(path.join(DIR, `${slug}-${w}.webp`));
        return { id: p.id, autor: p.user, autorUrl: `https://pixabay.com/users/${p.user}-${p.user_id}/`, pagina: p.pageURL };
      }
    }
    motivo = 'nenhuma foto adequada: ' + rejeitadas.slice(-4).join(' | ');
  } catch (e) { motivo = e.message; }
  console.error(`Foto de "${slug}": ${motivo}; usando a imagem padrão do site.`);
  return null;
}

module.exports = { fetchPhoto, FALLBACK_Q, relacao, motivoDaFalha: () => motivo };

if (require.main === module) (async () => {
  const lista = JSON.parse(fs.readFileSync(ARTICLES, 'utf8'));
  let n = 0;
  for (const a of lista.filter((x) => !x.foto)) {
    const f = await fetchPhoto(a.slug, a.foto_busca || FALLBACK_Q[a.categoria], lista.map((x) => x.foto && x.foto.id), { categoria: a.categoria, titulo: a.titulo });
    if (f) { a.foto = f; n++; }
  }
  if (!n) { console.log('Nada a atualizar.'); process.exit(process.env.PIXABAY_API_KEY ? 0 : 1); }
  fs.writeFileSync(ARTICLES, JSON.stringify(lista, null, 2) + '\n');
  require('child_process').execFileSync('node', [path.join(__dirname, 'build.js')], { stdio: 'inherit' });
  console.log(`${n} foto(s) adicionada(s).`);
})();
