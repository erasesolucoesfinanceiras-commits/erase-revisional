/* ERASE Revisional — envio de leads ao CRM e utilidades (Turnstile, atribuição, máscara de telefone, WhatsApp).
 * Carregado ANTES de main.js (páginas do site) e sozinho no chat /analise (que não carrega o main.js).
 */

// =====================================================================
// ENVIO DE LEADS — CRM da ERASE (único destino).
// A chave abaixo é a "chave do site": por natureza fica visível no navegador, e o
// CRM só aceita envios vindos de *.eraseconsulta.com.br. Teste real:
// https://revisional.eraseconsulta.com.br (prévias *.pages.dev podem ser bloqueadas).
// Estas constantes também são usadas por calculator.js.
// =====================================================================
const CRM_ENDPOINT = "https://lqxwdyjctsmirinvvyow.supabase.co/functions/v1/entrada-site";
const CRM_API_KEY = "erase_site_179340d5359c433abb6011ee7c881e3e79f932e261ce4b04ac037debf431bf6e";
const ENVIO_TIMEOUT_MS = 15000;
const TURNSTILE_SITE_KEY = '0x4AAAAAAFXipig0gXCnRiPH';
let turnstileId = null, turnstileCarregando = null;
// Token do Turnstile: cada código vale UM envio e dura ~5 min. `prepararTurnstile()` (usado em /analise/) gera o código ao abrir a página,
// renova antes de vencer e já prepara o próximo depois de cada uso; sem isso, o código é gerado na hora do envio. O widget fica invisível
// e só aparece se a Cloudflare desconfiar. `tsErro` guarda o código de erro da Cloudflare (ex.: 110200 domínio não permitido, 400020 chave inválida).
const TS_VALIDADE_MS = window.TS_VALIDADE_MS || 240000; // só os testes mudam isso
let tsToken = null, tsGerando = false, tsFila = [], tsErro = '', tsStatus = '', tsRenova = null, tsProativo = false;
function tsEntregar(token, erro) {
  tsGerando = false; clearTimeout(tsRenova);
  if (token) {
    tsErro = '';
    const fila = tsFila.splice(0);
    if (fila.length) { fila.shift()(token); if (fila.length) { tsFila.push(...fila); tsGerar(); } return; }
    tsToken = token;
    tsRenova = setTimeout(() => { tsToken = null; tsGerar(); }, TS_VALIDADE_MS); // vence em ~5 min: renova antes
  } else { tsErro = String(erro || 'erro'); tsFila.splice(0).forEach((f) => f(null)); }
}
function tsGerar() {
  if (tsGerando) return;
  tsGerando = true;
  turnstileCarregando = turnstileCarregando || new Promise((ok, falha) => {
    const sc = document.createElement('script');
    sc.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    sc.async = true; sc.onload = ok; sc.onerror = () => { turnstileCarregando = null; falha(); };
    document.head.appendChild(sc);
  });
  turnstileCarregando.then(() => {
    let caixa = document.getElementById('turnstile-caixa');
    if (!caixa) { caixa = document.createElement('div'); caixa.id = 'turnstile-caixa'; document.body.appendChild(caixa); }
    const opcoes = { sitekey: TURNSTILE_SITE_KEY, appearance: 'interaction-only', language: 'pt-br', callback: (t) => tsEntregar(t), 'error-callback': (c) => tsEntregar(null, c), 'timeout-callback': () => tsEntregar(null, 'timeout'), 'expired-callback': () => { tsToken = null; tsGerando = false; tsGerar(); } };
    if (turnstileId === null) turnstileId = window.turnstile.render(caixa, opcoes);
    else window.turnstile.reset(turnstileId);
  }).catch(() => tsEntregar(null, 'script_nao_carregou'));
}
/** Começa a gerar o token já (ex.: ao abrir /analise/); depois de cada uso, gera o próximo sozinho. */
function prepararTurnstile() { tsProativo = true; if (!tsToken) tsGerar(); }
/** Devolve um token (ou null se não ficar pronto em `limiteMs`). Token pronto: usa na hora. Senão espera o que está sendo gerado. */
function obterTokenTurnstile(limiteMs = 12000) {
  return new Promise((resolve) => {
    if (tsToken) { const t = tsToken; tsToken = null; clearTimeout(tsRenova); tsStatus = 'ok'; resolve(t); if (tsProativo) setTimeout(tsGerar, 50); return; }
    let feito = false;
    const fim = (t) => { if (feito) return; feito = true; clearTimeout(lim); tsStatus = t ? 'ok' : `sem token (${tsErro || 'não ficou pronto a tempo'})`; if (!t) tsFila = tsFila.filter((f) => f !== fim); if (t && tsProativo) setTimeout(tsGerar, 50); resolve(t); };
    const lim = setTimeout(() => fim(null), limiteMs);
    tsFila.push(fim); tsGerar();
  });
}
const MSG_FALHA = 'Não conseguimos enviar agora. Seus dados continuam aqui: confira a conexão e tente de novo.';

