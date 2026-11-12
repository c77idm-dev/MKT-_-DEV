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

<!-- CONTINUA -->
