# Site revisional

Respostas curtas, em português. Não mexer em páginas, artigos publicados nem layout sem avisar o usuário antes.

## Alertas no Telegram (permanente)

Robô "Central de Alertas ERASE"; segredos `ALERTA_TELEGRAM_TOKEN` e `ALERTA_TELEGRAM_CHAT_ID` já cadastrados. `.github/workflows/alertas-telegram.yml` avisa de falha ou cancelamento de qualquer workflow na `main` e, de hora em hora, de robô que não rodou, site ou `/analise/` fora do ar, deploy do Cloudflare Pages que falhou e cota de builds ≥ 80%, com "✅ resolvido" ao voltar. Mensagens começam com "Site revisional" e um ícone; só a `main` e a produção avisam (nunca ramos `claude/*`); aviso já enviado de problema aberto não é reenviado; links do GitHub saem inteiros; nunca vai token, chave, e-mail, telefone ou CPF. **Workflow novo** entra na lista `workflows:` do alerta e em `scripts/alertas/workflows.mjs` (`node tests/noticias/alertas-test.js` reprova se faltar). Detalhes em `docs/ALERTAS.md`.
