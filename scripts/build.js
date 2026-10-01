#!/usr/bin/env node
// Gera TODO o site estático a partir de data/config.json + data/articles.json.
//   node scripts/build.js
// Atualiza: index, artigos, categorias, calculadora, páginas legais, artigos
// individuais (noticias/), sitemap.xml e robots.txt.
const fs = require('fs');
const path = require('path');
const S = require('./site');
const { config: C, esc, fmtPct, fmtData, catNome, catUrl, artUrl, absUrl, coverUrl, ICON } = S;

const out = (rel, content) => {
  const f = path.join(S.ROOT, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content);
};

const articles = S.loadArticles();
const SITE = C.siteNome;
const urls = []; // para o sitemap
const LEGAL_DATE = '2026-10-01'; // data de vigência dos textos legais (altere ao revisá-los)
const LASTMOD = articles[0].data; // evita diffs ruidosos a cada build

// ---------------------------------------------------------------- HOME
function home() {
  const [feat, ...rest] = articles;
  const INICIAL = 4;
  const list = rest.map((a, i) => S.rowCard(a, i >= INICIAL)).join('\n');
  const body = `
<div class="free-strip" role="note"><div class="container">${S.FREE_TXT} <span>· feita pela ERASE, sem pagar nada por ela</span></div></div>
<section class="hero">
<div class="container hero-inner">
<span class="badge">Simulação gratuita</span>
<h1>Seu financiamento de veículo pode estar cobrando juros acima da média</h1>
<p class="lead">Notícias sobre financiamento e uma calculadora gratuita que resolve a taxa de juros real do seu contrato e compara com a referência do Banco Central.</p>
<form class="newsletter" id="newsletter-form" novalidate>
<label class="sr-only" for="nl-email">Seu e-mail</label>
<input id="nl-email" name="email" type="email" placeholder="Seu melhor e-mail" autocomplete="email" required>
<input type="text" name="bot-field" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
<button class="btn btn-dark" type="submit">Receber novidades</button>
</form>
<p class="form-msg" id="newsletter-msg" role="status" aria-live="polite"></p>
<a class="btn btn-primary btn-lg" href="/calculadora.html">Calcular minha taxa agora</a>
</div>
</section>

<section class="container featured-wrap" aria-label="Destaque">
<a class="featured" href="${artUrl(feat)}">
<img src="${coverUrl(feat)}" alt="" width="1160" height="460">
<div class="featured-text">
<span class="tag tag-on-img">${esc(catNome(feat.categoria))}</span>
<h2>${esc(feat.titulo)}</h2>
<p>${esc(feat.resumo)}</p>
</div>
</a>
</section>

<section class="container home-grid">
<div>
<div class="section-head"><h2>Últimos artigos</h2><a href="/artigos.html">Ver todos</a></div>
<div class="row-list" id="lista-artigos">
<!-- ARTIGOS:INICIO -->
${list}
<!-- ARTIGOS:FIM -->
</div>
${rest.length > INICIAL ? '<button class="btn btn-outline btn-block more-btn" id="ver-mais" type="button">Veja mais</button>' : ''}
</div>
<div class="sticky-col">${S.promoCard()}</div>
</section>

${S.ctaBanner()}
${S.trustBadges()}`;
  out('index.html', S.page({
    meta: {
      title: `${SITE} | Juros de financiamento de veículos: notícias e calculadora`,
      desc: 'Notícias sobre financiamento de veículos e uma calculadora gratuita para descobrir a taxa de juros real do seu contrato e comparar com a média do Banco Central.',
      path: '/',
    },
    active: 'home', body, forms: ['newsletter'],
  }));
  urls.push(['/', '1.0']);
}

