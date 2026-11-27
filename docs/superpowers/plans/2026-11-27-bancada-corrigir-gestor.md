# Bancada do Operador, Corrigir (Gestor) e Apagadas: plano de execução

> **Para agentes:** a fonte é a emenda **E29** do contrato. Construa tarefa por tarefa com TDD: primeiro o teste que falha, depois o mínimo para passar, e um commit por tarefa. Os passos usam caixas (`- [ ]`).

**Objetivo:** uma tela simples para o funcionário que só recebe e confere; o Gestor pode corrigir, apagar e restaurar qualquer coisa.

**Arquitetura:** duas frentes em paralelo, cada uma no seu worktree e banco de teste, saindo da branch `bancada-gestor`, que traz a E29:
- **A (`bancada-operador`):** a rota `/bancada`, a matriz de permissões e o Receber pacote reaproveitado;
- **B (`corrigir-gestor`):** a migração `0018`, os serviços de correção, a seção "Corrigir (Gestor)", a lista Apagadas e a tarefa dos 90 dias.

Uma integração junta as duas e acrescenta o filtro das apagadas na fila da Bancada.

**Tecnologias:** Next.js 16 (leia `node_modules/next/dist/docs/` antes de escrever código Next), React 19, TS estrito, Tailwind v4, Drizzle e postgres.js, pg-boss, Vitest (unidade e `int`) e Playwright (projetos `computador` e `celular`).

**Spec:** `docs/superpowers/plans/2026-11-12-contrato-fases-2-6.md`, emenda E29 (§10), e a spec `docs/superpowers/specs/2026-11-11-gestao-devolucoes-design.md` (§5.2, §6.9, §9).

## Regras gerais
- Texto de tela em pt-BR e **mobile-first**: 390×844 primeiro, alvos de 44 px, sem rolagem horizontal. O que é novo leva "(extra)" onde as telas já marcam extras.
- **Toda regra vale no servidor.** Esconder um botão não basta: a ação do servidor confere o perfil e o status.
- Toda correção grava `registrarEvento` (`src/modules/historico/eventos.ts`) com `dados: { antes, depois }`. Os rótulos novos ficam em `src/modules/historico/rotulos/*.ts`.
- **Status:** mudança de status da devolução só pelas regras de `src/modules/devolucoes/transicoes.ts` (`REGRAS_TRANSICAO`, `exigirTransicao`); do item, pelas de `transicoes-item.ts`.
- Nunca rode `npm run test:int` e um e2e ao mesmo tempo no mesmo banco.
- Commits em pt-BR, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Não mexa em outros worktrees, no checkout principal nem em nada do Bitbrain. Não mostre segredos.

---

## Frente A: Bancada do Operador (branch `bancada-operador`)

### Tarefa A1: permissões, abas e página inicial por perfil

**Arquivos:** `src/modules/auth/permissoes.ts` (+ teste), `src/components/NavAbas.tsx` (+ teste), `src/app/login/acoes.ts`, `src/app/login/page.tsx`, `src/app/page.tsx`.

**Produz:**
- `Acao` ganha `'cadastrar_devolucoes'` (GESTOR) e `'acompanhar'` (FISCAL e GESTOR);
- `ABAS`: Fluxo passa a exigir `acompanhar`, e entra `{ rotulo: 'Bancada', href: '/bancada', acao: 'operar_devolucoes' }`;
- `abasVisiveis('OPERADOR')` devolve só a Bancada. Fiscal e Gestor **não** veem a aba Bancada; o Gestor entra nela pelo menu;
- `paginaInicial(perfil: Perfil): '/bancada' | '/fluxo'`.

- [ ] Teste: `abasVisiveis('OPERADOR')` = [Bancada]; `abasVisiveis('FISCAL')` = [Fluxo, Lotes e Remessas, Produtos e Fornecedores]; `abasVisiveis('GESTOR')` igual a hoje; `pode('OPERADOR','cadastrar_devolucoes')` = false; `pode('OPERADOR','acompanhar')` = false; `paginaInicial('OPERADOR')` = '/bancada'.
- [ ] Implementar. Ícone e rótulo curto "Bancada" no `NavAbas`.
- [ ] Login, `/login` com sessão e `/` redirecionam para `paginaInicial(perfil)`.
- [ ] Commit.

