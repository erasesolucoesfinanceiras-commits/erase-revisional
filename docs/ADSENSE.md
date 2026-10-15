# Prontidão para o Google AdSense — auditoria de 15/10/2026

Só leitura: nada do site foi alterado. Legenda: ✅ ok · ⚠️ atenção · ❌ falta.
Limite da auditoria: não consegui abrir o site no ar nem o site da VSL (o ambiente bloqueia); tudo abaixo vem do repositório. As regras do AdSense mudam: confirme os pontos marcados com (*) no painel do AdSense antes de decidir.

## Resumo
O site está tecnicamente limpo, mas **ainda não está pronto**: falta volume e profundidade de conteúdo, uma página "Sobre", aviso de cookies/consentimento, atualização da Política de Privacidade para anúncios e uma decisão sobre o pop-up e o domínio.

## 1. Conteúdo
| Item | Situação |
|---|---|
| Quantidade | ❌ 11 artigos (7 são guias) e 6 notas do Radar. Sites aprovados costumam ter dezenas de textos úteis; com 11 o risco de "conteúdo insuficiente" é alto. |
| Tamanho | ⚠️ Artigos de 141 a 581 palavras (mediana ~290); 5 têm menos de 250. Notas do Radar têm ~70 palavras (servem como notícia curta, não contam como conteúdo de peso). |
| Histórico | ⚠️ 8 dos 11 artigos foram publicados no mesmo dia (02/10). O robô publica 1 a cada 2 dias desde então; falta tempo de histórico regular. |
| Fontes e revisão | ✅ Artigos de notícia citam 2+ fontes e passam por revisão automática (números, neutralidade, originalidade). ⚠️ Os 7 guias não listam fontes. |
| IA declarada | ✅ Página "Como produzimos nosso conteúdo" explica o uso de IA e a revisão. O Google aceita conteúdo feito com IA quando é útil e original; o risco é texto raso ou repetitivo. |
| Autoria (finanças = tema sensível) | ⚠️ Tudo assina "Equipe ERASE", sem pessoa nem qualificação. Para finanças, autor ou revisor nomeado ajuda na avaliação de confiança. |
| Categorias vazias | ⚠️ Crédito rural e Empresas e MEI têm página "Em breve" no sitemap, sem noindex: são páginas finas indexáveis. |
| Originalidade do site | ✅ Calculadora própria + comparação com série do Banco Central: valor que sites só de notícia não têm. |
| Finalidade | ⚠️ O site também é funil de captação de leads (pop-up, calculadora). Não impede o AdSense, mas o conteúdo editorial precisa ser o foco do que o revisor vê. |

## 2. Páginas obrigatórias
| Página | Situação |
|---|---|
| Sobre | ❌ Não existe página "Sobre nós". Há só um quadro na barra lateral e "Como produzimos". |
| Contato | ✅ `/contato` com formulário e WhatsApp. ⚠️ O endereço da empresa está no `config.json` mas não aparece no rodapé (só razão social e CNPJ). |
| Política de Privacidade | ❌ Cobre LGPD e formulários, mas **não menciona**: Google Analytics, cookies, anúncios do Google/AdSense, cookies de terceiros e como desativar anúncios personalizados. O AdSense exige essa divulgação. |
| Termos de uso | ✅ Existe. ⚠️ Não fala de publicidade nem de links de terceiros. |
| Aviso de cookies/consentimento | ❌ Não há banner. O Google Analytics já carrega para todos. Com anúncios, é preciso consentimento (LGPD; obrigatório no EEE/Reino Unido para quem acessar de lá) com plataforma certificada pelo Google (CMP). |

