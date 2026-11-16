# Retirada do Full no Recebimento: plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar este plano tarefa por tarefa. Os passos usam checkbox (`- [ ]`).

**Objetivo:** quando o pacote bipado no Recebimento é uma retirada do Full (mercadoria da empresa voltando do armazém do ML), o operador registra a chegada como **retirada** (código `RF-000001`), tira a foto da etiqueta, bipa os produtos e conclui. Nada disso vira devolução.

**Arquitetura:**
- **Registro próprio:** tabelas `retiradas_full` e `itens_retirada_full` (migração `melhoria3_retirada_full`). Nenhuma tela, consulta ou regra das devoluções lê essas tabelas.
- **Evidências (decisão de quem implementa):** a tabela `evidencias` ganha `retirada_id` e `item_retirada_id`, e `devolucao_id` passa a aceitar nulo. Uma regra no banco exige exatamente um dono. Assim a foto da retirada usa o mesmo tus, a mesma fila offline do celular, o mesmo processamento (carimbo, SHA-256), o mesmo armazenamento e os mesmos links de 10 minutos, sem duplicar o pipeline.
- **Módulo `src/modules/retiradas/`:** `dominio.ts` (regras puras), `retiradas.ts` (criar, bipar, quantidade, remover, concluir), `consultas.ts` (lista e detalhe), `erros.ts`.
- **Telas:** botão novo no cartão "Rastreio não encontrado" e atalho no Recebimento; `/fluxo/retiradas-full/nova`, `/fluxo/retiradas-full/[codigo]` e `/fluxo/retiradas-full`.
- **Histórico:** entidade `retirada_full`; rótulos em `src/modules/historico/rotulos/retiradas.ts`. As fotos usam as chaves que já existem (`evidencia_enviada`, `evidencia_refeita`, `evidencia_processada`, `evidencia_falhou`) com a entidade `retirada_full`.

**Tecnologias:** Next.js 16.4.6 (App Router), React 19.3, Drizzle 0.45 + Postgres, pg-boss, Tailwind v4, Vitest (unidade e integração), Playwright (projetos `computador` e `celular`).

**Spec:** [docs/superpowers/specs/2026-11-16-retirada-full-design.md](../specs/2026-11-16-retirada-full-design.md) (e a spec principal, §6.2, §6.9 e §9).

## Restrições globais
- **Textos fixos (da spec):**
  - botão no cartão: "É retirada do Full (não é devolução)";
  - atalho no Recebimento: "Retirada do Full";
  - aviso no topo: "Isto não é devolução. Confira os itens e guarde no estoque.";
  - botão do rodapé: "Concluir retirada";
  - situações: "Aberta" e "Conferida";
  - título da lista: "Retiradas do Full";
  - item fora do cadastro: selo "sem cadastro".
- **Textos que não mudam:** "Rastreio não encontrado", "Registrar pacote não identificado", "Registrar chegada", "Código de Rastreamento".
- **Permissões (§6.9):** criar, bipar, mudar quantidade, remover, fotografar e concluir exigem `operar_devolucoes` (Operador e Gestor). Lista e detalhe exigem `ver_listas`. O Fiscal só vê.
- **Separação:** a retirada nunca aparece nas 5 etapas, na Busca Avançada, na NF, no ML, nos lotes nem nos alertas. Nenhum arquivo desses módulos é alterado.
- **Celular:** 390×844, sem rolagem lateral, cartões em uma coluna, botão principal no rodapé fixo (`acima-barra`), alvos de 44 px ou mais (`min-h-11`), botões de captura de 56 px (`min-h-14`), erro em `role="alert"` com foco.
- **Sem dependência nova.** Não comitar mudanças no `package-lock.json`.
- **Migração:** `npm run db:gerar -- --name melhoria3_retirada_full`.
- **Histórico:** chaves novas com o prefixo `retirada_full_`.
- **Commits:** terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Banco e porta deste worktree:** dev `devolucoes_m3`, testes `devolucoes_test_f8`, `PORTA_E2E=3103` (veja o `.env`).

