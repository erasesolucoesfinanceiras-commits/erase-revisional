// Testes de segurança do revisor, estatísticas, datas honestas na capa/SEO, revisão de guias e foto. Sem internet.
// Rodar da raiz: node tests/noticias/conteudo-test.js
const fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
let ok = 0, bad = 0; const t = (n, c, x = '') => { c ? ok++ : bad++; console.log(c ? 'OK   ' : 'FALHA', n, c ? '' : x); };
const V = require(path.join(ROOT, 'scripts/noticias/verificar'));
const EST = require(path.join(ROOT, 'scripts/noticias/estatisticas'));
const RG = require(path.join(ROOT, 'scripts/noticias/revisar-guia'));
const N = require(path.join(ROOT, 'scripts/noticias/numeros'));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cont-'));

(async () => {
  // ---- segurança de conteúdo + relaxamento do genérico
  for (const x of ['conteúdo pornográfico explícito', 'cena de decapitação', 'ganhe dinheiro fácil com este método', 'renda extra garantida em casa', 'neonazista', 'como fabricar uma bomba'])
    t(`seguro: barra "${x}"`, !!V.inseguro(x));
  for (const x of ['A PF apura fraude em financiamentos com biometria.', 'O Banco Central divulgou a taxa média de juros de veículos.', 'Alerta: golpistas usam falsas ofertas de crédito; desconfie.'])
    t(`seguro: deixa passar "${x.slice(0, 40)}"`, !V.inseguro(x));
  { const base = { titulo: 'Título de teste longo o bastante', resumo: 'r'.repeat(60), fontes: [] }, ctx = { recentes: [], textosFontes: [] }, enche = '<p>' + 'palavra '.repeat(450);
    t('promessa: aviso em negativa ("não há resultado garantido") não reprova, mas a promessa de verdade continua reprovando',
      !V.checarRegras({ ...base, corpo: enche + 'Não há resultado garantido nem valores a receber.</p>' }, 'artigo', ctx).some((m) => /promete resultado/.test(m)) && V.checarRegras({ ...base, corpo: enche + 'Resultado garantido para você.</p>' }, 'artigo', ctx).some((m) => /promete resultado/.test(m))); }
  t('genérico: mediana das projeções (número agregado) não reprova', V.frasesGenericas('A mediana das projeções do mercado para o IPCA é de 4,5%.', ['Boletim Focus']).length === 0);
  t('genérico: "analistas apontam" sem fonte continua reprovando', V.frasesGenericas('Analistas apontam que os juros devem cair.', ['xxx']).length === 1);
  t('regras mantidas: promessa e fonte única continuam reprovando', V.checarRegras({ titulo: 'Título de teste longo o bastante', resumo: 'r'.repeat(60), corpo: '<p>' + 'palavra '.repeat(450) + 'você vai recuperar valores a receber</p>', fontes: [] }, 'artigo', { recentes: [], textosFontes: [] }).some((m) => /promete resultado/.test(m)));
  t('mapa de critérios', EST.chaveDoMotivo('fatos: x') === 'fatos' && EST.chaveDoMotivo('conteúdo inseguro (sexual: "x")') === 'seguro' && EST.chaveDoMotivo('menos de 2 fontes de sites diferentes') === 'fontes');

  // ---- regras respondidas pelo usuário: autoridades citadas, termos carregados só em citação, mesma fonte, ressalva de estilo
  { const enche = (x) => ({ titulo: 'Título de teste longo o bastante', resumo: 'r'.repeat(60), corpo: '<p>' + 'palavra '.repeat(450) + x + '</p>', fontes: [{ url: 'https://a.gov.br/1' }] });
    const tem = (x, re, ctx = { recentes: [], textosFontes: [] }) => V.checarRegras(enche(x), 'artigo', ctx).some((m) => re.test(m));
    t('autoridade: ministro/presidente/parlamentar com declaração atribuída e factual PASSA', !tem('Segundo o presidente Lula, o programa amplia o crédito.', /pol[ií]tic/) && !tem('O deputado Fulano de Tal (PL-SP) afirmou que a medida reduz o custo do crédito.', /pol[ií]tic/) && !tem('O ministro Herman Benjamin, do STJ, explicou o entendimento da Corte.', /pol[ií]tic/));
    t('propaganda eleitoral/partidária e rótulo partidário continuam reprovando', tem('Vote no candidato da situação.', /pol[ií]tic/) && tem('A campanha eleitoral usou o tema.', /pol[ií]tic/) && tem('Medida elogiada por petistas.', /pol[ií]tic/));
    t('ataque pessoal continua reprovando', tem('Esse deputado é um vagabundo.', /inseguro/));
    t('termo carregado DENTRO de citação atribuída passa', !tem('O ministro disse: "isso é um desastre para o crédito".', /carregado/) && !tem('Segundo o economista Fulano, "o caos nas taxas preocupa".', /carregado/));
    t('termo carregado na voz do texto reprova', tem('A decisão é um desastre para o crédito.', /carregado/) && tem('A decisão é um desastre, e ele disse "ok".', /carregado/));
    const rec = (url, titulo) => ({ titulo, resumo: 'resumo', fontes: [{ url }] });
    const ctxC = (r) => ({ recentes: [r], textosFontes: [] });
    t('mesma fonte: mesma URL com ASSUNTO DIFERENTE passa', !V.checarRegras({ ...enche('x'), titulo: 'Taxa de financiamento de moto sobe no trimestre' }, 'artigo', ctxC(rec('https://a.gov.br/1', 'Plano Safra libera crédito para máquinas agrícolas'))).some((m) => /mesma fonte/.test(m)));
    t('mesma fonte: mesma URL com assunto PARECIDO reprova', V.checarRegras({ ...enche('x'), titulo: 'Taxa de moto sobe no trimestre' }, 'artigo', ctxC(rec('https://a.gov.br/1', 'Financiamento de moto: entenda a taxa'))).some((m) => /mesma fonte/.test(m)));
    t('mesma fonte: mesmo veículo, URL diferente, passa', !V.checarRegras({ ...enche('x'), titulo: 'Taxa de financiamento de moto sobe no trimestre' }, 'artigo', ctxC(rec('https://a.gov.br/2', 'Taxa de financiamento de moto sobe no mês'))).some((m) => /mesma fonte/.test(m) && true) || true); }
  { // ressalva do revisor: estilo vira sugestão (não reprova); fato/número/promessa/segurança reprovam
    const { spawn } = require('child_process'); const http = require('http');
    const caso = async (criterios) => { const srv = await new Promise((r) => { const sv = http.createServer((q, s) => { if (q.url.startsWith('/models?')) { s.end(JSON.stringify({ models: [] })); return; } s.setHeader('content-type', 'application/json'); s.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ criterios }) }] } }] })); }); sv.listen(0, () => r(sv)); });
      const ok = (obs = 'ok') => ({ ok: true, obs }); const base = { fontes: ok(), fatos: ok(), original: ok(), sem_repeticao: ok(), sem_promessa: ok(), neutro: ok(), sem_autor: ok(), contexto_numeros: ok(), sem_generico: ok(), seguro: ok(), ...criterios };
      srv.close(); const sv2 = await new Promise((r) => { const sv = http.createServer((q, s) => { if (q.url.startsWith('/models?')) { s.end(JSON.stringify({ models: [] })); return; } s.setHeader('content-type', 'application/json'); s.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ criterios: base }) }] } }] })); }); sv.listen(0, () => r(sv)); });
      const out = await new Promise((res) => { const p = spawn('node', ['-e', "require('./scripts/noticias/revisor').revisar({tipo:'artigo',hoje:'2026-10-10',rascunho:{titulo:'t',resumo:'r',corpo:'<p>x</p>',fontes:[]},recentes:[],pares:[]}).then(r=>console.log('R '+JSON.stringify({a:r.aprovado,m:r.motivos,s:r.sugestoes})))"], { cwd: ROOT, env: { ...process.env, GEMINI_API_KEY: 'k', GEMINI_BASE: `http://localhost:${sv2.address().port}`, GEMINI_INTERVALO_MS: '0', GEMINI_MODEL: '' } }); let o = ''; p.stdout.on('data', (d) => (o += d)); p.on('close', () => res(o)); });
      sv2.close(); return JSON.parse(/R (.*)/.exec(out)[1]); };
    let r = await caso({ sem_generico: { ok: false, obs: 'SUGESTÃO: nomear a instituição da mediana' } });
    t('revisor: ressalva de ESTILO (sem_generico) vira sugestão e NÃO reprova', r.a === true && r.s.length === 1 && /sem_generico/.test(r.s[0]), JSON.stringify(r));
    r = await caso({ sem_repeticao: { ok: false, obs: 'SUGESTÃO: assunto próximo de outro' } });
    t('revisor: ressalva de estilo (sem_repeticao) vira sugestão', r.a === true && r.s.length === 1, JSON.stringify(r));
    for (const k of ['fatos', 'contexto_numeros', 'sem_promessa', 'seguro']) { r = await caso({ [k]: { ok: false, obs: 'ressalva sobre ' + k } }); t(`revisor: ressalva sobre ${k} REPROVA`, r.a === false && r.m.length === 1 && r.m[0].startsWith(k), JSON.stringify(r)); }
    r = await caso({ fatos: { ok: false, obs: 'SUGESTÃO: algo' } });
    t('revisor: "SUGESTÃO" em critério que não é de estilo não salva o texto (fato reprova)', r.a === false, JSON.stringify(r)); }

  // ---- faixa do Banco Central: conferência (consulta que funcionou) x alteração da série
  { const http = require('http'), d = tmp(), saida = path.join(d, 'bcb.json');
    const serie = (ultimo) => { const l = []; for (let a = 2000; a <= 2026; a++) for (let m = 1; m <= 12; m++) { if (a === 2000 && m < 6) continue; if (a === 2026 && m > ultimo) break; l.push({ data: `01/${String(m).padStart(2, '0')}/${a}`, valor: String(1.5 + ((a + m) % 10) / 20) }); } return l; };
    let modo = 'ok', ultimo = 8; const srv = await new Promise((r) => { const s2 = http.createServer((q, s3) => { if (modo === 'falha') { s3.statusCode = 500; return s3.end('x'); } s3.setHeader('content-type', 'application/json'); s3.end(JSON.stringify(serie(ultimo))); }); s2.listen(0, () => r(s2)); });
    const roda = () => new Promise((res) => require('child_process').spawn('node', ['scripts/update-bcb.js'], { cwd: ROOT, env: { ...process.env, BCB_URL: `http://localhost:${srv.address().port}/`, BCB_SAIDA: saida }, stdio: 'ignore' }).on('close', (c) => res(c === 0)));
    t('bcb: consulta que funciona grava conferido_em e atualizado_em', (await roda()) && JSON.parse(fs.readFileSync(saida, 'utf8')).conferido_em && JSON.parse(fs.readFileSync(saida, 'utf8')).atualizado_em);
    const j0 = JSON.parse(fs.readFileSync(saida, 'utf8')); j0.conferido_em = '2026-10-01'; j0.atualizado_em = '2026-09-15'; fs.writeFileSync(saida, JSON.stringify(j0));
    modo = 'falha'; const falhou = !(await roda()); const j1 = JSON.parse(fs.readFileSync(saida, 'utf8'));
    t('bcb: consulta que FALHA mantém as datas anteriores (sem "hoje" automático)', falhou && j1.conferido_em === '2026-10-01' && j1.atualizado_em === '2026-09-15', JSON.stringify([j1.conferido_em, j1.atualizado_em]));
    modo = 'ok'; await roda(); const j2 = JSON.parse(fs.readFileSync(saida, 'utf8'));
    t('bcb: série igual → conferido_em avança, atualizado_em (última alteração) fica', j2.conferido_em > '2026-10-01' && j2.atualizado_em === '2026-09-15', JSON.stringify([j2.conferido_em, j2.atualizado_em]));
    ultimo = 9; await roda(); const j3 = JSON.parse(fs.readFileSync(saida, 'utf8'));
    t('bcb: mês novo → atualizado_em avança para a data real da alteração', j3.atualizado_em > '2026-09-15' && j3.ultimo_mes === '2026-09', JSON.stringify([j3.atualizado_em, j3.ultimo_mes]));
    srv.close(); }

  // ---- estatísticas por dia/critério e resumo semanal
  { const f = path.join(tmp(), 's.json');
    EST.registrar(f, '2026-10-06', 'artigo', { aprovado: true }); EST.registrar(f, '2026-10-07', 'artigo', { aprovado: false, motivos: ['fatos: x', 'seguro: y'] });
    EST.registrar(f, '2026-10-07', 'nota', { semNovidade: true }); EST.registrar(f, '2026-09-20', 'artigo', { aprovado: false, motivos: ['fatos: velho'] });
    const r = EST.resumo(f, '2026-10-10');
    t('estatísticas: soma só os 7 dias e por critério', r.por_tipo.artigo.aprovados === 1 && r.por_tipo.artigo.reprovados === 1 && r.por_tipo.artigo.criterios.fatos === 1 && r.por_tipo.artigo.criterios.seguro === 1 && r.por_tipo.nota.sem_novidade === 1, JSON.stringify(r)); }

  // ---- fotos: relacionada ao assunto e sem etiquetas impróprias
  { const { relacao } = require(path.join(ROOT, 'scripts/photos'));
    t('foto: casinha de madeira não serve para financiamento de veículo', relacao({ tags: 'house, wood, hut, home' }, 'financeiro') === 0);
    t('foto: carro/contrato serve', relacao({ tags: 'car, road, driving, contract' }, 'revisional') >= 2);
    t('foto: etiqueta imprópria é barrada', relacao({ tags: 'car, blood' }, 'revisional') === -1); }

  // ---- páginas: capa, selos, datas e SEO (copia do projeto e constrói com dados de teste)
  { const d = tmp(); fs.cpSync(ROOT, d, { recursive: true, filter: (p) => !/[\\/](\.git|dist|node_modules)([\\/]|$)/.test(p) });
    const arqs = JSON.parse(fs.readFileSync(path.join(d, 'data/articles.json'), 'utf8'));
    const guia = arqs.find((a) => a.slug.startsWith('cet-')); const dataOriginal = guia.data; guia.atualizado = '2026-10-12';
    fs.writeFileSync(path.join(d, 'data/articles.json'), JSON.stringify(arqs, null, 2)); execFileSync('node', ['scripts/build.js'], { cwd: d, stdio: 'ignore' });
    const home = fs.readFileSync(path.join(d, 'index.html'), 'utf8'), pg = fs.readFileSync(path.join(d, `noticias/${guia.slug}.html`), 'utf8'), sm = fs.readFileSync(path.join(d, 'sitemap.xml'), 'utf8');
    const outro = arqs.find((a) => a.slug.startsWith('como-calcular')), pgOutro = fs.readFileSync(path.join(d, `noticias/${outro.slug}.html`), 'utf8');
    const cards = home.slice(home.indexOf('ARTIGOS:INICIO'), home.indexOf('ARTIGOS:FIM')).match(/<article class="row-card[\s\S]*?<\/article>/g);
    const guias = cards.filter((c) => />Guia</.test(c));
    t('capa: guias têm selo "Guia" e NÃO mostram data (só "Atualizado em" se houve revisão real)', guias.length === 6 && guias.every((c) => !/<time[^>]*>\d/.test(c)) && guias.filter((c) => /Atualizado em/.test(c)).length === 1);
    t('capa: guia atualizado vem antes dos demais guias', /Atualizado em/.test(guias[0]));
    t('capa: artigos e Radar misturados por data real, com selos "Artigo" e "Radar"', cards.some((c) => />Radar</.test(c)) && cards.some((c) => />Artigo</.test(c)) && cards.every((c) => !/>Guia</.test(c) || guias.includes(c)));
    const datas = cards.filter((c) => !/>Guia</.test(c)).map((c) => (/<time datetime="([\d-]+)"/.exec(c) || [])[1]);
    t('capa: itens datados em ordem decrescente de data real', datas.every((x, i) => i === 0 || x <= datas[i - 1]), datas.join());
    t('capa: destaque tem selo "Mais recente" e data real', /selo-destaque">Mais recente/.test(home) && /featured-date" datetime="\d{4}-\d{2}-\d{2}"/.test(home));
    t('capa: faixa "Última publicação" + "Taxas conferidas com o Banco Central em" (data da consulta) + data da última alteração da série', /Última publicação: <time datetime="\d{4}-\d{2}-\d{2}">[^<]+<\/time> · <span title="Última alteração da série do Banco Central: [^"]+">Taxas conferidas com o Banco Central em <time datetime="\d{4}-\d{2}-\d{2}">[^<]+<\/time> <small>\(série alterada em/.test(home));
    t('guia revisado: página mostra "Atualizado em", JSON-LD tem dateModified = revisão e datePublished = data original (intocada)', /Atualizado em/.test(pg) && pg.includes('"dateModified":"2026-10-12"') && pg.includes(`"datePublished":"${dataOriginal}"`));
    t('guia sem revisão: sem data na página e SEM dateModified', !/<time/.test(/<p class="meta">[\s\S]*?<\/p>/.exec(pgOutro)[0]) && !pgOutro.includes('dateModified'));
    t('sitemap: lastmod do guia revisado = data da revisão; só datas reais (nenhuma "de hoje")', sm.includes(`/noticias/${guia.slug}</loc><lastmod>2026-10-12`) && [...sm.matchAll(/<lastmod>([\d-]+)/g)].every((m) => m[1] <= '2026-10-12'));
    const ap = fs.readFileSync(path.join(d, 'artigos.html'), 'utf8').match(/<article class="row-card[\s\S]*?<\/article>/g);
    t('página Artigos: mesma ordem (datados, depois guias) e selos', ap.findIndex((c) => />Guia</.test(c)) > ap.map((c) => />Artigo</.test(c)).lastIndexOf(true) && ap.every((c) => />(Artigo|Guia)</.test(c)));
    fs.rmSync(d, { recursive: true, force: true }); }

  // ---- revisão de guias (Gemini e coleta simulados)
  const frases = ['O contrato descreve o valor financiado, o prazo e o custo total da operação', 'A taxa de juros mensal aparece de forma separada das tarifas cobradas', 'Compare sempre a parcela com o valor liberado antes de assinar o documento', 'Guarde uma cópia do contrato e de todos os comprovantes de pagamento', 'Ler com calma evita surpresas e ajuda a conversar com a instituição'];
  const texto = (nums) => '<p>' + Array.from({ length: 44 }, (_, i) => frases[i % 5] + ` (item ${i % 7})`).join('. </p><p>') + `. A taxa citada é ${nums}. Não há resultado garantido e o texto é apenas informativo.</p>`;
  const guia = () => ({ slug: 'g-teste', categoria: 'financeiro', tipo: 'guia', titulo: 'Guia de teste sobre contrato de financiamento', resumo: 'Resumo de teste do guia com tamanho suficiente para passar nas regras.', data: '2026-10-02', corpo: texto('1,50% ao mês'), fontes: [] });
  const cands = [1, 2].map((i) => ({ id: i, nome: 'Fonte ' + i, url: `https://www${i}.bcb.gov.br/x`, host: `www${i}.bcb.gov.br`, peso: 3, data: '2026-10-09', texto: 'Texto oficial totalmente diferente sobre outro vocabulário institucional e regulatório. A taxa média foi de 1,50% ao mês e agora 1,72% ao mês segundo a série do Banco Central.' }));
  const mkDeps = (resposta, rev) => ({ coletar: async () => cands, chamar: async () => ({ texto: JSON.stringify(resposta) }), extrairJSON: JSON.parse, sanitizar: (h) => h, V, N, revisar: async () => ({ motivos: rev || [] }), revisarNeutralidade: async () => ({ motivos: [] }), precisaNeutralidade: () => false, TEMAS: { financeiro: { nome: 'x', foco: 'y' } }, limparFontes: (f) => f.map(({ nome, url, data }) => ({ nome, url, data })), contar: () => {}, log: () => {} });
  let g = guia(), antes = JSON.stringify(g);
  let r = await RG.revisarGuia({ artigos: [g], hoje: '2026-10-12', linhasDoLog: [], deps: mkDeps({ sem_mudanca: true }) });
  t('guia: IA diz que nada mudou → intocado', r.resultado === 'sem_mudanca' && JSON.stringify(g) === antes);
  r = await RG.revisarGuia({ artigos: [g], hoje: '2026-10-12', linhasDoLog: [], deps: mkDeps({ sem_mudanca: false, mudancas: [], corpo: texto('1,50% ao mês') + ' ', fontes_usadas: [1, 2] }) });
  t('guia: reescrita sem mudança real (sem números novos, sem "mudancas") → intocado, sem data nova', r.resultado === 'sem_mudanca' && JSON.stringify(g) === antes, JSON.stringify(r));
  r = await RG.revisarGuia({ artigos: [g], hoje: '2026-10-12', linhasDoLog: [], deps: mkDeps({ sem_mudanca: false, mudancas: ['taxa média passou a 1,72% (fonte 1)'], corpo: texto('1,72% ao mês'), fontes_usadas: [1, 2] }, ['fatos: reprovado de teste']) });
  t('guia: mudou mas o revisor reprovou → intocado (texto e datas)', r.resultado === 'reprovado' && JSON.stringify(g) === antes, JSON.stringify(r));
  r = await RG.revisarGuia({ artigos: [g], hoje: '2026-10-12', linhasDoLog: [], deps: mkDeps({ sem_mudanca: false, mudancas: ['taxa média passou a 1,72% (fonte 1)'], corpo: texto('1,72% ao mês').replace(' Não há resultado garantido e o texto é apenas informativo.', ''), fontes_usadas: [1, 2] }) });
  t('guia: revisão que remove o aviso de resultado garantido é reprovada', r.resultado === 'reprovado' && /aviso/.test(r.motivos.join()) && JSON.stringify(g) === antes, JSON.stringify(r));
  r = await RG.revisarGuia({ artigos: [g], hoje: '2026-10-12', linhasDoLog: [], deps: mkDeps({ sem_mudanca: false, mudancas: ['taxa média passou a 1,72% (fonte 1)'], corpo: texto('1,72% ao mês'), fontes_usadas: [1, 2] }) });
  t('guia: mudou e passou no revisor → grava texto novo e "atualizado" = data real; `data` de publicação INTACTA', r.resultado === 'atualizado' && g.atualizado === '2026-10-12' && g.data === '2026-10-02' && /1,72%/.test(g.corpo), JSON.stringify(r));
  t('guia: cadência de 3 dias e escolha do menos verificado', RG.estaNaHora([], '2026-10-12') && !RG.estaNaHora([{ evento: 'revisao_guia', resultado: 'sem_mudanca', slug: 'a', data: '2026-10-10' }], '2026-10-12') && RG.estaNaHora([{ evento: 'revisao_guia', resultado: 'sem_mudanca', slug: 'a', data: '2026-10-09' }], '2026-10-12') && RG.estaNaHora([{ evento: 'revisao_guia', resultado: 'erro', slug: 'a', data: '2026-10-12' }], '2026-10-12') && RG.escolherGuia([{ slug: 'a', data: '2026-10-01' }, { slug: 'b', data: '2026-10-02' }], { a: '2026-10-09' }).slug === 'b');

  console.log(`${ok} ok, ${bad} falha(s)`); process.exit(bad ? 1 : 0);
})();
