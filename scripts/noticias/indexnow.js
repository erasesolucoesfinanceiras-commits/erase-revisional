#!/usr/bin/env node
// IndexNow: avisa o Bing (e parceiros) das páginas novas ou alteradas. Roda no workflow das notícias DEPOIS do push na main.
//   node scripts/noticias/indexnow.js
// - Só envia o que mudou: cada página tem uma "assinatura" feita dos DADOS (artigo, itens da categoria...), guardada em data/indexnow.json
//   quando o envio dá certo. Barra lateral/menus não contam, então um artigo novo não reenvia os outros artigos.
// - Só envia depois que a página já está no ar (200 e, nas listas, com o artigo novo dentro). Sem deploy a tempo: a URL continua
//   pendente (assinatura diferente da gravada) e o próximo run tenta de novo. Nada se perde.
// - NUNCA quebra o workflow: qualquer falha vira uma linha "indexnow" em data/noticias-log.jsonl e a saída é sempre 0.
// Variáveis (só para teste): INDEXNOW_TENTATIVAS (padrão 10), INDEXNOW_ESPERA_MS (padrão 30000), INDEXNOW_URL.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const S = require('../site');

const ROOT = S.ROOT;
const F_ESTADO = path.join(ROOT, 'data', 'indexnow.json');
const F_LOG = path.join(ROOT, 'data', 'noticias-log.jsonl');
const API = process.env.INDEXNOW_URL || 'https://api.indexnow.org/indexnow';
const sha = (x) => crypto.createHash('sha1').update(JSON.stringify(x)).digest('hex');
const maisNovo = (a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : String(a.slug || a.id) < String(b.slug || b.id) ? 1 : -1);

/** Páginas que o IndexNow acompanha: { url, sig, marca }. `marca` é um texto que a página no ar precisa conter (o item mais novo dela). */
function paginas({ artigos, notas, cats }) {
  const marcaDe = (x) => (x.slug ? `/noticias/${x.slug}` : x.id);
  const ordenados = (l) => [...l].sort(maisNovo);
  const fotoId = (x) => (x.foto && x.foto.id) || '';
  const itemSig = (x) => [x.slug || x.id, x.atualizado || '', fotoId(x)];
  const lista = (url, itens) => ({ url: S.absUrl(url), sig: sha(ordenados(itens).map(itemSig)), marca: itens.length ? marcaDe(ordenados(itens)[0]) : '' });
  const out = [];
  for (const a of artigos) out.push({ url: S.absUrl(S.artUrl(a)), sig: sha({ t: a.titulo, r: a.resumo, c: a.corpo, f: a.fontes, o: fotoId(a), u: a.atualizado || '', d: a.data }), marca: '' });
  out.push({ ...lista('/', ordenados([...artigos, ...notas]).slice(0, 12)), url: S.absUrl('/') }); // capa: os 12 itens mais novos
  out.push(lista('/artigos.html', artigos));
  out.push(lista('/radar.html', notas));
  for (const c of cats) out.push(lista(S.catUrl(c), [...artigos, ...notas].filter((x) => x.categoria === c)));
  return out;
}

const lerEstado = (f) => { try { const e = JSON.parse(fs.readFileSync(f, 'utf8')); return { enviados: e.enviados || {} }; } catch (e) { return { enviados: {} }; } };

function gravarLog(dados) {
  try {
    const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
    fs.appendFileSync(F_LOG, JSON.stringify({ quando: new Date().toISOString(), data: hoje, evento: 'indexnow', ...dados }) + '\n');
  } catch (e) { console.error('IndexNow: não consegui gravar o log: ' + e.message); }
}

/** Devolve o resumo do que fez; nunca lança. deps (teste): { http, dorme, log, dados, estadoFile, tentativas, esperaMs, key, siteUrl }. */
async function executar(deps = {}) {
  const log = deps.log || gravarLog, http = deps.http || fetch, dorme = deps.dorme || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const tentativas = deps.tentativas ?? Number(process.env.INDEXNOW_TENTATIVAS ?? 10), esperaMs = deps.esperaMs ?? Number(process.env.INDEXNOW_ESPERA_MS ?? 30000);
  const key = deps.key ?? S.config.indexnowKey, siteUrl = (deps.siteUrl ?? S.config.siteUrl).replace(/\/$/, ''), estadoFile = deps.estadoFile || F_ESTADO;
  try {
    if (!key) { log({ resultado: 'sem_chave' }); return { resultado: 'sem_chave' }; }
    const dados = deps.dados || { artigos: S.loadArticles(), notas: S.loadNotas(), cats: S.catsComItens() };
    const estado = lerEstado(estadoFile);
    const pendentes = paginas(dados).filter((p) => estado.enviados[p.url] !== p.sig);
    if (!pendentes.length) return { resultado: 'nada_novo' }; // nada mudou desde o último envio: não reenvia
    const keyLocation = `${siteUrl}/${key}.txt`;
    const noAr = async (url, marca, esperado) => {
      try {
        const r = await http(url, { redirect: 'follow', signal: AbortSignal.timeout(15000), headers: { 'user-agent': 'erase-indexnow-check' } });
        if (r.status !== 200) return false;
        const corpo = (marca || esperado) ? await r.text() : '';
        return esperado ? corpo.trim() === esperado : !marca || corpo.includes(marca);
      } catch (e) { return false; }
    };
    // espera o deploy: a chave e cada URL precisam estar no ar (algumas tentativas, com intervalo)
    let chaveOk = false, prontas = [];
    for (let t = 1; t <= tentativas; t++) {
      if (!chaveOk) chaveOk = await noAr(keyLocation, '', key);
      if (chaveOk) { const faltam = pendentes.filter((p) => !prontas.includes(p)); for (const p of faltam) if (await noAr(p.url, p.marca)) prontas.push(p); }
      if (chaveOk && prontas.length === pendentes.length) break;
      if (t < tentativas) await dorme(esperaMs);
    }
    const naoProntas = pendentes.filter((p) => !prontas.includes(p)).map((p) => p.url);
    if (!chaveOk || !prontas.length) { const r = { resultado: chaveOk ? 'deploy_nao_pronto' : 'chave_nao_publicada', pendentes: pendentes.length, aguardando: naoProntas.slice(0, 10) }; log(r); return r; }
    const resp = await http(API, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ host: new URL(siteUrl).host, key, keyLocation, urlList: prontas.map((p) => p.url) }), signal: AbortSignal.timeout(30000) });
    const texto = String(await resp.text().catch(() => '')).slice(0, 300);
    if (resp.status === 200 || resp.status === 202) {
      for (const p of prontas) estado.enviados[p.url] = p.sig;
      fs.writeFileSync(estadoFile, JSON.stringify(estado, null, 2) + '\n');
      const r = { resultado: 'enviado', status: resp.status, enviadas: prontas.length, ainda_pendentes: naoProntas.length, urls: prontas.map((p) => p.url).slice(0, 12) };
      log({ ...r, resposta: texto }); return r;
    }
    const r = { resultado: 'recusado', status: resp.status, tentadas: prontas.length, pendentes: pendentes.length };
    log({ ...r, resposta: texto }); return r; // as URLs seguem pendentes: o próximo run tenta de novo
  } catch (e) {
    const r = { resultado: 'erro', motivo: String(e.message).slice(0, 300) };
    try { log(r); } catch (x) { /* nunca quebra */ }
    return r;
  }
}

module.exports = { executar, paginas, lerEstado };

if (require.main === module) executar().then((r) => { console.log('IndexNow: ' + JSON.stringify(r)); process.exit(0); }, (e) => { console.error('IndexNow: ' + e.message); process.exit(0); });
