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

### Tarefa 9: Sincronização de uma reclamação (criar, vincular, atualizar, status §7.3, low_cost)

**Arquivos:**
- Criar: `src/modules/mercado-livre/status.ts`, `src/modules/mercado-livre/sincronizar.ts`
- Modificar (acrescentar): `tests/helpers/fabricas-ml.ts`
- Testes: `src/modules/mercado-livre/status.test.ts`, `src/modules/mercado-livre/sincronizar.int.test.ts`

**Interfaces:**
- Consome:
  - `criarDevolucao`, `DadosCanal` e `DadosNovaDevolucao` (Tarefa 8);
  - `DadosDevolucaoML`, `ConectorMercadoLivre` e `ErroFormatoML` (Tarefa 4), `ErroReclamacaoSemDevolucao` (Tarefa 5), `rotuloStatusML` (Tarefa 1);
  - `exigirTransicao`, `normalizarRastreio`, `normalizarSku`, `registrarEvento`, `Fila` e `FilaMemoria` (P2).
- Produz:
  - em `status.ts`:
    - `STATUS_ML_CANCELAMENTO`, `STATUS_ML_EXTRAVIO`, `ANTES_DA_CHEGADA`;
    - `type SituacaoML = Pick<DevolucaoExterna, 'statusCanal' | 'destinoEnvio' | 'reenvioDaTriagem'>`;
    - `statusDaDevolucaoML(statusCanal): string`;
    - `encerradaNoML(d: SituacaoML): 'CANCELADA' | 'EXTRAVIADA' | null`;
    - `proximoStatusML(atual: StatusDevolucao, d: SituacaoML): 'PENDENTE_CHEGADA' | 'CANCELADA' | 'EXTRAVIADA' | 'NO_CD_MARKETPLACE' | null`.
  - em `sincronizar.ts`:
    - `type ResultadoAplicacao = { acao: 'sem_devolucao' } | { acao: 'so_consulta'; motivo: 'low_cost' | 'encerrada_no_ml' } | { acao: 'criada' | 'vinculada' | 'atualizada'; devolucaoId; codigo; status: StatusDevolucao }`;
    - `dadosNovaDevolucao(d): DadosNovaDevolucao`, `dadosCanal(d): DadosCanal`;
    - `aplicarReclamacao(db, dados: DadosDevolucaoML, agora: Date, fila?: Fila): Promise<ResultadoAplicacao>`.
  - em `tests/helpers/fabricas-ml.ts`:
    - `devolucaoExternaTeste(m?)`;
    - `dadosDevolucaoMLTeste(devolucao | null, extra?)`;
    - `class ConectorMLMemoria`, com os campos `reclamacoes`, `enviados`, `buscas` e `falhaNoEnvio` e o método `guardar(dados): this`.

> **Ordem (contrato §5.5):**
> 1. Se já existe devolução pelo `devolucao_externa_id`, atualiza.
> 2. Senão, se existe devolução manual ativa do mesmo pedido no ML sem id externo, **vincula** (D9).
> 3. Senão, se é `low_cost`, só fica a consulta (D10).
> 4. Senão, se o ML já mostra cancelada ou extraviada, só fica a consulta (decisão 3).
> 5. Senão, `criarDevolucao` (origem API).
>
> Depois, a transição da spec §7.3. Tudo acontece numa transação, com uma trava por reclamação: o aviso e a varredura podem chegar juntos, e não pode sair duplicata (spec §11).

- [ ] **Passo 1: Fábricas (acrescentar)**

Em `tests/helpers/fabricas-ml.ts`, acrescente estes imports no topo:

```ts
import { ErroML } from '@/conectores/marketplace/mercadolivre/cliente';
import { ErroReclamacaoSemDevolucao } from '@/conectores/marketplace/mercadolivre/conector';
import type { ConectorMercadoLivre, DadosDevolucaoML, ReclamacaoAtualizada } from '@/conectores/marketplace/mercadolivre/tipos';
import type { DevolucaoExterna, ResultadoConferencia } from '@/conectores/marketplace/tipos';
```

e no final do arquivo:

```ts
let sequencia = 0;
function marca(): string {
  sequencia += 1;
  return `${Date.now().toString(36).toUpperCase()}${sequencia}`;
}

export function devolucaoExternaTeste(m: Partial<DevolucaoExterna> = {}): DevolucaoExterna {
  const id = marca();
  const pedido = `PED-ML-${id}`;
  return {
    canal: 'MERCADO_LIVRE',
    devolucaoExternaId: `RET-${id}`,
    reclamacaoId: `CLM-${id}`,
    tipo: 'DEVOLUCAO',
    semEnvioFisico: false,
    pedidos: [pedido],
    statusCanal: 'shipped/shipped',
    destinoEnvio: 'VENDEDOR',
    reenvioDaTriagem: false,
    rastreio: `ML${id}BR`,
    transportadora: 'Correios',
    entregueEm: null,
    prazoConferencia: new Date(Date.now() + 3 * 86_400_000),
    atualizadaEm: new Date(),
    itens: [{ pedido, sku: 'SKU-ML-1', ean: null, quantidade: 1 }],
    ...m,
  };
}

export function dadosDevolucaoMLTeste(
  devolucao: DevolucaoExterna | null,
  extra: Partial<Omit<DadosDevolucaoML, 'devolucao'>> = {},
): DadosDevolucaoML {
  return {
    reclamacaoId: devolucao?.reclamacaoId ?? `CLM-${marca()}`,
    statusReclamacao: 'opened',
    subtipo: devolucao === null ? null : devolucao.semEnvioFisico ? 'low_cost' : 'return_total',
    statusDevolucao: devolucao ? devolucao.statusCanal.split('/')[0] : null,
    atualizadaEm: new Date(),
    devolucao,
    ...extra,
  };
}

/** Conector do ML em memória para os testes de integração (o falso de src/ troca o fetch; este troca o conector inteiro). */
export class ConectorMLMemoria implements ConectorMercadoLivre {
  readonly canal = 'MERCADO_LIVRE' as const;
  readonly sellerId = VENDEDOR_TESTE;
  readonly reclamacoes = new Map<string, DadosDevolucaoML>();
  readonly enviados: { devolucaoExternaId: string; resultado: ResultadoConferencia }[] = [];
  readonly buscas: Date[] = [];
  falhaNoEnvio: unknown = null;

  guardar(dados: DadosDevolucaoML): this {
    this.reclamacoes.set(dados.reclamacaoId, dados);
    return this;
  }

  async obterReclamacao(reclamacaoId: string): Promise<DadosDevolucaoML> {
    const dados = this.reclamacoes.get(reclamacaoId);
    if (!dados) throw new ErroML(404, '{"message":"not_found"}', `/post-purchase/v1/claims/${reclamacaoId}`);
    return dados;
  }

  async obter(reclamacaoId: string): Promise<DevolucaoExterna> {
    const dados = await this.obterReclamacao(reclamacaoId);
    if (!dados.devolucao) throw new ErroReclamacaoSemDevolucao(reclamacaoId);
    return dados.devolucao;
  }

  async *reclamacoesAtualizadasDesde(desde: Date): AsyncGenerator<ReclamacaoAtualizada> {
    this.buscas.push(desde);
    for (const dados of this.reclamacoes.values()) yield { reclamacaoId: dados.reclamacaoId, atualizadaEm: dados.atualizadaEm };
  }

  async *listarAtualizadasDesde(desde: Date): AsyncGenerator<DevolucaoExterna> {
    for await (const r of this.reclamacoesAtualizadasDesde(desde)) {
      const dados = this.reclamacoes.get(r.reclamacaoId);
      if (dados?.devolucao) yield dados.devolucao;
    }
  }

  async enviarResultadoConferencia(devolucaoExternaId: string, resultado: ResultadoConferencia): Promise<void> {
    if (this.falhaNoEnvio) throw this.falhaNoEnvio;
    this.enviados.push({ devolucaoExternaId, resultado });
  }

  async obterXmlNotaVenda(): Promise<string | null> {
    return null;
  }
}
```

- [ ] **Passo 2: Escrever os testes que falham**

`src/modules/mercado-livre/status.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { encerradaNoML, proximoStatusML, statusDaDevolucaoML, type SituacaoML } from './status';

const aoVendedor = (statusCanal: string): SituacaoML => ({ statusCanal, destinoEnvio: 'VENDEDOR', reenvioDaTriagem: false });

describe('proximoStatusML (spec §7.3)', () => {
  it.each(['pending', 'label_generated', 'scheduled', 'shipped', 'pending_delivered', 'delivered'])('%s: continua Pendente de chegada', (s) => {
    expect(proximoStatusML('PENDENTE_CHEGADA', aoVendedor(`${s}/${s}`))).toBeNull();
  });

  it.each(['cancelled', 'pending_cancel', 'expired', 'pending_expiration', 'return_to_buyer'])('%s → CANCELADA', (s) => {
    expect(proximoStatusML('PENDENTE_CHEGADA', aoVendedor(s))).toBe('CANCELADA');
  });

  it.each(['not_delivered', 'failed', 'pending_failure'])('%s → EXTRAVIADA', (s) => {
    expect(proximoStatusML('PENDENTE_CHEGADA', aoVendedor(`${s}/not_delivered`))).toBe('EXTRAVIADA');
  });

  it('envio ao CD do ML → NO_CD_MARKETPLACE; o reenvio da triagem volta a Pendente de chegada', () => {
    expect(proximoStatusML('PENDENTE_CHEGADA', { statusCanal: 'delivered/delivered', destinoEnvio: 'CD_MARKETPLACE', reenvioDaTriagem: false })).toBe(
      'NO_CD_MARKETPLACE',
    );
    expect(proximoStatusML('NO_CD_MARKETPLACE', { statusCanal: 'shipped/shipped', destinoEnvio: 'VENDEDOR', reenvioDaTriagem: true })).toBe(
      'PENDENTE_CHEGADA',
    );
    expect(proximoStatusML('NO_CD_MARKETPLACE', { statusCanal: 'delivered/delivered', destinoEnvio: 'CD_MARKETPLACE', reenvioDaTriagem: false })).toBeNull();
  });

  it('depois da chegada física o status do ML não muda o do sistema', () => {
    for (const atual of ['AGUARDANDO_CONFERENCIA', 'EM_CONFERENCIA', 'AGUARDANDO_NF', 'CONCLUIDA'] as const) {
      expect(proximoStatusML(atual, aoVendedor('cancelled'))).toBeNull();
    }
  });

  it('no CD do ML, cancelamento não muda o status (a tabela da spec §5.2 não tem essa linha)', () => {
    expect(proximoStatusML('NO_CD_MARKETPLACE', aoVendedor('cancelled'))).toBeNull();
  });
});

describe('statusDaDevolucaoML e encerradaNoML', () => {
  it('lê a parte antes da barra', () => {
    expect(statusDaDevolucaoML('shipped/delivered')).toBe('shipped');
    expect(statusDaDevolucaoML('closed')).toBe('closed');
  });

  it('diz se o ML encerrou a devolução', () => {
    expect(encerradaNoML(aoVendedor('expired'))).toBe('CANCELADA');
    expect(encerradaNoML(aoVendedor('failed/not_delivered'))).toBe('EXTRAVIADA');
    expect(encerradaNoML(aoVendedor('shipped/shipped'))).toBeNull();
  });
});
```

`src/modules/mercado-livre/sincronizar.int.test.ts`:

```ts
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { devolucoes, itensDevolucao, reclamacoesMl } from '@/db/schema';
import { FilaMemoria } from '@/modules/fila/fila';
import { listarEventos } from '@/modules/historico/eventos';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarDevolucaoTeste, criarProdutoTeste, criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { dadosDevolucaoMLTeste, devolucaoExternaTeste } from '../../../tests/helpers/fabricas-ml';
import { aplicarReclamacao, type ResultadoAplicacao } from './sincronizar';

const { db, sql } = criarDbTeste();
const AGORA = new Date('2026-11-12T15:00:00Z');

beforeEach(async () => {
  await limparTabelas(sql);
});
afterAll(async () => {
  await sql.end();
});

async function devolucao(id: string) {
  const [d] = await db.select().from(devolucoes).where(eq(devolucoes.id, id));
  return d;
}
async function acoes(id: string) {
  return (await listarEventos(db, 'devolucao', id)).map((e) => e.acao);
}
async function reclamacao(claimId: string) {
  const [r] = await db.select().from(reclamacoesMl).where(eq(reclamacoesMl.claimId, claimId));
  return r;
}
function comDevolucao(r: ResultadoAplicacao): { devolucaoId: string; codigo: string } {
  if (!('devolucaoId' in r)) throw new Error(`esperava uma devolução, veio ${r.acao}`);
  return r;
}

describe('aplicarReclamacao (contrato §5.5, spec §7.2 e §7.3)', () => {
  it('cria pela API: Pendente de chegada, uma linha por unidade, SKU e rastreio normalizados, e o estado em reclamacoes_ml', async () => {
    const produtoId = await criarProdutoTeste(db, { sku: 'FONE-01' });
    const d = devolucaoExternaTeste({ pedidos: ['P1'], rastreio: 'ml 123 br', itens: [{ pedido: 'P1', sku: 'fone-01', ean: null, quantidade: 2 }] });
    const r = await aplicarReclamacao(db, dadosDevolucaoMLTeste(d), AGORA);
    expect(r).toMatchObject({ acao: 'criada', status: 'PENDENTE_CHEGADA' });
    const { devolucaoId } = comDevolucao(r);
    expect(await devolucao(devolucaoId)).toMatchObject({
      origem: 'API',
      canal: 'MERCADO_LIVRE',
      criadoPor: null,
      devolucaoExternaId: d.devolucaoExternaId,
      reclamacaoId: d.reclamacaoId,
      pedidosExternos: ['P1'],
      rastreio: 'ML123BR',
      statusCanal: 'shipped/shipped',
    });
    const itens = await db.select().from(itensDevolucao).where(eq(itensDevolucao.devolucaoId, devolucaoId));
    expect(itens.map((i) => [i.sku, i.produtoEsperadoId])).toEqual([
      ['FONE-01', produtoId],
      ['FONE-01', produtoId],
    ]);
    expect(await reclamacao(d.reclamacaoId)).toMatchObject({
      returnId: d.devolucaoExternaId,
      subtipo: 'return_total',
      statusDevolucao: 'shipped',
      devolucaoId,
      sincronizadaEm: AGORA,
    });
  });

  it('de novo: atualiza sem duplicar; status do ML mudou → ml_status_atualizado; igual → nada', async () => {
    const d = devolucaoExternaTeste();
    const { devolucaoId } = comDevolucao(await aplicarReclamacao(db, dadosDevolucaoMLTeste(d), AGORA));
    const mudou = { ...d, statusCanal: 'pending_delivered/shipped' };
    expect(await aplicarReclamacao(db, dadosDevolucaoMLTeste(mudou), AGORA)).toMatchObject({ acao: 'atualizada', devolucaoId });
    await aplicarReclamacao(db, dadosDevolucaoMLTeste(mudou), AGORA);
    expect(await db.select().from(devolucoes)).toHaveLength(1);
    expect((await devolucao(devolucaoId)).statusCanal).toBe('pending_delivered/shipped');
    expect(await acoes(devolucaoId)).toEqual(['criada', 'ml_status_atualizado']);
  });

  it('D9: vincula a devolução manual ativa do mesmo pedido, sem criar outra', async () => {
    const operador = await criarUsuarioTeste(db);
    const manual = await criarDevolucaoTeste(db, operador, { canal: 'MERCADO_LIVRE', pedido: 'P-D9', rastreio: null });
    const d = devolucaoExternaTeste({ pedidos: ['P-D9'] });
    expect(await aplicarReclamacao(db, dadosDevolucaoMLTeste(d), AGORA)).toMatchObject({ acao: 'vinculada', devolucaoId: manual.id });
    expect(await devolucao(manual.id)).toMatchObject({
      origem: 'MANUAL',
      devolucaoExternaId: d.devolucaoExternaId,
      reclamacaoId: d.reclamacaoId,
      rastreio: d.rastreio,
      statusCanal: d.statusCanal,
    });
    expect(await db.select().from(devolucoes)).toHaveLength(1);
    expect(await acoes(manual.id)).toEqual(['criada', 'ml_vinculada']);
  });

  it('vinculada depois da conferência: manda o resultado ao ML de novo (decisão 11)', async () => {
    const operador = await criarUsuarioTeste(db);
    const manual = await criarDevolucaoTeste(db, operador, { canal: 'MERCADO_LIVRE', pedido: 'P-CONF' });
    await db.update(devolucoes).set({ status: 'AGUARDANDO_NF' }).where(eq(devolucoes.id, manual.id));
    const fila = new FilaMemoria();
    await aplicarReclamacao(db, dadosDevolucaoMLTeste(devolucaoExternaTeste({ pedidos: ['P-CONF'] })), AGORA, fila);
    expect(fila.enviadas).toEqual([expect.objectContaining({ nome: 'ml.enviar-resultado', dados: { devolucaoId: manual.id } })]);
  });

  it('D10: low_cost fica só em reclamacoes_ml, sem devolução', async () => {
    const d = devolucaoExternaTeste({ semEnvioFisico: true, destinoEnvio: null, rastreio: null, statusCanal: 'closed' });
    expect(await aplicarReclamacao(db, dadosDevolucaoMLTeste(d), AGORA)).toEqual({ acao: 'so_consulta', motivo: 'low_cost' });
    expect(await db.select().from(devolucoes)).toEqual([]);
    expect(await reclamacao(d.reclamacaoId)).toMatchObject({ subtipo: 'low_cost', devolucaoId: null });
  });

  it('cancelada no ML já na primeira vez: não vira devolução (decisão 3)', async () => {
    const d = devolucaoExternaTeste({ statusCanal: 'cancelled/cancelled' });
    expect(await aplicarReclamacao(db, dadosDevolucaoMLTeste(d), AGORA)).toEqual({ acao: 'so_consulta', motivo: 'encerrada_no_ml' });
    expect(await db.select().from(devolucoes)).toEqual([]);
  });

  it('Pendente de chegada e cancelada no ML → CANCELADA, com o motivo no histórico', async () => {
    const d = devolucaoExternaTeste();
    const { devolucaoId } = comDevolucao(await aplicarReclamacao(db, dadosDevolucaoMLTeste(d), AGORA));
    expect(await aplicarReclamacao(db, dadosDevolucaoMLTeste({ ...d, statusCanal: 'cancelled/cancelled' }), AGORA)).toMatchObject({
      acao: 'atualizada',
      status: 'CANCELADA',
    });
    const eventos = await listarEventos(db, 'devolucao', devolucaoId);
    expect(eventos.at(-1)).toMatchObject({
      acao: 'cancelada',
      de: 'PENDENTE_CHEGADA',
      para: 'CANCELADA',
      usuarioNome: null,
      dados: { motivo: 'Status no Mercado Livre: Cancelada no ML' },
    });
  });

  it('CD do ML e reenvio da triagem: NO_CD_MARKETPLACE e de volta, com o rastreio novo', async () => {
    const d = devolucaoExternaTeste();
    const { devolucaoId } = comDevolucao(await aplicarReclamacao(db, dadosDevolucaoMLTeste(d), AGORA));
    await aplicarReclamacao(db, dadosDevolucaoMLTeste({ ...d, destinoEnvio: 'CD_MARKETPLACE', statusCanal: 'delivered/delivered' }), AGORA);
    expect((await devolucao(devolucaoId)).status).toBe('NO_CD_MARKETPLACE');
    const triagem = { ...d, destinoEnvio: 'VENDEDOR' as const, reenvioDaTriagem: true, rastreio: 'TRIAGEM123BR', statusCanal: 'shipped/shipped' };
    await aplicarReclamacao(db, dadosDevolucaoMLTeste(triagem), AGORA);
    expect(await devolucao(devolucaoId)).toMatchObject({ status: 'PENDENTE_CHEGADA', rastreio: 'TRIAGEM123BR' });
    expect(await acoes(devolucaoId)).toEqual(['criada', 'ml_status_atualizado', 'ml_no_cd', 'ml_status_atualizado', 'ml_reenviada_ao_vendedor']);
  });

  it('entregue segundo o ML: preenche a data, não muda o status e registra ml_entregue uma vez (spec §5.2)', async () => {
    const d = devolucaoExternaTeste();
    const { devolucaoId } = comDevolucao(await aplicarReclamacao(db, dadosDevolucaoMLTeste(d), AGORA));
    const entregue = { ...d, statusCanal: 'delivered/delivered', entregueEm: new Date('2026-11-12T10:00:00Z') };
    await aplicarReclamacao(db, dadosDevolucaoMLTeste(entregue), AGORA);
    await aplicarReclamacao(db, dadosDevolucaoMLTeste(entregue), AGORA);
    expect(await devolucao(devolucaoId)).toMatchObject({ status: 'PENDENTE_CHEGADA', entregueSegundoCanalEm: new Date('2026-11-12T10:00:00Z') });
    expect((await acoes(devolucaoId)).filter((a) => a === 'ml_entregue')).toHaveLength(1);
  });

  it('depois da chegada física: status do ML diferente só vira o evento ml_status_apos_chegada', async () => {
    const d = devolucaoExternaTeste();
    const { devolucaoId } = comDevolucao(await aplicarReclamacao(db, dadosDevolucaoMLTeste(d), AGORA));
    await db.update(devolucoes).set({ status: 'AGUARDANDO_CONFERENCIA', rastreio: 'LIDO123' }).where(eq(devolucoes.id, devolucaoId));
    await aplicarReclamacao(db, dadosDevolucaoMLTeste({ ...d, statusCanal: 'cancelled/cancelled', rastreio: 'OUTRO' }), AGORA);
    expect(await devolucao(devolucaoId)).toMatchObject({ status: 'AGUARDANDO_CONFERENCIA', rastreio: 'LIDO123' });
    expect((await acoes(devolucaoId)).at(-1)).toBe('ml_status_apos_chegada');
  });

  it('aviso e varredura ao mesmo tempo: uma devolução só (trava por reclamação)', async () => {
    const dados = dadosDevolucaoMLTeste(devolucaoExternaTeste());
    const resultados = await Promise.all([aplicarReclamacao(db, dados, AGORA), aplicarReclamacao(db, dados, AGORA)]);
    expect(resultados.map((r) => r.acao).sort()).toEqual(['atualizada', 'criada']);
    expect(await db.select().from(devolucoes)).toHaveLength(1);
  });

  it('reclamação sem devolução: só o registro em reclamacoes_ml', async () => {
    const dados = dadosDevolucaoMLTeste(null);
    expect(await aplicarReclamacao(db, dados, AGORA)).toEqual({ acao: 'sem_devolucao' });
    expect(await reclamacao(dados.reclamacaoId)).toMatchObject({ returnId: null, devolucaoId: null });
  });
});
```

Rode: `npm test -- src/modules/mercado-livre/status.test.ts`
Esperado: FAIL ("Failed to resolve import './status'").

- [ ] **Passo 3: Implementar a tradução de status**

`src/modules/mercado-livre/status.ts`:

```ts
import type { DevolucaoExterna } from '@/conectores/marketplace/tipos';
import type { StatusDevolucao } from '@/modules/devolucoes/dominio';

/** Spec §7.3. */
export const STATUS_ML_CANCELAMENTO: ReadonlySet<string> = new Set(['cancelled', 'pending_cancel', 'expired', 'pending_expiration', 'return_to_buyer']);
export const STATUS_ML_EXTRAVIO: ReadonlySet<string> = new Set(['not_delivered', 'failed', 'pending_failure']);
/** Antes da chegada física o status do ML ainda move a devolução; depois, só vira evento (spec §7.3). */
export const ANTES_DA_CHEGADA: readonly StatusDevolucao[] = ['PENDENTE_CHEGADA', 'NO_CD_MARKETPLACE'];

export type SituacaoML = Pick<DevolucaoExterna, 'statusCanal' | 'destinoEnvio' | 'reenvioDaTriagem'>;

/** O conector grava "<return.status>/<status do envio>" (decisão 2 do plano); a regra usa o da devolução. */
export function statusDaDevolucaoML(statusCanal: string): string {
  return statusCanal.split('/')[0];
}

export function encerradaNoML(d: SituacaoML): 'CANCELADA' | 'EXTRAVIADA' | null {
  const status = statusDaDevolucaoML(d.statusCanal);
  if (STATUS_ML_CANCELAMENTO.has(status)) return 'CANCELADA';
  if (STATUS_ML_EXTRAVIO.has(status)) return 'EXTRAVIADA';
  return null;
}

/**
 * Spec §7.3 aplicada a uma devolução que está em `atual`. Devolve o novo status, ou null quando nada muda. Só as
 * linhas da spec §5.2 que são do SISTEMA:
 * - de PENDENTE_CHEGADA para CANCELADA, EXTRAVIADA ou NO_CD_MARKETPLACE;
 * - de NO_CD_MARKETPLACE para PENDENTE_CHEGADA.
 * "Entregue" não muda o status (spec §5.2).
 */
export function proximoStatusML(atual: StatusDevolucao, d: SituacaoML): 'PENDENTE_CHEGADA' | 'CANCELADA' | 'EXTRAVIADA' | 'NO_CD_MARKETPLACE' | null {
  const encerrada = encerradaNoML(d);
  if (atual === 'PENDENTE_CHEGADA') {
    if (encerrada) return encerrada;
    if (d.destinoEnvio === 'CD_MARKETPLACE' && !d.reenvioDaTriagem) return 'NO_CD_MARKETPLACE';
    return null;
  }
  if (atual === 'NO_CD_MARKETPLACE' && d.reenvioDaTriagem && !encerrada) return 'PENDENTE_CHEGADA';
  return null;
}
```

Rode: `npm test -- src/modules/mercado-livre/status.test.ts`
Esperado: PASS (19 testes).

- [ ] **Passo 4: Implementar a sincronização**

`src/modules/mercado-livre/sincronizar.ts`:

