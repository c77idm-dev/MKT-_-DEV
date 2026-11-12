# Implantação na VPS

A VPS é **compartilhada**:
- O nginx já atende outros sites nas portas 80 e 443.
- Já rodam outros containers.

Por isso, este sistema:
- **não ocupa as portas 80 e 443**: escuta só em `127.0.0.1:3020`, e o nginx do servidor faz o HTTPS;
- **não é compilado na VPS**: o GitHub Actions compila a imagem a cada envio para a `main` e a publica em `ghcr.io/c77idm-dev/devolucoes`, e a VPS só baixa;
- usa nomes próprios no Docker: projeto `devolucoes`, containers `devolucoes-web-1` e `devolucoes-postgres-1`, volume `devolucoes_pgdata`;
- tem limites de memória (web 512 MB, banco 256 MB), para não apertar os outros sistemas.

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
