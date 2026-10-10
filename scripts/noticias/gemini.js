// Chamada à API GRATUITA do Gemini com limite de ritmo e escalonamento automático de falhas.
// Camada GRATUITA — não usar modelo pago. O nome do modelo NÃO é fixo: a cada execução consulta a lista da API e usa o flash
// estável mais recente, depois os flash-lite, depois a lista de reserva abaixo. GEMINI_MODEL (Variables do Actions), se existir, é o 1º.
// Escalonamento: 429 e erros temporários (5xx/rede) → espera e tenta de novo no mesmo modelo → passa ao próximo modelo.
// Só vira "precisa de humano" (erro.humano) o que nenhuma espera resolve: chave inválida, conta suspensa, plano encerrado.
const RESERVA = ['gemini-3.8-flash', 'gemini-3-flash-preview', 'gemini-3.1-flash-lite'];
const BASE = process.env.GEMINI_BASE || 'https://generativelanguage.googleapis.com/v1beta';
const INTERVALO_MS = Number(process.env.GEMINI_INTERVALO_MS ?? 7000); // camada gratuita ≈ 10 pedidos/min
const ESCALA = Number(process.env.GEMINI_ESPERA_ESCALA ?? 1); // multiplica todas as esperas (testes usam 0.001)
const ESPERA_ERRO_MS = Number(process.env.GEMINI_ESPERA_ERRO_MS ?? 10000);
const TENTATIVAS = 3; // por modelo
let ultima = 0, aoRegistrar = () => {}, prazoFn = () => Infinity;
const dorme = (ms) => new Promise((r) => setTimeout(r, ms * ESCALA));
const indisponiveis = new Set(); // modelos sem cota do dia/encerrados nesta execução

/** `fn(evento, dados)`: o run.js grava no log cada espera, nova tentativa e troca de modelo. `fnPrazo()`: instante limite do job. */
const definirLog = (fn) => { aoRegistrar = fn; };
const definirPrazo = (fn) => { prazoFn = fn; };

class ErroGemini extends Error {
  constructor(msg, { humano = false, causa = '', acao = '' } = {}) { super(msg); this.humano = humano; this.causa = causa; this.acao = acao; }
}

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

async function umaChamada(modelo, key, { prompt, sistema, busca, temperatura }) {
  const espera = ultima + INTERVALO_MS * ESCALA - Date.now();
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
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
  if (!res.ok) { const corpo = await res.text(); const e = new Error(`HTTP ${res.status} ${corpo.slice(0, 300)}`); e.status = res.status; e.corpo = corpo; throw e; }
  const json = await res.json();
  const cand = json.candidates && json.candidates[0];
  const texto = cand && cand.content && cand.content.parts ? cand.content.parts.map((p) => p.text || '').join('') : '';
  if (!texto) { const e = new Error('resposta sem texto'); e.status = 502; throw e; }
  return texto;
}

