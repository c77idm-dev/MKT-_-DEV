# Fase 5 (Remessas): Plano de Implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar este plano tarefa por tarefa. Os passos usam checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** agrupar automaticamente as unidades com problema em lotes por fornecedor; fechar o lote (com o tipo: conserto, troca ou garantia), mover unidades entre lotes antes disso e reabrir antes da NF; emitir, reenviar e cancelar a **NF de Remessa** pelo ciclo da Fase 4; gerar a **Lista consolidada** (PDF e Excel) para o SAC do fabricante; **Registrar envio** e **Registrar resultado** de cada unidade; e finalizar o lote quando todas estiverem resolvidas. Também: a pendência `SEM_FORNECEDOR`, a tarefa `lotes.alocar-pendentes`, a coluna 5 do quadro e a Seção Lote no detalhe da devolução. Critério de pronto da spec §14: "NF de remessa autorizada em homologação e lista gerada". Neste plano ele é cumprido com o emissor **falso**; a NF real em homologação fica para a etapa "Ligação das contas reais" (contrato §9).

**Arquitetura:**
- A regra fica em `src/modules/lotes/` (funções puras com teste unitário; o que grava no banco com teste de integração). A Fase 5 **troca o corpo** de `src/modules/lotes/porta.ts` (contrato §5.7): a Fase 4 já chama a porta na autorização e no cancelamento das NF, então a alocação automática, a recusa do cancelamento e a NF de remessa entram sem mexer no ciclo da Fase 4.
- A NF de remessa usa o que a Fase 4 já tem: `solicitarEmissao`, `reenviarNota`, `cancelarNota`, a fila `nfe.*`, o emissor e as regras fiscais. A Fase 5 só monta a nota (`montarNotaRemessa`, spec §8.5) e aplica o efeito no lote (`aoAutorizarRemessa`, `aoCancelarRemessa`).
- A lista consolidada é gerada na hora, sem tabela (contrato §4.4): Excel escrito à mão com o `fflate` que já está instalado; PDF com `pdf-lib`.
- Telas mobile-first (390×844 primeiro): cartões, formulários de uma coluna com o botão principal no rodapé fixo, erros que recebem o foco.

**Tecnologias:** Next.js 16.4.6 (App Router), React 19.3, TypeScript strict, Drizzle ORM 0.45 + postgres.js, PostgreSQL, zod 4, Tailwind v4, Vitest 5, Testing Library, Playwright, pg-boss 12.38.0. Já instaladas: `fflate` 0.8.2 (Excel), `read-excel-file` 9.3.14 (só nos testes, para ler o Excel de volta). **Nova:** `pdf-lib@1.17.1` (PDF da lista consolidada).

**Spec:** [docs/superpowers/specs/2026-11-11-gestao-devolucoes-design.md](../specs/2026-11-11-gestao-devolucoes-design.md). Leia §5.1 (Lote, ItemDevolucao), §5.3, §5.4, §5.5, §6.0, §6.5, §6.9, §8.5, §8.6, §9 (prazo de guarda: lotes FINALIZADO), §12 e §14.
**Contrato (obrigatório, vale mais que este plano):** [2026-11-12-contrato-fases-2-6.md](2026-11-12-contrato-fases-2-6.md): §3 (dono de cada arquivo e migrações), §4.4 (modelo dos lotes, já fixado), §4.6 (transições do item e do lote), §4.7 (histórico), §5.1 (fila), §5.6, §5.7 (porta de lotes), §7 (integração), §8 (D11) e §10 (emendas).
**Plano anterior que este consome:** [2026-11-12-fase-4-fiscal.md](2026-11-12-fase-4-fiscal.md) (emissão, ciclo, cancelamento, fábricas fiscais).

## Restrições globais

**Onde trabalhar**
- A Fase 5 **não é paralela**: começa no `main` depois que as Fases 2, 3 e 4 foram juntadas (contrato §1 e §7). Uma worktree só: `/c/Users/JEFFERSON LIMA/devolucoes-wt/fase-5`, branch `fase-5-remessas`.
- `.env` da worktree: `DATABASE_URL=postgres://devolucoes:devolucoes@localhost:5433/devolucoes_f5`, `DATABASE_URL_TEST=postgres://devolucoes:devolucoes@localhost:5433/devolucoes_test_f5`, `PORTA_E2E=3105`, `EMISSOR_NFE=falso`, `ML_CONECTOR=falso`, `ARMAZENAMENTO=disco`. `next dev` na porta 3005 (`npm run dev -- --port 3005`). Neste PC o PostgreSQL do projeto é o 18, na **porta 5433** (a 5432 é de outra coisa: não mexa). No outro PC, PostgreSQL 17 na 5432.
- Criar a worktree e os bancos (Git Bash, uma vez, antes da Tarefa 1):

```bash
cd "/c/Users/JEFFERSON LIMA/MKT-_-DEV"
git fetch -q origin
git log --oneline -1 origin/main   # tem de conter o merge da Fase 4 (fase-4-fiscal)
git worktree add -b fase-5-remessas "/c/Users/JEFFERSON LIMA/devolucoes-wt/fase-5" origin/main
PG="/c/Program Files/PostgreSQL/18/bin"; export PGPASSWORD="$(cat "/c/Users/JEFFERSON LIMA/.postgres-superusuario.txt")"
"$PG/createdb.exe" -h localhost -p 5433 -U postgres -O devolucoes devolucoes_f5
"$PG/createdb.exe" -h localhost -p 5433 -U postgres -O devolucoes devolucoes_test_f5
cp .env "/c/Users/JEFFERSON LIMA/devolucoes-wt/fase-5/.env"   # depois troque DATABASE_URL, DATABASE_URL_TEST e PORTA_E2E
cd "/c/Users/JEFFERSON LIMA/devolucoes-wt/fase-5"
npm ci && npm run db:migrar && npx playwright install chromium
```

- Windows com Git Bash. O caminho tem espaço: **use aspas sempre**. Todos os comandos deste plano rodam na pasta da worktree: `cd "/c/Users/JEFFERSON LIMA/devolucoes-wt/fase-5"`.

**Arquivos que esta fase pode editar**
- Cria ou edita: `src/db/schema/lotes.ts`, `src/modules/lotes/**`, `src/worker/manipuladores/lotes.ts`, `src/components/lotes/**`, `src/app/(app)/lotes/**`, `src/app/(app)/fluxo/etapa/5/**` (rota estática; tem prioridade sobre `[numero]`, contrato §3), `src/app/api/lotes/**`, `src/app/(app)/fluxo/devolucoes/[codigo]/secoes/SecaoLote.tsx` (só leitura; as ações ficam na tela do lote).
- Edição pequena e permitida fora da janela de paralelismo (contrato §3 e §4.4): `src/db/schema/devolucoes.ts` (só `lote_id`, `resultado_fornecedor` e duas regras CHECK), `src/db/schema/fiscal.ts` (só a FK de `lote_id`), `src/modules/historico/rotulos/lotes.ts` (uma chave nova, por emenda E18 no contrato), `src/modules/devolucoes/quadro.ts`, `src/components/QuadroFluxo.tsx`, `src/components/EtapasCelular.tsx` e `src/app/(app)/fluxo/page.tsx` (coluna 5), os testes da Fase 4 que fixavam o comportamento "sem lotes" (D11) e os trechos dos e2e da Fase 1 que conferiam o aviso provisório da etapa 5 ("Os lotes por fornecedor aparecem aqui…": `tests/e2e/devolucoes.spec.ts` e `tests/e2e/fluxo.spec.ts`).
- Testes: `tests/helpers/fabricas-lotes.ts`, `tests/helpers/fluxo-lotes.ts`, `tests/e2e/apoio-lotes.ts`, `tests/e2e/lotes-*.spec.ts`, `tests/e2e/integracao-remessas.spec.ts`, e `src/**/*.test.ts(x)` novos.
- **Nunca:** `src/lib/env.ts`, `.env.example`, `.env.producao.example`, `package.json` (scripts), `src/db/schema/index.ts` (já exporta `lotes.ts`), `dominio.ts` e `transicoes*.ts` das devoluções (as linhas de item da Fase 5 já estão em `transicoes-item.ts`), `permissoes.ts` (a aba "Lotes e Remessas" já existe), `NavAbas.tsx`, `[codigo]/page.tsx`, `detalhe.ts`, `fluxo/etapa/[numero]/page.tsx`, `src/modules/fiscal/**` (consuma pelas assinaturas), `src/conectores/**`, `src/modules/fila/tarefas.ts` (`lotes.alocar-pendentes` e `TAREFAS_NA_SUBIDA` já existem), `tests/e2e/global-setup.ts`, `apoio.ts`, `dados.ts`, `tests/helpers/fabricas.ts`, `fabricas-fiscal.ts`, `Dockerfile`, `docker-compose.prod.yml`, `README.md` (só quem integra).

**Ambiente e ferramentas**
- Node 24 e npm. Next.js 16 tem mudanças (veja `AGENTS.md` e `node_modules/next/dist/docs/`): `params` e `searchParams` são **Promise**; `redirect()` lança exceção (chame **fora** do `try/catch`); arquivo com `'use server'` só exporta funções async (e `type`); `notFound()` e `redirect()` funcionam em Route Handlers.
- Arquivos de `src/db/schema/` e **tudo o que eles importam em tempo de execução** usam imports relativos, nunca `@/` (o drizzle-kit não resolve o alias). `src/modules/lotes/dominio.ts` é importado pelo schema: só `import type` com `@/`.
- Migrações: nesta branch, `npm run db:gerar -- --name fase5_remessas`. Ela é descartada e gerada de novo na Tarefa 14 (contrato §3).
- Dependência nova com versão exata: `npm install pdf-lib@1.17.1 --save-exact` (publicada em 2021, bem antes do corte de 2 semanas; contrato §10, E6).

**Produto e textos**
- Interface só em português do Brasil. Os nomes vêm da spec §6.5: título da etapa 5 **"Agrupamento por Fornecedor (Remessas)"**, aba **"Lotes e Remessas"**, botões **"Fechar lote"**, **"Emitir NF de Remessa"**, **"Lista consolidada"**, **"Registrar envio"**, **"Registrar resultado"**. Tipos: **Conserto**, **Troca**, **Garantia**. Resultados (spec §5.3): **Trocado**, **Consertado**, **Crédito**, **Descartado**, **Devolvido sem solução**.
- O que vai além do PDF/spec fica marcado **(extra)** no código (comentário) e neste plano.
- **Fiscal:** a base de valor da remessa (o `custo` do produto), o CFOP, o CST e as informações complementares são **sugestões**; o contador valida (spec §8.5, §16).

**Mobile-first (exigência do usuário)**
- Toda tela é desenhada e testada primeiro em 390×844 e cresce para o computador (`md:`).
- Sem rolagem lateral (`semRolagemLateral` no e2e). Listas em cartões. Formulários em uma coluna, com o botão principal no `RodapeFormulario` (fixo no celular).
- Toque mínimo de 44 px (`min-h-11`), contraste ≥ 4,5:1 (cores do `globals.css`; `Selo` com os tons de `TomSelo`). Erros vão para a `ListaErros`, que recebe o foco (`useEnvioFormulario`); com mais de um formulário na página, cada caixa de erros tem o seu `id`.
- Componentes React são puros: nada de `new Date()` na renderização; datas formatadas nos módulos (`formatarDataHora`).
- Todo e2e roda nos projetos `computador` e `celular`.

**Segurança**
- Permissão checada no servidor em toda página, Server Action e Route Handler (`exigirPermissao`). Ações: `ver_listas` (todos: ver a etapa 5, o detalhe do lote e a Seção Lote) e `gerir_fiscal` (Fiscal e Gestor: tudo o que muda um lote, a lista consolidada, a aba "Lotes e Remessas" e a pendência "Sem fornecedor"; spec §6.9 "gerir lotes").
- Ids e códigos que chegam por `bind` ou formulário são conferidos (`ehUuid`, `ehCodigoLote`) antes de qualquer uso.
- Nunca registre o payload da NF de remessa (tem o endereço do fornecedor; não é dado pessoal, mas segue a regra da Fase 4).

**Testes e commits**
- TDD: teste que falha → implementação → teste passa. Unitário `npm test` (`src/**/*.test.{ts,tsx}`), integração `npm run test:int` (`src/**/*.int.test.ts`, banco `devolucoes_test_f5`), ponta a ponta `npm run test:e2e` (projetos `computador` e `celular`; porta 3105). Pare o `npm run dev` antes do e2e.
- O e2e sobe o servidor **e o worker** com os falsos (`PERMITIR_FALSOS=1` só no `AMBIENTE_E2E`; contrato §10, E1). O emissor falso autoriza na **2ª consulta** (uns 10 s depois do envio) e rejeita quando a natureza da operação contém "REJEITAR".
- Toda mensagem de commit termina com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. O push da branch `fase-5-remessas` fica com o fluxo dos times (andamento); **nunca** faça push no `main`.

## Decisões que a spec e o contrato não fixaram (o usuário pode vetar)

1. **Fornecedor do lote** = o do `produto_recebido` (spec §5.3, contrato §5.6). Sem `produto_recebido_id`, ou com produto sem fornecedor → `SEM_FORNECEDOR`.
2. **Separar unidades ("mover itens", spec §5.4) sem quebrar "um lote ABERTO por fornecedor":** de um lote ABERTO (ou FECHADO ainda sem NF), o Fiscal marca unidades e escolhe o destino: o lote ABERTO do mesmo fornecedor, outro lote FECHADO sem NF do mesmo fornecedor, ou **"Novo lote"**, que nasce já **FECHADO** com o tipo escolhido (transição nova "(novo) → FECHADO", Fiscal e Gestor). Ex.: separar a troca do conserto = marcar as unidades de troca → "Novo lote" com o tipo Troca; depois fechar o original como Conserto. Só entre lotes do **mesmo fornecedor**.
3. **Lote vazio:** quando a última unidade sai de um lote por "mover", o lote é **apagado** se nunca teve NF (era só um agrupamento). Se já teve NF (cancelada), fica vazio, com o histórico.
4. **Reabrir** (FECHADO → ABERTO) só sem NF ativa e só se o fornecedor não tiver outro lote ABERTO. Se tiver, a tela orienta: "mova as unidades deste lote para LOT-x".
5. **"NF ativa"** = NF de remessa não cancelada (PROCESSANDO, AUTORIZADA ou REJEITADA). Com NF ativa o lote não reabre e não perde nem ganha unidades. Com NF rejeitada, o caminho é corrigir a causa (cadastro, regra) e "Corrigir e reenviar", como na NF de devolução (Fase 4).
6. **NF de remessa (spec §8.5):** um item da NF por **produto** (SKU), com a quantidade de unidades; `valorUnitario` = `custo` do produto; NCM do produto; unidade do produto (ou "UN"); origem do ICMS 0 (nacional); **sem destaque de tributos** (remessa para conserto/troca: CSOSN 400 ou CST 41 sugeridos pela Fase 4). Destinatário = fornecedor; `indicadorIe` 1 com IE e 9 sem IE; `consumidorFinal` quando o indicador é 9 (igual à Fase 4). Finalidade normal, saída, sem nota referenciada. Informações complementares: o modelo da regra com `{lote}`, `{seriais}` e `{devolucao}` (códigos DEV); sem modelo, "Lote {lote}. S/N: {seriais}.". Falta de NCM, custo ou endereço do fornecedor recusa a emissão com a lista do que falta.
7. **Tipo da NF:** CONSERTO → Remessa para conserto; TROCA e GARANTIA → Remessa para troca ou garantia (contrato §4.4).
8. **Lista consolidada** só existe com a NF de remessa autorizada (status NF emitida, Enviado ou Finalizado), porque leva o número da NF. Colunas (spec §6.5): Unidade, SKU, Descrição, Nº de série, Motivo, Observação, Devolução; cabeçalho com fornecedor (razão social, CNPJ, contato e e-mail do SAC), lote (código e tipo) e NF de remessa (número, série, chave, data). Baixada por Fiscal e Gestor. Nomes: `lista-consolidada-LOT-000045.pdf` e `.xlsx`.
9. **Registrar resultado:** uma lista com um seletor por unidade enviada; "Registrar resultado" grava as que foram preenchidas. O resultado é **definitivo** (não há transição RESOLVIDO → outro). O lote vira FINALIZADO na mesma transação em que a última unidade fica RESOLVIDO.
10. **Registrar envio:** exige o código de rastreamento (até 60 caracteres, sem espaços nas pontas). Todas as unidades EM_LOTE do lote passam a ENVIADO.
11. **Pendência "Sem fornecedor"** (spec §5.3): bloco na página "Lotes e Remessas" (Fiscal e Gestor) com um cartão por unidade e o formulário **"Associar produto"** (SKU do produto recebido). O sistema exige o produto no cadastro e com fornecedor (senão, a mensagem manda a Produtos e Fornecedores), grava o `produto_recebido_id` e põe a unidade no lote ABERTO do fornecedor.
12. **`lotes.alocar-pendentes`** (na subida do worker; contrato §5.1): aloca (a) as unidades PROBLEMA que ficaram em AGUARDANDO_NF numa devolução já CONCLUIDA (o que a porta "sem lotes" deixou, D11) e (b) as unidades SEM_FORNECEDOR cujo produto recebido já ganhou fornecedor. Uma transação por devolução, com a devolução travada.
13. **Corrida do cancelamento (nota deixada pela revisão da Fase 4):** `desfazerAlocacao` repete a checagem com os lotes travados (`FOR UPDATE`). Se um lote deixou de estar ABERTO entre a checagem e a resposta da SEFAZ, lança `ErroFiscal` com o motivo e a orientação; a transação volta e a NF continua AUTORIZADA no sistema. O mesmo vale para `aoCancelarRemessa` com o lote que deixou de estar NF emitida.
14. **Cancelar a NF de remessa** só com o lote em NF emitida (antes do envio). Depois do envio, a tela não mostra o cancelamento.
15. **Coluna 5 do quadro:** mostra os **lotes** não finalizados (contagem "N lotes"), em cartões com fornecedor, código, status e número de unidades; o "Ver lista" leva a `/fluxo/etapa/5`. Para isso `ColunaFluxo` ganha `conteudo?: ReactNode` e `unidade?: { singular; plural }` (edição pequena em `QuadroFluxo` e `EtapasCelular`, fora da janela de paralelismo).
16. **Páginas:** `/lotes` (aba, Fiscal e Gestor) = lista com filtros + pendência "Sem fornecedor"; `/fluxo/etapa/5` (todos) = a mesma lista, só leitura; `/lotes/[codigo]` (todos veem; só Fiscal e Gestor agem). Filtros por caminho GET: `?fornecedor=<id>&status=<STATUS>`.
17. **Link para as evidências** (spec §6.5): cada unidade do lote liga para `/fluxo/devolucoes/DEV-…#conferencia`, a seção da Fase 2 com as Fotos e o Vídeo de Prova.
18. **(extra)** Histórico do lote no detalhe; **(extra)** Seção Lote no detalhe da devolução (o esqueleto é do contrato; o conteúdo é este); **(extra)** a página do lote se atualiza a cada 5 s enquanto a NF processa (o mesmo componente da Fase 4).
19. **Chave nova de histórico** `lote_item_removido` ("Unidade retirada do lote"), para a NF de devolução cancelada (emenda E18 no contrato, Tarefa 1). As NF do lote usam as chaves da Fase 4 (`nf_solicitada`, `nf_autorizada`, `nf_cancelada`, `nf_reenviada`) com `entidade = 'lote'`.
20. **Regras no banco (extra, segurança):** CHECK em `itens_devolucao`: `lote_id` preenchido ⇔ status EM_LOTE, ENVIADO ou RESOLVIDO; `resultado_fornecedor` preenchido ⇔ status RESOLVIDO.
21. **`ErroLotes extends ErroFiscal`:** as mensagens dos lotes passam pelos mesmos caminhos da Fase 4 (o worker transforma `ErroFiscal` da montagem em NF rejeitada; as telas mostram a mensagem).
22. **pdf-lib** com a fonte Helvetica padrão (WinAnsi): caracteres fora do WinAnsi (ex.: emoji) viram "?" no PDF, nunca erro.

## Pontos de atenção na revisão

O que a spec não diz, mas vai acontecer com quem usa o sistema. Cada linha tem o teste na tarefa dona.

1. **Duas NF de devolução autorizadas ao mesmo tempo** para um fornecedor ainda sem lote aberto: tem de sair **um** lote só, sem derrubar uma das autorizações (Tarefa 2, teste "ON CONFLICT").
2. **O lote fecha enquanto a SEFAZ cancela a NF de devolução** (corrida de segundos): a NF continua autorizada no sistema e a mensagem diz o que fazer (Tarefa 3, teste "corrida").
3. **Cadastro incompleto** (produto sem NCM ou sem custo, fornecedor sem CEP ou cidade): a emissão é recusada **antes** de criar a nota, com tudo o que falta numa mensagem só (Tarefa 6).
4. **Texto estranho** na observação ou na descrição (emoji, aspas curvas, caractere de controle colado de outro sistema, texto começando com "="): o PDF e o Excel saem mesmo assim, e o Excel nunca vira fórmula (Tarefa 8).
5. **Clique duplo** em "Registrar envio" ou "Registrar resultado" (comum no celular com rede lenta): o segundo é recusado com mensagem, sem evento repetido e sem resultado trocado (Tarefa 7).

## Mapa de arquivos

```
src/
  db/schema/lotes.ts                         tipo_lote, status_lote, lotes (contrato §4.4)
  db/schema/devolucoes.ts (+)                 resultado_fornecedor (enum), itens_devolucao.lote_id e resultado_fornecedor, 2 CHECK
  db/schema/fiscal.ts (+)                     FK notas_fiscais.lote_id → lotes
  modules/lotes/
    dominio.ts                                vocabulário, rótulos, tons, tipo do lote → tipo da NF, código LOT
    erros.ts                                  ErroLotes (extends ErroFiscal)
    transicoes-lote.ts                        transições do lote (spec §5.4, contrato §4.6)
    repositorio.ts                            leituras comuns com trava (lote, unidades, NF ativa)
    alocacao.ts                               lote ABERTO do fornecedor, alocar, SEM_FORNECEDOR, desfazer, motivo de recusa
    pendentes.ts                              associar produto (SEM_FORNECEDOR) e lotes.alocar-pendentes
    gestao.ts                                 fechar, reabrir, mover unidades, apagar lote vazio
    montar-remessa.ts                         NF de remessa (spec §8.5): pura + carregar
    efeitos-remessa.ts                        efeitos da NF de remessa no lote (autorizada, cancelada), chamados pela porta
    remessa.ts                                emitir, reenviar, cancelar (atalhos das telas sobre a Fase 4)
    envio.ts                                  registrar envio e resultado, finalizar
    lista-consolidada.ts                      dados da lista (puro + carregar)
    xlsx.ts, pdf.ts                           arquivos da lista consolidada
    consultas.ts                              listas, detalhe, pendências, quadro e Seção Lote
    porta.ts                                  a porta da Fase 4 com o corpo da Fase 5
  worker/manipuladores/lotes.ts               lotes.alocar-pendentes
  components/lotes/                           CartaoLote, ListaLotes (com os filtros), PendenciasSemFornecedor (client),
                                              BlocosLote (client), tipos
  app/(app)/lotes/{page.tsx, acoes.ts}
  app/(app)/lotes/[codigo]/{page.tsx, acoes.ts}
  app/(app)/fluxo/etapa/5/page.tsx
  app/api/lotes/[codigo]/lista-consolidada/route.ts
  app/(app)/fluxo/devolucoes/[codigo]/secoes/SecaoLote.tsx
  modules/devolucoes/quadro.ts, components/QuadroFluxo.tsx, EtapasCelular.tsx, app/(app)/fluxo/page.tsx   coluna 5
tests/
  helpers/fabricas-lotes.ts, fluxo-lotes.ts
  e2e/apoio-lotes.ts, lotes-lista.spec.ts, lotes-detalhe.spec.ts, lotes-remessa.spec.ts, lotes-quadro.spec.ts,
      integracao-remessas.spec.ts
```

| Tarefa | Entrega | Tipo |
|---|---|---|
| 1 | Base: vocabulário, tabelas, transições do lote, fábricas | servidor |
| 2 | Alocação automática na autorização da NF de devolução | servidor |
| 3 | Recusa do cancelamento e desfazer a alocação | servidor |
| 4 | SEM_FORNECEDOR: associar produto e `lotes.alocar-pendentes` | servidor |
| 5 | Fechar, reabrir e mover unidades | servidor |
| 6 | NF de Remessa: montagem, emissão, autorização, reenvio, cancelamento | servidor |
| 7 | Registrar envio, registrar resultado, FINALIZADO | servidor |
| 8 | Lista consolidada: dados, Excel, PDF e rota | servidor |
| 9 | Consultas das telas | servidor |
| 10 | Tela "Lotes e Remessas" e etapa 5 | tela |
| 11 | Tela do lote (fechar, mover, reabrir, NF, lista, envio, resultado) | tela |
| 12 | Coluna 5 do quadro e Seção Lote na devolução | tela |
| 13 | E2E completo da spec §12 | e2e |
| 14 | Integração | junção |

---

### Tarefa 1: Base dos lotes: vocabulário, tabelas, transições do lote e fábricas

**Arquivos:**
- Criar: `src/modules/lotes/dominio.ts`, `src/modules/lotes/erros.ts`, `src/modules/lotes/transicoes-lote.ts`, `tests/helpers/fabricas-lotes.ts`
- Modificar: `src/db/schema/lotes.ts` (troca o `export {};`), `src/db/schema/devolucoes.ts` (enum, 2 colunas, 1 índice, 2 CHECK), `src/db/schema/fiscal.ts` (FK de `lote_id`), `src/modules/historico/rotulos/lotes.ts` (chave `lote_item_removido`), `docs/superpowers/plans/2026-11-12-contrato-fases-2-6.md` (emenda E18)
- Gerado: `drizzle/<n>_fase5_remessas.sql` (descartado e refeito na Tarefa 14)
- Testes: `src/modules/lotes/dominio.test.ts`, `src/modules/lotes/transicoes-lote.test.ts`, `src/modules/lotes/schema.int.test.ts`

