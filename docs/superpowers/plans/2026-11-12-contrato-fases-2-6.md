# Contrato entre as Fases 2 a 6: dependências, dono dos arquivos, modelo de dados e interfaces

- **Data:** 2026-11-12. **Base:** `main` em 4640ae2 (Fases 0 e 1 prontas).
- **Fontes:** spec [2026-11-11-gestao-devolucoes-design.md](../specs/2026-11-11-gestao-devolucoes-design.md) (§5 a §14), pesquisas [focus-nfe.md](../../pesquisas/focus-nfe.md) e [fase-2-midia.md](../../pesquisas/fase-2-midia.md).
- **Para quem:** quem escreve e quem executa os planos das Fases 2 a 6. Os planos das Fases 2, 3 e 4 são escritos em paralelo e **seguem este contrato ao pé da letra** (nomes de tabela, coluna, enum, função, tarefa e arquivo).
- **Nomes dos planos:** `2026-11-12-fase-2-conferencia.md`, `2026-11-12-fase-3-mercado-livre.md`, `2026-11-12-fase-4-fiscal.md` (as Fases 5 e 6 vêm depois).
- **Emenda:** se uma fase precisar mudar algo deste contrato ou de um arquivo "congelado" (§3), a mudança vira um commit pequeno no `main` (contrato + código compartilhado) e cada worktree faz `git merge main`. Nenhuma fase muda sozinha um arquivo compartilhado.
- O que vai além do PDF/spec está marcado **(extra)**. Onde a spec é omissa, a escolha é a mais simples e está em §8.

## 1. Mapa de dependências

```
                 Fase P (no main: P1 isolamento de testes + P2 fundação compartilhada)
                /                     |                         \
   Fase 2 (conferência)      Fase 3 (Mercado Livre)       Fase 4 (fiscal)      ← implementação em paralelo
                \                     |                         /
                  merge 2  ───►  merge 3  ───►  merge 4
                                                   |
                                         Fase 5 (remessas)                      ← depois da 4
                                                   |
                                         Fase 6 (acabamento)                    ← depois de todas
```

| Fase | Precisa de | Entrega para |
|---|---|---|
| 2 Conferência | P2: fila, armazenamento, colunas de conferência, `evidencias`, `configuracoes` | 3: tarefa `ml.enviar-resultado` e as fotos; 4: itens com `destino`; 5: `destino`, `produto_recebido_id`, evidências; 6: mídias para o prazo de guarda |
| 3 Mercado Livre | P2: fila, armazenamento, tipos do conector, `evidencias`. Da Fase 2 só os **dados** do contrato (simulados por fábrica) | núcleo: devoluções `origem = API`; 4: `obterXmlNotaVenda`; 6: `ultima_sincronizacao_em`, contestações |
| 4 Fiscal | P2: fila, armazenamento, `configuracoes`, colunas `destino`/`motivo`. Da Fase 3 só o registro de conectores (devolve `null` até a 3 entrar) | 5: `EmissorNFe`, `solicitarEmissao`, configuração e regras fiscais, porta de lotes; 6: NF rejeitada, ambiente |
| 5 Remessas | **Código** da 4 já no `main` (emissão, efeitos da NF, porta de lotes); 2 no `main` para o link das evidências | 6: `SEM_FORNECEDOR`, lotes FINALIZADO |
| 6 Acabamento | 2 a 5 no `main` (o painel e o prazo de guarda leem tudo) | produção |

**Veredito:**
- **Em paralelo: Fases 2, 3 e 4**, depois da Fase P. Cada uma depende das outras só por dados e assinaturas fixadas aqui; nos testes, o estado que outra fase produziria é criado por fábrica.
- **Não paralela: Fase 5.** A NF de remessa usa o emissor, a fila `nfe.*` e o ciclo de vida da Fase 4, e a alocação em lote acontece dentro da autorização da NF de devolução. Simular tudo isso por contrato custaria mais do que esperar.
- **Não paralela: Fase 6.** Painel, Falhas e prazo de guarda leem as tabelas de todas as fases.
- Opcional: as partes da 6 que não leem nada novo (backup, cabeçalhos de segurança, limite de login por IP, `/saude` com 503) podem rodar junto com a 5 numa quarta worktree.

## 2. Fase P (no `main`, antes de criar as worktrees)

### P1. Isolamento de testes (mínimo)
1. `tests/e2e/dados.ts`: carrega o `.env` no topo (`if (existsSync('.env')) process.loadEnvFile('.env')`) e usa `export const PORTA_E2E = Number(process.env.PORTA_E2E || 3100)`. O `.env` precisa ser lido ali porque o `playwright.config.ts` importa `dados.ts` **antes** da linha que carrega o `.env`.
2. `tests/helpers/db.ts`: `urlBancoTeste()` recusa uma URL cujo banco não seja `devolucoes_test` ou `devolucoes_test_f<N>` (o `limparTabelas` nunca apaga o banco de desenvolvimento). `tests/setup/int-global-setup.ts`, `tests/e2e/global-setup.ts` e `tests/e2e/apoio.ts` passam a usar `urlBancoTeste()`.
3. `.env.example`: `PORTA_E2E=3100`. README: uma seção curta "Worktrees das fases" com a tabela da §6.

### P2. Fundação compartilhada
Fica no plano da Fase 2 como **"Parte A (main)"**: é executada, revisada e mergeada no `main` antes de criar as worktrees. As Fases 3 e 4 partem desse `main`.
1. **Migração `0006_fundacao`** com o modelo da §4.1 (colunas novas em `devolucoes` e `itens_devolucao`, tabelas `evidencias` e `configuracoes`, enums novos).
2. **Arquivos de schema vazios** (`export {};`) para as fases seguintes: `src/db/schema/mercado-livre.ts`, `fiscal.ts`, `lotes.ts`, e as linhas `export * from` de todos eles (e de `evidencias.ts` e `configuracoes.ts`) no `src/db/schema/index.ts`.
3. **Vocabulário** (§4.5), `src/modules/devolucoes/transicoes-item.ts` (§4.6) e o histórico (§4.7: entidades novas e os arquivos de rótulos já preenchidos).
4. **Fila e worker** (§5.1): `pg-boss@12.38.0` (§10, E6), `src/modules/fila/`, `src/worker/`, `scripts/worker.ts`, script `npm run worker`, `build:scripts` gera também `dist/worker.mjs`; `/saude` também confere a fila.
5. **Armazenamento** (§5.2): interface, disco, memória e a rota `src/app/api/arquivos/route.ts` (links temporários do modo disco).
6. **Conectores** (§5.3): tipos de `MarketplaceConnector` e `registro.ts` que devolve `null`.
7. `src/modules/configuracoes/ler.ts`: `lerConfiguracao(db)` (§5.6).
8. **Variáveis de ambiente** (§3, linha `.env`): todas declaradas em `src/lib/env.ts`, `.env.example` e `.env.producao.example`. `.gitignore`: `/.dados/` e `/.dados-e2e/`.
9. **Esqueletos de tela** (cada um vira de uma fase só):
   - detalhe da devolução: `src/app/(app)/fluxo/devolucoes/[codigo]/secoes/{SecaoConferencia,SecaoMercadoLivre,SecaoFiscal,SecaoLote}.tsx`, componentes de servidor assíncronos com `props: { devolucaoId: string; codigo: string; status: StatusDevolucao; usuario: UsuarioSessao }`, que devolvem `null`. A página os chama nessa ordem, entre "Itens" e "Histórico". Cada seção busca os próprios dados.
   - Configurações: cartões para `/configuracoes/conferencia` ("Conferência e mídias"), `/configuracoes/mercado-livre`, `/configuracoes/fiscal` e `/configuracoes/falhas`, cada um com uma página `EmBreve`.
   - `src/components/EtapasCelular.tsx` ganha a prop opcional `conteudoEtapa?: Partial<Record<number, ReactNode>>`, mostrada no **topo** da etapa escolhida (logo abaixo do título, antes dos cartões). A Fase 4 a usa na etapa 4 (§10, E5).
10. **Testes:** `vitest.int.config.mts` ganha `setupFiles: ['tests/setup/int-setup.ts']`, que instala os falsos por padrão (fila em memória, armazenamento em memória, conectores `null`). O `tests/e2e/global-setup.ts` sobe o worker (`node --import tsx scripts/worker.ts`, com o banco de testes e os falsos) e devolve a função que o encerra.
11. **Docker:** serviço `worker` no `docker-compose.prod.yml` (mesma imagem, `command: ["node", "dist/worker.mjs"]`, sem migrar, `memory: 1g`). `package.json`: `"engines": { "node": ">=24" }`. `globals.css`: só **conferir** o `:focus-visible` (já existe desde a Fase 1; §10, E7).

## 3. Dono de cada arquivo compartilhado (uma regra por arquivo)

"Congelado" = só muda por emenda no `main`. "Dono na janela" = a única fase que edita o arquivo enquanto 2, 3 e 4 correm em paralelo.

