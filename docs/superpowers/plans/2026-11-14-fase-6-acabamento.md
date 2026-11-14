# Fase 6 (Acabamento): Plano de Implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar este plano tarefa por tarefa. Os passos usam checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** fechar o sistema para o uso diário e para a produção. Entra o que a spec §14 pede para a Fase 6 ("Painel com alertas, Falhas, prazo de guarda, backup, passagem para produção"): os **alertas do painel** (spec §6.0.1, §7.1, §7.3 e §11), a tela **Falhas** com "tentar de novo" (spec §6.8 e §11), a tarefa diária **`midia.retencao`** (spec §9), o **backup diário** cifrado para fora da VPS, com a restauração documentada e testada (spec §10). Entram também as pendências da Fase 6 do `andamento.md`: limite de login por IP, cabeçalhos de segurança com `poweredByHeader: false`, `/api/saude` com 503 em qualquer falha e o healthcheck dos containers. E as sobras que pertencem ao acabamento: a LGPD das planilhas importadas e os logs em JSON do `web` (spec §11). Critério de pronto da spec §14: "Restauração de backup testada; NF em produção aprovada pelo contador". As duas coisas acontecem na VPS e com o contador: o plano entrega os scripts, os testes locais e o roteiro pronto para colar (seção "Depois da fase").

**Arquitetura:**
- A regra fica em `src/modules/acabamento/`. As funções puras têm teste unitário; o que grava no banco tem teste de integração. As telas só leem desses módulos.
- **Falhas:** cada fila do pg-boss ganha o `deadLetter` `falhas`. Quando um job esgota as 5 tentativas (spec §11), o pg-boss o copia para a fila `falhas`, inclusive quando ele estourou o tempo ou o worker morreu. O worker consome essa fila e grava a falha numa tabela própria, `falhas_tarefas`. A tabela é necessária porque o pg-boss apaga os jobs falhos em 7 dias. "Tentar de novo" envia a mesma tarefa outra vez, pela fila normal.
- **Alertas:** uma função por alerta, mais `carregarAlertas(db, perfil)`, que monta só os alertas do perfil. O painel (`/fluxo`) mostra uma linha por alerta, e a página `/fluxo/alertas` (extra) lista as devoluções de cada um.
- **Backup:** um serviço `backup` no `docker-compose.prod.yml`, com a imagem `postgres:17-alpine` (o mesmo `pg_dump` do banco). Ele roda `rclone` e `openssl`, e os scripts ficam em `docker/backup/`. O script de backup é testado no PC com o `pg_dump` e o `openssl` de verdade e um `rclone` falso.
- Telas mobile-first (390×844 primeiro): cartões, alvos de 44 px e mensagens numa área `aria-live` que sobrevive à troca do conteúdo.

**Tecnologias:** Next.js 16.4.6 (App Router), React 19.3, TypeScript strict, Drizzle ORM 0.45 + postgres.js, PostgreSQL, pg-boss 12.38.0 (`deadLetter`, `work` com `includeMetadata`), zod 4, Tailwind v4, Vitest 5, Testing Library, Playwright. **Nenhuma dependência npm nova.** Só no container de backup: `rclone`, `openssl` e `tzdata`, do `apk` do Alpine.

**Spec:** [docs/superpowers/specs/2026-11-11-gestao-devolucoes-design.md](../specs/2026-11-11-gestao-devolucoes-design.md). Leia §2, §5.2 ("Entregue (ML)" sem leitura), §6.0.1, §6.8 (Falhas), §6.9, §7.1 (RECONECTAR), §7.3 (status depois da chegada), §9 (prazo de guarda), §10, §11, §12, §13 e §14.
**Contrato (obrigatório, vale mais que este plano):** [2026-11-12-contrato-fases-2-6.md](2026-11-12-contrato-fases-2-6.md): §1 (a Fase 6 vem depois de todas), §3 (dono dos arquivos, migrações `fase6_acabamento`), §4.6 (`ml_status_apos_chegada`: "o alerta é da Fase 6"), §4.7 (`midia_apagada_retencao`, `tarefa_reenviada`), §5.1 (`midia.retencao` às 03h00; 5 tentativas), §5.2, §7 e §10 (E4, E15, E17 e E18).
**Planos anteriores que este consome:** [Fase 2](2026-11-12-fase-2-conferencia.md) (evidências, limpeza), [Fase 3](2026-11-12-fase-3-mercado-livre.md) (conta, sincronização, contestações), [Fase 4](2026-11-12-fase-4-fiscal.md) (notas, ambiente) e [Fase 5](2026-11-14-fase-5-remessas.md) (lotes, `SEM_FORNECEDOR`, `lote_alerta_nf_cancelada`).

## Restrições globais

**Onde trabalhar**
- A Fase 6 **não é paralela**: começa no `main` depois que a Fase 5 foi juntada (contrato §1 e §7). Uma worktree só: `/c/Users/JEFFERSON LIMA/devolucoes-wt/fase-6`, branch `fase-6-acabamento`.
- `.env` da worktree:
  - bancos: `DATABASE_URL=postgres://devolucoes:devolucoes@localhost:5433/devolucoes_f6` e `DATABASE_URL_TEST=postgres://devolucoes:devolucoes@localhost:5433/devolucoes_test_f6`;
  - porta do e2e: `PORTA_E2E=3106`;
  - falsos e mídia: `EMISSOR_NFE=falso`, `ML_CONECTOR=falso`, `ARMAZENAMENTO=disco`.
  - `next dev` usa a porta 3006 (`npm run dev -- --port 3006`).
  - Neste PC o PostgreSQL do projeto é o 18, na **porta 5433**. A 5432 é de outra coisa: não mexa.
- Criar a worktree e os bancos (Git Bash, uma vez, **depois da Tarefa 0** e antes da Tarefa 1):

```bash
cd "/c/Users/JEFFERSON LIMA/MKT-_-DEV"
git log --oneline -3 main   # tem de conter o merge da Fase 5 (fase-5-remessas) e o commit da Tarefa 0 (E19)
git worktree add -b fase-6-acabamento "/c/Users/JEFFERSON LIMA/devolucoes-wt/fase-6" main
PG="/c/Program Files/PostgreSQL/18/bin"; export PGPASSWORD="$(cat "/c/Users/JEFFERSON LIMA/.postgres-superusuario.txt")"
# A instância do projeto não é serviço: se não responder, suba-a (andamento.md, "Segundo PC").
"$PG/pg_isready.exe" -h localhost -p 5433 || "$PG/pg_ctl.exe" -D "/c/Users/JEFFERSON LIMA/pg-devolucoes/data" -l "/c/Users/JEFFERSON LIMA/pg-devolucoes/postgres.log" start
"$PG/pg_isready.exe" -h localhost -p 5433   # esperado: "localhost:5433 - accepting connections"
"$PG/createdb.exe" -h localhost -p 5433 -U postgres -O devolucoes devolucoes_f6
"$PG/createdb.exe" -h localhost -p 5433 -U postgres -O devolucoes devolucoes_test_f6
# O teste da restauração (Tarefa 10) cria e apaga o banco devolucoes_restauracao_f6_teste: o usuário precisa de CREATEDB.
"$PG/psql.exe" -h localhost -p 5433 -U postgres -c "alter role devolucoes createdb"
cp .env "/c/Users/JEFFERSON LIMA/devolucoes-wt/fase-6/.env"   # depois troque DATABASE_URL, DATABASE_URL_TEST e PORTA_E2E
cd "/c/Users/JEFFERSON LIMA/devolucoes-wt/fase-6"
npm ci && npm run db:migrar && npx playwright install chromium
```

- Windows com Git Bash. O caminho tem espaço: **use aspas sempre**. Todos os comandos deste plano rodam na pasta da worktree: `cd "/c/Users/JEFFERSON LIMA/devolucoes-wt/fase-6"`.
- A Tarefa 10 roda `pg_dump`, `pg_restore`, `psql`, `createdb`, `dropdb` e `openssl` do PC: `PG_BIN` aponta para `C:/Program Files/PostgreSQL/18/bin` (padrão do teste). O `openssl` e o `sh` vêm do Git for Windows.
- **Acentos no `psql` do Windows:** um texto com acento passado por `-v` chega ao `psql.exe` convertido para ANSI e é recusado ("invalid multibyte character"). Os scripts mandam texto livre (mensagens de erro) **pela entrada padrão**; só valores ASCII (uuid, números, caminhos gerados) vão por `-v`.

**Arquivos que esta fase pode editar**
- Cria ou edita:
  - `src/db/schema/acabamento.ts` (troca o `export {};` da Tarefa 0), `src/modules/acabamento/**`, `src/worker/manipuladores/acabamento.ts`, `src/worker/batimento.ts`;
  - `src/components/acabamento/**`, `src/app/(app)/configuracoes/falhas/**` (troca o `EmBreve`), `src/app/(app)/fluxo/alertas/**`;
  - `src/lib/cabecalhos-seguranca.ts`, `src/lib/log.ts`, `src/instrumentation.ts`, `src/modules/auth/limite-login.ts`, `src/modules/saude/resposta.ts`;
  - `docker/backup/**`, `docs/operacao/backup-restauracao.md`.
- Edição pequena e permitida (a Fase 6 roda sozinha, depois das outras; contrato §3: "A 6 acrescenta o backup", "A 6 mexe depois (alertas no painel)"):
  - fila e worker: `src/modules/fila/fila.ts` e o teste dele (fila `falhas` e `deadLetter`), `src/worker/index.ts` (consumidor da fila `falhas`), `scripts/worker.ts` (batimento);
  - banco: `src/db/schema/historico.ts` (só o índice `(acao, em)`);
  - painel: `src/modules/devolucoes/busca.ts` (opção `ids`), `src/modules/devolucoes/selos.ts` (usa `prazoVencendo`), `src/app/(app)/fluxo/page.tsx` (bloco Alertas);
  - login e saúde: `src/app/login/acoes.ts` (limite por IP), `src/app/api/saude/route.ts`;
  - infraestrutura: `next.config.ts`, `docker-compose.prod.yml`, `docs/operacao/deploy-vps.md`.
- Testes: `tests/helpers/fabricas-acabamento.ts`, `tests/e2e/apoio-acabamento.ts`, `tests/e2e/{falhas,alertas,seguranca}.spec.ts`, `scripts/infra.test.ts`, e `src/**/*.test.ts(x)` novos. Ajuste pequeno e permitido: `tests/e2e/configuracoes.spec.ts` (Tarefa 11, só a expectativa do "Em breve" de Falhas) e `tests/e2e/saude.spec.ts` (Tarefa 13, só testes novos).
- **Nunca** mexa nestes arquivos:
  - ambiente e scripts: `src/lib/env.ts`, `.env.example` (a Fase 6 não cria variável lida pelo sistema), `package.json` (scripts e dependências), `src/modules/fila/tarefas.ts` (`midia.retencao` já existe; `falhas` não é uma `NomeTarefa`);
  - congelados que só mudam pela Tarefa 0, no `main`: `src/db/schema/index.ts`, `src/modules/historico/rotulos/*.ts`, `.env.producao.example` e o contrato;
  - permissões e navegação: `permissoes.ts`, `NavAbas.tsx`, `configuracoes/page.tsx` (o cartão "Falhas" já existe);
  - código das Fases 2 a 5: `src/modules/{conferencia,midia,mercado-livre,fiscal,lotes}/**`, `src/conectores/**`, `Dockerfile`, `docker/nginx/devolucoes.conf` (**nada no nginx nesta fase**);
  - testes congelados: `tests/e2e/global-setup.ts`, `apoio.ts`, `dados.ts`, `tests/helpers/fabricas*.ts` das outras fases;
  - `README.md`: só quem integra edita.

**Ambiente e ferramentas**
- Node 24 e npm. O Next.js 16 tem mudanças (veja `AGENTS.md` e `node_modules/next/dist/docs/`):
  - `params` e `searchParams` são **Promise**;
  - `redirect()` lança exceção: chame **fora** do `try/catch`;
  - um arquivo com `'use server'` só exporta funções async (e `type`);
  - o `instrumentation.ts` exporta `onRequestError` (`01-app/03-api-reference/03-file-conventions/instrumentation.md`);
  - para a CSP sem nonce, siga `01-app/02-guides/content-security-policy.md`, "Without Nonces".
- Os arquivos de `src/db/schema/`, e **tudo o que eles importam em tempo de execução**, usam imports relativos, nunca `@/`. `src/modules/acabamento/dominio.ts` é importado pelo schema: use imports relativos ou `import type`.
- Migrações: nesta branch, `npm run db:gerar -- --name fase6_acabamento`. A migração é descartada e gerada de novo na Tarefa 14 (contrato §3).

**Produto e textos**
- Interface só em português do Brasil. Nomes da spec:
  - "Falhas" e "tentar de novo" (§6.8; o botão é **"Tentar de novo"**);
  - os alertas da §6.0.1: "Prazo do ML vencendo", "NF rejeitada", "Sincronização com o ML parada há mais de 1 h", "Itens sem fornecedor" (o `SEM_FORNECEDOR` da spec) e, com (extra), "Entregue (ML) sem leitura física";
  - o prazo de guarda (§9) e o rótulo "Apagada (prazo de guarda)", que já existe.
- O que vai além do PDF/spec fica marcado **(extra)** no código (comentário) e neste plano.

**Mobile-first (exigência do usuário)**
- Toda tela é desenhada e testada primeiro em 390×844 e cresce para o computador (`md:`). Sem rolagem lateral (`semRolagemLateral` no e2e). Listas em cartões.
- Toque mínimo de 44 px (`min-h-11`), contraste ≥ 4,5:1 (cores do `globals.css` e `TomSelo`). Erros vão para a `ListaErros`, que recebe o foco (`useEnvioFormulario`).
- Componentes React são puros: nada de `new Date()` na renderização; datas formatadas nos módulos (`formatarDataHora`).
- Todo e2e roda nos projetos `computador` e `celular`.

**Segurança e LGPD**
- Permissão checada no servidor em toda página, Server Action e Route Handler (`exigirPermissao`):
  - `ver_listas`: o painel e `/fluxo/alertas`, cada perfil vendo só os seus alertas;
  - `administrar`: Falhas, "Tentar de novo" e "Dispensar" (spec §6.9: "Falhas" é do Gestor).
- Ids que chegam por formulário são conferidos com `ehUuid` antes de qualquer uso.
- O que **nunca** vai para log, tela ou falha:
  - pilha de erro, cabeçalhos (cookies), corpo de requisição;
  - a query string das URLs, que pode ter rastreio ou pedido;
  - a senha do backup.
- A mensagem de uma falha guarda só o `message`, com até 500 caracteres.
- Segredos nunca vão para o git. As variáveis `BACKUP_*` ficam só no `.env.producao` da VPS.

**Testes e commits**
- TDD: teste que falha → implementação → teste passa.
  - Unitário: `npm test` (`src/**/*.test.{ts,tsx}` e `scripts/**/*.test.ts`).
  - Integração: `npm run test:int` (`src/**/*.int.test.ts`, banco `devolucoes_test_f6`).
  - Ponta a ponta: `npm run test:e2e` (projetos `computador` e `celular`, porta 3106). Pare o `npm run dev` antes do e2e.
- O e2e sobe o servidor **e o worker** com os falsos (`PERMITIR_FALSOS=1` só no `AMBIENTE_E2E`; contrato §10, E1). O worker do e2e grava o log em `.dados-e2e/worker.log`.
- Toda mensagem de commit termina com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. O push da branch `fase-6-acabamento` fica com o fluxo dos times (andamento); **nunca** faça push no `main`.

## Decisões que a spec e o contrato não fixaram (o usuário pode vetar)

1. **Como as falhas chegam à tela.** Toda fila do pg-boss ganha `deadLetter: 'falhas'`. O worker consome a fila `falhas` (`work` com `includeMetadata`) e grava em `falhas_tarefas`.
   - A tabela é própria porque o pg-boss apaga os jobs falhos depois de 7 dias (`deleteAfterSeconds`).
   - O `deadLetter` pega também o job que estourou o tempo ou cujo worker morreu na 5ª tentativa (um `catch` no worker não pegaria esses).
   - `falhas` é uma fila do pg-boss e **não** uma `NomeTarefa`: ninguém a envia (emenda E19).
2. **Uma falha aberta por (tarefa, dados).** Se a mesma tarefa falhar de novo com os mesmos dados, a falha ABERTA soma em `ocorrencias` e passa a mostrar o último erro e a última hora. Assim, a `ml.varredura` de 15 em 15 minutos, com o ML fora do ar, vira **um** cartão "falhou 12 vezes", e não 96 cartões por dia. O mesmo job entregue duas vezes pela fila conta uma vez só.
3. **"Tentar de novo" (spec).**
   - Envia de novo a mesma tarefa com os mesmos dados, **sem** `chaveUnica`. A chave do job original ainda existe por 7 dias e engoliria o reenvio (E4).
   - A falha vira REENVIADA. Se a tarefa falhar outra vez, nasce outra falha ABERTA.
   - Em `nfe.consultar`, o reenvio repete a última consulta (mais 5 tentativas). Ele não zera a contagem, porque as chaves da série antiga ainda existem e engoliriam as consultas seguintes.
4. **(extra) "Dispensar"** (ABERTA → DISPENSADA, com confirmação em dois toques) serve para a falha que não tem mais conserto. Sem isso, a lista só cresceria. Chave nova `tarefa_dispensada` (E19).
5. **Histórico das Falhas:** os eventos `tarefa_reenviada` e `tarefa_dispensada` vão para a entidade `configuracao`, id `falhas`, com `{ falhaId, tarefa }`. A própria falha guarda quem a tratou e quando (`resolvida_por`, `resolvida_em`).
6. **Mensagem do erro:** só o `message`, sem a pilha, até 500 caracteres, sem caracteres de controle. Segue a pendência da Fase 3 "não registrar o corpo cru dos erros". O tempo esgotado do pg-boss chega como `{ value: { message: 'job timed out' } }` e aparece como **"Tempo esgotado"**. A função (`mensagemDoErro`) mora em `src/lib/log.ts`, que é puro; `falhas.ts` importa dali.
7. **Prazo de guarda (spec §9).**
   - (a) "Contestação ainda não resolvida" = AGUARDANDO_GESTOR ou FALHOU; ENVIADA conta como resolvida.
   - (b) Também bloqueiam a limpeza: unidade num lote que não está FINALIZADO, e **qualquer unidade com `destino = 'PROBLEMA'` que ainda não está RESOLVIDO**. A regra cobre `SEM_FORNECEDOR`, `EM_LOTE`, `ENVIADO` e a unidade PROBLEMA que ficou em AGUARDANDO_NF numa devolução CONCLUIDA (D11, até a `lotes.alocar-pendentes` rodar).
   - (c) Só sai **mídia**: Fotos, Vídeo de Prova e extras. O XML e o DANFE das NF e o XML da NF de venda nunca saem: são guarda fiscal.
   - (d) O arquivo é apagado primeiro (`armazenamentoDoProvedor(provedor)`, E15) e o temporário também; só depois a linha vira APAGADA, com `caminho` e `caminho_temporario` vazios. Os hashes, o tipo e quem enviou ficam. Arquivo que já sumiu não é erro. Se a gravação falhar depois de apagar, a próxima rodada termina o serviço.
   - (e) Rodadas de 50 devoluções, até 4 minutos por execução (a tarefa expira em 300 s). O que sobrar fica para o dia seguinte.
   - (f) O evento `midia_apagada_retencao` vai para a devolução, com `{ evidencias: N }`.
8. **LGPD das planilhas.** A pendência "limpar os uploads de planilha abandonados" já foi resolvida na Fase 2: a `limpeza.temporarios` apaga as importações PENDENTE com mais de 1 dia. A Fase 6 completa a regra da spec §10 ("guardar só o mínimo"): a importação CONCLUIDA há mais de **30 dias** perde as `linhas`, a planilha crua, que pode ter colunas com dados do comprador que o mapeamento ignorou. O resumo e os cabeçalhos ficam, e a tela da importação concluída só mostra o resumo. A limpeza roda junto com a `midia.retencao`.
9. **Quem vê cada alerta:**

| Alerta | Operador | Fiscal | Gestor | Leva para |
|---|:-:|:-:|:-:|---|
| Prazo do ML vencendo (devoluções antes da conferência; contestações só para o Gestor) | ✓ | | ✓ | `/fluxo/alertas#prazo_ml` |
| NF rejeitada (de devolução ou de remessa) | | ✓ | ✓ | `/fluxo/alertas#nf_rejeitada` |
| Conta do Mercado Livre precisa ser reconectada (spec §7.1) | | | ✓ | `/configuracoes/mercado-livre` |
| Sincronização com o ML parada há mais de 1 h | | | ✓ | `/configuracoes/mercado-livre` |
| Itens sem fornecedor | | ✓ | ✓ | `/lotes/sem-fornecedor` |
| (extra) Entregue (ML) sem leitura física | ✓ | | ✓ | `/fluxo/alertas#entregue_sem_leitura` |
| Status do ML mudou depois da chegada (spec §7.3: "alerta para o Gestor"; só cancelamento ou extravio, decisão 10) | | | ✓ | `/fluxo/alertas#ml_status_apos_chegada` |
| (extra) NF cancelada com o lote já adiante (Fase 5, decisão 13) | | ✓ | ✓ | `/fluxo/alertas#lote_nf_cancelada` |
| (extra) Tarefas em Falhas | | | ✓ | `/configuracoes/falhas` |
| (extra) Backup diário atrasado | | | ✓ | `/configuracoes/falhas` |
| (extra) Disco do servidor quase cheio (spec §16: "monitorar o uso") | | | ✓ | `/configuracoes/conferencia` |

10. **Alertas que nascem de um evento** ("Status do ML mudou depois da chegada" e "NF cancelada com o lote já adiante") ficam no painel por **7 dias** e somem sozinhos, sem botão "ciente". O registro continua no histórico.
    - A Fase 3 grava `ml_status_apos_chegada` em **qualquer** troca do `statusCanal` depois da leitura física (ex.: `shipped` → `delivered`, que é a vida normal de quase toda devolução do ML). O alerta conta **só** os eventos cujo `dados.statusCanal` é de encerramento no ML: os status de `STATUS_ML_CANCELAMENTO` ou `STATUS_ML_EXTRAVIO` (`src/modules/mercado-livre/status.ts`), os mesmos que antes da chegada levariam a CANCELADA ou EXTRAVIADA. É o caso que o Gestor precisa ver (spec §7.3).
11. **"Prazo do ML vencendo"** usa a mesma regra do selo do cartão: prazo em até 24 h, ou já vencido. Valem as devoluções em PENDENTE_CHEGADA, AGUARDANDO_CONFERENCIA ou EM_CONFERENCIA e, para o Gestor, as contestações AGUARDANDO_GESTOR ou FALHOU. A regra vira uma função só, `prazoVencendo`, que o selo passa a usar.
12. **"2 dias úteis"** (spec §5.2, extra): de segunda a sexta, no fuso de Brasília, sem feriados. Contam os dias úteis inteiros **depois** do dia da entrega. Ex.: entregue na sexta, o alerta aparece na terça.
13. **Painel:** um bloco "Alertas" no topo do Fluxo, acima da Busca Avançada, com uma linha por alerta (título, contagem e link). Sem alertas, o bloco não aparece. O Gestor pode ter até 11 linhas: em 390×844 isso empurraria o quadro para fora da tela, então o painel mostra **as 3 primeiras** (na ordem de prioridade da decisão 9) e o link **"Ver todos os alertas (N)"**. **(extra)** A página `/fluxo/alertas` mostra a lista inteira no topo e, abaixo, os cartões das devoluções de cada alerta (no celular, cartões; nada de tabela).
14. **Limite de login por IP:**
    - 20 tentativas **que falham** a cada 15 minutos, por IP. Só as falhas contam, porque o escritório inteiro sai pelo mesmo IP e o turno começa com todo mundo entrando.
    - A contagem fica em memória (um processo `web`), num mapa limitado a 10 mil IPs. Com o mapa cheio, saem primeiro as janelas vencidas e depois as **mais antigas** (nunca um `clear()`, que soltaria um atacante no meio da janela).
    - IPv6 conta por **/64** (os 4 primeiros grupos): um só cliente IPv6 costuma ter a /64 inteira e trocaria de endereço a cada tentativa.
    - Com o IP bloqueado, a senha nem é conferida.
    - Soma-se ao bloqueio por usuário que já existe (5 falhas, 15 minutos). O IP é o último do `X-Forwarded-For`, que o nginx da VPS escreve (`ipDaRequisicao`).
15. **Cabeçalhos de segurança** (todas as páginas; as rotas `/api/` ficam de fora da regra, com `source: "/((?!api/).*)"`, para o visualizador de PDF do navegador abrir o DANFE e as mídias manterem os cabeçalhos próprios da Fase 2):
    - `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`;
    - `Permissions-Policy: camera=(self), microphone=(self), geolocation=(), payment=(), usb=()`;
    - `Strict-Transport-Security: max-age=31536000`, só no build de produção;
    - CSP **sem nonce** (o guia do Next, "Without Nonces"), com `'wasm-unsafe-eval'` para o leitor ZXing, `https:` em imagens e vídeos (links do B2), `form-action` com o OAuth do ML e `frame-ancestors 'none'`. **Sem** `upgrade-insecure-requests`: o HTTPS é do nginx, e a diretiva quebraria o e2e em `http://localhost`;
    - `poweredByHeader: false`.
16. **`/api/saude`:** o 503 já existia para banco ou fila fora do ar. Faltava o caso em que a própria verificação lança (ex.: variável de ambiente inválida), que dava 500. Passa a responder 503 também nesse caso, sempre com `Cache-Control: no-store`.
17. **Healthcheck:**
    - O `web` consulta `/api/saude`.
    - O `worker` grava um batimento a cada 30 s em `/tmp/devolucoes-worker-vivo`, e o healthcheck exige um batimento com menos de 2 minutos.
    - O Docker só marca "unhealthy" (`docker ps`); quem reinicia o processo caído é o `restart: unless-stopped`.
    - Sem "autoheal": a VPS é compartilhada.
