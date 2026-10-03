/* ERASE Revisional — comportamento comum a todas as páginas.
 * Tema, menu, "Veja mais", newsletter, Fale Conosco, WhatsApp e pop-up de entrada.
 */

// =====================================================================
// ENVIO DE LEADS — CRM da ERASE (único destino; o Netlify Forms foi removido).
// A chave abaixo é a "chave do site": por natureza fica visível no navegador, e o
// CRM só aceita envios vindos de *.eraseconsulta.com.br. Teste real:
// https://revisional.eraseconsulta.com.br (prévias *.netlify.app podem ser bloqueadas).
// Estas constantes também são usadas por calculator.js.
// =====================================================================
const CRM_ENDPOINT = "https://lqxwdyjctsmirinvvyow.supabase.co/functions/v1/entrada-site";
const CRM_API_KEY = "erase_site_179340d5359c433abb6011ee7c881e3e79f932e261ce4b04ac037debf431bf6e";
const ENVIO_TIMEOUT_MS = 15000;
const MSG_FALHA = 'Não conseguimos enviar agora. Seus dados continuam aqui: confira a conexão e tente de novo.';

/**
 * Envia um formulário ao CRM (JSON). `origem` = nome do formulário
 * (newsletter | contato | popup-entrada | calculadora); "bot-field" vai vazio
 * (campo anti-spam). Resolve true SOMENTE se o CRM confirmar o recebimento
 * (HTTP 2xx e corpo sem erro). Nunca lança: qualquer falha resolve false.
 */
async function enviarParaCRM(origem, dados) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ENVIO_TIMEOUT_MS);
  try {
    const r = await fetch(CRM_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': CRM_API_KEY },
      body: JSON.stringify({ origem, 'bot-field': '', ...dados }),
      signal: ctrl.signal,
    });
    let corpo = null;
    try { corpo = await r.json(); } catch (e) { /* corpo vazio ou não-JSON */ }
    const ok = r.ok && !(corpo && (corpo.ok === false || corpo.success === false || corpo.error));
    if (!ok) console.error('CRM não confirmou o recebimento:', r.status, corpo);
    return ok;
  } catch (err) {
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
/** Envia o lead ao CRM; com `comAtribuicao`, anexa lead_id e os campos de origem/UTM. */
async function enviarLead(form, dados, { comAtribuicao = true } = {}) {
  const extra = comAtribuicao ? { ...atribuicao(), lead_id: idDoEnvio(form, JSON.stringify(dados)) } : {};
  const ok = await enviarParaCRM(form, { ...dados, ...extra });
  if (ok) delete idsPendentes[form];
  return ok;
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
  nl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#newsletter-msg'), btn = $('button[type=submit]', nl);
    const email = nl.email.value.trim();
    if (!emailOk(email)) return setMsg(msg, 'Informe um e-mail válido.', 'bad');
    if (nl['bot-field'].value) return;
    btn.disabled = true; setMsg(msg, 'Enviando…');
    const ok = await enviarLead('newsletter', { email, 'bot-field': nl['bot-field'].value }, { comAtribuicao: false });
    btn.disabled = false;
    if (!ok) return setMsg(msg, MSG_FALHA, 'bad');
    nl.reset(); setMsg(msg, 'Pronto! Você vai receber nossas novidades.', 'ok');
  });
}

const ct = $('#contact-form');
if (ct) {
  ct.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#contact-msg'), btn = $('button[type=submit]', ct);
    const d = { nome: ct.nome.value.trim(), email: ct.email.value.trim(), mensagem: ct.mensagem.value.trim() };
    if (!d.nome || !emailOk(d.email) || !d.mensagem) return setMsg(msg, 'Preencha nome, e-mail válido e mensagem.', 'bad');
    if (ct['bot-field'].value) return;
    btn.disabled = true; setMsg(msg, 'Enviando…');
    const ok = await enviarLead('contato', { ...d, 'bot-field': ct['bot-field'].value }, { comAtribuicao: false });
    btn.disabled = false;
    if (!ok) return setMsg(msg, MSG_FALHA, 'bad');
    ct.reset(); setMsg(msg, 'Mensagem recebida. Retornaremos em breve.', 'ok');
  });
}