| Arquivo | Regra |
|---|---|
| `src/db/schema/index.ts` | Congelado depois da P2: a P2 já exporta todos os arquivos de schema (os das fases seguintes nascem vazios). Cada fase escreve **só no próprio arquivo**: 2 → `evidencias.ts`, 3 → `mercado-livre.ts`, 4 → `fiscal.ts`, 5 → `lotes.ts`. |
| `src/db/schema/devolucoes.ts`, `catalogo.ts`, `auth.ts` | Congelados na janela (as colunas das Fases 2 a 4 entram na P2). A Fase 5 acrescenta `lote_id` e `resultado_fornecedor` (já fora da janela). `notificacoes.ts`: dono a Fase 3. |
| Numeração das migrações | A P2 cria a 0006. Na branch, cada fase gera migrações à vontade; **antes do merge** elas são descartadas e regeneradas numa só, na ordem fixa 2 → 3 → 4 (procedimento abaixo). Nenhuma fase acrescenta valor a um enum que já existe. |
| `ROTULO_ACAO` (`src/modules/historico/eventos.ts`) | Vira a junção de `src/modules/historico/rotulos/{base,conferencia,mercado-livre,fiscal,lotes,acabamento}.ts`. A P2 cria os arquivos já com as chaves reservadas da §4.7, que incluem todas as chaves usadas pelos planos das Fases 2, 3 e 4. Depois da P2 os seis arquivos ficam **congelados**: chave nova = emenda no `main`, com o prefixo da fase (§10, E3). |
| `STATUS_*` e `REGRAS_TRANSICAO` (`dominio.ts`, `transicoes.ts`) | Congelados: os status das devoluções e dos itens já estão completos, e a tabela da §5.2 da spec já está toda em `REGRAS_TRANSICAO`. As transições dos itens nascem completas na P2 (`transicoes-item.ts`). Cada fase só **usa** as linhas que são dela (§4.6). |
| `NavAbas.tsx`, `ABAS`/`MATRIZ` (`permissoes.ts`) | Congelados: as 5 abas e as 5 ações da spec §6.9 já existem. As fases trocam só a página atrás da aba: `/contestacoes/page.tsx` é da 3, `/lotes/page.tsx` da 5. |
| `tests/e2e/global-setup.ts`, `apoio.ts`, `dados.ts` | Congelados depois da P1/P2. Os dados de cada spec são criados no próprio spec, com `tests/helpers/fabricas-<area>.ts` e `tests/e2e/apoio-<area>.ts` da fase (`conferencia`, `ml`, `fiscal`, `lotes`). `tests/helpers/fabricas.ts` também fica congelado. |
| `.env.example`, `.env.producao.example`, `src/lib/env.ts` | Congelados: a P2 declara todas as variáveis (lista abaixo). Variável nova = emenda. |
| `package.json` e `package-lock.json` | `scripts` congelados depois da P2. Dependências: cada fase instala só as suas, com versão exata (`npm install x@versão --save-exact`). No merge, **nunca juntar o lockfile à mão**: pegar o `package.json` e o `package-lock.json` do `main` e rodar de novo o `npm install --save-exact` com a lista de dependências do plano da fase. |
| `Dockerfile`, `docker-compose.prod.yml`, `docker/nginx/devolucoes.conf`, `next.config.ts` | A P2 cria o serviço `worker`. Na janela, dono a **Fase 2** (ffmpeg, `fonts-dejavu-core`, cópia de `sharp`/`@img`, volume `/data`, `MALLOC_ARENA_MAX=2`, `location /api/midia/` no nginx). As Fases 3 e 4 não mexem (só JavaScript e `fetch`). A 6 acrescenta o backup. |
| Detalhe da devolução (`[codigo]/page.tsx`, `detalhe.ts`) | Congelados depois da P2. Cada fase preenche só a sua `secoes/Secao*.tsx`. |
| `fluxo/etapa/[numero]/page.tsx` | Dono na janela: Fase 2 (botões das etapas 2 e 3). A Fase 4 cria a rota estática `fluxo/etapa/4/page.tsx` e a 5 cria `fluxo/etapa/5/page.tsx`: a pasta estática tem prioridade sobre `[numero]`. |
| `busca.ts`, `filtros.ts`, `selos.ts`, `quadro.ts`, `CartaoDevolucao.tsx`, `QuadroFluxo.tsx`, `fluxo/page.tsx` | Dono na janela: **Fase 4** (opção `destino` na busca e a divisão Estoque Bom / Estoque Problema da coluna 4). A P2 acrescenta `ean_lido` ao filtro "Código de Barras / Serial Number". A 6 mexe depois (alertas no painel). |
| `criar.ts` | Dono na janela: Fase 3 (§5.5). `recebimento.ts` e `fluxo/recebimento/*`: Fase 2 (Fotos 1 e 2 do pacote não identificado). |
| `configuracoes/page.tsx` | Congelado depois da P2. Cada fase troca só a sua subpágina (`conferencia` 2, `mercado-livre` 3, `fiscal` 4, `falhas` 6). |
| `src/components/*` existentes, `globals.css`, `layout.tsx`, `manifest.ts` | Somente leitura na janela, exceto `manifest.ts` e o service worker, que são da Fase 2 (modo offline). Componentes novos vão em `src/components/<area>/`. |
| `README.md` | Só quem integra edita, depois de cada merge. |

**Variáveis de ambiente (todas na P2; com `NODE_ENV=production`, `falso` é recusado pelo `lerEnv`, a menos que `PERMITIR_FALSOS=1`; §10, E1):**
`PORTA_E2E` · `PERMITIR_FALSOS` (`1` libera os falsos num build de produção; só o `webServer.env` do `playwright.config.ts` e o worker do e2e definem; nunca no `.env` nem na VPS) · mídia (2): `ARMAZENAMENTO` (`disco` ou `s3`), `MIDIA_DIR` (padrão `.dados/midia`), `MIDIA_TMP_DIR` (padrão `.dados/tmp`), `SEGREDO_LINKS`, `S3_ENDPOINT`, `S3_REGIAO`, `S3_BUCKET`, `S3_CHAVE_ID`, `S3_CHAVE_SECRETA`, `FFMPEG_PATH`, `FFPROBE_PATH` · ML (3): `ML_CONECTOR` (`api` ou `falso`), `ML_CLIENT_ID`, `ML_CLIENT_SECRET`, `ML_REDIRECT_URI`, `ML_USAR_PKCE`, `CHAVE_CRIPTOGRAFIA` (32 bytes em base64, AES-256-GCM) · Focus (4): `EMISSOR_NFE` (`focus` ou `falso`), `FOCUS_TOKEN_HOMOLOGACAO`, `FOCUS_TOKEN_PRODUCAO`. Em desenvolvimento, `.env.example` traz `ML_CONECTOR=falso`, `EMISSOR_NFE=falso` e `ARMAZENAMENTO=disco`.

**Procedimento das migrações antes do merge** (na worktree da fase, Git Bash):
```bash
git merge main                                     # traz as fases já mergeadas
git rm -rq drizzle && git checkout main -- drizzle # descarta as migrações da branch e volta às do main
npm run db:gerar -- --name fase3_mercado_livre     # uma migração só, com o diff do schema da fase
# se houver SQL à mão: npx drizzle-kit generate --custom --name fase3_dados e colar o conteúdo de src/db/sql-manual/fase3.sql
# recriar o banco de testes da fase (§6) e rodar a suíte inteira; depois commitar drizzle/
```
SQL escrito à mão (raro: dados iniciais, trava especial) fica guardado em `src/db/sql-manual/fase<N>.sql`, porque a migração gerada é descartada a cada regeneração. Nomes: `fase2_conferencia`, `fase3_mercado_livre`, `fase4_fiscal`, `fase5_remessas`, `fase6_acabamento`.

## 4. Modelo de dados das Fases 2 a 5 (fixo)

Convenções da Fase 1: tabela e coluna em `snake_case`, propriedade TypeScript em `camelCase`, `uuid` com `defaultRandom()`, datas `timestamptz`. Enums nascem de listas `as const` nos arquivos de domínio, que o schema importa por **caminho relativo** (nunca `@/`).

### 4.1 Na P2 (migração 0006)
```
enum destino_item            BOM, PROBLEMA
enum motivo_item             AVARIADO, USADO, DIVERGENTE, INCOMPLETO, COM_DEFEITO, AUSENTE, OUTRO
enum tipo_evidencia          FOTO_1_ETIQUETA, FOTO_2_EMBALAGEM, FOTO_3_PRODUTO, FOTO_4_CODIGO_SERIAL, VIDEO_PROVA, EXTRA
enum situacao_processamento  RECEBIDA, PROCESSANDO, PRONTA, FALHOU, APAGADA
enum video_obrigatorio       SEMPRE, SO_PROBLEMA
enum regime_tributario       SIMPLES, PRESUMIDO, REAL
enum ambiente_nfe            HOMOLOGACAO, PRODUCAO

devolucoes (+)
  conferente_id            uuid → usuarios (set null)   trava da conferência (spec §5.1, §11); fica gravado depois de concluir
  conferencia_iniciada_em  timestamptz
  conferida_em             timestamptz                  EM_CONFERENCIA → AGUARDANDO_NF
  concluida_em             timestamptz                  → CONCLUIDA

itens_devolucao (+)
  produto_recebido_id uuid → produtos (set null); ean_lido text
  lote_fabricacao text     o "Lote" da Foto 4 (não confundir com o lote de remessa)
  validade text            como está impresso (ex.: 12/2027)
  destino destino_item     vazio até a decisão; vazio também quando AUSENTE
  motivo motivo_item; observacao text
  check itens_destino_motivo: (destino = BOM e motivo vazio) ou (destino = PROBLEMA e motivo preenchido e ≠ AUSENTE)
                              ou (destino vazio e (motivo vazio ou motivo = AUSENTE))

evidencias (nova; src/db/schema/evidencias.ts)
  id uuid pk; devolucao_id uuid not null → devolucoes (cascade)
  item_id uuid → itens_devolucao (cascade)        obrigatório só em FOTO_3 e FOTO_4 (check)
  tipo tipo_evidencia not null; tipo_conteudo text not null (image/jpeg, video/mp4, video/quicktime...)
  caminho text                 chave no armazenamento final (vazio até PRONTA)
  caminho_temporario text      arquivo do upload em MIDIA_TMP_DIR, até o processamento
  provedor text                'disco' ou 's3', onde está o `caminho`
  tamanho_original bigint not null; tamanho bigint (do arquivo final)
  sha256_original text not null (calculado ao terminar o upload, spec §9); sha256_final text
  situacao_processamento situacao_processamento not null default RECEBIDA; erro_processamento text
  id_cliente uuid not null unique              idempotência do envio pelo celular
  enviado_por uuid → usuarios (set null); enviado_em timestamptz not null default now(); processado_em timestamptz
  índices únicos: (devolucao_id, tipo) onde item_id vazio e tipo ≠ EXTRA; (item_id, tipo) onde item_id preenchido

configuracoes (nova, uma linha só; src/db/schema/configuracoes.ts)
  id smallint pk default 1, check id = 1
  razao_social, cnpj, ie, logradouro, numero, complemento, bairro, cidade, uf, cep   text
  regime_tributario regime_tributario (vazio até o Gestor escolher); serie_nfe text (ex.: '2')
  ambiente_nfe ambiente_nfe not null default HOMOLOGACAO
  video_obrigatorio video_obrigatorio not null default SEMPRE; meses_retencao_midia integer not null default 12
  atualizado_por uuid → usuarios (set null); atualizado_em timestamptz
```
O "provedor de armazenamento" da spec §5.1 não vira coluna: vem de `ARMAZENAMENTO` no `.env` (as credenciais ficam lá), e a tela só mostra o valor (§8, D2).

