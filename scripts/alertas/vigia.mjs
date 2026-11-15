// Vigia horária do Site revisional: robô que devia rodar e não rodou (notícias, artigos, série do Banco Central, resumo semanal),
// site e página de anúncios fora do ar, deploy do Cloudflare Pages que falhou, cota grátis de builds acima de 80%,
// e o "✅ resolvido" de tudo que voltou ao normal. Só LÊ (API do GitHub e GET em páginas públicas); nunca mexe em páginas ou artigos.
// `node scripts/alertas/vigia.mjs --teste` manda 1 aviso de teste e sai.
import { execFileSync } from "node:child_process";
import { HORA, avisar, enviarTelegram, garantirRotulo, lerAbertos, limpar, montarMensagem, quemSouBot, resolver } from "./lib.mjs";

const e = process.env, REPO = e.GITHUB_REPOSITORY;
const link = `${e.GITHUB_SERVER_URL ?? "https://github.com"}/${REPO}/actions/runs/${e.GITHUB_RUN_ID ?? ""}`;
const gh = (args) => execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const quando = (ms) => new Date(ms).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

if (process.argv.includes("--teste")) {
  const t = String(e.ALERTA_TELEGRAM_TOKEN ?? "").trim(), c = String(e.ALERTA_TELEGRAM_CHAT_ID ?? "").trim();
  console.log(`Segredos lidos: token ${t ? `sim (${t.length} caracteres)` : "NÃO"}, chat ${c ? `sim (${/^-/.test(c) ? "grupo/canal" : "pessoa"}, ${c.replace("-", "").length} dígitos)` : "NÃO"}.`);
  console.log(`Repositório de origem: ${REPO}.`);
  const bot = await quemSouBot();
  console.log(`Bot dos segredos: ${limpar(bot.first_name)} (@${limpar(bot.username)}).`);
  const r = await enviarTelegram(montarMensagem({ nivel: "atencao", titulo: "Teste de alerta (pode ignorar)",
    linhas: [["O que é", "teste manual do sistema de alertas"], ["Origem", `repositório ${REPO}`], ["Enviado por", `${limpar(bot.first_name)} (@${limpar(bot.username)})`], ["Situação", "se você leu esta mensagem, o Telegram está conectado"]], link }));
  console.log(`Telegram confirmou: mensagem ${r.message_id} entregue ao chat do tipo "${r.chat?.type}" ${limpar(r.chat?.title ?? r.chat?.first_name ?? "")}.`);
  process.exit(0);
}

