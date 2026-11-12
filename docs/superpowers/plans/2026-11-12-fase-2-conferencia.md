# Fase 2 (Conferência no celular): Plano de Implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar este plano tarefa por tarefa. Os passos usam checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** conferir cada devolução no celular, na bancada: Fotos 1 a 4, Vídeo de Prova, leitura do código de barras, destino de cada unidade (Estoque Bom, Estoque Problema ou ausente) e conclusão; com upload que retoma (tus), fila offline no aparelho (IndexedDB), compressão do vídeo (ffmpeg), carimbo nas fotos (sharp), armazenamento em disco ou S3 (B2/R2) e links temporários. O critério de pronto da spec §14 é: "Conferência completa no celular, com o vídeo comprimido".

**Arquitetura:**
- **Parte A (no `main`)** é a fundação compartilhada do contrato (§2, P2): migração `0006_fundacao`, vocabulário, transições dos itens, rótulos do histórico, fila pg-boss e worker, armazenamento com links temporários, tipos dos conectores, `lerConfiguracao`, variáveis de ambiente, esqueletos de tela, falsos dos testes e o serviço `worker` no Docker. Ela é mergeada antes de criar as worktrees das Fases 2, 3 e 4.
- **Parte B (worktree `fase-2-conferencia`)** é a conferência: regras no servidor (`src/modules/conferencia/`), recepção dos arquivos (`src/modules/midia/`), tarefas do worker (`src/worker/manipuladores/midia.ts`), telas do celular (`src/components/conferencia/`, `src/components/midia/`) e o modo offline.
- Toda mudança de status passa por `exigirTransicao` (devolução) ou `exigirTransicaoItem` (item) e grava um evento no histórico. A trava da conferência (`conferente_id`) é conferida no servidor em toda gravação da bancada.
- Os serviços externos ficam atrás de interfaces (`ArmazenamentoArquivos`, `Fila`, `MarketplaceConnector`). Os testes de integração usam os falsos em memória; o e2e roda o servidor e o worker de verdade, com disco local.

**Tecnologias:** Next.js 16.4.6 (App Router), React 19.3, TypeScript strict, Tailwind v4, Drizzle ORM 0.45 + postgres.js, zod 4, Vitest 5, Testing Library, Playwright. Novas (versão exata): `pg-boss@12.38.2` (Parte A); `@tus/server@2.4.6`, `@tus/file-store@2.1.1`, `tus-js-client@4.3.1`, `idb-keyval@6.3.0`, `sharp@0.35.5`, `@aws-sdk/client-s3@3.1167.0`, `@aws-sdk/s3-request-presigner@3.1167.0` (Parte B). Fora do npm: ffmpeg (Windows: `winget install Gyan.FFmpeg`; imagem: `apt-get install ffmpeg`) e `fonts-dejavu-core` na imagem.

**Spec:** [docs/superpowers/specs/2026-11-11-gestao-devolucoes-design.md](../specs/2026-11-11-gestao-devolucoes-design.md). Leia §3, §4.3, §5.1 a §5.3, §6.0, §6.2, §6.3, §6.8, §6.9, §9, §10, §11, §12 e §13 antes de começar.

**Contrato (obrigatório):** [2026-11-12-contrato-fases-2-6.md](2026-11-12-contrato-fases-2-6.md). Nomes de tabela, coluna, enum, função, tarefa e arquivo seguem o contrato ao pé da letra. **Pesquisa:** [docs/pesquisas/fase-2-midia.md](../../pesquisas/fase-2-midia.md).

## Restrições globais

**Ambiente e ferramentas**
- Node **24** e **npm**. TypeScript em modo `strict`. Windows com Git Bash; o caminho do projeto tem espaço e "ç": **sempre use aspas**.
- Next.js **16.4.6** com mudanças em relação ao que você conhece (veja `AGENTS.md` e `node_modules/next/dist/docs/`):
  - `params` e `searchParams` são **Promise**. `redirect()` lança exceção: chame **fora** do `try/catch`.
  - Um arquivo com `'use server'` só exporta **funções async** (exportar `type` pode).
  - Route handlers aceitam `GET`, `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE` e `OPTIONS` (`03-file-conventions/route.md`).
  - O limite de 1 MB das Server Actions não vale para route handlers: **arquivos nunca passam por Server Action** (só o pequeno pedido de registro do envio).
- Banco de desenvolvimento: **PostgreSQL 17 nativo** (sem Docker no PC). `npm run db:gerar` gera a migração; `npm run db:migrar` aplica no banco do `.env`; `npm run test:int` migra o banco de testes sozinho.
- Os arquivos de `src/db/schema/` e **tudo o que eles importam** (os `dominio.ts`) usam **imports relativos**, nunca `@/`.
- Código que roda no **worker** (`src/worker/**` e tudo o que ele importa) **não** importa `server-only`, `next/*`, `@/db` (o `index.ts`) nem `@/modules/auth/servidor`: o worker é Node puro, empacotado com esbuild.
- Componentes de cliente (`'use client'`) só importam **valores** de módulos puros (`dominio.ts`, `regras.ts`); de módulos do servidor, só `import type`.
- Bibliotecas novas com **versão exata** (`npm install --save-exact pacote@versão`) e publicadas há mais de 2 semanas (exceção: `pg-boss@12.38.2` e `@aws-sdk/*@3.1167.0`, fixadas pelo contrato).

**Produto e textos**
- Interface só em **português do Brasil**. Nomes **exatamente** como no PDF e na spec: "Foto 1", "Foto 2", "Foto 3", "Foto 4", "Vídeo de Prova", "Estoque Bom", "Estoque Problema", e as etapas de `ETAPAS` (`src/modules/devolucoes/etapas.ts`), como "Em Conferência / Triagem & Registro de Evidências".
- O que vai além do PDF/spec está marcado **(extra)** neste plano.
- Sem dados de demonstração. Os testes criam o que precisam com as fábricas.

**Mobile-first (exigência do usuário: "esse sistema é focado para celular então ele tem que ficar perfeito para o usuário final")**
- Toda tela nasce em **390×844** e depois cresce para o computador (`md:`). **Sem rolagem lateral** da página.
- Listas são **cartões**. Formulários em **uma coluna**, com o botão principal num **rodapé fixo** (`acima-barra sticky`).
- Áreas de toque com **no mínimo 44 px** (`min-h-11`); os botões de captura têm **56 px** (`min-h-14`), largura total e ícone. **Nada depende de passar o mouse.** Contraste de texto **≥ 4,5:1** (use as cores de `globals.css`).
- Erros aparecem numa caixa com `role="alert"` que **recebe o foco** e a rolagem. Envio de arquivo mostra **progresso** (`role="progressbar"` com `aria-valuenow`).
- Elementos reais: `<button>`, `<a>`/`<Link>`, `<label>` ligado ao `<input>`; `<fieldset>`/`<legend>` nos grupos de opções.
- **Captura:** `<input type="file" accept="image/*" capture="environment">` (câmera nativa) para as fotos; para o Vídeo de Prova, dois controles: "Gravar Vídeo de Prova" (com `capture`) e "Escolher arquivo de vídeo" (sem). `getUserMedia` só no leitor de código de barras (pesquisa §1).

**Segurança e regras**
- **Permissão checada no servidor** em toda página, rota e Server Action (`exigirPermissao` em páginas e ações; `validarSessao` + `pode` nas rotas do tus). Ações: `operar_devolucoes` (Operador e Gestor) confere e envia evidências; `administrar` (Gestor) libera a trava e muda "Conferência e mídias"; `ver_listas` (todos) vê o detalhe e abre os links das mídias.
- Mídia **nunca é pública**: só por link temporário de **10 minutos** (spec §9), com sessão exigida no modo disco.
- O nome enviado pelo celular nunca vira caminho de arquivo: as chaves são `evidencias/{devolucaoId}/{evidenciaId}.{jpg|mp4}` (contrato §5.2). O ffmpeg roda com `spawn` e argumentos em lista, **sem shell**.
- Componentes React são puros: **não chame `new Date()`, `Date.now()` nem `Math.random()` durante a renderização**; também não chame `setState` direto no corpo de um efeito (as regras de lint do React acusam).

**Testes e commits**
- TDD: escreva o teste, veja falhar, implemente, veja passar.
  - Unitário (`npm test`): `src/**/*.test.{ts,tsx}`. Componentes de cliente com `// @vitest-environment jsdom` na primeira linha.
  - Integração (`npm run test:int`): `src/**/*.int.test.ts`. O `tests/setup/int-setup.ts` (Tarefa 7) instala os falsos em todo teste: fila em memória, armazenamento em memória e conectores `null`.
  - Ponta a ponta (`npm run test:e2e`): `tests/e2e/*.spec.ts`, nos **dois projetos** (`computador` e `celular` 390×844). O e2e sobe o worker sozinho (Tarefa 5). Pare o `npm run dev` antes.
  - Testes que chamam o ffmpeg são **pulados** quando `ffmpeg -version` falha.
- Toda mensagem de commit termina com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. **Nunca rode `git push`.**

## Decisões que a spec e o contrato não fixaram (registradas aqui para o usuário poder vetar)

1. **Servidor do e2e e os falsos.** O contrato manda o `lerEnv` recusar `falso` em produção, mas o e2e roda um build de produção (`next start`) com os falsos. A "produção de verdade" é `NODE_ENV=production` **sem** `PORTA_E2E` (essa variável só existe no PC de desenvolvimento, no `.env` e no `webServer` do Playwright; na VPS ela não existe).
2. **`chaveUnica` da fila** vira o `id` do job no pg-boss, calculado a partir de (tarefa, chave). O pg-boss ignora o segundo envio com o mesmo id (`ON CONFLICT DO NOTHING`), sem depender da política da fila.
3. **Registro do envio separado do tus.** O tus só recebe os bytes. Quando o upload termina, o celular chama a Server Action `registrarEnvioAcao(uploadId)`, que confere tudo, calcula o SHA-256 e grava a evidência (idempotente por `id_cliente`). Assim, uma queda depois do último pedaço não perde o registro: o celular só tira o arquivo da fila depois que o servidor confirma.
4. **`caminho_temporario`** guarda o caminho absoluto do arquivo do tus (em `MIDIA_TMP_DIR/tus`). Web e worker enxergam o mesmo caminho (no Docker, o volume `/data` é o mesmo).
5. **Fotos aceitas no servidor:** JPEG, PNG ou WebP até 15 MB (o celular já manda JPEG de ~1600 px). **Vídeo:** qualquer `video/*` até 300 MB (pesquisa §1.3). A tela orienta "grave em 1080p, até 2 minutos".
6. **Carimbo (extra, spec §9):** faixa escura embaixo com "dd/mm/aaaa hh:mm · DEV-000123 · Nome do usuário", na hora de Brasília em que o servidor recebeu o arquivo. A foto é limitada a 1600 px no maior lado e sai sem EXIF (sem GPS).
7. **Vídeo:** H.264 High, `-preset veryfast -crf 28 -maxrate 1500k`, AAC 96 kbps, `+faststart`; o lado menor fica em no máximo 720 px, sem ampliar vídeo menor. A saída é conferida com o ffprobe (H.264 e duração dentro de 5% ou 1 s) antes de apagar o original.
8. **Falha no processamento:** na 5ª tentativa a evidência fica `FALHOU` (evento `evidencia_falhou`) e conta como **faltando**: o operador tira de novo. Antes disso ela volta a `RECEBIDA` e a fila tenta outra vez.
9. **Produto recebido sem leitura de EAN:** na conclusão, a unidade que não é ausente, sem `ean_lido` e sem `produto_recebido_id`, recebe o produto esperado (contrato §5.6: "nenhum EAN foi lido e o operador confirmou"; concluir é a confirmação). O botão "Não dá para ler: o produto é o esperado" faz o mesmo na hora.
10. **Comparação do EAN** ignora zeros à esquerda (UPC-A de 12 dígitos lido como EAN-13 com "0" na frente). Quando o EAN lido difere do esperado, a tela **sugere** Estoque Problema com motivo Divergente (spec §6.3); a pessoa pode trocar.
11. **Fotos extras:** o servidor aceita o tipo `EXTRA`, mas a tela da Fase 2 não oferece o botão (a spec não tem passo para elas).
12. **Desistir e liberar a trava** limpam `conferente_id` e `conferencia_iniciada_em` e mantêm tudo o que já foi preenchido (contrato D7). Só o Gestor libera a trava de outra pessoa.
13. **"Conferir pacote" (extra):** nas etapas 2 e 3, um botão abre uma tela que lê o rastreio (câmera ou digitação) ou o código DEV e já abre a conferência daquele pacote.
14. **Modo offline:** o service worker guarda os arquivos estáticos e a página "Sem conexão"; navegação continua indo à rede primeiro. A tela da conferência, já aberta, continua funcionando sem internet: as fotos e o vídeo esperam no IndexedDB, e os dados das unidades ficam na tela e são salvos ao continuar ou ao concluir. **Concluir exige internet.**
15. **Atualização da tela:** depois de cada envio confirmado, e a cada 10 s enquanto houver mídia processando, a tela pede os dados de novo ao servidor (só com `navigator.onLine`).
16. **Range nos links do disco (extra):** a rota `/api/arquivos` responde `206` a pedidos `Range` (o `<video>` precisa disso para avançar e voltar).

## Mapa de arquivos

```
src/
  lib/env.ts                                      todas as variáveis do contrato (A1)
  db/schema/devolucoes.ts                         + colunas da conferência (A2)
  db/schema/evidencias.ts, configuracoes.ts       tabelas novas (A2)
  db/schema/mercado-livre.ts, fiscal.ts, lotes.ts vazios para as Fases 3 a 5 (A2)
  modules/
    devolucoes/dominio.ts                         + DESTINOS_ITEM, MOTIVOS_ITEM (A2)
    devolucoes/transicoes-item.ts                 transições dos itens, completas (A3)
    devolucoes/busca.ts                           + ean_lido no filtro "Código de Barras" (A3)
    historico/eventos.ts, historico/rotulos/*.ts  ROTULO_ACAO por fase (A3)
    configuracoes/dominio.ts, ler.ts              vocabulário e lerConfiguracao (A2)
    fila/tarefas.ts, fila.ts                      tarefas, pg-boss, FilaMemoria (A4)
    saude/saude.ts                                + fila (A5)
    midia/dominio.ts                              vocabulário das evidências (A2) + limites (B)
    midia/armazenamento*.ts, chaves.ts, links.ts, range.ts, erros.ts   (A6)
    midia/armazenamento-s3.ts                     B2/R2 (B)
    midia/recepcao.ts, tus.ts, registro-envio.ts, acoes.ts, hash.ts, temporarios.ts   upload (B)
    midia/carimbo.ts, ffmpeg.ts, processamento.ts, limpeza.ts   worker (B)
    midia/links-evidencias.ts, configuracao.ts    (B)
    conferencia/erros.ts, trava.ts, leitura.ts, regras.ts, itens.ts, concluir.ts, localizar.ts   (B)
  conectores/marketplace/tipos.ts, registro.ts    (A7)
  worker/tipos.ts, index.ts, manipuladores/*.ts   (A5; midia.ts preenchido na B)
  components/midia/                               compressão, fila offline, tus (B)
  components/conferencia/                         peças e assistente da conferência (B)
  components/pwa/RegistrarServiceWorker.tsx       (B)
  app/api/arquivos/route.ts                       links temporários do disco (A6)
  app/api/midia/[[...slug]]/route.ts              tus (B)
  app/offline/page.tsx                            "Sem conexão" (B)
  app/(app)/fluxo/devolucoes/[codigo]/secoes/     esqueletos (A8); SecaoConferencia (B)
  app/(app)/fluxo/devolucoes/[codigo]/conferencia/   assistente (B)
  app/(app)/fluxo/conferencia/                    "Conferir pacote" (B, extra)
  app/(app)/configuracoes/{conferencia,mercado-livre,fiscal,falhas}/   (A8; conferencia na B)
public/sw.js                                      service worker (B)
scripts/worker.ts                                 ponto de entrada do worker (A5)
tests/
  setup/int-setup.ts                              falsos dos testes de integração (A7)
  e2e/global-setup.ts, dados.ts                   + worker e ambiente do e2e (A5)
  helpers/fabricas-conferencia.ts, e2e/apoio-conferencia.ts   (B)
Dockerfile, docker-compose.prod.yml, docker/nginx/devolucoes.conf, next.config.ts
```

---

# Parte A (main): fundação compartilhada

> Execute no **`main`**, na pasta do projeto (`/c/Users/idmpc/Dvoluções Markt`), **antes** de criar as worktrees. Cada tarefa é pequena e fecha com testes verdes e um commit. A Parte A termina na seção "Fim da Parte A".

### Tarefa 1: Variáveis de ambiente, `.gitignore` e `engines`

**Arquivos:**
- Modificar (substituir o conteúdo): `src/lib/env.ts`, `src/lib/env.test.ts`, `.env.example`, `.env.producao.example`
- Modificar (acrescentar no final): `.gitignore`
- Modificar: `package.json` (`engines`)

**Interfaces:**
- Consome: nada novo.
- Produz:
  - `lerEnv(fonte?: Record<string, string | undefined>): Env`, com todas as variáveis do contrato §3: `DATABASE_URL`, `NODE_ENV`, `PORTA_E2E?: number`, `ARMAZENAMENTO: 'disco' | 's3'`, `MIDIA_DIR` (padrão `.dados/midia`), `MIDIA_TMP_DIR` (padrão `.dados/tmp`), `SEGREDO_LINKS: string` (no desenvolvimento, `SEGREDO_LINKS_DESENVOLVIMENTO`), `S3_ENDPOINT?`, `S3_REGIAO?`, `S3_BUCKET?`, `S3_CHAVE_ID?`, `S3_CHAVE_SECRETA?`, `FFMPEG_PATH` (padrão `ffmpeg`), `FFPROBE_PATH` (padrão `ffprobe`), `ML_CONECTOR: 'api' | 'falso'` (padrão `api`), `ML_CLIENT_ID?`, `ML_CLIENT_SECRET?`, `ML_REDIRECT_URI?`, `ML_USAR_PKCE: 'true' | 'false'`, `CHAVE_CRIPTOGRAFIA?`, `EMISSOR_NFE: 'focus' | 'falso'` (padrão `focus`), `FOCUS_TOKEN_HOMOLOGACAO?`, `FOCUS_TOKEN_PRODUCAO?`
  - `type Env`, `SEGREDO_LINKS_DESENVOLVIMENTO`
  - Regras: em produção de verdade (`NODE_ENV=production` sem `PORTA_E2E`) recusa `ML_CONECTOR=falso`, `EMISSOR_NFE=falso` e `SEGREDO_LINKS` com menos de 32 caracteres; `ARMAZENAMENTO=s3` exige as cinco `S3_*`; `CHAVE_CRIPTOGRAFIA`, quando existe, tem 32 bytes em base64.

- [ ] **Passo 1: Escrever o teste que falha**

`src/lib/env.test.ts` (substitua o conteúdo):

```ts
import { describe, expect, it } from 'vitest';
import { lerEnv, SEGREDO_LINKS_DESENVOLVIMENTO } from './env';

const BASE = { DATABASE_URL: 'postgres://u:s@h:5432/b' };

describe('lerEnv', () => {
  it('exige DATABASE_URL', () => {
    expect(() => lerEnv({})).toThrow(/DATABASE_URL/);
  });

  it('usa os padrões de desenvolvimento', () => {
    expect(lerEnv(BASE)).toMatchObject({
      DATABASE_URL: 'postgres://u:s@h:5432/b',
      NODE_ENV: 'development',
      ARMAZENAMENTO: 'disco',
      MIDIA_DIR: '.dados/midia',
      MIDIA_TMP_DIR: '.dados/tmp',
      SEGREDO_LINKS: SEGREDO_LINKS_DESENVOLVIMENTO,
      FFMPEG_PATH: 'ffmpeg',
      FFPROBE_PATH: 'ffprobe',
      ML_CONECTOR: 'api',
      ML_USAR_PKCE: 'false',
      EMISSOR_NFE: 'focus',
    });
  });

  it('"CHAVE=" vazio no .env vale como ausente', () => {
    const env = lerEnv({ ...BASE, MIDIA_DIR: '', ARMAZENAMENTO: '', ML_CLIENT_ID: '', PORTA_E2E: '' });
    expect(env.MIDIA_DIR).toBe('.dados/midia');
    expect(env.ARMAZENAMENTO).toBe('disco');
    expect(env.ML_CLIENT_ID).toBeUndefined();
    expect(env.PORTA_E2E).toBeUndefined();
  });

  it('em produção recusa os falsos e exige SEGREDO_LINKS com 32 caracteres', () => {
    expect(() => lerEnv({ ...BASE, NODE_ENV: 'production', ML_CONECTOR: 'falso', EMISSOR_NFE: 'falso' })).toThrow(
      /ML_CONECTOR.*EMISSOR_NFE.*SEGREDO_LINKS/,
    );
    const env = lerEnv({ ...BASE, NODE_ENV: 'production', SEGREDO_LINKS: 'x'.repeat(32) });
    expect(env.ML_CONECTOR).toBe('api');
    expect(env.SEGREDO_LINKS).toBe('x'.repeat(32));
  });

  it('o servidor do e2e (build de produção com PORTA_E2E) aceita os falsos', () => {
    const env = lerEnv({ ...BASE, NODE_ENV: 'production', PORTA_E2E: '3100', ML_CONECTOR: 'falso', EMISSOR_NFE: 'falso' });
    expect(env.ML_CONECTOR).toBe('falso');
    expect(env.PORTA_E2E).toBe(3100);
  });

  it('ARMAZENAMENTO=s3 exige as cinco variáveis do S3', () => {
    expect(() => lerEnv({ ...BASE, ARMAZENAMENTO: 's3', S3_BUCKET: 'midias' })).toThrow(/S3_ENDPOINT.*S3_REGIAO.*S3_CHAVE_ID.*S3_CHAVE_SECRETA/);
  });

  it('CHAVE_CRIPTOGRAFIA precisa ter 32 bytes em base64', () => {
    expect(() => lerEnv({ ...BASE, CHAVE_CRIPTOGRAFIA: Buffer.alloc(16, 1).toString('base64') })).toThrow(/CHAVE_CRIPTOGRAFIA/);
    expect(lerEnv({ ...BASE, CHAVE_CRIPTOGRAFIA: Buffer.alloc(32, 1).toString('base64') }).CHAVE_CRIPTOGRAFIA).toBeDefined();
  });

  it('recusa valor fora da lista', () => {
    expect(() => lerEnv({ ...BASE, ARMAZENAMENTO: 'ftp' })).toThrow(/ARMAZENAMENTO/);
  });
});
```

Rode: `npm test -- src/lib/env.test.ts`
Esperado: FAIL (`SEGREDO_LINKS_DESENVOLVIMENTO` não existe e as variáveis novas não são lidas).

- [ ] **Passo 2: Implementar `lerEnv`**

`src/lib/env.ts` (substitua o conteúdo):

```ts
import { z } from 'zod';

/** "CHAVE=" vazio no .env vale como ausente: assim o padrão é usado. */
function vazioComoAusente(valor: unknown): unknown {
  return typeof valor === 'string' && valor.trim() === '' ? undefined : valor;
}
const opcional = () => z.preprocess(vazioComoAusente, z.string().optional());
const comPadrao = (padrao: string) => z.preprocess(vazioComoAusente, z.string().default(padrao));
function lista<const T extends readonly [string, ...string[]]>(valores: T, padrao: T[number]) {
  return z.preprocess(vazioComoAusente, z.enum(valores).default(padrao));
}

/** Só para desenvolvimento e testes. Em produção, SEGREDO_LINKS é obrigatório. */
export const SEGREDO_LINKS_DESENVOLVIMENTO = 'segredo-de-desenvolvimento-nao-usar-em-producao';

/** Todas as variáveis das Fases 2 a 4 (contrato §3). Variável nova só por emenda ao contrato. */
const esquema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatório'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /** Só existe no PC de desenvolvimento: marca o servidor do e2e (build de produção com os falsos). */
  PORTA_E2E: z.preprocess(vazioComoAusente, z.coerce.number().int().positive().optional()),
  // Mídia (Fase 2)
  ARMAZENAMENTO: lista(['disco', 's3'] as const, 'disco'),
  MIDIA_DIR: comPadrao('.dados/midia'),
  MIDIA_TMP_DIR: comPadrao('.dados/tmp'),
  SEGREDO_LINKS: opcional(),
  S3_ENDPOINT: opcional(),
  S3_REGIAO: opcional(),
  S3_BUCKET: opcional(),
  S3_CHAVE_ID: opcional(),
  S3_CHAVE_SECRETA: opcional(),
  FFMPEG_PATH: comPadrao('ffmpeg'),
  FFPROBE_PATH: comPadrao('ffprobe'),
  // Mercado Livre (Fase 3)
  ML_CONECTOR: lista(['api', 'falso'] as const, 'api'),
  ML_CLIENT_ID: opcional(),
  ML_CLIENT_SECRET: opcional(),
  ML_REDIRECT_URI: opcional(),
  ML_USAR_PKCE: lista(['true', 'false'] as const, 'false'),
  CHAVE_CRIPTOGRAFIA: opcional(),
  // Focus NFe (Fase 4)
  EMISSOR_NFE: lista(['focus', 'falso'] as const, 'focus'),
  FOCUS_TOKEN_HOMOLOGACAO: opcional(),
  FOCUS_TOKEN_PRODUCAO: opcional(),
});

type EnvLido = z.infer<typeof esquema>;
export type Env = Omit<EnvLido, 'SEGREDO_LINKS'> & { SEGREDO_LINKS: string };

const VARIAVEIS_S3 = ['S3_ENDPOINT', 'S3_REGIAO', 'S3_BUCKET', 'S3_CHAVE_ID', 'S3_CHAVE_SECRETA'] as const;

function problemas(e: EnvLido): string[] {
  const lista: string[] = [];
  const producaoDeVerdade = e.NODE_ENV === 'production' && e.PORTA_E2E === undefined;
  if (producaoDeVerdade) {
    if (e.ML_CONECTOR === 'falso') lista.push('ML_CONECTOR: "falso" não é aceito em produção');
    if (e.EMISSOR_NFE === 'falso') lista.push('EMISSOR_NFE: "falso" não é aceito em produção');
    if (!e.SEGREDO_LINKS || e.SEGREDO_LINKS.length < 32) {
      lista.push('SEGREDO_LINKS: obrigatório em produção, com 32 caracteres ou mais (gere com: openssl rand -hex 32)');
    }
  }
  if (e.ARMAZENAMENTO === 's3') {
    for (const nome of VARIAVEIS_S3) if (!e[nome]) lista.push(`${nome}: obrigatório com ARMAZENAMENTO=s3`);
  }
  if (e.CHAVE_CRIPTOGRAFIA && Buffer.from(e.CHAVE_CRIPTOGRAFIA, 'base64').length !== 32) {
    lista.push('CHAVE_CRIPTOGRAFIA: precisa ter 32 bytes em base64 (gere com: openssl rand -base64 32)');
  }
  return lista;
}

export function lerEnv(fonte: Record<string, string | undefined> = process.env): Env {
  const resultado = esquema.safeParse(fonte);
  if (!resultado.success) {
    const detalhes = resultado.error.issues.map((i) => `${i.path.join('.') || 'env'}: ${i.message}`).join('; ');
    throw new Error(`Variáveis de ambiente inválidas: ${detalhes}`);
  }
  const lista = problemas(resultado.data);
  if (lista.length > 0) throw new Error(`Variáveis de ambiente inválidas: ${lista.join('; ')}`);
  return { ...resultado.data, SEGREDO_LINKS: resultado.data.SEGREDO_LINKS ?? SEGREDO_LINKS_DESENVOLVIMENTO };
}
```

Rode: `npm test -- src/lib/env.test.ts`
Esperado: PASS (8 testes).

- [ ] **Passo 3: Arquivos de exemplo, `.gitignore` e `engines`**

`.env.example` (substitua o conteúdo):

```
# Banco local (PostgreSQL 17 instalado no Windows)
DATABASE_URL=postgres://devolucoes:devolucoes@localhost:5432/devolucoes
DATABASE_URL_TEST=postgres://devolucoes:devolucoes@localhost:5432/devolucoes_test
# Porta do servidor do e2e (3100 no main; cada worktree de fase usa a sua). Só existe no PC de desenvolvimento.
PORTA_E2E=3100

# Mídia (Fase 2). No PC, fotos e vídeos ficam em .dados/ (fora do git).
ARMAZENAMENTO=disco
MIDIA_DIR=.dados/midia
MIDIA_TMP_DIR=.dados/tmp
# Assina os links temporários das mídias (10 min). Em produção: openssl rand -hex 32
SEGREDO_LINKS=segredo-de-desenvolvimento-nao-usar-em-producao
# Só com ARMAZENAMENTO=s3 (Backblaze B2 ou Cloudflare R2)
S3_ENDPOINT=
S3_REGIAO=
S3_BUCKET=
S3_CHAVE_ID=
S3_CHAVE_SECRETA=
# ffmpeg no Windows: winget install Gyan.FFmpeg (depois abra um terminal novo)
FFMPEG_PATH=ffmpeg
FFPROBE_PATH=ffprobe

# Mercado Livre (Fase 3). No PC usamos o conector falso.
ML_CONECTOR=falso
ML_CLIENT_ID=
ML_CLIENT_SECRET=
ML_REDIRECT_URI=
ML_USAR_PKCE=false
# 32 bytes em base64 (openssl rand -base64 32): cifra os tokens do ML no banco
CHAVE_CRIPTOGRAFIA=

# Focus NFe (Fase 4). No PC usamos o emissor falso.
EMISSOR_NFE=falso
FOCUS_TOKEN_HOMOLOGACAO=
FOCUS_TOKEN_PRODUCAO=
```

`.env.producao.example` (substitua o conteúdo):

```
# Copie para .env.producao na VPS e troque os valores. Nunca coloque o .env.producao no git.
# Gere a senha com: openssl rand -hex 32 (só hexadecimal; use o mesmo valor nas duas linhas abaixo).
POSTGRES_PASSWORD=troque-por-uma-senha-hexadecimal
DATABASE_URL=postgres://devolucoes:troque-por-uma-senha-hexadecimal@postgres:5432/devolucoes
# Versão da imagem: "main" (a mais recente) ou o hash de um commit, para voltar a uma versão anterior.
IMAGEM_TAG=main

# Mídia. "disco" só para teste na bancada; o uso diário começa com o B2 (ARMAZENAMENTO=s3).
ARMAZENAMENTO=disco
MIDIA_DIR=/data/midia
MIDIA_TMP_DIR=/data/tmp
# Obrigatório. Gere com: openssl rand -hex 32
SEGREDO_LINKS=troque-por-64-caracteres-hexadecimais
S3_ENDPOINT=
S3_REGIAO=
S3_BUCKET=
S3_CHAVE_ID=
S3_CHAVE_SECRETA=

# Mercado Livre: client_id do app (com ele, avisos de outros apps são ignorados).
ML_CONECTOR=api
ML_CLIENT_ID=
ML_CLIENT_SECRET=
ML_REDIRECT_URI=
ML_USAR_PKCE=false
CHAVE_CRIPTOGRAFIA=

# Focus NFe
EMISSOR_NFE=focus
FOCUS_TOKEN_HOMOLOGACAO=
FOCUS_TOKEN_PRODUCAO=
```

Acrescente no **final** do `.gitignore`:

```
# Mídias locais (desenvolvimento) e do e2e
/.dados/
/.dados-e2e/
```

Copie para o seu `.env` as linhas novas do `.env.example` (de `ARMAZENAMENTO` em diante; mantenha os valores atuais de `DATABASE_URL`, `DATABASE_URL_TEST`, `PORTA_E2E` e `ML_*`).

```bash
cd "/c/Users/idmpc/Dvoluções Markt"
npm pkg set engines.node=">=24"
npm pkg get engines
```

Esperado: `{ "node": ">=24" }`.

- [ ] **Passo 4: Conferir o foco visível (pendência do contrato P2, item 11)**

```bash
cd "/c/Users/idmpc/Dvoluções Markt"
grep -n "focus-visible" src/app/globals.css
```

Esperado: a linha `:focus-visible {` já existe (feita na Fase 1). Nada a mudar.

- [ ] **Passo 5: Verificar e commitar**

```bash
cd "/c/Users/idmpc/Dvoluções Markt"
npm test && npm run typecheck && npm run lint
git add src/lib/env.ts src/lib/env.test.ts .env.example .env.producao.example .gitignore package.json
git commit -m "feat: variáveis de ambiente das Fases 2 a 4 (mídia, ML e Focus) e engines do Node" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Esperado: tudo verde.

---

### Tarefa 2: Vocabulário e modelo de dados (migração `0006_fundacao`) e `lerConfiguracao`

**Arquivos:**
- Modificar (acrescentar no final): `src/modules/devolucoes/dominio.ts`, `src/modules/devolucoes/dominio.test.ts`
- Criar: `src/modules/midia/dominio.ts`, `src/modules/midia/dominio.test.ts`
- Criar: `src/modules/configuracoes/dominio.ts`, `src/modules/configuracoes/ler.ts`, `src/modules/configuracoes/ler.int.test.ts`
- Modificar: `src/db/schema/devolucoes.ts`
- Criar: `src/db/schema/evidencias.ts`, `src/db/schema/configuracoes.ts`, `src/db/schema/mercado-livre.ts`, `src/db/schema/fiscal.ts`, `src/db/schema/lotes.ts`
- Modificar (substituir o conteúdo): `src/db/schema/index.ts`
- Gerado: `drizzle/0006_fundacao.sql` e `drizzle/meta/*`
- Testes: `src/db/fundacao.int.test.ts`

**Interfaces:**
- Consome: `devolucoes`, `itensDevolucao`, `produtos`, `usuarios` (Fase 1); `DbOuTx`.
- Produz:
  - em `devolucoes/dominio.ts`: `DESTINOS_ITEM`, `type DestinoItem`, `ROTULO_DESTINO` ("Estoque Bom", "Estoque Problema"), `MOTIVOS_ITEM`, `type MotivoItem`, `ROTULO_MOTIVO`
  - em `midia/dominio.ts`: `TIPOS_EVIDENCIA`, `type TipoEvidencia`, `ROTULO_EVIDENCIA` ("Foto 1" a "Foto 4", "Vídeo de Prova", "Extra"), `DESCRICAO_EVIDENCIA`, `EVIDENCIAS_DO_PACOTE`, `EVIDENCIAS_DO_ITEM`, `ehTipoEvidencia(t): t is TipoEvidencia`, `ehFoto(t: TipoEvidencia): boolean`, `SITUACOES_PROCESSAMENTO`, `type SituacaoProcessamento`, `ROTULO_SITUACAO_PROCESSAMENTO`
  - em `configuracoes/dominio.ts`: `VIDEO_OBRIGATORIO`, `type VideoObrigatorio`, `ROTULO_VIDEO_OBRIGATORIO`, `REGIMES_TRIBUTARIOS`, `type RegimeTributario`, `ROTULO_REGIME`, `AMBIENTES_NFE`, `type AmbienteNfe`, `ROTULO_AMBIENTE`, `MESES_RETENCAO_PADRAO = 12`
  - em `configuracoes/ler.ts`: `type Configuracao` (a linha de `configuracoes`), `CONFIGURACAO_PADRAO`, `lerConfiguracao(db: DbOuTx): Promise<Configuracao>`
  - schema: `destinoItemEnum`, `motivoItemEnum`; em `devolucoes`: `conferenteId`, `conferenciaIniciadaEm`, `conferidaEm`, `concluidaEm`; em `itensDevolucao`: `produtoRecebidoId`, `eanLido`, `loteFabricacao`, `validade`, `destino`, `motivo`, `observacao`; `tipoEvidenciaEnum`, `situacaoProcessamentoEnum`, `evidencias`; `videoObrigatorioEnum`, `regimeTributarioEnum`, `ambienteNfeEnum`, `configuracoes`

- [ ] **Passo 1: Escrever os testes do vocabulário que falham**

Acrescente no **final** de `src/modules/devolucoes/dominio.test.ts` (e acrescente `DESTINOS_ITEM, MOTIVOS_ITEM, ROTULO_DESTINO, ROTULO_MOTIVO` ao import de `./dominio`):

```ts
describe('vocabulário da conferência (contrato §4.5)', () => {
  it('destinos e motivos com os nomes da tela', () => {
    expect(DESTINOS_ITEM.map((d) => ROTULO_DESTINO[d])).toEqual(['Estoque Bom', 'Estoque Problema']);
    expect(MOTIVOS_ITEM.map((m) => ROTULO_MOTIVO[m])).toEqual([
      'Avariado',
      'Usado',
      'Divergente',
      'Incompleto',
      'Com defeito',
      'Ausente',
      'Outro',
    ]);
  });
});
```

`src/modules/midia/dominio.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  EVIDENCIAS_DO_ITEM,
  EVIDENCIAS_DO_PACOTE,
  ROTULO_EVIDENCIA,
  SITUACOES_PROCESSAMENTO,
  TIPOS_EVIDENCIA,
  ehFoto,
  ehTipoEvidencia,
} from './dominio';

describe('vocabulário das evidências (nomes do PDF)', () => {
  it('Fotos 1 a 4, Vídeo de Prova e Extra', () => {
    expect(TIPOS_EVIDENCIA.map((t) => ROTULO_EVIDENCIA[t])).toEqual(['Foto 1', 'Foto 2', 'Foto 3', 'Foto 4', 'Vídeo de Prova', 'Extra']);
  });

  it('Fotos 1 e 2 são do pacote; Fotos 3 e 4 são de cada unidade (spec §3)', () => {
    expect(EVIDENCIAS_DO_PACOTE).toEqual(['FOTO_1_ETIQUETA', 'FOTO_2_EMBALAGEM']);
    expect(EVIDENCIAS_DO_ITEM).toEqual(['FOTO_3_PRODUTO', 'FOTO_4_CODIGO_SERIAL']);
  });

  it('verificações', () => {
    expect(ehTipoEvidencia('VIDEO_PROVA')).toBe(true);
    expect(ehTipoEvidencia('FOTO_9')).toBe(false);
    expect(ehFoto('FOTO_4_CODIGO_SERIAL')).toBe(true);
    expect(ehFoto('VIDEO_PROVA')).toBe(false);
    expect(SITUACOES_PROCESSAMENTO).toEqual(['RECEBIDA', 'PROCESSANDO', 'PRONTA', 'FALHOU', 'APAGADA']);
  });
});
```

Rode: `npm test -- src/modules/devolucoes/dominio.test.ts src/modules/midia/dominio.test.ts`
Esperado: FAIL (as constantes não existem).

- [ ] **Passo 2: Implementar o vocabulário**

Acrescente no **final** de `src/modules/devolucoes/dominio.ts`:

```ts
/** Destino de cada unidade na conferência (spec §6.3). Ausente não tem destino: fica com o motivo AUSENTE. */
export const DESTINOS_ITEM = ['BOM', 'PROBLEMA'] as const;
export type DestinoItem = (typeof DESTINOS_ITEM)[number];
export const ROTULO_DESTINO: Record<DestinoItem, string> = { BOM: 'Estoque Bom', PROBLEMA: 'Estoque Problema' };

/** Motivos da spec §5.1 (ItemDevolucao.motivo). */
export const MOTIVOS_ITEM = ['AVARIADO', 'USADO', 'DIVERGENTE', 'INCOMPLETO', 'COM_DEFEITO', 'AUSENTE', 'OUTRO'] as const;
export type MotivoItem = (typeof MOTIVOS_ITEM)[number];
export const ROTULO_MOTIVO: Record<MotivoItem, string> = {
  AVARIADO: 'Avariado',
  USADO: 'Usado',
  DIVERGENTE: 'Divergente',
  INCOMPLETO: 'Incompleto',
  COM_DEFEITO: 'Com defeito',
  AUSENTE: 'Ausente',
  OUTRO: 'Outro',
};
```

`src/modules/midia/dominio.ts`:

```ts
/** Vocabulário das evidências (spec §5.1, §6.3 e §9). Sem imports com "@/": o drizzle-kit lê este arquivo pelo schema. */

export const TIPOS_EVIDENCIA = [
  'FOTO_1_ETIQUETA',
  'FOTO_2_EMBALAGEM',
  'FOTO_3_PRODUTO',
  'FOTO_4_CODIGO_SERIAL',
  'VIDEO_PROVA',
  'EXTRA',
] as const;
export type TipoEvidencia = (typeof TIPOS_EVIDENCIA)[number];

/** Os nomes do PDF. */
export const ROTULO_EVIDENCIA: Record<TipoEvidencia, string> = {
  FOTO_1_ETIQUETA: 'Foto 1',
  FOTO_2_EMBALAGEM: 'Foto 2',
  FOTO_3_PRODUTO: 'Foto 3',
  FOTO_4_CODIGO_SERIAL: 'Foto 4',
  VIDEO_PROVA: 'Vídeo de Prova',
  EXTRA: 'Extra',
};

/** O que cada evidência mostra (spec §6.3). */
export const DESCRICAO_EVIDENCIA: Record<TipoEvidencia, string> = {
  FOTO_1_ETIQUETA: 'Etiqueta de rastreio e declaração de conteúdo',
  FOTO_2_EMBALAGEM: 'Estado da embalagem externa',
  FOTO_3_PRODUTO: 'Produto fora da caixa (visão geral)',
  FOTO_4_CODIGO_SERIAL: 'Código de barras, nº de série (S/N) e lote/validade',
  VIDEO_PROVA: 'Vídeo contínuo do teste de funcionamento ou do defeito/avaria',
  EXTRA: 'Foto adicional',
};

/** Fotos 1 e 2 e o Vídeo de Prova são do pacote; Fotos 3 e 4 são de cada unidade (spec §3, "Evidências"). */
export const EVIDENCIAS_DO_PACOTE = ['FOTO_1_ETIQUETA', 'FOTO_2_EMBALAGEM'] as const;
export const EVIDENCIAS_DO_ITEM = ['FOTO_3_PRODUTO', 'FOTO_4_CODIGO_SERIAL'] as const;

export function ehTipoEvidencia(texto: string): texto is TipoEvidencia {
  return (TIPOS_EVIDENCIA as readonly string[]).includes(texto);
}

export function ehFoto(tipo: TipoEvidencia): boolean {
  return tipo !== 'VIDEO_PROVA';
}

export const SITUACOES_PROCESSAMENTO = ['RECEBIDA', 'PROCESSANDO', 'PRONTA', 'FALHOU', 'APAGADA'] as const;
export type SituacaoProcessamento = (typeof SITUACOES_PROCESSAMENTO)[number];
export const ROTULO_SITUACAO_PROCESSAMENTO: Record<SituacaoProcessamento, string> = {
  RECEBIDA: 'Recebida',
  PROCESSANDO: 'Processando',
  PRONTA: 'Pronta',
  FALHOU: 'Falhou',
  APAGADA: 'Apagada (prazo de guarda)',
};
```

`src/modules/configuracoes/dominio.ts`:

```ts
/** Vocabulário das Configurações (spec §5.1). Sem imports com "@/": o drizzle-kit lê este arquivo pelo schema. */

export const VIDEO_OBRIGATORIO = ['SEMPRE', 'SO_PROBLEMA'] as const;
export type VideoObrigatorio = (typeof VIDEO_OBRIGATORIO)[number];
export const ROTULO_VIDEO_OBRIGATORIO: Record<VideoObrigatorio, string> = {
  SEMPRE: 'Sempre',
  SO_PROBLEMA: 'Só quando alguma unidade for para o Estoque Problema ou estiver ausente',
};

export const REGIMES_TRIBUTARIOS = ['SIMPLES', 'PRESUMIDO', 'REAL'] as const;
export type RegimeTributario = (typeof REGIMES_TRIBUTARIOS)[number];
export const ROTULO_REGIME: Record<RegimeTributario, string> = {
  SIMPLES: 'Simples Nacional',
  PRESUMIDO: 'Lucro Presumido',
  REAL: 'Lucro Real',
};

export const AMBIENTES_NFE = ['HOMOLOGACAO', 'PRODUCAO'] as const;
export type AmbienteNfe = (typeof AMBIENTES_NFE)[number];
export const ROTULO_AMBIENTE: Record<AmbienteNfe, string> = { HOMOLOGACAO: 'Homologação', PRODUCAO: 'Produção' };

/** Prazo de guarda das mídias (spec §9): padrão de 12 meses. */
export const MESES_RETENCAO_PADRAO = 12;
```

Rode: `npm test -- src/modules/devolucoes/dominio.test.ts src/modules/midia/dominio.test.ts`
Esperado: PASS.

- [ ] **Passo 3: Colunas da conferência em `devolucoes` e `itens_devolucao`**

Em `src/db/schema/devolucoes.ts`:

1. Troque o import do domínio por:

```ts
import { CANAIS, DESTINOS_ITEM, MOTIVOS_ITEM, ORIGENS, STATUS_DEVOLUCAO, STATUS_ITEM, TIPOS_DEVOLUCAO } from '../../modules/devolucoes/dominio';
```

2. Logo abaixo de `export const statusItemEnum = ...`, acrescente:

```ts
export const destinoItemEnum = pgEnum('destino_item', DESTINOS_ITEM);
export const motivoItemEnum = pgEnum('motivo_item', MOTIVOS_ITEM);
```

3. Em `devolucoes`, logo depois da coluna `recebidaPor`, acrescente:

```ts
    /** Trava da conferência (spec §5.1, §11). Fica gravado depois de concluir. */
    conferenteId: uuid('conferente_id').references(() => usuarios.id, { onDelete: 'set null' }),
    conferenciaIniciadaEm: timestamp('conferencia_iniciada_em', { withTimezone: true }),
    /** EM_CONFERENCIA → AGUARDANDO_NF. */
    conferidaEm: timestamp('conferida_em', { withTimezone: true }),
    /** → CONCLUIDA. */
    concluidaEm: timestamp('concluida_em', { withTimezone: true }),
```

4. Em `itensDevolucao`, logo depois da coluna `serial`, acrescente:

```ts
    produtoRecebidoId: uuid('produto_recebido_id').references(() => produtos.id, { onDelete: 'set null' }),
    eanLido: text('ean_lido'),
    /** O "Lote" da Foto 4 (não confundir com o lote de remessa da Fase 5). */
    loteFabricacao: text('lote_fabricacao'),
    /** Como está impresso (ex.: 12/2027). */
    validade: text('validade'),
    /** Vazio até a decisão; vazio também quando a unidade é AUSENTE. */
    destino: destinoItemEnum('destino'),
    motivo: motivoItemEnum('motivo'),
    observacao: text('observacao'),
```

5. Na lista de índices de `itensDevolucao` (o terceiro argumento), acrescente no fim:

```ts
    index('itens_devolucao_produto_recebido_idx').on(t.produtoRecebidoId),
    check(
      'itens_destino_motivo',
      sql`("destino" = 'BOM' and "motivo" is null)
        or ("destino" = 'PROBLEMA' and "motivo" is not null and "motivo" <> 'AUSENTE')
        or ("destino" is null and ("motivo" is null or "motivo" = 'AUSENTE'))`,
    ),
```

- [ ] **Passo 4: Tabelas `evidencias` e `configuracoes` e os arquivos vazios das próximas fases**

`src/db/schema/evidencias.ts`:

```ts
import { sql } from 'drizzle-orm';
import { bigint, check, index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { SITUACOES_PROCESSAMENTO, TIPOS_EVIDENCIA } from '../../modules/midia/dominio';
import { usuarios } from './auth';
import { devolucoes, itensDevolucao } from './devolucoes';

export const tipoEvidenciaEnum = pgEnum('tipo_evidencia', TIPOS_EVIDENCIA);
export const situacaoProcessamentoEnum = pgEnum('situacao_processamento', SITUACOES_PROCESSAMENTO);

/** Spec §5.1 (Evidencia) e §9. Uma linha por foto ou vídeo; o arquivo final fica no armazenamento (contrato §5.2). */
export const evidencias = pgTable(
  'evidencias',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    devolucaoId: uuid('devolucao_id')
      .notNull()
      .references(() => devolucoes.id, { onDelete: 'cascade' }),
    /** Obrigatório só nas Fotos 3 e 4 (check). */
    itemId: uuid('item_id').references(() => itensDevolucao.id, { onDelete: 'cascade' }),
    tipo: tipoEvidenciaEnum('tipo').notNull(),
    /** image/jpeg, video/mp4, video/quicktime... */
    tipoConteudo: text('tipo_conteudo').notNull(),
    /** Chave no armazenamento final (vazia até PRONTA). */
    caminho: text('caminho'),
    /** Arquivo do upload em MIDIA_TMP_DIR, até o processamento. */
    caminhoTemporario: text('caminho_temporario'),
    /** 'disco' ou 's3': onde está o `caminho` (a troca de provedor não quebra os links antigos). */
    provedor: text('provedor'),
    tamanhoOriginal: bigint('tamanho_original', { mode: 'number' }).notNull(),
    tamanho: bigint('tamanho', { mode: 'number' }),
    /** Calculado ao terminar o upload (spec §9). */
    sha256Original: text('sha256_original').notNull(),
    sha256Final: text('sha256_final'),
    situacaoProcessamento: situacaoProcessamentoEnum('situacao_processamento').notNull().default('RECEBIDA'),
    erroProcessamento: text('erro_processamento'),
    /** Idempotência do envio pelo celular. */
    idCliente: uuid('id_cliente').notNull().unique(),
    enviadoPor: uuid('enviado_por').references(() => usuarios.id, { onDelete: 'set null' }),
    enviadoEm: timestamp('enviado_em', { withTimezone: true }).notNull().defaultNow(),
    processadoEm: timestamp('processado_em', { withTimezone: true }),
  },
  (t) => [
    index('evidencias_devolucao_idx').on(t.devolucaoId),
    uniqueIndex('evidencias_pacote_tipo_uq').on(t.devolucaoId, t.tipo).where(sql`"item_id" is null and "tipo" <> 'EXTRA'`),
    uniqueIndex('evidencias_item_tipo_uq').on(t.itemId, t.tipo).where(sql`"item_id" is not null`),
    check('evidencias_item_obrigatorio', sql`"tipo" not in ('FOTO_3_PRODUTO', 'FOTO_4_CODIGO_SERIAL') or "item_id" is not null`),
  ],
);
```

`src/db/schema/configuracoes.ts`:

```ts
import { sql } from 'drizzle-orm';
import { check, integer, pgEnum, pgTable, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { AMBIENTES_NFE, REGIMES_TRIBUTARIOS, VIDEO_OBRIGATORIO } from '../../modules/configuracoes/dominio';
import { usuarios } from './auth';

export const videoObrigatorioEnum = pgEnum('video_obrigatorio', VIDEO_OBRIGATORIO);
export const regimeTributarioEnum = pgEnum('regime_tributario', REGIMES_TRIBUTARIOS);
export const ambienteNfeEnum = pgEnum('ambiente_nfe', AMBIENTES_NFE);

/**
 * Spec §5.1 (Configuracao): uma linha só (id = 1). Cada fase grava só os seus campos, com upsert
 * (Fase 2: vídeo e prazo de guarda; Fase 4: empresa, regime, série e ambiente). O provedor de armazenamento
 * não é coluna: vem de ARMAZENAMENTO no .env (contrato §4.1 e D2).
 */
export const configuracoes = pgTable(
  'configuracoes',
  {
    id: smallint('id').primaryKey().default(1),
    razaoSocial: text('razao_social'),
    cnpj: text('cnpj'),
    ie: text('ie'),
    logradouro: text('logradouro'),
    numero: text('numero'),
    complemento: text('complemento'),
    bairro: text('bairro'),
    cidade: text('cidade'),
    uf: text('uf'),
    cep: text('cep'),
    /** Vazio até o Gestor escolher. */
    regimeTributario: regimeTributarioEnum('regime_tributario'),
    /** Ex.: '2'. */
    serieNfe: text('serie_nfe'),
    ambienteNfe: ambienteNfeEnum('ambiente_nfe').notNull().default('HOMOLOGACAO'),
    videoObrigatorio: videoObrigatorioEnum('video_obrigatorio').notNull().default('SEMPRE'),
    mesesRetencaoMidia: integer('meses_retencao_midia').notNull().default(12),
    atualizadoPor: uuid('atualizado_por').references(() => usuarios.id, { onDelete: 'set null' }),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }),
  },
  () => [check('configuracoes_linha_unica', sql`"id" = 1`)],
);
```

`src/db/schema/mercado-livre.ts`:

```ts
/** Tabelas do Mercado Livre: preenchidas pela Fase 3 (contrato §4.2). Só a Fase 3 edita este arquivo. */
export {};
```

`src/db/schema/fiscal.ts`:

```ts
/** Tabelas fiscais: preenchidas pela Fase 4 (contrato §4.3). Só a Fase 4 edita este arquivo. */
export {};
```

`src/db/schema/lotes.ts`:

```ts
/** Lotes de remessa: preenchidos pela Fase 5 (contrato §4.4). Só a Fase 5 edita este arquivo. */
export {};
```

`src/db/schema/index.ts` (substitua o conteúdo; **congelado** depois desta tarefa, contrato §3):

```ts
export * from './auth';
export * from './catalogo';
export * from './configuracoes';
export * from './devolucoes';
export * from './evidencias';
export * from './fiscal';
export * from './historico';
export * from './importacao';
export * from './lotes';
export * from './mercado-livre';
export * from './notificacoes';
```

- [ ] **Passo 5: Gerar e aplicar a migração `0006_fundacao`**

```bash
cd "/c/Users/idmpc/Dvoluções Markt"
npm run db:gerar -- --name fundacao
ls drizzle | grep 0006
grep -c "CREATE TYPE" drizzle/0006_fundacao.sql
grep -n "itens_destino_motivo\|evidencias_pacote_tipo_uq\|configuracoes_linha_unica" drizzle/0006_fundacao.sql
npm run db:migrar
```

Esperado: `0006_fundacao.sql` existe; 7 `CREATE TYPE` (`destino_item`, `motivo_item`, `tipo_evidencia`, `situacao_processamento`, `video_obrigatorio`, `regime_tributario`, `ambiente_nfe`); as três regras aparecem; "Migrações aplicadas." Se o drizzle-kit perguntar sobre renomear alguma coluna, responda "create column" (nada foi renomeado).

- [ ] **Passo 6: Escrever os testes de integração das regras do banco e de `lerConfiguracao` que falham**

`src/db/fundacao.int.test.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { configuracoes, evidencias, itensDevolucao } from '@/db/schema';
import { criarDbTeste, limparTabelas } from '../../tests/helpers/db';
import { criarDevolucaoTeste, criarUsuarioTeste } from '../../tests/helpers/fabricas';

const { db, sql } = criarDbTeste();
let devolucaoId: string;
let itemId: string;

function codigoPg(erro: unknown): string | undefined {
  const e = erro as { code?: string; cause?: { code?: string } };
  return e.code ?? e.cause?.code;
}
async function codigoDoErro(promessa: PromiseLike<unknown>): Promise<string | undefined> {
  try {
    await promessa;
    return undefined;
  } catch (erro) {
    return codigoPg(erro);
  }
}
function evidencia(extra: Partial<typeof evidencias.$inferInsert> = {}): typeof evidencias.$inferInsert {
  return {
    devolucaoId,
    tipo: 'FOTO_1_ETIQUETA',
    tipoConteudo: 'image/jpeg',
    tamanhoOriginal: 10,
    sha256Original: 'a'.repeat(64),
    idCliente: randomUUID(),
    ...extra,
  };
}

beforeEach(async () => {
  await limparTabelas(sql);
  const operador = await criarUsuarioTeste(db, 'OPERADOR');
  const criada = await criarDevolucaoTeste(db, operador, { itens: [{ sku: 'SKU-1', quantidade: 2 }] });
  devolucaoId = criada.id;
  const [primeiro] = await db
    .select({ id: itensDevolucao.id })
    .from(itensDevolucao)
    .where(eq(itensDevolucao.devolucaoId, devolucaoId))
    .orderBy(asc(itensDevolucao.unidade));
  itemId = primeiro.id;
});
afterAll(async () => {
  await sql.end();
});

describe('itens_destino_motivo (contrato §4.1)', () => {
  const gravar = (destino: 'BOM' | 'PROBLEMA' | null, motivo: 'AVARIADO' | 'AUSENTE' | null) =>
    db.update(itensDevolucao).set({ destino, motivo }).where(eq(itensDevolucao.id, itemId));

  it('aceita BOM sem motivo, PROBLEMA com motivo e ausente sem destino', async () => {
    expect(await codigoDoErro(gravar('BOM', null))).toBeUndefined();
    expect(await codigoDoErro(gravar('PROBLEMA', 'AVARIADO'))).toBeUndefined();
    expect(await codigoDoErro(gravar(null, 'AUSENTE'))).toBeUndefined();
    expect(await codigoDoErro(gravar(null, null))).toBeUndefined();
  });

  it('recusa BOM com motivo, PROBLEMA sem motivo, PROBLEMA ausente e motivo sem destino', async () => {
    expect(await codigoDoErro(gravar('BOM', 'AVARIADO'))).toBe('23514');
    expect(await codigoDoErro(gravar('PROBLEMA', null))).toBe('23514');
    expect(await codigoDoErro(gravar('PROBLEMA', 'AUSENTE'))).toBe('23514');
    expect(await codigoDoErro(gravar(null, 'AVARIADO'))).toBe('23514');
  });
});

describe('evidencias', () => {
  it('Fotos 3 e 4 exigem a unidade', async () => {
    expect(await codigoDoErro(db.insert(evidencias).values(evidencia({ tipo: 'FOTO_3_PRODUTO' })))).toBe('23514');
    expect(await codigoDoErro(db.insert(evidencias).values(evidencia({ tipo: 'FOTO_3_PRODUTO', itemId })))).toBeUndefined();
  });

  it('uma Foto 1 por devolução e uma Foto 3 por unidade; Extra pode repetir', async () => {
    await db.insert(evidencias).values(evidencia());
    expect(await codigoDoErro(db.insert(evidencias).values(evidencia()))).toBe('23505');
    await db.insert(evidencias).values(evidencia({ tipo: 'FOTO_3_PRODUTO', itemId }));
    expect(await codigoDoErro(db.insert(evidencias).values(evidencia({ tipo: 'FOTO_3_PRODUTO', itemId })))).toBe('23505');
    await db.insert(evidencias).values(evidencia({ tipo: 'EXTRA' }));
    expect(await codigoDoErro(db.insert(evidencias).values(evidencia({ tipo: 'EXTRA' })))).toBeUndefined();
  });

  it('id_cliente é único (o mesmo envio não grava duas vezes)', async () => {
    const idCliente = randomUUID();
    await db.insert(evidencias).values(evidencia({ idCliente }));
    expect(await codigoDoErro(db.insert(evidencias).values(evidencia({ idCliente, tipo: 'FOTO_2_EMBALAGEM' })))).toBe('23505');
  });
});

describe('configuracoes', () => {
  it('só existe a linha 1', async () => {
    expect(await codigoDoErro(db.insert(configuracoes).values({ id: 2 }))).toBe('23514');
    expect(await codigoDoErro(db.insert(configuracoes).values({}))).toBeUndefined();
  });
});
```

`src/modules/configuracoes/ler.int.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { configuracoes } from '@/db/schema';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { CONFIGURACAO_PADRAO, lerConfiguracao } from './ler';

const { db, sql } = criarDbTeste();
beforeEach(async () => {
  await limparTabelas(sql);
});
afterAll(async () => {
  await sql.end();
});

describe('lerConfiguracao (contrato §5.6)', () => {
  it('devolve os padrões quando a linha ainda não existe', async () => {
    expect(await lerConfiguracao(db)).toEqual(CONFIGURACAO_PADRAO);
    expect(CONFIGURACAO_PADRAO).toMatchObject({ videoObrigatorio: 'SEMPRE', mesesRetencaoMidia: 12, ambienteNfe: 'HOMOLOGACAO', regimeTributario: null });
  });

  it('lê a linha gravada', async () => {
    await db.insert(configuracoes).values({ id: 1, videoObrigatorio: 'SO_PROBLEMA', mesesRetencaoMidia: 6 });
    const c = await lerConfiguracao(db);
    expect(c.videoObrigatorio).toBe('SO_PROBLEMA');
    expect(c.mesesRetencaoMidia).toBe(6);
    expect(c.ambienteNfe).toBe('HOMOLOGACAO');
  });
});
```

Rode: `npm run test:int -- src/db/fundacao.int.test.ts src/modules/configuracoes/ler.int.test.ts`
Esperado: `fundacao` PASS (as regras já estão no banco); `ler` FAIL (`./ler` não existe).

- [ ] **Passo 7: Implementar `lerConfiguracao`**

`src/modules/configuracoes/ler.ts`:

```ts
import { eq } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { configuracoes } from '@/db/schema';
import { MESES_RETENCAO_PADRAO } from './dominio';

export type Configuracao = typeof configuracoes.$inferSelect;

/** O que vale enquanto ninguém salvou as Configurações (os padrões da spec §5.1). */
export const CONFIGURACAO_PADRAO: Configuracao = {
  id: 1,
  razaoSocial: null,
  cnpj: null,
  ie: null,
  logradouro: null,
  numero: null,
  complemento: null,
  bairro: null,
  cidade: null,
  uf: null,
  cep: null,
  regimeTributario: null,
  serieNfe: null,
  ambienteNfe: 'HOMOLOGACAO',
  videoObrigatorio: 'SEMPRE',
  mesesRetencaoMidia: MESES_RETENCAO_PADRAO,
  atualizadoPor: null,
  atualizadoEm: null,
};

export async function lerConfiguracao(db: DbOuTx): Promise<Configuracao> {
  const [linha] = await db.select().from(configuracoes).where(eq(configuracoes.id, 1)).limit(1);
  return linha ?? CONFIGURACAO_PADRAO;
}
```

Rode: `npm run test:int`
Esperado: PASS (todos, inclusive os da Fase 1).

- [ ] **Passo 8: Verificar e commitar**

```bash
cd "/c/Users/idmpc/Dvoluções Markt"
npm test && npm run typecheck && npm run lint
git add src/modules/devolucoes/dominio.ts src/modules/devolucoes/dominio.test.ts src/modules/midia src/modules/configuracoes src/db drizzle
git commit -m "feat: modelo de dados da conferência e das próximas fases (migração 0006_fundacao) e lerConfiguracao" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 3: Transições dos itens, rótulos do histórico por fase e EAN lido na Busca Avançada

**Arquivos:**
- Criar: `src/modules/devolucoes/transicoes-item.ts`, `src/modules/devolucoes/transicoes-item.test.ts`
- Criar: `src/modules/historico/rotulos/base.ts`, `conferencia.ts`, `mercado-livre.ts`, `fiscal.ts`, `lotes.ts`, `acabamento.ts`, `src/modules/historico/eventos.test.ts`
- Modificar: `src/modules/historico/eventos.ts`
- Modificar: `src/modules/devolucoes/busca.ts`, `src/modules/devolucoes/busca.int.test.ts`

**Interfaces:**
- Consome: `Ator`, `ErroDevolucao`, `StatusItem`, `ROTULO_STATUS_ITEM`, `ROTULO_PERFIL`.
- Produz:
  - em `transicoes-item.ts`: `type PedidoTransicaoItem = { de: StatusItem; para: StatusItem; ator: Ator }`, `REGRAS_TRANSICAO_ITEM`, `podeTransitarItem(p): boolean`, `class ErroTransicaoItem extends ErroDevolucao`, `exigirTransicaoItem(p: PedidoTransicaoItem): void`
  - em `historico/rotulos/*.ts`: `ROTULOS_BASE`, `ROTULOS_CONFERENCIA`, `ROTULOS_MERCADO_LIVRE`, `ROTULOS_FISCAL`, `ROTULOS_LOTES`, `ROTULOS_ACABAMENTO` (`Record<string, string>`)
  - em `eventos.ts`: `type EntidadeHistorico = 'devolucao' | 'item' | 'usuario' | 'configuracao' | 'conta_marketplace' | 'contestacao' | 'nota_fiscal' | 'lote'`; `ROTULO_ACAO` passa a ser a junção dos seis arquivos
  - a Busca Avançada ("Fornecedor ou Código de Barras / Serial Number") também acha pelo `ean_lido`

- [ ] **Passo 1: Escrever os testes que falham**

`src/modules/devolucoes/transicoes-item.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { STATUS_ITEM, type StatusItem } from './dominio';
import { ErroTransicaoItem, exigirTransicaoItem, podeTransitarItem } from './transicoes-item';
import type { Ator } from './transicoes';

const ATORES: Ator[] = ['SISTEMA', 'OPERADOR', 'FISCAL', 'GESTOR'];

// Contrato §4.6, escrito aqui de novo de propósito: o teste não lê a tabela do código.
const PERMITIDAS: [StatusItem, StatusItem, Ator[]][] = [
  ['PENDENTE', 'AGUARDANDO_NF', ['OPERADOR', 'GESTOR']],
  ['PENDENTE', 'AUSENTE', ['OPERADOR', 'GESTOR']],
  ['AGUARDANDO_NF', 'DISPONIVEL_VENDA', ['SISTEMA']],
  ['DISPONIVEL_VENDA', 'AGUARDANDO_NF', ['SISTEMA']],
  ['AGUARDANDO_NF', 'EM_LOTE', ['SISTEMA']],
  ['AGUARDANDO_NF', 'SEM_FORNECEDOR', ['SISTEMA']],
  ['SEM_FORNECEDOR', 'EM_LOTE', ['FISCAL', 'GESTOR', 'SISTEMA']],
  ['EM_LOTE', 'AGUARDANDO_NF', ['SISTEMA']],
  ['SEM_FORNECEDOR', 'AGUARDANDO_NF', ['SISTEMA']],
  ['EM_LOTE', 'ENVIADO', ['FISCAL', 'GESTOR']],
  ['ENVIADO', 'RESOLVIDO', ['FISCAL', 'GESTOR']],
];

describe('podeTransitarItem (contrato §4.6)', () => {
  it('aceita exatamente as linhas da tabela e recusa todo o resto', () => {
    for (const de of STATUS_ITEM) {
      for (const para of STATUS_ITEM) {
        for (const ator of ATORES) {
          const esperado = PERMITIDAS.some(([d, p, atores]) => d === de && p === para && atores.includes(ator));
          expect(podeTransitarItem({ de, para, ator }), `${de} → ${para} por ${ator}`).toBe(esperado);
        }
      }
    }
  });

  it('o Fiscal não conclui a conferência', () => {
    expect(podeTransitarItem({ de: 'PENDENTE', para: 'AGUARDANDO_NF', ator: 'FISCAL' })).toBe(false);
  });
});

describe('exigirTransicaoItem', () => {
  it('lança ErroTransicaoItem com a mensagem em português', () => {
    const pedido = { de: 'RESOLVIDO', para: 'PENDENTE', ator: 'GESTOR' } as const;
    expect(() => exigirTransicaoItem(pedido)).toThrow(ErroTransicaoItem);
    expect(() => exigirTransicaoItem(pedido)).toThrow('Mudança de status do item não permitida: Resolvido → Pendente (Gestor).');
  });
});
```

`src/modules/historico/eventos.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ROTULO_ACAO, rotuloDaAcao } from './eventos';
import { ROTULOS_ACABAMENTO } from './rotulos/acabamento';
import { ROTULOS_BASE } from './rotulos/base';
import { ROTULOS_CONFERENCIA } from './rotulos/conferencia';
import { ROTULOS_FISCAL } from './rotulos/fiscal';
import { ROTULOS_LOTES } from './rotulos/lotes';
import { ROTULOS_MERCADO_LIVRE } from './rotulos/mercado-livre';

const ARQUIVOS: Record<string, Record<string, string>> = {
  base: ROTULOS_BASE,
  conferencia: ROTULOS_CONFERENCIA,
  'mercado-livre': ROTULOS_MERCADO_LIVRE,
  fiscal: ROTULOS_FISCAL,
  lotes: ROTULOS_LOTES,
  acabamento: ROTULOS_ACABAMENTO,
};

// Chaves reservadas no contrato §4.7 (cada fase pode acrescentar outras com o próprio prefixo).
const RESERVADAS: Record<string, string[]> = {
  base: [
    'criada', 'criada_nao_identificada', 'recebida', 'identificada', 'cancelada', 'extraviada',
    'usuario_criado', 'perfil_alterado', 'usuario_desativado', 'usuario_reativado',
    'item_status', 'concluida', 'configuracao_alterada',
  ],
  conferencia: [
    'conferencia_iniciada', 'conferencia_interrompida', 'conferencia_trava_liberada', 'conferencia_concluida',
    'item_conferido', 'evidencia_enviada', 'evidencia_processada', 'evidencia_refeita', 'evidencia_falhou',
  ],
  'mercado-livre': [
    'ml_vinculada', 'ml_status_atualizado', 'ml_entregue', 'ml_no_cd', 'ml_reenviada_ao_vendedor', 'ml_status_apos_chegada',
    'ml_resultado_ok_enviado', 'ml_conta_conectada', 'ml_conta_reconectar',
    'contestacao_criada', 'contestacao_revisada', 'contestacao_enviada', 'contestacao_falhou',
  ],
  fiscal: [
    'nf_solicitada', 'nf_autorizada', 'nf_rejeitada', 'nf_reenviada', 'nf_cancelada',
    'nota_venda_anexada', 'nota_venda_obtida_ml', 'devolucao_reaberta',
  ],
  lotes: [
    'lote_criado', 'lote_item_incluido', 'lote_item_movido', 'lote_fechado', 'lote_reaberto',
    'lote_enviado', 'lote_resultado_registrado', 'lote_finalizado',
  ],
  acabamento: ['midia_apagada_retencao', 'tarefa_reenviada'],
};

describe('rótulos do histórico (contrato §4.7)', () => {
  it('cada arquivo traz as chaves reservadas, todas com rótulo', () => {
    for (const [area, chaves] of Object.entries(RESERVADAS)) {
      expect(Object.keys(ARQUIVOS[area]), area).toEqual(expect.arrayContaining(chaves));
      for (const chave of chaves) expect(ARQUIVOS[area][chave].length, chave).toBeGreaterThan(0);
    }
  });

  it('nenhuma chave se repete entre os arquivos', () => {
    const total = Object.values(ARQUIVOS).reduce((n, r) => n + Object.keys(r).length, 0);
    expect(Object.keys(ROTULO_ACAO)).toHaveLength(total);
  });

  it('rotuloDaAcao usa o rótulo ou devolve a própria chave', () => {
    expect(rotuloDaAcao('conferencia_iniciada')).toBe('Conferência iniciada');
    expect(rotuloDaAcao('recebida')).toBe('Chegada registrada');
    expect(rotuloDaAcao('chave_desconhecida')).toBe('chave_desconhecida');
  });
});
```

No **final** de `src/modules/devolucoes/busca.int.test.ts` (depois do último `});`), acrescente:

```ts
describe('Código de Barras: EAN lido na conferência', () => {
  it('acha pelo ean_lido da unidade, sem diferenciar maiúsculas', async () => {
    const [item] = await db.select({ id: itensDevolucao.id }).from(itensDevolucao).where(eq(itensDevolucao.devolucaoId, c.id));
    await db.update(itensDevolucao).set({ eanLido: '7899999999993' }).where(eq(itensDevolucao.id, item.id));
    expect(await codigos({ codigo: '7899999999993' })).toEqual([c.codigo]);
    await db.update(itensDevolucao).set({ eanLido: 'INT-ABC' }).where(eq(itensDevolucao.id, item.id));
    expect(await codigos({ codigo: 'int-abc' })).toEqual([c.codigo]);
  });
});
```

Rode: `npm test -- src/modules/devolucoes/transicoes-item.test.ts src/modules/historico/eventos.test.ts && npm run test:int -- src/modules/devolucoes/busca.int.test.ts`
Esperado: FAIL (módulos e rótulos novos não existem; a busca não olha o `ean_lido`).

- [ ] **Passo 2: Implementar as transições dos itens**

`src/modules/devolucoes/transicoes-item.ts`:

```ts
import { ROTULO_PERFIL } from '@/modules/auth/perfis';
import { ROTULO_STATUS_ITEM, type StatusItem } from './dominio';
import { ErroDevolucao } from './erros';
import type { Ator } from './transicoes';

export type PedidoTransicaoItem = { de: StatusItem; para: StatusItem; ator: Ator };

type RegraItem = { de: StatusItem; para: StatusItem; atores: readonly Ator[] };

const QUEM_OPERA: readonly Ator[] = ['OPERADOR', 'GESTOR'];
const QUEM_GERE_LOTES: readonly Ator[] = ['FISCAL', 'GESTOR'];

/**
 * Tabela completa do contrato §4.6 (spec §5.3). Cada fase usa só as suas linhas:
 * Fase 2 (conferência), Fase 4 (NF de devolução), Fase 5 (lotes). Mudança fora dela é recusada no servidor.
 */
export const REGRAS_TRANSICAO_ITEM: readonly RegraItem[] = [
  { de: 'PENDENTE', para: 'AGUARDANDO_NF', atores: QUEM_OPERA },
  { de: 'PENDENTE', para: 'AUSENTE', atores: QUEM_OPERA },
  { de: 'AGUARDANDO_NF', para: 'DISPONIVEL_VENDA', atores: ['SISTEMA'] },
  { de: 'DISPONIVEL_VENDA', para: 'AGUARDANDO_NF', atores: ['SISTEMA'] },
  { de: 'AGUARDANDO_NF', para: 'EM_LOTE', atores: ['SISTEMA'] },
  { de: 'AGUARDANDO_NF', para: 'SEM_FORNECEDOR', atores: ['SISTEMA'] },
  { de: 'SEM_FORNECEDOR', para: 'EM_LOTE', atores: ['FISCAL', 'GESTOR', 'SISTEMA'] },
  { de: 'EM_LOTE', para: 'AGUARDANDO_NF', atores: ['SISTEMA'] },
  { de: 'SEM_FORNECEDOR', para: 'AGUARDANDO_NF', atores: ['SISTEMA'] },
  { de: 'EM_LOTE', para: 'ENVIADO', atores: QUEM_GERE_LOTES },
  { de: 'ENVIADO', para: 'RESOLVIDO', atores: QUEM_GERE_LOTES },
];

export function podeTransitarItem(p: PedidoTransicaoItem): boolean {
  return REGRAS_TRANSICAO_ITEM.some((r) => r.de === p.de && r.para === p.para && r.atores.includes(p.ator));
}

export class ErroTransicaoItem extends ErroDevolucao {
  constructor(p: PedidoTransicaoItem) {
    const quem = p.ator === 'SISTEMA' ? 'sistema' : ROTULO_PERFIL[p.ator];
    super(`Mudança de status do item não permitida: ${ROTULO_STATUS_ITEM[p.de]} → ${ROTULO_STATUS_ITEM[p.para]} (${quem}).`);
    this.name = 'ErroTransicaoItem';
  }
}

/** Chamada antes de toda gravação de status de um item. */
export function exigirTransicaoItem(p: PedidoTransicaoItem): void {
  if (!podeTransitarItem(p)) throw new ErroTransicaoItem(p);
}
```

- [ ] **Passo 3: Rótulos do histórico em um arquivo por fase**

`src/modules/historico/rotulos/base.ts`:

```ts
/** Núcleo (Fases 0 e 1) e chaves comuns. Só quem integra mexe aqui. */
export const ROTULOS_BASE: Record<string, string> = {
  criada: 'Devolução cadastrada',
  criada_nao_identificada: 'Pacote não identificado registrado',
  recebida: 'Chegada registrada',
  identificada: 'Devolução identificada',
  cancelada: 'Devolução cancelada',
  extraviada: 'Devolução marcada como extraviada',
  usuario_criado: 'Usuário criado',
  perfil_alterado: 'Perfil alterado',
  usuario_desativado: 'Usuário desativado',
  usuario_reativado: 'Usuário reativado',
  item_status: 'Status do item alterado',
  concluida: 'Devolução concluída',
  configuracao_alterada: 'Configuração alterada',
};
```

`src/modules/historico/rotulos/conferencia.ts`:

```ts
/** Fase 2. Chave nova: prefixo conferencia_, item_ ou evidencia_. */
export const ROTULOS_CONFERENCIA: Record<string, string> = {
  conferencia_iniciada: 'Conferência iniciada',
  conferencia_interrompida: 'Conferência interrompida',
  conferencia_trava_liberada: 'Trava da conferência liberada pelo Gestor',
  conferencia_concluida: 'Conferência concluída',
  item_conferido: 'Unidade conferida',
  evidencia_enviada: 'Evidência enviada',
  evidencia_processada: 'Evidência processada',
  evidencia_refeita: 'Evidência refeita',
  evidencia_falhou: 'Falha no processamento da evidência',
};
```

`src/modules/historico/rotulos/mercado-livre.ts`:

```ts
/** Fase 3. Chave nova: prefixo ml_ ou contestacao_. */
export const ROTULOS_MERCADO_LIVRE: Record<string, string> = {
  ml_vinculada: 'Ligada à devolução do Mercado Livre',
  ml_status_atualizado: 'Status do Mercado Livre atualizado',
  ml_entregue: 'Entregue segundo o Mercado Livre',
  ml_no_cd: 'No CD do Mercado Livre',
  ml_reenviada_ao_vendedor: 'Reenviada ao vendedor pelo Mercado Livre',
  ml_status_apos_chegada: 'Status do Mercado Livre mudou depois da chegada',
  ml_resultado_ok_enviado: 'Resultado "OK" enviado ao Mercado Livre',
  ml_conta_conectada: 'Conta do Mercado Livre conectada',
  ml_conta_reconectar: 'Conta do Mercado Livre precisa ser reconectada',
  contestacao_criada: 'Contestação criada',
  contestacao_revisada: 'Contestação revisada pelo Gestor',
  contestacao_enviada: 'Contestação enviada ao Mercado Livre',
  contestacao_falhou: 'Falha no envio da contestação',
};
```

`src/modules/historico/rotulos/fiscal.ts`:

```ts
/** Fase 4. Chave nova: prefixo nf_ ou nota_venda_. */
export const ROTULOS_FISCAL: Record<string, string> = {
  nf_solicitada: 'NF-e solicitada',
  nf_autorizada: 'NF-e autorizada',
  nf_rejeitada: 'NF-e rejeitada',
  nf_reenviada: 'NF-e reenviada',
  nf_cancelada: 'NF-e cancelada',
  nota_venda_anexada: 'NF de venda anexada',
  nota_venda_obtida_ml: 'NF de venda obtida do Mercado Livre',
  devolucao_reaberta: 'Devolução reaberta (NF cancelada)',
};
```

`src/modules/historico/rotulos/lotes.ts`:

```ts
/** Fase 5. Chave nova: prefixo lote_. */
export const ROTULOS_LOTES: Record<string, string> = {
  lote_criado: 'Lote criado',
  lote_item_incluido: 'Unidade incluída no lote',
  lote_item_movido: 'Unidade movida de lote',
  lote_fechado: 'Lote fechado',
  lote_reaberto: 'Lote reaberto',
  lote_enviado: 'Envio do lote registrado',
  lote_resultado_registrado: 'Resultado do fornecedor registrado',
  lote_finalizado: 'Lote finalizado',
};
```

`src/modules/historico/rotulos/acabamento.ts`:

```ts
/** Fase 6. Chave nova: prefixo midia_ ou tarefa_. */
export const ROTULOS_ACABAMENTO: Record<string, string> = {
  midia_apagada_retencao: 'Mídia apagada pelo prazo de guarda',
  tarefa_reenviada: 'Tarefa reenviada',
};
```

Em `src/modules/historico/eventos.ts`:

1. Acrescente no topo, depois dos imports existentes:

```ts
import { ROTULOS_ACABAMENTO } from './rotulos/acabamento';
import { ROTULOS_BASE } from './rotulos/base';
import { ROTULOS_CONFERENCIA } from './rotulos/conferencia';
import { ROTULOS_FISCAL } from './rotulos/fiscal';
import { ROTULOS_LOTES } from './rotulos/lotes';
import { ROTULOS_MERCADO_LIVRE } from './rotulos/mercado-livre';
```

2. Troque a linha `export type EntidadeHistorico = 'devolucao' | 'usuario';` por:

```ts
/** Contrato §4.7. Evidência registra evento na devolução (dados: evidenciaId, tipo, itemId e os hashes). */
export type EntidadeHistorico =
  | 'devolucao'
  | 'item'
  | 'usuario'
  | 'configuracao'
  | 'conta_marketplace'
  | 'contestacao'
  | 'nota_fiscal'
  | 'lote';
```

3. Troque o bloco `export const ROTULO_ACAO: Record<string, string> = { ... };` inteiro por:

```ts
/** Junção dos rótulos de cada fase (contrato §3: cada fase só edita o próprio arquivo em rotulos/). */
export const ROTULO_ACAO: Record<string, string> = {
  ...ROTULOS_BASE,
  ...ROTULOS_CONFERENCIA,
  ...ROTULOS_MERCADO_LIVRE,
  ...ROTULOS_FISCAL,
  ...ROTULOS_LOTES,
  ...ROTULOS_ACABAMENTO,
};
```

- [ ] **Passo 4: `ean_lido` no filtro "Código de Barras / Serial Number"**

Em `src/modules/devolucoes/busca.ts`, dentro do bloco `if (f.codigo) { ... }`, na lista do `or(...)`, acrescente a linha abaixo logo depois de `sql\`upper(${itensDevolucao.serial}) = upper(${codigo})\`,`:

```ts
                sql`upper(${itensDevolucao.eanLido}) = upper(${codigo})`,
```

Rode: `npm test -- src/modules/devolucoes/transicoes-item.test.ts src/modules/historico/eventos.test.ts && npm run test:int -- src/modules/devolucoes/busca.int.test.ts`
Esperado: PASS.

- [ ] **Passo 5: Verificar e commitar**

```bash
cd "/c/Users/idmpc/Dvoluções Markt"
npm test && npm run test:int && npm run typecheck && npm run lint
git add src/modules/devolucoes src/modules/historico
git commit -m "feat: transições dos itens, rótulos do histórico por fase e EAN lido na Busca Avançada" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 4: Fila de tarefas (pg-boss)

**Por que assim:** o pg-boss 12 guarda a fila no próprio PostgreSQL (schema `pgboss`), tem novas tentativas com espera crescente e agenda por cron (pesquisa §5). O envio pode entrar na **mesma transação** do domínio com o adaptador `fromDrizzle(tx, sql)` (verificado em `node_modules/pg-boss/dist/adapters/drizzle.js`): se a transação desfaz, a tarefa também some.

**Arquivos:**
- Modificar: `package.json` e `package-lock.json` (dependência), `next.config.ts` (`serverExternalPackages`)
- Criar: `src/modules/fila/tarefas.ts`, `src/modules/fila/fila.ts`
- Testes: `src/modules/fila/tarefas.test.ts`, `src/modules/fila/fila.test.ts`, `src/modules/fila/fila.int.test.ts`

**Interfaces:**
- Consome: `DbOuTx` (`src/db/client.ts`), `lerEnv` (Tarefa 1).
- Produz (contrato §5.1, nomes exatos):
  - em `tarefas.ts`: `type DadosTarefa`, `type NomeTarefa`, `type ConfigTarefa = { tentativas: number; expiraEmSegundos: number; agenda?: string }`, `CONFIG_TAREFAS: Record<NomeTarefa, ConfigTarefa>`, `NOMES_TAREFAS: NomeTarefa[]`, `FUSO_AGENDAS = 'America/Sao_Paulo'`, `TAREFAS_NA_SUBIDA = ['lotes.alocar-pendentes']`
  - em `fila.ts`: `type OpcoesEnvio = { tx?: DbOuTx; chaveUnica?: string; iniciarEm?: Date }`, `interface Fila { enviar<N extends NomeTarefa>(nome: N, dados: DadosTarefa[N], opcoes?: OpcoesEnvio): Promise<void> }`, `SCHEMA_FILA = 'pgboss'`, `opcoesDaFila(nome)`, `idDoJob(nome, chave): string`, `criarPgBoss(url, { max, supervisionar, schema? }): PgBoss`, `criarFilas(boss): Promise<void>`, `enviarPorPgBoss(boss, nome, dados, opcoes?): Promise<void>`, `class FilaPgBoss implements Fila` (com `ligar(): Promise<PgBoss>`), `class FilaMemoria implements Fila { readonly enviadas: { nome: NomeTarefa; dados: unknown; opcoes?: OpcoesEnvio }[] }`, `obterFila(): Fila`, `definirFilaParaTestes(f: Fila | null): void`, `verificarFila(): Promise<void>`

- [ ] **Passo 1: Instalar o pg-boss e tirá-lo do empacotamento do Next**

```bash
cd "/c/Users/idmpc/Dvoluções Markt"
npm install --save-exact pg-boss@12.38.2
npm ls pg-boss @opentelemetry/api
```

Esperado: `pg-boss@12.38.2` e `@opentelemetry/api` (dependência obrigatória do pg-boss, instalada junto pelo npm). Confira a API instalada antes de seguir: `grep -n "fromDrizzle" node_modules/pg-boss/dist/index.d.ts` deve mostrar a exportação; `grep -n "retryCount" node_modules/pg-boss/dist/types.d.ts` deve mostrar o campo do job.

Em `next.config.ts`, logo depois da linha `distDir: ...`, acrescente:

```ts
  // Pacotes que o Next não deve empacotar: usam recursos do Node e rodam do node_modules (o standalone os inclui).
  serverExternalPackages: ["pg-boss"],
```

- [ ] **Passo 2: Escrever os testes unitários que falham**

`src/modules/fila/tarefas.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CONFIG_TAREFAS, FUSO_AGENDAS, NOMES_TAREFAS, TAREFAS_NA_SUBIDA } from './tarefas';

describe('tarefas de fundo (contrato §5.1)', () => {
  it('as 12 tarefas do contrato, todas com 5 tentativas (spec §11)', () => {
    expect([...NOMES_TAREFAS].sort()).toEqual(
      [
        'midia.processar-foto',
        'midia.transcodificar',
        'limpeza.temporarios',
        'ml.sincronizar-reclamacao',
        'ml.varredura',
        'ml.renovar-token',
        'ml.enviar-resultado',
        'ml.enviar-contestacao',
        'nfe.emitir',
        'nfe.consultar',
        'lotes.alocar-pendentes',
        'midia.retencao',
      ].sort(),
    );
    for (const nome of NOMES_TAREFAS) expect(CONFIG_TAREFAS[nome].tentativas, nome).toBe(5);
  });

  it('a transcodificação pode levar 1 hora; as outras, 5 minutos', () => {
    for (const nome of NOMES_TAREFAS) {
      expect(CONFIG_TAREFAS[nome].expiraEmSegundos, nome).toBe(nome === 'midia.transcodificar' ? 3600 : 300);
    }
  });

  it('agendas no horário de São Paulo', () => {
    expect(FUSO_AGENDAS).toBe('America/Sao_Paulo');
    const agendas = Object.fromEntries(NOMES_TAREFAS.filter((n) => CONFIG_TAREFAS[n].agenda).map((n) => [n, CONFIG_TAREFAS[n].agenda]));
    expect(agendas).toEqual({
      'limpeza.temporarios': '30 3 * * *',
      'ml.varredura': '*/15 * * * *',
      'ml.renovar-token': '0 */5 * * *',
      'midia.retencao': '0 3 * * *',
    });
  });

  it('lotes.alocar-pendentes roda uma vez, na subida do worker', () => {
    expect(TAREFAS_NA_SUBIDA).toEqual(['lotes.alocar-pendentes']);
  });
});
```

`src/modules/fila/fila.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { definirFilaParaTestes, FilaMemoria, idDoJob, obterFila, opcoesDaFila } from './fila';

describe('idDoJob', () => {
  it('é o mesmo UUID para a mesma tarefa e chave, e muda com qualquer uma delas', () => {
    const a = idDoJob('ml.enviar-resultado', 'abc');
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(idDoJob('ml.enviar-resultado', 'abc')).toBe(a);
    expect(idDoJob('ml.enviar-resultado', 'abd')).not.toBe(a);
    expect(idDoJob('midia.processar-foto', 'abc')).not.toBe(a);
  });
});

describe('opcoesDaFila', () => {
  it('5 tentativas no total = 4 novas tentativas, com espera crescente de 30 s até 15 min', () => {
    expect(opcoesDaFila('midia.transcodificar')).toEqual({
      retryLimit: 4,
      retryDelay: 30,
      retryBackoff: true,
      retryDelayMax: 900,
      expireInSeconds: 3600,
    });
    expect(opcoesDaFila('nfe.emitir').expireInSeconds).toBe(300);
  });
});

describe('FilaMemoria e obterFila', () => {
  it('guarda os envios e substitui a fila nos testes', async () => {
    const fila = new FilaMemoria();
    definirFilaParaTestes(fila);
    try {
      await obterFila().enviar('ml.enviar-resultado', { devolucaoId: 'd1' }, { chaveUnica: 'd1' });
    } finally {
      definirFilaParaTestes(null);
    }
    expect(fila.enviadas).toEqual([{ nome: 'ml.enviar-resultado', dados: { devolucaoId: 'd1' }, opcoes: { chaveUnica: 'd1' } }]);
  });
});
```

Rode: `npm test -- src/modules/fila`
Esperado: FAIL (os módulos não existem).

- [ ] **Passo 3: Implementar as tarefas e a fila**

`src/modules/fila/tarefas.ts`:

```ts
/** Tarefas de fundo de todas as fases (contrato §5.1). Tarefa nova só por emenda ao contrato. */
export type DadosTarefa = {
  'midia.processar-foto': { evidenciaId: string }; // 2: hash, carimbo (extra), envio ao armazenamento final
  'midia.transcodificar': { evidenciaId: string }; // 2: ffmpeg H.264 720p (spec §9)
  'limpeza.temporarios': Record<string, never>; // 2 (extra): uploads tus abandonados e importações não confirmadas
  'ml.sincronizar-reclamacao': { claimId: string }; // 3
  'ml.varredura': Record<string, never>; // 3
  'ml.renovar-token': Record<string, never>; // 3
  'ml.enviar-resultado': { devolucaoId: string }; // 3 (enviada pela 2 ao concluir)
  'ml.enviar-contestacao': { contestacaoId: string }; // 3
  'nfe.emitir': { notaFiscalId: string }; // 4
  'nfe.consultar': { notaFiscalId: string; consulta: number }; // 4 (reagenda a si mesma com espera crescente)
  'lotes.alocar-pendentes': Record<string, never>; // 5 (uma vez, na subida do worker)
  'midia.retencao': Record<string, never>; // 6
};
export type NomeTarefa = keyof DadosTarefa;

export type ConfigTarefa = { tentativas: number; expiraEmSegundos: number; agenda?: string };

const PADRAO: ConfigTarefa = { tentativas: 5, expiraEmSegundos: 300 };

/** Spec §11: 5 tentativas com espera crescente; depois, a tarefa vai para Falhas (Fase 6). */
export const CONFIG_TAREFAS: Record<NomeTarefa, ConfigTarefa> = {
  'midia.processar-foto': PADRAO,
  // Transcodificar 1 min de vídeo leva até ~3 min numa vCPU (pesquisa §6.3); 1 hora evita reexecução no meio.
  'midia.transcodificar': { tentativas: 5, expiraEmSegundos: 3600 },
  'limpeza.temporarios': { ...PADRAO, agenda: '30 3 * * *' },
  'ml.sincronizar-reclamacao': PADRAO,
  'ml.varredura': { ...PADRAO, agenda: '*/15 * * * *' },
  'ml.renovar-token': { ...PADRAO, agenda: '0 */5 * * *' },
  'ml.enviar-resultado': PADRAO,
  'ml.enviar-contestacao': PADRAO,
  'nfe.emitir': PADRAO,
  'nfe.consultar': PADRAO,
  'lotes.alocar-pendentes': PADRAO,
  'midia.retencao': { ...PADRAO, agenda: '0 3 * * *' },
};

export const NOMES_TAREFAS = Object.keys(CONFIG_TAREFAS) as NomeTarefa[];

/** As agendas (cron) valem no horário de Brasília. */
export const FUSO_AGENDAS = 'America/Sao_Paulo';

/** Enviadas uma vez quando o worker sobe (se a fase dona já tiver manipulador). */
export const TAREFAS_NA_SUBIDA = ['lotes.alocar-pendentes'] as const satisfies readonly NomeTarefa[];
```

`src/modules/fila/fila.ts`:

```ts
import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { fromDrizzle, PgBoss, type DrizzleTransactionLike } from 'pg-boss';
import type { DbOuTx } from '@/db/client';
import { lerEnv } from '@/lib/env';
import { CONFIG_TAREFAS, NOMES_TAREFAS, type DadosTarefa, type NomeTarefa } from './tarefas';

export type OpcoesEnvio = { tx?: DbOuTx; chaveUnica?: string; iniciarEm?: Date };

export interface Fila {
  enviar<N extends NomeTarefa>(nome: N, dados: DadosTarefa[N], opcoes?: OpcoesEnvio): Promise<void>;
}

/** Schema do pg-boss no banco da aplicação (cada worktree tem o seu banco e, portanto, o seu schema). */
export const SCHEMA_FILA = 'pgboss';

/** Opções da fila no pg-boss: `retryLimit` conta só as novas tentativas, então 5 tentativas = 4 (teste na Tarefa 5). */
export function opcoesDaFila(nome: NomeTarefa) {
  const c = CONFIG_TAREFAS[nome];
  return { retryLimit: c.tentativas - 1, retryDelay: 30, retryBackoff: true, retryDelayMax: 900, expireInSeconds: c.expiraEmSegundos };
}

/**
 * `chaveUnica` vira o id do job (um UUID calculado de tarefa + chave). O pg-boss grava com ON CONFLICT DO NOTHING,
 * então um segundo envio com a mesma chave é ignorado, em qualquer política de fila.
 */
export function idDoJob(nome: NomeTarefa, chave: string): string {
  const h = createHash('sha256').update(`${nome}\u0000${chave}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export function criarPgBoss(url: string, opcoes: { max: number; supervisionar: boolean; schema?: string }): PgBoss {
  const boss = new PgBoss({
    connectionString: url,
    schema: opcoes.schema ?? SCHEMA_FILA,
    max: opcoes.max,
    // Só o worker faz a manutenção e as agendas; o web só envia.
    supervise: opcoes.supervisionar,
    schedule: opcoes.supervisionar,
  });
  boss.on('error', (erro) => {
    console.error(JSON.stringify({ nivel: 'erro', origem: 'pg-boss', mensagem: erro.message }));
  });
  return boss;
}

/** Cria (ou atualiza) as filas de todas as tarefas. Pode rodar quantas vezes quiser. */
export async function criarFilas(boss: PgBoss): Promise<void> {
  for (const nome of NOMES_TAREFAS) {
    await boss.createQueue(nome, opcoesDaFila(nome));
    await boss.updateQueue(nome, opcoesDaFila(nome));
  }
}

export async function enviarPorPgBoss<N extends NomeTarefa>(
  boss: PgBoss,
  nome: N,
  dados: DadosTarefa[N],
  opcoes: OpcoesEnvio = {},
): Promise<void> {
  await boss.send(nome, dados, {
    ...(opcoes.chaveUnica ? { id: idDoJob(nome, opcoes.chaveUnica) } : {}),
    ...(opcoes.iniciarEm ? { startAfter: opcoes.iniciarEm } : {}),
    // Dentro da transação do domínio: se ela desfaz, a tarefa some junto.
    ...(opcoes.tx ? { db: fromDrizzle(opcoes.tx as unknown as DrizzleTransactionLike, sql) } : {}),
  });
}

/** A fila do web: liga o pg-boss no primeiro uso (cria o schema e as filas) e reaproveita a conexão. */
export class FilaPgBoss implements Fila {
  private ligando: Promise<PgBoss> | null = null;

  constructor(private readonly url: string) {}

  ligar(): Promise<PgBoss> {
    this.ligando ??= (async () => {
      const boss = criarPgBoss(this.url, { max: 3, supervisionar: false });
      await boss.start();
      await criarFilas(boss);
      return boss;
    })().catch((erro: unknown) => {
      this.ligando = null;
      throw erro;
    });
    return this.ligando;
  }

  async enviar<N extends NomeTarefa>(nome: N, dados: DadosTarefa[N], opcoes?: OpcoesEnvio): Promise<void> {
    await enviarPorPgBoss(await this.ligar(), nome, dados, opcoes);
  }
}

/** Para os testes: guarda os envios em memória (mesmo dentro de uma transação que depois desfaz). */
export class FilaMemoria implements Fila {
  readonly enviadas: { nome: NomeTarefa; dados: unknown; opcoes?: OpcoesEnvio }[] = [];

  async enviar<N extends NomeTarefa>(nome: N, dados: DadosTarefa[N], opcoes?: OpcoesEnvio): Promise<void> {
    this.enviadas.push(opcoes === undefined ? { nome, dados } : { nome, dados, opcoes });
  }
}

let filaParaTestes: Fila | null = null;
// No globalThis para o recarregamento do `next dev` não abrir um pg-boss novo a cada edição.
const globalComFila = globalThis as unknown as { __filaPgBoss?: FilaPgBoss };

function filaPadrao(): FilaPgBoss {
  globalComFila.__filaPgBoss ??= new FilaPgBoss(lerEnv().DATABASE_URL);
  return globalComFila.__filaPgBoss;
}

export function obterFila(): Fila {
  return filaParaTestes ?? filaPadrao();
}

export function definirFilaParaTestes(f: Fila | null): void {
  filaParaTestes = f;
}

/** Para o /saude (spec §11): o pg-boss liga e o schema dele existe. */
export async function verificarFila(): Promise<void> {
  if (filaParaTestes) return;
  const boss = await filaPadrao().ligar();
  if (!(await boss.isInstalled())) throw new Error('O schema da fila não está instalado.');
}
```

Rode: `npm test -- src/modules/fila`
Esperado: PASS. Se o `npm run typecheck` reclamar do tipo do `sql` em `fromDrizzle`, troque por `sql as unknown as Parameters<typeof fromDrizzle>[1]` (o adaptador só usa `sql\`...\`` e `sql.param`).

- [ ] **Passo 4: Escrever o teste de integração com o pg-boss de verdade**

`src/modules/fila/fila.int.test.ts`:

```ts
import { randomUUID } from 'node:crypto';
import type { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarDbTeste, urlBancoTeste } from '../../../tests/helpers/db';
import { criarFilas, criarPgBoss, enviarPorPgBoss, idDoJob } from './fila';

// Schema próprio: não mistura com o pg-boss do e2e nem com o de outro teste.
const SCHEMA = 'pgboss_fila_int';
const { db, sql } = criarDbTeste();
let boss: PgBoss;

beforeAll(async () => {
  boss = criarPgBoss(urlBancoTeste(), { max: 3, supervisionar: false, schema: SCHEMA });
  await boss.start();
  await criarFilas(boss);
  await boss.deleteAllJobs();
}, 60_000);
afterAll(async () => {
  await boss.stop({ graceful: false });
  await sql.unsafe(`drop schema if exists ${SCHEMA} cascade`);
  await sql.end();
});

async function jobs(nome: 'midia.processar-foto', chave: string) {
  return boss.findJobs<{ evidenciaId: string }>(nome, { id: idDoJob(nome, chave) });
}

describe('fila no pg-boss', () => {
  it('o envio dentro da transação some no rollback e aparece no commit', async () => {
    const chave = randomUUID();
    await expect(
      db.transaction(async (tx) => {
        await enviarPorPgBoss(boss, 'midia.processar-foto', { evidenciaId: chave }, { tx, chaveUnica: chave });
        throw new Error('desfaz');
      }),
    ).rejects.toThrow('desfaz');
    expect(await jobs('midia.processar-foto', chave)).toHaveLength(0);

    await db.transaction(async (tx) => {
      await enviarPorPgBoss(boss, 'midia.processar-foto', { evidenciaId: chave }, { tx, chaveUnica: chave });
    });
    const achados = await jobs('midia.processar-foto', chave);
    expect(achados).toHaveLength(1);
    expect(achados[0].data).toEqual({ evidenciaId: chave });
  });

  it('chaveUnica: o segundo envio com a mesma chave é ignorado', async () => {
    const chave = randomUUID();
    await enviarPorPgBoss(boss, 'midia.processar-foto', { evidenciaId: chave }, { chaveUnica: chave });
    await enviarPorPgBoss(boss, 'midia.processar-foto', { evidenciaId: chave }, { chaveUnica: chave });
    expect(await jobs('midia.processar-foto', chave)).toHaveLength(1);
  });

  it('iniciarEm deixa a tarefa para depois', async () => {
    const chave = randomUUID();
    const depois = new Date(Date.now() + 60 * 60 * 1000);
    await enviarPorPgBoss(boss, 'midia.processar-foto', { evidenciaId: chave }, { chaveUnica: chave, iniciarEm: depois });
    const [job] = await jobs('midia.processar-foto', chave);
    expect(job.startAfter.getTime()).toBeGreaterThanOrEqual(depois.getTime() - 1000);
  });

  it('as filas nascem com as tentativas e o prazo do contrato', async () => {
    expect(await boss.getQueue('midia.transcodificar')).toMatchObject({ retryLimit: 4, expireInSeconds: 3600 });
    expect(await boss.getQueue('ml.enviar-resultado')).toMatchObject({ retryLimit: 4, expireInSeconds: 300 });
  });
});
```

Rode: `npm run test:int -- src/modules/fila/fila.int.test.ts`
Esperado: PASS. **Se o primeiro teste falhar** (o adaptador não conseguir usar a transação do postgres.js), aplique a saída prevista no contrato §5.1: em `enviarPorPgBoss`, ignore `opcoes.tx`; e, em todo lugar que envia com `tx`, mova o `fila.enviar` para logo depois do `db.transaction(...)` (os manipuladores já são idempotentes). Troque o primeiro teste por um que confira só o commit, e anote a mudança no commit.

- [ ] **Passo 5: Verificar e commitar**

```bash
cd "/c/Users/idmpc/Dvoluções Markt"
npm test && npm run test:int && npm run typecheck && npm run lint
git add package.json package-lock.json next.config.ts src/modules/fila
git commit -m "feat: fila de tarefas com pg-boss 12 (envio na transação, chave única, 5 tentativas)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 5: Worker, `/saude` com a fila, serviço `worker` no Docker e worker no e2e

**Arquivos:**
- Criar: `src/worker/tipos.ts`, `src/worker/index.ts`, `src/worker/manipuladores/midia.ts`, `mercado-livre.ts`, `fiscal.ts`, `lotes.ts`, `acabamento.ts`, `scripts/worker.ts`
- Modificar: `package.json` (scripts `worker` e `build:scripts`; **congelados** depois da Parte A), `src/modules/saude/saude.ts`, `src/app/api/saude/route.ts`, `docker-compose.prod.yml`
- Modificar: `tests/e2e/dados.ts`, `tests/e2e/global-setup.ts`, `playwright.config.ts` (congelados depois da Parte A, contrato §3)
- Testes: `src/worker/index.test.ts`, `src/worker/worker.int.test.ts`, `src/modules/saude/saude.int.test.ts` (substituir), `tests/e2e/saude.spec.ts`

**Interfaces:**
- Consome: `Fila`, `criarPgBoss`, `criarFilas`, `enviarPorPgBoss`, `CONFIG_TAREFAS`, `NOMES_TAREFAS`, `FUSO_AGENDAS`, `TAREFAS_NA_SUBIDA`, `verificarFila` (Tarefa 4); `criarDb`, `Db`.
- Produz:
  - em `src/worker/tipos.ts` (contrato §5.1): `type ContextoTarefa = { db: Db; fila: Fila; agora: Date; tentativa: number }`, `type Manipulador<N extends NomeTarefa> = (dados: DadosTarefa[N], ctx: ContextoTarefa) => Promise<void>`, `type Manipuladores = { [N in NomeTarefa]?: Manipulador<N> }`
  - em `src/worker/manipuladores/*.ts`: `manipuladoresMidia`, `manipuladoresMercadoLivre`, `manipuladoresFiscal`, `manipuladoresLotes`, `manipuladoresAcabamento` (todos `Manipuladores`, vazios; cada fase só preenche o seu)
  - em `src/worker/index.ts`: `MANIPULADORES`, `executarTarefa(manipuladores, nome, job: { data; retryCount }, base: { db; fila }, agora?)`, `type OpcoesWorker = { url: string; manipuladores?: Manipuladores; schema?: string; intervaloSegundos?: number; registrar?: (linha: Record<string, unknown>) => void }`, `iniciarWorker(o): Promise<{ boss: PgBoss; parar(): Promise<void> }>`
  - `verificarSaude(sql, verificarFila, prazoMs?)` → `{ status, banco, fila }`
  - em `tests/e2e/dados.ts`: `AMBIENTE_E2E` (disco em `.dados-e2e`, `SEGREDO_LINKS` do e2e e os falsos)
  - scripts: `npm run worker`; `npm run build:scripts` gera também `dist/worker.mjs`

- [ ] **Passo 1: Escrever os testes que falham**

`src/worker/index.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { Db } from '@/db/client';
import { FilaMemoria } from '@/modules/fila/fila';
import { executarTarefa } from './index';

describe('executarTarefa', () => {
  it('passa os dados, o banco, a fila e a tentativa (começando em 1)', async () => {
    const manipulador = vi.fn(async () => {});
    const db = {} as Db;
    const fila = new FilaMemoria();
    const agora = new Date('2026-11-12T12:00:00Z');
    await executarTarefa({ 'midia.processar-foto': manipulador }, 'midia.processar-foto', { data: { evidenciaId: 'e1' }, retryCount: 2 }, { db, fila }, agora);
    expect(manipulador).toHaveBeenCalledWith({ evidenciaId: 'e1' }, { db, fila, agora, tentativa: 3 });
  });

  it('sem manipulador, lança (a tarefa fica para uma nova tentativa)', async () => {
    await expect(
      executarTarefa({}, 'nfe.emitir', { data: { notaFiscalId: 'n1' }, retryCount: 0 }, { db: {} as Db, fila: new FilaMemoria() }),
    ).rejects.toThrow('Nenhum manipulador para a tarefa nfe.emitir');
  });
});
```

`src/worker/worker.int.test.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { criarDbTeste, urlBancoTeste } from '../../tests/helpers/db';
import { iniciarWorker } from './index';

const SCHEMA = 'pgboss_worker_int';
const { sql } = criarDbTeste();
afterAll(async () => {
  await sql.unsafe(`drop schema if exists ${SCHEMA} cascade`);
  await sql.end();
});

describe('iniciarWorker (pg-boss de verdade)', () => {
  it('roda o manipulador com os dados enviados', async () => {
    const recebidos: unknown[] = [];
    const worker = await iniciarWorker({
      url: urlBancoTeste(),
      schema: SCHEMA,
      intervaloSegundos: 0.5,
      registrar: () => {},
      manipuladores: {
        'midia.processar-foto': async (dados) => {
          recebidos.push(dados);
        },
      },
    });
    try {
      const evidenciaId = randomUUID();
      await worker.boss.send('midia.processar-foto', { evidenciaId });
      await expect.poll(() => recebidos, { timeout: 20_000, interval: 250 }).toEqual([{ evidenciaId }]);
    } finally {
      await worker.parar();
    }
  }, 60_000);

  it('uma tarefa que sempre falha roda 5 vezes e termina como falha (spec §11: retryLimit 4)', async () => {
    const tentativas: number[] = [];
    const worker = await iniciarWorker({
      url: urlBancoTeste(),
      schema: SCHEMA,
      intervaloSegundos: 0.5,
      registrar: () => {},
      manipuladores: {
        'limpeza.temporarios': async (_dados, ctx) => {
          tentativas.push(ctx.tentativa);
          throw new Error('falha de teste');
        },
      },
    });
    try {
      // Sem espera entre as tentativas, só neste teste.
      await worker.boss.updateQueue('limpeza.temporarios', { retryDelay: 0, retryBackoff: false });
      const id = randomUUID();
      await worker.boss.send('limpeza.temporarios', {}, { id });
      await expect
        .poll(async () => (await worker.boss.findJobs('limpeza.temporarios', { id }))[0]?.state, { timeout: 40_000, interval: 500 })
        .toBe('failed');
      expect(tentativas).toEqual([1, 2, 3, 4, 5]);
    } finally {
      await worker.parar();
    }
  }, 60_000);
});
```

`src/modules/saude/saude.int.test.ts` (substitua o conteúdo):

```ts
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { criarDbTeste } from '../../../tests/helpers/db';
import { verificarSaude } from './saude';

const { sql } = criarDbTeste();
afterAll(async () => {
  await sql.end();
});
const filaOk = async () => {};

describe('verificarSaude (spec §11: banco e fila)', () => {
  it('responde ok quando o banco e a fila atendem', async () => {
    expect(await verificarSaude(sql, filaOk)).toEqual({ status: 'ok', banco: 'ok', fila: 'ok' });
  });

  it('responde erro quando o banco não atende', async () => {
    const quebrado = postgres('postgres://ninguem:nada@127.0.0.1:1/nada', { max: 1, connect_timeout: 1 });
    try {
      expect(await verificarSaude(quebrado, filaOk)).toEqual({ status: 'erro', banco: 'falhou', fila: 'ok' });
    } finally {
      await quebrado.end({ timeout: 0 });
    }
  });

  it('responde erro quando a fila falha ou não responde a tempo', async () => {
    expect(await verificarSaude(sql, async () => Promise.reject(new Error('fora')))).toEqual({ status: 'erro', banco: 'ok', fila: 'falhou' });
    expect(await verificarSaude(sql, () => new Promise<void>(() => {}), 50)).toEqual({ status: 'erro', banco: 'ok', fila: 'falhou' });
  });
});
```

Rode: `npm test -- src/worker && npm run test:int -- src/worker src/modules/saude`
Esperado: FAIL (`./index` não existe; `verificarSaude` ainda não recebe a fila).

- [ ] **Passo 2: Implementar o worker**

`src/worker/tipos.ts`:

```ts
import type { Db } from '@/db/client';
import type { Fila } from '@/modules/fila/fila';
import type { DadosTarefa, NomeTarefa } from '@/modules/fila/tarefas';

/** Contrato §5.1. `tentativa` começa em 1; a 5ª é a última (spec §11). */
export type ContextoTarefa = { db: Db; fila: Fila; agora: Date; tentativa: number };

/**
 * Manipulador idempotente: pode rodar duas vezes; se a entidade não existe mais, termina sem erro.
 * Lançar exceção = nova tentativa. Erro definitivo de negócio não lança: grava o resultado no domínio.
 */
export type Manipulador<N extends NomeTarefa> = (dados: DadosTarefa[N], ctx: ContextoTarefa) => Promise<void>;

export type Manipuladores = { [N in NomeTarefa]?: Manipulador<N> };
```

`src/worker/manipuladores/midia.ts`:

```ts
import type { Manipuladores } from '../tipos';

/** Fase 2: midia.processar-foto, midia.transcodificar e limpeza.temporarios. Só a Fase 2 edita este arquivo. */
export const manipuladoresMidia: Manipuladores = {};
```

`src/worker/manipuladores/mercado-livre.ts`:

```ts
import type { Manipuladores } from '../tipos';

/** Fase 3: ml.*. Só a Fase 3 edita este arquivo. */
export const manipuladoresMercadoLivre: Manipuladores = {};
```

`src/worker/manipuladores/fiscal.ts`:

```ts
import type { Manipuladores } from '../tipos';

/** Fase 4: nfe.*. Só a Fase 4 edita este arquivo. */
export const manipuladoresFiscal: Manipuladores = {};
```

`src/worker/manipuladores/lotes.ts`:

```ts
import type { Manipuladores } from '../tipos';

/** Fase 5: lotes.alocar-pendentes. Só a Fase 5 edita este arquivo. */
export const manipuladoresLotes: Manipuladores = {};
```

`src/worker/manipuladores/acabamento.ts`:

```ts
import type { Manipuladores } from '../tipos';

/** Fase 6: midia.retencao. Só a Fase 6 edita este arquivo. */
export const manipuladoresAcabamento: Manipuladores = {};
```

`src/worker/index.ts`:

```ts
import type { PgBoss } from 'pg-boss';
import { criarDb, type Db } from '@/db/client';
import { criarFilas, criarPgBoss, enviarPorPgBoss, type Fila } from '@/modules/fila/fila';
import { CONFIG_TAREFAS, FUSO_AGENDAS, NOMES_TAREFAS, TAREFAS_NA_SUBIDA, type DadosTarefa, type NomeTarefa } from '@/modules/fila/tarefas';
import { manipuladoresAcabamento } from './manipuladores/acabamento';
import { manipuladoresFiscal } from './manipuladores/fiscal';
import { manipuladoresLotes } from './manipuladores/lotes';
import { manipuladoresMercadoLivre } from './manipuladores/mercado-livre';
import { manipuladoresMidia } from './manipuladores/midia';
import type { Manipulador, Manipuladores } from './tipos';

/** A junção dos manipuladores de todas as fases (cada uma preenche só o seu arquivo). */
export const MANIPULADORES: Manipuladores = {
  ...manipuladoresMidia,
  ...manipuladoresMercadoLivre,
  ...manipuladoresFiscal,
  ...manipuladoresLotes,
  ...manipuladoresAcabamento,
};

type Registro = (linha: Record<string, unknown>) => void;

/** Log estruturado em JSON (spec §11). */
const registrarNoConsole: Registro = (linha) => {
  console.log(JSON.stringify({ em: new Date().toISOString(), origem: 'worker', ...linha }));
};

/** Roda o manipulador de uma tarefa. O pg-boss conta as novas tentativas em `retryCount`; aqui a tentativa começa em 1. */
export async function executarTarefa<N extends NomeTarefa>(
  manipuladores: Manipuladores,
  nome: N,
  job: { data: DadosTarefa[N]; retryCount: number },
  base: { db: Db; fila: Fila },
  agora: Date = new Date(),
): Promise<void> {
  const manipulador = manipuladores[nome] as Manipulador<N> | undefined;
  if (!manipulador) throw new Error(`Nenhum manipulador para a tarefa ${nome}`);
  await manipulador(job.data, { db: base.db, fila: base.fila, agora, tentativa: job.retryCount + 1 });
}

export type OpcoesWorker = {
  url: string;
  manipuladores?: Manipuladores;
  /** Só nos testes: um schema do pg-boss separado. */
  schema?: string;
  intervaloSegundos?: number;
  registrar?: Registro;
};

/** Liga o pg-boss com manutenção e agendas, e trabalha nas filas que têm manipulador. */
export async function iniciarWorker(o: OpcoesWorker): Promise<{ boss: PgBoss; parar(): Promise<void> }> {
  const manipuladores = o.manipuladores ?? MANIPULADORES;
  const registrar = o.registrar ?? registrarNoConsole;
  const boss = criarPgBoss(o.url, { max: 5, supervisionar: true, schema: o.schema });
  await boss.start();
  await criarFilas(boss);
  const { db, sql } = criarDb(o.url);
  const fila: Fila = { enviar: (nome, dados, opcoes) => enviarPorPgBoss(boss, nome, dados, opcoes) };

  const ativas = NOMES_TAREFAS.filter((nome) => manipuladores[nome]);
  for (const nome of ativas) {
    // Uma tarefa por vez em cada fila: ffmpeg e sharp disputam a única vCPU com o site (pesquisa §5.2).
    await boss.work(nome, { batchSize: 1, localConcurrency: 1, pollingIntervalSeconds: o.intervaloSegundos ?? 2 }, async ([job]) => {
      const inicio = Date.now();
      const tentativa = job.retryCount + 1;
      try {
        await executarTarefa(manipuladores, nome, job as { data: DadosTarefa[typeof nome]; retryCount: number }, { db, fila });
        registrar({ nivel: 'info', tarefa: nome, id: job.id, tentativa, ms: Date.now() - inicio });
      } catch (erro) {
        registrar({ nivel: 'erro', tarefa: nome, id: job.id, tentativa, mensagem: erro instanceof Error ? erro.message : String(erro) });
        throw erro;
      }
    });
    const agenda = CONFIG_TAREFAS[nome].agenda;
    if (agenda) await boss.schedule(nome, agenda, {}, { tz: FUSO_AGENDAS });
  }
  for (const nome of TAREFAS_NA_SUBIDA) {
    if (manipuladores[nome]) await fila.enviar(nome, {});
  }
  registrar({ nivel: 'info', mensagem: 'worker iniciado', tarefas: ativas });

  return {
    boss,
    async parar() {
      await boss.stop({ graceful: true, timeout: 30_000 });
      await sql.end();
    },
  };
}
```

`scripts/worker.ts`:

```ts
import { iniciarWorker } from '@/worker';

/** Processo das tarefas de fundo (spec §4.1). Em produção: `node dist/worker.mjs`; no PC: `npm run worker`. */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL não definido.');
    process.exit(1);
  }
  const worker = await iniciarWorker({ url });
  let parando = false;
  const parar = async () => {
    if (parando) return;
    parando = true;
    await worker.parar();
    process.exit(0);
  };
  process.on('SIGTERM', () => void parar());
  process.on('SIGINT', () => void parar());
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
```

No `package.json`, dentro de `"scripts"`:
1. Acrescente a linha `"worker": "node --env-file=.env --import tsx scripts/worker.ts",` logo depois de `"db:migrar"`.
2. Troque a linha `"build:scripts"` inteira por (a lista de `--external` já prevê o `sharp` da Parte B; `pg-native` e `pg-cloudflare` são opcionais do `pg` que nunca carregam no worker):

```json
    "build:scripts": "esbuild scripts/migrar.ts scripts/criar-usuario.ts scripts/worker.ts --bundle --platform=node --format=esm --outdir=dist --out-extension:.js=.mjs --external:@node-rs/argon2 --external:sharp --external:pg-native --external:pg-cloudflare --banner:js=\"import { createRequire } from 'module'; const require = createRequire(import.meta.url);\"",
```

- [ ] **Passo 3: `/saude` também confere a fila**

`src/modules/saude/saude.ts` (substitua o conteúdo):

```ts
import type { Sql } from 'postgres';

export type ResultadoSaude = { status: 'ok' | 'erro'; banco: 'ok' | 'falhou'; fila: 'ok' | 'falhou' };

function comPrazo<T>(promessa: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolver, rejeitar) => {
    const relogio = setTimeout(() => rejeitar(new Error('tempo esgotado')), ms);
    promessa.then(
      (valor) => {
        clearTimeout(relogio);
        resolver(valor);
      },
      (erro: unknown) => {
        clearTimeout(relogio);
        rejeitar(erro);
      },
    );
  });
}

/** Spec §11: o /saude verifica o banco e a fila. Cada verificação tem um prazo, para o /saude nunca travar. */
export async function verificarSaude(sql: Sql, verificarFila: () => Promise<void>, prazoMs = 5000): Promise<ResultadoSaude> {
  const banco = await comPrazo(Promise.resolve(sql`select 1`), prazoMs).then(
    () => 'ok' as const,
    () => 'falhou' as const,
  );
  const fila = await comPrazo(verificarFila(), prazoMs).then(
    () => 'ok' as const,
    () => 'falhou' as const,
  );
  return { status: banco === 'ok' && fila === 'ok' ? 'ok' : 'erro', banco, fila };
}
```

`src/app/api/saude/route.ts` (substitua o conteúdo):

```ts
import { obterConexao } from '@/db';
import { verificarFila } from '@/modules/fila/fila';
import { verificarSaude } from '@/modules/saude/saude';

export const dynamic = 'force-dynamic';

export async function GET() {
  const resultado = await verificarSaude(obterConexao().sql, verificarFila);
  return Response.json(resultado, { status: resultado.status === 'ok' ? 200 : 503 });
}
```

Rode: `npm test -- src/worker && npm run test:int -- src/worker src/modules/saude`
Esperado: PASS (o teste das 5 tentativas leva uns 5 s).

- [ ] **Passo 4: Rodar o worker no PC e empacotar**

```bash
cd "/c/Users/idmpc/Dvoluções Markt"
npm run build:scripts
ls dist
timeout 15 npm run worker || true
```

Esperado: `dist/` com `migrar.mjs`, `criar-usuario.mjs` e `worker.mjs`, sem erro do esbuild; o `npm run worker` mostra uma linha JSON com `"mensagem":"worker iniciado"` e `"tarefas":[]` (nenhuma fase tem manipulador ainda) e é encerrado pelo `timeout`. Se o esbuild reclamar de outro opcional do `pg` (`Could not resolve "..."`), acrescente `--external:<nome>` e anote no commit.

- [ ] **Passo 5: Serviço `worker` no Docker Compose**

Em `docker-compose.prod.yml`, logo depois do bloco do serviço `web` (antes de `postgres:`), acrescente:

```yaml
  worker:
    # Mesma imagem do web, outro ponto de entrada. Não migra o banco: quem migra é o web, na subida.
    image: ghcr.io/c77idm-dev/devolucoes:${IMAGEM_TAG:-main}
    restart: unless-stopped
    env_file: .env.producao
    command: ["node", "dist/worker.mjs"]
    depends_on:
      postgres:
        condition: service_healthy
    # Dá tempo à tarefa em andamento de terminar (o worker para com graceful).
    stop_grace_period: 40s
    deploy:
      resources:
        limits:
          memory: 1g
```

- [ ] **Passo 6: O e2e sobe o worker (contrato §2, P2 item 10)**

Acrescente no **final** de `tests/e2e/dados.ts`:

```ts
/** Ambiente do servidor e do worker do e2e: mídia no disco local (.dados-e2e), links assinados e os falsos. */
export const AMBIENTE_E2E = {
  ARMAZENAMENTO: 'disco',
  MIDIA_DIR: '.dados-e2e/midia',
  MIDIA_TMP_DIR: '.dados-e2e/tmp',
  SEGREDO_LINKS: 'segredo-dos-testes-ponta-a-ponta-com-mais-de-32-caracteres',
  ML_CONECTOR: 'falso',
  EMISSOR_NFE: 'falso',
} as const;
```

`tests/e2e/global-setup.ts` (substitua o conteúdo):

```ts
import { spawn } from 'node:child_process';
import { mkdirSync, openSync, rmSync } from 'node:fs';
import { criarDb } from '../../src/db/client';
import { migrar } from '../../src/db/migrate';
import { criarUsuario } from '../../src/modules/auth/usuarios';
import { limparTabelas, urlBancoTeste } from '../helpers/db';
import { AMBIENTE_E2E, PORTA_E2E, USUARIOS_E2E } from './dados';

/**
 * Prepara o banco de testes, sobe o worker do e2e (o mesmo banco e o mesmo disco do servidor) e devolve
 * a função que o encerra no fim (o Playwright usa o retorno do globalSetup como teardown).
 */
export default async function globalSetup() {
  const url = urlBancoTeste();
  await migrar(url);
  const { db, sql } = criarDb(url);
  try {
    await limparTabelas(sql);
    // Tarefas de execuções anteriores: o limparTabelas só esvazia o schema public.
    await sql.unsafe(`do $$ begin if to_regclass('pgboss.job') is not null then truncate table pgboss.job; end if; end $$`);
    await criarUsuario(db, USUARIOS_E2E.gestor);
    await criarUsuario(db, USUARIOS_E2E.operador);
    await criarUsuario(db, USUARIOS_E2E.fiscal);
  } finally {
    await sql.end();
  }
  rmSync('.dados-e2e', { recursive: true, force: true });
  mkdirSync('.dados-e2e', { recursive: true });
  const log = openSync('.dados-e2e/worker.log', 'a');
  const worker = spawn(process.execPath, ['--import', 'tsx', 'scripts/worker.ts'], {
    env: { ...process.env, ...AMBIENTE_E2E, PORTA_E2E: String(PORTA_E2E), DATABASE_URL: url },
    stdio: ['ignore', log, log],
    windowsHide: true,
  });
  return async () => {
    worker.kill();
  };
}
```

Em `playwright.config.ts`:
1. Troque o import de `./tests/e2e/dados` por:

```ts
import { AMBIENTE_E2E, PORTA_E2E as PORTA, URL_E2E } from './tests/e2e/dados';
```

2. Troque a linha `env: { DATABASE_URL: ... },` do `webServer` por:

```ts
    // O Next não sobrescreve variáveis já definidas: o servidor de teste usa o banco de testes, o disco do e2e e os falsos.
    // PORTA_E2E marca o build de produção do e2e (o lerEnv aceita os falsos só nele).
    env: {
      DATABASE_URL: process.env.DATABASE_URL_TEST ?? '',
      ...AMBIENTE_E2E,
      PORTA_E2E: String(PORTA),
      ...(MODO_DEV ? {} : { NEXT_DIST_DIR: '.next-e2e' }),
    },
```

`tests/e2e/saude.spec.ts`:

```ts
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

test('/api/saude confere o banco e a fila', async ({ request }) => {
  const resposta = await request.get('/api/saude');
  expect(resposta.status()).toBe(200);
  expect(await resposta.json()).toEqual({ status: 'ok', banco: 'ok', fila: 'ok' });
});

test('o worker do e2e está no ar', async () => {
  const log = () => {
    try {
      return readFileSync('.dados-e2e/worker.log', 'utf8');
    } catch {
      return '';
    }
  };
  await expect.poll(log, { timeout: 30_000 }).toContain('worker iniciado');
});
```

Rode: `npm run test:e2e`
Esperado: PASS em `computador` e `celular` (os specs da Fase 1 continuam verdes).

- [ ] **Passo 7: Verificar e commitar**

```bash
cd "/c/Users/idmpc/Dvoluções Markt"
npm test && npm run test:int && npm run typecheck && npm run lint
git add src/worker scripts/worker.ts package.json src/modules/saude src/app/api/saude docker-compose.prod.yml tests/e2e playwright.config.ts
git commit -m "feat: worker do pg-boss (scripts/worker.ts e dist/worker.mjs), /saude com a fila, serviço worker no Docker e worker no e2e" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 6: Armazenamento (disco e memória) e links temporários

**Por que assim:** a interface `ArmazenamentoArquivos` é a da spec §4.3, com `existe` e as opções do contrato §5.2. No disco não existe link assinado nativo, então o link é `/api/arquivos?c=&exp=&sig=` com HMAC-SHA256 de `SEGREDO_LINKS`, e a rota ainda exige a sessão (spec §9: "nunca público"). Cada evidência guarda o `provedor`, e `armazenamentoDoProvedor` acha o lugar certo mesmo depois de trocar disco por S3 (contrato D2).

**Arquivos:**
- Criar: `src/modules/midia/erros.ts`, `chaves.ts`, `links.ts`, `range.ts`, `armazenamento.ts`, `armazenamento-disco.ts`, `armazenamento-memoria.ts`
- Criar: `src/app/api/arquivos/route.ts`
- Testes: `src/modules/midia/chaves.test.ts`, `links.test.ts`, `range.test.ts`, `armazenamento.test.ts`, `tests/e2e/arquivos.spec.ts`

**Interfaces:**
- Consome: `lerEnv` (`ARMAZENAMENTO`, `MIDIA_DIR`, `SEGREDO_LINKS`); `usuarioAtual`; `AMBIENTE_E2E` (Tarefa 5).
- Produz:
  - `interface ArmazenamentoArquivos` (contrato §5.2): `salvar(caminho, conteudo: Readable, opcoes?: { tipoConteudo?: string; tamanho?: number })`, `ler(caminho): Promise<Readable>`, `urlTemporaria(caminho, segundos): Promise<string>`, `apagar(caminho)`, `existe(caminho): Promise<boolean>`
  - `type ProvedorArmazenamento = 'disco' | 's3' | 'memoria'`, `obterArmazenamento()`, `definirArmazenamentoParaTestes(a | null)`, `armazenamentoDoProvedor(provedor: string)`, `provedorAtual(): ProvedorArmazenamento`, `discoLocal(): ArmazenamentoDisco`
  - `class ArmazenamentoDisco` (`readonly provedor = 'disco'`, `caminhoAbsoluto(chave)`), `class ArmazenamentoMemoria` (`readonly provedor = 'memoria'`, `readonly arquivos: Map<string, { conteudo: Buffer; tipoConteudo?: string }>`)
  - `class ErroArquivoNaoEncontrado`, `class ErroChaveInvalida`
  - `validarChave(chave)`, `chaveEvidencia(devolucaoId, evidenciaId, extensao: 'jpg' | 'mp4'): string`, `tipoConteudoPorExtensao(chave): string`
  - `assinarLink(segredo, caminho, expiraEm)`, `verificarLink(segredo, { c, exp, sig }, agora)` → `{ ok: true; caminho; expiraEm } | { ok: false; motivo: 'invalido' | 'expirado' }`
  - `interpretarRange(cabecalho, tamanho)` → `{ inicio; fim } | null | 'invalido'`
  - rota `GET /api/arquivos?c=&exp=&sig=` (401 sem sessão, 403 assinatura errada, 410 vencido, 404 sem arquivo, 200/206)

- [ ] **Passo 1: Escrever os testes que falham**

`src/modules/midia/chaves.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { chaveEvidencia, tipoConteudoPorExtensao, validarChave } from './chaves';
import { ErroChaveInvalida } from './erros';

describe('chaves do armazenamento (contrato §5.2)', () => {
  it('evidencias/{devolucaoId}/{evidenciaId}.{jpg|mp4}', () => {
    expect(chaveEvidencia('d1', 'e1', 'jpg')).toBe('evidencias/d1/e1.jpg');
    expect(chaveEvidencia('d1', 'e2', 'mp4')).toBe('evidencias/d1/e2.mp4');
  });

  it('aceita chaves simples e recusa caminhos perigosos', () => {
    expect(() => validarChave('nfe/2026/11/abc-danfe.pdf')).not.toThrow();
    for (const ruim of ['', '../x', '/x', 'a//b', 'a b', 'a/../b', 'a\\b', 'x'.repeat(301)]) {
      expect(() => validarChave(ruim), ruim).toThrow(ErroChaveInvalida);
    }
  });

  it('tipo do conteúdo pela extensão', () => {
    expect(tipoConteudoPorExtensao('a/b.jpg')).toBe('image/jpeg');
    expect(tipoConteudoPorExtensao('a/b.mp4')).toBe('video/mp4');
    expect(tipoConteudoPorExtensao('a/b.xml')).toBe('application/xml');
    expect(tipoConteudoPorExtensao('a/b.pdf')).toBe('application/pdf');
    expect(tipoConteudoPorExtensao('a/b.bin')).toBe('application/octet-stream');
  });
});
```

`src/modules/midia/links.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { assinarLink, verificarLink } from './links';

const SEGREDO = 's'.repeat(32);
const AGORA = new Date('2026-11-12T12:00:00Z');
const EXP = AGORA.getTime() / 1000 + 600;
const CAMINHO = 'evidencias/d1/e1.jpg';

describe('links temporários do disco (spec §9: 10 min, nunca público)', () => {
  it('aceita o link certo dentro do prazo', () => {
    const sig = assinarLink(SEGREDO, CAMINHO, EXP);
    expect(verificarLink(SEGREDO, { c: CAMINHO, exp: String(EXP), sig }, AGORA)).toEqual({ ok: true, caminho: CAMINHO, expiraEm: EXP });
  });

  it('recusa assinatura errada, caminho trocado, outro segredo ou parâmetro faltando', () => {
    const sig = assinarLink(SEGREDO, CAMINHO, EXP);
    const invalido = { ok: false, motivo: 'invalido' };
    expect(verificarLink(SEGREDO, { c: CAMINHO, exp: String(EXP), sig: 'x' + sig.slice(1) }, AGORA)).toEqual(invalido);
    expect(verificarLink(SEGREDO, { c: 'evidencias/d1/outro.jpg', exp: String(EXP), sig }, AGORA)).toEqual(invalido);
    expect(verificarLink('t'.repeat(32), { c: CAMINHO, exp: String(EXP), sig }, AGORA)).toEqual(invalido);
    expect(verificarLink(SEGREDO, { c: CAMINHO, exp: null, sig }, AGORA)).toEqual(invalido);
    expect(verificarLink(SEGREDO, { c: CAMINHO, exp: String(EXP + 1), sig }, AGORA)).toEqual(invalido);
  });

  it('recusa o link vencido como "expirado"', () => {
    const exp = AGORA.getTime() / 1000 - 1;
    const sig = assinarLink(SEGREDO, CAMINHO, exp);
    expect(verificarLink(SEGREDO, { c: CAMINHO, exp: String(exp), sig }, AGORA)).toEqual({ ok: false, motivo: 'expirado' });
  });
});
```

`src/modules/midia/range.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { interpretarRange } from './range';

describe('interpretarRange (vídeo no navegador pede pedaços)', () => {
  it('sem cabeçalho: arquivo inteiro', () => {
    expect(interpretarRange(null, 100)).toBeNull();
  });

  it.each([
    ['bytes=0-9', { inicio: 0, fim: 9 }],
    ['bytes=90-', { inicio: 90, fim: 99 }],
    ['bytes=-10', { inicio: 90, fim: 99 }],
    ['bytes=50-500', { inicio: 50, fim: 99 }],
  ])('%s', (cabecalho, esperado) => {
    expect(interpretarRange(cabecalho, 100)).toEqual(esperado);
  });

  it.each(['bytes=100-', 'bytes=20-10', 'bytes=-0', 'bytes=-', 'itens=0-1', 'bytes=0-1,5-6'])('%s é inválido', (cabecalho) => {
    expect(interpretarRange(cabecalho, 100)).toBe('invalido');
  });
});
```

`src/modules/midia/armazenamento.test.ts`:

```ts
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ArmazenamentoArquivos } from './armazenamento';
import { ArmazenamentoDisco } from './armazenamento-disco';
import { ArmazenamentoMemoria } from './armazenamento-memoria';
import { ErroArquivoNaoEncontrado, ErroChaveInvalida } from './erros';
import { verificarLink } from './links';

const SEGREDO = 's'.repeat(32);
let raiz: string;

beforeEach(async () => {
  raiz = await mkdtemp(join(tmpdir(), 'midia-'));
});
afterEach(async () => {
  await rm(raiz, { recursive: true, force: true });
});

async function texto(r: Readable): Promise<string> {
  const partes: Buffer[] = [];
  for await (const parte of r) partes.push(Buffer.from(parte));
  return Buffer.concat(partes).toString('utf8');
}

const CASOS: [string, () => ArmazenamentoArquivos][] = [
  ['disco', () => new ArmazenamentoDisco(raiz, SEGREDO)],
  ['memória', () => new ArmazenamentoMemoria()],
];

describe.each(CASOS)('ArmazenamentoArquivos (%s)', (_nome, criar) => {
  it('salva, lê, confere e apaga (apagar de novo não é erro)', async () => {
    const a = criar();
    await a.salvar('evidencias/d1/e1.jpg', Readable.from([Buffer.from('ola')]), { tipoConteudo: 'image/jpeg', tamanho: 3 });
    expect(await a.existe('evidencias/d1/e1.jpg')).toBe(true);
    expect(await texto(await a.ler('evidencias/d1/e1.jpg'))).toBe('ola');
    await a.apagar('evidencias/d1/e1.jpg');
    expect(await a.existe('evidencias/d1/e1.jpg')).toBe(false);
    await a.apagar('evidencias/d1/e1.jpg');
  });

  it('ler o que não existe lança ErroArquivoNaoEncontrado', async () => {
    await expect(criar().ler('evidencias/x/y.jpg')).rejects.toThrow(ErroArquivoNaoEncontrado);
  });

  it('recusa chave perigosa', async () => {
    await expect(criar().salvar('../fora.txt', Readable.from([Buffer.from('x')]))).rejects.toThrow(ErroChaveInvalida);
  });
});

describe('ArmazenamentoDisco', () => {
  it('o link temporário aponta para /api/arquivos e vale pelo tempo pedido', async () => {
    const agora = new Date('2026-11-12T12:00:00Z');
    const a = new ArmazenamentoDisco(raiz, SEGREDO, () => agora);
    const url = new URL(await a.urlTemporaria('evidencias/d1/e1.jpg', 600), 'http://localhost');
    expect(url.pathname).toBe('/api/arquivos');
    const p = url.searchParams;
    expect(verificarLink(SEGREDO, { c: p.get('c'), exp: p.get('exp'), sig: p.get('sig') }, agora)).toEqual({
      ok: true,
      caminho: 'evidencias/d1/e1.jpg',
      expiraEm: agora.getTime() / 1000 + 600,
    });
  });

  it('grava de forma atômica: não sobra arquivo parcial', async () => {
    const a = new ArmazenamentoDisco(raiz, SEGREDO);
    await a.salvar('evidencias/d1/e2.mp4', Readable.from([Buffer.from('video')]));
    expect(await readdir(join(raiz, 'evidencias', 'd1'))).toEqual(['e2.mp4']);
  });
});
```

Rode: `npm test -- src/modules/midia`
Esperado: FAIL (os módulos não existem).

- [ ] **Passo 2: Implementar chaves, links, Range e as duas implementações**

`src/modules/midia/erros.ts`:

```ts
export class ErroArquivoNaoEncontrado extends Error {
  constructor(chave: string) {
    super(`Arquivo não encontrado no armazenamento: ${chave}`);
    this.name = 'ErroArquivoNaoEncontrado';
  }
}

export class ErroChaveInvalida extends Error {
  constructor(chave: string) {
    super(`Chave de armazenamento inválida: ${JSON.stringify(chave.slice(0, 80))}`);
    this.name = 'ErroChaveInvalida';
  }
}
```

`src/modules/midia/chaves.ts`:

```ts
import { ErroChaveInvalida } from './erros';

/** Segmentos começam por letra ou número e só têm letras, números, ponto, hífen e sublinhado: sem "..", sem barra inicial. */
const CHAVE_VALIDA = /^[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/;

export function validarChave(chave: string): void {
  if (chave.length === 0 || chave.length > 300 || !CHAVE_VALIDA.test(chave)) throw new ErroChaveInvalida(chave);
}

/** Contrato §5.2. O nome do arquivo que veio do celular nunca entra na chave. */
export function chaveEvidencia(devolucaoId: string, evidenciaId: string, extensao: 'jpg' | 'mp4'): string {
  return `evidencias/${devolucaoId}/${evidenciaId}.${extensao}`;
}

const TIPOS: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  xml: 'application/xml',
  pdf: 'application/pdf',
};

export function tipoConteudoPorExtensao(chave: string): string {
  const extensao = chave.split('.').pop()?.toLowerCase() ?? '';
  return TIPOS[extensao] ?? 'application/octet-stream';
}
```

`src/modules/midia/links.ts`:

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';

export function assinarLink(segredo: string, caminho: string, expiraEm: number): string {
  return createHmac('sha256', segredo).update(`${caminho}\n${expiraEm}`).digest('base64url');
}

export type ResultadoLink = { ok: true; caminho: string; expiraEm: number } | { ok: false; motivo: 'invalido' | 'expirado' };

/** `exp` em segundos desde 1970. A assinatura cobre o caminho e o prazo: trocar qualquer um invalida o link. */
export function verificarLink(
  segredo: string,
  p: { c: string | null; exp: string | null; sig: string | null },
  agora: Date,
): ResultadoLink {
  if (!p.c || !p.exp || !p.sig || !/^\d{1,12}$/.test(p.exp)) return { ok: false, motivo: 'invalido' };
  const expiraEm = Number(p.exp);
  const esperado = Buffer.from(assinarLink(segredo, p.c, expiraEm));
  const recebido = Buffer.from(p.sig);
  if (esperado.length !== recebido.length || !timingSafeEqual(esperado, recebido)) return { ok: false, motivo: 'invalido' };
  if (expiraEm * 1000 <= agora.getTime()) return { ok: false, motivo: 'expirado' };
  return { ok: true, caminho: p.c, expiraEm };
}
```

`src/modules/midia/range.ts`:

```ts
export type Intervalo = { inicio: number; fim: number };

/**
 * Cabeçalho Range com um único intervalo ("bytes=0-", "bytes=100-199", "bytes=-500").
 * null = arquivo inteiro; 'invalido' = responder 416.
 */
export function interpretarRange(cabecalho: string | null, tamanho: number): Intervalo | null | 'invalido' {
  if (!cabecalho) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(cabecalho.trim());
  if (!m || (m[1] === '' && m[2] === '') || tamanho === 0) return 'invalido';
  let inicio: number;
  let fim: number;
  if (m[1] === '') {
    const sufixo = Number(m[2]);
    if (sufixo === 0) return 'invalido';
    inicio = Math.max(0, tamanho - sufixo);
    fim = tamanho - 1;
  } else {
    inicio = Number(m[1]);
    fim = m[2] === '' ? tamanho - 1 : Math.min(Number(m[2]), tamanho - 1);
  }
  if (inicio >= tamanho || inicio > fim) return 'invalido';
  return { inicio, fim };
}
```

`src/modules/midia/armazenamento-disco.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ArmazenamentoArquivos } from './armazenamento';
import { validarChave } from './chaves';
import { ErroArquivoNaoEncontrado, ErroChaveInvalida } from './erros';
import { assinarLink } from './links';

/** Arquivos em MIDIA_DIR. O link temporário passa pela rota /api/arquivos, que exige sessão e assinatura válida. */
export class ArmazenamentoDisco implements ArmazenamentoArquivos {
  readonly provedor = 'disco';
  private readonly raiz: string;

  constructor(
    raiz: string,
    private readonly segredo: string,
    private readonly relogio: () => Date = () => new Date(),
  ) {
    this.raiz = resolve(raiz);
  }

  caminhoAbsoluto(chave: string): string {
    validarChave(chave);
    const absoluto = resolve(this.raiz, chave);
    if (!absoluto.startsWith(this.raiz + sep)) throw new ErroChaveInvalida(chave);
    return absoluto;
  }

  async salvar(chave: string, conteudo: Readable): Promise<void> {
    const destino = this.caminhoAbsoluto(chave);
    await mkdir(dirname(destino), { recursive: true });
    // Grava num arquivo parcial e renomeia: quem lê nunca vê um arquivo pela metade.
    const parcial = `${destino}.${randomUUID()}.parcial`;
    try {
      await pipeline(conteudo, createWriteStream(parcial));
      await rename(parcial, destino);
    } catch (erro) {
      await rm(parcial, { force: true });
      throw erro;
    }
  }

  async ler(chave: string): Promise<Readable> {
    const absoluto = this.caminhoAbsoluto(chave);
    const info = await stat(absoluto).catch(() => null);
    if (!info?.isFile()) throw new ErroArquivoNaoEncontrado(chave);
    return createReadStream(absoluto);
  }

  async urlTemporaria(chave: string, segundos: number): Promise<string> {
    validarChave(chave);
    const expiraEm = Math.floor(this.relogio().getTime() / 1000) + segundos;
    const parametros = new URLSearchParams({ c: chave, exp: String(expiraEm), sig: assinarLink(this.segredo, chave, expiraEm) });
    return `/api/arquivos?${parametros.toString()}`;
  }

  async apagar(chave: string): Promise<void> {
    await rm(this.caminhoAbsoluto(chave), { force: true });
  }

  async existe(chave: string): Promise<boolean> {
    const info = await stat(this.caminhoAbsoluto(chave)).catch(() => null);
    return info?.isFile() ?? false;
  }
}
```

`src/modules/midia/armazenamento-memoria.ts`:

```ts
import { Readable } from 'node:stream';
import type { ArmazenamentoArquivos } from './armazenamento';
import { validarChave } from './chaves';
import { ErroArquivoNaoEncontrado } from './erros';

/** Para os testes de integração (instalado pelo tests/setup/int-setup.ts). */
export class ArmazenamentoMemoria implements ArmazenamentoArquivos {
  readonly provedor = 'memoria';
  readonly arquivos = new Map<string, { conteudo: Buffer; tipoConteudo?: string }>();

  async salvar(chave: string, conteudo: Readable, opcoes: { tipoConteudo?: string } = {}): Promise<void> {
    validarChave(chave);
    const partes: Buffer[] = [];
    for await (const parte of conteudo) partes.push(Buffer.from(parte));
    this.arquivos.set(chave, { conteudo: Buffer.concat(partes), tipoConteudo: opcoes.tipoConteudo });
  }

  async ler(chave: string): Promise<Readable> {
    const arquivo = this.arquivos.get(chave);
    if (!arquivo) throw new ErroArquivoNaoEncontrado(chave);
    return Readable.from([arquivo.conteudo]);
  }

  async urlTemporaria(chave: string, segundos: number): Promise<string> {
    validarChave(chave);
    return `memoria://${chave}?expira=${segundos}`;
  }

  async apagar(chave: string): Promise<void> {
    this.arquivos.delete(chave);
  }

  async existe(chave: string): Promise<boolean> {
    return this.arquivos.has(chave);
  }
}
```

`src/modules/midia/armazenamento.ts`:

```ts
import type { Readable } from 'node:stream';
import { lerEnv } from '@/lib/env';
import { ArmazenamentoDisco } from './armazenamento-disco';

/** Spec §4.3 e contrato §5.2. A Fase 2 (Parte B) acrescenta o ArmazenamentoS3 (B2 ou R2). */
export interface ArmazenamentoArquivos {
  salvar(caminho: string, conteudo: Readable, opcoes?: { tipoConteudo?: string; tamanho?: number }): Promise<void>;
  ler(caminho: string): Promise<Readable>;
  /** Spec §9: 10 min; nunca público. */
  urlTemporaria(caminho: string, segundos: number): Promise<string>;
  apagar(caminho: string): Promise<void>;
  existe(caminho: string): Promise<boolean>;
}

export type ProvedorArmazenamento = 'disco' | 's3' | 'memoria';

let paraTestes: ArmazenamentoArquivos | null = null;
const instancias = new Map<string, ArmazenamentoArquivos>();

/** Nos testes de integração: todo provedor responde com o armazenamento dado (e o cache é esquecido). */
export function definirArmazenamentoParaTestes(a: ArmazenamentoArquivos | null): void {
  paraTestes = a;
  instancias.clear();
}

/** O disco local (MIDIA_DIR). A rota /api/arquivos usa este, mesmo nos testes. */
export function discoLocal(): ArmazenamentoDisco {
  const env = lerEnv();
  return new ArmazenamentoDisco(env.MIDIA_DIR, env.SEGREDO_LINKS);
}

/** O armazenamento onde está um arquivo já gravado (coluna `provedor`): a troca disco → S3 não quebra os links antigos. */
export function armazenamentoDoProvedor(provedor: string): ArmazenamentoArquivos {
  if (paraTestes) return paraTestes;
  const existente = instancias.get(provedor);
  if (existente) return existente;
  let criado: ArmazenamentoArquivos;
  if (provedor === 'disco') criado = discoLocal();
  else throw new Error(`Provedor de armazenamento não disponível: ${provedor}`);
  instancias.set(provedor, criado);
  return criado;
}

/** Onde os arquivos novos são gravados (ARMAZENAMENTO no .env). */
export function provedorAtual(): ProvedorArmazenamento {
  return paraTestes ? 'memoria' : lerEnv().ARMAZENAMENTO;
}

export function obterArmazenamento(): ArmazenamentoArquivos {
  return paraTestes ?? armazenamentoDoProvedor(lerEnv().ARMAZENAMENTO);
}
```

Rode: `npm test -- src/modules/midia`
Esperado: PASS.

- [ ] **Passo 3: Rota dos links temporários**

`src/app/api/arquivos/route.ts`:

```ts
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { lerEnv } from '@/lib/env';
import { usuarioAtual } from '@/modules/auth/servidor';
import { discoLocal } from '@/modules/midia/armazenamento';
import { tipoConteudoPorExtensao } from '@/modules/midia/chaves';
import { verificarLink } from '@/modules/midia/links';
import { interpretarRange } from '@/modules/midia/range';

export const dynamic = 'force-dynamic';

function texto(status: number, mensagem: string, extras: Record<string, string> = {}): Response {
  return new Response(mensagem, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', ...extras } });
}

/** Link temporário das mídias guardadas no disco (spec §9): sessão + assinatura + prazo. Responde a Range (vídeo). */
export async function GET(req: Request): Promise<Response> {
  if (!(await usuarioAtual())) return texto(401, 'Entre no sistema para ver este arquivo.');
  const p = new URL(req.url).searchParams;
  const agora = new Date();
  const link = verificarLink(lerEnv().SEGREDO_LINKS, { c: p.get('c'), exp: p.get('exp'), sig: p.get('sig') }, agora);
  if (!link.ok) {
    return link.motivo === 'expirado' ? texto(410, 'Este link expirou. Abra a evidência de novo.') : texto(403, 'Link inválido.');
  }
  let absoluto: string;
  try {
    absoluto = discoLocal().caminhoAbsoluto(link.caminho);
  } catch {
    return texto(403, 'Link inválido.');
  }
  const info = await stat(absoluto).catch(() => null);
  if (!info?.isFile()) return texto(404, 'Arquivo não encontrado.');

  const intervalo = interpretarRange(req.headers.get('range'), info.size);
  if (intervalo === 'invalido') return texto(416, 'Intervalo inválido.', { 'content-range': `bytes */${info.size}` });
  const segundosRestantes = Math.max(0, link.expiraEm - Math.floor(agora.getTime() / 1000));
  const inicio = intervalo?.inicio ?? 0;
  const fim = intervalo?.fim ?? info.size - 1;
  const corpo =
    info.size === 0 ? null : (Readable.toWeb(createReadStream(absoluto, { start: inicio, end: fim })) as unknown as ReadableStream<Uint8Array>);
  return new Response(corpo, {
    status: intervalo ? 206 : 200,
    headers: {
      'content-type': tipoConteudoPorExtensao(link.caminho),
      'content-length': String(info.size === 0 ? 0 : fim - inicio + 1),
      'accept-ranges': 'bytes',
      'cache-control': `private, max-age=${segundosRestantes}`,
      'content-disposition': 'inline',
      'x-content-type-options': 'nosniff',
      ...(intervalo ? { 'content-range': `bytes ${inicio}-${fim}/${info.size}` } : {}),
    },
  });
}
```

- [ ] **Passo 4: Teste ponta a ponta da rota**

`tests/e2e/arquivos.spec.ts`:

```ts
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import { expect, test } from '@playwright/test';
import { ArmazenamentoDisco } from '../../src/modules/midia/armazenamento-disco';
import { codigoUnico, ehCelular, entrarComo } from './apoio';
import { AMBIENTE_E2E, URL_E2E, USUARIOS_E2E } from './dados';

test('link temporário do disco: com login abre, com Range devolve um pedaço, adulterado ou sem login é recusado', async ({ page, browser }, testInfo) => {
  test.skip(ehCelular(testInfo), 'a rota é a mesma nos dois projetos; basta o computador');
  // O mesmo disco e o mesmo segredo do servidor do e2e (AMBIENTE_E2E).
  const disco = new ArmazenamentoDisco(resolve(AMBIENTE_E2E.MIDIA_DIR), AMBIENTE_E2E.SEGREDO_LINKS);
  const chave = `testes/${codigoUnico('ARQ')}.txt`;
  await disco.salvar(chave, Readable.from([Buffer.from('conteudo-de-teste')]));
  const url = await disco.urlTemporaria(chave, 600);

  await entrarComo(page, USUARIOS_E2E.fiscal);
  const inteiro = await page.request.get(url);
  expect(inteiro.status()).toBe(200);
  expect(await inteiro.text()).toBe('conteudo-de-teste');
  expect(inteiro.headers()['cache-control']).toMatch(/^private, max-age=\d+$/);

  const pedaco = await page.request.get(url, { headers: { range: 'bytes=0-7' } });
  expect(pedaco.status()).toBe(206);
  expect(await pedaco.text()).toBe('conteudo');
  expect(pedaco.headers()['content-range']).toBe('bytes 0-7/17');

  expect((await page.request.get(url.replace(/sig=[^&]+/, 'sig=adulterado'))).status()).toBe(403);

  const anonimo = await browser.newContext();
  try {
    expect((await anonimo.request.get(new URL(url, URL_E2E).toString())).status()).toBe(401);
  } finally {
    await anonimo.close();
  }
});
```

Rode: `npm run test:e2e -- tests/e2e/arquivos.spec.ts`
Esperado: PASS no `computador` (pulado no `celular`).

- [ ] **Passo 5: Verificar e commitar**

```bash
cd "/c/Users/idmpc/Dvoluções Markt"
npm test && npm run typecheck && npm run lint
git add src/modules/midia src/app/api/arquivos tests/e2e/arquivos.spec.ts
git commit -m "feat: armazenamento de arquivos (disco e memória) e links temporários assinados com Range" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 7: Conectores (tipos e registro) e falsos dos testes de integração

**Arquivos:**
- Criar: `src/conectores/marketplace/tipos.ts`, `src/conectores/marketplace/registro.ts`, `tests/setup/int-setup.ts`
- Modificar: `vitest.int.config.mts`
- Testes: `src/conectores/marketplace/registro.test.ts`, `src/modules/fila/falsos.int.test.ts`

**Interfaces:**
- Consome: `Canal`, `TipoDevolucao` (Fase 1); `DbOuTx`; `FilaMemoria`, `definirFilaParaTestes` (Tarefa 4); `ArmazenamentoMemoria`, `definirArmazenamentoParaTestes` (Tarefa 6).
- Produz (contrato §5.3, nomes exatos): `type DevolucaoExterna`, `type MotivoCanal`, `type ResultadoConferencia`, `interface MarketplaceConnector`, `obterConector(db: DbOuTx, canal: Canal): Promise<MarketplaceConnector | null>` (devolve `null` até a Fase 3), `definirConectorParaTestes(canal: Canal, c: MarketplaceConnector | null): void`; `tests/setup/int-setup.ts` instala os falsos antes de cada teste de integração.

- [ ] **Passo 1: Escrever os testes que falham**

`src/conectores/marketplace/registro.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { DbOuTx } from '@/db/client';
import { definirConectorParaTestes, obterConector } from './registro';
import type { MarketplaceConnector } from './tipos';

const db = {} as DbOuTx;

describe('registro de conectores (contrato §5.3)', () => {
  it('sem integração, devolve null', async () => {
    expect(await obterConector(db, 'MERCADO_LIVRE')).toBeNull();
  });

  it('nos testes, devolve o conector definido para o canal', async () => {
    const falso = { canal: 'MERCADO_LIVRE' } as MarketplaceConnector;
    definirConectorParaTestes('MERCADO_LIVRE', falso);
    expect(await obterConector(db, 'MERCADO_LIVRE')).toBe(falso);
    expect(await obterConector(db, 'SHOPEE')).toBeNull();
    definirConectorParaTestes('MERCADO_LIVRE', null);
    expect(await obterConector(db, 'MERCADO_LIVRE')).toBeNull();
  });
});
```

`src/modules/fila/falsos.int.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { obterConector } from '@/conectores/marketplace/registro';
import type { DbOuTx } from '@/db/client';
import { obterArmazenamento, provedorAtual } from '@/modules/midia/armazenamento';
import { ArmazenamentoMemoria } from '@/modules/midia/armazenamento-memoria';
import { FilaMemoria, obterFila, verificarFila } from './fila';

describe('falsos instalados pelo tests/setup/int-setup.ts (contrato §2, P2 item 10)', () => {
  it('fila e armazenamento em memória, conectores null', async () => {
    expect(obterFila()).toBeInstanceOf(FilaMemoria);
    expect(obterArmazenamento()).toBeInstanceOf(ArmazenamentoMemoria);
    expect(provedorAtual()).toBe('memoria');
    expect(await obterConector({} as DbOuTx, 'MERCADO_LIVRE')).toBeNull();
    await expect(verificarFila()).resolves.toBeUndefined();
  });

  it('cada teste começa com a fila vazia', async () => {
    await obterFila().enviar('ml.varredura', {});
    expect((obterFila() as FilaMemoria).enviadas).toHaveLength(1);
  });

  it('... e o anterior não deixa nada para o próximo', () => {
    expect((obterFila() as FilaMemoria).enviadas).toEqual([]);
  });
});
```

Rode: `npm test -- src/conectores/marketplace/registro.test.ts && npm run test:int -- src/modules/fila/falsos.int.test.ts`
Esperado: FAIL (registro não existe; os falsos não estão instalados).

- [ ] **Passo 2: Tipos e registro dos conectores**

`src/conectores/marketplace/tipos.ts`:

```ts
import type { Canal, TipoDevolucao } from '@/modules/devolucoes/dominio';

/** Interface da spec §4.3 mais o método da §7.5 (contrato §5.3). Implementação do Mercado Livre: Fase 3. */
export type DevolucaoExterna = {
  canal: Canal;
  devolucaoExternaId: string;
  reclamacaoId: string;
  tipo: TipoDevolucao;
  /** subtype low_cost: sem envio físico. */
  semEnvioFisico: boolean;
  pedidos: string[];
  /** Valor bruto (return.status e o envio). */
  statusCanal: string;
  destinoEnvio: 'VENDEDOR' | 'CD_MARKETPLACE' | null;
  reenvioDaTriagem: boolean;
  rastreio: string | null;
  transportadora: string | null;
  entregueEm: Date | null;
  prazoConferencia: Date | null;
  atualizadaEm: Date;
  itens: { pedido: string; sku: string; ean: string | null; quantidade: number }[];
};

export type MotivoCanal = 'SRF2' | 'SRF3' | 'SRF4' | 'SRF5' | 'SRF6';

export type ResultadoConferencia =
  | { tipo: 'OK' }
  | {
      tipo: 'PROBLEMA';
      reclamacaoId: string;
      motivo: MotivoCanal;
      mensagem: string;
      pedido?: string;
      anexos: { nome: string; conteudo: Buffer; tipoConteudo: 'image/jpeg' }[];
    };

export interface MarketplaceConnector {
  canal: Canal;
  listarAtualizadasDesde(desde: Date): AsyncIterable<DevolucaoExterna>;
  obter(idExterno: string): Promise<DevolucaoExterna>;
  enviarResultadoConferencia(idExterno: string, r: ResultadoConferencia): Promise<void>;
  /** null = o canal não tem a nota. */
  obterXmlNotaVenda(pedidoExterno: string): Promise<string | null>;
}
```

`src/conectores/marketplace/registro.ts`:

```ts
import type { DbOuTx } from '@/db/client';
import type { Canal } from '@/modules/devolucoes/dominio';
import type { MarketplaceConnector } from './tipos';

const paraTestes = new Map<Canal, MarketplaceConnector | null>();

/**
 * O conector do canal, ou null sem integração ou sem conta ATIVA (contrato §5.3).
 * Até a Fase 3 entrar, devolve sempre null. A Fase 3 troca o corpo desta função.
 */
export async function obterConector(db: DbOuTx, canal: Canal): Promise<MarketplaceConnector | null> {
  if (paraTestes.has(canal)) return paraTestes.get(canal) ?? null;
  void db;
  return null;
}

export function definirConectorParaTestes(canal: Canal, c: MarketplaceConnector | null): void {
  paraTestes.set(canal, c);
}
```

- [ ] **Passo 3: Falsos em todo teste de integração**

`tests/setup/int-setup.ts`:

```ts
import { beforeEach } from 'vitest';
import { definirConectorParaTestes } from '@/conectores/marketplace/registro';
import { CANAIS } from '@/modules/devolucoes/dominio';
import { definirFilaParaTestes, FilaMemoria } from '@/modules/fila/fila';
import { definirArmazenamentoParaTestes } from '@/modules/midia/armazenamento';
import { ArmazenamentoMemoria } from '@/modules/midia/armazenamento-memoria';

/**
 * Os testes de integração nunca falam com o pg-boss, o disco ou um canal de verdade sem pedir (contrato §2, P2 item 10).
 * Um teste que quer olhar a fila faz `const fila = new FilaMemoria(); definirFilaParaTestes(fila);` no próprio beforeEach
 * (que roda depois deste). Os testes do pg-boss criam o PgBoss direto, sem passar por obterFila.
 */
beforeEach(() => {
  definirFilaParaTestes(new FilaMemoria());
  definirArmazenamentoParaTestes(new ArmazenamentoMemoria());
  for (const canal of CANAIS) definirConectorParaTestes(canal, null);
});
```

Em `vitest.int.config.mts`, dentro de `test: { ... }`, logo depois de `globalSetup: [...]`, acrescente:

```ts
    setupFiles: ['tests/setup/int-setup.ts'],
```

Rode: `npm test -- src/conectores && npm run test:int`
Esperado: PASS (todos os testes de integração, inclusive os da Fase 1).

- [ ] **Passo 4: Verificar e commitar**

```bash
cd "/c/Users/idmpc/Dvoluções Markt"
npm run typecheck && npm run lint
git add src/conectores/marketplace/tipos.ts src/conectores/marketplace/registro.ts src/conectores/marketplace/registro.test.ts tests/setup/int-setup.ts vitest.int.config.mts src/modules/fila/falsos.int.test.ts
git commit -m "feat: tipos e registro dos conectores de marketplace e falsos padrão nos testes de integração" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 8: Esqueletos de tela (seções do detalhe e cartões das Configurações)

**Arquivos:**
- Criar: `src/app/(app)/fluxo/devolucoes/[codigo]/secoes/tipos.ts`, `SecaoConferencia.tsx`, `SecaoMercadoLivre.tsx`, `SecaoFiscal.tsx`, `SecaoLote.tsx`
- Modificar: `src/app/(app)/fluxo/devolucoes/[codigo]/page.tsx` (**congelado** depois desta tarefa)
- Modificar (substituir o conteúdo): `src/app/(app)/configuracoes/page.tsx` (**congelado** depois desta tarefa)
- Criar: `src/app/(app)/configuracoes/conferencia/page.tsx`, `mercado-livre/page.tsx`, `fiscal/page.tsx`, `falhas/page.tsx`
- Testes: `tests/e2e/configuracoes.spec.ts`

**Interfaces:**
- Consome: `exigirPermissao`, `EmBreve`, `CARTAO`, `UsuarioSessao`, `StatusDevolucao`.
- Produz: `type PropsSecao = { devolucaoId: string; codigo: string; status: StatusDevolucao; usuario: UsuarioSessao }`; `SecaoConferencia`, `SecaoMercadoLivre`, `SecaoFiscal`, `SecaoLote` (componentes de servidor assíncronos que devolvem `null`; cada fase preenche o seu); páginas `/configuracoes/conferencia` ("Conferência e mídias", Fase 2), `/configuracoes/mercado-livre` (3), `/configuracoes/fiscal` (4), `/configuracoes/falhas` (6).

- [ ] **Passo 1: Escrever o teste ponta a ponta que falha**

`tests/e2e/configuracoes.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { entrarComo, paginaNaoEncontrada, semRolagemLateral } from './apoio';
import { USUARIOS_E2E } from './dados';

const CARTOES: [string, string][] = [
  ['Usuários', '/configuracoes/usuarios'],
  ['Conferência e mídias', '/configuracoes/conferencia'],
  ['Mercado Livre', '/configuracoes/mercado-livre'],
  ['Fiscal', '/configuracoes/fiscal'],
  ['Falhas', '/configuracoes/falhas'],
];

test('o Gestor vê os cartões das Configurações; as áreas das próximas fases avisam a fase', async ({ page }) => {
  await entrarComo(page, USUARIOS_E2E.gestor);
  await page.goto('/configuracoes');
  for (const [nome, href] of CARTOES) {
    await expect(page.getByRole('link', { name: new RegExp(`^${nome}`) })).toHaveAttribute('href', href);
  }
  await semRolagemLateral(page);
  await page.getByRole('link', { name: /^Mercado Livre/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Mercado Livre' })).toBeVisible();
  await expect(page.getByText('Esta área chega na Fase 3 do projeto.')).toBeVisible();
});

test('o Operador não abre as Configurações novas', async ({ page }) => {
  await entrarComo(page, USUARIOS_E2E.operador);
  await paginaNaoEncontrada(page, '/configuracoes/conferencia');
});
```

Rode: `npm run test:e2e -- tests/e2e/configuracoes.spec.ts`
Esperado: FAIL (os cartões e as páginas não existem).

- [ ] **Passo 2: Seções do detalhe da devolução**

`src/app/(app)/fluxo/devolucoes/[codigo]/secoes/tipos.ts`:

```ts
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import type { StatusDevolucao } from '@/modules/devolucoes/dominio';

/** Props das seções do detalhe (contrato §2, P2 item 9). Cada seção busca os próprios dados. */
export type PropsSecao = { devolucaoId: string; codigo: string; status: StatusDevolucao; usuario: UsuarioSessao };
```

`src/app/(app)/fluxo/devolucoes/[codigo]/secoes/SecaoConferencia.tsx`:

```tsx
import type { ReactNode } from 'react';
import type { PropsSecao } from './tipos';

/** Conferência (Fase 2): trava, evidências e destino de cada unidade. Só a Fase 2 edita este arquivo. */
export async function SecaoConferencia(props: PropsSecao): Promise<ReactNode> {
  void props;
  return null;
}
```

`src/app/(app)/fluxo/devolucoes/[codigo]/secoes/SecaoMercadoLivre.tsx`:

```tsx
import type { ReactNode } from 'react';
import type { PropsSecao } from './tipos';

/** Mercado Livre (Fase 3): reclamação, status no canal e contestação. Só a Fase 3 edita este arquivo. */
export async function SecaoMercadoLivre(props: PropsSecao): Promise<ReactNode> {
  void props;
  return null;
}
```

`src/app/(app)/fluxo/devolucoes/[codigo]/secoes/SecaoFiscal.tsx`:

```tsx
import type { ReactNode } from 'react';
import type { PropsSecao } from './tipos';

/** Fiscal (Fase 4): NF de venda e NF de devolução. Só a Fase 4 edita este arquivo. */
export async function SecaoFiscal(props: PropsSecao): Promise<ReactNode> {
  void props;
  return null;
}
```

`src/app/(app)/fluxo/devolucoes/[codigo]/secoes/SecaoLote.tsx`:

```tsx
import type { ReactNode } from 'react';
import type { PropsSecao } from './tipos';

/** Lote de remessa (Fase 5): em qual lote está cada unidade com problema. Só a Fase 5 edita este arquivo. */
export async function SecaoLote(props: PropsSecao): Promise<ReactNode> {
  void props;
  return null;
}
```

Em `src/app/(app)/fluxo/devolucoes/[codigo]/page.tsx`:

1. Acrescente aos imports (depois de `import { FormularioEncerrar, FormularioIdentificar } from './AcoesGestor';`):

```tsx
import { SecaoConferencia } from './secoes/SecaoConferencia';
import { SecaoFiscal } from './secoes/SecaoFiscal';
import { SecaoLote } from './secoes/SecaoLote';
import { SecaoMercadoLivre } from './secoes/SecaoMercadoLivre';
```

2. Logo **antes** de `<section aria-labelledby="titulo-historico" className={CARTAO}>`, acrescente:

```tsx
      {/* Uma seção por fase (contrato §2, P2 item 9), nesta ordem, entre "Itens" e "Histórico". */}
      <SecaoConferencia devolucaoId={d.id} codigo={d.codigo} status={d.status} usuario={usuario} />
      <SecaoMercadoLivre devolucaoId={d.id} codigo={d.codigo} status={d.status} usuario={usuario} />
      <SecaoFiscal devolucaoId={d.id} codigo={d.codigo} status={d.status} usuario={usuario} />
      <SecaoLote devolucaoId={d.id} codigo={d.codigo} status={d.status} usuario={usuario} />
```

- [ ] **Passo 3: Cartões das Configurações e as páginas das próximas fases**

`src/app/(app)/configuracoes/page.tsx` (substitua o conteúdo):

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { CARTAO } from '@/components/estilos';
import { exigirPermissao } from '@/modules/auth/servidor';

export const metadata: Metadata = { title: 'Configurações · Gestão de Devoluções' };

/** Spec §6.8. Cada fase troca só a página atrás do seu cartão (contrato §3). */
const CARTOES: { titulo: string; href: string; descricao: string }[] = [
  { titulo: 'Usuários', href: '/configuracoes/usuarios', descricao: 'Criar usuários, mudar o perfil, desativar e reativar.' },
  {
    titulo: 'Conferência e mídias',
    href: '/configuracoes/conferencia',
    descricao: 'Obrigatoriedade do Vídeo de Prova, prazo de guarda das mídias e armazenamento.',
  },
  { titulo: 'Mercado Livre', href: '/configuracoes/mercado-livre', descricao: 'Conexão com a conta do Mercado Livre.' },
  { titulo: 'Fiscal', href: '/configuracoes/fiscal', descricao: 'Dados da empresa, regime tributário, regras fiscais, série e ambiente da NF-e.' },
  { titulo: 'Falhas', href: '/configuracoes/falhas', descricao: 'Tarefas de fundo que esgotaram as tentativas.' },
];

export default async function PaginaConfiguracoes() {
  await exigirPermissao('administrar');
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
      <h1 className="text-xl font-bold">Configurações</h1>
      <ul className="flex flex-col gap-3">
        {CARTOES.map((c) => (
          <li key={c.href}>
            <Link href={c.href} className={`${CARTAO} flex min-h-11 flex-col gap-1 hover:border-destaque`}>
              <span className="text-base font-bold">{c.titulo}</span>
              <span className="text-sm text-texto-2">{c.descricao}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

`src/app/(app)/configuracoes/conferencia/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { EmBreve } from '@/components/EmBreve';
import { exigirPermissao } from '@/modules/auth/servidor';

export const metadata: Metadata = { title: 'Conferência e mídias · Gestão de Devoluções' };

/** Fase 2 troca esta página. */
export default async function PaginaConferenciaMidias() {
  await exigirPermissao('administrar');
  return <EmBreve titulo="Conferência e mídias" fase={2} />;
}
```

`src/app/(app)/configuracoes/mercado-livre/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { EmBreve } from '@/components/EmBreve';
import { exigirPermissao } from '@/modules/auth/servidor';

export const metadata: Metadata = { title: 'Mercado Livre · Gestão de Devoluções' };

/** Fase 3 troca esta página. */
export default async function PaginaMercadoLivre() {
  await exigirPermissao('administrar');
  return <EmBreve titulo="Mercado Livre" fase={3} />;
}
```

`src/app/(app)/configuracoes/fiscal/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { EmBreve } from '@/components/EmBreve';
import { exigirPermissao } from '@/modules/auth/servidor';

export const metadata: Metadata = { title: 'Fiscal · Gestão de Devoluções' };

/** Fase 4 troca esta página. */
export default async function PaginaFiscal() {
  await exigirPermissao('administrar');
  return <EmBreve titulo="Fiscal" fase={4} />;
}
```

`src/app/(app)/configuracoes/falhas/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { EmBreve } from '@/components/EmBreve';
import { exigirPermissao } from '@/modules/auth/servidor';

export const metadata: Metadata = { title: 'Falhas · Gestão de Devoluções' };

/** Fase 6 troca esta página (spec §6.8). */
export default async function PaginaFalhas() {
  await exigirPermissao('administrar');
  return <EmBreve titulo="Falhas" fase={6} />;
}
```

Rode: `npm run typecheck && npm run lint && npm run test:e2e`
Esperado: tudo verde nos dois projetos (o detalhe da devolução continua igual: as seções ainda devolvem `null`).

- [ ] **Passo 4: Commitar**

```bash
cd "/c/Users/idmpc/Dvoluções Markt"
git add "src/app/(app)/fluxo/devolucoes/[codigo]" "src/app/(app)/configuracoes" tests/e2e/configuracoes.spec.ts
git commit -m "feat: esqueletos das seções do detalhe e cartões das Configurações das próximas fases" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Fim da Parte A

- [ ] **Conferência final no `main`** (Git Bash):

```bash
cd "/c/Users/idmpc/Dvoluções Markt"
npm run typecheck && npm run lint && npm test && npm run test:int && npm run build:scripts && npm run test:e2e
git status --short
```

Esperado: tudo verde e a árvore limpa (fora o `AGENTS.md`, que o `next dev` reescreve).

- **Revisão:** o controlador revisa as Tarefas 1 a 8 juntas antes de criar as worktrees. Depois disso ficam **congelados** (contrato §3): `src/db/schema/index.ts`, `src/db/schema/devolucoes.ts`, os scripts do `package.json`, `src/lib/env.ts`, `.env.example`, `.env.producao.example`, `tests/e2e/global-setup.ts`, `apoio.ts`, `dados.ts`, o detalhe da devolução (`[codigo]/page.tsx`, `detalhe.ts`) e `configuracoes/page.tsx`.
- **Worktrees:** crie as worktrees e os bancos das Fases 2, 3 e 4 com o bloco do contrato §6. Na worktree da Fase 2, troque no `.env` as três linhas: `DATABASE_URL=.../devolucoes_f2`, `DATABASE_URL_TEST=.../devolucoes_test_f2`, `PORTA_E2E=3102`; depois `npm ci && npm run db:migrar`.
- **Produção:** antes de publicar este `main` na VPS, o `.env.producao` precisa de `SEGREDO_LINKS` (com `openssl rand -hex 32`); sem ele o `lerEnv` recusa a subida. O serviço `worker` sobe junto com o `docker compose up -d`. (Push e deploy são do usuário.)

---

# Parte B (worktree `fase-2-conferencia`): a conferência

> Execute na worktree `C:/Users/idmpc/devolucoes-wt/fase-2` (branch `fase-2-conferencia`), com o `.env` da fase (`devolucoes_f2`, `devolucoes_test_f2`, `PORTA_E2E=3102`; `next dev` com `npm run dev -- --port 3002`). Nos comandos abaixo, `cd "/c/Users/idmpc/devolucoes-wt/fase-2"`.
>
> **Antes de começar:** instale o ffmpeg no Windows (`winget install Gyan.FFmpeg`), abra um terminal novo e confira com `ffmpeg -version` e `ffprobe -version`. Sem ele, os testes do vídeo são pulados, mas o critério de pronto ("vídeo comprimido") só é conferido com ele.
>
> **Arquivos desta parte:** só os da Fase 2 (contrato §3): `src/modules/conferencia/**`, `src/modules/midia/**`, `src/worker/manipuladores/midia.ts`, `src/components/conferencia/**`, `src/components/midia/**`, `src/components/pwa/**`, `secoes/SecaoConferencia.tsx`, `configuracoes/conferencia/**`, `fluxo/etapa/[numero]/page.tsx`, `recebimento.ts` e `fluxo/recebimento/*`, `manifest.ts`, `public/sw.js`, `Dockerfile`, `docker-compose.prod.yml`, `docker/nginx/devolucoes.conf` e `next.config.ts`.

### Tarefa 9: Trava da conferência (iniciar, desistir, liberar) e leitura dos dados

**Arquivos:**
- Criar: `src/modules/conferencia/erros.ts`, `src/modules/conferencia/trava.ts`, `src/modules/conferencia/leitura.ts`
- Criar: `tests/helpers/fabricas-conferencia.ts`
- Testes: `src/modules/conferencia/trava.int.test.ts`, `src/modules/conferencia/leitura.int.test.ts`

**Interfaces:**
- Consome: `exigirTransicao`, `rotuloStatus`, `ErroDevolucao`, `registrarEvento`, `criarDevolucaoTeste`, `criarUsuarioTeste`, `criarProdutoTeste`, `criarNaoIdentificada` (Fase 1); `lerConfiguracao`, colunas novas e `evidencias` (Tarefa 2).
- Produz:
  - `class ErroConferencia extends ErroDevolucao`, `class ErroConclusao extends ErroConferencia { readonly pendencias: string[] }`
  - em `trava.ts`: `travarDevolucao(tx: DbOuTx, devolucaoId)` (SELECT ... FOR UPDATE), `exigirConferente(tx, devolucaoId, usuario)`, `iniciarConferencia(db: Db, devolucaoId, usuario, agora?)`, `desistirConferencia(db, devolucaoId, usuario, agora?)`, `liberarTrava(db, devolucaoId, usuario, agora?)`
  - em `leitura.ts`: `type ItemConferencia`, `type EvidenciaConferencia`, `type DadosConferencia`, `obterConferencia(db: DbOuTx, chave: { id: string } | { codigo: string }): Promise<DadosConferencia | null>`
  - em `fabricas-conferencia.ts`: `criarDevolucaoChegada(db, usuario, dados?)`, `criarDevolucaoEmConferencia(db, usuario, dados?)` (devolve também `itens: string[]` na ordem das unidades), `criarEvidenciaTeste(db, p)`, `criarEvidenciasCompletas(db, devolucaoId, itens)`

- [ ] **Passo 1: Fábricas da conferência**

`tests/helpers/fabricas-conferencia.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { devolucoes, evidencias, itensDevolucao } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import type { DadosNovaDevolucao, DevolucaoCriada } from '@/modules/devolucoes/criar';
import type { SituacaoProcessamento, TipoEvidencia } from '@/modules/midia/dominio';
import { criarDevolucaoTeste } from './fabricas';

/** Devolução que já chegou: "Aguardando conferência" (sem o evento de recebimento). */
export async function criarDevolucaoChegada(
  db: DbOuTx,
  usuario: UsuarioSessao,
  dados: Partial<DadosNovaDevolucao> = {},
): Promise<DevolucaoCriada> {
  const criada = await criarDevolucaoTeste(db, usuario, dados);
  await db
    .update(devolucoes)
    .set({ status: 'AGUARDANDO_CONFERENCIA', recebidaEm: new Date(), recebidaPor: usuario.id })
    .where(eq(devolucoes.id, criada.id));
  return criada;
}

/** Devolução em conferência, travada com `usuario`. `itens` vem na ordem das unidades. */
export async function criarDevolucaoEmConferencia(
  db: DbOuTx,
  usuario: UsuarioSessao,
  dados: Partial<DadosNovaDevolucao> = {},
): Promise<DevolucaoCriada & { itens: string[] }> {
  const criada = await criarDevolucaoChegada(db, usuario, dados);
  await db
    .update(devolucoes)
    .set({ status: 'EM_CONFERENCIA', conferenteId: usuario.id, conferenciaIniciadaEm: new Date() })
    .where(eq(devolucoes.id, criada.id));
  const itens = await db
    .select({ id: itensDevolucao.id })
    .from(itensDevolucao)
    .where(eq(itensDevolucao.devolucaoId, criada.id))
    .orderBy(asc(itensDevolucao.unidade));
  return { ...criada, itens: itens.map((i) => i.id) };
}

export async function criarEvidenciaTeste(
  db: DbOuTx,
  p: {
    devolucaoId: string;
    tipo: TipoEvidencia;
    itemId?: string | null;
    situacao?: SituacaoProcessamento;
    caminho?: string | null;
    caminhoTemporario?: string | null;
    provedor?: string | null;
    usuarioId?: string | null;
    sha256Original?: string;
  },
): Promise<string> {
  const [linha] = await db
    .insert(evidencias)
    .values({
      devolucaoId: p.devolucaoId,
      itemId: p.itemId ?? null,
      tipo: p.tipo,
      tipoConteudo: p.tipo === 'VIDEO_PROVA' ? 'video/mp4' : 'image/jpeg',
      caminho: p.caminho ?? null,
      caminhoTemporario: p.caminhoTemporario ?? null,
      provedor: p.provedor ?? null,
      tamanhoOriginal: 1000,
      sha256Original: p.sha256Original ?? 'a'.repeat(64),
      situacaoProcessamento: p.situacao ?? 'RECEBIDA',
      idCliente: randomUUID(),
      enviadoPor: p.usuarioId ?? null,
    })
    .returning({ id: evidencias.id });
  return linha.id;
}

/** Fotos 1 e 2, Vídeo de Prova e as Fotos 3 e 4 de cada unidade dada. */
export async function criarEvidenciasCompletas(db: DbOuTx, devolucaoId: string, itens: string[]): Promise<void> {
  for (const tipo of ['FOTO_1_ETIQUETA', 'FOTO_2_EMBALAGEM', 'VIDEO_PROVA'] as const) await criarEvidenciaTeste(db, { devolucaoId, tipo });
  for (const itemId of itens) {
    await criarEvidenciaTeste(db, { devolucaoId, tipo: 'FOTO_3_PRODUTO', itemId });
    await criarEvidenciaTeste(db, { devolucaoId, tipo: 'FOTO_4_CODIGO_SERIAL', itemId });
  }
}
```

- [ ] **Passo 2: Escrever os testes que falham**

`src/modules/conferencia/trava.int.test.ts`:

```ts
import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { devolucoes, eventosHistorico, itensDevolucao } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { criarNaoIdentificada } from '@/modules/devolucoes/recebimento';
import { ErroTransicao } from '@/modules/devolucoes/transicoes';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarDevolucaoTeste, criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { criarDevolucaoChegada, criarDevolucaoEmConferencia } from '../../../tests/helpers/fabricas-conferencia';
import { ErroConferencia } from './erros';
import { desistirConferencia, iniciarConferencia, liberarTrava } from './trava';

const { db, sql } = criarDbTeste();
let operador: UsuarioSessao;
let outro: UsuarioSessao;
let gestor: UsuarioSessao;

beforeEach(async () => {
  await limparTabelas(sql);
  operador = await criarUsuarioTeste(db, 'OPERADOR');
  outro = await criarUsuarioTeste(db, 'OPERADOR');
  gestor = await criarUsuarioTeste(db, 'GESTOR');
});
afterAll(async () => {
  await sql.end();
});

async function estado(id: string) {
  const [d] = await db
    .select({ status: devolucoes.status, conferenteId: devolucoes.conferenteId, iniciadaEm: devolucoes.conferenciaIniciadaEm })
    .from(devolucoes)
    .where(eq(devolucoes.id, id));
  return d;
}
async function acoes(id: string) {
  const eventos = await db
    .select({ acao: eventosHistorico.acao })
    .from(eventosHistorico)
    .where(eq(eventosHistorico.entidadeId, id))
    .orderBy(asc(eventosHistorico.id));
  return eventos.map((e) => e.acao);
}

describe('iniciarConferencia (spec §5.2: Aguardando conferência → Em conferência, travada com o operador)', () => {
  it('trava a devolução com o operador e registra o evento', async () => {
    const d = await criarDevolucaoChegada(db, operador);
    const agora = new Date('2026-11-12T13:00:00Z');
    await iniciarConferencia(db, d.id, operador, agora);
    expect(await estado(d.id)).toEqual({ status: 'EM_CONFERENCIA', conferenteId: operador.id, iniciadaEm: agora });
    expect(await acoes(d.id)).toEqual(['criada', 'conferencia_iniciada']);
  });

  it('abrir de novo pelo mesmo operador só continua, sem evento novo', async () => {
    const d = await criarDevolucaoChegada(db, operador);
    await iniciarConferencia(db, d.id, operador);
    await iniciarConferencia(db, d.id, operador);
    expect(await acoes(d.id)).toEqual(['criada', 'conferencia_iniciada']);
  });

  it('outra pessoa vê "Em conferência por ..." (spec §11)', async () => {
    const d = await criarDevolucaoChegada(db, operador);
    await iniciarConferencia(db, d.id, operador);
    await expect(iniciarConferencia(db, d.id, outro)).rejects.toThrow(`Em conferência por ${operador.nome}.`);
  });

  it('pacote não identificado ou sem unidades não entra em conferência (contrato D3)', async () => {
    const naoIdentificada = await criarNaoIdentificada(db, 'BRNI0001', operador);
    await expect(iniciarConferencia(db, naoIdentificada.id, operador)).rejects.toThrow(/não identificado/);
    const vazia = await criarDevolucaoChegada(db, operador, { itens: [] });
    await expect(iniciarConferencia(db, vazia.id, operador)).rejects.toThrow('A devolução não tem unidades para conferir.');
  });

  it('só confere devolução que chegou', async () => {
    const pendente = await criarDevolucaoTeste(db, operador);
    await expect(iniciarConferencia(db, pendente.id, operador)).rejects.toThrow(ErroConferencia);
    await expect(iniciarConferencia(db, pendente.id, operador)).rejects.toThrow(/pendente de chegada/);
  });

  it('o Fiscal não confere', async () => {
    const d = await criarDevolucaoChegada(db, operador);
    const fiscal = await criarUsuarioTeste(db, 'FISCAL');
    await expect(iniciarConferencia(db, d.id, fiscal)).rejects.toThrow(ErroTransicao);
  });
});

describe('desistirConferencia e liberarTrava (contrato D7: o que foi feito fica guardado)', () => {
  it('quem está conferindo desiste: volta para Aguardando conferência e mantém o que preencheu', async () => {
    const d = await criarDevolucaoEmConferencia(db, operador);
    await db.update(itensDevolucao).set({ serial: 'SN-1' }).where(eq(itensDevolucao.id, d.itens[0]));
    await desistirConferencia(db, d.id, operador);
    expect(await estado(d.id)).toEqual({ status: 'AGUARDANDO_CONFERENCIA', conferenteId: null, iniciadaEm: null });
    const [item] = await db.select({ serial: itensDevolucao.serial }).from(itensDevolucao).where(eq(itensDevolucao.id, d.itens[0]));
    expect(item.serial).toBe('SN-1');
    expect(await acoes(d.id)).toContain('conferencia_interrompida');
  });

  it('outra pessoa não desiste pela outra', async () => {
    const d = await criarDevolucaoEmConferencia(db, operador);
    await expect(desistirConferencia(db, d.id, outro)).rejects.toThrow('A conferência desta devolução não está aberta por você.');
  });

  it('o Gestor libera a trava de outra pessoa; o Operador não', async () => {
    const d = await criarDevolucaoEmConferencia(db, operador);
    await expect(liberarTrava(db, d.id, outro)).rejects.toThrow('Só o Gestor libera a trava da conferência.');
    await liberarTrava(db, d.id, gestor);
    expect((await estado(d.id)).status).toBe('AGUARDANDO_CONFERENCIA');
    const [evento] = await db
      .select({ acao: eventosHistorico.acao, usuarioId: eventosHistorico.usuarioId, dados: eventosHistorico.dados })
      .from(eventosHistorico)
      .where(eq(eventosHistorico.acao, 'conferencia_trava_liberada'));
    expect(evento).toEqual({ acao: 'conferencia_trava_liberada', usuarioId: gestor.id, dados: { conferenteId: operador.id, conferente: operador.nome } });
    await expect(liberarTrava(db, d.id, gestor)).rejects.toThrow('Esta devolução não está em conferência.');
  });
});
```

`src/modules/conferencia/leitura.int.test.ts`:

```ts
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { configuracoes, itensDevolucao } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarProdutoTeste, criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { criarDevolucaoEmConferencia, criarEvidenciaTeste } from '../../../tests/helpers/fabricas-conferencia';
import { obterConferencia } from './leitura';

const { db, sql } = criarDbTeste();
let operador: UsuarioSessao;
beforeEach(async () => {
  await limparTabelas(sql);
  operador = await criarUsuarioTeste(db, 'OPERADOR');
});
afterAll(async () => {
  await sql.end();
});

describe('obterConferencia', () => {
  it('traz a devolução, a trava, as unidades com o produto esperado, as evidências e a configuração do vídeo', async () => {
    await criarProdutoTeste(db, { sku: 'FONE-01', ean: '7891000000014', descricao: 'Fone Bluetooth' });
    const d = await criarDevolucaoEmConferencia(db, operador, { itens: [{ sku: 'FONE-01', quantidade: 2 }] });
    await criarEvidenciaTeste(db, { devolucaoId: d.id, tipo: 'FOTO_1_ETIQUETA', usuarioId: operador.id });
    // Unidade 2: leu um EAN que não é o esperado (o produto recebido fica vazio).
    await db.update(itensDevolucao).set({ eanLido: '7890000000001' }).where(eq(itensDevolucao.id, d.itens[1]));
    await db.insert(configuracoes).values({ id: 1, videoObrigatorio: 'SO_PROBLEMA' });

    const c = await obterConferencia(db, { codigo: d.codigo.toLowerCase() });
    expect(c).toMatchObject({
      id: d.id,
      codigo: d.codigo,
      status: 'EM_CONFERENCIA',
      conferenteId: operador.id,
      conferenteNome: operador.nome,
      naoIdentificada: false,
      videoObrigatorio: 'SO_PROBLEMA',
    });
    expect(c!.itens.map((i) => [i.unidade, i.sku, i.descricao, i.eanEsperado, i.eanLido, i.divergente])).toEqual([
      [1, 'FONE-01', 'Fone Bluetooth', '7891000000014', null, false],
      [2, 'FONE-01', 'Fone Bluetooth', '7891000000014', '7890000000001', true],
    ]);
    expect(c!.evidencias).toEqual([expect.objectContaining({ tipo: 'FOTO_1_ETIQUETA', itemId: null, situacao: 'RECEBIDA', caminho: null })]);
  });

  it('acha pelo id; devolve null quando não existe', async () => {
    const d = await criarDevolucaoEmConferencia(db, operador);
    expect((await obterConferencia(db, { id: d.id }))?.codigo).toBe(d.codigo);
    expect(await obterConferencia(db, { codigo: 'DEV-999999' })).toBeNull();
  });
});
```

Rode: `npm run test:int -- src/modules/conferencia`
Esperado: FAIL (os módulos não existem).

- [ ] **Passo 3: Implementar erros, trava e leitura**

`src/modules/conferencia/erros.ts`:

```ts
import { ErroDevolucao } from '@/modules/devolucoes/erros';

/** Erro de regra da conferência, com mensagem pronta para a tela (as ações já tratam ErroDevolucao). */
export class ErroConferencia extends ErroDevolucao {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroConferencia';
  }
}

/** Spec §6.3: "a conferência não termina enquanto faltar evidência obrigatória ou algum arquivo não tiver subido". */
export class ErroConclusao extends ErroConferencia {
  readonly pendencias: string[];

  constructor(pendencias: string[]) {
    super(`Ainda falta: ${pendencias.join('; ')}.`);
    this.name = 'ErroConclusao';
    this.pendencias = pendencias;
  }
}
```

`src/modules/conferencia/trava.ts`:

```ts
import { count, eq } from 'drizzle-orm';
import type { Db, DbOuTx } from '@/db/client';
import { devolucoes, itensDevolucao, usuarios } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { rotuloStatus } from '@/modules/devolucoes/dominio';
import { exigirTransicao } from '@/modules/devolucoes/transicoes';
import { registrarEvento } from '@/modules/historico/eventos';
import { ErroConferencia } from './erros';

/** Lê a devolução travando a linha até o fim da transação: duas pessoas no mesmo pacote esperam uma pela outra. */
export async function travarDevolucao(tx: DbOuTx, devolucaoId: string) {
  const [d] = await tx
    .select({
      id: devolucoes.id,
      codigo: devolucoes.codigo,
      status: devolucoes.status,
      canal: devolucoes.canal,
      naoIdentificada: devolucoes.naoIdentificada,
      conferenteId: devolucoes.conferenteId,
    })
    .from(devolucoes)
    .where(eq(devolucoes.id, devolucaoId))
    .for('update');
  if (!d) throw new ErroConferencia('Devolução não encontrada.');
  return d;
}

async function nomeDoUsuario(tx: DbOuTx, id: string | null): Promise<string> {
  if (!id) return 'outra pessoa';
  const [u] = await tx.select({ nome: usuarios.nome }).from(usuarios).where(eq(usuarios.id, id));
  return u?.nome ?? 'outra pessoa';
}

/** A conferência está aberta por este usuário. Toda gravação da bancada passa por aqui (trava conferida no servidor). */
export async function exigirConferente(tx: DbOuTx, devolucaoId: string, usuario: UsuarioSessao) {
  const d = await travarDevolucao(tx, devolucaoId);
  if (d.status !== 'EM_CONFERENCIA' || d.conferenteId !== usuario.id) {
    throw new ErroConferencia('A conferência desta devolução não está aberta por você. Abra a devolução de novo.');
  }
  return d;
}

export async function iniciarConferencia(db: Db, devolucaoId: string, usuario: UsuarioSessao, agora: Date = new Date()): Promise<void> {
  exigirTransicao({ de: 'AGUARDANDO_CONFERENCIA', para: 'EM_CONFERENCIA', ator: usuario.perfil }, 'Seu perfil não pode conferir devoluções.');
  await db.transaction(async (tx) => {
    const d = await travarDevolucao(tx, devolucaoId);
    if (d.status === 'EM_CONFERENCIA') {
      if (d.conferenteId === usuario.id) return; // já é dele: só continua
      throw new ErroConferencia(`Em conferência por ${await nomeDoUsuario(tx, d.conferenteId)}.`);
    }
    if (d.status !== 'AGUARDANDO_CONFERENCIA') {
      throw new ErroConferencia(`A devolução ${d.codigo} está ${rotuloStatus(d.status).toLowerCase()}: não dá para conferir.`);
    }
    if (d.naoIdentificada) {
      throw new ErroConferencia('Pacote não identificado: o Gestor identifica o pedido antes da conferência.');
    }
    const [{ unidades }] = await tx.select({ unidades: count() }).from(itensDevolucao).where(eq(itensDevolucao.devolucaoId, devolucaoId));
    if (unidades === 0) throw new ErroConferencia('A devolução não tem unidades para conferir.');
    await tx
      .update(devolucoes)
      .set({ status: 'EM_CONFERENCIA', conferenteId: usuario.id, conferenciaIniciadaEm: agora, atualizadaEm: agora })
      .where(eq(devolucoes.id, devolucaoId));
    await registrarEvento(tx, {
      entidade: 'devolucao',
      entidadeId: devolucaoId,
      acao: 'conferencia_iniciada',
      de: 'AGUARDANDO_CONFERENCIA',
      para: 'EM_CONFERENCIA',
      usuarioId: usuario.id,
      em: agora,
    });
  });
}

async function voltarParaAguardando(tx: DbOuTx, devolucaoId: string, agora: Date): Promise<void> {
  await tx
    .update(devolucoes)
    .set({ status: 'AGUARDANDO_CONFERENCIA', conferenteId: null, conferenciaIniciadaEm: null, atualizadaEm: agora })
    .where(eq(devolucoes.id, devolucaoId));
}

export async function desistirConferencia(db: Db, devolucaoId: string, usuario: UsuarioSessao, agora: Date = new Date()): Promise<void> {
  exigirTransicao({ de: 'EM_CONFERENCIA', para: 'AGUARDANDO_CONFERENCIA', ator: usuario.perfil }, 'Seu perfil não pode conferir devoluções.');
  await db.transaction(async (tx) => {
    await exigirConferente(tx, devolucaoId, usuario);
    await voltarParaAguardando(tx, devolucaoId, agora);
    await registrarEvento(tx, {
      entidade: 'devolucao',
      entidadeId: devolucaoId,
      acao: 'conferencia_interrompida',
      de: 'EM_CONFERENCIA',
      para: 'AGUARDANDO_CONFERENCIA',
      usuarioId: usuario.id,
      em: agora,
    });
  });
}

/** Spec §11: o Gestor pode liberar a trava (por exemplo, quando o celular de quem conferia quebrou). */
export async function liberarTrava(db: Db, devolucaoId: string, usuario: UsuarioSessao, agora: Date = new Date()): Promise<void> {
  if (usuario.perfil !== 'GESTOR') throw new ErroConferencia('Só o Gestor libera a trava da conferência.');
  exigirTransicao({ de: 'EM_CONFERENCIA', para: 'AGUARDANDO_CONFERENCIA', ator: usuario.perfil });
  await db.transaction(async (tx) => {
    const d = await travarDevolucao(tx, devolucaoId);
    if (d.status !== 'EM_CONFERENCIA') throw new ErroConferencia('Esta devolução não está em conferência.');
    const conferente = await nomeDoUsuario(tx, d.conferenteId);
    await voltarParaAguardando(tx, devolucaoId, agora);
    await registrarEvento(tx, {
      entidade: 'devolucao',
      entidadeId: devolucaoId,
      acao: 'conferencia_trava_liberada',
      de: 'EM_CONFERENCIA',
      para: 'AGUARDANDO_CONFERENCIA',
      usuarioId: usuario.id,
      em: agora,
      dados: { conferenteId: d.conferenteId, conferente },
    });
  });
}
```

`src/modules/conferencia/leitura.ts`:

```ts
import { asc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { DbOuTx } from '@/db/client';
import { devolucoes, evidencias, itensDevolucao, produtos, usuarios } from '@/db/schema';
import type { VideoObrigatorio } from '@/modules/configuracoes/dominio';
import { lerConfiguracao } from '@/modules/configuracoes/ler';
import type { Canal, DestinoItem, MotivoItem, StatusDevolucao, StatusItem } from '@/modules/devolucoes/dominio';
import type { SituacaoProcessamento, TipoEvidencia } from '@/modules/midia/dominio';

export type ItemConferencia = {
  id: string;
  unidade: number;
  sku: string;
  status: StatusItem;
  /** Do produto esperado (vazio quando o SKU está fora do cadastro). */
  descricao: string | null;
  eanEsperado: string | null;
  serial: string | null;
  loteFabricacao: string | null;
  validade: string | null;
  eanLido: string | null;
  produtoRecebido: { sku: string; descricao: string } | null;
  /** Leu um EAN e o produto recebido não é o esperado. */
  divergente: boolean;
  destino: DestinoItem | null;
  motivo: MotivoItem | null;
  observacao: string | null;
};

export type EvidenciaConferencia = {
  id: string;
  tipo: TipoEvidencia;
  itemId: string | null;
  situacao: SituacaoProcessamento;
  tipoConteudo: string;
  caminho: string | null;
  provedor: string | null;
  enviadoEm: Date;
  erro: string | null;
};

export type DadosConferencia = {
  id: string;
  codigo: string;
  status: StatusDevolucao;
  canal: Canal | null;
  naoIdentificada: boolean;
  rastreio: string | null;
  conferenteId: string | null;
  conferenteNome: string | null;
  conferenciaIniciadaEm: Date | null;
  conferidaEm: Date | null;
  videoObrigatorio: VideoObrigatorio;
  itens: ItemConferencia[];
  evidencias: EvidenciaConferencia[];
};

/** Tudo o que a bancada e a seção "Conferência" do detalhe mostram. */
export async function obterConferencia(db: DbOuTx, chave: { id: string } | { codigo: string }): Promise<DadosConferencia | null> {
  const conferente = alias(usuarios, 'conferente');
  const onde = 'id' in chave ? eq(devolucoes.id, chave.id) : eq(devolucoes.codigo, chave.codigo.trim().toUpperCase());
  const [d] = await db
    .select({
      id: devolucoes.id,
      codigo: devolucoes.codigo,
      status: devolucoes.status,
      canal: devolucoes.canal,
      naoIdentificada: devolucoes.naoIdentificada,
      rastreio: devolucoes.rastreio,
      conferenteId: devolucoes.conferenteId,
      conferenteNome: conferente.nome,
      conferenciaIniciadaEm: devolucoes.conferenciaIniciadaEm,
      conferidaEm: devolucoes.conferidaEm,
    })
    .from(devolucoes)
    .leftJoin(conferente, eq(conferente.id, devolucoes.conferenteId))
    .where(onde)
    .limit(1);
  if (!d) return null;

  const esperado = alias(produtos, 'esperado');
  const recebido = alias(produtos, 'recebido');
  const linhas = await db
    .select({
      id: itensDevolucao.id,
      unidade: itensDevolucao.unidade,
      sku: itensDevolucao.sku,
      status: itensDevolucao.status,
      descricao: esperado.descricao,
      eanEsperado: esperado.ean,
      serial: itensDevolucao.serial,
      loteFabricacao: itensDevolucao.loteFabricacao,
      validade: itensDevolucao.validade,
      eanLido: itensDevolucao.eanLido,
      destino: itensDevolucao.destino,
      motivo: itensDevolucao.motivo,
      observacao: itensDevolucao.observacao,
      produtoEsperadoId: itensDevolucao.produtoEsperadoId,
      produtoRecebidoId: itensDevolucao.produtoRecebidoId,
      recebidoSku: recebido.sku,
      recebidoDescricao: recebido.descricao,
    })
    .from(itensDevolucao)
    .leftJoin(esperado, eq(esperado.id, itensDevolucao.produtoEsperadoId))
    .leftJoin(recebido, eq(recebido.id, itensDevolucao.produtoRecebidoId))
    .where(eq(itensDevolucao.devolucaoId, d.id))
    .orderBy(asc(itensDevolucao.unidade));

  const lista = await db
    .select({
      id: evidencias.id,
      tipo: evidencias.tipo,
      itemId: evidencias.itemId,
      situacao: evidencias.situacaoProcessamento,
      tipoConteudo: evidencias.tipoConteudo,
      caminho: evidencias.caminho,
      provedor: evidencias.provedor,
      enviadoEm: evidencias.enviadoEm,
      erro: evidencias.erroProcessamento,
    })
    .from(evidencias)
    .where(eq(evidencias.devolucaoId, d.id))
    .orderBy(asc(evidencias.enviadoEm));

  const config = await lerConfiguracao(db);
  return {
    ...d,
    videoObrigatorio: config.videoObrigatorio,
    itens: linhas.map(({ produtoEsperadoId, produtoRecebidoId, recebidoSku, recebidoDescricao, ...item }) => ({
      ...item,
      produtoRecebido: produtoRecebidoId && recebidoSku ? { sku: recebidoSku, descricao: recebidoDescricao ?? '' } : null,
      divergente: item.eanLido !== null && produtoRecebidoId !== produtoEsperadoId,
    })),
    evidencias: lista,
  };
}
```

Rode: `npm run test:int -- src/modules/conferencia`
Esperado: PASS.

- [ ] **Passo 4: Verificar e commitar**

```bash
cd "/c/Users/idmpc/devolucoes-wt/fase-2"
npm run typecheck && npm run lint
git add src/modules/conferencia tests/helpers/fabricas-conferencia.ts
git commit -m "feat: trava da conferência (iniciar, desistir, liberar) e leitura dos dados da bancada" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 10: Unidades na conferência (S/N, lote, validade, EAN lido, destino e motivo)

**Arquivos:**
- Criar: `src/modules/conferencia/regras.ts` (funções puras, também usadas pela tela), `src/modules/conferencia/itens.ts`
- Testes: `src/modules/conferencia/regras.test.ts`, `src/modules/conferencia/itens.int.test.ts`

**Interfaces:**
- Consome: `exigirConferente` (Tarefa 9); `MOTIVOS_ITEM`, `DestinoItem`, `MotivoItem` (Tarefa 2).
- Produz:
  - em `regras.ts`: `DECISOES = ['BOM', 'PROBLEMA', 'AUSENTE']`, `type Decisao`, `MOTIVOS_PROBLEMA` (os motivos sem AUSENTE), `decisaoDoItem(destino, motivo): Decisao | null`, `colunasDaDecisao(decisao, motivo)`, `type EntradaItem = { serial: string; loteFabricacao: string; validade: string; decisao: Decisao | null; motivo: MotivoItem | null; observacao: string }`, `type ColunasItem`, `entradaDoItem(item): EntradaItem`, `validarItem(e): { colunas: ColunasItem | null; erros: string[] }`, `semZerosAEsquerda(codigo)`, `type ResultadoComparacao`, `compararEan({ esperado, lido, achado }): ResultadoComparacao`
  - em `itens.ts`: `salvarItem(db: Db, devolucaoId, itemId, entrada: EntradaItem, usuario): Promise<void>`, `type ResultadoEan = { situacao: 'confere' | 'diverge' | 'sem_referencia' | 'confirmado'; produtoRecebido: { sku: string; descricao: string } | null; sugerirMotivo: 'DIVERGENTE' | null }`, `registrarEan(db: Db, devolucaoId, itemId, lido: string | null, usuario): Promise<ResultadoEan>` (`lido = null` = "não dá para ler: o produto é o esperado")

- [ ] **Passo 1: Escrever os testes que falham**

`src/modules/conferencia/regras.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { colunasDaDecisao, compararEan, decisaoDoItem, entradaDoItem, MOTIVOS_PROBLEMA, validarItem, type EntradaItem } from './regras';

const VAZIA: EntradaItem = { serial: '', loteFabricacao: '', validade: '', decisao: null, motivo: null, observacao: '' };

describe('decisão de cada unidade (contrato §4.1 e D4)', () => {
  it('Estoque Bom, Estoque Problema com motivo, ausente e "ainda não decidiu"', () => {
    expect(colunasDaDecisao('BOM', 'AVARIADO')).toEqual({ destino: 'BOM', motivo: null });
    expect(colunasDaDecisao('PROBLEMA', 'AVARIADO')).toEqual({ destino: 'PROBLEMA', motivo: 'AVARIADO' });
    expect(colunasDaDecisao('AUSENTE', null)).toEqual({ destino: null, motivo: 'AUSENTE' });
    expect(colunasDaDecisao(null, 'USADO')).toEqual({ destino: null, motivo: null });
  });

  it('Estoque Problema exige motivo, e o motivo não pode ser "Ausente"', () => {
    expect(colunasDaDecisao('PROBLEMA', null)).toEqual({ erro: 'Escolha o motivo do Estoque Problema.' });
    expect(colunasDaDecisao('PROBLEMA', 'AUSENTE')).toEqual({ erro: 'Escolha o motivo do Estoque Problema.' });
    expect(MOTIVOS_PROBLEMA).not.toContain('AUSENTE');
  });

  it('decisaoDoItem lê as colunas de volta', () => {
    expect(decisaoDoItem('BOM', null)).toBe('BOM');
    expect(decisaoDoItem('PROBLEMA', 'USADO')).toBe('PROBLEMA');
    expect(decisaoDoItem(null, 'AUSENTE')).toBe('AUSENTE');
    expect(decisaoDoItem(null, null)).toBeNull();
  });
});

describe('validarItem', () => {
  it('apara os textos e transforma vazio em nulo', () => {
    expect(validarItem({ ...VAZIA, serial: '  SN-1 ', loteFabricacao: ' L9 ', validade: '12/2027', decisao: 'BOM', observacao: '  ' })).toEqual({
      colunas: { serial: 'SN-1', loteFabricacao: 'L9', validade: '12/2027', destino: 'BOM', motivo: null, observacao: null },
      erros: [],
    });
  });

  it('junta os erros de tamanho e de decisão', () => {
    const { colunas, erros } = validarItem({ ...VAZIA, serial: 'x'.repeat(101), validade: 'x'.repeat(21), decisao: 'PROBLEMA' });
    expect(colunas).toBeNull();
    expect(erros).toEqual(['Nº de série (S/N): no máximo 100 caracteres', 'Validade: no máximo 20 caracteres', 'Escolha o motivo do Estoque Problema.']);
  });

  it('entradaDoItem monta o formulário a partir das colunas', () => {
    expect(
      entradaDoItem({ serial: 'SN', loteFabricacao: null, validade: null, destino: null, motivo: 'AUSENTE', observacao: 'caixa vazia' }),
    ).toEqual({ serial: 'SN', loteFabricacao: '', validade: '', decisao: 'AUSENTE', motivo: 'AUSENTE', observacao: 'caixa vazia' });
  });
});

describe('compararEan (spec §6.3: EAN diferente do esperado sugere "Divergente")', () => {
  const esperado = { id: 'p1', ean: '0036000291452' };

  it('confere com o esperado, mesmo com zeros à esquerda diferentes (UPC-A lido como EAN-13)', () => {
    expect(compararEan({ esperado, lido: '036000291452', achado: null })).toEqual({ situacao: 'confere', produtoRecebidoId: 'p1', sugerirMotivo: null });
  });

  it('diverge: o produto recebido é o achado pelo EAN (ou nenhum) e sugere Divergente', () => {
    expect(compararEan({ esperado, lido: '7891000000014', achado: { id: 'p2' } })).toEqual({ situacao: 'diverge', produtoRecebidoId: 'p2', sugerirMotivo: 'DIVERGENTE' });
    expect(compararEan({ esperado, lido: '7891000000014', achado: null })).toEqual({ situacao: 'diverge', produtoRecebidoId: null, sugerirMotivo: 'DIVERGENTE' });
  });

  it('sem EAN no cadastro: só diverge quando o EAN é de outro produto', () => {
    const semEan = { id: 'p1', ean: null };
    expect(compararEan({ esperado: semEan, lido: '7891000000014', achado: { id: 'p2' } })).toEqual({ situacao: 'diverge', produtoRecebidoId: 'p2', sugerirMotivo: 'DIVERGENTE' });
    expect(compararEan({ esperado: semEan, lido: '7891000000014', achado: null })).toEqual({ situacao: 'sem_referencia', produtoRecebidoId: 'p1', sugerirMotivo: null });
    expect(compararEan({ esperado: null, lido: '7891000000014', achado: null })).toEqual({ situacao: 'sem_referencia', produtoRecebidoId: null, sugerirMotivo: null });
  });
});
```

`src/modules/conferencia/itens.int.test.ts`:

```ts
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { itensDevolucao } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarProdutoTeste, criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { criarDevolucaoEmConferencia } from '../../../tests/helpers/fabricas-conferencia';
import { registrarEan, salvarItem } from './itens';
import type { EntradaItem } from './regras';

const { db, sql } = criarDbTeste();
let operador: UsuarioSessao;
let esperadoId: string;
let outroId: string;

const VAZIA: EntradaItem = { serial: '', loteFabricacao: '', validade: '', decisao: null, motivo: null, observacao: '' };

beforeEach(async () => {
  await limparTabelas(sql);
  operador = await criarUsuarioTeste(db, 'OPERADOR');
  esperadoId = await criarProdutoTeste(db, { sku: 'FONE-01', ean: '0036000291452', descricao: 'Fone Bluetooth' });
  outroId = await criarProdutoTeste(db, { sku: 'CABO-02', ean: '7891000000014', descricao: 'Cabo USB-C' });
});
afterAll(async () => {
  await sql.end();
});

async function item(id: string) {
  const [i] = await db
    .select({
      serial: itensDevolucao.serial,
      lote: itensDevolucao.loteFabricacao,
      validade: itensDevolucao.validade,
      destino: itensDevolucao.destino,
      motivo: itensDevolucao.motivo,
      observacao: itensDevolucao.observacao,
      eanLido: itensDevolucao.eanLido,
      produtoRecebidoId: itensDevolucao.produtoRecebidoId,
    })
    .from(itensDevolucao)
    .where(eq(itensDevolucao.id, id));
  return i;
}

describe('salvarItem', () => {
  it('grava S/N, lote, validade, destino, motivo e observação', async () => {
    const d = await criarDevolucaoEmConferencia(db, operador, { itens: [{ sku: 'FONE-01', quantidade: 1 }] });
    await salvarItem(db, d.id, d.itens[0], { serial: 'SN-9', loteFabricacao: 'L1', validade: '12/2027', decisao: 'PROBLEMA', motivo: 'AVARIADO', observacao: 'tela trincada' }, operador);
    expect(await item(d.itens[0])).toMatchObject({ serial: 'SN-9', lote: 'L1', validade: '12/2027', destino: 'PROBLEMA', motivo: 'AVARIADO', observacao: 'tela trincada' });
    await salvarItem(db, d.id, d.itens[0], { ...VAZIA, decisao: 'AUSENTE' }, operador);
    expect(await item(d.itens[0])).toMatchObject({ serial: null, destino: null, motivo: 'AUSENTE' });
  });

  it('recusa o que é inválido, a unidade de outra devolução e quem não está com a trava', async () => {
    const d = await criarDevolucaoEmConferencia(db, operador);
    const outraDevolucao = await criarDevolucaoEmConferencia(db, operador);
    await expect(salvarItem(db, d.id, d.itens[0], { ...VAZIA, decisao: 'PROBLEMA' }, operador)).rejects.toThrow('Escolha o motivo do Estoque Problema.');
    await expect(salvarItem(db, d.id, outraDevolucao.itens[0], VAZIA, operador)).rejects.toThrow('Unidade não encontrada nesta devolução.');
    const outro = await criarUsuarioTeste(db, 'OPERADOR');
    await expect(salvarItem(db, d.id, d.itens[0], VAZIA, outro)).rejects.toThrow('A conferência desta devolução não está aberta por você.');
  });
});

describe('registrarEan', () => {
  it('confere: o produto recebido é o esperado', async () => {
    const d = await criarDevolucaoEmConferencia(db, operador, { itens: [{ sku: 'FONE-01', quantidade: 1 }] });
    expect(await registrarEan(db, d.id, d.itens[0], ' 036000291452 ', operador)).toEqual({
      situacao: 'confere',
      produtoRecebido: { sku: 'FONE-01', descricao: 'Fone Bluetooth' },
      sugerirMotivo: null,
    });
    expect(await item(d.itens[0])).toMatchObject({ eanLido: '036000291452', produtoRecebidoId: esperadoId });
  });

  it('diverge: grava o produto achado pelo EAN e sugere Divergente; EAN desconhecido deixa o produto vazio', async () => {
    const d = await criarDevolucaoEmConferencia(db, operador, { itens: [{ sku: 'FONE-01', quantidade: 1 }] });
    expect(await registrarEan(db, d.id, d.itens[0], '7891000000014', operador)).toEqual({
      situacao: 'diverge',
      produtoRecebido: { sku: 'CABO-02', descricao: 'Cabo USB-C' },
      sugerirMotivo: 'DIVERGENTE',
    });
    expect((await item(d.itens[0])).produtoRecebidoId).toBe(outroId);
    expect((await registrarEan(db, d.id, d.itens[0], '7890000000001', operador)).produtoRecebido).toBeNull();
    expect((await item(d.itens[0])).produtoRecebidoId).toBeNull();
  });

  it('"não dá para ler": confirma o produto esperado sem EAN lido', async () => {
    const d = await criarDevolucaoEmConferencia(db, operador, { itens: [{ sku: 'FONE-01', quantidade: 1 }] });
    await registrarEan(db, d.id, d.itens[0], '7891000000014', operador);
    expect((await registrarEan(db, d.id, d.itens[0], null, operador)).situacao).toBe('confirmado');
    expect(await item(d.itens[0])).toMatchObject({ eanLido: null, produtoRecebidoId: esperadoId });
  });

  it('recusa código vazio', async () => {
    const d = await criarDevolucaoEmConferencia(db, operador);
    await expect(registrarEan(db, d.id, d.itens[0], '   ', operador)).rejects.toThrow('Leia ou digite o código de barras (até 50 caracteres).');
  });
});
```

Rode: `npm test -- src/modules/conferencia/regras.test.ts && npm run test:int -- src/modules/conferencia/itens.int.test.ts`
Esperado: FAIL (os módulos não existem).

- [ ] **Passo 2: Implementar as regras puras**

`src/modules/conferencia/regras.ts`:

```ts
/**
 * Regras puras da conferência. Também rodam no celular (a tela mostra o que falta antes de pedir a conclusão),
 * então este arquivo só importa vocabulário (dominio.ts), nunca o banco.
 */
import { MOTIVOS_ITEM, type DestinoItem, type MotivoItem } from '@/modules/devolucoes/dominio';

/** Estoque Bom, Estoque Problema ou ausente (contrato D4: ausente não tem destino, só o motivo AUSENTE). */
export const DECISOES = ['BOM', 'PROBLEMA', 'AUSENTE'] as const;
export type Decisao = (typeof DECISOES)[number];

export const MOTIVOS_PROBLEMA = MOTIVOS_ITEM.filter((m) => m !== 'AUSENTE');

export function decisaoDoItem(destino: DestinoItem | null, motivo: MotivoItem | null): Decisao | null {
  if (destino) return destino;
  return motivo === 'AUSENTE' ? 'AUSENTE' : null;
}

export function colunasDaDecisao(
  decisao: Decisao | null,
  motivo: MotivoItem | null,
): { destino: DestinoItem | null; motivo: MotivoItem | null } | { erro: string } {
  switch (decisao) {
    case 'BOM':
      return { destino: 'BOM', motivo: null };
    case 'PROBLEMA':
      if (!motivo || motivo === 'AUSENTE') return { erro: 'Escolha o motivo do Estoque Problema.' };
      return { destino: 'PROBLEMA', motivo };
    case 'AUSENTE':
      return { destino: null, motivo: 'AUSENTE' };
    default:
      return { destino: null, motivo: null };
  }
}

/** O que o celular manda de cada unidade (tudo junto: o último estado da tela vence). */
export type EntradaItem = {
  serial: string;
  loteFabricacao: string;
  validade: string;
  decisao: Decisao | null;
  motivo: MotivoItem | null;
  observacao: string;
};

export type ColunasItem = {
  serial: string | null;
  loteFabricacao: string | null;
  validade: string | null;
  destino: DestinoItem | null;
  motivo: MotivoItem | null;
  observacao: string | null;
};

export function entradaDoItem(i: ColunasItem): EntradaItem {
  return {
    serial: i.serial ?? '',
    loteFabricacao: i.loteFabricacao ?? '',
    validade: i.validade ?? '',
    decisao: decisaoDoItem(i.destino, i.motivo),
    motivo: i.motivo,
    observacao: i.observacao ?? '',
  };
}

export function validarItem(e: EntradaItem): { colunas: ColunasItem | null; erros: string[] } {
  const erros: string[] = [];
  const texto = (valor: string, maximo: number, nome: string): string | null => {
    const limpo = valor.trim();
    if (limpo.length > maximo) erros.push(`${nome}: no máximo ${maximo} caracteres`);
    return limpo || null;
  };
  const serial = texto(e.serial, 100, 'Nº de série (S/N)');
  const loteFabricacao = texto(e.loteFabricacao, 60, 'Lote');
  const validade = texto(e.validade, 20, 'Validade');
  const observacao = texto(e.observacao, 500, 'Observação');
  const decisao = colunasDaDecisao(e.decisao, e.motivo);
  if ('erro' in decisao) erros.push(decisao.erro);
  if (erros.length > 0 || 'erro' in decisao) return { colunas: null, erros };
  return { colunas: { serial, loteFabricacao, validade, destino: decisao.destino, motivo: decisao.motivo, observacao }, erros: [] };
}

/** "0036000291452" e "036000291452" são o mesmo GTIN (UPC-A lido como EAN-13). */
export function semZerosAEsquerda(codigo: string): string {
  return codigo.replace(/^0+(?=\d)/, '');
}

export type ResultadoComparacao = {
  situacao: 'confere' | 'diverge' | 'sem_referencia';
  produtoRecebidoId: string | null;
  sugerirMotivo: 'DIVERGENTE' | null;
};

/** Contrato §5.6: o produto recebido é o esperado quando o EAN confere; o achado pelo EAN quando diverge; vazio se desconhecido. */
export function compararEan(p: {
  esperado: { id: string; ean: string | null } | null;
  lido: string;
  achado: { id: string } | null;
}): ResultadoComparacao {
  if (p.esperado?.ean) {
    if (semZerosAEsquerda(p.esperado.ean) === semZerosAEsquerda(p.lido)) {
      return { situacao: 'confere', produtoRecebidoId: p.esperado.id, sugerirMotivo: null };
    }
    return { situacao: 'diverge', produtoRecebidoId: p.achado?.id ?? null, sugerirMotivo: 'DIVERGENTE' };
  }
  if (p.achado && p.esperado && p.achado.id !== p.esperado.id) {
    return { situacao: 'diverge', produtoRecebidoId: p.achado.id, sugerirMotivo: 'DIVERGENTE' };
  }
  return { situacao: 'sem_referencia', produtoRecebidoId: p.achado?.id ?? p.esperado?.id ?? null, sugerirMotivo: null };
}
```

Rode: `npm test -- src/modules/conferencia/regras.test.ts`
Esperado: PASS.

- [ ] **Passo 3: Implementar a gravação das unidades e a leitura do EAN**

`src/modules/conferencia/itens.ts`:

```ts
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Db, DbOuTx } from '@/db/client';
import { itensDevolucao, produtos } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { ErroConferencia } from './erros';
import { compararEan, validarItem, type EntradaItem } from './regras';
import { exigirConferente } from './trava';

/** Durante a conferência a unidade continua PENDENTE: destino, motivo e campos podem ser gravados e trocados (contrato §4.6). */
export async function salvarItem(db: Db, devolucaoId: string, itemId: string, entrada: EntradaItem, usuario: UsuarioSessao): Promise<void> {
  const { colunas, erros } = validarItem(entrada);
  if (!colunas) throw new ErroConferencia(erros.join('; '));
  await db.transaction(async (tx) => {
    await exigirConferente(tx, devolucaoId, usuario);
    const [gravado] = await tx
      .update(itensDevolucao)
      .set(colunas)
      .where(and(eq(itensDevolucao.id, itemId), eq(itensDevolucao.devolucaoId, devolucaoId), eq(itensDevolucao.status, 'PENDENTE')))
      .returning({ id: itensDevolucao.id });
    if (!gravado) throw new ErroConferencia('Unidade não encontrada nesta devolução.');
  });
}

export type ResultadoEan = {
  situacao: 'confere' | 'diverge' | 'sem_referencia' | 'confirmado';
  produtoRecebido: { sku: string; descricao: string } | null;
  sugerirMotivo: 'DIVERGENTE' | null;
};

async function resumoProduto(tx: DbOuTx, id: string | null): Promise<{ sku: string; descricao: string } | null> {
  if (!id) return null;
  const [p] = await tx.select({ sku: produtos.sku, descricao: produtos.descricao }).from(produtos).where(eq(produtos.id, id));
  return p ?? null;
}

/**
 * Leitura do código de barras da unidade (spec §6.3). `lido = null`: "não dá para ler, o produto é o esperado".
 * O código lido é guardado como veio (sem espaços, em maiúsculas) para a Busca Avançada.
 */
export async function registrarEan(
  db: Db,
  devolucaoId: string,
  itemId: string,
  lidoBruto: string | null,
  usuario: UsuarioSessao,
): Promise<ResultadoEan> {
  const lido = lidoBruto === null ? null : lidoBruto.replace(/\s+/g, '').toUpperCase();
  if (lido !== null && (lido.length === 0 || lido.length > 50)) {
    throw new ErroConferencia('Leia ou digite o código de barras (até 50 caracteres).');
  }
  return db.transaction(async (tx) => {
    await exigirConferente(tx, devolucaoId, usuario);
    const [item] = await tx
      .select({ esperadoId: itensDevolucao.produtoEsperadoId, eanEsperado: produtos.ean })
      .from(itensDevolucao)
      .leftJoin(produtos, eq(produtos.id, itensDevolucao.produtoEsperadoId))
      .where(and(eq(itensDevolucao.id, itemId), eq(itensDevolucao.devolucaoId, devolucaoId), eq(itensDevolucao.status, 'PENDENTE')));
    if (!item) throw new ErroConferencia('Unidade não encontrada nesta devolução.');

    if (lido === null) {
      await tx.update(itensDevolucao).set({ eanLido: null, produtoRecebidoId: item.esperadoId }).where(eq(itensDevolucao.id, itemId));
      return { situacao: 'confirmado', produtoRecebido: await resumoProduto(tx, item.esperadoId), sugerirMotivo: null };
    }

    // Pelo EAN sem zeros à esquerda; se o esperado estiver entre os achados, ele vence.
    const achados = /^\d+$/.test(lido)
      ? await tx
          .select({ id: produtos.id })
          .from(produtos)
          .where(sql`ltrim(${produtos.ean}, '0') = ltrim(${lido}, '0')`)
          .limit(5)
      : [];
    const achado = achados.find((a) => a.id === item.esperadoId) ?? achados[0] ?? null;
    const esperado = item.esperadoId ? { id: item.esperadoId, ean: item.eanEsperado } : null;
    const c = compararEan({ esperado, lido, achado });
    await tx.update(itensDevolucao).set({ eanLido: lido, produtoRecebidoId: c.produtoRecebidoId }).where(eq(itensDevolucao.id, itemId));
    return { situacao: c.situacao, produtoRecebido: await resumoProduto(tx, c.produtoRecebidoId), sugerirMotivo: c.sugerirMotivo };
  });
}

/** Só para a conclusão: as unidades da devolução, na ordem. */
export async function unidadesDaDevolucao(tx: DbOuTx, devolucaoId: string, ids?: string[]) {
  return tx
    .select({
      id: itensDevolucao.id,
      unidade: itensDevolucao.unidade,
      status: itensDevolucao.status,
      destino: itensDevolucao.destino,
      motivo: itensDevolucao.motivo,
      eanLido: itensDevolucao.eanLido,
      produtoEsperadoId: itensDevolucao.produtoEsperadoId,
      produtoRecebidoId: itensDevolucao.produtoRecebidoId,
    })
    .from(itensDevolucao)
    .where(and(eq(itensDevolucao.devolucaoId, devolucaoId), ids ? inArray(itensDevolucao.id, ids) : undefined))
    .orderBy(itensDevolucao.unidade);
}
```

Rode: `npm run test:int -- src/modules/conferencia/itens.int.test.ts`
Esperado: PASS.

- [ ] **Passo 4: Verificar e commitar**

```bash
cd "/c/Users/idmpc/devolucoes-wt/fase-2"
npm test && npm run typecheck && npm run lint
git add src/modules/conferencia
git commit -m "feat: unidades na conferência (S/N, lote, validade, EAN lido com sugestão de Divergente, destino e motivo)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 11: Concluir a conferência (contrato §5.4)

**Arquivos:**
- Modificar: `src/modules/conferencia/regras.ts`, `src/modules/conferencia/regras.test.ts`
- Criar: `src/modules/conferencia/concluir.ts`
- Testes: `src/modules/conferencia/concluir.int.test.ts`

**Interfaces:**
- Consome: `exigirConferente`, `ErroConclusao` (Tarefa 9); `unidadesDaDevolucao` (Tarefa 10); `exigirTransicao`, `exigirTransicaoItem` (Tarefa 3); `lerConfiguracao` (Tarefa 2); `obterFila`, `FilaMemoria`, `definirFilaParaTestes` (Tarefa 4).
- Produz:
  - em `regras.ts`: `type ItemRegra = { id: string; unidade: number; destino: DestinoItem | null; motivo: MotivoItem | null }`, `type EvidenciaRegra = { tipo: TipoEvidencia; itemId: string | null }`, `videoExigido(config: VideoObrigatorio, itens): boolean`, `pendenciasDaConclusao({ itens, evidencias, videoObrigatorio }): string[]`
  - `concluirConferencia(db: Db, devolucaoId: string, usuario: UsuarioSessao, agora?: Date): Promise<{ status: 'AGUARDANDO_NF' | 'CONCLUIDA' }>` (assinatura exata do contrato)

- [ ] **Passo 1: Escrever os testes que falham**

Acrescente no **final** de `src/modules/conferencia/regras.test.ts` (e acrescente `pendenciasDaConclusao, videoExigido, type EvidenciaRegra, type ItemRegra` ao import de `./regras`):

```ts
describe('pendenciasDaConclusao (spec §6.3 e contrato §5.4)', () => {
  const PACOTE: EvidenciaRegra[] = [
    { tipo: 'FOTO_1_ETIQUETA', itemId: null },
    { tipo: 'FOTO_2_EMBALAGEM', itemId: null },
  ];
  const fotosDa = (itemId: string): EvidenciaRegra[] => [
    { tipo: 'FOTO_3_PRODUTO', itemId },
    { tipo: 'FOTO_4_CODIGO_SERIAL', itemId },
  ];
  const bom: ItemRegra = { id: 'i1', unidade: 1, destino: 'BOM', motivo: null };
  const problema: ItemRegra = { id: 'i2', unidade: 2, destino: 'PROBLEMA', motivo: 'USADO' };
  const ausente: ItemRegra = { id: 'i3', unidade: 3, destino: null, motivo: 'AUSENTE' };

  it('nada falta: Fotos 1 e 2, Fotos 3 e 4 de cada unidade presente, destino de todas e o vídeo', () => {
    expect(
      pendenciasDaConclusao({
        itens: [bom, ausente],
        evidencias: [...PACOTE, ...fotosDa('i1'), { tipo: 'VIDEO_PROVA', itemId: null }],
        videoObrigatorio: 'SEMPRE',
      }),
    ).toEqual([]);
  });

  it('lista o que falta, na ordem do assistente', () => {
    expect(
      pendenciasDaConclusao({
        itens: [{ ...bom, destino: null }, problema],
        evidencias: [{ tipo: 'FOTO_2_EMBALAGEM', itemId: null }, { tipo: 'FOTO_3_PRODUTO', itemId: 'i2' }],
        videoObrigatorio: 'SEMPRE',
      }),
    ).toEqual([
      'Foto 1 (etiqueta de rastreio e declaração de conteúdo)',
      'Foto 3 da unidade 1',
      'Foto 4 da unidade 1',
      'Destino da unidade 1',
      'Foto 4 da unidade 2',
      'Vídeo de Prova',
    ]);
  });

  it('vídeo SO_PROBLEMA: só quando alguma unidade for Estoque Problema ou ausente (contrato D5)', () => {
    expect(videoExigido('SO_PROBLEMA', [bom])).toBe(false);
    expect(videoExigido('SO_PROBLEMA', [bom, problema])).toBe(true);
    expect(videoExigido('SO_PROBLEMA', [ausente])).toBe(true);
    expect(videoExigido('SEMPRE', [bom])).toBe(true);
    expect(pendenciasDaConclusao({ itens: [bom], evidencias: [...PACOTE, ...fotosDa('i1')], videoObrigatorio: 'SO_PROBLEMA' })).toEqual([]);
  });
});
```

`src/modules/conferencia/concluir.int.test.ts`:

```ts
import { and, asc, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { configuracoes, devolucoes, eventosHistorico, itensDevolucao } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { definirFilaParaTestes, FilaMemoria } from '@/modules/fila/fila';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarProdutoTeste, criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { criarDevolucaoEmConferencia, criarEvidenciasCompletas, criarEvidenciaTeste } from '../../../tests/helpers/fabricas-conferencia';
import { concluirConferencia } from './concluir';
import { ErroConclusao, ErroConferencia } from './erros';

const { db, sql } = criarDbTeste();
let operador: UsuarioSessao;
let fila: FilaMemoria;
let produtoId: string;

beforeEach(async () => {
  await limparTabelas(sql);
  fila = new FilaMemoria();
  definirFilaParaTestes(fila);
  operador = await criarUsuarioTeste(db, 'OPERADOR');
  produtoId = await criarProdutoTeste(db, { sku: 'FONE-01', descricao: 'Fone' });
});
afterAll(async () => {
  await sql.end();
});

async function decidir(itemId: string, destino: 'BOM' | 'PROBLEMA' | null, motivo: 'AVARIADO' | 'AUSENTE' | null) {
  await db.update(itensDevolucao).set({ destino, motivo }).where(eq(itensDevolucao.id, itemId));
}
async function situacao(id: string) {
  const [d] = await db
    .select({ status: devolucoes.status, conferidaEm: devolucoes.conferidaEm, concluidaEm: devolucoes.concluidaEm, conferenteId: devolucoes.conferenteId })
    .from(devolucoes)
    .where(eq(devolucoes.id, id));
  const itens = await db
    .select({ status: itensDevolucao.status, produtoRecebidoId: itensDevolucao.produtoRecebidoId })
    .from(itensDevolucao)
    .where(eq(itensDevolucao.devolucaoId, id))
    .orderBy(asc(itensDevolucao.unidade));
  return { ...d, itens };
}

describe('concluirConferencia', () => {
  it('recusa enquanto falta evidência ou destino, e não muda nada', async () => {
    const d = await criarDevolucaoEmConferencia(db, operador, { itens: [{ sku: 'FONE-01', quantidade: 1 }] });
    await criarEvidenciaTeste(db, { devolucaoId: d.id, tipo: 'FOTO_2_EMBALAGEM' });
    const erro = await concluirConferencia(db, d.id, operador).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroConclusao);
    expect((erro as ErroConclusao).pendencias).toEqual([
      'Foto 1 (etiqueta de rastreio e declaração de conteúdo)',
      'Foto 3 da unidade 1',
      'Foto 4 da unidade 1',
      'Destino da unidade 1',
      'Vídeo de Prova',
    ]);
    expect((await situacao(d.id)).status).toBe('EM_CONFERENCIA');
  });

  it('conclui: unidades vão para Aguardando NF ou Ausente e a devolução para Aguardando NF', async () => {
    const d = await criarDevolucaoEmConferencia(db, operador, { itens: [{ sku: 'FONE-01', quantidade: 2 }] });
    await criarEvidenciasCompletas(db, d.id, [d.itens[0]]);
    await decidir(d.itens[0], 'BOM', null);
    await decidir(d.itens[1], null, 'AUSENTE');
    const agora = new Date('2026-11-12T15:00:00Z');

    expect(await concluirConferencia(db, d.id, operador, agora)).toEqual({ status: 'AGUARDANDO_NF' });
    expect(await situacao(d.id)).toEqual({
      status: 'AGUARDANDO_NF',
      conferidaEm: agora,
      concluidaEm: null,
      conferenteId: operador.id, // a trava fica gravada (contrato §4.1)
      // Unidade 1 sem leitura de EAN: o produto recebido é o esperado (decisão 9). A ausente não recebeu nada.
      itens: [
        { status: 'AGUARDANDO_NF', produtoRecebidoId: produtoId },
        { status: 'AUSENTE', produtoRecebidoId: null },
      ],
    });
    const eventos = await db
      .select({ entidade: eventosHistorico.entidade, acao: eventosHistorico.acao, para: eventosHistorico.para })
      .from(eventosHistorico)
      .where(eq(eventosHistorico.acao, 'item_conferido'))
      .orderBy(asc(eventosHistorico.id));
    expect(eventos).toEqual([
      { entidade: 'item', acao: 'item_conferido', para: 'AGUARDANDO_NF' },
      { entidade: 'item', acao: 'item_conferido', para: 'AUSENTE' },
    ]);
    const [concluida] = await db
      .select({ de: eventosHistorico.de, para: eventosHistorico.para })
      .from(eventosHistorico)
      .where(and(eq(eventosHistorico.entidadeId, d.id), eq(eventosHistorico.acao, 'conferencia_concluida')));
    expect(concluida).toEqual({ de: 'EM_CONFERENCIA', para: 'AGUARDANDO_NF' });
  });

  it('todas ausentes: a devolução já fica Concluída, em dois passos, pelo sistema', async () => {
    const d = await criarDevolucaoEmConferencia(db, operador, { itens: [{ sku: 'FONE-01', quantidade: 1 }] });
    await criarEvidenciasCompletas(db, d.id, []);
    await decidir(d.itens[0], null, 'AUSENTE');
    const agora = new Date('2026-11-12T16:00:00Z');
    expect(await concluirConferencia(db, d.id, operador, agora)).toEqual({ status: 'CONCLUIDA' });
    expect(await situacao(d.id)).toMatchObject({ status: 'CONCLUIDA', conferidaEm: agora, concluidaEm: agora });
    const [evento] = await db
      .select({ de: eventosHistorico.de, para: eventosHistorico.para, usuarioId: eventosHistorico.usuarioId })
      .from(eventosHistorico)
      .where(and(eq(eventosHistorico.entidadeId, d.id), eq(eventosHistorico.acao, 'concluida')));
    expect(evento).toEqual({ de: 'AGUARDANDO_NF', para: 'CONCLUIDA', usuarioId: null });
  });

  it('vídeo SO_PROBLEMA: tudo Estoque Bom conclui sem vídeo', async () => {
    await db.insert(configuracoes).values({ id: 1, videoObrigatorio: 'SO_PROBLEMA' });
    const d = await criarDevolucaoEmConferencia(db, operador, { itens: [{ sku: 'FONE-01', quantidade: 1 }] });
    for (const tipo of ['FOTO_1_ETIQUETA', 'FOTO_2_EMBALAGEM'] as const) await criarEvidenciaTeste(db, { devolucaoId: d.id, tipo });
    for (const tipo of ['FOTO_3_PRODUTO', 'FOTO_4_CODIGO_SERIAL'] as const) await criarEvidenciaTeste(db, { devolucaoId: d.id, tipo, itemId: d.itens[0] });
    await decidir(d.itens[0], 'BOM', null);
    expect(await concluirConferencia(db, d.id, operador)).toEqual({ status: 'AGUARDANDO_NF' });
  });

  it('evidência que falhou no processamento não conta', async () => {
    const d = await criarDevolucaoEmConferencia(db, operador, { itens: [{ sku: 'FONE-01', quantidade: 1 }] });
    await criarEvidenciasCompletas(db, d.id, []);
    await criarEvidenciaTeste(db, { devolucaoId: d.id, tipo: 'FOTO_3_PRODUTO', itemId: d.itens[0], situacao: 'FALHOU' });
    await criarEvidenciaTeste(db, { devolucaoId: d.id, tipo: 'FOTO_4_CODIGO_SERIAL', itemId: d.itens[0] });
    await decidir(d.itens[0], 'BOM', null);
    await expect(concluirConferencia(db, d.id, operador)).rejects.toThrow('Ainda falta: Foto 3 da unidade 1.');
  });

  it('Mercado Livre: envia ml.enviar-resultado na transação, com a devolução como chave única; outros canais não', async () => {
    const ml = await criarDevolucaoEmConferencia(db, operador, { canal: 'MERCADO_LIVRE', itens: [{ sku: 'FONE-01', quantidade: 1 }] });
    await criarEvidenciasCompletas(db, ml.id, ml.itens);
    await decidir(ml.itens[0], 'PROBLEMA', 'AVARIADO');
    await concluirConferencia(db, ml.id, operador);
    expect(fila.enviadas).toEqual([
      { nome: 'ml.enviar-resultado', dados: { devolucaoId: ml.id }, opcoes: { tx: expect.anything(), chaveUnica: ml.id } },
    ]);

    const shopee = await criarDevolucaoEmConferencia(db, operador, { itens: [{ sku: 'FONE-01', quantidade: 1 }] });
    await criarEvidenciasCompletas(db, shopee.id, shopee.itens);
    await decidir(shopee.itens[0], 'BOM', null);
    await concluirConferencia(db, shopee.id, operador);
    expect(fila.enviadas).toHaveLength(1);
  });

  it('só quem está com a trava conclui', async () => {
    const d = await criarDevolucaoEmConferencia(db, operador);
    const outro = await criarUsuarioTeste(db, 'OPERADOR');
    await expect(concluirConferencia(db, d.id, outro)).rejects.toThrow(ErroConferencia);
  });
});
```

Rode: `npm test -- src/modules/conferencia/regras.test.ts && npm run test:int -- src/modules/conferencia/concluir.int.test.ts`
Esperado: FAIL (as funções novas e `concluir.ts` não existem).

- [ ] **Passo 2: Regras da conclusão**

Em `src/modules/conferencia/regras.ts`, acrescente estes dois imports no topo (junto do import de `@/modules/devolucoes/dominio`):

```ts
import type { VideoObrigatorio } from '@/modules/configuracoes/dominio';
import type { TipoEvidencia } from '@/modules/midia/dominio';
```

e acrescente no **final** do arquivo:

```ts
export type ItemRegra = { id: string; unidade: number; destino: DestinoItem | null; motivo: MotivoItem | null };
export type EvidenciaRegra = { tipo: TipoEvidencia; itemId: string | null };

/** Contrato D5: com SO_PROBLEMA, o vídeo é exigido se alguma unidade for Estoque Problema ou ausente. */
export function videoExigido(config: VideoObrigatorio, itens: Pick<ItemRegra, 'destino' | 'motivo'>[]): boolean {
  return config === 'SEMPRE' || itens.some((i) => i.destino === 'PROBLEMA' || i.motivo === 'AUSENTE');
}

/**
 * O que ainda falta para concluir (spec §6.3; contrato §5.4): Fotos 1 e 2 sempre; Fotos 3 e 4 e o destino de cada
 * unidade que não é ausente; o Vídeo de Prova conforme a configuração. `evidencias` = só as que subiram e não falharam.
 */
export function pendenciasDaConclusao(e: { itens: ItemRegra[]; evidencias: EvidenciaRegra[]; videoObrigatorio: VideoObrigatorio }): string[] {
  const tem = (tipo: TipoEvidencia, itemId: string | null = null) => e.evidencias.some((x) => x.tipo === tipo && x.itemId === itemId);
  const falta: string[] = [];
  if (!tem('FOTO_1_ETIQUETA')) falta.push('Foto 1 (etiqueta de rastreio e declaração de conteúdo)');
  if (!tem('FOTO_2_EMBALAGEM')) falta.push('Foto 2 (embalagem externa)');
  for (const item of e.itens) {
    if (item.motivo === 'AUSENTE') continue;
    if (!tem('FOTO_3_PRODUTO', item.id)) falta.push(`Foto 3 da unidade ${item.unidade}`);
    if (!tem('FOTO_4_CODIGO_SERIAL', item.id)) falta.push(`Foto 4 da unidade ${item.unidade}`);
    if (!item.destino) falta.push(`Destino da unidade ${item.unidade}`);
  }
  if (videoExigido(e.videoObrigatorio, e.itens) && !tem('VIDEO_PROVA')) falta.push('Vídeo de Prova');
  return falta;
}
```

- [ ] **Passo 3: Implementar a conclusão**

`src/modules/conferencia/concluir.ts`:

```ts
import { and, eq, ne } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { devolucoes, evidencias, itensDevolucao } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { lerConfiguracao } from '@/modules/configuracoes/ler';
import { exigirTransicao } from '@/modules/devolucoes/transicoes';
import { exigirTransicaoItem } from '@/modules/devolucoes/transicoes-item';
import { obterFila } from '@/modules/fila/fila';
import { registrarEvento } from '@/modules/historico/eventos';
import { ErroConclusao, ErroConferencia } from './erros';
import { unidadesDaDevolucao } from './itens';
import { pendenciasDaConclusao } from './regras';
import { exigirConferente } from './trava';

/**
 * Fim da conferência (contrato §5.4). Numa transação: unidades PENDENTE → AGUARDANDO_NF (com destino) ou AUSENTE,
 * devolução → AGUARDANDO_NF com conferida_em e, se todas forem AUSENTE, → CONCLUIDA (pelo sistema) com concluida_em.
 * Devolução do Mercado Livre: enfileira ml.enviar-resultado (o manipulador é da Fase 3).
 */
export async function concluirConferencia(
  db: Db,
  devolucaoId: string,
  usuario: UsuarioSessao,
  agora: Date = new Date(),
): Promise<{ status: 'AGUARDANDO_NF' | 'CONCLUIDA' }> {
  exigirTransicao({ de: 'EM_CONFERENCIA', para: 'AGUARDANDO_NF', ator: usuario.perfil }, 'Seu perfil não pode conferir devoluções.');
  return db.transaction(async (tx) => {
    const d = await exigirConferente(tx, devolucaoId, usuario);
    const itens = await unidadesDaDevolucao(tx, devolucaoId);
    if (itens.some((i) => i.status !== 'PENDENTE')) throw new ErroConferencia('Esta conferência já foi concluída.');
    // "Subiu" = existe a linha e o processamento não falhou (contrato §5.4).
    const subiram = await tx
      .select({ tipo: evidencias.tipo, itemId: evidencias.itemId })
      .from(evidencias)
      .where(and(eq(evidencias.devolucaoId, devolucaoId), ne(evidencias.situacaoProcessamento, 'FALHOU')));
    const config = await lerConfiguracao(tx);
    const pendencias = pendenciasDaConclusao({ itens, evidencias: subiram, videoObrigatorio: config.videoObrigatorio });
    if (pendencias.length > 0) throw new ErroConclusao(pendencias);

    for (const item of itens) {
      const para = item.motivo === 'AUSENTE' ? 'AUSENTE' : 'AGUARDANDO_NF';
      exigirTransicaoItem({ de: 'PENDENTE', para, ator: usuario.perfil });
      // Decisão 9: sem leitura de EAN, concluir confirma o produto esperado.
      const confirmarEsperado = para === 'AGUARDANDO_NF' && item.eanLido === null && item.produtoRecebidoId === null;
      await tx
        .update(itensDevolucao)
        .set({ status: para, ...(confirmarEsperado ? { produtoRecebidoId: item.produtoEsperadoId } : {}) })
        .where(eq(itensDevolucao.id, item.id));
      await registrarEvento(tx, {
        entidade: 'item',
        entidadeId: item.id,
        acao: 'item_conferido',
        de: 'PENDENTE',
        para,
        usuarioId: usuario.id,
        em: agora,
        dados: { devolucaoId, unidade: item.unidade, destino: item.destino, motivo: item.motivo },
      });
    }

    await tx.update(devolucoes).set({ status: 'AGUARDANDO_NF', conferidaEm: agora, atualizadaEm: agora }).where(eq(devolucoes.id, devolucaoId));
    await registrarEvento(tx, {
      entidade: 'devolucao',
      entidadeId: devolucaoId,
      acao: 'conferencia_concluida',
      de: 'EM_CONFERENCIA',
      para: 'AGUARDANDO_NF',
      usuarioId: usuario.id,
      em: agora,
    });

    let status: 'AGUARDANDO_NF' | 'CONCLUIDA' = 'AGUARDANDO_NF';
    if (itens.every((i) => i.motivo === 'AUSENTE')) {
      // Nenhuma unidade física a dar entrada (spec §5.2): o sistema conclui.
      exigirTransicao({ de: 'AGUARDANDO_NF', para: 'CONCLUIDA', ator: 'SISTEMA' });
      await tx.update(devolucoes).set({ status: 'CONCLUIDA', concluidaEm: agora, atualizadaEm: agora }).where(eq(devolucoes.id, devolucaoId));
      await registrarEvento(tx, {
        entidade: 'devolucao',
        entidadeId: devolucaoId,
        acao: 'concluida',
        de: 'AGUARDANDO_NF',
        para: 'CONCLUIDA',
        usuarioId: null,
        em: agora,
        dados: { motivo: 'Todas as unidades estavam ausentes.' },
      });
      status = 'CONCLUIDA';
    }

    if (d.canal === 'MERCADO_LIVRE') {
      await obterFila().enviar('ml.enviar-resultado', { devolucaoId }, { tx, chaveUnica: devolucaoId });
    }
    return { status };
  });
}
```

Rode: `npm test -- src/modules/conferencia/regras.test.ts && npm run test:int -- src/modules/conferencia`
Esperado: PASS.

- [ ] **Passo 4: Verificar e commitar**

```bash
cd "/c/Users/idmpc/devolucoes-wt/fase-2"
npm test && npm run typecheck && npm run lint
git add src/modules/conferencia
git commit -m "feat: conclusão da conferência (evidências obrigatórias, unidades Aguardando NF ou Ausente, Concluída sem unidades e aviso ao ML)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 12: Recepção dos arquivos (tus) e registro da evidência

**Por que assim:** o tus retoma o upload depois de uma queda (spec §4.2 e §9). O `@tus/server` tem `handleWeb(req: Request)` para route handlers do App Router e os ganchos `onIncomingRequest` (toda requisição) e `onUploadCreate` (antes de criar; pode recusar com `{ status_code, body }`), conferidos em `node_modules/@tus/server/dist/types.d.ts`. O `FileStore` grava o arquivo em `<pasta>/<id>` e o estado em `<pasta>/<id>.json`. O tus só recebe os bytes; o registro da evidência é um passo separado (decisão 3), idempotente pelo `id_cliente`.

**Versões:** `@tus/server@2.4.6` e `@tus/file-store@2.1.1` (as 2.4.7 e 2.1.2 da pesquisa saíram há menos de 2 semanas; a API é a mesma). Confira depois de instalar: `grep -n "onUploadCreate\|onIncomingRequest\|handleWeb" node_modules/@tus/server/dist/*.d.ts`.

**Arquivos:**
- Modificar: `package.json`, `package-lock.json`, `next.config.ts`, `src/modules/midia/dominio.ts` (limites)
- Criar: `src/modules/midia/cookie.ts`, `hash.ts`, `temporarios.ts`, `recepcao.ts`, `tus.ts`, `registro-envio.ts`, `acoes.ts`
- Criar: `src/app/api/midia/[[...slug]]/route.ts`
- Modificar: `docker/nginx/devolucoes.conf`, `docker-compose.prod.yml`, `Dockerfile`
- Testes: `src/modules/midia/cookie.test.ts`, `hash.test.ts`, `recepcao.test.ts`, `recepcao.int.test.ts`, `tus.int.test.ts`

**Interfaces:**
- Consome: `validarSessao`, `criarSessao` (Fase 0); `pode`; `obterFila` (Tarefa 4); `armazenamentoDoProvedor` (Tarefa 6); `registrarEvento`; `criarDevolucaoEmConferencia`, `criarEvidenciaTeste` (Tarefa 9); `criarNaoIdentificada` (Fase 1).
- Produz:
  - em `midia/dominio.ts`: `LIMITE_FOTO_BYTES = 15 MB`, `LIMITE_VIDEO_BYTES = 300 MB`, `TIPOS_FOTO_ACEITOS`, `DURACAO_LINK_SEGUNDOS = 600`
  - `COOKIE_SESSAO`, `lerCookie(cabecalho, nome)`; `sha256DoArquivo(caminho)`, `sha256DoBuffer(b)`; `pastaTus()`, `apagarTemporario(caminho)`
  - em `recepcao.ts`: `class ErroEnvio { status; definitivo }`, `type MetadadosEnvio = { idCliente; devolucaoId; itemId: string | null; tipo: TipoEvidencia; tipoConteudo; nome }`, `lerMetadados(m): MetadadosEnvio | string`, `autorizarEnvio(db, meta, tamanho, usuario)`, `type EvidenciaRecebida`, `registrarRecebida(db: Db, e): Promise<{ evidenciaId: string; repetida: boolean }>`
  - em `tus.ts`: `criarServidorTus({ diretorio, db })`, `servidorTus()`, `armazemTus()`
  - em `registro-envio.ts`: `registrarEnvio(db, armazem: { getUpload(id) }, uploadId, usuario, agora?): Promise<{ evidenciaId: string }>`
  - em `acoes.ts` (`'use server'`): `type ResultadoRegistro = { ok: true; evidenciaId: string } | { ok: false; mensagem: string; definitivo: boolean }`, `registrarEnvioAcao(uploadId: string): Promise<ResultadoRegistro>`
  - rota tus em `/api/midia` (POST, HEAD, PATCH, DELETE, OPTIONS, GET)

- [ ] **Passo 1: Instalar o tus e tirá-lo do empacotamento**

```bash
cd "/c/Users/idmpc/devolucoes-wt/fase-2"
npm install --save-exact @tus/server@2.4.6 @tus/file-store@2.1.1
```

Em `next.config.ts`, troque a linha `serverExternalPackages: ["pg-boss"],` por:

```ts
  serverExternalPackages: ["pg-boss", "@tus/server", "@tus/file-store"],
```

Acrescente no **final** de `src/modules/midia/dominio.ts`:

```ts
/** Limites do envio (decisão 5). O celular já manda a foto em JPEG de ~1600 px; o vídeo vem como foi gravado. */
export const LIMITE_FOTO_BYTES = 15 * 1024 * 1024;
export const LIMITE_VIDEO_BYTES = 300 * 1024 * 1024;
export const TIPOS_FOTO_ACEITOS: readonly string[] = ['image/jpeg', 'image/png', 'image/webp'];

/** Spec §9: o link temporário vale 10 minutos. */
export const DURACAO_LINK_SEGUNDOS = 600;
```

- [ ] **Passo 2: Escrever os testes unitários que falham**

`src/modules/midia/cookie.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { lerCookie } from './cookie';

describe('lerCookie', () => {
  it('acha o cookie pelo nome', () => {
    expect(lerCookie('a=1; sessao=abc-DEF_123; b=2', 'sessao')).toBe('abc-DEF_123');
    expect(lerCookie('sessao=x', 'sessao')).toBe('x');
  });

  it('devolve null quando não existe', () => {
    expect(lerCookie(null, 'sessao')).toBeNull();
    expect(lerCookie('outra=1', 'sessao')).toBeNull();
    expect(lerCookie('minhasessao=1', 'sessao')).toBeNull();
  });
});
```

`src/modules/midia/hash.test.ts`:

```ts
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sha256DoArquivo, sha256DoBuffer } from './hash';

const ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

describe('SHA-256 (spec §9: integridade)', () => {
  it('do buffer e do arquivo lido aos pedaços', async () => {
    expect(sha256DoBuffer(Buffer.from('abc'))).toBe(ABC);
    const pasta = await mkdtemp(join(tmpdir(), 'hash-'));
    try {
      await writeFile(join(pasta, 'a.bin'), 'abc');
      expect(await sha256DoArquivo(join(pasta, 'a.bin'))).toBe(ABC);
    } finally {
      await rm(pasta, { recursive: true, force: true });
    }
  });
});
```

`src/modules/midia/recepcao.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { lerMetadados } from './recepcao';

const ID = '11111111-1111-4111-8111-111111111111';
const DEV = '22222222-2222-4222-8222-222222222222';

describe('lerMetadados (o que o celular manda no Upload-Metadata)', () => {
  it('lê os campos e transforma itemId vazio em null', () => {
    expect(lerMetadados({ idCliente: ID, devolucaoId: DEV, tipo: 'FOTO_1_ETIQUETA', tipoConteudo: 'IMAGE/JPEG', nome: 'foto-1.jpg' })).toEqual({
      idCliente: ID,
      devolucaoId: DEV,
      itemId: null,
      tipo: 'FOTO_1_ETIQUETA',
      tipoConteudo: 'image/jpeg',
      nome: 'foto-1.jpg',
    });
  });

  it('explica o que está errado', () => {
    expect(lerMetadados(undefined)).toBe('Envio sem identificação.');
    expect(lerMetadados({ idCliente: ID, devolucaoId: 'x', tipo: 'FOTO_1_ETIQUETA', tipoConteudo: 'image/jpeg' })).toBe('Devolução inválida.');
    expect(lerMetadados({ idCliente: ID, devolucaoId: DEV, tipo: 'FOTO_9', tipoConteudo: 'image/jpeg' })).toBe('Tipo de evidência inválido.');
    expect(lerMetadados({ idCliente: ID, devolucaoId: DEV, itemId: 'x', tipo: 'FOTO_3_PRODUTO', tipoConteudo: 'image/jpeg' })).toBe('Unidade inválida.');
    expect(lerMetadados({ idCliente: ID, devolucaoId: DEV, tipo: 'VIDEO_PROVA', tipoConteudo: '' })).toBe('Tipo do arquivo não informado.');
  });
});
```

Rode: `npm test -- src/modules/midia`
Esperado: FAIL (`cookie`, `hash` e `recepcao` não existem).

- [ ] **Passo 3: Implementar cookie, hash, temporários e as regras da recepção**

`src/modules/midia/cookie.ts`:

```ts
/** O mesmo nome de COOKIE_SESSAO em @/modules/auth/servidor (aquele arquivo só roda dentro do Next, por causa do next/headers). */
export const COOKIE_SESSAO = 'sessao';

export function lerCookie(cabecalho: string | null, nome: string): string | null {
  if (!cabecalho) return null;
  for (const parte of cabecalho.split(';')) {
    const i = parte.indexOf('=');
    if (i > 0 && parte.slice(0, i).trim() === nome) return parte.slice(i + 1).trim();
  }
  return null;
}
```

`src/modules/midia/hash.ts`:

```ts
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

/** Lê o arquivo aos pedaços (vídeo de 300 MB com memória constante). */
export async function sha256DoArquivo(caminho: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const parte of createReadStream(caminho)) hash.update(parte as Buffer);
  return hash.digest('hex');
}

export function sha256DoBuffer(conteudo: Buffer): string {
  return createHash('sha256').update(conteudo).digest('hex');
}
```

`src/modules/midia/temporarios.ts`:

```ts
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { lerEnv } from '@/lib/env';

/** Onde o tus grava os uploads em andamento (fora da interface de armazenamento, contrato §5.2). */
export function pastaTus(): string {
  return resolve(lerEnv().MIDIA_TMP_DIR, 'tus');
}

/** Apaga o arquivo do upload e o .json que o tus grava ao lado. Não reclama se já não existe. */
export async function apagarTemporario(caminho: string): Promise<void> {
  await rm(caminho, { force: true });
  await rm(`${caminho}.json`, { force: true });
}
```

`src/modules/midia/recepcao.ts`:

```ts
import { and, eq, isNull } from 'drizzle-orm';
import type { Db, DbOuTx } from '@/db/client';
import { ehViolacaoDeUnicidade } from '@/db/erros';
import { devolucoes, evidencias, itensDevolucao } from '@/db/schema';
import { ehUuid } from '@/lib/uuid';
import { pode } from '@/modules/auth/permissoes';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { obterFila } from '@/modules/fila/fila';
import { registrarEvento } from '@/modules/historico/eventos';
import { armazenamentoDoProvedor } from './armazenamento';
import {
  EVIDENCIAS_DO_ITEM,
  LIMITE_FOTO_BYTES,
  LIMITE_VIDEO_BYTES,
  TIPOS_FOTO_ACEITOS,
  ehFoto,
  ehTipoEvidencia,
  type TipoEvidencia,
} from './dominio';
import { apagarTemporario } from './temporarios';

/** Recusa do envio: `status` vira a resposta HTTP do tus; `definitivo` diz ao celular se adianta tentar de novo. */
export class ErroEnvio extends Error {
  readonly status: number;
  readonly definitivo: boolean;

  constructor(status: number, mensagem: string, definitivo = true) {
    super(mensagem);
    this.name = 'ErroEnvio';
    this.status = status;
    this.definitivo = definitivo;
  }
}

export type MetadadosEnvio = {
  idCliente: string;
  devolucaoId: string;
  itemId: string | null;
  tipo: TipoEvidencia;
  tipoConteudo: string;
  nome: string;
};

export function lerMetadados(m: Record<string, string | null> | undefined): MetadadosEnvio | string {
  if (!m) return 'Envio sem identificação.';
  const v = (chave: string) => (m[chave] ?? '').trim();
  const idCliente = v('idCliente');
  const devolucaoId = v('devolucaoId');
  const itemId = v('itemId');
  const tipo = v('tipo');
  const tipoConteudo = v('tipoConteudo').toLowerCase();
  if (!ehUuid(idCliente)) return 'Envio sem identificação.';
  if (!ehUuid(devolucaoId)) return 'Devolução inválida.';
  if (itemId && !ehUuid(itemId)) return 'Unidade inválida.';
  if (!ehTipoEvidencia(tipo)) return 'Tipo de evidência inválido.';
  if (!tipoConteudo) return 'Tipo do arquivo não informado.';
  return { idCliente, devolucaoId, itemId: itemId || null, tipo, tipoConteudo, nome: v('nome').slice(0, 120) || 'arquivo' };
}

/**
 * Quem pode mandar o quê (conferido ao criar o upload e de novo ao registrar):
 * - na conferência, só quem está com a trava (qualquer evidência);
 * - no Recebimento, Fotos 1 e 2 do pacote não identificado (spec §6.2), por quem opera devoluções.
 */
export async function autorizarEnvio(db: DbOuTx, meta: MetadadosEnvio, tamanho: number | undefined, usuario: UsuarioSessao): Promise<void> {
  if (!pode(usuario.perfil, 'operar_devolucoes')) throw new ErroEnvio(403, 'Seu perfil não envia evidências.');
  const foto = ehFoto(meta.tipo);
  if (foto && !TIPOS_FOTO_ACEITOS.includes(meta.tipoConteudo)) {
    throw new ErroEnvio(415, 'A foto precisa ser JPEG, PNG ou WebP. Tire a foto de novo pela câmera.');
  }
  if (!foto && !meta.tipoConteudo.startsWith('video/')) throw new ErroEnvio(415, 'O Vídeo de Prova precisa ser um arquivo de vídeo.');
  if (tamanho === undefined) throw new ErroEnvio(400, 'Tamanho do arquivo não informado.');
  if (tamanho <= 0 || tamanho > (foto ? LIMITE_FOTO_BYTES : LIMITE_VIDEO_BYTES)) {
    throw new ErroEnvio(413, foto ? 'Foto grande demais (máximo 15 MB).' : 'Vídeo grande demais (máximo 300 MB). Grave em 1080p, com até 2 minutos.');
  }
  const daUnidade = (EVIDENCIAS_DO_ITEM as readonly string[]).includes(meta.tipo);
  if (daUnidade && !meta.itemId) throw new ErroEnvio(400, 'Fotos 3 e 4 são de uma unidade: falta dizer qual.');
  if (!daUnidade && meta.tipo !== 'EXTRA' && meta.itemId) throw new ErroEnvio(400, 'Fotos 1 e 2 e o Vídeo de Prova são do pacote, não de uma unidade.');

  const [d] = await db
    .select({ status: devolucoes.status, conferenteId: devolucoes.conferenteId, naoIdentificada: devolucoes.naoIdentificada })
    .from(devolucoes)
    .where(eq(devolucoes.id, meta.devolucaoId));
  if (!d) throw new ErroEnvio(404, 'Devolução não encontrada.');
  const naConferencia = d.status === 'EM_CONFERENCIA' && d.conferenteId === usuario.id;
  const noRecebimento =
    d.status === 'AGUARDANDO_CONFERENCIA' && d.naoIdentificada && (meta.tipo === 'FOTO_1_ETIQUETA' || meta.tipo === 'FOTO_2_EMBALAGEM');
  if (!naConferencia && !noRecebimento) throw new ErroEnvio(409, 'A conferência desta devolução não está aberta por você.');
  if (meta.itemId) {
    const [item] = await db
      .select({ id: itensDevolucao.id })
      .from(itensDevolucao)
      .where(and(eq(itensDevolucao.id, meta.itemId), eq(itensDevolucao.devolucaoId, meta.devolucaoId)));
    if (!item) throw new ErroEnvio(400, 'A unidade não é desta devolução.');
  }
}

export type EvidenciaRecebida = {
  meta: MetadadosEnvio;
  /** Caminho absoluto do arquivo do tus (decisão 4). */
  caminhoTemporario: string;
  tamanho: number;
  sha256: string;
  usuario: UsuarioSessao;
  agora?: Date;
};

/**
 * Grava a evidência e enfileira o processamento, numa transação. Idempotente pelo id_cliente: o mesmo envio repetido
 * devolve a evidência que já existe (`repetida`). Refazer (contrato D6): a anterior da mesma vaga é apagada (linha e
 * arquivo), e o evento evidencia_refeita guarda os hashes das duas.
 */
export async function registrarRecebida(db: Db, e: EvidenciaRecebida): Promise<{ evidenciaId: string; repetida: boolean }> {
  const agora = e.agora ?? new Date();
  const [jaExiste] = await db.select({ id: evidencias.id }).from(evidencias).where(eq(evidencias.idCliente, e.meta.idCliente));
  if (jaExiste) return { evidenciaId: jaExiste.id, repetida: true };

  const apagarDepois: { caminho: string | null; provedor: string | null; temporario: string | null }[] = [];
  let resultado: { evidenciaId: string; repetida: boolean };
  try {
    resultado = await db.transaction(async (tx) => {
      // Trava a devolução: dois envios da mesma vaga ao mesmo tempo esperam um pelo outro.
      await tx.select({ id: devolucoes.id }).from(devolucoes).where(eq(devolucoes.id, e.meta.devolucaoId)).for('update');
      await autorizarEnvio(tx, e.meta, e.tamanho, e.usuario);
      const [anterior] =
        e.meta.tipo === 'EXTRA'
          ? []
          : await tx
              .select()
              .from(evidencias)
              .where(
                and(
                  eq(evidencias.devolucaoId, e.meta.devolucaoId),
                  eq(evidencias.tipo, e.meta.tipo),
                  e.meta.itemId ? eq(evidencias.itemId, e.meta.itemId) : isNull(evidencias.itemId),
                ),
              );
      if (anterior) {
        await tx.delete(evidencias).where(eq(evidencias.id, anterior.id));
        apagarDepois.push({ caminho: anterior.caminho, provedor: anterior.provedor, temporario: anterior.caminhoTemporario });
      }
      const [nova] = await tx
        .insert(evidencias)
        .values({
          devolucaoId: e.meta.devolucaoId,
          itemId: e.meta.itemId,
          tipo: e.meta.tipo,
          tipoConteudo: e.meta.tipoConteudo,
          caminhoTemporario: e.caminhoTemporario,
          tamanhoOriginal: e.tamanho,
          sha256Original: e.sha256,
          idCliente: e.meta.idCliente,
          enviadoPor: e.usuario.id,
          enviadoEm: agora,
        })
        .returning({ id: evidencias.id });
      const dados = { evidenciaId: nova.id, tipo: e.meta.tipo, itemId: e.meta.itemId, sha256_original: e.sha256 };
      await registrarEvento(tx, {
        entidade: 'devolucao',
        entidadeId: e.meta.devolucaoId,
        acao: anterior ? 'evidencia_refeita' : 'evidencia_enviada',
        usuarioId: e.usuario.id,
        em: agora,
        dados: anterior
          ? { ...dados, evidenciaAnteriorId: anterior.id, sha256_original_anterior: anterior.sha256Original, sha256_final_anterior: anterior.sha256Final }
          : dados,
      });
      await obterFila().enviar(ehFoto(e.meta.tipo) ? 'midia.processar-foto' : 'midia.transcodificar', { evidenciaId: nova.id }, { tx, chaveUnica: nova.id });
      return { evidenciaId: nova.id, repetida: false };
    });
  } catch (erro) {
    // Dois pedidos de registro do mesmo envio ao mesmo tempo: o segundo encontra o primeiro.
    if (ehViolacaoDeUnicidade(erro)) {
      const [r] = await db.select({ id: evidencias.id }).from(evidencias).where(eq(evidencias.idCliente, e.meta.idCliente));
      if (r) return { evidenciaId: r.id, repetida: true };
    }
    throw erro;
  }
  for (const a of apagarDepois) {
    if (a.caminho && a.provedor) await armazenamentoDoProvedor(a.provedor).apagar(a.caminho).catch(() => undefined);
    if (a.temporario) await apagarTemporario(a.temporario);
  }
  return resultado;
}
```

Rode: `npm test -- src/modules/midia`
Esperado: PASS.

- [ ] **Passo 4: Escrever os testes de integração que falham**

`src/modules/midia/recepcao.int.test.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eventosHistorico, evidencias } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { criarNaoIdentificada } from '@/modules/devolucoes/recebimento';
import { definirFilaParaTestes, FilaMemoria } from '@/modules/fila/fila';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { criarDevolucaoEmConferencia, criarEvidenciaTeste } from '../../../tests/helpers/fabricas-conferencia';
import { obterArmazenamento } from './armazenamento';
import type { ArmazenamentoMemoria } from './armazenamento-memoria';
import { autorizarEnvio, registrarRecebida, type MetadadosEnvio } from './recepcao';

const { db, sql } = criarDbTeste();
let operador: UsuarioSessao;
let fila: FilaMemoria;

beforeEach(async () => {
  await limparTabelas(sql);
  fila = new FilaMemoria();
  definirFilaParaTestes(fila);
  operador = await criarUsuarioTeste(db, 'OPERADOR');
});
afterAll(async () => {
  await sql.end();
});

function meta(devolucaoId: string, extra: Partial<MetadadosEnvio> = {}): MetadadosEnvio {
  return { idCliente: randomUUID(), devolucaoId, itemId: null, tipo: 'FOTO_1_ETIQUETA', tipoConteudo: 'image/jpeg', nome: 'foto.jpg', ...extra };
}

describe('autorizarEnvio', () => {
  it('quem está conferindo manda qualquer evidência; Fotos 3 e 4 precisam da unidade desta devolução', async () => {
    const d = await criarDevolucaoEmConferencia(db, operador);
    const outra = await criarDevolucaoEmConferencia(db, operador);
    await expect(autorizarEnvio(db, meta(d.id), 1000, operador)).resolves.toBeUndefined();
    await expect(autorizarEnvio(db, meta(d.id, { tipo: 'VIDEO_PROVA', tipoConteudo: 'video/quicktime' }), 50_000_000, operador)).resolves.toBeUndefined();
    await expect(autorizarEnvio(db, meta(d.id, { tipo: 'FOTO_3_PRODUTO', itemId: d.itens[0] }), 1000, operador)).resolves.toBeUndefined();
    await expect(autorizarEnvio(db, meta(d.id, { tipo: 'FOTO_3_PRODUTO' }), 1000, operador)).rejects.toMatchObject({ status: 400 });
    await expect(autorizarEnvio(db, meta(d.id, { tipo: 'FOTO_4_CODIGO_SERIAL', itemId: outra.itens[0] }), 1000, operador)).rejects.toMatchObject({
      status: 400,
      message: 'A unidade não é desta devolução.',
    });
  });

  it('recusa tamanho, tipo de arquivo, perfil e quem não está com a trava', async () => {
    const d = await criarDevolucaoEmConferencia(db, operador);
    await expect(autorizarEnvio(db, meta(d.id), 16 * 1024 * 1024, operador)).rejects.toMatchObject({ status: 413 });
    await expect(autorizarEnvio(db, meta(d.id, { tipoConteudo: 'image/heic' }), 1000, operador)).rejects.toMatchObject({ status: 415 });
    await expect(autorizarEnvio(db, meta(d.id), undefined, operador)).rejects.toMatchObject({ status: 400 });
    const fiscal = await criarUsuarioTeste(db, 'FISCAL');
    await expect(autorizarEnvio(db, meta(d.id), 1000, fiscal)).rejects.toMatchObject({ status: 403 });
    const outro = await criarUsuarioTeste(db, 'OPERADOR');
    await expect(autorizarEnvio(db, meta(d.id), 1000, outro)).rejects.toMatchObject({ status: 409 });
  });

  it('no Recebimento: Fotos 1 e 2 do pacote não identificado (spec §6.2), e só elas', async () => {
    const ni = await criarNaoIdentificada(db, 'BRNI0002', operador);
    const outro = await criarUsuarioTeste(db, 'OPERADOR');
    await expect(autorizarEnvio(db, meta(ni.id, { tipo: 'FOTO_2_EMBALAGEM' }), 1000, outro)).resolves.toBeUndefined();
    await expect(autorizarEnvio(db, meta(ni.id, { tipo: 'VIDEO_PROVA', tipoConteudo: 'video/mp4' }), 1000, outro)).rejects.toMatchObject({ status: 409 });
  });
});

describe('registrarRecebida', () => {
  it('grava a evidência RECEBIDA, o evento e a tarefa de processamento na mesma transação', async () => {
    const d = await criarDevolucaoEmConferencia(db, operador);
    const m = meta(d.id);
    const r = await registrarRecebida(db, { meta: m, caminhoTemporario: '/tmp/tus/a', tamanho: 1234, sha256: 'b'.repeat(64), usuario: operador });
    expect(r.repetida).toBe(false);
    const [e] = await db.select().from(evidencias).where(eq(evidencias.id, r.evidenciaId));
    expect(e).toMatchObject({
      tipo: 'FOTO_1_ETIQUETA',
      situacaoProcessamento: 'RECEBIDA',
      caminhoTemporario: '/tmp/tus/a',
      tamanhoOriginal: 1234,
      sha256Original: 'b'.repeat(64),
      idCliente: m.idCliente,
      enviadoPor: operador.id,
    });
    expect(fila.enviadas).toEqual([
      { nome: 'midia.processar-foto', dados: { evidenciaId: r.evidenciaId }, opcoes: { tx: expect.anything(), chaveUnica: r.evidenciaId } },
    ]);
    const [evento] = await db.select({ dados: eventosHistorico.dados }).from(eventosHistorico).where(eq(eventosHistorico.acao, 'evidencia_enviada'));
    expect(evento.dados).toEqual({ evidenciaId: r.evidenciaId, tipo: 'FOTO_1_ETIQUETA', itemId: null, sha256_original: 'b'.repeat(64) });
  });

  it('o mesmo envio de novo devolve a mesma evidência, sem gravar outra', async () => {
    const d = await criarDevolucaoEmConferencia(db, operador);
    const m = meta(d.id);
    const base = { meta: m, caminhoTemporario: '/tmp/tus/b', tamanho: 10, sha256: 'c'.repeat(64), usuario: operador };
    const primeira = await registrarRecebida(db, base);
    expect(await registrarRecebida(db, base)).toEqual({ evidenciaId: primeira.evidenciaId, repetida: true });
    expect(fila.enviadas).toHaveLength(1);
  });

  it('refazer a Foto 1 apaga a anterior (linha e arquivo) e guarda os dois hashes (contrato D6)', async () => {
    const d = await criarDevolucaoEmConferencia(db, operador);
    const armazenamento = obterArmazenamento() as ArmazenamentoMemoria;
    await armazenamento.salvar('evidencias/antiga.jpg', Readable.from([Buffer.from('x')]));
    const antiga = await criarEvidenciaTeste(db, {
      devolucaoId: d.id,
      tipo: 'FOTO_1_ETIQUETA',
      situacao: 'PRONTA',
      caminho: 'evidencias/antiga.jpg',
      provedor: 'memoria',
      sha256Original: 'd'.repeat(64),
    });
    const r = await registrarRecebida(db, { meta: meta(d.id), caminhoTemporario: '/tmp/tus/c', tamanho: 10, sha256: 'e'.repeat(64), usuario: operador });
    expect(await db.select({ id: evidencias.id }).from(evidencias).where(eq(evidencias.devolucaoId, d.id))).toEqual([{ id: r.evidenciaId }]);
    expect(armazenamento.arquivos.has('evidencias/antiga.jpg')).toBe(false);
    const [evento] = await db.select({ dados: eventosHistorico.dados }).from(eventosHistorico).where(eq(eventosHistorico.acao, 'evidencia_refeita'));
    expect(evento.dados).toMatchObject({ evidenciaAnteriorId: antiga, sha256_original_anterior: 'd'.repeat(64), sha256_original: 'e'.repeat(64) });
  });

  it('o Vídeo de Prova vai para a transcodificação', async () => {
    const d = await criarDevolucaoEmConferencia(db, operador);
    const r = await registrarRecebida(db, {
      meta: meta(d.id, { tipo: 'VIDEO_PROVA', tipoConteudo: 'video/mp4' }),
      caminhoTemporario: '/tmp/tus/v',
      tamanho: 10,
      sha256: 'f'.repeat(64),
      usuario: operador,
    });
    expect(fila.enviadas[0]).toMatchObject({ nome: 'midia.transcodificar', dados: { evidenciaId: r.evidenciaId } });
  });
});
```

`src/modules/midia/tus.int.test.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { evidencias } from '@/db/schema';
import { criarSessao } from '@/modules/auth/sessoes';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { criarDevolucaoEmConferencia } from '../../../tests/helpers/fabricas-conferencia';
import { sha256DoBuffer } from './hash';
import { registrarEnvio } from './registro-envio';
import { criarServidorTus } from './tus';

const { db, sql } = criarDbTeste();
let pasta: string;
let tus: ReturnType<typeof criarServidorTus>;
let operador: UsuarioSessao;
let cookie: string;

beforeEach(async () => {
  await limparTabelas(sql);
  pasta = await mkdtemp(join(tmpdir(), 'tus-'));
  tus = criarServidorTus({ diretorio: pasta, db: () => db });
  operador = await criarUsuarioTeste(db, 'OPERADOR');
  cookie = `sessao=${(await criarSessao(db, operador.id)).token}`;
});
afterEach(async () => {
  await rm(pasta, { recursive: true, force: true });
});
afterAll(async () => {
  await sql.end();
});

function metadados(campos: Record<string, string>): string {
  return Object.entries(campos)
    .map(([k, v]) => `${k} ${Buffer.from(v).toString('base64')}`)
    .join(',');
}

/** Cria o upload e manda o arquivo inteiro num PATCH; devolve o id do upload. */
async function enviar(conteudo: Buffer, campos: Record<string, string>, comCookie = cookie): Promise<{ status: number; id: string | null }> {
  const criar = await tus.servidor.handleWeb(
    new Request('http://localhost/api/midia', {
      method: 'POST',
      headers: { 'tus-resumable': '1.0.0', 'upload-length': String(conteudo.length), 'upload-metadata': metadados(campos), cookie: comCookie },
    }),
  );
  if (criar.status !== 201) return { status: criar.status, id: null };
  const local = criar.headers.get('location')!;
  const patch = await tus.servidor.handleWeb(
    new Request(`http://localhost${local}`, {
      method: 'PATCH',
      headers: { 'tus-resumable': '1.0.0', 'upload-offset': '0', 'content-type': 'application/offset+octet-stream', cookie: comCookie },
      body: new Uint8Array(conteudo),
    }),
  );
  return { status: patch.status, id: local.split('/').pop()! };
}

describe('upload pelo tus (route handler /api/midia)', () => {
  it('recebe a foto, guarda o usuário no envio e o registro grava a evidência com o SHA-256', async () => {
    const d = await criarDevolucaoEmConferencia(db, operador);
    const conteudo = Buffer.from('jpeg-de-mentira');
    const idCliente = randomUUID();
    const r = await enviar(conteudo, { idCliente, devolucaoId: d.id, tipo: 'FOTO_1_ETIQUETA', tipoConteudo: 'image/jpeg', nome: 'foto-1.jpg' });
    expect(r.status).toBe(204);
    expect((await tus.armazem.getUpload(r.id!)).metadata?.usuarioId).toBe(operador.id);

    const { evidenciaId } = await registrarEnvio(db, tus.armazem, r.id!, operador);
    const [e] = await db.select().from(evidencias).where(eq(evidencias.id, evidenciaId));
    expect(e).toMatchObject({ idCliente, sha256Original: sha256DoBuffer(conteudo), tamanhoOriginal: conteudo.length, caminhoTemporario: join(pasta, r.id!) });
  });

  it('o mesmo envio mandado duas vezes vira uma evidência só, e o arquivo repetido é apagado', async () => {
    const d = await criarDevolucaoEmConferencia(db, operador);
    const campos = { idCliente: randomUUID(), devolucaoId: d.id, tipo: 'FOTO_2_EMBALAGEM', tipoConteudo: 'image/jpeg' };
    const a = await enviar(Buffer.from('a'), campos);
    const b = await enviar(Buffer.from('a'), campos);
    const primeira = await registrarEnvio(db, tus.armazem, a.id!, operador);
    expect(await registrarEnvio(db, tus.armazem, b.id!, operador)).toEqual(primeira);
    expect(existsSync(join(pasta, b.id!))).toBe(false);
  });

  it('sem sessão: 401; perfil sem permissão: 403; conferência de outra pessoa: 409', async () => {
    const d = await criarDevolucaoEmConferencia(db, operador);
    const campos = { idCliente: randomUUID(), devolucaoId: d.id, tipo: 'FOTO_1_ETIQUETA', tipoConteudo: 'image/jpeg' };
    expect((await enviar(Buffer.from('x'), campos, '')).status).toBe(401);
    const fiscal = await criarUsuarioTeste(db, 'FISCAL');
    expect((await enviar(Buffer.from('x'), campos, `sessao=${(await criarSessao(db, fiscal.id)).token}`)).status).toBe(403);
    const outro = await criarUsuarioTeste(db, 'OPERADOR');
    expect((await enviar(Buffer.from('x'), campos, `sessao=${(await criarSessao(db, outro.id)).token}`)).status).toBe(409);
  });

  it('outra pessoa não continua nem registra o envio de alguém', async () => {
    const d = await criarDevolucaoEmConferencia(db, operador);
    const r = await enviar(Buffer.from('x'), { idCliente: randomUUID(), devolucaoId: d.id, tipo: 'FOTO_1_ETIQUETA', tipoConteudo: 'image/jpeg' });
    const outro = await criarUsuarioTeste(db, 'OPERADOR');
    const cabeca = await tus.servidor.handleWeb(
      new Request(`http://localhost/api/midia/${r.id}`, {
        method: 'HEAD',
        headers: { 'tus-resumable': '1.0.0', cookie: `sessao=${(await criarSessao(db, outro.id)).token}` },
      }),
    );
    expect(cabeca.status).toBe(403);
    await expect(registrarEnvio(db, tus.armazem, r.id!, outro)).rejects.toMatchObject({ status: 403 });
  });
});
```

Rode: `npm run test:int -- src/modules/midia`
Esperado: `recepcao.int` PASS (as regras já existem); `tus.int` FAIL (`./tus` e `./registro-envio` não existem).

- [ ] **Passo 5: Servidor tus, registro do envio, Server Action e rota**

`src/modules/midia/tus.ts`:

```ts
import { FileStore } from '@tus/file-store';
import { Server } from '@tus/server';
import { obterDb } from '@/db';
import type { Db } from '@/db/client';
import { pode } from '@/modules/auth/permissoes';
import { validarSessao } from '@/modules/auth/sessoes';
import { COOKIE_SESSAO, lerCookie } from './cookie';
import { LIMITE_VIDEO_BYTES } from './dominio';
import { autorizarEnvio, ErroEnvio, lerMetadados } from './recepcao';
import { pastaTus } from './temporarios';

type Recusa = { status_code: number; body: string };
const recusa = (status: number, mensagem: string): Recusa => ({ status_code: status, body: mensagem });

/**
 * Servidor tus (pesquisa §3.2). Recebe só os bytes; o registro da evidência é o passo seguinte (registrarEnvio).
 * - toda requisição exige sessão e o perfil que opera devoluções;
 * - continuar ou consultar um upload só pode quem o criou (o usuário fica gravado nos metadados);
 * - ao criar, as regras da recepção são conferidas antes de aceitar o primeiro byte.
 */
export function criarServidorTus(p: { diretorio: string; db: () => Db }): { servidor: Server; armazem: FileStore } {
  const armazem = new FileStore({ directory: p.diretorio });
  const usuarioDe = async (req: Request) => {
    const token = lerCookie(req.headers.get('cookie'), COOKIE_SESSAO);
    return token ? validarSessao(p.db(), token) : null;
  };
  const servidor = new Server({
    path: '/api/midia',
    datastore: armazem,
    relativeLocation: true,
    maxSize: LIMITE_VIDEO_BYTES,
    disableTerminationForFinishedUploads: true,
    async onIncomingRequest(req, uploadId) {
      if (req.method === 'OPTIONS') return;
      const usuario = await usuarioDe(req);
      if (!usuario) throw recusa(401, 'Sua sessão terminou. Entre no sistema de novo.');
      if (!pode(usuario.perfil, 'operar_devolucoes')) throw recusa(403, 'Seu perfil não envia evidências.');
      if (req.method !== 'POST' && uploadId) {
        const upload = await armazem.getUpload(uploadId).catch(() => null);
        if (upload && upload.metadata?.usuarioId !== usuario.id) throw recusa(403, 'Este envio é de outra pessoa.');
      }
    },
    async onUploadCreate(req, upload) {
      const usuario = await usuarioDe(req);
      if (!usuario) throw recusa(401, 'Sua sessão terminou. Entre no sistema de novo.');
      const meta = lerMetadados(upload.metadata);
      if (typeof meta === 'string') throw recusa(400, meta);
      try {
        await autorizarEnvio(p.db(), meta, upload.size, usuario);
      } catch (erro) {
        if (erro instanceof ErroEnvio) throw recusa(erro.status, erro.message);
        throw erro;
      }
      return { metadata: { ...upload.metadata, usuarioId: usuario.id } };
    },
  });
  return { servidor, armazem };
}

// No globalThis para o recarregamento do `next dev` não criar outro servidor (o tus trava uploads em memória).
const globalComTus = globalThis as unknown as { __tus?: ReturnType<typeof criarServidorTus> };

function instancia() {
  globalComTus.__tus ??= criarServidorTus({ diretorio: pastaTus(), db: obterDb });
  return globalComTus.__tus;
}

export function servidorTus(): Server {
  return instancia().servidor;
}

export function armazemTus(): FileStore {
  return instancia().armazem;
}
```

`src/modules/midia/registro-envio.ts`:

```ts
import type { Db } from '@/db/client';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { sha256DoArquivo } from './hash';
import { ErroEnvio, lerMetadados, registrarRecebida } from './recepcao';
import { apagarTemporario } from './temporarios';

type UploadTus = { size?: number; offset: number; metadata?: Record<string, string | null>; storage?: { path: string } };

/**
 * Depois que o tus termina, o celular pede o registro (decisão 3). Confere tudo de novo, calcula o SHA-256 do arquivo
 * no disco (spec §9) e grava a evidência. Repetir o pedido é seguro (idempotente pelo id_cliente).
 */
export async function registrarEnvio(
  db: Db,
  armazem: { getUpload(id: string): Promise<UploadTus> },
  uploadId: string,
  usuario: UsuarioSessao,
  agora: Date = new Date(),
): Promise<{ evidenciaId: string }> {
  if (!/^[0-9a-f]{32}$/.test(uploadId)) throw new ErroEnvio(400, 'Envio inválido.');
  const upload = await armazem.getUpload(uploadId).catch(() => null);
  if (!upload?.storage?.path) throw new ErroEnvio(404, 'O arquivo não chegou ao servidor. Envie de novo.');
  if (upload.metadata?.usuarioId !== usuario.id) throw new ErroEnvio(403, 'Este envio é de outra pessoa.');
  // Ainda faltam bytes: não é definitivo, o celular continua o upload e pede de novo.
  if (upload.size === undefined || upload.offset !== upload.size) throw new ErroEnvio(409, 'O envio ainda não terminou.', false);
  const meta = lerMetadados(upload.metadata);
  if (typeof meta === 'string') throw new ErroEnvio(400, meta);
  const sha256 = await sha256DoArquivo(upload.storage.path);
  const r = await registrarRecebida(db, { meta, caminhoTemporario: upload.storage.path, tamanho: upload.size, sha256, usuario, agora });
  if (r.repetida) await apagarTemporario(upload.storage.path);
  return { evidenciaId: r.evidenciaId };
}
```

`src/modules/midia/acoes.ts`:

```ts
'use server';

import { obterDb } from '@/db';
import { exigirPermissao } from '@/modules/auth/servidor';
import { ErroEnvio } from './recepcao';
import { registrarEnvio } from './registro-envio';
import { armazemTus } from './tus';

export type ResultadoRegistro = { ok: true; evidenciaId: string } | { ok: false; mensagem: string; definitivo: boolean };

/** Chamada pela fila do celular quando o tus termina. Só o pedido pequeno passa por Server Action, nunca o arquivo. */
export async function registrarEnvioAcao(uploadId: string): Promise<ResultadoRegistro> {
  const usuario = await exigirPermissao('operar_devolucoes');
  try {
    const r = await registrarEnvio(obterDb(), armazemTus(), String(uploadId), usuario);
    return { ok: true, evidenciaId: r.evidenciaId };
  } catch (erro) {
    if (erro instanceof ErroEnvio) return { ok: false, mensagem: erro.message, definitivo: erro.definitivo };
    throw erro;
  }
}
```

`src/app/api/midia/[[...slug]]/route.ts`:

```ts
import { servidorTus } from '@/modules/midia/tus';

export const dynamic = 'force-dynamic';

/** Upload que retoma (tus, spec §9). HEAD informa até onde chegou; PATCH manda os pedaços de 5 MB. */
async function tratar(req: Request): Promise<Response> {
  return servidorTus().handleWeb(req);
}

export const GET = tratar;
export const HEAD = tratar;
export const POST = tratar;
export const PATCH = tratar;
export const DELETE = tratar;
export const OPTIONS = tratar;
```

Rode: `npm run test:int -- src/modules/midia && npm run typecheck && npm run lint`
Esperado: PASS. Depois rode `npm run build` uma vez: se o Next reclamar de empacotar o `@tus/server` mesmo com o `serverExternalPackages`, anote o erro no commit e confira `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/serverExternalPackages.md`.

- [ ] **Passo 6: nginx, volume `/data` e pastas na imagem**

Em `docker/nginx/devolucoes.conf`, logo **antes** de `location / {`, acrescente (pesquisa §3.4; o `client_max_body_size` vale por pedido, e cada PATCH tem no máximo 5 MB):

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

Em `docker-compose.prod.yml`:
1. No serviço `web`, logo depois de `env_file: .env.producao`, acrescente:

```yaml
    # Mídia: o web recebe os uploads (tus) e o worker processa. Os dois enxergam o mesmo /data.
    volumes:
      - midia:/data
```

2. No serviço `worker`, logo depois de `env_file: .env.producao`, acrescente o mesmo bloco `volumes: - midia:/data`.
3. No bloco `volumes:` do final do arquivo, acrescente a linha `  midia:` depois de `  pgdata:`.

No `Dockerfile`, no estágio `runner`:
1. Troque a linha `ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0` por:

```dockerfile
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 MIDIA_DIR=/data/midia MIDIA_TMP_DIR=/data/tmp
```

2. Troque a linha `RUN groupadd --system app && useradd --system --gid app app` por (o volume novo herda as pastas e o dono na primeira subida):

```dockerfile
RUN groupadd --system app && useradd --system --gid app app && mkdir -p /data/midia /data/tmp && chown -R app:app /data
```

- [ ] **Passo 7: Verificar e commitar**

```bash
cd "/c/Users/idmpc/devolucoes-wt/fase-2"
npm test && npm run test:int && npm run typecheck && npm run lint && npm run build
git add package.json package-lock.json next.config.ts src/modules/midia "src/app/api/midia" docker Dockerfile docker-compose.prod.yml
git commit -m "feat: recepção das evidências por tus (sessão, trava e limites), registro idempotente com SHA-256 e nginx/volume da mídia" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 13: Worker: fotos (carimbo com sharp)

**Por que assim:** o `sharp` 0.35.5 já está no `node_modules` (dependência do Next); agora vira dependência direta. `autoOrient()` aplica a orientação do EXIF, `resize({ fit: 'inside', withoutEnlargement: true })` limita a 1600 px e o carimbo é um SVG com `composite` (pesquisa §8; nomes conferidos em `node_modules/sharp/lib/index.d.ts`). A saída JPEG sai sem EXIF. Na imagem Docker precisa da fonte `fonts-dejavu-core` (sem ela o texto some) e do `sharp` com `@img/*`, `detect-libc` e `semver` copiados (o worker é empacotado com `--external:sharp`).

**Arquivos:**
- Modificar: `package.json`, `package-lock.json`, `Dockerfile`
- Criar: `src/modules/midia/carimbo.ts`, `src/modules/midia/processamento.ts`
- Modificar (substituir o conteúdo): `src/worker/manipuladores/midia.ts`
- Testes: `src/modules/midia/carimbo.test.ts`, `src/modules/midia/processamento.int.test.ts`

**Interfaces:**
- Consome: `obterArmazenamento`, `provedorAtual`, `chaveEvidencia` (Tarefa 6); `sha256DoBuffer`, `apagarTemporario` (Tarefa 12); `CONFIG_TAREFAS` (Tarefa 4); `formatarDataHora` (Fase 1); `Manipuladores` (Tarefa 5).
- Produz:
  - em `carimbo.ts`: `LADO_MAIOR = 1600`, `textoCarimbo({ quando, codigo, usuario }): string`, `escaparXml(t)`, `svgCarimbo(largura, altura, texto)`, `carimbarFoto(entrada: Buffer, p): Promise<{ conteudo: Buffer; largura: number; altura: number }>`
  - em `processamento.ts`: `type ContextoProcessamento = { tentativa: number; agora: Date }`, `processarFoto(db: Db, evidenciaId, ctx): Promise<void>` (e, internos e reaproveitados pela Tarefa 14: `comecar`, `concluirProcessamento`, `registrarErro`)
  - `manipuladoresMidia['midia.processar-foto']`

- [ ] **Passo 1: Instalar o sharp**

```bash
cd "/c/Users/idmpc/devolucoes-wt/fase-2"
npm install --save-exact sharp@0.35.5
npm ls sharp
```

Esperado: uma só cópia, `sharp@0.35.5` (a mesma do Next, "deduped").

- [ ] **Passo 2: Escrever os testes que falham**

`src/modules/midia/carimbo.test.ts`:

```ts
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { carimbarFoto, escaparXml, svgCarimbo, textoCarimbo } from './carimbo';

const CINZA = { r: 200, g: 200, b: 200 };
const imagem = (largura: number, altura: number) => sharp({ create: { width: largura, height: altura, channels: 3, background: CINZA } });

describe('carimbo (extra, spec §9)', () => {
  it('texto: data e hora de Brasília, código da devolução e usuário', () => {
    expect(textoCarimbo({ quando: new Date('2026-11-12T17:03:00Z'), codigo: 'DEV-000123', usuario: 'Ana Souza' })).toBe(
      '12/11/2026 14:03 · DEV-000123 · Ana Souza',
    );
  });

  it('escapa o XML (o nome do usuário vem do cadastro)', () => {
    expect(escaparXml(`<b>"Zé" & 'Cia'</b>`)).toBe('&lt;b&gt;&quot;Zé&quot; &amp; &apos;Cia&apos;&lt;/b&gt;');
    expect(svgCarimbo(800, 600, 'A & B')).toContain('A &amp; B');
  });

  it('grava uma faixa escura embaixo, mantém o tamanho e tira o EXIF', async () => {
    const entrada = await imagem(800, 600).jpeg().toBuffer();
    const { conteudo, largura, altura } = await carimbarFoto(entrada, { quando: new Date(), codigo: 'DEV-000001', usuario: 'Operador' });
    const info = await sharp(conteudo).metadata();
    expect([info.format, info.width, info.height, largura, altura]).toEqual(['jpeg', 800, 600, 800, 600]);
    expect(info.exif).toBeUndefined();
    const baixo = await sharp(conteudo).extract({ left: 0, top: 590, width: 50, height: 8 }).stats();
    const alto = await sharp(conteudo).extract({ left: 0, top: 10, width: 50, height: 8 }).stats();
    expect(baixo.channels[0].mean).toBeLessThan(alto.channels[0].mean - 50);
  });

  it('aplica a orientação do celular e limita o maior lado a 1600 px', async () => {
    const deitada = await imagem(800, 600).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const girada = await carimbarFoto(deitada, { quando: new Date(), codigo: 'DEV-1', usuario: 'U' });
    expect([girada.largura, girada.altura]).toEqual([600, 800]);
    const grande = await imagem(4000, 3000).jpeg().toBuffer();
    const reduzida = await carimbarFoto(grande, { quando: new Date(), codigo: 'DEV-1', usuario: 'U' });
    expect([reduzida.largura, reduzida.altura]).toEqual([1600, 1200]);
  });

  it('recusa o que não é imagem', async () => {
    await expect(carimbarFoto(Buffer.from('não é imagem'), { quando: new Date(), codigo: 'DEV-1', usuario: 'U' })).rejects.toThrow();
  });
});
```

`src/modules/midia/processamento.int.test.ts`:

```ts
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eventosHistorico, evidencias } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { criarDevolucaoEmConferencia, criarEvidenciaTeste } from '../../../tests/helpers/fabricas-conferencia';
import { obterArmazenamento } from './armazenamento';
import type { ArmazenamentoMemoria } from './armazenamento-memoria';
import { sha256DoBuffer } from './hash';
import { processarFoto } from './processamento';

const { db, sql } = criarDbTeste();
let pasta: string;
let operador: UsuarioSessao;
const agora = new Date('2026-11-12T18:00:00Z');

beforeEach(async () => {
  await limparTabelas(sql);
  pasta = await mkdtemp(join(tmpdir(), 'proc-'));
  operador = await criarUsuarioTeste(db, 'OPERADOR');
});
afterEach(async () => {
  await rm(pasta, { recursive: true, force: true });
});
afterAll(async () => {
  await sql.end();
});

async function fotoRecebida(conteudo?: Buffer) {
  const d = await criarDevolucaoEmConferencia(db, operador);
  const caminho = join(pasta, 'upload1');
  await writeFile(caminho, conteudo ?? (await sharp({ create: { width: 640, height: 480, channels: 3, background: '#88aa99' } }).jpeg().toBuffer()));
  await writeFile(`${caminho}.json`, '{}');
  const id = await criarEvidenciaTeste(db, { devolucaoId: d.id, tipo: 'FOTO_1_ETIQUETA', caminhoTemporario: caminho, usuarioId: operador.id });
  return { d, id, caminho };
}
async function linha(id: string) {
  const [e] = await db.select().from(evidencias).where(eq(evidencias.id, id));
  return e;
}

describe('processarFoto (tarefa midia.processar-foto)', () => {
  it('carimba, guarda no armazenamento final, marca PRONTA com os hashes e apaga o temporário', async () => {
    const { d, id, caminho } = await fotoRecebida();
    await processarFoto(db, id, { tentativa: 1, agora });
    const e = await linha(id);
    const chave = `evidencias/${d.id}/${id}.jpg`;
    const guardado = (obterArmazenamento() as ArmazenamentoMemoria).arquivos.get(chave);
    expect(guardado?.tipoConteudo).toBe('image/jpeg');
    expect(e).toMatchObject({
      situacaoProcessamento: 'PRONTA',
      caminho: chave,
      provedor: 'memoria',
      caminhoTemporario: null,
      tamanho: guardado!.conteudo.length,
      sha256Final: sha256DoBuffer(guardado!.conteudo),
      processadoEm: agora,
    });
    expect(existsSync(caminho) || existsSync(`${caminho}.json`)).toBe(false);
    const [evento] = await db.select({ dados: eventosHistorico.dados }).from(eventosHistorico).where(eq(eventosHistorico.acao, 'evidencia_processada'));
    expect(evento.dados).toMatchObject({ evidenciaId: id, tipo: 'FOTO_1_ETIQUETA', sha256_final: e.sha256Final });
  });

  it('idempotente: evidência apagada (refeita) ou já pronta não faz nada', async () => {
    const { id } = await fotoRecebida();
    await processarFoto(db, id, { tentativa: 1, agora });
    await processarFoto(db, id, { tentativa: 1, agora });
    await db.delete(evidencias).where(eq(evidencias.id, id));
    await expect(processarFoto(db, id, { tentativa: 1, agora })).resolves.toBeUndefined();
  });

  it('erro numa tentativa intermediária: volta para RECEBIDA e lança (nova tentativa)', async () => {
    const { id } = await fotoRecebida(Buffer.from('não é imagem'));
    await expect(processarFoto(db, id, { tentativa: 2, agora })).rejects.toThrow();
    expect(await linha(id)).toMatchObject({ situacaoProcessamento: 'RECEBIDA' });
  });

  it('erro na 5ª tentativa: FALHOU, com o motivo e o evento evidencia_falhou (decisão 8)', async () => {
    const { id } = await fotoRecebida(Buffer.from('não é imagem'));
    await expect(processarFoto(db, id, { tentativa: 5, agora })).rejects.toThrow();
    const e = await linha(id);
    expect(e.situacaoProcessamento).toBe('FALHOU');
    expect(e.erroProcessamento).toBeTruthy();
    expect(await db.select({ id: eventosHistorico.id }).from(eventosHistorico).where(eq(eventosHistorico.acao, 'evidencia_falhou'))).toHaveLength(1);
  });
});
```

Rode: `npm test -- src/modules/midia/carimbo.test.ts && npm run test:int -- src/modules/midia/processamento.int.test.ts`
Esperado: FAIL (`carimbo` e `processamento` não existem).

- [ ] **Passo 3: Implementar o carimbo**

`src/modules/midia/carimbo.ts`:

```ts
import sharp from 'sharp';
import { formatarDataHora } from '@/lib/formatar';

// Worker numa vCPU: sem cache e uma imagem por vez (pesquisa §8, memória do sharp com glibc).
sharp.cache(false);
sharp.concurrency(1);

/** Spec §9: ~1600 px no maior lado. */
export const LADO_MAIOR = 1600;

/** "12/11/2026 14:03 · DEV-000123 · Ana Souza": hora de Brasília em que o servidor recebeu (decisão 6). */
export function textoCarimbo(p: { quando: Date; codigo: string; usuario: string }): string {
  return `${formatarDataHora(p.quando)} · ${p.codigo} · ${p.usuario}`;
}

export function escaparXml(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** Faixa escura na base, com o texto em branco. A fonte é proporcional e encolhe para o texto caber na largura. */
export function svgCarimbo(largura: number, altura: number, texto: string): string {
  const fonte = Math.max(10, Math.min(Math.round(altura * 0.028), Math.floor(largura / (texto.length * 0.62))));
  const faixa = Math.min(altura, Math.round(fonte * 2));
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${faixa}">` +
    `<rect width="100%" height="100%" fill="#000000" fill-opacity="0.6"/>` +
    `<text x="${Math.round(fonte * 0.6)}" y="${Math.round(faixa * 0.68)}" font-family="DejaVu Sans, Arial, sans-serif" ` +
    `font-size="${fonte}" fill="#ffffff">${escaparXml(texto)}</text></svg>`
  );
}

export async function carimbarFoto(
  entrada: Buffer,
  p: { quando: Date; codigo: string; usuario: string },
): Promise<{ conteudo: Buffer; largura: number; altura: number }> {
  const { data, info } = await sharp(entrada, { failOn: 'error' })
    .autoOrient()
    .resize({ width: LADO_MAIOR, height: LADO_MAIOR, fit: 'inside', withoutEnlargement: true })
    .toBuffer({ resolveWithObject: true });
  const svg = svgCarimbo(info.width, info.height, textoCarimbo(p));
  // Sem withMetadata(): o JPEG final sai sem EXIF (nem GPS).
  const conteudo = await sharp(data)
    .composite([{ input: Buffer.from(svg), gravity: 'south' }])
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  return { conteudo, largura: info.width, altura: info.height };
}
```

Rode: `npm test -- src/modules/midia/carimbo.test.ts`
Esperado: PASS.

- [ ] **Passo 4: Implementar o processamento da foto e o manipulador**

`src/modules/midia/processamento.ts`:

```ts
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { devolucoes, evidencias, usuarios } from '@/db/schema';
import { CONFIG_TAREFAS, type NomeTarefa } from '@/modules/fila/tarefas';
import { registrarEvento } from '@/modules/historico/eventos';
import { obterArmazenamento, provedorAtual } from './armazenamento';
import { carimbarFoto } from './carimbo';
import { chaveEvidencia } from './chaves';
import { sha256DoBuffer } from './hash';
import { apagarTemporario } from './temporarios';

export type ContextoProcessamento = { tentativa: number; agora: Date };

const EM_ANDAMENTO = ['RECEBIDA', 'PROCESSANDO'] as const;

async function carregar(db: Db, evidenciaId: string) {
  const [e] = await db
    .select({
      id: evidencias.id,
      devolucaoId: evidencias.devolucaoId,
      itemId: evidencias.itemId,
      tipo: evidencias.tipo,
      situacao: evidencias.situacaoProcessamento,
      caminhoTemporario: evidencias.caminhoTemporario,
      sha256Original: evidencias.sha256Original,
      enviadoEm: evidencias.enviadoEm,
      codigo: devolucoes.codigo,
      usuarioNome: usuarios.nome,
    })
    .from(evidencias)
    .innerJoin(devolucoes, eq(devolucoes.id, evidencias.devolucaoId))
    .leftJoin(usuarios, eq(usuarios.id, evidencias.enviadoPor))
    .where(eq(evidencias.id, evidenciaId));
  return e ?? null;
}

export type EvidenciaEmProcessamento = NonNullable<Awaited<ReturnType<typeof carregar>>> & { caminhoTemporario: string };

/** Marca PROCESSANDO. null = nada a fazer (apagada ao refazer, já pronta ou já falhou): o manipulador é idempotente. */
export async function comecar(db: Db, evidenciaId: string): Promise<EvidenciaEmProcessamento | null> {
  const e = await carregar(db, evidenciaId);
  if (!e || !(EM_ANDAMENTO as readonly string[]).includes(e.situacao) || !e.caminhoTemporario) return null;
  await db.update(evidencias).set({ situacaoProcessamento: 'PROCESSANDO' }).where(eq(evidencias.id, evidenciaId));
  return { ...e, caminhoTemporario: e.caminhoTemporario };
}

/** PRONTA + evento com os dois hashes (spec §9). false = a evidência foi refeita enquanto processava (o arquivo novo sobra). */
export async function concluirProcessamento(
  db: Db,
  e: EvidenciaEmProcessamento,
  final: { chave: string; tipoConteudo: string; tamanho: number; sha256Final: string },
  agora: Date,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [linha] = await tx
      .update(evidencias)
      .set({
        caminho: final.chave,
        provedor: provedorAtual(),
        tipoConteudo: final.tipoConteudo,
        tamanho: final.tamanho,
        sha256Final: final.sha256Final,
        situacaoProcessamento: 'PRONTA',
        erroProcessamento: null,
        caminhoTemporario: null,
        processadoEm: agora,
      })
      .where(and(eq(evidencias.id, e.id), inArray(evidencias.situacaoProcessamento, [...EM_ANDAMENTO])))
      .returning({ id: evidencias.id });
    if (!linha) return false;
    await registrarEvento(tx, {
      entidade: 'devolucao',
      entidadeId: e.devolucaoId,
      acao: 'evidencia_processada',
      usuarioId: null,
      em: agora,
      dados: { evidenciaId: e.id, tipo: e.tipo, itemId: e.itemId, sha256_original: e.sha256Original, sha256_final: final.sha256Final },
    });
    return true;
  });
}

/** Erro numa tentativa (decisão 8): na última, FALHOU e evento; antes, volta para RECEBIDA para a próxima tentativa. */
export async function registrarErro(db: Db, e: EvidenciaEmProcessamento, tarefa: NomeTarefa, erro: unknown, ctx: ContextoProcessamento): Promise<void> {
  const mensagem = (erro instanceof Error ? erro.message : String(erro)).slice(0, 500);
  const ultima = ctx.tentativa >= CONFIG_TAREFAS[tarefa].tentativas;
  await db.transaction(async (tx) => {
    const [linha] = await tx
      .update(evidencias)
      .set({ situacaoProcessamento: ultima ? 'FALHOU' : 'RECEBIDA', erroProcessamento: mensagem })
      .where(and(eq(evidencias.id, e.id), inArray(evidencias.situacaoProcessamento, [...EM_ANDAMENTO])))
      .returning({ id: evidencias.id });
    if (linha && ultima) {
      await registrarEvento(tx, {
        entidade: 'devolucao',
        entidadeId: e.devolucaoId,
        acao: 'evidencia_falhou',
        usuarioId: null,
        em: ctx.agora,
        dados: { evidenciaId: e.id, tipo: e.tipo, itemId: e.itemId, erro: mensagem },
      });
    }
  });
}

/** Tarefa midia.processar-foto: carimbo (extra), SHA-256 final e envio ao armazenamento final. */
export async function processarFoto(db: Db, evidenciaId: string, ctx: ContextoProcessamento): Promise<void> {
  const e = await comecar(db, evidenciaId);
  if (!e) return;
  try {
    const { conteudo } = await carimbarFoto(await readFile(e.caminhoTemporario), {
      quando: e.enviadoEm,
      codigo: e.codigo,
      usuario: e.usuarioNome ?? 'usuário removido',
    });
    const chave = chaveEvidencia(e.devolucaoId, e.id, 'jpg');
    const armazenamento = obterArmazenamento();
    await armazenamento.salvar(chave, Readable.from([conteudo]), { tipoConteudo: 'image/jpeg', tamanho: conteudo.length });
    const ok = await concluirProcessamento(db, e, { chave, tipoConteudo: 'image/jpeg', tamanho: conteudo.length, sha256Final: sha256DoBuffer(conteudo) }, ctx.agora);
    if (!ok) {
      await armazenamento.apagar(chave);
      return;
    }
    // A foto original é descartada depois do carimbo; fica o sha256_original (contrato D6).
    await apagarTemporario(e.caminhoTemporario);
  } catch (erro) {
    await registrarErro(db, e, 'midia.processar-foto', erro, ctx);
    throw erro;
  }
}
```

`src/worker/manipuladores/midia.ts` (substitua o conteúdo):

```ts
import { processarFoto } from '@/modules/midia/processamento';
import type { Manipuladores } from '../tipos';

/** Fase 2: midia.processar-foto, midia.transcodificar e limpeza.temporarios. Só a Fase 2 edita este arquivo. */
export const manipuladoresMidia: Manipuladores = {
  'midia.processar-foto': (dados, ctx) => processarFoto(ctx.db, dados.evidenciaId, ctx),
};
```

Rode: `npm run test:int -- src/modules/midia/processamento.int.test.ts && npm run build:scripts`
Esperado: PASS; o `dist/worker.mjs` é gerado (o `sharp` fica de fora, como `external`).

- [ ] **Passo 5: Fonte e sharp na imagem Docker**

No `Dockerfile`, estágio `runner`:
1. Na linha `ENV NODE_ENV=production ...`, acrescente no fim ` MALLOC_ARENA_MAX=2` (memória do sharp com glibc, pesquisa §8).
2. Logo depois da linha `ENV ...` do runner, acrescente:

```dockerfile
# Fonte do carimbo das fotos: sem ela o texto do sharp sai em branco (a bookworm-slim não tem fontes).
RUN apt-get update && apt-get install -y --no-install-recommends fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
```

3. Logo depois de `COPY --from=build /app/node_modules/@node-rs ./node_modules/@node-rs`, acrescente:

```dockerfile
# sharp do worker (empacotado com --external:sharp): o módulo, os binários da plataforma e as dependências dele.
COPY --from=build /app/node_modules/sharp ./node_modules/sharp
COPY --from=build /app/node_modules/@img ./node_modules/@img
COPY --from=build /app/node_modules/detect-libc ./node_modules/detect-libc
COPY --from=build /app/node_modules/semver ./node_modules/semver
```

> O `npm ci` do estágio `deps` roda no Linux da imagem e instala o `@img/sharp-linux-x64` certo; nunca copie `node_modules` do Windows. A imagem é conferida pelo GitHub Actions no push (do usuário) e na VPS (veja "Depois da fase").

- [ ] **Passo 6: Verificar e commitar**

```bash
cd "/c/Users/idmpc/devolucoes-wt/fase-2"
npm test && npm run test:int && npm run typecheck && npm run lint
git add package.json package-lock.json Dockerfile src/modules/midia src/worker/manipuladores/midia.ts
git commit -m "feat: worker processa as fotos (orientação, 1600 px, carimbo com data, DEV e usuário, SHA-256 final) e fonte/sharp na imagem" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 14: Worker: Vídeo de Prova (ffmpeg) e limpeza dos temporários

**Por que assim:** spec §9: H.264 720p, ~10 a 15 MB por minuto, e o original só é apagado depois do sucesso. Flags e cuidados da pesquisa §6 (decisão 7): `spawn` sem shell, argumentos em lista, caminhos gerados pelo sistema, saída num arquivo parcial renomeado no fim, prazo com `SIGKILL`, `stderr` limitado e conferência da saída com o `ffprobe`. Na imagem, `ffmpeg` do apt (`--no-install-recommends`, traz o `ffprobe`).

**Arquivos:**
- Criar: `src/modules/midia/ffmpeg.ts`, `src/modules/midia/limpeza.ts`
- Modificar: `src/modules/midia/processamento.ts` (acrescentar `transcodificarVideo`), `src/worker/manipuladores/midia.ts`, `Dockerfile`
- Testes: `src/modules/midia/ffmpeg.test.ts`, `src/modules/midia/ffmpeg.int.test.ts`, `src/modules/midia/limpeza.int.test.ts`

**Interfaces:**
- Consome: `comecar`, `concluirProcessamento`, `registrarErro`, `EvidenciaEmProcessamento` (Tarefa 13); `sha256DoArquivo`, `apagarTemporario`, `pastaTus` (Tarefa 12); `lerEnv` (`FFMPEG_PATH`, `FFPROBE_PATH`).
- Produz:
  - em `ffmpeg.ts`: `type Binarios = { ffmpeg: string; ffprobe: string }`, `binariosFfmpeg()`, `FILTRO_720P`, `argumentosTranscodificacao(entrada, saida): string[]`, `type Sondagem = { duracao; codecVideo; largura; altura }`, `interpretarSondagem(json): Sondagem`, `conferirTranscodificacao(antes, depois): string | null`, `executar(binario, argumentos, { limiteMs })`, `sondar(ffprobe, arquivo)`, `transcodificar(ffmpeg, entrada, saida)`, `temFfmpeg(binarios?): Promise<boolean>`
  - em `processamento.ts`: `transcodificarVideo(db: Db, evidenciaId, ctx, binarios?): Promise<void>`
  - em `limpeza.ts`: `limparTemporarios(db: Db, opcoes: { agora: Date; pasta?: string }): Promise<{ arquivos: number; importacoes: number }>`
  - `manipuladoresMidia` completo: `midia.processar-foto`, `midia.transcodificar`, `limpeza.temporarios`

- [ ] **Passo 1: Escrever os testes que falham**

`src/modules/midia/ffmpeg.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { argumentosTranscodificacao, conferirTranscodificacao, FILTRO_720P, interpretarSondagem } from './ffmpeg';

describe('argumentos do ffmpeg (pesquisa §6.2)', () => {
  it('H.264 High, veryfast, CRF 28, até 1500 kbps, AAC 96 kbps, faststart, sem ler a entrada padrão', () => {
    const a = argumentosTranscodificacao('C:/tmp/entrada', 'C:/tmp/saida.parcial');
    expect(a.slice(0, 7)).toEqual(['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', 'C:/tmp/entrada']);
    expect(a).toEqual(expect.arrayContaining(['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-maxrate', '1500k', '-c:a', 'aac', '-b:a', '96k']));
    expect(a).toEqual(expect.arrayContaining(['-movflags', '+faststart']));
    expect(a[a.indexOf('-vf') + 1]).toBe(FILTRO_720P);
    expect(a.slice(-3)).toEqual(['-f', 'mp4', 'C:/tmp/saida.parcial']);
  });

  it('o lado menor fica em até 720 px, par, sem ampliar vídeo pequeno', () => {
    expect(FILTRO_720P).toContain('min(720,ih)');
    expect(FILTRO_720P).toContain('min(720,iw)');
    expect(FILTRO_720P).toContain('format=yuv420p');
  });
});

describe('ffprobe', () => {
  it('lê duração, codec e tamanho do JSON', () => {
    const json = JSON.stringify({
      streams: [
        { codec_type: 'audio', codec_name: 'aac' },
        { codec_type: 'video', codec_name: 'hevc', width: 1920, height: 1080 },
      ],
      format: { duration: '61.500000' },
    });
    expect(interpretarSondagem(json)).toEqual({ duracao: 61.5, codecVideo: 'hevc', largura: 1920, altura: 1080 });
    expect(interpretarSondagem('{}')).toEqual({ duracao: null, codecVideo: null, largura: null, altura: null });
  });

  it('confere a saída antes de apagar o original (spec §9)', () => {
    const antes = { duracao: 60, codecVideo: 'hevc', largura: 1920, altura: 1080 };
    expect(conferirTranscodificacao(antes, { duracao: 59.8, codecVideo: 'h264', largura: 1280, altura: 720 })).toBeNull();
    expect(conferirTranscodificacao(antes, { duracao: 30, codecVideo: 'h264', largura: 1280, altura: 720 })).toMatch(/Duração diferente/);
    expect(conferirTranscodificacao(antes, { duracao: 60, codecVideo: null, largura: null, altura: null })).toMatch(/não é H\.264/);
    expect(conferirTranscodificacao({ ...antes, duracao: null }, { duracao: 5, codecVideo: 'h264', largura: 1, altura: 1 })).toBeNull();
  });
});
```

`src/modules/midia/ffmpeg.int.test.ts`:

```ts
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { evidencias } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { criarDevolucaoEmConferencia, criarEvidenciaTeste } from '../../../tests/helpers/fabricas-conferencia';
import { obterArmazenamento } from './armazenamento';
import type { ArmazenamentoMemoria } from './armazenamento-memoria';
import { binariosFfmpeg, sondar, temFfmpeg } from './ffmpeg';
import { transcodificarVideo } from './processamento';

const comFfmpeg = await temFfmpeg();
const { db, sql } = criarDbTeste();
let pasta: string;
let operador: UsuarioSessao;
const agora = new Date('2026-11-12T19:00:00Z');

beforeEach(async () => {
  await limparTabelas(sql);
  pasta = await mkdtemp(join(tmpdir(), 'video-'));
  operador = await criarUsuarioTeste(db, 'OPERADOR');
});
afterEach(async () => {
  await rm(pasta, { recursive: true, force: true });
});
afterAll(async () => {
  await sql.end();
});

async function videoRecebido(gerar: boolean) {
  const d = await criarDevolucaoEmConferencia(db, operador);
  const caminho = join(pasta, 'upload-video');
  if (gerar) {
    // 2 s de imagem de teste 640×360 com som, como sairia de um celular (mais ou menos).
    execFileSync(binariosFfmpeg().ffmpeg, [
      '-y', '-f', 'lavfi', '-i', 'testsrc=duration=2:size=640x360:rate=15',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-shortest',
      '-c:v', 'mpeg4', '-c:a', 'aac', '-f', 'mp4', caminho,
    ], { stdio: 'ignore' });
  } else {
    await writeFile(caminho, Buffer.alloc(4096, 7));
  }
  const id = await criarEvidenciaTeste(db, { devolucaoId: d.id, tipo: 'VIDEO_PROVA', caminhoTemporario: caminho, usuarioId: operador.id });
  return { d, id, caminho };
}

describe.skipIf(!comFfmpeg)('transcodificarVideo (precisa do ffmpeg instalado)', () => {
  it('converte para H.264, guarda como mp4, marca PRONTA e só então apaga o original', async () => {
    const { d, id, caminho } = await videoRecebido(true);
    await transcodificarVideo(db, id, { tentativa: 1, agora });
    const [e] = await db.select().from(evidencias).where(eq(evidencias.id, id));
    expect(e).toMatchObject({ situacaoProcessamento: 'PRONTA', caminho: `evidencias/${d.id}/${id}.mp4`, tipoConteudo: 'video/mp4', caminhoTemporario: null });
    expect(existsSync(caminho)).toBe(false);
    const guardado = (obterArmazenamento() as ArmazenamentoMemoria).arquivos.get(e.caminho!);
    const conferir = join(pasta, 'conferir.mp4');
    await writeFile(conferir, guardado!.conteudo);
    expect(await sondar(binariosFfmpeg().ffprobe, conferir)).toMatchObject({ codecVideo: 'h264', largura: 640, altura: 360 });
  });

  it('arquivo que não é vídeo: na última tentativa fica FALHOU e o original é mantido', async () => {
    const { id, caminho } = await videoRecebido(false);
    await expect(transcodificarVideo(db, id, { tentativa: 5, agora })).rejects.toThrow(/ffprobe/);
    const [e] = await db.select({ situacao: evidencias.situacaoProcessamento }).from(evidencias).where(eq(evidencias.id, id));
    expect(e.situacao).toBe('FALHOU');
    expect(existsSync(caminho)).toBe(true);
  });
});
```

`src/modules/midia/limpeza.int.test.ts`:

```ts
import { existsSync } from 'node:fs';
import { mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { importacoes } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { criarDevolucaoEmConferencia, criarEvidenciaTeste } from '../../../tests/helpers/fabricas-conferencia';
import { limparTemporarios } from './limpeza';

const { db, sql } = criarDbTeste();
let pasta: string;
let operador: UsuarioSessao;
const agora = new Date('2026-11-12T03:30:00Z');
const doisDiasAntes = new Date(agora.getTime() - 2 * 24 * 60 * 60 * 1000);

beforeEach(async () => {
  await limparTabelas(sql);
  pasta = await mkdtemp(join(tmpdir(), 'limpeza-'));
  operador = await criarUsuarioTeste(db, 'OPERADOR');
});
afterEach(async () => {
  await rm(pasta, { recursive: true, force: true });
});
afterAll(async () => {
  await sql.end();
});

async function arquivo(nome: string, quando: Date) {
  const caminho = join(pasta, nome);
  await writeFile(caminho, 'x');
  await utimes(caminho, quando, quando);
  return caminho;
}

describe('limparTemporarios (extra: tarefa diária limpeza.temporarios)', () => {
  it('apaga uploads abandonados há mais de 1 dia e mantém os em uso e os recentes', async () => {
    const abandonado = await arquivo('aaa', doisDiasAntes);
    const abandonadoJson = await arquivo('aaa.json', doisDiasAntes);
    const emUso = await arquivo('bbb', doisDiasAntes);
    const recente = await arquivo('ccc', agora);
    const d = await criarDevolucaoEmConferencia(db, operador);
    await criarEvidenciaTeste(db, { devolucaoId: d.id, tipo: 'VIDEO_PROVA', caminhoTemporario: emUso });

    const r = await limparTemporarios(db, { agora, pasta });
    expect(r.arquivos).toBe(2);
    expect([existsSync(abandonado), existsSync(abandonadoJson), existsSync(emUso), existsSync(recente)]).toEqual([false, false, true, true]);
  });

  it('apaga importações de planilha não confirmadas há mais de 1 dia', async () => {
    const base = { tipo: 'produtos' as const, nomeArquivo: 'p.csv', cabecalhos: [], linhas: [], criadoPor: operador.id };
    await db.insert(importacoes).values([{ ...base, criadaEm: doisDiasAntes }, { ...base, criadaEm: agora }]);
    expect((await limparTemporarios(db, { agora, pasta })).importacoes).toBe(1);
    expect(await db.select({ id: importacoes.id }).from(importacoes)).toHaveLength(1);
  });

  it('pasta que ainda não existe não é erro', async () => {
    expect(await limparTemporarios(db, { agora, pasta: join(pasta, 'nao-existe') })).toEqual({ arquivos: 0, importacoes: 0 });
  });
});
```

Rode: `npm test -- src/modules/midia/ffmpeg.test.ts && npm run test:int -- src/modules/midia/ffmpeg.int.test.ts src/modules/midia/limpeza.int.test.ts`
Esperado: FAIL (`ffmpeg`, `limpeza` e `transcodificarVideo` não existem).

- [ ] **Passo 2: Implementar o ffmpeg**

`src/modules/midia/ffmpeg.ts`:

```ts
import { spawn } from 'node:child_process';
import { rename, rm } from 'node:fs/promises';
import { lerEnv } from '@/lib/env';

export type Binarios = { ffmpeg: string; ffprobe: string };

/** FFMPEG_PATH e FFPROBE_PATH (padrão: no PATH). No Windows: winget install Gyan.FFmpeg. */
export function binariosFfmpeg(): Binarios {
  const env = lerEnv();
  return { ffmpeg: env.FFMPEG_PATH, ffprobe: env.FFPROBE_PATH };
}

/**
 * Lado menor em até 720 px (deitado 1280×720, em pé 720×1280), sempre par e sem ampliar vídeo menor. As aspas simples
 * protegem as vírgulas dentro do if() no filtro do ffmpeg (sem shell: o ffmpeg recebe o texto como está).
 */
export const FILTRO_720P =
  "scale='if(gt(iw,ih),-2,trunc(min(720,iw)/2)*2)':'if(gt(iw,ih),trunc(min(720,ih)/2)*2,-2)',format=yuv420p";

export function argumentosTranscodificacao(entrada: string, saida: string): string[] {
  return [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
    '-i', entrada,
    '-map', '0:v:0', '-map', '0:a:0?',
    '-vf', FILTRO_720P,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-maxrate', '1500k', '-bufsize', '3000k', '-profile:v', 'high',
    '-c:a', 'aac', '-b:a', '96k', '-ac', '2',
    '-movflags', '+faststart',
    '-f', 'mp4',
    saida,
  ];
}

export type Sondagem = { duracao: number | null; codecVideo: string | null; largura: number | null; altura: number | null };

type SaidaFfprobe = {
  streams?: { codec_type?: string; codec_name?: string; width?: number; height?: number }[];
  format?: { duration?: string };
};

export function interpretarSondagem(json: string): Sondagem {
  const d = JSON.parse(json) as SaidaFfprobe;
  const video = d.streams?.find((s) => s.codec_type === 'video');
  const duracao = Number(d.format?.duration);
  return {
    duracao: d.format?.duration !== undefined && Number.isFinite(duracao) ? duracao : null,
    codecVideo: video?.codec_name ?? null,
    largura: video?.width ?? null,
    altura: video?.height ?? null,
  };
}

/** Decisão 7: H.264 e duração dentro de 5% (ou 1 s). null = saída aceita. */
export function conferirTranscodificacao(antes: Sondagem, depois: Sondagem): string | null {
  if (depois.codecVideo !== 'h264') return `O vídeo convertido não é H.264 (${depois.codecVideo ?? 'sem trilha de vídeo'}).`;
  if (antes.duracao !== null && depois.duracao !== null) {
    const tolerancia = Math.max(1, antes.duracao * 0.05);
    if (Math.abs(antes.duracao - depois.duracao) > tolerancia) {
      return `Duração diferente depois da conversão (${antes.duracao.toFixed(1)} s → ${depois.duracao.toFixed(1)} s).`;
    }
  }
  return null;
}

export type Execucao = { codigo: number | null; stdout: string; stderr: string };

/** spawn sem shell, argumentos em lista, prazo com SIGKILL e saídas limitadas (pesquisa §6.5). */
export function executar(binario: string, argumentos: string[], opcoes: { limiteMs: number }): Promise<Execucao> {
  return new Promise((resolver, rejeitar) => {
    const filho = spawn(binario, argumentos, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '';
    let stderr = '';
    filho.stdout.on('data', (parte: Buffer) => {
      if (stdout.length < 1_000_000) stdout += parte.toString();
    });
    filho.stderr.on('data', (parte: Buffer) => {
      stderr = (stderr + parte.toString()).slice(-8000);
    });
    const relogio = setTimeout(() => filho.kill('SIGKILL'), opcoes.limiteMs);
    filho.on('error', (erro) => {
      clearTimeout(relogio);
      rejeitar(erro);
    });
    filho.on('close', (codigo) => {
      clearTimeout(relogio);
      resolver({ codigo, stdout, stderr });
    });
  });
}

export async function sondar(ffprobe: string, arquivo: string): Promise<Sondagem> {
  const r = await executar(ffprobe, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', arquivo], { limiteMs: 60_000 });
  if (r.codigo !== 0) throw new Error(`ffprobe falhou: ${r.stderr.trim() || `código ${r.codigo}`}`);
  return interpretarSondagem(r.stdout);
}

/** Grava num arquivo parcial e renomeia: um vídeo pela metade nunca vira a saída. Prazo de 50 min (a tarefa expira em 60). */
export async function transcodificar(ffmpeg: string, entrada: string, saida: string): Promise<void> {
  const parcial = `${saida}.parcial`;
  const r = await executar(ffmpeg, argumentosTranscodificacao(entrada, parcial), { limiteMs: 50 * 60_000 });
  if (r.codigo !== 0) {
    await rm(parcial, { force: true });
    throw new Error(`ffmpeg falhou: ${r.stderr.trim() || `código ${r.codigo}`}`);
  }
  await rename(parcial, saida);
}

export async function temFfmpeg(binarios: Binarios = binariosFfmpeg()): Promise<boolean> {
  try {
    return (await executar(binarios.ffmpeg, ['-version'], { limiteMs: 10_000 })).codigo === 0;
  } catch {
    return false;
  }
}
```

- [ ] **Passo 3: Transcodificar o vídeo**

Em `src/modules/midia/processamento.ts`:

1. Troque `import { readFile } from 'node:fs/promises';` por:

```ts
import { createReadStream } from 'node:fs';
import { readFile, rm, stat } from 'node:fs/promises';
```

2. Troque `import { sha256DoBuffer } from './hash';` por:

```ts
import { binariosFfmpeg, conferirTranscodificacao, sondar, transcodificar, type Binarios } from './ffmpeg';
import { sha256DoArquivo, sha256DoBuffer } from './hash';
```

3. Acrescente no **final** do arquivo:

```ts
/** Tarefa midia.transcodificar (spec §9): H.264 720p; o original só é apagado depois do sucesso. */
export async function transcodificarVideo(
  db: Db,
  evidenciaId: string,
  ctx: ContextoProcessamento,
  binarios: Binarios = binariosFfmpeg(),
): Promise<void> {
  const e = await comecar(db, evidenciaId);
  if (!e) return;
  const saida = `${e.caminhoTemporario}.saida.mp4`;
  try {
    const antes = await sondar(binarios.ffprobe, e.caminhoTemporario);
    await transcodificar(binarios.ffmpeg, e.caminhoTemporario, saida);
    const problema = conferirTranscodificacao(antes, await sondar(binarios.ffprobe, saida));
    if (problema) throw new Error(problema);
    const { size: tamanho } = await stat(saida);
    const sha256Final = await sha256DoArquivo(saida);
    const chave = chaveEvidencia(e.devolucaoId, e.id, 'mp4');
    const armazenamento = obterArmazenamento();
    await armazenamento.salvar(chave, createReadStream(saida), { tipoConteudo: 'video/mp4', tamanho });
    const ok = await concluirProcessamento(db, e, { chave, tipoConteudo: 'video/mp4', tamanho, sha256Final }, ctx.agora);
    await rm(saida, { force: true });
    if (!ok) {
      await armazenamento.apagar(chave);
      return;
    }
    await apagarTemporario(e.caminhoTemporario);
  } catch (erro) {
    await rm(saida, { force: true });
    await registrarErro(db, e, 'midia.transcodificar', erro, ctx);
    throw erro;
  }
}
```

- [ ] **Passo 4: Limpeza dos temporários (extra)**

`src/modules/midia/limpeza.ts`:

```ts
import { readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { and, eq, isNotNull, lt } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { evidencias, importacoes } from '@/db/schema';
import { pastaTus } from './temporarios';

const UM_DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Tarefa diária limpeza.temporarios (contrato §5.1, extra): apaga arquivos do tus com mais de 1 dia que nenhuma
 * evidência usa (upload abandonado, .json, saída de vídeo que sobrou) e as importações de planilha não confirmadas
 * há mais de 1 dia (Fase 1, decisão 13).
 */
export async function limparTemporarios(db: Db, opcoes: { agora: Date; pasta?: string }): Promise<{ arquivos: number; importacoes: number }> {
  const pasta = opcoes.pasta ?? pastaTus();
  const limite = opcoes.agora.getTime() - UM_DIA_MS;
  const emUso = new Set(
    (await db.select({ caminho: evidencias.caminhoTemporario }).from(evidencias).where(isNotNull(evidencias.caminhoTemporario))).map(
      (l) => l.caminho as string,
    ),
  );
  let arquivos = 0;
  const nomes = await readdir(pasta).catch(() => [] as string[]);
  for (const nome of nomes) {
    // "abc", "abc.json", "abc.saida.mp4" e "abc.saida.mp4.parcial" são todos do upload "abc".
    const upload = join(pasta, nome.split('.')[0]);
    if (emUso.has(upload)) continue;
    const caminho = join(pasta, nome);
    const info = await stat(caminho).catch(() => null);
    if (!info?.isFile() || info.mtimeMs >= limite) continue;
    await rm(caminho, { force: true });
    arquivos += 1;
  }
  const removidas = await db
    .delete(importacoes)
    .where(and(eq(importacoes.situacao, 'PENDENTE'), lt(importacoes.criadaEm, new Date(limite))))
    .returning({ id: importacoes.id });
  return { arquivos, importacoes: removidas.length };
}
```

`src/worker/manipuladores/midia.ts` (substitua o conteúdo):

```ts
import { limparTemporarios } from '@/modules/midia/limpeza';
import { processarFoto, transcodificarVideo } from '@/modules/midia/processamento';
import type { Manipuladores } from '../tipos';

/** Fase 2: midia.processar-foto, midia.transcodificar e limpeza.temporarios. Só a Fase 2 edita este arquivo. */
export const manipuladoresMidia: Manipuladores = {
  'midia.processar-foto': (dados, ctx) => processarFoto(ctx.db, dados.evidenciaId, ctx),
  'midia.transcodificar': (dados, ctx) => transcodificarVideo(ctx.db, dados.evidenciaId, ctx),
  'limpeza.temporarios': async (_dados, ctx) => {
    const r = await limparTemporarios(ctx.db, { agora: ctx.agora });
    console.log(JSON.stringify({ origem: 'worker', tarefa: 'limpeza.temporarios', ...r }));
  },
};
```

Rode: `npm test -- src/modules/midia && npm run test:int -- src/modules/midia`
Esperado: PASS. Sem ffmpeg, o `ffmpeg.int.test.ts` aparece como pulado (`skipped`).

- [ ] **Passo 5: ffmpeg na imagem Docker**

No `Dockerfile`, troque a linha do `apt-get` do runner (da Tarefa 13) por:

```dockerfile
# ffmpeg (Vídeo de Prova, spec §9; traz o ffprobe) e a fonte do carimbo das fotos.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
```

- [ ] **Passo 6: Medir no PC (anotar no commit)**

```bash
cd "/c/Users/idmpc/devolucoes-wt/fase-2"
ffmpeg -y -f lavfi -i testsrc=duration=60:size=1920x1080:rate=30 -f lavfi -i sine=duration=60 -shortest -c:v libx264 -c:a aac .dados/teste-1min.mp4
node --env-file=.env --import tsx -e "import('./src/modules/midia/ffmpeg.ts').then(async (m) => { const t = Date.now(); await m.transcodificar('ffmpeg', '.dados/teste-1min.mp4', '.dados/teste-720p.mp4'); console.log('segundos', (Date.now() - t) / 1000); })"
ls -l .dados/teste-1min.mp4 .dados/teste-720p.mp4
```

Esperado: a saída 720p de 1 minuto com uns 8 a 15 MB (spec §9: 10 a 15 MB por minuto; a imagem de teste comprime mais que um vídeo real). Anote o tempo e o tamanho na mensagem do commit; o tempo na VPS é medido em "Depois da fase".

- [ ] **Passo 7: Verificar e commitar**

```bash
cd "/c/Users/idmpc/devolucoes-wt/fase-2"
npm test && npm run test:int && npm run typecheck && npm run lint && npm run build:scripts
git add Dockerfile src/modules/midia src/worker/manipuladores/midia.ts
git commit -m "feat: worker comprime o Vídeo de Prova (H.264 720p conferido com ffprobe) e limpa os temporários abandonados" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 15: Armazenamento S3 (Backblaze B2 ou Cloudflare R2)

**Por que assim:** o disco da VPS (~13 GB livres) não aguenta 35 a 50 GB/mês (pesquisa §7.4); o destino final do uso diário é o B2 (contrato §9, pergunta 2: "disco só para teste"). A conta real é ligada depois, na etapa "Ligação das contas reais"; aqui o `ArmazenamentoS3` fica pronto e testado sem rede. API conferida em `node_modules/@aws-sdk/client-s3/dist-types` (opções `forcePathStyle`, `requestChecksumCalculation`, `responseChecksumValidation`) e em `@aws-sdk/s3-request-presigner` (`getSignedUrl(client, command, { expiresIn })`).

**Arquivos:**
- Modificar: `package.json`, `package-lock.json`, `src/modules/midia/armazenamento.ts`, `src/modules/midia/armazenamento.test.ts`
- Criar: `src/modules/midia/armazenamento-s3.ts`
- Testes: `src/modules/midia/armazenamento-s3.test.ts`

**Interfaces:**
- Consome: `ArmazenamentoArquivos`, `validarChave`, `ErroArquivoNaoEncontrado` (Tarefa 6); `lerEnv` (`S3_*`).
- Produz: `type ConfigS3 = { endpoint; regiao; bucket; chaveId; chaveSecreta }`, `criarClienteS3(c): S3Client`, `class ArmazenamentoS3 implements ArmazenamentoArquivos` (`readonly provedor = 's3'`); `armazenamentoDoProvedor('s3')` e `obterArmazenamento()` com `ARMAZENAMENTO=s3` passam a usá-lo.

- [ ] **Passo 1: Instalar o SDK (versão fixada no contrato §5.2)**

```bash
cd "/c/Users/idmpc/devolucoes-wt/fase-2"
npm install --save-exact @aws-sdk/client-s3@3.1167.0 @aws-sdk/s3-request-presigner@3.1167.0
```

(O Next já trata `@aws-sdk/client-s3` como pacote externo; o esbuild empacota o SDK no `dist/worker.mjs`.)

- [ ] **Passo 2: Escrever os testes que falham**

`src/modules/midia/armazenamento-s3.test.ts`:

```ts
import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { ArmazenamentoS3, criarClienteS3 } from './armazenamento-s3';
import { ErroArquivoNaoEncontrado } from './erros';

function montar() {
  const cliente = criarClienteS3({
    endpoint: 'https://s3.us-west-004.backblazeb2.com',
    regiao: 'us-west-004',
    bucket: 'midias',
    chaveId: 'id-de-teste',
    chaveSecreta: 'segredo-de-teste',
  });
  const send = vi.spyOn(cliente, 'send');
  return { send, a: new ArmazenamentoS3(cliente, 'midias') };
}
const naoExiste = Object.assign(new Error('não existe'), { name: 'NoSuchKey', $metadata: { httpStatusCode: 404 } });

describe('ArmazenamentoS3 (B2/R2), sem rede', () => {
  it('salvar com tamanho manda o stream com ContentLength e ContentType', async () => {
    const { send, a } = montar();
    send.mockResolvedValue({} as never);
    const corpo = Readable.from([Buffer.from('abc')]);
    await a.salvar('evidencias/d/e.jpg', corpo, { tipoConteudo: 'image/jpeg', tamanho: 3 });
    const comando = send.mock.calls[0][0] as PutObjectCommand;
    expect(comando).toBeInstanceOf(PutObjectCommand);
    expect(comando.input).toMatchObject({ Bucket: 'midias', Key: 'evidencias/d/e.jpg', ContentType: 'image/jpeg', ContentLength: 3, Body: corpo });
  });

  it('salvar sem tamanho junta o conteúdo e manda o Buffer', async () => {
    const { send, a } = montar();
    send.mockResolvedValue({} as never);
    await a.salvar('nfe/2026/11/n.xml', Readable.from([Buffer.from('<x/>')]));
    const comando = send.mock.calls[0][0] as PutObjectCommand;
    expect(comando.input.ContentLength).toBe(4);
    expect(Buffer.isBuffer(comando.input.Body)).toBe(true);
  });

  it('ler o que não existe lança ErroArquivoNaoEncontrado', async () => {
    const { send, a } = montar();
    send.mockRejectedValue(naoExiste as never);
    await expect(a.ler('evidencias/x.jpg')).rejects.toThrow(ErroArquivoNaoEncontrado);
  });

  it('existe e apagar', async () => {
    const { send, a } = montar();
    send.mockResolvedValueOnce({} as never).mockRejectedValueOnce(naoExiste as never).mockResolvedValueOnce({} as never);
    expect(await a.existe('evidencias/a.jpg')).toBe(true);
    expect(await a.existe('evidencias/b.jpg')).toBe(false);
    expect(send.mock.calls[0][0]).toBeInstanceOf(HeadObjectCommand);
    await a.apagar('evidencias/a.jpg');
    expect(send.mock.calls[2][0]).toBeInstanceOf(DeleteObjectCommand);
  });

  it('link temporário assinado de 10 minutos (spec §9), sem falar com o serviço', async () => {
    const { send, a } = montar();
    const url = new URL(await a.urlTemporaria('evidencias/d/e.jpg', 600));
    expect(url.host).toBe('s3.us-west-004.backblazeb2.com');
    expect(url.pathname).toBe('/midias/evidencias/d/e.jpg');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('600');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    expect(send).not.toHaveBeenCalled();
  });

  it('recusa chave perigosa', async () => {
    const { a } = montar();
    await expect(a.urlTemporaria('../fora', 600)).rejects.toThrow();
  });
});
```

Acrescente no **final** de `src/modules/midia/armazenamento.test.ts` (e acrescente `vi` ao import do `vitest`):

```ts
describe('escolha do provedor (ARMAZENAMENTO)', () => {
  it('s3 usa o ArmazenamentoS3 com as variáveis S3_*', async () => {
    const { obterArmazenamento, definirArmazenamentoParaTestes } = await import('./armazenamento');
    const { ArmazenamentoS3 } = await import('./armazenamento-s3');
    vi.stubEnv('DATABASE_URL', 'postgres://u:s@h/b');
    vi.stubEnv('ARMAZENAMENTO', 's3');
    vi.stubEnv('S3_ENDPOINT', 'https://s3.us-west-004.backblazeb2.com');
    vi.stubEnv('S3_REGIAO', 'us-west-004');
    vi.stubEnv('S3_BUCKET', 'midias');
    vi.stubEnv('S3_CHAVE_ID', 'id');
    vi.stubEnv('S3_CHAVE_SECRETA', 'segredo');
    try {
      definirArmazenamentoParaTestes(null);
      expect(obterArmazenamento()).toBeInstanceOf(ArmazenamentoS3);
    } finally {
      vi.unstubAllEnvs();
      definirArmazenamentoParaTestes(null);
    }
  });
});
```

Rode: `npm test -- src/modules/midia/armazenamento`
Esperado: FAIL (`armazenamento-s3` não existe; o provedor `s3` ainda lança).

- [ ] **Passo 3: Implementar o ArmazenamentoS3 e ligá-lo à escolha do provedor**

`src/modules/midia/armazenamento-s3.ts`:

```ts
import type { Readable } from 'node:stream';
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { ArmazenamentoArquivos } from './armazenamento';
import { validarChave } from './chaves';
import { ErroArquivoNaoEncontrado } from './erros';

export type ConfigS3 = { endpoint: string; regiao: string; bucket: string; chaveId: string; chaveSecreta: string };

/**
 * B2 e R2 falam a API do S3. Checksums só quando exigidos: as versões novas do SDK mandam CRC32 por padrão,
 * e alguns serviços compatíveis recusam (pesquisa §7.2). Caminho no estilo /bucket/chave, aceito pelos dois.
 */
export function criarClienteS3(c: ConfigS3): S3Client {
  return new S3Client({
    endpoint: c.endpoint,
    region: c.regiao,
    credentials: { accessKeyId: c.chaveId, secretAccessKey: c.chaveSecreta },
    forcePathStyle: true,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
}

/** Conteúdo sem tamanho conhecido (XML, PDF) é juntado em memória; mídia grande sempre chega com o tamanho. */
const LIMITE_SEM_TAMANHO = 50 * 1024 * 1024;

async function lerTudo(conteudo: Readable): Promise<Buffer> {
  const partes: Buffer[] = [];
  let total = 0;
  for await (const parte of conteudo) {
    const b = Buffer.from(parte);
    total += b.length;
    if (total > LIMITE_SEM_TAMANHO) throw new Error('Arquivo grande demais para gravar sem o tamanho.');
    partes.push(b);
  }
  return Buffer.concat(partes);
}

function naoExiste(erro: unknown): boolean {
  const e = erro as { name?: string; $metadata?: { httpStatusCode?: number } } | null;
  return e?.name === 'NoSuchKey' || e?.name === 'NotFound' || e?.$metadata?.httpStatusCode === 404;
}

export class ArmazenamentoS3 implements ArmazenamentoArquivos {
  readonly provedor = 's3';

  constructor(
    private readonly cliente: S3Client,
    private readonly bucket: string,
  ) {}

  async salvar(chave: string, conteudo: Readable, opcoes: { tipoConteudo?: string; tamanho?: number } = {}): Promise<void> {
    validarChave(chave);
    const corpo = opcoes.tamanho === undefined ? await lerTudo(conteudo) : conteudo;
    await this.cliente.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: chave,
        Body: corpo,
        ContentType: opcoes.tipoConteudo,
        ContentLength: opcoes.tamanho ?? (corpo as Buffer).length,
      }),
    );
  }

  async ler(chave: string): Promise<Readable> {
    validarChave(chave);
    try {
      const r = await this.cliente.send(new GetObjectCommand({ Bucket: this.bucket, Key: chave }));
      if (!r.Body) throw new ErroArquivoNaoEncontrado(chave);
      return r.Body as unknown as Readable;
    } catch (erro) {
      if (naoExiste(erro)) throw new ErroArquivoNaoEncontrado(chave);
      throw erro;
    }
  }

  /** Link assinado (presigned GET): o navegador baixa direto do B2/R2, sem passar pela VPS. */
  async urlTemporaria(chave: string, segundos: number): Promise<string> {
    validarChave(chave);
    return getSignedUrl(this.cliente, new GetObjectCommand({ Bucket: this.bucket, Key: chave }), { expiresIn: segundos });
  }

  async apagar(chave: string): Promise<void> {
    validarChave(chave);
    await this.cliente.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: chave }));
  }

  async existe(chave: string): Promise<boolean> {
    validarChave(chave);
    try {
      await this.cliente.send(new HeadObjectCommand({ Bucket: this.bucket, Key: chave }));
      return true;
    } catch (erro) {
      if (naoExiste(erro)) return false;
      throw erro;
    }
  }
}
```

Em `src/modules/midia/armazenamento.ts`:

1. Acrescente o import:

```ts
import { ArmazenamentoS3, criarClienteS3 } from './armazenamento-s3';
```

2. Troque a linha `else throw new Error(\`Provedor de armazenamento não disponível: ${provedor}\`);` por:

```ts
  else if (provedor === 's3') {
    const env = lerEnv();
    if (!env.S3_ENDPOINT || !env.S3_REGIAO || !env.S3_BUCKET || !env.S3_CHAVE_ID || !env.S3_CHAVE_SECRETA) {
      throw new Error('Há mídias no S3, mas as variáveis S3_* não estão configuradas.');
    }
    criado = new ArmazenamentoS3(
      criarClienteS3({
        endpoint: env.S3_ENDPOINT,
        regiao: env.S3_REGIAO,
        bucket: env.S3_BUCKET,
        chaveId: env.S3_CHAVE_ID,
        chaveSecreta: env.S3_CHAVE_SECRETA,
      }),
      env.S3_BUCKET,
    );
  } else throw new Error(`Provedor de armazenamento não disponível: ${provedor}`);
```

> Com `ARMAZENAMENTO=s3` o `lerEnv` já exige as cinco variáveis; a conferência acima cobre o caso de ler uma mídia antiga do S3 depois de voltar para `disco`.

Rode: `npm test -- src/modules/midia && npm run typecheck`
Esperado: PASS.

- [ ] **Passo 4: Verificar e commitar**

```bash
cd "/c/Users/idmpc/devolucoes-wt/fase-2"
npm test && npm run test:int && npm run lint && npm run build:scripts
git add package.json package-lock.json src/modules/midia
git commit -m "feat: armazenamento S3 (Backblaze B2 ou Cloudflare R2) com links assinados de 10 minutos" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 16: Celular: compressão da foto, fila offline (IndexedDB) e envio tus

**Por que assim:** spec §9: a foto é comprimida no celular (JPEG, ~1600 px, ~400 KB); o upload retoma; sem internet, os arquivos ficam no aparelho (IndexedDB) e sobem quando a conexão volta. A fila guarda o arquivo **antes** de enviar e só o tira depois que o servidor confirma o registro (pesquisa §4). A lógica da fila não conhece o IndexedDB nem o tus (recebe um "armazém" e um "transporte"), então é testada sem navegador.

**Arquivos:**
- Modificar: `package.json`, `package-lock.json`
- Criar: `src/components/midia/comprimirFoto.ts`, `idCliente.ts`, `filaEnvios.ts`, `armazemIndexedDb.ts`, `transporteTus.ts`, `useFilaEnvios.ts`
- Testes: `src/components/midia/comprimirFoto.test.ts`, `idCliente.test.ts`, `filaEnvios.test.ts`, `transporteTus.test.ts`

**Interfaces:**
- Consome: `registrarEnvioAcao`, `ResultadoRegistro` (Tarefa 12); `TipoEvidencia` (Tarefa 2).
- Produz:
  - `LADO_MAIOR_FOTO = 1600`, `dimensoesAlvo(largura, altura, ladoMaior?)`, `comprimirFoto(arquivo: Blob): Promise<Blob>`
  - `novoIdCliente(): string`, `uuidDeBytes(b: Uint8Array): string`
  - em `filaEnvios.ts`: `type EstadoEnvio = 'pendente' | 'enviando' | 'erro'`, `type RegistroEnvio`, `type NovoEnvio`, `interface ArmazemFila { listar(); gravar(r); apagar(idCliente) }`, `class ArmazemMemoria`, `type ResultadoTransporte`, `type Transporte`, `type EnvioConcluido = { idCliente; devolucaoId; itemId; tipo; evidenciaId }`, `proximaEspera(tentativas, sorteio?)`, `class FilaEnvios` (`adicionar`, `processar(forcar?)`, `tentarDeNovo`, `descartar`, `listar`, `aoMudar`, `aoConcluir`)
  - `armazemIndexedDb(): ArmazemFila` (banco `devolucoes-envios`, store `envios`)
  - `ENDPOINT_TUS = '/api/midia'`, `TAMANHO_PEDACO = 5 MB`, `idDoEnvio(url)`, `resultadoDoErro(status, corpo)`, `criarTransporteTus(registrar): Transporte`
  - `useFilaEnvios(devolucaoId, aoConcluir?)` → `{ envios: RegistroEnvio[]; concluidos: EnvioConcluido[]; adicionar(novo: Omit<NovoEnvio, 'devolucaoId'>): Promise<void>; tentarDeNovo(id); descartar(id) }`

- [ ] **Passo 1: Instalar o cliente tus e o idb-keyval**

```bash
cd "/c/Users/idmpc/devolucoes-wt/fase-2"
npm install --save-exact tus-js-client@4.3.1 idb-keyval@6.3.0
grep -n "onUploadUrlAvailable\|storeFingerprintForResuming\|onShouldRetry" node_modules/tus-js-client/lib/index.d.ts
grep -n "export declare function \(createStore\|values\|set\|del\)" node_modules/idb-keyval/dist/index.d.ts
```

Esperado: as opções e funções usadas abaixo aparecem nos `.d.ts`.

- [ ] **Passo 2: Escrever os testes que falham**

`src/components/midia/comprimirFoto.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { dimensoesAlvo } from './comprimirFoto';

describe('dimensoesAlvo (spec §9: ~1600 px no maior lado)', () => {
  it('reduz mantendo a proporção, deitada ou em pé', () => {
    expect(dimensoesAlvo(4000, 3000)).toEqual({ largura: 1600, altura: 1200 });
    expect(dimensoesAlvo(3024, 4032)).toEqual({ largura: 1200, altura: 1600 });
  });

  it('não amplia foto pequena', () => {
    expect(dimensoesAlvo(800, 600)).toEqual({ largura: 800, altura: 600 });
  });
});
```

`src/components/midia/idCliente.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { novoIdCliente, uuidDeBytes } from './idCliente';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('id do envio (idempotência no servidor)', () => {
  it('é um UUID v4', () => {
    expect(novoIdCliente()).toMatch(UUID_V4);
  });

  it('sem crypto.randomUUID (HTTP fora de localhost), monta o UUID v4 dos bytes', () => {
    expect(uuidDeBytes(new Uint8Array(16).fill(0xff))).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
  });
});
```

`src/components/midia/filaEnvios.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ArmazemMemoria, FilaEnvios, proximaEspera, type NovoEnvio, type ResultadoTransporte, type Transporte } from './filaEnvios';

function novo(idCliente: string): NovoEnvio {
  return { idCliente, devolucaoId: 'd1', itemId: null, tipo: 'FOTO_1_ETIQUETA', nome: 'foto.jpg', tipoConteudo: 'image/jpeg', arquivo: new Blob(['abc']) };
}

/** Responde na ordem da lista (depois, sucesso) e anota cada chamada. */
function transporteDe(respostas: (ResultadoTransporte | Error)[]) {
  const chamadas: { idCliente: string; uploadUrl: string | null }[] = [];
  const transporte: Transporte = async (r, eventos) => {
    chamadas.push({ idCliente: r.idCliente, uploadUrl: r.uploadUrl });
    eventos.aoUrl(`/api/midia/${r.idCliente}`);
    eventos.aoProgresso(1);
    const resposta = respostas.shift() ?? { ok: true, evidenciaId: `ev-${r.idCliente}` };
    if (resposta instanceof Error) throw resposta;
    return resposta;
  };
  return { transporte, chamadas };
}

describe('FilaEnvios (spec §9: os arquivos pendentes ficam no aparelho)', () => {
  it('guarda antes de enviar e só tira depois que o servidor confirma', async () => {
    let liberar!: (r: ResultadoTransporte) => void;
    const armazem = new ArmazemMemoria();
    const fila = new FilaEnvios(armazem, () => new Promise<ResultadoTransporte>((ok) => (liberar = ok)));
    const concluidos: string[] = [];
    fila.aoConcluir((e) => concluidos.push(e.evidenciaId));
    await fila.adicionar(novo('a'));
    await expect.poll(async () => (await armazem.listar()).map((r) => r.estado)).toEqual(['enviando']);
    liberar({ ok: true, evidenciaId: 'ev-a' });
    await fila.processar();
    expect(await armazem.listar()).toEqual([]);
    expect(concluidos).toEqual(['ev-a']);
  });

  it('falha de rede: fica pendente, espera e continua o mesmo upload', async () => {
    let agora = 1_000_000;
    const armazem = new ArmazemMemoria();
    const { transporte, chamadas } = transporteDe([{ ok: false, definitivo: false, mensagem: 'Sem conexão' }]);
    const fila = new FilaEnvios(armazem, transporte, () => agora, () => 0.5);
    await fila.adicionar(novo('a'));
    await fila.processar();
    expect((await armazem.listar())[0]).toMatchObject({
      estado: 'pendente',
      tentativas: 1,
      mensagem: 'Sem conexão',
      uploadUrl: '/api/midia/a',
      proximaTentativaEm: agora + 2000,
    });
    await fila.processar();
    expect(chamadas).toHaveLength(1); // antes da hora, não tenta
    agora += 2000;
    await fila.processar();
    expect(chamadas).toEqual([
      { idCliente: 'a', uploadUrl: null },
      { idCliente: 'a', uploadUrl: '/api/midia/a' },
    ]);
    expect(await armazem.listar()).toEqual([]);
  });

  it('a volta da rede (forçar) tenta na hora, mesmo antes do prazo', async () => {
    const armazem = new ArmazemMemoria();
    const { transporte, chamadas } = transporteDe([new Error('Failed to fetch')]);
    const fila = new FilaEnvios(armazem, transporte);
    await fila.adicionar(novo('a'));
    await fila.processar();
    expect((await armazem.listar())[0]).toMatchObject({ estado: 'pendente', mensagem: 'Sem conexão com o servidor. Tentando de novo…' });
    await fila.processar(true);
    expect(chamadas).toHaveLength(2);
    expect(await armazem.listar()).toEqual([]);
  });

  it('recusa definitiva: fica com erro e não tenta sozinha; "Tentar de novo" envia', async () => {
    const armazem = new ArmazemMemoria();
    const { transporte, chamadas } = transporteDe([{ ok: false, definitivo: true, mensagem: 'Foto grande demais (máximo 15 MB).' }]);
    const fila = new FilaEnvios(armazem, transporte);
    await fila.adicionar(novo('a'));
    await fila.processar();
    expect((await armazem.listar())[0]).toMatchObject({ estado: 'erro', mensagem: 'Foto grande demais (máximo 15 MB).' });
    await fila.processar(true);
    expect(chamadas).toHaveLength(1);
    await fila.tentarDeNovo('a');
    expect(chamadas).toHaveLength(2);
    expect(await armazem.listar()).toEqual([]);
  });

  it('chamadas ao mesmo tempo não enviam duas vezes; descartar tira da fila', async () => {
    const armazem = new ArmazemMemoria();
    const { transporte, chamadas } = transporteDe([{ ok: false, definitivo: true, mensagem: 'x' }]);
    const fila = new FilaEnvios(armazem, transporte);
    await fila.adicionar(novo('a'));
    await Promise.all([fila.processar(true), fila.processar(true), fila.processar()]);
    expect(chamadas).toHaveLength(1);
    await fila.descartar('a');
    expect(await armazem.listar()).toEqual([]);
  });
});

describe('proximaEspera (espera crescente com sorteio, até 5 min)', () => {
  it('2 s, 4 s, 8 s... com ±20%', () => {
    expect(proximaEspera(1, 0.5)).toBe(2000);
    expect(proximaEspera(2, 0.5)).toBe(4000);
    expect(proximaEspera(1, 0)).toBe(1600);
    expect(proximaEspera(1, 1)).toBe(2400);
    expect(proximaEspera(30, 0.5)).toBe(300_000);
  });
});
```

`src/components/midia/transporteTus.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { idDoEnvio, resultadoDoErro } from './transporteTus';

describe('transporte tus', () => {
  it('o id do upload é o último pedaço da URL', () => {
    expect(idDoEnvio('/api/midia/0123456789abcdef0123456789abcdef')).toBe('0123456789abcdef0123456789abcdef');
    expect(idDoEnvio('https://x.com/api/midia/abc?y=1')).toBe('abc');
  });

  it('rede, 5xx, 423 e 429 são passageiros; 401 pede login; o resto mostra a mensagem do servidor', () => {
    for (const status of [null, 0, 500, 503, 423, 429]) expect(resultadoDoErro(status, '')).toMatchObject({ ok: false, definitivo: false });
    expect(resultadoDoErro(401, '')).toEqual({ ok: false, definitivo: true, mensagem: 'Sua sessão terminou. Entre no sistema de novo e toque em "Tentar de novo".' });
    expect(resultadoDoErro(413, 'Foto grande demais (máximo 15 MB).\n')).toEqual({ ok: false, definitivo: true, mensagem: 'Foto grande demais (máximo 15 MB).' });
    expect(resultadoDoErro(400, '')).toEqual({ ok: false, definitivo: true, mensagem: 'O servidor recusou o arquivo (erro 400).' });
  });
});
```

Rode: `npm test -- src/components/midia`
Esperado: FAIL (os módulos não existem).

- [ ] **Passo 3: Implementar compressão, id e a fila**

`src/components/midia/comprimirFoto.ts`:

```ts
/** Spec §9: JPEG com cerca de 1600 px no maior lado e ~400 KB, feito no celular antes do envio. */
export const LADO_MAIOR_FOTO = 1600;

export function dimensoesAlvo(largura: number, altura: number, ladoMaior = LADO_MAIOR_FOTO): { largura: number; altura: number } {
  const escala = Math.min(1, ladoMaior / Math.max(largura, altura));
  return { largura: Math.max(1, Math.round(largura * escala)), altura: Math.max(1, Math.round(altura * escala)) };
}

async function paraJpeg(canvas: OffscreenCanvas | HTMLCanvasElement, qualidade: number): Promise<Blob> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type: 'image/jpeg', quality: qualidade });
  return new Promise((ok, falha) => canvas.toBlob((b) => (b ? ok(b) : falha(new Error('toBlob falhou'))), 'image/jpeg', qualidade));
}

/**
 * createImageBitmap aplica a orientação do EXIF ('from-image') e já reduz a imagem (sem desenhar 48 MP no canvas do
 * iPhone); o JPEG que sai do canvas não tem EXIF (sem GPS). Pesquisa §2.
 */
export async function comprimirFoto(arquivo: Blob): Promise<Blob> {
  const original = await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
  const alvo = dimensoesAlvo(original.width, original.height);
  original.close();
  const bitmap = await createImageBitmap(arquivo, {
    imageOrientation: 'from-image',
    resizeWidth: alvo.largura,
    resizeHeight: alvo.altura,
    resizeQuality: 'high',
  });
  const canvas: OffscreenCanvas | HTMLCanvasElement =
    typeof OffscreenCanvas === 'function'
      ? new OffscreenCanvas(alvo.largura, alvo.altura)
      : Object.assign(document.createElement('canvas'), { width: alvo.largura, height: alvo.altura });
  const contexto = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
  if (!contexto) throw new Error('Este navegador não consegue preparar a foto.');
  contexto.drawImage(bitmap, 0, 0);
  bitmap.close();
  const foto = await paraJpeg(canvas, 0.8);
  return foto.size > 600_000 ? paraJpeg(canvas, 0.7) : foto;
}
```

`src/components/midia/idCliente.ts`:

```ts
/** Monta um UUID v4 a partir de 16 bytes aleatórios. */
export function uuidDeBytes(b: Uint8Array): string {
  const bytes = Uint8Array.from(b);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = Array.from(bytes, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** Id do envio (o servidor não grava o mesmo duas vezes). crypto.randomUUID só existe em HTTPS ou localhost. */
export function novoIdCliente(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return uuidDeBytes(crypto.getRandomValues(new Uint8Array(16)));
}
```

`src/components/midia/filaEnvios.ts`:

```ts
import type { TipoEvidencia } from '@/modules/midia/dominio';

export type EstadoEnvio = 'pendente' | 'enviando' | 'erro';

export type RegistroEnvio = {
  idCliente: string;
  devolucaoId: string;
  itemId: string | null;
  tipo: TipoEvidencia;
  nome: string;
  tipoConteudo: string;
  tamanho: number;
  arquivo: Blob;
  criadoEm: number;
  tentativas: number;
  proximaTentativaEm: number;
  estado: EstadoEnvio;
  /** URL do upload no tus: com ela o envio continua de onde parou. */
  uploadUrl: string | null;
  mensagem: string | null;
  /** 0 a 1, só enquanto envia (fica em memória). */
  progresso: number;
};

export type NovoEnvio = Pick<RegistroEnvio, 'idCliente' | 'devolucaoId' | 'itemId' | 'tipo' | 'nome' | 'tipoConteudo' | 'arquivo'>;

export interface ArmazemFila {
  listar(): Promise<RegistroEnvio[]>;
  gravar(r: RegistroEnvio): Promise<void>;
  apagar(idCliente: string): Promise<void>;
}

/** Para os testes. */
export class ArmazemMemoria implements ArmazemFila {
  private readonly registros = new Map<string, RegistroEnvio>();
  async listar() {
    return [...this.registros.values()];
  }
  async gravar(r: RegistroEnvio) {
    this.registros.set(r.idCliente, r);
  }
  async apagar(idCliente: string) {
    this.registros.delete(idCliente);
  }
}

export type ResultadoTransporte = { ok: true; evidenciaId: string } | { ok: false; definitivo: boolean; mensagem: string };
export type Transporte = (r: RegistroEnvio, eventos: { aoProgresso(fracao: number): void; aoUrl(url: string): void }) => Promise<ResultadoTransporte>;
export type EnvioConcluido = { idCliente: string; devolucaoId: string; itemId: string | null; tipo: TipoEvidencia; evidenciaId: string };

const SEM_CONEXAO = 'Sem conexão com o servidor. Tentando de novo…';

/** 2 s, 4 s, 8 s... até 5 min, com ±20% de sorteio para os celulares não tentarem todos juntos (pesquisa §4). */
export function proximaEspera(tentativas: number, sorteio: number = Math.random()): number {
  const base = Math.min(5 * 60_000, 2000 * 2 ** Math.max(0, tentativas - 1));
  return Math.round(base * (0.8 + 0.4 * sorteio));
}

/**
 * Fila de envios do aparelho. Um envio por vez, do mais antigo para o mais novo. Falha passageira (rede, 5xx):
 * espera crescente e para a rodada (sem rede, não adianta tentar os outros). Recusa definitiva: fica com erro até
 * a pessoa tocar "Tentar de novo" ou tirar de novo.
 */
export class FilaEnvios {
  private rodada: Promise<void> | null = null;
  private forcarDeNovo = false;
  private readonly progresso = new Map<string, number>();
  /** O IndexedDB devolve um Blob novo a cada leitura; guardar o primeiro evita recriar a miniatura a cada atualização. */
  private readonly arquivos = new Map<string, Blob>();
  private readonly ouvintes = new Set<() => void>();
  private readonly ouvintesConcluidos = new Set<(e: EnvioConcluido) => void>();

  constructor(
    private readonly armazem: ArmazemFila,
    private readonly transporte: Transporte,
    private readonly relogio: () => number = Date.now,
    private readonly sorteio: () => number = Math.random,
  ) {}

  aoMudar(f: () => void): () => void {
    this.ouvintes.add(f);
    return () => this.ouvintes.delete(f);
  }

  aoConcluir(f: (e: EnvioConcluido) => void): () => void {
    this.ouvintesConcluidos.add(f);
    return () => this.ouvintesConcluidos.delete(f);
  }

  private avisar() {
    for (const f of this.ouvintes) f();
  }

  async listar(): Promise<RegistroEnvio[]> {
    const lista = await this.armazem.listar();
    return lista
      .map((r) => {
        const arquivo = this.arquivos.get(r.idCliente) ?? r.arquivo;
        this.arquivos.set(r.idCliente, arquivo);
        return { ...r, arquivo, progresso: this.progresso.get(r.idCliente) ?? r.progresso };
      })
      .sort((a, b) => a.criadoEm - b.criadoEm);
  }

  /** Grava no aparelho primeiro; depois tenta enviar. */
  async adicionar(novo: NovoEnvio): Promise<void> {
    await this.armazem.gravar({
      ...novo,
      tamanho: novo.arquivo.size,
      criadoEm: this.relogio(),
      tentativas: 0,
      proximaTentativaEm: 0,
      estado: 'pendente',
      uploadUrl: null,
      mensagem: null,
      progresso: 0,
    });
    this.avisar();
    void this.processar();
  }

  /** `forcar`: tenta na hora o que está esperando (a rede voltou). Se já há uma rodada, devolve a mesma. */
  processar(forcar = false): Promise<void> {
    if (this.rodada) {
      if (forcar) this.forcarDeNovo = true;
      return this.rodada;
    }
    this.rodada = (async () => {
      try {
        let f = forcar;
        do {
          this.forcarDeNovo = false;
          await this.rodar(f);
          f = true;
        } while (this.forcarDeNovo);
      } finally {
        this.rodada = null;
      }
    })();
    return this.rodada;
  }

  private async rodar(forcar: boolean): Promise<void> {
    const enviados = new Set<string>();
    for (;;) {
      const agora = this.relogio();
      const proximo = (await this.listar()).find(
        (r) => r.estado !== 'erro' && !enviados.has(r.idCliente) && (forcar || r.proximaTentativaEm <= agora),
      );
      if (!proximo) return;
      enviados.add(proximo.idCliente);
      if (!(await this.enviar(proximo))) return;
    }
  }

  /** true = pode seguir para o próximo; false = falha passageira (para a rodada). */
  private async enviar(r: RegistroEnvio): Promise<boolean> {
    let uploadUrl = r.uploadUrl;
    await this.armazem.gravar({ ...r, estado: 'enviando', mensagem: null, progresso: 0 });
    this.avisar();
    let resultado: ResultadoTransporte;
    try {
      resultado = await this.transporte(
        { ...r, estado: 'enviando' },
        {
          aoProgresso: (fracao) => {
            this.progresso.set(r.idCliente, fracao);
            this.avisar();
          },
          aoUrl: (url) => {
            uploadUrl = url;
            void this.armazem.gravar({ ...r, estado: 'enviando', uploadUrl: url, mensagem: null, progresso: 0 });
          },
        },
      );
    } catch {
      resultado = { ok: false, definitivo: false, mensagem: SEM_CONEXAO };
    }
    this.progresso.delete(r.idCliente);
    if (resultado.ok) {
      await this.armazem.apagar(r.idCliente);
      this.arquivos.delete(r.idCliente);
      this.avisar();
      const concluido = { idCliente: r.idCliente, devolucaoId: r.devolucaoId, itemId: r.itemId, tipo: r.tipo, evidenciaId: resultado.evidenciaId };
      for (const f of this.ouvintesConcluidos) f(concluido);
      return true;
    }
    if (resultado.definitivo) {
      await this.armazem.gravar({ ...r, estado: 'erro', uploadUrl, mensagem: resultado.mensagem, progresso: 0 });
      this.avisar();
      return true;
    }
    const tentativas = r.tentativas + 1;
    await this.armazem.gravar({
      ...r,
      estado: 'pendente',
      uploadUrl,
      tentativas,
      proximaTentativaEm: this.relogio() + proximaEspera(tentativas, this.sorteio()),
      mensagem: resultado.mensagem,
      progresso: 0,
    });
    this.avisar();
    return false;
  }

  async tentarDeNovo(idCliente: string): Promise<void> {
    const r = (await this.armazem.listar()).find((x) => x.idCliente === idCliente);
    if (!r) return;
    await this.armazem.gravar({ ...r, estado: 'pendente', proximaTentativaEm: 0, mensagem: null });
    this.avisar();
    await this.processar(true);
  }

  async descartar(idCliente: string): Promise<void> {
    await this.armazem.apagar(idCliente);
    this.arquivos.delete(idCliente);
    this.avisar();
  }
}
```

`src/components/midia/armazemIndexedDb.ts`:

```ts
import { createStore, del, set, values, type UseStore } from 'idb-keyval';
import type { ArmazemFila, RegistroEnvio } from './filaEnvios';

let loja: UseStore | null = null;

/** Banco próprio no IndexedDB do aparelho; o Blob da foto ou do vídeo é guardado junto (clone estruturado). */
function obterLoja(): UseStore {
  loja ??= createStore('devolucoes-envios', 'envios');
  return loja;
}

export function armazemIndexedDb(): ArmazemFila {
  return {
    listar: () => values<RegistroEnvio>(obterLoja()),
    gravar: (r) => set(r.idCliente, r, obterLoja()),
    apagar: (idCliente) => del(idCliente, obterLoja()),
  };
}
```

`src/components/midia/transporteTus.ts`:

```ts
import { Upload } from 'tus-js-client';
import type { ResultadoRegistro } from '@/modules/midia/acoes';
import type { ResultadoTransporte, Transporte } from './filaEnvios';

export const ENDPOINT_TUS = '/api/midia';
/** Pedaços de 5 MB: cabem no limite do nginx (12 MB) e uma queda perde no máximo um pedaço. */
export const TAMANHO_PEDACO = 5 * 1024 * 1024;

const SEM_CONEXAO = 'Sem conexão com o servidor. Tentando de novo…';

export function idDoEnvio(url: string): string {
  return url.split('?')[0].split('/').filter(Boolean).pop() ?? '';
}

/** Rede, 5xx, 423 (trava do tus) e 429: passageiros. O resto é definitivo e mostra a mensagem do servidor. */
export function resultadoDoErro(status: number | null, corpo: string): ResultadoTransporte {
  if (status === null || status === 0 || status >= 500 || status === 423 || status === 429) {
    return { ok: false, definitivo: false, mensagem: SEM_CONEXAO };
  }
  if (status === 401) {
    return { ok: false, definitivo: true, mensagem: 'Sua sessão terminou. Entre no sistema de novo e toque em "Tentar de novo".' };
  }
  const texto = corpo.trim();
  return { ok: false, definitivo: true, mensagem: texto && texto.length < 300 ? texto : `O servidor recusou o arquivo (erro ${status}).` };
}

/** Envia pelo tus (retoma pela uploadUrl guardada) e, no fim, pede o registro da evidência ao servidor. */
export function criarTransporteTus(registrar: (uploadId: string) => Promise<ResultadoRegistro>): Transporte {
  return (r, eventos) =>
    new Promise<ResultadoTransporte>((resolver) => {
      const upload = new Upload(r.arquivo, {
        endpoint: ENDPOINT_TUS,
        uploadUrl: r.uploadUrl,
        chunkSize: TAMANHO_PEDACO,
        retryDelays: [0, 1000, 3000],
        // A uploadUrl fica no IndexedDB, junto do arquivo; o tus não precisa guardar nada no localStorage.
        storeFingerprintForResuming: false,
        metadata: {
          idCliente: r.idCliente,
          devolucaoId: r.devolucaoId,
          tipo: r.tipo,
          tipoConteudo: r.tipoConteudo,
          nome: r.nome,
          ...(r.itemId ? { itemId: r.itemId } : {}),
        },
        onUploadUrlAvailable() {
          if (upload.url) eventos.aoUrl(upload.url);
        },
        onProgress(enviados, total) {
          eventos.aoProgresso(total > 0 ? enviados / total : 0);
        },
        onShouldRetry(erro) {
          const status = erro.originalResponse?.getStatus() ?? 0;
          return status === 0 || status >= 500 || status === 423;
        },
        onError(erro) {
          const resposta = 'originalResponse' in erro ? erro.originalResponse : null;
          resolver(resultadoDoErro(resposta ? resposta.getStatus() : null, resposta ? resposta.getBody() : ''));
        },
        async onSuccess() {
          try {
            const reg = await registrar(idDoEnvio(upload.url ?? ''));
            resolver(reg.ok ? { ok: true, evidenciaId: reg.evidenciaId } : { ok: false, definitivo: reg.definitivo, mensagem: reg.mensagem });
          } catch {
            resolver({ ok: false, definitivo: false, mensagem: SEM_CONEXAO });
          }
        },
      });
      upload.start();
    });
}
```

`src/components/midia/useFilaEnvios.ts`:

```ts
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { registrarEnvioAcao } from '@/modules/midia/acoes';
import { armazemIndexedDb } from './armazemIndexedDb';
import { FilaEnvios, type EnvioConcluido, type NovoEnvio, type RegistroEnvio } from './filaEnvios';
import { criarTransporteTus } from './transporteTus';

let filaDoAparelho: FilaEnvios | null = null;

/** Uma fila só no aparelho (todas as telas usam a mesma, e ela continua de uma tela para a outra). */
function fila(): FilaEnvios {
  filaDoAparelho ??= new FilaEnvios(armazemIndexedDb(), criarTransporteTus(registrarEnvioAcao));
  return filaDoAparelho;
}

/**
 * Envios de uma devolução. Tenta de novo ao abrir a tela, quando a rede volta, quando o app volta ao primeiro
 * plano e a cada 2 s (só o que já passou da espera). O iPhone não envia com o app fechado (pesquisa §4).
 */
export function useFilaEnvios(devolucaoId: string, aoConcluir?: (e: EnvioConcluido) => void) {
  const [envios, setEnvios] = useState<RegistroEnvio[]>([]);
  const [concluidos, setConcluidos] = useState<EnvioConcluido[]>([]);
  const aoConcluirRef = useRef(aoConcluir);
  useEffect(() => {
    aoConcluirRef.current = aoConcluir;
  }, [aoConcluir]);

  useEffect(() => {
    const f = fila();
    let viva = true;
    const atualizar = () => {
      void f.listar().then((lista) => {
        if (viva) setEnvios(lista.filter((r) => r.devolucaoId === devolucaoId));
      });
    };
    const pararMudar = f.aoMudar(atualizar);
    const pararConcluir = f.aoConcluir((e) => {
      if (e.devolucaoId !== devolucaoId) return;
      setConcluidos((lista) => [...lista.filter((x) => !(x.tipo === e.tipo && x.itemId === e.itemId)), e]);
      aoConcluirRef.current?.(e);
    });
    const tentar = () => void f.processar();
    const voltouARede = () => void f.processar(true);
    const voltouAoApp = () => {
      if (document.visibilityState === 'visible') tentar();
    };
    window.addEventListener('online', voltouARede);
    document.addEventListener('visibilitychange', voltouAoApp);
    const relogio = window.setInterval(tentar, 2000);
    // Pede ao navegador para não apagar o IndexedDB quando faltar espaço (pesquisa §4).
    void navigator.storage?.persist?.().catch(() => false);
    atualizar();
    tentar();
    return () => {
      viva = false;
      pararMudar();
      pararConcluir();
      window.removeEventListener('online', voltouARede);
      document.removeEventListener('visibilitychange', voltouAoApp);
      window.clearInterval(relogio);
    };
  }, [devolucaoId]);

  const adicionar = useCallback((novo: Omit<NovoEnvio, 'devolucaoId'>) => fila().adicionar({ ...novo, devolucaoId }), [devolucaoId]);
  const tentarDeNovo = useCallback((idCliente: string) => fila().tentarDeNovo(idCliente), []);
  const descartar = useCallback((idCliente: string) => fila().descartar(idCliente), []);
  return { envios, concluidos, adicionar, tentarDeNovo, descartar };
}
```

Rode: `npm test -- src/components/midia && npm run typecheck && npm run lint`
Esperado: PASS. Se o TypeScript reclamar das opções de `createImageBitmap` (`resizeQuality`) ou do `OffscreenCanvas`, confira `node_modules/typescript/lib/lib.dom.d.ts` e ajuste só o tipo (o comportamento é o da pesquisa §2).

- [ ] **Passo 4: Commitar**

```bash
cd "/c/Users/idmpc/devolucoes-wt/fase-2"
git add package.json package-lock.json src/components/midia
git commit -m "feat: celular comprime a foto, guarda os envios no IndexedDB e envia pelo tus com retomada e espera crescente" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 17: Peças da tela da conferência (vagas das evidências, progresso, leitor do código, passos)

**Por que assim:** spec §6.0 ("Conferência no celular"): cabeçalho com o progresso em segmentos; cartão do produto com a checagem do EAN; grade das Fotos 1 a 4 com ✓ e a próxima vaga tracejada; Vídeo de Prova logo abaixo; botão fixo no rodapé. Cada vaga mostra o estado do envio (com barra de progresso) e tem um botão grande que abre a câmera do celular. As peças ficam em `src/components/conferencia/` (componentes novos de área, contrato §3) e são testadas com Testing Library.

**Arquivos:**
- Criar: `src/components/conferencia/estadoSlot.ts`, `SlotEvidencia.tsx`, `ProgressoSegmentos.tsx`, `LeitorCodigo.tsx`, `passos.ts`, `tipos.ts`
- Testes: `src/components/conferencia/estadoSlot.test.ts`, `passos.test.ts`, `SlotEvidencia.test.tsx`, `ProgressoSegmentos.test.tsx`

**Interfaces:**
- Consome: `RegistroEnvio`, `EnvioConcluido` (Tarefa 16); `EvidenciaRegra`, `Decisao` (Tarefas 10 e 11); `useLeitorCamera` (Fase 1); estilos.
- Produz:
  - em `estadoSlot.ts`: `type EvidenciaServidor = { id; tipo; itemId; situacao; url: string | null; erro: string | null }`, `type EstadoSlot` (`vazio`, `enviando`, `aguardando`, `nao_enviada`, `enviada`, `falhou`), `estadoDoSlot(vaga, { envios, concluidos, evidencias })`, `textoDoSlot(e)`, `evidenciasQueContam(evidencias, concluidos): EvidenciaRegra[]`
  - `SlotEvidencia({ titulo, descricao, estado, video?, aoEscolher, aoTentarDeNovo })` (um `role="group"` com o nome da evidência), `BotaoArquivo`, `BarraProgresso`
  - `ProgressoSegmentos({ passos, atual, completos })`
  - `LeitorCodigo({ rotulo, titulo, aoLer, instrucao? })`: câmera em tela cheia, fecha na primeira leitura
  - em `passos.ts`: `type Passo`, `montarPassos(itens)`, `passoCompleto(passo, contexto)`
  - em `tipos.ts`: `type RespostaAcao<T = object> = ({ ok: true } & T) | { ok: false; erros: string[] }`

- [ ] **Passo 1: Escrever os testes que falham**

`src/components/conferencia/estadoSlot.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { EnvioConcluido, RegistroEnvio } from '@/components/midia/filaEnvios';
import { estadoDoSlot, evidenciasQueContam, textoDoSlot, type EvidenciaServidor } from './estadoSlot';

const VAGA = { tipo: 'FOTO_1_ETIQUETA' as const, itemId: null };

function envio(extra: Partial<RegistroEnvio>): RegistroEnvio {
  return {
    idCliente: 'c1', devolucaoId: 'd1', itemId: null, tipo: 'FOTO_1_ETIQUETA', nome: 'f.jpg', tipoConteudo: 'image/jpeg', tamanho: 3,
    arquivo: new Blob(['abc']), criadoEm: 1, tentativas: 0, proximaTentativaEm: 0, estado: 'pendente', uploadUrl: null, mensagem: null, progresso: 0,
    ...extra,
  };
}
const servidor = (extra: Partial<EvidenciaServidor>): EvidenciaServidor => ({ id: 'e1', tipo: 'FOTO_1_ETIQUETA', itemId: null, situacao: 'RECEBIDA', url: null, erro: null, ...extra });
const nada = { envios: [], concluidos: [], evidencias: [] };

describe('estadoDoSlot', () => {
  it('vazia, enviando com progresso, aguardando conexão e não enviada', () => {
    expect(estadoDoSlot(VAGA, nada)).toEqual({ tipo: 'vazio' });
    expect(estadoDoSlot(VAGA, { ...nada, envios: [envio({ estado: 'enviando', progresso: 0.4 })] })).toMatchObject({ tipo: 'enviando', progresso: 0.4 });
    expect(estadoDoSlot(VAGA, { ...nada, envios: [envio({ tentativas: 2, mensagem: 'Sem conexão' })] })).toMatchObject({ tipo: 'aguardando', mensagem: 'Sem conexão' });
    expect(estadoDoSlot(VAGA, { ...nada, envios: [envio({ estado: 'erro', mensagem: 'Foto grande demais' })] })).toMatchObject({ tipo: 'nao_enviada', mensagem: 'Foto grande demais' });
  });

  it('o que está no aparelho vence o que o servidor já tem (refazer)', () => {
    expect(estadoDoSlot(VAGA, { ...nada, envios: [envio({ estado: 'enviando' })], evidencias: [servidor({ situacao: 'PRONTA' })] }).tipo).toBe('enviando');
  });

  it('enviada: processando, pronta (com link) ou falhou no servidor', () => {
    expect(estadoDoSlot(VAGA, { ...nada, evidencias: [servidor({})] })).toEqual({ tipo: 'enviada', pronta: false, url: null });
    expect(estadoDoSlot(VAGA, { ...nada, evidencias: [servidor({ situacao: 'PRONTA', url: '/api/arquivos?c=x' })] })).toEqual({ tipo: 'enviada', pronta: true, url: '/api/arquivos?c=x' });
    expect(estadoDoSlot(VAGA, { ...nada, evidencias: [servidor({ situacao: 'FALHOU', erro: 'ffprobe falhou' })] })).toEqual({ tipo: 'falhou', mensagem: 'ffprobe falhou' });
  });

  it('confirmada nesta tela antes de o servidor mostrar: enviada', () => {
    const concluido: EnvioConcluido = { idCliente: 'c1', devolucaoId: 'd1', itemId: null, tipo: 'FOTO_1_ETIQUETA', evidenciaId: 'e2' };
    expect(estadoDoSlot(VAGA, { ...nada, concluidos: [concluido], evidencias: [servidor({ situacao: 'FALHOU' })] })).toEqual({ tipo: 'enviada', pronta: false, url: null });
  });

  it('textos da vaga', () => {
    expect(textoDoSlot({ tipo: 'vazio' })).toBe('Falta');
    expect(textoDoSlot({ tipo: 'enviando', progresso: 0.456, registro: envio({}) })).toBe('Enviando… 46%');
    expect(textoDoSlot({ tipo: 'enviada', pronta: false, url: null })).toBe('Enviada · processando');
    expect(textoDoSlot({ tipo: 'enviada', pronta: true, url: null })).toBe('Pronta');
  });

  it('para concluir contam as do servidor que não falharam e as confirmadas nesta tela', () => {
    const concluido: EnvioConcluido = { idCliente: 'c1', devolucaoId: 'd1', itemId: 'i1', tipo: 'FOTO_3_PRODUTO', evidenciaId: 'e9' };
    expect(evidenciasQueContam([servidor({}), servidor({ tipo: 'FOTO_2_EMBALAGEM', situacao: 'FALHOU' })], [concluido])).toEqual([
      { tipo: 'FOTO_1_ETIQUETA', itemId: null },
      { tipo: 'FOTO_3_PRODUTO', itemId: 'i1' },
    ]);
  });
});
```

`src/components/conferencia/passos.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { montarPassos, passoCompleto } from './passos';

const ITENS = [
  { id: 'i1', unidade: 1 },
  { id: 'i2', unidade: 2 },
];

describe('passos do assistente (spec §6.3)', () => {
  it('Pacote, uma etapa por unidade, Vídeo de Prova e Destino', () => {
    expect(montarPassos(ITENS).map((p) => p.rotulo)).toEqual(['Pacote', 'Unidade 1', 'Unidade 2', 'Vídeo de Prova', 'Destino']);
  });

  it('cada passo sabe quando está completo', () => {
    const [pacote, unidade1, unidade2, video, destino] = montarPassos(ITENS);
    const enviadas = new Set(['FOTO_1_ETIQUETA:', 'FOTO_2_EMBALAGEM:', 'FOTO_3_PRODUTO:i1']);
    const contexto = {
      enviada: (tipo: string, itemId: string | null) => enviadas.has(`${tipo}:${itemId ?? ''}`),
      decisao: (id: string) => (id === 'i2' ? ('AUSENTE' as const) : null),
      videoExigido: false,
      itens: ITENS,
    };
    expect(passoCompleto(pacote, contexto)).toBe(true);
    expect(passoCompleto(unidade1, contexto)).toBe(false); // falta a Foto 4
    expect(passoCompleto(unidade2, contexto)).toBe(true); // ausente
    expect(passoCompleto(video, contexto)).toBe(true); // não exigido
    expect(passoCompleto(destino, contexto)).toBe(false); // unidade 1 sem destino
  });
});
```

`src/components/conferencia/SlotEvidencia.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RegistroEnvio } from '@/components/midia/filaEnvios';
import { SlotEvidencia } from './SlotEvidencia';

const registro = { idCliente: 'c1', arquivo: new Blob(['x']) } as RegistroEnvio;

describe('SlotEvidencia', () => {
  it('vaga vazia: botão grande que abre a câmera traseira', () => {
    const aoEscolher = vi.fn();
    render(<SlotEvidencia titulo="Foto 1" descricao="Etiqueta" estado={{ tipo: 'vazio' }} aoEscolher={aoEscolher} aoTentarDeNovo={vi.fn()} />);
    expect(screen.getByRole('group', { name: 'Foto 1' })).toHaveTextContent('Falta');
    const entrada = screen.getByLabelText('Tirar Foto 1');
    expect(entrada).toHaveAttribute('capture', 'environment');
    expect(entrada).toHaveAttribute('accept', 'image/*');
    const arquivo = new File(['x'], 'f.jpg', { type: 'image/jpeg' });
    fireEvent.change(entrada, { target: { files: [arquivo] } });
    expect(aoEscolher).toHaveBeenCalledWith(arquivo);
  });

  it('enviando: barra de progresso com o valor', () => {
    render(<SlotEvidencia titulo="Foto 2" descricao="" estado={{ tipo: 'enviando', progresso: 0.5, registro }} aoEscolher={vi.fn()} aoTentarDeNovo={vi.fn()} />);
    expect(screen.getByRole('progressbar', { name: 'Envio da Foto 2' })).toHaveAttribute('aria-valuenow', '50');
  });

  it('não enviada: mostra o motivo e "Tentar de novo"; com arquivo, o botão vira "de novo"', () => {
    const aoTentarDeNovo = vi.fn();
    render(
      <SlotEvidencia titulo="Foto 3" descricao="" estado={{ tipo: 'nao_enviada', mensagem: 'Foto grande demais', registro }} aoEscolher={vi.fn()} aoTentarDeNovo={aoTentarDeNovo} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Foto grande demais');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(aoTentarDeNovo).toHaveBeenCalledWith('c1');
    expect(screen.getByLabelText('Tirar Foto 3 de novo')).toBeInTheDocument();
  });

  it('vídeo: gravar na hora (com capture) ou escolher um arquivo (sem capture)', () => {
    render(<SlotEvidencia video titulo="Vídeo de Prova" descricao="" estado={{ tipo: 'vazio' }} aoEscolher={vi.fn()} aoTentarDeNovo={vi.fn()} />);
    expect(screen.getByLabelText('Gravar Vídeo de Prova')).toHaveAttribute('capture', 'environment');
    expect(screen.getByLabelText('Escolher arquivo de vídeo')).not.toHaveAttribute('capture');
  });
});
```

`src/components/conferencia/ProgressoSegmentos.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProgressoSegmentos } from './ProgressoSegmentos';

describe('ProgressoSegmentos (spec §6.0: progresso em segmentos)', () => {
  it('diz o passo atual em texto e marca o segmento atual', () => {
    const passos = [
      { chave: 'a', rotulo: 'Pacote' },
      { chave: 'b', rotulo: 'Unidade 1' },
      { chave: 'c', rotulo: 'Destino' },
    ];
    render(<ProgressoSegmentos passos={passos} atual={1} completos={[true, false, false]} />);
    expect(screen.getByText('Passo 2 de 3:')).toBeInTheDocument();
    const lista = screen.getByRole('list', { name: 'Progresso da conferência' });
    const itens = within(lista).getAllByRole('listitem');
    expect(itens[1]).toHaveAttribute('aria-current', 'step');
    expect(itens[0]).toHaveTextContent('Pacote: completo');
    expect(itens[2]).toHaveTextContent('Destino: falta');
  });
});
```

> Os testes usam `toHaveAttribute`/`toHaveTextContent`/`toBeInTheDocument`. Se o projeto ainda não registra os matchers do `@testing-library/jest-dom` (confira em `src/components/useEnvioFormulario.test.tsx` como os testes da Fase 1 conferem atributos), troque por `expect(el.getAttribute('aria-valuenow')).toBe('50')`, `expect(el.textContent).toContain(...)` e `expect(el).toBeTruthy()`; não instale pacote novo para isso.

Rode: `npm test -- src/components/conferencia`
Esperado: FAIL (os módulos não existem).

- [ ] **Passo 2: Implementar o estado das vagas e os passos**

`src/components/conferencia/tipos.ts`:

```ts
/** Resposta das Server Actions da bancada: os erros já vêm em português, prontos para a tela. */
export type RespostaAcao<T = object> = ({ ok: true } & T) | { ok: false; erros: string[] };
```

`src/components/conferencia/estadoSlot.ts`:

```ts
import type { EnvioConcluido, RegistroEnvio } from '@/components/midia/filaEnvios';
import type { EvidenciaRegra } from '@/modules/conferencia/regras';
import type { SituacaoProcessamento, TipoEvidencia } from '@/modules/midia/dominio';

/** O que o servidor tem de cada evidência (a página manda com o link temporário das que estão prontas). */
export type EvidenciaServidor = {
  id: string;
  tipo: TipoEvidencia;
  itemId: string | null;
  situacao: SituacaoProcessamento;
  url: string | null;
  erro: string | null;
};

export type EstadoSlot =
  | { tipo: 'vazio' }
  | { tipo: 'enviando'; progresso: number; registro: RegistroEnvio }
  | { tipo: 'aguardando'; mensagem: string; registro: RegistroEnvio }
  | { tipo: 'nao_enviada'; mensagem: string; registro: RegistroEnvio }
  | { tipo: 'enviada'; pronta: boolean; url: string | null }
  | { tipo: 'falhou'; mensagem: string };

type Vaga = { tipo: TipoEvidencia; itemId: string | null };
const naVaga = (v: Vaga) => (x: Vaga) => x.tipo === v.tipo && x.itemId === v.itemId;

/** O arquivo no aparelho (mais novo) vence; depois, o confirmado nesta tela; depois, o que o servidor tem. */
export function estadoDoSlot(
  vaga: Vaga,
  p: { envios: RegistroEnvio[]; concluidos: EnvioConcluido[]; evidencias: EvidenciaServidor[] },
): EstadoSlot {
  const local = p.envios.filter(naVaga(vaga)).sort((a, b) => b.criadoEm - a.criadoEm)[0];
  if (local) {
    if (local.estado === 'erro') return { tipo: 'nao_enviada', mensagem: local.mensagem ?? 'O arquivo não foi enviado.', registro: local };
    if (local.estado === 'pendente' && local.tentativas > 0) return { tipo: 'aguardando', mensagem: local.mensagem ?? 'Aguardando conexão.', registro: local };
    return { tipo: 'enviando', progresso: local.progresso, registro: local };
  }
  const servidor = p.evidencias.find(naVaga(vaga));
  const concluido = p.concluidos.find(naVaga(vaga));
  if (concluido && servidor?.id !== concluido.evidenciaId) return { tipo: 'enviada', pronta: false, url: null };
  if (!servidor || servidor.situacao === 'APAGADA') return { tipo: 'vazio' };
  if (servidor.situacao === 'FALHOU') return { tipo: 'falhou', mensagem: servidor.erro ?? 'O servidor não conseguiu processar o arquivo.' };
  return { tipo: 'enviada', pronta: servidor.situacao === 'PRONTA', url: servidor.url };
}

export function textoDoSlot(e: EstadoSlot): string {
  switch (e.tipo) {
    case 'vazio':
      return 'Falta';
    case 'enviando':
      return `Enviando… ${Math.round(e.progresso * 100)}%`;
    case 'aguardando':
      return 'Aguardando conexão';
    case 'nao_enviada':
      return 'Não enviada';
    case 'enviada':
      return e.pronta ? 'Pronta' : 'Enviada · processando';
    case 'falhou':
      return 'Falhou no servidor: tire de novo';
  }
}

/** Para a lista do que falta: as que o servidor tem (sem as que falharam) e as confirmadas nesta tela. */
export function evidenciasQueContam(evidencias: EvidenciaServidor[], concluidos: EnvioConcluido[]): EvidenciaRegra[] {
  return [
    ...evidencias.filter((e) => e.situacao !== 'FALHOU' && e.situacao !== 'APAGADA').map(({ tipo, itemId }) => ({ tipo, itemId })),
    ...concluidos.map(({ tipo, itemId }) => ({ tipo, itemId })),
  ];
}
```

`src/components/conferencia/passos.ts`:

```ts
import type { Decisao } from '@/modules/conferencia/regras';
import type { TipoEvidencia } from '@/modules/midia/dominio';

/** O assistente da spec §6.3: Fotos 1 e 2; para cada unidade Foto 3, código de barras e Foto 4; Vídeo de Prova; destino. */
export type Passo = { chave: string; rotulo: string } & (
  | { tipo: 'pacote' }
  | { tipo: 'item'; itemId: string; unidade: number }
  | { tipo: 'video' }
  | { tipo: 'destino' }
);

export function montarPassos(itens: { id: string; unidade: number }[]): Passo[] {
  return [
    { chave: 'pacote', rotulo: 'Pacote', tipo: 'pacote' },
    ...itens.map((i): Passo => ({ chave: i.id, rotulo: `Unidade ${i.unidade}`, tipo: 'item', itemId: i.id, unidade: i.unidade })),
    { chave: 'video', rotulo: 'Vídeo de Prova', tipo: 'video' },
    { chave: 'destino', rotulo: 'Destino', tipo: 'destino' },
  ];
}

export type ContextoPasso = {
  enviada(tipo: TipoEvidencia, itemId: string | null): boolean;
  decisao(itemId: string): Decisao | null;
  videoExigido: boolean;
  itens: { id: string }[];
};

export function passoCompleto(p: Passo, c: ContextoPasso): boolean {
  switch (p.tipo) {
    case 'pacote':
      return c.enviada('FOTO_1_ETIQUETA', null) && c.enviada('FOTO_2_EMBALAGEM', null);
    case 'item':
      return c.decisao(p.itemId) === 'AUSENTE' || (c.enviada('FOTO_3_PRODUTO', p.itemId) && c.enviada('FOTO_4_CODIGO_SERIAL', p.itemId));
    case 'video':
      return !c.videoExigido || c.enviada('VIDEO_PROVA', null);
    case 'destino':
      return c.itens.every((i) => c.decisao(i.id) !== null);
  }
}
```

- [ ] **Passo 3: Implementar a vaga, o progresso e o leitor**

`src/components/conferencia/SlotEvidencia.tsx`:

```tsx
'use client';

import { useEffect, useId, useMemo } from 'react';
import { ALERTA_ATENCAO, ALERTA_ERRO, BOTAO_SECUNDARIO } from '@/components/estilos';
import { textoDoSlot, type EstadoSlot } from './estadoSlot';

function IconeCamera() {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

function IconeVideo() {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="6" width="13" height="12" rx="2" />
      <path d="M16 10l5-3v10l-5-3z" />
    </svg>
  );
}

export function BarraProgresso({ valor, rotulo }: { valor: number; rotulo: string }) {
  const porcento = Math.round(Math.min(1, Math.max(0, valor)) * 100);
  return (
    <div role="progressbar" aria-label={rotulo} aria-valuemin={0} aria-valuemax={100} aria-valuenow={porcento} className="h-2.5 w-full overflow-hidden rounded-full bg-coluna">
      <div className="h-full rounded-full bg-destaque" style={{ width: `${porcento}%` }} />
    </div>
  );
}

/**
 * Botão grande (56 px) que abre a câmera do celular (`capture`) ou o seletor de arquivos. O <input> fica dentro do
 * <label>: o nome acessível é o texto do botão, e o contorno de foco aparece no botão.
 */
export function BotaoArquivo(p: { rotulo: string; accept: string; capture: boolean; principal: boolean; video?: boolean; aoEscolher: (arquivo: File) => void }) {
  return (
    <label
      className={`flex min-h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl px-4 text-center text-base font-semibold has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-destaque ${
        p.principal ? 'bg-texto text-white' : 'border border-borda-campo bg-superficie text-texto'
      }`}
    >
      {p.video ? <IconeVideo /> : <IconeCamera />}
      {p.rotulo}
      <input
        type="file"
        accept={p.accept}
        capture={p.capture ? 'environment' : undefined}
        className="sr-only"
        onChange={(e) => {
          const arquivo = e.currentTarget.files?.[0];
          e.currentTarget.value = '';
          if (arquivo) p.aoEscolher(arquivo);
        }}
      />
    </label>
  );
}

/** Miniatura: a foto ainda no aparelho (object URL) ou a pronta no servidor (link temporário). */
function useMiniatura(estado: EstadoSlot, video: boolean): string | null {
  const arquivo = !video && 'registro' in estado ? estado.registro.arquivo : null;
  const local = useMemo(() => (arquivo ? URL.createObjectURL(arquivo) : null), [arquivo]);
  useEffect(() => () => {
    if (local) URL.revokeObjectURL(local);
  }, [local]);
  if (local) return local;
  return !video && estado.tipo === 'enviada' ? estado.url : null;
}

type Props = {
  titulo: string;
  descricao: string;
  estado: EstadoSlot;
  video?: boolean;
  aoEscolher: (arquivo: File) => void;
  aoTentarDeNovo: (idCliente: string) => void;
};

/** Uma vaga da grade de evidências (spec §6.0): miniatura com ✓ quando enviada, vaga tracejada quando falta. */
export function SlotEvidencia({ titulo, descricao, estado, video = false, aoEscolher, aoTentarDeNovo }: Props) {
  const id = useId();
  const miniatura = useMiniatura(estado, video);
  const borda =
    estado.tipo === 'vazio'
      ? 'border-dashed border-borda-campo'
      : estado.tipo === 'enviada'
        ? 'border-bom'
        : estado.tipo === 'nao_enviada' || estado.tipo === 'falhou'
          ? 'border-erro'
          : 'border-destaque';
  const corTexto = estado.tipo === 'enviada' ? 'text-bom' : estado.tipo === 'nao_enviada' || estado.tipo === 'falhou' ? 'text-erro' : 'text-texto-2';
  const refazer = estado.tipo !== 'vazio';
  return (
    <div role="group" aria-labelledby={`${id}-titulo`} className={`flex flex-col gap-3 rounded-2xl border-2 bg-superficie p-3 ${borda}`}>
      <div className="flex items-start gap-3">
        {miniatura ? (
          // eslint-disable-next-line @next/next/no-img-element -- link temporário ou object URL: não passa pelo otimizador de imagens
          <img src={miniatura} alt="" className="size-16 shrink-0 rounded-lg object-cover" />
        ) : (
          <span aria-hidden="true" className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-fundo text-texto-2">
            {video ? <IconeVideo /> : <IconeCamera />}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p id={`${id}-titulo`} className="text-base font-bold">
            {titulo}
          </p>
          {descricao && <p className="text-sm text-texto-2">{descricao}</p>}
          <p aria-live="polite" className={`mt-1 text-sm font-semibold ${corTexto}`}>
            {estado.tipo === 'enviada' && <span aria-hidden="true">✓ </span>}
            {textoDoSlot(estado)}
          </p>
        </div>
      </div>
      {estado.tipo === 'enviando' && <BarraProgresso valor={estado.progresso} rotulo={`Envio da ${titulo}`} />}
      {estado.tipo === 'aguardando' && <p className={ALERTA_ATENCAO}>{estado.mensagem} O arquivo está guardado no aparelho.</p>}
      {(estado.tipo === 'nao_enviada' || estado.tipo === 'falhou') && (
        <p role="alert" className={ALERTA_ERRO}>
          {estado.mensagem}
        </p>
      )}
      {(estado.tipo === 'nao_enviada' || estado.tipo === 'aguardando') && (
        <button type="button" onClick={() => aoTentarDeNovo(estado.registro.idCliente)} className={BOTAO_SECUNDARIO}>
          Tentar de novo
        </button>
      )}
      {video ? (
        <>
          <BotaoArquivo video rotulo={refazer ? 'Gravar o Vídeo de Prova de novo' : 'Gravar Vídeo de Prova'} accept="video/*" capture principal aoEscolher={aoEscolher} />
          <BotaoArquivo video rotulo="Escolher arquivo de vídeo" accept="video/*" capture={false} principal={false} aoEscolher={aoEscolher} />
        </>
      ) : (
        <BotaoArquivo rotulo={refazer ? `Tirar ${titulo} de novo` : `Tirar ${titulo}`} accept="image/*" capture principal={!refazer} aoEscolher={aoEscolher} />
      )}
    </div>
  );
}
```

`src/components/conferencia/ProgressoSegmentos.tsx`:

```tsx
/** Spec §6.0: cabeçalho com o progresso em segmentos. O estado de cada segmento também vai em texto (não só na cor). */
export function ProgressoSegmentos({ passos, atual, completos }: { passos: { chave: string; rotulo: string }[]; atual: number; completos: boolean[] }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold text-texto-2">
        <span>
          Passo {atual + 1} de {passos.length}:
        </span>{' '}
        <span className="text-texto">{passos[atual]?.rotulo}</span>
      </p>
      <ol aria-label="Progresso da conferência" className="flex gap-1">
        {passos.map((p, i) => (
          <li
            key={p.chave}
            aria-current={i === atual ? 'step' : undefined}
            className={`flex-1 rounded-full ${i === atual ? 'h-3 bg-destaque' : completos[i] ? 'h-2 bg-bom' : 'h-2 bg-borda-campo'}`}
          >
            <span className="sr-only">
              {p.rotulo}: {i === atual ? 'atual' : completos[i] ? 'completo' : 'falta'}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
```

`src/components/conferencia/LeitorCodigo.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useRef } from 'react';
import { ALERTA_ERRO } from '@/components/estilos';
import { useLeitorCamera } from '@/components/leitor/useLeitorCamera';

/**
 * Lê um código pela câmera traseira, em tela cheia, e fecha na primeira leitura (spec §6.3: leitura do código de
 * barras). Mesmo leitor do Recebimento (BarcodeDetector ou ZXing). O foco vai para "Fechar câmera" e volta ao botão.
 */
export function LeitorCodigo({
  rotulo,
  titulo,
  aoLer,
  instrucao = 'Aponte para o código de barras da unidade.',
}: {
  rotulo: string;
  titulo: string;
  aoLer: (codigo: string) => void;
  instrucao?: string;
}) {
  const aoLerRef = useRef(aoLer);
  const fecharRef = useRef<() => void>(() => {});
  useEffect(() => {
    aoLerRef.current = aoLer;
  }, [aoLer]);
  const lido = useCallback((codigo: string) => {
    fecharRef.current();
    aoLerRef.current(codigo);
  }, []);
  const { videoRef, situacao, erro, abrir, fechar } = useLeitorCamera(lido);
  useEffect(() => {
    fecharRef.current = fechar;
  }, [fechar]);
  const aberta = situacao !== 'parada';
  const botaoAbrirRef = useRef<HTMLButtonElement>(null);
  const botaoFecharRef = useRef<HTMLButtonElement>(null);
  const primeiraVez = useRef(true);
  useEffect(() => {
    if (primeiraVez.current) {
      primeiraVez.current = false;
      return;
    }
    (aberta ? botaoFecharRef : botaoAbrirRef).current?.focus();
  }, [aberta]);

  return (
    <>
      <button
        ref={botaoAbrirRef}
        type="button"
        onClick={() => void abrir()}
        className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-texto px-4 text-base font-semibold text-white"
      >
        <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2M7 12h10" />
        </svg>
        {rotulo}
      </button>
      {erro && (
        <p role="alert" className={ALERTA_ERRO}>
          {erro}
        </p>
      )}
      <div
        role={aberta ? 'dialog' : undefined}
        aria-modal={aberta ? true : undefined}
        aria-label={aberta ? titulo : undefined}
        className={aberta ? 'fixed inset-0 z-50 flex h-dvh flex-col bg-black' : 'hidden'}
      >
        <div className="relative min-h-0 flex-1">
          <video ref={videoRef} playsInline muted aria-label="Imagem da câmera" className="h-full w-full object-cover" />
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-white/80" />
          {situacao === 'abrindo' && <p className="absolute inset-x-0 top-6 text-center text-sm font-semibold text-white">Abrindo a câmera…</p>}
        </div>
        <div className="flex flex-col gap-3 bg-superficie px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <p className="text-center text-sm text-texto-2">{instrucao}</p>
          <button ref={botaoFecharRef} type="button" onClick={fechar} className="min-h-14 w-full rounded-2xl border border-borda-campo bg-superficie text-lg font-semibold">
            Fechar câmera
          </button>
        </div>
      </div>
    </>
  );
}
```

Rode: `npm test -- src/components/conferencia && npm run typecheck && npm run lint`
Esperado: PASS.

- [ ] **Passo 4: Commitar**

```bash
cd "/c/Users/idmpc/devolucoes-wt/fase-2"
git add src/components/conferencia
git commit -m "feat: peças da conferência no celular (vagas com câmera e progresso, segmentos, leitor do código e passos)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 18: Assistente da conferência (pacote, unidades, vídeo, destino e conclusão)

**Arquivos:**
- Criar: `src/modules/midia/links-evidencias.ts`
- Criar: `src/app/(app)/fluxo/devolucoes/[codigo]/conferencia/page.tsx`, `.../conferencia/acoes.ts`
- Criar: `src/components/conferencia/AssistenteConferencia.tsx`, `PassoItem.tsx`, `PassoDestino.tsx`
- Criar: `tests/e2e/apoio-conferencia.ts`
- Testes: `tests/e2e/conferencia.spec.ts`

**Interfaces:**
- Consome: `obterConferencia`, `ItemConferencia` (Tarefa 9); `salvarItem`, `registrarEan`, `ResultadoEan` (Tarefa 10); `concluirConferencia`, `ErroConclusao`, `pendenciasDaConclusao`, `videoExigido`, `entradaDoItem`, `colunasDaDecisao`, `MOTIVOS_PROBLEMA`, `DECISOES` (Tarefas 10 e 11); `desistirConferencia`, `iniciarConferencia` (Tarefa 9); `armazenamentoDoProvedor`, `DURACAO_LINK_SEGUNDOS`; `useFilaEnvios`, `comprimirFoto`, `novoIdCliente` (Tarefa 16); peças da Tarefa 17; `semRolagemLateral`, `entrarComo`, `comBanco`, `usuarioPorEmail`, `codigoUnico`, `paginaNaoEncontrada` (Fase 1).
- Produz:
  - `linksDasEvidencias(evidencias: { id; situacao; caminho; provedor }[]): Promise<Map<string, string>>` (links de 10 min das PRONTA)
  - rota `/fluxo/devolucoes/[codigo]/conferencia` (só quem está com a trava; os outros voltam ao detalhe)
  - Server Actions `salvarItemAcao(devolucaoId, itemId, entrada)`, `registrarEanAcao(devolucaoId, itemId, lido | null)`, `concluirAcao(devolucaoId, codigo)` e `desistirAcao(devolucaoId, codigo)` (as duas últimas devolvem `{ ok: true, destino }`; a tela navega)
  - `AssistenteConferencia`, `PassoItem`, `PassoDestino`
  - em `apoio-conferencia.ts`: `type ArquivoTeste`, `fotoDeTeste(nome?)`, `temFfmpegE2e()`, `videoDeTeste()`, `prepararConferencia({ unidades?, canal?, emConferenciaCom? })`, `esperarEnviada(page, nome)`

- [ ] **Passo 1: Escrever o teste ponta a ponta que falha**

`tests/e2e/apoio-conferencia.ts`:

```ts
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { expect, type Page } from '@playwright/test';
import sharp from 'sharp';
import { iniciarConferencia } from '../../src/modules/conferencia/trava';
import type { Canal } from '../../src/modules/devolucoes/dominio';
import { receberPorRastreio } from '../../src/modules/devolucoes/recebimento';
import { criarDevolucaoTeste, criarProdutoTeste } from '../helpers/fabricas';
import { codigoUnico, comBanco, usuarioPorEmail } from './apoio';
import { USUARIOS_E2E } from './dados';

/** O EAN do produto das devoluções de teste (válido, com dígito verificador). */
export const EAN_TESTE = '7891000000014';

export type ArquivoTeste = { name: string; mimeType: string; buffer: Buffer };

/** "Câmera" de teste: o setInputFiles do Playwright entrega este JPEG ao <input capture>. */
export async function fotoDeTeste(nome = 'foto.jpg'): Promise<ArquivoTeste> {
  const buffer = await sharp({ create: { width: 1200, height: 900, channels: 3, background: { r: 90, g: 140, b: 120 } } })
    .jpeg({ quality: 80 })
    .toBuffer();
  return { name: nome, mimeType: 'image/jpeg', buffer };
}

export function temFfmpegE2e(): boolean {
  try {
    execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** 2 s de vídeo de verdade quando há ffmpeg; senão, bytes quaisquer (o envio funciona; o worker é que vai falhar). */
export function videoDeTeste(): ArquivoTeste {
  const destino = resolve('.dados-e2e/fixtures/prova.mp4');
  if (temFfmpegE2e()) {
    if (!existsSync(destino)) {
      mkdirSync(dirname(destino), { recursive: true });
      execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', [
        '-y', '-f', 'lavfi', '-i', 'testsrc=duration=2:size=640x360:rate=15',
        '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-shortest',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', destino,
      ], { stdio: 'ignore' });
    }
    return { name: 'prova.mp4', mimeType: 'video/mp4', buffer: readFileSync(destino) };
  }
  return { name: 'prova.mp4', mimeType: 'video/mp4', buffer: Buffer.alloc(64 * 1024, 7) };
}

/** Devolução que chegou (Aguardando conferência), com `unidades` do mesmo produto; opcionalmente já em conferência. */
export async function prepararConferencia(p: { unidades?: number; canal?: Canal; emConferenciaCom?: keyof typeof USUARIOS_E2E } = {}) {
  return comBanco(async (db) => {
    const operador = await usuarioPorEmail(db, USUARIOS_E2E.operador.email);
    const sku = codigoUnico('SKU');
    await criarProdutoTeste(db, { sku, ean: EAN_TESTE, descricao: 'Fone Bluetooth de teste' });
    const rastreio = codigoUnico('CF');
    const criada = await criarDevolucaoTeste(db, operador, { rastreio, canal: p.canal, itens: [{ sku, quantidade: p.unidades ?? 1 }] });
    await receberPorRastreio(db, rastreio, operador);
    if (p.emConferenciaCom) await iniciarConferencia(db, criada.id, await usuarioPorEmail(db, USUARIOS_E2E[p.emConferenciaCom].email));
    return { id: criada.id, codigo: criada.codigo, rastreio, sku };
  });
}

/** A vaga mostra "Enviada" ou "Pronta" (o envio terminou e o servidor registrou). */
export async function esperarEnviada(page: Page, nome: string) {
  await expect(page.getByRole('group', { name: nome, exact: true })).toContainText(/Enviada|Pronta/, { timeout: 30_000 });
}
```

`tests/e2e/conferencia.spec.ts`:

```ts
import { asc, eq } from 'drizzle-orm';
import { expect, test } from '@playwright/test';
import { evidencias, itensDevolucao } from '../../src/db/schema';
import { comBanco, entrarComo, paginaNaoEncontrada, semRolagemLateral } from './apoio';
import { EAN_TESTE, esperarEnviada, fotoDeTeste, prepararConferencia, videoDeTeste } from './apoio-conferencia';
import { USUARIOS_E2E } from './dados';

test('conferência completa: fotos, EAN, unidade ausente, Vídeo de Prova, destino e conclusão', async ({ page }) => {
  const d = await prepararConferencia({ unidades: 2, emConferenciaCom: 'operador' });
  await entrarComo(page, USUARIOS_E2E.operador);
  await page.goto(`/fluxo/devolucoes/${d.codigo}/conferencia`);
  await expect(page.getByRole('heading', { level: 1, name: 'Conferência' })).toBeVisible();
  await expect(page.getByText('Passo 1 de 5:')).toBeVisible();
  await semRolagemLateral(page);

  // Pacote: Fotos 1 e 2 (a "câmera" entrega um JPEG; o celular comprime e envia pelo tus).
  await page.getByLabel('Tirar Foto 1', { exact: true }).setInputFiles(await fotoDeTeste('foto-1.jpg'));
  await page.getByLabel('Tirar Foto 2', { exact: true }).setInputFiles(await fotoDeTeste('foto-2.jpg'));
  await esperarEnviada(page, 'Foto 1');
  await esperarEnviada(page, 'Foto 2');
  await page.getByRole('button', { name: 'Continuar' }).click();

  // Unidade 1: EAN confere, Fotos 3 e 4, S/N.
  await expect(page.getByText('Passo 2 de 5:')).toBeVisible();
  await page.getByLabel('EAN lido').fill(EAN_TESTE);
  await page.getByRole('button', { name: 'Conferir', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Confere com o esperado.' })).toBeVisible();
  await page.getByLabel('Tirar Foto 3', { exact: true }).setInputFiles(await fotoDeTeste('foto-3.jpg'));
  await page.getByLabel('Tirar Foto 4', { exact: true }).setInputFiles(await fotoDeTeste('foto-4.jpg'));
  await page.getByLabel('Nº de série (S/N)').fill('SN-E2E-1');
  await esperarEnviada(page, 'Foto 3');
  await esperarEnviada(page, 'Foto 4');
  await semRolagemLateral(page);
  await page.getByRole('button', { name: 'Continuar' }).click();

  // Unidade 2: não veio no pacote.
  await expect(page.getByText('Passo 3 de 5:')).toBeVisible();
  await page.getByRole('button', { name: 'Não veio no pacote (ausente)' }).click();
  await expect(page.getByText('Unidade marcada como ausente')).toBeVisible();
  await page.getByRole('button', { name: 'Continuar' }).click();

  // Vídeo de Prova: "Escolher arquivo" (o setInputFiles faz o papel da câmera).
  await page.getByLabel('Escolher arquivo de vídeo').setInputFiles(videoDeTeste());
  await esperarEnviada(page, 'Vídeo de Prova');
  await page.getByRole('button', { name: 'Continuar' }).click();

  // Destino.
  await expect(page.getByText('Passo 5 de 5:')).toBeVisible();
  const unidade1 = page.getByRole('group', { name: /^Unidade 1/ });
  await unidade1.getByLabel('Estoque Problema').check();
  await page.getByLabel('Motivo da unidade 1').selectOption('AVARIADO');
  await expect(page.getByText('Tudo pronto para concluir.')).toBeVisible();
  await semRolagemLateral(page);
  await page.getByRole('button', { name: 'Concluir conferência' }).click();

  await expect(page).toHaveURL(new RegExp(`/fluxo/devolucoes/${d.codigo}$`));
  await expect(page.getByText('Aguardando NF').first()).toBeVisible();
  const itens = await comBanco((db) =>
    db
      .select({ status: itensDevolucao.status, destino: itensDevolucao.destino, motivo: itensDevolucao.motivo, serial: itensDevolucao.serial })
      .from(itensDevolucao)
      .where(eq(itensDevolucao.devolucaoId, d.id))
      .orderBy(asc(itensDevolucao.unidade)),
  );
  expect(itens).toEqual([
    { status: 'AGUARDANDO_NF', destino: 'PROBLEMA', motivo: 'AVARIADO', serial: 'SN-E2E-1' },
    { status: 'AUSENTE', destino: null, motivo: 'AUSENTE', serial: null },
  ]);
});

test('sem internet a foto fica guardada no aparelho e sobe quando a conexão volta (spec §9)', async ({ page, context }) => {
  const d = await prepararConferencia({ emConferenciaCom: 'operador' });
  await entrarComo(page, USUARIOS_E2E.operador);
  await page.goto(`/fluxo/devolucoes/${d.codigo}/conferencia`);
  await expect(page.getByLabel('Tirar Foto 1', { exact: true })).toBeVisible();
  await context.setOffline(true);
  await page.getByLabel('Tirar Foto 1', { exact: true }).setInputFiles(await fotoDeTeste());
  await expect(page.getByRole('group', { name: 'Foto 1', exact: true })).toContainText('Aguardando conexão', { timeout: 30_000 });
  await context.setOffline(false);
  await esperarEnviada(page, 'Foto 1');
  const salvas = await comBanco((db) => db.select({ id: evidencias.id }).from(evidencias).where(eq(evidencias.devolucaoId, d.id)));
  expect(salvas).toHaveLength(1);
});

test('concluir cedo mostra o que falta, com o foco na lista', async ({ page }) => {
  const d = await prepararConferencia({ emConferenciaCom: 'operador' });
  await entrarComo(page, USUARIOS_E2E.operador);
  await page.goto(`/fluxo/devolucoes/${d.codigo}/conferencia?passo=3`);
  await page.getByRole('button', { name: 'Concluir conferência' }).click();
  const erros = page.locator('#erros-conferencia');
  await expect(erros).toContainText('Falta: Foto 1 (etiqueta de rastreio e declaração de conteúdo)');
  await expect(erros).toContainText('Falta: Destino da unidade 1');
  await expect(erros).toBeFocused();
});

test('desistir volta para Aguardando conferência e mantém o que foi feito', async ({ page }) => {
  const d = await prepararConferencia({ emConferenciaCom: 'operador' });
  await entrarComo(page, USUARIOS_E2E.operador);
  await page.goto(`/fluxo/devolucoes/${d.codigo}/conferencia?passo=1`);
  await page.getByLabel('Nº de série (S/N)').fill('SN-DESISTE');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Desistir da conferência' }).click();
  await page.getByRole('button', { name: 'Confirmar desistência' }).click();
  await expect(page).toHaveURL(new RegExp(`/fluxo/devolucoes/${d.codigo}$`));
  await expect(page.getByText('Aguardando conferência').first()).toBeVisible();
  const [item] = await comBanco((db) => db.select({ serial: itensDevolucao.serial }).from(itensDevolucao).where(eq(itensDevolucao.devolucaoId, d.id)));
  expect(item.serial).toBe('SN-DESISTE');
});

test('só quem está com a trava abre a conferência; o Fiscal nem vê a tela', async ({ page }) => {
  const d = await prepararConferencia({ emConferenciaCom: 'operador' });
  await entrarComo(page, USUARIOS_E2E.gestor);
  await page.goto(`/fluxo/devolucoes/${d.codigo}/conferencia`);
  await expect(page).toHaveURL(new RegExp(`/fluxo/devolucoes/${d.codigo}$`));
  await page.context().clearCookies();
  await entrarComo(page, USUARIOS_E2E.fiscal);
  await paginaNaoEncontrada(page, `/fluxo/devolucoes/${d.codigo}/conferencia`);
});
```

Rode: `npm run test:e2e -- tests/e2e/conferencia.spec.ts`
Esperado: FAIL (a rota da conferência não existe).

- [ ] **Passo 2: Links das evidências e Server Actions**

`src/modules/midia/links-evidencias.ts`:

```ts
import { armazenamentoDoProvedor } from './armazenamento';
import { DURACAO_LINK_SEGUNDOS } from './dominio';

/** Links temporários (10 min, spec §9) das evidências prontas, cada uma no provedor onde está (contrato D2). */
export async function linksDasEvidencias(
  evidencias: { id: string; situacao: string; caminho: string | null; provedor: string | null }[],
): Promise<Map<string, string>> {
  const links = new Map<string, string>();
  for (const e of evidencias) {
    if (e.situacao !== 'PRONTA' || !e.caminho || !e.provedor) continue;
    links.set(e.id, await armazenamentoDoProvedor(e.provedor).urlTemporaria(e.caminho, DURACAO_LINK_SEGUNDOS));
  }
  return links;
}
```

`src/app/(app)/fluxo/devolucoes/[codigo]/conferencia/acoes.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import type { RespostaAcao } from '@/components/conferencia/tipos';
import { obterDb } from '@/db';
import { ehUuid } from '@/lib/uuid';
import { exigirPermissao } from '@/modules/auth/servidor';
import { concluirConferencia } from '@/modules/conferencia/concluir';
import { ErroConclusao } from '@/modules/conferencia/erros';
import { registrarEan, salvarItem, type ResultadoEan } from '@/modules/conferencia/itens';
import { DECISOES, type EntradaItem } from '@/modules/conferencia/regras';
import { desistirConferencia } from '@/modules/conferencia/trava';
import { MOTIVOS_ITEM, type MotivoItem } from '@/modules/devolucoes/dominio';
import { ErroDevolucao } from '@/modules/devolucoes/erros';

const CODIGO_VALIDO = /^DEV-\d+$/;
const NAO_ENCONTRADA = { ok: false as const, erros: ['Devolução não encontrada.'] };

/** O que vem do celular não é confiável: só textos e valores das listas. */
function entradaSegura(x: unknown): EntradaItem {
  const o = (typeof x === 'object' && x !== null ? x : {}) as Record<string, unknown>;
  const texto = (v: unknown) => (typeof v === 'string' ? v : '');
  const decisao = (DECISOES as readonly unknown[]).includes(o.decisao) ? (o.decisao as EntradaItem['decisao']) : null;
  const motivo = (MOTIVOS_ITEM as readonly unknown[]).includes(o.motivo) ? (o.motivo as MotivoItem) : null;
  return { serial: texto(o.serial), loteFabricacao: texto(o.loteFabricacao), validade: texto(o.validade), decisao, motivo, observacao: texto(o.observacao) };
}

async function comTratamento<T extends object>(f: () => Promise<RespostaAcao<T>>): Promise<RespostaAcao<T>> {
  try {
    return await f();
  } catch (erro) {
    if (erro instanceof ErroConclusao) return { ok: false, erros: erro.pendencias.map((p) => `Falta: ${p}`) };
    if (erro instanceof ErroDevolucao) return { ok: false, erros: [erro.message] };
    throw erro;
  }
}

export async function salvarItemAcao(devolucaoId: string, itemId: string, entrada: EntradaItem): Promise<RespostaAcao> {
  const usuario = await exigirPermissao('operar_devolucoes');
  if (!ehUuid(String(devolucaoId)) || !ehUuid(String(itemId))) return NAO_ENCONTRADA;
  return comTratamento(async () => {
    await salvarItem(obterDb(), devolucaoId, itemId, entradaSegura(entrada), usuario);
    return { ok: true };
  });
}

export async function registrarEanAcao(devolucaoId: string, itemId: string, lido: string | null): Promise<RespostaAcao<{ resultado: ResultadoEan }>> {
  const usuario = await exigirPermissao('operar_devolucoes');
  if (!ehUuid(String(devolucaoId)) || !ehUuid(String(itemId))) return NAO_ENCONTRADA;
  return comTratamento(async () => ({
    ok: true,
    resultado: await registrarEan(obterDb(), devolucaoId, itemId, typeof lido === 'string' ? lido : null, usuario),
  }));
}

/** Não redireciona: devolve o destino e a tela navega (a chamada vem de um botão, não de um formulário). */
export async function concluirAcao(devolucaoId: string, codigo: string): Promise<RespostaAcao<{ destino: string }>> {
  const usuario = await exigirPermissao('operar_devolucoes');
  if (!ehUuid(String(devolucaoId)) || !CODIGO_VALIDO.test(String(codigo))) return NAO_ENCONTRADA;
  return comTratamento(async () => {
    await concluirConferencia(obterDb(), devolucaoId, usuario);
    revalidatePath('/fluxo', 'layout');
    return { ok: true, destino: `/fluxo/devolucoes/${codigo}` };
  });
}

export async function desistirAcao(devolucaoId: string, codigo: string): Promise<RespostaAcao<{ destino: string }>> {
  const usuario = await exigirPermissao('operar_devolucoes');
  if (!ehUuid(String(devolucaoId)) || !CODIGO_VALIDO.test(String(codigo))) return NAO_ENCONTRADA;
  return comTratamento(async () => {
    await desistirConferencia(obterDb(), devolucaoId, usuario);
    revalidatePath('/fluxo', 'layout');
    return { ok: true, destino: `/fluxo/devolucoes/${codigo}` };
  });
}
```

- [ ] **Passo 3: Os passos da unidade e do destino**

`src/components/conferencia/PassoItem.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { ALERTA_ATENCAO, ALERTA_OK, BOTAO_SECUNDARIO, CAMPO, CARTAO, ROTULO } from '@/components/estilos';
import type { ResultadoEan } from '@/modules/conferencia/itens';
import type { ItemConferencia } from '@/modules/conferencia/leitura';
import type { EntradaItem } from '@/modules/conferencia/regras';
import { DESCRICAO_EVIDENCIA, type TipoEvidencia } from '@/modules/midia/dominio';
import type { EstadoSlot } from './estadoSlot';
import { LeitorCodigo } from './LeitorCodigo';
import { SlotEvidencia } from './SlotEvidencia';

function textoDaLeitura(ean: ResultadoEan): string {
  switch (ean.situacao) {
    case 'confere':
      return 'Confere com o esperado.';
    case 'confirmado':
      return 'Produto confirmado sem leitura.';
    case 'sem_referencia':
      return 'O produto esperado não tem EAN no cadastro: confira pela descrição.';
    case 'diverge':
      return `Diferente do esperado: ${ean.produtoRecebido ? `${ean.produtoRecebido.sku} · ${ean.produtoRecebido.descricao}` : 'produto fora do cadastro'}. Sugerimos Estoque Problema com o motivo Divergente.`;
  }
}

type Props = {
  item: ItemConferencia;
  valor: EntradaItem;
  ean: ResultadoEan | null;
  slot: (tipo: TipoEvidencia, itemId: string) => EstadoSlot;
  aoMudar: (parcial: Partial<EntradaItem>, salvarAgora?: boolean) => void;
  aoConferirEan: (lido: string | null) => void;
  aoEscolher: (tipo: TipoEvidencia, arquivo: File) => void;
  aoTentarDeNovo: (idCliente: string) => void;
};

/** Spec §6.3, passo 3: Foto 3, leitura do código de barras, Foto 4 com S/N, lote e validade; ou "não veio no pacote". */
export function PassoItem({ item, valor, ean, slot, aoMudar, aoConferirEan, aoEscolher, aoTentarDeNovo }: Props) {
  const [digitado, setDigitado] = useState('');
  const base = `unidade-${item.id}`;
  const confere = ean?.situacao === 'confere' || ean?.situacao === 'confirmado';
  return (
    <section aria-labelledby={`${base}-titulo`} className="flex flex-col gap-3">
      <div className={`${CARTAO} flex flex-col gap-1`}>
        <h2 id={`${base}-titulo`} className="text-lg font-bold">
          Unidade {item.unidade}
        </h2>
        <p className="break-all font-mono text-[13px] font-semibold">{item.sku}</p>
        <p className="text-[15px]">{item.descricao ?? 'SKU fora do cadastro de produtos'}</p>
        <p className="text-sm text-texto-2">
          EAN esperado: <span className="font-mono">{item.eanEsperado ?? 'sem EAN no cadastro'}</span>
        </p>
      </div>

      {valor.decisao === 'AUSENTE' ? (
        <div className={`${ALERTA_ATENCAO} flex flex-col gap-2`}>
          <p className="text-[15px] font-semibold">Unidade marcada como ausente (não veio no pacote).</p>
          <button type="button" onClick={() => aoMudar({ decisao: null, motivo: null }, true)} className={BOTAO_SECUNDARIO}>
            Desfazer: a unidade veio
          </button>
        </div>
      ) : (
        <>
          <SlotEvidencia
            titulo="Foto 3"
            descricao={DESCRICAO_EVIDENCIA.FOTO_3_PRODUTO}
            estado={slot('FOTO_3_PRODUTO', item.id)}
            aoEscolher={(a) => aoEscolher('FOTO_3_PRODUTO', a)}
            aoTentarDeNovo={aoTentarDeNovo}
          />

          <section aria-labelledby={`${base}-ean`} className={`${CARTAO} flex flex-col gap-3`}>
            <h3 id={`${base}-ean`} className="text-base font-bold">
              Código de barras
            </h3>
            <LeitorCodigo rotulo="Ler código de barras" titulo="Leitor do código de barras" aoLer={(codigo) => aoConferirEan(codigo)} />
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (digitado.trim()) aoConferirEan(digitado);
              }}
              className="flex flex-col gap-1.5"
            >
              <label htmlFor={`${base}-ean-lido`} className={ROTULO}>
                EAN lido
              </label>
              <div className="flex gap-2">
                <input
                  id={`${base}-ean-lido`}
                  value={digitado}
                  onChange={(e) => setDigitado(e.target.value)}
                  inputMode="numeric"
                  autoComplete="off"
                  spellCheck={false}
                  enterKeyHint="go"
                  className={`${CAMPO} min-w-0 font-mono`}
                />
                <button type="submit" className={`${BOTAO_SECUNDARIO} shrink-0`}>
                  Conferir
                </button>
              </div>
            </form>
            <button type="button" onClick={() => aoConferirEan(null)} className="min-h-11 text-left text-sm font-semibold text-destaque underline">
              Não dá para ler: o produto é o esperado
            </button>
            {ean && (
              <p role="status" className={confere ? ALERTA_OK : ALERTA_ATENCAO}>
                {confere && <span aria-hidden="true">✓ </span>}
                {textoDaLeitura(ean)}
              </p>
            )}
          </section>

          <SlotEvidencia
            titulo="Foto 4"
            descricao={DESCRICAO_EVIDENCIA.FOTO_4_CODIGO_SERIAL}
            estado={slot('FOTO_4_CODIGO_SERIAL', item.id)}
            aoEscolher={(a) => aoEscolher('FOTO_4_CODIGO_SERIAL', a)}
            aoTentarDeNovo={aoTentarDeNovo}
          />

          <div className={`${CARTAO} flex flex-col gap-3`}>
            {(
              [
                ['serial', 'Nº de série (S/N)', undefined],
                ['loteFabricacao', 'Lote', undefined],
                ['validade', 'Validade', '12/2027'],
              ] as const
            ).map(([campo, rotulo, exemplo]) => (
              <div key={campo} className="flex flex-col gap-1.5">
                <label htmlFor={`${base}-${campo}`} className={ROTULO}>
                  {rotulo}
                </label>
                <input
                  id={`${base}-${campo}`}
                  value={valor[campo]}
                  onChange={(e) => aoMudar({ [campo]: e.target.value })}
                  placeholder={exemplo}
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  className={`${CAMPO} font-mono`}
                />
              </div>
            ))}
          </div>

          <button type="button" onClick={() => aoMudar({ decisao: 'AUSENTE', motivo: 'AUSENTE' }, true)} className={BOTAO_SECUNDARIO}>
            Não veio no pacote (ausente)
          </button>
        </>
      )}
    </section>
  );
}
```

`src/components/conferencia/PassoDestino.tsx`:

```tsx
'use client';

import { ALERTA_ATENCAO, CAMPO, CARTAO, ROTULO } from '@/components/estilos';
import type { ItemConferencia } from '@/modules/conferencia/leitura';
import { MOTIVOS_PROBLEMA, type EntradaItem } from '@/modules/conferencia/regras';
import { ROTULO_MOTIVO, type MotivoItem } from '@/modules/devolucoes/dominio';

type Props = {
  itens: ItemConferencia[];
  valores: Record<string, EntradaItem>;
  divergentes: Record<string, boolean>;
  falta: string[];
  enviosPendentes: number;
  aoMudar: (itemId: string, parcial: Partial<EntradaItem>, salvarAgora?: boolean) => void;
};

const OPCAO = 'flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-borda-campo px-3 text-center text-[15px] font-semibold';

function DestinoDaUnidade({ item, valor, divergente, aoMudar }: { item: ItemConferencia; valor: EntradaItem; divergente: boolean; aoMudar: Props['aoMudar'] }) {
  const mudar = (parcial: Partial<EntradaItem>, salvarAgora?: boolean) => aoMudar(item.id, parcial, salvarAgora);
  const motivoProblema = valor.motivo && valor.motivo !== 'AUSENTE' ? valor.motivo : divergente ? 'DIVERGENTE' : null;
  return (
    <div className={CARTAO}>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-base font-bold">
          Unidade {item.unidade} <span className="break-all font-mono text-[13px] font-semibold">{item.sku}</span>
        </legend>
        {valor.decisao === 'AUSENTE' ? (
          <>
            <p className="text-[15px]">Ausente (não veio no pacote).</p>
            <button type="button" onClick={() => mudar({ decisao: null, motivo: null }, true)} className="min-h-11 text-left text-sm font-semibold text-destaque underline">
              Desfazer: a unidade veio
            </button>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <label className={`${OPCAO} has-[:checked]:border-bom has-[:checked]:bg-bom-suave has-[:checked]:text-bom`}>
                <input type="radio" name={`destino-${item.id}`} checked={valor.decisao === 'BOM'} onChange={() => mudar({ decisao: 'BOM', motivo: null }, true)} className="size-5" />
                Estoque Bom
              </label>
              <label className={`${OPCAO} has-[:checked]:border-problema has-[:checked]:bg-problema-suave has-[:checked]:text-problema`}>
                <input
                  type="radio"
                  name={`destino-${item.id}`}
                  checked={valor.decisao === 'PROBLEMA'}
                  onChange={() => mudar({ decisao: 'PROBLEMA', motivo: motivoProblema }, motivoProblema !== null)}
                  className="size-5"
                />
                Estoque Problema
              </label>
            </div>
            {divergente && <p className={ALERTA_ATENCAO}>O código lido é diferente do esperado: sugerimos Estoque Problema, motivo Divergente.</p>}
            {valor.decisao === 'PROBLEMA' && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`motivo-${item.id}`} className={ROTULO}>
                  Motivo da unidade {item.unidade}
                </label>
                <select
                  id={`motivo-${item.id}`}
                  value={valor.motivo ?? ''}
                  onChange={(e) => mudar({ motivo: (e.target.value || null) as MotivoItem | null }, e.target.value !== '')}
                  className={CAMPO}
                >
                  <option value="">Escolha o motivo</option>
                  {MOTIVOS_PROBLEMA.map((m) => (
                    <option key={m} value={m}>
                      {ROTULO_MOTIVO[m]}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`observacao-${item.id}`} className={ROTULO}>
                Observação (opcional)
              </label>
              <textarea
                id={`observacao-${item.id}`}
                value={valor.observacao}
                onChange={(e) => mudar({ observacao: e.target.value })}
                onBlur={() => mudar({}, true)}
                maxLength={500}
                rows={2}
                className={`${CAMPO} min-h-20 py-2`}
              />
            </div>
            <button type="button" onClick={() => mudar({ decisao: 'AUSENTE', motivo: 'AUSENTE' }, true)} className="min-h-11 text-left text-sm font-semibold text-destaque underline">
              Não veio no pacote (ausente)
            </button>
          </>
        )}
      </fieldset>
    </div>
  );
}

/** Spec §6.3, passo 5: Estoque Bom ou Estoque Problema (com motivo e observação), ou ausente. Mostra o que ainda falta. */
export function PassoDestino({ itens, valores, divergentes, falta, enviosPendentes, aoMudar }: Props) {
  return (
    <section aria-labelledby="titulo-destino" className="flex flex-col gap-3">
      <h2 id="titulo-destino" className="text-lg font-bold">
        Destino de cada unidade
      </h2>
      {itens.map((item) => (
        <DestinoDaUnidade key={item.id} item={item} valor={valores[item.id]} divergente={divergentes[item.id] ?? false} aoMudar={aoMudar} />
      ))}
      <div className={`${CARTAO} flex flex-col gap-2`} aria-live="polite">
        <h3 className="text-base font-bold">Para concluir</h3>
        {enviosPendentes > 0 && (
          <p className={ALERTA_ATENCAO}>
            {enviosPendentes === 1 ? '1 arquivo ainda está subindo.' : `${enviosPendentes} arquivos ainda estão subindo.`}
          </p>
        )}
        {falta.length === 0 ? (
          <p className="text-[15px] font-semibold text-bom">Tudo pronto para concluir.</p>
        ) : (
          <ul className="list-disc pl-5 text-[15px]">
            {falta.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Passo 4: O assistente e a página**

`src/components/conferencia/AssistenteConferencia.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ListaErros } from '@/components/ListaErros';
import { ALERTA_ATENCAO, BOTAO_PERIGO, BOTAO_PRIMARIO, BOTAO_SECUNDARIO, LINK_VOLTAR } from '@/components/estilos';
import { comprimirFoto } from '@/components/midia/comprimirFoto';
import { novoIdCliente } from '@/components/midia/idCliente';
import { useFilaEnvios } from '@/components/midia/useFilaEnvios';
import type { ResultadoEan } from '@/modules/conferencia/itens';
import type { ItemConferencia } from '@/modules/conferencia/leitura';
import { colunasDaDecisao, entradaDoItem, pendenciasDaConclusao, videoExigido, type EntradaItem } from '@/modules/conferencia/regras';
import type { VideoObrigatorio } from '@/modules/configuracoes/dominio';
import { DESCRICAO_EVIDENCIA, LIMITE_VIDEO_BYTES, ROTULO_EVIDENCIA, ehFoto, type TipoEvidencia } from '@/modules/midia/dominio';
import { estadoDoSlot, evidenciasQueContam, type EvidenciaServidor } from './estadoSlot';
import { PassoDestino } from './PassoDestino';
import { PassoItem } from './PassoItem';
import { montarPassos, passoCompleto } from './passos';
import { ProgressoSegmentos } from './ProgressoSegmentos';
import { SlotEvidencia } from './SlotEvidencia';
import type { RespostaAcao } from './tipos';

export type AcoesConferencia = {
  salvarItem: (devolucaoId: string, itemId: string, entrada: EntradaItem) => Promise<RespostaAcao>;
  registrarEan: (devolucaoId: string, itemId: string, lido: string | null) => Promise<RespostaAcao<{ resultado: ResultadoEan }>>;
  concluir: (devolucaoId: string, codigo: string) => Promise<RespostaAcao<{ destino: string }>>;
  desistir: (devolucaoId: string, codigo: string) => Promise<RespostaAcao<{ destino: string }>>;
};

type Props = {
  devolucao: { id: string; codigo: string; rastreio: string | null };
  itens: ItemConferencia[];
  evidencias: EvidenciaServidor[];
  videoObrigatorio: VideoObrigatorio;
  passoInicial: number;
  acoes: AcoesConferencia;
};

const ID_ERROS = 'erros-conferencia';
const AVISO_SEM_REDE = 'Sem conexão: o que você preencheu fica nesta tela e é salvo quando a internet voltar (no mais tardar, ao concluir).';
const SEM_REDE_CONCLUIR = 'Sem conexão. A conferência só termina com internet: tente de novo quando a conexão voltar.';

function leituraInicial(i: ItemConferencia): ResultadoEan | null {
  if (!i.eanLido) return null;
  return i.divergente
    ? { situacao: 'diverge', produtoRecebido: i.produtoRecebido, sugerirMotivo: 'DIVERGENTE' }
    : { situacao: 'confere', produtoRecebido: i.produtoRecebido, sugerirMotivo: null };
}

/**
 * Conferência no celular (spec §6.3 e §6.0). O estado da tela é a fonte da verdade enquanto ela está aberta: funciona
 * sem internet (fotos e vídeo na fila do aparelho; dados das unidades salvos quando der). Concluir exige internet.
 */
export function AssistenteConferencia({ devolucao, itens, evidencias, videoObrigatorio, passoInicial, acoes }: Props) {
  const router = useRouter();
  const passos = useMemo(() => montarPassos(itens), [itens]);
  const [indice, setIndice] = useState(() => Math.min(Math.max(0, passoInicial), passos.length - 1));
  const [valores, setValores] = useState<Record<string, EntradaItem>>(() => Object.fromEntries(itens.map((i) => [i.id, entradaDoItem(i)])));
  const [leituras, setLeituras] = useState<Record<string, ResultadoEan | null>>(() => Object.fromEntries(itens.map((i) => [i.id, leituraInicial(i)])));
  const [naoSalvos, setNaoSalvos] = useState<string[]>([]);
  const [erros, setErros] = useState<string[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [confirmarDesistencia, setConfirmarDesistencia] = useState(false);

  // Decisão 15: pede os dados de novo ao servidor depois de cada envio e enquanto há mídia processando (só com rede).
  const atualizar = useCallback(() => {
    if (navigator.onLine) router.refresh();
  }, [router]);
  const { envios, concluidos, adicionar, tentarDeNovo } = useFilaEnvios(devolucao.id, atualizar);
  const processando = evidencias.some((e) => e.situacao === 'RECEBIDA' || e.situacao === 'PROCESSANDO');
  useEffect(() => {
    if (!processando) return;
    const relogio = window.setInterval(atualizar, 10_000);
    return () => window.clearInterval(relogio);
  }, [processando, atualizar]);

  // Erros novos: foco e rolagem até a caixa (o botão principal fica embaixo, a caixa em cima).
  useEffect(() => {
    if (erros.length === 0) return;
    const caixa = document.getElementById(ID_ERROS);
    caixa?.focus();
    caixa?.scrollIntoView({ block: 'center' });
  }, [erros]);

  const fonte = { envios, concluidos, evidencias };
  const slot = (tipo: TipoEvidencia, itemId: string | null = null) => estadoDoSlot({ tipo, itemId }, fonte);
  const contam = evidenciasQueContam(evidencias, concluidos);
  const itensRegra = itens.map((i) => {
    const c = colunasDaDecisao(valores[i.id].decisao, valores[i.id].motivo);
    return { id: i.id, unidade: i.unidade, ...('erro' in c ? { destino: null, motivo: null } : c) };
  });
  const exigeVideo = videoExigido(videoObrigatorio, itensRegra);
  const falta = pendenciasDaConclusao({ itens: itensRegra, evidencias: contam, videoObrigatorio });
  const completos = passos.map((p) =>
    passoCompleto(p, {
      enviada: (tipo, itemId) => contam.some((e) => e.tipo === tipo && e.itemId === itemId),
      decisao: (id) => valores[id].decisao,
      videoExigido: exigeVideo,
      itens,
    }),
  );
  const passo = passos[indice];

  async function escolher(tipo: TipoEvidencia, itemId: string | null, arquivo: File) {
    setErros([]);
    if (!ehFoto(tipo) && arquivo.size > LIMITE_VIDEO_BYTES) {
      setErros(['Vídeo grande demais (máximo 300 MB). Grave em 1080p, com até 2 minutos.']);
      return;
    }
    try {
      const foto = ehFoto(tipo);
      await adicionar({
        idCliente: novoIdCliente(),
        itemId,
        tipo,
        nome: foto ? `${tipo.toLowerCase()}.jpg` : arquivo.name || 'video.mp4',
        tipoConteudo: foto ? 'image/jpeg' : arquivo.type || 'video/mp4',
        arquivo: foto ? await comprimirFoto(arquivo) : arquivo,
      });
    } catch {
      setErros([`Não foi possível ler este arquivo. Tire a ${ROTULO_EVIDENCIA[tipo]} de novo pela câmera.`]);
    }
  }

  async function salvar(itemId: string, entrada: EntradaItem): Promise<'ok' | 'sem_rede' | 'erro'> {
    try {
      const r = await acoes.salvarItem(devolucao.id, itemId, entrada);
      if (r.ok) {
        setNaoSalvos((lista) => lista.filter((x) => x !== itemId));
        return 'ok';
      }
      setErros(r.erros);
      return 'erro';
    } catch {
      setNaoSalvos((lista) => (lista.includes(itemId) ? lista : [...lista, itemId]));
      return 'sem_rede';
    }
  }

  function mudar(itemId: string, parcial: Partial<EntradaItem>, salvarAgora = false) {
    const novo = { ...valores[itemId], ...parcial };
    setValores((v) => ({ ...v, [itemId]: novo }));
    if (!salvarAgora) return;
    void salvar(itemId, novo).then((r) => {
      if (r === 'sem_rede') setAviso(AVISO_SEM_REDE);
    });
  }

  async function conferirEan(itemId: string, lido: string | null) {
    setErros([]);
    try {
      const r = await acoes.registrarEan(devolucao.id, itemId, lido);
      if (!r.ok) {
        setErros(r.erros);
        return;
      }
      setLeituras((l) => ({ ...l, [itemId]: r.resultado }));
      // Spec §6.3: EAN diferente do esperado sugere o motivo "divergente" (a pessoa pode trocar no destino).
      if (r.resultado.sugerirMotivo && valores[itemId].decisao === null) mudar(itemId, { decisao: 'PROBLEMA', motivo: r.resultado.sugerirMotivo });
    } catch {
      setErros(['Sem conexão: a leitura do código precisa de internet. Tente de novo quando a conexão voltar.']);
    }
  }

  function irPara(n: number) {
    const alvo = Math.min(Math.max(0, n), passos.length - 1);
    setIndice(alvo);
    setErros([]);
    setConfirmarDesistencia(false);
    // Sem ida ao servidor: se o Android recarregar a aba ao voltar da câmera, o passo volta pela URL.
    window.history.replaceState(null, '', `?passo=${alvo}`);
    window.scrollTo({ top: 0 });
  }

  async function continuar() {
    if (passo.tipo === 'item') {
      setOcupado(true);
      const r = await salvar(passo.itemId, valores[passo.itemId]);
      setOcupado(false);
      if (r === 'erro') return;
      if (r === 'sem_rede') setAviso(AVISO_SEM_REDE);
    }
    irPara(indice + 1);
  }

  async function concluir() {
    setErros([]);
    if (envios.length > 0) {
      setErros([envios.length === 1 ? 'Aguarde: 1 arquivo ainda não subiu.' : `Aguarde: ${envios.length} arquivos ainda não subiram.`]);
      return;
    }
    if (falta.length > 0) {
      setErros(falta.map((f) => `Falta: ${f}`));
      return;
    }
    setOcupado(true);
    try {
      for (const id of naoSalvos) {
        const r = await salvar(id, valores[id]);
        if (r === 'sem_rede') setErros([SEM_REDE_CONCLUIR]);
        if (r !== 'ok') return;
      }
      const r = await acoes.concluir(devolucao.id, devolucao.codigo);
      if (r.ok) {
        router.push(r.destino);
        return;
      }
      setErros(r.erros);
    } catch {
      setErros([SEM_REDE_CONCLUIR]);
    } finally {
      setOcupado(false);
    }
  }

  async function desistir() {
    setOcupado(true);
    try {
      const r = await acoes.desistir(devolucao.id, devolucao.codigo);
      if (r.ok) {
        router.push(r.destino);
        return;
      }
      setErros(r.erros);
    } catch {
      setErros(['Sem conexão. Tente de novo quando a internet voltar.']);
    } finally {
      setOcupado(false);
    }
  }

  const itemDoPasso = passo.tipo === 'item' ? itens.find((i) => i.id === passo.itemId) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Link href={`/fluxo/devolucoes/${devolucao.codigo}`} className={`${LINK_VOLTAR} self-start`}>
          ← {devolucao.codigo}
        </Link>
        <h1 className="text-xl font-bold">Conferência</h1>
        <p className="text-sm text-texto-2">
          <span className="font-mono">{devolucao.codigo}</span>
          {devolucao.rastreio && (
            <>
              {' · '}
              <span className="break-all font-mono">{devolucao.rastreio}</span>
            </>
          )}
        </p>
      </div>

      <ProgressoSegmentos passos={passos} atual={indice} completos={completos} />
      {aviso && (
        <p role="status" className={ALERTA_ATENCAO}>
          {aviso}
        </p>
      )}
      <ListaErros erros={erros} id={ID_ERROS} />

      {passo.tipo === 'pacote' && (
        <section aria-labelledby="titulo-pacote" className="flex flex-col gap-3">
          <h2 id="titulo-pacote" className="text-lg font-bold">
            Pacote
          </h2>
          {(['FOTO_1_ETIQUETA', 'FOTO_2_EMBALAGEM'] as const).map((tipo) => (
            <SlotEvidencia
              key={tipo}
              titulo={ROTULO_EVIDENCIA[tipo]}
              descricao={DESCRICAO_EVIDENCIA[tipo]}
              estado={slot(tipo)}
              aoEscolher={(a) => void escolher(tipo, null, a)}
              aoTentarDeNovo={(id) => void tentarDeNovo(id)}
            />
          ))}
        </section>
      )}

      {passo.tipo === 'item' && itemDoPasso && (
        <PassoItem
          key={itemDoPasso.id}
          item={itemDoPasso}
          valor={valores[itemDoPasso.id]}
          ean={leituras[itemDoPasso.id]}
          slot={(tipo, itemId) => slot(tipo, itemId)}
          aoMudar={(parcial, salvarAgora) => mudar(itemDoPasso.id, parcial, salvarAgora)}
          aoConferirEan={(lido) => void conferirEan(itemDoPasso.id, lido)}
          aoEscolher={(tipo, a) => void escolher(tipo, itemDoPasso.id, a)}
          aoTentarDeNovo={(id) => void tentarDeNovo(id)}
        />
      )}

      {passo.tipo === 'video' && (
        <section aria-labelledby="titulo-video" className="flex flex-col gap-3">
          <h2 id="titulo-video" className="text-lg font-bold">
            Vídeo de Prova
          </h2>
          <p className="text-[15px] text-texto-2">
            {exigeVideo ? 'Obrigatório nesta devolução.' : 'Opcional nesta devolução (nenhuma unidade com problema ou ausente).'} Um vídeo contínuo,
            sem cortes, mostrando o teste de funcionamento ou o defeito. Grave em 1080p, com até 2 minutos.
          </p>
          <SlotEvidencia
            video
            titulo={ROTULO_EVIDENCIA.VIDEO_PROVA}
            descricao={DESCRICAO_EVIDENCIA.VIDEO_PROVA}
            estado={slot('VIDEO_PROVA')}
            aoEscolher={(a) => void escolher('VIDEO_PROVA', null, a)}
            aoTentarDeNovo={(id) => void tentarDeNovo(id)}
          />
        </section>
      )}

      {passo.tipo === 'destino' && (
        <PassoDestino
          itens={itens}
          valores={valores}
          divergentes={Object.fromEntries(itens.map((i) => [i.id, leituras[i.id]?.situacao === 'diverge']))}
          falta={falta}
          enviosPendentes={envios.length}
          aoMudar={mudar}
        />
      )}

      <div className="flex flex-col gap-2 pt-2">
        {confirmarDesistencia ? (
          <div className={`${ALERTA_ATENCAO} flex flex-col gap-2`}>
            <p className="text-[15px]">A devolução volta para &quot;Aguardando conferência&quot;. O que já foi feito fica guardado.</p>
            <button type="button" onClick={() => void desistir()} disabled={ocupado} className={BOTAO_PERIGO}>
              Confirmar desistência
            </button>
            <button type="button" onClick={() => setConfirmarDesistencia(false)} className={BOTAO_SECUNDARIO}>
              Continuar conferindo
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmarDesistencia(true)} className={BOTAO_PERIGO}>
            Desistir da conferência
          </button>
        )}
      </div>

      {/* Rodapé fixo logo acima da barra de abas (no computador, no fim da página). */}
      <div className="acima-barra sticky z-20 -mx-4 grid grid-cols-[auto_1fr] gap-2 border-t border-borda bg-superficie/95 px-4 py-3 sm:-mx-8 sm:px-8">
        <button type="button" onClick={() => irPara(indice - 1)} disabled={indice === 0 || ocupado} className={BOTAO_SECUNDARIO}>
          Voltar
        </button>
        {passo.tipo === 'destino' ? (
          <button type="button" onClick={() => void concluir()} disabled={ocupado} className={`${BOTAO_PRIMARIO} min-h-14 text-lg`}>
            {ocupado ? 'Concluindo…' : 'Concluir conferência'}
          </button>
        ) : (
          <button type="button" onClick={() => void continuar()} disabled={ocupado} className={`${BOTAO_PRIMARIO} min-h-14 text-lg`}>
            {ocupado ? 'Salvando…' : 'Continuar'}
          </button>
        )}
      </div>
    </div>
  );
}
```

`src/app/(app)/fluxo/devolucoes/[codigo]/conferencia/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { AssistenteConferencia } from '@/components/conferencia/AssistenteConferencia';
import { obterDb } from '@/db';
import { primeiroValor } from '@/lib/parametros';
import { exigirPermissao } from '@/modules/auth/servidor';
import { obterConferencia } from '@/modules/conferencia/leitura';
import { linksDasEvidencias } from '@/modules/midia/links-evidencias';
import { concluirAcao, desistirAcao, registrarEanAcao, salvarItemAcao } from './acoes';

type Props = { params: Promise<{ codigo: string }>; searchParams: Promise<{ passo?: string | string[] }> };

export async function generateMetadata({ params }: Pick<Props, 'params'>): Promise<Metadata> {
  const { codigo } = await params;
  return { title: `Conferência ${codigo} · Gestão de Devoluções` };
}

/** Spec §6.3 (etapa "Em Conferência / Triagem & Registro de Evidências"). Só quem está com a trava abre. */
export default async function PaginaConferencia({ params, searchParams }: Props) {
  const usuario = await exigirPermissao('operar_devolucoes');
  const { codigo } = await params;
  const dados = await obterConferencia(obterDb(), { codigo });
  if (!dados) notFound();
  if (dados.status !== 'EM_CONFERENCIA' || dados.conferenteId !== usuario.id) redirect(`/fluxo/devolucoes/${dados.codigo}`);
  const links = await linksDasEvidencias(dados.evidencias);
  const passo = Number.parseInt(primeiroValor((await searchParams).passo), 10);
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <AssistenteConferencia
        devolucao={{ id: dados.id, codigo: dados.codigo, rastreio: dados.rastreio }}
        itens={dados.itens}
        evidencias={dados.evidencias.map((e) => ({ id: e.id, tipo: e.tipo, itemId: e.itemId, situacao: e.situacao, erro: e.erro, url: links.get(e.id) ?? null }))}
        videoObrigatorio={dados.videoObrigatorio}
        passoInicial={Number.isFinite(passo) ? passo : 0}
        acoes={{ salvarItem: salvarItemAcao, registrarEan: registrarEanAcao, concluir: concluirAcao, desistir: desistirAcao }}
      />
    </div>
  );
}
```

Rode: `npm run typecheck && npm run lint && npm run test:e2e -- tests/e2e/conferencia.spec.ts`
Esperado: PASS em `computador` e `celular`. Se o teste offline não mostrar "Aguardando conexão" porque o tus-js-client ainda está nas novas tentativas internas (`retryDelays`), aumente só o `timeout` daquela linha; não mexa nos `retryDelays`.

- [ ] **Passo 5: Commitar**

```bash
cd "/c/Users/idmpc/devolucoes-wt/fase-2"
npm test && npm run test:int
git add src/components/conferencia src/modules/midia/links-evidencias.ts "src/app/(app)/fluxo/devolucoes/[codigo]/conferencia" tests/e2e/apoio-conferencia.ts tests/e2e/conferencia.spec.ts
git commit -m "feat: assistente da conferência no celular (fotos, EAN, S/N, vídeo, destino, conclusão, desistência e fila offline)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 19: Conferência no detalhe da devolução, botões das etapas e "Conferir pacote" (extra)

**Arquivos:**
- Modificar (substituir o conteúdo): `src/app/(app)/fluxo/devolucoes/[codigo]/secoes/SecaoConferencia.tsx`
- Criar: `src/app/(app)/fluxo/devolucoes/[codigo]/secoes/conferencia/acoes.ts`, `.../secoes/conferencia/FormulariosConferencia.tsx`
- Criar: `src/modules/conferencia/localizar.ts`
- Criar: `src/app/(app)/fluxo/conferencia/page.tsx`, `.../conferencia/FormularioConferirPacote.tsx`, `.../conferencia/acoes.ts`
- Modificar: `src/app/(app)/fluxo/etapa/[numero]/page.tsx` (função `acoesDaEtapa`; dona na janela: Fase 2)
- Testes: `src/modules/conferencia/localizar.int.test.ts`, `tests/e2e/conferencia-detalhe.spec.ts`

**Interfaces:**
- Consome: `PropsSecao` (Tarefa 8); `obterConferencia`, `iniciarConferencia`, `liberarTrava`, `ErroConferencia` (Tarefa 9); `linksDasEvidencias` (Tarefa 18); `LeitorCodigo` (Tarefa 17); `useEnvioFormulario`, `ListaErros`, estilos (Fase 1); `normalizarRastreio`, `rotuloStatus`.
- Produz:
  - `SecaoConferencia` preenchida: situação (aguardando, em conferência por quem e desde quando, conferida), "Iniciar conferência" (Operador e Gestor), "Continuar conferência" (quem está com a trava), "Liberar trava" (Gestor), galeria das evidências com links temporários e o resultado de cada unidade
  - Server Actions `iniciarConferenciaAcao(devolucaoId, codigo, anterior, dados)` e `liberarTravaAcao(devolucaoId, codigo, anterior, dados)` (formulários com `useEnvioFormulario`; redirecionam)
  - `localizarParaConferencia(db, texto, usuario): Promise<{ id: string; codigo: string }>`
  - rota `/fluxo/conferencia` ("Conferir pacote") e `abrirConferenciaAcao(anterior, dados)`
  - botões: etapa 2 "Recebimento" e "Conferir pacote"; etapa 3 "Conferir pacote"

- [ ] **Passo 1: Escrever os testes que falham**

`src/modules/conferencia/localizar.int.test.ts`:

```ts
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { devolucoes } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarDevolucaoTeste, criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { criarDevolucaoChegada } from '../../../tests/helpers/fabricas-conferencia';
import { localizarParaConferencia } from './localizar';

const { db, sql } = criarDbTeste();
let operador: UsuarioSessao;
beforeEach(async () => {
  await limparTabelas(sql);
  operador = await criarUsuarioTeste(db, 'OPERADOR');
});
afterAll(async () => {
  await sql.end();
});

describe('localizarParaConferencia ("Conferir pacote", extra)', () => {
  it('acha pelo código DEV ou pelo rastreio lido na etiqueta', async () => {
    const d = await criarDevolucaoChegada(db, operador, { rastreio: 'BR123456789BR' });
    expect(await localizarParaConferencia(db, d.codigo.toLowerCase(), operador)).toEqual({ id: d.id, codigo: d.codigo });
    expect(await localizarParaConferencia(db, ' br 123 456 789 br ', operador)).toEqual({ id: d.id, codigo: d.codigo });
  });

  it('explica quando não dá', async () => {
    await expect(localizarParaConferencia(db, '  ', operador)).rejects.toThrow('Leia ou digite o código de rastreamento ou o código DEV.');
    await expect(localizarParaConferencia(db, 'BRNADA', operador)).rejects.toThrow('Nenhuma devolução com este código de rastreamento.');
    const pendente = await criarDevolucaoTeste(db, operador, { rastreio: 'BRPENDENTE' });
    await expect(localizarParaConferencia(db, 'BRPENDENTE', operador)).rejects.toThrow(`${pendente.codigo} está pendente de chegada. Registre a chegada no Recebimento primeiro.`);
  });

  it('mesmo rastreio em duas devoluções abertas (o mesmo pacote, Fase 1 decisão 8): pede para escolher pela lista', async () => {
    await criarDevolucaoChegada(db, operador, { rastreio: 'BRDUPLO' });
    const segunda = await criarDevolucaoChegada(db, operador, { rastreio: 'BRDUPLO' });
    await expect(localizarParaConferencia(db, 'BRDUPLO', operador)).rejects.toThrow(/tem 2 devoluções/);
    await db.update(devolucoes).set({ status: 'CANCELADA' }).where(eq(devolucoes.id, segunda.id));
    await expect(localizarParaConferencia(db, 'BRDUPLO', operador)).resolves.toMatchObject({ codigo: expect.stringMatching(/^DEV-/) });
  });
});
```

`tests/e2e/conferencia-detalhe.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { ehCelular, entrarComo, semRolagemLateral } from './apoio';
import { esperarEnviada, fotoDeTeste, prepararConferencia } from './apoio-conferencia';
import { USUARIOS_E2E } from './dados';

test('do detalhe da devolução: "Iniciar conferência" abre a bancada', async ({ page }) => {
  const d = await prepararConferencia();
  await entrarComo(page, USUARIOS_E2E.operador);
  await page.goto(`/fluxo/devolucoes/${d.codigo}`);
  const secao = page.getByRole('region', { name: 'Conferência' });
  await expect(secao).toContainText('Aguardando conferência.');
  await semRolagemLateral(page);
  await secao.getByRole('button', { name: 'Iniciar conferência' }).click();
  await expect(page).toHaveURL(new RegExp(`/fluxo/devolucoes/${d.codigo}/conferencia$`));
  await expect(page.getByRole('heading', { level: 1, name: 'Conferência' })).toBeVisible();
});

test('"Conferir pacote" na etapa 2: lê (ou digita) o rastreio e abre a bancada', async ({ page }) => {
  const d = await prepararConferencia();
  await entrarComo(page, USUARIOS_E2E.operador);
  await page.goto('/fluxo/etapa/2');
  await page.getByRole('link', { name: 'Conferir pacote' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Conferir pacote' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ler com a câmera' })).toBeVisible();
  await semRolagemLateral(page);
  await page.getByLabel('Código de Rastreamento ou código DEV').fill(d.rastreio.toLowerCase());
  await page.getByRole('button', { name: 'Abrir conferência' }).click();
  await expect(page).toHaveURL(new RegExp(`/fluxo/devolucoes/${d.codigo}/conferencia$`));
});

test('o Gestor vê quem está conferindo e libera a trava', async ({ page }, testInfo) => {
  test.skip(ehCelular(testInfo), 'ação do Gestor: basta o computador');
  const d = await prepararConferencia({ emConferenciaCom: 'operador' });
  await entrarComo(page, USUARIOS_E2E.gestor);
  await page.goto(`/fluxo/devolucoes/${d.codigo}`);
  const secao = page.getByRole('region', { name: 'Conferência' });
  await expect(secao).toContainText(`Em conferência por ${USUARIOS_E2E.operador.nome}`);
  await secao.getByRole('button', { name: 'Liberar trava' }).click();
  await expect(secao).toContainText('Aguardando conferência.');
  await expect(page.getByText('Trava da conferência liberada pelo Gestor')).toBeVisible();
});

test('o worker processa a foto: o detalhe mostra a Foto 1 pronta, aberta por link temporário', async ({ page }, testInfo) => {
  test.skip(ehCelular(testInfo), 'o processamento é o mesmo nos dois projetos; basta o computador');
  const d = await prepararConferencia({ emConferenciaCom: 'operador' });
  await entrarComo(page, USUARIOS_E2E.operador);
  await page.goto(`/fluxo/devolucoes/${d.codigo}/conferencia`);
  await page.getByLabel('Tirar Foto 1', { exact: true }).setInputFiles(await fotoDeTeste());
  await esperarEnviada(page, 'Foto 1');
  await page.goto(`/fluxo/devolucoes/${d.codigo}`);
  const foto = page.getByRole('img', { name: `Foto 1 da ${d.codigo}` });
  await expect
    .poll(
      async () => {
        await page.reload();
        return foto.count();
      },
      { timeout: 60_000, intervals: [1000, 2000, 3000] },
    )
    .toBe(1);
  const src = await foto.getAttribute('src');
  expect(src).toMatch(/^\/api\/arquivos\?/);
  const resposta = await page.request.get(src!);
  expect(resposta.status()).toBe(200);
  expect(resposta.headers()['content-type']).toBe('image/jpeg');
});
```

Rode: `npm run test:int -- src/modules/conferencia/localizar.int.test.ts && npm run test:e2e -- tests/e2e/conferencia-detalhe.spec.ts`
Esperado: FAIL (`localizar` não existe; a seção ainda devolve `null`).

- [ ] **Passo 2: Localizar o pacote**

`src/modules/conferencia/localizar.ts`:

```ts
import { desc, eq } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { devolucoes } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { rotuloStatus } from '@/modules/devolucoes/dominio';
import { normalizarRastreio } from '@/modules/devolucoes/rastreio';
import { ErroConferencia } from './erros';

/**
 * "Conferir pacote" (extra, decisão 13): acha a devolução pelo código DEV ou pelo rastreio da etiqueta.
 * Quem decide se pode conferir (trava, não identificada, sem unidades) é o iniciarConferencia.
 */
export async function localizarParaConferencia(db: DbOuTx, texto: string, usuario: UsuarioSessao): Promise<{ id: string; codigo: string }> {
  void usuario;
  const limpo = texto.trim();
  if (!limpo) throw new ErroConferencia('Leia ou digite o código de rastreamento ou o código DEV.');
  if (/^DEV-\d+$/i.test(limpo)) {
    const [d] = await db.select({ id: devolucoes.id, codigo: devolucoes.codigo }).from(devolucoes).where(eq(devolucoes.codigo, limpo.toUpperCase()));
    if (!d) throw new ErroConferencia(`Devolução ${limpo.toUpperCase()} não encontrada.`);
    return d;
  }
  const lista = await db
    .select({ id: devolucoes.id, codigo: devolucoes.codigo, status: devolucoes.status })
    .from(devolucoes)
    .where(eq(devolucoes.rastreio, normalizarRastreio(limpo)))
    .orderBy(desc(devolucoes.numero));
  if (lista.length === 0) throw new ErroConferencia('Nenhuma devolução com este código de rastreamento.');
  const abertas = lista.filter((d) => d.status === 'AGUARDANDO_CONFERENCIA' || d.status === 'EM_CONFERENCIA');
  if (abertas.length > 1) {
    throw new ErroConferencia(
      `Este rastreio tem ${abertas.length} devoluções (${abertas.map((d) => d.codigo).join(', ')}). Abra a que vai conferir pela lista da etapa.`,
    );
  }
  if (abertas.length === 1) return { id: abertas[0].id, codigo: abertas[0].codigo };
  const d = lista[0];
  const dica = d.status === 'PENDENTE_CHEGADA' ? ' Registre a chegada no Recebimento primeiro.' : '';
  throw new ErroConferencia(`${d.codigo} está ${rotuloStatus(d.status).toLowerCase()}.${dica}`);
}
```

- [ ] **Passo 3: A seção "Conferência" do detalhe**

`src/app/(app)/fluxo/devolucoes/[codigo]/secoes/conferencia/acoes.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { obterDb } from '@/db';
import { ehUuid } from '@/lib/uuid';
import { exigirPermissao } from '@/modules/auth/servidor';
import { iniciarConferencia, liberarTrava } from '@/modules/conferencia/trava';
import { ErroDevolucao } from '@/modules/devolucoes/erros';

export type EstadoSecaoConferencia = { erros: string[] };

const CODIGO_VALIDO = /^DEV-\d+$/;
const NAO_ENCONTRADA: EstadoSecaoConferencia = { erros: ['Devolução não encontrada.'] };

export async function iniciarConferenciaAcao(devolucaoId: string, codigo: string, _anterior: EstadoSecaoConferencia, _dados: FormData): Promise<EstadoSecaoConferencia> {
  const usuario = await exigirPermissao('operar_devolucoes');
  if (!ehUuid(devolucaoId) || !CODIGO_VALIDO.test(codigo)) return NAO_ENCONTRADA;
  try {
    await iniciarConferencia(obterDb(), devolucaoId, usuario);
  } catch (erro) {
    if (erro instanceof ErroDevolucao) return { erros: [erro.message] };
    throw erro;
  }
  revalidatePath('/fluxo', 'layout');
  redirect(`/fluxo/devolucoes/${codigo}/conferencia`);
}

export async function liberarTravaAcao(devolucaoId: string, codigo: string, _anterior: EstadoSecaoConferencia, _dados: FormData): Promise<EstadoSecaoConferencia> {
  const usuario = await exigirPermissao('administrar');
  if (!ehUuid(devolucaoId) || !CODIGO_VALIDO.test(codigo)) return NAO_ENCONTRADA;
  try {
    await liberarTrava(obterDb(), devolucaoId, usuario);
  } catch (erro) {
    if (erro instanceof ErroDevolucao) return { erros: [erro.message] };
    throw erro;
  }
  revalidatePath('/fluxo', 'layout');
  redirect(`/fluxo/devolucoes/${codigo}`);
}
```

`src/app/(app)/fluxo/devolucoes/[codigo]/secoes/conferencia/FormulariosConferencia.tsx`:

```tsx
'use client';

import { ListaErros } from '@/components/ListaErros';
import { BOTAO_PERIGO, BOTAO_PRIMARIO } from '@/components/estilos';
import { useEnvioFormulario } from '@/components/useEnvioFormulario';
import type { EstadoSecaoConferencia } from './acoes';

type Acao = (anterior: EstadoSecaoConferencia, dados: FormData) => Promise<EstadoSecaoConferencia>;

export function FormularioIniciarConferencia({ acao }: { acao: Acao }) {
  const [estado, aoEnviar, pendente] = useEnvioFormulario(acao, { erros: [] }, 'erros-iniciar-conferencia');
  return (
    <form onSubmit={aoEnviar} className="flex flex-col gap-2">
      <ListaErros erros={estado.erros} id="erros-iniciar-conferencia" />
      <button type="submit" disabled={pendente} className={`${BOTAO_PRIMARIO} min-h-14 w-full text-lg`}>
        {pendente ? 'Abrindo…' : 'Iniciar conferência'}
      </button>
    </form>
  );
}

/** Spec §11: o Gestor libera a trava (por exemplo, o celular de quem conferia quebrou). O que foi feito fica guardado. */
export function FormularioLiberarTrava({ acao, conferente }: { acao: Acao; conferente: string }) {
  const [estado, aoEnviar, pendente] = useEnvioFormulario(acao, { erros: [] }, 'erros-liberar-trava');
  return (
    <form onSubmit={aoEnviar} className="flex flex-col gap-2">
      <p className="text-sm text-texto-2">Liberar a trava tira a conferência de {conferente}. O que já foi feito fica guardado.</p>
      <ListaErros erros={estado.erros} id="erros-liberar-trava" />
      <button type="submit" disabled={pendente} className={BOTAO_PERIGO}>
        {pendente ? 'Liberando…' : 'Liberar trava'}
      </button>
    </form>
  );
}
```

`src/app/(app)/fluxo/devolucoes/[codigo]/secoes/SecaoConferencia.tsx` (substitua o conteúdo):

```tsx
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ALERTA_ATENCAO, BOTAO_PRIMARIO, CARTAO } from '@/components/estilos';
import { obterDb } from '@/db';
import { formatarDataHora } from '@/lib/formatar';
import { pode } from '@/modules/auth/permissoes';
import { obterConferencia, type DadosConferencia, type EvidenciaConferencia } from '@/modules/conferencia/leitura';
import { ROTULO_DESTINO, ROTULO_MOTIVO, ROTULO_STATUS_ITEM, type StatusDevolucao } from '@/modules/devolucoes/dominio';
import { ROTULO_EVIDENCIA, ROTULO_SITUACAO_PROCESSAMENTO } from '@/modules/midia/dominio';
import { linksDasEvidencias } from '@/modules/midia/links-evidencias';
import { iniciarConferenciaAcao, liberarTravaAcao } from './conferencia/acoes';
import { FormularioIniciarConferencia, FormularioLiberarTrava } from './conferencia/FormulariosConferencia';
import type { PropsSecao } from './tipos';

const ANTES_DA_CHEGADA: StatusDevolucao[] = ['PENDENTE_CHEGADA', 'CANCELADA', 'EXTRAVIADA', 'NO_CD_MARKETPLACE'];

function situacao(d: DadosConferencia): string {
  if (d.status === 'EM_CONFERENCIA') {
    const desde = d.conferenciaIniciadaEm ? ` desde ${formatarDataHora(d.conferenciaIniciadaEm)}` : '';
    return `Em conferência por ${d.conferenteNome ?? 'outra pessoa'}${desde}.`;
  }
  if (d.conferidaEm) return `Conferida em ${formatarDataHora(d.conferidaEm)}${d.conferenteNome ? ` por ${d.conferenteNome}` : ''}.`;
  if (d.status === 'AGUARDANDO_CONFERENCIA') return 'Aguardando conferência.';
  return 'Sem conferência.';
}

function nomeDaEvidencia(e: EvidenciaConferencia, d: DadosConferencia): string {
  const item = e.itemId ? d.itens.find((i) => i.id === e.itemId) : undefined;
  return item ? `${ROTULO_EVIDENCIA[e.tipo]} · Unidade ${item.unidade}` : ROTULO_EVIDENCIA[e.tipo];
}

function Galeria({ d, links }: { d: DadosConferencia; links: Map<string, string> }) {
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {d.evidencias.map((e) => {
        const nome = nomeDaEvidencia(e, d);
        const url = links.get(e.id);
        return (
          <li key={e.id} className="flex flex-col gap-1 rounded-lg border border-borda p-2">
            <span className="text-sm font-semibold">{nome}</span>
            {url && e.tipo !== 'VIDEO_PROVA' && (
              <a href={url} target="_blank" rel="noopener" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element -- link temporário de 10 min: não passa pelo otimizador */}
                <img src={url} alt={`${nome} da ${d.codigo}`} className="aspect-square w-full rounded-md object-cover" />
              </a>
            )}
            {url && e.tipo === 'VIDEO_PROVA' && (
              <video controls preload="metadata" src={url} aria-label={`${nome} da ${d.codigo}`} className="aspect-video w-full rounded-md bg-black" />
            )}
            <span className={`text-xs font-semibold ${e.situacao === 'FALHOU' ? 'text-erro' : 'text-texto-2'}`}>
              {ROTULO_SITUACAO_PROCESSAMENTO[e.situacao]}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function ResultadoUnidades({ d }: { d: DadosConferencia }) {
  return (
    <ol className="flex flex-col gap-2">
      {d.itens.map((i) => (
        <li key={i.id} className="flex flex-col gap-0.5 rounded-lg border border-borda p-3 text-sm">
          <span className="font-semibold">
            Unidade {i.unidade} · {i.destino ? ROTULO_DESTINO[i.destino] : ROTULO_STATUS_ITEM[i.status]}
            {i.motivo && i.motivo !== 'AUSENTE' ? ` · ${ROTULO_MOTIVO[i.motivo]}` : ''}
          </span>
          {i.observacao && <span>{i.observacao}</span>}
          <span className="font-mono text-xs text-texto-2">
            S/N {i.serial ?? '—'} · Lote {i.loteFabricacao ?? '—'} · Validade {i.validade ?? '—'}
            {i.eanLido ? ` · EAN lido ${i.eanLido}${i.divergente ? ' (divergente)' : ''}` : ''}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Conferência (Fase 2): situação e trava, os botões de quem pode, as evidências (links de 10 min) e o resultado. */
export async function SecaoConferencia({ devolucaoId, codigo, status, usuario }: PropsSecao): Promise<ReactNode> {
  const d = await obterConferencia(obterDb(), { id: devolucaoId });
  if (!d || (ANTES_DA_CHEGADA.includes(status) && d.evidencias.length === 0)) return null;
  const links = await linksDasEvidencias(d.evidencias);
  const podeConferir = pode(usuario.perfil, 'operar_devolucoes');
  const ehGestor = pode(usuario.perfil, 'administrar');
  const souConferente = d.conferenteId === usuario.id;

  return (
    <section id="conferencia" aria-labelledby="titulo-conferencia" className={`${CARTAO} flex flex-col gap-3`}>
      <h2 id="titulo-conferencia" className="text-base font-bold">
        Conferência
      </h2>
      <p role="status" className="text-[15px]">
        {situacao(d)}
      </p>

      {status === 'AGUARDANDO_CONFERENCIA' && podeConferir && d.naoIdentificada && (
        <p className={ALERTA_ATENCAO}>Pacote não identificado: o Gestor identifica o pedido antes da conferência.</p>
      )}
      {status === 'AGUARDANDO_CONFERENCIA' && podeConferir && !d.naoIdentificada && d.itens.length > 0 && (
        <FormularioIniciarConferencia acao={iniciarConferenciaAcao.bind(null, devolucaoId, codigo)} />
      )}
      {status === 'EM_CONFERENCIA' && souConferente && (
        <Link href={`/fluxo/devolucoes/${codigo}/conferencia`} className={`${BOTAO_PRIMARIO} min-h-14 w-full text-lg`}>
          Continuar conferência
        </Link>
      )}
      {status === 'EM_CONFERENCIA' && ehGestor && !souConferente && (
        <FormularioLiberarTrava acao={liberarTravaAcao.bind(null, devolucaoId, codigo)} conferente={d.conferenteNome ?? 'outra pessoa'} />
      )}

      {d.evidencias.length > 0 && (
        <>
          <h3 className="text-sm font-bold">Evidências</h3>
          <Galeria d={d} links={links} />
          <p className="text-xs text-texto-2">Os links das fotos e do vídeo valem 10 minutos. Para gerar novos, recarregue a página.</p>
        </>
      )}
      {d.conferidaEm && (
        <>
          <h3 className="text-sm font-bold">Resultado de cada unidade</h3>
          <ResultadoUnidades d={d} />
        </>
      )}
    </section>
  );
}
```

> A `<section>` com `aria-labelledby` vira a região "Conferência" (os testes a encontram com `getByRole('region', { name: 'Conferência' })`).

- [ ] **Passo 4: "Conferir pacote" e os botões das etapas**

`src/app/(app)/fluxo/conferencia/acoes.ts`:

```ts
'use server';

import { redirect } from 'next/navigation';
import { obterDb } from '@/db';
import { textoDoForm } from '@/lib/formulario';
import { exigirPermissao } from '@/modules/auth/servidor';
import { localizarParaConferencia } from '@/modules/conferencia/localizar';
import { iniciarConferencia } from '@/modules/conferencia/trava';
import { ErroDevolucao } from '@/modules/devolucoes/erros';

export type EstadoConferirPacote = { erros: string[] };

export async function abrirConferenciaAcao(_anterior: EstadoConferirPacote, dados: FormData): Promise<EstadoConferirPacote> {
  const usuario = await exigirPermissao('operar_devolucoes');
  const db = obterDb();
  let codigo: string;
  try {
    const d = await localizarParaConferencia(db, textoDoForm(dados, 'codigo'), usuario);
    await iniciarConferencia(db, d.id, usuario);
    codigo = d.codigo;
  } catch (erro) {
    if (erro instanceof ErroDevolucao) return { erros: [erro.message] };
    throw erro;
  }
  redirect(`/fluxo/devolucoes/${codigo}/conferencia`);
}
```

`src/app/(app)/fluxo/conferencia/FormularioConferirPacote.tsx`:

```tsx
'use client';

import { useCallback, useRef } from 'react';
import { LeitorCodigo } from '@/components/conferencia/LeitorCodigo';
import { ListaErros } from '@/components/ListaErros';
import { BOTAO_PRIMARIO, CAMPO, ROTULO } from '@/components/estilos';
import { useEnvioFormulario } from '@/components/useEnvioFormulario';
import type { EstadoConferirPacote } from './acoes';

type Acao = (anterior: EstadoConferirPacote, dados: FormData) => Promise<EstadoConferirPacote>;

/** Uma mão: a câmera lê a etiqueta e já abre a conferência; o campo aceita digitação ou leitor USB. */
export function FormularioConferirPacote({ acao }: { acao: Acao }) {
  const [estado, aoEnviar, pendente] = useEnvioFormulario(acao, { erros: [] });
  const formularioRef = useRef<HTMLFormElement>(null);
  const campoRef = useRef<HTMLInputElement>(null);
  const aoLer = useCallback((codigo: string) => {
    if (!campoRef.current || !formularioRef.current) return;
    campoRef.current.value = codigo;
    formularioRef.current.requestSubmit();
  }, []);
  return (
    <div className="flex flex-col gap-4">
      <ListaErros erros={estado.erros} />
      <LeitorCodigo rotulo="Ler com a câmera" titulo="Leitor da etiqueta do pacote" instrucao="Aponte para a etiqueta de rastreio do pacote." aoLer={aoLer} />
      <form ref={formularioRef} onSubmit={aoEnviar} className="flex flex-col gap-3">
        <label htmlFor="codigo" className={ROTULO}>
          Código de Rastreamento ou código DEV
        </label>
        <input
          ref={campoRef}
          id="codigo"
          name="codigo"
          required
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          className={`${CAMPO} h-14 font-mono text-lg`}
        />
        <button type="submit" disabled={pendente} className={`${BOTAO_PRIMARIO} min-h-14 text-lg`}>
          {pendente ? 'Abrindo…' : 'Abrir conferência'}
        </button>
      </form>
    </div>
  );
}
```

`src/app/(app)/fluxo/conferencia/page.tsx`:

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { LINK_VOLTAR } from '@/components/estilos';
import { exigirPermissao } from '@/modules/auth/servidor';
import { abrirConferenciaAcao } from './acoes';
import { FormularioConferirPacote } from './FormularioConferirPacote';

export const metadata: Metadata = { title: 'Conferir pacote · Gestão de Devoluções' };

/** (extra, decisão 13) Na bancada: lê a etiqueta do pacote e abre a conferência dele. */
export default async function PaginaConferirPacote() {
  await exigirPermissao('operar_devolucoes');
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-3">
      <Link href="/fluxo/etapa/2" className={`${LINK_VOLTAR} self-start`}>
        ← Pedidos Chegados - Aguardando Conferência
      </Link>
      <div>
        <h1 className="text-xl font-bold">Conferir pacote</h1>
        <p className="text-sm text-texto-2">Leia a etiqueta de rastreio do pacote (ou digite o código DEV) para abrir a conferência.</p>
      </div>
      <FormularioConferirPacote acao={abrirConferenciaAcao} />
    </div>
  );
}
```

Em `src/app/(app)/fluxo/etapa/[numero]/page.tsx`, troque o bloco `if (numero === 2) { ... }` da função `acoesDaEtapa` por:

```tsx
  if (numero === 2) {
    return (
      <>
        <Link href="/fluxo/recebimento" className={BOTAO_PRIMARIO}>
          Recebimento
        </Link>
        <Link href="/fluxo/conferencia" className={BOTAO_SECUNDARIO}>
          Conferir pacote
        </Link>
      </>
    );
  }
  if (numero === 3) {
    return (
      <Link href="/fluxo/conferencia" className={BOTAO_PRIMARIO}>
        Conferir pacote
      </Link>
    );
  }
```

Rode: `npm run test:int -- src/modules/conferencia && npm run typecheck && npm run lint && npm run test:e2e -- tests/e2e/conferencia-detalhe.spec.ts tests/e2e/conferencia.spec.ts tests/e2e/fluxo.spec.ts`
Esperado: PASS (o `fluxo.spec.ts` da Fase 1 continua verde com os botões novos).

- [ ] **Passo 5: Commitar**

```bash
cd "/c/Users/idmpc/devolucoes-wt/fase-2"
git add src/modules/conferencia/localizar.ts src/modules/conferencia/localizar.int.test.ts "src/app/(app)/fluxo/devolucoes/[codigo]/secoes" "src/app/(app)/fluxo/conferencia" "src/app/(app)/fluxo/etapa" tests/e2e/conferencia-detalhe.spec.ts
git commit -m "feat: seção Conferência no detalhe (iniciar, continuar, liberar trava, evidências e resultado) e Conferir pacote nas etapas 2 e 3" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 20: Recebimento: Fotos 1 e 2 do pacote não identificado (spec §6.2)

**Arquivos:**
- Criar: `src/components/conferencia/FotosPacote.tsx`
- Modificar: `src/app/(app)/fluxo/recebimento/acoes.ts`, `src/app/(app)/fluxo/recebimento/FormularioRecebimento.tsx` (donos na janela: Fase 2)
- Testes: `tests/e2e/recebimento-fotos.spec.ts`

**Interfaces:**
- Consome: `criarNaoIdentificada` (Fase 1); `useFilaEnvios`, `comprimirFoto`, `novoIdCliente` (Tarefa 16); `SlotEvidencia`, `estadoDoSlot` (Tarefa 17); a regra do Recebimento em `autorizarEnvio` (Tarefa 12).
- Produz: `EstadoRecebimento` de sucesso ganha `naoIdentificada?: { id: string; codigo: string }`; `FotosPacote({ devolucaoId })` (Fotos 1 e 2 com a mesma fila offline da conferência).

- [ ] **Passo 1: Escrever o teste ponta a ponta que falha**

`tests/e2e/recebimento-fotos.spec.ts`:

```ts
import { eq } from 'drizzle-orm';
import { expect, test } from '@playwright/test';
import { devolucoes, evidencias } from '../../src/db/schema';
import { codigoUnico, comBanco, entrarComo, semRolagemLateral } from './apoio';
import { esperarEnviada, fotoDeTeste } from './apoio-conferencia';
import { USUARIOS_E2E } from './dados';

test('pacote não identificado: registra e já tira a Foto 1 e a Foto 2 (spec §6.2)', async ({ page }) => {
  const rastreio = codigoUnico('NIF');
  await entrarComo(page, USUARIOS_E2E.operador);
  await page.goto('/fluxo/recebimento');
  await page.getByLabel('Código de Rastreamento').fill(rastreio);
  await page.getByRole('button', { name: 'Registrar chegada' }).click();
  await page.getByRole('button', { name: 'Registrar pacote não identificado' }).click();
  await expect(page.getByRole('heading', { name: 'Fotos do pacote' })).toBeVisible();
  await semRolagemLateral(page);
  await page.getByLabel('Tirar Foto 1', { exact: true }).setInputFiles(await fotoDeTeste('etiqueta.jpg'));
  await page.getByLabel('Tirar Foto 2', { exact: true }).setInputFiles(await fotoDeTeste('embalagem.jpg'));
  await esperarEnviada(page, 'Foto 1');
  await esperarEnviada(page, 'Foto 2');
  const tipos = await comBanco(async (db) => {
    const [d] = await db.select({ id: devolucoes.id }).from(devolucoes).where(eq(devolucoes.rastreio, rastreio));
    return (await db.select({ tipo: evidencias.tipo }).from(evidencias).where(eq(evidencias.devolucaoId, d.id))).map((e) => e.tipo).sort();
  });
  expect(tipos).toEqual(['FOTO_1_ETIQUETA', 'FOTO_2_EMBALAGEM']);
});
```

Rode: `npm run test:e2e -- tests/e2e/recebimento-fotos.spec.ts`
Esperado: FAIL (não aparecem as fotos depois do registro).

- [ ] **Passo 2: Fotos do pacote**

`src/components/conferencia/FotosPacote.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { ALERTA_ERRO } from '@/components/estilos';
import { comprimirFoto } from '@/components/midia/comprimirFoto';
import { novoIdCliente } from '@/components/midia/idCliente';
import { useFilaEnvios } from '@/components/midia/useFilaEnvios';
import { DESCRICAO_EVIDENCIA, EVIDENCIAS_DO_PACOTE, ROTULO_EVIDENCIA, type TipoEvidencia } from '@/modules/midia/dominio';
import { estadoDoSlot } from './estadoSlot';
import { SlotEvidencia } from './SlotEvidencia';

/** Spec §6.2: o pacote não identificado é registrado com a Foto 1 e a Foto 2 (ajudam o Gestor a achar o pedido). */
export function FotosPacote({ devolucaoId }: { devolucaoId: string }) {
  const { envios, concluidos, adicionar, tentarDeNovo } = useFilaEnvios(devolucaoId);
  const [erro, setErro] = useState<string | null>(null);

  async function escolher(tipo: TipoEvidencia, arquivo: File) {
    setErro(null);
    try {
      await adicionar({ idCliente: novoIdCliente(), itemId: null, tipo, nome: `${tipo.toLowerCase()}.jpg`, tipoConteudo: 'image/jpeg', arquivo: await comprimirFoto(arquivo) });
    } catch {
      setErro('Não foi possível ler esta foto. Tire de novo pela câmera.');
    }
  }

  return (
    <section aria-labelledby="titulo-fotos-pacote" className="flex flex-col gap-3">
      <h2 id="titulo-fotos-pacote" className="text-base font-bold">
        Fotos do pacote
      </h2>
      <p className="text-sm text-texto-2">Tire agora a Foto 1 e a Foto 2: elas ajudam o Gestor a identificar o pedido.</p>
      {erro && (
        <p role="alert" className={ALERTA_ERRO}>
          {erro}
        </p>
      )}
      {EVIDENCIAS_DO_PACOTE.map((tipo) => (
        <SlotEvidencia
          key={tipo}
          titulo={ROTULO_EVIDENCIA[tipo]}
          descricao={DESCRICAO_EVIDENCIA[tipo]}
          estado={estadoDoSlot({ tipo, itemId: null }, { envios, concluidos, evidencias: [] })}
          aoEscolher={(a) => void escolher(tipo, a)}
          aoTentarDeNovo={(id) => void tentarDeNovo(id)}
        />
      ))}
    </section>
  );
}
```

Em `src/app/(app)/fluxo/recebimento/acoes.ts`:

1. Troque a linha `| { tipo: 'sucesso'; titulo: string; mensagem: string; codigos: string[] }` por:

```ts
  | { tipo: 'sucesso'; titulo: string; mensagem: string; codigos: string[]; naoIdentificada?: { id: string; codigo: string } }
```

2. No `return` do ramo `criar_nao_identificada`, logo depois de `codigos: [criada.codigo],`, acrescente:

```ts
        naoIdentificada: { id: criada.id, codigo: criada.codigo },
```

E altere a mensagem desse mesmo `return` para: `` `${criada.codigo} foi para "Pedidos Chegados - Aguardando Conferência", marcada como não identificada. Tire a Foto 1 e a Foto 2 abaixo; o Gestor liga ao pedido depois.` ``

Em `src/app/(app)/fluxo/recebimento/FormularioRecebimento.tsx`:

1. Acrescente o import:

```tsx
import { FotosPacote } from '@/components/conferencia/FotosPacote';
```

2. Logo depois de `<Resultado estado={estado} acao={acao} pendente={pendente} />`, acrescente:

```tsx
        {estado.tipo === 'sucesso' && estado.naoIdentificada && !cameraAberta && (
          <FotosPacote key={estado.naoIdentificada.id} devolucaoId={estado.naoIdentificada.id} />
        )}
```

Rode: `npm run typecheck && npm run lint && npm run test:e2e -- tests/e2e/recebimento-fotos.spec.ts tests/e2e/recebimento.spec.ts tests/e2e/camera.spec.ts`
Esperado: PASS (os testes do Recebimento da Fase 1 continuam verdes).

- [ ] **Passo 3: Commitar**

```bash
cd "/c/Users/idmpc/devolucoes-wt/fase-2"
git add src/components/conferencia/FotosPacote.tsx "src/app/(app)/fluxo/recebimento" tests/e2e/recebimento-fotos.spec.ts
git commit -m "feat: Fotos 1 e 2 do pacote não identificado no Recebimento, com a fila offline" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 21: Configurações "Conferência e mídias"

**Arquivos:**
- Criar: `src/modules/midia/configuracao.ts`
- Modificar (substituir o conteúdo): `src/app/(app)/configuracoes/conferencia/page.tsx`
- Criar: `src/app/(app)/configuracoes/conferencia/FormularioConferenciaMidias.tsx`, `.../conferencia/acoes.ts`
- Testes: `src/modules/midia/configuracao.test.ts`, `src/modules/midia/configuracao.int.test.ts`, `tests/e2e/configuracoes-conferencia.spec.ts`

**Interfaces:**
- Consome: `configuracoes`, `lerConfiguracao`, `VIDEO_OBRIGATORIO`, `ROTULO_VIDEO_OBRIGATORIO` (Tarefa 2); `registrarEvento` (entidade `configuracao`); `lerEnv` (`ARMAZENAMENTO`, `NODE_ENV`); `useEnvioFormulario`, `ListaErros`, `MensagemSucesso`, `RodapeFormulario` (Fase 1).
- Produz (contrato §5.6: a Fase 2 grava só os seus campos, com upsert na linha 1): `type DadosConfiguracaoMidia = { videoObrigatorio: VideoObrigatorio; mesesRetencaoMidia: number }`, `class ErroConfiguracao`, `validarConfiguracaoMidia(entrada)`, `salvarConfiguracaoMidia(db: Db, dados, usuario, agora?)`; página do Gestor com obrigatoriedade do Vídeo de Prova, prazo de guarda e o armazenamento em uso (com aviso quando é o disco em produção, contrato §9).

- [ ] **Passo 1: Escrever os testes que falham**

`src/modules/midia/configuracao.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { validarConfiguracaoMidia } from './configuracao';

describe('validarConfiguracaoMidia', () => {
  it('aceita a obrigatoriedade da lista e de 1 a 120 meses', () => {
    expect(validarConfiguracaoMidia({ videoObrigatorio: 'SO_PROBLEMA', mesesRetencaoMidia: ' 18 ' })).toEqual({
      dados: { videoObrigatorio: 'SO_PROBLEMA', mesesRetencaoMidia: 18 },
      erros: [],
    });
  });

  it('junta os erros', () => {
    expect(validarConfiguracaoMidia({ videoObrigatorio: 'AS_VEZES', mesesRetencaoMidia: '0' })).toEqual({
      dados: null,
      erros: ['Escolha quando o Vídeo de Prova é obrigatório.', 'Prazo de guarda: de 1 a 120 meses.'],
    });
    expect(validarConfiguracaoMidia({ videoObrigatorio: 'SEMPRE', mesesRetencaoMidia: '1,5' }).erros).toEqual(['Prazo de guarda: de 1 a 120 meses.']);
  });
});
```

`src/modules/midia/configuracao.int.test.ts`:

```ts
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { configuracoes, eventosHistorico } from '@/db/schema';
import { lerConfiguracao } from '@/modules/configuracoes/ler';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { salvarConfiguracaoMidia } from './configuracao';

const { db, sql } = criarDbTeste();
beforeEach(async () => {
  await limparTabelas(sql);
});
afterAll(async () => {
  await sql.end();
});

describe('salvarConfiguracaoMidia (contrato §5.6)', () => {
  it('cria a linha 1 ou atualiza só os campos da Fase 2, e registra no histórico', async () => {
    const gestor = await criarUsuarioTeste(db, 'GESTOR');
    await db.insert(configuracoes).values({ id: 1, razaoSocial: 'Empresa Ltda' }); // campo da Fase 4
    const agora = new Date('2026-11-12T20:00:00Z');
    await salvarConfiguracaoMidia(db, { videoObrigatorio: 'SO_PROBLEMA', mesesRetencaoMidia: 6 }, gestor, agora);
    expect(await lerConfiguracao(db)).toMatchObject({
      razaoSocial: 'Empresa Ltda',
      videoObrigatorio: 'SO_PROBLEMA',
      mesesRetencaoMidia: 6,
      atualizadoPor: gestor.id,
      atualizadoEm: agora,
    });
    const [evento] = await db
      .select({ entidade: eventosHistorico.entidade, entidadeId: eventosHistorico.entidadeId, dados: eventosHistorico.dados })
      .from(eventosHistorico)
      .where(eq(eventosHistorico.acao, 'configuracao_alterada'));
    expect(evento).toEqual({
      entidade: 'configuracao',
      entidadeId: '1',
      dados: { area: 'conferencia_midias', antes: { videoObrigatorio: 'SEMPRE', mesesRetencaoMidia: 12 }, depois: { videoObrigatorio: 'SO_PROBLEMA', mesesRetencaoMidia: 6 } },
    });
  });

  it('funciona sem linha nenhuma e recusa quem não é Gestor', async () => {
    const gestor = await criarUsuarioTeste(db, 'GESTOR');
    await salvarConfiguracaoMidia(db, { videoObrigatorio: 'SEMPRE', mesesRetencaoMidia: 24 }, gestor);
    expect((await lerConfiguracao(db)).mesesRetencaoMidia).toBe(24);
    const operador = await criarUsuarioTeste(db, 'OPERADOR');
    await expect(salvarConfiguracaoMidia(db, { videoObrigatorio: 'SEMPRE', mesesRetencaoMidia: 1 }, operador)).rejects.toThrow('Só o Gestor muda as Configurações.');
  });
});
```

`tests/e2e/configuracoes-conferencia.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { entrarComo, semRolagemLateral } from './apoio';
import { USUARIOS_E2E } from './dados';

test('o Gestor muda a obrigatoriedade do vídeo e o prazo de guarda, e vê o armazenamento', async ({ page }) => {
  await entrarComo(page, USUARIOS_E2E.gestor);
  await page.goto('/configuracoes/conferencia');
  await expect(page.getByRole('heading', { level: 1, name: 'Conferência e mídias' })).toBeVisible();
  await expect(page.getByText('Disco do servidor')).toBeVisible();
  await semRolagemLateral(page);

  await page.getByLabel(/^Só quando alguma unidade/).check();
  await page.getByLabel('Prazo de guarda das mídias (meses)').fill('6');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Configuração salva.' })).toBeFocused();
  await page.reload();
  await expect(page.getByLabel(/^Só quando alguma unidade/)).toBeChecked();
  await expect(page.getByLabel('Prazo de guarda das mídias (meses)')).toHaveValue('6');

  // Volta ao padrão: os outros testes da conferência contam com "Sempre".
  await page.getByLabel('Sempre').check();
  await page.getByLabel('Prazo de guarda das mídias (meses)').fill('12');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Configuração salva.' })).toBeVisible();
});

test('valor inválido mostra o erro com o foco nele', async ({ page }) => {
  await entrarComo(page, USUARIOS_E2E.gestor);
  await page.goto('/configuracoes/conferencia');
  await page.getByLabel('Prazo de guarda das mídias (meses)').fill('500');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('alert')).toContainText('Prazo de guarda: de 1 a 120 meses.');
  await expect(page.getByRole('alert')).toBeFocused();
});
```

Rode: `npm test -- src/modules/midia/configuracao.test.ts && npm run test:int -- src/modules/midia/configuracao.int.test.ts`
Esperado: FAIL (`./configuracao` não existe).

- [ ] **Passo 2: Implementar a gravação**

`src/modules/midia/configuracao.ts`:

```ts
import type { Db } from '@/db/client';
import { configuracoes } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { VIDEO_OBRIGATORIO, type VideoObrigatorio } from '@/modules/configuracoes/dominio';
import { lerConfiguracao } from '@/modules/configuracoes/ler';
import { registrarEvento } from '@/modules/historico/eventos';

export type DadosConfiguracaoMidia = { videoObrigatorio: VideoObrigatorio; mesesRetencaoMidia: number };

export class ErroConfiguracao extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroConfiguracao';
  }
}

export function validarConfiguracaoMidia(e: { videoObrigatorio: string; mesesRetencaoMidia: string }): {
  dados: DadosConfiguracaoMidia | null;
  erros: string[];
} {
  const erros: string[] = [];
  const video = (VIDEO_OBRIGATORIO as readonly string[]).includes(e.videoObrigatorio) ? (e.videoObrigatorio as VideoObrigatorio) : null;
  if (!video) erros.push('Escolha quando o Vídeo de Prova é obrigatório.');
  const texto = e.mesesRetencaoMidia.trim();
  const meses = /^\d{1,3}$/.test(texto) ? Number(texto) : Number.NaN;
  if (!(meses >= 1 && meses <= 120)) erros.push('Prazo de guarda: de 1 a 120 meses.');
  if (erros.length > 0 || !video) return { dados: null, erros };
  return { dados: { videoObrigatorio: video, mesesRetencaoMidia: meses }, erros: [] };
}

/** Upsert na linha 1 só dos campos da Fase 2 (contrato §5.6). A Fase 6 lê o prazo de guarda na tarefa midia.retencao. */
export async function salvarConfiguracaoMidia(db: Db, dados: DadosConfiguracaoMidia, usuario: UsuarioSessao, agora: Date = new Date()): Promise<void> {
  if (usuario.perfil !== 'GESTOR') throw new ErroConfiguracao('Só o Gestor muda as Configurações.');
  await db.transaction(async (tx) => {
    const antes = await lerConfiguracao(tx);
    const campos = { videoObrigatorio: dados.videoObrigatorio, mesesRetencaoMidia: dados.mesesRetencaoMidia, atualizadoPor: usuario.id, atualizadoEm: agora };
    await tx.insert(configuracoes).values({ id: 1, ...campos }).onConflictDoUpdate({ target: configuracoes.id, set: campos });
    await registrarEvento(tx, {
      entidade: 'configuracao',
      entidadeId: '1',
      acao: 'configuracao_alterada',
      usuarioId: usuario.id,
      em: agora,
      dados: {
        area: 'conferencia_midias',
        antes: { videoObrigatorio: antes.videoObrigatorio, mesesRetencaoMidia: antes.mesesRetencaoMidia },
        depois: { videoObrigatorio: dados.videoObrigatorio, mesesRetencaoMidia: dados.mesesRetencaoMidia },
      },
    });
  });
}
```

Rode: `npm test -- src/modules/midia/configuracao.test.ts && npm run test:int -- src/modules/midia/configuracao.int.test.ts`
Esperado: PASS.

- [ ] **Passo 3: A tela**

`src/app/(app)/configuracoes/conferencia/acoes.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { obterDb } from '@/db';
import { textoDoForm } from '@/lib/formulario';
import { exigirPermissao } from '@/modules/auth/servidor';
import { ErroConfiguracao, salvarConfiguracaoMidia, validarConfiguracaoMidia } from '@/modules/midia/configuracao';

export type EstadoConfiguracaoMidia = { erros: string[]; salvoEm: string | null };

export async function salvarConfiguracaoMidiaAcao(_anterior: EstadoConfiguracaoMidia, dados: FormData): Promise<EstadoConfiguracaoMidia> {
  const usuario = await exigirPermissao('administrar');
  const { dados: validos, erros } = validarConfiguracaoMidia({
    videoObrigatorio: textoDoForm(dados, 'videoObrigatorio'),
    mesesRetencaoMidia: textoDoForm(dados, 'mesesRetencaoMidia'),
  });
  if (!validos) return { erros, salvoEm: null };
  try {
    await salvarConfiguracaoMidia(obterDb(), validos, usuario);
  } catch (erro) {
    if (erro instanceof ErroConfiguracao) return { erros: [erro.message], salvoEm: null };
    throw erro;
  }
  revalidatePath('/configuracoes/conferencia');
  return { erros: [], salvoEm: new Date().toISOString() };
}
```

`src/app/(app)/configuracoes/conferencia/FormularioConferenciaMidias.tsx`:

```tsx
'use client';

import { ListaErros } from '@/components/ListaErros';
import { MensagemSucesso } from '@/components/MensagemSucesso';
import { RodapeFormulario } from '@/components/RodapeFormulario';
import { BOTAO_PRIMARIO, CAMPO, CARTAO, ROTULO } from '@/components/estilos';
import { useEnvioFormulario } from '@/components/useEnvioFormulario';
import { ROTULO_VIDEO_OBRIGATORIO, VIDEO_OBRIGATORIO, type VideoObrigatorio } from '@/modules/configuracoes/dominio';
import type { EstadoConfiguracaoMidia } from './acoes';

type Props = {
  acao: (anterior: EstadoConfiguracaoMidia, dados: FormData) => Promise<EstadoConfiguracaoMidia>;
  videoObrigatorio: VideoObrigatorio;
  mesesRetencaoMidia: number;
};

export function FormularioConferenciaMidias({ acao, videoObrigatorio, mesesRetencaoMidia }: Props) {
  const [estado, aoEnviar, pendente] = useEnvioFormulario(acao, { erros: [], salvoEm: null });
  return (
    <form onSubmit={aoEnviar} className={`${CARTAO} flex flex-col gap-4`}>
      {estado.salvoEm && <MensagemSucesso key={estado.salvoEm} texto="Configuração salva." />}
      <ListaErros erros={estado.erros} />
      <fieldset className="flex flex-col gap-1">
        <legend className={`${ROTULO} mb-1`}>Vídeo de Prova obrigatório</legend>
        {VIDEO_OBRIGATORIO.map((v) => (
          <label key={v} className="flex min-h-11 items-center gap-3 text-[15px]">
            <input type="radio" name="videoObrigatorio" value={v} defaultChecked={v === videoObrigatorio} className="size-5 shrink-0" />
            {ROTULO_VIDEO_OBRIGATORIO[v]}
          </label>
        ))}
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="mesesRetencaoMidia" className={ROTULO}>
          Prazo de guarda das mídias (meses)
        </label>
        <input
          id="mesesRetencaoMidia"
          name="mesesRetencaoMidia"
          defaultValue={String(mesesRetencaoMidia)}
          inputMode="numeric"
          autoComplete="off"
          aria-describedby="mesesRetencaoMidia-dica"
          className={CAMPO}
        />
        <p id="mesesRetencaoMidia-dica" className="text-xs text-texto-2">
          As fotos e os vídeos de devoluções concluídas há mais tempo são apagados (nunca os de lote em aberto ou contestação sem resposta).
        </p>
      </div>
      <RodapeFormulario>
        <button type="submit" disabled={pendente} className={BOTAO_PRIMARIO}>
          {pendente ? 'Salvando…' : 'Salvar'}
        </button>
      </RodapeFormulario>
    </form>
  );
}
```

`src/app/(app)/configuracoes/conferencia/page.tsx` (substitua o conteúdo):

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { ALERTA_ATENCAO, CARTAO, LINK_VOLTAR } from '@/components/estilos';
import { obterDb } from '@/db';
import { lerEnv } from '@/lib/env';
import { exigirPermissao } from '@/modules/auth/servidor';
import { lerConfiguracao } from '@/modules/configuracoes/ler';
import { salvarConfiguracaoMidiaAcao } from './acoes';
import { FormularioConferenciaMidias } from './FormularioConferenciaMidias';

export const metadata: Metadata = { title: 'Conferência e mídias · Gestão de Devoluções' };

/** Spec §6.8: obrigatoriedade do vídeo, prazo de guarda das mídias e armazenamento (este vem do .env, contrato D2). */
export default async function PaginaConferenciaMidias() {
  await exigirPermissao('administrar');
  const config = await lerConfiguracao(obterDb());
  const env = lerEnv();
  const noDisco = env.ARMAZENAMENTO === 'disco';
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
      <Link href="/configuracoes" className={`${LINK_VOLTAR} self-start`}>
        ← Configurações
      </Link>
      <h1 className="text-xl font-bold">Conferência e mídias</h1>
      <FormularioConferenciaMidias
        acao={salvarConfiguracaoMidiaAcao}
        videoObrigatorio={config.videoObrigatorio}
        mesesRetencaoMidia={config.mesesRetencaoMidia}
      />
      <section aria-labelledby="titulo-armazenamento" className={`${CARTAO} flex flex-col gap-2`}>
        <h2 id="titulo-armazenamento" className="text-base font-bold">
          Armazenamento
        </h2>
        <p className="text-[15px]">{noDisco ? 'Disco do servidor' : 'S3 (Backblaze B2 ou Cloudflare R2)'}</p>
        <p className="text-xs text-texto-2">Definido no arquivo de configuração do servidor (ARMAZENAMENTO), junto com as credenciais.</p>
        {noDisco && env.NODE_ENV === 'production' && (
          <p className={ALERTA_ATENCAO}>As mídias estão no disco do servidor: use só para teste. Ligue o B2 antes do uso diário.</p>
        )}
      </section>
    </div>
  );
}
```

Rode: `npm run typecheck && npm run lint && npm run test:e2e -- tests/e2e/configuracoes-conferencia.spec.ts tests/e2e/configuracoes.spec.ts`
Esperado: PASS (o `configuracoes.spec.ts` da Parte A só conferia a página do Mercado Livre como "em breve").

- [ ] **Passo 4: Commitar**

```bash
cd "/c/Users/idmpc/devolucoes-wt/fase-2"
git add src/modules/midia/configuracao.ts src/modules/midia/configuracao.test.ts src/modules/midia/configuracao.int.test.ts "src/app/(app)/configuracoes/conferencia" tests/e2e/configuracoes-conferencia.spec.ts
git commit -m "feat: Configurações Conferência e mídias (vídeo obrigatório, prazo de guarda e armazenamento em uso)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 22: Modo offline (service worker e página "Sem conexão")

**Por que assim:** spec §6.0: "o funcionamento offline vem na Fase 2". O Next 16 recomenda um service worker próprio para o carregamento offline (`node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md` e `offline-support.md`). O `experimental.useOffline` não é usado: é experimental, e a fila de envios (Tarefa 16) já cobre o que importa (decisão 14). Estratégia: navegação vai à rede primeiro e, sem rede, mostra a página "Sem conexão" guardada; arquivos de `/_next/static/` e `/zxing/` (nomes com hash) vêm do cache; `/api/*` e pedidos que não são GET nunca passam pelo cache. O service worker só é registrado no build de produção.

**Arquivos:**
- Criar: `public/sw.js`, `src/components/pwa/RegistrarServiceWorker.tsx`, `src/app/offline/page.tsx`
- Modificar: `next.config.ts` (cabeçalhos do `/sw.js`), `src/app/(app)/fluxo/devolucoes/[codigo]/conferencia/page.tsx`, `src/app/(app)/fluxo/recebimento/page.tsx`, `src/app/(app)/fluxo/conferencia/page.tsx`, `src/lib/manifesto.ts` (comentário)
- Testes: `tests/e2e/offline.spec.ts`

**Interfaces:**
- Consome: as páginas das Tarefas 18 a 20.
- Produz: `/sw.js` (cache `devolucoes-v1`), `RegistrarServiceWorker()`, a página pública `/offline` ("Sem conexão").

- [ ] **Passo 1: Escrever o teste ponta a ponta que falha**

`tests/e2e/offline.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { entrarComo, semRolagemLateral } from './apoio';
import { USUARIOS_E2E } from './dados';

test('a página "Sem conexão" abre sem login e cabe no celular', async ({ page }) => {
  await page.goto('/offline');
  await expect(page.getByRole('heading', { level: 1, name: 'Sem conexão' })).toBeVisible();
  await semRolagemLateral(page);
});

test('depois de abrir a bancada uma vez, sem internet a navegação mostra "Sem conexão"', async ({ page, context }) => {
  await entrarComo(page, USUARIOS_E2E.operador);
  await page.goto('/fluxo/conferencia');
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          await navigator.serviceWorker.ready;
          return navigator.serviceWorker.controller !== null;
        }),
      { timeout: 20_000 },
    )
    .toBe(true);
  await context.setOffline(true);
  try {
    await page.goto('/fluxo');
    await expect(page.getByRole('heading', { level: 1, name: 'Sem conexão' })).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});
```

Rode: `npm run test:e2e -- tests/e2e/offline.spec.ts`
Esperado: FAIL (`/offline` não existe; não há service worker).

- [ ] **Passo 2: Service worker, registro e página "Sem conexão"**

`public/sw.js`:

```js
// Modo offline básico (spec §6.0, Fase 2). Sem build: este arquivo é servido como está.
// - navegação: rede primeiro; sem rede, a página "Sem conexão" guardada;
// - /_next/static e /zxing: do cache (os nomes têm hash ou não mudam);
// - /api/* e pedidos que não são GET: nunca passam por aqui (upload tus, links das mídias, Server Actions).
const VERSAO = 'devolucoes-v1';
const PAGINA_OFFLINE = '/offline';

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches
      .open(VERSAO)
      .then((cache) => cache.add(new Request(PAGINA_OFFLINE, { cache: 'reload' })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((chaves) => Promise.all(chaves.filter((c) => c !== VERSAO).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;
  if (pedido.method !== 'GET') return;
  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (pedido.mode === 'navigate') {
    evento.respondWith(fetch(pedido).catch(() => caches.match(PAGINA_OFFLINE)));
    return;
  }

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/zxing/')) {
    evento.respondWith(
      caches.open(VERSAO).then(async (cache) => {
        const guardado = await cache.match(pedido);
        if (guardado) return guardado;
        const resposta = await fetch(pedido);
        if (resposta.ok) cache.put(pedido, resposta.clone());
        return resposta;
      }),
    );
  }
});
```

`src/components/pwa/RegistrarServiceWorker.tsx`:

```tsx
'use client';

import { useEffect } from 'react';

/**
 * Registra o service worker do modo offline. Só no build de produção: no `next dev` ele atrapalharia o recarregamento.
 * Fica nas telas da bancada (conferência, Recebimento, Conferir pacote); depois de registrado, vale para o site todo.
 */
export function RegistrarServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
  }, []);
  return null;
}
```

`src/app/offline/page.tsx`:

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { BOTAO_PRIMARIO } from '@/components/estilos';

export const metadata: Metadata = { title: 'Sem conexão · Gestão de Devoluções' };

/** Mostrada pelo service worker quando a navegação falha por falta de internet. Pública e estática. */
export default function PaginaSemConexao() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-4 py-10">
      <h1 className="text-2xl font-bold">Sem conexão</h1>
      <p className="text-[15px]">
        O aparelho está sem internet. As fotos e os vídeos da conferência ficam guardados nele e sobem sozinhos quando a conexão voltar.
      </p>
      <p className="text-[15px] text-texto-2">Para concluir a conferência é preciso estar com internet.</p>
      <Link href="/fluxo" prefetch={false} className={`${BOTAO_PRIMARIO} min-h-14 text-lg`}>
        Tentar de novo
      </Link>
    </main>
  );
}
```

Em `next.config.ts`, logo depois da linha `serverExternalPackages: [...]`, acrescente:

```ts
  // O service worker nunca fica em cache (cada deploy entrega o novo) e é servido como JavaScript.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
```

Registre o service worker nas três telas da bancada, acrescentando o import `import { RegistrarServiceWorker } from '@/components/pwa/RegistrarServiceWorker';` e o elemento `<RegistrarServiceWorker />` como **primeiro filho** do `<div>` principal retornado por:
- `src/app/(app)/fluxo/devolucoes/[codigo]/conferencia/page.tsx` (antes de `<AssistenteConferencia ...>`);
- `src/app/(app)/fluxo/recebimento/page.tsx` (antes do `<Link>` de voltar);
- `src/app/(app)/fluxo/conferencia/page.tsx` (antes do `<Link>` de voltar).

Em `src/lib/manifesto.ts`, troque o comentário `/** App instalável na tela inicial (PWA básico da Fase 1). Sem service worker: o modo offline é da Fase 2. */` por `/** App instalável na tela inicial (PWA). O modo offline básico é o service worker em public/sw.js (Fase 2). */`.

Rode: `npm run typecheck && npm run lint && npm run test:e2e -- tests/e2e/offline.spec.ts tests/e2e/pwa.spec.ts tests/e2e/conferencia.spec.ts`
Esperado: PASS nos dois projetos.

- [ ] **Passo 3: Commitar**

```bash
cd "/c/Users/idmpc/devolucoes-wt/fase-2"
git add public/sw.js src/components/pwa src/app/offline next.config.ts "src/app/(app)/fluxo" src/lib/manifesto.ts tests/e2e/offline.spec.ts
git commit -m "feat: modo offline básico (service worker, página Sem conexão e estáticos em cache)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 23: Integração

> Contrato §7. A Fase 2 é a primeira a entrar no `main` (ordem: merge 2 → merge 3 → merge 4), então não há teste entre fases a fazer aqui; as Fases 3 e 4 fazem os delas com a 2 já no `main`.

**Arquivos:** os que o merge tocar; `package.json` e `package-lock.json` se houver conflito; `drizzle/` só se o schema da fase tiver mudado (a Parte B não muda o schema).

- [ ] **Passo 1: Trazer o `main` para a worktree**

```bash
cd "/c/Users/idmpc/devolucoes-wt/fase-2"
git status --short
git merge main
```

Esperado: merge limpo ou com conflitos só nos arquivos permitidos pela regra do contrato §3.

- [ ] **Passo 2: Resolver conflitos pelas regras do contrato §3**

- **Lockfile:** nunca juntar à mão. Pegue os do `main` e reinstale as dependências da Fase 2:

```bash
git checkout main -- package.json package-lock.json
npm install --save-exact @tus/server@2.4.6 @tus/file-store@2.1.1 tus-js-client@4.3.1 idb-keyval@6.3.0 sharp@0.35.5 @aws-sdk/client-s3@3.1167.0 @aws-sdk/s3-request-presigner@3.1167.0
```

- **Arquivos congelados** (`src/db/schema/index.ts`, `devolucoes.ts`, `src/lib/env.ts`, scripts do `package.json`, `tests/e2e/global-setup.ts`, `apoio.ts`, `dados.ts`, `[codigo]/page.tsx`, `configuracoes/page.tsx`): fica a versão do `main`. Se a Fase 2 precisou mudar algum, a mudança tinha de ter ido antes ao `main` como emenda.
- **Migrações:** a Parte B não mexe no schema. Confira:

```bash
npm run db:gerar -- --name fase2_conferencia
git status --short drizzle
```

Esperado: "No schema changes" e nada novo em `drizzle/`. Se aparecer uma migração, siga o procedimento do contrato §3 (descartar as da branch, regenerar uma só com esse nome) e recrie o banco de testes da fase.

- [ ] **Passo 3: Recriar o banco de testes da fase e rodar tudo**

```bash
PG="/c/Program Files/PostgreSQL/17/bin"; export PGPASSWORD="$(cat /c/Users/idmpc/.postgres-superusuario.txt)"
"$PG/dropdb.exe" -U postgres --if-exists devolucoes_test_f2 && "$PG/createdb.exe" -U postgres -O devolucoes devolucoes_test_f2
cd "/c/Users/idmpc/devolucoes-wt/fase-2"
npm run typecheck && npm run lint && npm test && npm run test:int && npm run build:scripts && npm run test:e2e
```

Esperado: tudo verde nos dois projetos do e2e. Os testes do ffmpeg rodam (o ffmpeg está instalado desde o início da Parte B).

- [ ] **Passo 4: Conferir o critério de pronto no PC (spec §14: "Conferência completa no celular, com o vídeo comprimido")**

1. `npm run dev -- --port 3002` e, em outro terminal, `npm run worker`.
2. No Chrome do PC, ferramentas do desenvolvedor no modo celular (390×844), entre como Operador, cadastre e receba uma devolução de 2 unidades.
3. Faça a conferência inteira (Fotos 1 a 4, EAN, uma unidade ausente, um vídeo de 1 minuto do celular, destinos) e conclua.
4. No detalhe: as fotos aparecem com o carimbo (data, DEV e nome) e o Vídeo de Prova toca; no `.dados/midia/evidencias/<id>/` o `.mp4` tem cerca de 10 a 15 MB por minuto.
5. No modo avião do DevTools ("Offline"), tire uma foto: fica "Aguardando conexão"; volte para "No throttling": a foto sobe sozinha.

- [ ] **Passo 5: Commitar o merge**

```bash
cd "/c/Users/idmpc/devolucoes-wt/fase-2"
git add -A
git commit -m "chore: integra o main na fase 2 (lockfile refeito, sem migração nova)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Se o merge do Passo 1 não teve conflito, o Git já criou o commit; pule este passo.)

- [ ] **Passo 6: No `main`, depois do merge (controlador)**

```bash
cd "/c/Users/idmpc/Dvoluções Markt"
git merge --no-ff fase-2-conferencia
PG="/c/Program Files/PostgreSQL/17/bin"; export PGPASSWORD="$(cat /c/Users/idmpc/.postgres-superusuario.txt)"
"$PG/dropdb.exe" -U postgres --if-exists devolucoes_test && "$PG/createdb.exe" -U postgres -O devolucoes devolucoes_test
npm ci && npm run typecheck && npm run lint && npm test && npm run test:int && npm run build:scripts && npm run test:e2e
npm run db:migrar
git worktree remove "C:/Users/idmpc/devolucoes-wt/fase-2"
"$PG/dropdb.exe" -U postgres --if-exists devolucoes_f2 && "$PG/dropdb.exe" -U postgres --if-exists devolucoes_test_f2
```

Depois, o integrador acrescenta ao `README.md` (só ele edita o README, contrato §3) uma seção curta "Conferência no celular (Fase 2)": instalar o ffmpeg (`winget install Gyan.FFmpeg`), rodar o worker junto do site (`npm run worker`), onde ficam as mídias no PC (`.dados/`) e as variáveis novas do `.env`. As worktrees das Fases 3 e 4 fazem `git merge main` logo em seguida (contrato §7).

---

## Depois da fase (usuário, com o controlador)

1. **Publicar** (push e deploy são do usuário): no `.env.producao` da VPS, conferir `SEGREDO_LINKS` (`openssl rand -hex 32`), `ARMAZENAMENTO=disco`, `MIDIA_DIR=/data/midia`, `MIDIA_TMP_DIR=/data/tmp`, `ML_CONECTOR=api`, `EMISSOR_NFE=focus`. Atualizar o bloco do nginx da VPS com a `location /api/midia` de `docker/nginx/devolucoes.conf` e `sudo nginx -t && sudo systemctl reload nginx`. Rodar `scripts/deploy.sh`: sobem `web`, `worker` e o volume `midia`. Conferir `docker compose logs worker` ("worker iniciado" com as três tarefas de mídia) e `docker image ls` (tamanho da imagem com o ffmpeg).
2. **Teste nos aparelhos reais da bancada** (spec §16; pesquisa §10.5), anotando modelo e versão:
   - Android (Chrome) e iPhone (Safari e app instalado na tela inicial): Fotos 1 a 4 pela câmera, foto em pé (orientação certa no carimbo), leitura do EAN pela câmera.
   - Vídeo de 1 a 2 minutos gravado na hora; no iPhone, com "Alta eficiência" (HEVC) ligada: o vídeo comprimido toca e as cores não ficam lavadas (HDR).
   - Envio de um vídeo grande desligando o Wi-Fi no meio: continua de onde parou quando a rede volta.
   - Texto do carimbo legível (fonte instalada na imagem).
   - Tempo da compressão de 1 minuto na VPS (`docker compose logs worker`, campo `ms` da tarefa `midia.transcodificar`) e tamanho do `.mp4`.
3. **Armazenamento B2:** fica para a etapa "Ligação das contas reais" (contrato §9): criar o bucket privado, a chave de aplicação, preencher `S3_*`, trocar para `ARMAZENAMENTO=s3` e conferir um link temporário. Até lá, a tela "Conferência e mídias" avisa que o disco é só para teste.
4. **Pendências anotadas para fases seguintes:** a tela "Falhas" (Fase 6) mostra as tarefas `midia.*` que esgotaram as tentativas; a tarefa `midia.retencao` (Fase 6) usa `meses_retencao_midia`; o alerta de disco cheio (pesquisa §7.4) entra no painel da Fase 6.

## Autorrevisão: cobertura da spec

| Spec / contrato | Onde |
|---|---|
| §6.3 passos 1 a 5 (Fotos 1 a 4, leitura do código, S/N, lote, validade, Vídeo de Prova, destino, ausente) | Tarefas 10, 17, 18 |
| §6.3 regras (não termina sem evidência; resultado ao ML) | Tarefa 11 (pendências, `ml.enviar-resultado`), Tarefa 18 (tela) |
| §6.0 conferência no celular (segmentos, cartão do produto com EAN, grade, rodapé fixo) e mobile-first | Tarefas 17 e 18 |
| §6.0 funcionamento offline | Tarefas 16 (IndexedDB), 22 (service worker) |
| §6.2 Fotos 1 e 2 do pacote não identificado | Tarefas 12 (regra), 20 (tela) |
| §5.2 e §11 trava da conferência, Gestor libera | Tarefas 9 e 19 |
| §9 compressão no celular, tus, ffmpeg 720p, carimbo (extra), SHA-256, links de 10 min, S3 | Tarefas 6, 12 a 16 |
| §6.8 vídeo obrigatório, prazo de guarda, armazenamento | Tarefa 21 |
| §12 e2e com upload de arquivos de teste, nos dois projetos | Tarefas 18 a 22 |
| Contrato §2 (P2) itens 1 a 11 | Tarefas 1 a 8 (o foco visível já existia: Tarefa 1, Passo 4) |
| Contrato §5.4 `concluirConferencia` | Tarefa 11 |
| Contrato §7 Integração | Tarefa 23 |