### 4.2 Fase 3 (`src/db/schema/mercado-livre.ts`)
```
enum situacao_conta      ATIVA, RECONECTAR
enum status_contestacao  AGUARDANDO_GESTOR, ENVIADA, FALHOU

contas_marketplace
  id uuid pk; canal canal not null; seller_id text not null
  access_token text not null; refresh_token text not null      cifrados com AES-256-GCM (CHAVE_CRIPTOGRAFIA)
  expira_em timestamptz not null; situacao situacao_conta not null default ATIVA; escopo text
  ultima_sincronizacao_em timestamptz        alerta "sincronização parada há mais de 1h" (spec §11)
  conectada_por uuid → usuarios; conectada_em, atualizada_em timestamptz
  único (canal, seller_id)

contestacoes_canal
  id uuid pk; devolucao_id uuid not null unique → devolucoes (cascade)
  motivo_canal text not null (SRF2 a SRF6); mensagem text not null
  evidencias uuid[] not null default '{}'    ids de `evidencias` (só fotos; o vídeo não vai ao ML)
  prazo timestamptz; status status_contestacao not null default AGUARDANDO_GESTOR
  revisado_por uuid → usuarios; erro text; criada_em, enviada_em, atualizada_em timestamptz

reclamacoes_ml                               estado da sincronização (o "mapeamento" da spec §14)
  claim_id text pk; return_id text; subtipo text; status_reclamacao text; status_devolucao text
  devolucao_id uuid → devolucoes (set null)  vazio para `low_cost` (só consulta, spec §7.3)
  atualizada_no_ml_em timestamptz; sincronizada_em timestamptz not null
```

### 4.3 Fase 4 (`src/db/schema/fiscal.ts`)
```
enum tipo_nota           DEVOLUCAO_VENDA, REMESSA_CONSERTO, REMESSA_TROCA_GARANTIA
enum situacao_nota       PROCESSANDO, AUTORIZADA, REJEITADA, CANCELADA
enum operacao_fiscal     DENTRO_ESTADO, FORA_ESTADO
enum origem_nota_venda   MERCADO_LIVRE, ANEXO

notas_fiscais
  id uuid pk; tipo tipo_nota not null
  devolucao_id uuid → devolucoes; lote_id uuid (a FK para `lotes` entra na Fase 5)
  check: exatamente um de devolucao_id e lote_id
  ambiente ambiente_nfe not null; serie text; numero text; chave text unique
  chaves_referenciadas text[] not null default '{}'
  situacao situacao_nota not null default PROCESSANDO; motivo_rejeicao text
  referencia_emissor text not null unique    o `ref` da Focus = id sem hífens (só letras e números)
  xml_caminho, danfe_caminho, xml_cancelamento_caminho text; justificativa_cancelamento text
  emitida_por uuid → usuarios; criada_em, autorizada_em, cancelada_em, atualizada_em timestamptz
  únicos parciais: (devolucao_id) e (lote_id) onde situacao ≠ CANCELADA   "uma NF por devolução" (spec §6.4)

notas_venda                                  XML da NF de venda (spec §7.5)
  id uuid pk; devolucao_id uuid not null → devolucoes (cascade); chave text not null
  origem origem_nota_venda not null; xml_caminho text not null
  destinatario jsonb not null    só o necessário à NF (nome, CPF/CNPJ, IE e indicador, endereço, UF) — LGPD
  itens jsonb not null           código, EAN, descrição, NCM, unidade, quantidade, valor unitário, tributos por unidade
  emitida_em timestamptz; anexada_por uuid → usuarios; criada_em timestamptz
  único (devolucao_id, chave)

regras_fiscais                               spec §5.1 RegraFiscal e §8.2
  id uuid pk; tipo_nota tipo_nota not null; operacao operacao_fiscal not null
  cfop text not null; icms_situacao_tributaria text not null (CSOSN no Simples, CST no Presumido e Real)
  pis_situacao_tributaria text not null; cofins_situacao_tributaria text not null
  natureza_operacao text not null; informacoes_complementares text
  atualizado_por uuid; atualizado_em timestamptz; único (tipo_nota, operacao)
```

### 4.4 Fase 5 (`src/db/schema/lotes.ts`, fixado agora para a Fase 4 não precisar adivinhar)
```
enum tipo_lote             CONSERTO, TROCA, GARANTIA
enum status_lote           ABERTO, FECHADO, NF_EMITIDA, ENVIADO, FINALIZADO
enum resultado_fornecedor  TROCADO, CONSERTADO, CREDITO, DESCARTADO, DEVOLVIDO_SEM_SOLUCAO

lotes
  id uuid pk; numero bigserial unique; codigo text gerado 'LOT-' + 6 dígitos (como o DEV)
  fornecedor_id uuid not null → fornecedores (restrict); tipo tipo_lote (definido ao fechar)
  status status_lote not null default ABERTO; rastreio_envio text; nota_fiscal_id uuid → notas_fiscais (set null)
  criado_em, fechado_em, enviado_em, finalizado_em, atualizado_em timestamptz; fechado_por uuid
  único parcial (fornecedor_id) onde status = ABERTO   "no máximo um lote ABERTO por fornecedor"
itens_devolucao (+)  lote_id uuid → lotes (set null) com índice; resultado_fornecedor resultado_fornecedor
notas_fiscais        lote_id ganha a FK → lotes
```
Tipo do lote → tipo da NF: CONSERTO → REMESSA_CONSERTO; TROCA e GARANTIA → REMESSA_TROCA_GARANTIA. A lista consolidada (PDF e Excel) é gerada na hora, sem tabela.

### 4.5 Vocabulário (arquivos de domínio e rótulos de tela)
- P2, `src/modules/devolucoes/dominio.ts`: `DESTINOS_ITEM`, `type DestinoItem`, `ROTULO_DESTINO` (**"Estoque Bom"**, **"Estoque Problema"**) e `MOTIVOS_ITEM`, `type MotivoItem`, `ROTULO_MOTIVO` (Avariado, Usado, Divergente, Incompleto, Com defeito, Ausente, Outro).
- P2, `src/modules/midia/dominio.ts`: `TIPOS_EVIDENCIA`, `type TipoEvidencia`, `ROTULO_EVIDENCIA` (**"Foto 1"**, **"Foto 2"**, **"Foto 3"**, **"Foto 4"**, **"Vídeo de Prova"**, "Extra": os nomes do PDF); `SITUACOES_PROCESSAMENTO`, `type SituacaoProcessamento`.
- P2, `src/modules/configuracoes/dominio.ts`: `VIDEO_OBRIGATORIO`, `REGIMES_TRIBUTARIOS` + `type RegimeTributario` + `ROTULO_REGIME`, `AMBIENTES_NFE` + `type AmbienteNfe` + `ROTULO_AMBIENTE` ("Homologação (sem valor fiscal)", "Produção"). Os enums do schema: `destinoItemEnum`, `motivoItemEnum`, `tipoEvidenciaEnum`, `situacaoProcessamentoEnum`, `videoObrigatorioEnum`, `regimeTributarioEnum`, `ambienteNfeEnum` (este em `src/db/schema/configuracoes.ts`; a Fase 4 importa dali para `notas_fiscais.ambiente`).
- P2, `src/modules/configuracoes/ler.ts`: `type Configuracao` = a linha de `configuracoes` em camelCase (`razaoSocial`, `cnpj`, `ie`, `logradouro`, `numero`, `complemento`, `bairro`, `cidade`, `uf`, `cep`, `regimeTributario`, `serieNfe`, `ambienteNfe`, `videoObrigatorio`, `mesesRetencaoMidia`, `atualizadoPor`, `atualizadoEm`), `CONFIGURACAO_PADRAO`, `lerConfiguracao(db)`.
- Nenhuma fase redefine estes nomes: reexporta ou importa (§10, E2).
- 3: `src/modules/mercado-livre/dominio.ts` · 4: `src/modules/fiscal/dominio.ts` · 5: `src/modules/lotes/dominio.ts`.

