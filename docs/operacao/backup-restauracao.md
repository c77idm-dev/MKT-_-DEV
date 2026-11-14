# Backup diário e restauração

Nos comandos abaixo, `docker compose ...` quer dizer `docker compose --env-file .env.producao -f docker-compose.prod.yml`, rodado em `/opt/devolucoes`.

## 1. O que é salvo, quando e por quanto tempo
- **Todo dia às 02h30** (horário de Brasília), o serviço `backup` salva:
  - o **banco** (`pg_dump`), em `banco/devolucoes-AAAA-MM-DD_HHMMSS.dump.enc`;
  - as **mídias** (fotos e vídeos), em `midia/midia-AAAA-MM-DD_HHMMSS.tar.enc`, **só no modo `ARMAZENAMENTO=disco`**. No modo `s3` as mídias já estão fora da VPS.
- Tudo é **cifrado** (AES-256) antes de sair da VPS e vai direto para o bucket de backup, sem arquivo temporário no disco.
- Os arquivos ficam **30 dias**.
- Cada execução (OK ou FALHOU) fica registrada no sistema. O Gestor vê o alerta "Backup diário atrasado" se passar de um dia sem backup.
- **Atenção ao espaço:** no modo disco, o `tar` das mídias é inteiro todo dia. O bucket cresce até **30 vezes** o tamanho das mídias.

## 2. Primeira vez, no B2
1. Crie um bucket **só de backup**, diferente do bucket das mídias. O sistema recusa o mesmo bucket.
2. Ligue nele a regra de ciclo de vida **"Keep only the last version of the file"**, com exclusão das versões antigas depois de 1 dia, e a exclusão dos arquivos com mais de 30 dias. O `rclone delete` do B2 só esconde o arquivo, e a chave recomendada nem apaga.
3. Crie uma *application key* **restrita a esse bucket**, com leitura e escrita e **sem `deleteFiles`** (proteção contra ransomware).
4. Preencha no `.env.producao`: `BACKUP_S3_ENDPOINT`, `BACKUP_S3_REGIAO`, `BACKUP_S3_BUCKET`, `BACKUP_S3_CHAVE_ID`, `BACKUP_S3_CHAVE_SECRETA` e `BACKUP_SENHA`.
5. Suba o serviço: `docker compose ... up -d backup`.

## 3. A senha
- A `BACKUP_SENHA` é gerada no seu gerenciador de senhas e colada **só** no `.env.producao` da VPS.
- Nunca vai para o chat, o git ou um e-mail.
- **Guarde uma cópia no gerenciador de senhas.** Sem ela, o backup não abre.

## 4. Rodar um backup agora
```sh
docker compose ... exec backup sh /backup/backup.sh
```

## 5. Listar os backups
```sh
docker compose ... exec backup sh -c '. /backup/comum.sh && rclone lsf "$REMOTO/banco"'
```

## 6. Teste de restauração
Faça **no mínimo uma vez por mês** e **antes de dar a Fase 6 por pronta** (spec §14).
```sh
docker compose ... exec backup sh /backup/restaurar.sh banco/<arquivo>
```
- Isso restaura num banco **separado** (`devolucoes_restauracao`), sem tocar no banco do sistema.
- As contagens que aparecem (usuários, devoluções etc.) têm de bater com as do sistema.
- Depois, apague o banco de teste:
```sh
docker compose ... exec backup dropdb --maintenance-db=postgres devolucoes_restauracao
```

## 7. Restauração de verdade (desastre)
1. Pare o web e o worker: `docker compose ... stop web worker`.
2. Restaure por cima do banco do sistema:
   ```sh
   docker compose ... exec -e CONFIRMAR=sim backup sh /backup/restaurar.sh banco/<arquivo> devolucoes
   ```
3. Suba tudo de novo: `docker compose ... up -d`.
4. Confira `https://SEU_DOMINIO/api/saude`.

## 8. Mídias, à mão
- **Modo `disco`:** num container temporário com o volume `midia:/data` **sem** `:ro` e com as variáveis `BACKUP_*`:
  ```sh
  rclone cat "$REMOTO/midia/<arquivo>" | openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_SENHA | tar -xf - -C /data
  ```
- **Modo `s3`:** as mídias ficam no B2, e a regra de versões do bucket das mídias cobre os 30 dias.
