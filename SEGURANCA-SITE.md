# Auditoria de segurança — site ERASE Revisional (15/10/2026)

Só leitura: nada foi alterado no site além deste relatório. Lotes 3 (Turnstile), 4 (newsletter com confirmação) e 11 (cabeçalhos) da auditoria do CRM ficam fora: aqui só o que falta **além** deles. Limite: não vejo o CRM (Supabase) nem as configurações do GitHub/Cloudflare; o que depende disso está marcado "confirmar".

Legenda de gravidade: 🔴 alta · 🟠 média · 🟡 baixa · ✅ ok.

## Resultado em uma linha
Sem segredo exposto, sem dado de lead em arquivo público e `npm audit` limpo. Os pontos que merecem ação: **o repositório é público e guarda o endereço da empresa**, **uma brecha de injeção de script nos dados estruturados vinda de texto gerado por IA**, **dependências dos workflows sem versão fixa em jobs com segredos e escrita direta na `main`**, e **confirmar no CRM que o Turnstile é obrigatório**.

## Achados, em ordem de gravidade

### 🟠 1. Repositório público com dados da empresa — **decidido e resolvido (16/10/2026)**
O repositório é **público** (visibilidade conferida) e o `data/config.json` guardava o endereço da empresa, que o site não mostra por decisão sua.
- **Decisão:** o repositório **continua público**: somando o consumo de Actions com o do CRM (também privado, mesmo limite), passaria dos 2.000 min/mês grátis se ele virasse privado.
- **Feito:** o campo `endereco` saiu do `data/config.json` (o código nunca o usava) e foi retirado de todo arquivo do repositório (relatórios e testes inclusive); os testes agora só procuram padrões de endereço (rua, avenida, CEP) no site, sem guardar o endereço.
- **Não feito, de propósito:** o histórico do Git **não foi reescrito**. O endereço continua visível em commits antigos (a linha de `data/config.json` existe desde o início do projeto); quem souber procurar no histórico o encontra. Se isso passar a incomodar, a saída é reescrever o histórico (ou migrar o código para um repositório novo e limpo).
- **Conferência dos demais dados internos (árvore atual):** só aparecem o e-mail e o WhatsApp da empresa e o CNPJ, todos públicos no site por decisão sua; e-mails de teste fictícios (`ana@teste.com`, `seu@email.com`…); nenhum e-mail ou telefone pessoal, CPF, senha ou chave privada. Chaves visíveis e **públicas por natureza**: chave do site do CRM (`erase_site_…`, fica no navegador), site key do Turnstile, ID do Google Analytics, chave do IndexNow e o endereço do CRM no Supabase. O que protege o CRM é a verificação no servidor (Lote 3), não o sigilo dessa chave; se ela for trocada no CRM, basta atualizar `assets/js/main.js` e os testes.

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

## Correções propostas, em ordem
1. ~~Repositório privado~~ → decidido: continua público; endereço tirado do repositório.
2. Escapar `<` no JSON-LD e limpar `<` `>` de título/resumo/fontes + teste.
3. `sharp` com versão exata + lockfile + `npm ci --ignore-scripts`; ações por hash; Dependabot; proteção da `main`; secret scanning e push protection.
4. Confirmar no CRM: Turnstile obrigatório, limite de tamanho e de taxa; acrescentar `maxlength` e honeypot na calculadora e no pop-up.
5. COOP/CORP e `preload` no HSTS; plano para tirar `unsafe-inline` (depois do lote 11).
6. Bloquear IPs internos e limitar redirecionamentos no robô de coleta.
7. `fotos.yml` só manual.

---

## Andamento (15/10/2026, noite)

| Item | Situação |
|---|---|
| 1. Repositório | **Decidido: continua público** (limite de 2.000 min/mês dividido com o CRM). Endereço removido do repositório; histórico do Git mantido. Detalhes acima |
| 2. JSON-LD | **Feito.** `<`, `>`, `&` e separadores de linha escapados; título, resumo e nome de fonte do robô sem `<` `>` |
| 3. Dependências dos workflows | **Feito.** `sharp` 0.35.5 exato + `package-lock.json`; `npm ci --ignore-scripts`; ações fixadas por hash (`checkout` v5.1.0, `setup-node` v5.0.0); entrada `modo` do workflow das notícias passou a ir por variável de ambiente. Dependabot, proteção da `main`, secret scanning e push protection: ficam no painel do GitHub (confirmar) |
| 4. Formulários | **Feito:** limites de tamanho (nome 80, e-mail 120, mensagem 2000, WhatsApp 15, valores 14) e honeypot na calculadora e no pop-up. **Turnstile obrigatório: Lote 3 do CRM** |
| 5. Robô de coleta e fotos | **Feito:** só `http(s)` para sites públicos (recusa localhost, redes privadas, metadados, IPv6 interno e nomes que resolvem para IP interno), no máximo 5 redirecionamentos conferidos um a um; workflows de fotos só manuais e só na `main`. **CSP definitiva: Lote 11** |

### Minutos de GitHub Actions por mês (estimativa)
Base: duração real dos runs de 9 a 15/10 (cada job arredonda para cima, em minutos; todos em `ubuntu-24.04`, multiplicador 1x).
| Workflow | Uso |
|---|---|
| Notícias automáticas (3 rodadas/dia) | ~180 min em 7 dias ⇒ **~770 min/mês** (faixa 600 a 1.000; o maior run foi 49 min, quando o Gemini deu muitos erros 503) |
| Verificar artigo recente (1×/dia, ~15 s) | ~30 min |
| Atualizar série do BC (dia 5 a 25, ~15 s) | ~21 min |
| Resumo semanal | ~5 min |
| Fotos (agora só manual, ~45 a 60 min por execução) | ~100 a 200 min (2 a 4 execuções) |
| **Total** | **~930 a 1.260 min/mês** |
Limite grátis de repositório **privado** no plano GitHub Free: **2.000 min/mês** (Pro/Team: 3.000), dividido com o CRM. Sozinho este repositório usaria uns 50% a 65%; com o CRM somado passaria, por isso ele continua público (minutos ilimitados). Em repositório público os minutos são ilimitados. Antes desta mudança, cada `push` em `claude/**` disparava ~1 h de fotos (hoje 2 execuções); isso foi cortado. Risco: um mês com Gemini muito instável pode puxar o uso das notícias para perto de 1.500 min; o `timeout-minutes` do workflow das notícias já foi baixado de 75 para 60 para limitar o pior caso. Acompanhe em *Settings > Billing and plans > Usage*. O Cloudflare Pages continua funcionando com repositório privado (a conexão pelo app do GitHub precisa de permissão para o repositório).
