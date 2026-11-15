Atualize o **sistema de devoluções** na VPS compartilhada, da Fase 1 (no ar hoje) para as Fases 2 a 6. Siga os passos na ordem. Se algum passo der erro, **pare e me mostre a saída**. Não improvise.

## Regras da VPS (valem para tudo)
- A VPS é **compartilhada**. Não mexa em outros sites, containers, volumes ou redes. Use só o projeto `devolucoes` em `/opt/devolucoes`.
- No nginx, rode só `nginx -t && systemctl reload nginx`. **Nunca** `restart` nem `stop`. Se o `nginx -t` acusar erro, **não recarregue**.
- **Nunca** rode `docker image prune`, `docker system prune` ou `docker volume prune`. Eles apagariam coisas de outros projetos.
- **Segredos nunca aparecem no chat nem vão para o git.** Não rode `cat .env.producao` e não mostre valores. Para conferir o arquivo, use só os comandos daqui, que mostram os nomes das variáveis e não os valores.

> As Fases 2 a 6 já estão no `main` (commit `0fd1dc3`), e a imagem `:main` desse commit foi gerada pelo GitHub Actions.

## 0. Preparo (só leitura)
```sh
cd /opt/devolucoes
dc() { docker compose --env-file .env.producao -f docker-compose.prod.yml "$@"; }   # rode de novo se abrir outro terminal
whoami; git status --short; git log --oneline -1
dc ps                      # esperado hoje: só devolucoes-web-1 e devolucoes-postgres-1
free -h; df -h /           # o worker novo usa até 1 GB de RAM; as mídias ficam no disco
cut -d= -f1 .env.producao  # só os NOMES das variáveis, sem os valores
grep -n -E "listen|server_name|client_max_body_size|location" /etc/nginx/sites-available/devolucoes
```
- CONFERIR: o usuário é `root`? Os caminhos `~/backups-devolucoes` abaixo partem disso.
- CONFERIR: o arquivo do nginx é mesmo `/etc/nginx/sites-available/devolucoes` (é o que diz `docs/operacao/deploy-vps.md`) e já tem `client_max_body_size 6m;` (passo da Fase 1).
- CONFERIR: há RAM livre para o `worker` (limite de 1 GB) e, se for ligado, para o `backup` (256 MB).

## 1. Cópias de segurança antes de qualquer mudança
```sh
mkdir -p ~/backups-devolucoes && chmod 700 ~/backups-devolucoes
DATA=$(date +%F_%H%M)
# Banco (serviço "postgres", banco e usuário "devolucoes"), no formato custom
dc exec -T postgres pg_dump -U devolucoes -d devolucoes -Fc > ~/backups-devolucoes/banco-antes-fases2-6_$DATA.dump
ls -lh ~/backups-devolucoes/ && dc exec -T postgres pg_restore --list < ~/backups-devolucoes/banco-antes-fases2-6_$DATA.dump | head -5
# Imagem em uso hoje, com um nome local (é ela que a volta usa)
docker tag "$(docker inspect --format '{{.Image}}' devolucoes-web-1)" ghcr.io/c77idm-dev/devolucoes:fase1-antes
# Commit da configuração, nginx e .env de hoje (fora de /etc/nginx/sites-enabled, para o nginx não carregar a cópia)
git rev-parse HEAD > ~/backups-devolucoes/commit-antes.txt
cp -p /etc/nginx/sites-available/devolucoes ~/backups-devolucoes/nginx-devolucoes.antes
cp -p .env.producao ~/backups-devolucoes/env.producao.antes && chmod 600 ~/backups-devolucoes/*
```
O `.dump` precisa ter mais que alguns KB, e o `pg_restore --list` precisa listar o conteúdo. Se algum dos dois falhar, **pare**.

## 2. Atualizar os arquivos do projeto
É o que o projeto faz (`scripts/deploy.sh`). A VPS não compila nada: ela só baixa a imagem do `ghcr.io`.
```sh
git pull --ff-only
git log --oneline -1
ls docker/backup/          # agendar.sh backup.sh comum.sh restaurar.sh
```

