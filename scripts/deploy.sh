#!/usr/bin/env sh
# Publica a versão mais recente na VPS: atualiza os arquivos de configuração e baixa a imagem
# compilada pelo GitHub Actions (a VPS não compila nada).
# Uso: VPS_SSH=usuario@ip-da-vps sh scripts/deploy.sh
set -eu
: "${VPS_SSH:?Defina VPS_SSH, ex.: VPS_SSH=root@203.0.113.10}"
ssh "$VPS_SSH" 'set -eu
  cd /opt/devolucoes
  git pull --ff-only
  docker compose --env-file .env.producao -f docker-compose.prod.yml pull
  docker compose --env-file .env.producao -f docker-compose.prod.yml up -d
  # Não use `docker image prune`: a VPS é compartilhada e ele apagaria imagens sem uso de OUTROS projetos.
  # Remove só as imagens sem nome (dangling) cujo digest é deste projeto.
  docker images --filter dangling=true -q | xargs -r docker image inspect --format "{{.Id}} {{.RepoDigests}}" | grep "ghcr.io/c77idm-dev/devolucoes@" | cut -d" " -f1 | xargs -r docker rmi || true'
