# Pesquisa técnica: Fase 2 (conferência no celular com fotos e vídeo)

Data da pesquisa: 2026-11-12. Referência: spec §4.1-4.3, §6.3, §9, §11.
Legenda: **(verificado)** = conferido agora no npm, na documentação oficial ou em `node_modules/next/dist/docs`. **NÃO CONFIRMADO** = conhecimento geral ou estimativa; validar antes de depender dele (de preferência com um teste de 1 hora em aparelhos reais).

## 0. Stack recomendada (resumo)

| Tema | Recomendação |
|---|---|
| Captura | `<input type="file" capture="environment">` para foto e vídeo (câmera nativa). Dois botões no vídeo: "Gravar" (com `capture`) e "Escolher arquivo" (sem). `getUserMedia` só para o leitor de código de barras. |
| Compressão de foto | Função própria (~40 linhas): `createImageBitmap(file, {imageOrientation:'from-image'})` + canvas + `toBlob('image/jpeg', 0.8)`, lado maior 1600 px. Sem biblioteca. |
| Upload | **tus** para foto e vídeo: `@tus/server` 2.4.7 + `@tus/file-store` 2.1.2 montados com `server.handleWeb` em route handler; cliente `tus-js-client` 4.3.1 com `chunkSize` de 5 MB. |
| nginx | `location /api/midia/` própria: `client_max_body_size 12m`, `proxy_request_buffering off`, timeouts de 120 s. O resto do site continua em 1m. |
| Fila no celular | IndexedDB com `idb-keyval` 6.3.0 (`createStore` próprio) guardando Blob + metadados; retry com espera crescente e jitter; reenvio ao abrir o app, ao voltar o `online` e por botão. |
| Tarefas de fundo | `pg-boss` **12.38.2** (versão atual; v10 só em manutenção). Processo `worker` do mesmo repositório, empacotado com esbuild em `dist/worker.mjs`. |
| Transcodificação | ffmpeg do apt (`--no-install-recommends`) no estágio final da imagem. H.264 High, `-preset veryfast -crf 28 -maxrate 1500k`, AAC 96 kbps, `+faststart`. Concorrência 1. Chamado com `spawn` sem shell. |
| Armazenamento | O disco da VPS serve só de **área temporária**. Destino final: **Backblaze B2** (mais barato) via `@aws-sdk/client-s3` 3.1167.0, atrás da interface `ArmazenamentoArquivos`. R2 é a alternativa equivalente. |
| Carimbo | `sharp` 0.35.5: `rotate()` + `composite` de SVG. Instalar `fonts-dejavu-core` na imagem (senão o texto não aparece). |
| SHA-256 | `crypto.createHash('sha256')` alimentado por stream. Para o tus: hash do arquivo em disco ao final do upload (tarefa `midia.transcodificar`/`midia.finalizar`). |

**Riscos principais (detalhes nas seções):**
1. O disco livre da VPS (~13 GB) enche em poucos dias com 35-50 GB/mês de mídia. O armazenamento S3 precisa estar pronto na Fase 2, não "depois".
2. Sem fontes na `bookworm-slim`, o carimbo do sharp sai em branco/quadrados.
3. O `expireInSeconds` padrão do pg-boss é 15 min; transcodificação lenta em 1 vCPU precisa de valor maior, ou o job é reexecutado no meio.
4. iOS Safari não tem Background Sync: o upload só acontece com o app aberto. Fila no IndexedDB mitiga, mas há evicção do iOS em sites não instalados.
5. Vídeos de iPhone podem vir em HEVC e HDR; o ffmpeg decodifica, mas HDR 10 bits para 8 bits sem tonemap sai "lavado" (NÃO CONFIRMADO, testar com um clipe real).

---

## 1. Captura de foto e vídeo no navegador do celular

### 1.1 `<input type=file capture>` vs `getUserMedia` + `MediaRecorder`

| Critério | `<input capture>` | `getUserMedia` + `MediaRecorder` |
|---|---|---|
| Qualidade/estabilidade | Usa o app de câmera do sistema: foco, estabilização, flash, gravação longa estável | Qualidade e bitrate controlados pelo navegador; vídeo costuma sair com bitrate baixo e sem metadados de duração/seek (WebM no Chrome) |
| Formato de vídeo | MP4/MOV (H.264 ou HEVC), tocável e processável pelo ffmpeg | Chrome: WebM (VP8/VP9; H.264 em versões novas, NÃO CONFIRMADO). iOS Safari 14.3+: MP4 |
| Requisitos | Funciona em HTTP e HTTPS | Exige HTTPS e permissão de câmera/microfone (iOS reabre o prompt com frequência em PWA) |
| Memória | O arquivo vem pronto do sistema | `MediaRecorder` acumula chunks em RAM; gravações longas arriscam o aba |
| Sobrevive a sair do app | Sim (a câmera nativa é outro app), mas a aba pode ser recarregada ao voltar (Android com pouca RAM) | Não: sair do app/bloquear a tela interrompe a gravação |

**Recomendação:** `<input capture>` para todas as evidências. Para "gravar na hora ou enviar um arquivo" (spec §6.3 passo 4) use **dois controles**:
- Foto: `<input type="file" accept="image/*" capture="environment">`.
- Vídeo gravar: `<input type="file" accept="video/*" capture="environment">`.
- Vídeo arquivo: `<input type="file" accept="video/*">` (sem `capture`; no iOS abre o seletor com Fototeca/Arquivos).

