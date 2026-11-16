# Fotos da avaria na conferência (melhoria 2): plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar este plano tarefa por tarefa. Os passos usam checkbox (`- [ ]`).

**Objetivo:** no passo de cada unidade, o operador tira até 6 "Fotos da avaria (opcional)" (`EXTRA`), vê o envio de cada uma e remove as erradas com dois toques; a contestação do ML põe as Fotos 1 a 4 antes das extras.

**Arquitetura:**
- **Servidor (`src/modules/midia`):** o limite de 6 entra em `autorizarEnvio` (roda ao criar o upload e de novo, com a devolução travada, ao registrar). A remoção é um módulo novo, `remocao.ts`, com as mesmas regras do envio.
- **Banco:** o índice único `evidencias_item_tipo_uq` hoje **não** ignora `EXTRA` (só o do pacote ignora), e a 2ª foto extra da mesma unidade quebra. Uma migração troca o `where` do índice. É a única mudança no banco.
- **Aparelho:** a fila (`filaEnvios.ts`) ganha `remover` (tira da fila sem enviar, e recusa o que está subindo agora). A lista de extras de uma unidade sai de uma função pura, `fotosExtras`, em `estadoSlot.ts`.
- **Tela:** componente novo `FotosAvaria.tsx`, usado no `PassoItem.tsx`.
- **O que não muda:** Fotos 1 a 4, Vídeo de Prova, o que é exigido para concluir e o detalhe da devolução (já mostra "Extra · Unidade N").

**Tecnologias:** Next.js 16.4.6 (App Router, Server Actions), React 19.3, Drizzle 0.45 + Postgres, Tailwind v4, Vitest (unidade e `test:int`), Playwright (projetos `computador` e `celular`).

**Spec:** [docs/superpowers/specs/2026-11-16-fotos-avaria-design.md](../specs/2026-11-16-fotos-avaria-design.md)

## Restrições globais
- **Textos fixos:**
  - título do bloco: "Fotos da avaria (opcional)" (`h3`);
  - botão: "Adicionar foto" (56 px, largura total, ícone de câmera, `<input type="file" accept="image/*" capture="environment">`);
  - cada miniatura é um `role="group"` com o nome "Foto da avaria N";
  - "Remover" → segundo toque "Confirmar remoção" (e "Cancelar");
  - no limite: "Limite de 6 fotos da avaria nesta unidade.";
  - recusa da 7ª no servidor (409): "Limite de 6 fotos da avaria por unidade. Remova uma para tirar outra.".
- **Limite:** `LIMITE_EXTRA_POR_UNIDADE = 6` em `src/modules/midia/dominio.ts`.
- **Histórico:** chave nova `evidencia_removida` ("Foto da avaria removida") em `src/modules/historico/rotulos/conferencia.ts`.
- **Migração:** `npm run db:gerar -- --name melhoria2_fotos_avaria`. Nenhuma outra.
- **Celular:** 390×844, sem rolagem lateral, miniaturas em grade de 2 colunas que quebra de linha, alvos de 44 px ou mais (o "Remover" incluído), erro em `role="alert"` com foco, progresso com `role="progressbar"`.
- **Nomes que o e2e já usa e não podem colidir:** "Tirar Foto 3", "Tirar Foto 4", grupos "Foto 3" e "Foto 4" (`exact`).
- **Sem dependências novas.** Não commitar o `package-lock.json`.
- **Commits:** terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Comandos de conferência:** `npm test`, `npm run test:int`, `npm run typecheck`, `npm run lint`, `npm run build:scripts`, `npm run test:e2e`.

## Foco da revisão
1. **A 2ª foto extra da mesma unidade:** grava (hoje quebra no índice único). Teste na Tarefa 1.
2. **Remover uma foto que ainda está na fila:** não sobe depois, nem se a rodada da fila já a tinha escolhido. Teste na Tarefa 2.
3. **Remover enquanto a foto sobe:** a fila recusa e a tela pede para esperar; nada fica duplicado no servidor. Teste na Tarefa 2.
4. **Duas extras concluídas na mesma tela:** as duas aparecem (o `concluidos` de hoje guarda uma por tipo+unidade). Teste na Tarefa 2.
5. **Remoção sem internet ou por quem perdeu a trava:** mensagem clara em `role="alert"`, a foto continua na lista. Teste nas Tarefas 1 e 3.

---

### Tarefa 1: Servidor (índice, limite de 6, remoção e ordem da contestação)

**Arquivos:**
- Criar: `src/modules/midia/remocao.ts`, `src/modules/midia/remocao.int.test.ts`, `drizzle/00xx_melhoria2_fotos_avaria.sql` (gerado)
- Modificar: `src/db/schema/evidencias.ts:45`, `src/modules/midia/dominio.ts`, `src/modules/midia/recepcao.ts:65-96`, `src/modules/historico/rotulos/conferencia.ts`, `src/modules/mercado-livre/resultado.ts:66-81`
- Testes: `src/modules/midia/recepcao.int.test.ts`, `src/modules/mercado-livre/resultado.int.test.ts`