**Interfaces:**
- Consome: `type Ator` (`src/modules/devolucoes/transicoes.ts`), `type TomSelo` (`src/modules/devolucoes/selos.ts`, só tipo), `ErroFiscal` (`src/modules/fiscal/erros.ts`), `type TipoNota` (`src/modules/fiscal/dominio.ts`), `ROTULO_PERFIL` (`src/modules/auth/perfis.ts`), `criarDevolucaoNoEstoqueTeste`, `type UnidadeEstoqueTeste` (`tests/helpers/fabricas-fiscal.ts`), `salvarFornecedor`, `salvarProduto`.
- Produz:
  - `dominio.ts`: `TIPOS_LOTE`, `type TipoLote`, `ROTULO_TIPO_LOTE`, `ehTipoLote`, `STATUS_LOTE`, `type StatusLote`, `ROTULO_STATUS_LOTE`, `TOM_STATUS_LOTE: Record<StatusLote, TomSelo>`, `ehStatusLote`, `RESULTADOS_FORNECEDOR`, `type ResultadoFornecedor`, `ROTULO_RESULTADO`, `ehResultadoFornecedor`, `tipoNotaDoLote(tipo: TipoLote): 'REMESSA_CONSERTO' | 'REMESSA_TROCA_GARANTIA'`, `ehCodigoLote(texto: string): boolean`, `STATUS_ITEM_NO_LOTE`, `RASTREIO_ENVIO_MAXIMO = 60`
  - `erros.ts`: `class ErroLotes extends ErroFiscal`
  - `transicoes-lote.ts`: `REGRAS_TRANSICAO_LOTE`, `podeTransitarLote(p: { de: StatusLote | null; para: StatusLote; ator: Ator }): boolean`, `exigirTransicaoLote(p): void`
  - schema: `tipoLoteEnum`, `statusLoteEnum`, `lotes`; `resultadoFornecedorEnum`, `itensDevolucao.loteId`, `itensDevolucao.resultadoFornecedor`
  - fábricas: `cnpjDeTeste(): string`, `criarFornecedorCompletoTeste(db, dados?): Promise<{ id: string; cnpj: string; razaoSocial: string }>`, `criarProdutoDoFornecedorTeste(db, p: { cnpjFornecedor: string | null; sku?: string; ncm?: string | null; custo?: string | null; ean?: string | null }): Promise<{ id: string; sku: string }>`, `criarDevolucaoComProblemasTeste(db, usuario, p: { unidades: UnidadeProblemaTeste[]; canal?; pedido? }): Promise<DevolucaoNoEstoque>`, `type UnidadeProblemaTeste = UnidadeEstoqueTeste & { produtoId?: string | null }`, `criarLoteTeste(db, p: { fornecedorId: string; status?: StatusLote; tipo?: TipoLote | null; itemIds?: string[]; rastreio?: string | null }): Promise<{ id: string; codigo: string }>`

- [ ] **Passo 0: Conferir a base (Fases 2, 3 e 4 no `main`) antes de escrever código**

```bash
cd "/c/Users/JEFFERSON LIMA/devolucoes-wt/fase-5"
git log --oneline -8
grep -n "export" src/modules/lotes/porta.ts src/modules/fiscal/emissao.ts src/modules/fiscal/notas.ts src/modules/fiscal/situacao.ts \
  src/modules/fiscal/configuracao.ts src/modules/fiscal/regras.ts src/modules/fiscal/arquivos.ts src/modules/fiscal/montar-devolucao.ts \
  src/worker/manipuladores/lotes.ts src/modules/fila/tarefas.ts tests/helpers/fabricas-fiscal.ts tests/helpers/fila-fiscal.ts \
  tests/e2e/apoio-fiscal.ts tests/e2e/apoio-conferencia.ts
grep -n "lotes\|lote_" src/db/schema/*.ts src/modules/historico/rotulos/lotes.ts
grep -n "loteId\|lote_id" src/db/schema/fiscal.ts
grep -n "INFORMACOES_SUGERIDAS" -A5 src/modules/fiscal/regras.ts
grep -n "id=\"conferencia\"" "src/app/(app)/fluxo/devolucoes/[codigo]/secoes/SecaoConferencia.tsx"
```

Esperado (nomes que este plano usa):

| Onde | Nome |
|---|---|
| `src/modules/lotes/porta.ts` | `interface PortaLotes` (6 métodos do contrato §5.7) e `const portaLotes` "sem lotes" |
| `src/modules/fiscal/emissao.ts` | `solicitarEmissao(db, alvo, usuario)`, `reenviarNota(db, id, usuario)`, `cancelarNota` (reexportada de `cancelamento.ts`, com `agora?` no 5º parâmetro) |
| `src/modules/fiscal/notas.ts` | `obterNota`, `type NotaFiscalLinha`, `montarNotaParaEmissao`, `exigirPodeEmitir` |
| `src/modules/fiscal/situacao.ts` | `vistaDaNota(n, serieConfigurada, agora): VistaNota` |
| `src/modules/fiscal/configuracao.ts` | `lerConfiguracaoFiscal`, `operacaoPorUf`, `regraFiscal`, `type ConfiguracaoFiscal`, `type RegraFiscal` |
| `src/modules/fiscal/regras.ts` | sugestões de remessa com o modelo `'Lote {lote}. S/N: {seriais}.'` |
| `src/worker/manipuladores/lotes.ts` | `export const manipuladoresLotes: Manipuladores = {}` |
| `src/modules/fila/tarefas.ts` | `'lotes.alocar-pendentes'` e `TAREFAS_NA_SUBIDA = ['lotes.alocar-pendentes']` |
| `tests/helpers/fabricas-fiscal.ts` | `criarDevolucaoNoEstoqueTeste`, `configurarFiscalTeste`, `inserirNotaVendaTeste`, `EMPRESA_TESTE` (SP, Simples, série 1) |
| `tests/helpers/fila-fiscal.ts` | `rodarTarefasFiscais(db, fila, agora?, limite?)` |
| `tests/e2e/apoio-conferencia.ts` | `conferirDevolucao(page, codigo, unidades)`, `prepararConferencia` |
| `src/db/schema/lotes.ts` | `export {};` |
| `SecaoConferencia.tsx` | `<section id="conferencia" ...>` |

**Se um nome for diferente, use o nome que está no `main` em todo este plano** e anote a diferença na mensagem do commit.

- [ ] **Passo 1: Escrever os testes unitários que falham**

`src/modules/lotes/dominio.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  ehCodigoLote,
  ehResultadoFornecedor,
  ehStatusLote,
  ehTipoLote,
  ROTULO_RESULTADO,
  ROTULO_STATUS_LOTE,
  ROTULO_TIPO_LOTE,
  tipoNotaDoLote,
} from './dominio';

describe('vocabulário dos lotes (spec §5.1, §5.3, §5.4)', () => {
  it('tipos e status com os nomes da spec', () => {
    expect(Object.values(ROTULO_TIPO_LOTE)).toEqual(['Conserto', 'Troca', 'Garantia']);
    expect(Object.values(ROTULO_STATUS_LOTE)).toEqual(['Aberto', 'Fechado', 'NF emitida', 'Enviado', 'Finalizado']);
    expect(Object.values(ROTULO_RESULTADO)).toEqual(['Trocado', 'Consertado', 'Crédito', 'Descartado', 'Devolvido sem solução']);
  });

  it('tipo do lote → tipo da NF (contrato §4.4)', () => {
    expect(tipoNotaDoLote('CONSERTO')).toBe('REMESSA_CONSERTO');
    expect(tipoNotaDoLote('TROCA')).toBe('REMESSA_TROCA_GARANTIA');
    expect(tipoNotaDoLote('GARANTIA')).toBe('REMESSA_TROCA_GARANTIA');
  });

  it('reconhece os valores e o código LOT', () => {
    expect(ehTipoLote('TROCA')).toBe(true);
    expect(ehTipoLote('troca')).toBe(false);
    expect(ehStatusLote('NF_EMITIDA')).toBe(true);
    expect(ehStatusLote('CANCELADO')).toBe(false);
    expect(ehResultadoFornecedor('CREDITO')).toBe(true);
    expect(ehResultadoFornecedor('PERDIDO')).toBe(false);
    expect(ehCodigoLote('LOT-000045')).toBe(true);
    expect(ehCodigoLote('LOT-1234567')).toBe(true);
    expect(ehCodigoLote('LOT-45')).toBe(false);
    expect(ehCodigoLote('DEV-000045')).toBe(false);
  });
});
```

`src/modules/lotes/transicoes-lote.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Ator } from '@/modules/devolucoes/transicoes';
import { STATUS_LOTE, type StatusLote } from './dominio';
import { ErroLotes } from './erros';
import { exigirTransicaoLote, podeTransitarLote } from './transicoes-lote';

// Spec §5.4, contrato §4.6 e decisão 2, escritos de novo de propósito: o teste não lê a tabela do código.
const FISCAL_GESTOR: Ator[] = ['FISCAL', 'GESTOR'];
const PERMITIDAS: [StatusLote | null, StatusLote, Ator[]][] = [
  [null, 'ABERTO', ['SISTEMA']],
  [null, 'FECHADO', FISCAL_GESTOR],
  ['ABERTO', 'FECHADO', FISCAL_GESTOR],
  ['FECHADO', 'ABERTO', FISCAL_GESTOR],
  ['FECHADO', 'NF_EMITIDA', ['SISTEMA']],
  ['NF_EMITIDA', 'FECHADO', ['SISTEMA']],
  ['NF_EMITIDA', 'ENVIADO', FISCAL_GESTOR],
  ['ENVIADO', 'FINALIZADO', ['SISTEMA']],
];
const ATORES: Ator[] = ['OPERADOR', 'FISCAL', 'GESTOR', 'SISTEMA'];

describe('transições do lote (spec §5.4)', () => {
  it('aceita só as mudanças da tabela, com os atores certos', () => {
    for (const de of [null, ...STATUS_LOTE]) {
      for (const para of STATUS_LOTE) {
        for (const ator of ATORES) {
          const esperado = PERMITIDAS.some(([d, p, a]) => d === de && p === para && a.includes(ator));
          expect(podeTransitarLote({ de, para, ator }), `${de} → ${para} (${ator})`).toBe(esperado);
        }
      }
    }
  });

  it('recusa no servidor com mensagem em português', () => {
    expect(() => exigirTransicaoLote({ de: 'FECHADO', para: 'ENVIADO', ator: 'FISCAL' })).toThrow(ErroLotes);
    expect(() => exigirTransicaoLote({ de: 'FECHADO', para: 'ENVIADO', ator: 'FISCAL' })).toThrow(
      'Mudança não permitida no lote: Fechado → Enviado (Fiscal).',
    );
    expect(() => exigirTransicaoLote({ de: null, para: 'FECHADO', ator: 'OPERADOR' })).toThrow(
      'Mudança não permitida no lote: (novo) → Fechado (Operador).',
    );
    expect(() => exigirTransicaoLote({ de: 'ENVIADO', para: 'FINALIZADO', ator: 'SISTEMA' })).not.toThrow();
  });
});
```

Rode: `npm test -- src/modules/lotes`
Esperado: FAIL (os módulos ainda não existem).

- [ ] **Passo 2: Implementar `dominio.ts`, `erros.ts` e `transicoes-lote.ts`**

`src/modules/lotes/dominio.ts` (só imports relativos ou `import type`; o schema importa este arquivo):

```ts
import type { TomSelo } from '../devolucoes/selos';
import type { TipoNota } from '../fiscal/dominio';

export const TIPOS_LOTE = ['CONSERTO', 'TROCA', 'GARANTIA'] as const;
export type TipoLote = (typeof TIPOS_LOTE)[number];
export const ROTULO_TIPO_LOTE: Record<TipoLote, string> = { CONSERTO: 'Conserto', TROCA: 'Troca', GARANTIA: 'Garantia' };

export const STATUS_LOTE = ['ABERTO', 'FECHADO', 'NF_EMITIDA', 'ENVIADO', 'FINALIZADO'] as const;
export type StatusLote = (typeof STATUS_LOTE)[number];
export const ROTULO_STATUS_LOTE: Record<StatusLote, string> = {
  ABERTO: 'Aberto',
  FECHADO: 'Fechado',
  NF_EMITIDA: 'NF emitida',
  ENVIADO: 'Enviado',
  FINALIZADO: 'Finalizado',
};
export const TOM_STATUS_LOTE: Record<StatusLote, TomSelo> = {
  ABERTO: 'destaque',
  FECHADO: 'atencao',
  NF_EMITIDA: 'destaque',
  ENVIADO: 'neutro',
  FINALIZADO: 'bom',
};

export const RESULTADOS_FORNECEDOR = ['TROCADO', 'CONSERTADO', 'CREDITO', 'DESCARTADO', 'DEVOLVIDO_SEM_SOLUCAO'] as const;
export type ResultadoFornecedor = (typeof RESULTADOS_FORNECEDOR)[number];
export const ROTULO_RESULTADO: Record<ResultadoFornecedor, string> = {
  TROCADO: 'Trocado',
  CONSERTADO: 'Consertado',
  CREDITO: 'Crédito',
  DESCARTADO: 'Descartado',
  DEVOLVIDO_SEM_SOLUCAO: 'Devolvido sem solução',
};

/** Status do item que exigem `lote_id` (CHECK itens_lote_status, decisão 20). */
export const STATUS_ITEM_NO_LOTE = ['EM_LOTE', 'ENVIADO', 'RESOLVIDO'] as const;
export const RASTREIO_ENVIO_MAXIMO = 60;
```

mais `ehTipoLote`, `ehStatusLote`, `ehResultadoFornecedor` (mesmo padrão de `ehTipoNota` da Fase 4), `ehCodigoLote` (`/^LOT-\d{6,}$/`) e `tipoNotaDoLote` (decisão 7; tipo de retorno `Extract<TipoNota, 'REMESSA_CONSERTO' | 'REMESSA_TROCA_GARANTIA'>`).

`src/modules/lotes/erros.ts`: `export class ErroLotes extends ErroFiscal` com `this.name = 'ErroLotes'` (decisão 21).

`src/modules/lotes/transicoes-lote.ts`: a tabela `REGRAS_TRANSICAO_LOTE: readonly { de: StatusLote | null; para: StatusLote; atores: readonly Ator[] }[]` com exatamente as 8 linhas do teste; `podeTransitarLote` igual a `podeTransitarItem`; `exigirTransicaoLote` lança `ErroLotes` com `Mudança não permitida no lote: ${de ?? '(novo)'} → ${para} (${quem}).` (rótulos de `ROTULO_STATUS_LOTE`; `quem` = "sistema" ou `ROTULO_PERFIL[ator]`).

Rode: `npm test -- src/modules/lotes`
Esperado: PASS.

- [ ] **Passo 3: Escrever o teste de integração do schema (falha)**

`src/modules/lotes/schema.int.test.ts`:

```ts
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { itensDevolucao, lotes } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { criarDevolucaoComProblemasTeste, criarFornecedorCompletoTeste, criarLoteTeste } from '../../../tests/helpers/fabricas-lotes';

const { db, sql } = criarDbTeste();
let gestor: UsuarioSessao;

beforeEach(async () => {
  await limparTabelas(sql);
  gestor = await criarUsuarioTeste(db, 'GESTOR');
});
afterAll(async () => {
  await sql.end();
});

describe('schema dos lotes (contrato §4.4)', () => {
  it('gera o código LOT-000001 e nasce ABERTO', async () => {
    const f = await criarFornecedorCompletoTeste(db);
    const [lote] = await db.insert(lotes).values({ fornecedorId: f.id }).returning();
    expect(lote).toMatchObject({ codigo: 'LOT-000001', status: 'ABERTO', tipo: null, notaFiscalId: null });
  });

  it('no máximo um lote ABERTO por fornecedor (spec §5.4)', async () => {
    const f = await criarFornecedorCompletoTeste(db);
    await db.insert(lotes).values({ fornecedorId: f.id });
    await expect(db.insert(lotes).values({ fornecedorId: f.id })).rejects.toThrow();
    await expect(db.insert(lotes).values({ fornecedorId: f.id, status: 'FECHADO', tipo: 'TROCA' })).resolves.toBeDefined();
  });

  it('lote_id só com status EM_LOTE, ENVIADO ou RESOLVIDO; resultado só com RESOLVIDO (decisão 20)', async () => {
    const f = await criarFornecedorCompletoTeste(db);
    const dev = await criarDevolucaoComProblemasTeste(db, gestor, { unidades: [{ destino: 'PROBLEMA' }] });
    const lote = await criarLoteTeste(db, { fornecedorId: f.id });
    const item = dev.itens[0].id;
    await expect(db.update(itensDevolucao).set({ loteId: lote.id }).where(eq(itensDevolucao.id, item))).rejects.toThrow();
    await db.update(itensDevolucao).set({ loteId: lote.id, status: 'EM_LOTE' }).where(eq(itensDevolucao.id, item));
    await expect(db.update(itensDevolucao).set({ resultadoFornecedor: 'CREDITO' }).where(eq(itensDevolucao.id, item))).rejects.toThrow();
    await db.update(itensDevolucao).set({ status: 'RESOLVIDO', resultadoFornecedor: 'CREDITO' }).where(eq(itensDevolucao.id, item));
    const [linha] = await db.select().from(itensDevolucao).where(eq(itensDevolucao.id, item));
    expect(linha).toMatchObject({ status: 'RESOLVIDO', loteId: lote.id, resultadoFornecedor: 'CREDITO' });
  });

  it('a fábrica põe as unidades no lote com o status pedido', async () => {
    const f = await criarFornecedorCompletoTeste(db);
    const dev = await criarDevolucaoComProblemasTeste(db, gestor, { unidades: [{ destino: 'PROBLEMA' }, { destino: 'PROBLEMA' }] });
    const lote = await criarLoteTeste(db, { fornecedorId: f.id, status: 'ENVIADO', tipo: 'CONSERTO', itemIds: dev.itens.map((i) => i.id), rastreio: 'BR1' });
    const itens = await db.select({ status: itensDevolucao.status }).from(itensDevolucao).where(eq(itensDevolucao.loteId, lote.id));
    expect(itens.map((i) => i.status)).toEqual(['ENVIADO', 'ENVIADO']);
  });
});
```

Rode: `npm run test:int -- src/modules/lotes/schema.int.test.ts`
Esperado: FAIL (`lotes` não existe no schema).

- [ ] **Passo 4: Implementar o schema e a migração**

`src/db/schema/lotes.ts` (imports relativos):

```ts
import { sql } from 'drizzle-orm';
import { bigserial, index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { STATUS_LOTE, TIPOS_LOTE } from '../../modules/lotes/dominio';
import { usuarios } from './auth';
import { fornecedores } from './catalogo';
import { notasFiscais } from './fiscal';

export const tipoLoteEnum = pgEnum('tipo_lote', TIPOS_LOTE);
export const statusLoteEnum = pgEnum('status_lote', STATUS_LOTE);
const COM_FUSO = { withTimezone: true } as const;

/** Spec §5.1 (Lote) e contrato §4.4. */
export const lotes = pgTable(
  'lotes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    numero: bigserial('numero', { mode: 'number' }).notNull().unique(),
    /** LOT-000045, gerado pelo banco a partir de `numero` (como o DEV). */
    codigo: text('codigo')
      .notNull()
      .unique()
      .generatedAlwaysAs(sql`'LOT-' || case when "numero" < 1000000 then lpad("numero"::text, 6, '0') else "numero"::text end`),
    fornecedorId: uuid('fornecedor_id').notNull().references(() => fornecedores.id, { onDelete: 'restrict' }),
    /** Definido ao fechar. */
    tipo: tipoLoteEnum('tipo'),
    status: statusLoteEnum('status').notNull().default('ABERTO'),
    rastreioEnvio: text('rastreio_envio'),
    notaFiscalId: uuid('nota_fiscal_id').references((): AnyPgColumn => notasFiscais.id, { onDelete: 'set null' }),
    criadoEm: timestamp('criado_em', COM_FUSO).notNull().defaultNow(),
    fechadoEm: timestamp('fechado_em', COM_FUSO),
    fechadoPor: uuid('fechado_por').references(() => usuarios.id, { onDelete: 'set null' }),
    enviadoEm: timestamp('enviado_em', COM_FUSO),
    finalizadoEm: timestamp('finalizado_em', COM_FUSO),
    atualizadoEm: timestamp('atualizado_em', COM_FUSO).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('lotes_fornecedor_aberto_uq').on(t.fornecedorId).where(sql`"status" = 'ABERTO'`),
    index('lotes_status_idx').on(t.status),
  ],
);
```

`src/db/schema/devolucoes.ts`:
- `export const resultadoFornecedorEnum = pgEnum('resultado_fornecedor', RESULTADOS_FORNECEDOR);` com `RESULTADOS_FORNECEDOR` importado de `'../../modules/lotes/dominio'`. **O enum fica aqui, e não em `lotes.ts`**, de propósito: `devolucoes.ts`, `lotes.ts` e `fiscal.ts` se importam em ciclo; só as referências preguiçosas (`() => x.id`) podem cruzar o ciclo. O que é usado na hora (o enum) não pode vir de um arquivo do ciclo.
- Em `itensDevolucao`: `loteId: uuid('lote_id').references((): AnyPgColumn => lotes.id, { onDelete: 'set null' })` (import de `./lotes`) e `resultadoFornecedor: resultadoFornecedorEnum('resultado_fornecedor')`; índice `index('itens_devolucao_lote_idx').on(t.loteId)`; CHECK `itens_lote_status`: `("lote_id" is not null) = ("status" in ('EM_LOTE', 'ENVIADO', 'RESOLVIDO'))`; CHECK `itens_resultado_resolvido`: `("resultado_fornecedor" is not null) = ("status" = 'RESOLVIDO')`.

`src/db/schema/fiscal.ts`: só `loteId: uuid('lote_id').references((): AnyPgColumn => lotes.id)` (import de `./lotes`; contrato §4.4 "notas_fiscais lote_id ganha a FK").

```bash
cd "/c/Users/JEFFERSON LIMA/devolucoes-wt/fase-5"
npm run db:gerar -- --name fase5_remessas
```

Esperado: `drizzle/<n>_fase5_remessas.sql` com os 3 enums, `lotes`, as 2 colunas, o índice, os 2 CHECK e as 2 FK. Confira que **não** há `DROP` nem mudança nas tabelas das outras fases.

- [ ] **Passo 5: Fábricas da Fase 5**

`tests/helpers/fabricas-lotes.ts` (mesma regra das fábricas fiscais: nada de fila, armazenamento ou conector, porque o e2e importa este arquivo):

```ts
import { eq, inArray } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { itensDevolucao, lotes } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { salvarFornecedor, type DadosFornecedor } from '@/modules/catalogo/fornecedores';
import { salvarProduto } from '@/modules/catalogo/produtos';
import type { Canal } from '@/modules/devolucoes/dominio';
import type { StatusLote, TipoLote } from '@/modules/lotes/dominio';
import { criarDevolucaoNoEstoqueTeste, type DevolucaoNoEstoque, type UnidadeEstoqueTeste } from './fabricas-fiscal';

let sequencia = 0;

function digitoCnpj(base: string): string {
  const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const resto = [...base].reduce((soma, c, i) => soma + Number(c) * pesos[i], 0) % 11;
  return String(resto < 2 ? 0 : 11 - resto);
}

/** CNPJ válido e único por execução (o banco do e2e é o mesmo para o computador e o celular). */
export function cnpjDeTeste(): string {
  sequencia += 1;
  const base = `${String(Date.now() % 100_000_000).padStart(8, '0')}${String(sequencia % 10_000).padStart(4, '0')}`;
  const d1 = digitoCnpj(base);
  return `${base}${d1}${digitoCnpj(base + d1)}`;
}
```

Mais:
- `criarFornecedorCompletoTeste(db, dados: Partial<DadosFornecedor> = {})`: `salvarFornecedor` com razão social `Fornecedor Remessa ${sequencia} Ltda`, `cnpjDeTeste()`, IE `'0623079040081'`, endereço completo em **MG** (`Rua das Peças`, `200`, `Distrito Industrial`, `Contagem`, `MG`, `32210000`), `contatoSac: 'SAC Teste'`, `emailSac: 'sac@fornecedor.teste'`, e `...dados`. Devolve `{ id, cnpj, razaoSocial }`.
- `criarProdutoDoFornecedorTeste(db, p)`: `salvarProduto` com `sku: p.sku ?? \`PRD-${Date.now().toString(36).toUpperCase()}-${++sequencia}\``, `ean: p.ean ?? null`, `descricao: 'Fone Bluetooth de teste'`, `cnpjFornecedor: p.cnpjFornecedor`, `ncm: p.ncm === undefined ? '85183000' : p.ncm`, `custo: p.custo === undefined ? '35.90' : p.custo`, `unidade: 'UN'`. Devolve `{ id, sku }`.
- `criarDevolucaoComProblemasTeste(db, usuario, p)`: chama `criarDevolucaoNoEstoqueTeste` com `unidades` (o `sku` de cada unidade é o informado; senão o do produto, quando há `produtoId`, buscado no banco; senão `'SKU-TESTE'`) e depois grava `produto_recebido_id = produtoId` (e `produto_esperado_id` igual, quando vier) em cada unidade que trouxe `produtoId`.
- `criarLoteTeste(db, p)`: insere o lote com `status` (padrão ABERTO), `tipo` (padrão `null` em ABERTO e `'CONSERTO'` nos outros), `rastreioEnvio`, `fechadoEm`/`enviadoEm`/`finalizadoEm` conforme o status; põe as `itemIds` no lote com o status do item que corresponde (ABERTO, FECHADO, NF_EMITIDA → EM_LOTE; ENVIADO → ENVIADO; FINALIZADO → RESOLVIDO com `resultadoFornecedor: 'CONSERTADO'`). Devolve `{ id, codigo }`.

Rode: `npm run test:int -- src/modules/lotes/schema.int.test.ts`
Esperado: PASS.

- [ ] **Passo 6: Chave nova de histórico e emenda E18**

Em `src/modules/historico/rotulos/lotes.ts`, acrescente `lote_item_removido: 'Unidade retirada do lote',` (decisão 19). No contrato, ao fim da §10, acrescente:

```markdown
- **E18. Fase 5 (14/11):** (a) chave `lote_item_removido` ("Unidade retirada do lote") em `rotulos/lotes.ts`, para a NF de devolução cancelada; (b) o enum `resultado_fornecedor` é declarado em `src/db/schema/devolucoes.ts` (e não em `lotes.ts`), porque os três arquivos de schema se importam em ciclo e só as referências preguiçosas podem cruzar o ciclo; (c) transição nova do lote "(novo) → FECHADO" (Fiscal e Gestor), para separar unidades num lote novo sem violar "um lote ABERTO por fornecedor". Motivo: a Fase 5 é a única em andamento e precisava dos três.
```

- [ ] **Passo 7: Rodar tudo o que pode ter mudado e commitar**

Rode: `npm run typecheck && npm test && npm run test:int`
Esperado: PASS (o ciclo de imports do schema não quebra nada; se `tsc` reclamar de tipo implícito num `references`, falta o `(): AnyPgColumn =>`).

