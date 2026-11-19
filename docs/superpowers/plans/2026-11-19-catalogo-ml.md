# Catálogo do ML no cadastro de produtos (extra): plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar este plano tarefa por tarefa. Os passos usam checkbox (`- [ ]`).

**Objetivo:** o Gestor toca em "Importar catálogo do ML" e o sistema cadastra os anúncios ativos e pausados das contas marcadas, com título, EAN e foto, sem mudar o que as pessoas já preencheram.

**Spec:** [../specs/2026-11-19-catalogo-ml-design.md](../specs/2026-11-19-catalogo-ml-design.md). **Contrato da rota:** [../../integracao/bitbrain-rota-catalogo.md](../../integracao/bitbrain-rota-catalogo.md).

## Antes de começar (obrigatório)
1. **Só começa depois que a branch `produtos-do-ml` estiver no `main`.** Depois, `git fetch`, crie a branch a partir do `main` (ou faça rebase da `catalogo-ml` nele) e confira:
   - a migração `0015` (`produtos.foto_url` e `produtos.ml_item_id`);
   - os nomes reais da **função de produtos-do-ml**: a extração de um anúncio (título, GTIN, foto, MLB, com `variacaoId`), a gravação que cria ou só completa, e o esquema do anúncio (`esquemaAnuncio` estendido). Anote os nomes no `progress` antes da Tarefa 2.
2. **A rota do Bitbrain não precisa estar publicada** para construir: os falsos cobrem tudo. Ela só é necessária para a 1ª importação real (Tarefa 7).
3. Leia o guia do Next em `node_modules/next/dist/docs/` antes de mexer na tela (AGENTS.md).

## Restrições globais
- **Textos fixos** (os e2e usam estes; com 1, o singular: "1 criado", "1 completado", "1 erro", "de 1 anúncio", "para 1 conta"; "sem SKU" não muda):
  - o cartão-link e o título (`h1`): "Catálogo do Mercado Livre";
  - o botão: "Importar catálogo do ML";
  - as situações: "Ainda não importado", "Na fila", "Importando: buscando os anúncios" (sem `total`), "Importando: {lidos} de {total} anúncios", "Concluída em {dd/mm} às {hh:mm}", "Erro: {mensagem}";
  - o resultado: "{n} criados · {n} completados · {n} sem SKU · {n} erros";
  - ao pedir: "Importação pedida para {n} contas." / "Já tem importação em andamento." / "Nenhuma conta marcada. Marque em Configurações › Mercado Livre.";
  - o 403 da rota: "A rota do Bitbrain recusou a leitura do catálogo (adendo não publicado ou pedido fora do contrato).";
  - a busca sem fim: "A lista de anúncios do ML não terminou.";
  - a importação parada: "A importação parou. Toque em Importar de novo.".
- **Constantes** em `src/modules/mercado-livre/catalogo-dominio.ts`:
  - `INTERVALO_CHAMADAS_MS = 1000`, `LOTE_ANUNCIOS = 20`, `POR_PAGINA_SCAN = 100` (a 1ª página), `POR_PAGINA_MIN_SCAN = 50` (a trava);
  - `PARADA_APOS_MS = 30 * 60 * 1000`, `CONTA_MODO_API = 'api'`, `STATUS_CATALOGO = ['active', 'paused']`;
  - `CAMPOS_LOTE` = os 8 `body.*` do contrato.
- **Nunca sobrescrever:** a gravação é a de produtos-do-ml. Não crie outro `insert`/`update` em `produtos`.
- **Migração:** só a `0016` (`npm run db:gerar -- --name catalogo_ml`). Se produtos-do-ml usar outro número, pegue o próximo livre.
- **Celular:** 390×844, sem rolagem lateral, cartões, alvos de 44 px ou mais, `role="status"` nas mensagens, e2e nos projetos `computador` e `celular`.
- **Sem dependências novas.** Não commitar o `package-lock.json`.
- **Commits:** em português e terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Conferência de cada tarefa:** `npm test`, `npm run test:int`, `npm run typecheck`, `npm run lint`. Nas Tarefas 6 e 7, também `npm run test:e2e` e `npm run test:e2e:bitbrain`.

