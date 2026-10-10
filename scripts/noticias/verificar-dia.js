#!/usr/bin/env node
// Verificação diária (rede de segurança do sistema de artigos). Em ordem, sem pedir ajuda enquanto houver saída automática:
//  1. o agendamento disparou hoje? Se não, dispara a geração (workflow_dispatch) e espera terminar;
//  2. as rodadas do dia acabaram sem artigo e ele já está atrasado? Dispara uma rodada extra (exceto se o motivo exige uma pessoa);
//  3. o artigo mais recente está na capa do site NO AR? Se não, pede novo deploy ao Cloudflare Pages (gancho → API → commit) e confere de novo;
//  4. o último artigo tem mais de 3 dias? Run vermelho;
//  5. registra atividade diária (data/heartbeat.json) para o GitHub não desativar os workflows agendados após 60 dias sem atividade.
// Só falha (exit 1) quando as saídas esgotam; a causa, em linguagem simples, vai na última linha de data/noticias-log.jsonl.
// Variáveis: GITHUB_TOKEN, GITHUB_REPOSITORY; opcionais: CF_DEPLOY_HOOK_URL | (CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_PAGES_PROJECT).
// Só para testes: GITHUB_API, SITE_URL, CF_API, DATA, DADOS_DIR, SEM_GIT=1, VERIF_ESPERA_MS, VERIF_ESCALA.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const EST = require('./estatisticas');

const REPO = process.env.GITHUB_REPOSITORY, TOKEN = process.env.GITHUB_TOKEN;
const API = process.env.GITHUB_API || 'https://api.github.com';
const SITE = (process.env.SITE_URL || 'https://revisional.eraseconsulta.com.br').replace(/\/$/, '');
const CF = process.env.CF_API || 'https://api.cloudflare.com/client/v4';
const BRANCH = process.env.GITHUB_REF_NAME || 'main';
const ESPERA = Number(process.env.VERIF_ESPERA_MS ?? 30000);
const ESC = Number(process.env.VERIF_ESCALA ?? 1); // multiplica os limites de espera em minutos (testes)
const ROOT = path.join(__dirname, '..', '..');
const DATA_DIR = process.env.DADOS_DIR || path.join(ROOT, 'data');
const F_ART = path.join(DATA_DIR, 'articles.json'), F_LOG = path.join(DATA_DIR, 'noticias-log.jsonl'), F_BEAT = path.join(DATA_DIR, 'heartbeat.json');
const diaBR = (ms) => new Date(ms - 3 * 3600e3).toISOString().slice(0, 10);
const hoje = process.env.DATA || diaBR(Date.now());
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
const lerArtigos = () => JSON.parse(fs.readFileSync(F_ART, 'utf8'));
// Atraso e conferência do site usam SÓ a data de publicação (`data`): guia revisado ganha `atualizado`, que NUNCA entra nesta conta.
const maisRecente = (arts) => arts.reduce((m, a) => (!m || a.data > m.data ? a : m), null);
const diasEntre = (d) => Math.floor((Date.parse(hoje) - Date.parse(d)) / 864e5);

