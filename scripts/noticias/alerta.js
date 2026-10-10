#!/usr/bin/env node
// Avisa por e-mail (Resend): na hora, se o problema exige uma pessoa (CAUSA_HUMANA: chave inválida, conta suspensa, plano encerrado);
// ou quando o workflow de notícias fecha 3 dias seguidos com falha (e a cada 3 depois). Como há 3 rodadas por dia, conta DIAS:
// um dia falhou se a última execução dele terminou em falha. Secrets: RESEND_API_KEY, ALERTA_EMAIL_PARA, ALERTA_EMAIL_DE (opcional).
const { GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_RUN_ID, RESEND_API_KEY, ALERTA_EMAIL_PARA, ALERTA_EMAIL_DE, CAUSA_HUMANA } = process.env;
const WORKFLOW = 'noticias.yml';
const diaBR = (iso) => new Date(Date.parse(iso) - 3 * 3600e3).toISOString().slice(0, 10);

/** Dias seguidos com falha imediatamente antes de hoje (a última execução concluída de cada dia decide). */
function diasFalhosAntesDeHoje(runs, hoje) {
  const porDia = new Map();
  for (const x of runs) { const d = diaBR(x.created_at); if (d !== hoje && !porDia.has(d)) porDia.set(d, x.conclusion); } // runs vêm do mais novo ao mais antigo
  let n = 0;
  for (const d of [...porDia.keys()].sort().reverse()) { if (porDia.get(d) === 'failure') n++; else break; }
  return n;
}

(async () => {
  const hoje = diaBR(new Date().toISOString());
  const r = await fetch(`https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/workflows/${WORKFLOW}/runs?per_page=40`, {
    headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' },
  });
  if (!r.ok) throw new Error('GitHub API HTTP ' + r.status);
  const runs = (await r.json()).workflow_runs.filter((x) => String(x.id) !== String(GITHUB_RUN_ID) && x.status === 'completed');
  const seguidas = diasFalhosAntesDeHoje(runs, hoje) + 1; // hoje também falhou
  console.log(`Dias seguidos com falha: ${seguidas}${CAUSA_HUMANA ? ' | exige pessoa: ' + CAUSA_HUMANA : ''}`);
  if (!CAUSA_HUMANA && seguidas % 3 !== 0) return;
  if (!RESEND_API_KEY || !ALERTA_EMAIL_PARA) { console.error('Secrets RESEND_API_KEY / ALERTA_EMAIL_PARA ausentes: e-mail NÃO enviado.'); return; }
  const url = `https://github.com/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`;
  const e = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: ALERTA_EMAIL_DE || 'ERASE Revisional <onboarding@resend.dev>',
      to: ALERTA_EMAIL_PARA.split(',').map((s) => s.trim()),
      subject: CAUSA_HUMANA ? 'Notícias automáticas do ERASE Revisional precisam de você' : `Notícias automáticas do ERASE Revisional falharam ${seguidas} dias seguidos`,
      html: CAUSA_HUMANA
        ? `<p><b>Isto o robô não resolve sozinho:</b> ${CAUSA_HUMANA}</p><p>Detalhes e o que fazer estão na última linha de <code>data/noticias-log.jsonl</code> e no run: <a href="${url}">${url}</a></p>`
        : `<p>O workflow de notícias automáticas fechou ${seguidas} dias seguidos sem publicar o artigo, depois de esgotar todas as saídas automáticas (outro modelo, outro tema, outras rodadas).</p><p>Veja o diagnóstico: <a href="${url}">${url}</a> e a última linha de <code>data/noticias-log.jsonl</code>.</p>`,
    }),
  });
  console.log(e.ok ? 'E-mail de alerta enviado.' : 'Resend recusou: HTTP ' + e.status + ' ' + (await e.text()).slice(0, 200));
})().catch((e) => { console.error('Alerta falhou:', e.message); });
