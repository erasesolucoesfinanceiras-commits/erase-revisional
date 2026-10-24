#!/usr/bin/env node
// Gera TODO o site estático a partir de data/config.json + data/articles.json.
//   node scripts/build.js
// Atualiza: index, artigos, categorias, calculadora, páginas legais, artigos
// individuais (noticias/), sitemap.xml e robots.txt.
const fs = require('fs');
const path = require('path');
const S = require('./site');
const { config: C, esc, fmtPct, fmtData, catNome, catUrl, artUrl, absUrl, coverUrl, coverImg, ICON } = S;

// Páginas .html: links internos saem sem a extensão (href="/calculadora.html" -> "/calculadora").
const limparLinks = (html) => html.replace(/(href|action)="(\/[^"#?]*?)\.html([#?][^"]*)?"/g, '$1="$2$3"');
const out = (rel, content) => {
  const f = path.join(S.ROOT, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, rel.endsWith('.html') ? limparLinks(content) : content);
};

const articles = S.loadArticles();
const notas = S.loadNotas();
const SITE = C.siteNome;
const hasBcb = fs.existsSync(path.join(S.ROOT, 'assets', 'data', 'bcb-veiculos.json')); // série histórica do Banco Central presente?
const urls = []; // para o sitemap
const LEGAL_DATE = '2026-10-21'; // data de vigência dos textos legais (altere ao revisá-los)
// Datas do sitemap: SÓ datas reais (publicação ou revisão de verdade). Sem data real, sem <lastmod>.
const maiorData = (...ds) => ds.flat().filter(Boolean).sort().pop();
let BCB_ATUALIZADO = '', BCB_CONFERIDO = ''; // datas REAIS (scripts/update-bcb.js): última alteração da série e última consulta ao BCB que funcionou
try { const b = S.readJSON('assets/data/bcb-veiculos.json'); BCB_ATUALIZADO = b.atualizado_em || ''; BCB_CONFERIDO = b.conferido_em || ''; } catch (e) { /* sem série */ }

// ---------------------------------------------------------------- HOME
const nl = `<form class="newsletter" id="newsletter-form" novalidate>
<label class="sr-only" for="nl-email">Seu e-mail</label>
<input id="nl-email" name="email" type="email" maxlength="120" placeholder="Seu melhor e-mail" autocomplete="email" required>
<input type="text" name="bot-field" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
<button class="btn btn-dark" type="submit">Receber novidades</button>
</form>
<p class="fine newsletter-note">Ao se inscrever, você concorda em receber e-mails da ERASE e pode cancelar quando quiser. <a href="/privacidade.html">Política de Privacidade</a></p>
<p class="form-msg" id="newsletter-msg" role="status" aria-live="polite"></p>
`;
// ---------------------------------------------------------------- RADAR (notas rápidas)
const notaHtml = (n) => `<article class="nota" id="${esc(n.id)}">
<div class="nota-meta"><a class="tag" href="${catUrl(n.categoria)}">${esc(catNome(n.categoria))}</a><time datetime="${n.data}">${fmtData(n.data)}</time></div>
<h3>${esc(n.titulo)}</h3>
<p>${esc(n.texto)}</p>
${n.foto ? `<p class="nota-src">Foto: <a href="${esc(n.foto.autorUrl)}" target="_blank" rel="noopener noreferrer nofollow">${esc(n.foto.autor)}</a> (<a href="${esc(n.foto.pagina)}" target="_blank" rel="noopener noreferrer nofollow">${esc(n.foto.fonte)}</a>)</p>\n` : ''}<p class="nota-src">Fontes: ${n.fontes.map((f) => `<a href="${esc(f.url)}" target="_blank" rel="noopener noreferrer nofollow">${esc(f.nome)}</a>`).join(' · ')}</p>
</article>`;
function radarHome() {
  if (!notas.length) return '';
  return `<section class="container radar-home" aria-label="Radar">
<div class="section-head"><h2>Radar</h2><a href="/radar.html">Ver todas as notas</a></div>
<div class="nota-grid">${notas.slice(0, 4).map(notaHtml).join('\n')}</div>
</section>`;
}
function radar() {
  const body = `
<section class="page-head"><div class="container">
<h1>Radar</h1><p class="lead">Notas rápidas sobre crédito e financiamento, publicadas só quando há novidade. Toda nota cita as fontes.</p>
</div></section>
<section class="container home-grid">
<div class="nota-list">${notas.length ? notas.map(notaHtml).join('\n') : '<p>Em breve, novas notas.</p>'}</div>
${S.sidebar()}
</section>
${S.ctaBanner()}`;
  out('radar.html', S.page({
    meta: { title: `Radar: notas rápidas sobre crédito | ${SITE}`, desc: 'Notas rápidas e atualizadas sobre financiamento de veículos, crédito, juros e regras do sistema financeiro, sempre com a fonte citada.', path: '/radar.html' },
    active: 'radar', body,
  }));
  urls.push(['/radar.html', '0.7', notas.length ? notas[0].data : undefined]);
}

function home() {
  const { datados, guias } = S.ordenarConteudo(articles, notas);
  const destaques = datados.slice(0, 5); // carrossel: os 5 mais recentes por data real (artigos e Radar; guias fora)
  const resto = [...datados.slice(0, 12), ...guias.slice(0, 6)];
  const INICIAL = 4;
  const list = resto.map((it, i) => S.cardDe(it.tipo ? it : { ...it, a: it }, i >= INICIAL)).join('\n');
  const ultima = S.ultimaPublicacao(articles, notas);
  const guiasCapa = (() => {
    const g = (C.guiasDaCapa || []).map((sl) => articles.find((a) => a.slug === sl)).filter(Boolean);
    return g.length ? `<section class="container guides-home" aria-labelledby="gh-t">
<div class="section-head"><h2 id="gh-t">Guias para entender o seu contrato</h2></div>
<ul class="guide-links">${g.map((a) => `<li><a href="${artUrl(a)}"><strong>${esc(a.titulo)}</strong><span>${esc(a.resumo)}</span></a></li>`).join('\n')}</ul>
</section>` : '';
  })();
  const faixa = `<div class="pub-strip" role="note"><div class="container">Última publicação: <time datetime="${ultima}">${fmtData(ultima)}</time>${BCB_CONFERIDO ? ` · <span${BCB_ATUALIZADO ? ` title="Última alteração da série do Banco Central: ${fmtData(BCB_ATUALIZADO)}"` : ''}>Taxas conferidas com o Banco Central em <time datetime="${BCB_CONFERIDO}">${fmtData(BCB_CONFERIDO)}</time>${BCB_ATUALIZADO ? ` <small>(série alterada em <time datetime="${BCB_ATUALIZADO}">${fmtData(BCB_ATUALIZADO)}</time>)</small>` : ''}</span>` : ''}</div></div>`;
  const body = `
<div class="free-strip" role="note"><div class="container">${S.FREE_TXT} <span>Descubra se a taxa do seu contrato está acima da média</span></div></div>
<section class="hero">
<div class="container hero-inner">
<span class="badge">Simulação gratuita</span>
<h1>Seu financiamento de veículo pode estar cobrando juros acima da média</h1>
<p class="lead">Notícias e guias sobre financiamento de veículos, revisão de juros, busca e apreensão e seguro prestamista, com uma calculadora gratuita que resolve a taxa de juros real do seu contrato e compara com a referência do Banco Central.</p>
<a class="btn btn-primary btn-lg btn-hero" href="/calculadora.html">${ICON.calc}Calcular minha taxa agora<span aria-hidden="true">→</span></a>
</div>
</section>

${faixa}
${S.carrossel(destaques)}
${S.exploreTopicos()}
${guiasCapa}

<section class="container home-grid">
<div>
<div class="section-head"><h2>Últimos artigos</h2><a href="/artigos.html">Ver todos</a></div>
<div class="row-list" id="lista-artigos">
<!-- ARTIGOS:INICIO -->
${list}
<!-- ARTIGOS:FIM -->
</div>
${resto.length > INICIAL ? '<button class="btn btn-outline btn-block more-btn" id="ver-mais" type="button">Veja mais</button>' : ''}
</div>
${S.sidebar()}
</section>
${S.escolhaDaEquipe()}
${radarHome()}
${S.ctaBanner()}
${S.trustBadges()}
<section class="container nl-section" aria-label="Newsletter">
<div class="nl-card">
${ICON.mail}<h2>Receber novidades</h2>
${nl}
</div>
</section>`;
  out('index.html', S.page({
    meta: {
      title: `Juros de financiamento de veículos | ${SITE}`,
      desc: 'Notícias sobre financiamento de veículos e uma calculadora gratuita para descobrir a taxa de juros real do seu contrato e comparar com a média do Banco Central.',
      path: '/',
      jsonld: { '@context': 'https://schema.org', '@graph': [
        { '@type': 'Organization', '@id': absUrl('/') + '#organizacao', name: C.empresa.razaoSocial, url: absUrl('/'), logo: absUrl('/assets/img/apple-touch-icon.png'), sameAs: Object.values(C.social).filter(Boolean) },
        { '@type': 'WebSite', '@id': absUrl('/') + '#site', name: SITE, url: absUrl('/'), inLanguage: 'pt-BR', publisher: { '@id': absUrl('/') + '#organizacao' } },
      ] },
    },
    active: 'home', body, scripts: ['/assets/js/carrossel.js'],
  }));
  urls.push(['/', '1.0', maiorData(S.ultimaPublicacao(articles, notas), articles.map((a) => a.atualizado))]);
}

// ---------------------------------------------------------------- LISTAS
function listPage({ file, title, desc, h1, intro, items, notasDaLista = [], active, p, cat, vazia = false }) {
  // itens por data real (artigos e, nas categorias, notas do Radar); guias depois, sem data; os 8 primeiros aparecem, o resto em "Ver mais"
  const o = S.ordenarConteudo(items, notasDaLista), todos = [...o.datados, ...o.guias], INICIAL = 8;
  const cards = todos.map((it, i) => S.cardDe(it.tipo ? it : { ...it, a: it }, i >= INICIAL)).join('\n');
  const body = `
<section class="page-head"><div class="container">
<h1>${esc(h1)}</h1>${intro ? `<p class="lead">${esc(intro)}</p>` : ''}
</div></section>
<section class="container home-grid">
<div>
<div class="row-list" id="lista-artigos">${todos.length ? cards : '<p>Em breve, novos artigos nesta categoria.</p>'}</div>
${todos.length > INICIAL ? '<button class="btn btn-outline btn-block more-btn" id="ver-mais" type="button">Ver mais</button>' : ''}
</div>
${S.sidebar(cat)}
</section>
${S.ctaBanner(cat)}`;
  out(file, S.page({ meta: { title, desc, path: p, noindex: vazia }, active, body }));
  if (!vazia) urls.push([p, '0.7', maiorData(items.map((a) => a.data), items.map((a) => a.atualizado), notasDaLista.map((n) => n.data))]);
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
      items: articles.filter((a) => a.categoria === slug), notasDaLista: notas.filter((n) => n.categoria === slug), cat: slug,
      vazia: !S.catsComItens().includes(slug),
    });
  }
}