```ts
import { and, asc, eq, isNull, ne, notInArray, sql } from 'drizzle-orm';
import { ErroFormatoML } from '@/conectores/marketplace/mercadolivre/mapeamento';
import type { DadosDevolucaoML } from '@/conectores/marketplace/mercadolivre/tipos';
import type { DevolucaoExterna } from '@/conectores/marketplace/tipos';
import type { DbOuTx } from '@/db/client';
import { devolucoes, reclamacoesMl } from '@/db/schema';
import { normalizarSku } from '@/modules/catalogo/documentos';
import { criarDevolucao, type DadosCanal, type DadosNovaDevolucao } from '@/modules/devolucoes/criar';
import type { StatusDevolucao } from '@/modules/devolucoes/dominio';
import { normalizarRastreio } from '@/modules/devolucoes/rastreio';
import { exigirTransicao } from '@/modules/devolucoes/transicoes';
import type { Fila } from '@/modules/fila/fila';
import { registrarEvento } from '@/modules/historico/eventos';
import { rotuloStatusML } from './dominio';
import { ANTES_DA_CHEGADA, encerradaNoML, proximoStatusML } from './status';

const ENCERRADAS: StatusDevolucao[] = ['CANCELADA', 'EXTRAVIADA', 'CONCLUIDA'];
/** Depois da conferência o resultado (OK ou contestação) já devia ter ido ao ML (decisão 11 do plano). */
const DEPOIS_DA_CONFERENCIA: StatusDevolucao[] = ['AGUARDANDO_NF', 'CONCLUIDA'];

export type ResultadoAplicacao =
  | { acao: 'sem_devolucao' }
  | { acao: 'so_consulta'; motivo: 'low_cost' | 'encerrada_no_ml' }
  | { acao: 'criada' | 'vinculada' | 'atualizada'; devolucaoId: string; codigo: string; status: StatusDevolucao };

type Atual = {
  id: string;
  codigo: string;
  status: StatusDevolucao;
  statusCanal: string | null;
  rastreio: string | null;
  transportadora: string | null;
  entregueSegundoCanalEm: Date | null;
  pedidosExternos: string[];
};

const COLUNAS = {
  id: devolucoes.id,
  codigo: devolucoes.codigo,
  status: devolucoes.status,
  statusCanal: devolucoes.statusCanal,
  rastreio: devolucoes.rastreio,
  transportadora: devolucoes.transportadora,
  entregueSegundoCanalEm: devolucoes.entregueSegundoCanalEm,
  pedidosExternos: devolucoes.pedidosExternos,
};

function rastreioDe(d: DevolucaoExterna): string | null {
  return d.rastreio ? normalizarRastreio(d.rastreio) || null : null;
}

function unir(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b])];
}

/** Contrato §5.5: canal MERCADO_LIVRE, pedido = pedidos[0], itens pelo seller_sku (somados por SKU). */
export function dadosNovaDevolucao(d: DevolucaoExterna): DadosNovaDevolucao {
  const pedido = d.pedidos[0];
  if (!pedido) throw new ErroFormatoML('devolução', 'sem número de pedido');
  const porSku = new Map<string, number>();
  for (const item of d.itens) {
    const sku = normalizarSku(item.sku);
    porSku.set(sku, (porSku.get(sku) ?? 0) + item.quantidade);
  }
  return {
    canal: 'MERCADO_LIVRE',
    pedido,
    reclamacaoId: d.reclamacaoId,
    rastreio: rastreioDe(d),
    transportadora: d.transportadora,
    motivoCliente: null,
    postadaEm: null,
    itens: [...porSku].map(([sku, quantidade]) => ({ sku, quantidade })),
  };
}

export function dadosCanal(d: DevolucaoExterna): DadosCanal {
  return {
    devolucaoExternaId: d.devolucaoExternaId,
    tipo: d.tipo,
    pedidos: d.pedidos,
    statusCanal: d.statusCanal,
    entregueSegundoCanalEm: d.entregueEm,
    prazoConferenciaCanal: d.prazoConferencia,
  };
}

async function evento(
  tx: DbOuTx,
  devolucaoId: string,
  acao: string,
  agora: Date,
  extra: { de?: string | null; para?: string | null; dados?: Record<string, unknown> } = {},
): Promise<void> {
  await registrarEvento(tx, { entidade: 'devolucao', entidadeId: devolucaoId, acao, usuarioId: null, em: agora, ...extra });
}

async function gravarReclamacao(tx: DbOuTx, dados: DadosDevolucaoML, devolucaoId: string | null, agora: Date): Promise<void> {
  const valores = {
    returnId: dados.devolucao?.devolucaoExternaId ?? null,
    subtipo: dados.subtipo,
    statusReclamacao: dados.statusReclamacao,
    statusDevolucao: dados.statusDevolucao,
    devolucaoId,
    atualizadaNoMlEm: dados.atualizadaEm,
    sincronizadaEm: agora,
  };
  await tx.insert(reclamacoesMl).values({ claimId: dados.reclamacaoId, ...valores }).onConflictDoUpdate({ target: reclamacoesMl.claimId, set: valores });
}

async function atualizar(tx: DbOuTx, atual: Atual, d: DevolucaoExterna, agora: Date): Promise<void> {
  const antesDaChegada = ANTES_DA_CHEGADA.includes(atual.status);
  const rastreio = rastreioDe(d);
  await tx
    .update(devolucoes)
    .set({
      statusCanal: d.statusCanal,
      prazoConferenciaCanal: d.prazoConferencia,
      tipo: d.tipo,
      pedidosExternos: unir(atual.pedidosExternos, d.pedidos),
      entregueSegundoCanalEm: atual.entregueSegundoCanalEm ?? d.entregueEm,
      // Antes da chegada o rastreio acompanha o ML (o reenvio da triagem traz um rastreio novo); depois, vale o lido na recepção.
      ...(antesDaChegada && rastreio ? { rastreio, transportadora: d.transportadora ?? atual.transportadora } : {}),
      atualizadaEm: agora,
    })
    .where(eq(devolucoes.id, atual.id));
  if (atual.statusCanal !== d.statusCanal) {
    await evento(tx, atual.id, antesDaChegada ? 'ml_status_atualizado' : 'ml_status_apos_chegada', agora, {
      dados: { statusCanalAnterior: atual.statusCanal, statusCanal: d.statusCanal },
    });
  }
  if (!atual.entregueSegundoCanalEm && d.entregueEm) await evento(tx, atual.id, 'ml_entregue', agora, { dados: { entregueEm: d.entregueEm.toISOString() } });
}

/** D9: devolução manual (ou de planilha) ativa do mesmo pedido no ML, ainda sem id externo. */
async function manualDoPedido(tx: DbOuTx, pedidos: string[]): Promise<Atual | null> {
  if (pedidos.length === 0) return null;
  const [d] = await tx
    .select(COLUNAS)
    .from(devolucoes)
    .where(
      and(
        eq(devolucoes.canal, 'MERCADO_LIVRE'),
        isNull(devolucoes.devolucaoExternaId),
        ne(devolucoes.origem, 'API'),
        notInArray(devolucoes.status, ENCERRADAS),
        sql`${devolucoes.pedidosExternos} && ARRAY[${sql.join(
          pedidos.map((p) => sql`${p}`),
          sql`, `,
        )}]::text[]`,
      ),
    )
    .orderBy(asc(devolucoes.numero))
    .limit(1);
  return d ?? null;
}

async function vincular(tx: DbOuTx, manual: Atual, d: DevolucaoExterna, agora: Date): Promise<boolean> {
  const [vinculada] = await tx
    .update(devolucoes)
    .set({
      devolucaoExternaId: d.devolucaoExternaId,
      reclamacaoId: sql`coalesce(${devolucoes.reclamacaoId}, ${d.reclamacaoId})`,
      tipo: d.tipo,
      statusCanal: d.statusCanal,
      prazoConferenciaCanal: d.prazoConferencia,
      entregueSegundoCanalEm: manual.entregueSegundoCanalEm ?? d.entregueEm,
      rastreio: manual.rastreio ?? rastreioDe(d),
      transportadora: manual.transportadora ?? d.transportadora,
      pedidosExternos: unir(manual.pedidosExternos, d.pedidos),
      atualizadaEm: agora,
    })
    .where(and(eq(devolucoes.id, manual.id), isNull(devolucoes.devolucaoExternaId)))
    .returning({ id: devolucoes.id });
  if (!vinculada) return false;
  await evento(tx, manual.id, 'ml_vinculada', agora, { dados: { devolucaoExternaId: d.devolucaoExternaId, reclamacaoId: d.reclamacaoId } });
  if (!manual.entregueSegundoCanalEm && d.entregueEm) await evento(tx, manual.id, 'ml_entregue', agora, { dados: { entregueEm: d.entregueEm.toISOString() } });
  return true;
}

async function aplicarStatus(tx: DbOuTx, alvo: Atual, d: DevolucaoExterna, agora: Date): Promise<StatusDevolucao> {
  const para = proximoStatusML(alvo.status, d);
  if (!para) return alvo.status;
  exigirTransicao({ de: alvo.status, para, ator: 'SISTEMA' });
  const [mudou] = await tx
    .update(devolucoes)
    .set({ status: para, atualizadaEm: agora })
    .where(and(eq(devolucoes.id, alvo.id), eq(devolucoes.status, alvo.status)))
    .returning({ id: devolucoes.id });
  // Outra ação mudou o status no meio (ex.: a recepção leu o rastreio): vale a dela.
  if (!mudou) return alvo.status;
  const encerrada = para === 'CANCELADA' || para === 'EXTRAVIADA';
  const acao = para === 'NO_CD_MARKETPLACE' ? 'ml_no_cd' : para === 'PENDENTE_CHEGADA' ? 'ml_reenviada_ao_vendedor' : para === 'CANCELADA' ? 'cancelada' : 'extraviada';
  await evento(tx, alvo.id, acao, agora, {
    de: alvo.status,
    para,
    dados: encerrada ? { motivo: `Status no Mercado Livre: ${rotuloStatusML(d.statusCanal)}` } : { statusCanal: d.statusCanal },
  });
  return para;
}

/**
 * Aplica no sistema o que o ML mostra de uma reclamação (contrato §5.5). Numa transação com trava por reclamação
 * (espaço 3 das travas do sistema: o 1 é do rastreio e o 2 da gestão de usuários).
 */
export async function aplicarReclamacao(db: DbOuTx, dados: DadosDevolucaoML, agora: Date, fila?: Fila): Promise<ResultadoAplicacao> {
  return db.transaction(async (tx): Promise<ResultadoAplicacao> => {
    await tx.execute(sql`select pg_advisory_xact_lock(3, hashtext(${`reclamacao:${dados.reclamacaoId}`}))`);
    const d = dados.devolucao;
    if (!d) {
      await gravarReclamacao(tx, dados, null, agora);
      return { acao: 'sem_devolucao' };
    }
    const [existente] = await tx
      .select(COLUNAS)
      .from(devolucoes)
      .where(and(eq(devolucoes.canal, 'MERCADO_LIVRE'), eq(devolucoes.devolucaoExternaId, d.devolucaoExternaId)))
      .limit(1);
    let acao: 'criada' | 'vinculada' | 'atualizada';
    let alvoId: string;
    if (existente) {
      await atualizar(tx, existente, d, agora);
      acao = 'atualizada';
      alvoId = existente.id;
    } else {
      const manual = d.semEnvioFisico ? null : await manualDoPedido(tx, d.pedidos);
      if (manual && (await vincular(tx, manual, d, agora))) {
        acao = 'vinculada';
        alvoId = manual.id;
      } else if (d.semEnvioFisico || encerradaNoML(d)) {
        await gravarReclamacao(tx, dados, null, agora);
        return { acao: 'so_consulta', motivo: d.semEnvioFisico ? 'low_cost' : 'encerrada_no_ml' };
      } else {
        const criada = await criarDevolucao(tx, dadosNovaDevolucao(d), { origem: 'API', usuario: null, canal: dadosCanal(d), agora });
        if (d.entregueEm) await evento(tx, criada.id, 'ml_entregue', agora, { dados: { entregueEm: d.entregueEm.toISOString() } });
        acao = 'criada';
        alvoId = criada.id;
      }
    }
    const [alvo] = await tx.select(COLUNAS).from(devolucoes).where(eq(devolucoes.id, alvoId));
    const status = await aplicarStatus(tx, alvo, d, agora);
    await gravarReclamacao(tx, dados, alvo.id, agora);
    if (acao === 'vinculada' && fila && DEPOIS_DA_CONFERENCIA.includes(status)) {
      await fila.enviar('ml.enviar-resultado', { devolucaoId: alvo.id }, { tx, chaveUnica: alvo.id });
    }
    return { acao, devolucaoId: alvo.id, codigo: alvo.codigo, status };
  });
}
```

- [ ] **Passo 5: Rodar e confirmar que passa**

Rode: `npm test -- src/modules/mercado-livre && npm run test:int -- src/modules/mercado-livre/sincronizar.int.test.ts && npm run typecheck && npm run lint`
Esperado: PASS (status 19, sincronização 12).

- [ ] **Passo 6: Commit**

```bash
cd "/c/Users/idmpc/devolucoes-wt/fase-3"
git add src/modules/mercado-livre/status.ts src/modules/mercado-livre/status.test.ts src/modules/mercado-livre/sincronizar.ts src/modules/mercado-livre/sincronizar.int.test.ts tests/helpers/fabricas-ml.ts
git commit -m "feat: sincronização da reclamação do ML (cria, vincula D9, low_cost D10, status da spec §7.3)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 10: Avisos do ML, varredura, renovação e manipuladores; limite por IP

**Arquivos:**
- Criar: `src/lib/limite-taxa.ts`, `src/modules/mercado-livre/notificacoes.ts`, `src/modules/mercado-livre/tarefas.ts`
- Modificar:
  - `src/conectores/marketplace/mercadolivre/notificacoes.ts`: entra `idReclamacaoDoRecurso` e `_id`; a gravação sai daqui (pendência da Fase 0: "persistência atrás do conector");
  - `src/conectores/marketplace/mercadolivre/notificacoes.test.ts`;
  - `src/app/api/ml/notificacoes/route.ts`;
  - `src/worker/manipuladores/mercado-livre.ts` (troca o `{}` da P2).
- Apagar: `src/conectores/marketplace/mercadolivre/notificacoes.int.test.ts` (o teste vai para o módulo)
- Testes: `src/lib/limite-taxa.test.ts`, `src/modules/mercado-livre/notificacoes.int.test.ts`, `src/modules/mercado-livre/tarefas.int.test.ts`

**Interfaces:**
- Consome:
  - `aplicarReclamacao` (Tarefa 9);
  - `obterConectorML`, `obterContaML`, `marcarSincronizacao`, `renovarContasAVencer`, `ErroContaReconectar` e `fetchDoML` (Tarefa 7);
  - `configML` (Tarefa 2), `ehRecusaDefinitiva` e `logErroML` (Tarefa 2);
  - `Fila`, `obterFila`, `CONFIG_TAREFAS`, `NomeTarefa`, `ContextoTarefa` e `Manipuladores` (P2).
- Produz:
  - em `src/lib/limite-taxa.ts`: `type Limitador = { permitir(chave: string, agoraMs?: number): boolean; tamanho(): number }`, `criarLimitador(p: { maximo; janelaMs; maxChaves? }): Limitador`, `ipDaRequisicao(cabecalhos: Headers): string`;
  - no conector: `idReclamacaoDoRecurso(recurso: string | null): string | null`;
  - em `src/modules/mercado-livre/notificacoes.ts`: `CANAL_NOTIFICACAO_ML = 'mercado_livre'`, `chaveTarefaReclamacao(id): string`, `receberNotificacaoML(db, fila, n: NotificacaoML): Promise<{ id: number; enfileirada: boolean }>`, `marcarNotificacoesProcessadas(db, reclamacaoId, agora): Promise<number>`;
  - em `src/modules/mercado-livre/tarefas.ts`:
    - `JANELA_INICIAL_MS` (30 dias), `SOBREPOSICAO_MS` (10 min);
    - `ehUltimaTentativa(nome: NomeTarefa, tentativa: number): boolean`;
    - `sincronizarReclamacao(db, fila, reclamacaoId, agora): Promise<ResultadoAplicacao | null>`;
    - `varrerReclamacoes(db, fila, agora): Promise<{ enfileiradas: number } | null>`;
    - `renovarTokensML(db, agora)`.
  - `manipuladoresMercadoLivre` com `ml.sincronizar-reclamacao`, `ml.varredura` e `ml.renovar-token`.

> `ehUltimaTentativa` supõe que `ContextoTarefa.tentativa` começa em 1 e chega a `CONFIG_TAREFAS[nome].tentativas` (5) na última. Confira na P2. Se ela começar em 0, use `tentativa + 1`.

- [ ] **Passo 1: Escrever os testes que falham**

`src/lib/limite-taxa.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { criarLimitador, ipDaRequisicao } from './limite-taxa';

describe('criarLimitador', () => {
  it('deixa passar até o máximo na janela e recusa o resto; cada chave tem a sua conta', () => {
    const limitador = criarLimitador({ maximo: 2, janelaMs: 1000 });
    expect([limitador.permitir('a', 0), limitador.permitir('a', 10), limitador.permitir('a', 20)]).toEqual([true, true, false]);
    expect(limitador.permitir('b', 20)).toBe(true);
  });

  it('a janela recomeça depois do tempo', () => {
    const limitador = criarLimitador({ maximo: 1, janelaMs: 1000 });
    expect(limitador.permitir('a', 0)).toBe(true);
    expect(limitador.permitir('a', 999)).toBe(false);
    expect(limitador.permitir('a', 1000)).toBe(true);
  });

  it('não cresce sem limite: limpa as janelas vencidas', () => {
    const limitador = criarLimitador({ maximo: 1, janelaMs: 1000, maxChaves: 2 });
    limitador.permitir('a', 0);
    limitador.permitir('b', 0);
    expect(limitador.permitir('c', 2000)).toBe(true);
    expect(limitador.tamanho()).toBeLessThanOrEqual(2);
  });
});

