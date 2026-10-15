# Auditoria de segurança — site ERASE Revisional (15/10/2026)

Só leitura: nada foi alterado no site além deste relatório. Lotes 3 (Turnstile), 4 (newsletter com confirmação) e 11 (cabeçalhos) da auditoria do CRM ficam fora: aqui só o que falta **além** deles. Limite: não vejo o CRM (Supabase) nem as configurações do GitHub/Cloudflare; o que depende disso está marcado "confirmar".

Legenda de gravidade: 🔴 alta · 🟠 média · 🟡 baixa · ✅ ok.

## Resultado em uma linha
Sem segredo exposto, sem dado de lead em arquivo público e `npm audit` limpo. Os pontos que merecem ação: **o repositório é público e guarda o endereço da empresa**, **uma brecha de injeção de script nos dados estruturados vinda de texto gerado por IA**, **dependências dos workflows sem versão fixa em jobs com segredos e escrita direta na `main`**, e **confirmar no CRM que o Turnstile é obrigatório**.

## Achados, em ordem de gravidade

### 🟠 1. Repositório público com o endereço da empresa (e e-mail, CNPJ)
`github.com/erasesolucoesfinanceiras-commits/erase-revisional` é **público** (visibilidade conferida). `data/config.json` guarda `endereco` ("Rua Pedro Barreto, 20, Centro, Lagoa dos Gatos - PE…"), que o site não mostra por decisão sua, mas qualquer pessoa lê no repositório e no histórico (66 commits). E-mail e CNPJ também estão lá, mas já são públicos no site.
- Correção: tornar o repositório **privado** (o Cloudflare Pages e o GitHub Actions continuam funcionando; só confirmar que a conexão Pages ↔ repositório tem permissão), ou tirar o endereço do `config.json` (some do arquivo, **não** do histórico; para o histórico seria preciso reescrever, o que não recomendo). Observação: repositório privado consome minutos de Actions do plano; hoje o uso é pequeno.

### 🟠 2. Injeção de script via JSON-LD (texto da IA não é escapado)
`scripts/site.js` imprime os dados estruturados com `JSON.stringify(...)` dentro de `<script type="application/ld+json">` **sem escapar `<`**. O corpo dos artigos é limpo (`sanitizar`), mas **título e resumo não**: um título como `...</script><script>…` fecha o bloco e executa código na página. Testei: com esse título, a página gerada contém o `</script><script>` solto. O vetor realista é prompt injection: o robô lê páginas de terceiros e entrega o texto ao Gemini; o revisor confere fatos, não HTML.
- Correção (pequena): escapar `<` como `<` ao gravar o JSON-LD e remover `<` e `>` de título, resumo e nome das fontes na entrada do robô; um teste que falha se `</script>` aparecer em qualquer página.

### 🟠 3. Workflows: dependência sem versão fixa em jobs com segredos, e escrita direta na `main`
- `npm i --no-save sharp` (3 workflows) instala a **última versão** a cada execução, sem `package-lock`, no mesmo passo em que `GEMINI_API_KEY`, `PIXABAY_API_KEY` e `UNSPLASH_ACCESS_KEY` estão no ambiente. Um pacote comprometido poderia ler esses segredos e **publicar na `main`** (os workflows têm `contents: write` e gravam direto, sem Pull Request, por desenho).
- As ações são oficiais (`actions/checkout@v5`, `setup-node@v5`), mas fixadas por **tag**, não por hash.
- `npm audit` (do `sharp` atual): 0 vulnerabilidades. O projeto em si não tem dependências.
- Correção: versão exata do `sharp` + `package-lock.json` e `npm ci --ignore-scripts`; ações fixadas por hash; Dependabot só para Actions; proteção da `main` (exigir que o bot de Actions seja a única exceção) e ativar **secret scanning** e **push protection** (confirmar se estão ligados).

