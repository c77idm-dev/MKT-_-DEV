# Implantação na VPS

A VPS é **compartilhada**:
- O nginx já atende outros sites nas portas 80 e 443.
- Já rodam outros containers.

Por isso, este sistema:
- **não ocupa as portas 80 e 443**: escuta só em `127.0.0.1:3020`, e o nginx do servidor faz o HTTPS;
- **não é compilado na VPS**: o GitHub Actions compila a imagem a cada envio para a `main` e a publica em `ghcr.io/c77idm-dev/devolucoes`, e a VPS só baixa;
- usa nomes próprios no Docker: projeto `devolucoes`, containers `devolucoes-web-1` e `devolucoes-postgres-1`, volume `devolucoes_pgdata`;
- roda os serviços `web` (512 MB), `worker` (1 GB), `postgres` (256 MB) e `backup` (256 MB), todos com limite de memória, para não apertar os outros sistemas.

Nos comandos abaixo, troque `SEU_DOMINIO` pelo domínio do sistema (ex.: `devolucoes.suaempresa.com.br`).

## O que é preciso
- Docker e Docker Compose instalados na VPS. Se ainda não tiver: `curl -fsSL https://get.docker.com | sh`.
- O domínio do sistema com registro **A** apontando para o IP da VPS.
  - Sem domínio próprio, dá para usar provisoriamente `devolucoes.IP-COM-HIFENS.sslip.io` (ex.: `devolucoes.203-0-113-10.sslip.io`). Ele aponta sozinho para o IP e dispensa configurar DNS.
- A imagem pública no GitHub (passo 1).

## Primeira vez

1. **Deixe a imagem pública** (uma vez só). Depois que o GitHub Actions rodar pela primeira vez:
   - abra https://github.com/users/c77idm-dev/packages/container/package/devolucoes;
   - vá em **Package settings → Change visibility → Public**.
   
   Se preferir manter a imagem privada, faça na VPS `docker login ghcr.io` com um token do GitHub que tenha a permissão `read:packages`.

2. **Baixe a configuração** em `/opt/devolucoes`:
   ```sh
   git clone https://github.com/c77idm-dev/MKT-_-DEV.git /opt/devolucoes
   cd /opt/devolucoes
   ```

3. **Crie o `.env.producao`:**
   ```sh
   cp .env.producao.example .env.producao
   openssl rand -hex 32   # copie o resultado
   nano .env.producao     # cole a senha em POSTGRES_PASSWORD e dentro da DATABASE_URL
   chmod 600 .env.producao
   ```
   - Use só a senha hexadecimal: caracteres especiais quebram a `DATABASE_URL`, e `$` quebra o compose.
   - `POSTGRES_PASSWORD` só vale quando o volume do banco é criado pela primeira vez.
   - Crie também o `.env.backup`, o arquivo só das variáveis do backup (contrato E20): `cp .env.backup.example .env.backup && chmod 600 .env.backup`. Os valores entram no passo 2 de [backup-restauracao.md](backup-restauracao.md). Sem esse arquivo o sistema sobe do mesmo jeito; só o backup registra FALHOU.

4. **Suba o sistema e confira:**
   ```sh
   docker compose --env-file .env.producao -f docker-compose.prod.yml pull
   docker compose --env-file .env.producao -f docker-compose.prod.yml up -d
   curl -s http://127.0.0.1:3020/api/saude
   ```
   Deve aparecer `{"status":"ok","banco":"ok"}`. As migrações do banco rodam sozinhas na subida.

5. **Ligue o domínio no nginx:**
   ```sh
   sed "s/DOMINIO_DO_SISTEMA/SEU_DOMINIO/" docker/nginx/devolucoes.conf > /etc/nginx/sites-available/devolucoes
   ln -s /etc/nginx/sites-available/devolucoes /etc/nginx/sites-enabled/devolucoes
   nginx -t && systemctl reload nginx
   ```
   Se `nginx -t` acusar erro, **não recarregue**: remova o link (`rm /etc/nginx/sites-enabled/devolucoes`) e investigue. Os outros sites continuam no ar com a configuração antiga.

6. **Ligue o HTTPS** (do mesmo jeito que os outros sites do servidor):
   ```sh
   certbot --nginx -d SEU_DOMINIO
   ```
   Depois, confira em `https://SEU_DOMINIO/api/saude`.

7. **Crie o primeiro Gestor.** O comando pede a senha:
   ```sh
   docker compose --env-file .env.producao -f docker-compose.prod.yml exec -it web \
     node dist/criar-usuario.mjs --nome "Seu Nome" --email voce@empresa.com --perfil GESTOR
   ```