// ---- verificações: cada uma devolve a lista de problemas de agora (vazia = tudo normal)
// Limite = tempo sem nenhuma execução agendada. O GitHub atrasa agendamentos em até ~6 h, por isso as folgas são largas.
const AGENDADOS = [
  ["noticias.yml", "Notícias automáticas", 24 * HORA, "3 rodadas por dia"],
  ["verificar-artigo.yml", "Verificar artigo recente", 30 * HORA, "1 vez por dia"],
  ["resumo-semanal.yml", "Resumo semanal das notícias (e-mail)", 9 * 24 * HORA, "toda segunda-feira"],
  ["bcb.yml", "Atualizar série do Banco Central", 48 * HORA, "todo dia 5 a 25", (d) => d.getUTCDate() >= 7 && d.getUTCDate() <= 25],
];
function agenda() {
  const out = [];
  for (const [arq, nome, max, freq, vale] of AGENDADOS) {
    if (vale && !vale(new Date())) continue;
    const wf = JSON.parse(gh(["api", `repos/${REPO}/actions/workflows/${arq}`]));
    if (Date.now() - Date.parse(wf.created_at) < max) continue;
    const ultimo = Date.parse(JSON.parse(gh(["api", `repos/${REPO}/actions/workflows/${arq}/runs?event=schedule&per_page=1`])).workflow_runs?.[0]?.created_at ?? "") || 0;
    if (ultimo && Date.now() - ultimo <= max) continue;
    out.push({ chave: `agenda:${arq}`, nivel: "atencao", titulo: `Não rodou no horário: ${nome}`, link,
      linhas: [["O que devia rodar", `${nome} (${freq})`], ["Última execução agendada", ultimo ? quando(ultimo) : "nenhuma encontrada"], ["Tentando de novo?", "Sim: roda no próximo horário agendado. Se continuar, rode na mão e confira se o GitHub não desativou a agenda."]] });
  }
  return out;
}
async function site() {
  const alvos = [["site:home", "Site fora do ar", "https://revisional.eraseconsulta.com.br/"], ["site:analise", "Página de anúncios (/analise/) fora do ar", "https://revisional.eraseconsulta.com.br/analise/"]];
  const out = [];
  for (const [chave, titulo, url] of alvos) {
    let estado = "";
    for (let t = 0; t < 2; t++) {   // 2 tentativas, para não avisar por um tropeço de rede
      try { const r = await fetch(url, { signal: AbortSignal.timeout(20_000), redirect: "manual" }); estado = r.status >= 200 && r.status < 400 ? "" : `respondeu HTTP ${r.status}`; } catch { estado = "não respondeu (rede ou tempo esgotado)"; }
      if (!estado) break;
      if (t === 0) await new Promise((r) => setTimeout(r, 20_000));
    }
    if (estado) out.push({ chave, nivel: "erro", titulo, link, linhas: [["Endereço", url], ["Situação", estado], ["Tentando de novo?", "Sim: a vigia confere de novo em 1 hora. Se o Cloudflare estiver em manutenção, volta sozinho."]] });
  }
  return out;
}
function deploy() {   // o Cloudflare Pages marca o último commit da main (verde ou vermelho)
  const c = JSON.parse(gh(["api", `repos/${REPO}/commits/main/check-runs?per_page=50`])).check_runs?.find((x) => x.name === "Cloudflare Pages");
  if (!c || !["failure", "timed_out", "cancelled"].includes(c.conclusion)) return [];
  return [{ chave: "deploy:cloudflare", nivel: "erro", titulo: "Deploy do site no Cloudflare Pages falhou", link: c.html_url || link,
    linhas: [["O que falhou", "publicação da versão mais recente da main no site"], ["Resultado", c.conclusion], ["Tentando de novo?", "Sim: o próximo commit da main dispara novo deploy. Se for urgente, refaça o deploy no painel do Cloudflare Pages."]] }];
}
function cotaBuilds() {   // plano grátis do Cloudflare Pages: 500 builds/mês; cada commit na main = 1 build
  const inicio = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
  const n = gh(["api", "--paginate", `repos/${REPO}/commits?sha=main&since=${inicio}&per_page=100`, "--jq", ".[].sha"]).split("\n").filter(Boolean).length, pct = Math.round((n / 500) * 100);
  return pct >= 80 ? [{ chave: "cota:builds", nivel: pct >= 95 ? "erro" : "atencao", titulo: "Cota grátis perto do fim: builds do Cloudflare Pages (500/mês)", link,
    linhas: [["Uso", `${n} commits na main este mês de 500 builds (${pct}%)`], ["Tentando de novo?", "Não é erro de execução: reduza commits dos robôs ou avalie o plano antes de chegar a 100%."]] }] : [];
}

// ---- roda tudo; uma verificação que falha não derruba as outras
const familias = new Map(), avisosDaVigia = [];
const roda = async (prefixo, fn) => {
  try { familias.set(prefixo, { rodou: true, problemas: await fn() }); }
  catch (err) { familias.set(prefixo, { rodou: false, problemas: [] }); avisosDaVigia.push(`${prefixo} não pôde ser conferida (${limpar(err?.message ?? err).slice(0, 80)})`); }
};
await roda("agenda:", agenda);
await roda("site:", site);
await roda("deploy:", deploy);
await roda("cota:", cotaBuilds);

garantirRotulo();
const abertos = lerAbertos();
let erroDeEnvio = 0;
const tenta = async (fn) => { try { await fn(); } catch (err) { erroDeEnvio++; console.error(limpar(err?.message ?? err)); } };
for (const { problemas } of familias.values()) for (const p of problemas) await tenta(() => avisar({ ...p, abertos }));
for (const [chave] of abertos) {   // "✅ resolvido": aviso aberto cuja verificação rodou e não achou mais o problema
  const fam = [...familias].find(([pref]) => chave.startsWith(pref));
  if (fam && fam[1].rodou && !fam[1].problemas.some((p) => p.chave === chave)) await tenta(() => resolver({ chave, abertos, link }));
}
// workflows que falharam (só main): resolvidos quando a última execução concluída do mesmo workflow na main passou
const workflows = (() => { try { return JSON.parse(gh(["api", `repos/${REPO}/actions/workflows?per_page=100`])).workflows ?? []; } catch { return []; } })();
for (const [chave] of abertos) {
  const m = /^wf:(.+)@main$/.exec(chave); if (!m) continue;
  const wf = workflows.find((w) => w.name === m[1]);
  if (!wf) continue;
  try {
    const ultima = JSON.parse(gh(["api", `repos/${REPO}/actions/workflows/${wf.id}/runs?branch=main&status=completed&per_page=1`])).workflow_runs?.[0];
    if (ultima?.conclusion === "success") await tenta(() => resolver({ chave, abertos, link: ultima.html_url }));
  } catch { /* tenta de novo na próxima hora */ }
}
for (const a of avisosDaVigia) console.warn(a);
process.exitCode = erroDeEnvio ? 1 : 0;   // o Telegram recusar a mensagem deixa a vigia vermelha (o GitHub avisa por e-mail)
