// Textos enviados ao Gemini: um para ESCREVER e outro, independente, para REVISAR.
const REGRAS_COMUNS = `REGRAS OBRIGATÓRIAS
- Baseie-se SOMENTE em fatos que estão nas FONTES numeradas abaixo. Não invente números, datas, preços, leis, decisões ou citações. Todo número, data, preço ou decisão do texto tem de estar em pelo menos uma das fontes usadas.
- Texto 100% PRÓPRIO, com suas palavras: não copie trechos das fontes.
- NÚMEROS: use cada número, percentual, valor em reais e data EXATAMENTE como está nas fontes (sem arredondar, converter ou calcular). Não misture números de assuntos, anos, regiões ou produtos diferentes: cite o que o número mede (ex.: "taxa média de veículos" é diferente de "taxa do cartão").
- Prefira fontes de ÓRGÃO OFICIAL e de GRANDE VEÍCULO/SETORIAL. Fonte REGIONAL serve só de complemento e nunca como única base.
- Cite quem decidiu ("o Copom decidiu", "a Câmara aprovou", "o STJ entendeu") e explique o impacto prático para quem financia, sem opinar nem usar adjetivos de valor.
- Use no mínimo 2 das fontes numeradas, de sites diferentes, que tratem do MESMO fato. Informe só os números delas em "fontes_usadas" (os links e as datas são preenchidos pelo sistema). Se não houver 2 fontes sobre o mesmo fato recente, responda sem_novidade.
- NEUTRALIDADE POLÍTICA ABSOLUTA (estamos em período eleitoral): nunca opine sobre partidos, políticos ou candidatos, não elogie nem critique governo ou oposição e não cite nomes de políticos nem de partidos. Atribua medidas a instituições ("o Governo Federal", "o Congresso", "o Banco Central", "o STJ"). Explique o fato e o que ele muda para quem tem ou vai fazer um financiamento.
- Não prometa resultado, não diga que o leitor "vai recuperar", "tem valores a receber" ou "garantido", e não dê conselho jurídico individual (nada de "você deve entrar com ação"). Não afirme que juros acima da média são ilegais por si só.
- Não cite escritório ou advogado parceiro. Não invente autor nem cite nomes de jornalistas: o texto é da "Equipe ERASE" (a assinatura é colocada pelo site; não escreva "Por ...").
- Não escreva chamada para ação ou propaganda no texto: o site acrescenta a chamada final.`;

function listaFontes(cands) {
  return cands.map((c) => `[${c.id}] ${c.titulo} — ${c.nome} (${c.host}) [${c.peso >= 3 ? 'ÓRGÃO OFICIAL' : c.peso >= 2 ? 'GRANDE VEÍCULO/SETORIAL' : 'REGIONAL: só complemento'}] — publicada em ${c.data || 'data não informada'}\n${c.texto.slice(0, 3500)}`).join('\n\n');
}