// ---------------------------------------------------------------- ARTIGOS
function injectCTA(corpo, cat) {
  const cta = S.usaContato(cat)
    ? `<aside class="inline-cta"><strong>Quer entender melhor o seu caso?</strong><span>ANÁLISE TOTALMENTE GRATUITA pela ERASE.</span><a class="btn btn-primary btn-sm" href="/contato.html">Falar com a ERASE</a></aside>`
    : `<aside class="inline-cta"><strong>Quanto você paga de juros?</strong><span>Descubra a taxa real do seu financiamento em pouco mais de um minuto. ANÁLISE TOTALMENTE GRATUITA.</span><a class="btn btn-primary btn-sm" href="/calculadora.html">Calcular minha taxa</a></aside>`;
  const parts = corpo.split('</p>');
  if (parts.length < 3) return corpo + cta;
  const at = Math.ceil((parts.length - 1) / 2);
  return parts.slice(0, at).join('</p>') + '</p>' + cta + parts.slice(at).join('</p>');
}

function artigos() {
  for (const a of articles) {
    const fs_ = a.fontes && a.fontes.length ? a.fontes : a.fonte && a.fonte.nome ? [a.fonte] : [];
    const fonteHtml = fs_.length
      ? `<p class="source">${fs_.length > 1 ? 'Fontes' : 'Fonte'}: ${fs_.map((f) => f.url ? `<a href="${esc(f.url)}" target="_blank" rel="noopener noreferrer nofollow">${esc(f.nome)}</a>` : esc(f.nome)).join(' · ')}</p>`
      : '';
    const jsonld = {
      '@context': 'https://schema.org',
      '@type': 'NewsArticle',
      headline: a.titulo,
      description: a.resumo,
      image: [absUrl(S.ogArtigo(a))], // foto real do artigo (JPG leve) ou, sem foto, a imagem da categoria
      datePublished: a.data,
      ...(a.atualizado ? { dateModified: a.atualizado } : {}), // só existe se houve revisão real
      mainEntityOfPage: { '@type': 'WebPage', '@id': absUrl(artUrl(a)) },
      articleSection: catNome(a.categoria),
      inLanguage: 'pt-BR',
      author: { '@type': 'Organization', name: 'Equipe ERASE' },
      publisher: {
        '@type': 'Organization', name: C.empresa.razaoSocial,
        logo: { '@type': 'ImageObject', url: absUrl('/assets/img/apple-touch-icon.png') },
      },
    };
    const body = `
<div class="container article-grid">
<article class="article">
<nav class="crumbs" aria-label="Você está em"><a href="/">Início</a> / <a href="${catUrl(a.categoria)}">${esc(catNome(a.categoria))}</a></nav>
<a class="tag" href="${catUrl(a.categoria)}">${esc(catNome(a.categoria))}</a>
<h1>${esc(a.titulo)}</h1>
<p class="lead">${esc(a.resumo)}</p>
<p class="meta">${S.selo(S.seloTxt(a), S.ehGuia(a) ? 'selo-guia' : 'selo-artigo')} Por Equipe ERASE${S.ehGuia(a) ? (a.atualizado ? ` · <time datetime="${a.atualizado}">Atualizado em ${fmtData(a.atualizado)}</time>` : '') : ` · <time datetime="${a.data}">${fmtData(a.data)}</time>`}</p>
<figure class="article-fig">${coverImg(a, { width: 860, height: 430, sizes: '(max-width: 860px) 100vw, 860px', eager: true, cls: 'article-cover', alt: a.titulo })}${a.foto ? `<figcaption>Foto: <a href="${esc(a.foto.autorUrl)}" target="_blank" rel="noopener noreferrer">${esc(a.foto.autor)}</a> / <a href="${esc(a.foto.pagina)}" target="_blank" rel="noopener noreferrer">${esc(a.foto.fonte || 'Pixabay')}</a></figcaption>` : ''}</figure>
<div class="article-body">
${injectCTA(a.corpo, a.categoria)}
</div>
${fonteHtml}
<p class="disclaimer">Conteúdo informativo. Não constitui parecer jurídico ou financeiro nem promessa de resultado.</p>
${S.relacionados(a)}
</article>
${S.sidebar(a.categoria)}
</div>
${S.ctaBanner(a.categoria)}`;
    out(`noticias/${a.slug}.html`, S.page({
      meta: {
        title: ((t) => (t.length <= 60 - SITE.length - 3 ? `${t} | ${SITE}` : t))(S.tituloSeo(a.titulo)), desc: S.descSeo(a.resumo), path: artUrl(a), type: 'article',
        image: S.ogArtigo(a), jsonld,
      },
      active: 'artigos', body,
    }));
    urls.push([artUrl(a), '0.6', a.atualizado || a.data]);
  }
}