### 4.6 Status e transições
- **Devolução:** nada novo. Quem implementa cada linha já existente de `REGRAS_TRANSICAO`:
  - AGUARDANDO_CONFERENCIA → EM_CONFERENCIA, EM_CONFERENCIA → AGUARDANDO_CONFERENCIA (desistir, ou o Gestor libera a trava), EM_CONFERENCIA → AGUARDANDO_NF: **Fase 2**.
  - AGUARDANDO_NF → CONCLUIDA: **Fase 2** quando todos os itens são AUSENTE (na mesma transação da conclusão, em dois passos); **Fase 4** quando a NF é autorizada.
  - CONCLUIDA → AGUARDANDO_NF (NF cancelada): **Fase 4**.
  - (nova) → PENDENTE_CHEGADA pelo SISTEMA, PENDENTE_CHEGADA → CANCELADA, EXTRAVIADA ou NO_CD_MARKETPLACE pelo SISTEMA, e NO_CD_MARKETPLACE → PENDENTE_CHEGADA: **Fase 3**.
  - Status do ML que muda depois da chegada física não muda o status: só grava o evento `ml_status_apos_chegada` (o alerta é da Fase 6).
- **Item** (`REGRAS_TRANSICAO_ITEM` e `exigirTransicaoItem(p: { de: StatusItem; para: StatusItem; ator: Ator })` em `transicoes-item.ts`, criados completos na P2):

| De | Para | Gatilho | Atores | Fase |
|---|---|---|---|---|
| PENDENTE | AGUARDANDO_NF | conclusão da conferência, destino BOM ou PROBLEMA | Operador, Gestor | 2 |
| PENDENTE | AUSENTE | conclusão da conferência, motivo AUSENTE | Operador, Gestor | 2 |
| AGUARDANDO_NF | DISPONIVEL_VENDA | NF de devolução autorizada, destino BOM | sistema | 4 |
| DISPONIVEL_VENDA | AGUARDANDO_NF | NF de devolução cancelada | sistema | 4 |
| AGUARDANDO_NF | EM_LOTE ou SEM_FORNECEDOR | NF de devolução autorizada, destino PROBLEMA (pela porta de lotes) | sistema | 5 |
| SEM_FORNECEDOR | EM_LOTE | produto ou fornecedor associado | Fiscal, Gestor, sistema | 5 |
| EM_LOTE ou SEM_FORNECEDOR | AGUARDANDO_NF | NF de devolução cancelada (só com o lote ainda ABERTO) | sistema | 5 |
| EM_LOTE | ENVIADO | Registrar envio do lote | Fiscal, Gestor | 5 |
| ENVIADO | RESOLVIDO | Registrar resultado (`resultado_fornecedor`) | Fiscal, Gestor | 5 |

- Durante a conferência o item continua PENDENTE (destino, motivo e campos podem ser gravados e trocados); só a conclusão muda o status.
- **Nota fiscal** (Fase 4, spec §5.5): (nova) → PROCESSANDO → AUTORIZADA ou REJEITADA; REJEITADA → PROCESSANDO (corrigir e reenviar, mesmo `ref`); AUTORIZADA → CANCELADA.
- **Lote** (Fase 5, spec §5.4): (novo) → ABERTO (sistema); ABERTO ⇄ FECHADO (Fiscal; o tipo é escolhido ao fechar; reabrir só antes da NF); FECHADO → NF_EMITIDA (sistema, NF de remessa autorizada); NF_EMITIDA → FECHADO (sistema, NF de remessa cancelada); NF_EMITIDA → ENVIADO (Fiscal, "Registrar envio"); ENVIADO → FINALIZADO (sistema, todos os itens RESOLVIDO).
- **Contestação** (Fase 3): (nova) → AGUARDANDO_GESTOR (sistema, ao fim da conferência); AGUARDANDO_GESTOR → ENVIADA ou FALHOU (tarefa de envio); FALHOU → AGUARDANDO_GESTOR (o Gestor revisa e tenta de novo).
- **Conta do marketplace** (Fase 3): ATIVA ⇄ RECONECTAR (spec §7.1).

### 4.7 Histórico
- `EntidadeHistorico` (P2): `'devolucao' | 'item' | 'usuario' | 'configuracao' | 'conta_marketplace' | 'contestacao' | 'nota_fiscal' | 'lote'`. Evidência registra evento na **devolução**, com `dados: { evidenciaId, tipo, itemId, sha256_original/sha256_final }`.
- Chaves reservadas (a P2 cria todas com o rótulo; chave nova só com o prefixo da fase):
  - `base.ts`: as atuais, mais `item_status` ("Status do item alterado"), `concluida` ("Devolução concluída"), `configuracao_alterada` ("Configuração alterada").
  - `conferencia.ts` (2): `conferencia_iniciada`, `conferencia_interrompida`, `conferencia_trava_liberada`, `conferencia_concluida`, `item_conferido`, `evidencia_enviada`, `evidencia_processada`, `evidencia_refeita`, `evidencia_falhou`.
  - `mercado-livre.ts` (3): `ml_vinculada`, `ml_status_atualizado`, `ml_entregue`, `ml_no_cd`, `ml_reenviada_ao_vendedor`, `ml_status_apos_chegada`, `ml_resultado_ok_enviado`, `ml_resultado_ok_recusado`, `ml_resultado_sem_vinculo`, `ml_conta_conectada`, `ml_conta_reconectar`, `ml_conta_desconectada`, `contestacao_criada`, `contestacao_revisada`, `contestacao_enviada`, `contestacao_falhou`.
  - `fiscal.ts` (4): `nf_solicitada`, `nf_autorizada`, `nf_rejeitada`, `nf_reenviada`, `nf_cancelada`, `nf_item_escolhido`, `nota_venda_anexada`, `nota_venda_obtida_ml`, `nota_venda_removida`, `devolucao_reaberta`.
  - Nomes dos exports (um por arquivo, `Record<string, string>`): `ROTULOS_BASE`, `ROTULOS_CONFERENCIA`, `ROTULOS_MERCADO_LIVRE`, `ROTULOS_FISCAL`, `ROTULOS_LOTES`, `ROTULOS_ACABAMENTO`. `ROTULO_ACAO` (em `eventos.ts`) é a junção deles.
  - `lotes.ts` (5): `lote_criado`, `lote_item_incluido`, `lote_item_movido`, `lote_fechado`, `lote_reaberto`, `lote_enviado`, `lote_resultado_registrado`, `lote_finalizado`.
  - `acabamento.ts` (6): `midia_apagada_retencao`, `tarefa_reenviada`.

## 5. Interfaces entre as fases (assinaturas exatas)

Regra da spec §4.3: o núcleo nunca chama API externa direto. Os serviços externos (ML, Focus NFe, B2) ficam atrás de interfaces, e as implementações falsas ficam em `src/` (o e2e roda o servidor e o worker de verdade). O usuário liga as contas reais no fim.

### 5.1 Fila e worker (P2)
```ts
// src/modules/fila/tarefas.ts
export type DadosTarefa = {
  'midia.processar-foto': { evidenciaId: string };            // 2: hash, carimbo (extra), envio ao armazenamento final
  'midia.transcodificar': { evidenciaId: string };            // 2: ffmpeg H.264 720p (spec §9)
  'limpeza.temporarios': Record<string, never>;               // 2 (extra): uploads tus abandonados e importações não confirmadas
  'ml.sincronizar-reclamacao': { claimId: string };           // 3
  'ml.varredura': Record<string, never>;                      // 3
  'ml.renovar-token': Record<string, never>;                  // 3
  'ml.enviar-resultado': { devolucaoId: string };             // 3 (enviada pela 2 ao concluir)
  'ml.enviar-contestacao': { contestacaoId: string };         // 3
  'nfe.emitir': { notaFiscalId: string };                     // 4
  'nfe.consultar': { notaFiscalId: string; consulta: number };// 4 (reagenda a si mesma com espera crescente)
  'lotes.alocar-pendentes': Record<string, never>;            // 5 (uma vez, na subida do worker)
  'midia.retencao': Record<string, never>;                    // 6
};
export type NomeTarefa = keyof DadosTarefa;
export const CONFIG_TAREFAS: Record<NomeTarefa, { tentativas: number; expiraEmSegundos: number; agenda?: string }>;
// agendas (fuso America/Sao_Paulo): ml.varredura '*/15 * * * *'; ml.renovar-token '0 */5 * * *';
// limpeza.temporarios '30 3 * * *'; midia.retencao '0 3 * * *'. midia.transcodificar expira em 3600 s; o resto em 300 s.
// tentativas: 5 em todas (spec §11), o que no pg-boss é retryLimit = 4 (a P2 confirma a contagem num teste).

// src/modules/fila/fila.ts
export type OpcoesEnvio = { tx?: DbOuTx; chaveUnica?: string; iniciarEm?: Date };
export interface Fila {
  enviar<N extends NomeTarefa>(nome: N, dados: DadosTarefa[N], opcoes?: OpcoesEnvio): Promise<void>;
}
export function obterFila(): Fila;                       // pg-boss; cria as filas de CONFIG_TAREFAS (idempotente)
export function definirFilaParaTestes(f: Fila | null): void;
export class FilaMemoria implements Fila { readonly enviadas: { nome: NomeTarefa; dados: unknown; opcoes?: OpcoesEnvio }[] }
// FilaMemoria: um item por envio, na ordem; sem `opcoes`, o item não tem a chave `opcoes`. Não deduplica por chaveUnica.
// chaveUnica (E4): vira o id fixo do job no pg-boss (idDoJob(nome, chave)). Um 2º envio com a mesma (tarefa, chave) é
// ignorado ENQUANTO o job existir, inclusive depois de concluído (o pg-boss só apaga o job dias depois).
// Use-a só para "uma vez por evento"; um reenvio legítimo (outra rodada, outro pedido do usuário) usa uma chave nova.

// src/worker/tipos.ts
export type ContextoTarefa = { db: Db; fila: Fila; agora: Date; tentativa: number };   // tentativa começa em 1; a última é CONFIG_TAREFAS[nome].tentativas (5)
export type Manipulador<N extends NomeTarefa> = (dados: DadosTarefa[N], ctx: ContextoTarefa) => Promise<void>;
export type Manipuladores = { [N in NomeTarefa]?: Manipulador<N> };
// src/worker/manipuladores/{midia,mercado-livre,fiscal,lotes,acabamento}.ts: `export const manipuladores<Area>: Manipuladores = {}`
//   nomes exatos: manipuladoresMidia, manipuladoresMercadoLivre, manipuladoresFiscal, manipuladoresLotes, manipuladoresAcabamento
//   (o src/worker/index.ts da P2 já importa os cinco; a fase só troca o objeto do próprio arquivo)
```
- Cada fase só preenche o seu arquivo de manipuladores; o `src/worker/index.ts` (P2) junta todos, chama `work()` para quem tem manipulador e agenda as tarefas com `agenda`.
- **Manipulador idempotente:** pode rodar duas vezes; se a entidade não existe mais (ex.: banco de testes esvaziado), termina sem erro. Lançar exceção = nova tentativa. Erro definitivo de negócio (ex.: SEFAZ rejeitou) não lança: grava o resultado no domínio.
- `tx` em `enviar` põe o envio na mesma transação (adaptador `db` do pg-boss sobre o postgres.js). Se a P2 não conseguir, o envio vai logo depois do commit e o manipulador continua idempotente.