/**
 * Envia um formulário ao CRM (JSON). `origem` = nome do formulário
 * (newsletter | contato | popup-entrada | calculadora); "bot-field" vai vazio
 * (campo anti-spam). Resolve true SOMENTE se o CRM confirmar o recebimento
 * (HTTP 2xx e corpo sem erro). Nunca lança: qualquer falha resolve false.
 */
let ultimoErroCRM = ''; // motivo da última falha de envio (só aparece na tela com ?debug=1 em /analise)
async function enviarParaCRM(origem, dados, { limiteMs } = {}) {
  // limiteMs: orçamento TOTAL (token do Turnstile + envio, sem nova tentativa); o token usa no máximo 60% dele.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), limiteMs || ENVIO_TIMEOUT_MS);
  ultimoErroCRM = '';
  let semToken = false;
  try {
    const turnstile = await obterTokenTurnstile(limiteMs ? Math.max(1000, limiteMs - 1000) : undefined); // null = não ficou pronto: o CRM decide (com orçamento curto, sobra ≥ 1 s para o envio)
    semToken = turnstile === null;
    const r = await fetch(CRM_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': CRM_API_KEY },
      body: JSON.stringify({ origem, 'bot-field': '', ...dados, turnstile }),
      signal: ctrl.signal,
    });
    let corpo = null;
    try { corpo = await r.json(); } catch (e) { /* corpo vazio ou não-JSON */ }
    const ok = r.ok && !(corpo && (corpo.ok === false || corpo.success === false || corpo.error));
    if (!ok) { ultimoErroCRM = `${semToken ? `sem_token_turnstile(${tsErro || 'não ficou pronto a tempo'})+` : ''}http_${r.status}${corpo && corpo.error ? ' ' + String(corpo.error).slice(0, 80) : ''}`; console.error('CRM não confirmou o recebimento:', r.status, corpo); }
    return ok;
  } catch (err) {
    ultimoErroCRM = `${semToken ? `sem_token_turnstile(${tsErro || 'não ficou pronto a tempo'})+` : ''}${err.name === 'AbortError' ? 'tempo_esgotado' : 'rede: ' + String(err.message).slice(0, 80)}`;
    console.error('Falha ao enviar ao CRM:', err);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// ---- Origem do acesso (UTMs, referrer, página de entrada) ----------
const UTM_TTL_MS = 30 * 864e5;
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
function store(kind, key, val) {
  try { const st = window[kind]; if (val === undefined) return st.getItem(key); st.setItem(key, val); } catch (e) { /* sem storage */ }
  return null;
}
(function captureAttribution() {
  const q = new URLSearchParams(location.search);
  if (UTM_KEYS.some((k) => q.get(k))) {
    const utm = {}; UTM_KEYS.forEach((k) => { utm[k] = (q.get(k) || '').slice(0, 120); });
    utm.t = Date.now();
    store('localStorage', 'erase-utm', JSON.stringify(utm)); // última campanha conhecida
  }
  if (!store('sessionStorage', 'erase-landing')) {
    store('sessionStorage', 'erase-landing', location.pathname + location.search);
    let ref = 'direto';
    try { if (document.referrer && new URL(document.referrer).host !== location.host) ref = new URL(document.referrer).host; else if (document.referrer) ref = 'interno'; } catch (e) { /* ignore */ }
    store('sessionStorage', 'erase-ref', ref);
  }
})();
function atribuicao() {
  let utm = {}; try { utm = JSON.parse(store('localStorage', 'erase-utm') || '{}'); } catch (e) { /* ignore */ }
  if (utm.t && Date.now() - utm.t > UTM_TTL_MS) utm = {}; // campanha antiga não leva o crédito
  const agora = new Date();
  const out = {
    data_hora: agora.toISOString(),
    data_hora_local: agora.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
    origem_trafego: utm.utm_source || store('sessionStorage', 'erase-ref') || 'direto',
    pagina_entrada: store('sessionStorage', 'erase-landing') || location.pathname,
    pagina_envio: location.pathname,
  };
  UTM_KEYS.forEach((k) => { out[k] = utm[k] || ''; });
  return out;
}

// ---- Envio de lead ---------------------------------------------------
// Sem fila em segundo plano: o visitante só vê sucesso depois que o CRM confirma.
// Se falhar, o formulário continua preenchido e a pessoa tenta de novo. O lead_id
// é o MESMO nas novas tentativas do mesmo envio, para o CRM reconhecer duplicados.
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
const idsPendentes = {};
function idDoEnvio(form, chave) {
  const p = idsPendentes[form];
  return p && p.chave === chave ? p.id : (idsPendentes[form] = { chave, id: uuid() }).id;
}
// Só os campos de campanha/origem (sem lead_id nem data/hora), usados por newsletter e contato.
const CAMPOS_CAMPANHA = ['origem_trafego', 'pagina_entrada', 'pagina_envio', ...UTM_KEYS];
function soCampanha() { const a = atribuicao(); return Object.fromEntries(CAMPOS_CAMPANHA.map((k) => [k, a[k]])); }
/** Envia o lead ao CRM; `comAtribuicao`: lead_id + origem/UTM/data-hora (calculadora, pop-up); `campanha`: só origem/UTM/páginas. */
async function enviarLead(form, dados, { comAtribuicao = true, campanha = false, comLeadId = false, limiteMs, leadId } = {}) {
  // `leadId`: id escolhido por quem chama (o chat usa o mesmo id como eventID do Pixel, para a API de Conversões do CRM deduplicar)
  const extra = comAtribuicao ? { ...atribuicao(), lead_id: leadId || idDoEnvio(form, JSON.stringify(dados)) } : campanha ? soCampanha() : {};
  // `comLeadId`: só o lead_id (mesmo formato da calculadora/pop-up); fica igual nas novas tentativas do mesmo envio.
  if (!comAtribuicao && comLeadId) extra.lead_id = idDoEnvio(form, JSON.stringify(dados));
  const ok = await enviarParaCRM(form, { ...dados, ...extra }, { limiteMs });
  if (ok) { delete idsPendentes[form]; rastrear(form); }
  return ok;
}
// Google Analytics (GA4): só dispara depois que o CRM confirmou e só se o gtag foi carregado (ID em data/config.json).
const EVENTOS_GA = { 'formulario-analise-revisional': 'envio_analise', calculadora: 'envio_calculadora', 'popup-entrada': 'envio_popup', newsletter: 'envio_newsletter', contato: 'envio_contato' };
function rastrear(form) {
  try { if (typeof gtag === 'function' && EVENTOS_GA[form]) gtag('event', EVENTOS_GA[form], { formulario: form, pagina: location.pathname }); } catch (e) { /* analytics nunca atrapalha o envio */ }
}
try { localStorage.removeItem('erase-outbox'); } catch (e) { /* fila antiga, se existir */ }

// ---- Utilidades ----------------------------------------------------
const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));

function maskPhone(input) {
  input.addEventListener('input', () => {
    let d = input.value.replace(/\D/g, '').slice(0, 11);
    if (d.length > 10) input.value = `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    else if (d.length > 6) input.value = `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    else if (d.length > 2) input.value = `(${d.slice(0, 2)}) ${d.slice(2)}`;
    else input.value = d;
  });
}
const DDDS = new Set('11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99'.split(' '));
/** Celular brasileiro: DDD válido + 9 dígitos começando em 9 (11 dígitos no total). */
const phoneOk = (v) => { const d = v.replace(/\D/g, ''); return d.length === 11 && DDDS.has(d.slice(0, 2)) && d[2] === '9'; };
const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
function waNumber() { return (document.body.dataset.wa || '').replace(/\D/g, ''); }
function waLink(texto) { return `https://wa.me/${waNumber()}${texto ? '?text=' + encodeURIComponent(texto) : ''}`; }
