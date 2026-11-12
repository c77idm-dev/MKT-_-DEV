# Fase 3 (Mercado Livre): Plano de Implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar este plano tarefa por tarefa. Os passos usam checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** ligar o Mercado Livre ao sistema. O Gestor conecta a conta por OAuth em Configurações › Mercado Livre, e os tokens ficam cifrados e se renovam sozinhos. Os avisos do ML e uma varredura a cada 15 min trazem as devoluções para o fluxo pelo `criarDevolucao` (origem `API`). Uma devolução manual do mesmo pedido é vinculada (D9), e `low_cost` só fica registrado para consulta (D10). No fim da conferência, se todos os itens forem BOM, o "OK" vai sozinho ao ML. Se algum item for PROBLEMA ou AUSENTE, nasce uma contestação AGUARDANDO_GESTOR com as fotos, que o Gestor revisa na tela "Contestações ML" e manda com "Enviar ao ML". O detalhe da devolução ganha a seção "Mercado Livre". O critério de pronto da spec §14 é: "Devolução real do ML entra sozinha; contestação enviada pelo Gestor". Nesta fase ele é cumprido com o **ML falso**. A parte "real" fica na etapa "Ligação das contas reais" (contrato §9, no fim deste plano).

**Arquitetura:**
- **Conector:** o que fala com a API do ML fica em `src/conectores/marketplace/mercadolivre/`:
  - cliente HTTP, OAuth e esquemas zod;
  - **mapeamento puro** `mapearReclamacao(json) → DadosDevolucaoML`;
  - `ConectorML`, que implementa `MarketplaceConnector` (contrato §5.3);
  - o **falso**, que troca só o `fetch` e deixa o conector, o OAuth e o mapeamento reais rodarem sobre respostas montadas a partir da documentação.
- **Regras:** ficam em `src/modules/mercado-livre/`:
  - contas e tokens (com trava);
  - sincronização (criar, vincular, atualizar e status da spec §7.3);
  - avisos, varredura, resultado da conferência e contestações.
  - O núcleo nunca chama a API direto (spec §4.3): só `obterConector(db, 'MERCADO_LIVRE')`.
- **Tarefas de fundo:** rodam no worker da P2 (`src/worker/manipuladores/mercado-livre.ts`), pelas tarefas `ml.*` do contrato §5.1. Todo manipulador é idempotente.
- **Telas:** são mobile-first (390×844 primeiro), com cartões, toque ≥ 44 px e formulário de uma coluna com rodapé fixo.

**Tecnologias:** Next.js 16.4.6 (App Router), React 19.3, TypeScript strict, Drizzle ORM 0.45 + postgres.js 4, zod 4, Tailwind v4, Vitest 5, Testing Library e Playwright. **Nenhuma dependência nova:** `fetch`, `FormData`, `Blob`, `AbortSignal.timeout` e `node:crypto` (AES-256-GCM) já vêm no Node 24.

**Spec:** [docs/superpowers/specs/2026-11-11-gestao-devolucoes-design.md](../specs/2026-11-11-gestao-devolucoes-design.md). Leia antes de começar:
- §5.1 (ContaMarketplace, ContestacaoCanal) e §5.2;
- §6.3, §6.6 e §6.9;
- §7 inteiro (§7.1 a §7.6);
- §10, §11 e §14.

**Contrato (vinculante):** [2026-11-12-contrato-fases-2-6.md](2026-11-12-contrato-fases-2-6.md). Valem ao pé da letra:
- §3, quem é dono de cada arquivo;
- §4.2, as tabelas;
- §4.6 e §4.7, os status e o histórico;
- §5.1, a fila;
- §5.3, os conectores;
- §5.4, o fim da conferência;
- §5.5, o `criarDevolucao`;
- §5.8, a NF de venda;
- §6, o isolamento;
- §7, a integração;
- as decisões D8, D9, D10 e D17.

## Restrições globais

**Onde trabalhar (contrato §6)**
- Trabalhe na worktree `C:/Users/idmpc/devolucoes-wt/fase-3`, branch `fase-3-mercado-livre`, que parte do `main` com a **Parte A da Fase 2 (P2)** já mergeada. **Não recrie nada da P2:**
  - fila, worker e armazenamento;
  - tipos do conector e `registro.ts`;
  - os arquivos de schema vazios;
  - as variáveis do `.env` e as `secoes/*`.
- O `.env` da worktree traz:
  - `DATABASE_URL=postgres://devolucoes:devolucoes@localhost:5432/devolucoes_f3`;
  - `DATABASE_URL_TEST=postgres://devolucoes:devolucoes@localhost:5432/devolucoes_test_f3`;
  - `PORTA_E2E=3103`;
  - `ML_CONECTOR=falso`.
  - O `next dev` sobe com `npm run dev -- --port 3003`.
- Windows com Git Bash. O caminho tem espaço e "ç": **sempre use aspas**. Os comandos deste plano rodam na raiz da worktree: `cd "/c/Users/idmpc/devolucoes-wt/fase-3"`.
- Banco: PostgreSQL 17 nativo no Windows (não há Docker no PC).
  - `npm run db:gerar` gera a migração; `npm run db:migrar` aplica no banco de dev da fase.
  - `npm run test:int` aplica as migrações no banco de testes sozinho.

**Next.js 16.4.6** (mudanças em relação ao que você conhece; veja `AGENTS.md` e `node_modules/next/dist/docs/`):
- `params` e `searchParams` são **Promise** (`const { id } = await params`).
- `redirect()` lança exceção: chame **fora** do `try/catch`. Ele aceita URL absoluta, o que serve para mandar ao site do ML.
- `cookies()` é assíncrono. Grave cookies só em Server Action ou Route Handler (`(await cookies()).set(...)`).
- Um arquivo `'use server'` só exporta funções async; exportar `type` pode.
- Depois de gravar e continuar na mesma página, chame `revalidatePath(caminho)`.

**Contrato: quem mexe em quê (§3)**
- **Desta fase:**
  - `src/db/schema/mercado-livre.ts` e `src/db/schema/notificacoes.ts`;
  - `src/modules/mercado-livre/*` e `src/conectores/marketplace/mercadolivre/*`;
  - o **corpo** de `src/conectores/marketplace/registro.ts`;
  - `src/worker/manipuladores/mercado-livre.ts`;
  - `src/modules/historico/rotulos/mercado-livre.ts`;
  - `src/modules/devolucoes/criar.ts` (dono na janela);
  - `src/app/(app)/contestacoes/**` e `src/app/(app)/configuracoes/mercado-livre/**`;
  - `src/app/(app)/fluxo/devolucoes/[codigo]/secoes/SecaoMercadoLivre.tsx`;
  - `src/app/api/ml/**`;
  - `src/components/mercado-livre/*`;
  - `tests/helpers/fabricas-ml.ts`, `tests/e2e/apoio-ml.ts` e `tests/e2e/mercado-livre.spec.ts`;
  - `tests/fixtures/ml/doc/*` e `tests/fixtures/ml-falso/*`.
  - Arquivos novos em `src/lib/` (`cifra.ts`, `limite-taxa.ts`) não colidem com ninguém.
- **Congelados** (não toque; se precisar, é emenda no `main`):
  - `src/db/schema/index.ts`, `devolucoes.ts`, `catalogo.ts` e `auth.ts`;
  - `dominio.ts`, `transicoes.ts` e `transicoes-item.ts`;
  - `NavAbas.tsx` e `permissoes.ts`;
  - `src/lib/env.ts`, `.env.example` e `.env.producao.example`;
  - `package.json` (`scripts`);
  - `tests/e2e/global-setup.ts`, `apoio.ts` e `dados.ts`, e `tests/helpers/fabricas.ts`;
  - `[codigo]/page.tsx` e `detalhe.ts`;
  - `configuracoes/page.tsx`;
  - `src/components/*` existentes, `globals.css` e `layout.tsx`;
  - `Dockerfile` e `docker-compose.prod.yml`.
- **Migrações:** gere à vontade na branch com `--name fase3_mercado_livre`. Antes do merge, a Tarefa 17 descarta e regenera uma só (contrato §3, "Procedimento das migrações").

**Produto e textos**
- A interface fica só em **português do Brasil**. Os nomes do PDF valem: "Foto 1" a "Foto 4", "Vídeo de Prova", e as etapas.
- O que vai além do PDF/spec está marcado **(extra)**.
- Sem dados de demonstração em produção. Os testes criam o que precisam com fábricas (`tests/helpers/fabricas-ml.ts`).

**Mobile-first (exigência do usuário: "esse sistema é focado para celular, então ele tem que ficar perfeito para o usuário final")**
- Toda tela desta fase nasce em **390×844** e cresce para o computador (`md:` = 768 px ou mais).
- **Sem rolagem lateral** da página. Uma faixa que rola por dentro (os filtros de Contestações) é permitida. Textos longos (ids, mensagens do ML) usam `break-all` ou `[overflow-wrap:anywhere]`.
- **Listas são cartões**, nunca tabelas.
- Formulários ficam em **uma coluna**, com o botão principal num **rodapé fixo** (`RodapeFormulario`). Quando chegam erros, a lista de erros **recebe o foco** (`useEnvioFormulario` + `ListaErros`).
- Áreas de toque têm **no mínimo 44 px** (`min-h-11`) e nada depende de passar o mouse. Contraste de texto **≥ 4,5:1**: use só as classes de cor do `globals.css` (`text-texto`, `text-texto-2`, `text-erro`, `text-atencao`, `text-bom`, `text-destaque`).
- Ação sem volta ("Desconectar", "Enviar ao ML") pede um **segundo toque** (`BotaoConfirmar`), como "Desativar" em Usuários.
- `font-mono` vai nos códigos: DEV, pedido, ID da reclamação e da devolução no ML, rastreio e ID do vendedor.

**Segurança e LGPD (spec §10)**
- A permissão é checada **no servidor** em toda página e ação: `exigirPermissao('administrar')` em Contestações e Configurações › Mercado Livre (spec §6.9). A seção do detalhe usa `ver_listas`, como a página.
- Os tokens do ML ficam **cifrados** (AES-256-GCM, `CHAVE_CRIPTOGRAFIA`). A resposta do token é validada com zod, e nenhum erro ou log guarda um token.
- OAuth com `state` num cookie cifrado, `httpOnly`, `sameSite=lax`, de 10 min, preso ao Gestor que pediu. Usa PKCE quando `ML_USAR_PKCE=true`.
- O aviso do ML é só um gatilho: o sistema sempre busca o recurso de novo na API (spec §7.2). O endpoint público `/api/ml/notificacoes` tem **limite por IP**.
- **LGPD:** nada do comprador é gravado nesta fase (só ids, status e datas). Todo log de erro do ML passa por `resumirCorpoErro` (que redige dados pessoais).

**Testes e commits**
- Faça TDD: escreva o teste, veja falhar, implemente, veja passar.
  - Unitário (`npm test`): `src/**/*.test.{ts,tsx}`.
  - Integração (`npm run test:int`): `src/**/*.int.test.ts`, no banco `devolucoes_test_f3`. O `tests/setup/int-setup.ts` da P2 instala os falsos por padrão.
  - Ponta a ponta (`npm run test:e2e`): `tests/e2e/*.spec.ts`, nos projetos `computador` e `celular` (Pixel 7 em 390×844). A P2 sobe o servidor de produção na porta 3103 e o worker (`global-setup.ts`). Pare o `npm run dev` antes.
- Toda mensagem de commit termina com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. **Nunca rode `git push`.**

## Nomes que este plano usa da Parte A (P2)

O contrato fixa os nomes abaixo. Os marcados com **(nome suposto)** não estão escritos no contrato: confira no `main` e, se a P2 usou outro nome, troque só o import, sem mudar o comportamento.

| O quê | Nome | Onde |
|---|---|---|
| Fila | `obterFila()`, `definirFilaParaTestes(f)`, `class FilaMemoria` (campo `enviadas`), `type Fila`, `type OpcoesEnvio` | `@/modules/fila/fila` |
| Tarefas | `CONFIG_TAREFAS`, `type NomeTarefa`, `type DadosTarefa` | `@/modules/fila/tarefas` |
| Worker | `type ContextoTarefa = { db; fila; agora; tentativa }`, `type Manipuladores` | `src/worker/tipos.ts` |
| Manipuladores do ML | `export const manipuladoresMercadoLivre: Manipuladores` **(nome suposto, padrão `manipuladores<Area>`)** | `src/worker/manipuladores/mercado-livre.ts` |
| Armazenamento | `obterArmazenamento()` com `salvar`, `ler`, `urlTemporaria`, `existe` | `@/modules/midia/armazenamento` |
| Conectores | `type MarketplaceConnector`, `DevolucaoExterna`, `ResultadoConferencia`, `MotivoCanal` | `@/conectores/marketplace/tipos` |
| Registro | `obterConector(db, canal)`, `definirConectorParaTestes(canal, c)` | `@/conectores/marketplace/registro` |
| Tabela `evidencias` | `evidencias` com `id, devolucaoId, itemId, tipo, tipoConteudo, caminho, provedor, tamanhoOriginal, tamanho, sha256Original, sha256Final, situacaoProcessamento, idCliente, enviadoEm, processadoEm` (camelCase de §4.1; `tamanhoOriginal`/`tamanho` supostos em `mode: 'number'`) | `@/db/schema` |
| Colunas novas | `itensDevolucao.destino`, `.motivo`, `.observacao`, `.status`; `devolucoes.conferidaEm`, `.concluidaEm` | `@/db/schema` |
| Vocabulário | `type MotivoItem`, `type DestinoItem` **(nomes de tipo supostos, derivados de `MOTIVOS_ITEM` e `DESTINOS_ITEM`)** | `@/modules/devolucoes/dominio` |
| Histórico | `EntidadeHistorico` já com `'conta_marketplace'` e `'contestacao'` | `@/modules/historico/eventos` |
| Rótulos do ML | objeto exportado por `src/modules/historico/rotulos/mercado-livre.ts` **(nome do export não fixado)** | idem |
| Seção do detalhe | `SecaoMercadoLivre(props: { devolucaoId; codigo; status; usuario })`, componente de servidor async | `[codigo]/secoes/SecaoMercadoLivre.tsx` |
| Variáveis | `lerEnv()` com `ML_CONECTOR`, `ML_CLIENT_ID`, `ML_CLIENT_SECRET`, `ML_REDIRECT_URI`, `ML_USAR_PKCE`, `CHAVE_CRIPTOGRAFIA` | `@/lib/env` |
| Conferência (só a Tarefa 17) | `concluirConferencia(db, devolucaoId, usuario, agora?)` | `@/modules/conferencia/concluir` |

## Suposições sobre a API do ML (não verificadas)

O site `developers.mercadolivre.com.br` (e os espelhos `mercadolibre.com.ar` e `global-selling`) recusam leitura automática (HTTP 403).

**Confirmado por busca** em 2026-11-12, em trechos da documentação oficial:
- o endpoint único `POST /post-purchase/v1/returns/{return_id}/return-review`, para revisão boa e com problema;
- `GET /post-purchase/v1/returns/reasons?flow=seller_return_failed&claim_id=`;
- `POST /post-purchase/v1/claims/{claim_id}/returns/attachments`, chamado uma vez por foto;
- `GET /post-purchase/v2/claims/{claim_id}/returns`;
- as ações `return_review_ok` e `return_review_fail`.

**O resto vem da spec §7 (pesquisa de 2026-11-11) e é suposição.** Cada item está isolado numa função pura ou num esquema zod, para a etapa de ligação ajustar barato:

| # | Suposição | Onde está isolada |
|---|---|---|
| A1 | Reclamação: `players[].available_actions[]` traz `{ action, due_date }`; `related_entities` contém `"return"` ou `"returns"`; troca = `type: "change"` | `esquemas.ts`, `prazoDaReclamacao`, `ehTroca` |
| A2 | Devolução v2: `shipments[].destination.name` (`seller_address` ou `warehouse`), `shipments[].type` (`return` ou `return_from_triage`), `orders[].return_quantity` em texto (`"1.0"`), `subtype: "low_cost"`. A resposta pode ser objeto ou lista | `esquemas.ts`, `escolherEnvio`, `mapearReclamacao` |
| A3 | Pedido: `order_items[].item.seller_sku` (ou `seller_custom_field`) | `skuDoPedido` |
| A4 | Anúncio: GTIN em `attributes[]` ou `variations[].attributes[]` com `id: "GTIN"` | `gtinDoAnuncio` |
| A5 | Envio (`x-format-new: true`): `tracking_number`, `tracking_method` (a transportadora) e `status_history.date_delivered` | `mapearReclamacao` |
| A6 | Revisão com problema: corpo `[{ reason_id, message, attachments: [file_name], order_id? }]` (a spec escreve `reason`); OK = `{}` | `corpoRevisaoComProblema` |
| A7 | Anexo: multipart com o campo `file`; a resposta traz `{ file_name }` | `ConectorML.enviarResultadoConferencia`, `esquemaArquivoEnviado` |
| A8 | Motivos: lista de `{ id }` (`SRF2`…); fora desse formato, a validação é pulada | `ConectorML.motivosAceitos` |
| A9 | Limites: mensagem até 2000 caracteres e até 10 fotos; foto JPG até 5 MB (este último é da spec) | `LIMITE_MENSAGEM`, `MAX_FOTOS_CONTESTACAO`, `LIMITE_FOTO_ML_BYTES` |
| A10 | NF de venda: `GET /users/{seller}/invoices/orders/{pedido}` (ou `/invoices/orders/{pedido}`) → `{ id }`; XML em `GET /users/{seller}/invoices/documents/xml/{id}/authorized` | `ConectorML.obterXmlNotaVenda` |
| A11 | Busca de reclamações: `paging.total`, `data[].id`, `data[].last_updated` e `data[].related_entities` | `esquemaBuscaReclamacoes` |
| A12 | Aviso: `{ _id, resource: "/post-purchase/v1/claims/{id}", user_id, topic: "post_purchase", application_id }` | `idReclamacaoDoRecurso`, `aceitarNotificacaoML` |
| A13 | Erros do OAuth com `error: "invalid_grant"` ou `"invalid_operator_user_id"` no corpo | `codigoErroML` |
| A14 | O 429 pode vir sem `Retry-After` | `esperaDo429` |

## Decisões desta fase (onde a spec e o contrato são omissos; o usuário pode vetar)

1. **`obter(idExterno)`** do `MarketplaceConnector` recebe o **claim_id** (o aviso traz a reclamação). `enviarResultadoConferencia(idExterno)` recebe o **return_id** (é o que o `return-review` pede).
2. **`statusCanal`** fica gravado como `"<return.status>/<status do envio>"` (ex.: `shipped/shipped`), ou só `<return.status>` quando não há envio. A tradução da spec §7.3 usa a parte antes da barra.
3. Uma devolução que o ML já mostra **cancelada ou extraviada** na primeira vez que o sistema a vê **não vira devolução**: fica só em `reclamacoes_ml`.
4. **A varredura só enfileira:** ela lista as reclamações e manda uma `ml.sincronizar-reclamacao` para cada uma (cada uma com as suas tentativas). A janela da primeira varredura é de **30 dias**; depois, desde a última sincronização menos 10 min.
5. **Token:** renova sob demanda quando faltam menos de 5 min, e a tarefa `ml.renovar-token` renova o que vence em menos de 2 h. Um **401** força uma renovação e repete a chamada uma vez. A renovação trava a linha da conta, então não acontecem duas ao mesmo tempo (spec §7.1). Um `invalid_grant` leva a conta a **RECONECTAR**.
6. Existe **uma conta do ML por vez**. "Desconectar" apaga os tokens (o ML não tem uma API de revogação para o app).
7. **Contestação (D8):**
   - O texto inicial é montado a partir dos itens com problema. O Gestor pode trocar o motivo, a mensagem e as fotos (spec §6.6).
   - Vão para o ML as Fotos 1 e 2, as Fotos 3 e 4 dos itens com problema e as extras, no máximo 10. O vídeo não vai.
   - SRF2 e SRF4 exigem pelo menos 1 foto (spec §7.4).
8. "Enviar ao ML" põe a tarefa na fila. Enquanto ela não termina, o cartão mostra "Enviando ao ML" e o formulário fica travado.
9. **Na última tentativa** da tarefa de envio, a contestação vira **FALHOU** com o motivo, em vez de ficar presa em "Enviando". FALHOU → o Gestor revisa e envia de novo (contrato §4.6).
10. **"OK" recusado pelo ML** (4xx): grava o evento `ml_resultado_ok_recusado` e aparece na seção do detalhe. Não vira contestação.
11. **Sem `devolucao_externa_id`** no fim da conferência: só o evento `ml_resultado_sem_vinculo` (contrato §5.4). Se o vínculo D9 acontecer depois, com a devolução já em AGUARDANDO_NF, a sincronização manda `ml.enviar-resultado` de novo.
12. A devolução vinda da API **não confere o pacote não identificado** do mesmo rastreio. Ela é criada mesmo assim, e o Gestor resolve, como na Fase 1.
13. **Limite por IP** no aviso: 600 por minuto (folga larga; o ML repete o aviso e a varredura cobre).
14. O **EAN** que vem do anúncio do ML fica só no `DevolucaoExterna` (não há coluna para ele no contrato §4.1).
15. **(extra)** Configurações › Mercado Livre mostra:
    - os endereços para configurar o app no ML Developers (retorno e notificações) e as permissões da spec §7.1;
    - a lista das devoluções `low_cost` (D10, "para consulta na tela do ML").

## Mapa de arquivos

```
src/
  lib/
    cifra.ts                               AES-256-GCM: tokens e cookie do OAuth (novo)
    limite-taxa.ts                         limite por IP do aviso do ML (novo)
  conectores/marketplace/
    registro.ts                            (corpo) conta ATIVA → ConectorML
    mercadolivre/
      cliente.ts                           + post, postArquivo, getTexto, 429 com espera, 401 com token novo, ids grandes
      oauth.ts                             + zod na resposta do token
      erros.ts                             resumirCorpoErro (movido de scripts/), codigoErroML, logErroML... (novo)
      esquemas.ts                          zod das respostas do ML (novo)
      mapeamento.ts                        mapearReclamacao e funções puras (novo)
      tipos.ts                             ConectorMercadoLivre, DadosDevolucaoML (novo)
      conector.ts                          ConectorML (novo)
      falso.ts                             fetch falso: cenários, OAuth e NF de venda falsos (novo)
      notificacoes.ts                      + idReclamacaoDoRecurso; a gravação sai daqui
  db/schema/
    mercado-livre.ts                       contas_marketplace, contestacoes_canal, reclamacoes_ml
    notificacoes.ts                        + referencia_externa
  modules/mercado-livre/                   (tudo novo)
    dominio.ts config.ts contas.ts fabrica-conector.ts conector.ts status.ts sincronizar.ts
    notificacoes.ts tarefas.ts resultado.ts contestacoes.ts selos.ts oauth-estado.ts conexao.ts consultas.ts
  modules/devolucoes/criar.ts              + origem API (contrato §5.5)
  modules/historico/rotulos/mercado-livre.ts  + 3 chaves com prefixo ml_
  worker/manipuladores/mercado-livre.ts    manipuladores das 5 tarefas ml.*
  components/mercado-livre/BotaoConfirmar.tsx, Dado.tsx
  app/
    api/ml/notificacoes/route.ts           limite por IP + fila
    api/ml/retorno/route.ts                retorno do OAuth (novo)
    (app)/configuracoes/mercado-livre/     page.tsx, acoes.ts, AcoesConta.tsx
    (app)/contestacoes/                    page.tsx, [id]/page.tsx, [id]/acoes.ts, [id]/FormularioContestacao.tsx
    (app)/fluxo/devolucoes/[codigo]/secoes/SecaoMercadoLivre.tsx
scripts/ml/selecao.ts, spike.ts            resumirCorpoErro passa a vir do conector
tests/
  fixtures/ml/doc/*.json                   respostas montadas a partir da documentação
  fixtures/ml-falso/cenarios.json          cenários do ML falso
  helpers/fabricas-ml.ts
  e2e/apoio-ml.ts, e2e/mercado-livre.spec.ts
```

---

### Tarefa 1: Vocabulário e tabelas do Mercado Livre

**Arquivos:**
- Criar: `src/modules/mercado-livre/dominio.ts`
- Modificar (substituir o `export {};` da P2): `src/db/schema/mercado-livre.ts`
- Modificar: `src/db/schema/notificacoes.ts` (coluna `referencia_externa`)
- Modificar (acrescentar 3 chaves): `src/modules/historico/rotulos/mercado-livre.ts`
- Gerado: `drizzle/00NN_fase3_mercado_livre.sql`
- Testes: `src/modules/mercado-livre/dominio.test.ts`, `src/modules/mercado-livre/tabelas.int.test.ts`

**Interfaces:**
- Consome: `type MotivoCanal` (`@/conectores/marketplace/tipos`, P2), `type MotivoItem` (`@/modules/devolucoes/dominio`, P2), `canalEnum` e `devolucoes` (`src/db/schema/devolucoes.ts`), `usuarios`.
- Produz:
  - em `src/modules/mercado-livre/dominio.ts` (sem `@/`; o schema importa):
    - `SITUACOES_CONTA`, `type SituacaoConta`, `ROTULO_SITUACAO_CONTA`;
    - `STATUS_CONTESTACAO`, `type StatusContestacao`, `ROTULO_STATUS_CONTESTACAO`, `ehStatusContestacao(t): t is StatusContestacao`;
    - `MOTIVOS_CANAL`, `ROTULO_MOTIVO_CANAL`, `MOTIVOS_COM_FOTO_OBRIGATORIA`, `ehMotivoCanal(t): t is MotivoCanal`;
    - `motivoCanalML(m: MotivoItem): MotivoCanal` (contrato §5.4);
    - `LIMITE_SEM_SINCRONIZAR_MS`, `sincronizacaoAtrasada(ultima: Date | null, agora: Date): boolean`;
    - `rotuloStatusML(statusCanal: string | null): string`.
  - Tabelas `contasMarketplace`, `contestacoesCanal` e `reclamacoesMl`; enums `situacaoContaEnum` e `statusContestacaoEnum`; coluna `notificacoesRecebidas.referenciaExterna`.
  - Chaves de histórico `ml_conta_desconectada`, `ml_resultado_sem_vinculo` e `ml_resultado_ok_recusado`.