// ---------------------------------------------------------------- CALCULADORA
function calculadora() {
  const bc = C.bc, L = C.limites;
  const faq = [
    ['O que a calculadora faz, exatamente?',
      'A partir do valor financiado, do valor da parcela e do prazo, ela resolve matematicamente qual taxa de juros mensal está embutida no seu contrato — pelo sistema Price — e compara esse número com uma faixa de referência de mercado para o seu tipo de veículo. O resultado é um cálculo comparativo, não uma análise do contrato assinado.'],
    ['O resultado é garantia de valor a receber?',
      'Não. Nenhum valor exibido aqui é devido a você por qualquer instituição, e a diferença mostrada não é devida a você. Ela é apenas a economia estimada em relação à faixa de referência, dados os números que você informou. Para saber o que isso significa no seu caso concreto é preciso ler o contrato assinado: a análise do contrato é feita gratuitamente pela ERASE. Em caso de ação judicial, a decisão final é do Judiciário.'],
    ['Quanto o mercado costuma cobrar num financiamento de veículo?',
      `A taxa média divulgada pelo Banco Central para crédito livre a pessoas físicas na aquisição de veículos foi de ${fmtPct(bc.taxaMedia)}% ao mês na última divulgação (${bc.mesReferencia}). Motos costumam ser mais caras e financiamentos agrícolas, mais baratos, por conta de linhas subsidiadas como o Pronaf.`],
    ['A partir de que taxa a calculadora sinaliza o contrato?',
      (hasBcb
        ? `Para carros, comparamos a taxa calculada com a taxa média do Banco Central no mês estimado da assinatura — hoje menos as parcelas já pagas (série histórica); se o mês não estiver disponível, usamos ${fmtPct(L.carro)}% ao mês. Para motos e agrícolas usamos referências fixas de ${fmtPct(L.moto)}% e ${fmtPct(L.agricola)}% ao mês. `
        : `A partir de ${fmtPct(L.carro)}% ao mês para carros, ${fmtPct(L.moto)}% para motos e ${fmtPct(L.agricola)}% para agrícolas. `) + `Ser sinalizado aqui não quer dizer que o contrato tem problema — quer dizer que ele está acima do nosso parâmetro de comparação, que é conservador de propósito.`],
    ['Uma taxa acima da faixa é ilegal?',
      'Não por si só. A jurisprudência do STJ é que juros remuneratórios não têm limite fixo e só podem ser considerados abusivos quando comprovadamente destoam da taxa média de mercado da época da contratação — e isso é avaliado caso a caso. Sua taxa também depende do seu perfil de crédito, da garantia e do que foi negociado. Ficar acima da faixa é um indício que vale investigar, não uma conclusão: a análise do contrato é feita gratuitamente pela ERASE e, em caso de ação judicial, a decisão final é do Judiciário.'],
    ['A ERASE é um banco ou um escritório de advocacia?',
      'Nem um nem outro. A ERASE Revisional é uma ferramenta de simulação operada pela ERASE Soluções Financeiras, que não é instituição financeira, correspondente bancário nem escritório de advocacia. A análise do contrato é feita pela própria ERASE Soluções Financeiras e é 100% gratuita.'],
    ['A análise do contrato é gratuita?',
      'Sim. A análise do contrato é 100% gratuita: você não paga nada por ela. Ela é feita pela ERASE, a partir do contrato que você enviar, e pode verificar itens que a calculadora não enxerga, como seguro prestamista, tarifas e outras cobranças dentro da parcela. Ela não indica valores a receber e não garante resultado.'],
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
  // Opções curtas (≤ 9 caracteres) ficam lado a lado também no celular; as longas empilham.
  const choices = (name, legend, opts, { req = false, padrao = '', opt = true } = {}) => {
    const curtas = Math.max(...opts.map((o) => o.length)) <= 9;
    return `<fieldset class="field choices${curtas ? ' short' : ''}${curtas && opts.length === 2 ? ' two' : ''}" data-group="${name}"><legend>${legend}${req ? ' <span class="req">*</span>' : opt ? ' <span class="opt">(opcional)</span>' : ''}</legend><div class="choice-grid">${opts.map((o) => `<label class="choice"><input type="radio" name="${name}" value="${esc(o)}"${o === padrao ? ' checked' : ''}><span>${esc(o)}</span></label>`).join('')}</div><small class="err" data-err="${name}">Escolha uma opção</small></fieldset>`;
  };
  const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const parcelasOpts = [12, 18, 24, 30, 36, 42, 48, 54, 60, 66, 72, 84, 96]
    .map((n) => `<option value="${n}">${n} parcelas</option>`).join('');

  const body = `
<section class="calc-hero"><div class="container">
<span class="eyebrow">Simulação gratuita · Carros, motos e agrícolas</span>
<h1><span class="grad">Qual é a taxa real do seu financiamento?</span></h1>
<p class="lead">Em pouco mais de um minuto, a calculadora resolve a taxa de juros mensal embutida no seu contrato — a partir da parcela, do valor financiado e do prazo — e mostra como ela se compara à média publicada pelo Banco Central, hoje em torno de <strong>${fmtPct(bc.taxaMedia)}% ao mês</strong> para carros, segundo a última divulgação do Banco Central (${esc(bc.mesReferencia)}).</p>
<p class="small-note">${hasBcb ? 'Para carros, a comparação usa a média do Banco Central do mês estimado da assinatura (hoje menos as parcelas já pagas). ' : ''}É um cálculo comparativo, gratuito e sem compromisso. Não é análise jurídica do contrato e não indica valores a receber.</p>
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
<div class="field"><label for="valor_financiado">Valor financiado <span class="need">necessário para o resultado</span></label>
<small class="hint" id="valor_financiado-hint">Valor do veículo menos a entrada</small>
<div class="money"><span>R$</span><input id="valor_financiado" name="valor_financiado" inputmode="decimal" maxlength="14" autocomplete="off" placeholder="0,00" aria-describedby="valor_financiado-hint"></div><small class="err" data-err="valor_financiado">Informe o valor financiado</small></div>
<div class="field"><label for="parcela">Valor atual da parcela <span class="need">necessário para o resultado</span></label>
<div class="money"><span>R$</span><input id="parcela" name="parcela" inputmode="decimal" maxlength="14" autocomplete="off" placeholder="0,00"></div><small class="err" data-err="parcela">Informe a parcela atual</small></div>
<div class="field-row">
<div class="field"><label for="n_parcelas">Quantas parcelas financiou? <span class="need">necessário para o resultado</span></label>
<select id="n_parcelas" name="n_parcelas"><option value="">Selecione</option>${parcelasOpts}</select><small class="err" data-err="n_parcelas">Selecione o total de parcelas</small></div>
<div class="field" id="pagas-field"><label for="pagas">Quantas parcelas já pagou? <span class="opt">(opcional)</span></label>
<small class="hint">Usamos para estimar a data do contrato</small>
<div class="money suffix"><input id="pagas" name="pagas" type="number" inputmode="numeric" min="0" max="999" step="1" placeholder="0"><span>meses</span></div><small class="err" data-err="pagas">Informe quantas parcelas já pagou</small></div>
</div>
<div class="form-section"><h3>Sobre o seu financiamento</h3>
${choices('primeira_no_ato', 'A 1ª parcela foi paga no ato da assinatura?', ['Não', 'Sim'], { padrao: 'Não', opt: false })}
${choices('situacao', 'Como está seu financiamento hoje?', ['Em dia', 'Atrasado', 'Busca e apreensão', 'Já quitei'], { req: true })}
</div>

<div class="contact-block"><h3>Para ver o resultado, informe seu contato</h3>
<input type="text" name="bot-field" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
<div class="field"><label for="lead-nome">Seu nome <span class="req">*</span></label><input id="lead-nome" name="nome" maxlength="80" autocomplete="name" placeholder="Ex.: Maria"><small class="err" data-err="nome">Informe seu nome</small></div>
<div class="field"><label for="lead-wa">WhatsApp <span class="req">*</span></label><input id="lead-wa" name="whatsapp" maxlength="15" inputmode="tel" autocomplete="tel" placeholder="(81) 99999-9999"><small class="err" data-err="whatsapp">WhatsApp inválido — use DDD + 9 dígitos</small></div>
<div class="field check"><label><input type="checkbox" id="lgpd" name="lgpd"><span>Autorizo a ERASE Soluções Financeiras a entrar em contato comigo por WhatsApp ou telefone sobre esta simulação, conforme a <a href="/privacidade.html" target="_blank" rel="noopener">Política de Privacidade</a>. <span class="req">*</span></span></label><small class="err" data-err="lgpd">É necessário autorizar o contato para ver o resultado</small></div></div>
<p class="calc-warn" id="calc-warn" role="status" hidden>Para ver sua taxa na hora, preencha valor financiado, parcela e número de parcelas</p>
${S.freeBadge("block")}
<button class="btn btn-primary btn-lg btn-block" type="submit" id="calc-btn">Calcular minha taxa — grátis</button>
<p class="form-msg" id="calc-msg" role="alert" aria-live="polite"></p>
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
<div class="notice"><strong>Esta página é uma ferramenta de simulação.</strong> O resultado é um <strong>cálculo estimado</strong> feito sobre os números que você digitou e comparado a médias de mercado. Não é análise do seu contrato, não é parecer jurídico ou financeiro, não afirma que houve cobrança indevida e <strong>não indica valores a receber</strong>. A análise do contrato é feita gratuitamente pela ERASE. Em caso de ação judicial, a decisão final é do Judiciário.</div>
</section>

<section class="container prose-block">
<h2>Por que duas pessoas pagam taxas diferentes pelo mesmo carro</h2>
<p>A taxa de um financiamento de veículo não é tabelada. Ela varia com o banco, o perfil de crédito, o valor da entrada, o prazo e a negociação feita na hora. Duas pessoas comprando o mesmo carro no mesmo mês podem sair com taxas bem diferentes — e quem fecha rápido, na concessionária, sem comparar, costuma ficar do lado mais caro dessa distribuição.</p>
<p>O problema é que quase ninguém sabe qual taxa está pagando. O contrato mostra a parcela, não o juro efetivo. Esta calculadora reverte essa conta: com parcela, prazo e valor financiado, ela devolve a taxa mensal que produz exatamente esses números e mostra onde ela cai em relação à faixa de referência do seu tipo de veículo.</p>
<p>Saber isso é útil por si só — para renegociar, para comparar uma portabilidade ou simplesmente para entender o que você assinou. E se a diferença for grande, é o tipo de coisa que vale levar para a análise gratuita do contrato, feita pela ERASE, que pode ler o contrato e dizer se há algo a questionar.</p>
</section>

<section class="container prose-block">
<h2>O que esta calculadora faz — e o que não faz</h2>
<div class="two-col">
<div class="card-list yes"><h3>Faz</h3><ul>
<li>Calcula a taxa mensal e anual efetiva embutida no seu contrato.</li>
<li>Compara com a faixa de referência do seu tipo de veículo, baseada em dados do Banco Central.</li>
<li>Estima a economia nas parcelas restantes caso o contrato estivesse na faixa de referência.</li>
<li>Oferece a análise do contrato, feita pela ERASE e 100% gratuita: você não paga nada por ela.</li>
<li>Se você quiser, um especialista da ERASE entra em contato com você.</li></ul></div>
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
<li><span>1</span><div><h3>Informe os números do contrato</h3><p>Tipo de veículo, como está o financiamento e, se quiser, valor financiado (valor do veículo menos a entrada), parcela, prazo e quantas parcelas já pagou.</p></div></li>
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
      title: `Calculadora de juros de financiamento | ${SITE}`,
      desc: 'Descubra a taxa de juros mensal embutida no seu financiamento de carro, moto ou máquina agrícola e compare com a média do Banco Central. Simulação gratuita.',
      path: '/calculadora.html', jsonld: faqLd,
    },
    active: 'calc', body, scripts: ['/assets/js/calc-core.js', '/assets/js/calculator.js'],
  }));
  urls.push(['/calculadora.html', '0.9', BCB_ATUALIZADO || undefined]); // lastmod = última ALTERAÇÃO real da série, não a conferência
}

// ---------------------------------------------------------------- LEGAIS / CONTATO
function legal(file, title, h1, html, desc) {
  out(file, S.page({
    meta: { title: `${title} | ${SITE}`, desc: desc || `${title} da ERASE Revisional.`, path: '/' + file },
    active: '', body: `<article class="container article legal-doc"><h1>${h1}</h1>${html}</article>`,
  }));
  urls.push(['/' + file, '0.3', LEGAL_DATE]);
}

function legais() {
  const razao = esc(C.empresa.razaoSocial);
  legal('termos.html', 'Termos de uso', 'Termos de uso', `
<p class="meta">Última atualização: ${fmtData(LEGAL_DATE)}</p>
<h2>1. Sobre o serviço</h2>
<p>O site ERASE Revisional é operado pela ${razao} e reúne conteúdo informativo sobre financiamento de veículos e uma ferramenta de simulação que estima a taxa de juros mensal embutida em um contrato a partir de dados informados pelo usuário.</p>
<p><strong>Como funciona a análise gratuita.</strong> (1) Você responde às perguntas do chat de análise ou usa a calculadora e informa seus dados de contato; (2) a ${razao} entra em contato com você pelo WhatsApp; (3) você envia o contrato; (4) a ${razao} faz a análise gratuita do contrato. O retorno ocorre em até 1 dia útil após o envio dos dados. A análise não tem custo e não garante resultado.</p>
<h2>2. Natureza da simulação</h2>
<p>O resultado da calculadora é uma estimativa baseada em médias de mercado e nos dados informados pelo usuário. Não constitui parecer jurídico, financeiro ou consultoria, não indica valores a receber, não afirma a existência de cobrança indevida e não representa promessa ou garantia de resultado. A economia exibida é apenas uma comparação com uma faixa de referência e não é devida ao usuário por qualquer instituição.</p>
<h2>3. O que não somos</h2>
<p>A ${razao} não é instituição financeira, correspondente bancário nem escritório de advocacia. A análise do contrato é realizada pela ${razao}, é gratuita, não indica valores a receber e não garante resultado.</p>
<h2>4. Responsabilidades do usuário</h2>
<p>O usuário é responsável pela veracidade dos dados informados. Resultados baseados em dados incorretos ou incompletos não refletem a situação real do contrato.</p>
<h2>5. Conteúdo</h2>
<p>Os artigos têm caráter informativo e podem ser atualizados a qualquer momento. As fontes são indicadas ao final de cada texto. Parte do conteúdo é produzida com apoio de inteligência artificial e passa por revisão automática, como explicado em <a href="/como-produzimos.html">Como produzimos nosso conteúdo</a>. O conteúdo não substitui a orientação de um profissional habilitado.</p>
<h2>6. Links, anúncios e serviços de terceiros</h2>
<p>O site traz links para fontes externas (órgãos oficiais e veículos de imprensa) e usa serviços de terceiros, como Google Analytics${S.pixelOk ? ', Meta Pixel' : ''} e Cloudflare (hospedagem e Turnstile, que protege os formulários contra robôs). Não controlamos esses sites e serviços e não respondemos pelo conteúdo ou pelas políticas deles. Poderemos exibir anúncios de terceiros, como os do Google AdSense; nesse caso, os anúncios serão identificados, não influenciam o conteúdo editorial e a presença de um anúncio não é recomendação nem indicação de que a ${razao} o endossa.</p>
<h2>7. Cookies e privacidade</h2>
<p>O uso de cookies e o tratamento de dados pessoais estão descritos na <a href="/privacidade.html">Política de Privacidade</a>. Usamos cookies de estatística e de medição de anúncios, e a Política explica como recusá-los.</p>
<h2>8. Propriedade intelectual</h2>
<p>Marcas, textos, layout e código do site pertencem à ${razao} ou são usados com autorização, sendo vedada a reprodução sem permissão prévia.</p>
<h2>9. Alterações</h2>
<p>Estes termos podem ser alterados a qualquer momento. A versão vigente é sempre a publicada nesta página.</p>
<h2>10. Foro e contato</h2>
<p>Dúvidas podem ser enviadas para <a href="mailto:atendimento@eraseconsulta.com.br">atendimento@eraseconsulta.com.br</a> ou pela página <a href="/contato.html">Fale Conosco</a>. Fica eleito o foro do domicílio do consumidor para dirimir eventuais controvérsias, nos termos da legislação aplicável.</p>`, 'Termos de uso do ERASE Revisional: natureza informativa da calculadora e do conteúdo, responsabilidades, links e anúncios de terceiros, cookies e foro.');

  legal('privacidade.html', 'Política de Privacidade', 'Política de Privacidade', `
<p class="meta">Última atualização: ${fmtData(LEGAL_DATE)}</p>
<p>Esta política explica como a ${razao} trata dados pessoais coletados neste site, em conformidade com a Lei Geral de Proteção de Dados (Lei 13.709/2018).</p>
<h2>1. Dados que coletamos</h2>
<ul><li><strong>Calculadora:</strong> nome, WhatsApp, o aceite de contato e os dados do financiamento informados (tipo de veículo, valor financiado, parcela, prazo, parcelas pagas, mês e ano da assinatura, situação das parcelas e se há busca e apreensão), além da taxa calculada e do resultado (acima ou dentro do parâmetro).</li>
<li><strong>Chat de análise gratuita (/analise):</strong> primeiro nome, WhatsApp e as suas respostas às perguntas (tipo de veículo, situação das parcelas, se você tem o contrato e se já fez alguma ação revisional), além da classificação que fazemos a partir delas (por exemplo, se o caso parece se enquadrar e se é urgente) e o aceite ao continuar.</li>
<li><strong>Origem do acesso:</strong> parâmetros de campanha (UTMs), site de origem, página de entrada, data e hora do envio, para saber de onde veio o contato e medir nossos anúncios.</li>
<li><strong>Pop-up:</strong> nome, telefone/WhatsApp, a situação do financiamento (em dia, atrasado ou busca e apreensão) e o aceite de contato. <strong>Newsletter:</strong> e-mail.</li>
<li><strong>Fale Conosco:</strong> nome, e-mail e mensagem.</li></ul>
<h2>2. Para que usamos</h2>
<p>Usamos os dados para devolver a análise solicitada, avaliar o seu caso e priorizar o atendimento, entrar em contato por WhatsApp, telefone ou e-mail quando você autoriza, permitir o atendimento por um especialista da ERASE, responder mensagens e enviar novidades quando você se inscreve na newsletter.</p>
<p><strong>Em que nos apoiamos para usar os seus dados (base legal).</strong> Usamos os seus dados com o seu <strong>consentimento</strong> quando você envia o chat /analise ou outro formulário. Se você virar cliente, passamos a usar os dados também para <strong>executar o contrato</strong>. Para medir o desempenho do site e dos nossos anúncios (Google Analytics e Meta Pixel), nos apoiamos no nosso <strong>legítimo interesse</strong>.</p>
<h2>3. Com quem compartilhamos</h2>
<p>Os dados enviados nos formulários e no chat /analise são recebidos e armazenados em nosso sistema de relacionamento (CRM) e são usados pela equipe da ${razao} para entrar em contato com você. Ao abrir a conversa no WhatsApp, as respostas seguem na mensagem que você mesmo envia. Não vendemos seus dados. Usamos prestadores que tratam dados em nosso nome: a Cloudflare (hospedagem do site e verificação anti-robô nos formulários), o Google (Google Analytics, conforme a seção 6)${S.pixelOk ? ' e a Meta (Meta Pixel e API de Conversões, conforme a seção 6)' : ''}. Alguns desses fornecedores (Cloudflare, Supabase, Meta e Google) podem armazenar ou processar os dados em servidores fora do Brasil.</p>
<h2>4. Por quanto tempo guardamos</h2>
<ul><li><strong>Quem não virou cliente:</strong> guardamos os dados por até 12 meses após o último contato. Depois disso, eles são apagados ou anonimizados.</li>
<li><strong>Clientes:</strong> guardamos os dados por até 5 anos após o fim do contrato, para cumprir obrigações legais e fiscais e para a nossa defesa em eventuais processos.</li></ul>
<h2>5. Seus direitos</h2>
<p>Você pode solicitar confirmação de tratamento, acesso, correção, anonimização, portabilidade e exclusão dos dados, informações sobre com quem compartilhamos e a revogação de consentimentos, pelo e-mail <a href="mailto:atendimento@eraseconsulta.com.br">atendimento@eraseconsulta.com.br</a> ou pela página <a href="/contato.html">Fale Conosco</a>. Como agente de tratamento de pequeno porte, não indicamos encarregado (DPO); esse e-mail é o canal para você exercer os seus direitos. Também pode apresentar reclamação à Autoridade Nacional de Proteção de Dados (ANPD).</p>
<h2 id="cookies">6. Cookies, Google Analytics e anúncios</h2>
<p><strong>Armazenamento essencial do navegador.</strong> Usamos o armazenamento local para lembrar a sua escolha de tema (claro/escuro), exibir o pop-up uma vez por sessão e guardar a origem do acesso (UTMs e página de entrada). Eles não servem para publicidade.</p>
<p><strong>Estatísticas (Google Analytics).</strong> Usamos o Google Analytics 4, serviço do Google, que grava cookies e identificadores para contar visitas, páginas vistas, tempo no site, tipo de aparelho e origem do acesso, e para medir o resultado dos formulários (sem enviar seu nome, telefone ou e-mail). Ele é carregado quando você abre qualquer página do site, com base no nosso legítimo interesse de medir o desempenho do site.</p>
<p><strong>Proteção contra robôs.</strong> Usamos o Cloudflare Turnstile para proteger os nossos formulários contra robôs. Para isso, ele pode coletar dados técnicos do seu navegador (como o endereço IP e o tipo de navegador). Saiba mais no <a href="https://www.cloudflare.com/turnstile-privacy-policy/" target="_blank" rel="noopener">Turnstile Privacy Addendum da Cloudflare</a>.</p>
${S.pixelOk ? '<p><strong>Anúncios da Meta (Facebook e Instagram).</strong> Usamos o Meta Pixel para medir se os nossos anúncios levaram a um contato (por exemplo, conclusão do formulário /analise). A Meta recebe o identificador do navegador e o evento ocorrido. Além do Pixel, os seus dados de contato (telefone e e-mail) podem ser enviados à Meta de forma criptografada (hash) pela API de Conversões, para medir os anúncios. Ele é carregado quando você abre qualquer página do site, com base no nosso legítimo interesse de medir o desempenho dos anúncios.</p>' : ''}
<p><strong>Anúncios do Google (AdSense) — futuro.</strong> Poderemos exibir anúncios do Google AdSense. Quando isso acontecer, o Google e seus parceiros poderão usar cookies para mostrar anúncios com base nas suas visitas a este e a outros sites, e só os ativaremos com o seu consentimento. Você poderá desativar a personalização de anúncios em <a href="https://adssettings.google.com" target="_blank" rel="noopener noreferrer">adssettings.google.com</a> e saber como o Google usa dados de sites parceiros em <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener noreferrer">policies.google.com/technologies/partner-sites</a>. Esta política será atualizada antes de os anúncios entrarem no ar.</p>
<p><strong>Como recusar a medição.</strong> O site não tem um botão de aceitar ou recusar cookies: o Google Analytics${S.pixelOk ? ' e o Meta Pixel' : ''} carregam quando você abre a página. Se você não quiser ser medido, pode: (1) bloquear ou apagar os cookies nas configurações do seu navegador; (2) navegar em uma janela anônima; (3) instalar o <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noopener noreferrer">complemento de desativação do Google Analytics</a>; ${S.pixelOk ? '(4) ajustar as preferências de anúncios na sua conta do Facebook ou Instagram, pela Central de Contas da Meta (<a href="https://www.meta.com/pt-br/help/accounts-center/1894490827562393/" target="_blank" rel="noopener noreferrer">ajuda da Meta</a>); ' : ''}ou (${S.pixelOk ? '5' : '4'}) pedir a oposição ao uso dos seus dados pelo e-mail <a href="mailto:atendimento@eraseconsulta.com.br">atendimento@eraseconsulta.com.br</a>.${S.pixelOk ? ' O envio pela API de Conversões acontece em nossos servidores, então bloquear cookies no navegador não o impede; para isso, use o pedido por e-mail.' : ''}</p>
<h2>7. Contato</h2>
<p>Controladora dos dados: ${razao}, CNPJ ${esc(C.empresa.cnpj)}. E-mail: <a href="mailto:atendimento@eraseconsulta.com.br">atendimento@eraseconsulta.com.br</a>. Você também pode falar conosco pela página <a href="/contato.html">Fale Conosco</a>.</p>`, 'Política de Privacidade do ERASE Revisional: dados que coletamos e para quê, cookies e Google Analytics, anúncios do Google e seus direitos pela LGPD.');
}

// ---------------------------------------------------------------- COMO PRODUZIMOS NOSSO CONTEÚDO
const PRODUCAO_DATE = '2026-10-10'; // data real em que este texto foi escrito (atualize ao revisá-lo)
function comoProduzimos() {
  const body = `<article class="container article legal-doc">
<nav class="crumbs" aria-label="Você está em"><a href="/">Início</a> / Como produzimos nosso conteúdo</nav>
<h1>Como produzimos nosso conteúdo</h1>
<p class="lead">Transparência sobre quem escreve, como revisamos e o que o ERASE Revisional não faz.</p>
<p class="meta">Última atualização: <time datetime="${PRODUCAO_DATE}">${fmtData(PRODUCAO_DATE)}</time></p>
<h2>Quem escreve</h2>
<p>Os textos são assinados pela <strong>Equipe ERASE</strong>. Não usamos autores inventados nem fotos de pessoas para dar rosto ao conteúdo. Parte do trabalho é feita <strong>com apoio de inteligência artificial</strong>, que escreve um rascunho a partir de fontes reais e passa por revisão automática antes de ir ao ar.</p>
<h2>Como cada texto é revisado</h2>
<ul>
<li><strong>Pelo menos 2 fontes citadas</strong>, de sites diferentes, abertas e lidas de verdade; os links ficam no fim do texto. Notícias usam fontes recentes; guias usam fontes oficiais.</li>
<li><strong>Números iguais aos da fonte</strong>: todo número, data, preço ou decisão citado precisa aparecer nas fontes, com o mesmo sentido.</li>
<li><strong>Texto próprio</strong>: não copiamos trechos de outros sites.</li>
<li><strong>Sem promessa de resultado</strong>: nenhum texto diz que você vai recuperar dinheiro, que tem valores a receber ou que algo é garantido, e nenhum dá conselho jurídico individual.</li>
<li><strong>Segurança de conteúdo</strong>: não publicamos conteúdo sexual, violência gráfica, racismo ou discurso de ódio, assédio, instruções perigosas ou ilegais nem golpes.</li>
<li><strong>Neutralidade</strong>: não fazemos propaganda eleitoral ou partidária nem elogiamos ou criticamos governo, partido ou político. Podemos citar autoridades com declaração atribuída e factual, sem endossá-la.</li>
<li><strong>Uma segunda revisão independente</strong>, também automática, confere fatos, fontes e esses critérios; se algo não passa, o texto é reescrito ou não é publicado.</li>
</ul>
<h2>Datas, guias e atualizações</h2>
<p>Mostramos sempre a data real de publicação. <strong>Guias</strong> são textos atemporais e não exibem data; só aparece "Atualizado em" quando o guia foi realmente revisado e o texto mudou. Nunca alteramos a data de um conteúdo antigo.</p>
<h2>Fotos</h2>
<p>As fotos vêm de bancos de imagens livres (Pixabay e Unsplash), com o crédito do autor na página do artigo. Quando não há foto adequada, usamos a foto da categoria.</p>
<h2>O que não somos</h2>
<p>O ERASE Revisional é operado pela ${esc(C.empresa.razaoSocial)}, que não é instituição financeira, correspondente bancário nem escritório de advocacia. O conteúdo é informativo e não substitui a orientação de um profissional habilitado. A calculadora faz uma estimativa e não garante resultado.</p>
<h2>Encontrou um erro?</h2>
<p>Fale com a gente pela página <a href="/contato.html">Fale Conosco</a>: corrigimos ou retiramos o texto.</p>
</article>`;
  out('como-produzimos.html', S.page({
    meta: { title: `Como produzimos nosso conteúdo | ${SITE}`, desc: 'Como a Equipe ERASE produz e revisa os textos: apoio de IA, revisão automática, 2 ou mais fontes citadas, números conferidos e nenhuma promessa de resultado.', path: '/como-produzimos.html' },
    active: '', body,
  }));
  urls.push(['/como-produzimos.html', '0.5', PRODUCAO_DATE]);
}

// ---------------------------------------------------------------- SOBRE
const SOBRE_DATE = '2026-10-15'; // data real em que este texto foi escrito (atualize ao revisá-lo)
function sobre() {
  const e = C.empresa, wa = String(C.whatsapp).replace(/^55(\d{2})(\d{5})(\d{4})$/, '+55 ($1) $2-$3');
  const body = `<article class="container article legal-doc">
<nav class="crumbs" aria-label="Você está em"><a href="/">Início</a> / Sobre a ERASE</nav>
<h1>Sobre a ERASE</h1>
<p class="lead">Quem está por trás do ERASE Revisional, o que fazemos e como cuidamos do que publicamos.</p>
<p class="meta">Última atualização: <time datetime="${SOBRE_DATE}">${fmtData(SOBRE_DATE)}</time></p>
<h2>Quem somos</h2>
<p>O ERASE Revisional é um portal de notícias e uma calculadora gratuita sobre financiamento de veículos, mantido pela <strong>${esc(e.razaoSocial)}</strong>. A ideia é simples: explicar com clareza o que está por trás dos juros e das regras do crédito e ajudar você a entender o seu contrato.</p>
<h2>O que fazemos</h2>
<ul>
<li><strong>Notícias e guias</strong> sobre financiamento de veículos, juros, regras do Banco Central, consórcio, seguros, crédito pessoal, crédito rural e outros temas do sistema financeiro, sempre com as fontes citadas.</li>
<li><strong>Calculadora gratuita</strong>: estima a taxa de juros mensal embutida no seu financiamento e compara com a taxa média divulgada pelo Banco Central. É uma estimativa, não um parecer.</li>
<li><strong>Análise gratuita do contrato</strong> pela equipe da ERASE, se você quiser e autorizar o contato, sem compromisso e sem promessa de resultado.</li>
</ul>
<h2>Como o conteúdo é produzido e revisado</h2>
<p>Os textos são assinados pela Equipe ERASE e produzidos com apoio de inteligência artificial a partir de fontes reais, com revisão automática independente de fatos, números, originalidade e neutralidade. Veja o passo a passo em <a href="/como-produzimos.html">Como produzimos nosso conteúdo</a>.</p>
<h2>O que não somos</h2>
<p>Não somos instituição financeira, correspondente bancário nem escritório de advocacia. O conteúdo é informativo e não substitui a orientação de um profissional habilitado.</p>
<h2>Dados da empresa e contato</h2>
<ul>
<li><strong>Razão social:</strong> ${esc(e.razaoSocial)}</li>
${e.cnpj ? `<li><strong>CNPJ:</strong> ${esc(e.cnpj)}</li>` : ''}
${e.email ? `<li><strong>E-mail:</strong> <a href="mailto:${esc(e.email)}">${esc(e.email)}</a></li>` : ''}
<li><strong>WhatsApp:</strong> <a href="#" data-wa-link>${esc(wa)}</a></li>
<li><strong>Fale Conosco:</strong> <a href="/contato.html">formulário de contato</a></li>
</ul>
</article>`;
  out('sobre.html', S.page({
    meta: { title: `Sobre a ERASE | ${SITE}`, desc: 'Quem é a ERASE Soluções Financeiras, o que faz o ERASE Revisional, como o conteúdo é produzido e revisado e como falar com a equipe.', path: '/sobre.html' },
    active: '', body,
  }));
  urls.push(['/sobre.html', '0.5', SOBRE_DATE]);
}

// ---------------------------------------------------------------- /analise/ (chat de filtro para anúncios; noindex, fora do sitemap e do menu; página enxuta)
function analise() {
  const body = `<div class="chat-shell" id="chat" data-limite-carro="${C.limites.carro}" data-limite-moto="${C.limites.moto}">
<header class="chat-top">
<a class="chat-logo" href="/" aria-label="ERASE Revisional — início"><img class="logo-img" src="/assets/img/logo-erase.webp" alt="" width="110" height="20"></a>
<h1 class="chat-badge">ANÁLISE GRATUITA</h1>
</header>
<div class="chat-log" id="chat-log" role="log" aria-live="polite" aria-label="Conversa"></div>
<div class="chat-acoes" id="chat-acoes"></div>
<p class="chat-rodape">Ao continuar, você aceita a <a href="/privacidade" target="_blank" rel="noopener">Política de Privacidade</a>.<br>ERASE Soluções Financeiras · CNPJ ${esc(C.empresa.cnpj || '')} · ${esc(C.empresa.email || '')} · <a href="/termos" target="_blank" rel="noopener">Termos</a></p>
<noscript><p class="chat-sem-js">Esta página precisa de JavaScript. Fale com a gente pelo <a href="/contato">Fale Conosco</a>.</p></noscript>
</div>`;
  out('analise/index.html', S.page({
    meta: { title: `Análise gratuita do seu financiamento | ${SITE}`, desc: 'Descubra em 1 minuto se os juros do seu financiamento estão acima do normal. ANÁLISE GRATUITA pelo WhatsApp da ERASE.', path: '/analise/', noindex: true },
    active: '', body, scripts: ['/assets/js/calc-core.js', '/assets/js/chat.js'], minimal: true, lean: true, bodyClass: 'chat-page',
  }));
  // não entra no sitemap: é página de campanha
}

function contato() {
  const body = `
<section class="page-head"><div class="container"><h1>Fale Conosco</h1>
<p class="lead">Tem alguma dúvida ou quer pedir a exclusão dos seus dados? Envie uma mensagem ou fale direto pelo WhatsApp.</p></div></section>
<section class="container contact-grid">
<form id="contact-form" class="card-form" novalidate>
<div class="field"><label for="c-nome">Nome</label><input id="c-nome" name="nome" maxlength="80" autocomplete="name" required></div>
<div class="field"><label for="c-email">E-mail</label><input id="c-email" name="email" type="email" maxlength="120" autocomplete="email" required></div>
<div class="field"><label for="c-msg">Mensagem</label><textarea id="c-msg" name="mensagem" rows="6" maxlength="2000" required></textarea></div>
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
    meta: { title: `Fale Conosco | ${SITE}`, desc: 'Fale com a equipe da ERASE pelo formulário ou pelo WhatsApp: dúvidas sobre financiamento de veículo, análise gratuita do contrato ou exclusão de dados.', path: '/contato.html' },
    active: '', body,
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
${urls.map(([p, prio, d]) => `  <url><loc>${absUrl(p)}</loc>${d ? `<lastmod>${d}</lastmod>` : ''}<priority>${prio}</priority></url>`).join('\n')}
</urlset>
`;
  out('sitemap.xml', xml);
  if (C.indexnowKey) out(`${C.indexnowKey}.txt`, C.indexnowKey); // arquivo de verificação do IndexNow: só a chave, na raiz do site
  out('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${absUrl('/sitemap.xml')}\n`);
}

home(); lists(); radar(); artigos(); calculadora(); legais(); comoProduzimos(); sobre(); analise(); contato(); notFound(); seo();
console.log(`OK — ${articles.length} artigos, ${urls.length} URLs no sitemap.`);
