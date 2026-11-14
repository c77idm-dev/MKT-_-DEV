#!/bin/sh
# Backup diário (spec §10): banco (pg_dump) e, com ARMAZENAMENTO=disco, as mídias de MIDIA_DIR.
# Tudo cifrado e enviado ao bucket de backup, sem arquivo temporário no disco da VPS. Guarda 30 dias
# (regra de ciclo de vida do bucket; o rclone delete daqui é só reforço). Cada execução fica em execucoes_backup.
# Banco: PGHOST, PGPORT, PGUSER, PGPASSWORD e PGDATABASE (o compose define).
set -eu
set -o pipefail
. "$(dirname "$0")/comum.sh"

DIAS_GUARDA=30
CARIMBO=$(date +%Y-%m-%d_%H%M%S)
OPCOES_ENVIO="--s3-chunk-size 32M --s3-upload-concurrency 2"
sql() { psql -X -q -At -v ON_ERROR_STOP=1 "$@"; }

ID=$(sql -c "insert into execucoes_backup default values returning id")

falhar() {
  log erro "$1"
  msg=$(literal_sql "$1")
  sql <<SQL || true
update execucoes_backup set situacao = 'FALHOU', terminado_em = now(), erro = '$msg' where id = '$ID';
SQL
  exit 1
}

[ -n "${BACKUP_SENHA:-}" ] || falhar "BACKUP_SENHA não definida."
[ -n "${BACKUP_S3_BUCKET:-}" ] || falhar "BACKUP_S3_BUCKET não definido."
[ "$BACKUP_S3_BUCKET" != "${S3_BUCKET:-}" ] || falhar "O bucket de backup não pode ser o mesmo das mídias (S3_BUCKET)."

enviar() { rclone rcat $OPCOES_ENVIO "$REMOTO/$1"; }
tamanho() { rclone lsjson "$REMOTO/$1" | sed -n 's/.*"Size":\([0-9]*\).*/\1/p' | head -n 1; }

ARQ_BANCO="banco/devolucoes-$CARIMBO.dump.enc"
pg_dump -Fc --no-owner | cifrar | enviar "$ARQ_BANCO" || falhar "O pg_dump ou o envio do banco falhou."
TAM_BANCO=$(tamanho "$ARQ_BANCO")
[ "${TAM_BANCO:-0}" -gt 1024 ] || falhar "O arquivo do banco chegou vazio ao bucket."

ARQ_MIDIA=""
TAM_MIDIA=""
if [ "${ARMAZENAMENTO:-disco}" = "disco" ] && [ -d "${MIDIA_DIR:-/data/midia}" ]; then
  PASTA="${MIDIA_DIR:-/data/midia}"
  ARQ_MIDIA="midia/midia-$CARIMBO.tar.enc"
  tar -C "$(dirname "$PASTA")" -cf - "$(basename "$PASTA")" | cifrar | enviar "$ARQ_MIDIA" || falhar "O envio das mídias falhou."
  TAM_MIDIA=$(tamanho "$ARQ_MIDIA")
fi

# Reforço da guarda de 30 dias: com uma chave sem permissão de apagar (recomendada), só avisa.
rclone delete --min-age "${DIAS_GUARDA}d" "$REMOTO/banco" || log atencao "A chave não apaga backups antigos: a regra de ciclo de vida do bucket cuida disso."
[ -z "$ARQ_MIDIA" ] || rclone delete --min-age "${DIAS_GUARDA}d" "$REMOTO/midia" || log atencao "A chave não apaga mídias antigas do backup."

sql -v id="$ID" -v arq_banco="$ARQ_BANCO" -v tam_banco="$TAM_BANCO" -v arq_midia="$ARQ_MIDIA" -v tam_midia="$TAM_MIDIA" <<'SQL'
update execucoes_backup
   set situacao = 'OK', terminado_em = now(), arquivo_banco = :'arq_banco', tamanho_banco = :'tam_banco'::bigint,
       arquivo_midia = nullif(:'arq_midia', ''), tamanho_midia = nullif(:'tam_midia', '')::bigint
 where id = :'id';
SQL
log info "backup concluído: $ARQ_BANCO ($TAM_BANCO bytes)"
