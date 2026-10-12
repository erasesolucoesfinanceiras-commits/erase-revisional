#!/usr/bin/env node
// Fotos das categorias (Unsplash, licença livre p/ uso comercial) -> assets/img/cat/<categoria>-480|960|1280.webp + créditos em CREDITOS-IMAGENS.md.
// Usa UNSPLASH_ACCESS_KEY. Segue as regras da API do Unsplash: avisa o download (download_location) e credita "Foto de X no Unsplash" com link p/ ambos (utm_source=erase-revisional).
//   node scripts/cat-photos.js                      -> as categorias sem foto
//   CAT_FOTO_CATEGORIAS=economia,imoveis node ...   -> só essas (refaz, mesmo que já tenham foto)
//   CAT_FOTO_EXCLUIR=id1,id2 node ...               -> nunca escolhe essas fotos (use p/ trocar uma foto reprovada)
// O escurecimento do texto é CSS (.cat-tile::after): a foto não é escurecida aqui. A escolha automática é só triagem por texto; conferir o resultado a olho.
const fs = require('fs');
const path = require('path');

const ROOT = process.env.PHOTOS_ROOT || path.join(__dirname, '..');
const DIR = path.join(ROOT, 'assets', 'img', 'cat');
const CRED = path.join(ROOT, 'CREDITOS-IMAGENS.md');
const WIDTHS = [480, 960, 1280]; // igual a PHOTO_WIDTHS em site.js
const UTM = 'utm_source=erase-revisional&utm_medium=referral';
// Buscas (em inglês) por categoria, em ordem: assuntos sem gente em close e sem marca.
const BUSCAS = {
  imoveis: ['apartment building facade', 'residential buildings exterior', 'house exterior'],
  'consorcio-seguros': ['car keys on table', 'insurance documents desk', 'car parked street'],
  'credito-pessoal': ['coins on table', 'wallet and money', 'piggy bank'],
  'credito-rural': ['tractor in field', 'farm field aerial', 'wheat field harvest'],
  'empresas-mei': ['small shop storefront', 'coffee shop counter', 'market stall'],
  revisional: ['calculator and documents desk', 'signing contract pen paper', 'paperwork on desk'],
  mercado: ['cars parked in a row', 'car showroom interior', 'new cars lot'],
  financeiro: ['modern glass office building', 'bank building facade', 'city financial district buildings'],
  'energia-solar': ['solar panels roof', 'solar farm aerial', 'solar panels sky'],
  economia: ['stock market chart screen', 'financial district skyline', 'coins stack growth'],
};
const GENTE = /\b(man|men|woman|women|people|person|boy|girl|child|children|kid|portrait|selfie|farmer|worker|couple|family|crowd|team|businessman|businesswoman|owner|customer|baby|face)\b/i;
const MARCA = /\b(logo|brand|sign|nike|apple|coca|mcdonald|starbucks|visa|mastercard|bank of|itau|bradesco|santander|nubank)\b/i;

const lista = (v) => String(v || '').split(',').map((x) => x.trim()).filter(Boolean);
const textoDe = (p) => [p.alt_description, p.description, ...(p.tags || []).map((t) => t.title)].filter(Boolean).join(' ');
const ok = (p) => p.width >= 1600 && p.width > p.height && !GENTE.test(textoDe(p)) && !MARCA.test(textoDe(p));

async function escolher(cat, key, excluir) {
  const h = { Authorization: `Client-ID ${key}`, 'Accept-Version': 'v1' };
  for (const q of BUSCAS[cat]) {
    const r = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&orientation=landscape&content_filter=high&per_page=30`, { headers: h });
    if (!r.ok) throw new Error(`Unsplash HTTP ${r.status} na busca "${q}"`);
    const p = ((await r.json()).results || []).find((x) => ok(x) && !excluir.includes(x.id));
    if (p) return { p, q, h };
  }
  throw new Error(`nenhuma foto adequada para ${cat}`);
}

function credito(cat, p, q) {
  const u = p.user, link = (url) => `${url}${url.includes('?') ? '&' : '?'}${UTM}`;
  const linha = `| ${cat} | [${u.name}](${link(u.links.html)}) | [Foto de ${u.name} no Unsplash](${link(p.links.html)}) (id ${p.id}; busca "${q}") | Unsplash (uso comercial permitido; crédito mantido por transparência). Foto redimensionada e convertida para WebP, sem outra edição. |`;
  let md = fs.readFileSync(CRED, 'utf8').split('\n').filter((l) => !l.startsWith(`| ${cat} |`) && !l.startsWith('| _(pendente'));
  const i = md.findIndex((l) => l.startsWith('|---')) ;
  md.splice(i + 1, 0, linha);
  fs.writeFileSync(CRED, md.join('\n'));
}

async function main() {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) throw new Error('UNSPLASH_ACCESS_KEY ausente');
  const sharp = require('sharp');
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'config.json'), 'utf8'));
  const pedidas = lista(process.env.CAT_FOTO_CATEGORIAS), excluir = lista(process.env.CAT_FOTO_EXCLUIR);
  const alvos = pedidas.length ? pedidas : Object.keys(config.categorias).filter((c) => BUSCAS[c] && !fs.existsSync(path.join(DIR, `${c}-960.webp`)));
  const falhas = [];
  fs.mkdirSync(DIR, { recursive: true });
  for (const cat of alvos) {
    try {
      if (!BUSCAS[cat]) throw new Error('categoria sem buscas em scripts/cat-photos.js');
      const { p, q, h } = await escolher(cat, key, excluir);
      await fetch(p.links.download_location, { headers: h }); // regra da API: registra o download
      const img = await fetch(`${p.urls.raw}${p.urls.raw.includes('?') ? '&' : '?'}w=1600&q=85&fm=jpg`);
      if (!img.ok) throw new Error('download HTTP ' + img.status);
      const buf = Buffer.from(await img.arrayBuffer());
      for (const w of WIDTHS) await sharp(buf).resize({ width: w, withoutEnlargement: true }).webp({ quality: 72 }).toFile(path.join(DIR, `${cat}-${w}.webp`));
      credito(cat, p, q);
      console.log(`${cat}: ${p.id} (${p.user.name}) ${p.links.html} | ${textoDe(p).slice(0, 100)}`);
    } catch (e) { falhas.push(cat); console.error(`::error::${cat}: ${e.message}`); }
  }
  if (falhas.length) process.exit(1);
}
module.exports = { ok, textoDe, credito };
if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
