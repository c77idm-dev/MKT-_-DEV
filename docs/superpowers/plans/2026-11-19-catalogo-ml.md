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
- **Textos fixos** (os e2e usam estes):
  - o cartão-link e o título (`h1`): "Catálogo do Mercado Livre";
  - o botão: "Importar catálogo do ML";
  - as situações: "Ainda não importado", "Na fila", "Importando: {lidos} de {total} anúncios", "Concluída em {dd/mm} às {hh:mm}", "Erro: {mensagem}";
  - o resultado: "{n} criados · {n} completados · {n} sem SKU · {n} erros";
  - ao pedir: "Importação pedida para {n} contas." / "Já tem importação em andamento." / "Nenhuma conta marcada. Marque em Configurações › Mercado Livre.";
  - a rota sem o adendo: "A rota do Bitbrain ainda não libera o catálogo (falta publicar o adendo).";
  - a importação parada: "A importação parou. Toque em Importar de novo.".
- **Constantes** em `src/modules/mercado-livre/catalogo-dominio.ts`:
  - `INTERVALO_CHAMADAS_MS = 1000`, `LOTE_ANUNCIOS = 20`, `POR_PAGINA_SCAN = 100`;
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
3. **Scroll:** o `scroll_id` vai codificado e chega igual; a busca termina (resultados vazios, scroll nulo ou a trava) (Tarefa 1).
4. **403 da rota:** vira a mensagem clara, sem novas tentativas e sem Falhas (Tarefa 5).
5. **Ritmo:** nunca 2 chamadas da mesma conta em menos de 1 s (Tarefa 5).
6. **Uma por conta:** pedir de novo com a conta na fila ou rodando não enfileira (Tarefa 5).

---

### Tarefa 1: Leituras novas no `ConectorML`

**Arquivos:**
- Modificar: `src/conectores/marketplace/mercadolivre/esquemas.ts`, `conector.ts`, `tipos.ts` (interface `ConectorMercadoLivre`)
- Criar: `tests/fixtures/ml/doc/busca-anuncios-scan.json` e `tests/fixtures/ml/doc/lote-anuncios.json` (exemplos da doc do ML)
- Testes: `src/conectores/marketplace/mercadolivre/conector.test.ts`

**Interfaces:**
- `esquemaBuscaAnuncios`: `{ results: string[]; paging: { total: number }; scroll_id: string | null }`.
- `esquemaLoteAnuncios`: um array de `{ id?, status_code?, code?, body }`.
- `buscarAnunciosDaConta(status: 'active' | 'paused'): AsyncGenerator<{ ids: string[]; total: number }>`.
- `lerAnunciosEmLote(ids: string[]): Promise<{ anuncios: AnuncioJson[]; falhas: number }>`.

- [ ] **Passo 1: Testes que falham** (com `ClienteML` de mentira, que guarda os caminhos):
  - `'busca scan: 1ª página com search_type, limit=100 e status; as seguintes com o último scroll_id codificado e sem status'`;
  - `'busca para no results vazio, no scroll_id nulo e na trava de ceil(total/100)+2 páginas'`;
  - `'lote: ids separados por vírgula, include_attributes=all e attributes com os 8 body.*; mais de 20 ids lança'`;
  - `'lote: status_code diferente de 200 conta em falhas; aceita code (formato antigo)'`;
  - `'busca fora do formato lança ErroFormatoML'`.
- [ ] **Passo 2:** `npx vitest run src/conectores/marketplace/mercadolivre/conector.test.ts`. Tem de falhar.
- [ ] **Passo 3:** implementar, usando `this.cliente.get`. Nada muda no transporte.
- [ ] **Passo 4:** o teste passa; rodar `npm run typecheck`.
- [ ] **Passo 5:** commit `feat(ml): busca scan dos anúncios e leitura em lote no ConectorML`.

### Tarefa 2: Do anúncio aos produtos (função pura)

**Arquivos:**
- Criar: `src/modules/mercado-livre/catalogo-dominio.ts` e `catalogo-dominio.test.ts`
- Modificar (só se precisar): a gravação de produtos-do-ml, para devolver `'criado' | 'completado' | 'sem_mudanca'`, com o teste dela

