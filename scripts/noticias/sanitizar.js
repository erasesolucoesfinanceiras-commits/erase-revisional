// Limpeza do corpo dos artigos escritos pela IA (único portão antes do HTML cru em build.js).
// Só tags simples, sem atributos; links não entram no corpo (as fontes ficam no rodapé do artigo).
const PERMITIDAS = new Set(['p', 'h2', 'h3', 'ul', 'ol', 'li', 'strong', 'em', 'blockquote', 'br', 'sup', 'sub']); // sup/sub: expoentes em fórmulas (ex.: 1,018¹²); já existem em um guia publicado
const ESQUEMA_PERIGOSO = /(?:javascript|vbscript)\s*:|data\s*:\s*text\/html/i;

const SOBRA = new RegExp(`<(?!/?(?:${[...PERMITIDAS].join('|')})>)`, 'gi');

function passada(s) {
  return s
    .replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1\s*>/gi, '')
    // [^<>]*: uma tag nunca atravessa outro "<", então "<<a>img ...>" não se junta de novo numa tag só
    .replace(/<\/?([a-z0-9]+)[^<>]*>/gi, (m, tag) => {
      tag = tag.toLowerCase();
      if (!PERMITIDAS.has(tag)) return '';
      return m.startsWith('</') ? `</${tag}>` : `<${tag}>`;
    });
}

function sanitizar(html) {
  let s = String(html), ant;
  for (let i = 0; i < 10; i++) { ant = s; s = passada(s); if (s === ant) break; } // repete até o texto parar de mudar
  // todo "<" que não abre/fecha uma das tags permitidas (sem atributos) vira texto: sobra de tag cortada ou sem ">"
  s = s.replace(SOBRA, '&lt;');
  return s.trim();
}

module.exports = { sanitizar, ESQUEMA_PERIGOSO, PERMITIDAS };