Use `getUserMedia` apenas para o leitor de código de barras (`BarcodeDetector`/ZXing, §4.2), que precisa de quadros ao vivo.

### 1.2 iOS Safari e Android Chrome: armadilhas
- `capture` é respeitado em ambos (atributo HTML padrão, MDN: `HTMLInputElement.capture`). Sem `capture`, o iOS mostra um menu (Fototeca / Tirar foto ou vídeo / Escolher arquivo). NÃO CONFIRMADO o comportamento exato por versão de iOS; testar em iOS 17/18.
- **iOS grava em HEVC/MOV** quando a câmera está em "Alta eficiência" (padrão). Fotos podem vir em HEIC; ao usar `accept="image/*"`, o Safari normalmente entrega JPEG convertido, mas NÃO CONFIRMADO em todos os casos. A compressão via canvas (seção 2) normaliza para JPEG de qualquer forma, porque o Safari decodifica HEIC no `createImageBitmap`.
- **Android:** a atividade do navegador pode ser destruída enquanto o app de câmera está aberto (pouca RAM). Ao voltar, o formulário pode recarregar. Mitigação: guardar o estado do assistente (passo atual, item) em `sessionStorage`/IndexedDB a cada passo, e gravar o arquivo no IndexedDB logo que o `change` disparar.
- O arquivo do `<input>` só dá um `File` (referência); ler por inteiro em memória um vídeo de 100 MB é pesado em aparelhos baratos. O tus lê por fatias (`Blob.slice`), então é adequado.
- iOS: canvas tem limite de memória (~16 MP; maior que isso falha em silêncio em versões antigas). Redimensionar via `createImageBitmap` com `resizeWidth/resizeHeight` evita desenhar a imagem cheia. NÃO CONFIRMADO o limite exato atual.
- PWA instalada no iOS: câmera por `<input>` funciona; `getUserMedia` funciona desde iOS 13.4.

### 1.3 Tamanho típico de vídeo de 1 min no celular (valores aproximados, NÃO CONFIRMADO)
- iPhone 1080p/30 HEVC: ~40-65 MB/min; 1080p/30 H.264: ~100-130 MB/min; 4K/30 HEVC: ~170-200 MB/min; 4K/60: 350-400 MB/min.
- Android 1080p/30: ~60-130 MB/min; 4K/30: ~200-350 MB/min.
- Conclusão: o original de **1 min tem 20-130 MB**, o que confirma a faixa "20-100 MB" do pedido. Planejar o limite do upload em ~300 MB e o `maxSize` do tus em consequência. Vale oferecer o texto de orientação "grave em 1080p" (4K só aumenta o upload e o tempo de encode sem ganho, já que a saída é 720p).

---

## 2. Compressão de foto no celular (~1600 px, ~400 KB)

### 2.1 Opções
- `browser-image-compression` 2.0.2 **(verificado: versão)**. Opções principais: `maxSizeMB`, `maxWidthOrHeight`, `useWebWorker`, `initialQuality`, `fileType`, `preserveExif`. Usa canvas e iterações até caber em `maxSizeMB`; lida com orientação EXIF. Custo: dependência de ~50 KB e iterações extras de compressão (mais lento em celulares fracos). Último release do pacote ainda é a 2.0.2 (pouca atividade; NÃO CONFIRMADO a data).
- **Canvas `toBlob` direto** (recomendado). Passos: `createImageBitmap(file, { imageOrientation: 'from-image' })` → calcular escala (maior lado 1600) → `OffscreenCanvas` ou `<canvas>` → `canvas.toBlob(cb, 'image/jpeg', 0.8)`. Sem loop de qualidade: 1600 px com qualidade 0.78-0.82 fica tipicamente em 250-500 KB; se passar de ~600 KB, repetir uma vez com 0.7.

### 2.2 EXIF e orientação
- Navegadores modernos (Chrome 81+, Safari 13.1+, Firefox 77+) aplicam a orientação EXIF por padrão em `<img>` e em `createImageBitmap` com `imageOrientation: 'from-image'` (o padrão). Ao desenhar no canvas já fica correto, e o `toBlob` **remove o EXIF** (a orientação já foi "assada" nos pixels). Isso evita foto girada no servidor e também remove GPS, o que é bom para LGPD. NÃO CONFIRMADO em iOS < 13.4 (irrelevante hoje).
- Se a imagem for lida com `new Image()` + `drawImage` em navegador muito antigo, a orientação pode ser ignorada; não é o caso aqui.
- No servidor, o carimbo usa `sharp().rotate()` (auto-orienta por EXIF) por segurança, caso algum arquivo chegue sem processar.
- `toBlob('image/jpeg')` em Safari funciona; `image/webp` não é confiável no Safari, então use JPEG (spec §9).

---

## 3. Upload retomável de vídeos (20-100 MB+) via route handlers Next 16 atrás do nginx

