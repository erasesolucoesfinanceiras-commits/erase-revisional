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
// Aviso em NEGATIVA ("não há resultado garantido", "não prometemos valores a receber") não é promessa: sai do texto antes de procurar promessas.
const AVISO_NEGATIVO = /n[aã]o\s+(?:h[aá]|existe|existem|tem|temos|oferece|oferecemos|prometemos|garantimos|significa|[eé])(?=\s)(?=[^.!?<]*(?:garant|promess|valores?\s+a\s+(?:receber|recuperar|restituir)))[^.!?<]*/gi;
const PARCEIRO = /escrit[oó]rio\s+parceiro|advogad[oa]s?\s+parceir|parceir[oa]s?\s+(jur[ií]dic|da\s+erase)|nossos?\s+parceiros?\s+(jur[ií]dic|advogad)/i;
// Propaganda eleitoral/partidária e rótulos partidários. Citar autoridades (juízes, órgãos, Banco Central, ministérios, parlamentares, com nome e partido
// só como identificação) com declaração ATRIBUÍDA e FACTUAL é permitido; a neutralidade (sem elogio/crítica/endosso) é conferida pela revisão por IA.
const POLITICA = /\b(petistas?|bolsonaristas?|lulistas?|esquerdistas?|direitistas?|centr[aã]o|candidat[oa]s?|pr[ée]-candidat\w*|eleitor(?:es|al|ais)?|elei[cç](?:[aã]o|[oõ]es)|palanque|presidenci[aá]vel|vote\s+(?:em|no|na)|voto\s+(?:em|no|na)\s+\w+|hor[aá]rio eleitoral|propaganda (?:eleitoral|partid[aá]ria)|campanha eleitoral)\b/i;
const CARREGADO = /\b(desastre|desastroso|ac?erto hist[óo]rico|manobra|esc[âa]ndalo|vergonha|vergonhoso|fiasco|fracasso (do|da) governo|ca[oó]s|absurdo|omiss[ãa]o|c[ií]nic[oa]|populis(?:mo|ta)|armaç[ãa]o|heroi[ck][oa]|trag[ée]dia nacional)\b|campanha eleitoral|pesquisa eleitoral|pr[ée]-candidat|urnas?\b/i;
// Atribuição genérica ("especialistas destacam", "analistas apontam", "o mercado avalia"): ou diz QUEM disse (nome ou instituição
// presente nas fontes) ou a frase sai.
// Segurança de conteúdo (o que Google e redes sociais reprovariam). Barreira de código além da revisão por IA; na dúvida, reprova.
const SEGURANCA = [
  ['sexual', /\b(porn[oô]\w*|sexo expl[ií]cito|nudez|nu[ae]s? em p[eê]lo|er[oó]tic[oa]s?|conte[uú]do adulto|estupr\w+|pedofil\w+|abuso sexual)\b/i],
  ['violência gráfica', /\b(decapit\w+|esquartej\w+|mutil\w+|degolad\w+|desmembr\w+|tortur\w+|corpo carbonizado|poça de sangue)\b/i],
  ['ódio ou racismo', /\b(crioul[oa]s?|neona[sz]i\w*|nazis(?:mo|t\w+)|supremacia (?:branca|racial)|ra[cç]a inferior|nego imundo|macaco[s]? (?:preto|negro)|judeus? (?:ganancios|usur[aá]ri)\w*|morte aos?\s+\w+)\b/i],
  ['assédio', /\b(lixo humano|vagabund[oa]s?|retardad[oa]s?|imbecil(?:es)?|desgra[cç]ad[oa]s?|vadia|piranha)\b/i],
  ['perigoso ou ilegal', /\b(como (?:fabricar|montar|fazer) (?:uma )?(?:bomba|explosivo|arma|droga|coquetel molotov)|como (?:clonar|fraudar|burlar|hackear)\b|passo a passo (?:para|de) (?:fraudar|clonar|sonegar|lavar dinheiro)|como lavar dinheiro)/i],
  ['golpe promovido', /\b(ganhe dinheiro f[aá]cil|dinheiro f[aá]cil e r[aá]pido|renda extra garantida|lucro garantido|dobre (?:o )?seu (?:dinheiro|investimento)|multiplique seu dinheiro|enriqu\w+ r[aá]pido|cr[eé]dito aprovado (?:na hora )?sem consulta|empr[eé]stimo garantido sem comprovar|invista agora e (?:ganhe|lucre)|clique no link e (?:ganhe|receba))\b/i],
];
function inseguro(texto) { for (const [cat, re] of SEGURANCA) { const m = re.exec(texto); if (m) return `${cat}: "${m[0]}"`; } return null; }
// Descrição de número agregado das fontes ("mediana das projeções", "consenso do Focus"): não é atribuição genérica de opinião.
const AGREGADO = /\b(mediana|m[eé]dia das (?:proje|previs)\w+|consenso|boletim focus|\bfocus\b|pesquisa|levantamento)\b/i;
const GENERICO = /\b(?:especialistas?|analistas?|economistas?|investidores|observadores|estudiosos|operadores|consultores|o mercado|os mercados|o mercado financeiro|o setor financeiro|o sistema financeiro|fontes do setor|fontes ligadas)\s+(?:do setor\s+\w+\s+|do mercado\s+)?(?:\w+\s+)?(?:destac\w+|apont\w+|avali\w+|dizem|diz|afirm\w+|prev[eê]\w*|espera\w*|acredit\w+|alert\w+|ressalt\w+|consider\w+|v[eê]m?|entend\w+|estim\w+|sugere\w*|indic\w+|defend\w+|recomend\w+)|\b(?:segundo|de acordo com|para|na avalia[cç][aã]o d[eo]s?|na vis[aã]o d[eo]s?)\s+(?:especialistas|analistas|economistas|o mercado|observadores)\b|\bmuitos (?:acreditam|especialistas|analistas)|\bh[aá] quem (?:diga|aponte|avalie)|\bsabe-se que\b|\bcostuma-se (?:dizer|afirmar)\b/i;
// Termos carregados só passam DENTRO de citação atribuída ("segundo X, '...'", "X afirmou: '...'"); na voz do texto, reprovam.
const ATRIBUICAO = /\b(segundo|de acordo com|conforme|afirm\w+|disse|diz|declar\w+|avali\w+|criticou|defendeu|ressaltou|apontou|alertou|para (?:o|a|os|as))\b/i;
const semCitacoesAtribuidas = (t) => String(t).split(/(?<=[.!?])\s+/).map((f) => (ATRIBUICAO.test(f) ? f.replace(/[“"«][^”"»]{1,300}[”"»]/g, ' ') : f)).join(' ');
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
    if (!GENERICO.test(f) || (AGREGADO.test(f) && /\d/.test(f))) continue;
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
  const todoSemAviso = todo.replace(AVISO_NEGATIVO, ' ');
  if (PROMESSA.some((re) => re.test(todoSemAviso))) m.push('promete resultado, valores a receber ou dá conselho jurídico individual');
  if (PARCEIRO.test(todo)) m.push('cita escritório/advogado parceiro');
  const pol = POLITICA.exec(todo);
  if (pol) m.push(`menção política/partidária ("${pol[0]}")`);
  const ins = inseguro(todo);
  if (ins) m.push(`conteúdo inseguro (${ins})`);
  const gen = frasesGenericas(corpoTxt, (ctx.textosFontes || []));
  if (gen.length) m.push(`frase genérica sem dizer quem disse (nome ou instituição das fontes): "${gen[0]}"`);
  const car = CARREGADO.exec(semCitacoesAtribuidas(todo));
  if (car) m.push(`termo carregado/eleitoral ("${car[0]}")`);
  if (ASSINATURA.test(corpoTxt)) m.push('texto com assinatura/autor');
  // repetição (últimos 15 dias)
  const tt = tokens(r.titulo), tc = tokens(`${r.titulo} ${r.resumo || ''} ${corpoTxt.slice(0, 400)}`);
  const urls = new Set((r.fontes || []).map((f) => f.url));
  for (const x of ctx.recentes) {
    if (jaccard(tt, tokens(x.titulo)) >= 0.5 || jaccard(tc, tokens(`${x.titulo} ${x.resumo || x.texto || ''}`)) >= 0.4) { m.push(`repete assunto já publicado: "${x.titulo}"`); break; }
    // mesma fonte só reprova se for a MESMA URL e o assunto for parecido; o mesmo veículo (ou até a mesma página) pode servir a assuntos diferentes
    if ((x.fontes || []).some((f) => urls.has(f.url)) && (jaccard(tt, tokens(x.titulo)) >= 0.2 || jaccard(tc, tokens(`${x.titulo} ${x.resumo || x.texto || ''}`)) >= 0.15)) { m.push(`usa a mesma fonte (mesma URL) de "${x.titulo}" com assunto parecido`); break; }
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

module.exports = { semCitacoesAtribuidas, inseguro, frasesGenericas, POLITICA, checarRegras, checarFontes, trechoCopiado, semHtml, norm, host };
