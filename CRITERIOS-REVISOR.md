# Critérios do revisor (artigos, notas e revisão de guias)

Fluxo: o Gemini escreve → verificações de código (sem IA) → revisão independente por IA → revisão de neutralidade política (temas de política/economia e qualquer texto que fale de governo). Notas e artigos passam pelos mesmos critérios; guias revisados passam pelos mesmos critérios de artigo (modo "guia": exige 2 fontes oficiais).

Legenda: **SEG** = segurança de conteúdo · **EXA** = exatidão · **EST** = estilo/rigor. Estado: **novo**, **reforçado**, **afrouxado**, **mantido**.

| Critério | Onde | Classe | Estado |
|---|---|---|---|
| `seguro`: sem sexual/erótico, mutilação ou violência gráfica, racismo/ódio, assédio, perigoso/ilegal, golpe promovido (reportar/alertar sobre golpe é permitido) | IA + barreira de código (`verificar.js`, lista de termos) | SEG | **novo** |
| `sem_promessa`: nada de resultado garantido, "valores a receber", conselho jurídico individual | código + IA | SEG | mantido |
| Sem escritório/advogado parceiro | código | SEG | mantido |
| `sem_autor`: sem autor inventado, sem assinatura ("Equipe ERASE") | código + IA | SEG | mantido |
| `neutro`: sem opinião política/partidária; **opinião de terceiros permitida se atribuída a quem disse e sem endosso** | IA | SEG | **reforçado** (esclarecido) |
| Menção política/partidária e termos carregados/eleitorais | código | SEG | mantido |
| Neutralidade (6 itens: adjetivo político, mérito/culpa, termos carregados, dois lados, eleição, quem decidiu e impacto) | IA (3ª etapa) | SEG | mantido |
| `fontes`: ≥2 fontes de sites diferentes, reais e recentes (notícia: últimos 14 dias; guia: 2 oficiais) | código + IA | EXA | mantido |
| Só fontes regionais não bastam (precisa oficial ou grande veículo) | código | EXA | mantido |
| `fatos`: todo número/data/preço/lei/decisão está nas fontes | código (`numeros.js`) + IA | EXA | mantido |
| `contexto_numeros`: número usado com o mesmo sentido da fonte | IA | EXA | mantido |
| `original`: nenhum trecho copiado (≥12 palavras seguidas) | código + IA | EXA | mantido |
| `sem_generico`: sem opinião de atribuição vaga ("especialistas destacam"); **número agregado das fontes ("mediana das projeções") não exige listar instituições** | código + IA | EST | **afrouxado** |
| IA não reprova por "interpretação do revisor" que a fonte/texto não diz (cita a frase do texto que reprova) | IA | EST | **afrouxado** |
| `sem_repeticao`: assunto diferente dos últimos 15 dias; mesma fonte de outro texto reprova | código + IA | EST | mantido (ver perguntas) |
| Tamanhos: título, nota (80–520 caracteres), artigo (400–900 palavras), resumo | código | EST | mantido |
| "Ressalva reprova": qualquer "porém/dúvida" na observação do revisor reprova | IA | EST | mantido (ver perguntas) |

## Perguntas (não mudei: na dúvida, não afrouxo)
1. **Citar autoridades/políticos com declaração atribuída** (ex.: "segundo o ministro X") hoje reprova por `POLITICA`/neutralidade. Quer permitir só declarações atribuídas, sem adjetivo nem endosso?
2. **Termos carregados** ("caos", "absurdo"…) reprovam até quando estão dentro de uma citação atribuída. Quer exceção para citação entre aspas atribuída?
3. **Mesma fonte** de outro texto dos últimos 15 dias reprova (mesmo que o assunto seja outro). Quer limitar a "mesma URL e mesmo assunto"?
4. **"Ressalva reprova"** (qualquer ressalva do revisor reprova) é a regra que mais reprova texto bom. Quer exigir ressalva só em fatos/números/segurança?

## Registro
Cada avaliação grava uma linha `avaliacao` em `data/noticias-log.jsonl` e soma em `data/revisor-stats.json` (por dia, tipo — `artigo`, `nota`, `guia_revisao` — e critério). Toda segunda-feira a verificação diária grava `resumo_revisor_semana` no log (e no resumo do run).