### 3.1 O que a documentação do Next 16 diz (verificado em `node_modules/next/dist/docs`)
- `serverActions.bodySizeLimit`: **padrão 1 MB** para Server Actions (`01-app/02-guides/server-actions.md` e `.../next-config-js/serverActions.md`). Não use Server Actions para mídia.
- Route handlers usam `Request`/`Response` padrão da web e leem o corpo com `request.formData()`, `request.json()`, `request.body` (stream). A documentação **não define limite de corpo para route handlers**; o único limite documentado é o do `proxy` (abaixo). NÃO CONFIRMADO na prática: fazer um teste com PATCH de 5 MB.
- `experimental.proxyClientMaxBodySize` (`proxy.md`/`next-config-js/proxyClientMaxBodySize.md`): quando existe `proxy.ts` (antigo middleware), o Next **copia e mantém o corpo em memória**, limite padrão **10 MB**; acima disso só os primeiros N bytes ficam disponíveis, com aviso no log e **sem erro** (corrupção silenciosa). Hoje o repositório **não tem `proxy.ts` nem `middleware.ts`** (verificado). Se a autenticação futura usar `proxy.ts`, excluir `/api/midia` no `matcher`, ou manter os PATCH do tus abaixo de 10 MB (com `chunkSize` de 5 MB já fica abaixo).
- `output: 'standalone'` já está ativo em `next.config.ts` (verificado).

### 3.2 Opção A: tus (`@tus/server` + `@tus/file-store`)
Versões **(verificado)**: `@tus/server` 2.4.7 (Node >= 20.19), `@tus/file-store` 2.1.2, `tus-js-client` 4.3.1.

**Funciona com route handlers do App Router.** O README do `@tus/server` traz o exemplo oficial "integrate tus into Next.js" **(verificado)** e a API `server.handleWeb(req: Request)` pensada para meta-frameworks. Montagem:

```ts
// src/app/api/midia/[[...slug]]/route.ts
import { Server } from "@tus/server";
import { FileStore } from "@tus/file-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const server = new Server({
  path: "/api/midia",                       // deve casar com a rota
  datastore: new FileStore({ directory: "/data/tmp/tus" }),
  respectForwardedHeaders: true,            // nginx envia X-Forwarded-Host/Proto
  maxSize: 300 * 1024 * 1024,
  onIncomingRequest: async (req) => { /* checar cookie de sessão; lançar {status_code:401, body:'...'} */ },
  onUploadFinish: async (req, upload) => { /* registrar no banco + pg-boss.send('midia.processar', ...) */ return {}; },
});

export const GET = server.handleWeb;   // (GET opcional; HEAD é necessário para retomar)
export const HEAD = server.handleWeb;
export const POST = server.handleWeb;
export const PATCH = server.handleWeb;
export const DELETE = server.handleWeb;
export const OPTIONS = server.handleWeb;
```

Pontos de atenção:
- **Autenticação/autorização:** use `onIncomingRequest` (hook antes de todos os handlers) lendo o cookie de sessão de `req.headers`. Validar também que o usuário pode mexer na devolução indicada nos metadados (`upload-metadata`).
- **Bloqueios (locker):** o padrão é `MemoryLocker`, que vale para **um único processo**. O `web` é um único contêiner, então serve. Se escalar para 2 réplicas, precisaria de locker compartilhado (NÃO CONFIRMADO qual existe em v2).
- **`FileStore`** grava o arquivo e um arquivo `.json` lateral com o estado. Limpeza de uploads abandonados: existe a extensão de expiração (`expirationPeriodInMilliseconds` e `deleteExpired`, nomes NÃO CONFIRMADOS na v2); caso contrário, uma tarefa diária do pg-boss apaga arquivos antigos de `/data/tmp/tus`.
- **Reverse proxy** (README do `@tus/server`, verificado): desligar buffering de requisição, ajustar tamanho máximo, encaminhar host e esquema (`X-Forwarded-Host`, `X-Forwarded-Proto`).
- **Cliente (`tus-js-client`):** `endpoint: '/api/midia'`, `chunkSize: 5 * 1024 * 1024` (sem isso o padrão `Infinity` manda tudo num PATCH e quebraria o limite do nginx), `retryDelays: [0, 1000, 3000, 5000, 10000, 30000]`, `metadata: { devolucaoId, itemId, tipo, clientUuid, filename, filetype }`, `removeFingerprintOnSuccess: true`. O `onShouldRetry` permite não repetir em 401/403. O retomar entre recargas usa fingerprint em `localStorage` e exige ter o mesmo `File`, então o arquivo precisa estar no IndexedDB (seção 4); ao retomar, passar o `Blob` guardado e `uploadUrl` salvo.
- **Idempotência:** `clientUuid` vira chave única no banco para que um reenvio completo (depois de perder o `uploadUrl`) não duplique a evidência.
- Next standalone: o rastreamento de arquivos inclui `@tus/server` por ser importado na rota; sem módulo nativo, sem problema. NÃO CONFIRMADO: testar `next build` com o pacote (ESM/CJS).

### 3.3 Opção B: upload fracionado próprio
Desenho mínimo: `POST /api/midia/iniciar` (cria registro e id) → `PUT /api/midia/:id?offset=N` (corpo = fatia, servidor valida offset, faz `appendFile`/stream em arquivo) → `POST /api/midia/:id/concluir`. Retomar = `HEAD/GET` que devolve o offset. Custo: reimplementar offset, concorrência, expiração, validação de ordem, CORS, e testes. Ganho: controle do hash incremental e menos dependências. Para 1 time pequeno, o custo/risco supera o ganho.

### 3.4 nginx
Situação atual (`docker/nginx/devolucoes.conf`, verificado): `client_max_body_size 1m` global, buffering padrão ligado.

