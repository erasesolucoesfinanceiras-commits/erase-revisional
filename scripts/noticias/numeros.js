// Confere NÚMEROS: todo número, percentual, valor e data do texto tem de aparecer no conteúdo das fontes coletadas.
// Normaliza os formatos antes de comparar (14,41% = 14.41% = 14,41 por cento; R$ 1.000 = R$ 1 mil; 08/10 = 8 de outubro = 2026-10-08).
const MESES = { janeiro: 1, fevereiro: 2, marco: 3, março: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };
const MULT = { mil: 1e3, mi: 1e6, milhao: 1e6, milhoes: 1e6, milhão: 1e6, milhões: 1e6, bi: 1e9, bilhao: 1e9, bilhoes: 1e9, bilhão: 1e9, bilhões: 1e9, trilhao: 1e12, trilhoes: 1e12, trilhão: 1e12, trilhões: 1e12 };
const MES_RE = Object.keys(MESES).join('|');

/** "1.234,56" -> 1234.56 ; "14.41" -> 14.41 ; "1.000" -> 1000 */
function paraNumero(s) {
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) return parseFloat(s.replace(/\./g, '').replace(',', '.'));
  if (/^\d+,\d+$/.test(s)) return parseFloat(s.replace(',', '.'));
  if (/^\d+\.\d+$/.test(s)) return parseFloat(s);
  return parseFloat(s);
}
const chaveNum = (v) => 'v:' + Number(v.toPrecision(10));
const chaveData = (d, m) => `d:${Number(m)}-${Number(d)}`;

/** [{ chave, raw, pos, ignoravel }] — `ignoravel`: inteiro pequeno sem contexto (contagens como "2 fontes", dia do mês solto). */
function extrair(texto) {
  const t = String(texto).replace(/ /g, ' ');
  const achados = [];
  const mascara = t.split('');
  const apagar = (i, n) => { for (let k = i; k < i + n; k++) mascara[k] = ' '; };
  const datas = [
    [/\b(\d{4})-(\d{2})-(\d{2})\b/g, (m) => chaveData(m[3], m[2])],
    [/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g, (m) => (Number(m[2]) >= 1 && Number(m[2]) <= 12 ? chaveData(m[1], m[2]) : null)],
    [new RegExp(`\\b(\\d{1,2})(?:º|°)?\\s+de\\s+(${MES_RE})(?:\\s+de\\s+(\\d{4}))?`, 'gi'), (m) => chaveData(m[1], MESES[m[2].toLowerCase()])],
  ];
  for (const [re, mk] of datas) {
    let m; while ((m = re.exec(t))) { const k = mk(m); if (k) { achados.push({ chave: k, raw: m[0], pos: m.index, ignoravel: false }); apagar(m.index, m[0].length); } }
  }
  const sem = mascara.join('');
  const re = /(?<![\w.,])(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)(?![\w])/g;
  let m;
  while ((m = re.exec(sem))) {
    const base = paraNumero(m[1]);
    if (!isFinite(base)) continue;
    const depois = sem.slice(m.index + m[0].length, m.index + m[0].length + 20);
    const mm = /^\s*(mil|milh[ãa]o|milh[õo]es|mi|bilh[ãa]o|bilh[õo]es|bi|trilh[ãa]o|trilh[õo]es)\b/i.exec(depois);
    const mult = mm ? MULT[mm[1].toLowerCase()] : 1;
    const antes = sem.slice(Math.max(0, m.index - 4), m.index);
    const comContexto = !!mm || /R\$\s*$/.test(antes) || /^\s*(%|por cento)/i.test(depois) || /[.,]/.test(m[1]);
    const ordinal = /^\s*[ªº°]/.test(depois);
    const ehAno = /^\d{4}$/.test(m[1]) && base >= 1900 && base <= 2100;
    const inteiroPequeno = Number.isInteger(base * mult) && base * mult <= 31 && !comContexto;
    achados.push({ chave: chaveNum(base * mult), raw: m[0] + (mm ? ' ' + mm[1] : ''), pos: m.index, ignoravel: ordinal || inteiroPequeno, ano: ehAno });
  }
  return achados;
}

const blocos = (html) => String(html).replace(/<\/(p|li|h2|h3|blockquote)>/gi, '. ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const frases = (t) => t.split(/(?<=[.!?])\s+/);
function fraseDe(t, pos) { let acc = 0; for (const f of frases(t)) { const ini = t.indexOf(f, acc); if (pos >= ini && pos <= ini + f.length) return f.trim(); acc = ini + f.length; } return t.slice(Math.max(0, pos - 80), pos + 80); }

/**
 * `texto`: título + resumo + corpo (HTML ok). `fontes`: [{ nome, texto }]. `extras`: textos aceitos (datas das fontes, data de hoje).
 * Devolve { faltando: [{ raw, frase }], pares: [{ numero, frase, fonte, trecho }] } — pares = onde cada número aparece no texto e na fonte.
 */
function conferir(texto, fontes, extras = '', hoje = '') {
  const art = blocos(texto);
  const noFonte = [];
  for (const f of fontes) for (const x of extrair(f.texto)) noFonte.push({ ...x, fonte: f.nome, doc: f.texto });
  for (const x of extrair(extras)) noFonte.push({ ...x, fonte: 'data da publicação', doc: extras });
  const anoHoje = hoje ? Number(hoje.slice(0, 4)) : null;
  const faltando = [], pares = [], vistos = new Set();
  for (const x of extrair(art)) {
    if (x.ignoravel || vistos.has(x.chave)) continue;
    vistos.add(x.chave);
    const frase = fraseDe(art, x.pos);
    const achou = noFonte.find((y) => y.chave === x.chave);
    if (!achou) { if (x.ano && anoHoje && Number(x.chave.slice(2)) === anoHoje) continue; faltando.push({ raw: x.raw, frase }); continue; }
    pares.push({ numero: x.raw, frase, fonte: achou.fonte, trecho: achou.doc.slice(Math.max(0, achou.pos - 160), achou.pos + 200).replace(/\s+/g, ' ').trim() });
  }
  return { faltando, pares };
}

module.exports = { extrair, conferir, paraNumero };
