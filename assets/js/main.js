/* ERASE Revisional — comportamento comum a todas as páginas.
 * Tema, menu, "Veja mais", newsletter, Fale Conosco, WhatsApp e pop-up de entrada.
 */

// =====================================================================
// ⚠️  ATENÇÃO — PLACEHOLDERS A PREENCHER DEPOIS  ⚠️
// Endpoint e chave da API do CRM da ERASE (repositório erasecrm).
// Enquanto estiverem como "SUBSTITUIR-DEPOIS", o envio ao CRM falha em
// silêncio (console.error) e o visitante nem percebe. O Netlify Forms
// continua funcionando como backup redundante — NÃO remover.
// Estas constantes também são usadas por calculator.js.
// =====================================================================
const CRM_ENDPOINT = "https://SUBSTITUIR-DEPOIS.com/api/leads/website";
const CRM_API_KEY = "SUBSTITUIR-DEPOIS";

// ---- Envios --------------------------------------------------------

/** POST cru ao Netlify Forms (form-name deve existir no formulário espelho do HTML). */
function postNetlify(formName, data) {
  const body = new URLSearchParams({ 'form-name': formName, ...data }).toString();
  return fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
}

/**
 * Segundo envio, direto ao CRM. Dispara e esquece: nunca lança, nunca bloqueia
 * a interface e nunca mostra nada ao visitante (apenas console.error).
 * `origem` = "calculadora" | "popup-entrada".
 */
function enviarParaCRM(origem, dados) {
  try {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 8000) : null;
    fetch(CRM_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': CRM_API_KEY },
      body: JSON.stringify({ origem, ...dados }),
      keepalive: true,
      signal: ctrl ? ctrl.signal : undefined,
    })
      .then((r) => { if (!r.ok) console.error('CRM respondeu', r.status); })
      .catch((err) => console.error('Falha ao enviar lead ao CRM:', err))
      .finally(() => timer && clearTimeout(timer));
  } catch (err) {
    console.error('Falha ao enviar lead ao CRM:', err);
  }
}

// ---- Origem do acesso (UTMs, referrer, página de entrada) ----------
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
function store(kind, key, val) {
  try { const st = window[kind]; if (val === undefined) return st.getItem(key); st.setItem(key, val); } catch (e) { /* sem storage */ }
  return null;
}
(function captureAttribution() {
  const q = new URLSearchParams(location.search);
  if (UTM_KEYS.some((k) => q.get(k))) {
    const utm = {}; UTM_KEYS.forEach((k) => { utm[k] = (q.get(k) || '').slice(0, 120); });
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

// ---- Fila de envio com reenvio automático (não perde lead) ----------
// Todo formulário é gravado primeiro em localStorage ("caixa de saída") e só sai
// da fila quando o Netlify Forms responde OK. Se falhar (rede, instabilidade),
// tenta de novo com espera crescente, ao voltar a conexão, ao reabrir a aba
// e na próxima visita ao site.
const OUTBOX_KEY = 'erase-outbox';
const RETRY_BASE_MS = 3000, RETRY_MAX_MS = 300000;
let outboxMem = [], flushing = null, retryTimer = null;

function readBox() {
  try { const raw = localStorage.getItem(OUTBOX_KEY); if (raw) return JSON.parse(raw); } catch (e) { /* usa memória */ }
  return outboxMem;
}
function writeBox(box) { outboxMem = box; try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(box)); } catch (e) { /* só memória */ } }
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

/** Tenta enviar tudo que está pendente. Resolve com a quantidade que continua na fila. */
function flushOutbox() {
  if (flushing) return flushing;
  flushing = (async () => {
    for (const item of readBox()) {
      let ok = false;
      try { ok = (await postNetlify(item.form, item.data)).ok; } catch (e) { ok = false; }
      const atual = readBox();
      if (ok) writeBox(atual.filter((i) => i.id !== item.id));
      else {
        console.error('Envio pendente, será repetido:', item.form);
        writeBox(atual.map((i) => (i.id === item.id ? { ...i, tentativas: (i.tentativas || 0) + 1 } : i)));
      }
    }
    const restantes = readBox();
    clearTimeout(retryTimer);
    if (restantes.length) {
      const n = Math.max(...restantes.map((i) => i.tentativas || 1));
      retryTimer = setTimeout(flushOutbox, Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** (n - 1)));
    }
    flushing = null;
    return restantes.length;
  })();
  return flushing;
}
window.addEventListener('online', flushOutbox);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && readBox().length) flushOutbox(); });
if (readBox().length) setTimeout(flushOutbox, 1500); // pendências de visitas anteriores

