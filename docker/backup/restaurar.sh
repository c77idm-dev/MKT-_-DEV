#!/bin/sh
# Restaura um backup do banco (spec §10). Veja docs/operacao/backup-restauracao.md.
# Uso: sh /backup/restaurar.sh banco/devolucoes-AAAA-MM-DD_HHMMSS.dump.enc [banco_destino]
# Padrão: um banco SEPARADO (devolucoes_restauracao), para conferir sem tocar no banco do sistema.
# Por cima do banco do sistema: pare o web e o worker e use CONFIRMAR=sim com o destino igual a PGDATABASE.
# As mídias (tar do modo disco) voltam à mão: veja o documento.
set -eu
set -o pipefail
. "$(dirname "$0")/comum.sh"

ARQUIVO="${1:?Informe o arquivo. Liste com: rclone lsf backup:\$BACKUP_S3_BUCKET/banco}"
DESTINO="${2:-devolucoes_restauracao}"

case "$DESTINO" in
  devolucoes_restauracao*) ;;
  *)
    if [ "$DESTINO" != "${PGDATABASE:-devolucoes}" ] || [ "${CONFIRMAR:-}" != "sim" ]; then
      echo "Destino recusado: $DESTINO. Use devolucoes_restauracao (padrão), ou o banco do sistema com CONFIRMAR=sim e o web e o worker parados." >&2
      exit 1
    fi
    ;;
esac
[ -n "${BACKUP_SENHA:-}" ] || { echo "BACKUP_SENHA não definida." >&2; exit 1; }

# Banco limpo: dropdb e createdb conectados ao banco "postgres" (nunca ao que vai ser apagado).
dropdb --maintenance-db=postgres --if-exists "$DESTINO"
createdb --maintenance-db=postgres "$DESTINO"
rclone cat "$REMOTO/$ARQUIVO" | decifrar | pg_restore --no-owner --exit-on-error -d "$DESTINO"

for tabela in usuarios devolucoes itens_devolucao evidencias notas_fiscais lotes eventos_historico; do
  printf '%s: %s\n' "$tabela" "$(psql -X -At -d "$DESTINO" -c "select count(*) from $tabela")"
done
echo "Restauração concluída em $DESTINO."
