# Alertas no Telegram (Site revisional)

Robô "Central de Alertas ERASE". Segredos do repositório: `ALERTA_TELEGRAM_TOKEN`, `ALERTA_TELEGRAM_CHAT_ID` (só aí; nunca no código, na mensagem ou no log). Toda mensagem começa com "Site revisional" e um ícone (🚨 erro, ⚠️ atenção, ✅ resolvido).

| O que | Quem vigia | Quando |
|---|---|---|
| Workflow falhou, foi cancelado ou estourou o tempo (notícias, artigos, fotos, série do Banco Central, resumo semanal, despublicar) | job `falha` de `alertas-telegram.yml` (gatilho `workflow_run`), com o motivo do `data/noticias-log.jsonl` | na hora |
| Robô agendado que não rodou (notícias, verificação diária, resumo semanal, série do Banco Central) | vigia | de hora em hora |
| Site ou `/analise/` fora do ar | vigia | de hora em hora |
| Deploy do Cloudflare Pages que falhou | vigia | de hora em hora |
| Cota grátis de builds do Cloudflare Pages ≥ 80% (500/mês) | vigia | de hora em hora |

- **Só main e produção:** ramos de trabalho (`claude/*`, pull requests) nunca avisam; execução com mais de 6 horas não gera aviso.
- **Sem reenvio:** o estado de cada problema é uma Issue aberta com o rótulo `alerta-telegram`; aviso já enviado de problema aberto não é reenviado. Quando volta ao normal, sai "✅ resolvido" e a Issue fecha; se voltar a quebrar, é aviso novo.
- **Links inteiros:** a limpeza tira só token, chave, e-mail, telefone, CPF/CNPJ e URL de banco; links do GitHub e números de execução ficam completos.
- **Só lê:** não mexe em páginas, artigos publicados nem layout.
- **Teste:** Actions → "Alertas no Telegram" → Run workflow → marcar "teste". O log mostra qual bot e qual chat receberam.
- **Workflow novo:** acrescente o nome em `workflows:` de `alertas-telegram.yml` e em `scripts/alertas/workflows.mjs` (`tests/noticias/alertas-test.js` reprova se faltar).
