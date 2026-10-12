// fetch que tenta de novo sozinho: erro de rede, tempo esgotado, 429 e 5xx -> espera crescente e repete (até `vezes`).
// 4xx (exceto 429) devolve na hora: repetir não adianta. Esgotou: devolve a última resposta ou lança o último erro.
// RETRY_ESCALA multiplica a espera (testes usam 0.001).
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
async function fetchRetry(url, opts = {}, { vezes = 3, espera = 2000, timeout } = {}) {
  let ult;
  for (let t = 1; t <= vezes; t++) {
    try {
      const r = await fetch(url, { ...opts, signal: opts.signal || (timeout ? AbortSignal.timeout(timeout) : undefined) });
      if (r.status !== 429 && r.status < 500) return r;
      ult = r;
      if (t < vezes && r.body) { try { await r.body.cancel(); } catch (e) { /* ignore */ } }
    } catch (e) { ult = e; }
    if (t < vezes) await dorme(espera * t * Number(process.env.RETRY_ESCALA ?? 1));
  }
  if (ult instanceof Error) throw ult;
  return ult;
}
module.exports = { fetchRetry };
