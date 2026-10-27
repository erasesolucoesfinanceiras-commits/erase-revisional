/* ERASE Revisional — comportamento comum a todas as páginas.
 * Tema, menu, "Veja mais", newsletter, Fale Conosco, WhatsApp e pop-up de entrada.
 */

// Envio de leads ao CRM, Turnstile, atribuição e utilidades ($, $$, maskPhone, phoneOk, waLink) ficam em crm.js (carregado antes deste arquivo).


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
// Capa (2 colunas): mostra cards até a coluna de artigos alcançar a altura da barra lateral; o botão só sobra se ainda houver card escondido.
const lista = $('#lista-artigos'), lateral = $('.home-grid .side-col');
function preencher() {
  if (!more || !lista || !lateral) return;
  const lado = lateral.getBoundingClientRect().top - lista.getBoundingClientRect().top < 40; // celular: barra lateral fica embaixo
  if (lado) for (const el of $$('[data-extra][hidden]')) { if (lista.offsetHeight >= lateral.offsetHeight) break; el.removeAttribute('hidden'); }
  more.hidden = !$('[data-extra][hidden]');
}
preencher(); addEventListener('load', preencher); addEventListener('resize', preencher);
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
    nl.reset(); setMsg(msg, 'Quase lá! Enviamos um e-mail para confirmar a sua inscrição. Confira também o spam.', 'ok');
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
    sbn.reset(); atualizar(); setMsg(msg, 'Quase lá! Enviamos um e-mail para confirmar a sua inscrição. Confira também o spam.', 'ok');
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
  const caminho = location.pathname.replace(/\.html$/, '').replace(/\/$/, '');
  if (/^\/(privacidade|termos|sobre|contato|como-produzimos|analise)$/.test(caminho)) return; // páginas institucionais/legais: nunca
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
          <form id="popup-form" novalidate data-clarity-mask="true">
            <div class="pp-head">
              <p class="free-badge">ANÁLISE TOTALMENTE GRATUITA</p>
              <h2 id="popup-title">Seu financiamento merece uma segunda olhada</h2>
              <p class="popup-sub">Deixe seus dados e um especialista da ERASE fala com você. Sem compromisso.</p>
            </div>
            <div class="pp-fields">
              <div class="field" data-campo="nome"><label for="pp-nome">Seu nome <span class="req">*</span></label><input id="pp-nome" name="nome" maxlength="80" placeholder="Ex.: Maria" autocomplete="name" aria-required="true" aria-describedby="pp-err-nome"><span class="req req-in" aria-hidden="true">*</span><small class="err" id="pp-err-nome">Informe seu nome</small></div>
              <div class="field" data-campo="telefone"><label for="pp-tel">WhatsApp <span class="req">*</span></label><input id="pp-tel" name="telefone" maxlength="15" inputmode="tel" placeholder="(81) 99999-9999" autocomplete="tel" aria-required="true" aria-describedby="pp-err-tel"><span class="req req-in" aria-hidden="true">*</span><small class="err" id="pp-err-tel">Informe DDD + número com 9 dígitos</small></div>
              <input type="text" name="bot-field" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
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
    // O que falta, na ordem da tela. Nome: pelo menos 2 letras; WhatsApp: celular brasileiro com DDD; situação e autorização marcadas.
    const faltando = () => {
      const f = form, itens = [];
      if (f.nome.value.replace(/[^\p{L}]/gu, '').length < 2) itens.push({ campo: 'nome', rotulo: 'seu nome', foco: f.nome });
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
      if (form['bot-field'] && form['bot-field'].value) return; // honeypot preenchido: é robô, descarta sem avisar
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
  // artigos e notas do Radar: só depois de rolar cerca de metade do texto; demais páginas (capa etc.): 2,5 s como sempre
  if (caminho.startsWith('/noticias/') || caminho === '/radar') {
    const texto = $('main article') || $('main');
    const passouDaMetade = () => { const r = texto.getBoundingClientRect(); return r.height > 0 && (innerHeight - r.top) / r.height >= 0.5; };
    const vigia = () => { if (passouDaMetade()) { removeEventListener('scroll', vigia); open(); } };
    addEventListener('scroll', vigia, { passive: true });
  } else setTimeout(open, 2500);
})();

// ---- Medição: Google Analytics (<body data-ga>) e Meta Pixel (<body data-pixel>, só se houver ID em data/config.json) carregam ao abrir a página ----
// Sem aviso nem escolha de cookies (base legal: legítimo interesse, ver Política de Privacidade). Sem ID nenhum, nada é carregado.
(function medicao() {
  const id = document.body.dataset.ga, pixel = document.body.dataset.pixel;
  if (id && !window.gtag) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    const sc = document.createElement('script'); sc.async = true; sc.src = 'https://www.googletagmanager.com/gtag/js?id=' + id; document.head.appendChild(sc);
    window.gtag('js', new Date()); window.gtag('config', id);
  }
  if (pixel && !window.fbq) { // snippet padrão do Meta Pixel
    const n = window.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
    if (!window._fbq) window._fbq = n; n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
    const sc = document.createElement('script'); sc.async = true; sc.src = 'https://connect.facebook.net/en_US/fbevents.js'; document.head.appendChild(sc);
    window.fbq('init', pixel); window.fbq('track', 'PageView');
  }
})();