/** Erros que nenhuma espera resolve: devolve { causa, acao } em linguagem simples, ou null. */
function exigeHumano(e) {
  const t = `${e.status} ${e.corpo || e.message}`;
  if (e.status === 401 || /API[_ ]KEY[_ ]?(INVALID|not valid|expired)|API key (not valid|expired)/i.test(t))
    return { causa: 'A chave do Gemini (GEMINI_API_KEY) é inválida ou expirou.', acao: 'Gerar uma chave nova em aistudio.google.com e atualizar o secret GEMINI_API_KEY no GitHub (Settings > Secrets and variables > Actions).' };
  if (e.status === 403 && /suspend|SERVICE_DISABLED|has not been used|disabled|billing|PERMISSION_DENIED|denied/i.test(t))
    return { causa: 'O acesso da chave ao Gemini foi negado: a conta ou o projeto do Google está suspenso, a API foi desativada ou exige cobrança.', acao: 'Abrir aistudio.google.com com a conta dona da chave, ver o aviso do projeto e, se preciso, criar outra chave em outro projeto.' };
  if (e.status === 400 && /FAILED_PRECONDITION|free tier is not available|billing/i.test(t))
    return { causa: 'O plano gratuito do Gemini não está disponível para esta conta ou região.', acao: 'Verificar o plano em aistudio.google.com ou usar outra conta/chave com plano gratuito ativo.' };
  return null;
}
const atrasoSugerido = (e) => { const m = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"|retry in (\d+(?:\.\d+)?)s/i.exec(e.corpo || e.message); return m ? Number(m[1] || m[2]) * 1000 : 0; };

/** Devolve { texto, modelo }. Lança ErroGemini quando nenhum modelo gratuito consegue responder (`humano` quando só uma pessoa resolve). */
async function chamar({ prompt, sistema, busca = false, temperatura = 0.5 }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new ErroGemini('GEMINI_API_KEY ausente', { humano: true, causa: 'O secret GEMINI_API_KEY não está configurado no GitHub.', acao: 'Criar o secret GEMINI_API_KEY em Settings > Secrets and variables > Actions.' });
  const falhas = []; let semCotaDoPlano = 0, tentados = 0;
  for (const m of (await modelos(key)).filter((x) => !indisponiveis.has(x))) {
    tentados++;
    for (let t = 1; t <= TENTATIVAS; t++) {
      if (Date.now() > prazoFn()) throw new ErroGemini('tempo do job esgotado esperando o Gemini');
      try { return { texto: await umaChamada(m, key, { prompt, sistema, busca, temperatura }), modelo: m }; }
      catch (e) {
        falhas.push(`${m}: ${e.message.slice(0, 120)}`); console.error(`Gemini ${m}, tentativa ${t}: ${e.message.slice(0, 160)}`);
        const h = exigeHumano(e);
        if (h) { aoRegistrar('gemini', { modelo: m, status: e.status, acao: 'exige_humano', motivo: h.causa }); throw new ErroGemini(`Gemini recusou (${e.status}): ${e.message}`, { humano: true, ...h }); }
        if (e.status === 429) {
          if (/limit:\s*0\b/.test(e.corpo || '')) semCotaDoPlano++;
          const diaria = /PerDay|per day|daily/i.test(e.corpo || '') && !atrasoSugerido(e);
          if (diaria || t === TENTATIVAS) { indisponiveis.add(m); aoRegistrar('gemini', { modelo: m, status: 429, acao: 'proximo_modelo', motivo: diaria ? 'cota diária esgotada' : 'cota por minuto ainda esgotada após esperas' }); break; }
          const ms = Math.min(Math.max(atrasoSugerido(e), 20000) + 2000, 70000);
          aoRegistrar('gemini', { modelo: m, status: 429, acao: 'espera_e_repete', espera_s: Math.round(ms / 1000) }); await dorme(ms); continue;
        }
        if (e.status === 404 || e.status === 400 || e.status === 403) { indisponiveis.add(m); aoRegistrar('gemini', { modelo: m, status: e.status, acao: 'proximo_modelo', motivo: 'modelo indisponível ou recusado' }); break; }
        // 5xx, rede, resposta vazia: espera crescente e repete; esgotou, vai ao próximo modelo
        if (t === TENTATIVAS) { aoRegistrar('gemini', { modelo: m, status: e.status || 'rede', acao: 'proximo_modelo', motivo: 'erro temporário persistiu' }); break; }
        const ms = ESPERA_ERRO_MS * t * (t === 1 ? 1 : 2); aoRegistrar('gemini', { modelo: m, status: e.status || 'rede', acao: 'espera_e_repete', espera_s: Math.round(ms / 1000) }); await dorme(ms);
      }
    }
  }
  if (tentados && semCotaDoPlano >= tentados)
    throw new ErroGemini('Nenhum modelo tem cota gratuita nesta chave', { humano: true, causa: 'A chave do Gemini não tem cota gratuita em nenhum modelo (limite 0): o plano gratuito foi encerrado ou não vale para esta conta.', acao: 'Verificar o plano e a cota em aistudio.google.com ou trocar a chave.' });
  throw new ErroGemini(`Nenhum modelo gratuito do Gemini respondeu: ${falhas.slice(-4).join(' | ')}`);
}

function extrairJSON(texto) {
  const i = texto.indexOf('{'), j = texto.lastIndexOf('}');
  if (i < 0 || j <= i) throw new Error('resposta sem JSON');
  return JSON.parse(texto.slice(i, j + 1));
}

module.exports = { chamar, extrairJSON, ErroGemini, ordenarDisponiveis, definirLog, definirPrazo, exigeHumano };
