// Abre as páginas das fontes: confirma que o link funciona e traz o texto (para conferir cópia e fatos).
const UA = 'Mozilla/5.0 (compatible; EraseRevisionalBot/1.0; +https://revisional.eraseconsulta.com.br)';

function textoDoHtml(html) {
  return html
    .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

/** { ok, status, urlFinal, texto, bloqueado }. `bloqueado` = o site existe mas recusa robôs (401/403/429): link aceito, sem texto. */
async function abrir(url, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { redirect: 'follow', signal: ctrl.signal, headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5', 'Accept-Language': 'pt-BR,pt;q=0.9' } });
    const bloqueado = [401, 403, 429].includes(r.status);
    let texto = '';
    const tipo = r.headers.get('content-type') || '';
    if (r.ok && /html|text\/plain|xml/.test(tipo)) texto = textoDoHtml((await r.text()).slice(0, 600000)).slice(0, 30000);
    else if (r.body) { try { await r.body.cancel(); } catch (e) { /* ignore */ } }
    return { ok: r.ok || bloqueado, status: r.status, urlFinal: r.url || url, texto, bloqueado };
  } catch (e) {
    return { ok: false, status: 0, urlFinal: url, texto: '', bloqueado: false, erro: e.name === 'AbortError' ? 'tempo esgotado' : e.message };
  } finally { clearTimeout(timer); }
}

module.exports = { abrir };
