// node tests/noticias/alertas-test.js — alertas no Telegram: mensagem, limpeza, 1 aviso por problema, só main, workflows vigiados, motivo do log.
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const ler = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
let ok = 0, bad = 0; const t = (n, c, x = '') => { c ? ok++ : bad++; console.log(c ? 'OK   ' : 'FALHA', n, c ? '' : x); };
const HORA = 3600_000;

(async () => {
  const L = await import(path.join(ROOT, 'scripts/alertas/lib.mjs'));
  const W = await import(path.join(ROOT, 'scripts/alertas/workflows.mjs'));

  // ---- mensagem e limpeza
  t('mensagem começa com "Site revisional" e um ícone, e traz o link', L.montarMensagem({ nivel: 'erro', titulo: 'x', link: 'https://github.com/o/r/actions/runs/1' }).startsWith('Site revisional 🚨 ') && L.montarMensagem({ nivel: 'atencao', titulo: 'x' }).startsWith('Site revisional ⚠️ ') && L.montarMensagem({ nivel: 'ok', titulo: 'x' }).startsWith('Site revisional ✅ '));
  const sujo = 'falha com postgres://u:senha@db.x.co/p e eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoieCJ9.abc, Bearer abcdef123456, re_1234567890abcdef, joao@exemplo.com, CPF 123.456.789-09, ZZ_SEGREDO_LONGO_123, AIzaSyA1234567890abcdefghijklmnopqrstuv';
  const lim = L.limpar(sujo, ['ZZ_SEGREDO_LONGO_123']);
  t('limpeza tira token, chave, e-mail, CPF e URL de banco', !['postgres://', 'eyJ', 'abcdef123456', 're_1234567890', 'joao@', '123.456.789', 'ZZ_SEGREDO', 'AIzaSyA1234'].some((p) => lim.includes(p)), lim);
  const lk = L.limpar('veja https://github.com/o/r/actions/runs/43643663365/job/132596491117 e execução 43643663365 de 14/11/2026; tel (11) 98765-4321, +55 11 987654321');
  t('links do GitHub e número de execução saem inteiros; telefone é removido', lk.includes('https://github.com/o/r/actions/runs/43643663365/job/132596491117') && lk.includes('execução 43643663365') && lk.includes('14/11/2026') && !lk.includes('98765-4321') && !lk.includes('987654321'), lk);

  // ---- 1 aviso por problema, sem reenvio
  const ag = 1000 * HORA;
  t('problema novo avisa; aberto NUNCA é reenviado; resolvido fecha e avisa; sem problema aberto não manda resolvido',
    L.decidir({ aberto: undefined, nivel: 'erro', agora: ag }).acao === 'abrir' && L.decidir({ aberto: { numero: 1, ultimo: ag - 30 * 24 * HORA }, nivel: 'erro', agora: ag }).enviar === false && L.decidir({ aberto: { numero: 1, ultimo: ag }, nivel: 'ok', agora: ag }).acao === 'fechar' && L.decidir({ aberto: undefined, nivel: 'ok', agora: ag }).enviar === false);
  const env = [], cmds = []; process.env.GITHUB_REPOSITORY = 'o/r';
  const base = { chave: 'wf:Notícias automáticas@main', nivel: 'erro', titulo: 'Falhou: Notícias automáticas', linhas: [['Motivo', 'x']], enviar: async (m) => { env.push(m); }, exec: (a) => { cmds.push(a); return '[]'; } };
  const a1 = await L.avisar({ ...base, abertos: new Map(), agora: ag });
  const abertos = new Map([[base.chave, { numero: 7, ultimo: ag, titulo: 'Falhou: Notícias automáticas' }]]);
  const a2 = await L.avisar({ ...base, abertos, agora: ag + 5 * HORA });
  const a3 = await L.avisar({ ...base, nivel: 'ok', titulo: 'Resolvido', abertos, agora: ag + 6 * HORA });
  t('avisar: abre a Issue de estado, não reenvia, fecha ao resolver', a1 === 'abrir' && a2 === 'nada' && a3 === 'fechar' && env.length === 2 && cmds[0].slice(0, 2).join() === 'issue,create' && cmds.at(-1).slice(0, 3).join() === 'issue,close,7');
  let falhou = false; try { await L.avisar({ chave: 'k', nivel: 'erro', titulo: 't', abertos: new Map(), enviar: async () => { throw new Error('recusou'); }, exec: () => { cmds.push(['MUDOU']); return ''; } }); } catch { falhou = true; }
  t('se o Telegram falhar, o estado NÃO muda', falhou && !cmds.some((c) => c[0] === 'MUDOU'));

  // ---- Telegram: só vale com ok:true e o token nunca vaza
  const orig = global.fetch; const urls = [];
  try {
    global.fetch = async (u) => { urls.push(u); return { ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: 7, chat: { type: 'private', first_name: 'Fulano' } } }) }; };
    const r = await L.enviarTelegram('oi', { token: '123456:SEGREDO_DO_BOT_AAAA\n', chat: ' 555 ' });
    t('enviarTelegram devolve a confirmação e limpa espaço dos segredos', r.message_id === 7 && urls[0] === 'https://api.telegram.org/bot123456:SEGREDO_DO_BOT_AAAA/sendMessage');
    global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: false }) });
    let e1 = ''; try { await L.enviarTelegram('oi', { token: '123456:SEGREDO_DO_BOT_AAAA', chat: '555' }); } catch (e) { e1 = e.message; }
    global.fetch = async () => { throw new Error('falha em https://api.telegram.org/bot123456:SEGREDO_DO_BOT_AAAA/sendMessage'); };
    let e2 = ''; try { await L.enviarTelegram('oi', { token: '123456:SEGREDO_DO_BOT_AAAA', chat: '555' }); } catch (e) { e2 = e.message; }
    t('Telegram sem ok:true recusa; erro de rede nunca mostra o token', /recusou/.test(e1) && e2 && !/SEGREDO/.test(e2 + e1));
  } finally { global.fetch = orig; }

  // ---- motivo do log (caso real da execução #127, de 14/11/2026)
  const log = [
    '{"quando":"2026-11-14T21:49:53.598Z","data":"2026-11-14","evento":"gemini","modelo":"gemini-3.8-flash","status":429,"acao":"espera_e_repete","espera_s":70}',
    '{"quando":"2026-11-14T21:51:03.663Z","data":"2026-11-14","evento":"erro","tipo":"nota","motivo":"tempo do job esgotado esperando o Gemini"}',
    '{"quando":"2026-11-14T21:51:03.670Z","data":"2026-11-14","evento":"uso_gemini","pedidos":10,"ok":2,"por_status":{"429":4,"503":3}}',
  ].join('\n');
  const m = L.motivoDoLog(log, Date.parse('2026-11-14T21:51:11Z'));
  t('motivo do log: tempo esgotado esperando o Gemini + cota 429 e instabilidade 503', /tempo do job esgotado esperando o Gemini/.test(m) && /429\) 4 vez/.test(m) && /503\) 3 vez/.test(m), m);
  t('motivo do log: evento antigo (outro dia) não entra', L.motivoDoLog(log, Date.parse('2026-11-16T10:00:00Z')) === '');
  t('motivo pela etapa em português simples', /log do robô/.test(W.motivoPeloPasso('Falhar se houve erro', 'failure')) && /cancelada/.test(W.motivoPeloPasso('', 'cancelled')) && /tempo/.test(W.motivoPeloPasso('', 'timed_out')));

  // ---- todos os workflows vigiados, só main, permissões mínimas
  const dir = path.join(ROOT, '.github/workflows');
  const nomes = fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f) && f !== 'alertas-telegram.yml').map((f) => /^name:\s*(.+?)\s*$/m.exec(ler('.github/workflows/' + f))[1].replace(/^["']|["']$/g, ''));
  const wf = ler('.github/workflows/alertas-telegram.yml');
  const lista = /workflows:\s*\[(.*?)\]/.exec(wf)[1].split('",').map((s) => s.trim().replace(/^["']|["']$/g, ''));
  const faltam = nomes.filter((n) => !lista.includes(n) || !(n in W.WORKFLOWS)), sobram = lista.filter((n) => !nomes.includes(n));
  t(`TODO workflow do repositório está vigiado (${nomes.length}) e no mapa; workflow novo sem aviso reprova`, !faltam.length && !sobram.length, `faltam: ${faltam} | sobram: ${sobram}`);
  t('só a main: o job filtra head_branch == main; dispara em falha, cancelamento e tempo esgotado; vigia horária', wf.includes("github.event.workflow_run.head_branch == 'main'") && wf.includes('["failure","cancelled","timed_out"]') && /cron: "7 \* \* \* \*"/.test(wf));
  const linhas = wf.split('\n'); let exprEmRun = false;
  linhas.forEach((l, i) => { if (!/^\s+run:/.test(l)) return; const ind = l.search(/\S/), bloco = [l]; for (let j = i + 1; j < linhas.length && (linhas[j].trim() === '' || linhas[j].search(/\S/) > ind); j++) bloco.push(linhas[j]); if (/\$\{\{/.test(bloco.join('\n'))) exprEmRun = true; });
  t('permissões mínimas, ações fixas por hash, checkout sem credencial, nada de ${{ }} dentro de run:, sem pull_request', /permissions:\n  contents: read\n  actions: read\n  issues: write/.test(wf) && /actions\/checkout@[0-9a-f]{40}/.test(wf) && wf.includes('persist-credentials: false') && !exprEmRun && !/pull_request/.test(wf));
  t('segredos só pelos nomes combinados; nenhum token no código', wf.includes('secrets.ALERTA_TELEGRAM_TOKEN') && wf.includes('secrets.ALERTA_TELEGRAM_CHAT_ID') && !/\b\d{9,}:[A-Za-z0-9_-]{30,}\b/.test(['lib', 'falha', 'vigia'].map((f) => ler(`scripts/alertas/${f}.mjs`)).join('')));
  t('a vigia só lê: nada de escrita em páginas, artigos, dados ou git', !/writeFileSync|appendFileSync|git (add|commit|push)|rmSync/.test(['lib', 'falha', 'vigia'].map((f) => ler(`scripts/alertas/${f}.mjs`)).join('')));

  // ---- falha.mjs: ramo de trabalho e execução antiga não avisam (nem chamam GitHub/Telegram)
  const rodar = (env) => execFileSync('node', ['scripts/alertas/falha.mjs'], { cwd: ROOT, encoding: 'utf8', env: { PATH: process.env.PATH, GITHUB_REPOSITORY: 'o/r', WF_NOME: 'Notícias automáticas', WF_CONCLUSAO: 'failure', ...env } });
  t('ramo de trabalho (claude/*, pull request) e execução com mais de 6 h não avisam', /sem aviso/.test(rodar({ WF_BRANCH: 'claude/sharp-planck-abc', WF_EVENTO: 'workflow_dispatch' })) && /antiga/.test(rodar({ WF_BRANCH: 'main', WF_EVENTO: 'schedule', WF_FIM: '2020-01-01T00:00:00Z' })));

  console.log(`${ok} ok, ${bad} falha(s)`); process.exit(bad ? 1 : 0);
})();