## Foco da revisão
1. **Toque duplo em "É retirada do Full" ou na mesma etiqueta duas vezes:** não cria duas retiradas abertas para a mesma etiqueta. Devolve a que já está aberta. Teste na Tarefa 1.
2. **O mesmo EAN bipado de novo:** soma 1 no mesmo item, inclusive o EAN sem cadastro já descrito, que não pede a descrição de novo. Teste na Tarefa 1.
3. **Ação numa retirada já Conferida (outra aba, outro celular):** é recusada com mensagem, e nada muda. Teste na Tarefa 1.
4. **Foto da etiqueta que falhou no servidor:** não conta para concluir. Teste na Tarefa 1.
5. **Remover um item que tem foto:** apaga a evidência e o arquivo do armazenamento. Teste na Tarefa 1.

---

### Tarefa 1: Schema, migração, módulo de retiradas e evidências da retirada

**Arquivos:**
- Criar: `src/db/schema/retiradas.ts`, `src/modules/retiradas/dominio.ts`, `dominio.test.ts`, `erros.ts`, `retiradas.ts`, `retiradas.int.test.ts`, `consultas.ts`, `src/modules/historico/rotulos/retiradas.ts`, `drizzle/0011_melhoria3_retirada_full.sql` (gerado)
- Modificar: `src/db/schema/index.ts`, `src/db/schema/evidencias.ts`, `src/modules/historico/eventos.ts`, `eventos.test.ts`, `src/modules/midia/recepcao.ts`, `processamento.ts`, `limpeza.ts`, `recepcao.test.ts`, `src/components/midia/filaEnvios.ts`, `transporteTus.ts`, `useFilaEnvios.ts`

**Interfaces:**
- Produz (`dominio.ts`, sem imports com `@/`):
  - `SITUACOES_RETIRADA = ['ABERTA', 'CONFERIDA'] as const`, `SituacaoRetirada`, `ROTULO_SITUACAO_RETIRADA` ("Aberta", "Conferida");
  - `ehCodigoRetirada(codigo: string): boolean`, que aceita `/^RF-\d{6,}$/`;
  - `normalizarEan(bruto: string): string`, que tira os espaços e põe em maiúsculas;
  - `decidirLeitura(itens: ItemLeitura[], ean: string, produtoId: string | null): DecisaoLeitura`, com `ItemLeitura = { id; produtoId: string | null; eanLido: string | null }` e `DecisaoLeitura = { tipo: 'somar'; itemId } | { tipo: 'novo_produto'; produtoId } | { tipo: 'pedir_descricao' }`;
  - `novaQuantidade(atual: number, delta: 1 | -1): number`, que fica entre 1 e 9999;
  - `validarDescricao(bruta: string): string | null`, com trim e de 1 a 120 caracteres;
  - `pendenciasParaConcluir(p: { fotoEtiqueta: boolean; itens: number }): string[]`, que devolve "Tire a foto da etiqueta." e "Bipe pelo menos 1 produto.".
- Produz (`retiradas.ts`; todas exigem `operar_devolucoes` e lançam `ErroRetirada`):
  - `criarRetirada(db, codigoEtiquetaBruto, usuario, agora?) → { id; codigo; nova: boolean }`;
  - `biparProduto(db, retiradaId, eanBruto, descricao: string | null, usuario) → { tipo: 'somado'; itemId } | { tipo: 'pedir_descricao'; ean }`;
  - `alterarQuantidade(db, retiradaId, itemId, delta, usuario)`;
  - `removerItem(db, retiradaId, itemId, usuario)`;
  - `concluirRetirada(db, retiradaId, usuario, agora?)`.
- Produz (`consultas.ts`):
  - `listarRetiradas(db, { pagina }) → { retiradas: RetiradaLista[]; total }`, com `POR_PAGINA_RETIRADAS = 20`;
  - `obterRetirada(db, codigo) → RetiradaDetalhe | null`, com os itens (sku e descrição do produto ou a descrição livre, `semCadastro`), as evidências (`id, tipo, itemId (= item_retirada_id), situacao, caminho, provedor, erro`) e o nome de quem recebeu.
- Produz (cliente): `RegistroEnvio.retirada?: boolean` (o `devolucaoId` guarda o id do dono) e `useFilaEnvios(id, aoConcluir?, dono: 'devolucao' | 'retirada' = 'devolucao')`. O transporte manda `retiradaId` no lugar de `devolucaoId` quando `retirada` é verdadeiro.

