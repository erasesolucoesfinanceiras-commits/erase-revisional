/* ERASE Revisional — comportamento comum a todas as páginas.
 * Tema, menu, "Veja mais", newsletter, Fale Conosco, WhatsApp e pop-up de entrada.
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
// Só os campos de campanha/origem (sem lead_id nem data/hora), usados por newsletter e contato.
const CAMPOS_CAMPANHA = ['origem_trafego', 'pagina_entrada', 'pagina_envio', ...UTM_KEYS];
function soCampanha() { const a = atribuicao(); return Object.fromEntries(CAMPOS_CAMPANHA.map((k) => [k, a[k]])); }
/** Envia o lead ao CRM; `comAtribuicao`: lead_id + origem/UTM/data-hora (calculadora, pop-up); `campanha`: só origem/UTM/páginas. */
async function enviarLead(form, dados, { comAtribuicao = true, campanha = false, comLeadId = false } = {}) {
  const extra = comAtribuicao ? { ...atribuicao(), lead_id: idDoEnvio(form, JSON.stringify(dados)) } : campanha ? soCampanha() : {};
  // `comLeadId`: só o lead_id (mesmo formato da calculadora/pop-up); fica igual nas novas tentativas do mesmo envio.
  if (!comAtribuicao && comLeadId) extra.lead_id = idDoEnvio(form, JSON.stringify(dados));
  const ok = await enviarParaCRM(form, { ...dados, ...extra });
  if (ok) { delete idsPendentes[form]; rastrear(form); }
  return ok;
}
// Google Analytics (GA4): só dispara depois que o CRM confirmou e só se o gtag foi carregado (ID em data/config.json).
const EVENTOS_GA = { calculadora: 'envio_calculadora', 'popup-entrada': 'envio_popup', newsletter: 'envio_newsletter', contato: 'envio_contato' };
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
    const ok = await enviarLead('newsletter', { email, lgpd_aceite: 'sim', 'bot-field': nl['bot-field'].value }, { comAtribuicao: false, campanha: true });
    btn.disabled = false;
    if (!ok) return setMsg(msg, MSG_FALHA, 'bad');
    nl.reset(); setMsg(msg, 'Pronto! Você vai receber nossas novidades.', 'ok');
  });
}

// ---- Newsletter da barra lateral (e-mail + consentimento LGPD) ------------
// Usa o MESMO envio da newsletter da capa: origem "newsletter" e os mesmos campos (e-mail, lgpd_aceite, campanha), sem campos de urgência.
const sbn = $('#sb-news-form');
if (sbn) {
  const btn = $('button[type=submit]', sbn), msg = $('#sb-msg');
  const pend = () => { const p = []; if (!emailOk(sbn.email.value.trim())) p.push({ campo: 'email', rotulo: 'e-mail válido', foco: sbn.email }); if (!sbn.lgpd.checked) p.push({ campo: 'lgpd', rotulo: 'a autorização de envio', foco: sbn.lgpd }); return p; };
  const atualizar = () => {
    const p = pend(), ok = !p.length;
    btn.setAttribute('aria-disabled', ok ? 'false' : 'true');
    if (!btn.dataset.enviando) btn.textContent = ok ? 'Receber novidades' : 'Preencha para receber';
    $$('.field[data-campo]', sbn).forEach((c) => { if (c.classList.contains('invalid') && !p.some((x) => x.campo === c.dataset.campo)) c.classList.remove('invalid'); });
    if (ok && msg.classList.contains('bad')) setMsg(msg, '');
  };
  sbn.addEventListener('input', atualizar); sbn.addEventListener('change', atualizar); atualizar();
  sbn.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (sbn['bot-field'].value) return;
    const p = pend();
    if (p.length) {
      $$('.field[data-campo]', sbn).forEach((c) => c.classList.toggle('invalid', p.some((x) => x.campo === c.dataset.campo)));
      setMsg(msg, `Falta preencher: ${p.map((x) => x.rotulo).join(' e ')}.`, 'bad'); p[0].foco.focus(); return;
    }
    btn.disabled = true; btn.dataset.enviando = '1'; btn.textContent = 'Enviando…'; setMsg(msg, 'Enviando…');
    const ok = await enviarLead('newsletter', { email: sbn.email.value.trim(), lgpd_aceite: 'sim', 'bot-field': sbn['bot-field'].value }, { comAtribuicao: false, campanha: true });
    btn.disabled = false; delete btn.dataset.enviando;
    if (!ok) { atualizar(); return setMsg(msg, MSG_FALHA, 'bad'); }
    sbn.reset(); atualizar(); setMsg(msg, 'Pronto! Você vai receber o resumo semanal por e-mail.', 'ok');
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
    const ok = await enviarLead('contato', { ...d, 'bot-field': ct['bot-field'].value }, { comAtribuicao: false, campanha: true, comLeadId: true });
    btn.disabled = false;
    if (!ok) return setMsg(msg, MSG_FALHA, 'bad');
    ct.reset(); setMsg(msg, 'Mensagem recebida. Retornaremos em breve.', 'ok');
  });
}

