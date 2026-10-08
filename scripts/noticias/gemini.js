// Chamada à API GRATUITA do Gemini (gemini-2.5-flash) com limite de ritmo e novas tentativas.
const MODEL = 'gemini-2.5-flash'; // camada gratuita — não trocar por modelo pago
const BASE = process.env.GEMINI_BASE || 'https://generativelanguage.googleapis.com/v1beta';
const INTERVALO_MS = Number(process.env.GEMINI_INTERVALO_MS ?? 7000); // camada gratuita ≈ 10 pedidos/min
const ESPERA_ERRO_MS = Number(process.env.GEMINI_ESPERA_ERRO_MS ?? 20000);
let ultima = 0;
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));

class ErroGemini extends Error {}

/** Devolve { texto, chunks:[{uri,title}] }. Lança ErroGemini quando a API falha mesmo após as tentativas. */
async function chamar({ prompt, sistema, busca = true, temperatura = 0.5 }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new ErroGemini('GEMINI_API_KEY ausente');
  let erro;
  for (let t = 1; t <= 4; t++) {
    const espera = ultima + INTERVALO_MS - Date.now();
    if (espera > 0) await dorme(espera);
    ultima = Date.now();
    try {
      const res = await fetch(`${BASE}/models/${MODEL}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          ...(sistema && { systemInstruction: { parts: [{ text: sistema }] } }),
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          ...(busca && { tools: [{ google_search: {} }] }), // JSON mode não combina com tools: o parse é manual
          generationConfig: { temperature: temperatura },
        }),
      });
      if (!res.ok) {
        const corpo = (await res.text()).slice(0, 300);
        if ([429, 500, 502, 503, 504].includes(res.status)) throw new Error(`HTTP ${res.status} ${corpo}`);
        throw new ErroGemini(`Gemini HTTP ${res.status}: ${corpo}`); // 400/401/403: não adianta repetir
      }
      const json = await res.json();
      const cand = json.candidates && json.candidates[0];
      const texto = cand && cand.content && cand.content.parts ? cand.content.parts.map((p) => p.text || '').join('') : '';
      if (!texto) throw new Error('resposta sem texto');
      const chunks = ((cand.groundingMetadata && cand.groundingMetadata.groundingChunks) || []).map((c) => c.web).filter(Boolean);
      return { texto, chunks };
    } catch (e) {
      if (e instanceof ErroGemini) throw e;
      erro = e; console.error(`Gemini, tentativa ${t}: ${e.message}`);
      await dorme(ESPERA_ERRO_MS * t);
    }
  }
  throw new ErroGemini(`Gemini indisponível: ${erro && erro.message}`);
}

function extrairJSON(texto) {
  const i = texto.indexOf('{'), j = texto.lastIndexOf('}');
  if (i < 0 || j <= i) throw new Error('resposta sem JSON');
  return JSON.parse(texto.slice(i, j + 1));
}

module.exports = { chamar, extrairJSON, ErroGemini, MODEL };
