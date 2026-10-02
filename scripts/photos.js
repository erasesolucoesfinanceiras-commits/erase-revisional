#!/usr/bin/env node
// Foto de capa dos artigos (Pexels, licença livre p/ uso comercial). Usa PEXELS_API_KEY.
//   node scripts/photos.js          -> preenche `foto` dos artigos que ainda não têm (e roda o build)
// Importável: fetchPhoto(slug, consulta, usadas) -> objeto `foto` ou null (nunca lança; falha = capa SVG de reserva).
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ARTICLES = path.join(ROOT, 'data', 'articles.json');
const DIR = path.join(ROOT, 'assets', 'img', 'news');
const WIDTHS = [480, 960, 1600]; // manter igual a PHOTO_WIDTHS em site.js
const FALLBACK_Q = { revisional: 'contract signing documents', financeiro: 'calculator money finance', mercado: 'cars parked dealership' };

async function fetchPhoto(slug, consulta, usadas = []) {
  const key = process.env.PEXELS_API_KEY;
  if (!key) { console.error('PEXELS_API_KEY ausente: artigo ficará com a capa de desenho.'); return null; }
  try {
    const sharp = require('sharp');
    const r = await fetch(`https://api.pexels.com/v1/search?per_page=20&orientation=landscape&query=${encodeURIComponent(consulta)}`, { headers: { Authorization: key } });
    if (!r.ok) throw new Error('Pexels HTTP ' + r.status);
    const p = ((await r.json()).photos || []).find((x) => x.width >= 1600 && !usadas.includes(x.id));
    if (!p) throw new Error('nenhuma foto para "' + consulta + '"');
    const img = await fetch(`${p.src.original}?auto=compress&cs=tinysrgb&w=1600`);
    if (!img.ok) throw new Error('download HTTP ' + img.status);
    const buf = Buffer.from(await img.arrayBuffer());
    fs.mkdirSync(DIR, { recursive: true });
    for (const w of WIDTHS) await sharp(buf).resize({ width: w, withoutEnlargement: true }).webp({ quality: 72 }).toFile(path.join(DIR, `${slug}-${w}.webp`));
    return { id: p.id, autor: p.photographer, autorUrl: p.photographer_url, pagina: p.url };
  } catch (e) { console.error(`Foto de "${slug}" falhou (${e.message}); mantendo capa de desenho.`); return null; }
}

module.exports = { fetchPhoto, FALLBACK_Q };

if (require.main === module) (async () => {
  const lista = JSON.parse(fs.readFileSync(ARTICLES, 'utf8'));
  let n = 0;
  for (const a of lista.filter((x) => !x.foto)) {
    const f = await fetchPhoto(a.slug, a.foto_busca || FALLBACK_Q[a.categoria], lista.map((x) => x.foto && x.foto.id));
    if (f) { a.foto = f; n++; }
  }
  if (!n) { console.log('Nada a atualizar.'); process.exit(process.env.PEXELS_API_KEY ? 0 : 1); }
  fs.writeFileSync(ARTICLES, JSON.stringify(lista, null, 2) + '\n');
  require('child_process').execFileSync('node', [path.join(__dirname, 'build.js')], { stdio: 'inherit' });
  console.log(`${n} foto(s) adicionada(s).`);
})();