### Tarefa A2: o Operador não chega ao que não é dele

**Arquivos:** `src/modules/auth/servidor.ts` (+ teste) e as páginas `src/app/(app)/fluxo/page.tsx`, `fluxo/busca`, `fluxo/etapa/**`, `fluxo/estoque-bom`, `fluxo/alertas`, `fluxo/devolucoes/nova` (página e ação) e `importacoes/[tipo]` e `[tipo]/[id]` (página e ações) quando o tipo é o de devoluções.

**Produz:** `exigirOuBancada(acao: Acao): Promise<UsuarioSessao>`. O OPERADOR sem a permissão vai para `redirect('/bancada')`; os outros perfis seguem o `exigirPermissao` de hoje (`notFound`).

- [ ] Teste de unidade do `exigirOuBancada`, com o `next/navigation` simulado.
- [ ] O quadro, a busca, as etapas, o estoque-bom e os alertas usam `exigirOuBancada('acompanhar')`. A Nova devolução e a importação de devoluções usam `exigirOuBancada('cadastrar_devolucoes')`, **nas páginas e nas ações do servidor**. A importação de produtos e fornecedores continua como está.
- [ ] O Operador continua com acesso ao detalhe da devolução (só leitura), à conferência, às Retiradas do Full e à etiqueta amarela.
- [ ] Commit.

### Tarefa A3: fila da Bancada

**Arquivos:** criar `src/modules/bancada/fila.ts` e `fila.int.test.ts`.

**Produz:**
```ts
export type CartaoFila = { id: string; codigo: string; titulo: string; chegouEm: Date | null; urgenteML: boolean };
export type FilaBancada = { esperando: CartaoFila[]; continuar: CartaoFila[]; retiradas: { id: string; codigo: string; abertaEm: Date }[] };
export async function listarFilaBancada(db: DbOuTx, usuarioId: string): Promise<FilaBancada>;
```
- `esperando`: AGUARDANDO_CONFERENCIA, na mesma ordem da etapa 2 do quadro, com as urgentes do ML primeiro. Reaproveite a ordenação de `src/modules/devolucoes/quadro.ts`, sem copiar;
- `continuar`: EM_CONFERENCIA com `conferente_id = usuarioId`;
- `retiradas`: `retiradas_full` ABERTA, as mais antigas primeiro.

- [ ] Teste `int`: cria devoluções em cada status e confere o que entra em cada lista e a ordem. Uma EM_CONFERENCIA de outro usuário não aparece.
- [ ] Implementar. Commit.

### Tarefa A4: tela `/bancada` e o Receber pacote dentro dela

**Arquivos:** criar `src/app/(app)/bancada/page.tsx` e `FilaBancada.tsx` (+ teste). Mexer em `src/app/(app)/fluxo/recebimento/FormularioRecebimento.tsx`, `acoes.ts` e `page.tsx`, e em `src/app/(app)/fluxo/retiradas-full/page.tsx` (o "voltar" vai para `/bancada`).

**Consome:** `listarFilaBancada` (A3); `registrarChegadaAcao` e `criarRetiradaAcao` de hoje; `abrirConferenciaAcao` (`src/app/(app)/fluxo/conferencia/acoes.ts`), ou um serviço equivalente que leve a devolução de AGUARDANDO_CONFERENCIA para EM_CONFERENCIA com quem tocou e redirecione para `/fluxo/devolucoes/{codigo}/conferencia`.

- [ ] Testes de componente:
  - o botão grande "Chegou um pacote" abre o campo e a câmera;
  - depois do cartão verde aparecem "Conferir agora" (um por código, se houver mais de um) e "Próximo pacote", que limpa o estado e devolve o foco ao campo;
  - depois do "Dar chegada" pelo pedido aparecem os mesmos dois botões;
  - `nao_encontrada` mostra o título "De onde veio este pacote?" com dois botões do mesmo tamanho:
    - "Do armazém do ML (Full)", com a dica "remetente MELI e 'Ret. ID' na etiqueta", manda o código para `criarRetiradaAcao`;
    - "De cliente, sem cadastro", com a dica "vira não identificada e o Gestor liga depois", manda `intencao=criar_nao_identificada`;
  - o aviso amarelo continua igual;
  - as proteções da câmera da E27 (`guarda.ts`) continuam valendo.