```bash
git add src/db/schema src/modules/lotes src/modules/historico/rotulos/lotes.ts tests/helpers/fabricas-lotes.ts drizzle docs/superpowers/plans/2026-11-12-contrato-fases-2-6.md
git commit -m "feat(lotes): vocabulário, tabela lotes, colunas do item, transições do lote e fábricas (E18)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


---

### Tarefa 2: Alocação automática na autorização da NF de devolução (spec §5.3)

**Arquivos:**
- Criar: `src/modules/lotes/repositorio.ts`, `src/modules/lotes/alocacao.ts`, `tests/helpers/fluxo-lotes.ts`
- Modificar: `src/modules/lotes/porta.ts` (corpo de `alocarItensProblema`), `src/modules/fiscal/emissao.int.test.ts` (só a asserção que fixava D11)
- Apagar: `src/modules/lotes/porta.test.ts` (testava a porta "sem lotes"; a porta agora é testada com banco)
- Testes: `src/modules/lotes/alocacao.int.test.ts`, `src/modules/lotes/porta.int.test.ts`

**Interfaces:**
- Consome: `exigirTransicaoItem` (`transicoes-item.ts`), `exigirTransicaoLote` (Tarefa 1), `registrarEvento`, `solicitarEmissao`, `rodarTarefasFiscais`, `inserirNotaVendaTeste`, `configurarFiscalTeste`, fábricas da Tarefa 1.
- Produz:
  - `repositorio.ts`: `type LoteLinha = typeof lotes.$inferSelect`; `obterLote(db: DbOuTx, loteId: string, opcoes?: { travar?: boolean }): Promise<LoteLinha | null>`; `obterLotePorCodigo(db, codigo): Promise<LoteLinha | null>`; `contarUnidades(db, loteId): Promise<number>`
  - `alocacao.ts`: `obterOuCriarLoteAberto(tx: DbOuTx, fornecedorId: string, agora: Date): Promise<{ id: string; codigo: string; criado: boolean }>`; `incluirNoLote(tx, p: { itemId: string; unidade: number; devolucaoId: string; de: 'AGUARDANDO_NF' | 'SEM_FORNECEDOR'; fornecedorId: string; ator: Ator; usuarioId: string | null; agora: Date }): Promise<{ loteId: string; loteCodigo: string }>`; `alocarItensProblema(tx, devolucaoId, agora): Promise<{ alocadas: number; semFornecedor: number }>`
  - `tests/helpers/fluxo-lotes.ts`: `autorizarDevolucaoTeste(db: Db, fila: FilaMemoria, p: { devolucaoId: string; codigosVenda: string[]; fiscal: UsuarioSessao; agora: Date }): Promise<{ notaFiscalId: string }>`

- [ ] **Passo 1: Escrever os testes de integração que falham**

`src/modules/lotes/alocacao.int.test.ts`:

```ts
import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { itensDevolucao, lotes } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { listarEventos } from '@/modules/historico/eventos';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import {
  criarDevolucaoComProblemasTeste,
  criarFornecedorCompletoTeste,
  criarLoteTeste,
  criarProdutoDoFornecedorTeste,
} from '../../../tests/helpers/fabricas-lotes';
import { alocarItensProblema, obterOuCriarLoteAberto } from './alocacao';

const { db, sql } = criarDbTeste();
const AGORA = new Date('2026-11-14T13:00:00Z');
let gestor: UsuarioSessao;

beforeEach(async () => {
  await limparTabelas(sql);
  gestor = await criarUsuarioTeste(db, 'GESTOR');
});
afterAll(async () => {
  await sql.end();
});

async function itensDe(devolucaoId: string) {
  return db
    .select({ unidade: itensDevolucao.unidade, status: itensDevolucao.status, loteId: itensDevolucao.loteId })
    .from(itensDevolucao)
    .where(eq(itensDevolucao.devolucaoId, devolucaoId))
    .orderBy(asc(itensDevolucao.unidade));
}

describe('alocarItensProblema (spec §5.3)', () => {
  it('põe as unidades PROBLEMA no lote ABERTO do fornecedor do produto recebido, criando o lote', async () => {
    const f = await criarFornecedorCompletoTeste(db);
    const p = await criarProdutoDoFornecedorTeste(db, { cnpjFornecedor: f.cnpj });
    const dev = await criarDevolucaoComProblemasTeste(db, gestor, {
      unidades: [
        { destino: 'BOM', produtoId: p.id },
        { destino: 'PROBLEMA', motivo: 'AVARIADO', produtoId: p.id },
        { destino: 'PROBLEMA', motivo: 'COM_DEFEITO', produtoId: p.id },
        { destino: 'AUSENTE' },
      ],
    });
    expect(await db.transaction((tx) => alocarItensProblema(tx, dev.id, AGORA))).toEqual({ alocadas: 2, semFornecedor: 0 });

    const [lote] = await db.select().from(lotes);
    expect(lote).toMatchObject({ codigo: 'LOT-000001', fornecedorId: f.id, status: 'ABERTO' });
    expect(await itensDe(dev.id)).toEqual([
      { unidade: 1, status: 'AGUARDANDO_NF', loteId: null },
      { unidade: 2, status: 'EM_LOTE', loteId: lote.id },
      { unidade: 3, status: 'EM_LOTE', loteId: lote.id },
      { unidade: 4, status: 'AUSENTE', loteId: null },
    ]);
    const eventos = await listarEventos(db, 'lote', lote.id);
    expect(eventos.map((e) => e.acao)).toEqual(['lote_criado', 'lote_item_incluido', 'lote_item_incluido']);
    expect(eventos[0]).toMatchObject({ de: null, para: 'ABERTO', usuarioNome: null });
    const doItem = await listarEventos(db, 'item', dev.itens[1].id);
    expect(doItem.at(-1)).toMatchObject({ acao: 'item_status', de: 'AGUARDANDO_NF', para: 'EM_LOTE' });
  });

  it('usa o lote ABERTO que já existe e ignora os fechados do mesmo fornecedor', async () => {
    const f = await criarFornecedorCompletoTeste(db);
    const p = await criarProdutoDoFornecedorTeste(db, { cnpjFornecedor: f.cnpj });
    const fechado = await criarLoteTeste(db, { fornecedorId: f.id, status: 'FECHADO', tipo: 'TROCA' });
    const aberto = await criarLoteTeste(db, { fornecedorId: f.id });
    const dev = await criarDevolucaoComProblemasTeste(db, gestor, { unidades: [{ destino: 'PROBLEMA', produtoId: p.id }] });
    await db.transaction((tx) => alocarItensProblema(tx, dev.id, AGORA));
    expect((await itensDe(dev.id))[0].loteId).toBe(aberto.id);
    expect((await itensDe(dev.id))[0].loteId).not.toBe(fechado.id);
  });

  it('separa por fornecedor e manda para SEM_FORNECEDOR o que não tem fornecedor', async () => {
    const f1 = await criarFornecedorCompletoTeste(db);
    const f2 = await criarFornecedorCompletoTeste(db);
    const p1 = await criarProdutoDoFornecedorTeste(db, { cnpjFornecedor: f1.cnpj });
    const p2 = await criarProdutoDoFornecedorTeste(db, { cnpjFornecedor: f2.cnpj });
    const orfao = await criarProdutoDoFornecedorTeste(db, { cnpjFornecedor: null });
    const dev = await criarDevolucaoComProblemasTeste(db, gestor, {
      unidades: [
        { destino: 'PROBLEMA', produtoId: p1.id },
        { destino: 'PROBLEMA', produtoId: p2.id },
        { destino: 'PROBLEMA', produtoId: orfao.id },
        { destino: 'PROBLEMA', produtoId: null },
      ],
    });
    expect(await db.transaction((tx) => alocarItensProblema(tx, dev.id, AGORA))).toEqual({ alocadas: 2, semFornecedor: 2 });
    const itens = await itensDe(dev.id);
    expect(itens.map((i) => i.status)).toEqual(['EM_LOTE', 'EM_LOTE', 'SEM_FORNECEDOR', 'SEM_FORNECEDOR']);
    expect(itens[0].loteId).not.toBe(itens[1].loteId);
    expect(await db.select().from(lotes)).toHaveLength(2);
  });

  it('é idempotente: rodar de novo não mexe em nada', async () => {
    const f = await criarFornecedorCompletoTeste(db);
    const p = await criarProdutoDoFornecedorTeste(db, { cnpjFornecedor: f.cnpj });
    const dev = await criarDevolucaoComProblemasTeste(db, gestor, { unidades: [{ destino: 'PROBLEMA', produtoId: p.id }] });
    await db.transaction((tx) => alocarItensProblema(tx, dev.id, AGORA));
    expect(await db.transaction((tx) => alocarItensProblema(tx, dev.id, AGORA))).toEqual({ alocadas: 0, semFornecedor: 0 });
  });

  it('duas autorizações ao mesmo tempo para um fornecedor novo usam o mesmo lote (ON CONFLICT)', async () => {
    const f = await criarFornecedorCompletoTeste(db);
    const [a, b] = await Promise.all([
      db.transaction((tx) => obterOuCriarLoteAberto(tx, f.id, AGORA)),
      db.transaction((tx) => obterOuCriarLoteAberto(tx, f.id, AGORA)),
    ]);
    expect(a.id).toBe(b.id);
    expect([a.criado, b.criado].filter(Boolean)).toHaveLength(1);
    expect(await db.select().from(lotes)).toHaveLength(1);
  });
});
```

`src/modules/lotes/porta.int.test.ts` (a porta chamada pela Fase 4; cresce nas Tarefas 3 e 6):

```ts
import { asc, eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EmissorFalso } from '@/conectores/nfe/falso';
import { definirEmissorParaTestes } from '@/conectores/nfe/registro';
import { devolucoes, itensDevolucao, lotes } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { definirFilaParaTestes, FilaMemoria } from '@/modules/fila/fila';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { configurarFiscalTeste } from '../../../tests/helpers/fabricas-fiscal';
import { criarDevolucaoComProblemasTeste, criarFornecedorCompletoTeste, criarProdutoDoFornecedorTeste } from '../../../tests/helpers/fabricas-lotes';
import { autorizarDevolucaoTeste } from '../../../tests/helpers/fluxo-lotes';

const { db, sql } = criarDbTeste();
const AGORA = new Date('2026-11-14T13:00:00Z');
let gestor: UsuarioSessao;
let fiscal: UsuarioSessao;
let fila: FilaMemoria;

beforeEach(async () => {
  await limparTabelas(sql);
  gestor = await criarUsuarioTeste(db, 'GESTOR');
  fiscal = await criarUsuarioTeste(db, 'FISCAL');
  await configurarFiscalTeste(db, gestor);
  fila = new FilaMemoria();
  definirFilaParaTestes(fila);
  definirEmissorParaTestes(new EmissorFalso());
});
afterEach(() => {
  definirFilaParaTestes(null);
  definirEmissorParaTestes(null);
});
afterAll(async () => {
  await sql.end();
});

describe('porta de lotes no ciclo da Fase 4 (contrato §5.7)', () => {
  it('NF de devolução autorizada: BOM disponível, PROBLEMA no lote do fornecedor, devolução concluída', async () => {
    const f = await criarFornecedorCompletoTeste(db);
    const p = await criarProdutoDoFornecedorTeste(db, { cnpjFornecedor: f.cnpj });
    const dev = await criarDevolucaoComProblemasTeste(db, gestor, {
      unidades: [{ destino: 'BOM', produtoId: p.id }, { destino: 'PROBLEMA', motivo: 'AVARIADO', produtoId: p.id }],
    });
    await autorizarDevolucaoTeste(db, fila, { devolucaoId: dev.id, codigosVenda: [p.sku, p.sku], fiscal, agora: AGORA });

    const [d] = await db.select({ status: devolucoes.status }).from(devolucoes).where(eq(devolucoes.id, dev.id));
    expect(d.status).toBe('CONCLUIDA');
    const itens = await db.select().from(itensDevolucao).where(eq(itensDevolucao.devolucaoId, dev.id)).orderBy(asc(itensDevolucao.unidade));
    const [lote] = await db.select().from(lotes);
    expect(itens.map((i) => [i.status, i.loteId])).toEqual([
      ['DISPONIVEL_VENDA', null],
      ['EM_LOTE', lote.id],
    ]);
  });
});
```

Rode: `npm run test:int -- src/modules/lotes/alocacao.int.test.ts src/modules/lotes/porta.int.test.ts`
Esperado: FAIL (`alocacao.ts` e `fluxo-lotes.ts` não existem).

- [ ] **Passo 2: Implementar `repositorio.ts`, `alocacao.ts` e o apoio `fluxo-lotes.ts`**

`obterOuCriarLoteAberto` (o `ON CONFLICT` usa o índice único parcial `lotes_fornecedor_aberto_uq`; sem ele, duas autorizações simultâneas derrubariam uma das transações):

```ts
export async function obterOuCriarLoteAberto(tx: DbOuTx, fornecedorId: string, agora: Date) {
  exigirTransicaoLote({ de: null, para: 'ABERTO', ator: 'SISTEMA' });
  const [novo] = await tx
    .insert(lotes)
    .values({ fornecedorId, criadoEm: agora, atualizadoEm: agora })
    .onConflictDoNothing({ target: lotes.fornecedorId, where: sql`"status" = 'ABERTO'` })
    .returning({ id: lotes.id, codigo: lotes.codigo });
  if (novo) {
    await registrarEvento(tx, { entidade: 'lote', entidadeId: novo.id, acao: 'lote_criado', de: null, para: 'ABERTO', usuarioId: null, em: agora, dados: { fornecedorId } });
    return { ...novo, criado: true };
  }
  const [existente] = await tx
    .select({ id: lotes.id, codigo: lotes.codigo })
    .from(lotes)
    .where(and(eq(lotes.fornecedorId, fornecedorId), eq(lotes.status, 'ABERTO')));
  return { ...existente, criado: false };
}
```

`incluirNoLote`: `exigirTransicaoItem({ de: p.de, para: 'EM_LOTE', ator: p.ator })`; `obterOuCriarLoteAberto`; grava `status = 'EM_LOTE'` e `loteId`; eventos `item_status` (entidade `item`, `de`/`para`, `dados: { loteId, loteCodigo, devolucaoId }`) e `lote_item_incluido` (entidade `lote`, `dados: { itemId, devolucaoId, unidade }`).

`alocarItensProblema`: lê as unidades da devolução com `status = 'AGUARDANDO_NF'` e `destino = 'PROBLEMA'`, ordenadas por `unidade`, com `left join produtos on produtos.id = itens_devolucao.produto_recebido_id` para pegar `produtos.fornecedor_id`. Com fornecedor → `incluirNoLote` (`de: 'AGUARDANDO_NF'`, `ator: 'SISTEMA'`, `usuarioId: null`). Sem fornecedor → `exigirTransicaoItem({ de: 'AGUARDANDO_NF', para: 'SEM_FORNECEDOR', ator: 'SISTEMA' })`, grava o status e o evento `item_status` com `dados: { motivo: 'Produto recebido sem fornecedor no cadastro' }` (ou `'Produto recebido desconhecido'` quando `produto_recebido_id` é vazio). Devolve as duas contagens.

`tests/helpers/fluxo-lotes.ts` (só integração; pode usar a fila): grava a NF de venda com `inserirNotaVendaTeste(db, devolucaoId, { itens: agrupa codigosVenda por código → { codigo, quantidade } })`, chama `solicitarEmissao(db, { tipo: 'DEVOLUCAO_VENDA', devolucaoId }, fiscal)` e `rodarTarefasFiscais(db, fila, agora)`. Devolve o `notaFiscalId`.

- [ ] **Passo 3: Ligar a porta**

Em `src/modules/lotes/porta.ts`, troque só o corpo de `alocarItensProblema`:

```ts
async alocarItensProblema(tx, devolucaoId, agora) {
  await alocarItensProblema(tx, devolucaoId, agora);
},
```

Os outros cinco métodos ficam como estão até as Tarefas 3 e 6. Apague `src/modules/lotes/porta.test.ts`.

- [ ] **Passo 4: Ajustar o teste da Fase 4 que fixava D11**

Em `src/modules/fiscal/emissao.int.test.ts`, o teste "solicita, envia e autoriza na 2ª consulta: BOM disponível, PROBLEMA aguardando (D11), devolução concluída" esperava a unidade PROBLEMA em `AGUARDANDO_NF`. A fábrica dela não grava `produto_recebido_id`, então agora a unidade vai para `SEM_FORNECEDOR`. Troque **só** essa expectativa (e o "D11" do título por "PROBLEMA sem fornecedor (Fase 5)"). Não mude nenhum arquivo de `src/modules/fiscal/` além de testes.

Rode: `npm run test:int -- src/modules/lotes src/modules/fiscal`
Esperado: PASS.

- [ ] **Passo 5: Commit**

```bash
git add src/modules/lotes tests/helpers/fluxo-lotes.ts src/modules/fiscal/emissao.int.test.ts
git commit -m "feat(lotes): alocação automática no lote ABERTO do fornecedor e SEM_FORNECEDOR na autorização da NF de devolução" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 3: Recusa do cancelamento da NF de devolução e desfazer a alocação (spec §5.2, §8.6)

**Arquivos:**
- Modificar: `src/modules/lotes/alocacao.ts`, `src/modules/lotes/porta.ts`
- Testes: `src/modules/lotes/alocacao.test.ts` (novo, unitário), `src/modules/lotes/porta.int.test.ts` (mais casos)

**Interfaces:**
- Consome: `cancelarNota(db, notaFiscalId, justificativa, usuario, agora?)` (Fase 4), Tarefa 2.
- Produz (`alocacao.ts`):
  - `type UnidadeBloqueada = { unidade: number; loteCodigo: string; loteStatus: StatusLote }`
  - `mensagemCancelamentoBloqueado(unidades: UnidadeBloqueada[]): string` (pura)
  - `unidadesEmLotesNaoAbertos(tx: DbOuTx, devolucaoId: string, opcoes?: { travar?: boolean }): Promise<UnidadeBloqueada[]>`
  - `motivoParaNaoCancelarDevolucao(tx, devolucaoId): Promise<string | null>`
  - `desfazerAlocacao(tx, devolucaoId, agora): Promise<void>`
  - `CORRIDA_CANCELAMENTO = ' A NF já foi cancelada no emissor: reabra o lote e peça o cancelamento de novo para registrar.'`

- [ ] **Passo 1: Escrever os testes que falham**

`src/modules/lotes/alocacao.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mensagemCancelamentoBloqueado } from './alocacao';

describe('mensagem da recusa do cancelamento (spec §8.6)', () => {
  it('uma unidade', () => {
    expect(mensagemCancelamentoBloqueado([{ unidade: 2, loteCodigo: 'LOT-000045', loteStatus: 'FECHADO' }])).toBe(
      'Não dá para cancelar esta NF: a unidade 2 está no lote LOT-000045 (Fechado). O cancelamento só é aceito enquanto o lote está Aberto.',
    );
  });

  it('várias unidades e lotes, sem repetir o lote', () => {
    expect(
      mensagemCancelamentoBloqueado([
        { unidade: 1, loteCodigo: 'LOT-000045', loteStatus: 'FECHADO' },
        { unidade: 2, loteCodigo: 'LOT-000045', loteStatus: 'FECHADO' },
        { unidade: 3, loteCodigo: 'LOT-000046', loteStatus: 'NF_EMITIDA' },
      ]),
    ).toBe(
      'Não dá para cancelar esta NF: as unidades 1, 2 e 3 estão nos lotes LOT-000045 (Fechado) e LOT-000046 (NF emitida). O cancelamento só é aceito enquanto o lote está Aberto.',
    );
  });
});
```

Acrescente em `src/modules/lotes/porta.int.test.ts` (dentro do mesmo `describe`; importe `cancelarNota` de `@/modules/fiscal/emissao`, `notasFiscais` do schema, `listarEventos`, `vi` do vitest e `portaLotes` de `./porta`):

```ts
const JUSTIFICATIVA = 'Cliente desistiu da devolução';

async function autorizadaComProblema() {
  const f = await criarFornecedorCompletoTeste(db);
  const p = await criarProdutoDoFornecedorTeste(db, { cnpjFornecedor: f.cnpj });
  const dev = await criarDevolucaoComProblemasTeste(db, gestor, {
    // A unidade 2 tem o SKU da venda (casa com a NF de venda), mas nenhum produto recebido: vai para SEM_FORNECEDOR.
    unidades: [{ destino: 'PROBLEMA', produtoId: p.id }, { destino: 'PROBLEMA', produtoId: null, sku: p.sku }],
  });
  const { notaFiscalId } = await autorizarDevolucaoTeste(db, fila, { devolucaoId: dev.id, codigosVenda: [p.sku, p.sku], fiscal, agora: AGORA });
  const [lote] = await db.select().from(lotes);
  return { dev, notaFiscalId, lote };
}

it('cancelar com o lote ABERTO: as unidades saem do lote e da pendência e voltam para Aguardando NF', async () => {
  const { dev, notaFiscalId, lote } = await autorizadaComProblema();
  await cancelarNota(db, notaFiscalId, JUSTIFICATIVA, fiscal, AGORA);
  const itens = await db.select().from(itensDevolucao).where(eq(itensDevolucao.devolucaoId, dev.id)).orderBy(asc(itensDevolucao.unidade));
  expect(itens.map((i) => [i.status, i.loteId])).toEqual([
    ['AGUARDANDO_NF', null],
    ['AGUARDANDO_NF', null],
  ]);
  expect((await listarEventos(db, 'lote', lote.id)).at(-1)).toMatchObject({ acao: 'lote_item_removido' });
  const [d] = await db.select({ status: devolucoes.status }).from(devolucoes).where(eq(devolucoes.id, dev.id));
  expect(d.status).toBe('AGUARDANDO_NF');
});

it('recusa o cancelamento quando a unidade está num lote que já não está ABERTO', async () => {
  const { notaFiscalId, lote } = await autorizadaComProblema();
  await db.update(lotes).set({ status: 'FECHADO', tipo: 'CONSERTO' }).where(eq(lotes.id, lote.id));
  await expect(cancelarNota(db, notaFiscalId, JUSTIFICATIVA, fiscal, AGORA)).rejects.toThrow(
    `Não dá para cancelar esta NF: a unidade 1 está no lote ${lote.codigo} (Fechado).`,
  );
  const [nota] = await db.select().from(notasFiscais).where(eq(notasFiscais.id, notaFiscalId));
  expect(nota.situacao).toBe('AUTORIZADA');
});

it('corrida: o lote fecha entre a checagem e a resposta da SEFAZ → a transação volta e a NF continua autorizada (decisão 13)', async () => {
  const { notaFiscalId, lote } = await autorizadaComProblema();
  // A 1ª checagem (fora da transação) passa; a 2ª, dentro de desfazerAlocacao, vê o lote fechado.
  vi.spyOn(portaLotes, 'motivoParaNaoCancelarDevolucao').mockResolvedValueOnce(null);
  await db.update(lotes).set({ status: 'FECHADO', tipo: 'CONSERTO' }).where(eq(lotes.id, lote.id));
  await expect(cancelarNota(db, notaFiscalId, JUSTIFICATIVA, fiscal, AGORA)).rejects.toThrow('A NF já foi cancelada no emissor');
  const [nota] = await db.select().from(notasFiscais).where(eq(notasFiscais.id, notaFiscalId));
  expect(nota.situacao).toBe('AUTORIZADA');
  const [item] = await db.select().from(itensDevolucao).where(eq(itensDevolucao.loteId, lote.id));
  expect(item.status).toBe('EM_LOTE');
});
```

(No `afterEach`, acrescente `vi.restoreAllMocks()`.)

Rode: `npm test -- src/modules/lotes/alocacao.test.ts && npm run test:int -- src/modules/lotes/porta.int.test.ts`
Esperado: FAIL.

- [ ] **Passo 2: Implementar**

- `mensagemCancelamentoBloqueado`: unidades em ordem; lotes distintos na ordem em que aparecem; "a unidade N está no lote X (Status)" ou "as unidades A, B e C estão nos lotes X (S) e Y (S)" (junção "a, b e c"); sempre termina com " O cancelamento só é aceito enquanto o lote está Aberto.".
- `unidadesEmLotesNaoAbertos`: `select unidade, lotes.codigo, lotes.status from itens_devolucao join lotes on lotes.id = itens_devolucao.lote_id where devolucao_id = ? and lotes.status <> 'ABERTO' order by unidade`; com `travar`, `.for('update', { of: lotes })`.
- `motivoParaNaoCancelarDevolucao`: vazio → `null`; senão a mensagem.
- `desfazerAlocacao`: (1) `unidadesEmLotesNaoAbertos(tx, id, { travar: true })`; se houver, `throw new ErroFiscal(mensagemCancelamentoBloqueado(...) + CORRIDA_CANCELAMENTO)` (nota da revisão da Fase 4; decisão 13). (2) Trava também os lotes ABERTO dessas unidades (`for update`). (3) Cada unidade EM_LOTE → AGUARDANDO_NF (`exigirTransicaoItem` com `SISTEMA`), `loteId = null`, eventos `item_status` e `lote_item_removido` (`dados: { itemId, devolucaoId, unidade, motivo: 'NF de devolução cancelada' }`). (4) Cada unidade SEM_FORNECEDOR → AGUARDANDO_NF, evento `item_status`. O lote ABERTO que ficar vazio continua existindo (recebe as próximas).
- Em `porta.ts`, ligue `motivoParaNaoCancelarDevolucao` e `desfazerAlocacao`.

Rode: `npm test -- src/modules/lotes && npm run test:int -- src/modules/lotes src/modules/fiscal`
Esperado: PASS (o teste "a porta de lotes pode impedir o cancelamento (Fase 5)" da Fase 4 continua passando: ele usa `vi.spyOn`).

- [ ] **Passo 3: Commit**

```bash
git add src/modules/lotes
git commit -m "feat(lotes): recusa o cancelamento da NF de devolução com lote fora de ABERTO e desfaz a alocação (checagem repetida com trava)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 4: Pendência SEM_FORNECEDOR: associar o produto e a tarefa `lotes.alocar-pendentes`

**Arquivos:**
- Criar: `src/modules/lotes/pendentes.ts`
- Modificar: `src/worker/manipuladores/lotes.ts`
- Testes: `src/modules/lotes/pendentes.int.test.ts`, `src/worker/manipuladores/lotes.int.test.ts`

**Interfaces:**
- Consome: `incluirNoLote`, `alocarItensProblema` (Tarefa 2), `normalizarSku` (`src/modules/catalogo/documentos.ts`), `pode` (`permissoes.ts`).
- Produz:
  - `associarProduto(db: Db, itemId: string, sku: string, usuario: UsuarioSessao, agora?: Date): Promise<{ loteCodigo: string }>`
  - `alocarPendentes(db: Db, agora: Date): Promise<{ alocadas: number; semFornecedor: number }>`
  - `manipuladoresLotes = { 'lotes.alocar-pendentes': ... }`

- [ ] **Passo 1: Escrever os testes que falham**

`src/modules/lotes/pendentes.int.test.ts`:

```ts
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { devolucoes, itensDevolucao, lotes, produtos } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { criarDevolucaoComProblemasTeste, criarFornecedorCompletoTeste, criarProdutoDoFornecedorTeste } from '../../../tests/helpers/fabricas-lotes';
import { alocarItensProblema } from './alocacao';
import { alocarPendentes, associarProduto } from './pendentes';

