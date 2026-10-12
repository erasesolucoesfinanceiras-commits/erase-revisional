#!/usr/bin/env bash
# Pede ao Cloudflare Pages um novo deploy (Deploy Hook) depois que o fluxo gravou algo. Sem CF_DEPLOY_HOOK_URL ou sem novidade: não faz nada.
#   uso: scripts/noticias/redeploy.sh <commit-inicial>      (HOOK_TENTATIVAS / HOOK_ESPERA só para testes)
# Tenta 4 vezes (erro de rede e 5xx/429). Falha aqui nunca derruba o fluxo: vira aviso (o Cloudflare também publica sozinho a cada push na main).
set -u
INICIO="${1:-}"
[ -z "${CF_DEPLOY_HOOK_URL:-}" ] && { echo "CF_DEPLOY_HOOK_URL não cadastrado: sem redeploy extra (o Cloudflare publica pelo push)."; exit 0; }
[ -n "$INICIO" ] && [ "$(git rev-parse HEAD)" = "$INICIO" ] && { echo "Nada foi gravado: sem redeploy."; exit 0; }
for i in $(seq 1 "${HOOK_TENTATIVAS:-4}"); do
  codigo=$(curl -s -o /dev/null -w '%{http_code}' -m 30 -X POST "$CF_DEPLOY_HOOK_URL" || echo 000)
  case "$codigo" in 2*) echo "Redeploy pedido ao Cloudflare (tentativa $i)."; exit 0;; esac
  echo "Redeploy: HTTP $codigo na tentativa $i."; sleep $(( ${HOOK_ESPERA:-5} * i ))
done
echo "::warning::Não consegui pedir o redeploy ao Cloudflare (4 tentativas). O site publica pelo push na main; confira o painel do Cloudflare se a página não atualizar."
exit 0