## Foco da revisão
1. **Nada sobrescrito:** um produto com descrição, fornecedor, NCM, custo e unidade preenchidos sai igual; só o vazio é completado (Tarefa 5).
2. **SKU igual ao da devolução:** a mesma ordem do `skuDoPedido` (`SELLER_SKU`, depois `seller_custom_field`) e o `normalizarSku` (Tarefa 2).
3. **Scroll:** o `scroll_id` vai codificado e chega igual; as páginas seguintes vão sem `limit`; o scroll é esgotado antes do 1º lote; a busca termina por `results` vazio ou `scroll_id` nulo, e a trava vira `ERRO`, nunca `CONCLUIDA` (Tarefas 1 e 5).
4. **403 da rota:** vira a mensagem clara, sem novas tentativas e sem Falhas; os ids repetidos saem antes do lote (Tarefas 1 e 5).
5. **Ritmo:** nunca 2 chamadas da mesma conta em menos de 1 s (Tarefa 5).
6. **Uma por conta:** pedir de novo com a conta na fila ou rodando não enfileira, no pedido e na semanal (Tarefa 5).
7. **Pedido antigo:** a tarefa que volta depois de um pedido novo não mexe na linha (Tarefa 5).

---

### Tarefa 1: Leituras novas no `ConectorML`

**Arquivos:**
- Modificar: `src/conectores/marketplace/mercadolivre/esquemas.ts`, `conector.ts`, `tipos.ts` (interface `ConectorMercadoLivre`)
- Criar: `tests/fixtures/ml/doc/busca-anuncios-scan.json` e `tests/fixtures/ml/doc/lote-anuncios.json` (exemplos da doc do ML)
- Testes: `src/conectores/marketplace/mercadolivre/conector.test.ts`

**Interfaces:**
- `esquemaBuscaAnuncios`: `{ results: string[]; paging: { total: number }; scroll_id: string | null }`.
- `esquemaLoteAnuncios`: um array de `{ id?, status_code?, code?, body }`.
- `buscarAnunciosDaConta(status: 'active' | 'paused'): Promise<{ ids: string[]; total: number }>`: esgota o scroll só com buscas (spec §3); na trava, lança `ErroBuscaSemFim`.
- `lerAnunciosEmLote(ids: string[]): Promise<{ anuncios: AnuncioJson[]; falhas: number }>`.

- [ ] **Passo 1: Testes que falham** (com `ClienteML` de mentira, que guarda os caminhos):
  - `'busca scan: 1ª página com search_type, limit=100 e status; as seguintes com search_type, status e o último scroll_id codificado, sem limit'`;
  - `'busca: total=300, 100 na 1ª página e 50 nas seguintes, traz os 300 ids'`;
  - `'busca termina no results vazio ou no scroll_id nulo, e não para quando a soma chega ao total'`;
  - `'busca sem fim para na trava de ceil(total/50)+2 páginas e lança ErroBuscaSemFim'`;
  - `'busca devolve os ids sem repetir'`;
  - `'lote: tira os ids repetidos antes de chamar; mais de 20 ids distintos lança'`;
  - `'lote: ids separados por vírgula, include_attributes=all e attributes com os 8 body.*'`;
  - `'lote: status_code diferente de 200 conta em falhas; aceita code (formato antigo)'`;
  - `'busca fora do formato lança ErroFormatoML'`.
- [ ] **Passo 2:** `npx vitest run src/conectores/marketplace/mercadolivre/conector.test.ts`. Tem de falhar.
- [ ] **Passo 3:** implementar, usando `this.cliente.get`. Nada muda no transporte.
- [ ] **Passo 4:** o teste passa; rodar `npm run typecheck`.
- [ ] **Passo 5:** commit `feat(ml): busca scan dos anúncios e leitura em lote no ConectorML`.

### Tarefa 2: Do anúncio aos produtos (função pura)