- [ ] **Passo 1: Testes puros (`dominio.test.ts`)**
  - `decidirLeitura`:
    - o EAN de um produto que já está num item → `somar`;
    - o produto novo → `novo_produto`;
    - um EAN sem produto já incluído como "sem cadastro" → `somar`;
    - um EAN sem produto novo → `pedir_descricao`.
  - `novaQuantidade(1, -1) === 1`, `novaQuantidade(2, -1) === 1` e `novaQuantidade(9999, 1) === 9999`.
  - `validarDescricao('  ')` é `null`.
  - `pendenciasParaConcluir({ fotoEtiqueta: false, itens: 0 })` traz as duas mensagens.
  - `ehCodigoRetirada('RF-000001')` é verdadeiro; `'DEV-000001'` é falso.
- [ ] **Passo 2: Rodar `npm test -- src/modules/retiradas` e ver falhar.**
- [ ] **Passo 3: Implementar `dominio.ts`, o schema e a migração**
  - **`retiradas_full`:**
    - `numero bigserial`, mais o `codigo` gerado `'RF-' || lpad(numero, 6)`, como o DEV e o LOT;
    - `codigo_etiqueta`, `situacao` (enum `situacao_retirada_full`, padrão `ABERTA`), `recebida_por`, `recebida_em`, `concluida_em`, `criado_em`;
    - regra `(situacao = 'CONFERIDA') = (concluida_em is not null)`.
  - **`itens_retirada_full`:**
    - `produto_id` com `restrict`, `ean_lido`, `descricao`, `quantidade`;
    - regras `quantidade > 0` e `produto_id is not null or descricao is not null`;
    - únicos `(retirada_id, produto_id)` e `(retirada_id, ean_lido) where produto_id is null`.
  - **`evidencias`:**
    - `devolucao_id` passa a aceitar nulo;
    - `retirada_id` e `item_retirada_id` com `cascade`;
    - regra `num_nonnulls(devolucao_id, retirada_id) = 1`;
    - Foto 3 aceita `item_retirada_id`;
    - únicos por `(retirada_id, tipo)` sem item e por `(item_retirada_id, tipo)`.
  - Rode `npm run db:gerar -- --name melhoria3_retirada_full`.
- [ ] **Passo 4: Testes de integração (`retiradas.int.test.ts`)**
  - **Criar a partir do rastreio não encontrado:** `RF-000001`, `ABERTA`, quem recebeu e o evento `retirada_full_criada`. A mesma etiqueta de novo devolve a mesma, com `nova: false`.
  - **Bipar:**
    - o EAN do cadastro duas vezes dá 1 item com quantidade 2, mais os eventos `retirada_full_item_incluido` e `retirada_full_quantidade_alterada`;
    - o EAN sem cadastro sem descrição pede a descrição, e com descrição cria o item "sem cadastro";
    - o mesmo EAN de novo soma, sem pedir.
  - **Concluir:**
    - sem foto da etiqueta, ou só com foto `FALHOU`, é recusado;
    - sem item é recusado;
    - com os dois, fica `CONFERIDA` com `concluida_em` e o evento `retirada_full_concluida`;
    - depois disso, bipar, alterar e remover são recusados.
  - **Remover um item com foto:** some a linha da evidência e o arquivo do `ArmazenamentoMemoria`.
  - **Fiscal:** é recusado em criar, bipar e concluir.
  - **Separação:** com uma retirada concluída, `listarQuadro` e a Busca Avançada (`buscarDevolucoes`) não trazem nada.
  - **Evidência pela recepção:**
    - `registrarRecebida` com `retiradaId` grava `retirada_id` e o evento na entidade `retirada_full`;
    - `processarFoto` deixa a foto `PRONTA`, com o carimbo do código RF;
    - Foto 3 de um item de outra retirada é recusada;
    - o envio numa retirada `CONFERIDA` é recusado com 409.
