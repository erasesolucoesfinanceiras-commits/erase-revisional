#!/usr/bin/env node
// Foto de capa dos artigos (Pixabay, licença livre p/ uso comercial). Usa PIXABAY_API_KEY (+ GEMINI_API_KEY para o filtro visual).
// As imagens são BAIXADAS e salvas em assets/img/news (o Pixabay proíbe hotlink).
//   node scripts/photos.js                          -> preenche `foto` dos artigos que ainda não têm (e roda o build)
//   FOTO_MODO=slug FOTO_SLUG=meu-artigo node ...     -> REFAZ a foto desse artigo (substitui a atual)
//   FOTO_MODO=marcadas node ...                      -> refaz a foto de todos os artigos com `foto_refazer: true`
// Importável: fetchPhoto(slug, consulta, usadas, { categoria, titulo }) -> objeto `foto` ou null (nunca lança).
// Sem foto adequada: null e o site usa a imagem padrão (capa SVG da categoria).
// Escolha: só entram fotos RELACIONADAS ao assunto (as etiquetas da foto têm de conter termos do tema: carro, veículo, contrato,
// documento...), sem etiquetas impróprias, com fotos de pessoas por último, e que passem num filtro visual do Gemini
// (sem imagem sexual, violenta ou perturbadora, sem pessoa reconhecível em destaque, ligada ao assunto).
const fs = require('fs');
const path = require('path');

const ROOT = process.env.PHOTOS_ROOT || path.join(__dirname, '..'); // PHOTOS_ROOT: só para testes
const ARTICLES = path.join(ROOT, 'data', 'articles.json');
const LOG = path.join(ROOT, 'data', 'noticias-log.jsonl');
const DIR = path.join(ROOT, 'assets', 'img', 'news');
const WIDTHS = [480, 960, 1280]; // manter igual a PHOTO_WIDTHS em site.js
const PIXABAY = process.env.PIXABAY_BASE || 'https://pixabay.com/api/';
const VEICULO = 'car cars vehicle vehicles auto automobile motorcycle motorbike truck road driving dealership showroom contract contracts document documents signing signature insurance'.split(' ');
// Buscas de reserva (em inglês), em ordem, ligadas ao assunto da categoria.
const FALLBACK_Q = {
  revisional: 'car keys contract', financeiro: 'car loan paperwork', mercado: 'new cars dealership',
  'energia-solar': 'solar panels roof', imoveis: 'house keys real estate', 'consorcio-seguros': 'car insurance documents',
  'credito-pessoal': 'credit card payment', 'credito-rural': 'tractor farm field', 'empresas-mei': 'small business owner',
  economia: 'economy finance chart',
};
const MAIS_BUSCAS = { revisional: ['vehicle documents', 'car dealership', 'car purchase contract'], financeiro: ['vehicle documents', 'car purchase contract', 'car dealership'], mercado: ['car showroom', 'cars road'], 'consorcio-seguros': ['vehicle insurance', 'car contract'] };
// Termos que as etiquetas da foto precisam ter para valer como "ligada ao assunto".
const TEMA = {
  revisional: VEICULO, financeiro: VEICULO, mercado: [...VEICULO, ...'tractor machinery harvester combine farm agriculture'.split(' ')], 'consorcio-seguros': VEICULO,
  'energia-solar': 'solar panel panels energy roof photovoltaic'.split(' '), imoveis: 'house home real estate apartment building keys mortgage'.split(' '),
  'credito-pessoal': 'credit card payment debt bank money wallet'.split(' '), 'credito-rural': 'tractor farm field agriculture harvest crop machinery'.split(' '),
  'empresas-mei': 'business shop office entrepreneur store small worker'.split(' '), economia: 'economy finance chart money bank graph inflation'.split(' '),
};
const IMPROPRIAS = new Set('nude naked sexy erotic lingerie bikini porn violence blood corpse dead death murder war weapon gun rifle skull terror explosion drug drugs injury accident crash wreck hospital surgery'.split(' '));
const PESSOAS = new Set('portrait face selfie woman man girl boy child children people person couple family men women businessman businesswoman'.split(' '));
let motivo = '', escolha = null;

const tagsDe = (p) => String(p.tags || '').toLowerCase().split(/[,\s]+/).filter(Boolean);
/** Pontos de relação com o assunto: etiquetas da foto que estão nos termos do tema. 0 = não serve; -1 = etiqueta imprópria. */
function relacao(p, categoria) {
  const t = tagsDe(p);
  if (t.some((x) => IMPROPRIAS.has(x))) return -1;
  const termos = new Set(TEMA[categoria] || []);
  return t.filter((x) => termos.has(x)).length;
}