**Arquivos:**
- Criar: `src/modules/mercado-livre/catalogo-dominio.ts` e `catalogo-dominio.test.ts`
- Modificar: a gravação de produtos-do-ml (hoje `cadastrarProdutosDosAnuncios`, em `src/modules/mercado-livre/produtos-anuncio.ts`), com o teste dela:
  - a `origem` passa a ser `{ reclamacaoId: string } | { catalogo: string }` (a conta), e o evento grava a origem certa;
  - devolve também `semTitulo: string[]`, o SKU novo que ela pula porque o anúncio não tem título (o catálogo conta em `erros`);
  - os criados e completados saem do tamanho das listas `criados` e `completados`, que ela já devolve.

**Interface:** `produtosDoAnuncio(a: AnuncioJson): { itens: { sku: string; variacaoId: string | null }[]; semSku: number; invalidos: number }`.

- [ ] **Passo 1: Testes que falham:**
  - `'sem variações: SELLER_SKU do anúncio, senão seller_custom_field'`;
  - `'com variações: um item por variação (SELLER_SKU da variação, senão seller_custom_field dela); o SKU do anúncio é ignorado'`;
  - `'variação sem SKU e anúncio sem SKU contam em semSku'`;
  - `'SKU passa por normalizarSku; acima de 60 caracteres conta em invalidos'`;
  - `'SKU repetido no mesmo anúncio vira um item só'`;
  - no teste de integração da gravação: `'origem do catálogo vai para o evento; SKU novo de anúncio sem título vem em semTitulo'`.
- [ ] **Passo 2:** `npx vitest run src/modules/mercado-livre/catalogo-dominio.test.ts`. Tem de falhar.
- [ ] **Passo 3:** implementar, com as constantes das restrições globais.
- [ ] **Passo 4:** o teste passa; rodar `npm run typecheck` e `npm run test:int` (por causa da gravação).
- [ ] **Passo 5:** commit `feat(catalogo): produtos de um anúncio do ML (SKU por variação)`.

### Tarefa 3: Falsos (ML e Bitbrain)

**Arquivos:**
- Criar: `tests/fixtures/ml-falso/catalogo.json` (vendedor `123456789`, 5 anúncios `MLB8…`, como na spec §9)
- Modificar: `src/conectores/marketplace/mercadolivre/falso.ts` (`GET /users/(\d+)/items/search` e `GET /items/bulk`) e `src/conectores/marketplace/bitbrain/falso.ts`:
  - `caminhoPermitido` com o 13, o 14 e o `include_attributes=all` no 8;
  - `EMPRESA_FALSA_SEM_CATALOGO = 'loja-falsa-2'`, que responde 403 no 13 e no 14;
  - `logistic` em `CAMPOS_ENVIO`, só com `mode`, `type` e `direction`.
- Modificar também `src/conectores/marketplace/mercadolivre/conector.ts`: o `obterReclamacao` lê o anúncio com `/items/{id}?include_attributes=all` (é quem usa a mudança B do contrato) e perde o comentário que explica a falta dele. O ML falso passa a aceitar esse parâmetro no `/items/{id}`. Fica nesta tarefa porque, antes dela, o Bitbrain falso recusaria.
- Testes: `src/conectores/marketplace/mercadolivre/falso.test.ts`, `src/conectores/marketplace/bitbrain/falso.test.ts` e `src/conectores/marketplace/mercadolivre/conector.test.ts`

- [ ] **Passo 1: Testes que falham:**
  - ML falso: `'scan anda de 2 em 2 com scroll_id (com = e :) até results vazio'`, `'status=paused só traz o pausado'`, `'bulk devolve status_code 200 com body e 404 para o anúncio removido'`, `'/items/{id} aceita include_attributes=all'`;
  - Bitbrain falso: os mesmos casos de aceitar e recusar da seção "Testes" do contrato, mais `'loja-falsa-2 dá 403 no 13 e no 14'` e `'envio mantém logistic.{mode,type,direction}'`;
  - conector: `'obterReclamacao lê o anúncio com include_attributes=all'`.
