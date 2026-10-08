#!/usr/bin/env node
// Avisa por e-mail (Resend) quando o workflow de notícias falha 3 dias seguidos (e a cada 3 falhas seguidas depois).
// Lê o histórico de execuções pela API do GitHub. Secrets: RESEND_API_KEY, ALERTA_EMAIL_PARA, ALERTA_EMAIL_DE (opcional).
const { GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_RUN_ID, RESEND_API_KEY, ALERTA_EMAIL_PARA, ALERTA_EMAIL_DE } = process.env;
const WORKFLOW = 'noticias.yml';

(async () => {
  const r = await fetch(`https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/workflows/${WORKFLOW}/runs?per_page=15&event=schedule`, {
    headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' },
  });
  if (!r.ok) throw new Error('GitHub API HTTP ' + r.status);
  const runs = (await r.json()).workflow_runs.filter((x) => String(x.id) !== String(GITHUB_RUN_ID) && x.status === 'completed');
  let anteriores = 0; // falhas seguidas imediatamente antes desta
  for (const x of runs) { if (x.conclusion === 'failure') anteriores++; else break; }
  const seguidas = anteriores + 1; // esta execução também falhou
  console.log(`Falhas seguidas: ${seguidas}`);
  if (seguidas % 3 !== 0) return;
  if (!RESEND_API_KEY || !ALERTA_EMAIL_PARA) { console.error('Secrets RESEND_API_KEY / ALERTA_EMAIL_PARA ausentes: e-mail NÃO enviado.'); return; }
  const url = `https://github.com/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`;
  const e = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: ALERTA_EMAIL_DE || 'ERASE Revisional <onboarding@resend.dev>',
      to: ALERTA_EMAIL_PARA.split(',').map((s) => s.trim()),
      subject: `Notícias automáticas do ERASE Revisional falharam ${seguidas} dias seguidos`,
      html: `<p>O workflow de notícias automáticas falhou ${seguidas} vezes seguidas.</p><p>Veja o motivo no log: <a href="${url}">${url}</a></p><p>Causas comuns: chave GEMINI_API_KEY inválida ou sem cota, erro no build do site ou instabilidade da API.</p>`,
    }),
  });
  console.log(e.ok ? 'E-mail de alerta enviado.' : 'Resend recusou: HTTP ' + e.status + ' ' + (await e.text()).slice(0, 200));
})().catch((e) => { console.error('Alerta falhou:', e.message); });