**Interfaces:**
- Produz:
  - `LIMITE_EXTRA_POR_UNIDADE = 6`;
  - `removerFotoAvaria(db: Db, evidenciaId: string, usuario: UsuarioSessao, agora?: Date): Promise<void>`, que lança `ErroRemocao` (`status`: 403, 404, 400 ou 409; `message` em português).

- [ ] **Passo 1: Testes que falham**
  - `recepcao.int.test.ts`:
    - `'a unidade aceita até 6 fotos da avaria; a 7ª é recusada com 409'`: 6 `registrarRecebida` `EXTRA` com o mesmo `itemId` passam; a 7ª rejeita `{ status: 409, message: 'Limite de 6 fotos da avaria por unidade. Remova uma para tirar outra.' }`; outra unidade ainda aceita.
  - `remocao.int.test.ts`:
    - `'remove a foto da avaria: linha, arquivo e evento evidencia_removida'`: evidência `EXTRA` PRONTA com arquivo no `ArmazenamentoMemoria`; depois da remoção, a linha some, o arquivo some e há um evento `evidencia_removida` com `dados` `{ evidenciaId, tipo: 'EXTRA', itemId, sha256_original }`.
    - `'não remove Fotos 1 a 4 nem o Vídeo de Prova (400)'`.
    - `'só quem está com a trava, durante a conferência (409); perfil sem operar_devolucoes (403); id inexistente (404)'`.
  - `resultado.int.test.ts`:
    - `'a pré-seleção da contestação põe as Fotos 1 a 4 antes das extras'`: Fotos 1 e 2, Fotos 3 e 4 da unidade com problema e 8 `EXTRA` da mesma unidade; a contestação tem 10 fotos e inclui as 4 fixas.

- [ ] **Passo 2: Rodar e ver falhar**

Rode: `npm run test:int -- src/modules/midia/recepcao.int.test.ts src/modules/midia/remocao.int.test.ts src/modules/mercado-livre/resultado.int.test.ts`
Esperado: FAIL (violação do índice único na 2ª extra; `./remocao` não existe).

- [ ] **Passo 3: Implementar**
  - **Índice:** `evidencias_item_tipo_uq` com `where "item_id" is not null and "tipo" <> 'EXTRA'`; gerar a migração com o nome acima.
  - **Limite:** em `autorizarEnvio`, depois de achar a unidade, se `tipo === 'EXTRA'` conta as `EXTRA` da mesma devolução e unidade (ou do pacote, com `itemId` nulo); com 6 ou mais, `ErroEnvio(409, …)`.
  - **Remoção:** transação que trava a devolução (`for('update')`), confere perfil, existência, tipo `EXTRA`, `EM_CONFERENCIA` e `conferenteId`; apaga a linha e registra o evento; depois da transação apaga o arquivo final e o temporário, como o refazer de `registrarRecebida`.
  - **Contestação:** ordena por `case when tipo = 'EXTRA' then 1 else 0 end`, depois `tipo` e `enviadoEm` (sem depender da ordem do enum).

- [ ] **Passo 4: Rodar e ver passar** (mesmo comando; e `npm test -- src/modules/historico`)

- [ ] **Passo 5: Commit** `feat(midia): até 6 fotos da avaria por unidade e remoção pelo conferente`

### Tarefa 2: Fila do aparelho e lista de extras

**Arquivos:**
- Modificar: `src/components/midia/filaEnvios.ts`, `src/components/midia/useFilaEnvios.ts`, `src/components/conferencia/estadoSlot.ts`
- Testes: `src/components/midia/filaEnvios.test.ts`, `src/components/conferencia/estadoSlot.test.ts`

**Interfaces:**
- Produz:
  - `FilaEnvios.remover(idCliente: string): Promise<boolean>`: `false` se está subindo agora; senão tira da fila e nunca envia;
  - `juntarConcluido(lista: EnvioConcluido[], e: EnvioConcluido): EnvioConcluido[]`: `EXTRA` acumula; os outros tipos substituem o da mesma vaga;
  - `useFilaEnvios(...)` devolve também `remover`;
  - `type FotoExtra = { chave: string; estado: EstadoSlot; alvo: { tipo: 'local'; idCliente: string } | { tipo: 'servidor'; evidenciaId: string } }`;
  - `fotosExtras(itemId: string, p: { envios; concluidos; evidencias }, removidas: ReadonlySet<string>): FotoExtra[]`: as do servidor (sem `APAGADA`), as concluídas nesta tela que o servidor ainda não mostra e as do aparelho, nessa ordem; sem as de outra unidade e sem as `removidas`.

- [ ] **Passo 1: Testes que falham**
  - `'remover tira da fila e o envio nunca acontece'` (transporte espia não é chamado).
  - `'remover durante o envio devolve false e o envio termina normalmente'`.
  - `'remover depois de a rodada escolher o envio: ele é pulado'`.
  - `'juntarConcluido guarda duas EXTRA da mesma unidade e substitui a Foto 3'`.
  - `'fotosExtras junta servidor, concluídas e aparelho, sem duplicar a concluída que o servidor já tem'` e `'fotosExtras esconde removidas, APAGADA e as de outra unidade'`.