18. **Logs (spec §11):** `src/instrumentation.ts` grava cada erro de requisição do servidor numa linha JSON: hora, caminho **sem a query**, método, rota, tipo, mensagem (até 500 caracteres) e `digest`. Nunca grava cabeçalhos nem corpo. O próprio Next continua escrevendo o erro com a pilha no stderr; a linha JSON é a que se procura e se filtra no `docker logs`.
19. **Backup diário (spec §10):**
    - **Onde roda:** serviço `backup` no compose, com `postgres:17-alpine` e limite de 256 MB. Na subida, ele instala `rclone`, `openssl` e `tzdata` pelo `apk`, e a VPS continua sem compilar nada.
    - **Sem `env_file`:** o container recebe **só** o que usa (`PG*`, `BACKUP_*`, `ARMAZENAMENTO`, `MIDIA_DIR` e o nome do bucket das mídias, `S3_BUCKET`), por `environment:` com interpolação do `--env-file`. Ele roda `apk add` como root, sem versão fixa; por isso nunca vê `ML_CLIENT_SECRET`, `CHAVE_CRIPTOGRAFIA`, `FOCUS_TOKEN_*`, as chaves `S3_*` nem `SEGREDO_LINKS`. O risco que sobra (um pacote do Alpine alterado) fica anotado no `deploy-vps.md`, e o alerta "Backup diário atrasado" é a rede de proteção se a instalação falhar. Uma imagem própria compilada pelo GitHub Actions resolveria isso de vez; ela fica como melhoria opcional.
    - **Quando:** às **02h30** de Brasília, antes do prazo de guarda das 03h00 e da limpeza das 03h30.
    - **O banco:** `pg_dump -Fc`, cifrado (AES-256-CBC, PBKDF2 com 200 mil iterações, senha `BACKUP_SENHA`), enviado a um **bucket só de backup** (B2 ou R2, com chave restrita a ele). O envio é por streaming, sem arquivo temporário no disco da VPS.
    - **As mídias:** com `ARMAZENAMENTO=disco`, vai também um `tar` cifrado de `MIDIA_DIR`. É uma cópia **inteira por dia**: com 30 dias guardados, o bucket chega a 30 vezes o tamanho das mídias. Isso só serve para o teste na bancada; o uso diário é com o B2 (contrato §9.2). Com `ARMAZENAMENTO=s3`, as mídias já estão fora da VPS: o roteiro manda ligar no B2 a regra que guarda as versões antigas por 30 dias.
    - **Guarda de 30 dias:** quem apaga é a **regra de ciclo de vida do bucket de backup** no B2. O `rclone delete` do B2 só esconde o arquivo (vira versão antiga), sem liberar espaço. A chave recomendada **não tem permissão de apagar** (proteção contra ransomware: quem invadir a VPS não apaga os backups). Por isso o `rclone delete --min-age 30d` do script é só um reforço: se a chave não puder apagar, ele registra um aviso no log e o backup continua OK.
    - **Bucket separado de verdade:** o script recusa `BACKUP_S3_BUCKET` igual a `S3_BUCKET` (o das mídias).
    - **Registro:** cada execução fica em `execucoes_backup` (EM_ANDAMENTO → OK ou FALHOU, com o tamanho e o erro).
    - **Variáveis novas** (E19): `BACKUP_S3_ENDPOINT`, `BACKUP_S3_REGIAO`, `BACKUP_S3_BUCKET`, `BACKUP_S3_CHAVE_ID`, `BACKUP_S3_CHAVE_SECRETA` e `BACKUP_SENHA`. Elas ficam só no `.env.producao`, e só o script as lê; o `lerEnv` não muda.
20. **Restauração** (`restaurar.sh <arquivo> [banco]`):
    - Por padrão, restaura num banco **separado** (`devolucoes_restauracao`) e mostra as contagens das tabelas principais.
    - Sem `CONFIRMAR=sim`, só aceita destinos que começam com `devolucoes_restauracao`. Qualquer outro nome é recusado antes de apagar o que for (ex.: `restaurar.sh arq postgres` apagaria o banco `postgres`).
    - Por cima do banco do sistema (`CONFIRMAR=sim` e o destino igual a `PGDATABASE`): com o `web` e o `worker` parados, `dropdb` e `createdb` conectados ao banco `postgres`, e depois o `pg_restore` num banco limpo. Isso é mais previsível que o `--clean`, que deixa para trás o que o dump não conhece (ex.: o schema do pg-boss de outra versão).
    - As mídias (`tar` do modo disco) voltam **à mão**, com o comando do documento. Elas não têm teste automático, porque o modo disco é só para a bancada.
    - O procedimento fica em `docs/operacao/backup-restauracao.md`. A restauração do banco tem teste automático no PC (Tarefa 10) e o teste de verdade na VPS (spec §14).
21. **(extra) Alerta "Backup diário atrasado":** dispara quando não há backup OK nas últimas 26 h, mas só depois que o primeiro backup foi registrado. Antes disso (no PC, no e2e e na VPS ainda sem backup), não há o que vigiar. Uma execução EM_ANDAMENTO há mais de 6 h conta como interrompida. **(extra) Alerta "Disco do servidor quase cheio":** mais de 85% de uso no disco de `MIDIA_DIR`.
22. **(extra)** A tela Falhas mostra, no topo, o último backup: OK (hora e tamanho), FALHOU (o erro), "Em andamento desde HH:MM" ou, passadas 6 h, "Interrompido (começou em …)".23. **Índice novo** em `eventos_historico (acao, em)`, para os alertas por evento não varrerem a tabela inteira.
24. **Passagem para produção:** a ação já existe na Fase 4 (Configurações › Fiscal, com a marcação "O contador validou…" e o `FOCUS_TOKEN_PRODUCAO`). A Fase 6 não muda código: deixa o roteiro em "Depois da fase".
25. **Não adotado (opcional da revisão):** fechar sozinha a falha de uma tarefa agendada quando uma execução seguinte dá certo. O Gestor dispensa à mão (decisão 4); se for preciso, o fechamento automático entra depois, com um estado novo `RESOLVIDA`.

## Pontos de atenção na revisão

O que a spec não diz, mas vai acontecer com quem usa o sistema. Cada linha tem o teste na tarefa dona.

1. **O ML fica fora do ar por uma manhã:** a `ml.varredura` falha a cada 15 minutos. A tela Falhas mostra **um** cartão com "falhou N vezes", e não dezenas (Tarefa 2, teste "soma ocorrências").
2. **Clique duplo em "Tentar de novo"**, comum no celular com rede lenta: só um reenvio, e o segundo toque recebe "Esta falha já foi tratada." (Tarefa 3, inclusive com os dois pedidos ao mesmo tempo).
3. **O prazo de guarda encontra o arquivo já apagado,** ou a mídia está no disco depois da troca para S3. Ele marca APAGADA sem erro e **nunca** apaga com lote aberto, unidade sem fornecedor ou contestação pendente (Tarefa 4).
4. **O escritório inteiro entra pelo mesmo IP:** 30 logins certos seguidos não bloqueiam ninguém, e só as falhas contam (Tarefa 7).
5. **A CSP quebra a câmera, o leitor ZXing, o vídeo ou os links do B2:** o e2e percorre as telas principais e falha se o navegador acusar uma violação da CSP (Tarefa 13). A suíte inteira, com a conferência, roda na Integração.
6. **O backup roda sem senha ou com o bucket das mídias:** sai com erro, grava FALHOU (mesmo com acento na mensagem, no `psql` do Windows) e o painel do Gestor avisa (Tarefas 6 e 10).
7. **A restauração não restaura:** o teste da Tarefa 10 faz o backup, restaura num banco novo e confere as contagens. Um destino errado (`postgres`) é recusado antes de qualquer `dropdb`.
8. **Quase toda devolução do ML muda de status depois da chegada** (`delivered`): isso não pode acender o alerta do Gestor (Tarefa 5, teste "delivered não alerta").

## Mapa de arquivos

```
src/
  db/schema/acabamento.ts                    situacao_falha, situacao_backup, falhas_tarefas, execucoes_backup
  db/schema/historico.ts (+)                 índice eventos_historico (acao, em)
  modules/acabamento/
    dominio.ts                               vocabulário: situações, nomes das tarefas em português, limites
    falhas.ts                                registrarFalha (fila "falhas"), reenviar, dispensar, listar, contar
    retencao.ts                              midia.retencao (spec §9) e as linhas das importações (LGPD)
    alertas-regras.ts                        regras puras: dias úteis, prazo vencendo, definição e perfis dos alertas
    alertas-devolucoes.ts                    alertas que vêm das devoluções, notas, lotes e eventos
    alertas.ts                               carregarAlertas e detalhesDosAlertas (por perfil)
    backup.ts, disco.ts                      último backup, atraso; uso do disco
  modules/auth/limite-login.ts               limite de login por IP
  modules/saude/resposta.ts                  /api/saude: 200 ou 503, sempre no-store
  lib/cabecalhos-seguranca.ts, lib/log.ts    cabeçalhos e CSP; linha JSON dos erros do web
  instrumentation.ts                         onRequestError → log JSON
  modules/fila/fila.ts (+)                   FILA_FALHAS e deadLetter em todas as filas
  worker/index.ts (+), worker/batimento.ts   consumidor da fila "falhas"; batimento do healthcheck
  worker/manipuladores/acabamento.ts         midia.retencao
  modules/devolucoes/busca.ts (+), selos.ts (+)
  components/acabamento/                     AlertasPainel, ListaFalhas (client), CartaoBackup, tipos
  app/(app)/fluxo/page.tsx (+), app/(app)/fluxo/alertas/page.tsx
  app/(app)/configuracoes/falhas/{page.tsx, acoes.ts}
  app/login/acoes.ts (+), app/api/saude/route.ts (+)
next.config.ts (+)                           poweredByHeader e cabeçalhos
docker-compose.prod.yml (+)                  healthchecks e o serviço backup
docker/backup/{comum.sh, agendar.sh, backup.sh, restaurar.sh}
docs/operacao/backup-restauracao.md, docs/operacao/deploy-vps.md (+)
scripts/infra.test.ts                        regras da VPS compartilhada no compose
tests/
  helpers/fabricas-acabamento.ts
  e2e/apoio-acabamento.ts, falhas.spec.ts, alertas.spec.ts, seguranca.spec.ts
```

| Tarefa | Entrega | Tipo |
|---|---|---|
| 0 | Emenda E19 no `main` (contrato, schema vazio, 1 chave de histórico, variáveis do backup), pelo controlador | `main` |
| 1 | Base: vocabulário, tabelas, índice, fábricas | servidor |
| 2 | Falhas: fila `falhas` (deadLetter) e `registrarFalha` com agrupamento | servidor |
| 3 | Falhas: tentar de novo, dispensar, listar | servidor |
| 4 | Prazo de guarda (`midia.retencao`) e linhas das importações | servidor |
| 5 | Alertas das devoluções (regras puras e consultas) | servidor |
| 6 | Alertas do sistema e `carregarAlertas` por perfil | servidor |
| 7 | Limite de login por IP | servidor |
| 8 | Cabeçalhos de segurança, CSP e `poweredByHeader: false` | servidor |
| 9 | `/api/saude` com 503, log JSON do web, batimento e healthchecks | servidor |
| 10 | Backup diário e restauração (scripts, compose, documentação) | servidor |
| 11 | Tela Falhas | tela |
| 12 | Alertas no painel e página `/fluxo/alertas` | tela |
| 13 | E2E de segurança e saúde | e2e |
| 14 | Integração | junção |

---

### Tarefa 0: Emenda E19 no `main` (controlador, antes de criar a worktree)

`src/db/schema/index.ts`, `src/modules/historico/rotulos/*.ts`, `.env.producao.example` e o contrato são congelados. O que muda neles entra por emenda no `main` (contrato §3 e §10, E3). Esta tarefa é do **controlador** (quem integra), no `main`, **depois** do merge da Fase 5 e **antes** da worktree `fase-6`.

**Arquivos:**
- Criar (no `main`): `src/db/schema/acabamento.ts`
- Modificar (no `main`): `src/db/schema/index.ts`, `src/modules/historico/rotulos/acabamento.ts`, `src/modules/historico/eventos.test.ts` (só se a lista das chaves for exata), `.env.producao.example`, `docs/superpowers/plans/2026-11-12-contrato-fases-2-6.md` (§10)

- [ ] **Passo 1: Schema vazio e exportado**

`src/db/schema/acabamento.ts`:

```ts
/** Fase 6 (contrato §10, E19): falhas_tarefas e execucoes_backup. A Fase 6 troca este arquivo. */
export {};
```

Em `src/db/schema/index.ts`, acrescente no fim: `export * from './acabamento';`

- [ ] **Passo 2: A chave nova do histórico**

Em `src/modules/historico/rotulos/acabamento.ts`, dentro de `ROTULOS_ACABAMENTO`:

```ts
  tarefa_dispensada: 'Falha dispensada',
```

Em `src/modules/historico/eventos.test.ts`, a lista `RESERVADAS.acabamento` passa a ser `['midia_apagada_retencao', 'tarefa_reenviada', 'tarefa_dispensada']` (se o teste comparar a lista exata).

- [ ] **Passo 3: As variáveis do backup no exemplo de produção**

No fim de `.env.producao.example`:

```bash
# Backup diário (Fase 6, spec §10): banco e, com ARMAZENAMENTO=disco, as mídias. Cifrado e enviado a um bucket SÓ de backup
# (B2 ou R2), com uma chave que só enxerga esse bucket. Guardado por 30 dias. Só o serviço "backup" lê estas variáveis.
BACKUP_S3_ENDPOINT=
BACKUP_S3_REGIAO=
BACKUP_S3_BUCKET=
BACKUP_S3_CHAVE_ID=
BACKUP_S3_CHAVE_SECRETA=
# Senha da cifra dos backups. Gere com: openssl rand -hex 32. Guarde uma cópia FORA da VPS: sem ela o backup não abre.
BACKUP_SENHA=
```

- [ ] **Passo 4: O texto da E19 no contrato (fim da §10)**

```markdown
- **E19. Fase 6 (14/11):** (a) `src/db/schema/acabamento.ts` (tabelas `falhas_tarefas` e `execucoes_backup`) exportado no `index.ts`; (b) chave `tarefa_dispensada` ("Falha dispensada") em `rotulos/acabamento.ts`; (c) toda fila do pg-boss ganha `deadLetter: 'falhas'`, uma fila do pg-boss consumida só pelo worker, que **não** é uma `NomeTarefa` (ninguém a envia; `tarefas.ts` não muda); (d) variáveis `BACKUP_S3_*` e `BACKUP_SENHA` no `.env.producao.example`, lidas só pelo serviço `backup` do compose (o `lerEnv` não muda); (e) índice `(acao, em)` em `eventos_historico`. Motivo: a tela Falhas e o backup da Fase 6 precisavam dos cinco, e os arquivos são congelados.
```

- [ ] **Passo 5: Conferir e commitar no `main`**

```bash
cd "/c/Users/JEFFERSON LIMA/MKT-_-DEV"
git switch main && git pull -q --ff-only
npm run typecheck && npm test -- src/modules/historico
git add src/db/schema/acabamento.ts src/db/schema/index.ts src/modules/historico .env.producao.example docs/superpowers/plans/2026-11-12-contrato-fases-2-6.md
git commit -m "docs(contrato): emenda E19 da Fase 6 (schema do acabamento, tarefa_dispensada, fila de falhas, variáveis do backup)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Esperado: tipos e testes do histórico passam. O push do `main` fica com o usuário.

---

### Tarefa 1: Base: vocabulário, tabelas, índice e fábricas

**Arquivos:**
- Criar: `src/modules/acabamento/dominio.ts`, `tests/helpers/fabricas-acabamento.ts`
- Modificar: `src/db/schema/acabamento.ts` (troca o `export {};`), `src/db/schema/historico.ts` (índice)
- Gerado: `drizzle/<n>_fase6_acabamento.sql` (descartado e refeito na Tarefa 14)
- Testes: `src/modules/acabamento/dominio.test.ts`, `src/modules/acabamento/schema.int.test.ts`

**Interfaces:**
- Consome: `NOMES_TAREFAS`, `type NomeTarefa` (`src/modules/fila/tarefas.ts`), `usuarios`, `criarDevolucaoNoEstoqueTeste`, `type UnidadeEstoqueTeste`, `type DevolucaoNoEstoque` (`tests/helpers/fabricas-fiscal.ts`).
- Produz:
  - `dominio.ts`:
    - `SITUACOES_FALHA = ['ABERTA', 'REENVIADA', 'DISPENSADA'] as const`, `type SituacaoFalha`, `ROTULO_SITUACAO_FALHA`;
    - `SITUACOES_BACKUP = ['EM_ANDAMENTO', 'OK', 'FALHOU'] as const`, `type SituacaoBackup`;
    - `ROTULO_TAREFA: Record<NomeTarefa, string>`, `ehNomeTarefa(texto: string): texto is NomeTarefa`;
    - `ERRO_MAXIMO = 500`.
  - schema: `situacaoFalhaEnum`, `situacaoBackupEnum`, `falhasTarefas`, `execucoesBackup`.
  - fábricas:
    - `criarFalhaTeste(db, p?: { tarefa?: NomeTarefa; dados?: Record<string, unknown>; situacao?: SituacaoFalha; erro?: string; ocorrencias?: number; ultimaFalhaEm?: Date; assinatura?: string }): Promise<{ id: string }>`. Por padrão, a `assinatura` é aleatória, para dois testes não colidirem na falha ABERTA única.
    - `criarExecucaoBackupTeste(db, p: { situacao: SituacaoBackup; iniciadoEm: Date; terminadoEm?: Date | null; tamanhoBanco?: number | null; erro?: string | null }): Promise<{ id: string }>`
    - `criarDevolucaoConcluidaTeste(db, usuario, p: { concluidaEm: Date; unidades?: UnidadeEstoqueTeste[] }): Promise<DevolucaoNoEstoque>`: põe a devolução em CONCLUIDA com `concluida_em`; as unidades BOM vão para DISPONIVEL_VENDA, e as outras ficam como a fábrica fiscal deixou.
    - `criarNotaRejeitadaTeste(db, alvo: { devolucaoId: string } | { loteId: string }): Promise<{ id: string }>`
    - `criarContestacaoTeste(db, devolucaoId: string, p: { status: 'AGUARDANDO_GESTOR' | 'ENVIADA' | 'FALHOU'; prazo: Date | null }): Promise<{ id: string }>`

- [ ] **Passo 0: Conferir a base (Fases 2 a 5 no `main`) antes de escrever código**

```bash
cd "/c/Users/JEFFERSON LIMA/devolucoes-wt/fase-6"
git log --oneline -8
cat src/db/schema/acabamento.ts src/modules/historico/rotulos/acabamento.ts
grep -n "export" src/db/schema/lotes.ts src/modules/lotes/dominio.ts tests/helpers/fabricas-lotes.ts tests/e2e/apoio-lotes.ts
grep -n "lote_alerta_nf_cancelada\|lote_item_removido" src/modules/historico/rotulos/lotes.ts src/modules/lotes/*.ts | head
grep -n "SEM_FORNECEDOR" src/modules/devolucoes/dominio.ts
grep -n "export const notasFiscais\|situacao\|loteId" src/db/schema/fiscal.ts | head
grep -n "export const contestacoesCanal\|prazo\|status" src/db/schema/mercado-livre.ts | head
ls "src/app/(app)/lotes/sem-fornecedor/page.tsx" "src/app/(app)/configuracoes/falhas/page.tsx"
grep -n "linhas\|situacao" src/modules/midia/limpeza.ts | head
```

Esperado (nomes que este plano usa):

| Onde | Nome |
|---|---|
| `src/db/schema/acabamento.ts` | `export {};` (Tarefa 0). **Sem ele, pare e peça a Tarefa 0 ao controlador.** |
| `rotulos/acabamento.ts` | `midia_apagada_retencao`, `tarefa_reenviada`, `tarefa_dispensada` |
| `src/db/schema/lotes.ts` | `lotes` (`codigo`, `status`, `fornecedorId`) e `statusLoteEnum` |
| `tests/helpers/fabricas-lotes.ts` | `criarFornecedorCompletoTeste`, `criarLoteTeste(db, { fornecedorId, status?, itemIds? })` |
| `tests/e2e/apoio-lotes.ts` | `prepararSemFornecedor()` |
| `rotulos/lotes.ts` | `lote_alerta_nf_cancelada` (Fase 5, E18), gravado na devolução **e** no lote |
| `STATUS_ITEM` | contém `SEM_FORNECEDOR`, `EM_LOTE`, `ENVIADO`, `RESOLVIDO` |
| `src/db/schema/fiscal.ts` | `notasFiscais` com `situacao`, `devolucaoId`, `loteId`, `referenciaEmissor`, `ambiente`, `motivoRejeicao` |
| `src/db/schema/mercado-livre.ts` | `contestacoesCanal` com `prazo` e `status`; `contasMarketplace` com `situacao` e `ultimaSincronizacaoEm` |
| `/lotes/sem-fornecedor` | existe (Fase 5) |
| `limpeza.ts` | apaga `importacoes` PENDENTE com mais de 1 dia (decisão 8) |

**Se um nome for diferente, use o nome que está no `main` em todo este plano** e anote a diferença na mensagem do commit.

- [ ] **Passo 1: Escrever os testes que falham**

`src/modules/acabamento/dominio.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { NOMES_TAREFAS } from '@/modules/fila/tarefas';
import { ehNomeTarefa, ROTULO_SITUACAO_FALHA, ROTULO_TAREFA } from './dominio';

describe('vocabulário do acabamento', () => {
  it('toda tarefa do contrato tem um nome em português para a tela Falhas', () => {
    for (const nome of NOMES_TAREFAS) expect(ROTULO_TAREFA[nome]).toMatch(/\S/);
    expect(ROTULO_TAREFA['midia.transcodificar']).toBe('Comprimir o Vídeo de Prova');
    expect(ROTULO_TAREFA['nfe.emitir']).toBe('Emitir NF-e');
    expect(ROTULO_TAREFA['midia.retencao']).toBe('Prazo de guarda das mídias');
  });

  it('situações da falha', () => {
    expect(Object.values(ROTULO_SITUACAO_FALHA)).toEqual(['Aberta', 'Reenviada', 'Dispensada']);
  });

  it('só as tarefas do contrato são reconhecidas (a fila "falhas" não é uma tarefa)', () => {
    expect(ehNomeTarefa('nfe.emitir')).toBe(true);
    expect(ehNomeTarefa('falhas')).toBe(false);
    expect(ehNomeTarefa('')).toBe(false);
  });
});
```

`src/modules/acabamento/schema.int.test.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { sql as sqlDrizzle } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { execucoesBackup, falhasTarefas } from '@/db/schema';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';

const { db, sql } = criarDbTeste();
beforeEach(() => limparTabelas(sql));
afterAll(() => sql.end());

const falha = (assinatura: string, situacao: 'ABERTA' | 'REENVIADA' = 'ABERTA') => ({
  tarefa: 'nfe.emitir',
  dados: { notaFiscalId: 'n1' },
  assinatura,
  erro: 'Focus fora do ar',
  tentativas: 5,
  ultimoJobId: randomUUID(),
  primeiraFalhaEm: new Date(),
  ultimaFalhaEm: new Date(),
  situacao,
});

describe('tabelas da Fase 6', () => {
  it('só uma falha ABERTA por assinatura; as resolvidas podem repetir (decisão 2)', async () => {
    await db.insert(falhasTarefas).values(falha('a1'));
    await expect(db.insert(falhasTarefas).values(falha('a1'))).rejects.toThrow();
    await db.insert(falhasTarefas).values([falha('a1', 'REENVIADA'), falha('a1', 'REENVIADA')]);
    const [linha] = await db.select().from(falhasTarefas).limit(1);
    expect(linha.ocorrencias).toBe(1);
  });

  it('a execução do backup nasce EM_ANDAMENTO com a hora do início', async () => {
    const [linha] = await db.insert(execucoesBackup).values({}).returning();
    expect(linha.situacao).toBe('EM_ANDAMENTO');
    expect(linha.iniciadoEm).toBeInstanceOf(Date);
  });

  it('eventos_historico tem o índice (acao, em) dos alertas (decisão 23)', async () => {
    const r = await db.execute<{ indexdef: string }>(
      sqlDrizzle`select indexdef from pg_indexes where tablename = 'eventos_historico' and indexname = 'eventos_historico_acao_em_idx'`,
    );
    expect(r[0]?.indexdef).toMatch(/\(acao, em\)/);
  });
});
```

Rode: `npm test -- src/modules/acabamento && npm run test:int -- src/modules/acabamento/schema`
Esperado: FAIL (módulos e tabelas não existem).

- [ ] **Passo 2: Implementar o vocabulário e o schema**

- `dominio.ts`: os nomes da seção Interfaces. Os rótulos de `ROTULO_TAREFA`:
  - mídia e limpeza: `'midia.processar-foto'` "Processar foto", `'midia.transcodificar'` "Comprimir o Vídeo de Prova", `'limpeza.temporarios'` "Limpeza de temporários";
  - Mercado Livre: `'ml.sincronizar-reclamacao'` "Sincronizar reclamação do Mercado Livre", `'ml.varredura'` "Varredura do Mercado Livre", `'ml.renovar-token'` "Renovar o acesso ao Mercado Livre", `'ml.enviar-resultado'` "Enviar o resultado da conferência ao ML", `'ml.enviar-contestacao'` "Enviar contestação ao ML";
  - NF-e: `'nfe.emitir'` "Emitir NF-e", `'nfe.consultar'` "Consultar NF-e";
  - lotes e guarda: `'lotes.alocar-pendentes'` "Alocar unidades pendentes nos lotes", `'midia.retencao'` "Prazo de guarda das mídias".
  - `ehNomeTarefa` importa `NOMES_TAREFAS` por caminho relativo (`../fila/tarefas`).
- `src/db/schema/acabamento.ts` (imports relativos; padrão da Fase 1):

```ts
import { sql } from 'drizzle-orm';
import { bigint, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { SITUACOES_BACKUP, SITUACOES_FALHA } from '../../modules/acabamento/dominio';
import { usuarios } from './auth';

export const situacaoFalhaEnum = pgEnum('situacao_falha', SITUACOES_FALHA);
export const situacaoBackupEnum = pgEnum('situacao_backup', SITUACOES_BACKUP);

/** Spec §6.8 e §11: tarefas que esgotaram as 5 tentativas (vêm da fila "falhas" do pg-boss; decisão 1). */
export const falhasTarefas = pgTable(
  'falhas_tarefas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tarefa: text('tarefa').notNull(),
    dados: jsonb('dados').$type<Record<string, unknown>>().notNull(),
    /** sha256 de tarefa + dados (decisão 2). */
    assinatura: text('assinatura').notNull(),
    erro: text('erro').notNull(),
    tentativas: integer('tentativas').notNull(),
    ocorrencias: integer('ocorrencias').notNull().default(1),
    ultimoJobId: uuid('ultimo_job_id').notNull(),
    primeiraFalhaEm: timestamp('primeira_falha_em', { withTimezone: true }).notNull(),
    ultimaFalhaEm: timestamp('ultima_falha_em', { withTimezone: true }).notNull(),
    situacao: situacaoFalhaEnum('situacao').notNull().default('ABERTA'),
    resolvidaPor: uuid('resolvida_por').references(() => usuarios.id, { onDelete: 'set null' }),
    resolvidaEm: timestamp('resolvida_em', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('falhas_tarefas_aberta_unica').on(t.assinatura).where(sql`"situacao" = 'ABERTA'`),
    index('falhas_tarefas_situacao_idx').on(t.situacao, t.ultimaFalhaEm),
  ],
);

