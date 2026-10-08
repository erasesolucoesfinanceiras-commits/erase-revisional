// Verificações automáticas (determinísticas) de um rascunho, ANTES da revisão por IA.
// Cada função devolve uma lista de motivos de reprovação (vazia = passou).
const { abrir } = require('./web');

const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const STOP = new Set('para como mais pelo pela pelos pelas sobre entre quando onde qual quais essa esse esta este isso isto seus suas uma uns umas com sem por que dos das nos nas aos ser tem ter foi sao ainda tambem apos ate'.split(' '));
const tokens = (s) => norm(s).split(' ').filter((w) => w.length > 3 && !STOP.has(w));
const jaccard = (a, b) => {
  const A = new Set(a), B = new Set(b);
  if (!A.size || !B.size) return 0;
  let i = 0; for (const x of A) if (B.has(x)) i++;
  return i / (A.size + B.size - i);
};
const semHtml = (h) => String(h).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const palavras = (s) => (s.match(/\S+/g) || []).length;
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch (e) { return ''; } };
const ehOficial = (u) => /\.(gov|jus|leg|mil)\.br$/.test(host(u)) || host(u) === 'bcb.gov.br';

const PROMESSA = [
  /voc[eê]\s+(vai|ir[aá]|poder[aá]|pode)\s+(recuperar|receber|ganhar|ter de volta)/i,
  /resultado garantido|ganho garantido|devolu[cç][aã]o garantida|aprova[cç][aã]o garantida|garantimos|sem risco algum/i,
  /valores?\s+a\s+(receber|recuperar|restituir)/i,
  /voc[eê]\s+deve\s+(entrar|ajuizar|processar|propor)|entre com (uma )?a[cç][aã]o/i,
];
const PARCEIRO = /escrit[oó]rio\s+parceiro|advogad[oa]s?\s+parceir|parceir[oa]s?\s+(jur[ií]dic|da\s+erase)|nossos?\s+parceiros?\s+(jur[ií]dic|advogad)/i;
const POLITICA = /\b(lula|bolsonaro|tarc[ií]sio|haddad|ciro gomes|mar[cç]al|alckmin|janja|petista|bolsonarista|lulista|esquerdista|direitista|candidat[oa]s?|eleitor(?:es|al|ais)?|elei[cç](?:[aã]o|[oõ]es)|partid(?:o|os|[aá]rio|[aá]ria)|psdb|psol|mdb|uni[aã]o brasil|centr[aã]o|oposi[cç][aã]o|palanque|presidenci[aá]vel)\b|\bPT\b/i;
const ASSINATURA = /^\s*(por|autor|autoria|texto de|escrito por|reda[cç][aã]o de)\b/i;

/** Regras de forma e conteúdo, sem rede. `ctx.recentes` = itens dos últimos 15 dias [{titulo, resumo|texto, fontes}]. */
function checarRegras(r, tipo, ctx) {
  const m = [];
  const corpoTxt = tipo === 'nota' ? String(r.texto || '') : semHtml(r.corpo || '');
  const todo = `${r.titulo} ${r.resumo || ''} ${corpoTxt}`;
  if (!r.titulo || r.titulo.length < 10 || r.titulo.length > (tipo === 'nota' ? 90 : 95)) m.push('título ausente ou fora do tamanho');
  if (tipo === 'nota') {
    if (/[<>]/.test(corpoTxt)) m.push('nota com HTML');
    if (corpoTxt.length < 80 || corpoTxt.length > 520) m.push(`nota com ${corpoTxt.length} caracteres (deve ter 2 a 4 linhas, 80 a 520 caracteres)`);
  } else {
    const n = palavras(corpoTxt);
    if (n < 400 || n > 900) m.push(`artigo com ${n} palavras (esperado 450 a 700)`);
    if (!r.resumo || r.resumo.length < 40 || r.resumo.length > 230) m.push('resumo ausente ou fora do tamanho');
  }
  if (PROMESSA.some((re) => re.test(todo))) m.push('promete resultado, valores a receber ou dá conselho jurídico individual');
  if (PARCEIRO.test(todo)) m.push('cita escritório/advogado parceiro');
  const pol = POLITICA.exec(todo);
  if (pol) m.push(`menção política/partidária ("${pol[0]}")`);
  if (ASSINATURA.test(corpoTxt)) m.push('texto com assinatura/autor');
  // repetição (últimos 15 dias)
  const tt = tokens(r.titulo), tc = tokens(`${r.titulo} ${r.resumo || ''} ${corpoTxt.slice(0, 400)}`);
  const urls = new Set((r.fontes || []).map((f) => f.url));
  for (const x of ctx.recentes) {
    if (jaccard(tt, tokens(x.titulo)) >= 0.5 || jaccard(tc, tokens(`${x.titulo} ${x.resumo || x.texto || ''}`)) >= 0.4) { m.push(`repete assunto já publicado: "${x.titulo}"`); break; }
    if ((x.fontes || []).some((f) => urls.has(f.url))) { m.push(`usa a mesma fonte de "${x.titulo}" (assunto repetido)`); break; }
  }
  return m;
}

