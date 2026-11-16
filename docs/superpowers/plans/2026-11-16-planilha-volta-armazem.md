# Planilha "Volta ao armazém" (melhoria 4): plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar este plano tarefa por tarefa. Os passos usam checkbox (`- [ ]`).

**Objetivo:** a página "Estoque Bom" (`/fluxo/estoque-bom`) lista o que volta ao armazém no período (unidades BOM das conferências concluídas e itens das retiradas do Full conferidas) e baixa um `.xlsx` com isso, sem integração e sem depender da NF.

**Arquitetura:**
- **Módulo puro `src/modules/volta-armazem/dominio.ts`:** período (ler, validar, atalhos), Situação, colunas, nome do arquivo e as linhas da planilha.
- **Consulta `src/modules/volta-armazem/consulta.ts`:** junta as duas fontes numa lista só, em ordem de data.
- **Rota `src/app/api/estoque-bom/planilha/route.ts`:** o download, no padrão da `lista-consolidada` (auth, cabeçalhos, nome).
- **Página `src/app/(app)/fluxo/estoque-bom/page.tsx`:** filtro, cartões e o rodapé fixo com "Baixar planilha". Links a partir da etapa 4 e do Painel.
- **O que não muda:** NF, lotes, etapas, `gerarXlsx`. **Sem migração:** a data da unidade é `devolucoes.conferida_em` (gravada por `concluirConferencia`, `src/modules/conferencia/concluir.ts`) e a da retirada é `retiradas_full.concluida_em`.

**Tecnologias:** Next.js 16.4.6 (App Router), React 19.3, Drizzle 0.45 + Postgres, Tailwind v4 (tokens de `src/components/estilos.ts`), Vitest (unidade e `test:int`), Playwright (projetos `computador` e `celular`), `read-excel-file` (já instalado, só nos testes).

**Spec:** [docs/superpowers/specs/2026-11-16-planilha-volta-armazem-design.md](../specs/2026-11-16-planilha-volta-armazem-design.md)

## Restrições globais
- **Textos fixos (da spec):** título "Estoque Bom"; atalhos "Hoje", "Últimos 7 dias", "Este mês"; botão "Baixar planilha"; Situação "Aguardando NF", "Disponível para venda", "Retirada do Full" (os outros status usam `ROTULO_STATUS_ITEM`).
- **Colunas, nesta ordem:** `Data · Origem · SKU · Descrição · EAN · Quantidade · Situação · Nº de série` (série vazia na retirada).
- **Arquivo:** `volta-ao-armazem_AAAA-MM-DD_a_AAAA-MM-DD.xlsx`; o cabeçalho traz o período.
- **Período:** padrão hoje (horário de Brasília); no máximo 366 dias contando os dois extremos; "De" ≤ "Até". Mensagem: `Período inválido: escolha "De" antes de "Até", com no máximo 366 dias.` em `role="alert"`, com o foco.
- **Entra:** unidade com `destino = 'BOM'`, status diferente de `PENDENTE` e `AUSENTE`, de devolução com `conferida_em` no período; item de retirada `CONFERIDA` com `concluida_em` no período. **Não entra:** AUSENTE, PROBLEMA, retirada ABERTA.
- **Permissão:** `ver_listas` na página e na rota. Sem sessão, a rota manda para `/login`.
- **Celular:** 390×844 sem rolagem lateral, cartões, rodapé fixo (`acima-barra sticky`) com o botão, alvos de 44 px (`min-h-11`).
- **Sem dependência nova, sem migração.** Não commitar o `package-lock.json`.
- **Commits:** terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Foco da revisão
1. **Unidade conferida às 23h30 de Brasília:** cai no dia certo (o filtro usa `at time zone 'America/Sao_Paulo'`, como a Busca). Teste na Tarefa 2.
2. **Item de retirada sem cadastro:** SKU vazio, descrição curta do item, EAN lido. Teste na Tarefa 2.
3. **Texto do usuário começando com "=" na descrição:** fica texto na planilha (o `gerarXlsx` já garante; a Tarefa 1 relê o arquivo).
4. **Período invertido ou com 367 dias na URL da rota:** não baixa; volta para a página com o alerta. Teste na Tarefa 3.
5. **Muitas linhas no período:** a página mostra no máximo 200 cartões (extra) e avisa para baixar a planilha; a planilha traz tudo. O limite é a constante `CARTOES_MAXIMOS`, conferida na Tarefa 1.