// ---------------------------------------------------------------- LISTAS
function listPage({ file, title, desc, h1, intro, items, active, p }) {
  const body = `
<section class="page-head"><div class="container">
<h1>${esc(h1)}</h1>${intro ? `<p class="lead">${esc(intro)}</p>` : ''}
</div></section>
<section class="container home-grid">
<div class="row-list">${items.length ? items.map((a) => S.rowCard(a)).join('\n') : '<p>Em breve, novos artigos nesta categoria.</p>'}</div>
<div class="sticky-col">${S.promoCard()}</div>
</section>
${S.ctaBanner()}`;
  out(file, S.page({ meta: { title, desc, path: p }, active, body }));
  urls.push([p, '0.7']);
}

function lists() {
  listPage({
    file: 'artigos.html', p: '/artigos.html', active: 'artigos',
    title: `Todos os artigos | ${SITE}`,
    desc: 'Todos os artigos sobre financiamento de veículos, juros e mercado de carros publicados pela ERASE Revisional.',
    h1: 'Todos os artigos', intro: 'Tudo o que publicamos sobre financiamento de veículos, juros e mercado.', items: articles,
  });
  for (const slug of Object.keys(C.categorias)) {
    listPage({
      file: `categoria-${slug}.html`, p: catUrl(slug), active: 'cat-' + slug,
      title: `${catNome(slug)} | ${SITE}`,
      desc: C.categorias[slug].descricao,
      h1: catNome(slug), intro: C.categorias[slug].descricao,
      items: articles.filter((a) => a.categoria === slug),
    });
  }
}

// ---------------------------------------------------------------- ARTIGOS
function injectCTA(corpo) {
  const cta = `<aside class="inline-cta"><strong>Quanto você paga de juros?</strong><span>Descubra a taxa real do seu financiamento em pouco mais de um minuto.</span><a class="btn btn-primary btn-sm" href="/calculadora.html">Calcular minha taxa</a></aside>`;
  const parts = corpo.split('</p>');
  if (parts.length < 3) return corpo + cta;
  const at = Math.ceil((parts.length - 1) / 2);
  return parts.slice(0, at).join('</p>') + '</p>' + cta + parts.slice(at).join('</p>');
}

function artigos() {
  for (const a of articles) {
    const f = a.fonte || {};
    const fonteHtml = f.nome
      ? `<p class="source">Fonte: ${f.url ? `<a href="${esc(f.url)}" target="_blank" rel="noopener noreferrer nofollow">${esc(f.nome)}</a>` : esc(f.nome)}</p>`
      : '';
    const jsonld = {
      '@context': 'https://schema.org',
      '@type': 'NewsArticle',
      headline: a.titulo,
      description: a.resumo,
      image: [absUrl('/assets/img/og-article-' + a.categoria + '.png')],
      datePublished: a.data,
      dateModified: a.data,
      mainEntityOfPage: { '@type': 'WebPage', '@id': absUrl(artUrl(a)) },
      articleSection: catNome(a.categoria),
      inLanguage: 'pt-BR',
      author: { '@type': 'Organization', name: C.empresa.razaoSocial },
      publisher: {
        '@type': 'Organization', name: C.empresa.razaoSocial,
        logo: { '@type': 'ImageObject', url: absUrl('/assets/img/apple-touch-icon.png') },
      },
    };
    const body = `
<article class="container article">
<nav class="crumbs" aria-label="Você está em"><a href="/">Início</a> / <a href="${catUrl(a.categoria)}">${esc(catNome(a.categoria))}</a></nav>
<a class="tag" href="${catUrl(a.categoria)}">${esc(catNome(a.categoria))}</a>
<h1>${esc(a.titulo)}</h1>
<p class="lead">${esc(a.resumo)}</p>
<p class="meta"><time datetime="${a.data}">${fmtData(a.data)}</time></p>
<img class="article-cover" src="${coverUrl(a)}" alt="" width="860" height="430">
<div class="article-body">
${injectCTA(a.corpo)}
</div>
${fonteHtml}
<p class="disclaimer">Conteúdo informativo. Não constitui parecer jurídico ou financeiro nem promessa de resultado.</p>
</article>
${S.ctaBanner()}`;
    out(`noticias/${a.slug}.html`, S.page({
      meta: {
        title: `${a.titulo} | ${SITE}`, desc: a.resumo, path: artUrl(a), type: 'article',
        image: `/assets/img/og-article-${a.categoria}.png`, jsonld,
      },
      active: 'artigos', body,
    }));
    urls.push([artUrl(a), '0.6', a.data]);
  }
}

