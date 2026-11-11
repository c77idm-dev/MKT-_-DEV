#!/usr/bin/env sh
# Publica a versão atual da branch main na VPS: puxa o código e reconstrói a imagem.
# Uso: VPS_SSH=usuario@ip-da-vps sh scripts/deploy.sh
set -eu
: "${VPS_SSH:?Defina VPS_SSH, ex.: VPS_SSH=deploy@203.0.113.10}"
ssh "$VPS_SSH" 'set -eu
  cd /opt/devolucoes
  git pull --ff-only
  docker compose --env-file .env.producao -f docker-compose.prod.yml up -d --build
  docker image prune -f'
