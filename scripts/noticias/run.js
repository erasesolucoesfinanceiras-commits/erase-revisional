#!/usr/bin/env node
// Notícias 100% automáticas, sem Pull Request: 1 artigo quando o último tem 2+ dias + 1 nota ("Radar") por dia, só com novidade real.
// Cada texto passa por verificações automáticas e por uma 2ª revisão por IA antes de ir ao ar.
//   GEMINI_API_KEY=... node scripts/noticias/run.js                      (publica o que estiver na vez, modo "publicar")
//   GEMINI_API_KEY=... MODO=amostra node scripts/noticias/run.js          (gera 3 artigos + 1 nota em amostras/, sem publicar)
// Variáveis: FORCAR_ARTIGO=1 (ignora o intervalo de 2 dias, mas continua valendo 1 artigo por dia), DATA=AAAA-MM-DD (testes).
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chamar, extrairJSON, ErroGemini, definirLog, definirPrazo } = require('./gemini');
const { TEMAS, ordemDeTemas } = require('./temas');
const P = require('./prompts');
const V = require('./verificar');
const { revisar, revisarNeutralidade } = require('./revisor');
const N = require('./numeros');
const { coletar } = require('./fontes');
const { fetchPhoto, FALLBACK_Q } = require('../photos');
const EST = require('./estatisticas');
const RG = require('./revisar-guia');

const ROOT = path.join(__dirname, '..', '..');
const DATA_DIR = process.env.DADOS_DIR || path.join(ROOT, 'data');
const F_ART = path.join(DATA_DIR, 'articles.json'), F_NOTAS = path.join(DATA_DIR, 'notas.json'), F_DESP = path.join(DATA_DIR, 'despublicados.json');
const MODO = process.env.MODO === 'amostra' ? 'amostra' : 'publicar';
const AMOSTRAS = path.join(ROOT, 'amostras');
const F_LOG = MODO === 'amostra' ? path.join(AMOSTRAS, 'log.jsonl') : path.join(DATA_DIR, 'noticias-log.jsonl');
const F_STATS = MODO === 'amostra' ? path.join(AMOSTRAS, 'stats.json') : path.join(DATA_DIR, 'revisor-stats.json'); // aprovados/reprovados por dia e critério
const config = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'config.json'), 'utf8'));

const hoje = process.env.DATA || new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10); // data de Brasília
const epochDay = Math.floor(Date.parse(hoje + 'T00:00:00Z') / 864e5);
const lerJSON = (f, vazio) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return vazio; throw e; } };
const gravarJSON = (f, v) => fs.writeFileSync(f, JSON.stringify(v, null, 2) + '\n');
let houveErro = false;
let PRAZO = Date.now() + Number(process.env.NOTICIAS_MINUTOS || (MODO === 'amostra' ? 40 : 30)) * 60e3; // orçamento de tempo do artigo; a nota ganha o seu depois
const semTempo = () => Date.now() > PRAZO;
definirPrazo(() => PRAZO);
const TENTATIVAS_ARTIGO = Number(process.env.TENTATIVAS_ARTIGO || 4); // reescritas após reprovação (mesmos critérios); nota segue com 2
// Rodadas do dia (cron 1, 2 e a final): só a última (ou uma execução manual) pode deixar o run vermelho; antes dela uma falha só agenda nova tentativa.
const RODADA = process.env.RODADA || 'final';
const FINAL = RODADA === 'final' || Number(RODADA) >= 3;
const etapas = []; // diagnóstico de cada etapa tentada nesta execução (vai para o log se o dia falhar)
const reprovacoes = []; // resumo das reprovações/pulos da execução, para o log de falha

