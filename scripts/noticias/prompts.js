// Textos enviados ao Gemini: um para ESCREVER e outro, independente, para REVISAR.
const REGRAS_COMUNS = `REGRAS OBRIGATÓRIAS
- Baseie-se SOMENTE em fatos que estão nas FONTES numeradas abaixo. Não invente números, datas, preços, leis, decisões ou citações. Todo número, data, preço ou decisão do texto tem de estar em pelo menos uma das fontes usadas.
- Texto 100% PRÓPRIO, com suas palavras: não copie trechos das fontes.
- NÚMEROS: use cada número, percentual, valor em reais e data EXATAMENTE como está nas fontes (sem arredondar, converter ou calcular). Não misture números de assuntos, anos, regiões ou produtos diferentes: cite o que o número mede (ex.: "taxa média de veículos" é diferente de "taxa do cartão").
- Prefira fontes de ÓRGÃO OFICIAL e de GRANDE VEÍCULO/SETORIAL. Fonte REGIONAL serve só de complemento e nunca como única base.
- NÃO traga fatos, comparações ou números de outros assuntos, países ou setores que não sejam o tema central das fontes usadas (por exemplo, trechos de notícias relacionadas que aparecem na mesma página). Fique no fato principal.
- Impacto prático: baseie-se no que as fontes dizem. Quando for inferência geral, deixe claro que é um efeito possível ("pode", "tende a") e não a apresente como fato nem como regra.
- ATRIBUIÇÃO: opinião, previsão ou avaliação de TERCEIROS é permitida desde que atribuída a quem a disse (nome da pessoa ou instituição, como aparece nas fontes: "segundo o Banco Central", "para o economista Fulano, do Banco X") e sem que o texto a endosse nem a repita como fato ou como posição do portal. PROIBIDO a atribuição vaga e sem fonte ("especialistas destacam", "analistas apontam", "o mercado avalia", "muitos acreditam"): ou diga QUEM disse ou retire a frase. Descrever um número agregado que está nas fontes ("a mediana das projeções do Boletim Focus", "a média das previsões") é permitido, mesmo sem listar cada instituição.
- SEGURANÇA DE CONTEÚDO (o que Google e as redes sociais reprovariam): nada de conteúdo sexual ou erótico, mutilação ou violência gráfica, racismo, discurso de ódio ou ofensa a grupos, assédio ou xingamento a pessoas, instruções de algo perigoso ou ilegal, nem divulgação, venda ou incentivo a golpes ("dinheiro fácil", "renda extra garantida", "lucro garantido"). Reportar ou alertar sobre um golpe, sem ensinar nem promover, é permitido.
- Cite quem decidiu ("o Copom decidiu", "a Câmara aprovou", "o STJ entendeu") e explique o impacto prático para quem financia, sem opinar nem usar adjetivos de valor.
- Use no mínimo 2 das fontes numeradas, de sites diferentes, que tratem do MESMO fato. Informe só os números delas em "fontes_usadas" (os links e as datas são preenchidos pelo sistema). Se não houver 2 fontes sobre o mesmo fato recente, responda sem_novidade.
- NEUTRALIDADE POLÍTICA (período eleitoral): nunca opine nem faça propaganda eleitoral ou partidária, não elogie nem critique governo, oposição, partido, político ou candidato e não faça ataques pessoais. É PERMITIDO citar autoridades (juízes, órgãos, Banco Central, ministérios, parlamentares) com declaração ATRIBUÍDA e FACTUAL ("segundo o ministro X, a medida muda ..."), sem endossar e sem adjetivo. Termos carregados só dentro de citação atribuída, nunca na voz do texto. Sempre que der, atribua medidas a instituições ("o Banco Central", "o STJ"). Explique o fato e o que ele muda para quem tem ou vai fazer um financiamento.
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
{"sem_novidade": false, "titulo": "até 90 caracteres", "resumo": "1 a 2 frases, 40 a 220 caracteres", "corpo": "<p>...</p>", "fontes_usadas": [1, 2], "foto_busca": "2 a 4 palavras EM INGLÊS para foto de banco de imagens LIGADA AO ASSUNTO (ex.: car, vehicle financing, car contract, car documents, car keys on contract); nada sem relação com o tema, sem pessoas conhecidas, marcas ou logotipos"}`;
  }
  return `${aviso}
TAREFA: escolha, entre as fontes acima, uma NOTÍCIA ou DADO RECENTE e REAL relacionado ao tema. Se nenhuma fonte trouxer novidade real e relevante, responda exatamente {"sem_novidade": true, "motivo": "uma frase"}.
Se houver, escreva um artigo ORIGINAL em português do Brasil, informativo e neutro, de 450 a 700 palavras, corpo em HTML simples usando apenas <p>, <h2>, <h3>, <ul>, <li>, <strong>, <em> (sem <h1>, sem estilos).
Responda APENAS com um objeto JSON (sem markdown):
{"sem_novidade": false, "titulo": "até 90 caracteres", "resumo": "1 a 2 frases, 40 a 220 caracteres", "corpo": "<p>...</p>", "fontes_usadas": [1, 3], "foto_busca": "2 a 4 palavras EM INGLÊS para foto de banco de imagens LIGADA AO ASSUNTO (ex.: car, vehicle financing, car contract, car documents, car keys on contract); nada sem relação com o tema, sem pessoas conhecidas, marcas ou logotipos"}`;
}