**Interface:** `produtosDoAnuncio(a: AnuncioJson): { itens: { sku: string; variacaoId: string | null }[]; semSku: number; invalidos: number }`.

- [ ] **Passo 1: Testes que falham:**
  - `'sem variações: SELLER_SKU do anúncio, senão seller_custom_field'`;
  - `'com variações: um item por variação (SELLER_SKU da variação, senão seller_custom_field dela); o SKU do anúncio é ignorado'`;
  - `'variação sem SKU e anúncio sem SKU contam em semSku'`;
  - `'SKU passa por normalizarSku; acima de 60 caracteres conta em invalidos'`;
  - `'SKU repetido no mesmo anúncio vira um item só'`;
  - se a gravação mudar: `'a gravação de produtos-do-ml devolve criado, completado ou sem_mudanca'`.
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
- Testes: `src/conectores/marketplace/mercadolivre/falso.test.ts` e `src/conectores/marketplace/bitbrain/falso.test.ts`

- [ ] **Passo 1: Testes que falham:**
  - ML falso: `'scan anda de 2 em 2 com scroll_id (com = e :) até results vazio'`, `'status=paused só traz o pausado'`, `'bulk devolve status_code 200 com body e 404 para o anúncio removido'`;
  - Bitbrain falso: os mesmos casos de aceitar e recusar da seção "Testes" do contrato, mais `'loja-falsa-2 dá 403 no 13 e no 14'` e `'envio mantém logistic.{mode,type,direction}'`.
- [ ] **Passo 2:** `npx vitest run src/conectores/marketplace` deve falhar.
- [ ] **Passo 3:** implementar. O falso continua sem estado: a página vem do próprio `scroll_id`.
- [ ] **Passo 4:** o teste passa; rodar `npm test` inteiro (os testes do falso de hoje continuam verdes).
- [ ] **Passo 5:** commit `test(ml): catálogo nos falsos do ML e do Bitbrain`.

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
  - `src/modules/fila/tarefas.ts`: `'ml.catalogo': { conta?: string }` e `{ tentativas: 5, expiraEmSegundos: 7200, agenda: '0 4 * * 1' }`, com o comentário "emenda E22";
  - `src/modules/fila/tarefas.test.ts`;
  - `src/worker/manipuladores/mercado-livre.ts`;
  - `src/modules/historico/rotulos/mercado-livre.ts`: `ml_catalogo_pedido`, "Importação do catálogo do ML pedida".
- Criar: `src/modules/mercado-livre/catalogo.ts` e `catalogo.int.test.ts`

**Interfaces:**
- `pedirImportacaoCatalogo(db, fila, usuario, agora): Promise<{ pedidas: number; emAndamento: number; semContas: boolean }>`:
  - só o Gestor (`administrar`);
  - as contas são as de `contasParaVarrer` no modo `bitbrain`, ou `CONTA_MODO_API` com a conta `ATIVA`;
  - numa transação: `NA_FILA` com os contadores zerados, só se a conta não estiver `NA_FILA`/`RODANDO` (ou se estiver parada há `PARADA_APOS_MS`); `fila.enviar('ml.catalogo', { conta }, { tx, chaveUnica })`, com `chaveUnica` = a conta, `:` e `agora.toISOString()`; e o evento.
- `importarCatalogoDaConta(db, conta, o: { agora: Date; ultimaTentativa: boolean; intervaloMs?: number; esperar?: (ms) => Promise<void> }): Promise<void>`:
  - segue a spec §5;
  - o ritmo garante `intervaloMs` entre duas chamadas;
  - classifica os erros pela spec §7: grava `ERRO` sem lançar nos definitivos; lança nos outros e, se for a última tentativa, grava `ERRO` antes de lançar.
- `reimportarCatalogos(db, fila, agora): Promise<number>`: a agenda semanal, só para contas com linha e ainda marcadas.
- `listarImportacoesCatalogo(db, agora): Promise<LinhaCatalogo[]>`: para a tela, com o nome da conta e "parada" calculada.