describe('ipDaRequisicao', () => {
  it('usa o último endereço do X-Forwarded-For (o que o nginx da VPS viu)', () => {
    expect(ipDaRequisicao(new Headers({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2' }))).toBe('2.2.2.2');
    expect(ipDaRequisicao(new Headers({ 'x-real-ip': '3.3.3.3' }))).toBe('3.3.3.3');
    expect(ipDaRequisicao(new Headers())).toBe('desconhecido');
  });
});
```

Em `src/conectores/marketplace/mercadolivre/notificacoes.test.ts`, acrescente `idReclamacaoDoRecurso` ao import de `./notificacoes`, ponha no topo `import notificacaoDoc from '../../../../tests/fixtures/ml/doc/notificacao.json';` e acrescente no **final**:

```ts
describe('idReclamacaoDoRecurso (suposição A12)', () => {
  it.each([
    ['/post-purchase/v1/claims/5292183123', '5292183123'],
    ['/post-purchase/v1/claims/5292183123/actions', '5292183123'],
    ['/post-purchase/v2/claims/5292183123?x=1', '5292183123'],
  ])('%s → %s', (recurso, id) => {
    expect(idReclamacaoDoRecurso(recurso)).toBe(id);
  });

  it('outros recursos → null', () => {
    expect(idReclamacaoDoRecurso('/orders/2000008003035430')).toBeNull();
    expect(idReclamacaoDoRecurso(null)).toBeNull();
  });
});

describe('aviso do exemplo da documentação', () => {
  it('guarda todos os campos conhecidos, inclusive o _id', () => {
    expect(aceitarNotificacaoML(notificacaoDoc, undefined)?.payload).toEqual(notificacaoDoc);
  });
});
```

`src/modules/mercado-livre/notificacoes.int.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { notificacoesRecebidas } from '@/db/schema';
import { FilaMemoria } from '@/modules/fila/fila';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { contaMLTeste } from '../../../tests/helpers/fabricas-ml';
import { marcarNotificacoesProcessadas, receberNotificacaoML } from './notificacoes';

const { db, sql } = criarDbTeste();
let fila: FilaMemoria;
beforeEach(async () => {
  await limparTabelas(sql);
  fila = new FilaMemoria();
});
afterAll(async () => {
  await sql.end();
});

const aviso = (recurso: string, vendedor: unknown = 123456789) => ({
  topico: 'post_purchase',
  recurso,
  payload: { resource: recurso, user_id: vendedor, topic: 'post_purchase' },
});

describe('receberNotificacaoML (spec §7.2)', () => {
  it('grava o aviso com a referência e enfileira a sincronização quando o vendedor está conectado', async () => {
    await contaMLTeste(db);
    const r = await receberNotificacaoML(db, fila, aviso('/post-purchase/v1/claims/5292183123'));
    expect(r.enfileirada).toBe(true);
    const [linha] = await db.select().from(notificacoesRecebidas);
    expect(linha).toMatchObject({
      id: r.id,
      canal: 'mercado_livre',
      topico: 'post_purchase',
      recurso: '/post-purchase/v1/claims/5292183123',
      referenciaExterna: '5292183123',
      processadaEm: null,
    });
    expect(fila.enviadas).toEqual([
      { nome: 'ml.sincronizar-reclamacao', dados: { claimId: '5292183123' }, opcoes: expect.objectContaining({ chaveUnica: 'ml-reclamacao-5292183123' }) },
    ]);
  });

  it('vendedor desconhecido, sem conta, ou recurso que não é reclamação: grava e não enfileira', async () => {
    expect((await receberNotificacaoML(db, fila, aviso('/post-purchase/v1/claims/1'))).enfileirada).toBe(false);
    await contaMLTeste(db);
    expect((await receberNotificacaoML(db, fila, aviso('/post-purchase/v1/claims/2', 999))).enfileirada).toBe(false);
    expect((await receberNotificacaoML(db, fila, aviso('/orders/3'))).enfileirada).toBe(false);
    expect(await db.select().from(notificacoesRecebidas)).toHaveLength(3);
    expect(fila.enviadas).toEqual([]);
  });
});

describe('marcarNotificacoesProcessadas', () => {
  it('marca só os avisos ainda abertos daquela reclamação', async () => {
    await receberNotificacaoML(db, fila, aviso('/post-purchase/v1/claims/1'));
    await receberNotificacaoML(db, fila, aviso('/post-purchase/v1/claims/1'));
    await receberNotificacaoML(db, fila, aviso('/post-purchase/v1/claims/2'));
    const agora = new Date('2026-11-12T15:00:00Z');
    expect(await marcarNotificacoesProcessadas(db, '1', agora)).toBe(2);
    expect(await marcarNotificacoesProcessadas(db, '1', agora)).toBe(0);
    const linhas = await db.select().from(notificacoesRecebidas);
    expect(linhas.filter((l) => l.processadaEm !== null).map((l) => l.referenciaExterna)).toEqual(['1', '1']);
  });
});
```

`src/modules/mercado-livre/tarefas.int.test.ts`:

```ts
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErroML } from '@/conectores/marketplace/mercadolivre/cliente';
import { definirConectorParaTestes } from '@/conectores/marketplace/registro';
import { contasMarketplace, devolucoes, notificacoesRecebidas } from '@/db/schema';
import { FilaMemoria } from '@/modules/fila/fila';
import type { ContextoTarefa } from '@/worker/tipos';
import { manipuladoresMercadoLivre } from '@/worker/manipuladores/mercado-livre';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { ConectorMLMemoria, contaMLTeste, dadosDevolucaoMLTeste, devolucaoExternaTeste } from '../../../tests/helpers/fabricas-ml';
import { marcarSincronizacao, obterContaML } from './contas';
import { receberNotificacaoML } from './notificacoes';
import { JANELA_INICIAL_MS, sincronizarReclamacao, varrerReclamacoes } from './tarefas';

const { db, sql } = criarDbTeste();
const AGORA = new Date('2026-11-12T15:00:00Z');
let fila: FilaMemoria;
let conector: ConectorMLMemoria;

beforeEach(async () => {
  await limparTabelas(sql);
  fila = new FilaMemoria();
  conector = new ConectorMLMemoria();
  definirConectorParaTestes('MERCADO_LIVRE', conector);
});
afterEach(() => {
  definirConectorParaTestes('MERCADO_LIVRE', null);
  vi.restoreAllMocks();
});
afterAll(async () => {
  await sql.end();
});

const reclamacaoNova = (reclamacaoId: string) => dadosDevolucaoMLTeste(devolucaoExternaTeste({ reclamacaoId }));

describe('sincronizarReclamacao (tarefa ml.sincronizar-reclamacao)', () => {
  it('busca a reclamação no conector, cria a devolução e marca os avisos como processados', async () => {
    await contaMLTeste(db);
    conector.guardar(reclamacaoNova('5000000001'));
    await receberNotificacaoML(db, fila, { topico: 'post_purchase', recurso: '/post-purchase/v1/claims/5000000001', payload: { user_id: 123456789 } });
    expect(await sincronizarReclamacao(db, fila, '5000000001', AGORA)).toMatchObject({ acao: 'criada' });
    const [aviso] = await db.select().from(notificacoesRecebidas);
    expect(aviso.processadaEm).toEqual(AGORA);
  });

  it('reclamação que o ML não acha (404): termina sem erro', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await sincronizarReclamacao(db, fila, '5999999999', AGORA)).toBeNull();
  });

  it('sem conta ATIVA (conector real, sem substituto): não faz nada', async () => {
    definirConectorParaTestes('MERCADO_LIVRE', null);
    expect(await sincronizarReclamacao(db, fila, '5000000001', AGORA)).toBeNull();
  });

  it('erro passageiro (500) lança, para a fila tentar de novo', async () => {
    conector.obterReclamacao = async () => {
      throw new ErroML(500, '', '/post-purchase/v1/claims/5000000001');
    };
    await expect(sincronizarReclamacao(db, fila, '5000000001', AGORA)).rejects.toMatchObject({ status: 500 });
  });
});

describe('varrerReclamacoes (tarefa ml.varredura, a cada 15 min)', () => {
  it('primeira vez: busca 30 dias para trás, enfileira cada reclamação e grava a última sincronização', async () => {
    await contaMLTeste(db);
    conector.guardar(reclamacaoNova('5000000001')).guardar(reclamacaoNova('5000000002'));
    expect(await varrerReclamacoes(db, fila, AGORA)).toEqual({ enfileiradas: 2 });
    expect(conector.buscas).toEqual([new Date(AGORA.getTime() - JANELA_INICIAL_MS)]);
    expect(fila.enviadas.map((e) => e.dados)).toEqual([{ claimId: '5000000001' }, { claimId: '5000000002' }]);
    expect((await obterContaML(db))?.ultimaSincronizacaoEm).toEqual(AGORA);
  });

  it('depois: desde a última sincronização menos 10 minutos', async () => {
    const { contaId } = await contaMLTeste(db);
    await marcarSincronizacao(db, contaId, new Date('2026-11-12T14:45:00Z'));
    await varrerReclamacoes(db, fila, AGORA);
    expect(conector.buscas).toEqual([new Date('2026-11-12T14:35:00Z')]);
  });

  it('sem conta, ou com a conta em RECONECTAR: não varre', async () => {
    expect(await varrerReclamacoes(db, fila, AGORA)).toBeNull();
    const { contaId } = await contaMLTeste(db);
    await db.update(contasMarketplace).set({ situacao: 'RECONECTAR' }).where(eq(contasMarketplace.id, contaId));
    expect(await varrerReclamacoes(db, fila, AGORA)).toBeNull();
    expect(conector.buscas).toEqual([]);
  });
});

describe('manipuladores do worker (contrato §5.1)', () => {
  it('ml.sincronizar-reclamacao usa o db, a fila e a hora da tarefa', async () => {
    await contaMLTeste(db);
    conector.guardar(reclamacaoNova('5000000003'));
    const ctx: ContextoTarefa = { db, fila, agora: AGORA, tentativa: 1 };
    await manipuladoresMercadoLivre['ml.sincronizar-reclamacao']?.({ claimId: '5000000003' }, ctx);
    expect(await db.select().from(devolucoes)).toHaveLength(1);
  });

  it('ml.varredura e ml.renovar-token estão registrados', () => {
    expect(typeof manipuladoresMercadoLivre['ml.varredura']).toBe('function');
    expect(typeof manipuladoresMercadoLivre['ml.renovar-token']).toBe('function');
  });
});
```

Rode: `npm test -- src/lib/limite-taxa.test.ts src/conectores/marketplace/mercadolivre/notificacoes.test.ts`
Esperado: FAIL (`limite-taxa` e `idReclamacaoDoRecurso` não existem).

- [ ] **Passo 2: Limite por IP**

`src/lib/limite-taxa.ts`:

```ts
export type Limitador = { permitir(chave: string, agoraMs?: number): boolean; tamanho(): number };

/** Janela fixa por chave, em memória (um processo web). Para endpoints públicos (pendência da Fase 0). */
export function criarLimitador(p: { maximo: number; janelaMs: number; maxChaves?: number }): Limitador {
  const janelas = new Map<string, { inicio: number; contagem: number }>();
  const maxChaves = p.maxChaves ?? 10_000;
  return {
    permitir(chave: string, agoraMs: number = Date.now()): boolean {
      const atual = janelas.get(chave);
      if (atual && agoraMs - atual.inicio < p.janelaMs) {
        atual.contagem += 1;
        return atual.contagem <= p.maximo;
      }
      if (!atual && janelas.size >= maxChaves) {
        for (const [k, v] of janelas) if (agoraMs - v.inicio >= p.janelaMs) janelas.delete(k);
        // Proteção de memória: se nada venceu, recomeça do zero.
        if (janelas.size >= maxChaves) janelas.clear();
      }
      janelas.set(chave, { inicio: agoraMs, contagem: 1 });
      return true;
    },
    tamanho: () => janelas.size,
  };
}

/** IP de quem chamou: o último endereço do X-Forwarded-For é o que o nginx da VPS viu (o cliente não forja esse). */
export function ipDaRequisicao(cabecalhos: Headers): string {
  const lista = (cabecalhos.get('x-forwarded-for') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return lista.at(-1) ?? cabecalhos.get('x-real-ip') ?? 'desconhecido';
}
```

- [ ] **Passo 3: Aviso no conector (só leitura) e no módulo (gravação e fila)**

Em `src/conectores/marketplace/mercadolivre/notificacoes.ts`:
1. Troque `CAMPOS_CONHECIDOS` por:

   ```ts
   const CAMPOS_CONHECIDOS = ['_id', 'id', 'resource', 'user_id', 'topic', 'application_id', 'attempts', 'sent', 'received', 'actions'] as const;
   ```

2. **Apague** a função `registrarNotificacao` e os imports de `@/db/client` e `@/db/schema`.
3. Acrescente no final:

   ```ts
   /** "/post-purchase/v1/claims/5292183123" (e variações com /actions ou ?...) → "5292183123". Outros recursos → null. */
   export function idReclamacaoDoRecurso(recurso: string | null): string | null {
     const m = recurso ? /^\/post-purchase\/v\d+\/claims\/(\d+)(?:[/?#].*)?$/.exec(recurso.trim()) : null;
     return m ? m[1] : null;
   }
   ```

Apague `src/conectores/marketplace/mercadolivre/notificacoes.int.test.ts` (o teste da gravação agora é o do módulo).

`src/modules/mercado-livre/notificacoes.ts`:

```ts
import { and, eq, isNull } from 'drizzle-orm';
import { idReclamacaoDoRecurso, type NotificacaoML } from '@/conectores/marketplace/mercadolivre/notificacoes';
import type { DbOuTx } from '@/db/client';
import { contasMarketplace, notificacoesRecebidas } from '@/db/schema';
import type { Fila } from '@/modules/fila/fila';

export const CANAL_NOTIFICACAO_ML = 'mercado_livre';

/** Chave única na fila: o mesmo aviso repetido (ou aviso + varredura) não empilha tarefas iguais. */
export function chaveTarefaReclamacao(reclamacaoId: string): string {
  return `ml-reclamacao-${reclamacaoId}`;
}

/**
 * Spec §7.2: grava o aviso e, se for de uma reclamação de um vendedor conectado, enfileira a sincronização na mesma
 * transação. O conteúdo do aviso é só gatilho: a tarefa busca a reclamação de novo na API.
 */
export async function receberNotificacaoML(db: DbOuTx, fila: Fila, n: NotificacaoML): Promise<{ id: number; enfileirada: boolean }> {
  const reclamacaoId = idReclamacaoDoRecurso(n.recurso);
  const usuarioDoAviso = n.payload.user_id;
  const vendedor = typeof usuarioDoAviso === 'number' || typeof usuarioDoAviso === 'string' ? String(usuarioDoAviso) : null;
  return db.transaction(async (tx) => {
    const [linha] = await tx
      .insert(notificacoesRecebidas)
      .values({ canal: CANAL_NOTIFICACAO_ML, topico: n.topico, recurso: n.recurso, payload: n.payload, referenciaExterna: reclamacaoId })
      .returning({ id: notificacoesRecebidas.id });
    if (!reclamacaoId || !vendedor) return { id: linha.id, enfileirada: false };
    const [conta] = await tx
      .select({ id: contasMarketplace.id })
      .from(contasMarketplace)
      .where(and(eq(contasMarketplace.canal, 'MERCADO_LIVRE'), eq(contasMarketplace.sellerId, vendedor)))
      .limit(1);
    if (!conta) return { id: linha.id, enfileirada: false };
    await fila.enviar('ml.sincronizar-reclamacao', { claimId: reclamacaoId }, { tx, chaveUnica: chaveTarefaReclamacao(reclamacaoId) });
    return { id: linha.id, enfileirada: true };
  });
}

export async function marcarNotificacoesProcessadas(db: DbOuTx, reclamacaoId: string, agora: Date): Promise<number> {
  const linhas = await db
    .update(notificacoesRecebidas)
    .set({ processadaEm: agora })
    .where(
      and(
        eq(notificacoesRecebidas.canal, CANAL_NOTIFICACAO_ML),
        eq(notificacoesRecebidas.referenciaExterna, reclamacaoId),
        isNull(notificacoesRecebidas.processadaEm),
      ),
    )
    .returning({ id: notificacoesRecebidas.id });
  return linhas.length;
}
```

- [ ] **Passo 4: Tarefas, manipuladores e rota**

`src/modules/mercado-livre/tarefas.ts`:

```ts
import { ehRecusaDefinitiva, logErroML } from '@/conectores/marketplace/mercadolivre/erros';
import type { DadosDevolucaoML } from '@/conectores/marketplace/mercadolivre/tipos';
import type { DbOuTx } from '@/db/client';
import type { Fila } from '@/modules/fila/fila';
import { CONFIG_TAREFAS, type NomeTarefa } from '@/modules/fila/tarefas';
import { configML } from './config';
import { obterConectorML } from './conector';
import { ErroContaReconectar, marcarSincronizacao, obterContaML, renovarContasAVencer } from './contas';
import { fetchDoML } from './fabrica-conector';
import { chaveTarefaReclamacao, marcarNotificacoesProcessadas } from './notificacoes';
import { aplicarReclamacao, type ResultadoAplicacao } from './sincronizar';

/** Primeira varredura: 30 dias para trás; depois, desde a última menos 10 min (decisão 4 do plano). */
export const JANELA_INICIAL_MS = 30 * 24 * 60 * 60 * 1000;
export const SOBREPOSICAO_MS = 10 * 60 * 1000;

/** `tentativa` começa em 1 (confirmar na P2); a última é a de número CONFIG_TAREFAS[nome].tentativas (spec §11: 5). */
export function ehUltimaTentativa(nome: NomeTarefa, tentativa: number): boolean {
  return tentativa >= CONFIG_TAREFAS[nome].tentativas;
}

/** Tarefa ml.sincronizar-reclamacao. Sem conta ATIVA, ou com recusa definitiva do ML, termina sem erro. */
export async function sincronizarReclamacao(db: DbOuTx, fila: Fila, reclamacaoId: string, agora: Date): Promise<ResultadoAplicacao | null> {
  const conector = await obterConectorML(db);
  if (!conector) return null;
  let dados: DadosDevolucaoML;
  try {
    dados = await conector.obterReclamacao(reclamacaoId);
  } catch (erro) {
    if (erro instanceof ErroContaReconectar) return null;
    if (!ehRecusaDefinitiva(erro)) throw erro;
    logErroML('sincronizar reclamação', erro, { reclamacaoId });
    await marcarNotificacoesProcessadas(db, reclamacaoId, agora);
    return null;
  }
  const resultado = await aplicarReclamacao(db, dados, agora, fila);
  await marcarNotificacoesProcessadas(db, reclamacaoId, agora);
  return resultado;
}

/** Tarefa ml.varredura (a cada 15 min, spec §7.2): só lista e enfileira; grava a última sincronização no fim. */
export async function varrerReclamacoes(db: DbOuTx, fila: Fila, agora: Date): Promise<{ enfileiradas: number } | null> {
  const conta = await obterContaML(db);
  if (!conta || conta.situacao !== 'ATIVA') return null;
  const conector = await obterConectorML(db);
  if (!conector) return null;
  const desde = conta.ultimaSincronizacaoEm
    ? new Date(conta.ultimaSincronizacaoEm.getTime() - SOBREPOSICAO_MS)
    : new Date(agora.getTime() - JANELA_INICIAL_MS);
  let enfileiradas = 0;
  try {
    for await (const r of conector.reclamacoesAtualizadasDesde(desde)) {
      await fila.enviar('ml.sincronizar-reclamacao', { claimId: r.reclamacaoId }, { chaveUnica: chaveTarefaReclamacao(r.reclamacaoId) });
      enfileiradas += 1;
    }
  } catch (erro) {
    if (erro instanceof ErroContaReconectar) return null;
    throw erro;
  }
  await marcarSincronizacao(db, conta.id, agora);
  return { enfileiradas };
}

/** Tarefa ml.renovar-token (a cada 5 h). */
export async function renovarTokensML(db: DbOuTx, agora: Date) {
  const config = configML();
  return renovarContasAVencer(db, { config, fetchFn: fetchDoML(config), agora });
}
```

`src/worker/manipuladores/mercado-livre.ts` (troca o `{}` da P2):

```ts
import { renovarTokensML, sincronizarReclamacao, varrerReclamacoes } from '@/modules/mercado-livre/tarefas';
import type { Manipuladores } from '../tipos';

/** Fase 3 (contrato §5.1). Cada manipulador é idempotente; lançar = nova tentativa. */
export const manipuladoresMercadoLivre: Manipuladores = {
  'ml.sincronizar-reclamacao': async ({ claimId }, ctx) => {
    await sincronizarReclamacao(ctx.db, ctx.fila, claimId, ctx.agora);
  },
  'ml.varredura': async (_dados, ctx) => {
    await varrerReclamacoes(ctx.db, ctx.fila, ctx.agora);
  },
  'ml.renovar-token': async (_dados, ctx) => {
    await renovarTokensML(ctx.db, ctx.agora);
  },
};
```

`src/app/api/ml/notificacoes/route.ts` (substitua o conteúdo):

```ts
import { aceitarNotificacaoML, LIMITE_AVISO_BYTES, lerAvisoML } from '@/conectores/marketplace/mercadolivre/notificacoes';
import { obterDb } from '@/db';
import { criarLimitador, ipDaRequisicao } from '@/lib/limite-taxa';
import { obterFila } from '@/modules/fila/fila';
import { configML } from '@/modules/mercado-livre/config';
import { receberNotificacaoML } from '@/modules/mercado-livre/notificacoes';

export const dynamic = 'force-dynamic';

/** Endpoint público: limite por IP (pendência da Fase 0). O ML manda poucos avisos por minuto; 600 é folga larga. */
const limitador = criarLimitador({ maximo: 600, janelaMs: 60_000 });

/** O ML exige HTTP 200 em menos de 500 ms (spec §7.2): grava o aviso, enfileira a sincronização e responde. */
export async function POST(requisicao: Request) {
  if (!limitador.permitir(ipDaRequisicao(requisicao.headers))) return new Response(null, { status: 429, headers: { 'retry-after': '60' } });
  const declarado = Number(requisicao.headers.get('content-length'));
  if (requisicao.headers.has('content-length') && declarado > LIMITE_AVISO_BYTES) return new Response(null, { status: 413 });
  const lido = lerAvisoML(await requisicao.text());
  if (!lido.ok) return new Response(null, { status: lido.status });
  const notificacao = aceitarNotificacaoML(lido.corpo, configML().clientId || undefined);
  if (notificacao) await receberNotificacaoML(obterDb(), obterFila(), notificacao);
  return new Response(null, { status: 200 });
}
```

- [ ] **Passo 5: Rodar e confirmar que passa**

Rode: `npm test && npm run test:int -- src/modules/mercado-livre && npm run typecheck && npm run lint`
Esperado: PASS (limite 4, notificações do conector +5, notificações do módulo 3, tarefas 9).

- [ ] **Passo 6: Commit**

```bash
cd "/c/Users/idmpc/devolucoes-wt/fase-3"
git rm -q src/conectores/marketplace/mercadolivre/notificacoes.int.test.ts
git add src/lib/limite-taxa.ts src/lib/limite-taxa.test.ts src/conectores/marketplace/mercadolivre/notificacoes.ts src/conectores/marketplace/mercadolivre/notificacoes.test.ts src/modules/mercado-livre/notificacoes.ts src/modules/mercado-livre/notificacoes.int.test.ts src/modules/mercado-livre/tarefas.ts src/modules/mercado-livre/tarefas.int.test.ts src/worker/manipuladores/mercado-livre.ts src/app/api/ml/notificacoes/route.ts
git commit -m "feat: avisos do ML viram tarefa na fila, varredura a cada 15 min, renovação de token e limite por IP" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 11: Resultado da conferência (OK automático e contestação), tarefa `ml.enviar-resultado`

**Arquivos:**
- Criar: `src/modules/mercado-livre/resultado.ts`
- Modificar: `src/worker/manipuladores/mercado-livre.ts` (+ `ml.enviar-resultado`), `tests/helpers/fabricas-ml.ts` (acrescentar)
- Testes: `src/modules/mercado-livre/resultado.test.ts`, `src/modules/mercado-livre/resultado.int.test.ts`

**Interfaces:**
- Consome:
  - `motivoCanalML` (Tarefa 1), `obterConectorML` e `ErroContaML` (Tarefa 7), `dadosCanal` (Tarefa 9);
  - `ehRecusaDefinitiva`, `logErroML` e `mensagemErroML` (Tarefa 2);
  - da P2: as tabelas `evidencias` e `itensDevolucao` (com `destino`, `motivo`, `observacao`), `obterArmazenamento`, `type MotivoItem` e `type DestinoItem`.
- Produz:
  - em `resultado.ts`:
    - `type ItemConferido = { id; unidade; sku; status: StatusItem; destino: DestinoItem | null; motivo: MotivoItem | null; observacao: string | null }`;
    - `type Decisao = { tipo: 'OK' } | { tipo: 'CONTESTAR'; motivo: MotivoCanal; itensProblema: ItemConferido[] }`;
    - `LIMITE_MENSAGEM = 2000`, `MAX_FOTOS_CONTESTACAO = 10`, `TIPOS_FOTO_CONTESTACAO`, `TEXTO_MOTIVO_ITEM: Record<MotivoItem, string>`;
    - `decidirResultado(itens): Decisao`, `mensagemContestacao(p: { codigo; itensProblema; fotos: number }): string`;
    - `fotosParaContestacao(db, devolucaoId, itensProblemaIds): Promise<string[]>`;
    - `type ResultadoProcessamento = 'sem_devolucao' | 'outro_canal' | 'sem_vinculo' | 'ok_enviado' | 'ok_ja_enviado' | 'ok_recusado' | 'contestacao_criada' | 'contestacao_existente'`;
    - `processarResultadoConferencia(db, devolucaoId, agora): Promise<ResultadoProcessamento>`.
  - `manipuladoresMercadoLivre['ml.enviar-resultado']`.
  - em `tests/helpers/fabricas-ml.ts`:
    - `type ItemConferenciaTeste = { sku?; destino: 'BOM' | 'PROBLEMA' | null; motivo?; observacao? }` (`destino: null` = AUSENTE);
    - `devolucaoMLConferidaTeste(db, p: { itens; externa?: Partial<DevolucaoExterna> | null; usuario? }): Promise<{ id; codigo; itens: { id; unidade }[]; externa: DevolucaoExterna | null }>`;
    - `fotoTeste(db, p: { devolucaoId; tipo; itemId?; situacao?; conteudo? }): Promise<{ id: string; conteudo: Buffer }>`.

> **Contrato §5.4:** a Fase 2 manda `ml.enviar-resultado` ao concluir a conferência de uma devolução do ML. Aqui o estado do fim da conferência é criado **por fábrica**, gravando direto as colunas da §4.1 (contrato §5.6), sem chamar código da Fase 2. O envio da contestação lê as fotos só na Tarefa 12, e espera que estejam PRONTA.

- [ ] **Passo 1: Fábricas (acrescentar)**

Em `tests/helpers/fabricas-ml.ts`, acrescente no topo:

```ts
import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { asc, eq } from 'drizzle-orm';
import { devolucoes, evidencias, itensDevolucao } from '@/db/schema';
import { criarDevolucao, type DadosNovaDevolucao } from '@/modules/devolucoes/criar';
import type { MotivoItem } from '@/modules/devolucoes/dominio';
import { obterArmazenamento } from '@/modules/midia/armazenamento';
import { dadosCanal } from '@/modules/mercado-livre/sincronizar';
```

e no final:

```ts
export type ItemConferenciaTeste = { sku?: string; destino: 'BOM' | 'PROBLEMA' | null; motivo?: MotivoItem | null; observacao?: string | null };

/**
 * Devolução do ML no estado do fim da conferência (contrato §5.6), gravado direto nas colunas da P2:
 * - BOM ou PROBLEMA: o item vai a AGUARDANDO_NF, com o destino (e o motivo, no PROBLEMA);
 * - `destino: null`: o item fica AUSENTE, com motivo AUSENTE.
 * A devolução vai a AGUARDANDO_NF, ou a CONCLUIDA se todos os itens forem AUSENTE.
 * `externa: null` = cadastro manual do ML, sem vínculo.
 */
export async function devolucaoMLConferidaTeste(
  db: DbOuTx,
  p: { itens: ItemConferenciaTeste[]; externa?: Partial<DevolucaoExterna> | null; usuario?: UsuarioSessao },
): Promise<{ id: string; codigo: string; itens: { id: string; unidade: number }[]; externa: DevolucaoExterna | null }> {
  const externa = p.externa === null ? null : devolucaoExternaTeste({ itens: [], ...p.externa });
  const dados: DadosNovaDevolucao = {
    canal: 'MERCADO_LIVRE',
    pedido: externa?.pedidos[0] ?? `PED-MANUAL-${marca()}`,
    reclamacaoId: externa?.reclamacaoId ?? null,
    rastreio: externa?.rastreio ?? null,
    transportadora: 'Correios',
    motivoCliente: null,
    postadaEm: null,
    itens: p.itens.map((item, i) => ({ sku: item.sku ?? `SKU-ML-${i + 1}`, quantidade: 1 })),
  };
  const criada = externa
    ? await criarDevolucao(db, dados, { origem: 'API', usuario: null, canal: dadosCanal(externa) })
    : await criarDevolucao(db, dados, { origem: 'MANUAL', usuario: p.usuario ?? (await criarUsuarioTeste(db, 'OPERADOR')) });
  const itens = await db
    .select({ id: itensDevolucao.id, unidade: itensDevolucao.unidade })
    .from(itensDevolucao)
    .where(eq(itensDevolucao.devolucaoId, criada.id))
    .orderBy(asc(itensDevolucao.unidade));
  for (const [i, item] of itens.entries()) {
    const c = p.itens[i];
    const ausente = c.destino === null;
    await db
      .update(itensDevolucao)
      .set({
        status: ausente ? 'AUSENTE' : 'AGUARDANDO_NF',
        destino: c.destino,
        motivo: ausente ? 'AUSENTE' : c.destino === 'PROBLEMA' ? (c.motivo ?? 'OUTRO') : null,
        observacao: c.observacao ?? null,
      })
      .where(eq(itensDevolucao.id, item.id));
  }
  const todosAusentes = p.itens.every((i) => i.destino === null);
  const agora = new Date();
  await db
    .update(devolucoes)
    .set({ status: todosAusentes ? 'CONCLUIDA' : 'AGUARDANDO_NF', conferidaEm: agora, ...(todosAusentes ? { concluidaEm: agora } : {}) })
    .where(eq(devolucoes.id, criada.id));
  return { id: criada.id, codigo: criada.codigo, itens, externa };
}

type TipoEvidenciaTeste = 'FOTO_1_ETIQUETA' | 'FOTO_2_EMBALAGEM' | 'FOTO_3_PRODUTO' | 'FOTO_4_CODIGO_SERIAL' | 'VIDEO_PROVA' | 'EXTRA';

/** Evidência gravada como a Fase 2 deixaria. PRONTA = arquivo salvo no armazenamento (o de memória, nos testes de integração). */
export async function fotoTeste(
  db: DbOuTx,
  p: { devolucaoId: string; tipo: TipoEvidenciaTeste; itemId?: string | null; situacao?: 'RECEBIDA' | 'PROCESSANDO' | 'PRONTA' | 'FALHOU'; conteudo?: Buffer },
): Promise<{ id: string; conteudo: Buffer }> {
  const id = randomUUID();
  const video = p.tipo === 'VIDEO_PROVA';
  const tipoConteudo = video ? 'video/mp4' : 'image/jpeg';
  const conteudo = p.conteudo ?? Buffer.from(`evidencia-de-teste-${id}`);
  const situacao = p.situacao ?? 'PRONTA';
  const pronta = situacao === 'PRONTA';
  const caminho = `evidencias/${p.devolucaoId}/${id}.${video ? 'mp4' : 'jpg'}`;
  if (pronta) await obterArmazenamento().salvar(caminho, Readable.from([conteudo]), { tipoConteudo, tamanho: conteudo.length });
  const sha = createHash('sha256').update(conteudo).digest('hex');
  await db.insert(evidencias).values({
    id,
    devolucaoId: p.devolucaoId,
    itemId: p.itemId ?? null,
    tipo: p.tipo,
    tipoConteudo,
    caminho: pronta ? caminho : null,
    provedor: pronta ? 'disco' : null,
    tamanhoOriginal: conteudo.length,
    tamanho: pronta ? conteudo.length : null,
    sha256Original: sha,
    sha256Final: pronta ? sha : null,
    situacaoProcessamento: situacao,
    idCliente: randomUUID(),
    processadoEm: pronta ? new Date() : null,
  });
  return { id, conteudo };
}
```

- [ ] **Passo 2: Escrever os testes que falham**

`src/modules/mercado-livre/resultado.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { decidirResultado, mensagemContestacao, type ItemConferido } from './resultado';

const item = (unidade: number, m: Partial<ItemConferido> = {}): ItemConferido => ({
  id: `i${unidade}`,
  unidade,
  sku: `SKU-${unidade}`,
  status: 'AGUARDANDO_NF',
  destino: 'BOM',
  motivo: null,
  observacao: null,
  ...m,
});

describe('decidirResultado (spec §6.3, contrato §5.4, D8)', () => {
  it('todos BOM → OK', () => {
    expect(decidirResultado([item(1), item(2)])).toEqual({ tipo: 'OK' });
  });

  it('algum PROBLEMA → contestação com o motivo do primeiro item com problema (pela unidade)', () => {
    const d = decidirResultado([item(2, { destino: 'PROBLEMA', motivo: 'AVARIADO' }), item(1, { destino: 'PROBLEMA', motivo: 'USADO' }), item(3)]);
    expect(d).toMatchObject({ tipo: 'CONTESTAR', motivo: 'SRF6' });
    expect(d.tipo === 'CONTESTAR' ? d.itensProblema.map((i) => i.unidade) : []).toEqual([1, 2]);
  });

  it('item AUSENTE → SRF5', () => {
    expect(decidirResultado([item(1, { status: 'AUSENTE', destino: null, motivo: 'AUSENTE' })])).toMatchObject({ tipo: 'CONTESTAR', motivo: 'SRF5' });
  });
});

describe('mensagemContestacao', () => {
  it('lista as unidades com problema, o motivo e a observação', () => {
    expect(
      mensagemContestacao({
        codigo: 'DEV-000123',
        itensProblema: [item(1, { destino: 'PROBLEMA', motivo: 'AVARIADO', observacao: 'Tela trincada.' }), item(2, { status: 'AUSENTE', destino: null, motivo: 'AUSENTE' })],
        fotos: 3,
      }),
    ).toBe(
      'Na conferência da devolução DEV-000123 encontramos:\n- Unidade 1 (SKU SKU-1): avariado. Tela trincada.\n- Unidade 2 (SKU SKU-2): não veio no pacote.\nAs fotos da conferência estão anexadas.',
    );
  });

  it('sem fotos não fala de anexo, e corta em 2000 caracteres', () => {
    const longa = mensagemContestacao({ codigo: 'DEV-1', itensProblema: [item(1, { destino: 'PROBLEMA', motivo: 'OUTRO', observacao: 'x'.repeat(3000) })], fotos: 0 });
    expect(longa).not.toContain('anexadas');
    expect(longa).toHaveLength(2000);
    expect(longa.endsWith('…')).toBe(true);
  });
});
```

`src/modules/mercado-livre/resultado.int.test.ts`:

```ts
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErroML } from '@/conectores/marketplace/mercadolivre/cliente';
import { definirConectorParaTestes } from '@/conectores/marketplace/registro';
import { contestacoesCanal } from '@/db/schema';
import { FilaMemoria } from '@/modules/fila/fila';
import { listarEventos } from '@/modules/historico/eventos';
import { manipuladoresMercadoLivre } from '@/worker/manipuladores/mercado-livre';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarDevolucaoTeste, criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { ConectorMLMemoria, devolucaoMLConferidaTeste, fotoTeste } from '../../../tests/helpers/fabricas-ml';
import { ErroContaML } from './contas';
import { processarResultadoConferencia } from './resultado';

const { db, sql } = criarDbTeste();
const AGORA = new Date('2026-11-12T15:00:00Z');
let conector: ConectorMLMemoria;

beforeEach(async () => {
  await limparTabelas(sql);
  conector = new ConectorMLMemoria();
  definirConectorParaTestes('MERCADO_LIVRE', conector);
});
afterEach(() => {
  definirConectorParaTestes('MERCADO_LIVRE', null);
  vi.restoreAllMocks();
});
afterAll(async () => {
  await sql.end();
});

async function acoes(id: string) {
  return (await listarEventos(db, 'devolucao', id)).map((e) => e.acao);
}

describe('processarResultadoConferencia (tarefa ml.enviar-resultado)', () => {
  it('todos BOM: manda o "OK" ao ML uma vez só e registra o evento', async () => {
    const d = await devolucaoMLConferidaTeste(db, { itens: [{ destino: 'BOM' }, { destino: 'BOM' }] });
    expect(await processarResultadoConferencia(db, d.id, AGORA)).toBe('ok_enviado');
    expect(conector.enviados).toEqual([{ devolucaoExternaId: d.externa?.devolucaoExternaId, resultado: { tipo: 'OK' } }]);
    expect(await processarResultadoConferencia(db, d.id, AGORA)).toBe('ok_ja_enviado');
    expect(conector.enviados).toHaveLength(1);
    expect(await acoes(d.id)).toContain('ml_resultado_ok_enviado');
  });

  it('PROBLEMA: contestação AGUARDANDO_GESTOR com motivo, mensagem, prazo e as fotos certas (sem o vídeo)', async () => {
    const prazo = new Date('2026-11-20T23:59:59Z');
    const d = await devolucaoMLConferidaTeste(db, {
      itens: [{ destino: 'PROBLEMA', motivo: 'AVARIADO', observacao: 'Caixa amassada.' }, { destino: 'BOM' }],
      externa: { prazoConferencia: prazo },
    });
    const [problema, bom] = d.itens;
    const foto1 = await fotoTeste(db, { devolucaoId: d.id, tipo: 'FOTO_1_ETIQUETA' });
    const foto2 = await fotoTeste(db, { devolucaoId: d.id, tipo: 'FOTO_2_EMBALAGEM' });
    const foto3 = await fotoTeste(db, { devolucaoId: d.id, tipo: 'FOTO_3_PRODUTO', itemId: problema.id });
    await fotoTeste(db, { devolucaoId: d.id, tipo: 'FOTO_3_PRODUTO', itemId: bom.id });
    await fotoTeste(db, { devolucaoId: d.id, tipo: 'VIDEO_PROVA' });
    await fotoTeste(db, { devolucaoId: d.id, tipo: 'FOTO_4_CODIGO_SERIAL', itemId: problema.id, situacao: 'FALHOU' });

    expect(await processarResultadoConferencia(db, d.id, AGORA)).toBe('contestacao_criada');
    const [c] = await db.select().from(contestacoesCanal);
    expect(c).toMatchObject({ devolucaoId: d.id, status: 'AGUARDANDO_GESTOR', motivoCanal: 'SRF2', prazo, revisadoPor: null });
    expect(c.mensagem).toContain('- Unidade 1 (SKU SKU-ML-1): avariado. Caixa amassada.');
    expect([...c.evidencias].sort()).toEqual([foto1.id, foto2.id, foto3.id].sort());
    expect(conector.enviados).toEqual([]);
    expect(await processarResultadoConferencia(db, d.id, AGORA)).toBe('contestacao_existente');
    expect((await acoes(d.id)).filter((a) => a === 'contestacao_criada')).toHaveLength(1);
  });

  it('todos AUSENTE: a devolução já está CONCLUIDA e a contestação é SRF5', async () => {
    const d = await devolucaoMLConferidaTeste(db, { itens: [{ destino: null }] });
    expect(await processarResultadoConferencia(db, d.id, AGORA)).toBe('contestacao_criada');
    const [c] = await db.select().from(contestacoesCanal);
    expect(c).toMatchObject({ motivoCanal: 'SRF5', evidencias: [] });
  });

  it('sem vínculo com o ML (cadastro manual): só o evento, uma vez', async () => {
    const d = await devolucaoMLConferidaTeste(db, { itens: [{ destino: 'BOM' }], externa: null });
    expect(await processarResultadoConferencia(db, d.id, AGORA)).toBe('sem_vinculo');
    expect(await processarResultadoConferencia(db, d.id, AGORA)).toBe('sem_vinculo');
    expect((await acoes(d.id)).filter((a) => a === 'ml_resultado_sem_vinculo')).toHaveLength(1);
    expect(conector.enviados).toEqual([]);
  });

  it('outro canal ou id inexistente: nada', async () => {
    const operador = await criarUsuarioTeste(db);
    const shopee = await criarDevolucaoTeste(db, operador);
    expect(await processarResultadoConferencia(db, shopee.id, AGORA)).toBe('outro_canal');
    expect(await processarResultadoConferencia(db, '00000000-0000-0000-0000-000000000000', AGORA)).toBe('sem_devolucao');
  });

  it('o ML recusa o "OK" (400): evento ml_resultado_ok_recusado, sem lançar', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    conector.falhaNoEnvio = new ErroML(400, '{"message":"The return review is not available"}', '/post-purchase/v1/returns/1/return-review');
    const d = await devolucaoMLConferidaTeste(db, { itens: [{ destino: 'BOM' }] });
    expect(await processarResultadoConferencia(db, d.id, AGORA)).toBe('ok_recusado');
    expect((await listarEventos(db, 'devolucao', d.id)).at(-1)).toMatchObject({
      acao: 'ml_resultado_ok_recusado',
      dados: { erro: 'The return review is not available (HTTP 400)' },
    });
  });

  it('erro passageiro (503) ou sem conta: lança, para a fila tentar de novo', async () => {
    const d = await devolucaoMLConferidaTeste(db, { itens: [{ destino: 'BOM' }] });
    conector.falhaNoEnvio = new ErroML(503, '', '/x');
    await expect(processarResultadoConferencia(db, d.id, AGORA)).rejects.toMatchObject({ status: 503 });
    definirConectorParaTestes('MERCADO_LIVRE', null);
    await expect(processarResultadoConferencia(db, d.id, AGORA)).rejects.toBeInstanceOf(ErroContaML);
    expect(await acoes(d.id)).not.toContain('ml_resultado_ok_enviado');
  });

  it('manipulador ml.enviar-resultado (contrato §5.4)', async () => {
    const d = await devolucaoMLConferidaTeste(db, { itens: [{ destino: 'BOM' }] });
    await manipuladoresMercadoLivre['ml.enviar-resultado']?.({ devolucaoId: d.id }, { db, fila: new FilaMemoria(), agora: AGORA, tentativa: 1 });
    expect(conector.enviados).toHaveLength(1);
  });
});
```

Rode: `npm test -- src/modules/mercado-livre/resultado.test.ts`
Esperado: FAIL ("Failed to resolve import './resultado'").

- [ ] **Passo 3: Implementar**

`src/modules/mercado-livre/resultado.ts`:

```ts
import { and, asc, eq, inArray, isNull, like, notInArray, or, sql } from 'drizzle-orm';
import { ehRecusaDefinitiva, logErroML, mensagemErroML } from '@/conectores/marketplace/mercadolivre/erros';
import type { MotivoCanal } from '@/conectores/marketplace/tipos';
import type { DbOuTx } from '@/db/client';
import { contestacoesCanal, devolucoes, eventosHistorico, evidencias, itensDevolucao } from '@/db/schema';
import { ehUuid } from '@/lib/uuid';
import type { DestinoItem, MotivoItem, StatusItem } from '@/modules/devolucoes/dominio';
import { registrarEvento } from '@/modules/historico/eventos';
import { obterConectorML } from './conector';
import { ErroContaML } from './contas';
import { motivoCanalML } from './dominio';

export type ItemConferido = {
  id: string;
  unidade: number;
  sku: string;
  status: StatusItem;
  destino: DestinoItem | null;
  motivo: MotivoItem | null;
  observacao: string | null;
};
export type Decisao = { tipo: 'OK' } | { tipo: 'CONTESTAR'; motivo: MotivoCanal; itensProblema: ItemConferido[] };

/** Suposição A9 do plano: limites do ML para a mensagem e para o número de fotos. */
export const LIMITE_MENSAGEM = 2000;
export const MAX_FOTOS_CONTESTACAO = 10;
/** Vão ao ML só fotos (spec §7.4: o vídeo fica no sistema como prova). */
export const TIPOS_FOTO_CONTESTACAO = ['FOTO_1_ETIQUETA', 'FOTO_2_EMBALAGEM', 'FOTO_3_PRODUTO', 'FOTO_4_CODIGO_SERIAL', 'EXTRA'] as const;

/** Texto do motivo do item na mensagem ao ML (minúsculo, no meio da frase). */
export const TEXTO_MOTIVO_ITEM: Record<MotivoItem, string> = {
  AVARIADO: 'avariado',
  USADO: 'usado',
  DIVERGENTE: 'diferente do anunciado',
  INCOMPLETO: 'incompleto',
  COM_DEFEITO: 'com defeito',
  AUSENTE: 'não veio no pacote',
  OUTRO: 'outro problema',
};

function motivoDoItem(i: ItemConferido): MotivoItem | null {
  if (i.status === 'AUSENTE' || i.motivo === 'AUSENTE') return 'AUSENTE';
  if (i.destino === 'PROBLEMA') return i.motivo ?? 'OUTRO';
  return null;
}

/** Spec §6.3 e contrato §5.4: todos BOM → OK; algum PROBLEMA ou AUSENTE → contestação com o motivo do 1º item com problema (D8). */
export function decidirResultado(itens: ItemConferido[]): Decisao {
  const problemas = [...itens].sort((a, b) => a.unidade - b.unidade).filter((i) => motivoDoItem(i) !== null);
  const primeiro = problemas[0];
  if (!primeiro) return { tipo: 'OK' };
  return { tipo: 'CONTESTAR', motivo: motivoCanalML(motivoDoItem(primeiro) ?? 'OUTRO'), itensProblema: problemas };
}

/** Texto inicial da contestação; o Gestor edita antes de enviar (D8). */
export function mensagemContestacao(p: { codigo: string; itensProblema: ItemConferido[]; fotos: number }): string {
  const linhas = p.itensProblema.map((i) => {
    const observacao = i.observacao?.trim() ? ` ${i.observacao.trim()}` : '';
    return `- Unidade ${i.unidade} (SKU ${i.sku}): ${TEXTO_MOTIVO_ITEM[motivoDoItem(i) ?? 'OUTRO']}.${observacao}`;
  });
  const texto = [`Na conferência da devolução ${p.codigo} encontramos:`, ...linhas, ...(p.fotos > 0 ? ['As fotos da conferência estão anexadas.'] : [])].join('\n');
  return texto.length > LIMITE_MENSAGEM ? `${texto.slice(0, LIMITE_MENSAGEM - 1)}…` : texto;
}

/** Fotos 1 e 2, Fotos 3 e 4 dos itens com problema, e extras; sem as que falharam (decisão 7 do plano). */
export async function fotosParaContestacao(db: DbOuTx, devolucaoId: string, itensProblemaIds: string[]): Promise<string[]> {
  const linhas = await db
    .select({ id: evidencias.id })
    .from(evidencias)
    .where(
      and(
        eq(evidencias.devolucaoId, devolucaoId),
        inArray(evidencias.tipo, [...TIPOS_FOTO_CONTESTACAO]),
        like(evidencias.tipoConteudo, 'image/%'),
        notInArray(evidencias.situacaoProcessamento, ['FALHOU', 'APAGADA']),
        itensProblemaIds.length > 0 ? or(isNull(evidencias.itemId), inArray(evidencias.itemId, itensProblemaIds)) : isNull(evidencias.itemId),
      ),
    )
    .orderBy(asc(evidencias.tipo), asc(evidencias.enviadoEm))
    .limit(MAX_FOTOS_CONTESTACAO);
  return linhas.map((l) => l.id);
}

async function jaTemEvento(db: DbOuTx, devolucaoId: string, acao: string): Promise<boolean> {
  const [e] = await db
    .select({ id: eventosHistorico.id })
    .from(eventosHistorico)
    .where(and(eq(eventosHistorico.entidade, 'devolucao'), eq(eventosHistorico.entidadeId, devolucaoId), eq(eventosHistorico.acao, acao)))
    .limit(1);
  return e !== undefined;
}

export type ResultadoProcessamento =
  | 'sem_devolucao'
  | 'outro_canal'
  | 'sem_vinculo'
  | 'ok_enviado'
  | 'ok_ja_enviado'
  | 'ok_recusado'
  | 'contestacao_criada'
  | 'contestacao_existente';

/**
 * Tarefa ml.enviar-resultado (contrato §5.4), enviada pela Fase 2 ao concluir a conferência. Idempotente:
 * - o "OK" vai uma vez (trava por devolução e o evento ml_resultado_ok_enviado);
 * - a contestação é uma por devolução (índice único).
 * Lança (nova tentativa) só em erro passageiro ou sem conta conectada.
 */
export async function processarResultadoConferencia(db: DbOuTx, devolucaoId: string, agora: Date): Promise<ResultadoProcessamento> {
  if (!ehUuid(devolucaoId)) return 'sem_devolucao';
  const [dev] = await db
    .select({
      id: devolucoes.id,
      codigo: devolucoes.codigo,
      canal: devolucoes.canal,
      devolucaoExternaId: devolucoes.devolucaoExternaId,
      prazo: devolucoes.prazoConferenciaCanal,
    })
    .from(devolucoes)
    .where(eq(devolucoes.id, devolucaoId));
  if (!dev) return 'sem_devolucao';
  if (dev.canal !== 'MERCADO_LIVRE') return 'outro_canal';
  const devolucaoExternaId = dev.devolucaoExternaId;
  if (!devolucaoExternaId) {
    if (!(await jaTemEvento(db, dev.id, 'ml_resultado_sem_vinculo'))) {
      await registrarEvento(db, { entidade: 'devolucao', entidadeId: dev.id, acao: 'ml_resultado_sem_vinculo', usuarioId: null, em: agora });
    }
    return 'sem_vinculo';
  }

  const itens = await db
    .select({
      id: itensDevolucao.id,
      unidade: itensDevolucao.unidade,
      sku: itensDevolucao.sku,
      status: itensDevolucao.status,
      destino: itensDevolucao.destino,
      motivo: itensDevolucao.motivo,
      observacao: itensDevolucao.observacao,
    })
    .from(itensDevolucao)
    .where(eq(itensDevolucao.devolucaoId, dev.id))
    .orderBy(asc(itensDevolucao.unidade));
  const decisao = decidirResultado(itens);

  if (decisao.tipo === 'CONTESTAR') {
    const fotos = await fotosParaContestacao(
      db,
      dev.id,
      decisao.itensProblema.map((i) => i.id),
    );
    return db.transaction(async (tx): Promise<ResultadoProcessamento> => {
      const [nova] = await tx
        .insert(contestacoesCanal)
        .values({
          devolucaoId: dev.id,
          motivoCanal: decisao.motivo,
          mensagem: mensagemContestacao({ codigo: dev.codigo, itensProblema: decisao.itensProblema, fotos: fotos.length }),
          evidencias: fotos,
          prazo: dev.prazo,
          criadaEm: agora,
          atualizadaEm: agora,
        })
        .onConflictDoNothing({ target: contestacoesCanal.devolucaoId })
        .returning({ id: contestacoesCanal.id });
      if (!nova) return 'contestacao_existente';
      await registrarEvento(tx, {
        entidade: 'devolucao',
        entidadeId: dev.id,
        acao: 'contestacao_criada',
        usuarioId: null,
        dados: { contestacaoId: nova.id, motivo: decisao.motivo, fotos: fotos.length },
        em: agora,
      });
      return 'contestacao_criada';
    });
  }

  return db.transaction(async (tx): Promise<ResultadoProcessamento> => {
    await tx.execute(sql`select pg_advisory_xact_lock(3, hashtext(${`resultado:${dev.id}`}))`);
    if (await jaTemEvento(tx, dev.id, 'ml_resultado_ok_enviado')) return 'ok_ja_enviado';
    const conector = await obterConectorML(db);
    if (!conector) throw new ErroContaML('A conta do Mercado Livre não está conectada: o "OK" vai quando ela voltar.');
    try {
      await conector.enviarResultadoConferencia(devolucaoExternaId, { tipo: 'OK' });
    } catch (erro) {
      if (!ehRecusaDefinitiva(erro)) throw erro;
      logErroML('resultado OK', erro, { devolucaoId: dev.id });
      await registrarEvento(tx, {
        entidade: 'devolucao',
        entidadeId: dev.id,
        acao: 'ml_resultado_ok_recusado',
        usuarioId: null,
        dados: { erro: mensagemErroML(erro) },
        em: agora,
      });
      return 'ok_recusado';
    }
    await registrarEvento(tx, { entidade: 'devolucao', entidadeId: dev.id, acao: 'ml_resultado_ok_enviado', usuarioId: null, em: agora });
    return 'ok_enviado';
  });
}
```

`src/worker/manipuladores/mercado-livre.ts` (conteúdo completo):

```ts
import { processarResultadoConferencia } from '@/modules/mercado-livre/resultado';
import { renovarTokensML, sincronizarReclamacao, varrerReclamacoes } from '@/modules/mercado-livre/tarefas';
import type { Manipuladores } from '../tipos';

/** Fase 3 (contrato §5.1). Cada manipulador é idempotente; lançar = nova tentativa. */
export const manipuladoresMercadoLivre: Manipuladores = {
  'ml.sincronizar-reclamacao': async ({ claimId }, ctx) => {
    await sincronizarReclamacao(ctx.db, ctx.fila, claimId, ctx.agora);
  },
  'ml.varredura': async (_dados, ctx) => {
    await varrerReclamacoes(ctx.db, ctx.fila, ctx.agora);
  },
  'ml.renovar-token': async (_dados, ctx) => {
    await renovarTokensML(ctx.db, ctx.agora);
  },
  'ml.enviar-resultado': async ({ devolucaoId }, ctx) => {
    await processarResultadoConferencia(ctx.db, devolucaoId, ctx.agora);
  },
};
```

- [ ] **Passo 4: Rodar e confirmar que passa**

Rode: `npm test -- src/modules/mercado-livre && npm run test:int -- src/modules/mercado-livre && npm run typecheck && npm run lint`
Esperado: PASS (resultado: 5 unitários e 8 de integração).

- [ ] **Passo 5: Commit**

```bash
cd "/c/Users/idmpc/devolucoes-wt/fase-3"
git add src/modules/mercado-livre/resultado.ts src/modules/mercado-livre/resultado.test.ts src/modules/mercado-livre/resultado.int.test.ts src/worker/manipuladores/mercado-livre.ts tests/helpers/fabricas-ml.ts
git commit -m "feat: resultado da conferência no ML (OK automático, contestação AGUARDANDO_GESTOR com as fotos)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 12: Contestação: revisar, enviar ao ML com as fotos, tarefa `ml.enviar-contestacao`

**Arquivos:**
- Criar: `src/modules/mercado-livre/selos.ts`, `src/modules/mercado-livre/contestacoes.ts`
- Modificar: `src/worker/manipuladores/mercado-livre.ts` (+ `ml.enviar-contestacao`)
- Testes: `src/modules/mercado-livre/selos.test.ts`, `src/modules/mercado-livre/contestacoes.test.ts`, `src/modules/mercado-livre/contestacoes.int.test.ts`

**Interfaces:**
- Consome:
  - `TIPOS_FOTO_CONTESTACAO`, `LIMITE_MENSAGEM`, `MAX_FOTOS_CONTESTACAO` e `TEXTO_MOTIVO_ITEM` (Tarefa 11);
  - `obterConectorML` e `ErroContaML` (Tarefa 7), `ehUltimaTentativa` (Tarefa 10);
  - `ErroMotivoIndisponivel`, `ehRecusaDefinitiva`, `mensagemErroML` e `logErroML` (Tarefa 2);
  - `obterArmazenamento().ler` (P2), `type DadosSelo` e `type TomSelo` (`@/modules/devolucoes/selos`).
- Produz:
  - em `selos.ts`: `seloPrazoML(prazo: Date | null, agora: Date): DadosSelo | null`, `TOM_STATUS_CONTESTACAO: Record<StatusContestacao, TomSelo>`;
  - em `contestacoes.ts`:
    - `LIMITE_FOTO_ML_BYTES`, `class ErroContestacao { erros: string[] }`, `rotuloFoto(tipo, unidade): string`;
    - `type CartaoContestacao = { id; devolucaoId; codigo; motivo: MotivoCanal; status; enviando: boolean; prazo; selo: DadosSelo | null; fotos: number; erro }`;
    - `listarContestacoes(db, status, agora?): Promise<CartaoContestacao[]>`, `contarContestacoes(db): Promise<Record<StatusContestacao, number>>`;
    - `type FotoCandidata = { id; tipo; rotulo; caminho: string | null; selecionada: boolean }`, `type DetalheContestacao`, `obterContestacao(db, id, agora?): Promise<DetalheContestacao | null>`;
    - `type EntradaRevisao = { motivo: string; mensagem: string; evidencias: string[] }`, `validarRevisao(e, fotosPermitidas: ReadonlySet<string>): { dados; erros }`;
    - `revisarEEnviar(db, fila, id, e, usuario, agora): Promise<void>`;
    - `type ResultadoEnvio = 'enviada' | 'falhou' | 'ignorada'`, `enviarContestacao(db, id, o: { agora: Date; ultimaTentativa: boolean }): Promise<ResultadoEnvio>`.
  - `manipuladoresMercadoLivre['ml.enviar-contestacao']`.

> **Estados (contrato §4.6 e decisões 8 e 9):**
> - AGUARDANDO_GESTOR **sem** revisor: esperando o Gestor.
> - AGUARDANDO_GESTOR **com** revisor: envio pedido, esperando a tarefa. O cartão mostra "Enviando ao ML".
> - A tarefa leva a ENVIADA ou a FALHOU.
> - De FALHOU, o Gestor revisa e envia de novo: volta a AGUARDANDO_GESTOR com revisor.

- [ ] **Passo 1: Escrever os testes que falham**

`src/modules/mercado-livre/selos.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { seloPrazoML } from './selos';

describe('seloPrazoML (spec §6.6: o prazo do ML em destaque)', () => {
  const agora = new Date('2026-11-12T15:00:00Z');
  it('sem prazo: sem selo', () => {
    expect(seloPrazoML(null, agora)).toBeNull();
  });
  it('vencido: erro', () => {
    expect(seloPrazoML(new Date('2026-11-12T14:00:00Z'), agora)).toEqual({ texto: 'Prazo do ML vencido', tom: 'erro' });
  });
  it('1 dia ou menos: erro; mais que isso: atenção (horário de Brasília)', () => {
    expect(seloPrazoML(new Date('2026-11-13T12:00:00Z'), agora)).toEqual({ texto: 'Prazo 13/11/2026 09:00', tom: 'erro' });
    expect(seloPrazoML(new Date('2026-11-20T15:00:00Z'), agora)).toEqual({ texto: 'Prazo 20/11/2026 12:00', tom: 'atencao' });
  });
});
```

`src/modules/mercado-livre/contestacoes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { rotuloFoto, validarRevisao } from './contestacoes';

const FOTOS = new Set(['f1', 'f2']);
const BASE = { motivo: 'SRF6', mensagem: 'O produto voltou usado, com marcas.', evidencias: [] as string[] };

describe('validarRevisao', () => {
  it('aceita e apara a mensagem, sem repetir foto', () => {
    expect(validarRevisao({ ...BASE, mensagem: `  ${BASE.mensagem}  `, evidencias: ['f1', 'f1'] }, FOTOS)).toEqual({
      dados: { motivo: 'SRF6', mensagem: BASE.mensagem, evidencias: ['f1'] },
      erros: [],
    });
  });

  it('junta os erros: motivo, mensagem curta e foto de outra devolução', () => {
    expect(validarRevisao({ motivo: 'SRF9', mensagem: 'curta', evidencias: ['outra'] }, FOTOS).erros).toEqual([
      'Escolha o motivo para o Mercado Livre.',
      'Escreva a mensagem para o Mercado Livre (pelo menos 10 letras).',
      'Uma das fotos escolhidas não é desta devolução.',
    ]);
  });

  it('SRF2 e SRF4 exigem pelo menos 1 foto (spec §7.4); mensagem até 2000 e até 10 fotos', () => {
    expect(validarRevisao({ ...BASE, motivo: 'SRF2' }, FOTOS).erros).toEqual(['O motivo "Produto avariado" exige pelo menos 1 foto.']);
    expect(validarRevisao({ ...BASE, mensagem: 'x'.repeat(2001) }, FOTOS).erros).toEqual(['Mensagem: no máximo 2000 caracteres.']);
    const onze = Array.from({ length: 11 }, (_, i) => `g${i}`);
    expect(validarRevisao({ ...BASE, evidencias: onze }, new Set(onze)).erros).toEqual(['Escolha no máximo 10 fotos.']);
  });
});

describe('rotuloFoto', () => {
  it('usa os nomes do PDF', () => {
    expect(rotuloFoto('FOTO_1_ETIQUETA', null)).toBe('Foto 1');
    expect(rotuloFoto('FOTO_3_PRODUTO', 2)).toBe('Foto 3 · unidade 2');
  });
});
```

`src/modules/mercado-livre/contestacoes.int.test.ts`:

```ts
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErroML } from '@/conectores/marketplace/mercadolivre/cliente';
import { ErroMotivoIndisponivel } from '@/conectores/marketplace/mercadolivre/erros';
import { definirConectorParaTestes } from '@/conectores/marketplace/registro';
import { contestacoesCanal } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import type { MotivoItem } from '@/modules/devolucoes/dominio';
import { FilaMemoria } from '@/modules/fila/fila';
import { CONFIG_TAREFAS } from '@/modules/fila/tarefas';
import { listarEventos } from '@/modules/historico/eventos';
import { manipuladoresMercadoLivre } from '@/worker/manipuladores/mercado-livre';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { ConectorMLMemoria, devolucaoMLConferidaTeste, fotoTeste } from '../../../tests/helpers/fabricas-ml';
import { contarContestacoes, enviarContestacao, listarContestacoes, obterContestacao, revisarEEnviar } from './contestacoes';
import { processarResultadoConferencia } from './resultado';

const { db, sql } = criarDbTeste();
const AGORA = new Date('2026-11-12T15:00:00Z');
let conector: ConectorMLMemoria;
let gestor: UsuarioSessao;

beforeEach(async () => {
  await limparTabelas(sql);
  conector = new ConectorMLMemoria();
  definirConectorParaTestes('MERCADO_LIVRE', conector);
  gestor = await criarUsuarioTeste(db, 'GESTOR');
});
afterEach(() => {
  definirConectorParaTestes('MERCADO_LIVRE', null);
  vi.restoreAllMocks();
});
afterAll(async () => {
  await sql.end();
});

/** Devolução do ML conferida com 1 item PROBLEMA, Foto 1 e Foto 3, e a contestação criada pela Tarefa 11. */
async function contestacaoTeste(p: { motivo?: MotivoItem; prazo?: Date } = {}) {
  const d = await devolucaoMLConferidaTeste(db, {
    itens: [{ destino: 'PROBLEMA', motivo: p.motivo ?? 'AVARIADO' }],
    externa: p.prazo ? { prazoConferencia: p.prazo } : {},
  });
  const foto1 = await fotoTeste(db, { devolucaoId: d.id, tipo: 'FOTO_1_ETIQUETA' });
  const foto3 = await fotoTeste(db, { devolucaoId: d.id, tipo: 'FOTO_3_PRODUTO', itemId: d.itens[0].id });
  await processarResultadoConferencia(db, d.id, AGORA);
  const [c] = await db.select().from(contestacoesCanal).where(eq(contestacoesCanal.devolucaoId, d.id));
  return { d, c, fotos: [foto1, foto3] };
}

async function contestacao(id: string) {
  const [c] = await db.select().from(contestacoesCanal).where(eq(contestacoesCanal.id, id));
  return c;
}
async function acoes(devolucaoId: string) {
  return (await listarEventos(db, 'devolucao', devolucaoId)).map((e) => e.acao);
}
const revisar = (id: string, mudancas: Partial<{ motivo: string; mensagem: string; evidencias: string[] }> = {}, fila = new FilaMemoria()) =>
  revisarEEnviar(db, fila, id, { motivo: 'SRF2', mensagem: 'Chegou quebrado, veja as fotos.', evidencias: [], ...mudancas }, gestor, AGORA);

describe('lista e detalhe (spec §6.6)', () => {
  it('cartões ordenados pelo prazo, com o selo, e a contagem por status', async () => {
    const tarde = await contestacaoTeste({ prazo: new Date('2026-11-25T00:00:00Z') });
    const cedo = await contestacaoTeste({ prazo: new Date('2026-11-13T00:00:00Z') });
    const lista = await listarContestacoes(db, 'AGUARDANDO_GESTOR', AGORA);
    expect(lista.map((c) => c.id)).toEqual([cedo.c.id, tarde.c.id]);
    expect(lista[0]).toMatchObject({ codigo: cedo.d.codigo, motivo: 'SRF2', enviando: false, fotos: 2, selo: { tom: 'erro' } });
    expect(lista[1].selo).toMatchObject({ tom: 'atencao' });
    expect(await contarContestacoes(db)).toEqual({ AGUARDANDO_GESTOR: 2, ENVIADA: 0, FALHOU: 0 });
  });

  it('detalhe: itens com problema, fotos candidatas (nomes do PDF) e quais estão escolhidas', async () => {
    const { c, d, fotos } = await contestacaoTeste();
    await fotoTeste(db, { devolucaoId: d.id, tipo: 'EXTRA' });
    await db.update(contestacoesCanal).set({ evidencias: [fotos[0].id] }).where(eq(contestacoesCanal.id, c.id));
    const detalhe = await obterContestacao(db, c.id, AGORA);
    expect(detalhe).toMatchObject({
      codigo: d.codigo,
      motivo: 'SRF2',
      status: 'AGUARDANDO_GESTOR',
      reclamacaoId: d.externa?.reclamacaoId,
      itensProblema: [{ unidade: 1, sku: 'SKU-ML-1', motivoTexto: 'Avariado' }],
    });
    expect(detalhe?.fotos.map((f) => [f.rotulo, f.selecionada])).toEqual([
      ['Foto 1', true],
      ['Foto 3 · unidade 1', false],
      ['Extra', false],
    ]);
    expect(await obterContestacao(db, '00000000-0000-0000-0000-000000000000')).toBeNull();
  });
});

describe('revisarEEnviar (o Gestor clica em "Enviar ao ML")', () => {
  it('grava a revisão, registra o evento e enfileira o envio; não deixa pedir de novo', async () => {
    const { c, d, fotos } = await contestacaoTeste();
    const fila = new FilaMemoria();
    await revisar(c.id, { motivo: 'SRF4', mensagem: 'Veio outro modelo de fone.', evidencias: [fotos[1].id] }, fila);
    expect(await contestacao(c.id)).toMatchObject({
      motivoCanal: 'SRF4',
      mensagem: 'Veio outro modelo de fone.',
      evidencias: [fotos[1].id],
      status: 'AGUARDANDO_GESTOR',
      revisadoPor: gestor.id,
    });
    expect(fila.enviadas).toEqual([
      { nome: 'ml.enviar-contestacao', dados: { contestacaoId: c.id }, opcoes: expect.objectContaining({ chaveUnica: `ml-contestacao-${c.id}` }) },
    ]);
    expect(await acoes(d.id)).toContain('contestacao_revisada');
    expect((await listarContestacoes(db, 'AGUARDANDO_GESTOR', AGORA))[0].enviando).toBe(true);
    await expect(revisar(c.id, { evidencias: [fotos[1].id] })).rejects.toThrow('O envio já foi pedido');
  });

  it('recusa Operador, foto de outra devolução e SRF2 sem foto', async () => {
    const { c } = await contestacaoTeste();
    const outra = await contestacaoTeste();
    const operador = await criarUsuarioTeste(db, 'OPERADOR');
    await expect(revisarEEnviar(db, new FilaMemoria(), c.id, { motivo: 'SRF6', mensagem: 'Mensagem válida aqui.', evidencias: [] }, operador, AGORA)).rejects.toThrow(
      'Só o Gestor',
    );
    await expect(revisar(c.id, { evidencias: [outra.fotos[0].id] })).rejects.toThrow('não é desta devolução');
    await expect(revisar(c.id, { evidencias: [] })).rejects.toThrow('exige pelo menos 1 foto');
  });
});

describe('enviarContestacao (tarefa ml.enviar-contestacao)', () => {
  it('envia ao ML com as fotos lidas do armazenamento, na ordem escolhida: ENVIADA e evento', async () => {
    const { c, d, fotos } = await contestacaoTeste();
    await revisar(c.id, { evidencias: fotos.map((f) => f.id) });
    expect(await enviarContestacao(db, c.id, { agora: AGORA, ultimaTentativa: false })).toBe('enviada');
    expect(conector.enviados).toHaveLength(1);
    const { devolucaoExternaId, resultado } = conector.enviados[0];
    expect(devolucaoExternaId).toBe(d.externa?.devolucaoExternaId);
    if (resultado.tipo !== 'PROBLEMA') throw new Error('esperava PROBLEMA');
    expect(resultado).toMatchObject({ reclamacaoId: d.externa?.reclamacaoId, motivo: 'SRF2', mensagem: 'Chegou quebrado, veja as fotos.' });
    expect(resultado.anexos.map((a) => a.conteudo.toString())).toEqual(fotos.map((f) => f.conteudo.toString()));
    expect(resultado.anexos.map((a) => a.nome)).toEqual([`${d.codigo}-1.jpg`, `${d.codigo}-2.jpg`]);
    expect(await contestacao(c.id)).toMatchObject({ status: 'ENVIADA', enviadaEm: AGORA, erro: null });
    expect(await acoes(d.id)).toContain('contestacao_enviada');
    expect(await enviarContestacao(db, c.id, { agora: AGORA, ultimaTentativa: false })).toBe('ignorada');
  });

  it('envio não pedido (sem revisão): ignorada', async () => {
    const { c } = await contestacaoTeste();
    expect(await enviarContestacao(db, c.id, { agora: AGORA, ultimaTentativa: false })).toBe('ignorada');
    expect(conector.enviados).toEqual([]);
  });

  it('foto ainda em processamento: tenta de novo; na última tentativa vira FALHOU', async () => {
    const { c, d, fotos } = await contestacaoTeste();
    const processando = await fotoTeste(db, { devolucaoId: d.id, tipo: 'FOTO_4_CODIGO_SERIAL', itemId: d.itens[0].id, situacao: 'PROCESSANDO' });
    await revisar(c.id, { evidencias: [fotos[0].id, processando.id] });
    await expect(enviarContestacao(db, c.id, { agora: AGORA, ultimaTentativa: false })).rejects.toThrow('processamento');
    expect(await enviarContestacao(db, c.id, { agora: AGORA, ultimaTentativa: true })).toBe('falhou');
    expect((await contestacao(c.id)).erro).toContain('sendo processadas');
  });

  it('o ML recusa (400): FALHOU com a mensagem; o Gestor revisa e envia de novo', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { c, d, fotos } = await contestacaoTeste();
    await revisar(c.id, { evidencias: [fotos[0].id] });
    conector.falhaNoEnvio = new ErroML(400, '{"message":"The return review is not available"}', '/x');
    expect(await enviarContestacao(db, c.id, { agora: AGORA, ultimaTentativa: false })).toBe('falhou');
    expect(await contestacao(c.id)).toMatchObject({
      status: 'FALHOU',
      erro: 'O Mercado Livre recusou o envio: The return review is not available (HTTP 400)',
    });
    expect(await acoes(d.id)).toContain('contestacao_falhou');
    await revisar(c.id, { evidencias: [fotos[0].id] });
    expect(await contestacao(c.id)).toMatchObject({ status: 'AGUARDANDO_GESTOR', revisadoPor: gestor.id, erro: null });
  });

  it('motivo que o ML não aceita: FALHOU com a lista dos aceitos', async () => {
    const { c, fotos } = await contestacaoTeste();
    await revisar(c.id, { evidencias: [fotos[0].id] });
    conector.falhaNoEnvio = new ErroMotivoIndisponivel('SRF2', ['SRF6']);
    expect(await enviarContestacao(db, c.id, { agora: AGORA, ultimaTentativa: false })).toBe('falhou');
    expect((await contestacao(c.id)).erro).toBe('O Mercado Livre não aceita o motivo SRF2 nesta devolução. Motivos aceitos: SRF6.');
  });

  it('ML fora do ar (503): lança; o manipulador, na última tentativa, deixa FALHOU', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { c, fotos } = await contestacaoTeste();
    await revisar(c.id, { evidencias: [fotos[0].id] });
    conector.falhaNoEnvio = new ErroML(503, '', '/x');
    await expect(enviarContestacao(db, c.id, { agora: AGORA, ultimaTentativa: false })).rejects.toMatchObject({ status: 503 });
    const ultima = CONFIG_TAREFAS['ml.enviar-contestacao'].tentativas;
    await manipuladoresMercadoLivre['ml.enviar-contestacao']?.({ contestacaoId: c.id }, { db, fila: new FilaMemoria(), agora: AGORA, tentativa: ultima });
    expect((await contestacao(c.id)).status).toBe('FALHOU');
  });
});
```

Rode: `npm test -- src/modules/mercado-livre/selos.test.ts src/modules/mercado-livre/contestacoes.test.ts`
Esperado: FAIL (os módulos não existem).

- [ ] **Passo 2: Implementar o selo de prazo**

`src/modules/mercado-livre/selos.ts`:

```ts
import { formatarDataHora } from '@/lib/formatar';
import type { DadosSelo, TomSelo } from '@/modules/devolucoes/selos';
import type { StatusContestacao } from './dominio';

const UM_DIA_MS = 24 * 60 * 60 * 1000;

/** Spec §6.6: o prazo do ML em destaque; vermelho quando falta 1 dia ou menos (horário de Brasília). */
export function seloPrazoML(prazo: Date | null, agora: Date): DadosSelo | null {
  if (!prazo) return null;
  const resta = prazo.getTime() - agora.getTime();
  if (resta < 0) return { texto: 'Prazo do ML vencido', tom: 'erro' };
  return { texto: `Prazo ${formatarDataHora(prazo)}`, tom: resta <= UM_DIA_MS ? 'erro' : 'atencao' };
}

export const TOM_STATUS_CONTESTACAO: Record<StatusContestacao, TomSelo> = {
  AGUARDANDO_GESTOR: 'atencao',
  ENVIADA: 'bom',
  FALHOU: 'erro',
};
```

- [ ] **Passo 3: Implementar as contestações**

`src/modules/mercado-livre/contestacoes.ts`:

```ts
import { and, asc, count, eq, inArray, isNull, like, notInArray, sql } from 'drizzle-orm';
import { ehRecusaDefinitiva, ErroMotivoIndisponivel, logErroML, mensagemErroML } from '@/conectores/marketplace/mercadolivre/erros';
import type { MotivoCanal } from '@/conectores/marketplace/tipos';
import type { DbOuTx } from '@/db/client';
import { contestacoesCanal, devolucoes, evidencias, itensDevolucao, usuarios } from '@/db/schema';
import { ehUuid } from '@/lib/uuid';
import { pode } from '@/modules/auth/permissoes';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import type { DadosSelo } from '@/modules/devolucoes/selos';
import type { Fila } from '@/modules/fila/fila';
import { registrarEvento } from '@/modules/historico/eventos';
import { obterArmazenamento } from '@/modules/midia/armazenamento';
import { obterConectorML } from './conector';
import { ErroContaML } from './contas';
import { ehMotivoCanal, MOTIVOS_COM_FOTO_OBRIGATORIA, ROTULO_MOTIVO_CANAL, type StatusContestacao } from './dominio';
import { LIMITE_MENSAGEM, MAX_FOTOS_CONTESTACAO, TEXTO_MOTIVO_ITEM, TIPOS_FOTO_CONTESTACAO } from './resultado';
import { seloPrazoML } from './selos';

/** Spec §7.4: JPG de até 5 MB. */
export const LIMITE_FOTO_ML_BYTES = 5 * 1024 * 1024;

export class ErroContestacao extends Error {
  readonly erros: string[];

  constructor(erros: string[]) {
    super(erros.join(' '));
    this.name = 'ErroContestacao';
    this.erros = erros;
  }
}

/** Nomes do PDF (spec §6.3). */
const ROTULO_FOTO: Record<string, string> = {
  FOTO_1_ETIQUETA: 'Foto 1',
  FOTO_2_EMBALAGEM: 'Foto 2',
  FOTO_3_PRODUTO: 'Foto 3',
  FOTO_4_CODIGO_SERIAL: 'Foto 4',
  EXTRA: 'Extra',
};

export function rotuloFoto(tipo: string, unidade: number | null): string {
  const nome = ROTULO_FOTO[tipo] ?? tipo;
  return unidade === null ? nome : `${nome} · unidade ${unidade}`;
}

function motivoValido(texto: string): MotivoCanal {
  return ehMotivoCanal(texto) ? texto : 'SRF6';
}

function comMaiuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export type CartaoContestacao = {
  id: string;
  devolucaoId: string;
  codigo: string;
  motivo: MotivoCanal;
  status: StatusContestacao;
  enviando: boolean;
  prazo: Date | null;
  selo: DadosSelo | null;
  fotos: number;
  erro: string | null;
};

export async function listarContestacoes(db: DbOuTx, status: StatusContestacao, agora: Date = new Date()): Promise<CartaoContestacao[]> {
  const linhas = await db
    .select({
      id: contestacoesCanal.id,
      devolucaoId: contestacoesCanal.devolucaoId,
      codigo: devolucoes.codigo,
      motivo: contestacoesCanal.motivoCanal,
      status: contestacoesCanal.status,
      revisadoPor: contestacoesCanal.revisadoPor,
      prazo: contestacoesCanal.prazo,
      evidencias: contestacoesCanal.evidencias,
      erro: contestacoesCanal.erro,
    })
    .from(contestacoesCanal)
    .innerJoin(devolucoes, eq(devolucoes.id, contestacoesCanal.devolucaoId))
    .where(eq(contestacoesCanal.status, status))
    .orderBy(sql`${contestacoesCanal.prazo} asc nulls last`, asc(contestacoesCanal.criadaEm))
    .limit(200);
  return linhas.map((l) => ({
    id: l.id,
    devolucaoId: l.devolucaoId,
    codigo: l.codigo,
    motivo: motivoValido(l.motivo),
    status: l.status,
    enviando: l.status === 'AGUARDANDO_GESTOR' && l.revisadoPor !== null,
    prazo: l.prazo,
    selo: l.status === 'ENVIADA' ? null : seloPrazoML(l.prazo, agora),
    fotos: l.evidencias.length,
    erro: l.erro,
  }));
}

export async function contarContestacoes(db: DbOuTx): Promise<Record<StatusContestacao, number>> {
  const linhas = await db.select({ status: contestacoesCanal.status, total: count() }).from(contestacoesCanal).groupBy(contestacoesCanal.status);
  const contagem: Record<StatusContestacao, number> = { AGUARDANDO_GESTOR: 0, ENVIADA: 0, FALHOU: 0 };
  for (const l of linhas) contagem[l.status] = Number(l.total);
  return contagem;
}

/** Fotos que podem ir ao ML (spec §6.6: o Gestor revisa as fotos). As que falharam ou foram apagadas não entram. */
async function fotosDaDevolucao(db: DbOuTx, devolucaoId: string) {
  return db
    .select({
      id: evidencias.id,
      tipo: evidencias.tipo,
      caminho: evidencias.caminho,
      situacao: evidencias.situacaoProcessamento,
      unidade: itensDevolucao.unidade,
    })
    .from(evidencias)
    .leftJoin(itensDevolucao, eq(itensDevolucao.id, evidencias.itemId))
    .where(
      and(
        eq(evidencias.devolucaoId, devolucaoId),
        inArray(evidencias.tipo, [...TIPOS_FOTO_CONTESTACAO]),
        like(evidencias.tipoConteudo, 'image/%'),
        notInArray(evidencias.situacaoProcessamento, ['FALHOU', 'APAGADA']),
      ),
    )
    .orderBy(asc(evidencias.tipo), asc(itensDevolucao.unidade), asc(evidencias.enviadoEm));
}

export type FotoCandidata = { id: string; tipo: string; rotulo: string; caminho: string | null; selecionada: boolean };

export type DetalheContestacao = {
  id: string;
  devolucaoId: string;
  codigo: string;
  pedidos: string[];
  reclamacaoId: string | null;
  devolucaoExternaId: string | null;
  motivo: MotivoCanal;
  mensagem: string;
  status: StatusContestacao;
  enviando: boolean;
  prazo: Date | null;
  selo: DadosSelo | null;
  erro: string | null;
  revisadoPorNome: string | null;
  enviadaEm: Date | null;
  itensProblema: { unidade: number; sku: string; motivoTexto: string; observacao: string | null }[];
  fotos: FotoCandidata[];
};

export async function obterContestacao(db: DbOuTx, id: string, agora: Date = new Date()): Promise<DetalheContestacao | null> {
  if (!ehUuid(id)) return null;
  const [c] = await db
    .select({
      id: contestacoesCanal.id,
      devolucaoId: contestacoesCanal.devolucaoId,
      codigo: devolucoes.codigo,
      pedidos: devolucoes.pedidosExternos,
      reclamacaoId: devolucoes.reclamacaoId,
      devolucaoExternaId: devolucoes.devolucaoExternaId,
      motivo: contestacoesCanal.motivoCanal,
      mensagem: contestacoesCanal.mensagem,
      status: contestacoesCanal.status,
      revisadoPor: contestacoesCanal.revisadoPor,
      revisadoPorNome: usuarios.nome,
      prazo: contestacoesCanal.prazo,
      erro: contestacoesCanal.erro,
      enviadaEm: contestacoesCanal.enviadaEm,
      evidencias: contestacoesCanal.evidencias,
    })
    .from(contestacoesCanal)
    .innerJoin(devolucoes, eq(devolucoes.id, contestacoesCanal.devolucaoId))
    .leftJoin(usuarios, eq(usuarios.id, contestacoesCanal.revisadoPor))
    .where(eq(contestacoesCanal.id, id));
  if (!c) return null;
  const itens = await db
    .select({
      unidade: itensDevolucao.unidade,
      sku: itensDevolucao.sku,
      status: itensDevolucao.status,
      destino: itensDevolucao.destino,
      motivo: itensDevolucao.motivo,
      observacao: itensDevolucao.observacao,
    })
    .from(itensDevolucao)
    .where(eq(itensDevolucao.devolucaoId, c.devolucaoId))
    .orderBy(asc(itensDevolucao.unidade));
  const fotos = await fotosDaDevolucao(db, c.devolucaoId);
  return {
    id: c.id,
    devolucaoId: c.devolucaoId,
    codigo: c.codigo,
    pedidos: c.pedidos,
    reclamacaoId: c.reclamacaoId,
    devolucaoExternaId: c.devolucaoExternaId,
    motivo: motivoValido(c.motivo),
    mensagem: c.mensagem,
    status: c.status,
    enviando: c.status === 'AGUARDANDO_GESTOR' && c.revisadoPor !== null,
    prazo: c.prazo,
    selo: c.status === 'ENVIADA' ? null : seloPrazoML(c.prazo, agora),
    erro: c.erro,
    revisadoPorNome: c.revisadoPorNome,
    enviadaEm: c.enviadaEm,
    itensProblema: itens
      .filter((i) => i.status === 'AUSENTE' || i.destino === 'PROBLEMA')
      .map((i) => ({
        unidade: i.unidade,
        sku: i.sku,
        motivoTexto: comMaiuscula(TEXTO_MOTIVO_ITEM[i.status === 'AUSENTE' ? 'AUSENTE' : (i.motivo ?? 'OUTRO')]),
        observacao: i.observacao,
      })),
    fotos: fotos.map((f) => ({
      id: f.id,
      tipo: f.tipo,
      rotulo: rotuloFoto(f.tipo, f.unidade),
      caminho: f.situacao === 'PRONTA' ? f.caminho : null,
      selecionada: c.evidencias.includes(f.id),
    })),
  };
}

export type EntradaRevisao = { motivo: string; mensagem: string; evidencias: string[] };
export type RevisaoValida = { motivo: MotivoCanal; mensagem: string; evidencias: string[] };

export function validarRevisao(e: EntradaRevisao, fotosPermitidas: ReadonlySet<string>): { dados: RevisaoValida | null; erros: string[] } {
  const erros: string[] = [];
  const motivo = e.motivo.trim();
  if (!ehMotivoCanal(motivo)) erros.push('Escolha o motivo para o Mercado Livre.');
  const mensagem = e.mensagem.trim();
  if (mensagem.length < 10) erros.push('Escreva a mensagem para o Mercado Livre (pelo menos 10 letras).');
  if (mensagem.length > LIMITE_MENSAGEM) erros.push(`Mensagem: no máximo ${LIMITE_MENSAGEM} caracteres.`);
  const fotos = [...new Set(e.evidencias)];
  if (fotos.some((f) => !fotosPermitidas.has(f))) erros.push('Uma das fotos escolhidas não é desta devolução.');
  if (fotos.length > MAX_FOTOS_CONTESTACAO) erros.push(`Escolha no máximo ${MAX_FOTOS_CONTESTACAO} fotos.`);
  if (ehMotivoCanal(motivo) && MOTIVOS_COM_FOTO_OBRIGATORIA.includes(motivo) && fotos.length === 0) {
    erros.push(`O motivo "${ROTULO_MOTIVO_CANAL[motivo]}" exige pelo menos 1 foto.`);
  }
  if (erros.length > 0 || !ehMotivoCanal(motivo)) return { dados: null, erros };
  return { dados: { motivo, mensagem, evidencias: fotos }, erros: [] };
}

/**
 * O Gestor revisa (motivo, mensagem e fotos, D8) e pede o envio (spec §6.6). Vale de AGUARDANDO_GESTOR sem envio pedido
 * e de FALHOU. Na mesma transação: grava, registra e enfileira ml.enviar-contestacao.
 */
export async function revisarEEnviar(db: DbOuTx, fila: Fila, id: string, e: EntradaRevisao, usuario: UsuarioSessao, agora: Date): Promise<void> {
  if (!pode(usuario.perfil, 'administrar')) throw new ErroContestacao(['Só o Gestor envia contestações ao Mercado Livre.']);
  if (!ehUuid(id)) throw new ErroContestacao(['Contestação não encontrada.']);
  const [c] = await db
    .select({ status: contestacoesCanal.status, revisadoPor: contestacoesCanal.revisadoPor, devolucaoId: contestacoesCanal.devolucaoId })
    .from(contestacoesCanal)
    .where(eq(contestacoesCanal.id, id));
  if (!c) throw new ErroContestacao(['Contestação não encontrada.']);
  if (c.status === 'ENVIADA') throw new ErroContestacao(['Esta contestação já foi enviada ao Mercado Livre.']);
  if (c.status === 'AGUARDANDO_GESTOR' && c.revisadoPor) throw new ErroContestacao(['O envio já foi pedido. Aguarde o resultado.']);
  const permitidas = new Set((await fotosDaDevolucao(db, c.devolucaoId)).map((f) => f.id));
  const { dados, erros } = validarRevisao(e, permitidas);
  if (!dados) throw new ErroContestacao(erros);
  await db.transaction(async (tx) => {
    const [mudou] = await tx
      .update(contestacoesCanal)
      .set({
        motivoCanal: dados.motivo,
        mensagem: dados.mensagem,
        evidencias: dados.evidencias,
        status: 'AGUARDANDO_GESTOR',
        revisadoPor: usuario.id,
        erro: null,
        atualizadaEm: agora,
      })
      .where(
        and(
          eq(contestacoesCanal.id, id),
          eq(contestacoesCanal.status, c.status),
          c.status === 'AGUARDANDO_GESTOR' ? isNull(contestacoesCanal.revisadoPor) : undefined,
        ),
      )
      .returning({ id: contestacoesCanal.id });
    if (!mudou) throw new ErroContestacao(['O envio já foi pedido. Aguarde o resultado.']);
    await registrarEvento(tx, {
      entidade: 'devolucao',
      entidadeId: c.devolucaoId,
      acao: 'contestacao_revisada',
      usuarioId: usuario.id,
      dados: { contestacaoId: id, motivo: dados.motivo, fotos: dados.evidencias.length, statusAnterior: c.status },
      em: agora,
    });
    await fila.enviar('ml.enviar-contestacao', { contestacaoId: id }, { tx, chaveUnica: `ml-contestacao-${id}` });
  });
}

async function lerArquivo(caminho: string): Promise<Buffer> {
  const partes: Buffer[] = [];
  for await (const parte of await obterArmazenamento().ler(caminho)) partes.push(Buffer.isBuffer(parte) ? parte : Buffer.from(parte));
  return Buffer.concat(partes);
}

export type ResultadoEnvio = 'enviada' | 'falhou' | 'ignorada';

/**
 * Tarefa ml.enviar-contestacao. Espera as fotos ficarem PRONTA (contrato §5.4), lê os arquivos e envia (spec §7.4).
 * Recusa definitiva do ML → FALHOU com o motivo. Erro passageiro → lança (nova tentativa); na última tentativa → FALHOU
 * (decisão 9 do plano).
 */
export async function enviarContestacao(db: DbOuTx, id: string, o: { agora: Date; ultimaTentativa: boolean }): Promise<ResultadoEnvio> {
  if (!ehUuid(id)) return 'ignorada';
  const [c] = await db
    .select({
      devolucaoId: contestacoesCanal.devolucaoId,
      codigo: devolucoes.codigo,
      status: contestacoesCanal.status,
      revisadoPor: contestacoesCanal.revisadoPor,
      motivo: contestacoesCanal.motivoCanal,
      mensagem: contestacoesCanal.mensagem,
      evidencias: contestacoesCanal.evidencias,
      devolucaoExternaId: devolucoes.devolucaoExternaId,
      reclamacaoId: devolucoes.reclamacaoId,
    })
    .from(contestacoesCanal)
    .innerJoin(devolucoes, eq(devolucoes.id, contestacoesCanal.devolucaoId))
    .where(eq(contestacoesCanal.id, id));
  if (!c || c.status !== 'AGUARDANDO_GESTOR' || !c.revisadoPor) return 'ignorada';

  const falhar = async (mensagem: string): Promise<ResultadoEnvio> => {
    await db.transaction(async (tx) => {
      await tx.update(contestacoesCanal).set({ status: 'FALHOU', erro: mensagem, atualizadaEm: o.agora }).where(eq(contestacoesCanal.id, id));
      await registrarEvento(tx, {
        entidade: 'devolucao',
        entidadeId: c.devolucaoId,
        acao: 'contestacao_falhou',
        usuarioId: null,
        dados: { contestacaoId: id, erro: mensagem },
        em: o.agora,
      });
    });
    return 'falhou';
  };
  const tentarDepois = async (mensagem: string, erro: unknown): Promise<ResultadoEnvio> => {
    if (o.ultimaTentativa) return falhar(mensagem);
    throw erro;
  };

  if (!c.devolucaoExternaId || !c.reclamacaoId) return falhar('A devolução não está ligada a uma devolução do Mercado Livre.');
  const motivo = motivoValido(c.motivo);
  const fotos =
    c.evidencias.length === 0
      ? []
      : await db
          .select({ id: evidencias.id, caminho: evidencias.caminho, situacao: evidencias.situacaoProcessamento })
          .from(evidencias)
          .where(inArray(evidencias.id, c.evidencias));
  if (fotos.some((f) => f.situacao === 'RECEBIDA' || f.situacao === 'PROCESSANDO')) {
    return tentarDepois(
      'As fotos ainda estavam sendo processadas. Revise e envie de novo em alguns minutos.',
      new ErroContestacao(['Fotos ainda em processamento.']),
    );
  }
  const anexos: { nome: string; conteudo: Buffer; tipoConteudo: 'image/jpeg' }[] = [];
  for (const evidenciaId of c.evidencias) {
    const foto = fotos.find((f) => f.id === evidenciaId);
    if (!foto || foto.situacao !== 'PRONTA' || !foto.caminho) continue;
    const conteudo = await lerArquivo(foto.caminho);
    if (conteudo.length > LIMITE_FOTO_ML_BYTES) continue;
    anexos.push({ nome: `${c.codigo}-${anexos.length + 1}.jpg`, conteudo, tipoConteudo: 'image/jpeg' });
  }
  if (MOTIVOS_COM_FOTO_OBRIGATORIA.includes(motivo) && anexos.length === 0) {
    return falhar(`Nenhuma foto pôde ser enviada, e o motivo "${ROTULO_MOTIVO_CANAL[motivo]}" exige foto. Escolha as fotos e envie de novo.`);
  }
  const conector = await obterConectorML(db);
  if (!conector) {
    return tentarDepois(
      'A conta do Mercado Livre não está conectada. Conecte em Configurações › Mercado Livre e envie de novo.',
      new ErroContaML('Conta do Mercado Livre não conectada.'),
    );
  }
  try {
    await conector.enviarResultadoConferencia(c.devolucaoExternaId, { tipo: 'PROBLEMA', reclamacaoId: c.reclamacaoId, motivo, mensagem: c.mensagem, anexos });
  } catch (erro) {
    if (erro instanceof ErroMotivoIndisponivel) return falhar(erro.message);
    logErroML('enviar contestação', erro, { contestacaoId: id });
    if (ehRecusaDefinitiva(erro)) return falhar(`O Mercado Livre recusou o envio: ${mensagemErroML(erro)}`);
    return tentarDepois('O Mercado Livre não respondeu depois de várias tentativas. Envie de novo mais tarde.', erro);
  }
  await db.transaction(async (tx) => {
    await tx.update(contestacoesCanal).set({ status: 'ENVIADA', enviadaEm: o.agora, erro: null, atualizadaEm: o.agora }).where(eq(contestacoesCanal.id, id));
    await registrarEvento(tx, {
      entidade: 'devolucao',
      entidadeId: c.devolucaoId,
      acao: 'contestacao_enviada',
      usuarioId: c.revisadoPor,
      dados: { contestacaoId: id, motivo, fotos: anexos.length },
      em: o.agora,
    });
  });
  return 'enviada';
}
```

`src/worker/manipuladores/mercado-livre.ts` (conteúdo completo, agora com as 5 tarefas do contrato):

```ts
import { enviarContestacao } from '@/modules/mercado-livre/contestacoes';
import { processarResultadoConferencia } from '@/modules/mercado-livre/resultado';
import { ehUltimaTentativa, renovarTokensML, sincronizarReclamacao, varrerReclamacoes } from '@/modules/mercado-livre/tarefas';
import type { Manipuladores } from '../tipos';

/** Fase 3 (contrato §5.1). Cada manipulador é idempotente; lançar = nova tentativa. */
export const manipuladoresMercadoLivre: Manipuladores = {
  'ml.sincronizar-reclamacao': async ({ claimId }, ctx) => {
    await sincronizarReclamacao(ctx.db, ctx.fila, claimId, ctx.agora);
  },
  'ml.varredura': async (_dados, ctx) => {
    await varrerReclamacoes(ctx.db, ctx.fila, ctx.agora);
  },
  'ml.renovar-token': async (_dados, ctx) => {
    await renovarTokensML(ctx.db, ctx.agora);
  },
  'ml.enviar-resultado': async ({ devolucaoId }, ctx) => {
    await processarResultadoConferencia(ctx.db, devolucaoId, ctx.agora);
  },
  'ml.enviar-contestacao': async ({ contestacaoId }, ctx) => {
    await enviarContestacao(ctx.db, contestacaoId, { agora: ctx.agora, ultimaTentativa: ehUltimaTentativa('ml.enviar-contestacao', ctx.tentativa) });
  },
};
```

- [ ] **Passo 4: Rodar e confirmar que passa**

Rode: `npm test -- src/modules/mercado-livre && npm run test:int -- src/modules/mercado-livre && npm run typecheck && npm run lint`
Esperado: PASS (selos 3, contestações 4 unitários e 10 de integração).

- [ ] **Passo 5: Commit**

```bash
cd "/c/Users/idmpc/devolucoes-wt/fase-3"
git add src/modules/mercado-livre/selos.ts src/modules/mercado-livre/selos.test.ts src/modules/mercado-livre/contestacoes.ts src/modules/mercado-livre/contestacoes.test.ts src/modules/mercado-livre/contestacoes.int.test.ts src/worker/manipuladores/mercado-livre.ts
git commit -m "feat: contestação revisada pelo Gestor e enviada ao ML com as fotos (ENVIADA ou FALHOU)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 13: Telas de Contestações (lista em cartões, detalhe com fotos e "Enviar ao ML")

**Arquivos:**
- Criar:
  - `src/components/mercado-livre/BotaoConfirmar.tsx` e `src/components/mercado-livre/Dado.tsx`;
  - `src/app/(app)/contestacoes/[id]/page.tsx`, `src/app/(app)/contestacoes/[id]/acoes.ts` e `src/app/(app)/contestacoes/[id]/FormularioContestacao.tsx`.
- Modificar (troca o `EmBreve`): `src/app/(app)/contestacoes/page.tsx` (contrato §3: a página da aba é da Fase 3)
- Testes: `src/components/mercado-livre/BotaoConfirmar.test.tsx`, `src/app/(app)/contestacoes/[id]/FormularioContestacao.test.tsx`

**Interfaces:**
- Consome:
  - `listarContestacoes`, `contarContestacoes`, `obterContestacao`, `revisarEEnviar` e `ErroContestacao` (Tarefa 12), `seloPrazoML` e `TOM_STATUS_CONTESTACAO` (Tarefa 12);
  - `LIMITE_MENSAGEM` (Tarefa 11), `MOTIVOS_CANAL`, `ROTULO_MOTIVO_CANAL`, `ROTULO_STATUS_CONTESTACAO` e `MOTIVOS_COM_FOTO_OBRIGATORIA` (Tarefa 1);
  - `obterArmazenamento().urlTemporaria` (P2), `obterFila` (P2);
  - os componentes da Fase 1: `Selo`, `ListaErros`, `RodapeFormulario`, `MensagemSucesso`, `useEnvioFormulario` e `estilos`.
- Produz:
  - `BotaoConfirmar({ rotulo, rotuloConfirmar, desabilitado?, className })`: o 1º toque pede confirmação, o 2º envia o formulário, e depois de 5 s volta ao normal;
  - `Dado({ rotulo, mono?, children })`;
  - `type EstadoEnvio = { erros: string[] }` e `enviarAcao(id, anterior, dados)`, em `[id]/acoes.ts`;
  - `FormularioContestacao({ acao, motivo, mensagem, limiteMensagem, fotos: { id; rotulo; url: string | null; selecionada }[] })`.

> **Mobile-first:**
> - A lista é de cartões (o cartão inteiro é o link). Os filtros são etiquetas de toque, com contagem, numa faixa que rola por dentro.
> - O detalhe fica em uma coluna:
>   - as fotos numa grade de 2 colunas, cada uma com caixa de marcar e rótulo de 44 px ou mais;
>   - o botão "Enviar ao ML" no rodapé fixo (`RodapeFormulario`), com segundo toque;
>   - os erros vão para a `ListaErros`, que recebe o foco.
> - As fotos usam link temporário de 10 min (spec §9), nunca público.

- [ ] **Passo 1: Escrever os testes que falham**

`src/components/mercado-livre/BotaoConfirmar.test.tsx`:

```tsx
// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { FormEvent } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BotaoConfirmar } from './BotaoConfirmar';

afterEach(() => {
  vi.useRealTimers();
});

function montar(desabilitado = false) {
  const aoEnviar = vi.fn((e: FormEvent) => e.preventDefault());
  render(
    <form onSubmit={aoEnviar}>
      <BotaoConfirmar rotulo="Enviar ao ML" rotuloConfirmar="Toque de novo para enviar ao ML" desabilitado={desabilitado} className="x" />
    </form>,
  );
  return aoEnviar;
}

describe('BotaoConfirmar (ação sem volta pede segundo toque)', () => {
  it('o 1º toque pede confirmação; o 2º envia o formulário uma vez', () => {
    const aoEnviar = montar();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar ao ML' }));
    expect(aoEnviar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Toque de novo para enviar ao ML' }));
    expect(aoEnviar).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Enviar ao ML' })).toBeTruthy();
  });

  it('depois de 5 segundos sem o 2º toque, volta ao normal', () => {
    vi.useFakeTimers();
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar ao ML' }));
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByRole('button', { name: 'Enviar ao ML' })).toBeTruthy();
  });

  it('desabilitado (enviando) não reage', () => {
    const aoEnviar = montar(true);
    const botao = screen.getByRole('button', { name: 'Enviar ao ML' }) as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
    fireEvent.click(botao);
    fireEvent.click(botao);
    expect(aoEnviar).not.toHaveBeenCalled();
  });
});
```

`src/app/(app)/contestacoes/[id]/FormularioContestacao.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { EstadoEnvio } from './acoes';
import { FormularioContestacao } from './FormularioContestacao';

const FOTOS = [
  { id: 'f1', rotulo: 'Foto 1', url: '/api/arquivos?c=1', selecionada: true },
  { id: 'f3', rotulo: 'Foto 3 · unidade 1', url: null, selecionada: false },
];

beforeAll(() => {
  Element.prototype.scrollIntoView = () => undefined;
});

describe('FormularioContestacao (spec §6.6)', () => {
  it('vem preenchido com o motivo, a mensagem e as fotos escolhidas', () => {
    render(<FormularioContestacao acao={vi.fn()} motivo="SRF2" mensagem="Chegou quebrado." limiteMensagem={2000} fotos={FOTOS} />);
    expect((screen.getByLabelText('Motivo para o Mercado Livre') as HTMLSelectElement).value).toBe('SRF2');
    expect((screen.getByLabelText('Mensagem') as HTMLTextAreaElement).value).toBe('Chegou quebrado.');
    expect((screen.getByRole('checkbox', { name: 'Foto 1' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('checkbox', { name: 'Foto 3 · unidade 1' }) as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText('Sem prévia')).toBeTruthy();
  });

  it('o 2º toque em "Enviar ao ML" manda motivo, mensagem e fotos; o erro aparece e recebe o foco', async () => {
    const acao = vi.fn(async (): Promise<EstadoEnvio> => ({ erros: ['O motivo "Produto avariado" exige pelo menos 1 foto.'] }));
    render(<FormularioContestacao acao={acao} motivo="SRF2" mensagem="Chegou quebrado." limiteMensagem={2000} fotos={FOTOS} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Foto 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar ao ML' }));
    fireEvent.click(screen.getByRole('button', { name: 'Toque de novo para enviar ao ML' }));
    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain('exige pelo menos 1 foto');
    await waitFor(() => expect(document.activeElement).toBe(alerta));
    const dados = (acao.mock.calls[0] as unknown as [EstadoEnvio, FormData])[1];
    expect(dados.get('motivo')).toBe('SRF2');
    expect(dados.get('mensagem')).toBe('Chegou quebrado.');
    expect(dados.getAll('foto')).toEqual([]);
  });
});
```

Rode: `npm test -- src/components/mercado-livre "src/app/(app)/contestacoes"`
Esperado: FAIL (os componentes não existem).

- [ ] **Passo 2: Componentes da área**

`src/components/mercado-livre/BotaoConfirmar.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';

/** Quanto tempo o segundo toque continua valendo. */
const TEMPO_CONFIRMACAO_MS = 5000;

/**
 * Botão de ação sem volta ("Desconectar", "Enviar ao ML"): o 1º toque pede confirmação e o 2º envia o formulário.
 * Sempre type="button": se o tipo virasse "submit" no meio do toque, o 1º toque já enviaria (mesmo cuidado de AcoesUsuario).
 */
export function BotaoConfirmar({
  rotulo,
  rotuloConfirmar,
  desabilitado = false,
  className,
}: {
  rotulo: string;
  rotuloConfirmar: string;
  desabilitado?: boolean;
  className: string;
}) {
  const [confirmando, setConfirmando] = useState(false);
  useEffect(() => {
    if (!confirmando) return;
    const espera = setTimeout(() => setConfirmando(false), TEMPO_CONFIRMACAO_MS);
    return () => clearTimeout(espera);
  }, [confirmando]);
  return (
    <button
      type="button"
      disabled={desabilitado}
      className={className}
      onClick={(evento) => {
        if (!confirmando) {
          setConfirmando(true);
          return;
        }
        setConfirmando(false);
        evento.currentTarget.form?.requestSubmit();
      }}
    >
      {confirmando ? rotuloConfirmar : rotulo}
    </button>
  );
}
```

`src/components/mercado-livre/Dado.tsx`:

```tsx
import type { ReactNode } from 'react';
import { ROTULO } from '@/components/estilos';

/** Par rótulo e valor numa lista de definição. Códigos vão em mono e quebram em qualquer ponto (sem rolagem lateral). */
export function Dado({ rotulo, mono = false, children }: { rotulo: string; mono?: boolean; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className={ROTULO}>{rotulo}</dt>
      <dd className={`text-[15px] ${mono ? 'break-all font-mono' : '[overflow-wrap:anywhere]'}`}>{children}</dd>
    </div>
  );
}
```

- [ ] **Passo 3: Ação e formulário do detalhe**

`src/app/(app)/contestacoes/[id]/acoes.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { obterDb } from '@/db';
import { textoDoForm } from '@/lib/formulario';
import { ehUuid } from '@/lib/uuid';
import { exigirPermissao } from '@/modules/auth/servidor';
import { obterFila } from '@/modules/fila/fila';
import { ErroContestacao, revisarEEnviar } from '@/modules/mercado-livre/contestacoes';

export type EstadoEnvio = { erros: string[] };

/** "Enviar ao ML" (spec §6.6). O `id` chega ligado (bind) do cliente: confere o formato antes de usar. */
export async function enviarAcao(id: string, _anterior: EstadoEnvio, dados: FormData): Promise<EstadoEnvio> {
  const usuario = await exigirPermissao('administrar');
  if (!ehUuid(id)) return { erros: ['Contestação não encontrada.'] };
  try {
    await revisarEEnviar(
      obterDb(),
      obterFila(),
      id,
      {
        motivo: textoDoForm(dados, 'motivo'),
        mensagem: textoDoForm(dados, 'mensagem'),
        evidencias: dados.getAll('foto').filter((v): v is string => typeof v === 'string'),
      },
      usuario,
      new Date(),
    );
  } catch (erro) {
    if (erro instanceof ErroContestacao) return { erros: erro.erros };
    throw erro;
  }
  revalidatePath('/contestacoes');
  redirect(`/contestacoes/${id}?ok=solicitado`);
}
```

`src/app/(app)/contestacoes/[id]/FormularioContestacao.tsx`:

```tsx
'use client';

import { ListaErros } from '@/components/ListaErros';
import { RodapeFormulario } from '@/components/RodapeFormulario';
import { BOTAO_PRIMARIO, CAMPO, CARTAO, ROTULO } from '@/components/estilos';
import { BotaoConfirmar } from '@/components/mercado-livre/BotaoConfirmar';
import { useEnvioFormulario } from '@/components/useEnvioFormulario';
import type { MotivoCanal } from '@/conectores/marketplace/tipos';
import { MOTIVOS_CANAL, MOTIVOS_COM_FOTO_OBRIGATORIA, ROTULO_MOTIVO_CANAL } from '@/modules/mercado-livre/dominio';
import type { EstadoEnvio } from './acoes';

type Foto = { id: string; rotulo: string; url: string | null; selecionada: boolean };
type Props = {
  acao: (anterior: EstadoEnvio, dados: FormData) => Promise<EstadoEnvio>;
  motivo: MotivoCanal;
  mensagem: string;
  /** Vem do servidor (LIMITE_MENSAGEM): este componente não importa módulos que tocam o banco. */
  limiteMensagem: number;
  fotos: Foto[];
};

/** O Gestor revisa o motivo, a mensagem e as fotos e envia ao ML (spec §6.6). Uma coluna; botão no rodapé fixo. */
export function FormularioContestacao({ acao, motivo, mensagem, limiteMensagem, fotos }: Props) {
  const [estado, aoEnviar, pendente] = useEnvioFormulario(acao, { erros: [] });
  return (
    <form onSubmit={aoEnviar} aria-labelledby="titulo-revisao" className={`${CARTAO} flex flex-col gap-4`}>
      <h2 id="titulo-revisao" className="text-base font-bold">
        Revisar e enviar
      </h2>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="motivo" className={ROTULO}>
          Motivo para o Mercado Livre
        </label>
        <select id="motivo" name="motivo" defaultValue={motivo} className={CAMPO}>
          {MOTIVOS_CANAL.map((m) => (
            <option key={m} value={m}>
              {m} · {ROTULO_MOTIVO_CANAL[m]}
              {MOTIVOS_COM_FOTO_OBRIGATORIA.includes(m) ? ' (exige foto)' : ''}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="mensagem" className={ROTULO}>
          Mensagem
        </label>
        <textarea
          id="mensagem"
          name="mensagem"
          defaultValue={mensagem}
          required
          minLength={10}
          maxLength={limiteMensagem}
          rows={7}
          className={`${CAMPO} h-auto min-h-40 py-2`}
        />
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className={ROTULO}>Fotos que vão para o ML</legend>
        {fotos.length === 0 ? (
          <p className="text-sm text-texto-2">Nenhuma foto desta devolução.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {fotos.map((f) => (
              <li key={f.id}>
                <label className="flex cursor-pointer flex-col gap-1 rounded-lg border border-borda bg-superficie p-2 has-[:checked]:border-destaque">
                  {f.url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- link temporário assinado (spec §9), sem otimização de imagem
                    <img src={f.url} alt="" className="aspect-square w-full rounded object-cover" />
                  ) : (
                    <span aria-hidden="true" className="flex aspect-square items-center justify-center rounded bg-fundo text-xs text-texto-2">
                      Sem prévia
                    </span>
                  )}
                  <span className="flex min-h-11 items-center gap-2 text-sm">
                    <input type="checkbox" name="foto" value={f.id} defaultChecked={f.selecionada} className="size-5 shrink-0" />
                    {f.rotulo}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>
      <ListaErros erros={estado.erros} />
      <RodapeFormulario>
        <BotaoConfirmar rotulo="Enviar ao ML" rotuloConfirmar="Toque de novo para enviar ao ML" desabilitado={pendente} className={BOTAO_PRIMARIO} />
      </RodapeFormulario>
    </form>
  );
}
```

- [ ] **Passo 4: Páginas**

`src/app/(app)/contestacoes/page.tsx` (substitua o conteúdo):

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { Selo } from '@/components/Selo';
import { ITEM_LISTA, VAZIO } from '@/components/estilos';
import { obterDb } from '@/db';
import { primeiroValor } from '@/lib/parametros';
import { exigirPermissao } from '@/modules/auth/servidor';
import { contarContestacoes, listarContestacoes } from '@/modules/mercado-livre/contestacoes';
import { ehStatusContestacao, ROTULO_MOTIVO_CANAL, ROTULO_STATUS_CONTESTACAO, type StatusContestacao } from '@/modules/mercado-livre/dominio';
import { TOM_STATUS_CONTESTACAO } from '@/modules/mercado-livre/selos';

export const metadata: Metadata = { title: 'Contestações ML · Gestão de Devoluções' };

const FILTROS: { status: StatusContestacao; rotulo: string; vazio: string }[] = [
  { status: 'AGUARDANDO_GESTOR', rotulo: 'Aguardando', vazio: 'Nenhuma contestação esperando o Gestor.' },
  { status: 'FALHOU', rotulo: 'Com falha', vazio: 'Nenhuma contestação com falha.' },
  { status: 'ENVIADA', rotulo: 'Enviadas', vazio: 'Nenhuma contestação enviada ainda.' },
];

type Props = { searchParams: Promise<{ status?: string | string[] }> };

/** Spec §6.6 (extra do PDF, aprovado na spec): fila das contestações com o prazo do ML em destaque. Só o Gestor (§6.9). */
export default async function PaginaContestacoes({ searchParams }: Props) {
  await exigirPermissao('administrar');
  const pedido = primeiroValor((await searchParams).status);
  const status: StatusContestacao = ehStatusContestacao(pedido) ? pedido : 'AGUARDANDO_GESTOR';
  const db = obterDb();
  const [lista, contagem] = await Promise.all([listarContestacoes(db, status), contarContestacoes(db)]);
  const filtro = FILTROS.find((f) => f.status === status) ?? FILTROS[0];
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <h1 className="text-xl font-bold">Contestações ML</h1>
      <nav aria-label="Filtrar contestações" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {FILTROS.map((f) => (
          <Link
            key={f.status}
            href={`/contestacoes?status=${f.status}`}
            aria-current={f.status === status ? 'page' : undefined}
            className={`inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-semibold ${
              f.status === status ? 'border-destaque bg-destaque-suave text-destaque' : 'border-borda bg-superficie text-texto-2'
            }`}
          >
            {f.rotulo} ({contagem[f.status]})
          </Link>
        ))}
      </nav>
      {lista.length === 0 ? (
        <p className={VAZIO}>{filtro.vazio}</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {lista.map((c) => (
            <li key={c.id}>
              <Link href={`/contestacoes/${c.id}`} className={ITEM_LISTA}>
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-[15px] font-bold">{c.codigo}</span>
                  <Selo
                    texto={c.enviando ? 'Enviando ao ML' : ROTULO_STATUS_CONTESTACAO[c.status]}
                    tom={c.enviando ? 'destaque' : TOM_STATUS_CONTESTACAO[c.status]}
                  />
                </span>
                <span className="text-sm">
                  <span className="font-mono">{c.motivo}</span> · {ROTULO_MOTIVO_CANAL[c.motivo]}
                </span>
                <span className="flex flex-wrap items-center gap-2 text-xs text-texto-2">
                  {c.selo && <Selo texto={c.selo.texto} tom={c.selo.tom} />}
                  <span>{c.fotos === 1 ? '1 foto' : `${c.fotos} fotos`}</span>
                </span>
                {c.status === 'FALHOU' && c.erro && <span className="text-sm text-erro [overflow-wrap:anywhere]">{c.erro}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

`src/app/(app)/contestacoes/[id]/page.tsx`:

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MensagemSucesso } from '@/components/MensagemSucesso';
import { Selo } from '@/components/Selo';
import { ALERTA_ATENCAO, ALERTA_ERRO, BOTAO_SECUNDARIO, CARTAO, LINK_VOLTAR } from '@/components/estilos';
import { Dado } from '@/components/mercado-livre/Dado';
import { obterDb } from '@/db';
import { formatarDataHora } from '@/lib/formatar';
import { primeiroValor } from '@/lib/parametros';
import { exigirPermissao } from '@/modules/auth/servidor';
import { obterContestacao } from '@/modules/mercado-livre/contestacoes';
import { ROTULO_MOTIVO_CANAL, ROTULO_STATUS_CONTESTACAO } from '@/modules/mercado-livre/dominio';
import { LIMITE_MENSAGEM } from '@/modules/mercado-livre/resultado';
import { TOM_STATUS_CONTESTACAO } from '@/modules/mercado-livre/selos';
import { obterArmazenamento } from '@/modules/midia/armazenamento';
import { enviarAcao } from './acoes';
import { FormularioContestacao } from './FormularioContestacao';

export const metadata: Metadata = { title: 'Contestação · Gestão de Devoluções' };

/** Spec §9: links temporários de 10 min, nunca públicos. */
const VALIDADE_LINK_S = 600;

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string | string[] }> };

export default async function PaginaContestacao({ params, searchParams }: Props) {
  await exigirPermissao('administrar');
  const { id } = await params;
  const c = await obterContestacao(obterDb(), id);
  if (!c) notFound();
  const pedido = primeiroValor((await searchParams).ok) === 'solicitado';
  const armazenamento = obterArmazenamento();
  const fotos = await Promise.all(
    c.fotos.map(async (f) => ({
      id: f.id,
      rotulo: f.rotulo,
      selecionada: f.selecionada,
      url: f.caminho ? await armazenamento.urlTemporaria(f.caminho, VALIDADE_LINK_S) : null,
    })),
  );
  const podeEditar = (c.status === 'AGUARDANDO_GESTOR' && !c.enviando) || c.status === 'FALHOU';

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Link href={`/contestacoes?status=${c.status}`} className={LINK_VOLTAR}>
          ← Contestações ML
        </Link>
        <h1 className="text-xl font-bold">
          Contestação <span className="font-mono">{c.codigo}</span>
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Selo texto={c.enviando ? 'Enviando ao ML' : ROTULO_STATUS_CONTESTACAO[c.status]} tom={c.enviando ? 'destaque' : TOM_STATUS_CONTESTACAO[c.status]} />
          {c.selo && <Selo texto={c.selo.texto} tom={c.selo.tom} />}
        </div>
      </div>

      {pedido && <MensagemSucesso texto="Envio pedido ao Mercado Livre. O resultado aparece aqui em instantes." />}
      {c.status === 'FALHOU' && c.erro && (
        <p role="alert" className={`${ALERTA_ERRO} [overflow-wrap:anywhere]`}>
          O envio falhou: {c.erro}
        </p>
      )}

      <section aria-labelledby="titulo-devolucao" className={CARTAO}>
        <h2 id="titulo-devolucao" className="mb-3 text-base font-bold">
          Devolução
        </h2>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Dado rotulo="Código" mono>
            <Link href={`/fluxo/devolucoes/${c.codigo}`} className="inline-flex min-h-11 items-center font-semibold text-destaque underline">
              {c.codigo}
            </Link>
          </Dado>
          <Dado rotulo="Número do pedido" mono>
            {c.pedidos.join(', ') || '—'}
          </Dado>
          <Dado rotulo="ID da reclamação" mono>
            {c.reclamacaoId ?? '—'}
          </Dado>
          <Dado rotulo="ID da devolução no ML" mono>
            {c.devolucaoExternaId ?? '—'}
          </Dado>
        </dl>
      </section>

      <section aria-labelledby="titulo-itens" className="flex flex-col gap-2">
        <h2 id="titulo-itens" className="text-base font-bold">
          Itens com problema
        </h2>
        <ul className="grid gap-2 md:grid-cols-2">
          {c.itensProblema.map((i) => (
            <li key={i.unidade} className={`${CARTAO} flex flex-col gap-1 p-3`}>
              <span className="text-xs font-semibold text-texto-2">Unidade {i.unidade}</span>
              <span className="break-all font-mono text-[13px] font-semibold">{i.sku}</span>
              <span className="text-sm">{i.motivoTexto}</span>
              {i.observacao && <span className="text-sm text-texto-2 [overflow-wrap:anywhere]">{i.observacao}</span>}
            </li>
          ))}
        </ul>
      </section>

      {c.enviando && (
        <section aria-labelledby="titulo-enviando" className={`${CARTAO} flex flex-col gap-3`}>
          <h2 id="titulo-enviando" className="text-base font-bold">
            Enviando ao ML
          </h2>
          <p className={ALERTA_ATENCAO}>
            O envio foi pedido{c.revisadoPorNome ? ` por ${c.revisadoPorNome}` : ''}. O resultado aparece aqui em instantes.
          </p>
          <Link href={`/contestacoes/${c.id}`} className={`${BOTAO_SECUNDARIO} w-full md:w-auto`}>
            Atualizar
          </Link>
        </section>
      )}

      {c.status === 'ENVIADA' && (
        <section aria-labelledby="titulo-enviada" className={`${CARTAO} flex flex-col gap-3`}>
          <h2 id="titulo-enviada" className="text-base font-bold">
            Enviada ao ML
          </h2>
          <dl className="grid gap-3">
            <Dado rotulo="Enviada em">
              {c.enviadaEm ? formatarDataHora(c.enviadaEm) : '—'}
              {c.revisadoPorNome ? ` por ${c.revisadoPorNome}` : ''}
            </Dado>
            <Dado rotulo="Motivo">
              {c.motivo} · {ROTULO_MOTIVO_CANAL[c.motivo]}
            </Dado>
            <Dado rotulo="Mensagem">
              <span className="whitespace-pre-wrap">{c.mensagem}</span>
            </Dado>
            <Dado rotulo="Fotos enviadas">{fotos.filter((f) => f.selecionada).length}</Dado>
          </dl>
        </section>
      )}

      {podeEditar && (
        <FormularioContestacao acao={enviarAcao.bind(null, c.id)} motivo={c.motivo} mensagem={c.mensagem} limiteMensagem={LIMITE_MENSAGEM} fotos={fotos} />
      )}
    </div>
  );
}
```

- [ ] **Passo 5: Rodar e confirmar que passa**

Rode: `npm test && npm run typecheck && npm run lint`
Esperado: PASS (BotaoConfirmar 3, FormularioContestacao 2). A tela é testada de ponta a ponta na Tarefa 16.

- [ ] **Passo 6: Conferir no celular (manual, 390×844)**

Rode `npm run dev -- --port 3003`, entre como Gestor e abra `/contestacoes` no DevTools em 390×844. Para ter dados, crie uma contestação: rode `npm run test:int -- src/modules/mercado-livre/contestacoes.int.test.ts`, que deixa o banco de testes, ou use a fábrica num script rápido no banco de dev. Confira:
- sem rolagem lateral;
- etiquetas de filtro com 44 px;
- cartão inteiro clicável;
- no detalhe, o botão "Enviar ao ML" no rodapé fixo acima da barra de abas e o 2º toque.

- [ ] **Passo 7: Commit**

```bash
cd "/c/Users/idmpc/devolucoes-wt/fase-3"
git add src/components/mercado-livre "src/app/(app)/contestacoes"
git commit -m "feat: tela Contestações ML (cartões com prazo, detalhe com fotos e Enviar ao ML com segundo toque)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 14: Seção "Mercado Livre" no detalhe da devolução

**Arquivos:**
- Criar: `src/modules/mercado-livre/consultas.ts`
- Modificar (troca o `return null` da P2): `src/app/(app)/fluxo/devolucoes/[codigo]/secoes/SecaoMercadoLivre.tsx`
- Testes: `src/modules/mercado-livre/consultas.int.test.ts`

**Interfaces:**
- Consome: `reclamacoesMl`, `contestacoesCanal`, `eventosHistorico` e `devolucoes`; `ehMotivoCanal`, `rotuloStatusML` e os rótulos (Tarefa 1); `TOM_STATUS_CONTESTACAO` (Tarefa 12); `Dado` (Tarefa 13).
- Produz:
  - `type ResultadoNoML = { tipo: 'ok'; em: Date } | { tipo: 'ok_recusado'; em: Date; erro: string } | { tipo: 'sem_vinculo'; em: Date } | { tipo: 'contestacao'; id; status; enviando; motivo: MotivoCanal }`;
  - `type ResumoMLDevolucao = { vinculada: boolean; reclamacaoId; devolucaoExternaId; statusCanal; entregueEm; prazo; sincronizadaEm: Date | null; resultado: ResultadoNoML | null }`;
  - `resumoMLDaDevolucao(db, devolucaoId): Promise<ResumoMLDevolucao | null>` (null fora do canal ML);
  - `SecaoMercadoLivre(props)` com a assinatura da P2 (`{ devolucaoId; codigo; status; usuario }`). Mantenha o mesmo tipo de export que a P2 criou (nomeado ou padrão): a página `[codigo]/page.tsx` está congelada.

- [ ] **Passo 1: Escrever o teste que falha**

`src/modules/mercado-livre/consultas.int.test.ts`:

```ts
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { contestacoesCanal } from '@/db/schema';
import { registrarEvento } from '@/modules/historico/eventos';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarDevolucaoTeste, criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { dadosDevolucaoMLTeste, devolucaoExternaTeste, devolucaoMLConferidaTeste } from '../../../tests/helpers/fabricas-ml';
import { resumoMLDaDevolucao } from './consultas';
import { processarResultadoConferencia } from './resultado';
import { aplicarReclamacao } from './sincronizar';

const { db, sql } = criarDbTeste();
const AGORA = new Date('2026-11-12T15:00:00Z');
beforeEach(async () => {
  await limparTabelas(sql);
});
afterAll(async () => {
  await sql.end();
});

describe('resumoMLDaDevolucao (seção "Mercado Livre" do detalhe)', () => {
  it('outro canal: null; ML sem vínculo: vinculada false e sem resultado', async () => {
    const operador = await criarUsuarioTeste(db);
    const shopee = await criarDevolucaoTeste(db, operador);
    expect(await resumoMLDaDevolucao(db, shopee.id)).toBeNull();
    const manual = await criarDevolucaoTeste(db, operador, { canal: 'MERCADO_LIVRE' });
    expect(await resumoMLDaDevolucao(db, manual.id)).toMatchObject({ vinculada: false, resultado: null, sincronizadaEm: null });
  });

  it('do ML: ids, status, entrega, prazo, última sincronização e o "OK" enviado', async () => {
    const d = devolucaoExternaTeste({ statusCanal: 'delivered/delivered', entregueEm: new Date('2026-11-12T10:00:00Z') });
    const r = await aplicarReclamacao(db, dadosDevolucaoMLTeste(d), AGORA);
    if (!('devolucaoId' in r)) throw new Error('a sincronização não criou a devolução');
    await registrarEvento(db, { entidade: 'devolucao', entidadeId: r.devolucaoId, acao: 'ml_resultado_ok_enviado', usuarioId: null, em: AGORA });
    expect(await resumoMLDaDevolucao(db, r.devolucaoId)).toEqual({
      vinculada: true,
      reclamacaoId: d.reclamacaoId,
      devolucaoExternaId: d.devolucaoExternaId,
      statusCanal: 'delivered/delivered',
      entregueEm: d.entregueEm,
      prazo: d.prazoConferencia,
      sincronizadaEm: AGORA,
      resultado: { tipo: 'ok', em: AGORA },
    });
  });

  it('com contestação pedida: o resultado é a contestação, "enviando"', async () => {
    const gestor = await criarUsuarioTeste(db, 'GESTOR');
    const dev = await devolucaoMLConferidaTeste(db, { itens: [{ destino: 'PROBLEMA', motivo: 'AVARIADO' }] });
    await processarResultadoConferencia(db, dev.id, AGORA);
    await db.update(contestacoesCanal).set({ revisadoPor: gestor.id }).where(eq(contestacoesCanal.devolucaoId, dev.id));
    expect((await resumoMLDaDevolucao(db, dev.id))?.resultado).toMatchObject({ tipo: 'contestacao', status: 'AGUARDANDO_GESTOR', enviando: true, motivo: 'SRF2' });
  });
});
```

Rode: `npm run test:int -- src/modules/mercado-livre/consultas.int.test.ts`
Esperado: FAIL ("Failed to resolve import './consultas'").

- [ ] **Passo 2: Implementar a consulta**

`src/modules/mercado-livre/consultas.ts`:

```ts
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { MotivoCanal } from '@/conectores/marketplace/tipos';
import type { DbOuTx } from '@/db/client';
import { contestacoesCanal, devolucoes, eventosHistorico, reclamacoesMl } from '@/db/schema';
import { ehUuid } from '@/lib/uuid';
import { ehMotivoCanal, type StatusContestacao } from './dominio';

export type ResultadoNoML =
  | { tipo: 'ok'; em: Date }
  | { tipo: 'ok_recusado'; em: Date; erro: string }
  | { tipo: 'sem_vinculo'; em: Date }
  | { tipo: 'contestacao'; id: string; status: StatusContestacao; enviando: boolean; motivo: MotivoCanal };

export type ResumoMLDevolucao = {
  vinculada: boolean;
  reclamacaoId: string | null;
  devolucaoExternaId: string | null;
  statusCanal: string | null;
  entregueEm: Date | null;
  prazo: Date | null;
  sincronizadaEm: Date | null;
  resultado: ResultadoNoML | null;
};

const ACOES_RESULTADO = ['ml_resultado_ok_enviado', 'ml_resultado_ok_recusado', 'ml_resultado_sem_vinculo'];

/** O que a seção "Mercado Livre" do detalhe mostra. Null quando a devolução não é do ML. */
export async function resumoMLDaDevolucao(db: DbOuTx, devolucaoId: string): Promise<ResumoMLDevolucao | null> {
  if (!ehUuid(devolucaoId)) return null;
  const [d] = await db
    .select({
      canal: devolucoes.canal,
      reclamacaoId: devolucoes.reclamacaoId,
      devolucaoExternaId: devolucoes.devolucaoExternaId,
      statusCanal: devolucoes.statusCanal,
      entregueEm: devolucoes.entregueSegundoCanalEm,
      prazo: devolucoes.prazoConferenciaCanal,
    })
    .from(devolucoes)
    .where(eq(devolucoes.id, devolucaoId));
  if (!d || d.canal !== 'MERCADO_LIVRE') return null;
  const [reclamacao] = await db
    .select({ sincronizadaEm: reclamacoesMl.sincronizadaEm })
    .from(reclamacoesMl)
    .where(eq(reclamacoesMl.devolucaoId, devolucaoId))
    .orderBy(desc(reclamacoesMl.sincronizadaEm))
    .limit(1);
  const [c] = await db
    .select({ id: contestacoesCanal.id, status: contestacoesCanal.status, revisadoPor: contestacoesCanal.revisadoPor, motivo: contestacoesCanal.motivoCanal })
    .from(contestacoesCanal)
    .where(eq(contestacoesCanal.devolucaoId, devolucaoId));
  const [evento] = await db
    .select({ acao: eventosHistorico.acao, em: eventosHistorico.em, dados: eventosHistorico.dados })
    .from(eventosHistorico)
    .where(and(eq(eventosHistorico.entidade, 'devolucao'), eq(eventosHistorico.entidadeId, devolucaoId), inArray(eventosHistorico.acao, ACOES_RESULTADO)))
    .orderBy(desc(eventosHistorico.id))
    .limit(1);

  let resultado: ResultadoNoML | null = null;
  if (c) {
    resultado = {
      tipo: 'contestacao',
      id: c.id,
      status: c.status,
      enviando: c.status === 'AGUARDANDO_GESTOR' && c.revisadoPor !== null,
      motivo: ehMotivoCanal(c.motivo) ? c.motivo : 'SRF6',
    };
  } else if (evento?.acao === 'ml_resultado_ok_enviado') {
    resultado = { tipo: 'ok', em: evento.em };
  } else if (evento?.acao === 'ml_resultado_ok_recusado') {
    const erro = evento.dados?.erro;
    resultado = { tipo: 'ok_recusado', em: evento.em, erro: typeof erro === 'string' ? erro : 'sem detalhes' };
  } else if (evento?.acao === 'ml_resultado_sem_vinculo') {
    resultado = { tipo: 'sem_vinculo', em: evento.em };
  }
  return {
    vinculada: d.devolucaoExternaId !== null,
    reclamacaoId: d.reclamacaoId,
    devolucaoExternaId: d.devolucaoExternaId,
    statusCanal: d.statusCanal,
    entregueEm: d.entregueEm,
    prazo: d.prazo,
    sincronizadaEm: reclamacao?.sincronizadaEm ?? null,
    resultado,
  };
}
```

- [ ] **Passo 3: Implementar a seção**

`src/app/(app)/fluxo/devolucoes/[codigo]/secoes/SecaoMercadoLivre.tsx` (substitua o conteúdo; se a P2 exportou como `default`, troque `export async function` por `export default async function`):

```tsx
import Link from 'next/link';
import { Selo } from '@/components/Selo';
import { ALERTA_ATENCAO, ALERTA_ERRO, ALERTA_OK, BOTAO_SECUNDARIO, CARTAO } from '@/components/estilos';
import { Dado } from '@/components/mercado-livre/Dado';
import { obterDb } from '@/db';
import { formatarDataHora } from '@/lib/formatar';
import { pode } from '@/modules/auth/permissoes';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import type { StatusDevolucao } from '@/modules/devolucoes/dominio';
import { resumoMLDaDevolucao, type ResultadoNoML } from '@/modules/mercado-livre/consultas';
import { ROTULO_MOTIVO_CANAL, ROTULO_STATUS_CONTESTACAO, rotuloStatusML } from '@/modules/mercado-livre/dominio';
import { TOM_STATUS_CONTESTACAO } from '@/modules/mercado-livre/selos';

type Props = { devolucaoId: string; codigo: string; status: StatusDevolucao; usuario: UsuarioSessao };

function Resultado({ resultado, ehGestor }: { resultado: ResultadoNoML | null; ehGestor: boolean }) {
  if (!resultado) return <p className="text-sm text-texto-2">O resultado vai ao ML quando a conferência terminar.</p>;
  switch (resultado.tipo) {
    case 'ok':
      return <p className={ALERTA_OK}>&quot;OK&quot; enviado ao ML em {formatarDataHora(resultado.em)}.</p>;
    case 'ok_recusado':
      return (
        <p className={`${ALERTA_ERRO} [overflow-wrap:anywhere]`}>
          O ML recusou o &quot;OK&quot; em {formatarDataHora(resultado.em)}: {resultado.erro}
        </p>
      );
    case 'sem_vinculo':
      return <p className={ALERTA_ATENCAO}>O resultado não foi ao ML: a devolução ainda não estava ligada ao Mercado Livre.</p>;
    case 'contestacao':
      return (
        <div className="flex flex-col gap-2">
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <span>
              Contestação <span className="font-mono">{resultado.motivo}</span> · {ROTULO_MOTIVO_CANAL[resultado.motivo]}
            </span>
            <Selo
              texto={resultado.enviando ? 'Enviando ao ML' : ROTULO_STATUS_CONTESTACAO[resultado.status]}
              tom={resultado.enviando ? 'destaque' : TOM_STATUS_CONTESTACAO[resultado.status]}
            />
          </p>
          {ehGestor && (
            <Link href={`/contestacoes/${resultado.id}`} className={`${BOTAO_SECUNDARIO} w-full md:w-auto`}>
              Ver a contestação
            </Link>
          )}
        </div>
      );
  }
}

/** Seção "Mercado Livre" do detalhe da devolução (contrato §2, P2 item 9). Some fora do canal ML. */
export async function SecaoMercadoLivre({ devolucaoId, usuario }: Props) {
  const r = await resumoMLDaDevolucao(obterDb(), devolucaoId);
  if (!r) return null;
  const ehGestor = pode(usuario.perfil, 'administrar');
  return (
    <section aria-labelledby="titulo-ml" className={`${CARTAO} flex flex-col gap-3`}>
      <h2 id="titulo-ml" className="text-base font-bold">
        Mercado Livre
      </h2>
      {r.vinculada ? (
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Dado rotulo="ID da reclamação" mono>
            {r.reclamacaoId ?? '—'}
          </Dado>
          <Dado rotulo="ID da devolução no ML" mono>
            {r.devolucaoExternaId ?? '—'}
          </Dado>
          <Dado rotulo="Status no ML">{rotuloStatusML(r.statusCanal)}</Dado>
          <Dado rotulo="Entregue (ML)">{r.entregueEm ? formatarDataHora(r.entregueEm) : '—'}</Dado>
          <Dado rotulo="Prazo para revisar">{r.prazo ? formatarDataHora(r.prazo) : '—'}</Dado>
          <Dado rotulo="Última sincronização">{r.sincronizadaEm ? formatarDataHora(r.sincronizadaEm) : '—'}</Dado>
        </dl>
      ) : (
        <p className="text-sm text-texto-2">Ainda sem vínculo com uma devolução do Mercado Livre. O vínculo é automático quando o ML avisa sobre este pedido.</p>
      )}
      <Resultado resultado={r.resultado} ehGestor={ehGestor} />
    </section>
  );
}
```

- [ ] **Passo 4: Rodar e confirmar que passa**

Rode: `npm run test:int -- src/modules/mercado-livre/consultas.int.test.ts && npm run typecheck && npm run lint`
Esperado: PASS (3 testes). A seção é testada na tela pela Tarefa 16.

- [ ] **Passo 5: Commit**

```bash
cd "/c/Users/idmpc/devolucoes-wt/fase-3"
git add src/modules/mercado-livre/consultas.ts src/modules/mercado-livre/consultas.int.test.ts "src/app/(app)/fluxo/devolucoes/[codigo]/secoes/SecaoMercadoLivre.tsx"
git commit -m "feat: seção Mercado Livre no detalhe da devolução (ids, status, prazo, sincronização e resultado)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 15: Configurações › Mercado Livre (conectar por OAuth, desconectar, última sincronização)

**Arquivos:**
- Criar:
  - `src/modules/mercado-livre/oauth-estado.ts` e `src/modules/mercado-livre/conexao.ts`;
  - `src/app/api/ml/retorno/route.ts`;
  - `src/app/(app)/configuracoes/mercado-livre/acoes.ts` e `src/app/(app)/configuracoes/mercado-livre/AcoesConta.tsx`.
- Modificar:
  - `src/modules/mercado-livre/consultas.ts`: entram `resumoContaML` e `listarSemEnvioFisico`;
  - `src/app/(app)/configuracoes/mercado-livre/page.tsx`: troca o `EmBreve` da P2 (contrato §3: a subpágina é da Fase 3).
- Testes: `src/modules/mercado-livre/oauth-estado.test.ts`, `src/modules/mercado-livre/conexao.int.test.ts`, `src/modules/mercado-livre/consultas.int.test.ts` (acrescentar)

**Interfaces:**
- Consome:
  - `gerarPkce`, `montarUrlAutorizacao` e `trocarCodigo` (Fase 0 e Tarefa 3), `urlAutorizacaoFalsa` (Tarefa 6), `cifrar` e `decifrar` (Tarefa 2);
  - `configML`, `chaveCriptografia`, `faltasConfigML` e `ErroConfiguracaoML` (Tarefa 2);
  - `conectarConta`, `desconectarConta`, `obterContaML` e `ErroContaML` (Tarefa 7), `fetchDoML` (Tarefa 7);
  - `sincronizacaoAtrasada`, `rotuloStatusML` e `ROTULO_SITUACAO_CONTA` (Tarefa 1), `BotaoConfirmar` e `Dado` (Tarefa 13);
  - `usuarioAtual` e `exigirPermissao`, `obterFila` (P2).
- Produz:
  - em `oauth-estado.ts`: `COOKIE_OAUTH_ML = 'ml_oauth'`, `CAMINHO_RETORNO_ML = '/api/ml/retorno'`, `VALIDADE_ESTADO_MS` (10 min), `type EstadoOAuth`, `criarEstadoOAuth(p): { cookie; state; challenge: string | null }`, `lerEstadoOAuth(cookie, chave, agora): EstadoOAuth | null`, `mesmoState(esperado, recebido): boolean`;
  - em `conexao.ts`: `type ErroConexao = 'estado' | 'negada' | 'sem_codigo' | 'colaborador' | 'outra_conta' | 'troca' | 'configuracao'`, `MENSAGEM_ERRO_CONEXAO`, `ehErroConexao(t)`, `concluirConexaoML(db, fila, p): Promise<'conectada' | ErroConexao>`;
  - em `consultas.ts`: `type ResumoContaML`, `resumoContaML(db, config?, agora?)`, `type ConsultaSemEnvio`, `listarSemEnvioFisico(db, limite?)`;
  - `GET /api/ml/retorno` (o retorno do OAuth configurado no app do ML Developers) e as ações `conectarAcao()` e `desconectarAcao()`.

> **Fluxo do OAuth (spec §7.1):**
> 1. "Conectar" (ação do Gestor) cria o `state` (e o PKCE, se ligado).
> 2. O `state` vai num cookie **cifrado**, `httpOnly`, `sameSite=lax`, `path=/api/ml/retorno`, de 10 min.
> 3. O navegador vai para o ML. No modo falso, vai direto para o retorno com um código falso.
> 4. `/api/ml/retorno` confere o cookie e o `state` (comparação de tempo constante, mesmo Gestor), apaga o cookie e troca o código (zod na resposta).
> 5. Grava a conta cifrada e enfileira a primeira `ml.varredura`.

- [ ] **Passo 1: Escrever os testes que falham**

`src/modules/mercado-livre/oauth-estado.test.ts`:

```ts
import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { cifrar } from '@/lib/cifra';
import { criarEstadoOAuth, lerEstadoOAuth, mesmoState, VALIDADE_ESTADO_MS } from './oauth-estado';

const CHAVE = randomBytes(32);
const AGORA = new Date('2026-11-12T15:00:00Z');

describe('estado do OAuth no cookie cifrado (pendência da Fase 0: conferir o state)', () => {
  it('cria o cookie e o lê de volta, com o mesmo state e o usuário', () => {
    const { cookie, state, challenge } = criarEstadoOAuth({ usuarioId: 'u1', usarPkce: false, chave: CHAVE, agora: AGORA });
    expect(cookie).not.toContain(state);
    expect(challenge).toBeNull();
    expect(lerEstadoOAuth(cookie, CHAVE, AGORA)).toEqual({ state, verifier: null, usuarioId: 'u1', expiraEm: AGORA.getTime() + VALIDADE_ESTADO_MS });
  });

  it('com PKCE, guarda o verifier e devolve o challenge S256 dele', () => {
    const { cookie, challenge } = criarEstadoOAuth({ usuarioId: 'u1', usarPkce: true, chave: CHAVE, agora: AGORA });
    const verifier = lerEstadoOAuth(cookie, CHAVE, AGORA)?.verifier ?? '';
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'));
  });

  it('vencido, alterado, com outra chave ou fora do formato: null', () => {
    const { cookie } = criarEstadoOAuth({ usuarioId: 'u1', usarPkce: false, chave: CHAVE, agora: AGORA });
    expect(lerEstadoOAuth(cookie, CHAVE, new Date(AGORA.getTime() + VALIDADE_ESTADO_MS + 1))).toBeNull();
    expect(lerEstadoOAuth(`${cookie}x`, CHAVE, AGORA)).toBeNull();
    expect(lerEstadoOAuth(cookie, randomBytes(32), AGORA)).toBeNull();
    expect(lerEstadoOAuth(cifrar('{"state":1}', CHAVE), CHAVE, AGORA)).toBeNull();
    expect(lerEstadoOAuth(undefined, CHAVE, AGORA)).toBeNull();
  });

  it('mesmoState: igual só quando é igual, e recusa vazio', () => {
    expect(mesmoState('abc', 'abc')).toBe(true);
    expect(mesmoState('abc', 'abd')).toBe(false);
    expect(mesmoState('abc', 'abcd')).toBe(false);
    expect(mesmoState('abc', null)).toBe(false);
  });
});
```

`src/modules/mercado-livre/conexao.int.test.ts`:

```ts
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchFalsoML } from '@/conectores/marketplace/mercadolivre/falso';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { FilaMemoria } from '@/modules/fila/fila';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { configMLTeste } from '../../../tests/helpers/fabricas-ml';
import { chaveCriptografia } from './config';
import { concluirConexaoML } from './conexao';
import { obterContaML } from './contas';
import { criarEstadoOAuth } from './oauth-estado';

const { db, sql } = criarDbTeste();
const AGORA = new Date('2026-11-12T15:00:00Z');
const config = configMLTeste();
let fila: FilaMemoria;
let gestor: UsuarioSessao;

beforeEach(async () => {
  await limparTabelas(sql);
  fila = new FilaMemoria();
  gestor = await criarUsuarioTeste(db, 'GESTOR');
});
afterEach(() => {
  vi.restoreAllMocks();
});
afterAll(async () => {
  await sql.end();
});

function estado(usuarioId = gestor.id, agora = AGORA) {
  return criarEstadoOAuth({ usuarioId, usarPkce: false, chave: chaveCriptografia(config), agora });
}
function concluir(cookie: string | undefined, parametros: Record<string, string>, fetchFn: typeof fetch = fetchFalsoML) {
  return concluirConexaoML(db, fila, { cookie, parametros: new URLSearchParams(parametros), usuario: gestor, config, fetchFn, agora: AGORA });
}

describe('concluirConexaoML (retorno do OAuth, spec §7.1)', () => {
  it('state certo: troca o código, grava a conta ATIVA e enfileira a primeira varredura', async () => {
    const { cookie, state } = estado();
    expect(await concluir(cookie, { code: 'TG-FALSO-abc', state })).toBe('conectada');
    expect(await obterContaML(db)).toMatchObject({ sellerId: '123456789', situacao: 'ATIVA' });
    expect(fila.enviadas.map((e) => e.nome)).toEqual(['ml.varredura']);
  });

  it('state errado, cookie ausente, vencido ou de outro usuário: "estado", sem chamar o ML', async () => {
    const fetchFn = vi.fn(fetchFalsoML);
    const { cookie, state } = estado();
    expect(await concluir(cookie, { code: 'TG-FALSO-abc', state: 'outro' }, fetchFn)).toBe('estado');
    expect(await concluir(undefined, { code: 'TG-FALSO-abc', state }, fetchFn)).toBe('estado');
    const velho = estado(gestor.id, new Date(AGORA.getTime() - 11 * 60_000));
    expect(await concluir(velho.cookie, { code: 'TG-FALSO-abc', state: velho.state }, fetchFn)).toBe('estado');
    const deOutro = estado('00000000-0000-0000-0000-000000000000');
    expect(await concluir(deOutro.cookie, { code: 'TG-FALSO-abc', state: deOutro.state }, fetchFn)).toBe('estado');
    expect(fetchFn).not.toHaveBeenCalled();
    expect(await obterContaML(db)).toBeNull();
  });

  it('autorização negada no ML, e retorno sem código', async () => {
    const { cookie, state } = estado();
    expect(await concluir(cookie, { error: 'access_denied', state })).toBe('negada');
    expect(await concluir(cookie, { state })).toBe('sem_codigo');
  });

  it('conta de colaborador (invalid_operator_user_id) e outras recusas do ML', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { cookie, state } = estado();
    const colaborador = vi.fn(async () => new Response('{"error":"invalid_operator_user_id","message":"invalid_operator_user_id"}', { status: 403 }));
    expect(await concluir(cookie, { code: 'TG-x', state }, colaborador)).toBe('colaborador');
    const recusa = vi.fn(async () => new Response('{"error":"invalid_grant"}', { status: 400 }));
    expect(await concluir(cookie, { code: 'TG-x', state }, recusa)).toBe('troca');
  });
});
```

Acrescente no **final** de `src/modules/mercado-livre/consultas.int.test.ts` (e acrescente `listarSemEnvioFisico, resumoContaML` ao import de `./consultas` e `configMLTeste, contaMLTeste` ao import das fábricas; `marcarSincronizacao` vem de `./contas`):

```ts
describe('resumoContaML e listarSemEnvioFisico (Configurações › Mercado Livre)', () => {
  it('sem conta: o que falta no servidor (modo api) e nenhum atraso', async () => {
    const r = await resumoContaML(db, configMLTeste({ modo: 'api', clientId: '', clientSecret: '', redirectUri: '', chaveBase64: '' }), AGORA);
    expect(r).toMatchObject({ conta: null, modo: 'api', sincronizacaoAtrasada: false, urlNotificacoes: null });
    expect(r.faltas).toEqual(['ML_CLIENT_ID', 'ML_CLIENT_SECRET', 'ML_REDIRECT_URI', 'CHAVE_CRIPTOGRAFIA']);
  });

  it('com conta: endereço dos avisos a partir do retorno, e atraso depois de 1 h sem sincronizar', async () => {
    const { contaId } = await contaMLTeste(db);
    const config = configMLTeste({ redirectUri: 'https://devolucoes.exemplo.com/api/ml/retorno' });
    expect((await resumoContaML(db, config, new Date())).urlNotificacoes).toBe('https://devolucoes.exemplo.com/api/ml/notificacoes');
    await marcarSincronizacao(db, contaId, new Date(Date.now() - 2 * 60 * 60 * 1000));
    expect((await resumoContaML(db, config, new Date())).sincronizacaoAtrasada).toBe(true);
    await marcarSincronizacao(db, contaId, new Date());
    expect((await resumoContaML(db, config, new Date())).sincronizacaoAtrasada).toBe(false);
  });

  it('lista só as low_cost (D10), da mais recente para a mais antiga', async () => {
    await aplicarReclamacao(db, dadosDevolucaoMLTeste(devolucaoExternaTeste({ semEnvioFisico: true, statusCanal: 'closed', rastreio: null })), new Date('2026-11-12T10:00:00Z'));
    const recente = devolucaoExternaTeste({ semEnvioFisico: true, statusCanal: 'closed', rastreio: null });
    await aplicarReclamacao(db, dadosDevolucaoMLTeste(recente), new Date('2026-11-12T11:00:00Z'));
    await aplicarReclamacao(db, dadosDevolucaoMLTeste(devolucaoExternaTeste()), AGORA);
    const lista = await listarSemEnvioFisico(db);
    expect(lista).toHaveLength(2);
    expect(lista[0]).toMatchObject({ reclamacaoId: recente.reclamacaoId, returnId: recente.devolucaoExternaId, statusDevolucao: 'closed' });
  });
});
```

Rode: `npm test -- src/modules/mercado-livre/oauth-estado.test.ts`
Esperado: FAIL ("Failed to resolve import './oauth-estado'").

- [ ] **Passo 2: Estado do OAuth e conclusão da conexão**

`src/modules/mercado-livre/oauth-estado.ts`:

```ts
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { gerarPkce } from '@/conectores/marketplace/mercadolivre/oauth';
import { cifrar, decifrar } from '@/lib/cifra';

export const COOKIE_OAUTH_ML = 'ml_oauth';
export const CAMINHO_RETORNO_ML = '/api/ml/retorno';
export const VALIDADE_ESTADO_MS = 10 * 60 * 1000;

export type EstadoOAuth = { state: string; verifier: string | null; usuarioId: string; expiraEm: number };

/** O `state` (e o verifier do PKCE) ficam num cookie cifrado, preso ao Gestor que pediu, por 10 minutos. */
export function criarEstadoOAuth(p: { usuarioId: string; usarPkce: boolean; chave: Buffer; agora: Date }): {
  cookie: string;
  state: string;
  challenge: string | null;
} {
  const state = randomBytes(16).toString('hex');
  const pkce = p.usarPkce ? gerarPkce() : null;
  const estado: EstadoOAuth = { state, verifier: pkce?.verifier ?? null, usuarioId: p.usuarioId, expiraEm: p.agora.getTime() + VALIDADE_ESTADO_MS };
  return { cookie: cifrar(JSON.stringify(estado), p.chave), state, challenge: pkce?.challenge ?? null };
}

export function lerEstadoOAuth(cookie: string | undefined, chave: Buffer, agora: Date): EstadoOAuth | null {
  if (!cookie) return null;
  try {
    const e = JSON.parse(decifrar(cookie, chave)) as Partial<EstadoOAuth>;
    if (typeof e.state !== 'string' || typeof e.usuarioId !== 'string' || typeof e.expiraEm !== 'number') return null;
    if (e.expiraEm < agora.getTime()) return null;
    return { state: e.state, verifier: typeof e.verifier === 'string' ? e.verifier : null, usuarioId: e.usuarioId, expiraEm: e.expiraEm };
  } catch {
    return null;
  }
}

/** Comparação de tempo constante (não vaza quantos caracteres batem). */
export function mesmoState(esperado: string, recebido: string | null): boolean {
  if (!recebido) return false;
  const a = Buffer.from(esperado);
  const b = Buffer.from(recebido);
  return a.length === b.length && timingSafeEqual(a, b);
}
```

`src/modules/mercado-livre/conexao.ts`:

```ts
import { ErroML } from '@/conectores/marketplace/mercadolivre/cliente';
import { codigoErroML, logErroML } from '@/conectores/marketplace/mercadolivre/erros';
import { trocarCodigo, type TokensML } from '@/conectores/marketplace/mercadolivre/oauth';
import type { DbOuTx } from '@/db/client';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import type { Fila } from '@/modules/fila/fila';
import { chaveCriptografia, ErroConfiguracaoML, type ConfigML } from './config';
import { conectarConta, ErroContaML } from './contas';
import { lerEstadoOAuth, mesmoState } from './oauth-estado';

export const ERROS_CONEXAO = ['estado', 'negada', 'sem_codigo', 'colaborador', 'outra_conta', 'troca', 'configuracao'] as const;
export type ErroConexao = (typeof ERROS_CONEXAO)[number];

export const MENSAGEM_ERRO_CONEXAO: Record<ErroConexao, string> = {
  estado: 'O pedido de conexão venceu ou não é deste navegador. Toque em "Conectar" de novo.',
  negada: 'A autorização foi cancelada no Mercado Livre.',
  sem_codigo: 'O Mercado Livre não devolveu o código de autorização. Tente de novo.',
  colaborador: 'Entre com a conta administradora principal do Mercado Livre (conta de colaborador não serve).',
  outra_conta: 'Já existe outra conta do Mercado Livre conectada. Desconecte-a antes.',
  troca: 'O Mercado Livre recusou a autorização. Tente de novo em alguns minutos.',
  configuracao: 'A integração não está configurada no servidor (veja CHAVE_CRIPTOGRAFIA no .env).',
};

export function ehErroConexao(texto: string): texto is ErroConexao {
  return (ERROS_CONEXAO as readonly string[]).includes(texto);
}

/** Retorno do OAuth (spec §7.1): confere o state, troca o código, grava a conta cifrada e pede a primeira varredura. */
export async function concluirConexaoML(
  db: DbOuTx,
  fila: Fila,
  p: { cookie: string | undefined; parametros: URLSearchParams; usuario: UsuarioSessao; config: ConfigML; fetchFn: typeof fetch; agora: Date },
): Promise<'conectada' | ErroConexao> {
  let chave: Buffer;
  try {
    chave = chaveCriptografia(p.config);
  } catch (erro) {
    if (erro instanceof ErroConfiguracaoML) return 'configuracao';
    throw erro;
  }
  const estado = lerEstadoOAuth(p.cookie, chave, p.agora);
  if (!estado || estado.usuarioId !== p.usuario.id || !mesmoState(estado.state, p.parametros.get('state'))) return 'estado';
  if (p.parametros.get('error')) return 'negada';
  const code = p.parametros.get('code');
  if (!code) return 'sem_codigo';
  let tokens: TokensML;
  try {
    tokens = await trocarCodigo({
      clientId: p.config.clientId,
      clientSecret: p.config.clientSecret,
      code,
      redirectUri: p.config.redirectUri,
      codeVerifier: estado.verifier ?? undefined,
      fetchFn: p.fetchFn,
      agora: p.agora,
    });
  } catch (erro) {
    if (!(erro instanceof ErroML)) throw erro;
    logErroML('trocar o código do OAuth', erro);
    return codigoErroML(erro) === 'invalid_operator_user_id' ? 'colaborador' : 'troca';
  }
  try {
    await conectarConta(db, tokens, p.usuario, p.config, p.agora);
  } catch (erro) {
    if (erro instanceof ErroContaML) return 'outra_conta';
    throw erro;
  }
  await fila.enviar('ml.varredura', {});
  return 'conectada';
}
```

Em `src/modules/mercado-livre/consultas.ts`:
1. Acrescente estes imports no topo:

   ```ts
   import { configML, faltasConfigML, type ConfigML, type ModoML } from './config';
   import { obterContaML, type ContaML } from './contas';
   ```

2. Acrescente `sincronizacaoAtrasada` ao import de `./dominio`.
3. Acrescente no final:

```ts
export type ResumoContaML = {
  conta: ContaML | null;
  modo: ModoML;
  faltas: string[];
  sincronizacaoAtrasada: boolean;
  redirectUri: string;
  urlNotificacoes: string | null;
};

/**
 * Tela Configurações › Mercado Livre. O atraso conta desde a última varredura, ou desde a conexão quando ainda não
 * houve nenhuma (logo depois de conectar não é "parada").
 */
export async function resumoContaML(db: DbOuTx, config: ConfigML = configML(), agora: Date = new Date()): Promise<ResumoContaML> {
  const conta = await obterContaML(db);
  let urlNotificacoes: string | null = null;
  try {
    urlNotificacoes = config.redirectUri ? new URL('/api/ml/notificacoes', config.redirectUri).toString() : null;
  } catch {
    urlNotificacoes = null;
  }
  return {
    conta,
    modo: config.modo,
    faltas: faltasConfigML(config),
    sincronizacaoAtrasada: conta !== null && conta.situacao === 'ATIVA' && sincronizacaoAtrasada(conta.ultimaSincronizacaoEm ?? conta.conectadaEm, agora),
    redirectUri: config.redirectUri,
    urlNotificacoes,
  };
}

export type ConsultaSemEnvio = { reclamacaoId: string; returnId: string | null; statusDevolucao: string | null; sincronizadaEm: Date };

/** D10: devoluções low_cost (sem envio físico), só para consulta. */
export async function listarSemEnvioFisico(db: DbOuTx, limite = 50): Promise<ConsultaSemEnvio[]> {
  return db
    .select({
      reclamacaoId: reclamacoesMl.claimId,
      returnId: reclamacoesMl.returnId,
      statusDevolucao: reclamacoesMl.statusDevolucao,
      sincronizadaEm: reclamacoesMl.sincronizadaEm,
    })
    .from(reclamacoesMl)
    .where(eq(reclamacoesMl.subtipo, 'low_cost'))
    .orderBy(desc(reclamacoesMl.sincronizadaEm))
    .limit(limite);
}
```

- [ ] **Passo 3: Rota de retorno, ações e tela**

`src/app/api/ml/retorno/route.ts`:

```ts
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { obterDb } from '@/db';
import { pode } from '@/modules/auth/permissoes';
import { usuarioAtual } from '@/modules/auth/servidor';
import { obterFila } from '@/modules/fila/fila';
import { configML } from '@/modules/mercado-livre/config';
import { concluirConexaoML } from '@/modules/mercado-livre/conexao';
import { fetchDoML } from '@/modules/mercado-livre/fabrica-conector';
import { CAMINHO_RETORNO_ML, COOKIE_OAUTH_ML } from '@/modules/mercado-livre/oauth-estado';

export const dynamic = 'force-dynamic';

const PAGINA = '/configuracoes/mercado-livre';

/** Retorno do OAuth do ML (ML_REDIRECT_URI aponta para cá). Só o Gestor que pediu a conexão conclui (spec §6.9). */
export async function GET(requisicao: Request) {
  const usuario = await usuarioAtual();
  if (!usuario) redirect('/login');
  if (!pode(usuario.perfil, 'administrar')) return new Response(null, { status: 404 });
  const loja = await cookies();
  const cookie = loja.get(COOKIE_OAUTH_ML)?.value;
  // O cookie vale para uma tentativa só.
  loja.set(COOKIE_OAUTH_ML, '', { path: CAMINHO_RETORNO_ML, maxAge: 0 });
  const config = configML();
  const resultado = await concluirConexaoML(obterDb(), obterFila(), {
    cookie,
    parametros: new URL(requisicao.url).searchParams,
    usuario,
    config,
    fetchFn: fetchDoML(config),
    agora: new Date(),
  });
  redirect(resultado === 'conectada' ? `${PAGINA}?ok=conectada` : `${PAGINA}?erro=${resultado}`);
}
```

`src/app/(app)/configuracoes/mercado-livre/acoes.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { urlAutorizacaoFalsa } from '@/conectores/marketplace/mercadolivre/falso';
import { montarUrlAutorizacao } from '@/conectores/marketplace/mercadolivre/oauth';
import { obterDb } from '@/db';
import { exigirPermissao } from '@/modules/auth/servidor';
import { chaveCriptografia, configML, ErroConfiguracaoML, faltasConfigML } from '@/modules/mercado-livre/config';
import { desconectarConta } from '@/modules/mercado-livre/contas';
import { CAMINHO_RETORNO_ML, COOKIE_OAUTH_ML, criarEstadoOAuth, VALIDADE_ESTADO_MS } from '@/modules/mercado-livre/oauth-estado';

export type EstadoConta = { erros: string[] };

/** "Conectar conta do Mercado Livre" (spec §7.1): grava o state no cookie cifrado e manda o navegador ao ML. */
export async function conectarAcao(): Promise<EstadoConta> {
  const usuario = await exigirPermissao('administrar');
  const config = configML();
  const faltas = faltasConfigML(config);
  if (faltas.length > 0) return { erros: [`Faltam no servidor: ${faltas.join(', ')}.`] };
  let destino: string;
  try {
    const { cookie, state, challenge } = criarEstadoOAuth({ usuarioId: usuario.id, usarPkce: config.usarPkce, chave: chaveCriptografia(config), agora: new Date() });
    (await cookies()).set(COOKIE_OAUTH_ML, cookie, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: CAMINHO_RETORNO_ML,
      maxAge: VALIDADE_ESTADO_MS / 1000,
    });
    destino =
      config.modo === 'falso'
        ? urlAutorizacaoFalsa(state)
        : montarUrlAutorizacao({ clientId: config.clientId, redirectUri: config.redirectUri, state, codeChallenge: challenge ?? undefined });
  } catch (erro) {
    if (erro instanceof ErroConfiguracaoML) return { erros: [erro.message] };
    throw erro;
  }
  redirect(destino);
}

export async function desconectarAcao(): Promise<EstadoConta> {
  const usuario = await exigirPermissao('administrar');
  await desconectarConta(obterDb(), usuario, new Date());
  revalidatePath('/configuracoes/mercado-livre');
  redirect('/configuracoes/mercado-livre?ok=desconectada');
}
```

`src/app/(app)/configuracoes/mercado-livre/AcoesConta.tsx`:

```tsx
'use client';

import { ListaErros } from '@/components/ListaErros';
import { BOTAO_PERIGO, BOTAO_PRIMARIO } from '@/components/estilos';
import { BotaoConfirmar } from '@/components/mercado-livre/BotaoConfirmar';
import { useEnvioFormulario } from '@/components/useEnvioFormulario';
import { conectarAcao, desconectarAcao, type EstadoConta } from './acoes';

const INICIAL: EstadoConta = { erros: [] };

export function BotaoConectar({ rotulo }: { rotulo: string }) {
  const [estado, aoEnviar, pendente] = useEnvioFormulario(conectarAcao, INICIAL, 'erros-conectar');
  return (
    <form onSubmit={aoEnviar} className="flex flex-col gap-2">
      <p className="text-sm text-texto-2">Entre com a conta administradora principal do Mercado Livre (conta de colaborador não funciona).</p>
      <button type="submit" disabled={pendente} className={`${BOTAO_PRIMARIO} w-full md:w-auto`}>
        {pendente ? 'Abrindo o Mercado Livre…' : rotulo}
      </button>
      <ListaErros erros={estado.erros} id="erros-conectar" />
    </form>
  );
}

/** Ação sem volta: segundo toque (como "Desativar" em Usuários). */
export function BotaoDesconectar() {
  const [estado, aoEnviar, pendente] = useEnvioFormulario(desconectarAcao, INICIAL, 'erros-desconectar');
  return (
    <form onSubmit={aoEnviar} className="flex flex-col gap-2 border-t border-borda pt-3">
      <BotaoConfirmar rotulo="Desconectar" rotuloConfirmar="Toque de novo para desconectar" desabilitado={pendente} className={BOTAO_PERIGO} />
      <ListaErros erros={estado.erros} id="erros-desconectar" />
    </form>
  );
}
```

`src/app/(app)/configuracoes/mercado-livre/page.tsx` (substitua o `EmBreve` da P2):

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { MensagemSucesso } from '@/components/MensagemSucesso';
import { Selo } from '@/components/Selo';
import { ALERTA_ATENCAO, ALERTA_ERRO, CARTAO, LINK_VOLTAR, VAZIO } from '@/components/estilos';
import { Dado } from '@/components/mercado-livre/Dado';
import { obterDb } from '@/db';
import { formatarDataHora } from '@/lib/formatar';
import { primeiroValor } from '@/lib/parametros';
import { exigirPermissao } from '@/modules/auth/servidor';
import { ehErroConexao, MENSAGEM_ERRO_CONEXAO } from '@/modules/mercado-livre/conexao';
import { listarSemEnvioFisico, resumoContaML } from '@/modules/mercado-livre/consultas';
import { ROTULO_SITUACAO_CONTA, rotuloStatusML } from '@/modules/mercado-livre/dominio';
import { BotaoConectar, BotaoDesconectar } from './AcoesConta';

export const metadata: Metadata = { title: 'Mercado Livre · Gestão de Devoluções' };

const MENSAGEM_OK: Record<string, string> = {
  conectada: 'Conta do Mercado Livre conectada.',
  desconectada: 'Conta do Mercado Livre desconectada.',
};

type Props = { searchParams: Promise<{ ok?: string | string[]; erro?: string | string[] }> };

/** Spec §6.8 e §7.1: conexão com o ML (Gestor). */
export default async function PaginaMercadoLivre({ searchParams }: Props) {
  await exigirPermissao('administrar');
  const parametros = await searchParams;
  const ok = MENSAGEM_OK[primeiroValor(parametros.ok)];
  const codigoErro = primeiroValor(parametros.erro);
  const erro = ehErroConexao(codigoErro) ? MENSAGEM_ERRO_CONEXAO[codigoErro] : null;
  const db = obterDb();
  const [resumo, semEnvio] = await Promise.all([resumoContaML(db), listarSemEnvioFisico(db)]);
  const { conta } = resumo;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Link href="/configuracoes" className={LINK_VOLTAR}>
          ← Configurações
        </Link>
        <h1 className="text-xl font-bold">Mercado Livre</h1>
      </div>

      {ok && <MensagemSucesso texto={ok} />}
      {erro && (
        <p role="alert" className={ALERTA_ERRO}>
          {erro}
        </p>
      )}

      <section aria-labelledby="titulo-conta" className={`${CARTAO} flex flex-col gap-3`}>
        <h2 id="titulo-conta" className="text-base font-bold">
          Conta
        </h2>
        {resumo.modo === 'falso' && <p className={ALERTA_ATENCAO}>Modo de teste: o sistema usa um Mercado Livre falso (ML_CONECTOR=falso).</p>}
        {conta ? (
          <>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <Dado rotulo="Vendedor (ID no ML)" mono>
                {conta.sellerId}
              </Dado>
              <Dado rotulo="Situação">
                <Selo texto={ROTULO_SITUACAO_CONTA[conta.situacao]} tom={conta.situacao === 'ATIVA' ? 'bom' : 'erro'} />
              </Dado>
              <Dado rotulo="Conectada em">
                {formatarDataHora(conta.conectadaEm)}
                {conta.conectadaPorNome ? ` por ${conta.conectadaPorNome}` : ''}
              </Dado>
              <Dado rotulo="Última sincronização">
                {conta.ultimaSincronizacaoEm ? formatarDataHora(conta.ultimaSincronizacaoEm) : 'Ainda não sincronizou'}
              </Dado>
            </dl>
            {conta.situacao === 'RECONECTAR' && (
              <p role="alert" className={ALERTA_ERRO}>
                O Mercado Livre recusou o acesso (senha trocada, autorização revogada ou 4 meses sem uso). Conecte de novo.
              </p>
            )}
            {resumo.sincronizacaoAtrasada && <p className={ALERTA_ATENCAO}>Sincronização parada há mais de 1 hora.</p>}
          </>
        ) : (
          <p className="text-sm text-texto-2">Nenhuma conta conectada.</p>
        )}
        {resumo.faltas.length > 0 && <p className={ALERTA_ERRO}>Faltam no servidor: {resumo.faltas.join(', ')}.</p>}
        {(!conta || conta.situacao === 'RECONECTAR') && <BotaoConectar rotulo={conta ? 'Conectar de novo' : 'Conectar conta do Mercado Livre'} />}
        {conta && <BotaoDesconectar />}
      </section>

      <section aria-labelledby="titulo-app" className={`${CARTAO} flex flex-col gap-3`}>
        <h2 id="titulo-app" className="text-base font-bold">
          App no ML Developers <span className="text-sm font-normal text-texto-2">(extra)</span>
        </h2>
        <dl className="grid gap-3">
          <Dado rotulo="URL de retorno (redirect URI)" mono>
            {resumo.redirectUri || '—'}
          </Dado>
          <Dado rotulo="URL de notificações" mono>
            {resumo.urlNotificacoes ?? '—'}
          </Dado>
          <Dado rotulo="Tópico">post_purchase (claims e claims_actions)</Dado>
          <Dado rotulo="Permissões">Vendas e envios; Comunicação pré e pós-venda; Faturamento (leitura e escrita)</Dado>
        </dl>
      </section>

      <section aria-labelledby="titulo-sem-envio" className="flex flex-col gap-2">
        <h2 id="titulo-sem-envio" className="text-base font-bold">
          Devoluções sem envio físico (low_cost)
        </h2>
        <p className="text-sm text-texto-2">Só para consulta: o ML reembolsou sem o produto voltar, então não entram no fluxo.</p>
        {semEnvio.length === 0 ? (
          <p className={VAZIO}>Nenhuma devolução sem envio físico.</p>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {semEnvio.map((s) => (
              <li key={s.reclamacaoId} className={`${CARTAO} flex flex-col gap-1 p-3`}>
                <span className="break-all font-mono text-[13px] font-semibold">Reclamação {s.reclamacaoId}</span>
                <span className="break-all font-mono text-xs text-texto-2">Devolução {s.returnId ?? '—'}</span>
                <span className="text-sm">{rotuloStatusML(s.statusDevolucao)}</span>
                <span className="text-xs text-texto-2">Sincronizada em {formatarDataHora(s.sincronizadaEm)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Passo 4: Rodar e confirmar que passa**

Rode: `npm test && npm run test:int -- src/modules/mercado-livre && npm run typecheck && npm run lint`
Esperado: PASS (estado do OAuth 4, conexão 4, consultas +3).

- [ ] **Passo 5: Conferir no celular (manual, 390×844)**

Com `npm run dev -- --port 3003` e `ML_CONECTOR=falso`, entre como Gestor e abra `/configuracoes/mercado-livre`. Toque em "Conectar conta do Mercado Livre": a página volta com "Conta do Mercado Livre conectada." e o vendedor 123456789. Se o worker estiver rodando (`npm run worker`), "Última sincronização" ganha data em poucos segundos. Confira também:
- "Desconectar" pede o 2º toque;
- sem rolagem lateral (os endereços longos quebram linha);
- botões com 44 px.

- [ ] **Passo 6: Commit**

```bash
cd "/c/Users/idmpc/devolucoes-wt/fase-3"
git add src/modules/mercado-livre/oauth-estado.ts src/modules/mercado-livre/oauth-estado.test.ts src/modules/mercado-livre/conexao.ts src/modules/mercado-livre/conexao.int.test.ts src/modules/mercado-livre/consultas.ts src/modules/mercado-livre/consultas.int.test.ts src/app/api/ml/retorno "src/app/(app)/configuracoes/mercado-livre"
git commit -m "feat: Configurações › Mercado Livre com OAuth (state em cookie cifrado, PKCE), desconectar e última sincronização" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 16: Ponta a ponta do Mercado Livre (computador e celular)

**Arquivos:**
- Criar: `tests/e2e/apoio-ml.ts`, `tests/e2e/mercado-livre.spec.ts`

**Interfaces:**
- Consome:
  - de `tests/e2e/apoio.ts` (congelado): `comBanco`, `usuarioPorEmail`, `entrarComo`, `semRolagemLateral` e `paginaNaoEncontrada`;
  - `USUARIOS_E2E`;
  - `devolucaoMLConferidaTeste` (Tarefa 11), `processarResultadoConferencia` (Tarefa 11), `conectarConta` e `obterContaML` (Tarefa 7);
  - `idReclamacaoFalsa`, `idsDaReclamacaoFalsa` e `vendedorFalso` (Tarefa 6), `configML` (Tarefa 2).
- Produz: em `apoio-ml.ts`, `emModoFalso()`, `semContaML()`, `garantirContaFalsa()`, `avisarML(request, reclamacaoId)`, `esperarDevolucaoDaReclamacao(reclamacaoId): Promise<string>`, `contestacaoPronta(p: { cenario; motivo }): Promise<{ id; codigo }>` e `alvosDeToque44(raiz: Locator)`.

> **Pré-requisitos da P2** (contrato §2, item 10):
> - O `tests/e2e/global-setup.ts` sobe o worker com o banco de testes e os falsos (`ML_CONECTOR=falso` vem do `.env` da worktree).
> - O servidor do e2e (`next start`, NODE_ENV=production) também precisa aceitar o falso: o `lerEnv` da P2 deve liberar os falsos no e2e. Se isso não acontecer, é emenda no `main`, não mudança aqui.
>
> **O spec é pulado** (`test.skip`) se o `.env` estiver com `ML_CONECTOR=api`: o e2e nunca fala com o ML real.
>
> **Dados:** o banco do e2e é o mesmo para o computador e o celular, então cada teste cria os seus com ids únicos (`idReclamacaoFalsa`).
>
> **Espera:** o worker processa a fila em segundos, e os testes esperam com `expect.poll` (até 30 s).

- [ ] **Passo 1: Apoio do e2e**

`tests/e2e/apoio-ml.ts`:

```ts
import { expect, type APIRequestContext, type Locator } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { idReclamacaoFalsa, idsDaReclamacaoFalsa, vendedorFalso } from '../../src/conectores/marketplace/mercadolivre/falso';
import { contasMarketplace, contestacoesCanal, devolucoes } from '../../src/db/schema';
import type { MotivoItem } from '../../src/modules/devolucoes/dominio';
import { configML } from '../../src/modules/mercado-livre/config';
import { conectarConta } from '../../src/modules/mercado-livre/contas';
import { processarResultadoConferencia } from '../../src/modules/mercado-livre/resultado';
import { devolucaoMLConferidaTeste } from '../helpers/fabricas-ml';
import { comBanco, usuarioPorEmail } from './apoio';
import { USUARIOS_E2E } from './dados';

/** O e2e do ML só roda com o falso (ML_CONECTOR=falso no .env): nunca fala com o ML real. */
export function emModoFalso(): boolean {
  return configML().modo === 'falso';
}

export async function semContaML(): Promise<void> {
  await comBanco(async (db) => {
    await db.delete(contasMarketplace).where(eq(contasMarketplace.canal, 'MERCADO_LIVRE'));
  });
}

/** Conta do vendedor falso, ATIVA, com tokens falsos (a mesma chave do .env que o servidor e o worker usam). */
export async function garantirContaFalsa(): Promise<void> {
  await comBanco(async (db) => {
    const gestor = await usuarioPorEmail(db, USUARIOS_E2E.gestor.email);
    await conectarConta(
      db,
      {
        accessToken: 'APP_USR-FALSO-E2E',
        refreshToken: 'TG-FALSO-E2E',
        expiraEm: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
        userId: Number(vendedorFalso()),
        escopo: 'offline_access read write',
      },
      gestor,
      configML(),
      new Date(),
    );
  });
}

/** Aviso do ML como a documentação mostra (tópico post_purchase), enviado ao endpoint público. */
export async function avisarML(request: APIRequestContext, reclamacaoId: string): Promise<void> {
  const resposta = await request.post('/api/ml/notificacoes', {
    data: {
      _id: `e2e-${reclamacaoId}`,
      resource: `/post-purchase/v1/claims/${reclamacaoId}`,
      user_id: Number(vendedorFalso()),
      topic: 'post_purchase',
      actions: ['claims'],
      application_id: configML().clientId || '999',
      attempts: 1,
    },
  });
  expect(resposta.status()).toBe(200);
}

/** Espera o worker sincronizar a reclamação (aviso → fila → worker → banco) e devolve o código DEV. */
export async function esperarDevolucaoDaReclamacao(reclamacaoId: string): Promise<string> {
  let codigo = '';
  await expect
    .poll(
      async () => {
        codigo = await comBanco(async (db) => {
          const [d] = await db.select({ codigo: devolucoes.codigo }).from(devolucoes).where(eq(devolucoes.reclamacaoId, reclamacaoId));
          return d?.codigo ?? '';
        });
        return codigo;
      },
      { timeout: 30_000, intervals: [500, 1000, 2000] },
    )
    .not.toBe('');
  return codigo;
}

/** Devolução do ML falso conferida (por fábrica, contrato §5.6) com 1 item PROBLEMA, e a contestação AGUARDANDO_GESTOR. */
export async function contestacaoPronta(p: { cenario: number; motivo: MotivoItem }): Promise<{ id: string; codigo: string }> {
  const ids = idsDaReclamacaoFalsa(idReclamacaoFalsa(p.cenario));
  if (!ids) throw new Error(`cenário falso inválido: ${p.cenario}`);
  return comBanco(async (db) => {
    const d = await devolucaoMLConferidaTeste(db, {
      itens: [{ sku: 'MLF-FONE-01', destino: 'PROBLEMA', motivo: p.motivo, observacao: 'Marcas de uso na caixa e no produto.' }],
      externa: {
        reclamacaoId: ids.reclamacaoId,
        devolucaoExternaId: ids.devolucaoId,
        pedidos: ids.pedidos,
        rastreio: ids.rastreio,
        prazoConferencia: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      },
    });
    await processarResultadoConferencia(db, d.id, new Date());
    const [c] = await db.select({ id: contestacoesCanal.id }).from(contestacoesCanal).where(eq(contestacoesCanal.devolucaoId, d.id));
    return { id: c.id, codigo: d.codigo };
  });
}

/** Mobile-first: botões, links, campos e rótulos de caixas de marcar dentro de `raiz` têm pelo menos 44 px de altura. */
export async function alvosDeToque44(raiz: Locator): Promise<void> {
  const pequenos = await raiz.evaluate((el) =>
    [
      ...el.querySelectorAll<HTMLElement>(
        'a, button, select, textarea, input:not([type=hidden]):not([type=checkbox]):not([type=radio]), label:has(input[type=checkbox]), label:has(input[type=radio])',
      ),
    ]
      .filter((alvo) => {
        const r = alvo.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.height < 43.5;
      })
      .map((alvo) => `${alvo.tagName.toLowerCase()} "${(alvo.textContent ?? '').trim().slice(0, 40)}"`),
  );
  expect(pequenos, 'alvos de toque com menos de 44 px').toEqual([]);
}
```

- [ ] **Passo 2: Escrever o spec**

`tests/e2e/mercado-livre.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { idReclamacaoFalsa } from '../../src/conectores/marketplace/mercadolivre/falso';
import { entrarComo, paginaNaoEncontrada, semRolagemLateral } from './apoio';
import { alvosDeToque44, avisarML, contestacaoPronta, emModoFalso, esperarDevolucaoDaReclamacao, garantirContaFalsa, semContaML } from './apoio-ml';
import { USUARIOS_E2E } from './dados';

test.skip(!emModoFalso(), 'O e2e do Mercado Livre roda só com ML_CONECTOR=falso.');

test('gestor conecta a conta do ML (falso), vê a última sincronização e desconecta', async ({ page }) => {
  await semContaML();
  await entrarComo(page, USUARIOS_E2E.gestor);
  await page.goto('/configuracoes/mercado-livre');
  await expect(page.getByRole('heading', { level: 1, name: 'Mercado Livre' })).toBeVisible();
  await expect(page.getByText('Nenhuma conta conectada.')).toBeVisible();
  await semRolagemLateral(page);
  await alvosDeToque44(page.locator('main'));

  await page.getByRole('button', { name: 'Conectar conta do Mercado Livre' }).click();
  await expect(page).toHaveURL(/\/configuracoes\/mercado-livre\?ok=conectada$/);
  await expect(page.getByRole('status')).toHaveText('Conta do Mercado Livre conectada.');
  await expect(page.getByText('123456789', { exact: true })).toBeVisible();
  // A conexão enfileira a primeira varredura; o worker do e2e grava a última sincronização.
  await expect
    .poll(
      async () => {
        await page.reload();
        return page.getByText('Ainda não sincronizou').count();
      },
      { timeout: 30_000, intervals: [1000, 2000] },
    )
    .toBe(0);
  await semRolagemLateral(page);
  await alvosDeToque44(page.locator('main'));

  await page.getByRole('button', { name: 'Desconectar' }).click();
  await page.getByRole('button', { name: 'Toque de novo para desconectar' }).click();
  await expect(page).toHaveURL(/\?ok=desconectada$/);
  await expect(page.getByText('Nenhuma conta conectada.')).toBeVisible();
});

test('aviso do ML cria a devolução sozinha e o detalhe mostra a seção Mercado Livre', async ({ page, request }) => {
  await garantirContaFalsa();
  const reclamacaoId = idReclamacaoFalsa(1);
  await avisarML(request, reclamacaoId);
  const codigo = await esperarDevolucaoDaReclamacao(reclamacaoId);

  await entrarComo(page, USUARIOS_E2E.operador);
  await page.goto(`/fluxo/devolucoes/${codigo}`);
  await expect(page.getByRole('heading', { level: 1, name: codigo })).toBeVisible();
  await expect(page.getByText('Automática (API do canal)')).toBeVisible();
  const secao = page.locator('section[aria-labelledby="titulo-ml"]');
  await expect(secao.getByRole('heading', { name: 'Mercado Livre' })).toBeVisible();
  await expect(secao.getByText(reclamacaoId, { exact: true })).toBeVisible();
  await expect(secao.getByText('A caminho')).toBeVisible();
  await semRolagemLateral(page);
  await alvosDeToque44(secao);
});

test('o endpoint de avisos recusa JSON inválido (400) e aceita aviso de outro recurso (200)', async ({ request }) => {
  const invalido = await request.post('/api/ml/notificacoes', { data: '{nao json', headers: { 'content-type': 'application/json' } });
  expect(invalido.status()).toBe(400);
  const outro = await request.post('/api/ml/notificacoes', { data: { resource: '/orders/1', topic: 'orders_v2', user_id: 1 } });
  expect(outro.status()).toBe(200);
});

test('gestor revisa a contestação e envia ao ML', async ({ page }) => {
  await garantirContaFalsa();
  const { id, codigo } = await contestacaoPronta({ cenario: 1, motivo: 'USADO' });
  await entrarComo(page, USUARIOS_E2E.gestor);
  await page.goto('/contestacoes');
  await expect(page.getByRole('heading', { level: 1, name: 'Contestações ML' })).toBeVisible();
  const cartao = page.getByRole('link', { name: new RegExp(codigo) });
  await expect(cartao).toContainText('SRF6');
  await expect(cartao).toContainText('Prazo');
  await semRolagemLateral(page);
  await alvosDeToque44(page.locator('main'));

  await cartao.click();
  await expect(page).toHaveURL(new RegExp(`/contestacoes/${id}$`));
  await expect(page.getByRole('heading', { level: 1, name: `Contestação ${codigo}` })).toBeVisible();
  await page.getByLabel('Mensagem').fill('O produto voltou com marcas de uso. Pedimos a revisão.');
  await semRolagemLateral(page);
  await alvosDeToque44(page.locator('main'));
  await page.getByRole('button', { name: 'Enviar ao ML' }).click();
  await page.getByRole('button', { name: 'Toque de novo para enviar ao ML' }).click();
  await expect(page.getByRole('status')).toHaveText('Envio pedido ao Mercado Livre. O resultado aparece aqui em instantes.');
  await expect
    .poll(
      async () => {
        await page.reload();
        return page.getByRole('heading', { name: 'Enviada ao ML' }).count();
      },
      { timeout: 30_000, intervals: [1000, 2000] },
    )
    .toBe(1);
  await expect(page.getByText('O produto voltou com marcas de uso. Pedimos a revisão.')).toBeVisible();
  await semRolagemLateral(page);
});

test('contestação recusada pelo ML aparece com o motivo e pode ser revisada de novo', async ({ page }) => {
  await garantirContaFalsa();
  const { id } = await contestacaoPronta({ cenario: 8, motivo: 'USADO' });
  await entrarComo(page, USUARIOS_E2E.gestor);
  await page.goto(`/contestacoes/${id}`);
  await page.getByRole('button', { name: 'Enviar ao ML' }).click();
  await page.getByRole('button', { name: 'Toque de novo para enviar ao ML' }).click();
  await expect(page.getByRole('status')).toBeVisible();
  await expect
    .poll(
      async () => {
        await page.reload();
        return page.getByText(/O envio falhou: O Mercado Livre recusou o envio/).count();
      },
      { timeout: 30_000, intervals: [1000, 2000] },
    )
    .toBe(1);
  await expect(page.getByRole('button', { name: 'Enviar ao ML' })).toBeVisible();
  await semRolagemLateral(page);
  await page.goto('/contestacoes?status=FALHOU');
  await expect(page.getByRole('link', { name: /^Com falha/ })).toHaveAttribute('aria-current', 'page');
});

test('fiscal não abre Configurações › Mercado Livre nem o detalhe de uma contestação (HTTP 404)', async ({ page }) => {
  const { id } = await contestacaoPronta({ cenario: 1, motivo: 'AVARIADO' });
  await entrarComo(page, USUARIOS_E2E.fiscal);
  await paginaNaoEncontrada(page, '/configuracoes/mercado-livre');
  await paginaNaoEncontrada(page, `/contestacoes/${id}`);
});
```

- [ ] **Passo 3: Rodar**

Pare o `npm run dev`. Rode: `npm run test:e2e -- tests/e2e/mercado-livre.spec.ts`
Esperado: 12 passed (6 testes × computador e celular), no servidor de produção da porta 3103.

Se o teste da conexão ou o da contestação esperar até o fim sem resultado, o worker do e2e não está processando a fila do ML. Confira:
- se o `src/worker/index.ts` (P2) junta `manipuladoresMercadoLivre`;
- se o worker sobe com `ML_CONECTOR=falso` e a mesma `CHAVE_CRIPTOGRAFIA` do `.env`.

- [ ] **Passo 4: Rodar a suíte inteira**

Rode: `npm run typecheck && npm run lint && npm test && npm run test:int && npm run build:scripts && npm run test:e2e`
Esperado: tudo PASS. Os specs das Fases 0 e 1 seguem verdes; o `permissoes.spec.ts` continua dando 404 ao Fiscal em `/contestacoes`.

- [ ] **Passo 5: Commit**

```bash
cd "/c/Users/idmpc/devolucoes-wt/fase-3"
git add tests/e2e/apoio-ml.ts tests/e2e/mercado-livre.spec.ts
git commit -m "test: e2e do Mercado Livre no computador e no celular (conexão, aviso, seção, contestação enviada e recusada)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 17: Integração (contrato §7)

Feita na worktree da Fase 3, **depois** que a Fase 2 já foi mergeada no `main` (ordem: merge 2 → merge 3 → merge 4).

**Arquivos:**
- Criar: `src/modules/mercado-livre/integracao-conferencia.int.test.ts`
- Regenerado: `drizzle/00NN_fase3_mercado_livre.sql` (uma migração só)
- Conflitos: só pelas regras da §3 do contrato

**Interfaces:**
- Consome:
  - da **Fase 2 (real)**: `concluirConferencia(db, devolucaoId, usuario, agora?)` (contrato §5.4);
  - da **Fase 1 (real)**: `receberPorRastreio`;
  - da **Fase 3**: `sincronizarReclamacao`, `revisarEEnviar`, `criarConectorMLDaConta`, `manipuladoresMercadoLivre`, `fetchFalsoML` e as fábricas.
- Produz: o teste de integração entre as Fases 2 e 3 pedido no contrato §7.3.

- [ ] **Passo 1: Trazer o `main` e resolver conflitos (contrato §3)**

```bash
cd "/c/Users/idmpc/devolucoes-wt/fase-3"
git merge main
```

Se houver conflito, resolva assim:
- `package.json` e `package-lock.json`: pegue os do `main`. A Fase 3 não instalou dependência, então não há `npm install` a refazer. Só rode `npm ci`.
- Estes arquivos são da Fase 3, então fique com a versão desta branch:
  - `src/modules/devolucoes/criar.ts`;
  - `src/conectores/marketplace/registro.ts`;
  - `src/worker/manipuladores/mercado-livre.ts`;
  - `src/modules/historico/rotulos/mercado-livre.ts`;
  - `src/app/(app)/contestacoes/**` e `src/app/(app)/configuracoes/mercado-livre/**`;
  - `secoes/SecaoMercadoLivre.tsx`;
  - `src/db/schema/mercado-livre.ts` e `notificacoes.ts`.
  - Se o `main` tiver mudado algum deles por emenda, junte as duas mudanças.
- Arquivos congelados: fique com a versão do `main`. A Fase 3 não deve ter mudado nenhum: confira com `git diff main --stat` e desfaça qualquer mudança neles.

- [ ] **Passo 2: Regenerar a migração (contrato §3)**

```bash
git rm -rq drizzle && git checkout main -- drizzle
npm run db:gerar -- --name fase3_mercado_livre
PG="/c/Program Files/PostgreSQL/17/bin"; export PGPASSWORD="$(cat /c/Users/idmpc/.postgres-superusuario.txt)"
"$PG/dropdb.exe" -U postgres --if-exists devolucoes_test_f3 && "$PG/createdb.exe" -U postgres -O devolucoes devolucoes_test_f3
"$PG/dropdb.exe" -U postgres --if-exists devolucoes_f3 && "$PG/createdb.exe" -U postgres -O devolucoes devolucoes_f3
npm run db:migrar
```

Esperado:
- uma migração nova, `drizzle/00NN_fase3_mercado_livre.sql`, depois da última do `main` (a da Fase 2);
- ela traz só os enums `situacao_conta` e `status_contestacao`, as tabelas `contas_marketplace`, `contestacoes_canal` e `reclamacoes_ml`, e a coluna `referencia_externa`;
- não há SQL escrito à mão nesta fase.

- [ ] **Passo 3: Teste de integração entre as fases**

`src/modules/mercado-livre/integracao-conferencia.int.test.ts`:

```ts
/**
 * Contrato §7.3 (Fase 3, já com a 2 no main), com o ML falso (o fetch, não o conector):
 * aviso → devolução do ML → recepção (Fase 1) → conferência concluída pela Fase 2 (código real) →
 * todos BOM: "OK" ao ML; com PROBLEMA: contestação com as Fotos → "Enviar ao ML" sobe as fotos e manda a revisão.
 * O início da conferência é gravado direto: o contrato não fixa o nome da função da Fase 2 que abre a conferência.
 */
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fetchFalsoML, idReclamacaoFalsa } from '@/conectores/marketplace/mercadolivre/falso';
import { definirConectorParaTestes } from '@/conectores/marketplace/registro';
import { contestacoesCanal, devolucoes, itensDevolucao } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { concluirConferencia } from '@/modules/conferencia/concluir';
import { receberPorRastreio } from '@/modules/devolucoes/recebimento';
import { definirFilaParaTestes, FilaMemoria } from '@/modules/fila/fila';
import { manipuladoresMercadoLivre } from '@/worker/manipuladores/mercado-livre';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { configMLTeste, contaMLTeste, fotoTeste } from '../../../tests/helpers/fabricas-ml';
import { revisarEEnviar } from './contestacoes';
import { criarConectorMLDaConta } from './fabrica-conector';
import { sincronizarReclamacao } from './tarefas';