---

### Tarefa 1: Domínio puro (período, Situação, colunas, arquivo)

**Arquivos:**
- Criar: `src/modules/volta-armazem/dominio.ts`, `src/modules/volta-armazem/dominio.test.ts`

**Interfaces (produz):**
- `COLUNAS_VOLTA = ['Data', 'Origem', 'SKU', 'Descrição', 'EAN', 'Quantidade', 'Situação', 'Nº de série'] as const`;
- `DIAS_MAXIMOS_PLANILHA = 366`, `CARTOES_MAXIMOS = 200`, `MENSAGEM_PERIODO_INVALIDO`;
- `type Periodo = { de: string; ate: string }` (AAAA-MM-DD);
- `hojeEmBrasilia(agora?: Date): string`;
- `validarPeriodoVolta(de: string, ate: string): boolean`;
- `lerPeriodo(parametros: ParametrosBusca, agora?: Date): Periodo & { valido: boolean }` (falta "de" ou "ate" → hoje);
- `atalhosDoPeriodo(agora?: Date): { rotulo: 'Hoje' | 'Últimos 7 dias' | 'Este mês'; de: string; ate: string }[]`;
- `situacaoDaUnidade(status: StatusItem): string`, `SITUACAO_RETIRADA = 'Retirada do Full'`;
- `type LinhaVolta = { chave: string; tipo: 'DEVOLUCAO' | 'RETIRADA'; data: Date; origem: string; sku: string; descricao: string; ean: string | null; quantidade: number; situacao: string; serial: string | null }`;
- `hrefDaOrigem(l: LinhaVolta): string` (`/fluxo/devolucoes/DEV-…` ou `/fluxo/retiradas-full/RF-…`);
- `nomeArquivoVolta(p: Periodo): string`;
- `planilhaVolta(p: Periodo, linhas: LinhaVolta[]): (string | number | null)[][]`: `['Volta ao armazém']`, `['Período', 'DD/MM/AAAA a DD/MM/AAAA']`, linha vazia, `COLUNAS_VOLTA`, uma linha por `LinhaVolta` (Data em `formatarDataHora`).

- [ ] **Passo 1: Testes (`dominio.test.ts`)**
  - `'período: padrão hoje em Brasília, De depois de Até e mais de 366 dias são inválidos'`: com `agora = 2026-11-17T02:30:00Z` (23h30 do dia 16 em Brasília), `lerPeriodo({}, agora)` é `{ de: '2026-11-16', ate: '2026-11-16', valido: true }`; `validarPeriodoVolta('2026-11-17', '2026-11-16')` falso; `('2025-11-15', '2026-11-16')` (367 dias) falso; `('2025-11-16', '2026-11-16')` (366) verdadeiro; `('2026-02-30', …)` falso.
  - `'atalhos: Hoje, Últimos 7 dias e Este mês'`: com `agora` em 16/11/2026, `[{Hoje, 16..16}, {Últimos 7 dias, 10..16}, {Este mês, 01..16}]`.
  - `'Situação: rótulos da spec e o rótulo do próprio status nos outros'`: AGUARDANDO_NF → "Aguardando NF", DISPONIVEL_VENDA → "Disponível para venda", EM_LOTE → "Em lote".
  - `'nome do arquivo'`: `volta-ao-armazem_2026-11-01_a_2026-11-16.xlsx`.
  - `'a planilha relida tem o período no cabeçalho e as colunas na ordem'`: `gerarXlsx('Volta ao armazém', planilhaVolta(…))` relido com `readSheet(paraArrayBuffer(bytes))`; a linha 2 começa com `['Período', '01/11/2026 a 16/11/2026']`; a linha das colunas é `[...COLUNAS_VOLTA]`; a linha da devolução é `['16/11/2026 14:32', 'DEV-000123', 'SKU-1', 'Fone', '789', 1, 'Aguardando NF', 'SN-1']`; a da retirada termina com `'Retirada do Full', null` e a descrição `'=SOMA(1)'` volta como texto.
  - `CARTOES_MAXIMOS` é 200.