/** Maior trecho (em palavras) que o texto copia de alguma fonte; devolve o trecho se tiver ≥ N palavras. */
function trechoCopiado(corpoTxt, textosFontes, N = 9) {
  const a = norm(corpoTxt).split(' ');
  if (a.length < N) return null;
  const grams = new Set();
  for (const t of textosFontes) { const w = norm(t).split(' '); for (let i = 0; i + N <= w.length; i++) grams.add(w.slice(i, i + N).join(' ')); }
  for (let i = 0; i + N <= a.length; i++) { const g = a.slice(i, i + N).join(' '); if (grams.has(g)) return g; }
  return null;
}

/**
 * Fontes: ≥2 em sites diferentes, links que abrem, encontradas pela busca do Google (não inventadas),
 * recentes (notícia) ou oficiais (guia). Troca a URL pela final (depois dos redirecionamentos).
 * Devolve { motivos, textos } — textos = conteúdo das páginas, para conferir cópia e fatos.
 */
async function checarFontes(r, tipo, modo, chunks, hoje) {
  const motivos = [], textos = [];
  const fontes = Array.isArray(r.fontes) ? r.fontes : [];
  if (fontes.length < 2) return { motivos: ['menos de 2 fontes'], textos };

  // Sites que a busca do Google realmente devolveu (título do resultado = domínio; o link é um redirecionamento).
  const dominiosBusca = new Set(chunks.map((c) => String(c.title || '').toLowerCase().replace(/^www\./, '')).filter(Boolean));
  for (const c of chunks.slice(0, 12)) {
    if (!/vertexaisearch|grounding-api-redirect/.test(c.uri || '')) { const h = host(c.uri); if (h) dominiosBusca.add(h); continue; }
    const p = await abrir(c.uri, 12000); const h = host(p.urlFinal); if (h && !/vertexaisearch|google\./.test(h)) dominiosBusca.add(h);
  }
  const daBusca = (h) => [...dominiosBusca].some((d) => h === d || h.endsWith('.' + d) || d.endsWith('.' + h));

  const limite = new Date(hoje + 'T12:00:00Z'); limite.setUTCDate(limite.getUTCDate() - 60);
  let recentes = 0, oficiais = 0; const hosts = new Set();
  for (const f of fontes) {
    if (!f || !/^https?:\/\//.test(f.url || '') || !f.nome) { motivos.push('fonte sem nome ou link válido'); continue; }
    const p = await abrir(f.url);
    if (!p.ok) { motivos.push(`link da fonte não abre (${f.url}: ${p.status || p.erro})`); continue; }
    if (!/vertexaisearch|google\./.test(host(p.urlFinal))) f.url = p.urlFinal;
    const h = host(f.url);
    if (!daBusca(h)) { motivos.push(`fonte não encontrada pela busca do Google (${h}): possível invenção`); continue; }
    hosts.add(h); f.texto = p.texto; if (p.texto) textos.push(p.texto);
    f.lida = !!p.texto; // false = site bloqueia robôs; o revisor confere pela busca
    if (ehOficial(f.url)) oficiais++;
    const d = new Date((f.data || '') + 'T12:00:00Z');
    if (!isNaN(d) && d >= limite && d <= new Date(hoje + 'T12:00:00Z').getTime() + 864e5) recentes++;
  }
  if (hosts.size < 2) motivos.push('menos de 2 fontes reais de sites diferentes');
  if (modo === 'guia') { if (oficiais < 2) motivos.push('guia exige pelo menos 2 fontes oficiais (.gov.br, .jus.br, Banco Central...)'); }
  else if (recentes < 2) motivos.push('menos de 2 fontes recentes (últimos 60 dias, com data informada)');
  return { motivos, textos };
}

module.exports = { checarRegras, checarFontes, trechoCopiado, semHtml, norm, host };
