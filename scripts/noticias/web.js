// Abre as páginas das fontes: confirma que o link funciona e traz o texto (para conferir cópia e fatos).
const net = require('net');
const dns = require('dns').promises;
const { fetchRetry } = require('../retry');
const UA = 'Mozilla/5.0 (compatible; EraseRevisionalBot/1.0; +https://revisional.eraseconsulta.com.br)';

function textoDoHtml(html) {
  return html
    .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

/** IP que não é da internet pública (loopback, rede privada, link-local/metadados, CGNAT, multicast...). */
function ipInterno(ip) {
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    const m4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
    if (m4) return ipInterno(m4[1]);
    const mh = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(v); // a URL normaliza ::ffff:10.0.0.1 para ::ffff:a00:1
    if (mh) { const hi = parseInt(mh[1], 16), lo = parseInt(mh[2], 16); return ipInterno(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`); }
    return v === '::1' || v === '::' || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || v.startsWith('ff');
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || (b === 0 && ip.split('.')[2] === '0'))) || (a === 198 && (b === 18 || b === 19));
}
/** Só http(s) para hosts públicos: recusa localhost, nomes internos e qualquer nome que resolva para IP interno. `lookup` existe para teste.
 *  ponytail: confere o DNS antes de abrir; um DNS que muda entre a conferência e a conexão (rebinding) ainda passaria. */
async function urlSegura(url, lookup = (h) => dns.lookup(h, { all: true })) {
  let u; try { u = new URL(url); } catch (e) { return false; }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password) return false;
  const h = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!h || h === 'localhost' || /\.(local|localhost|internal|lan|home|corp)$/.test(h)) return false;
  if (net.isIP(h)) return !ipInterno(h);
  try { const r = await lookup(h); return r.length > 0 && r.every((x) => !ipInterno(x.address)); } catch (e) { return false; }
}
const MAX_REDIRECTS = 5;

/** { ok, status, urlFinal, texto, bloqueado }. `bloqueado` = o site existe mas recusa robôs (401/403/429): link aceito, sem texto. */
async function abrir(url, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    // redirecionamentos seguidos à mão (no máximo MAX_REDIRECTS), conferindo cada endereço antes de abrir
    let atual = url, r;
    for (let salto = 0; ; salto++) {
      if (!(await urlSegura(atual))) return { ok: false, status: 0, urlFinal: atual, texto: '', bloqueado: false, erro: 'endereço não permitido (só sites públicos http/https)' };
      r = await fetchRetry(atual, { redirect: 'manual', signal: ctrl.signal, headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5', 'Accept-Language': 'pt-BR,pt;q=0.9' } }, { vezes: 2, espera: 1500 });
      const loc = r.status >= 300 && r.status < 400 && r.headers.get('location');
      if (!loc) break;
      if (r.body) { try { await r.body.cancel(); } catch (e) { /* ignore */ } }
      if (salto >= MAX_REDIRECTS) return { ok: false, status: r.status, urlFinal: atual, texto: '', bloqueado: false, erro: 'redirecionamentos demais' };
      try { atual = new URL(loc, atual).toString(); } catch (e) { return { ok: false, status: r.status, urlFinal: atual, texto: '', bloqueado: false, erro: 'redirecionamento inválido' }; }
    }
    const bloqueado = [401, 403, 429].includes(r.status);
    let texto = '';
    const tipo = r.headers.get('content-type') || '';
    if (r.ok && /html|text\/plain|xml/.test(tipo)) texto = textoDoHtml((await r.text()).slice(0, 600000)).slice(0, 30000);
    else if (r.body) { try { await r.body.cancel(); } catch (e) { /* ignore */ } }
    return { ok: r.ok || bloqueado, status: r.status, urlFinal: atual, texto, bloqueado };
  } catch (e) {
    return { ok: false, status: 0, urlFinal: url, texto: '', bloqueado: false, erro: e.name === 'AbortError' ? 'tempo esgotado' : e.message };
  } finally { clearTimeout(timer); }
}

module.exports = { abrir, urlSegura, ipInterno };