- `client_max_body_size` é por **requisição** (cada PATCH), não por arquivo. Com `chunkSize` de 5 MB, **12m** na `location` de mídia basta; mantenha 1m no resto para proteger.
- Com buffering de requisição ligado (padrão), o nginx guarda o corpo inteiro em disco/RAM antes de repassar: com chunks de 5 MB é tolerável, mas `proxy_request_buffering off` é a recomendação do tus e evita latência e uso de `/var/lib/nginx`.
- Timeouts: `client_body_timeout`, `proxy_read_timeout`, `proxy_send_timeout` de 120 s (rede móvel lenta, PATCH de 5 MB).

Bloco sugerido (antes do `location /`):

```nginx
location /api/midia/ {
    client_max_body_size 12m;
    proxy_request_buffering off;
    proxy_http_version 1.1;
    client_body_timeout 120s;
    proxy_read_timeout 120s;
    proxy_send_timeout 120s;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_pass http://127.0.0.1:3020;
}
```
Observação: o `location /` atual envia `Connection "upgrade"` fixo; no bloco novo não é necessário.

### 3.5 Recomendação
**Opção A (tus)**: já está na spec (§4.2, §9), tem exemplo oficial para Next App Router, trata retomada, offsets e expiração. Usar para foto e vídeo (um único caminho; foto de 400 KB vai em um PATCH).

---

## 4. Fila offline no celular (IndexedDB)

- `idb-keyval` 6.3.0 **(verificado)**: API mínima (`get/set/del/keys/entries`, `createStore(dbName, storeName)`). Aceita `Blob`/`File` (clone estruturado). Alternativa com índices: `idb` (também da Jake Archibald). Para a fila, `idb-keyval` com um store próprio e uma chave por arquivo basta; consultas por devolução filtram `entries()` (volume pequeno).
- Registro sugerido: `{ id: uuid, devolucaoId, itemId, tipo, blob, tamanho, criadoEm, tentativas, proximaTentativa, estado: 'pendente'|'enviando'|'enviado'|'erro', uploadUrl? }`. Gravar **antes** de tentar enviar; remover só depois de a confirmação do servidor (resposta final do tus + registro no banco).
- **Retry:** espera exponencial com jitter (2 s, 4 s, 8 s ... teto de 5 min), tentativas ilimitadas enquanto o app estiver aberto; erros 4xx definitivos (401/403/413/422) param e aparecem para o operador. Dentro de cada envio, o próprio tus faz `retryDelays` curtos para quedas rápidas.
- Gatilhos de reenvio: evento `online`, `visibilitychange` (voltou ao app), abertura do app e botão "Reenviar". `navigator.onLine` é pouco confiável (indica só interface de rede); o sinal real é o fetch falhar.
- **iOS/Safari não têm Background Sync** (NÃO CONFIRMADO para versões muito recentes); o envio só roda com o app aberto. Por isso a regra do spec "a conferência não termina enquanto faltar arquivo" (§6.3) combina bem: o operador vê a lista pendente.
- **Persistência:** chamar `navigator.storage.persist()`. No iOS, sites **não instalados** como PWA têm dados apagados após ~7 dias sem uso (política ITP, NÃO CONFIRMADO o prazo atual); PWA instalada fica isenta. Orientar a instalação na tela inicial.
- Manter a tela acesa durante o envio com `navigator.wakeLock.request('screen')` (suportado em Chrome Android e Safari 16.4+; NÃO CONFIRMADO em PWA iOS).
- Cota: IndexedDB aceita centenas de MB; 100 MB de vídeo por item está ok. Limpar registros enviados.

---

## 5. Tarefas de fundo: pg-boss

### 5.1 Versão
**pg-boss 12.38.2** é a `latest` no npm; `maint-v10` = 10.4.2 **(verificado: `npm view pg-boss dist-tags`)**. Requisitos: **Node >= 22.12** (imagem usa Node 24: ok) e PostgreSQL >= 13 (usamos 17). Dependências: `pg`, `cron-parser`, `rrule-temporal`, `serialize-error`. Instalar a v12. Docs: https://pgboss.io/ (API em `docs/api/*.md` do repositório timgit/pg-boss). Funcionalidades confirmadas: adaptador para Drizzle, dead letter queue, retry com backoff exponencial, agendamento cron, OpenTelemetry, heartbeat.

