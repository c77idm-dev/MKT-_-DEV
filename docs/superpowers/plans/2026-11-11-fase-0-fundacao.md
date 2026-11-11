# Fase 0 (Fundação): Plano de Implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar este plano tarefa por tarefa. Os passos usam checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** criar a base do sistema de gestão de devoluções. Ao final desta fase existem o projeto Next.js, o banco PostgreSQL, o login com perfis, o visual base (direção C), o recebimento de avisos do Mercado Livre, o conector e os scripts do teste real do ML, e a implantação na VPS com HTTPS.

**Arquitetura:**
- Um único projeto Next.js (App Router, TypeScript) com PostgreSQL via Drizzle.
- A regra de negócio fica em módulos puros (`src/modules/*`, `src/conectores/*`), testados com Vitest. As telas e rotas são finas e só chamam esses módulos.
- Produção: Docker Compose (Caddy + web + postgres) na VPS própria.
- Não há processo `worker` nesta fase. Ele entra na fase que precisar de tarefas de fundo (Fase 2, compressão de vídeo).

**Tecnologias:** Node 24, Next.js (versão estável atual), React 19, TypeScript, Tailwind CSS v4, Drizzle ORM com `postgres` (postgres.js), drizzle-kit, Zod, @node-rs/argon2, Vitest, Testing Library, Playwright, esbuild, tsx, Docker Compose, Caddy 2, PostgreSQL 17.

**Spec:** [docs/superpowers/specs/2026-11-11-gestao-devolucoes-design.md](../specs/2026-11-11-gestao-devolucoes-design.md). Leia as seções §4, §5.1, §6.0, §6.9, §7, §10, §13 e §14 antes de começar.

## Restrições globais

- Node **24** (a máquina de desenvolvimento tem v24.21) e **npm**.
- TypeScript em modo `strict`.
- O texto da interface é em **português do Brasil**.
- Nomes de etapas, evidências e filtros **exatamente como no PDF** (spec §6). As 5 etapas, literalmente:
  1. "Pedidos Pendentes de Chegada"
  2. "Pedidos Chegados - Aguardando Conferência"
  3. "Em Conferência / Triagem & Registro de Evidências"
  4. "Destinação Fiscal e Estoque"
  5. "Agrupamento por Fornecedor (Remessas)"
- Visual da **direção C** (spec §6.0):
  - fonte IBM Plex Sans, e IBM Plex Mono para códigos
  - fundo #F2F4F3, superfícies #FFFFFF, bordas #DDE3E0
  - texto #13201D, texto secundário #3A4A46
  - destaque #0F766E (fundo suave #E3F2EF)
- Acessibilidade: área de toque **≥ 44 px** e contraste de texto **≥ 4,5:1**.
- **Permissões checadas no servidor** em toda página e ação (spec §10). Matriz de perfis: spec §6.9.
- Senhas com **argon2** e bloqueio temporário depois de várias falhas de login (spec §10).
- Segredos só em `.env` / `.env.producao`, **nunca no git**.
- O núcleo nunca chama API externa diretamente: só pelos conectores (spec §4.3).
- Os exemplos gravados do ML (fixtures) **não podem conter dados pessoais** (LGPD, spec §10).
- Ambiente de desenvolvimento: **Windows** com Git Bash. O caminho do projeto tem espaço e "ç" (`/c/Users/idmpc/Dvoluções Markt`), então **sempre use aspas** nos caminhos.
- Toda mensagem de commit termina com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Pré-requisitos (fora do código)

- **PostgreSQL 17 instalado direto no Windows** (feito em 2026-11-11):
  - serviço `postgresql-x64-17`, porta 5432, que liga sozinho com o PC
  - usuário `devolucoes` com senha `devolucoes`, dono dos bancos `devolucoes` e `devolucoes_test`
  - `psql` em `C:\Program Files\PostgreSQL\17\bin\psql.exe`
- **Não há Docker no PC de desenvolvimento** (a virtualização está desligada na BIOS). O Docker existe só na VPS.
- Tarefa 12 (feita com o usuário):
  - VPS Ubuntu 24.04 com acesso SSH
  - subdomínio apontando para o IP da VPS
  - app criado no ML Developers

## Desvios conscientes da spec nesta fase

- **Deploy:** a spec §13 fala em `docker compose pull`. Na Fase 0, a imagem é **construída na própria VPS** (`up -d --build`), sem registro de imagens. Desfazer = `git checkout <tag anterior>` e subir de novo. O registro de imagens pode entrar depois.
- **Tokens do ML:** no teste da Fase 0 eles ficam num arquivo local ignorado pelo git (`.ml-tokens.json`). A gravação criptografada no banco (spec §7.1 e §10) é da Fase 3.
- **Banco de desenvolvimento:** PostgreSQL instalado direto no Windows, em vez de container. O pacote de produção (Docker) é testado direto na VPS, na Tarefa 12.

---

## Mapa de arquivos

```
docker-compose.prod.yml                    produção (VPS): caddy + web + postgres
docker/caddy/Caddyfile                     HTTPS + proxy para o web
Dockerfile, .dockerignore
drizzle.config.ts, drizzle/                migrações SQL geradas
vitest.config.ts                           testes unitários (sem banco)
vitest.int.config.ts                       testes de integração (com banco)
playwright.config.ts                       testes ponta a ponta
.env.example, .env.producao.example
scripts/
  migrar.ts                                aplica migrações
  criar-usuario.ts                         cria usuário pela linha de comando
  deploy.sh                                publica na VPS
  ml/comum.ts                              tokens e variáveis de ambiente do teste do ML
  ml/selecao.ts (+ .test.ts)               escolhe reclamações e extrai IDs
  ml/autorizar.ts                          gera o link de autorização
  ml/trocar-codigo.ts                      troca o code por tokens
  ml/spike.ts                              teste real: chama a API e grava os exemplos
src/
  app/
    layout.tsx, globals.css, page.tsx, not-found.tsx
    login/page.tsx, login/FormularioLogin.tsx, login/acoes.ts
    (app)/layout.tsx
    (app)/fluxo/page.tsx
    (app)/contestacoes/page.tsx, (app)/lotes/page.tsx
    (app)/cadastros/page.tsx, (app)/configuracoes/page.tsx
    api/saude/route.ts
    api/ml/notificacoes/route.ts
  components/
    AppShell.tsx, NavAbas.tsx, QuadroFluxo.tsx, EmBreve.tsx
  db/
    client.ts                              criarDb(url) → { db, sql }
    index.ts                               conexão única da aplicação
    migrate.ts                             migrar(url)
    schema/index.ts, schema/auth.ts, schema/notificacoes.ts
  lib/
    env.ts, iniciais.ts, redigir.ts
  modules/
    devolucoes/etapas.ts
    saude/saude.ts
    auth/perfis.ts, senha.ts, usuarios.ts, sessoes.ts, autenticar.ts,
         permissoes.ts, servidor.ts
  conectores/marketplace/mercadolivre/
    cliente.ts, oauth.ts, datas.ts, notificacoes.ts
tests/
  helpers/db.ts
  setup/int-global-setup.ts
  e2e/global-setup.ts, e2e/dados.ts, e2e/login.spec.ts
  fixtures/ml/                              exemplos reais do ML (já sem dados pessoais)
docs/operacao/deploy-vps.md
README.md
```

---

### Tarefa 1: Esqueleto do projeto Next.js, ferramentas de teste e as etapas do PDF

**Arquivos:**
- Criar (via create-next-app): `package.json`, `next.config.ts`, `tsconfig.json`, `src/app/*`, `public/*`, `eslint.config.mjs`, `.gitignore`, `postcss.config.mjs`
- Criar: `vitest.config.ts`, `.env.example`, `src/modules/devolucoes/etapas.ts`
- Teste: `src/modules/devolucoes/etapas.test.ts`
- Modificar: `.gitignore` (acrescentar no final)

**Interfaces:**
- Produz:
  - `ETAPAS: readonly Etapa[]`
  - `type Etapa = { numero: 1 | 2 | 3 | 4 | 5; titulo: string }`
  - scripts npm `test`, `test:watch`, `typecheck`
  - alias de importação `@/*` → `src/*`

- [ ] **Passo 1: Gerar o projeto numa pasta temporária**

O nome da pasta do repositório ("Dvoluções Markt") não é um nome de pacote npm válido. Por isso o projeto é gerado em `devolucoes/` e depois movido para a raiz.

```bash
cd "/c/Users/idmpc/Dvoluções Markt"
npx --yes create-next-app@latest devolucoes --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --yes
```

Esperado: termina com "Success! Created devolucoes".

- [ ] **Passo 2: Mover o projeto para a raiz do repositório**

```bash
cd "/c/Users/idmpc/Dvoluções Markt"
[ -d devolucoes/.git ] && rm -rf devolucoes/.git
shopt -s dotglob
mv devolucoes/* .
shopt -u dotglob
rmdir devolucoes
ls
```

Esperado: `package.json`, `src`, `public`, `next.config.ts` e `docs` aparecem na raiz.

- [ ] **Passo 3: Confirmar que veio o Tailwind v4**

```bash
grep -n '@import "tailwindcss"' src/app/globals.css
```

Esperado: uma linha encontrada. Se não houver (Tailwind v3), **pare e avise**: a Tarefa 6 usa a sintaxe `@theme` do v4.

- [ ] **Passo 4: Instalar as ferramentas de teste e scripts**

```bash
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/dom tsx esbuild @types/node@24
npm pkg set scripts.test="vitest run" scripts.test:watch="vitest" scripts.typecheck="tsc --noEmit"
```

- [ ] **Passo 5: Criar `vitest.config.ts`**

```ts
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    globals: true,
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    exclude: ['**/*.int.test.ts', 'node_modules/**'],
  },
});
```

- [ ] **Passo 6: Escrever o teste que falha**

`src/modules/devolucoes/etapas.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ETAPAS } from './etapas';

describe('ETAPAS', () => {
  it('lista as 5 etapas com os nomes exatos do PDF, em ordem', () => {
    expect(ETAPAS.map((e) => e.numero)).toEqual([1, 2, 3, 4, 5]);
    expect(ETAPAS.map((e) => e.titulo)).toEqual([
      'Pedidos Pendentes de Chegada',
      'Pedidos Chegados - Aguardando Conferência',
      'Em Conferência / Triagem & Registro de Evidências',
      'Destinação Fiscal e Estoque',
      'Agrupamento por Fornecedor (Remessas)',
    ]);
  });
});
```

- [ ] **Passo 7: Rodar e confirmar que falha**

Rode: `npm test`
Esperado: FAIL, com "Failed to resolve import './etapas'" (ou "Cannot find module").

- [ ] **Passo 8: Implementar**

`src/modules/devolucoes/etapas.ts`:

```ts
export type Etapa = { numero: 1 | 2 | 3 | 4 | 5; titulo: string };

/** As 5 etapas do organograma do PDF, com os nomes exatamente como no documento. */
export const ETAPAS: readonly Etapa[] = [
  { numero: 1, titulo: 'Pedidos Pendentes de Chegada' },
  { numero: 2, titulo: 'Pedidos Chegados - Aguardando Conferência' },
  { numero: 3, titulo: 'Em Conferência / Triagem & Registro de Evidências' },
  { numero: 4, titulo: 'Destinação Fiscal e Estoque' },
  { numero: 5, titulo: 'Agrupamento por Fornecedor (Remessas)' },
];
```

- [ ] **Passo 9: Rodar e confirmar que passa**

Rode: `npm test`
Esperado: PASS (1 teste).

- [ ] **Passo 10: Ajustar `.gitignore` e criar `.env.example`**

Acrescente no **final** do `.gitignore` (o create-next-app ignora `.env*`, então os modelos precisam de exceção):

```
# Projeto
!.env.example
!.env.producao.example
.ml-tokens.json
.ml-pkce.json
/dist
/test-results
/playwright-report
```

Crie `.env.example`:

```
# Banco local (PostgreSQL 17 instalado no Windows)
DATABASE_URL=postgres://devolucoes:devolucoes@localhost:5432/devolucoes
DATABASE_URL_TEST=postgres://devolucoes:devolucoes@localhost:5432/devolucoes_test

# Mercado Livre: teste real da Fase 0. Preencher quando o app do ML existir.
ML_CLIENT_ID=
ML_CLIENT_SECRET=
ML_REDIRECT_URI=
ML_USAR_PKCE=false
```

Depois crie o `.env` local: `cp .env.example .env`

- [ ] **Passo 11: Verificar lint, tipos e build**

Rode: `npm run lint && npm run typecheck && npm run build`
Esperado: os três terminam sem erro.

- [ ] **Passo 12: Commit**

```bash
git add -A
git status --short   # confira que .env NÃO aparece
git commit -m "chore: esqueleto Next.js, Vitest e etapas do PDF" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 2: Banco local, variáveis de ambiente, conexão e verificação de saúde

**Arquivos:**
- Criar: `src/lib/env.ts`, `src/db/client.ts`, `src/db/index.ts`, `src/db/schema/index.ts`
- Criar: `src/modules/saude/saude.ts`, `src/app/api/saude/route.ts`
- Criar: `vitest.int.config.ts`, `tests/helpers/db.ts`
- Testes: `src/lib/env.test.ts`, `src/modules/saude/saude.int.test.ts`

**Interfaces:**
- Produz:
  - `lerEnv(fonte?: Record<string, string | undefined>): Env`, com `type Env = { DATABASE_URL: string; NODE_ENV: 'development' | 'test' | 'production'; ML_CLIENT_ID?: string }`
  - `criarDb(url: string): { db: Db; sql: Sql }` e `type Db`
  - `obterConexao(): { db: Db; sql: Sql }` e `obterDb(): Db`
  - `verificarSaude(sql: Sql): Promise<ResultadoSaude>`, com `type ResultadoSaude = { status: 'ok' | 'erro'; banco: 'ok' | 'falhou' }`
  - helpers de teste `urlBancoTeste(): string` e `criarDbTeste(): { db: Db; sql: Sql }`
  - script npm `test:int`
  - rota `GET /api/saude`

- [ ] **Passo 1: Conferir o banco local**

O PostgreSQL 17 já está instalado no Windows como serviço (veja os Pré-requisitos). Confira que os dois bancos respondem com o usuário do sistema:

```bash
PGPASSWORD=devolucoes "/c/Program Files/PostgreSQL/17/bin/psql.exe" -U devolucoes -h localhost -d devolucoes -tAc "select 'dev ok'"
PGPASSWORD=devolucoes "/c/Program Files/PostgreSQL/17/bin/psql.exe" -U devolucoes -h localhost -d devolucoes_test -tAc "select 'teste ok'"
```

Esperado: `dev ok` e `teste ok`. Se o serviço estiver parado, rode `Start-Service postgresql-x64-17` num PowerShell aberto como administrador.

- [ ] **Passo 2: Instalar as dependências do banco**

```bash
npm install drizzle-orm postgres zod
npm install -D drizzle-kit
npm pkg set scripts.test:int="vitest run --config vitest.int.config.ts"
```

- [ ] **Passo 3: Escrever o teste que falha de `lerEnv`**

`src/lib/env.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { lerEnv } from './env';

describe('lerEnv', () => {
  it('exige DATABASE_URL', () => {
    expect(() => lerEnv({})).toThrow(/DATABASE_URL/);
  });

  it('devolve as variáveis válidas com NODE_ENV padrão', () => {
    expect(lerEnv({ DATABASE_URL: 'postgres://u:s@h:5432/b' })).toEqual({
      DATABASE_URL: 'postgres://u:s@h:5432/b',
      NODE_ENV: 'development',
    });
  });
});
```

Rode: `npm test`. Esperado: FAIL (módulo `./env` não existe).

- [ ] **Passo 4: Implementar `src/lib/env.ts`**

```ts
import { z } from 'zod';

const esquema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatório'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  ML_CLIENT_ID: z.string().optional(),
});

