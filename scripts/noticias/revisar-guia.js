// Revisão automática de GUIAS (conteúdo atemporal): a cada 3 dias, no máximo 1 por dia, o guia verificado há mais tempo é
// revisado pelo Gemini com fontes oficiais atuais. REGRA ABSOLUTA: a data de publicação (`data`) nunca é alterada.
// Só se o texto MUDAR DE VERDADE e passar nas mesmas verificações e no mesmo revisor dos artigos, grava o texto novo e a data
// real em `atualizado` ("Atualizado em"). Se mudar e for reprovado, ou se não mudar, guia e datas ficam intocados.
const P = require('./prompts');

const INTERVALO_DIAS = 3;
const FINAIS = new Set(['atualizado', 'sem_mudanca', 'reprovado']); // resultados que contam como "verificou"; erro/sem fontes tentam de novo
const AVISO_RESULTADO = /n[aã]o (?:h[aá]|existe|garant\w+|prometemos?)[^.<]{0,80}(?:garant|resultado)|sem (?:promessa|garantia)|n[aã]o (?:constitui|[eé]) (?:parecer|promessa)|resultado garantido/i;
const dias = (a, b) => Math.floor((Date.parse(b) - Date.parse(a)) / 864e5);
const nums = (t) => new Set(t.match(/\d[\d.,]*\d|\d/g) || []);
const simil = (V, a, b) => { const A = new Set(V.norm(a).split(' ')), B = new Set(V.norm(b).split(' ')); let i = 0; for (const x of A) if (B.has(x)) i++; return i / (A.size + B.size - i || 1); };

/** Última data em que cada guia foi verificado (resultado final), lida das linhas do log. */
function ultimasVerificacoes(linhas) {
  const m = {};
  for (const l of linhas) if (l.evento === 'revisao_guia' && FINAIS.has(l.resultado) && l.slug && (!m[l.slug] || l.data > m[l.slug])) m[l.slug] = l.data;
  return m;
}
/** Está na hora? (nunca verificou, ou a última verificação final de qualquer guia foi há INTERVALO_DIAS dias ou mais). */
function estaNaHora(linhas, hoje) {
  const ult = Object.values(ultimasVerificacoes(linhas)).sort().pop();
  return !ult || dias(ult, hoje) >= INTERVALO_DIAS;
}
const escolherGuia = (guias, ult) => [...guias].sort((a, b) => ((ult[a.slug] || '0') < (ult[b.slug] || '0') ? -1 : (ult[a.slug] || '0') > (ult[b.slug] || '0') ? 1 : (a.atualizado || a.data) < (b.atualizado || b.data) ? -1 : 1))[0];

/**
 * deps: { coletar, chamar, extrairJSON, sanitizar, V, N, revisar, revisarNeutralidade, precisaNeutralidade, TEMAS, limparFontes, contar, log, urlsBloqueadas }
 * Devolve { resultado, slug, ... }. Em 'atualizado' o objeto do guia em `artigos` já foi alterado (o chamador grava e reconstrói o site).
 */
async function revisarGuia({ artigos, hoje, linhasDoLog, deps }) {
  const { coletar, chamar, extrairJSON, sanitizar, V, N, revisar, revisarNeutralidade, precisaNeutralidade, TEMAS, limparFontes, contar, log, urlsBloqueadas = new Set() } = deps;
  const guias = artigos.filter((a) => a.tipo === 'guia');
  if (!guias.length) return { resultado: 'sem_guias' };
  const g = escolherGuia(guias, ultimasVerificacoes(linhasDoLog));
  const tema = TEMAS[g.categoria] ? g.categoria : 'financeiro';
  const cands = (await coletar(tema, TEMAS[tema], { hoje, diasMax: 60, oficial: true })).filter((c) => !urlsBloqueadas.has(c.url));
  if (cands.length < 2) return { resultado: 'sem_fontes', slug: g.slug, motivo: `só ${cands.length} fonte(s) oficial(is) legível(is)` };
  const textoAntigo = V.semHtml(g.corpo);
  let anterior = null, motivosAnt = [];
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    const { texto } = await chamar({ prompt: P.revisaoGuia({ guia: g, hoje, tema: TEMAS[tema], cands, motivos: motivosAnt, anterior }), temperatura: 0.3 });
    let r; try { r = extrairJSON(texto); } catch (e) { r = null; }
    if (!r || r.sem_mudanca === true || !r.corpo) return { resultado: 'sem_mudanca', slug: g.slug };
    const corpo = sanitizar(r.corpo), textoNovo = V.semHtml(corpo);
    // mudou de verdade? precisa declarar a mudança E alterar números/datas ou boa parte do texto (reescrita só de estilo não conta)
    const nA = nums(textoAntigo), nN = nums(textoNovo), difNums = [...nA].some((x) => !nN.has(x)) || [...nN].some((x) => !nA.has(x));
    const mudou = Array.isArray(r.mudancas) && r.mudancas.length > 0 && (difNums || simil(V, textoAntigo, textoNovo) < 0.9);
    if (!mudou) return { resultado: 'sem_mudanca', slug: g.slug };
    const rasc = { titulo: g.titulo, resumo: g.resumo, corpo, fontes_usadas: r.fontes_usadas };
    const fo = V.checarFontes(rasc, 'artigo', 'guia', cands, hoje, 60);
    let motivos = [...V.checarRegras(rasc, 'artigo', { recentes: [], textosFontes: fo.textos }), ...fo.motivos];
    const copia = V.trechoCopiado(textoNovo, fo.textos); if (copia) motivos.push(`copia trecho da fonte ("${copia}...")`);
    if (AVISO_RESULTADO.test(textoAntigo) && !AVISO_RESULTADO.test(textoNovo)) motivos.push('a revisão removeu o aviso de que não há resultado garantido');
    const textoArt = `${g.titulo}. ${g.resumo}. ${corpo}`;
    const num = N.conferir(textoArt, rasc.fontes, [...rasc.fontes.map((f) => f.data), hoje].join(' '), hoje);
    if (num.faltando.length) motivos.push(`número(s) que não aparecem nas fontes: ${num.faltando.slice(0, 6).map((x) => `"${x.raw}"`).join('; ')}`);
    if (!motivos.length) {
      const rev = await revisar({ tipo: 'artigo', hoje, rascunho: rasc, recentes: [], pares: num.pares }); motivos = rev.motivos;
      if (!motivos.length && precisaNeutralidade(g.categoria, textoArt)) motivos = (await revisarNeutralidade({ tipo: 'artigo', rascunho: rasc })).motivos.map((m) => 'neutralidade/' + m);
    }
    contar('guia_revisao', g.categoria, tentativa, motivos, !motivos.length);
    if (!motivos.length) { // SÓ AQUI o guia muda; `data` (publicação) fica como está
      g.corpo = corpo; g.fontes = limparFontes(rasc.fontes); g.atualizado = hoje;
      return { resultado: 'atualizado', slug: g.slug, mudancas: r.mudancas.slice(0, 5) };
    }
    anterior = { corpo, mudancas: r.mudancas }; motivosAnt = motivos;
    if (tentativa === 2) return { resultado: 'reprovado', slug: g.slug, motivos: motivos.slice(0, 6) };
  }
}

module.exports = { revisarGuia, estaNaHora, ultimasVerificacoes, escolherGuia, INTERVALO_DIAS };
