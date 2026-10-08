#!/usr/bin/env node
// Notícias 100% automáticas, sem Pull Request: 1 artigo a cada 2 dias + 1 nota ("Radar") por dia, só com novidade real.
// Cada texto passa por verificações automáticas e por uma 2ª revisão por IA antes de ir ao ar.
//   GEMINI_API_KEY=... node scripts/noticias/run.js                      (publica o que estiver na vez, modo "publicar")
//   GEMINI_API_KEY=... MODO=amostra node scripts/noticias/run.js          (gera 3 artigos + 1 nota em amostras/, sem publicar)
// Variáveis: FORCAR_ARTIGO=1 (ignora o "a cada 2 dias", mas continua valendo 1 artigo por dia), DATA=AAAA-MM-DD (testes).
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chamar, extrairJSON, ErroGemini } = require('./gemini');
const { TEMAS, ordemDeTemas } = require('./temas');
const P = require('./prompts');
const V = require('./verificar');
const { revisar, revisarNeutralidade } = require('./revisor');
const N = require('./numeros');
const { coletar } = require('./fontes');
const { fetchPhoto, FALLBACK_Q } = require('../photos');

const ROOT = path.join(__dirname, '..', '..');
const DATA_DIR = process.env.DADOS_DIR || path.join(ROOT, 'data');
const F_ART = path.join(DATA_DIR, 'articles.json'), F_NOTAS = path.join(DATA_DIR, 'notas.json'), F_DESP = path.join(DATA_DIR, 'despublicados.json');
const MODO = process.env.MODO === 'amostra' ? 'amostra' : 'publicar';
const AMOSTRAS = path.join(ROOT, 'amostras');
const F_LOG = MODO === 'amostra' ? path.join(AMOSTRAS, 'log.jsonl') : path.join(DATA_DIR, 'noticias-log.jsonl');
const config = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'config.json'), 'utf8'));

const hoje = process.env.DATA || new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10); // data de Brasília
const epochDay = Math.floor(Date.parse(hoje + 'T00:00:00Z') / 864e5);
const lerJSON = (f, vazio) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return vazio; throw e; } };
const gravarJSON = (f, v) => fs.writeFileSync(f, JSON.stringify(v, null, 2) + '\n');
let houveErro = false;
const PRAZO = Date.now() + Number(process.env.NOTICIAS_MINUTOS || (MODO === 'amostra' ? 40 : 25)) * 60e3; // orçamento de tempo do job
const semTempo = () => Date.now() > PRAZO;

function log(evento, dados) {
  const linha = { quando: new Date().toISOString(), data: hoje, evento, ...dados };
  fs.mkdirSync(path.dirname(F_LOG), { recursive: true });
  fs.appendFileSync(F_LOG, JSON.stringify(linha) + '\n');
  console.log(`[${evento}] ${dados.tipo || ''} ${dados.tema || ''} ${dados.titulo ? '— ' + dados.titulo : ''} ${dados.motivos ? '| ' + [].concat(dados.motivos).join(' ; ') : dados.motivo || ''}`);
}

const PERMITIDAS = new Set(['p', 'h2', 'h3', 'ul', 'ol', 'li', 'strong', 'em', 'a', 'blockquote', 'br']);
/** Só tags simples, sem atributos (nem links dentro do corpo: as fontes ficam no rodapé do artigo). */
function sanitizar(html) {
  return String(html)
    .replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?([a-z0-9]+)[^>]*>/gi, (m, tag) => {
      tag = tag.toLowerCase();
      if (!PERMITIDAS.has(tag) || tag === 'a') return '';
      return m.startsWith('</') ? `</${tag}>` : `<${tag}>`;
    }).trim();
}
const slugify = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

// Despublicados (data/despublicados.json) ficam na lista de "assuntos já tratados" para sempre: o robô não republica o mesmo assunto.
const despublicados = lerJSON(F_DESP, []);
const urlsBloqueadas = new Set(despublicados.flatMap((d) => d.urls || []));
function recentesDe(artigos, notas) {
  const lim = new Date(hoje + 'T12:00:00Z'); lim.setUTCDate(lim.getUTCDate() - 15);
  const corte = lim.toISOString().slice(0, 10);
  return [...[...artigos, ...notas].filter((x) => x.data >= corte), ...despublicados.map((d) => ({ ...d, fontes: (d.urls || []).map((url) => ({ url })) }))]
    .map((x) => ({ titulo: x.titulo, resumo: x.resumo, texto: x.texto, fontes: x.fontes || (x.fonte && x.fonte.url ? [x.fonte] : []) }));
}