// ---------------------------------------------------------------- CALCULADORA
function calculadora() {
  const bc = C.bc, L = C.limites;
  const faq = [
    ['O que a calculadora faz, exatamente?',
      'A partir do valor financiado, do valor da parcela e do prazo, ela resolve matematicamente qual taxa de juros mensal está embutida no seu contrato — pelo sistema Price — e compara esse número com uma faixa de referência de mercado para o seu tipo de veículo. O resultado é um cálculo comparativo, não uma análise do contrato assinado.'],
    ['O resultado é garantia de valor a receber?',
      'Não. Nenhum valor exibido aqui é devido a você por qualquer instituição, e a diferença mostrada não é devida a você. Ela é apenas a economia estimada em relação à faixa de referência, dados os números que você informou. Se isso significa alguma coisa no seu caso concreto é uma avaliação jurídica, que depende de ler o contrato assinado — e a decisão final, quando há disputa, é do Judiciário.'],
    ['Quanto o mercado costuma cobrar num financiamento de veículo?',
      `A taxa média divulgada pelo Banco Central para crédito livre a pessoas físicas na aquisição de veículos foi de ${fmtPct(bc.taxaMedia)}% ao mês na última divulgação (${bc.mesReferencia}). Motos costumam ser mais caras e financiamentos agrícolas, mais baratos, por conta de linhas subsidiadas como o Pronaf.`],
    ['A partir de que taxa a calculadora sinaliza o contrato?',
      `A partir de ${fmtPct(L.carro)}% ao mês para carros, ${fmtPct(L.moto)}% para motos e ${fmtPct(L.agricola)}% para agrícolas. Ser sinalizado aqui não quer dizer que o contrato tem problema — quer dizer que ele está acima do nosso parâmetro de comparação, que é conservador de propósito.`],
    ['Uma taxa acima da faixa é ilegal?',
      'Não por si só. A jurisprudência do STJ é que juros remuneratórios não têm limite fixo e só podem ser considerados abusivos quando comprovadamente destoam da taxa média de mercado da época da contratação — e mesmo aí quem decide é o juiz, caso a caso. Sua taxa também depende do seu perfil de crédito, da garantia e do que foi negociado. Ficar acima da faixa é um indício que vale investigar, não uma conclusão.'],
    ['A ERASE é um banco ou um escritório de advocacia?',
      'Nem um nem outro. A ERASE Revisional é uma ferramenta de simulação operada pela ERASE Soluções Financeiras, que não é instituição financeira, correspondente bancário nem escritório de advocacia. A avaliação de casos individuais é conduzida por escritório de advocacia parceiro, em relação profissional firmada diretamente entre você e o advogado.'],
    ['A análise do contrato é gratuita?',
      'Sim. A análise do contrato é 100% gratuita: você não paga nada por ela. Ela é feita pela ERASE, a partir do contrato que você enviar, e pode verificar itens que a calculadora não enxerga, como seguro prestamista, tarifas e outras cobranças dentro da parcela. Ela não indica valores a receber e não garante resultado. Qualquer avaliação jurídica de caso individual continua sendo conduzida por escritório de advocacia parceiro, conforme explicado no rodapé.'],
    ['Quanto custa?',
      'A simulação e a análise do contrato são 100% gratuitas: você não paga nada por elas. Você não paga nada para usar esta página e não pedimos dados de pagamento em nenhum momento.'],
    ['O que vocês fazem com meus dados?',
      'Usamos nome e WhatsApp para devolver a análise e permitir o contato do especialista. Não vendemos seus dados. O detalhamento completo — o que coletamos, com quem compartilhamos e como pedir exclusão — está na Política de Privacidade, linkada no rodapé.'],
    ['Serve para carro, moto e agrícola?',
      'Sim. Cada tipo tem uma faixa de referência diferente e a calculadora ajusta a comparação automaticamente conforme o tipo selecionado.'],
  ];
  const faqLd = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  };
  const parcelasOpts = [12, 18, 24, 30, 36, 42, 48, 54, 60, 66, 72, 84, 96]
    .map((n) => `<option value="${n}">${n} parcelas</option>`).join('');

  const body = `
<section class="calc-hero"><div class="container">
<span class="eyebrow">Simulação gratuita · Carros, motos e agrícolas</span>
<h1><span class="grad">Qual é a taxa real do seu financiamento?</span></h1>
<p class="lead">Em pouco mais de um minuto, a calculadora resolve a taxa de juros mensal embutida no seu contrato — a partir da parcela, do valor financiado e do prazo — e mostra como ela se compara à média publicada pelo Banco Central, hoje em torno de <strong>${fmtPct(bc.taxaMedia)}% ao mês</strong> para carros, segundo a última divulgação do Banco Central (${esc(bc.mesReferencia)}).</p>
<p class="small-note">É um cálculo comparativo, gratuito e sem compromisso. Não é análise jurídica do contrato e não indica valores a receber.</p>
</div></section>

<section class="container calc-grid" id="calculadora"
  data-limite-carro="${L.carro}" data-limite-moto="${L.moto}" data-limite-agricola="${L.agricola}"
  data-bc-taxa="${bc.taxaMedia}" data-bc-mes="${esc(bc.mesReferencia)}">
<div class="calc-card">
<div class="calc-bar"><div class="calc-bar-top"><strong>Simulação em tempo real</strong><span id="progress-text">Preencha seus dados para iniciar...</span></div>
<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="progress"><div class="progress-fill" id="progress-fill"></div></div></div>
<form id="calc-form" novalidate>
<fieldset class="vtype"><legend>Tipo de veículo <span class="req">*</span></legend>
<label><input type="radio" name="tipo" value="carro" checked><span>Carro</span></label>
<label><input type="radio" name="tipo" value="moto"><span>Moto</span></label>
<label><input type="radio" name="tipo" value="agricola"><span>Agrícola</span></label>
</fieldset>
<div class="field"><label for="banco">Banco / financeira <span class="opt">(opcional)</span></label>
<input id="banco" name="banco" list="bancos" autocomplete="off" placeholder="Ex.: Banco do Brasil, Santander, BV..." maxlength="60"><datalist id="bancos"><option value="Banco do Brasil"><option value="Bradesco"><option value="Caixa"><option value="Itaú"><option value="Santander"><option value="BV"><option value="Banco Pan"><option value="Omni"><option value="Safra"><option value="Porto Seguro"><option value="Outro"></datalist></div>
<div class="field"><label for="valor_total">Valor total do veículo (R$) <span class="req">*</span></label>
<div class="money"><span>R$</span><input id="valor_total" name="valor_total" inputmode="numeric" autocomplete="off" placeholder="0,00"></div><small class="err" data-err="valor_total">Informe o valor do veículo</small></div>
<div class="field"><label for="entrada">Valor de entrada <span class="req">*</span></label>
<div class="money"><span>R$</span><input id="entrada" name="entrada" inputmode="numeric" autocomplete="off" placeholder="0,00"></div><small class="err" data-err="entrada">Informe a entrada (pode ser 0)</small></div>
<div class="field"><label for="parcela">Valor atual da parcela <span class="req">*</span></label>
<div class="money"><span>R$</span><input id="parcela" name="parcela" inputmode="numeric" autocomplete="off" placeholder="0,00"></div><small class="err" data-err="parcela">Informe a parcela atual</small></div>
<div class="field-row">
<div class="field"><label for="n_parcelas">Quantas parcelas financiou? <span class="req">*</span></label>
<select id="n_parcelas" name="n_parcelas"><option value="">Selecione</option>${parcelasOpts}</select><small class="err" data-err="n_parcelas">Selecione o total de parcelas</small></div>
<div class="field"><label for="pagas">Quantas parcelas já pagou? <span class="req">*</span></label>
<div class="money suffix"><input id="pagas" name="pagas" type="number" inputmode="numeric" min="0" step="1" placeholder="0"><span>meses</span></div><small class="err" data-err="pagas">Informe quantas parcelas já pagou</small></div>
</div>
<div class="contact-block"><h3>Para ver o resultado, informe seu contato</h3>
<div class="field"><label for="lead-nome">Nome completo <span class="req">*</span></label><input id="lead-nome" name="nome" autocomplete="name" placeholder="Seu nome completo (não abrevie)"><small class="err" data-err="nome">Informe seu nome completo (não abrevie)</small></div>
<div class="field"><label for="lead-wa">WhatsApp <span class="req">*</span></label><input id="lead-wa" name="whatsapp" inputmode="tel" autocomplete="tel" placeholder="(81) 99999-9999"><small class="err" data-err="whatsapp">WhatsApp inválido — use DDD + 9 dígitos</small></div>
<div class="field"><label for="lead-email">E-mail <span class="opt">(opcional)</span></label><input id="lead-email" name="email" type="email" autocomplete="email" placeholder="voce@email.com"><small class="err" data-err="email">E-mail inválido</small></div>
<div class="field check"><label><input type="checkbox" id="lgpd" name="lgpd"><span>Autorizo a ERASE Soluções Financeiras e o escritório de advocacia parceiro a entrar em contato comigo por WhatsApp, telefone ou e-mail sobre esta simulação, conforme a <a href="/privacidade.html" target="_blank" rel="noopener">Política de Privacidade</a>. <span class="req">*</span></span></label><small class="err" data-err="lgpd">É necessário autorizar o contato para ver o resultado</small></div></div>
${S.freeBadge("block")}
<button class="btn btn-primary btn-lg btn-block" type="submit" id="calc-btn">Calcular minha taxa — grátis</button>
<p class="fine">Simulação sobre os dados que você informar. Não é análise jurídica e não indica valores a receber.</p>
</form>
</div>

<aside class="panel" id="analise" data-state="coletando" aria-live="polite">
<div class="panel-head"><strong>Análise em tempo real</strong><span class="status" id="status">Coletando</span></div>
<div id="panel-body">
<h2 class="panel-title">Aguardando seu contrato...</h2>
<p>À medida que você preencher o formulário, preparamos o cálculo e, depois do envio dos seus dados, mostramos o resultado: calculamos a taxa que está sendo cobrada e comparamos com a média de mercado para <span id="tipo-label">carro</span>.</p>
<ul class="steps-list">
<li data-step="1"><i></i>Identificar a taxa real do contrato</li>
<li data-step="2"><i></i>Cruzar com a faixa de referência do mercado</li>
<li data-step="3"><i></i>Estimar a economia nas parcelas restantes</li>
</ul>
</div>
<div id="result-actions" hidden></div>
</aside>
</section>

<section class="container prose-block">
<div class="notice"><strong>Esta página é uma ferramenta de simulação.</strong> O resultado é um <strong>cálculo estimado</strong> feito sobre os números que você digitou e comparado a médias de mercado. Não é análise do seu contrato, não é parecer jurídico ou financeiro, não afirma que houve cobrança indevida e <strong>não indica valores a receber</strong>. Só um advogado, lendo o contrato assinado, pode avaliar o seu caso — e, havendo disputa, quem decide é o Judiciário.</div>
</section>

<section class="container prose-block">
<h2>Por que duas pessoas pagam taxas diferentes pelo mesmo carro</h2>
<p>A taxa de um financiamento de veículo não é tabelada. Ela varia com o banco, o perfil de crédito, o valor da entrada, o prazo e a negociação feita na hora. Duas pessoas comprando o mesmo carro no mesmo mês podem sair com taxas bem diferentes — e quem fecha rápido, na concessionária, sem comparar, costuma ficar do lado mais caro dessa distribuição.</p>
<p>O problema é que quase ninguém sabe qual taxa está pagando. O contrato mostra a parcela, não o juro efetivo. Esta calculadora reverte essa conta: com parcela, prazo e valor financiado, ela devolve a taxa mensal que produz exatamente esses números e mostra onde ela cai em relação à faixa de referência do seu tipo de veículo.</p>
<p>Saber isso é útil por si só — para renegociar, para comparar uma portabilidade ou simplesmente para entender o que você assinou. E se a diferença for grande, é o tipo de coisa que vale levar a um advogado, que aí sim pode ler o contrato e dizer se há algo a questionar.</p>
</section>

<section class="container prose-block">
<h2>O que esta calculadora faz — e o que não faz</h2>
<div class="two-col">
<div class="card-list yes"><h3>Faz</h3><ul>
<li>Calcula a taxa mensal e anual efetiva embutida no seu contrato.</li>
<li>Compara com a faixa de referência do seu tipo de veículo, baseada em dados do Banco Central.</li>
<li>Estima a economia nas parcelas restantes caso o contrato estivesse na faixa de referência.</li>
<li>Oferece a análise do contrato, feita pela ERASE e 100% gratuita: você não paga nada por ela.</li>
<li>Se você quiser, encaminha seu contato a um especialista parceiro.</li></ul></div>
<div class="card-list no"><h3>Não faz</h3><ul>
<li>Não lê o seu contrato nem consulta dados do banco.</li>
<li>Não considera IOF, tarifas, seguros ou encargos embutidos.</li>
<li>Não afirma que houve cobrança indevida nem indica valor a receber.</li>
<li>Não oferece renegociação de dívida, quitação ou limpeza de nome.</li></ul></div>
</div>
</section>

<section class="container prose-block">
<h2>Como funciona</h2>
<ol class="how">
<li><span>1</span><div><h3>Informe os números do contrato</h3><p>Tipo de veículo, valor do veículo, entrada, parcela, prazo e quantas parcelas já pagou.</p></div></li>
<li><span>2</span><div><h3>Calculamos a taxa embutida</h3><p>Resolvemos a taxa mensal pelo sistema Price e comparamos com a referência do seu tipo de veículo.</p></div></li>
<li><span>3</span><div><h3>Veja o resultado e decida</h3><p>Você vê a taxa, o veredito e a economia estimada. Se quiser, fala com um especialista.</p></div></li>
</ol>
</section>

<section class="container prose-block faq" id="faq">
<h2>Perguntas frequentes</h2>
${faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n')}
</section>`;
  out('calculadora.html', S.page({
    meta: {
      title: `Calculadora de juros do financiamento — compare a taxa do seu contrato | ${SITE}`,
      desc: 'Descubra a taxa de juros mensal embutida no seu financiamento de carro, moto ou máquina agrícola e compare com a média do Banco Central. Simulação gratuita.',
      path: '/calculadora.html', jsonld: faqLd,
    },
    active: 'calc', body, forms: ['calculadora'], scripts: ['/assets/js/calculator.js'],
  }));
  urls.push(['/calculadora.html', '0.9']);
}