const { db, sql } = criarDbTeste();
const AGORA = new Date('2026-11-14T13:00:00Z');
let gestor: UsuarioSessao;
let fiscal: UsuarioSessao;

beforeEach(async () => {
  await limparTabelas(sql);
  gestor = await criarUsuarioTeste(db, 'GESTOR');
  fiscal = await criarUsuarioTeste(db, 'FISCAL');
});
afterAll(async () => {
  await sql.end();
});

/** Devolução concluída com uma unidade PROBLEMA já em SEM_FORNECEDOR. */
async function semFornecedor(produtoId: string | null) {
  const dev = await criarDevolucaoComProblemasTeste(db, gestor, { unidades: [{ destino: 'PROBLEMA', produtoId }] });
  await db.update(devolucoes).set({ status: 'CONCLUIDA', concluidaEm: AGORA }).where(eq(devolucoes.id, dev.id));
  await db.transaction((tx) => alocarItensProblema(tx, dev.id, AGORA));
  return dev.itens[0].id;
}
async function item(id: string) {
  const [i] = await db.select().from(itensDevolucao).where(eq(itensDevolucao.id, id));
  return i;
}

describe('associarProduto (spec §5.3: SEM_FORNECEDOR → EM_LOTE)', () => {
  it('liga o produto recebido e põe a unidade no lote ABERTO do fornecedor', async () => {
    const f = await criarFornecedorCompletoTeste(db);
    const p = await criarProdutoDoFornecedorTeste(db, { cnpjFornecedor: f.cnpj });
    const itemId = await semFornecedor(null);
    const { loteCodigo } = await associarProduto(db, itemId, ` ${p.sku.toLowerCase()} `, fiscal, AGORA);
    const [lote] = await db.select().from(lotes);
    expect(loteCodigo).toBe(lote.codigo);
    expect(await item(itemId)).toMatchObject({ status: 'EM_LOTE', loteId: lote.id, produtoRecebidoId: p.id });
  });

  it('explica o que falta: SKU fora do cadastro, produto sem fornecedor', async () => {
    const orfao = await criarProdutoDoFornecedorTeste(db, { cnpjFornecedor: null });
    const itemId = await semFornecedor(orfao.id);
    await expect(associarProduto(db, itemId, 'NAO-EXISTE', fiscal, AGORA)).rejects.toThrow(
      'O SKU NAO-EXISTE não está no cadastro: cadastre o produto em Produtos e Fornecedores.',
    );
    await expect(associarProduto(db, itemId, orfao.sku, fiscal, AGORA)).rejects.toThrow(
      `O produto ${orfao.sku} não tem fornecedor: escolha o fornecedor dele em Produtos e Fornecedores.`,
    );
    expect((await item(itemId)).status).toBe('SEM_FORNECEDOR');
  });

  it('recusa unidade que não está pendente e quem não é Fiscal nem Gestor', async () => {
    const f = await criarFornecedorCompletoTeste(db);
    const p = await criarProdutoDoFornecedorTeste(db, { cnpjFornecedor: f.cnpj });
    const itemId = await semFornecedor(null);
    const operador = await criarUsuarioTeste(db, 'OPERADOR');
    await expect(associarProduto(db, itemId, p.sku, operador, AGORA)).rejects.toThrow('Só o Fiscal ou o Gestor mexem nos lotes.');
    await associarProduto(db, itemId, p.sku, fiscal, AGORA);
    await expect(associarProduto(db, itemId, p.sku, fiscal, AGORA)).rejects.toThrow('Esta unidade não está mais sem fornecedor.');
  });
});

describe('alocarPendentes (tarefa lotes.alocar-pendentes)', () => {
  it('aloca o que a porta "sem lotes" deixou (D11) e o SEM_FORNECEDOR cujo produto ganhou fornecedor; a 2ª rodada não muda nada', async () => {
    const f = await criarFornecedorCompletoTeste(db);
    const p = await criarProdutoDoFornecedorTeste(db, { cnpjFornecedor: f.cnpj });
    // (a) D11: devolução concluída, unidade PROBLEMA ainda em AGUARDANDO_NF.
    const antiga = await criarDevolucaoComProblemasTeste(db, gestor, { unidades: [{ destino: 'PROBLEMA', produtoId: p.id }] });
    await db.update(devolucoes).set({ status: 'CONCLUIDA', concluidaEm: AGORA }).where(eq(devolucoes.id, antiga.id));
    // (b) SEM_FORNECEDOR e depois o produto ganhou fornecedor no cadastro.
    const orfao = await criarProdutoDoFornecedorTeste(db, { cnpjFornecedor: null });
    const pendente = await semFornecedor(orfao.id);
    await db.update(produtos).set({ fornecedorId: f.id }).where(eq(produtos.id, orfao.id));
    // Fora: devolução ainda em AGUARDANDO_NF (a NF não saiu).
    const semNf = await criarDevolucaoComProblemasTeste(db, gestor, { unidades: [{ destino: 'PROBLEMA', produtoId: p.id }] });

    expect(await alocarPendentes(db, AGORA)).toEqual({ alocadas: 2, semFornecedor: 0 });
    expect((await item(antiga.itens[0].id)).status).toBe('EM_LOTE');
    expect((await item(pendente)).status).toBe('EM_LOTE');
    expect((await item(semNf.itens[0].id)).status).toBe('AGUARDANDO_NF');
    expect(await alocarPendentes(db, AGORA)).toEqual({ alocadas: 0, semFornecedor: 0 });
  });
});
```

`src/worker/manipuladores/lotes.int.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { FilaMemoria } from '@/modules/fila/fila';
import { TAREFAS_NA_SUBIDA } from '@/modules/fila/tarefas';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { manipuladoresLotes } from './lotes';

const { db, sql } = criarDbTeste();
beforeEach(async () => {
  await limparTabelas(sql);
});
afterAll(async () => {
  await sql.end();
});

describe('manipuladores da Fase 5 (contrato §5.1)', () => {
  it('lotes.alocar-pendentes roda na subida do worker e termina sem erro com o banco vazio', async () => {
    expect(TAREFAS_NA_SUBIDA).toContain('lotes.alocar-pendentes');
    const manipulador = manipuladoresLotes['lotes.alocar-pendentes'];
    expect(manipulador).toBeDefined();
    await expect(manipulador?.({}, { db, fila: new FilaMemoria(), agora: new Date(), tentativa: 1 })).resolves.toBeUndefined();
  });
});
```

Rode: `npm run test:int -- src/modules/lotes/pendentes.int.test.ts src/worker/manipuladores/lotes.int.test.ts`
Esperado: FAIL.

- [ ] **Passo 2: Implementar `pendentes.ts` e o manipulador**

- Permissão (vale para toda ação dos lotes; ponha em `repositorio.ts` e use nas Tarefas 5 a 8): `exigirPodeGerirLotes(usuario: UsuarioSessao): void` → `ErroLotes('Só o Fiscal ou o Gestor mexem nos lotes.')` sem `gerir_fiscal`.
- `associarProduto`: numa transação, trava a unidade (`for update`); status ≠ SEM_FORNECEDOR → `ErroLotes('Esta unidade não está mais sem fornecedor.')`; `normalizarSku(sku)`; produto pelo SKU (mensagens exatas do teste); grava `produto_recebido_id` (evento `item_status` não muda o status; registre só o `lote_item_incluido` e o `item_status` do `incluirNoLote`, com `dados.produtoRecebidoId`); `incluirNoLote({ de: 'SEM_FORNECEDOR', ator: usuario.perfil, usuarioId: usuario.id, ... })`.
- `alocarPendentes`: (a) ids das devoluções `CONCLUIDA` com alguma unidade `AGUARDANDO_NF` e `destino = 'PROBLEMA'`; para cada uma, uma transação: trava a devolução (`for update`), confere que continua CONCLUIDA e chama `alocarItensProblema`. (b) unidades `SEM_FORNECEDOR` com `produtos.fornecedor_id` preenchido (join pelo `produto_recebido_id`); agrupadas por devolução, uma transação por devolução (trava a devolução) e `incluirNoLote({ de: 'SEM_FORNECEDOR', ator: 'SISTEMA', usuarioId: null })`. Soma as contagens.
- `src/worker/manipuladores/lotes.ts`:

```ts
import { alocarPendentes } from '@/modules/lotes/pendentes';
import type { Manipuladores } from '../tipos';

/** Contrato §5.1: uma vez, na subida do worker (TAREFAS_NA_SUBIDA). Idempotente. */
export const manipuladoresLotes: Manipuladores = {
  'lotes.alocar-pendentes': async (_dados, ctx) => {
    await alocarPendentes(ctx.db, ctx.agora);
  },
};
```

Rode: `npm run test:int -- src/modules/lotes src/worker`
Esperado: PASS.

- [ ] **Passo 3: Commit**

```bash
git add src/modules/lotes src/worker/manipuladores/lotes.ts src/worker/manipuladores/lotes.int.test.ts
git commit -m "feat(lotes): associar o produto da unidade SEM_FORNECEDOR e tarefa lotes.alocar-pendentes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 5: Fechar, reabrir e mover unidades (spec §5.4)

**Arquivos:**
- Criar: `src/modules/lotes/gestao.ts`
- Modificar: `src/modules/lotes/repositorio.ts`
- Testes: `src/modules/lotes/gestao.int.test.ts`

**Interfaces:**
- Consome: Tarefas 1 a 4, `ehViolacaoDeUnicidade` (`src/db/erros.ts`), `notasFiscais`.
- Produz:
  - `repositorio.ts`: `notaAtivaDoLote(db: DbOuTx, loteId: string): Promise<NotaFiscalLinha | null>` (a mais nova com `situacao <> 'CANCELADA'`); `jaTeveNota(db, loteId): Promise<boolean>`; `loteEditavel(status: StatusLote, notaAtiva: NotaFiscalLinha | null): boolean` (= ABERTO, ou FECHADO sem NF ativa). `exigirPodeGerirLotes(usuario)` já existe (Tarefa 4).
  - `gestao.ts`: `fecharLote(db: Db, loteId: string, tipo: TipoLote, usuario: UsuarioSessao, agora?: Date): Promise<void>`; `reabrirLote(db, loteId, usuario, agora?): Promise<void>`; `type DestinoMover = { loteId: string } | { novo: TipoLote }`; `moverUnidades(db, p: { loteId: string; itemIds: string[]; destino: DestinoMover }, usuario, agora?): Promise<{ destinoCodigo: string; origemApagada: boolean }>`

- [ ] **Passo 1: Escrever os testes que falham**

`src/modules/lotes/gestao.int.test.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { itensDevolucao, lotes, notasFiscais } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { listarEventos } from '@/modules/historico/eventos';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { criarDevolucaoComProblemasTeste, criarFornecedorCompletoTeste, criarLoteTeste } from '../../../tests/helpers/fabricas-lotes';
import { fecharLote, moverUnidades, reabrirLote } from './gestao';

const { db, sql } = criarDbTeste();
const AGORA = new Date('2026-11-14T13:00:00Z');
let gestor: UsuarioSessao;
let fiscal: UsuarioSessao;

beforeEach(async () => {
  await limparTabelas(sql);
  gestor = await criarUsuarioTeste(db, 'GESTOR');
  fiscal = await criarUsuarioTeste(db, 'FISCAL');
});
afterAll(async () => {
  await sql.end();
});

async function loteCom(unidades: number, p: { status?: 'ABERTO' | 'FECHADO' | 'NF_EMITIDA'; fornecedorId?: string } = {}) {
  const fornecedorId = p.fornecedorId ?? (await criarFornecedorCompletoTeste(db)).id;
  const dev = await criarDevolucaoComProblemasTeste(db, gestor, { unidades: Array.from({ length: unidades }, () => ({ destino: 'PROBLEMA' as const })) });
  const lote = await criarLoteTeste(db, { fornecedorId, status: p.status ?? 'ABERTO', itemIds: dev.itens.map((i) => i.id) });
  return { ...lote, fornecedorId, itemIds: dev.itens.map((i) => i.id) };
}
async function lote(id: string) {
  const [l] = await db.select().from(lotes).where(eq(lotes.id, id));
  return l;
}
async function notaNoLote(loteId: string, situacao: 'PROCESSANDO' | 'REJEITADA' | 'AUTORIZADA' | 'CANCELADA') {
  await db.insert(notasFiscais).values({ tipo: 'REMESSA_CONSERTO', loteId, ambiente: 'HOMOLOGACAO', referenciaEmissor: randomUUID().replace(/-/g, ''), situacao });
}

describe('fecharLote', () => {
  it('ABERTO → FECHADO com o tipo, quem fechou e o evento', async () => {
    const l = await loteCom(2);
    await fecharLote(db, l.id, 'CONSERTO', fiscal, AGORA);
    expect(await lote(l.id)).toMatchObject({ status: 'FECHADO', tipo: 'CONSERTO', fechadoEm: AGORA, fechadoPor: fiscal.id });
    expect((await listarEventos(db, 'lote', l.id)).at(-1)).toMatchObject({ acao: 'lote_fechado', de: 'ABERTO', para: 'FECHADO' });
  });

  it('recusa lote vazio, lote que não está aberto e o Operador', async () => {
    const vazio = await criarLoteTeste(db, { fornecedorId: (await criarFornecedorCompletoTeste(db)).id });
    await expect(fecharLote(db, vazio.id, 'TROCA', fiscal, AGORA)).rejects.toThrow(`O lote ${vazio.codigo} não tem unidades: não há o que fechar.`);
    const l = await loteCom(1, { status: 'FECHADO' });
    await expect(fecharLote(db, l.id, 'TROCA', fiscal, AGORA)).rejects.toThrow('Mudança não permitida no lote: Fechado → Fechado (Fiscal).');
    const operador = await criarUsuarioTeste(db, 'OPERADOR');
    await expect(fecharLote(db, (await loteCom(1)).id, 'TROCA', operador, AGORA)).rejects.toThrow('Só o Fiscal ou o Gestor mexem nos lotes.');
  });
});

describe('reabrirLote (antes da NF)', () => {
  it('FECHADO → ABERTO e o tipo volta a ficar em aberto', async () => {
    const l = await loteCom(1, { status: 'FECHADO' });
    await reabrirLote(db, l.id, gestor, AGORA);
    expect(await lote(l.id)).toMatchObject({ status: 'ABERTO', tipo: null, fechadoEm: null, fechadoPor: null });
  });

  it('com NF ativa (até rejeitada) não reabre; com a NF cancelada, reabre', async () => {
    const l = await loteCom(1, { status: 'FECHADO' });
    await notaNoLote(l.id, 'REJEITADA');
    await expect(reabrirLote(db, l.id, fiscal, AGORA)).rejects.toThrow('O lote tem NF de Remessa rejeitada: ele não pode ser reaberto.');
    await db.update(notasFiscais).set({ situacao: 'CANCELADA' }).where(eq(notasFiscais.loteId, l.id));
    await reabrirLote(db, l.id, fiscal, AGORA);
    expect((await lote(l.id)).status).toBe('ABERTO');
  });

  it('com outro lote ABERTO do fornecedor, orienta a mover as unidades', async () => {
    const aberto = await loteCom(1);
    const fechado = await loteCom(1, { status: 'FECHADO', fornecedorId: aberto.fornecedorId });
    await expect(reabrirLote(db, fechado.id, fiscal, AGORA)).rejects.toThrow(
      `O fornecedor já tem o lote ${aberto.codigo} aberto: mova as unidades deste lote para ele.`,
    );
  });
});

describe('moverUnidades (spec §5.4, decisões 2 e 3)', () => {
  it('separa a troca do conserto: as unidades marcadas vão para um lote novo, já FECHADO com o tipo', async () => {
    const l = await loteCom(3);
    const { destinoCodigo, origemApagada } = await moverUnidades(db, { loteId: l.id, itemIds: [l.itemIds[2]], destino: { novo: 'TROCA' } }, fiscal, AGORA);
    expect(origemApagada).toBe(false);
    const [novo] = await db.select().from(lotes).where(eq(lotes.codigo, destinoCodigo));
    expect(novo).toMatchObject({ status: 'FECHADO', tipo: 'TROCA', fornecedorId: l.fornecedorId, fechadoPor: fiscal.id });
    const [movido] = await db.select().from(itensDevolucao).where(eq(itensDevolucao.id, l.itemIds[2]));
    expect(movido).toMatchObject({ loteId: novo.id, status: 'EM_LOTE' });
    expect((await listarEventos(db, 'item', l.itemIds[2])).at(-1)).toMatchObject({
      acao: 'lote_item_movido',
      dados: { de: l.codigo, para: novo.codigo },
    });
    await fecharLote(db, l.id, 'CONSERTO', fiscal, AGORA);
  });

  it('o lote que fica vazio e nunca teve NF é apagado', async () => {
    const aberto = await loteCom(1);
    const fechado = await loteCom(1, { status: 'FECHADO', fornecedorId: aberto.fornecedorId });
    const r = await moverUnidades(db, { loteId: fechado.id, itemIds: fechado.itemIds, destino: { loteId: aberto.id } }, fiscal, AGORA);
    expect(r).toEqual({ destinoCodigo: aberto.codigo, origemApagada: true });
    expect(await db.select().from(lotes).where(eq(lotes.id, fechado.id))).toHaveLength(0);
  });

  it('recusa: outro fornecedor, lote com NF ativa, unidade de outro lote, nenhuma unidade', async () => {
    const a = await loteCom(1);
    const b = await loteCom(1);
    await expect(moverUnidades(db, { loteId: a.id, itemIds: a.itemIds, destino: { loteId: b.id } }, fiscal, AGORA)).rejects.toThrow(
      'Só dá para mover unidades entre lotes do mesmo fornecedor.',
    );
    const emitido = await loteCom(1, { status: 'NF_EMITIDA' });
    await expect(moverUnidades(db, { loteId: emitido.id, itemIds: emitido.itemIds, destino: { novo: 'TROCA' } }, fiscal, AGORA)).rejects.toThrow(
      'Só dá para mover unidades de um lote aberto, ou fechado e ainda sem NF de Remessa.',
    );
    await expect(moverUnidades(db, { loteId: a.id, itemIds: b.itemIds, destino: { novo: 'TROCA' } }, fiscal, AGORA)).rejects.toThrow(
      'Uma das unidades marcadas não está neste lote.',
    );
    await expect(moverUnidades(db, { loteId: a.id, itemIds: [], destino: { novo: 'TROCA' } }, fiscal, AGORA)).rejects.toThrow(
      'Marque pelo menos uma unidade.',
    );
  });
});
```

Rode: `npm run test:int -- src/modules/lotes/gestao.int.test.ts`
Esperado: FAIL.

- [ ] **Passo 2: Implementar `gestao.ts`**

Cada função: `exigirPodeGerirLotes(usuario)`, uma transação, o lote travado com `obterLote(tx, id, { travar: true })` (`ErroLotes('Lote não encontrado.')`), a transição pelo `exigirTransicaoLote` com `ator: usuario.perfil`, eventos com `usuarioId: usuario.id` e `em: agora`, e `atualizadoEm: agora`.

- `fecharLote`: transição primeiro (a mensagem "Fechado → Fechado" do teste vem dela); `contarUnidades === 0` → a mensagem do teste; grava `status`, `tipo`, `fechadoEm`, `fechadoPor`; evento `lote_fechado` com `dados: { tipo }`.
- `reabrirLote`: transição FECHADO → ABERTO; `notaAtivaDoLote` → `ErroLotes(\`O lote tem NF de Remessa ${ROTULO_SITUACAO_NOTA[n.situacao].toLowerCase()}: ele não pode ser reaberto.\`)`; outro lote ABERTO do fornecedor → a mensagem do teste; grava `status: 'ABERTO', tipo: null, fechadoEm: null, fechadoPor: null`; evento `lote_reaberto`. Se o `update` violar o índice único (corrida), traduza com `ehViolacaoDeUnicidade` para a mesma mensagem.
- `moverUnidades`, nesta ordem: lista vazia → "Marque pelo menos uma unidade."; origem editável (`loteEditavel`, senão a mensagem do teste); unidades: todas com `lote_id = origem` e `status = 'EM_LOTE'` (travadas), senão "Uma das unidades marcadas não está neste lote."; destino existente: travado, `fornecedorId` igual (senão a mensagem do teste), diferente da origem ("Escolha um lote diferente do atual."), editável ("O lote de destino já tem NF de Remessa ou já foi enviado."); destino novo: `exigirTransicaoLote({ de: null, para: 'FECHADO', ator })`, `insert` com `status: 'FECHADO'`, `tipo`, `fechadoEm`, `fechadoPor` e eventos `lote_criado` e `lote_fechado`. Depois: `update itens_devolucao set lote_id = destino`; eventos `lote_item_movido` no item (`dados: { de: codigoOrigem, para: codigoDestino }`) e um em cada lote (`dados: { itemIds, de, para }`). Por fim, se a origem ficou sem unidades e `!jaTeveNota(origem)`: `delete from lotes where id = origem` (decisão 3) e `origemApagada: true`.

Rode: `npm run test:int -- src/modules/lotes`
Esperado: PASS.

- [ ] **Passo 3: Commit**

```bash
git add src/modules/lotes
git commit -m "feat(lotes): fechar com o tipo, reabrir antes da NF e mover unidades entre lotes do mesmo fornecedor" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 6: NF de Remessa: montagem (spec §8.5), emissão, autorização, reenvio e cancelamento

**Arquivos:**
- Criar: `src/modules/lotes/montar-remessa.ts`, `src/modules/lotes/efeitos-remessa.ts`, `src/modules/lotes/remessa.ts`
- Modificar: `src/modules/lotes/porta.ts` (os três métodos de remessa)
- Testes: `src/modules/lotes/montar-remessa.test.ts`, `src/modules/lotes/remessa.int.test.ts`

**Por que três arquivos:** `porta.ts` é importada pelo ciclo da Fase 4 (`notas.ts`, `ciclo.ts`, `cancelamento.ts`). Ela só pode importar `alocacao.ts`, `montar-remessa.ts` e `efeitos-remessa.ts`, que não importam `fiscal/emissao.ts`. Os atalhos das telas (`remessa.ts`) importam `emissao.ts` e nunca são importados pela porta.

**Interfaces:**
- Consome (Fase 4): `lerConfiguracaoFiscal`, `operacaoPorUf`, `regraFiscal`, `type ConfiguracaoFiscal`, `type RegraFiscal` (`src/modules/fiscal/configuracao.ts`); `solicitarEmissao`, `reenviarNota`, `cancelarNota` (`src/modules/fiscal/emissao.ts`); `exigirPodeEmitir` (`notas.ts`); `type NotaParaEmissao`, `type Destinatario`, `type ItemNota` (`src/conectores/nfe/tipos.ts`); `ROTULO_SITUACAO_NOTA`.
- Produz:
  - `montar-remessa.ts`: `type FornecedorRemessa = { razaoSocial: string; cnpj: string; ie: string | null; logradouro: string | null; numero: string | null; complemento: string | null; bairro: string | null; cidade: string | null; uf: string | null; cep: string | null }`; `type UnidadeRemessa = { itemId: string; unidade: number; devolucaoCodigo: string; produtoId: string | null; sku: string; descricao: string | null; ean: string | null; ncm: string | null; custo: string | null; unidadeMedida: string | null; serial: string | null }`; `type EntradaRemessa = { referencia: string; loteCodigo: string; tipo: TipoLote; config: ConfiguracaoFiscal; regra: RegraFiscal; fornecedor: FornecedorRemessa; unidades: UnidadeRemessa[] }`; `faltasDoFornecedor(f: FornecedorRemessa): string[]`; `preencherInformacoesRemessa(modelo: string | null, v: { lote: string; seriais: string[]; devolucoes: string[] }): string`; `montarNotaRemessaPura(e: EntradaRemessa): NotaParaEmissao`; `carregarLoteRemessa(db: DbOuTx, loteId: string): Promise<{ codigo: string; status: StatusLote; tipo: TipoLote | null; fornecedor: FornecedorRemessa; unidades: UnidadeRemessa[] } | null>`; `montarNotaRemessa(db: DbOuTx, loteId: string, referencia: string): Promise<NotaParaEmissao>`
  - `efeitos-remessa.ts`: `aoAutorizarRemessa(tx, loteId, notaFiscalId, agora): Promise<void>`; `aoCancelarRemessa(tx, loteId, agora): Promise<void>`
  - `remessa.ts`: `emitirNotaRemessa(db: Db, loteId: string, usuario: UsuarioSessao): Promise<{ notaFiscalId: string }>`; `reenviarNotaRemessa(db, loteId, usuario): Promise<void>`; `cancelarNotaRemessa(db, loteId, justificativa: string, usuario, agora?: Date): Promise<void>`

- [ ] **Passo 1: Escrever o teste unitário da montagem (falha)**

`src/modules/lotes/montar-remessa.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { ConfiguracaoFiscal, RegraFiscal } from '@/modules/fiscal/configuracao';
import { montarNotaRemessaPura, preencherInformacoesRemessa, type EntradaRemessa, type UnidadeRemessa } from './montar-remessa';

const CONFIG: ConfiguracaoFiscal = {
  emitente: { razaoSocial: 'Empresa Teste Ltda', cnpj: '11444777000161', ie: '110042490114', logradouro: 'Rua A', numero: '100', complemento: null, bairro: 'Centro', cidade: 'Sao Paulo', uf: 'SP', cep: '01001000' },
  regime: 'SIMPLES',
  serie: '1',
  ambiente: 'HOMOLOGACAO',
};
const REGRA: RegraFiscal = {
  tipoNota: 'REMESSA_CONSERTO',
  operacao: 'FORA_ESTADO',
  cfop: '6915',
  icmsSituacaoTributaria: '400',
  pisSituacaoTributaria: '49',
  cofinsSituacaoTributaria: '49',
  naturezaOperacao: 'Remessa para conserto',
  informacoesComplementares: 'Lote {lote}. S/N: {seriais}.',
};
const FORNECEDOR = {
  razaoSocial: 'Fornecedor Remessa Ltda',
  cnpj: '11222333000181',
  ie: '0623079040081',
  logradouro: 'Rua das Peças',
  numero: '200',
  complemento: null,
  bairro: 'Distrito Industrial',
  cidade: 'Contagem',
  uf: 'MG',
  cep: '32210000',
};
function unidade(n: number, p: Partial<UnidadeRemessa> = {}): UnidadeRemessa {
  return {
    itemId: `item-${n}`, unidade: 1, devolucaoCodigo: `DEV-00000${n}`, produtoId: 'p1', sku: 'FONE-01', descricao: 'Fone Bluetooth',
    ean: '7891000000014', ncm: '85183000', custo: '35.90', unidadeMedida: 'UN', serial: `SN${n}`, ...p,
  };
}
function entrada(p: Partial<EntradaRemessa> = {}): EntradaRemessa {
  return { referencia: 'ref1', loteCodigo: 'LOT-000045', tipo: 'CONSERTO', config: CONFIG, regra: REGRA, fornecedor: FORNECEDOR, unidades: [unidade(1)], ...p };
}

