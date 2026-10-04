# ERASE Revisional

Portal de notícias sobre financiamento de veículos + calculadora de juros (isca de leads). Site estático (HTML/CSS/JS puro), hospedado na Netlify (e preparado para o Cloudflare Pages); os 4 formulários (newsletter, contato, popup-entrada, calculadora) enviam direto ao CRM da ERASE.

## Como editar
- **Tudo é gerado** por `node scripts/build.js` a partir de `data/config.json` e `data/articles.json`. Não edite os `.html` à mão.
- `data/config.json`: URL do site, WhatsApp, redes sociais, CNPJ/endereço (rodapé), taxa média do Banco Central + mês (`bc`), limites por tipo de veículo.
- Imagens (capas, favicon, og-image): `node scripts/make-images.js` (precisa de Playwright/Chromium).

## Leads
- **Calculadora:** formulário único (nome, WhatsApp com DDD + 9 dígitos, e-mail opcional, aceite LGPD obrigatório + dados do financiamento). O resultado só aparece depois do envio. Todo lead — acima ou dentro do limite — é salvo (`status`: `novo_acima_do_limite` / `novo_dentro_do_limite`).
- **Campos enviados** (JSON, POST em `CRM_ENDPOINT`, cabeçalhos `Content-Type` e `x-api-key`): `origem` (= nome do formulário), `bot-field` (vazio) e os campos de cada formulário. Calculadora e popup levam também UTMs, origem, página de entrada, data/hora (UTC e Brasília) e `lead_id`.
- **Sem sucesso falso:** o site só mostra sucesso (e o resultado da calculadora) depois que o CRM confirma (HTTP 2xx). Se falhar, aparece uma mensagem, o formulário continua preenchido e a pessoa tenta de novo; o `lead_id` é o mesmo nas novas tentativas do mesmo envio.
- **CRM:** `CRM_ENDPOINT` e `CRM_API_KEY` ficam no topo de `assets/js/main.js`. A chave é a "chave do site" (pública no navegador); o CRM só aceita origens `*.eraseconsulta.com.br`, então o teste real é em `revisional.eraseconsulta.com.br` (prévias `*.netlify.app` podem ser bloqueadas).

## Pendências
1. CRM: confirmar com o `erasecrm` o formato final do corpo, se mudar.
2. `data/config.json`: links de X e Facebook em `social` (ícones só aparecem quando há URL) e revisar `bc` a cada divulgação do Banco Central. Depois rode `node scripts/build.js`.
3. Os 8 artigos iniciais são exemplos genéricos: revise antes de publicar.
4. **Banco Central:** rodar o workflow *Atualizar série do Banco Central* (acima) logo após o merge.
5. Hospedagem: subdomínio `revisional.eraseconsulta.com.br` (Netlify hoje; ver "Hospedagem" para o Cloudflare Pages); GitHub: secret `GEMINI_API_KEY` e permissão de PRs (passo a passo na descrição do PR).

## Série histórica do Banco Central (comparação por período)
A calculadora compara a taxa de **carros** com a média do Banco Central do **mês da assinatura** (SGS 25471: taxa média mensal de juros, pessoas físicas, aquisição de veículos, % ao mês, desde 06/2000). Moto e agrícola usam limite fixo (`data/config.json`).
- O arquivo `assets/data/bcb-veiculos.json` **ainda não existe**: enquanto isso a calculadora usa os limites fixos e os textos do site não afirmam comparação por período.
- Para gerar: GitHub → Actions → **Atualizar série do Banco Central** → *Run workflow* (disparo manual, depois do merge na `main`). Ele baixa a série pelo GitHub Actions, reconstrói o site e abre um PR; ao fazer o merge, a comparação por período passa a valer. Roda sozinho todo dia 6 do mês.
- O script se recusa a gravar séries curtas ou em unidade errada (% ao ano).

## Hospedagem
- **Netlify (atual):** `netlify.toml` publica a raiz (`.`) com os cabeçalhos de segurança/cache. Sem redirecionamentos, funções, plugins nem variáveis.
- **Cloudflare Pages (migração):** conectar este repositório, produção = `main`.
  - Framework preset: **None** · Build command: `node scripts/build.js && node scripts/publish.js` (ou `npm run build`) · Build output directory: **`dist`**
  - Variáveis de ambiente: **nenhuma obrigatória** (a versão do Node vem de `.node-version`; opcional `NODE_VERSION`).
  - O `_headers` do Cloudflare é **gerado** por `scripts/publish.js` em `dist/` (equivalente ao `[[headers]]` do `netlify.toml` + `noindex` só para `*.pages.dev`). Não deixe um `_headers` na raiz: a Netlify o lê e o `noindex` pegaria o site oficial. Não há `_redirects` porque não existem redirecionamentos.
  - Os links do site não usam `.html` (o Cloudflare redireciona `/x.html` → `/x`); `scripts/publish.js` copia só os arquivos públicos para `dist/`.
  - Cada branch/PR gera uma prévia no Cloudflare; para economizar builds, em *Settings > Builds* desligue as prévias de branches.
  - O CRM só aceita `*.eraseconsulta.com.br`: os formulários só funcionam no domínio oficial, não em `*.pages.dev`.

## Automação de notícias
`.github/workflows/noticias.yml` roda todo dia e segue só quando `dia do ano % 3 == 0` (ou manualmente, na aba Actions). Gera 1 artigo com `gemini-2.5-flash` + Google Search (camada gratuita), reconstrói o site e abre um **Pull Request** para revisão — nada vai ao ar sem o merge.
Categoria por rodízio: `dia do ano % 3` → revisional, financeiro, mercado.