// ---------------------------------------------------------------- LEGAIS / CONTATO
function legal(file, title, h1, html) {
  out(file, S.page({
    meta: { title: `${title} | ${SITE}`, desc: `${title} da ERASE Revisional.`, path: '/' + file },
    active: '', body: `<article class="container article legal-doc"><h1>${h1}</h1>${html}</article>`,
  }));
  urls.push(['/' + file, '0.3']);
}

function legais() {
  const razao = esc(C.empresa.razaoSocial);
  legal('termos.html', 'Termos de uso', 'Termos de uso', `
<p class="meta">Última atualização: ${fmtData(LEGAL_DATE)}</p>
<h2>1. Sobre o serviço</h2>
<p>O site ERASE Revisional é operado pela ${razao} e reúne conteúdo informativo sobre financiamento de veículos e uma ferramenta de simulação que estima a taxa de juros mensal embutida em um contrato a partir de dados informados pelo usuário.</p>
<h2>2. Natureza da simulação</h2>
<p>O resultado da calculadora é uma estimativa baseada em médias de mercado e nos dados informados pelo usuário. Não constitui parecer jurídico, financeiro ou consultoria, não indica valores a receber, não afirma a existência de cobrança indevida e não representa promessa ou garantia de resultado. A economia exibida é apenas uma comparação com uma faixa de referência e não é devida ao usuário por qualquer instituição.</p>
<h2>3. O que não somos</h2>
<p>A ${razao} não é instituição financeira, correspondente bancário nem escritório de advocacia. A avaliação de casos individuais é conduzida por escritório de advocacia parceiro, em relação profissional firmada diretamente entre o usuário e o advogado.</p>
<h2>4. Responsabilidades do usuário</h2>
<p>O usuário é responsável pela veracidade dos dados informados. Resultados baseados em dados incorretos ou incompletos não refletem a situação real do contrato.</p>
<h2>5. Conteúdo</h2>
<p>Os artigos têm caráter informativo e podem ser atualizados a qualquer momento. As fontes são indicadas ao final de cada texto. O conteúdo não substitui a orientação de um profissional habilitado.</p>
<h2>6. Propriedade intelectual</h2>
<p>Marcas, textos, layout e código do site pertencem à ${razao} ou são usados com autorização, sendo vedada a reprodução sem permissão prévia.</p>
<h2>7. Alterações</h2>
<p>Estes termos podem ser alterados a qualquer momento. A versão vigente é sempre a publicada nesta página.</p>
<h2>8. Foro e contato</h2>
<p>Dúvidas podem ser enviadas pela página <a href="/contato.html">Fale Conosco</a>. Fica eleito o foro do domicílio do consumidor para dirimir eventuais controvérsias, nos termos da legislação aplicável.</p>`);

  legal('privacidade.html', 'Política de Privacidade', 'Política de Privacidade', `
<p class="meta">Última atualização: ${fmtData(LEGAL_DATE)}</p>
<p>Esta política explica como a ${razao} trata dados pessoais coletados neste site, em conformidade com a Lei Geral de Proteção de Dados (Lei 13.709/2018).</p>
<h2>1. Dados que coletamos</h2>
<ul><li><strong>Calculadora:</strong> nome, WhatsApp, e-mail (opcional), o aceite de contato e os dados do financiamento informados (tipo de veículo, banco, valores, parcelas e taxa calculada), além do resultado (acima ou dentro do parâmetro).</li>
<li><strong>Origem do acesso:</strong> parâmetros de campanha (UTMs), site de origem, página de entrada, data e hora do envio, para saber de onde veio o contato e medir nossos anúncios.</li>
<li><strong>Pop-up e newsletter:</strong> nome, telefone/WhatsApp e e-mail, conforme o formulário preenchido.</li>
<li><strong>Fale Conosco:</strong> nome, e-mail e mensagem.</li></ul>
<h2>2. Para que usamos</h2>
<p>Usamos os dados para devolver a análise solicitada, entrar em contato por WhatsApp, telefone ou e-mail quando você autoriza, permitir o atendimento por um especialista parceiro, responder mensagens e enviar novidades quando você se inscreve na newsletter.</p>
<h2>3. Com quem compartilhamos</h2>
<p>Os dados enviados nos formulários são armazenados em ferramentas de hospedagem e captura de formulários e em nosso sistema de relacionamento (CRM), e podem ser encaminhados a escritório de advocacia parceiro para que entre em contato com você. Não vendemos seus dados.</p>
<h2>4. Por quanto tempo guardamos</h2>
<p>Mantemos os dados pelo tempo necessário para as finalidades acima ou para cumprir obrigações legais.</p>
<h2>5. Seus direitos</h2>
<p>Você pode solicitar confirmação de tratamento, acesso, correção, anonimização, portabilidade e exclusão dos dados, além de revogar consentimentos, pela página <a href="/contato.html">Fale Conosco</a>.</p>
<h2>6. Armazenamento no navegador</h2>
<p>Usamos o armazenamento local do navegador para lembrar a sua escolha de tema (claro/escuro), exibir o pop-up uma vez por sessão, guardar a origem do acesso (UTMs e página de entrada) e manter uma fila temporária que reenvia automaticamente um formulário caso a conexão falhe, sem perder o seu contato.</p>
<h2>7. Contato</h2>
<p>Controladora: ${razao}. Solicitações pela página <a href="/contato.html">Fale Conosco</a>.</p>`);
}