### 5.2 API (v12, verificada no README e nos documentos de API)
```ts
import { PgBoss } from "pg-boss";                  // exportação nomeada
const boss = new PgBoss({ connectionString, schema: "pgboss", max: 5 });
boss.on("error", console.error);
await boss.start();                                // cria/migra o schema pgboss

await boss.createQueue("midia.falhas");            // dead letter primeiro
await boss.createQueue("midia.transcodificar", {
  retryLimit: 4,            // padrão 2
  retryDelay: 30,           // segundos
  retryBackoff: true,       // exponencial a partir de retryDelay
  retryDelayMax: 900,
  deadLetter: "midia.falhas",   // a fila de destino precisa existir
  expireInSeconds: 3600,        // padrão 900 (15 min); máx 86400
  // heartbeatSeconds: 60,      // opcional, >= 10; work() envia sozinho
});

const id = await boss.send("midia.transcodificar", { midiaId }, { singletonKey: midiaId });
// pode devolver null quando há singleton/throttle

await boss.work("midia.transcodificar", async ([job]) => {   // o handler recebe um ARRAY de jobs
  await transcodificar(job.data.midiaId);                    // lançar exceção = falha e retry
});
```
- **Semântica de retry:** `retryLimit` é o número de novas tentativas. Para "5 tentativas no total" do spec §11, usar `retryLimit: 4` (NÃO CONFIRMADO se conta a primeira execução; conferir em teste).
- Opções por job em `send` **(verificado)**: `priority`, `id`, `retryLimit`, `retryDelay`, `retryBackoff`, `retryDelayMax`, `heartbeatSeconds`, `expireInSeconds`, `retentionSeconds` (14 dias), `deleteAfterSeconds` (7 dias), `startAfter`, `singletonSeconds/Key`, `db` (para enviar dentro de uma transação Drizzle).
- `work()` aceita `batchSize`, `pollingIntervalSeconds`, `includeMetadata` e outras opções: o documento de jobs consultado não os lista (apenas `fetch()` tem `batchSize`/`includeMetadata`). NÃO CONFIRMADO o nome exato da opção de concorrência local (`localConcurrency`?). Sem ela, **um `work()` processa um job por vez** (aguarda o handler), o que é o desejado para ffmpeg em 1 vCPU.
- **Ver falhas (tela "Falhas", spec §6.8):** `findJobs(name, options)` devolve jobs com metadados completos; filtrar `job.state === 'failed'` (não passar `queued: true`). Com `deadLetter`, os jobs esgotados também aparecem copiados na fila `midia.falhas`. Reprocessar: `boss.retry(name, id)` (também aceita lista de ids). Marcar falha manual: `boss.fail(name, id, data)`. `getJobById` está **obsoleta** (usar `findJobs`).
- Agendamento diário (`midia.retencao`): `boss.schedule(name, "0 3 * * *", data, opts)` (cron suportado; assinatura exata NÃO CONFIRMADA em v12).
- Dashboard opcional: pacote `@pg-boss/dashboard` (existe, **verificado no README**); não é necessário.
- Encerramento limpo no worker: `await boss.stop({ graceful: true, timeout: ... })` no `SIGTERM` (assinatura NÃO CONFIRMADA; ver docs).
- Privilégios do banco: `start()` precisa de `CREATE SCHEMA` e permissão para criar/alterar tabelas (ou usar `createSchema:false`/`migrate:false` com usuário preparado). O usuário do app já é dono do banco, então não há problema.
- Conexão: o pg-boss usa pool próprio (`max` padrão 10). Em VPS pequena, `max: 3-5` no `web` (só `send`) e `max: 5` no `worker`. Alternativa: passar um objeto `db` com `executeSql` para reusar o pool.

### 5.3 Processo `worker` do mesmo repositório (esbuild, `dist/*.mjs`)
O repositório já empacota scripts assim (`package.json`, `build:scripts`: `esbuild ... --bundle --platform=node --format=esm --outdir=dist --out-extension:.js=.mjs --external:@node-rs/argon2 --banner:...createRequire`). Estender:
- Novo ponto de entrada `scripts/worker.ts` (ou `src/worker/index.ts`) → `dist/worker.mjs`. `--external:sharp` (módulo nativo). pg-boss, `pg`, `@aws-sdk/*` podem ser empacotados (JS puro). NÃO CONFIRMADO: pg-boss 12 empacota sem ajustes no esbuild; se falhar, marcar como `external` e copiar `node_modules`.
- **Imagem:** o `output: 'standalone'` só traz o que as rotas do Next usam. Para o worker, copiar para o estágio final os pacotes externos (como já é feito com `@node-rs`): `sharp` e `@img/*`. Ou, mais simples: `npm ci --omit=dev` num estágio separado só para `sharp` e copiar.
- **Compose:** mesmo `image:`, serviço `worker` com `command: ["node", "dist/worker.mjs"]` (o `CMD` atual roda `migrar.mjs` e `server.js`; o worker **não** deve migrar, para não competir). Limites sugeridos: `web` 512m (já), `worker` ~1g, postgres 256m (já). Total cabe nos 3,8 GB da VPS compartilhada, mas ffmpeg+sharp competem com os outros sites: usar `nice` no ffmpeg e `deploy.resources.limits.cpus: "0.75"` (NÃO CONFIRMADO se `cpus` é respeitado no compose sem swarm; é respeitado pelo `docker compose` v2).
- Volume compartilhado `/data` entre `web` (grava o tus) e `worker` (lê e transcodifica). Mesmo UID do usuário `app`.
- Health: o `/saude` do `web` já verifica a fila; o worker registra heartbeat (tabela ou `boss.getQueues()`; NÃO CONFIRMADO), para o alerta do painel.

---

## 6. Transcodificação com ffmpeg (H.264 720p)

### 6.1 Instalação na `node:24-bookworm-slim`
- `apt-get install -y --no-install-recommends ffmpeg` instala o ffmpeg 5.1.x do Debian bookworm com dezenas de bibliotecas (libav*, libx264, libx265, vaapi etc.). Tamanho instalado: da ordem de **~250-350 MB** (NÃO CONFIRMADO; medir com `docker image ls`). Colocar `rm -rf /var/lib/apt/lists/*` no mesmo `RUN`.
- Alternativa mais enxuta: copiar um binário estático de uma imagem multi-stage (ex.: `COPY --from=mwader/static-ffmpeg:<tag> /ffmpeg /ffprobe /usr/local/bin/`; ~80-100 MB; tag e formato NÃO CONFIRMADOS). Mais fácil de fixar a versão.
- `ffmpeg-static` 5.3.0 **(verificado: versão)**: baixa o binário no `postinstall` a partir do GitHub; funciona, mas amarra a build a um download externo e não inclui `ffprobe` (precisa de `ffprobe-static`). Não recomendado.
- **Recomendação:** apt `--no-install-recommends ffmpeg` no estágio final (simples, com `ffprobe` junto). Como web e worker compartilham a imagem, o `web` também carrega o ffmpeg (só disco, ~300 MB; a VPS tem ~13 GB). Se incomodar, criar um alvo `worker` no Dockerfile.

