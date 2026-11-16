# Motivo da reclamação do ML no sistema (melhoria 1): plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar este plano tarefa por tarefa. Os passos usam checkbox (`- [ ]`).

**Objetivo:** ler o `reason_id` da reclamação do ML, buscar o texto do motivo (com cache), preencher o "Motivo do cliente" só quando estiver vazio e mostrar uma linha "Motivo: …" no cartão da devolução.

**Arquitetura:**
- **Conector (puro + HTTP):** o esquema e o `mapearReclamacao` passam a ler `reason_id` (vira `DadosDevolucaoML.motivoId`). Uma função pura `textoMotivoReclamacao(json)` tira o texto da resposta de `GET /post-purchase/v1/claims/reasons/{id}`. O `ConectorML` ganha `obterMotivoReclamacao(motivoId)`.
- **Cache e falha (`src/modules/mercado-livre/motivos.ts`):** a tarefa `ml.sincronizar-reclamacao` garante o texto no cache **antes** da transação; qualquer erro da consulta vira log e `null`, sem derrubar a sincronização.
- **Sincronização:** `aplicarReclamacao` lê o texto do cache dentro da transação e o grava em `devolucoes.motivo_cliente` só se estiver vazio (criação, vínculo e atualização). Também guarda `reclamacoes_ml.motivo_id`.
- **Tela:** `ResumoDevolucao` ganha `motivoCliente`; o `CartaoDevolucao` mostra "Motivo: …" em uma linha com reticências.
- **O que não muda:** `src/conectores/marketplace/tipos.ts` (congelado, contrato E9), os motivos de contestação (SRF2–SRF6), o motivo da unidade na conferência, a página de detalhe.

**Tecnologias:** Next.js 16.4.6 (App Router), React 19.3, Drizzle 0.45 + Postgres, Zod, Tailwind v4, Vitest (unidade e `test:int`), Playwright (projetos `computador` e `celular`).

**Spec:** [docs/superpowers/specs/2026-11-16-motivo-reclamacao-ml-design.md](../specs/2026-11-16-motivo-reclamacao-ml-design.md)

## Restrições globais
- **Textos fixos:** linha do cartão `Motivo: <texto>`; o detalhe continua com o rótulo "Motivo do cliente".
- **Suposição A15** (a confirmar na "Ligação das contas reais", como A1–A14): a resposta de `GET /post-purchase/v1/claims/reasons/{reason_id}` traz o texto em português em `detail` (ou `description`); `name` só vale se não for um código (`/^[a-z0-9_]+$/`, ex. `repentant_buyer`).
- **Nunca sobrescrever:** `motivo_cliente` com texto (depois de `btrim`) fica como está. Sem texto do ML, nada é gravado (nunca o código cru).
- **Falha da consulta:** não lança, não grava no cache, tenta de novo na próxima sincronização.
- **Logs:** só `logErroML` (o corpo passa por `resumirCorpoErro`). Nada do corpo da resposta de motivo vai ao log.
- **Migração:** `npm run db:gerar -- --name melhoria1_motivo_ml` (gera `drizzle/0011_melhoria1_motivo_ml.sql`), sem SQL à mão. Nenhuma dependência nova. Não commitar mudanças do `package-lock.json`.
- **Celular:** 390×844 sem rolagem lateral; a linha do motivo usa `truncate` (uma linha, reticências).
- **Commits:** terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Comandos de conferência:** `npm test`, `npm run test:int`, `npm run typecheck`, `npm run lint`, `npm run build:scripts`, `npm run test:e2e`. Banco de testes em `localhost:5433` (veja o `.env`).

## Foco da revisão
1. **Motivo digitado à mão ou vindo da planilha, depois vinculado ao ML:** continua o mesmo. Teste na Tarefa 2 (vínculo D9).
2. **ML fora do ar só na rota de motivos (500/rede):** a devolução é criada sem motivo e ganha o motivo na sincronização seguinte. Teste na Tarefa 2.
3. **Resposta de motivo em formato inesperado** (sem `detail`, só `name` em código): nada aparece, nada quebra. Teste na Tarefa 1.
4. **Motivo longo no celular:** o cartão não cresce para o lado. Teste na Tarefa 3 (classe `truncate` + `semRolagemLateral`).
5. **Muitas reclamações com o mesmo motivo:** uma consulta só ao ML. Teste na Tarefa 2.

---

### Tarefa 1: Conector lê o `reason_id` e busca o texto do motivo

