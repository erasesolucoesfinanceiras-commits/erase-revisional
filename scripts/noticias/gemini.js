// Chamada à API GRATUITA do Gemini (gemini-2.5-flash) com limite de ritmo e novas tentativas.
// Camada GRATUITA — não trocar por modelo pago. O 2.5-flash foi encerrado para chaves novas (404); troque aqui
// ou pela variável GEMINI_MODEL (Settings > Secrets and variables > Actions > Variables) se o Google descontinuar este também.
// Camada GRATUITA — não usar modelo pago. Se um modelo estiver sobrecarregado (503), sem cota (429) ou encerrado (404),
// o código passa sozinho para o próximo da lista (a cota gratuita é separada por modelo). GEMINI_MODEL vira o 1º da lista.
const MODELOS = [...new Set([process.env.GEMINI_MODEL, 'gemini-3.8-flash', 'gemini-3-flash-preview', 'gemini-3.1-flash-lite'].filter(Boolean))];
const BASE = process.env.GEMINI_BASE || 'https://generativelanguage.googleapis.com/v1beta';
const INTERVALO_MS = Number(process.env.GEMINI_INTERVALO_MS ?? 7000); // camada gratuita ≈ 10 pedidos/min
const ESPERA_ERRO_MS = Number(process.env.GEMINI_ESPERA_ERRO_MS ?? 10000);
let ultima = 0;
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
const indisponiveis = new Set(); // modelos sem cota/encerrados nesta execução

class ErroGemini extends Error {}

async function umaChamada(modelo, key, { prompt, sistema, busca, temperatura }) {
  const espera = ultima + INTERVALO_MS - Date.now();
  if (espera > 0) await dorme(espera);
  ultima = Date.now();
  const res = await fetch(`${BASE}/models/${modelo}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      ...(sistema && { systemInstruction: { parts: [{ text: sistema }] } }),
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      ...(busca && { tools: [{ google_search: {} }] }), // desligada: o plano gratuito recusa a busca do Google (429); as fontes vêm de fontes.js
      generationConfig: { temperature: temperatura },
    }),
  });
  if (!res.ok) { const e = new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 200)}`); e.status = res.status; throw e; }
  const json = await res.json();
  const cand = json.candidates && json.candidates[0];
  const texto = cand && cand.content && cand.content.parts ? cand.content.parts.map((p) => p.text || '').join('') : '';
  if (!texto) { const e = new Error('resposta sem texto'); e.status = 502; throw e; }
  return texto;
}

/** Devolve { texto, modelo }. Lança ErroGemini quando nenhum modelo gratuito consegue responder. */
async function chamar({ prompt, sistema, busca = false, temperatura = 0.5 }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new ErroGemini('GEMINI_API_KEY ausente');
  const falhas = [];
  for (const m of MODELOS.filter((x) => !indisponiveis.has(x))) {
    for (let t = 1; t <= 2; t++) {
      try { return { texto: await umaChamada(m, key, { prompt, sistema, busca, temperatura }), modelo: m, chunks: [] }; }
      catch (e) {
        falhas.push(`${m}: ${e.message.slice(0, 120)}`); console.error(`Gemini ${m}, tentativa ${t}: ${e.message.slice(0, 160)}`);
        if (e.status === 429 || e.status === 404) { indisponiveis.add(m); break; } // sem cota / encerrado: próximo modelo
        if ([400, 401, 403].includes(e.status)) throw new ErroGemini(`Gemini recusou (${e.status}): ${e.message}`);
        if (t < 2) await dorme(ESPERA_ERRO_MS); // 5xx: uma nova tentativa e depois o próximo modelo
      }
    }
  }
  throw new ErroGemini(`Nenhum modelo gratuito do Gemini respondeu: ${falhas.slice(-4).join(' | ')}`);
}

function extrairJSON(texto) {
  const i = texto.indexOf('{'), j = texto.lastIndexOf('}');
  if (i < 0 || j <= i) throw new Error('resposta sem JSON');
  return JSON.parse(texto.slice(i, j + 1));
}

module.exports = { chamar, extrairJSON, ErroGemini, MODELOS };
