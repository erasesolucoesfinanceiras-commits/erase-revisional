# Critérios do revisor (artigos, notas e revisão de guias)

Fluxo: o Gemini escreve → verificações de código (sem IA) → revisão independente por IA → revisão de neutralidade política (temas de política/economia e qualquer texto que fale de governo). Notas e artigos passam pelos mesmos critérios; guias revisados passam pelos mesmos critérios de artigo (modo "guia": exige 2 fontes oficiais).

Legenda: **SEG** = segurança de conteúdo · **EXA** = exatidão · **EST** = estilo/rigor. Estado: **novo**, **reforçado**, **afrouxado**, **mantido**.

| Critério | Onde | Classe | Estado |
|---|---|---|---|
| `seguro`: sem sexual/erótico, mutilação ou violência gráfica, racismo/ódio, assédio, perigoso/ilegal, golpe promovido (reportar/alertar sobre golpe é permitido) | IA + barreira de código (`verificar.js`, lista de termos) | SEG | **novo** |
| `sem_promessa`: nada de resultado garantido, "valores a receber", conselho jurídico individual | código + IA | SEG | mantido |
| Sem escritório/advogado parceiro | código | SEG | mantido |
| `sem_autor`: sem autor inventado, sem assinatura ("Equipe ERASE") | código + IA | SEG | mantido |
| `neutro`: sem opinião política/partidária. **Citar autoridades (juízes, órgãos, Banco Central, ministérios, parlamentares) com declaração atribuída e factual é permitido, sem endosso** | IA | SEG | **afrouxado (resposta do dono)** |
| Propaganda eleitoral/partidária e rótulos partidários (candidato, eleição, voto em…, petista/bolsonarista…, centrão); ataques pessoais (lista de assédio) | código | SEG | mantido (nomes de políticos e siglas de partido **deixaram** de ser barrados por si só) |
| Termos carregados: **só passam dentro de citação atribuída** ("segundo X, '…'"); na voz do texto reprovam | código + IA | SEG | **afrouxado (resposta do dono)** |
| Neutralidade (6 itens: adjetivo político, mérito/culpa, termos carregados, dois lados, eleição, quem decidiu e impacto) | IA (3ª etapa) | SEG | mantido; citação atribuída permitida; `quem_decidiu_e_impacto` virou estilo (sugestão) |
| `fontes`: ≥2 fontes de sites diferentes, reais e recentes (notícia: últimos 14 dias; guia: 2 oficiais) | código + IA | EXA | mantido |
| Só fontes regionais não bastam (precisa oficial ou grande veículo) | código | EXA | mantido |
| `fatos`: todo número/data/preço/lei/decisão está nas fontes | código (`numeros.js`) + IA | EXA | mantido |
| `contexto_numeros`: número usado com o mesmo sentido da fonte | IA | EXA | mantido |
| `original`: nenhum trecho copiado (≥12 palavras seguidas) | código + IA | EXA | mantido |
| `sem_generico`: sem opinião de atribuição vaga ("especialistas destacam"); **número agregado das fontes ("mediana das projeções") não exige listar instituições** | código + IA | EST | **afrouxado** |
| IA não reprova por "interpretação do revisor" que a fonte/texto não diz (cita a frase do texto que reprova) | IA | EST | **afrouxado** |
| `sem_repeticao`: assunto diferente dos últimos 15 dias. **Mesma fonte só reprova se for a MESMA URL e o assunto for parecido** (o mesmo veículo serve a assuntos diferentes) | código + IA | EST | **afrouxado (resposta do dono)** |
| Tamanhos: título, nota (80–520 caracteres), artigo (400–900 palavras), resumo | código | EST | mantido |
| Ressalva do revisor: **só reprova** se for sobre fato, número, promessa/garantia ou segurança (e fontes, originalidade, neutralidade, autor); ressalva de **estilo** (`sem_repeticao`, `sem_generico`, `quem_decidiu_e_impacto`) vira SUGESTÃO registrada no log (`sugestao_revisor`) e não reprova | IA | EST | **afrouxado (resposta do dono)** |

## Perguntas respondidas (2026-10-10)
As 4 perguntas anteriores foram respondidas "sim" e aplicadas (linhas marcadas acima). Continuam sem exceção: números iguais aos da fonte, nenhuma promessa/garantia, ≥2 sites diferentes, nada copiado, sem autor fictício, segurança de conteúdo.

## Registro
Sugestões de estilo do revisor ficam em linhas `sugestao_revisor`. Cada avaliação grava uma linha `avaliacao` em `data/noticias-log.jsonl` e soma em `data/revisor-stats.json` (por dia, tipo — `artigo`, `nota`, `guia_revisao` — e critério). Toda segunda-feira a verificação diária grava `resumo_revisor_semana` no log (e no resumo do run).
