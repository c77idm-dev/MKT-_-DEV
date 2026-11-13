# Fase 4 (Fiscal): Plano de Implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar este plano tarefa por tarefa. Os passos usam checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** configurar os dados fiscais da empresa, o ambiente da Focus NFe e as regras fiscais; emitir, acompanhar, reenviar e cancelar a NF de devolução de venda (com a NF de venda do Mercado Livre ou anexada); mostrar a etapa 4 do PDF ("Destinação Fiscal e Estoque") com as abas **Estoque Bom** e **Estoque Problema**; baixar o ZIP dos XMLs do período e o DANFE. Critério de pronto da spec §14: "NF de devolução autorizada em homologação". Neste plano o critério é cumprido com o emissor **falso**; a NF real em homologação fica para a etapa "Ligação das contas reais" (contrato §9).

**Arquitetura:**
- A regra fiscal fica em `src/modules/fiscal/` (funções puras com teste unitário; o que grava no banco com teste de integração). O emissor fica atrás da interface `EmissorNFe` (`src/conectores/nfe/`): o núcleo nunca chama a Focus direto (spec §4.3). O falso mora em `src/` e o e2e roda o servidor e o worker de verdade.
- Emissão assíncrona pela fila da Parte A: `solicitarEmissao` valida tudo, grava a nota em PROCESSANDO e envia `nfe.emitir`; o worker envia, consulta logo em seguida e reagenda `nfe.consultar` com espera crescente (D12). A autorização aplica os efeitos numa transação (itens BOM → DISPONIVEL_VENDA, porta de lotes, devolução → CONCLUIDA).
- Telas mobile-first (390×844 primeiro): cartões, formulários de uma coluna com rodapé fixo, erros que recebem o foco.

**Tecnologias:** Next.js 16.4.6 (App Router), React 19.3, TypeScript strict, Drizzle ORM 0.45 + postgres.js, PostgreSQL 17, zod 4, Tailwind v4, Vitest 5, Testing Library, Playwright. Da Parte A: pg-boss (fila), armazenamento (disco e memória). Já instalada: `fflate` 0.8.2 (ZIP). **Nova:** `fast-xml-parser@5.11.2` (leitura do XML da NF de venda).

**Spec:** [docs/superpowers/specs/2026-11-11-gestao-devolucoes-design.md](../specs/2026-11-11-gestao-devolucoes-design.md). Leia §5 (status), §6.4, §6.9, §8 inteiro, §10, §12 e §14.
**Contrato (obrigatório, vale mais que este plano):** [2026-11-12-contrato-fases-2-6.md](2026-11-12-contrato-fases-2-6.md): §3 (dono de cada arquivo), §4.3 e §4.4 (modelo), §5.1, §5.6, §5.7, §5.8 (interfaces), §6 (testes), §7 (integração), §8 (D11 a D17).
**Pesquisa:** [docs/pesquisas/focus-nfe.md](../../pesquisas/focus-nfe.md) (campos da Focus NFe).

## Restrições globais

**Onde trabalhar**
- Worktree `C:/Users/idmpc/devolucoes-wt/fase-4`, branch `fase-4-fiscal`, criada do `main` que **já tem a Parte A da Fase 2** (fila, worker, armazenamento, `configuracoes`, colunas `destino`/`motivo`, esqueletos de tela, variáveis de ambiente). Não recrie nada da Parte A: consuma.
- `.env` da worktree (contrato §6): `DATABASE_URL=.../devolucoes_f4`, `DATABASE_URL_TEST=.../devolucoes_test_f4`, `PORTA_E2E=3104`, `EMISSOR_NFE=falso`. `next dev` na porta 3004 (`npm run dev -- --port 3004`).
- Windows com Git Bash. O caminho tem espaço e "ç" no `main`; a worktree não, mas **use aspas sempre**. Todos os comandos deste plano rodam na pasta da worktree: `cd "/c/Users/idmpc/devolucoes-wt/fase-4"`.

**Arquivos que esta fase pode editar (contrato §3)**
- Cria ou edita: `src/db/schema/fiscal.ts`, `src/modules/fiscal/**`, `src/conectores/nfe/**`, `src/modules/lotes/porta.ts` (só a implementação "sem lotes"), `src/worker/manipuladores/fiscal.ts`, `src/modules/historico/rotulos/fiscal.ts`, `src/components/fiscal/**`, `src/app/(app)/configuracoes/fiscal/**`, `src/app/(app)/fluxo/etapa/4/**`, `src/app/api/fiscal/**`, `src/app/(app)/fluxo/devolucoes/[codigo]/secoes/SecaoFiscal.tsx` e o arquivo novo `secoes/acoes-fiscal.ts`.
- Dono na janela: `src/modules/devolucoes/busca.ts`, `filtros.ts`, `selos.ts`, `quadro.ts`, `src/components/CartaoDevolucao.tsx`, `src/components/QuadroFluxo.tsx`, `src/app/(app)/fluxo/page.tsx` (e os testes desses arquivos).
- Testes: `tests/helpers/fabricas-fiscal.ts`, `tests/helpers/xml-nfe.ts`, `tests/helpers/nota-teste.ts`, `tests/helpers/fila-fiscal.ts`, `tests/e2e/apoio-fiscal.ts`, `tests/e2e/fiscal-*.spec.ts`, `tests/e2e/integracao-fiscal.spec.ts`, e `src/**/*.test.ts(x)` novos.
- **Nunca** (congelados): `src/lib/env.ts`, `.env.example`, `.env.producao.example`, `package.json` (scripts), `src/db/schema/index.ts`, `devolucoes.ts`, `catalogo.ts`, `auth.ts`, `dominio.ts` e `transicoes*.ts` das devoluções, `permissoes.ts`, `NavAbas.tsx`, `configuracoes/page.tsx`, `[codigo]/page.tsx`, `detalhe.ts`, `fluxo/etapa/[numero]/page.tsx`, `EtapasCelular.tsx`, `Selo.tsx` e os outros componentes existentes, `globals.css`, `tests/e2e/global-setup.ts`, `apoio.ts`, `dados.ts`, `tests/helpers/fabricas.ts`, `Dockerfile`, `docker-compose.prod.yml`, `README.md`.

**Ambiente e ferramentas**
- Node 24 e npm. Next.js 16 tem mudanças (veja `AGENTS.md` e `node_modules/next/dist/docs/`): `params` e `searchParams` são **Promise**; `redirect()` lança exceção (chame **fora** do `try/catch`); arquivo com `'use server'` só exporta funções async (e `type`); `notFound()` e `redirect()` funcionam em Route Handlers.
- Arquivos de `src/db/schema/` e **tudo o que eles importam em tempo de execução** usam imports relativos, nunca `@/` (o drizzle-kit não resolve o alias). Import só de tipo (`import type`) some na compilação e pode usar qualquer caminho.
- Migrações: nesta branch, `npm run db:gerar -- --name fase4_fiscal` gera a migração do diff; ela é descartada e gerada de novo na Tarefa 11 (contrato §3, "Procedimento das migrações antes do merge").
- Dependência nova com versão exata: `npm install fast-xml-parser@5.11.2 --save-exact` (publicada em 29/09/2026). O `npm audit` aponta um aviso **baixo** (GHSA-474x-hrwr-fgx4) que só vale com `stopNodes`, que este plano não usa.

**Produto e textos**
- Interface só em português do Brasil. O título da etapa 4 é o do PDF: **"Destinação Fiscal e Estoque"**; as abas são **"Estoque Bom"** e **"Estoque Problema"** (spec §6.4).
- O que vai além do PDF/spec fica marcado **(extra)**.
- **Fiscal:** CFOP, CST, CSOSN, natureza e informações complementares são **sugestões**; o contador valida (spec §8.3, §16). O sistema não decide tributação sozinho.

**Mobile-first (exigência do usuário)**
- Toda tela é desenhada e testada primeiro em 390×844 e cresce para o computador (`md:`).
- Sem rolagem lateral (`semRolagemLateral` no e2e). Listas em cartões. Formulários em uma coluna, com o botão principal no `RodapeFormulario` (fixo no celular).
- Toque mínimo de 44 px (`min-h-11`), contraste ≥ 4,5:1 (use as cores do `globals.css`: `text-bom bg-bom-suave` para Estoque Bom, `text-problema bg-problema-suave` para Estoque Problema). Erros vão para a `ListaErros`, que recebe o foco (`useEnvioFormulario`); com mais de um formulário na página, cada caixa tem o seu `id`.
- Componentes React são puros: nada de `new Date()` na renderização; datas formatadas nos módulos.

**Segurança e LGPD**
- Permissão checada no servidor em toda página e Server Action (`exigirPermissao`). Ações: `ver_listas` (todos), `gerir_fiscal` (Fiscal e Gestor: emitir, reenviar, cancelar, anexar NF de venda, escolher item, baixar XMLs), `administrar` (Gestor: Configurações › Fiscal).
- O token da Focus fica só no `.env` (`FOCUS_TOKEN_HOMOLOGACAO`, `FOCUS_TOKEN_PRODUCAO`): nunca no banco, em log, em mensagem de erro ou na tela (a tela diz só "configurado" ou "falta").
- **Nunca registre** token, dados do certificado ou o payload completo da NF (tem nome, CPF e endereço do comprador). Mensagens de erro levam só status HTTP, `codigo` e `mensagem` do emissor. `notas_venda.destinatario` guarda só o necessário à NF.

**Testes e commits**
- TDD: teste que falha → implementação → teste passa. Unitário `npm test` (`src/**/*.test.{ts,tsx}`), integração `npm run test:int` (`src/**/*.int.test.ts`, banco `devolucoes_test_f4`), ponta a ponta `npm run test:e2e` (projetos `computador` e `celular`; porta 3104). Pare o `npm run dev` antes do e2e.
- O e2e da Parte A sobe o servidor **e o worker** com os falsos (`EMISSOR_NFE=falso`). O emissor falso autoriza na **2ª consulta** (uns 10 s depois do envio) e rejeita quando a natureza da operação contém "REJEITAR".
- Toda mensagem de commit termina com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. **Nunca rode `git push`.**

## Decisões que a spec e o contrato não fixaram (o usuário pode vetar)

1. **Configurações › Fiscal:** o **Gestor** edita (spec §6.8, §6.9 e D13); o **Fiscal** vê tudo em modo leitura (chega pelo aviso da etapa 4). A aba Configurações continua só do Gestor.
2. **Abas da etapa 4 por caminho:** `/fluxo/etapa/4` = Estoque Bom e `/fluxo/etapa/4/problema` = Estoque Problema. Com `?aba=` a Busca Avançada (formulário GET) apagaria a aba a cada busca.
3. **Consultas (D12):** a 1ª consulta vai logo depois do envio (pega a autorização síncrona da SEFAZ); as seguintes esperam 10 s, 30 s, 1 min, 2 min, 5 min e depois 10 min. Depois de 150 consultas (~24 h) a tarefa falha e vai para Falhas (Fase 6).
4. **Validação antes de gravar:** `solicitarEmissao` monta a nota inteira antes de criar a linha (dados da empresa, regra, NF de venda, casamento dos itens), para o Fiscal ver o erro na hora. O worker monta de novo; se falhar, a nota vira REJEITADA com a mensagem.
5. **NF de venda:** na devolução do ML, o "Emitir" busca no conector antes (contrato §5.8) e há o botão "Buscar no Mercado Livre"; senão o Fiscal anexa o XML. Só é aceito XML de NF-e (modelo 55) de saída, com protocolo de autorização (cStat 100 ou 150), emitida pelo CNPJ da empresa, até 1 MB.
6. **Escolha do Fiscal (D14):** fica no próprio `notas_venda.itens[]` (campo `itensDevolucaoIds`, dentro do jsonb), sem coluna nova.
7. **Itens da NF de devolução:** um item por item da NF de venda, com a quantidade de unidades casadas; valor unitário = `vUnCom` da venda; tributos proporcionais (por unidade × quantidade) só fora do Simples e só quando o CST da regra leva valor (ICMS 00, 10, 20, 51, 70, 90; PIS/COFINS 01, 02). O desconto da venda não é repassado (o contrato não tem o campo; o contador valida).
8. **Destinatário** = o da NF de venda (várias NF de venda com destinatários diferentes → recusa). `consumidor_final` = 1 quando o indicador de IE é 9. `presenca_comprador` = 0 e `modalidade_frete` = 9. Em homologação o nome do destinatário vira o texto exigido pela SEFAZ (rejeição 598), só no cliente Focus.
9. **Cancelamento:** síncrono na tela (a Focus responde na hora), só até 24 h depois da autorização. Depois do prazo o formulário some e a tela orienta "nota de estorno com o contador". O XML do cancelamento é baixado na hora; se falhar, `nfe.consultar` busca depois.
10. **ZIP de XMLs:** só do ambiente atual; período de até 31 dias; inclui os XML das notas **autorizadas** no período (mesmo as canceladas depois) e os XML dos **cancelamentos** do período; nomes `{chave}-nfe.xml` e `{chave}-cancelamento.xml`.
11. **Reenvio** ("Corrigir e reenviar") usa o mesmo `ref` e o ambiente atual da configuração.
12. **Produção:** passar para produção exige marcar "O contador validou as regras fiscais e as notas emitidas em homologação" e, com o emissor real, o `FOCUS_TOKEN_PRODUCAO` no `.env`.
13. **Série:** obrigatória na configuração (0 a 889). A série que volta da SEFAZ é conferida; se for diferente, a Seção Fiscal mostra um aviso (a nota continua válida).
14. **(extra)** Botão "Emitir NF de devolução" também no detalhe da devolução; **(extra)** o detalhe se atualiza a cada 5 s enquanto a NF processa; **(extra)** remover uma NF de venda anexada por engano (enquanto não há NF em processamento ou autorizada).
15. Os cartões ganham os selos "NF em processamento", "NF rejeitada" e "NF autorizada", e as contagens "Estoque Bom: N" e "Estoque Problema: N".
16. NF **denegada** (a Focus não tem esse status; vem como `erro_autorizacao` com `status_sefaz` 110, 301, 302 ou 303) é tratada como rejeição, com o prefixo "NF denegada pela SEFAZ".
17. **Sugestões das regras** (prefill do formulário; nada nasce gravado, D13):

| Nota | Operação | CFOP (§8.3) | ICMS no Simples (CSOSN) | ICMS no Presumido/Real (CST) | PIS e COFINS | Natureza |
|---|---|---|---|---|---|---|
| Devolução de venda | dentro / fora | 1202 / 2202 | 900 | 00 | 98 | Devolucao de venda |
| Remessa para conserto | dentro / fora | 5915 / 6915 | 400 | 41 | 49 | Remessa para conserto |
| Remessa para troca ou garantia | dentro / fora | 5949 / 6949 | 400 | 41 | 49 | Remessa para troca ou garantia |

## Mapa de arquivos

```
src/
  db/schema/fiscal.ts                         notas_fiscais, notas_venda, regras_fiscais (contrato §4.3)
  conectores/nfe/
    tipos.ts                                  EmissorNFe, SituacaoNota, NotaParaEmissao... (contrato §5.7)
    erros.ts                                  ErroEmissorRecusou (definitivo) e ErroEmissorIndisponivel (tenta de novo)
    falso.ts                                  EmissorFalso (autoriza na 2ª consulta; "REJEITAR" rejeita)
    focus-mapeamento.ts                       payload e respostas da Focus (funções puras)
    focus.ts                                  cliente HTTP da Focus NFe (fetch, Basic, tempo limite)
    registro.ts                               obterEmissorNFe / definirEmissorParaTestes (EMISSOR_NFE)
  modules/fiscal/
    dominio.ts                                vocabulário, rótulos, CST/CSOSN, prazo de cancelamento, tipos do jsonb
    erros.ts, transicoes-nota.ts, chave.ts    erro de negócio, transições da nota (spec §5.5), chave de acesso
    configuracao.ts, regras.ts                dados da empresa, ambiente, regras e pendências (D13)
    arquivos.ts                               caminhos e leitura/gravação no armazenamento
    xml-nota-venda.ts, nota-venda.ts          leitura do XML da NF de venda; anexar, buscar no ML, remover
    casamento.ts, escolha.ts                  item da devolução ↔ item da NF de venda (D14)
    montar-devolucao.ts                       montagem da NF de devolução (spec §8.4)
    consultas.ts                              esperas entre as consultas (D12; puro)
    notas.ts, emissao.ts, ciclo.ts            emissão, reenvio, consulta, autorização e rejeição
    cancelamento.ts                           cancelamento em 24 h (spec §8.6)
    periodo.ts, xmls-periodo.ts               período (puro) e ZIP dos XMLs do período (spec §8.7)
    situacao.ts                               dados da Seção Fiscal e da etapa 4
  modules/lotes/porta.ts                      porta de lotes "sem lotes" (D11; a Fase 5 troca o corpo)
  worker/manipuladores/fiscal.ts              nfe.emitir e nfe.consultar
  modules/devolucoes/busca.ts, selos.ts, quadro.ts      opção destino, selos da NF, divisão da coluna 4
  components/CartaoDevolucao.tsx, QuadroFluxo.tsx       contagens de estoque e divisão da coluna 4
  components/fiscal/DivisaoEstoque.tsx, FormularioXmls.tsx, AtualizarEnquantoProcessa.tsx, BlocosFiscais.tsx, tipos.ts
  app/(app)/fluxo/page.tsx                                divisão da coluna 4 no celular
  app/(app)/fluxo/etapa/4/{page,PaginaEstoque,ListaEstoque,acoes}.tsx, problema/page.tsx
  app/(app)/configuracoes/fiscal/{page,acoes,FormularioEmpresa,FormularioAmbiente,FormularioRegra}.tsx
  app/(app)/configuracoes/fiscal/regras/[tipo]/[operacao]/page.tsx
  app/(app)/fluxo/devolucoes/[codigo]/secoes/{SecaoFiscal.tsx, acoes-fiscal.ts}
  app/api/fiscal/xmls/route.ts                            GET do ZIP
tests/
  helpers/fabricas-fiscal.ts, xml-nfe.ts, nota-teste.ts, fila-fiscal.ts
  e2e/apoio-fiscal.ts, fiscal-configuracoes.spec.ts, fiscal-etapa4.spec.ts, fiscal-nf.spec.ts, integracao-fiscal.spec.ts
```

---

### Tarefa 1: Base fiscal: vocabulário, tabelas, transições da nota, chave de acesso e porta de lotes

**Arquivos:**
- Criar: `src/modules/fiscal/dominio.ts`, `src/modules/fiscal/erros.ts`, `src/modules/fiscal/transicoes-nota.ts`, `src/modules/fiscal/chave.ts`, `src/conectores/nfe/tipos.ts`, `src/modules/lotes/porta.ts`, `tests/helpers/fabricas-fiscal.ts`
- Modificar (substituir o `export {};`): `src/db/schema/fiscal.ts`
- Modificar (acrescentar 2 chaves): `src/modules/historico/rotulos/fiscal.ts`
- Gerado: `drizzle/0007_fase4_fiscal.sql` (descartado e refeito na Tarefa 11)
- Testes: `src/modules/fiscal/dominio.test.ts`, `src/modules/fiscal/transicoes-nota.test.ts`, `src/modules/fiscal/chave.test.ts`, `src/modules/lotes/porta.test.ts`, `src/modules/fiscal/schema.int.test.ts`

**Interfaces:**
- Consome (Parte A, contrato §4.1, §4.5, §5): `type AmbienteNfe`, `type RegimeTributario` (`src/modules/configuracoes/dominio.ts`); `ambienteNfeEnum` (`src/db/schema/configuracoes.ts`); colunas `itensDevolucao.destino`, `motivo`, `eanLido`, `produtoRecebidoId`, `devolucoes.conferidaEm`, `concluidaEm`; `criarDevolucaoTeste`, `criarUsuarioTeste` (Fase 1).
- Produz:
  - `dominio.ts`: `TIPOS_NOTA`, `type TipoNota`, `ROTULO_TIPO_NOTA`, `ehTipoNota`, `SITUACOES_NOTA`, `type SituacaoNotaFiscal`, `ROTULO_SITUACAO_NOTA`, `SELO_SITUACAO_NOTA`, `OPERACOES_FISCAIS`, `type OperacaoFiscal`, `ROTULO_OPERACAO`, `ehOperacao`, `ORIGENS_NOTA_VENDA`, `type OrigemNotaVenda`, `ROTULO_ORIGEM_NOTA_VENDA`, `ROTULO_REGIME`, `ROTULO_AMBIENTE`, `CSOSN`, `CST_ICMS`, `CST_PIS_COFINS`, `type DestinoEstoque = 'BOM' | 'PROBLEMA'`, `ABAS_ESTOQUE`, `type TributosUnitarios`, `type ItemNotaVenda`, `PRAZO_CANCELAMENTO_HORAS = 24`, `prazoDeCancelamento(autorizadaEm): Date`, `dentroDoPrazoDeCancelamento(autorizadaEm, agora): boolean`, `referenciaDaNota(id): string`
  - `erros.ts`: `class ErroFiscal extends Error`, `class ErroNotaVendaDuplicada extends ErroFiscal`
  - `transicoes-nota.ts`: `REGRAS_TRANSICAO_NOTA`, `podeTransitarNota({ de, para }): boolean`, `exigirTransicaoNota({ de, para }): void`
  - `chave.ts`: `CODIGO_UF`, `digitoChave(base43): string`, `chaveValida(chave): boolean`, `montarChave(p): string`, `semPrefixoNFe(chave): string`, `numeroDaChave(chave): string`
  - `conectores/nfe/tipos.ts`: exatamente os tipos do contrato §5.7 (`SituacaoNota`, `EmissorNFe`, `NotaParaEmissao`, `DadosEmitente`, `Destinatario`, `ItemNota`); a Tarefa 4 acrescenta a reexportação de `obterEmissorNFe` e `definirEmissorParaTestes`
  - `lotes/porta.ts`: `interface PortaLotes` e `const portaLotes` "sem lotes" (contrato §5.7, D11)
  - schema: `tipoNotaEnum`, `situacaoNotaEnum`, `operacaoFiscalEnum`, `origemNotaVendaEnum`, tabelas `notasFiscais`, `notasVenda`, `regrasFiscais`
  - fábrica `criarDevolucaoNoEstoqueTeste(db, usuario, { unidades, canal?, pedido?, agora? }): Promise<DevolucaoNoEstoque>`

- [ ] **Passo 0: Conferir a base (Parte A) antes de escrever código**

```bash
cd "/c/Users/idmpc/devolucoes-wt/fase-4"
git log --oneline -3
grep -n "export" src/modules/fila/fila.ts src/modules/fila/tarefas.ts src/worker/tipos.ts src/modules/midia/armazenamento.ts \
  src/conectores/marketplace/registro.ts src/conectores/marketplace/tipos.ts src/modules/configuracoes/ler.ts \
  src/modules/configuracoes/dominio.ts src/modules/devolucoes/transicoes-item.ts src/worker/manipuladores/fiscal.ts \
  "src/app/(app)/fluxo/devolucoes/[codigo]/secoes/SecaoFiscal.tsx"
grep -n "ambiente_nfe\|destino_item\|motivo_item\|export const configuracoes" src/db/schema/*.ts
grep -n "EMISSOR_NFE\|FOCUS_TOKEN" src/lib/env.ts .env.example
grep -n "nota_fiscal\|configuracao\|'item'" src/modules/historico/eventos.ts
cat src/modules/historico/rotulos/fiscal.ts
git diff 4640ae2 --stat -- src/modules/devolucoes/busca.ts src/modules/devolucoes/selos.ts src/modules/devolucoes/quadro.ts \
  src/components/CartaoDevolucao.tsx src/components/QuadroFluxo.tsx "src/app/(app)/fluxo/page.tsx"
```

Esperado (nomes que este plano usa; todos vêm do contrato):

| Onde | Nome |
|---|---|
| `src/modules/fila/fila.ts` | `obterFila`, `definirFilaParaTestes`, `class FilaMemoria` (com `enviadas`), `type Fila` |
| `src/modules/fila/tarefas.ts` | `type DadosTarefa` com `'nfe.emitir'` e `'nfe.consultar'` |
| `src/worker/tipos.ts` | `type Manipuladores`, `type ContextoTarefa` |
| `src/worker/manipuladores/fiscal.ts` | `export const manipuladoresFiscal: Manipuladores = {}` |
| `src/modules/midia/armazenamento.ts` | `obterArmazenamento` |
| `src/conectores/marketplace/registro.ts` | `obterConector`, `definirConectorParaTestes` |
| `src/conectores/marketplace/tipos.ts` | `type MarketplaceConnector` |
| `src/modules/configuracoes/ler.ts` | `lerConfiguracao(db)` → objeto com `razaoSocial`, `cnpj`, `ie`, `logradouro`, `numero`, `complemento`, `bairro`, `cidade`, `uf`, `cep`, `regimeTributario`, `serieNfe`, `ambienteNfe` |
| `src/modules/configuracoes/dominio.ts` | `REGIMES_TRIBUTARIOS`, `type RegimeTributario`, `AMBIENTES_NFE`, `type AmbienteNfe` |
| `src/db/schema/configuracoes.ts` | `configuracoes`, `ambienteNfeEnum` (o `pgEnum('ambiente_nfe', ...)`) |
| `src/modules/devolucoes/transicoes-item.ts` | `exigirTransicaoItem({ de, para, ator })` |
| `src/lib/env.ts` | `lerEnv().EMISSOR_NFE` (`'focus' \| 'falso'`), `FOCUS_TOKEN_HOMOLOGACAO`, `FOCUS_TOKEN_PRODUCAO` |
| `eventos.ts` | `EntidadeHistorico` com `'item'`, `'configuracao'`, `'nota_fiscal'` |
| `SecaoFiscal.tsx` | componente assíncrono com `props: { devolucaoId; codigo; status; usuario }`, devolvendo `null` |

O `git diff --stat` deve mostrar no máximo `busca.ts` (a Parte A acrescentou `ean_lido` ao filtro de código). **Se um nome for diferente, use o nome que está no `main` em todo este plano** (o contrato manda) e anote a diferença na mensagem do commit; não mude arquivo congelado.

- [ ] **Passo 1: Escrever os testes unitários que falham**

`src/modules/fiscal/dominio.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { dentroDoPrazoDeCancelamento, ehOperacao, ehTipoNota, prazoDeCancelamento, referenciaDaNota, rotulosDoEstoque } from './dominio';

describe('vocabulário fiscal', () => {
  it('a referência do emissor é o id sem hífens (só letras e números, contrato §4.3)', () => {
    expect(referenciaDaNota('0b9f1c2e-3d4a-4b5c-8d6e-7f8091a2b3c4')).toBe('0b9f1c2e3d4a4b5c8d6e7f8091a2b3c4');
  });

  it('reconhece tipo de nota e operação', () => {
    expect(ehTipoNota('DEVOLUCAO_VENDA')).toBe(true);
    expect(ehTipoNota('VENDA')).toBe(false);
    expect(ehOperacao('FORA_ESTADO')).toBe(true);
    expect(ehOperacao('fora')).toBe(false);
  });

  it('prazo de cancelamento: 24 h depois da autorização', () => {
    const autorizada = new Date('2026-11-12T10:00:00Z');
    expect(prazoDeCancelamento(autorizada)).toEqual(new Date('2026-11-13T10:00:00Z'));
    expect(dentroDoPrazoDeCancelamento(autorizada, new Date('2026-11-13T09:59:59Z'))).toBe(true);
    expect(dentroDoPrazoDeCancelamento(autorizada, new Date('2026-11-13T10:00:00Z'))).toBe(false);
  });

  it('as abas da etapa 4 têm os nomes do PDF (spec §6.4)', () => {
    expect(rotulosDoEstoque()).toEqual(['Estoque Bom', 'Estoque Problema']);
  });
});
```

`src/modules/fiscal/transicoes-nota.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SITUACOES_NOTA, type SituacaoNotaFiscal } from './dominio';
import { ErroFiscal } from './erros';
import { exigirTransicaoNota, podeTransitarNota } from './transicoes-nota';

// Spec §5.5 e contrato §4.6, escritos de novo de propósito: o teste não lê a tabela do código.
const PERMITIDAS: [SituacaoNotaFiscal | null, SituacaoNotaFiscal][] = [
  [null, 'PROCESSANDO'],
  ['PROCESSANDO', 'AUTORIZADA'],
  ['PROCESSANDO', 'REJEITADA'],
  ['REJEITADA', 'PROCESSANDO'],
  ['AUTORIZADA', 'CANCELADA'],
];

describe('transições da nota fiscal (spec §5.5)', () => {
  it('aceita só as mudanças da tabela', () => {
    for (const de of [null, ...SITUACOES_NOTA]) {
      for (const para of SITUACOES_NOTA) {
        const esperado = PERMITIDAS.some(([d, p]) => d === de && p === para);
        expect(podeTransitarNota({ de, para }), `${de} → ${para}`).toBe(esperado);
      }
    }
  });

  it('recusa com mensagem em português', () => {
    expect(() => exigirTransicaoNota({ de: 'CANCELADA', para: 'AUTORIZADA' })).toThrow(ErroFiscal);
    expect(() => exigirTransicaoNota({ de: 'CANCELADA', para: 'AUTORIZADA' })).toThrow('Mudança não permitida na NF: Cancelada → Autorizada.');
    expect(() => exigirTransicaoNota({ de: null, para: 'AUTORIZADA' })).toThrow('Mudança não permitida na NF: (nova) → Autorizada.');
    expect(() => exigirTransicaoNota({ de: 'REJEITADA', para: 'PROCESSANDO' })).not.toThrow();
  });
});
```

`src/modules/fiscal/chave.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { chaveValida, montarChave, numeroDaChave, semPrefixoNFe } from './chave';

describe('chave de acesso da NF-e', () => {
  it('o dígito confere com o exemplo do Manual de Orientação do Contribuinte', () => {
    expect(chaveValida('52060433009911002506550120000007800267301615')).toBe(true);
    expect(chaveValida('52060433009911002506550120000007800267301614')).toBe(false);
    expect(chaveValida('5206043300991100250655012000000780026730161')).toBe(false);
    expect(chaveValida('NFe52060433009911002506550120000007800267301615')).toBe(false);
  });

  it('monta UF, ano e mês de Brasília, CNPJ, modelo 55, série, número, emissão normal, código e dígito', () => {
    const chave = montarChave({
      uf: 'SP',
      emitidaEm: new Date('2026-11-12T12:00:00Z'),
      cnpj: '11222333000181',
      serie: '2',
      numero: '123',
      codigo: '12345678',
    });
    expect(chave).toBe('35261111222333000181550020000001231123456783');
    expect(chaveValida(chave)).toBe(true);
    expect(() => montarChave({ uf: 'XX', emitidaEm: new Date(), cnpj: '11222333000181', serie: '1', numero: '1', codigo: '1' })).toThrow('UF desconhecida: XX');
  });

  it('tira o prefixo NFe e lê o número de dentro da chave', () => {
    expect(semPrefixoNFe('NFe35261111222333000181550020000001231123456783')).toBe('35261111222333000181550020000001231123456783');
    expect(numeroDaChave('35261111222333000181550020000001231123456783')).toBe('123');
  });
});
```

`src/modules/lotes/porta.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { DbOuTx } from '@/db/client';
import { portaLotes } from './porta';

const tx = {} as DbOuTx;
const AGORA = new Date('2026-11-12T12:00:00Z');

describe('porta de lotes "sem lotes" (contrato §5.7, D11)', () => {
  it('na autorização e no cancelamento da NF de devolução não faz nada e não impede o cancelamento', async () => {
    await expect(portaLotes.alocarItensProblema(tx, 'dev', AGORA)).resolves.toBeUndefined();
    await expect(portaLotes.desfazerAlocacao(tx, 'dev', AGORA)).resolves.toBeUndefined();
    await expect(portaLotes.motivoParaNaoCancelarDevolucao(tx, 'dev')).resolves.toBeNull();
  });

  it('as remessas chegam na Fase 5', async () => {
    await expect(portaLotes.montarNotaRemessa(tx, 'lote', 'ref')).rejects.toThrow('As remessas chegam na Fase 5');
    await expect(portaLotes.aoAutorizarRemessa(tx, 'lote', 'nota', AGORA)).rejects.toThrow('As remessas chegam na Fase 5');
    await expect(portaLotes.aoCancelarRemessa(tx, 'lote', AGORA)).rejects.toThrow('As remessas chegam na Fase 5');
  });
});
```

Rode: `npm test -- src/modules/fiscal src/modules/lotes`
Esperado: FAIL (os módulos ainda não existem).

- [ ] **Passo 2: Implementar o vocabulário, os erros, as transições e a chave**

`src/conectores/nfe/tipos.ts` (os tipos do contrato §5.7, sem mudar nenhum nome):

```ts
import type { AmbienteNfe, RegimeTributario } from '@/modules/configuracoes/dominio';
import type { OperacaoFiscal, TipoNota } from '@/modules/fiscal/dominio';

/** Resposta do emissor (contrato §5.7). `motivo` é o texto da SEFAZ, em português. */
export type SituacaoNota =
  | { situacao: 'PROCESSANDO' }
  | { situacao: 'AUTORIZADA'; chave: string; numero: string; serie: string; urlXml: string; urlDanfe: string }
  | { situacao: 'REJEITADA'; codigo: string | null; motivo: string }
  | { situacao: 'CANCELADA'; urlXmlCancelamento: string | null }
  /** A nota continua AUTORIZADA. */
  | { situacao: 'CANCELAMENTO_RECUSADO'; motivo: string };

/** Spec §4.3 (emitir, consultar, cancelar) mais `baixar` (XML e DANFE). O núcleo só fala com o emissor por aqui. */
export interface EmissorNFe {
  emitir(nota: NotaParaEmissao): Promise<{ referencia: string }>;
  consultar(referencia: string): Promise<SituacaoNota>;
  /** Justificativa de 15 a 255 caracteres. */
  cancelar(referencia: string, justificativa: string): Promise<SituacaoNota>;
  baixar(url: string): Promise<Buffer>;
}

export type NotaParaEmissao = {
  referencia: string;
  tipo: TipoNota;
  naturezaOperacao: string;
  /** Devolução de venda: true (tipo_documento 0). */
  entrada: boolean;
  finalidade: 'NORMAL' | 'DEVOLUCAO';
  operacao: OperacaoFiscal;
  consumidorFinal: boolean;
  regime: RegimeTributario;
  emitente: DadosEmitente;
  destinatario: Destinatario;
  /** 44 dígitos, sem o prefixo "NFe". */
  chavesReferenciadas: string[];
  itens: ItemNota[];
  informacoesComplementares: string | null;
};

export type DadosEmitente = {
  razaoSocial: string;
  cnpj: string;
  ie: string;
  logradouro: string;
  numero: string;
  complemento: string | null;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
};

export type Destinatario = {
  nome: string;
  cpf: string | null;
  cnpj: string | null;
  ie: string | null;
  indicadorIe: 1 | 2 | 9;
  logradouro: string;
  numero: string;
  complemento: string | null;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
};

export type ItemNota = {
  codigo: string;
  descricao: string;
  ncm: string;
  cfop: string;
  unidade: string;
  quantidade: number;
  valorUnitario: number;
  ean: string | null;
  icmsOrigem: number;
  icmsSituacao: string;
  pisSituacao: string;
  cofinsSituacao: string;
  tributos?: {
    icmsBase?: number;
    icmsAliquota?: number;
    icmsValor?: number;
    pisBase?: number;
    pisAliquota?: number;
    pisValor?: number;
    cofinsBase?: number;
    cofinsAliquota?: number;
    cofinsValor?: number;
  };
};
```

`src/modules/fiscal/dominio.ts`:

```ts
/**
 * Vocabulário fiscal (spec §5.1 NotaFiscal e RegraFiscal, §6.4, §8; contrato §4.3).
 * Sem imports com "@/" em tempo de execução: o schema importa este arquivo e o drizzle-kit não resolve o alias.
 * Também é importado por componentes de cliente: nada de banco aqui.
 */
import type { Destinatario } from '../../conectores/nfe/tipos';
import type { AmbienteNfe, RegimeTributario } from '../configuracoes/dominio';

export const TIPOS_NOTA = ['DEVOLUCAO_VENDA', 'REMESSA_CONSERTO', 'REMESSA_TROCA_GARANTIA'] as const;
export type TipoNota = (typeof TIPOS_NOTA)[number];
export const ROTULO_TIPO_NOTA: Record<TipoNota, string> = {
  DEVOLUCAO_VENDA: 'Devolução de venda',
  REMESSA_CONSERTO: 'Remessa para conserto',
  REMESSA_TROCA_GARANTIA: 'Remessa para troca ou garantia',
};
export function ehTipoNota(texto: string): texto is TipoNota {
  return (TIPOS_NOTA as readonly string[]).includes(texto);
}

/** Situação da nota (spec §5.5). O tipo do emissor (SituacaoNota) é outro: a resposta da SEFAZ. */
export const SITUACOES_NOTA = ['PROCESSANDO', 'AUTORIZADA', 'REJEITADA', 'CANCELADA'] as const;
export type SituacaoNotaFiscal = (typeof SITUACOES_NOTA)[number];
export const ROTULO_SITUACAO_NOTA: Record<SituacaoNotaFiscal, string> = {
  PROCESSANDO: 'Em processamento',
  AUTORIZADA: 'Autorizada',
  REJEITADA: 'Rejeitada',
  CANCELADA: 'Cancelada',
};
/** Texto dos selos (cartões e Seção Fiscal). */
export const SELO_SITUACAO_NOTA: Record<SituacaoNotaFiscal, string> = {
  PROCESSANDO: 'NF em processamento',
  AUTORIZADA: 'NF autorizada',
  REJEITADA: 'NF rejeitada',
  CANCELADA: 'NF cancelada',
};

export const OPERACOES_FISCAIS = ['DENTRO_ESTADO', 'FORA_ESTADO'] as const;
export type OperacaoFiscal = (typeof OPERACOES_FISCAIS)[number];
export const ROTULO_OPERACAO: Record<OperacaoFiscal, string> = {
  DENTRO_ESTADO: 'dentro do estado',
  FORA_ESTADO: 'fora do estado',
};
export function ehOperacao(texto: string): texto is OperacaoFiscal {
  return (OPERACOES_FISCAIS as readonly string[]).includes(texto);
}

export const ORIGENS_NOTA_VENDA = ['MERCADO_LIVRE', 'ANEXO'] as const;
export type OrigemNotaVenda = (typeof ORIGENS_NOTA_VENDA)[number];
export const ROTULO_ORIGEM_NOTA_VENDA: Record<OrigemNotaVenda, string> = {
  MERCADO_LIVRE: 'Mercado Livre',
  ANEXO: 'XML anexado',
};

export const ROTULO_REGIME: Record<RegimeTributario, string> = {
  SIMPLES: 'Simples Nacional',
  PRESUMIDO: 'Lucro Presumido',
  REAL: 'Lucro Real',
};
export const ROTULO_AMBIENTE: Record<AmbienteNfe, string> = {
  HOMOLOGACAO: 'Homologação (sem valor fiscal)',
  PRODUCAO: 'Produção',
};

/** Valores aceitos (pesquisa focus-nfe.md §2.1). No Simples o ICMS usa CSOSN; no Presumido e no Real, CST (spec §8.2). */
export const CSOSN = ['101', '102', '103', '201', '202', '203', '300', '400', '500', '900'] as const;
export const CST_ICMS = ['00', '02', '10', '15', '20', '30', '40', '41', '50', '51', '53', '60', '61', '70', '90'] as const;
export const CST_PIS_COFINS = [
  '01', '02', '03', '04', '05', '06', '07', '08', '09', '49', '50', '51', '52', '53', '54', '55', '56',
  '60', '61', '62', '63', '64', '65', '66', '67', '70', '71', '72', '73', '74', '75', '98', '99',
] as const;

/** Abas da etapa 4 (spec §6.4). Caminhos, e não ?aba=, porque a Busca Avançada (GET) apagaria o parâmetro. */
export type DestinoEstoque = 'BOM' | 'PROBLEMA';
export const ABAS_ESTOQUE: readonly { destino: DestinoEstoque; rotulo: string; href: string }[] = [
  { destino: 'BOM', rotulo: 'Estoque Bom', href: '/fluxo/etapa/4' },
  { destino: 'PROBLEMA', rotulo: 'Estoque Problema', href: '/fluxo/etapa/4/problema' },
];
export function rotulosDoEstoque(): string[] {
  return ABAS_ESTOQUE.map((a) => a.rotulo);
}

/** Tributos de uma unidade, tirados da NF de venda (valor do item ÷ quantidade). Alíquotas ficam como estão. */
export type TributosUnitarios = {
  icmsBase?: number;
  icmsAliquota?: number;
  icmsValor?: number;
  pisBase?: number;
  pisAliquota?: number;
  pisValor?: number;
  cofinsBase?: number;
  cofinsAliquota?: number;
  cofinsValor?: number;
};

/** Um item da NF de venda, como fica no jsonb `notas_venda.itens` (contrato §4.3). */
export type ItemNotaVenda = {
  /** nItem do XML (1, 2, ...). */
  numero: number;
  /** cProd: o código do produto (= SKU, D14). */
  codigo: string;
  ean: string | null;
  descricao: string;
  ncm: string;
  /** CFOP da venda, só para consulta. */
  cfop: string;
  unidade: string;
  quantidade: number;
  valorUnitario: number;
  desconto: number;
  origem: number;
  tributosPorUnidade: TributosUnitarios;
  /** D14: unidades da devolução (itens_devolucao.id) que o Fiscal ligou a este item. */
  itensDevolucaoIds: string[];
};

/** O destinatário guardado em `notas_venda.destinatario`: só o necessário à NF (LGPD). */
export type DestinatarioNotaVenda = Destinatario;

/** Prazo legal de cancelamento (Focus NFe: 24 h depois da autorização; spec §8.6). */
export const PRAZO_CANCELAMENTO_HORAS = 24;
export const JUSTIFICATIVA_MINIMA = 15;
export const JUSTIFICATIVA_MAXIMA = 255;

export function prazoDeCancelamento(autorizadaEm: Date): Date {
  return new Date(autorizadaEm.getTime() + PRAZO_CANCELAMENTO_HORAS * 60 * 60 * 1000);
}

export function dentroDoPrazoDeCancelamento(autorizadaEm: Date, agora: Date): boolean {
  return agora.getTime() < prazoDeCancelamento(autorizadaEm).getTime();
}

/** O `ref` da Focus: o id da nota sem hífens (só letras e números; contrato §4.3 e D12). */
export function referenciaDaNota(notaFiscalId: string): string {
  return notaFiscalId.replace(/-/g, '');
}
```

`src/modules/fiscal/erros.ts`:

```ts
/** Erro de regra fiscal, com mensagem pronta para mostrar na tela. */
export class ErroFiscal extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroFiscal';
  }
}

export class ErroNotaVendaDuplicada extends ErroFiscal {
  constructor() {
    super('Esta NF de venda já está anexada a esta devolução.');
    this.name = 'ErroNotaVendaDuplicada';
  }
}
```

`src/modules/fiscal/transicoes-nota.ts`:

```ts
import { ROTULO_SITUACAO_NOTA, type SituacaoNotaFiscal } from './dominio';
import { ErroFiscal } from './erros';

export type PedidoTransicaoNota = { de: SituacaoNotaFiscal | null; para: SituacaoNotaFiscal };

/** Spec §5.5 e contrato §4.6. Quem pode pedir cada uma é checado no serviço (emitir, reenviar, cancelar). */
export const REGRAS_TRANSICAO_NOTA: readonly PedidoTransicaoNota[] = [
  { de: null, para: 'PROCESSANDO' },
  { de: 'PROCESSANDO', para: 'AUTORIZADA' },
  { de: 'PROCESSANDO', para: 'REJEITADA' },
  { de: 'REJEITADA', para: 'PROCESSANDO' },
  { de: 'AUTORIZADA', para: 'CANCELADA' },
];

export function podeTransitarNota(p: PedidoTransicaoNota): boolean {
  return REGRAS_TRANSICAO_NOTA.some((r) => r.de === p.de && r.para === p.para);
}

export function exigirTransicaoNota(p: PedidoTransicaoNota): void {
  if (podeTransitarNota(p)) return;
  const de = p.de ? ROTULO_SITUACAO_NOTA[p.de] : '(nova)';
  throw new ErroFiscal(`Mudança não permitida na NF: ${de} → ${ROTULO_SITUACAO_NOTA[p.para]}.`);
}
```

`src/modules/fiscal/chave.ts`:

```ts
/** Chave de acesso da NF-e (44 dígitos): cUF, AAMM, CNPJ, modelo, série, número, tipo de emissão, código e dígito. */

export const CODIGO_UF: Record<string, string> = {
  RO: '11', AC: '12', AM: '13', RR: '14', PA: '15', AP: '16', TO: '17', MA: '21', PI: '22', CE: '23', RN: '24',
  PB: '25', PE: '26', AL: '27', SE: '28', BA: '29', MG: '31', ES: '32', RJ: '33', SP: '35', PR: '41', SC: '42',
  RS: '43', MS: '50', MT: '51', GO: '52', DF: '53',
};

const ANO_MES = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: '2-digit', month: '2-digit' });

/** Módulo 11 com pesos de 2 a 9 da direita para a esquerda; resto 0 ou 1 → 0. */
export function digitoChave(base43: string): string {
  let soma = 0;
  let peso = 2;
  for (let i = base43.length - 1; i >= 0; i--) {
    soma += Number(base43[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return String(resto < 2 ? 0 : 11 - resto);
}

export function chaveValida(chave: string): boolean {
  return /^\d{44}$/.test(chave) && digitoChave(chave.slice(0, 43)) === chave[43];
}

export function montarChave(p: { uf: string; emitidaEm: Date; cnpj: string; modelo?: string; serie: string; numero: string; codigo: string }): string {
  const cUF = CODIGO_UF[p.uf];
  if (!cUF) throw new Error(`UF desconhecida: ${p.uf}`);
  const partes = Object.fromEntries(ANO_MES.formatToParts(p.emitidaEm).map((x) => [x.type, x.value]));
  const base = [
    cUF,
    `${partes.year}${partes.month}`,
    p.cnpj.padStart(14, '0'),
    p.modelo ?? '55',
    p.serie.padStart(3, '0'),
    p.numero.padStart(9, '0'),
    '1',
    p.codigo.padStart(8, '0'),
  ].join('');
  return base + digitoChave(base);
}

export function semPrefixoNFe(chave: string): string {
  return chave.trim().replace(/^NFe/i, '');
}

/** O número da nota (nNF) que está dentro da chave, sem os zeros à esquerda. */
export function numeroDaChave(chave: string): string {
  return String(Number(chave.slice(25, 34)));
}
```

`src/modules/lotes/porta.ts`:

```ts
import type { NotaParaEmissao } from '@/conectores/nfe/tipos';
import type { DbOuTx } from '@/db/client';
import { ErroFiscal } from '@/modules/fiscal/erros';

/** Contrato §5.7. A Fase 4 cria a implementação "sem lotes"; a Fase 5 troca o corpo (e só ela). */
export interface PortaLotes {
  /** Na transação da autorização da NF de devolução. */
  alocarItensProblema(tx: DbOuTx, devolucaoId: string, agora: Date): Promise<void>;
  /** null = pode cancelar. */
  motivoParaNaoCancelarDevolucao(tx: DbOuTx, devolucaoId: string): Promise<string | null>;
  /** Na transação do cancelamento da NF de devolução. */
  desfazerAlocacao(tx: DbOuTx, devolucaoId: string, agora: Date): Promise<void>;
  /** Spec §8.5. */
  montarNotaRemessa(tx: DbOuTx, loteId: string, referencia: string): Promise<NotaParaEmissao>;
  /** FECHADO → NF_EMITIDA. */
  aoAutorizarRemessa(tx: DbOuTx, loteId: string, notaFiscalId: string, agora: Date): Promise<void>;
  /** NF_EMITIDA → FECHADO. */
  aoCancelarRemessa(tx: DbOuTx, loteId: string, agora: Date): Promise<void>;
}

const REMESSAS_NA_FASE_5 = 'As remessas chegam na Fase 5';

/** "Sem lotes" (D11): o item PROBLEMA fica em AGUARDANDO_NF depois da NF; a Fase 5 aloca os pendentes. */
export const portaLotes: PortaLotes = {
  async alocarItensProblema() {
    // D11: nada a fazer até a Fase 5.
  },
  async motivoParaNaoCancelarDevolucao() {
    return null;
  },
  async desfazerAlocacao() {
    // D11: nada foi alocado, nada a desfazer.
  },
  async montarNotaRemessa() {
    throw new ErroFiscal(REMESSAS_NA_FASE_5);
  },
  async aoAutorizarRemessa() {
    throw new ErroFiscal(REMESSAS_NA_FASE_5);
  },
  async aoCancelarRemessa() {
    throw new ErroFiscal(REMESSAS_NA_FASE_5);
  },
};
```

Rode: `npm test -- src/modules/fiscal src/modules/lotes`
Esperado: PASS (4 arquivos).

- [ ] **Passo 3: Tabelas fiscais**

`src/db/schema/fiscal.ts` (substitui o `export {};` da Parte A):

```ts
import { sql } from 'drizzle-orm';
import { check, index, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import type { Destinatario } from '../../conectores/nfe/tipos';
import { OPERACOES_FISCAIS, ORIGENS_NOTA_VENDA, SITUACOES_NOTA, TIPOS_NOTA, type ItemNotaVenda } from '../../modules/fiscal/dominio';
import { usuarios } from './auth';
import { ambienteNfeEnum } from './configuracoes';
import { devolucoes } from './devolucoes';

export const tipoNotaEnum = pgEnum('tipo_nota', TIPOS_NOTA);
export const situacaoNotaEnum = pgEnum('situacao_nota', SITUACOES_NOTA);
export const operacaoFiscalEnum = pgEnum('operacao_fiscal', OPERACOES_FISCAIS);
export const origemNotaVendaEnum = pgEnum('origem_nota_venda', ORIGENS_NOTA_VENDA);

const COM_FUSO = { withTimezone: true } as const;

/** Spec §5.1 (NotaFiscal) e contrato §4.3. A FK de `lote_id` para `lotes` entra na Fase 5. */
export const notasFiscais = pgTable(
  'notas_fiscais',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tipo: tipoNotaEnum('tipo').notNull(),
    devolucaoId: uuid('devolucao_id').references(() => devolucoes.id),
    loteId: uuid('lote_id'),
    ambiente: ambienteNfeEnum('ambiente').notNull(),
    serie: text('serie'),
    numero: text('numero'),
    chave: text('chave').unique(),
    chavesReferenciadas: text('chaves_referenciadas').array().notNull().default(sql`'{}'::text[]`),
    situacao: situacaoNotaEnum('situacao').notNull().default('PROCESSANDO'),
    motivoRejeicao: text('motivo_rejeicao'),
    /** O `ref` da Focus = id sem hífens (só letras e números). */
    referenciaEmissor: text('referencia_emissor').notNull().unique(),
    xmlCaminho: text('xml_caminho'),
    danfeCaminho: text('danfe_caminho'),
    xmlCancelamentoCaminho: text('xml_cancelamento_caminho'),
    justificativaCancelamento: text('justificativa_cancelamento'),
    emitidaPor: uuid('emitida_por').references(() => usuarios.id, { onDelete: 'set null' }),
    criadaEm: timestamp('criada_em', COM_FUSO).notNull().defaultNow(),
    autorizadaEm: timestamp('autorizada_em', COM_FUSO),
    canceladaEm: timestamp('cancelada_em', COM_FUSO),
    atualizadaEm: timestamp('atualizada_em', COM_FUSO).notNull().defaultNow(),
  },
  (t) => [
    check('notas_fiscais_um_alvo', sql`num_nonnulls("devolucao_id", "lote_id") = 1`),
    // "Uma NF por devolução" (spec §6.4): outra só depois de cancelar a anterior.
    uniqueIndex('notas_fiscais_devolucao_ativa_uq').on(t.devolucaoId).where(sql`"situacao" <> 'CANCELADA'`),
    uniqueIndex('notas_fiscais_lote_ativa_uq').on(t.loteId).where(sql`"situacao" <> 'CANCELADA'`),
    index('notas_fiscais_autorizada_em_idx').on(t.autorizadaEm),
    index('notas_fiscais_cancelada_em_idx').on(t.canceladaEm),
  ],
);

/** XML da NF de venda (spec §7.5). O destinatário guarda só o necessário à NF (LGPD). */
export const notasVenda = pgTable(
  'notas_venda',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    devolucaoId: uuid('devolucao_id')
      .notNull()
      .references(() => devolucoes.id, { onDelete: 'cascade' }),
    chave: text('chave').notNull(),
    origem: origemNotaVendaEnum('origem').notNull(),
    xmlCaminho: text('xml_caminho').notNull(),
    destinatario: jsonb('destinatario').$type<Destinatario>().notNull(),
    itens: jsonb('itens').$type<ItemNotaVenda[]>().notNull(),
    emitidaEm: timestamp('emitida_em', COM_FUSO),
    anexadaPor: uuid('anexada_por').references(() => usuarios.id, { onDelete: 'set null' }),
    criadaEm: timestamp('criada_em', COM_FUSO).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('notas_venda_devolucao_chave_uq').on(t.devolucaoId, t.chave)],
);

/** Spec §5.1 (RegraFiscal) e §8.2. Nenhuma nasce gravada (D13). */
export const regrasFiscais = pgTable(
  'regras_fiscais',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tipoNota: tipoNotaEnum('tipo_nota').notNull(),
    operacao: operacaoFiscalEnum('operacao').notNull(),
    cfop: text('cfop').notNull(),
    /** CSOSN no Simples; CST no Presumido e no Real. */
    icmsSituacaoTributaria: text('icms_situacao_tributaria').notNull(),
    pisSituacaoTributaria: text('pis_situacao_tributaria').notNull(),
    cofinsSituacaoTributaria: text('cofins_situacao_tributaria').notNull(),
    naturezaOperacao: text('natureza_operacao').notNull(),
    informacoesComplementares: text('informacoes_complementares'),
    atualizadoPor: uuid('atualizado_por').references(() => usuarios.id, { onDelete: 'set null' }),
    atualizadoEm: timestamp('atualizado_em', COM_FUSO).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('regras_fiscais_tipo_operacao_uq').on(t.tipoNota, t.operacao)],
);
```

```bash
cd "/c/Users/idmpc/devolucoes-wt/fase-4"
npm run db:gerar -- --name fase4_fiscal
npm run db:migrar
```

Esperado: `drizzle/0007_fase4_fiscal.sql` com os 4 `CREATE TYPE` (`tipo_nota`, `situacao_nota`, `operacao_fiscal`, `origem_nota_venda`), as 3 tabelas, o `CHECK` `notas_fiscais_um_alvo` e os índices únicos parciais com `WHERE "situacao" <> 'CANCELADA'`. Nenhum `CREATE TYPE "ambiente_nfe"` (ele é da Parte A). Se aparecer, o import de `ambienteNfeEnum` está errado: corrija e gere de novo.

- [ ] **Passo 4: Rótulos do histórico**

Em `src/modules/historico/rotulos/fiscal.ts` (criado pela Parte A com as chaves reservadas `nf_solicitada`, `nf_autorizada`, `nf_rejeitada`, `nf_reenviada`, `nf_cancelada`, `nota_venda_anexada`, `nota_venda_obtida_ml`, `devolucao_reaberta`), acrescente estas duas linhas dentro do objeto exportado, depois de `devolucao_reaberta`:

```ts
  nf_item_escolhido: 'Item da NF de venda escolhido',
  nota_venda_removida: 'NF de venda removida',
```

- [ ] **Passo 5: Fábrica da devolução "no estoque" e teste de integração das tabelas**

`tests/helpers/fabricas-fiscal.ts`:

```ts
import { asc, eq } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { devolucoes, itensDevolucao } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import type { DevolucaoCriada } from '@/modules/devolucoes/criar';
import type { Canal } from '@/modules/devolucoes/dominio';
import { criarDevolucaoTeste } from './fabricas';

/**
 * Fábricas da Fase 4. O estado que a conferência (Fase 2) produz é gravado direto nas colunas (contrato §5.6),
 * sem chamar código da Fase 2. Não importe aqui nada que use a fila, o armazenamento ou o conector (o e2e importa este arquivo).
 */

export type MotivoProblemaTeste = 'AVARIADO' | 'USADO' | 'DIVERGENTE' | 'INCOMPLETO' | 'COM_DEFEITO' | 'OUTRO';
export type UnidadeEstoqueTeste = {
  sku?: string;
  destino: 'BOM' | 'PROBLEMA' | 'AUSENTE';
  motivo?: MotivoProblemaTeste;
  serial?: string | null;
  eanLido?: string | null;
};
export type DevolucaoNoEstoque = DevolucaoCriada & { itens: { id: string; unidade: number; sku: string }[] };

/** Devolução em AGUARDANDO_NF, uma unidade por entrada de `unidades` (contrato §5.6: casos a, b e c). */
export async function criarDevolucaoNoEstoqueTeste(
  db: DbOuTx,
  usuario: UsuarioSessao,
  opcoes: { unidades: UnidadeEstoqueTeste[]; canal?: Canal; pedido?: string; agora?: Date },
): Promise<DevolucaoNoEstoque> {
  const criada = await criarDevolucaoTeste(db, usuario, {
    ...(opcoes.canal ? { canal: opcoes.canal } : {}),
    ...(opcoes.pedido ? { pedido: opcoes.pedido } : {}),
    itens: opcoes.unidades.map((u) => ({ sku: u.sku ?? 'SKU-TESTE', quantidade: 1 })),
  });
  const itens = await db
    .select({ id: itensDevolucao.id, unidade: itensDevolucao.unidade, sku: itensDevolucao.sku })
    .from(itensDevolucao)
    .where(eq(itensDevolucao.devolucaoId, criada.id))
    .orderBy(asc(itensDevolucao.unidade));
  for (const [i, item] of itens.entries()) {
    const u = opcoes.unidades[i];
    await db
      .update(itensDevolucao)
      .set(
        u.destino === 'AUSENTE'
          ? { status: 'AUSENTE', destino: null, motivo: 'AUSENTE' }
          : {
              status: 'AGUARDANDO_NF',
              destino: u.destino,
              motivo: u.destino === 'PROBLEMA' ? (u.motivo ?? 'AVARIADO') : null,
              serial: u.serial ?? null,
              eanLido: u.eanLido ?? null,
            },
      )
      .where(eq(itensDevolucao.id, item.id));
  }
  const agora = opcoes.agora ?? new Date();
  await db.update(devolucoes).set({ status: 'AGUARDANDO_NF', recebidaEm: agora, conferidaEm: agora }).where(eq(devolucoes.id, criada.id));
  return { ...criada, itens };
}
```

`src/modules/fiscal/schema.int.test.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { notasFiscais, notasVenda, regrasFiscais } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarDevolucaoTeste, criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { referenciaDaNota } from './dominio';

const { db, sql } = criarDbTeste();
let gestor: UsuarioSessao;

beforeEach(async () => {
  await limparTabelas(sql);
  gestor = await criarUsuarioTeste(db, 'GESTOR');
});
afterAll(async () => {
  await sql.end();
});

function novaNota(devolucaoId: string | null, loteId: string | null = null) {
  const id = randomUUID();
  return {
    id,
    tipo: 'DEVOLUCAO_VENDA' as const,
    devolucaoId,
    loteId,
    ambiente: 'HOMOLOGACAO' as const,
    referenciaEmissor: referenciaDaNota(id),
  };
}

const DESTINATARIO = {
  nome: 'Maria',
  cpf: '52998224725',
  cnpj: null,
  ie: null,
  indicadorIe: 9 as const,
  logradouro: 'Rua B',
  numero: '50',
  complemento: null,
  bairro: 'Jardim',
  cidade: 'Sao Paulo',
  uf: 'SP',
  cep: '01002000',
};

describe('tabelas fiscais (contrato §4.3)', () => {
  it('uma NF ativa por devolução: outra só depois de cancelar a anterior', async () => {
    const dev = await criarDevolucaoTeste(db, gestor);
    const primeira = novaNota(dev.id);
    await db.insert(notasFiscais).values(primeira);
    await expect(db.insert(notasFiscais).values(novaNota(dev.id))).rejects.toThrow();
    await db.update(notasFiscais).set({ situacao: 'CANCELADA' }).where(eq(notasFiscais.id, primeira.id));
    await expect(db.insert(notasFiscais).values(novaNota(dev.id))).resolves.toBeDefined();
  });

  it('a nota é de uma devolução ou de um lote, nunca dos dois nem de nenhum', async () => {
    const dev = await criarDevolucaoTeste(db, gestor);
    await expect(db.insert(notasFiscais).values(novaNota(null, null))).rejects.toThrow();
    await expect(db.insert(notasFiscais).values(novaNota(dev.id, randomUUID()))).rejects.toThrow();
    await expect(db.insert(notasFiscais).values({ ...novaNota(null, randomUUID()), tipo: 'REMESSA_CONSERTO' })).resolves.toBeDefined();
  });

  it('a referência do emissor é única e nasce em PROCESSANDO', async () => {
    const dev = await criarDevolucaoTeste(db, gestor);
    const outra = await criarDevolucaoTeste(db, gestor);
    const nota = novaNota(dev.id);
    await db.insert(notasFiscais).values(nota);
    await expect(db.insert(notasFiscais).values({ ...novaNota(outra.id), referenciaEmissor: nota.referenciaEmissor })).rejects.toThrow();
    const [gravada] = await db.select().from(notasFiscais).where(eq(notasFiscais.id, nota.id));
    expect(gravada).toMatchObject({ situacao: 'PROCESSANDO', chavesReferenciadas: [], referenciaEmissor: expect.stringMatching(/^[0-9a-f]{32}$/) });
  });

  it('NF de venda única por (devolução, chave) e regra única por (tipo, operação)', async () => {
    const dev = await criarDevolucaoTeste(db, gestor);
    const venda = { devolucaoId: dev.id, chave: '35261011444777000161550010000001011000001012', origem: 'ANEXO' as const, xmlCaminho: 'x.xml', destinatario: DESTINATARIO, itens: [] };
    await db.insert(notasVenda).values(venda);
    await expect(db.insert(notasVenda).values(venda)).rejects.toThrow();

    const regra = {
      tipoNota: 'DEVOLUCAO_VENDA' as const,
      operacao: 'DENTRO_ESTADO' as const,
      cfop: '1202',
      icmsSituacaoTributaria: '900',
      pisSituacaoTributaria: '98',
      cofinsSituacaoTributaria: '98',
      naturezaOperacao: 'Devolucao de venda',
    };
    await db.insert(regrasFiscais).values(regra);
    await expect(db.insert(regrasFiscais).values(regra)).rejects.toThrow();
  });
});
```

Rode: `npm run test:int -- src/modules/fiscal/schema.int.test.ts`
Esperado: PASS (4 testes).

- [ ] **Passo 6: Rodar tudo**

Rode: `npm test && npm run test:int && npm run typecheck && npm run lint`
Esperado: tudo PASS.

- [ ] **Passo 7: Commit**

```bash
cd "/c/Users/idmpc/devolucoes-wt/fase-4"
git add -A
git commit -m "feat: base fiscal (vocabulário, tabelas notas_fiscais/notas_venda/regras_fiscais, transições da NF, chave de acesso e porta de lotes sem lotes)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 2: Configuração fiscal no servidor (dados da empresa, ambiente, regras e pendências)

**Arquivos:**
- Criar: `src/modules/fiscal/regras.ts`, `src/modules/fiscal/configuracao.ts`
- Modificar (acrescentar imports e código no final): `tests/helpers/fabricas-fiscal.ts`
- Testes: `src/modules/fiscal/regras.test.ts`, `src/modules/fiscal/configuracao.test.ts`, `src/modules/fiscal/configuracao.int.test.ts`

**Interfaces:**
- Consome: `lerConfiguracao`, `REGIMES_TRIBUTARIOS`, `AMBIENTES_NFE`, `configuracoes` (Parte A); `lerEnv`, `type Env`; `pode`; `registrarEvento`; `normalizarCnpj`, `normalizarCep`, `normalizarUf`; Tarefa 1 (`dominio.ts`, `ErroFiscal`, `regrasFiscais`, `DadosEmitente`).
- Produz:
  - `regras.ts`: `type RegraFiscal = { tipoNota; operacao; cfop; icmsSituacaoTributaria; pisSituacaoTributaria; cofinsSituacaoTributaria; naturezaOperacao; informacoesComplementares: string | null }`, `type RegraListada = RegraFiscal & { salva: boolean; atualizadoEm: Date | null }`, `type EntradaRegra = { cfop; icms; pis; cofins; natureza; informacoes }` (strings), `NATUREZA_MAXIMA = 60`, `INFORMACOES_MAXIMAS = 2000`, `rotuloRegra(tipo, operacao): string`, `sugestaoDeRegra(tipo, operacao, regime): RegraFiscal`, `primeiroDigitoCfop(tipo, operacao): string`, `conferirIcmsComRegime(icms, regime): string | null`, `validarRegra(tipo, operacao, e, regime): { dados: RegraFiscal | null; erros: string[] }`, `salvarRegra(db, regra, usuario): Promise<void>`, `listarRegras(db): Promise<{ regime: RegimeTributario | null; regras: RegraListada[] }>`, `regraFiscal(db, tipo, operacao): Promise<RegraFiscal>`
  - `configuracao.ts` (contrato §5.7): `type ConfiguracaoFiscal`, `lerConfiguracaoFiscal(db)`, `regraFiscal` e `type RegraFiscal` (reexportados), `operacaoPorUf(ufEmpresa, ufDestinatario)`; e também `type DadosEmpresa = DadosEmitente & { regime; serie: string }`, `CAMPOS_EMPRESA`, `type EntradaEmpresa`, `validarDadosEmpresa(e)`, `entradaDaConfiguracao(c)`, `salvarDadosEmpresa(db, dados, usuario, agora?)`, `type SituacaoEmissor = { simulado; tokenHomologacao; tokenProducao }`, `situacaoDoEmissor(env?)`, `validarTrocaAmbiente({ ambiente, confirmado, emissor })`, `salvarAmbiente(db, ambiente, usuario, agora?)`, `pendenciasFiscais(db): Promise<string[]>`
  - fábricas: `EMPRESA_TESTE: DadosEmpresa` (CNPJ `11444777000161`, SP, Simples, série `1`), `configurarFiscalTeste(db, gestor, opcoes?)`, `limparFiscalTeste(db)`

- [ ] **Passo 1: Escrever os testes unitários que falham**

`src/modules/fiscal/regras.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { OPERACOES_FISCAIS, TIPOS_NOTA } from './dominio';
import { conferirIcmsComRegime, rotuloRegra, sugestaoDeRegra, validarRegra, type EntradaRegra } from './regras';

const ENTRADA: EntradaRegra = { cfop: '1202', icms: '900', pis: '98', cofins: '98', natureza: '  Devolucao   de venda ', informacoes: '' };

describe('sugestões das regras (spec §8.3; o contador valida)', () => {
  it('devolução de venda: 1202 dentro e 2202 fora; CSOSN no Simples e CST no Presumido e no Real', () => {
    expect(sugestaoDeRegra('DEVOLUCAO_VENDA', 'DENTRO_ESTADO', 'SIMPLES')).toEqual({
      tipoNota: 'DEVOLUCAO_VENDA',
      operacao: 'DENTRO_ESTADO',
      cfop: '1202',
      icmsSituacaoTributaria: '900',
      pisSituacaoTributaria: '98',
      cofinsSituacaoTributaria: '98',
      naturezaOperacao: 'Devolucao de venda',
      informacoesComplementares: 'Devolucao referente a NF-e {chaves}. Devolucao {devolucao}.',
    });
    expect(sugestaoDeRegra('DEVOLUCAO_VENDA', 'FORA_ESTADO', 'PRESUMIDO')).toMatchObject({ cfop: '2202', icmsSituacaoTributaria: '00' });
    expect(sugestaoDeRegra('REMESSA_CONSERTO', 'FORA_ESTADO', 'REAL')).toMatchObject({ cfop: '6915', icmsSituacaoTributaria: '41', pisSituacaoTributaria: '49' });
    expect(sugestaoDeRegra('REMESSA_TROCA_GARANTIA', 'DENTRO_ESTADO', 'SIMPLES')).toMatchObject({ cfop: '5949', icmsSituacaoTributaria: '400' });
  });

  it('toda sugestão passa na própria validação, em todo regime', () => {
    for (const regime of ['SIMPLES', 'PRESUMIDO', 'REAL'] as const) {
      for (const tipo of TIPOS_NOTA) {
        for (const operacao of OPERACOES_FISCAIS) {
          const s = sugestaoDeRegra(tipo, operacao, regime);
          const entrada = {
            cfop: s.cfop,
            icms: s.icmsSituacaoTributaria,
            pis: s.pisSituacaoTributaria,
            cofins: s.cofinsSituacaoTributaria,
            natureza: s.naturezaOperacao,
            informacoes: s.informacoesComplementares ?? '',
          };
          expect(validarRegra(tipo, operacao, entrada, regime).erros, `${tipo} ${operacao} ${regime}`).toEqual([]);
        }
      }
    }
  });

  it('rótulo da combinação (mensagem "Falta a regra fiscal", spec §8.2)', () => {
    expect(rotuloRegra('REMESSA_CONSERTO', 'FORA_ESTADO')).toBe('Remessa para conserto, fora do estado');
  });
});

describe('validarRegra', () => {
  it('normaliza a natureza e deixa as informações vazias como null', () => {
    expect(validarRegra('DEVOLUCAO_VENDA', 'DENTRO_ESTADO', ENTRADA, 'SIMPLES').dados).toMatchObject({
      naturezaOperacao: 'Devolucao de venda',
      informacoesComplementares: null,
    });
  });

  it('o CFOP precisa combinar com a nota (entrada 1/2, saída 5/6) e com a operação', () => {
    expect(validarRegra('DEVOLUCAO_VENDA', 'DENTRO_ESTADO', { ...ENTRADA, cfop: '5202' }, 'SIMPLES').erros).toEqual([
      'O CFOP 5202 não serve para Devolução de venda, dentro do estado: use um CFOP que começa com 1',
    ]);
    expect(validarRegra('REMESSA_CONSERTO', 'FORA_ESTADO', { ...ENTRADA, cfop: '5915', pis: '49', cofins: '49' }, 'SIMPLES').erros).toEqual([
      'O CFOP 5915 não serve para Remessa para conserto, fora do estado: use um CFOP que começa com 6',
    ]);
    expect(validarRegra('DEVOLUCAO_VENDA', 'DENTRO_ESTADO', { ...ENTRADA, cfop: '12' }, 'SIMPLES').erros).toEqual(['CFOP: use 4 números']);
  });

  it('CSOSN no Simples, CST no Presumido e no Real (spec §8.2); PIS, COFINS e natureza', () => {
    const { dados, erros } = validarRegra(
      'DEVOLUCAO_VENDA',
      'DENTRO_ESTADO',
      { ...ENTRADA, icms: '102', pis: '1', cofins: '', natureza: 'x'.repeat(61) },
      'PRESUMIDO',
    );
    expect(dados).toBeNull();
    expect(erros).toEqual([
      'No Lucro Presumido o ICMS usa CST (00, 02, 10, 15, 20, 30, 40, 41, 50, 51, 53, 60, 61, 70, 90), não 102.',
      'CST do PIS inválido: 1',
      'CST do COFINS inválido: (vazio)',
      'Natureza da operação: no máximo 60 caracteres',
    ]);
  });

  it('conferirIcmsComRegime', () => {
    expect(conferirIcmsComRegime('900', 'SIMPLES')).toBeNull();
    expect(conferirIcmsComRegime('00', 'SIMPLES')).toBe('No Simples Nacional o ICMS usa CSOSN (101, 102, 103, 201, 202, 203, 300, 400, 500, 900), não 00.');
    expect(conferirIcmsComRegime('41', 'REAL')).toBeNull();
  });
});
```

`src/modules/fiscal/configuracao.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { operacaoPorUf, validarDadosEmpresa, validarTrocaAmbiente, type EntradaEmpresa } from './configuracao';

const OK: EntradaEmpresa = {
  razao_social: ' Empresa  Teste Ltda ',
  cnpj: '11.444.777/0001-61',
  ie: '110.042.490.114',
  cep: '01001-000',
  logradouro: 'Rua A',
  numero: '100',
  complemento: '',
  bairro: 'Centro',
  cidade: 'Sao Paulo',
  uf: 'sp',
  regime: 'SIMPLES',
  serie: '002',
};

describe('validarDadosEmpresa', () => {
  it('normaliza CNPJ, IE, CEP, UF e série', () => {
    expect(validarDadosEmpresa(OK)).toEqual({
      dados: {
        razaoSocial: 'Empresa Teste Ltda',
        cnpj: '11444777000161',
        ie: '110042490114',
        logradouro: 'Rua A',
        numero: '100',
        complemento: null,
        bairro: 'Centro',
        cidade: 'Sao Paulo',
        uf: 'SP',
        cep: '01001000',
        regime: 'SIMPLES',
        serie: '2',
      },
      erros: [],
    });
  });

  it('junta os erros na ordem do formulário', () => {
    const { dados, erros } = validarDadosEmpresa({
      ...OK,
      razao_social: '',
      cnpj: '11.444.777/0001-62',
      ie: 'ABC',
      cep: '123',
      logradouro: '',
      uf: 'XX',
      regime: '',
      serie: '900',
    });
    expect(dados).toBeNull();
    expect(erros).toEqual([
      'Informe a razão social',
      'CNPJ inválido',
      'Inscrição estadual inválida: use só os números',
      'CEP inválido',
      'Informe o logradouro',
      'Escolha a UF',
      'Escolha o regime tributário',
      'Série da NF-e inválida: use um número de 0 a 889',
    ]);
  });

  it('limita os textos a 60 caracteres (limite da NF-e)', () => {
    expect(validarDadosEmpresa({ ...OK, bairro: 'x'.repeat(61) }).erros).toEqual(['Bairro: no máximo 60 caracteres']);
  });
});

describe('validarTrocaAmbiente', () => {
  const focusSemProducao = { simulado: false, tokenHomologacao: true, tokenProducao: false };

  it('homologação sempre pode', () => {
    expect(validarTrocaAmbiente({ ambiente: 'HOMOLOGACAO', confirmado: false, emissor: focusSemProducao })).toEqual({ ambiente: 'HOMOLOGACAO', erros: [] });
  });

  it('produção exige a confirmação do contador e, com a Focus de verdade, o token de produção', () => {
    expect(validarTrocaAmbiente({ ambiente: 'PRODUCAO', confirmado: false, emissor: focusSemProducao }).erros).toEqual([
      'Para passar para produção, confirme que o contador validou as regras e as notas de homologação.',
      'Falta o token de produção da Focus NFe (FOCUS_TOKEN_PRODUCAO) no .env do servidor.',
    ]);
    expect(validarTrocaAmbiente({ ambiente: 'PRODUCAO', confirmado: true, emissor: { ...focusSemProducao, tokenProducao: true } })).toEqual({
      ambiente: 'PRODUCAO',
      erros: [],
    });
  });

  it('com o emissor simulado, basta a confirmação; ambiente desconhecido é recusado', () => {
    const simulado = { simulado: true, tokenHomologacao: false, tokenProducao: false };
    expect(validarTrocaAmbiente({ ambiente: 'PRODUCAO', confirmado: true, emissor: simulado }).erros).toEqual([]);
    expect(validarTrocaAmbiente({ ambiente: 'TESTE', confirmado: true, emissor: simulado }).erros).toEqual(['Escolha o ambiente da NF-e']);
  });
});

describe('operacaoPorUf (spec §8.4)', () => {
  it('mesma UF é dentro do estado; outra UF, fora', () => {
    expect(operacaoPorUf('SP', ' sp ')).toBe('DENTRO_ESTADO');
    expect(operacaoPorUf('SP', 'RJ')).toBe('FORA_ESTADO');
  });
});
```

Rode: `npm test -- src/modules/fiscal`
Esperado: FAIL (`./regras` e `./configuracao` não existem).

- [ ] **Passo 2: Implementar as regras**

`src/modules/fiscal/regras.ts`:

```ts
import { and, eq } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { regrasFiscais } from '@/db/schema';
import { pode } from '@/modules/auth/permissoes';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import type { RegimeTributario } from '@/modules/configuracoes/dominio';
import { lerConfiguracao } from '@/modules/configuracoes/ler';
import { registrarEvento } from '@/modules/historico/eventos';
import {
  CSOSN,
  CST_ICMS,
  CST_PIS_COFINS,
  OPERACOES_FISCAIS,
  ROTULO_OPERACAO,
  ROTULO_REGIME,
  ROTULO_TIPO_NOTA,
  TIPOS_NOTA,
  type OperacaoFiscal,
  type TipoNota,
} from './dominio';
import { ErroFiscal } from './erros';

/** Spec §5.1 (RegraFiscal): por tipo de nota e operação, CFOP, CST/CSOSN, CST de PIS e COFINS e o modelo de informações. */
export type RegraFiscal = {
  tipoNota: TipoNota;
  operacao: OperacaoFiscal;
  cfop: string;
  icmsSituacaoTributaria: string;
  pisSituacaoTributaria: string;
  cofinsSituacaoTributaria: string;
  naturezaOperacao: string;
  informacoesComplementares: string | null;
};
export type RegraListada = RegraFiscal & { salva: boolean; atualizadoEm: Date | null };
/** Campos do formulário, como chegam (texto). */
export type EntradaRegra = { cfop: string; icms: string; pis: string; cofins: string; natureza: string; informacoes: string };

export const NATUREZA_MAXIMA = 60;
export const INFORMACOES_MAXIMAS = 2000;

type Sugestao = { cfop: string; csosn: string; cst: string; pisCofins: string; natureza: string };

/** Spec §8.3 (CFOP) mais CST/CSOSN e PIS/COFINS da pesquisa focus-nfe.md §2. Só preenchem o formulário: nada nasce gravado (D13). */
const SUGESTOES: Record<TipoNota, Record<OperacaoFiscal, Sugestao>> = {
  DEVOLUCAO_VENDA: {
    DENTRO_ESTADO: { cfop: '1202', csosn: '900', cst: '00', pisCofins: '98', natureza: 'Devolucao de venda' },
    FORA_ESTADO: { cfop: '2202', csosn: '900', cst: '00', pisCofins: '98', natureza: 'Devolucao de venda' },
  },
  REMESSA_CONSERTO: {
    DENTRO_ESTADO: { cfop: '5915', csosn: '400', cst: '41', pisCofins: '49', natureza: 'Remessa para conserto' },
    FORA_ESTADO: { cfop: '6915', csosn: '400', cst: '41', pisCofins: '49', natureza: 'Remessa para conserto' },
  },
  REMESSA_TROCA_GARANTIA: {
    DENTRO_ESTADO: { cfop: '5949', csosn: '400', cst: '41', pisCofins: '49', natureza: 'Remessa para troca ou garantia' },
    FORA_ESTADO: { cfop: '6949', csosn: '400', cst: '41', pisCofins: '49', natureza: 'Remessa para troca ou garantia' },
  },
};

/**
 * Modelo das informações complementares. Marcadores: {chaves} (NF de venda referenciadas), {devolucao} (código DEV),
 * {seriais} (S/N) e, nas remessas (Fase 5, spec §8.5), {lote}.
 */
const INFORMACOES_SUGERIDAS: Record<TipoNota, string> = {
  DEVOLUCAO_VENDA: 'Devolucao referente a NF-e {chaves}. Devolucao {devolucao}.',
  REMESSA_CONSERTO: 'Lote {lote}. S/N: {seriais}.',
  REMESSA_TROCA_GARANTIA: 'Lote {lote}. S/N: {seriais}.',
};

export function rotuloRegra(tipo: TipoNota, operacao: OperacaoFiscal): string {
  return `${ROTULO_TIPO_NOTA[tipo]}, ${ROTULO_OPERACAO[operacao]}`;
}

export function sugestaoDeRegra(tipo: TipoNota, operacao: OperacaoFiscal, regime: RegimeTributario): RegraFiscal {
  const s = SUGESTOES[tipo][operacao];
  return {
    tipoNota: tipo,
    operacao,
    cfop: s.cfop,
    icmsSituacaoTributaria: regime === 'SIMPLES' ? s.csosn : s.cst,
    pisSituacaoTributaria: s.pisCofins,
    cofinsSituacaoTributaria: s.pisCofins,
    naturezaOperacao: s.natureza,
    informacoesComplementares: INFORMACOES_SUGERIDAS[tipo],
  };
}

/** CFOP de entrada (devolução de venda) começa com 1 (dentro) ou 2 (fora); de saída (remessa), com 5 ou 6. */
export function primeiroDigitoCfop(tipo: TipoNota, operacao: OperacaoFiscal): string {
  const dentro = operacao === 'DENTRO_ESTADO';
  if (tipo === 'DEVOLUCAO_VENDA') return dentro ? '1' : '2';
  return dentro ? '5' : '6';
}

export function conferirIcmsComRegime(icms: string, regime: RegimeTributario): string | null {
  if (regime === 'SIMPLES') {
    return (CSOSN as readonly string[]).includes(icms) ? null : `No ${ROTULO_REGIME.SIMPLES} o ICMS usa CSOSN (${CSOSN.join(', ')}), não ${icms}.`;
  }
  return (CST_ICMS as readonly string[]).includes(icms) ? null : `No ${ROTULO_REGIME[regime]} o ICMS usa CST (${CST_ICMS.join(', ')}), não ${icms}.`;
}

export function validarRegra(
  tipo: TipoNota,
  operacao: OperacaoFiscal,
  e: EntradaRegra,
  regime: RegimeTributario,
): { dados: RegraFiscal | null; erros: string[] } {
  const erros: string[] = [];
  const cfop = e.cfop.replace(/\D/g, '');
  const digito = primeiroDigitoCfop(tipo, operacao);
  if (!/^\d{4}$/.test(cfop)) erros.push('CFOP: use 4 números');
  else if (!cfop.startsWith(digito)) erros.push(`O CFOP ${cfop} não serve para ${rotuloRegra(tipo, operacao)}: use um CFOP que começa com ${digito}`);
  const icms = e.icms.trim();
  const erroIcms = conferirIcmsComRegime(icms, regime);
  if (erroIcms) erros.push(erroIcms);
  const pis = e.pis.trim();
  const cofins = e.cofins.trim();
  if (!(CST_PIS_COFINS as readonly string[]).includes(pis)) erros.push(`CST do PIS inválido: ${pis || '(vazio)'}`);
  if (!(CST_PIS_COFINS as readonly string[]).includes(cofins)) erros.push(`CST do COFINS inválido: ${cofins || '(vazio)'}`);
  const natureza = e.natureza.trim().replace(/\s+/g, ' ');
  if (!natureza) erros.push('Informe a natureza da operação');
  else if (natureza.length > NATUREZA_MAXIMA) erros.push(`Natureza da operação: no máximo ${NATUREZA_MAXIMA} caracteres`);
  const informacoes = e.informacoes.trim();
  if (informacoes.length > INFORMACOES_MAXIMAS) erros.push(`Informações complementares: no máximo ${INFORMACOES_MAXIMAS} caracteres`);
  if (erros.length > 0) return { dados: null, erros };
  return {
    dados: {
      tipoNota: tipo,
      operacao,
      cfop,
      icmsSituacaoTributaria: icms,
      pisSituacaoTributaria: pis,
      cofinsSituacaoTributaria: cofins,
      naturezaOperacao: natureza,
      informacoesComplementares: informacoes || null,
    },
    erros: [],
  };
}

function paraRegra(linha: typeof regrasFiscais.$inferSelect): RegraFiscal {
  return {
    tipoNota: linha.tipoNota,
    operacao: linha.operacao,
    cfop: linha.cfop,
    icmsSituacaoTributaria: linha.icmsSituacaoTributaria,
    pisSituacaoTributaria: linha.pisSituacaoTributaria,
    cofinsSituacaoTributaria: linha.cofinsSituacaoTributaria,
    naturezaOperacao: linha.naturezaOperacao,
    informacoesComplementares: linha.informacoesComplementares,
  };
}

export async function salvarRegra(db: DbOuTx, regra: RegraFiscal, usuario: UsuarioSessao, agora: Date = new Date()): Promise<void> {
  if (!pode(usuario.perfil, 'administrar')) throw new ErroFiscal('Só o Gestor altera as regras fiscais.');
  const campos = {
    cfop: regra.cfop,
    icmsSituacaoTributaria: regra.icmsSituacaoTributaria,
    pisSituacaoTributaria: regra.pisSituacaoTributaria,
    cofinsSituacaoTributaria: regra.cofinsSituacaoTributaria,
    naturezaOperacao: regra.naturezaOperacao,
    informacoesComplementares: regra.informacoesComplementares,
    atualizadoPor: usuario.id,
    atualizadoEm: agora,
  };
  await db.transaction(async (tx) => {
    await tx
      .insert(regrasFiscais)
      .values({ tipoNota: regra.tipoNota, operacao: regra.operacao, ...campos })
      .onConflictDoUpdate({ target: [regrasFiscais.tipoNota, regrasFiscais.operacao], set: campos });
    await registrarEvento(tx, {
      entidade: 'configuracao',
      entidadeId: 'fiscal',
      acao: 'configuracao_alterada',
      usuarioId: usuario.id,
      dados: {
        secao: 'regra_fiscal',
        tipoNota: regra.tipoNota,
        operacao: regra.operacao,
        cfop: regra.cfop,
        icms: regra.icmsSituacaoTributaria,
        pis: regra.pisSituacaoTributaria,
        cofins: regra.cofinsSituacaoTributaria,
      },
    });
  });
}

/** As 6 combinações (3 tipos × 2 operações), salvas ou sugeridas (pelo regime atual; Simples enquanto não houver). */
export async function listarRegras(db: DbOuTx): Promise<{ regime: RegimeTributario | null; regras: RegraListada[] }> {
  const regime = (await lerConfiguracao(db)).regimeTributario ?? null;
  const salvas = await db.select().from(regrasFiscais);
  const regras = TIPOS_NOTA.flatMap((tipo) =>
    OPERACOES_FISCAIS.map((operacao): RegraListada => {
      const salva = salvas.find((r) => r.tipoNota === tipo && r.operacao === operacao);
      if (salva) return { ...paraRegra(salva), salva: true, atualizadoEm: salva.atualizadoEm };
      return { ...sugestaoDeRegra(tipo, operacao, regime ?? 'SIMPLES'), salva: false, atualizadoEm: null };
    }),
  );
  return { regime, regras };
}

/** Contrato §5.7: a regra salva da combinação, conferida com o regime (CSOSN × CST). Sem ela, a emissão é recusada (D13). */
export async function regraFiscal(db: DbOuTx, tipo: TipoNota, operacao: OperacaoFiscal): Promise<RegraFiscal> {
  const regime = (await lerConfiguracao(db)).regimeTributario;
  if (!regime) throw new ErroFiscal('Escolha o regime tributário em Configurações › Fiscal.');
  const [linha] = await db
    .select()
    .from(regrasFiscais)
    .where(and(eq(regrasFiscais.tipoNota, tipo), eq(regrasFiscais.operacao, operacao)));
  if (!linha) throw new ErroFiscal(`Falta a regra fiscal: ${rotuloRegra(tipo, operacao)}`);
  const regra = paraRegra(linha);
  const erro = conferirIcmsComRegime(regra.icmsSituacaoTributaria, regime);
  if (erro) throw new ErroFiscal(`Regra fiscal ${rotuloRegra(tipo, operacao)}: ${erro} Corrija em Configurações › Fiscal.`);
  return regra;
}
```

- [ ] **Passo 3: Implementar a configuração**

`src/modules/fiscal/configuracao.ts`:

```ts
import type { DadosEmitente } from '@/conectores/nfe/tipos';
import type { DbOuTx } from '@/db/client';
import { configuracoes } from '@/db/schema';
import { lerEnv, type Env } from '@/lib/env';
import { pode } from '@/modules/auth/permissoes';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { normalizarCep, normalizarCnpj, normalizarUf } from '@/modules/catalogo/documentos';
import { AMBIENTES_NFE, REGIMES_TRIBUTARIOS, type AmbienteNfe, type RegimeTributario } from '@/modules/configuracoes/dominio';
import { lerConfiguracao } from '@/modules/configuracoes/ler';
import { registrarEvento } from '@/modules/historico/eventos';
import { OPERACOES_FISCAIS, type OperacaoFiscal } from './dominio';
import { ErroFiscal } from './erros';
import { regraFiscal } from './regras';

export { regraFiscal, type RegraFiscal } from './regras';

/** Contrato §5.7. */
export type ConfiguracaoFiscal = { emitente: DadosEmitente; regime: RegimeTributario; serie: string | null; ambiente: AmbienteNfe };
export type DadosEmpresa = DadosEmitente & { regime: RegimeTributario; serie: string };
export const CAMPOS_EMPRESA = ['razao_social', 'cnpj', 'ie', 'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf', 'regime', 'serie'] as const;
export type EntradaEmpresa = Record<(typeof CAMPOS_EMPRESA)[number], string>;
export type SituacaoEmissor = { simulado: boolean; tokenHomologacao: boolean; tokenProducao: boolean };
type Configuracao = Awaited<ReturnType<typeof lerConfiguracao>>;

/** Limite dos campos de texto do emitente na NF-e. */
const TEXTO_MAXIMO = 60;
/** Séries 890 a 999 são reservadas (avulsa e contingência). */
const SERIE_MAXIMA = 889;

function ehRegime(texto: string): texto is RegimeTributario {
  return (REGIMES_TRIBUTARIOS as readonly string[]).includes(texto);
}
function ehAmbiente(texto: string): texto is AmbienteNfe {
  return (AMBIENTES_NFE as readonly string[]).includes(texto);
}
function exigirGestor(usuario: UsuarioSessao): void {
  if (!pode(usuario.perfil, 'administrar')) throw new ErroFiscal('Só o Gestor altera as configurações fiscais.');
}

/** Formulário "Dados da empresa" (spec §6.8): o emitente da NF-e, o regime tributário e a série exclusiva (spec §8.1). */
export function validarDadosEmpresa(e: EntradaEmpresa): { dados: DadosEmpresa | null; erros: string[] } {
  const erros: string[] = [];
  function texto(valor: string, nome: string, faltando: string | null): string | null {
    const s = valor.trim().replace(/\s+/g, ' ');
    if (!s) {
      if (faltando) erros.push(faltando);
      return null;
    }
    if (s.length > TEXTO_MAXIMO) {
      erros.push(`${nome}: no máximo ${TEXTO_MAXIMO} caracteres`);
      return null;
    }
    return s;
  }
  const razaoSocial = texto(e.razao_social, 'Razão social', 'Informe a razão social');
  const cnpjTexto = e.cnpj.trim();
  const cnpj = cnpjTexto ? normalizarCnpj(cnpjTexto) : null;
  if (!cnpjTexto) erros.push('Informe o CNPJ');
  else if (!cnpj) erros.push('CNPJ inválido');
  const ie = e.ie.toUpperCase().replace(/[.\-/\s]/g, '');
  if (!ie) erros.push('Informe a inscrição estadual');
  else if (!/^\d{2,14}$/.test(ie)) erros.push('Inscrição estadual inválida: use só os números');
  const cepTexto = e.cep.trim();
  const cep = cepTexto ? normalizarCep(cepTexto) : null;
  if (!cepTexto) erros.push('Informe o CEP');
  else if (!cep) erros.push('CEP inválido');
  const logradouro = texto(e.logradouro, 'Logradouro', 'Informe o logradouro');
  const numero = texto(e.numero, 'Número', 'Informe o número (ou S/N)');
  const complemento = texto(e.complemento, 'Complemento', null);
  const bairro = texto(e.bairro, 'Bairro', 'Informe o bairro');
  const cidade = texto(e.cidade, 'Cidade', 'Informe a cidade');
  const uf = normalizarUf(e.uf);
  if (!uf) erros.push('Escolha a UF');
  const regime = e.regime.trim();
  if (!ehRegime(regime)) erros.push('Escolha o regime tributário');
  const serie = e.serie.trim();
  if (!/^\d{1,3}$/.test(serie) || Number(serie) > SERIE_MAXIMA) erros.push(`Série da NF-e inválida: use um número de 0 a ${SERIE_MAXIMA}`);
  if (erros.length > 0 || !razaoSocial || !cnpj || !cep || !logradouro || !numero || !bairro || !cidade || !uf || !ehRegime(regime)) {
    return { dados: null, erros };
  }
  return {
    dados: { razaoSocial, cnpj, ie, logradouro, numero, complemento, bairro, cidade, uf, cep, regime, serie: String(Number(serie)) },
    erros: [],
  };
}

/** Valores atuais para o formulário (texto vazio onde ainda não há dado). */
export function entradaDaConfiguracao(c: Configuracao): EntradaEmpresa {
  return {
    razao_social: c.razaoSocial ?? '',
    cnpj: c.cnpj ?? '',
    ie: c.ie ?? '',
    cep: c.cep ?? '',
    logradouro: c.logradouro ?? '',
    numero: c.numero ?? '',
    complemento: c.complemento ?? '',
    bairro: c.bairro ?? '',
    cidade: c.cidade ?? '',
    uf: c.uf ?? '',
    regime: c.regimeTributario ?? '',
    serie: c.serieNfe ?? '',
  };
}

/** Grava só os campos fiscais da linha única (contrato §5.6: upsert em id = 1). */
export async function salvarDadosEmpresa(db: DbOuTx, d: DadosEmpresa, usuario: UsuarioSessao, agora: Date = new Date()): Promise<void> {
  exigirGestor(usuario);
  const campos = {
    razaoSocial: d.razaoSocial,
    cnpj: d.cnpj,
    ie: d.ie,
    logradouro: d.logradouro,
    numero: d.numero,
    complemento: d.complemento,
    bairro: d.bairro,
    cidade: d.cidade,
    uf: d.uf,
    cep: d.cep,
    regimeTributario: d.regime,
    serieNfe: d.serie,
    atualizadoPor: usuario.id,
    atualizadoEm: agora,
  };
  await db.transaction(async (tx) => {
    await tx.insert(configuracoes).values({ id: 1, ...campos }).onConflictDoUpdate({ target: configuracoes.id, set: campos });
    await registrarEvento(tx, {
      entidade: 'configuracao',
      entidadeId: 'fiscal',
      acao: 'configuracao_alterada',
      usuarioId: usuario.id,
      dados: { secao: 'empresa', regime: d.regime, serie: d.serie },
    });
  });
}

/** Tela de Configurações: diz se os tokens estão no .env, sem nunca mostrar o valor. */
export function situacaoDoEmissor(env: Env = lerEnv()): SituacaoEmissor {
  return {
    simulado: env.EMISSOR_NFE === 'falso',
    tokenHomologacao: Boolean(env.FOCUS_TOKEN_HOMOLOGACAO),
    tokenProducao: Boolean(env.FOCUS_TOKEN_PRODUCAO),
  };
}

/** Spec §8.1: começa em homologação; produção só depois da validação do contador. */
export function validarTrocaAmbiente(p: { ambiente: string; confirmado: boolean; emissor: SituacaoEmissor }): {
  ambiente: AmbienteNfe | null;
  erros: string[];
} {
  if (!ehAmbiente(p.ambiente)) return { ambiente: null, erros: ['Escolha o ambiente da NF-e'] };
  const erros: string[] = [];
  if (p.ambiente === 'PRODUCAO') {
    if (!p.confirmado) erros.push('Para passar para produção, confirme que o contador validou as regras e as notas de homologação.');
    if (!p.emissor.simulado && !p.emissor.tokenProducao) erros.push('Falta o token de produção da Focus NFe (FOCUS_TOKEN_PRODUCAO) no .env do servidor.');
  }
  return erros.length > 0 ? { ambiente: null, erros } : { ambiente: p.ambiente, erros: [] };
}

export async function salvarAmbiente(db: DbOuTx, ambiente: AmbienteNfe, usuario: UsuarioSessao, agora: Date = new Date()): Promise<void> {
  exigirGestor(usuario);
  const anterior = (await lerConfiguracao(db)).ambienteNfe;
  const campos = { ambienteNfe: ambiente, atualizadoPor: usuario.id, atualizadoEm: agora };
  await db.transaction(async (tx) => {
    await tx.insert(configuracoes).values({ id: 1, ...campos }).onConflictDoUpdate({ target: configuracoes.id, set: campos });
    await registrarEvento(tx, {
      entidade: 'configuracao',
      entidadeId: 'fiscal',
      acao: 'configuracao_alterada',
      de: anterior,
      para: ambiente,
      usuarioId: usuario.id,
      dados: { secao: 'ambiente_nfe' },
    });
  });
}

/** Contrato §5.7: ErroFiscal se faltar dado da empresa ou o regime. */
export async function lerConfiguracaoFiscal(db: DbOuTx): Promise<ConfiguracaoFiscal> {
  const c = await lerConfiguracao(db);
  const faltando: string[] = [];
  const exigir = (valor: string | null | undefined, nome: string): string => {
    if (!valor) faltando.push(nome);
    return valor ?? '';
  };
  const emitente: DadosEmitente = {
    razaoSocial: exigir(c.razaoSocial, 'razão social'),
    cnpj: exigir(c.cnpj, 'CNPJ'),
    ie: exigir(c.ie, 'inscrição estadual'),
    logradouro: exigir(c.logradouro, 'logradouro'),
    numero: exigir(c.numero, 'número'),
    complemento: c.complemento ?? null,
    bairro: exigir(c.bairro, 'bairro'),
    cidade: exigir(c.cidade, 'cidade'),
    uf: exigir(c.uf, 'UF'),
    cep: exigir(c.cep, 'CEP'),
  };
  if (faltando.length > 0) throw new ErroFiscal(`Preencha os dados da empresa em Configurações › Fiscal (falta: ${faltando.join(', ')}).`);
  if (!c.regimeTributario) throw new ErroFiscal('Escolha o regime tributário em Configurações › Fiscal.');
  return { emitente, regime: c.regimeTributario, serie: c.serieNfe ?? null, ambiente: c.ambienteNfe };
}

/** Spec §8.4: a operação vem da comparação entre a UF da empresa e a UF do destinatário. */
export function operacaoPorUf(ufEmpresa: string, ufDestinatario: string): OperacaoFiscal {
  return ufEmpresa.trim().toUpperCase() === ufDestinatario.trim().toUpperCase() ? 'DENTRO_ESTADO' : 'FORA_ESTADO';
}

/** O que impede a NF de devolução agora (D13): dados da empresa, regime e as 2 regras de devolução. Vazio = pode emitir. */
export async function pendenciasFiscais(db: DbOuTx): Promise<string[]> {
  const pendencias: string[] = [];
  const anotar = (erro: unknown): void => {
    if (!(erro instanceof ErroFiscal)) throw erro;
    if (!pendencias.includes(erro.message)) pendencias.push(erro.message);
  };
  await lerConfiguracaoFiscal(db).catch(anotar);
  for (const operacao of OPERACOES_FISCAIS) {
    await regraFiscal(db, 'DEVOLUCAO_VENDA', operacao).catch(anotar);
  }
  return pendencias;
}
```

Rode: `npm test -- src/modules/fiscal`
Esperado: PASS.

- [ ] **Passo 4: Fábricas da configuração**

Em `tests/helpers/fabricas-fiscal.ts`, acrescente estes imports no topo:

```ts
import { configuracoes, regrasFiscais } from '@/db/schema';
import type { RegimeTributario } from '@/modules/configuracoes/dominio';
import { salvarAmbiente, salvarDadosEmpresa, type DadosEmpresa } from '@/modules/fiscal/configuracao';
import { OPERACOES_FISCAIS, TIPOS_NOTA, type OperacaoFiscal } from '@/modules/fiscal/dominio';
import { salvarRegra, sugestaoDeRegra } from '@/modules/fiscal/regras';
```

(junte `configuracoes, regrasFiscais` ao import existente de `@/db/schema`, que fica `import { configuracoes, devolucoes, itensDevolucao, regrasFiscais } from '@/db/schema';`)

E acrescente no **final**:

```ts
/** A empresa dos testes: CNPJ e IE válidos, em SP, no Simples, série 1 (a mesma que o emissor falso devolve). */
export const EMPRESA_TESTE: DadosEmpresa = {
  razaoSocial: 'Empresa Teste Ltda',
  cnpj: '11444777000161',
  ie: '110042490114',
  logradouro: 'Rua A',
  numero: '100',
  complemento: null,
  bairro: 'Centro',
  cidade: 'Sao Paulo',
  uf: 'SP',
  cep: '01001000',
  regime: 'SIMPLES',
  serie: '1',
};

/**
 * Deixa a emissão pronta: dados da empresa, homologação e as 6 regras sugeridas. `naturezas` troca a natureza das regras de
 * devolução (ex.: "REJEITAR" faz o emissor falso rejeitar). `semRegras` apaga as regras (D13: a emissão fica recusada).
 */
export async function configurarFiscalTeste(
  db: DbOuTx,
  gestor: UsuarioSessao,
  opcoes: { regime?: RegimeTributario; uf?: string; serie?: string; naturezas?: Partial<Record<OperacaoFiscal, string>>; semRegras?: boolean } = {},
): Promise<void> {
  const regime = opcoes.regime ?? 'SIMPLES';
  await salvarDadosEmpresa(db, { ...EMPRESA_TESTE, regime, uf: opcoes.uf ?? EMPRESA_TESTE.uf, serie: opcoes.serie ?? EMPRESA_TESTE.serie }, gestor);
  await salvarAmbiente(db, 'HOMOLOGACAO', gestor);
  await db.delete(regrasFiscais);
  if (opcoes.semRegras) return;
  for (const tipo of TIPOS_NOTA) {
    for (const operacao of OPERACOES_FISCAIS) {
      const regra = sugestaoDeRegra(tipo, operacao, regime);
      const natureza = tipo === 'DEVOLUCAO_VENDA' ? opcoes.naturezas?.[operacao] : undefined;
      await salvarRegra(db, { ...regra, naturezaOperacao: natureza ?? regra.naturezaOperacao }, gestor);
    }
  }
}

/** Volta ao começo: sem regras e sem dados da empresa (a linha de configurações continua existindo). */
export async function limparFiscalTeste(db: DbOuTx): Promise<void> {
  await db.delete(regrasFiscais);
  await db.update(configuracoes).set({
    razaoSocial: null,
    cnpj: null,
    ie: null,
    logradouro: null,
    numero: null,
    complemento: null,
    bairro: null,
    cidade: null,
    uf: null,
    cep: null,
    regimeTributario: null,
    serieNfe: null,
    ambienteNfe: 'HOMOLOGACAO',
  });
}
```

- [ ] **Passo 5: Escrever o teste de integração**

`src/modules/fiscal/configuracao.int.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { listarEventos } from '@/modules/historico/eventos';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { EMPRESA_TESTE } from '../../../tests/helpers/fabricas-fiscal';
import { lerConfiguracaoFiscal, pendenciasFiscais, regraFiscal, salvarAmbiente, salvarDadosEmpresa } from './configuracao';
import { listarRegras, salvarRegra, sugestaoDeRegra } from './regras';

const { db, sql } = criarDbTeste();
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

describe('configuração fiscal no banco', () => {
  it('sem dados, a emissão fica bloqueada e as pendências dizem o que falta (D13)', async () => {
    const faltaEmpresa =
      'Preencha os dados da empresa em Configurações › Fiscal (falta: razão social, CNPJ, inscrição estadual, logradouro, número, bairro, cidade, UF, CEP).';
    await expect(lerConfiguracaoFiscal(db)).rejects.toThrow(faltaEmpresa);
    expect(await pendenciasFiscais(db)).toEqual([faltaEmpresa, 'Escolha o regime tributário em Configurações › Fiscal.']);
  });

  it('salva os dados da empresa, lê como emitente e registra no histórico', async () => {
    await salvarDadosEmpresa(db, EMPRESA_TESTE, gestor);
    expect(await lerConfiguracaoFiscal(db)).toEqual({
      emitente: {
        razaoSocial: 'Empresa Teste Ltda',
        cnpj: '11444777000161',
        ie: '110042490114',
        logradouro: 'Rua A',
        numero: '100',
        complemento: null,
        bairro: 'Centro',
        cidade: 'Sao Paulo',
        uf: 'SP',
        cep: '01001000',
      },
      regime: 'SIMPLES',
      serie: '1',
      ambiente: 'HOMOLOGACAO',
    });
    expect(await listarEventos(db, 'configuracao', 'fiscal')).toEqual([
      expect.objectContaining({ acao: 'configuracao_alterada', usuarioNome: gestor.nome, dados: { secao: 'empresa', regime: 'SIMPLES', serie: '1' } }),
    ]);
    expect(await pendenciasFiscais(db)).toEqual([
      'Falta a regra fiscal: Devolução de venda, dentro do estado',
      'Falta a regra fiscal: Devolução de venda, fora do estado',
    ]);
  });

  it('a regra salva vale; a que não combina com o regime é recusada na emissão', async () => {
    await salvarDadosEmpresa(db, EMPRESA_TESTE, gestor);
    await salvarRegra(db, sugestaoDeRegra('DEVOLUCAO_VENDA', 'DENTRO_ESTADO', 'SIMPLES'), gestor);
    expect(await regraFiscal(db, 'DEVOLUCAO_VENDA', 'DENTRO_ESTADO')).toMatchObject({ cfop: '1202', icmsSituacaoTributaria: '900' });
    await expect(regraFiscal(db, 'REMESSA_CONSERTO', 'FORA_ESTADO')).rejects.toThrow('Falta a regra fiscal: Remessa para conserto, fora do estado');

    await salvarDadosEmpresa(db, { ...EMPRESA_TESTE, regime: 'PRESUMIDO' }, gestor);
    await expect(regraFiscal(db, 'DEVOLUCAO_VENDA', 'DENTRO_ESTADO')).rejects.toThrow(
      'Regra fiscal Devolução de venda, dentro do estado: No Lucro Presumido o ICMS usa CST',
    );
  });

  it('salvar de novo atualiza a mesma combinação; a lista traz as 6, salvas ou sugeridas', async () => {
    await salvarDadosEmpresa(db, { ...EMPRESA_TESTE, regime: 'REAL' }, gestor);
    const regra = sugestaoDeRegra('DEVOLUCAO_VENDA', 'FORA_ESTADO', 'REAL');
    await salvarRegra(db, regra, gestor);
    await salvarRegra(db, { ...regra, naturezaOperacao: 'Devolucao de mercadoria' }, gestor);
    const { regime, regras } = await listarRegras(db);
    expect(regime).toBe('REAL');
    expect(regras.map((r) => [r.tipoNota, r.operacao, r.salva, r.icmsSituacaoTributaria])).toEqual([
      ['DEVOLUCAO_VENDA', 'DENTRO_ESTADO', false, '00'],
      ['DEVOLUCAO_VENDA', 'FORA_ESTADO', true, '00'],
      ['REMESSA_CONSERTO', 'DENTRO_ESTADO', false, '41'],
      ['REMESSA_CONSERTO', 'FORA_ESTADO', false, '41'],
      ['REMESSA_TROCA_GARANTIA', 'DENTRO_ESTADO', false, '41'],
      ['REMESSA_TROCA_GARANTIA', 'FORA_ESTADO', false, '41'],
    ]);
    expect(regras[1]).toMatchObject({ naturezaOperacao: 'Devolucao de mercadoria', atualizadoEm: expect.any(Date) });
  });

  it('troca o ambiente com o histórico de/para', async () => {
    await salvarAmbiente(db, 'PRODUCAO', gestor);
    expect((await listarEventos(db, 'configuracao', 'fiscal')).at(-1)).toMatchObject({ de: 'HOMOLOGACAO', para: 'PRODUCAO' });
  });

  it('só o Gestor altera', async () => {
    await expect(salvarDadosEmpresa(db, EMPRESA_TESTE, fiscal)).rejects.toThrow('Só o Gestor altera as configurações fiscais.');
    await expect(salvarAmbiente(db, 'PRODUCAO', fiscal)).rejects.toThrow('Só o Gestor altera as configurações fiscais.');
    await expect(salvarRegra(db, sugestaoDeRegra('DEVOLUCAO_VENDA', 'DENTRO_ESTADO', 'SIMPLES'), fiscal)).rejects.toThrow(
      'Só o Gestor altera as regras fiscais.',
    );
  });
});
```

Rode: `npm run test:int -- src/modules/fiscal`
Esperado: PASS.

- [ ] **Passo 6: Rodar tudo**

Rode: `npm test && npm run test:int && npm run typecheck && npm run lint`
Esperado: tudo PASS.

- [ ] **Passo 7: Commit**

```bash
cd "/c/Users/idmpc/devolucoes-wt/fase-4"
git add -A
git commit -m "feat: configuração fiscal (dados da empresa, regime, série, ambiente, regras com CFOP sugerido e pendências da emissão)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 3: Tela Configurações › Fiscal (Gestor edita, Fiscal só vê)

**Arquivos:**
- Modificar (substituir o `EmBreve` da Parte A): `src/app/(app)/configuracoes/fiscal/page.tsx`
- Criar: `src/app/(app)/configuracoes/fiscal/acoes.ts`, `FormularioEmpresa.tsx`, `FormularioAmbiente.tsx`, `FormularioRegra.tsx`, `src/app/(app)/configuracoes/fiscal/regras/[tipo]/[operacao]/page.tsx`
- Criar: `tests/e2e/apoio-fiscal.ts` (a Tarefa 9 substitui com a versão completa)
- Teste: `tests/e2e/fiscal-configuracoes.spec.ts`

**Interfaces:**
- Consome: Tarefa 2 inteira; `lerConfiguracao`, `REGIMES_TRIBUTARIOS`, `AMBIENTES_NFE` (Parte A); `CampoTexto`, `ListaErros`, `RodapeFormulario`, `MensagemSucesso`, `Selo`, `useEnvioFormulario`, `estilos` (Fase 1); `entrarComo`, `comBanco`, `usuarioPorEmail`, `semRolagemLateral`, `paginaNaoEncontrada` (`tests/e2e/apoio.ts`).
- Produz:
  - rotas `/configuracoes/fiscal` (permissão `gerir_fiscal`; formulários só para `administrar`) e `/configuracoes/fiscal/regras/[tipo]/[operacao]`
  - ações `salvarEmpresaAcao`, `salvarAmbienteAcao`, `salvarRegraAcao(tipo, operacao, ...)`, com `type EstadoFormulario = { erros: string[] }`; sucesso redireciona para `/configuracoes/fiscal?ok=empresa|ambiente|regra`
  - textos usados no e2e: "Configurações fiscais", "A emissão de NF está bloqueada", "Salvar dados da empresa", "Salvar ambiente", "Salvar regra", "Só o Gestor altera estas configurações.", "Sugestão, ainda não salva", "Salva"
  - `tests/e2e/apoio-fiscal.ts`: `prepararFiscal(opcoes?)`, `limparFiscal()`

- [ ] **Passo 1: Escrever o teste ponta a ponta que falha**

`tests/e2e/apoio-fiscal.ts`:

```ts
import { configurarFiscalTeste, limparFiscalTeste } from '../helpers/fabricas-fiscal';
import { comBanco, usuarioPorEmail } from './apoio';
import { USUARIOS_E2E } from './dados';

/** Deixa a emissão pronta (empresa em SP, Simples, homologação e as 6 regras sugeridas). Cada spec chama no começo. */
export async function prepararFiscal(opcoes: Parameters<typeof configurarFiscalTeste>[2] = {}): Promise<void> {
  await comBanco(async (db) => {
    const gestor = await usuarioPorEmail(db, USUARIOS_E2E.gestor.email);
    await configurarFiscalTeste(db, gestor, opcoes);
  });
}

export async function limparFiscal(): Promise<void> {
  await comBanco((db) => limparFiscalTeste(db));
}
```

`tests/e2e/fiscal-configuracoes.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { entrarComo, paginaNaoEncontrada, semRolagemLateral } from './apoio';
import { limparFiscal, prepararFiscal } from './apoio-fiscal';
import { USUARIOS_E2E } from './dados';

// As configurações são uma linha só no banco: cada teste deixa tudo pronto para os próximos specs.
test.afterEach(async () => {
  await prepararFiscal();
});

test('Gestor preenche os dados da empresa e salva a regra sugerida; o erro recebe o foco', async ({ page }) => {
  await limparFiscal();
  await entrarComo(page, USUARIOS_E2E.gestor);
  await page.goto('/configuracoes');
  // O cartão "Fiscal" é da Parte A; o seletor pelo endereço não depende do texto do cartão.
  await page.locator('a[href="/configuracoes/fiscal"]').first().click();
  await expect(page).toHaveURL(/\/configuracoes\/fiscal$/);
  await expect(page.getByRole('heading', { name: 'A emissão de NF está bloqueada' })).toBeVisible();
  await semRolagemLateral(page);

  await page.getByLabel('Razão social').fill('Empresa Teste Ltda');
  await page.getByLabel('CNPJ').fill('11.444.777/0001-62');
  await page.getByLabel('Inscrição estadual').fill('110042490114');
  await page.getByLabel('CEP').fill('01001-000');
  await page.getByLabel('Logradouro').fill('Rua A');
  await page.getByLabel('Número', { exact: true }).fill('100');
  await page.getByLabel('Bairro').fill('Centro');
  await page.getByLabel('Cidade').fill('Sao Paulo');
  await page.getByLabel('UF', { exact: true }).selectOption('SP');
  await page.getByRole('radio', { name: 'Simples Nacional' }).check();
  await page.getByLabel('Série da NF-e').fill('1');
  await page.getByRole('button', { name: 'Salvar dados da empresa' }).click();
  const erros = page.locator('#erros-formulario');
  await expect(erros).toHaveText('CNPJ inválido');
  await expect(erros).toBeFocused();

  await page.getByLabel('CNPJ').fill('11.444.777/0001-61');
  await page.getByRole('button', { name: 'Salvar dados da empresa' }).click();
  await expect(page.getByRole('status')).toHaveText('Dados da empresa salvos.');
  await expect(page.getByText('Falta a regra fiscal: Devolução de venda, dentro do estado')).toBeVisible();

  const regra = page.getByRole('link', { name: /^Devolução de venda, dentro do estado/ });
  await expect(regra).toContainText('Sugestão, ainda não salva');
  await regra.click();
  await expect(page.getByRole('heading', { level: 1, name: 'Regra fiscal: Devolução de venda, dentro do estado' })).toBeVisible();
  await expect(page.getByLabel('CFOP')).toHaveValue('1202');
  await expect(page.getByLabel('CSOSN do ICMS')).toHaveValue('900');
  await semRolagemLateral(page);
  await page.getByRole('button', { name: 'Salvar regra' }).click();
  await expect(page.getByRole('status')).toHaveText('Regra fiscal salva.');
  await expect(page.getByRole('link', { name: /^Devolução de venda, dentro do estado/ })).toContainText('Salva');
});

test('Gestor só passa para produção com a confirmação do contador e volta para homologação', async ({ page }) => {
  await prepararFiscal();
  await entrarComo(page, USUARIOS_E2E.gestor);
  await page.goto('/configuracoes/fiscal');
  const formulario = page.getByRole('form', { name: 'Trocar o ambiente da NF-e' });
  await formulario.getByRole('radio', { name: 'Produção' }).check();
  await formulario.getByRole('button', { name: 'Salvar ambiente' }).click();
  const erros = page.locator('#erros-ambiente');
  await expect(erros).toHaveText('Para passar para produção, confirme que o contador validou as regras e as notas de homologação.');
  await expect(erros).toBeFocused();

  await formulario.getByRole('checkbox', { name: /O contador validou/ }).check();
  await formulario.getByRole('button', { name: 'Salvar ambiente' }).click();
  await expect(page.getByRole('status')).toHaveText('Ambiente da NF-e alterado.');
  await expect(page.locator('dd', { hasText: /^Produção$/ })).toBeVisible();

  await page.getByRole('form', { name: 'Trocar o ambiente da NF-e' }).getByRole('radio', { name: 'Homologação (sem valor fiscal)' }).check();
  await page.getByRole('form', { name: 'Trocar o ambiente da NF-e' }).getByRole('button', { name: 'Salvar ambiente' }).click();
  await expect(page.locator('dd', { hasText: /^Homologação \(sem valor fiscal\)$/ })).toBeVisible();
});

test('o Fiscal vê as configurações fiscais sem poder alterar', async ({ page }) => {
  await prepararFiscal();
  await entrarComo(page, USUARIOS_E2E.fiscal);
  await page.goto('/configuracoes/fiscal');
  await expect(page.getByText('Só o Gestor altera estas configurações.')).toBeVisible();
  await expect(page.getByText('Empresa Teste Ltda')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Salvar/ })).toHaveCount(0);
  await semRolagemLateral(page);

  await page.getByRole('link', { name: /^Devolução de venda, dentro do estado/ }).click();
  await expect(page.getByText('1202', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salvar regra' })).toHaveCount(0);
  await paginaNaoEncontrada(page, '/configuracoes');
});

test('o Operador não entra nas configurações fiscais', async ({ page }) => {
  await entrarComo(page, USUARIOS_E2E.operador);
  await paginaNaoEncontrada(page, '/configuracoes/fiscal');
});
```

Rode: `npm run test:e2e -- tests/e2e/fiscal-configuracoes.spec.ts`
Esperado: FAIL (a página ainda é o `EmBreve`).

- [ ] **Passo 2: Ações**

`src/app/(app)/configuracoes/fiscal/acoes.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { obterDb } from '@/db';
import { textoDoForm } from '@/lib/formulario';
import { exigirPermissao } from '@/modules/auth/servidor';
import { lerConfiguracao } from '@/modules/configuracoes/ler';
import {
  CAMPOS_EMPRESA,
  salvarAmbiente,
  salvarDadosEmpresa,
  situacaoDoEmissor,
  validarDadosEmpresa,
  validarTrocaAmbiente,
  type EntradaEmpresa,
} from '@/modules/fiscal/configuracao';
import { ehOperacao, ehTipoNota } from '@/modules/fiscal/dominio';
import { ErroFiscal } from '@/modules/fiscal/erros';
import { salvarRegra, validarRegra } from '@/modules/fiscal/regras';

export type EstadoFormulario = { erros: string[] };

const PAGINA = '/configuracoes/fiscal';

export async function salvarEmpresaAcao(_anterior: EstadoFormulario, dados: FormData): Promise<EstadoFormulario> {
  const usuario = await exigirPermissao('administrar');
  const entrada = Object.fromEntries(CAMPOS_EMPRESA.map((campo) => [campo, textoDoForm(dados, campo)])) as EntradaEmpresa;
  const { dados: empresa, erros } = validarDadosEmpresa(entrada);
  if (!empresa) return { erros };
  try {
    await salvarDadosEmpresa(obterDb(), empresa, usuario);
  } catch (erro) {
    if (erro instanceof ErroFiscal) return { erros: [erro.message] };
    throw erro;
  }
  revalidatePath(PAGINA);
  redirect(`${PAGINA}?ok=empresa`);
}

export async function salvarAmbienteAcao(_anterior: EstadoFormulario, dados: FormData): Promise<EstadoFormulario> {
  const usuario = await exigirPermissao('administrar');
  const { ambiente, erros } = validarTrocaAmbiente({
    ambiente: textoDoForm(dados, 'ambiente'),
    confirmado: textoDoForm(dados, 'confirmacao') === 'sim',
    emissor: situacaoDoEmissor(),
  });
  if (!ambiente) return { erros };
  try {
    await salvarAmbiente(obterDb(), ambiente, usuario);
  } catch (erro) {
    if (erro instanceof ErroFiscal) return { erros: [erro.message] };
    throw erro;
  }
  revalidatePath(PAGINA);
  redirect(`${PAGINA}?ok=ambiente`);
}

/** `tipo` e `operacao` chegam ligados (bind) do cliente: são conferidos antes de qualquer uso. */
export async function salvarRegraAcao(tipo: string, operacao: string, _anterior: EstadoFormulario, dados: FormData): Promise<EstadoFormulario> {
  const usuario = await exigirPermissao('administrar');
  if (!ehTipoNota(tipo) || !ehOperacao(operacao)) return { erros: ['Regra fiscal desconhecida.'] };
  const db = obterDb();
  const regime = (await lerConfiguracao(db)).regimeTributario;
  if (!regime) return { erros: ['Escolha o regime tributário nos dados da empresa antes de salvar as regras.'] };
  const { dados: regra, erros } = validarRegra(
    tipo,
    operacao,
    {
      cfop: textoDoForm(dados, 'cfop'),
      icms: textoDoForm(dados, 'icms'),
      pis: textoDoForm(dados, 'pis'),
      cofins: textoDoForm(dados, 'cofins'),
      natureza: textoDoForm(dados, 'natureza'),
      informacoes: textoDoForm(dados, 'informacoes'),
    },
    regime,
  );
  if (!regra) return { erros };
  try {
    await salvarRegra(db, regra, usuario);
  } catch (erro) {
    if (erro instanceof ErroFiscal) return { erros: [erro.message] };
    throw erro;
  }
  revalidatePath(PAGINA);
  redirect(`${PAGINA}?ok=regra`);
}
```

- [ ] **Passo 3: Formulários (uma coluna, rodapé fixo no celular)**

`src/app/(app)/configuracoes/fiscal/FormularioEmpresa.tsx`:

```tsx
'use client';

import { CampoTexto } from '@/components/CampoTexto';
import { ListaErros } from '@/components/ListaErros';
import { RodapeFormulario } from '@/components/RodapeFormulario';
import { BOTAO_PRIMARIO, CAMPO, ROTULO } from '@/components/estilos';
import { useEnvioFormulario } from '@/components/useEnvioFormulario';
import { UFS } from '@/modules/catalogo/documentos';
import { REGIMES_TRIBUTARIOS } from '@/modules/configuracoes/dominio';
import type { EntradaEmpresa } from '@/modules/fiscal/configuracao';
import { ROTULO_REGIME } from '@/modules/fiscal/dominio';
import type { EstadoFormulario } from './acoes';

type Props = { acao: (anterior: EstadoFormulario, dados: FormData) => Promise<EstadoFormulario>; valores: EntradaEmpresa };

/** Spec §6.8 e §8.1: o emitente da NF-e, o regime tributário e a série exclusiva do sistema. */
export function FormularioEmpresa({ acao, valores }: Props) {
  const [estado, aoEnviar, pendente] = useEnvioFormulario(acao, { erros: [] });
  return (
    <form onSubmit={aoEnviar} aria-label="Dados da empresa" className="flex flex-col gap-4">
      <p className="text-sm text-texto-2">Todos os campos são obrigatórios, menos o complemento. Eles saem como emitente da NF-e.</p>
      <CampoTexto nome="razao_social" rotulo="Razão social" valorInicial={valores.razao_social} obrigatorio maximo={60} autoComplete="organization" />
      <CampoTexto nome="cnpj" rotulo="CNPJ" valorInicial={valores.cnpj} obrigatorio mono maiusculas maximo={18} />
      <CampoTexto nome="ie" rotulo="Inscrição estadual" valorInicial={valores.ie} obrigatorio mono modoTeclado="numeric" maximo={20} />
      <CampoTexto nome="cep" rotulo="CEP" valorInicial={valores.cep} obrigatorio mono modoTeclado="numeric" maximo={9} />
      <CampoTexto nome="logradouro" rotulo="Logradouro" valorInicial={valores.logradouro} obrigatorio maximo={60} />
      <div className="grid grid-cols-2 gap-3">
        <CampoTexto nome="numero" rotulo="Número" valorInicial={valores.numero} obrigatorio maximo={60} />
        <CampoTexto nome="complemento" rotulo="Complemento (opcional)" valorInicial={valores.complemento} maximo={60} />
      </div>
      <CampoTexto nome="bairro" rotulo="Bairro" valorInicial={valores.bairro} obrigatorio maximo={60} />
      <div className="grid grid-cols-[1fr_6rem] gap-3">
        <CampoTexto nome="cidade" rotulo="Cidade" valorInicial={valores.cidade} obrigatorio maximo={60} />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="uf" className={ROTULO}>
            UF
          </label>
          <select id="uf" name="uf" required defaultValue={valores.uf} className={CAMPO}>
            <option value="">—</option>
            {UFS.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </select>
        </div>
      </div>
      <fieldset className="flex flex-col">
        <legend className={ROTULO}>Regime tributário</legend>
        {REGIMES_TRIBUTARIOS.map((regime) => (
          <label key={regime} className="flex min-h-11 items-center gap-3 text-[15px]">
            <input type="radio" name="regime" value={regime} defaultChecked={valores.regime === regime} className="size-5" />
            {ROTULO_REGIME[regime]}
          </label>
        ))}
      </fieldset>
      <CampoTexto
        nome="serie"
        rotulo="Série da NF-e"
        valorInicial={valores.serie}
        obrigatorio
        mono
        modoTeclado="numeric"
        maximo={3}
        dica="Série exclusiva do sistema (ex.: 2), a mesma do cadastro da empresa na Focus NFe. Não use a série do Bitbrain."
      />
      <ListaErros erros={estado.erros} />
      <RodapeFormulario>
        <button type="submit" disabled={pendente} className={BOTAO_PRIMARIO}>
          {pendente ? 'Salvando…' : 'Salvar dados da empresa'}
        </button>
      </RodapeFormulario>
    </form>
  );
}
```

`src/app/(app)/configuracoes/fiscal/FormularioAmbiente.tsx`:

```tsx
'use client';

import { ListaErros } from '@/components/ListaErros';
import { BOTAO_SECUNDARIO, ROTULO } from '@/components/estilos';
import { useEnvioFormulario } from '@/components/useEnvioFormulario';
import { AMBIENTES_NFE, type AmbienteNfe } from '@/modules/configuracoes/dominio';
import { ROTULO_AMBIENTE } from '@/modules/fiscal/dominio';
import type { EstadoFormulario } from './acoes';

type Props = { acao: (anterior: EstadoFormulario, dados: FormData) => Promise<EstadoFormulario>; atual: AmbienteNfe };

/** Spec §8.1: começa em homologação; a passagem para produção é do Gestor, depois da validação do contador. */
export function FormularioAmbiente({ acao, atual }: Props) {
  const [estado, aoEnviar, pendente] = useEnvioFormulario(acao, { erros: [] }, 'erros-ambiente');
  return (
    <form onSubmit={aoEnviar} aria-label="Trocar o ambiente da NF-e" className="flex flex-col gap-3">
      <fieldset className="flex flex-col">
        <legend className={ROTULO}>Ambiente</legend>
        {AMBIENTES_NFE.map((ambiente) => (
          <label key={ambiente} className="flex min-h-11 items-center gap-3 text-[15px]">
            <input type="radio" name="ambiente" value={ambiente} defaultChecked={ambiente === atual} className="size-5" />
            {ROTULO_AMBIENTE[ambiente]}
          </label>
        ))}
      </fieldset>
      <label className="flex min-h-11 items-start gap-3 py-2 text-[15px]">
        <input type="checkbox" name="confirmacao" value="sim" className="mt-0.5 size-5 flex-none" />O contador validou as regras fiscais e as notas
        emitidas em homologação
      </label>
      <p className="text-sm text-texto-2">
        Em homologação a NF não tem valor fiscal, mas a devolução fica Concluída do mesmo jeito: use devoluções de teste.
      </p>
      <ListaErros erros={estado.erros} id="erros-ambiente" />
      <button type="submit" disabled={pendente} className={BOTAO_SECUNDARIO}>
        {pendente ? 'Salvando…' : 'Salvar ambiente'}
      </button>
    </form>
  );
}
```

`src/app/(app)/configuracoes/fiscal/FormularioRegra.tsx`:

```tsx
'use client';

import { CampoTexto } from '@/components/CampoTexto';
import { ListaErros } from '@/components/ListaErros';
import { RodapeFormulario } from '@/components/RodapeFormulario';
import { BOTAO_PRIMARIO, CAMPO, ROTULO } from '@/components/estilos';
import { useEnvioFormulario } from '@/components/useEnvioFormulario';
import type { RegimeTributario } from '@/modules/configuracoes/dominio';
import { CSOSN, CST_ICMS } from '@/modules/fiscal/dominio';
import type { RegraFiscal } from '@/modules/fiscal/regras';
import type { EstadoFormulario } from './acoes';

type Props = { acao: (anterior: EstadoFormulario, dados: FormData) => Promise<EstadoFormulario>; regra: RegraFiscal; regime: RegimeTributario };

/** Spec §8.2: CFOP, CST/CSOSN do ICMS, CST do PIS e do COFINS e informações complementares de uma combinação. */
export function FormularioRegra({ acao, regra, regime }: Props) {
  const [estado, aoEnviar, pendente] = useEnvioFormulario(acao, { erros: [] });
  const simples = regime === 'SIMPLES';
  return (
    <form onSubmit={aoEnviar} aria-label="Regra fiscal" className="flex flex-col gap-4">
      <CampoTexto nome="cfop" rotulo="CFOP" valorInicial={regra.cfop} obrigatorio mono modoTeclado="numeric" maximo={4} />
      <CampoTexto
        nome="icms"
        rotulo={simples ? 'CSOSN do ICMS' : 'CST do ICMS'}
        valorInicial={regra.icmsSituacaoTributaria}
        obrigatorio
        mono
        modoTeclado="numeric"
        maximo={3}
        dica={`Valores: ${(simples ? CSOSN : CST_ICMS).join(', ')}`}
      />
      <div className="grid grid-cols-2 gap-3">
        <CampoTexto nome="pis" rotulo="CST do PIS" valorInicial={regra.pisSituacaoTributaria} obrigatorio mono modoTeclado="numeric" maximo={2} />
        <CampoTexto nome="cofins" rotulo="CST do COFINS" valorInicial={regra.cofinsSituacaoTributaria} obrigatorio mono modoTeclado="numeric" maximo={2} />
      </div>
      <CampoTexto nome="natureza" rotulo="Natureza da operação" valorInicial={regra.naturezaOperacao} obrigatorio maximo={60} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="informacoes" className={ROTULO}>
          Informações complementares
        </label>
        <textarea
          id="informacoes"
          name="informacoes"
          rows={4}
          maxLength={2000}
          defaultValue={regra.informacoesComplementares ?? ''}
          aria-describedby="informacoes-dica"
          className={`${CAMPO} min-h-28 py-2`}
        />
        <p id="informacoes-dica" className="text-xs text-texto-2">
          Marcadores: {'{chaves}'} (NF de venda), {'{devolucao}'} (código DEV), {'{seriais}'} (S/N) e, nas remessas, {'{lote}'}.
        </p>
      </div>
      <ListaErros erros={estado.erros} />
      <RodapeFormulario>
        <button type="submit" disabled={pendente} className={BOTAO_PRIMARIO}>
          {pendente ? 'Salvando…' : 'Salvar regra'}
        </button>
      </RodapeFormulario>
    </form>
  );
}
```

- [ ] **Passo 4: Páginas**

`src/app/(app)/configuracoes/fiscal/page.tsx` (substitui todo o conteúdo):

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { MensagemSucesso } from '@/components/MensagemSucesso';
import { Selo } from '@/components/Selo';
import { ALERTA_ATENCAO, CARTAO, ITEM_LISTA, LINK_VOLTAR, ROTULO } from '@/components/estilos';
import { obterDb } from '@/db';
import { primeiroValor, type ParametrosBusca } from '@/lib/parametros';
import { pode } from '@/modules/auth/permissoes';
import { exigirPermissao } from '@/modules/auth/servidor';
import { formatarCnpj } from '@/modules/catalogo/documentos';
import { lerConfiguracao } from '@/modules/configuracoes/ler';
import { entradaDaConfiguracao, pendenciasFiscais, situacaoDoEmissor } from '@/modules/fiscal/configuracao';
import { ROTULO_AMBIENTE, ROTULO_REGIME } from '@/modules/fiscal/dominio';
import { listarRegras, rotuloRegra } from '@/modules/fiscal/regras';
import { salvarAmbienteAcao, salvarEmpresaAcao } from './acoes';
import { FormularioAmbiente } from './FormularioAmbiente';
import { FormularioEmpresa } from './FormularioEmpresa';

export const metadata: Metadata = { title: 'Configurações fiscais · Gestão de Devoluções' };

/** Confirmações (as ações redirecionam com ?ok=). */
const MENSAGEM_OK: Record<string, string> = {
  empresa: 'Dados da empresa salvos.',
  ambiente: 'Ambiente da NF-e alterado.',
  regra: 'Regra fiscal salva.',
};

function Dado({ rotulo, mono = false, children }: { rotulo: string; mono?: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className={ROTULO}>{rotulo}</dt>
      <dd className={`text-[15px] ${mono ? 'break-all font-mono' : ''}`}>{children}</dd>
    </div>
  );
}

/** Configurações › Fiscal (spec §6.8 e §8): o Gestor edita; o Fiscal vê (chega pelo aviso da etapa 4). */
export default async function PaginaConfiguracaoFiscal({ searchParams }: { searchParams: Promise<ParametrosBusca> }) {
  const usuario = await exigirPermissao('gerir_fiscal');
  const podeEditar = pode(usuario.perfil, 'administrar');
  const db = obterDb();
  const [config, { regime, regras }, pendencias] = await Promise.all([lerConfiguracao(db), listarRegras(db), pendenciasFiscais(db)]);
  const ok = MENSAGEM_OK[primeiroValor((await searchParams).ok)];
  const emissor = situacaoDoEmissor();
  const endereco = [config.logradouro, config.numero, config.complemento, config.bairro, config.cidade, config.uf, config.cep]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Link href={podeEditar ? '/configuracoes' : '/fluxo/etapa/4'} className={LINK_VOLTAR}>
          {podeEditar ? '← Configurações' : '← Destinação Fiscal e Estoque'}
        </Link>
        <h1 className="text-xl font-bold">Configurações fiscais</h1>
      </div>

      {ok && <MensagemSucesso texto={ok} />}
      {!podeEditar && <p className={ALERTA_ATENCAO}>Só o Gestor altera estas configurações. Peça a ele o que faltar.</p>}
      {pendencias.length > 0 && (
        <section aria-labelledby="titulo-pendencias" className={`${ALERTA_ATENCAO} flex flex-col gap-1`}>
          <h2 id="titulo-pendencias" className="font-bold">
            A emissão de NF está bloqueada
          </h2>
          <ul className="list-disc pl-5">
            {pendencias.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="titulo-empresa" className={`${CARTAO} flex flex-col gap-3`}>
        <h2 id="titulo-empresa" className="text-base font-bold">
          Dados da empresa
        </h2>
        {podeEditar ? (
          <FormularioEmpresa acao={salvarEmpresaAcao} valores={entradaDaConfiguracao(config)} />
        ) : (
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <Dado rotulo="Razão social">{config.razaoSocial ?? '—'}</Dado>
            <Dado rotulo="CNPJ" mono>
              {config.cnpj ? formatarCnpj(config.cnpj) : '—'}
            </Dado>
            <Dado rotulo="Inscrição estadual" mono>
              {config.ie ?? '—'}
            </Dado>
            <Dado rotulo="Endereço">{endereco || '—'}</Dado>
            <Dado rotulo="Regime tributário">{config.regimeTributario ? ROTULO_REGIME[config.regimeTributario] : '—'}</Dado>
            <Dado rotulo="Série da NF-e" mono>
              {config.serieNfe ?? '—'}
            </Dado>
          </dl>
        )}
      </section>

      <section aria-labelledby="titulo-ambiente" className={`${CARTAO} flex flex-col gap-3`}>
        <h2 id="titulo-ambiente" className="text-base font-bold">
          Ambiente da NF-e
        </h2>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Dado rotulo="Ambiente atual">
            <Selo texto={ROTULO_AMBIENTE[config.ambienteNfe]} tom={config.ambienteNfe === 'PRODUCAO' ? 'bom' : 'atencao'} />
          </Dado>
          <Dado rotulo="Emissor">{emissor.simulado ? 'Simulado (EMISSOR_NFE=falso): nenhuma nota vai à SEFAZ' : 'Focus NFe'}</Dado>
          {!emissor.simulado && (
            <>
              <Dado rotulo="Token de homologação">{emissor.tokenHomologacao ? 'Configurado no servidor' : 'Falta no .env (FOCUS_TOKEN_HOMOLOGACAO)'}</Dado>
              <Dado rotulo="Token de produção">{emissor.tokenProducao ? 'Configurado no servidor' : 'Falta no .env (FOCUS_TOKEN_PRODUCAO)'}</Dado>
            </>
          )}
        </dl>
        <p className="text-sm text-texto-2">
          O certificado A1, a série e a numeração ficam no cadastro da empresa na Focus NFe (spec §8.1). Os tokens ficam só no .env do servidor.
        </p>
        {podeEditar && <FormularioAmbiente acao={salvarAmbienteAcao} atual={config.ambienteNfe} />}
      </section>

      <section aria-labelledby="titulo-regras" className="flex flex-col gap-2">
        <h2 id="titulo-regras" className="text-base font-bold">
          Regras fiscais
        </h2>
        <p className="text-sm text-texto-2">
          CFOP, CST/CSOSN e natureza de cada nota. Os valores sugeridos (spec §8.3) só valem depois de salvos, e o contador valida antes.
        </p>
        {!regime && <p className={ALERTA_ATENCAO}>Escolha o regime tributário nos dados da empresa: ele define se o ICMS usa CSOSN ou CST.</p>}
        <ul className="grid gap-3 md:grid-cols-2">
          {regras.map((r) => (
            <li key={`${r.tipoNota}-${r.operacao}`}>
              <Link href={`/configuracoes/fiscal/regras/${r.tipoNota}/${r.operacao}`} className={ITEM_LISTA}>
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{rotuloRegra(r.tipoNota, r.operacao)}</span>
                  <Selo texto={r.salva ? 'Salva' : 'Sugestão, ainda não salva'} tom={r.salva ? 'bom' : 'atencao'} />
                </span>
                <span className="font-mono text-[13px] text-texto-2">
                  CFOP {r.cfop} · ICMS {r.icmsSituacaoTributaria} · PIS {r.pisSituacaoTributaria} · COFINS {r.cofinsSituacaoTributaria}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
```

`src/app/(app)/configuracoes/fiscal/regras/[tipo]/[operacao]/page.tsx`:

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { ALERTA_ATENCAO, CARTAO, LINK_VOLTAR, ROTULO } from '@/components/estilos';
import { obterDb } from '@/db';
import { formatarDataHora } from '@/lib/formatar';
import { pode } from '@/modules/auth/permissoes';
import { exigirPermissao } from '@/modules/auth/servidor';
import { ehOperacao, ehTipoNota } from '@/modules/fiscal/dominio';
import { listarRegras, rotuloRegra } from '@/modules/fiscal/regras';
import { salvarRegraAcao } from '../../../acoes';
import { FormularioRegra } from '../../../FormularioRegra';

type Props = { params: Promise<{ tipo: string; operacao: string }> };

export const metadata: Metadata = { title: 'Regra fiscal · Gestão de Devoluções' };

function Dado({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className={ROTULO}>{rotulo}</dt>
      <dd className="break-words text-[15px]">{children}</dd>
    </div>
  );
}

export default async function PaginaRegraFiscal({ params }: Props) {
  const usuario = await exigirPermissao('gerir_fiscal');
  const { tipo, operacao } = await params;
  if (!ehTipoNota(tipo) || !ehOperacao(operacao)) notFound();
  const { regime, regras } = await listarRegras(obterDb());
  const regra = regras.find((r) => r.tipoNota === tipo && r.operacao === operacao);
  if (!regra) notFound();
  const podeEditar = pode(usuario.perfil, 'administrar');

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Link href="/configuracoes/fiscal" className={LINK_VOLTAR}>
          ← Configurações fiscais
        </Link>
        <h1 className="text-xl font-bold">Regra fiscal: {rotuloRegra(tipo, operacao)}</h1>
      </div>
      <p className="text-sm text-texto-2">
        {regra.salva && regra.atualizadoEm
          ? `Salva em ${formatarDataHora(regra.atualizadoEm)}.`
          : 'Valores sugeridos (spec §8.3), ainda não salvos. O contador valida antes de salvar.'}
      </p>
      {!regime ? (
        <p className={ALERTA_ATENCAO}>Escolha o regime tributário nos dados da empresa antes de salvar as regras.</p>
      ) : podeEditar ? (
        <section className={CARTAO}>
          <FormularioRegra acao={salvarRegraAcao.bind(null, tipo, operacao)} regra={regra} regime={regime} />
        </section>
      ) : (
        <dl className={`${CARTAO} grid gap-x-6 gap-y-3 sm:grid-cols-2`}>
          <Dado rotulo="CFOP">{regra.cfop}</Dado>
          <Dado rotulo={regime === 'SIMPLES' ? 'CSOSN do ICMS' : 'CST do ICMS'}>{regra.icmsSituacaoTributaria}</Dado>
          <Dado rotulo="CST do PIS">{regra.pisSituacaoTributaria}</Dado>
          <Dado rotulo="CST do COFINS">{regra.cofinsSituacaoTributaria}</Dado>
          <Dado rotulo="Natureza da operação">{regra.naturezaOperacao}</Dado>
          <Dado rotulo="Informações complementares">{regra.informacoesComplementares ?? '—'}</Dado>
        </dl>
      )}
    </div>
  );
}
```

- [ ] **Passo 5: Rodar o e2e e o resto**

Rode: `npm run typecheck && npm run lint && npm run test:e2e -- tests/e2e/fiscal-configuracoes.spec.ts`
Esperado: PASS nos projetos `computador` e `celular` (4 testes em cada).

- [ ] **Passo 6: Commit**

```bash
cd "/c/Users/idmpc/devolucoes-wt/fase-4"
git add -A
git commit -m "feat: tela Configurações › Fiscal (dados da empresa, ambiente, regras; Gestor edita e Fiscal só vê)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 4: Emissor de NF-e: falso, cliente Focus NFe e registro

**Arquivos:**
- Criar: `src/conectores/nfe/erros.ts`, `src/conectores/nfe/falso.ts`, `src/conectores/nfe/focus-mapeamento.ts`, `src/conectores/nfe/focus.ts`, `src/conectores/nfe/registro.ts`, `tests/helpers/nota-teste.ts`
- Modificar (acrescentar 1 linha no final): `src/conectores/nfe/tipos.ts`
- Testes: `src/conectores/nfe/falso.test.ts`, `src/conectores/nfe/focus-mapeamento.test.ts`, `src/conectores/nfe/focus.test.ts`, `src/conectores/nfe/registro.test.ts`

**Interfaces:**
- Consome: `EmissorNFe`, `NotaParaEmissao`, `SituacaoNota` (Tarefa 1); `montarChave`, `CODIGO_UF` (Tarefa 1); `lerEnv` (Parte A: `EMISSOR_NFE`, `FOCUS_TOKEN_HOMOLOGACAO`, `FOCUS_TOKEN_PRODUCAO`).
- Produz:
  - `erros.ts`: `class ErroEmissorRecusou extends Error` (definitivo: dado inválido, token recusado; quem chama grava como rejeição), `class ErroEmissorIndisponivel extends Error` (passageiro: rede, tempo esgotado, 429, 5xx; a fila tenta de novo)
  - `falso.ts`: `class EmissorFalso implements EmissorNFe`, `SERIE_FALSA = '1'`
  - `focus-mapeamento.ts`: `NOME_HOMOLOGACAO`, `arredondar(valor, casas?)`, `dataFocus(data): string`, `type RespostaFocus`, `montarPayloadFocus(nota, { ambiente, emitidaEm }): Record<string, unknown>`, `interpretarConsultaFocus(json): SituacaoNota`, `interpretarCancelamentoFocus(json): SituacaoNota`
  - `focus.ts`: `URL_FOCUS`, `type OpcoesFocus`, `criarEmissorFocus(opcoes): EmissorNFe`
  - `registro.ts` (reexportado por `tipos.ts`, contrato §5.7): `obterEmissorNFe(ambiente): EmissorNFe`, `definirEmissorParaTestes(e: EmissorNFe | null): void`
  - `tests/helpers/nota-teste.ts`: `EMITENTE_TESTE`, `DESTINATARIO_TESTE`, `CHAVE_VENDA_TESTE`, `notaTeste(dados?)`

**Campos da Focus NFe** (conferidos em 2026-11-12 em doc.focusnfe.com.br e campos.focusnfe.com.br): `POST /v2/nfe?ref=` (201 autorizado, 202 `processando_autorizacao`, 422 `erro_validacao_schema` / `pending_operation` / `already_processed` / `permissao_negada`); `GET /v2/nfe/{ref}` (`processando_autorizacao`, `autorizado`, `erro_autorizacao`, `cancelado`; campos `chave_nfe`, `numero`, `serie`, `status_sefaz`, `mensagem_sefaz`, `caminho_xml_nota_fiscal`, `caminho_danfe`, `caminho_xml_cancelamento`, `erros[{campo,mensagem}]`); `DELETE /v2/nfe/{ref}` com `{ justificativa }` de 15 a 255 caracteres (`cancelado` ou `erro_cancelamento`; 422 `nfe_nao_autorizada`). No payload: `notas_referenciadas[{chave_nfe}]`, `informacoes_adicionais_contribuinte`, `codigo_barras_comercial`, `icms_base_calculo`, `icms_aliquota`, `icms_valor`, `pis_aliquota_porcentual`, `cofins_aliquota_porcentual` (página de campos), `serie` e `numero` em branco (numeração automática, recomendada). **Não confirmados** (testar em homologação na "Ligação das contas reais"): o host dos `caminho_*` (relativos; o cliente usa o host do ambiente, com o mesmo Basic); se `codigo_barras_comercial` aceita `SEM GTIN`; `presenca_comprador` 0 na devolução.

- [ ] **Passo 1: Escrever os testes que falham**

`tests/helpers/nota-teste.ts`:

```ts
import type { DadosEmitente, Destinatario, NotaParaEmissao } from '@/conectores/nfe/tipos';

/** Nota de devolução de exemplo para os testes do emissor (a mesma empresa de EMPRESA_TESTE). */
export const EMITENTE_TESTE: DadosEmitente = {
  razaoSocial: 'Empresa Teste Ltda',
  cnpj: '11444777000161',
  ie: '110042490114',
  logradouro: 'Rua A',
  numero: '100',
  complemento: null,
  bairro: 'Centro',
  cidade: 'Sao Paulo',
  uf: 'SP',
  cep: '01001000',
};

export const DESTINATARIO_TESTE: Destinatario = {
  nome: 'Maria da Silva',
  cpf: '52998224725',
  cnpj: null,
  ie: null,
  indicadorIe: 9,
  logradouro: 'Rua B',
  numero: '50',
  complemento: null,
  bairro: 'Jardim',
  cidade: 'Sao Paulo',
  uf: 'SP',
  cep: '01002000',
};

/** Chave válida (dígito confere) de uma NF de venda da EMPRESA_TESTE. */
export const CHAVE_VENDA_TESTE = '35261011444777000161550010000001011000001012';

export function notaTeste(dados: Partial<NotaParaEmissao> = {}): NotaParaEmissao {
  return {
    referencia: '0b9f1c2e3d4a4b5c8d6e7f8091a2b3c4',
    tipo: 'DEVOLUCAO_VENDA',
    naturezaOperacao: 'Devolucao de venda',
    entrada: true,
    finalidade: 'DEVOLUCAO',
    operacao: 'DENTRO_ESTADO',
    consumidorFinal: true,
    regime: 'SIMPLES',
    emitente: EMITENTE_TESTE,
    destinatario: DESTINATARIO_TESTE,
    chavesReferenciadas: [CHAVE_VENDA_TESTE],
    itens: [
      {
        codigo: 'FONE-01',
        descricao: 'Fone Bluetooth',
        ncm: '85183000',
        cfop: '1202',
        unidade: 'UN',
        quantidade: 2,
        valorUnitario: 99.95,
        ean: '7891234567895',
        icmsOrigem: 0,
        icmsSituacao: '900',
        pisSituacao: '98',
        cofinsSituacao: '98',
      },
    ],
    informacoesComplementares: `Devolucao referente a NF-e ${CHAVE_VENDA_TESTE}. Devolucao DEV-000001.`,
    ...dados,
  };
}
```

`src/conectores/nfe/falso.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { chaveValida } from '@/modules/fiscal/chave';
import { notaTeste } from '../../../tests/helpers/nota-teste';
import { EmissorFalso } from './falso';

describe('EmissorFalso (contrato §5.3)', () => {
  it('autoriza na 2ª consulta, com chave válida, série 1, XML e DANFE', async () => {
    const emissor = new EmissorFalso();
    const nota = notaTeste();
    expect(await emissor.emitir(nota)).toEqual({ referencia: nota.referencia });
    expect(await emissor.consultar(nota.referencia)).toEqual({ situacao: 'PROCESSANDO' });
    const autorizada = await emissor.consultar(nota.referencia);
    if (autorizada.situacao !== 'AUTORIZADA') throw new Error(`esperava AUTORIZADA, veio ${autorizada.situacao}`);
    expect(chaveValida(autorizada.chave)).toBe(true);
    expect(autorizada.chave.slice(6, 20)).toBe('11444777000161');
    expect(autorizada.serie).toBe('1');
    expect((await emissor.baixar(autorizada.urlXml)).toString('utf8')).toContain(`<chNFe>${autorizada.chave}</chNFe>`);
    expect((await emissor.baixar(autorizada.urlDanfe)).subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('rejeita quando a natureza contém REJEITAR; corrigida, o mesmo ref é reenviado e autorizado', async () => {
    const emissor = new EmissorFalso();
    const nota = notaTeste({ naturezaOperacao: 'Devolucao de venda REJEITAR' });
    await emissor.emitir(nota);
    expect(await emissor.consultar(nota.referencia)).toEqual({
      situacao: 'REJEITADA',
      codigo: '999',
      motivo: 'Rejeição simulada: a natureza da operação contém REJEITAR',
    });
    await emissor.emitir({ ...nota, naturezaOperacao: 'Devolucao de venda' });
    await emissor.consultar(nota.referencia);
    expect((await emissor.consultar(nota.referencia)).situacao).toBe('AUTORIZADA');
  });

  it('cancela (a consulta passa a dizer CANCELADA) e recusa quando a justificativa contém RECUSAR', async () => {
    const emissor = new EmissorFalso();
    const nota = notaTeste();
    await emissor.emitir(nota);
    await emissor.consultar(nota.referencia);
    await emissor.consultar(nota.referencia);
    expect(await emissor.cancelar(nota.referencia, 'Teste RECUSAR cancelamento')).toEqual({
      situacao: 'CANCELAMENTO_RECUSADO',
      motivo: 'Cancelamento recusado (simulação): a justificativa contém RECUSAR',
    });
    const cancelada = await emissor.cancelar(nota.referencia, 'Cliente desistiu da devolução');
    expect(cancelada).toEqual({ situacao: 'CANCELADA', urlXmlCancelamento: expect.stringMatching(/^falso:\/\/cancelamento\//) });
    expect(await emissor.consultar(nota.referencia)).toEqual(cancelada);
    if (cancelada.situacao === 'CANCELADA' && cancelada.urlXmlCancelamento) {
      expect((await emissor.baixar(cancelada.urlXmlCancelamento)).toString('utf8')).toContain('<tpEvento>110111</tpEvento>');
    }
  });

  it('o cancelamento funciona sem estado (roda no servidor web, quem emitiu foi o worker)', async () => {
    expect(await new EmissorFalso().cancelar('abc123', 'Cliente desistiu da devolução')).toEqual({
      situacao: 'CANCELADA',
      urlXmlCancelamento: 'falso://cancelamento/abc123',
    });
  });

  it('nota desconhecida vira rejeição; reenviar uma autorizada não muda nada; endereço estranho é recusado', async () => {
    const emissor = new EmissorFalso();
    expect((await emissor.consultar('naoexiste')).situacao).toBe('REJEITADA');
    const nota = notaTeste();
    await emissor.emitir(nota);
    await emissor.consultar(nota.referencia);
    const autorizada = await emissor.consultar(nota.referencia);
    await emissor.emitir(nota);
    expect(await emissor.consultar(nota.referencia)).toEqual(autorizada);
    await expect(emissor.baixar('https://exemplo.com/x')).rejects.toThrow('Endereço desconhecido no emissor simulado');
  });
});
```

`src/conectores/nfe/focus-mapeamento.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CHAVE_VENDA_TESTE, DESTINATARIO_TESTE, notaTeste } from '../../../tests/helpers/nota-teste';
import { ErroEmissorIndisponivel } from './erros';
import { dataFocus, interpretarCancelamentoFocus, interpretarConsultaFocus, montarPayloadFocus, NOME_HOMOLOGACAO } from './focus-mapeamento';

const EMITIDA = new Date('2026-11-12T13:00:00Z');

describe('montarPayloadFocus (pesquisa focus-nfe.md §2.2)', () => {
  it('devolução de venda no Simples, comprador pessoa física, em homologação', () => {
    expect(montarPayloadFocus(notaTeste(), { ambiente: 'HOMOLOGACAO', emitidaEm: EMITIDA })).toEqual({
      natureza_operacao: 'Devolucao de venda',
      data_emissao: '2026-11-12T10:00:00-03:00',
      data_entrada_saida: '2026-11-12T10:00:00-03:00',
      tipo_documento: 0,
      finalidade_emissao: 4,
      local_destino: 1,
      consumidor_final: 1,
      presenca_comprador: 0,
      modalidade_frete: 9,
      regime_tributario_emitente: 1,
      cnpj_emitente: '11444777000161',
      inscricao_estadual_emitente: '110042490114',
      nome_emitente: 'Empresa Teste Ltda',
      logradouro_emitente: 'Rua A',
      numero_emitente: '100',
      bairro_emitente: 'Centro',
      municipio_emitente: 'Sao Paulo',
      uf_emitente: 'SP',
      cep_emitente: '01001000',
      nome_destinatario: NOME_HOMOLOGACAO,
      cpf_destinatario: '52998224725',
      indicador_inscricao_estadual_destinatario: 9,
      logradouro_destinatario: 'Rua B',
      numero_destinatario: '50',
      bairro_destinatario: 'Jardim',
      municipio_destinatario: 'Sao Paulo',
      uf_destinatario: 'SP',
      cep_destinatario: '01002000',
      notas_referenciadas: [{ chave_nfe: CHAVE_VENDA_TESTE }],
      informacoes_adicionais_contribuinte: `Devolucao referente a NF-e ${CHAVE_VENDA_TESTE}. Devolucao DEV-000001.`,
      valor_produtos: 199.9,
      valor_total: 199.9,
      items: [
        {
          numero_item: 1,
          codigo_produto: 'FONE-01',
          descricao: 'Fone Bluetooth',
          codigo_ncm: '85183000',
          cfop: '1202',
          unidade_comercial: 'UN',
          quantidade_comercial: 2,
          valor_unitario_comercial: 99.95,
          unidade_tributavel: 'UN',
          quantidade_tributavel: 2,
          valor_unitario_tributavel: 99.95,
          valor_bruto: 199.9,
          codigo_barras_comercial: '7891234567895',
          codigo_barras_tributavel: '7891234567895',
          inclui_no_total: 1,
          icms_origem: 0,
          icms_situacao_tributaria: '900',
          pis_situacao_tributaria: '98',
          cofins_situacao_tributaria: '98',
        },
      ],
    });
  });

  it('Lucro Presumido, comprador contribuinte (CNPJ e IE), em produção: tributos e nome reais', () => {
    const nota = notaTeste({
      regime: 'PRESUMIDO',
      consumidorFinal: false,
      operacao: 'FORA_ESTADO',
      destinatario: { ...DESTINATARIO_TESTE, nome: 'Loja Exemplo Ltda', cpf: null, cnpj: '19131243000197', ie: '123456789', indicadorIe: 1, uf: 'RJ' },
      itens: [
        {
          ...notaTeste().itens[0],
          cfop: '2202',
          icmsSituacao: '00',
          pisSituacao: '01',
          cofinsSituacao: '01',
          tributos: { icmsBase: 199.9, icmsAliquota: 18, icmsValor: 35.98, pisBase: 199.9, pisAliquota: 0.65, pisValor: 1.3, cofinsBase: 199.9, cofinsAliquota: 3, cofinsValor: 6 },
        },
      ],
    });
    const payload = montarPayloadFocus(nota, { ambiente: 'PRODUCAO', emitidaEm: EMITIDA });
    expect(payload).toMatchObject({
      local_destino: 2,
      consumidor_final: 0,
      regime_tributario_emitente: 3,
      nome_destinatario: 'Loja Exemplo Ltda',
      cnpj_destinatario: '19131243000197',
      inscricao_estadual_destinatario: '123456789',
      indicador_inscricao_estadual_destinatario: 1,
    });
    expect(payload).not.toHaveProperty('cpf_destinatario');
    expect((payload.items as Record<string, unknown>[])[0]).toMatchObject({
      icms_situacao_tributaria: '00',
      icms_modalidade_base_calculo: 3,
      icms_base_calculo: 199.9,
      icms_aliquota: 18,
      icms_valor: 35.98,
      pis_base_calculo: 199.9,
      pis_aliquota_porcentual: 0.65,
      pis_valor: 1.3,
      cofins_base_calculo: 199.9,
      cofins_aliquota_porcentual: 3,
      cofins_valor: 6,
    });
  });

  it('remessa (saída normal) sem nota referenciada; sem EAN vai "SEM GTIN"', () => {
    const nota = notaTeste({
      tipo: 'REMESSA_CONSERTO',
      entrada: false,
      finalidade: 'NORMAL',
      operacao: 'FORA_ESTADO',
      consumidorFinal: false,
      chavesReferenciadas: [],
      itens: [{ ...notaTeste().itens[0], ean: null, cfop: '6915' }],
    });
    const payload = montarPayloadFocus(nota, { ambiente: 'HOMOLOGACAO', emitidaEm: EMITIDA });
    expect(payload).toMatchObject({ tipo_documento: 1, finalidade_emissao: 1, local_destino: 2, consumidor_final: 0 });
    expect(payload).not.toHaveProperty('notas_referenciadas');
    expect((payload.items as Record<string, unknown>[])[0]).toMatchObject({ codigo_barras_comercial: 'SEM GTIN', cfop: '6915' });
  });

  it('data no horário de Brasília', () => {
    expect(dataFocus(new Date('2026-11-13T02:30:00Z'))).toBe('2026-11-12T23:30:00-03:00');
  });
});

describe('respostas da Focus', () => {
  it('consulta: processando, autorizada (sem o prefixo NFe), rejeitada, denegada e cancelada', () => {
    expect(interpretarConsultaFocus({ status: 'processando_autorizacao' })).toEqual({ situacao: 'PROCESSANDO' });
    expect(
      interpretarConsultaFocus({
        status: 'autorizado',
        status_sefaz: '100',
        chave_nfe: `NFe${CHAVE_VENDA_TESTE}`,
        numero: '123',
        serie: '1',
        caminho_xml_nota_fiscal: '/arquivos/x-nfe.xml',
        caminho_danfe: '/arquivos/x.pdf',
      }),
    ).toEqual({ situacao: 'AUTORIZADA', chave: CHAVE_VENDA_TESTE, numero: '123', serie: '1', urlXml: '/arquivos/x-nfe.xml', urlDanfe: '/arquivos/x.pdf' });
    expect(interpretarConsultaFocus({ status: 'erro_autorizacao', status_sefaz: '598', mensagem_sefaz: 'Rejeicao: NF-e emitida em ambiente de homologacao' })).toEqual({
      situacao: 'REJEITADA',
      codigo: '598',
      motivo: 'Rejeicao: NF-e emitida em ambiente de homologacao',
    });
    expect(interpretarConsultaFocus({ status: 'erro_autorizacao', status_sefaz: '302', mensagem_sefaz: 'Uso Denegado' })).toEqual({
      situacao: 'REJEITADA',
      codigo: '302',
      motivo: 'NF denegada pela SEFAZ: Uso Denegado',
    });
    expect(interpretarConsultaFocus({ status: 'erro_autorizacao', erros: [{ campo: 'cep_destinatario', mensagem: 'deve ter 8 digitos' }] })).toEqual({
      situacao: 'REJEITADA',
      codigo: null,
      motivo: 'cep_destinatario: deve ter 8 digitos',
    });
    expect(interpretarConsultaFocus({ status: 'cancelado', caminho_xml_cancelamento: '/arquivos/c.xml' })).toEqual({
      situacao: 'CANCELADA',
      urlXmlCancelamento: '/arquivos/c.xml',
    });
  });

  it('"autorizado" sem a chave ou sem os arquivos, ou status desconhecido: tenta de novo', () => {
    expect(() => interpretarConsultaFocus({ status: 'autorizado' })).toThrow(ErroEmissorIndisponivel);
    expect(() => interpretarConsultaFocus({ status: 'novo_status' })).toThrow(ErroEmissorIndisponivel);
    expect(() => interpretarConsultaFocus(null)).toThrow(ErroEmissorIndisponivel);
  });

  it('cancelamento: cancelado ou recusado', () => {
    expect(interpretarCancelamentoFocus({ status: 'cancelado', status_sefaz: '135', caminho_xml_cancelamento: '/arquivos/c.xml' })).toEqual({
      situacao: 'CANCELADA',
      urlXmlCancelamento: '/arquivos/c.xml',
    });
    expect(interpretarCancelamentoFocus({ status: 'erro_cancelamento', mensagem_sefaz: 'Rejeicao: Prazo de Cancelamento Superior ao Previsto' })).toEqual({
      situacao: 'CANCELAMENTO_RECUSADO',
      motivo: 'Rejeicao: Prazo de Cancelamento Superior ao Previsto',
    });
    expect(() => interpretarCancelamentoFocus({ status: 'outro' })).toThrow(ErroEmissorIndisponivel);
  });
});
```

`src/conectores/nfe/focus.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { notaTeste } from '../../../tests/helpers/nota-teste';
import { ErroEmissorIndisponivel, ErroEmissorRecusou } from './erros';
import { criarEmissorFocus, URL_FOCUS } from './focus';
import { NOME_HOMOLOGACAO } from './focus-mapeamento';

const TOKEN = 'TOKEN-SECRETO';
const BASIC = `Basic ${Buffer.from(`${TOKEN}:`).toString('base64')}`;
const REF = notaTeste().referencia;

function json(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });
}

function criar(respostas: (Response | Error)[], ambiente: 'HOMOLOGACAO' | 'PRODUCAO' = 'HOMOLOGACAO') {
  const chamadas: { url: string; init: RequestInit }[] = [];
  const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    chamadas.push({ url: String(url), init: init ?? {} });
    const r = respostas.shift();
    if (!r) throw new Error('o teste não preparou resposta');
    if (r instanceof Error) throw r;
    return r;
  });
  const emissor = criarEmissorFocus({ ambiente, token: TOKEN, fetchFn: fetchFn as unknown as typeof fetch, agora: () => new Date('2026-11-12T13:00:00Z') });
  return { emissor, chamadas };
}

describe('criarEmissorFocus', () => {
  it('emitir: POST /v2/nfe?ref= com Basic (token como usuário, senha vazia) e o payload da devolução', async () => {
    const { emissor, chamadas } = criar([json(202, { cnpj_emitente: '11444777000161', ref: REF, status: 'processando_autorizacao' })]);
    expect(await emissor.emitir(notaTeste())).toEqual({ referencia: REF });
    expect(chamadas[0].url).toBe(`${URL_FOCUS.HOMOLOGACAO}/v2/nfe?ref=${REF}`);
    expect(chamadas[0].init.method).toBe('POST');
    expect(chamadas[0].init.headers).toMatchObject({ authorization: BASIC, 'content-type': 'application/json' });
    expect(JSON.parse(String(chamadas[0].init.body))).toMatchObject({
      finalidade_emissao: 4,
      tipo_documento: 0,
      nome_destinatario: NOME_HOMOLOGACAO,
      data_emissao: '2026-11-12T10:00:00-03:00',
    });
  });

  it('201 (autorização síncrona) e 422 pending_operation / already_processed contam como enviado (mesmo ref)', async () => {
    const { emissor } = criar([
      json(201, { status: 'autorizado' }),
      json(422, { codigo: 'pending_operation', mensagem: 'Nota em processamento' }),
      json(422, { codigo: 'already_processed', mensagem: 'Nota já autorizada' }),
    ]);
    for (let i = 0; i < 3; i++) expect(await emissor.emitir(notaTeste())).toEqual({ referencia: REF });
  });

  it('422 erro_validacao_schema é recusa definitiva com os campos; o token nunca aparece na mensagem', async () => {
    const { emissor } = criar([
      json(422, { codigo: 'erro_validacao_schema', mensagem: 'Erro de validação', erros: [{ campo: 'cep_destinatario', mensagem: 'deve ter 8 digitos' }] }),
    ]);
    const erro = await emissor.emitir(notaTeste()).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroEmissorRecusou);
    expect((erro as Error).message).toBe('Focus NFe recusou (erro_validacao_schema): Erro de validação cep_destinatario: deve ter 8 digitos');
    expect((erro as Error).message).not.toContain(TOKEN);
  });

  it('401 em HTML é token recusado; 429, 503 e falha de rede tentam de novo', async () => {
    const { emissor } = criar([
      new Response('HTTP Basic: Access denied.\n', { status: 401, headers: { 'content-type': 'text/html' } }),
      json(429, { codigo: 'limite' }),
      json(503, {}),
      new TypeError('fetch failed'),
    ]);
    const recusa = await emissor.emitir(notaTeste()).catch((e: unknown) => e);
    expect(recusa).toBeInstanceOf(ErroEmissorRecusou);
    expect((recusa as Error).message).not.toContain(TOKEN);
    await expect(emissor.emitir(notaTeste())).rejects.toBeInstanceOf(ErroEmissorIndisponivel);
    await expect(emissor.consultar(REF)).rejects.toBeInstanceOf(ErroEmissorIndisponivel);
    await expect(emissor.consultar(REF)).rejects.toThrow('A Focus NFe não respondeu (GET /v2/nfe/');
  });

  it('consultar: GET /v2/nfe/{ref}; 404 vira rejeição para reenviar', async () => {
    const { emissor, chamadas } = criar([json(200, { status: 'processando_autorizacao' }), json(404, { codigo: 'nao_encontrado' })]);
    expect(await emissor.consultar(REF)).toEqual({ situacao: 'PROCESSANDO' });
    expect(chamadas[0]).toMatchObject({ url: `${URL_FOCUS.HOMOLOGACAO}/v2/nfe/${REF}`, init: { method: 'GET' } });
    expect(await emissor.consultar(REF)).toEqual({
      situacao: 'REJEITADA',
      codigo: null,
      motivo: 'A nota não está na Focus NFe (o envio não chegou lá): use "Corrigir e reenviar".',
    });
  });

  it('cancelar: DELETE com a justificativa; erro_cancelamento e 422 nfe_nao_autorizada são recusas', async () => {
    const { emissor, chamadas } = criar([
      json(200, { status: 'cancelado', status_sefaz: '135', caminho_xml_cancelamento: '/arquivos/c.xml' }),
      json(200, { status: 'erro_cancelamento', mensagem_sefaz: 'Rejeicao: Prazo de Cancelamento Superior ao Previsto' }),
      json(422, { codigo: 'nfe_nao_autorizada', mensagem: 'Nota fiscal não autorizada' }),
    ]);
    expect(await emissor.cancelar(REF, 'Cliente desistiu da devolução')).toEqual({ situacao: 'CANCELADA', urlXmlCancelamento: '/arquivos/c.xml' });
    expect(chamadas[0].init.method).toBe('DELETE');
    expect(JSON.parse(String(chamadas[0].init.body))).toEqual({ justificativa: 'Cliente desistiu da devolução' });
    expect((await emissor.cancelar(REF, 'Cliente desistiu da devolução')).situacao).toBe('CANCELAMENTO_RECUSADO');
    expect(await emissor.cancelar(REF, 'Cliente desistiu da devolução')).toEqual({
      situacao: 'CANCELAMENTO_RECUSADO',
      motivo: 'Focus NFe recusou (nfe_nao_autorizada): Nota fiscal não autorizada',
    });
  });

  it('baixar: caminho relativo no host do ambiente, com o Basic; endereço fora da Focus é recusado', async () => {
    const { emissor, chamadas } = criar([new Response('<nfeProc/>', { status: 200 })], 'PRODUCAO');
    expect((await emissor.baixar('/arquivos/x-nfe.xml')).toString('utf8')).toBe('<nfeProc/>');
    expect(chamadas[0].url).toBe('https://api.focusnfe.com.br/arquivos/x-nfe.xml');
    expect(chamadas[0].init.headers).toMatchObject({ authorization: BASIC });
    await expect(emissor.baixar('https://outro.exemplo.com/arquivos/x.xml')).rejects.toBeInstanceOf(ErroEmissorRecusou);
  });
});
```

`src/conectores/nfe/registro.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { lerEnv } from '@/lib/env';
import { ErroEmissorRecusou } from './erros';
import { EmissorFalso } from './falso';
import { definirEmissorParaTestes, obterEmissorNFe } from './registro';

// Os testes unitários não leem o .env: as variáveis vêm de vi.stubEnv. Se o lerEnv da Parte A exigir outra variável fora de
// produção, acrescente o vi.stubEnv dela aqui.
afterEach(() => {
  vi.unstubAllEnvs();
  definirEmissorParaTestes(null);
});

describe('obterEmissorNFe (contrato §5.7)', () => {
  it('usa o emissor definido pelo teste', () => {
    const emissor = new EmissorFalso();
    definirEmissorParaTestes(emissor);
    expect(obterEmissorNFe('PRODUCAO')).toBe(emissor);
  });

  it('EMISSOR_NFE=falso: o mesmo falso nos dois ambientes, sem token', () => {
    vi.stubEnv('DATABASE_URL', 'postgres://teste');
    vi.stubEnv('EMISSOR_NFE', 'falso');
    const emissor = obterEmissorNFe('HOMOLOGACAO');
    expect(emissor).toBeInstanceOf(EmissorFalso);
    expect(obterEmissorNFe('PRODUCAO')).toBe(emissor);
  });

  it('EMISSOR_NFE=focus: exige o token do ambiente', () => {
    vi.stubEnv('DATABASE_URL', 'postgres://teste');
    vi.stubEnv('EMISSOR_NFE', 'focus');
    vi.stubEnv('FOCUS_TOKEN_HOMOLOGACAO', 'token-h');
    vi.stubEnv('FOCUS_TOKEN_PRODUCAO', '');
    expect(obterEmissorNFe('HOMOLOGACAO')).not.toBeInstanceOf(EmissorFalso);
    expect(() => obterEmissorNFe('PRODUCAO')).toThrow(ErroEmissorRecusou);
    expect(() => obterEmissorNFe('PRODUCAO')).toThrow('Falta o token da Focus NFe de produção (FOCUS_TOKEN_PRODUCAO) no .env do servidor.');
  });

  it('em produção, o lerEnv recusa o emissor falso (D17, Parte A)', () => {
    expect(() => lerEnv({ DATABASE_URL: 'postgres://teste', NODE_ENV: 'production', EMISSOR_NFE: 'falso' })).toThrow(/EMISSOR_NFE/);
  });
});
```

Rode: `npm test -- src/conectores/nfe`
Esperado: FAIL (os módulos não existem).

- [ ] **Passo 2: Implementar os erros e o falso**

`src/conectores/nfe/erros.ts`:

```ts
/** O emissor recusou de vez (dado inválido, token recusado, sem permissão): tentar de novo não adianta sem mudar algo. */
export class ErroEmissorRecusou extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroEmissorRecusou';
  }
}

/** Falha passageira (rede, tempo esgotado, 429, 5xx, resposta incompleta): a fila tenta de novo (spec §11). */
export class ErroEmissorIndisponivel extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroEmissorIndisponivel';
  }
}
```

`src/conectores/nfe/falso.ts`:

```ts
import { CODIGO_UF, montarChave } from '@/modules/fiscal/chave';
import { ErroEmissorRecusou } from './erros';
import type { EmissorNFe, NotaParaEmissao, SituacaoNota } from './tipos';

/** O que o falso lembra de cada `ref`, na memória do processo (quem emite e consulta é o worker). */
type EstadoFalso = { consultas: number; rejeitar: boolean; chave: string; numero: string; cancelada: boolean };

/** A série que o falso devolve (a EMPRESA_TESTE usa a mesma, para a conferência de série não avisar nos testes). */
export const SERIE_FALSA = '1';
const PREFIXO = 'falso://';

/** PDF mínimo de uma página, com o texto "DANFE simulado". */
const PDF_FALSO = [
  '%PDF-1.4',
  '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
  '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
  '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 100]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj',
  '4 0 obj<</Length 45>>stream',
  'BT /F1 12 Tf 20 50 Td (DANFE simulado) Tj ET',
  'endstream endobj',
  '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj',
  'trailer<</Root 1 0 R>>',
  '%%EOF',
].join('\n');

/**
 * Emissor falso (contrato §5.3), usado no desenvolvimento, nos testes e no e2e. Autoriza na 2ª consulta; rejeita quando a
 * natureza da operação contém "REJEITAR"; recusa o cancelamento quando a justificativa contém "RECUSAR". O `lerEnv`
 * recusa `EMISSOR_NFE=falso` em produção (D17).
 */
export class EmissorFalso implements EmissorNFe {
  private readonly notas = new Map<string, EstadoFalso>();

  async emitir(nota: NotaParaEmissao): Promise<{ referencia: string }> {
    const atual = this.notas.get(nota.referencia);
    // Já autorizada: igual ao 422 already_processed da Focus.
    if (atual && !atual.rejeitar && atual.consultas >= 2) return { referencia: nota.referencia };
    // Número e código saem do próprio ref: o mesmo ref gera a mesma chave, mesmo depois de o worker reiniciar.
    const numero = String(Number.parseInt(nota.referencia.slice(0, 7), 16) % 999_999_999 || 1);
    const codigo = String(Number.parseInt(nota.referencia.slice(7, 14), 16) % 100_000_000);
    this.notas.set(nota.referencia, {
      consultas: 0,
      rejeitar: nota.naturezaOperacao.toUpperCase().includes('REJEITAR'),
      chave: montarChave({
        uf: CODIGO_UF[nota.emitente.uf] ? nota.emitente.uf : 'SP',
        emitidaEm: new Date(),
        cnpj: nota.emitente.cnpj.replace(/\D/g, ''),
        serie: SERIE_FALSA,
        numero,
        codigo,
      }),
      numero,
      cancelada: false,
    });
    return { referencia: nota.referencia };
  }

  async consultar(referencia: string): Promise<SituacaoNota> {
    const nota = this.notas.get(referencia);
    if (!nota) {
      return { situacao: 'REJEITADA', codigo: null, motivo: 'Nota desconhecida no emissor simulado (o worker reiniciou?): use "Corrigir e reenviar".' };
    }
    if (nota.cancelada) return { situacao: 'CANCELADA', urlXmlCancelamento: `${PREFIXO}cancelamento/${nota.chave}` };
    nota.consultas += 1;
    if (nota.rejeitar) return { situacao: 'REJEITADA', codigo: '999', motivo: 'Rejeição simulada: a natureza da operação contém REJEITAR' };
    if (nota.consultas < 2) return { situacao: 'PROCESSANDO' };
    return {
      situacao: 'AUTORIZADA',
      chave: nota.chave,
      numero: nota.numero,
      serie: SERIE_FALSA,
      urlXml: `${PREFIXO}xml/${nota.chave}`,
      urlDanfe: `${PREFIXO}danfe/${nota.chave}`,
    };
  }

  async cancelar(referencia: string, justificativa: string): Promise<SituacaoNota> {
    if (justificativa.toUpperCase().includes('RECUSAR')) {
      return { situacao: 'CANCELAMENTO_RECUSADO', motivo: 'Cancelamento recusado (simulação): a justificativa contém RECUSAR' };
    }
    // O cancelamento roda no servidor web; quem emitiu foi o worker. Sem o estado, o arquivo sai pela referência.
    const nota = this.notas.get(referencia);
    if (nota) nota.cancelada = true;
    return { situacao: 'CANCELADA', urlXmlCancelamento: `${PREFIXO}cancelamento/${nota?.chave ?? referencia}` };
  }

  async baixar(url: string): Promise<Buffer> {
    const partes = /^falso:\/\/(xml|danfe|cancelamento)\/([0-9a-z]+)$/i.exec(url);
    if (!partes) throw new ErroEmissorRecusou(`Endereço desconhecido no emissor simulado: ${url}`);
    const [, tipo, id] = partes;
    if (tipo === 'danfe') return Buffer.from(PDF_FALSO, 'latin1');
    if (tipo === 'xml') {
      return Buffer.from(
        `<?xml version="1.0" encoding="UTF-8"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe><infNFe Id="NFe${id}" versao="4.00"><ide><mod>55</mod><tpNF>0</tpNF><finNFe>4</finNFe></ide></infNFe></NFe><protNFe versao="4.00"><infProt><chNFe>${id}</chNFe><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e (simulado)</xMotivo></infProt></protNFe></nfeProc>`,
        'utf8',
      );
    }
    return Buffer.from(
      `<?xml version="1.0" encoding="UTF-8"?><procEventoNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><evento><infEvento><chNFe>${id}</chNFe><tpEvento>110111</tpEvento></infEvento></evento><retEvento><infEvento><cStat>135</cStat><xMotivo>Evento registrado (simulado)</xMotivo></infEvento></retEvento></procEventoNFe>`,
      'utf8',
    );
  }
}
```

- [ ] **Passo 3: Implementar o mapeamento e o cliente da Focus**

`src/conectores/nfe/focus-mapeamento.ts`:

```ts
import type { AmbienteNfe } from '@/modules/configuracoes/dominio';
import { ErroEmissorIndisponivel } from './erros';
import type { NotaParaEmissao, SituacaoNota } from './tipos';

/**
 * Tradução entre a NotaParaEmissao e a API da Focus NFe (pesquisa focus-nfe.md §2 a §4). Funções puras: na "Ligação das
 * contas reais" (contrato §9) só este arquivo muda se a homologação mostrar outro formato.
 */

/** Em homologação a SEFAZ exige este nome no destinatário (rejeição 598). */
export const NOME_HOMOLOGACAO = 'NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL';
const REGIME_FOCUS = { SIMPLES: 1, PRESUMIDO: 3, REAL: 3 } as const;
/** status_sefaz de uso denegado (a Focus não tem o status "denegado"; decisão 16). */
const CODIGOS_DENEGADA = new Set(['110', '301', '302', '303']);

export type RespostaFocus = {
  status?: string;
  status_sefaz?: string | number;
  mensagem_sefaz?: string;
  chave_nfe?: string;
  numero?: string | number;
  serie?: string | number;
  caminho_xml_nota_fiscal?: string;
  caminho_danfe?: string;
  caminho_xml_cancelamento?: string;
  codigo?: string;
  mensagem?: string;
  erros?: { campo?: string; mensagem?: string }[];
};

export function arredondar(valor: number, casas = 2): number {
  const fator = 10 ** casas;
  return Math.round((valor + Number.EPSILON) * fator) / fator;
}

/** "2026-11-12T10:00:00-03:00": horário de Brasília (sem horário de verão desde 2019). */
export function dataFocus(data: Date): string {
  const local = new Date(data.getTime() - 3 * 60 * 60 * 1000);
  return `${local.toISOString().slice(0, 19)}-03:00`;
}

type Payload = Record<string, unknown>;

/** Tira os campos vazios: a Focus trata "" e null como "informado". */
function semVazios(objeto: Payload): Payload {
  return Object.fromEntries(Object.entries(objeto).filter(([, valor]) => valor !== null && valor !== undefined && valor !== ''));
}

export function montarPayloadFocus(nota: NotaParaEmissao, opcoes: { ambiente: AmbienteNfe; emitidaEm: Date }): Payload {
  const items = nota.itens.map((item, i) => {
    const t = item.tributos ?? {};
    return semVazios({
      numero_item: i + 1,
      codigo_produto: item.codigo,
      descricao: item.descricao.slice(0, 120),
      codigo_ncm: item.ncm,
      cfop: item.cfop,
      unidade_comercial: item.unidade,
      quantidade_comercial: item.quantidade,
      valor_unitario_comercial: item.valorUnitario,
      unidade_tributavel: item.unidade,
      quantidade_tributavel: item.quantidade,
      valor_unitario_tributavel: item.valorUnitario,
      valor_bruto: arredondar(item.quantidade * item.valorUnitario),
      codigo_barras_comercial: item.ean ?? 'SEM GTIN',
      codigo_barras_tributavel: item.ean ?? 'SEM GTIN',
      inclui_no_total: 1,
      icms_origem: item.icmsOrigem,
      icms_situacao_tributaria: item.icmsSituacao,
      icms_modalidade_base_calculo: t.icmsBase !== undefined ? 3 : undefined,
      icms_base_calculo: t.icmsBase,
      icms_aliquota: t.icmsAliquota,
      icms_valor: t.icmsValor,
      pis_situacao_tributaria: item.pisSituacao,
      pis_base_calculo: t.pisBase,
      pis_aliquota_porcentual: t.pisAliquota,
      pis_valor: t.pisValor,
      cofins_situacao_tributaria: item.cofinsSituacao,
      cofins_base_calculo: t.cofinsBase,
      cofins_aliquota_porcentual: t.cofinsAliquota,
      cofins_valor: t.cofinsValor,
    });
  });
  const valorProdutos = arredondar(items.reduce((soma, item) => soma + Number(item.valor_bruto), 0));
  const e = nota.emitente;
  const d = nota.destinatario;
  const data = dataFocus(opcoes.emitidaEm);
  return semVazios({
    natureza_operacao: nota.naturezaOperacao.slice(0, 60),
    data_emissao: data,
    data_entrada_saida: data,
    tipo_documento: nota.entrada ? 0 : 1,
    finalidade_emissao: nota.finalidade === 'DEVOLUCAO' ? 4 : 1,
    local_destino: nota.operacao === 'DENTRO_ESTADO' ? 1 : 2,
    consumidor_final: nota.consumidorFinal ? 1 : 0,
    presenca_comprador: 0,
    modalidade_frete: 9,
    regime_tributario_emitente: REGIME_FOCUS[nota.regime],
    cnpj_emitente: e.cnpj,
    inscricao_estadual_emitente: e.ie,
    nome_emitente: e.razaoSocial,
    logradouro_emitente: e.logradouro,
    numero_emitente: e.numero,
    complemento_emitente: e.complemento,
    bairro_emitente: e.bairro,
    municipio_emitente: e.cidade,
    uf_emitente: e.uf,
    cep_emitente: e.cep,
    nome_destinatario: opcoes.ambiente === 'HOMOLOGACAO' ? NOME_HOMOLOGACAO : d.nome.slice(0, 60),
    cpf_destinatario: d.cpf,
    cnpj_destinatario: d.cpf ? null : d.cnpj,
    indicador_inscricao_estadual_destinatario: d.indicadorIe,
    inscricao_estadual_destinatario: d.indicadorIe === 1 ? d.ie : null,
    logradouro_destinatario: d.logradouro,
    numero_destinatario: d.numero,
    complemento_destinatario: d.complemento,
    bairro_destinatario: d.bairro,
    municipio_destinatario: d.cidade,
    uf_destinatario: d.uf,
    cep_destinatario: d.cep,
    notas_referenciadas: nota.chavesReferenciadas.length > 0 ? nota.chavesReferenciadas.map((chave) => ({ chave_nfe: chave })) : null,
    informacoes_adicionais_contribuinte: nota.informacoesComplementares,
    valor_produtos: valorProdutos,
    valor_total: valorProdutos,
    items,
  });
}

function motivoDaResposta(r: RespostaFocus): string {
  const erros = (r.erros ?? []).map((e) => [e.campo, e.mensagem].filter(Boolean).join(': ')).filter(Boolean);
  return r.mensagem_sefaz?.trim() || erros.join('; ') || r.mensagem?.trim() || 'Rejeitada sem motivo informado';
}

export function interpretarConsultaFocus(json: unknown): SituacaoNota {
  const r = (json ?? {}) as RespostaFocus;
  switch (r.status) {
    case 'processando_autorizacao':
      return { situacao: 'PROCESSANDO' };
    case 'autorizado':
      if (!r.chave_nfe || !r.caminho_xml_nota_fiscal || !r.caminho_danfe) {
        throw new ErroEmissorIndisponivel('A Focus NFe respondeu "autorizado" sem a chave ou sem os arquivos: a consulta será repetida.');
      }
      return {
        situacao: 'AUTORIZADA',
        chave: r.chave_nfe.replace(/^NFe/i, ''),
        numero: String(r.numero ?? ''),
        serie: String(r.serie ?? ''),
        urlXml: r.caminho_xml_nota_fiscal,
        urlDanfe: r.caminho_danfe,
      };
    case 'erro_autorizacao': {
      const codigo = r.status_sefaz === undefined ? null : String(r.status_sefaz);
      const motivo = motivoDaResposta(r);
      return { situacao: 'REJEITADA', codigo, motivo: codigo && CODIGOS_DENEGADA.has(codigo) ? `NF denegada pela SEFAZ: ${motivo}` : motivo };
    }
    case 'cancelado':
      return { situacao: 'CANCELADA', urlXmlCancelamento: r.caminho_xml_cancelamento ?? null };
    default:
      throw new ErroEmissorIndisponivel(`Situação desconhecida da Focus NFe: ${String(r.status)}`);
  }
}

export function interpretarCancelamentoFocus(json: unknown): SituacaoNota {
  const r = (json ?? {}) as RespostaFocus;
  if (r.status === 'cancelado') return { situacao: 'CANCELADA', urlXmlCancelamento: r.caminho_xml_cancelamento ?? null };
  if (r.status === 'erro_cancelamento') return { situacao: 'CANCELAMENTO_RECUSADO', motivo: motivoDaResposta(r) };
  throw new ErroEmissorIndisponivel(`Resposta desconhecida da Focus NFe ao cancelar: ${String(r.status)}`);
}
```

`src/conectores/nfe/focus.ts`:

```ts
import type { AmbienteNfe } from '@/modules/configuracoes/dominio';
import { ErroEmissorIndisponivel, ErroEmissorRecusou } from './erros';
import { interpretarCancelamentoFocus, interpretarConsultaFocus, montarPayloadFocus, type RespostaFocus } from './focus-mapeamento';
import type { EmissorNFe, NotaParaEmissao, SituacaoNota } from './tipos';

/** Pesquisa focus-nfe.md §1: as rotas ficam em /v2; os arquivos (`caminho_*`) vêm como caminhos relativos ao mesmo host. */
export const URL_FOCUS: Record<AmbienteNfe, string> = {
  HOMOLOGACAO: 'https://homologacao.focusnfe.com.br',
  PRODUCAO: 'https://api.focusnfe.com.br',
};

const TEMPO_LIMITE_MS = 30_000;
const TAMANHO_MAXIMO_ARQUIVO = 10 * 1024 * 1024;
/** 422 que quer dizer "este ref já foi recebido": o envio é idempotente (pesquisa §2). */
const JA_RECEBIDA = new Set(['pending_operation', 'already_processed']);

export type OpcoesFocus = { ambiente: AmbienteNfe; token: string; fetchFn?: typeof fetch; agora?: () => Date; tempoLimiteMs?: number };
type Resposta = { status: number; corpo: RespostaFocus | null };

/** Só status, `codigo`, `mensagem` e os campos: nada do payload (dados do comprador) e nunca o token. */
function descreverErro(r: Resposta): string {
  const c = r.corpo;
  const campos = (c?.erros ?? []).map((e) => [e.campo, e.mensagem].filter(Boolean).join(': ')).filter(Boolean);
  const partes = [c?.mensagem, campos.join('; ')].filter(Boolean);
  return `Focus NFe recusou (${c?.codigo ?? r.status})${partes.length > 0 ? `: ${partes.join(' ')}` : ''}`;
}

/** Cliente da Focus NFe atrás da interface EmissorNFe. Sem novas tentativas aqui: quem tenta de novo é a fila (spec §11). */
export function criarEmissorFocus(o: OpcoesFocus): EmissorNFe {
  const fetchFn = o.fetchFn ?? fetch;
  const base = URL_FOCUS[o.ambiente];
  const agora = o.agora ?? (() => new Date());
  const tempoLimite = o.tempoLimiteMs ?? TEMPO_LIMITE_MS;
  // O token é o usuário do Basic e a senha fica vazia. Nunca vai para log nem para mensagem de erro.
  const autorizacao = `Basic ${Buffer.from(`${o.token}:`).toString('base64')}`;

  async function chamar(metodo: 'GET' | 'POST' | 'DELETE', caminho: string, corpo?: unknown): Promise<Resposta> {
    const rota = `${metodo} ${caminho.split('?')[0]}`;
    let resposta: Response;
    try {
      resposta = await fetchFn(`${base}${caminho}`, {
        method: metodo,
        headers: { authorization: autorizacao, accept: 'application/json', ...(corpo === undefined ? {} : { 'content-type': 'application/json' }) },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        signal: AbortSignal.timeout(tempoLimite),
      });
    } catch {
      throw new ErroEmissorIndisponivel(`A Focus NFe não respondeu (${rota}).`);
    }
    const texto = await resposta.text();
    let json: RespostaFocus | null = null;
    try {
      json = texto ? (JSON.parse(texto) as RespostaFocus) : null;
    } catch {
      json = null; // o 401 vem em HTML
    }
    if (resposta.status === 401 || resposta.status === 403) {
      throw new ErroEmissorRecusou('A Focus NFe recusou o token: confira FOCUS_TOKEN_HOMOLOGACAO e FOCUS_TOKEN_PRODUCAO no .env do servidor.');
    }
    if (resposta.status === 429 || resposta.status >= 500) throw new ErroEmissorIndisponivel(`A Focus NFe respondeu ${resposta.status} (${rota}).`);
    return { status: resposta.status, corpo: json };
  }

  return {
    async emitir(nota: NotaParaEmissao): Promise<{ referencia: string }> {
      const r = await chamar('POST', `/v2/nfe?ref=${encodeURIComponent(nota.referencia)}`, montarPayloadFocus(nota, { ambiente: o.ambiente, emitidaEm: agora() }));
      if (r.status === 201 || r.status === 202) return { referencia: nota.referencia };
      if (r.status === 422 && JA_RECEBIDA.has(r.corpo?.codigo ?? '')) return { referencia: nota.referencia };
      throw new ErroEmissorRecusou(descreverErro(r));
    },

    async consultar(referencia: string): Promise<SituacaoNota> {
      const r = await chamar('GET', `/v2/nfe/${encodeURIComponent(referencia)}`);
      if (r.status === 200) return interpretarConsultaFocus(r.corpo);
      if (r.status === 404) {
        return { situacao: 'REJEITADA', codigo: null, motivo: 'A nota não está na Focus NFe (o envio não chegou lá): use "Corrigir e reenviar".' };
      }
      throw new ErroEmissorIndisponivel(`A Focus NFe respondeu ${r.status} à consulta.`);
    },

    async cancelar(referencia: string, justificativa: string): Promise<SituacaoNota> {
      const r = await chamar('DELETE', `/v2/nfe/${encodeURIComponent(referencia)}`, { justificativa });
      if (r.status === 200) return interpretarCancelamentoFocus(r.corpo);
      if ([400, 404, 415, 422].includes(r.status)) return { situacao: 'CANCELAMENTO_RECUSADO', motivo: descreverErro(r) };
      throw new ErroEmissorIndisponivel(`A Focus NFe respondeu ${r.status} ao cancelamento.`);
    },

    async baixar(url: string): Promise<Buffer> {
      const destino = url.startsWith('/') ? `${base}${url}` : url;
      if (!destino.startsWith(`${base}/`)) throw new ErroEmissorRecusou('Endereço de arquivo fora da Focus NFe.');
      let resposta: Response;
      try {
        resposta = await fetchFn(destino, { headers: { authorization: autorizacao }, signal: AbortSignal.timeout(tempoLimite) });
      } catch {
        throw new ErroEmissorIndisponivel('A Focus NFe não respondeu ao baixar o arquivo.');
      }
      if (!resposta.ok) throw new ErroEmissorIndisponivel(`A Focus NFe respondeu ${resposta.status} ao baixar o arquivo.`);
      const conteudo = Buffer.from(await resposta.arrayBuffer());
      if (conteudo.length === 0 || conteudo.length > TAMANHO_MAXIMO_ARQUIVO) throw new ErroEmissorIndisponivel('Arquivo da Focus NFe vazio ou grande demais.');
      return conteudo;
    },
  };
}
```

- [ ] **Passo 4: Registro do emissor**

`src/conectores/nfe/registro.ts`:

```ts
import { lerEnv } from '@/lib/env';
import type { AmbienteNfe } from '@/modules/configuracoes/dominio';
import { ErroEmissorRecusou } from './erros';
import { EmissorFalso } from './falso';
import { criarEmissorFocus } from './focus';
import type { EmissorNFe } from './tipos';

let paraTestes: EmissorNFe | null = null;
// O falso guarda as notas na memória: uma instância por processo (o `next dev` recarrega módulos; o globalThis fica).
const armazem = globalThis as unknown as { __emissorNfeFalso?: EmissorFalso };

/** Contrato §5.7: o emissor do ambiente (token de homologação ou de produção), conforme EMISSOR_NFE. */
export function obterEmissorNFe(ambiente: AmbienteNfe): EmissorNFe {
  if (paraTestes) return paraTestes;
  const env = lerEnv();
  if (env.EMISSOR_NFE === 'falso') {
    armazem.__emissorNfeFalso ??= new EmissorFalso();
    return armazem.__emissorNfeFalso;
  }
  const producao = ambiente === 'PRODUCAO';
  const token = producao ? env.FOCUS_TOKEN_PRODUCAO : env.FOCUS_TOKEN_HOMOLOGACAO;
  if (!token) {
    throw new ErroEmissorRecusou(
      `Falta o token da Focus NFe de ${producao ? 'produção (FOCUS_TOKEN_PRODUCAO)' : 'homologação (FOCUS_TOKEN_HOMOLOGACAO)'} no .env do servidor.`,
    );
  }
  return criarEmissorFocus({ ambiente, token });
}

export function definirEmissorParaTestes(emissor: EmissorNFe | null): void {
  paraTestes = emissor;
}
```

Acrescente no **final** de `src/conectores/nfe/tipos.ts` (o contrato §5.7 lista as duas funções neste arquivo; os tipos são importados com `import type`, então não há ciclo em tempo de execução):

```ts
export { definirEmissorParaTestes, obterEmissorNFe } from './registro';
```

- [ ] **Passo 5: Rodar os testes**

Rode: `npm test -- src/conectores/nfe && npm run typecheck && npm run lint`
Esperado: PASS.

- [ ] **Passo 6: Commit**

```bash
cd "/c/Users/idmpc/devolucoes-wt/fase-4"
git add -A
git commit -m "feat: emissor de NF-e (falso para dev/testes, cliente Focus NFe com Basic e tempo limite, registro por EMISSOR_NFE)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 5: NF de venda: leitura do XML, anexo, busca no Mercado Livre e remoção

**Arquivos:**
- Dependência: `fast-xml-parser@5.11.2`
- Criar: `src/modules/fiscal/xml-nota-venda.ts`, `src/modules/fiscal/arquivos.ts`, `src/modules/fiscal/nota-venda.ts`, `tests/helpers/xml-nfe.ts`
- Modificar (acrescentar imports e código no final): `tests/helpers/fabricas-fiscal.ts`
- Testes: `src/modules/fiscal/xml-nota-venda.test.ts`, `src/modules/fiscal/nota-venda.int.test.ts`

**Interfaces:**
- Consome: `obterConector`, `definirConectorParaTestes`, `MarketplaceConnector` (contrato §5.3; o registro devolve `null` até a Fase 3); `obterArmazenamento` (contrato §5.2); `lerConfiguracaoFiscal` (Tarefa 2); `chaveValida`, `montarChave`, `ErroFiscal`, `ErroNotaVendaDuplicada`, `ItemNotaVenda`, `TributosUnitarios` (Tarefa 1); `dataFocus` (Tarefa 4).
- Produz:
  - `xml-nota-venda.ts`: `TAMANHO_MAXIMO_XML = 1_000_000`, `type DadosNotaVenda = { chave; emitidaEm: Date | null; cnpjEmitente; destinatario: Destinatario; itens: ItemNotaVenda[] }`, `interpretarXmlNotaVenda(xml): DadosNotaVenda` (lança `ErroFiscal`)
  - `arquivos.ts`: `caminhoBaseNfe(notaFiscalId, autorizadaEm): string` (`nfe/aaaa/mm/{id}`), `caminhoNotaVenda(devolucaoId, notaVendaId)`, `salvarArquivo(caminho, conteudo: Buffer, tipoConteudo)`, `lerArquivo(caminho): Promise<Buffer>`
  - `nota-venda.ts`: `registrarNotaVenda(db, devolucaoId, xml, origem, usuario | null): Promise<{ notaVendaId; chave }>` (assinatura do contrato §5.8), `temNotaEmAndamento(db, devolucaoId): Promise<boolean>`, `buscarNotaVendaNoCanal(db, devolucaoId, usuario): Promise<{ consultou: boolean; encontradas: number }>`, `removerNotaVenda(db, devolucaoId, notaVendaId, usuario)`
  - `tests/helpers/xml-nfe.ts`: `type ItemXmlTeste`, `type OpcoesXmlVenda`, `xmlNotaVendaTeste(opcoes): { xml; chave }`
  - fábrica `inserirNotaVendaTeste(db, devolucaoId, opcoes): Promise<{ notaVendaId; chave }>` (grava a linha sem arquivo; o e2e usa)

- [ ] **Passo 1: Instalar a dependência**

```bash
cd "/c/Users/idmpc/devolucoes-wt/fase-4"
npm install fast-xml-parser@5.11.2 --save-exact
```

Esperado: `"fast-xml-parser": "5.11.2"` em `dependencies` do `package.json`.

- [ ] **Passo 2: Escrever o gerador de XML de teste e o teste unitário que falha**

`tests/helpers/xml-nfe.ts`:

```ts
import { dataFocus } from '@/conectores/nfe/focus-mapeamento';
import { montarChave } from '@/modules/fiscal/chave';

/** Gera o XML autorizado (procNFe) de uma NF de venda, para os testes. Por padrão: emitida pela EMPRESA_TESTE para uma pessoa física de SP. */

export type ItemXmlTeste = {
  codigo: string;
  ean?: string | null;
  descricao?: string;
  ncm?: string;
  quantidade?: number;
  valorUnitario?: number;
  desconto?: number;
  /** true: ICMS CST 00 (18%) e PIS/COFINS CST 01 com valores. false (padrão): Simples, CSOSN 102 e PIS/COFINS não tributados. */
  tributado?: boolean;
};

export type OpcoesXmlVenda = {
  cnpjEmitente?: string;
  ufEmitente?: string;
  numero?: number;
  serie?: number;
  emitidaEm?: Date;
  destinatario?: {
    nome?: string;
    cpf?: string | null;
    cnpj?: string | null;
    ie?: string | null;
    indIEDest?: '1' | '2' | '9';
    logradouro?: string;
    numero?: string;
    bairro?: string;
    cidade?: string;
    uf?: string;
    cep?: string;
  };
  itens: ItemXmlTeste[];
  comProtocolo?: boolean;
  cStat?: string;
  modelo?: string;
  tpNF?: '0' | '1';
};

function escapar(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
const f2 = (n: number) => n.toFixed(2);

export function xmlNotaVendaTeste(o: OpcoesXmlVenda): { xml: string; chave: string } {
  const emitidaEm = o.emitidaEm ?? new Date('2026-10-20T13:00:00Z');
  const numero = String(o.numero ?? 101);
  const serie = String(o.serie ?? 1);
  const cnpj = o.cnpjEmitente ?? '11444777000161';
  const ufEmitente = o.ufEmitente ?? 'SP';
  const modelo = o.modelo ?? '55';
  const chave = montarChave({ uf: ufEmitente, emitidaEm, cnpj, modelo, serie, numero, codigo: numero.padStart(8, '0') });
  const d = {
    nome: 'Maria da Silva',
    cpf: '52998224725' as string | null,
    cnpj: null as string | null,
    ie: null as string | null,
    indIEDest: '9',
    logradouro: 'Rua B',
    numero: '50',
    bairro: 'Jardim',
    cidade: 'Sao Paulo',
    uf: 'SP',
    cep: '01002000',
    ...o.destinatario,
  };
  const dets = o.itens
    .map((item, i) => {
      const q = item.quantidade ?? 1;
      const vu = item.valorUnitario ?? 100;
      const vProd = q * vu;
      const imposto = item.tributado
        ? `<ICMS><ICMS00><orig>0</orig><CST>00</CST><modBC>3</modBC><vBC>${f2(vProd)}</vBC><pICMS>18.00</pICMS><vICMS>${f2(vProd * 0.18)}</vICMS></ICMS00></ICMS>` +
          `<PIS><PISAliq><CST>01</CST><vBC>${f2(vProd)}</vBC><pPIS>0.65</pPIS><vPIS>${f2(vProd * 0.0065)}</vPIS></PISAliq></PIS>` +
          `<COFINS><COFINSAliq><CST>01</CST><vBC>${f2(vProd)}</vBC><pCOFINS>3.00</pCOFINS><vCOFINS>${f2(vProd * 0.03)}</vCOFINS></COFINSAliq></COFINS>`
        : '<ICMS><ICMSSN102><orig>0</orig><CSOSN>102</CSOSN></ICMSSN102></ICMS><PIS><PISNT><CST>07</CST></PISNT></PIS><COFINS><COFINSNT><CST>07</CST></COFINSNT></COFINS>';
      const cfop = d.uf === ufEmitente ? '5102' : '6102';
      return (
        `<det nItem="${i + 1}"><prod><cProd>${escapar(item.codigo)}</cProd><cEAN>${item.ean ?? 'SEM GTIN'}</cEAN>` +
        `<xProd>${escapar(item.descricao ?? `Produto ${item.codigo}`)}</xProd><NCM>${item.ncm ?? '85183000'}</NCM><CFOP>${cfop}</CFOP>` +
        `<uCom>UN</uCom><qCom>${q.toFixed(4)}</qCom><vUnCom>${vu.toFixed(10)}</vUnCom><vProd>${f2(vProd)}</vProd>` +
        `${item.desconto ? `<vDesc>${f2(item.desconto)}</vDesc>` : ''}</prod><imposto>${imposto}</imposto></det>`
      );
    })
    .join('');
  const documento = d.cpf ? `<CPF>${d.cpf}</CPF>` : `<CNPJ>${d.cnpj ?? ''}</CNPJ>`;
  const nfe =
    `<NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe Id="NFe${chave}" versao="4.00">` +
    `<ide><cUF>35</cUF><natOp>Venda de mercadoria</natOp><mod>${modelo}</mod><serie>${serie}</serie><nNF>${numero}</nNF>` +
    `<dhEmi>${dataFocus(emitidaEm)}</dhEmi><tpNF>${o.tpNF ?? '1'}</tpNF><finNFe>1</finNFe><indFinal>1</indFinal></ide>` +
    `<emit><CNPJ>${cnpj}</CNPJ><xNome>Empresa Teste Ltda</xNome><enderEmit><UF>${ufEmitente}</UF></enderEmit><IE>110042490114</IE></emit>` +
    `<dest>${documento}<xNome>${escapar(d.nome)}</xNome><enderDest><xLgr>${escapar(d.logradouro)}</xLgr><nro>${d.numero}</nro>` +
    `<xBairro>${escapar(d.bairro)}</xBairro><xMun>${escapar(d.cidade)}</xMun><UF>${d.uf}</UF><CEP>${d.cep}</CEP></enderDest>` +
    `<indIEDest>${d.indIEDest}</indIEDest>${d.ie ? `<IE>${d.ie}</IE>` : ''}</dest>${dets}</infNFe></NFe>`;
  const cabecalho = '<?xml version="1.0" encoding="UTF-8"?>';
  const xml =
    o.comProtocolo === false
      ? `${cabecalho}${nfe}`
      : `${cabecalho}<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">${nfe}` +
        `<protNFe versao="4.00"><infProt><chNFe>${chave}</chNFe><cStat>${o.cStat ?? '100'}</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe></nfeProc>`;
  return { xml, chave };
}
```

`src/modules/fiscal/xml-nota-venda.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { xmlNotaVendaTeste } from '../../../tests/helpers/xml-nfe';
import { ErroFiscal } from './erros';
import { interpretarXmlNotaVenda, TAMANHO_MAXIMO_XML } from './xml-nota-venda';

describe('interpretarXmlNotaVenda (spec §7.5)', () => {
  it('lê chave, emissão, emitente, destinatário (só o necessário) e itens com tributos por unidade', () => {
    const { xml, chave } = xmlNotaVendaTeste({
      itens: [{ codigo: 'FONE-01', ean: '7891234567895', descricao: 'Fone Bluetooth', quantidade: 2, valorUnitario: 100, tributado: true }],
    });
    expect(interpretarXmlNotaVenda(xml)).toEqual({
      chave,
      emitidaEm: new Date('2026-10-20T13:00:00Z'),
      cnpjEmitente: '11444777000161',
      destinatario: {
        nome: 'Maria da Silva',
        cpf: '52998224725',
        cnpj: null,
        ie: null,
        indicadorIe: 9,
        logradouro: 'Rua B',
        numero: '50',
        complemento: null,
        bairro: 'Jardim',
        cidade: 'Sao Paulo',
        uf: 'SP',
        cep: '01002000',
      },
      itens: [
        {
          numero: 1,
          codigo: 'FONE-01',
          ean: '7891234567895',
          descricao: 'Fone Bluetooth',
          ncm: '85183000',
          cfop: '5102',
          unidade: 'UN',
          quantidade: 2,
          valorUnitario: 100,
          desconto: 0,
          origem: 0,
          tributosPorUnidade: {
            icmsBase: 100,
            icmsAliquota: 18,
            icmsValor: 18,
            pisBase: 100,
            pisAliquota: 0.65,
            pisValor: 0.65,
            cofinsBase: 100,
            cofinsAliquota: 3,
            cofinsValor: 3,
          },
          itensDevolucaoIds: [],
        },
      ],
    });
  });

  it('Simples sem valores de tributo, "SEM GTIN" sem EAN, comprador PJ contribuinte e "&" no nome', () => {
    const { xml } = xmlNotaVendaTeste({
      destinatario: { nome: 'M&M Comercio Ltda', cpf: null, cnpj: '19131243000197', ie: '123456789', indIEDest: '1', uf: 'RJ' },
      itens: [{ codigo: 'CABO-02', ean: null, quantidade: 1, valorUnitario: 25.5 }],
    });
    const dados = interpretarXmlNotaVenda(xml);
    expect(dados.destinatario).toMatchObject({ nome: 'M&M Comercio Ltda', cpf: null, cnpj: '19131243000197', ie: '123456789', indicadorIe: 1, uf: 'RJ' });
    expect(dados.itens[0]).toMatchObject({ codigo: 'CABO-02', ean: null, cfop: '6102', valorUnitario: 25.5, tributosPorUnidade: {} });
  });

  it('recusa o que não serve, com a mensagem em português', () => {
    const base = xmlNotaVendaTeste({ itens: [{ codigo: 'A' }] });
    const digitoErrado = base.chave.slice(0, 43) + String((Number(base.chave[43]) + 1) % 10);
    const casos: [string, string][] = [
      ['nao e xml', 'O arquivo não é um XML válido.'],
      ['<?xml version="1.0"?><outro><a>1</a></outro>', 'O XML não é de uma NF-e (falta o grupo infNFe).'],
      [base.xml.replace(base.chave, digitoErrado), 'A chave de acesso do XML é inválida.'],
      [xmlNotaVendaTeste({ modelo: '65', itens: [{ codigo: 'A' }] }).xml, 'O XML não é de uma NF-e (modelo 55).'],
      [xmlNotaVendaTeste({ tpNF: '0', itens: [{ codigo: 'A' }] }).xml, 'A nota do XML não é de saída: anexe a NF de venda.'],
      [xmlNotaVendaTeste({ comProtocolo: false, itens: [{ codigo: 'A' }] }).xml, 'O XML não traz a autorização da SEFAZ: use o XML autorizado (com o protocolo).'],
      [xmlNotaVendaTeste({ cStat: '110', itens: [{ codigo: 'A' }] }).xml, 'O XML não traz a autorização da SEFAZ: use o XML autorizado (com o protocolo).'],
      [xmlNotaVendaTeste({ destinatario: { logradouro: '' }, itens: [{ codigo: 'A' }] }).xml, 'A NF de venda não traz estes dados do destinatário: logradouro.'],
      [xmlNotaVendaTeste({ itens: [{ codigo: 'A', quantidade: 0 }] }).xml, 'O item 1 da NF de venda tem quantidade zero.'],
    ];
    for (const [xml, mensagem] of casos) {
      expect(() => interpretarXmlNotaVenda(xml), mensagem).toThrow(new ErroFiscal(mensagem));
    }
  });

  it('recusa arquivo grande demais antes de ler', () => {
    expect(() => interpretarXmlNotaVenda(`<a>${'x'.repeat(TAMANHO_MAXIMO_XML)}</a>`)).toThrow('O XML passa de 1 MB: confira se é o arquivo da NF de venda.');
  });
});
```

Rode: `npm test -- src/modules/fiscal/xml-nota-venda.test.ts`
Esperado: FAIL (`./xml-nota-venda` não existe).

- [ ] **Passo 3: Implementar a leitura do XML**

`src/modules/fiscal/xml-nota-venda.ts`:

```ts
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { Destinatario } from '@/conectores/nfe/tipos';
import { somenteDigitos } from '@/modules/catalogo/documentos';
import { chaveValida } from './chave';
import type { ItemNotaVenda, TributosUnitarios } from './dominio';
import { ErroFiscal } from './erros';

/** 1 MB: um XML de NF-e tem dezenas de KB; acima disso não é a NF de venda. */
export const TAMANHO_MAXIMO_XML = 1_000_000;

export type DadosNotaVenda = {
  chave: string;
  emitidaEm: Date | null;
  cnpjEmitente: string;
  destinatario: Destinatario;
  itens: ItemNotaVenda[];
};

type No = Record<string, unknown>;

const leitor = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  // Tudo como texto: chave, CNPJ, NCM e CEP têm zeros à esquerda.
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  ignoreDeclaration: true,
  isArray: (nome) => nome === 'det',
  // O XML vem de fora: entidades do DOCTYPE não são expandidas; as padrão (&amp;) continuam valendo.
  processEntities: { enabled: true, maxEntityCount: 0 },
});

function no(valor: unknown): No | null {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor) ? (valor as No) : null;
}
function texto(valor: unknown): string {
  if (typeof valor === 'string') return valor.trim();
  if (typeof valor === 'number') return String(valor);
  return '';
}
function numero(valor: unknown, campo: string): number {
  const t = texto(valor);
  if (t === '') return 0;
  const n = Number(t);
  if (!Number.isFinite(n)) throw new ErroFiscal(`Valor inválido no XML (${campo}): ${t}`);
  return n;
}
function opcional(valor: unknown): number | undefined {
  const t = texto(valor);
  if (t === '') return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}
/** ICMS, PIS e COFINS têm um subgrupo só (ICMS00, ICMSSN102, PISAliq...): pega o primeiro. */
function primeiroGrupo(valor: unknown): No {
  const grupo = no(valor);
  if (!grupo) return {};
  for (const filho of Object.values(grupo)) {
    const g = no(filho);
    if (g) return g;
  }
  return {};
}
function semIndefinidos(t: TributosUnitarios): TributosUnitarios {
  return Object.fromEntries(Object.entries(t).filter(([, v]) => v !== undefined)) as TributosUnitarios;
}

function lerDestinatario(dest: No | null): Destinatario {
  if (!dest) throw new ErroFiscal('A NF de venda não tem destinatário.');
  const endereco = no(dest.enderDest) ?? {};
  const cpf = somenteDigitos(texto(dest.CPF)) || null;
  const cnpj = texto(dest.CNPJ).toUpperCase() || null;
  const indicador = texto(dest.indIEDest);
  const d: Destinatario = {
    nome: texto(dest.xNome),
    cpf,
    cnpj,
    ie: texto(dest.IE) || null,
    indicadorIe: indicador === '1' ? 1 : indicador === '2' ? 2 : 9,
    logradouro: texto(endereco.xLgr),
    numero: texto(endereco.nro) || 'S/N',
    complemento: texto(endereco.xCpl) || null,
    bairro: texto(endereco.xBairro),
    cidade: texto(endereco.xMun),
    uf: texto(endereco.UF).toUpperCase(),
    cep: somenteDigitos(texto(endereco.CEP)),
  };
  const faltando = [
    d.nome ? null : 'nome',
    cpf || cnpj ? null : 'CPF ou CNPJ',
    d.logradouro ? null : 'logradouro',
    d.bairro ? null : 'bairro',
    d.cidade ? null : 'município',
    /^[A-Z]{2}$/.test(d.uf) ? null : 'UF',
  ].filter((x): x is string => x !== null);
  if (faltando.length > 0) throw new ErroFiscal(`A NF de venda não traz estes dados do destinatário: ${faltando.join(', ')}.`);
  return d;
}

function lerItem(det: No, indice: number): ItemNotaVenda {
  const prod = no(det.prod) ?? {};
  const imposto = no(det.imposto) ?? {};
  const numeroItem = Number(texto(det['@_nItem'])) || indice + 1;
  const quantidade = numero(prod.qCom, `qCom do item ${numeroItem}`);
  if (quantidade <= 0) throw new ErroFiscal(`O item ${numeroItem} da NF de venda tem quantidade zero.`);
  const porUnidade = (valor: number | undefined) => (valor === undefined ? undefined : valor / quantidade);
  const icms = primeiroGrupo(imposto.ICMS);
  const pis = primeiroGrupo(imposto.PIS);
  const cofins = primeiroGrupo(imposto.COFINS);
  const ean = texto(prod.cEAN);
  return {
    numero: numeroItem,
    codigo: texto(prod.cProd),
    ean: /^\d{8,14}$/.test(ean) ? ean : null,
    descricao: texto(prod.xProd),
    ncm: somenteDigitos(texto(prod.NCM)),
    cfop: texto(prod.CFOP),
    unidade: texto(prod.uCom) || 'UN',
    quantidade,
    valorUnitario: numero(prod.vUnCom, `vUnCom do item ${numeroItem}`),
    desconto: numero(prod.vDesc, `vDesc do item ${numeroItem}`),
    origem: Number(texto(icms.orig)) || 0,
    tributosPorUnidade: semIndefinidos({
      icmsBase: porUnidade(opcional(icms.vBC)),
      icmsAliquota: opcional(icms.pICMS),
      icmsValor: porUnidade(opcional(icms.vICMS)),
      pisBase: porUnidade(opcional(pis.vBC)),
      pisAliquota: opcional(pis.pPIS),
      pisValor: porUnidade(opcional(pis.vPIS)),
      cofinsBase: porUnidade(opcional(cofins.vBC)),
      cofinsAliquota: opcional(cofins.pCOFINS),
      cofinsValor: porUnidade(opcional(cofins.vCOFINS)),
    }),
    itensDevolucaoIds: [],
  };
}

/**
 * Lê o XML autorizado da NF de venda (spec §7.5): chave, emitente, destinatário (só o necessário à NF, LGPD) e itens com
 * valores e tributos por unidade. Lança ErroFiscal com a mensagem para a tela.
 */
export function interpretarXmlNotaVenda(xml: string): DadosNotaVenda {
  if (Buffer.byteLength(xml, 'utf8') > TAMANHO_MAXIMO_XML) throw new ErroFiscal('O XML passa de 1 MB: confira se é o arquivo da NF de venda.');
  if (XMLValidator.validate(xml) !== true) throw new ErroFiscal('O arquivo não é um XML válido.');
  const raiz = no(leitor.parse(xml)) ?? {};
  const proc = no(raiz.nfeProc);
  const nfe = no(proc ? proc.NFe : raiz.NFe);
  const inf = no(nfe?.infNFe);
  if (!inf) throw new ErroFiscal('O XML não é de uma NF-e (falta o grupo infNFe).');
  const chave = texto(inf['@_Id']).replace(/^NFe/, '');
  if (!chaveValida(chave)) throw new ErroFiscal('A chave de acesso do XML é inválida.');
  const ide = no(inf.ide) ?? {};
  if (texto(ide.mod) !== '55') throw new ErroFiscal('O XML não é de uma NF-e (modelo 55).');
  if (texto(ide.tpNF) !== '1') throw new ErroFiscal('A nota do XML não é de saída: anexe a NF de venda.');
  const cStat = texto(no(no(proc?.protNFe)?.infProt)?.cStat);
  if (cStat !== '100' && cStat !== '150') throw new ErroFiscal('O XML não traz a autorização da SEFAZ: use o XML autorizado (com o protocolo).');
  const destinatario = lerDestinatario(no(inf.dest));
  const dets = Array.isArray(inf.det) ? inf.det : [];
  if (dets.length === 0) throw new ErroFiscal('A NF de venda não tem itens.');
  const itens = dets.map((det, i) => lerItem(no(det) ?? {}, i));
  const dhEmi = texto(ide.dhEmi);
  return {
    chave,
    emitidaEm: dhEmi && !Number.isNaN(Date.parse(dhEmi)) ? new Date(dhEmi) : null,
    cnpjEmitente: texto(no(inf.emit)?.CNPJ).toUpperCase(),
    destinatario,
    itens,
  };
}
```

Rode: `npm test -- src/modules/fiscal/xml-nota-venda.test.ts`
Esperado: PASS.

- [ ] **Passo 4: Escrever o teste de integração que falha**

`src/modules/fiscal/nota-venda.int.test.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { definirConectorParaTestes } from '@/conectores/marketplace/registro';
import type { MarketplaceConnector } from '@/conectores/marketplace/tipos';
import { devolucoes, notasFiscais, notasVenda } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { listarEventos } from '@/modules/historico/eventos';
import { obterArmazenamento } from '@/modules/midia/armazenamento';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { configurarFiscalTeste, criarDevolucaoNoEstoqueTeste } from '../../../tests/helpers/fabricas-fiscal';
import { xmlNotaVendaTeste } from '../../../tests/helpers/xml-nfe';
import { referenciaDaNota } from './dominio';
import { buscarNotaVendaNoCanal, registrarNotaVenda, removerNotaVenda } from './nota-venda';

const { db, sql } = criarDbTeste();
let gestor: UsuarioSessao;
let fiscal: UsuarioSessao;
let operador: UsuarioSessao;

/** Conector do ML de mentira: só `obterXmlNotaVenda` importa aqui (contrato §5.8). */
function conectorComNotas(xmlPorPedido: Record<string, string>): MarketplaceConnector {
  return {
    canal: 'MERCADO_LIVRE',
    listarAtualizadasDesde: () => {
      throw new Error('não usado neste teste');
    },
    obter: async () => {
      throw new Error('não usado neste teste');
    },
    enviarResultadoConferencia: async () => {
      throw new Error('não usado neste teste');
    },
    obterXmlNotaVenda: async (pedido) => xmlPorPedido[pedido] ?? null,
  };
}

beforeEach(async () => {
  await limparTabelas(sql);
  gestor = await criarUsuarioTeste(db, 'GESTOR');
  fiscal = await criarUsuarioTeste(db, 'FISCAL');
  operador = await criarUsuarioTeste(db, 'OPERADOR');
  await configurarFiscalTeste(db, gestor);
});
afterEach(() => {
  definirConectorParaTestes('MERCADO_LIVRE', null);
});
afterAll(async () => {
  await sql.end();
});

describe('NF de venda (spec §7.5, contrato §5.8)', () => {
  it('anexa: guarda o XML no armazenamento, grava destinatário e itens e registra no histórico', async () => {
    const dev = await criarDevolucaoNoEstoqueTeste(db, gestor, { unidades: [{ sku: 'FONE-01', destino: 'BOM' }] });
    const { xml, chave } = xmlNotaVendaTeste({ itens: [{ codigo: 'FONE-01' }] });
    const r = await registrarNotaVenda(db, dev.id, xml, 'ANEXO', fiscal);
    expect(r).toEqual({ notaVendaId: expect.any(String), chave });

    const [nota] = await db.select().from(notasVenda).where(eq(notasVenda.id, r.notaVendaId));
    expect(nota).toMatchObject({
      devolucaoId: dev.id,
      chave,
      origem: 'ANEXO',
      xmlCaminho: `notas-venda/${dev.id}/${r.notaVendaId}.xml`,
      anexadaPor: fiscal.id,
      destinatario: { cpf: '52998224725', uf: 'SP' },
    });
    expect(nota.itens).toHaveLength(1);
    expect(await obterArmazenamento().existe(nota.xmlCaminho)).toBe(true);
    expect(await listarEventos(db, 'devolucao', dev.id)).toContainEqual(
      expect.objectContaining({ acao: 'nota_venda_anexada', usuarioNome: fiscal.nome, dados: { notaVendaId: r.notaVendaId, chave } }),
    );
  });

  it('recusa: outro CNPJ, anexo repetido, Operador, NF de devolução em andamento e devolução concluída', async () => {
    const dev = await criarDevolucaoNoEstoqueTeste(db, gestor, { unidades: [{ sku: 'A', destino: 'BOM' }] });
    const deOutro = xmlNotaVendaTeste({ cnpjEmitente: '19131243000197', itens: [{ codigo: 'A' }] }).xml;
    await expect(registrarNotaVenda(db, dev.id, deOutro, 'ANEXO', fiscal)).rejects.toThrow(
      'Esta NF de venda foi emitida por outro CNPJ (19.131.243/0001-97): anexe a nota emitida pela empresa.',
    );
    const boa = xmlNotaVendaTeste({ itens: [{ codigo: 'A' }] }).xml;
    await registrarNotaVenda(db, dev.id, boa, 'ANEXO', fiscal);
    await expect(registrarNotaVenda(db, dev.id, boa, 'ANEXO', fiscal)).rejects.toThrow('Esta NF de venda já está anexada a esta devolução.');
    const outra = xmlNotaVendaTeste({ numero: 102, itens: [{ codigo: 'A' }] }).xml;
    await expect(registrarNotaVenda(db, dev.id, outra, 'ANEXO', operador)).rejects.toThrow('Só o Fiscal ou o Gestor mexem na NF de venda.');

    const id = randomUUID();
    await db.insert(notasFiscais).values({ id, tipo: 'DEVOLUCAO_VENDA', devolucaoId: dev.id, ambiente: 'HOMOLOGACAO', referenciaEmissor: referenciaDaNota(id) });
    await expect(registrarNotaVenda(db, dev.id, outra, 'ANEXO', fiscal)).rejects.toThrow(
      'Esta devolução já tem NF de devolução em processamento ou autorizada.',
    );
    await db.update(devolucoes).set({ status: 'CONCLUIDA' }).where(eq(devolucoes.id, dev.id));
    await expect(registrarNotaVenda(db, dev.id, outra, 'ANEXO', fiscal)).rejects.toThrow('A devolução está concluída: a NF de venda não muda mais.');
  });

  it('busca no Mercado Livre pelo conector; sem conector (até a Fase 3) não consulta; não duplica', async () => {
    const dev = await criarDevolucaoNoEstoqueTeste(db, gestor, {
      canal: 'MERCADO_LIVRE',
      pedido: 'ML-2000001',
      unidades: [{ sku: 'FONE-01', destino: 'BOM' }],
    });
    expect(await buscarNotaVendaNoCanal(db, dev.id, fiscal)).toEqual({ consultou: false, encontradas: 0 });

    const { xml, chave } = xmlNotaVendaTeste({ itens: [{ codigo: 'FONE-01' }] });
    definirConectorParaTestes('MERCADO_LIVRE', conectorComNotas({ 'ML-2000001': xml }));
    expect(await buscarNotaVendaNoCanal(db, dev.id, fiscal)).toEqual({ consultou: true, encontradas: 1 });
    const [nota] = await db.select().from(notasVenda).where(eq(notasVenda.devolucaoId, dev.id));
    expect(nota).toMatchObject({ chave, origem: 'MERCADO_LIVRE' });
    expect(await buscarNotaVendaNoCanal(db, dev.id, fiscal)).toEqual({ consultou: true, encontradas: 0 });
    expect((await listarEventos(db, 'devolucao', dev.id)).map((e) => e.acao)).toContain('nota_venda_obtida_ml');

    const shopee = await criarDevolucaoNoEstoqueTeste(db, gestor, { unidades: [{ sku: 'FONE-01', destino: 'BOM' }] });
    expect(await buscarNotaVendaNoCanal(db, shopee.id, fiscal)).toEqual({ consultou: false, encontradas: 0 });
  });

  it('remove a NF de venda anexada por engano e apaga o arquivo', async () => {
    const dev = await criarDevolucaoNoEstoqueTeste(db, gestor, { unidades: [{ sku: 'A', destino: 'BOM' }] });
    const r = await registrarNotaVenda(db, dev.id, xmlNotaVendaTeste({ itens: [{ codigo: 'A' }] }).xml, 'ANEXO', fiscal);
    const caminho = `notas-venda/${dev.id}/${r.notaVendaId}.xml`;
    await removerNotaVenda(db, dev.id, r.notaVendaId, fiscal);
    expect(await db.select().from(notasVenda).where(eq(notasVenda.devolucaoId, dev.id))).toEqual([]);
    expect(await obterArmazenamento().existe(caminho)).toBe(false);
    expect((await listarEventos(db, 'devolucao', dev.id)).at(-1)).toMatchObject({ acao: 'nota_venda_removida', usuarioNome: fiscal.nome });
    await expect(removerNotaVenda(db, dev.id, r.notaVendaId, fiscal)).rejects.toThrow('NF de venda não encontrada.');
  });
});
```

Rode: `npm run test:int -- src/modules/fiscal/nota-venda.int.test.ts`
Esperado: FAIL (`./nota-venda` não existe).

- [ ] **Passo 5: Implementar os arquivos e a NF de venda**

`src/modules/fiscal/arquivos.ts`:

```ts
import { Readable } from 'node:stream';
import { obterArmazenamento } from '@/modules/midia/armazenamento';

const ANO_MES = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' });

/** Contrato §5.2: `nfe/{aaaa}/{mm}/{notaFiscalId}` (mês da autorização, horário de Brasília). Some `.xml`, `-danfe.pdf` ou `-cancelamento.xml`. */
export function caminhoBaseNfe(notaFiscalId: string, autorizadaEm: Date): string {
  const partes = Object.fromEntries(ANO_MES.formatToParts(autorizadaEm).map((p) => [p.type, p.value]));
  return `nfe/${partes.year}/${partes.month}/${notaFiscalId}`;
}

/** Contrato §5.2: `notas-venda/{devolucaoId}/{notaVendaId}.xml`. */
export function caminhoNotaVenda(devolucaoId: string, notaVendaId: string): string {
  return `notas-venda/${devolucaoId}/${notaVendaId}.xml`;
}

export async function salvarArquivo(caminho: string, conteudo: Buffer, tipoConteudo: string): Promise<void> {
  // Readable.from de um Buffer não itera byte a byte: o Buffer vai inteiro, num pedaço só.
  await obterArmazenamento().salvar(caminho, Readable.from(conteudo), { tipoConteudo, tamanho: conteudo.length });
}

export async function lerArquivo(caminho: string): Promise<Buffer> {
  const fluxo = await obterArmazenamento().ler(caminho);
  const partes: Buffer[] = [];
  for await (const parte of fluxo) partes.push(Buffer.isBuffer(parte) ? parte : Buffer.from(parte as string));
  return Buffer.concat(partes);
}
```

`src/modules/fiscal/nota-venda.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { obterConector } from '@/conectores/marketplace/registro';
import type { DbOuTx } from '@/db/client';
import { ehViolacaoDeUnicidade } from '@/db/erros';
import { devolucoes, notasFiscais, notasVenda } from '@/db/schema';
import { pode } from '@/modules/auth/permissoes';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { formatarCnpj } from '@/modules/catalogo/documentos';
import { ROTULO_STATUS, type StatusDevolucao } from '@/modules/devolucoes/dominio';
import { registrarEvento } from '@/modules/historico/eventos';
import { obterArmazenamento } from '@/modules/midia/armazenamento';
import { caminhoNotaVenda, salvarArquivo } from './arquivos';
import { lerConfiguracaoFiscal } from './configuracao';
import type { OrigemNotaVenda } from './dominio';
import { ErroFiscal, ErroNotaVendaDuplicada } from './erros';
import { interpretarXmlNotaVenda } from './xml-nota-venda';

/** Devolução encerrada não muda mais a NF de venda. */
const ENCERRADAS: StatusDevolucao[] = ['CANCELADA', 'EXTRAVIADA', 'CONCLUIDA'];

function exigirFiscal(usuario: UsuarioSessao | null): void {
  if (usuario && !pode(usuario.perfil, 'gerir_fiscal')) throw new ErroFiscal('Só o Fiscal ou o Gestor mexem na NF de venda.');
}

/** NF de devolução em processamento ou autorizada: a NF de venda e a escolha dos itens ficam travadas. */
export async function temNotaEmAndamento(db: DbOuTx, devolucaoId: string): Promise<boolean> {
  const [nota] = await db
    .select({ id: notasFiscais.id })
    .from(notasFiscais)
    .where(and(eq(notasFiscais.devolucaoId, devolucaoId), inArray(notasFiscais.situacao, ['PROCESSANDO', 'AUTORIZADA'])))
    .limit(1);
  return nota !== undefined;
}

async function exigirPodeMexer(db: DbOuTx, devolucaoId: string): Promise<void> {
  const [d] = await db.select({ status: devolucoes.status }).from(devolucoes).where(eq(devolucoes.id, devolucaoId));
  if (!d) throw new ErroFiscal('Devolução não encontrada.');
  if (ENCERRADAS.includes(d.status)) throw new ErroFiscal(`A devolução está ${ROTULO_STATUS[d.status].toLowerCase()}: a NF de venda não muda mais.`);
  if (await temNotaEmAndamento(db, devolucaoId)) throw new ErroFiscal('Esta devolução já tem NF de devolução em processamento ou autorizada.');
}

/** Contrato §5.8: o mesmo caminho para a NF anexada pelo Fiscal e para a obtida do Mercado Livre. */
export async function registrarNotaVenda(
  db: DbOuTx,
  devolucaoId: string,
  xml: string,
  origem: OrigemNotaVenda,
  usuario: UsuarioSessao | null,
): Promise<{ notaVendaId: string; chave: string }> {
  exigirFiscal(usuario);
  const dados = interpretarXmlNotaVenda(xml);
  await exigirPodeMexer(db, devolucaoId);
  const { emitente } = await lerConfiguracaoFiscal(db);
  if (dados.cnpjEmitente !== emitente.cnpj) {
    throw new ErroFiscal(`Esta NF de venda foi emitida por outro CNPJ (${formatarCnpj(dados.cnpjEmitente)}): anexe a nota emitida pela empresa.`);
  }
  const [existente] = await db
    .select({ id: notasVenda.id })
    .from(notasVenda)
    .where(and(eq(notasVenda.devolucaoId, devolucaoId), eq(notasVenda.chave, dados.chave)));
  if (existente) throw new ErroNotaVendaDuplicada();

  const id = randomUUID();
  const caminho = caminhoNotaVenda(devolucaoId, id);
  await salvarArquivo(caminho, Buffer.from(xml, 'utf8'), 'application/xml');
  try {
    await db.transaction(async (tx) => {
      await tx.insert(notasVenda).values({
        id,
        devolucaoId,
        chave: dados.chave,
        origem,
        xmlCaminho: caminho,
        destinatario: dados.destinatario,
        itens: dados.itens,
        emitidaEm: dados.emitidaEm,
        anexadaPor: usuario?.id ?? null,
      });
      await registrarEvento(tx, {
        entidade: 'devolucao',
        entidadeId: devolucaoId,
        acao: origem === 'ANEXO' ? 'nota_venda_anexada' : 'nota_venda_obtida_ml',
        usuarioId: usuario?.id ?? null,
        dados: { notaVendaId: id, chave: dados.chave },
      });
    });
  } catch (erro) {
    await obterArmazenamento()
      .apagar(caminho)
      .catch(() => undefined);
    if (ehViolacaoDeUnicidade(erro)) throw new ErroNotaVendaDuplicada();
    throw erro;
  }
  return { notaVendaId: id, chave: dados.chave };
}

/** (extra) Remove a NF de venda anexada por engano, enquanto não há NF de devolução em processamento ou autorizada. */
export async function removerNotaVenda(db: DbOuTx, devolucaoId: string, notaVendaId: string, usuario: UsuarioSessao): Promise<void> {
  exigirFiscal(usuario);
  await exigirPodeMexer(db, devolucaoId);
  const [nota] = await db
    .select({ id: notasVenda.id, chave: notasVenda.chave, xmlCaminho: notasVenda.xmlCaminho })
    .from(notasVenda)
    .where(and(eq(notasVenda.id, notaVendaId), eq(notasVenda.devolucaoId, devolucaoId)));
  if (!nota) throw new ErroFiscal('NF de venda não encontrada.');
  await db.transaction(async (tx) => {
    await tx.delete(notasVenda).where(eq(notasVenda.id, nota.id));
    await registrarEvento(tx, {
      entidade: 'devolucao',
      entidadeId: devolucaoId,
      acao: 'nota_venda_removida',
      usuarioId: usuario.id,
      dados: { notaVendaId: nota.id, chave: nota.chave },
    });
  });
  await obterArmazenamento()
    .apagar(nota.xmlCaminho)
    .catch(() => undefined);
}

/**
 * Contrato §5.8: na devolução do Mercado Livre, pede o XML de cada pedido ao conector. `consultou: false` quando não é do ML
 * ou não há conector (o registro devolve null até a Fase 3, ou sem conta ATIVA).
 */
export async function buscarNotaVendaNoCanal(
  db: DbOuTx,
  devolucaoId: string,
  usuario: UsuarioSessao | null,
): Promise<{ consultou: boolean; encontradas: number }> {
  exigirFiscal(usuario);
  const [d] = await db.select({ canal: devolucoes.canal, pedidos: devolucoes.pedidosExternos }).from(devolucoes).where(eq(devolucoes.id, devolucaoId));
  if (!d || d.canal !== 'MERCADO_LIVRE') return { consultou: false, encontradas: 0 };
  const conector = await obterConector(db, 'MERCADO_LIVRE');
  if (!conector) return { consultou: false, encontradas: 0 };
  let encontradas = 0;
  for (const pedido of d.pedidos) {
    let xml: string | null;
    try {
      xml = await conector.obterXmlNotaVenda(pedido);
    } catch {
      throw new ErroFiscal('Não foi possível consultar o Mercado Livre agora: tente de novo ou anexe o XML.');
    }
    if (!xml) continue;
    try {
      await registrarNotaVenda(db, devolucaoId, xml, 'MERCADO_LIVRE', usuario);
      encontradas += 1;
    } catch (erro) {
      if (erro instanceof ErroNotaVendaDuplicada) continue;
      throw erro;
    }
  }
  return { consultou: true, encontradas };
}
```

- [ ] **Passo 6: Fábrica da NF de venda (sem arquivo, para o e2e)**

Em `tests/helpers/fabricas-fiscal.ts`, junte `notasVenda` ao import de `@/db/schema` e acrescente no topo:

```ts
import { interpretarXmlNotaVenda } from '@/modules/fiscal/xml-nota-venda';
import { xmlNotaVendaTeste, type OpcoesXmlVenda } from './xml-nfe';
```

E no **final**:

```ts
/**
 * Grava a NF de venda direto no banco (sem o arquivo no armazenamento), lida do XML de teste pelo mesmo leitor da produção.
 * O e2e usa: o processo do teste e o servidor não compartilham o armazenamento em memória.
 */
export async function inserirNotaVendaTeste(db: DbOuTx, devolucaoId: string, opcoes: OpcoesXmlVenda): Promise<{ notaVendaId: string; chave: string }> {
  const dados = interpretarXmlNotaVenda(xmlNotaVendaTeste(opcoes).xml);
  const [nota] = await db
    .insert(notasVenda)
    .values({
      devolucaoId,
      chave: dados.chave,
      origem: 'ANEXO',
      xmlCaminho: `notas-venda/${devolucaoId}/teste-${dados.chave}.xml`,
      destinatario: dados.destinatario,
      itens: dados.itens,
      emitidaEm: dados.emitidaEm,
    })
    .returning({ id: notasVenda.id });
  return { notaVendaId: nota.id, chave: dados.chave };
}
```

- [ ] **Passo 7: Rodar tudo**

Rode: `npm test && npm run test:int && npm run typecheck && npm run lint`
Esperado: tudo PASS.

- [ ] **Passo 8: Commit**

```bash
cd "/c/Users/idmpc/devolucoes-wt/fase-4"
git add -A
git commit -m "feat: NF de venda (leitura do XML autorizado, anexo pelo Fiscal, busca pelo conector do ML e remoção)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 6: Casamento dos itens com a NF de venda (D14) e montagem da NF de devolução (spec §8.4)

**Arquivos:**
- Criar: `src/modules/fiscal/casamento.ts`, `src/modules/fiscal/montar-devolucao.ts`, `src/modules/fiscal/escolha.ts`
- Testes: `src/modules/fiscal/casamento.test.ts`, `src/modules/fiscal/montar-devolucao.test.ts`, `src/modules/fiscal/montar-devolucao.int.test.ts`

**Interfaces:**
- Consome: `lerConfiguracaoFiscal`, `operacaoPorUf`, `regraFiscal`, `type ConfiguracaoFiscal`, `type RegraFiscal`, `sugestaoDeRegra` (Tarefa 2); `ItemNotaVenda`, `ErroFiscal` (Tarefa 1); `NotaParaEmissao`, `ItemNota`, `Destinatario` (contrato §5.7); `temNotaEmAndamento`, `inserirNotaVendaTeste` (Tarefa 5); `EMITENTE_TESTE`, `DESTINATARIO_TESTE` (Tarefa 4).
- Produz:
  - `casamento.ts`: `type UnidadeParaCasar = { itemId; unidade; sku; ean: string | null }`, `type NotaVendaParaCasar`, `type AlvoCasamento = { notaVendaId: string; numeroItem: number }`, `type MotivoCasamento = 'ESCOLHA' | 'SKU' | 'EAN'`, `type ResultadoCasamento = { itemId; alvo: AlvoCasamento | null; por: MotivoCasamento | null }`, `chaveAlvo(alvo): string` (`"{notaVendaId}:{numeroItem}"`), `lerChaveAlvo(texto): AlvoCasamento | null`, `capacidade(quantidade): number`, `casarItens(unidades, notas): ResultadoCasamento[]`, `vagasRestantes(notas, resultado): Map<string, number>`
  - `montar-devolucao.ts`: `type UnidadeMontagem`, `type NotaVendaMontagem`, `type DadosDevolucaoFiscal`, `type EntradaMontagem`, `destinatarioUnico(notas)`, `preencherInformacoes(modelo, { chaves, devolucao, seriais })`, `montarNotaDevolucaoPura(entrada): NotaParaEmissao`, `carregarDadosDevolucao(db, devolucaoId): Promise<DadosDevolucaoFiscal | null>`, `montarNotaDevolucao(db, devolucaoId, referencia): Promise<NotaParaEmissao>` (o "montarNotaDevolucao" do contrato §5.7)
  - `escolha.ts`: `escolherItemNotaVenda(db: Db, devolucaoId, itemId, alvo | null, usuario): Promise<void>` (evento `nf_item_escolhido`)

**Regras da montagem (spec §8.4, decisões 7 e 8):** emitente = a empresa; destinatário = o da NF de venda; finalidade devolução, entrada; notas referenciadas = as chaves das NF de venda que têm unidade casada; itens = as unidades em AGUARDANDO_NF com destino (BOM ou PROBLEMA; AUSENTE fica fora), agrupadas por item da NF de venda, com o valor unitário da venda; CFOP, CST/CSOSN e PIS/COFINS da regra (operação pela UF); tributos proporcionais só fora do Simples e só quando o CST leva valor.

- [ ] **Passo 1: Escrever os testes unitários que falham**

`src/modules/fiscal/casamento.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { casarItens, chaveAlvo, lerChaveAlvo, vagasRestantes, type NotaVendaParaCasar, type UnidadeParaCasar } from './casamento';

const NOTA_A = '11111111-1111-4111-8111-111111111111';
const NOTA_B = '22222222-2222-4222-8222-222222222222';

function item(numero: number, codigo: string, quantidade: number, ean: string | null = null, escolhidos: string[] = []) {
  return { numero, codigo, ean, quantidade, itensDevolucaoIds: escolhidos };
}
function unidade(itemId: string, n: number, sku: string, ean: string | null = null): UnidadeParaCasar {
  return { itemId, unidade: n, sku, ean };
}

describe('casarItens (D14)', () => {
  it('pelo SKU (sem diferenciar maiúsculas), depois pelo EAN, respeitando a quantidade vendida; o resto fica sem par', () => {
    const notas: NotaVendaParaCasar[] = [{ notaVendaId: NOTA_A, itens: [item(1, 'fone-01', 2), item(2, 'CABO-ORIGINAL', 1, '7891234567895')] }];
    const unidades = [unidade('a', 1, 'FONE-01'), unidade('b', 2, 'FONE-01'), unidade('c', 3, 'FONE-01'), unidade('d', 4, 'CABO-02', '7891234567895')];
    expect(casarItens(unidades, notas)).toEqual([
      { itemId: 'a', alvo: { notaVendaId: NOTA_A, numeroItem: 1 }, por: 'SKU' },
      { itemId: 'b', alvo: { notaVendaId: NOTA_A, numeroItem: 1 }, por: 'SKU' },
      { itemId: 'c', alvo: null, por: null },
      { itemId: 'd', alvo: { notaVendaId: NOTA_A, numeroItem: 2 }, por: 'EAN' },
    ]);
  });

  it('a escolha do Fiscal vem antes de tudo e ocupa a vaga', () => {
    const notas: NotaVendaParaCasar[] = [{ notaVendaId: NOTA_A, itens: [item(1, 'FONE-01', 1, null, ['b'])] }];
    expect(casarItens([unidade('a', 1, 'FONE-01'), unidade('b', 2, 'OUTRO')], notas)).toEqual([
      { itemId: 'a', alvo: null, por: null },
      { itemId: 'b', alvo: { notaVendaId: NOTA_A, numeroItem: 1 }, por: 'ESCOLHA' },
    ]);
  });

  it('procura em todas as NF de venda da devolução (vários pedidos)', () => {
    const notas: NotaVendaParaCasar[] = [
      { notaVendaId: NOTA_A, itens: [item(1, 'FONE-01', 1)] },
      { notaVendaId: NOTA_B, itens: [item(1, 'FONE-01', 1)] },
    ];
    expect(casarItens([unidade('a', 1, 'FONE-01'), unidade('b', 2, 'FONE-01')], notas).map((r) => r.alvo?.notaVendaId)).toEqual([NOTA_A, NOTA_B]);
  });

  it('chave do alvo (valor do select da tela) e vagas que sobram', () => {
    expect(chaveAlvo({ notaVendaId: NOTA_A, numeroItem: 2 })).toBe(`${NOTA_A}:2`);
    expect(lerChaveAlvo(`${NOTA_A.toUpperCase()}:2`)).toEqual({ notaVendaId: NOTA_A, numeroItem: 2 });
    expect(lerChaveAlvo('qualquer-coisa:2')).toBeNull();
    const notas: NotaVendaParaCasar[] = [{ notaVendaId: NOTA_A, itens: [item(1, 'FONE-01', 3), item(2, 'X', 1.5)] }];
    const vagas = vagasRestantes(notas, casarItens([unidade('a', 1, 'FONE-01')], notas));
    expect(Object.fromEntries(vagas)).toEqual({ [`${NOTA_A}:1`]: 2, [`${NOTA_A}:2`]: 1 });
  });
});
```

`src/modules/fiscal/montar-devolucao.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DESTINATARIO_TESTE, EMITENTE_TESTE } from '../../../tests/helpers/nota-teste';
import type { ConfiguracaoFiscal } from './configuracao';
import type { ItemNotaVenda } from './dominio';
import {
  montarNotaDevolucaoPura,
  preencherInformacoes,
  type EntradaMontagem,
  type NotaVendaMontagem,
  type UnidadeMontagem,
} from './montar-devolucao';
import { sugestaoDeRegra } from './regras';

const CHAVE_A = '35261011444777000161550010000001011000001012';
const CHAVE_B = '35261011444777000161550010000001021000001028';
const NV_A = '11111111-1111-4111-8111-111111111111';
const NV_B = '22222222-2222-4222-8222-222222222222';
const CONFIG: ConfiguracaoFiscal = { emitente: EMITENTE_TESTE, regime: 'SIMPLES', serie: '1', ambiente: 'HOMOLOGACAO' };
const TRIBUTOS_POR_UNIDADE = {
  icmsBase: 100,
  icmsAliquota: 18,
  icmsValor: 18,
  pisBase: 100,
  pisAliquota: 0.65,
  pisValor: 0.65,
  cofinsBase: 100,
  cofinsAliquota: 3,
  cofinsValor: 3,
};

function itemVenda(dados: Partial<ItemNotaVenda> & { numero: number; codigo: string }): ItemNotaVenda {
  return {
    ean: null,
    descricao: `Produto ${dados.codigo}`,
    ncm: '85183000',
    cfop: '5102',
    unidade: 'UN',
    quantidade: 1,
    valorUnitario: 100,
    desconto: 0,
    origem: 0,
    tributosPorUnidade: {},
    itensDevolucaoIds: [],
    ...dados,
  };
}
function notaVenda(notaVendaId: string, chave: string, itens: ItemNotaVenda[], destinatario = DESTINATARIO_TESTE): NotaVendaMontagem {
  return { notaVendaId, chave, origem: 'ANEXO', emitidaEm: null, destinatario, itens };
}
function unidade(itemId: string, n: number, sku: string, extra: Partial<UnidadeMontagem> = {}): UnidadeMontagem {
  return { itemId, unidade: n, sku, ean: null, serial: null, destino: 'BOM', descricao: null, ...extra };
}
function entrada(dados: Partial<EntradaMontagem> = {}): EntradaMontagem {
  return {
    referencia: 'ref123',
    codigo: 'DEV-000001',
    config: CONFIG,
    regra: sugestaoDeRegra('DEVOLUCAO_VENDA', 'DENTRO_ESTADO', 'SIMPLES'),
    unidades: [
      unidade('a', 1, 'FONE-01', { serial: 'SN1' }),
      unidade('b', 2, 'FONE-01', { destino: 'PROBLEMA' }),
      unidade('c', 3, 'CABO-02', { ean: '7891234567895' }),
    ],
    notasVenda: [
      notaVenda(NV_A, CHAVE_A, [
        itemVenda({ numero: 1, codigo: 'FONE-01', quantidade: 2, valorUnitario: 99.95 }),
        itemVenda({ numero: 2, codigo: 'CABO-ORIG', ean: '7891234567895', valorUnitario: 25.5 }),
      ]),
    ],
    ...dados,
  };
}

describe('montarNotaDevolucaoPura (spec §8.4)', () => {
  it('Simples: finalidade devolução, entrada, chave da venda, CFOP da regra, um item por item da venda, sem valores de tributo', () => {
    expect(montarNotaDevolucaoPura(entrada())).toEqual({
      referencia: 'ref123',
      tipo: 'DEVOLUCAO_VENDA',
      naturezaOperacao: 'Devolucao de venda',
      entrada: true,
      finalidade: 'DEVOLUCAO',
      operacao: 'DENTRO_ESTADO',
      consumidorFinal: true,
      regime: 'SIMPLES',
      emitente: EMITENTE_TESTE,
      destinatario: DESTINATARIO_TESTE,
      chavesReferenciadas: [CHAVE_A],
      itens: [
        {
          codigo: 'FONE-01',
          descricao: 'Produto FONE-01',
          ncm: '85183000',
          cfop: '1202',
          unidade: 'UN',
          quantidade: 2,
          valorUnitario: 99.95,
          ean: null,
          icmsOrigem: 0,
          icmsSituacao: '900',
          pisSituacao: '98',
          cofinsSituacao: '98',
        },
        {
          codigo: 'CABO-ORIG',
          descricao: 'Produto CABO-ORIG',
          ncm: '85183000',
          cfop: '1202',
          unidade: 'UN',
          quantidade: 1,
          valorUnitario: 25.5,
          ean: '7891234567895',
          icmsOrigem: 0,
          icmsSituacao: '900',
          pisSituacao: '98',
          cofinsSituacao: '98',
        },
      ],
      informacoesComplementares: `Devolucao referente a NF-e ${CHAVE_A}. Devolucao DEV-000001.`,
    });
  });

  it('Lucro Presumido: CST 00 e PIS/COFINS 01 levam base, alíquota e valor proporcionais à quantidade devolvida', () => {
    const regra = { ...sugestaoDeRegra('DEVOLUCAO_VENDA', 'DENTRO_ESTADO', 'PRESUMIDO'), pisSituacaoTributaria: '01', cofinsSituacaoTributaria: '01' };
    const nota = montarNotaDevolucaoPura(
      entrada({
        config: { ...CONFIG, regime: 'PRESUMIDO' },
        regra,
        unidades: [unidade('a', 1, 'FONE-01'), unidade('b', 2, 'FONE-01')],
        notasVenda: [notaVenda(NV_A, CHAVE_A, [itemVenda({ numero: 1, codigo: 'FONE-01', quantidade: 3, tributosPorUnidade: TRIBUTOS_POR_UNIDADE })])],
      }),
    );
    expect(nota.regime).toBe('PRESUMIDO');
    expect(nota.itens).toEqual([
      expect.objectContaining({
        quantidade: 2,
        icmsSituacao: '00',
        pisSituacao: '01',
        cofinsSituacao: '01',
        tributos: { icmsBase: 200, icmsAliquota: 18, icmsValor: 36, pisBase: 200, pisAliquota: 0.65, pisValor: 1.3, cofinsBase: 200, cofinsAliquota: 3, cofinsValor: 6 },
      }),
    ]);
  });

  it('Lucro Real com CST 41 e PIS/COFINS 98: sem valores; no Simples os valores da venda nunca vão', () => {
    const venda = [notaVenda(NV_A, CHAVE_A, [itemVenda({ numero: 1, codigo: 'FONE-01', tributosPorUnidade: TRIBUTOS_POR_UNIDADE })])];
    const real = montarNotaDevolucaoPura(
      entrada({
        config: { ...CONFIG, regime: 'REAL' },
        regra: { ...sugestaoDeRegra('DEVOLUCAO_VENDA', 'DENTRO_ESTADO', 'REAL'), icmsSituacaoTributaria: '41' },
        unidades: [unidade('a', 1, 'FONE-01')],
        notasVenda: venda,
      }),
    );
    expect(real.itens[0]).not.toHaveProperty('tributos');
    const simples = montarNotaDevolucaoPura(entrada({ unidades: [unidade('a', 1, 'FONE-01')], notasVenda: venda }));
    expect(simples.itens[0]).not.toHaveProperty('tributos');
  });

  it('várias NF de venda (vários pedidos): referencia as duas; comprador contribuinte não é consumidor final', () => {
    const pj = { ...DESTINATARIO_TESTE, cpf: null, cnpj: '19131243000197', ie: '123456789', indicadorIe: 1 as const };
    const nota = montarNotaDevolucaoPura(
      entrada({
        unidades: [unidade('a', 1, 'FONE-01'), unidade('b', 2, 'CABO-02')],
        notasVenda: [
          notaVenda(NV_A, CHAVE_A, [itemVenda({ numero: 1, codigo: 'FONE-01' })], pj),
          notaVenda(NV_B, CHAVE_B, [itemVenda({ numero: 1, codigo: 'CABO-02' })], pj),
        ],
      }),
    );
    expect(nota.chavesReferenciadas).toEqual([CHAVE_A, CHAVE_B]);
    expect(nota.consumidorFinal).toBe(false);
  });

  it('recusa com a mensagem do que falta', () => {
    expect(() => montarNotaDevolucaoPura(entrada({ notasVenda: [] }))).toThrow(
      'Falta a NF de venda: anexe o XML (baixado do Bitbrain) ou busque no Mercado Livre.',
    );
    expect(() => montarNotaDevolucaoPura(entrada({ unidades: [] }))).toThrow('Nenhum item da devolução está aguardando NF.');
    expect(() => montarNotaDevolucaoPura(entrada({ unidades: [unidade('x', 4, 'SEM-PAR')] }))).toThrow(
      'Unidade 4 (SKU SEM-PAR): escolha o item da NF de venda.',
    );
    const outroComprador = { ...DESTINATARIO_TESTE, cpf: '11144477735' };
    expect(() =>
      montarNotaDevolucaoPura(
        entrada({
          notasVenda: [
            notaVenda(NV_A, CHAVE_A, [itemVenda({ numero: 1, codigo: 'FONE-01', quantidade: 2 })]),
            notaVenda(NV_B, CHAVE_B, [itemVenda({ numero: 1, codigo: 'CABO-02' })], outroComprador),
          ],
        }),
      ),
    ).toThrow('As NF de venda anexadas têm destinatários diferentes: remova a que não é desta devolução.');
    expect(() =>
      montarNotaDevolucaoPura(
        entrada({ unidades: [unidade('a', 1, 'FONE-01')], notasVenda: [notaVenda(NV_A, CHAVE_A, [itemVenda({ numero: 1, codigo: 'FONE-01', ncm: '' })])] }),
      ),
    ).toThrow('O item 1 da NF de venda (FONE-01) não tem NCM válido.');
  });

  it('informações complementares: {chaves}, {devolucao} e {seriais}', () => {
    expect(preencherInformacoes('S/N: {seriais}. Ref. {chaves}. {devolucao}', { chaves: [CHAVE_A], devolucao: 'DEV-000001', seriais: ['SN1', 'SN2'] })).toBe(
      `S/N: SN1, SN2. Ref. ${CHAVE_A}. DEV-000001`,
    );
    expect(preencherInformacoes('S/N: {seriais}', { chaves: [], devolucao: 'DEV-1', seriais: [] })).toBe('S/N: sem S/N');
    expect(preencherInformacoes(null, { chaves: [CHAVE_A], devolucao: 'DEV-1', seriais: [] })).toBe(`Devolucao referente a NF-e ${CHAVE_A}. Devolucao DEV-1.`);
  });
});
```

Rode: `npm test -- src/modules/fiscal/casamento.test.ts src/modules/fiscal/montar-devolucao.test.ts`
Esperado: FAIL (os módulos não existem).

- [ ] **Passo 2: Implementar o casamento**

`src/modules/fiscal/casamento.ts`:

```ts
import type { ItemNotaVenda } from './dominio';

/** D14: unidade da devolução ↔ item da NF de venda. Pelo código do produto (= SKU), depois pelo EAN; se nada casar, o Fiscal escolhe. */
export type UnidadeParaCasar = { itemId: string; unidade: number; sku: string; ean: string | null };
export type NotaVendaParaCasar = {
  notaVendaId: string;
  itens: Pick<ItemNotaVenda, 'numero' | 'codigo' | 'ean' | 'quantidade' | 'itensDevolucaoIds'>[];
};
export type AlvoCasamento = { notaVendaId: string; numeroItem: number };
export type MotivoCasamento = 'ESCOLHA' | 'SKU' | 'EAN';
export type ResultadoCasamento = { itemId: string; alvo: AlvoCasamento | null; por: MotivoCasamento | null };

/** Valor do select da tela: "{notaVendaId}:{numeroItem}". */
export function chaveAlvo(alvo: AlvoCasamento): string {
  return `${alvo.notaVendaId}:${alvo.numeroItem}`;
}

const ALVO = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):(\d{1,4})$/i;

export function lerChaveAlvo(texto: string): AlvoCasamento | null {
  const partes = ALVO.exec(texto.trim());
  return partes ? { notaVendaId: partes[1].toLowerCase(), numeroItem: Number(partes[2]) } : null;
}

/** Unidades inteiras de um item ("1.0000" → 1): cada unidade física da devolução ocupa uma. */
export function capacidade(quantidade: number): number {
  return Math.max(0, Math.floor(quantidade + 1e-9));
}

export function casarItens(unidades: UnidadeParaCasar[], notas: NotaVendaParaCasar[]): ResultadoCasamento[] {
  const alvos = notas.flatMap((n) =>
    n.itens.map((i) => ({
      alvo: { notaVendaId: n.notaVendaId, numeroItem: i.numero },
      codigo: i.codigo.trim().toUpperCase(),
      ean: i.ean,
      escolhidos: i.itensDevolucaoIds,
      vagas: capacidade(i.quantidade),
    })),
  );
  const resultado = new Map<string, ResultadoCasamento>();
  const ordenadas = [...unidades].sort((a, b) => a.unidade - b.unidade);

  function ocupar(u: UnidadeParaCasar, a: (typeof alvos)[number], por: MotivoCasamento): boolean {
    if (a.vagas <= 0) return false;
    a.vagas -= 1;
    resultado.set(u.itemId, { itemId: u.itemId, alvo: a.alvo, por });
    return true;
  }

  // 1. O que o Fiscal escolheu vem antes de tudo.
  for (const u of ordenadas) {
    const a = alvos.find((x) => x.escolhidos.includes(u.itemId));
    if (a) ocupar(u, a, 'ESCOLHA');
  }
  // 2. Código do produto = SKU.
  for (const u of ordenadas) {
    if (resultado.has(u.itemId)) continue;
    const sku = u.sku.trim().toUpperCase();
    for (const a of alvos) if (a.codigo === sku && ocupar(u, a, 'SKU')) break;
  }
  // 3. EAN.
  for (const u of ordenadas) {
    if (resultado.has(u.itemId) || !u.ean) continue;
    for (const a of alvos) if (a.ean === u.ean && ocupar(u, a, 'EAN')) break;
  }
  return unidades.map((u) => resultado.get(u.itemId) ?? { itemId: u.itemId, alvo: null, por: null });
}

/** Vagas que sobram em cada item da NF de venda depois do casamento (chave: `chaveAlvo`). */
export function vagasRestantes(notas: NotaVendaParaCasar[], resultado: ResultadoCasamento[]): Map<string, number> {
  const vagas = new Map<string, number>();
  for (const n of notas) for (const i of n.itens) vagas.set(chaveAlvo({ notaVendaId: n.notaVendaId, numeroItem: i.numero }), capacidade(i.quantidade));
  for (const r of resultado) {
    if (!r.alvo) continue;
    const chave = chaveAlvo(r.alvo);
    vagas.set(chave, (vagas.get(chave) ?? 0) - 1);
  }
  return vagas;
}
```

- [ ] **Passo 3: Implementar a montagem**

`src/modules/fiscal/montar-devolucao.ts`:

```ts
import { and, asc, eq, isNotNull } from 'drizzle-orm';
import type { Destinatario, ItemNota, NotaParaEmissao } from '@/conectores/nfe/tipos';
import type { DbOuTx } from '@/db/client';
import { devolucoes, itensDevolucao, notasVenda, produtos } from '@/db/schema';
import type { RegimeTributario } from '@/modules/configuracoes/dominio';
import { ROTULO_STATUS, type Canal, type StatusDevolucao } from '@/modules/devolucoes/dominio';
import { casarItens, chaveAlvo, type UnidadeParaCasar } from './casamento';
import { lerConfiguracaoFiscal, operacaoPorUf, regraFiscal, type ConfiguracaoFiscal, type RegraFiscal } from './configuracao';
import type { ItemNotaVenda, OrigemNotaVenda } from './dominio';
import { ErroFiscal } from './erros';

export type UnidadeMontagem = UnidadeParaCasar & { serial: string | null; destino: 'BOM' | 'PROBLEMA'; descricao: string | null };
export type NotaVendaMontagem = {
  notaVendaId: string;
  chave: string;
  origem: OrigemNotaVenda;
  emitidaEm: Date | null;
  destinatario: Destinatario;
  itens: ItemNotaVenda[];
};
export type DadosDevolucaoFiscal = {
  codigo: string;
  status: StatusDevolucao;
  canal: Canal | null;
  unidades: UnidadeMontagem[];
  notasVenda: NotaVendaMontagem[];
};
export type EntradaMontagem = {
  referencia: string;
  codigo: string;
  config: ConfiguracaoFiscal;
  regra: RegraFiscal;
  unidades: UnidadeMontagem[];
  notasVenda: NotaVendaMontagem[];
};

/** Decisão 7: só esses CST levam base, alíquota e valor. */
const CST_ICMS_COM_VALOR = new Set(['00', '10', '20', '51', '70', '90']);
const CST_PIS_COFINS_COM_VALOR = new Set(['01', '02']);
const MODELO_PADRAO = 'Devolucao referente a NF-e {chaves}. Devolucao {devolucao}.';

function arredondar(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

/** Decisão 8: o destinatário é o comprador da NF de venda; com várias NF de venda, tem de ser o mesmo. */
export function destinatarioUnico(notas: NotaVendaMontagem[]): Destinatario {
  if (notas.length === 0) throw new ErroFiscal('Falta a NF de venda: anexe o XML (baixado do Bitbrain) ou busque no Mercado Livre.');
  const documento = (d: Destinatario) => d.cpf ?? d.cnpj ?? '';
  const primeiro = notas[0].destinatario;
  if (notas.some((n) => documento(n.destinatario) !== documento(primeiro))) {
    throw new ErroFiscal('As NF de venda anexadas têm destinatários diferentes: remova a que não é desta devolução.');
  }
  return primeiro;
}

/** Modelo da regra (spec §5.1): {chaves}, {devolucao} e {seriais}. */
export function preencherInformacoes(modelo: string | null, valores: { chaves: string[]; devolucao: string; seriais: string[] }): string {
  return (modelo ?? MODELO_PADRAO)
    .replaceAll('{chaves}', valores.chaves.join(', '))
    .replaceAll('{devolucao}', valores.devolucao)
    .replaceAll('{seriais}', valores.seriais.length > 0 ? valores.seriais.join(', ') : 'sem S/N')
    .trim()
    .slice(0, 5000);
}

function tributos(item: ItemNotaVenda, quantidade: number, regime: RegimeTributario, regra: RegraFiscal): Pick<ItemNota, 'tributos'> {
  if (regime === 'SIMPLES') return {};
  const t = item.tributosPorUnidade;
  const r: NonNullable<ItemNota['tributos']> = {};
  if (CST_ICMS_COM_VALOR.has(regra.icmsSituacaoTributaria) && t.icmsBase !== undefined) {
    r.icmsBase = arredondar(t.icmsBase * quantidade);
    r.icmsAliquota = t.icmsAliquota ?? 0;
    r.icmsValor = arredondar((t.icmsValor ?? 0) * quantidade);
  }
  if (CST_PIS_COFINS_COM_VALOR.has(regra.pisSituacaoTributaria) && t.pisBase !== undefined) {
    r.pisBase = arredondar(t.pisBase * quantidade);
    r.pisAliquota = t.pisAliquota ?? 0;
    r.pisValor = arredondar((t.pisValor ?? 0) * quantidade);
  }
  if (CST_PIS_COFINS_COM_VALOR.has(regra.cofinsSituacaoTributaria) && t.cofinsBase !== undefined) {
    r.cofinsBase = arredondar(t.cofinsBase * quantidade);
    r.cofinsAliquota = t.cofinsAliquota ?? 0;
    r.cofinsValor = arredondar((t.cofinsValor ?? 0) * quantidade);
  }
  return Object.keys(r).length > 0 ? { tributos: r } : {};
}

/** Spec §8.4, sem banco: recebe tudo pronto e devolve a nota (ou ErroFiscal com o que falta). */
export function montarNotaDevolucaoPura(e: EntradaMontagem): NotaParaEmissao {
  if (e.unidades.length === 0) throw new ErroFiscal('Nenhum item da devolução está aguardando NF.');
  const destinatario = destinatarioUnico(e.notasVenda);
  const casamento = new Map(casarItens(e.unidades, e.notasVenda).map((c) => [c.itemId, c]));
  const semPar = e.unidades.filter((u) => !casamento.get(u.itemId)?.alvo);
  if (semPar.length > 0) {
    throw new ErroFiscal(`${semPar.map((u) => `Unidade ${u.unidade} (SKU ${u.sku})`).join(', ')}: escolha o item da NF de venda.`);
  }
  // Um item da NF por item da NF de venda, na ordem da venda, com a quantidade de unidades casadas.
  const grupos: { nota: NotaVendaMontagem; item: ItemNotaVenda; quantidade: number }[] = [];
  for (const nota of e.notasVenda) {
    for (const item of nota.itens) {
      const chave = chaveAlvo({ notaVendaId: nota.notaVendaId, numeroItem: item.numero });
      const quantidade = e.unidades.filter((u) => {
        const alvo = casamento.get(u.itemId)?.alvo;
        return alvo !== null && alvo !== undefined && chaveAlvo(alvo) === chave;
      }).length;
      if (quantidade > 0) grupos.push({ nota, item, quantidade });
    }
  }
  const itens: ItemNota[] = grupos.map(({ item, quantidade }) => {
    if (!/^\d{8}$/.test(item.ncm)) throw new ErroFiscal(`O item ${item.numero} da NF de venda (${item.codigo}) não tem NCM válido.`);
    return {
      codigo: item.codigo,
      descricao: item.descricao,
      ncm: item.ncm,
      cfop: e.regra.cfop,
      unidade: item.unidade,
      quantidade,
      valorUnitario: item.valorUnitario,
      ean: item.ean,
      icmsOrigem: item.origem,
      icmsSituacao: e.regra.icmsSituacaoTributaria,
      pisSituacao: e.regra.pisSituacaoTributaria,
      cofinsSituacao: e.regra.cofinsSituacaoTributaria,
      ...tributos(item, quantidade, e.config.regime, e.regra),
    };
  });
  const chaves = [...new Set(grupos.map((g) => g.nota.chave))];
  const seriais = e.unidades.map((u) => u.serial).filter((s): s is string => Boolean(s));
  return {
    referencia: e.referencia,
    tipo: 'DEVOLUCAO_VENDA',
    naturezaOperacao: e.regra.naturezaOperacao,
    entrada: true,
    finalidade: 'DEVOLUCAO',
    operacao: e.regra.operacao,
    consumidorFinal: destinatario.indicadorIe === 9,
    regime: e.config.regime,
    emitente: e.config.emitente,
    destinatario,
    chavesReferenciadas: chaves,
    itens,
    informacoesComplementares: preencherInformacoes(e.regra.informacoesComplementares, { chaves, devolucao: e.codigo, seriais }),
  };
}

/** As unidades que entram na NF (AGUARDANDO_NF com destino; AUSENTE fica fora, contrato §5.6) e as NF de venda. */
export async function carregarDadosDevolucao(db: DbOuTx, devolucaoId: string): Promise<DadosDevolucaoFiscal | null> {
  const [d] = await db
    .select({ codigo: devolucoes.codigo, status: devolucoes.status, canal: devolucoes.canal })
    .from(devolucoes)
    .where(eq(devolucoes.id, devolucaoId));
  if (!d) return null;
  const linhas = await db
    .select({
      itemId: itensDevolucao.id,
      unidade: itensDevolucao.unidade,
      sku: itensDevolucao.sku,
      eanProduto: produtos.ean,
      eanLido: itensDevolucao.eanLido,
      serial: itensDevolucao.serial,
      destino: itensDevolucao.destino,
      descricao: produtos.descricao,
    })
    .from(itensDevolucao)
    .leftJoin(produtos, eq(produtos.id, itensDevolucao.produtoEsperadoId))
    .where(and(eq(itensDevolucao.devolucaoId, devolucaoId), eq(itensDevolucao.status, 'AGUARDANDO_NF'), isNotNull(itensDevolucao.destino)))
    .orderBy(asc(itensDevolucao.unidade));
  const notas = await db
    .select({
      notaVendaId: notasVenda.id,
      chave: notasVenda.chave,
      origem: notasVenda.origem,
      emitidaEm: notasVenda.emitidaEm,
      destinatario: notasVenda.destinatario,
      itens: notasVenda.itens,
    })
    .from(notasVenda)
    .where(eq(notasVenda.devolucaoId, devolucaoId))
    .orderBy(asc(notasVenda.criadaEm));
  return {
    codigo: d.codigo,
    status: d.status,
    canal: d.canal,
    unidades: linhas.map((l) => ({
      itemId: l.itemId,
      unidade: l.unidade,
      sku: l.sku,
      // O EAN do produto vendido (esperado); sem cadastro, o que o leitor leu na bancada.
      ean: l.eanProduto ?? l.eanLido ?? null,
      serial: l.serial,
      destino: l.destino as 'BOM' | 'PROBLEMA',
      descricao: l.descricao,
    })),
    notasVenda: notas,
  };
}

/** Contrato §5.7 ("montarNotaDevolucao", spec §8.4): usada na solicitação (para validar), no envio e no reenvio. */
export async function montarNotaDevolucao(db: DbOuTx, devolucaoId: string, referencia: string): Promise<NotaParaEmissao> {
  const config = await lerConfiguracaoFiscal(db);
  const dados = await carregarDadosDevolucao(db, devolucaoId);
  if (!dados) throw new ErroFiscal('Devolução não encontrada.');
  if (dados.status !== 'AGUARDANDO_NF') {
    throw new ErroFiscal(`A devolução está ${ROTULO_STATUS[dados.status]}: a NF de devolução só sai em Aguardando NF.`);
  }
  const destinatario = destinatarioUnico(dados.notasVenda);
  const regra = await regraFiscal(db, 'DEVOLUCAO_VENDA', operacaoPorUf(config.emitente.uf, destinatario.uf));
  return montarNotaDevolucaoPura({ referencia, codigo: dados.codigo, config, regra, unidades: dados.unidades, notasVenda: dados.notasVenda });
}
```

Rode: `npm test -- src/modules/fiscal`
Esperado: PASS.

- [ ] **Passo 4: Escolha do Fiscal (D14)**

`src/modules/fiscal/escolha.ts`:

```ts
import { eq } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { devolucoes, notasVenda } from '@/db/schema';
import { pode } from '@/modules/auth/permissoes';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { registrarEvento } from '@/modules/historico/eventos';
import { capacidade, casarItens, chaveAlvo, type AlvoCasamento } from './casamento';
import { ErroFiscal } from './erros';
import { carregarDadosDevolucao } from './montar-devolucao';
import { temNotaEmAndamento } from './nota-venda';

/**
 * D14: o Fiscal liga uma unidade a um item da NF de venda (ou desfaz, com `alvo` null). A escolha fica no jsonb
 * `notas_venda.itens[].itensDevolucaoIds` (decisão 6) e respeita a quantidade vendida.
 */
export async function escolherItemNotaVenda(db: Db, devolucaoId: string, itemId: string, alvo: AlvoCasamento | null, usuario: UsuarioSessao): Promise<void> {
  if (!pode(usuario.perfil, 'gerir_fiscal')) throw new ErroFiscal('Só o Fiscal ou o Gestor escolhem o item da NF de venda.');
  await db.transaction(async (tx) => {
    const [d] = await tx.select({ status: devolucoes.status }).from(devolucoes).where(eq(devolucoes.id, devolucaoId)).for('update');
    if (!d) throw new ErroFiscal('Devolução não encontrada.');
    if (d.status !== 'AGUARDANDO_NF') throw new ErroFiscal('O item da NF de venda só é escolhido com a devolução em Aguardando NF.');
    if (await temNotaEmAndamento(tx, devolucaoId)) throw new ErroFiscal('Esta devolução já tem NF de devolução em processamento ou autorizada.');
    const dados = await carregarDadosDevolucao(tx, devolucaoId);
    const unidade = dados?.unidades.find((u) => u.itemId === itemId);
    if (!dados || !unidade) throw new ErroFiscal('Unidade não encontrada ou fora de Aguardando NF.');

    // Tira a unidade de qualquer escolha anterior.
    const notas = dados.notasVenda.map((n) => ({
      ...n,
      itens: n.itens.map((i) => ({ ...i, itensDevolucaoIds: i.itensDevolucaoIds.filter((id) => id !== itemId) })),
    }));
    if (alvo) {
      const item = notas.find((n) => n.notaVendaId === alvo.notaVendaId)?.itens.find((i) => i.numero === alvo.numeroItem);
      if (!item) throw new ErroFiscal('Item da NF de venda não encontrado.');
      const outras = casarItens(
        dados.unidades.filter((u) => u.itemId !== itemId),
        notas,
      );
      const ocupadas = outras.filter((c) => c.alvo && chaveAlvo(c.alvo) === chaveAlvo(alvo)).length;
      if (ocupadas >= capacidade(item.quantidade)) {
        throw new ErroFiscal(`O item ${item.numero} da NF de venda (${item.codigo}) já tem todas as unidades ligadas (${capacidade(item.quantidade)}).`);
      }
      item.itensDevolucaoIds = [...item.itensDevolucaoIds, itemId];
    }
    for (const n of notas) await tx.update(notasVenda).set({ itens: n.itens }).where(eq(notasVenda.id, n.notaVendaId));
    await registrarEvento(tx, {
      entidade: 'devolucao',
      entidadeId: devolucaoId,
      acao: 'nf_item_escolhido',
      usuarioId: usuario.id,
      dados: { itemId, unidade: unidade.unidade, notaVendaId: alvo?.notaVendaId ?? null, numeroItem: alvo?.numeroItem ?? null },
    });
  });
}
```

- [ ] **Passo 5: Escrever o teste de integração**

`src/modules/fiscal/montar-devolucao.int.test.ts`:

```ts
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { notasVenda } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { listarEventos } from '@/modules/historico/eventos';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { configurarFiscalTeste, criarDevolucaoNoEstoqueTeste, inserirNotaVendaTeste } from '../../../tests/helpers/fabricas-fiscal';
import { escolherItemNotaVenda } from './escolha';
import { montarNotaDevolucao } from './montar-devolucao';

const { db, sql } = criarDbTeste();
let gestor: UsuarioSessao;
let fiscal: UsuarioSessao;
let operador: UsuarioSessao;

beforeEach(async () => {
  await limparTabelas(sql);
  gestor = await criarUsuarioTeste(db, 'GESTOR');
  fiscal = await criarUsuarioTeste(db, 'FISCAL');
  operador = await criarUsuarioTeste(db, 'OPERADOR');
  await configurarFiscalTeste(db, gestor);
});
afterAll(async () => {
  await sql.end();
});

describe('montarNotaDevolucao (banco)', () => {
  it('operação pela UF do comprador (RJ → fora do estado, CFOP 2202); AUSENTE fica fora; S/N nas informações', async () => {
    const dev = await criarDevolucaoNoEstoqueTeste(db, gestor, {
      unidades: [
        { sku: 'FONE-01', destino: 'BOM', serial: 'SN-1' },
        { sku: 'FONE-01', destino: 'PROBLEMA' },
        { sku: 'CABO-02', destino: 'AUSENTE' },
      ],
    });
    const { chave } = await inserirNotaVendaTeste(db, dev.id, {
      destinatario: { uf: 'RJ', cidade: 'Rio de Janeiro' },
      itens: [{ codigo: 'FONE-01', quantidade: 2, valorUnitario: 80 }],
    });
    const nota = await montarNotaDevolucao(db, dev.id, 'ref1');
    expect(nota).toMatchObject({
      referencia: 'ref1',
      operacao: 'FORA_ESTADO',
      chavesReferenciadas: [chave],
      destinatario: { uf: 'RJ' },
      itens: [{ codigo: 'FONE-01', quantidade: 2, cfop: '2202', valorUnitario: 80 }],
    });
    expect(nota.informacoesComplementares).toBe(`Devolucao referente a NF-e ${chave}. Devolucao ${dev.codigo}.`);
  });

  it('escolha do Fiscal (D14): liga a unidade sem par, respeita a quantidade, desfaz e fica no histórico', async () => {
    const dev = await criarDevolucaoNoEstoqueTeste(db, gestor, { unidades: [{ sku: 'SKU-X', destino: 'BOM' }, { sku: 'SKU-Y', destino: 'BOM' }] });
    const { notaVendaId } = await inserirNotaVendaTeste(db, dev.id, { itens: [{ codigo: 'OUTRO', quantidade: 1 }] });
    await expect(montarNotaDevolucao(db, dev.id, 'r')).rejects.toThrow('Unidade 1 (SKU SKU-X), Unidade 2 (SKU SKU-Y): escolha o item da NF de venda.');

    const [x, y] = dev.itens;
    await escolherItemNotaVenda(db, dev.id, x.id, { notaVendaId, numeroItem: 1 }, fiscal);
    await expect(escolherItemNotaVenda(db, dev.id, y.id, { notaVendaId, numeroItem: 1 }, fiscal)).rejects.toThrow(
      'O item 1 da NF de venda (OUTRO) já tem todas as unidades ligadas (1).',
    );
    await expect(montarNotaDevolucao(db, dev.id, 'r')).rejects.toThrow('Unidade 2 (SKU SKU-Y): escolha o item da NF de venda.');

    await escolherItemNotaVenda(db, dev.id, x.id, null, fiscal);
    await escolherItemNotaVenda(db, dev.id, y.id, { notaVendaId, numeroItem: 1 }, fiscal);
    const [venda] = await db.select().from(notasVenda).where(eq(notasVenda.id, notaVendaId));
    expect(venda.itens[0].itensDevolucaoIds).toEqual([y.id]);
    expect((await listarEventos(db, 'devolucao', dev.id)).filter((e) => e.acao === 'nf_item_escolhido')).toHaveLength(3);
  });

  it('a escolha é só do Fiscal e do Gestor, de item que existe, de unidade que aguarda NF', async () => {
    const dev = await criarDevolucaoNoEstoqueTeste(db, gestor, { unidades: [{ sku: 'SKU-X', destino: 'BOM' }, { sku: 'SKU-Z', destino: 'AUSENTE' }] });
    const { notaVendaId } = await inserirNotaVendaTeste(db, dev.id, { itens: [{ codigo: 'OUTRO' }] });
    const [x, ausente] = dev.itens;
    await expect(escolherItemNotaVenda(db, dev.id, x.id, { notaVendaId, numeroItem: 1 }, operador)).rejects.toThrow(
      'Só o Fiscal ou o Gestor escolhem o item da NF de venda.',
    );
    await expect(escolherItemNotaVenda(db, dev.id, x.id, { notaVendaId, numeroItem: 9 }, fiscal)).rejects.toThrow('Item da NF de venda não encontrado.');
    await expect(escolherItemNotaVenda(db, dev.id, ausente.id, { notaVendaId, numeroItem: 1 }, fiscal)).rejects.toThrow(
      'Unidade não encontrada ou fora de Aguardando NF.',
    );
  });
});
```

Rode: `npm run test:int -- src/modules/fiscal/montar-devolucao.int.test.ts`
Esperado: PASS.

- [ ] **Passo 6: Rodar tudo**

Rode: `npm test && npm run test:int && npm run typecheck && npm run lint`
Esperado: tudo PASS.

- [ ] **Passo 7: Commit**

```bash
cd "/c/Users/idmpc/devolucoes-wt/fase-4"
git add -A
git commit -m "feat: casamento das unidades com a NF de venda (SKU, EAN, escolha do Fiscal) e montagem da NF de devolução" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 7: Emissão e ciclo de vida da NF (fila, consulta com espera crescente, autorização, rejeição e reenvio)

**Arquivos:**
- Criar: `src/modules/fiscal/consultas.ts`, `src/modules/fiscal/notas.ts`, `src/modules/fiscal/ciclo.ts`, `src/modules/fiscal/emissao.ts`, `tests/helpers/fila-fiscal.ts`
- Modificar (substituir o `{}` da Parte A): `src/worker/manipuladores/fiscal.ts`
- Testes: `src/modules/fiscal/consultas.test.ts`, `src/modules/fiscal/emissao.int.test.ts`

**Interfaces:**
- Consome: `obterFila`, `definirFilaParaTestes`, `FilaMemoria`, `type Fila`, `type DadosTarefa` (contrato §5.1); `type Manipuladores` (`src/worker/tipos.ts`); `exigirTransicao` (Fase 1), `exigirTransicaoItem` (Parte A); `lerConfiguracao`; `obterEmissorNFe`, `definirEmissorParaTestes`, `EmissorFalso`, `ErroEmissorRecusou`, `ErroEmissorIndisponivel` (Tarefa 4); `montarNotaDevolucao` (Tarefa 6); `buscarNotaVendaNoCanal` (Tarefa 5); `caminhoBaseNfe`, `salvarArquivo` (Tarefa 5); `portaLotes` (Tarefa 1).
- Produz:
  - `consultas.ts` (puro): `ESPERAS_CONSULTA_SEGUNDOS = [10, 30, 60, 120, 300]`, `ESPERA_FINAL_SEGUNDOS = 600`, `LIMITE_CONSULTAS = 150`, `esperaAntesDaConsulta(numero): number`
  - `notas.ts`: `type NotaFiscalLinha`, `obterNota(db, id, { travar? }): Promise<NotaFiscalLinha | null>`, `montarNotaParaEmissao(db, nota, referencia): Promise<NotaParaEmissao>` (escolhe pelo tipo, contrato §5.7), `exigirPodeEmitir(usuario)`
  - `ciclo.ts`: `processarEmissao(db: Db, fila: Fila, notaFiscalId, agora)`, `processarConsulta(db, fila, notaFiscalId, consulta, agora)`, `caminhoDoCancelamento(xmlCaminho): string`
  - `emissao.ts` (contrato §5.7): `type AlvoEmissao`, `solicitarEmissao(db: Db, alvo, usuario): Promise<{ notaFiscalId }>`, `reenviarNota(db: Db, notaFiscalId, usuario): Promise<void>` (a Tarefa 8 acrescenta `cancelarNota`)
  - `manipuladoresFiscal: Manipuladores` com `'nfe.emitir'` e `'nfe.consultar'`
  - `tests/helpers/fila-fiscal.ts`: `rodarTarefasFiscais(db, fila, agora?, limite?): Promise<string[]>` (roda as tarefas `nfe.*` da `FilaMemoria` em ordem, como o worker, sem esperar o `iniciarEm`)

**Como funciona (D12, contrato §5.1 e §5.7):**
1. `solicitarEmissao`: Fiscal ou Gestor; dados da empresa e token do ambiente presentes; na devolução do ML sem NF de venda, pede ao conector; numa transação: devolução em AGUARDANDO_NF, sem NF ativa, **monta a nota inteira** (valida), grava a nota em PROCESSANDO com `ref` = id sem hífens, grava os eventos e envia `nfe.emitir` com `{ tx }`.
2. `nfe.emitir`: monta de novo e envia; erro de montagem (`ErroFiscal`) ou recusa do emissor (`ErroEmissorRecusou`) viram REJEITADA (não lançam); depois faz a 1ª consulta na hora.
3. `nfe.consultar`: PROCESSANDO → reagenda a consulta seguinte (10 s, 30 s, 1 min, 2 min, 5 min, depois 10 min; `chaveUnica` = `{id}:{n}`); AUTORIZADA → baixa XML e DANFE, salva, e numa transação aplica os efeitos; REJEITADA → grava o motivo. Erro passageiro lança (a fila tenta de novo).
4. Efeitos da autorização (DEVOLUCAO_VENDA): itens BOM AGUARDANDO_NF → DISPONIVEL_VENDA (evento `item_status`), `portaLotes.alocarItensProblema` (não faz nada até a Fase 5, D11), devolução AGUARDANDO_NF → CONCLUIDA com `concluida_em`. REMESSA_*: `portaLotes.aoAutorizarRemessa`.
5. `reenviarNota`: só REJEITADA; monta de novo (o Fiscal vê se a causa continua), volta para PROCESSANDO com o mesmo `ref` e o ambiente atual, e envia `nfe.emitir`.

- [ ] **Passo 1: Escrever os testes que falham**

`src/modules/fiscal/consultas.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { esperaAntesDaConsulta, LIMITE_CONSULTAS } from './consultas';

describe('espera antes de cada consulta (D12)', () => {
  it('1ª na hora; depois 10 s, 30 s, 1 min, 2 min, 5 min e a cada 10 min', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 50].map(esperaAntesDaConsulta)).toEqual([0, 10, 30, 60, 120, 300, 600, 600]);
  });

  it('o limite dá cerca de 24 h de consultas', () => {
    let total = 0;
    for (let n = 1; n <= LIMITE_CONSULTAS; n++) total += esperaAntesDaConsulta(n);
    expect(total / 3600).toBeGreaterThan(23);
    expect(total / 3600).toBeLessThan(25);
  });
});
```

`tests/helpers/fila-fiscal.ts`:

```ts
import type { Db } from '@/db/client';
import type { FilaMemoria } from '@/modules/fila/fila';
import type { DadosTarefa } from '@/modules/fila/tarefas';
import { manipuladoresFiscal } from '@/worker/manipuladores/fiscal';

const jaRodadas = new WeakMap<FilaMemoria, number>();

/**
 * Faz o papel do worker nos testes de integração: roda, em ordem, as tarefas `nfe.*` enviadas à FilaMemoria (as que os
 * manipuladores enviam entram no fim e também rodam), sem esperar o `iniciarEm`. Devolve os nomes das que rodaram.
 */
export async function rodarTarefasFiscais(db: Db, fila: FilaMemoria, agora: Date = new Date(), limite = 20): Promise<string[]> {
  const rodadas: string[] = [];
  while (rodadas.length < limite) {
    const indice = jaRodadas.get(fila) ?? 0;
    const tarefa = fila.enviadas[indice];
    if (!tarefa) break;
    jaRodadas.set(fila, indice + 1);
    const ctx = { db, fila, agora, tentativa: 1 };
    if (tarefa.nome === 'nfe.emitir') {
      await manipuladoresFiscal['nfe.emitir']?.(tarefa.dados as DadosTarefa['nfe.emitir'], ctx);
    } else if (tarefa.nome === 'nfe.consultar') {
      await manipuladoresFiscal['nfe.consultar']?.(tarefa.dados as DadosTarefa['nfe.consultar'], ctx);
    } else {
      continue;
    }
    rodadas.push(tarefa.nome);
  }
  return rodadas;
}
```

`src/modules/fiscal/emissao.int.test.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { definirConectorParaTestes } from '@/conectores/marketplace/registro';
import { ErroEmissorIndisponivel } from '@/conectores/nfe/erros';
import { EmissorFalso } from '@/conectores/nfe/falso';
import { definirEmissorParaTestes } from '@/conectores/nfe/registro';
import type { NotaParaEmissao, SituacaoNota } from '@/conectores/nfe/tipos';
import { devolucoes, itensDevolucao, notasFiscais, regrasFiscais } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { definirFilaParaTestes, FilaMemoria } from '@/modules/fila/fila';
import { listarEventos } from '@/modules/historico/eventos';
import { obterArmazenamento } from '@/modules/midia/armazenamento';
import { manipuladoresFiscal } from '@/worker/manipuladores/fiscal';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { configurarFiscalTeste, criarDevolucaoNoEstoqueTeste, inserirNotaVendaTeste, type UnidadeEstoqueTeste } from '../../../tests/helpers/fabricas-fiscal';
import { rodarTarefasFiscais } from '../../../tests/helpers/fila-fiscal';
import { xmlNotaVendaTeste } from '../../../tests/helpers/xml-nfe';
import { chaveValida } from './chave';
import { processarConsulta } from './ciclo';
import { LIMITE_CONSULTAS } from './consultas';
import { referenciaDaNota } from './dominio';
import { reenviarNota, solicitarEmissao } from './emissao';
import { salvarRegra, sugestaoDeRegra } from './regras';

const { db, sql } = criarDbTeste();
const AGORA = new Date('2026-11-12T13:00:00Z');
let gestor: UsuarioSessao;
let fiscal: UsuarioSessao;
let operador: UsuarioSessao;
let fila: FilaMemoria;
let emissor: EmissorEspiao;

/** O falso, guardando cada nota enviada (para conferir a montagem). */
class EmissorEspiao extends EmissorFalso {
  readonly enviadas: NotaParaEmissao[] = [];
  override async emitir(nota: NotaParaEmissao) {
    this.enviadas.push(nota);
    return super.emitir(nota);
  }
}

beforeEach(async () => {
  await limparTabelas(sql);
  gestor = await criarUsuarioTeste(db, 'GESTOR');
  fiscal = await criarUsuarioTeste(db, 'FISCAL');
  operador = await criarUsuarioTeste(db, 'OPERADOR');
  await configurarFiscalTeste(db, gestor);
  fila = new FilaMemoria();
  definirFilaParaTestes(fila);
  emissor = new EmissorEspiao();
  definirEmissorParaTestes(emissor);
});
afterEach(() => {
  definirFilaParaTestes(null);
  definirEmissorParaTestes(null);
  definirConectorParaTestes('MERCADO_LIVRE', null);
});
afterAll(async () => {
  await sql.end();
});

const UNIDADES_PADRAO: UnidadeEstoqueTeste[] = [
  { sku: 'FONE-01', destino: 'BOM', serial: 'SN-1' },
  { sku: 'FONE-01', destino: 'PROBLEMA' },
  { sku: 'CABO-02', destino: 'AUSENTE' },
];

async function devolucaoPronta(unidades: UnidadeEstoqueTeste[] = UNIDADES_PADRAO) {
  const dev = await criarDevolucaoNoEstoqueTeste(db, gestor, { unidades });
  const venda = await inserirNotaVendaTeste(db, dev.id, { itens: [{ codigo: 'FONE-01', quantidade: 2, valorUnitario: 100 }] });
  return { dev, venda };
}
async function notaDe(id: string) {
  const [nota] = await db.select().from(notasFiscais).where(eq(notasFiscais.id, id));
  return nota;
}
function pedir(devolucaoId: string, usuario: UsuarioSessao = fiscal) {
  return solicitarEmissao(db, { tipo: 'DEVOLUCAO_VENDA', devolucaoId }, usuario);
}

describe('emissão da NF de devolução (spec §6.4, §8.6; contrato §5.7)', () => {
  it('solicita, envia e autoriza na 2ª consulta: BOM disponível, PROBLEMA aguardando (D11), devolução concluída', async () => {
    const { dev, venda } = await devolucaoPronta();
    const { notaFiscalId } = await pedir(dev.id);
    expect(await notaDe(notaFiscalId)).toMatchObject({
      situacao: 'PROCESSANDO',
      tipo: 'DEVOLUCAO_VENDA',
      devolucaoId: dev.id,
      ambiente: 'HOMOLOGACAO',
      referenciaEmissor: referenciaDaNota(notaFiscalId),
      chavesReferenciadas: [venda.chave],
      emitidaPor: fiscal.id,
    });
    expect(fila.enviadas).toEqual([expect.objectContaining({ nome: 'nfe.emitir', dados: { notaFiscalId } })]);

    expect(await rodarTarefasFiscais(db, fila, AGORA)).toEqual(['nfe.emitir', 'nfe.consultar']);
    expect(fila.enviadas[1]).toMatchObject({
      nome: 'nfe.consultar',
      dados: { notaFiscalId, consulta: 2 },
      opcoes: { chaveUnica: `${notaFiscalId}:2`, iniciarEm: new Date(AGORA.getTime() + 10_000) },
    });

    const nota = await notaDe(notaFiscalId);
    expect(nota).toMatchObject({
      situacao: 'AUTORIZADA',
      serie: '1',
      xmlCaminho: `nfe/2026/11/${notaFiscalId}.xml`,
      danfeCaminho: `nfe/2026/11/${notaFiscalId}-danfe.pdf`,
      autorizadaEm: AGORA,
      motivoRejeicao: null,
    });
    expect(chaveValida(nota.chave ?? '')).toBe(true);
    expect(await obterArmazenamento().existe(`nfe/2026/11/${notaFiscalId}.xml`)).toBe(true);
    expect(await obterArmazenamento().existe(`nfe/2026/11/${notaFiscalId}-danfe.pdf`)).toBe(true);

    const [d] = await db.select().from(devolucoes).where(eq(devolucoes.id, dev.id));
    expect(d).toMatchObject({ status: 'CONCLUIDA', concluidaEm: AGORA });
    const itens = await db
      .select({ status: itensDevolucao.status })
      .from(itensDevolucao)
      .where(eq(itensDevolucao.devolucaoId, dev.id))
      .orderBy(asc(itensDevolucao.unidade));
    expect(itens.map((i) => i.status)).toEqual(['DISPONIVEL_VENDA', 'AGUARDANDO_NF', 'AUSENTE']);

    const eventos = await listarEventos(db, 'devolucao', dev.id);
    expect(eventos.map((e) => e.acao)).toEqual(expect.arrayContaining(['nf_solicitada', 'nf_autorizada']));
    expect(eventos.at(-1)).toMatchObject({ acao: 'nf_autorizada', de: 'AGUARDANDO_NF', para: 'CONCLUIDA', usuarioNome: null });
    expect((await listarEventos(db, 'nota_fiscal', notaFiscalId)).map((e) => [e.acao, e.de, e.para])).toEqual([
      ['nf_solicitada', null, 'PROCESSANDO'],
      ['nf_autorizada', 'PROCESSANDO', 'AUTORIZADA'],
    ]);
    expect(await listarEventos(db, 'item', dev.itens[0].id)).toEqual([
      expect.objectContaining({ acao: 'item_status', de: 'AGUARDANDO_NF', para: 'DISPONIVEL_VENDA' }),
    ]);
  });

  it('a nota enviada ao emissor é a de devolução, com a chave da venda e as unidades agrupadas', async () => {
    const { dev, venda } = await devolucaoPronta();
    await pedir(dev.id);
    await rodarTarefasFiscais(db, fila, AGORA);
    expect(emissor.enviadas).toHaveLength(1);
    expect(emissor.enviadas[0]).toMatchObject({
      referencia: expect.stringMatching(/^[0-9a-f]{32}$/),
      tipo: 'DEVOLUCAO_VENDA',
      finalidade: 'DEVOLUCAO',
      entrada: true,
      operacao: 'DENTRO_ESTADO',
      regime: 'SIMPLES',
      chavesReferenciadas: [venda.chave],
      itens: [{ codigo: 'FONE-01', quantidade: 2, cfop: '1202', valorUnitario: 100 }],
    });
  });

  it('recusa na hora, sem criar nota: Operador, sem regra (D13), sem NF de venda, fora de Aguardando NF, NF já ativa', async () => {
    const { dev } = await devolucaoPronta();
    await expect(pedir(dev.id, operador)).rejects.toThrow('Só o Fiscal ou o Gestor emitem, reenviam e cancelam NF.');
    await db.delete(regrasFiscais);
    await expect(pedir(dev.id)).rejects.toThrow('Falta a regra fiscal: Devolução de venda, dentro do estado');
    await configurarFiscalTeste(db, gestor);
    const semVenda = await criarDevolucaoNoEstoqueTeste(db, gestor, { unidades: [{ sku: 'A', destino: 'BOM' }] });
    await expect(pedir(semVenda.id)).rejects.toThrow('Falta a NF de venda: anexe o XML (baixado do Bitbrain) ou busque no Mercado Livre.');
    await db.update(devolucoes).set({ status: 'EM_CONFERENCIA' }).where(eq(devolucoes.id, semVenda.id));
    await expect(pedir(semVenda.id)).rejects.toThrow('A devolução está Em conferência: a NF de devolução só sai em Aguardando NF.');
    expect(await db.select().from(notasFiscais)).toEqual([]);
    expect(fila.enviadas).toEqual([]);

    await pedir(dev.id);
    await expect(pedir(dev.id)).rejects.toThrow('Esta devolução já tem NF de devolução em processamento.');
  });

  it('rejeição → corrigir a regra → "Corrigir e reenviar" com o mesmo ref → autorizada', async () => {
    await configurarFiscalTeste(db, gestor, { naturezas: { DENTRO_ESTADO: 'Devolucao de venda REJEITAR' } });
    const { dev } = await devolucaoPronta();
    const { notaFiscalId } = await pedir(dev.id);
    expect(await rodarTarefasFiscais(db, fila, AGORA)).toEqual(['nfe.emitir']);
    const motivo = '999 - Rejeição simulada: a natureza da operação contém REJEITAR';
    expect(await notaDe(notaFiscalId)).toMatchObject({ situacao: 'REJEITADA', motivoRejeicao: motivo });
    const [d] = await db.select({ status: devolucoes.status }).from(devolucoes).where(eq(devolucoes.id, dev.id));
    expect(d.status).toBe('AGUARDANDO_NF');
    expect((await listarEventos(db, 'devolucao', dev.id)).at(-1)).toMatchObject({ acao: 'nf_rejeitada', dados: { notaFiscalId, motivo } });
    await expect(pedir(dev.id)).rejects.toThrow('Esta devolução tem NF rejeitada: use "Corrigir e reenviar" no detalhe da devolução.');

    await salvarRegra(db, sugestaoDeRegra('DEVOLUCAO_VENDA', 'DENTRO_ESTADO', 'SIMPLES'), gestor);
    await reenviarNota(db, notaFiscalId, fiscal);
    expect(await notaDe(notaFiscalId)).toMatchObject({ situacao: 'PROCESSANDO', motivoRejeicao: null, referenciaEmissor: referenciaDaNota(notaFiscalId) });
    expect(await rodarTarefasFiscais(db, fila, AGORA)).toEqual(['nfe.emitir', 'nfe.consultar']);
    expect((await notaDe(notaFiscalId)).situacao).toBe('AUTORIZADA');
    expect((await listarEventos(db, 'nota_fiscal', notaFiscalId)).map((e) => e.acao)).toEqual(['nf_solicitada', 'nf_rejeitada', 'nf_reenviada', 'nf_autorizada']);
    await expect(reenviarNota(db, notaFiscalId, fiscal)).rejects.toThrow('Só uma NF rejeitada pode ser corrigida e reenviada.');
  });

  it('se a montagem falhar no worker (regra apagada depois do pedido), a nota vira rejeitada com a mensagem', async () => {
    const { dev } = await devolucaoPronta();
    const { notaFiscalId } = await pedir(dev.id);
    await db.delete(regrasFiscais);
    await rodarTarefasFiscais(db, fila, AGORA);
    expect(await notaDe(notaFiscalId)).toMatchObject({ situacao: 'REJEITADA', motivoRejeicao: 'Falta a regra fiscal: Devolução de venda, dentro do estado' });
    expect(emissor.enviadas).toEqual([]);
  });

  it('manipuladores idempotentes: rodar de novo depois da autorização não muda nada; nota que não existe termina sem erro', async () => {
    const { dev } = await devolucaoPronta();
    const { notaFiscalId } = await pedir(dev.id);
    await rodarTarefasFiscais(db, fila, AGORA);
    const antes = await notaDe(notaFiscalId);
    const ctx = { db, fila, agora: AGORA, tentativa: 2 };
    await manipuladoresFiscal['nfe.emitir']?.({ notaFiscalId }, ctx);
    await manipuladoresFiscal['nfe.consultar']?.({ notaFiscalId, consulta: 2 }, ctx);
    expect(await notaDe(notaFiscalId)).toEqual(antes);
    await expect(manipuladoresFiscal['nfe.consultar']?.({ notaFiscalId: randomUUID(), consulta: 1 }, ctx)).resolves.toBeUndefined();
  });

  it('falha passageira do emissor lança (a fila tenta de novo) e a nota continua em processamento', async () => {
    class EmissorForaDoAr extends EmissorFalso {
      override async consultar(): Promise<SituacaoNota> {
        throw new ErroEmissorIndisponivel('A Focus NFe respondeu 503 (GET /v2/nfe/x).');
      }
    }
    definirEmissorParaTestes(new EmissorForaDoAr());
    const { dev } = await devolucaoPronta();
    const { notaFiscalId } = await pedir(dev.id);
    await expect(rodarTarefasFiscais(db, fila, AGORA)).rejects.toBeInstanceOf(ErroEmissorIndisponivel);
    expect((await notaDe(notaFiscalId)).situacao).toBe('PROCESSANDO');
  });

  it('enquanto processa, reagenda com espera crescente (D12) e, no limite, falha para ir a Falhas', async () => {
    class EmissorLento extends EmissorFalso {
      override async consultar(): Promise<SituacaoNota> {
        return { situacao: 'PROCESSANDO' };
      }
    }
    definirEmissorParaTestes(new EmissorLento());
    const { dev } = await devolucaoPronta();
    const { notaFiscalId } = await pedir(dev.id);
    await rodarTarefasFiscais(db, fila, AGORA, 7);
    const esperas = fila.enviadas
      .filter((t) => t.nome === 'nfe.consultar')
      .map((t) => (t.opcoes?.iniciarEm?.getTime() ?? 0) - AGORA.getTime());
    expect(esperas.slice(0, 6)).toEqual([10_000, 30_000, 60_000, 120_000, 300_000, 600_000]);
    await expect(processarConsulta(db, fila, notaFiscalId, LIMITE_CONSULTAS, AGORA)).rejects.toThrow(
      `continua em processamento depois de ${LIMITE_CONSULTAS} consultas`,
    );
  });

  it('série diferente da configurada fica registrada no histórico da nota (decisão 13)', async () => {
    await configurarFiscalTeste(db, gestor, { serie: '2' });
    const { dev } = await devolucaoPronta();
    const { notaFiscalId } = await pedir(dev.id);
    await rodarTarefasFiscais(db, fila, AGORA);
    expect((await listarEventos(db, 'nota_fiscal', notaFiscalId)).at(-1)?.dados).toMatchObject({ serie: '1', serieConfigurada: '2' });
  });

  it('devolução do ML sem NF de venda: o conector entrega a nota na hora de emitir (contrato §5.8)', async () => {
    const dev = await criarDevolucaoNoEstoqueTeste(db, gestor, { canal: 'MERCADO_LIVRE', pedido: 'ML-1', unidades: [{ sku: 'FONE-01', destino: 'BOM' }] });
    const { xml, chave } = xmlNotaVendaTeste({ itens: [{ codigo: 'FONE-01' }] });
    definirConectorParaTestes('MERCADO_LIVRE', {
      canal: 'MERCADO_LIVRE',
      listarAtualizadasDesde: () => {
        throw new Error('não usado neste teste');
      },
      obter: async () => {
        throw new Error('não usado neste teste');
      },
      enviarResultadoConferencia: async () => {
        throw new Error('não usado neste teste');
      },
      obterXmlNotaVenda: async () => xml,
    });
    const { notaFiscalId } = await pedir(dev.id);
    expect((await notaDe(notaFiscalId)).chavesReferenciadas).toEqual([chave]);
  });
});
```

Rode: `npm test -- src/modules/fiscal/consultas.test.ts && npm run test:int -- src/modules/fiscal/emissao.int.test.ts`
Esperado: FAIL (os módulos não existem).

- [ ] **Passo 2: Esperas das consultas (puro)**

`src/modules/fiscal/consultas.ts`:

```ts
/** D12: a 1ª consulta vai logo depois do envio; depois 10 s, 30 s, 1 min, 2 min, 5 min e a cada 10 min. */
export const ESPERAS_CONSULTA_SEGUNDOS = [10, 30, 60, 120, 300] as const;
export const ESPERA_FINAL_SEGUNDOS = 600;
/** Cerca de 24 h de consultas. Passou disso, a tarefa falha e vai para a tela Falhas (Fase 6). */
export const LIMITE_CONSULTAS = 150;

export function esperaAntesDaConsulta(numero: number): number {
  if (numero <= 1) return 0;
  const espera: number | undefined = ESPERAS_CONSULTA_SEGUNDOS[numero - 2];
  return espera ?? ESPERA_FINAL_SEGUNDOS;
}
```

- [ ] **Passo 3: Notas, ciclo e emissão**

`src/modules/fiscal/notas.ts`:

```ts
import { eq } from 'drizzle-orm';
import type { NotaParaEmissao } from '@/conectores/nfe/tipos';
import type { DbOuTx } from '@/db/client';
import { notasFiscais } from '@/db/schema';
import { pode } from '@/modules/auth/permissoes';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { portaLotes } from '@/modules/lotes/porta';
import { ErroFiscal } from './erros';
import { montarNotaDevolucao } from './montar-devolucao';

export type NotaFiscalLinha = typeof notasFiscais.$inferSelect;

export async function obterNota(db: DbOuTx, id: string, opcoes: { travar?: boolean } = {}): Promise<NotaFiscalLinha | null> {
  const consulta = db.select().from(notasFiscais).where(eq(notasFiscais.id, id));
  const [nota] = opcoes.travar ? await consulta.for('update') : await consulta;
  return nota ?? null;
}

/** Contrato §5.7: a montagem é escolhida pelo tipo (também ao reenviar). Remessa = porta de lotes (Fase 5). */
export async function montarNotaParaEmissao(
  db: DbOuTx,
  nota: Pick<NotaFiscalLinha, 'tipo' | 'devolucaoId' | 'loteId'>,
  referencia: string,
): Promise<NotaParaEmissao> {
  if (nota.tipo === 'DEVOLUCAO_VENDA') {
    if (!nota.devolucaoId) throw new ErroFiscal('NF de devolução sem devolução.');
    return montarNotaDevolucao(db, nota.devolucaoId, referencia);
  }
  if (!nota.loteId) throw new ErroFiscal('NF de remessa sem lote.');
  return portaLotes.montarNotaRemessa(db, nota.loteId, referencia);
}

/** Spec §6.9: emitir ou cancelar NF é do Fiscal e do Gestor. */
export function exigirPodeEmitir(usuario: UsuarioSessao): void {
  if (!pode(usuario.perfil, 'gerir_fiscal')) throw new ErroFiscal('Só o Fiscal ou o Gestor emitem, reenviam e cancelam NF.');
}
```

`src/modules/fiscal/ciclo.ts`:

```ts
import { and, eq } from 'drizzle-orm';
import { ErroEmissorRecusou } from '@/conectores/nfe/erros';
import { obterEmissorNFe } from '@/conectores/nfe/registro';
import type { SituacaoNota } from '@/conectores/nfe/tipos';
import type { Db, DbOuTx } from '@/db/client';
import { devolucoes, itensDevolucao, notasFiscais } from '@/db/schema';
import { lerConfiguracao } from '@/modules/configuracoes/ler';
import { exigirTransicao } from '@/modules/devolucoes/transicoes';
import { exigirTransicaoItem } from '@/modules/devolucoes/transicoes-item';
import type { Fila } from '@/modules/fila/fila';
import { registrarEvento } from '@/modules/historico/eventos';
import { portaLotes } from '@/modules/lotes/porta';
import { caminhoBaseNfe, salvarArquivo } from './arquivos';
import { esperaAntesDaConsulta, LIMITE_CONSULTAS } from './consultas';
import { ErroFiscal } from './erros';
import { montarNotaParaEmissao, obterNota, type NotaFiscalLinha } from './notas';
import { exigirTransicaoNota } from './transicoes-nota';

type Autorizada = Extract<SituacaoNota, { situacao: 'AUTORIZADA' }>;

/** O XML do cancelamento fica ao lado do XML da nota (contrato §5.2). */
export function caminhoDoCancelamento(xmlCaminho: string): string {
  return xmlCaminho.replace(/\.xml$/, '-cancelamento.xml');
}

/** Manipulador de `nfe.emitir` (contrato §5.1): monta, envia e já faz a 1ª consulta. Idempotente. */
export async function processarEmissao(db: Db, fila: Fila, notaFiscalId: string, agora: Date): Promise<void> {
  const nota = await obterNota(db, notaFiscalId);
  if (!nota || nota.situacao !== 'PROCESSANDO') return;
  try {
    const dados = await montarNotaParaEmissao(db, nota, nota.referenciaEmissor);
    await obterEmissorNFe(nota.ambiente).emitir(dados);
  } catch (erro) {
    // Erro definitivo de negócio não lança: vira rejeição, com a mensagem (contrato §5.1).
    if (erro instanceof ErroFiscal || erro instanceof ErroEmissorRecusou) {
      await registrarRejeicao(db, notaFiscalId, { codigo: null, motivo: erro.message }, agora);
      return;
    }
    throw erro;
  }
  await processarConsulta(db, fila, notaFiscalId, 1, agora);
}

/** Manipulador de `nfe.consultar`: aplica o resultado ou reagenda com espera crescente (D12). */
export async function processarConsulta(db: Db, fila: Fila, notaFiscalId: string, consulta: number, agora: Date): Promise<void> {
  const nota = await obterNota(db, notaFiscalId);
  if (!nota) return;
  if (nota.situacao === 'CANCELADA') {
    await completarCancelamento(db, nota);
    return;
  }
  if (nota.situacao !== 'PROCESSANDO') return;
  const situacao = await obterEmissorNFe(nota.ambiente).consultar(nota.referenciaEmissor);
  switch (situacao.situacao) {
    case 'PROCESSANDO': {
      if (consulta >= LIMITE_CONSULTAS) {
        throw new Error(`A NF ${nota.referenciaEmissor} continua em processamento depois de ${LIMITE_CONSULTAS} consultas.`);
      }
      const proxima = consulta + 1;
      await fila.enviar(
        'nfe.consultar',
        { notaFiscalId, consulta: proxima },
        { chaveUnica: `${notaFiscalId}:${proxima}`, iniciarEm: new Date(agora.getTime() + esperaAntesDaConsulta(proxima) * 1000) },
      );
      return;
    }
    case 'AUTORIZADA':
      await registrarAutorizacao(db, nota, situacao, agora);
      return;
    case 'REJEITADA':
      await registrarRejeicao(db, notaFiscalId, situacao, agora);
      return;
    default:
      throw new Error(`O emissor respondeu ${situacao.situacao} para a NF ${nota.referenciaEmissor}, que está em processamento.`);
  }
}

async function registrarAutorizacao(db: Db, nota: NotaFiscalLinha, s: Autorizada, agora: Date): Promise<void> {
  // Arquivos antes da transação: se o download falhar, a tarefa tenta de novo e nada muda no banco.
  const emissor = obterEmissorNFe(nota.ambiente);
  const [xml, danfe] = await Promise.all([emissor.baixar(s.urlXml), emissor.baixar(s.urlDanfe)]);
  const base = caminhoBaseNfe(nota.id, agora);
  await salvarArquivo(`${base}.xml`, xml, 'application/xml');
  await salvarArquivo(`${base}-danfe.pdf`, danfe, 'application/pdf');
  await db.transaction(async (tx) => {
    const atual = await obterNota(tx, nota.id, { travar: true });
    if (!atual || atual.situacao !== 'PROCESSANDO') return;
    exigirTransicaoNota({ de: 'PROCESSANDO', para: 'AUTORIZADA' });
    const serieConfigurada = (await lerConfiguracao(tx)).serieNfe ?? null;
    const serieDivergente = serieConfigurada !== null && Number(serieConfigurada) !== Number(s.serie);
    await tx
      .update(notasFiscais)
      .set({
        situacao: 'AUTORIZADA',
        chave: s.chave,
        numero: s.numero,
        serie: s.serie,
        xmlCaminho: `${base}.xml`,
        danfeCaminho: `${base}-danfe.pdf`,
        motivoRejeicao: null,
        autorizadaEm: agora,
        atualizadaEm: agora,
      })
      .where(eq(notasFiscais.id, nota.id));
    await registrarEvento(tx, {
      entidade: 'nota_fiscal',
      entidadeId: nota.id,
      acao: 'nf_autorizada',
      de: 'PROCESSANDO',
      para: 'AUTORIZADA',
      usuarioId: null,
      em: agora,
      // D12: o sistema confere a série que volta; diferente vira aviso (a nota continua válida).
      dados: { numero: s.numero, serie: s.serie, chave: s.chave, ...(serieDivergente ? { serieConfigurada } : {}) },
    });
    if (atual.tipo === 'DEVOLUCAO_VENDA' && atual.devolucaoId) await aplicarAutorizacaoDevolucao(tx, atual.devolucaoId, nota.id, s, agora);
    else if (atual.loteId) await portaLotes.aoAutorizarRemessa(tx, atual.loteId, nota.id, agora);
  });
}

/** Spec §6.4 e contrato §5.7: itens BOM → DISPONIVEL_VENDA, porta de lotes, devolução → CONCLUIDA. */
async function aplicarAutorizacaoDevolucao(tx: DbOuTx, devolucaoId: string, notaFiscalId: string, s: Autorizada, agora: Date): Promise<void> {
  const [d] = await tx.select({ status: devolucoes.status }).from(devolucoes).where(eq(devolucoes.id, devolucaoId)).for('update');
  if (!d) return;
  exigirTransicao({ de: d.status, para: 'CONCLUIDA', ator: 'SISTEMA' });
  const bons = await tx
    .select({ id: itensDevolucao.id })
    .from(itensDevolucao)
    .where(and(eq(itensDevolucao.devolucaoId, devolucaoId), eq(itensDevolucao.status, 'AGUARDANDO_NF'), eq(itensDevolucao.destino, 'BOM')));
  for (const item of bons) {
    exigirTransicaoItem({ de: 'AGUARDANDO_NF', para: 'DISPONIVEL_VENDA', ator: 'SISTEMA' });
    await tx.update(itensDevolucao).set({ status: 'DISPONIVEL_VENDA' }).where(eq(itensDevolucao.id, item.id));
    await registrarEvento(tx, {
      entidade: 'item',
      entidadeId: item.id,
      acao: 'item_status',
      de: 'AGUARDANDO_NF',
      para: 'DISPONIVEL_VENDA',
      usuarioId: null,
      em: agora,
      dados: { devolucaoId, notaFiscalId },
    });
  }
  // D11: até a Fase 5 a porta não faz nada e o item PROBLEMA continua em AGUARDANDO_NF.
  await portaLotes.alocarItensProblema(tx, devolucaoId, agora);
  await tx.update(devolucoes).set({ status: 'CONCLUIDA', concluidaEm: agora, atualizadaEm: agora }).where(eq(devolucoes.id, devolucaoId));
  await registrarEvento(tx, {
    entidade: 'devolucao',
    entidadeId: devolucaoId,
    acao: 'nf_autorizada',
    de: d.status,
    para: 'CONCLUIDA',
    usuarioId: null,
    em: agora,
    dados: { notaFiscalId, numero: s.numero, serie: s.serie },
  });
}

async function registrarRejeicao(db: Db, notaFiscalId: string, r: { codigo: string | null; motivo: string }, agora: Date): Promise<void> {
  await db.transaction(async (tx) => {
    const atual = await obterNota(tx, notaFiscalId, { travar: true });
    if (!atual || atual.situacao !== 'PROCESSANDO') return;
    exigirTransicaoNota({ de: 'PROCESSANDO', para: 'REJEITADA' });
    const motivo = (r.codigo ? `${r.codigo} - ${r.motivo}` : r.motivo).slice(0, 1000);
    await tx.update(notasFiscais).set({ situacao: 'REJEITADA', motivoRejeicao: motivo, atualizadaEm: agora }).where(eq(notasFiscais.id, notaFiscalId));
    await registrarEvento(tx, {
      entidade: 'nota_fiscal',
      entidadeId: notaFiscalId,
      acao: 'nf_rejeitada',
      de: 'PROCESSANDO',
      para: 'REJEITADA',
      usuarioId: null,
      em: agora,
      dados: { motivo },
    });
    if (atual.devolucaoId) {
      await registrarEvento(tx, { entidade: 'devolucao', entidadeId: atual.devolucaoId, acao: 'nf_rejeitada', usuarioId: null, em: agora, dados: { notaFiscalId, motivo } });
    }
  });
}

/** Decisão 9: quando o XML do cancelamento não veio na hora, a consulta busca depois. */
async function completarCancelamento(db: Db, nota: NotaFiscalLinha): Promise<void> {
  if (nota.xmlCancelamentoCaminho || !nota.xmlCaminho) return;
  const emissor = obterEmissorNFe(nota.ambiente);
  const situacao = await emissor.consultar(nota.referenciaEmissor);
  if (situacao.situacao !== 'CANCELADA' || !situacao.urlXmlCancelamento) return;
  const caminho = caminhoDoCancelamento(nota.xmlCaminho);
  await salvarArquivo(caminho, await emissor.baixar(situacao.urlXmlCancelamento), 'application/xml');
  await db.update(notasFiscais).set({ xmlCancelamentoCaminho: caminho }).where(eq(notasFiscais.id, nota.id));
}
```

`src/modules/fiscal/emissao.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { and, eq, ne } from 'drizzle-orm';
import { ErroEmissorRecusou } from '@/conectores/nfe/erros';
import { obterEmissorNFe } from '@/conectores/nfe/registro';
import type { Db } from '@/db/client';
import { ehViolacaoDeUnicidade } from '@/db/erros';
import { devolucoes, notasFiscais, notasVenda } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import type { AmbienteNfe } from '@/modules/configuracoes/dominio';
import { ROTULO_STATUS } from '@/modules/devolucoes/dominio';
import { obterFila } from '@/modules/fila/fila';
import { registrarEvento } from '@/modules/historico/eventos';
import { lerConfiguracaoFiscal } from './configuracao';
import { referenciaDaNota } from './dominio';
import { ErroFiscal } from './erros';
import { buscarNotaVendaNoCanal } from './nota-venda';
import { exigirPodeEmitir, montarNotaParaEmissao, obterNota } from './notas';
import { exigirTransicaoNota } from './transicoes-nota';

/** Contrato §5.7. */
export type AlvoEmissao =
  | { tipo: 'DEVOLUCAO_VENDA'; devolucaoId: string }
  | { tipo: 'REMESSA_CONSERTO' | 'REMESSA_TROCA_GARANTIA'; loteId: string };

const MENSAGEM_NOTA_ATIVA = {
  PROCESSANDO: 'Esta devolução já tem NF de devolução em processamento.',
  AUTORIZADA: 'Esta devolução já tem NF de devolução autorizada.',
  REJEITADA: 'Esta devolução tem NF rejeitada: use "Corrigir e reenviar" no detalhe da devolução.',
} as const;

/** Falta do token do ambiente vira mensagem na tela, antes de criar a nota. */
function exigirEmissor(ambiente: AmbienteNfe): void {
  try {
    obterEmissorNFe(ambiente);
  } catch (erro) {
    if (erro instanceof ErroEmissorRecusou) throw new ErroFiscal(erro.message);
    throw erro;
  }
}

/** Contrato §5.8: devolução do ML ainda sem NF de venda → pede ao conector antes de montar. */
async function trazerNotaVendaDoCanal(db: Db, devolucaoId: string, usuario: UsuarioSessao): Promise<void> {
  const [existente] = await db.select({ id: notasVenda.id }).from(notasVenda).where(eq(notasVenda.devolucaoId, devolucaoId)).limit(1);
  if (!existente) await buscarNotaVendaNoCanal(db, devolucaoId, usuario);
}

/**
 * Contrato §5.7: valida tudo (montando a nota), cria a nota em PROCESSANDO e envia `nfe.emitir` na mesma transação.
 * Lança ErroFiscal com a mensagem para a tela.
 */
export async function solicitarEmissao(db: Db, alvo: AlvoEmissao, usuario: UsuarioSessao): Promise<{ notaFiscalId: string }> {
  exigirPodeEmitir(usuario);
  const config = await lerConfiguracaoFiscal(db);
  exigirEmissor(config.ambiente);
  if (alvo.tipo === 'DEVOLUCAO_VENDA') await trazerNotaVendaDoCanal(db, alvo.devolucaoId, usuario);
  const id = randomUUID();
  const referencia = referenciaDaNota(id);
  const destino =
    alvo.tipo === 'DEVOLUCAO_VENDA'
      ? { tipo: alvo.tipo, devolucaoId: alvo.devolucaoId, loteId: null }
      : { tipo: alvo.tipo, devolucaoId: null, loteId: alvo.loteId };
  try {
    return await db.transaction(async (tx) => {
      if (destino.devolucaoId) {
        const [d] = await tx.select({ status: devolucoes.status }).from(devolucoes).where(eq(devolucoes.id, destino.devolucaoId)).for('update');
        if (!d) throw new ErroFiscal('Devolução não encontrada.');
        if (d.status !== 'AGUARDANDO_NF') throw new ErroFiscal(`A devolução está ${ROTULO_STATUS[d.status]}: a NF de devolução só sai em Aguardando NF.`);
        const [ativa] = await tx
          .select({ situacao: notasFiscais.situacao })
          .from(notasFiscais)
          .where(and(eq(notasFiscais.devolucaoId, destino.devolucaoId), ne(notasFiscais.situacao, 'CANCELADA')));
        if (ativa && ativa.situacao !== 'CANCELADA') throw new ErroFiscal(MENSAGEM_NOTA_ATIVA[ativa.situacao]);
      }
      // Decisão 4: monta antes de gravar, para o Fiscal ver na hora o que falta.
      const nota = await montarNotaParaEmissao(tx, destino, referencia);
      exigirTransicaoNota({ de: null, para: 'PROCESSANDO' });
      await tx.insert(notasFiscais).values({
        id,
        ...destino,
        ambiente: config.ambiente,
        referenciaEmissor: referencia,
        chavesReferenciadas: nota.chavesReferenciadas,
        emitidaPor: usuario.id,
      });
      await registrarEvento(tx, {
        entidade: 'nota_fiscal',
        entidadeId: id,
        acao: 'nf_solicitada',
        de: null,
        para: 'PROCESSANDO',
        usuarioId: usuario.id,
        dados: { tipo: destino.tipo, ambiente: config.ambiente },
      });
      if (destino.devolucaoId) {
        await registrarEvento(tx, { entidade: 'devolucao', entidadeId: destino.devolucaoId, acao: 'nf_solicitada', usuarioId: usuario.id, dados: { notaFiscalId: id } });
      }
      await obterFila().enviar('nfe.emitir', { notaFiscalId: id }, { tx });
      return { notaFiscalId: id };
    });
  } catch (erro) {
    if (ehViolacaoDeUnicidade(erro)) throw new ErroFiscal(MENSAGEM_NOTA_ATIVA.PROCESSANDO);
    throw erro;
  }
}

/** Contrato §5.7 e spec §8.6: "corrigir e reenviar" (REJEITADA → PROCESSANDO), com o mesmo `ref` e o ambiente atual. */
export async function reenviarNota(db: Db, notaFiscalId: string, usuario: UsuarioSessao): Promise<void> {
  exigirPodeEmitir(usuario);
  const config = await lerConfiguracaoFiscal(db);
  exigirEmissor(config.ambiente);
  await db.transaction(async (tx) => {
    const nota = await obterNota(tx, notaFiscalId, { travar: true });
    if (!nota) throw new ErroFiscal('NF não encontrada.');
    if (nota.situacao !== 'REJEITADA') throw new ErroFiscal('Só uma NF rejeitada pode ser corrigida e reenviada.');
    exigirTransicaoNota({ de: 'REJEITADA', para: 'PROCESSANDO' });
    // Monta de novo: se a causa ainda está aí (regra, NF de venda, item sem par), o Fiscal vê agora.
    const montada = await montarNotaParaEmissao(tx, nota, nota.referenciaEmissor);
    const agora = new Date();
    await tx
      .update(notasFiscais)
      .set({ situacao: 'PROCESSANDO', motivoRejeicao: null, ambiente: config.ambiente, chavesReferenciadas: montada.chavesReferenciadas, atualizadaEm: agora })
      .where(eq(notasFiscais.id, notaFiscalId));
    await registrarEvento(tx, {
      entidade: 'nota_fiscal',
      entidadeId: notaFiscalId,
      acao: 'nf_reenviada',
      de: 'REJEITADA',
      para: 'PROCESSANDO',
      usuarioId: usuario.id,
      dados: { motivoAnterior: nota.motivoRejeicao },
    });
    if (nota.devolucaoId) {
      await registrarEvento(tx, { entidade: 'devolucao', entidadeId: nota.devolucaoId, acao: 'nf_reenviada', usuarioId: usuario.id, dados: { notaFiscalId } });
    }
    await obterFila().enviar('nfe.emitir', { notaFiscalId }, { tx });
  });
}
```

`src/worker/manipuladores/fiscal.ts` (substitui todo o conteúdo; mantenha o caminho de import de `Manipuladores` que a Parte A usou):

```ts
import { processarConsulta, processarEmissao } from '@/modules/fiscal/ciclo';
import type { Manipuladores } from '../tipos';

/** Contrato §5.1: envio e consulta da NF-e. Idempotentes; erro passageiro lança (a fila tenta de novo, spec §11). */
export const manipuladoresFiscal: Manipuladores = {
  'nfe.emitir': async ({ notaFiscalId }, ctx) => processarEmissao(ctx.db, ctx.fila, notaFiscalId, ctx.agora),
  'nfe.consultar': async ({ notaFiscalId, consulta }, ctx) => processarConsulta(ctx.db, ctx.fila, notaFiscalId, consulta, ctx.agora),
};
```

- [ ] **Passo 4: Rodar os testes**

Rode: `npm test -- src/modules/fiscal && npm run test:int -- src/modules/fiscal`
Esperado: PASS.

Se o teste "solicita, envia..." falhar porque `fila.enviadas[0].opcoes.tx` não existe, confira a `FilaMemoria` da Parte A: ela pode descartar o `tx`. O que importa é o `nome` e os `dados` (o `toEqual` com `expect.objectContaining` já ignora o resto).

- [ ] **Passo 5: Rodar tudo**

Rode: `npm test && npm run test:int && npm run typecheck && npm run lint && npm run build:scripts`
Esperado: tudo PASS (o `build:scripts` confere que o `dist/worker.mjs` da Parte A empacota os manipuladores fiscais).

- [ ] **Passo 6: Commit**

```bash
cd "/c/Users/idmpc/devolucoes-wt/fase-4"
git add -A
git commit -m "feat: emissão da NF de devolução pela fila (envio, consulta com espera crescente, autorização com efeitos, rejeição e reenvio)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 8: Cancelamento em até 24 h e ZIP dos XMLs do período (spec §8.6 e §8.7)

**Arquivos:**
- Criar: `src/modules/fiscal/cancelamento.ts`, `src/modules/fiscal/periodo.ts`, `src/modules/fiscal/xmls-periodo.ts`, `src/app/api/fiscal/xmls/route.ts`
- Modificar (acrescentar 1 linha no final): `src/modules/fiscal/emissao.ts`
- Testes: `src/modules/fiscal/periodo.test.ts`, `src/modules/fiscal/cancelamento.int.test.ts`, `src/modules/fiscal/xmls-periodo.int.test.ts`

**Interfaces:**
- Consome: Tarefa 7 (`obterNota`, `exigirPodeEmitir`, `caminhoDoCancelamento`, `solicitarEmissao`, `rodarTarefasFiscais`); `portaLotes` (Tarefa 1); `obterEmissorNFe`, `EmissorFalso`, erros do emissor (Tarefa 4); `lerArquivo`, `salvarArquivo` (Tarefa 5); `exigirTransicao`, `exigirTransicaoItem`; `zipSync`, `unzipSync`, `strFromU8` de `fflate`; `interpretarData` (Fase 1).
- Produz:
  - `cancelamento.ts` e reexportado por `emissao.ts` (contrato §5.7): `cancelarNota(db: Db, notaFiscalId, justificativa, usuario, agora?): Promise<void>`
  - `periodo.ts` (puro): `DIAS_MAXIMOS_ZIP = 31`, `MENSAGEM_ERRO_XMLS: Record<string, string>` (chaves `periodo` e `vazio`), `periodoDoMesAtual(agora?): { de; ate }`, `validarPeriodo(de, ate): boolean`
  - `xmls-periodo.ts`: `type ResultadoZip`, `gerarZipXmls(db, { de, ate }, ambiente?): Promise<ResultadoZip>`
  - rota `GET /api/fiscal/xmls?de=AAAA-MM-DD&ate=AAAA-MM-DD` (permissão `gerir_fiscal`): devolve `application/zip`; erro → 303 para `/fluxo/etapa/4?xmls=periodo|vazio`

**Cancelamento (spec §8.6, decisão 9):** Fiscal ou Gestor; justificativa de 15 a 255 caracteres; só NF AUTORIZADA, até 24 h depois da autorização; a porta de lotes pode impedir (Fase 5: item em lote que não está mais ABERTO); a Focus cancela na hora; o XML do cancelamento é baixado (ou buscado depois por `nfe.consultar`). Na mesma transação: nota → CANCELADA; itens DISPONIVEL_VENDA → AGUARDANDO_NF; `portaLotes.desfazerAlocacao`; devolução CONCLUIDA → AGUARDANDO_NF (`concluida_em` vazio, evento `devolucao_reaberta`). Remessa: `portaLotes.aoCancelarRemessa`.

- [ ] **Passo 1: Escrever os testes que falham**

`src/modules/fiscal/periodo.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { periodoDoMesAtual, validarPeriodo } from './periodo';

describe('período do ZIP de XMLs (spec §8.7)', () => {
  it('padrão: do dia 1 até hoje, no horário de Brasília', () => {
    expect(periodoDoMesAtual(new Date('2026-11-12T12:00:00Z'))).toEqual({ de: '2026-11-01', ate: '2026-11-12' });
    // 01/12 às 02:00 UTC ainda é 30/11 em Brasília.
    expect(periodoDoMesAtual(new Date('2026-12-01T02:00:00Z'))).toEqual({ de: '2026-11-01', ate: '2026-11-30' });
  });

  it('até 31 dias, "De" antes de "Até", datas de verdade', () => {
    expect(validarPeriodo('2026-11-01', '2026-11-30')).toBe(true);
    expect(validarPeriodo('2026-10-01', '2026-10-31')).toBe(true);
    expect(validarPeriodo('2026-10-01', '2026-11-01')).toBe(false);
    expect(validarPeriodo('2026-11-30', '2026-11-01')).toBe(false);
    expect(validarPeriodo('2026-02-30', '2026-03-01')).toBe(false);
    expect(validarPeriodo('01/11/2026', '2026-11-30')).toBe(false);
  });
});
```

`src/modules/fiscal/cancelamento.int.test.ts`:

```ts
import { asc, eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErroEmissorIndisponivel } from '@/conectores/nfe/erros';
import { EmissorFalso } from '@/conectores/nfe/falso';
import { definirEmissorParaTestes } from '@/conectores/nfe/registro';
import { devolucoes, itensDevolucao, notasFiscais } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { definirFilaParaTestes, FilaMemoria } from '@/modules/fila/fila';
import { listarEventos } from '@/modules/historico/eventos';
import { portaLotes } from '@/modules/lotes/porta';
import { obterArmazenamento } from '@/modules/midia/armazenamento';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { configurarFiscalTeste, criarDevolucaoNoEstoqueTeste, inserirNotaVendaTeste } from '../../../tests/helpers/fabricas-fiscal';
import { rodarTarefasFiscais } from '../../../tests/helpers/fila-fiscal';
import { cancelarNota, solicitarEmissao } from './emissao';

const { db, sql } = criarDbTeste();
const AUTORIZADA_EM = new Date('2026-11-12T13:00:00Z');
const HORA = 60 * 60 * 1000;
const JUSTIFICATIVA = 'Cliente desistiu da devolução';
let gestor: UsuarioSessao;
let fiscal: UsuarioSessao;
let operador: UsuarioSessao;
let fila: FilaMemoria;

/** Falha ao baixar o XML do cancelamento enquanto `falhar` for true. */
class EmissorSemArquivoDeCancelamento extends EmissorFalso {
  falhar = true;
  override async baixar(url: string): Promise<Buffer> {
    if (this.falhar && url.includes('cancelamento')) throw new ErroEmissorIndisponivel('A Focus NFe não respondeu ao baixar o arquivo.');
    return super.baixar(url);
  }
}

beforeEach(async () => {
  await limparTabelas(sql);
  gestor = await criarUsuarioTeste(db, 'GESTOR');
  fiscal = await criarUsuarioTeste(db, 'FISCAL');
  operador = await criarUsuarioTeste(db, 'OPERADOR');
  await configurarFiscalTeste(db, gestor);
  fila = new FilaMemoria();
  definirFilaParaTestes(fila);
  definirEmissorParaTestes(new EmissorFalso());
});
afterEach(() => {
  vi.restoreAllMocks();
  definirFilaParaTestes(null);
  definirEmissorParaTestes(null);
});
afterAll(async () => {
  await sql.end();
});

async function devolucaoAutorizada() {
  const dev = await criarDevolucaoNoEstoqueTeste(db, gestor, {
    unidades: [{ sku: 'FONE-01', destino: 'BOM' }, { sku: 'FONE-01', destino: 'PROBLEMA' }, { sku: 'CABO-02', destino: 'AUSENTE' }],
  });
  await inserirNotaVendaTeste(db, dev.id, { itens: [{ codigo: 'FONE-01', quantidade: 2 }] });
  const { notaFiscalId } = await solicitarEmissao(db, { tipo: 'DEVOLUCAO_VENDA', devolucaoId: dev.id }, fiscal);
  await rodarTarefasFiscais(db, fila, AUTORIZADA_EM);
  return { dev, notaFiscalId };
}
async function notaDe(id: string) {
  const [nota] = await db.select().from(notasFiscais).where(eq(notasFiscais.id, id));
  return nota;
}

describe('cancelarNota (spec §8.6)', () => {
  it('em até 24 h: NF cancelada com o XML do cancelamento; itens e devolução voltam para Aguardando NF; uma NF nova pode sair', async () => {
    const { dev, notaFiscalId } = await devolucaoAutorizada();
    const quando = new Date(AUTORIZADA_EM.getTime() + 23 * HORA);
    await cancelarNota(db, notaFiscalId, '  Cliente   desistiu da devolução ', fiscal, quando);

    expect(await notaDe(notaFiscalId)).toMatchObject({
      situacao: 'CANCELADA',
      canceladaEm: quando,
      justificativaCancelamento: JUSTIFICATIVA,
      xmlCancelamentoCaminho: `nfe/2026/11/${notaFiscalId}-cancelamento.xml`,
    });
    expect(await obterArmazenamento().existe(`nfe/2026/11/${notaFiscalId}-cancelamento.xml`)).toBe(true);
    const [d] = await db.select().from(devolucoes).where(eq(devolucoes.id, dev.id));
    expect(d).toMatchObject({ status: 'AGUARDANDO_NF', concluidaEm: null });
    const itens = await db.select({ status: itensDevolucao.status }).from(itensDevolucao).where(eq(itensDevolucao.devolucaoId, dev.id)).orderBy(asc(itensDevolucao.unidade));
    expect(itens.map((i) => i.status)).toEqual(['AGUARDANDO_NF', 'AGUARDANDO_NF', 'AUSENTE']);
    expect((await listarEventos(db, 'devolucao', dev.id)).at(-1)).toMatchObject({
      acao: 'devolucao_reaberta',
      de: 'CONCLUIDA',
      para: 'AGUARDANDO_NF',
      usuarioNome: fiscal.nome,
      dados: { notaFiscalId, motivo: JUSTIFICATIVA },
    });
    expect((await listarEventos(db, 'nota_fiscal', notaFiscalId)).at(-1)).toMatchObject({ acao: 'nf_cancelada', de: 'AUTORIZADA', para: 'CANCELADA' });
    expect(fila.enviadas.some((t) => t.opcoes?.chaveUnica === `${notaFiscalId}:cancelamento`)).toBe(false);

    const { notaFiscalId: nova } = await solicitarEmissao(db, { tipo: 'DEVOLUCAO_VENDA', devolucaoId: dev.id }, fiscal);
    expect(nova).not.toBe(notaFiscalId);
  });

  it('recusa: justificativa curta, Operador, depois de 24 h, NF que não está autorizada', async () => {
    const { notaFiscalId } = await devolucaoAutorizada();
    const dentro = new Date(AUTORIZADA_EM.getTime() + HORA);
    await expect(cancelarNota(db, notaFiscalId, 'curta', fiscal, dentro)).rejects.toThrow('A justificativa precisa ter de 15 a 255 caracteres.');
    await expect(cancelarNota(db, notaFiscalId, JUSTIFICATIVA, operador, dentro)).rejects.toThrow('Só o Fiscal ou o Gestor emitem, reenviam e cancelam NF.');
    await expect(cancelarNota(db, notaFiscalId, JUSTIFICATIVA, fiscal, new Date(AUTORIZADA_EM.getTime() + 24 * HORA))).rejects.toThrow(
      'O prazo de cancelamento (24 horas depois da autorização) já passou. Fale com o contador sobre a nota de estorno.',
    );
    const outra = await criarDevolucaoNoEstoqueTeste(db, gestor, { unidades: [{ sku: 'FONE-01', destino: 'BOM' }] });
    await inserirNotaVendaTeste(db, outra.id, { numero: 202, itens: [{ codigo: 'FONE-01' }] });
    const { notaFiscalId: processando } = await solicitarEmissao(db, { tipo: 'DEVOLUCAO_VENDA', devolucaoId: outra.id }, fiscal);
    await expect(cancelarNota(db, processando, JUSTIFICATIVA, fiscal, dentro)).rejects.toThrow('Só uma NF autorizada pode ser cancelada.');
    expect((await notaDe(notaFiscalId)).situacao).toBe('AUTORIZADA');
  });

  it('a SEFAZ recusa: a nota continua autorizada e a devolução concluída', async () => {
    const { dev, notaFiscalId } = await devolucaoAutorizada();
    await expect(cancelarNota(db, notaFiscalId, 'Teste RECUSAR cancelamento', fiscal, AUTORIZADA_EM)).rejects.toThrow(
      'A SEFAZ recusou o cancelamento: Cancelamento recusado (simulação): a justificativa contém RECUSAR',
    );
    expect((await notaDe(notaFiscalId)).situacao).toBe('AUTORIZADA');
    const [d] = await db.select({ status: devolucoes.status }).from(devolucoes).where(eq(devolucoes.id, dev.id));
    expect(d.status).toBe('CONCLUIDA');
  });

  it('a porta de lotes pode impedir o cancelamento (Fase 5)', async () => {
    const { notaFiscalId } = await devolucaoAutorizada();
    vi.spyOn(portaLotes, 'motivoParaNaoCancelarDevolucao').mockResolvedValue('A unidade 2 está no lote LOT-000001, que já foi fechado.');
    await expect(cancelarNota(db, notaFiscalId, JUSTIFICATIVA, fiscal, AUTORIZADA_EM)).rejects.toThrow('A unidade 2 está no lote LOT-000001, que já foi fechado.');
    expect((await notaDe(notaFiscalId)).situacao).toBe('AUTORIZADA');
  });

  it('sem o XML do cancelamento na hora, a consulta busca depois (decisão 9)', async () => {
    const emissor = new EmissorSemArquivoDeCancelamento();
    definirEmissorParaTestes(emissor);
    const { notaFiscalId } = await devolucaoAutorizada();
    await cancelarNota(db, notaFiscalId, JUSTIFICATIVA, fiscal, AUTORIZADA_EM);
    expect(await notaDe(notaFiscalId)).toMatchObject({ situacao: 'CANCELADA', xmlCancelamentoCaminho: null });
    expect(fila.enviadas.some((t) => t.opcoes?.chaveUnica === `${notaFiscalId}:cancelamento`)).toBe(true);

    emissor.falhar = false;
    await rodarTarefasFiscais(db, fila, AUTORIZADA_EM);
    expect((await notaDe(notaFiscalId)).xmlCancelamentoCaminho).toBe(`nfe/2026/11/${notaFiscalId}-cancelamento.xml`);
  });
});
```

`src/modules/fiscal/xmls-periodo.int.test.ts`:

```ts
import { eq } from 'drizzle-orm';
import { strFromU8, unzipSync } from 'fflate';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EmissorFalso } from '@/conectores/nfe/falso';
import { definirEmissorParaTestes } from '@/conectores/nfe/registro';
import { notasFiscais } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { definirFilaParaTestes, FilaMemoria } from '@/modules/fila/fila';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { configurarFiscalTeste, criarDevolucaoNoEstoqueTeste, inserirNotaVendaTeste } from '../../../tests/helpers/fabricas-fiscal';
import { rodarTarefasFiscais } from '../../../tests/helpers/fila-fiscal';
import { cancelarNota, solicitarEmissao } from './emissao';
import { gerarZipXmls } from './xmls-periodo';

const { db, sql } = criarDbTeste();
const OUTUBRO = new Date('2026-10-20T15:00:00Z');
const NOVEMBRO = new Date('2026-11-12T13:00:00Z');
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

async function autorizarEm(agora: Date) {
  const dev = await criarDevolucaoNoEstoqueTeste(db, gestor, { unidades: [{ sku: 'FONE-01', destino: 'BOM' }] });
  await inserirNotaVendaTeste(db, dev.id, { itens: [{ codigo: 'FONE-01' }] });
  const { notaFiscalId } = await solicitarEmissao(db, { tipo: 'DEVOLUCAO_VENDA', devolucaoId: dev.id }, fiscal);
  await rodarTarefasFiscais(db, fila, agora);
  const [nota] = await db.select().from(notasFiscais).where(eq(notasFiscais.id, notaFiscalId));
  return nota;
}

describe('gerarZipXmls (spec §8.7, decisão 10)', () => {
  it('traz o XML das autorizadas e dos cancelamentos do período, só do ambiente atual', async () => {
    const outubro = await autorizarEm(OUTUBRO);
    const novembro = await autorizarEm(NOVEMBRO);
    await cancelarNota(db, novembro.id, 'Cliente desistiu da devolução', fiscal, new Date(NOVEMBRO.getTime() + 60 * 60 * 1000));

    const zip = await gerarZipXmls(db, { de: '2026-11-01', ate: '2026-11-30' });
    if (!zip.ok) throw new Error(`esperava o ZIP, veio ${zip.codigo}`);
    expect(zip.nome).toBe('xmls-nfe-homologacao-2026-11-01-a-2026-11-30.zip');
    expect(zip.quantidade).toBe(2);
    const arquivos = unzipSync(zip.conteudo);
    expect(Object.keys(arquivos).sort()).toEqual([`${novembro.chave}-cancelamento.xml`, `${novembro.chave}-nfe.xml`]);
    expect(strFromU8(arquivos[`${novembro.chave}-nfe.xml`])).toContain(`<chNFe>${novembro.chave}</chNFe>`);
    expect(strFromU8(arquivos[`${novembro.chave}-cancelamento.xml`])).toContain('<tpEvento>110111</tpEvento>');

    const zipOutubro = await gerarZipXmls(db, { de: '2026-10-01', ate: '2026-10-31' });
    expect(zipOutubro.ok && Object.keys(unzipSync(zipOutubro.conteudo))).toEqual([`${outubro.chave}-nfe.xml`]);
    expect(await gerarZipXmls(db, { de: '2026-11-01', ate: '2026-11-30' }, 'PRODUCAO')).toEqual({ ok: false, codigo: 'vazio' });
    expect(await gerarZipXmls(db, { de: '2026-09-01', ate: '2026-11-30' })).toEqual({ ok: false, codigo: 'periodo' });
  });
});
```

Rode: `npm test -- src/modules/fiscal/periodo.test.ts && npm run test:int -- src/modules/fiscal/cancelamento.int.test.ts src/modules/fiscal/xmls-periodo.int.test.ts`
Esperado: FAIL (os módulos não existem).

- [ ] **Passo 2: Implementar o cancelamento**

`src/modules/fiscal/cancelamento.ts`:

```ts
import { and, eq } from 'drizzle-orm';
import { ErroEmissorIndisponivel, ErroEmissorRecusou } from '@/conectores/nfe/erros';
import { obterEmissorNFe } from '@/conectores/nfe/registro';
import type { EmissorNFe, SituacaoNota } from '@/conectores/nfe/tipos';
import type { Db, DbOuTx } from '@/db/client';
import { devolucoes, itensDevolucao, notasFiscais } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { exigirTransicao } from '@/modules/devolucoes/transicoes';
import { exigirTransicaoItem } from '@/modules/devolucoes/transicoes-item';
import { obterFila } from '@/modules/fila/fila';
import { registrarEvento } from '@/modules/historico/eventos';
import { portaLotes } from '@/modules/lotes/porta';
import { salvarArquivo } from './arquivos';
import { caminhoDoCancelamento } from './ciclo';
import { dentroDoPrazoDeCancelamento, JUSTIFICATIVA_MAXIMA, JUSTIFICATIVA_MINIMA } from './dominio';
import { ErroFiscal } from './erros';
import { exigirPodeEmitir, obterNota } from './notas';
import { exigirTransicaoNota } from './transicoes-nota';

/** Contrato §5.7 e spec §8.6: cancela na hora (a Focus é síncrona) e desfaz o efeito na mesma transação. */
export async function cancelarNota(db: Db, notaFiscalId: string, justificativa: string, usuario: UsuarioSessao, agora: Date = new Date()): Promise<void> {
  exigirPodeEmitir(usuario);
  const texto = justificativa.trim().replace(/\s+/g, ' ');
  if (texto.length < JUSTIFICATIVA_MINIMA || texto.length > JUSTIFICATIVA_MAXIMA) {
    throw new ErroFiscal(`A justificativa precisa ter de ${JUSTIFICATIVA_MINIMA} a ${JUSTIFICATIVA_MAXIMA} caracteres.`);
  }
  const nota = await obterNota(db, notaFiscalId);
  if (!nota) throw new ErroFiscal('NF não encontrada.');
  if (nota.situacao !== 'AUTORIZADA' || !nota.autorizadaEm) throw new ErroFiscal('Só uma NF autorizada pode ser cancelada.');
  if (!dentroDoPrazoDeCancelamento(nota.autorizadaEm, agora)) {
    throw new ErroFiscal('O prazo de cancelamento (24 horas depois da autorização) já passou. Fale com o contador sobre a nota de estorno.');
  }
  if (nota.tipo === 'DEVOLUCAO_VENDA' && nota.devolucaoId) {
    const motivo = await portaLotes.motivoParaNaoCancelarDevolucao(db, nota.devolucaoId);
    if (motivo) throw new ErroFiscal(motivo);
  }

  let emissor: EmissorNFe;
  let resposta: SituacaoNota;
  try {
    emissor = obterEmissorNFe(nota.ambiente);
    resposta = await emissor.cancelar(nota.referenciaEmissor, texto);
  } catch (erro) {
    if (erro instanceof ErroEmissorRecusou) throw new ErroFiscal(erro.message);
    if (erro instanceof ErroEmissorIndisponivel) throw new ErroFiscal('O emissor de NF-e não respondeu: a nota continua autorizada. Tente de novo em alguns minutos.');
    throw erro;
  }
  if (resposta.situacao === 'CANCELAMENTO_RECUSADO') throw new ErroFiscal(`A SEFAZ recusou o cancelamento: ${resposta.motivo}`);
  if (resposta.situacao !== 'CANCELADA') throw new ErroFiscal('O emissor não confirmou o cancelamento: confira a nota e tente de novo.');

  // Decisão 9: o XML do cancelamento na hora; se não vier, `nfe.consultar` busca depois.
  let xmlCancelamento: string | null = null;
  if (resposta.urlXmlCancelamento && nota.xmlCaminho) {
    try {
      const caminho = caminhoDoCancelamento(nota.xmlCaminho);
      await salvarArquivo(caminho, await emissor.baixar(resposta.urlXmlCancelamento), 'application/xml');
      xmlCancelamento = caminho;
    } catch {
      xmlCancelamento = null;
    }
  }

  await db.transaction(async (tx) => {
    const atual = await obterNota(tx, notaFiscalId, { travar: true });
    if (!atual || atual.situacao !== 'AUTORIZADA') return;
    exigirTransicaoNota({ de: 'AUTORIZADA', para: 'CANCELADA' });
    await tx
      .update(notasFiscais)
      .set({ situacao: 'CANCELADA', canceladaEm: agora, justificativaCancelamento: texto, xmlCancelamentoCaminho: xmlCancelamento, atualizadaEm: agora })
      .where(eq(notasFiscais.id, notaFiscalId));
    await registrarEvento(tx, {
      entidade: 'nota_fiscal',
      entidadeId: notaFiscalId,
      acao: 'nf_cancelada',
      de: 'AUTORIZADA',
      para: 'CANCELADA',
      usuarioId: usuario.id,
      em: agora,
      dados: { motivo: texto },
    });
    if (atual.tipo === 'DEVOLUCAO_VENDA' && atual.devolucaoId) await desfazerAutorizacaoDevolucao(tx, atual.devolucaoId, notaFiscalId, texto, usuario, agora);
    else if (atual.loteId) await portaLotes.aoCancelarRemessa(tx, atual.loteId, agora);
    if (!xmlCancelamento) {
      await obterFila().enviar('nfe.consultar', { notaFiscalId, consulta: 1 }, { tx, chaveUnica: `${notaFiscalId}:cancelamento` });
    }
  });
}

/** Spec §5.2 (CONCLUIDA → AGUARDANDO_NF) e §8.6: os itens voltam para AGUARDANDO_NF e saem do lote (porta de lotes). */
async function desfazerAutorizacaoDevolucao(
  tx: DbOuTx,
  devolucaoId: string,
  notaFiscalId: string,
  justificativa: string,
  usuario: UsuarioSessao,
  agora: Date,
): Promise<void> {
  const [d] = await tx.select({ status: devolucoes.status }).from(devolucoes).where(eq(devolucoes.id, devolucaoId)).for('update');
  if (!d) return;
  exigirTransicao({ de: d.status, para: 'AGUARDANDO_NF', ator: 'SISTEMA' });
  const disponiveis = await tx
    .select({ id: itensDevolucao.id })
    .from(itensDevolucao)
    .where(and(eq(itensDevolucao.devolucaoId, devolucaoId), eq(itensDevolucao.status, 'DISPONIVEL_VENDA')));
  for (const item of disponiveis) {
    exigirTransicaoItem({ de: 'DISPONIVEL_VENDA', para: 'AGUARDANDO_NF', ator: 'SISTEMA' });
    await tx.update(itensDevolucao).set({ status: 'AGUARDANDO_NF' }).where(eq(itensDevolucao.id, item.id));
    await registrarEvento(tx, {
      entidade: 'item',
      entidadeId: item.id,
      acao: 'item_status',
      de: 'DISPONIVEL_VENDA',
      para: 'AGUARDANDO_NF',
      usuarioId: usuario.id,
      em: agora,
      dados: { devolucaoId, notaFiscalId },
    });
  }
  await portaLotes.desfazerAlocacao(tx, devolucaoId, agora);
  await tx.update(devolucoes).set({ status: 'AGUARDANDO_NF', concluidaEm: null, atualizadaEm: agora }).where(eq(devolucoes.id, devolucaoId));
  await registrarEvento(tx, {
    entidade: 'devolucao',
    entidadeId: devolucaoId,
    acao: 'devolucao_reaberta',
    de: d.status,
    para: 'AGUARDANDO_NF',
    usuarioId: usuario.id,
    em: agora,
    dados: { notaFiscalId, motivo: justificativa },
  });
}
```

Acrescente no **final** de `src/modules/fiscal/emissao.ts` (o contrato §5.7 lista `cancelarNota` neste arquivo):

```ts
export { cancelarNota } from './cancelamento';
```

- [ ] **Passo 3: Implementar o período e o ZIP**

`src/modules/fiscal/periodo.ts`:

```ts
import { interpretarData } from '@/lib/valores';

/** Decisão 10: até 31 dias por ZIP (o arquivo é montado na memória). */
export const DIAS_MAXIMOS_ZIP = 31;

/** Mensagens da etapa 4 quando a rota do ZIP volta com ?xmls=. */
export const MENSAGEM_ERRO_XMLS: Record<string, string> = {
  periodo: 'Período inválido: escolha "De" antes de "Até", com no máximo 31 dias.',
  vazio: 'Nenhum XML de NF autorizada ou cancelada nesse período.',
};

const DIA = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Do dia 1 do mês até hoje, no horário de Brasília (valores iniciais do formulário). */
export function periodoDoMesAtual(agora: Date = new Date()): { de: string; ate: string } {
  const hoje = DIA.format(agora);
  return { de: `${hoje.slice(0, 8)}01`, ate: hoje };
}

export function validarPeriodo(de: string, ate: string): boolean {
  if (interpretarData(de) !== de || interpretarData(ate) !== ate) return false;
  const dias = (Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000;
  return dias >= 0 && dias < DIAS_MAXIMOS_ZIP;
}
```

`src/modules/fiscal/xmls-periodo.ts`:

```ts
import { and, asc, eq, isNotNull, sql } from 'drizzle-orm';
import { zipSync } from 'fflate';
import type { DbOuTx } from '@/db/client';
import { notasFiscais } from '@/db/schema';
import type { AmbienteNfe } from '@/modules/configuracoes/dominio';
import { lerConfiguracao } from '@/modules/configuracoes/ler';
import { lerArquivo } from './arquivos';
import { validarPeriodo } from './periodo';

export type ResultadoZip =
  | { ok: true; nome: string; conteudo: Uint8Array; quantidade: number }
  | { ok: false; codigo: 'periodo' | 'vazio' };

/**
 * Spec §8.7 ("Baixar XMLs do período", ponte com o Bitbrain), decisão 10: XML das notas autorizadas no período (mesmo as
 * canceladas depois) e XML dos cancelamentos do período, só do ambiente indicado (padrão: o atual da configuração).
 */
export async function gerarZipXmls(db: DbOuTx, periodo: { de: string; ate: string }, ambiente?: AmbienteNfe): Promise<ResultadoZip> {
  if (!validarPeriodo(periodo.de, periodo.ate)) return { ok: false, codigo: 'periodo' };
  const doAmbiente = ambiente ?? (await lerConfiguracao(db)).ambienteNfe;
  const inicio = sql`(${periodo.de}::date::timestamp at time zone 'America/Sao_Paulo')`;
  const fim = sql`((${periodo.ate}::date + 1)::timestamp at time zone 'America/Sao_Paulo')`;
  const autorizadas = await db
    .select({ chave: notasFiscais.chave, caminho: notasFiscais.xmlCaminho })
    .from(notasFiscais)
    .where(
      and(
        eq(notasFiscais.ambiente, doAmbiente),
        isNotNull(notasFiscais.chave),
        isNotNull(notasFiscais.xmlCaminho),
        sql`${notasFiscais.autorizadaEm} >= ${inicio}`,
        sql`${notasFiscais.autorizadaEm} < ${fim}`,
      ),
    )
    .orderBy(asc(notasFiscais.autorizadaEm));
  const cancelamentos = await db
    .select({ chave: notasFiscais.chave, caminho: notasFiscais.xmlCancelamentoCaminho })
    .from(notasFiscais)
    .where(
      and(
        eq(notasFiscais.ambiente, doAmbiente),
        isNotNull(notasFiscais.chave),
        isNotNull(notasFiscais.xmlCancelamentoCaminho),
        sql`${notasFiscais.canceladaEm} >= ${inicio}`,
        sql`${notasFiscais.canceladaEm} < ${fim}`,
      ),
    )
    .orderBy(asc(notasFiscais.canceladaEm));
  if (autorizadas.length + cancelamentos.length === 0) return { ok: false, codigo: 'vazio' };

  const arquivos: Record<string, Uint8Array> = {};
  for (const a of autorizadas) if (a.chave && a.caminho) arquivos[`${a.chave}-nfe.xml`] = await lerArquivo(a.caminho);
  for (const c of cancelamentos) if (c.chave && c.caminho) arquivos[`${c.chave}-cancelamento.xml`] = await lerArquivo(c.caminho);
  const sufixo = doAmbiente === 'HOMOLOGACAO' ? '-homologacao' : '';
  return {
    ok: true,
    nome: `xmls-nfe${sufixo}-${periodo.de}-a-${periodo.ate}.zip`,
    conteudo: zipSync(arquivos, { level: 6 }),
    quantidade: Object.keys(arquivos).length,
  };
}
```

`src/app/api/fiscal/xmls/route.ts`:

```ts
import { obterDb } from '@/db';
import { exigirPermissao } from '@/modules/auth/servidor';
import { gerarZipXmls } from '@/modules/fiscal/xmls-periodo';

export const dynamic = 'force-dynamic';

/** Spec §8.7 "Baixar XMLs do período" (Fiscal e Gestor). Sem nada para baixar, volta para a etapa 4 com o motivo. */
export async function GET(request: Request) {
  await exigirPermissao('gerir_fiscal');
  const url = new URL(request.url);
  const resultado = await gerarZipXmls(obterDb(), { de: url.searchParams.get('de') ?? '', ate: url.searchParams.get('ate') ?? '' });
  if (!resultado.ok) {
    return new Response(null, { status: 303, headers: { location: `/fluxo/etapa/4?xmls=${resultado.codigo}` } });
  }
  // Cópia num ArrayBuffer novo: o tipo do Response não aceita Uint8Array sobre ArrayBufferLike.
  return new Response(new Uint8Array(resultado.conteudo), {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${resultado.nome}"`,
      'cache-control': 'no-store',
    },
  });
}
```

- [ ] **Passo 4: Rodar tudo**

Rode: `npm test && npm run test:int && npm run typecheck && npm run lint`
Esperado: tudo PASS.

- [ ] **Passo 5: Commit**

```bash
cd "/c/Users/idmpc/devolucoes-wt/fase-4"
git add -A
git commit -m "feat: cancelamento da NF em até 24 h (desfaz itens e devolução) e ZIP dos XMLs do período para o Bitbrain" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 9: Etapa 4 "Destinação Fiscal e Estoque" (abas Estoque Bom e Estoque Problema, emissão em lote) e coluna 4 do quadro

**Arquivos:**
- Modificar (trechos indicados): `src/modules/devolucoes/busca.ts`
- Modificar (substituir todo o conteúdo): `src/modules/devolucoes/selos.ts`, `src/modules/devolucoes/quadro.ts`, `src/components/CartaoDevolucao.tsx`, `src/components/QuadroFluxo.tsx`, `src/app/(app)/fluxo/page.tsx`, `tests/e2e/apoio-fiscal.ts`
- Modificar (acrescentar no final): `src/modules/devolucoes/selos.test.ts`, `src/components/CartaoDevolucao.test.tsx`, `src/components/QuadroFluxo.test.tsx`
- Criar: `src/components/fiscal/DivisaoEstoque.tsx`, `src/components/fiscal/FormularioXmls.tsx`, `src/modules/fiscal/situacao.ts` (a Tarefa 10 completa), `src/app/(app)/fluxo/etapa/4/page.tsx`, `src/app/(app)/fluxo/etapa/4/problema/page.tsx`, `src/app/(app)/fluxo/etapa/4/PaginaEstoque.tsx`, `src/app/(app)/fluxo/etapa/4/ListaEstoque.tsx`, `src/app/(app)/fluxo/etapa/4/acoes.ts`
- Testes: `src/modules/devolucoes/estoque.int.test.ts`, `tests/e2e/fiscal-etapa4.spec.ts`

**Interfaces:**
- Consome: `buscarDevolucoes`, `ResumoDevolucao`, `OpcoesBusca`, `lerFiltros`, `filtrosParaQuery`, `POR_PAGINA_DEVOLUCOES`, `BuscaAvancada`, `Paginacao`, `CartaoDevolucao`, `RodapeFormulario`, `useEnvioFormulario` (Fase 1); `solicitarEmissao` (Tarefa 7); `pendenciasFiscais` (Tarefa 2); `ABAS_ESTOQUE`, `SELO_SITUACAO_NOTA`, `DestinoEstoque`, `SituacaoNotaFiscal` (Tarefa 1); `periodoDoMesAtual`, `MENSAGEM_ERRO_XMLS` (Tarefa 8); fábricas das Tarefas 1, 2 e 5.
- Produz:
  - `busca.ts`: `OpcoesBusca.destino?: DestinoEstoque`; `ResumoDevolucao.destinos?: { bom: number; problema: number }` e `ResumoDevolucao.situacaoNota?: SituacaoNotaFiscal | null` (opcionais: outras fases montam `ResumoDevolucao` nos testes)
  - `selos.ts`: `selosDaDevolucao` aceita `situacaoNota?` (selos "NF em processamento", "NF rejeitada", "NF autorizada")
  - `quadro.ts`: `type ContagemEstoque = { bom; problema }`, `contarEstoque(db)`, `ColunaQuadro.estoque?` (só na coluna 4)
  - `QuadroFluxo.tsx`: `ColunaFluxo.estoque?`; `DivisaoEstoque({ bom, problema, empilhada? })` com links "Estoque Bom: N devoluções" e "Estoque Problema: N devoluções"
  - `situacao.ts`: `codigosDasDevolucoes(db, ids): Promise<Map<string, string>>`
  - rotas `/fluxo/etapa/4` (Estoque Bom) e `/fluxo/etapa/4/problema` (Estoque Problema); ação `emitirNotasAcao` com `type EstadoEmissao = { erros: string[]; ok: string | null }` (caixa de erros `#erros-emissao`)
  - `apoio-fiscal.ts`: `prepararFiscal(opcoes?)`, `limparFiscal()`, `devolucaoNoEstoque({ destinos, comNotaVenda?, codigoNaVenda? })`

**Telas (mobile-first, spec §6.4):** título do PDF "Destinação Fiscal e Estoque"; duas abas (links com `aria-current`) "Estoque Bom (N)" e "Estoque Problema (N)"; aviso "A emissão de NF está bloqueada" com as pendências (Fiscal e Gestor); Busca Avançada; cartões com uma caixa de seleção de 44 px à esquerda (só para quem emite e só nas devoluções sem NF ativa) e o botão "Emitir NF de devolução (N)" no rodapé fixo; "Baixar XMLs do período" num `<details>` no fim. No quadro, a coluna 4 mostra as duas contagens (o total do cabeçalho é de devoluções distintas) e os dois links trocam o "Ver lista"; no celular, a divisão aparece embaixo dos cartões da etapa 4 (o `EtapasCelular` é congelado na janela).

- [ ] **Passo 1: Escrever os testes que falham**

Acrescente no **final** de `src/modules/devolucoes/selos.test.ts`:

```ts
describe('selos da NF de devolução (Fase 4)', () => {
  const aguardando = { ...BASE, canal: 'SHOPEE' as const, status: 'AGUARDANDO_NF' as const };

  it('em processamento, rejeitada e autorizada; sem NF ativa, nada', () => {
    expect(selosDaDevolucao({ ...aguardando, situacaoNota: 'PROCESSANDO' }, AGORA)).toEqual([{ texto: 'NF em processamento', tom: 'destaque' }]);
    expect(selosDaDevolucao({ ...aguardando, situacaoNota: 'REJEITADA' }, AGORA)).toEqual([{ texto: 'NF rejeitada', tom: 'erro' }]);
    expect(selosDaDevolucao({ ...aguardando, status: 'CONCLUIDA', situacaoNota: 'AUTORIZADA' }, AGORA)).toEqual([{ texto: 'NF autorizada', tom: 'bom' }]);
    expect(selosDaDevolucao({ ...aguardando, situacaoNota: null }, AGORA)).toEqual([]);
  });
});
```

Acrescente no **final** de `src/components/CartaoDevolucao.test.tsx`:

```tsx
describe('CartaoDevolucao na etapa 4', () => {
  it('mostra quantas unidades vão para Estoque Bom e Estoque Problema (spec §6.4)', () => {
    render(<CartaoDevolucao devolucao={{ ...BASE, status: 'AGUARDANDO_NF', selos: [], destinos: { bom: 2, problema: 1 } }} />);
    expect(screen.getByText('Estoque Bom: 2')).toBeTruthy();
    expect(screen.getByText('Estoque Problema: 1')).toBeTruthy();
  });

  it('sem unidades aguardando NF, nada de contagem', () => {
    render(<CartaoDevolucao devolucao={{ ...BASE, selos: [], destinos: { bom: 0, problema: 0 } }} />);
    expect(screen.queryByText(/^Estoque/)).toBeNull();
  });
});
```

Acrescente no **final** de `src/components/QuadroFluxo.test.tsx`:

```tsx
describe('QuadroFluxo: coluna 4 (D16)', () => {
  it('divide em Estoque Bom e Estoque Problema, com um link para cada aba', () => {
    render(<QuadroFluxo colunas={[{ numero: 4, titulo: 'Destinação Fiscal e Estoque', total: 3, estoque: { bom: 2, problema: 1 } }]} />);
    expect(screen.getByRole('link', { name: 'Estoque Bom: 2 devoluções' }).getAttribute('href')).toBe('/fluxo/etapa/4');
    expect(screen.getByRole('link', { name: 'Estoque Problema: 1 devolução' }).getAttribute('href')).toBe('/fluxo/etapa/4/problema');
  });
});
```

`src/modules/devolucoes/estoque.int.test.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { itensDevolucao, notasFiscais } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { referenciaDaNota } from '@/modules/fiscal/dominio';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { criarDevolucaoNoEstoqueTeste } from '../../../tests/helpers/fabricas-fiscal';
import { buscarDevolucoes } from './busca';
import { contarEstoque, montarQuadro } from './quadro';

const { db, sql } = criarDbTeste();
let gestor: UsuarioSessao;

beforeEach(async () => {
  await limparTabelas(sql);
  gestor = await criarUsuarioTeste(db, 'GESTOR');
});
afterAll(async () => {
  await sql.end();
});

async function codigos(destino: 'BOM' | 'PROBLEMA') {
  return (await buscarDevolucoes(db, {}, { status: ['AGUARDANDO_NF'], destino })).devolucoes.map((d) => d.codigo).sort();
}

describe('etapa 4: Estoque Bom e Estoque Problema (spec §6.4, D16)', () => {
  it('a busca separa por destino, a mesma devolução aparece nos dois e o quadro conta devoluções distintas', async () => {
    const mista = await criarDevolucaoNoEstoqueTeste(db, gestor, { unidades: [{ destino: 'BOM' }, { destino: 'PROBLEMA' }, { destino: 'AUSENTE' }] });
    const soBom = await criarDevolucaoNoEstoqueTeste(db, gestor, { unidades: [{ destino: 'BOM' }] });
    expect(await codigos('BOM')).toEqual([mista.codigo, soBom.codigo].sort());
    expect(await codigos('PROBLEMA')).toEqual([mista.codigo]);

    const { devolucoes } = await buscarDevolucoes(db, {}, { status: ['AGUARDANDO_NF'] });
    expect(devolucoes.find((d) => d.id === mista.id)).toMatchObject({ destinos: { bom: 1, problema: 1 }, situacaoNota: null });
    expect(await contarEstoque(db)).toEqual({ bom: 2, problema: 1 });
    expect((await montarQuadro(db)).find((c) => c.numero === 4)).toMatchObject({ total: 2, estoque: { bom: 2, problema: 1 } });
  });

  it('a NF ativa vai para o resumo e para o selo; unidade que saiu de Aguardando NF não conta', async () => {
    const dev = await criarDevolucaoNoEstoqueTeste(db, gestor, { unidades: [{ destino: 'BOM' }] });
    const id = randomUUID();
    await db.insert(notasFiscais).values({ id, tipo: 'DEVOLUCAO_VENDA', devolucaoId: dev.id, ambiente: 'HOMOLOGACAO', referenciaEmissor: referenciaDaNota(id) });
    const [resumo] = (await buscarDevolucoes(db, {}, { status: ['AGUARDANDO_NF'] })).devolucoes;
    expect(resumo).toMatchObject({ situacaoNota: 'PROCESSANDO', selos: [{ texto: 'NF em processamento', tom: 'destaque' }] });

    await db.update(itensDevolucao).set({ status: 'DISPONIVEL_VENDA' }).where(eq(itensDevolucao.devolucaoId, dev.id));
    expect(await contarEstoque(db)).toEqual({ bom: 0, problema: 0 });
    expect((await buscarDevolucoes(db, {}, { status: ['AGUARDANDO_NF'], destino: 'BOM' })).total).toBe(0);
  });
});
```

Rode: `npm test -- src/modules/devolucoes/selos.test.ts src/components/CartaoDevolucao.test.tsx src/components/QuadroFluxo.test.tsx && npm run test:int -- src/modules/devolucoes/estoque.int.test.ts`
Esperado: FAIL (falta `situacaoNota`, `destinos`, `estoque` e `contarEstoque`).

- [ ] **Passo 2: Selos, busca e quadro**

`src/modules/devolucoes/selos.ts` (substitui todo o conteúdo; só acrescenta `situacaoNota` e os selos da NF):

```ts
import { formatarDiaMes } from '@/lib/formatar';
import { SELO_SITUACAO_NOTA, type SituacaoNotaFiscal } from '@/modules/fiscal/dominio';
import type { Canal, StatusDevolucao } from './dominio';

export type TomSelo = 'erro' | 'atencao' | 'destaque' | 'bom' | 'neutro';
export type DadosSelo = { texto: string; tom: TomSelo };

type Entrada = {
  canal: Canal | null;
  status: StatusDevolucao;
  naoIdentificada: boolean;
  entregueSegundoCanalEm: Date | null;
  prazoConferenciaCanal: Date | null;
  /** A NF de devolução que não está cancelada (Fase 4). */
  situacaoNota?: SituacaoNotaFiscal | null;
};

const UM_DIA_MS = 24 * 60 * 60 * 1000;
const ANTES_DA_CONFERENCIA: StatusDevolucao[] = ['PENDENTE_CHEGADA', 'AGUARDANDO_CONFERENCIA', 'EM_CONFERENCIA'];
const TOM_DA_NOTA: Partial<Record<SituacaoNotaFiscal, TomSelo>> = { PROCESSANDO: 'destaque', REJEITADA: 'erro', AUTORIZADA: 'bom' };

/** Selos do cartão (spec §6.0: prazo, entregue pelo ML, NF etc.). Calculados aqui, fora do componente, porque dependem da hora. */
export function selosDaDevolucao(d: Entrada, agora: Date): DadosSelo[] {
  const selos: DadosSelo[] = [];
  if (d.naoIdentificada) selos.push({ texto: 'Não identificada', tom: 'erro' });
  if (d.entregueSegundoCanalEm && d.status === 'PENDENTE_CHEGADA') {
    selos.push({ texto: d.canal === 'MERCADO_LIVRE' ? 'Entregue (ML)' : 'Entregue pelo canal', tom: 'atencao' });
  }
  if (d.prazoConferenciaCanal && ANTES_DA_CONFERENCIA.includes(d.status)) {
    const vencendo = d.prazoConferenciaCanal.getTime() - agora.getTime() <= UM_DIA_MS;
    selos.push({ texto: `Prazo ${formatarDiaMes(d.prazoConferenciaCanal)}`, tom: vencendo ? 'erro' : 'neutro' });
  }
  const tomNota = d.situacaoNota ? TOM_DA_NOTA[d.situacaoNota] : undefined;
  if (d.situacaoNota && tomNota) selos.push({ texto: SELO_SITUACAO_NOTA[d.situacaoNota], tom: tomNota });
  return selos;
}

export const TOM_DO_STATUS: Record<StatusDevolucao, TomSelo> = {
  PENDENTE_CHEGADA: 'neutro',
  AGUARDANDO_CONFERENCIA: 'destaque',
  EM_CONFERENCIA: 'destaque',
  AGUARDANDO_NF: 'destaque',
  CONCLUIDA: 'neutro',
  CANCELADA: 'erro',
  EXTRAVIADA: 'erro',
  NO_CD_MARKETPLACE: 'atencao',
};
```

Em `src/modules/devolucoes/busca.ts` (a Parte A já mexeu no filtro de código; não toque nele), faça estas 6 trocas:

1. Acrescente o import, junto dos outros:

```ts
import type { DestinoEstoque, SituacaoNotaFiscal } from '@/modules/fiscal/dominio';
```

2. No tipo `ResumoDevolucao`, troque a linha `  selos: DadosSelo[];` por:

```ts
  selos: DadosSelo[];
  /** Unidades em AGUARDANDO_NF por destino (spec §6.4); zero fora da etapa 4. */
  destinos?: { bom: number; problema: number };
  /** A NF de devolução que não está cancelada (null = nenhuma). */
  situacaoNota?: SituacaoNotaFiscal | null;
```

3. No tipo `OpcoesBusca`, troque a linha `  agora?: Date;` por:

```ts
  agora?: Date;
  /** Etapa 4: só as devoluções com unidade AGUARDANDO_NF neste destino (abas Estoque Bom e Estoque Problema). */
  destino?: DestinoEstoque;
```

4. Em `buscarDevolucoes`, logo depois da linha que começa com `  if (opcoes.status) lista.push(`, acrescente:

```ts
  if (opcoes.destino) {
    lista.push(
      sql`exists (select 1 from "itens_devolucao" where "itens_devolucao"."devolucao_id" = "devolucoes"."id" and "itens_devolucao"."status" = 'AGUARDANDO_NF' and "itens_devolucao"."destino" = ${opcoes.destino}::destino_item)`,
    );
  }
```

5. No `select` de `linhas`, logo depois do campo `unidades: sql<number>...::int\`,`, acrescente:

```ts
      estoqueBom: sql<number>`(select count(*) from "itens_devolucao" where "itens_devolucao"."devolucao_id" = "devolucoes"."id" and "itens_devolucao"."status" = 'AGUARDANDO_NF' and "itens_devolucao"."destino" = 'BOM')::int`,
      estoqueProblema: sql<number>`(select count(*) from "itens_devolucao" where "itens_devolucao"."devolucao_id" = "devolucoes"."id" and "itens_devolucao"."status" = 'AGUARDANDO_NF' and "itens_devolucao"."destino" = 'PROBLEMA')::int`,
      situacaoNota: sql<SituacaoNotaFiscal | null>`(select "notas_fiscais"."situacao" from "notas_fiscais" where "notas_fiscais"."devolucao_id" = "devolucoes"."id" and "notas_fiscais"."situacao" <> 'CANCELADA' limit 1)`,
```

6. No `return`, troque o bloco `devolucoes: linhas.map(({ entregueSegundoCanalEm, prazoConferenciaCanal, ...resto }) => ({ ... })),` inteiro por:

```ts
    devolucoes: linhas.map(({ entregueSegundoCanalEm, prazoConferenciaCanal, estoqueBom, estoqueProblema, ...resto }) => ({
      ...resto,
      destinos: { bom: estoqueBom, problema: estoqueProblema },
      selos: selosDaDevolucao(
        {
          canal: resto.canal,
          status: resto.status,
          naoIdentificada: resto.naoIdentificada,
          entregueSegundoCanalEm,
          prazoConferenciaCanal,
          situacaoNota: resto.situacaoNota,
        },
        agora,
      ),
    })),
```

`src/modules/devolucoes/quadro.ts` (substitui todo o conteúdo):

```ts
import { eq, sql } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { devolucoes } from '@/db/schema';
import type { DestinoEstoque } from '@/modules/fiscal/dominio';
import { buscarDevolucoes, type ResumoDevolucao } from './busca';
import { statusDaEtapa } from './dominio';
import { ETAPAS } from './etapas';

export const CARTOES_POR_COLUNA = 5;

/** Nota da etapa 5 (mesmo texto da página /fluxo/etapa/5): os lotes por fornecedor chegam numa fase posterior. */
export const NOTA_ETAPA_LOTES = 'Os lotes por fornecedor aparecem aqui quando a conferência estiver pronta.';

/** Devoluções em AGUARDANDO_NF com alguma unidade em cada destino (spec §6.4, D16). A mesma pode contar nas duas. */
export type ContagemEstoque = { bom: number; problema: number };

export type ColunaQuadro = {
  numero: number;
  titulo: string;
  total: number;
  cartoes: ResumoDevolucao[];
  href: string;
  /** Só na coluna 4: a divisão Estoque Bom / Estoque Problema. */
  estoque?: ContagemEstoque;
};

function temNoDestino(destino: DestinoEstoque) {
  return sql`exists (select 1 from "itens_devolucao" where "itens_devolucao"."devolucao_id" = "devolucoes"."id" and "itens_devolucao"."status" = 'AGUARDANDO_NF' and "itens_devolucao"."destino" = ${destino}::destino_item)`;
}

export async function contarEstoque(db: DbOuTx): Promise<ContagemEstoque> {
  const [linha] = await db
    .select({
      bom: sql<number>`(count(*) filter (where ${temNoDestino('BOM')}))::int`,
      problema: sql<number>`(count(*) filter (where ${temNoDestino('PROBLEMA')}))::int`,
    })
    .from(devolucoes)
    .where(eq(devolucoes.status, 'AGUARDANDO_NF'));
  return { bom: linha?.bom ?? 0, problema: linha?.problema ?? 0 };
}

/** Uma coluna por etapa do PDF (spec §6.0), com o total e os primeiros cartões. A coluna 4 traz a divisão do estoque. */
export async function montarQuadro(db: DbOuTx, agora: Date = new Date()): Promise<ColunaQuadro[]> {
  return Promise.all(
    ETAPAS.map(async (etapa): Promise<ColunaQuadro> => {
      const href = `/fluxo/etapa/${etapa.numero}`;
      const status = statusDaEtapa(etapa.numero);
      if (status.length === 0) return { numero: etapa.numero, titulo: etapa.titulo, total: 0, cartoes: [], href };
      const { devolucoes: cartoes, total } = await buscarDevolucoes(
        db,
        {},
        { status, ordem: etapa.numero === 2 ? 'chegada' : 'recentes', porPagina: CARTOES_POR_COLUNA, agora },
      );
      const coluna: ColunaQuadro = { numero: etapa.numero, titulo: etapa.titulo, total, cartoes, href };
      return etapa.numero === 4 ? { ...coluna, estoque: await contarEstoque(db) } : coluna;
    }),
  );
}
```

Rode: `npm test -- src/modules/devolucoes/selos.test.ts && npm run test:int -- src/modules/devolucoes`
Esperado: PASS (inclusive o `quadro.int.test.ts` da Fase 1, que não muda).

- [ ] **Passo 3: Cartão, quadro e divisão do estoque**

`src/components/fiscal/DivisaoEstoque.tsx`:

```tsx
import Link from 'next/link';
import { ABAS_ESTOQUE } from '@/modules/fiscal/dominio';

const CORES = { BOM: 'bg-bom-suave text-bom', PROBLEMA: 'bg-problema-suave text-problema' } as const;

function rotulo(total: number): string {
  return `${total} ${total === 1 ? 'devolução' : 'devoluções'}`;
}

/** A coluna 4 se divide em Estoque Bom e Estoque Problema (spec §6.0 e §6.4, D16). A mesma devolução pode contar nas duas. */
export function DivisaoEstoque({ bom, problema, empilhada = false }: { bom: number; problema: number; empilhada?: boolean }) {
  const totais = { BOM: bom, PROBLEMA: problema };
  return (
    <nav aria-label="Estoque Bom e Estoque Problema" className={empilhada ? 'flex flex-col gap-1.5' : 'grid grid-cols-2 gap-2'}>
      {ABAS_ESTOQUE.map((aba) => (
        <Link
          key={aba.destino}
          href={aba.href}
          aria-label={`${aba.rotulo}: ${rotulo(totais[aba.destino])}`}
          className={`flex min-h-11 items-center justify-between gap-2 rounded-lg px-3 text-sm font-semibold ${CORES[aba.destino]}`}
        >
          <span>{aba.rotulo}</span>
          <span>{totais[aba.destino]}</span>
        </Link>
      ))}
    </nav>
  );
}
```

`src/components/CartaoDevolucao.tsx` (substitui todo o conteúdo):

```tsx
import Link from 'next/link';
import type { ResumoDevolucao } from '@/modules/devolucoes/busca';
import { ROTULO_CANAL, ROTULO_STATUS } from '@/modules/devolucoes/dominio';
import { TOM_DO_STATUS } from '@/modules/devolucoes/selos';
import { Selo } from './Selo';

const CONTAGEM = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold';

/** Cartão do quadro e das listas (protótipo C-Painel): código, canal, produto, rastreio, selos e, na etapa 4, o estoque. */
export function CartaoDevolucao({ devolucao: d }: { devolucao: ResumoDevolucao }) {
  const outras = d.unidades - 1;
  const destinos = d.destinos && (d.destinos.bom > 0 || d.destinos.problema > 0) ? d.destinos : null;
  return (
    <Link
      href={`/fluxo/devolucoes/${d.codigo}`}
      className="flex min-h-11 flex-col gap-1.5 rounded-xl border border-borda bg-superficie p-3 hover:border-destaque"
    >
      <span className="flex items-center justify-between gap-2">
        <span className="font-mono text-[13px] font-semibold">{d.codigo}</span>
        <span className="text-xs font-semibold text-texto-2">{d.canal ? ROTULO_CANAL[d.canal] : 'Canal a identificar'}</span>
      </span>
      <span className="text-sm">
        {d.produto ?? 'Sem itens cadastrados'}
        {outras > 0 ? ` + ${outras} ${outras === 1 ? 'unidade' : 'unidades'}` : ''}
      </span>
      <span className="break-all font-mono text-xs text-texto-2">{d.rastreio ?? 'Sem rastreio'}</span>
      <span className="flex flex-wrap gap-1.5">
        <Selo texto={ROTULO_STATUS[d.status]} tom={TOM_DO_STATUS[d.status]} />
        {d.selos.map((s) => (
          <Selo key={s.texto} texto={s.texto} tom={s.tom} />
        ))}
      </span>
      {destinos && (
        <span className="flex flex-wrap gap-1.5">
          {destinos.bom > 0 && <span className={`${CONTAGEM} bg-bom-suave text-bom`}>{`Estoque Bom: ${destinos.bom}`}</span>}
          {destinos.problema > 0 && <span className={`${CONTAGEM} bg-problema-suave text-problema`}>{`Estoque Problema: ${destinos.problema}`}</span>}
        </span>
      )}
    </Link>
  );
}
```

`src/components/QuadroFluxo.tsx` (substitui todo o conteúdo; só acrescenta `estoque` e a `DivisaoEstoque`):

```tsx
import Link from 'next/link';
import type { ResumoDevolucao } from '@/modules/devolucoes/busca';
import { CartaoDevolucao } from './CartaoDevolucao';
import { VAZIO } from './estilos';
import { DivisaoEstoque } from './fiscal/DivisaoEstoque';

export type ColunaFluxo = {
  numero: number;
  titulo: string;
  total: number;
  cartoes?: ResumoDevolucao[];
  href?: string;
  /** Texto curto no lugar do aviso de vazio (etapa 5: os lotes chegam numa fase posterior). */
  nota?: string;
  /** Coluna 4: Estoque Bom e Estoque Problema (spec §6.0, D16). */
  estoque?: { bom: number; problema: number };
};

export function rotuloTotal(total: number): string {
  return `${total} ${total === 1 ? 'devolução' : 'devoluções'}`;
}

/**
 * Painel da direção C no computador: uma coluna por etapa do PDF (spec §6.0), com os cartões.
 * A rolagem lateral fica dentro da caixa. No celular a página usa o EtapasCelular.
 */
export function QuadroFluxo({ colunas }: { colunas: ColunaFluxo[] }) {
  return (
    <div className="relative overflow-x-auto pb-1.5">
      <div className="flex min-w-[1300px] items-start gap-3.5">
        {colunas.map((coluna) => {
          const cartoes = coluna.cartoes ?? [];
          const escondidas = coluna.total - cartoes.length;
          return (
            <section
              key={coluna.numero}
              aria-labelledby={`coluna-${coluna.numero}`}
              className="flex flex-[1_0_248px] flex-col gap-2.5 rounded-xl bg-coluna p-3"
            >
              <div className="flex items-start gap-2 px-1 pb-1 pt-0.5">
                <span aria-hidden="true" className="flex size-6 flex-none items-center justify-center rounded-full bg-destaque text-xs font-bold text-white">
                  {coluna.numero}
                </span>
                <h2 id={`coluna-${coluna.numero}`} className="flex-1 text-sm font-bold leading-snug">
                  {coluna.titulo}
                </h2>
                <span className="text-[13px] font-semibold text-texto-2">
                  <span aria-hidden="true">{coluna.total}</span>
                  <span className="sr-only">{rotuloTotal(coluna.total)}</span>
                </span>
              </div>
              {coluna.estoque && <DivisaoEstoque bom={coluna.estoque.bom} problema={coluna.estoque.problema} empilhada />}
              {coluna.total === 0 && <p className={VAZIO}>{coluna.nota ?? 'Nenhuma devolução nesta etapa.'}</p>}
              {cartoes.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {cartoes.map((d) => (
                    <li key={d.id}>
                      <CartaoDevolucao devolucao={d} />
                    </li>
                  ))}
                </ul>
              )}
              {coluna.href && coluna.total > 0 && (
                <Link
                  href={coluna.href}
                  className="flex min-h-11 items-center justify-center rounded-lg text-sm font-semibold text-destaque-escuro hover:bg-superficie"
                >
                  {escondidas > 0 ? `+ ${rotuloTotal(escondidas)}` : 'Ver lista'}
                  {escondidas > 0 && ' '}
                  <span className="sr-only">{escondidas > 0 ? `em ${coluna.titulo}` : `: ${coluna.titulo}`}</span>
                </Link>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
```

`src/app/(app)/fluxo/page.tsx` (substitui todo o conteúdo; confira antes com `git diff 4640ae2 -- "src/app/(app)/fluxo/page.tsx"` que a Parte A não mexeu nele):

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { BuscaAvancada } from '@/components/BuscaAvancada';
import { EtapasCelular } from '@/components/EtapasCelular';
import { QuadroFluxo } from '@/components/QuadroFluxo';
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from '@/components/estilos';
import { DivisaoEstoque } from '@/components/fiscal/DivisaoEstoque';
import { obterDb } from '@/db';
import { primeiroValor, type ParametrosBusca } from '@/lib/parametros';
import { pode } from '@/modules/auth/permissoes';
import { exigirPermissao } from '@/modules/auth/servidor';
import { ETAPAS } from '@/modules/devolucoes/etapas';
import { montarQuadro, NOTA_ETAPA_LOTES } from '@/modules/devolucoes/quadro';

export const metadata: Metadata = { title: 'Fluxo · Gestão de Devoluções' };

export default async function PaginaFluxo({ searchParams }: { searchParams: Promise<ParametrosBusca> }) {
  const usuario = await exigirPermissao('ver_listas');
  const textoEtapa = primeiroValor((await searchParams).etapa);
  const pedida = /^\d+$/.test(textoEtapa) ? Number(textoEtapa) : 0;
  const quadro = await montarQuadro(obterDb());
  // Coluna 4: os links Estoque Bom e Estoque Problema substituem o "Ver lista" (spec §6.4, D16).
  const colunas = quadro.map((c) => (c.numero === 5 ? { ...c, nota: NOTA_ETAPA_LOTES } : c.numero === 4 ? { ...c, href: undefined } : c));
  const estoque = quadro.find((c) => c.numero === 4)?.estoque;
  // Sem etapa válida na URL, o celular abre a primeira etapa que tem devoluções (ou a 1).
  const selecionada = ETAPAS.some((e) => e.numero === pedida) ? pedida : (colunas.find((c) => c.total > 0)?.numero ?? 1);
  const podeOperar = pode(usuario.perfil, 'operar_devolucoes');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Fluxo de devoluções</h1>
        {podeOperar && (
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <Link href="/fluxo/recebimento" className={BOTAO_PRIMARIO}>
              Recebimento
            </Link>
            <Link href="/fluxo/devolucoes/nova" className={BOTAO_SECUNDARIO}>
              Nova devolução
            </Link>
          </div>
        )}
      </div>
      <BuscaAvancada acao="/fluxo/busca" filtros={{}} />
      <div className="flex flex-col gap-3 md:hidden">
        <EtapasCelular colunas={colunas} selecionada={selecionada} />
        {/* O EtapasCelular é congelado na janela das fases: a divisão do estoque vem logo depois dele. */}
        {selecionada === 4 && estoque && <DivisaoEstoque bom={estoque.bom} problema={estoque.problema} />}
      </div>
      <div className="hidden md:block">
        <QuadroFluxo colunas={colunas} />
      </div>
    </div>
  );
}
```

Rode: `npm test`
Esperado: PASS.

- [ ] **Passo 4: Páginas da etapa 4 e emissão em lote**

`src/modules/fiscal/situacao.ts` (a Tarefa 10 substitui com a versão completa):

```ts
import { inArray } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { devolucoes } from '@/db/schema';

/** id → código DEV, para as mensagens da emissão em lote. */
export async function codigosDasDevolucoes(db: DbOuTx, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const linhas = await db.select({ id: devolucoes.id, codigo: devolucoes.codigo }).from(devolucoes).where(inArray(devolucoes.id, ids));
  return new Map(linhas.map((l) => [l.id, l.codigo]));
}
```

`src/app/(app)/fluxo/etapa/4/acoes.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { obterDb } from '@/db';
import { ehUuid } from '@/lib/uuid';
import { exigirPermissao } from '@/modules/auth/servidor';
import { ErroDevolucao } from '@/modules/devolucoes/erros';
import { solicitarEmissao } from '@/modules/fiscal/emissao';
import { ErroFiscal } from '@/modules/fiscal/erros';
import { codigosDasDevolucoes } from '@/modules/fiscal/situacao';

export type EstadoEmissao = { erros: string[]; ok: string | null };

/** Uma NF por devolução (spec §6.4). Limite por envio, para a ação responder rápido. */
const MAXIMO_POR_VEZ = 30;

export async function emitirNotasAcao(_anterior: EstadoEmissao, dados: FormData): Promise<EstadoEmissao> {
  const usuario = await exigirPermissao('gerir_fiscal');
  const ids = [...new Set(dados.getAll('devolucao').map(String).filter(ehUuid))];
  if (ids.length === 0) return { erros: ['Selecione pelo menos uma devolução.'], ok: null };
  if (ids.length > MAXIMO_POR_VEZ) return { erros: [`Selecione no máximo ${MAXIMO_POR_VEZ} devoluções por vez.`], ok: null };
  const db = obterDb();
  const codigos = await codigosDasDevolucoes(db, ids);
  const erros: string[] = [];
  const enviadas: string[] = [];
  for (const id of ids) {
    const codigo = codigos.get(id);
    if (!codigo) {
      erros.push('Devolução não encontrada.');
      continue;
    }
    try {
      await solicitarEmissao(db, { tipo: 'DEVOLUCAO_VENDA', devolucaoId: id }, usuario);
      enviadas.push(codigo);
    } catch (erro) {
      if (erro instanceof ErroFiscal || erro instanceof ErroDevolucao) erros.push(`${codigo}: ${erro.message}`);
      else throw erro;
    }
  }
  revalidatePath('/fluxo');
  revalidatePath('/fluxo/etapa/4');
  revalidatePath('/fluxo/etapa/4/problema');
  return { erros, ok: enviadas.length > 0 ? `Emissão enviada: ${enviadas.join(', ')}. A SEFAZ responde em alguns segundos.` : null };
}
```

`src/app/(app)/fluxo/etapa/4/ListaEstoque.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { CartaoDevolucao } from '@/components/CartaoDevolucao';
import { ListaErros } from '@/components/ListaErros';
import { MensagemSucesso } from '@/components/MensagemSucesso';
import { RodapeFormulario } from '@/components/RodapeFormulario';
import { BOTAO_PRIMARIO } from '@/components/estilos';
import { useEnvioFormulario } from '@/components/useEnvioFormulario';
import type { ResumoDevolucao } from '@/modules/devolucoes/busca';
import type { EstadoEmissao } from './acoes';

const ID_ERROS = 'erros-emissao';

type Props = {
  devolucoes: ResumoDevolucao[];
  /** Ids sem NF ativa: só elas têm a caixa de seleção. */
  selecionaveis: string[];
  acao: (anterior: EstadoEmissao, dados: FormData) => Promise<EstadoEmissao>;
};

/** Spec §6.4: o Fiscal seleciona uma ou mais devoluções e clica em "Emitir NF de devolução" (uma NF por devolução). */
export function ListaEstoque({ devolucoes, selecionaveis, acao }: Props) {
  const [estado, aoEnviar, pendente] = useEnvioFormulario(acao, { erros: [], ok: null }, ID_ERROS);
  const [marcadas, setMarcadas] = useState<string[]>([]);
  // Depois da emissão a lista volta do servidor e as que ganharam NF deixam de ser selecionáveis.
  const efetivas = marcadas.filter((id) => selecionaveis.includes(id));

  function alternar(id: string, marcada: boolean) {
    setMarcadas((atual) => (marcada ? [...atual.filter((x) => x !== id), id] : atual.filter((x) => x !== id)));
  }

  return (
    <form onSubmit={aoEnviar} aria-label="Emitir NF de devolução" className="flex flex-col gap-3">
      {estado.ok && <MensagemSucesso key={estado.ok} texto={estado.ok} />}
      <ListaErros erros={estado.erros} id={ID_ERROS} />
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {devolucoes.map((d) => (
          <li key={d.id} className="flex items-stretch gap-2">
            {selecionaveis.includes(d.id) ? (
              <label className="flex min-h-11 w-11 flex-none cursor-pointer items-center justify-center rounded-xl border border-borda bg-superficie">
                <input
                  type="checkbox"
                  name="devolucao"
                  value={d.id}
                  checked={efetivas.includes(d.id)}
                  onChange={(evento) => alternar(d.id, evento.currentTarget.checked)}
                  className="size-5"
                />
                <span className="sr-only">{`Selecionar ${d.codigo}`}</span>
              </label>
            ) : (
              <span aria-hidden="true" className="w-11 flex-none" />
            )}
            <div className="min-w-0 flex-1">
              <CartaoDevolucao devolucao={d} />
            </div>
          </li>
        ))}
      </ul>
      <RodapeFormulario>
        <button type="submit" disabled={pendente || efetivas.length === 0} className={BOTAO_PRIMARIO}>
          {pendente ? 'Enviando…' : `Emitir NF de devolução${efetivas.length > 0 ? ` (${efetivas.length})` : ''}`}
        </button>
      </RodapeFormulario>
    </form>
  );
}
```

`src/components/fiscal/FormularioXmls.tsx`:

```tsx
import { BOTAO_SECUNDARIO, CAMPO, CARTAO, ROTULO } from '../estilos';

/** Spec §8.7: ZIP com os XMLs do período para importar no Bitbrain. Formulário GET: o navegador baixa o arquivo. */
export function FormularioXmls({ de, ate }: { de: string; ate: string }) {
  return (
    <details className={CARTAO}>
      <summary className="flex min-h-11 cursor-pointer items-center text-base font-bold">Baixar XMLs do período</summary>
      <form method="get" action="/api/fiscal/xmls" className="mt-3 flex flex-col gap-3">
        <p className="text-sm text-texto-2">
          ZIP com os XMLs das NF autorizadas e dos cancelamentos no período (até 31 dias), para importar no Bitbrain.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="xmls-de" className={ROTULO}>
              De
            </label>
            <input id="xmls-de" name="de" type="date" required defaultValue={de} className={CAMPO} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="xmls-ate" className={ROTULO}>
              Até
            </label>
            <input id="xmls-ate" name="ate" type="date" required defaultValue={ate} className={CAMPO} />
          </div>
        </div>
        <button type="submit" className={BOTAO_SECUNDARIO}>
          Baixar XMLs
        </button>
      </form>
    </details>
  );
}
```

`src/app/(app)/fluxo/etapa/4/PaginaEstoque.tsx`:

```tsx
import Link from 'next/link';
import { BuscaAvancada } from '@/components/BuscaAvancada';
import { CartaoDevolucao } from '@/components/CartaoDevolucao';
import { Paginacao } from '@/components/Paginacao';
import { ALERTA_ATENCAO, ALERTA_ERRO, LINK_VOLTAR, VAZIO } from '@/components/estilos';
import { FormularioXmls } from '@/components/fiscal/FormularioXmls';
import { obterDb } from '@/db';
import { lerPagina, primeiroValor, type ParametrosBusca } from '@/lib/parametros';
import { pode } from '@/modules/auth/permissoes';
import { exigirPermissao } from '@/modules/auth/servidor';
import { buscarDevolucoes } from '@/modules/devolucoes/busca';
import { ETAPAS } from '@/modules/devolucoes/etapas';
import { filtrosParaQuery, lerFiltros, POR_PAGINA_DEVOLUCOES } from '@/modules/devolucoes/filtros';
import { contarEstoque } from '@/modules/devolucoes/quadro';
import { pendenciasFiscais } from '@/modules/fiscal/configuracao';
import { ABAS_ESTOQUE, type DestinoEstoque } from '@/modules/fiscal/dominio';
import { MENSAGEM_ERRO_XMLS, periodoDoMesAtual } from '@/modules/fiscal/periodo';
import { emitirNotasAcao } from './acoes';
import { ListaEstoque } from './ListaEstoque';

const TITULO = ETAPAS.find((e) => e.numero === 4)?.titulo ?? 'Destinação Fiscal e Estoque';
const ABA = 'flex min-h-11 items-center justify-center rounded-full border px-4 text-[15px] font-semibold';

/** Etapa 4 do PDF (spec §6.4): abas Estoque Bom e Estoque Problema, ambas com as devoluções em AGUARDANDO_NF. */
export async function PaginaEstoque({ aba, searchParams }: { aba: DestinoEstoque; searchParams: Promise<ParametrosBusca> }) {
  const usuario = await exigirPermissao('ver_listas');
  const parametros = await searchParams;
  const filtros = lerFiltros(parametros);
  const pagina = lerPagina(parametros);
  const atual = ABAS_ESTOQUE.find((a) => a.destino === aba) ?? ABAS_ESTOQUE[0];
  const podeEmitir = pode(usuario.perfil, 'gerir_fiscal');
  const db = obterDb();
  const [{ devolucoes, total }, contagem, pendencias] = await Promise.all([
    buscarDevolucoes(db, filtros, { status: ['AGUARDANDO_NF'], destino: aba, ordem: 'recentes', pagina }),
    contarEstoque(db),
    podeEmitir ? pendenciasFiscais(db) : Promise.resolve<string[]>([]),
  ]);
  const totais = { BOM: contagem.bom, PROBLEMA: contagem.problema };
  const selecionaveis = devolucoes.filter((d) => !d.situacaoNota).map((d) => d.id);
  const erroXmls = MENSAGEM_ERRO_XMLS[primeiroValor(parametros.xmls)];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <Link href="/fluxo" className={`${LINK_VOLTAR} -mb-2 self-start`}>
        ← Fluxo
      </Link>
      <h1 className="text-xl font-bold">{TITULO}</h1>
      <nav aria-label="Abas do estoque" className="grid grid-cols-2 gap-2 sm:flex">
        {ABAS_ESTOQUE.map((a) => {
          const ativa = a.destino === aba;
          return (
            <Link
              key={a.destino}
              href={a.href}
              aria-current={ativa ? 'page' : undefined}
              className={`${ABA} ${ativa ? 'border-destaque bg-destaque text-white' : 'border-borda-campo bg-superficie text-texto'}`}
            >
              {`${a.rotulo} (${totais[a.destino]})`}
            </Link>
          );
        })}
      </nav>
      {pendencias.length > 0 && (
        <section aria-labelledby="titulo-pendencias" className={`${ALERTA_ATENCAO} flex flex-col gap-1`}>
          <h2 id="titulo-pendencias" className="font-bold">
            A emissão de NF está bloqueada
          </h2>
          <ul className="list-disc pl-5">
            {pendencias.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <Link href="/configuracoes/fiscal" className="inline-flex min-h-11 items-center self-start font-semibold underline">
            Abrir Configurações › Fiscal
          </Link>
        </section>
      )}
      {erroXmls && (
        <p role="alert" className={ALERTA_ERRO}>
          {erroXmls}
        </p>
      )}
      <BuscaAvancada acao={atual.href} filtros={filtros} />
      <p className="text-sm text-texto-2">
        {total} {total === 1 ? 'devolução' : 'devoluções'} em {atual.rotulo}
      </p>
      {devolucoes.length === 0 ? (
        <p className={VAZIO}>Nenhuma devolução em {atual.rotulo}.</p>
      ) : podeEmitir ? (
        <ListaEstoque devolucoes={devolucoes} selecionaveis={selecionaveis} acao={emitirNotasAcao} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {devolucoes.map((d) => (
            <li key={d.id}>
              <CartaoDevolucao devolucao={d} />
            </li>
          ))}
        </ul>
      )}
      <Paginacao
        pagina={pagina}
        total={total}
        porPagina={POR_PAGINA_DEVOLUCOES}
        hrefDaPagina={(p) => `${atual.href}${filtrosParaQuery(filtros, { pagina: String(p) })}`}
      />
      {podeEmitir && <FormularioXmls {...periodoDoMesAtual()} />}
    </div>
  );
}
```

`src/app/(app)/fluxo/etapa/4/page.tsx` (rota estática: tem prioridade sobre `[numero]`, contrato §3):

```tsx
import type { Metadata } from 'next';
import type { ParametrosBusca } from '@/lib/parametros';
import { PaginaEstoque } from './PaginaEstoque';

export const metadata: Metadata = { title: 'Estoque Bom · Destinação Fiscal e Estoque · Gestão de Devoluções' };

export default function PaginaEstoqueBom({ searchParams }: { searchParams: Promise<ParametrosBusca> }) {
  return <PaginaEstoque aba="BOM" searchParams={searchParams} />;
}
```

`src/app/(app)/fluxo/etapa/4/problema/page.tsx`:

```tsx
import type { Metadata } from 'next';
import type { ParametrosBusca } from '@/lib/parametros';
import { PaginaEstoque } from '../PaginaEstoque';

export const metadata: Metadata = { title: 'Estoque Problema · Destinação Fiscal e Estoque · Gestão de Devoluções' };

export default function PaginaEstoqueProblema({ searchParams }: { searchParams: Promise<ParametrosBusca> }) {
  return <PaginaEstoque aba="PROBLEMA" searchParams={searchParams} />;
}
```

- [ ] **Passo 5: Apoio do e2e e teste ponta a ponta**

`tests/e2e/apoio-fiscal.ts` (substitui todo o conteúdo):

```ts
import {
  configurarFiscalTeste,
  criarDevolucaoNoEstoqueTeste,
  inserirNotaVendaTeste,
  limparFiscalTeste,
  type UnidadeEstoqueTeste,
} from '../helpers/fabricas-fiscal';
import { codigoUnico, comBanco, usuarioPorEmail } from './apoio';
import { USUARIOS_E2E } from './dados';

/** Deixa a emissão pronta (empresa em SP, Simples, homologação e as 6 regras sugeridas). Cada spec chama no começo. */
export async function prepararFiscal(opcoes: Parameters<typeof configurarFiscalTeste>[2] = {}): Promise<void> {
  await comBanco(async (db) => {
    const gestor = await usuarioPorEmail(db, USUARIOS_E2E.gestor.email);
    await configurarFiscalTeste(db, gestor, opcoes);
  });
}

export async function limparFiscal(): Promise<void> {
  await comBanco((db) => limparFiscalTeste(db));
}

/**
 * Devolução em AGUARDANDO_NF gravada direto no banco (o estado que a conferência da Fase 2 deixa), com um SKU único por
 * execução (o banco do e2e é o mesmo para o computador e o celular). Por padrão grava também a NF de venda com esse SKU;
 * `codigoNaVenda` troca o código do item da venda (para o Fiscal ter de escolher, D14).
 */
export async function devolucaoNoEstoque(opcoes: {
  destinos: UnidadeEstoqueTeste['destino'][];
  comNotaVenda?: boolean;
  codigoNaVenda?: string;
}): Promise<{ id: string; codigo: string; sku: string; itens: { id: string; unidade: number; sku: string }[] }> {
  return comBanco(async (db) => {
    const gestor = await usuarioPorEmail(db, USUARIOS_E2E.gestor.email);
    const sku = codigoUnico('SKU');
    const dev = await criarDevolucaoNoEstoqueTeste(db, gestor, { unidades: opcoes.destinos.map((destino) => ({ sku, destino })) });
    if (opcoes.comNotaVenda ?? true) {
      const fisicas = opcoes.destinos.filter((d) => d !== 'AUSENTE').length;
      await inserirNotaVendaTeste(db, dev.id, { itens: [{ codigo: opcoes.codigoNaVenda ?? sku, quantidade: Math.max(1, fisicas), valorUnitario: 50 }] });
    }
    return { id: dev.id, codigo: dev.codigo, sku, itens: dev.itens };
  });
}
```

`tests/e2e/fiscal-etapa4.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { ehCelular, entrarComo, naFrente, semRolagemLateral } from './apoio';
import { devolucaoNoEstoque, prepararFiscal } from './apoio-fiscal';
import { USUARIOS_E2E } from './dados';

test('a coluna 4 se divide em Estoque Bom e Estoque Problema; a devolução com os dois destinos aparece nas duas abas', async ({ page }, testInfo) => {
  await prepararFiscal();
  const mista = await devolucaoNoEstoque({ destinos: ['BOM', 'PROBLEMA'] });
  const soProblema = await devolucaoNoEstoque({ destinos: ['PROBLEMA', 'AUSENTE'] });
  await entrarComo(page, USUARIOS_E2E.operador);
  await page.goto(ehCelular(testInfo) ? '/fluxo?etapa=4' : '/fluxo');
  await expect(page.getByRole('link', { name: /^Estoque Bom: \d+ devoluç/ })).toBeVisible();
  await semRolagemLateral(page);

  await page.getByRole('link', { name: /^Estoque Problema: \d+ devoluç/ }).click();
  await expect(page).toHaveURL(/\/fluxo\/etapa\/4\/problema$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Destinação Fiscal e Estoque' })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Estoque Problema \(\d+\)$/ })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('link', { name: new RegExp(mista.codigo) })).toContainText('Estoque Problema: 1');
  await expect(page.getByRole('link', { name: new RegExp(soProblema.codigo) })).toBeVisible();

  await page.getByRole('link', { name: /^Estoque Bom \(\d+\)$/ }).click();
  await expect(page).toHaveURL(/\/fluxo\/etapa\/4$/);
  await expect(page.getByRole('link', { name: new RegExp(mista.codigo) })).toContainText('Estoque Bom: 1');
  await expect(page.getByRole('link', { name: new RegExp(soProblema.codigo) })).toHaveCount(0);
  // O Operador vê as listas, mas não emite NF (spec §6.9).
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Emitir NF/ })).toHaveCount(0);
  await semRolagemLateral(page);
});

test('o Fiscal seleciona e emite a NF de devolução; o worker autoriza e a devolução sai da etapa 4', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await prepararFiscal();
  const dev = await devolucaoNoEstoque({ destinos: ['BOM'] });
  await entrarComo(page, USUARIOS_E2E.fiscal);
  await page.goto('/fluxo/etapa/4');
  const selecao = page.getByRole('checkbox', { name: `Selecionar ${dev.codigo}` });
  const alvo = await page.locator('label', { has: selecao }).boundingBox();
  expect(alvo?.height).toBeGreaterThanOrEqual(44);
  expect(alvo?.width).toBeGreaterThanOrEqual(44);
  await selecao.check();
  const emitir = page.getByRole('button', { name: 'Emitir NF de devolução (1)' });
  if (ehCelular(testInfo)) await naFrente(emitir);
  await emitir.click();
  await expect(page.getByRole('status')).toContainText(`Emissão enviada: ${dev.codigo}`);
  await expect(page.getByRole('checkbox', { name: `Selecionar ${dev.codigo}` })).toHaveCount(0);
  await semRolagemLateral(page);

  // O worker do e2e envia, consulta e autoriza (o falso autoriza na 2ª consulta, uns 10 s depois): a devolução fica Concluída.
  await expect
    .poll(
      async () => {
        await page.reload();
        return page.getByRole('link', { name: new RegExp(dev.codigo) }).count();
      },
      { timeout: 60_000, intervals: [3_000] },
    )
    .toBe(0);
});

test('sem a regra fiscal salva, a emissão é recusada (D13) e o erro recebe o foco', async ({ page }) => {
  await prepararFiscal({ semRegras: true });
  try {
    const dev = await devolucaoNoEstoque({ destinos: ['BOM'] });
    await entrarComo(page, USUARIOS_E2E.fiscal);
    await page.goto('/fluxo/etapa/4');
    await expect(page.getByRole('heading', { name: 'A emissão de NF está bloqueada' })).toBeVisible();
    await expect(page.getByText('Falta a regra fiscal: Devolução de venda, dentro do estado')).toBeVisible();
    await page.getByRole('checkbox', { name: `Selecionar ${dev.codigo}` }).check();
    await page.getByRole('button', { name: 'Emitir NF de devolução (1)' }).click();
    const erros = page.locator('#erros-emissao');
    await expect(erros).toHaveText(`${dev.codigo}: Falta a regra fiscal: Devolução de venda, dentro do estado`);
    await expect(erros).toBeFocused();
  } finally {
    await prepararFiscal();
  }
});

test('ZIP de um período sem notas: a etapa 4 explica em vez de baixar um arquivo vazio', async ({ page }) => {
  await prepararFiscal();
  await entrarComo(page, USUARIOS_E2E.fiscal);
  await page.goto('/fluxo/etapa/4');
  const xmls = page.locator('details', { hasText: 'Baixar XMLs do período' });
  await xmls.getByText('Baixar XMLs do período').click();
  await xmls.getByLabel('De', { exact: true }).fill('2020-01-01');
  await xmls.getByLabel('Até', { exact: true }).fill('2020-01-31');
  await xmls.getByRole('button', { name: 'Baixar XMLs' }).click();
  await expect(page).toHaveURL(/\/fluxo\/etapa\/4\?xmls=vazio$/);
  await expect(page.getByRole('alert')).toHaveText('Nenhum XML de NF autorizada ou cancelada nesse período.');
  await semRolagemLateral(page);
});
```

Rode: `npm run typecheck && npm run lint && npm run test:e2e -- tests/e2e/fiscal-etapa4.spec.ts tests/e2e/fluxo.spec.ts`
Esperado: PASS nos dois projetos (o `fluxo.spec.ts` da Fase 1 continua passando).

- [ ] **Passo 6: Rodar tudo**

Rode: `npm test && npm run test:int && npm run typecheck && npm run lint`
Esperado: tudo PASS.

- [ ] **Passo 7: Commit**

```bash
cd "/c/Users/idmpc/devolucoes-wt/fase-4"
git add -A
git commit -m "feat: etapa 4 com abas Estoque Bom e Estoque Problema, emissão de NF em lote, ZIP de XMLs e divisão da coluna 4 do quadro" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 10: Seção Fiscal no detalhe da devolução (NF de venda, escolha do item, emitir, reenviar, cancelar, XML e DANFE)

**Arquivos:**
- Modificar (substituir todo o conteúdo): `src/modules/fiscal/situacao.ts`, `src/app/(app)/fluxo/devolucoes/[codigo]/secoes/SecaoFiscal.tsx` (mantenha o tipo de export que a Parte A criou: este plano usa o export nomeado `SecaoFiscal`)
- Criar: `src/app/(app)/fluxo/devolucoes/[codigo]/secoes/acoes-fiscal.ts`, `src/components/fiscal/tipos.ts`, `src/components/fiscal/AtualizarEnquantoProcessa.tsx`, `src/components/fiscal/BlocosFiscais.tsx`
- Testes: `src/modules/fiscal/situacao.int.test.ts`, `tests/e2e/fiscal-nf.spec.ts`

**Interfaces:**
- Consome: `carregarDadosDevolucao` (Tarefa 6), `casarItens`, `chaveAlvo`, `lerChaveAlvo`, `capacidade`, `vagasRestantes` (Tarefa 6), `escolherItemNotaVenda` (Tarefa 6), `registrarNotaVenda`, `buscarNotaVendaNoCanal`, `removerNotaVenda`, `TAMANHO_MAXIMO_XML` (Tarefa 5), `solicitarEmissao`, `reenviarNota`, `cancelarNota` (Tarefas 7 e 8), `obterArmazenamento().urlTemporaria` (contrato §5.2; spec §9: link de 10 min), `numeroDaChave`, `prazoDeCancelamento`, `dentroDoPrazoDeCancelamento`, `SELO_SITUACAO_NOTA`, `ROTULO_ORIGEM_NOTA_VENDA` (Tarefa 1), `formatarDataHora`, `Selo`, `MensagemSucesso`, `ListaErros`, `useEnvioFormulario` (Fase 1).
- Produz:
  - `situacao.ts`: `codigosDasDevolucoes` (igual à Tarefa 9), `type VistaNota`, `type VistaNotaVenda`, `type VistaUnidade`, `type OpcaoItemVenda`, `type SituacaoFiscal`, `vistaDaNota(nota, serieConfigurada, agora)`, `obterSituacaoFiscal(db, devolucaoId, agora?)`, `notaPertenceADevolucao(db, notaFiscalId, devolucaoId)`
  - `components/fiscal/tipos.ts`: `type EstadoAcaoFiscal = { erros: string[]; ok: string | null }`, `ESTADO_INICIAL_FISCAL`
  - `BlocosFiscais.tsx`: `BlocoNotaDevolucao`, `BlocoNotaVenda`, `BlocoItensVenda` (cada bloco tem uma ação só, com o campo `operacao`, e uma caixa de mensagem que não some quando o botão some)
  - ações `acaoNotaDevolucao(devolucaoId, codigo, ...)` (`operacao` = `emitir` | `reenviar` | `cancelar`), `acaoNotaVenda(devolucaoId, codigo, ...)` (`anexar` | `buscar` | `remover`), `acaoEscolherItem(devolucaoId, codigo, ...)`
  - textos usados no e2e: região "Fiscal"; títulos "NF de devolução", "NF de venda", "Itens e NF de venda"; botões "Emitir NF de devolução", "Corrigir e reenviar", "Cancelar NF", "Anexar XML", "Buscar no Mercado Livre", "Salvar escolha"; "Cancelar esta NF"; campos "Arquivo XML da NF de venda", "Item da NF de venda (unidade N)", "Justificativa (15 a 255 caracteres)"; links "Abrir DANFE (PDF)" e "Baixar XML"; `data-testid="chave-nf-devolucao"`

**Quando a seção aparece:** devolução em AGUARDANDO_NF ou CONCLUIDA, ou com alguma NF de devolução ou NF de venda. Ações só para `gerir_fiscal`; NF de venda e escolha só em AGUARDANDO_NF, sem NF em processamento ou autorizada; cancelar só AUTORIZADA dentro das 24 h.

- [ ] **Passo 1: Escrever o teste de integração que falha**

`src/modules/fiscal/situacao.int.test.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { notasFiscais } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { configurarFiscalTeste, criarDevolucaoNoEstoqueTeste, inserirNotaVendaTeste } from '../../../tests/helpers/fabricas-fiscal';
import { referenciaDaNota } from './dominio';
import { notaPertenceADevolucao, obterSituacaoFiscal } from './situacao';

const { db, sql } = criarDbTeste();
const AGORA = new Date('2026-11-12T13:00:00Z');
const HORA = 60 * 60 * 1000;
let gestor: UsuarioSessao;

beforeEach(async () => {
  await limparTabelas(sql);
  gestor = await criarUsuarioTeste(db, 'GESTOR');
  await configurarFiscalTeste(db, gestor);
});
afterAll(async () => {
  await sql.end();
});

describe('obterSituacaoFiscal (Seção Fiscal)', () => {
  it('junta a NF de venda e o casamento das unidades, com as opções e as vagas que sobram', async () => {
    const dev = await criarDevolucaoNoEstoqueTeste(db, gestor, { unidades: [{ sku: 'FONE-01', destino: 'BOM' }, { sku: 'SEM-PAR', destino: 'PROBLEMA' }] });
    const { notaVendaId, chave } = await inserirNotaVendaTeste(db, dev.id, { itens: [{ codigo: 'FONE-01', quantidade: 2, descricao: 'Fone' }] });
    const s = await obterSituacaoFiscal(db, dev.id, AGORA);
    expect(s.notaAtiva).toBeNull();
    expect(s.anteriores).toEqual([]);
    expect(s.canalMercadoLivre).toBe(false);
    expect(s.notasVenda).toEqual([{ id: notaVendaId, chave, origem: 'XML anexado', emitidaEm: '20/10/2026 10:00', uf: 'SP', itens: ['FONE-01 × 2'] }]);
    expect(s.unidades).toEqual([
      {
        itemId: dev.itens[0].id,
        titulo: 'Unidade 1 · FONE-01',
        rotuloCurto: 'unidade 1',
        destino: 'Estoque Bom',
        casamento: 'Casado pelo SKU: NF 101 · item 1 · FONE-01 · Fone',
        valorAtual: `${notaVendaId}:1`,
        precisaEscolher: false,
        escolhida: false,
      },
      {
        itemId: dev.itens[1].id,
        titulo: 'Unidade 2 · SEM-PAR',
        rotuloCurto: 'unidade 2',
        destino: 'Estoque Problema',
        casamento: 'Sem item da NF de venda: escolha abaixo',
        valorAtual: '',
        precisaEscolher: true,
        escolhida: false,
      },
    ]);
    expect(s.opcoes).toEqual([{ valor: `${notaVendaId}:1`, rotulo: 'NF 101 · item 1 · FONE-01 · Fone (1 de 2 livres)' }]);
  });

  it('NF autorizada: prazo de cancelamento, aviso de série e, depois de 24 h, só a orientação', async () => {
    const dev = await criarDevolucaoNoEstoqueTeste(db, gestor, { unidades: [{ destino: 'BOM' }] });
    const id = randomUUID();
    await db.insert(notasFiscais).values({
      id,
      tipo: 'DEVOLUCAO_VENDA',
      devolucaoId: dev.id,
      ambiente: 'HOMOLOGACAO',
      referenciaEmissor: referenciaDaNota(id),
      situacao: 'AUTORIZADA',
      numero: '55',
      serie: '3',
      chave: '35261011444777000161550010000001011000001012',
      autorizadaEm: AGORA,
      xmlCaminho: `nfe/2026/11/${id}.xml`,
      danfeCaminho: `nfe/2026/11/${id}-danfe.pdf`,
    });
    const s = await obterSituacaoFiscal(db, dev.id, new Date(AGORA.getTime() + HORA));
    expect(s.notaAtiva).toMatchObject({
      id,
      situacao: 'AUTORIZADA',
      selo: 'NF autorizada',
      tom: 'bom',
      homologacao: true,
      numero: '55',
      autorizadaEm: '12/11/2026 10:00',
      cancelavelAte: '13/11/2026 10:00',
      podeCancelar: true,
      prazoEncerrado: false,
      avisoSerie: 'A SEFAZ devolveu a série 3, mas a configurada é 1: confira a série da empresa na Focus NFe.',
    });
    const depois = await obterSituacaoFiscal(db, dev.id, new Date(AGORA.getTime() + 25 * HORA));
    expect(depois.notaAtiva).toMatchObject({ podeCancelar: false, prazoEncerrado: true });
    expect(await notaPertenceADevolucao(db, id, dev.id)).toBe(true);
    expect(await notaPertenceADevolucao(db, id, randomUUID())).toBe(false);
  });
});
```

Rode: `npm run test:int -- src/modules/fiscal/situacao.int.test.ts`
Esperado: FAIL (`obterSituacaoFiscal` não existe).

- [ ] **Passo 2: Implementar a situação fiscal**

`src/modules/fiscal/situacao.ts` (substitui todo o conteúdo):

```ts
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { devolucoes, notasFiscais } from '@/db/schema';
import { formatarDataHora } from '@/lib/formatar';
import { lerConfiguracao } from '@/modules/configuracoes/ler';
import type { TomSelo } from '@/modules/devolucoes/selos';
import { capacidade, casarItens, chaveAlvo, vagasRestantes, type MotivoCasamento } from './casamento';
import { numeroDaChave } from './chave';
import { dentroDoPrazoDeCancelamento, prazoDeCancelamento, ROTULO_ORIGEM_NOTA_VENDA, SELO_SITUACAO_NOTA, type SituacaoNotaFiscal } from './dominio';
import { carregarDadosDevolucao } from './montar-devolucao';
import type { NotaFiscalLinha } from './notas';

/** id → código DEV, para as mensagens da emissão em lote. */
export async function codigosDasDevolucoes(db: DbOuTx, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const linhas = await db.select({ id: devolucoes.id, codigo: devolucoes.codigo }).from(devolucoes).where(inArray(devolucoes.id, ids));
  return new Map(linhas.map((l) => [l.id, l.codigo]));
}

/** O que a Seção Fiscal mostra de uma NF: textos e datas já prontos (o componente não formata nem calcula prazo). */
export type VistaNota = {
  id: string;
  situacao: SituacaoNotaFiscal;
  selo: string;
  tom: TomSelo;
  homologacao: boolean;
  numero: string | null;
  serie: string | null;
  chave: string | null;
  motivoRejeicao: string | null;
  autorizadaEm: string | null;
  canceladaEm: string | null;
  justificativa: string | null;
  cancelavelAte: string | null;
  podeCancelar: boolean;
  prazoEncerrado: boolean;
  avisoSerie: string | null;
  xmlCaminho: string | null;
  danfeCaminho: string | null;
};
export type VistaNotaVenda = { id: string; chave: string; origem: string; emitidaEm: string | null; uf: string; itens: string[] };
export type VistaUnidade = {
  itemId: string;
  titulo: string;
  rotuloCurto: string;
  destino: string;
  casamento: string;
  valorAtual: string;
  precisaEscolher: boolean;
  escolhida: boolean;
};
export type OpcaoItemVenda = { valor: string; rotulo: string };
export type SituacaoFiscal = {
  notaAtiva: VistaNota | null;
  anteriores: VistaNota[];
  notasVenda: VistaNotaVenda[];
  unidades: VistaUnidade[];
  opcoes: OpcaoItemVenda[];
  canalMercadoLivre: boolean;
};

const TOM_NOTA: Record<SituacaoNotaFiscal, TomSelo> = { PROCESSANDO: 'destaque', AUTORIZADA: 'bom', REJEITADA: 'erro', CANCELADA: 'neutro' };
const MOTIVO: Record<MotivoCasamento, string> = { ESCOLHA: 'Escolhido pelo Fiscal', SKU: 'Casado pelo SKU', EAN: 'Casado pelo EAN' };
const ROTULO_DESTINO = { BOM: 'Estoque Bom', PROBLEMA: 'Estoque Problema' } as const;

export function vistaDaNota(n: NotaFiscalLinha, serieConfigurada: string | null, agora: Date): VistaNota {
  const autorizada = n.situacao === 'AUTORIZADA' && n.autorizadaEm !== null;
  const podeCancelar = autorizada && n.autorizadaEm !== null && dentroDoPrazoDeCancelamento(n.autorizadaEm, agora);
  const serieDivergente = n.serie !== null && serieConfigurada !== null && Number(n.serie) !== Number(serieConfigurada);
  return {
    id: n.id,
    situacao: n.situacao,
    selo: SELO_SITUACAO_NOTA[n.situacao],
    tom: TOM_NOTA[n.situacao],
    homologacao: n.ambiente === 'HOMOLOGACAO',
    numero: n.numero,
    serie: n.serie,
    chave: n.chave,
    motivoRejeicao: n.motivoRejeicao,
    autorizadaEm: n.autorizadaEm ? formatarDataHora(n.autorizadaEm) : null,
    canceladaEm: n.canceladaEm ? formatarDataHora(n.canceladaEm) : null,
    justificativa: n.justificativaCancelamento,
    cancelavelAte: n.autorizadaEm ? formatarDataHora(prazoDeCancelamento(n.autorizadaEm)) : null,
    podeCancelar,
    prazoEncerrado: autorizada && !podeCancelar,
    avisoSerie: serieDivergente
      ? `A SEFAZ devolveu a série ${n.serie}, mas a configurada é ${serieConfigurada}: confira a série da empresa na Focus NFe.`
      : null,
    xmlCaminho: n.xmlCaminho,
    danfeCaminho: n.danfeCaminho,
  };
}

/** Tudo o que a Seção Fiscal precisa, numa leitura. `agora` decide se ainda dá para cancelar (24 h). */
export async function obterSituacaoFiscal(db: DbOuTx, devolucaoId: string, agora: Date = new Date()): Promise<SituacaoFiscal> {
  const config = await lerConfiguracao(db);
  const notas = await db.select().from(notasFiscais).where(eq(notasFiscais.devolucaoId, devolucaoId)).orderBy(desc(notasFiscais.criadaEm));
  const dados = await carregarDadosDevolucao(db, devolucaoId);
  const vistas = notas.map((n) => vistaDaNota(n, config.serieNfe ?? null, agora));
  const notasVenda = dados?.notasVenda ?? [];
  const unidades = dados?.unidades ?? [];
  const casamento = casarItens(unidades, notasVenda);
  const vagas = vagasRestantes(notasVenda, casamento);

  const rotulosDosItens = new Map<string, string>();
  const opcoes: OpcaoItemVenda[] = [];
  for (const nota of notasVenda) {
    for (const item of nota.itens) {
      const valor = chaveAlvo({ notaVendaId: nota.notaVendaId, numeroItem: item.numero });
      const rotulo = `NF ${numeroDaChave(nota.chave)} · item ${item.numero} · ${item.codigo} · ${item.descricao}`;
      rotulosDosItens.set(valor, rotulo);
      opcoes.push({ valor, rotulo: `${rotulo} (${Math.max(0, vagas.get(valor) ?? 0)} de ${capacidade(item.quantidade)} livres)` });
    }
  }

  return {
    notaAtiva: vistas.find((v) => v.situacao !== 'CANCELADA') ?? null,
    anteriores: vistas.filter((v) => v.situacao === 'CANCELADA'),
    notasVenda: notasVenda.map((n) => ({
      id: n.notaVendaId,
      chave: n.chave,
      origem: ROTULO_ORIGEM_NOTA_VENDA[n.origem],
      emitidaEm: n.emitidaEm ? formatarDataHora(n.emitidaEm) : null,
      uf: n.destinatario.uf,
      itens: n.itens.map((i) => `${i.codigo} × ${i.quantidade}`),
    })),
    unidades: unidades.map((u) => {
      const c = casamento.find((x) => x.itemId === u.itemId);
      const valor = c?.alvo ? chaveAlvo(c.alvo) : '';
      return {
        itemId: u.itemId,
        titulo: `Unidade ${u.unidade} · ${u.sku}${u.descricao ? ` · ${u.descricao}` : ''}`,
        rotuloCurto: `unidade ${u.unidade}`,
        destino: ROTULO_DESTINO[u.destino],
        casamento: c?.alvo && c.por ? `${MOTIVO[c.por]}: ${rotulosDosItens.get(valor) ?? ''}` : 'Sem item da NF de venda: escolha abaixo',
        valorAtual: valor,
        precisaEscolher: !c?.alvo,
        escolhida: c?.por === 'ESCOLHA',
      };
    }),
    opcoes,
    canalMercadoLivre: dados?.canal === 'MERCADO_LIVRE',
  };
}

/** As ações recebem o id da nota do formulário: confere que ela é desta devolução. */
export async function notaPertenceADevolucao(db: DbOuTx, notaFiscalId: string, devolucaoId: string): Promise<boolean> {
  const [nota] = await db
    .select({ id: notasFiscais.id })
    .from(notasFiscais)
    .where(and(eq(notasFiscais.id, notaFiscalId), eq(notasFiscais.devolucaoId, devolucaoId)));
  return nota !== undefined;
}
```

Rode: `npm run test:int -- src/modules/fiscal/situacao.int.test.ts`
Esperado: PASS.

- [ ] **Passo 3: Ações da Seção Fiscal**

`src/components/fiscal/tipos.ts`:

```ts
/** Resposta das ações da Seção Fiscal. A mensagem fica no bloco (que não some), com o foco no erro ou no sucesso. */
export type EstadoAcaoFiscal = { erros: string[]; ok: string | null };
export const ESTADO_INICIAL_FISCAL: EstadoAcaoFiscal = { erros: [], ok: null };
```

`src/app/(app)/fluxo/devolucoes/[codigo]/secoes/acoes-fiscal.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import type { EstadoAcaoFiscal } from '@/components/fiscal/tipos';
import { obterDb } from '@/db';
import { textoDoForm } from '@/lib/formulario';
import { ehUuid } from '@/lib/uuid';
import { exigirPermissao } from '@/modules/auth/servidor';
import { ErroDevolucao } from '@/modules/devolucoes/erros';
import { lerChaveAlvo } from '@/modules/fiscal/casamento';
import { cancelarNota, reenviarNota, solicitarEmissao } from '@/modules/fiscal/emissao';
import { ErroFiscal } from '@/modules/fiscal/erros';
import { escolherItemNotaVenda } from '@/modules/fiscal/escolha';
import { buscarNotaVendaNoCanal, registrarNotaVenda, removerNotaVenda } from '@/modules/fiscal/nota-venda';
import { notaPertenceADevolucao } from '@/modules/fiscal/situacao';
import { TAMANHO_MAXIMO_XML } from '@/modules/fiscal/xml-nota-venda';

/** `devolucaoId` e `codigo` chegam ligados (bind) do cliente: são conferidos antes de qualquer uso. */
const CODIGO_VALIDO = /^DEV-\d+$/;

async function executar(devolucaoId: string, codigo: string, acao: () => Promise<string>): Promise<EstadoAcaoFiscal> {
  if (!CODIGO_VALIDO.test(codigo) || !ehUuid(devolucaoId)) return { erros: ['Devolução não encontrada.'], ok: null };
  let ok: string;
  try {
    ok = await acao();
  } catch (erro) {
    if (erro instanceof ErroFiscal || erro instanceof ErroDevolucao) return { erros: [erro.message], ok: null };
    throw erro;
  }
  revalidatePath(`/fluxo/devolucoes/${codigo}`);
  revalidatePath('/fluxo/etapa/4');
  return { erros: [], ok };
}

/** NF de devolução: emitir (extra, decisão 14), corrigir e reenviar, cancelar (spec §6.4 e §8.6). */
export async function acaoNotaDevolucao(devolucaoId: string, codigo: string, _anterior: EstadoAcaoFiscal, dados: FormData): Promise<EstadoAcaoFiscal> {
  const usuario = await exigirPermissao('gerir_fiscal');
  const db = obterDb();
  const operacao = textoDoForm(dados, 'operacao');
  const notaId = textoDoForm(dados, 'nota');
  return executar(devolucaoId, codigo, async () => {
    if (operacao === 'emitir') {
      await solicitarEmissao(db, { tipo: 'DEVOLUCAO_VENDA', devolucaoId }, usuario);
      return 'NF de devolução enviada à SEFAZ. A resposta chega em alguns segundos.';
    }
    if (!ehUuid(notaId) || !(await notaPertenceADevolucao(db, notaId, devolucaoId))) throw new ErroFiscal('NF não encontrada.');
    if (operacao === 'reenviar') {
      await reenviarNota(db, notaId, usuario);
      return 'NF reenviada à SEFAZ.';
    }
    if (operacao === 'cancelar') {
      await cancelarNota(db, notaId, textoDoForm(dados, 'justificativa'), usuario);
      return 'NF cancelada. A devolução voltou para Aguardando NF.';
    }
    throw new ErroFiscal('Ação desconhecida.');
  });
}

/** NF de venda: anexar o XML, buscar no Mercado Livre (contrato §5.8) ou remover (extra). */
export async function acaoNotaVenda(devolucaoId: string, codigo: string, _anterior: EstadoAcaoFiscal, dados: FormData): Promise<EstadoAcaoFiscal> {
  const usuario = await exigirPermissao('gerir_fiscal');
  const db = obterDb();
  const operacao = textoDoForm(dados, 'operacao');
  return executar(devolucaoId, codigo, async () => {
    if (operacao === 'anexar') {
      const arquivo = dados.get('xml');
      if (!(arquivo instanceof File) || arquivo.size === 0) throw new ErroFiscal('Escolha o arquivo XML da NF de venda.');
      if (arquivo.size > TAMANHO_MAXIMO_XML) throw new ErroFiscal('O XML passa de 1 MB: confira se é o arquivo da NF de venda.');
      await registrarNotaVenda(db, devolucaoId, await arquivo.text(), 'ANEXO', usuario);
      return 'NF de venda anexada.';
    }
    if (operacao === 'buscar') {
      const resultado = await buscarNotaVendaNoCanal(db, devolucaoId, usuario);
      if (!resultado.consultou) throw new ErroFiscal('A integração com o Mercado Livre não está ligada: anexe o XML da NF de venda.');
      if (resultado.encontradas === 0) throw new ErroFiscal('O Mercado Livre não tem a NF de venda deste pedido: anexe o XML (baixado do Bitbrain).');
      return 'NF de venda obtida do Mercado Livre.';
    }
    if (operacao === 'remover') {
      const notaVendaId = textoDoForm(dados, 'notaVenda');
      if (!ehUuid(notaVendaId)) throw new ErroFiscal('NF de venda não encontrada.');
      await removerNotaVenda(db, devolucaoId, notaVendaId, usuario);
      return 'NF de venda removida.';
    }
    throw new ErroFiscal('Ação desconhecida.');
  });
}

/** D14: o Fiscal liga a unidade a um item da NF de venda (vazio desfaz a escolha). */
export async function acaoEscolherItem(devolucaoId: string, codigo: string, _anterior: EstadoAcaoFiscal, dados: FormData): Promise<EstadoAcaoFiscal> {
  const usuario = await exigirPermissao('gerir_fiscal');
  const itemId = textoDoForm(dados, 'item');
  const texto = textoDoForm(dados, 'alvo');
  return executar(devolucaoId, codigo, async () => {
    if (!ehUuid(itemId)) throw new ErroFiscal('Unidade não encontrada.');
    const alvo = texto ? lerChaveAlvo(texto) : null;
    if (texto && !alvo) throw new ErroFiscal('Item da NF de venda inválido.');
    await escolherItemNotaVenda(obterDb(), devolucaoId, itemId, alvo, usuario);
    return alvo ? 'Item da NF de venda escolhido.' : 'Escolha desfeita.';
  });
}
```

- [ ] **Passo 4: Blocos da tela e a Seção Fiscal**

`src/components/fiscal/AtualizarEnquantoProcessa.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** (extra) Enquanto a SEFAZ responde, a página se atualiza sozinha a cada 5 s (o worker autoriza em segundo plano). */
export function AtualizarEnquantoProcessa({ segundos = 5 }: { segundos?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = window.setInterval(() => router.refresh(), segundos * 1000);
    return () => window.clearInterval(id);
  }, [router, segundos]);
  return <p className="text-sm text-texto-2">Aguardando a resposta da SEFAZ. Esta página se atualiza sozinha.</p>;
}
```

`src/components/fiscal/BlocosFiscais.tsx`:

```tsx
'use client';

import { ListaErros } from '@/components/ListaErros';
import { MensagemSucesso } from '@/components/MensagemSucesso';
import { Selo } from '@/components/Selo';
import { ALERTA_ATENCAO, BOTAO_PERIGO, BOTAO_PRIMARIO, BOTAO_SECUNDARIO, CAMPO, ROTULO } from '@/components/estilos';
import { useEnvioFormulario } from '@/components/useEnvioFormulario';
import type { OpcaoItemVenda, VistaNota, VistaNotaVenda, VistaUnidade } from '@/modules/fiscal/situacao';
import { AtualizarEnquantoProcessa } from './AtualizarEnquantoProcessa';
import { ESTADO_INICIAL_FISCAL, type EstadoAcaoFiscal } from './tipos';

type Acao = (anterior: EstadoAcaoFiscal, dados: FormData) => Promise<EstadoAcaoFiscal>;

const TITULO = 'text-sm font-bold';
const LARGURA = 'w-full sm:w-auto';
const CAIXA = 'flex flex-col gap-2 rounded-lg border border-borda p-3';

/** Mensagem do bloco: fica mesmo quando o botão que a gerou some (ex.: "Emitir" vira "NF em processamento"). */
function Retorno({ estado, idErros }: { estado: EstadoAcaoFiscal; idErros: string }) {
  return (
    <>
      {estado.ok && <MensagemSucesso key={estado.ok} texto={estado.ok} />}
      <ListaErros erros={estado.erros} id={idErros} />
    </>
  );
}

function Dado({ rotulo, children, largo = false, mono = false, testId }: { rotulo: string; children: string; largo?: boolean; mono?: boolean; testId?: string }) {
  return (
    <div className={`flex flex-col gap-0.5 ${largo ? 'sm:col-span-2' : ''}`}>
      <dt className={ROTULO}>{rotulo}</dt>
      <dd data-testid={testId} className={mono ? 'break-all font-mono text-[13px]' : 'text-[15px]'}>
        {children}
      </dd>
    </div>
  );
}

type PropsNotaDevolucao = {
  acao: Acao;
  nota: VistaNota | null;
  anteriores: VistaNota[];
  links: { xml: string; danfe: string } | null;
  podeEmitir: boolean;
  podeReenviar: boolean;
  podeCancelar: boolean;
};

/** Spec §6.4 e §8.6: a NF de devolução (situação, dados, XML, DANFE), emitir, corrigir e reenviar, cancelar. */
export function BlocoNotaDevolucao({ acao, nota, anteriores, links, podeEmitir, podeReenviar, podeCancelar }: PropsNotaDevolucao) {
  const idErros = 'erros-nf-devolucao';
  const [estado, aoEnviar, pendente] = useEnvioFormulario(acao, ESTADO_INICIAL_FISCAL, idErros);
  return (
    <div className="flex flex-col gap-3">
      <h3 className={TITULO}>NF de devolução</h3>
      <Retorno estado={estado} idErros={idErros} />
      {nota ? (
        <div className="flex flex-col gap-2">
          <span className="flex flex-wrap gap-1.5">
            <Selo texto={nota.selo} tom={nota.tom} />
            {nota.homologacao && <Selo texto="Homologação (sem valor fiscal)" tom="atencao" />}
          </span>
          {nota.situacao === 'PROCESSANDO' && <AtualizarEnquantoProcessa />}
          {nota.situacao === 'REJEITADA' && (
            <>
              <p className="text-sm">
                <span className="font-semibold">Motivo:</span> {nota.motivoRejeicao ?? '—'}
              </p>
              <p className="text-sm text-texto-2">
                Corrija a causa (regras e dados da empresa em Configurações › Fiscal, ou a NF de venda abaixo) e reenvie.
              </p>
            </>
          )}
          {nota.situacao === 'AUTORIZADA' && (
            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              <Dado rotulo="Número" mono>
                {nota.numero ?? '—'}
              </Dado>
              <Dado rotulo="Série" mono>
                {nota.serie ?? '—'}
              </Dado>
              <Dado rotulo="Chave de acesso" mono largo testId="chave-nf-devolucao">
                {nota.chave ?? '—'}
              </Dado>
              <Dado rotulo="Autorizada em">{nota.autorizadaEm ?? '—'}</Dado>
            </dl>
          )}
          {nota.avisoSerie && <p className={ALERTA_ATENCAO}>{nota.avisoSerie}</p>}
          {links && (
            <div className="grid grid-cols-1 gap-2 sm:flex">
              <a href={links.danfe} target="_blank" rel="noopener noreferrer" className={BOTAO_SECUNDARIO}>
                Abrir DANFE (PDF)
              </a>
              <a href={links.xml} download className={BOTAO_SECUNDARIO}>
                Baixar XML
              </a>
            </div>
          )}
          {nota.prazoEncerrado && (
            <p className="text-sm text-texto-2">{`O prazo de cancelamento (24 h) terminou em ${nota.cancelavelAte}. Para desfazer, fale com o contador sobre a nota de estorno.`}</p>
          )}
        </div>
      ) : (
        <p className="text-sm text-texto-2">Nenhuma NF de devolução emitida.</p>
      )}
      {podeEmitir && (
        <form onSubmit={aoEnviar}>
          <input type="hidden" name="operacao" value="emitir" />
          <button type="submit" disabled={pendente} className={`${BOTAO_PRIMARIO} ${LARGURA}`}>
            {pendente ? 'Enviando…' : 'Emitir NF de devolução'}
          </button>
        </form>
      )}
      {podeReenviar && nota && (
        <form onSubmit={aoEnviar}>
          <input type="hidden" name="operacao" value="reenviar" />
          <input type="hidden" name="nota" value={nota.id} />
          <button type="submit" disabled={pendente} className={`${BOTAO_PRIMARIO} ${LARGURA}`}>
            {pendente ? 'Reenviando…' : 'Corrigir e reenviar'}
          </button>
        </form>
      )}
      {podeCancelar && nota && (
        <details className="rounded-lg border border-borda px-3">
          <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-erro">Cancelar esta NF</summary>
          <form onSubmit={aoEnviar} className="flex flex-col gap-3 pb-3">
            <input type="hidden" name="operacao" value="cancelar" />
            <input type="hidden" name="nota" value={nota.id} />
            <p className="text-sm text-texto-2">{`Pode cancelar até ${nota.cancelavelAte}. Os itens e a devolução voltam para Aguardando NF.`}</p>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="justificativa-cancelamento" className={ROTULO}>
                Justificativa (15 a 255 caracteres)
              </label>
              <textarea
                id="justificativa-cancelamento"
                name="justificativa"
                required
                minLength={15}
                maxLength={255}
                rows={3}
                className={`${CAMPO} min-h-24 py-2`}
              />
            </div>
            <button type="submit" disabled={pendente} className={BOTAO_PERIGO}>
              {pendente ? 'Cancelando…' : 'Cancelar NF'}
            </button>
          </form>
        </details>
      )}
      {anteriores.length > 0 && (
        <div className="flex flex-col gap-1">
          <h4 className={ROTULO}>NF canceladas</h4>
          <ul className="flex flex-col gap-1 text-sm">
            {anteriores.map((a) => (
              <li key={a.id}>{`NF ${a.numero ?? '—'} (série ${a.serie ?? '—'}), cancelada em ${a.canceladaEm ?? '—'}${a.justificativa ? `: ${a.justificativa}` : ''}`}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

type PropsNotaVenda = { acao: Acao; notas: VistaNotaVenda[]; podeAnexar: boolean; podeBuscarMl: boolean; podeRemover: boolean };

/** Spec §7.5: a NF de venda (do Mercado Livre ou anexada pelo Fiscal). */
export function BlocoNotaVenda({ acao, notas, podeAnexar, podeBuscarMl, podeRemover }: PropsNotaVenda) {
  const idErros = 'erros-nf-venda';
  const [estado, aoEnviar, pendente] = useEnvioFormulario(acao, ESTADO_INICIAL_FISCAL, idErros);
  return (
    <div className="flex flex-col gap-3">
      <h3 className={TITULO}>NF de venda</h3>
      <Retorno estado={estado} idErros={idErros} />
      {notas.length === 0 ? (
        <p className="text-sm text-texto-2">Nenhuma NF de venda. Ela dá o destinatário, os valores e a chave referenciada da NF de devolução.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {notas.map((n) => (
            <li key={n.id} className={CAIXA}>
              <span className="text-xs font-semibold text-texto-2">{`${n.origem}${n.emitidaEm ? ` · emitida em ${n.emitidaEm}` : ''} · destinatário em ${n.uf}`}</span>
              <span className="break-all font-mono text-[13px]">{n.chave}</span>
              <span className="text-sm">{n.itens.join(' · ')}</span>
              {podeRemover && (
                <form onSubmit={aoEnviar}>
                  <input type="hidden" name="operacao" value="remover" />
                  <input type="hidden" name="notaVenda" value={n.id} />
                  <button type="submit" disabled={pendente} className={`${BOTAO_SECUNDARIO} ${LARGURA}`}>
                    Remover<span className="sr-only">{` a NF de venda ${n.chave}`}</span>
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      {podeBuscarMl && (
        <form onSubmit={aoEnviar}>
          <input type="hidden" name="operacao" value="buscar" />
          <button type="submit" disabled={pendente} className={`${BOTAO_SECUNDARIO} ${LARGURA}`}>
            {pendente ? 'Buscando…' : 'Buscar no Mercado Livre'}
          </button>
        </form>
      )}
      {podeAnexar && (
        <form onSubmit={aoEnviar} className="flex flex-col gap-2">
          <input type="hidden" name="operacao" value="anexar" />
          <label htmlFor="xml-venda" className={ROTULO}>
            Arquivo XML da NF de venda
          </label>
          <input
            id="xml-venda"
            name="xml"
            type="file"
            required
            accept=".xml,text/xml,application/xml"
            aria-describedby="xml-venda-dica"
            className="min-h-11 text-sm file:mr-3 file:min-h-11 file:rounded-full file:border file:border-borda-campo file:bg-superficie file:px-4 file:font-semibold"
          />
          <p id="xml-venda-dica" className="text-xs text-texto-2">
            O XML autorizado (com o protocolo da SEFAZ), baixado do Bitbrain. Até 1 MB.
          </p>
          <button type="submit" disabled={pendente} className={`${BOTAO_SECUNDARIO} ${LARGURA}`}>
            {pendente ? 'Anexando…' : 'Anexar XML'}
          </button>
        </form>
      )}
    </div>
  );
}

type PropsItensVenda = { acao: Acao; unidades: VistaUnidade[]; opcoes: OpcaoItemVenda[]; podeEscolher: boolean };

/** D14: cada unidade entra na NF de devolução com um item da NF de venda (SKU, depois EAN; senão, o Fiscal escolhe). */
export function BlocoItensVenda({ acao, unidades, opcoes, podeEscolher }: PropsItensVenda) {
  const idErros = 'erros-itens-venda';
  const [estado, aoEnviar, pendente] = useEnvioFormulario(acao, ESTADO_INICIAL_FISCAL, idErros);
  return (
    <div className="flex flex-col gap-3">
      <h3 className={TITULO}>Itens e NF de venda</h3>
      <p className="text-sm text-texto-2">
        Cada unidade entra na NF de devolução com um item da NF de venda: pelo SKU, depois pelo EAN. Se nada casar, escolha o item.
      </p>
      <Retorno estado={estado} idErros={idErros} />
      <ul className="flex flex-col gap-2">
        {unidades.map((u) => (
          <li key={u.itemId} className={CAIXA}>
            <span className="text-sm font-semibold">{u.titulo}</span>
            <span className="text-xs text-texto-2">{`${u.destino} · ${u.casamento}`}</span>
            {podeEscolher && (u.precisaEscolher || u.escolhida) && (
              <form onSubmit={aoEnviar} className="flex flex-col gap-2">
                <input type="hidden" name="item" value={u.itemId} />
                <label htmlFor={`alvo-${u.itemId}`} className={ROTULO}>
                  {`Item da NF de venda (${u.rotuloCurto})`}
                </label>
                <select id={`alvo-${u.itemId}`} name="alvo" defaultValue={u.valorAtual} className={CAMPO}>
                  <option value="">Escolha o item…</option>
                  {opcoes.map((o) => (
                    <option key={o.valor} value={o.valor}>
                      {o.rotulo}
                    </option>
                  ))}
                </select>
                <button type="submit" disabled={pendente} className={`${BOTAO_SECUNDARIO} ${LARGURA}`}>
                  Salvar escolha<span className="sr-only">{` (${u.rotuloCurto})`}</span>
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

`src/app/(app)/fluxo/devolucoes/[codigo]/secoes/SecaoFiscal.tsx` (substitui o esqueleto da Parte A):

```tsx
import { BlocoItensVenda, BlocoNotaDevolucao, BlocoNotaVenda } from '@/components/fiscal/BlocosFiscais';
import { CARTAO } from '@/components/estilos';
import { obterDb } from '@/db';
import { pode } from '@/modules/auth/permissoes';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import type { StatusDevolucao } from '@/modules/devolucoes/dominio';
import { obterSituacaoFiscal } from '@/modules/fiscal/situacao';
import { obterArmazenamento } from '@/modules/midia/armazenamento';
import { acaoEscolherItem, acaoNotaDevolucao, acaoNotaVenda } from './acoes-fiscal';

/** Spec §9: links temporários de 10 min, nunca públicos. */
const SEGUNDOS_LINK = 10 * 60;

type Props = { devolucaoId: string; codigo: string; status: StatusDevolucao; usuario: UsuarioSessao };

/** Seção "Fiscal" do detalhe (contrato §2, P2 item 9): NF de venda, casamento dos itens (D14) e NF de devolução. */
export async function SecaoFiscal({ devolucaoId, codigo, status, usuario }: Props) {
  const s = await obterSituacaoFiscal(obterDb(), devolucaoId);
  const aguardando = status === 'AGUARDANDO_NF';
  const relevante = aguardando || status === 'CONCLUIDA' || s.notaAtiva !== null || s.anteriores.length > 0 || s.notasVenda.length > 0;
  if (!relevante) return null;

  const podeFiscal = pode(usuario.perfil, 'gerir_fiscal');
  const nota = s.notaAtiva;
  // NF de venda e escolha dos itens: só antes da NF (ou depois de uma rejeição, para corrigir).
  const podeMexer = podeFiscal && aguardando && (!nota || nota.situacao === 'REJEITADA');
  let links: { xml: string; danfe: string } | null = null;
  if (nota?.situacao === 'AUTORIZADA' && nota.xmlCaminho && nota.danfeCaminho) {
    const armazenamento = obterArmazenamento();
    links = {
      xml: await armazenamento.urlTemporaria(nota.xmlCaminho, SEGUNDOS_LINK),
      danfe: await armazenamento.urlTemporaria(nota.danfeCaminho, SEGUNDOS_LINK),
    };
  }

  return (
    <section aria-labelledby="titulo-fiscal" className={`${CARTAO} flex flex-col gap-5`}>
      <h2 id="titulo-fiscal" className="text-base font-bold">
        Fiscal
      </h2>
      <BlocoNotaDevolucao
        acao={acaoNotaDevolucao.bind(null, devolucaoId, codigo)}
        nota={nota}
        anteriores={s.anteriores}
        links={links}
        podeEmitir={podeFiscal && aguardando && !nota}
        podeReenviar={podeFiscal && nota?.situacao === 'REJEITADA'}
        podeCancelar={podeFiscal && nota?.podeCancelar === true}
      />
      <BlocoNotaVenda
        acao={acaoNotaVenda.bind(null, devolucaoId, codigo)}
        notas={s.notasVenda}
        podeAnexar={podeMexer}
        podeBuscarMl={podeMexer && s.canalMercadoLivre}
        podeRemover={podeMexer}
      />
      {aguardando && s.notasVenda.length > 0 && s.unidades.length > 0 && (
        <BlocoItensVenda acao={acaoEscolherItem.bind(null, devolucaoId, codigo)} unidades={s.unidades} opcoes={s.opcoes} podeEscolher={podeMexer} />
      )}
    </section>
  );
}
```

Rode: `npm run typecheck && npm run lint`
Esperado: PASS.

- [ ] **Passo 5: Teste ponta a ponta da Seção Fiscal**

`tests/e2e/fiscal-nf.spec.ts`:

```ts
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { unzipSync } from 'fflate';
import { EMPRESA_TESTE } from '../helpers/fabricas-fiscal';
import { xmlNotaVendaTeste } from '../helpers/xml-nfe';
import { codigoUnico, entrarComo, semRolagemLateral } from './apoio';
import { devolucaoNoEstoque, prepararFiscal } from './apoio-fiscal';
import { USUARIOS_E2E } from './dados';

/** O worker do e2e autoriza na 2ª consulta (uns 10 s); a página se atualiza a cada 5 s. */
const AUTORIZACAO = { timeout: 45_000 };

test('Fiscal anexa o XML da NF de venda, escolhe o item (D14) e emite; a NF é autorizada, o DANFE abre e o ZIP traz o XML', async ({ page }) => {
  test.setTimeout(150_000);
  await prepararFiscal();
  const dev = await devolucaoNoEstoque({ destinos: ['BOM'], comNotaVenda: false });
  const { xml, chave: chaveVenda } = xmlNotaVendaTeste({
    cnpjEmitente: EMPRESA_TESTE.cnpj,
    itens: [{ codigo: codigoUnico('VENDA'), descricao: 'Fone de teste', valorUnitario: 80 }],
  });
  await entrarComo(page, USUARIOS_E2E.fiscal);
  await page.goto(`/fluxo/devolucoes/${dev.codigo}`);
  const secao = page.getByRole('region', { name: 'Fiscal' });
  await expect(secao.getByText('Nenhuma NF de venda.')).toBeVisible();

  await secao.getByLabel('Arquivo XML da NF de venda').setInputFiles({ name: 'venda.xml', mimeType: 'application/xml', buffer: Buffer.from(xml) });
  await secao.getByRole('button', { name: 'Anexar XML' }).click();
  await expect(secao.getByRole('status')).toHaveText('NF de venda anexada.');
  await expect(secao.getByText(chaveVenda)).toBeVisible();

  // D14: o SKU da devolução não está na NF de venda, então o Fiscal escolhe o item.
  await expect(secao.getByText(/Sem item da NF de venda: escolha abaixo/)).toBeVisible();
  await secao.getByLabel('Item da NF de venda (unidade 1)').selectOption({ index: 1 });
  await secao.getByRole('button', { name: /^Salvar escolha/ }).click();
  await expect(secao.getByText(/Escolhido pelo Fiscal/)).toBeVisible();
  await semRolagemLateral(page);

  await secao.getByRole('button', { name: 'Emitir NF de devolução' }).click();
  await expect(secao.getByText('NF autorizada', { exact: true })).toBeVisible(AUTORIZACAO);
  await expect(page.getByText('Concluída', { exact: true }).first()).toBeVisible();
  const chave = ((await secao.getByTestId('chave-nf-devolucao').textContent()) ?? '').trim();
  expect(chave).toMatch(/^\d{44}$/);
  const danfe = await secao.getByRole('link', { name: 'Abrir DANFE (PDF)' }).getAttribute('href');
  const resposta = await page.request.get(danfe ?? '');
  expect(resposta.status()).toBe(200);
  expect(resposta.headers()['content-type']).toContain('application/pdf');
  await semRolagemLateral(page);

  // Spec §8.7: o ZIP do mês traz o XML desta nota.
  await page.goto('/fluxo/etapa/4');
  const xmls = page.locator('details', { hasText: 'Baixar XMLs do período' });
  await xmls.getByText('Baixar XMLs do período').click();
  const download = page.waitForEvent('download');
  await xmls.getByRole('button', { name: 'Baixar XMLs' }).click();
  const arquivo = await download;
  const zip = unzipSync(new Uint8Array(readFileSync(await arquivo.path())));
  expect(Object.keys(zip)).toContain(`${chave}-nfe.xml`);
});

test('Gestor corrige a regra depois da rejeição e reenvia a mesma NF', async ({ page }) => {
  test.setTimeout(150_000);
  await prepararFiscal({ naturezas: { DENTRO_ESTADO: 'Devolucao de venda REJEITAR' } });
  try {
    const dev = await devolucaoNoEstoque({ destinos: ['PROBLEMA'] });
    await entrarComo(page, USUARIOS_E2E.gestor);
    await page.goto(`/fluxo/devolucoes/${dev.codigo}`);
    const secao = page.getByRole('region', { name: 'Fiscal' });
    await secao.getByRole('button', { name: 'Emitir NF de devolução' }).click();
    await expect(secao.getByText('NF rejeitada', { exact: true })).toBeVisible(AUTORIZACAO);
    await expect(secao.getByText(/Rejeição simulada: a natureza da operação contém REJEITAR/)).toBeVisible();

    await page.goto('/configuracoes/fiscal/regras/DEVOLUCAO_VENDA/DENTRO_ESTADO');
    await page.getByLabel('Natureza da operação').fill('Devolucao de venda');
    await page.getByRole('button', { name: 'Salvar regra' }).click();
    await expect(page.getByRole('status')).toHaveText('Regra fiscal salva.');

    await page.goto(`/fluxo/devolucoes/${dev.codigo}`);
    await page.getByRole('region', { name: 'Fiscal' }).getByRole('button', { name: 'Corrigir e reenviar' }).click();
    await expect(page.getByRole('region', { name: 'Fiscal' }).getByText('NF autorizada', { exact: true })).toBeVisible(AUTORIZACAO);
    await semRolagemLateral(page);
  } finally {
    await prepararFiscal();
  }
});

test('Fiscal cancela a NF em até 24 h e a devolução volta para Aguardando NF', async ({ page }) => {
  test.setTimeout(150_000);
  await prepararFiscal();
  const dev = await devolucaoNoEstoque({ destinos: ['BOM'] });
  await entrarComo(page, USUARIOS_E2E.fiscal);
  await page.goto(`/fluxo/devolucoes/${dev.codigo}`);
  const secao = page.getByRole('region', { name: 'Fiscal' });
  await secao.getByRole('button', { name: 'Emitir NF de devolução' }).click();
  await expect(secao.getByText('NF autorizada', { exact: true })).toBeVisible(AUTORIZACAO);

  await secao.getByText('Cancelar esta NF').click();
  await secao.getByLabel('Justificativa (15 a 255 caracteres)').fill('Cliente desistiu da devolução');
  await secao.getByRole('button', { name: 'Cancelar NF' }).click();
  await expect(secao.getByText('NF cancelada. A devolução voltou para Aguardando NF.')).toBeVisible();
  await expect(page.getByText('Aguardando NF', { exact: true }).first()).toBeVisible();
  await expect(secao.getByRole('button', { name: 'Emitir NF de devolução' })).toBeVisible();
  await expect(secao.getByText(/cancelada em .*: Cliente desistiu da devolução/)).toBeVisible();
  await semRolagemLateral(page);
});

test('o Operador vê a Seção Fiscal sem botões de ação', async ({ page }) => {
  await prepararFiscal();
  const dev = await devolucaoNoEstoque({ destinos: ['BOM'] });
  await entrarComo(page, USUARIOS_E2E.operador);
  await page.goto(`/fluxo/devolucoes/${dev.codigo}`);
  const secao = page.getByRole('region', { name: 'Fiscal' });
  await expect(secao.getByRole('heading', { name: 'NF de venda', exact: true })).toBeVisible();
  await expect(secao.getByRole('button')).toHaveCount(0);
  await expect(secao.getByLabel('Arquivo XML da NF de venda')).toHaveCount(0);
  await semRolagemLateral(page);
});
```

Rode: `npm run test:e2e -- tests/e2e/fiscal-nf.spec.ts`
Esperado: PASS nos projetos `computador` e `celular` (4 testes em cada).

- [ ] **Passo 6: Rodar tudo**

Rode: `npm test && npm run test:int && npm run typecheck && npm run lint && npm run test:e2e`
Esperado: tudo PASS (inclusive os specs das Fases 0 e 1).

- [ ] **Passo 7: Commit**

```bash
cd "/c/Users/idmpc/devolucoes-wt/fase-4"
git add -A
git commit -m "feat: Seção Fiscal no detalhe (NF de venda, escolha do item, emitir, corrigir e reenviar, cancelar, XML e DANFE)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 11: Integração (contrato §7)

Feita na worktree da Fase 4 **depois que as Fases 2 e 3 já estão no `main`** (ordem de merge: 2 → 3 → 4).

**Arquivos:**
- Regenerados: `drizzle/` (uma migração só, `fase4_fiscal`), `package.json` e `package-lock.json` (os do `main` mais `fast-xml-parser@5.11.2`)
- Criar: `tests/e2e/integracao-fiscal.spec.ts`
- Nenhum arquivo congelado (contrato §3) muda nesta tarefa.

**Interfaces:**
- Consome (das fases já mergeadas, pelas assinaturas do contrato): `concluirConferencia(db, devolucaoId, usuario, agora?)` (Fase 2, contrato §5.4); tabela `evidencias` (contrato §4.1); `obterConector(db, 'MERCADO_LIVRE')` com o conector falso da Fase 3 e a tabela `contas_marketplace` (contrato §4.2 e §5.3); `interpretarXmlNotaVenda` (Tarefa 5); fábricas e apoio desta fase.
- Produz: a branch `fase-4-fiscal` pronta para `git merge --no-ff` no `main`, com a suíte inteira passando.

- [ ] **Passo 1: Trazer o `main` e resolver os conflitos pelas regras da §3**

```bash
cd "/c/Users/idmpc/devolucoes-wt/fase-4"
git merge main
```

Se houver conflito:
- `package.json` / `package-lock.json`: **nunca** junte à mão.

```bash
git checkout main -- package.json package-lock.json
npm install fast-xml-parser@5.11.2 --save-exact
git add package.json package-lock.json
```

- Arquivos que são da Fase 4 na janela (`busca.ts`, `filtros.ts`, `selos.ts`, `quadro.ts`, `CartaoDevolucao.tsx`, `QuadroFluxo.tsx`, `fluxo/page.tsx`, `src/modules/fiscal/**`, `src/conectores/nfe/**`, `src/db/schema/fiscal.ts`, `SecaoFiscal.tsx`): fica a versão da Fase 4; se o `main` trouxe uma mudança neles por emenda, aplique a mesma mudança por cima.
- Arquivo congelado com diferença: a versão é a do `main` (`git checkout main -- <arquivo>`).

Confira que nenhum arquivo congelado ficou diferente do `main`:

```bash
git diff main --stat -- src/lib/env.ts .env.example .env.producao.example src/db/schema/index.ts src/db/schema/devolucoes.ts \
  src/modules/devolucoes/dominio.ts src/modules/devolucoes/transicoes.ts src/modules/devolucoes/transicoes-item.ts \
  src/modules/auth/permissoes.ts src/components/NavAbas.tsx src/components/EtapasCelular.tsx src/components/Selo.tsx \
  "src/app/(app)/configuracoes/page.tsx" "src/app/(app)/fluxo/devolucoes/[codigo]/page.tsx" src/modules/devolucoes/detalhe.ts \
  "src/app/(app)/fluxo/etapa/[numero]/page.tsx" tests/e2e/global-setup.ts tests/e2e/apoio.ts tests/e2e/dados.ts tests/helpers/fabricas.ts \
  Dockerfile docker-compose.prod.yml README.md
```

Esperado: nenhuma linha.

- [ ] **Passo 2: Migração única da fase**

```bash
cd "/c/Users/idmpc/devolucoes-wt/fase-4"
git rm -rq drizzle && git checkout main -- drizzle
npm run db:gerar -- --name fase4_fiscal
```

Esperado: um arquivo novo `drizzle/<n>_fase4_fiscal.sql` (o `<n>` vem depois das migrações das Fases 2 e 3) só com os 4 enums e as 3 tabelas desta fase. Esta fase não tem SQL escrito à mão (`src/db/sql-manual/fase4.sql` não existe).

- [ ] **Passo 3: Recriar os bancos da fase e migrar**

```bash
cd "/c/Users/idmpc/devolucoes-wt/fase-4"
PG="/c/Program Files/PostgreSQL/17/bin"; export PGPASSWORD="$(cat /c/Users/idmpc/.postgres-superusuario.txt)"
"$PG/dropdb.exe" -U postgres --if-exists devolucoes_test_f4 && "$PG/createdb.exe" -U postgres -O devolucoes devolucoes_test_f4
"$PG/dropdb.exe" -U postgres --if-exists devolucoes_f4 && "$PG/createdb.exe" -U postgres -O devolucoes devolucoes_f4
npm run db:migrar
```

Esperado: `npm run db:migrar` aplica todas as migrações sem erro.

- [ ] **Passo 4: Escrever o teste ponta a ponta entre as fases**

`tests/e2e/integracao-fiscal.spec.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { and, asc, eq, notInArray, sql } from 'drizzle-orm';
import { obterConector } from '../../src/conectores/marketplace/registro';
import type { Db } from '../../src/db/client';
import { configuracoes, contasMarketplace, devolucoes, evidencias, itensDevolucao } from '../../src/db/schema';
import type { UsuarioSessao } from '../../src/modules/auth/usuarios';
import { concluirConferencia } from '../../src/modules/conferencia/concluir';
import { interpretarXmlNotaVenda } from '../../src/modules/fiscal/xml-nota-venda';
import { criarDevolucaoTeste } from '../helpers/fabricas';
import { criarDevolucaoNoEstoqueTeste, EMPRESA_TESTE } from '../helpers/fabricas-fiscal';
import { xmlNotaVendaTeste } from '../helpers/xml-nfe';
import { codigoUnico, comBanco, entrarComo, semRolagemLateral, usuarioPorEmail } from './apoio';
import { prepararFiscal } from './apoio-fiscal';
import { USUARIOS_E2E } from './dados';

const AUTORIZACAO = { timeout: 45_000 };

/**
 * Conferência pelo serviço da Fase 2 (contrato §5.4), com as evidências obrigatórias gravadas no banco como PRONTA.
 * A tela da conferência é da Fase 2 e já tem o próprio e2e; aqui o que importa é o dado que ela entrega à Fase 4.
 */
async function conferir(db: Db, devolucaoId: string, operador: UsuarioSessao): Promise<void> {
  const agora = new Date();
  await db.update(devolucoes).set({ status: 'EM_CONFERENCIA', conferenteId: operador.id, conferenciaIniciadaEm: agora }).where(eq(devolucoes.id, devolucaoId));
  const itens = await db.select().from(itensDevolucao).where(eq(itensDevolucao.devolucaoId, devolucaoId)).orderBy(asc(itensDevolucao.unidade));
  await db.update(itensDevolucao).set({ destino: 'BOM', produtoRecebidoId: itens[0].produtoEsperadoId }).where(eq(itensDevolucao.id, itens[0].id));
  await db
    .update(itensDevolucao)
    .set({ destino: 'PROBLEMA', motivo: 'AVARIADO', produtoRecebidoId: itens[1].produtoEsperadoId })
    .where(eq(itensDevolucao.id, itens[1].id));
  const evidencia = (tipo: 'FOTO_1_ETIQUETA' | 'FOTO_2_EMBALAGEM' | 'FOTO_3_PRODUTO' | 'FOTO_4_CODIGO_SERIAL' | 'VIDEO_PROVA', itemId: string | null) => ({
    devolucaoId,
    itemId,
    tipo,
    tipoConteudo: tipo === 'VIDEO_PROVA' ? 'video/mp4' : 'image/jpeg',
    caminho: `evidencias/${devolucaoId}/${randomUUID()}.${tipo === 'VIDEO_PROVA' ? 'mp4' : 'jpg'}`,
    provedor: 'disco',
    // Se a Parte A declarou as colunas bigint com mode 'bigint', use 1n.
    tamanhoOriginal: 1,
    tamanho: 1,
    sha256Original: 'integracao-fase-4',
    sha256Final: 'integracao-fase-4',
    situacaoProcessamento: 'PRONTA' as const,
    idCliente: randomUUID(),
    enviadoPor: operador.id,
  });
  await db.insert(evidencias).values([
    evidencia('FOTO_1_ETIQUETA', null),
    evidencia('FOTO_2_EMBALAGEM', null),
    evidencia('VIDEO_PROVA', null),
    ...itens.flatMap((item) => [evidencia('FOTO_3_PRODUTO', item.id), evidencia('FOTO_4_CODIGO_SERIAL', item.id)]),
  ]);
  // Se a Fase 2 recusar por outro requisito, preencha esse dado de conferência aqui (é dado de teste); não mude a Fase 2.
  expect(await concluirConferencia(db, devolucaoId, operador)).toEqual({ status: 'AGUARDANDO_NF' });
}

test('jornada entre as fases: recebimento → conferência → Estoque Bom e Estoque Problema → NF autorizada → cancelamento → nova NF', async ({ page }) => {
  test.setTimeout(240_000);
  await prepararFiscal();
  const sku = codigoUnico('INT');
  const rastreio = codigoUnico('INTR');
  const dev = await comBanco(async (db) => {
    const operador = await usuarioPorEmail(db, USUARIOS_E2E.operador.email);
    return criarDevolucaoTeste(db, operador, { rastreio, itens: [{ sku, quantidade: 2 }] });
  });

  // Etapa 2 do PDF: o Operador registra a chegada pela tela de Recebimento.
  await entrarComo(page, USUARIOS_E2E.operador);
  await page.goto('/fluxo/recebimento');
  const campo = page.getByLabel('Código de Rastreamento');
  await campo.fill(rastreio);
  await campo.press('Enter');
  await expect(page.getByRole('status')).toContainText('Chegada registrada');

  // Etapa 3: a conferência da Fase 2 deixa uma unidade em Estoque Bom e outra em Estoque Problema.
  await comBanco(async (db) => conferir(db, dev.id, await usuarioPorEmail(db, USUARIOS_E2E.operador.email)));

  // Etapa 4: a devolução aparece nas duas abas.
  await page.context().clearCookies();
  await entrarComo(page, USUARIOS_E2E.fiscal);
  await page.goto('/fluxo/etapa/4');
  await expect(page.getByRole('link', { name: new RegExp(dev.codigo) })).toContainText('Estoque Bom: 1');
  await page.goto('/fluxo/etapa/4/problema');
  await expect(page.getByRole('link', { name: new RegExp(dev.codigo) })).toContainText('Estoque Problema: 1');
  await semRolagemLateral(page);

  // NF de venda anexada, NF de devolução emitida e autorizada.
  const { xml } = xmlNotaVendaTeste({ cnpjEmitente: EMPRESA_TESTE.cnpj, itens: [{ codigo: sku, quantidade: 2, valorUnitario: 60 }] });
  await page.goto(`/fluxo/devolucoes/${dev.codigo}`);
  const secao = page.getByRole('region', { name: 'Fiscal' });
  await secao.getByLabel('Arquivo XML da NF de venda').setInputFiles({ name: 'venda.xml', mimeType: 'application/xml', buffer: Buffer.from(xml) });
  await secao.getByRole('button', { name: 'Anexar XML' }).click();
  await expect(secao.getByText('NF de venda anexada.')).toBeVisible();
  await secao.getByRole('button', { name: 'Emitir NF de devolução' }).click();
  await expect(secao.getByText('NF autorizada', { exact: true })).toBeVisible(AUTORIZACAO);
  await expect(page.getByText('Concluída', { exact: true }).first()).toBeVisible();

  // Cancelamento: a devolução volta para Aguardando NF e uma NF nova sai (outro ref).
  await secao.getByText('Cancelar esta NF').click();
  await secao.getByLabel('Justificativa (15 a 255 caracteres)').fill('Teste de integração entre as fases');
  await secao.getByRole('button', { name: 'Cancelar NF' }).click();
  await expect(secao.getByText('NF cancelada. A devolução voltou para Aguardando NF.')).toBeVisible();
  await secao.getByRole('button', { name: 'Emitir NF de devolução' }).click();
  await expect(secao.getByText('NF autorizada', { exact: true })).toBeVisible(AUTORIZACAO);
  await expect(secao.getByText(/cancelada em .*: Teste de integração entre as fases/)).toBeVisible();
});

test('NF de venda do Mercado Livre (conector falso da Fase 3) e rejeição → correção → reenvio', async ({ page }) => {
  test.setTimeout(240_000);
  // O registro só devolve o conector com uma conta ATIVA (contrato §5.3). Se a Fase 3 tiver uma fábrica de conta, use-a aqui.
  await comBanco(async (db) => {
    await db
      .insert(contasMarketplace)
      .values({ canal: 'MERCADO_LIVRE', sellerId: 'E2E-FISCAL', accessToken: 'falso', refreshToken: 'falso', expiraEm: new Date(Date.now() + 6 * 60 * 60 * 1000) })
      .onConflictDoNothing();
  });
  const exemplo = await comBanco(async (db) => {
    const conector = await obterConector(db, 'MERCADO_LIVRE');
    if (!conector) return null;
    for await (const externa of conector.listarAtualizadasDesde(new Date(0))) {
      for (const pedido of externa.pedidos) {
        const xml = await conector.obterXmlNotaVenda(pedido);
        if (xml) return { pedido, xml };
      }
    }
    return null;
  });
  expect(exemplo, 'o conector falso da Fase 3 precisa estar ativo no e2e e ter uma NF de venda de exemplo').not.toBeNull();
  if (!exemplo) return;
  // Se o XML de exemplo da Fase 3 não passar aqui (ex.: sem o protocolo), é um achado de integração: combine uma emenda com a Fase 3.
  const venda = interpretarXmlNotaVenda(exemplo.xml);

  await prepararFiscal({ naturezas: { DENTRO_ESTADO: 'Devolucao de venda REJEITAR', FORA_ESTADO: 'Devolucao de venda REJEITAR' } });
  try {
    const dev = await comBanco(async (db) => {
      await db.update(configuracoes).set({ cnpj: venda.cnpjEmitente });
      // A varredura da Fase 3 pode já ter criado a devolução deste pedido: ela sai do caminho para o teste usar a sua.
      await db
        .update(devolucoes)
        .set({ status: 'CANCELADA' })
        .where(
          and(
            eq(devolucoes.canal, 'MERCADO_LIVRE'),
            sql`${exemplo.pedido} = any(${devolucoes.pedidosExternos})`,
            notInArray(devolucoes.status, ['CANCELADA', 'EXTRAVIADA', 'CONCLUIDA']),
          ),
        );
      const gestor = await usuarioPorEmail(db, USUARIOS_E2E.gestor.email);
      return criarDevolucaoNoEstoqueTeste(db, gestor, {
        canal: 'MERCADO_LIVRE',
        pedido: exemplo.pedido,
        unidades: [{ sku: venda.itens[0].codigo, destino: 'BOM' }],
      });
    });

    await entrarComo(page, USUARIOS_E2E.gestor);
    await page.goto(`/fluxo/devolucoes/${dev.codigo}`);
    const secao = page.getByRole('region', { name: 'Fiscal' });
    await expect(secao.getByRole('button', { name: 'Buscar no Mercado Livre' })).toBeVisible();
    // "Emitir" busca a NF de venda no conector antes de montar (contrato §5.8).
    await secao.getByRole('button', { name: 'Emitir NF de devolução' }).click();
    await expect(secao.getByText('NF rejeitada', { exact: true })).toBeVisible(AUTORIZACAO);
    await expect(secao.getByText(/^Mercado Livre/)).toBeVisible();

    for (const operacao of ['DENTRO_ESTADO', 'FORA_ESTADO']) {
      await page.goto(`/configuracoes/fiscal/regras/DEVOLUCAO_VENDA/${operacao}`);
      await page.getByLabel('Natureza da operação').fill('Devolucao de venda');
      await page.getByRole('button', { name: 'Salvar regra' }).click();
      await expect(page.getByRole('status')).toHaveText('Regra fiscal salva.');
    }
    await page.goto(`/fluxo/devolucoes/${dev.codigo}`);
    await page.getByRole('region', { name: 'Fiscal' }).getByRole('button', { name: 'Corrigir e reenviar' }).click();
    await expect(page.getByRole('region', { name: 'Fiscal' }).getByText('NF autorizada', { exact: true })).toBeVisible(AUTORIZACAO);
  } finally {
    await prepararFiscal();
  }
});
```

Se a Fase 3 tiver outro nome para a tabela ou colunas da conta (o contrato §4.2 fixa `contas_marketplace` com `canal`, `seller_id`, `access_token`, `refresh_token`, `expira_em`, `situacao`), use o nome do `main`.

- [ ] **Passo 5: Rodar tudo**

```bash
cd "/c/Users/idmpc/devolucoes-wt/fase-4"
npm run typecheck && npm run lint && npm test && npm run test:int && npm run build:scripts && npm run test:e2e
```

Esperado: tudo PASS, nos projetos `computador` e `celular`, inclusive os specs das Fases 0 a 3.

- [ ] **Passo 6: Commit**

```bash
cd "/c/Users/idmpc/devolucoes-wt/fase-4"
git add -A
git commit -m "chore: integração da Fase 4 com o main (migração fase4_fiscal, lockfile refeito e e2e entre as fases)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Depois disso, quem integra faz no `main` (contrato §7): `git merge --no-ff fase-4-fiscal`, recria o `devolucoes_test`, roda a suíte inteira, `npm run db:migrar` no banco `devolucoes`, apaga a worktree e os bancos `_f4`, e atualiza o README. Push e deploy ficam com o usuário.

---

## Depois da fase (controlador e usuário)

**Pontos que o contador valida antes da produção (spec §8.3, §16):**
1. CFOP das 6 combinações (sugestões da decisão 17), em especial troca e garantia (5949/6949 ou 5202/6202).
2. CSOSN/CST do ICMS na devolução de venda (sugestão: CSOSN 900 no Simples; CST 00 no Presumido e no Real, que só serve se a venda foi tributada; ST e isenção pedem outro CST).
3. CST de PIS e COFINS na devolução (sugestão 98) e nas remessas (sugestão 49); no Lucro Real, se cabe crédito (50 a 56).
4. Valores da NF de devolução: valor unitário da venda sem o desconto (decisão 7), tributos proporcionais por unidade, `consumidor_final` pelo indicador de IE, `presenca_comprador` 0.
5. Informações complementares (modelo com `{chaves}` e `{devolucao}`).
6. O que fazer depois das 24 h sem cancelamento (nota de estorno).

**Ligação das contas reais (contrato §9, antes da Fase 6), checklist da Focus NFe em homologação:**
1. Empresa cadastrada no painel da Focus com o certificado A1, série exclusiva e próximo número; `EMISSOR_NFE=focus` e `FOCUS_TOKEN_HOMOLOGACAO` no `.env` da VPS.
2. Emitir uma NF de devolução de teste e conferir: o payload é aceito (sem `erro_validacao_schema`); `codigo_barras_comercial: "SEM GTIN"` passa; `presenca_comprador: 0` passa; a série e o número que voltam batem com o cadastro.
3. Conferir que `caminho_xml_nota_fiscal` e `caminho_danfe` baixam no host do ambiente com o Basic (decisão não confirmada na documentação). Se não, ajustar só `baixar` em `src/conectores/nfe/focus.ts`.
4. Cancelar a nota de teste e conferir o `caminho_xml_cancelamento`.
5. Uma rejeição real (ex.: CFOP de saída numa devolução) mostra o motivo da SEFAZ em português na Seção Fiscal.