- [ ] **Passo 5: Implementar**
  - **`retiradas.ts`:** cada mudança abre uma transação e trava a retirada com `for update`. Exige `ABERTA`.
    - `criarRetirada` usa `pg_advisory_xact_lock(3, hashtext(etiqueta))`.
    - `removerItem` apaga os arquivos depois da transação, como `registrarRecebida`.
  - **`consultas.ts` e rótulos:** `retirada_full_criada`, `retirada_full_item_incluido`, `retirada_full_quantidade_alterada`, `retirada_full_item_removido`, `retirada_full_concluida`.
  - **`recepcao.ts`:** `lerMetadados` aceita `retiradaId`. `autorizarEnvio` delega a `autorizarEnvioRetirada`, que aceita só Foto 1 sem item ou Foto 3 com item, com a retirada `ABERTA`. `registrarRecebida` trava o dono certo.
  - **`processamento.ts` e `limpeza.ts`:** usam `devolucaoId ?? retiradaId` e a entidade certa. O código vem de `coalesce`.
  - **Fila do cliente:** a flag `retirada`.
- [ ] **Passo 6: Rodar e ver passar**

Rode: `npm test && npm run test:int && npm run typecheck && npm run lint`
Esperado: tudo PASS e sem erro.

- [ ] **Passo 7: Commit** `feat(retiradas): retirada do Full no banco, regras e fotos pelo mesmo envio das evidências`

### Tarefa 2: Entrada pelo Recebimento e a tela "nova"

**Arquivos:**
- Criar: `src/app/(app)/fluxo/retiradas-full/acoes.ts`, `nova/page.tsx`, `nova/FormularioNovaRetirada.tsx`
- Modificar: `src/app/(app)/fluxo/recebimento/FormularioRecebimento.tsx` (cartão das linhas 101 a 118), `recebimento/page.tsx`

**Interfaces:**
- Produz: `criarRetiradaAcao(_: EstadoNovaRetirada, dados: FormData): Promise<EstadoNovaRetirada>`, com `EstadoNovaRetirada = { erro: string | null }`.
  - Lê `codigoEtiqueta`, chama `criarRetirada` e faz `redirect('/fluxo/retiradas-full/RF-…')`, fora do `try`.
  - Em `ErroRetirada`, devolve `{ erro }`.

- [ ] **Passo 1: Teste de componente** (`FormularioRecebimento` não tem teste; o caminho fica no e2e da Tarefa 5). Teste de unidade da ação, com `criarRetirada` simulado: a etiqueta vazia devolve o erro "Leia ou digite o código da etiqueta.".
- [ ] **Passo 2: Ver falhar.**
- [ ] **Passo 3: Implementar**
  - **Cartão "Rastreio não encontrado":** um segundo `form` com o botão secundário "É retirada do Full (não é devolução)", `min-h-14 w-full`, e `codigoEtiqueta` = o rastreio. O erro aparece em `role="alert"` com foco.
  - **Página do Recebimento:** no fim, os links "Retirada do Full" (`/fluxo/retiradas-full/nova`, botão secundário de 56 px) e "Ver retiradas do Full".
  - **`/nova`:**
    - exige `operar_devolucoes`;
    - campo "Código da etiqueta", com `LeitorCodigo` ("Ler etiqueta com a câmera") que preenche e envia;
    - botão "Abrir retirada".
- [ ] **Passo 4: Rodar `npm test`, o typecheck e o lint.**
- [ ] **Passo 5: Commit** `feat(recebimento): "É retirada do Full" no rastreio não encontrado e atalho para abrir uma retirada`

### Tarefa 3: Tela da retirada (aviso, foto da etiqueta, bipar, itens, concluir)

**Arquivos:**
- Criar: `src/app/(app)/fluxo/retiradas-full/[codigo]/page.tsx`, `acoes.ts`, `TelaRetirada.tsx`, `TelaRetirada.test.tsx`, `ItemRetirada.tsx`
- Modificar: `src/components/conferencia/SlotEvidencia.tsx` (prop `opcional`: o vazio mostra "Opcional" no lugar de "Falta")

**Interfaces:**
- Consome: Tarefa 1 (`obterRetirada`, as mudanças e `useFilaEnvios(id, cb, 'retirada')`).
- Produz: as ações `biparAcao(retiradaId, ean, descricao)`, `quantidadeAcao(retiradaId, itemId, delta)`, `removerAcao(retiradaId, itemId)` e `concluirAcao(retiradaId)`.
  - Todas exigem `operar_devolucoes` e devolvem `{ ok: true; itens: ItemRetiradaVista[] } | { ok: false; mensagem }`.
  - `biparAcao` também pode devolver `{ ok: true; pedirDescricao: string }`.