export type Env = z.infer<typeof esquema>;

export function lerEnv(fonte: Record<string, string | undefined> = process.env): Env {
  const resultado = esquema.safeParse(fonte);
  if (!resultado.success) {
    const detalhes = resultado.error.issues
      .map((i) => `${i.path.join('.') || 'env'}: ${i.message}`)
      .join('; ');
    throw new Error(`Variáveis de ambiente inválidas: ${detalhes}`);
  }
  return resultado.data;
}
```

Rode: `npm test`. Esperado: PASS.

- [ ] **Passo 5: Criar a conexão com o banco**

`src/db/schema/index.ts` (as tabelas entram na Tarefa 3):

```ts
export {};
```

`src/db/client.ts`:

```ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export function criarDb(url: string) {
  const sql = postgres(url, { max: 10, onnotice: () => {} });
  const db = drizzle(sql, { schema });
  return { db, sql };
}

export type Db = ReturnType<typeof criarDb>['db'];
```

`src/db/index.ts`:

```ts
import { lerEnv } from '@/lib/env';
import { criarDb } from './client';

type Conexao = ReturnType<typeof criarDb>;

// Guardada no globalThis para o recarregamento do `next dev` não abrir conexões novas a cada edição.
const globalComDb = globalThis as unknown as { __conexaoDb?: Conexao };

export function obterConexao(): Conexao {
  if (!globalComDb.__conexaoDb) {
    globalComDb.__conexaoDb = criarDb(lerEnv().DATABASE_URL);
  }
  return globalComDb.__conexaoDb;
}

export function obterDb() {
  return obterConexao().db;
}
```

- [ ] **Passo 6: Configurar os testes de integração**

`vitest.int.config.ts`:

```ts
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    include: ['src/**/*.int.test.ts'],
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
```

`tests/helpers/db.ts`:

```ts
import { criarDb } from '@/db/client';

export function urlBancoTeste(): string {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('Defina DATABASE_URL_TEST no .env');
  return url;
}

export function criarDbTeste() {
  return criarDb(urlBancoTeste());
}
```

- [ ] **Passo 7: Escrever o teste que falha de `verificarSaude`**

`src/modules/saude/saude.int.test.ts`:

```ts
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { criarDbTeste } from '../../../tests/helpers/db';
import { verificarSaude } from './saude';

const { sql } = criarDbTeste();
afterAll(async () => {
  await sql.end();
});

describe('verificarSaude', () => {
  it('responde ok quando o banco atende', async () => {
    expect(await verificarSaude(sql)).toEqual({ status: 'ok', banco: 'ok' });
  });

  it('responde erro quando o banco não atende', async () => {
    const quebrado = postgres('postgres://ninguem:nada@127.0.0.1:1/nada', { max: 1, connect_timeout: 1 });
    try {
      expect(await verificarSaude(quebrado)).toEqual({ status: 'erro', banco: 'falhou' });
    } finally {
      await quebrado.end({ timeout: 0 });
    }
  });
});
```

Rode: `npm run test:int`. Esperado: FAIL (módulo `./saude` não existe).

- [ ] **Passo 8: Implementar a verificação e a rota**

`src/modules/saude/saude.ts`:

```ts
import type { Sql } from 'postgres';

export type ResultadoSaude = { status: 'ok' | 'erro'; banco: 'ok' | 'falhou' };

export async function verificarSaude(sql: Sql): Promise<ResultadoSaude> {
  try {
    await sql`select 1`;
    return { status: 'ok', banco: 'ok' };
  } catch {
    return { status: 'erro', banco: 'falhou' };
  }
}
```

`src/app/api/saude/route.ts`:

```ts
import { obterConexao } from '@/db';
import { verificarSaude } from '@/modules/saude/saude';

export const dynamic = 'force-dynamic';

export async function GET() {
  const resultado = await verificarSaude(obterConexao().sql);
  return Response.json(resultado, { status: resultado.status === 'ok' ? 200 : 503 });
}
```

- [ ] **Passo 9: Rodar os testes e conferir a rota**

Rode: `npm test && npm run test:int`. Esperado: PASS nos dois.

Rode `npm run dev` e, em outro terminal, `curl -s http://localhost:3000/api/saude`.
Esperado: `{"status":"ok","banco":"ok"}`. Pare o servidor depois (Ctrl+C).

- [ ] **Passo 10: Commit**

```bash
git add -A
git commit -m "feat: banco local, conexão Drizzle e rota de saúde" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 3: Tabelas de usuários e sessões, migrações, senha com argon2 e criação de usuário

**Arquivos:**
- Criar: `drizzle.config.ts`, `src/db/schema/auth.ts`, `src/db/migrate.ts`
- Criar: `scripts/migrar.ts`, `scripts/criar-usuario.ts`, `tests/setup/int-global-setup.ts`
- Criar: `src/modules/auth/perfis.ts`, `src/modules/auth/senha.ts`, `src/modules/auth/usuarios.ts`
- Modificar: `src/db/schema/index.ts`, `vitest.int.config.ts`, `tests/helpers/db.ts`
- Gerado: `drizzle/0000_*.sql` e `drizzle/meta/*`
- Testes: `src/modules/auth/senha.test.ts`, `src/modules/auth/usuarios.int.test.ts`

**Interfaces:**
- Consome: `criarDb`, `Db`, `criarDbTeste`, `urlBancoTeste` (Tarefa 2)
- Produz:
  - tabelas `usuarios`, `sessoes` e o enum `perfilEnum`
  - `PERFIS = ['OPERADOR', 'FISCAL', 'GESTOR'] as const`, `type Perfil`, `ROTULO_PERFIL: Record<Perfil, string>`
  - `gerarHashSenha(senha: string): Promise<string>` e `verificarSenha(hash: string, senha: string): Promise<boolean>`
  - `type UsuarioSessao = { id: string; nome: string; email: string; perfil: Perfil }`
  - `type DadosNovoUsuario = { nome: string; email: string; senha: string; perfil: Perfil }`
  - `criarUsuario(db: Db, dados: DadosNovoUsuario): Promise<UsuarioSessao>` e `class ErroEmailEmUso`
  - `migrar(url: string, pasta?: string): Promise<void>`
  - `limparTabelas(sql: Sql): Promise<void>`
  - scripts npm `db:gerar`, `db:migrar`, `usuario:criar`

- [ ] **Passo 1: Instalar o argon2 e criar os scripts npm**

```bash
npm install @node-rs/argon2
npm pkg set scripts.db:gerar="drizzle-kit generate"
npm pkg set scripts.db:migrar="node --env-file=.env --import tsx scripts/migrar.ts"
npm pkg set scripts.usuario:criar="node --env-file=.env --import tsx scripts/criar-usuario.ts"
```

- [ ] **Passo 2: Definir perfis e tabelas**

`src/modules/auth/perfis.ts`:

```ts
export const PERFIS = ['OPERADOR', 'FISCAL', 'GESTOR'] as const;
export type Perfil = (typeof PERFIS)[number];

export const ROTULO_PERFIL: Record<Perfil, string> = {
  OPERADOR: 'Operador',
  FISCAL: 'Fiscal',
  GESTOR: 'Gestor',
};
```

`src/db/schema/auth.ts`:

```ts
import { boolean, index, integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { PERFIS } from '@/modules/auth/perfis';

export const perfilEnum = pgEnum('perfil', PERFIS);

export const usuarios = pgTable('usuarios', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: text('nome').notNull(),
  email: text('email').notNull().unique(),
  senhaHash: text('senha_hash').notNull(),
  perfil: perfilEnum('perfil').notNull(),
  ativo: boolean('ativo').notNull().default(true),
  falhasLogin: integer('falhas_login').notNull().default(0),
  bloqueadoAte: timestamp('bloqueado_ate', { withTimezone: true }),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
});

export const sessoes = pgTable(
  'sessoes',
  {
    // SHA-256 (hex) do token. O token em si fica só no cookie do navegador.
    id: text('id').primaryKey(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    expiraEm: timestamp('expira_em', { withTimezone: true }).notNull(),
    criadaEm: timestamp('criada_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('sessoes_usuario_idx').on(t.usuarioId)],
);
```

`src/db/schema/index.ts` (substitui o conteúdo):

```ts
export * from './auth';
```

`drizzle.config.ts`:

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
});
```

- [ ] **Passo 3: Gerar a migração**

Rode: `npm run db:gerar`
Esperado: cria `drizzle/0000_<nome>.sql` com `CREATE TYPE "public"."perfil"`, `CREATE TABLE "usuarios"` e `CREATE TABLE "sessoes"`. Confira com `cat drizzle/0000_*.sql`.

- [ ] **Passo 4: Criar o migrador e aplicar no banco de desenvolvimento**

`src/db/migrate.ts`:

```ts
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

export async function migrar(url: string, pasta = './drizzle'): Promise<void> {
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(sql), { migrationsFolder: pasta });
  } finally {
    await sql.end();
  }
}
```

`scripts/migrar.ts`:

```ts
import { migrar } from '@/db/migrate';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL não definido.');
    process.exit(1);
  }
  await migrar(url);
  console.log('Migrações aplicadas.');
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
```

Rode: `npm run db:migrar`. Esperado: "Migrações aplicadas."

- [ ] **Passo 5: Migrar e limpar o banco de testes automaticamente**

`tests/setup/int-global-setup.ts`:

```ts
import { migrar } from '../../src/db/migrate';

export default async function () {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('Defina DATABASE_URL_TEST no .env');
  await migrar(url);
}
```

Em `vitest.int.config.ts`, dentro de `test`, acrescente a linha `globalSetup: ['tests/setup/int-global-setup.ts'],`. O bloco fica assim:

```ts
  test: {
    include: ['src/**/*.int.test.ts'],
    fileParallelism: false,
    testTimeout: 15_000,
    globalSetup: ['tests/setup/int-global-setup.ts'],
  },
```

`tests/helpers/db.ts` (substitui todo o conteúdo):

```ts
import type { Sql } from 'postgres';
import { criarDb } from '@/db/client';

export function urlBancoTeste(): string {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('Defina DATABASE_URL_TEST no .env');
  return url;
}

export function criarDbTeste() {
  return criarDb(urlBancoTeste());
}

/** Esvazia todas as tabelas do schema public. A tabela de controle das migrações fica no schema "drizzle" e não é tocada. */
export async function limparTabelas(sql: Sql): Promise<void> {
  const tabelas = await sql<{ tablename: string }[]>`
    select tablename from pg_tables where schemaname = 'public'`;
  if (tabelas.length === 0) return;
  const lista = tabelas.map((t) => `"${t.tablename}"`).join(', ');
  await sql.unsafe(`truncate table ${lista} restart identity cascade`);
}
```

- [ ] **Passo 6: Escrever o teste que falha da senha**

`src/modules/auth/senha.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { gerarHashSenha, verificarSenha } from './senha';

describe('senha', () => {
  it('gera um hash argon2id que confere com a senha certa e não com a errada', async () => {
    const hash = await gerarHashSenha('senha-segura-123');
    expect(hash).not.toContain('senha-segura-123');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await verificarSenha(hash, 'senha-segura-123')).toBe(true);
    expect(await verificarSenha(hash, 'outra-senha-456')).toBe(false);
  });

  it('recusa senha com menos de 8 caracteres', async () => {
    await expect(gerarHashSenha('curta')).rejects.toThrow('A senha precisa ter pelo menos 8 caracteres');
  });

  it('devolve false para um hash inválido em vez de lançar erro', async () => {
    expect(await verificarSenha('não-é-um-hash', 'qualquer-coisa')).toBe(false);
  });
});
```

Rode: `npm test`. Esperado: FAIL (módulo `./senha` não existe).

- [ ] **Passo 7: Implementar a senha**

`src/modules/auth/senha.ts`:

```ts
import { hash, verify } from '@node-rs/argon2';

export const TAMANHO_MINIMO_SENHA = 8;

/** argon2id com os parâmetros padrão da biblioteca (m=19456, t=2, p=1), que seguem a recomendação da OWASP. */
export async function gerarHashSenha(senha: string): Promise<string> {
  if (senha.length < TAMANHO_MINIMO_SENHA) {
    throw new Error(`A senha precisa ter pelo menos ${TAMANHO_MINIMO_SENHA} caracteres`);
  }
  return hash(senha);
}

export async function verificarSenha(hashArmazenado: string, senha: string): Promise<boolean> {
  try {
    return await verify(hashArmazenado, senha);
  } catch {
    return false;
  }
}
```

Rode: `npm test`. Esperado: PASS.

- [ ] **Passo 8: Escrever o teste que falha de `criarUsuario`**

`src/modules/auth/usuarios.int.test.ts`:

```ts
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { usuarios } from '@/db/schema';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { verificarSenha } from './senha';
import { criarUsuario, ErroEmailEmUso } from './usuarios';

const { db, sql } = criarDbTeste();
beforeEach(async () => {
  await limparTabelas(sql);
});
afterAll(async () => {
  await sql.end();
});

describe('criarUsuario', () => {
  it('cria o usuário com e-mail normalizado e a senha só em hash', async () => {
    const criado = await criarUsuario(db, {
      nome: '  Maria da Silva ',
      email: ' Maria@Empresa.com ',
      senha: 'senha-segura-123',
      perfil: 'OPERADOR',
    });

    expect(criado).toMatchObject({ nome: 'Maria da Silva', email: 'maria@empresa.com', perfil: 'OPERADOR' });
    const [linha] = await db.select().from(usuarios).where(eq(usuarios.id, criado.id));
    expect(linha.senhaHash).not.toBe('senha-segura-123');
    expect(await verificarSenha(linha.senhaHash, 'senha-segura-123')).toBe(true);
    expect(linha.ativo).toBe(true);
  });

  it('recusa e-mail repetido, sem diferenciar maiúsculas', async () => {
    await criarUsuario(db, { nome: 'A', email: 'a@empresa.com', senha: 'senha-segura-123', perfil: 'FISCAL' });
    await expect(
      criarUsuario(db, { nome: 'B', email: 'A@EMPRESA.COM', senha: 'senha-segura-456', perfil: 'GESTOR' }),
    ).rejects.toBeInstanceOf(ErroEmailEmUso);
  });

  it('recusa dados inválidos', async () => {
    await expect(
      criarUsuario(db, { nome: '', email: 'x@empresa.com', senha: 'senha-segura-123', perfil: 'GESTOR' }),
    ).rejects.toThrow('Informe o nome');
    await expect(
      criarUsuario(db, { nome: 'X', email: 'não-é-email', senha: 'senha-segura-123', perfil: 'GESTOR' }),
    ).rejects.toThrow('E-mail inválido');
  });
});
```

Rode: `npm run test:int`. Esperado: FAIL (módulo `./usuarios` não existe).

- [ ] **Passo 9: Implementar `criarUsuario`**

`src/modules/auth/usuarios.ts`:

```ts
import { z } from 'zod';
import type { Db } from '@/db/client';
import { usuarios } from '@/db/schema';
import { PERFIS, type Perfil } from './perfis';
import { gerarHashSenha, TAMANHO_MINIMO_SENHA } from './senha';

export type UsuarioSessao = { id: string; nome: string; email: string; perfil: Perfil };

export class ErroEmailEmUso extends Error {
  constructor(email: string) {
    super(`Já existe um usuário com o e-mail ${email}`);
    this.name = 'ErroEmailEmUso';
  }
}

const esquemaNovoUsuario = z.object({
  nome: z.string().trim().min(1, 'Informe o nome'),
  email: z.string().trim().toLowerCase().email('E-mail inválido'),
  senha: z.string().min(TAMANHO_MINIMO_SENHA, `A senha precisa ter pelo menos ${TAMANHO_MINIMO_SENHA} caracteres`),
  perfil: z.enum(PERFIS),
});

export type DadosNovoUsuario = { nome: string; email: string; senha: string; perfil: Perfil };

