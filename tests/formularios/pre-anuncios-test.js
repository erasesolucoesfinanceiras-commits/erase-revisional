// Ajustes antes dos anúncios: textos legais, faixa da home, rodapé com e-mail, h1 do /analise, alvos de toque de 44 px e foco do chat.
// Rodar: servir dist/ em http://localhost:8123 (node scripts/publish.js) e: NODE_PATH=$(npm root -g) node tests/formularios/pre-anuncios-test.js
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', '..'); const B = 'http://localhost:8123';
let pass = 0, fail = 0; const t = (n, c, x = '') => { (c ? pass++ : fail++); console.log(c ? 'OK   ' : 'FALHA', n, c ? '' : x); };
const lerHtml = (f) => fs.readFileSync(path.join(root, f), 'utf8');
(async () => {
  // ---- textos (HTML gerado)
  const priv = lerHtml('privacidade.html'), termos = lerHtml('termos.html'), home = lerHtml('index.html');
  t('Política: sem "sem nome nem telefone"; diz que telefone e e-mail podem ir à Meta com hash pela API de Conversões', !/sem o seu nome nem o seu telefone/.test(priv) && /telefone e e-mail\) podem ser enviados à Meta de forma criptografada \(hash\) pela API de Conversões, para medir os anúncios/.test(priv));
  t('Política: seção 3 cita Meta Pixel e API de Conversões', /Meta Pixel e API de Conversões, conforme a seção 6/.test(priv));
  t('Faixa da home: "ANÁLISE DO CONTRATO 100% GRATUITA" + nova frase, sem "valores a recuperar"', /ANÁLISE DO CONTRATO 100% GRATUITA <span>Descubra se a taxa do seu contrato está acima da média<\/span>/.test(home) && !/valores a recuperar/.test(home));
  t('Termos: Meta Pixel, Cloudflare/Turnstile, fluxo, prazo de 1 dia útil e e-mail de contato', /Meta Pixel/.test(termos) && /Turnstile/.test(termos) && /chat de análise[^<]*calculadora[^<]*\(2\)[^<]*WhatsApp[^<]*\(3\) você envia o contrato; \(4\)[^<]*análise gratuita do contrato/.test(termos) && /em até 1 dia útil após o envio dos dados/.test(termos) && (termos.match(/mailto:atendimento@eraseconsulta\.com\.br/g) || []).length >= 1 && /Dúvidas podem ser enviadas para/.test(termos));
  const paginas = ['404.html', 'analise/index.html', ...fs.readdirSync(root).filter((f) => f.endsWith('.html')), ...fs.readdirSync(path.join(root, 'noticias')).map((f) => 'noticias/' + f)];
  const sem = [...new Set(paginas)].filter((f) => { const h = lerHtml(f); return !(h.includes('59.449.234/0001-63') && h.includes('atendimento@eraseconsulta.com.br') && /href="\/termos/.test(h) && /href="\/privacidade/.test(h)); });
  t(`rodapé de todas as ${new Set(paginas).size} páginas tem CNPJ, e-mail, Termos e Política`, sem.length === 0, sem.join(', '));
  t('/analise/: h1 "ANÁLISE GRATUITA" (um só)', (lerHtml('analise/index.html').match(/<h1[ >]/g) || []).length === 1 && /<h1 class="chat-badge">ANÁLISE GRATUITA<\/h1>/.test(lerHtml('analise/index.html')));

  // ---- celular 390 px: alvos de toque
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await ctx.route(/fonts\.|googletagmanager|connect\.facebook|challenges/, (r) => r.abort()); await ctx.addInitScript(() => sessionStorage.setItem('erase-popup', '1'));
  const pg = await ctx.newPage();
  const med = (sel) => pg.evaluate((s) => [...document.querySelectorAll(s)].filter((e) => e.getBoundingClientRect().width > 0).map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }), sel);
  const ok44 = (l) => l.length > 0 && l.every(([w, h]) => w >= 44 && h >= 44);
  await pg.goto(B + '/'); await pg.waitForTimeout(600);
  t('botão de tema e de menu: 44×44 no celular', ok44(await med('.theme-toggle')) && ok44(await med('.nav-toggle')));
  const sim = await med('.nav-actions .btn-sm'); t('"Simular agora": altura ≥ 44', sim.length > 0 && sim.every(([, h]) => h >= 44), JSON.stringify(sim));
  const dots = await med('.car-dot'); t('pontos do carrossel: 44×44', ok44(dots), JSON.stringify(dots));
  const ctl = await pg.evaluate(() => { const c = document.querySelector('.car-dots'); const r = c && c.getBoundingClientRect(); return { fim: r ? r.right : 0, rolaX: document.documentElement.scrollWidth > innerWidth }; });
  t('o carrossel com pontos maiores não gera rolagem lateral na home', !ctl.rolaX, JSON.stringify(ctl));
  await pg.goto(B + '/radar'); await pg.waitForTimeout(500);
  const tags = await pg.evaluate(() => [...document.querySelectorAll('a.tag')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => { const r = e.getBoundingClientRect(); return Math.round(r.height); }));
  t('etiquetas de categoria (link): área de toque ≥ 44 px de altura', tags.length > 0 && tags.every((h) => h >= 44), JSON.stringify(tags.slice(0, 8)));
  await pg.goto(B + '/'); await pg.waitForTimeout(500);
  const sobre = await pg.evaluate(() => { const e = document.querySelector('a.tag-on-img'); if (!e) return { achou: false }; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); const cx = r.left + r.width / 2; return { achou: true, h: Math.round(r.height), cima: document.elementFromPoint(cx, r.top - 18)?.closest('a.tag') === e, baixo: document.elementFromPoint(cx, r.bottom + 18)?.closest('a.tag') === e }; });
  t('etiqueta sobre a imagem: área de toque se estende além do desenho (≥ 44 px no total)', !sobre.achou || (sobre.cima && sobre.baixo), JSON.stringify(sobre));
  const rolaTodas = []; for (const u of ['/', '/radar', '/calculadora', '/analise', '/artigos']) { await pg.goto(B + u); await pg.waitForTimeout(300); if (await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth)) rolaTodas.push(u); }
  t('sem rolagem lateral no celular nas páginas principais', rolaTodas.length === 0, rolaTodas.join());

  // ---- chat: foco visível
  await pg.goto(B + '/analise'); await pg.waitForSelector('.chat-opt');
  const foco = await pg.evaluate(() => { const e = document.querySelector('.chat-opt'); e.blur(); return null; });
  await pg.keyboard.press('Tab'); await pg.keyboard.press('Tab');
  const f = await pg.evaluate(() => { const a = document.activeElement; const s = getComputedStyle(a); return { cls: a.className, estilo: s.outlineStyle, larg: parseFloat(s.outlineWidth), cor: s.outlineColor, fundo: s.backgroundColor }; });
  t('opção do chat em foco (teclado): contorno visível de 3 px, além da cor de fundo', /chat-opt/.test(f.cls) && f.estilo === 'solid' && f.larg >= 3, JSON.stringify(f));
  await b.close(); console.log(`\n${pass} ok, ${fail} falha(s)`); process.exit(fail ? 1 : 0);
})();