- [ ] **Passo 2: Rodar e ver falhar:** `npm test -- src/modules/volta-armazem` → FAIL (módulo não existe).
- [ ] **Passo 3: Implementar `dominio.ts`** (datas como `fiscal/periodo.ts`: `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' })`, aritmética de dias em UTC).
- [ ] **Passo 4: Rodar e ver passar:** `npm test -- src/modules/volta-armazem && npm run typecheck`.
- [ ] **Passo 5: Commit:** `feat(estoque-bom): domínio da planilha Volta ao armazém (período, colunas, arquivo)`.

### Tarefa 2: Consulta que junta unidades BOM e itens das retiradas conferidas

**Arquivos:**
- Criar: `src/modules/volta-armazem/consulta.ts`, `src/modules/volta-armazem/consulta.int.test.ts`

**Interfaces:**
- Consome: `Periodo`, `LinhaVolta`, `situacaoDaUnidade`, `SITUACAO_RETIRADA` (Tarefa 1).
- Produz: `listarVoltaAoArmazem(db: DbOuTx, p: Periodo): Promise<LinhaVolta[]>`, em ordem de `data`, depois origem e unidade.
  - Devolução: SKU = SKU do produto recebido ou o `sku` do item; descrição = produto recebido ou esperado; EAN = `ean_lido` ou o EAN do produto; quantidade 1; série = `serial`.
  - Retirada: SKU do produto ou `''`; descrição do produto ou a do item; EAN = `ean_lido` ou o do produto; série `null`.

- [ ] **Passo 1: Testes (`consulta.int.test.ts`)** com `criarDevolucaoNoEstoqueTeste` (com `agora`) e `criarRetirada`/inserção direta nas tabelas das retiradas:
  - `'junta as unidades BOM e os itens das retiradas conferidas; exclui AUSENTE, PROBLEMA e retirada aberta'`: devolução com `[BOM (serial SN-1), PROBLEMA, AUSENTE]` + retirada CONFERIDA com 2 itens (um com produto, quantidade 3; um sem cadastro) + retirada ABERTA → 3 linhas: a unidade BOM (`situacao: 'Aguardando NF'`, `serial: 'SN-1'`, `quantidade: 1`) e os dois itens (`'Retirada do Full'`, `quantidade: 3` e o sem cadastro com `sku: ''`).
  - `'unidade Disponível para venda continua entrando'`: o item vira `DISPONIVEL_VENDA` → `situacao: 'Disponível para venda'`.
  - `'respeita o período no horário de Brasília'`: conferida em `2026-11-17T02:30:00Z` entra em `{16..16}` e não em `{17..17}`; retirada concluída em 01/10 não entra em `{16..16}`.
- [ ] **Passo 2: Rodar e ver falhar:** `npx vitest run --config vitest.int.config.mts src/modules/volta-armazem` → FAIL.
- [ ] **Passo 3: Implementar `consulta.ts`** com duas consultas Drizzle (`alias(produtos, …)` para recebido e esperado) e o filtro `>= (de::date::timestamp at time zone 'America/Sao_Paulo')` e `< ((ate::date + 1)::timestamp at time zone 'America/Sao_Paulo')`.
- [ ] **Passo 4: Rodar e ver passar:** o mesmo comando + `npm run typecheck`.
- [ ] **Passo 5: Commit:** `feat(estoque-bom): consulta do que volta ao armazém (unidades BOM e retiradas do Full)`.

### Tarefa 3: Rota do download, página "Estoque Bom", links e e2e

**Arquivos:**
- Criar: `src/app/api/estoque-bom/planilha/route.ts`, `src/app/api/estoque-bom/planilha/route.test.ts`, `src/app/(app)/fluxo/estoque-bom/page.tsx`, `src/components/AlertaComFoco.tsx`, `tests/e2e/estoque-bom.spec.ts`
- Modificar: `src/app/(app)/fluxo/etapa/4/PaginaEstoque.tsx` (link "Planilha Volta ao armazém" na aba Estoque Bom), `src/app/(app)/fluxo/page.tsx` (link discreto ao lado de "Retiradas do Full")

