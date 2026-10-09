# ERASE Revisional

Portal de notícias sobre financiamento de veículos + calculadora de juros (isca de leads). Site estático (HTML/CSS/JS puro), hospedado no **Cloudflare Pages**; os 4 formulários (newsletter, contato, popup-entrada, calculadora) enviam direto ao CRM da ERASE.

## Como editar
- **Tudo é gerado** por `node scripts/build.js` a partir de `data/config.json` e `data/articles.json`. Não edite os `.html` à mão.
- `data/config.json`: URL do site, WhatsApp, redes sociais, CNPJ/endereço (rodapé), taxa média do Banco Central + mês (`bc`), limites por tipo de veículo.
- Testes: formulários e calculadora na tela (Playwright + CRM simulado) em `tests/formularios/` (veja o cabeçalho de cada arquivo); matemática da calculadora (Tabela Price, 1ª parcela no ato) em `tests/calculadora/` com `node --test tests/calculadora/price.test.js`.
- Imagens (capas, favicon, og-image): `node scripts/make-images.js` (precisa de Playwright/Chromium).

## Leads
- **Calculadora:** formulário único (nome, WhatsApp com DDD + 9 dígitos, e-mail opcional, aceite LGPD obrigatório + dados do financiamento). O resultado só aparece depois do envio. Todo lead — acima ou dentro do limite — é salvo (`status`: `novo_acima_do_limite` / `novo_dentro_do_limite`).
- **Campos enviados** (JSON, POST em `CRM_ENDPOINT`, cabeçalhos `Content-Type` e `x-api-key`): `origem` (= nome do formulário), `bot-field` (vazio) e os campos de cada formulário. Calculadora e popup levam também UTMs, origem, página de entrada, data/hora (UTC e Brasília) e `lead_id`.
- **Sem sucesso falso:** o site só mostra sucesso (e o resultado da calculadora) depois que o CRM confirma (HTTP 2xx). Se falhar, aparece uma mensagem, o formulário continua preenchido e a pessoa tenta de novo; o `lead_id` é o mesmo nas novas tentativas do mesmo envio.
- **CRM:** `CRM_ENDPOINT` e `CRM_API_KEY` ficam no topo de `assets/js/main.js`. A chave é a "chave do site" (pública no navegador); o CRM só aceita origens `*.eraseconsulta.com.br`, então o teste real é em `revisional.eraseconsulta.com.br` (prévias `*.pages.dev` não funcionam).

## Pendências
1. **Google Analytics:** troque `G-XXXXXXXXXX` pelo ID real em `data/config.json` (campo `gaId`, linha 11) e rode `node scripts/build.js`. Enquanto estiver com o marcador, nada é carregado. Eventos: `envio_calculadora`, `envio_popup`, `envio_newsletter`, `envio_contato` (só depois que o CRM confirma).
2. `data/config.json`: links de X e Facebook em `social` (ícones só aparecem quando há URL).
3. Os 8 artigos iniciais são exemplos genéricos: revise.
4. Secrets do GitHub: `GEMINI_API_KEY`, `PIXABAY_API_KEY`, `RESEND_API_KEY`, `ALERTA_EMAIL_PARA` e `ALERTA_EMAIL_DE` (já criados).

## Série histórica do Banco Central (comparação por período)
A calculadora compara a taxa de **carros** com a média do Banco Central do **mês da assinatura** (SGS 25471: taxa média mensal de juros, pessoas físicas, aquisição de veículos, % ao mês, desde 06/2000). Moto e agrícola usam limite fixo (`data/config.json`).
- O arquivo `assets/data/bcb-veiculos.json` é gerado por `scripts/update-bcb.js`. O workflow **Atualizar série do Banco Central** roda sozinho todo dia do 5 ao 25 de cada mês, reconstrói o site e grava direto na `main` só quando sai mês novo (também pode ser disparado à mão em Actions).
- O script se recusa a gravar séries curtas ou em unidade errada (% ao ano).

## Hospedagem (Cloudflare Pages)
- Projeto `erase-revisional` ligado a este repositório; produção = `main`. Domínio: `revisional.eraseconsulta.com.br`.
- Framework preset: **None** · Build command: `node scripts/build.js && node scripts/publish.js` (ou `npm run build`) · Build output directory: **`dist`**. Sem variáveis obrigatórias (Node vem de `.node-version`).
- `scripts/publish.js` copia só os arquivos públicos para `dist/` (inclui `robots.txt`, `sitemap.xml`, `llms.txt`) e GERA `dist/_headers` (cache, `nosniff`, `Referrer-Policy` e `noindex` só para `*.pages.dev`). Nunca coloque `X-Robots-Tag` em regra de caminho nem um `_headers` na raiz.
- Links sem `.html` (o Cloudflare redireciona `/x.html` → `/x`).
- Cada branch gera uma prévia; para economizar builds, desligue as prévias de branches em *Settings > Builds*. O CRM só aceita `*.eraseconsulta.com.br`: os formulários não funcionam em `*.pages.dev`.

