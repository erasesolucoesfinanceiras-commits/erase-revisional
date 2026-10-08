// 2ª revisão por IA — chamada separada da que escreveu, com instrução própria e leitura das fontes.
const { chamar, extrairJSON } = require('./gemini');
const P = require('./prompts');

const CRITERIOS = ['fontes', 'fatos', 'original', 'sem_repeticao', 'sem_promessa', 'neutro', 'sem_autor'];

/** Devolve { aprovado, motivos[] }. Resposta inválida do revisor = reprovado (na dúvida, não publica). */
async function revisar({ tipo, hoje, rascunho, recentes }) {
  const fontes = (rascunho.fontes || []).map((f) => ({ ...f, trecho: String(f.texto || '').slice(0, 6000) }));
  const prompt = P.revisor({ tipo, hoje, rascunho, fontes, recentes });
  for (let t = 1; t <= 2; t++) {
    const { texto } = await chamar({ prompt, sistema: P.SISTEMA_REVISOR, temperatura: 0.1 });
    let r; try { r = extrairJSON(texto); } catch (e) { continue; }
    const c = r.criterios || {};
    if (!CRITERIOS.every((k) => c[k] && typeof c[k].ok === 'boolean')) continue;
    const motivos = CRITERIOS.filter((k) => !c[k].ok).map((k) => `${k}: ${c[k].obs || 'reprovado pelo revisor'}`);
    return { aprovado: motivos.length === 0, motivos };
  }
  return { aprovado: false, motivos: ['revisor devolveu resposta inválida (por segurança, reprovado)'] };
}

module.exports = { revisar };
