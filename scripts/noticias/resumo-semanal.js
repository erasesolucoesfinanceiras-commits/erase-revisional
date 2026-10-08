#!/usr/bin/env node
// Resumo semanal por e-mail (Resend): o que foi publicado, quantos textos foram reprovados e por quê, temas sem publicação.
//   node scripts/noticias/resumo-semanal.js          (usa data/noticias-log.jsonl, últimos 7 dias; segunda de manhã pelo resumo-semanal.yml)
//   TESTE=1 node scripts/noticias/resumo-semanal.js  (usa amostras/: e-mail de teste, nada foi publicado)
// Secrets: RESEND_API_KEY, ALERTA_EMAIL_PARA (vírgula separa vários), ALERTA_EMAIL_DE (opcional).
const fs = require('fs');
const path = require('path');
const { TEMAS } = require('./temas');

const ROOT = path.join(__dirname, '..', '..');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'config.json'), 'utf8'));
const site = config.siteUrl.replace(/\/$/, '');
const TESTE = process.env.TESTE === '1';
const DIAS = Number(process.env.DIAS || 7);
const hoje = new Date(Date.now() - 3 * 3600e3);
const desde = new Date(hoje.getTime() - DIAS * 864e5).toISOString().slice(0, 10);
const fmt = (iso) => iso.split('-').reverse().slice(0, 2).join('/');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const lerLog = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const motivoCurto = (m) => {
  m = String(m);
  if (/^copia trecho/.test(m)) return 'texto copiado da fonte';
  if (/^número\(s\)/.test(m)) return 'número que não está nas fontes';
  if (/^menção política|^termo carregado/.test(m)) return 'política/termo carregado';
  if (/^repete assunto|^usa a mesma fonte/.test(m)) return 'assunto repetido';
  if (/^só fontes regionais/.test(m)) return 'só fontes regionais';
  if (/^menos de 2 fontes|^citou fonte/.test(m)) return 'fontes insuficientes';
  if (/^promete|^cita escritório/.test(m)) return 'promessa/conselho/parceiro';
  if (/^neutralidade\//.test(m)) return 'neutralidade (revisor)';
  const k = /^([a-z_]+):/.exec(m); if (k) return `revisor: ${k[1]}`;
  return m.slice(0, 50);
};

let eventos, publicados;
if (TESTE) {
  const dir = path.join(ROOT, 'amostras');
  eventos = lerLog(path.join(dir, 'log.jsonl'));
  publicados = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^\d+-.*\.json$/.test(f)).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))).map((a) => ({ tipo: a.tipo, tema: a.tema, titulo: a.rascunho.titulo, link: (a.rascunho.fontes[0] || {}).url || site, data: eventos[0] ? eventos[0].data : '' })) : [];
} else {
  eventos = lerLog(path.join(ROOT, 'data', 'noticias-log.jsonl')).filter((e) => e.data >= desde);
  publicados = eventos.filter((e) => e.evento === 'publicado').map((e) => ({ tipo: e.tipo, tema: e.tema, titulo: e.titulo, data: e.data, link: e.tipo === 'artigo' ? `${site}/noticias/${e.slug}` : `${site}/radar#${e.id}` }));
}
const reprovados = eventos.filter((e) => e.evento === 'reprovado');
const porMotivo = {};
for (const e of reprovados) for (const m of new Set((e.motivos || []).map(motivoCurto))) porMotivo[m] = (porMotivo[m] || 0) + 1;
const erros = eventos.filter((e) => e.evento === 'erro').length;
const temasComPublicacao = new Set(publicados.map((p) => p.tema));
const semPublicacao = Object.keys(TEMAS).filter((t) => !temasComPublicacao.has(t)).map((t) => {
  const pulos = eventos.filter((e) => e.evento === 'pulado' && e.tema === t).length, reps = reprovados.filter((e) => e.tema === t).length;
  return `${config.categorias[t].nome}${pulos || reps ? ` (${pulos} sem novidade, ${reps} reprovado${reps === 1 ? '' : 's'})` : ''}`;
});

