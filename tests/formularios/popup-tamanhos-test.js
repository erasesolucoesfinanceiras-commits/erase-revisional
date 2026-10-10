// Pop-up de captação: sem barra de rolagem (nem no pop-up nem no overlay) e tudo visível em vários tamanhos de área visível.
// Servir dist/ em http://localhost:8123 (URLs sem .html). Rodar: node tests/formularios/popup-tamanhos-test.js  (PRINTS=pasta salva 2 prints)
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const T = [[1366, 625], [1280, 600], [1920, 950], [390, 844], [360, 640], [844, 390]];
(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] }); let bad = 0;
  for (const [w, h] of T) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: w < 900 }); await ctx.route(/fonts\./, (r) => r.abort());
    const pg = await ctx.newPage(); await pg.goto('http://localhost:8123/'); await pg.waitForSelector('.popup', { timeout: 6000 }); await pg.waitForTimeout(600);
    const r = await pg.evaluate(() => {
      const pop = document.querySelector('.popup'), ov = document.querySelector('.popup-overlay'), box = pop.getBoundingClientRect();
      const visivel = (sel) => { const e = document.querySelector(sel); if (!e) return false; const c = getComputedStyle(e), q = e.getBoundingClientRect(); return c.display !== 'none' && q.width > 0 && q.height > 0 && q.top >= box.top - 1 && q.bottom <= box.bottom + 1 && q.right <= box.right + 1; };
      const alvo = ['#pp-nome', '#pp-tel', '.popup .choice span', '.popup-cta'].map((s) => document.querySelector(s).getBoundingClientRect().height);
      return { rolaPopup: pop.scrollHeight > pop.clientHeight + 1, rolaOverlay: ov.scrollHeight > ov.clientHeight + 1, cabeNaTela: box.top >= 0 && box.bottom <= innerHeight, popH: Math.round(box.height),
        itens: ['.free-badge', '#popup-title', '#pp-nome', '#pp-tel', '.popup .choice:nth-child(1)', '.popup .choice:nth-child(2)', '.popup .choice:nth-child(3)', '#pp-lgpd', '.popup-cta', '.popup-legal', '.popup-close'].filter((s) => !visivel(s)),
        minAlvo: Math.round(Math.min(...alvo)), fechar: (() => { const q = document.querySelector('.popup-close').getBoundingClientRect(); return [Math.round(q.width), Math.round(q.height)]; })() };
    });
    const ok = !r.rolaPopup && !r.rolaOverlay && r.cabeNaTela && !r.itens.length && r.minAlvo >= 44 && r.fechar[0] >= 44;
    if (!ok) bad++; console.log(ok ? 'OK   ' : 'FALHA', `${w}x${h}`, JSON.stringify(r));
    if (process.env.PRINTS && ((w === 1366 && h === 625) || (w === 360 && h === 640))) await pg.screenshot({ path: `${process.env.PRINTS}/popup-${w}x${h}.png` });
    await ctx.close();
  }
  await b.close(); process.exit(bad ? 1 : 0);
})();