## Notícias automáticas (sem Pull Request)
`.github/workflows/noticias.yml` roda todo dia às 08h (Brasília) e grava direto na `main`; o Cloudflare publica sozinho. Código em `scripts/noticias/`. Usa o Gemini da camada gratuita (`gemini-3.8-flash`; troque pela variável `GEMINI_MODEL` do GitHub se o Google descontinuar). O plano gratuito NÃO inclui a busca do Google (erro 429), então as notícias são coletadas pelo próprio código (`scripts/noticias/fontes.js`: buscas de notícias em RSS por tema + feeds em `scripts/noticias/feeds.json`). O Gemini só escolhe entre as fontes coletadas (por número): links, datas e textos vêm do coletor, nunca do modelo.
- **Ritmo:** 1 **artigo completo a cada 2 dias** e 1 **nota do Radar por dia** (2 a 4 linhas, só com novidade real). Máximo 1 artigo e 1 nota por dia. Notas ficam em `data/notas.json` e aparecem em `/radar` e na home.
- **Temas** (`scripts/noticias/temas.js`, 10 categorias em `data/config.json`): veículos (revisional + lançamentos/tecnologia) saem em ~metade das vezes; o resto reveza entre energia solar, mercado imobiliário, consórcio e seguros, crédito pessoal e dívidas, crédito rural, empresas e MEI, bancos e sistema financeiro, economia e política monetária. Sem novidade no tema da vez, pula para o próximo da lista. Só se NENHUM tiver novidade, o artigo vira um guia explicativo com fontes oficiais; nota sem novidade não é publicada.
- **Calibragem automática** (no lugar da aprovação manual), em camadas:
  1. código: ≥2 fontes de sites diferentes, que abrem e são recentes (artigo 14 dias, nota 3, guia: oficiais), com ao menos um órgão oficial ou grande veículo (fonte regional só como complemento; pesos em `fontes.js`); sem trecho copiado (12+ palavras seguidas; listas de números/dados não contam); sem repetir assunto/fonte dos últimos 15 dias nem dos despublicados; sem promessa, conselho jurídico individual, escritório parceiro, menção política/eleitoral, termo carregado ou assinatura;
  2. **números** (`numeros.js`): todo número, percentual, valor e data do texto precisa aparecer nas fontes coletadas (normaliza `14,41% = 14.41 = 14,41 por cento`, `R$ 1.000 = R$ 1 mil`, datas em vários formatos; inteiros pequenos sem contexto são ignorados);
  3. revisão de IA independente, que recebe os pares *frase do texto + trecho da fonte* de cada número e reprova se o sentido mudou (taxa de cartão como taxa de veículo, outro ano/região…), além de fatos, originalidade, repetição, promessas e autor;
  4. revisão de **neutralidade** (3ª chamada, lista objetiva) para política/economia e qualquer texto que fale de governo, Congresso ou Judiciário.
  Reprovou: reescreve 1 vez; reprovou de novo: tenta o próximo tema; nada passou: não publica no dia.
- **Chamada final:** veículos/lançamentos → calculadora; demais temas → análise gratuita da ERASE (Fale Conosco). Assinatura sempre "Equipe ERASE".
- **Log:** `data/noticias-log.jsonl` (publicações, temas pulados, reprovações com o motivo e o que cada revisor observou, erros).
- **Resumo semanal:** toda segunda, 08h, por e-mail (Resend, `resumo-semanal.yml`): publicados (título e link), reprovados por motivo e temas sem publicação.
- **Despublicar:** Actions → *Despublicar texto* → informe o endereço do artigo (ou da nota, `…/radar#id`). Sai do site, home, Radar e sitemap, e o assunto entra em `data/despublicados.json` (o robô não republica).
- **Alerta:** se o workflow falhar 3 dias seguidos, envia e-mail via Resend (secrets acima).
- **Diagnóstico:** Actions → *Run workflow* com `modo = diagnostico` testa os modelos do Gemini e mostra o que o coletor encontra em cada tema (nada é publicado).
- **Amostra sem publicar:** Actions → *Notícias automáticas* → *Run workflow* com `modo = amostra` (gera 2 artigos de economia/política, 1 de energia solar e 1 nota em `amostras/AMOSTRAS.md` na branch escolhida, sem tocar no site). `modo = resumo_teste` envia o resumo semanal de teste.
- Banco Central: `.github/workflows/bcb.yml` roda todo dia do 5 ao 25 e só grava (direto na `main`) quando sai mês novo.