export async function criarUsuario(db: Db, dados: DadosNovoUsuario): Promise<UsuarioSessao> {
  const resultado = esquemaNovoUsuario.safeParse(dados);
  if (!resultado.success) {
    throw new Error(resultado.error.issues.map((i) => i.message).join('; '));
  }
  const d = resultado.data;
  const senhaHash = await gerarHashSenha(d.senha);
  try {
    const [criado] = await db
      .insert(usuarios)
      .values({ nome: d.nome, email: d.email, senhaHash, perfil: d.perfil })
      .returning({ id: usuarios.id, nome: usuarios.nome, email: usuarios.email, perfil: usuarios.perfil });
    return criado;
  } catch (erro) {
    if (ehViolacaoDeUnicidade(erro)) throw new ErroEmailEmUso(d.email);
    throw erro;
  }
}

function codigoDoErro(x: unknown): unknown {
  return typeof x === 'object' && x !== null && 'code' in x ? (x as { code?: unknown }).code : undefined;
}

/** 23505 = unique_violation. Versões recentes do Drizzle embrulham o erro do driver em `cause`. */
function ehViolacaoDeUnicidade(erro: unknown): boolean {
  const causa = typeof erro === 'object' && erro !== null ? (erro as { cause?: unknown }).cause : undefined;
  return codigoDoErro(erro) === '23505' || codigoDoErro(causa) === '23505';
}
```

Rode: `npm run test:int`. Esperado: PASS.

- [ ] **Passo 10: Script de linha de comando para criar usuário**

`scripts/criar-usuario.ts`:

```ts
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { criarDb } from '@/db/client';
import { PERFIS, type Perfil } from '@/modules/auth/perfis';
import { criarUsuario, ErroEmailEmUso } from '@/modules/auth/usuarios';

const USO = 'Uso: --nome "Nome Sobrenome" --email pessoa@empresa.com --perfil OPERADOR|FISCAL|GESTOR';

async function main() {
  const { values } = parseArgs({
    options: { nome: { type: 'string' }, email: { type: 'string' }, perfil: { type: 'string' } },
  });
  if (!values.nome || !values.email || !values.perfil) {
    console.error(USO);
    process.exit(1);
  }
  const perfil = values.perfil.toUpperCase();
  if (!(PERFIS as readonly string[]).includes(perfil)) {
    console.error(`Perfil inválido: ${values.perfil}. ${USO}`);
    process.exit(1);
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL não definido.');
    process.exit(1);
  }

  const rl = createInterface({ input: stdin, output: stdout });
  const senha = await rl.question('Senha (mínimo 8 caracteres; aparece enquanto digita): ');
  rl.close();

  const { db, sql } = criarDb(url);
  try {
    const u = await criarUsuario(db, { nome: values.nome, email: values.email, senha, perfil: perfil as Perfil });
    console.log(`Usuário criado: ${u.nome} <${u.email}> (${u.perfil})`);
  } catch (erro) {
    if (erro instanceof ErroEmailEmUso) {
      console.error('Já existe um usuário com esse e-mail.');
      process.exitCode = 1;
    } else {
      throw erro;
    }
  } finally {
    await sql.end();
  }
}

main().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
```

Rode: `npm run usuario:criar -- --nome "Gestor Local" --email gestor@local.dev --perfil GESTOR` e digite `senha-local-123`.
Esperado: "Usuário criado: Gestor Local <gestor@local.dev> (GESTOR)". Esse usuário serve para testar o login à mão na Tarefa 7.

- [ ] **Passo 11: Verificar tudo e commit**

Rode: `npm test && npm run test:int && npm run typecheck`. Esperado: tudo PASS.

```bash
git add -A
git commit -m "feat: usuários e sessões no banco, senha argon2 e criação de usuário" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 4: Sessões e autenticação com bloqueio por tentativas

**Arquivos:**
- Criar: `src/modules/auth/sessoes.ts`, `src/modules/auth/autenticar.ts`
- Testes: `src/modules/auth/sessoes.int.test.ts`, `src/modules/auth/autenticar.int.test.ts`

**Interfaces:**
- Consome: `usuarios`, `sessoes`, `Db`, `verificarSenha`, `gerarHashSenha`, `criarUsuario`, `UsuarioSessao`, `limparTabelas`, `criarDbTeste`
- Produz:
  - `DURACAO_SESSAO_MS = 43_200_000` (12 h)
  - `gerarToken(): string` e `idDaSessao(token: string): string`
  - `criarSessao(db: Db, usuarioId: string, agora?: Date): Promise<{ token: string; expiraEm: Date }>`
  - `validarSessao(db: Db, token: string, agora?: Date): Promise<UsuarioSessao | null>`
  - `encerrarSessao(db: Db, token: string): Promise<void>`
  - `MAX_FALHAS = 5` e `BLOQUEIO_MS = 900_000` (15 min)
  - `type ResultadoLogin = { ok: true; usuario: UsuarioSessao } | { ok: false; motivo: 'credenciais' | 'bloqueado' }`
  - `autenticar(db: Db, email: string, senha: string, agora?: Date): Promise<ResultadoLogin>`

- [ ] **Passo 1: Escrever os testes que falham das sessões**

`src/modules/auth/sessoes.int.test.ts`:

```ts
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sessoes, usuarios } from '@/db/schema';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarSessao, DURACAO_SESSAO_MS, encerrarSessao, idDaSessao, validarSessao } from './sessoes';
import { criarUsuario, type UsuarioSessao } from './usuarios';

const { db, sql } = criarDbTeste();
let usuario: UsuarioSessao;

beforeEach(async () => {
  await limparTabelas(sql);
  usuario = await criarUsuario(db, { nome: 'Ana', email: 'ana@empresa.com', senha: 'senha-segura-123', perfil: 'FISCAL' });
});
afterAll(async () => {
  await sql.end();
});

describe('sessões', () => {
  it('cria e valida uma sessão, guardando só o hash do token', async () => {
    const agora = new Date('2026-11-11T12:00:00Z');
    const { token, expiraEm } = await criarSessao(db, usuario.id, agora);

    expect(expiraEm.getTime()).toBe(agora.getTime() + DURACAO_SESSAO_MS);
    const [linha] = await db.select().from(sessoes);
    expect(linha.id).toBe(idDaSessao(token));
    expect(linha.id).not.toBe(token);
    expect(await validarSessao(db, token, agora)).toEqual(usuario);
  });

  it('recusa e apaga a sessão expirada', async () => {
    const agora = new Date('2026-11-11T12:00:00Z');
    const { token } = await criarSessao(db, usuario.id, agora);
    const depois = new Date(agora.getTime() + DURACAO_SESSAO_MS + 1);

    expect(await validarSessao(db, token, depois)).toBeNull();
    expect(await db.select().from(sessoes)).toHaveLength(0);
  });

  it('recusa a sessão de usuário desativado', async () => {
    const { token } = await criarSessao(db, usuario.id);
    await db.update(usuarios).set({ ativo: false }).where(eq(usuarios.id, usuario.id));
    expect(await validarSessao(db, token)).toBeNull();
  });

  it('recusa token desconhecido e token vazio', async () => {
    expect(await validarSessao(db, 'token-que-nao-existe')).toBeNull();
    expect(await validarSessao(db, '')).toBeNull();
  });

  it('encerra a sessão', async () => {
    const { token } = await criarSessao(db, usuario.id);
    await encerrarSessao(db, token);
    expect(await validarSessao(db, token)).toBeNull();
  });
});
```

Rode: `npm run test:int`. Esperado: FAIL (módulo `./sessoes` não existe).

- [ ] **Passo 2: Implementar as sessões**

`src/modules/auth/sessoes.ts`:

```ts
import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { sessoes, usuarios } from '@/db/schema';
import type { UsuarioSessao } from './usuarios';

/** 12 horas: cobre um turno de trabalho. */
export const DURACAO_SESSAO_MS = 12 * 60 * 60 * 1000;

export function gerarToken(): string {
  return randomBytes(32).toString('base64url');
}

export function idDaSessao(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function criarSessao(
  db: Db,
  usuarioId: string,
  agora: Date = new Date(),
): Promise<{ token: string; expiraEm: Date }> {
  const token = gerarToken();
  const expiraEm = new Date(agora.getTime() + DURACAO_SESSAO_MS);
  await db.insert(sessoes).values({ id: idDaSessao(token), usuarioId, expiraEm });
  return { token, expiraEm };
}

export async function validarSessao(db: Db, token: string, agora: Date = new Date()): Promise<UsuarioSessao | null> {
  if (!token) return null;
  const id = idDaSessao(token);
  const [linha] = await db
    .select({
      id: usuarios.id,
      nome: usuarios.nome,
      email: usuarios.email,
      perfil: usuarios.perfil,
      ativo: usuarios.ativo,
      expiraEm: sessoes.expiraEm,
    })
    .from(sessoes)
    .innerJoin(usuarios, eq(sessoes.usuarioId, usuarios.id))
    .where(eq(sessoes.id, id))
    .limit(1);

  if (!linha) return null;
  if (linha.expiraEm.getTime() <= agora.getTime() || !linha.ativo) {
    await db.delete(sessoes).where(eq(sessoes.id, id));
    return null;
  }
  return { id: linha.id, nome: linha.nome, email: linha.email, perfil: linha.perfil };
}

export async function encerrarSessao(db: Db, token: string): Promise<void> {
  await db.delete(sessoes).where(eq(sessoes.id, idDaSessao(token)));
}
```

Rode: `npm run test:int`. Esperado: PASS.

- [ ] **Passo 3: Escrever os testes que falham da autenticação**

`src/modules/auth/autenticar.int.test.ts`:

```ts
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { usuarios } from '@/db/schema';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { autenticar, BLOQUEIO_MS, MAX_FALHAS } from './autenticar';
import { criarUsuario, type UsuarioSessao } from './usuarios';

const { db, sql } = criarDbTeste();
const EMAIL = 'bruno@empresa.com';
const SENHA = 'senha-segura-123';
let usuario: UsuarioSessao;

async function linhaDoUsuario() {
  const [linha] = await db.select().from(usuarios).where(eq(usuarios.id, usuario.id));
  return linha;
}

beforeEach(async () => {
  await limparTabelas(sql);
  usuario = await criarUsuario(db, { nome: 'Bruno', email: EMAIL, senha: SENHA, perfil: 'OPERADOR' });
});
afterAll(async () => {
  await sql.end();
});

describe('autenticar', () => {
  it('aceita e-mail e senha certos, ignorando maiúsculas e espaços no e-mail', async () => {
    expect(await autenticar(db, '  Bruno@Empresa.COM ', SENHA)).toEqual({ ok: true, usuario });
  });

  it('recusa senha errada e conta a falha', async () => {
    expect(await autenticar(db, EMAIL, 'senha-errada-000')).toEqual({ ok: false, motivo: 'credenciais' });
    expect((await linhaDoUsuario()).falhasLogin).toBe(1);
  });

  it('recusa e-mail inexistente com a mesma mensagem', async () => {
    expect(await autenticar(db, 'ninguem@empresa.com', SENHA)).toEqual({ ok: false, motivo: 'credenciais' });
  });

  it('recusa usuário desativado com a mesma mensagem', async () => {
    await db.update(usuarios).set({ ativo: false }).where(eq(usuarios.id, usuario.id));
    expect(await autenticar(db, EMAIL, SENHA)).toEqual({ ok: false, motivo: 'credenciais' });
  });

  it(`bloqueia por 15 minutos na ${MAX_FALHAS}ª senha errada seguida`, async () => {
    const agora = new Date('2026-11-11T12:00:00Z');
    for (let i = 1; i < MAX_FALHAS; i++) {
      expect(await autenticar(db, EMAIL, 'senha-errada-000', agora)).toEqual({ ok: false, motivo: 'credenciais' });
    }
    expect(await autenticar(db, EMAIL, 'senha-errada-000', agora)).toEqual({ ok: false, motivo: 'bloqueado' });

    const aindaBloqueado = new Date(agora.getTime() + BLOQUEIO_MS - 1000);
    expect(await autenticar(db, EMAIL, SENHA, aindaBloqueado)).toEqual({ ok: false, motivo: 'bloqueado' });

    const liberado = new Date(agora.getTime() + BLOQUEIO_MS + 1000);
    expect(await autenticar(db, EMAIL, SENHA, liberado)).toEqual({ ok: true, usuario });
    const linha = await linhaDoUsuario();
    expect(linha.falhasLogin).toBe(0);
    expect(linha.bloqueadoAte).toBeNull();
  });

  it('zera as falhas depois de um login certo', async () => {
    await autenticar(db, EMAIL, 'senha-errada-000');
    await autenticar(db, EMAIL, 'senha-errada-000');
    await autenticar(db, EMAIL, SENHA);
    expect((await linhaDoUsuario()).falhasLogin).toBe(0);
  });
});
```

Rode: `npm run test:int`. Esperado: FAIL (módulo `./autenticar` não existe).

- [ ] **Passo 4: Implementar a autenticação**

`src/modules/auth/autenticar.ts`:

```ts
import { eq, sql } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { usuarios } from '@/db/schema';
import { gerarHashSenha, verificarSenha } from './senha';
import type { UsuarioSessao } from './usuarios';

export const MAX_FALHAS = 5;
export const BLOQUEIO_MS = 15 * 60 * 1000;

export type ResultadoLogin =
  | { ok: true; usuario: UsuarioSessao }
  | { ok: false; motivo: 'credenciais' | 'bloqueado' };

let hashFicticio: Promise<string> | undefined;
/** Usado quando o e-mail não existe, para a resposta levar o mesmo tempo e não revelar quais e-mails estão cadastrados. */
function obterHashFicticio(): Promise<string> {
  hashFicticio ??= gerarHashSenha('senha-ficticia-so-para-tempo');
  return hashFicticio;
}

export async function autenticar(
  db: Db,
  email: string,
  senha: string,
  agora: Date = new Date(),
): Promise<ResultadoLogin> {
  const emailNormalizado = email.trim().toLowerCase();
  const [u] = await db.select().from(usuarios).where(eq(usuarios.email, emailNormalizado)).limit(1);

  if (!u || !u.ativo) {
    await verificarSenha(await obterHashFicticio(), senha);
    return { ok: false, motivo: 'credenciais' };
  }

  if (u.bloqueadoAte && u.bloqueadoAte.getTime() > agora.getTime()) {
    return { ok: false, motivo: 'bloqueado' };
  }

  if (!(await verificarSenha(u.senhaHash, senha))) {
    const [atualizado] = await db
      .update(usuarios)
      .set({ falhasLogin: sql`${usuarios.falhasLogin} + 1` })
      .where(eq(usuarios.id, u.id))
      .returning({ falhas: usuarios.falhasLogin });

    if (atualizado.falhas >= MAX_FALHAS) {
      await db
        .update(usuarios)
        .set({ falhasLogin: 0, bloqueadoAte: new Date(agora.getTime() + BLOQUEIO_MS) })
        .where(eq(usuarios.id, u.id));
      return { ok: false, motivo: 'bloqueado' };
    }
    return { ok: false, motivo: 'credenciais' };
  }

  if (u.falhasLogin !== 0 || u.bloqueadoAte !== null) {
    await db.update(usuarios).set({ falhasLogin: 0, bloqueadoAte: null }).where(eq(usuarios.id, u.id));
  }
  return { ok: true, usuario: { id: u.id, nome: u.nome, email: u.email, perfil: u.perfil } };
}
```

Rode: `npm run test:int`. Esperado: PASS (todos os testes de integração).

- [ ] **Passo 5: Commit**