- [ ] **Passo 1: Escrever os testes que falham**

`src/modules/mercado-livre/dominio.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { motivoCanalML, rotuloStatusML, sincronizacaoAtrasada } from './dominio';

describe('motivoCanalML (spec §7.4, contrato §5.4)', () => {
  it.each([
    ['AVARIADO', 'SRF2'],
    ['INCOMPLETO', 'SRF3'],
    ['DIVERGENTE', 'SRF4'],
    ['AUSENTE', 'SRF5'],
    ['USADO', 'SRF6'],
    ['COM_DEFEITO', 'SRF6'],
    ['OUTRO', 'SRF6'],
  ] as const)('%s → %s', (motivo, canal) => {
    expect(motivoCanalML(motivo)).toBe(canal);
  });
});

describe('sincronizacaoAtrasada (spec §11: alerta depois de 1 hora)', () => {
  const agora = new Date('2026-11-12T12:00:00Z');
  it('sem nenhuma sincronização conta como atrasada', () => {
    expect(sincronizacaoAtrasada(null, agora)).toBe(true);
  });
  it('59 minutos não é atraso; 61 minutos é', () => {
    expect(sincronizacaoAtrasada(new Date('2026-11-12T11:01:00Z'), agora)).toBe(false);
    expect(sincronizacaoAtrasada(new Date('2026-11-12T10:59:00Z'), agora)).toBe(true);
  });
});

describe('rotuloStatusML', () => {
  it('traduz o status da devolução no ML (a parte antes da barra)', () => {
    expect(rotuloStatusML('shipped/shipped')).toBe('A caminho');
    expect(rotuloStatusML('delivered/delivered')).toBe('Entregue');
    expect(rotuloStatusML('cancelled')).toBe('Cancelada no ML');
  });
  it('mostra o valor bruto quando não conhece, e um traço quando não há', () => {
    expect(rotuloStatusML('status_novo/x')).toBe('status_novo');
    expect(rotuloStatusML(null)).toBe('—');
  });
});
```

`src/modules/mercado-livre/tabelas.int.test.ts`:

```ts
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { contasMarketplace, contestacoesCanal, devolucoes, notificacoesRecebidas, reclamacoesMl } from '@/db/schema';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarDevolucaoTeste, criarUsuarioTeste } from '../../../tests/helpers/fabricas';

const { db, sql } = criarDbTeste();
beforeEach(async () => {
  await limparTabelas(sql);
});
afterAll(async () => {
  await sql.end();
});

/** O postgres.js põe o nome da restrição no erro; o Drizzle pode embrulhá-lo em `cause`. */
function restricao(erro: unknown): string | undefined {
  const e = erro as { constraint_name?: string; cause?: { constraint_name?: string } };
  return e.constraint_name ?? e.cause?.constraint_name;
}

async function devolucaoML() {
  const operador = await criarUsuarioTeste(db);
  return criarDevolucaoTeste(db, operador, { canal: 'MERCADO_LIVRE' });
}

describe('tabelas do Mercado Livre (contrato §4.2)', () => {
  it('conta: uma por canal e vendedor, ATIVA por padrão, sem sincronização ainda', async () => {
    const valores = { canal: 'MERCADO_LIVRE' as const, sellerId: '123', accessToken: 'a', refreshToken: 'r', expiraEm: new Date() };
    const [conta] = await db.insert(contasMarketplace).values(valores).returning();
    expect(conta).toMatchObject({ situacao: 'ATIVA', ultimaSincronizacaoEm: null, conectadaPor: null });
    const erro = await db.insert(contasMarketplace).values(valores).catch((e: unknown) => e);
    expect(restricao(erro)).toBe('contas_marketplace_canal_seller_uq');
  });

  it('contestação: uma por devolução, nasce AGUARDANDO_GESTOR, motivo só de SRF2 a SRF6', async () => {
    const d = await devolucaoML();
    const [c] = await db.insert(contestacoesCanal).values({ devolucaoId: d.id, motivoCanal: 'SRF2', mensagem: 'm' }).returning();
    expect(c).toMatchObject({ status: 'AGUARDANDO_GESTOR', evidencias: [], erro: null, revisadoPor: null, enviadaEm: null });

    const repetida = await db.insert(contestacoesCanal).values({ devolucaoId: d.id, motivoCanal: 'SRF3', mensagem: 'm' }).catch((e: unknown) => e);
    expect(restricao(repetida)).toBe('contestacoes_canal_devolucao_id_unique');

    const outra = await devolucaoML();
    const invalida = await db.insert(contestacoesCanal).values({ devolucaoId: outra.id, motivoCanal: 'SRF9', mensagem: 'm' }).catch((e: unknown) => e);
    expect(restricao(invalida)).toBe('contestacoes_canal_motivo');
  });

  it('apagar a devolução apaga a contestação e solta a reclamação (set null)', async () => {
    const d = await devolucaoML();
    await db.insert(contestacoesCanal).values({ devolucaoId: d.id, motivoCanal: 'SRF6', mensagem: 'm' });
    await db.insert(reclamacoesMl).values({ claimId: '5000000001', returnId: '6000000001', devolucaoId: d.id, sincronizadaEm: new Date() });
    await db.delete(devolucoes).where(eq(devolucoes.id, d.id));
    expect(await db.select().from(contestacoesCanal)).toEqual([]);
    const [reclamacao] = await db.select().from(reclamacoesMl);
    expect(reclamacao).toMatchObject({ claimId: '5000000001', devolucaoId: null });
  });

  it('aviso recebido guarda a referência externa (o claim_id)', async () => {
    await db.insert(notificacoesRecebidas).values({ canal: 'mercado_livre', payload: {}, referenciaExterna: '5000000001' });
    const [aviso] = await db.select().from(notificacoesRecebidas);
    expect(aviso.referenciaExterna).toBe('5000000001');
  });
});
```

Rode: `npm test -- src/modules/mercado-livre/dominio.test.ts`
Esperado: FAIL ("Failed to resolve import './dominio'").

- [ ] **Passo 2: Implementar o vocabulário**

`src/modules/mercado-livre/dominio.ts`:

```ts
/**
 * Vocabulário do Mercado Livre (spec §7, contrato §4.2). Sem imports com "@/": o schema importa este arquivo e o
 * drizzle-kit não resolve o alias. Os dois imports abaixo são só de tipo (apagados na compilação).
 */
import type { MotivoCanal } from '../../conectores/marketplace/tipos';
import type { MotivoItem } from '../devolucoes/dominio';

/** Conta do marketplace (spec §7.1): ATIVA ⇄ RECONECTAR. */
export const SITUACOES_CONTA = ['ATIVA', 'RECONECTAR'] as const;
export type SituacaoConta = (typeof SITUACOES_CONTA)[number];
export const ROTULO_SITUACAO_CONTA: Record<SituacaoConta, string> = { ATIVA: 'Ativa', RECONECTAR: 'Reconectar' };

/** Contestação (contrato §4.6): AGUARDANDO_GESTOR → ENVIADA ou FALHOU; FALHOU → AGUARDANDO_GESTOR. */
export const STATUS_CONTESTACAO = ['AGUARDANDO_GESTOR', 'ENVIADA', 'FALHOU'] as const;
export type StatusContestacao = (typeof STATUS_CONTESTACAO)[number];
export const ROTULO_STATUS_CONTESTACAO: Record<StatusContestacao, string> = {
  AGUARDANDO_GESTOR: 'Aguardando o Gestor',
  ENVIADA: 'Enviada ao ML',
  FALHOU: 'Com falha',
};
export function ehStatusContestacao(texto: string): texto is StatusContestacao {
  return (STATUS_CONTESTACAO as readonly string[]).includes(texto);
}

/** Motivos da "revisão com problema" do ML (spec §7.4). */
export const MOTIVOS_CANAL = ['SRF2', 'SRF3', 'SRF4', 'SRF5', 'SRF6'] as const satisfies readonly MotivoCanal[];
export const ROTULO_MOTIVO_CANAL: Record<MotivoCanal, string> = {
  SRF2: 'Produto avariado',
  SRF3: 'Produto incompleto',
  SRF4: 'Produto diferente do anunciado',
  SRF5: 'Produto não veio no pacote',
  SRF6: 'Usado, com defeito ou outro motivo',
};
/** Spec §7.4: avariado (SRF2) e divergente (SRF4) exigem anexo. */
export const MOTIVOS_COM_FOTO_OBRIGATORIA: readonly MotivoCanal[] = ['SRF2', 'SRF4'];
export function ehMotivoCanal(texto: string): texto is MotivoCanal {
  return (MOTIVOS_CANAL as readonly string[]).includes(texto);
}

const MOTIVO_CANAL_DO_ITEM: Record<MotivoItem, MotivoCanal> = {
  AVARIADO: 'SRF2',
  INCOMPLETO: 'SRF3',
  DIVERGENTE: 'SRF4',
  AUSENTE: 'SRF5',
  USADO: 'SRF6',
  COM_DEFEITO: 'SRF6',
  OUTRO: 'SRF6',
};

/** Tradução do motivo do item para o motivo do ML (spec §7.4, contrato §5.4). */
export function motivoCanalML(m: MotivoItem): MotivoCanal {
  return MOTIVO_CANAL_DO_ITEM[m];
}

/** Spec §6.0.1 e §11: alerta quando a última sincronização bem-sucedida tem mais de 1 hora. */
export const LIMITE_SEM_SINCRONIZAR_MS = 60 * 60 * 1000;
export function sincronizacaoAtrasada(ultima: Date | null, agora: Date): boolean {
  return ultima === null || agora.getTime() - ultima.getTime() > LIMITE_SEM_SINCRONIZAR_MS;
}

/** `return.status` do ML (spec §7.3) em português. */
const ROTULO_STATUS_ML: Record<string, string> = {
  pending: 'Aguardando postagem',
  label_generated: 'Etiqueta gerada',
  scheduled: 'Coleta agendada',
  shipped: 'A caminho',
  pending_delivered: 'Entrega em andamento',
  delivered: 'Entregue',
  cancelled: 'Cancelada no ML',
  pending_cancel: 'Cancelamento em andamento',
  expired: 'Expirada',
  pending_expiration: 'Expirando',
  return_to_buyer: 'Voltando ao comprador',
  not_delivered: 'Não entregue',
  failed: 'Falhou no ML',
  pending_failure: 'Falha em andamento',
  closed: 'Encerrada no ML',
};

/** `statusCanal` é "<return.status>/<status do envio>" (decisão 2 do plano): o rótulo vem do status da devolução. */
export function rotuloStatusML(statusCanal: string | null): string {
  if (!statusCanal) return '—';
  const devolucao = statusCanal.split('/')[0];
  return ROTULO_STATUS_ML[devolucao] ?? devolucao;
}
```

Rode: `npm test -- src/modules/mercado-livre/dominio.test.ts`
Esperado: PASS (11 testes).

- [ ] **Passo 3: Tabelas**

`src/db/schema/mercado-livre.ts` (substitui o `export {};` que a P2 deixou):

```ts
import { sql } from 'drizzle-orm';
import { check, index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { SITUACOES_CONTA, STATUS_CONTESTACAO } from '../../modules/mercado-livre/dominio';
import { usuarios } from './auth';
import { canalEnum, devolucoes } from './devolucoes';

export const situacaoContaEnum = pgEnum('situacao_conta', SITUACOES_CONTA);
export const statusContestacaoEnum = pgEnum('status_contestacao', STATUS_CONTESTACAO);

/** Spec §5.1 (ContaMarketplace). Os tokens ficam cifrados com AES-256-GCM (CHAVE_CRIPTOGRAFIA, spec §10). */
export const contasMarketplace = pgTable(
  'contas_marketplace',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    canal: canalEnum('canal').notNull(),
    sellerId: text('seller_id').notNull(),
    accessToken: text('access_token').notNull(),
    refreshToken: text('refresh_token').notNull(),
    expiraEm: timestamp('expira_em', { withTimezone: true }).notNull(),
    situacao: situacaoContaEnum('situacao').notNull().default('ATIVA'),
    escopo: text('escopo'),
    /** Última varredura bem-sucedida: alerta "sincronização parada há mais de 1h" (spec §11). */
    ultimaSincronizacaoEm: timestamp('ultima_sincronizacao_em', { withTimezone: true }),
    conectadaPor: uuid('conectada_por').references(() => usuarios.id, { onDelete: 'set null' }),
    conectadaEm: timestamp('conectada_em', { withTimezone: true }).notNull().defaultNow(),
    atualizadaEm: timestamp('atualizada_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('contas_marketplace_canal_seller_uq').on(t.canal, t.sellerId)],
);

/** Spec §5.1 (ContestacaoCanal): uma por devolução (D8). `evidencias` = ids das fotos (o vídeo não vai ao ML). */
export const contestacoesCanal = pgTable(
  'contestacoes_canal',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    devolucaoId: uuid('devolucao_id')
      .notNull()
      .unique()
      .references(() => devolucoes.id, { onDelete: 'cascade' }),
    motivoCanal: text('motivo_canal').notNull(),
    mensagem: text('mensagem').notNull(),
    evidencias: uuid('evidencias').array().notNull().default(sql`'{}'::uuid[]`),
    prazo: timestamp('prazo', { withTimezone: true }),
    status: statusContestacaoEnum('status').notNull().default('AGUARDANDO_GESTOR'),
    /** Gestor que pediu o envio. AGUARDANDO_GESTOR com revisor = envio pedido, esperando a tarefa. */
    revisadoPor: uuid('revisado_por').references(() => usuarios.id, { onDelete: 'set null' }),
    erro: text('erro'),
    criadaEm: timestamp('criada_em', { withTimezone: true }).notNull().defaultNow(),
    enviadaEm: timestamp('enviada_em', { withTimezone: true }),
    atualizadaEm: timestamp('atualizada_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('contestacoes_canal_status_prazo_idx').on(t.status, t.prazo),
    check('contestacoes_canal_motivo', sql`"motivo_canal" in ('SRF2', 'SRF3', 'SRF4', 'SRF5', 'SRF6')`),
  ],
);

/** Estado da sincronização de cada reclamação do ML (o "mapeamento" da spec §14). `low_cost` fica sem devolução (D10). */
export const reclamacoesMl = pgTable(
  'reclamacoes_ml',
  {
    claimId: text('claim_id').primaryKey(),
    returnId: text('return_id'),
    subtipo: text('subtipo'),
    statusReclamacao: text('status_reclamacao'),
    statusDevolucao: text('status_devolucao'),
    devolucaoId: uuid('devolucao_id').references(() => devolucoes.id, { onDelete: 'set null' }),
    atualizadaNoMlEm: timestamp('atualizada_no_ml_em', { withTimezone: true }),
    sincronizadaEm: timestamp('sincronizada_em', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('reclamacoes_ml_devolucao_idx').on(t.devolucaoId),
    index('reclamacoes_ml_return_idx').on(t.returnId),
    index('reclamacoes_ml_subtipo_idx').on(t.subtipo),
  ],
);
```

`src/db/schema/notificacoes.ts` (substitua o conteúdo):

```ts
import { bigserial, index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/** Aviso bruto recebido de um marketplace. É só um gatilho: a sincronização busca o recurso de novo na API (spec §7.2). */
export const notificacoesRecebidas = pgTable(
  'notificacoes_recebidas',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    canal: text('canal').notNull(),
    topico: text('topico'),
    recurso: text('recurso'),
    /** Id do recurso no canal (no ML, o claim_id): a sincronização marca como processados os avisos dele. */
    referenciaExterna: text('referencia_externa'),
    payload: jsonb('payload').notNull(),
    recebidaEm: timestamp('recebida_em', { withTimezone: true }).notNull().defaultNow(),
    processadaEm: timestamp('processada_em', { withTimezone: true }),
  },
  (t) => [index('notificacoes_recebidas_referencia_idx').on(t.canal, t.referenciaExterna)],
);
```

Acrescente ao objeto exportado por `src/modules/historico/rotulos/mercado-livre.ts` (criado pela P2 com as chaves reservadas da §4.7; mantenha as que já estão lá) estas três chaves, com o prefixo da fase:

```ts
  ml_conta_desconectada: 'Conta do Mercado Livre desconectada',
  ml_resultado_sem_vinculo: 'Resultado não enviado ao ML: devolução sem vínculo com o Mercado Livre',
  ml_resultado_ok_recusado: 'O Mercado Livre recusou o resultado "OK"',
```

- [ ] **Passo 4: Gerar e aplicar a migração**

Rode: `npm run db:gerar -- --name fase3_mercado_livre && npm run db:migrar`
Esperado:
- surge `drizzle/00NN_fase3_mercado_livre.sql` (NN = a próxima depois da 0006 da P2);
- o arquivo traz `CREATE TYPE "public"."situacao_conta"`, `CREATE TYPE "public"."status_contestacao"`, `CREATE TABLE "contas_marketplace"`, `"contestacoes_canal"`, `"reclamacoes_ml"` e `ALTER TABLE "notificacoes_recebidas" ADD COLUMN "referencia_externa" text`;
- o `db:migrar` termina sem erro no banco `devolucoes_f3`.

- [ ] **Passo 5: Rodar os testes**

Rode: `npm test -- src/modules/mercado-livre && npm run test:int -- src/modules/mercado-livre/tabelas.int.test.ts && npm run typecheck`
Esperado: PASS (unitários 11, integração 4); `tsc` sem erros.

- [ ] **Passo 6: Commit**

```bash
cd "/c/Users/idmpc/devolucoes-wt/fase-3"
git add src/modules/mercado-livre/dominio.ts src/modules/mercado-livre/dominio.test.ts src/modules/mercado-livre/tabelas.int.test.ts src/db/schema/mercado-livre.ts src/db/schema/notificacoes.ts src/modules/historico/rotulos/mercado-livre.ts drizzle
git commit -m "feat: tabelas do Mercado Livre (contas, contestações, reclamações) e vocabulário" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 2: Cifra AES-256-GCM, configuração do ML e erros do ML

**Arquivos:**
- Criar: `src/lib/cifra.ts`, `src/modules/mercado-livre/config.ts`, `src/conectores/marketplace/mercadolivre/erros.ts`
- Modificar: `scripts/ml/selecao.ts` (tirar `resumirCorpoErro`), `scripts/ml/selecao.test.ts` (tirar o `describe` dele), `scripts/ml/spike.ts` (novo import)
- Testes: `src/lib/cifra.test.ts`, `src/modules/mercado-livre/config.test.ts`, `src/conectores/marketplace/mercadolivre/erros.test.ts`

**Interfaces:**
- Consome: `lerEnv()` (P2), `redigir` (`@/lib/redigir`), `ErroML` (`./cliente`, Fase 0).
- Produz:
  - em `src/lib/cifra.ts`: `class ErroCifra`, `lerChave(base64: string): Buffer`, `cifrar(texto: string, chave: Buffer): string` (formato `v1.<iv>.<tag>.<dados>` em base64url), `decifrar(cifrado: string, chave: Buffer): string`;
  - em `src/modules/mercado-livre/config.ts`: `type ModoML = 'api' | 'falso'`, `type ConfigML = { modo; clientId; clientSecret; redirectUri; usarPkce: boolean; chaveBase64 }`, `class ErroConfiguracaoML`, `configML(env?: Record<string, unknown>): ConfigML`, `chaveCriptografia(c: ConfigML): Buffer`, `faltasConfigML(c: ConfigML): string[]`;
  - em `.../mercadolivre/erros.ts`: `resumirCorpoErro(corpo, max = 300): string` (movido), `codigoErroML(erro: unknown): string | null`, `mensagemErroML(erro: ErroML): string`, `ehRecusaDefinitiva(erro: unknown): erro is ErroML`, `logErroML(contexto: string, erro: unknown, extra?: Record<string, unknown>): void`, `class ErroMotivoIndisponivel { motivo; aceitos }`.

- [ ] **Passo 1: Escrever os testes que falham**

`src/lib/cifra.test.ts`:

```ts
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { cifrar, decifrar, ErroCifra, lerChave } from './cifra';

const CHAVE = randomBytes(32);

describe('cifra AES-256-GCM (spec §10: tokens do ML cifrados)', () => {
  it('decifra o que cifrou, e o texto cifrado não mostra o original', () => {
    const cifrado = cifrar('APP_USR-segredo', CHAVE);
    expect(cifrado.startsWith('v1.')).toBe(true);
    expect(cifrado).not.toContain('APP_USR');
    expect(decifrar(cifrado, CHAVE)).toBe('APP_USR-segredo');
  });

  it('cada cifragem usa um IV novo', () => {
    expect(cifrar('x', CHAVE)).not.toBe(cifrar('x', CHAVE));
  });

  it('recusa texto alterado, chave errada e formato desconhecido', () => {
    const cifrado = cifrar('segredo', CHAVE);
    const partes = cifrado.split('.');
    partes[3] = Buffer.from('outro').toString('base64url');
    expect(() => decifrar(partes.join('.'), CHAVE)).toThrow(ErroCifra);
    expect(() => decifrar(cifrado, randomBytes(32))).toThrow(ErroCifra);
    expect(() => decifrar('qualquer coisa', CHAVE)).toThrow(ErroCifra);
  });

  it('lerChave exige 32 bytes em base64', () => {
    expect(lerChave(randomBytes(32).toString('base64'))).toHaveLength(32);
    expect(() => lerChave(randomBytes(16).toString('base64'))).toThrow(/32 bytes/);
  });
});
```

`src/modules/mercado-livre/config.test.ts`:

```ts
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { chaveCriptografia, configML, ErroConfiguracaoML, faltasConfigML } from './config';

describe('configML', () => {
  it('lê as variáveis do ML; ML_USAR_PKCE vale como texto ou booleano', () => {
    expect(
      configML({
        ML_CONECTOR: 'api',
        ML_CLIENT_ID: ' 999 ',
        ML_CLIENT_SECRET: 's',
        ML_REDIRECT_URI: 'https://x/api/ml/retorno',
        ML_USAR_PKCE: 'true',
        CHAVE_CRIPTOGRAFIA: 'abc',
      }),
    ).toEqual({ modo: 'api', clientId: '999', clientSecret: 's', redirectUri: 'https://x/api/ml/retorno', usarPkce: true, chaveBase64: 'abc' });
    expect(configML({ ML_USAR_PKCE: true }).usarPkce).toBe(true);
    expect(configML({ ML_USAR_PKCE: 'false' }).usarPkce).toBe(false);
  });

  it('o modo é "falso" só quando ML_CONECTOR=falso', () => {
    expect(configML({}).modo).toBe('api');
    expect(configML({ ML_CONECTOR: 'falso' }).modo).toBe('falso');
  });
});

describe('faltasConfigML', () => {
  it('no modo api lista o que falta; no falso não exige nada', () => {
    expect(faltasConfigML(configML({ ML_CONECTOR: 'api' }))).toEqual(['ML_CLIENT_ID', 'ML_CLIENT_SECRET', 'ML_REDIRECT_URI', 'CHAVE_CRIPTOGRAFIA']);
    expect(faltasConfigML(configML({ ML_CONECTOR: 'falso' }))).toEqual([]);
  });
});

describe('chaveCriptografia', () => {
  it('usa a chave do .env', () => {
    const chave = randomBytes(32);
    expect(chaveCriptografia(configML({ CHAVE_CRIPTOGRAFIA: chave.toString('base64') })).equals(chave)).toBe(true);
  });

  it('no modo falso sem chave usa a de desenvolvimento (o lerEnv recusa o falso em produção)', () => {
    expect(chaveCriptografia(configML({ ML_CONECTOR: 'falso' }))).toHaveLength(32);
  });

  it('no modo api sem chave, ou com chave de tamanho errado, é ErroConfiguracaoML', () => {
    expect(() => chaveCriptografia(configML({ ML_CONECTOR: 'api' }))).toThrow(ErroConfiguracaoML);
    expect(() => chaveCriptografia(configML({ CHAVE_CRIPTOGRAFIA: randomBytes(8).toString('base64') }))).toThrow(ErroConfiguracaoML);
  });
});
```

`src/conectores/marketplace/mercadolivre/erros.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MARCA_REDIGIDO } from '@/lib/redigir';
import { ErroML } from './cliente';
import { codigoErroML, ehRecusaDefinitiva, ErroMotivoIndisponivel, logErroML, mensagemErroML, resumirCorpoErro } from './erros';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('resumirCorpoErro (movido de scripts/ml/selecao.ts)', () => {
  it('redige dados pessoais de um corpo JSON e mantém os demais campos', () => {
    const obtido = JSON.parse(resumirCorpoErro(JSON.stringify({ message: 'not_found', buyer: { first_name: 'Ana' } })));
    expect(obtido.buyer.first_name).toBe(MARCA_REDIGIDO);
    expect(obtido.message).toBe('not_found');
  });

  it('omite um corpo que não é JSON, sem repetir o conteúdo', () => {
    const resumo = resumirCorpoErro('<html>erro Ana Souza</html>');
    expect(resumo).toBe('[corpo não-JSON omitido: 27 caracteres]');
    expect(resumo).not.toContain('Ana');
  });

  it('corta o resumo em no máximo 300 caracteres', () => {
    expect(resumirCorpoErro(JSON.stringify({ message: 'x'.repeat(1000) })).length).toBeLessThanOrEqual(300);
  });
});