/** Spec §10: cada execução do backup diário (o script docker/backup/backup.sh grava pelo psql). */
export const execucoesBackup = pgTable('execucoes_backup', {
  id: uuid('id').primaryKey().defaultRandom(),
  iniciadoEm: timestamp('iniciado_em', { withTimezone: true }).notNull().defaultNow(),
  terminadoEm: timestamp('terminado_em', { withTimezone: true }),
  situacao: situacaoBackupEnum('situacao').notNull().default('EM_ANDAMENTO'),
  arquivoBanco: text('arquivo_banco'),
  tamanhoBanco: bigint('tamanho_banco', { mode: 'number' }),
  arquivoMidia: text('arquivo_midia'),
  tamanhoMidia: bigint('tamanho_midia', { mode: 'number' }),
  erro: text('erro'),
});
```

- `src/db/schema/historico.ts`: no segundo argumento de `pgTable`, acrescente `index('eventos_historico_acao_em_idx').on(t.acao, t.em)`.
- `tests/helpers/fabricas-acabamento.ts`: como nas Interfaces. `criarNotaRejeitadaTeste` insere `notas_fiscais` com:
  - `tipo`: `DEVOLUCAO_VENDA` (alvo devolução) ou `REMESSA_CONSERTO` (alvo lote);
  - `ambiente`: `HOMOLOGACAO`;
  - `situacao`: `REJEITADA`, com `motivoRejeicao` `'Rejeição 539: duplicidade (teste)'`;
  - `referenciaEmissor`: `randomUUID().replaceAll('-', '')`.
  `criarContestacaoTeste` insere em `contestacoes_canal` com `motivoCanal` `'SRF2'` e `mensagem` `'Teste'`.

Rode: `npm run db:gerar -- --name fase6_acabamento && npm run db:migrar`
Esperado: uma migração com os 2 enums, as 2 tabelas, os 2 índices de `falhas_tarefas` e o índice de `eventos_historico`. Depois, recrie o banco de testes (contrato §6), como na Tarefa 14, Passo 3.

- [ ] **Passo 3: Rodar os testes**

Rode: `npm test -- src/modules/acabamento && npm run test:int -- src/modules/acabamento/schema`
Esperado: PASS.

- [ ] **Passo 4: Commit**

```bash
git add src/modules/acabamento src/db/schema/acabamento.ts src/db/schema/historico.ts drizzle tests/helpers/fabricas-acabamento.ts
git commit -m "feat(acabamento): vocabulário, tabelas falhas_tarefas e execucoes_backup, índice dos alertas e fábricas" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 2: Falhas: a fila `falhas` (deadLetter) e `registrarFalha` com agrupamento

**Arquivos:**
- Criar: `src/modules/acabamento/falhas.ts`, `src/lib/log.ts` (só `mensagemDoErro`; a Tarefa 9 acrescenta a linha JSON do web)
- Modificar: `src/modules/fila/fila.ts`, `src/modules/fila/fila.test.ts` (o `toEqual` de `opcoesDaFila` ganha `deadLetter`), `src/worker/index.ts`
- Testes: `src/lib/log.test.ts`, `src/modules/acabamento/falhas.test.ts`, `src/modules/acabamento/falhas.int.test.ts`, `src/worker/falhas.int.test.ts`

**Interfaces:**
- Consome: `criarPgBoss`, `criarFilas`, `iniciarWorker` (P2), `ehNomeTarefa`, `ERRO_MAXIMO`, `falhasTarefas` (Tarefa 1).
- Produz:
  - `fila.ts`:
    - `export const FILA_FALHAS = 'falhas'` e `export const OPCOES_FILA_FALHAS`;
    - `opcoesDaFila(nome)` passa a incluir `deadLetter: FILA_FALHAS`;
    - `criarFilas(boss)` cria e atualiza a fila `falhas` **antes** das outras (a FK `dead_letter` do pg-boss exige que ela exista);
    - `criarPgBoss(url, opcoes)` aceita `intervaloSupervisaoSegundos?: number`, repassado ao pg-boss (só os testes usam; veja o Passo 2).
  - `worker/index.ts`: `OpcoesWorker.intervaloSupervisaoSegundos?: number`, repassado ao `criarPgBoss` (só nos testes).
  - `src/lib/log.ts` (puro, sem imports do projeto): `mensagemDoErro(saida: unknown): string`. `falhas.ts` importa dali, e não o contrário.
  - `falhas.ts`:
    - `type EntradaFalha = { tarefa: string; dados: unknown; erro: unknown; tentativas: number; jobId: string; falhouEm: Date }`;
    - `assinaturaFalha(tarefa: string, dados: unknown): string`, sha256 em hex de `tarefa + '\u0000' + JSON` com as chaves ordenadas, em qualquer profundidade;
    - `entradaDoJobMorto(job: { id: string; data: unknown; sourceName: string | null; sourceId: string | null; sourceOutput: object | null; sourceRetryCount: number | null; createdOn: Date }): EntradaFalha | null`;
    - `registrarFalha(db: DbOuTx, e: EntradaFalha): Promise<{ falhaId: string } | null>`.
  - `worker/index.ts`: dentro de `iniciarWorker`, sempre (com qualquer `manipuladores`), um `boss.work(FILA_FALHAS, { batchSize: 1, localConcurrency: 1, includeMetadata: true, pollingIntervalSeconds }, ...)` que chama `registrarFalha(db, entradaDoJobMorto(job))` e registra `{ nivel: 'erro', mensagem: 'tarefa foi para Falhas', tarefa, falhaId }`.

- [ ] **Passo 1: Escrever os testes que falham**

`src/modules/acabamento/falhas.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { assinaturaFalha, entradaDoJobMorto } from './falhas';

describe('assinaturaFalha (decisão 2)', () => {
  it('não depende da ordem das chaves', () => {
    expect(assinaturaFalha('nfe.consultar', { notaFiscalId: 'n1', consulta: 3 })).toBe(
      assinaturaFalha('nfe.consultar', { consulta: 3, notaFiscalId: 'n1' }),
    );
  });
  it('muda com a tarefa ou com os dados', () => {
    const a = assinaturaFalha('nfe.emitir', { notaFiscalId: 'n1' });
    expect(assinaturaFalha('nfe.consultar', { notaFiscalId: 'n1' })).not.toBe(a);
    expect(assinaturaFalha('nfe.emitir', { notaFiscalId: 'n2' })).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('entradaDoJobMorto', () => {
  it('pega a tarefa, os dados, o erro e as tentativas do job original', () => {
    const criado = new Date('2026-11-20T10:00:00Z');
    expect(
      entradaDoJobMorto({
        id: 'j-falhas', data: { devolucaoId: 'd1' }, sourceName: 'ml.enviar-resultado', sourceId: 'j-original',
        sourceOutput: { message: 'ML fora do ar' }, sourceRetryCount: 4, createdOn: criado,
      }),
    ).toEqual({ tarefa: 'ml.enviar-resultado', dados: { devolucaoId: 'd1' }, erro: { message: 'ML fora do ar' }, tentativas: 5, jobId: 'j-original', falhouEm: criado });
  });
  it('job sem origem (não veio de outra fila) é ignorado', () => {
    expect(entradaDoJobMorto({ id: 'j', data: {}, sourceName: null, sourceId: null, sourceOutput: null, sourceRetryCount: null, createdOn: new Date() })).toBeNull();
  });
});
```

`src/lib/log.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mensagemDoErro } from './log';

describe('mensagemDoErro (decisão 6)', () => {
  it('só a message do erro que o pg-boss guardou, sem a pilha', () => {
    expect(mensagemDoErro({ name: 'Error', message: 'Focus fora do ar', stack: 'Error: Focus fora do ar\n    at x (y.ts:1)' })).toBe('Focus fora do ar');
  });
  it('o tempo esgotado do pg-boss vira "Tempo esgotado"', () => {
    expect(mensagemDoErro({ value: { message: 'job timed out' } })).toBe('Tempo esgotado');
    expect(mensagemDoErro({ value: { message: 'outra coisa' } })).toBe('outra coisa');
  });
  it('texto simples, vazio e outros formatos', () => {
    expect(mensagemDoErro('tempo esgotado')).toBe('tempo esgotado');
    expect(mensagemDoErro(null)).toBe('Sem detalhes do erro.');
    expect(mensagemDoErro({ value: 'x' })).toBe('{"value":"x"}');
  });
  it('corta em 500 caracteres e tira caracteres de controle', () => {
    const longa = mensagemDoErro({ message: 'a'.repeat(600) });
    expect(longa).toHaveLength(500);
    expect(longa.endsWith('…')).toBe(true);
    expect(mensagemDoErro({ message: 'linha 1\nlinha 2\u0000' })).toBe('linha 1 linha 2');
  });
});
```

`src/modules/acabamento/falhas.int.test.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { falhasTarefas } from '@/db/schema';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { registrarFalha, type EntradaFalha } from './falhas';

const { db, sql } = criarDbTeste();
beforeEach(() => limparTabelas(sql));
afterAll(() => sql.end());

const entrada = (m: Partial<EntradaFalha> = {}): EntradaFalha => ({
  tarefa: 'nfe.emitir',
  dados: { notaFiscalId: 'n1' },
  erro: { message: 'Focus fora do ar' },
  tentativas: 5,
  jobId: randomUUID(),
  falhouEm: new Date('2026-11-20T10:00:00Z'),
  ...m,
});

describe('registrarFalha', () => {
  it('a mesma tarefa com os mesmos dados soma ocorrências na falha aberta (decisão 2)', async () => {
    const a = await registrarFalha(db, entrada());
    const b = await registrarFalha(db, entrada({ erro: { message: 'Tempo esgotado' }, falhouEm: new Date('2026-11-20T11:00:00Z') }));
    expect(b?.falhaId).toBe(a?.falhaId);
    const linhas = await db.select().from(falhasTarefas);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ tarefa: 'nfe.emitir', ocorrencias: 2, erro: 'Tempo esgotado', tentativas: 5, situacao: 'ABERTA' });
    expect(linhas[0].primeiraFalhaEm.toISOString()).toBe('2026-11-20T10:00:00.000Z');
    expect(linhas[0].ultimaFalhaEm.toISOString()).toBe('2026-11-20T11:00:00.000Z');
  });

  it('o mesmo job entregue duas vezes pela fila conta uma vez', async () => {
    const e = entrada();
    await registrarFalha(db, e);
    await registrarFalha(db, e);
    const [linha] = await db.select().from(falhasTarefas);
    expect(linha.ocorrencias).toBe(1);
  });

  it('dados diferentes viram outra falha; depois de reenviada, a próxima abre outra linha', async () => {
    const a = await registrarFalha(db, entrada());
    await registrarFalha(db, entrada({ dados: { notaFiscalId: 'n2' } }));
    await db.update(falhasTarefas).set({ situacao: 'REENVIADA' }).where(eq(falhasTarefas.id, a!.falhaId));
    const c = await registrarFalha(db, entrada());
    expect(c?.falhaId).not.toBe(a?.falhaId);
    expect(await db.select().from(falhasTarefas)).toHaveLength(3);
  });

  it('tarefa fora do contrato é ignorada', async () => {
    expect(await registrarFalha(db, entrada({ tarefa: 'outra.coisa' }))).toBeNull();
    expect(await db.select().from(falhasTarefas)).toHaveLength(0);
  });
});
```

`src/worker/falhas.int.test.ts` (pg-boss de verdade, schema próprio, como o `worker.int.test.ts` da P2):

```ts
import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { falhasTarefas } from '@/db/schema';
import { FILA_FALHAS } from '@/modules/fila/fila';
import { criarDbTeste, limparTabelas, urlBancoTeste } from '../../tests/helpers/db';
import { iniciarWorker } from './index';

const SCHEMA = 'pgboss_falhas_int';
const { db, sql } = criarDbTeste();
beforeEach(() => limparTabelas(sql));
afterAll(async () => {
  await sql.unsafe(`drop schema if exists ${SCHEMA} cascade`);
  await sql.end();
});

const opcoes = { url: urlBancoTeste(), schema: SCHEMA, intervaloSegundos: 0.5, registrar: () => {} };

describe('Falhas (spec §11): a tarefa que esgota as 5 tentativas vai para falhas_tarefas', () => {
  it('toda fila aponta para a fila de falhas', async () => {
    const worker = await iniciarWorker({ ...opcoes, manipuladores: {} });
    try {
      expect(await worker.boss.getQueue(FILA_FALHAS)).not.toBeNull();
      expect((await worker.boss.getQueue('nfe.emitir'))?.deadLetter).toBe(FILA_FALHAS);
      expect((await worker.boss.getQueue('midia.retencao'))?.deadLetter).toBe(FILA_FALHAS);
    } finally {
      await worker.parar();
    }
  }, 60_000);

  it('grava a tarefa, os dados, o motivo e as tentativas', async () => {
    const worker = await iniciarWorker({
      ...opcoes,
      manipuladores: {
        'ml.enviar-resultado': async () => {
          throw new Error('ML fora do ar');
        },
      },
    });
    try {
      // Sem espera entre as tentativas, só neste teste.
      await worker.boss.updateQueue('ml.enviar-resultado', { retryDelay: 0, retryBackoff: false });
      const devolucaoId = randomUUID();
      await worker.boss.send('ml.enviar-resultado', { devolucaoId });
      await expect.poll(async () => (await db.select().from(falhasTarefas)).length, { timeout: 45_000, interval: 500 }).toBe(1);
      const [f] = await db.select().from(falhasTarefas);
      expect(f).toMatchObject({ tarefa: 'ml.enviar-resultado', dados: { devolucaoId }, erro: 'ML fora do ar', tentativas: 5, ocorrencias: 1, situacao: 'ABERTA' });
    } finally {
      await worker.parar();
    }
  }, 60_000);

  it('a tarefa que estoura o tempo também vai para Falhas, com "Tempo esgotado"', async () => {
    const worker = await iniciarWorker({
      ...opcoes,
      // O pg-boss confere o tempo na supervisão (60 s por padrão); aqui, a cada 1 s.
      intervaloSupervisaoSegundos: 1,
      manipuladores: {
        'midia.retencao': () => new Promise<void>((ok) => setTimeout(ok, 10_000)),
      },
    });
    try {
      // Uma tentativa só, de 1 s, só neste teste.
      await worker.boss.updateQueue('midia.retencao', { retryLimit: 0, expireInSeconds: 1 });
      await worker.boss.send('midia.retencao', {});
      await expect.poll(async () => (await db.select().from(falhasTarefas)).length, { timeout: 60_000, interval: 500 }).toBe(1);
      const [f] = await db.select().from(falhasTarefas);
      expect(f).toMatchObject({ tarefa: 'midia.retencao', erro: 'Tempo esgotado', situacao: 'ABERTA' });
    } finally {
      await worker.parar();
    }
  }, 90_000);
});
```

Rode: `npm test -- src/lib/log src/modules/acabamento/falhas src/modules/fila && npm run test:int -- src/modules/acabamento/falhas src/worker/falhas`
Esperado: FAIL.

- [ ] **Passo 2: Implementar**

- `fila.ts`:
  - `OPCOES_FILA_FALHAS = { retryLimit: 4, retryDelay: 30, retryBackoff: true, retryDelayMax: 900, expireInSeconds: 60, retentionSeconds: 30 * 24 * 60 * 60 }`;
  - `opcoesDaFila` devolve o objeto atual mais `deadLetter: FILA_FALHAS`;
  - em `criarFilas`, primeiro `createQueue(FILA_FALHAS, OPCOES_FILA_FALHAS)` e `updateQueue(FILA_FALHAS, OPCOES_FILA_FALHAS)`, e depois o laço de hoje.
  - Confira em `node_modules/pg-boss/dist/types.d.ts` que `QueueOptions`/`UpdateQueueOptions` aceitam `deadLetter` e `retentionSeconds`.
  - Em `fila.test.ts`, o `toEqual` de `opcoesDaFila('midia.transcodificar')` ganha `deadLetter: 'falhas'`.
  - `criarPgBoss` repassa `intervaloSupervisaoSegundos` ao pg-boss. Confira em `node_modules/pg-boss/dist/types.d.ts` qual intervalo roda a expiração dos jobs (`superviseIntervalSeconds`, `monitorIntervalSeconds` ou `maintenanceIntervalSeconds`, todos de 60 s por padrão) e passe o valor a quem fizer o teste do tempo esgotado passar. Sem a opção, nada muda em produção.
- `src/lib/log.ts`, `mensagemDoErro`, nesta ordem:
  - `{ value: { message } }` (o formato do tempo esgotado do pg-boss): `'job timed out'` vira `'Tempo esgotado'`; outro texto, ele mesmo;
  - `message` (string) → o texto; `string` → ele mesmo;
  - `null`/`undefined`/`''` → `'Sem detalhes do erro.'`;
  - outros → `JSON.stringify`.
  - Depois troca `[\u0000-\u001f\u007f]+` por espaço, faz `trim`, e acima de 500 caracteres corta em 499 + `…`.
- `falhas.ts`:
  - `registrarFalha`: devolve `null` se `!ehNomeTarefa(e.tarefa)`, e registra o caso no log JSON. Senão, um só comando:
    ```sql
    insert ... on conflict (assinatura) where situacao = 'ABERTA' do update set
      ocorrencias = case when falhas_tarefas.ultimo_job_id = excluded.ultimo_job_id
                         then falhas_tarefas.ocorrencias else falhas_tarefas.ocorrencias + 1 end,
      erro = excluded.erro,
      tentativas = excluded.tentativas,
      ultimo_job_id = excluded.ultimo_job_id,
      ultima_falha_em = greatest(falhas_tarefas.ultima_falha_em, excluded.ultima_falha_em)
    returning id
    ```
    No drizzle: `onConflictDoUpdate({ target: falhasTarefas.assinatura, targetWhere: sql\`"situacao" = 'ABERTA'\`, set: {...} })`.
  - `dados` é gravado como objeto; quando não for objeto, vira `{ valor: dados }`.
  - O `erro` gravado é `mensagemDoErro(e.erro)`, importado de `@/lib/log`.
- `worker/index.ts`: o consumidor de `FILA_FALHAS`, como nas Interfaces, depois do laço das tarefas. A sobrecarga de `work` com `includeMetadata: true` entrega `JobWithMetadata` (confira em `node_modules/pg-boss/dist/index.d.ts`). Um erro no `registrarFalha` lança: o job da fila `falhas` tenta de novo.

- [ ] **Passo 3: Rodar os testes**

Rode: `npm test -- src/modules/acabamento src/modules/fila src/worker && npm run test:int -- src/modules/acabamento src/worker src/modules/fila`
Esperado: PASS, inclusive o `worker.int.test.ts` e o `fila.int.test.ts` da P2.

- [ ] **Passo 4: Commit**

```bash
git add src/lib/log.ts src/lib/log.test.ts src/modules/acabamento/falhas.ts src/modules/acabamento/falhas*.test.ts src/modules/fila/fila.ts src/modules/fila/fila.test.ts src/worker/index.ts src/worker/falhas.int.test.ts
git commit -m "feat(falhas): fila falhas do pg-boss (deadLetter) grava as tarefas que esgotaram as 5 tentativas, agrupando as repetidas" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 3: Falhas: tentar de novo, dispensar e listar

**Arquivos:**
- Modificar: `src/modules/acabamento/falhas.ts`
- Testes: `src/modules/acabamento/falhas-acoes.int.test.ts`

**Interfaces:**
- Consome: `obterFila` (P2), `registrarEvento`, `pode` (`administrar`), `ehUuid`, `formatarDataHora`, `ROTULO_TAREFA`, `ehNomeTarefa`, tabelas `devolucoes`, `notasFiscais`, `lotes`, `evidencias`, `contestacoesCanal`.
- Produz (em `falhas.ts`):
  - `class ErroFalhas extends Error`
  - `reenviarFalha(db: Db, falhaId: string, usuario: UsuarioSessao, agora?: Date): Promise<{ tarefa: NomeTarefa }>`
  - `dispensarFalha(db: Db, falhaId: string, usuario: UsuarioSessao, agora?: Date): Promise<void>`
  - `type ReferenciaFalha = { texto: string; href: string | null }`
  - `type FalhaVista = { id: string; tarefa: string; rotuloTarefa: string; erro: string; tentativas: number; ocorrencias: number; primeiraFalhaEm: string; ultimaFalhaEm: string; referencia: ReferenciaFalha | null }` (datas já formatadas)
  - `listarFalhas(db: DbOuTx, opcoes?: { pagina?: number; porPagina?: number }): Promise<{ falhas: FalhaVista[]; total: number }>`: só ABERTA, a mais recente primeiro, 20 por página.
  - `contarFalhasAbertas(db: DbOuTx): Promise<number>`

Mensagens fixas (os testes e as telas usam):
- `'Só o Gestor trata as Falhas.'`
- `'Falha não encontrada.'` (id que não é UUID, ou que não existe)
- `'Esta falha já foi tratada.'` (não está ABERTA)

Referência de cada tarefa (pelos dados):

| Dado | Referência |
|---|---|
| `devolucaoId` | código DEV → `/fluxo/devolucoes/DEV-…` |
| `evidenciaId` | a devolução da evidência, idem |
| `notaFiscalId` | a devolução da nota (DEV) ou o lote (LOT → `/lotes/LOT-…`) |
| `contestacaoId` | "Contestação da DEV-…" → `/contestacoes/{id}` |
| `claimId` | "Reclamação {claimId}", sem link |
| nada disso, ou a entidade sumiu | `null` |

- [ ] **Passo 1: Escrever os testes que falham**

`src/modules/acabamento/falhas-acoes.int.test.ts`:

```ts
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { falhasTarefas } from '@/db/schema';
import { definirFilaParaTestes, FilaMemoria } from '@/modules/fila/fila';
import { listarEventos } from '@/modules/historico/eventos';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarDevolucaoTeste, criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { criarFalhaTeste } from '../../../tests/helpers/fabricas-acabamento';
import { dispensarFalha, ErroFalhas, listarFalhas, reenviarFalha } from './falhas';

const { db, sql } = criarDbTeste();
const AGORA = new Date('2026-11-20T12:00:00Z');
let fila: FilaMemoria;
beforeEach(async () => {
  await limparTabelas(sql);
  fila = new FilaMemoria();
  definirFilaParaTestes(fila);
});
afterAll(() => sql.end());