```bash
npm run typecheck
git add -A
git commit -m "feat: sessões com token em hash e login com bloqueio por tentativas" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 5: Matriz de permissões e abas por perfil

**Arquivos:**
- Criar: `src/modules/auth/permissoes.ts`
- Teste: `src/modules/auth/permissoes.test.ts`

**Interfaces:**
- Consome: `Perfil`, `PERFIS` (Tarefa 3)
- Produz:
  - `type Acao = 'ver_listas' | 'operar_devolucoes' | 'gerir_fiscal' | 'gerir_catalogo' | 'administrar'`
  - `pode(perfil: Perfil, acao: Acao): boolean`
  - `type Aba = { rotulo: string; href: string; acao: Acao }` e `ABAS: readonly Aba[]`
  - `abasVisiveis(perfil: Perfil): Aba[]`

- [ ] **Passo 1: Escrever o teste que falha (tabela da spec §6.9)**

`src/modules/auth/permissoes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Perfil } from './perfis';
import { abasVisiveis, pode, type Acao } from './permissoes';

// Spec §6.9. Linhas: ação; colunas: Operador, Fiscal, Gestor.
const MATRIZ_ESPERADA: [Acao, boolean, boolean, boolean][] = [
  ['ver_listas', true, true, true], // Ver listas e busca
  ['operar_devolucoes', true, false, true], // Criar/importar devolução, receber, conferir
  ['gerir_fiscal', false, true, true], // Emitir/cancelar NF, gerir lotes
  ['gerir_catalogo', false, true, true], // Importar catálogo, editar produtos e fornecedores
  ['administrar', false, false, true], // Contestações, Configurações, usuários, Falhas, liberar trava
];

describe('pode', () => {
  it.each(MATRIZ_ESPERADA)('%s → Operador %s, Fiscal %s, Gestor %s', (acao, operador, fiscal, gestor) => {
    expect(pode('OPERADOR', acao)).toBe(operador);
    expect(pode('FISCAL', acao)).toBe(fiscal);
    expect(pode('GESTOR', acao)).toBe(gestor);
  });
});

describe('abasVisiveis', () => {
  const rotulos = (perfil: Perfil) => abasVisiveis(perfil).map((a) => a.rotulo);

  it('Operador vê só o Fluxo', () => {
    expect(rotulos('OPERADOR')).toEqual(['Fluxo']);
  });

  it('Fiscal vê Fluxo, Lotes e Cadastros', () => {
    expect(rotulos('FISCAL')).toEqual(['Fluxo', 'Lotes e Remessas', 'Produtos e Fornecedores']);
  });

  it('Gestor vê todas as abas, na ordem do menu', () => {
    expect(rotulos('GESTOR')).toEqual([
      'Fluxo',
      'Contestações ML',
      'Lotes e Remessas',
      'Produtos e Fornecedores',
      'Configurações',
    ]);
  });
});
```

Rode: `npm test`. Esperado: FAIL (módulo `./permissoes` não existe).

- [ ] **Passo 2: Implementar**

`src/modules/auth/permissoes.ts`:

```ts
import type { Perfil } from './perfis';

export type Acao = 'ver_listas' | 'operar_devolucoes' | 'gerir_fiscal' | 'gerir_catalogo' | 'administrar';

/** Spec §6.9. */
const MATRIZ: Record<Acao, readonly Perfil[]> = {
  ver_listas: ['OPERADOR', 'FISCAL', 'GESTOR'],
  operar_devolucoes: ['OPERADOR', 'GESTOR'],
  gerir_fiscal: ['FISCAL', 'GESTOR'],
  gerir_catalogo: ['FISCAL', 'GESTOR'],
  administrar: ['GESTOR'],
};

export function pode(perfil: Perfil, acao: Acao): boolean {
  return MATRIZ[acao].includes(perfil);
}

export type Aba = { rotulo: string; href: string; acao: Acao };

/** Abas da barra superior (direção visual C, spec §6.0), na ordem do menu. */
export const ABAS: readonly Aba[] = [
  { rotulo: 'Fluxo', href: '/fluxo', acao: 'ver_listas' },
  { rotulo: 'Contestações ML', href: '/contestacoes', acao: 'administrar' },
  { rotulo: 'Lotes e Remessas', href: '/lotes', acao: 'gerir_fiscal' },
  { rotulo: 'Produtos e Fornecedores', href: '/cadastros', acao: 'gerir_catalogo' },
  { rotulo: 'Configurações', href: '/configuracoes', acao: 'administrar' },
];

export function abasVisiveis(perfil: Perfil): Aba[] {
  return ABAS.filter((aba) => pode(perfil, aba.acao));
}
```

Rode: `npm test`. Esperado: PASS.

- [ ] **Passo 3: Commit**

```bash
git add -A
git commit -m "feat: matriz de permissões por perfil e abas visíveis" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 6: Visual base da direção C (cores, fontes, barra superior e quadro de fluxo)

**Arquivos:**
- Modificar (substituir o conteúdo): `src/app/globals.css`, `src/app/layout.tsx`
- Criar: `src/lib/iniciais.ts`, `src/components/NavAbas.tsx`, `src/components/AppShell.tsx`, `src/components/QuadroFluxo.tsx`, `src/components/EmBreve.tsx`
- Testes: `src/lib/iniciais.test.ts`, `src/components/NavAbas.test.tsx`, `src/components/AppShell.test.tsx`, `src/components/QuadroFluxo.test.tsx`

**Interfaces:**
- Consome: `abasVisiveis` (Tarefa 5), `ROTULO_PERFIL` e `Perfil` (Tarefa 3), `UsuarioSessao` (Tarefa 3)
- Produz:
  - classes Tailwind das cores: `bg-fundo`, `bg-superficie`, `border-borda`, `border-borda-forte`, `text-texto`, `text-texto-2`, `bg-coluna`, `bg-destaque`, `text-destaque`, `bg-destaque-suave`, `hover:bg-destaque-escuro`, `text-erro`, `bg-erro-suave`, `text-atencao`, `bg-atencao-suave`, `text-bom`, `bg-bom-suave`, `text-problema`, `bg-problema-suave`
  - classes de fonte `font-sans` e `font-mono`
  - `iniciais(nome: string): string`
  - `NavAbas({ abas }: { abas: AbaNav[] })`, com `type AbaNav = { rotulo: string; href: string }`
  - `AppShell({ usuario, acaoSair, children }: { usuario: UsuarioSessao; acaoSair: () => Promise<void>; children: ReactNode })`
  - `QuadroFluxo({ colunas }: { colunas: ColunaFluxo[] })`, com `type ColunaFluxo = { numero: number; titulo: string; total: number }`
  - `EmBreve({ titulo, fase }: { titulo: string; fase: number })`

- [ ] **Passo 1: Cores e fontes**

`src/app/globals.css` (substitui todo o conteúdo):

```css
@import "tailwindcss";

/* Direção visual C · Quadro de Fluxo (spec §6.0) */
@theme {
  --color-fundo: #f2f4f3;
  --color-superficie: #ffffff;
  --color-borda: #dde3e0;
  --color-borda-forte: #c9d2ce;
  --color-coluna: #e7ece9;
  --color-texto: #13201d;
  --color-texto-2: #3a4a46;
  --color-destaque: #0f766e;
  --color-destaque-escuro: #115e59;
  --color-destaque-suave: #e3f2ef;
  --color-erro: #b42318;
  --color-erro-suave: #fee4e2;
  --color-atencao: #93370d;
  --color-atencao-suave: #fef0c7;
  --color-bom: #166534;
  --color-bom-suave: #dcfce7;
  --color-problema: #9a3412;
  --color-problema-suave: #ffedd5;

  --font-sans: var(--font-plex-sans), system-ui, sans-serif;
  --font-mono: var(--font-plex-mono), ui-monospace, monospace;
}

body {
  background: var(--color-fundo);
  color: var(--color-texto);
}
```

`src/app/layout.tsx` (substitui todo o conteúdo):

```tsx
import type { Metadata } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';

const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-plex-sans',
});
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '600'],
  variable: '--font-plex-mono',
});

export const metadata: Metadata = {
  title: 'Gestão de Devoluções',
  description: 'Sistema de gestão de devoluções dos marketplaces',
};

export default function LayoutRaiz({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={`${plexSans.variable} ${plexMono.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Passo 2: Escrever os testes que falham**

`src/lib/iniciais.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { iniciais } from './iniciais';

describe('iniciais', () => {
  it('usa a primeira letra do primeiro e do último nome', () => {
    expect(iniciais('Maria da Silva')).toBe('MS');
  });
  it('usa uma letra só quando há um nome só', () => {
    expect(iniciais('joão')).toBe('J');
  });
  it('devolve ? para nome vazio', () => {
    expect(iniciais('   ')).toBe('?');
  });
});
```

`src/components/QuadroFluxo.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ETAPAS } from '@/modules/devolucoes/etapas';
import { QuadroFluxo } from './QuadroFluxo';

describe('QuadroFluxo', () => {
  it('mostra uma coluna por etapa do PDF, com título, total e aviso de vazio', () => {
    render(<QuadroFluxo colunas={ETAPAS.map((e) => ({ numero: e.numero, titulo: e.titulo, total: 0 }))} />);

    for (const etapa of ETAPAS) {
      expect(screen.getByRole('heading', { level: 2, name: etapa.titulo })).toBeTruthy();
    }
    expect(screen.getAllByText('Nenhuma devolução nesta etapa')).toHaveLength(5);
  });

  it('não mostra o aviso de vazio quando a coluna tem devoluções', () => {
    render(<QuadroFluxo colunas={[{ numero: 1, titulo: 'Pedidos Pendentes de Chegada', total: 3 }]} />);
    expect(screen.queryByText('Nenhuma devolução nesta etapa')).toBeNull();
    expect(screen.getByText('3')).toBeTruthy();
  });
});
```

`src/components/NavAbas.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ caminho: '/fluxo' }));
vi.mock('next/navigation', () => ({ usePathname: () => mocks.caminho }));

import { NavAbas } from './NavAbas';

const ABAS = [
  { rotulo: 'Fluxo', href: '/fluxo' },
  { rotulo: 'Lotes e Remessas', href: '/lotes' },
];

describe('NavAbas', () => {
  it('marca como atual a aba da página aberta, inclusive em subpáginas', () => {
    mocks.caminho = '/lotes/123';
    render(<NavAbas abas={ABAS} />);
    expect(screen.getByRole('link', { name: 'Lotes e Remessas' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Fluxo' }).getAttribute('aria-current')).toBeNull();
  });
});
```

`src/components/AppShell.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ usePathname: () => '/fluxo' }));

import { AppShell } from './AppShell';

describe('AppShell', () => {
  it('mostra o usuário, o perfil, só as abas do perfil e o botão Sair', () => {
    render(
      <AppShell
        usuario={{ id: '1', nome: 'Maria da Silva', email: 'maria@empresa.com', perfil: 'FISCAL' }}
        acaoSair={async () => {}}
      >
        <p>conteúdo da página</p>
      </AppShell>,
    );

    expect(screen.getByText('Maria da Silva')).toBeTruthy();
    expect(screen.getByText('Fiscal')).toBeTruthy();
    const nav = screen.getByRole('navigation', { name: 'Seções' });
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual([
      'Fluxo',
      'Lotes e Remessas',
      'Produtos e Fornecedores',
    ]);
    expect(screen.getByRole('button', { name: 'Sair' })).toBeTruthy();
    expect(screen.getByText('conteúdo da página')).toBeTruthy();
  });
});
```

Rode: `npm test`. Esperado: FAIL (os módulos ainda não existem).

- [ ] **Passo 3: Implementar**

`src/lib/iniciais.ts`:

```ts
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  const primeira = partes[0][0];
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : '';
  return (primeira + ultima).toUpperCase();
}
```

`src/components/NavAbas.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type AbaNav = { rotulo: string; href: string };

export function NavAbas({ abas }: { abas: AbaNav[] }) {
  const caminho = usePathname();
  return (
    <nav aria-label="Seções" className="flex flex-wrap gap-1">
      {abas.map((aba) => {
        const ativa = caminho === aba.href || caminho.startsWith(`${aba.href}/`);
        return (
          <Link
            key={aba.href}
            href={aba.href}
            aria-current={ativa ? 'page' : undefined}
            className={`flex min-h-11 items-center rounded-full px-3.5 text-sm ${
              ativa ? 'bg-destaque-suave font-semibold text-destaque' : 'font-medium text-texto-2 hover:bg-fundo'
            }`}
          >
            {aba.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
```

`src/components/AppShell.tsx`:

```tsx
import type { ReactNode } from 'react';
import { iniciais } from '@/lib/iniciais';
import { ROTULO_PERFIL } from '@/modules/auth/perfis';
import { abasVisiveis } from '@/modules/auth/permissoes';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { NavAbas } from './NavAbas';

type Props = { usuario: UsuarioSessao; acaoSair: () => Promise<void>; children: ReactNode };

export function AppShell({ usuario, acaoSair, children }: Props) {
  const abas = abasVisiveis(usuario.perfil).map(({ rotulo, href }) => ({ rotulo, href }));
  return (
    <div className="min-h-screen bg-fundo">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-borda bg-superficie px-4 py-3 sm:px-8">
        <div className="flex items-center gap-2.5">
          <span aria-hidden="true" className="flex size-[34px] items-center justify-center rounded-full bg-destaque">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 0115.5-6.2" />
              <path d="M19 3v4h-4" />
              <path d="M21 12a9 9 0 01-15.5 6.2" />
              <path d="M5 21v-4h4" />
            </svg>
          </span>
          <span className="text-lg font-bold">Devoluções</span>
        </div>
        <div className="flex-1 basis-[420px]">
          <NavAbas abas={abas} />
        </div>
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-full bg-borda text-[13px] font-semibold">
            {iniciais(usuario.nome)}
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold">{usuario.nome}</span>
            <span className="text-xs text-texto-2">{ROTULO_PERFIL[usuario.perfil]}</span>
          </div>
          <form action={acaoSair}>
            <button type="submit" className="min-h-11 rounded-full border border-borda-forte px-4 text-sm font-semibold hover:bg-fundo">
              Sair
            </button>
          </form>
        </div>
      </header>
      <main className="px-4 py-5 sm:px-8">{children}</main>
    </div>
  );
}
```

`src/components/QuadroFluxo.tsx`:

```tsx
export type ColunaFluxo = { numero: number; titulo: string; total: number };

/** Painel da direção C: uma coluna por etapa do PDF (spec §6.0). A rolagem lateral fica dentro da caixa. */
export function QuadroFluxo({ colunas }: { colunas: ColunaFluxo[] }) {
  return (
    <div className="overflow-x-auto pb-1.5">
      <div className="flex min-w-[1300px] items-start gap-3.5">
        {colunas.map((coluna) => (
          <section
            key={coluna.numero}
            aria-labelledby={`coluna-${coluna.numero}`}
            className="flex flex-[1_0_248px] flex-col gap-2.5 rounded-xl bg-coluna p-3"
          >
            <div className="flex items-start gap-2 px-1 pb-1 pt-0.5">
              <span aria-hidden="true" className="flex size-6 flex-none items-center justify-center rounded-full bg-destaque text-xs font-bold text-white">
                {coluna.numero}
              </span>
              <h2 id={`coluna-${coluna.numero}`} className="flex-1 text-sm font-bold leading-snug">
                {coluna.titulo}
              </h2>
              <span className="text-[13px] font-semibold text-texto-2">{coluna.total}</span>
            </div>
            {coluna.total === 0 && (
              <p className="rounded-lg border border-dashed border-borda-forte px-3 py-6 text-center text-[13px] text-texto-2">
                Nenhuma devolução nesta etapa
              </p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
```

`src/components/EmBreve.tsx`:

```tsx
export function EmBreve({ titulo, fase }: { titulo: string; fase: number }) {
  return (
    <section className="mx-auto mt-10 max-w-lg rounded-xl border border-borda bg-superficie p-8 text-center">
      <h1 className="text-xl font-bold">{titulo}</h1>
      <p className="mt-2 text-sm text-texto-2">Esta área chega na Fase {fase} do projeto.</p>
    </section>
  );
}
```

- [ ] **Passo 4: Rodar e confirmar que passa**

Rode: `npm test && npm run typecheck && npm run lint`. Esperado: tudo PASS.

- [ ] **Passo 5: Commit**

```bash
git add -A
git commit -m "feat: visual base da direção C (cores, fontes, barra superior e quadro de fluxo)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 7: Login, logout, páginas protegidas e teste ponta a ponta

**Arquivos:**
- Criar: `src/modules/auth/servidor.ts`
- Criar: `src/app/login/acoes.ts`, `src/app/login/FormularioLogin.tsx`, `src/app/login/page.tsx`, `src/app/not-found.tsx`
- Criar: `src/app/(app)/layout.tsx`, `src/app/(app)/fluxo/page.tsx`, `src/app/(app)/contestacoes/page.tsx`, `src/app/(app)/lotes/page.tsx`, `src/app/(app)/cadastros/page.tsx`, `src/app/(app)/configuracoes/page.tsx`
- Modificar (substituir o conteúdo): `src/app/page.tsx`
- Criar: `playwright.config.ts`, `tests/e2e/dados.ts`, `tests/e2e/global-setup.ts`
- Teste: `tests/e2e/login.spec.ts`

**Interfaces:**
- Consome: `obterDb`, `autenticar`, `criarSessao`, `encerrarSessao`, `validarSessao`, `pode`, `Acao`, `AppShell`, `QuadroFluxo`, `EmBreve`, `ETAPAS`, `migrar`, `criarDb`, `criarUsuario`, `limparTabelas`
- Produz:
  - `COOKIE_SESSAO = 'sessao'`
  - `usuarioAtual(): Promise<UsuarioSessao | null>`
  - `exigirUsuario(): Promise<UsuarioSessao>` (redireciona para `/login`)
  - `exigirPermissao(acao: Acao): Promise<UsuarioSessao>` (responde 404 sem permissão)
  - ações `entrar(estado: EstadoLogin, form: FormData): Promise<EstadoLogin>` e `sair(): Promise<void>`, com `type EstadoLogin = { erro: string | null }`
  - script npm `test:e2e`

- [ ] **Passo 1: Instalar as dependências**

```bash
npm install server-only
npm install -D @playwright/test
npx playwright install chromium
npm pkg set scripts.test:e2e="playwright test"
```

- [ ] **Passo 2: Escrever o teste ponta a ponta que falha**

`tests/e2e/dados.ts`:

```ts
export const USUARIOS_E2E = {
  gestor: { nome: 'Gestora Teste', email: 'gestor@teste.local', senha: 'senha-gestor-123', perfil: 'GESTOR' as const },
  operador: { nome: 'Operador Teste', email: 'operador@teste.local', senha: 'senha-operador-123', perfil: 'OPERADOR' as const },
};
```

`tests/e2e/global-setup.ts`:

```ts
import { criarDb } from '../../src/db/client';
import { migrar } from '../../src/db/migrate';
import { criarUsuario } from '../../src/modules/auth/usuarios';
import { limparTabelas } from '../helpers/db';
import { USUARIOS_E2E } from './dados';

export default async function globalSetup() {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('Defina DATABASE_URL_TEST no .env');
  await migrar(url);
  const { db, sql } = criarDb(url);
  try {
    await limparTabelas(sql);
    await criarUsuario(db, USUARIOS_E2E.gestor);
    await criarUsuario(db, USUARIOS_E2E.operador);
  } finally {
    await sql.end();
  }
}
```

`playwright.config.ts`:

```ts
import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

if (existsSync('.env')) process.loadEnvFile('.env');

const PORTA = 3100;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  globalSetup: './tests/e2e/global-setup.ts',
  use: { baseURL: `http://localhost:${PORTA}`, trace: 'retain-on-failure' },
  projects: [{ name: 'computador', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run dev -- --port ${PORTA}`,
    url: `http://localhost:${PORTA}/api/saude`,
    reuseExistingServer: false,
    timeout: 120_000,
    // O Next não sobrescreve variáveis já definidas, então o servidor de teste usa o banco de testes.
    env: { DATABASE_URL: process.env.DATABASE_URL_TEST ?? '' },
  },
});
```

`tests/e2e/login.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test';
import { ETAPAS } from '../../src/modules/devolucoes/etapas';
import { USUARIOS_E2E } from './dados';