function contato() {
  const body = `
<section class="page-head"><div class="container"><h1>Fale Conosco</h1>
<p class="lead">Tem alguma dúvida ou quer pedir a exclusão dos seus dados? Envie uma mensagem ou fale direto pelo WhatsApp.</p></div></section>
<section class="container contact-grid">
<form id="contact-form" class="card-form" novalidate>
<div class="field"><label for="c-nome">Nome</label><input id="c-nome" name="nome" autocomplete="name" required></div>
<div class="field"><label for="c-email">E-mail</label><input id="c-email" name="email" type="email" autocomplete="email" required></div>
<div class="field"><label for="c-msg">Mensagem</label><textarea id="c-msg" name="mensagem" rows="6" required></textarea></div>
<input type="text" name="bot-field" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
<button class="btn btn-primary" type="submit">Enviar mensagem</button>
<p class="form-msg" id="contact-msg" role="status" aria-live="polite"></p>
</form>
<aside class="card-form">
<h2>Prefere o WhatsApp?</h2>
<p>Fale direto com a nossa equipe.</p>
<a class="btn btn-wa" data-wa-link href="#" target="_blank" rel="noopener noreferrer">Abrir conversa no WhatsApp</a>
</aside>
</section>`;
  out('contato.html', S.page({
    meta: { title: `Fale Conosco | ${SITE}`, desc: 'Entre em contato com a ERASE Revisional por formulário ou WhatsApp.', path: '/contato.html' },
    active: '', body, forms: ['contato'],
  }));
  urls.push(['/contato.html', '0.4']);
}

function notFound() {
  out('404.html', S.page({
    meta: { title: `Página não encontrada | ${SITE}`, desc: 'Página não encontrada.', path: '/404.html', noindex: true },
    active: '', body: `<section class="page-head"><div class="container"><h1>Página não encontrada</h1><p class="lead">O endereço que você acessou não existe ou foi movido.</p><a class="btn btn-primary" href="/">Voltar ao início</a></div></section>`,
  }));
}

// ---------------------------------------------------------------- SEO
function seo() {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([p, prio, d]) => `  <url><loc>${absUrl(p)}</loc><lastmod>${d || LASTMOD}</lastmod><priority>${prio}</priority></url>`).join('\n')}
</urlset>
`;
  out('sitemap.xml', xml);
  out('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${absUrl('/sitemap.xml')}\n`);
}

home(); lists(); artigos(); calculadora(); legais(); contato(); notFound(); seo();
console.log(`OK — ${articles.length} artigos, ${urls.length} URLs no sitemap.`);
