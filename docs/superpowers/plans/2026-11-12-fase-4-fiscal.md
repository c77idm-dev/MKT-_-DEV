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
- Testes: `tests/helpers/fabricas-fiscal.ts`, `tests/helpers/xml-nfe.ts`, `tests/helpers/fila-fiscal.ts`, `tests/e2e/apoio-fiscal.ts`, `tests/e2e/fiscal-*.spec.ts`, `tests/e2e/integracao-fiscal.spec.ts`, e `src/**/*.test.ts(x)` novos.
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
    notas.ts, emissao.ts, ciclo.ts            emissão, reenvio, consulta, autorização e rejeição
    cancelamento.ts                           cancelamento em 24 h (spec §8.6)
    xmls-periodo.ts                           ZIP dos XMLs do período (spec §8.7)
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
  helpers/fabricas-fiscal.ts, xml-nfe.ts, fila-fiscal.ts
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