// ---- Pop-up de entrada --------------------------------------------
(function popup() {
  if (location.pathname.includes('calculadora')) return; // quem já está no formulário não precisa do pop-up
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
        <p class="free-badge">ANÁLISE DO CONTRATO 100% GRATUITA</p>
        <h2 id="popup-title">Descubra se você está pagando juros acima da média no seu financiamento</h2>
        <p>Deixe seus dados e um especialista entra em contato. Sem compromisso. O resultado depende da análise de cada caso.</p>
        <form id="popup-form" novalidate>
          <div class="field"><label class="sr-only" for="pp-nome">Nome</label><input id="pp-nome" name="nome" placeholder="Seu nome" autocomplete="name"></div>
          <div class="field"><label class="sr-only" for="pp-tel">Telefone / WhatsApp</label><input id="pp-tel" name="telefone" inputmode="tel" placeholder="Telefone / WhatsApp" autocomplete="tel"></div>
          <fieldset class="field choices" data-group="situacao"><legend>Como está seu financiamento hoje? <span class="req">*</span></legend><div class="choice-grid">${['Em dia', 'Atrasado', 'Busca e apreensão'].map((o) => `<label class="choice"><input type="radio" name="situacao" value="${o}"><span>${o}</span></label>`).join('')}</div></fieldset>
          <div class="field check"><label><input type="checkbox" id="pp-lgpd" name="lgpd"><span>Autorizo a ERASE Soluções Financeiras a entrar em contato comigo por WhatsApp ou telefone, conforme a <a href="/privacidade" target="_blank" rel="noopener">Política de Privacidade</a>. *</span></label></div>
          <button class="btn btn-primary btn-block" type="submit">Quero a análise gratuita</button>
          <p class="form-msg" id="popup-msg" role="status" aria-live="polite"></p>
        </form>
      </div>`;
    document.body.appendChild(ov);

    function close() {
      document.removeEventListener('keydown', onKey);
      ov.remove();
      if (prevFocus && prevFocus.focus) prevFocus.focus();
    }
    function onKey(e) {
      if (e.key === 'Escape') return close();
      if (e.key !== 'Tab') return;
      const f = $$('button, input, a[href]', ov); // prende o foco dentro do diálogo
      const [a, z] = [f[0], f[f.length - 1]];
      if (!ov.contains(document.activeElement)) { e.preventDefault(); a.focus(); }
      else if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    }
    document.addEventListener('keydown', onKey);
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });
    $('.popup-close', ov).addEventListener('click', close);
    maskPhone($('#pp-tel', ov));
    $('#pp-nome', ov).focus();

    $('#popup-form', ov).addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target, msg = $('#popup-msg', ov);
      const sit = f.querySelector('input[name="situacao"]:checked');
      // Mesmos nomes de campo e valores da calculadora (o CRM marca URGENTE se atrasado ou busca e apreensão).
      const SITUACAO = {
        'Em dia': { parcelas_em_dia: 'Em dia', busca_apreensao: '' },
        'Atrasado': { parcelas_em_dia: 'Atrasadas', busca_apreensao: '' },
        'Busca e apreensão': { parcelas_em_dia: '', busca_apreensao: 'Já tem processo de busca e apreensão' },
      };
      const d = { nome: f.nome.value.trim(), telefone: f.telefone.value.trim(), ...(sit ? SITUACAO[sit.value] : {}) };
      if (d.nome.length < 2) return setMsg(msg, 'Informe seu nome.', 'bad');
      if (!phoneOk(d.telefone)) return setMsg(msg, 'Informe um telefone/WhatsApp válido com DDD.', 'bad');
      if (!sit) return setMsg(msg, 'Escolha como está seu financiamento.', 'bad');
      if (!f.lgpd.checked) return setMsg(msg, 'É necessário autorizar o contato para enviar.', 'bad');
      const btn = $('button[type=submit]', f);
      btn.disabled = true; setMsg(msg, 'Enviando…');
      const ok = await enviarLead('popup-entrada', { ...d, lgpd_aceite: 'sim', status: 'novo' });
      btn.disabled = false;
      if (!ok) return setMsg(msg, MSG_FALHA, 'bad'); // dados continuam no formulário
      f.reset();
      setMsg(msg, 'Recebemos seus dados! Em breve um especialista falará com você.', 'ok');
      setTimeout(close, 2600);
    });
  }
  setTimeout(open, 3500);
})();
