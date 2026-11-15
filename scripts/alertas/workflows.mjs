// Um item por workflow do repositório (o teste tests/noticias/alertas-test.js exige que todo workflow novo entre aqui
// e na lista `workflows:` de .github/workflows/alertas-telegram.yml).
export const WORKFLOWS = {
  "Notícias automáticas": { oQue: "geração e publicação dos artigos e do Radar", retry: "Sim: roda de novo sozinho nas próximas rodadas (08h, 11h e 14h30 de Brasília) e amanhã. Para refazer já, rode 'Notícias automáticas' na mão." },
  "Atualizar série do Banco Central": { oQue: "atualização da série histórica do Banco Central", retry: "Sim: tenta de novo sozinho amanhã (todo dia 5 a 25, às 09h de Brasília)." },
  "Verificar artigo recente": { oQue: "verificação diária dos artigos e do site", retry: "Sim: roda de novo sozinha amanhã às 16h30 (Brasília). Para refazer já, rode na mão." },
  "Resumo semanal das notícias (e-mail)": { oQue: "e-mail do resumo semanal", retry: "Sim: tenta de novo sozinho na próxima segunda-feira às 08h (Brasília)." },
  "Buscar fotos dos artigos (Pixabay)": { oQue: "busca de fotos dos artigos (manual)", retry: "Não: só roda quando você dispara na mão." },
  "Fotos das categorias (Unsplash)": { oQue: "fotos das categorias (manual)", retry: "Não: só roda quando você dispara na mão." },
  "Despublicar texto": { oQue: "retirada de um texto do ar (manual)", retry: "Não: o texto pode continuar no ar. Rode de novo na mão." },
};

/** Motivo em português simples a partir do nome da etapa que falhou. */
export function motivoPeloPasso(etapa, conclusao) {
  if (conclusao === "cancelled") return "a execução foi cancelada (por você ou substituída por uma mais nova).";
  if (conclusao === "timed_out") return "a execução passou do tempo limite.";
  const e = String(etapa ?? "");
  const mapa = [
    [/falhar se houve erro/i, "a rodada terminou com erro registrado no log do robô."],
    [/gerar|revisar/i, "a geração ou a revisão do texto não terminou."],
    [/gravar|salvar/i, "não foi possível gravar na main (conflito ou falha no push)."],
    [/indexnow/i, "o aviso ao Bing (IndexNow) falhou."],
    [/s[eé]rie|banco central|baixar/i, "o Banco Central não respondeu ou entregou dado incompleto."],
    [/foto/i, "a busca de fotos falhou."],
    [/resumo|enviar/i, "o envio do e-mail do resumo falhou."],
    [/tirar do ar|despublic/i, "a retirada do texto falhou."],
    [/verificar|conferir/i, "a verificação encontrou um problema (artigo atrasado ou site fora do ar)."],
    [/reconstruir|build/i, "o site não compilou."],
  ].find(([re]) => re.test(e));
  return mapa ? mapa[1] : "uma etapa terminou com erro (veja o log da execução).";
}
