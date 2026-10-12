// redeploy.sh: sem segredo não faz nada; com segredo chama o hook só se algo foi gravado; repete em erro; nunca falha. Rodar da raiz: node tests/noticias/redeploy-test.js
const http = require('http'), { spawnSync } = require('child_process'), path = require('path');
const SH = path.join(__dirname, '..', '..', 'scripts/noticias/redeploy.sh'), ROOT = path.join(__dirname, '..', '..');
let bad = 0; const t = (n, c) => { if (!c) bad++; console.log(c ? 'OK   ' : 'FALHA', n); };
let n = 0, falhas = 0;
const srv = http.createServer((q, r) => { n++; r.statusCode = n <= falhas ? 502 : 200; r.end(); });
srv.listen(0, () => {
  const url = `http://localhost:${srv.address().port}/hook`, head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).stdout.toString().trim();
  const run = (env, inicio) => new Promise((res) => { const p = require('child_process').spawn('bash', [SH, inicio], { cwd: ROOT, env: { ...process.env, HOOK_ESPERA: '0', ...env } }); let o = ''; p.stdout.on('data', (d) => (o += d)); p.on('close', (c) => res({ c, o })); });
  (async () => {
    let r = await run({ CF_DEPLOY_HOOK_URL: '' }, 'x'); t('sem segredo: sai com sucesso e não chama nada', r.c === 0 && n === 0);
    r = await run({ CF_DEPLOY_HOOK_URL: url }, head); t('nada gravado (mesmo commit): não chama', r.c === 0 && n === 0);
    r = await run({ CF_DEPLOY_HOOK_URL: url }, 'outro'); t('algo gravado: chama o hook', r.c === 0 && n === 1);
    n = 0; falhas = 2; r = await run({ CF_DEPLOY_HOOK_URL: url }, 'outro'); t('hook dá 502 duas vezes: repete e consegue', r.c === 0 && n === 3);
    n = 0; falhas = 99; r = await run({ CF_DEPLOY_HOOK_URL: url }, 'outro'); t('hook fora do ar: 4 tentativas, avisa e NÃO falha', r.c === 0 && n === 4 && /::warning::/.test(r.o));
    srv.close(); process.exit(bad ? 1 : 0);
  })();
});