## Atualizar
Depois que o GitHub Actions terminar de compilar a nova versão (aba **Actions** do repositório), rode do seu PC:
```sh
VPS_SSH=root@IP-DA-VPS sh scripts/deploy.sh
```
Ou rode direto na VPS: `cd /opt/devolucoes && git pull && docker compose --env-file .env.producao -f docker-compose.prod.yml pull && docker compose --env-file .env.producao -f docker-compose.prod.yml up -d`.

Para liberar espaço das versões antigas, remova só as imagens sem nome deste projeto. **Não use `docker image prune`**: a VPS é compartilhada e ele apagaria imagens sem uso de outros projetos (o `scripts/deploy.sh` já faz isto):
```sh
docker images --filter dangling=true -q | xargs -r docker image inspect --format "{{.Id}} {{.RepoDigests}}" | grep "ghcr.io/c77idm-dev/devolucoes@" | cut -d" " -f1 | xargs -r docker rmi
```

## Voltar para a versão anterior
Cada versão compilada também é publicada com o hash do commit. No `.env.producao`, troque `IMAGEM_TAG=main` pelo hash completo do commit desejado e rode:
```sh
docker compose --env-file .env.producao -f docker-compose.prod.yml up -d
```
Para voltar ao normal, coloque `IMAGEM_TAG=main` de novo.

## Ver os registros
```sh
docker compose --env-file .env.producao -f docker-compose.prod.yml logs -f web
```

## Backup diário
O serviço `backup` salva o banco (e as mídias, no modo disco) todo dia às 02h30, cifrado, num bucket separado. Passo a passo, restauração e teste mensal: [backup-restauracao.md](backup-restauracao.md).

As variáveis do backup (`BACKUP_S3_*` e `BACKUP_SENHA`) ficam no `.env.backup`, nunca no `.env.producao` (contrato E20):
- o `web` e o `worker` leem o `.env.producao` inteiro e não precisam da chave do bucket de backup nem da senha da cifra;
- o serviço `backup` lê só o `.env.backup`. Do `.env.producao` ele recebe apenas a senha do banco, o modo de armazenamento, a pasta das mídias e o nome do bucket das mídias. Nunca vê os tokens do ML e da Focus, as chaves S3 das mídias, a `CHAVE_CRIPTOGRAFIA` nem o `SEGREDO_LINKS`.

Risco que sobra: o container instala `rclone`, `openssl` e `tzdata` pelo `apk` a cada subida, sem versão fixa. Se a instalação falhar, o backup não roda, e o alerta "Backup diário atrasado" avisa o Gestor. A melhoria opcional é uma imagem própria compilada pelo GitHub Actions.

## Saúde dos containers
```sh
docker compose --env-file .env.producao -f docker-compose.prod.yml ps
```
O `web` e o `worker` devem aparecer como `healthy`.

## Fase 1: planilhas de até 5 MB
A importação de planilhas envia arquivos de até 5 MB. Na VPS, aumente o limite do nginx uma vez:
```sh
sed -i 's/client_max_body_size 1m;/client_max_body_size 6m;/' /etc/nginx/sites-available/devolucoes
nginx -t && systemctl reload nginx
```
Se `nginx -t` acusar erro, não recarregue e confira o arquivo.

## Dossiê de provas (PDF): prazo de 120 s no nginx
Numa devolução com muitas fotos, gerar o dossiê pode passar dos 60 s que o nginx espera por padrão; o sistema corta em 100 s. Uma vez, na VPS, abra `/etc/nginx/sites-available/devolucoes` e cole o bloco `location ~ ^/api/devolucoes/[^/]+/dossie$ { ... }` de `docker/nginx/devolucoes.conf` antes do `location / {` de **cada** `server` (o da porta 80 e o da 443, que o certbot criou). Depois:
```sh
nginx -t && systemctl reload nginx
```
Se `nginx -t` acusar erro, não recarregue e confira o arquivo. Sem o bloco, o dossiê de uma devolução grande dá 504 no celular.