function escritor({ tipo, modo, tema, hoje, recentes, anterior, motivos, cands }) {
  const evitar = recentes.slice(0, 40).map((x) => `"${x.titulo}"`).join('; ') || '(nenhum)';
  const reescrita = anterior ? `\nSUA VERSÃO ANTERIOR FOI REPROVADA pela revisão pelos motivos abaixo. Reescreva corrigindo TODOS, sobre o MESMO assunto (se for impossível corrigir com as fontes reais, responda {"sem_novidade": true, "motivo": "..."}).\nMotivos: ${motivos.map((m) => '- ' + m).join('\n')}\nVersão anterior: ${JSON.stringify(anterior)}\n` : '';
  const aviso = `FONTES DISPONÍVEIS (únicas que você pode usar):\n${listaFontes(cands)}\n\nPortal "ERASE Revisional": crédito e financiamento no Brasil, com foco em financiamento de veículos. Data de hoje: ${hoje}.\nTEMA DA VEZ: ${tema.nome} — ${tema.foco}.\nNão repita assuntos publicados nos últimos 15 dias: ${evitar}.\n${reescrita}\n${REGRAS_COMUNS}\n`;
  if (tipo === 'nota') {
    return `${aviso}
TAREFA: escreva uma NOTA RÁPIDA (seção "Radar") de 2 a 4 linhas (80 a 500 caracteres no total, texto corrido, sem HTML) sobre uma NOVIDADE REAL e recente entre as fontes acima, relacionada ao tema. Se nenhuma fonte trouxer novidade real e relevante, responda exatamente {"sem_novidade": true, "motivo": "uma frase"} — é melhor não publicar do que publicar sem novidade.
Responda APENAS com um objeto JSON (sem markdown):
{"sem_novidade": false, "titulo": "até 80 caracteres", "texto": "2 a 4 linhas", "fontes_usadas": [1, 3]}`;
  }
  if (modo === 'guia') {
    return `${aviso}
TAREFA: nenhum tema tem novidade hoje. Escreva um ARTIGO EXPLICATIVO e útil (guia, "como funciona", direitos do consumidor) de 450 a 700 palavras sobre um assunto do tema ainda NÃO abordado na lista acima, baseado nas fontes OFICIAIS acima (Banco Central, órgãos .gov.br, tribunais .jus.br etc.). Corpo em HTML simples usando apenas <p>, <h2>, <h3>, <ul>, <li>, <strong>, <em> (sem <h1>, sem estilos).
Responda APENAS com um objeto JSON (sem markdown):
{"sem_novidade": false, "titulo": "até 90 caracteres", "resumo": "1 a 2 frases, 40 a 220 caracteres", "corpo": "<p>...</p>", "fontes_usadas": [1, 2], "foto_busca": "2 a 4 palavras EM INGLÊS para foto de banco de imagens (cenas/objetos genéricos, sem pessoas conhecidas, marcas ou logotipos)"}`;
  }
  return `${aviso}
TAREFA: escolha, entre as fontes acima, uma NOTÍCIA ou DADO RECENTE e REAL relacionado ao tema. Se nenhuma fonte trouxer novidade real e relevante, responda exatamente {"sem_novidade": true, "motivo": "uma frase"}.
Se houver, escreva um artigo ORIGINAL em português do Brasil, informativo e neutro, de 450 a 700 palavras, corpo em HTML simples usando apenas <p>, <h2>, <h3>, <ul>, <li>, <strong>, <em> (sem <h1>, sem estilos).
Responda APENAS com um objeto JSON (sem markdown):
{"sem_novidade": false, "titulo": "até 90 caracteres", "resumo": "1 a 2 frases, 40 a 220 caracteres", "corpo": "<p>...</p>", "fontes_usadas": [1, 3], "foto_busca": "2 a 4 palavras EM INGLÊS para foto de banco de imagens (cenas/objetos genéricos, sem pessoas conhecidas, marcas ou logotipos)"}`;
}

const SISTEMA_REVISOR = 'Você é um revisor editorial INDEPENDENTE, cético e rigoroso. Você NÃO escreveu o texto. Seu trabalho é achar motivos para reprovar; só aprove se tudo estiver comprovado. Responda apenas JSON.';