/** Revisão de um GUIA já publicado (atemporal) com fontes atuais. Só devolve texto novo se algo realmente mudou. */
function revisaoGuia({ guia, hoje, tema, cands, motivos = [], anterior = null }) {
  const reescrita = anterior ? `\nSUA REVISÃO ANTERIOR FOI REPROVADA pelos motivos abaixo. Corrija TODOS ou responda {"sem_mudanca": true}.\nMotivos: ${motivos.map((m) => '- ' + m).join('\n')}\nRevisão anterior: ${JSON.stringify(anterior)}\n` : '';
  return `FONTES ATUAIS (únicas que você pode usar):\n${listaFontes(cands)}\n\nPortal "ERASE Revisional". Data de hoje: ${hoje}. TEMA: ${tema.nome} — ${tema.foco}.\n${reescrita}\n${REGRAS_COMUNS}
TAREFA: REVISAR um GUIA já publicado (conteúdo atemporal). Compare o TEXTO ATUAL abaixo com as FONTES ATUAIS (oficiais) e corrija SOMENTE o que as fontes mostram que mudou, está desatualizado ou errado (números, regras, leis, decisões). NÃO reescreva por estilo e não mude o tom, a estrutura nem o tamanho (±15%). Mantenha todos os avisos que o texto já tem (por exemplo: não há resultado garantido; conteúdo informativo, não é parecer jurídico). Texto 100% próprio, sem copiar trechos das fontes. Se NADA precisa mudar, responda exatamente {"sem_mudanca": true}.
Se algo mudou, responda APENAS com um objeto JSON (sem markdown):
{"sem_mudanca": false, "mudancas": ["o que mudou e por quê, citando a fonte [n]"], "corpo": "<p>...</p>", "fontes_usadas": [1, 2]}
TÍTULO: ${guia.titulo}
TEXTO ATUAL (HTML):
${guia.corpo}`;
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

Avalie CADA critério. REGRA GERAL: ok = true SOMENTE se estiver inequivocamente atendido. Para os critérios 1, 2, 3, 5, 6, 7, 8 e 10 (fontes, FATOS, originalidade, PROMESSA/GARANTIA, neutralidade, autor, NÚMEROS e SEGURANÇA), qualquer ressalva, dúvida ou contexto diferente na sua observação = ok = false; reprove também afirmações gerais ou comparações que não estão nas fontes. Para os critérios 4 e 9 (repetição e atribuição vaga), que são de ESTILO, uma ressalva menor NÃO reprova: marque ok = true e comece a observação com "SUGESTÃO:"; marque ok = false só se for um defeito claro.
1. "fontes": há pelo menos 2 fontes reais e recentes, confiáveis (órgãos oficiais, empresas ou imprensa confiável), e elas tratam mesmo do assunto do texto?
2. "fatos": TODO número, data, preço, percentual, nome de lei ou decisão do texto aparece nas fontes? Liste no motivo qualquer item que NÃO esteja nelas.
3. "original": o texto é próprio, sem trechos copiados das fontes?
4. "sem_repeticao": o assunto é diferente dos publicados nos últimos 15 dias?
5. "sem_promessa": sem prometer resultado ("você vai recuperar", "garantido"), sem dizer que o leitor tem valores a receber, sem conselho jurídico individual e sem citar escritório/advogado parceiro?
6. "neutro": sem opinião política ou partidária, sem elogio ou crítica a governo, oposição, partido ou político, sem tom de campanha? (Opinião e declaração de TERCEIROS, inclusive de autoridades (juízes, órgãos, Banco Central, ministérios, parlamentares), é permitida quando atribuída a quem a disse, factual e sem que o texto a endosse; continua proibido o texto adotar posição política, fazer propaganda eleitoral ou partidária ou atacar pessoas.)
7. "sem_autor": sem autor inventado, sem nome de jornalista, sem assinatura (a assinatura é "Equipe ERASE")?
8. "contexto_numeros": em CADA par acima, o número é usado com o mesmo sentido da fonte (mesma grandeza, produto, período, ano e região)? Reprove se, por exemplo, uma taxa de cartão for apresentada como taxa de veículo, ou um dado de outro ano ou de outra região for tratado como o atual/local.
9. "sem_generico": o texto NÃO tem frases de opinião, previsão ou avaliação com atribuição vaga e sem fonte (\"especialistas destacam\", \"analistas apontam\", \"muitos acreditam\")? Opinião de terceiros precisa dizer QUEM disse (nome ou instituição presente nas fontes). NÃO reprove a descrição de um número agregado que está nas fontes (\"mediana das projeções\", \"média das previsões\", \"consenso do Boletim Focus\") só porque não lista cada instituição, nem frases cujo autor a fonte não nomeia mas o texto não apresenta como opinião de alguém.
10. "seguro": o texto NÃO tem conteúdo sexual ou erótico, mutilação ou violência gráfica, racismo, discurso de ódio ou ofensa a grupos, assédio ou xingamento a pessoas, instruções de algo perigoso ou ilegal, nem promove, vende ou incentiva golpes ("dinheiro fácil", "renda extra garantida", "lucro garantido")? (Reportar ou alertar sobre um golpe, sem ensinar nem promover, é permitido.)
IMPORTANTE: julgue apenas o que o TEXTO afirma. Não reprove por uma "interpretação" sua que a fonte não diz, nem por detalhe que o texto não afirma; cite na observação a frase do texto que reprova. Os critérios 2, 5, 8 e 10 não admitem exceção.
Responda APENAS com JSON (sem markdown):
{"criterios": {"fontes": {"ok": true, "obs": ""}, "fatos": {"ok": true, "obs": ""}, "original": {"ok": true, "obs": ""}, "sem_repeticao": {"ok": true, "obs": ""}, "sem_promessa": {"ok": true, "obs": ""}, "neutro": {"ok": true, "obs": ""}, "sem_autor": {"ok": true, "obs": ""}, "contexto_numeros": {"ok": true, "obs": ""}, "sem_generico": {"ok": true, "obs": ""}, "seguro": {"ok": true, "obs": ""}}}
Em "obs" escreva SEMPRE uma observação objetiva (o que conferiu e por que aprovou ou reprovou).`;
}

const SISTEMA_NEUTRALIDADE = 'Você é um revisor de NEUTRALIDADE política de um portal de notícias financeiras, em período eleitoral. Você NÃO escreveu o texto. Aplique a lista de forma objetiva e literal; na dúvida sobre neutralidade política, reprove. Responda apenas JSON.';

function neutralidade({ tipo, rascunho, fontes }) {
  const texto = tipo === 'nota' ? rascunho.texto : rascunho.corpo;
  const ev = fontes.map((f, i) => `FONTE ${i + 1} (${f.nome}): ${String(f.texto || '').slice(0, 3500)}`).join('\n\n');
  return `TÍTULO: ${rascunho.titulo}
TEXTO:
${texto}

${ev}

Aplique esta lista e responda se CADA item está ok (true) ou não (false). Se a sua observação tiver qualquer ressalva, marque false:
1. "sem_adjetivo_politico": o texto NÃO usa, na voz do texto, adjetivo, elogio ou crítica a partido, político ou candidato? (Declaração factual de autoridade, atribuída e sem endosso, é permitida; propaganda eleitoral/partidária e ataque pessoal não.)
2. "sem_merito_culpa": o texto NÃO atribui mérito ou culpa a governo ou oposição (nem sugere que uma medida é boa ou ruim por quem a tomou)?
3. "sem_termos_carregados": o texto NÃO usa, na voz do texto, termos carregados ou valorativos (ex.: "desastre", "acerto histórico", "manobra", "escândalo")? (Dentro de citação atribuída a quem disse, é permitido.)
4. "dois_lados": se as FONTES trazem posições diferentes sobre o assunto, o texto apresenta todas elas (e não só um lado)? Se as fontes não divergem, marque true.
5. "sem_eleicao": o texto NÃO fala de eleição, campanha, pesquisa eleitoral ou candidatos?
6. "quem_decidiu_e_impacto": o texto diz QUEM decidiu (ex.: "o Copom decidiu", "a Câmara aprovou") e explica o impacto prático para quem tem ou vai fazer um financiamento, sem opinar? (Critério de estilo: uma ressalva menor não reprova; marque ok = true e comece a observação com "SUGESTÃO:".)
Responda APENAS com JSON (sem markdown):
{"criterios": {"sem_adjetivo_politico": {"ok": true, "obs": ""}, "sem_merito_culpa": {"ok": true, "obs": ""}, "sem_termos_carregados": {"ok": true, "obs": ""}, "dois_lados": {"ok": true, "obs": ""}, "sem_eleicao": {"ok": true, "obs": ""}, "quem_decidiu_e_impacto": {"ok": true, "obs": ""}}}
Em "obs" escreva SEMPRE uma observação objetiva (o que verificou e por que aprovou ou reprovou).`;
}

module.exports = { escritor, revisaoGuia, revisor, neutralidade, SISTEMA_REVISOR, SISTEMA_NEUTRALIDADE };