function log(evento, dados) {
  fs.appendFileSync(F_LOG, JSON.stringify({ quando: new Date().toISOString(), data: hoje, evento, origem: 'verificacao-diaria', ...dados }) + '\n');
  console.log(`[${evento}] ${dados.acao || ''} ${dados.motivo || dados.causa || ''}`);
}
function ultimaLinhaDoLog() {
  try { const l = fs.readFileSync(F_LOG, 'utf8').trim().split('\n').filter(Boolean); return JSON.parse(l[l.length - 1]); } catch (e) { return null; }
}
const gh = (p, opts = {}) => fetch(`${API}/repos/${REPO}${p}`, { ...opts, headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' } });
const git = (...a) => (process.env.SEM_GIT ? '' : execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));

async function execucoes() {
  const r = await gh('/actions/workflows/noticias.yml/runs?per_page=30');
  if (!r.ok) throw new Error('GitHub API HTTP ' + r.status);
  return (await r.json()).workflow_runs;
}
/** Espera as execuções do workflow de notícias em andamento (ou a disparada agora) terminarem. Devolve false se estourar o tempo. */
async function esperarTerminar(desde, limiteMin = 70) {
  const fim = Date.now() + limiteMin * 60e3 * ESC;
  while (Date.now() < fim) {
    const runs = (await execucoes()).filter((x) => Date.parse(x.created_at) >= desde - 90e3 || x.status !== 'completed');
    if (runs.length && runs.every((x) => x.status === 'completed')) return true;
    await dorme(ESPERA * 2);
  }
  return false;
}
async function disparar(motivo) {
  const t0 = Date.now();
  const r = await gh('/actions/workflows/noticias.yml/dispatches', { method: 'POST', body: JSON.stringify({ ref: BRANCH, inputs: { modo: 'publicar', rodada: 'final' } }) });
  if (!r.ok) { log('verificacao', { acao: 'disparo_falhou', motivo: `GitHub recusou o disparo (HTTP ${r.status})` }); return null; }
  log('verificacao', { acao: 'disparou_geracao', motivo });
  await dorme(ESPERA / 3);
  return t0;
}

/** Versões (hash) do CSS e do JS que a capa do repositório referencia: o site no ar tem de servir as mesmas, senão ainda é uma versão antiga. */
function versoesDoRepositorio() {
  try { const h = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'); return [/\/assets\/js\/main\.js\?v=[0-9a-f]+/.exec(h), /\/assets\/css\/style\.css\?v=[0-9a-f]+/.exec(h)].filter(Boolean).map((m) => m[0]); } catch (e) { return []; }
}
/** A capa no ar mostra o artigo mais recente E a versão atual do site (CSS/JS)? */
async function siteTemArtigo(slug) {
  try {
    const r = await fetch(`${SITE}/?v=${Date.now()}`, { headers: { 'Cache-Control': 'no-cache', 'User-Agent': 'erase-verificacao-diaria' } });
    if (!r.ok) return false;
    const html = await r.text();
    return html.includes(`/noticias/${slug}`) && versoesDoRepositorio().every((v) => html.includes(v));
  } catch (e) { return false; }
}
async function esperarSite(slug, minutos) {
  const fim = Date.now() + minutos * 60e3 * ESC;
  do { if (await siteTemArtigo(slug)) return true; await dorme(ESPERA); } while (Date.now() < fim);
  return false;
}
/** Pede novo deploy ao Cloudflare Pages: gancho (deploy hook) → API → commit (o Pages publica a cada push na main). */
async function pedirDeploy() {
  const tentativas = [];
  if (process.env.CF_DEPLOY_HOOK_URL) tentativas.push(['gancho_de_deploy', async () => (await fetch(process.env.CF_DEPLOY_HOOK_URL, { method: 'POST' })).ok]);
  const { CLOUDFLARE_API_TOKEN: tk, CLOUDFLARE_ACCOUNT_ID: ac, CLOUDFLARE_PAGES_PROJECT: pj } = process.env;
  if (tk && ac && pj) tentativas.push(['api_cloudflare', async () => (await fetch(`${CF}/accounts/${ac}/pages/projects/${pj}/deployments`, { method: 'POST', headers: { Authorization: `Bearer ${tk}` } })).ok]);
  tentativas.push(['commit', async () => { registrarAtividade('novo deploy pedido por commit'); return true; }]);
  return tentativas;
}

let atividadeRegistrada = false;
function registrarAtividade(motivo) {
  fs.writeFileSync(F_BEAT, JSON.stringify({ data: hoje, quando: new Date().toISOString(), motivo }, null, 2) + '\n');
  atividadeRegistrada = true;
  if (!process.env.SEM_GIT) execFileSync('bash', [path.join(__dirname, 'gravar.sh'), `Verificação diária ${hoje}: ${motivo}`], { stdio: 'inherit', env: { ...process.env, BRANCH } });
}

(async () => {
  const problemas = []; // { causa, acao, humano }
  try { git('pull', '--ff-only', 'origin', BRANCH); } catch (e) { /* segue com o que há */ }
  let arts = lerArtigos(), ult = maisRecente(arts);
  let dias = ult ? diasEntre(ult.data) : Infinity;

  // 1 e 2: a geração rodou?
  let runs = await execucoes();
  const deHoje = runs.filter((x) => diaBR(Date.parse(x.created_at)) === hoje), andando = runs.some((x) => x.status !== 'completed');
  const linha = ultimaLinhaDoLog();
  const exigePessoa = linha && linha.evento === 'diagnostico_final' && linha.precisa_de_humano && linha.data === hoje;
  let desde = null;
  if (andando) { log('verificacao', { acao: 'esperando_execucao_em_andamento', motivo: 'há uma geração rodando agora' }); desde = Date.now() - 3600e3; }
  else if (!deHoje.length) desde = await disparar('o horário agendado não disparou hoje');
  else if (!arts.some((a) => a.data === hoje) && dias >= 2 && !exigePessoa) desde = await disparar('as rodadas do dia terminaram sem artigo e ele já está atrasado: rodada extra');
  if (desde) {
    const ok = await esperarTerminar(desde);
    if (!ok) log('verificacao', { acao: 'espera_estourou', motivo: 'a geração não terminou no tempo previsto' });
    try { git('pull', '--ff-only', 'origin', BRANCH); } catch (e) { /* ignore */ }
    arts = lerArtigos(); ult = maisRecente(arts); dias = ult ? diasEntre(ult.data) : Infinity;
  }

  // 4: atraso do artigo
  if (dias > 3) {
    const l = ultimaLinhaDoLog();
    problemas.push({ humano: !!(l && l.precisa_de_humano), causa: `Faz ${dias} dias que não sai artigo novo (o último é de ${ult ? ult.data : 'nunca'}). ${l && l.causa ? 'Último diagnóstico: ' + l.causa : 'As rodadas automáticas não conseguiram publicar.'}`, acao: l && l.acao ? l.acao : 'Ler as linhas "tema_trocado", "reprovado" e "gemini" em data/noticias-log.jsonl e rodar o workflow "Notícias automáticas" manualmente com forcar_artigo.' });
  }

  // 3: o artigo está na capa do site no ar?
  if (ult && !(await esperarSite(ult.slug, 1))) {
    log('verificacao', { acao: 'artigo_fora_do_site', motivo: `a capa de ${SITE} não mostra o artigo "${ult.slug}" ou ainda serve uma versão antiga do site (CSS/JS)` });
    let apareceu = false;
    for (const [nome, executar] of await pedirDeploy()) {
      let ok = false; try { ok = await executar(); } catch (e) { /* tenta o próximo */ }
      log('verificacao', { acao: 'redeploy_' + nome, motivo: ok ? 'pedido enviado' : 'não funcionou, tentando a próxima saída' });
      if (!ok) continue;
      apareceu = await esperarSite(ult.slug, 8);
      log('verificacao', { acao: 'conferiu_site_apos_' + nome, motivo: apareceu ? 'artigo já aparece na capa' : 'ainda não aparece' });
      if (apareceu) break;
    }
    if (!apareceu) problemas.push({ humano: true, causa: 'O repositório está atualizado, mas a capa do site no ar não mostra o artigo mais recente ou a versão atual do site, mesmo depois de pedir novo deploy ao Cloudflare Pages.', acao: 'Abrir o projeto no Cloudflare Pages: ver se o último build falhou, se a integração com o GitHub está ativa e se o domínio revisional.eraseconsulta.com.br aponta para este projeto. Para pedir novo deploy sem commit, criar o secret CF_DEPLOY_HOOK_URL (Settings > Builds > Deploy hooks).' });
  }

  // resumo semanal do revisor (segundas-feiras, ou sempre que RESUMO_REVISOR estiver definido): aprovados/reprovados por critério
  if (new Date(hoje + 'T12:00:00Z').getUTCDay() === 1 || process.env.RESUMO_REVISOR) {
    const r = EST.resumo(path.join(DATA_DIR, 'revisor-stats.json'), hoje);
    log('resumo_revisor_semana', { motivo: `Revisor de ${r.de} a ${r.ate}: ${r.texto}`, de: r.de, ate: r.ate, por_tipo: r.por_tipo });
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Revisor, semana ${r.de} a ${r.ate}\n\n${r.texto.split(' || ').map((l) => '- ' + l).join('\n')}\n`);
  }

  // fecha: diagnóstico (última linha do log) e atividade diária
  if (problemas.length) {
    const p = problemas[0];
    log('diagnostico_final', { precisa_de_humano: problemas.some((x) => x.humano), causa: problemas.map((x) => x.causa).join(' | '), acao: p.acao });
    console.log(`::error::${problemas.map((x) => x.causa).join(' | ')} ${p.acao}`);
  } else log('verificacao', { acao: 'tudo_certo', motivo: `último artigo ${ult ? ult.data : '—'} (${dias} dia(s)), na capa do site` });
  if (!atividadeRegistrada) registrarAtividade('registro diário de atividade');
  process.exit(problemas.length ? 1 : 0);
})().catch((e) => { console.error(e); try { log('diagnostico_final', { precisa_de_humano: false, causa: 'A própria verificação diária falhou: ' + String(e.message).slice(0, 200), acao: 'Abrir o run "Verificar artigo recente" no GitHub Actions.' }); } catch (x) { /* ignore */ } process.exit(1); });