describe('Tentar de novo (spec §6.8)', () => {
  it('reenvia a mesma tarefa com os mesmos dados, sem chave única, e registra no histórico', async () => {
    const gestor = await criarUsuarioTeste(db, 'GESTOR');
    const { id } = await criarFalhaTeste(db, { tarefa: 'nfe.consultar', dados: { notaFiscalId: 'n1', consulta: 150 } });
    expect(await reenviarFalha(db, id, gestor, AGORA)).toEqual({ tarefa: 'nfe.consultar' });
    expect(fila.enviadas.map(({ nome, dados }) => ({ nome, dados }))).toEqual([{ nome: 'nfe.consultar', dados: { notaFiscalId: 'n1', consulta: 150 } }]);
    expect(fila.enviadas[0].opcoes?.chaveUnica).toBeUndefined();
    const [f] = await db.select().from(falhasTarefas).where(eq(falhasTarefas.id, id));
    expect(f).toMatchObject({ situacao: 'REENVIADA', resolvidaPor: gestor.id });
    expect(f.resolvidaEm?.toISOString()).toBe(AGORA.toISOString());
    const eventos = await listarEventos(db, 'configuracao', 'falhas');
    expect(eventos.map((e) => [e.acao, e.dados?.falhaId])).toEqual([['tarefa_reenviada', id]]);
  });

  it('clique duplo: um reenvio só, e o segundo recebe a mensagem', async () => {
    const gestor = await criarUsuarioTeste(db, 'GESTOR');
    const { id } = await criarFalhaTeste(db, { tarefa: 'limpeza.temporarios', dados: {} });
    const r = await Promise.allSettled([reenviarFalha(db, id, gestor), reenviarFalha(db, id, gestor)]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect((r.find((x) => x.status === 'rejected') as PromiseRejectedResult).reason).toEqual(new ErroFalhas('Esta falha já foi tratada.'));
    expect(fila.enviadas).toHaveLength(1);
  });

  it('só o Gestor; id inválido ou inexistente', async () => {
    const fiscal = await criarUsuarioTeste(db, 'FISCAL');
    const gestor = await criarUsuarioTeste(db, 'GESTOR');
    const { id } = await criarFalhaTeste(db);
    await expect(reenviarFalha(db, id, fiscal)).rejects.toThrow('Só o Gestor trata as Falhas.');
    await expect(reenviarFalha(db, 'abc', gestor)).rejects.toThrow('Falha não encontrada.');
    await expect(reenviarFalha(db, '0b9f1c2e-3d4a-4b5c-8d6e-7f8091a2b3c4', gestor)).rejects.toThrow('Falha não encontrada.');
    expect(fila.enviadas).toHaveLength(0);
  });
});

describe('Dispensar (extra, decisão 4)', () => {
  it('ABERTA → DISPENSADA, sem reenviar, com o evento tarefa_dispensada', async () => {
    const gestor = await criarUsuarioTeste(db, 'GESTOR');
    const { id } = await criarFalhaTeste(db);
    await dispensarFalha(db, id, gestor, AGORA);
    const [f] = await db.select().from(falhasTarefas).where(eq(falhasTarefas.id, id));
    expect(f.situacao).toBe('DISPENSADA');
    expect(fila.enviadas).toHaveLength(0);
    expect((await listarEventos(db, 'configuracao', 'falhas')).map((e) => e.acao)).toEqual(['tarefa_dispensada']);
    await expect(dispensarFalha(db, id, gestor)).rejects.toThrow('Esta falha já foi tratada.');
  });
});

describe('listarFalhas', () => {
  it('só as abertas, a mais recente primeiro, com o nome da tarefa e a referência', async () => {
    const operador = await criarUsuarioTeste(db, 'OPERADOR');
    const dev = await criarDevolucaoTeste(db, operador);
    await criarFalhaTeste(db, { tarefa: 'ml.enviar-resultado', dados: { devolucaoId: dev.id }, ultimaFalhaEm: new Date('2026-11-20T10:00:00Z') });
    await criarFalhaTeste(db, { tarefa: 'ml.sincronizar-reclamacao', dados: { claimId: '5012345678' }, ultimaFalhaEm: new Date('2026-11-20T11:00:00Z') });
    await criarFalhaTeste(db, { situacao: 'REENVIADA' });
    const { falhas, total } = await listarFalhas(db);
    expect(total).toBe(2);
    expect(falhas.map((f) => [f.rotuloTarefa, f.referencia])).toEqual([
      ['Sincronizar reclamação do Mercado Livre', { texto: 'Reclamação 5012345678', href: null }],
      ['Enviar o resultado da conferência ao ML', { texto: dev.codigo, href: `/fluxo/devolucoes/${dev.codigo}` }],
    ]);
  });
});
```

Rode: `npm run test:int -- src/modules/acabamento/falhas-acoes`
Esperado: FAIL.

- [ ] **Passo 2: Implementar**

- `reenviarFalha`: na ordem abaixo.
  1. Recusa sem `pode(usuario.perfil, 'administrar')`, e o id que não passa no `ehUuid`.
  2. Numa transação: `update falhas_tarefas set situacao = 'REENVIADA', resolvida_por, resolvida_em where id = ? and situacao = 'ABERTA' returning tarefa, dados`. A condição no `where` é o que impede o clique duplo.
  3. Sem linha: um `select` separa "Falha não encontrada." de "Esta falha já foi tratada.".
  4. Tarefa que não passa no `ehNomeTarefa` → ErroFalhas "Falha não encontrada.".
  5. Ainda na transação: `obterFila().enviar(tarefa, dados as DadosTarefa[typeof tarefa], { tx })`, sem `chaveUnica` (decisão 3), e `registrarEvento(tx, { entidade: 'configuracao', entidadeId: 'falhas', acao: 'tarefa_reenviada', usuarioId, em: agora, dados: { falhaId, tarefa } })`.
- `dispensarFalha`: o mesmo caminho, com DISPENSADA, sem envio e com `tarefa_dispensada`.
- `listarFalhas`: uma consulta paginada, mais a busca das referências em lote (no máximo uma consulta por tipo de dado). `formatarDataHora` para as duas datas.

- [ ] **Passo 3: Rodar os testes**

Rode: `npm run test:int -- src/modules/acabamento`
Esperado: PASS.

- [ ] **Passo 4: Commit**

```bash
git add src/modules/acabamento/falhas.ts src/modules/acabamento/falhas-acoes.int.test.ts
git commit -m "feat(falhas): tentar de novo (sem chave única), dispensar (extra) e lista das falhas abertas com a referência" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 4: Prazo de guarda (`midia.retencao`, spec §9) e as linhas das importações (LGPD)

**Arquivos:**
- Criar: `src/modules/acabamento/retencao.ts`
- Modificar: `src/worker/manipuladores/acabamento.ts`
- Testes: `src/modules/acabamento/retencao.int.test.ts`

**Interfaces:**
- Consome: `lerConfiguracao` (`mesesRetencaoMidia`), `armazenamentoDoProvedor` (E15), `apagarTemporario` (Fase 2), `registrarEvento`, tabelas `devolucoes`, `itensDevolucao`, `lotes`, `contestacoesCanal`, `evidencias`, `importacoes`; fábricas da Tarefa 1, `criarEvidenciaTeste` (Fase 2), `criarFornecedorCompletoTeste` e `criarLoteTeste` (Fase 5), `salvarConfiguracaoMidia` (Fase 2).
- Produz (`retencao.ts`):
  - `RODADA_RETENCAO = 50`, `TEMPO_MAXIMO_RETENCAO_MS = 240_000`, `DIAS_LINHAS_IMPORTACAO = 30`
  - `devolucoesParaRetencao(db: DbOuTx, agora: Date, meses: number, limite: number): Promise<string[]>`
  - `apagarMidiasDaDevolucao(db: Db, devolucaoId: string, agora: Date): Promise<number>` (quantas evidências)
  - `aplicarRetencao(db: Db, opcoes: { agora: Date; rodada?: number; tempoMaximoMs?: number; relogio?: () => number }): Promise<{ devolucoes: number; evidencias: number }>`
  - `limparLinhasImportacoes(db: DbOuTx, agora: Date): Promise<number>`
  - `manipuladoresAcabamento['midia.retencao']`: `aplicarRetencao` + `limparLinhasImportacoes`, com o resultado numa linha JSON (`{ origem: 'worker', tarefa: 'midia.retencao', devolucoes, evidencias, importacoes }`).

Regra de seleção (decisão 7). Entram as devoluções com `status = 'CONCLUIDA'` e `concluida_em < agora - meses` (SQL: `${agora}::timestamptz - make_interval(months => ${meses})`), que têm evidência com situação diferente de APAGADA, e para as quais **não existe**:
- unidade com `destino = 'PROBLEMA'` e status diferente de `RESOLVIDO` (cobre `SEM_FORNECEDOR`, `EM_LOTE`, `ENVIADO` e a PROBLEMA que ficou em AGUARDANDO_NF numa devolução CONCLUIDA, D11);
- unidade com `lote_id` de um lote com status diferente de `FINALIZADO`;
- contestação `AGUARDANDO_GESTOR` ou `FALHOU`.

A ordem é `concluida_em` crescente, com `limit`.

- [ ] **Passo 1: Escrever os testes que falham**

`src/modules/acabamento/retencao.int.test.ts`:

```ts
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { evidencias, importacoes, itensDevolucao } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { listarEventos } from '@/modules/historico/eventos';
import { definirArmazenamentoParaTestes } from '@/modules/midia/armazenamento';
import { ArmazenamentoMemoria } from '@/modules/midia/armazenamento-memoria';
import { salvarConfiguracaoMidia } from '@/modules/midia/configuracao';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { criarContestacaoTeste, criarDevolucaoConcluidaTeste } from '../../../tests/helpers/fabricas-acabamento';
import { criarEvidenciaTeste } from '../../../tests/helpers/fabricas-conferencia';
import { criarFornecedorCompletoTeste, criarLoteTeste } from '../../../tests/helpers/fabricas-lotes';
import { aplicarRetencao, limparLinhasImportacoes } from './retencao';

const { db, sql } = criarDbTeste();
const AGORA = new Date('2027-12-01T12:00:00Z');
const HA_13_MESES = new Date('2026-11-01T12:00:00Z');
const HA_2_MESES = new Date('2027-10-01T12:00:00Z');
let armazenamento: ArmazenamentoMemoria;
let operador: UsuarioSessao;

beforeEach(async () => {
  await limparTabelas(sql);
  armazenamento = new ArmazenamentoMemoria();
  definirArmazenamentoParaTestes(armazenamento);
  operador = await criarUsuarioTeste(db, 'OPERADOR');
});
afterAll(() => sql.end());

/** Devolução concluída com a Foto 1 e o Vídeo de Prova já no armazenamento. */
async function concluidaComMidias(concluidaEm: Date, unidades: Parameters<typeof criarDevolucaoConcluidaTeste>[2]['unidades'] = [{ destino: 'BOM' }]) {
  const dev = await criarDevolucaoConcluidaTeste(db, operador, { concluidaEm, unidades });
  const caminhos: string[] = [];
  for (const tipo of ['FOTO_1_ETIQUETA', 'VIDEO_PROVA'] as const) {
    const caminho = `evidencias/${dev.id}/${randomUUID()}.${tipo === 'VIDEO_PROVA' ? 'mp4' : 'jpg'}`;
    await armazenamento.salvar(caminho, Readable.from(Buffer.from('conteudo')));
    await criarEvidenciaTeste(db, { devolucaoId: dev.id, tipo, situacao: 'PRONTA', caminho, provedor: 'memoria' });
    caminhos.push(caminho);
  }
  return { dev, caminhos };
}

async function situacoes(devolucaoId: string) {
  return (await db.select({ s: evidencias.situacaoProcessamento }).from(evidencias).where(eq(evidencias.devolucaoId, devolucaoId))).map((l) => l.s);
}

describe('midia.retencao (spec §9)', () => {
  it('apaga as mídias de devolução CONCLUIDA há mais de 12 meses e guarda os hashes', async () => {
    const { dev, caminhos } = await concluidaComMidias(HA_13_MESES);
    expect(await aplicarRetencao(db, { agora: AGORA })).toEqual({ devolucoes: 1, evidencias: 2 });
    for (const c of caminhos) expect(await armazenamento.existe(c)).toBe(false);
    const linhas = await db.select().from(evidencias).where(eq(evidencias.devolucaoId, dev.id));
    expect(linhas.map((l) => [l.situacaoProcessamento, l.caminho, l.sha256Original])).toEqual([
      ['APAGADA', null, 'a'.repeat(64)],
      ['APAGADA', null, 'a'.repeat(64)],
    ]);
    const eventos = await listarEventos(db, 'devolucao', dev.id);
    expect(eventos.filter((e) => e.acao === 'midia_apagada_retencao').map((e) => e.dados)).toEqual([{ evidencias: 2 }]);
  });

  it('respeita o prazo configurado pelo Gestor (meses_retencao_midia)', async () => {
    const gestor = await criarUsuarioTeste(db, 'GESTOR');
    const { dev } = await concluidaComMidias(HA_2_MESES);
    expect((await aplicarRetencao(db, { agora: AGORA })).devolucoes).toBe(0);
    await salvarConfiguracaoMidia(db, { videoObrigatorio: 'SEMPRE', mesesRetencaoMidia: 1 }, gestor);
    expect((await aplicarRetencao(db, { agora: AGORA })).devolucoes).toBe(1);
    expect(await situacoes(dev.id)).toEqual(['APAGADA', 'APAGADA']);
  });

  it('nunca apaga com lote não FINALIZADO, unidade PROBLEMA não resolvida ou contestação pendente; apaga quando tudo terminou', async () => {
    const fornecedor = await criarFornecedorCompletoTeste(db);
    const problema = [{ destino: 'PROBLEMA' as const, motivo: 'AVARIADO' as const }];
    const noLoteAberto = await concluidaComMidias(HA_13_MESES, problema);
    const lote = await criarLoteTeste(db, { fornecedorId: fornecedor.id, status: 'ABERTO' });
    await db.update(itensDevolucao).set({ status: 'EM_LOTE', loteId: lote.id }).where(eq(itensDevolucao.id, noLoteAberto.dev.itens[0].id));
    const semFornecedor = await concluidaComMidias(HA_13_MESES, problema);
    await db.update(itensDevolucao).set({ status: 'SEM_FORNECEDOR' }).where(eq(itensDevolucao.id, semFornecedor.dev.itens[0].id));
    const aguardandoGestor = await concluidaComMidias(HA_13_MESES);
    await criarContestacaoTeste(db, aguardandoGestor.dev.id, { status: 'AGUARDANDO_GESTOR', prazo: null });
    const falhou = await concluidaComMidias(HA_13_MESES);
    await criarContestacaoTeste(db, falhou.dev.id, { status: 'FALHOU', prazo: null });
    // D11: unidade PROBLEMA que ficou em AGUARDANDO_NF numa devolução CONCLUIDA (a fábrica a deixa assim).
    const problemaSemLote = await concluidaComMidias(HA_13_MESES, problema);

    const terminada = await concluidaComMidias(HA_13_MESES, problema);
    const finalizado = await criarLoteTeste(db, { fornecedorId: fornecedor.id, status: 'FINALIZADO', tipo: 'CONSERTO' });
    await db
      .update(itensDevolucao)
      .set({ status: 'RESOLVIDO', loteId: finalizado.id, resultadoFornecedor: 'CONSERTADO' })
      .where(eq(itensDevolucao.id, terminada.dev.itens[0].id));
    await criarContestacaoTeste(db, terminada.dev.id, { status: 'ENVIADA', prazo: null });

    expect(await aplicarRetencao(db, { agora: AGORA })).toEqual({ devolucoes: 1, evidencias: 2 });
    for (const d of [noLoteAberto, semFornecedor, aguardandoGestor, falhou, problemaSemLote]) expect(await situacoes(d.dev.id)).toEqual(['PRONTA', 'PRONTA']);
    expect(await situacoes(terminada.dev.id)).toEqual(['APAGADA', 'APAGADA']);
  });

  it('não mexe em devolução recente nem em quem não está CONCLUIDA', async () => {
    const recente = await concluidaComMidias(HA_2_MESES);
    const reaberta = await concluidaComMidias(HA_13_MESES);
    await sql`update devolucoes set status = 'AGUARDANDO_NF' where id = ${reaberta.dev.id}`; // sql = cliente postgres.js do teste
    expect((await aplicarRetencao(db, { agora: AGORA })).devolucoes).toBe(0);
    expect(await situacoes(recente.dev.id)).toEqual(['PRONTA', 'PRONTA']);
  });

  it('arquivo que já sumiu não é erro, e a segunda rodada não faz nada', async () => {
    const { dev, caminhos } = await concluidaComMidias(HA_13_MESES);
    await armazenamento.apagar(caminhos[0]);
    expect((await aplicarRetencao(db, { agora: AGORA })).evidencias).toBe(2);
    expect(await aplicarRetencao(db, { agora: AGORA })).toEqual({ devolucoes: 0, evidencias: 0 });
    expect(await situacoes(dev.id)).toEqual(['APAGADA', 'APAGADA']);
  });

  it('apaga também o arquivo temporário de uma evidência que falhou', async () => {
    const dev = await criarDevolucaoConcluidaTeste(db, operador, { concluidaEm: HA_13_MESES, unidades: [{ destino: 'BOM' }] });
    const temporario = join(mkdtempSync(join(tmpdir(), 'retencao-')), 'upload');
    writeFileSync(temporario, 'x');
    await criarEvidenciaTeste(db, { devolucaoId: dev.id, tipo: 'VIDEO_PROVA', situacao: 'FALHOU', caminhoTemporario: temporario });
    expect((await aplicarRetencao(db, { agora: AGORA })).evidencias).toBe(1);
    expect(existsSync(temporario)).toBe(false);
  });

  it('trabalha em rodadas e para no tempo máximo (decisão 7e)', async () => {
    for (let i = 0; i < 3; i++) await concluidaComMidias(HA_13_MESES);
    expect((await aplicarRetencao(db, { agora: AGORA, rodada: 2, tempoMaximoMs: 0 })).devolucoes).toBe(2);
    expect((await aplicarRetencao(db, { agora: AGORA, rodada: 2 })).devolucoes).toBe(1);
  });
});

describe('linhas das importações (LGPD, decisão 8)', () => {
  it('importação CONCLUIDA há mais de 30 dias perde as linhas e guarda o resumo; as outras ficam', async () => {
    const gestor = await criarUsuarioTeste(db, 'GESTOR');
    const base = { tipo: 'devolucoes' as const, nomeArquivo: 'p.xlsx', cabecalhos: ['nome do comprador'], linhas: [['Maria']], criadoPor: gestor.id };
    const [velha] = await db.insert(importacoes).values({ ...base, situacao: 'CONCLUIDA', resumo: { criados: 1 } as never, concluidaEm: new Date('2027-10-01T00:00:00Z') }).returning();
    const [nova] = await db.insert(importacoes).values({ ...base, situacao: 'CONCLUIDA', concluidaEm: new Date('2027-11-25T00:00:00Z') }).returning();
    const [pendente] = await db.insert(importacoes).values({ ...base, criadaEm: new Date('2027-01-01T00:00:00Z') }).returning();
    expect(await limparLinhasImportacoes(db, AGORA)).toBe(1);
    const linhas = async (id: string) => (await db.select({ l: importacoes.linhas, r: importacoes.resumo }).from(importacoes).where(and(eq(importacoes.id, id))))[0];
    expect(await linhas(velha.id)).toEqual({ l: [], r: { criados: 1 } });
    expect((await linhas(nova.id)).l).toEqual([['Maria']]);
    expect((await linhas(pendente.id)).l).toEqual([['Maria']]); // a PENDENTE é da limpeza.temporarios (Fase 2)
  });
});
```

Se a fábrica `criarLoteTeste` da Fase 5 já mudar o status e o `lote_id` das unidades, ou exigir outros campos, ajuste **só o teste**: a regra testada é a mesma. O `resumo` usa o formato de `ResumoImportacao`.

Rode: `npm run test:int -- src/modules/acabamento/retencao`
Esperado: FAIL.

- [ ] **Passo 2: Implementar**

- `apagarMidiasDaDevolucao`: lê as evidências com situação diferente de APAGADA.
  - Para cada uma, chama `armazenamentoDoProvedor(e.provedor ?? provedorAtual()).apagar(e.caminho)` quando há `caminho`. Se a resposta for "não existe", não é erro: confira o comportamento do disco, do S3 e da memória, e use `existe()` antes, se preciso.
  - Chama `apagarTemporario(e.caminhoTemporario)` quando há temporário.
  - Depois, numa transação, grava `situacao = 'APAGADA'`, `caminho = null` e `caminhoTemporario = null` nas ids que ainda não estão APAGADA, mais o evento `midia_apagada_retencao` (`usuarioId: null`, `dados: { evidencias: N }`).
- `aplicarRetencao`: lê os meses com `lerConfiguracao`. Laço: `devolucoesParaRetencao(..., rodada)` → apaga uma por uma → para quando a lista vem vazia ou quando `relogio() - inicio >= tempoMaximoMs`. O relógio é conferido depois de cada rodada; com `tempoMaximoMs: 0`, faz uma rodada só.
- `limparLinhasImportacoes`: `update importacoes set linhas = '[]'::jsonb where situacao = 'CONCLUIDA' and concluida_em < agora - 30 dias and jsonb_array_length(linhas) > 0`. Devolve o número de linhas.
- `manipuladoresAcabamento`: como nas Interfaces. O manipulador é idempotente (uma 2ª execução não acha nada).

- [ ] **Passo 3: Rodar os testes**

Rode: `npm run test:int -- src/modules/acabamento && npm test -- src/worker`
Esperado: PASS.

- [ ] **Passo 4: Commit**

```bash
git add src/modules/acabamento/retencao.ts src/modules/acabamento/retencao.int.test.ts src/worker/manipuladores/acabamento.ts
git commit -m "feat(acabamento): midia.retencao apaga as mídias vencidas (nunca com lote, sem fornecedor ou contestação pendente) e as linhas das planilhas concluídas" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 5: Alertas das devoluções (regras puras e consultas)

**Arquivos:**
- Criar: `src/modules/acabamento/alertas-regras.ts`, `src/modules/acabamento/alertas-devolucoes.ts`
- Modificar: `src/modules/devolucoes/selos.ts` (usa `prazoVencendo`), `src/modules/devolucoes/busca.ts` (opção `ids`)
- Testes: `src/modules/acabamento/alertas-regras.test.ts`, `src/modules/acabamento/alertas-devolucoes.int.test.ts`

**Interfaces:**
- Consome: `type Perfil`, `type TomSelo`, tabelas `devolucoes`, `itensDevolucao`, `notasFiscais`, `lotes`, `contestacoesCanal`, `eventosHistorico`; fábricas da Tarefa 1, `criarDevolucaoTeste`, `criarFornecedorCompletoTeste`, `criarLoteTeste`.
- Produz:
  - `alertas-regras.ts` (puro):
    - `IDS_ALERTA` (na ordem da tabela da decisão 9), `type IdAlerta`;
    - `DEFINICAO_ALERTA: Record<IdAlerta, { titulo: string; perfis: readonly Perfil[]; tom: TomSelo; href: string }>`, com os títulos, perfis e links da decisão 9;
    - `alertasDoPerfil(perfil: Perfil): IdAlerta[]`;
    - `PRAZO_VENCENDO_MS = 24 * 60 * 60 * 1000` e `prazoVencendo(prazo: Date, agora: Date): boolean`;
    - `diasUteisDepois(entrega: Date, agora: Date): number` (decisão 12);
    - `JANELA_ALERTA_EVENTO_MS = 7 * 24 * 60 * 60 * 1000`;
    - `type UsoDisco = { totalBytes: number; livreBytes: number }`, `percentualUso(u: UsoDisco): number` e `discoQuaseCheio(u: UsoDisco): boolean` (> 85%);
    - `LIMITE_BACKUP_MS = 26 * 60 * 60 * 1000` e `backupAtrasado(ultimoOk: Date | null, jaHouveBackup: boolean, agora: Date): boolean`.
  - `alertas-devolucoes.ts`:
    - `devolucoesComPrazoVencendo(db, agora): Promise<string[]>`;
    - `contestacoesComPrazoVencendo(db, agora): Promise<{ id: string; devolucaoCodigo: string }[]>`;
    - `notasRejeitadas(db): Promise<{ devolucaoIds: string[]; lotes: { codigo: string }[] }>`;
    - `contarSemFornecedor(db): Promise<number>`;
    - `devolucoesEntreguesSemLeitura(db, agora): Promise<string[]>`;
    - `devolucoesComMLEncerradoAposChegada(db, agora): Promise<string[]>`: eventos `ml_status_apos_chegada` dos últimos 7 dias cujo `dados->>'statusCanal'` está em `STATUS_ML_CANCELAMENTO` ou `STATUS_ML_EXTRAVIO` (decisão 10);
    - `devolucoesComAlertaLote(db, agora): Promise<string[]>` (eventos `lote_alerta_nf_cancelada` na devolução, últimos 7 dias) e `lotesComAlertaNfCancelada(db, agora): Promise<{ codigo: string }[]>`.
  - `busca.ts`: `OpcoesBusca.ids?: readonly string[]`. Com uma lista vazia, o resultado é vazio (`sql\`false\``).

- [ ] **Passo 1: Escrever os testes que falham**

`src/modules/acabamento/alertas-regras.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { alertasDoPerfil, backupAtrasado, DEFINICAO_ALERTA, diasUteisDepois, discoQuaseCheio, prazoVencendo } from './alertas-regras';

const h = (iso: string) => new Date(iso);

describe('alertas do painel (spec §6.0.1)', () => {
  it('títulos da spec', () => {
    expect(DEFINICAO_ALERTA.prazo_ml.titulo).toBe('Prazo do ML vencendo');
    expect(DEFINICAO_ALERTA.nf_rejeitada.titulo).toBe('NF rejeitada');
    expect(DEFINICAO_ALERTA.sincronizacao_ml.titulo).toBe('Sincronização com o ML parada há mais de 1 h');
    expect(DEFINICAO_ALERTA.sem_fornecedor.titulo).toBe('Itens sem fornecedor');
    expect(DEFINICAO_ALERTA.entregue_sem_leitura.titulo).toBe('Entregue (ML) sem leitura física');
  });

  it('cada perfil vê só os seus (decisão 9)', () => {
    expect(alertasDoPerfil('OPERADOR')).toEqual(['prazo_ml', 'entregue_sem_leitura']);
    expect(alertasDoPerfil('FISCAL')).toEqual(['nf_rejeitada', 'sem_fornecedor', 'lote_nf_cancelada']);
    expect(alertasDoPerfil('GESTOR')).toHaveLength(11);
  });
});

describe('prazoVencendo (decisão 11)', () => {
  const agora = h('2026-11-17T12:00:00Z');
  it('até 24 h ou vencido', () => {
    expect(prazoVencendo(h('2026-11-18T11:00:00Z'), agora)).toBe(true);
    expect(prazoVencendo(h('2026-11-16T12:00:00Z'), agora)).toBe(true);
    expect(prazoVencendo(h('2026-11-18T13:00:00Z'), agora)).toBe(false);
  });
});

describe('diasUteisDepois (decisão 12, fuso de Brasília)', () => {
  // 13/11/2026 é sexta-feira.
  it('entregue na sexta: segunda = 1, terça = 2; o fim de semana não conta', () => {
    const sexta = h('2026-11-13T13:00:00Z');
    expect(diasUteisDepois(sexta, h('2026-11-14T15:00:00Z'))).toBe(0);
    expect(diasUteisDepois(sexta, h('2026-11-16T15:00:00Z'))).toBe(1);
    expect(diasUteisDepois(sexta, h('2026-11-17T11:00:00Z'))).toBe(2);
  });
  it('o dia é o de Brasília: 23h30 de sexta ainda é sexta', () => {
    expect(diasUteisDepois(h('2026-11-14T02:30:00Z'), h('2026-11-17T11:00:00Z'))).toBe(2);
  });
  it('entregue no sábado: terça = 2', () => {
    expect(diasUteisDepois(h('2026-11-14T15:00:00Z'), h('2026-11-17T15:00:00Z'))).toBe(2);
  });
});

describe('disco e backup (extras, decisão 21)', () => {
  it('disco: mais de 85% em uso', () => {
    expect(discoQuaseCheio({ totalBytes: 100, livreBytes: 14 })).toBe(true);
    expect(discoQuaseCheio({ totalBytes: 100, livreBytes: 15 })).toBe(false);
  });
  it('backup: atrasado sem OK em 26 h, só depois do primeiro registro', () => {
    const agora = h('2026-11-20T12:00:00Z');
    expect(backupAtrasado(null, false, agora)).toBe(false);
    expect(backupAtrasado(null, true, agora)).toBe(true);
    expect(backupAtrasado(h('2026-11-19T09:00:00Z'), true, agora)).toBe(true);
    expect(backupAtrasado(h('2026-11-19T11:00:00Z'), true, agora)).toBe(false);
  });
});
```

`src/modules/acabamento/alertas-devolucoes.int.test.ts`:

```ts
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { devolucoes, itensDevolucao } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { buscarDevolucoes } from '@/modules/devolucoes/busca';
import { registrarEvento } from '@/modules/historico/eventos';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarDevolucaoTeste, criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { criarContestacaoTeste, criarDevolucaoConcluidaTeste, criarNotaRejeitadaTeste } from '../../../tests/helpers/fabricas-acabamento';
import { criarFornecedorCompletoTeste, criarLoteTeste } from '../../../tests/helpers/fabricas-lotes';
import {
  contarSemFornecedor, contestacoesComPrazoVencendo, devolucoesComAlertaLote, devolucoesComMLEncerradoAposChegada,
  devolucoesComPrazoVencendo, devolucoesEntreguesSemLeitura, lotesComAlertaNfCancelada, notasRejeitadas,
} from './alertas-devolucoes';

const { db, sql } = criarDbTeste();
const AGORA = new Date('2026-11-17T12:00:00Z'); // terça
const horas = (n: number) => new Date(AGORA.getTime() + n * 3600_000);
let operador: UsuarioSessao;
beforeEach(async () => {
  await limparTabelas(sql);
  operador = await criarUsuarioTeste(db, 'OPERADOR');
});
afterAll(() => sql.end());

async function devolucao(campos: Partial<typeof devolucoes.$inferInsert>) {
  const d = await criarDevolucaoTeste(db, operador);
  await db.update(devolucoes).set(campos).where(eq(devolucoes.id, d.id));
  return d;
}

describe('alertas das devoluções', () => {
  it('prazo do ML vencendo: até 24 h ou vencido, só antes da conferência', async () => {
    const a = await devolucao({ prazoConferenciaCanal: horas(2) });
    const b = await devolucao({ status: 'AGUARDANDO_CONFERENCIA', prazoConferenciaCanal: horas(-1) });
    await devolucao({ prazoConferenciaCanal: horas(48) });
    await devolucao({ status: 'AGUARDANDO_NF', prazoConferenciaCanal: horas(1) });
    expect((await devolucoesComPrazoVencendo(db, AGORA)).sort()).toEqual([a.id, b.id].sort());
  });

  it('contestações com prazo vencendo: AGUARDANDO_GESTOR e FALHOU', async () => {
    const a = await devolucao({});
    const c = await criarContestacaoTeste(db, a.id, { status: 'AGUARDANDO_GESTOR', prazo: horas(3) });
    await criarContestacaoTeste(db, (await devolucao({})).id, { status: 'ENVIADA', prazo: horas(3) });
    await criarContestacaoTeste(db, (await devolucao({})).id, { status: 'FALHOU', prazo: horas(72) });
    expect(await contestacoesComPrazoVencendo(db, AGORA)).toEqual([{ id: c.id, devolucaoCodigo: a.codigo }]);
  });

  it('NF rejeitada: de devolução e de remessa', async () => {
    const d = await devolucao({ status: 'AGUARDANDO_NF' });
    await criarNotaRejeitadaTeste(db, { devolucaoId: d.id });
    const f = await criarFornecedorCompletoTeste(db);
    const lote = await criarLoteTeste(db, { fornecedorId: f.id, status: 'FECHADO', tipo: 'CONSERTO' });
    await criarNotaRejeitadaTeste(db, { loteId: lote.id });
    expect(await notasRejeitadas(db)).toEqual({ devolucaoIds: [d.id], lotes: [{ codigo: lote.codigo }] });
  });

  it('itens SEM_FORNECEDOR', async () => {
    const d = await criarDevolucaoConcluidaTeste(db, operador, { concluidaEm: AGORA, unidades: [{ destino: 'PROBLEMA', motivo: 'AVARIADO' }, { destino: 'PROBLEMA', motivo: 'USADO' }] });
    for (const i of d.itens) await db.update(itensDevolucao).set({ status: 'SEM_FORNECEDOR' }).where(eq(itensDevolucao.id, i.id));
    expect(await contarSemFornecedor(db)).toBe(2);
  });

  it('(extra) Entregue (ML) sem leitura física há 2 dias úteis', async () => {
    const sexta = await devolucao({ canal: 'MERCADO_LIVRE', entregueSegundoCanalEm: new Date('2026-11-13T13:00:00Z') });
    await devolucao({ canal: 'MERCADO_LIVRE', entregueSegundoCanalEm: new Date('2026-11-16T13:00:00Z') });
    await devolucao({ canal: 'MERCADO_LIVRE', status: 'AGUARDANDO_CONFERENCIA', entregueSegundoCanalEm: new Date('2026-11-13T13:00:00Z') });
    expect(await devolucoesEntreguesSemLeitura(db, AGORA)).toEqual([sexta.id]);
  });

  it('status do ML depois da chegada: só cancelamento ou extravio, nos últimos 7 dias (decisão 10)', async () => {
    const cancelada = await devolucao({ status: 'AGUARDANDO_CONFERENCIA' });
    const extraviada = await devolucao({ status: 'AGUARDANDO_CONFERENCIA' });
    const entregue = await devolucao({ status: 'AGUARDANDO_CONFERENCIA' });
    const antiga = await devolucao({ status: 'AGUARDANDO_CONFERENCIA' });
    const evento = (entidadeId: string, statusCanal: string, em: Date) =>
      registrarEvento(db, { entidade: 'devolucao', entidadeId, acao: 'ml_status_apos_chegada', usuarioId: null, em, dados: { statusCanalAnterior: 'shipped', statusCanal } });
    await evento(cancelada.id, 'cancelled', horas(-24));
    await evento(extraviada.id, 'not_delivered', horas(-24));
    // A vida normal de quase toda devolução do ML: "delivered" depois da leitura física NÃO alerta.
    await evento(entregue.id, 'delivered', horas(-24));
    await evento(antiga.id, 'cancelled', horas(-24 * 8));
    expect((await devolucoesComMLEncerradoAposChegada(db, AGORA)).sort()).toEqual([cancelada.id, extraviada.id].sort());
  });

  it('NF cancelada com o lote adiante: devolução e lote, nos últimos 7 dias', async () => {
    const recente = await devolucao({ status: 'CONCLUIDA' });

    const f = await criarFornecedorCompletoTeste(db);
    const lote = await criarLoteTeste(db, { fornecedorId: f.id, status: 'ENVIADO', tipo: 'CONSERTO' });
    await registrarEvento(db, { entidade: 'lote', entidadeId: lote.id, acao: 'lote_alerta_nf_cancelada', usuarioId: null, em: horas(-2) });
    await registrarEvento(db, { entidade: 'devolucao', entidadeId: recente.id, acao: 'lote_alerta_nf_cancelada', usuarioId: null, em: horas(-2) });
    expect(await lotesComAlertaNfCancelada(db, AGORA)).toEqual([{ codigo: lote.codigo }]);
    expect(await devolucoesComAlertaLote(db, AGORA)).toEqual([recente.id]);
  });

  it('buscarDevolucoes com ids traz só essas (a página dos alertas usa)', async () => {
    const a = await devolucao({});
    await devolucao({});
    expect((await buscarDevolucoes(db, {}, { ids: [a.id] })).devolucoes.map((d) => d.id)).toEqual([a.id]);
    expect((await buscarDevolucoes(db, {}, { ids: [] })).total).toBe(0);
  });
});
```

Rode: `npm test -- src/modules/acabamento/alertas-regras && npm run test:int -- src/modules/acabamento/alertas-devolucoes`
Esperado: FAIL.

- [ ] **Passo 2: Implementar**

- `diasUteisDepois`: converte as duas datas para a data civil de `America/Sao_Paulo` (`Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' })`, que dá `AAAA-MM-DD`). Depois conta os dias de segunda a sexta no intervalo (data da entrega, data de hoje], andando dia a dia em UTC sobre as datas civis.
- `selos.ts`: troca a conta local de "vencendo" por `prazoVencendo(d.prazoConferenciaCanal, agora)`. Os testes do selo continuam passando sem mudança.
- `alertas-devolucoes.ts`: uma consulta por função, como na decisão 9 e nas Interfaces.
  - "Antes da conferência" = `PENDENTE_CHEGADA`, `AGUARDANDO_CONFERENCIA` e `EM_CONFERENCIA`.
  - `devolucoesEntreguesSemLeitura` traz as candidatas (`status = 'PENDENTE_CHEGADA' and entregue_segundo_canal_em is not null`) e filtra com `diasUteisDepois(...) >= 2` no TypeScript.
  - Os eventos usam `acao = ? and em > agora - JANELA_ALERTA_EVENTO_MS`, com `distinct entidade_id` (o índice da Tarefa 1 atende). Em `devolucoesComMLEncerradoAposChegada`, acrescente `dados->>'statusCanal' in (...)`, com a lista montada de `[...STATUS_ML_CANCELAMENTO, ...STATUS_ML_EXTRAVIO]` (import de `@/modules/mercado-livre/status`; nada de copiar os valores).

- [ ] **Passo 3: Rodar os testes**

Rode: `npm test -- src/modules/acabamento src/modules/devolucoes && npm run test:int -- src/modules/acabamento src/modules/devolucoes`
Esperado: PASS.

- [ ] **Passo 4: Commit**

```bash
git add src/modules/acabamento/alertas-regras* src/modules/acabamento/alertas-devolucoes* src/modules/devolucoes/selos.ts src/modules/devolucoes/busca.ts
git commit -m "feat(alertas): regras dos alertas do painel (prazo do ML, NF rejeitada, sem fornecedor, entregue sem leitura, eventos recentes)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 6: Alertas do sistema e `carregarAlertas` por perfil

**Arquivos:**
- Criar: `src/modules/acabamento/backup.ts`, `src/modules/acabamento/disco.ts`, `src/modules/acabamento/alertas.ts`
- Testes: `src/modules/acabamento/alertas.int.test.ts`, `src/modules/acabamento/backup.test.ts`

**Interfaces:**
- Consome: Tarefas 3 (`contarFalhasAbertas`) e 5; `obterContaML` e `sincronizacaoAtrasada` (Fase 3); `execucoesBackup`; `lerEnv().MIDIA_DIR`; `contaMLTeste` (`tests/helpers/fabricas-ml.ts`).
- Produz:
  - `backup.ts`:
    - `type ResumoBackup = { situacao: SituacaoBackup; iniciadoEm: Date; terminadoEm: Date | null; tamanhoBanco: number | null; erro: string | null }`;
    - `ultimoBackup(db): Promise<ResumoBackup | null>` (a execução mais recente);
    - `backupEstaAtrasado(db, agora): Promise<boolean>`;
    - `INTERROMPIDO_APOS_MS = 6 * 60 * 60 * 1000`;
    - `type VistaBackup = { texto: string; tom: 'bom' | 'atencao' | 'erro'; erro: string | null }`;
    - `vistaDoBackup(b: ResumoBackup | null, agora: Date): VistaBackup | null` (pura), com os textos:
      - sem backup → `null`;
      - OK → "Último backup: {data} ({tamanho})", tom `bom`, com o tamanho em MB e uma casa decimal ("120,4 MB");
      - FALHOU → "O último backup falhou em {data}.", tom `erro`, com o erro;
      - EM_ANDAMENTO com menos de 6 h → "Backup em andamento desde {hora}.", tom `atencao`;
      - EM_ANDAMENTO com mais de 6 h → "Backup interrompido (começou em {data}).", tom `erro` (decisão 21).
  - `disco.ts`: `usoDiscoMidia(): Promise<UsoDisco | null>` (`statfs` de `MIDIA_DIR`; `null` se falhar).
  - `alertas.ts`:
    - `type AlertaPainel = { id: IdAlerta; titulo: string; quantidade: number | null; detalhe: string | null; tom: TomSelo; href: string }`;
    - `type FontesAlertas = { usoDisco?: () => Promise<UsoDisco | null> }`;
    - `carregarAlertas(db: DbOuTx, perfil: Perfil, agora?: Date, fontes?: FontesAlertas): Promise<AlertaPainel[]>`: só os do perfil, na ordem de `IDS_ALERTA`, e só os que estão ativos (contagem > 0 ou condição verdadeira). O prazo do ML do Gestor soma devoluções e contestações. No disco, `detalhe` = `"92% em uso"`.
    - `type DetalheAlerta = { id: IdAlerta; titulo: string; devolucaoIds: string[]; links: { texto: string; href: string }[] }`;
    - `detalhesDosAlertas(db: DbOuTx, perfil: Perfil, agora?: Date): Promise<DetalheAlerta[]>`: só os alertas que listam devoluções (`prazo_ml`, `nf_rejeitada`, `entregue_sem_leitura`, `ml_status_apos_chegada` via `devolucoesComMLEncerradoAposChegada`, `lote_nf_cancelada` via `devolucoesComAlertaLote`) e que são do perfil. Os links são as contestações ("Contestação da DEV-…" → `/contestacoes/{id}`) e os lotes ("LOT-…" → `/lotes/LOT-…`).

- [ ] **Passo 1: Escrever os testes que falham**

`src/modules/acabamento/alertas.int.test.ts`:

```ts
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { contasMarketplace, devolucoes } from '@/db/schema';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarDevolucaoTeste, criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { criarContestacaoTeste, criarExecucaoBackupTeste, criarFalhaTeste } from '../../../tests/helpers/fabricas-acabamento';
import { contaMLTeste } from '../../../tests/helpers/fabricas-ml';
import { carregarAlertas, detalhesDosAlertas } from './alertas';

const { db, sql } = criarDbTeste();
const AGORA = new Date('2026-11-20T12:00:00Z');
const semDisco = { usoDisco: async () => null };
beforeEach(() => limparTabelas(sql));
afterAll(() => sql.end());

const ids = async (perfil: 'OPERADOR' | 'FISCAL' | 'GESTOR', fontes = semDisco) => (await carregarAlertas(db, perfil, AGORA, fontes)).map((a) => a.id);