- [ ] `FilaBancada` mostra "Esperando conferência (N)" com "Conferir", as da pessoa com "Continuar" e "Retirada do Full aberta" com "Continuar". Cada lista vazia tem um texto curto.
- [ ] `/bancada` exige `operar_devolucoes`. `/fluxo/recebimento` passa a redirecionar para `/bancada`.
- [ ] Commit.

### Tarefa A5: menu do Gestor

**Arquivos:** `src/app/(app)/fluxo/page.tsx` (`ACOES_FLUXO`) e `src/components/MenuAcoesFluxo.test.tsx`.

- [ ] "Receber pacote" passa a apontar para `/bancada`. "Nova devolução" exige `cadastrar_devolucoes`. "Planilha Volta ao armazém" exige `acompanhar`. "Retiradas do Full" continua com `ver_listas`.
- [ ] Commit.

### Tarefa A6: e2e da frente A

**Arquivos:** `tests/e2e/bancada.spec.ts`, mais os ajustes nos e2e que usam `/fluxo/recebimento` ou o Operador no `/fluxo`.

- [ ] **Celular e computador:**
  - o Operador entra e cai em `/bancada`;
  - a barra só tem "Bancada";
  - `/fluxo` e `/fluxo/devolucoes/nova` levam à Bancada;
  - lê um rastreio e vê o cartão verde; "Conferir agora" abre a conferência;
  - lê um código desconhecido e vê "De onde veio este pacote?":
    - "Do armazém do ML (Full)" abre uma RF-…;
    - em outro pacote, "De cliente, sem cadastro" cria a não identificada.
- [ ] Gestor: o menu "Receber pacote" abre `/bancada`.
- [ ] Bateria da frente: typecheck, lint, `npm test`, `npm run test:int`, depois o e2e inteiro na porta da worktree. Commit.

---

## Frente B: Corrigir (Gestor) e Apagadas (branch `corrigir-gestor`)

### Tarefa B1: migração 0018 e rótulos

**Arquivos:**
- `src/db/schema/devolucoes.ts` e `src/db/schema/retiradas.ts`: `apagadaEm` (timestamptz, nulo), `apagadaPor` (uuid, nulo, FK `usuarios`) e `expurgadaEm` (timestamptz, nulo). `expurgadaEm` só nas devoluções;
- `npx drizzle-kit generate --name apagadas` → `drizzle/0018_*.sql`. Confira o journal e o snapshot;
- os rótulos novos em `src/modules/historico/rotulos/`:
  - `devolucao_apagada`, `devolucao_restaurada`, `destino_trocado`, `conferencia_reaberta`, `chegada_desfeita` e `dados_corrigidos`;
  - `retirada_apagada`, `retirada_restaurada` e `retirada_reaberta`.

- [ ] Teste: a migração aplica do zero no banco de teste, e os rótulos aparecem em `rotuloDaAcao`.
- [ ] Commit.

### Tarefa B2: nada mostra o que está apagado

**Arquivos:**
- criar `src/modules/apagadas/filtro.ts`, com `devolucaoVisivel = isNull(devolucoes.apagadaEm)` e `retiradaVisivel = isNull(retiradasFull.apagadaEm)`;
- aplicar em todas as consultas que listam, contam ou acham devolução ou retirada. Procure `from(devolucoes)`, `from(retiradasFull)` e os `join`. Ao menos:
  - quadro e etapas (`quadro.ts`), busca (`busca.ts`), reputação (`reputacao.ts`) e alertas (`src/modules/acabamento/alertas.ts`);
  - recebimento: rastreio, pedido e envio (`recebimento.ts`) e `codigosAtivosPorPedido` (`criar.ts`);
  - Conferir pacote, planilha Volta ao armazém (`src/modules/volta-armazem/consulta.ts`), contestações, lotes e dossiê (recusa gerar para apagada);
  - retiradas (`src/modules/retiradas/consultas.ts`) e o `criarRetirada` (a ABERTA apagada com o mesmo código **não** é reaproveitada).