## Dossiê de provas: links das fotos e do vídeo (E28)
Cada foto e o vídeo do dossiê viram link público (sem login), que vale 90 dias: `https://<domínio>/api/provas/arquivo?...` (a foto) e `https://<domínio>/api/provas/video?...` (a página que toca o vídeo). Nada a mudar no nginx: o endereço vem do `Host` e do `X-Forwarded-Proto` que os blocos de `docker/nginx/devolucoes.conf` já mandam.
- O sistema só usa esse endereço quando ele é um nome de host válido, igual ao `X-Forwarded-Host`, e com `https`. Se um `location` perder o `proxy_set_header Host $host;` ou o `proxy_set_header X-Forwarded-Proto $scheme;`, o dossiê sai **sem** os links (não quebra).
- Em produção, o `localhost` nunca vira link: o dossiê gerado pelo acesso direto ao app (por exemplo, um túnel SSH até `127.0.0.1:3020`) sai sem links. Gere o dossiê sempre pelo domínio.
- Quando o dossiê sai sem links e havia provas prontas no disco, o `web` escreve uma linha `"evento":"dossie_sem_links"` com o código da devolução, o motivo e o número de provas. Motivos: `sem_https`, `host_invalido`, `host_diferente_do_encaminhado` ou `localhost_em_producao`. Para procurar:
  ```sh
  docker compose --env-file .env.producao -f docker-compose.prod.yml logs web | grep dossie_sem_links
  ```
- **Conferir depois do deploy.** O e2e só testa no Chromium, no computador e com a tela de celular do Pixel 7. O Safari do iPhone só é conferido aqui.
  1. Pelo domínio (https), gere o dossiê de uma devolução que tenha fotos e vídeo prontos.
  2. Abra o PDF e toque nos links numa **janela anônima**, sem login, em três aparelhos: um **iPhone (Safari)**, um **Android (Chrome)** e um **computador** (Chrome ou Edge, e o Firefox).
  3. Em cada aparelho, confira:
     - a foto abre sem pedir login, em tamanho original;
     - o "Assistir ao vídeo" abre a página "Vídeo de Prova · DEV-…";
     - o vídeo toca com os controles do navegador (tocar, pausar, barra de tempo e tela cheia);
     - nada é baixado.
  4. Se o vídeo não tocar ou ficar sem controles **só no Safari**, não mexa no CSP na VPS. Anote o modelo do iPhone e a versão do iOS e avise o desenvolvimento.
     - A página do player usa o CSP `sandbox` sem `allow-scripts`. O WebKit já teve um defeito em que o CSP bloqueava os controles do player: os bugs 223422 e 225865 do bugs.webkit.org. Foi corrigido em 2021, e o relato com `sandbox` era do Safari 14.
     - A hipótese a testar é `sandbox allow-scripts` em `src/app/api/provas/video/route.ts`, mantendo `default-src 'none'` sem `script-src`: o CSP continua bloqueando todo script da página.
- Trocar o `SEGREDO_LINKS` invalida todos os links já entregues (os de sessão e os do dossiê). Os PDFs antigos passam a dizer que o link não é válido; basta gerar o dossiê de novo.
- Só funciona com as mídias no disco (`ARMAZENAMENTO=disco`). Prova guardada no S3 fica sem link no PDF.

## Ligar o modo Bitbrain (devoluções do ML pelo Bitbrain)

Pré-requisito: a sessão do Bitbrain publicou a rota (`docs/integracao/bitbrain-rota-devolucoes.md`), e o Nathan gerou o `DEVOLUCOES_TOKEN` (`openssl rand -hex 32`) e o pôs no `.env` do Bitbrain.

Antes de começar, defina o atalho `dc` (rode de novo se abrir outro terminal):

```bash
cd /opt/devolucoes && dc() { docker compose --env-file .env.producao -f docker-compose.prod.yml "$@"; }
```

1. Confira a rota, sem gravar o token no histórico:
   ```bash
   read -rs TOKEN && curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $TOKEN" https://app.bitbrain.com.br/integracao/devolucoes/empresas; unset TOKEN
   ```
   Esperado: `200`. `401` = token diferente; `404` = rota desligada; `429` = limite da rota (`DEVOLUCOES_RPM`): espere 1 minuto.
2. No `.env.producao` do sistema (fora do git), troque ou acrescente:
   ```
   ML_CONECTOR=bitbrain
   BITBRAIN_URL=https://app.bitbrain.com.br
   BITBRAIN_TOKEN=<o mesmo DEVOLUCOES_TOKEN>
   ```
3. Suba de novo só o web e o worker: `dc up -d web worker`. Confira `dc ps` (healthy) e `curl -s https://<domínio do sistema>/api/saude`. O log nunca mostra o token.
4. No sistema, em Configurações › Mercado Livre (Gestor): "Atualizar contas", marque as contas que mandam devoluções para a bancada e toque em "Sincronizar agora".
5. **Para voltar atrás:** `ML_CONECTOR=api` no `.env.producao` e `dc up -d web worker`. Os dados ficam, e as contas e os extras continuam guardados.
