// Coleta as notícias REAIS de que o texto parte (o plano gratuito do Gemini não inclui a busca do Google).
// Fontes: buscas de notícias em RSS (Bing News) por tema + feeds de órgãos e veículos (feeds.json).
// O Gemini só escolhe entre estas fontes (por número): os links, as datas e os textos vêm daqui, nunca do modelo.
const { abrir } = require('./web');
const { POLITICA } = require('./verificar');
const FEEDS = require('./feeds.json');

const BING = process.env.NOTICIAS_RSS_BASE || 'https://www.bing.com/news/search';
const UA = 'Mozilla/5.0 (compatible; EraseRevisionalBot/1.0; +https://revisional.eraseconsulta.com.br)';
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch (e) { return ''; } };

const desfazer = (s) => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&')
  .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(Number(d)));
const tag = (bloco, nome) => { const m = new RegExp(`<${nome}[^>]*>([\\s\\S]*?)</${nome}>`, 'i').exec(bloco); return m ? desfazer(m[1]).trim() : ''; };
const semTags = (s) => String(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/** Itens de um RSS/Atom: { titulo, link, data (AAAA-MM-DD), descricao, fonte }. */
function lerRSS(xml) {
  const blocos = xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  return blocos.map((b) => {
    let link = tag(b, 'link') || (/<link[^>]*href="([^"]+)"/i.exec(b) || [])[1] || '';
    const bing = /[?&]url=([^&]+)/i.exec(link); // Bing envolve o link original no parâmetro url
    if (bing && /bing\.com/i.test(link)) { try { link = decodeURIComponent(bing[1]); } catch (e) { /* mantém */ } }
    const d = new Date(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date'));
    return { titulo: semTags(tag(b, 'title')), link: link.trim(), data: isNaN(d) ? '' : d.toISOString().slice(0, 10), descricao: semTags(tag(b, 'description') || tag(b, 'summary')).slice(0, 400), fonte: semTags(tag(b, 'News:Source') || tag(b, 'source')) };
  }).filter((i) => i.titulo && /^https?:\/\//.test(i.link));
}

async function baixarRSS(url) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': UA, Accept: 'application/rss+xml,application/xml,text/xml,*/*' } });
    if (!r.ok) return { itens: [], erro: `HTTP ${r.status}` };
    return { itens: lerRSS(await r.text()) };
  } catch (e) { return { itens: [], erro: e.message }; } finally { clearTimeout(t); }
}

// Peso da fonte: 3 = órgão oficial, 2 = grande veículo ou veículo setorial reconhecido, 0 = regional/pequeno (só complemento).
const OFICIAL = /(^|\.)(gov|leg|jus|mil)\.br$|(^|\.)ebc\.com\.br$/;
const GRANDES = ['g1.globo.com', 'globo.com', 'oglobo.globo.com', 'valor.globo.com', 'globorural.globo.com', 'autoesporte.globo.com', 'folha.uol.com.br', 'noticias.uol.com.br', 'uol.com.br', 'estadao.com.br', 'einvestidor.estadao.com.br', 'exame.com', 'infomoney.com.br', 'cnnbrasil.com.br', 'poder360.com.br', 'correiobraziliense.com.br', 'gazetadopovo.com.br', 'istoedinheiro.com.br', 'moneytimes.com.br', 'bloomberglinea.com.br', 'reuters.com', 'bbc.com', 'veja.abril.com.br', 'forbes.com.br', 'r7.com', 'terra.com.br', 'metropoles.com', 'migalhas.com.br', 'conjur.com.br', 'jota.info', 'canalrural.com.br', 'canalsolar.com.br', 'absolar.org.br', 'portalsolar.com.br', 'fenabrave.org.br', 'anfavea.com.br', 'quatrorodas.abril.com.br', 'motor1.com.br', 'febraban.org.br', 'cnc.org.br', 'cni.com.br', 'sebrae.com.br', 'agenciasebrae.com.br'];
const EXTRAS = (process.env.NOTICIAS_HOSTS_GRANDES || '').split(',').filter(Boolean); // só para testes
function pesoDoHost(h) {
  if (EXTRAS.includes(h)) return 2;
  if (OFICIAL.test(h)) return 3;
  return GRANDES.some((g) => h === g || h.endsWith('.' + g)) ? 2 : 0;
}

const cache = new Map();
/** Notícias candidatas de um tema: lidas (texto da página), recentes e sem duplicatas. */
async function coletar(tema, T, { hoje, diasMax, oficial = false, maxCands = 8, relatorio = null }) {
  const chave = `${tema}|${diasMax}|${oficial}`;
  if (cache.has(chave)) return cache.get(chave);
  const limite = new Date(hoje + 'T12:00:00Z'); limite.setUTCDate(limite.getUTCDate() - diasMax);
  const corte = limite.toISOString().slice(0, 10);
  const itens = [];
  const consultas = oficial
    ? T.queries.slice(0, 3).map((q) => `${q} (site:gov.br OR site:bcb.gov.br OR site:jus.br OR site:leg.br)`)
    : T.queries;
  for (const q of consultas) {
    const r = await baixarRSS(`${BING}?q=${encodeURIComponent(q)}&format=rss&setmkt=pt-BR&mkt=pt-BR`);
    if (relatorio) relatorio.push(`bing "${q.slice(0, 50)}": ${r.itens.length} itens${r.erro ? ' (' + r.erro + ')' : ''}`);
    itens.push(...r.itens.map((i) => ({ ...i, bonus: 2 }))); // veio de uma busca do próprio tema
  }
  const kw = norm(T.palavras).split(/\s+/).filter((w) => w.length > 3);
  if (!oficial) {
    for (const f of process.env.NOTICIAS_SEM_FEEDS ? [] : FEEDS.filter((x) => !x.temas || x.temas.includes(tema))) {
      const r = await baixarRSS(f.url);
      if (relatorio) relatorio.push(`feed ${f.nome}: ${r.itens.length} itens${r.erro ? ' (' + r.erro + ')' : ''}`);
      itens.push(...r.itens.filter((i) => { const t = norm(i.titulo + ' ' + i.descricao); return f.temas || kw.some((w) => t.includes(w)); }).map((i) => ({ ...i, fonte: i.fonte || f.nome, bonus: f.temas ? 2 : 0 })));
    }
  }
  // recentes, sem repetir link, no máx. 2 por site, mais novos primeiro
  const vistos = new Set(), porSite = {};
  // notícias de campanha/política partidária nem entram no banco de fontes (neutralidade no período eleitoral)
  const ordenados = itens.filter((i) => !POLITICA.test(i.titulo)).filter((i) => !T.exige || T.exige.test(norm(i.titulo + ' ' + i.descricao))).filter((i) => oficial ? true : i.data && i.data >= corte).map((i) => ({ ...i, nota: (i.bonus || 0) + kw.filter((w) => norm(i.titulo + ' ' + i.descricao).includes(w)).length + pesoDoHost(host(i.link)) }))
    // mais relevantes ao tema primeiro, depois os mais novos
    .sort((a, b) => b.nota - a.nota || (a.data < b.data ? 1 : a.data > b.data ? -1 : 0)).filter((i) => {
    const h = host(i.link); if (!h || vistos.has(i.link) || (porSite[h] || 0) >= 2) return false;
    vistos.add(i.link); porSite[h] = (porSite[h] || 0) + 1; return true;
  }).slice(0, 14);
  const cands = [];
  for (let i = 0; i < ordenados.length && cands.length < maxCands; i += 4) { // 4 páginas por vez
    const lote = await Promise.all(ordenados.slice(i, i + 4).map(async (it) => ({ it, p: await abrir(it.link, 15000) })));
    for (const { it, p } of lote) {
      if (!p.ok || p.texto.length < 800) { if (relatorio) relatorio.push(`  descartada (${p.status || p.erro}, ${p.texto.length} caracteres): ${it.link.slice(0, 90)}`); continue; }
      const url = /vertexaisearch|google\.com|bing\.com/.test(host(p.urlFinal)) ? it.link : p.urlFinal;
      cands.push({ titulo: it.titulo, url, host: host(url), peso: pesoDoHost(host(url)), data: it.data || '', nome: it.fonte || host(url), texto: p.texto });
    }
  }
  cands.forEach((c, n) => { c.id = n + 1; });
  cache.set(chave, cands);
  return cands;
}

module.exports = { coletar, lerRSS, host, pesoDoHost };