describe('carregarAlertas', () => {
  it('sem nada pendente, nenhum alerta', async () => {
    expect(await ids('GESTOR')).toEqual([]);
  });

  it('conta do ML: RECONECTAR (spec §7.1) ou sincronização parada há mais de 1 h (spec §11)', async () => {
    const { contaId } = await contaMLTeste(db);
    await db.update(contasMarketplace).set({ ultimaSincronizacaoEm: new Date('2026-11-20T10:30:00Z') }).where(eq(contasMarketplace.id, contaId));
    expect(await ids('GESTOR')).toEqual(['sincronizacao_ml']);
    expect(await ids('OPERADOR')).toEqual([]);
    await db.update(contasMarketplace).set({ situacao: 'RECONECTAR' }).where(eq(contasMarketplace.id, contaId));
    expect(await ids('GESTOR')).toEqual(['conta_ml_reconectar']);
  });

  it('(extra) Falhas, backup atrasado e disco quase cheio, só para o Gestor', async () => {
    await criarFalhaTeste(db);
    await criarFalhaTeste(db);
    await criarExecucaoBackupTeste(db, { situacao: 'OK', iniciadoEm: new Date('2026-11-19T05:30:00Z') });
    const cheio = { usoDisco: async () => ({ totalBytes: 100, livreBytes: 8 }) };
    const alertas = await carregarAlertas(db, 'GESTOR', AGORA, cheio);
    expect(alertas.map((a) => [a.id, a.quantidade, a.detalhe])).toEqual([
      ['falhas', 2, null],
      ['backup', null, null],
      ['disco', null, '92% em uso'],
    ]);
    expect(await ids('FISCAL', cheio)).toEqual([]);
    await criarExecucaoBackupTeste(db, { situacao: 'OK', iniciadoEm: new Date('2026-11-20T05:30:00Z') });
    expect(await ids('GESTOR')).toEqual(['falhas']);
  });

  it('prazo do ML: o Operador conta as devoluções; o Gestor, também as contestações', async () => {
    const operador = await criarUsuarioTeste(db, 'OPERADOR');
    const d = await criarDevolucaoTeste(db, operador);
    await db.update(devolucoes).set({ prazoConferenciaCanal: new Date('2026-11-20T15:00:00Z') }).where(eq(devolucoes.id, d.id));
    const outra = await criarDevolucaoTeste(db, operador);
    await criarContestacaoTeste(db, outra.id, { status: 'AGUARDANDO_GESTOR', prazo: new Date('2026-11-20T18:00:00Z') });
    const quantidade = async (perfil: 'OPERADOR' | 'GESTOR') =>
      (await carregarAlertas(db, perfil, AGORA, semDisco)).find((a) => a.id === 'prazo_ml')?.quantidade;
    expect(await quantidade('OPERADOR')).toBe(1);
    expect(await quantidade('GESTOR')).toBe(2);
    const [detalhe] = await detalhesDosAlertas(db, 'GESTOR', AGORA);
    expect(detalhe).toMatchObject({ id: 'prazo_ml', devolucaoIds: [d.id] });
    expect(detalhe.links).toEqual([{ texto: `Contestação da ${outra.codigo}`, href: expect.stringMatching(/^\/contestacoes\//) }]);
  });
});
```

`src/modules/acabamento/backup.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { vistaDoBackup } from './backup';

const agora = new Date('2026-11-20T12:00:00Z');
const base = { terminadoEm: null, tamanhoBanco: null, erro: null };

describe('vistaDoBackup (decisões 21 e 22)', () => {
  it('sem backup, OK e FALHOU', () => {
    expect(vistaDoBackup(null, agora)).toBeNull();
    expect(vistaDoBackup({ ...base, situacao: 'OK', iniciadoEm: new Date('2026-11-20T05:30:00Z'), tamanhoBanco: 126_248_141 }, agora)).toMatchObject({ tom: 'bom', texto: expect.stringContaining('120,4 MB') });
    expect(vistaDoBackup({ ...base, situacao: 'FALHOU', iniciadoEm: new Date('2026-11-20T05:30:00Z'), erro: 'BACKUP_SENHA não definida.' }, agora)).toMatchObject({ tom: 'erro', erro: 'BACKUP_SENHA não definida.' });
  });
  it('em andamento há pouco é atenção; há mais de 6 h, interrompido', () => {
    expect(vistaDoBackup({ ...base, situacao: 'EM_ANDAMENTO', iniciadoEm: new Date('2026-11-20T11:00:00Z') }, agora)).toMatchObject({ tom: 'atencao', texto: expect.stringMatching(/^Backup em andamento desde/) });
    expect(vistaDoBackup({ ...base, situacao: 'EM_ANDAMENTO', iniciadoEm: new Date('2026-11-20T05:00:00Z') }, agora)).toMatchObject({ tom: 'erro', texto: expect.stringMatching(/^Backup interrompido/) });
  });
});
```

Rode: `npm test -- src/modules/acabamento/backup && npm run test:int -- src/modules/acabamento/alertas.int`
Esperado: FAIL.

- [ ] **Passo 2: Implementar**

- `carregarAlertas`: para cada `id` de `alertasDoPerfil(perfil)`, chama a função do alerta, com `Promise.all`. Só consulta o que o perfil vê.
  - sincronização: `conta?.situacao === 'ATIVA' && sincronizacaoAtrasada(conta.ultimaSincronizacaoEm ?? conta.conectadaEm, agora)` (a mesma regra de `resumoContaML`);
  - RECONECTAR: `conta?.situacao === 'RECONECTAR'`;
  - backup: `backupAtrasado(ultimoOk, existeAlgumaExecucao, agora)`, em que `ultimoOk` = `iniciado_em` da execução OK mais recente;
  - disco: `fontes.usoDisco ?? usoDiscoMidia`.
- `usoDiscoMidia`: `statfs(resolve(lerEnv().MIDIA_DIR))` de `node:fs/promises`, com `totalBytes = bsize * blocks` e `livreBytes = bsize * bavail`. Em `try/catch`, devolve `null` (no PC, a pasta pode nem existir).

- [ ] **Passo 3: Rodar os testes**

Rode: `npm run test:int -- src/modules/acabamento`
Esperado: PASS.

- [ ] **Passo 4: Commit**

```bash
git add src/modules/acabamento/alertas.ts src/modules/acabamento/alertas.int.test.ts src/modules/acabamento/backup.ts src/modules/acabamento/backup.test.ts src/modules/acabamento/disco.ts
git commit -m "feat(alertas): alertas do sistema (conta e sincronização do ML, Falhas, backup e disco) e carregarAlertas por perfil" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 7: Limite de login por IP

**Arquivos:**
- Criar: `src/modules/auth/limite-login.ts`
- Modificar: `src/app/login/acoes.ts`
- Testes: `src/modules/auth/limite-login.test.ts`, `src/app/login/acoes.test.ts`

**Interfaces:**
- Consome: `ipDaRequisicao` (`src/lib/limite-taxa.ts`), `headers()` de `next/headers`, `autenticar`.
- Produz (`limite-login.ts`):
  - `MAX_FALHAS_POR_IP = 20`, `JANELA_IP_MS = 15 * 60 * 1000`
  - `MENSAGEM_LIMITE_IP = 'Muitas tentativas de entrar a partir desta rede. Tente de novo em 15 minutos.'`
  - `type LimiteLogin = { bloqueado(ip: string, agoraMs?: number): boolean; registrarFalha(ip: string, agoraMs?: number): void; limpar(): void; tamanho(): number }`
  - `criarLimiteLogin(p?: { maximo?: number; janelaMs?: number; maxChaves?: number }): LimiteLogin`. A janela é fixa, contada da 1ª falha. Com o mapa cheio (10 mil por padrão), apaga as janelas vencidas; se ainda estiver cheio, apaga as **mais antigas** (o `Map` guarda a ordem de inserção), nunca o mapa inteiro.
  - `chaveDoIp(ip: string): string`: IPv4 e textos que não são IP ficam como estão; IPv6 vira o prefixo /64 (os 4 primeiros grupos, depois de expandir o `::`), em minúsculas. `bloqueado` e `registrarFalha` usam a chave.
  - `limiteLoginPadrao(): LimiteLogin`, um só por processo (`globalThis`, para o recarregamento do `next dev`).

- [ ] **Passo 1: Escrever os testes que falham**

`src/modules/auth/limite-login.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { chaveDoIp, criarLimiteLogin, JANELA_IP_MS } from './limite-login';

describe('limite de login por IP (spec §10; decisão 14)', () => {
  it('bloqueia o IP depois de 20 falhas em 15 minutos; outro IP segue livre', () => {
    const l = criarLimiteLogin();
    for (let i = 0; i < 20; i++) {
      expect(l.bloqueado('9.9.9.9', 0)).toBe(false);
      l.registrarFalha('9.9.9.9', 0);
    }
    expect(l.bloqueado('9.9.9.9', 1000)).toBe(true);
    expect(l.bloqueado('8.8.8.8', 1000)).toBe(false);
  });

  it('libera quando a janela passa', () => {
    const l = criarLimiteLogin();
    for (let i = 0; i < 20; i++) l.registrarFalha('9.9.9.9', 0);
    expect(l.bloqueado('9.9.9.9', JANELA_IP_MS - 1)).toBe(true);
    expect(l.bloqueado('9.9.9.9', JANELA_IP_MS)).toBe(false);
  });

  it('o escritório inteiro entra pelo mesmo IP: só as falhas contam', () => {
    const l = criarLimiteLogin();
    for (let i = 0; i < 19; i++) l.registrarFalha('1.1.1.1', 0);
    for (let i = 0; i < 30; i++) expect(l.bloqueado('1.1.1.1', 0)).toBe(false);
  });

  it('a memória tem limite: saem os mais antigos, e o bloqueio dos recentes continua', () => {
    const l = criarLimiteLogin({ maximo: 1, maxChaves: 2 });
    for (const ip of ['a', 'b', 'c']) l.registrarFalha(ip, 0);
    expect(l.tamanho()).toBeLessThanOrEqual(2);
    expect(l.bloqueado('a', 0)).toBe(false); // o mais antigo saiu
    expect(l.bloqueado('c', 0)).toBe(true);
  });

  it('IPv6 conta por /64', () => {
    expect(chaveDoIp('2001:db8:1:2:aaaa::1')).toBe(chaveDoIp('2001:DB8:1:2:bbbb:cccc:dddd:2'));
    expect(chaveDoIp('2001:db8:1:3::1')).not.toBe(chaveDoIp('2001:db8:1:2::1'));
    expect(chaveDoIp('2001:db8::1')).toBe('2001:db8:0:0');
    expect(chaveDoIp('203.0.113.7')).toBe('203.0.113.7');
    const l = criarLimiteLogin();
    for (let i = 0; i < 20; i++) l.registrarFalha(`2001:db8:1:2::${i.toString(16)}`, 0);
    expect(l.bloqueado('2001:db8:1:2::ffff', 0)).toBe(true);
  });
});
```

`src/app/login/acoes.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const estado = vi.hoisted(() => ({ ip: '9.9.9.9' }));
const autenticar = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers({ 'x-forwarded-for': `10.0.0.1, ${estado.ip}` })),
  cookies: vi.fn(async () => ({ set: vi.fn(), get: vi.fn(), delete: vi.fn() })),
}));
vi.mock('next/navigation', () => ({ redirect: vi.fn(() => { throw new Error('NEXT_REDIRECT'); }) }));
vi.mock('@/db', () => ({ obterDb: () => ({}) }));
// O servidor.ts começa com `import 'server-only'`, que quebra fora do Next (o mesmo mock de fluxo/conferencia/acoes.test.ts).
vi.mock('@/modules/auth/servidor', () => ({ COOKIE_SESSAO: 'sessao' }));
vi.mock('@/modules/auth/autenticar', () => ({ autenticar }));
vi.mock('@/modules/auth/sessoes', () => ({ criarSessao: vi.fn(async () => ({ token: 't', expiraEm: new Date() })), encerrarSessao: vi.fn() }));

import { limiteLoginPadrao, MENSAGEM_LIMITE_IP } from '@/modules/auth/limite-login';
import { entrar } from './acoes';

const formulario = (email: string, senha: string) => {
  const f = new FormData();
  f.set('email', email);
  f.set('senha', senha);
  return f;
};

beforeEach(() => {
  limiteLoginPadrao().limpar();
  autenticar.mockReset();
  estado.ip = '9.9.9.9';
});

describe('entrar: limite por IP', () => {
  it('depois de 20 falhas do mesmo IP, recusa sem conferir a senha; outro IP segue', async () => {
    autenticar.mockResolvedValue({ ok: false, motivo: 'credenciais' });
    for (let i = 0; i < 20; i++) expect((await entrar({ erro: null }, formulario('x@y.z', 'errada'))).erro).toBe('E-mail ou senha incorretos.');
    autenticar.mockClear();
    expect((await entrar({ erro: null }, formulario('x@y.z', 'errada'))).erro).toBe(MENSAGEM_LIMITE_IP);
    expect(autenticar).not.toHaveBeenCalled();
    estado.ip = '7.7.7.7';
    expect((await entrar({ erro: null }, formulario('x@y.z', 'errada'))).erro).toBe('E-mail ou senha incorretos.');
  });

  it('o bloqueio por usuário também conta como falha do IP', async () => {
    autenticar.mockResolvedValue({ ok: false, motivo: 'bloqueado' });
    for (let i = 0; i < 20; i++) await entrar({ erro: null }, formulario('x@y.z', 'errada'));
    expect((await entrar({ erro: null }, formulario('x@y.z', 'errada'))).erro).toBe(MENSAGEM_LIMITE_IP);
  });

  it('login certo não conta', async () => {
    autenticar.mockResolvedValue({ ok: true, usuario: { id: 'u', nome: 'U', email: 'u@x', perfil: 'OPERADOR' } });
    for (let i = 0; i < 30; i++) await expect(entrar({ erro: null }, formulario('u@x', 'certa'))).rejects.toThrow('NEXT_REDIRECT');
  });
});
```

Rode: `npm test -- src/modules/auth/limite-login src/app/login`
Esperado: FAIL.

- [ ] **Passo 2: Implementar**

- `entrar`, logo depois da checagem de e-mail e senha vazios:
  1. `const ip = ipDaRequisicao(await headers())`;
  2. `if (limiteLoginPadrao().bloqueado(ip)) return { erro: MENSAGEM_LIMITE_IP }`;
  3. em todo `!resultado.ok`, chama `limiteLoginPadrao().registrarFalha(ip)` antes de devolver a mensagem de hoje.

  O resto não muda.
- `limite-login.ts`: como nas Interfaces.

- [ ] **Passo 3: Rodar os testes**

Rode: `npm test -- src/modules/auth src/app/login src/lib/limite-taxa`
Esperado: PASS.

- [ ] **Passo 4: Commit**

```bash
git add src/modules/auth/limite-login.ts src/modules/auth/limite-login.test.ts src/app/login/acoes.ts src/app/login/acoes.test.ts
git commit -m "feat(seguranca): limite de login por IP (20 falhas em 15 min; só as falhas contam)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 8: Cabeçalhos de segurança, CSP e `poweredByHeader: false`

**Arquivos:**
- Criar: `src/lib/cabecalhos-seguranca.ts`
- Modificar: `next.config.ts`
- Testes: `src/lib/cabecalhos-seguranca.test.ts`

**Interfaces:**
- Produz:
  - `politicaDeConteudo(p: { desenvolvimento: boolean }): string`, numa linha só, com as diretivas separadas por `; `;
  - `cabecalhosDeSeguranca(p: { desenvolvimento: boolean }): { key: string; value: string }[]`.
  - O arquivo **não importa nada**: o `next.config.ts` o importa por caminho relativo.

- [ ] **Passo 1: Escrever o teste que falha**

`src/lib/cabecalhos-seguranca.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { cabecalhosDeSeguranca, politicaDeConteudo } from './cabecalhos-seguranca';

const mapa = (desenvolvimento: boolean) => Object.fromEntries(cabecalhosDeSeguranca({ desenvolvimento }).map((c) => [c.key, c.value]));

describe('cabeçalhos de segurança (spec §10; decisão 15)', () => {
  it('produção: cabeçalhos básicos, HSTS e CSP', () => {
    const c = mapa(false);
    expect(c['X-Content-Type-Options']).toBe('nosniff');
    expect(c['X-Frame-Options']).toBe('DENY');
    expect(c['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(c['Permissions-Policy']).toBe('camera=(self), microphone=(self), geolocation=(), payment=(), usb=()');
    expect(c['Strict-Transport-Security']).toBe('max-age=31536000');
    expect(c['Content-Security-Policy']).toBe(politicaDeConteudo({ desenvolvimento: false }));
  });

  it('a CSP libera só o que o sistema usa', () => {
    const csp = politicaDeConteudo({ desenvolvimento: false });
    for (const diretiva of [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: https:",
      "connect-src 'self'",
      "font-src 'self' data:",
      "worker-src 'self' blob:",
      "manifest-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self' https://auth.mercadolivre.com.br",
      "frame-ancestors 'none'",
    ]) {
      expect(csp.split('; ')).toContain(diretiva);
    }
    expect(csp).not.toMatch(/(^|\s)'unsafe-eval'/);
    expect(csp).not.toContain('upgrade-insecure-requests');
    expect(csp).not.toMatch(/\n/);
  });

  it('desenvolvimento: unsafe-eval (o next dev precisa) e sem HSTS', () => {
    const c = mapa(true);
    expect(c['Content-Security-Policy']).toContain("script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' 'unsafe-eval'");
    expect(c['Strict-Transport-Security']).toBeUndefined();
  });
});
```

Rode: `npm test -- src/lib/cabecalhos-seguranca`
Esperado: FAIL.

- [ ] **Passo 2: Implementar**

- `cabecalhos-seguranca.ts`: as diretivas na ordem do teste. Em desenvolvimento, acrescente `'unsafe-eval'` no fim do `script-src`. O HSTS só sai quando `!desenvolvimento`. Comente no código o motivo de não haver `upgrade-insecure-requests` (o HTTPS é do nginx, e o e2e roda em `http://localhost`).
- `next.config.ts`:
  - `import { cabecalhosDeSeguranca } from "./src/lib/cabecalhos-seguranca";`;
  - `poweredByHeader: false`;
  - em `headers()`, **antes** do bloco do `/sw.js`: `{ source: "/((?!api/).*)", headers: cabecalhosDeSeguranca({ desenvolvimento: process.env.NODE_ENV === "development" }) }`. As rotas `/api/` ficam de fora (decisão 15): o DANFE em PDF abre no visualizador do navegador, e as mídias mantêm os cabeçalhos próprios da Fase 2.
  - Se o Next recusar o import relativo de TypeScript no `next.config.ts`, mova as duas funções para `next.config.ts` e exporte-as dali; o teste passa a importar de `../../next.config`.

- [ ] **Passo 3: Rodar os testes e o build**

Rode: `npm test -- src/lib && npm run build && npm run test:e2e -- tests/e2e/arquivos.spec.ts tests/e2e/conferencia.spec.ts tests/e2e/camera.spec.ts tests/e2e/pwa.spec.ts`
Esperado: PASS. O `arquivos.spec.ts` (Fase 2) confirma que as mídias continuam com os próprios cabeçalhos. A conferência com a câmera é coberta de novo no e2e da Tarefa 13. A conexão da conta do ML com a CSP ligada (`form-action` e os redirecionamentos do OAuth) só dá para conferir com a conta real: ela entra nas conferências manuais de "Depois da fase".

- [ ] **Passo 4: Commit**

```bash
git add src/lib/cabecalhos-seguranca.ts src/lib/cabecalhos-seguranca.test.ts next.config.ts
git commit -m "feat(seguranca): cabeçalhos de segurança, CSP sem nonce e poweredByHeader false" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 9: `/api/saude` com 503, log JSON do web, batimento do worker e healthchecks

**Arquivos:**
- Criar: `src/modules/saude/resposta.ts`, `src/instrumentation.ts`, `src/worker/batimento.ts`, `scripts/infra.test.ts`
- Modificar: `src/lib/log.ts` (Tarefa 2; acrescenta `linhaErroRequisicao`), `src/app/api/saude/route.ts`, `scripts/worker.ts`, `docker-compose.prod.yml` (healthchecks do `web` e do `worker`)
- Testes: `src/modules/saude/resposta.test.ts`, `src/lib/log.test.ts` (acrescenta o `describe` abaixo), `src/worker/batimento.test.ts`, `scripts/infra.test.ts`

**Interfaces:**
- Consome: `verificarSaude`, `type ResultadoSaude` (P2), `verificarFila`, `obterConexao`.
- Produz:
  - `responderSaude(verificar: () => Promise<ResultadoSaude>): Promise<Response>`
  - `linhaErroRequisicao(erro: unknown, req: { path: string; method: string }, ctx: { routePath: string; routeType: string }, agora: Date): string`
  - `src/instrumentation.ts`: `export const onRequestError: Instrumentation.onRequestError`, que faz `console.error(linhaErroRequisicao(...))`.
  - `batimento.ts`: `NOME_ARQUIVO_BATIMENTO = 'devolucoes-worker-vivo'`, `ARQUIVO_BATIMENTO = join(tmpdir(), NOME_ARQUIVO_BATIMENTO)`, `INTERVALO_BATIMENTO_MS = 30_000`, `LIMITE_BATIMENTO_MS = 120_000`, `iniciarBatimento(caminho?: string, intervaloMs?: number): () => void`, `batimentoRecente(caminho: string, agoraMs: number, limiteMs?: number): boolean`.

- [ ] **Passo 1: Escrever os testes que falham**

`src/modules/saude/resposta.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { responderSaude } from './resposta';

describe('responderSaude (spec §11; decisão 16)', () => {
  it('200 quando banco e fila respondem, sempre sem cache', async () => {
    const r = await responderSaude(async () => ({ status: 'ok', banco: 'ok', fila: 'ok' }));
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(await r.json()).toEqual({ status: 'ok', banco: 'ok', fila: 'ok' });
  });
  it('503 quando um deles falha', async () => {
    const r = await responderSaude(async () => ({ status: 'erro', banco: 'ok', fila: 'falhou' }));
    expect(r.status).toBe(503);
  });
  it('503 quando a própria verificação lança (ex.: variável de ambiente inválida)', async () => {
    const r = await responderSaude(async () => {
      throw new Error('Variáveis de ambiente inválidas: DATABASE_URL');
    });
    expect(r.status).toBe(503);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(await r.json()).toEqual({ status: 'erro', banco: 'falhou', fila: 'falhou' });
  });
});
```

`src/lib/log.test.ts` (acrescente ao arquivo da Tarefa 2; o import passa a trazer também `linhaErroRequisicao`):

```ts
import { linhaErroRequisicao } from './log';

const req = { path: '/fluxo/busca?rastreio=BR123&pedido=9', method: 'GET', headers: { cookie: 'sessao=segredo' } };
const ctx = { routePath: '/fluxo/busca', routeType: 'render' };

describe('linhaErroRequisicao (spec §11; decisão 18)', () => {
  it('uma linha JSON com caminho sem query, método, rota, tipo, mensagem e digest', () => {
    const erro = Object.assign(new Error('falhou ao ler'), { digest: '123' });
    expect(JSON.parse(linhaErroRequisicao(erro, req, ctx, new Date('2026-11-20T10:00:00Z')))).toEqual({
      em: '2026-11-20T10:00:00.000Z', nivel: 'erro', origem: 'web', caminho: '/fluxo/busca', metodo: 'GET',
      rota: '/fluxo/busca', tipo: 'render', mensagem: 'falhou ao ler', digest: '123',
    });
  });
  it('nunca leva cabeçalhos, query nem pilha; mensagem até 500 caracteres', () => {
    const linha = linhaErroRequisicao(new Error('x'.repeat(900)), req, ctx, new Date());
    expect(linha).not.toContain('segredo');
    expect(linha).not.toContain('BR123');
    expect(linha).not.toContain('at ');
    expect(JSON.parse(linha).mensagem).toHaveLength(500);
    expect(linha).not.toMatch(/\n/);
  });
});
```

`src/worker/batimento.test.ts`:

```ts
import { mkdtempSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { batimentoRecente, iniciarBatimento, LIMITE_BATIMENTO_MS } from './batimento';

const pasta = () => mkdtempSync(join(tmpdir(), 'batimento-'));

describe('batimento do worker (healthcheck; decisão 17)', () => {
  it('grava logo e depois a cada intervalo; para quando pedido', async () => {
    const arquivo = join(pasta(), 'vivo');
    const parar = iniciarBatimento(arquivo, 50);
    try {
      expect(batimentoRecente(arquivo, Date.now())).toBe(true);
      const primeira = statSync(arquivo).mtimeMs;
      await expect.poll(() => statSync(arquivo).mtimeMs, { timeout: 3000, interval: 25 }).toBeGreaterThan(primeira);
    } finally {
      parar();
    }
  });

  it('sem arquivo ou com batimento velho: não está vivo', () => {
    const arquivo = join(pasta(), 'vivo');
    expect(batimentoRecente(arquivo, Date.now())).toBe(false);
    writeFileSync(arquivo, '');
    const velho = (Date.now() - LIMITE_BATIMENTO_MS - 5000) / 1000;
    utimesSync(arquivo, velho, velho);
    expect(batimentoRecente(arquivo, Date.now())).toBe(false);
  });
});
```

`scripts/infra.test.ts` (regras da VPS compartilhada; a Tarefa 10 acrescenta o backup):

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LIMITE_BATIMENTO_MS, NOME_ARQUIVO_BATIMENTO } from '../src/worker/batimento';

const compose = readFileSync('docker-compose.prod.yml', 'utf8');

/** O bloco de um serviço: de "  nome:" até o próximo serviço (2 espaços) ou até "volumes:" no começo da linha. */
export function servico(nome: string): string {
  const m = compose.match(new RegExp(`\\n  ${nome}:\\n([\\s\\S]*?)(?=\\n  [a-z-]+:\\n|\\nvolumes:)`));
  if (!m) throw new Error(`Serviço ${nome} não encontrado no docker-compose.prod.yml`);
  return m[1];
}

describe('docker-compose.prod.yml (VPS compartilhada, spec §13)', () => {
  it('só o web publica porta, e só em 127.0.0.1:3020', () => {
    expect([...compose.matchAll(/"(\d[\d.]*:\d+:\d+)"/g)].map((m) => m[1])).toEqual(['127.0.0.1:3020:3000']);
  });
  it('todo serviço tem limite de memória', () => {
    for (const nome of ['web', 'worker', 'postgres']) expect(servico(nome)).toMatch(/memory: \d+[mg]/);
  });
  it('ninguém usa a rede do host, modo privilegiado ou nome de container fixo', () => {
    expect(compose).not.toMatch(/network_mode:\s*host|privileged:\s*true|container_name:/);
  });
  it('healthcheck do web no /api/saude e do worker no batimento (decisão 17)', () => {
    expect(servico('web')).toMatch(/healthcheck:[\s\S]*\/api\/saude/);
    expect(servico('worker')).toContain(NOME_ARQUIVO_BATIMENTO);
    expect(servico('worker')).toContain(String(LIMITE_BATIMENTO_MS));
  });
});
```

Rode: `npm test -- src/modules/saude src/lib/log src/worker/batimento scripts/infra`
Esperado: FAIL.

- [ ] **Passo 2: Implementar**

- `responderSaude`: `try { const r = await verificar(); return Response.json(r, { status: r.status === 'ok' ? 200 : 503, headers }) } catch { return Response.json({ status: 'erro', banco: 'falhou', fila: 'falhou' }, { status: 503, headers }) }`, com `headers = { 'Cache-Control': 'no-store' }`. A rota fica `export async function GET() { return responderSaude(() => verificarSaude(obterConexao().sql, verificarFila)); }`, e o `obterConexao()` **dentro** da função, para a exceção ser pega.
- `linhaErroRequisicao`: `caminho = req.path.split('?')[0]`; `mensagem = mensagemDoErro(erro)`, a função do mesmo arquivo (Tarefa 2); `digest` só quando existe. O arquivo continua puro, sem imports do projeto.
- `instrumentation.ts`: veja `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md`. Só `onRequestError`.
- `batimento.ts`: grava com `writeFileSync(caminho, new Date().toISOString())` na hora e num `setInterval(...).unref()`; os erros de escrita vão para o log, sem derrubar o worker. `batimentoRecente` = `statSync` em `try/catch` e `agoraMs - mtimeMs < limiteMs`.
- `scripts/worker.ts`: `const pararBatimento = iniciarBatimento();` depois de `iniciarWorker`; dentro de `parar()`, chame `pararBatimento()` antes de `worker.parar()`.
- `docker-compose.prod.yml`, no `web` e no `worker`:

```yaml
    # Decisão 17: o Docker marca "unhealthy" (docker ps); quem reinicia o processo caído é o restart.
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/api/saude').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
```

```yaml
    healthcheck:
      test: ["CMD", "node", "-e", "const s = require('fs').statSync(require('os').tmpdir() + '/devolucoes-worker-vivo'); process.exit(Date.now() - s.mtimeMs < 120000 ? 0 : 1)"]
      interval: 60s
      timeout: 10s
      retries: 3
      start_period: 60s
```

- [ ] **Passo 3: Rodar os testes**

Rode: `npm test -- src/modules/saude src/lib src/worker scripts && npm run test:e2e -- tests/e2e/saude.spec.ts`
Esperado: PASS.

- [ ] **Passo 4: Commit**

```bash
git add src/modules/saude src/app/api/saude/route.ts src/lib/log.ts src/lib/log.test.ts src/instrumentation.ts src/worker/batimento.ts src/worker/batimento.test.ts scripts/worker.ts scripts/infra.test.ts docker-compose.prod.yml
git commit -m "feat(saude): /api/saude responde 503 em qualquer falha, erros do web em JSON, batimento do worker e healthchecks no compose" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 10: Backup diário e restauração (spec §10)

**Arquivos:**
- Criar: `docker/backup/comum.sh`, `docker/backup/agendar.sh`, `docker/backup/backup.sh`, `docker/backup/restaurar.sh`, `docs/operacao/backup-restauracao.md`
- Modificar: `docker-compose.prod.yml` (serviço `backup`), `scripts/infra.test.ts`, `docs/operacao/deploy-vps.md`
- Testes: `src/modules/acabamento/backup-script.int.test.ts`

**Interfaces:**
- Consome: `execucoesBackup` (Tarefa 1); `pg_dump`, `pg_restore`, `psql`, `createdb`, `dropdb`, `openssl` e `sh` do PC. O usuário `devolucoes` precisa de `CREATEDB` na instância da porta 5433 (Restrições globais).
- Produz:
  - `backup.sh`: sem argumentos. Lê `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `BACKUP_*`, `ARMAZENAMENTO`, `MIDIA_DIR` e `S3_BUCKET`. Sai com 0 e grava uma linha OK, ou sai com 1 e grava FALHOU.
    - O banco vai para `banco/devolucoes-AAAA-MM-DD_HHMMSS.dump.enc`.
    - As mídias vão para `midia/midia-AAAA-MM-DD_HHMMSS.tar.enc`.
  - `restaurar.sh <arquivo> [banco]` (decisão 20). Os destinos aceitos são `devolucoes_restauracao*`, ou `PGDATABASE` com `CONFIRMAR=sim`. Ao terminar, imprime uma linha `tabela: N` por tabela principal e `Restauração concluída em <banco>.`.
  - O `rclone` aparece só por estes comandos, que o falso do teste imita: `rcat <remoto>`, `lsjson <remoto>`, `delete --min-age 30d <remoto>` e `cat <remoto>`.
  - **Texto livre nunca vai por `psql -v`** (o `psql.exe` do Windows recusa acento vindo da linha de comando; Restrições globais). A mensagem de erro vai pela entrada padrão, já com as aspas simples dobradas. Só uuid, números e caminhos gerados pelo script vão por `-v`.

- [ ] **Passo 1: Escrever os testes que falham**

`src/modules/acabamento/backup-script.int.test.ts` (o `pg_dump`, o `pg_restore` e o `openssl` são de verdade; o `rclone` é falso; pula se faltar ferramenta, como os testes do ffmpeg):

```ts
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { desc } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { execucoesBackup } from '@/db/schema';
import { criarDbTeste, limparTabelas, urlBancoTeste } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';

const PG_BIN = process.env.PG_BIN ?? 'C:/Program Files/PostgreSQL/18/bin';
const BANCO_RESTAURADO = 'devolucoes_restauracao_f6_teste';
const RCLONE_FALSO = `#!/bin/sh
# rclone falso dos testes: o "bucket" é a pasta $RCLONE_FALSO_DIR.
cmd=$1
for ultimo in "$@"; do :; done
alvo="$RCLONE_FALSO_DIR/$(printf '%s' "$ultimo" | sed 's#^backup:##')"
case "$cmd" in
  rcat) mkdir -p "$(dirname "$alvo")"; cat > "$alvo" ;;
  cat) cat "$alvo" ;;
  lsjson) printf '[{"Size":%s}]\\n' "$(wc -c < "$alvo" | tr -d ' ')" ;;
  delete) echo "$*" >> "$RCLONE_FALSO_DIR/delete.log" ;;
  *) echo "rclone falso: comando $cmd" >&2; exit 2 ;;
esac
`;

function ambiente(extra: Record<string, string> = {}) {
  const base = mkdtempSync(join(tmpdir(), 'backup-'));
  const bin = join(base, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'rclone'), RCLONE_FALSO);
  chmodSync(join(bin, 'rclone'), 0o755);
  const midia = join(base, 'midia');
  mkdirSync(midia);
  writeFileSync(join(midia, 'foto.jpg'), 'jpeg de teste');
  const url = new URL(urlBancoTeste());
  return {
    base,
    env: {
      ...process.env,
      PATH: [bin, PG_BIN, process.env.PATH].join(delimiter),
      PGHOST: url.hostname, PGPORT: url.port || '5432', PGUSER: decodeURIComponent(url.username),
      PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: url.pathname.slice(1),
      BACKUP_S3_BUCKET: 'bucket-teste', BACKUP_SENHA: 'senha-de-teste', ARMAZENAMENTO: 'disco', MIDIA_DIR: midia,
      S3_BUCKET: 'bucket-das-midias', RCLONE_FALSO_DIR: join(base, 'bucket'),
      ...extra,
    },
  };
}

const script = (nome: string, args: string[], env: NodeJS.ProcessEnv) => spawnSync('sh', [`docker/backup/${nome}`, ...args], { env, encoding: 'utf8' });
const sh = (comando: string, env: NodeJS.ProcessEnv) => spawnSync('sh', ['-c', comando], { env, encoding: 'utf8' });
const comPg = { ...process.env, PATH: [PG_BIN, process.env.PATH].join(delimiter) };
const temFerramentas = sh('command -v pg_dump && command -v pg_restore && command -v psql && command -v createdb && command -v openssl', comPg).status === 0;

const { db, sql } = criarDbTeste();
beforeEach(() => limparTabelas(sql));
afterAll(async () => {
  if (temFerramentas) sh(`dropdb --if-exists ${BANCO_RESTAURADO}`, ambiente().env);
  await sql.end();
});

const ultima = async () => (await db.select().from(execucoesBackup).orderBy(desc(execucoesBackup.iniciadoEm)))[0];

describe.skipIf(!temFerramentas)('docker/backup (spec §10)', () => {
  it('backup.sh cifra o pg_dump e as mídias, envia ao bucket, pede a limpeza dos antigos e registra OK', async () => {
    const { base, env } = ambiente();
    const r = script('backup.sh', [], env);
    expect(r.status, r.stderr).toBe(0);

    const [banco] = readdirSync(join(base, 'bucket', 'bucket-teste', 'banco'));
    expect(banco).toMatch(/^devolucoes-\d{4}-\d{2}-\d{2}_\d{6}\.dump\.enc$/);
    const cifrado = join(base, 'bucket', 'bucket-teste', 'banco', banco);
    expect(readFileSync(cifrado).subarray(0, 8).toString()).toBe('Salted__'); // cifrado, não é um dump legível
    const lista = sh(`openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass pass:senha-de-teste -in "${cifrado}" | pg_restore --list`, env);
    expect(lista.status, lista.stderr).toBe(0);
    expect(lista.stdout).toContain('execucoes_backup');

    const [midia] = readdirSync(join(base, 'bucket', 'bucket-teste', 'midia'));
    const tar = sh(`openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass pass:senha-de-teste -in "${join(base, 'bucket', 'bucket-teste', 'midia', midia)}" | tar -tf -`, env);
    expect(tar.stdout).toContain('midia/foto.jpg');

    expect(readFileSync(join(base, 'bucket', 'delete.log'), 'utf8')).toMatch(/--min-age 30d backup:bucket-teste\/banco/);
    const linha = await ultima();
    expect(linha).toMatchObject({ situacao: 'OK', arquivoBanco: `banco/${banco}`, arquivoMidia: `midia/${midia}` });
    expect(linha.tamanhoBanco).toBeGreaterThan(1024);
    expect(linha.terminadoEm).toBeInstanceOf(Date);
  }, 60_000);

  it('restaurar.sh devolve o banco num banco separado e mostra as contagens (spec §14: restauração testada)', async () => {
    await criarUsuarioTeste(db, 'GESTOR');
    await criarUsuarioTeste(db, 'OPERADOR');
    const { base, env } = ambiente();
    expect(script('backup.sh', [], env).status).toBe(0);
    const [banco] = readdirSync(join(base, 'bucket', 'bucket-teste', 'banco'));
    const r = script('restaurar.sh', [`banco/${banco}`, BANCO_RESTAURADO], env);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('usuarios: 2');
    expect(r.stdout).toContain(`Restauração concluída em ${BANCO_RESTAURADO}.`);
    // Rodar de novo recria o banco de restauração do zero.
    expect(script('restaurar.sh', [`banco/${banco}`, BANCO_RESTAURADO], env).status).toBe(0);
  }, 120_000);

  it('restaurar.sh recusa um destino fora de devolucoes_restauracao* sem CONFIRMAR, antes de apagar qualquer coisa', () => {
    const { env } = ambiente();
    const r = script('restaurar.sh', ['banco/qualquer.dump.enc', 'postgres'], env);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('Destino recusado');
    expect(sh(`psql -X -At -d postgres -c "select 1"`, env).stdout.trim()).toBe('1'); // o banco postgres continua lá
  });

  it('com ARMAZENAMENTO=s3 não copia as mídias (já estão fora da VPS)', () => {
    const { base, env } = ambiente({ ARMAZENAMENTO: 's3' });
    expect(script('backup.sh', [], env).status).toBe(0);
    expect(existsSync(join(base, 'bucket', 'bucket-teste', 'midia'))).toBe(false);
  }, 60_000);

  it('sem BACKUP_SENHA: sai com erro e registra FALHOU com a mensagem acentuada (psql do Windows)', async () => {
    const { base, env } = ambiente({ BACKUP_SENHA: '' });
    expect(script('backup.sh', [], env).status).toBe(1);
    expect(existsSync(join(base, 'bucket'))).toBe(false);
    expect(await ultima()).toMatchObject({ situacao: 'FALHOU', erro: 'BACKUP_SENHA não definida.' });
  }, 60_000);

  it('recusa o bucket das mídias como bucket de backup (decisão 19)', async () => {
    const { env } = ambiente({ BACKUP_S3_BUCKET: 'bucket-das-midias' });
    expect(script('backup.sh', [], env).status).toBe(1);
    expect(await ultima()).toMatchObject({ situacao: 'FALHOU', erro: 'O bucket de backup não pode ser o mesmo das mídias (S3_BUCKET).' });
  }, 60_000);
});
```

Rode: `npm run test:int -- src/modules/acabamento/backup-script`
Esperado: FAIL (os scripts não existem). Se o teste **pular**, confira o `PG_BIN`, o `alter role devolucoes createdb` (Restrições globais) e se `sh -c "command -v openssl"` responde no Git Bash. O teste precisa rodar neste PC; não aceite o "skipped" aqui.

- [ ] **Passo 2: Os scripts**

`docker/backup/comum.sh`:

```sh
#!/bin/sh
# Partes comuns do backup e da restauração (spec §10). O remoto "backup" do rclone vem só destas variáveis.
export RCLONE_CONFIG_BACKUP_TYPE=s3
export RCLONE_CONFIG_BACKUP_PROVIDER=Other
export RCLONE_CONFIG_BACKUP_ENDPOINT="${BACKUP_S3_ENDPOINT:-}"
export RCLONE_CONFIG_BACKUP_REGION="${BACKUP_S3_REGIAO:-}"
export RCLONE_CONFIG_BACKUP_ACCESS_KEY_ID="${BACKUP_S3_CHAVE_ID:-}"
export RCLONE_CONFIG_BACKUP_SECRET_ACCESS_KEY="${BACKUP_S3_CHAVE_SECRETA:-}"
export RCLONE_CONFIG_BACKUP_NO_CHECK_BUCKET=true
REMOTO="backup:${BACKUP_S3_BUCKET:-}"

# AES-256 com PBKDF2 (decisão 19). A senha vem do ambiente e nunca aparece na linha de comando.
cifrar() { openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_SENHA; }
decifrar() { openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_SENHA; }

# Log estruturado em JSON (spec §11), como o web e o worker.
log() { printf '{"em":"%s","origem":"backup","nivel":"%s","mensagem":"%s"}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$2"; }

# Texto livre para dentro de um literal SQL: dobra as aspas simples. Vai pela entrada padrão, nunca por -v
# (o psql.exe do Windows recusa acento vindo da linha de comando).
literal_sql() { printf '%s' "$1" | sed "s/'/''/g"; }
```

`docker/backup/backup.sh`:

```sh
#!/bin/sh
# Backup diário (spec §10): banco (pg_dump) e, com ARMAZENAMENTO=disco, as mídias de MIDIA_DIR.
# Tudo cifrado e enviado ao bucket de backup, sem arquivo temporário no disco da VPS. Guarda 30 dias
# (regra de ciclo de vida do bucket; o rclone delete daqui é só reforço). Cada execução fica em execucoes_backup.
# Banco: PGHOST, PGPORT, PGUSER, PGPASSWORD e PGDATABASE (o compose define).
set -eu
set -o pipefail
. "$(dirname "$0")/comum.sh"

DIAS_GUARDA=30
CARIMBO=$(date +%Y-%m-%d_%H%M%S)
OPCOES_ENVIO="--s3-chunk-size 32M --s3-upload-concurrency 2"
sql() { psql -X -q -At -v ON_ERROR_STOP=1 "$@"; }

ID=$(sql -c "insert into execucoes_backup default values returning id")

falhar() {
  log erro "$1"
  msg=$(literal_sql "$1")
  sql <<SQL || true
update execucoes_backup set situacao = 'FALHOU', terminado_em = now(), erro = '$msg' where id = '$ID';
SQL
  exit 1
}

[ -n "${BACKUP_SENHA:-}" ] || falhar "BACKUP_SENHA não definida."
[ -n "${BACKUP_S3_BUCKET:-}" ] || falhar "BACKUP_S3_BUCKET não definido."
[ "$BACKUP_S3_BUCKET" != "${S3_BUCKET:-}" ] || falhar "O bucket de backup não pode ser o mesmo das mídias (S3_BUCKET)."

enviar() { rclone rcat $OPCOES_ENVIO "$REMOTO/$1"; }
tamanho() { rclone lsjson "$REMOTO/$1" | sed -n 's/.*"Size":\([0-9]*\).*/\1/p' | head -n 1; }

ARQ_BANCO="banco/devolucoes-$CARIMBO.dump.enc"
pg_dump -Fc --no-owner | cifrar | enviar "$ARQ_BANCO" || falhar "O pg_dump ou o envio do banco falhou."
TAM_BANCO=$(tamanho "$ARQ_BANCO")
[ "${TAM_BANCO:-0}" -gt 1024 ] || falhar "O arquivo do banco chegou vazio ao bucket."

ARQ_MIDIA=""
TAM_MIDIA=""
if [ "${ARMAZENAMENTO:-disco}" = "disco" ] && [ -d "${MIDIA_DIR:-/data/midia}" ]; then
  PASTA="${MIDIA_DIR:-/data/midia}"
  ARQ_MIDIA="midia/midia-$CARIMBO.tar.enc"
  tar -C "$(dirname "$PASTA")" -cf - "$(basename "$PASTA")" | cifrar | enviar "$ARQ_MIDIA" || falhar "O envio das mídias falhou."
  TAM_MIDIA=$(tamanho "$ARQ_MIDIA")
fi

# Reforço da guarda de 30 dias: com uma chave sem permissão de apagar (recomendada), só avisa.
rclone delete --min-age "${DIAS_GUARDA}d" "$REMOTO/banco" || log atencao "A chave não apaga backups antigos: a regra de ciclo de vida do bucket cuida disso."
[ -z "$ARQ_MIDIA" ] || rclone delete --min-age "${DIAS_GUARDA}d" "$REMOTO/midia" || log atencao "A chave não apaga mídias antigas do backup."

sql -v id="$ID" -v arq_banco="$ARQ_BANCO" -v tam_banco="$TAM_BANCO" -v arq_midia="$ARQ_MIDIA" -v tam_midia="$TAM_MIDIA" <<'SQL'
update execucoes_backup
   set situacao = 'OK', terminado_em = now(), arquivo_banco = :'arq_banco', tamanho_banco = :'tam_banco'::bigint,
       arquivo_midia = nullif(:'arq_midia', ''), tamanho_midia = nullif(:'tam_midia', '')::bigint
 where id = :'id';
SQL
log info "backup concluído: $ARQ_BANCO ($TAM_BANCO bytes)"
```

`docker/backup/agendar.sh`:

```sh
#!/bin/sh
# Ponto de entrada do serviço "backup": instala as ferramentas e roda o backup todo dia às 02h30 (TZ do compose).
# Sem cron: o cron do Alpine não passaria as variáveis do container para o script.
set -eu
apk add --no-cache rclone openssl tzdata >/dev/null
trap 'exit 0' TERM INT
while :; do
  agora=$(date +%s)
  alvo=$(date -d "$(date +%Y-%m-%d) 02:30:00" +%s)
  [ "$agora" -lt "$alvo" ] || alvo=$((alvo + 86400))
  sleep $((alvo - agora)) &
  wait $!
  sh /backup/backup.sh || true
done
```

`docker/backup/restaurar.sh`:

```sh
#!/bin/sh
# Restaura um backup do banco (spec §10). Veja docs/operacao/backup-restauracao.md.
# Uso: sh /backup/restaurar.sh banco/devolucoes-AAAA-MM-DD_HHMMSS.dump.enc [banco_destino]
# Padrão: um banco SEPARADO (devolucoes_restauracao), para conferir sem tocar no banco do sistema.
# Por cima do banco do sistema: pare o web e o worker e use CONFIRMAR=sim com o destino igual a PGDATABASE.
# As mídias (tar do modo disco) voltam à mão: veja o documento.
set -eu
set -o pipefail
. "$(dirname "$0")/comum.sh"

ARQUIVO="${1:?Informe o arquivo. Liste com: rclone lsf backup:\$BACKUP_S3_BUCKET/banco}"
DESTINO="${2:-devolucoes_restauracao}"

case "$DESTINO" in
  devolucoes_restauracao*) ;;
  *)
    if [ "$DESTINO" != "${PGDATABASE:-devolucoes}" ] || [ "${CONFIRMAR:-}" != "sim" ]; then
      echo "Destino recusado: $DESTINO. Use devolucoes_restauracao (padrão), ou o banco do sistema com CONFIRMAR=sim e o web e o worker parados." >&2
      exit 1
    fi
    ;;
esac
[ -n "${BACKUP_SENHA:-}" ] || { echo "BACKUP_SENHA não definida." >&2; exit 1; }

# Banco limpo: dropdb e createdb conectados ao banco "postgres" (nunca ao que vai ser apagado).
dropdb --maintenance-db=postgres --if-exists "$DESTINO"
createdb --maintenance-db=postgres "$DESTINO"
rclone cat "$REMOTO/$ARQUIVO" | decifrar | pg_restore --no-owner --exit-on-error -d "$DESTINO"

for tabela in usuarios devolucoes itens_devolucao evidencias notas_fiscais lotes eventos_historico; do
  printf '%s: %s\n' "$tabela" "$(psql -X -At -d "$DESTINO" -c "select count(*) from $tabela")"
done
echo "Restauração concluída em $DESTINO."
```

- [ ] **Passo 3: O serviço no compose e a checagem**

Em `docker-compose.prod.yml`, depois do `postgres`. **Sem `env_file`** (decisão 19): só as variáveis que o backup usa, interpoladas do `--env-file .env.producao`.

```yaml
  backup:
    # Backup diário (spec §10; decisão 19): pg_dump cifrado e, com ARMAZENAMENTO=disco, as mídias.
    # A imagem é a do banco, para o pg_dump ser da mesma versão. rclone, openssl e tzdata entram na subida.
    # Sem env_file: este container roda "apk add" como root e não deve ver os outros segredos do sistema.
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      TZ: America/Sao_Paulo
      PGHOST: postgres
      PGUSER: devolucoes
      PGDATABASE: devolucoes
      PGPASSWORD: ${POSTGRES_PASSWORD}
      ARMAZENAMENTO: ${ARMAZENAMENTO:-disco}
      MIDIA_DIR: ${MIDIA_DIR:-/data/midia}
      S3_BUCKET: ${S3_BUCKET:-}
      BACKUP_S3_ENDPOINT: ${BACKUP_S3_ENDPOINT:-}
      BACKUP_S3_REGIAO: ${BACKUP_S3_REGIAO:-}
      BACKUP_S3_BUCKET: ${BACKUP_S3_BUCKET:-}
      BACKUP_S3_CHAVE_ID: ${BACKUP_S3_CHAVE_ID:-}
      BACKUP_S3_CHAVE_SECRETA: ${BACKUP_S3_CHAVE_SECRETA:-}
      BACKUP_SENHA: ${BACKUP_SENHA:-}
    volumes:
      - ./docker/backup:/backup:ro
      - midia:/data:ro
    entrypoint: ["sh", "/backup/agendar.sh"]
    depends_on:
      postgres:
        condition: service_healthy
    deploy:
      resources:
        limits:
          memory: 256m
```

Em `scripts/infra.test.ts`, inclua `'backup'` no laço do limite de memória e acrescente:

```ts
  it('backup: postgres 17, scripts e mídias só leitura, fuso de Brasília, sem porta (decisão 19)', () => {
    const b = servico('backup');
    expect(b).toContain('image: postgres:17-alpine');
    expect(b).toContain('./docker/backup:/backup:ro');
    expect(b).toContain('midia:/data:ro');
    expect(b).toContain('TZ: America/Sao_Paulo');
    expect(b).not.toMatch(/ports:/);
  });

  it('backup: sem env_file e sem os segredos do sistema (decisão 19)', () => {
    const b = servico('backup');
    expect(b).not.toMatch(/^\s+env_file:/m); // o comentário do serviço cita a palavra; a chave não pode existir
    for (const segredo of ['ML_CLIENT_SECRET', 'CHAVE_CRIPTOGRAFIA', 'FOCUS_TOKEN', 'S3_CHAVE_ID', 'S3_CHAVE_SECRETA', 'SEGREDO_LINKS', 'DATABASE_URL']) {
      expect(b.replaceAll('BACKUP_S3_CHAVE', 'BACKUP_X')).not.toContain(segredo);
    }
  });
```

- [ ] **Passo 4: A documentação**

`docs/operacao/backup-restauracao.md` (texto para o usuário, em passos curtos):
1. **O que é salvo, quando e por quanto tempo** (decisão 19). Inclui o aviso: no modo disco, o `tar` das mídias é inteiro por dia, então o bucket cresce até 30 vezes o tamanho das mídias.
2. **Primeira vez, no B2:**
   - criar um bucket **só de backup**, diferente do bucket das mídias;
   - ligar nele a regra de ciclo de vida **"Keep only the last version of the file"** com a exclusão das versões antigas depois de 1 dia, e a exclusão dos arquivos com mais de 30 dias. O `rclone delete` do B2 só esconde, e a chave recomendada nem apaga;
   - criar uma application key **restrita a esse bucket**, com leitura e escrita e **sem `deleteFiles`** (proteção contra ransomware);
   - preencher `BACKUP_*` no `.env.producao`.
3. **A senha:** a `BACKUP_SENHA` é gerada no gerenciador de senhas do usuário e colada **só** no `.env.producao` da VPS. Nunca vai para o chat, o git ou um e-mail. Sem ela, o backup não abre.
4. **Rodar um backup agora:** `docker compose --env-file .env.producao -f docker-compose.prod.yml exec backup sh /backup/backup.sh`.
5. **Listar os backups:** `docker compose ... exec backup sh -c '. /backup/comum.sh && rclone lsf "$REMOTO/banco"'`.
6. **Teste de restauração**, no mínimo uma vez por mês, e **obrigatório antes de dar a Fase 6 por pronta** (spec §14): `exec backup sh /backup/restaurar.sh banco/<arquivo>`. As contagens que aparecem têm de bater com as do sistema. Depois, apague o banco de teste: `exec backup dropdb --maintenance-db=postgres devolucoes_restauracao`.
7. **Restauração de verdade (desastre):**
   - parar o `web` e o `worker` (`docker compose ... stop web worker`);
   - `exec -e CONFIRMAR=sim backup sh /backup/restaurar.sh banco/<arquivo> devolucoes`;
   - subir de novo (`docker compose ... up -d`);
   - conferir `/api/saude`.
8. **Mídias, à mão:**
   - com `disco`, num container temporário com `midia:/data` sem `:ro` e as variáveis do backup: `rclone cat "$REMOTO/midia/<arquivo>" | openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_SENHA | tar -xf - -C /data`;
   - com `s3`, as mídias ficam no B2, e a regra de versões do bucket das mídias cobre os 30 dias.

Em `docs/operacao/deploy-vps.md`:
- acrescente o serviço `backup` e o limite de 256 MB na lista do topo;
- acrescente uma seção curta "Backup diário" com o link para `backup-restauracao.md` e o risco que sobra: o container instala `rclone`, `openssl` e `tzdata` pelo `apk` a cada subida, sem versão fixa. Se a instalação falhar, o backup não roda, e o alerta "Backup diário atrasado" avisa o Gestor. A melhoria opcional é uma imagem própria compilada pelo GitHub Actions;
- acrescente a seção "Saúde dos containers": `docker compose ... ps` mostra `healthy`.

- [ ] **Passo 5: Rodar os testes**

Rode: `npm test -- scripts && npm run test:int -- src/modules/acabamento/backup-script`
Esperado: PASS (6 testes do script, **não pulados**).

- [ ] **Passo 6: Commit**

```bash
git add docker/backup docker-compose.prod.yml scripts/infra.test.ts src/modules/acabamento/backup-script.int.test.ts docs/operacao/backup-restauracao.md docs/operacao/deploy-vps.md
git commit -m "feat(backup): backup diário cifrado (banco e mídias), restauração testada em banco separado, serviço sem os segredos do sistema" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 11: Tela Falhas (Configurações › Falhas, spec §6.8)

**Arquivos:**
- Criar: `src/components/acabamento/tipos.ts`, `src/components/acabamento/ListaFalhas.tsx`, `src/components/acabamento/CartaoBackup.tsx`, `src/app/(app)/configuracoes/falhas/acoes.ts`, `tests/e2e/apoio-acabamento.ts`
- Modificar: `src/app/(app)/configuracoes/falhas/page.tsx` (troca o `EmBreve`)
- Testes: `src/components/acabamento/ListaFalhas.test.tsx`, `src/components/acabamento/CartaoBackup.test.tsx`, `tests/e2e/falhas.spec.ts`

**Interfaces:**
- Consome: Tarefa 3 (`listarFalhas`, `reenviarFalha`, `dispensarFalha`, `ErroFalhas`, `FalhaVista`), Tarefa 6 (`ultimoBackup`), `BotaoConfirmar` (Fase 3), `useEnvioFormulario`, `ListaErros`, `Paginacao`, `lerPagina`, `estilos.ts`, `formatarDataHora`.
- Produz:
  - `tipos.ts`: `type EstadoFalhas = { erros: string[]; ok: string | null }`, `ESTADO_INICIAL_FALHAS`.
  - `ListaFalhas({ falhas, acao }: { falhas: FalhaVista[]; acao: (e: EstadoFalhas, d: FormData) => Promise<EstadoFalhas> })` (`'use client'`):
    - **um estado só** para a lista (`useEnvioFormulario(acao, ESTADO_INICIAL_FALHAS, 'erros-falhas')`), com a área fixa `<div id="retorno-falhas" aria-live="polite">` no topo (sucesso e erros) e `ListaErros` com `id="erros-falhas"`;
    - um `<article aria-labelledby>` por falha: título (h2) = `rotuloTarefa`; o erro; "Falhou N vezes" quando `ocorrencias > 1`; "5 tentativas"; a última falha (e a primeira, quando são diferentes); e a referência (link, ou texto);
    - **dois formulários** por cartão, cada um com `falha` e `operacao` escondidos: "Tentar de novo" (`BOTAO_PRIMARIO`, submit) e "Dispensar" (`BotaoConfirmar` com `rotuloConfirmar="Toque de novo para dispensar"`);
    - sem falhas: `VAZIO` "Nenhuma tarefa em Falhas.".
  - `CartaoBackup({ backup }: { backup: VistaBackup | null })` (extra, decisão 22; `VistaBackup` e `vistaDoBackup` são da Tarefa 6): título "Backup diário"; sem backup, "Nenhum backup registrado ainda."; senão, o `texto` no estilo do tom (`ALERTA_OK`, `ALERTA_ATENCAO` ou `ALERTA_ERRO`) e, quando há, o `erro` logo abaixo.
  - `acoes.ts`: `acaoFalha(anterior: EstadoFalhas, dados: FormData): Promise<EstadoFalhas>` (`'use server'`):
    - `exigirPermissao('administrar')`; `operacao` ∈ {`reenviar`, `dispensar`}; `falha` com `ehUuid`;
    - mensagens ok: `Tarefa "${ROTULO_TAREFA[tarefa]}" reenviada. Ela roda em instantes.` e `'Falha dispensada.'`;
    - `ErroFalhas` vira `{ erros: [mensagem], ok: null }`, e o resto relança;
    - `revalidatePath('/configuracoes/falhas')`.
  - `apoio-acabamento.ts` (e2e):
    - `prepararFalha(p?: { tarefa?: NomeTarefa; dados?: Record<string, unknown> }): Promise<{ falhaId: string; erro: string }>`, em que `erro` = `codigoUnico('Erro de teste ')`;
    - `prepararPrazoVencendo(): Promise<{ codigo: string }>`;
    - `prepararNotaRejeitada(): Promise<{ codigo: string }>`.

Página (celular primeiro): `LINK_VOLTAR` "← Configurações" → `<h1>` "Falhas" → `<p>` "Tarefas de fundo que esgotaram as 5 tentativas." → `CartaoBackup` → `ListaFalhas` → `Paginacao` (20 por página, `?pagina=`).

- [ ] **Passo 1: Escrever os testes de componente que falham**

`src/components/acabamento/ListaFalhas.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FalhaVista } from '@/modules/acabamento/falhas';
import { ListaFalhas } from './ListaFalhas';

const falha: FalhaVista = {
  id: '0b9f1c2e-3d4a-4b5c-8d6e-7f8091a2b3c4', tarefa: 'nfe.emitir', rotuloTarefa: 'Emitir NF-e', erro: 'Focus fora do ar',
  tentativas: 5, ocorrencias: 3, primeiraFalhaEm: '20/11/2026 10:00', ultimaFalhaEm: '20/11/2026 11:00',
  referencia: { texto: 'DEV-000123', href: '/fluxo/devolucoes/DEV-000123' },
};

describe('ListaFalhas (spec §6.8)', () => {
  it('cartão com a tarefa, o motivo, as ocorrências e a referência', () => {
    render(<ListaFalhas falhas={[falha]} acao={vi.fn()} />);
    const cartao = screen.getByRole('article', { name: 'Emitir NF-e' });
    expect(cartao).toHaveTextContent('Focus fora do ar');
    expect(cartao).toHaveTextContent('Falhou 3 vezes');
    expect(screen.getByRole('link', { name: 'DEV-000123' })).toHaveAttribute('href', '/fluxo/devolucoes/DEV-000123');
  });

  it('"Tentar de novo" manda a operação e o id; a mensagem fica quando o cartão some', async () => {
    const acao = vi.fn(async (_e: unknown, dados: FormData) => {
      expect([dados.get('operacao'), dados.get('falha')]).toEqual(['reenviar', falha.id]);
      return { erros: [], ok: 'Tarefa "Emitir NF-e" reenviada. Ela roda em instantes.' };
    });
    const { rerender, container } = render(<ListaFalhas falhas={[falha]} acao={acao} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Tarefa "Emitir NF-e" reenviada. Ela roda em instantes.')).toBeInTheDocument();
    rerender(<ListaFalhas falhas={[]} acao={acao} />);
    expect(screen.getByText('Tarefa "Emitir NF-e" reenviada. Ela roda em instantes.')).toBeInTheDocument();
    expect(container.querySelector('#retorno-falhas')).toHaveAttribute('aria-live', 'polite');
  });

  it('"Dispensar" pede o segundo toque (extra)', async () => {
    const acao = vi.fn(async () => ({ erros: [], ok: 'Falha dispensada.' }));
    render(<ListaFalhas falhas={[falha]} acao={acao} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dispensar' }));
    expect(acao).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Toque de novo para dispensar' }));
    expect(await screen.findByText('Falha dispensada.')).toBeInTheDocument();
    expect((acao.mock.calls[0] as unknown as [unknown, FormData])[1].get('operacao')).toBe('dispensar');
  });

  it('sem falhas', () => {
    render(<ListaFalhas falhas={[]} acao={vi.fn()} />);
    expect(screen.getByText('Nenhuma tarefa em Falhas.')).toBeInTheDocument();
  });
});
```

`src/components/acabamento/CartaoBackup.test.tsx`: quatro casos (sem backup; OK com o tamanho; FALHOU com o erro; "Backup interrompido…" com o tom de erro), recebendo a `VistaBackup` pronta.

Rode: `npm test -- src/components/acabamento`
Esperado: FAIL.

- [ ] **Passo 2: Escrever o e2e (falha até o Passo 4)**

`tests/e2e/falhas.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { sql } from 'drizzle-orm';
import { comBanco, entrarComo, paginaNaoEncontrada, semRolagemLateral } from './apoio';
import { prepararFalha } from './apoio-acabamento';
import { USUARIOS_E2E } from './dados';

test('Gestor tenta de novo uma tarefa em Falhas e o worker a executa', async ({ page }) => {
  const { erro } = await prepararFalha({ tarefa: 'limpeza.temporarios', dados: {} });
  const antes = new Date();
  await entrarComo(page, USUARIOS_E2E.gestor);
  await page.goto('/configuracoes/falhas');
  await expect(page.getByRole('heading', { name: 'Falhas', level: 1 })).toBeVisible();
  const cartao = page.getByRole('article').filter({ hasText: erro });
  await expect(cartao).toContainText('Limpeza de temporários');
  await semRolagemLateral(page);
  await cartao.getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(page.locator('#retorno-falhas')).toContainText('Tarefa "Limpeza de temporários" reenviada.');
  await expect(page.getByRole('article').filter({ hasText: erro })).toHaveCount(0);
  await expect
    .poll(
      () =>
        comBanco(async (db) => {
          const r = await db.execute<{ state: string }>(
            sql`select state from pgboss.job where name = 'limpeza.temporarios' and created_on >= ${antes.toISOString()}::timestamptz order by created_on desc limit 1`,
          );
          return r[0]?.state ?? null;
        }),
      { timeout: 30_000, interval: 1000 },
    )
    .toBe('completed');
});

test('Gestor dispensa uma falha com dois toques', async ({ page }) => {
  const { erro } = await prepararFalha();
  await entrarComo(page, USUARIOS_E2E.gestor);
  await page.goto('/configuracoes/falhas');
  const cartao = page.getByRole('article').filter({ hasText: erro });
  await cartao.getByRole('button', { name: 'Dispensar' }).click();
  await cartao.getByRole('button', { name: 'Toque de novo para dispensar' }).click();
  await expect(page.locator('#retorno-falhas')).toContainText('Falha dispensada.');
  await expect(page.getByRole('article').filter({ hasText: erro })).toHaveCount(0);
});

test('Fiscal e Operador não abrem Falhas', async ({ page }) => {
  await entrarComo(page, USUARIOS_E2E.fiscal);
  await paginaNaoEncontrada(page, '/configuracoes/falhas');
});
```

Se a tela de permissão do sistema não for a 404 para o Fiscal em `/configuracoes/*`, confira o que `tests/e2e/permissoes.spec.ts` espera e use o mesmo.

- [ ] **Passo 3: Implementar os componentes**

Como nas Interfaces. Use `CARTAO` nos cartões e o contador `ITEM_LISTA` só nos links. O erro fica em `text-sm` e `break-words`. Botões: `w-full sm:w-auto` e `min-h-11`, lado a lado só a partir de `sm:`.

Rode: `npm test -- src/components/acabamento`
Esperado: PASS.

- [ ] **Passo 4: Página e ação**

`src/app/(app)/configuracoes/falhas/page.tsx`:

```tsx
export const metadata: Metadata = { title: 'Falhas · Gestão de Devoluções' };
const POR_PAGINA = 20;

export default async function PaginaFalhas({ searchParams }: { searchParams: Promise<ParametrosBusca> }) {
  await exigirPermissao('administrar');
  const pagina = lerPagina(await searchParams);
  const db = obterDb();
  const [{ falhas, total }, backup] = await Promise.all([listarFalhas(db, { pagina, porPagina: POR_PAGINA }), ultimoBackup(db)]);
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
      <Link href="/configuracoes" className={`${LINK_VOLTAR} self-start`}>← Configurações</Link>
      <h1 className="text-xl font-bold">Falhas</h1>
      <p className="text-sm text-texto-2">Tarefas de fundo que esgotaram as 5 tentativas.</p>
      <CartaoBackup backup={vistaDoBackup(backup, new Date())} />
      <ListaFalhas falhas={falhas} acao={acaoFalha} />
      <Paginacao pagina={pagina} total={total} porPagina={POR_PAGINA} hrefDaPagina={(p) => `/configuracoes/falhas?pagina=${p}`} />
    </div>
  );
}
```

A página é um componente de servidor assíncrono: a hora (`new Date()`) é lida ali e passada a `vistaDoBackup` (Tarefa 6), e o `CartaoBackup` continua puro.

Rode: `npm test -- src/components/acabamento && npm run test:e2e -- tests/e2e/falhas.spec.ts tests/e2e/configuracoes.spec.ts`
Esperado: PASS nos projetos `computador` e `celular`. O `configuracoes.spec.ts` da Fase 1 pode esperar o "Em breve" de Falhas: troque **só essa expectativa** pelo título "Falhas".

- [ ] **Passo 5: Commit**

```bash
git add src/components/acabamento "src/app/(app)/configuracoes/falhas" src/modules/acabamento/backup.ts tests/e2e/apoio-acabamento.ts tests/e2e/falhas.spec.ts tests/e2e/configuracoes.spec.ts
git commit -m "feat(falhas): tela Falhas com Tentar de novo, Dispensar (extra) e o último backup (extra)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 12: Alertas no painel (spec §6.0.1) e página `/fluxo/alertas` (extra)

**Arquivos:**
- Criar: `src/components/acabamento/AlertasPainel.tsx`, `src/app/(app)/fluxo/alertas/page.tsx`
- Modificar: `src/app/(app)/fluxo/page.tsx`
- Testes: `src/components/acabamento/AlertasPainel.test.tsx`, `tests/e2e/alertas.spec.ts`

**Interfaces:**
- Consome: Tarefa 6 (`carregarAlertas`, `detalhesDosAlertas`, `AlertaPainel`), Tarefa 5 (`buscarDevolucoes` com `ids`), `CartaoDevolucao`, `apoio-acabamento.ts` (Tarefa 11), `prepararSemFornecedor` (Fase 5, `tests/e2e/apoio-lotes.ts`).
- Produz:
  - `ALERTAS_NO_PAINEL = 3`.
  - `AlertasPainel({ alertas, limite }: { alertas: AlertaPainel[]; limite?: number })`, componente de servidor e puro:
    - nada quando a lista vem vazia;
    - com `limite` e mais alertas do que ele, mostra só os `limite` primeiros (já vêm na ordem de prioridade) e, abaixo da lista, o link **"Ver todos os alertas (N)"** para `/fluxo/alertas` (decisão 13);
    - senão, `<section aria-labelledby="titulo-alertas">`, com o `<h2 id="titulo-alertas">` "Alertas" e um `<ul>`;
    - cada alerta é um `<Link>` `min-h-11 flex items-center justify-between gap-2 rounded-lg px-3`, com as cores do tom (erro: `bg-erro-suave text-erro`; atenção: `bg-atencao-suave text-atencao`);
    - o texto do link é o título, mais a contagem (em `font-mono`, quando há) ou o `detalhe`. O nome acessível começa com o título.
  - Página `/fluxo/alertas` (`ver_listas`):
    - `LINK_VOLTAR` "← Fluxo", `<h1>` "Alertas";
    - logo abaixo, `<AlertasPainel alertas={todos} />` **sem limite**: é ali que aparecem os alertas do sistema (Falhas, backup, disco, conta do ML), que não têm devoluções;
    - para cada `DetalheAlerta`, um `<section id={id} aria-labelledby>` com `<h2>` "{titulo} ({total})", os `CartaoDevolucao` (`buscarDevolucoes(db, {}, { ids, porPagina: 50 })`, em `grid gap-2 md:grid-cols-2`) e os `links` em `ITEM_LISTA`;
    - sem nada: `VAZIO` "Nenhum alerta agora.".
    - `metadata.title`: `Alertas · Gestão de Devoluções`.

No celular, o bloco "Alertas" fica logo abaixo do título "Fluxo de devoluções" e dos botões, **antes** da Busca Avançada e do seletor de etapa (decisão 13).

- [ ] **Passo 1: Escrever o teste de componente que falha**

`src/components/acabamento/AlertasPainel.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AlertasPainel } from './AlertasPainel';

describe('AlertasPainel (spec §6.0.1)', () => {
  it('uma linha por alerta, com a contagem ou o detalhe, levando para o lugar certo', () => {
    render(
      <AlertasPainel
        alertas={[
          { id: 'prazo_ml', titulo: 'Prazo do ML vencendo', quantidade: 3, detalhe: null, tom: 'erro', href: '/fluxo/alertas#prazo_ml' },
          { id: 'disco', titulo: 'Disco do servidor quase cheio', quantidade: null, detalhe: '92% em uso', tom: 'atencao', href: '/configuracoes/conferencia' },
        ]}
      />,
    );
    const regiao = screen.getByRole('region', { name: 'Alertas' });
    expect(screen.getByRole('link', { name: /^Prazo do ML vencendo/ })).toHaveAttribute('href', '/fluxo/alertas#prazo_ml');
    expect(screen.getByRole('link', { name: /^Prazo do ML vencendo/ })).toHaveTextContent('3');
    expect(screen.getByRole('link', { name: /^Disco do servidor quase cheio/ })).toHaveTextContent('92% em uso');
    expect(regiao.querySelectorAll('li')).toHaveLength(2);
    expect(screen.queryByRole('link', { name: /^Ver todos os alertas/ })).not.toBeInTheDocument();
  });

  it('no painel, só os 3 primeiros e "Ver todos os alertas (N)" (celular, decisão 13)', () => {
    const alertas = (['falhas', 'backup', 'disco', 'prazo_ml', 'nf_rejeitada'] as const).map((id) => ({
      id, titulo: `Alerta ${id}`, quantidade: 1, detalhe: null, tom: 'erro' as const, href: `/x#${id}`,
    }));
    render(<AlertasPainel alertas={alertas} limite={3} />);
    expect(screen.getByRole('region', { name: 'Alertas' }).querySelectorAll('li')).toHaveLength(3);
    expect(screen.getByRole('link', { name: 'Ver todos os alertas (5)' })).toHaveAttribute('href', '/fluxo/alertas');
  });

  it('sem alertas, nada', () => {
    const { container } = render(<AlertasPainel alertas={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

Rode: `npm test -- src/components/acabamento/AlertasPainel`
Esperado: FAIL.

- [ ] **Passo 2: Escrever o e2e (falha até o Passo 4)**

`tests/e2e/alertas.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { entrarComo, semRolagemLateral } from './apoio';
import { prepararFalha, prepararNotaRejeitada, prepararPrazoVencendo } from './apoio-acabamento';
import { prepararSemFornecedor } from './apoio-lotes';
import { USUARIOS_E2E } from './dados';

test('Operador vê "Prazo do ML vencendo" no painel e abre a lista do alerta', async ({ page }) => {
  const { codigo } = await prepararPrazoVencendo();
  await entrarComo(page, USUARIOS_E2E.operador);
  const alertas = page.getByRole('region', { name: 'Alertas' });
  await expect(alertas.getByRole('link', { name: /^Prazo do ML vencendo/ })).toBeVisible();
  await expect(alertas.getByRole('link', { name: /^NF rejeitada/ })).toHaveCount(0);
  await semRolagemLateral(page);
  await alertas.getByRole('link', { name: /^Prazo do ML vencendo/ }).click();
  await expect(page).toHaveURL(/\/fluxo\/alertas#prazo_ml$/);
  const secao = page.getByRole('region', { name: /^Prazo do ML vencendo/ });
  await expect(secao.getByRole('link', { name: new RegExp(`^${codigo}`) })).toBeVisible();
  await semRolagemLateral(page);
});

test('Fiscal vê "NF rejeitada" e "Itens sem fornecedor"', async ({ page }) => {
  const { codigo } = await prepararNotaRejeitada();
  await prepararSemFornecedor();
  await entrarComo(page, USUARIOS_E2E.fiscal);
  const alertas = page.getByRole('region', { name: 'Alertas' });
  await expect(alertas.getByRole('link', { name: /^Itens sem fornecedor/ })).toHaveAttribute('href', '/lotes/sem-fornecedor');
  await alertas.getByRole('link', { name: /^NF rejeitada/ }).click();
  await expect(page.getByRole('region', { name: /^NF rejeitada/ }).getByRole('link', { name: new RegExp(`^${codigo}`) })).toBeVisible();
});

test('Gestor: o painel mostra no máximo 3 alertas; "Ver todos" leva a "Tarefas em Falhas"', async ({ page }) => {
  await prepararFalha();
  await prepararPrazoVencendo();
  await prepararNotaRejeitada();
  await prepararSemFornecedor();
  await entrarComo(page, USUARIOS_E2E.gestor);
  const alertas = page.getByRole('region', { name: 'Alertas' });
  await expect(alertas.getByRole('listitem')).toHaveCount(3);
  await alertas.getByRole('link', { name: /^Ver todos os alertas \(\d+\)$/ }).click();
  await expect(page).toHaveURL(/\/fluxo\/alertas$/);
  await semRolagemLateral(page);
  await page.getByRole('region', { name: 'Alertas' }).getByRole('link', { name: /^Tarefas em Falhas/ }).click();
  await expect(page.getByRole('heading', { name: 'Falhas', level: 1 })).toBeVisible();
});
```

No `apoio-acabamento.ts`:
- `prepararPrazoVencendo` cria uma devolução do canal ML (`criarDevolucaoTeste` com o operador do e2e) e grava `prazoConferenciaCanal` = agora + 2 h;
- `prepararNotaRejeitada` cria uma devolução em AGUARDANDO_NF (`criarDevolucaoNoEstoqueTeste`) e a nota REJEITADA (`criarNotaRejeitadaTeste`).

- [ ] **Passo 3: Implementar o componente**

Rode: `npm test -- src/components/acabamento`
Esperado: PASS.

- [ ] **Passo 4: Painel e página**

- `fluxo/page.tsx`: `const alertas = await carregarAlertas(obterDb(), usuario.perfil);` e `<AlertasPainel alertas={alertas} limite={ALERTAS_NO_PAINEL} />` logo depois do bloco do título e dos botões. Nada mais muda na página.
- `fluxo/alertas/page.tsx`: como nas Interfaces.

Rode: `npm test -- src/components && npm run test:e2e -- tests/e2e/alertas.spec.ts tests/e2e/fluxo.spec.ts`
Esperado: PASS nos dois projetos. O `fluxo.spec.ts` continua verde: o bloco não muda o quadro.

- [ ] **Passo 5: Commit**

```bash
git add src/components/acabamento/AlertasPainel* "src/app/(app)/fluxo/page.tsx" "src/app/(app)/fluxo/alertas" tests/e2e/apoio-acabamento.ts tests/e2e/alertas.spec.ts
git commit -m "feat(alertas): bloco Alertas no painel por perfil e a página dos alertas (extra)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 13: E2E de segurança e saúde

**Arquivos:**
- Criar: `tests/e2e/seguranca.spec.ts`
- Modificar: `tests/e2e/saude.spec.ts` (só acrescenta testes)

**Interfaces:**
- Consome: `MENSAGEM_LIMITE_IP` (Tarefa 7), `ARQUIVO_BATIMENTO` e `batimentoRecente` (Tarefa 9), `entrar`, `entrarComo` e `codigoUnico` (`apoio.ts`), `prepararConferencia` e `conferirDevolucao` (Fase 2, `apoio-conferencia.ts`; contrato E11).
- Produz: os testes ponta a ponta das pendências da Fase 6, nos dois projetos.

- [ ] **Passo 1: Escrever os testes**

`tests/e2e/seguranca.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test';
import { MENSAGEM_LIMITE_IP } from '../../src/modules/auth/limite-login';
import { codigoUnico, entrar, entrarComo } from './apoio';
import { conferirDevolucao, prepararConferencia } from './apoio-conferencia';
import { USUARIOS_E2E } from './dados';

/**
 * Junta as violações da CSP (evento securitypolicyviolation do próprio navegador) numa lista do lado do teste.
 * A lista fica no Node, e não na janela: sobrevive às navegações (a conferência termina abrindo outra página).
 */
async function vigiarCsp(page: Page): Promise<string[]> {
  const lista: string[] = [];
  await page.exposeFunction('registrarViolacaoCsp', (texto: string) => lista.push(texto));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      void (window as unknown as { registrarViolacaoCsp: (t: string) => Promise<void> }).registrarViolacaoCsp(
        `${e.violatedDirective} ${e.blockedURI} em ${location.pathname}`,
      );
    });
  });
  return lista;
}