const { db, sql } = criarDbTeste();
let fila: FilaMemoria;
let chamadas: string[];

beforeEach(async () => {
  await limparTabelas(sql);
  fila = new FilaMemoria();
  definirFilaParaTestes(fila);
  chamadas = [];
  const config = configMLTeste();
  await contaMLTeste(db, { config });
  const gravador: typeof fetch = async (entrada, init) => {
    chamadas.push(`${init?.method ?? 'GET'} ${new URL(String(entrada)).pathname}`);
    return fetchFalsoML(entrada, init);
  };
  definirConectorParaTestes('MERCADO_LIVRE', await criarConectorMLDaConta(db, { config, fetchFn: gravador }));
});
afterEach(() => {
  definirConectorParaTestes('MERCADO_LIVRE', null);
  definirFilaParaTestes(null);
});
afterAll(async () => {
  await sql.end();
});

const ctx = () => ({ db, fila, agora: new Date(), tentativa: 1 });

async function conferidaPelaFase2(destino: 'BOM' | 'PROBLEMA'): Promise<{ devolucaoId: string; gestor: UsuarioSessao }> {
  const operador = await criarUsuarioTeste(db, 'OPERADOR');
  const r = await sincronizarReclamacao(db, fila, idReclamacaoFalsa(1), new Date());
  if (!r || !('devolucaoId' in r)) throw new Error('a sincronização não criou a devolução');
  const [d] = await db.select().from(devolucoes).where(eq(devolucoes.id, r.devolucaoId));
  expect(await receberPorRastreio(db, d.rastreio ?? '', operador)).toMatchObject({ tipo: 'recebidas' });
  await db.update(devolucoes).set({ status: 'EM_CONFERENCIA', conferenteId: operador.id, conferenciaIniciadaEm: new Date() }).where(eq(devolucoes.id, d.id));
  await fotoTeste(db, { devolucaoId: d.id, tipo: 'FOTO_1_ETIQUETA' });
  await fotoTeste(db, { devolucaoId: d.id, tipo: 'FOTO_2_EMBALAGEM' });
  await fotoTeste(db, { devolucaoId: d.id, tipo: 'VIDEO_PROVA' });
  for (const item of await db.select().from(itensDevolucao).where(eq(itensDevolucao.devolucaoId, d.id))) {
    await fotoTeste(db, { devolucaoId: d.id, tipo: 'FOTO_3_PRODUTO', itemId: item.id });
    await fotoTeste(db, { devolucaoId: d.id, tipo: 'FOTO_4_CODIGO_SERIAL', itemId: item.id });
    await db.update(itensDevolucao).set({ destino, motivo: destino === 'PROBLEMA' ? 'AVARIADO' : null }).where(eq(itensDevolucao.id, item.id));
  }
  fila = new FilaMemoria();
  definirFilaParaTestes(fila);
  expect(await concluirConferencia(db, d.id, operador)).toEqual({ status: 'AGUARDANDO_NF' });
  expect(fila.enviadas).toEqual([expect.objectContaining({ nome: 'ml.enviar-resultado', dados: { devolucaoId: d.id } })]);
  return { devolucaoId: d.id, gestor: await criarUsuarioTeste(db, 'GESTOR') };
}

