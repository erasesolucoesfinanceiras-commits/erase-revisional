#!/usr/bin/env node
// Diagnóstico (sem publicar nada): (1) testa modelos do Gemini SEM a busca do Google; (2) mostra o que o coletor de notícias
// encontra para cada tema (itens, páginas legíveis, datas), para saber se as fontes e os feeds estão funcionando.
const { TEMAS } = require('./temas');
const { coletar } = require('./fontes');
const key = process.env.GEMINI_API_KEY;
const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const curto = (t) => { try { const e = JSON.parse(t).error; return `${e.code} ${e.status}: ${String(e.message).slice(0, 120)}`; } catch (x) { return String(t).slice(0, 200); } };
(async () => {
  console.log('== 1) Modelos do Gemini (sem busca do Google)');
  for (const m of (process.env.DIAG_MODELOS || 'gemini-3.8-flash,gemini-3.7-flash,gemini-3.6-flash,gemini-3.5-flash,gemini-3-flash-preview,gemini-3.1-flash-lite').split(',')) {
    await new Promise((ok) => setTimeout(ok, 6000));
    const t0 = Date.now();
    const res = await fetch(`${BASE}/models/${m}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key || '' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Responda em JSON: {"ok": true}' }] }] }) });
    console.log(`${m} | HTTP ${res.status}${res.ok ? ' OK ' + (Date.now() - t0) + 'ms' : ' ' + curto(await res.text())}`);
  }
  console.log('\n== 2) Coleta de notícias por tema');
  for (const [tema, T] of Object.entries(TEMAS)) {
    const rel = [];
    const c = await coletar(tema, T, { hoje, diasMax: 14, relatorio: rel });
    console.log(`\n# ${tema}: ${c.length} fonte(s) legível(is)`);
    rel.slice(0, 14).forEach((l) => console.log('  ' + l));
    c.slice(0, 4).forEach((x) => console.log(`  [${x.id}] ${x.data} ${x.host} — ${x.titulo.slice(0, 70)} (${x.texto.length} caracteres)`));
  }
})().catch((e) => { console.error(e); process.exit(1); });