- [ ] **Passo 2:** `npx vitest run src/conectores/marketplace` deve falhar.
- [ ] **Passo 3:** implementar. O falso continua sem estado: a página vem do próprio `scroll_id`.
- [ ] **Passo 4:** o teste passa; rodar `npm test` inteiro (os testes do falso de hoje continuam verdes).
- [ ] **Passo 5:** commit `test(ml): catálogo nos falsos do ML e do Bitbrain; anúncio com include_attributes=all`.

### Tarefa 4: Tabela da situação por conta (migração 0016)

**Arquivos:**
- Modificar: `src/db/schema/mercado-livre.ts` (enum `situacao_catalogo_ml`: `NA_FILA`, `RODANDO`, `CONCLUIDA`, `ERRO`; os valores vêm de `catalogo-dominio.ts`) e o índice dos schemas, se precisar
- Criar: `drizzle/0016_catalogo_ml.sql` (gerado)
- Testes: `src/modules/mercado-livre/tabelas.int.test.ts`

**Tabela `importacoes_catalogo_ml`:**
- `conta` (texto, chave primária);
- `situacao`;
- `total` (anulável);
- `lidos`, `criados`, `completados`, `sem_sku` e `erros` (inteiros, padrão 0);
- `mensagem` (anulável);
- `pedida_em`;
- `pedida_por` (anulável, FK `usuarios`; nulo quando é a semanal);
- `iniciada_em` e `terminada_em` (anuláveis);
- `atualizada_em`.

- [ ] **Passo 1: Teste que falha:** `'importacoes_catalogo_ml: grava, lê e recusa situação fora do enum'`.
- [ ] **Passo 2:** `npm run db:gerar -- --name catalogo_ml`, depois `npm run db:migrar`. Confira o SQL gerado: só a tabela e o enum.
- [ ] **Passo 3:** `npm run test:int -- src/modules/mercado-livre/tabelas.int.test.ts` passa.
- [ ] **Passo 4:** commit `feat(db): importacoes_catalogo_ml (migração 0016)`.

### Tarefa 5: Tarefa `ml.catalogo` (pedir, importar, semanal)

**Arquivos:**
- Modificar:
  - `src/modules/fila/tarefas.ts`: `'ml.catalogo': { conta?: string; pedidaEm?: string }` e `{ tentativas: 5, expiraEmSegundos: 7200, agenda: '0 4 * * 1' }`, com o comentário "emenda E23";
  - `src/modules/fila/tarefas.test.ts`;
  - `src/worker/manipuladores/mercado-livre.ts`;
  - `src/modules/historico/eventos.ts`: `catalogo_ml` no tipo `EntidadeHistorico` (sem isso o typecheck falha);
  - `src/modules/historico/rotulos/mercado-livre.ts`: `ml_catalogo_pedido`, "Importação do catálogo do ML pedida".
- Criar: `src/modules/mercado-livre/catalogo.ts` e `catalogo.int.test.ts`

**Interfaces:**
- `pedirImportacaoCatalogo(db, fila, usuario, agora): Promise<{ pedidas: number; emAndamento: number; semContas: boolean }>`:
  - só o Gestor (`administrar`);
  - as contas são as de `contasParaVarrer` no modo `bitbrain`, ou `CONTA_MODO_API` com a conta `ATIVA`;
  - numa transação, por conta, a **trava** (uma função só, que a semanal também usa): `NA_FILA` com os contadores zerados e `pedida_em = agora`, só se a conta não estiver `NA_FILA`/`RODANDO` (ou se estiver parada há `PARADA_APOS_MS`); `fila.enviar('ml.catalogo', { conta, pedidaEm: agora.toISOString() }, { tx, chaveUnica })`, com `chaveUnica` = a conta, `:` e `agora.toISOString()`; e o evento.