- A sincronização do ML (`src/modules/mercado-livre/sincronizar.ts`) continua achando a linha apagada pela reclamação: **não cria outra e não limpa `apagada_em`**.

- [ ] Teste `int` (`src/modules/apagadas/filtro.int.test.ts`): cria uma devolução normal e uma apagada em cada lista relevante e chama cada função de consulta. Só a normal aparece. A leitura do rastreio da apagada dá "não encontrada".
- [ ] Teste `int` da sincronização: a reclamação de uma devolução apagada chega de novo, e nada é criado; ela continua apagada.
- [ ] Commit.

### Tarefa B3: correções da devolução

**Arquivos:** criar `src/modules/devolucoes/correcoes.ts` e `correcoes.int.test.ts`; mexer em `transicoes.ts`, `transicoes-item.ts`, `excecoes.ts` e nos testes deles.

**Produz** (todas exigem perfil GESTOR, rodam numa transação com `FOR UPDATE` na devolução e gravam evento com `antes` e `depois`):
```ts
export async function trocarDestinoItem(db: Db, itemId: string, destino: DestinoItem, motivo: MotivoItem | null, usuario: UsuarioSessao): Promise<void>;
export async function reabrirConferencia(db: Db, devolucaoId: string, usuario: UsuarioSessao): Promise<void>;
export async function desfazerChegada(db: Db, devolucaoId: string, usuario: UsuarioSessao): Promise<void>;
export async function corrigirDados(db: Db, devolucaoId: string, campos: CamposCorrigiveis, usuario: UsuarioSessao): Promise<void>;
export async function apagarDevolucao(db: Db, devolucaoId: string, usuario: UsuarioSessao): Promise<void>;
export async function restaurarDevolucao(db: Db, devolucaoId: string, usuario: UsuarioSessao): Promise<void>;
export type CamposCorrigiveis = {
  observacao?: string;
  rastreio?: string; // só origem MANUAL ou PLANILHA
  itens?: { itemId: string; produtoRecebidoId?: string; observacao?: string }[];
};
```
- `encerrarPendente` (`excecoes.ts`) passa a aceitar AGUARDANDO_CONFERENCIA, EM_CONFERENCIA e AGUARDANDO_NF, só para o Gestor, e solta a trava;
- regras novas em `REGRAS_TRANSICAO`, quem é o Gestor:
  - AGUARDANDO_NF → AGUARDANDO_CONFERENCIA;
  - AGUARDANDO_CONFERENCIA, EM_CONFERENCIA e AGUARDANDO_NF → PENDENTE_CHEGADA ou NO_CD_MARKETPLACE;
  - AGUARDANDO_CONFERENCIA, EM_CONFERENCIA e AGUARDANDO_NF → CANCELADA ou EXTRAVIADA.

**Casos de teste (cada um com o seu teste `int`):**
1. **`trocarDestinoItem`:**
   - antes da NF, BOM → PROBLEMA exige motivo diferente de AUSENTE (CHECK `itens_destino_motivo`), e PROBLEMA → BOM limpa o motivo;
   - depois da NF, BOM (DISPONIVEL_VENDA) → PROBLEMA põe o item no lote ABERTO do fornecedor do `produto_recebido`. Use a mesma função da autorização da NF (`src/modules/lotes/alocacao.ts` e `porta.ts`) e crie o lote se não houver;
   - PROBLEMA (EM_LOTE em lote ABERTO) → BOM tira o item do lote e o leva a DISPONIVEL_VENDA;
   - item ENVIADO ou RESOLVIDO, ou num lote que não está ABERTO, é recusado com mensagem;
   - ao ir para PROBLEMA, abre a contestação AGUARDANDO_GESTOR como o fim da conferência faria. Ao voltar para BOM, a contestação AGUARDANDO_GESTOR é descartada; a enviada fica e a função devolve um aviso.