## 3. Variáveis novas no `.env.producao`
Estes comandos acrescentam **só o que falta**, sem mostrar valores. Uma variável que já tem valor fica como está.
```sh
add()   { grep -q "^$1=." .env.producao || { sed -i "/^$1=\$/d" .env.producao; printf '%s=%s\n' "$1" "$2" >> .env.producao; }; }
vazia() { grep -q "^$1=" .env.producao || printf '%s=\n' "$1" >> .env.producao; }

# Obrigatória (contrato E17). Sem ela, o lerEnv recusa a subida em produção e o sistema dá erro 500.
add SEGREDO_LINKS "$(openssl rand -hex 32)"
# Cifra os tokens do Mercado Livre: 32 bytes em base64. Gere agora e NUNCA troque depois de conectar o ML.
add CHAVE_CRIPTOGRAFIA "$(openssl rand -base64 32)"
# Mídia no disco da VPS, no volume /data. Os caminhos são OBRIGATÓRIOS: vazios, o sistema usaria uma pasta fora do volume.
add ARMAZENAMENTO disco
add MIDIA_DIR /data/midia
add MIDIA_TMP_DIR /data/tmp
add ML_CONECTOR api
add ML_USAR_PKCE false
add EMISSOR_NFE focus
# Ficam vazias até a etapa "Ligação das contas reais"
for v in ML_CLIENT_ID ML_CLIENT_SECRET ML_REDIRECT_URI FOCUS_TOKEN_HOMOLOGACAO FOCUS_TOKEN_PRODUCAO \
         S3_ENDPOINT S3_REGIAO S3_BUCKET S3_CHAVE_ID S3_CHAVE_SECRETA; do vazia "$v"; done
chmod 600 .env.producao
grep -c '^BACKUP_' .env.producao   # esperado 0: as variáveis do backup ficam SÓ no .env.backup (contrato E20)

# Arquivo próprio do backup (só o serviço "backup" lê; o web e o worker não enxergam)
[ -f .env.backup ] || cp .env.backup.example .env.backup
chmod 600 .env.backup

# Conferência, sem os valores:
awk -F= '/^[A-Z_]+=/{print $1, (length(substr($0, index($0,"=")+1))>0 ? "preenchida" : "vazia")}' .env.producao
awk -F= '/^SEGREDO_LINKS=/{print "SEGREDO_LINKS tem", length($2), "caracteres (esperado 64)"}' .env.producao
grep -c '^PERMITIR_FALSOS' .env.producao   # esperado 0: em produção essa variável não pode existir
grep -c '^IMAGEM_TAG=main' .env.producao   # esperado 1
```
- **O usuário (não você) guarda uma cópia da `CHAVE_CRIPTOGRAFIA`** no gerenciador de senhas dele, num SSH próprio, fora deste chat. Se ela se perder ou mudar, a conta do ML precisa ser conectada de novo.
- **BACKUP_\*:** ficam no `.env.backup`, **nunca** no `.env.producao`. Se o bucket de backup no B2 ainda não existe, deixe-as vazias. Elas entram na etapa "Ligação das contas reais". Se ele já existe, quem preenche é o usuário, direto no arquivo (`nano .env.backup`):
  - `BACKUP_S3_ENDPOINT`, `BACKUP_S3_REGIAO`, `BACKUP_S3_BUCKET`, `BACKUP_S3_CHAVE_ID`, `BACKUP_S3_CHAVE_SECRETA`;
  - `BACKUP_SENHA`, gerada por ele (`openssl rand -hex 32`) e com uma cópia fora da VPS;
  - o bucket é **só de backup**, diferente do bucket das mídias, e a chave enxerga só esse bucket e não pode apagar arquivos.
  
  Não peça esses valores no chat.
- **O que não funciona com ML_\* e FOCUS_\* vazias** (é o esperado até a etapa "Ligação das contas reais"):
  - Mercado Livre: conectar a conta (Configurações › Mercado Livre mostra o que falta), os avisos e a varredura das reclamações, a resposta OK automática e o envio das Contestações.
  - Focus NFe: a emissão da NF de devolução (etapa 4) e da NF de remessa dos lotes, e o DANFE. Uma emissão tentada vai para **Falhas** depois de 5 tentativas.
  - O resto funciona, com as mídias no disco da VPS: cadastros, recebimento, conferência com fotos e vídeo, lotes, alertas e Falhas.

## 4. Baixar a imagem nova
```sh
dc pull web worker
```
CONFERIR: se o `pull` disser "denied" ou "unauthorized", a imagem ficou privada. Nesse caso, peça ao usuário para fazer `docker login ghcr.io` com um token `read:packages`, e não mude a visibilidade por conta própria.