const TEMAS_SEM_POLITICA = ['revisional', 'mercado'];
const FALA_DE_GOVERNO = /governo|congresso|c[âa]mara|senado|ministr|presidente|projeto de lei|medida provis|decreto|stf|supremo|stj|banco central|copom|cmn|eleiç|lei n/i;
/** Temas de política/economia (e qualquer texto que fale de governo/Congresso/Judiciário) passam também pela revisão de neutralidade. */
const precisaNeutralidade = (tema, txt) => !TEMAS_SEM_POLITICA.includes(tema) || FALA_DE_GOVERNO.test(txt);

/** Escreve, verifica e revisa (até 2 vezes: original + 1 reescrita). Devolve { status: aprovado|sem_novidade|reprovado, rascunho? }. */
async function tentarTema(tipo, tema, modo, recentes) {
  const T = TEMAS[tema];
  const diasMax = tipo === 'nota' ? 3 : 14;
  const cands = (await coletar(tema, T, { hoje, diasMax, oficial: modo === 'guia' })).filter((c) => !urlsBloqueadas.has(c.url));
  const minimo = modo === 'guia' ? 2 : 2;
  if (cands.length < minimo) { log('pulado', { tipo, tema, motivo: `sem novidade: só ${cands.length} fonte(s) legível(is) dos últimos ${diasMax} dias` }); return { status: 'sem_novidade' }; }
  let anterior = null, motivosAnt = [];
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    const { texto } = await chamar({ prompt: P.escritor({ tipo, modo, tema: T, hoje, recentes, anterior, motivos: motivosAnt, cands }), temperatura: 0.6 });
    let r;
    try { r = extrairJSON(texto); } catch (e) { r = null; }
    if (r && r.sem_novidade === true) {
      if (tentativa === 1) { log('pulado', { tipo, tema, motivo: 'sem novidade real: ' + String(r.motivo || '').slice(0, 200) }); return { status: 'sem_novidade' }; }
      log('reprovado', { tipo, tema, tentativa, motivos: ['reescrita impossível com as fontes reais'] }); return { status: 'reprovado' };
    }
    let motivos = [];
    const revisoes = {};
    if (!r || !r.titulo) motivos = ['resposta fora do formato JSON esperado'];
    else {
      r.titulo = String(r.titulo).trim();
      if (tipo === 'nota') r.texto = String(r.texto || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      else { r.corpo = sanitizar(r.corpo || ''); r.resumo = String(r.resumo || '').trim(); }
      const fo = V.checarFontes(r, tipo, modo, cands, hoje, diasMax);
      motivos = V.checarRegras(r, tipo, { recentes });
      motivos.push(...fo.motivos);
      const copia = V.trechoCopiado(tipo === 'nota' ? r.texto : V.semHtml(r.corpo), fo.textos);
      if (copia) motivos.push(`copia trecho da fonte ("${copia}...")`);
      // números: todo número/percentual/valor/data do texto tem de aparecer nas fontes coletadas
      const textoArtigo = tipo === 'nota' ? `${r.titulo}. ${r.texto}` : `${r.titulo}. ${r.resumo}. ${r.corpo}`;
      const num = N.conferir(textoArtigo, r.fontes, [...r.fontes.map((f) => f.data), hoje].join(' '), hoje);
      if (num.faltando.length) motivos.push(`número(s) que não aparecem nas fontes: ${num.faltando.slice(0, 6).map((x) => `"${x.raw}" (em: ${x.frase.slice(0, 90)})`).join('; ')}`);
      if (!motivos.length) {
        const rev = await revisar({ tipo, hoje, rascunho: r, recentes, pares: num.pares });
        revisoes.geral = rev.criterios; motivos = rev.motivos;
        if (!motivos.length && precisaNeutralidade(tema, textoArtigo)) {
          const neu = await revisarNeutralidade({ tipo, rascunho: r });
          revisoes.neutralidade = neu.criterios; motivos = neu.motivos.map((m) => 'neutralidade/' + m);
        }
      }
    }
    if (!motivos.length) { r.revisoes = revisoes; return { status: 'aprovado', rascunho: r }; }
    log('reprovado', { tipo, tema, tentativa, titulo: r && r.titulo, motivos, revisao: revisoes });
    anterior = r ? { titulo: r.titulo, resumo: r.resumo, corpo: r.corpo, texto: r.texto, fontes_usadas: r.fontes_usadas } : null;
    motivosAnt = motivos;
    if (!anterior) break;
  }
  return { status: 'reprovado' };
}

