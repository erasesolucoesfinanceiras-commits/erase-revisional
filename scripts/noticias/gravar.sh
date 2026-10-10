#!/usr/bin/env bash
# Grava na branch o que mudou (sem Pull Request), refazendo com rebase se a branch andou durante o run.
#   uso: scripts/noticias/gravar.sh "mensagem do commit"      (variáveis: BRANCH, REMOTO — padrão: branch atual / origin)
# Conflito em páginas geradas (*.html, sitemap.xml, llms.txt): fica a versão que já está na branch e as páginas são regeradas
# por scripts/build.js a partir dos dados. Conflito em dados (data/*.json): desiste desta volta, espera e tenta de novo; só falha
# depois de 5 voltas (a causa vai para a saída, em linguagem simples).
set -u
MSG="${1:-Atualização automática}"
REMOTO="${REMOTO:-origin}"
BRANCH="${BRANCH:-${GITHUB_REF_NAME:-$(git rev-parse --abbrev-ref HEAD)}}"
ESPERA="${GRAVAR_ESPERA:-5}"
git add -A
if git diff --cached --quiet; then echo "Nada novo para gravar."; exit 0; fi
git commit -q -m "$MSG" || exit 1
regerar() { # páginas geradas sempre refeitas a partir dos dados mais novos
  node scripts/build.js >/dev/null 2>&1 || return 0
  git add -A; git diff --cached --quiet || git commit -q -m "Regenera páginas após atualizar a branch"
}
for i in 1 2 3 4 5; do
  git fetch -q "$REMOTO" "$BRANCH" || { sleep $((ESPERA * i)); continue; }
  if [ "$(git rev-parse HEAD)" != "$(git rev-parse FETCH_HEAD)" ] && ! git merge-base --is-ancestor FETCH_HEAD HEAD; then
    if ! git rebase -q FETCH_HEAD 2>/dev/null; then
      NAO_GERADOS=$(git diff --name-only --diff-filter=U | grep -Ev '\.html$|^sitemap\.xml$|^llms\.txt$' || true)
      if [ -n "$NAO_GERADOS" ]; then
        echo "Conflito em dados ($NAO_GERADOS) na volta $i: tentando de novo."; git rebase --abort 2>/dev/null; sleep $((ESPERA * i)); continue
      fi
      git diff --name-only --diff-filter=U | xargs -r git checkout --ours -- 2>/dev/null
      git add -A
      GIT_EDITOR=true git rebase --continue >/dev/null 2>&1 || { git rebase --abort 2>/dev/null; sleep $((ESPERA * i)); continue; }
    fi
    regerar
  fi
  if git push -q "$REMOTO" "HEAD:refs/heads/$BRANCH"; then echo "Gravado na volta $i."; exit 0; fi
  echo "Push recusado na volta $i: a branch andou; refazendo."; sleep $((ESPERA * i))
done
echo "::error::Não consegui gravar na branch $BRANCH depois de 5 voltas (conflito em dados ou rede fora do ar)." >&2
exit 1