test('cabeçalhos de segurança e sem X-Powered-By (decisão 15)', async ({ request }) => {
  const h = (await request.get('/login')).headers();
  expect(h['x-powered-by']).toBeUndefined();
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['x-frame-options']).toBe('DENY');
  expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(h['permissions-policy']).toContain('camera=(self)');
  expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
});

test('as telas principais abrem sem violar a CSP', async ({ page }) => {
  const violacoes = await vigiarCsp(page);
  await entrarComo(page, USUARIOS_E2E.gestor);
  for (const rota of ['/fluxo', '/fluxo/alertas', '/fluxo/devolucoes/nova', '/lotes', '/cadastros', '/contestacoes', '/configuracoes', '/configuracoes/falhas', '/configuracoes/fiscal']) {
    await page.goto(rota, { waitUntil: 'networkidle' });
  }
  expect(violacoes).toEqual([]);
});

test.describe('com a câmera falsa do navegador', () => {
  test.use({ permissions: ['camera'], launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } });

  test('o leitor do Recebimento e uma conferência inteira (fotos, vídeo, ZXing) não violam a CSP', async ({ page }) => {
    test.setTimeout(240_000);
    const violacoes = await vigiarCsp(page);
    const { codigo } = await prepararConferencia();
    await entrarComo(page, USUARIOS_E2E.operador);
    // O leitor de código pela câmera (o mesmo caminho do camera.spec.ts da Fase 2): carrega o ZXing (wasm).
    await page.goto('/fluxo/recebimento');
    await page.getByRole('button', { name: 'Ler com a câmera' }).click();
    await expect(page.getByLabel('Imagem da câmera')).toBeVisible();
    await page.waitForTimeout(2000); // dá tempo de o leitor carregar o wasm e tentar ler
    await page.getByRole('button', { name: 'Fechar câmera' }).click();
    // A conferência pela tela (Fase 2, E11): Fotos 1 a 4, Vídeo de Prova, envio tus e as miniaturas.
    await conferirDevolucao(page, codigo, ['BOM']);
    expect(violacoes).toEqual([]);
  });
});