/** Percorre os temas na ordem; só se NENHUM tiver novidade (artigo) cai no guia explicativo. */
async function produzir(tipo, ordem, recentes, { semGuia = false } = {}) {
  let houveNovidade = false;
  for (const tema of ordem) {
    if (semTempo()) { log('sem_publicacao', { tipo, motivo: 'orçamento de tempo do dia esgotado' }); return null; }
    const r = await tentarTema(tipo, tema, 'noticia', recentes);
    if (r.status === 'aprovado') return { tema, modo: 'noticia', rascunho: r.rascunho };
    if (r.status === 'reprovado') houveNovidade = true;
  }
  if (tipo === 'artigo' && !houveNovidade && !semGuia) {
    log('guia', { tipo, motivo: 'nenhum tema tem novidade: tentando artigo explicativo com fontes oficiais' });
    for (const tema of ordem.slice(0, 3)) {
      const r = await tentarTema(tipo, tema, 'guia', recentes);
      if (r.status === 'aprovado') return { tema, modo: 'guia', rascunho: r.rascunho };
    }
  }
  log('sem_publicacao', { tipo, motivo: houveNovidade ? 'todos os textos foram reprovados' : 'nenhum tema com novidade real' });
  return null;
}

const limparFontes = (fs_) => fs_.map(({ nome, url, data }) => ({ nome, url, ...(data && { data }) }));

async function publicarArtigo({ tema, modo, rascunho: r }, artigos) {
  let slug = slugify(r.titulo), n = 2;
  while (artigos.some((a) => a.slug === slug)) slug = `${slugify(r.titulo)}-${n++}`;
  const foto_busca = String(r.foto_busca || '').trim().slice(0, 60) || FALLBACK_Q[tema];
  const foto = await fetchPhoto(slug, foto_busca, artigos.map((a) => a.foto && a.foto.id));
  const art = { slug, categoria: tema, titulo: r.titulo, resumo: r.resumo, data: hoje, fontes: limparFontes(r.fontes), corpo: r.corpo, foto_busca, ...(modo === 'guia' && { tipo: 'guia' }), ...(foto && { foto }) };
  artigos.unshift(art);
  return art;
}
function criarNota({ tema, rascunho: r }, notas) {
  let id = `${hoje}-${slugify(r.titulo).slice(0, 40).replace(/-+$/, '')}`, n = 2; const base = id;
  while (notas.some((x) => x.id === id)) id = `${base}-${n++}`;
  const nota = { id, data: hoje, categoria: tema, titulo: r.titulo, texto: r.texto, fontes: limparFontes(r.fontes) };
  notas.unshift(nota);
  return nota;
}

function reconstruir(arquivos) {
  const copia = arquivos.map((f) => [f, fs.existsSync(f) ? fs.readFileSync(f) : null]);
  return () => copia.forEach(([f, c]) => (c === null ? fs.rmSync(f, { force: true }) : fs.writeFileSync(f, c)));
}

function salvarAmostra(i, item) {
  fs.mkdirSync(AMOSTRAS, { recursive: true });
  const r = item.rascunho, nome = `${String(i).padStart(2, '0')}-${item.tipo}-${item.tema}`;
  fs.writeFileSync(path.join(AMOSTRAS, nome + '.json'), JSON.stringify({ ...item, rascunho: { ...r, fontes: limparFontes(r.fontes) } }, null, 2) + '\n');
  const txt = item.tipo === 'nota' ? r.texto : String(r.corpo).replace(/<h[23]>/g, '\n### ').replace(/<\/(h[23]|p|li|ul|ol)>/g, '\n').replace(/<li>/g, '- ').replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim();
  const rev = Object.entries(r.revisoes || {}).map(([etapa, cs]) => `**Revisão ${etapa}:**\n` + Object.entries(cs).map(([k, v]) => `- ${k}: ${v.ok ? 'OK' : 'REPROVA'} — ${v.obs}`).join('\n')).join('\n\n');
  const md = [`## ${item.tipo.toUpperCase()} · ${TEMAS[item.tema].nome} (${item.tema}) · ${item.modo}`, `**${r.titulo}**`, r.resumo ? `_${r.resumo}_` : '', txt, 'Fontes: ' + r.fontes.map((f) => `${f.nome} <${f.url}> (${f.data})`).join(' · '), rev, ''].filter(Boolean).join('\n\n');
  fs.appendFileSync(path.join(AMOSTRAS, 'AMOSTRAS.md'), md + '\n\n---\n\n');
}