- `importarCatalogoDaConta(db, conta, o: { pedidaEm: string; agora: Date; ultimaTentativa: boolean; intervaloMs?: number; esperar?: (ms) => Promise<void>; conector?: ConectorMercadoLivre }): Promise<void>`:
  - segue a spec §5: termina sem fazer nada se a linha for de outro pedido; esgota as duas buscas antes do 1º lote; tira os ids repetidos; toda escrita na linha filtra por `pedida_em`;
  - o ritmo garante `intervaloMs` entre duas chamadas;
  - classifica os erros pela spec §7: grava `ERRO` sem lançar nos definitivos (403 da rota e `ErroBuscaSemFim` entre eles); lança nos outros e, se for a última tentativa, grava `ERRO` antes de lançar;
  - o `conector` é só para os testes que precisam de um `ClienteML` de mentira (busca sem fim, menos ids que o total, id repetido e ordem das chamadas).
- `reimportarCatalogos(db, fila, agora): Promise<number>`: a agenda semanal, só para contas com linha e ainda marcadas, pela mesma trava de `pedirImportacaoCatalogo` (com `pedida_por` nulo).
- `listarImportacoesCatalogo(db, agora): Promise<LinhaCatalogo[]>`: para a tela, com o nome da conta e "parada" calculada.

- [ ] **Passo 1: Testes que falham** (contra o Bitbrain falso, com `intervaloMs: 0`):
  - `'importa a Loja Falsa 1: cria os produtos com foto, EAN e anúncio; conta sem SKU e erro; CONCLUIDA'`;
  - `'produto já cadastrado: só completa foto, EAN e anúncio vazios; descrição, fornecedor, NCM, custo e unidade ficam iguais'`;
  - `'rodar de novo: 0 criados e 0 completados'`;
  - `'Loja Falsa 2 (rota sem o adendo): ERRO com a mensagem da rota, sem lançar'`;
  - `'empresa sem conta (404 da rota): ERRO e conta indisponível'`;
  - `'5xx: lança; na última tentativa grava ERRO e lança'`;
  - com o `conector` de mentira: `'busca sem fim: ERRO "A lista de anúncios do ML não terminou.", sem lançar e nunca CONCLUIDA'`, `'menos ids que o total: CONCLUIDA, com a diferença em erros'` e `'id repetido entre ativos e pausados é lido uma vez'`;
  - `'nova tentativa: total, lidos, sem_sku e erros recomeçam; criados e completados continuam'`;
  - `'pedir duas vezes: a segunda não enfileira; parada há 30 min libera'`;
  - `'tarefa antiga (pedidaEm de outro pedido) termina sem mexer na linha'`;
  - `'só o Gestor pede'`;
  - `'semanal: só contas já importadas e ainda marcadas; conta NA_FILA ou RODANDO não ganha outra tarefa'`;
  - `'modo api: importa pela conta ATIVA com o ML falso'`;
  - unidade, em `catalogo-dominio.test.ts`: `'ritmo: duas chamadas nunca com menos de 1 s (esperar falso)'`;
  - com o `conector` de mentira: `'a busca esgota o scroll antes do 1º /items/bulk'` (confere a ordem das chamadas).
- [ ] **Passo 2:** `npm run test:int -- src/modules/mercado-livre/catalogo.int.test.ts` deve falhar.
- [ ] **Passo 3:** implementar. O manipulador: com `conta`, chama `importarCatalogoDaConta(ctx.db, conta, { pedidaEm, agora: ctx.agora, ultimaTentativa: ehUltimaTentativa('ml.catalogo', ctx.tentativa) })`; sem `conta`, chama `reimportarCatalogos`.
- [ ] **Passo 4:** o teste passa, junto com `npm test`, `npm run test:int` e `npm run typecheck`.
- [ ] **Passo 5:** commit `feat(catalogo): tarefa ml.catalogo por conta (pedir, importar, semanal)`.

### Tarefa 6: Tela "Catálogo do Mercado Livre"

**Arquivos:**
- Criar: `src/app/(app)/cadastros/produtos/catalogo-ml/page.tsx` (`exigirPermissao('administrar')`) e `acoes.ts` (server action que chama `pedirImportacaoCatalogo`)
- Modificar:
  - `src/app/(app)/cadastros/produtos/page.tsx`: o cartão-link, só para o Gestor e só com o ML ligado;
  - `src/components/fiscal/AtualizarEnquantoProcessa.tsx`: a prop opcional `texto`, cujo padrão é o texto de hoje.
