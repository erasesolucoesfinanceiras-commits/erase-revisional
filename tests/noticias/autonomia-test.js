// Testes do escalonamento automático de falhas (sem internet: servidores falsos locais). Rodar da raiz: node tests/noticias/autonomia-test.js
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path');
const { spawn, execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
let ok = 0, bad = 0; const t = (n, c, x = '') => { c ? ok++ : bad++; console.log(c ? 'OK   ' : 'FALHA', n, c ? '' : x); };
const servidor = (h) => new Promise((r) => { const s = http.createServer(h); s.listen(0, () => r(s)); });
const rodar = (args, env, entrada) => new Promise((res) => { const p = spawn('node', args, { env: { ...process.env, ...env }, cwd: ROOT }); let o = ''; p.stdout.on('data', (d) => (o += d)); p.stderr.on('data', (d) => (o += d)); p.on('close', (code) => res({ code, o })); });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'aut-'));
const ultimaLinha = (f) => { const l = fs.readFileSync(f, 'utf8').trim().split('\n'); return JSON.parse(l[l.length - 1]); };

(async () => {
  // ---------- Gemini: lista de modelos, espera e repete, próximo modelo, exige pessoa
  const cenarios = {
    'lista + 429 por minuto: espera e repete no mesmo modelo': { seq: ['429min', 'ok'], esperaModelo: 'gemini-4.0-flash', chamadas: ['gemini-4.0-flash', 'gemini-4.0-flash'] },
    '429 da cota do dia: passa ao próximo modelo': { seq: ['429dia', 'ok'], esperaModelo: 'gemini-2.5-flash' },
    '503 repetido: depois de 3 tentativas passa ao próximo': { seq: ['503', '503', '503', 'ok'], esperaModelo: 'gemini-2.5-flash' },
    '404 do modelo mais novo: passa ao próximo': { seq: ['404', 'ok'], esperaModelo: 'gemini-2.5-flash' },
    'chave inválida (401): exige pessoa, sem esperar': { seq: ['401'], humano: /chave do Gemini/ },
    'conta suspensa (403): exige pessoa': { seq: ['403susp'], humano: /negado|suspenso/ },
    'limite 0 em todos os modelos: exige pessoa (plano)': { seq: ['429zero', '429zero', '429zero', '429zero', '429zero', '429zero'], humano: /cota gratuita/ },
  };
  for (const [nome, c] of Object.entries(cenarios)) {
    const pedidos = []; let i = 0;
    const srv = await servidor((q, s) => {
      if (q.url.startsWith('/models?')) { s.setHeader('content-type', 'application/json'); return s.end(JSON.stringify({ models: ['gemini-2.5-flash', 'gemini-4.0-flash', 'gemini-4.0-flash-lite', 'gemini-4.0-pro'].map((n) => ({ name: 'models/' + n, supportedGenerationMethods: ['generateContent'] })) })); }
      pedidos.push(q.url.split('/models/')[1].split(':')[0]);
      const m = c.seq[Math.min(i++, c.seq.length - 1)];
      const resp = (st, corpo) => { s.statusCode = st; s.setHeader('content-type', 'application/json'); s.end(JSON.stringify(corpo)); };
      if (m === 'ok') return resp(200, { candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] });
      if (m === '429min') return resp(429, { error: { code: 429, status: 'RESOURCE_EXHAUSTED', details: [{ retryDelay: '3s' }], message: 'quota per minute' } });
      if (m === '429dia') return resp(429, { error: { code: 429, message: 'Quota exceeded for metric GenerateRequestsPerDayPerProjectPerModel-FreeTier' } });
      if (m === '429zero') return resp(429, { error: { code: 429, message: 'Quota exceeded ... limit: 0, model: x' } });
      if (m === '401') return resp(400, { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' } });
      if (m === '403susp') return resp(403, { error: { code: 403, status: 'PERMISSION_DENIED', message: 'Consumer has been suspended.' } });
      return resp(Number(m.replace(/\D/g, '')) || 500, { error: { message: 'x' } });
    });
    const r = await rodar(['-e', "const g=require('./scripts/noticias/gemini');g.chamar({prompt:'x'}).then(r=>console.log('RES '+JSON.stringify(r)),e=>console.log('ERR '+JSON.stringify({humano:e.humano,causa:e.causa,msg:e.message})))"],
      { GEMINI_API_KEY: 'k', GEMINI_BASE: `http://localhost:${srv.address().port}`, GEMINI_ESPERA_ESCALA: '0.001', GEMINI_INTERVALO_MS: '0', GEMINI_MODEL: '' });
    srv.close();
    const res = /RES (.*)/.exec(r.o), err = /ERR (.*)/.exec(r.o);
    if (c.humano) t(`gemini: ${nome}`, err && JSON.parse(err[1]).humano === true && c.humano.test(JSON.parse(err[1]).causa), r.o.slice(-300));
    else t(`gemini: ${nome}`, res && JSON.parse(res[1]).modelo === c.esperaModelo && (!c.chamadas || JSON.stringify(pedidos) === JSON.stringify(c.chamadas)), r.o.slice(-300) + JSON.stringify(pedidos));
  }
  { // ordem: o flash estável mais novo vem primeiro (4.0-flash antes de 2.5-flash; lite depois; pro ignorado)
    const { ordenarDisponiveis } = require(path.join(ROOT, 'scripts/noticias/gemini'));
    t('gemini: ordem da lista da API', JSON.stringify(ordenarDisponiveis(['models/gemini-2.5-flash', 'models/gemini-4.0-flash-lite', 'models/gemini-4.0-flash', 'models/gemini-4.0-pro'])) === '["gemini-4.0-flash","gemini-2.5-flash","gemini-4.0-flash-lite"]');
  }

  // ---------- run.js: rodadas (sem fontes → nenhum tema publica)
  for (const [rodada, esperaCodigo, ultimo] of [['1', 0, 'rodada_falhou'], ['final', 1, 'diagnostico_final']]) {
    const d = tmp(); fs.cpSync(path.join(ROOT, 'data'), d, { recursive: true });
    const r = await rodar(['scripts/noticias/run.js'], { DADOS_DIR: d, DATA: '2026-10-14', RODADA: rodada, GEMINI_API_KEY: 'k', FONTES_ESPERA_MS: '0', HTTPS_PROXY: 'http://127.0.0.1:9', https_proxy: 'http://127.0.0.1:9' });
    const f = path.join(d, 'noticias-log.jsonl'), u = ultimaLinha(f);
    const linhas = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    t(`run rodada ${rodada}: saída ${esperaCodigo}, última linha do log = ${ultimo}`, r.code === esperaCodigo && u.evento === ultimo, `code=${r.code} ${JSON.stringify(u).slice(0, 200)}`);
    t(`run rodada ${rodada}: tema_trocado registrado com motivo`, linhas.some((x) => x.evento === 'tema_trocado' && x.de && x.para && x.motivo));
    if (rodada === 'final') t('run final: causa em linguagem simples e etapas no diagnóstico', /Nenhuma saída automática/.test(u.causa) && u.etapas.length > 0 && u.precisa_de_humano === false);
    fs.rmSync(d, { recursive: true, force: true });
  }

  // ---------- verificação diária (GitHub, site e Cloudflare falsos)
  async function verificar(nome, { runs = [], siteTem = false, hookRestaura = false, dataArtigo = '2026-10-02', hoje = '2026-10-02', hook = true, guiaRevisadoHoje = false }) {
    const d = tmp(); fs.cpSync(path.join(ROOT, 'data'), d, { recursive: true });
    const arts = JSON.parse(fs.readFileSync(path.join(d, 'articles.json'), 'utf8')); arts[0].data = dataArtigo; if (guiaRevisadoHoje) arts.forEach((a) => { a.data = dataArtigo; a.atualizado = hoje; }); fs.writeFileSync(path.join(d, 'articles.json'), JSON.stringify(arts));
    const slug = arts[0].slug; const ev = { dispatch: 0, hook: 0 }; let site = siteTem; let runsAtuais = runs.slice();
    const gh = await servidor((q, s) => { s.setHeader('content-type', 'application/json');
      if (q.method === 'POST' && q.url.includes('/dispatches')) { ev.dispatch++; runsAtuais = [{ id: 9, status: 'completed', conclusion: 'success', created_at: new Date().toISOString() }]; s.statusCode = 204; return s.end(); }
      s.end(JSON.stringify({ workflow_runs: runsAtuais })); });
    const st = await servidor((q, s) => s.end(site ? `<a href="/noticias/${slug}">x</a>` : '<p>sem artigo</p>'));
    const hk = await servidor((q, s) => { ev.hook++; if (hookRestaura) site = true; s.end('{}'); });
    const r = await rodar(['scripts/noticias/verificar-dia.js'], { GITHUB_TOKEN: 't', GITHUB_REPOSITORY: 'o/r', GITHUB_API: `http://localhost:${gh.address().port}`, SITE_URL: `http://localhost:${st.address().port}`, ...(hook ? { CF_DEPLOY_HOOK_URL: `http://localhost:${hk.address().port}` } : { CF_DEPLOY_HOOK_URL: '' }), DADOS_DIR: d, DATA: hoje, SEM_GIT: '1', VERIF_ESPERA_MS: '30', VERIF_ESCALA: '0.002' });
    [gh, st, hk].forEach((x) => x.close());
    const u = ultimaLinha(path.join(d, 'noticias-log.jsonl'));
    fs.rmSync(d, { recursive: true, force: true }); return { r, ev, u, nome };
  }
  let v = await verificar('agendamento não disparou + site sem artigo + gancho de deploy resolve', { runs: [], siteTem: false, hookRestaura: true });
  t('verificação: agendamento não disparou → dispara a geração', v.ev.dispatch === 1, v.r.o.slice(-300));
  t('verificação: site sem o artigo → pede deploy pelo gancho e o artigo aparece → tudo certo (saída 0)', v.ev.hook === 1 && v.r.code === 0 && v.u.acao === 'tudo_certo', JSON.stringify(v.u).slice(0, 200) + v.r.o.slice(-200));
  v = await verificar('tudo normal', { runs: [{ id: 1, status: 'completed', conclusion: 'success', created_at: '2026-10-02T11:00:00Z' }], siteTem: true });
  t('verificação: dia normal → não dispara, não pede deploy, saída 0', v.ev.dispatch === 0 && v.ev.hook === 0 && v.r.code === 0, v.r.o.slice(-200));
  v = await verificar('artigo atrasado (7 dias)', { runs: [{ id: 1, status: 'completed', conclusion: 'failure', created_at: '2026-10-09T11:00:00Z' }], siteTem: true, hoje: '2026-10-09' });
  t('verificação: artigo com mais de 3 dias → vermelho com causa na última linha', v.r.code === 1 && v.u.evento === 'diagnostico_final' && /dias que não sai artigo/.test(v.u.causa), JSON.stringify(v.u).slice(0, 250));
  v = await verificar('guia revisado hoje não zera o atraso', { runs: [{ id: 1, status: 'completed', conclusion: 'failure', created_at: '2026-10-09T11:00:00Z' }], siteTem: true, hoje: '2026-10-09', guiaRevisadoHoje: true });
  t('verificação: guia revisado (atualizado = hoje) NÃO conta como artigo novo: segue vermelho por atraso', v.r.code === 1 && /dias que não sai artigo/.test(v.u.causa), JSON.stringify(v.u).slice(0, 200));
  v = await verificar('site nunca mostra o artigo, sem gancho', { runs: [{ id: 1, status: 'completed', conclusion: 'success', created_at: '2026-10-02T11:00:00Z' }], siteTem: false, hook: false });
  t('verificação: deploy esgotado (sem gancho, só commit) → vermelho, exige pessoa, causa simples', v.r.code === 1 && v.u.precisa_de_humano === true && /Cloudflare Pages/.test(v.u.causa), JSON.stringify(v.u).slice(0, 250));
  console.log(`${ok} ok, ${bad} falha(s)`); process.exit(bad ? 1 : 0);
})();