- [ ] **Passo 1: Testes que falham** (contra o Bitbrain falso, com `intervaloMs: 0`):
  - `'importa a Loja Falsa 1: cria os produtos com foto, EAN e anúncio; conta sem SKU e erro; CONCLUIDA'`;
  - `'produto já cadastrado: só completa foto, EAN e anúncio vazios; descrição, fornecedor, NCM, custo e unidade ficam iguais'`;
  - `'rodar de novo: 0 criados e 0 completados'`;
  - `'Loja Falsa 2 (rota sem o adendo): ERRO com a mensagem da rota, sem lançar'`;
  - `'empresa sem conta (404 da rota): ERRO e conta indisponível'`;
  - `'5xx: lança; na última tentativa grava ERRO e lança'`;
  - `'nova tentativa: lidos, sem_sku e erros recomeçam; criados e completados continuam'`;
  - `'pedir duas vezes: a segunda não enfileira; parada há 30 min libera'`;
  - `'só o Gestor pede'`;
  - `'semanal: só contas já importadas e ainda marcadas'`;
  - `'modo api: importa pela conta ATIVA com o ML falso'`;
  - unidade, em `catalogo-dominio.test.ts`: `'ritmo: duas chamadas nunca com menos de 1 s (esperar falso)'`.
- [ ] **Passo 2:** `npm run test:int -- src/modules/mercado-livre/catalogo.int.test.ts` deve falhar.
- [ ] **Passo 3:** implementar. O manipulador: com `conta`, chama `importarCatalogoDaConta(ctx.db, conta, { agora: ctx.agora, ultimaTentativa: ehUltimaTentativa('ml.catalogo', ctx.tentativa) })`; sem `conta`, chama `reimportarCatalogos`.
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
  - `api`/falso: `'gestor importa a conta do ML'`, com um cartão "Conta do Mercado Livre", concluída.
- [ ] **Passo 2:** `npm run test:e2e -- tests/e2e/catalogo-ml.spec.ts` e `npm run test:e2e:bitbrain -- tests/e2e/bitbrain-catalogo.spec.ts` devem falhar.
- [ ] **Passo 3:** implementar com os textos fixos. A página se atualiza sozinha só enquanto houver uma conta `NA_FILA`/`RODANDO`.
- [ ] **Passo 4:** os e2e passam nos dois projetos; rodar também `npm run lint` e `npm run typecheck`.
- [ ] **Passo 5:** commit `feat(catalogo): tela Catálogo do Mercado Livre em Cadastros › Produtos (extra)`.

### Tarefa 7: Documentação e ligar

**Arquivos:** `docs/superpowers/plans/2026-11-12-contrato-fases-2-6.md` (§10), `docs/superpowers/andamento.md` e `README.md` (andamento)

- [ ] **Passo 1:** acrescentar a **emenda E22** depois da E21 (ou o próximo número livre depois de produtos-do-ml): "Catálogo do ML (19/11): tarefa `ml.catalogo` `{ conta?: string }`, agenda semanal; spec `specs/2026-11-19-catalogo-ml-design.md`, plano `plans/2026-11-19-catalogo-ml.md`."
- [ ] **Passo 2:** atualizar o andamento e o README.
- [ ] **Passo 3:** rodar a suíte inteira: `npm test`, `npm run test:int`, `npm run typecheck`, `npm run lint`, `npm run test:e2e` e `npm run test:e2e:bitbrain`.
- [ ] **Passo 4:** commit `docs: catálogo do ML (emenda E22, andamento)`.
- [ ] **Passo 5 (fora do código, com o usuário):**
  1. Colar o texto único de `bitbrain-rota-catalogo.md` na sessão do Bitbrain.
  2. Guardar as respostas da conferência ao vivo, que valem para as suposições S1 a S3. Se alguma falhar, ajustar a Tarefa 1 só do nosso lado.
  3. O Nathan publica o Bitbrain.
  4. Publicar o sistema na VPS: migração `0016`, sem variável nova.
  5. Importar **uma conta** primeiro e conferir os contadores e algumas fotos.
  6. Importar as outras.
