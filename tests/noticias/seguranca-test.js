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

  // ---- formulários: limites e honeypot
  const contato = ler('contato.html'), calc = ler('calculadora.html'), idx = ler('index.html'), main = ler('assets/js/main.js'), calcjs = ler('assets/js/calculator.js');
  const mx = (h, id, n) => new RegExp(`id="${id}"[^>]*maxlength="${n}"`).test(h);
  t('limites de tamanho: nome 80, e-mail 120, mensagem 2000, WhatsApp 15, valores 14 (contato, calculadora, newsletter, pop-up)', mx(contato, 'c-nome', 80) && mx(contato, 'c-email', 120) && mx(contato, 'c-msg', 2000) && mx(calc, 'lead-nome', 80) && mx(calc, 'lead-wa', 15) && mx(calc, 'valor_financiado', 14) && mx(calc, 'parcela', 14) && mx(idx, 'nl-email', 120) && mx(idx, 'sb-email', 120) && /id="pp-nome" name="nome" maxlength="80"/.test(main) && /id="pp-tel" name="telefone" maxlength="15"/.test(main));
  t('honeypot (bot-field) na calculadora e no pop-up, descartado sem envio', /name="bot-field" class="hp"/.test(calc) && /name="bot-field" class="hp"/.test(main.split('id="popup-form"')[1]) && /form\['bot-field'\]\.value\) return/.test(main) && /form\['bot-field'\]\.value\) \{ ev\.preventDefault\(\); return; \}/.test(calcjs));
  console.log(`${ok} ok, ${bad} falha(s)`); process.exit(bad ? 1 : 0);
})();