- [ ] **Passo 1: `TelaRetirada.test.tsx` (jsdom, com as ações e a fila simuladas)**
  - mostra o aviso "Isto não é devolução. Confira os itens e guarde no estoque.";
  - "Concluir retirada" sem foto nem item mostra as duas pendências em `role="alert"`, com o foco nelas, e não chama `concluirAcao`;
  - o EAN sem cadastro mostra o campo "Descrição curta"; enviar inclui o item com o selo "sem cadastro";
  - "Remover" pede o segundo toque ("Toque de novo para remover") antes de chamar `removerAcao`;
  - o "−" fica desabilitado com a quantidade 1.
- [ ] **Passo 2: Ver falhar.**
- [ ] **Passo 3: Implementar**
  - **Página:**
    - com `ABERTA` e quem opera, mostra a `TelaRetirada`;
    - sem isso, mostra a vista só de leitura: o selo "Conferida", a data, quem recebeu, os itens, as fotos com os links de 10 minutos e o histórico.
  - **Cartões:**
    - aviso;
    - `SlotEvidencia` "Foto da etiqueta";
    - "Bipar produto": `LeitorCodigo` "Ler código de barras", o campo "EAN do produto" e o botão "Somar";
    - os itens: − e + de 44 px, a quantidade, "Remover" e a `SlotEvidencia` "Foto do item" opcional.
  - **Rodapé fixo:** "Concluir retirada", com o total de itens.
- [ ] **Passo 4: Rodar `npm test`, o typecheck e o lint.**
- [ ] **Passo 5: Commit** `feat(retiradas): tela da retirada com foto da etiqueta, leitor de EAN e conclusão`

### Tarefa 4: Lista "Retiradas do Full"

**Arquivos:**
- Criar: `src/app/(app)/fluxo/retiradas-full/page.tsx`, `src/components/retiradas/CartaoRetirada.tsx`, `CartaoRetirada.test.tsx`

**Interfaces:**
- Consome: `listarRetiradas` e `ROTULO_SITUACAO_RETIRADA`.
- Produz: `CartaoRetirada({ retirada: RetiradaLista })`, um link para o detalhe.
  - O nome acessível começa com o código RF.
  - Mostra a data, "Etiqueta: …", o selo da situação, "N itens" e "Recebida por …".

- [ ] **Passo 1: Teste do cartão** (o código, "Conferida", "3 itens", "1 item" e "Recebida por Ana").
- [ ] **Passo 2: Ver falhar.**
- [ ] **Passo 3: Implementar**
  - A página exige `ver_listas`.
  - Tem o botão "Retirada do Full" só para quem opera, a `Paginacao` e o vazio "Nenhuma retirada do Full registrada.".
- [ ] **Passo 4: Rodar os testes.**
- [ ] **Passo 5: Commit** `feat(retiradas): lista das retiradas do Full`

### Tarefa 5: e2e nos dois projetos e conferência final

**Arquivos:**
- Criar: `tests/e2e/retirada-full.spec.ts`

- [ ] **Passo 1: e2e**
  - **`'do Rastreio não encontrado até Conferida'`:**
    - com a câmera falsa (abre e fecha o leitor);
    - o EAN é digitado: um do cadastro duas vezes, um sem cadastro com descrição, e um segundo produto do cadastro;
    - a foto da etiqueta e uma foto de item;
    - concluir sem a foto mostra o alerta;
    - depois, "Conferida" e o modo só de leitura;
    - `semRolagemLateral`, mais o botão de 44 px ou mais.
  - **`'a retirada aparece na lista e não nas devoluções'`:** a lista mostra o RF; `/fluxo` e a busca pelo código da etiqueta não mostram nada.
  - **`'Fiscal vê a lista, sem criar'`:** `/fluxo/retiradas-full/nova` dá "Página não encontrada".
- [ ] **Passo 2: Rodar `npx playwright test tests/e2e/retirada-full.spec.ts` (FAIL antes, PASS depois).**
- [ ] **Passo 3: Suíte completa:** `npm test`, `npm run test:int`, `npm run typecheck`, `npm run lint`, `npm run build:scripts` e `npm run test:e2e`.
- [ ] **Passo 4: Commit** `test(e2e): retirada do Full do recebimento até conferida`
