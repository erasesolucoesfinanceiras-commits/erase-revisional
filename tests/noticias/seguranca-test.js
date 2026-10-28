// node tests/noticias/seguranca-test.js — JSON-LD escapado, robô de coleta sem endereços internos, workflows com versões fixas, limites e honeypot nos formulários.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const S = require(path.join(ROOT, 'scripts/site'));
const W = require(path.join(ROOT, 'scripts/noticias/web'));
let ok = 0, bad = 0; const t = (n, c, x = '') => { c ? ok++ : bad++; console.log(c ? 'OK   ' : 'FALHA', n, c ? '' : x); };
const ler = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

(async () => {
  // ---- JSON-LD
  const mau = 'a</script><script>alert(1)</script> & b ';
  const html = S.page({ meta: { title: 't', desc: 'd'.repeat(80), path: '/x.html', jsonld: { headline: mau } }, active: '', body: '' });
  const bloco = /<script type="application\/ld\+json">(.*?)<\/script>/s.exec(html)[1];
  t('JSON-LD: título com </script> não fecha o bloco (< > & escapados) e o JSON continua igual', !html.includes('</script><script>alert') && !/[<>]/.test(bloco) && JSON.parse(bloco).headline === mau);
  const paginas = [...fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')), ...fs.readdirSync(path.join(ROOT, 'noticias')).map((f) => 'noticias/' + f)];
  t('nenhuma página gerada tem < ou > dentro do JSON-LD', paginas.every((f) => [...ler(f).matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].every((m) => !/[<>]/.test(m[1]))));
  const arts = JSON.parse(ler('data/articles.json')), notas = JSON.parse(ler('data/notas.json'));
  t('títulos, resumos e nomes de fonte já publicados sem < ou >', [...arts, ...notas].every((x) => !/[<>]/.test(`${x.titulo}${x.resumo || ''}${(x.fontes || []).map((f) => f.nome).join('')}`)));
  t('robô: título, resumo e nome da fonte passam por limpeza de < >', /semMarcas\(r\.titulo\)/.test(ler('scripts/noticias/run.js')) && /semMarcas\(r\.resumo\)/.test(ler('scripts/noticias/run.js')) && /replace\(\/\[<>\]\/g/.test(ler('scripts/noticias/run.js').split('const limparFontes')[1].slice(0, 200)));

  // ---- robô de coleta
  const fake = async (x) => [{ address: x }];
  const casos = [['http://127.0.0.1/x', false], ['http://localhost:3000', false], ['http://169.254.169.254/latest/meta-data', false], ['http://10.1.2.3', false], ['http://172.16.0.1', false], ['http://192.168.0.10', false], ['http://100.64.0.1', false], ['http://[::1]/', false], ['http://[fd00::1]/', false], ['http://[::ffff:10.0.0.1]/', false], ['file:///etc/passwd', false], ['ftp://a.com/x', false], ['http://user:senha@a.com/', false], ['http://metadata.google.internal/', false], ['https://93.184.216.34/ok', true], ['http://[2606:4700::1111]/', true]];
  const falhas = []; for (const [u, esperado] of casos) if ((await W.urlSegura(u, async () => [])) !== esperado) falhas.push(u);
  t('urlSegura: recusa loopback, redes privadas, metadados, IPv6 interno, esquemas e usuário/senha; aceita IP público', !falhas.length, falhas.join(' '));
  t('urlSegura: nome que resolve para IP interno é recusado; para IP público é aceito; DNS que falha é recusado', !(await W.urlSegura('https://x.example/', () => fake('10.0.0.9'))) && (await W.urlSegura('https://x.example/', () => fake('93.184.216.34'))) && !(await W.urlSegura('https://x.example/', async () => { throw new Error('dns'); })));
  const antes = global.fetch; let abertos = [];
  global.fetch = async (u) => { abertos.push(String(u)); return new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' } }); };
  let r = await W.abrir('https://93.184.216.34/noticia');
  t('abrir: redirecionamento para endereço interno é recusado e nunca é aberto', !r.ok && /não permitido/.test(r.erro) && abertos.length === 1 && !abertos.some((u) => u.includes('169.254')), JSON.stringify(r));
  abertos = []; global.fetch = async (u) => { abertos.push(String(u)); return new Response(null, { status: 302, headers: { location: 'https://93.184.216.34/proximo' + abertos.length } }); };
  r = await W.abrir('https://93.184.216.34/inicio');
  t('abrir: no máximo 5 redirecionamentos', !r.ok && /demais/.test(r.erro) && abertos.length === 6, JSON.stringify({ r, n: abertos.length }));
  global.fetch = async () => new Response('<html><body><p>Texto da notícia</p></body></html>', { status: 200, headers: { 'content-type': 'text/html' } });
  r = await W.abrir('https://93.184.216.34/ok');
  t('abrir: página pública normal continua funcionando', r.ok && /Texto da notícia/.test(r.texto), JSON.stringify(r));
  global.fetch = antes;

  // ---- workflows e dependências
  const wfs = fs.readdirSync(path.join(ROOT, '.github/workflows')).map((f) => [f, ler('.github/workflows/' + f)]);
  const usos = wfs.flatMap(([f, c]) => [...c.matchAll(/uses:\s*(\S+)/g)].map((m) => [f, m[1]]));
  t('todas as ações do GitHub fixadas por hash de 40 caracteres', usos.length >= 14 && usos.every(([, u]) => /@[0-9a-f]{40}$/.test(u)), usos.filter(([, u]) => !/@[0-9a-f]{40}$/.test(u)).join(' '));
  t('workflows instalam com "npm ci --ignore-scripts" (nada de npm i / install sem versão)', wfs.every(([, c]) => !/npm (i|install)\b/.test(c)) && wfs.filter(([, c]) => /sharp|npm ci/.test(c)).every(([, c]) => /npm ci --ignore-scripts/.test(c)));
  const pkg = JSON.parse(ler('package.json')), lock = JSON.parse(ler('package-lock.json'));
  t('sharp com versão exata no package.json e no package-lock.json', /^\d+\.\d+\.\d+$/.test(pkg.devDependencies.sharp) && lock.packages['node_modules/sharp'].version === pkg.devDependencies.sharp);
  t('workflow das notícias: timeout de 60 minutos', /timeout-minutes: 60\b/.test(wfs.find(([f]) => f === 'noticias.yml')[1]));
  const fotos = wfs.filter(([f]) => /^fotos/.test(f));
  t('workflows de fotos: só manual (sem push) e só na main', fotos.length === 2 && fotos.every(([, c]) => !/\n\s*push:/.test(c) && /workflow_dispatch:/.test(c) && /if: github\.ref == 'refs\/heads\/main'/.test(c)));
  const blocosRun = (c) => { const L = c.split('\n'), out = []; for (let i = 0; i < L.length; i++) { const m = /^(\s*)(?:- )?run:\s*(.*)$/.exec(L[i]); if (!m) continue; let b = m[2]; const ind = m[1].length; for (let k = i + 1; k < L.length && (L[k].trim() === '' || L[k].search(/\S/) > ind); k++) b += '\n' + L[k]; out.push(b); } return out; };
  t('entradas manuais e dados de eventos nunca coladas em comandos "run:" (só via env)', wfs.every(([, c]) => blocosRun(c).length > 0 && blocosRun(c).every((b) => !/\$\{\{\s*(inputs|github\.event)\./.test(b))));

  // ---- sanitizar() REAL (o mesmo portão usado por run.js, revisar-guia.js e build.js)
  const { sanitizar, ESQUEMA_PERIGOSO } = require(path.join(ROOT, 'scripts/noticias/sanitizar'));
  const soPermitido = (h) => !/<(?!\/?(?:p|h2|h3|ul|ol|li|strong|em|blockquote|br|sup|sub)>)/i.test(h); // nenhum "<" fora das tags simples permitidas
  const maus = {
    'tag remontada': '<p>x</p><<a>img src=x onerror=alert(1)>',
    'tag sem ">" no fim': '<p>x</p><img src=x onerror=alert(document.domain)',
    'javascript: em link': '<p>veja <a href="javascript:alert(1)">aqui</a></p>',
    'aninhada': '<<<a>a>script>alert(1)</script>',
    'atributo em tag permitida': '<p onclick="alert(1)">x</p><h2 style="x">t</h2>',
  };
  for (const [nome, entrada] of Object.entries(maus)) { const saida = sanitizar(entrada); t(`sanitizar real: ${nome} sai sem tag ativa, sem atributo e sem "<" solto`, soPermitido(saida) && !/\son\w+\s*=/.test(saida.replace(/&lt;[^<]*/g, '')) && !/<[^>]*\s\w+=/.test(saida), JSON.stringify(saida)); }
  t('sanitizar real: a tag remontada não vira <img> e a tag sem ">" vira texto (&lt;)', !/<img/i.test(sanitizar(maus['tag remontada'])) && sanitizar(maus['tag sem ">" no fim']).includes('&lt;img') && !/<img/i.test(sanitizar(maus['tag sem ">" no fim'])));
  t('sanitizar real: link javascript: some (a tag não sobrevive) e o esquema é reconhecido pela regra de recusa', !/<a\b/i.test(sanitizar(maus['javascript: em link'])) && ESQUEMA_PERIGOSO.test(maus['javascript: em link']) && ESQUEMA_PERIGOSO.test('JavaScript :x') && !ESQUEMA_PERIGOSO.test('texto comum com a palavra java e script'));
  t('sanitizar real: repetir a limpeza não muda nada (idempotente) e mantém as tags simples', Object.values(maus).every((e) => sanitizar(sanitizar(e)) === sanitizar(e)) && sanitizar('<P CLASS=x>a <STRONG>b</STRONG></P><br/>') === '<p>a <strong>b</strong></p><br>');
  const artigosPub = JSON.parse(ler('data/articles.json'));
  const mudados = artigosPub.filter((a) => sanitizar(a.corpo) !== a.corpo).map((a) => a.slug);
  t(`todo artigo já publicado continua IGUAL depois do sanitizar (${artigosPub.length} artigos)`, artigosPub.length > 0 && !mudados.length, mudados.join(' '));
  const runSrc = ler('scripts/noticias/run.js'), buildSrc = ler('scripts/build.js'), guiaSrc = ler('scripts/noticias/revisar-guia.js');
  t('run.js e build.js usam o sanitizar compartilhado (sem cópia própria) e o build limpa o corpo antes de gravar', /require\('\.\/sanitizar'\)/.test(runSrc) && !/function sanitizar/.test(runSrc) && /require\('\.\/noticias\/sanitizar'\)/.test(buildSrc) && /injectCTA\(sanitizar\(a\.corpo\)/.test(buildSrc) && /ESQUEMA_PERIGOSO/.test(guiaSrc) && /ESQUEMA_PERIGOSO/.test(runSrc));
  t('links de fontes/fotos/redes: só http(s) vão para href (javascript: e data: viram "#")', S.urlHttp('javascript:alert(1)') === '#' && S.urlHttp(' data:text/html,x') === '#' && S.urlHttp('') === '#' && S.urlHttp('https://pixabay.com/users/x') === 'https://pixabay.com/users/x' && S.urlHttp('HTTP://a.b/c') === 'HTTP://a.b/c');

  // ---- despublicar, cabeçalhos e Dependabot
  const desp = ler('.github/workflows/despublicar.yml');
  t('despublicar.yml: grupo de concorrência próprio e falha (exit 1) quando o push não acontece', /group:\s*despublicar\b/.test(desp) && !/group:\s*noticias/.test(desp) && /enviado=0/.test(desp) && /exit 1/.test(desp) && /enviado" != 1/.test(desp));
  const cab = ler('dist/_headers'), blocoCab = /^\/\*\n((?:  .*\n)+)/m.exec(cab);
  t('cabeçalhos: COOP same-origin-allow-popups e CORP same-site no /*; CSP segue só em modo relatório (sem Content-Security-Policy que bloqueie)', !!blocoCab && /Cross-Origin-Opener-Policy: same-origin-allow-popups/.test(blocoCab[1]) && /Cross-Origin-Resource-Policy: same-site/.test(blocoCab[1]) && /Content-Security-Policy-Report-Only:/.test(blocoCab[1]) && !/^\s+Content-Security-Policy:/m.test(cab));
  const dep = ler('.github/dependabot.yml');
  t('dependabot.yml: npm e github-actions só com atualização de segurança (limite de PRs de versão = 0)', /package-ecosystem: "npm"/.test(dep) && /package-ecosystem: "github-actions"/.test(dep) && (dep.match(/open-pull-requests-limit: 0/g) || []).length === 2);

  // ---- formulários: limites e honeypot
  const contato = ler('contato.html'), calc = ler('calculadora.html'), idx = ler('index.html'), main = ler('assets/js/main.js'), calcjs = ler('assets/js/calculator.js');
  const mx = (h, id, n) => new RegExp(`id="${id}"[^>]*maxlength="${n}"`).test(h);
  t('limites de tamanho: nome 80, e-mail 120, mensagem 2000, WhatsApp 15, valores 14 (contato, calculadora, newsletter, pop-up)', mx(contato, 'c-nome', 80) && mx(contato, 'c-email', 120) && mx(contato, 'c-msg', 2000) && mx(calc, 'lead-nome', 80) && mx(calc, 'lead-wa', 15) && mx(calc, 'valor_financiado', 14) && mx(calc, 'parcela', 14) && mx(idx, 'nl-email', 120) && mx(idx, 'sb-email', 120) && /id="pp-nome" name="nome" maxlength="80"/.test(main) && /id="pp-tel" name="telefone" maxlength="15"/.test(main));
  t('honeypot (bot-field) na calculadora e no pop-up, descartado sem envio', /name="bot-field" class="hp"/.test(calc) && /name="bot-field" class="hp"/.test(main.split('id="popup-form"')[1]) && /form\['bot-field'\]\.value\) return/.test(main) && /form\['bot-field'\]\.value\) \{ ev\.preventDefault\(\); return; \}/.test(calcjs));
  console.log(`${ok} ok, ${bad} falha(s)`); process.exit(bad ? 1 : 0);
})();
