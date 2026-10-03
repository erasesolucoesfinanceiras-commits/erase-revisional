#!/usr/bin/env node
// Gera 1 artigo com a API GRATUITA do Gemini (gemini-2.5-flash + Google Search) e o adiciona
// a data/articles.json. Depois, scripts/build.js recria home, categoria, artigo e sitemap.
//   GEMINI_API_KEY=... node scripts/generate-article.js [categoria]
// Sem argumento, a categoria é escolhida por rodízio: dia do ano % 3.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { fetchPhoto, FALLBACK_Q } = require('./photos');

const ROOT = path.join(__dirname, '..');
const ARTICLES = path.join(ROOT, 'data', 'articles.json');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'config.json'), 'utf8'));
const MODEL = 'gemini-2.5-flash'; // camada gratuita — não trocar por modelo pago
const KEY = process.env.GEMINI_API_KEY;

const ORDEM = ['revisional', 'financeiro', 'mercado'];
const TEMAS = {
  revisional: 'revisão de juros em financiamento de veículos: jurisprudência (STJ), taxa média do Banco Central, direitos do consumidor, como funciona a análise de contratos',
  financeiro: 'sistema financeiro e crédito para veículos: taxas, CET, portabilidade, regras do Banco Central e do CMN, endividamento e crédito no Brasil',
  mercado: 'mercado de carros no Brasil: vendas, preços, lançamentos, impostos e como isso afeta quem financia um veículo',
};

function diaDoAno(d = new Date()) {
  return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 0)) / 86400000);
}

const PERMITIDAS = new Set(['p', 'h2', 'h3', 'ul', 'ol', 'li', 'strong', 'em', 'a', 'blockquote', 'br']);
/** Sanitiza o HTML do modelo: só tags permitidas, sem atributos (exceto href http(s) em <a>). */
function sanitizar(html) {
  return String(html)
    .replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (m, tag, attrs) => {
      tag = tag.toLowerCase();
      if (!PERMITIDAS.has(tag)) return '';
      if (m.startsWith('</')) return `</${tag}>`;
      if (tag === 'a') {
        const h = /href\s*=\s*["'](https?:\/\/[^"']+)["']/i.exec(attrs);
        return h ? `<a href="${h[1]}" target="_blank" rel="noopener noreferrer nofollow">` : '';
      }
      return `<${tag}>`;
    })
    .replace(/<a>/g, '').trim();
}

const slugify = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

function extrairJSON(texto) {
  const i = texto.indexOf('{'), j = texto.lastIndexOf('}');
  if (i < 0 || j < 0) throw new Error('Resposta sem JSON');
  return JSON.parse(texto.slice(i, j + 1));
}

async function gerar(categoria, existentes) {
  const hoje = new Date().toISOString().slice(0, 10);
  const prompt = `Você é redator de um portal de notícias brasileiro sobre financiamento de veículos (ERASE Revisional).
Data de hoje: ${hoje}. Use a busca do Google para encontrar uma notícia ou dado RECENTE (últimas semanas) sobre: ${TEMAS[categoria]}.
Escreva um artigo ORIGINAL em português do Brasil, informativo e neutro, com 450 a 700 palavras.
Regras obrigatórias:
- Baseie-se SOMENTE em fatos que você encontrou na busca; não invente números, datas, leis ou citações.
- Não prometa resultado, não diga que o leitor "tem valores a receber" e não afirme que juros acima da média são ilegais por si só.
- Não invente autor e não cite nomes de jornalistas. Não copie trechos longos da fonte.
- Não repita estes assuntos já publicados: ${existentes.slice(0, 25).map((a) => `"${a.titulo}"`).join('; ')}.
- Corpo em HTML simples usando apenas <p>, <h2>, <h3>, <ul>, <li>, <strong>, <em> (sem <h1>, sem estilos).
Responda APENAS com um objeto JSON (sem markdown) neste formato:
{"titulo": "até 90 caracteres", "resumo": "1 a 2 frases, até 220 caracteres", "corpo": "<p>...</p>", "fonte": {"nome": "nome do veículo/órgão", "url": "https://..."}, "foto_busca": "2 a 4 palavras EM INGLÊS para buscar uma foto de banco de imagens que combine com o tema (objetos/cenas genéricas, sem nomes de pessoas, marcas ou logotipos)"}`;

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }], // busca do Google (JSON mode não combina com tools, por isso o parse manual)
      generationConfig: { temperature: 0.6 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const json = await res.json();
  const cand = json.candidates && json.candidates[0];
  const texto = cand && cand.content && cand.content.parts ? cand.content.parts.map((p) => p.text || '').join('') : '';
  if (!texto) throw new Error('Gemini não retornou texto: ' + JSON.stringify(json).slice(0, 400));
  const art = extrairJSON(texto);
  const chunks = (cand.groundingMetadata && cand.groundingMetadata.groundingChunks) || [];
  return { art, fallbackFonte: chunks[0] && chunks[0].web };
}

(async () => {
  if (!KEY) { console.error('Defina GEMINI_API_KEY.'); process.exit(1); }
  const categoria = process.argv[2] || ORDEM[diaDoAno() % 3];
  if (!ORDEM.includes(categoria)) { console.error('Categoria inválida: ' + categoria); process.exit(1); }
  const lista = JSON.parse(fs.readFileSync(ARTICLES, 'utf8'));

  let ultimo;
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      const { art, fallbackFonte } = await gerar(categoria, lista);
      const titulo = String(art.titulo || '').trim(), resumo = String(art.resumo || '').trim();
      const corpo = sanitizar(art.corpo || '');
      if (titulo.length < 10 || resumo.length < 20 || corpo.length < 800) throw new Error('Artigo curto/incompleto');
      let slug = slugify(titulo), n = 2;
      while (lista.some((a) => a.slug === slug)) slug = `${slugify(titulo)}-${n++}`;
      const fonte = {
        nome: String((art.fonte && art.fonte.nome) || (fallbackFonte && fallbackFonte.title) || '').trim(),
        url: /^https?:\/\//.test((art.fonte && art.fonte.url) || '') ? art.fonte.url : (fallbackFonte && fallbackFonte.uri) || '',
      };
      if (!fonte.nome) throw new Error('Sem fonte');
      const foto_busca = String(art.foto_busca || '').trim().slice(0, 60) || FALLBACK_Q[categoria];
      const foto = await fetchPhoto(slug, foto_busca, lista.map((a) => a.foto && a.foto.id)); // null = capa SVG de reserva
      lista.unshift({ slug, categoria, titulo, resumo, data: new Date().toISOString().slice(0, 10), fonte, corpo, foto_busca, ...(foto && { foto }) });
      fs.writeFileSync(ARTICLES, JSON.stringify(lista, null, 2) + '\n');
      execFileSync('node', [path.join(__dirname, 'build.js')], { stdio: 'inherit' });
      console.log(`Artigo criado: ${slug} (${config.categorias[categoria].nome})`);
      return;
    } catch (e) {
      ultimo = e; console.error(`Tentativa ${tentativa} falhou: ${e.message}`);
      await new Promise((r) => setTimeout(r, 4000 * tentativa));
    }
  }
  console.error('Não foi possível gerar o artigo.'); console.error(ultimo); process.exit(1);
})();
