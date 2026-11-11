# Implantação na VPS

## O que é preciso
- VPS com Ubuntu 24.04: mínimo 2 vCPU, 4 GB de RAM e 200 GB de disco. Recomendado: 4 vCPU e 8 GB.
- Um subdomínio (ex.: `devolucoes.suaempresa.com.br`) com registro **A** apontando para o IP da VPS.
- Acesso SSH à VPS.

## Primeira vez
1. Instale o Docker e libere o firewall:
   ```sh
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker "$USER"   # permite rodar docker sem sudo (saia e entre de novo no SSH)
   sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw --force enable
   ```
   Depois desse passo, saia do SSH e entre de novo para a permissão do grupo docker valer.
2. Baixe o código em `/opt/devolucoes`:
   ```sh
   sudo mkdir -p /opt/devolucoes && sudo chown "$USER" /opt/devolucoes
   git clone https://github.com/c77idm-dev/MKT-_-DEV.git /opt/devolucoes
   ```
   Se o repositório for privado, crie uma *deploy key* (chave SSH só de leitura) no GitHub e clone pelo endereço SSH.
3. Crie a configuração de produção:
   ```sh
   cd /opt/devolucoes
   cp .env.producao.example .env.producao
   nano .env.producao   # troque DOMINIO, POSTGRES_PASSWORD e a senha dentro de DATABASE_URL
   ```
   Gere a senha do banco com `openssl rand -hex 32`. Use só hexadecimal: caracteres especiais quebram a `DATABASE_URL`, e `$` quebra a interpolação do compose. Use o mesmo valor em `POSTGRES_PASSWORD` e dentro da `DATABASE_URL`.

   Atenção: `POSTGRES_PASSWORD` só vale quando o volume `pgdata` é criado pela primeira vez. Para trocar a senha depois, é preciso usar `ALTER USER` dentro do Postgres.
4. Se a VPS tem 4 GB de RAM, crie 2 GB de swap antes do primeiro `--build`:
   ```sh
   sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile && echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
   ```
5. Suba tudo:
   ```sh
   docker compose --env-file .env.producao -f docker-compose.prod.yml up -d --build
   ```
6. Confira em `https://SEU-DOMINIO/api/saude`. Deve aparecer `{"status":"ok","banco":"ok"}`.
7. Crie o primeiro Gestor:
   ```sh
   docker compose --env-file .env.producao -f docker-compose.prod.yml exec web \
     node dist/criar-usuario.mjs --nome "Seu Nome" --email voce@empresa.com --perfil GESTOR
   ```

## Atualizar (do seu PC)
```sh
VPS_SSH=usuario@ip-da-vps sh scripts/deploy.sh
```

## Voltar para a versão anterior
```sh
cd /opt/devolucoes
git log --oneline -5             # escolha o commit anterior
git checkout <commit>
docker compose --env-file .env.producao -f docker-compose.prod.yml up -d --build
```
Para voltar ao normal depois: `git checkout main && git pull`.

## Ver os registros
```sh
docker compose --env-file .env.producao -f docker-compose.prod.yml logs -f web
```