2. **`reabrirConferencia`:** só a partir de AGUARDANDO_NF, sem NF autorizada. Vai para AGUARDANDO_CONFERENCIA, e os itens, as evidências e os destinos ficam. A contestação AGUARDANDO_GESTOR é descartada.
3. **`desfazerChegada`:**
   - a partir de AGUARDANDO_CONFERENCIA, EM_CONFERENCIA ou AGUARDANDO_NF, sem NF autorizada;
   - volta para PENDENTE_CHEGADA, ou para NO_CD_MARKETPLACE se o evento da chegada diz que veio do armazém (E25);
   - limpa quem e quando recebeu e a trava;
   - descarta as fotos do pacote, a conferência (destinos, motivos e evidências da conferência, inclusive as mídias pelo armazenamento) e a contestação AGUARDANDO_GESTOR;
   - recusa a não identificada.
4. **`corrigirDados`:**
   - corrige o produto recebido de cada unidade e as observações;
   - o rastreio só onde a origem não é `API`; nas do ML, o servidor recusa os campos que vêm do ML;
   - o motivo do item muda pelo `trocarDestinoItem`;
   - a quantidade (cada item é uma unidade) se corrige reabrindo a conferência e marcando a unidade como AUSENTE, como a conferência já faz.
5. **`encerrarPendente` estendido:** cancela e marca extraviada nas três etapas novas e recusa depois da NF autorizada.
6. **`apagarDevolucao` e `restaurarDevolucao`:**
   - recusa se houver NF de devolução autorizada;
   - grava `apagada_em` e `apagada_por`, solta a trava e esconde a contestação dela;
   - restaurar limpa a marca, e o status fica o mesmo;
   - funciona também numa do ML.
7. **Perfil:** OPERADOR e FISCAL recebem erro em todas as funções.

- [ ] Um teste por caso: vê-lo falhar, implementar, vê-lo passar. Commit por grupo (destino; reabrir e desfazer; dados; encerrar; apagar).

### Tarefa B4: correções da retirada

**Arquivos:** criar `src/modules/retiradas/correcoes.ts` e `correcoes.int.test.ts`.

**Produz:** `reabrirRetirada`, `apagarRetirada` e `restaurarRetirada`, com `(db, retiradaId, usuario)` e só para o GESTOR.
- `reabrirRetirada`: CONFERIDA → ABERTA, limpando `concluida_em` (CHECK `retiradas_full_concluida`). A retirada volta a aceitar itens e quantidades;
- `apagarRetirada`: as devoluções que tiveram chegada pela etiqueta amarela dela não mudam.

- [ ] Testes `int`: as três funções, o perfil e a planilha Volta ao armazém sem os itens da retirada apagada. Commit.

### Tarefa B5: seção "Corrigir (Gestor)" nas telas

**Arquivos:**
- `src/app/(app)/fluxo/devolucoes/[codigo]/AcoesGestor.tsx` e `acoes.ts` (+ testes): a seção passa a se chamar "Corrigir (Gestor) (extra)" e junta o encerrar de hoje com as correções novas;
- `src/app/(app)/fluxo/retiradas-full/[codigo]/page.tsx`, `TelaRetirada.tsx` e `acoes.ts`: a seção da retirada, com "Reabrir" e "Apagar".

**Comportamento:**
- cada correção aparece só quando o status permite;
- "Trocar estoque" fica em cada item, com o motivo quando vai para Problema;
- apagar, desfazer, cancelar e extraviar usam o passo de confirmação da E24: botão vermelho, `useTravaToqueDuplo` e um texto que diz o que será descartado;
- a mensagem de recusa do servidor aparece num alerta;
- depois de apagar, vai para `/fluxo` com o aviso "DEV-… apagada. Ela fica em Apagadas por 90 dias.";
- só o Gestor vê a seção; a ação do servidor exige `administrar`.

- [ ] Testes de componente: cada botão por status; a confirmação; o perfil. Commit.

### Tarefa B6: lista Apagadas

