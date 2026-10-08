#!/usr/bin/env node
// Diagnóstico da chave do Gemini: lista os modelos "flash" disponíveis e testa cada um sem e com busca do Google.
// Mostra o status e o motivo de cada erro (cota, modelo encerrado etc.). Não grava nada.
const key = process.env.GEMINI_API_KEY;
const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const H = { 'Content-Type': 'application/json', 'x-goog-api-key': key };
const curto = (t) => { try { const e = JSON.parse(t).error; return `${e.code} ${e.status}: ${String(e.message).slice(0, 160)} | ${JSON.stringify(e.details || []).slice(0, 500)}`; } catch (x) { return String(t).slice(0, 300); } };
(async () => {
  if (!key) { console.error('GEMINI_API_KEY ausente'); process.exit(1); }
  const r = await fetch(`${BASE}/models?pageSize=200`, { headers: H });
  const lista = r.ok ? (await r.json()).models.filter((m) => /flash/.test(m.name) && (m.supportedGenerationMethods || []).includes('generateContent')).map((m) => m.name.replace('models/', '')) : [];
  console.log('Modelos flash com generateContent:', lista.join(', ') || `(falha ao listar: ${r.status} ${curto(await r.text())})`);
  for (const m of lista.slice(0, 12)) {
    for (const busca of [false, true]) {
      await new Promise((ok) => setTimeout(ok, 6000));
      const res = await fetch(`${BASE}/models/${m}:generateContent`, { method: 'POST', headers: H, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Responda apenas: ok' }] }], ...(busca && { tools: [{ google_search: {} }] }) }) });
      console.log(`${m} | busca=${busca} | HTTP ${res.status}${res.ok ? ' OK' : ' ' + curto(await res.text())}`);
    }
  }
})().catch((e) => { console.error(e); process.exit(1); });