### 🟠 4. Formulários: proteção contra robôs depende do servidor (confirmar no CRM)
Do lado do site: Turnstile em modo invisível nos 4 formulários, token enviado como `turnstile`; honeypot (`bot-field`) em newsletter e Fale Conosco; botão desativado durante o envio; telefone brasileiro (DDD + 9 dígitos), e-mail e aceite LGPD validados no navegador. Pontos além dos lotes 3/4/11:
- Se o Turnstile não carregar em 12 s, o site **envia assim mesmo com `turnstile: null`** ("o CRM decide"). Só é seguro se o CRM **recusar token ausente/inválido**; confirmar.
- A `x-api-key` do site é pública por natureza (está no JS) e a trava por origem (`*.eraseconsulta.com.br`) **não vale fora de navegador** (qualquer script manda o cabeçalho `Origin`). Então o que protege é o Turnstile verificado no servidor + limites por IP/telefone/e-mail no CRM.
- Nenhum campo tem `maxlength` no site (nome, mensagem, e-mail): o CRM precisa limitar tamanho e rejeitar campos extras.
- Calculadora e pop-up não têm honeypot (só Turnstile). Baixo, mas barato de acrescentar.
- Sem dado sensível nos envios além de nome, telefone, e-mail e dados do financiamento; nenhuma gravação de lead no navegador além das UTMs.

### 🟡 5. Cabeçalhos e CSP (além do lote 11)
Hoje: HSTS (1 ano), nosniff, `X-Frame-Options: DENY`, Referrer-Policy, Permissions-Policy e CSP **só em modo Report-Only**, sem endereço para receber relatórios. Além do lote 11: falta `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy` e HSTS `preload`; a CSP precisa de `'unsafe-inline'` em scripts por causa do script de tema no `<head>` e dos `onerror` nas imagens; para endurecer de verdade, mover esses trechos para arquivos ou usar hash.

### 🟡 6. Robô de coleta sem bloqueio de endereços internos
`scripts/noticias/web.js` abre qualquer link das fontes (e segue redirecionamentos) sem bloquear IPs privados ou de metadados. Risco baixo (roda no GitHub Actions, sem rede interna), mas o texto lido vira prompt do Gemini. Correção: recusar hosts privados/loopback e limitar redirecionamentos.

### 🟡 7. `fotos.yml` roda em todo push em `claude/**`, com segredos
Qualquer push de quem tem escrita numa branch `claude/*` dispara o workflow com `PIXABAY/UNSPLASH/GEMINI` no ambiente. Já exige acesso de escrita, então é baixo; mas basta deixar só `workflow_dispatch`.

## O que está ok ✅
- **Segredos:** nenhuma chave de API, token ou chave privada na árvore nem nos 66 commits (varredura por padrões de Google, GitHub, OpenAI/sk-, Resend, AWS, chaves PEM, JWT). Segredos só em GitHub Secrets. Públicos por natureza e corretos: chave do site do CRM, site key do Turnstile, ID do Google Analytics, chave do IndexNow, ID do projeto Supabase.
- **Dados de leads:** nenhum lead, telefone ou e-mail de cliente no repositório; os testes usam dados fictícios. Os únicos telefone e e-mail são os da própria empresa (decisão sua).
- **Arquivos públicos:** `publish.js` copia só HTML, `robots.txt`, `sitemap.xml`, `llms.txt`, a chave do IndexNow, `assets/` e `noticias/`; `data/`, `scripts/`, `tests/`, `.github/` e os `.md` **não** vão ao ar. `.gitignore` cobre `node_modules` e `dist`.
- **Workflows:** entradas manuais (`inputs`) passam por variáveis de ambiente, nunca coladas no comando (sem injeção de comando); `resumo-semanal` só lê (`contents: read`); `despublicar` só remove itens que existem na lista (sem caminho arbitrário).
- **XSS no navegador:** o `innerHTML` dos scripts só recebe texto fixo ou números calculados; o nome digitado na calculadora só entra no link do WhatsApp, já codificado (`encodeURIComponent`). Corpo dos artigos: só `<p>, <h2>, <h3>, <ul>, <li>, <strong>, <em>`, sem atributos nem links.
- **Cookies/Analytics:** o Google Analytics só carrega depois do aceite.

## Correções propostas (para aprovação), em ordem
1. Repositório privado (ou tirar o endereço do `config.json`).
2. Escapar `<` no JSON-LD e limpar `<` `>` de título/resumo/fontes + teste.
3. `sharp` com versão exata + lockfile + `npm ci --ignore-scripts`; ações por hash; Dependabot; proteção da `main`; secret scanning e push protection.
4. Confirmar no CRM: Turnstile obrigatório, limite de tamanho e de taxa; acrescentar `maxlength` e honeypot na calculadora e no pop-up.
5. COOP/CORP e `preload` no HSTS; plano para tirar `unsafe-inline` (depois do lote 11).
6. Bloquear IPs internos e limitar redirecionamentos no robô de coleta.
7. `fotos.yml` só manual.
