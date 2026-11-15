// Alertas no Telegram do Site revisional (custo zero: Bot API + Issues do GitHub como memória do estado).
// Regras: toda mensagem começa com o projeto e um ícone; o mesmo problema avisa no máximo 1 vez por hora;
// quando volta ao normal sai "✅ resolvido"; nunca vai token, chave nem dado de cliente na mensagem.
import { execFileSync } from "node:child_process";

export const PROJETO = "Site revisional";
export const ICONE = { erro: "🚨", atencao: "⚠️", ok: "✅" };
export const HORA = 3600_000;
export const ROTULO = "alerta-telegram";

/** Tira de um texto livre segredos, e-mail, telefone, CPF/CNPJ e URL de banco. Links do GitHub e "execução 123" saem INTEIROS. */
export function limpar(texto, segredos = []) {
  let t = String(texto ?? "");
  for (const s of segredos) if (s && String(s).length >= 6) t = t.split(String(s)).join("[oculto]");
  const guardados = [];
  const guarda = (m) => `\u0001${guardados.push(m) - 1}\u0002`;
  t = t.replace(/https:\/\/github\.com\/[A-Za-z0-9_.\/-]+/g, guarda)
    .replace(/\b(?:execução|execucao|run|job|tentativa)\s*#?\s*\d+/gi, guarda);
  t = t
    .replace(/postgres(ql)?:\/\/\S+/gi, "[banco]")
    .replace(/eyJ[A-Za-z0-9_-]{8,}(\.[A-Za-z0-9_-]+)*/g, "[token]")
    .replace(/\b(sb_secret|sb_publishable|whsec|sk|ghp|gho|github_pat|xox[baprs]|re)_[A-Za-z0-9_-]{8,}/gi, "[chave]")
    .replace(/\b(Bearer)\s+[^\s"',;]+/gi, "$1 [oculto]")
    .replace(/\b(apikey|api[_-]?key|access_token|token|secret|senha|password)\s*[=:]\s*[^\s"',;]+/gi, "$1 [oculto]")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[e-mail]")
    .replace(/[A-Za-z0-9_-]{32,}/g, "[oculto]")
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, "[cpf]")
    .replace(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, "[cnpj]")
    .replace(/(\+?55[\s-]?)?\(\d{2}\)[\s-]?9?\d{4}[\s-]?\d{4}\b/g, "[telefone]")
    .replace(/(\+?55[\s-]?)?\b\d{2}[\s-]?9\d{4}[\s-]?\d{4}\b/g, "[telefone]")
    .replace(/\b\d{11,14}\b/g, "[número]");
  return t.replace(/\u0001(\d+)\u0002/g, (_, i) => guardados[Number(i)]).replace(/\s+/g, " ").trim().slice(0, 400);
}

/** "ERASE CRM 🚨 Título" + linhas "Rótulo: valor" + link. Os valores vêm do chamador já limpos. */
export function montarMensagem({ nivel, titulo, linhas = [], link }) {
  const corpo = linhas.filter(([, v]) => v).map(([r, v]) => `${r}: ${v}`);
  if (link) corpo.push(`Execução: ${link}`);
  return [`${PROJETO} ${ICONE[nivel]} ${titulo}`, ...corpo].join("\n");
}

/** Decide o que fazer com um problema: `aberto` = {numero, ultimo(ms)} se já há aviso em aberto. */
// Aviso já enviado de um problema ainda aberto NUNCA é reenviado (só vale de novo se ele for resolvido e voltar): `intervalo` Infinity.
export function decidir({ aberto, nivel, agora = Date.now(), intervalo = Infinity }) {
  if (nivel === "ok") return aberto ? { enviar: true, acao: "fechar" } : { enviar: false, acao: "nada" };
  if (!aberto) return { enviar: true, acao: "abrir" };
  return agora - aberto.ultimo >= intervalo ? { enviar: true, acao: "atualizar" } : { enviar: false, acao: "nada" };
}

/** Intervalo esperado (ms) de uma expressão cron simples, ou null se não der para saber. */
export function intervaloDoCron(expr) {
  const [m, h, dom, , dow] = String(expr).trim().split(/\s+/);
  const passo = (s) => /^\*\/(\d+)$/.exec(s ?? "")?.[1];
  const num = (s) => /^\d+$/.test(s ?? "");
  if (m === "*" && h === "*") return 60_000;
  if (passo(m) && h === "*") return Number(passo(m)) * 60_000;
  if (num(m) && h === "*") return HORA;
  if (num(m) && num(h)) {
    if (dom === "*" && dow === "*") return 24 * HORA;
    if (dom === "*" && dow !== "*") return 7 * 24 * HORA;
    if (num(dom)) return 31 * 24 * HORA;
  }
  return null;
}
export const tolerancia = (iv) => (iv <= HORA ? Math.max(15 * 60_000, iv * 3) : iv + 3 * HORA);

/** Erro de chave/token recusado ou expirado (qualquer serviço). */
export const ehCredencial = (codigo, msg) =>
  /^(401|403)$/.test(String(codigo)) ||
  /\b(token|chave|api[- ]?key|expir\w*|revog\w*|revoked|unauthori[sz]ed|invalid_grant|oauth|credencia\w*|recusad\w*|forbidden|permission denied)\b/i.test(String(msg ?? ""));

const api = async (token, metodo, corpo) => {
  let r;
  try {
    r = await fetch(`https://api.telegram.org/bot${token}/${metodo}`, corpo
      ? { method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(20_000), body: JSON.stringify(corpo) }
      : { signal: AbortSignal.timeout(20_000) });
  } catch { throw new Error("O Telegram não respondeu (rede ou tempo esgotado)."); }   // nunca repassa a URL, que leva o token
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j?.ok !== true) throw new Error(`O Telegram recusou ${metodo} (HTTP ${r.status}${j?.description ? `: ${limpar(j.description)}` : ""}).`);
  return j.result;
};

/** Manda a mensagem e devolve a resposta do Telegram (message_id e o chat de destino), só se o Telegram confirmou `ok: true`. */
export async function enviarTelegram(texto, { token = process.env.ALERTA_TELEGRAM_TOKEN, chat = process.env.ALERTA_TELEGRAM_CHAT_ID } = {}) {
  token = String(token ?? "").trim(); chat = String(chat ?? "").trim();   // espaço ou quebra de linha colados no segredo não podem quebrar o envio
  if (!token || !chat) throw new Error("Faltam os segredos ALERTA_TELEGRAM_TOKEN e ALERTA_TELEGRAM_CHAT_ID.");
  return api(token, "sendMessage", { chat_id: chat, text: String(texto).replaceAll(token, "[oculto]").replaceAll(chat, "[oculto]").slice(0, 3500), disable_web_page_preview: true });
}

/** Quem é o bot dos segredos (nome e @usuário não são segredo). */
export async function quemSouBot({ token = process.env.ALERTA_TELEGRAM_TOKEN } = {}) {
  return api(String(token ?? "").trim(), "getMe");
}

/** Motivo da falha dos robôs de notícias lido do data/noticias-log.jsonl (eventos "erro" e "uso_gemini" perto do fim da execução). */
export function motivoDoLog(texto, fimMs, janelaMs = 40 * 60_000) {
  const ev = [];
  for (const l of String(texto ?? "").split("\n").filter(Boolean).slice(-600)) { try { ev.push(JSON.parse(l)); } catch { /* linha ruim */ } }
  const perto = ev.filter((x) => { const t = Date.parse(x.quando); return t <= fimMs + 5 * 60_000 && fimMs - t <= janelaMs; }).reverse();
  const erro = perto.find((x) => x.evento === "erro"), uso = perto.find((x) => x.evento === "uso_gemini");
  const partes = [];
  if (erro?.motivo) partes.push(`${erro.tipo ? `${erro.tipo}: ` : ""}${limpar(erro.motivo)}`);
  const st = uso?.por_status ?? {};
  if (st["429"]) partes.push(`o Gemini (plano grátis) respondeu "cota esgotada" (429) ${st["429"]} vez(es)`);
  if (st["503"]) partes.push(`e "instável" (503) ${st["503"]} vez(es)`);
  return partes.join("; ");
}

// ---- estado: uma Issue aberta por problema (rótulo alerta-telegram). O corpo guarda o instante do último aviso.
const gh = (args) => execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const REPO = () => process.env.GITHUB_REPOSITORY;
const chaveDoTitulo = (t) => String(t).replace(/^Alerta: /, "");

export function lerAbertos(exec = gh) {
  const lista = JSON.parse(exec(["issue", "list", "--repo", REPO(), "--label", ROTULO, "--state", "open", "--limit", "300", "--json", "number,title,body"]));
  const mapa = new Map();
  for (const i of lista) {
    const ultimo = Number(/<!--ultimo:(\d+)-->/.exec(i.body ?? "")?.[1] ?? 0) * 1000;
    const titulo = /^Problema: (.*)$/m.exec(i.body ?? "")?.[1] ?? chaveDoTitulo(i.title);
    mapa.set(chaveDoTitulo(i.title), { numero: i.number, ultimo, titulo });
  }
  return mapa;
}
export function garantirRotulo(exec = gh) {
  exec(["label", "create", ROTULO, "--repo", REPO(), "--color", "B60205", "--description", "Problema avisado no Telegram (aberto = ainda não resolvido)", "--force"]);
}

/** Avisa (ou não) conforme a regra de 1 vez por hora e atualiza o estado. `abertos` = resultado de lerAbertos. */
export async function avisar({ chave, nivel, titulo, linhas, link, abertos, enviar = enviarTelegram, exec = gh, agora = Date.now() }) {
  const aberto = abertos.get(chave);
  const { enviar: manda, acao } = decidir({ aberto, nivel, agora });
  if (!manda) return acao;
  await enviar(montarMensagem({ nivel, titulo, linhas, link }));   // se o Telegram falhar, o estado não muda e a próxima rodada tenta de novo
  const corpo = `<!--ultimo:${Math.floor(agora / 1000)}-->\nProblema: ${titulo}\n${(linhas ?? []).filter(([, v]) => v).map(([r, v]) => `${r}: ${v}`).join("\n")}\n${link ? `Execução: ${link}\n` : ""}`;
  if (acao === "abrir") {
    exec(["issue", "create", "--repo", REPO(), "--label", ROTULO, "--title", `Alerta: ${chave}`, "--body", corpo]);
  } else if (acao === "atualizar") {
    exec(["issue", "edit", String(aberto.numero), "--repo", REPO(), "--body", corpo]);
  } else if (acao === "fechar") {
    exec(["issue", "close", String(aberto.numero), "--repo", REPO(), "--comment", "Voltou ao normal (aviso ✅ enviado no Telegram)."]);
  }
  return acao;
}

/** Problema que voltou ao normal: manda "✅ resolvido" e fecha o aviso. */
export const resolver = ({ chave, abertos, link, ...resto }) =>
  avisar({ chave, nivel: "ok", titulo: `Resolvido: ${abertos.get(chave)?.titulo ?? chave}`, linhas: [["Situação", "voltou ao normal"]], link, abertos, ...resto });
