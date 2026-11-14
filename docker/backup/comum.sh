#!/bin/sh
# Partes comuns do backup e da restauração (spec §10). O remoto "backup" do rclone vem só destas variáveis.
export RCLONE_CONFIG_BACKUP_TYPE=s3
export RCLONE_CONFIG_BACKUP_PROVIDER=Other
export RCLONE_CONFIG_BACKUP_ENDPOINT="${BACKUP_S3_ENDPOINT:-}"
export RCLONE_CONFIG_BACKUP_REGION="${BACKUP_S3_REGIAO:-}"
export RCLONE_CONFIG_BACKUP_ACCESS_KEY_ID="${BACKUP_S3_CHAVE_ID:-}"
export RCLONE_CONFIG_BACKUP_SECRET_ACCESS_KEY="${BACKUP_S3_CHAVE_SECRETA:-}"
export RCLONE_CONFIG_BACKUP_NO_CHECK_BUCKET=true
REMOTO="backup:${BACKUP_S3_BUCKET:-}"

# AES-256 com PBKDF2 (decisão 19). A senha vem do ambiente e nunca aparece na linha de comando.
cifrar() { openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_SENHA; }
decifrar() { openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_SENHA; }

# Log estruturado em JSON (spec §11), como o web e o worker.
log() { printf '{"em":"%s","origem":"backup","nivel":"%s","mensagem":"%s"}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$2"; }

# Texto livre para dentro de um literal SQL: dobra as aspas simples. Vai pela entrada padrão, nunca por -v
# (o psql.exe do Windows recusa acento vindo da linha de comando).
literal_sql() { printf '%s' "$1" | sed "s/'/''/g"; }
