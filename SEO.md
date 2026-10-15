# Auditoria de SEO — ERASE Revisional (15/10/2026)

Só leitura: nada do site foi alterado. Legenda: ✅ ok · ⚠️ melhorar · ❌ falta. Não consegui abrir o site no ar (o ambiente bloqueia); tudo vem do código e das páginas geradas (31 páginas HTML). Links externos das fontes não foram testados.

## Resumo em uma linha
Base técnica boa (canonical, Open Graph, um H1 por página, sem título ou descrição repetidos, sem link interno quebrado). Os pontos que mais custam são: **imagens de prévia do WhatsApp pesadas e genéricas**, **títulos longos demais**, **capa sem dados estruturados**, **pouco conteúdo sobre as palavras-chave do negócio** e **volume de conteúdo** (também o maior risco do AdSense).

## 1. robots.txt ✅
`User-agent: * / Allow: /` + `Sitemap: https://revisional.eraseconsulta.com.br/sitemap.xml`. Não bloqueia nada, então o arquivo de chave do IndexNow (`/37797a88…txt`) está liberado. `noindex` só em `*.pages.dev` (via `_headers`), 404 e as 2 categorias vazias.

## 2. llms.txt ⚠️
Existe e descreve bem o serviço (análise revisional gratuita de contratos de veículos, calculadora Price × média do Banco Central, notícias com fonte).
- Faltam: página **Sobre**, **Como produzimos nosso conteúdo** e as **categorias**; e os termos de busca do negócio (juros abusivos, busca e apreensão, seguro prestamista).
- Mostra **CNPJ e a cidade (Lagoa dos Gatos - PE)**: se a decisão é não divulgar endereço, vale tirar a cidade.

## 3. Títulos e descrições ⚠️
Sem duplicados em nenhuma das 31 páginas ✅. Tamanho (ideal: título até ~60 caracteres, descrição 70–160):
| Problema | Páginas |
|---|---|
| Título longo (cortado no Google) | Capa 77 · Calculadora 89 · Radar 69 · **todos os 11 artigos** (75 a 100, porque somam " \| ERASE Revisional") |
| Descrição curta | Termos 34 · Privacidade 44 · Contato 67 · 404 22 |
| Descrição longa | Como produzimos 180 · 3 artigos (162, 174, 188) |
Correção simples: no artigo, usar só o título (sem o sufixo) e encurtar o resto; completar as descrições das páginas legais.

## 4. Palavras-chave do negócio ⚠️
Onde aparecem (de 31 páginas; "em título" = aparece no `<title>`):
| Termo | Páginas | Em título |
|---|---|---|
| revisional / revisão de contrato | 31 (marca) | 31 |
| financiamento de veículo | 31 | 2 |
| juros abusivos | 9 | 1 |
| busca e apreensão | **4** | **0** |
| seguro prestamista | **2** | **0** |
| STJ / CET / portabilidade | 9 / 9 / 10 | 1 cada |
- A **capa** não cita "busca e apreensão" nem "prestamista"; a Calculadora e a categoria Revisional citam uma vez.
- Só existe **1 artigo** sobre busca e apreensão (e é uma notícia de fraude com biometria, não o tema jurídico) e **nenhum** sobre seguro prestamista; "juros abusivos" tem 1 artigo (STJ).
- Sugestão (Fase 2): guias fixos para "juros abusivos em financiamento", "busca e apreensão: o que fazer", "seguro prestamista e venda casada", "revisional de financiamento: como funciona", sempre sem promessa de resultado.

## 5. Estrutura técnica
| Item | Situação |
|---|---|
| Canonical | ✅ em todas as páginas |
| Open Graph / Twitter card | ✅ completo (título, descrição, imagem 1200×630, url, locale, site_name) |
| **Prévia no WhatsApp** | ⚠️ as imagens `og-*.png` pesam **282 a 381 KB** (o WhatsApp costuma não mostrar a prévia quando passa de ~300 KB) e são **uma por categoria**, não a foto do artigo. Sugestão: JPG 1200×630 abaixo de 150 KB, e a foto do artigo no `og:image` |
| H1 | ✅ um por página (a capa usa H2 para os títulos do carrossel, ok) |
| Dados estruturados — artigos | ✅ NewsArticle (autor "Equipe ERASE" como Organization, publisher, datePublished; `dateModified` só com revisão real, de propósito). ⚠️ `image` é a imagem genérica da categoria |
| Dados estruturados — capa | ❌ **nenhum**: faltam Organization e WebSite (nome, logo, url) |
| Outros | ✅ Calculadora tem FAQPage. ⚠️ Sem BreadcrumbList nos artigos |
| Alt das imagens | ⚠️ nenhuma imagem sem atributo `alt`, mas **321 usam `alt=""`** (decorativas, ok nos cards) **incluindo a foto principal do artigo**; ela devia ter alt descritivo (título/tema) — ajuda busca por imagem e acessibilidade |
| Links internos quebrados | ✅ nenhum (todas as páginas e imagens) |
| Sitemap | ✅ 28 URLs; ficam de fora só 404 e as 2 categorias vazias (noindex, de propósito). Nada que devia estar e não está |