## 5. Subir o web primeiro (ele aplica as migrações)
As migrações rodam sozinhas na subida do `web` (`node dist/migrar.mjs` no CMD). Nesta atualização entram as migrações `0006` a `0010`. O `worker` não migra, por isso ele sobe depois.
```sh
dc up -d web
dc logs --tail=40 web       # esperado: "Migrações aplicadas." e o servidor no ar, sem erro de "Variáveis de ambiente inválidas"
dc exec -T postgres psql -U devolucoes -d devolucoes -Atc "select count(*) from drizzle.__drizzle_migrations"   # esperado 11
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3020/api/saude   # esperado 200
curl -s http://127.0.0.1:3020/api/saude    # esperado {"status":"ok","banco":"ok","fila":"ok"}
```
Se o log mostrar "Variáveis de ambiente inválidas", ele diz qual variável falta. Corrija o `.env.producao` (passo 3) e rode `dc up -d web` de novo. Se a migração falhar, **pare** e vá para a **Volta** (passo 9).

## 6. Subir o worker (e decidir o backup)
```sh
dc up -d worker
```
- **Com o B2 de backup preenchido no `.env.backup`:** rode `dc up -d backup` e, em seguida, um backup na hora: `dc exec backup sh /backup/backup.sh`. Ele deve terminar com `backup concluído`. O teste de restauração está em `docs/operacao/backup-restauracao.md`, seção 6.
- **Sem o B2 (o caso de agora):** **não** suba o `backup`. Sem bucket, às 02h30 ele grava FALHOU, e o painel do Gestor acende o alerta "Backup diário atrasado".
  - Atenção: um `dc up -d` sem nomes de serviço, e também o `scripts/deploy.sh`, sobem o `backup` junto. Até ligar o B2, use sempre `dc up -d web worker`. Se ele subir por engano, pare com `dc stop backup`.
  - O `backup` instala `rclone`, `openssl` e `tzdata` pelo `apk` a cada subida, então precisa de internet.

## 7. nginx: bloco do upload das evidências
O upload das fotos e do vídeo (tus) precisa deste bloco, copiado de `docker/nginx/devolucoes.conf` do repositório. O caminho é `/api/midia`, **sem barra no fim**: ele cobre `/api/midia` e `/api/midia/...`.
```nginx
    # Upload das evidências (tus): pedaços de 5 MB, sem guardar o corpo no nginx, com prazo para rede móvel lenta.
    location /api/midia {
        client_max_body_size 12m;
        proxy_request_buffering off;
        proxy_http_version 1.1;
        client_body_timeout 120s;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
        proxy_pass http://127.0.0.1:3020;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
```
**Onde ele entra:** em `/etc/nginx/sites-available/devolucoes`, dentro do bloco `server` que tem `listen 443 ssl` (o que o certbot criou) e o `location / { proxy_pass http://127.0.0.1:3020; ... }`. Ele vai logo **antes** do `location / {`, depois do `location = /api/ml/notificacoes`. **Não** coloque no bloco da porta 80, que só redireciona para o HTTPS. Não mexa em nenhum outro arquivo do nginx.
```sh
nano /etc/nginx/sites-available/devolucoes     # cole o bloco no lugar descrito acima
grep -n -A2 "location /api/midia" /etc/nginx/sites-available/devolucoes
nginx -t && systemctl reload nginx
```
Se o `nginx -t` falhar, **não recarregue**. Volte o arquivo e confira de novo:
```sh
cp -p ~/backups-devolucoes/nginx-devolucoes.antes /etc/nginx/sites-available/devolucoes && nginx -t
```
CONFERIR: o `location / {` existe uma vez só, dentro do bloco 443. Se o certbot montou o arquivo de outro jeito, me mostre a saída do `grep -n` do passo 0 antes de editar.

