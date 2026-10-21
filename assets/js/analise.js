/* /analise/ — chat de filtro para anúncios. 4 perguntas (botões), primeiro nome + WhatsApp, envio ao CRM (origem "formulario-analise-revisional")
 * e abertura do WhatsApp da ERASE com as respostas. Usa main.js: enviarLead, phoneOk, maskPhone, waLink, ultimoErroCRM, $ e $$.
 * ?debug=1 mostra o resultado do envio (CRM e Turnstile, com o código de erro da Cloudflare) e não abre o WhatsApp sozinho; sem isso, a pessoa segue para o WhatsApp sem ver erro. */
(function analise() {
  const raiz = $('#chat');
  if (!raiz) return;
  const log = $('#chat-log'), acoes = $('#chat-acoes'), prog = $('#chat-progresso');
  const debug = new URLSearchParams(location.search).get('debug') === '1';
  const reduzir = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ORIGEM = 'formulario-analise-revisional', LIMITE_MS = 5000;
  const R = {}; // respostas em texto

  const PERGUNTAS = [
    { id: 'veiculo', texto: 'Que veículo você financiou?', opcoes: ['Carro', 'Moto', 'Caminhão ou máquina agrícola'] },
    { id: 'parcelas', texto: 'Como estão as parcelas?', opcoes: ['Em dia', 'Atrasadas', 'Com busca e apreensão'] },
    { id: 'contrato', texto: 'Você tem o contrato do financiamento?', opcoes: ['Sim, em papel ou PDF', 'Não, mas posso pedir ao banco', 'Não tenho'],
      dicas: { 'Não, mas posso pedir ao banco': 'O banco é obrigado a fornecer uma cópia do seu contrato quando você pede.', 'Não tenho': 'Sem problema: peça uma cópia ao banco (aplicativo, central de atendimento ou agência) e, se não conseguir, a gente orienta você no WhatsApp.' } },
    { id: 'acao', texto: 'Já entrou com ação revisional antes?', opcoes: ['Sim', 'Não'] },
  ];

  // a área de botões é fixa no rodapé: as mensagens rolam até ficar acima dela
  if (window.ResizeObserver) new ResizeObserver(() => document.documentElement.style.setProperty('--acoes-h', acoes.offsetHeight + 'px')).observe(acoes);
  prepararTurnstile(); // o token do Turnstile já nasce ao abrir a página: na hora do envio ele está pronto (renova sozinho se vencer)
  const esperar = (ms) => new Promise((r) => setTimeout(r, reduzir ? 0 : ms));
  const rolar = () => { const u = log.lastElementChild; if (u) u.scrollIntoView({ block: 'end', behavior: reduzir ? 'auto' : 'smooth' }); };
  const rolarDepois = () => { rolar(); setTimeout(rolar, 80); setTimeout(rolar, 300); }; // a área fixa de botões muda de altura logo depois de aparecer
  function bolha(quem, conteudo, html) {
    const d = document.createElement('div');
    d.className = `chat-msg ${quem}`;
    if (html) d.innerHTML = conteudo; else d.textContent = conteudo;
    log.appendChild(d); rolar(); return d;
  }
  /** Mensagem do robô com "digitando…" curto. `html` só recebe texto fixo daqui (nunca texto digitado pela pessoa). */
  async function bot(html, ms = 550) {
    const t = document.createElement('div'); t.className = 'chat-msg bot chat-digitando'; t.setAttribute('aria-hidden', 'true'); t.innerHTML = '<i></i><i></i><i></i>';
    log.appendChild(t); rolar(); await esperar(ms); t.remove();
    return bolha('bot', html, true);
  }
  const progresso = (n) => { prog.textContent = n ? `Pergunta ${n} de ${PERGUNTAS.length}` : ' '; };

  function opcoes(lista) {
    return new Promise((resolve) => {
      acoes.innerHTML = '';
      const ul = document.createElement('div'); ul.className = 'chat-opcoes'; ul.setAttribute('role', 'group');
      lista.forEach((o) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'chat-opt'; b.textContent = o;
        b.addEventListener('click', () => { acoes.innerHTML = ''; resolve(o); }, { once: true });
        ul.appendChild(b);
      });
      acoes.appendChild(ul);
      const p = ul.firstChild; if (p && !reduzir) p.focus({ preventScroll: true });
      rolarDepois();
    });
  }

  const CODIGO = { 'Sim, em papel ou PDF': 'sim', 'Não, mas posso pedir ao banco': 'buscando', 'Não tenho': 'nao' };
  const EVENTO_PIXEL = { sim: 'RevLeadQualificado', buscando: 'RevLeadBuscandoContrato', nao: 'RevLeadNaoQualificado' };

  async function conversa() {
    await bot('Olá! Aqui é a ERASE. Vou fazer uma <strong>ANÁLISE GRATUITA</strong> do seu financiamento. São só 4 perguntas rápidas.', 400);
    for (let i = 0; i < PERGUNTAS.length; i++) {
      const q = PERGUNTAS[i];
      progresso(i + 1);
      await bot(q.texto);
      const r = await opcoes(q.opcoes);
      bolha('eu', r); R[q.id] = r;
      if (q.dicas && q.dicas[r]) await bot(q.dicas[r]);
      if (q.id === 'parcelas' && r !== 'Em dia') await bot('Entendi. Pelo que você contou, o caso é <strong>urgente</strong>: vamos priorizar o seu atendimento.');
    }
    progresso(0);
    await bot('Para finalizar, me diga só o seu <strong>primeiro nome</strong> e o seu <strong>WhatsApp</strong>. Um especialista da ERASE manda a sua <strong>ANÁLISE GRATUITA</strong> por lá.');
    formulario();
  }

  function formulario() {
    acoes.innerHTML = `<form id="chat-form" novalidate>
<input type="text" name="bot-field" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
<label for="ch-nome">Seu primeiro nome</label>
<input id="ch-nome" name="nome" maxlength="40" autocomplete="given-name" placeholder="Ex.: Maria" required>
<label for="ch-wa">Seu WhatsApp (com DDD)</label>
<input id="ch-wa" name="whatsapp" inputmode="tel" maxlength="15" autocomplete="tel" placeholder="(81) 99999-9999" required>
<p class="chat-aviso" id="chat-aviso" role="alert"></p>
<button class="btn btn-primary btn-block chat-enviar" type="submit">Receber minha ANÁLISE GRATUITA no WhatsApp</button>
<p class="chat-legal">Ao enviar, você concorda com a <a href="/privacidade" target="_blank" rel="noopener">Política de Privacidade</a>: usamos seus dados só para a análise e para falar com você.</p>
</form>`;
    const f = $('#chat-form'), aviso = $('#chat-aviso'), btn = $('.chat-enviar', f);
    maskPhone(f.whatsapp);
    rolarDepois();
    if (!reduzir) f.nome.focus({ preventScroll: true });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (f['bot-field'].value) return; // honeypot preenchido: é robô, descarta sem avisar
      const nome = f.nome.value.trim().split(/\s+/)[0] || '', wa = f.whatsapp.value.trim();
      if (!/^\p{L}{2,}/u.test(nome)) { aviso.textContent = 'Informe o seu primeiro nome (mínimo 2 letras).'; f.nome.focus(); return; }
      if (!phoneOk(wa)) { aviso.textContent = 'Informe um WhatsApp válido, com DDD e 9 dígitos.'; f.whatsapp.focus(); return; }
      aviso.textContent = '';
      btn.disabled = true; btn.textContent = 'Enviando…'; f.inert = true;
      await finalizar(nome, wa);
    });
  }

  async function finalizar(nome, wa) {
    const contrato = CODIGO[R.contrato] || 'nao', urgente = R.parcelas === 'Em dia' ? 'nao' : 'sim';
    const respostas = `Veículo: ${R.veiculo} | Parcelas: ${R.parcelas} | Contrato: ${R.contrato} | Ação revisional anterior: ${R.acao}`;
    const dados = { nome, whatsapp: wa, telefone: wa, lgpd_aceite: 'sim', veiculo: R.veiculo, parcelas: R.parcelas, contrato, acao_anterior: R.acao, qualificado: contrato, urgente, respostas };
    const leadId = uuid(); // vai ao CRM como lead_id e ao Pixel como eventID: a API de Conversões do CRM usa o mesmo id e a Meta não conta em dobro
    // O evento sai assim que a pessoa envia (não espera o CRM): qualificado = contrato em mãos ('sim'); cada resposta dispara um só evento, com o nome exato.
    try { if (typeof fbq === 'function') fbq('trackCustom', EVENTO_PIXEL[contrato], { urgente, veiculo: R.veiculo, parcelas: R.parcelas, contrato }, { eventID: leadId }); } catch (e) { /* o Pixel nunca atrapalha */ }
    const ok = await enviarLead(ORIGEM, dados, { limiteMs: LIMITE_MS, leadId }); // sem sucesso ou passou de 5 s: segue para o WhatsApp mesmo assim
    const texto = `Olá! Meu nome é ${nome}. Quero a ANÁLISE GRATUITA do meu financiamento.\n${respostas.replace(/ \| /g, '\n')}${urgente === 'sim' ? '\nURGENTE' : ''}`;
    const link = waLink(texto);
    acoes.innerHTML = '';
    bolha('eu', `${nome} · ${wa}`);
    await bot(`Pronto, ${nome.replace(/[<>&]/g, '')}! Abrindo o WhatsApp da ERASE com as suas respostas para a sua <strong>ANÁLISE GRATUITA</strong>.`, 300);
    const a = document.createElement('a'); a.className = 'btn btn-wa btn-block chat-wa'; a.href = link; a.textContent = 'Abrir o WhatsApp agora';
    acoes.appendChild(a); rolarDepois();
    if (debug) { const d = document.createElement('p'); d.className = 'chat-debug'; d.textContent = `debug: crm=${ok ? 'confirmou' : 'não confirmou (' + (ultimoErroCRM || 'sem detalhe') + ')'}; turnstile=${tsStatus || 'não usado'}. Nada foi aberto sozinho.`; acoes.appendChild(d); return; }
    setTimeout(() => { location.href = link; }, 900);
  }

  conversa();
})();
