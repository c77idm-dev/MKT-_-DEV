#!/bin/sh
# Ponto de entrada do serviço "backup": instala as ferramentas e roda o backup todo dia às 02h30 (TZ do compose).
# Sem cron: o cron do Alpine não passaria as variáveis do container para o script.
set -eu
apk add --no-cache rclone openssl tzdata >/dev/null
trap 'exit 0' TERM INT
while :; do
  agora=$(date +%s)
  alvo=$(date -d "$(date +%Y-%m-%d) 02:30:00" +%s)
  [ "$agora" -lt "$alvo" ] || alvo=$((alvo + 86400))
  sleep $((alvo - agora)) &
  wait $!
  sh /backup/backup.sh || true
done