async function entrar(page: Page, email: string, senha: string) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

test('manda para o login quem não está autenticado', async ({ page }) => {
  await page.goto('/fluxo');
  await expect(page).toHaveURL(/\/login$/);
});

test('mostra erro com senha errada', async ({ page }) => {
  await entrar(page, USUARIOS_E2E.operador.email, 'senha-errada-000');
  await expect(page.getByRole('alert')).toHaveText('E-mail ou senha incorretos.');
});

test('gestor entra, vê as 5 etapas do PDF e todas as abas, e sai', async ({ page }) => {
  await entrar(page, USUARIOS_E2E.gestor.email, USUARIOS_E2E.gestor.senha);
  await expect(page).toHaveURL(/\/fluxo$/);

  for (const etapa of ETAPAS) {
    await expect(page.getByRole('heading', { level: 2, name: etapa.titulo })).toBeVisible();
  }
  const nav = page.getByRole('navigation', { name: 'Seções' });
  await expect(nav.getByRole('link')).toHaveText([
    'Fluxo',
    'Contestações ML',
    'Lotes e Remessas',
    'Produtos e Fornecedores',
    'Configurações',
  ]);

  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/fluxo');
  await expect(page).toHaveURL(/\/login$/);
});

test('operador vê só a aba Fluxo e não acessa Configurações', async ({ page }) => {
  await entrar(page, USUARIOS_E2E.operador.email, USUARIOS_E2E.operador.senha);
  await expect(page).toHaveURL(/\/fluxo$/);
  await expect(page.getByRole('navigation', { name: 'Seções' }).getByRole('link')).toHaveText(['Fluxo']);

  await page.goto('/configuracoes');
  await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
});
```

Rode: `npm run test:e2e`. Esperado: FAIL (as páginas `/login` e `/fluxo` ainda não existem).

- [ ] **Passo 3: Funções de sessão no servidor**

`src/modules/auth/servidor.ts`:

```ts
import 'server-only';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { obterDb } from '@/db';
import { pode, type Acao } from './permissoes';
import { validarSessao } from './sessoes';
import type { UsuarioSessao } from './usuarios';

export const COOKIE_SESSAO = 'sessao';

export async function usuarioAtual(): Promise<UsuarioSessao | null> {
  const token = (await cookies()).get(COOKIE_SESSAO)?.value;
  if (!token) return null;
  return validarSessao(obterDb(), token);
}

export async function exigirUsuario(): Promise<UsuarioSessao> {
  const usuario = await usuarioAtual();
  if (!usuario) redirect('/login');
  return usuario;
}

/** Toda página e toda ação chamam esta função: a permissão é checada no servidor (spec §10). */
export async function exigirPermissao(acao: Acao): Promise<UsuarioSessao> {
  const usuario = await exigirUsuario();
  if (!pode(usuario.perfil, acao)) notFound();
  return usuario;
}
```

- [ ] **Passo 4: Ações de login e logout**

`src/app/login/acoes.ts`:

```ts
'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { obterDb } from '@/db';
import { autenticar } from '@/modules/auth/autenticar';
import { COOKIE_SESSAO } from '@/modules/auth/servidor';
import { criarSessao, encerrarSessao } from '@/modules/auth/sessoes';

export type EstadoLogin = { erro: string | null };

export async function entrar(_anterior: EstadoLogin, formulario: FormData): Promise<EstadoLogin> {
  const email = String(formulario.get('email') ?? '');
  const senha = String(formulario.get('senha') ?? '');
  if (!email || !senha) return { erro: 'Informe e-mail e senha.' };

  const db = obterDb();
  const resultado = await autenticar(db, email, senha);
  if (!resultado.ok) {
    return {
      erro:
        resultado.motivo === 'bloqueado'
          ? 'Acesso bloqueado por muitas tentativas. Tente de novo em 15 minutos.'
          : 'E-mail ou senha incorretos.',
    };
  }

  const { token, expiraEm } = await criarSessao(db, resultado.usuario.id);
  (await cookies()).set(COOKIE_SESSAO, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiraEm,
  });
  redirect('/fluxo');
}

export async function sair(): Promise<void> {
  const loja = await cookies();
  const token = loja.get(COOKIE_SESSAO)?.value;
  if (token) await encerrarSessao(obterDb(), token);
  loja.delete(COOKIE_SESSAO);
  redirect('/login');
}
```

- [ ] **Passo 5: Página de login**

`src/app/login/FormularioLogin.tsx`:

```tsx
'use client';

import { useActionState } from 'react';
import { entrar, type EstadoLogin } from './acoes';

const ESTADO_INICIAL: EstadoLogin = { erro: null };

export function FormularioLogin() {
  const [estado, acao, pendente] = useActionState(entrar, ESTADO_INICIAL);
  return (
    <form action={acao} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-[13px] font-semibold text-texto-2">
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className="h-11 rounded-lg border border-borda-forte bg-superficie px-3 text-[15px]"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="senha" className="text-[13px] font-semibold text-texto-2">
          Senha
        </label>
        <input
          id="senha"
          name="senha"
          type="password"
          autoComplete="current-password"
          required
          className="h-11 rounded-lg border border-borda-forte bg-superficie px-3 text-[15px]"
        />
      </div>
      {estado.erro && (
        <p role="alert" className="rounded-lg bg-erro-suave px-3 py-2 text-sm font-medium text-erro">
          {estado.erro}
        </p>
      )}
      <button
        type="submit"
        disabled={pendente}
        className="h-12 rounded-full bg-destaque text-[15px] font-semibold text-white hover:bg-destaque-escuro disabled:opacity-60"
      >
        {pendente ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}
```

`src/app/login/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { usuarioAtual } from '@/modules/auth/servidor';
import { FormularioLogin } from './FormularioLogin';

export const metadata: Metadata = { title: 'Entrar · Gestão de Devoluções' };

export default async function PaginaLogin() {
  if (await usuarioAtual()) redirect('/fluxo');
  return (
    <main className="flex min-h-screen items-center justify-center bg-fundo px-4">
      <div className="w-full max-w-sm rounded-2xl border border-borda bg-superficie p-8">
        <div className="mb-6 flex flex-col gap-1">
          <h1 className="text-2xl font-bold">Gestão de Devoluções</h1>
          <p className="text-sm text-texto-2">Entre com seu e-mail e senha.</p>
        </div>
        <FormularioLogin />
      </div>
    </main>
  );
}
```

`src/app/not-found.tsx`:

```tsx
import Link from 'next/link';

export default function PaginaNaoEncontrada() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-fundo px-4 text-center">
      <h1 className="text-2xl font-bold">Página não encontrada</h1>
      <p className="text-sm text-texto-2">O endereço não existe ou você não tem acesso a ele.</p>
      <Link href="/fluxo" className="flex min-h-11 items-center font-semibold text-destaque">
        Voltar ao fluxo
      </Link>
    </main>
  );
}
```

`src/app/page.tsx` (substitui todo o conteúdo):

```tsx
import { redirect } from 'next/navigation';

export default function Inicio() {
  redirect('/fluxo');
}
```

- [ ] **Passo 6: Área logada e páginas**

`src/app/(app)/layout.tsx`:

```tsx
import type { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';
import { exigirUsuario } from '@/modules/auth/servidor';
import { sair } from '../login/acoes';

export default async function LayoutAreaLogada({ children }: { children: ReactNode }) {
  const usuario = await exigirUsuario();
  return (
    <AppShell usuario={usuario} acaoSair={sair}>
      {children}
    </AppShell>
  );
}
```

`src/app/(app)/fluxo/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { QuadroFluxo } from '@/components/QuadroFluxo';
import { exigirPermissao } from '@/modules/auth/servidor';
import { ETAPAS } from '@/modules/devolucoes/etapas';

export const metadata: Metadata = { title: 'Fluxo · Gestão de Devoluções' };

export default async function PaginaFluxo() {
  await exigirPermissao('ver_listas');
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">Fluxo de devoluções</h1>
      <QuadroFluxo colunas={ETAPAS.map((e) => ({ numero: e.numero, titulo: e.titulo, total: 0 }))} />
    </div>
  );
}
```

`src/app/(app)/contestacoes/page.tsx`:

```tsx
import { EmBreve } from '@/components/EmBreve';
import { exigirPermissao } from '@/modules/auth/servidor';

export default async function PaginaContestacoes() {
  await exigirPermissao('administrar');
  return <EmBreve titulo="Contestações ML" fase={3} />;
}
```

`src/app/(app)/lotes/page.tsx`:

```tsx
import { EmBreve } from '@/components/EmBreve';
import { exigirPermissao } from '@/modules/auth/servidor';

export default async function PaginaLotes() {
  await exigirPermissao('gerir_fiscal');
  return <EmBreve titulo="Lotes e Remessas" fase={5} />;
}
```

`src/app/(app)/cadastros/page.tsx`:

```tsx
import { EmBreve } from '@/components/EmBreve';
import { exigirPermissao } from '@/modules/auth/servidor';

export default async function PaginaCadastros() {
  await exigirPermissao('gerir_catalogo');
  return <EmBreve titulo="Produtos e Fornecedores" fase={1} />;
}
```

`src/app/(app)/configuracoes/page.tsx`:

```tsx
import { EmBreve } from '@/components/EmBreve';
import { exigirPermissao } from '@/modules/auth/servidor';

export default async function PaginaConfiguracoes() {
  await exigirPermissao('administrar');
  return <EmBreve titulo="Configurações" fase={1} />;
}
```

- [ ] **Passo 7: Rodar e confirmar que passa**

Rode: `npm run test:e2e`. Esperado: 4 testes PASS.

Rode: `npm test && npm run test:int && npm run typecheck && npm run lint && npm run build`. Esperado: tudo sem erro.

Confira à mão: rode `npm run dev`, abra http://localhost:3000, entre com `gestor@local.dev` / `senha-local-123` (criado na Tarefa 3) e veja o quadro com as 5 colunas.

- [ ] **Passo 8: Commit**

```bash
git add -A
git commit -m "feat: login, logout, páginas protegidas por perfil e teste ponta a ponta" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 8: Recebimento dos avisos do Mercado Livre

Serve para o teste real (spec §7.6, item 4: os avisos chegam à VPS dentro de 500 ms?) e é a base da Fase 3.

**Arquivos:**
- Criar: `src/db/schema/notificacoes.ts`
- Modificar: `src/db/schema/index.ts`
- Gerado: `drizzle/0001_*.sql`
- Criar: `src/conectores/marketplace/mercadolivre/notificacoes.ts`, `src/app/api/ml/notificacoes/route.ts`
- Testes: `src/conectores/marketplace/mercadolivre/notificacoes.test.ts`, `src/conectores/marketplace/mercadolivre/notificacoes.int.test.ts`

**Interfaces:**
- Consome: `Db`, `obterDb`, `lerEnv`, `criarDbTeste`, `limparTabelas`
- Produz:
  - tabela `notificacoesRecebidas` (`notificacoes_recebidas`)
  - `type NotificacaoML = { topico: string | null; recurso: string | null; payload: Record<string, unknown> }`
  - `aceitarNotificacaoML(corpo: unknown, clientIdEsperado?: string): NotificacaoML | null`
  - `registrarNotificacao(db: Db, canal: string, n: NotificacaoML): Promise<number>`
  - rota `POST /api/ml/notificacoes`

- [ ] **Passo 1: Tabela e migração**

`src/db/schema/notificacoes.ts`:

```ts
import { bigserial, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/** Aviso bruto recebido de um marketplace. O processamento (buscar o recurso de novo na API) é da Fase 3. */
export const notificacoesRecebidas = pgTable('notificacoes_recebidas', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  canal: text('canal').notNull(),
  topico: text('topico'),
  recurso: text('recurso'),
  payload: jsonb('payload').notNull(),
  recebidaEm: timestamp('recebida_em', { withTimezone: true }).notNull().defaultNow(),
  processadaEm: timestamp('processada_em', { withTimezone: true }),
});
```

`src/db/schema/index.ts` (substitui o conteúdo):

```ts
export * from './auth';
export * from './notificacoes';
```

Rode: `npm run db:gerar && npm run db:migrar`
Esperado: cria `drizzle/0001_<nome>.sql` com `CREATE TABLE "notificacoes_recebidas"` e mostra "Migrações aplicadas."

- [ ] **Passo 2: Escrever os testes que falham**

`src/conectores/marketplace/mercadolivre/notificacoes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { aceitarNotificacaoML } from './notificacoes';

const AVISO = {
  id: 'abc',
  resource: '/post-purchase/v1/claims/5292183123',
  user_id: 123,
  topic: 'post_purchase',
  actions: ['claims'],
  application_id: 999,
  attempts: 1,
};

describe('aceitarNotificacaoML', () => {
  it('extrai tópico e recurso de um aviso válido', () => {
    expect(aceitarNotificacaoML(AVISO, '999')).toEqual({
      topico: 'post_purchase',
      recurso: '/post-purchase/v1/claims/5292183123',
      payload: AVISO,
    });
  });

  it('aceita qualquer app quando o client_id não está configurado', () => {
    expect(aceitarNotificacaoML(AVISO, undefined)?.topico).toBe('post_purchase');
  });

  it('ignora aviso de outro app', () => {
    expect(aceitarNotificacaoML(AVISO, '111')).toBeNull();
  });

  it('ignora corpo que não é objeto', () => {
    expect(aceitarNotificacaoML(null, undefined)).toBeNull();
    expect(aceitarNotificacaoML([AVISO], undefined)).toBeNull();
    expect(aceitarNotificacaoML('texto', undefined)).toBeNull();
  });

  it('guarda tópico e recurso nulos quando não vierem como texto', () => {
    expect(aceitarNotificacaoML({ outro: 1 }, undefined)).toEqual({ topico: null, recurso: null, payload: { outro: 1 } });
  });
});
```

`src/conectores/marketplace/mercadolivre/notificacoes.int.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { notificacoesRecebidas } from '@/db/schema';
import { criarDbTeste, limparTabelas } from '../../../../tests/helpers/db';
import { registrarNotificacao } from './notificacoes';

const { db, sql } = criarDbTeste();
beforeEach(async () => {
  await limparTabelas(sql);
});
afterAll(async () => {
  await sql.end();
});

describe('registrarNotificacao', () => {
  it('grava o aviso com canal, tópico, recurso e corpo', async () => {
    const id = await registrarNotificacao(db, 'mercado_livre', {
      topico: 'post_purchase',
      recurso: '/post-purchase/v1/claims/1',
      payload: { topic: 'post_purchase', resource: '/post-purchase/v1/claims/1' },
    });

    const [linha] = await db.select().from(notificacoesRecebidas);
    expect(linha.id).toBe(id);
    expect(linha).toMatchObject({
      canal: 'mercado_livre',
      topico: 'post_purchase',
      recurso: '/post-purchase/v1/claims/1',
      payload: { topic: 'post_purchase', resource: '/post-purchase/v1/claims/1' },
      processadaEm: null,
    });
  });
});
```

Rode: `npm test && npm run test:int`. Esperado: FAIL (módulo `./notificacoes` não existe).

- [ ] **Passo 3: Implementar**

`src/conectores/marketplace/mercadolivre/notificacoes.ts`:

```ts
import type { Db } from '@/db/client';
import { notificacoesRecebidas } from '@/db/schema';

export type NotificacaoML = { topico: string | null; recurso: string | null; payload: Record<string, unknown> };

/**
 * Filtra o corpo recebido. O conteúdo é usado só como gatilho: a Fase 3 sempre busca o recurso de novo na API (spec §7.2).
 * Com o client_id configurado, ignora avisos de outros apps.
 */
export function aceitarNotificacaoML(corpo: unknown, clientIdEsperado?: string): NotificacaoML | null {
  if (typeof corpo !== 'object' || corpo === null || Array.isArray(corpo)) return null;
  const p = corpo as Record<string, unknown>;
  if (clientIdEsperado && String(p.application_id ?? '') !== clientIdEsperado) return null;
  return {
    topico: typeof p.topic === 'string' ? p.topic : null,
    recurso: typeof p.resource === 'string' ? p.resource : null,
    payload: p,
  };
}

export async function registrarNotificacao(db: Db, canal: string, n: NotificacaoML): Promise<number> {
  const [linha] = await db
    .insert(notificacoesRecebidas)
    .values({ canal, topico: n.topico, recurso: n.recurso, payload: n.payload })
    .returning({ id: notificacoesRecebidas.id });
  return linha.id;
}
```

`src/app/api/ml/notificacoes/route.ts`:

```ts
import { aceitarNotificacaoML, registrarNotificacao } from '@/conectores/marketplace/mercadolivre/notificacoes';
import { obterDb } from '@/db';
import { lerEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';

/** O ML exige HTTP 200 em menos de 500 ms (spec §7.2): só grava o aviso e responde. */
export async function POST(requisicao: Request) {
  let corpo: unknown;
  try {
    corpo = await requisicao.json();
  } catch {
    return new Response(null, { status: 400 });
  }
  const notificacao = aceitarNotificacaoML(corpo, lerEnv().ML_CLIENT_ID || undefined);
  if (notificacao) await registrarNotificacao(obterDb(), 'mercado_livre', notificacao);
  return new Response(null, { status: 200 });
}
```

- [ ] **Passo 4: Rodar e conferir a rota**

Rode: `npm test && npm run test:int`. Esperado: PASS.

Rode `npm run dev` e, em outro terminal:

```bash
curl -s -o /dev/null -w '%{http_code} %{time_total}\n' -X POST http://localhost:3000/api/ml/notificacoes \
  -H 'content-type: application/json' -d '{"topic":"post_purchase","resource":"/post-purchase/v1/claims/1"}'
PGPASSWORD=devolucoes "/c/Program Files/PostgreSQL/17/bin/psql.exe" -U devolucoes -h localhost -d devolucoes -c "select id, topico, recurso from notificacoes_recebidas"
```

Esperado: `200 0.0xx` e uma linha com `post_purchase`. (Com `ML_CLIENT_ID` vazio no `.env`, todo aviso é aceito.)

- [ ] **Passo 5: Commit**

```bash
git add -A
git commit -m "feat: recebimento e gravação dos avisos do Mercado Livre" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 9: Conector do Mercado Livre (OAuth, cliente da API, datas e remoção de dados pessoais)

**Arquivos:**
- Criar: `src/conectores/marketplace/mercadolivre/cliente.ts`, `src/conectores/marketplace/mercadolivre/oauth.ts`, `src/conectores/marketplace/mercadolivre/datas.ts`, `src/lib/redigir.ts`
- Testes: `cliente.test.ts`, `oauth.test.ts` e `datas.test.ts` (mesma pasta), `src/lib/redigir.test.ts`

**Interfaces:**
- Produz:
  - `API_ML = 'https://api.mercadolibre.com'`
  - `class ErroML extends Error { status: number; corpo: string; caminho: string }`
  - `type ClienteML = { get<T = unknown>(caminho: string, cabecalhos?: Record<string, string>): Promise<T> }`
  - `criarClienteML(p: { accessToken: string; fetchFn?: typeof fetch }): ClienteML`
  - `URL_AUTORIZACAO_ML`, `URL_TOKEN_ML`
  - `type TokensML = { accessToken: string; refreshToken: string; expiraEm: string; userId: number; escopo: string }` (`expiraEm` em ISO 8601)
  - `gerarPkce(): { verifier: string; challenge: string }`
  - `montarUrlAutorizacao(p: { clientId: string; redirectUri: string; state: string; codeChallenge?: string }): string`
  - `trocarCodigo(p: { clientId: string; clientSecret: string; code: string; redirectUri: string; codeVerifier?: string; fetchFn?: typeof fetch; agora?: Date }): Promise<TokensML>`
  - `renovarTokens(p: { clientId: string; clientSecret: string; refreshToken: string; fetchFn?: typeof fetch; agora?: Date }): Promise<TokensML>`
  - `formatarDataML(data: Date): string`
  - `MARCA_REDIGIDO = '[REDIGIDO]'` e `redigir<T>(valor: T): T`

- [ ] **Passo 1: Escrever os testes que falham**

`src/conectores/marketplace/mercadolivre/cliente.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { API_ML, criarClienteML, ErroML } from './cliente';

describe('criarClienteML', () => {
  it('faz GET com o token e os cabeçalhos extras e devolve o JSON', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ id: 1 }), { status: 200 }));
    const cliente = criarClienteML({ accessToken: 'TOKEN', fetchFn });

    expect(await cliente.get('/shipments/9', { 'x-format-new': 'true' })).toEqual({ id: 1 });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${API_ML}/shipments/9`);
    expect(init.headers).toMatchObject({ authorization: 'Bearer TOKEN', 'x-format-new': 'true', accept: 'application/json' });
  });

  it('lança ErroML com status, corpo e caminho quando a API responde erro', async () => {
    const fetchFn = vi.fn(async () => new Response('{"message":"not_found"}', { status: 404 }));
    const cliente = criarClienteML({ accessToken: 'TOKEN', fetchFn });

    const erro = await cliente.get('/orders/1').catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroML);
    expect(erro).toMatchObject({ status: 404, corpo: '{"message":"not_found"}', caminho: '/orders/1' });
  });
});
```

`src/conectores/marketplace/mercadolivre/oauth.test.ts`:

```ts
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { ErroML } from './cliente';
import { gerarPkce, montarUrlAutorizacao, renovarTokens, trocarCodigo, URL_TOKEN_ML } from './oauth';

const RESPOSTA = { access_token: 'APP_USR-a', refresh_token: 'TG-r', expires_in: 21600, user_id: 123, scope: 'offline_access read write' };

function fetchQueResponde(corpo: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(corpo), { status }));
}

type FetchFalso = { mock: { calls: unknown[][] } };

function chamada(fetchFn: FetchFalso): [string, RequestInit] {
  return fetchFn.mock.calls[0] as unknown as [string, RequestInit];
}

function corpoEnviado(fetchFn: FetchFalso): URLSearchParams {
  return new URLSearchParams(String(chamada(fetchFn)[1].body));
}

describe('montarUrlAutorizacao', () => {
  it('monta a URL de autorização do ML Brasil', () => {
    const url = new URL(montarUrlAutorizacao({ clientId: '999', redirectUri: 'https://x.com/retorno', state: 'abc' }));
    expect(url.origin + url.pathname).toBe('https://auth.mercadolivre.com.br/authorization');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: 'code',
      client_id: '999',
      redirect_uri: 'https://x.com/retorno',
      state: 'abc',
    });
  });

  it('inclui o PKCE quando informado', () => {
    const url = new URL(montarUrlAutorizacao({ clientId: '1', redirectUri: 'https://x', state: 's', codeChallenge: 'CH' }));
    expect(url.searchParams.get('code_challenge')).toBe('CH');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  });
});

describe('gerarPkce', () => {
  it('gera o challenge S256 do verifier', () => {
    const { verifier, challenge } = gerarPkce();
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'));
  });
});

describe('trocarCodigo', () => {
  it('envia o code e devolve os tokens com a data de expiração', async () => {
    const fetchFn = fetchQueResponde(RESPOSTA);
    const agora = new Date('2026-11-11T12:00:00Z');
    const tokens = await trocarCodigo({
      clientId: '999',
      clientSecret: 'SEGREDO',
      code: 'TG-code',
      redirectUri: 'https://x.com/retorno',
      codeVerifier: 'VER',
      fetchFn,
      agora,
    });

    expect(tokens).toEqual({
      accessToken: 'APP_USR-a',
      refreshToken: 'TG-r',
      expiraEm: '2026-11-11T18:00:00.000Z',
      userId: 123,
      escopo: 'offline_access read write',
    });
    expect(chamada(fetchFn)[0]).toBe(URL_TOKEN_ML);
    expect(Object.fromEntries(corpoEnviado(fetchFn))).toEqual({
      grant_type: 'authorization_code',
      client_id: '999',
      client_secret: 'SEGREDO',
      code: 'TG-code',
      redirect_uri: 'https://x.com/retorno',
      code_verifier: 'VER',
    });
  });

  it('lança ErroML quando o ML recusa', async () => {
    const fetchFn = fetchQueResponde({ error: 'invalid_grant' }, 400);
    await expect(
      trocarCodigo({ clientId: '1', clientSecret: 's', code: 'c', redirectUri: 'https://x', fetchFn }),
    ).rejects.toBeInstanceOf(ErroML);
  });
});

describe('renovarTokens', () => {
  it('usa o refresh_token', async () => {
    const fetchFn = fetchQueResponde(RESPOSTA);
    await renovarTokens({ clientId: '999', clientSecret: 'SEGREDO', refreshToken: 'TG-velho', fetchFn });
    expect(Object.fromEntries(corpoEnviado(fetchFn))).toEqual({
      grant_type: 'refresh_token',
      client_id: '999',
      client_secret: 'SEGREDO',
      refresh_token: 'TG-velho',
    });
  });
});
```

`src/conectores/marketplace/mercadolivre/datas.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatarDataML } from './datas';

describe('formatarDataML', () => {
  it('formata no horário de Brasília, com milissegundos, como no exemplo da documentação do ML', () => {
    expect(formatarDataML(new Date('2026-03-19T15:31:54.000Z'))).toBe('2026-03-19T12:31:54.000-0300');
  });
});
```

`src/lib/redigir.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MARCA_REDIGIDO, redigir } from './redigir';

describe('redigir', () => {
  it('troca dados pessoais em qualquer nível, inclusive dentro de listas', () => {
    const entrada = {
      id: 10,
      status: 'delivered',
      buyer: { id: 5, first_name: 'Ana', last_name: 'Souza', email: 'ana@x.com' },
      shipments: [
        {
          destination: {
            name: 'seller_address',
            receiver_name: 'Ana Souza',
            shipping_address: { street_name: 'Rua A', street_number: '10', zip_code: '01000-000', city: { name: 'São Paulo' } },
          },
        },
      ],
      identification: { type: 'CPF', number: '12345678900' },
    };

    expect(redigir(entrada)).toEqual({
      id: 10,
      status: 'delivered',
      buyer: { id: 5, first_name: MARCA_REDIGIDO, last_name: MARCA_REDIGIDO, email: MARCA_REDIGIDO },
      shipments: [
        {
          destination: {
            name: 'seller_address',
            receiver_name: MARCA_REDIGIDO,
            shipping_address: {
              street_name: MARCA_REDIGIDO,
              street_number: MARCA_REDIGIDO,
              zip_code: MARCA_REDIGIDO,
              city: { name: 'São Paulo' },
            },
          },
        },
      ],
      identification: MARCA_REDIGIDO,
    });
  });

  it('não altera valores simples', () => {
    expect(redigir('texto')).toBe('texto');
    expect(redigir(null)).toBeNull();
  });
});
```

Rode: `npm test`. Esperado: FAIL (os módulos ainda não existem).

- [ ] **Passo 2: Implementar o cliente**

`src/conectores/marketplace/mercadolivre/cliente.ts`:

```ts
export const API_ML = 'https://api.mercadolibre.com';

export class ErroML extends Error {
  readonly status: number;
  readonly corpo: string;
  readonly caminho: string;

  constructor(status: number, corpo: string, caminho: string) {
    super(`Mercado Livre respondeu ${status} em ${caminho}`);
    this.name = 'ErroML';
    this.status = status;
    this.corpo = corpo;
    this.caminho = caminho;
  }
}

export type ClienteML = {
  get<T = unknown>(caminho: string, cabecalhos?: Record<string, string>): Promise<T>;
};

export function criarClienteML(p: { accessToken: string; fetchFn?: typeof fetch }): ClienteML {
  const fetchFn = p.fetchFn ?? fetch;
  return {
    async get<T = unknown>(caminho: string, cabecalhos: Record<string, string> = {}): Promise<T> {
      const resposta = await fetchFn(`${API_ML}${caminho}`, {
        headers: { accept: 'application/json', ...cabecalhos, authorization: `Bearer ${p.accessToken}` },
      });
      const texto = await resposta.text();
      if (!resposta.ok) throw new ErroML(resposta.status, texto, caminho);
      return (texto ? JSON.parse(texto) : null) as T;
    },
  };
}
```

- [ ] **Passo 3: Implementar o OAuth**

`src/conectores/marketplace/mercadolivre/oauth.ts`:

```ts
import { createHash, randomBytes } from 'node:crypto';
import { ErroML } from './cliente';

export const URL_AUTORIZACAO_ML = 'https://auth.mercadolivre.com.br/authorization';
export const URL_TOKEN_ML = 'https://api.mercadolibre.com/oauth/token';

export type TokensML = {
  accessToken: string;
  refreshToken: string;
  /** ISO 8601. O access token dura 6 h (spec §7.1). */
  expiraEm: string;
  userId: number;
  escopo: string;
};

type RespostaToken = { access_token: string; refresh_token: string; expires_in: number; user_id: number; scope: string };

export function gerarPkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function montarUrlAutorizacao(p: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge?: string;
}): string {
  const url = new URL(URL_AUTORIZACAO_ML);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', p.clientId);
  url.searchParams.set('redirect_uri', p.redirectUri);
  url.searchParams.set('state', p.state);
  if (p.codeChallenge) {
    url.searchParams.set('code_challenge', p.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
  }
  return url.toString();
}

async function pedirToken(corpo: Record<string, string>, fetchFn: typeof fetch, agora: Date): Promise<TokensML> {
  const resposta = await fetchFn(URL_TOKEN_ML, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams(corpo).toString(),
  });
  const texto = await resposta.text();
  if (!resposta.ok) throw new ErroML(resposta.status, texto, '/oauth/token');
  const d = JSON.parse(texto) as RespostaToken;
  return {
    accessToken: d.access_token,
    refreshToken: d.refresh_token,
    expiraEm: new Date(agora.getTime() + d.expires_in * 1000).toISOString(),
    userId: d.user_id,
    escopo: d.scope,
  };
}

export function trocarCodigo(p: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  codeVerifier?: string;
  fetchFn?: typeof fetch;
  agora?: Date;
}): Promise<TokensML> {
  const corpo: Record<string, string> = {
    grant_type: 'authorization_code',
    client_id: p.clientId,
    client_secret: p.clientSecret,
    code: p.code,
    redirect_uri: p.redirectUri,
  };
  if (p.codeVerifier) corpo.code_verifier = p.codeVerifier;
  return pedirToken(corpo, p.fetchFn ?? fetch, p.agora ?? new Date());
}

/** O refresh token do ML é de uso único: sempre guarde o novo (spec §7.1). */
export function renovarTokens(p: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  fetchFn?: typeof fetch;
  agora?: Date;
}): Promise<TokensML> {
  return pedirToken(
    { grant_type: 'refresh_token', client_id: p.clientId, client_secret: p.clientSecret, refresh_token: p.refreshToken },
    p.fetchFn ?? fetch,
    p.agora ?? new Date(),
  );
}
```

- [ ] **Passo 4: Implementar datas e remoção de dados pessoais**

`src/conectores/marketplace/mercadolivre/datas.ts`:

```ts
const UTC_MENOS_3_MS = 3 * 60 * 60 * 1000;

/**
 * Formato pedido pelo filtro `range=last_updated:after:` do ML: horário de Brasília com milissegundos,
 * ex.: 2026-03-19T12:31:54.000-0300. O Brasil não tem horário de verão desde 2019.
 */
export function formatarDataML(data: Date): string {
  return new Date(data.getTime() - UTC_MENOS_3_MS).toISOString().replace('Z', '-0300');
}
```

`src/lib/redigir.ts`:

```ts
export const MARCA_REDIGIDO = '[REDIGIDO]';

/** Chaves com dados pessoais nas respostas do ML. O valor inteiro (texto ou objeto) é trocado pela marca. */
const CHAVES_PESSOAIS = new Set([
  'first_name',
  'last_name',
  'nickname',
  'email',
  'phone',
  'phones',
  'secondary_phone',
  'alternative_phone',
  'doc_number',
  'identification',
  'address_line',
  'street_name',
  'street_number',
  'zip_code',
  'receiver_name',
  'receiver_phone',
  'latitude',
  'longitude',
  'comment',
  'billing_info',
]);

export function redigir<T>(valor: T): T {
  if (Array.isArray(valor)) return valor.map((item) => redigir(item)) as T;
  if (valor !== null && typeof valor === 'object') {
    return Object.fromEntries(
      Object.entries(valor).map(([chave, v]) => [chave, CHAVES_PESSOAIS.has(chave.toLowerCase()) ? MARCA_REDIGIDO : redigir(v)]),
    ) as T;
  }
  return valor;
}
```

- [ ] **Passo 5: Rodar e confirmar que passa**

Rode: `npm test && npm run typecheck`. Esperado: PASS.

- [ ] **Passo 6: Commit**

```bash
git add -A
git commit -m "feat: conector do Mercado Livre (OAuth, cliente, datas e remoção de dados pessoais)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 10: Scripts do teste real da API do Mercado Livre

Executa o teste da spec §7.6: chama a API real, grava as respostas já sem dados pessoais em `tests/fixtures/ml/` e gera um relatório de cada chamada.

**Arquivos:**
- Criar: `scripts/ml/selecao.ts`, `scripts/ml/comum.ts`, `scripts/ml/autorizar.ts`, `scripts/ml/trocar-codigo.ts`, `scripts/ml/spike.ts`
- Teste: `scripts/ml/selecao.test.ts`

**Interfaces:**
- Consome: `criarClienteML`, `ErroML`, `ClienteML`, `formatarDataML`, `redigir`, `gerarPkce`, `montarUrlAutorizacao`, `trocarCodigo`, `renovarTokens`, `TokensML` (Tarefa 9)
- Produz:
  - `type ReclamacaoResumo = { id: number | string; related_entities?: string[]; type?: string }`
  - `reclamacoesComDevolucao(r: ReclamacaoResumo[], max: number): ReclamacaoResumo[]`
  - `type DevolucaoML = { id?: number | string; orders?: { order_id?: number | string }[]; shipments?: { shipment_id?: number | string }[] }`
  - `idsDaDevolucao(d: DevolucaoML): { pedidos: string[]; envios: string[] }`
  - `ARQUIVO_TOKENS`, `ARQUIVO_PKCE`
  - `exigirEnv(nome: string): string`
  - `salvarTokens(t: TokensML): Promise<void>` e `obterTokensValidos(agora?: Date): Promise<TokensML>`
  - scripts npm `ml:autorizar`, `ml:trocar-codigo`, `ml:spike`

- [ ] **Passo 1: Escrever o teste que falha da seleção**

`scripts/ml/selecao.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { idsDaDevolucao, reclamacoesComDevolucao } from './selecao';

describe('reclamacoesComDevolucao', () => {
  it('fica só com reclamações que têm devolução, aceitando "return" e "returns", até o máximo', () => {
    const r = [
      { id: 1, related_entities: ['return'] },
      { id: 2, related_entities: [] },
      { id: 3, related_entities: ['returns'] },
      { id: 4 },
      { id: 5, related_entities: ['changes', 'return'] },
    ];
    expect(reclamacoesComDevolucao(r, 2).map((x) => x.id)).toEqual([1, 3]);
  });
});

describe('idsDaDevolucao', () => {
  it('extrai os IDs de pedidos e de envios como texto, ignorando vazios', () => {
    expect(
      idsDaDevolucao({
        orders: [{ order_id: 2000001 }, {}, { order_id: '2000002' }],
        shipments: [{ shipment_id: 4400 }],
      }),
    ).toEqual({ pedidos: ['2000001', '2000002'], envios: ['4400'] });
  });

  it('lida com devolução sem pedidos nem envios', () => {
    expect(idsDaDevolucao({})).toEqual({ pedidos: [], envios: [] });
  });
});
```

Rode: `npm test`. Esperado: FAIL (módulo `./selecao` não existe).

- [ ] **Passo 2: Implementar a seleção**

`scripts/ml/selecao.ts`:

```ts
export type ReclamacaoResumo = { id: number | string; related_entities?: string[]; type?: string };

export function reclamacoesComDevolucao(reclamacoes: ReclamacaoResumo[], max: number): ReclamacaoResumo[] {
  return reclamacoes
    .filter((r) => (r.related_entities ?? []).some((e) => e === 'return' || e === 'returns'))
    .slice(0, max);
}

export type DevolucaoML = {
  id?: number | string;
  orders?: { order_id?: number | string }[];
  shipments?: { shipment_id?: number | string }[];
};

function paraTexto(valores: (number | string | undefined)[]): string[] {
  return valores.filter((v): v is number | string => v !== undefined && v !== null && v !== '').map(String);
}

export function idsDaDevolucao(d: DevolucaoML): { pedidos: string[]; envios: string[] } {
  return {
    pedidos: paraTexto((d.orders ?? []).map((o) => o.order_id)),
    envios: paraTexto((d.shipments ?? []).map((s) => s.shipment_id)),
  };
}
```

Rode: `npm test`. Esperado: PASS.

- [ ] **Passo 3: Funções comuns e autorização**

`scripts/ml/comum.ts`:

```ts
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { renovarTokens, type TokensML } from '@/conectores/marketplace/mercadolivre/oauth';

export const ARQUIVO_TOKENS = '.ml-tokens.json';
export const ARQUIVO_PKCE = '.ml-pkce.json';

export function exigirEnv(nome: string): string {
  const valor = process.env[nome];
  if (!valor) throw new Error(`Defina ${nome} no .env`);
  return valor;
}

export async function salvarTokens(tokens: TokensML): Promise<void> {
  await writeFile(ARQUIVO_TOKENS, JSON.stringify(tokens, null, 2), 'utf8');
}

/** Lê os tokens locais e renova quando faltam menos de 5 minutos para expirar. */
export async function obterTokensValidos(agora: Date = new Date()): Promise<TokensML> {
  if (!existsSync(ARQUIVO_TOKENS)) {
    throw new Error('Tokens não encontrados. Rode primeiro: npm run ml:autorizar e depois npm run ml:trocar-codigo -- <code>');
  }
  const tokens = JSON.parse(await readFile(ARQUIVO_TOKENS, 'utf8')) as TokensML;
  if (new Date(tokens.expiraEm).getTime() - agora.getTime() > 5 * 60 * 1000) return tokens;

  const novos = await renovarTokens({
    clientId: exigirEnv('ML_CLIENT_ID'),
    clientSecret: exigirEnv('ML_CLIENT_SECRET'),
    refreshToken: tokens.refreshToken,
  });
  await salvarTokens(novos);
  return novos;
}
```

`scripts/ml/autorizar.ts`:

```ts
import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { gerarPkce, montarUrlAutorizacao } from '@/conectores/marketplace/mercadolivre/oauth';
import { ARQUIVO_PKCE, exigirEnv } from './comum';

async function main() {
  const clientId = exigirEnv('ML_CLIENT_ID');
  const redirectUri = exigirEnv('ML_REDIRECT_URI');
  const state = randomBytes(16).toString('hex');

  let codeChallenge: string | undefined;
  if (process.env.ML_USAR_PKCE === 'true') {
    const pkce = gerarPkce();
    codeChallenge = pkce.challenge;
    await writeFile(ARQUIVO_PKCE, JSON.stringify({ verifier: pkce.verifier, state }), 'utf8');
  }

  console.log('1) Abra este endereço logado na CONTA PRINCIPAL do Mercado Livre (não use conta de colaborador) e autorize:\n');
  console.log(montarUrlAutorizacao({ clientId, redirectUri, state, codeChallenge }));
  console.log('\n2) O navegador vai para o endereço de retorno (a página pode dar 404, tudo bem).');
  console.log('   Copie o valor de "code" da barra de endereço e rode:  npm run ml:trocar-codigo -- <code>');
}

main().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
```

`scripts/ml/trocar-codigo.ts`:

```ts
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { trocarCodigo } from '@/conectores/marketplace/mercadolivre/oauth';
import { ARQUIVO_PKCE, ARQUIVO_TOKENS, exigirEnv, salvarTokens } from './comum';

async function main() {
  const code = process.argv[2];
  if (!code) {
    console.error('Uso: npm run ml:trocar-codigo -- <code>');
    process.exit(1);
  }
  const codeVerifier = existsSync(ARQUIVO_PKCE)
    ? (JSON.parse(await readFile(ARQUIVO_PKCE, 'utf8')) as { verifier: string }).verifier
    : undefined;

  const tokens = await trocarCodigo({
    clientId: exigirEnv('ML_CLIENT_ID'),
    clientSecret: exigirEnv('ML_CLIENT_SECRET'),
    code,
    redirectUri: exigirEnv('ML_REDIRECT_URI'),
    codeVerifier,
  });
  await salvarTokens(tokens);
  console.log(`Tokens salvos em ${ARQUIVO_TOKENS} (vendedor ${tokens.userId}, expira em ${tokens.expiraEm}).`);
}

main().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
```

- [ ] **Passo 4: O script do teste real**

`scripts/ml/spike.ts`:

```ts
import { mkdir, writeFile } from 'node:fs/promises';
import { criarClienteML, ErroML, type ClienteML } from '@/conectores/marketplace/mercadolivre/cliente';
import { formatarDataML } from '@/conectores/marketplace/mercadolivre/datas';
import { redigir } from '@/lib/redigir';
import { obterTokensValidos } from './comum';
import { idsDaDevolucao, reclamacoesComDevolucao, type DevolucaoML, type ReclamacaoResumo } from './selecao';

const PASTA = 'tests/fixtures/ml';
const DIAS = 60;
const MAX_RECLAMACOES = 5;
const NOVO_FORMATO = { 'x-format-new': 'true' };

type Passo = { passo: string; caminho: string; status: number | 'erro'; arquivo?: string; observacao?: string };
const relatorio: Passo[] = [];

/** Chama a API, grava a resposta sem dados pessoais e registra o resultado no relatório. Nunca interrompe o teste. */
async function chamar(
  cliente: ClienteML,
  passo: string,
  caminho: string,
  arquivo: string,
  cabecalhos?: Record<string, string>,
): Promise<unknown> {
  try {
    const dados = await cliente.get(caminho, cabecalhos);
    await writeFile(`${PASTA}/${arquivo}`, `${JSON.stringify(redigir(dados), null, 2)}\n`, 'utf8');
    relatorio.push({ passo, caminho, status: 200, arquivo });
    return dados;
  } catch (erro) {
    if (erro instanceof ErroML) {
      relatorio.push({ passo, caminho, status: erro.status, observacao: erro.corpo.slice(0, 300) });
    } else {
      relatorio.push({ passo, caminho, status: 'erro', observacao: String(erro) });
    }
    return null;
  }
}

