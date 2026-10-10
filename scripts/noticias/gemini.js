// Chamada à API GRATUITA do Gemini com limite de ritmo e novas tentativas.
// Camada GRATUITA — não usar modelo pago. O nome do modelo NÃO é fixo: a cada execução consulta a lista da API e usa o flash
// estável mais recente, depois os flash-lite, depois a lista de reserva abaixo. Se um modelo estiver sobrecarregado (503),
// sem cota (429) ou encerrado (404), passa sozinho para o próximo (a cota gratuita é separada por modelo).
// GEMINI_MODEL (Variables do Actions), se existir, vira o 1º da lista.
const RESERVA = ['gemini-3.8-flash', 'gemini-3-flash-preview', 'gemini-3.1-flash-lite'];
const BASE = process.env.GEMINI_BASE || 'https://generativelanguage.googleapis.com/v1beta';
const INTERVALO_MS = Number(process.env.GEMINI_INTERVALO_MS ?? 7000); // camada gratuita ≈ 10 pedidos/min
const ESPERA_ERRO_MS = Number(process.env.GEMINI_ESPERA_ERRO_MS ?? 10000);
let ultima = 0;
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
const indisponiveis = new Set(); // modelos sem cota/encerrados nesta execução

const versao = (n) => n.match(/gemini-([\d.]+)-/)[1].split('.').map(Number);
const maisNovo = (a, b) => { const x = versao(a), y = versao(b); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (y[i] || 0) - (x[i] || 0); return 0; };

/** Ordena nomes da lista da API: flash estável (mais novo primeiro), depois flash-lite estável. Ignora preview/imagem/áudio. */
function ordenarDisponiveis(nomes) {
  const ok = nomes.map((n) => n.replace(/^models\//, '')).filter((n) => /^gemini-\d+(\.\d+)*-flash(-lite)?$/.test(n));
  return [...ok.filter((n) => !n.endsWith('-lite')).sort(maisNovo), ...ok.filter((n) => n.endsWith('-lite')).sort(maisNovo)];
}

let listaModelos;
/** Lista final de modelos a tentar (calculada uma vez por execução). Se a consulta falhar, só a reserva. */
function modelos(key) {
  listaModelos = listaModelos || (async () => {
    let achados = [];
    try {
      const res = await fetch(`${BASE}/models?pageSize=1000`, { headers: { 'x-goog-api-key': key } });
      if (res.ok) achados = ordenarDisponiveis(((await res.json()).models || []).filter((m) => (m.supportedGenerationMethods || []).includes('generateContent')).map((m) => m.name));
      else console.error(`Lista de modelos: HTTP ${res.status}; usando só a reserva.`);
    } catch (e) { console.error('Lista de modelos indisponível: ' + e.message); }
    const lista = [...new Set([process.env.GEMINI_MODEL, ...achados, ...RESERVA].filter(Boolean))];
    console.log('Modelos do Gemini, em ordem: ' + lista.join(', '));
    return lista;
  })();
  return listaModelos;
}

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
  for (const m of (await modelos(key)).filter((x) => !indisponiveis.has(x))) {
    for (let t = 1; t <= 2; t++) {
      try { return { texto: await umaChamada(m, key, { prompt, sistema, busca, temperatura }), modelo: m, chunks: [] }; }
      catch (e) {
        falhas.push(`${m}: ${e.message.slice(0, 120)}`); console.error(`Gemini ${m}, tentativa ${t}: ${e.message.slice(0, 160)}`);
        if (e.status === 429 || e.status === 404) { indisponiveis.add(m); break; } // sem cota / encerrado: próximo modelo
        if (e.status === 401 || /API key/i.test(e.message)) throw new ErroGemini(`Gemini recusou a chave (${e.status}): ${e.message}`);
        if ([400, 403].includes(e.status)) { indisponiveis.add(m); break; } // este modelo não aceita a chamada: próximo
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

module.exports = { chamar, extrairJSON, ErroGemini, ordenarDisponiveis };
