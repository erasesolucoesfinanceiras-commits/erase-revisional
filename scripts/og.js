#!/usr/bin/env node
// Imagens de prévia (Open Graph / WhatsApp): JPG 1200x630 com menos de 150 KB. Precisa do sharp (os workflows já o instalam).
//   node scripts/og.js              -> gera as que faltam: og-image.jpg, og-article-<categoria>.jpg (a partir dos PNGs) e og/<slug>.jpg (a partir da foto do artigo)
//   OG_REFAZER=1 node scripts/og.js -> refaz todas
// Importável: ogDoArtigo(slug) (usado por scripts/photos.js logo depois de salvar a foto do artigo).
const fs = require('fs');
const path = require('path');
const ROOT = process.env.PHOTOS_ROOT || path.join(__dirname, '..');
const IMG = path.join(ROOT, 'assets', 'img');
const MAX = 150 * 1024;

/** Grava `dest` (JPG 1200x630, cover) a partir de `src`; baixa a qualidade até ficar abaixo de ~140 KB. Devolve o tamanho. */
async function jpg(src, dest) {
  const sharp = require('sharp');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  let buf;
  for (const q of [82, 74, 66, 58, 50, 42]) {
    buf = await sharp(src).resize(1200, 630, { fit: 'cover', position: 'attention' }).jpeg({ quality: q, mozjpeg: true, progressive: true }).toBuffer();
    if (buf.length < MAX - 10 * 1024) break;
  }
  fs.writeFileSync(dest, buf);
  return buf.length;
}
/** og/<slug>.jpg a partir da foto do artigo (assets/img/news/<slug>-1280.webp). Sem foto: não faz nada (o site usa a imagem da categoria). */
async function ogDoArtigo(slug) {
  const src = path.join(IMG, 'news', `${slug}-1280.webp`);
  if (!fs.existsSync(src)) return 0;
  return jpg(src, path.join(IMG, 'og', `${slug}.jpg`));
}

async function main() {
  const refazer = process.env.OG_REFAZER === '1', precisa = (d) => refazer || !fs.existsSync(d);
  const feitos = [];
  const png = fs.readdirSync(IMG).filter((f) => /^og-(image|article-.+)\.png$/.test(f));
  for (const f of png) { const d = path.join(IMG, f.replace(/\.png$/, '.jpg')); if (precisa(d)) feitos.push([f, await jpg(path.join(IMG, f), d)]); }
  const arts = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'articles.json'), 'utf8'));
  for (const a of arts) { const d = path.join(IMG, 'og', `${a.slug}.jpg`); if (a.foto && precisa(d)) feitos.push([a.slug, await ogDoArtigo(a.slug)]); }
  for (const [n, t] of feitos) console.log(`${n}: ${(t / 1024).toFixed(0)} KB`);
  console.log(`${feitos.length} imagem(ns) de prévia gerada(s).`);
}
module.exports = { jpg, ogDoArtigo };
if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