function log(evento, dados) {
  const linha = { quando: new Date().toISOString(), data: hoje, evento, ...dados };
  fs.mkdirSync(path.dirname(F_LOG), { recursive: true });
  fs.appendFileSync(F_LOG, JSON.stringify(linha) + '\n');
  if (['gemini', 'tema_trocado', 'pulado', 'reprovado', 'guia', 'sem_publicacao', 'erro'].includes(evento)) etapas.push({ evento, tipo: dados.tipo, tema: dados.tema, tentativa: dados.tentativa, modelo: dados.modelo, status: dados.status, acao: dados.acao, motivo: String([].concat(dados.motivos || dados.motivo || '').join(' ; ')).slice(0, 160) });
  if (evento === 'reprovado' || evento === 'pulado') reprovacoes.push({ tipo: dados.tipo, tema: dados.tema, tentativa: dados.tentativa, motivos: dados.motivos || [dados.motivo] });
  console.log(`[${evento}] ${dados.tipo || ''} ${dados.tema || ''} ${dados.titulo ? '— ' + dados.titulo : ''} ${dados.motivos ? '| ' + [].concat(dados.motivos).join(' ; ') : dados.motivo || ''}`);
}

/** Conta o resultado de cada avaliação (por dia, tipo e critério) e deixa uma linha 'avaliacao' no log. */
function contar(tipo, tema, tentativa, motivos, aprovado) {
  try { fs.mkdirSync(path.dirname(F_STATS), { recursive: true }); EST.registrar(F_STATS, hoje, tipo, { aprovado, motivos }); } catch (e) { console.error('estatísticas do revisor: ' + e.message); }
  log('avaliacao', { tipo, tema, tentativa, aprovado, criterios_reprovados: aprovado ? [] : EST.chaves(motivos) });
}
const semNovidade = (tipo) => { try { fs.mkdirSync(path.dirname(F_STATS), { recursive: true }); EST.registrar(F_STATS, hoje, tipo, { semNovidade: true }); } catch (e) { /* ignore */ } };

definirLog((evento, dados) => log(evento, dados)); // esperas, novas tentativas e trocas de modelo do Gemini ficam no log

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

