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

/** Backup: grava o lead no Netlify Forms (form-name deve existir no formulário espelho do HTML). */
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
      body: JSON.stringify({ origem, ...dados, pagina: location.pathname, enviado_em: new Date().toISOString() }),
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
const phoneOk = (v) => { const d = v.replace(/\D/g, ''); return d.length === 10 || d.length === 11; };
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
    const msg = $('#newsletter-msg');
    const email = nl.email.value.trim();
    if (!emailOk(email)) return setMsg(msg, 'Informe um e-mail válido.', 'bad');
    if (nl['bot-field'].value) return;
    const btn = $('button', nl); btn.disabled = true;
    try {
      const r = await postNetlify('newsletter', { email });
      if (!r.ok) throw new Error(r.status);
      nl.reset(); setMsg(msg, 'Pronto! Você vai receber nossas novidades.', 'ok');
    } catch (err) {
      console.error(err); setMsg(msg, 'Não foi possível enviar agora. Tente novamente.', 'bad');
    } finally { btn.disabled = false; }
  });
}

const ct = $('#contact-form');
if (ct) {
  ct.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#contact-msg');
    const d = { nome: ct.nome.value.trim(), email: ct.email.value.trim(), mensagem: ct.mensagem.value.trim() };
    if (!d.nome || !emailOk(d.email) || !d.mensagem) return setMsg(msg, 'Preencha nome, e-mail válido e mensagem.', 'bad');
    if (ct['bot-field'].value) return;
    const btn = $('button[type=submit]', ct); btn.disabled = true;
    try {
      const r = await postNetlify('contato', d);
      if (!r.ok) throw new Error(r.status);
      ct.reset(); setMsg(msg, 'Mensagem enviada. Retornaremos em breve.', 'ok');
    } catch (err) {
      console.error(err); setMsg(msg, 'Não foi possível enviar agora. Tente pelo WhatsApp.', 'bad');
    } finally { btn.disabled = false; }
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
        <p>Deixe seus dados e um especialista entra em contato. Sem compromisso. Resultado depende da análise de cada caso.</p>
        <form id="popup-form" novalidate>
          <div class="field"><label class="sr-only" for="pp-nome">Nome</label><input id="pp-nome" name="nome" placeholder="Seu nome" autocomplete="name"></div>
          <div class="field"><label class="sr-only" for="pp-tel">Telefone / WhatsApp</label><input id="pp-tel" name="telefone" inputmode="tel" placeholder="Telefone / WhatsApp" autocomplete="tel"></div>
          <div class="field"><label class="sr-only" for="pp-email">E-mail</label><input id="pp-email" name="email" type="email" placeholder="Seu e-mail" autocomplete="email"></div>
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
      const btn = $('button[type=submit]', f); btn.disabled = true;
      enviarParaCRM('popup-entrada', d); // em paralelo; falhas só vão ao console
      try {
        const r = await postNetlify('popup-entrada', { ...d, pagina: location.pathname });
        if (!r.ok) throw new Error(r.status);
        setMsg(msg, 'Recebemos seus dados! Em breve um especialista falará com você.', 'ok');
        setTimeout(close, 2600);
      } catch (err) {
        console.error(err); btn.disabled = false;
        setMsg(msg, 'Não foi possível enviar agora. Tente novamente.', 'bad');
      }
    });
  }
  setTimeout(open, 3500);
})();