## 6. Velocidade e celular
Site estático, bom ponto de partida: HTML 63 KB (10 KB compactado), CSS 50 KB (11 KB), JS 28 KB (10 KB), todas as imagens com largura e altura (sem pulo de layout), `loading="lazy"` e WebP. O que mais pesa no celular, em ordem:
1. **Fonte Inter do Google (5 pesos)**: CSS externo que bloqueia a renderização + 2 domínios extras (`fonts.googleapis.com`, `fonts.gstatic.com`). Hospedar a fonte no próprio site (2 pesos) ou usar fonte do sistema.
2. **Imagem do carrossel (LCP)**: a foto do primeiro slide é carregada em 960 px; está leve hoje (15 KB), mas o tamanho depende da foto que o robô escolher (algumas passam de 100 KB).
3. **Cache** de `/assets/*` de só 1 hora; os arquivos já têm versão na URL (`?v=`), então podem ter cache de 1 ano.
4. **Google Analytics** só carrega depois do aceite (bom para velocidade). Anúncios do AdSense, quando entrarem, vão pesar bastante: medir de novo.
5. Imagens `og-*.png` não pesam no carregamento (só em compartilhamento), mas valem a troca pelo item 5.

## 7. Google Analytics
**Já existe**: ID `G-BP76PVP09D` em `data/config.json`, carregado só depois que a pessoa aceita os cookies (banner). Consequência: quem recusa ou ignora o banner não aparece nos números, então as visitas ficam subestimadas. Não preciso de nada seu para instalar. Para o Search Console: preciso que você confirme o domínio (por DNS ou por arquivo/meta de verificação) e eu coloco o que o Google pedir.

## 8. O que pode atrapalhar o AdSense (só apontando)
1. **Pouco conteúdo**: 11 artigos (7 guias, textos de 141 a 581 palavras) + 6 notas de ~70 palavras; 8 dos 11 artigos saíram no mesmo dia. Meta: 30+ artigos de 500+ palavras em semanas de publicação regular (Fase 2, já em andamento).
2. **Conteúdo feito com IA** em tema de finanças: o site já explica o processo (Como produzimos), cita fontes e tem revisão; falta **autor ou revisor nomeado** para reforçar confiança.
3. **Finalidade comercial**: o site também capta leads (pop-up, calculadora, "análise gratuita"). Manter o conteúdo editorial em primeiro plano e evitar promessas ("juros abusivos", "valores a receber").
4. **Pop-up** (corrigido para artigos/legais, mas ainda abre aos 2,5 s na capa): reavaliar se fica no celular.
5. **Dados de contato**: o AdSense não exige e-mail, WhatsApp nem endereço (basta uma forma de contato, como o formulário). **Atenção: você pediu em 15/10 que a página Sobre mostrasse e-mail e WhatsApp, e hoje o e-mail e o WhatsApp aparecem na `/sobre`, e o WhatsApp também no `/contato`.** Se a decisão agora é não divulgar, isso precisa sair; eu não mexi, aguardo sua confirmação. O CNPJ aparece no rodapé e a cidade no `llms.txt`.
6. **Domínio**: o AdSense é por domínio principal; o site da VSL no domínio principal pode pesar na revisão (ver `docs/ADSENSE.md`).
7. **Páginas "Em breve"**: já saíram do sitemap e estão com `noindex`, ok.
8. **Cookies**: há banner simples; para visitantes da União Europeia/Reino Unido o AdSense exige plataforma de consentimento certificada pelo Google.

## Correções propostas, em ordem de importância
1. Prévia do WhatsApp: imagens `og` leves (JPG < 150 KB) e com a foto do artigo.
2. Títulos até ~60 caracteres (capa, calculadora, radar e todos os artigos) e descrições das páginas legais.
3. Dados estruturados da capa (Organization + WebSite) e `image` do artigo com a foto real; alt descritivo na foto principal.
4. Conteúdo para as palavras-chave que faltam (busca e apreensão, seguro prestamista, juros abusivos) e menção na capa.
5. Fonte do Google no próprio site + cache longo para `/assets/*`.
6. `llms.txt` com Sobre, Como produzimos, categorias e palavras-chave; tirar a cidade se for o caso.
7. Decidir sobre e-mail/WhatsApp na Sobre e no Contato.
8. Autor ou revisor nomeado nos artigos; Search Console + Bing Webmaster (Fase 3).
