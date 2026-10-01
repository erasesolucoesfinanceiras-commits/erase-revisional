# ERASE Revisional

Portal de notícias sobre financiamento de veículos + calculadora de juros (isca de leads). Site estático (HTML/CSS/JS puro) na Netlify; leads via Netlify Forms + envio paralelo ao CRM.

## Como editar
- **Tudo é gerado** por `node scripts/build.js` a partir de `data/config.json` e `data/articles.json`. Não edite os `.html` à mão.
- `data/config.json`: URL do site, WhatsApp, redes sociais, CNPJ/endereço (rodapé), taxa média do Banco Central + mês (`bc`), limites por tipo de veículo.
- Imagens (capas, favicon, og-image): `node scripts/make-images.js` (precisa de Playwright/Chromium).

## Pendências para você preencher
1. `assets/js/main.js` (topo): `CRM_ENDPOINT` e `CRM_API_KEY` (placeholders). Enquanto não preenchidos, o envio ao CRM falha em silêncio; o Netlify Forms segue como backup.
2. `data/config.json`: `whatsapp` (hoje `5500000000000`), `social`, `empresa.cnpj`, `empresa.endereco`, `siteUrl` (domínio real), e revisar `bc` a cada nova divulgação do Banco Central. Depois rode `node scripts/build.js`.
3. Os 8 artigos iniciais são exemplos genéricos: revise antes de publicar.
4. GitHub: crie o secret `GEMINI_API_KEY` (chave gratuita do Google AI Studio) e habilite *Settings → Actions → General → Allow GitHub Actions to create and approve pull requests*.

## Automação de notícias
`.github/workflows/noticias.yml` roda todo dia e segue só quando `dia do ano % 3 == 0` (ou manualmente, na aba Actions). Gera 1 artigo com `gemini-2.5-flash` + Google Search (camada gratuita), reconstrói o site e abre um **Pull Request** para revisão — nada vai ao ar sem o merge.
Categoria por rodízio: `dia do ano % 3` → revisional, financeiro, mercado.