/**
 * Registra um lead: grava na fila (nunca se perde), dispara o envio ao Netlify Forms
 * (com reenvio automático) e, se `crm` for informado, o envio paralelo ao CRM.
 * Retorna { id, enviado: Promise<boolean> } — `enviado` resolve true se já saiu na 1ª tentativa.
 */
function queueLead({ form, crm, data, comAtribuicao = true }) {
  const id = uuid();
  const completo = { ...data, ...(comAtribuicao ? atribuicao() : {}), lead_id: id };
  writeBox([...readBox(), { id, form, data: completo, criado: Date.now(), tentativas: 0 }]);
  if (crm) enviarParaCRM(crm, completo);
  return { id, enviado: flushOutbox().then(() => !readBox().some((i) => i.id === id)) };
}

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

// ---- Tema ----------------------------------------------------------
const themeBtn = $('.theme-toggle');
if (themeBtn) {
  themeBtn.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('erase-theme', next); } catch (e) { /* modo privado */ }
  });
}

// ---- Menu ----------------------------------------------------------
const navToggle = $('.nav-toggle');
if (navToggle) {
  navToggle.addEventListener('click', () => {
    const open = $('#menu').classList.toggle('open');
    navToggle.setAttribute('aria-expanded', String(open));
  });
}
const dd = $('.dropdown');
if (dd) {
  const btn = $('.dropdown-btn', dd);
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    btn.setAttribute('aria-expanded', String(dd.classList.toggle('open')));
  });
  document.addEventListener('click', () => { dd.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); });
}

// ---- "Veja mais" ---------------------------------------------------
const more = $('#ver-mais');
if (more) {
  more.addEventListener('click', () => {
    $$('[data-extra][hidden]').slice(0, 4).forEach((el) => el.removeAttribute('hidden'));
    if (!$('[data-extra][hidden]')) more.hidden = true;
  });
}

// ---- WhatsApp (Fale Conosco) --------------------------------------
$$('[data-wa-link]').forEach((a) => { a.href = waLink('Olá! Vim pelo site da ERASE Revisional e gostaria de falar com a equipe.'); });

// ---- Formulários simples (newsletter, contato) ---------------------
function setMsg(el, text, kind) { if (el) { el.textContent = text; el.className = 'form-msg ' + (kind || ''); } }

const nl = $('#newsletter-form');
if (nl) {
  nl.addEventListener('submit', (e) => {
    e.preventDefault();
    const msg = $('#newsletter-msg');
    const email = nl.email.value.trim();
    if (!emailOk(email)) return setMsg(msg, 'Informe um e-mail válido.', 'bad');
    if (nl['bot-field'].value) return;
    queueLead({ form: 'newsletter', data: { email }, comAtribuicao: false });
    nl.reset(); setMsg(msg, 'Pronto! Você vai receber nossas novidades.', 'ok');
  });
}

const ct = $('#contact-form');
if (ct) {
  ct.addEventListener('submit', (e) => {
    e.preventDefault();
    const msg = $('#contact-msg');
    const d = { nome: ct.nome.value.trim(), email: ct.email.value.trim(), mensagem: ct.mensagem.value.trim() };
    if (!d.nome || !emailOk(d.email) || !d.mensagem) return setMsg(msg, 'Preencha nome, e-mail válido e mensagem.', 'bad');
    if (ct['bot-field'].value) return;
    queueLead({ form: 'contato', data: d, comAtribuicao: false });
    ct.reset(); setMsg(msg, 'Mensagem recebida. Retornaremos em breve.', 'ok');
  });
}