### 6.2 Flags recomendadas (1 vCPU, ~1-2 Mbps)
```
ffmpeg -nostdin -hide_banner -loglevel error -y \
  -i <entrada> \
  -map 0:v:0 -map 0:a:0? \
  -vf "scale='if(gt(iw,ih),-2,720)':'if(gt(iw,ih),720,-2)',format=yuv420p" \
  -c:v libx264 -preset veryfast -crf 28 -maxrate 1500k -bufsize 3000k -profile:v high \
  -c:a aac -b:a 96k -ac 2 \
  -movflags +faststart -progress pipe:1 \
  <saida>.mp4
```
- **Escala e rotação:** o ffmpeg aplica a rotação do vídeo de celular automaticamente (autorotate). O pedido `scale=-2:720` limitaria a altura a 720 e geraria um vídeo vertical de 405x720, pequeno demais para ler uma etiqueta. A expressão acima limita o **lado menor** a 720 (horizontal 1280x720; vertical 720x1280). Se o original for menor que 720, a expressão aumentaria a imagem: adicionar `min(720,ih)` se não quiser ampliar (detalhe a refinar no plano).
- `-crf 28 -maxrate 1500k` dá ~8-12 MB/min (alinha com o spec §9: 10-15 MB/min). `-crf 26` melhora a nitidez de texto pequeno, com ~12-15 MB/min; escolher após teste visual com etiqueta e número de série.
- `-preset veryfast` é o melhor custo/benefício em 1 vCPU; `medium` comprime ~10-15% melhor, porém 3-4 vezes mais lento (NÃO CONFIRMADO).
- Áudio: AAC 96 kbps estéreo (ou `-ac 1 -b:a 64k` para economizar). `0:a:0?` evita erro quando o vídeo não tem áudio.
- `-movflags +faststart` permite tocar sem baixar tudo.
- `-threads 1` opcional para não competir com `web`/Postgres (alternativa: `nice -n 10`).
- iPhone HDR/HLG 10 bits: sem tonemap o resultado pode ficar lavado. NÃO CONFIRMADO; testar com um clipe real e, se necessário, mudar o iPhone para "Mais compatível" ou aplicar `zscale/tonemap`.
- **Validação do resultado:** `ffprobe` na saída (duração próxima da original, codec h264, tamanho > 0) antes de apagar o original (spec §9).

### 6.3 Tempo de encode esperado (estimativa, NÃO CONFIRMADO)
Para 1 min em 1080p/30 → 720p com `veryfast`: **~0,6-1,5x o tempo real em 1 vCPU, ou seja, 40-90 s**. Com entrada HEVC ou 4K, a decodificação soma +30-100%: ~1,5-3 min. Com `medium`: ~2-4 min. Medir na VPS real (que é compartilhada, logo mais lenta). Consequências: `expireInSeconds` de 3600, concorrência 1, e fila FIFO. Com 100 devoluções por dia, dezenas de vídeos de 1 min, o worker fica ocupado ~1-2 h/dia: ok.

### 6.4 Windows no desenvolvimento
- `winget install Gyan.FFmpeg` (builds "full" do gyan.dev; o id existe no winget; NÃO CONFIRMADO a versão atual). Coloca `ffmpeg`/`ffprobe` no PATH após abrir um novo terminal.
- Variável `FFMPEG_PATH` / `FFPROBE_PATH` (padrão `ffmpeg`/`ffprobe`) para o código funcionar nos dois ambientes. Preferir winget em vez de `ffmpeg-static` (evita download no `npm install`).
- Testes de integração do ffmpeg: marcar como pulados se `ffmpeg -version` falhar.

### 6.5 Chamada segura pelo Node
- `child_process.spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })`: **sem `shell: true`**, argumentos em array (sem concatenar string de comando).
- Caminhos de entrada e saída gerados pelo sistema (UUID), nunca o nome enviado pelo usuário; se um caminho puder começar com `-`, usar caminho absoluto ou prefixo `./`/`file:`.
- `stdin` fechado (`-nostdin`), `-y` para sobrescrever só o arquivo temporário; escrever em `saida.tmp.mp4` e renomear ao final.
- Capturar `stderr` com limite de tamanho (para não crescer sem fim), timeout (ex.: 15 min) com `SIGKILL`, e tratar `close` com código != 0 como erro (o pg-boss refaz).
- Progresso: `-progress pipe:1` entrega `out_time_ms=` por linha, útil para log.

---

## 7. Abstração de armazenamento (disco local vs S3)

### 7.1 Interface
A interface `ArmazenamentoArquivos` do spec §4.3 (`salvar(caminho, Readable)`, `ler`, `urlTemporaria`, `apagar`) é adequada. Duas implementações: `ArmazenamentoDisco` (`/data/midia`) e `ArmazenamentoS3`. Em disco, `urlTemporaria` não existe de forma nativa: gerar um token assinado (HMAC com expiração) que aponta para uma rota autenticada `/api/midia/arquivo/...` que faz stream; na S3 usa presigned GET.