/** Filtro visual (Gemini): sem imagem sexual/violenta/perturbadora, sem pessoa reconhecível em destaque, ligada ao assunto. Sem Gemini, valem as etiquetas + safesearch. */
async function visaoAprova(buf, titulo, categoria) {
  try {
    const { chamar, extrairJSON } = require('./noticias/gemini');
    const sharp = require('sharp');
    const mini = await sharp(buf).resize({ width: 640 }).jpeg({ quality: 70 }).toBuffer();
    const { texto } = await chamar({ imagem: { mime: 'image/jpeg', base64: mini.toString('base64') }, temperatura: 0.1, sistema: 'Você é um moderador de imagens de um portal de notícias financeiras. Responda apenas JSON.',
      prompt: `Avalie esta foto para ilustrar um artigo sobre "${titulo || categoria}" (crédito e financiamento, foco em veículos).\nResponda APENAS JSON: {"segura": true|false, "relacionada": true|false, "pessoas_em_destaque": true|false, "motivo": "uma frase"}\n"segura" = false se tiver conteúdo sexual, nudez, violência, sangue, armas, acidente grave, sofrimento, ou qualquer coisa perturbadora ou imprópria para Google/redes sociais.\n"relacionada" = false se os objetos principais não tiverem relação com o assunto (por exemplo, uma casinha de madeira, um martelo de juiz ou uma calculadora num artigo sobre fraude em financiamento de veículo).\n"pessoas_em_destaque" = true se houver uma pessoa ou rosto reconhecível em primeiro plano (mãos ou silhuetas distantes não contam).` });
    const r = extrairJSON(texto);
    if (r.segura !== true) return { ok: false, motivo: 'filtro visual: imagem imprópria (' + String(r.motivo || '').slice(0, 80) + ')' };
    if (r.pessoas_em_destaque === true) return { ok: false, motivo: 'filtro visual: pessoa reconhecível em destaque' };
    if (r.relacionada !== true) return { ok: false, motivo: 'filtro visual: sem relação com o assunto (' + String(r.motivo || '').slice(0, 80) + ')' };
    return { ok: true };
  } catch (e) { console.error('Filtro visual indisponível (' + e.message.slice(0, 80) + '): vale o filtro por etiquetas.'); return { ok: true, semVisao: true }; }
}

/**
 * Escolhe a foto: percorre as buscas em ordem; em cada uma só vale foto com etiquetas ligadas ao assunto (fotos com pessoas ficam por
 * último) e que passe no filtro visual. deps = { buscar(q) -> hits, baixar(url) -> Buffer, visao(buf, titulo, categoria) -> { ok, motivo, semVisao } }.
 */
async function escolher({ buscas, usadas = [], categoria, titulo, deps }) {
  const rejeitadas = []; let buscasOk = 0;
  for (const q of buscas) {
    let hits;
    try { hits = await deps.buscar(q); buscasOk++; } catch (e) { rejeitadas.push(`busca "${q}": ${e.message}`); continue; }
    const cand = hits.filter((x) => !usadas.includes(x.id)).map((x) => ({ x, pts: relacao(x, categoria), pessoas: tagsDe(x).some((t) => PESSOAS.has(t)) })).filter((h) => h.pts > 0)
      .sort((a, b) => (a.pessoas - b.pessoas) || (b.pts - a.pts));
    if (!cand.length) { rejeitadas.push(`busca "${q}": nenhuma foto com etiquetas ligadas ao assunto`); continue; }
    for (const h of cand.slice(0, 4)) {
      let buf; try { buf = await deps.baixar(h.x.largeImageURL); } catch (e) { rejeitadas.push(e.message); continue; }
      const v = await deps.visao(buf, titulo, categoria);
      if (!v.ok) { rejeitadas.push(`${v.motivo} [${h.x.id}]`); continue; }
      return { hit: h.x, buf, meta: { consulta: q, pontos: h.pts, tags: tagsDe(h.x).slice(0, 8), com_pessoas_nas_etiquetas: h.pessoas, filtro_visual: v.semVisao ? 'indisponível (valeram as etiquetas)' : 'aprovada', porque: `etiquetas ligadas ao assunto (${h.pts} termo(s) do tema) na busca "${q}"${h.pessoas ? '; foto com pessoas só porque não havia opção sem' : ''}` } };
    }
  }
  // nenhuma busca funcionou = problema do Pixabay/rede, não falta de foto adequada: quem chama não deve apagar a foto atual por isso
  return { motivo: (buscasOk ? 'nenhuma foto adequada: ' : 'busca indisponível: ') + rejeitadas.slice(-4).join(' | ') };
}

const buscasDe = (consulta, categoria) => [...new Set([].concat(consulta || [], FALLBACK_Q[categoria], MAIS_BUSCAS[categoria] || []).filter(Boolean))];