### 5.2 Armazenamento (P2, nome da spec §4.3: `ArmazenamentoArquivos`)
```ts
// src/modules/midia/armazenamento.ts
export interface ArmazenamentoArquivos {
  salvar(caminho: string, conteudo: Readable, opcoes?: { tipoConteudo?: string; tamanho?: number }): Promise<void>;
  ler(caminho: string): Promise<Readable>;
  urlTemporaria(caminho: string, segundos: number): Promise<string>;   // spec §9: 10 min; nunca público
  apagar(caminho: string): Promise<void>;
  existe(caminho: string): Promise<boolean>;
}
export function obterArmazenamento(): ArmazenamentoArquivos;            // conforme ARMAZENAMENTO (onde gravar arquivo novo)
export function armazenamentoDoProvedor(provedor: string): ArmazenamentoArquivos; // onde está um arquivo já gravado (coluna `provedor`)
export function provedorAtual(): ProvedorArmazenamento;                // 'disco' | 's3' | 'memoria' (este nos testes); grave-o em `provedor`
export function definirArmazenamentoParaTestes(a: ArmazenamentoArquivos | null): void;
// P2: ArmazenamentoDisco (MIDIA_DIR; link = /api/arquivos?c=&exp=&sig=, HMAC com SEGREDO_LINKS e sessão exigida)
//     e ArmazenamentoMemoria (testes). Fase 2: ArmazenamentoS3 (B2 ou R2, @aws-sdk/client-s3 3.1161.0; §10, E6).
// Ler uma evidência (ex.: as fotos da contestação, Fase 3): armazenamentoDoProvedor(e.provedor).ler(e.caminho), nunca
// obterArmazenamento(), para a troca disco → S3 não quebrar os arquivos antigos (D2).
```
Chaves: `evidencias/{devolucaoId}/{evidenciaId}.{jpg|mp4}` (2), `notas-venda/{devolucaoId}/{notaVendaId}.xml` (4), `nfe/{aaaa}/{mm}/{notaFiscalId}.xml`, `...-danfe.pdf`, `...-cancelamento.xml` (4 e 5). O upload em andamento (tus) fica fora da interface, em `MIDIA_TMP_DIR`.

### 5.3 Conectores externos (tipos na P2; implementação na fase dona)
```ts
// src/conectores/marketplace/tipos.ts (P2) — a interface da spec §4.3 mais o método da §7.5
export type DevolucaoExterna = {
  canal: Canal; devolucaoExternaId: string; reclamacaoId: string; tipo: TipoDevolucao;
  semEnvioFisico: boolean;                         // subtype low_cost
  pedidos: string[]; statusCanal: string;          // valor bruto (return.status e o envio)
  destinoEnvio: 'VENDEDOR' | 'CD_MARKETPLACE' | null; reenvioDaTriagem: boolean;
  rastreio: string | null; transportadora: string | null;
  entregueEm: Date | null; prazoConferencia: Date | null; atualizadaEm: Date;
  itens: { pedido: string; sku: string; ean: string | null; quantidade: number }[];
};
export type MotivoCanal = 'SRF2' | 'SRF3' | 'SRF4' | 'SRF5' | 'SRF6';
export type ResultadoConferencia =
  | { tipo: 'OK' }
  | { tipo: 'PROBLEMA'; reclamacaoId: string; motivo: MotivoCanal; mensagem: string; pedido?: string;
      anexos: { nome: string; conteudo: Buffer; tipoConteudo: 'image/jpeg' }[] };
export interface MarketplaceConnector {
  canal: Canal;
  listarAtualizadasDesde(desde: Date): AsyncIterable<DevolucaoExterna>;
  obter(idExterno: string): Promise<DevolucaoExterna>;          // ML: idExterno = claim_id (o aviso traz a reclamação)
  enviarResultadoConferencia(idExterno: string, r: ResultadoConferencia): Promise<void>; // ML: idExterno = return_id (= devolucaoExternaId)
  obterXmlNotaVenda(pedidoExterno: string): Promise<string | null>;   // null = o canal não tem a nota
}
// src/conectores/marketplace/registro.ts (P2 devolve null; a Fase 3 troca o corpo)
export function obterConector(db: DbOuTx, canal: Canal): Promise<MarketplaceConnector | null>; // null sem integração ou sem conta ATIVA
export function definirConectorParaTestes(canal: Canal, c: MarketplaceConnector | null): void;
// com um conector: ele substitui o real; com null: VOLTA AO PADRÃO (P2: null; depois da Fase 3: o real, null sem conta ATIVA).
// O tests/setup/int-setup.ts chama com null para todos os canais antes de cada teste (E8).
```
- **Extensão por canal (E9):** o que só o ML tem (status e subtipo da reclamação, varredura por `last_updated`, `sellerId`) fica numa interface da Fase 3 que **estende** a da P2, na pasta do canal: `interface ConectorMercadoLivre extends MarketplaceConnector` em `src/conectores/marketplace/mercadolivre/tipos.ts`, com o guarda `ehConectorML(c): c is ConectorMercadoLivre` e `obterConectorML(db)` (`src/modules/mercado-livre/conector.ts`). O registro continua devolvendo `MarketplaceConnector`; ninguém mexe em `tipos.ts` da P2.
- **Fixtures do ML (E12):** `tests/fixtures/ml/doc/` = respostas copiadas ou montadas a partir dos exemplos da documentação oficial (testes do mapeamento puro); `tests/fixtures/ml-falso/` = cenários do conector falso (dev, e2e), montados a partir delas.

| Serviço | Interface | Real (ligado no fim) | Falso (dev, testes, e2e) | Variável |
|---|---|---|---|---|
| Mercado Livre | `MarketplaceConnector` | `src/conectores/marketplace/mercadolivre/` | `.../mercadolivre/falso.ts`, com respostas em `tests/fixtures/ml-falso/` montadas a partir dos exemplos da documentação oficial | `ML_CONECTOR` |
| Focus NFe | `EmissorNFe` (§5.7) | `src/conectores/nfe/focus.ts` | `src/conectores/nfe/falso.ts`: autoriza na 2ª consulta; rejeita quando a natureza da operação contém "REJEITAR" | `EMISSOR_NFE` |
| Backblaze B2 | `ArmazenamentoArquivos` | `ArmazenamentoS3` | disco e memória | `ARMAZENAMENTO` |

### 5.4 Fase 2 → Fase 3: fim da conferência
```ts
// src/modules/conferencia/concluir.ts (Fase 2)
export async function concluirConferencia(db: Db, devolucaoId: string, usuario: UsuarioSessao, agora?: Date):
  Promise<{ status: 'AGUARDANDO_NF' | 'CONCLUIDA' }>;
```
- Recusa enquanto faltar evidência obrigatória ou arquivo (spec §6.3): Fotos 1 e 2 sempre; Fotos 3 e 4 de cada item que não é AUSENTE; Vídeo de Prova conforme `video_obrigatorio` (§8, D5). "Subiu" = existe linha em `evidencias` com situação diferente de FALHOU.
- Numa transação: itens PENDENTE → AGUARDANDO_NF (com destino) ou AUSENTE, devolução → AGUARDANDO_NF com `conferida_em`, e, se todos forem AUSENTE, → CONCLUIDA com `concluida_em`.
- Se `canal = MERCADO_LIVRE`: `fila.enviar('ml.enviar-resultado', { devolucaoId }, { tx, chaveUnica: devolucaoId })`. Até a Fase 3 entrar, a tarefa espera na fila sem manipulador.
- O manipulador da Fase 3 decide: sem `devolucao_externa_id` → só registra o evento; todos BOM → `enviarResultadoConferencia(..., { tipo: 'OK' })` e `ml_resultado_ok_enviado`; algum PROBLEMA ou AUSENTE → cria a `contestacoes_canal` AGUARDANDO_GESTOR com motivo, mensagem e ids das fotos já preenchidos. Os arquivos só são lidos no envio, e o envio espera as fotos estarem PRONTA.
- Tradução dos motivos (Fase 3, spec §7.4): `motivoCanalML(m: MotivoItem): MotivoCanal`: AVARIADO → SRF2, INCOMPLETO → SRF3, DIVERGENTE → SRF4, AUSENTE → SRF5, USADO, COM_DEFEITO e OUTRO → SRF6.

