// Microsoft Clarity: script oficial e assíncrono no <head> de TODAS as páginas, sem dados pessoais (nenhum identify/set), campos mascarados.
// Servir dist/ em http://localhost:8123 (node scripts/publish.js) e rodar: NODE_PATH=$(npm root -g) node tests/formularios/clarity-test.js
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'); const ID = 'z4h33e97qt';
let ok = 0, bad = 0; const t = (n, c, x = '') => { c ? ok++ : bad++; console.log(c ? 'OK   ' : 'FALHA', n, c ? '' : x); };
const ler = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
(async () => {
  // ---- todas as páginas (raiz, /analise, categorias, artigos e notícias)
  const paginas = ['404.html', 'analise/index.html', ...fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')), ...fs.readdirSync(path.join(ROOT, 'noticias')).map((f) => 'noticias/' + f)];
  const unicas = [...new Set(paginas)];
  const sem = [], dupla = [], foraDoHead = [];
  for (const f of unicas) {
    const h = ler(f), n = (h.match(/clarity\.ms\/tag\//g) || []).length;
    if (n === 0) sem.push(f); if (n > 1) dupla.push(f);
    if (n === 1 && h.indexOf('clarity.ms/tag/') > h.indexOf('</head>')) foraDoHead.push(f);
  }
  t(`script do Clarity (projeto ${ID}) em TODAS as ${unicas.length} páginas, uma vez só e dentro do <head>`, sem.length === 0 && dupla.length === 0 && foraDoHead.length === 0, JSON.stringify({ sem, dupla, foraDoHead }));
  const home = ler('index.html');
  t('é o snippet oficial: carrega https://www.clarity.ms/tag/<id> de forma assíncrona (t.async=1), sem bloquear a página', home.includes(`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${ID}");`));
  t('o ID vem de data/config.json (clarityId)', JSON.parse(ler('data/config.json')).clarityId === ID);
  // ---- nenhum dado pessoal ao Clarity
  const js = ['assets/js/main.js', 'assets/js/crm.js', 'assets/js/chat.js', 'assets/js/calculator.js', 'assets/js/calc-core.js', 'assets/js/carrossel.js'].map(ler).join('\n') + ler('scripts/site.js') + ler('scripts/build.js');
  t('o site nunca chama clarity("identify"), clarity("set"), clarity("event") nem clarity("consent") com dados', !/clarity\s*\(\s*['"](identify|set|event|upgrade|consent)['"]/.test(js));
  // ---- máscaras
  const calc = ler('calculadora.html'), contato = ler('contato.html'), an = ler('analise/index.html');
  t('calculadora: formulário e painel do resultado mascarados', /<form id="calc-form"[^>]*data-clarity-mask="true"/.test(calc) && /<div id="panel-body" data-clarity-mask="true"/.test(calc));
  t('Fale Conosco e newsletters mascarados', /<form id="contact-form"[^>]*data-clarity-mask="true"/.test(contato) && /<form class="newsletter" id="newsletter-form"[^>]*data-clarity-mask="true"/.test(home) && /<form id="sb-news-form"[^>]*data-clarity-mask="true"/.test(home));
  t('pop-up e chat com máscara no código', /<form id="popup-form"[^>]*data-clarity-mask="true"/.test(ler('assets/js/main.js')) && /acoes\.setAttribute\('data-clarity-mask', 'true'\)/.test(ler('assets/js/chat.js')) && /quem === 'eu' \|\| mascarar/.test(ler('assets/js/chat.js')));
  // ---- no navegador (390 px): o script é pedido, nada quebra se for bloqueado e as máscaras aparecem na tela
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type,x-api-key', 'access-control-allow-methods': 'POST,OPTIONS' };
  async function abrir(url, { bloquearClarity = false, popup = false } = {}) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true }); await require('./_turnstile')(ctx);
    const pedidos = []; ctx.on('request', (r) => pedidos.push(r.url()));
    await ctx.route(/fonts\.|googletagmanager|connect\.facebook/, (r) => r.abort());
    await ctx.route(/clarity\.ms/, (r) => (bloquearClarity ? r.abort() : r.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.__clarityCarregou=1;' })));
    await ctx.route('https://lqxwdyjctsmirinvvyow.supabase.co/**', (r, q) => (q.method() === 'OPTIONS' ? r.fulfill({ status: 204, headers: cors }) : r.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: '{"ok":true}' })));
    if (!popup) await ctx.addInitScript(() => sessionStorage.setItem('erase-popup', '1'));
    const pg = await ctx.newPage(); const erros = []; pg.on('pageerror', (e) => erros.push(e.message));
    await pg.goto('http://localhost:8123' + url); await pg.waitForTimeout(700);
    return { ctx, pg, pedidos, erros };
  }
  const noticia = fs.readdirSync(path.join(ROOT, 'noticias'))[0].replace('.html', '');
  for (const url of ['/', '/calculadora', '/analise/', '/radar', '/noticias/' + noticia]) {
    const { ctx, pg, pedidos, erros } = await abrir(url);
    t(`${url}: pede https://www.clarity.ms/tag/${ID} (assíncrono) e o script carrega`, pedidos.includes(`https://www.clarity.ms/tag/${ID}`) && (await pg.evaluate(() => window.__clarityCarregou === 1)) && erros.length === 0, JSON.stringify(erros));
    await ctx.close();
  }
  { const { ctx, pg, erros } = await abrir('/analise/', { bloquearClarity: true });
    await pg.locator('.chat-opt', { hasText: 'Carro' }).click(); await pg.locator('#ch-campo').waitFor({ timeout: 6000 });
    t('Clarity bloqueado (adblock/rede): o chat funciona normalmente, sem erro na página', erros.length === 0 && (await pg.locator('#ch-campo').count()) === 1, JSON.stringify(erros));
    const mascaras = await pg.evaluate(() => ({ campos: !!document.getElementById('chat-acoes').closest('[data-clarity-mask="true"]') || document.getElementById('chat-acoes').getAttribute('data-clarity-mask') === 'true', eu: [...document.querySelectorAll('.chat-msg.eu')].every((e) => e.getAttribute('data-clarity-mask') === 'true') }));
    await pg.fill('#ch-campo', '40000'); await pg.click('.chat-enviar'); await pg.locator('#ch-campo').waitFor(); await pg.fill('#ch-campo', '48'); await pg.click('.chat-enviar'); await pg.locator('#ch-campo').waitFor(); await pg.fill('#ch-campo', '1500'); await pg.click('.chat-enviar');
    await pg.waitForSelector('.chat-tag', { timeout: 8000 });
    const previa = await pg.evaluate(() => ({ eu: [...document.querySelectorAll('.chat-msg.eu')].every((e) => e.getAttribute('data-clarity-mask') === 'true') && document.querySelectorAll('.chat-msg.eu').length >= 4, previa: document.querySelector('.chat-msg.bot:has(.chat-tag)').getAttribute('data-clarity-mask') === 'true', acoes: document.getElementById('chat-acoes').getAttribute('data-clarity-mask') === 'true' }));
    t('chat: respostas da pessoa, valores da prévia e a área de campos ficam com data-clarity-mask="true"', mascaras.campos && mascaras.eu && previa.eu && previa.previa && previa.acoes, JSON.stringify([mascaras, previa]));
    await ctx.close(); }
  { const { ctx, pg } = await abrir('/', { popup: true }); await pg.waitForSelector('.popup', { timeout: 6000 });
    t('pop-up: formulário mascarado na tela', await pg.evaluate(() => !!document.querySelector('#popup-form[data-clarity-mask="true"]')));
    await ctx.close(); }
  // ---- cabeçalhos: o aviso (Report-Only) já conhece os endereços do Clarity
  const hdr = fs.existsSync(path.join(ROOT, 'dist/_headers')) ? ler('dist/_headers') : '';
  t('CSP (somente relatório) libera www.clarity.ms, scripts.clarity.ms e *.clarity.ms', /script-src[^;]*https:\/\/www\.clarity\.ms[^;]*https:\/\/scripts\.clarity\.ms/.test(hdr) && /connect-src[^;]*https:\/\/\*\.clarity\.ms/.test(hdr), hdr.slice(0, 80));
  await b.close(); console.log(`\n${ok} ok, ${bad} falha(s)`); process.exit(bad ? 1 : 0);
})();