- Testes e2e: criar `tests/e2e/bitbrain-catalogo.spec.ts` (modo Bitbrain) e `tests/e2e/catalogo-ml.spec.ts` (modo `api`/falso)

- [ ] **Passo 1: e2e que falham:**
  - Bitbrain: `'gestor importa o catálogo: Loja Falsa 1 concluída com o resultado e Loja Falsa 2 com a mensagem da rota'`:
    - antes, marcar as duas contas;
    - esperar "Concluída em";
    - conferir o resultado;
    - abrir Produtos e ver o SKU novo com a foto;
    - sem rolagem lateral e com alvos de 44 px.
  - Bitbrain: `'fiscal não vê o cartão-link e não abre a página'`.
  - `api`/falso: `'gestor importa a conta do ML'`, com um cartão "Conta do Mercado Livre", concluída. Confere o singular: "Importação pedida para 1 conta." e "· 1 erro" (o anúncio 404).
- [ ] **Passo 2:** `npm run test:e2e -- tests/e2e/catalogo-ml.spec.ts` e `npm run test:e2e:bitbrain -- tests/e2e/bitbrain-catalogo.spec.ts` devem falhar.
- [ ] **Passo 3:** implementar com os textos fixos. A página se atualiza sozinha só enquanto houver uma conta `NA_FILA`/`RODANDO`.
- [ ] **Passo 4:** os e2e passam nos dois projetos; rodar também `npm run lint` e `npm run typecheck`.
- [ ] **Passo 5:** commit `feat(catalogo): tela Catálogo do Mercado Livre em Cadastros › Produtos (extra)`.

### Tarefa 7: Documentação e ligar

**Arquivos:** `docs/superpowers/plans/2026-11-12-contrato-fases-2-6.md` (§10), `docs/superpowers/andamento.md` e `README.md` (andamento)

- [ ] **Passo 1:** acrescentar a **emenda E23** depois da E22 de produtos-do-ml (ou o próximo número livre), no formato da E21:
  ```
  - **E23. Catálogo do ML (19/11, extra):** spec `specs/2026-11-19-catalogo-ml-design.md`, plano `plans/2026-11-19-catalogo-ml.md`.
    - **Tarefa:** `ml.catalogo` `{ conta?: string; pedidaEm?: string }`, 5 tentativas, expira em 7.200 s, agenda `0 4 * * 1`.
    - **Banco:** tabela `importacoes_catalogo_ml` e enum `situacao_catalogo_ml`. Migração `0016`.
    - **Interface:** `ConectorMercadoLivre` ganha `buscarAnunciosDaConta` e `lerAnunciosEmLote`; a gravação de produtos-do-ml aceita a origem `{ catalogo: conta }` e devolve `semTitulo`; `AtualizarEnquantoProcessa` ganha a prop opcional `texto`.
    - **Histórico:** entidade `catalogo_ml`; chave `ml_catalogo_pedido`.
  ```
- [ ] **Passo 2:** atualizar o andamento e o README.
- [ ] **Passo 3:** rodar a suíte inteira: `npm test`, `npm run test:int`, `npm run typecheck`, `npm run lint`, `npm run test:e2e` e `npm run test:e2e:bitbrain`.
- [ ] **Passo 4:** commit `docs: catálogo do ML (emenda E23, andamento)`.
- [ ] **Passo 5 (fora do código, com o usuário):**
  1. Colar o texto único de `bitbrain-rota-catalogo.md` na sessão do Bitbrain.
  2. Guardar as respostas da conferência ao vivo, que valem para as suposições S1 a S3 e S5. Se alguma falhar, ajustar a Tarefa 1 só do nosso lado.
  3. O Nathan publica o Bitbrain.
  4. **Só depois**, publicar o sistema na VPS: migração `0016`, sem variável nova. Com o sistema antes, o `include_attributes=all` no 8 dá 403 e a sincronização das devoluções fica sem o anúncio.
  5. Importar **uma conta** primeiro e conferir os contadores e algumas fotos.
  6. Importar as outras.