## 8. Conferência final
```sh
dc ps     # web: healthy; worker: healthy (pode levar até ~1 min); postgres: healthy; backup: só se foi ligado
curl -s -o /dev/null -w "%{http_code}\n" https://devolucoes.179-199-128-100.sslip.io/api/saude   # 200
curl -sI https://devolucoes.179-199-128-100.sslip.io/login | grep -i -E "content-security-policy|x-frame-options|x-content-type-options|referrer-policy|permissions-policy|strict-transport-security|x-powered-by"
# Batimento do worker: hora gravada há menos de 2 min
dc exec worker sh -c 'echo "batimento: $(cat /tmp/devolucoes-worker-vivo)  agora: $(date -u +%FT%TZ)"'
dc logs --tail=30 worker  # linhas JSON com "origem":"worker", sem erro em sequência
docker stats --no-stream devolucoes-web-1 devolucoes-worker-1 devolucoes-postgres-1
```
- [ ] `/api/saude` responde 200, por dentro (`127.0.0.1:3020`) e pelo domínio.
- [ ] O `dc ps` mostra `healthy` no web e no worker.
- [ ] O `curl -I` mostra `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` e `Strict-Transport-Security`, e **não** mostra `X-Powered-By`. Os cabeçalhos ficam fora de `/api/`, por isso o teste usa `/login`.
- [ ] O batimento do worker é recente.
- [ ] **O usuário, no celular:**
  - entra com o login de sempre;
  - abre uma devolução na Conferência e tira uma foto: ela sobe sem erro e aparece processada, com o carimbo, depois de alguns segundos;
  - se der, grava um Vídeo de Prova curto.
  - Na VPS, confira com `dc logs --tail=50 worker | grep -i midia` e `dc exec web ls /data/midia | head`.
- [ ] O usuário abre **Configurações › Falhas** (`/configuracoes/falhas`, como Gestor) e a página carrega. Abre também o painel `/fluxo` com o bloco Alertas.
- [ ] Só depois de tudo certo, e de preferência alguns dias depois, libere o espaço das versões antigas. Isso apaga só as imagens sem nome **deste** projeto e mantém a `fase1-antes`:
  ```sh
  docker images --filter dangling=true -q | xargs -r docker image inspect --format "{{.Id}} {{.RepoDigests}}" | grep "ghcr.io/c77idm-dev/devolucoes@" | cut -d" " -f1 | xargs -r docker rmi
  ```

## 9. Volta (se algo der errado)
As migrações `0006` a `0010` não têm volta. Por isso, a volta é sempre **imagem antiga + banco do passo 1**. As fotos e os dados gravados depois da atualização se perdem.
```sh
cd /opt/devolucoes
dc() { docker compose --env-file .env.producao -f docker-compose.prod.yml "$@"; }
DUMP=$(ls -t ~/backups-devolucoes/banco-antes-fases2-6_*.dump | head -1); echo "$DUMP"
# 1) Parar o que é deste projeto e usa o banco (o postgres continua de pé)
dc stop web worker backup
# 2) Restaurar o banco do passo 1
dc exec -T postgres dropdb -U devolucoes --force devolucoes
dc exec -T postgres createdb -U devolucoes -O devolucoes devolucoes
dc exec -T postgres pg_restore -U devolucoes -d devolucoes --no-owner < "$DUMP"
# 3) Configuração e .env da Fase 1 (o compose da Fase 1 não tem worker nem backup)
git checkout "$(cat ~/backups-devolucoes/commit-antes.txt)"
cp -p ~/backups-devolucoes/env.producao.antes .env.producao
sed -i 's/^IMAGEM_TAG=.*/IMAGEM_TAG=fase1-antes/' .env.producao
# 4) Subir a Fase 1 com a imagem guardada no passo 1 (sem "pull": a tag fase1-antes existe só nesta VPS)
dc up -d --remove-orphans      # --remove-orphans tira só o worker e o backup DESTE projeto
curl -s http://127.0.0.1:3020/api/saude
```
- No nginx, o bloco `/api/midia` pode ficar: sem ele a Fase 1 funciona igual. Se quiser tirar, rode `cp -p ~/backups-devolucoes/nginx-devolucoes.antes /etc/nginx/sites-available/devolucoes && nginx -t && systemctl reload nginx`.
- O volume `devolucoes_midia` continua lá. **Não** o apague sem o usuário pedir.
- Para tentar de novo depois: `git checkout main`, `sed -i 's/^IMAGEM_TAG=.*/IMAGEM_TAG=main/' .env.producao` e recomece do passo 3.
- CONFERIR: se o restore mostrar erros de "role" ou de "extension", me mostre a saída. Erros soltos do `pg_restore` sobre um comentário de schema costumam ser inofensivos.

Ao terminar, me mande:
- a saída do `dc ps`;
- o código do `/api/saude`;
- as linhas de cabeçalho do `curl -I`;
- o resultado do teste da foto no celular.