### 5.5 Fase 3 → núcleo: devolução do ML pelo `criarDevolucao`
A spec usa `origem = 'API'` e `canal = 'MERCADO_LIVRE'` (não existe origem "ML"). A Fase 3 generaliza o 3º parâmetro de `criarDevolucao` (e só ela mexe em `criar.ts` na janela):
```ts
export type DadosCanal = {
  devolucaoExternaId: string; tipo: TipoDevolucao; pedidos: string[]; statusCanal: string;
  entregueSegundoCanalEm: Date | null; prazoConferenciaCanal: Date | null;
};
export async function criarDevolucao(
  db: DbOuTx,
  dados: DadosNovaDevolucao,               // canal 'MERCADO_LIVRE', pedido = pedidos[0], itens pelo seller_sku
  opcoes:
    | { origem: 'MANUAL' | 'PLANILHA'; usuario: UsuarioSessao }
    | { origem: 'API'; usuario: null; canal: DadosCanal; agora?: Date },
): Promise<DevolucaoCriada>;
```
- Com `origem: 'API'`: ator SISTEMA, `criado_por` vazio, evento `criada` sem usuário. A chave é (`canal`, `devolucao_externa_id`) (índice já existe). Se já existir, lança `ErroDevolucaoDuplicada` (quem chama atualiza em vez de criar).
- Ordem na sincronização (`src/modules/mercado-livre/sincronizar.ts`): (1) achou por `devolucao_externa_id` → atualiza; (2) existe devolução manual ativa do mesmo pedido no ML sem `devolucao_externa_id` → **vincula** (evento `ml_vinculada`; §8, D9); (3) senão → `criarDevolucao`. Depois, se for o caso, a transição PENDENTE_CHEGADA → NO_CD_MARKETPLACE, CANCELADA ou EXTRAVIADA pela tabela da spec §7.3.

### 5.6 Fase 2 → Fases 4 e 5: o que é `destino`
- Depois da conferência, cada item fica em: **(a)** `status = AGUARDANDO_NF` com `destino = BOM` (vai para **Estoque Bom**); **(b)** `status = AGUARDANDO_NF` com `destino = PROBLEMA` e `motivo` preenchido (vai para **Estoque Problema**); ou **(c)** `status = AUSENTE` com `destino` vazio e `motivo = AUSENTE` (fora da NF e do lote).
- `produto_recebido_id`: o produto esperado quando o EAN confere (ou nenhum EAN foi lido e o operador confirmou); o produto achado pelo `ean_lido` quando diverge; vazio quando é desconhecido. O fornecedor do lote é o do `produto_recebido` (spec §5.3); vazio → SEM_FORNECEDOR.
- Abas da etapa 4 (Fase 4, spec §6.4): **Estoque Bom** = devoluções AGUARDANDO_NF com algum item no caso (a); **Estoque Problema** = com algum item no caso (b). A mesma devolução pode aparecer nas duas. A coluna 4 do quadro mostra as duas contagens; o total é de devoluções distintas.
- As Fases 3, 4 e 5 criam esse estado por fábrica (`fabricas-<area>.ts`), gravando direto as colunas da §4.1, sem chamar código da Fase 2.
- A configuração é lida por `lerConfiguracao(db): Promise<Configuracao>` (P2, `src/modules/configuracoes/ler.ts`), que devolve os padrões quando a linha ainda não existe. Cada fase grava só os seus campos: a 2 em `src/modules/midia/configuracao.ts`, a 4 em `src/modules/fiscal/configuracao.ts`, sempre com upsert na linha `id = 1`.

### 5.7 Fase 4 → Fase 5: emissor, configuração fiscal, emissão e porta de lotes
```ts
// src/conectores/nfe/tipos.ts — interface da spec §4.3 (nomes da spec: emitir, consultar, cancelar) mais baixar
export type SituacaoNota =
  | { situacao: 'PROCESSANDO' }
  | { situacao: 'AUTORIZADA'; chave: string; numero: string; serie: string; urlXml: string; urlDanfe: string }
  | { situacao: 'REJEITADA'; codigo: string | null; motivo: string }          // motivo da SEFAZ em português
  | { situacao: 'CANCELADA'; urlXmlCancelamento: string | null }
  | { situacao: 'CANCELAMENTO_RECUSADO'; motivo: string };                    // a nota continua AUTORIZADA
export interface EmissorNFe {
  emitir(nota: NotaParaEmissao): Promise<{ referencia: string }>;
  consultar(referencia: string): Promise<SituacaoNota>;
  cancelar(referencia: string, justificativa: string): Promise<SituacaoNota>;   // justificativa de 15 a 255 caracteres
  baixar(url: string): Promise<Buffer>;                                         // XML e DANFE
}
// as duas funções abaixo moram em src/conectores/nfe/registro.ts (como o registro dos marketplaces) e o tipos.ts as
// reexporta; importe de '@/conectores/nfe/registro' (E10)
export function obterEmissorNFe(ambiente: AmbienteNfe): EmissorNFe;           // token do ambiente; EMISSOR_NFE
export function definirEmissorParaTestes(e: EmissorNFe | null): void;         // null = volta ao padrão (EMISSOR_NFE)

export type NotaParaEmissao = {
  referencia: string; tipo: TipoNota; naturezaOperacao: string;
  entrada: boolean;                                   // devolução de venda: true (tipo_documento 0)
  finalidade: 'NORMAL' | 'DEVOLUCAO'; operacao: OperacaoFiscal; consumidorFinal: boolean;
  regime: RegimeTributario; emitente: DadosEmitente; destinatario: Destinatario;
  chavesReferenciadas: string[];                      // 44 dígitos, sem o prefixo "NFe"
  itens: ItemNota[]; informacoesComplementares: string | null;
};
export type DadosEmitente = { razaoSocial: string; cnpj: string; ie: string; logradouro: string; numero: string;
  complemento: string | null; bairro: string; cidade: string; uf: string; cep: string };
export type Destinatario = { nome: string; cpf: string | null; cnpj: string | null; ie: string | null;
  indicadorIe: 1 | 2 | 9; logradouro: string; numero: string; complemento: string | null; bairro: string;
  cidade: string; uf: string; cep: string };
export type ItemNota = { codigo: string; descricao: string; ncm: string; cfop: string; unidade: string;
  quantidade: number; valorUnitario: number; ean: string | null; icmsOrigem: number; icmsSituacao: string;
  pisSituacao: string; cofinsSituacao: string;
  tributos?: { icmsBase?: number; icmsAliquota?: number; icmsValor?: number; pisBase?: number; pisAliquota?: number;
    pisValor?: number; cofinsBase?: number; cofinsAliquota?: number; cofinsValor?: number } };

// src/modules/fiscal/configuracao.ts
export type ConfiguracaoFiscal = { emitente: DadosEmitente; regime: RegimeTributario; serie: string | null; ambiente: AmbienteNfe };
export async function lerConfiguracaoFiscal(db: DbOuTx): Promise<ConfiguracaoFiscal>;   // ErroFiscal se faltar dado da empresa ou regime
export async function regraFiscal(db: DbOuTx, tipo: TipoNota, operacao: OperacaoFiscal): Promise<RegraFiscal>;
//   ErroFiscal "Falta a regra fiscal: Remessa para conserto, fora do estado" (spec §8.2); confere CSOSN × CST pelo regime
export function operacaoPorUf(ufEmpresa: string, ufDestinatario: string): OperacaoFiscal;

// src/modules/fiscal/emissao.ts
export async function solicitarEmissao(db: Db,
  alvo: { tipo: 'DEVOLUCAO_VENDA'; devolucaoId: string } | { tipo: 'REMESSA_CONSERTO' | 'REMESSA_TROCA_GARANTIA'; loteId: string },
  usuario: UsuarioSessao): Promise<{ notaFiscalId: string }>;    // cria PROCESSANDO e envia 'nfe.emitir'
export async function reenviarNota(db: Db, notaFiscalId: string, usuario: UsuarioSessao): Promise<void>; // REJEITADA → PROCESSANDO
export async function cancelarNota(db: Db, notaFiscalId: string, justificativa: string, usuario: UsuarioSessao): Promise<void>;

// src/modules/lotes/porta.ts — criada pela Fase 4 com a implementação "sem lotes"; a Fase 5 troca o corpo
export interface PortaLotes {
  alocarItensProblema(tx: DbOuTx, devolucaoId: string, agora: Date): Promise<void>;   // na transação da autorização
  motivoParaNaoCancelarDevolucao(tx: DbOuTx, devolucaoId: string): Promise<string | null>; // null = pode cancelar
  desfazerAlocacao(tx: DbOuTx, devolucaoId: string, agora: Date): Promise<void>;     // na transação do cancelamento
  montarNotaRemessa(tx: DbOuTx, loteId: string, referencia: string): Promise<NotaParaEmissao>; // spec §8.5
  aoAutorizarRemessa(tx: DbOuTx, loteId: string, notaFiscalId: string, agora: Date): Promise<void>; // FECHADO → NF_EMITIDA
  aoCancelarRemessa(tx: DbOuTx, loteId: string, agora: Date): Promise<void>;                         // NF_EMITIDA → FECHADO
}
export const portaLotes: PortaLotes;
```
- A montagem é escolhida pelo tipo (também ao reenviar): DEVOLUCAO_VENDA → `montarNotaDevolucao` (Fase 4, spec §8.4); REMESSA_* → `portaLotes.montarNotaRemessa` (Fase 5).
- Efeitos da autorização (Fase 4, na transação do `nfe.consultar`): DEVOLUCAO_VENDA → itens BOM → DISPONIVEL_VENDA, `portaLotes.alocarItensProblema`, devolução → CONCLUIDA; REMESSA_* → `portaLotes.aoAutorizarRemessa`. No cancelamento, o caminho inverso, depois de `motivoParaNaoCancelarDevolucao`.
- Implementação "sem lotes" (até a Fase 5): `alocarItensProblema` e `desfazerAlocacao` não fazem nada (o item PROBLEMA fica AGUARDANDO_NF), `motivoParaNaoCancelarDevolucao` devolve `null`, e os três métodos de remessa lançam "As remessas chegam na Fase 5". A Fase 5 aloca o que ficou para trás com a tarefa `lotes.alocar-pendentes`.