// ---- Pop-up de entrada --------------------------------------------
(function popup() {
  try { if (sessionStorage.getItem('erase-popup')) return; } catch (e) { /* sem storage: mostra */ }

  function open() {
    try { sessionStorage.setItem('erase-popup', '1'); } catch (e) { /* ignore */ }
    const prevFocus = document.activeElement;
    const ov = document.createElement('div');
    ov.className = 'popup-overlay';
    ov.innerHTML = `
      <div class="popup" role="dialog" aria-modal="true" aria-labelledby="popup-title">
        <button class="popup-close" type="button" aria-label="Fechar">&times;</button>
        <div class="popup-icon"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 17H3v-5l2-5a2 2 0 0 1 1.9-1.3h10.2A2 2 0 0 1 19 7l2 5v5h-2"/><path d="M3 12h18"/><circle cx="7.5" cy="17" r="2"/><circle cx="16.5" cy="17" r="2"/><path d="M9.5 17h5"/></svg></div>
        <h2 id="popup-title">Reduza até 70% do valor das parcelas do seu carro financiado</h2>
        <p>Deixe seus dados e um especialista entra em contato. Sem compromisso. O resultado depende da análise de cada caso.</p>
        <form id="popup-form" novalidate>
          <div class="field"><label class="sr-only" for="pp-nome">Nome</label><input id="pp-nome" name="nome" placeholder="Seu nome" autocomplete="name"></div>
          <div class="field"><label class="sr-only" for="pp-tel">Telefone / WhatsApp</label><input id="pp-tel" name="telefone" inputmode="tel" placeholder="Telefone / WhatsApp" autocomplete="tel"></div>
          <div class="field"><label class="sr-only" for="pp-email">E-mail</label><input id="pp-email" name="email" type="email" placeholder="Seu e-mail" autocomplete="email"></div>
          <div class="field check"><label><input type="checkbox" id="pp-lgpd" name="lgpd"><span>Autorizo a ERASE Soluções Financeiras e o escritório de advocacia parceiro a entrar em contato comigo por WhatsApp, telefone ou e-mail, conforme a <a href="/privacidade.html" target="_blank" rel="noopener">Política de Privacidade</a>. *</span></label></div>
          <button class="btn btn-primary btn-block" type="submit">Quero reduzir minhas parcelas</button>
          <p class="form-msg" id="popup-msg" role="status" aria-live="polite"></p>
        </form>
      </div>`;
    document.body.appendChild(ov);

    function close() {
      document.removeEventListener('keydown', onKey);
      ov.remove();
      if (prevFocus && prevFocus.focus) prevFocus.focus();
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });
    $('.popup-close', ov).addEventListener('click', close);
    maskPhone($('#pp-tel', ov));
    $('#pp-nome', ov).focus();

    $('#popup-form', ov).addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target, msg = $('#popup-msg', ov);
      const d = { nome: f.nome.value.trim(), telefone: f.telefone.value.trim(), email: f.email.value.trim() };
      if (d.nome.length < 2) return setMsg(msg, 'Informe seu nome.', 'bad');
      if (!phoneOk(d.telefone)) return setMsg(msg, 'Informe um telefone/WhatsApp válido com DDD.', 'bad');
      if (!emailOk(d.email)) return setMsg(msg, 'Informe um e-mail válido.', 'bad');
      if (!f.lgpd.checked) return setMsg(msg, 'É necessário autorizar o contato para enviar.', 'bad');
      // Grava na fila (reenvio automático) e envia ao CRM em paralelo; nunca perde o lead.
      queueLead({ form: 'popup-entrada', crm: 'popup-entrada', data: { ...d, lgpd_aceite: 'sim', status: 'novo' } });
      f.reset();
      setMsg(msg, 'Recebemos seus dados! Em breve um especialista falará com você.', 'ok');
      setTimeout(close, 2600);
    });
  }
  setTimeout(open, 3500);
})();