(async () => {
  const artigos = lerJSON(F_ART, []), notas = lerJSON(F_NOTAS, []);
  for (const t of Object.keys(TEMAS)) if (!config.categorias[t]) throw new Error(`Categoria "${t}" não existe em data/config.json`);
  const recentes = recentesDe(artigos, notas);
  const temasUsados = [];

  if (MODO === 'amostra') {
    fs.rmSync(AMOSTRAS, { recursive: true, force: true });
    let i = 1;
    // amostra ESTRITA: cada artigo é do tema pedido (ou nada) — assim o resultado mostra se o tema passa na calibragem
    for (const inicio of (process.env.AMOSTRA_TEMAS || 'economia,financeiro,energia-solar').split(',')) {
      try {
        const r = await produzir('artigo', [inicio], recentes, { semGuia: true });
        if (r) { salvarAmostra(i++, { tipo: 'artigo', ...r }); temasUsados.push(r.tema); recentes.push({ titulo: r.rascunho.titulo, resumo: r.rascunho.resumo, fontes: r.rascunho.fontes }); }
      } catch (e) { houveErro = true; log('erro', { tipo: 'artigo', tema: inicio, motivo: e.message }); }
    }
    try {
      const r = await produzir('nota', ordemDeTemas(epochDay, temasUsados), recentes);
      if (r) salvarAmostra(i++, { tipo: 'nota', ...r });
    } catch (e) { houveErro = true; log('erro', { tipo: 'nota', motivo: e.message }); }
    console.log(`Amostras em ${AMOSTRAS} (nada foi publicado).`);
    process.exit(houveErro ? 1 : 0);
  }

  // ---- publicar
  const arquivos = [F_ART, F_NOTAS, path.join(ROOT, 'sitemap.xml')];
  const artigoHoje = artigos.some((a) => a.data === hoje);
  const devoArtigo = !artigoHoje && (process.env.FORCAR_ARTIGO === '1' || epochDay % 2 === 0);
  if (!devoArtigo) console.log(artigoHoje ? 'Já existe artigo de hoje: limite de 1 por dia.' : 'Hoje não é dia de artigo completo (a cada 2 dias).');
  let publicouArtigo = null;

  if (devoArtigo) {
    try {
      const r = await produzir('artigo', ordemDeTemas(Math.floor(epochDay / 2)), recentes);
      if (r) {
        const desfazer = reconstruir(arquivos);
        try {
          const art = await publicarArtigo(r, artigos);
          gravarJSON(F_ART, artigos);
          execFileSync('node', [path.join(__dirname, '..', 'build.js')], { stdio: 'inherit' });
          log('publicado', { tipo: 'artigo', tema: r.tema, titulo: art.titulo, modo: r.modo, slug: art.slug, fontes: art.fontes.map((f) => f.url), revisao: r.rascunho.revisoes });
          publicouArtigo = r.tema; recentes.push({ titulo: art.titulo, resumo: art.resumo, fontes: art.fontes });
        } catch (e) { desfazer(); artigos.shift(); throw e; }
      }
    } catch (e) { houveErro = true; log('erro', { tipo: 'artigo', motivo: String(e.message).slice(0, 300) }); }
  }

  if (notas.some((n) => n.data === hoje)) console.log('Já existe nota de hoje: limite de 1 por dia.');
  else {
    try {
      const r = await produzir('nota', ordemDeTemas(epochDay, publicouArtigo ? [publicouArtigo] : []), recentes);
      if (r) {
        const desfazer = reconstruir(arquivos);
        try {
          const nota = criarNota(r, notas);
          gravarJSON(F_NOTAS, notas);
          execFileSync('node', [path.join(__dirname, '..', 'build.js')], { stdio: 'inherit' });
          log('publicado', { tipo: 'nota', tema: r.tema, titulo: nota.titulo, id: nota.id, fontes: nota.fontes.map((f) => f.url), revisao: r.rascunho.revisoes });
        } catch (e) { desfazer(); throw e; }
      }
    } catch (e) { houveErro = true; log('erro', { tipo: 'nota', motivo: String(e.message).slice(0, 300) }); }
  }
  process.exit(houveErro ? 1 : 0);
})().catch((e) => { console.error(e); try { log('erro', { motivo: String(e.message).slice(0, 300) }); } catch (x) { /* ignore */ } process.exit(1); });
