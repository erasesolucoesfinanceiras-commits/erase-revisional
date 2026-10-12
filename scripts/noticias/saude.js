// Saúde do sistema a partir do log (data/noticias-log.jsonl): artigos, de onde veio a foto, falhas e tentativas extras. Usado pelo resumo semanal.
const FALHAS = new Set(['erro', 'rodada_falhou', 'diagnostico_final', 'sem_publicacao']);
const EXTRAS = new Set(['gemini', 'tema_trocado']); // Gemini: espera e repete / próximo modelo; tema_trocado: outra saída quando o tema não rendeu

/** eventos = linhas do log do período. Foto: a última decisão de cada slug vale (foto_escolhida x foto_padrao). */
function saude(eventos) {
  const foto = new Map();
  for (const e of eventos) if ((e.evento === 'foto_escolhida' || e.evento === 'foto_padrao') && e.slug) foto.set(e.slug, e.evento === 'foto_padrao' ? 'categoria' : String(e.fonte || 'Pixabay').toLowerCase());
  const v = [...foto.values()];
  return {
    artigos: eventos.filter((e) => e.evento === 'publicado' && e.tipo === 'artigo').length,
    fotos: { pixabay: v.filter((x) => x === 'pixabay').length, unsplash: v.filter((x) => x === 'unsplash').length, categoria: v.filter((x) => x === 'categoria').length },
    falhas: eventos.filter((e) => FALHAS.has(e.evento)).length,
    extras: eventos.filter((e) => EXTRAS.has(e.evento)).length,
  };
}

const htmlSaude = (s) => `<h3 style="font-size:16px;margin:18px 0 6px">Saúde do sistema</h3>
<ul style="padding-left:18px;margin:0">
<li>Artigos publicados: <b>${s.artigos}</b></li>
<li>Fotos dos artigos: ${s.fotos.pixabay} Pixabay · ${s.fotos.unsplash} Unsplash · <b>${s.fotos.categoria}</b> com foto da categoria (a busca não achou foto adequada)</li>
<li>Falhas: <b${s.falhas ? ' style="color:#b91c1c"' : ''}>${s.falhas}</b></li>
<li>Tentativas extras (outro modelo, espera e nova tentativa, outro tema): <b>${s.extras}</b></li>
</ul>`;

module.exports = { saude, htmlSaude };