describe('codigoErroML e mensagemErroML', () => {
  it('lê o código em "error" ou "code" e acha invalid_operator_user_id em qualquer parte', () => {
    expect(codigoErroML(new ErroML(400, '{"error":"invalid_grant","message":"x"}', '/oauth/token'))).toBe('invalid_grant');
    expect(codigoErroML(new ErroML(429, '{"code":"local_rate_limited"}', '/x'))).toBe('local_rate_limited');
    expect(codigoErroML(new ErroML(403, '{"message":"invalid_operator_user_id: use a conta principal"}', '/oauth/token'))).toBe(
      'invalid_operator_user_id',
    );
    expect(codigoErroML(new ErroML(500, '<html>', '/x'))).toBeNull();
    expect(codigoErroML(new Error('outro'))).toBeNull();
  });

  it('mensagem curta para o Gestor, com o HTTP', () => {
    expect(mensagemErroML(new ErroML(400, '{"message":"The return review is not available","error":"bad_request"}', '/x'))).toBe(
      'The return review is not available (HTTP 400)',
    );
    expect(mensagemErroML(new ErroML(404, '', '/x'))).toBe('sem detalhes (HTTP 404)');
  });
});

describe('ehRecusaDefinitiva', () => {
  it('400, 403, 404, 409 e 422 não melhoram tentando de novo; 401, 429, 5xx e outros erros sim', () => {
    for (const status of [400, 403, 404, 409, 422]) expect(ehRecusaDefinitiva(new ErroML(status, '', '/x'))).toBe(true);
    for (const status of [401, 429, 500, 503]) expect(ehRecusaDefinitiva(new ErroML(status, '', '/x'))).toBe(false);
    expect(ehRecusaDefinitiva(new Error('rede'))).toBe(false);
  });
});

describe('logErroML (LGPD: o corpo passa por resumirCorpoErro)', () => {
  it('escreve JSON numa linha, sem o nome do comprador', () => {
    const espiao = vi.spyOn(console, 'error').mockImplementation(() => {});
    logErroML('sincronizar', new ErroML(404, JSON.stringify({ buyer: { first_name: 'Ana' } }), '/orders/1'), { reclamacaoId: '5' });
    const linha = String(espiao.mock.calls[0][0]);
    expect(JSON.parse(linha)).toMatchObject({ nivel: 'erro', origem: 'mercado-livre', contexto: 'sincronizar', status: 404, caminho: '/orders/1', reclamacaoId: '5' });
    expect(linha).not.toContain('Ana');
  });
});

describe('ErroMotivoIndisponivel', () => {
  it('diz o motivo recusado e os aceitos', () => {
    expect(new ErroMotivoIndisponivel('SRF5', ['SRF2', 'SRF6']).message).toBe(
      'O Mercado Livre não aceita o motivo SRF5 nesta devolução. Motivos aceitos: SRF2, SRF6.',
    );
  });
});
```

Rode: `npm test -- src/lib/cifra.test.ts src/modules/mercado-livre/config.test.ts src/conectores/marketplace/mercadolivre/erros.test.ts`
Esperado: FAIL (os módulos não existem).

- [ ] **Passo 2: Implementar a cifra**

`src/lib/cifra.ts`:

```ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** Spec §10: AES-256-GCM, IV de 12 bytes. Formato: v1.<iv>.<tag>.<dados>, cada parte em base64url (sem ".", serve em cookie). */
const VERSAO = 'v1';

export class ErroCifra extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroCifra';
  }
}

export function lerChave(base64: string): Buffer {
  const chave = Buffer.from(base64.trim(), 'base64');
  if (chave.length !== 32) {
    throw new ErroCifra(
      'CHAVE_CRIPTOGRAFIA deve ter 32 bytes em base64. Gere com: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
    );
  }
  return chave;
}

export function cifrar(texto: string, chave: Buffer): string {
  const iv = randomBytes(12);
  const cifra = createCipheriv('aes-256-gcm', chave, iv);
  const dados = Buffer.concat([cifra.update(texto, 'utf8'), cifra.final()]);
  return [VERSAO, iv.toString('base64url'), cifra.getAuthTag().toString('base64url'), dados.toString('base64url')].join('.');
}

export function decifrar(cifrado: string, chave: Buffer): string {
  const [versao, iv, tag, dados] = cifrado.split('.');
  if (versao !== VERSAO || !iv || !tag || dados === undefined) throw new ErroCifra('Texto cifrado em formato desconhecido.');
  try {
    const decifra = createDecipheriv('aes-256-gcm', chave, Buffer.from(iv, 'base64url'));
    decifra.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decifra.update(Buffer.from(dados, 'base64url')), decifra.final()]).toString('utf8');
  } catch {
    throw new ErroCifra('Não foi possível decifrar (chave errada ou texto alterado).');
  }
}
```

- [ ] **Passo 3: Implementar a configuração**

`src/modules/mercado-livre/config.ts`:

```ts
import { createHash } from 'node:crypto';
import { ErroCifra, lerChave } from '@/lib/cifra';
import { lerEnv } from '@/lib/env';

export type ModoML = 'api' | 'falso';
export type ConfigML = {
  modo: ModoML;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  usarPkce: boolean;
  chaveBase64: string;
};

export class ErroConfiguracaoML extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroConfiguracaoML';
  }
}

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : '';
}

/**
 * Único lugar que lê as variáveis do ML (declaradas pela P2 em src/lib/env.ts). Aceita `unknown` de propósito: se a P2
 * tipou ML_USAR_PKCE como booleano ou texto, os dois funcionam.
 */
export function configML(env: Record<string, unknown> = lerEnv()): ConfigML {
  const pkce: unknown = env.ML_USAR_PKCE;
  return {
    modo: texto(env.ML_CONECTOR) === 'falso' ? 'falso' : 'api',
    clientId: texto(env.ML_CLIENT_ID),
    clientSecret: texto(env.ML_CLIENT_SECRET),
    redirectUri: texto(env.ML_REDIRECT_URI),
    usarPkce: pkce === true || texto(pkce) === 'true',
    chaveBase64: texto(env.CHAVE_CRIPTOGRAFIA),
  };
}

/** Só para o modo falso (que o lerEnv recusa em produção, D17), quando o .env não traz uma chave. */
const CHAVE_DESENVOLVIMENTO = createHash('sha256').update('devolucoes-ml-falso-desenvolvimento').digest();

export function chaveCriptografia(c: ConfigML): Buffer {
  if (c.chaveBase64) {
    try {
      return lerChave(c.chaveBase64);
    } catch (erro) {
      if (erro instanceof ErroCifra) throw new ErroConfiguracaoML(erro.message);
      throw erro;
    }
  }
  if (c.modo === 'falso') return CHAVE_DESENVOLVIMENTO;
  throw new ErroConfiguracaoML('Defina CHAVE_CRIPTOGRAFIA no .env (32 bytes em base64).');
}

/** O que falta no servidor para conectar a conta real (a tela mostra a lista). */
export function faltasConfigML(c: ConfigML): string[] {
  if (c.modo === 'falso') return [];
  const faltas: string[] = [];
  if (!c.clientId) faltas.push('ML_CLIENT_ID');
  if (!c.clientSecret) faltas.push('ML_CLIENT_SECRET');
  if (!c.redirectUri) faltas.push('ML_REDIRECT_URI');
  if (!c.chaveBase64) faltas.push('CHAVE_CRIPTOGRAFIA');
  return faltas;
}
```

- [ ] **Passo 4: Implementar os erros do ML e mover `resumirCorpoErro`**

`src/conectores/marketplace/mercadolivre/erros.ts`:

```ts
import { redigir } from '@/lib/redigir';
import { ErroML } from './cliente';

/** Resume o corpo de um erro da API para logs e relatórios, sem dados pessoais (spec §10). */
export function resumirCorpoErro(corpo: string, max = 300): string {
  try {
    return JSON.stringify(redigir(JSON.parse(corpo))).slice(0, max);
  } catch {
    return `[corpo não-JSON omitido: ${corpo.length} caracteres]`;
  }
}