### 7.2 `@aws-sdk/client-s3` 3.1167.0 e presigned (verificado: versão)
- Presigned GET: `getSignedUrl(client, new GetObjectCommand({ Bucket, Key, ResponseContentType?, ResponseContentDisposition? }), { expiresIn: 600 })` do pacote `@aws-sdk/s3-request-presigner` (mesma versão 3.1167.0).
- Upload em stream de tamanho desconhecido: `Upload` do `@aws-sdk/lib-storage` (multipart automático). Para arquivo final do worker (tamanho conhecido), `PutObjectCommand` com `ContentLength` + stream também serve.
- **Compatibilidade com R2/B2:** as versões recentes do SDK v3 enviam checksums CRC32 por padrão, o que quebra em alguns serviços compatíveis. Configurar `requestChecksumCalculation: "WHEN_REQUIRED"` e `responseChecksumValidation: "WHEN_REQUIRED"` no `S3Client` (documentado pela Cloudflare/Backblaze; NÃO CONFIRMADO o requisito exato na 3.1167).
- R2: `endpoint: https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, `region: "auto"`. Presigned só no domínio S3 (não em domínio customizado). B2: `endpoint: https://s3.<região>.backblazeb2.com`, região do bucket. NÃO CONFIRMADO detalhes finais; seguir a documentação de cada um.
- CORS do bucket não é necessário se o navegador nunca fala direto com ele no upload (o upload passa pelo tus) e a visualização usa `<img src=presigned>`/`<video src=presigned>` (não exige CORS para exibir).

### 7.3 Preços (verificado em 2026-11-12 nas páginas oficiais)
| | Cloudflare R2 (Standard) | Backblaze B2 |
|---|---|---|
| Armazenamento | US$ 0,015/GB-mês | a partir de US$ 6,95/TB-mês (~0,007/GB) |
| Gratuito | 10 GB-mês, 1 M ops Classe A, 10 M ops Classe B por mês | primeiros 10 GB |
| Saída (egress) | grátis | grátis até 3x o armazenamento médio mensal; depois US$ 0,01/GB |
| Operações | A: US$ 4,50/M (PUT, LIST, multipart); B: US$ 0,36/M (GET, HEAD) | classes A/B/C grátis no pago por uso; classe D US$ 0,004/10 mil |
| Mínimos | (não informado na página) | sem taxa de tamanho/tempo mínimo |

**Estimativa para crescimento de ~50 GB/mês** (spec §9: 35-50 GB/mês; retenção de 12 meses leva a ~600 GB em regime):
- B2: 600 GB x US$ 0,00695 = ~US$ 4,2/mês (mais o backup, se for no mesmo serviço).
- R2: 600 GB x US$ 0,015 - 10 GB gratuitos = ~US$ 8,9/mês; operações desprezíveis (alguns milhares por dia).
- Egress: baixo (links temporários para auditoria); nos dois, ~zero.

**Recomendação: Backblaze B2** para as mídias (metade do preço, egress de sobra para o padrão de uso). Se quiser uma conta só e menos configuração, R2 é igualmente bom e a diferença é ~US$ 5/mês. Usar o **mesmo provedor para o backup diário** (spec §10) em outro bucket (ou outro provedor, para separar riscos).

### 7.4 Disco da VPS: risco imediato
Com ~13 GB livres e 35-50 GB/mês, o disco local **não serve como destino final nem por um mês**. Plano: o `/data/tmp` guarda só uploads em andamento e originais aguardando transcodificação; o worker grava o resultado final no S3, valida (HEAD + tamanho + SHA-256) e só então apaga o original local. A frase do spec "começa no disco da VPS" deve virar "disco só como área temporária; S3 desde a primeira entrega em produção (disco só para desenvolvimento)". Reservar um alerta de disco (>70%) no painel.

---

## 8. Carimbo na imagem (sharp)

- **sharp 0.35.5** **(verificado: versão)**, Node >= 20.9. Binários pré-compilados com libvips embutido, distribuídos como pacotes opcionais `@img/sharp-<plataforma>` (instalados pelo npm conforme o SO/arquitetura). O próprio Next 16 lista `sharp ^0.35.5` como dependência (verificado em `node_modules/next/package.json`) para otimização de imagens, então já está no `node_modules`.
- **Standalone/Docker:** o `output: 'standalone'` rastreia `sharp` quando importado por código do Next; a doc do Next cita `outputFileTracingIncludes` com `node_modules/sharp/**/*` (`next-config-js/output.md`, verificado) para garantir inclusão. Como o uso real é no **worker** (esbuild, `--external:sharp`), copiar `sharp` e `@img/*` para a imagem (como já feito com `@node-rs`). Instalar sempre **dentro do build Linux** (GitHub Actions), nunca copiar `node_modules` do Windows. Bookworm (glibc) é suportado pelos binários `linux-x64`.
- **Memória (glibc):** a doc de self-hosting do Next avisa que em Linux glibc o sharp pode usar memória em excesso e remete à doc do sharp sobre o alocador (verificado). Mitigação comum: `MALLOC_ARENA_MAX=2` (ou jemalloc) e `sharp.cache(false)`/`sharp.concurrency(1)` no worker de 1 vCPU. NÃO CONFIRMADO o ganho exato.
- **Fontes:** a `bookworm-slim` **não tem fontes**. O SVG com `<text>` é renderizado pelo librsvg usando fontconfig, e sem fonte o texto some ou vira quadrados. Instalar `fonts-dejavu-core` (apt, ~3 MB) e usar `font-family="DejaVu Sans"` no SVG. Testar na imagem final, não só no Windows (onde as fontes do sistema mascaram o problema). NÃO CONFIRMADO se o sharp prebuilt ainda lê o fontconfig do sistema na 0.35; é o comportamento conhecido das versões anteriores.
- **Receita:**
  1. `const img = sharp(entrada).rotate();` (auto-orienta e descarta o EXIF restante).
  2. `const { width, height } = await img.metadata()` depois de `rotate()` (usar `.toBuffer({resolveWithObject:true})` se precisar das dimensões já giradas).
  3. Montar um SVG com um retângulo semitransparente na base e o texto `"2026-11-12 14:03 | DEV-000123 | usuario"`, **com escape XML** de `&`, `<`, `>` e aspas (o nome do usuário vem de dado).
  4. `.composite([{ input: Buffer.from(svg), gravity: 'southeast' }]).jpeg({ quality: 82 })`.
  5. O SVG deve ter `width` igual ao da imagem (ou usar `density`) para o tamanho da fonte ser proporcional (ex.: altura do texto = 2,5% da altura da imagem).
