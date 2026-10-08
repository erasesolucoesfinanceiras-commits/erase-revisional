// Verificações automáticas (determinísticas) de um rascunho, ANTES da revisão por IA.
// Cada função devolve uma lista de motivos de reprovação (vazia = passou).

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
const CARREGADO = /\b(desastre|desastroso|ac?erto hist[óo]rico|manobra|esc[âa]ndalo|vergonha|vergonhoso|fiasco|fracasso (do|da) governo|ca[oó]s|absurdo|omiss[ãa]o|c[ií]nic[oa]|populis(?:mo|ta)|armaç[ãa]o|heroi[ck][oa]|trag[ée]dia nacional)\b|campanha eleitoral|pesquisa eleitoral|pr[ée]-candidat|urnas?\b/i;
// Atribuição genérica ("especialistas destacam", "analistas apontam", "o mercado avalia"): ou diz QUEM disse (nome ou instituição
// presente nas fontes) ou a frase sai.
const GENERICO = /\b(?:especialistas?|analistas?|economistas?|investidores|observadores|estudiosos|operadores|consultores|o mercado|os mercados|o mercado financeiro|o setor financeiro|o sistema financeiro|fontes do setor|fontes ligadas)\s+(?:do setor\s+\w+\s+|do mercado\s+)?(?:\w+\s+)?(?:destac\w+|apont\w+|avali\w+|dizem|diz|afirm\w+|prev[eê]\w*|espera\w*|acredit\w+|alert\w+|ressalt\w+|consider\w+|v[eê]m?|entend\w+|estim\w+|sugere\w*|indic\w+|defend\w+|recomend\w+)|\b(?:segundo|de acordo com|para|na avalia[cç][aã]o d[eo]s?|na vis[aã]o d[eo]s?)\s+(?:especialistas|analistas|economistas|o mercado|observadores)\b|\bmuitos (?:acreditam|especialistas|analistas)|\bh[aá] quem (?:diga|aponte|avalie)|\bsabe-se que\b|\bcostuma-se (?:dizer|afirmar)\b/i;
const frasesDe = (t) => t.split(/(?<=[.!?:;])\s+/);
/** Frases com atribuição genérica sem atribuição explícita ("do Itaú", "pelo Valor", "segundo o Banco Central") a nome presente nas fontes. */
const CABECA = new Set(['banco', 'instituto', 'ministerio', 'agencia', 'conselho', 'tribunal', 'camara', 'senado', 'governo', 'associacao', 'federacao', 'universidade', 'fundacao', 'empresa', 'grupo']);
function frasesGenericas(texto, textosFontes) {
  const fontes = norm(textosFontes.join(' '));
  const ATRIB = /\b(?:[Dd][oae]s?|[Pp]el[oa]s?|[Cc]onforme|[Ss]egundo|[Dd]e acordo com)\s+(?:o |a |os |as )?((?:[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ÿ]+|[A-Z]{2,})(?:\s+(?:[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ÿ]+|[A-Z]{2,}))*)/g;
  const achouNome = (seq) => { // o nome inteiro, ou o maior começo dele, tem de estar nas fontes (uma palavra genérica como "Banco" sozinha não vale)
    const w = seq.split(/\s+/);
    for (let n = w.length; n >= 1; n--) { const p = w.slice(0, n).join(' '); if (fontes.includes(norm(p)) && (n > 1 || !CABECA.has(norm(p)))) return true; }
    return false;
  };
  const achadas = [];
  for (const f of frasesDe(texto)) {
    if (!GENERICO.test(f)) continue;
    let atribuida = false, m;
    ATRIB.lastIndex = 0;
    while ((m = ATRIB.exec(f))) if (achouNome(m[1])) { atribuida = true; break; }
    if (!atribuida) achadas.push(f.trim().slice(0, 140));
  }
  return achadas;
}
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
  const gen = frasesGenericas(corpoTxt, (ctx.textosFontes || []));
  if (gen.length) m.push(`frase genérica sem dizer quem disse (nome ou instituição das fontes): "${gen[0]}"`);
  const car = CARREGADO.exec(todo);
  if (car) m.push(`termo carregado/eleitoral ("${car[0]}")`);
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

/**
 * Trecho que o texto copia de alguma fonte: ≥12 palavras seguidas iguais. Janelas feitas só de números/datas/percentuais
 * ou de listas curtas (tabela do IPCA, lista de preços) não contam como cópia — o texto em si tem de ser próprio.
 */
function trechoCopiado(corpoTxt, textosFontes, N = 12) {
  const a = norm(corpoTxt).split(' ');
  if (a.length < N) return null;
  const pobre = (w) => w.filter((x) => /^\d+$/.test(x) || x.length <= 3).length / w.length >= 0.4; // muitos números/palavras curtas = dado, não prosa
  const grams = new Set();
  for (const t of textosFontes) { const w = norm(t).split(' '); for (let i = 0; i + N <= w.length; i++) { const j = w.slice(i, i + N); if (!pobre(j)) grams.add(j.join(' ')); } }
  for (let i = 0; i + N <= a.length; i++) { const j = a.slice(i, i + N); if (pobre(j)) continue; const g = j.join(' '); if (grams.has(g)) return g; }
  return null;
}

/**
 * Fontes: o modelo só devolve os NÚMEROS das fontes que usou (fontes_usadas); links, datas e textos vêm de fontes.js
 * (páginas que abriram de verdade). Exige ≥2 sites diferentes, recentes (notícia) ou oficiais (guia).
 * Preenche r.fontes e devolve { motivos, textos } (textos = conteúdo das páginas, para conferir cópia e fatos).
 */
function checarFontes(r, tipo, modo, cands, hoje, diasMax) {
  const motivos = [], textos = [];
  const ids = [...new Set((Array.isArray(r.fontes_usadas) ? r.fontes_usadas : []).map(Number))];
  const usadas = ids.map((i) => cands.find((c) => c.id === i)).filter(Boolean);
  if (usadas.length !== ids.length) motivos.push('citou fonte que não existe na lista fornecida');
  r.fontes = usadas.map((c) => ({ nome: c.nome, url: c.url, data: c.data, texto: c.texto, lida: true }));
  usadas.forEach((c) => textos.push(c.texto));
  const hosts = new Set(usadas.map((c) => c.host));
  if (usadas.length < 2 || hosts.size < 2) motivos.push('menos de 2 fontes de sites diferentes');
  if (modo !== 'guia' && usadas.length && !usadas.some((c) => c.peso >= 2)) motivos.push('só fontes regionais/pequenas: é preciso ao menos um órgão oficial ou grande veículo (regionais só como complemento)');
  if (modo === 'guia') { if (usadas.filter((c) => ehOficial(c.url)).length < 2) motivos.push('guia exige pelo menos 2 fontes oficiais (.gov.br, .jus.br, Banco Central...)'); }
  else {
    const limite = new Date(hoje + 'T12:00:00Z'); limite.setUTCDate(limite.getUTCDate() - diasMax);
    const recentes = usadas.filter((c) => c.data && new Date(c.data + 'T12:00:00Z') >= limite).length;
    if (recentes < 2) motivos.push(`menos de 2 fontes publicadas nos últimos ${diasMax} dias`);
  }
  return { motivos, textos };
}

module.exports = { frasesGenericas, POLITICA, checarRegras, checarFontes, trechoCopiado, semHtml, norm, host };