const periodo = TESTE ? 'TESTE com as amostras' : `${fmt(desde)} a ${fmt(hoje.toISOString().slice(0, 10))}`;
const artigos = publicados.filter((p) => p.tipo === 'artigo'), notas = publicados.filter((p) => p.tipo === 'nota');
const lista = (arr) => arr.length ? arr.map((p) => `<li style="margin:0 0 8px"><a href="${esc(p.link)}" style="color:#0a6cb3">${esc(p.titulo)}</a><br><span style="color:#666;font-size:13px">${esc(config.categorias[p.tema].nome)} · ${esc(p.data ? fmt(p.data) : '')}</span></li>`).join('') : '<li style="color:#666">Nada publicado.</li>';
const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:16px;color:#111;line-height:1.45">
<h2 style="margin:0 0 4px;font-size:20px">Resumo semanal · ERASE Revisional</h2>
<p style="margin:0 0 16px;color:#666;font-size:14px">${esc(periodo)}${TESTE ? ' — nada foi publicado, são as amostras de teste' : ''}</p>
<p style="margin:0 0 6px"><b>${artigos.length}</b> artigo(s) · <b>${notas.length}</b> nota(s) · <b>${reprovados.length}</b> reprovado(s)${erros ? ` · <b style="color:#b91c1c">${erros} erro(s)</b>` : ''}</p>
<h3 style="font-size:16px;margin:18px 0 6px">Artigos publicados</h3><ul style="padding-left:18px;margin:0">${lista(artigos)}</ul>
<h3 style="font-size:16px;margin:18px 0 6px">Notas do Radar</h3><ul style="padding-left:18px;margin:0">${lista(notas)}</ul>
<h3 style="font-size:16px;margin:18px 0 6px">Reprovados, por motivo</h3>
${Object.keys(porMotivo).length ? '<ul style="padding-left:18px;margin:0">' + Object.entries(porMotivo).sort((a, b) => b[1] - a[1]).map(([m, n]) => `<li>${esc(m)}: <b>${n}</b></li>`).join('') + '</ul>' : '<p style="margin:0;color:#666">Nenhum.</p>'}
<h3 style="font-size:16px;margin:18px 0 6px">Temas sem publicação</h3>
${semPublicacao.length ? '<ul style="padding-left:18px;margin:0">' + semPublicacao.map((t) => `<li>${esc(t)}</li>`).join('') + '</ul>' : '<p style="margin:0;color:#666">Todos os temas tiveram publicação.</p>'}
<p style="margin:22px 0 0;color:#888;font-size:12px">Para tirar um texto do ar: GitHub → Actions → "Despublicar texto" → informe o endereço.</p></div>`;

(async () => {
  console.log(`Resumo ${periodo}: ${artigos.length} artigos, ${notas.length} notas, ${reprovados.length} reprovados, ${erros} erros.`);
  const { RESEND_API_KEY, ALERTA_EMAIL_PARA, ALERTA_EMAIL_DE } = process.env;
  if (!RESEND_API_KEY || !ALERTA_EMAIL_PARA) { console.error('RESEND_API_KEY / ALERTA_EMAIL_PARA ausentes: e-mail NÃO enviado.'); process.exit(TESTE ? 1 : 0); }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: ALERTA_EMAIL_DE || 'ERASE Revisional <onboarding@resend.dev>', to: ALERTA_EMAIL_PARA.split(',').map((s) => s.trim()), subject: `${TESTE ? '[TESTE] ' : ''}Resumo semanal ERASE Revisional · ${periodo}`, html }),
  });
  console.log(r.ok ? 'E-mail enviado.' : `Resend recusou: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
  if (!r.ok) process.exit(1);
})().catch((e) => { console.error(e.message); process.exit(1); });