/** Escreve, verifica e revisa (artigo: até TENTATIVAS_ARTIGO vezes; nota: 2 = original + 1 reescrita). Devolve { status: aprovado|sem_novidade|reprovado, rascunho? }. */
async function tentarTema(tipo, tema, modo, recentes) {
  const T = TEMAS[tema];
  const diasMax = tipo === 'nota' ? 3 : 14;
  const cands = (await coletar(tema, T, { hoje, diasMax, oficial: modo === 'guia' })).filter((c) => !urlsBloqueadas.has(c.url));
  const minimo = modo === 'guia' ? 2 : 2;
  if (cands.length < minimo) { log('pulado', { tipo, tema, motivo: `sem novidade: só ${cands.length} fonte(s) legível(is) dos últimos ${diasMax} dias` }); semNovidade(tipo); return { status: 'sem_novidade' }; }
  let anterior = null, motivosAnt = [];
  const maxTent = tipo === 'artigo' ? TENTATIVAS_ARTIGO : 2;
  for (let tentativa = 1; tentativa <= maxTent; tentativa++) {
    if (tentativa > 1 && semTempo()) break;
    const { texto } = await chamar({ prompt: P.escritor({ tipo, modo, tema: T, hoje, recentes, anterior, motivos: motivosAnt, cands }), temperatura: 0.6 });
    let r;
    try { r = extrairJSON(texto); } catch (e) { r = null; }
    if (r && r.sem_novidade === true) {
      if (tentativa === 1) { log('pulado', { tipo, tema, motivo: 'sem novidade real: ' + String(r.motivo || '').slice(0, 200) }); semNovidade(tipo); return { status: 'sem_novidade' }; }
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
      motivos = V.checarRegras(r, tipo, { recentes, textosFontes: fo.textos });
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
    contar(tipo, tema, tentativa, motivos, !motivos.length);
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
  const proximo = (i) => ordem[i + 1];
  for (let i = 0; i < ordem.length; i++) {
    const tema = ordem[i];
    if (semTempo()) { log('sem_publicacao', { tipo, motivo: 'orçamento de tempo do dia esgotado' }); return null; }
    let r;
    try { r = await tentarTema(tipo, tema, 'noticia', recentes); }
    catch (e) {
      if (e instanceof ErroGemini) throw e; // falha da IA vale para todos os temas: sobe para o escalonamento do dia
      log('erro', { tipo, tema, motivo: 'falha inesperada no tema: ' + String(e.message).slice(0, 200) }); r = { status: 'erro' };
    }
    if (r.status === 'aprovado') return { tema, modo: 'noticia', rascunho: r.rascunho };
    if (r.status === 'reprovado') houveNovidade = true;
    if (proximo(i)) {
      const ult = reprovacoes.filter((x) => x.tipo === tipo && x.tema === tema).pop();
      const motivo = r.status === 'reprovado' ? 'revisor reprovou em todas as tentativas' : r.status === 'sem_novidade' ? 'fontes insuficientes ou sem novidade real' : 'falha inesperada';
      log('tema_trocado', { tipo, de: tema, para: proximo(i), motivo, ultimos_motivos: ult ? [].concat(ult.motivos).slice(0, 4) : [] });
    }
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

/** Temas de artigo que já foram tentados hoje (rodadas anteriores): vão para o fim da fila, para a nova rodada começar por temas ainda não tentados. */
function temasTentadosHoje(tipo) {
  try {
    return [...new Set(fs.readFileSync(F_LOG, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (e) { return {}; } })
      .filter((x) => x.data === hoje && x.tipo === tipo && ['reprovado', 'pulado'].includes(x.evento) && x.tema).map((x) => x.tema))];
  } catch (e) { return []; }
}

const limparFontes = (fs_) => fs_.map(({ nome, url, data }) => ({ nome, url, ...(data && { data }) }));

async function publicarArtigo({ tema, modo, rascunho: r }, artigos) {
  let slug = slugify(r.titulo), n = 2;
  while (artigos.some((a) => a.slug === slug)) slug = `${slugify(r.titulo)}-${n++}`;
  const foto_busca = String(r.foto_busca || '').trim().slice(0, 60) || FALLBACK_Q[tema];
  const foto = await fetchPhoto(slug, foto_busca, artigos.map((a) => a.foto && a.foto.id), { categoria: tema, titulo: r.titulo });
  if (!foto) log('foto_padrao', { tipo: 'artigo', tema, slug, motivo: require('../photos').motivoDaFalha() || 'sem foto' }); // sem foto adequada: imagem padrão do site
  const art = { slug, categoria: tema, titulo: r.titulo, resumo: r.resumo, data: hoje, fontes: limparFontes(r.fontes), corpo: r.corpo, foto_busca, tipo: modo === 'guia' ? 'guia' : 'noticia', ...(foto && { foto }) };
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

/** Fecha o dia: falha só quando TODAS as saídas se esgotaram (rodada final) ou quando só uma pessoa resolve; a causa em linguagem simples vai na última linha do log. */
function encerrar(falha) {
  try { console.log('Revisor, últimos 7 dias: ' + EST.resumo(F_STATS, hoje).texto); } catch (e) { /* ignore */ }
  if (falha) {
    const humano = !!falha.humano;
    if (FINAL || humano) {
      const causa = humano ? falha.causa : 'Nenhuma saída automática funcionou hoje: o Gemini, os temas e as fontes foram tentados nas 3 rodadas, e o revisor reprovou ou faltaram notícias reais. Nada foi publicado para não baixar a qualidade.';
      const acao = humano ? falha.acao : 'Ver as linhas "tema_trocado", "reprovado" e "gemini" deste dia em data/noticias-log.jsonl; amanhã o sistema tenta de novo sozinho.';
      log('diagnostico_final', { tipo: 'artigo', rodada: RODADA, precisa_de_humano: humano, causa, acao, motivo: falha.motivo, etapas: etapas.slice(-40) });
      console.log(`::error::${causa} ${acao}`);
      if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `humano=${humano ? 1 : 0}\ncausa=${causa.replace(/[\r\n]+/g, ' ')}\n`);
      houveErro = true;
    } else {
      log('rodada_falhou', { tipo: 'artigo', rodada: RODADA, motivo: falha.motivo, proximo_passo: 'nova rodada algumas horas depois (e, se o agendamento falhar, a verificação diária dispara a geração)', etapas: etapas.slice(-40) });
    }
  }
  process.exit(houveErro ? 1 : 0);
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
  // Cadência: publica se o último artigo tem 2 dias ou mais (um dia que falhou é recuperado no seguinte).
  const ultimoArtigo = artigos.reduce((m, a) => (a.data > m ? a.data : m), '');
  const diasDesdeUltimo = ultimoArtigo ? epochDay - Math.floor(Date.parse(ultimoArtigo + 'T00:00:00Z') / 864e5) : Infinity;
  const devoArtigo = !artigoHoje && (process.env.FORCAR_ARTIGO === '1' || diasDesdeUltimo >= 2);
  if (!devoArtigo) console.log(artigoHoje ? 'Já existe artigo de hoje: limite de 1 por dia.' : `Último artigo é de ${ultimoArtigo} (${diasDesdeUltimo} dia(s)): ainda não é hora de outro.`);
  let publicouArtigo = null;

  let falhaArtigo = null; // { motivo, humano, causa, acao }
  if (devoArtigo) {
    try {
      const r = await produzir('artigo', ordemDeTemas(Math.floor(epochDay / 2), temasTentadosHoje('artigo')), recentes);
      if (r) {
        const desfazer = reconstruir(arquivos);
        try {
          const art = await publicarArtigo(r, artigos);
          gravarJSON(F_ART, artigos);
          execFileSync('node', [path.join(__dirname, '..', 'build.js')], { stdio: 'inherit' });
          log('publicado', { tipo: 'artigo', tema: r.tema, titulo: art.titulo, modo: r.modo, slug: art.slug, fontes: art.fontes.map((f) => f.url), revisao: r.rascunho.revisoes });
          publicouArtigo = r.tema; recentes.push({ titulo: art.titulo, resumo: art.resumo, fontes: art.fontes });
        } catch (e) { desfazer(); artigos.shift(); throw e; }
      } else falhaArtigo = { motivo: 'todos os temas foram reprovados pelo revisor ou não tinham fontes suficientes' };
    } catch (e) {
      falhaArtigo = { motivo: String(e.message).slice(0, 300), humano: !!e.humano, causa: e.causa, acao: e.acao };
      log('erro', { tipo: 'artigo', motivo: falhaArtigo.motivo });
    }
  }

  PRAZO = Date.now() + 15 * 60e3; // a nota tem o seu próprio tempo, mesmo que o artigo tenha usado o dele
  if (notas.some((n) => n.data === hoje)) console.log('Já existe nota de hoje: limite de 1 por dia.');
  else if (falhaArtigo && falhaArtigo.humano) console.log('Nota não tentada: o problema da IA exige uma pessoa.');
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
    } catch (e) { if (FINAL) houveErro = true; log('erro', { tipo: 'nota', motivo: String(e.message).slice(0, 300) }); }
  }
  // ---- revisão de guias (a cada 3 dias, no máximo 1 por dia). NUNCA altera a data de publicação; só grava "atualizado" se o texto mudou
  // de verdade e passou no revisor. Falha aqui não derruba o dia (o artigo e a nota são o que importa); as rodadas seguintes tentam de novo.
  if (!(falhaArtigo && falhaArtigo.humano)) {
    try {
      const linhas = fs.existsSync(F_LOG) ? fs.readFileSync(F_LOG, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (e) { return {}; } }) : [];
      if (RG.estaNaHora(linhas, hoje)) {
        PRAZO = Date.now() + 10 * 60e3;
        const res = await RG.revisarGuia({ artigos, hoje, linhasDoLog: linhas, deps: { coletar, chamar, extrairJSON, sanitizar, V, N, revisar, revisarNeutralidade, precisaNeutralidade, TEMAS, limparFontes, contar, log, urlsBloqueadas } });
        if (res.resultado === 'atualizado') {
          const desfazer = reconstruir(arquivos);
          try { gravarJSON(F_ART, artigos); execFileSync('node', [path.join(__dirname, '..', 'build.js')], { stdio: 'inherit' }); } catch (e) { desfazer(); throw e; }
        }
        log('revisao_guia', res);
      }
    } catch (e) { log('revisao_guia', { resultado: 'erro', motivo: String(e.message).slice(0, 200) }); }
  }
  encerrar(falhaArtigo);
})().catch((e) => { console.error(e); try { log('erro', { motivo: String(e.message).slice(0, 300) }); } catch (x) { /* ignore */ } process.exit(1); });