### 5.8 Fase 4 → Fase 3: NF de venda do ML (spec §7.5)
A Fase 4 chama `(await obterConector(db, 'MERCADO_LIVRE'))?.obterXmlNotaVenda(pedido)` na devolução do ML ainda sem `notas_venda`. Até a Fase 3 entrar, o registro devolve `null` e só existe o caminho "o Fiscal anexa o XML da NF de venda". Os dois caminhos gravam pela mesma função da Fase 4: `registrarNotaVenda(db, devolucaoId, xml: string, origem: OrigemNotaVenda, usuario: UsuarioSessao | null)`.

## 6. Isolamento dos testes no trabalho em paralelo

| | `main` | Fase 2 | Fase 3 | Fase 4 |
|---|---|---|---|---|
| Worktree | a pasta do projeto | `C:/Users/idmpc/devolucoes-wt/fase-2` | `.../fase-3` | `.../fase-4` |
| Branch | `main` | `fase-2-conferencia` | `fase-3-mercado-livre` | `fase-4-fiscal` |
| `DATABASE_URL` (dev) | `devolucoes` | `devolucoes_f2` | `devolucoes_f3` | `devolucoes_f4` |
| `DATABASE_URL_TEST` | `devolucoes_test` | `devolucoes_test_f2` | `devolucoes_test_f3` | `devolucoes_test_f4` |
| `PORTA_E2E` | 3100 | 3102 | 3103 | 3104 |
| `next dev` | 3000 | `npm run dev -- --port 3002` | 3003 | 3004 |

- **Como cada configuração escolhe o banco:** pelo `.env` da própria worktree (o `.env` não vai para o git e cada worktree tem o seu). `vitest.int.config.mts` e `playwright.config.ts` leem o `.env` da pasta atual; `tests/setup/int-global-setup.ts`, `tests/helpers/db.ts`, `tests/e2e/global-setup.ts` e `apoio.ts` usam `DATABASE_URL_TEST` (com a trava da P1). O servidor do e2e recebe `DATABASE_URL = DATABASE_URL_TEST`, e o worker do e2e (P2) também.
- **Pasta do build do e2e:** continua `.next-e2e`, mas dentro de cada worktree, que é uma pasta separada. Um `.next-e2e-fN` não é necessário e obrigaria a mexer no `.gitignore` e no `tsconfig.json`. Mídias de teste: `MIDIA_DIR`/`MIDIA_TMP_DIR` são relativos à worktree. O pg-boss usa o schema `pgboss` do banco da própria fase.
- **Criar as worktrees e os bancos** (Git Bash, depois da Fase P no `main`):
```bash
cd "/c/Users/idmpc/Dvoluções Markt"
PG="/c/Program Files/PostgreSQL/17/bin"; export PGPASSWORD="$(cat /c/Users/idmpc/.postgres-superusuario.txt)"
for f in 2:conferencia 3:mercado-livre 4:fiscal; do n=${f%%:*}; nome=${f#*:}
  git worktree add -b "fase-$n-$nome" "/c/Users/idmpc/devolucoes-wt/fase-$n" main
  "$PG/createdb.exe" -U postgres -O devolucoes "devolucoes_f$n"
  "$PG/createdb.exe" -U postgres -O devolucoes "devolucoes_test_f$n"
  cp .env "/c/Users/idmpc/devolucoes-wt/fase-$n/.env"   # depois trocar as 3 linhas da tabela
done
# em cada worktree: npm ci && npm run db:migrar
```
- **Recriar o banco de testes** (depois de regenerar migrações, §3): `"$PG/dropdb.exe" -U postgres --if-exists devolucoes_test_f3 && "$PG/createdb.exe" -U postgres -O devolucoes devolucoes_test_f3`. Faça o mesmo com o banco de dev da fase, se ele tiver recebido migrações que foram descartadas.
- A Fase 2 precisa do ffmpeg no Windows (`winget install Gyan.FFmpeg`, spec §13). Os testes que chamam o ffmpeg são pulados se `ffmpeg -version` falhar.

## 7. Ordem de merge e integração

Ordem: **P → (2, 3, 4 em paralelo) → merge 2 → merge 3 → merge 4 → Fase 5 → Fase 6.** Push e deploy ficam com o usuário.

**Cada plano termina com uma tarefa "Integração"**, feita na worktree depois de `git merge main`:
1. Resolver conflitos pelas regras da §3 (lockfile refeito, migrações regeneradas, nada de arquivo congelado).
2. Recriar o banco de testes da fase e rodar tudo: `npm run typecheck && npm run lint && npm test && npm run test:int && npm run build:scripts && npm run test:e2e`.
3. Testes de integração entre as fases (ponta a ponta, com os falsos):
   - **Fase 3** (já com a 2 no `main`): conferência real de uma devolução que veio do ML falso → todos BOM → "OK" enviado; com PROBLEMA → contestação AGUARDANDO_GESTOR com as Fotos → "Enviar ao ML".
   - **Fase 4** (já com 2 e 3): recebimento → conferência → Estoque Bom e Estoque Problema → Emitir NF de devolução (emissor falso) → CONCLUIDA; NF de venda buscada no ML falso; rejeição → corrigir e reenviar; cancelamento.
   - **Fase 5**: a mesma jornada até o lote → fechar → NF de remessa → lista consolidada → envio → resultado → FINALIZADO (o e2e completo da spec §12).
   - **Conferência pela tela (E11):** a Fase 2 exporta `conferirDevolucao(page, codigo, unidades)` em `tests/e2e/apoio-conferencia.ts` (dona: Fase 2). Com a Fase 2 já no `main`, as tarefas "Integração" das Fases 3 e 4 podem usá-lo no e2e. O caminho por serviço (`iniciarConferencia` de `src/modules/conferencia/trava.ts` + `concluirConferencia`) continua valendo como alternativa.

**No `main`, depois de cada merge (`git merge --no-ff`):** recriar `devolucoes_test`, rodar a suíte inteira, `npm run db:migrar` no banco `devolucoes`, apagar a worktree (`git worktree remove`) e os bancos `_fN` da fase. As worktrees que ainda estão abertas fazem `git merge main` logo em seguida, para pegar conflitos cedo.

## 8. Decisões onde a spec é omissa (a mais simples; o usuário pode vetar)

- **D1.** Fase P no `main` antes de ramificar (§2). Sem ela, as Fases 3 e 4 não teriam fila, armazenamento nem as colunas da conferência.
- **D2.** Provedor de armazenamento: vem de `ARMAZENAMENTO` no `.env`, junto com as credenciais. A tela de Configurações só mostra o valor. Cada evidência guarda o `provedor` onde está, para a troca disco → S3 não quebrar os links antigos.
- **D3.** Só entra em conferência uma devolução identificada e com pelo menos 1 item.
- **D4.** Item AUSENTE: destino vazio, motivo AUSENTE, sem Fotos 3 e 4.
- **D5.** `video_obrigatorio = SO_PROBLEMA`: o vídeo é exigido se algum item for PROBLEMA ou AUSENTE.
- **D6.** Refazer uma evidência antes de concluir apaga a anterior (linha e arquivo) e grava os dois hashes no evento `evidencia_refeita`. A foto original é descartada depois do carimbo; fica o `sha256_original`.
- **D7.** Desistir da conferência (ou o Gestor liberar a trava) mantém o que já foi preenchido.
- **D8.** Uma `ContestacaoCanal` por devolução, com o motivo do primeiro item com problema. O Gestor pode trocar o motivo e a mensagem antes de enviar.
- **D9.** O ML **vincula** a devolução manual ativa do mesmo pedido (canal ML, sem `devolucao_externa_id`) em vez de criar outra. Isso cobre o uso da bancada com cadastro manual antes da Fase 3.
- **D10.** `low_cost` (sem envio físico) fica só em `reclamacoes_ml`, para consulta na tela do ML, sem devolução.
- **D11.** Até a Fase 5, item PROBLEMA continua AGUARDANDO_NF depois da NF autorizada (porta "sem lotes"); a 5 aloca os pendentes.
- **D12.** NF-e por consulta periódica (`nfe.consultar` com espera crescente: 10 s, 30 s, 1 min, 2 min, 5 min, depois a cada 10 min), sem webhook da Focus. `ref` = id da nota sem hífens. Série e numeração ficam no cadastro da empresa na Focus; o sistema confere a série que volta.
- **D13.** As regras fiscais não nascem gravadas: o formulário (Gestor, em Configurações) já vem com os CFOP sugeridos da §8.3, e a emissão é recusada até a regra ser salva (spec §8.2).
- **D14.** Item da devolução ↔ item da NF de venda: pelo código do produto (= SKU), depois pelo EAN; se nada casar, o Fiscal escolhe. A escolha fica no próprio `notas_venda.itens[]` (campo `itensDevolucaoIds` dentro do jsonb), sem coluna nova (§10, E13).
- **D15.** `validade` é texto livre, como está impresso.
- **D16.** A divisão Estoque Bom / Estoque Problema da coluna 4 é da Fase 4 (spec §6.4), e não da 2.
- **D17.** Os falsos (ML, Focus e armazenamento em memória) ficam em `src/`, e `lerEnv` recusa `falso` com `NODE_ENV=production`, a menos que `PERMITIR_FALSOS=1` (só o e2e define; §10, E1).

## 9. Perguntas que estavam em aberto (decididas)

O usuário já tinha decidido as duas: "constroi ele inteiro e deixa para conectarmos no final".