async function fetchPhoto(slug, consulta, usadas = [], ctx = {}) {
  motivo = ''; escolha = null;
  const key = process.env.PIXABAY_API_KEY;
  if (!key) { motivo = 'PIXABAY_API_KEY ausente'; console.error('PIXABAY_API_KEY ausente: artigo ficará com a imagem padrão.'); return null; }
  try {
    const sharp = require('sharp');
    const deps = {
      buscar: async (q) => { const r = await fetch(`${PIXABAY}?key=${key}&q=${encodeURIComponent(q)}&image_type=photo&orientation=horizontal&safesearch=true&min_width=1280&per_page=50&lang=en`); if (!r.ok) throw new Error('Pixabay HTTP ' + r.status); return (await r.json()).hits || []; },
      baixar: async (url) => { const i = await fetch(url); if (!i.ok) throw new Error('download HTTP ' + i.status); return Buffer.from(await i.arrayBuffer()); },
      visao: visaoAprova,
    };
    const e = await escolher({ buscas: buscasDe(consulta, ctx.categoria), usadas, categoria: ctx.categoria, titulo: ctx.titulo, deps });
    if (e.hit) {
      fs.mkdirSync(DIR, { recursive: true });
      for (const w of WIDTHS) await sharp(e.buf).resize({ width: w, withoutEnlargement: true }).webp({ quality: 72 }).toFile(path.join(DIR, `${slug}-${w}.webp`));
      const p = e.hit; escolha = { foto_id: p.id, autor: p.user, pagina: p.pageURL, ...e.meta };
      return { id: p.id, autor: p.user, autorUrl: `https://pixabay.com/users/${p.user}-${p.user_id}/`, pagina: p.pageURL };
    }
    motivo = e.motivo;
  } catch (e) { motivo = e.message; }
  console.error(`Foto de "${slug}": ${motivo}; usando a imagem padrão do site.`);
  return null;
}

/** Refaz/preenche fotos na lista (muta a lista). modo: faltantes | marcadas | slug. fetchFn e logFn existem para teste. Devolve os resultados por artigo. */
async function processar(lista, { modo = 'faltantes', slug = '' }, fetchFn = fetchPhoto, logFn = () => {}, apagar = (a) => { for (const w of WIDTHS) fs.rmSync(path.join(DIR, `${a.slug}-${w}.webp`), { force: true }); }) {
  const alvos = modo === 'slug' ? lista.filter((a) => a.slug === slug) : modo === 'marcadas' ? lista.filter((a) => a.foto_refazer) : lista.filter((a) => !a.foto);
  if (modo === 'slug' && !alvos.length) throw new Error(`Não há artigo com o slug "${slug}".`);
  const refazendo = modo !== 'faltantes', res = [];
  for (const a of alvos) {
    const usadas = lista.map((x) => x.foto && x.foto.id).filter(Boolean); // inclui a foto atual: a nova tem de ser outra
    const f = await fetchFn(a.slug, [].concat(a.foto_buscas || [], a.foto_busca || []), usadas, { categoria: a.categoria, titulo: a.titulo });
    if (f) { a.foto = f; delete a.foto_refazer; const e = module.exports.ultimaEscolha(); logFn('foto_escolhida', { slug: a.slug, modo, ...(e || {}) }); res.push({ slug: a.slug, resultado: 'trocada', foto: f.id }); }
    else if (refazendo && /^(busca indisponível|PIXABAY_API_KEY)/.test(module.exports.motivoDaFalha())) { logFn('foto_mantida', { slug: a.slug, modo, motivo: module.exports.motivoDaFalha() }); res.push({ slug: a.slug, resultado: 'mantida' }); } // falha de infraestrutura: não troca a foto por causa disso
    else if (refazendo) { delete a.foto; delete a.foto_refazer; apagar(a); logFn('foto_padrao', { slug: a.slug, modo, motivo: module.exports.motivoDaFalha() || 'sem foto adequada' }); res.push({ slug: a.slug, resultado: 'padrao' }); }
    else { logFn('foto_padrao', { slug: a.slug, modo, motivo: module.exports.motivoDaFalha() || 'sem foto adequada' }); res.push({ slug: a.slug, resultado: 'sem_foto' }); }
  }
  return res;
}

module.exports = { fetchPhoto, FALLBACK_Q, relacao, escolher, processar, buscasDe, motivoDaFalha: () => motivo, ultimaEscolha: () => escolha };

if (require.main === module) (async () => {
  const lista = JSON.parse(fs.readFileSync(ARTICLES, 'utf8'));
  const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  const log = (evento, dados) => { fs.appendFileSync(LOG, JSON.stringify({ quando: new Date().toISOString(), data: hoje, evento, origem: 'fotos', ...dados }) + '\n'); console.log(`[${evento}] ${dados.slug} ${dados.porque || dados.motivo || ''}`); };
  const res = await processar(lista, { modo: process.env.FOTO_MODO || 'faltantes', slug: process.env.FOTO_SLUG || '' }, fetchPhoto, log);
  const mudou = res.filter((r) => ['trocada', 'padrao'].includes(r.resultado)).length;
  if (!mudou) { console.log('Nada a atualizar.'); process.exit(process.env.PIXABAY_API_KEY ? 0 : 1); }
  fs.writeFileSync(ARTICLES, JSON.stringify(lista, null, 2) + '\n');
  require('child_process').execFileSync('node', [path.join(__dirname, 'build.js')], { stdio: 'inherit' });
  console.log(res.map((r) => `${r.slug}: ${r.resultado}`).join('\n'));
})().catch((e) => { console.error(e.message); process.exit(1); });