- [ ] **Passo 2: Rodar e ver falhar**: `npm test -- src/components/midia/filaEnvios.test.ts src/components/conferencia/estadoSlot.test.ts`

- [ ] **Passo 3: Implementar.** `FilaEnvios` guarda `emEnvio: string | null` (marcado de forma síncrona no início de `enviar`) e um `Set` de removidos, que `enviar` confere antes de gravar o estado "enviando".

- [ ] **Passo 4: Rodar e ver passar** (mesmo comando)

- [ ] **Passo 5: Commit** `feat(midia): a fila tira a foto removida sem enviar e guarda várias extras`

### Tarefa 3: Bloco "Fotos da avaria (opcional)" na unidade

**Arquivos:**
- Criar: `src/components/conferencia/FotosAvaria.tsx`, `src/components/conferencia/FotosAvaria.test.tsx`
- Modificar: `src/components/conferencia/PassoItem.tsx` (o bloco vai logo depois da Foto 4 e dos campos S/N, lote e validade, que são dela, e antes de "Não veio no pacote"), `src/components/conferencia/AssistenteConferencia.tsx`, `src/app/(app)/fluxo/devolucoes/[codigo]/conferencia/{acoes.ts,page.tsx}`, `src/components/conferencia/AssistenteConferencia.test.tsx` (nova ação no mock)

**Interfaces:**
- Consome: `fotosExtras`, `FotoExtra`, `remover` (Tarefa 2) e `removerFotoAvaria`, `ErroRemocao` (Tarefa 1).
- Produz:
  - `removerFotoAvariaAcao(evidenciaId: string): Promise<{ ok: true } | { ok: false; mensagem: string }>`;
  - `AcoesConferencia.removerFotoAvaria`;
  - `FotosAvaria({ fotos: FotoExtra[]; aoEscolher(arquivo: File): void; aoTentarDeNovo(idCliente: string): void; aoRemover(foto: FotoExtra): Promise<string | null> })`, em que `aoRemover` devolve a mensagem de erro ou `null`.

- [ ] **Passo 1: Testes que falham (`FotosAvaria.test.tsx`)**
  - `'Adicionar foto entrega o arquivo da câmera'`.
  - `'mostra o andamento de cada foto: progressbar, ✓ Enviada, Aguardando conexão e erro com Tentar de novo'`.
  - `'Remover pede um segundo toque; Cancelar desfaz; Confirmar remoção chama aoRemover'`.
  - `'erro ao remover aparece em role=alert com foco'`.
  - `'com 6 fotos, esconde Adicionar foto e mostra o limite'`.

- [ ] **Passo 2: Rodar e ver falhar**: `npm test -- src/components/conferencia/FotosAvaria.test.tsx`

- [ ] **Passo 3: Implementar.** Reaproveite `BotaoArquivo` e `BarraProgresso` de `SlotEvidencia.tsx` e `textoDoSlot`. No `AssistenteConferencia`:
  - a remoção local usa `remover` da fila; se vier `false`: "Aguarde: a foto ainda está subindo. Remova quando terminar.";
  - a do servidor chama a ação, guarda o id em `removidas` e faz `router.refresh()`;
  - sem rede: "Sem conexão: a remoção precisa de internet. Tente de novo quando a conexão voltar.".

- [ ] **Passo 4: Rodar e ver passar**: `npm test -- src/components/conferencia && npm run typecheck && npm run lint`

- [ ] **Passo 5: Commit** `feat(conferencia): fotos da avaria (opcional) no passo de cada unidade`

### Tarefa 4: e2e e prints do celular

**Arquivos:**
- Criar: `tests/e2e/fotos-avaria.spec.ts`
- Modificar: `tests/e2e/apoio-conferencia.ts` (`conferirDevolucao` ganha o parâmetro opcional `aoConferirUnidade?: (page: Page, indice: number) => Promise<void>`, chamado depois das Fotos 3 e 4)

- [ ] **Passo 1: Teste.** `'tira 2 fotos da avaria, remove 1 e o detalhe mostra 1 "Extra · Unidade 1"'`, nos dois projetos:
  - `getByLabel('Adicionar foto')` duas vezes;
  - espera "Enviada|Pronta" nos grupos "Foto da avaria 1" e "Foto da avaria 2";
  - "Remover" e depois "Confirmar remoção" na 2ª;
  - conclui e confere 1 "Extra · Unidade 1" no detalhe.
  - Com `PRINTS_DIR` definido, salva os prints de 390×844 do passo (1 ✓ e o 2º toque do Remover) e do detalhe.
- [ ] **Passo 2: Rodar**: `npx playwright test tests/e2e/fotos-avaria.spec.ts` (verde, se as Tarefas 1 a 3 estiverem prontas).
- [ ] **Passo 3: Suíte inteira**: `npm test`, `npm run test:int`, `npm run typecheck`, `npm run lint`, `npm run build:scripts`, `npm run test:e2e`.
- [ ] **Passo 4: Commit** `test(e2e): fotos da avaria na conferência`