**Arquivos:** criar `src/app/(app)/fluxo/apagadas/page.tsx`, `acoes.ts`, `ListaApagadas.tsx` (+ testes) e `src/modules/apagadas/consultas.ts` (+ `int`). Em `ACOES_FLUXO` entra `{ permissao: 'administrar', href: '/fluxo/apagadas', quando: 'Apagou algo por engano', rotulo: 'Apagadas', icone: 'lixeira' }`. O `IconeAcao` de `src/components/MenuAcoesFluxo.tsx` ganha `'lixeira'`, no traço dos outros ícones (viewBox 24, `stroke`).

**A lista mostra:**
- as devoluções e as retiradas apagadas e não expurgadas, as mais recentes primeiro;
- em cada uma: o código, o status em que estava, quem apagou, quando e "some de vez em N dias";
- o botão "Restaurar", que chama `restaurarDevolucao` ou `restaurarRetirada`.

- [ ] Testes. Commit.

### Tarefa B7: tarefa diária dos 90 dias

**Arquivos:** criar `src/modules/apagadas/expurgo.ts` e `expurgo.int.test.ts`; registrar no worker e no agendamento, no mesmo lugar e do mesmo jeito que `midia.retencao` (`src/modules/midia/limpeza.ts`).

**Produz:** `expurgarApagadas(db, armazenamento, agora = new Date()): Promise<{ devolucoes: number; retiradas: number }>`, com o nome de tarefa `apagadas.expurgo`, uma vez por dia.

**O que apaga (só o que tem `apagada_em` há mais de 90 dias):**
- na **devolução que não é do ML:** apaga de vez a linha, os itens, as evidências com as mídias (pelo armazenamento do provedor, E15) e os eventos dela;
- na **do ML:** apaga os itens, as evidências e as mídias, e mantém a linha com `expurgada_em` e o vínculo da reclamação. Ela sai da lista Apagadas, e a sincronização continua sem recriá-la;
- na **retirada:** apaga a linha, os itens, as evidências e as mídias.

- [ ] Testes `int`:
  - com 89 dias, nada muda; com 91 dias, tudo sai;
  - a do ML fica expurgada, e uma nova sincronização da reclamação não cria nada;
  - a falha ao apagar um arquivo não para as outras.
- [ ] Commit.

### Tarefa B8: e2e da frente B

**Arquivos:** `tests/e2e/corrigir-gestor.spec.ts`. Use os apoios que já existem, como `tests/e2e/apoio-conferencia.ts` e o da NF falsa.

- [ ] **Celular e computador, Gestor:**
  - troca Bom → Problema de um item depois da NF e vê o item no lote do fornecedor;
  - desfaz uma chegada e vê a devolução de volta em "Esperando chegada";
  - apaga e restaura uma devolução e uma retirada pela lista Apagadas.
- [ ] O Operador e o Fiscal não veem a seção.
- [ ] Bateria da frente: typecheck, lint, `npm test`, `npm run test:int` e o e2e inteiro. Commit.

---

## Integração (branch `integracao-27-11`)

### Tarefa I1: juntar as duas frentes
- [ ] Partindo de `bancada-gestor`, faça o merge de `bancada-operador` e de `corrigir-gestor`.
- [ ] **Conflitos esperados:** o `ACOES_FLUXO` (os dois menus) e os e2e que usam `/fluxo/recebimento`.
- [ ] Em `listarFilaBancada`, use `devolucaoVisivel` e `retiradaVisivel`. O teste `int` da fila ganha uma apagada que não aparece.
- [ ] Na Bancada, a leitura de uma devolução apagada dá "De onde veio este pacote?".
- [ ] Bateria completa, nesta ordem e nunca duas suítes de banco ao mesmo tempo: typecheck, lint, `npm test`, `npm run test:int`, `npm run test:e2e` e `npm run test:e2e:bitbrain`.
- [ ] Atualize a E29 com o "Como ficou" e o andamento. Commit.

## Publicação (depois da aprovação do usuário)
- Backup do banco na VPS, depois `IMAGEM_TAG=<sha> dc pull` e `up -d web worker`.
- Conferir 19 migrações e `/api/saude`.
- O usuário confere no celular com um Operador e um Gestor.