**Arquivos:**
- Modificar: `src/conectores/marketplace/mercadolivre/esquemas.ts`, `mapeamento.ts`, `tipos.ts`, `conector.ts`, `falso.ts`
- Criar: `tests/fixtures/ml/doc/motivo-reclamacao.json`
- Modificar: `tests/fixtures/ml-falso/cenarios.json`, `tests/helpers/fabricas-ml.ts`
- Testes: `mapeamento.test.ts`, `conector.test.ts`, `falso.test.ts` (na pasta do conector)

**Interfaces:**
- Produz:
  - `DadosDevolucaoML.motivoId: string | null` (o `reason_id`, nos dois retornos de `mapearReclamacao`);
  - `esquemaReclamacao` com `reason_id: idOuNulo`;
  - `textoMotivoReclamacao(json: unknown): string | null` em `mapeamento.ts` (pura; regra da A15; `trim`; vazio ou formato ruim → `null`, sem lançar);
  - `ConectorMercadoLivre.obterMotivoReclamacao(motivoId: string): Promise<string | null>` — erro HTTP/rede **lança** (quem chama decide); formato ruim → `null`;
  - no `ConectorMLMemoria`: `motivos: Map<string, string>`, `consultasMotivo: string[]`, `falhaNoMotivo: unknown`; `dadosDevolucaoMLTeste` passa a ter `motivoId: null` por padrão.
- Falso: rota `GET /post-purchase/v1/claims/reasons/([A-Z0-9]+)` responde o `motivo-reclamacao.json` com `id` e `detail` trocados, a partir de `cenarios.json` → `"motivosReclamacao": { "PDD9949": "Comprador se arrependeu", "PDD9939": "O produto tem defeito ou não funciona", "PDD9944": "O produto é diferente do anunciado" }`; código desconhecido → 404. `CenarioFalso` ganha `motivo?: string` (a reclamação usa `reason_id: c.motivo ?? 'PDD9949'`); o cenário 7 passa a ter `"motivo": "PDD9939"`.

- [ ] **Passo 1: Testes que falham**
  - `mapeamento.test.ts`:
    - `'lê o reason_id da reclamação (motivoId)'`: com `reclamacao.json`, `mapearReclamacao(...).motivoId` é `'PDD9949'`; sem devolução também; sem `reason_id` → `null`.
    - `'textoMotivoReclamacao: detail, description, name que não é código, e nulo no resto'`: `motivo-reclamacao.json` → `'Comprador se arrependeu'`; `{ name: 'Produto com defeito' }` → esse texto; `{ name: 'repentant_buyer' }` → `null`; `{ detail: '  ' }`, `null`, `[]`, `'x'` → `null`.
  - `conector.test.ts`: `'obterMotivoReclamacao chama /post-purchase/v1/claims/reasons/{id} e devolve o texto'` (caminho com `encodeURIComponent`); `'404 na consulta do motivo lança ErroML'`.
  - `falso.test.ts`: `'motivos: PDD9949 → Comprador se arrependeu; desconhecido → 404'`; `'o cenário 7 troca o reason_id para PDD9939'`.
- [ ] **Passo 2:** `npm test -- src/conectores/marketplace/mercadolivre` → FAIL (`motivoId` indefinido, função e rota inexistentes).
- [ ] **Passo 3:** implementar o que está em **Interfaces**.
- [ ] **Passo 4:** `npm test -- src/conectores/marketplace/mercadolivre && npm run typecheck` → PASS.
- [ ] **Passo 5: Commit** `feat(ml): lê o reason_id e busca o texto do motivo da reclamação`.

### Tarefa 2: Banco, cache e "Motivo do cliente" na sincronização

**Arquivos:**
- Modificar: `src/db/schema/mercado-livre.ts` (coluna `reclamacoes_ml.motivo_id text` nula; tabela `motivos_reclamacao_ml`: `id text PK`, `nome text not null`, `consultado_em timestamptz not null`), `src/modules/mercado-livre/sincronizar.ts`, `tarefas.ts`
- Criar: `src/modules/mercado-livre/motivos.ts`, `drizzle/0011_melhoria1_motivo_ml.sql` (gerado)
- Testes: `src/modules/mercado-livre/sincronizar.int.test.ts`, `tarefas.int.test.ts`

**Interfaces:**
- Consome: `DadosDevolucaoML.motivoId`, `obterMotivoReclamacao`, `ConectorMLMemoria` (Tarefa 1).
- Produz (`motivos.ts`):
  - `motivoEmCache(db: DbOuTx, motivoId: string | null): Promise<string | null>`;
  - `garantirTextoMotivo(db: DbOuTx, conector: Pick<ConectorMercadoLivre, 'obterMotivoReclamacao'>, motivoId: string | null, agora: Date): Promise<string | null>` — cache primeiro; senão consulta, grava (upsert) se vier texto; qualquer erro → `logErroML('motivo da reclamação', erro, { motivoId })` e `null`.