describe('Fase 2 → Fase 3 (contrato §5.4 e §7.3)', () => {
  it('todos BOM: a conferência real manda ml.enviar-resultado e o "OK" chega ao ML', async () => {
    const { devolucaoId } = await conferidaPelaFase2('BOM');
    await manipuladoresMercadoLivre['ml.enviar-resultado']?.({ devolucaoId }, ctx());
    expect(chamadas.filter((c) => /^POST \/post-purchase\/v1\/returns\/\d+\/return-review$/.test(c))).toHaveLength(1);
    expect(chamadas.some((c) => c.endsWith('/returns/attachments'))).toBe(false);
  });

  it('com PROBLEMA: contestação AGUARDANDO_GESTOR com as Fotos; "Enviar ao ML" sobe as fotos e manda a revisão', async () => {
    const { devolucaoId, gestor } = await conferidaPelaFase2('PROBLEMA');
    await manipuladoresMercadoLivre['ml.enviar-resultado']?.({ devolucaoId }, ctx());
    const [c] = await db.select().from(contestacoesCanal).where(eq(contestacoesCanal.devolucaoId, devolucaoId));
    expect(c).toMatchObject({ status: 'AGUARDANDO_GESTOR', motivoCanal: 'SRF2' });
    expect(c.evidencias).toHaveLength(4); // Fotos 1, 2, 3 e 4; o Vídeo de Prova não vai ao ML
    await revisarEEnviar(db, fila, c.id, { motivo: 'SRF2', mensagem: c.mensagem, evidencias: c.evidencias }, gestor, new Date());
    await manipuladoresMercadoLivre['ml.enviar-contestacao']?.({ contestacaoId: c.id }, ctx());
    expect(chamadas.filter((x) => x.endsWith('/returns/attachments'))).toHaveLength(4);
    const [enviada] = await db.select().from(contestacoesCanal).where(eq(contestacoesCanal.id, c.id));
    expect(enviada.status).toBe('ENVIADA');
  });
});
```

Rode: `npm run test:int -- src/modules/mercado-livre/integracao-conferencia.int.test.ts`
Esperado: PASS (2 testes).

Se o `concluirConferencia` da Fase 2 recusar por alguma regra que o contrato não descreve, ajuste só o **preparo** no teste, gravando direto o que a Fase 2 exige. Exemplos: `ean_lido` ou `produto_recebido_id`, conforme o plano da Fase 2. Não mude código da Fase 2.

- [ ] **Passo 4: Rodar tudo (contrato §7, item 2)**

Rode: `npm run typecheck && npm run lint && npm test && npm run test:int && npm run build:scripts && npm run test:e2e`
Esperado: tudo PASS. Isso inclui os e2e da conferência da Fase 2 e os do Mercado Livre, nos dois projetos.

- [ ] **Passo 5: Commit**

```bash
cd "/c/Users/idmpc/devolucoes-wt/fase-3"
git add drizzle src/modules/mercado-livre/integracao-conferencia.int.test.ts
git commit -m "chore: integração da Fase 3 com o main (migração única e teste entre conferência e Mercado Livre)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Depois, no `main`, quem integra faz o resto do contrato §7:
1. `git merge --no-ff fase-3-mercado-livre`.
2. Recriar `devolucoes_test` e rodar a suíte inteira.
3. Rodar `npm run db:migrar` no banco `devolucoes`.
4. Apagar a worktree e os bancos `_f3`.
5. Atualizar o README.
6. A worktree da Fase 4, que ainda está aberta, faz `git merge main`. Assim o `obterConector` passa a devolver o conector do ML (contrato §5.8).

