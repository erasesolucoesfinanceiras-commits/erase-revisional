# Plano por fases — ERASE Revisional

Resumo das fases combinado com a ERASE (as conversas antigas não estão no repositório). Atualize este arquivo a cada decisão.

## Fase 1 — Portal (concluída)
Capa, barra lateral, Radar, relacionados, "Como produzimos". Ver README, seção "Portal (fase 1)".
Ajustes posteriores: coluna "Últimos artigos" acompanha a altura da barra lateral; categorias sem item saem da capa e do menu até terem o primeiro artigo ou nota do Radar.

## Fase 2 — Mais artigos por dia e cobertura das novas categorias
Situação de partida (15/10/2026): 11 artigos em 4 categorias; Crédito rural e Empresas e MEI sem nenhum item; ritmo de 1 artigo a cada 2 dias + 1 nota/dia; Gemini na camada gratuita (muitos 503 e alguns 429 no log).

| Passo | O que | Status |
|---|---|---|
| 1 | Medir cota e custo: evento `uso_gemini` (pedidos, ok, erros por status) no fim de cada execução + `node scripts/noticias/medir.js` (por dia e por tema) | feito; junte ~1 semana de dados |
| 2 | Priorizar categorias vazias no rodízio, **sem mudar o ritmo** (`vazias()` em `scripts/noticias/temas.js`; artigo: categoria sem artigo; nota: sem artigo e sem nota). Se a vazia não tiver notícia boa, o robô segue para o próximo tema como antes | feito; teste `node tests/noticias/rodizio-test.js` |
| 3 | Subir para 1 artigo/dia na camada gratuita, observar 1 semana. **Só com aprovação, com os números do passo 1.** Se a cota apertar, discutir plano pago com o valor na mão | aguardando aprovação |
| 4 | Manter todas as travas (fontes, números, revisores, neutralidade) e o resumo semanal por e-mail | permanente |

Risco do passo 2: enquanto uma categoria vazia não tiver notícia elegível, ela é tentada primeiro todo dia e gasta algumas chamadas a mais antes de passar para a próxima. O passo 1 mostra quanto.

### Mudança no robô em 15/10/2026 (considerar na medição de 22/10)
Entrou **depois** do início da medição do passo 1 (o evento `uso_gemini` começou em 16/10 e a mudança vale a partir do primeiro run depois do deploy), então os números de 22/10 já a incluem:
- **Artigos novos com 500 a 900 palavras** (antes 450 a 700; tolerância de contagem 480 a 950), com fontes citadas e todas as travas mantidas. Textos mais longos = mais tokens por chamada de escrita e de revisão, e mais reescritas reprovadas por número fora da fonte.
- **Guias atuais passam a citar fontes**: enquanto houver guia sem fontes (7 hoje), a revisão de guias roda **1 por dia** (antes: 1 a cada 3 dias), cada passada com escrita + revisor (+ neutralidade quando aplicável) = alguns pedidos extras por dia por cerca de 7 dias. Depois volta ao ritmo de 3 dias. Resultado novo no log: `fontes_citadas` (o guia ganha fontes; só ganha "Atualizado em" se o texto realmente mudar).
Ao ler `medir.js` em 22/10: separar o que é efeito desta mudança (mais pedidos nos dias de revisão de guia, artigos maiores) do que é o ritmo normal antes de decidir o passo 3.

### Revisão de 22/10/2026 — o que ver para decidir o passo 3
Rodar `node scripts/noticias/medir.js` (dados desde 16/10, quando `uso_gemini` começou) e olhar:
1. **Pedidos por dia** (`pedidos`/`ok`): média e pico. Comparar com a cota gratuita do modelo em uso (aistudio.google.com); 1 artigo/dia deve ao menos dobrar os pedidos de artigo.
2. **Erros por dia**: 429 (cota) pesam mais que 503 (instabilidade). Muitos 429 = sem folga para dobrar o ritmo.
3. **Dias sem publicar** e erros "tempo esgotado esperando o Gemini" (3 notas perdidas em 13–14/10).
4. **Categorias vazias**: Crédito rural, Empresas e MEI e as demais já receberam o primeiro artigo? Quantas tentativas cada uma gastou (pulados/tema_trocado por tema)?
5. **Reprovações** por tema (`data/revisor-stats.json`): a qualidade se manteve?
Regra de decisão: sem 429 relevante e com folga de cota → subir para 1 artigo/dia por 1 semana; se a cota apertar → trazer o valor do plano pago para a ERASE decidir.

## Fase 3 — Google Search Console e Bing Webmaster (depois)
Cadastrar o domínio, enviar `sitemap.xml`, acompanhar indexação. Fica para depois da Fase 2.

## Pendências antigas (README)
ID do Google Analytics, links de X/Facebook, revisão dos artigos iniciais.