async function main() {
  const tokens = await obterTokensValidos();
  const cliente = criarClienteML({ accessToken: tokens.accessToken });
  const vendedor = tokens.userId;
  await mkdir(PASTA, { recursive: true });

  const desde = formatarDataML(new Date(Date.now() - DIAS * 24 * 60 * 60 * 1000));
  const busca = (await chamar(
    cliente,
    'buscar reclamações',
    `/post-purchase/v1/claims/search?players.user_id=${vendedor}&players.role=respondent&range=last_updated:after:${desde}&limit=50`,
    'claims-search.json',
  )) as { data?: ReclamacaoResumo[] } | null;

  const selecionadas = reclamacoesComDevolucao(busca?.data ?? [], MAX_RECLAMACOES);
  for (const [i, reclamacao] of selecionadas.entries()) {
    const n = i + 1;
    await chamar(cliente, 'reclamação', `/post-purchase/v1/claims/${reclamacao.id}`, `claim-${n}.json`);
    const resposta = await chamar(cliente, 'devolução (v2)', `/post-purchase/v2/claims/${reclamacao.id}/returns`, `return-${n}.json`);
    const devolucoes = (Array.isArray(resposta) ? resposta : resposta ? [resposta] : []) as DevolucaoML[];

    for (const devolucao of devolucoes) {
      const { pedidos, envios } = idsDaDevolucao(devolucao);
      for (const [k, envio] of envios.entries()) {
        const base = `shipment-${n}-${k + 1}`;
        await chamar(cliente, 'envio da devolução', `/shipments/${envio}`, `${base}.json`, NOVO_FORMATO);
        await chamar(cliente, 'histórico do envio', `/shipments/${envio}/history`, `${base}-history.json`, NOVO_FORMATO);
        await chamar(cliente, 'transportadora do envio', `/shipments/${envio}/carrier`, `${base}-carrier.json`, NOVO_FORMATO);
      }
      for (const [k, pedido] of pedidos.entries()) {
        const base = `order-${n}-${k + 1}`;
        await chamar(cliente, 'pedido', `/orders/${pedido}`, `${base}.json`);
        await chamar(cliente, 'NF do pedido (variante A)', `/users/${vendedor}/invoices/orders/${pedido}`, `${base}-invoice-a.json`);
        await chamar(cliente, 'NF do pedido (variante B)', `/invoices/orders/${pedido}`, `${base}-invoice-b.json`);
      }
    }
  }

  await writeFile(
    `${PASTA}/RELATORIO.json`,
    `${JSON.stringify({ geradoEm: new Date().toISOString(), diasAnalisados: DIAS, reclamacoesAnalisadas: selecionadas.length, passos: relatorio }, null, 2)}\n`,
    'utf8',
  );
  console.table(relatorio.map(({ passo, status, arquivo }) => ({ passo, status, arquivo: arquivo ?? '' })));
  if (selecionadas.length === 0) {
    console.warn(`Nenhuma reclamação com devolução nos últimos ${DIAS} dias. Rode de novo quando houver alguma.`);
  }
}

main().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
```

- [ ] **Passo 5: Scripts npm e verificação sem credenciais**

```bash
npm pkg set scripts.ml:autorizar="node --env-file=.env --import tsx scripts/ml/autorizar.ts"
npm pkg set scripts.ml:trocar-codigo="node --env-file=.env --import tsx scripts/ml/trocar-codigo.ts"
npm pkg set scripts.ml:spike="node --env-file=.env --import tsx scripts/ml/spike.ts"
```

Rode: `npm run ml:spike`
Esperado (ainda sem tokens): sai com código 1 e a mensagem "Tokens não encontrados. Rode primeiro: npm run ml:autorizar…"

Rode: `npm run ml:autorizar`
Esperado (com `ML_CLIENT_ID` vazio): "Defina ML_CLIENT_ID no .env"

Rode: `npm test && npm run typecheck && npm run lint`. Esperado: PASS.

- [ ] **Passo 6: Commit**

```bash
git add -A
git commit -m "feat: scripts do teste real da API do Mercado Livre" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 11: Empacotamento para produção, HTTPS, deploy e documentação

**Arquivos:**
- Modificar: `next.config.ts` (acrescentar `output: 'standalone'`)
- Criar: `Dockerfile`, `.dockerignore`, `docker-compose.prod.yml`, `docker/caddy/Caddyfile`, `.env.producao.example`, `scripts/deploy.sh`
- Criar: `docs/operacao/deploy-vps.md`
- Modificar (substituir o conteúdo gerado pelo create-next-app): `README.md`

**Interfaces:**
- Consome: `scripts/migrar.ts`, `scripts/criar-usuario.ts` (Tarefa 3) e a rota `/api/saude` (Tarefa 2)
- Produz:
  - script npm `build:scripts` (gera `dist/migrar.mjs` e `dist/criar-usuario.mjs`)
  - imagem que roda as migrações e depois sobe o servidor na porta 3000
  - `scripts/deploy.sh`, que lê `VPS_SSH`

- [ ] **Passo 1: Saída standalone do Next e build dos scripts**

Em `next.config.ts`, acrescente `output: 'standalone'` ao objeto de configuração e mantenha as outras opções geradas. Exemplo do arquivo:

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
};

export default nextConfig;
```

```bash
npm pkg set scripts.build:scripts="esbuild scripts/migrar.ts scripts/criar-usuario.ts --bundle --platform=node --format=esm --outdir=dist --out-extension:.js=.mjs --external:@node-rs/argon2 --banner:js=\"import { createRequire } from 'module'; const require = createRequire(import.meta.url);\""
npm run build:scripts
ls dist
```

Esperado: `criar-usuario.mjs` e `migrar.mjs`.

- [ ] **Passo 2: Dockerfile**

`Dockerfile`:

```dockerfile
FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build && npm run build:scripts

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN groupadd --system app && useradd --system --gid app app
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/dist ./dist
# Módulo nativo do argon2: garante a versão da plataforma da imagem.
COPY --from=build /app/node_modules/@node-rs ./node_modules/@node-rs
USER app
EXPOSE 3000
CMD ["sh", "-c", "node dist/migrar.mjs && node server.js"]
```

`.dockerignore`:

```
node_modules
.next
dist
.git
.env
.env.*
!.env.producao.example
.ml-tokens.json
.ml-pkce.json
tests
test-results
playwright-report
```

- [ ] **Passo 3: Compose de produção e Caddy**

`docker-compose.prod.yml`:

```yaml
services:
  caddy:
    image: caddy:2
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    environment:
      DOMINIO: ${DOMINIO}
    volumes:
      - ./docker/caddy/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - web

  web:
    build: .
    restart: unless-stopped
    env_file: .env.producao
    depends_on:
      postgres:
        condition: service_healthy

  postgres:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: devolucoes
      POSTGRES_USER: devolucoes
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U devolucoes -d devolucoes"]
      interval: 5s
      timeout: 3s
      retries: 10

volumes:
  pgdata:
  caddy_data:
  caddy_config:
```

`docker/caddy/Caddyfile`:

```
{$DOMINIO} {
	encode gzip
	reverse_proxy web:3000
}
```

`.env.producao.example`:

```
# Copie para .env.producao na VPS e troque os valores. Nunca coloque o .env.producao no git.
DOMINIO=devolucoes.suaempresa.com.br
POSTGRES_PASSWORD=troque-por-uma-senha-longa
DATABASE_URL=postgres://devolucoes:troque-por-uma-senha-longa@postgres:5432/devolucoes
# client_id do app do ML: com ele, avisos de outros apps são ignorados.
ML_CLIENT_ID=
```

- [ ] **Passo 4: Validar o compose (o teste completo é feito na VPS)**

Este PC não roda containers (veja os Pré-requisitos). A imagem é construída e testada direto na VPS, na Tarefa 12, Passo 2. Aqui, só confira que o arquivo do compose não tem erro. O cliente `docker` faz essa checagem mesmo sem o motor:

```bash
docker compose --env-file .env.producao.example -f docker-compose.prod.yml config --quiet && echo "compose ok"
```

Esperado: `compose ok`. Confira também o servidor de produção do Next no próprio PC, já com os scripts empacotados:

```bash
npm run build && npm run build:scripts
node --env-file=.env dist/migrar.mjs
```

Esperado: "Migrações aplicadas." (as migrações já estavam aplicadas, então o comando não muda nada).

- [ ] **Passo 5: Script de deploy**

`scripts/deploy.sh`:

```sh
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
```

- [ ] **Passo 6: Guia de implantação**

`docs/operacao/deploy-vps.md`:

````markdown
# Implantação na VPS

## O que é preciso
- VPS com Ubuntu 24.04: mínimo 2 vCPU, 4 GB de RAM e 200 GB de disco. Recomendado: 4 vCPU e 8 GB.
- Um subdomínio (ex.: `devolucoes.suaempresa.com.br`) com registro **A** apontando para o IP da VPS.
- Acesso SSH à VPS.

## Primeira vez
1. Instale o Docker e libere o firewall:
   ```sh
   curl -fsSL https://get.docker.com | sh
   sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw --force enable
   ```
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
4. Suba tudo:
   ```sh
   docker compose --env-file .env.producao -f docker-compose.prod.yml up -d --build
   ```
5. Confira em `https://SEU-DOMINIO/api/saude`. Deve aparecer `{"status":"ok","banco":"ok"}`.
6. Crie o primeiro Gestor:
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
````

- [ ] **Passo 7: README**

`README.md` (substitui todo o conteúdo):

````markdown
# Gestão de Devoluções

Sistema de gestão de devoluções dos marketplaces (Mercado Livre, Amazon, Shopee, Magalu, TikTok Shop e Shein).

- Design: [docs/superpowers/specs/2026-11-11-gestao-devolucoes-design.md](docs/superpowers/specs/2026-11-11-gestao-devolucoes-design.md)
- Planos: [docs/superpowers/plans/](docs/superpowers/plans/)
- Implantação: [docs/operacao/deploy-vps.md](docs/operacao/deploy-vps.md)

## Rodar no seu computador
Pré-requisitos:
- Node 24.
- PostgreSQL 17 com o usuário `devolucoes` (senha `devolucoes`), dono dos bancos `devolucoes` e `devolucoes_test`.

```sh
cp .env.example .env
npm install
npm run db:migrar
npm run usuario:criar -- --nome "Seu Nome" --email voce@empresa.com --perfil GESTOR
npm run dev                   # http://localhost:3000
```

## Testes
| Comando | O que roda |
|---|---|
| `npm test` | Regras e componentes (sem banco) |
| `npm run test:int` | Integração com o banco de testes |
| `npm run test:e2e` | Navegador de ponta a ponta (login, abas, permissões) |
| `npm run typecheck` / `npm run lint` | Tipos e estilo |

## Teste real do Mercado Livre
1. Preencha `ML_CLIENT_ID`, `ML_CLIENT_SECRET` e `ML_REDIRECT_URI` no `.env`.
2. `npm run ml:autorizar` e abra o link com a **conta principal** do ML.
3. `npm run ml:trocar-codigo -- <code>`
4. `npm run ml:spike`: grava as respostas sem dados pessoais em `tests/fixtures/ml/`.
````

- [ ] **Passo 8: Verificar e commit**

Rode: `npm test && npm run test:int && npm run typecheck && npm run lint && npm run build`. Esperado: tudo sem erro.

```bash
git add -A
git update-index --chmod=+x scripts/deploy.sh
git status --short   # confira que .env e .env.producao NÃO aparecem
git commit -m "feat: imagem de produção, Caddy com HTTPS, script de deploy e documentação" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

### Tarefa 12: Implantação na VPS e teste real do Mercado Livre (com o usuário)

Esta tarefa depende de acessos que só o usuário tem. Execute junto com ele, passo a passo, e **não invente resultados**: anote só o que for observado.

**Arquivos:**
- Criar: `tests/fixtures/ml/*.json` (gerados pelo `ml:spike`)
- Modificar: `docs/superpowers/specs/2026-11-11-gestao-devolucoes-design.md` (§7.6, com os resultados)

- [ ] **Passo 1: Receber os acessos**

Peça ao usuário:
- o IP da VPS e o usuário SSH
- o subdomínio, já apontando para o IP. Confira com `nslookup <subdominio>`.

- [ ] **Passo 2: Implantar**

Siga [docs/operacao/deploy-vps.md](../../operacao/deploy-vps.md), seção "Primeira vez", até o passo 6.
Critério: `https://<subdominio>/api/saude` responde `{"status":"ok","banco":"ok"}` e o Gestor consegue entrar e ver o quadro. **(Primeira metade do critério de pronto da Fase 0.)**

- [ ] **Passo 3: Configurar o app no ML Developers (o usuário faz, você orienta)**

- **URL de retorno (redirect URI):** `https://<subdominio>/api/ml/retorno`
- **URL de notificações:** `https://<subdominio>/api/ml/notificacoes`
- **Tópicos:** `post_purchase` (sub-tópicos `claims` e `claims_actions`)
- **Permissões:** "Vendas e envios", "Comunicação pré e pós-venda" e "Faturamento", em leitura e escrita (spec §7.1)

Depois:
- Coloque o `ML_CLIENT_ID` no `.env.producao` da VPS e rode o deploy de novo.
- No `.env` local, preencha `ML_CLIENT_ID`, `ML_CLIENT_SECRET` e `ML_REDIRECT_URI` (o mesmo endereço de retorno).

- [ ] **Passo 4: Rodar o teste real**

```bash
npm run ml:autorizar          # o usuário abre o link com a conta PRINCIPAL e autoriza
npm run ml:trocar-codigo -- <code-copiado-da-barra-de-endereço>
npm run ml:spike
```

Esperado: uma tabela com cada chamada e o status dela, e arquivos em `tests/fixtures/ml/`.
- Se a troca do código falhar com erro de PKCE, rode de novo com `ML_USAR_PKCE=true` no `.env`.
- Se não houver devoluções nos últimos 60 dias, anote isso e repita quando houver.

- [ ] **Passo 5: Conferir que não há dados pessoais**

```bash
grep -rniE '"(first_name|last_name|email|doc_number|street_name|zip_code|receiver_name)": "[^[]' tests/fixtures/ml/ || echo "ok: nenhum dado pessoal encontrado"
```

Esperado: `ok: nenhum dado pessoal encontrado`.

Abra também 2 ou 3 arquivos e procure nomes, CPF, telefones ou endereços. Se aparecer algum, acrescente a chave em `CHAVES_PESSOAIS` (`src/lib/redigir.ts`), com um caso novo em `redigir.test.ts`, e rode o `ml:spike` de novo.

- [ ] **Passo 6: Medir os avisos do ML**

```bash
curl -s -o /dev/null -w '%{http_code} %{time_total}\n' -X POST https://<subdominio>/api/ml/notificacoes \
  -H 'content-type: application/json' -d '{"topic":"teste"}'
```

Esperado: `200` com tempo **abaixo de 0.5**. Quando houver movimento em alguma reclamação, confira se o aviso real chegou:

```bash
docker compose --env-file .env.producao -f docker-compose.prod.yml exec postgres \
  psql -U devolucoes -d devolucoes -c "select id, topico, recurso, recebida_em from notificacoes_recebidas order by id desc limit 10"
```

- [ ] **Passo 7: Registrar os resultados na spec**

Em `docs/superpowers/specs/2026-11-11-gestao-devolucoes-design.md`, logo abaixo da lista do §7.6, acrescente uma subseção "Resultados do teste (AAAA-MM-DD)". Para cada um dos 5 pontos, escreva o que foi **observado**, citando o arquivo em `tests/fixtures/ml/` que comprova:
- se `/shipments/{id}` funcionou para o envio de devolução, e quais campos de data e transportadora vieram
- qual variante da NF respondeu, se alguma
- se o tópico `shipments` disparou
- o tempo de resposta do aviso
- o formato real de `type` e das quantidades

Ajuste as seções §7.2, §7.3 ou §7.5 se o resultado contrariar o que está escrito.

- [ ] **Passo 8: Commit**

```bash
git add tests/fixtures/ml docs/superpowers/specs/2026-11-11-gestao-devolucoes-design.md
git commit -m "docs: resultados do teste real da API do Mercado Livre" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

**Fase 0 concluída** quando:
- o login funciona no subdomínio, com HTTPS;
- as respostas reais do ML estão gravadas, sem dados pessoais;
- os resultados estão registrados na spec.