function corpoComoObjeto(erro: ErroML): Record<string, unknown> | null {
  try {
    const valor: unknown = JSON.parse(erro.corpo);
    return valor !== null && typeof valor === 'object' && !Array.isArray(valor) ? (valor as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Código do erro do ML: "invalid_grant", "invalid_operator_user_id", "local_rate_limited"... (suposição A13). */
export function codigoErroML(erro: unknown): string | null {
  if (!(erro instanceof ErroML)) return null;
  if (erro.corpo.includes('invalid_operator_user_id')) return 'invalid_operator_user_id';
  const corpo = corpoComoObjeto(erro);
  for (const chave of ['error', 'code'] as const) {
    const valor = corpo?.[chave];
    if (typeof valor === 'string' && valor) return valor;
  }
  return null;
}

/** Texto curto do ML (campo "message") para mostrar ao Gestor, com o código HTTP. */
export function mensagemErroML(erro: ErroML): string {
  const corpo = corpoComoObjeto(erro);
  const mensagem = typeof corpo?.message === 'string' && corpo.message ? corpo.message : codigoErroML(erro);
  return `${(mensagem ?? 'sem detalhes').slice(0, 200)} (HTTP ${erro.status})`;
}

const STATUS_DEFINITIVOS = new Set([400, 403, 404, 409, 422]);

/** Recusa que não melhora tentando de novo. O 401 e o 429 já são tratados no cliente; 5xx e rede pedem nova tentativa. */
export function ehRecusaDefinitiva(erro: unknown): erro is ErroML {
  return erro instanceof ErroML && STATUS_DEFINITIVOS.has(erro.status);
}

/** Log estruturado (JSON numa linha) de uma falha do ML. O corpo passa por resumirCorpoErro: nada do comprador vai ao log. */
export function logErroML(contexto: string, erro: unknown, extra: Record<string, unknown> = {}): void {
  const base =
    erro instanceof ErroML
      ? { status: erro.status, caminho: erro.caminho, corpo: resumirCorpoErro(erro.corpo) }
      : { mensagem: erro instanceof Error ? erro.message : String(erro) };
  console.error(JSON.stringify({ nivel: 'erro', origem: 'mercado-livre', contexto, ...base, ...extra }));
}

/** O ML não oferece este motivo de revisão para a devolução (lista de GET /returns/reasons). */
export class ErroMotivoIndisponivel extends Error {
  readonly motivo: string;
  readonly aceitos: string[];

  constructor(motivo: string, aceitos: string[]) {
    super(`O Mercado Livre não aceita o motivo ${motivo} nesta devolução. Motivos aceitos: ${aceitos.join(', ') || 'nenhum'}.`);
    this.name = 'ErroMotivoIndisponivel';
    this.motivo = motivo;
    this.aceitos = aceitos;
  }
}
```

Em `scripts/ml/selecao.ts`: apague a função `resumirCorpoErro` e a linha `import { redigir } from '@/lib/redigir';`. Em `scripts/ml/selecao.test.ts`: apague o `describe('resumirCorpoErro', ...)` e tire `MARCA_REDIGIDO` e `resumirCorpoErro` dos imports (o import de `@/lib/redigir` sai inteiro). Em `scripts/ml/spike.ts`, troque o import de `./selecao` por estes dois:

```ts
import { resumirCorpoErro } from '@/conectores/marketplace/mercadolivre/erros';
import { idsDaDevolucao, reclamacoesComDevolucao, type DevolucaoML, type ReclamacaoResumo } from './selecao';
```

- [ ] **Passo 5: Rodar e confirmar que passa**

Rode: `npm test && npm run typecheck && npm run lint`
Esperado: PASS em tudo (inclui os testes de `scripts/ml/selecao.test.ts`, agora sem o `resumirCorpoErro`).

- [ ] **Passo 6: Commit**

```bash
cd "/c/Users/idmpc/devolucoes-wt/fase-3"
git add src/lib/cifra.ts src/lib/cifra.test.ts src/modules/mercado-livre/config.ts src/modules/mercado-livre/config.test.ts src/conectores/marketplace/mercadolivre/erros.ts src/conectores/marketplace/mercadolivre/erros.test.ts scripts/ml/selecao.ts scripts/ml/selecao.test.ts scripts/ml/spike.ts
git commit -m "feat: cifra AES-256-GCM, configuração do ML e erros do ML com log sem dados pessoais" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 3: Cliente HTTP do ML (429, 401, multipart, ids grandes) e OAuth com zod

**Arquivos:**
- Modificar (substituir o conteúdo): `src/conectores/marketplace/mercadolivre/cliente.ts`
- Modificar: `src/conectores/marketplace/mercadolivre/oauth.ts` (zod na resposta do token)
- Testes (acrescentar): `src/conectores/marketplace/mercadolivre/cliente.test.ts`, `src/conectores/marketplace/mercadolivre/oauth.test.ts`

**Interfaces:**
- Consome: nada novo.
- Produz:
  - em `cliente.ts`: `API_ML`, `class ErroML` (sem mudança), `type ArquivoML = { nome: string; conteudo: Buffer; tipoConteudo: string }`;
  - `type ClienteML = { get<T>(caminho, cabecalhos?): Promise<T>; getTexto(caminho, cabecalhos?): Promise<string>; post<T>(caminho, corpo: unknown): Promise<T>; postArquivo<T>(caminho, arquivo: ArquivoML): Promise<T> }`;
  - `type OpcoesClienteML = { accessToken: string | (() => Promise<string>); renovarToken?: (recusado: string) => Promise<string>; fetchFn?; esperar?; aleatorio?; timeoutMs? }`;
  - `NOVAS_TENTATIVAS_429 = 3`, `esperaDo429(tentativa, retryAfter: string | null, aleatorio): number`, `analisarJson(texto): unknown`, `criarClienteML(p: OpcoesClienteML): ClienteML`;
  - em `oauth.ts`: `trocarCodigo` e `renovarTokens` com a mesma assinatura, agora validando a resposta com zod.

- [ ] **Passo 1: Escrever os testes que falham**

Acrescente no **final** de `src/conectores/marketplace/mercadolivre/cliente.test.ts` (e troque o import do topo por `import { analisarJson, API_ML, criarClienteML, ErroML, esperaDo429 } from './cliente';`):

```ts
type Chamada = [string, RequestInit];

function emSequencia(...respostas: Response[]) {
  return vi.fn(async () => respostas.shift() ?? new Response('{}', { status: 200 }));
}

describe('esperaDo429 (spec §7.2: espera crescente com jitter)', () => {
  it('dobra a cada tentativa, soma até 250 ms de jitter e para em 8 s', () => {
    expect(esperaDo429(0, null, () => 0)).toBe(500);
    expect(esperaDo429(1, null, () => 1)).toBe(1250);
    expect(esperaDo429(6, null, () => 0)).toBe(8000);
  });

  it('respeita o Retry-After em segundos, até 30 s; ignora data', () => {
    expect(esperaDo429(0, '2', () => 0)).toBe(2000);
    expect(esperaDo429(0, '120', () => 0)).toBe(30_000);
    expect(esperaDo429(0, 'Wed, 21 Oct 2026 07:28:00 GMT', () => 0)).toBe(500);
  });
});

describe('criarClienteML: 429, 401, POST, multipart e texto', () => {
  it('repete o 429 com espera crescente até dar certo', async () => {
    const fetchFn = emSequencia(
      new Response('{"error":"local_rate_limited"}', { status: 429 }),
      new Response('{"error":"local_rate_limited"}', { status: 429 }),
      new Response('{"ok":true}', { status: 200 }),
    );
    const esperar = vi.fn(async () => {});
    const cliente = criarClienteML({ accessToken: 'T', fetchFn, esperar, aleatorio: () => 0 });
    expect(await cliente.get('/x')).toEqual({ ok: true });
    expect(esperar.mock.calls).toEqual([[500], [1000]]);
  });

  it('desiste depois de 3 novas tentativas com ErroML 429', async () => {
    const fetchFn = vi.fn(async () => new Response('{"error":"local_rate_limited"}', { status: 429 }));
    const cliente = criarClienteML({ accessToken: 'T', fetchFn, esperar: async () => {} });
    const erro = await cliente.get('/x').catch((e: unknown) => e);
    expect(erro).toMatchObject({ status: 429 });
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });

  it('no 401 pede um token novo uma vez e repete com ele', async () => {
    const fetchFn = emSequencia(new Response('{"message":"invalid_token"}', { status: 401 }), new Response('{"id":1}', { status: 200 }));
    const renovarToken = vi.fn(async () => 'NOVO');
    const cliente = criarClienteML({ accessToken: async () => 'VELHO', renovarToken, fetchFn });
    expect(await cliente.get('/x')).toEqual({ id: 1 });
    expect(renovarToken).toHaveBeenCalledWith('VELHO');
    const [, init] = fetchFn.mock.calls[1] as unknown as Chamada;
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer NOVO');
  });

  it('um segundo 401 vira ErroML (não fica em laço)', async () => {
    const fetchFn = vi.fn(async () => new Response('{"message":"invalid_token"}', { status: 401 }));
    const cliente = criarClienteML({ accessToken: 'T', renovarToken: async () => 'N', fetchFn });
    expect(await cliente.get('/x').catch((e: unknown) => e)).toMatchObject({ status: 401 });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('post manda JSON com content-type', async () => {
    const fetchFn = emSequencia(new Response('{}', { status: 200 }));
    await criarClienteML({ accessToken: 'T', fetchFn }).post('/post-purchase/v1/returns/1/return-review', {});
    const [url, init] = fetchFn.mock.calls[0] as unknown as Chamada;
    expect(url).toBe(`${API_ML}/post-purchase/v1/returns/1/return-review`);
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{}');
    expect(init.headers).toMatchObject({ 'content-type': 'application/json', authorization: 'Bearer T' });
  });

  it('postArquivo manda multipart com o campo "file"', async () => {
    const fetchFn = emSequencia(new Response('{"file_name":"a.jpg"}', { status: 200 }));
    const cliente = criarClienteML({ accessToken: 'T', fetchFn });
    const r = await cliente.postArquivo('/anexos', { nome: 'foto.jpg', conteudo: Buffer.from('abc'), tipoConteudo: 'image/jpeg' });
    expect(r).toEqual({ file_name: 'a.jpg' });
    const [, init] = fetchFn.mock.calls[0] as unknown as Chamada;
    const arquivo = (init.body as FormData).get('file') as File;
    expect(arquivo.name).toBe('foto.jpg');
    expect(arquivo.type).toBe('image/jpeg');
    expect(Buffer.from(await arquivo.arrayBuffer()).toString()).toBe('abc');
  });

  it('getTexto devolve o corpo bruto (XML)', async () => {
    const fetchFn = emSequencia(new Response('<nfeProc/>', { status: 200 }));
    expect(await criarClienteML({ accessToken: 'T', fetchFn }).getTexto('/xml', { accept: 'application/xml' })).toBe('<nfeProc/>');
    const [, init] = fetchFn.mock.calls[0] as unknown as Chamada;
    expect(init.headers).toMatchObject({ accept: 'application/xml' });
  });
});

describe('analisarJson', () => {
  it('guarda como texto os inteiros que não cabem num number (pedidos do ML, pendência da Fase 0)', () => {
    expect(analisarJson('{"id": 20000080030354301234, "x": 1.5, "y": 2000008003035430}')).toEqual({
      id: '20000080030354301234',
      x: 1.5,
      y: 2000008003035430,
    });
  });
});
```

Acrescente no **final** de `src/conectores/marketplace/mercadolivre/oauth.test.ts`:

```ts
describe('resposta do token validada com zod (pendência da Fase 0)', () => {
  it('sem refresh_token é ErroML, e o erro não guarda o access_token', async () => {
    const fetchFn = fetchQueResponde({ access_token: 'APP_USR-secreto', expires_in: 21600, user_id: 1 });
    const erro = await trocarCodigo({ clientId: '1', clientSecret: 's', code: 'c', redirectUri: 'https://x', fetchFn }).catch(
      (e: unknown) => e,
    );
    expect(erro).toBeInstanceOf(ErroML);
    expect((erro as ErroML).corpo).toContain('refresh_token');
    expect((erro as ErroML).corpo).not.toContain('APP_USR-secreto');
  });

  it('aceita user_id em texto e scope ausente', async () => {
    const fetchFn = fetchQueResponde({ ...RESPOSTA, user_id: '123', scope: undefined });
    const t = await renovarTokens({ clientId: '1', clientSecret: 's', refreshToken: 'r', fetchFn, agora: new Date('2026-11-11T12:00:00Z') });
    expect(t).toMatchObject({ userId: 123, escopo: '', expiraEm: '2026-11-11T18:00:00.000Z' });
  });
});
```

Rode: `npm test -- src/conectores/marketplace/mercadolivre`
Esperado: FAIL (`esperaDo429`, `analisarJson`, `post`, `postArquivo` e `getTexto` não existem; o zod ainda não valida).

- [ ] **Passo 2: Implementar o cliente**

`src/conectores/marketplace/mercadolivre/cliente.ts` (substitua o conteúdo):

```ts
export const API_ML = 'https://api.mercadolibre.com';

export class ErroML extends Error {
  readonly status: number;
  readonly corpo: string;
  readonly caminho: string;

  constructor(status: number, corpo: string, caminho: string) {
    super(`Mercado Livre respondeu ${status} em ${caminho}`);
    this.name = 'ErroML';
    this.status = status;
    this.corpo = corpo;
    this.caminho = caminho;
  }
}

export type ArquivoML = { nome: string; conteudo: Buffer; tipoConteudo: string };

export type ClienteML = {
  get<T = unknown>(caminho: string, cabecalhos?: Record<string, string>): Promise<T>;
  getTexto(caminho: string, cabecalhos?: Record<string, string>): Promise<string>;
  post<T = unknown>(caminho: string, corpo: unknown): Promise<T>;
  postArquivo<T = unknown>(caminho: string, arquivo: ArquivoML): Promise<T>;
};

export type OpcoesClienteML = {
  /** Token fixo (scripts da Fase 0) ou função que devolve um token válido (renova quando falta pouco). */
  accessToken: string | (() => Promise<string>);
  /** Chamada uma vez quando o ML responde 401: recebe o token recusado e devolve um novo. */
  renovarToken?: (recusado: string) => Promise<string>;
  fetchFn?: typeof fetch;
  esperar?: (ms: number) => Promise<void>;
  aleatorio?: () => number;
  timeoutMs?: number;
};

/** Spec §7.2: o 429 (`local_rate_limited`) pede nova tentativa com espera crescente e jitter. */
export const NOVAS_TENTATIVAS_429 = 3;

export function esperaDo429(tentativa: number, retryAfter: string | null, aleatorio: () => number): number {
  if (retryAfter !== null && /^\d+$/.test(retryAfter.trim())) return Math.min(Number(retryAfter) * 1000, 30_000);
  return Math.min(500 * 2 ** tentativa, 8_000) + Math.floor(aleatorio() * 250);
}

type Revisor = (chave: string, valor: unknown, contexto?: { source?: string }) => unknown;

/** Inteiro além de 2^53 (ids do ML com mais de 15 dígitos) vira texto, sem perder dígitos. O Node 24 passa `contexto.source`. */
const preservarInteirosGrandes: Revisor = (_chave, valor, contexto) =>
  typeof valor === 'number' && Number.isInteger(valor) && !Number.isSafeInteger(valor) && contexto?.source && /^-?\d+$/.test(contexto.source)
    ? contexto.source
    : valor;

export function analisarJson(texto: string): unknown {
  return JSON.parse(texto, preservarInteirosGrandes);
}

export function criarClienteML(p: OpcoesClienteML): ClienteML {
  const fetchFn = p.fetchFn ?? fetch;
  const esperar = p.esperar ?? ((ms: number) => new Promise<void>((ok) => setTimeout(ok, ms)));
  const aleatorio = p.aleatorio ?? Math.random;
  const timeoutMs = p.timeoutMs ?? 20_000;
  const fixo = p.accessToken;
  const tokenAtual = typeof fixo === 'string' ? async () => fixo : fixo;

  async function chamar(caminho: string, montar: (token: string) => RequestInit): Promise<{ status: number; texto: string }> {
    let token = await tokenAtual();
    let renovou = false;
    for (let tentativa = 0; ; tentativa += 1) {
      const resposta = await fetchFn(`${API_ML}${caminho}`, { ...montar(token), signal: AbortSignal.timeout(timeoutMs) });
      const texto = await resposta.text();
      if (resposta.status === 429 && tentativa < NOVAS_TENTATIVAS_429) {
        await esperar(esperaDo429(tentativa, resposta.headers.get('retry-after'), aleatorio));
        continue;
      }
      if (resposta.status === 401 && p.renovarToken && !renovou) {
        renovou = true;
        token = await p.renovarToken(token);
        continue;
      }
      if (!resposta.ok) throw new ErroML(resposta.status, texto, caminho);
      return { status: resposta.status, texto };
    }
  }

  function json<T>(r: { status: number; texto: string }, caminho: string): T {
    if (!r.texto) return null as T;
    try {
      return analisarJson(r.texto) as T;
    } catch {
      throw new ErroML(r.status, r.texto, caminho);
    }
  }

  function cabecalhos(token: string, extra: Record<string, string> = {}): Record<string, string> {
    return { accept: 'application/json', ...extra, authorization: `Bearer ${token}` };
  }

  return {
    async get<T = unknown>(caminho: string, extra: Record<string, string> = {}): Promise<T> {
      return json<T>(await chamar(caminho, (token) => ({ headers: cabecalhos(token, extra) })), caminho);
    },
    async getTexto(caminho: string, extra: Record<string, string> = {}): Promise<string> {
      return (await chamar(caminho, (token) => ({ headers: cabecalhos(token, extra) }))).texto;
    },
    async post<T = unknown>(caminho: string, corpo: unknown): Promise<T> {
      const resposta = await chamar(caminho, (token) => ({
        method: 'POST',
        headers: cabecalhos(token, { 'content-type': 'application/json' }),
        body: JSON.stringify(corpo),
      }));
      return json<T>(resposta, caminho);
    },
    async postArquivo<T = unknown>(caminho: string, arquivo: ArquivoML): Promise<T> {
      const resposta = await chamar(caminho, (token) => {
        // Um FormData novo a cada tentativa: o corpo de uma requisição não pode ser reenviado.
        const formulario = new FormData();
        formulario.append('file', new Blob([new Uint8Array(arquivo.conteudo)], { type: arquivo.tipoConteudo }), arquivo.nome);
        return { method: 'POST', headers: cabecalhos(token), body: formulario };
      });
      return json<T>(resposta, caminho);
    },
  };
}
```

- [ ] **Passo 3: Validar a resposta do token com zod**

Em `src/conectores/marketplace/mercadolivre/oauth.ts`:
1. Acrescente `import { z } from 'zod';` no topo.
2. Apague a linha `type RespostaToken = ...`.
3. Troque a função `pedirToken` inteira por:

```ts
const esquemaRespostaToken = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  user_id: z.coerce.number().int().positive(),
  scope: z.string().default(''),
});

async function pedirToken(corpo: Record<string, string>, fetchFn: typeof fetch, agora: Date): Promise<TokensML> {
  const resposta = await fetchFn(URL_TOKEN_ML, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams(corpo).toString(),
  });
  const texto = await resposta.text();
  if (!resposta.ok) throw new ErroML(resposta.status, texto, '/oauth/token');
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch {
    throw new ErroML(resposta.status, '[resposta do token não é JSON]', '/oauth/token');
  }
  const lido = esquemaRespostaToken.safeParse(bruto);
  // Nunca guarde o corpo no erro: ele pode trazer o access_token.
  if (!lido.success) {
    const campos = lido.error.issues.map((i) => i.path.join('.') || '(raiz)').join(', ');
    throw new ErroML(resposta.status, `[resposta do token fora do formato: ${campos}]`, '/oauth/token');
  }
  const d = lido.data;
  return {
    accessToken: d.access_token,
    refreshToken: d.refresh_token,
    expiraEm: new Date(agora.getTime() + d.expires_in * 1000).toISOString(),
    userId: d.user_id,
    escopo: d.scope,
  };
}
```

- [ ] **Passo 4: Rodar e confirmar que passa**

Rode: `npm test -- src/conectores/marketplace/mercadolivre && npm run typecheck`
Esperado: PASS (os 3 testes antigos do cliente e os do OAuth continuam passando; os novos também).

- [ ] **Passo 5: Commit**

```bash
cd "/c/Users/idmpc/devolucoes-wt/fase-3"
git add src/conectores/marketplace/mercadolivre/cliente.ts src/conectores/marketplace/mercadolivre/cliente.test.ts src/conectores/marketplace/mercadolivre/oauth.ts src/conectores/marketplace/mercadolivre/oauth.test.ts
git commit -m "feat: cliente do ML com nova tentativa no 429, token novo no 401, multipart e ids grandes; zod no token" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 4: Mapeamento puro do JSON do ML (exemplos da documentação)

**Arquivos:**
- Criar: `tests/fixtures/ml/doc/reclamacao.json`, `devolucao.json`, `pedido.json`, `anuncio.json`, `envio.json`, `busca-reclamacoes.json`, `motivos.json`, `anexo.json`, `erro-revisao.json`, `nota-venda.json`, `notificacao.json`, `token.json`
- Criar: `src/conectores/marketplace/mercadolivre/esquemas.ts`, `src/conectores/marketplace/mercadolivre/tipos.ts`, `src/conectores/marketplace/mercadolivre/mapeamento.ts`
- Testes: `src/conectores/marketplace/mercadolivre/mapeamento.test.ts`

**Interfaces:**
- Consome: `type DevolucaoExterna`, `type MarketplaceConnector` (`../tipos`, P2).
- Produz:
  - em `esquemas.ts`:
    - os esquemas `esquemaReclamacao`, `esquemaEnvioDevolucao`, `esquemaDevolucao`, `esquemaPedido`, `esquemaAnuncio`, `esquemaEnvio`, `esquemaBuscaReclamacoes`, `esquemaMotivos`, `esquemaArquivoEnviado` e `esquemaNotaVenda`;
    - os tipos `ReclamacaoJson`, `EnvioDevolucaoJson`, `DevolucaoJson`, `PedidoJson` e `AnuncioJson`.
  - em `tipos.ts`:
    - `type DadosDevolucaoML = { reclamacaoId: string; statusReclamacao: string | null; subtipo: string | null; statusDevolucao: string | null; atualizadaEm: Date | null; devolucao: DevolucaoExterna | null }`;
    - `type ReclamacaoAtualizada = { reclamacaoId: string; atualizadaEm: Date | null }`;
    - `interface ConectorMercadoLivre extends MarketplaceConnector { sellerId; obterReclamacao(id): Promise<DadosDevolucaoML>; reclamacoesAtualizadasDesde(desde): AsyncIterable<ReclamacaoAtualizada> }`;
    - `ehConectorML(c): c is ConectorMercadoLivre`.
  - em `mapeamento.ts`:
    - `class ErroFormatoML`, `analisar(esquema, valor, oQue)`;
    - `temDevolucao(entidades): boolean`, `prazoDaReclamacao(r): Date | null`, `escolherEnvio(d): EnvioDevolucaoJson | null`;
    - `gtinDoAnuncio(a, variacao): string | null`, `skuDoPedido(p, itemId, variacao): string | null`, `quantidadeML(v): number | null`;
    - `type EntradaMapeamento = { reclamacao: unknown; devolucao: unknown | null; pedidos: unknown[]; anuncios: unknown[]; envio: unknown | null }`;
    - `mapearReclamacao(e: EntradaMapeamento): DadosDevolucaoML`.

> **Onde a etapa de ligação ajusta:** os arquivos de `tests/fixtures/ml/doc/` foram montados a partir dos exemplos da documentação, com nomes e ids fictícios. Na "Ligação das contas reais", o `npm run ml:spike` grava as respostas reais (já redigidas) em `tests/fixtures/ml/`. Copie-as para `tests/fixtures/ml/real/`, acrescente um `describe('respostas reais')` neste teste e ajuste só `esquemas.ts` e `mapeamento.ts`.

- [ ] **Passo 1: Criar os exemplos da documentação**

`tests/fixtures/ml/doc/reclamacao.json` (`GET /post-purchase/v1/claims/{id}`):

```json
{
  "id": 5292183123,
  "resource_id": 2000008003035430,
  "status": "opened",
  "type": "mediations",
  "stage": "claim",
  "parent_id": null,
  "resource": "order",
  "reason_id": "PDD9949",
  "fulfilled": true,
  "quantity_type": "total",
  "players": [
    { "role": "complainant", "type": "buyer", "user_id": 987654321, "available_actions": [] },
    {
      "role": "respondent",
      "type": "seller",
      "user_id": 123456789,
      "available_actions": [
        { "action": "send_message_to_complainant", "due_date": null, "mandatory": false },
        { "action": "return_review_ok", "due_date": "2026-11-20T23:59:59.000-03:00", "mandatory": false },
        { "action": "return_review_fail", "due_date": "2026-11-20T23:59:59.000-03:00", "mandatory": false }
      ]
    },
    { "role": "mediator", "type": "internal", "user_id": 11111111, "available_actions": [] }
  ],
  "resolution": null,
  "site_id": "MLB",
  "date_created": "2026-11-05T10:12:31.000-03:00",
  "last_updated": "2026-11-09T14:20:00.000-03:00",
  "related_entities": ["return"]
}
```

`tests/fixtures/ml/doc/devolucao.json` (`GET /post-purchase/v2/claims/{id}/returns`):

```json
{
  "id": 14958493,
  "claim_id": 5292183123,
  "type": "claim",
  "subtype": "return_total",
  "status": "shipped",
  "status_money": "retained",
  "resource_type": "order",
  "shipments": [
    {
      "shipment_id": 41896532561,
      "status": "shipped",
      "tracking_number": "QB123456789BR",
      "type": "return",
      "destination": { "name": "seller_address" }
    }
  ],
  "orders": [
    {
      "order_id": 2000008003035430,
      "item_id": "MLB3456789012",
      "variation_id": 178234567890,
      "context_type": "total",
      "total_quantity": "1.0",
      "return_quantity": "1.0"
    }
  ],
  "date_created": "2026-11-05T10:15:00.000-03:00",
  "last_updated": "2026-11-09T14:20:00.000-03:00",
  "date_closed": null,
  "refund_at": "delivered",
  "related_entities": [],
  "intermediate_check": false
}
```

`tests/fixtures/ml/doc/pedido.json` (`GET /orders/{id}`; o comprador aparece só pelo id):

```json
{
  "id": 2000008003035430,
  "status": "paid",
  "date_created": "2026-10-28T09:00:00.000-03:00",
  "order_items": [
    {
      "item": {
        "id": "MLB3456789012",
        "title": "Fone de Ouvido Bluetooth",
        "variation_id": 178234567890,
        "seller_sku": "fone-01",
        "seller_custom_field": null
      },
      "quantity": 1,
      "unit_price": 129.9,
      "currency_id": "BRL"
    }
  ],
  "shipping": { "id": 41800000001 },
  "seller": { "id": 123456789 },
  "buyer": { "id": 987654321 }
}
```

`tests/fixtures/ml/doc/anuncio.json` (`GET /items/{id}`):

```json
{
  "id": "MLB3456789012",
  "title": "Fone de Ouvido Bluetooth",
  "attributes": [
    { "id": "BRAND", "name": "Marca", "value_name": "Marca Exemplo" },
    { "id": "GTIN", "name": "Código universal de produto", "value_name": "7891234567895" }
  ],
  "variations": [
    { "id": 178234567890, "attributes": [{ "id": "GTIN", "name": "Código universal de produto", "value_name": "7891234567888" }] }
  ]
}
```

`tests/fixtures/ml/doc/envio.json` (`GET /shipments/{id}` com `x-format-new: true`):

```json
{
  "id": 41896532561,
  "status": "shipped",
  "substatus": null,
  "tracking_number": "QB123456789BR",
  "tracking_method": "Correios",
  "date_created": "2026-11-06T08:00:00.000-03:00",
  "last_updated": "2026-11-09T14:20:00.000-03:00",
  "status_history": { "date_shipped": "2026-11-07T09:00:00.000-03:00", "date_delivered": null },
  "logistic": { "mode": "me2", "type": "default", "direction": "reverse" }
}
```

`tests/fixtures/ml/doc/busca-reclamacoes.json` (`GET /post-purchase/v1/claims/search`):

```json
{
  "paging": { "total": 2, "offset": 0, "limit": 100 },
  "data": [
    {
      "id": 5292183123,
      "type": "mediations",
      "status": "opened",
      "resource_id": 2000008003035430,
      "related_entities": ["return"],
      "last_updated": "2026-11-09T14:20:00.000-03:00"
    },
    {
      "id": 5292183999,
      "type": "mediations",
      "status": "opened",
      "resource_id": 2000008003035999,
      "related_entities": [],
      "last_updated": "2026-11-09T15:00:00.000-03:00"
    }
  ]
}
```

`tests/fixtures/ml/doc/motivos.json` (`GET /post-purchase/v1/returns/reasons?flow=seller_return_failed`):

```json
[
  { "id": "SRF2", "name": "O produto chegou danificado", "position": 1, "apply": "package" },
  { "id": "SRF3", "name": "Faltam peças ou acessórios", "position": 2, "apply": "package" },
  { "id": "SRF4", "name": "É um produto diferente", "position": 3, "apply": "order" },
  { "id": "SRF5", "name": "O produto não veio no pacote", "position": 4, "apply": "order" },
  { "id": "SRF6", "name": "Outro motivo", "position": 5, "apply": "package" }
]
```

`tests/fixtures/ml/doc/anexo.json` (`POST /post-purchase/v1/claims/{id}/returns/attachments`):

```json
{ "user_id": 123456789, "file_name": "123456789_6e7f4c2a-0d2b-4f5e-9a31-2c4b8d1e5f60.jpg" }
```

`tests/fixtures/ml/doc/erro-revisao.json` (recusa do `return-review`):

```json
{ "message": "The return review is not available for this return", "error": "bad_request", "status": 400, "cause": [] }
```

`tests/fixtures/ml/doc/nota-venda.json` (`GET /users/{seller}/invoices/orders/{pedido}`):

```json
{ "id": 987654, "status": "authorized", "invoice_number": "1234", "invoice_series": "1" }
```

`tests/fixtures/ml/doc/notificacao.json` (aviso do tópico `post_purchase`):

```json
{
  "_id": "f9f08571-1f65-4c46-9e0a-c0f43faac529",
  "resource": "/post-purchase/v1/claims/5292183123",
  "user_id": 123456789,
  "topic": "post_purchase",
  "actions": ["claims"],
  "application_id": 2069392825111111,
  "attempts": 1,
  "sent": "2026-11-10T12:00:00.123Z",
  "received": "2026-11-10T12:00:00.100Z"
}
```

`tests/fixtures/ml/doc/token.json` (`POST /oauth/token`; valores fictícios):

```json
{
  "access_token": "APP_USR-123456-090515-8cc4448aac10d5105474e1351-123456789",
  "token_type": "bearer",
  "expires_in": 21600,
  "scope": "offline_access read write",
  "user_id": 123456789,
  "refresh_token": "TG-5005b6b3e4b07e60756a3353-123456789"
}
```

- [ ] **Passo 2: Escrever o teste que falha**

`src/conectores/marketplace/mercadolivre/mapeamento.test.ts`:

```ts
/**
 * Mapeamento puro sobre o JSON do ML. Os exemplos vêm de tests/fixtures/ml/doc (montados a partir da documentação).
 * Na "Ligação das contas reais", acrescente aqui um describe com as respostas reais de tests/fixtures/ml/real.
 */
import { describe, expect, it } from 'vitest';
import anuncio from '../../../../tests/fixtures/ml/doc/anuncio.json';
import devolucao from '../../../../tests/fixtures/ml/doc/devolucao.json';
import envio from '../../../../tests/fixtures/ml/doc/envio.json';
import pedido from '../../../../tests/fixtures/ml/doc/pedido.json';
import reclamacao from '../../../../tests/fixtures/ml/doc/reclamacao.json';
import { esquemaAnuncio, esquemaReclamacao } from './esquemas';
import { ErroFormatoML, gtinDoAnuncio, mapearReclamacao, prazoDaReclamacao, quantidadeML, temDevolucao } from './mapeamento';

const COMPLETA = { reclamacao, devolucao, pedidos: [pedido], anuncios: [anuncio], envio };

describe('mapearReclamacao (spec §7.2 e §7.3)', () => {
  it('monta a DevolucaoExterna a partir da reclamação, devolução, pedido, anúncio e envio', () => {
    expect(mapearReclamacao(COMPLETA)).toEqual({
      reclamacaoId: '5292183123',
      statusReclamacao: 'opened',
      subtipo: 'return_total',
      statusDevolucao: 'shipped',
      atualizadaEm: new Date('2026-11-09T14:20:00.000-03:00'),
      devolucao: {
        canal: 'MERCADO_LIVRE',
        devolucaoExternaId: '14958493',
        reclamacaoId: '5292183123',
        tipo: 'DEVOLUCAO',
        semEnvioFisico: false,
        pedidos: ['2000008003035430'],
        statusCanal: 'shipped/shipped',
        destinoEnvio: 'VENDEDOR',
        reenvioDaTriagem: false,
        rastreio: 'QB123456789BR',
        transportadora: 'Correios',
        entregueEm: null,
        prazoConferencia: new Date('2026-11-20T23:59:59.000-03:00'),
        atualizadaEm: new Date('2026-11-09T14:20:00.000-03:00'),
        itens: [{ pedido: '2000008003035430', sku: 'fone-01', ean: '7891234567888', quantidade: 1 }],
      },
    });
  });

  it('reclamação sem devolução (só mediação): devolucao null', () => {
    const r = mapearReclamacao({ reclamacao: { ...reclamacao, related_entities: [] }, devolucao: null, pedidos: [], anuncios: [], envio: null });
    expect(r).toMatchObject({ reclamacaoId: '5292183123', devolucao: null, subtipo: null, statusDevolucao: null });
  });

  it('low_cost: sem envio físico (D10)', () => {
    const r = mapearReclamacao({ ...COMPLETA, devolucao: { ...devolucao, subtype: 'low_cost', status: 'closed', shipments: [] }, envio: null });
    expect(r.devolucao).toMatchObject({ semEnvioFisico: true, destinoEnvio: null, rastreio: null, statusCanal: 'closed' });
    expect(r.subtipo).toBe('low_cost');
  });

  it('entregue ao vendedor: preenche entregueEm com a data do envio', () => {
    const r = mapearReclamacao({
      ...COMPLETA,
      devolucao: { ...devolucao, status: 'delivered' },
      envio: { ...envio, status: 'delivered', status_history: { date_delivered: '2026-11-10T11:00:00.000-03:00' } },
    });
    expect(r.devolucao).toMatchObject({ statusCanal: 'delivered/delivered', entregueEm: new Date('2026-11-10T11:00:00.000-03:00') });
  });

  it('destino warehouse vira CD do marketplace; o reenvio da triagem ganha do envio de devolução', () => {
    const cd = { ...devolucao.shipments[0], destination: { name: 'warehouse' } };
    expect(mapearReclamacao({ ...COMPLETA, devolucao: { ...devolucao, shipments: [cd] }, envio: null }).devolucao).toMatchObject({
      destinoEnvio: 'CD_MARKETPLACE',
      reenvioDaTriagem: false,
    });
    const triagem = { shipment_id: 41896532999, status: 'shipped', tracking_number: 'QB999999999BR', type: 'return_from_triage', destination: { name: 'seller_address' } };
    expect(mapearReclamacao({ ...COMPLETA, devolucao: { ...devolucao, shipments: [cd, triagem] }, envio: null }).devolucao).toMatchObject({
      destinoEnvio: 'VENDEDOR',
      reenvioDaTriagem: true,
      rastreio: 'QB999999999BR',
    });
  });

  it('dois pedidos, quantidade em texto e SKU de reserva (seller_custom_field, depois o id do anúncio)', () => {
    const doisPedidos = {
      ...devolucao,
      orders: [
        { order_id: 2000008003035430, item_id: 'MLB3456789012', variation_id: null, total_quantity: '2.0', return_quantity: '2.0' },
        { order_id: '20000080030354301234', item_id: 'MLB0000000001', variation_id: null, total_quantity: '1.0', return_quantity: null },
      ],
    };
    const semSku = { ...pedido, order_items: [{ ...pedido.order_items[0], item: { ...pedido.order_items[0].item, seller_sku: null, seller_custom_field: 'CUSTOM-1' } }] };
    const r = mapearReclamacao({ ...COMPLETA, devolucao: doisPedidos, pedidos: [semSku], anuncios: [], envio: null });
    expect(r.devolucao?.pedidos).toEqual(['2000008003035430', '20000080030354301234']);
    expect(r.devolucao?.itens).toEqual([
      { pedido: '2000008003035430', sku: 'CUSTOM-1', ean: null, quantidade: 2 },
      { pedido: '20000080030354301234', sku: 'MLB0000000001', ean: null, quantidade: 1 },
    ]);
  });

  it('troca (type change) vira TROCA', () => {
    expect(mapearReclamacao({ ...COMPLETA, reclamacao: { ...reclamacao, type: 'change' } }).devolucao?.tipo).toBe('TROCA');
  });

  it('resposta fora do formato é ErroFormatoML, dizendo o quê e o campo', () => {
    const semStatus: Record<string, unknown> = { ...devolucao };
    delete semStatus.status;
    expect(() => mapearReclamacao({ ...COMPLETA, devolucao: semStatus })).toThrow(ErroFormatoML);
    expect(() => mapearReclamacao({ ...COMPLETA, devolucao: semStatus })).toThrow(/devolução.*status/);
  });
});

describe('funções do mapeamento', () => {
  it('temDevolucao aceita "return" e "returns" (spec §7.6, ponto 5)', () => {
    expect(temDevolucao(['return'])).toBe(true);
    expect(temDevolucao(['changes', 'returns'])).toBe(true);
    expect(temDevolucao([])).toBe(false);
  });

  it('prazoDaReclamacao: o menor due_date das ações de revisão do vendedor', () => {
    const r = esquemaReclamacao.parse({
      ...reclamacao,
      players: [
        { role: 'complainant', type: 'buyer', user_id: 1, available_actions: [{ action: 'return_review_ok', due_date: '2026-11-01T00:00:00.000-03:00' }] },
        {
          role: 'respondent',
          type: 'seller',
          user_id: 2,
          available_actions: [
            { action: 'return_review_fail', due_date: '2026-11-21T00:00:00.000-03:00' },
            { action: 'return_review_ok', due_date: '2026-11-20T00:00:00.000-03:00' },
            { action: 'send_message_to_complainant', due_date: '2026-11-02T00:00:00.000-03:00' },
          ],
        },
      ],
    });
    expect(prazoDaReclamacao(r)).toEqual(new Date('2026-11-20T00:00:00.000-03:00'));
  });

  it('gtinDoAnuncio prefere o da variação e recusa tamanho inválido', () => {
    const a = esquemaAnuncio.parse(anuncio);
    expect(gtinDoAnuncio(a, '178234567890')).toBe('7891234567888');
    expect(gtinDoAnuncio(a, null)).toBe('7891234567895');
    expect(gtinDoAnuncio(esquemaAnuncio.parse({ id: 'X', attributes: [{ id: 'GTIN', value_name: '123' }] }), null)).toBeNull();
  });

  it('quantidadeML entende "1.0", "2,0" e recusa zero', () => {
    expect(quantidadeML('1.0')).toBe(1);
    expect(quantidadeML('2,0')).toBe(2);
    expect(quantidadeML('0')).toBeNull();
    expect(quantidadeML(null)).toBeNull();
  });
});
```

Rode: `npm test -- src/conectores/marketplace/mercadolivre/mapeamento.test.ts`
Esperado: FAIL ("Failed to resolve import './esquemas'").

- [ ] **Passo 3: Esquemas zod**

`src/conectores/marketplace/mercadolivre/esquemas.ts`:

```ts
import { z } from 'zod';

/**
 * Esquemas das respostas do ML. Toleram campos a mais (`looseObject`) e ids em número ou texto. As suposições
 * A1 a A11 do plano estão aqui e em mapeamento.ts.
 */
const id = z.union([z.number(), z.string().min(1)]).transform(String);
const idOuNulo = z
  .union([z.number(), z.string()])
  .nullish()
  .transform((v) => (v === null || v === undefined || v === '' ? null : String(v)));
const textoOuNulo = z
  .string()
  .nullish()
  .transform((v) => v ?? null);
const dataOuNula = z
  .string()
  .nullish()
  .transform((v) => {
    if (!v) return null;
    const data = new Date(v);
    return Number.isNaN(data.getTime()) ? null : data;
  });
const quantidade = z
  .union([z.number(), z.string()])
  .nullish()
  .transform((v) => (v === null || v === undefined ? null : String(v)));

function lista<T extends z.ZodType>(item: T) {
  return z
    .array(item)
    .nullish()
    .transform((v) => v ?? []);
}

export const esquemaReclamacao = z.looseObject({
  id,
  resource_id: idOuNulo,
  status: textoOuNulo,
  type: textoOuNulo,
  stage: textoOuNulo,
  players: lista(
    z.looseObject({
      role: textoOuNulo,
      type: textoOuNulo,
      user_id: idOuNulo,
      available_actions: lista(z.looseObject({ action: z.string(), due_date: dataOuNula })),
    }),
  ),
  date_created: dataOuNula,
  last_updated: dataOuNula,
  related_entities: lista(z.string()),
});
export type ReclamacaoJson = z.output<typeof esquemaReclamacao>;

export const esquemaEnvioDevolucao = z.looseObject({
  shipment_id: id,
  status: textoOuNulo,
  tracking_number: textoOuNulo,
  type: textoOuNulo,
  destination: z
    .looseObject({ name: textoOuNulo })
    .nullish()
    .transform((v) => v ?? null),
});
export type EnvioDevolucaoJson = z.output<typeof esquemaEnvioDevolucao>;

export const esquemaDevolucao = z.looseObject({
  id,
  claim_id: idOuNulo,
  type: textoOuNulo,
  subtype: textoOuNulo,
  status: z.string().min(1),
  shipments: lista(esquemaEnvioDevolucao),
  orders: lista(
    z.looseObject({ order_id: id, item_id: idOuNulo, variation_id: idOuNulo, total_quantity: quantidade, return_quantity: quantidade }),
  ),
  date_created: dataOuNula,
  last_updated: dataOuNula,
});
export type DevolucaoJson = z.output<typeof esquemaDevolucao>;

export const esquemaPedido = z.looseObject({
  id,
  order_items: lista(
    z.looseObject({
      item: z.looseObject({ id: idOuNulo, seller_sku: textoOuNulo, seller_custom_field: textoOuNulo, variation_id: idOuNulo }),
    }),
  ),
});
export type PedidoJson = z.output<typeof esquemaPedido>;

const atributos = lista(z.looseObject({ id: z.string(), value_name: textoOuNulo }));
export const esquemaAnuncio = z.looseObject({
  id,
  attributes: atributos,
  variations: lista(z.looseObject({ id: idOuNulo, attributes: atributos })),
});
export type AnuncioJson = z.output<typeof esquemaAnuncio>;

export const esquemaEnvio = z.looseObject({
  id,
  status: textoOuNulo,
  tracking_number: textoOuNulo,
  tracking_method: textoOuNulo,
  status_history: z
    .looseObject({ date_delivered: dataOuNula })
    .nullish()
    .transform((v) => v ?? null),
});

export const esquemaBuscaReclamacoes = z.looseObject({
  paging: z.looseObject({ total: z.number().int().nonnegative() }),
  data: z.array(z.looseObject({ id, last_updated: dataOuNula, related_entities: z.array(z.string()).nullish() })),
});

export const esquemaMotivos = z.array(z.looseObject({ id: z.string() }));
export const esquemaArquivoEnviado = z.looseObject({ file_name: z.string().min(1) });
export const esquemaNotaVenda = z.looseObject({ id });
```

- [ ] **Passo 4: Tipos do conector do ML e mapeamento**

`src/conectores/marketplace/mercadolivre/tipos.ts`:

```ts
import type { DevolucaoExterna, MarketplaceConnector } from '../tipos';

/** O que o sistema sabe de uma reclamação do ML. `devolucao` é null quando a reclamação não tem devolução. */
export type DadosDevolucaoML = {
  reclamacaoId: string;
  statusReclamacao: string | null;
  subtipo: string | null;
  statusDevolucao: string | null;
  atualizadaEm: Date | null;
  devolucao: DevolucaoExterna | null;
};

export type ReclamacaoAtualizada = { reclamacaoId: string; atualizadaEm: Date | null };

/** O MarketplaceConnector (contrato §5.3) mais o que só o ML tem: o estado da reclamação e a lista para a varredura. */
export interface ConectorMercadoLivre extends MarketplaceConnector {
  readonly sellerId: string;
  obterReclamacao(reclamacaoId: string): Promise<DadosDevolucaoML>;
  reclamacoesAtualizadasDesde(desde: Date): AsyncIterable<ReclamacaoAtualizada>;
}

export function ehConectorML(c: MarketplaceConnector | null): c is ConectorMercadoLivre {
  return c !== null && c.canal === 'MERCADO_LIVRE' && typeof (c as Partial<ConectorMercadoLivre>).obterReclamacao === 'function';
}
```

`src/conectores/marketplace/mercadolivre/mapeamento.ts`:

```ts
import type { z } from 'zod';
import type { DevolucaoExterna } from '../tipos';
import {
  esquemaAnuncio,
  esquemaDevolucao,
  esquemaEnvio,
  esquemaPedido,
  esquemaReclamacao,
  type AnuncioJson,
  type DevolucaoJson,
  type EnvioDevolucaoJson,
  type PedidoJson,
  type ReclamacaoJson,
} from './esquemas';
import type { DadosDevolucaoML } from './tipos';

export class ErroFormatoML extends Error {
  constructor(oQue: string, detalhes: string) {
    super(`Resposta do Mercado Livre fora do formato esperado (${oQue}): ${detalhes}`);
    this.name = 'ErroFormatoML';
  }
}

export function analisar<S extends z.ZodType>(esquema: S, valor: unknown, oQue: string): z.output<S> {
  const lido = esquema.safeParse(valor);
  if (!lido.success) {
    throw new ErroFormatoML(oQue, lido.error.issues.map((i) => `${i.path.join('.') || '(raiz)'}: ${i.message}`).join('; '));
  }
  return lido.data;
}

/** Ações do vendedor que trazem o prazo para revisar a devolução (spec §7.4). */
const ACOES_REVISAO = new Set(['return_review', 'return_review_ok', 'return_review_fail']);

/** Spec §7.6, ponto 5: o ML escreve "return" ou "returns". */
export function temDevolucao(entidades: readonly string[]): boolean {
  return entidades.some((e) => e === 'return' || e === 'returns');
}

export function prazoDaReclamacao(r: ReclamacaoJson): Date | null {
  const prazos = r.players
    .filter((p) => p.role === 'respondent' || p.type === 'seller')
    .flatMap((p) => p.available_actions)
    .filter((a) => ACOES_REVISAO.has(a.action))
    .flatMap((a) => (a.due_date ? [a.due_date.getTime()] : []));
  return prazos.length === 0 ? null : new Date(Math.min(...prazos));
}

/** O reenvio da triagem (return_from_triage) é o envio que importa quando existe; senão, o último envio da lista. */
export function escolherEnvio(d: DevolucaoJson): EnvioDevolucaoJson | null {
  return d.shipments.find((s) => s.type === 'return_from_triage') ?? d.shipments.at(-1) ?? null;
}

export function gtinDoAnuncio(a: AnuncioJson, variacao: string | null): string | null {
  const daVariacao = a.variations.find((v) => v.id !== null && v.id === variacao)?.attributes ?? [];
  const valor = [...daVariacao, ...a.attributes].find((x) => x.id === 'GTIN')?.value_name ?? '';
  const digitos = valor.replace(/\D/g, '');
  return [8, 12, 13, 14].includes(digitos.length) ? digitos : null;
}

export function skuDoPedido(p: PedidoJson | undefined, itemId: string | null, variacao: string | null): string | null {
  if (!p) return null;
  const doItem = p.order_items.filter((l) => l.item.id === itemId);
  const linha = doItem.find((l) => variacao === null || l.item.variation_id === null || l.item.variation_id === variacao) ?? doItem[0];
  const sku = (linha?.item.seller_sku || linha?.item.seller_custom_field || '').trim();
  return sku || null;
}

/** Spec §7.6, ponto 5: as quantidades vêm em texto ("1.0"). */
export function quantidadeML(valor: string | null): number | null {
  if (valor === null) return null;
  const n = Number(valor.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/** Suposição A1: a troca aparece como `type: "change"` na reclamação ou na devolução. */
function ehTroca(r: ReclamacaoJson, d: DevolucaoJson): boolean {
  return r.type === 'change' || d.type === 'change' || r.related_entities.includes('change');
}

export type EntradaMapeamento = {
  reclamacao: unknown;
  devolucao: unknown | null;
  pedidos: unknown[];
  anuncios: unknown[];
  envio: unknown | null;
};

/**
 * Função pura: JSON do ML → o que o sistema guarda (spec §7.2). Não faz chamada nem lê o relógio.
 * `statusCanal` = "<return.status>/<status do envio>" (decisão 2 do plano).
 */
export function mapearReclamacao(e: EntradaMapeamento): DadosDevolucaoML {
  const r = analisar(esquemaReclamacao, e.reclamacao, 'reclamação');
  if (e.devolucao === null) {
    return { reclamacaoId: r.id, statusReclamacao: r.status, subtipo: null, statusDevolucao: null, atualizadaEm: r.last_updated ?? r.date_created, devolucao: null };
  }
  const d = analisar(esquemaDevolucao, e.devolucao, 'devolução');
  const pedidosJson = e.pedidos.map((p) => analisar(esquemaPedido, p, 'pedido'));
  const anuncios = e.anuncios.map((a) => analisar(esquemaAnuncio, a, 'anúncio'));
  const envio = e.envio === null ? null : analisar(esquemaEnvio, e.envio, 'envio');

  const envioDevolucao = escolherEnvio(d);
  const statusEnvio = envio?.status ?? envioDevolucao?.status ?? null;
  const nomeDestino = envioDevolucao?.destination?.name ?? null;
  const destinoEnvio = nomeDestino === 'warehouse' ? 'CD_MARKETPLACE' : nomeDestino === 'seller_address' ? 'VENDEDOR' : null;
  const entregueEm = destinoEnvio === 'VENDEDOR' && statusEnvio === 'delivered' ? (envio?.status_history?.date_delivered ?? d.last_updated) : null;
  const atualizadaEm = d.last_updated ?? r.last_updated ?? d.date_created ?? r.date_created;
  if (!atualizadaEm) throw new ErroFormatoML('devolução', 'sem last_updated nem date_created');

  const pedidos = [...new Set(d.orders.map((o) => o.order_id))];
  if (pedidos.length === 0 && r.resource_id) pedidos.push(r.resource_id);

  const devolucao: DevolucaoExterna = {
    canal: 'MERCADO_LIVRE',
    devolucaoExternaId: d.id,
    reclamacaoId: r.id,
    tipo: ehTroca(r, d) ? 'TROCA' : 'DEVOLUCAO',
    semEnvioFisico: d.subtype === 'low_cost',
    pedidos,
    statusCanal: statusEnvio ? `${d.status}/${statusEnvio}` : d.status,
    destinoEnvio,
    reenvioDaTriagem: envioDevolucao?.type === 'return_from_triage',
    rastreio: envio?.tracking_number ?? envioDevolucao?.tracking_number ?? null,
    transportadora: envio?.tracking_method ?? null,
    entregueEm,
    prazoConferencia: prazoDaReclamacao(r),
    atualizadaEm,
    itens: d.orders.map((o) => {
      const anuncio = anuncios.find((a) => a.id === o.item_id);
      return {
        pedido: o.order_id,
        sku: skuDoPedido(pedidosJson.find((p) => p.id === o.order_id), o.item_id, o.variation_id) ?? o.item_id ?? `PEDIDO-${o.order_id}`,
        ean: anuncio ? gtinDoAnuncio(anuncio, o.variation_id) : null,
        quantidade: quantidadeML(o.return_quantity) ?? quantidadeML(o.total_quantity) ?? 1,
      };
    }),
  };
  return { reclamacaoId: r.id, statusReclamacao: r.status, subtipo: d.subtype, statusDevolucao: d.status, atualizadaEm, devolucao };
}
```

- [ ] **Passo 5: Rodar e confirmar que passa**

Rode: `npm test -- src/conectores/marketplace/mercadolivre/mapeamento.test.ts && npm run typecheck && npm run lint`
Esperado: PASS (12 testes); `tsc` e `eslint` sem erros.

- [ ] **Passo 6: Commit**

```bash
cd "/c/Users/idmpc/devolucoes-wt/fase-3"
git add tests/fixtures/ml/doc src/conectores/marketplace/mercadolivre/esquemas.ts src/conectores/marketplace/mercadolivre/tipos.ts src/conectores/marketplace/mercadolivre/mapeamento.ts src/conectores/marketplace/mercadolivre/mapeamento.test.ts
git commit -m "feat: mapeamento puro do JSON do ML com exemplos da documentação" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 5: ConectorML (o `MarketplaceConnector` do Mercado Livre)

**Arquivos:**
- Criar: `src/conectores/marketplace/mercadolivre/conector.ts`
- Testes: `src/conectores/marketplace/mercadolivre/conector.test.ts`

**Interfaces:**
- Consome:
  - `ClienteML` e `criarClienteML` (Tarefa 3);
  - `analisar`, `mapearReclamacao`, `temDevolucao`, `escolherEnvio` e `ErroFormatoML` (Tarefa 4);
  - os esquemas (Tarefa 4);
  - `ehRecusaDefinitiva`, `logErroML` e `ErroMotivoIndisponivel` (Tarefa 2);
  - `formatarDataML` (`./datas`, Fase 0);
  - `DevolucaoExterna` e `ResultadoConferencia` (P2).
- Produz:
  - `ITENS_POR_PAGINA = 100`, `LIMITE_OFFSET_BUSCA = 10_000`, `class ErroReclamacaoSemDevolucao { reclamacaoId }`;
  - `corpoRevisaoComProblema(r: Extract<ResultadoConferencia, { tipo: 'PROBLEMA' }>, arquivos: string[]): Record<string, unknown>`;
  - `class ConectorML implements ConectorMercadoLivre`, construída com `new ConectorML({ sellerId: string; cliente: ClienteML })`. Os métodos:
    - `obterReclamacao(claimId): Promise<DadosDevolucaoML>`;
    - `obter(claimId): Promise<DevolucaoExterna>`;
    - `reclamacoesAtualizadasDesde(desde): AsyncGenerator<ReclamacaoAtualizada>`;
    - `listarAtualizadasDesde(desde): AsyncGenerator<DevolucaoExterna>`;
    - `enviarResultadoConferencia(returnId, r): Promise<void>`;
    - `obterXmlNotaVenda(pedido): Promise<string | null>`.

- [ ] **Passo 1: Escrever o teste que falha**

`src/conectores/marketplace/mercadolivre/conector.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import anexo from '../../../../tests/fixtures/ml/doc/anexo.json';
import anuncio from '../../../../tests/fixtures/ml/doc/anuncio.json';
import busca from '../../../../tests/fixtures/ml/doc/busca-reclamacoes.json';
import devolucao from '../../../../tests/fixtures/ml/doc/devolucao.json';
import envio from '../../../../tests/fixtures/ml/doc/envio.json';
import motivos from '../../../../tests/fixtures/ml/doc/motivos.json';
import notaVenda from '../../../../tests/fixtures/ml/doc/nota-venda.json';
import pedido from '../../../../tests/fixtures/ml/doc/pedido.json';
import reclamacao from '../../../../tests/fixtures/ml/doc/reclamacao.json';
import { criarClienteML } from './cliente';
import { ConectorML, corpoRevisaoComProblema, ErroReclamacaoSemDevolucao } from './conector';
import { ErroMotivoIndisponivel } from './erros';

type Rota = () => Response;
const json =
  (corpo: unknown, status = 200): Rota =>
  () =>
    new Response(JSON.stringify(corpo), { status });

afterEach(() => {
  vi.restoreAllMocks();
});

function montar(rotas: Record<string, Rota>) {
  const fetchFn = vi.fn(async (entrada: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(entrada));
    const rota = rotas[`${init?.method ?? 'GET'} ${url.pathname}`];
    return rota ? rota() : new Response('{"message":"not_found"}', { status: 404 });
  });
  const conector = new ConectorML({ sellerId: '123456789', cliente: criarClienteML({ accessToken: 'TOKEN', fetchFn }) });
  const chamadas = () =>
    fetchFn.mock.calls.map(([entrada, init]) => {
      const u = new URL(String(entrada));
      return `${init?.method ?? 'GET'} ${u.pathname}`;
    });
  return { fetchFn, conector, chamadas };
}

const ROTAS_RECLAMACAO: Record<string, Rota> = {
  'GET /post-purchase/v1/claims/5292183123': json(reclamacao),
  'GET /post-purchase/v2/claims/5292183123/returns': json(devolucao),
  'GET /orders/2000008003035430': json(pedido),
  'GET /items/MLB3456789012': json(anuncio),
  'GET /shipments/41896532561': json(envio),
};

describe('ConectorML.obterReclamacao (spec §7.2: reclamação → devolução → pedidos → anúncio → envio)', () => {
  it('busca tudo na ordem e mapeia; o envio vai com x-format-new', async () => {
    const { conector, chamadas, fetchFn } = montar(ROTAS_RECLAMACAO);
    const dados = await conector.obterReclamacao('5292183123');
    expect(dados.devolucao).toMatchObject({
      devolucaoExternaId: '14958493',
      pedidos: ['2000008003035430'],
      statusCanal: 'shipped/shipped',
      rastreio: 'QB123456789BR',
      itens: [{ sku: 'fone-01', ean: '7891234567888', quantidade: 1 }],
    });
    expect(chamadas()).toEqual([
      'GET /post-purchase/v1/claims/5292183123',
      'GET /post-purchase/v2/claims/5292183123/returns',
      'GET /orders/2000008003035430',
      'GET /items/MLB3456789012',
      'GET /shipments/41896532561',
    ]);
    expect(fetchFn.mock.calls[4][1]?.headers).toMatchObject({ 'x-format-new': 'true' });
  });

  it('reclamação sem devolução: não busca mais nada', async () => {
    const { conector, chamadas } = montar({ 'GET /post-purchase/v1/claims/5292183123': json({ ...reclamacao, related_entities: [] }) });
    expect((await conector.obterReclamacao('5292183123')).devolucao).toBeNull();
    expect(chamadas()).toEqual(['GET /post-purchase/v1/claims/5292183123']);
  });

  it('aceita a devolução v2 em lista (suposição A2)', async () => {
    const { conector } = montar({ ...ROTAS_RECLAMACAO, 'GET /post-purchase/v2/claims/5292183123/returns': json([devolucao]) });
    expect((await conector.obterReclamacao('5292183123')).devolucao?.devolucaoExternaId).toBe('14958493');
  });

  it('anúncio e envio recusados (404, 403) não impedem: ficam sem EAN e sem transportadora', async () => {
    const { conector } = montar({
      ...ROTAS_RECLAMACAO,
      'GET /items/MLB3456789012': json({ message: 'not_found' }, 404),
      'GET /shipments/41896532561': json({ message: 'forbidden' }, 403),
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await conector.obterReclamacao('5292183123')).devolucao).toMatchObject({ transportadora: null, itens: [{ ean: null }] });
  });

  it('obter lança ErroReclamacaoSemDevolucao quando não há devolução', async () => {
    const { conector } = montar({ 'GET /post-purchase/v1/claims/5292183123': json({ ...reclamacao, related_entities: [] }) });
    await expect(conector.obter('5292183123')).rejects.toBeInstanceOf(ErroReclamacaoSemDevolucao);
  });
});

describe('ConectorML: varredura (spec §7.2)', () => {
  it('busca como respondente, desde a data no horário de Brasília, e fica só com quem tem devolução', async () => {
    const { conector, fetchFn } = montar({ 'GET /post-purchase/v1/claims/search': json(busca) });
    const vistas = [];
    for await (const r of conector.reclamacoesAtualizadasDesde(new Date('2026-11-01T12:00:00Z'))) vistas.push(r.reclamacaoId);
    expect(vistas).toEqual(['5292183123']);
    const consulta = new URL(String(fetchFn.mock.calls[0][0])).searchParams;
    expect(Object.fromEntries(consulta)).toEqual({
      'players.user_id': '123456789',
      'players.role': 'respondent',
      range: 'last_updated:after:2026-11-01T09:00:00.000-0300',
      limit: '100',
      offset: '0',
    });
  });

  it('pagina de 100 em 100 até o total', async () => {
    const pagina = (inicio: number, n: number) =>
      Array.from({ length: n }, (_, i) => ({ id: 7_000_000_000 + inicio + i, related_entities: ['return'], last_updated: '2026-11-09T14:20:00.000-03:00' }));
    const fetchFn = vi.fn(async (entrada: string | URL | Request) => {
      const offset = Number(new URL(String(entrada)).searchParams.get('offset'));
      return new Response(JSON.stringify({ paging: { total: 150 }, data: offset === 0 ? pagina(0, 100) : pagina(100, 50) }), { status: 200 });
    });
    const conector = new ConectorML({ sellerId: '1', cliente: criarClienteML({ accessToken: 'T', fetchFn }) });
    const vistas: string[] = [];
    for await (const r of conector.reclamacoesAtualizadasDesde(new Date())) vistas.push(r.reclamacaoId);
    expect(vistas).toHaveLength(150);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('listarAtualizadasDesde (contrato §5.3) devolve as DevolucaoExterna', async () => {
    const { conector } = montar({ ...ROTAS_RECLAMACAO, 'GET /post-purchase/v1/claims/search': json(busca) });
    const lista = [];
    for await (const d of conector.listarAtualizadasDesde(new Date())) lista.push(d.devolucaoExternaId);
    expect(lista).toEqual(['14958493']);
  });
});

describe('ConectorML.enviarResultadoConferencia (spec §7.4)', () => {
  it('OK: POST return-review com {}', async () => {
    const { conector, fetchFn } = montar({ 'POST /post-purchase/v1/returns/14958493/return-review': json({}) });
    await conector.enviarResultadoConferencia('14958493', { tipo: 'OK' });
    expect(fetchFn.mock.calls[0][1]?.body).toBe('{}');
  });

  it('PROBLEMA: confere o motivo, sobe cada foto e manda a revisão com os file_name', async () => {
    const { conector, fetchFn, chamadas } = montar({
      'GET /post-purchase/v1/returns/reasons': json(motivos),
      'POST /post-purchase/v1/claims/5292183123/returns/attachments': json(anexo),
      'POST /post-purchase/v1/returns/14958493/return-review': json({}),
    });
    const foto = { nome: 'DEV-000001-1.jpg', conteudo: Buffer.from('jpg'), tipoConteudo: 'image/jpeg' as const };
    await conector.enviarResultadoConferencia('14958493', {
      tipo: 'PROBLEMA',
      reclamacaoId: '5292183123',
      motivo: 'SRF2',
      mensagem: 'Chegou quebrado.',
      anexos: [foto, { ...foto, nome: 'DEV-000001-2.jpg' }],
    });
    expect(chamadas()).toEqual([
      'GET /post-purchase/v1/returns/reasons',
      'POST /post-purchase/v1/claims/5292183123/returns/attachments',
      'POST /post-purchase/v1/claims/5292183123/returns/attachments',
      'POST /post-purchase/v1/returns/14958493/return-review',
    ]);
    expect(new URL(String(fetchFn.mock.calls[0][0])).search).toBe('?flow=seller_return_failed&claim_id=5292183123');
    expect(JSON.parse(String(fetchFn.mock.calls[3][1]?.body))).toEqual([
      { reason_id: 'SRF2', message: 'Chegou quebrado.', attachments: [anexo.file_name, anexo.file_name] },
    ]);
  });

  it('motivo que o ML não oferece: ErroMotivoIndisponivel, sem subir foto', async () => {
    const { conector, chamadas } = montar({ 'GET /post-purchase/v1/returns/reasons': json(motivos.filter((m) => m.id !== 'SRF5')) });
    const erro = await conector
      .enviarResultadoConferencia('14958493', { tipo: 'PROBLEMA', reclamacaoId: '5292183123', motivo: 'SRF5', mensagem: 'm', anexos: [] })
      .catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroMotivoIndisponivel);
    expect(chamadas()).toEqual(['GET /post-purchase/v1/returns/reasons']);
  });

  it('lista de motivos fora do formato: não valida e segue (suposição A8)', async () => {
    const { conector, chamadas } = montar({
      'GET /post-purchase/v1/returns/reasons': json({ outra: 'coisa' }),
      'POST /post-purchase/v1/returns/14958493/return-review': json({}),
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await conector.enviarResultadoConferencia('14958493', { tipo: 'PROBLEMA', reclamacaoId: '5292183123', motivo: 'SRF6', mensagem: 'm', anexos: [] });
    expect(chamadas().at(-1)).toBe('POST /post-purchase/v1/returns/14958493/return-review');
  });

  it('corpoRevisaoComProblema: order_id em número quando cabe, em texto quando não', () => {
    const base = { tipo: 'PROBLEMA' as const, reclamacaoId: '1', motivo: 'SRF3' as const, mensagem: 'm', anexos: [] };
    expect(corpoRevisaoComProblema({ ...base, pedido: '2000008003035430' }, ['a'])).toEqual({
      reason_id: 'SRF3',
      message: 'm',
      attachments: ['a'],
      order_id: 2000008003035430,
    });
    expect(corpoRevisaoComProblema({ ...base, pedido: '20000080030354301234' }, []).order_id).toBe('20000080030354301234');
    expect(corpoRevisaoComProblema(base, [])).not.toHaveProperty('order_id');
  });
});

describe('ConectorML.obterXmlNotaVenda (spec §7.5, contrato §5.8, suposição A10)', () => {
  it('acha a nota do pedido e baixa o XML autorizado', async () => {
    const { conector, fetchFn } = montar({
      'GET /users/123456789/invoices/orders/2000008003035430': json(notaVenda),
      'GET /users/123456789/invoices/documents/xml/987654/authorized': () => new Response('<nfeProc/>', { status: 200 }),
    });
    expect(await conector.obterXmlNotaVenda('2000008003035430')).toBe('<nfeProc/>');
    expect(fetchFn.mock.calls[1][1]?.headers).toMatchObject({ accept: 'application/xml' });
  });

  it('sem nota no ML: null (o Fiscal anexa o XML)', async () => {
    const { conector } = montar({});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await conector.obterXmlNotaVenda('2000008003035430')).toBeNull();
  });
});
```

Rode: `npm test -- src/conectores/marketplace/mercadolivre/conector.test.ts`
Esperado: FAIL ("Failed to resolve import './conector'").

- [ ] **Passo 2: Implementar o conector**

`src/conectores/marketplace/mercadolivre/conector.ts`:

```ts
import type { DevolucaoExterna, ResultadoConferencia } from '../tipos';
import type { ClienteML } from './cliente';
import { formatarDataML } from './datas';
import { ehRecusaDefinitiva, ErroMotivoIndisponivel, logErroML } from './erros';
import { esquemaArquivoEnviado, esquemaBuscaReclamacoes, esquemaDevolucao, esquemaMotivos, esquemaNotaVenda, esquemaReclamacao } from './esquemas';
import { analisar, ErroFormatoML, escolherEnvio, mapearReclamacao, temDevolucao } from './mapeamento';
import type { ConectorMercadoLivre, DadosDevolucaoML, ReclamacaoAtualizada } from './tipos';

/** Spec §7.2: `limit` no máximo 100 e `offset + limit` abaixo de 10000. */
export const ITENS_POR_PAGINA = 100;
export const LIMITE_OFFSET_BUSCA = 10_000;
const NOVO_FORMATO = { 'x-format-new': 'true' };

export class ErroReclamacaoSemDevolucao extends Error {
  readonly reclamacaoId: string;

  constructor(reclamacaoId: string) {
    super(`A reclamação ${reclamacaoId} do Mercado Livre não tem devolução.`);
    this.name = 'ErroReclamacaoSemDevolucao';
    this.reclamacaoId = reclamacaoId;
  }
}

/** Corpo da revisão com problema (spec §7.4). A chave `reason_id` é a suposição A6. */
export function corpoRevisaoComProblema(r: Extract<ResultadoConferencia, { tipo: 'PROBLEMA' }>, arquivos: string[]): Record<string, unknown> {
  const corpo: Record<string, unknown> = { reason_id: r.motivo, message: r.mensagem, attachments: arquivos };
  if (r.pedido) corpo.order_id = Number.isSafeInteger(Number(r.pedido)) ? Number(r.pedido) : r.pedido;
  return corpo;
}

/**
 * O MarketplaceConnector do Mercado Livre (contrato §5.3). `obter` e `obterReclamacao` recebem o claim_id;
 * `enviarResultadoConferencia` recebe o return_id (decisão 1 do plano).
 */
export class ConectorML implements ConectorMercadoLivre {
  readonly canal = 'MERCADO_LIVRE' as const;
  readonly sellerId: string;
  private readonly cliente: ClienteML;

  constructor(p: { sellerId: string; cliente: ClienteML }) {
    this.sellerId = p.sellerId;
    this.cliente = p.cliente;
  }

  /** Dado de enriquecimento (pedido, anúncio, envio, nota): uma recusa do ML não impede o resto. */
  private async opcional(caminho: string, cabecalhos?: Record<string, string>): Promise<unknown> {
    try {
      return await this.cliente.get(caminho, cabecalhos);
    } catch (erro) {
      if (!ehRecusaDefinitiva(erro)) throw erro;
      logErroML('dado opcional', erro);
      return null;
    }
  }

  async obterReclamacao(reclamacaoId: string): Promise<DadosDevolucaoML> {
    const id = encodeURIComponent(reclamacaoId);
    const reclamacao = await this.cliente.get(`/post-purchase/v1/claims/${id}`);
    const semDevolucao = { reclamacao, devolucao: null, pedidos: [], anuncios: [], envio: null };
    if (!temDevolucao(analisar(esquemaReclamacao, reclamacao, 'reclamação').related_entities)) return mapearReclamacao(semDevolucao);

    const resposta = await this.cliente.get(`/post-purchase/v2/claims/${id}/returns`);
    const devolucao: unknown = Array.isArray(resposta) ? (resposta[0] ?? null) : resposta;
    if (devolucao === null) return mapearReclamacao(semDevolucao);
    const d = analisar(esquemaDevolucao, devolucao, 'devolução');

    const pedidos: unknown[] = [];
    for (const pedido of new Set(d.orders.map((o) => o.order_id))) {
      const p = await this.opcional(`/orders/${encodeURIComponent(pedido)}`);
      if (p !== null) pedidos.push(p);
    }
    const anuncios: unknown[] = [];
    for (const item of new Set(d.orders.flatMap((o) => (o.item_id ? [o.item_id] : [])))) {
      const a = await this.opcional(`/items/${encodeURIComponent(item)}`);
      if (a !== null) anuncios.push(a);
    }
    const envioDevolucao = escolherEnvio(d);
    const envio = envioDevolucao ? await this.opcional(`/shipments/${encodeURIComponent(envioDevolucao.shipment_id)}`, NOVO_FORMATO) : null;
    return mapearReclamacao({ reclamacao, devolucao, pedidos, anuncios, envio });
  }

  async obter(reclamacaoId: string): Promise<DevolucaoExterna> {
    const dados = await this.obterReclamacao(reclamacaoId);
    if (!dados.devolucao) throw new ErroReclamacaoSemDevolucao(reclamacaoId);
    return dados.devolucao;
  }

  async *reclamacoesAtualizadasDesde(desde: Date): AsyncGenerator<ReclamacaoAtualizada> {
    for (let offset = 0; offset + ITENS_POR_PAGINA < LIMITE_OFFSET_BUSCA; offset += ITENS_POR_PAGINA) {
      const consulta = new URLSearchParams({
        'players.user_id': this.sellerId,
        'players.role': 'respondent',
        range: `last_updated:after:${formatarDataML(desde)}`,
        limit: String(ITENS_POR_PAGINA),
        offset: String(offset),
      });
      const pagina = analisar(esquemaBuscaReclamacoes, await this.cliente.get(`/post-purchase/v1/claims/search?${consulta}`), 'busca de reclamações');
      for (const r of pagina.data) {
        // Sem `related_entities` na busca não dá para filtrar: a sincronização decide (reclamação sem devolução é ignorada).
        if (!r.related_entities || temDevolucao(r.related_entities)) yield { reclamacaoId: r.id, atualizadaEm: r.last_updated };
      }
      if (pagina.data.length < ITENS_POR_PAGINA || offset + ITENS_POR_PAGINA >= pagina.paging.total) return;
    }
  }

  async *listarAtualizadasDesde(desde: Date): AsyncGenerator<DevolucaoExterna> {
    for await (const r of this.reclamacoesAtualizadasDesde(desde)) {
      const dados = await this.obterReclamacao(r.reclamacaoId);
      if (dados.devolucao) yield dados.devolucao;
    }
  }

  async enviarResultadoConferencia(devolucaoExternaId: string, r: ResultadoConferencia): Promise<void> {
    const caminho = `/post-purchase/v1/returns/${encodeURIComponent(devolucaoExternaId)}/return-review`;
    if (r.tipo === 'OK') {
      await this.cliente.post(caminho, {});
      return;
    }
    const aceitos = await this.motivosAceitos(r.reclamacaoId);
    if (aceitos && !aceitos.includes(r.motivo)) throw new ErroMotivoIndisponivel(r.motivo, aceitos);
    const arquivos: string[] = [];
    for (const anexo of r.anexos) {
      const resposta = await this.cliente.postArquivo(`/post-purchase/v1/claims/${encodeURIComponent(r.reclamacaoId)}/returns/attachments`, {
        nome: anexo.nome,
        conteudo: anexo.conteudo,
        tipoConteudo: anexo.tipoConteudo,
      });
      arquivos.push(analisar(esquemaArquivoEnviado, resposta, 'anexo enviado').file_name);
    }
    await this.cliente.post(caminho, [corpoRevisaoComProblema(r, arquivos)]);
  }

  /** Motivos oferecidos pelo ML para esta reclamação; null quando a lista não vem no formato esperado (aí o envio decide). */
  private async motivosAceitos(reclamacaoId: string): Promise<string[] | null> {
    const consulta = new URLSearchParams({ flow: 'seller_return_failed', claim_id: reclamacaoId });
    const lido = esquemaMotivos.safeParse(await this.opcional(`/post-purchase/v1/returns/reasons?${consulta}`));
    if (!lido.success) {
      logErroML('motivos de revisão fora do formato', new ErroFormatoML('motivos', lido.error.message));
      return null;
    }
    return lido.data.map((m) => m.id);
  }

  async obterXmlNotaVenda(pedidoExterno: string): Promise<string | null> {
    const pedido = encodeURIComponent(pedidoExterno);
    const nota = (await this.opcional(`/users/${this.sellerId}/invoices/orders/${pedido}`)) ?? (await this.opcional(`/invoices/orders/${pedido}`));
    if (nota === null) return null;
    const lida = esquemaNotaVenda.safeParse(Array.isArray(nota) ? nota[0] : nota);
    if (!lida.success) return null;
    try {
      return await this.cliente.getTexto(`/users/${this.sellerId}/invoices/documents/xml/${encodeURIComponent(lida.data.id)}/authorized`, {
        accept: 'application/xml',
      });
    } catch (erro) {
      if (ehRecusaDefinitiva(erro)) return null;
      throw erro;
    }
  }
}
```

- [ ] **Passo 3: Rodar e confirmar que passa**

Rode: `npm test -- src/conectores/marketplace/mercadolivre && npm run typecheck && npm run lint`
Esperado: PASS (inclusive os 15 testes novos do conector); `tsc` e `eslint` sem erros.

- [ ] **Passo 4: Commit**

```bash
cd "/c/Users/idmpc/devolucoes-wt/fase-3"
git add src/conectores/marketplace/mercadolivre/conector.ts src/conectores/marketplace/mercadolivre/conector.test.ts
git commit -m "feat: ConectorML (reclamação, varredura, revisão OK e com problema, NF de venda)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 6: ML falso (cenários, OAuth e NF de venda)

**Arquivos:**
- Criar: `tests/fixtures/ml-falso/cenarios.json`, `src/conectores/marketplace/mercadolivre/falso.ts`
- Testes: `src/conectores/marketplace/mercadolivre/falso.test.ts`

**Interfaces:**
- Consome: `API_ML` (Tarefa 3), `URL_TOKEN_ML` (Fase 0), os arquivos de `tests/fixtures/ml/doc/` (Tarefa 4) e o `ConectorML` (Tarefa 5; só nos testes).
- Produz:
  - `PREFIXO_TOKEN_FALSO = 'APP_USR-FALSO-'`, `PREFIXO_REFRESH_FALSO = 'TG-FALSO-'`, `REFRESH_REVOGADO = 'TG-FALSO-REVOGADO'`;
  - `vendedorFalso(): string`, `type IdsFalsos`, `idsFalsos(cenario: number, seq: string): IdsFalsos`;
  - `idsDaReclamacaoFalsa(reclamacaoId: string): IdsFalsos | null`, `idReclamacaoFalsa(cenario: number): string`;
  - `urlAutorizacaoFalsa(state: string): string`, `digitoChaveNFe(chave43: string): string`;
  - `fetchFalsoML: typeof fetch`.

> O contrato (§5.3) põe as respostas do falso em `tests/fixtures/ml-falso/`: lá ficam os **cenários**. Os corpos-base são os mesmos exemplos da documentação da Tarefa 4 (`tests/fixtures/ml/doc/`), sem duplicar. O falso lê os arquivos com `readFileSync` a partir da raiz do projeto (o `next start` do e2e e o worker rodam na raiz). Ele não entra no fluxo de produção: o `lerEnv` recusa `ML_CONECTOR=falso` (D17).

- [ ] **Passo 1: Criar os cenários**

`tests/fixtures/ml-falso/cenarios.json`:

```json
{
  "vendedor": 123456789,
  "cenarios": {
    "1": {
      "nome": "a caminho do vendedor",
      "devolucao": { "status": "shipped", "subtype": "return_total" },
      "envio": { "status": "shipped", "type": "return", "destino": "seller_address" },
      "itens": [{ "sku": "MLF-FONE-01", "quantidade": "1.0" }]
    },
    "2": {
      "nome": "entregue ao vendedor",
      "devolucao": { "status": "delivered", "subtype": "return_total" },
      "envio": { "status": "delivered", "type": "return", "destino": "seller_address" },
      "itens": [{ "sku": "MLF-FONE-01", "quantidade": "1.0" }]
    },
    "3": {
      "nome": "sem envio físico (low_cost)",
      "devolucao": { "status": "closed", "subtype": "low_cost" },
      "envio": null,
      "itens": [{ "sku": "MLF-CABO-02", "quantidade": "1.0" }]
    },
    "4": {
      "nome": "no CD do Mercado Livre (triagem)",
      "devolucao": { "status": "delivered", "subtype": "return_total" },
      "envio": { "status": "delivered", "type": "return", "destino": "warehouse" },
      "itens": [{ "sku": "MLF-FONE-01", "quantidade": "1.0" }]
    },
    "5": {
      "nome": "reenvio da triagem ao vendedor",
      "devolucao": { "status": "shipped", "subtype": "return_total" },
      "envio": { "status": "shipped", "type": "return_from_triage", "destino": "seller_address" },
      "itens": [{ "sku": "MLF-FONE-01", "quantidade": "1.0" }]
    },
    "6": {
      "nome": "cancelada no ML",
      "devolucao": { "status": "cancelled", "subtype": "return_total" },
      "envio": { "status": "cancelled", "type": "return", "destino": "seller_address" },
      "itens": [{ "sku": "MLF-FONE-01", "quantidade": "1.0" }]
    },
    "7": {
      "nome": "dois pedidos",
      "devolucao": { "status": "shipped", "subtype": "return_partial" },
      "envio": { "status": "shipped", "type": "return", "destino": "seller_address" },
      "itens": [
        { "sku": "MLF-FONE-01", "quantidade": "2.0" },
        { "sku": "MLF-CABO-02", "quantidade": "1.0" }
      ]
    },
    "8": {
      "nome": "revisão recusada pelo ML",
      "recusarRevisao": true,
      "devolucao": { "status": "delivered", "subtype": "return_total" },
      "envio": { "status": "delivered", "type": "return", "destino": "seller_address" },
      "itens": [{ "sku": "MLF-FONE-01", "quantidade": "1.0" }]
    },
    "9": { "nome": "reclamação sem devolução", "semDevolucao": true, "itens": [] }
  },
  "notaVenda": {
    "cnpjEmitente": "11222333000181",
    "ncm": "85183000",
    "valorUnitario": "129.90",
    "ean": "7891234567895",
    "descricao": "Produto de teste do ML falso"
  }
}
```

- [ ] **Passo 2: Escrever o teste que falha**

`src/conectores/marketplace/mercadolivre/falso.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { criarClienteML } from './cliente';
import { ConectorML } from './conector';
import {
  digitoChaveNFe,
  fetchFalsoML,
  idReclamacaoFalsa,
  idsDaReclamacaoFalsa,
  REFRESH_REVOGADO,
  urlAutorizacaoFalsa,
  vendedorFalso,
  type IdsFalsos,
} from './falso';
import { renovarTokens, trocarCodigo } from './oauth';

function conector(accessToken = 'APP_USR-FALSO-TESTE') {
  return new ConectorML({ sellerId: vendedorFalso(), cliente: criarClienteML({ accessToken, fetchFn: fetchFalsoML }) });
}

function novo(cenario: number): { id: string; ids: IdsFalsos } {
  const id = idReclamacaoFalsa(cenario);
  const ids = idsDaReclamacaoFalsa(id);
  if (!ids) throw new Error(`id falso inválido: ${id}`);
  return { id, ids };
}

describe('ML falso: o ConectorML real sobre as respostas da documentação', () => {
  it('cenário 1: devolução a caminho do vendedor, com prazo', async () => {
    const { id, ids } = novo(1);
    const dados = await conector().obterReclamacao(id);
    expect(dados.devolucao).toMatchObject({
      devolucaoExternaId: ids.devolucaoId,
      reclamacaoId: id,
      pedidos: ids.pedidos,
      statusCanal: 'shipped/shipped',
      destinoEnvio: 'VENDEDOR',
      rastreio: ids.rastreio,
      transportadora: 'Correios',
      semEnvioFisico: false,
      itens: [{ pedido: ids.pedidos[0], sku: 'MLF-FONE-01', ean: '7891234567895', quantidade: 1 }],
    });
    expect(dados.devolucao?.prazoConferencia).toBeInstanceOf(Date);
  });

  it('cenário 2: entregue ao vendedor, com data de entrega', async () => {
    const dados = await conector().obterReclamacao(novo(2).id);
    expect(dados.devolucao).toMatchObject({ statusCanal: 'delivered/delivered', destinoEnvio: 'VENDEDOR' });
    expect(dados.devolucao?.entregueEm).toBeInstanceOf(Date);
  });

  it('cenário 3: low_cost, sem envio físico', async () => {
    const dados = await conector().obterReclamacao(novo(3).id);
    expect(dados.subtipo).toBe('low_cost');
    expect(dados.devolucao).toMatchObject({ semEnvioFisico: true, rastreio: null });
  });

  it('cenário 4: no CD do ML; cenário 5: reenvio da triagem', async () => {
    expect((await conector().obterReclamacao(novo(4).id)).devolucao).toMatchObject({ destinoEnvio: 'CD_MARKETPLACE', reenvioDaTriagem: false });
    expect((await conector().obterReclamacao(novo(5).id)).devolucao).toMatchObject({ destinoEnvio: 'VENDEDOR', reenvioDaTriagem: true });
  });

  it('cenário 7: dois pedidos e quantidade 2', async () => {
    const { id, ids } = novo(7);
    const dados = await conector().obterReclamacao(id);
    expect(dados.devolucao?.pedidos).toEqual(ids.pedidos);
    expect(dados.devolucao?.itens).toEqual([
      { pedido: ids.pedidos[0], sku: 'MLF-FONE-01', ean: '7891234567895', quantidade: 2 },
      { pedido: ids.pedidos[1], sku: 'MLF-CABO-02', ean: '7891234567895', quantidade: 1 },
    ]);
  });

  it('cenário 9: reclamação sem devolução', async () => {
    expect((await conector().obterReclamacao(novo(9).id)).devolucao).toBeNull();
  });

  it('id fora dos cenários: 404; token sem o prefixo falso: 401', async () => {
    await expect(conector().obterReclamacao('123')).rejects.toMatchObject({ status: 404 });
    await expect(conector('OUTRO').obterReclamacao(novo(1).id)).rejects.toMatchObject({ status: 401 });
  });

  it('revisão OK passa; no cenário 8 o ML recusa com 400', async () => {
    await expect(conector().enviarResultadoConferencia(novo(1).ids.devolucaoId, { tipo: 'OK' })).resolves.toBeUndefined();
    const { id, ids } = novo(8);
    const erro = await conector()
      .enviarResultadoConferencia(ids.devolucaoId, {
        tipo: 'PROBLEMA',
        reclamacaoId: id,
        motivo: 'SRF2',
        mensagem: 'Chegou quebrado.',
        anexos: [{ nome: 'f.jpg', conteudo: Buffer.from('x'), tipoConteudo: 'image/jpeg' }],
      })
      .catch((e: unknown) => e);
    expect(erro).toMatchObject({ status: 400 });
  });

  it('NF de venda: XML com o SKU do cenário e chave de 44 dígitos com dígito verificador certo', async () => {
    const { ids } = novo(1);
    const xml = (await conector().obterXmlNotaVenda(ids.pedidos[0])) ?? '';
    expect(xml).toContain('<cProd>MLF-FONE-01</cProd>');
    const chave = /<chNFe>(\d{44})<\/chNFe>/.exec(xml)?.[1] ?? '';
    expect(chave).toHaveLength(44);
    expect(digitoChaveNFe(chave.slice(0, 43))).toBe(chave[43]);
    expect(await conector().obterXmlNotaVenda('999')).toBeNull();
  });
});

describe('OAuth falso', () => {
  it('"Conectar" volta direto ao retorno com um código falso, que vira tokens do vendedor falso', async () => {
    const url = new URL(urlAutorizacaoFalsa('abc'), 'http://localhost');
    expect(url.pathname).toBe('/api/ml/retorno');
    expect(url.searchParams.get('state')).toBe('abc');
    const tokens = await trocarCodigo({ clientId: '', clientSecret: '', code: url.searchParams.get('code') ?? '', redirectUri: '', fetchFn: fetchFalsoML });
    expect(tokens.userId).toBe(Number(vendedorFalso()));
    expect(tokens.accessToken.startsWith('APP_USR-FALSO-')).toBe(true);
  });

  it('refresh revogado: 400 invalid_grant', async () => {
    await expect(renovarTokens({ clientId: '', clientSecret: '', refreshToken: REFRESH_REVOGADO, fetchFn: fetchFalsoML })).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe('digitoChaveNFe (módulo 11)', () => {
  it('confere com a chave do exemplo do Manual da NF-e', () => {
    expect(digitoChaveNFe('5206043300991100250655012000000780026730161')).toBe('5');
  });
});
```

Rode: `npm test -- src/conectores/marketplace/mercadolivre/falso.test.ts`
Esperado: FAIL ("Failed to resolve import './falso'").

- [ ] **Passo 3: Implementar o falso**

`src/conectores/marketplace/mercadolivre/falso.ts`:

```ts
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { API_ML } from './cliente';
import { URL_TOKEN_ML } from './oauth';

/**
 * Mercado Livre falso (dev, testes e e2e; contrato §5.3 e D17: o lerEnv recusa ML_CONECTOR=falso em produção).
 * Troca só o `fetch`: o ConectorML, o OAuth e o mapeamento rodam de verdade sobre respostas montadas a partir dos
 * exemplos da documentação (tests/fixtures/ml/doc) e dos cenários (tests/fixtures/ml-falso/cenarios.json).
 *
 * Sem estado: o cenário vem do próprio id, então o servidor e o worker (processos diferentes) respondem igual.
 *   reclamação 5<c><seq>, devolução 6<c><seq>, envio 4<c><seq>, pedido 20000<i>0<c><seq>, anúncio MLB9<i><c><seq>
 *   (c = cenário de 1 a 9; seq = 8 dígitos; i = posição do item na devolução)
 */

export const PREFIXO_TOKEN_FALSO = 'APP_USR-FALSO-';
export const PREFIXO_REFRESH_FALSO = 'TG-FALSO-';
/** Refresh token que o falso recusa com invalid_grant (conta em RECONECTAR nos testes). */
export const REFRESH_REVOGADO = 'TG-FALSO-REVOGADO';

type CenarioFalso = {
  nome: string;
  semDevolucao?: boolean;
  recusarRevisao?: boolean;
  devolucao?: { status: string; subtype: string };
  envio?: { status: string; type: string; destino: string } | null;
  itens?: { sku: string; quantidade: string }[];
};
type ArquivoCenarios = {
  vendedor: number;
  cenarios: Record<string, CenarioFalso>;
  notaVenda: { cnpjEmitente: string; ncm: string; valorUnitario: string; ean: string; descricao: string };
};

const cache = new Map<string, unknown>();

function lerJson(...partes: string[]): unknown {
  const arquivo = path.join(process.cwd(), ...partes);
  if (!cache.has(arquivo)) {
    try {
      cache.set(arquivo, JSON.parse(readFileSync(arquivo, 'utf8')));
    } catch {
      throw new Error(`ML falso: não achei ${arquivo}. Rode na raiz do projeto (ML_CONECTOR=falso é só para dev e testes).`);
    }
  }
  return structuredClone(cache.get(arquivo));
}

const doc = (nome: string) => lerJson('tests', 'fixtures', 'ml', 'doc', nome) as Record<string, unknown>;
const docBruto = (nome: string) => lerJson('tests', 'fixtures', 'ml', 'doc', nome);
const arquivo = () => lerJson('tests', 'fixtures', 'ml-falso', 'cenarios.json') as ArquivoCenarios;
const cenario = (n: number): CenarioFalso | null => arquivo().cenarios[String(n)] ?? null;

export function vendedorFalso(): string {
  return String(arquivo().vendedor);
}

export type IdsFalsos = {
  cenario: number;
  seq: string;
  reclamacaoId: string;
  devolucaoId: string;
  envioId: string;
  rastreio: string;
  pedidos: string[];
  itens: string[];
};

export function idsFalsos(numero: number, seq: string): IdsFalsos {
  const quantos = Math.max(cenario(numero)?.itens?.length ?? 0, 1);
  const posicoes = Array.from({ length: quantos }, (_, i) => i);
  return {
    cenario: numero,
    seq,
    reclamacaoId: `5${numero}${seq}`,
    devolucaoId: `6${numero}${seq}`,
    envioId: `4${numero}${seq}`,
    rastreio: `ML${numero}${seq}BR`,
    pedidos: posicoes.map((i) => `20000${i}0${numero}${seq}`),
    itens: posicoes.map((i) => `MLB9${i}${numero}${seq}`),
  };
}

function idsPor(id: string, padrao: RegExp): IdsFalsos | null {
  const m = padrao.exec(id);
  return m ? idsFalsos(Number(m[1]), m[2]) : null;
}

export function idsDaReclamacaoFalsa(reclamacaoId: string): IdsFalsos | null {
  return idsPor(reclamacaoId, /^5([1-9])(\d{8})$/);
}

function posicaoDoPedido(pedido: string): { ids: IdsFalsos; i: number } | null {
  const m = /^20000(\d)0([1-9])(\d{8})$/.exec(pedido);
  return m ? { ids: idsFalsos(Number(m[2]), m[3]), i: Number(m[1]) } : null;
}

let contador = 0;
/** Id de reclamação novo do cenário (único por execução; os testes e o e2e usam). */
export function idReclamacaoFalsa(numero: number): string {
  contador = (contador + 1) % 10;
  return `5${numero}${String((Date.now() % 10_000_000) * 10 + contador).padStart(8, '0')}`;
}

/** No modo falso, "Conectar" não sai do sistema: volta direto ao retorno do OAuth com um código falso. */
export function urlAutorizacaoFalsa(state: string): string {
  return `/api/ml/retorno?${new URLSearchParams({ code: `${PREFIXO_REFRESH_FALSO}${randomBytes(6).toString('hex')}`, state })}`;
}

/** Dígito verificador da chave da NF-e (módulo 11, pesos 2 a 9 da direita para a esquerda). */
export function digitoChaveNFe(chave43: string): string {
  let soma = 0;
  let peso = 2;
  for (let i = chave43.length - 1; i >= 0; i -= 1) {
    soma += Number(chave43[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return resto < 2 ? '0' : String(11 - resto);
}

const DIA = 86_400_000;

function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });
}
const naoEncontrado = () => respostaJson({ message: 'not_found', error: 'not_found', status: 404 }, 404);

function reclamacaoFalsa(ids: IdsFalsos, c: CenarioFalso, agora: Date) {
  const prazo = new Date(agora.getTime() + 3 * DIA).toISOString();
  return {
    ...doc('reclamacao.json'),
    id: Number(ids.reclamacaoId),
    resource_id: Number(ids.pedidos[0]),
    related_entities: c.semDevolucao ? [] : ['return'],
    players: [
      { role: 'complainant', type: 'buyer', user_id: 987654321, available_actions: [] },
      {
        role: 'respondent',
        type: 'seller',
        user_id: arquivo().vendedor,
        available_actions: [
          { action: 'return_review_ok', due_date: prazo, mandatory: false },
          { action: 'return_review_fail', due_date: prazo, mandatory: false },
        ],
      },
    ],
    date_created: new Date(agora.getTime() - 2 * DIA).toISOString(),
    last_updated: agora.toISOString(),
  };
}

function devolucaoFalsa(ids: IdsFalsos, c: CenarioFalso, agora: Date) {
  return {
    ...doc('devolucao.json'),
    id: Number(ids.devolucaoId),
    claim_id: Number(ids.reclamacaoId),
    status: c.devolucao?.status ?? 'shipped',
    subtype: c.devolucao?.subtype ?? 'return_total',
    shipments: c.envio
      ? [{ shipment_id: Number(ids.envioId), status: c.envio.status, tracking_number: ids.rastreio, type: c.envio.type, destination: { name: c.envio.destino } }]
      : [],
    orders: (c.itens ?? []).map((item, i) => ({
      order_id: Number(ids.pedidos[i]),
      item_id: ids.itens[i],
      variation_id: null,
      context_type: 'total',
      total_quantity: item.quantidade,
      return_quantity: item.quantidade,
    })),
    date_created: new Date(agora.getTime() - 2 * DIA).toISOString(),
    last_updated: agora.toISOString(),
  };
}

function pedidoFalso(ids: IdsFalsos, i: number) {
  const item = cenario(ids.cenario)?.itens?.[i];
  if (!item) return null;
  const nota = arquivo().notaVenda;
  return {
    ...doc('pedido.json'),
    id: Number(ids.pedidos[i]),
    order_items: [
      {
        item: { id: ids.itens[i], title: nota.descricao, variation_id: null, seller_sku: item.sku, seller_custom_field: null },
        quantity: Math.round(Number(item.quantidade)),
        unit_price: Number(nota.valorUnitario),
        currency_id: 'BRL',
      },
    ],
  };
}

function envioFalso(ids: IdsFalsos, c: CenarioFalso, agora: Date) {
  if (!c.envio) return null;
  return {
    ...doc('envio.json'),
    id: Number(ids.envioId),
    status: c.envio.status,
    tracking_number: ids.rastreio,
    tracking_method: 'Correios',
    status_history: {
      date_shipped: new Date(agora.getTime() - DIA).toISOString(),
      date_delivered: c.envio.status === 'delivered' ? new Date(agora.getTime() - 3_600_000).toISOString() : null,
    },
  };
}

function escaparXml(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** NF-e de venda (layout 4.00, homologação) de um pedido do cenário, para a Fase 4 testar "NF de venda obtida do ML". */
function xmlNotaVenda(ids: IdsFalsos, i: number): string | null {
  const item = cenario(ids.cenario)?.itens?.[i];
  if (!item) return null;
  const nota = arquivo().notaVenda;
  const pedido = ids.pedidos[i];
  const base = `352611${nota.cnpjEmitente}55001${pedido.slice(-9)}1${pedido.slice(-8)}`;
  const chave = `${base}${digitoChaveNFe(base)}`;
  const quantidade = Math.round(Number(item.quantidade));
  const unitario = Number(nota.valorUnitario).toFixed(2);
  const total = (Number(nota.valorUnitario) * quantidade).toFixed(2);
  const sku = escaparXml(item.sku);
  return `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe Id="NFe${chave}" versao="4.00">
<ide><cUF>35</cUF><cNF>${pedido.slice(-8)}</cNF><natOp>Venda de mercadoria</natOp><mod>55</mod><serie>1</serie><nNF>${Number(pedido.slice(-9))}</nNF><dhEmi>2026-11-01T10:00:00-03:00</dhEmi><tpNF>1</tpNF><idDest>2</idDest><tpImp>1</tpImp><tpEmis>1</tpEmis><cDV>${chave.slice(-1)}</cDV><tpAmb>2</tpAmb><finNFe>1</finNFe><indFinal>1</indFinal><indPres>2</indPres></ide>
<emit><CNPJ>${nota.cnpjEmitente}</CNPJ><xNome>Loja de Teste do ML Falso Ltda</xNome><enderEmit><xLgr>Rua do Emitente</xLgr><nro>10</nro><xBairro>Centro</xBairro><cMun>3550308</cMun><xMun>Sao Paulo</xMun><UF>SP</UF><CEP>01001000</CEP></enderEmit><IE>110042490114</IE><CRT>1</CRT></emit>
<dest><CPF>12345678909</CPF><xNome>Comprador de Teste</xNome><enderDest><xLgr>Rua do Comprador</xLgr><nro>200</nro><xBairro>Copacabana</xBairro><cMun>3304557</cMun><xMun>Rio de Janeiro</xMun><UF>RJ</UF><CEP>22010000</CEP></enderDest><indIEDest>9</indIEDest></dest>
<det nItem="1"><prod><cProd>${sku}</cProd><cEAN>${nota.ean}</cEAN><xProd>${escaparXml(nota.descricao)}</xProd><NCM>${nota.ncm}</NCM><CFOP>6102</CFOP><uCom>UN</uCom><qCom>${quantidade}.0000</qCom><vUnCom>${unitario}</vUnCom><vProd>${total}</vProd><cEANTrib>${nota.ean}</cEANTrib><uTrib>UN</uTrib><qTrib>${quantidade}.0000</qTrib><vUnTrib>${unitario}</vUnTrib><indTot>1</indTot></prod><imposto><ICMS><ICMSSN102><orig>0</orig><CSOSN>102</CSOSN></ICMSSN102></ICMS><PIS><PISOutr><CST>49</CST><vBC>0.00</vBC><pPIS>0.0000</pPIS><vPIS>0.00</vPIS></PISOutr></PIS><COFINS><COFINSOutr><CST>49</CST><vBC>0.00</vBC><pCOFINS>0.0000</pCOFINS><vCOFINS>0.00</vCOFINS></COFINSOutr></COFINS></imposto></det>
<total><ICMSTot><vBC>0.00</vBC><vICMS>0.00</vICMS><vProd>${total}</vProd><vNF>${total}</vNF></ICMSTot></total>
</infNFe></NFe><protNFe versao="4.00"><infProt><tpAmb>2</tpAmb><chNFe>${chave}</chNFe><dhRecbto>2026-11-01T10:00:05-03:00</dhRecbto><nProt>135260000000001</nProt><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe></nfeProc>`;
}

function token(corpo: URLSearchParams): Response {
  const recebido = corpo.get('grant_type') === 'authorization_code' ? corpo.get('code') : corpo.get('refresh_token');
  if (!recebido || !recebido.startsWith(PREFIXO_REFRESH_FALSO) || recebido === REFRESH_REVOGADO) {
    return respostaJson({ error: 'invalid_grant', message: 'invalid_grant', status: 400 }, 400);
  }
  const marca = randomBytes(8).toString('hex');
  return respostaJson({
    ...doc('token.json'),
    access_token: `${PREFIXO_TOKEN_FALSO}${marca}`,
    refresh_token: `${PREFIXO_REFRESH_FALSO}${marca}`,
    user_id: arquivo().vendedor,
  });
}

type Rota = { metodo: 'GET' | 'POST'; padrao: RegExp; responder: (m: RegExpExecArray, url: URL, agora: Date, init?: RequestInit) => Response };

const ROTAS: Rota[] = [
  {
    metodo: 'GET',
    padrao: /^\/post-purchase\/v1\/claims\/search$/,
    // A varredura do falso não acha nada: os testes e o e2e mandam avisos com ids de cenário.
    responder: (_m, url) => respostaJson({ paging: { total: 0, offset: Number(url.searchParams.get('offset') ?? 0), limit: 100 }, data: [] }),
  },
  {
    metodo: 'GET',
    padrao: /^\/post-purchase\/v1\/claims\/(\d+)$/,
    responder: (m, _url, agora) => {
      const ids = idsDaReclamacaoFalsa(m[1]);
      const c = ids && cenario(ids.cenario);
      return ids && c ? respostaJson(reclamacaoFalsa(ids, c, agora)) : naoEncontrado();
    },
  },
  {
    metodo: 'GET',
    padrao: /^\/post-purchase\/v2\/claims\/(\d+)\/returns$/,
    responder: (m, _url, agora) => {
      const ids = idsDaReclamacaoFalsa(m[1]);
      const c = ids && cenario(ids.cenario);
      return ids && c && !c.semDevolucao ? respostaJson(devolucaoFalsa(ids, c, agora)) : naoEncontrado();
    },
  },
  {
    metodo: 'GET',
    padrao: /^\/orders\/(\d+)$/,
    responder: (m) => {
      const p = posicaoDoPedido(m[1]);
      const pedido = p && pedidoFalso(p.ids, p.i);
      return pedido ? respostaJson(pedido) : naoEncontrado();
    },
  },
  {
    metodo: 'GET',
    padrao: /^\/items\/(MLB9\d[1-9]\d{8})$/,
    responder: (m) => respostaJson({ ...doc('anuncio.json'), id: m[1], variations: [] }),
  },
  {
    metodo: 'GET',
    padrao: /^\/shipments\/(\d+)$/,
    responder: (m, _url, agora) => {
      const ids = idsPor(m[1], /^4([1-9])(\d{8})$/);
      const c = ids && cenario(ids.cenario);
      const envio = ids && c && envioFalso(ids, c, agora);
      return envio ? respostaJson(envio) : naoEncontrado();
    },
  },
  { metodo: 'GET', padrao: /^\/post-purchase\/v1\/returns\/reasons$/, responder: () => respostaJson(docBruto('motivos.json')) },
  {
    metodo: 'POST',
    padrao: /^\/post-purchase\/v1\/claims\/(\d+)\/returns\/attachments$/,
    responder: (_m, _url, _agora, init) =>
      init?.body instanceof FormData && init.body.get('file') instanceof Blob
        ? respostaJson({ user_id: arquivo().vendedor, file_name: `${arquivo().vendedor}_${randomBytes(8).toString('hex')}.jpg` })
        : respostaJson({ message: 'file is required', error: 'bad_request', status: 400 }, 400),
  },
  {
    metodo: 'POST',
    padrao: /^\/post-purchase\/v1\/returns\/(\d+)\/return-review$/,
    responder: (m) => {
      const ids = idsPor(m[1], /^6([1-9])(\d{8})$/);
      const c = ids && cenario(ids.cenario);
      if (!c) return naoEncontrado();
      return c.recusarRevisao ? respostaJson(docBruto('erro-revisao.json'), 400) : respostaJson({});
    },
  },
  {
    metodo: 'GET',
    padrao: /^\/users\/\d+\/invoices\/orders\/(\d+)$/,
    responder: (m) => (posicaoDoPedido(m[1]) ? respostaJson({ ...doc('nota-venda.json'), id: Number(m[1]) }) : naoEncontrado()),
  },
  {
    metodo: 'GET',
    padrao: /^\/users\/\d+\/invoices\/documents\/xml\/(\d+)\/authorized$/,
    responder: (m) => {
      const p = posicaoDoPedido(m[1]);
      const xml = p && xmlNotaVenda(p.ids, p.i);
      return xml ? new Response(xml, { status: 200, headers: { 'content-type': 'application/xml' } }) : naoEncontrado();
    },
  },
];

export const fetchFalsoML: typeof fetch = async (entrada, init) => {
  const url = new URL(entrada instanceof Request ? entrada.url : String(entrada));
  const metodo = (init?.method ?? 'GET').toUpperCase();
  if (`${url.origin}${url.pathname}` === URL_TOKEN_ML && metodo === 'POST') return token(new URLSearchParams(String(init?.body ?? '')));
  if (url.origin !== API_ML) return naoEncontrado();
  const autorizacao = new Headers(init?.headers).get('authorization') ?? '';
  if (!autorizacao.startsWith(`Bearer ${PREFIXO_TOKEN_FALSO}`)) return respostaJson({ message: 'invalid access token', error: 'unauthorized', status: 401 }, 401);
  for (const rota of ROTAS) {
    if (rota.metodo !== metodo) continue;
    const m = rota.padrao.exec(url.pathname);
    if (m) return rota.responder(m, url, new Date(), init);
  }
  return naoEncontrado();
};
```

- [ ] **Passo 4: Rodar e confirmar que passa**

Rode: `npm test -- src/conectores/marketplace/mercadolivre/falso.test.ts && npm run typecheck && npm run lint`
Esperado: PASS (12 testes).

- [ ] **Passo 5: Commit**

```bash
cd "/c/Users/idmpc/devolucoes-wt/fase-3"
git add tests/fixtures/ml-falso/cenarios.json src/conectores/marketplace/mercadolivre/falso.ts src/conectores/marketplace/mercadolivre/falso.test.ts
git commit -m "feat: ML falso por cenários (troca só o fetch), com OAuth e NF de venda falsos" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 7: Contas do ML (conectar, desconectar, token com trava, renovação) e registro de conectores

**Arquivos:**
- Criar: `src/modules/mercado-livre/contas.ts`, `src/modules/mercado-livre/fabrica-conector.ts`, `src/modules/mercado-livre/conector.ts`, `tests/helpers/fabricas-ml.ts`
- Modificar (substituir o corpo; as duas assinaturas ficam): `src/conectores/marketplace/registro.ts`
- Testes: `src/modules/mercado-livre/contas.int.test.ts`, `src/conectores/marketplace/registro.int.test.ts`

**Interfaces:**
- Consome:
  - `cifrar` e `decifrar` (Tarefa 2), `ConfigML`, `configML` e `chaveCriptografia` (Tarefa 2), `codigoErroML` e `logErroML` (Tarefa 2);
  - `renovarTokens` e `TokensML` (Tarefa 3), `criarClienteML` (Tarefa 3), `ConectorML` (Tarefa 5), `fetchFalsoML` (Tarefa 6);
  - `ehConectorML` (Tarefa 4), `registrarEvento`, `pode`, `contasMarketplace` e `usuarios`.
- Produz:
  - em `contas.ts`:
    - `MARGEM_TOKEN_MS` (5 min), `MARGEM_RENOVACAO_PROGRAMADA_MS` (2 h), `class ErroContaML`, `class ErroContaReconectar extends ErroContaML`;
    - `type ContaML = { id; sellerId; situacao: SituacaoConta; escopo: string | null; expiraEm: Date; ultimaSincronizacaoEm: Date | null; conectadaEm: Date; conectadaPorNome: string | null }`;
    - `obterContaML(db): Promise<ContaML | null>`;
    - `conectarConta(db, tokens: TokensML, usuario, config: ConfigML, agora: Date): Promise<{ contaId: string }>`;
    - `desconectarConta(db, usuario, agora): Promise<boolean>`;
    - `type OpcoesToken = { config: ConfigML; fetchFn: typeof fetch; agora?: () => Date; margemMs?: number; recusado?: string }`;
    - `tokenValido(db, contaId, o: OpcoesToken): Promise<string>`;
    - `renovarContasAVencer(db, o: { config; fetchFn; agora: Date }): Promise<{ renovadas: number; reconectar: number }>`;
    - `marcarSincronizacao(db, contaId, agora): Promise<void>`.
  - em `fabrica-conector.ts`: `fetchDoML(config: ConfigML): typeof fetch`, `criarConectorMLDaConta(db, o?: { config?; fetchFn?; agora? }): Promise<ConectorMercadoLivre | null>`.
  - em `src/modules/mercado-livre/conector.ts`: `obterConectorML(db): Promise<ConectorMercadoLivre | null>`.
  - em `registro.ts` (assinaturas do contrato):
    - `obterConector(db, canal)` devolve o `ConectorML` da conta ATIVA, ou `null` sem conta ATIVA ou em outro canal;
    - `definirConectorParaTestes(canal, c)`: com um conector, ele substitui o real; **com `null`, volta ao real**.
  - em `tests/helpers/fabricas-ml.ts`: `VENDEDOR_TESTE = '123456789'`, `configMLTeste(m?)`, `tokensTeste(m?)`, `contaMLTeste(db, p?: { config?; tokens?; gestor? }): Promise<{ contaId; gestor }>`.

> **Sobre o `db`:** o conector guarda o `db` que recebe, para renovar o token depois. Chame `obterConector` com a conexão (`db`), não com uma transação que vai terminar antes do uso.

- [ ] **Passo 1: Fábricas da fase (começo do arquivo)**

`tests/helpers/fabricas-ml.ts`:

```ts
import type { TokensML } from '@/conectores/marketplace/mercadolivre/oauth';
import type { DbOuTx } from '@/db/client';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import type { ConfigML } from '@/modules/mercado-livre/config';
import { conectarConta } from '@/modules/mercado-livre/contas';
import { criarUsuarioTeste } from './fabricas';

/** Fábricas da Fase 3 (contrato §3: cada fase tem as suas; fabricas.ts fica congelado). */
export const VENDEDOR_TESTE = '123456789';
const CHAVE_TESTE = Buffer.alloc(32, 7).toString('base64');

export function configMLTeste(mudancas: Partial<ConfigML> = {}): ConfigML {
  return {
    modo: 'falso',
    clientId: 'APP-TESTE',
    clientSecret: 'SEGREDO-TESTE',
    redirectUri: 'http://localhost/api/ml/retorno',
    usarPkce: false,
    chaveBase64: CHAVE_TESTE,
    ...mudancas,
  };
}

export function tokensTeste(mudancas: Partial<TokensML> = {}): TokensML {
  return {
    accessToken: 'APP_USR-FALSO-TESTE',
    refreshToken: 'TG-FALSO-TESTE',
    expiraEm: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
    userId: Number(VENDEDOR_TESTE),
    escopo: 'offline_access read write',
    ...mudancas,
  };
}

export async function contaMLTeste(
  db: DbOuTx,
  p: { config?: ConfigML; tokens?: TokensML; gestor?: UsuarioSessao } = {},
): Promise<{ contaId: string; gestor: UsuarioSessao }> {
  const gestor = p.gestor ?? (await criarUsuarioTeste(db, 'GESTOR'));
  const { contaId } = await conectarConta(db, p.tokens ?? tokensTeste(), gestor, p.config ?? configMLTeste(), new Date());
  return { contaId, gestor };
}
```

- [ ] **Passo 2: Escrever os testes que falham**

`src/modules/mercado-livre/contas.int.test.ts`:

```ts
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { contasMarketplace } from '@/db/schema';
import { decifrar } from '@/lib/cifra';
import { listarEventos } from '@/modules/historico/eventos';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { configMLTeste, contaMLTeste, tokensTeste } from '../../../tests/helpers/fabricas-ml';
import { chaveCriptografia } from './config';
import { conectarConta, desconectarConta, ErroContaML, ErroContaReconectar, obterContaML, renovarContasAVencer, tokenValido } from './contas';

const { db, sql } = criarDbTeste();
const config = configMLTeste();
const chave = chaveCriptografia(config);

beforeEach(async () => {
  await limparTabelas(sql);
  vi.restoreAllMocks();
});
afterAll(async () => {
  await sql.end();
});

const NOVO = { access_token: 'APP_USR-FALSO-NOVO', refresh_token: 'TG-FALSO-NOVO', expires_in: 21600, user_id: 123456789, scope: 'offline_access read write' };
function fetchToken(corpo: unknown = NOVO, status = 200, esperaMs = 0) {
  return vi.fn(async () => {
    if (esperaMs) await new Promise((ok) => setTimeout(ok, esperaMs));
    return new Response(JSON.stringify(corpo), { status });
  });
}
const vencendo = () => tokensTeste({ expiraEm: new Date(Date.now() + 60_000).toISOString() });

async function linha(contaId: string) {
  const [l] = await db.select().from(contasMarketplace).where(eq(contasMarketplace.id, contaId));
  return l;
}

describe('conectarConta e desconectarConta (spec §7.1)', () => {
  it('grava os tokens cifrados, ATIVA, e registra o evento', async () => {
    const gestor = await criarUsuarioTeste(db, 'GESTOR');
    const { contaId } = await conectarConta(db, tokensTeste(), gestor, config, new Date());
    const l = await linha(contaId);
    expect(l).toMatchObject({ canal: 'MERCADO_LIVRE', sellerId: '123456789', situacao: 'ATIVA', conectadaPor: gestor.id, escopo: 'offline_access read write' });
    expect(l.accessToken).not.toContain('APP_USR');
    expect(decifrar(l.accessToken, chave)).toBe('APP_USR-FALSO-TESTE');
    expect(decifrar(l.refreshToken, chave)).toBe('TG-FALSO-TESTE');
    expect((await listarEventos(db, 'conta_marketplace', contaId)).map((e) => e.acao)).toEqual(['ml_conta_conectada']);
    expect(await obterContaML(db)).toMatchObject({ id: contaId, sellerId: '123456789', conectadaPorNome: gestor.nome, ultimaSincronizacaoEm: null });
  });

  it('conectar de novo o mesmo vendedor atualiza a conta e volta a ATIVA', async () => {
    const { contaId, gestor } = await contaMLTeste(db);
    await db.update(contasMarketplace).set({ situacao: 'RECONECTAR' }).where(eq(contasMarketplace.id, contaId));
    const { contaId: mesma } = await conectarConta(db, tokensTeste({ accessToken: 'APP_USR-FALSO-2' }), gestor, config, new Date());
    expect(mesma).toBe(contaId);
    const l = await linha(contaId);
    expect(l.situacao).toBe('ATIVA');
    expect(decifrar(l.accessToken, chave)).toBe('APP_USR-FALSO-2');
  });

  it('recusa outro vendedor (uma conta por vez) e quem não é Gestor', async () => {
    const { gestor } = await contaMLTeste(db);
    await expect(conectarConta(db, tokensTeste({ userId: 999 }), gestor, config, new Date())).rejects.toThrow(/outra conta do Mercado Livre/);
    const operador = await criarUsuarioTeste(db, 'OPERADOR');
    await expect(conectarConta(db, tokensTeste(), operador, config, new Date())).rejects.toBeInstanceOf(ErroContaML);
  });

  it('desconectar apaga a conta e registra o evento', async () => {
    const { contaId, gestor } = await contaMLTeste(db);
    expect(await desconectarConta(db, gestor, new Date())).toBe(true);
    expect(await obterContaML(db)).toBeNull();
    expect((await listarEventos(db, 'conta_marketplace', contaId)).map((e) => e.acao)).toEqual(['ml_conta_conectada', 'ml_conta_desconectada']);
    expect(await desconectarConta(db, gestor, new Date())).toBe(false);
  });
});

describe('tokenValido (spec §7.1: 6 h de validade, refresh de uso único)', () => {
  it('devolve o token guardado quando ainda vale, sem chamar o ML', async () => {
    const { contaId } = await contaMLTeste(db);
    const fetchFn = fetchToken();
    expect(await tokenValido(db, contaId, { config, fetchFn })).toBe('APP_USR-FALSO-TESTE');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('renova quando faltam menos de 5 minutos e guarda os dois tokens novos', async () => {
    const { contaId } = await contaMLTeste(db, { tokens: vencendo() });
    const fetchFn = fetchToken();
    expect(await tokenValido(db, contaId, { config, fetchFn })).toBe('APP_USR-FALSO-NOVO');
    const corpo = new URLSearchParams(String((fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(corpo.get('refresh_token')).toBe('TG-FALSO-TESTE');
    const l = await linha(contaId);
    expect(decifrar(l.refreshToken, chave)).toBe('TG-FALSO-NOVO');
    expect(l.expiraEm.getTime()).toBeGreaterThan(Date.now() + 5 * 60 * 60 * 1000);
  });

  it('com o token recusado (401), renova mesmo dentro da validade; com outro já gravado, usa o gravado', async () => {
    const { contaId } = await contaMLTeste(db);
    expect(await tokenValido(db, contaId, { config, fetchFn: fetchToken(), recusado: 'APP_USR-FALSO-TESTE' })).toBe('APP_USR-FALSO-NOVO');
    const fetchFn = fetchToken();
    expect(await tokenValido(db, contaId, { config, fetchFn, recusado: 'APP_USR-FALSO-TESTE' })).toBe('APP_USR-FALSO-NOVO');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('invalid_grant: a conta vai para RECONECTAR, registra o evento e lança ErroContaReconectar', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { contaId } = await contaMLTeste(db, { tokens: vencendo() });
    const erro = await tokenValido(db, contaId, { config, fetchFn: fetchToken({ error: 'invalid_grant', message: 'x' }, 400) }).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroContaReconectar);
    expect((await linha(contaId)).situacao).toBe('RECONECTAR');
    expect((await listarEventos(db, 'conta_marketplace', contaId)).map((e) => e.acao)).toContain('ml_conta_reconectar');
    await expect(tokenValido(db, contaId, { config, fetchFn: fetchToken() })).rejects.toBeInstanceOf(ErroContaReconectar);
  });

  it('duas renovações ao mesmo tempo chamam o ML uma vez só (trava da linha)', async () => {
    const { contaId } = await contaMLTeste(db, { tokens: vencendo() });
    const fetchFn = fetchToken(NOVO, 200, 200);
    const tokens = await Promise.all([tokenValido(db, contaId, { config, fetchFn }), tokenValido(db, contaId, { config, fetchFn })]);
    expect(tokens).toEqual(['APP_USR-FALSO-NOVO', 'APP_USR-FALSO-NOVO']);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe('renovarContasAVencer (tarefa ml.renovar-token)', () => {
  it('renova a conta ATIVA que vence em menos de 2 horas; depois não há o que renovar', async () => {
    await contaMLTeste(db, { tokens: tokensTeste({ expiraEm: new Date(Date.now() + 60 * 60 * 1000).toISOString() }) });
    expect(await renovarContasAVencer(db, { config, fetchFn: fetchToken(), agora: new Date() })).toEqual({ renovadas: 1, reconectar: 0 });
    expect(await renovarContasAVencer(db, { config, fetchFn: fetchToken(), agora: new Date() })).toEqual({ renovadas: 0, reconectar: 0 });
  });
});
```

`src/conectores/marketplace/registro.int.test.ts`:

```ts
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { contasMarketplace } from '@/db/schema';
import { obterConectorML } from '@/modules/mercado-livre/conector';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { contaMLTeste } from '../../../tests/helpers/fabricas-ml';
import { ConectorML } from './mercadolivre/conector';
import { definirConectorParaTestes, obterConector } from './registro';
import type { MarketplaceConnector } from './tipos';

const { db, sql } = criarDbTeste();
beforeEach(async () => {
  await limparTabelas(sql);
});
afterEach(() => {
  definirConectorParaTestes('MERCADO_LIVRE', null);
});
afterAll(async () => {
  await sql.end();
});

describe('obterConector (contrato §5.3)', () => {
  it('sem conta ATIVA: null', async () => {
    expect(await obterConector(db, 'MERCADO_LIVRE')).toBeNull();
  });

  it('com conta ATIVA: o ConectorML do vendedor; outro canal: null', async () => {
    await contaMLTeste(db);
    const conector = await obterConector(db, 'MERCADO_LIVRE');
    expect(conector).toBeInstanceOf(ConectorML);
    expect((conector as ConectorML).sellerId).toBe('123456789');
    expect(await obterConectorML(db)).toBeInstanceOf(ConectorML);
    expect(await obterConector(db, 'SHOPEE')).toBeNull();
  });

  it('conta em RECONECTAR: null (spec §7.1)', async () => {
    const { contaId } = await contaMLTeste(db);
    await db.update(contasMarketplace).set({ situacao: 'RECONECTAR' }).where(eq(contasMarketplace.id, contaId));
    expect(await obterConector(db, 'MERCADO_LIVRE')).toBeNull();
  });

  it('definirConectorParaTestes substitui; com null, volta ao real', async () => {
    const substituto: MarketplaceConnector = {
      canal: 'MERCADO_LIVRE',
      listarAtualizadasDesde: () =>
        (async function* () {
          yield* [];
        })(),
      obter: async () => {
        throw new Error('não usado');
      },
      enviarResultadoConferencia: async () => {},
      obterXmlNotaVenda: async () => null,
    };
    definirConectorParaTestes('MERCADO_LIVRE', substituto);
    expect(await obterConector(db, 'MERCADO_LIVRE')).toBe(substituto);
    expect(await obterConectorML(db)).toBeNull();
    definirConectorParaTestes('MERCADO_LIVRE', null);
    expect(await obterConector(db, 'MERCADO_LIVRE')).toBeNull();
  });
});
```

Rode: `npm run test:int -- src/modules/mercado-livre/contas.int.test.ts src/conectores/marketplace/registro.int.test.ts`
Esperado: FAIL ("Failed to resolve import './contas'").

- [ ] **Passo 3: Implementar as contas**

`src/modules/mercado-livre/contas.ts`:

```ts
import { and, asc, eq, lte, ne } from 'drizzle-orm';
import { ErroML } from '@/conectores/marketplace/mercadolivre/cliente';
import { codigoErroML, logErroML } from '@/conectores/marketplace/mercadolivre/erros';
import { renovarTokens, type TokensML } from '@/conectores/marketplace/mercadolivre/oauth';
import type { DbOuTx } from '@/db/client';
import { contasMarketplace, usuarios } from '@/db/schema';
import { cifrar, decifrar } from '@/lib/cifra';
import { pode } from '@/modules/auth/permissoes';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { registrarEvento } from '@/modules/historico/eventos';
import { chaveCriptografia, type ConfigML } from './config';
import type { SituacaoConta } from './dominio';

/** Renovação sob demanda: quando faltam menos de 5 min. A tarefa ml.renovar-token renova o que vence em menos de 2 h. */
export const MARGEM_TOKEN_MS = 5 * 60 * 1000;
export const MARGEM_RENOVACAO_PROGRAMADA_MS = 2 * 60 * 60 * 1000;

export class ErroContaML extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroContaML';
  }
}

export class ErroContaReconectar extends ErroContaML {
  constructor() {
    super('O Mercado Livre recusou o acesso: conecte a conta de novo em Configurações › Mercado Livre.');
    this.name = 'ErroContaReconectar';
  }
}

export type ContaML = {
  id: string;
  sellerId: string;
  situacao: SituacaoConta;
  escopo: string | null;
  expiraEm: Date;
  ultimaSincronizacaoEm: Date | null;
  conectadaEm: Date;
  conectadaPorNome: string | null;
};

export async function obterContaML(db: DbOuTx): Promise<ContaML | null> {
  const [conta] = await db
    .select({
      id: contasMarketplace.id,
      sellerId: contasMarketplace.sellerId,
      situacao: contasMarketplace.situacao,
      escopo: contasMarketplace.escopo,
      expiraEm: contasMarketplace.expiraEm,
      ultimaSincronizacaoEm: contasMarketplace.ultimaSincronizacaoEm,
      conectadaEm: contasMarketplace.conectadaEm,
      conectadaPorNome: usuarios.nome,
    })
    .from(contasMarketplace)
    .leftJoin(usuarios, eq(usuarios.id, contasMarketplace.conectadaPor))
    .where(eq(contasMarketplace.canal, 'MERCADO_LIVRE'))
    .orderBy(asc(contasMarketplace.conectadaEm))
    .limit(1);
  return conta ?? null;
}

/** Spec §7.1: grava (ou atualiza) a conta com os tokens cifrados. Uma conta do ML por vez (decisão 6 do plano). */
export async function conectarConta(db: DbOuTx, tokens: TokensML, usuario: UsuarioSessao, config: ConfigML, agora: Date): Promise<{ contaId: string }> {
  if (!pode(usuario.perfil, 'administrar')) throw new ErroContaML('Só o Gestor conecta a conta do Mercado Livre.');
  const chave = chaveCriptografia(config);
  const sellerId = String(tokens.userId);
  return db.transaction(async (tx) => {
    const [outra] = await tx
      .select({ sellerId: contasMarketplace.sellerId })
      .from(contasMarketplace)
      .where(and(eq(contasMarketplace.canal, 'MERCADO_LIVRE'), ne(contasMarketplace.sellerId, sellerId)))
      .limit(1);
    if (outra) throw new ErroContaML(`Já existe outra conta do Mercado Livre conectada (vendedor ${outra.sellerId}). Desconecte-a antes.`);
    const valores = {
      accessToken: cifrar(tokens.accessToken, chave),
      refreshToken: cifrar(tokens.refreshToken, chave),
      expiraEm: new Date(tokens.expiraEm),
      situacao: 'ATIVA' as const,
      escopo: tokens.escopo || null,
      conectadaPor: usuario.id,
      conectadaEm: agora,
      atualizadaEm: agora,
    };
    const [conta] = await tx
      .insert(contasMarketplace)
      .values({ canal: 'MERCADO_LIVRE', sellerId, ...valores })
      .onConflictDoUpdate({ target: [contasMarketplace.canal, contasMarketplace.sellerId], set: valores })
      .returning({ id: contasMarketplace.id });
    await registrarEvento(tx, {
      entidade: 'conta_marketplace',
      entidadeId: conta.id,
      acao: 'ml_conta_conectada',
      usuarioId: usuario.id,
      dados: { sellerId },
      em: agora,
    });
    return { contaId: conta.id };
  });
}

/** Apaga a conta e os tokens (o ML não tem API de revogação para o app; decisão 6 do plano). */
export async function desconectarConta(db: DbOuTx, usuario: UsuarioSessao, agora: Date): Promise<boolean> {
  if (!pode(usuario.perfil, 'administrar')) throw new ErroContaML('Só o Gestor desconecta a conta do Mercado Livre.');
  return db.transaction(async (tx) => {
    const apagadas = await tx
      .delete(contasMarketplace)
      .where(eq(contasMarketplace.canal, 'MERCADO_LIVRE'))
      .returning({ id: contasMarketplace.id, sellerId: contasMarketplace.sellerId });
    for (const conta of apagadas) {
      await registrarEvento(tx, {
        entidade: 'conta_marketplace',
        entidadeId: conta.id,
        acao: 'ml_conta_desconectada',
        usuarioId: usuario.id,
        dados: { sellerId: conta.sellerId },
        em: agora,
      });
    }
    return apagadas.length > 0;
  });
}

export type OpcoesToken = { config: ConfigML; fetchFn: typeof fetch; agora?: () => Date; margemMs?: number; recusado?: string };

type ResultadoRenovacao = { token: string } | { erro: 'reconectar' | 'sumiu' };

/**
 * Access token válido da conta (spec §7.1). Renova quando faltam menos de `margemMs`, ou quando o ML recusou
 * `recusado` (401). A renovação trava a linha da conta (SELECT ... FOR UPDATE): quem chega depois usa o token que a
 * primeira gravou. O refresh token é de uso único: sempre se grava o novo. `invalid_grant` → RECONECTAR.
 */
export async function tokenValido(db: DbOuTx, contaId: string, o: OpcoesToken): Promise<string> {
  const agora = o.agora ?? (() => new Date());
  const margem = o.margemMs ?? MARGEM_TOKEN_MS;
  const chave = chaveCriptografia(o.config);
  const precisaRenovar = (expiraEm: Date, atual: string) =>
    o.recusado !== undefined ? atual === o.recusado : expiraEm.getTime() - agora().getTime() <= margem;

  const [conta] = await db.select().from(contasMarketplace).where(eq(contasMarketplace.id, contaId));
  if (!conta) throw new ErroContaML('A conta do Mercado Livre não existe mais.');
  if (conta.situacao === 'RECONECTAR') throw new ErroContaReconectar();
  const atual = decifrar(conta.accessToken, chave);
  if (!precisaRenovar(conta.expiraEm, atual)) return atual;

  const resultado = await db.transaction(async (tx): Promise<ResultadoRenovacao> => {
    const [travada] = await tx.select().from(contasMarketplace).where(eq(contasMarketplace.id, contaId)).for('update');
    if (!travada) return { erro: 'sumiu' };
    if (travada.situacao === 'RECONECTAR') return { erro: 'reconectar' };
    const tokenTravado = decifrar(travada.accessToken, chave);
    if (!precisaRenovar(travada.expiraEm, tokenTravado)) return { token: tokenTravado };
    let novos: TokensML;
    try {
      novos = await renovarTokens({
        clientId: o.config.clientId,
        clientSecret: o.config.clientSecret,
        refreshToken: decifrar(travada.refreshToken, chave),
        fetchFn: o.fetchFn,
        agora: agora(),
      });
    } catch (erro) {
      if (!(erro instanceof ErroML) || codigoErroML(erro) !== 'invalid_grant') throw erro;
      logErroML('renovar token', erro, { contaId });
      // Grava o RECONECTAR e devolve (não lança aqui dentro: lançar desfaria a gravação).
      await tx.update(contasMarketplace).set({ situacao: 'RECONECTAR', atualizadaEm: agora() }).where(eq(contasMarketplace.id, contaId));
      await registrarEvento(tx, {
        entidade: 'conta_marketplace',
        entidadeId: contaId,
        acao: 'ml_conta_reconectar',
        usuarioId: null,
        dados: { motivo: 'invalid_grant' },
        em: agora(),
      });
      return { erro: 'reconectar' };
    }
    await tx
      .update(contasMarketplace)
      .set({
        accessToken: cifrar(novos.accessToken, chave),
        refreshToken: cifrar(novos.refreshToken, chave),
        expiraEm: new Date(novos.expiraEm),
        escopo: novos.escopo || travada.escopo,
        situacao: 'ATIVA',
        atualizadaEm: agora(),
      })
      .where(eq(contasMarketplace.id, contaId));
    return { token: novos.accessToken };
  });
  if ('token' in resultado) return resultado.token;
  if (resultado.erro === 'reconectar') throw new ErroContaReconectar();
  throw new ErroContaML('A conta do Mercado Livre não existe mais.');
}

/** Tarefa ml.renovar-token (a cada 5 h): renova as contas ATIVA que vencem em menos de 2 h. */
export async function renovarContasAVencer(
  db: DbOuTx,
  o: { config: ConfigML; fetchFn: typeof fetch; agora: Date },
): Promise<{ renovadas: number; reconectar: number }> {
  const limite = new Date(o.agora.getTime() + MARGEM_RENOVACAO_PROGRAMADA_MS);
  const contas = await db
    .select({ id: contasMarketplace.id })
    .from(contasMarketplace)
    .where(and(eq(contasMarketplace.canal, 'MERCADO_LIVRE'), eq(contasMarketplace.situacao, 'ATIVA'), lte(contasMarketplace.expiraEm, limite)));
  let renovadas = 0;
  let reconectar = 0;
  for (const conta of contas) {
    try {
      await tokenValido(db, conta.id, { config: o.config, fetchFn: o.fetchFn, agora: () => o.agora, margemMs: MARGEM_RENOVACAO_PROGRAMADA_MS });
      renovadas += 1;
    } catch (erro) {
      if (!(erro instanceof ErroContaReconectar)) throw erro;
      reconectar += 1;
    }
  }
  return { renovadas, reconectar };
}

/** Última varredura bem-sucedida (spec §11: alerta depois de 1 h). */
export async function marcarSincronizacao(db: DbOuTx, contaId: string, agora: Date): Promise<void> {
  await db.update(contasMarketplace).set({ ultimaSincronizacaoEm: agora }).where(eq(contasMarketplace.id, contaId));
}
```

- [ ] **Passo 4: Fábrica do conector, atalho do módulo e registro**

`src/modules/mercado-livre/fabrica-conector.ts`:

```ts
import { and, eq } from 'drizzle-orm';
import { criarClienteML } from '@/conectores/marketplace/mercadolivre/cliente';
import { ConectorML } from '@/conectores/marketplace/mercadolivre/conector';
import { fetchFalsoML } from '@/conectores/marketplace/mercadolivre/falso';
import type { ConectorMercadoLivre } from '@/conectores/marketplace/mercadolivre/tipos';
import type { DbOuTx } from '@/db/client';
import { contasMarketplace } from '@/db/schema';
import { configML, type ConfigML } from './config';
import { tokenValido } from './contas';

/** ML_CONECTOR=falso troca só o fetch (D17: o lerEnv recusa o falso em produção). */
export function fetchDoML(config: ConfigML): typeof fetch {
  return config.modo === 'falso' ? fetchFalsoML : fetch;
}

/** O ConectorML da conta ATIVA, com o token renovado sob demanda (e uma vez no 401). Null sem conta ATIVA. */
export async function criarConectorMLDaConta(
  db: DbOuTx,
  o: { config?: ConfigML; fetchFn?: typeof fetch; agora?: () => Date } = {},
): Promise<ConectorMercadoLivre | null> {
  const config = o.config ?? configML();
  const fetchFn = o.fetchFn ?? fetchDoML(config);
  const [conta] = await db
    .select({ id: contasMarketplace.id, sellerId: contasMarketplace.sellerId })
    .from(contasMarketplace)
    .where(and(eq(contasMarketplace.canal, 'MERCADO_LIVRE'), eq(contasMarketplace.situacao, 'ATIVA')))
    .limit(1);
  if (!conta) return null;
  const opcoes = { config, fetchFn, agora: o.agora };
  const cliente = criarClienteML({
    accessToken: () => tokenValido(db, conta.id, opcoes),
    renovarToken: (recusado) => tokenValido(db, conta.id, { ...opcoes, recusado }),
    fetchFn,
  });
  return new ConectorML({ sellerId: conta.sellerId, cliente });
}
```

`src/modules/mercado-livre/conector.ts`:

```ts
import { ehConectorML, type ConectorMercadoLivre } from '@/conectores/marketplace/mercadolivre/tipos';
import { obterConector } from '@/conectores/marketplace/registro';
import type { DbOuTx } from '@/db/client';

/** O conector do ML com os métodos só dele (obterReclamacao, varredura). Null sem conta ATIVA. */
export async function obterConectorML(db: DbOuTx): Promise<ConectorMercadoLivre | null> {
  const conector = await obterConector(db, 'MERCADO_LIVRE');
  return ehConectorML(conector) ? conector : null;
}
```

`src/conectores/marketplace/registro.ts` (substitua o conteúdo; as assinaturas são as do contrato §5.3):

```ts
import type { DbOuTx } from '@/db/client';
import type { Canal } from '@/modules/devolucoes/dominio';
import { criarConectorMLDaConta } from '@/modules/mercado-livre/fabrica-conector';
import type { MarketplaceConnector } from './tipos';

const substitutos = new Map<Canal, MarketplaceConnector>();

/** Contrato §5.3: o conector do canal, ou null sem integração ou sem conta ATIVA. Hoje só o Mercado Livre tem integração. */
export async function obterConector(db: DbOuTx, canal: Canal): Promise<MarketplaceConnector | null> {
  const substituto = substitutos.get(canal);
  if (substituto) return substituto;
  if (canal === 'MERCADO_LIVRE') return criarConectorMLDaConta(db);
  return null;
}

/** Testes: com um conector, ele substitui o real; com null, volta ao real (que devolve null sem conta ATIVA). */
export function definirConectorParaTestes(canal: Canal, c: MarketplaceConnector | null): void {
  if (c) substitutos.set(canal, c);
  else substitutos.delete(canal);
}
```

- [ ] **Passo 5: Rodar e confirmar que passa**

Rode: `npm run test:int -- src/modules/mercado-livre src/conectores/marketplace && npm test && npm run typecheck && npm run lint`
Esperado: PASS (contas 10, registro 4, e os de antes).

- [ ] **Passo 6: Commit**

```bash
cd "/c/Users/idmpc/devolucoes-wt/fase-3"
git add src/modules/mercado-livre/contas.ts src/modules/mercado-livre/contas.int.test.ts src/modules/mercado-livre/fabrica-conector.ts src/modules/mercado-livre/conector.ts src/conectores/marketplace/registro.ts src/conectores/marketplace/registro.int.test.ts tests/helpers/fabricas-ml.ts
git commit -m "feat: conta do ML com tokens cifrados, renovação com trava e registro de conectores" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 8: `criarDevolucao` com origem API (contrato §5.5)

**Arquivos:**
- Modificar: `src/modules/devolucoes/criar.ts` (dono na janela: Fase 3)
- Testes (acrescentar): `src/modules/devolucoes/criar.int.test.ts`

**Interfaces:**
- Consome: `type TipoDevolucao` (`./dominio`).
- Produz (exatamente o contrato §5.5):
  - `type DadosCanal = { devolucaoExternaId: string; tipo: TipoDevolucao; pedidos: string[]; statusCanal: string; entregueSegundoCanalEm: Date | null; prazoConferenciaCanal: Date | null }`;
  - `type OpcoesCriacao = { origem: 'MANUAL' | 'PLANILHA'; usuario: UsuarioSessao } | { origem: 'API'; usuario: null; canal: DadosCanal; agora?: Date }`;
  - `criarDevolucao(db: DbOuTx, dados: DadosNovaDevolucao, opcoes: OpcoesCriacao): Promise<DevolucaoCriada>`.
  - Com `origem: 'API'`:
    - o ator é SISTEMA, `criado_por` fica vazio e o evento `criada` não tem usuário;
    - a chave é (`canal`, `devolucao_externa_id`): se já existir, lança `ErroDevolucaoDuplicada(codigo)`;
    - não confere a regra "uma devolução em andamento por pedido" nem o pacote não identificado (decisão 12 do plano).

- [ ] **Passo 1: Escrever os testes que falham**

Acrescente no **final** de `src/modules/devolucoes/criar.int.test.ts` (e troque o import de `./criar` por `import { criarDevolucao, type DadosCanal, type DadosNovaDevolucao } from './criar';`):

```ts
describe('criarDevolucao pela API do canal (contrato §5.5)', () => {
  const CANAL: DadosCanal = {
    devolucaoExternaId: '14958493',
    tipo: 'TROCA',
    pedidos: ['2000008003035430', '2000008003035431'],
    statusCanal: 'shipped/shipped',
    entregueSegundoCanalEm: null,
    prazoConferenciaCanal: new Date('2026-11-20T12:00:00Z'),
  };
  const ML: DadosNovaDevolucao = { ...DADOS, canal: 'MERCADO_LIVRE', pedido: '2000008003035430', reclamacaoId: '5292183123' };
  const AGORA = new Date('2026-11-12T15:00:00Z');

  it('cria como SISTEMA, sem usuário, com os dados do canal e todos os pedidos', async () => {
    const criada = await criarDevolucao(db, ML, { origem: 'API', usuario: null, canal: CANAL, agora: AGORA });
    expect(criada.unidades).toBe(3);
    const [d] = await db.select().from(devolucoes).where(eq(devolucoes.id, criada.id));
    expect(d).toMatchObject({
      origem: 'API',
      canal: 'MERCADO_LIVRE',
      status: 'PENDENTE_CHEGADA',
      criadoPor: null,
      devolucaoExternaId: '14958493',
      reclamacaoId: '5292183123',
      tipo: 'TROCA',
      pedidosExternos: ['2000008003035430', '2000008003035431'],
      statusCanal: 'shipped/shipped',
      prazoConferenciaCanal: CANAL.prazoConferenciaCanal,
      entregueSegundoCanalEm: null,
      criadaEm: AGORA,
    });
    expect(await listarEventos(db, 'devolucao', criada.id)).toEqual([
      expect.objectContaining({ acao: 'criada', de: null, para: 'PENDENTE_CHEGADA', usuarioNome: null, em: AGORA, dados: { origem: 'API', unidades: 3 } }),
    ]);
  });

  it('o mesmo id externo no mesmo canal é ErroDevolucaoDuplicada com o código da existente', async () => {
    const primeira = await criarDevolucao(db, ML, { origem: 'API', usuario: null, canal: CANAL });
    const erro = await criarDevolucao(db, ML, { origem: 'API', usuario: null, canal: CANAL }).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroDevolucaoDuplicada);
    expect((erro as ErroDevolucaoDuplicada).codigo).toBe(primeira.codigo);
  });

  it('pela API a chave é o id externo: outra devolução do mesmo pedido entra', async () => {
    await criarDevolucao(db, ML, { origem: 'API', usuario: null, canal: CANAL });
    const segunda = await criarDevolucao(db, ML, { origem: 'API', usuario: null, canal: { ...CANAL, devolucaoExternaId: '14958494' } });
    expect(segunda.codigo).toMatch(/^DEV-\d{6}$/);
  });

  it('pela API não confere o pacote não identificado do mesmo rastreio (decisão 12 do plano)', async () => {
    await criarNaoIdentificada(db, 'BR123456789BR', operador);
    await expect(criarDevolucao(db, ML, { origem: 'API', usuario: null, canal: CANAL })).resolves.toMatchObject({ unidades: 3 });
  });
});
```

Rode: `npm run test:int -- src/modules/devolucoes/criar.int.test.ts`
Esperado: FAIL (`DadosCanal` não existe; a origem `API` não é aceita).

- [ ] **Passo 2: Implementar**

Em `src/modules/devolucoes/criar.ts`:
1. Acrescente `type TipoDevolucao` ao import de `./dominio`.
2. Troque a função `criarDevolucao` inteira (com o seu comentário) por:

```ts
/** Dados que só a criação pela API do canal tem (contrato §5.5). */
export type DadosCanal = {
  devolucaoExternaId: string;
  tipo: TipoDevolucao;
  pedidos: string[];
  statusCanal: string;
  entregueSegundoCanalEm: Date | null;
  prazoConferenciaCanal: Date | null;
};

export type OpcoesCriacao =
  | { origem: 'MANUAL' | 'PLANILHA'; usuario: UsuarioSessao }
  | { origem: 'API'; usuario: null; canal: DadosCanal; agora?: Date };

/**
 * Cadastra a devolução em "Pendente de chegada" (spec §5.2, "(nova) → PENDENTE_CHEGADA"), com uma linha por unidade
 * e o evento no histórico. Funciona dentro de outra transação (a confirmação da planilha usa um savepoint).
 * Pela API (contrato §5.5): ator SISTEMA, sem usuário, e a chave é (canal, devolucao_externa_id) (spec §11).
 */
export async function criarDevolucao(db: DbOuTx, dados: DadosNovaDevolucao, opcoes: OpcoesCriacao): Promise<DevolucaoCriada> {
  exigirTransicao({ de: null, para: 'PENDENTE_CHEGADA', ator: opcoes.origem === 'API' ? 'SISTEMA' : opcoes.usuario.perfil });
  if (opcoes.origem === 'API') {
    const [existente] = await db
      .select({ codigo: devolucoes.codigo })
      .from(devolucoes)
      .where(and(eq(devolucoes.canal, dados.canal), eq(devolucoes.devolucaoExternaId, opcoes.canal.devolucaoExternaId)))
      .limit(1);
    if (existente) throw new ErroDevolucaoDuplicada(existente.codigo);
  } else {
    // Regra "uma devolução em andamento por pedido e canal": lê e depois insere, sem trava no banco. Decisão aceita
    // (sistema interno, pouca concorrência): duas criações simultâneas do mesmo pedido poderiam passar as duas.
    const existente = (await codigosAtivosPorPedido(db, [{ canal: dados.canal, pedido: dados.pedido }])).get(
      chavePedido(dados.canal, dados.pedido),
    );
    if (existente) throw new ErroDevolucaoDuplicada(existente);
    if (dados.rastreio) {
      const naoIdentificado = (await codigosNaoIdentificadosPorRastreio(db, [dados.rastreio])).get(dados.rastreio);
      if (naoIdentificado) throw new ErroDevolucao(mensagemRastreioNaoIdentificado(naoIdentificado));
    }
  }
  const unidades = expandirUnidades(dados.itens);
  if (unidades.length > LIMITE_UNIDADES_DEVOLUCAO) throw new ErroDevolucao(mensagemLimiteUnidades(unidades.length));
  const produtosPorSku = await idsDosProdutos(db, [...new Set(unidades)]);
  const agora = opcoes.origem === 'API' ? (opcoes.agora ?? new Date()) : null;
  const doCanal =
    opcoes.origem === 'API'
      ? {
          pedidosExternos: [...new Set([dados.pedido, ...opcoes.canal.pedidos])],
          devolucaoExternaId: opcoes.canal.devolucaoExternaId,
          tipo: opcoes.canal.tipo,
          statusCanal: opcoes.canal.statusCanal,
          entregueSegundoCanalEm: opcoes.canal.entregueSegundoCanalEm,
          prazoConferenciaCanal: opcoes.canal.prazoConferenciaCanal,
          criadoPor: null,
          ...(agora ? { criadaEm: agora, atualizadaEm: agora } : {}),
        }
      : { pedidosExternos: [dados.pedido], criadoPor: opcoes.usuario.id };

  return db.transaction(async (tx) => {
    const [criada] = await tx
      .insert(devolucoes)
      .values({
        canal: dados.canal,
        origem: opcoes.origem,
        reclamacaoId: dados.reclamacaoId,
        rastreio: dados.rastreio,
        transportadora: dados.transportadora,
        motivoCliente: dados.motivoCliente,
        postadaEm: dados.postadaEm,
        status: 'PENDENTE_CHEGADA',
        ...doCanal,
      })
      .returning({ id: devolucoes.id, codigo: devolucoes.codigo });
    if (unidades.length > 0) {
      await tx.insert(itensDevolucao).values(
        unidades.map((sku, i) => ({
          devolucaoId: criada.id,
          unidade: i + 1,
          sku,
          produtoEsperadoId: produtosPorSku.get(sku) ?? null,
        })),
      );
    }
    await registrarEvento(tx, {
      entidade: 'devolucao',
      entidadeId: criada.id,
      acao: 'criada',
      de: null,
      para: 'PENDENTE_CHEGADA',
      usuarioId: opcoes.origem === 'API' ? null : opcoes.usuario.id,
      dados: { origem: opcoes.origem, unidades: unidades.length },
      ...(agora ? { em: agora } : {}),
    });
    return { id: criada.id, codigo: criada.codigo, unidades: unidades.length };
  });
}
```

- [ ] **Passo 3: Rodar e confirmar que passa**

Rode: `npm run test:int -- src/modules/devolucoes src/modules/importacao && npm run typecheck && npm run lint`
Esperado: PASS. Os testes antigos de criação manual e por planilha continuam iguais, e os 4 novos passam.

- [ ] **Passo 4: Commit**

```bash
cd "/c/Users/idmpc/devolucoes-wt/fase-3"
git add src/modules/devolucoes/criar.ts src/modules/devolucoes/criar.int.test.ts
git commit -m "feat: criarDevolucao com origem API (ator SISTEMA, chave pelo id externo)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

<!-- CONTINUA-2 -->