- `tarefas.sincronizarReclamacao`: chama `garantirTextoMotivo` depois de `obterReclamacao` e antes de `aplicarReclamacao`.
- `aplicarReclamacao` (assinatura igual): lê `motivoEmCache(tx, dados.motivoId)`; `dadosNovaDevolucao(d, motivoCliente: string | null = null)`; em `atualizar` e `vincular`, quando há texto, `motivoCliente: sql\`case when nullif(btrim(${devolucoes.motivoCliente}), '') is null then ${texto} else ${devolucoes.motivoCliente} end\``; `gravarReclamacao` grava `motivoId`.

- [ ] **Passo 1: Testes que falham** (`sincronizar.int.test.ts`, semeando `motivos_reclamacao_ml` direto)
  - `'motivo em cache vira o Motivo do cliente na criação e o código fica em reclamacoes_ml'`.
  - `'na atualização preenche só se vazio; o digitado à mão não é sobrescrito'`.
  - `'D9: no vínculo, a manual com motivo fica com o dela; a manual sem motivo recebe o do ML'`.
  - `'sem texto do motivo, o Motivo do cliente fica vazio (nunca o código cru)'`.
- [ ] **Passo 2: Testes que falham** (`tarefas.int.test.ts`, com `ConectorMLMemoria`)
  - `'consulta o texto do motivo uma vez só (cache) para duas reclamações com o mesmo código'`: `consultasMotivo` com 1 item, as duas devoluções com `motivoCliente` `'Comprador se arrependeu'`.
  - `'falha na consulta do motivo não derruba a sincronização e tenta de novo na próxima'`: `falhaNoMotivo = new ErroML(500, '', '/post-purchase/v1/claims/reasons/PDD9949')` → `acao: 'criada'`, `motivoCliente` nulo, cache vazio; sem a falha, a 2ª sincronização preenche (2 consultas). Silencie `console.error` com `vi.spyOn`.
- [ ] **Passo 3:** `npm run test:int -- src/modules/mercado-livre` → FAIL.
- [ ] **Passo 4:** schema + `npm run db:gerar -- --name melhoria1_motivo_ml` (confira o SQL: só `ALTER TABLE ... ADD COLUMN motivo_id` e `CREATE TABLE motivos_reclamacao_ml`) + `motivos.ts` + mudanças em `sincronizar.ts` e `tarefas.ts`.
- [ ] **Passo 5:** `npm run test:int -- src/modules/mercado-livre && npm run typecheck` → PASS.
- [ ] **Passo 6: Commit** `feat(ml): guarda o motivo da reclamação e preenche o Motivo do cliente só quando vazio`.

### Tarefa 3: Linha "Motivo" no cartão e e2e

**Arquivos:**
- Modificar: `src/modules/devolucoes/busca.ts` (`ResumoDevolucao.motivoCliente?: string | null`; `buscarDevolucoes` seleciona `devolucoes.motivoCliente`), `src/components/CartaoDevolucao.tsx`
- Testes: `src/components/CartaoDevolucao.test.tsx`, `tests/e2e/mercado-livre.spec.ts`

**Interfaces:**
- Consome: `motivo_cliente` preenchido pela sincronização (Tarefa 2); rota de motivos do falso (Tarefa 1).
- Cartão: logo depois da linha do rastreio, `<span className="truncate text-xs text-texto-2" title={texto}>Motivo: {texto}</span>`, só quando `motivoCliente?.trim()` tem texto.

- [ ] **Passo 1: Testes que falham**
  - `CartaoDevolucao.test.tsx`: `'mostra o motivo do cliente numa linha só, com reticências'` (texto `Motivo: Comprador se arrependeu`, classe `truncate`); `'sem motivo (nulo ou só espaços), não mostra a linha'` (`queryByText(/^Motivo:/)` nulo).
  - `mercado-livre.spec.ts`: `'a devolução do ML falso mostra o motivo da reclamação no cartão e no detalhe'` — cenário 1 por aviso; em `/fluxo/busca?reclamacao=<id>` o link do cartão contém `Motivo: Comprador se arrependeu`; `semRolagemLateral`; no detalhe, `Comprador se arrependeu` visível.
- [ ] **Passo 2:** `npm test -- src/components/CartaoDevolucao.test.tsx` → FAIL.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** `npm test && npm run typecheck && npm run lint && npx playwright test tests/e2e/mercado-livre.spec.ts` → PASS nos dois projetos.
- [ ] **Passo 5: Commit** `feat(fluxo): linha Motivo no cartão da devolução`.
- [ ] **Passo 6:** suíte inteira (comandos de conferência) e prints 390×844 do cartão e do detalhe.