function revisor({ tipo, hoje, rascunho, fontes, recentes, pares = [] }) {
  const blocoPares = pares.length ? 'PARES NÚMERO-CONTEXTO (o código já confirmou que cada número aparece nas fontes; confira se o SENTIDO é o mesmo):\n' + pares.slice(0, 14).map((q, i) => `${i + 1}. Número "${q.numero}"\n   No texto: ${q.frase.slice(0, 300)}\n   Na fonte (${q.fonte}): ${q.trecho}`).join('\n') : 'PARES NÚMERO-CONTEXTO: (o texto não traz números a conferir)';
  const texto = tipo === 'nota' ? rascunho.texto : rascunho.corpo;
  const ev = fontes.map((f, i) => `FONTE ${i + 1}: ${f.nome} — ${f.url} (data informada: ${f.data || 'sem data'})\n${f.lida ? 'CONTEÚDO DA PÁGINA (trecho):\n' + f.trecho : '[conteúdo indisponível]'}`).join('\n\n');
  return `Data de hoje: ${hoje}. Tipo de texto: ${tipo === 'nota' ? 'NOTA RÁPIDA (2 a 4 linhas)' : 'ARTIGO'}.
TÍTULO: ${rascunho.titulo}
${tipo === 'nota' ? '' : 'RESUMO: ' + rascunho.resumo + '\n'}TEXTO:
${texto}

${ev}

${blocoPares}

ASSUNTOS PUBLICADOS NOS ÚLTIMOS 15 DIAS: ${recentes.map((x) => `"${x.titulo}"`).join('; ') || '(nenhum)'}

Avalie CADA critério (ok = true só se estiver inequivocamente atendido):
1. "fontes": há pelo menos 2 fontes reais e recentes, confiáveis (órgãos oficiais, empresas ou imprensa confiável), e elas tratam mesmo do assunto do texto?
2. "fatos": TODO número, data, preço, percentual, nome de lei ou decisão do texto aparece nas fontes? Liste no motivo qualquer item que NÃO esteja nelas.
3. "original": o texto é próprio, sem trechos copiados das fontes?
4. "sem_repeticao": o assunto é diferente dos publicados nos últimos 15 dias?
5. "sem_promessa": sem prometer resultado ("você vai recuperar", "garantido"), sem dizer que o leitor tem valores a receber, sem conselho jurídico individual e sem citar escritório/advogado parceiro?
6. "neutro": sem opinião política ou partidária, sem elogio ou crítica a governo, oposição, partido ou político, sem tom de campanha?
7. "sem_autor": sem autor inventado, sem nome de jornalista, sem assinatura (a assinatura é "Equipe ERASE")?
8. "contexto_numeros": em CADA par acima, o número é usado com o mesmo sentido da fonte (mesma grandeza, produto, período, ano e região)? Reprove se, por exemplo, uma taxa de cartão for apresentada como taxa de veículo, ou um dado de outro ano ou de outra região for tratado como o atual/local.
Responda APENAS com JSON (sem markdown):
{"criterios": {"fontes": {"ok": true, "obs": ""}, "fatos": {"ok": true, "obs": ""}, "original": {"ok": true, "obs": ""}, "sem_repeticao": {"ok": true, "obs": ""}, "sem_promessa": {"ok": true, "obs": ""}, "neutro": {"ok": true, "obs": ""}, "sem_autor": {"ok": true, "obs": ""}, "contexto_numeros": {"ok": true, "obs": ""}}}
Em "obs" escreva SEMPRE uma observação objetiva (o que conferiu e por que aprovou ou reprovou).`;
}

const SISTEMA_NEUTRALIDADE = 'Você é um revisor de NEUTRALIDADE política de um portal de notícias financeiras, em período eleitoral. Você NÃO escreveu o texto. Aplique a lista de forma objetiva e literal; na dúvida, reprove. Responda apenas JSON.';

function neutralidade({ tipo, rascunho, fontes }) {
  const texto = tipo === 'nota' ? rascunho.texto : rascunho.corpo;
  const ev = fontes.map((f, i) => `FONTE ${i + 1} (${f.nome}): ${String(f.texto || '').slice(0, 3500)}`).join('\n\n');
  return `TÍTULO: ${rascunho.titulo}
TEXTO:
${texto}

${ev}

Aplique esta lista e responda se CADA item está ok (true) ou não (false):
1. "sem_adjetivo_politico": o texto NÃO cita partido, político ou candidato com adjetivo, elogio ou crítica?
2. "sem_merito_culpa": o texto NÃO atribui mérito ou culpa a governo ou oposição (nem sugere que uma medida é boa ou ruim por quem a tomou)?
3. "sem_termos_carregados": o texto NÃO usa termos carregados ou valorativos (ex.: "desastre", "acerto histórico", "manobra", "escândalo")?
4. "dois_lados": se as FONTES trazem posições diferentes sobre o assunto, o texto apresenta todas elas (e não só um lado)? Se as fontes não divergem, marque true.
5. "sem_eleicao": o texto NÃO fala de eleição, campanha, pesquisa eleitoral ou candidatos?
6. "quem_decidiu_e_impacto": o texto diz QUEM decidiu (ex.: "o Copom decidiu", "a Câmara aprovou") e explica o impacto prático para quem tem ou vai fazer um financiamento, sem opinar?
Responda APENAS com JSON (sem markdown):
{"criterios": {"sem_adjetivo_politico": {"ok": true, "obs": ""}, "sem_merito_culpa": {"ok": true, "obs": ""}, "sem_termos_carregados": {"ok": true, "obs": ""}, "dois_lados": {"ok": true, "obs": ""}, "sem_eleicao": {"ok": true, "obs": ""}, "quem_decidiu_e_impacto": {"ok": true, "obs": ""}}}
Em "obs" escreva SEMPRE uma observação objetiva (o que verificou e por que aprovou ou reprovou).`;
}

module.exports = { escritor, revisor, neutralidade, SISTEMA_REVISOR, SISTEMA_NEUTRALIDADE };