test('limite de login por IP: 20 falhas bloqueiam o IP; outro IP entra (decisão 14)', async ({ page }) => {
  test.setTimeout(180_000);
  // O IP vem do X-Forwarded-For (no e2e não há nginx). Um valor único por execução: o servidor é o mesmo nos dois projetos.
  const ip = `ip-e2e-${codigoUnico('A')}`;
  await page.setExtraHTTPHeaders({ 'x-forwarded-for': ip });
  const email = `${codigoUnico('ninguem').toLowerCase()}@teste.local`;
  for (let i = 0; i < 20; i++) {
    await entrar(page, { email, senha: 'senha-errada-000' }); // abre /login de novo a cada vez: o alerta é sempre o da tentativa nova
    await expect(page.getByRole('alert').filter({ hasText: 'E-mail' })).toHaveText('E-mail ou senha incorretos.');
  }
  await entrar(page, USUARIOS_E2E.operador);
  await expect(page.getByRole('alert').filter({ hasText: 'Muitas tentativas' })).toHaveText(MENSAGEM_LIMITE_IP);
  await expect(page).toHaveURL(/\/login/);

  await page.setExtraHTTPHeaders({ 'x-forwarded-for': `${ip}-outro` });
  await entrarComo(page, USUARIOS_E2E.operador);
});
```

Em `tests/e2e/saude.spec.ts`, acrescente:

```ts
test('/api/saude nunca fica em cache (decisão 16)', async ({ request }) => {
  expect((await request.get('/api/saude')).headers()['cache-control']).toBe('no-store');
});

test('o worker do e2e grava o batimento do healthcheck (decisão 17)', async () => {
  // A pasta temporária é a mesma para todas as worktrees deste PC: um arquivo velho de outro worker não vale.
  // Exige uma gravação feita DEPOIS do início do teste (o worker grava a cada 30 s).
  const inicio = Date.now();
  await expect
    .poll(() => (existsSync(ARQUIVO_BATIMENTO) ? statSync(ARQUIVO_BATIMENTO).mtimeMs : 0), { timeout: 60_000, interval: 1000 })
    .toBeGreaterThan(inicio);
  expect(batimentoRecente(ARQUIVO_BATIMENTO, Date.now())).toBe(true);
});
```

(com `import { existsSync, statSync } from 'node:fs';` e `import { ARQUIVO_BATIMENTO, batimentoRecente } from '../../src/worker/batimento';`).

- [ ] **Passo 2: Rodar**

Rode: `npm run test:e2e -- tests/e2e/seguranca.spec.ts tests/e2e/saude.spec.ts tests/e2e/login.spec.ts`
Esperado: PASS nos projetos `computador` e `celular`. Se a CSP acusar uma violação, corrija a **política** da Tarefa 8, liberando só a origem que a tela realmente usa, e não o teste. Anote a origem no commit.

- [ ] **Passo 3: Commit**

```bash
git add tests/e2e/seguranca.spec.ts tests/e2e/saude.spec.ts
git commit -m "test(seguranca): e2e dos cabeçalhos, da CSP nas telas principais, do limite de login por IP e da saúde" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 14: Integração (contrato §7)

Feita na worktree da Fase 6. Como a fase não é paralela, o `main` só muda se alguém juntou outra coisa (ex.: uma emenda).

**Arquivos:**
- Regenerados: `drizzle/` (uma migração só, `fase6_acabamento`)
- Nenhum arquivo congelado muda nesta tarefa. `package.json` e `package-lock.json` ficam iguais aos do `main` (a fase não instala nada).

**Interfaces:**
- Produz: a branch `fase-6-acabamento` pronta para `git merge --no-ff` no `main`, com a suíte inteira passando.

- [ ] **Passo 1: Trazer o `main` e conferir os arquivos congelados**

```bash
cd "/c/Users/JEFFERSON LIMA/devolucoes-wt/fase-6"
git merge main
git diff main --stat -- package.json package-lock.json src/lib/env.ts .env.example .env.producao.example src/db/schema/index.ts \
  src/modules/fila/tarefas.ts src/modules/auth/permissoes.ts src/components/NavAbas.tsx "src/app/(app)/configuracoes/page.tsx" \
  src/modules/historico/rotulos docs/superpowers/plans/2026-11-12-contrato-fases-2-6.md \
  src/modules/conferencia src/modules/midia src/modules/mercado-livre src/modules/fiscal src/modules/lotes src/conectores \
  Dockerfile docker/nginx tests/e2e/global-setup.ts tests/e2e/apoio.ts tests/e2e/dados.ts tests/helpers/fabricas.ts README.md
```

Esperado: **nenhuma linha**. As chaves, o schema vazio, as variáveis e a E19 vieram do `main` (Tarefa 0). Qualquer linha é um erro: volte o arquivo ao do `main`.

- [ ] **Passo 2: Migração única da fase**

```bash
git rm -rq drizzle && git checkout main -- drizzle
npm run db:gerar -- --name fase6_acabamento
```

Esperado: um arquivo novo `drizzle/<n>_fase6_acabamento.sql` só com os enums `situacao_falha` e `situacao_backup`, as tabelas `falhas_tarefas` e `execucoes_backup`, os dois índices de `falhas_tarefas` e o índice `eventos_historico_acao_em_idx`. Esta fase não tem SQL escrito à mão (`src/db/sql-manual/fase6.sql` não existe).

- [ ] **Passo 3: Recriar os bancos da fase e migrar**

```bash
PG="/c/Program Files/PostgreSQL/18/bin"; export PGPASSWORD="$(cat "/c/Users/JEFFERSON LIMA/.postgres-superusuario.txt")"
"$PG/pg_isready.exe" -h localhost -p 5433 || "$PG/pg_ctl.exe" -D "/c/Users/JEFFERSON LIMA/pg-devolucoes/data" -l "/c/Users/JEFFERSON LIMA/pg-devolucoes/postgres.log" start
"$PG/dropdb.exe" -h localhost -p 5433 -U postgres --if-exists devolucoes_test_f6 && "$PG/createdb.exe" -h localhost -p 5433 -U postgres -O devolucoes devolucoes_test_f6
"$PG/dropdb.exe" -h localhost -p 5433 -U postgres --if-exists devolucoes_f6 && "$PG/createdb.exe" -h localhost -p 5433 -U postgres -O devolucoes devolucoes_f6
unset PGPASSWORD
npm run db:migrar
```

Esperado: todas as migrações aplicadas sem erro.

- [ ] **Passo 4: Rodar tudo**

```bash
npm run typecheck && npm run lint && npm test && npm run test:int && npm run build:scripts && npm run test:e2e
```

Esperado: tudo PASS, nos projetos `computador` e `celular`, inclusive os specs das Fases 0 a 5 com a CSP ligada. O teste do script de backup (Tarefa 10) roda e **não** pula.

- [ ] **Passo 5: Commit**

```bash
git add -A
git commit -m "chore: integração da Fase 6 com o main (migração fase6_acabamento)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Depois disso, quem integra faz no `main` (contrato §7):
- `git merge --no-ff fase-6-acabamento`;
- recria o `devolucoes_test` e roda a suíte inteira;
- `npm run db:migrar` no banco `devolucoes`;
- apaga a worktree e os bancos `_f6`;
- atualiza o README e o `andamento.md`, tirando as pendências da Fase 6 e a de "uploads de planilha abandonados".

Push e deploy ficam com o usuário.

---

## Depois da fase (controlador e usuário)

### 1. Publicar na VPS (texto pronto para o usuário colar na sessão da Claude web que opera a VPS)

> Atualize o sistema de devoluções na VPS compartilhada. Regras: não mexa em outros sites ou containers; não rode `docker image prune`; no nginx, nada nesta atualização.
>
> 1. `cd /opt/devolucoes && git pull --ff-only`
> 2. Confira se o `.env.producao` já tem `SEGREDO_LINKS` com 64 caracteres hexadecimais (contrato E17). Se não tiver, gere com `openssl rand -hex 32` e acrescente `SEGREDO_LINKS=<valor>`. **Sem ele o sistema dá erro 500.**
> 3. Acrescente ao `.env.producao` o bloco do backup, copiado do fim do `.env.producao.example`, com os valores que **eu** vou colar direto no arquivo (não me peça para mandá-los no chat):
>    - endpoint, região, bucket e chave do bucket de backup no B2. Esse bucket é **novo e só de backup**, diferente do bucket das mídias, com uma chave que só enxerga ele e não pode apagar arquivos;
>    - `BACKUP_SENHA`: eu a gero no meu gerenciador de senhas e colo só no `.env.producao`. **Não mostre, não copie e não registre essa senha em lugar nenhum.**
>    - Depois, `chmod 600 .env.producao`.
> 4. `docker compose --env-file .env.producao -f docker-compose.prod.yml pull && docker compose --env-file .env.producao -f docker-compose.prod.yml up -d`
> 5. Espere 1 minuto e rode `docker compose --env-file .env.producao -f docker-compose.prod.yml ps`. O `web` e o `worker` devem aparecer `healthy`, e o `backup`, `running`.
> 6. Rode um backup agora: `docker compose --env-file .env.producao -f docker-compose.prod.yml exec backup sh /backup/backup.sh`. Deve terminar com `backup concluído`.
> 7. Teste a restauração (critério de pronto da spec §14):
>    - liste os backups com `docker compose ... exec backup sh -c '. /backup/comum.sh && rclone lsf "$REMOTO/banco"'`;
>    - restaure o mais recente com `docker compose ... exec backup sh /backup/restaurar.sh banco/<arquivo>`;
>    - me mostre as contagens;
>    - apague o banco de teste com `docker compose ... exec backup dropdb --maintenance-db=postgres devolucoes_restauracao`.
> 8. `curl -s http://127.0.0.1:3020/api/saude` e `curl -sI https://<domínio>/login | grep -i -E "content-security|x-frame|x-powered"`. O esperado: status ok, a CSP e o X-Frame-Options presentes, e **sem** X-Powered-By.
> 9. Para liberar espaço, apague só as imagens sem nome deste projeto (o `scripts/deploy.sh` já faz).

Antes do passo 3, o próprio usuário faz no painel do B2 (decisão 19 e `docs/operacao/backup-restauracao.md`):
- cria o bucket **só de backup** e liga nele a regra de ciclo de vida que apaga os arquivos com mais de 30 dias (o `rclone delete` do B2 só esconde);
- cria uma application key restrita a esse bucket, **sem** a permissão de apagar (proteção contra ransomware);
- com as mídias no B2 (`ARMAZENAMENTO=s3`), liga no bucket das **mídias** a regra **"Keep prior versions for 30 days"**.

### 2. Passagem para produção da NF-e (spec §8.1 e §14: "NF em produção aprovada pelo contador")
1. Emitir em homologação uma NF de devolução e uma NF de remessa de teste (etapa "Ligação das contas reais") e mandar os DANFEs ao contador, com as regras fiscais da tela (CFOP, CST/CSOSN, natureza e informações complementares). Os pontos que o contador valida estão no fim dos planos das Fases 4 e 5.
2. Com a aprovação por escrito do contador: na Focus NFe, cadastrar a série exclusiva em produção e copiar o token de produção para `FOCUS_TOKEN_PRODUCAO` no `.env.producao`. Depois, `docker compose ... up -d`.
3. Em Configurações › Fiscal, o Gestor marca "O contador validou as regras fiscais e as notas emitidas em homologação" e muda o ambiente para **Produção** (Fase 4, decisão 12).
4. Emitir a primeira NF real de uma devolução simples, conferir o DANFE com o contador e só então liberar o uso diário.

### 3. Conferências manuais que ficaram das fases anteriores
- Testar a câmera real (leitura do código e Vídeo de Prova) num Android e num iPhone da bancada (pendência da Fase 2). Com a CSP ligada, confira também o leitor ZXing no iPhone.
- Confirmar no ML real o formato do número do pedido (pendência da Fase 3).
- **Conectar a conta do ML com a CSP ligada** (Configurações › Mercado Livre → "Conectar"): o `form-action` e os redirecionamentos do OAuth (`auth.mercadolivre.com.br` e a volta para `/api/ml/retorno`) só dão para conferir com a conta real. Se o navegador acusar a CSP, libere só a origem que apareceu no erro (Tarefa 8).
- Abrir um DANFE em PDF pelo detalhe da devolução e conferir que o visualizador do navegador o mostra (as rotas `/api/` estão fora da CSP).

### 4. Pergunta em aberto para o usuário (andamento.md)
- **A empresa tem Inscrição Estadual ou é isenta?** Hoje a configuração fiscal só aceita o número. Se for isenta, falta uma mudança pequena na Fase 4: aceitar "ISENTO" no campo IE da empresa e mandar `inscricao_estadual` vazia com o indicador certo na Focus. O contador confirma o indicador.
