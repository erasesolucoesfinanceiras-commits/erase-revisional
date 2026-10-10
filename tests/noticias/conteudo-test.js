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
    t('capa: guias têm selo "Guia" e NÃO mostram data (só "Atualizado em" se houve revisão real)', guias.length === 5 && guias.every((c) => !/<time[^>]*>\d/.test(c)) && guias.filter((c) => /Atualizado em/.test(c)).length === 1);
    t('capa: guia atualizado vem antes dos demais guias', /Atualizado em/.test(guias[0]));
    t('capa: artigos e Radar misturados por data real, com selos "Artigo" e "Radar"', cards.some((c) => />Radar</.test(c)) && cards.some((c) => />Artigo</.test(c)) && cards.every((c) => !/>Guia</.test(c) || guias.includes(c)));
    const datas = cards.filter((c) => !/>Guia</.test(c)).map((c) => (/<time datetime="([\d-]+)"/.exec(c) || [])[1]);
    t('capa: itens datados em ordem decrescente de data real', datas.every((x, i) => i === 0 || x <= datas[i - 1]), datas.join());
    t('capa: destaque tem selo "Mais recente" e data real', /selo-destaque">Mais recente/.test(home) && /featured-date" datetime="\d{4}-\d{2}-\d{2}"/.test(home));
    t('capa: faixa "Última publicação" + "Taxas do Banco Central atualizadas em" com datas reais', /Última publicação: <time datetime="\d{4}-\d{2}-\d{2}">[^<]+<\/time> · Taxas do Banco Central atualizadas em <time datetime="\d{4}-\d{2}-\d{2}">/.test(home));
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
