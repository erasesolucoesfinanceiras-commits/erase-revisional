// Roda quando um workflow termina com falha, cancelamento ou tempo esgotado (gatilho workflow_run). Só lê o que o GitHub informa.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { avisar, garantirRotulo, lerAbertos, limpar, motivoDoLog } from "./lib.mjs";
import { WORKFLOWS, motivoPeloPasso } from "./workflows.mjs";

const e = process.env;
const REPO = e.GITHUB_REPOSITORY;
const ruins = ["failure", "cancelled", "timed_out"];
const nome = e.WF_NOME ?? "", branch = limpar(e.WF_BRANCH ?? "main");
if (branch !== "main") { console.log(`Ramo de trabalho (${branch}): sem aviso. Só a main e a produção avisam.`); process.exit(0); }
const fim = Date.parse(e.WF_FIM ?? "");
if (fim && Date.now() - fim > 6 * 3600_000) { console.log("Execução antiga (mais de 6 horas): não reenvia aviso velho."); process.exit(0); }
if (!ruins.includes(e.WF_CONCLUSAO)) { console.log("Execução sem problema: nada a avisar (o ✅ sai na vigia horária)."); process.exit(0); }
if (nome === "Verificação" && e.WF_EVENTO === "pull_request" && e.WF_CONCLUSAO === "cancelled") { console.log("Verificação de pull request substituída por uma mais nova: normal, sem aviso."); process.exit(0); }

const gh = (args) => execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
let etapa = "";
try {
  const jobs = JSON.parse(gh(["api", `repos/${REPO}/actions/runs/${Number(e.WF_RUN_ID)}/jobs?per_page=100`])).jobs ?? [];
  const job = jobs.find((j) => ruins.includes(j.conclusion));
  etapa = job?.steps?.find((s) => ruins.includes(s.conclusion))?.name ?? job?.name ?? "";
} catch { /* sem detalhe da etapa: o aviso sai mesmo assim */ }

let doLog = "";
try { doLog = motivoDoLog(readFileSync("data/noticias-log.jsonl", "utf8"), fim || Date.now()); } catch { /* sem log: segue só com a etapa */ }
const info = WORKFLOWS[nome] ?? { oQue: nome, retry: e.WF_EVENTO === "schedule" ? "Sim: roda de novo no próximo horário agendado." : "Não tenta sozinho." };
const tent = Number(e.WF_TENTATIVA) > 1 ? ` (esta já é a tentativa ${Number(e.WF_TENTATIVA)})` : "";
const link = new RegExp(`^https://github\\.com/${REPO}/actions/runs/\\d+$`).test(e.WF_URL ?? "") ? e.WF_URL : `https://github.com/${REPO}/actions`;
const nivel = "erro";
const chave = `wf:${nome}@main`.replace(/[^A-Za-z0-9 ._@/:-]/g, "_").slice(0, 100);

garantirRotulo();
const acao = await avisar({
  chave, nivel, link, abertos: lerAbertos(),
  titulo: `${e.WF_CONCLUSAO === "cancelled" ? "Cancelado" : "Falhou"}: ${nome}`,
  linhas: [
    ["O que falhou", `${info.oQue}${etapa ? ` — etapa "${limpar(etapa)}"` : ""}`],
    ["Motivo", [motivoPeloPasso(etapa, e.WF_CONCLUSAO), doLog].filter(Boolean).join(" Detalhe: ")],
    ["Tentando de novo?", info.retry + tent],
  ],
});
console.log(acao === "nada" ? "Mesmo problema já avisado há menos de 1 hora: sem novo aviso." : `Aviso enviado (${acao}).`);
