// Relatório de cota/custo do Gemini e de rendimento por tema, a partir de data/noticias-log.jsonl.  Uso: node scripts/noticias/medir.js
const fs = require('fs'), path = require('path');
const linhas = fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'noticias-log.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
const dias = {}, temas = {};
const d = (x) => (dias[x.data] = dias[x.data] || { publicados: 0, tema_trocado: 0, pulados: 0, reprovados: 0, pedidos: 0, ok: 0, erros_gemini: {} });
const t = (x) => (temas[x] = temas[x] || { publicados: 0, pulados: 0, reprovados: 0 });
for (const x of linhas) {
  const r = d(x);
  if (x.evento === 'publicado') { r.publicados++; t(x.tema).publicados++; }
  else if (x.evento === 'pulado') { r.pulados++; t(x.tema).pulados++; }
  else if (x.evento === 'reprovado') { r.reprovados++; t(x.tema).reprovados++; }
  else if (x.evento === 'tema_trocado') r.tema_trocado++;
  else if (x.evento === 'gemini') r.erros_gemini[x.status] = (r.erros_gemini[x.status] || 0) + 1;
  else if (x.evento === 'uso_gemini') { r.pedidos += x.pedidos || 0; r.ok += x.ok || 0; }
}
console.log('Por dia (pedidos/ok só existem a partir do evento "uso_gemini"; antes disso só há os erros):');
console.table(dias);
console.log('Por tema:');
console.table(temas);