## 3. Base técnica
| Item | Situação |
|---|---|
| sitemap.xml | ✅ 29 URLs, só datas reais. ⚠️ Inclui as 2 categorias vazias. |
| robots.txt | ✅ Permite tudo e aponta o sitemap. `noindex` só em `*.pages.dev`. |
| Títulos e descrições | ✅ Title, description, canonical, Open Graph e JSON-LD em todas as páginas (testado). |
| Celular | ✅ `viewport` configurado, layout responsivo, testado a 390 px. |
| Velocidade | ✅ Site estático: HTML ~60 KB, CSS 49 KB, JS ~56 KB, imagens WebP com carregamento tardio. Anúncios vão acrescentar peso: medir de novo depois (PageSpeed). |
| Links quebrados | ✅ Nenhum link ou imagem interna quebrada (varredura de todas as páginas). Links externos das fontes não foram testados. |
| ads.txt | ❌ Não existe. Só se cria depois da aprovação (o AdSense fornece a linha). Atenção ao domínio: ver item 5. |
| Search Console | ❌ Ainda não configurado (Fase 3). Não é exigido, mas ajuda a mostrar que o site é indexado. |
| HTTPS e segurança | ✅ HSTS, nosniff, CSP em modo Report-Only. |

## 4. Experiência
| Item | Situação |
|---|---|
| Pop-up de captação | ⚠️ Abre **2,5 s** após entrar, em qualquer página (exceto a calculadora), uma vez por sessão, inclusive em artigos e páginas legais. Cobre a tela inteira no celular (modal com fundo escuro). O Google penaliza janelas que atrapalham o acesso ao conteúdo e o revisor do AdSense pode ver isso na primeira visita. Sugestão: abrir só depois de rolagem ou tempo longo, nunca em artigos, privacidade, termos e contato. |
| Navegação | ✅ Menu claro, categorias, Radar, busca por categorias, rodapé com páginas legais. |
| Acima da dobra | ✅ Capa mostra título, texto e botão da calculadora; sem anúncios hoje. Com anúncios, não colocar nenhum acima do conteúdo na capa nem perto do botão da calculadora ou dos formulários. |
| Anúncios e formulários | ⚠️ Evitar anúncios dentro/ao lado do pop-up, do formulário da calculadora e do botão "Enviar" (cliques acidentais). |

## 5. Domínio (*)
- O AdSense avalia o **site/domínio**. Em 2023 o Google deixou de permitir gerenciar subdomínios como itens separados na lista de sites; na prática a conta fica ligada ao domínio principal (`eraseconsulta.com.br`) e o revisor pode olhar a página principal dele.
- **O site da VSL no domínio principal pode pesar**: uma página de vendas em vídeo costuma ter pouco texto, apelo comercial e promessas, o que o AdSense tende a ler como "conteúdo de baixo valor" ou prática enganosa. Não vi o site da VSL; isso é uma avaliação de risco, não um fato confirmado.
- **ads.txt** é lido na raiz do domínio (`eraseconsulta.com.br/ads.txt`), que fica na hospedagem da VSL, não neste projeto. Quem controla a raiz precisa publicar o arquivo.
- Opções (decidir antes de pedir): (a) aplicar com `eraseconsulta.com.br` e garantir que a raiz tenha conteúdo editorial/links claros para o portal; (b) usar um domínio próprio para o portal, separado da VSL. Confirmar no painel do AdSense como ele trata o subdomínio hoje.

## O que falta, em ordem de prioridade
1. **Decidir o domínio** (item 5) e verificar a raiz/VSL.
2. **Conteúdo**: chegar a 30+ artigos úteis, com 500+ palavras, em 4 a 6 semanas de publicação regular (Fase 2); dar fontes aos guias; esconder (noindex) ou preencher as categorias vazias.
3. **Política de Privacidade** completa (cookies, Google Analytics, anúncios, parceiros do Google, como desativar personalização) e atualizar os Termos.
4. **Banner de cookies/consentimento** com plataforma certificada pelo Google e carregamento do Analytics/anúncios só após o aceite.
5. **Página "Sobre"** (quem é a ERASE, equipe, missão, contato, endereço visível) e **autor/revisor nomeado** nos artigos.
6. **Pop-up**: atrasar e restringir (não abrir em artigos e páginas legais; no celular, versão menos intrusiva).
7. **Search Console** e envio do sitemap (Fase 3); depois, PageSpeed e ads.txt (criado só após a aprovação, na raiz do domínio).

Fontes consultadas: [Ajuda do AdSense sobre subdomínios](https://support.google.com/adsense/answer/12170421).