- Fuso horário: gravar a hora no fuso de `America/Sao_Paulo` (`Intl.DateTimeFormat`) e a data do servidor (não a do celular, que pode estar errada).
- Hashes: calcular `sha256_original` do que chegou do celular e `sha256_final` da imagem carimbada (spec §9); guardar a original só se a política exigir (o spec fala só em hash, então a original pode ser descartada após o carimbo; confirmar com o dono do produto, porque o hash original deixa de ser verificável sem o arquivo).

---

## 9. SHA-256 durante o recebimento (`node:crypto`)

- Recebimento próprio (rota Next com `request.body`): `Readable.fromWeb(request.body)` → `Transform` que chama `hash.update(chunk)` e repassa o chunk → `pipeline(..., createWriteStream(destino))`; ao final `hash.digest('hex')`. Cobre Server Action? Não usar; só route handlers.
- Com **tus**, o `FileStore` grava os PATCHes direto no disco (vários PATCHes, possivelmente retomados depois de queda), então um hash incremental em memória não é confiável entre requisições. **Recomendação:** ao concluir (`onUploadFinish`) ou no início do job, ler o arquivo do disco em stream: `await pipeline(createReadStream(caminho), hash)` e `hash.digest('hex')`. 100 MB em disco levam ~1 s de CPU e memória constante. Guardar como `sha256_original`.
- O tus tem uma extensão de checksum (`Upload-Checksum`), NÃO CONFIRMADO suporte ou algoritmos no `@tus/server` 2.x; não depender dela. Opcional: o cliente calcula o SHA-256 com `crypto.subtle.digest` (só para arquivos pequenos; não faz stream) e envia nos metadados para o servidor comparar. Para vídeos grandes, comparar apenas o tamanho.
- Depois de transcodificar: calcular `sha256_final` do MP4 lido do disco (ou durante o upload ao S3 com a mesma técnica de `Transform`). Registrar ambos no histórico (spec §9).

---

## 10. Decisões para o plano (checklist)

1. Pipeline: celular → (IndexedDB) → tus (`/api/midia`) → `/data/tmp` → pg-boss `midia.processar` → foto: sharp (carimbo) / vídeo: ffmpeg → S3 → apagar temporário → link temporário (presigned 10 min).
2. Imagem Docker: instalar `ffmpeg` e `fonts-dejavu-core`; copiar `sharp`/`@img/*`; `MALLOC_ARENA_MAX=2`.
3. `docker-compose.prod.yml`: serviço `worker` com `command: node dist/worker.mjs`; volume `/data` compartilhado; credenciais S3 no `.env.producao`.
4. nginx: bloco `/api/midia/` (seção 3.4).
5. Testes de aceite em aparelhos reais (iPhone com HEVC, Android médio): upload de 100 MB com queda de rede no meio, foto com orientação em retrato, carimbo com fonte, HDR, tempo de encode na VPS.
6. Pontos NÃO CONFIRMADOS a resolver nos primeiros dias: contagem exata de `retryLimit`, opção de concorrência do `work()`, nomes da expiração do `FileStore`, empacotamento do pg-boss no esbuild, comportamento de fontes no sharp 0.35, limite de PATCH em route handler, tamanho real da imagem com ffmpeg.

## Fontes
- Documentação Next 16 local: `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/serverActions.md`, `proxyClientMaxBodySize.md`, `output.md`; `01-app/02-guides/server-actions.md`, `self-hosting.md`; `01-app/03-api-reference/03-file-conventions/route.md`.
- `@tus/server` README (npm), seção "Example: integrate tus into Next.js" e "Reverse proxy": https://github.com/tus/tus-node-server
- pg-boss: https://pgboss.io/ e https://github.com/timgit/pg-boss (docs/api/queues.md, jobs.md, constructor.md); versões via `npm view`.
- Preços: https://developers.cloudflare.com/r2/pricing/ e https://www.backblaze.com/cloud-storage/pricing (consultados em 2026-11-12).
- sharp: https://sharp.pixelplumbing.com/install (alocador no Linux) e https://sharp.pixelplumbing.com/api-composite
- ffmpeg/H.264: https://trac.ffmpeg.org/wiki/Encode/H.264