---

## Depois da fase: "Ligação das contas reais" (contrato §9, antes da Fase 6)

Esta etapa não faz parte desta fase. O que o usuário e o controlador fazem nela:

1. **App no ML Developers** (spec §15):
   - URL de retorno: `https://<domínio>/api/ml/retorno`;
   - notificações: `https://<domínio>/api/ml/notificacoes`, tópico `post_purchase`;
   - permissões: "Vendas e envios", "Comunicação pré e pós-venda" e "Faturamento", em leitura e escrita.
   A tela Configurações › Mercado Livre mostra os dois endereços.
2. **`.env.producao` na VPS:**
   - `ML_CONECTOR=api`, `ML_CLIENT_ID`, `ML_CLIENT_SECRET`, `ML_REDIRECT_URI`;
   - `ML_USAR_PKCE`, se o app pedir;
   - `CHAVE_CRIPTOGRAFIA`, gerada com `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` e guardada fora do git. Se ela se perder, é só conectar de novo.
3. **Respostas reais:** rode `npm run ml:spike` (Fase 0). Ele grava em `tests/fixtures/ml/` as respostas reais já redigidas.
   - Confira a mão que não há dado pessoal.
   - Copie-as para `tests/fixtures/ml/real/`.
   - Acrescente em `mapeamento.test.ts` um `describe('respostas reais')` com os mesmos testes dos exemplos da documentação.
