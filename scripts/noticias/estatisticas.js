// Contagem do revisor por dia e por critério (data/revisor-stats.json) e resumo semanal para os logs.
const fs = require('fs');

// Motivo de reprovação (texto livre das verificações do código) -> chave do critério. Os do revisor por IA já vêm como "chave: motivo".
const MAPA = [
  [/^(título ausente|nota com |artigo com |resumo ausente)/, 'forma'],
  [/^promete resultado|^cita escritório/, 'sem_promessa'],
  [/^menção política|^termo carregado/, 'neutro'],
  [/^frase genérica/, 'sem_generico'],
  [/^texto com assinatura/, 'sem_autor'],
  [/^repete assunto|^usa a mesma fonte/, 'sem_repeticao'],
  [/^copia trecho/, 'original'],
  [/^número\(s\) que não aparecem/, 'fatos'],
  [/^citou fonte|^menos de 2 fontes|^só fontes regionais|^guia exige/, 'fontes'],
  [/^conteúdo inseguro/, 'seguro'],
  [/^resposta fora do formato/, 'formato'],
  [/^revisor devolveu resposta inválida/, 'revisor_invalido'],
  [/^neutralidade\/([a-z_]+)/, null],
];
function chaveDoMotivo(m) {
  const t = String(m).trim();
  for (const [re, k] of MAPA) { const x = re.exec(t); if (x) return k === null ? 'neutralidade/' + x[1] : k; }
  const llm = /^([a-z_]+):/.exec(t); // "fatos: ..." (revisor por IA)
  return llm ? llm[1] : 'outro';
}
const chaves = (motivos) => [...new Set(motivos.map(chaveDoMotivo))];

const ler = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return {}; } };
function registrar(f, dia, tipo, { aprovado, motivos = [], semNovidade = false }) {
  const st = ler(f), d = (st[dia] = st[dia] || {}), t = (d[tipo] = d[tipo] || { aprovados: 0, reprovados: 0, sem_novidade: 0, criterios: {} });
  if (semNovidade) t.sem_novidade++;
  else if (aprovado) t.aprovados++;
  else { t.reprovados++; for (const k of chaves(motivos)) t.criterios[k] = (t.criterios[k] || 0) + 1; }
  for (const k of Object.keys(st).sort().slice(0, -90)) delete st[k]; // guarda os últimos 90 dias
  fs.writeFileSync(f, JSON.stringify(st, null, 1) + '\n');
}

/** Resumo dos últimos `dias` dias (inclui `hoje`), uma linha por tipo, com os critérios que mais reprovaram. */
function resumo(f, hoje, dias = 7) {
  const st = ler(f), ini = new Date(Date.parse(hoje) - (dias - 1) * 864e5).toISOString().slice(0, 10);
  const tot = {};
  for (const [dia, tipos] of Object.entries(st)) {
    if (dia < ini || dia > hoje) continue;
    for (const [tipo, v] of Object.entries(tipos)) {
      const t = (tot[tipo] = tot[tipo] || { aprovados: 0, reprovados: 0, sem_novidade: 0, criterios: {} });
      t.aprovados += v.aprovados; t.reprovados += v.reprovados; t.sem_novidade += v.sem_novidade || 0;
      for (const [k, n] of Object.entries(v.criterios)) t.criterios[k] = (t.criterios[k] || 0) + n;
    }
  }
  const linhas = Object.entries(tot).map(([tipo, t]) => `${tipo}: ${t.aprovados} aprovado(s), ${t.reprovados} reprovado(s), ${t.sem_novidade} sem novidade` + (t.reprovados ? ` | reprovações por critério: ${Object.entries(t.criterios).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ')}` : ''));
  return { de: ini, ate: hoje, por_tipo: tot, texto: linhas.length ? linhas.join(' || ') : 'nenhuma avaliação nos últimos dias' };
}
module.exports = { chaveDoMotivo, chaves, registrar, resumo };