// ---- Pop-up de entrada --------------------------------------------
(function popup() {
  if (location.pathname.includes('calculadora')) return; // quem já está no formulário não precisa do pop-up
  try { if (sessionStorage.getItem('erase-popup')) return; } catch (e) { /* sem storage: mostra */ }

  // Foto do pop-up: baixa em segundo plano (depois do carregamento da página e com o navegador ocioso) para já estar pronta quando ele abrir.
  const aquecer = () => { const i = new Image(); i.decoding = 'async'; i.src = '/assets/img/popup-carro.webp'; };
  const quandoOcioso = () => ('requestIdleCallback' in window ? requestIdleCallback(aquecer, { timeout: 1500 }) : setTimeout(aquecer, 300));
  if (document.readyState === 'complete') quandoOcioso(); else addEventListener('load', quandoOcioso, { once: true });

  function open() {
    try { sessionStorage.setItem('erase-popup', '1'); } catch (e) { /* ignore */ }
    const prevFocus = document.activeElement;
    const ov = document.createElement('div');
    ov.className = 'popup-overlay';
    ov.innerHTML = `
      <div class="popup" role="dialog" aria-modal="true" aria-labelledby="popup-title">
        <button class="popup-close" type="button" aria-label="Fechar">&times;</button>
        <aside class="popup-art" aria-hidden="true">
          <img class="popup-logo" src="/assets/img/logo-erase.webp" alt="" width="147" height="26">
          <div class="popup-photo-wrap"><img class="popup-photo" src="/assets/img/popup-carro.webp" alt="" width="640" height="622" decoding="async"></div>
          <p class="popup-art-text">Entenda o que está dentro do seu contrato de financiamento.</p>
        </aside>
        <div class="popup-main">
          <form id="popup-form" novalidate>
            <div class="pp-head">
              <p class="free-badge">ANÁLISE TOTALMENTE GRATUITA</p>
              <h2 id="popup-title">Seu financiamento merece uma segunda olhada</h2>
              <p class="popup-sub">Deixe seus dados e um especialista da ERASE fala com você. Sem compromisso.</p>
            </div>
            <div class="pp-fields">
              <div class="field" data-campo="nome"><label for="pp-nome">Nome e sobrenome <span class="req">*</span></label><input id="pp-nome" name="nome" placeholder="Ex.: Maria Silva" autocomplete="name" aria-required="true" aria-describedby="pp-err-nome"><span class="req req-in" aria-hidden="true">*</span><small class="err" id="pp-err-nome">Informe nome e sobrenome</small></div>
              <div class="field" data-campo="telefone"><label for="pp-tel">WhatsApp <span class="req">*</span></label><input id="pp-tel" name="telefone" inputmode="tel" placeholder="(81) 99999-9999" autocomplete="tel" aria-required="true" aria-describedby="pp-err-tel"><span class="req req-in" aria-hidden="true">*</span><small class="err" id="pp-err-tel">Informe DDD + número com 9 dígitos</small></div>
              <p class="form-msg" id="popup-msg" role="status" aria-live="polite"></p>
            </div>
            <div class="pp-rest">
              <fieldset class="field choices" data-group="situacao" data-campo="situacao" aria-describedby="pp-err-sit"><legend>Como estão as parcelas? <span class="req">*</span></legend><div class="choice-grid" role="radiogroup" aria-required="true" aria-label="Como estão as parcelas?">${['Em dia', 'Atrasadas', 'Veículo com busca e apreensão'].map((o) => `<label class="choice"><input type="radio" name="situacao" value="${o}"><span>${o}</span></label>`).join('')}</div><small class="err" id="pp-err-sit">Escolha uma das opções</small></fieldset>
              <div class="field check" data-campo="lgpd"><label><input type="checkbox" id="pp-lgpd" name="lgpd" aria-required="true" aria-describedby="pp-err-lgpd"><span>Autorizo a ERASE Soluções Financeiras a entrar em contato comigo por WhatsApp ou telefone, conforme a <a href="/privacidade" target="_blank" rel="noopener">Política de Privacidade</a>. *</span></label><small class="err" id="pp-err-lgpd">Marque para autorizar o contato</small></div>
              <button class="btn btn-primary btn-block popup-cta" type="submit" aria-disabled="true">Preencha os dados para enviar</button>
              <p class="popup-legal">Resultado estimado, sem valor de análise jurídica.</p>
            </div>
          </form>
        </div>
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

    const form = $('#popup-form', ov), btnEnvio = $('.popup-cta', form), aviso = $('#popup-msg', ov), caixa = $('.popup', ov);
    const TXT_INCOMPLETO = 'Preencha os dados para enviar', TXT_COMPLETO = 'Enviar dados';
    // O que falta, na ordem da tela. Nome: pelo menos duas palavras; WhatsApp: celular brasileiro com DDD; situação e autorização marcadas.
    const faltando = () => {
      const f = form, itens = [];
      if (f.nome.value.trim().split(/\s+/).filter((p) => p.length >= 2).length < 2) itens.push({ campo: 'nome', rotulo: 'nome e sobrenome', foco: f.nome });
      if (!phoneOk(f.telefone.value.trim())) itens.push({ campo: 'telefone', rotulo: 'WhatsApp', foco: f.telefone });
      if (!f.querySelector('input[name="situacao"]:checked')) itens.push({ campo: 'situacao', rotulo: 'a situação das parcelas', foco: f.querySelector('input[name="situacao"]') });
      if (!f.lgpd.checked) itens.push({ campo: 'lgpd', rotulo: 'a autorização de contato', foco: f.lgpd });
      return itens;
    };
    const lista = (a) => (a.length > 1 ? a.slice(0, -1).join(', ') + ' e ' + a[a.length - 1] : a[0]);
    // Botão "apagado" sem desabilitar (o clique ainda mostra o aviso): muda o TEXTO, a borda (tracejada) e a cor, não só a cor.
    function atualizarBotao() {
      const falta = faltando(), ok = falta.length === 0;
      btnEnvio.setAttribute('aria-disabled', ok ? 'false' : 'true');
      if (!btnEnvio.dataset.enviando) btnEnvio.textContent = ok ? TXT_COMPLETO : TXT_INCOMPLETO;
      $$('.field[data-campo]', form).forEach((c) => { if (c.classList.contains('invalid') && !falta.some((x) => x.campo === c.dataset.campo)) c.classList.remove('invalid'); });
      if (ok) { caixa.classList.remove('pp-erro'); if (aviso.classList.contains('bad')) setMsg(aviso, ''); }
    }
    form.addEventListener('input', atualizarBotao); form.addEventListener('change', atualizarBotao);
    atualizarBotao();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target, msg = aviso;
      const sit = f.querySelector('input[name="situacao"]:checked');
      // Mesmos nomes de campo e valores da calculadora (o CRM marca URGENTE se atrasado ou busca e apreensão).
      const SITUACAO = {
        'Em dia': { parcelas_em_dia: 'Em dia', busca_apreensao: '' },
        'Atrasadas': { parcelas_em_dia: 'Atrasadas', busca_apreensao: '' },
        'Veículo com busca e apreensão': { parcelas_em_dia: '', busca_apreensao: 'Já tem processo de busca e apreensão' },
      };
      const falta = faltando();
      if (falta.length) { // não envia: lista o que falta, destaca cada campo (borda tracejada + texto) e leva o foco ao primeiro
        $$('.field[data-campo]', f).forEach((c) => c.classList.toggle('invalid', falta.some((x) => x.campo === c.dataset.campo)));
        caixa.classList.add('pp-erro');
        setMsg(msg, `Falta preencher: ${lista(falta.map((x) => x.rotulo))}.`, 'bad');
        falta[0].foco.focus();
        return;
      }
      const d = { nome: f.nome.value.trim(), telefone: f.telefone.value.trim(), ...(sit ? SITUACAO[sit.value] : {}) };
      const btn = btnEnvio;
      btn.disabled = true; btn.dataset.enviando = '1'; btn.textContent = 'Enviando…'; setMsg(msg, 'Enviando…');
      const ok = await enviarLead('popup-entrada', { ...d, lgpd_aceite: 'sim', status: 'novo' });
      btn.disabled = false; delete btn.dataset.enviando; atualizarBotao();
      if (!ok) return setMsg(msg, MSG_FALHA, 'bad'); // dados continuam no formulário
      f.reset(); atualizarBotao();
      setMsg(msg, 'Recebemos seus dados! Em breve um especialista falará com você.', 'ok');
      setTimeout(close, 2600);
    });
  }
  setTimeout(open, 2500);
})();