1. **Contas reais só no fim: SIM.** As Fases 3, 4 e 5 terminam com os falsos, montados a partir da documentação oficial. Uma etapa **"Ligação das contas reais"**, antes da Fase 6, cumpre os critérios de pronto da spec §14 que dependem de contas reais: devolução real do ML e NF autorizada em homologação. Essa etapa também ajusta o mapeamento do ML às respostas reais do teste §7.6. Os conectores devem isolar o mapeamento (funções puras sobre o JSON de entrada), para esse ajuste ficar barato.
2. **Mídia antes do B2: disco só para teste.** A Fase 2 vai para a VPS com `ARMAZENAMENTO=disco`, só para teste na bancada. O uso diário começa quando a conta B2 (ou R2) for ligada, na mesma etapa de ligação das contas. A tela de Configurações mostra um aviso quando o provedor é `disco` em produção.

## 10. Emendas (reconciliação de 2026-11-13)

Regra usada: a **Parte A do plano da Fase 2 manda** nos nomes compartilhados. O que as Fases 3 e 4 precisavam e faltava entrou na Parte A, porque os arquivos compartilhados congelam depois dela. Cada linha diz o que mudou e por quê.

- **E1. `PERMITIR_FALSOS=1`.** O `lerEnv` recusa `ML_CONECTOR=falso` e `EMISSOR_NFE=falso` quando `NODE_ENV=production` e `PERMITIR_FALSOS !== '1'`. Só o `AMBIENTE_E2E` (`tests/e2e/dados.ts`), usado no `webServer.env` do Playwright e no worker do e2e, define a variável. Motivo: o e2e roda `next build && next start` (`NODE_ENV=production`); a regra antiga, "produção sem `PORTA_E2E`", liberava os falsos em qualquer servidor que tivesse um `PORTA_E2E` esquecido. A exigência de `SEGREDO_LINKS` com 32 caracteres em produção continua valendo também no e2e.
- **E2. Um nome só para cada vocabulário da P2** (`ROTULO_DESTINO`, `ROTULO_MOTIVO`, `ROTULO_EVIDENCIA`, `ROTULO_REGIME`, `ROTULO_AMBIENTE`, `DestinoItem`, `MotivoItem`, `TipoEvidencia`, `Configuracao`, `ambienteNfeEnum`; lista na §4.5). A Fase 4 reexporta `ROTULO_REGIME`/`ROTULO_AMBIENTE` em vez de redefinir, `DestinoEstoque` vira apelido de `DestinoItem` e as abas usam `ROTULO_DESTINO`. A Fase 3 usa `ROTULO_EVIDENCIA` no lugar do seu próprio mapa de nomes das fotos. O rótulo da homologação passa a ser "Homologação (sem valor fiscal)" na P2, o texto que a tela da Fase 4 usa. Motivo: as Fases 3 e 4 redefiniam ou supunham esses nomes.
- **E3. Rótulos do histórico preenchidos e congelados na P2.** Entram as chaves que os planos usavam e a P2 não tinha: `ml_resultado_ok_recusado`, `ml_resultado_sem_vinculo` e `ml_conta_desconectada` (Fase 3), e `nf_item_escolhido` e `nota_venda_removida` (Fase 4). Os nomes dos exports são `ROTULOS_<AREA>`. As Fases 3 e 4 não editam mais `rotulos/*.ts`. Motivo: o arquivo congela depois da P2.
- **E4. `chaveUnica` = id fixo do job no pg-boss** (decisão 2 da Parte A). Um 2º envio com a mesma chave é ignorado enquanto o job existir, mesmo já concluído (§5.1). Motivo: as Fases 3 e 4 usavam a chave como "não empilhar enquanto está na fila" e perderiam reenvios legítimos. Chaves corrigidas:
  - `ml.sincronizar-reclamacao`: `ml-reclamacao-{id}-{minuto}`, ou seja, uma por reclamação por minuto;
  - `ml.enviar-resultado` depois do vínculo D9: `{devolucaoId}:vinculo`;
  - `ml.enviar-contestacao`: `ml-contestacao-{id}-{instante do pedido}`, porque o Gestor pode reenviar depois de FALHOU;
  - `nfe.consultar`: `{notaFiscalId}:{atualizadaEm em ms}:{n}`, uma série por rodada, porque o reenvio da NF rejeitada recomeça a contagem.
- **E5. Etapa 4 no celular.** A P2 acrescenta a `EtapasCelular` a prop opcional `conteudoEtapa?: Partial<Record<number, ReactNode>>`, mostrada no topo da etapa escolhida. A Fase 4 passa `{ 4: <DivisaoEstoque .../> }`, e o Estoque Bom e o Estoque Problema aparecem acima dos cartões. Motivo: mobile-first; antes a divisão ficava embaixo de todos os cartões, porque o componente é congelado.
- **E6. Versões publicadas há mais de 2 semanas**, com a data de corte de 30/10/2026:
  - `pg-boss@12.38.0` (13/10/2026) no lugar da 12.38.2. As APIs que os planos usam foram conferidas no pacote: `createQueue`, `updateQueue`, `getQueue`, `findJobs`, `deleteAllJobs`, `isInstalled`, `fromDrizzle`/`DrizzleTransactionLike`, `send` com `id` e `startAfter`, `retryCount`, `retryDelayMax`, `work` com `batchSize`/`localConcurrency`/`pollingIntervalSeconds` e `schedule` com `tz`. A diferença para a 12.38.2 é só compatibilidade com CockroachDB e o tipo de `fail()`.
  - `@aws-sdk/client-s3@3.1161.0` e `@aws-sdk/s3-request-presigner@3.1161.0` (30/10/2026) no lugar da 3.1167.0.
  - Já estavam dentro da regra e ficam: `@tus/server@2.4.6`, `@tus/file-store@2.1.1`, `tus-js-client@4.3.1`, `idb-keyval@6.3.0`, `sharp@0.35.5` (a mesma do Next) e `fast-xml-parser@5.11.2`.
  - Motivo: risco de cadeia de suprimentos.
- **E7. `focus-visible`:** o estilo já existe em `globals.css`, então a P2 só confere. Motivo: pendência já resolvida na Fase 1.
- **E8. `definirConectorParaTestes(canal, null)` = volta ao padrão** (P2: `null`; depois da Fase 3: o conector real da conta ATIVA). A P2 implementa assim (`Map.delete`), igual à Fase 3. Motivo: a P2 gravava `null` como "forçar nulo" e a Fase 3 como "voltar ao real".
- **E9. `obter(idExterno)` recebe o claim_id no ML; `enviarResultadoConferencia(idExterno)` recebe o return_id.** O que é só do ML vai numa interface que estende a da P2 (`ConectorMercadoLivre`, §5.3). Motivo: a interface genérica não tem lugar para o status e o subtipo da reclamação, e os tipos da P2 são congelados.
- **E10. `obterEmissorNFe` e `definirEmissorParaTestes`** moram em `src/conectores/nfe/registro.ts` (Fase 4), e `tipos.ts` os reexporta. Motivo: o contrato listava as duas funções dentro do bloco de tipos.
- **E11. `conferirDevolucao(page, codigo, unidades)`** em `tests/e2e/apoio-conferencia.ts` (Fase 2, Tarefa 18) faz a conferência inteira pela tela, com um e2e próprio. As integrações das Fases 3 e 4 podem usá-lo depois do merge da 2, mantendo o caminho por serviço como alternativa. Motivo: §7.3 sem um apoio de e2e fixo.
- **E12. Fixtures do ML:** `tests/fixtures/ml/doc/` guarda os exemplos da documentação e `tests/fixtures/ml-falso/` os cenários do falso (§5.3). Motivo: o plano da Fase 3 usa as duas pastas.
- **E13. D14 aceito como está:** a escolha do Fiscal fica em `notas_venda.itens[].itensDevolucaoIds` (jsonb). Motivo: evita coluna ou tabela nova.
- **E14. `ContextoTarefa.tentativa` começa em 1;** a última é `CONFIG_TAREFAS[nome].tentativas` (5). Motivo: a Fase 3 deixava isso "a confirmar".
- **E15. Ler uma evidência já gravada** usa `armazenamentoDoProvedor(evidencia.provedor)`, e não `obterArmazenamento()`. A Fase 3 faz assim ao subir as fotos da contestação. Motivo: depois da troca disco → S3, as fotos antigas continuam no disco (D2).
- **E16. CHECK `itens_destino_motivo`** começa cada uma das duas primeiras cláusulas com `"destino" is not null and ...`. Motivo: na forma original da §4.1, `destino` nulo com motivo AVARIADO dava NULL, e o CHECK aceita NULL (bug achado na Parte A, lote 1). A regra pretendida é a mesma. Não gere de novo a forma antiga.
- **E17. Antes de publicar a Parte A na VPS,** acrescente `SEGREDO_LINKS` (32 caracteres hexadecimais ou mais: `openssl rand -hex 32`) ao `.env.producao`. Motivo: com `NODE_ENV=production`, o `lerEnv()` recusa a ausência dele, e o sistema passaria a dar erro 500. Isso também vale para qualquer variável obrigatória nova.
- **E18. Fase 5 (14/11):** (a) chaves `lote_item_removido` ("Unidade retirada do lote", NF de devolução cancelada) e `lote_alerta_nf_cancelada` (NF cancelada quando o lote já tinha andado; ver o plano da Fase 5, decisão 13) em `rotulos/lotes.ts`; (b) o enum `resultado_fornecedor` é declarado em `src/db/schema/devolucoes.ts` (e não em `lotes.ts`), porque `devolucoes.ts`, `lotes.ts` e `fiscal.ts` se importam em ciclo e só as referências preguiçosas podem cruzar o ciclo; (c) transição nova do lote "(novo) → FECHADO" (Fiscal e Gestor; extra), para separar unidades num lote novo sem violar "um lote ABERTO por fornecedor" (§4.6). Motivo: a Fase 5 precisava dos três e os arquivos são congelados.
