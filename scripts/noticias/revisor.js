// 2ª e 3ª revisões por IA — chamadas separadas da que escreveu, cada uma com instrução própria.
const { chamar, extrairJSON } = require('./gemini');
const P = require('./prompts');

const CRITERIOS = ['fontes', 'fatos', 'original', 'sem_repeticao', 'sem_promessa', 'neutro', 'sem_autor', 'contexto_numeros', 'seguro'];
const OPCIONAIS = ['sem_generico']; // se o modelo omitir, não derruba a revisão; se vier false, reprova
const CRIT_NEUTRALIDADE = ['sem_adjetivo_politico', 'sem_merito_culpa', 'sem_termos_carregados', 'dois_lados', 'sem_eleicao', 'quem_decidiu_e_impacto'];

async function avaliar(prompt, sistema, lista, opcionais = []) {
  for (let t = 1; t <= 2; t++) {
    const { texto, modelo } = await chamar({ prompt, sistema, temperatura: 0.1 });
    let r; try { r = extrairJSON(texto); } catch (e) { continue; }
    const c = r.criterios || {};
    if (!lista.every((k) => c[k] && typeof c[k].ok === 'boolean')) continue;
    const todos = [...lista, ...opcionais.filter((k) => c[k] && typeof c[k].ok === 'boolean')];
    const obs = Object.fromEntries(todos.map((k) => [k, { ok: c[k].ok, obs: String(c[k].obs || '').slice(0, 400) }]));
    const motivos = todos.filter((k) => !c[k].ok).map((k) => `${k}: ${c[k].obs || 'reprovado pelo revisor'}`);
    return { aprovado: motivos.length === 0, motivos, criterios: obs, modelo };
  }
  return { aprovado: false, motivos: ['revisor devolveu resposta inválida (por segurança, reprovado)'], criterios: {} };
}

const comTrecho = (rascunho) => (rascunho.fontes || []).map((f) => ({ ...f, trecho: String(f.texto || '').slice(0, 6000) }));

/** Revisão geral: fontes, fatos, originalidade, repetição, promessas, política, autor e número no contexto certo. */
const revisar = ({ tipo, hoje, rascunho, recentes, pares }) =>
  avaliar(P.revisor({ tipo, hoje, rascunho, fontes: comTrecho(rascunho), recentes, pares }), P.SISTEMA_REVISOR, CRITERIOS, OPCIONAIS);

/** 3ª etapa, só de neutralidade política (temas de política/economia e textos que falam de governo). */
const revisarNeutralidade = ({ tipo, rascunho }) =>
  avaliar(P.neutralidade({ tipo, rascunho, fontes: rascunho.fontes || [] }), P.SISTEMA_NEUTRALIDADE, CRIT_NEUTRALIDADE);

module.exports = { revisar, revisarNeutralidade };