4. **Ajuste do mapeamento:** mexa só em `esquemas.ts`, `mapeamento.ts` e nas funções puras do `conector.ts` (`corpoRevisaoComProblema`, caminhos da NF de venda).
   - Confirme as suposições A1 a A14 e os pontos 1 a 5 da spec §7.6.
   - Registre o que mudou na spec §7.6.
5. **Critério de pronto da spec §14:** conectar a conta administradora principal, ver uma devolução real entrar sozinha e enviar uma contestação real pelo Gestor (de preferência numa devolução de teste combinada com o ML).
6. Os cenários do falso (`tests/fixtures/ml-falso/cenarios.json`) continuam servindo ao dev e ao e2e. Se a resposta real mudar algum formato, atualize os exemplos de `tests/fixtures/ml/doc/` para os testes do falso continuarem fiéis.

## Cobertura da spec e do contrato (conferência do plano)

| Exigência | Tarefa |
|---|---|
| Spec §7.1: OAuth, PKCE, conta administradora, tokens de 6 h e refresh de uso único, renovação a cada ~5 h com trava, RECONECTAR | 3, 7, 10, 15 |
| Spec §7.2: aviso com 200 imediato e fila, busca de novo na API, varredura de 15 min com paginação, vários pedidos, troca, 429 com espera e jitter | 3, 4, 5, 9, 10 |
| Spec §7.3: tradução dos status; entregue sem mudar o status; CD do ML e reenvio da triagem; low_cost; status depois da chegada | 9 |
| Spec §7.4: OK automático, revisão com problema com anexos (JPG ≤ 5 MB, sem vídeo), motivos SRF2 a SRF6, prazo | 5, 11, 12 |
| Spec §7.5 e contrato §5.8: `obterXmlNotaVenda` (e NF falsa para a Fase 4) | 5, 6 |
| Spec §6.6 e §6.9: tela Contestações (Gestor), prazo em destaque, revisar motivo, mensagem e fotos, "Enviar ao ML" | 12, 13 |
| Spec §6.8: Configurações com a conexão do ML | 15 |
| Spec §10: tokens cifrados, permissão no servidor, aviso só como gatilho, LGPD nos logs | 2, 7, 10, 15 |
| Spec §11: sem duplicatas, idempotência, 5 tentativas e depois Falhas, `ultima_sincronizacao_em` e alerta de 1 h | 9, 10, 12, 15 |
| Contrato §4.2, §4.6 e §4.7: tabelas, status da contestação e da conta, eventos `ml_*` | 1, 7, 9, 11, 12 |
| Contrato §5.1, §5.3, §5.4 e §5.5: tarefas `ml.*`, conector, fim da conferência, `criarDevolucao` | 5, 7, 8, 10, 11, 12 |
| D8, D9, D10, D17 | 11/12, 9, 9, 6/16 |
| Pendências da Fase 0: zod no token, `resumirCorpoErro` nos logs, gravação do aviso atrás do conector, tokens cifrados, `state` do OAuth, limite por IP, ids de 16+ dígitos, testes do `/api/ml/notificacoes` | 3, 2, 10, 2/7, 15, 10, 3, 16 |
| Mobile-first: cartões, 44 px, uma coluna com rodapé fixo, foco nos erros, sem rolagem lateral, e2e no celular | 13, 14, 15, 16 |
| Contrato §7: integração | 17 |
