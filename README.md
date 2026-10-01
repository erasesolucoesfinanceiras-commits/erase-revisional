# ERASE Revisional

Portal de notícias sobre financiamento de veículos + calculadora de juros (isca de leads). Site estático (HTML/CSS/JS puro) na Netlify; leads via Netlify Forms + envio paralelo ao CRM.

## Como editar
- **Tudo é gerado** por `node scripts/build.js` a partir de `data/config.json` e `data/articles.json`. Não edite os `.html` à mão.
- `data/config.json`: URL do site, WhatsApp, redes sociais, CNPJ/endereço (rodapé), taxa média do Banco Central + mês (`bc`), limites por tipo de veículo.
- Imagens (capas, favicon, og-image): `node scripts/make-images.js` (precisa de Playwright/Chromium).

## Leads
- **Calculadora:** formulário único (nome, WhatsApp com DDD + 9 dígitos, e-mail opcional, aceite LGPD obrigatório + dados do financiamento). O resultado só aparece depois do envio. Todo lead — acima ou dentro do limite — é salvo (`status`: `novo_acima_do_limite` / `novo_dentro_do_limite`).
- **Netlify Forms** recebe: tipo, banco, valores, parcelas, taxa, resultado, UTMs, origem, página de entrada, data/hora (UTC e Brasília) e `lead_id`.
- **Não perde lead:** cada envio entra numa fila em `localStorage` e só sai quando o Netlify responde OK; se falhar, reenvia com espera crescente (e ao voltar a rede, ao reabrir a aba e na próxima visita).
- **CRM:** envio paralelo e silencioso (`enviarParaCRM`), com `origem` = `calculadora` | `popup-entrada`. Constantes `CRM_ENDPOINT`/`CRM_API_KEY` no topo de `assets/js/main.js` (ainda placeholders).

## Pendências
1. CRM: preencher `CRM_ENDPOINT`/`CRM_API_KEY` e ajustar o formato do corpo quando o `erasecrm` estiver pronto.
2. `data/config.json`: links de X e Facebook em `social` (ícones só aparecem quando há URL) e revisar `bc` a cada divulgação do Banco Central. Depois rode `node scripts/build.js`.
3. Os 8 artigos iniciais são exemplos genéricos: revise antes de publicar.
4. **Banco Central:** rodar o workflow *Atualizar série do Banco Central* (acima) logo após o merge.
5. Netlify: subdomínio, notificação de e-mail dos formulários; GitHub: secret `GEMINI_API_KEY` e permissão de PRs (passo a passo na descrição do PR).

## Série histórica do Banco Central (comparação por período)
A calculadora compara a taxa de **carros** com a média do Banco Central do **mês da assinatura** (SGS 25471: taxa média mensal de juros, pessoas físicas, aquisição de veículos, % ao mês, desde 06/2000). Moto e agrícola usam limite fixo (`data/config.json`).
- O arquivo `assets/data/bcb-veiculos.json` **ainda não existe**: enquanto isso a calculadora usa os limites fixos e os textos do site não afirmam comparação por período.
- Para gerar: GitHub → Actions → **Atualizar série do Banco Central** → *Run workflow* (disparo manual, depois do merge na `main`). Ele baixa a série pelo GitHub Actions, reconstrói o site e abre um PR; ao fazer o merge, a comparação por período passa a valer. Roda sozinho todo dia 6 do mês.
- O script se recusa a gravar séries curtas ou em unidade errada (% ao ano).

## Automação de notícias
`.github/workflows/noticias.yml` roda todo dia e segue só quando `dia do ano % 3 == 0` (ou manualmente, na aba Actions). Gera 1 artigo com `gemini-2.5-flash` + Google Search (camada gratuita), reconstrói o site e abre um **Pull Request** para revisão — nada vai ao ar sem o merge.
Categoria por rodízio: `dia do ano % 3` → revisional, financeiro, mercado.