describe('NF de remessa (spec §8.5, decisão 6)', () => {
  it('um item por produto, com a quantidade de unidades, NCM e o custo do produto como valor', () => {
    const nota = montarNotaRemessaPura(
      entrada({ unidades: [unidade(1), unidade(2), unidade(3, { produtoId: 'p2', sku: 'CABO-02', descricao: 'Cabo USB', ncm: '85444200', custo: '9.50', ean: null, unidadeMedida: null, serial: null })] }),
    );
    expect(nota.itens).toEqual([
      { codigo: 'FONE-01', descricao: 'Fone Bluetooth', ncm: '85183000', cfop: '6915', unidade: 'UN', quantidade: 2, valorUnitario: 35.9, ean: '7891000000014', icmsOrigem: 0, icmsSituacao: '400', pisSituacao: '49', cofinsSituacao: '49' },
      { codigo: 'CABO-02', descricao: 'Cabo USB', ncm: '85444200', cfop: '6915', unidade: 'UN', quantidade: 1, valorUnitario: 9.5, ean: null, icmsOrigem: 0, icmsSituacao: '400', pisSituacao: '49', cofinsSituacao: '49' },
    ]);
  });

  it('saída normal, sem nota referenciada, para o fornecedor com IE', () => {
    const nota = montarNotaRemessaPura(entrada());
    expect(nota).toMatchObject({
      referencia: 'ref1', tipo: 'REMESSA_CONSERTO', naturezaOperacao: 'Remessa para conserto', entrada: false, finalidade: 'NORMAL',
      operacao: 'FORA_ESTADO', consumidorFinal: false, regime: 'SIMPLES', chavesReferenciadas: [],
      emitente: CONFIG.emitente,
      destinatario: { nome: 'Fornecedor Remessa Ltda', cpf: null, cnpj: '11222333000181', ie: '0623079040081', indicadorIe: 1, uf: 'MG', cep: '32210000' },
    });
  });

  it('fornecedor sem IE: indicador 9 e consumidor final; troca/garantia vira REMESSA_TROCA_GARANTIA', () => {
    const nota = montarNotaRemessaPura(entrada({ tipo: 'GARANTIA', fornecedor: { ...FORNECEDOR, ie: null } }));
    expect(nota).toMatchObject({ tipo: 'REMESSA_TROCA_GARANTIA', consumidorFinal: true, destinatario: { indicadorIe: 9, ie: null } });
  });

  it('informações complementares: o código do lote e a lista de S/N (spec §8.5)', () => {
    expect(montarNotaRemessaPura(entrada({ unidades: [unidade(1), unidade(2, { serial: null })] })).informacoesComplementares).toBe('Lote LOT-000045. S/N: SN1.');
    expect(preencherInformacoesRemessa(null, { lote: 'LOT-000001', seriais: [], devolucoes: ['DEV-000001', 'DEV-000002'] })).toBe('Lote LOT-000001. S/N: sem S/N.');
    expect(preencherInformacoesRemessa('Devolucoes {devolucao}. {chaves}Lote {lote}', { lote: 'LOT-000001', seriais: ['A'], devolucoes: ['DEV-000001', 'DEV-000002'] })).toBe(
      'Devolucoes DEV-000001, DEV-000002. Lote LOT-000001',
    );
  });

  it('recusa com tudo o que falta, numa mensagem só', () => {
    const e = entrada({
      fornecedor: { ...FORNECEDOR, cep: null, cidade: null },
      unidades: [unidade(1, { ncm: null }), unidade(2, { produtoId: 'p2', sku: 'CABO-02', custo: '0' })],
    });
    expect(() => montarNotaRemessaPura(e)).toThrow(
      'Complete o cadastro do fornecedor Fornecedor Remessa Ltda em Produtos e Fornecedores (falta: cidade, CEP). Produto FONE-01: falta o NCM. Produto CABO-02: falta o custo.',
    );
    expect(() => montarNotaRemessaPura(entrada({ unidades: [] }))).toThrow('O lote LOT-000045 não tem unidades.');
  });
});
```

Rode: `npm test -- src/modules/lotes/montar-remessa.test.ts`
Esperado: FAIL.

- [ ] **Passo 2: Implementar `montar-remessa.ts`**

- `faltasDoFornecedor`: na ordem `logradouro`, `número`, `bairro`, `cidade`, `UF`, `CEP` (rótulos em português), um por campo vazio.
- `preencherInformacoesRemessa`: modelo padrão `'Lote {lote}. S/N: {seriais}.'`; troca `{lote}`, `{seriais}` (juntos com ", "; vazio → `sem S/N`), `{devolucao}` (códigos distintos com ", ") e `{chaves}` (vazio); `.trim().slice(0, 5000)`.
- `montarNotaRemessaPura`, nesta ordem: lote sem unidades → `ErroLotes('O lote LOT-x não tem unidades.')`. Junte os problemas: fornecedor (`Complete o cadastro do fornecedor ${razao} em Produtos e Fornecedores (falta: ${faltas.join(', ')}).`), depois cada produto distinto na ordem das unidades (`Produto ${sku}: falta o NCM.` quando `ncm` não tem 8 dígitos; `Produto ${sku}: falta o custo.` quando `custo` é vazio ou ≤ 0; unidade sem `produtoId` → `Unidade ${unidade} da ${devolucaoCodigo}: sem produto recebido.`). Com problemas → `ErroLotes(problemas.join(' '))`. Os itens: agrupe por `produtoId` na ordem da primeira aparição; `valorUnitario: Number(custo)`; `unidade: unidadeMedida ?? 'UN'`; `icmsOrigem: 0`; CFOP e CSTs da regra; **sem** `tributos` (decisão 6). Destinatário: `nome = razaoSocial`, `cpf: null`, `indicadorIe: ie ? 1 : 9`. `consumidorFinal: indicadorIe === 9`. `tipo: tipoNotaDoLote(e.tipo)`, `operacao: e.regra.operacao`.
- `carregarLoteRemessa`: lote + fornecedor (join) e as unidades do lote (`itens_devolucao.lote_id = ?`, ordem: código da devolução, depois `unidade`), com o produto pelo `produto_recebido_id` (`sku`, `descricao`, `ean`, `ncm`, `custo`, `unidade`).
- `montarNotaRemessa`: carrega (nulo → `ErroLotes('Lote não encontrado.')`); status ≠ FECHADO → `ErroLotes(\`O lote precisa estar Fechado para a NF de Remessa (agora: ${ROTULO_STATUS_LOTE[status]}).\`)`; sem tipo → `ErroLotes('Escolha o tipo do lote ao fechar.')`; `lerConfiguracaoFiscal`; sem UF do fornecedor, a pura já recusa (passe a operação `DENTRO_ESTADO` só para não quebrar antes); `regraFiscal(db, tipoNotaDoLote(tipo), operacaoPorUf(config.emitente.uf, fornecedor.uf ?? config.emitente.uf))`; `montarNotaRemessaPura`.

Rode: `npm test -- src/modules/lotes/montar-remessa.test.ts`
Esperado: PASS.

- [ ] **Passo 3: Escrever o teste de integração do ciclo (falha)**

`src/modules/lotes/remessa.int.test.ts`:

```ts
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EmissorFalso } from '@/conectores/nfe/falso';
import { definirEmissorParaTestes } from '@/conectores/nfe/registro';
import type { NotaParaEmissao } from '@/conectores/nfe/tipos';
import { lotes, notasFiscais, produtos, regrasFiscais } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { definirFilaParaTestes, FilaMemoria } from '@/modules/fila/fila';
import { listarEventos } from '@/modules/historico/eventos';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { configurarFiscalTeste } from '../../../tests/helpers/fabricas-fiscal';
import {
  criarDevolucaoComProblemasTeste,
  criarFornecedorCompletoTeste,
  criarLoteTeste,
  criarProdutoDoFornecedorTeste,
} from '../../../tests/helpers/fabricas-lotes';
import { rodarTarefasFiscais } from '../../../tests/helpers/fila-fiscal';
import { cancelarNotaRemessa, emitirNotaRemessa, reenviarNotaRemessa } from './remessa';

const { db, sql } = criarDbTeste();
const AGORA = new Date('2026-11-14T13:00:00Z');
const JUSTIFICATIVA = 'Remessa emitida para o fornecedor errado';
let gestor: UsuarioSessao;
let fiscal: UsuarioSessao;
let fila: FilaMemoria;
let emissor: EmissorQueGuarda;

class EmissorQueGuarda extends EmissorFalso {
  notas: NotaParaEmissao[] = [];
  override async emitir(nota: NotaParaEmissao) {
    this.notas.push(nota);
    return super.emitir(nota);
  }
}

beforeEach(async () => {
  await limparTabelas(sql);
  gestor = await criarUsuarioTeste(db, 'GESTOR');
  fiscal = await criarUsuarioTeste(db, 'FISCAL');
  await configurarFiscalTeste(db, gestor);
  fila = new FilaMemoria();
  definirFilaParaTestes(fila);
  emissor = new EmissorQueGuarda();
  definirEmissorParaTestes(emissor);
});
afterEach(() => {
  definirFilaParaTestes(null);
  definirEmissorParaTestes(null);
});
afterAll(async () => {
  await sql.end();
});

/** Lote FECHADO (Conserto) de um fornecedor em MG (a empresa de teste é de SP: operação fora do estado). */
async function loteFechado(p: { ncm?: string | null } = {}) {
  const f = await criarFornecedorCompletoTeste(db);
  const prod = await criarProdutoDoFornecedorTeste(db, { cnpjFornecedor: f.cnpj, ncm: p.ncm });
  const dev = await criarDevolucaoComProblemasTeste(db, gestor, { unidades: [{ destino: 'PROBLEMA', produtoId: prod.id, serial: 'SN-1' }, { destino: 'PROBLEMA', produtoId: prod.id, serial: 'SN-2' }] });
  const lote = await criarLoteTeste(db, { fornecedorId: f.id, status: 'FECHADO', tipo: 'CONSERTO', itemIds: dev.itens.map((i) => i.id) });
  return { ...lote, produtoId: prod.id };
}
async function loteDe(id: string) {
  const [l] = await db.select().from(lotes).where(eq(lotes.id, id));
  return l;
}
async function notaDe(id: string) {
  const [n] = await db.select().from(notasFiscais).where(eq(notasFiscais.id, id));
  return n;
}

describe('NF de Remessa no ciclo da Fase 4 (spec §6.5, §8.6)', () => {
  it('emite, a SEFAZ autoriza e o lote vai para NF emitida', async () => {
    const l = await loteFechado();
    const { notaFiscalId } = await emitirNotaRemessa(db, l.id, fiscal);
    expect(await notaDe(notaFiscalId)).toMatchObject({ tipo: 'REMESSA_CONSERTO', loteId: l.id, devolucaoId: null, situacao: 'PROCESSANDO' });
    await rodarTarefasFiscais(db, fila, AGORA);

    expect(await notaDe(notaFiscalId)).toMatchObject({ situacao: 'AUTORIZADA' });
    expect(await loteDe(l.id)).toMatchObject({ status: 'NF_EMITIDA', notaFiscalId });
    expect(emissor.notas[0]).toMatchObject({ tipo: 'REMESSA_CONSERTO', operacao: 'FORA_ESTADO', informacoesComplementares: `Lote ${l.codigo}. S/N: SN-1, SN-2.` });
    expect(emissor.notas[0].itens).toEqual([expect.objectContaining({ cfop: '6915', quantidade: 2, valorUnitario: 35.9 })]);
    expect((await listarEventos(db, 'lote', l.id)).map((e) => e.acao)).toEqual(['nf_solicitada', 'nf_autorizada']);
  });

  it('recusa antes de criar a nota: lote aberto, falta NCM, NF já ativa', async () => {
    const aberto = await criarLoteTeste(db, { fornecedorId: (await criarFornecedorCompletoTeste(db)).id });
    await expect(emitirNotaRemessa(db, aberto.id, fiscal)).rejects.toThrow('Feche o lote antes de emitir a NF de Remessa.');
    const semNcm = await loteFechado({ ncm: null });
    await expect(emitirNotaRemessa(db, semNcm.id, fiscal)).rejects.toThrow(/: falta o NCM\./);
    expect(await db.select().from(notasFiscais)).toHaveLength(0);
    const l = await loteFechado();
    await emitirNotaRemessa(db, l.id, fiscal);
    await expect(emitirNotaRemessa(db, l.id, fiscal)).rejects.toThrow('O lote já tem NF de Remessa em processamento.');
  });

  it('rejeitada: o lote continua Fechado; corrigir a regra e reenviar autoriza', async () => {
    await db.update(regrasFiscais).set({ naturezaOperacao: 'Remessa para conserto REJEITAR' }).where(eq(regrasFiscais.tipoNota, 'REMESSA_CONSERTO'));
    const l = await loteFechado();
    const { notaFiscalId } = await emitirNotaRemessa(db, l.id, fiscal);
    await rodarTarefasFiscais(db, fila, AGORA);
    expect((await notaDe(notaFiscalId)).situacao).toBe('REJEITADA');
    expect((await loteDe(l.id)).status).toBe('FECHADO');
    await expect(emitirNotaRemessa(db, l.id, fiscal)).rejects.toThrow('O lote tem NF de Remessa rejeitada: use "Corrigir e reenviar".');

    await db.update(regrasFiscais).set({ naturezaOperacao: 'Remessa para conserto' }).where(eq(regrasFiscais.tipoNota, 'REMESSA_CONSERTO'));
    await reenviarNotaRemessa(db, l.id, fiscal);
    await rodarTarefasFiscais(db, fila, AGORA);
    expect((await notaDe(notaFiscalId)).situacao).toBe('AUTORIZADA');
    expect((await loteDe(l.id)).status).toBe('NF_EMITIDA');
  });

  it('cancelar a NF de Remessa devolve o lote para Fechado; depois do envio, não cancela', async () => {
    const l = await loteFechado();
    const { notaFiscalId } = await emitirNotaRemessa(db, l.id, fiscal);
    await rodarTarefasFiscais(db, fila, AGORA);
    await cancelarNotaRemessa(db, l.id, JUSTIFICATIVA, fiscal, AGORA);
    expect((await notaDe(notaFiscalId)).situacao).toBe('CANCELADA');
    expect(await loteDe(l.id)).toMatchObject({ status: 'FECHADO', notaFiscalId: null });

    const segunda = await emitirNotaRemessa(db, l.id, fiscal);
    await rodarTarefasFiscais(db, fila, AGORA);
    expect((await notaDe(segunda.notaFiscalId)).situacao).toBe('AUTORIZADA');
    await db.update(lotes).set({ status: 'ENVIADO', rastreioEnvio: 'BR1' }).where(eq(lotes.id, l.id));
    await expect(cancelarNotaRemessa(db, l.id, JUSTIFICATIVA, fiscal, AGORA)).rejects.toThrow(
      'Só dá para cancelar a NF de Remessa antes de registrar o envio.',
    );
  });

  it('o produto sem custo vira mensagem, não erro técnico', async () => {
    const l = await loteFechado();
    await db.update(produtos).set({ custo: null }).where(eq(produtos.id, l.produtoId));
    await expect(emitirNotaRemessa(db, l.id, fiscal)).rejects.toThrow(/: falta o custo\./);
  });
});
```

Rode: `npm run test:int -- src/modules/lotes/remessa.int.test.ts`
Esperado: FAIL.

- [ ] **Passo 4: Implementar `efeitos-remessa.ts`, `remessa.ts` e ligar a porta**

`efeitos-remessa.ts`:
- `aoAutorizarRemessa`: trava o lote; status ≠ FECHADO → `throw new Error(...)` técnico (não deve acontecer: com NF ativa o lote não muda; a tarefa `nfe.consultar` tenta de novo e, no limite, vai para Falhas); `exigirTransicaoLote({ de: 'FECHADO', para: 'NF_EMITIDA', ator: 'SISTEMA' })`; grava `status`, `notaFiscalId`, `atualizadoEm`; evento `nf_autorizada` (entidade `lote`, `de: 'FECHADO'`, `para: 'NF_EMITIDA'`, `dados: { notaFiscalId }`).
- `aoCancelarRemessa`: trava o lote; status ≠ NF_EMITIDA → `throw new ErroFiscal(\`O envio do lote ${codigo} foi registrado enquanto a NF era cancelada. A NF de Remessa foi cancelada no emissor, mas o sistema não registrou: fale com o contador antes de seguir.\`)` (decisão 13); transição NF_EMITIDA → FECHADO (`SISTEMA`); `status: 'FECHADO'`, `notaFiscalId: null`; evento `nf_cancelada` (`de: 'NF_EMITIDA'`, `para: 'FECHADO'`).

`remessa.ts`:
- `emitirNotaRemessa`: `exigirPodeEmitir(usuario)` (Fase 4); lote (`ErroLotes('Lote não encontrado.')`); status ABERTO → `'Feche o lote antes de emitir a NF de Remessa.'`; status depois de FECHADO → `'O lote já tem NF de Remessa autorizada.'`; `notaAtivaDoLote`: PROCESSANDO → `'O lote já tem NF de Remessa em processamento.'`, REJEITADA → `'O lote tem NF de Remessa rejeitada: use "Corrigir e reenviar".'`; então `solicitarEmissao(db, { tipo: tipoNotaDoLote(lote.tipo), loteId }, usuario)` (a montagem roda lá dentro e recusa com a lista do que falta, sem gravar a nota); evento `nf_solicitada` no lote com `dados: { notaFiscalId }`.
- `reenviarNotaRemessa`: NF ativa REJEITADA (senão `ErroLotes('Só uma NF de Remessa rejeitada pode ser corrigida e reenviada.')`); `reenviarNota(db, nota.id, usuario)`; evento `nf_reenviada` no lote.
- `cancelarNotaRemessa`: status ≠ NF_EMITIDA → a mensagem do teste (decisão 14); `cancelarNota(db, lote.notaFiscalId, justificativa, usuario, agora)` (a Fase 4 confere o prazo de 24 h e a justificativa e chama `portaLotes.aoCancelarRemessa`).

`porta.ts`: `montarNotaRemessa` → `montarNotaRemessa` de `montar-remessa.ts`; `aoAutorizarRemessa` e `aoCancelarRemessa` → `efeitos-remessa.ts`. Agora nenhum método lança "As remessas chegam na Fase 5".

Rode: `npm test -- src/modules/lotes && npm run test:int -- src/modules/lotes src/modules/fiscal`
Esperado: PASS.

- [ ] **Passo 5: Commit**

```bash
git add src/modules/lotes
git commit -m "feat(lotes): NF de Remessa (montagem da spec §8.5, emissão, autorização, reenvio e cancelamento pelo ciclo da Fase 4)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 7: Registrar envio, registrar resultado e FINALIZADO (spec §5.3, §5.4, §6.5)

**Arquivos:**
- Criar: `src/modules/lotes/envio.ts`
- Testes: `src/modules/lotes/envio.int.test.ts`

**Interfaces:**
- Consome: Tarefas 1 e 5 (`obterLote`, `exigirPodeGerirLotes`), `exigirTransicaoItem`.
- Produz: `registrarEnvio(db: Db, loteId: string, rastreio: string, usuario: UsuarioSessao, agora?: Date): Promise<void>`; `type ResultadoUnidade = { itemId: string; resultado: ResultadoFornecedor }`; `registrarResultados(db, loteId, resultados: ResultadoUnidade[], usuario, agora?): Promise<{ registrados: number; finalizado: boolean }>`

- [ ] **Passo 1: Escrever os testes que falham**

`src/modules/lotes/envio.int.test.ts`:

```ts
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { itensDevolucao, lotes } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { listarEventos } from '@/modules/historico/eventos';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { criarDevolucaoComProblemasTeste, criarFornecedorCompletoTeste, criarLoteTeste } from '../../../tests/helpers/fabricas-lotes';
import { registrarEnvio, registrarResultados } from './envio';

const { db, sql } = criarDbTeste();
const AGORA = new Date('2026-11-14T13:00:00Z');
let gestor: UsuarioSessao;
let fiscal: UsuarioSessao;

beforeEach(async () => {
  await limparTabelas(sql);
  gestor = await criarUsuarioTeste(db, 'GESTOR');
  fiscal = await criarUsuarioTeste(db, 'FISCAL');
});
afterAll(async () => {
  await sql.end();
});

async function lote(status: 'FECHADO' | 'NF_EMITIDA' | 'ENVIADO', unidades = 2) {
  const f = await criarFornecedorCompletoTeste(db);
  const dev = await criarDevolucaoComProblemasTeste(db, gestor, { unidades: Array.from({ length: unidades }, () => ({ destino: 'PROBLEMA' as const })) });
  const l = await criarLoteTeste(db, { fornecedorId: f.id, status, itemIds: dev.itens.map((i) => i.id), rastreio: status === 'ENVIADO' ? 'BR1' : null });
  return { ...l, itemIds: dev.itens.map((i) => i.id) };
}
async function statusDosItens(loteId: string) {
  return (await db.select({ status: itensDevolucao.status }).from(itensDevolucao).where(eq(itensDevolucao.loteId, loteId))).map((i) => i.status);
}

describe('registrarEnvio', () => {
  it('NF emitida → Enviado, com o rastreio; as unidades vão para Enviado ao fornecedor', async () => {
    const l = await lote('NF_EMITIDA');
    await registrarEnvio(db, l.id, '  BR123456789BR ', fiscal, AGORA);
    const [linha] = await db.select().from(lotes).where(eq(lotes.id, l.id));
    expect(linha).toMatchObject({ status: 'ENVIADO', rastreioEnvio: 'BR123456789BR', enviadoEm: AGORA });
    expect(await statusDosItens(l.id)).toEqual(['ENVIADO', 'ENVIADO']);
    expect((await listarEventos(db, 'lote', l.id)).at(-1)).toMatchObject({ acao: 'lote_enviado', de: 'NF_EMITIDA', para: 'ENVIADO', dados: { rastreio: 'BR123456789BR' } });
  });

  it('recusa sem rastreio, rastreio longo, antes da NF e o segundo clique', async () => {
    const l = await lote('NF_EMITIDA');
    await expect(registrarEnvio(db, l.id, '   ', fiscal, AGORA)).rejects.toThrow('Informe o código de rastreamento do envio.');
    await expect(registrarEnvio(db, l.id, 'X'.repeat(61), fiscal, AGORA)).rejects.toThrow('O código de rastreamento tem no máximo 60 caracteres.');
    const fechado = await lote('FECHADO');
    await expect(registrarEnvio(db, fechado.id, 'BR1', fiscal, AGORA)).rejects.toThrow('O envio só é registrado depois da NF de Remessa autorizada.');
    await registrarEnvio(db, l.id, 'BR1', fiscal, AGORA);
    await expect(registrarEnvio(db, l.id, 'BR1', fiscal, AGORA)).rejects.toThrow('O envio deste lote já foi registrado.');
    expect((await listarEventos(db, 'lote', l.id)).filter((e) => e.acao === 'lote_enviado')).toHaveLength(1);
  });
});

describe('registrarResultados', () => {
  it('grava o resultado de cada unidade; com a última resolvida, o lote vira Finalizado', async () => {
    const l = await lote('ENVIADO', 2);
    expect(await registrarResultados(db, l.id, [{ itemId: l.itemIds[0], resultado: 'CONSERTADO' }], fiscal, AGORA)).toEqual({ registrados: 1, finalizado: false });
    expect((await db.select().from(lotes).where(eq(lotes.id, l.id)))[0].status).toBe('ENVIADO');
    expect(await registrarResultados(db, l.id, [{ itemId: l.itemIds[1], resultado: 'CREDITO' }], gestor, AGORA)).toEqual({ registrados: 1, finalizado: true });
    const [linha] = await db.select().from(lotes).where(eq(lotes.id, l.id));
    expect(linha).toMatchObject({ status: 'FINALIZADO', finalizadoEm: AGORA });
    const itens = await db.select().from(itensDevolucao).where(eq(itensDevolucao.loteId, l.id));
    expect(itens.map((i) => [i.status, i.resultadoFornecedor]).sort()).toEqual([
      ['RESOLVIDO', 'CONSERTADO'],
      ['RESOLVIDO', 'CREDITO'],
    ]);
    expect((await listarEventos(db, 'lote', l.id)).at(-1)).toMatchObject({ acao: 'lote_finalizado', de: 'ENVIADO', para: 'FINALIZADO', usuarioNome: null });
  });

  it('recusa: nada escolhido, antes do envio, unidade já resolvida (resultado definitivo), unidade de outro lote', async () => {
    const l = await lote('ENVIADO', 2);
    await expect(registrarResultados(db, l.id, [], fiscal, AGORA)).rejects.toThrow('Escolha o resultado de pelo menos uma unidade.');
    const antes = await lote('NF_EMITIDA');
    await expect(registrarResultados(db, antes.id, [{ itemId: antes.itemIds[0], resultado: 'TROCADO' }], fiscal, AGORA)).rejects.toThrow(
      'O resultado só é registrado depois do envio.',
    );
    await registrarResultados(db, l.id, [{ itemId: l.itemIds[0], resultado: 'TROCADO' }], fiscal, AGORA);
    await expect(registrarResultados(db, l.id, [{ itemId: l.itemIds[0], resultado: 'DESCARTADO' }], fiscal, AGORA)).rejects.toThrow(
      'A unidade já tem resultado registrado.',
    );
    await expect(registrarResultados(db, l.id, [{ itemId: antes.itemIds[0], resultado: 'TROCADO' }], fiscal, AGORA)).rejects.toThrow(
      'Uma das unidades não está neste lote.',
    );
  });
});
```

Rode: `npm run test:int -- src/modules/lotes/envio.int.test.ts`
Esperado: FAIL.

- [ ] **Passo 2: Implementar `envio.ts`**

- `registrarEnvio`: `exigirPodeGerirLotes`; `rastreio.trim()`: vazio e mais de `RASTREIO_ENVIO_MAXIMO` → mensagens do teste; transação, lote travado; status ENVIADO ou FINALIZADO → `'O envio deste lote já foi registrado.'`; outro status ≠ NF_EMITIDA → `'O envio só é registrado depois da NF de Remessa autorizada.'`; `exigirTransicaoLote({ de: 'NF_EMITIDA', para: 'ENVIADO', ator: usuario.perfil })`; cada unidade EM_LOTE do lote → ENVIADO (`exigirTransicaoItem` com o perfil; evento `item_status`); lote: `status`, `rastreioEnvio`, `enviadoEm`; evento `lote_enviado` com `dados: { rastreio }`.
- `registrarResultados`: lista vazia → mensagem; transação, lote travado; status ≠ ENVIADO → `'O resultado só é registrado depois do envio.'`; para cada resultado: a unidade travada, com `lote_id = loteId` (senão `'Uma das unidades não está neste lote.'`), status RESOLVIDO → `'A unidade já tem resultado registrado.'` (decisão 9); `exigirTransicaoItem({ de: 'ENVIADO', para: 'RESOLVIDO', ator: perfil })`; grava `status` e `resultadoFornecedor`; eventos `item_status` (item) e `lote_resultado_registrado` (lote, `dados: { itemId, unidade, resultado }`). Depois: se nenhuma unidade do lote está fora de RESOLVIDO → `exigirTransicaoLote({ de: 'ENVIADO', para: 'FINALIZADO', ator: 'SISTEMA' })`, `status: 'FINALIZADO'`, `finalizadoEm: agora`, evento `lote_finalizado` com `usuarioId: null`.

Rode: `npm run test:int -- src/modules/lotes`
Esperado: PASS.

- [ ] **Passo 3: Commit**

```bash
git add src/modules/lotes
git commit -m "feat(lotes): registrar envio (rastreio) e resultado de cada unidade; lote finalizado com todas resolvidas" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 8: Lista consolidada: dados, Excel, PDF e rota de download (spec §6.5)

**Arquivos:**
- Criar: `src/modules/lotes/lista-consolidada.ts`, `src/modules/lotes/xlsx.ts`, `src/modules/lotes/pdf.ts`, `src/app/api/lotes/[codigo]/lista-consolidada/route.ts`
- Modificar: `package.json`, `package-lock.json` (só `npm install pdf-lib@1.17.1 --save-exact`)
- Testes: `src/modules/lotes/lista-consolidada.int.test.ts`, `src/modules/lotes/xlsx.test.ts`, `src/modules/lotes/pdf.test.ts`

**Interfaces:**
- Consome: `obterLotePorCodigo`, `ROTULO_MOTIVO`, `formatarCnpj`, `formatarDataHora`, `zipSync`/`strToU8` (`fflate`), `PDFDocument`/`StandardFonts`/`rgb` (`pdf-lib`).
- Produz:
  - `lista-consolidada.ts`: `COLUNAS_LISTA = ['Devolução', 'Unidade', 'SKU', 'Descrição', 'Nº de série', 'Motivo', 'Observação'] as const`; `type LinhaLista = { devolucao: string; unidade: number; sku: string; descricao: string; serial: string; motivo: string; observacao: string }`; `type ListaConsolidada = { lote: { codigo: string; tipo: string }; fornecedor: { razaoSocial: string; cnpj: string; contatoSac: string; emailSac: string }; nota: { numero: string; serie: string; chave: string; autorizadaEm: string }; geradaEm: string; linhas: LinhaLista[] }`; `cabecalhoDaLista(l): [string, string][]` (rótulo e valor, na ordem); `carregarListaConsolidada(db: DbOuTx, codigo: string, agora: Date): Promise<ListaConsolidada | null>`
  - `xlsx.ts`: `gerarXlsx(nomeAba: string, linhas: (string | number | null)[][]): Uint8Array`; `planilhaDaLista(l: ListaConsolidada): (string | number | null)[][]`
  - `pdf.ts`: `paraWinAnsi(texto: string): string`; `gerarPdfLista(l: ListaConsolidada): Promise<Uint8Array>`
  - rota: `GET /api/lotes/{codigo}/lista-consolidada?formato=pdf|xlsx`

- [ ] **Passo 1: Instalar o pdf-lib**

```bash
cd "/c/Users/JEFFERSON LIMA/devolucoes-wt/fase-5"
npm install pdf-lib@1.17.1 --save-exact
```

Esperado: `"pdf-lib": "1.17.1"` em `dependencies`, sem `^`.

- [ ] **Passo 2: Escrever os testes que falham**

`src/modules/lotes/xlsx.test.ts`:

```ts
import { readSheet } from 'read-excel-file/universal';
import { describe, expect, it } from 'vitest';
import { paraArrayBuffer } from '../../../tests/helpers/xlsx';
import { gerarXlsx } from './xlsx';

describe('gerarXlsx (Excel da lista consolidada)', () => {
  it('o Excel lê de volta os textos, os números e os acentos', async () => {
    const bytes = gerarXlsx('Lista consolidada', [
      ['Fornecedor', 'Peças & Cia <Ltda>'],
      [],
      ['Devolução', 'Unidade', 'Nº de série'],
      ['DEV-000123', 2, 'SN-ÇÃO-1'],
    ]);
    const linhas = await readSheet(paraArrayBuffer(bytes));
    expect(linhas[0]).toEqual(['Fornecedor', 'Peças & Cia <Ltda>']);
    expect(linhas.at(-1)).toEqual(['DEV-000123', 2, 'SN-ÇÃO-1']);
  });

  it('texto que começa com "=" fica texto (nunca vira fórmula) e caractere inválido no XML some', async () => {
    const linhas = await readSheet(paraArrayBuffer(gerarXlsx('Aba', [['=HYPERLINK("x")', 'a\u0001b']])));
    expect(linhas[0]).toEqual(['=HYPERLINK("x")', 'ab']);
  });
});
```

`src/modules/lotes/pdf.test.ts`:

```ts
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import type { ListaConsolidada } from './lista-consolidada';
import { gerarPdfLista, paraWinAnsi } from './pdf';

function lista(linhas: number, observacao = 'Tela trincada'): ListaConsolidada {
  return {
    lote: { codigo: 'LOT-000045', tipo: 'Conserto' },
    fornecedor: { razaoSocial: 'Fornecedor Remessa Ltda', cnpj: '11.222.333/0001-81', contatoSac: 'SAC Teste', emailSac: 'sac@fornecedor.teste' },
    nota: { numero: '123', serie: '1', chave: '35261111222333000181550010000001231123456783', autorizadaEm: '14/11/2026 10:00' },
    geradaEm: '14/11/2026 10:05',
    linhas: Array.from({ length: linhas }, (_, i) => ({
      devolucao: `DEV-${String(i + 1).padStart(6, '0')}`, unidade: 1, sku: 'FONE-01', descricao: 'Fone Bluetooth com nome bem comprido para quebrar a linha da tabela',
      serial: `SN-${i}`, motivo: 'Avariado', observacao,
    })),
  };
}

describe('PDF da lista consolidada', () => {
  it('gera um PDF com título, e quebra a tabela em várias páginas', async () => {
    const bytes = await gerarPdfLista(lista(80));
    expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe('%PDF-');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getTitle()).toBe('Lista consolidada LOT-000045');
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });

  it('caractere fora do WinAnsi vira "?" em vez de erro (decisão 22)', async () => {
    expect(paraWinAnsi('Peça ✓ ok 😀 “aspas”')).toBe('Peça ? ok ? “aspas”');
    await expect(gerarPdfLista(lista(1, 'Caixa amassada 📦'))).resolves.toBeInstanceOf(Uint8Array);
  });
});
```

`src/modules/lotes/lista-consolidada.int.test.ts`:

```ts
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { lotes, notasFiscais } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import {
  criarDevolucaoComProblemasTeste,
  criarFornecedorCompletoTeste,
  criarLoteTeste,
  criarProdutoDoFornecedorTeste,
} from '../../../tests/helpers/fabricas-lotes';
import { carregarListaConsolidada } from './lista-consolidada';

const { db, sql } = criarDbTeste();
const AGORA = new Date('2026-11-14T13:05:00Z');
let gestor: UsuarioSessao;

beforeEach(async () => {
  await limparTabelas(sql);
  gestor = await criarUsuarioTeste(db, 'GESTOR');
});
afterAll(async () => {
  await sql.end();
});

describe('carregarListaConsolidada (spec §6.5)', () => {
  it('fornecedor, NF de remessa, unidades com S/N, motivo e nº da devolução', async () => {
    const f = await criarFornecedorCompletoTeste(db, { razaoSocial: 'Peças Brasil Ltda' });
    const p = await criarProdutoDoFornecedorTeste(db, { cnpjFornecedor: f.cnpj });
    const dev = await criarDevolucaoComProblemasTeste(db, gestor, {
      unidades: [{ destino: 'PROBLEMA', motivo: 'AVARIADO', serial: 'SN-1', produtoId: p.id }, { destino: 'PROBLEMA', motivo: 'COM_DEFEITO', serial: null, produtoId: p.id }],
    });
    const l = await criarLoteTeste(db, { fornecedorId: f.id, status: 'NF_EMITIDA', tipo: 'CONSERTO', itemIds: dev.itens.map((i) => i.id) });
    const [nota] = await db
      .insert(notasFiscais)
      .values({ tipo: 'REMESSA_CONSERTO', loteId: l.id, ambiente: 'HOMOLOGACAO', referenciaEmissor: 'ref1', situacao: 'AUTORIZADA', numero: '123', serie: '1', chave: '35261111222333000181550010000001231123456783', autorizadaEm: new Date('2026-11-14T13:00:00Z') })
      .returning();
    await db.update(lotes).set({ notaFiscalId: nota.id }).where(eq(lotes.id, l.id));

    const lista = await carregarListaConsolidada(db, l.codigo, AGORA);
    expect(lista).toEqual({
      lote: { codigo: l.codigo, tipo: 'Conserto' },
      fornecedor: { razaoSocial: 'Peças Brasil Ltda', cnpj: expect.stringMatching(/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/), contatoSac: 'SAC Teste', emailSac: 'sac@fornecedor.teste' },
      nota: { numero: '123', serie: '1', chave: '35261111222333000181550010000001231123456783', autorizadaEm: '14/11/2026 10:00' },
      geradaEm: '14/11/2026 10:05',
      linhas: [
        { devolucao: dev.codigo, unidade: 1, sku: p.sku, descricao: 'Fone Bluetooth de teste', serial: 'SN-1', motivo: 'Avariado', observacao: '' },
        { devolucao: dev.codigo, unidade: 2, sku: p.sku, descricao: 'Fone Bluetooth de teste', serial: '—', motivo: 'Com defeito', observacao: '' },
      ],
    });
  });

  it('sem NF autorizada não há lista; lote que não existe devolve null', async () => {
    const f = await criarFornecedorCompletoTeste(db);
    const l = await criarLoteTeste(db, { fornecedorId: f.id, status: 'FECHADO' });
    await expect(carregarListaConsolidada(db, l.codigo, AGORA)).rejects.toThrow('A lista consolidada sai depois da NF de Remessa autorizada.');
    expect(await carregarListaConsolidada(db, 'LOT-999999', AGORA)).toBeNull();
  });
});
```

Rode: `npm test -- src/modules/lotes/xlsx.test.ts src/modules/lotes/pdf.test.ts && npm run test:int -- src/modules/lotes/lista-consolidada.int.test.ts`
Esperado: FAIL.

- [ ] **Passo 3: Implementar**

- `carregarListaConsolidada`: lote pelo código (nulo → `null`); `nota_fiscal_id` vazio ou a NF não AUTORIZADA → `ErroLotes('A lista consolidada sai depois da NF de Remessa autorizada.')`; unidades na ordem (código da devolução, unidade); descrição do produto recebido (vazio → a do esperado, → `'—'`); `serial ?? '—'`; `ROTULO_MOTIVO[motivo]`; `observacao ?? ''`; CNPJ com `formatarCnpj`; `contatoSac`/`emailSac` vazios → `'—'`; datas com `formatarDataHora`.
- `cabecalhoDaLista`: `[['Fornecedor', razão], ['CNPJ', cnpj], ['Contato SAC', contato], ['E-mail SAC', email], ['Lote', código], ['Tipo', tipo], ['NF de Remessa', \`${numero} (série ${serie})\`], ['Chave de acesso', chave], ['Autorizada em', data], ['Gerada em', data]]`.
- `xlsx.ts`: o mesmo formato mínimo de `tests/helpers/xlsx.ts` (Content_Types, rels, workbook, uma aba), agora em `src/`: textos sempre como `t="inlineStr"` (nunca fórmula; ver teste), números como `<v>`; `escaparXml` troca `& < > "` e **remove** os caracteres que o XML 1.0 não aceita (`/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g`); referência de coluna A..Z (a lista tem 7 colunas); nome da aba cortado em 31 caracteres. `planilhaDaLista`: cabeçalho (`cabecalhoDaLista`), uma linha vazia, `COLUNAS_LISTA`, e uma linha por unidade (unidade como número).
- `pdf.ts`: `paraWinAnsi` mantém `\n`, os caracteres de U+0020 a U+007E, de U+00A0 a U+00FF e os do WinAnsi entre 0x80 e 0x9F (`€ ‚ ƒ „ … † ‡ ˆ ‰ Š ‹ Œ Ž ‘ ’ “ ” • – — ˜ ™ š › œ ž Ÿ`); o resto vira `?` (um `?` por caractere visível: use `Array.from(texto)` para não partir emoji em dois). `gerarPdfLista`: A4 paisagem (842 × 595), margem 36, Helvetica 9 pt e Helvetica-Bold no título "Lista consolidada" e nos rótulos; `setTitle(\`Lista consolidada ${codigo}\`)`, `setCreator('Gestão de Devoluções')`; bloco do cabeçalho (rótulo: valor) e a tabela com as 7 colunas (larguras fixas: 80, 40, 90, 200, 100, 80, 180), quebra de linha dentro da célula pela largura (`font.widthOfTextAtSize`), cabeçalho da tabela repetido em cada página nova e "Página N de M" no rodapé. Todo texto passa por `paraWinAnsi` antes de `drawText`.
- `route.ts`:

```ts
import { notFound } from 'next/navigation';
import { obterDb } from '@/db';
import { exigirPermissao } from '@/modules/auth/servidor';
import { ehCodigoLote } from '@/modules/lotes/dominio';
import { ErroLotes } from '@/modules/lotes/erros';
import { carregarListaConsolidada } from '@/modules/lotes/lista-consolidada';
import { gerarPdfLista } from '@/modules/lotes/pdf';
import { gerarXlsx, planilhaDaLista } from '@/modules/lotes/xlsx';

export const dynamic = 'force-dynamic';

/** Spec §6.5 "Lista consolidada (PDF e Excel)" para o SAC do fabricante. Fiscal e Gestor. */
export async function GET(request: Request, { params }: { params: Promise<{ codigo: string }> }) {
  await exigirPermissao('gerir_fiscal');
  const { codigo } = await params;
  if (!ehCodigoLote(codigo)) notFound();
  const formato = new URL(request.url).searchParams.get('formato') === 'xlsx' ? 'xlsx' : 'pdf';
  let lista;
  try {
    lista = await carregarListaConsolidada(obterDb(), codigo, new Date());
  } catch (erro) {
    if (erro instanceof ErroLotes) return new Response(null, { status: 303, headers: { location: `/lotes/${codigo}?erro=lista` } });
    throw erro;
  }
  if (!lista) notFound();
  const conteudo = formato === 'xlsx' ? gerarXlsx('Lista consolidada', planilhaDaLista(lista)) : await gerarPdfLista(lista);
  return new Response(new Uint8Array(conteudo), {
    headers: {
      'content-type': formato === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf',
      'content-disposition': `attachment; filename="lista-consolidada-${codigo}.${formato}"`,
      'cache-control': 'no-store',
    },
  });
}
```

(Confira em `node_modules/next/dist/docs/` a assinatura do segundo argumento do Route Handler nesta versão; se for outra, siga a doc.)

Rode: `npm test -- src/modules/lotes && npm run test:int -- src/modules/lotes && npm run typecheck`
Esperado: PASS.

- [ ] **Passo 4: Commit**

```bash
git add package.json package-lock.json src/modules/lotes "src/app/api/lotes"
git commit -m "feat(lotes): lista consolidada em PDF e Excel (fornecedor, NF de remessa, unidades, S/N, motivo, devolução)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 9: Consultas das telas (listas, detalhe do lote, pendências, quadro e Seção Lote)

**Arquivos:**
- Criar: `src/modules/lotes/consultas.ts`
- Testes: `src/modules/lotes/consultas.test.ts` (filtros, puro), `src/modules/lotes/consultas.int.test.ts`

**Interfaces:**
- Consome: Tarefas 1 a 8; `vistaDaNota`, `type VistaNota` (Fase 4, `situacao.ts`); `lerConfiguracao`; `listarEventos`, `rotuloDaAcao`; `formatarDataHora`; `formatarCnpj`; `ParametrosBusca`, `primeiroValor`; `ehUuid`; `SELO_SITUACAO_NOTA`.
- Produz:
  - `type FiltrosLotes = { fornecedorId?: string; status?: StatusLote }`; `lerFiltrosLotes(p: ParametrosBusca): FiltrosLotes`
  - `type CartaoLoteVista = { id: string; codigo: string; fornecedor: string; status: StatusLote; rotuloStatus: string; tom: TomSelo; tipo: string | null; unidades: number; seloNota: { texto: string; tom: TomSelo } | null }`
  - `listarLotes(db: DbOuTx, filtros: FiltrosLotes, opcoes?: { pagina?: number; porPagina?: number; soAtivos?: boolean }): Promise<{ lotes: CartaoLoteVista[]; total: number }>` (ordem: ABERTO, FECHADO, NF_EMITIDA, ENVIADO, FINALIZADO; depois `criado_em` mais novo; 20 por página)
  - `opcoesFornecedoresDosLotes(db): Promise<{ id: string; razaoSocial: string }[]>`
  - `type UnidadeSemFornecedorVista = { itemId: string; devolucaoCodigo: string; unidade: number; sku: string; descricao: string; motivo: string; serial: string; skuSugerido: string }`; `listarSemFornecedor(db): Promise<UnidadeSemFornecedorVista[]>`
  - `type UnidadeLoteVista = { itemId: string; devolucaoCodigo: string; unidade: number; sku: string; descricao: string; serial: string; motivo: string; observacao: string | null; status: StatusItem; rotuloStatus: string; resultado: string | null }`
  - `type DetalheLote = { id; codigo; status: StatusLote; rotuloStatus; tom; tipo: TipoLote | null; rotuloTipo: string | null; fornecedor: { razaoSocial; cnpj; uf: string | null; contatoSac: string | null; emailSac: string | null }; rastreioEnvio: string | null; datas: { criado: string; fechado: string | null; enviado: string | null; finalizado: string | null }; unidades: UnidadeLoteVista[]; nota: VistaNota | null; anteriores: VistaNota[]; editavel: boolean; destinos: { valor: string; rotulo: string }[]; outroAberto: string | null; temLista: boolean; historico: { id: number; texto: string; em: string; quem: string }[] }`; `obterDetalheLote(db, codigo, agora?): Promise<DetalheLote | null>`
  - `resumoLotesQuadro(db): Promise<{ total: number; cartoes: CartaoLoteVista[] }>` (lotes não FINALIZADO, até `CARTOES_POR_COLUNA`)
  - `type UnidadeDaDevolucaoVista = { unidade: number; sku: string; rotuloStatus: string; lote: { codigo: string; rotuloStatus: string; tom: TomSelo } | null; resultado: string | null }`; `unidadesDaDevolucaoNosLotes(db, devolucaoId): Promise<UnidadeDaDevolucaoVista[]>`

- [ ] **Passo 1: Escrever os testes que falham**

`src/modules/lotes/consultas.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { lerFiltrosLotes } from './consultas';

describe('lerFiltrosLotes (spec §6.5: por fornecedor e por status)', () => {
  it('aceita só id de fornecedor e status válidos', () => {
    expect(lerFiltrosLotes({ fornecedor: '0b9f1c2e-3d4a-4b5c-8d6e-7f8091a2b3c4', status: 'FECHADO' })).toEqual({
      fornecedorId: '0b9f1c2e-3d4a-4b5c-8d6e-7f8091a2b3c4',
      status: 'FECHADO',
    });
    expect(lerFiltrosLotes({ fornecedor: "1' or 1=1", status: 'fechado' })).toEqual({});
    expect(lerFiltrosLotes({ fornecedor: ['a', 'b'], status: undefined })).toEqual({});
  });
});
```

`src/modules/lotes/consultas.int.test.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { notasFiscais } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import {
  criarDevolucaoComProblemasTeste,
  criarFornecedorCompletoTeste,
  criarLoteTeste,
  criarProdutoDoFornecedorTeste,
} from '../../../tests/helpers/fabricas-lotes';
import { alocarItensProblema } from './alocacao';
import { listarLotes, listarSemFornecedor, obterDetalheLote, resumoLotesQuadro, unidadesDaDevolucaoNosLotes } from './consultas';

const { db, sql } = criarDbTeste();
const AGORA = new Date('2026-11-14T13:00:00Z');
let gestor: UsuarioSessao;

beforeEach(async () => {
  await limparTabelas(sql);
  gestor = await criarUsuarioTeste(db, 'GESTOR');
});
afterAll(async () => {
  await sql.end();
});

async function loteCom(status: 'ABERTO' | 'FECHADO' | 'FINALIZADO', unidades = 1, fornecedorId?: string) {
  const f = fornecedorId ?? (await criarFornecedorCompletoTeste(db)).id;
  const dev = await criarDevolucaoComProblemasTeste(db, gestor, { unidades: Array.from({ length: unidades }, () => ({ destino: 'PROBLEMA' as const, serial: 'SN-9' })) });
  return { ...(await criarLoteTeste(db, { fornecedorId: f, status, itemIds: dev.itens.map((i) => i.id) })), fornecedorId: f, dev };
}

describe('consultas dos lotes', () => {
  it('lista com filtros, na ordem do fluxo, com o selo da NF rejeitada', async () => {
    const fechado = await loteCom('FECHADO', 2);
    const aberto = await loteCom('ABERTO');
    await loteCom('FINALIZADO');
    await db.insert(notasFiscais).values({ tipo: 'REMESSA_CONSERTO', loteId: fechado.id, ambiente: 'HOMOLOGACAO', referenciaEmissor: randomUUID().replace(/-/g, ''), situacao: 'REJEITADA' });

    const todos = await listarLotes(db, {});
    expect(todos.total).toBe(3);
    expect(todos.lotes.map((l) => l.status)).toEqual(['ABERTO', 'FECHADO', 'FINALIZADO']);
    expect(todos.lotes[1]).toMatchObject({ codigo: fechado.codigo, unidades: 2, rotuloStatus: 'Fechado', tipo: 'Conserto', seloNota: { texto: 'NF rejeitada', tom: 'erro' } });
    expect((await listarLotes(db, { status: 'ABERTO' })).lotes.map((l) => l.id)).toEqual([aberto.id]);
    expect((await listarLotes(db, { fornecedorId: fechado.fornecedorId })).lotes.map((l) => l.id)).toEqual([fechado.id]);
    expect((await resumoLotesQuadro(db)).total).toBe(2);
  });

  it('detalhe: unidades, editável, destinos para mover e o outro lote aberto do fornecedor', async () => {
    const aberto = await loteCom('ABERTO', 2);
    const fechado = await loteCom('FECHADO', 1, aberto.fornecedorId);
    const d = await obterDetalheLote(db, fechado.codigo, AGORA);
    expect(d).toMatchObject({ codigo: fechado.codigo, status: 'FECHADO', editavel: true, outroAberto: aberto.codigo, temLista: false, nota: null });
    expect(d?.unidades[0]).toMatchObject({ devolucaoCodigo: fechado.dev.codigo, unidade: 1, serial: 'SN-9', motivo: 'Avariado', rotuloStatus: 'Em lote' });
    expect(d?.destinos).toEqual([{ valor: aberto.id, rotulo: `${aberto.codigo} (Aberto)` }]);
    expect(await obterDetalheLote(db, 'LOT-999999', AGORA)).toBeNull();
  });

  it('pendência SEM_FORNECEDOR e a visão da devolução', async () => {
    const orfao = await criarProdutoDoFornecedorTeste(db, { cnpjFornecedor: null });
    const dev = await criarDevolucaoComProblemasTeste(db, gestor, { unidades: [{ destino: 'PROBLEMA', motivo: 'USADO', produtoId: orfao.id }] });
    await db.transaction((tx) => alocarItensProblema(tx, dev.id, AGORA));
    expect(await listarSemFornecedor(db)).toEqual([
      expect.objectContaining({ devolucaoCodigo: dev.codigo, unidade: 1, sku: orfao.sku, motivo: 'Usado', skuSugerido: orfao.sku }),
    ]);
    expect(await unidadesDaDevolucaoNosLotes(db, dev.id)).toEqual([{ unidade: 1, sku: orfao.sku, rotuloStatus: 'Sem fornecedor', lote: null, resultado: null }]);
  });
});
```

Rode: `npm test -- src/modules/lotes/consultas.test.ts && npm run test:int -- src/modules/lotes/consultas.int.test.ts`
Esperado: FAIL.

- [ ] **Passo 2: Implementar `consultas.ts`**

- `listarLotes`: `count(itens_devolucao.id)` por lote (left join); ordem `array_position(array['ABERTO','FECHADO','NF_EMITIDA','ENVIADO','FINALIZADO']::status_lote[], lotes.status)`, depois `criado_em desc`; `soAtivos` = status ≠ FINALIZADO. `seloNota`: a NF não cancelada mais nova do lote: PROCESSANDO → `{ texto: SELO_SITUACAO_NOTA.PROCESSANDO, tom: 'destaque' }`, REJEITADA → `{ texto: SELO_SITUACAO_NOTA.REJEITADA, tom: 'erro' }`, senão `null` (o status "NF emitida" já diz).
- `obterDetalheLote`: tudo de uma vez para a página; `editavel = loteEditavel(status, notaAtiva)`; `destinos` = outros lotes do mesmo fornecedor em que `loteEditavel` (rótulo `LOT-x (Status)`), só quando a própria origem é editável; `outroAberto` = código do lote ABERTO do fornecedor quando este não é ele; `temLista` = NF AUTORIZADA ligada (`nota_fiscal_id`); `nota` = `vistaDaNota(notaAtiva, serieConfigurada, agora)`; `anteriores` = NF canceladas (`vistaDaNota`); `historico` = `listarEventos(db, 'lote', id)` com `texto: rotuloDaAcao(acao)`, `em: formatarDataHora`, `quem: usuarioNome ?? 'Sistema'`.
- `listarSemFornecedor`: unidades `SEM_FORNECEDOR` com a devolução; descrição do produto recebido ou esperado; `skuSugerido` = SKU do produto recebido, senão o SKU da unidade.
- `unidadesDaDevolucaoNosLotes`: unidades com status EM_LOTE, ENVIADO, RESOLVIDO ou SEM_FORNECEDOR, em ordem de `unidade`, com o lote (left join).

Rode: `npm test -- src/modules/lotes && npm run test:int -- src/modules/lotes`
Esperado: PASS.

- [ ] **Passo 3: Commit**

```bash
git add src/modules/lotes
git commit -m "feat(lotes): consultas das telas (lista com filtros, detalhe, pendências, quadro e seção da devolução)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 10: Tela "Lotes e Remessas" (lista com filtros e pendência "Sem fornecedor") e etapa 5

**Arquivos:**
- Criar: `src/components/lotes/tipos.ts`, `src/components/lotes/CartaoLote.tsx`, `src/components/lotes/ListaLotes.tsx`, `src/components/lotes/PendenciasSemFornecedor.tsx`, `src/app/(app)/lotes/acoes.ts`, `src/app/(app)/fluxo/etapa/5/page.tsx`, `tests/e2e/apoio-lotes.ts`
- Modificar: `src/app/(app)/lotes/page.tsx` (troca o `EmBreve`), `tests/e2e/devolucoes.spec.ts` (só o trecho que abria `/fluxo/etapa/5` e esperava o aviso provisório)
- Testes: `src/components/lotes/CartaoLote.test.tsx`, `src/components/lotes/ListaLotes.test.tsx`, `tests/e2e/lotes-lista.spec.ts`

**Interfaces:**
- Consome: Tarefa 9 (`listarLotes`, `lerFiltrosLotes`, `opcoesFornecedoresDosLotes`, `listarSemFornecedor`, tipos), Tarefa 4 (`associarProduto`), `Paginacao`, `Selo`, `ListaErros`, `MensagemSucesso`, `useEnvioFormulario`, `estilos.ts`, `lerPagina`, `exigirPermissao`, `pode`, `ETAPAS`.
- Produz:
  - `tipos.ts`: `type EstadoAcaoLote = { erros: string[]; ok: string | null }`, `ESTADO_INICIAL_LOTE`
  - `CartaoLote({ lote, href }: { lote: CartaoLoteVista; href: string })`: um `<a>` (Link) com o código (Plex Mono), o fornecedor, o selo do status, o tipo, "N unidade(s)" e o selo da NF; nome acessível começa com o código
  - `ListaLotes({ titulo, lotes, total, pagina, filtros, fornecedores, acaoFiltro, vazio })`: título com a contagem, o formulário GET de filtros (`Fornecedor`, `Status`, botão "Filtrar"; em uma coluna no celular), os cartões e a `Paginacao`
  - `PendenciasSemFornecedor({ unidades, acao })` ('use client'): `<section aria-labelledby="titulo-sem-fornecedor">` com o título "Sem fornecedor (N)", um cartão por unidade (devolução, unidade, SKU, descrição, motivo, S/N) e o formulário "Associar produto" (campo "SKU do produto recebido (unidade N da DEV-…)", já com o `skuSugerido`; botão "Associar produto"); cada formulário tem a sua caixa de erros (`erros-associar-${itemId}`)
  - `acoes.ts`: `acaoAssociarProduto(itemId: string, anterior: EstadoAcaoLote, dados: FormData): Promise<EstadoAcaoLote>` (`'use server'`; `exigirPermissao('gerir_fiscal')`; `ehUuid`; `associarProduto`; ok = `Unidade incluída no lote ${loteCodigo}.`; `revalidatePath('/lotes')`)
  - `apoio-lotes.ts`: `prepararLote(p?: { status?: StatusLote; unidades?: number; motivo?: MotivoProblemaTeste }): Promise<{ loteId: string; codigo: string; fornecedor: string; devolucaoCodigo: string; sku: string; itemIds: string[] }>`; `prepararSemFornecedor(): Promise<{ devolucaoCodigo: string; skuParaAssociar: string }>` (devolução CONCLUIDA com uma unidade SEM_FORNECEDOR, e um produto com fornecedor no cadastro)

- [ ] **Passo 1: Escrever os testes de componente que falham**

`src/components/lotes/CartaoLote.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CartaoLote } from './CartaoLote';

describe('CartaoLote', () => {
  it('mostra código, fornecedor, status, tipo, unidades e o selo da NF', () => {
    render(
      <CartaoLote
        href="/lotes/LOT-000045"
        lote={{ id: 'l1', codigo: 'LOT-000045', fornecedor: 'Peças Brasil Ltda', status: 'FECHADO', rotuloStatus: 'Fechado', tom: 'atencao', tipo: 'Conserto', unidades: 3, seloNota: { texto: 'NF rejeitada', tom: 'erro' } }}
      />,
    );
    const link = screen.getByRole('link', { name: /^LOT-000045/ });
    expect(link).toHaveAttribute('href', '/lotes/LOT-000045');
    expect(link).toHaveTextContent('Peças Brasil Ltda');
    expect(link).toHaveTextContent('Fechado');
    expect(link).toHaveTextContent('Conserto');
    expect(link).toHaveTextContent('3 unidades');
    expect(link).toHaveTextContent('NF rejeitada');
  });

  it('uma unidade no singular e sem tipo enquanto aberto', () => {
    render(<CartaoLote href="/lotes/LOT-000001" lote={{ id: 'l', codigo: 'LOT-000001', fornecedor: 'F', status: 'ABERTO', rotuloStatus: 'Aberto', tom: 'destaque', tipo: null, unidades: 1, seloNota: null }} />);
    expect(screen.getByRole('link')).toHaveTextContent('1 unidade');
    expect(screen.getByRole('link')).not.toHaveTextContent('unidades');
  });
});
```

`src/components/lotes/ListaLotes.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ListaLotes } from './ListaLotes';

describe('ListaLotes (spec §6.5: filtrável por fornecedor e por status)', () => {
  it('filtros GET com os valores atuais e o aviso de vazio', () => {
    render(
      <ListaLotes
        titulo="Lotes e Remessas"
        lotes={[]}
        total={0}
        pagina={1}
        filtros={{ status: 'FECHADO' }}
        fornecedores={[{ id: 'f1', razaoSocial: 'Peças Brasil Ltda' }]}
        acaoFiltro="/lotes"
        vazio="Nenhum lote encontrado."
      />,
    );
    const form = screen.getByRole('search');
    expect(form).toHaveAttribute('action', '/lotes');
    expect(form).toHaveAttribute('method', 'get');
    expect(screen.getByLabelText('Status')).toHaveValue('FECHADO');
    expect(screen.getByRole('option', { name: 'Peças Brasil Ltda' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filtrar' })).toBeInTheDocument();
    expect(screen.getByText('Nenhum lote encontrado.')).toBeInTheDocument();
  });
});
```

Rode: `npm test -- src/components/lotes`
Esperado: FAIL.

- [ ] **Passo 2: Implementar os componentes**

- `CartaoLote`: `ITEM_LISTA` como base; linha 1: código (`font-mono font-semibold`) e o `Selo` do status; linha 2: fornecedor (`break-words`); linha 3 (`text-xs text-texto-2`): tipo (quando há), "N unidade(s)", e o `Selo` da NF quando há. Alvo de toque inteiro (`min-h-11`).
- `ListaLotes` (componente de servidor): `<h1>` com `titulo`; `<form role="search" method="get" action={acaoFiltro}>` com `<label>Fornecedor</label><select name="fornecedor">` (primeira opção "Todos") e `<label>Status</label><select name="status">` (primeira "Todos" e as 5 de `ROTULO_STATUS_LOTE`), em `grid gap-2 md:grid-cols-[1fr_1fr_auto]`, botão `BOTAO_SECUNDARIO` "Filtrar"; `<ul>` de `CartaoLote` (`grid gap-2 md:grid-cols-2`); `VAZIO` com `vazio`; `Paginacao` (a do projeto) quando `total > 20`. Recebe também `children?: ReactNode`, mostrado entre o título e os filtros (a pendência "Sem fornecedor" entra aí).
- `PendenciasSemFornecedor`: um subcomponente por unidade, cada um com o seu `useEnvioFormulario(acao.bind(null, itemId), ESTADO_INICIAL_LOTE, \`erros-associar-${itemId}\`)`; campo `CAMPO` com `autoCapitalize="characters"`; botão `BOTAO_PRIMARIO w-full sm:w-auto`. Texto de ajuda: "Escolha o produto que chegou de fato. Ele precisa ter fornecedor em Produtos e Fornecedores." com link para `/cadastros/produtos`.

Rode: `npm test -- src/components/lotes`
Esperado: PASS.

- [ ] **Passo 3: Páginas e ação**

`src/app/(app)/lotes/page.tsx` (Fiscal e Gestor; a aba já existe):

```tsx
export const metadata: Metadata = { title: 'Lotes e Remessas · Gestão de Devoluções' };

export default async function PaginaLotes({ searchParams }: { searchParams: Promise<ParametrosBusca> }) {
  await exigirPermissao('gerir_fiscal');
  const parametros = await searchParams;
  const filtros = lerFiltrosLotes(parametros);
  const pagina = lerPagina(parametros);
  const db = obterDb();
  const [{ lotes, total }, fornecedores, semFornecedor] = await Promise.all([
    listarLotes(db, filtros, { pagina }),
    opcoesFornecedoresDosLotes(db),
    listarSemFornecedor(db),
  ]);
  return (
    <ListaLotes titulo="Lotes e Remessas" lotes={lotes} total={total} pagina={pagina} filtros={filtros} fornecedores={fornecedores} acaoFiltro="/lotes" vazio="Nenhum lote encontrado.">
      {semFornecedor.length > 0 && <PendenciasSemFornecedor unidades={semFornecedor} acao={acaoAssociarProduto} />}
    </ListaLotes>
  );
}
```

`src/app/(app)/fluxo/etapa/5/page.tsx` (todos os perfis; título do PDF; só leitura; sem a pendência): `exigirPermissao('ver_listas')`, `LINK_VOLTAR` "← Fluxo", `ListaLotes` com `titulo` = `ETAPAS[4].titulo` ("Agrupamento por Fornecedor (Remessas)"), `acaoFiltro="/fluxo/etapa/5"`, `vazio="Nenhum lote ainda. As unidades com problema entram aqui quando a NF de devolução é autorizada."`. `metadata.title` = `Agrupamento por Fornecedor (Remessas) · Gestão de Devoluções`.

`src/app/(app)/lotes/acoes.ts`: como descrito nas Interfaces; erros de `ErroFiscal` (inclui `ErroLotes`) e `ErroDevolucao` viram `{ erros: [mensagem], ok: null }`; o resto relança.

- [ ] **Passo 4: Escrever o e2e (falha antes do Passo 3, passa depois)**

`tests/e2e/apoio-lotes.ts`: usa `comBanco`, `usuarioPorEmail`, `codigoUnico` (de `./apoio`) e as fábricas da Tarefa 1. `prepararLote` cria fornecedor (`criarFornecedorCompletoTeste`, razão social `codigoUnico('Fornecedor E2E')`), produto (`criarProdutoDoFornecedorTeste` com `sku: codigoUnico('LOTE')`), uma devolução com `unidades` PROBLEMA (`serial: codigoUnico('SN')`) e o lote com o status pedido. `prepararSemFornecedor` cria uma devolução com uma unidade PROBLEMA sem produto recebido, põe a devolução em CONCLUIDA, chama `alocarItensProblema` e cria o produto com fornecedor que o teste vai associar.

`tests/e2e/lotes-lista.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { entrarComo, paginaNaoEncontrada, semRolagemLateral } from './apoio';
import { prepararLote, prepararSemFornecedor } from './apoio-lotes';
import { USUARIOS_E2E } from './dados';

test('Fiscal vê os lotes, filtra por status e associa o produto de uma unidade sem fornecedor', async ({ page }) => {
  const lote = await prepararLote({ status: 'FECHADO', unidades: 2 });
  const pendente = await prepararSemFornecedor();
  await entrarComo(page, USUARIOS_E2E.fiscal);
  await page.goto('/lotes');
  await expect(page.getByRole('heading', { name: 'Lotes e Remessas', level: 1 })).toBeVisible();
  await page.getByLabel('Status').selectOption('FECHADO');
  await page.getByRole('button', { name: 'Filtrar' }).click();
  await expect(page).toHaveURL(/status=FECHADO/);
  const cartao = page.getByRole('link', { name: new RegExp(`^${lote.codigo}`) });
  await expect(cartao).toContainText(lote.fornecedor);
  await expect(cartao).toContainText('2 unidades');
  await semRolagemLateral(page);

  const pendencias = page.getByRole('region', { name: /^Sem fornecedor/ });
  const campo = pendencias.getByLabel(`SKU do produto recebido (unidade 1 da ${pendente.devolucaoCodigo})`);
  await campo.fill(pendente.skuParaAssociar);
  await campo.locator('xpath=ancestor::form').getByRole('button', { name: 'Associar produto' }).click();
  await expect(page.getByRole('status')).toContainText(/Unidade incluída no lote LOT-\d{6}/);
  await semRolagemLateral(page);
});

test('Operador vê a etapa 5 (só leitura) e não abre a aba Lotes e Remessas', async ({ page }) => {
  const lote = await prepararLote();
  await entrarComo(page, USUARIOS_E2E.operador);
  await page.goto('/fluxo/etapa/5');
  await expect(page.getByRole('heading', { name: 'Agrupamento por Fornecedor (Remessas)', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp(`^${lote.codigo}`) })).toBeVisible();
  await expect(page.getByRole('region', { name: /^Sem fornecedor/ })).toHaveCount(0);
  await semRolagemLateral(page);
  await paginaNaoEncontrada(page, '/lotes');
});
```

Em `tests/e2e/devolucoes.spec.ts`, o trecho que abre `/fluxo/etapa/5` esperava "Os lotes por fornecedor aparecem aqui quando a conferência estiver pronta.". A rota estática agora é a lista de lotes: troque **só essa expectativa** por `await expect(page.getByRole('heading', { name: 'Agrupamento por Fornecedor (Remessas)', level: 1 })).toBeVisible();` (o banco do e2e é compartilhado, então não dá para esperar a lista vazia).

Rode: `npm run test:e2e -- tests/e2e/lotes-lista.spec.ts tests/e2e/devolucoes.spec.ts`
Esperado: PASS nos projetos `computador` e `celular`.

- [ ] **Passo 5: Commit**

```bash
git add src/components/lotes "src/app/(app)/lotes" "src/app/(app)/fluxo/etapa/5" tests/e2e/apoio-lotes.ts tests/e2e/lotes-lista.spec.ts tests/e2e/devolucoes.spec.ts
git commit -m "feat(lotes): tela Lotes e Remessas com filtros, pendência Sem fornecedor e a etapa 5 do PDF" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 11: Tela do lote (unidades, fechar, mover, reabrir, NF de Remessa, lista consolidada, envio e resultado)

**Arquivos:**
- Criar: `src/app/(app)/lotes/[codigo]/page.tsx`, `src/app/(app)/lotes/[codigo]/acoes.ts`, `src/components/lotes/BlocosLote.tsx`
- Testes: `src/components/lotes/BlocosLote.test.tsx`, `tests/e2e/lotes-detalhe.spec.ts`, `tests/e2e/lotes-remessa.spec.ts`

**Interfaces:**
- Consome: Tarefas 5 a 9 (`fecharLote`, `reabrirLote`, `moverUnidades`, `emitirNotaRemessa`, `reenviarNotaRemessa`, `cancelarNotaRemessa`, `registrarEnvio`, `registrarResultados`, `obterDetalheLote`, `type DetalheLote`), `AtualizarEnquantoProcessa` (Fase 4), `RodapeFormulario`, `Selo`, `obterArmazenamento` (links de 10 min do XML e do DANFE), `prepararFiscal` (`tests/e2e/apoio-fiscal.ts`).
- Produz:
  - `acoes.ts`: `acaoLote(loteId: string, codigo: string, anterior: EstadoAcaoLote, dados: FormData): Promise<EstadoAcaoLote>`. O campo `operacao` escolhe: `fechar` (`tipo`), `reabrir`, `mover` (`itens` repetido, `destino` = id do lote ou `novo`, `tipoNovo`), `emitir`, `reenviar`, `cancelar` (`justificativa`), `envio` (`rastreio`), `resultado` (campos `resultado-<itemId>`). Confere `ehUuid(loteId)` e `ehCodigoLote(codigo)`; `exigirPermissao('gerir_fiscal')`; `revalidatePath` de `/lotes/${codigo}`, `/lotes`, `/fluxo/etapa/5` e `/fluxo`. Mover que apaga a origem → `redirect(\`/lotes/${destinoCodigo}\`)` **fora** do `try/catch`.
  - `BlocosLote.tsx` ('use client'): `BlocoUnidades`, `BlocoFechar`, `BlocoReabrir`, `BlocoNotaRemessa`, `BlocoListaConsolidada`, `BlocoEnvio`, `BlocoResultado`; cada um recebe `acao: (anterior: EstadoAcaoLote, dados: FormData) => Promise<EstadoAcaoLote>` (a `acaoLote` já ligada) e o que precisa de `DetalheLote`.

Textos e rótulos exatos (os e2e usam):

| Bloco | Quando aparece (e só com `gerir_fiscal`) | Conteúdo |
|---|---|---|
| Cabeçalho | sempre | link "← Lotes e Remessas" (Fiscal/Gestor) ou "← Agrupamento por Fornecedor (Remessas)" (Operador); `<h1>` com o código; selo do status; selo do tipo |
| Dados | sempre | Fornecedor, CNPJ, UF, Contato SAC, E-mail SAC, Rastreio do envio, Criado, Fechado, Enviado, Finalizado |
| Unidades (`region` "Unidades") | sempre | um cartão por unidade: "Unidade N · DEV-…", SKU, descrição, "S/N …", motivo, observação, status, resultado; link "Ver evidências" → `/fluxo/devolucoes/DEV-…#conferencia` (decisão 17). Com `editavel`: caixa "Mover unidade N da DEV-…" em cada cartão e o formulário "Mover unidades" (select "Para onde" com os `destinos` e "Novo lote"; select "Tipo do novo lote"; botão "Mover unidades") |
| Fechar (`region` "Fechar lote") | ABERTO | grupo "Tipo do lote" com 3 rádios (Conserto, Troca, Garantia; nenhum marcado); botão "Fechar lote" no `RodapeFormulario` |
| Reabrir | FECHADO sem NF ativa | botão secundário "Reabrir lote"; com `outroAberto`, em vez do botão, o texto "O fornecedor já tem o lote LOT-x aberto: mova as unidades deste lote para ele." |
| NF de Remessa (`region` "NF de Remessa") | FECHADO em diante | selo da NF (texto da Fase 4: "NF em processamento", "NF autorizada", "NF rejeitada"), "Homologação (sem valor fiscal)", motivo da rejeição, número/série/chave (`data-testid="chave-nf-remessa"`), "Abrir DANFE (PDF)", "Baixar XML"; botões "Emitir NF de Remessa" (FECHADO sem NF ativa), "Corrigir e reenviar" (REJEITADA), e o `<details>` "Cancelar esta NF" (NF_EMITIDA e `podeCancelar`; justificativa "Justificativa (15 a 255 caracteres)"; botão "Cancelar NF"); `AtualizarEnquantoProcessa` enquanto PROCESSANDO |
| Lista consolidada (`region` "Lista consolidada") | `temLista` | links "Baixar PDF" e "Baixar Excel" (`/api/lotes/LOT-…/lista-consolidada?formato=pdf|xlsx`, atributo `download`) e o texto "Para enviar ao SAC do fabricante." |
| Registrar envio (`region` "Registrar envio") | NF_EMITIDA | campo "Código de rastreamento do envio" (`maxLength` 60, `autoCapitalize="characters"`); botão "Registrar envio" no `RodapeFormulario` |
| Registrar resultado (`region` "Registrar resultado") | ENVIADO | um `<select>` por unidade ENVIADO: rótulo "Resultado do fornecedor (unidade N da DEV-…)", primeira opção vazia "Escolha", depois os 5 de `ROTULO_RESULTADO`; aviso "O resultado é definitivo."; botão "Registrar resultado" no `RodapeFormulario` |
| Histórico (extra) | sempre | lista "texto · em · quem" |

Mensagens de sucesso (o `ok` da ação): "Lote fechado.", "Lote reaberto.", "Unidades movidas para LOT-x.", "NF de Remessa enviada à SEFAZ. A resposta chega em alguns segundos.", "NF de Remessa reenviada à SEFAZ.", "NF de Remessa cancelada. O lote voltou para Fechado.", "Envio registrado.", "Resultado registrado." e, quando finaliza, "Resultado registrado. Lote finalizado.". Com `?erro=lista` na URL, a página mostra `ALERTA_ERRO` "A lista consolidada sai depois da NF de Remessa autorizada.".

- [ ] **Passo 1: Escrever o teste de componente que falha**

`src/components/lotes/BlocosLote.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BlocoFechar, BlocoResultado, BlocoUnidades } from './BlocosLote';

const acao = vi.fn(async () => ({ erros: [], ok: null }));
const unidade = {
  itemId: 'i1', devolucaoCodigo: 'DEV-000123', unidade: 2, sku: 'FONE-01', descricao: 'Fone', serial: 'SN-1', motivo: 'Avariado',
  observacao: null, status: 'ENVIADO' as const, rotuloStatus: 'Enviado ao fornecedor', resultado: null,
};

describe('blocos do lote', () => {
  it('Fechar lote: os 3 tipos da spec, nenhum marcado', () => {
    render(<BlocoFechar acao={acao} />);
    const grupo = screen.getByRole('group', { name: 'Tipo do lote' });
    for (const tipo of ['Conserto', 'Troca', 'Garantia']) expect(screen.getByRole('radio', { name: tipo })).not.toBeChecked();
    expect(grupo).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fechar lote' })).toBeInTheDocument();
  });

  it('Unidades: link para as evidências e, editável, a caixa de mover com "Novo lote"', () => {
    render(<BlocoUnidades acao={acao} unidades={[unidade]} editavel destinos={[{ valor: 'l2', rotulo: 'LOT-000046 (Aberto)' }]} />);
    expect(screen.getByRole('link', { name: /Ver evidências/ })).toHaveAttribute('href', '/fluxo/devolucoes/DEV-000123#conferencia');
    expect(screen.getByRole('checkbox', { name: 'Mover unidade 2 da DEV-000123' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Novo lote' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'LOT-000046 (Aberto)' })).toBeInTheDocument();
  });

  it('Registrar resultado: um seletor por unidade com os resultados da spec', () => {
    render(<BlocoResultado acao={acao} unidades={[unidade]} />);
    const seletor = screen.getByLabelText('Resultado do fornecedor (unidade 2 da DEV-000123)');
    expect([...seletor.querySelectorAll('option')].map((o) => o.textContent)).toEqual([
      'Escolha', 'Trocado', 'Consertado', 'Crédito', 'Descartado', 'Devolvido sem solução',
    ]);
  });
});
```

Rode: `npm test -- src/components/lotes/BlocosLote.test.tsx`
Esperado: FAIL.

- [ ] **Passo 2: Implementar `BlocosLote.tsx`, a ação e a página**

Siga o padrão de `src/components/fiscal/BlocosFiscais.tsx` (Fase 4): `useEnvioFormulario` com um `idErros` por bloco (`erros-lote-unidades`, `erros-lote-fechar`, `erros-lote-reabrir`, `erros-lote-nf`, `erros-lote-envio`, `erros-lote-resultado`), um componente `Retorno` (sucesso + erros) por bloco, cada bloco numa `<section aria-labelledby>` com `<h2>` (nomes da tabela acima). No celular as caixas de "mover" ficam dentro de cada cartão (`min-h-11`, a caixa com `size-5`), e o formulário "Mover unidades" usa `form="form-mover"` nos checkboxes para não aninhar formulários. O `RodapeFormulario` só no bloco principal de cada status (Fechar, Registrar envio, Registrar resultado), para nunca haver dois rodapés presos ao mesmo tempo.

`[codigo]/page.tsx`: `exigirPermissao('ver_listas')`; `ehCodigoLote` senão `notFound()`; `obterDetalheLote(obterDb(), codigo)` (nulo → `notFound()`); `podeGerir = pode(usuario.perfil, 'gerir_fiscal')`; links do XML e do DANFE com `obterArmazenamento().urlTemporaria(caminho, 600)` só com a NF AUTORIZADA; blocos de ação só com `podeGerir`; `generateMetadata` com o código.

- [ ] **Passo 3: Escrever os e2e**

`tests/e2e/lotes-detalhe.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { entrarComo, semRolagemLateral } from './apoio';
import { prepararLote } from './apoio-lotes';
import { USUARIOS_E2E } from './dados';

test('Fiscal separa uma unidade num lote novo de Troca, fecha o original como Conserto e reabre', async ({ page }) => {
  const lote = await prepararLote({ unidades: 2 });
  await entrarComo(page, USUARIOS_E2E.fiscal);
  await page.goto(`/lotes/${lote.codigo}`);
  await expect(page.getByRole('heading', { name: lote.codigo, level: 1 })).toBeVisible();
  const unidades = page.getByRole('region', { name: 'Unidades' });
  await expect(unidades.getByRole('link', { name: /Ver evidências/ }).first()).toHaveAttribute('href', `/fluxo/devolucoes/${lote.devolucaoCodigo}#conferencia`);
  await semRolagemLateral(page);

  await unidades.getByRole('checkbox', { name: `Mover unidade 2 da ${lote.devolucaoCodigo}` }).check();
  await unidades.getByLabel('Para onde').selectOption({ label: 'Novo lote' });
  await unidades.getByLabel('Tipo do novo lote').selectOption({ label: 'Troca' });
  await unidades.getByRole('button', { name: 'Mover unidades' }).click();
  await expect(unidades.getByRole('status')).toContainText(/Unidades movidas para LOT-\d{6}\./);

  const fechar = page.getByRole('region', { name: 'Fechar lote' });
  await fechar.getByRole('radio', { name: 'Conserto' }).check();
  await fechar.getByRole('button', { name: 'Fechar lote' }).click();
  await expect(page.getByText('Lote fechado.')).toBeVisible();
  await expect(page.getByText('Fechado', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Emitir NF de Remessa' })).toBeVisible();

  await page.getByRole('button', { name: 'Reabrir lote' }).click();
  await expect(page.getByText('Lote reaberto.')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Fechar lote' })).toBeVisible();
  await semRolagemLateral(page);
});

test('Operador vê o lote sem nenhuma ação', async ({ page }) => {
  const lote = await prepararLote();
  await entrarComo(page, USUARIOS_E2E.operador);
  await page.goto(`/lotes/${lote.codigo}`);
  await expect(page.getByRole('heading', { name: lote.codigo, level: 1 })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Unidades' })).toContainText(lote.sku);
  await expect(page.getByRole('button', { name: /Fechar lote|Mover unidades|Reabrir lote|Emitir NF de Remessa|Registrar/ })).toHaveCount(0);
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Fechar lote' })).toHaveCount(0);
});
```

`tests/e2e/lotes-remessa.spec.ts`:

```ts
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { readSheet } from 'read-excel-file/universal';
import { regrasFiscais } from '../../src/db/schema';
import { paraArrayBuffer } from '../helpers/xlsx';
import { comBanco, entrarComo, semRolagemLateral } from './apoio';
import { prepararFiscal } from './apoio-fiscal';
import { prepararLote } from './apoio-lotes';
import { USUARIOS_E2E } from './dados';

/** O worker do e2e autoriza na 2ª consulta (uns 10 s); a página se atualiza a cada 5 s. */
const AUTORIZACAO = { timeout: 45_000 };

async function emitir(page: Page) {
  const nf = page.getByRole('region', { name: 'NF de Remessa' });
  await nf.getByRole('button', { name: 'Emitir NF de Remessa' }).click();
  return nf;
}

test('Emitir NF de Remessa → autorizada → lista consolidada (PDF e Excel) → envio → resultado → Finalizado', async ({ page }) => {
  test.setTimeout(150_000);
  await prepararFiscal();
  const lote = await prepararLote({ status: 'FECHADO', unidades: 2 });
  await entrarComo(page, USUARIOS_E2E.fiscal);
  await page.goto(`/lotes/${lote.codigo}`);
  const nf = await emitir(page);
  await expect(nf.getByText('NF autorizada', { exact: true })).toBeVisible(AUTORIZACAO);
  await expect(nf.getByTestId('chave-nf-remessa')).toHaveText(/^\d{44}$/);
  await expect(page.getByText('NF emitida', { exact: true }).first()).toBeVisible();
  await semRolagemLateral(page);

  const lista = page.getByRole('region', { name: 'Lista consolidada' });
  const pdf = page.waitForEvent('download');
  await lista.getByRole('link', { name: 'Baixar PDF' }).click();
  expect(readFileSync(await (await pdf).path()).subarray(0, 5).toString()).toBe('%PDF-');
  const excel = page.waitForEvent('download');
  await lista.getByRole('link', { name: 'Baixar Excel' }).click();
  const arquivo = await excel;
  expect(arquivo.suggestedFilename()).toBe(`lista-consolidada-${lote.codigo}.xlsx`);
  const linhas = (await readSheet(paraArrayBuffer(new Uint8Array(readFileSync(await arquivo.path()))))).flat().map(String);
  expect(linhas).toContain(lote.fornecedor);
  expect(linhas).toContain(lote.devolucaoCodigo);
  expect(linhas).toContain('Avariado');

  const envio = page.getByRole('region', { name: 'Registrar envio' });
  await envio.getByLabel('Código de rastreamento do envio').fill('BR123456789BR');
  await envio.getByRole('button', { name: 'Registrar envio' }).click();
  await expect(page.getByText('Envio registrado.')).toBeVisible();

  const resultado = page.getByRole('region', { name: 'Registrar resultado' });
  await resultado.getByLabel(`Resultado do fornecedor (unidade 1 da ${lote.devolucaoCodigo})`).selectOption({ label: 'Consertado' });
  await resultado.getByLabel(`Resultado do fornecedor (unidade 2 da ${lote.devolucaoCodigo})`).selectOption({ label: 'Crédito' });
  await resultado.getByRole('button', { name: 'Registrar resultado' }).click();
  await expect(page.getByText('Resultado registrado. Lote finalizado.')).toBeVisible();
  await expect(page.getByText('Finalizado', { exact: true }).first()).toBeVisible();
  await semRolagemLateral(page);
});

test('NF de Remessa rejeitada: corrigir a regra e reenviar; depois cancelar volta o lote para Fechado', async ({ page }) => {
  test.setTimeout(150_000);
  await prepararFiscal();
  await comBanco((db) => db.update(regrasFiscais).set({ naturezaOperacao: 'Remessa para conserto REJEITAR' }).where(eq(regrasFiscais.tipoNota, 'REMESSA_CONSERTO')));
  try {
    const lote = await prepararLote({ status: 'FECHADO' });
    await entrarComo(page, USUARIOS_E2E.gestor);
    await page.goto(`/lotes/${lote.codigo}`);
    const nf = await emitir(page);
    await expect(nf.getByText('NF rejeitada', { exact: true })).toBeVisible(AUTORIZACAO);
    await expect(nf.getByText(/Rejeição simulada/)).toBeVisible();

    await comBanco((db) => db.update(regrasFiscais).set({ naturezaOperacao: 'Remessa para conserto' }).where(eq(regrasFiscais.tipoNota, 'REMESSA_CONSERTO')));
    await nf.getByRole('button', { name: 'Corrigir e reenviar' }).click();
    await expect(nf.getByText('NF autorizada', { exact: true })).toBeVisible(AUTORIZACAO);

    await nf.getByText('Cancelar esta NF').click();
    await nf.getByLabel('Justificativa (15 a 255 caracteres)').fill('Remessa emitida para o fornecedor errado');
    await nf.getByRole('button', { name: 'Cancelar NF' }).click();
    await expect(page.getByText('NF de Remessa cancelada. O lote voltou para Fechado.')).toBeVisible();
    await expect(nf.getByRole('button', { name: 'Emitir NF de Remessa' })).toBeVisible();
  } finally {
    await prepararFiscal();
  }
});
```

Rode: `npm test -- src/components/lotes && npm run test:e2e -- tests/e2e/lotes-detalhe.spec.ts tests/e2e/lotes-remessa.spec.ts`
Esperado: PASS nos projetos `computador` e `celular`.

- [ ] **Passo 4: Commit**

```bash
git add src/components/lotes "src/app/(app)/lotes" tests/e2e/lotes-detalhe.spec.ts tests/e2e/lotes-remessa.spec.ts
git commit -m "feat(lotes): tela do lote (mover, fechar, reabrir, NF de Remessa, lista consolidada, registrar envio e resultado)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 12: Coluna 5 do quadro (lotes por fornecedor) e Seção Lote no detalhe da devolução

**Arquivos:**
- Modificar: `src/modules/devolucoes/quadro.ts`, `src/components/QuadroFluxo.tsx`, `src/components/EtapasCelular.tsx`, `src/app/(app)/fluxo/page.tsx`, `src/app/(app)/fluxo/devolucoes/[codigo]/secoes/SecaoLote.tsx`
- Testes: `src/components/QuadroFluxo.test.tsx` e `src/components/EtapasCelular.test.tsx` (casos novos), `tests/e2e/lotes-quadro.spec.ts`, `tests/e2e/fluxo.spec.ts` (só as duas expectativas do aviso provisório da coluna 5)

**Interfaces:**
- Consome: `resumoLotesQuadro`, `unidadesDaDevolucaoNosLotes` (Tarefa 9), `CartaoLote` (Tarefa 10), `type PropsSecao` (`secoes/tipos.ts`).
- Produz:
  - `ColunaFluxo` (em `QuadroFluxo.tsx`) ganha `conteudo?: ReactNode` (quando existe, substitui os cartões de devolução e o aviso de vazio) e `unidade?: { singular: string; plural: string }`; `rotuloTotal(total: number, unidade?: { singular: string; plural: string }): string` (padrão devolução/devoluções).
  - `ColunaQuadro` (em `quadro.ts`) ganha `lotes?: CartaoLoteVista[]`; `montarQuadro` preenche a coluna 5 com `resumoLotesQuadro` (total = lotes não finalizados; decisão 15).
  - `SecaoLote`: `<section aria-labelledby="titulo-lote">` com `<h2>` "Lote", uma linha por unidade de `unidadesDaDevolucaoNosLotes`: "Unidade N · SKU", status do item, link com o código do lote e o selo do status do lote (ou "Sem fornecedor" com o link "Resolver em Lotes e Remessas" para quem tem `gerir_fiscal`), e o resultado. Devolve `null` quando a lista é vazia.

- [ ] **Passo 1: Escrever os testes que falham**

Acrescente em `src/components/QuadroFluxo.test.tsx`:

```tsx
it('coluna com conteúdo próprio e outra unidade de contagem (coluna 5: lotes)', () => {
  render(
    <QuadroFluxo
      colunas={[{ numero: 5, titulo: 'Agrupamento por Fornecedor (Remessas)', total: 2, unidade: { singular: 'lote', plural: 'lotes' }, conteudo: <p>cartões dos lotes</p>, href: '/fluxo/etapa/5' }]}
    />,
  );
  expect(screen.getByText('cartões dos lotes')).toBeInTheDocument();
  expect(screen.getByText('2 lotes')).toBeInTheDocument();
  expect(screen.queryByText('Nenhuma devolução nesta etapa.')).not.toBeInTheDocument();
});
```

Acrescente em `src/components/EtapasCelular.test.tsx`:

```tsx
it('etapa 5 no celular: conteúdo da coluna e contagem em lotes', () => {
  render(
    <EtapasCelular
      selecionada={5}
      colunas={[{ numero: 5, titulo: 'Agrupamento por Fornecedor (Remessas)', total: 1, unidade: { singular: 'lote', plural: 'lotes' }, conteudo: <p>cartão do lote</p> }]}
    />,
  );
  expect(screen.getByText('cartão do lote')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Agrupamento por Fornecedor (Remessas): 1 lote' })).toBeInTheDocument();
});
```

`tests/e2e/lotes-quadro.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { ehCelular, entrarComo, semRolagemLateral } from './apoio';
import { prepararLote } from './apoio-lotes';
import { USUARIOS_E2E } from './dados';

test('a coluna 5 do quadro mostra os lotes por fornecedor e a devolução mostra o seu lote', async ({ page }, testInfo) => {
  const lote = await prepararLote({ unidades: 1 });
  await entrarComo(page, USUARIOS_E2E.fiscal);
  await page.goto(ehCelular(testInfo) ? '/fluxo?etapa=5' : '/fluxo');
  const cartao = page.getByRole('link', { name: new RegExp(`^${lote.codigo}`) }).first();
  await expect(cartao).toContainText(lote.fornecedor);
  await semRolagemLateral(page);
  await cartao.click();
  await expect(page.getByRole('heading', { name: lote.codigo, level: 1 })).toBeVisible();

  await page.goto(`/fluxo/devolucoes/${lote.devolucaoCodigo}`);
  const secao = page.getByRole('region', { name: 'Lote' });
  await expect(secao.getByRole('link', { name: new RegExp(lote.codigo) })).toHaveAttribute('href', `/lotes/${lote.codigo}`);
  await expect(secao).toContainText('Em lote');
  await semRolagemLateral(page);
});
```

Rode: `npm test -- src/components/QuadroFluxo.test.tsx src/components/EtapasCelular.test.tsx`
Esperado: FAIL.

- [ ] **Passo 2: Implementar**

- `QuadroFluxo.tsx` e `EtapasCelular.tsx`: com `coluna.conteudo`, mostre-o no lugar da lista de `CartaoDevolucao` e do aviso de vazio; use `rotuloTotal(c.total, c.unidade)` no texto do leitor de tela e nos links "+ N…" / "Ver todas as N…". Nada mais muda nesses dois arquivos (as outras colunas ficam idênticas: confira com os testes que já existem).
- `quadro.ts`: na coluna 5, `{ ...coluna, total: resumo.total, cartoes: [], lotes: resumo.cartoes }`.
- `fluxo/page.tsx`: a coluna 5 vira `{ ...c, unidade: { singular: 'lote', plural: 'lotes' }, conteudo: <ul className="flex flex-col gap-2">{c.lotes.map(l => <li key={l.id}><CartaoLote lote={l} href={\`/lotes/${l.codigo}\`} /></li>)}</ul> }` quando há lotes, ou o texto `VAZIO` "Nenhum lote em andamento." quando não há; o `href` da coluna fica `/fluxo/etapa/5`. Tire o uso de `NOTA_ETAPA_LOTES` desta página (a constante continua em `quadro.ts`: a página congelada `[numero]` ainda a importa).
- `SecaoLote.tsx`: como nas Interfaces; componente de servidor assíncrono (`obterDb()`); link do lote `href={\`/lotes/${codigo}\`}` com o texto do código em Plex Mono.

- `tests/e2e/fluxo.spec.ts`: as duas expectativas do texto "Os lotes por fornecedor aparecem aqui…" (no celular, depois de tocar a etapa 5; no computador, na região "Agrupamento por Fornecedor") passam a ser `toContainText(/LOT-\d{6}|Nenhum lote em andamento\./)` na mesma região (o banco do e2e é compartilhado: pode haver lotes de outros specs). O resto do arquivo não muda.

Rode: `npm test && npm run test:e2e -- tests/e2e/lotes-quadro.spec.ts tests/e2e/fluxo.spec.ts`
Esperado: PASS.

- [ ] **Passo 3: Commit**

```bash
git add src/modules/devolucoes/quadro.ts src/components/QuadroFluxo.tsx src/components/QuadroFluxo.test.tsx src/components/EtapasCelular.tsx src/components/EtapasCelular.test.tsx "src/app/(app)/fluxo/page.tsx" "src/app/(app)/fluxo/devolucoes/[codigo]/secoes/SecaoLote.tsx" tests/e2e/lotes-quadro.spec.ts tests/e2e/fluxo.spec.ts
git commit -m "feat(lotes): coluna 5 do quadro com os lotes por fornecedor e Seção Lote no detalhe da devolução" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 13: E2E completo da spec §12 (recebimento → conferência → NF → lote → lista consolidada → envio → resultado)

**Arquivos:**
- Criar: `tests/e2e/integracao-remessas.spec.ts`

**Interfaces:**
- Consome: `conferirDevolucao(page, codigo, unidades)` (Fase 2, `tests/e2e/apoio-conferencia.ts`; contrato §10, E11), `EAN_TESTE`, `prepararFiscal` (Fase 4), `xmlNotaVendaTeste`, `EMPRESA_TESTE`, `criarDevolucaoTeste`, fábricas da Fase 5.
- Produz: o teste ponta a ponta da spec §12 e do contrato §7 ("Fase 5"), nos dois projetos.

- [ ] **Passo 1: Escrever o teste**

`tests/e2e/integracao-remessas.spec.ts`:

```ts
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { readSheet } from 'read-excel-file/universal';
import { criarDevolucaoTeste } from '../helpers/fabricas';
import { EMPRESA_TESTE } from '../helpers/fabricas-fiscal';
import { criarFornecedorCompletoTeste, criarProdutoDoFornecedorTeste } from '../helpers/fabricas-lotes';
import { paraArrayBuffer } from '../helpers/xlsx';
import { xmlNotaVendaTeste } from '../helpers/xml-nfe';
import { codigoUnico, comBanco, entrarComo, semRolagemLateral, usuarioPorEmail } from './apoio';
import { conferirDevolucao, EAN_TESTE } from './apoio-conferencia';
import { prepararFiscal } from './apoio-fiscal';
import { USUARIOS_E2E } from './dados';

const AUTORIZACAO = { timeout: 45_000 };

test('spec §12: recebimento → conferência → NF de devolução → lote → NF de Remessa → lista consolidada → envio → resultado → Finalizado', async ({ page }) => {
  test.setTimeout(360_000);
  await prepararFiscal();
  const sku = codigoUnico('REM');
  const rastreio = codigoUnico('REMR');
  const { dev, fornecedor } = await comBanco(async (db) => {
    const f = await criarFornecedorCompletoTeste(db, { razaoSocial: codigoUnico('Fornecedor Integracao') });
    await criarProdutoDoFornecedorTeste(db, { cnpjFornecedor: f.cnpj, sku, ean: EAN_TESTE });
    const operador = await usuarioPorEmail(db, USUARIOS_E2E.operador.email);
    return { dev: await criarDevolucaoTeste(db, operador, { rastreio, itens: [{ sku, quantidade: 2 }] }), fornecedor: f };
  });

  // Etapa 2: chegada pela tela de Recebimento.
  await entrarComo(page, USUARIOS_E2E.operador);
  await page.goto('/fluxo/recebimento');
  const campo = page.getByLabel('Código de Rastreamento');
  await campo.fill(rastreio);
  await campo.press('Enter');
  await expect(page.getByRole('status')).toContainText('Chegada registrada');

  // Etapa 3: conferência pela tela (Fotos 1 a 4 e Vídeo de Prova): unidade 1 Bom, unidade 2 Problema (Avariado).
  await conferirDevolucao(page, dev.codigo, ['BOM', { problema: 'AVARIADO' }]);

  // Etapa 4: NF de venda anexada e NF de devolução autorizada (emissor falso).
  await page.context().clearCookies();
  await entrarComo(page, USUARIOS_E2E.fiscal);
  await page.goto(`/fluxo/devolucoes/${dev.codigo}`);
  const fiscal = page.getByRole('region', { name: 'Fiscal' });
  const { xml } = xmlNotaVendaTeste({ cnpjEmitente: EMPRESA_TESTE.cnpj, itens: [{ codigo: sku, quantidade: 2, valorUnitario: 60 }] });
  await fiscal.getByLabel('Arquivo XML da NF de venda').setInputFiles({ name: 'venda.xml', mimeType: 'application/xml', buffer: Buffer.from(xml) });
  await fiscal.getByRole('button', { name: 'Anexar XML' }).click();
  await expect(fiscal.getByText('NF de venda anexada.')).toBeVisible();
  await fiscal.getByRole('button', { name: 'Emitir NF de devolução' }).click();
  await expect(fiscal.getByText('NF autorizada', { exact: true })).toBeVisible(AUTORIZACAO);

  // Etapa 5: a unidade com problema entrou sozinha no lote ABERTO do fornecedor.
  await page.reload();
  const secaoLote = page.getByRole('region', { name: 'Lote' });
  const linkLote = secaoLote.getByRole('link', { name: /LOT-\d{6}/ });
  const codigoLote = ((await linkLote.textContent()) ?? '').match(/LOT-\d{6,}/)?.[0] ?? '';
  expect(codigoLote).not.toBe('');
  await linkLote.click();
  await expect(page.getByRole('heading', { name: codigoLote, level: 1 })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Unidades' })).toContainText('Avariado');
  await semRolagemLateral(page);

  // Fechar lote → Emitir NF de Remessa.
  const fechar = page.getByRole('region', { name: 'Fechar lote' });
  await fechar.getByRole('radio', { name: 'Conserto' }).check();
  await fechar.getByRole('button', { name: 'Fechar lote' }).click();
  await expect(page.getByText('Lote fechado.')).toBeVisible();
  const nf = page.getByRole('region', { name: 'NF de Remessa' });
  await nf.getByRole('button', { name: 'Emitir NF de Remessa' }).click();
  await expect(nf.getByText('NF autorizada', { exact: true })).toBeVisible(AUTORIZACAO);

  // Lista consolidada (Excel): fornecedor, devolução e motivo.
  const download = page.waitForEvent('download');
  await page.getByRole('region', { name: 'Lista consolidada' }).getByRole('link', { name: 'Baixar Excel' }).click();
  const celulas = (await readSheet(paraArrayBuffer(new Uint8Array(readFileSync(await (await download).path()))))).flat().map(String);
  expect(celulas).toEqual(expect.arrayContaining([fornecedor.razaoSocial, dev.codigo, 'Avariado', codigoLote]));

  // Registrar envio → Registrar resultado → Finalizado.
  await page.getByLabel('Código de rastreamento do envio').fill('BR987654321BR');
  await page.getByRole('button', { name: 'Registrar envio' }).click();
  await expect(page.getByText('Envio registrado.')).toBeVisible();
  await page.getByLabel(`Resultado do fornecedor (unidade 2 da ${dev.codigo})`).selectOption({ label: 'Consertado' });
  await page.getByRole('button', { name: 'Registrar resultado' }).click();
  await expect(page.getByText('Resultado registrado. Lote finalizado.')).toBeVisible();

  // A devolução mostra o resultado; o lote finalizado sai da coluna 5.
  await page.goto(`/fluxo/devolucoes/${dev.codigo}`);
  await expect(page.getByRole('region', { name: 'Lote' })).toContainText('Consertado');
  await page.goto('/fluxo?etapa=5');
  await expect(page.getByRole('link', { name: new RegExp(`^${codigoLote}`) })).toHaveCount(0);
  await semRolagemLateral(page);
});
```

Se a Fase 2 deixar a conferência exigir algo que este roteiro não preenche, ajuste **só o teste** (é dado de teste); não mude código da Fase 2. Se `conferirDevolucao` não estiver no `main`, conclua pelo serviço como o e2e de integração da Fase 4 (`iniciarConferencia` + evidências PRONTA + `concluirConferencia`).

- [ ] **Passo 2: Rodar**

Rode: `npm run test:e2e -- tests/e2e/integracao-remessas.spec.ts`
Esperado: PASS nos projetos `computador` e `celular`.

- [ ] **Passo 3: Commit**

```bash
git add tests/e2e/integracao-remessas.spec.ts
git commit -m "test(lotes): e2e da spec §12, do recebimento ao lote finalizado com a lista consolidada" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 14: Integração (contrato §7)

Feita na worktree da Fase 5. Como a fase não é paralela, o `main` só muda se alguém juntou outra coisa (ex.: uma emenda, ou partes da Fase 6 que não leem nada novo; contrato §1).

**Arquivos:**
- Regenerados: `drizzle/` (uma migração só, `fase5_remessas`), `package.json` e `package-lock.json` (os do `main` mais `pdf-lib@1.17.1`)
- Nenhum arquivo congelado muda nesta tarefa.

**Interfaces:**
- Produz: a branch `fase-5-remessas` pronta para `git merge --no-ff` no `main`, com a suíte inteira passando.

- [ ] **Passo 1: Trazer o `main` e resolver os conflitos pelas regras do contrato §3**

```bash
cd "/c/Users/JEFFERSON LIMA/devolucoes-wt/fase-5"
git fetch -q origin && git merge origin/main
```

Conflito em `package.json` ou `package-lock.json`: **nunca** junte à mão.

```bash
git checkout origin/main -- package.json package-lock.json
npm install pdf-lib@1.17.1 --save-exact
git add package.json package-lock.json
```

Confira que nenhum arquivo congelado mudou em relação ao `main`:

```bash
git diff origin/main --stat -- src/lib/env.ts .env.example .env.producao.example src/db/schema/index.ts \
  src/modules/devolucoes/dominio.ts src/modules/devolucoes/transicoes.ts src/modules/devolucoes/transicoes-item.ts \
  src/modules/auth/permissoes.ts src/components/NavAbas.tsx src/components/Selo.tsx "src/app/(app)/fluxo/devolucoes/[codigo]/page.tsx" \
  src/modules/devolucoes/detalhe.ts "src/app/(app)/fluxo/etapa/[numero]/page.tsx" src/modules/fila/tarefas.ts src/modules/fiscal src/conectores \
  tests/e2e/global-setup.ts tests/e2e/apoio.ts tests/e2e/dados.ts tests/helpers/fabricas.ts tests/helpers/fabricas-fiscal.ts \
  Dockerfile docker-compose.prod.yml README.md
```

Esperado: só `src/modules/fiscal/emissao.int.test.ts` (Tarefa 2). Qualquer outra linha é um erro: volte o arquivo ao do `main`.

- [ ] **Passo 2: Migração única da fase**

```bash
git rm -rq drizzle && git checkout origin/main -- drizzle
npm run db:gerar -- --name fase5_remessas
```

Esperado: um arquivo novo `drizzle/<n>_fase5_remessas.sql` só com os enums `tipo_lote`, `status_lote` e `resultado_fornecedor`, a tabela `lotes`, as colunas `lote_id` e `resultado_fornecedor` de `itens_devolucao` (índice e 2 CHECK) e a FK de `notas_fiscais.lote_id`. Esta fase não tem SQL escrito à mão (`src/db/sql-manual/fase5.sql` não existe).

- [ ] **Passo 3: Recriar os bancos da fase e migrar**

```bash
PG="/c/Program Files/PostgreSQL/18/bin"; export PGPASSWORD="$(cat "/c/Users/JEFFERSON LIMA/.postgres-superusuario.txt")"
"$PG/dropdb.exe" -h localhost -p 5433 -U postgres --if-exists devolucoes_test_f5 && "$PG/createdb.exe" -h localhost -p 5433 -U postgres -O devolucoes devolucoes_test_f5
"$PG/dropdb.exe" -h localhost -p 5433 -U postgres --if-exists devolucoes_f5 && "$PG/createdb.exe" -h localhost -p 5433 -U postgres -O devolucoes devolucoes_f5
npm run db:migrar
```

Esperado: todas as migrações aplicadas sem erro.

- [ ] **Passo 4: Rodar tudo**

```bash
npm run typecheck && npm run lint && npm test && npm run test:int && npm run build:scripts && npm run test:e2e
```

Esperado: tudo PASS, nos projetos `computador` e `celular`, inclusive os specs das Fases 0 a 4 e o `integracao-remessas.spec.ts`.

- [ ] **Passo 5: Commit**

```bash
git add -A
git commit -m "chore: integração da Fase 5 com o main (migração fase5_remessas e lockfile refeito)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Depois disso, quem integra faz no `main` (contrato §7): `git merge --no-ff fase-5-remessas`, recria o `devolucoes_test`, roda a suíte inteira, `npm run db:migrar` no banco `devolucoes`, apaga a worktree e os bancos `_f5`, e atualiza o README e o `andamento.md`. Push e deploy ficam com o usuário.

---

## Depois da fase (controlador e usuário)

**Pontos que o contador valida antes da produção (spec §8.5, §16):**
1. A base de valor da NF de remessa (hoje o `custo` do produto; decisão 6) e se a remessa leva destaque de ICMS em algum caso.
2. CFOP da remessa para conserto (5915/6915) e, principalmente, de troca e garantia (5949/6949 sugeridos; ou 5202/6202).
3. CSOSN 400 (Simples) ou CST 41 (Presumido e Real) no ICMS e CST 49 no PIS e no COFINS da remessa.
4. Indicador de IE 9 com consumidor final para fornecedor sem IE (decisão 6).
5. O texto das informações complementares (modelo com `{lote}` e `{seriais}`).
6. O retorno do conserto (NF de entrada do fornecedor) fica fora deste sistema: o resultado "Consertado" só registra o desfecho.

**Ligação das contas reais (contrato §9):** emitir uma NF de remessa de teste em homologação pela Focus NFe, conferir que o payload sem `notas_referenciadas` e com `finalidade_emissao` 1 é aceito, baixar a lista consolidada desse lote e mandar ao contador junto com o DANFE.