**Interfaces:**
- Consome: `lerPeriodo`, `validarPeriodoVolta`, `planilhaVolta`, `nomeArquivoVolta`, `atalhosDoPeriodo`, `hrefDaOrigem`, `CARTOES_MAXIMOS` (Tarefa 1) e `listarVoltaAoArmazem` (Tarefa 2); `gerarXlsx` de `src/modules/lotes/xlsx.ts`.
- Rota: `GET /api/estoque-bom/planilha?de=&ate=`; `exigirPermissao('ver_listas')`; período inválido → 303 para `/fluxo/estoque-bom?de=…&ate=…` (a página mostra o alerta); válido → `.xlsx` com `content-disposition: attachment; filename="volta-ao-armazem_…xlsx"` e `cache-control: no-store`.
- `AlertaComFoco({ texto })`: `<p role="alert" tabIndex={-1}>` com `ALERTA_ERRO`, foco ao montar (como `MensagemSucesso`).

- [ ] **Passo 1: Testes**
  - `route.test.ts` (mock de `@/modules/auth/servidor`, `@/db` e da consulta): `'pede ver_listas e baixa o xlsx com o nome do período'` (status 200, `content-type` do xlsx, nome `volta-ao-armazem_2026-11-01_a_2026-11-16.xlsx`, `exigirPermissao` chamado com `'ver_listas'`); `'período inválido não baixa: volta para a página'` (`de=2026-11-17&ate=2026-11-16` → 303, `location` `/fluxo/estoque-bom?de=2026-11-17&ate=2026-11-16`, a consulta não é chamada).
  - `estoque-bom.spec.ts` (`computador` e `celular`), com SKU único por execução: devolução via `criarDevolucaoNoEstoqueTeste` (`[BOM, AUSENTE]`) e retirada CONFERIDA com 1 item gravadas direto no banco.
    - `'abre pelo link da etapa 4, filtra Hoje, mostra a unidade e o item, e baixa a planilha'`: `/fluxo/etapa/4` → link "Planilha Volta ao armazém" → `h1` "Estoque Bom"; clique em "Hoje"; o cartão da unidade (com o SKU, "Aguardando NF", link `DEV-…`) e o do item ("Retirada do Full", "Quantidade: 2", link `RF-…`) aparecem; `semRolagemLateral`; o botão "Baixar planilha" tem 44 px e está `naFrente`; `waitForEvent('download')` → `suggestedFilename()` `volta-ao-armazem_<hoje>_a_<hoje>.xlsx`; relido com `readSheet`: a linha `Período` e as colunas na ordem, e a linha do SKU da unidade com `'Aguardando NF'`.
    - `'período inválido: alerta com foco e sem botão de baixar'`: `/fluxo/estoque-bom?de=2026-11-17&ate=2026-11-16` → `getByRole('alert').filter({ hasText: 'Período inválido' })` focado; "Baixar planilha" com contagem 0.
    - `'sem sessão a planilha não baixa'`: contexto novo sem login, `request.get('/api/estoque-bom/planilha', { maxRedirects: 0 })` não é 200 e não traz `content-disposition`.
- [ ] **Passo 2: Rodar e ver falhar:** `npm test -- src/app/api/estoque-bom` e `npx playwright test tests/e2e/estoque-bom.spec.ts` → FAIL.
- [ ] **Passo 3: Implementar.**
  - **Página:** `exigirPermissao('ver_listas')`, `metadata.title` "Estoque Bom · Gestão de Devoluções", "← Etapa 4" (`/fluxo/etapa/4`), `h1` "Estoque Bom", frase "O que volta ao armazém para venda no período.", atalhos (links `min-h-11`, `aria-current` no ativo), formulário GET De/Até + "Filtrar", total, cartões (`<article>` com SKU, descrição, "Quantidade: N", origem como link, data, `Selo` da Situação), vazio "Nada voltou ao armazém nesse período.", limite de 200 cartões (extra) com aviso, rodapé `acima-barra sticky` com o link "Baixar planilha" (`BOTAO_PRIMARIO`, largura toda no celular).
  - **Links:** etapa 4, só na aba BOM, e Painel.
- [ ] **Passo 4: Rodar e ver passar:** os testes acima nos dois projetos.
- [ ] **Passo 5: Suíte completa:** `npm test`, `npm run test:int`, `npm run typecheck`, `npm run lint` (apague `test-results/` antes), `npm run build:scripts`, `npm run test:e2e`. Tudo verde (reexecução isolada só para as instabilidades conhecidas: `conferencia.spec`, `falhas.spec`, `backup-script.int`).
- [ ] **Passo 6: Commit:** `feat(estoque-bom): página Estoque Bom com a planilha Volta ao armazém`.
