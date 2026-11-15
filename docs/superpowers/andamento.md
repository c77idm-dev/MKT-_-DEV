# Andamento e como continuar (para qualquer sessão, em qualquer computador)

Atualizado em 15/11/2026 (Fases 0 a 6 prontas e no `main`; próximo passo: publicar tudo na VPS). Mantenha este arquivo em dia ao fechar cada etapa e envie-o ao GitHub.

## Onde paramos
- **Fases 0 e 1:** prontas, no `main` e publicadas na VPS (https://devolucoes.179-199-128-100.sslip.io).
- **Fases 2, 3 e 4:** prontas, com revisão final aprovada e **juntadas no `main`** em 14/11, na ordem 2 → 3 → 4 (`6abdf46`).
  - Suíte do `main` depois da junção: 566 de unidade, 314 de integração, 145 e2e (7 pulados de propósito), nos projetos `computador` e `celular`.
  - Migrações: `0006_fundacao`, `0007_fase3_mercado_livre`, `0008_fase4_fiscal`.
  - Testes entre fases criados: `tests/e2e/integracao-ml.spec.ts` (Fase 3) e `tests/e2e/integracao-fiscal.spec.ts` (Fase 4).
  - **Ainda não publicadas na VPS.** A publicação fica para depois da "Ligação das contas reais" (com `ML_CONECTOR=api` e `EMISSOR_NFE=focus` o sistema sobe, mas sem as contas essas partes não funcionam).
- **Fase 5 (Remessas):** pronta, com revisão final aprovada e **juntada no `main`** em 14/11 (merge `6f19451`).
  - Suíte do `main` depois da junção: 610 de unidade, 369 de integração, 163 e2e (7 pulados de propósito), nos projetos `computador` e `celular`. O `conferencia.spec.ts:96` falhou e passou ao repetir.
  - Migração: `0009_fase5_remessas` (sem SQL escrito à mão). Dependência nova: `pdf-lib@1.17.1`.
  - Teste entre fases criado: `tests/e2e/integracao-remessas.spec.ts`.
  - A NF de remessa real em homologação fica para a "Ligação das contas reais". Ainda não publicada na VPS.
- **Fase 6 (Acabamento):** pronta, com revisão final aprovada e **juntada no `main`** em 15/11 (merge `cf19052`). É a última fase: **as Fases 0 a 6 estão todas no `main`.**
  - Entregou: alertas no topo do Fluxo e a página `/fluxo/alertas` (extra), tela Falhas com "Tentar de novo" e "Dispensar" (extra), `midia.retencao` (prazo de guarda) e a limpeza LGPD das planilhas, limite de login por IP, cabeçalhos de segurança com CSP e sem `X-Powered-By`, `/api/saude` com 503, logs JSON do `web`, healthcheck do `web` e do `worker`, serviço `backup` (cifrado, bucket só de backup, 30 dias) com a restauração documentada.
  - Suíte do `main` depois da junção: 685 de unidade, 415 de integração, 187 e2e (7 pulados de propósito), nos projetos `computador` e `celular`. Na 1ª execução o PC dormiu no meio e dois testes de `cadastros.spec.ts` falharam em cascata (o 2º depende do mapeamento salvo pelo 1º); a 2ª execução passou inteira.
  - Migração: `0010_fase6_acabamento` (sem SQL escrito à mão). Nenhuma dependência npm nova.
  - Correção extra na integração (emenda **E20**): as variáveis `BACKUP_S3_*` e `BACKUP_SENHA` saíram do `.env.producao` e foram para o `.env.backup` (modelo `.env.backup.example`), lido só pelo serviço `backup`. Assim o `web` e o `worker` não enxergam a chave do bucket de backup nem a senha da cifra. O `scripts/infra.test.ts` garante isso.
  - Ainda não publicada na VPS. O critério de pronto da spec §14 ("restauração de backup testada; NF em produção aprovada pelo contador") acontece na VPS e com o contador.
- **Planos e contrato:**
  - Contrato (obrigatório para as Fases 2 a 6): [plans/2026-11-12-contrato-fases-2-6.md](plans/2026-11-12-contrato-fases-2-6.md). A §10 tem as emendas E1–E20.
  - Fases 2 a 6: planos de 12/11 e 14/11 (todos executados). O plano da Fase 6 termina com a seção **"Depois da fase"**: o texto pronto para publicar na VPS, a passagem da NF-e para produção, as conferências manuais que sobraram e a pergunta da Inscrição Estadual.
- **Pendências deixadas pela junção (14/11):**
  - Teste instável da Fase 2 `tests/e2e/conferencia.spec.ts:96` ("desistir"): corrigido no `main` em 15/11 (`986e889`, o teste espera o "Continuar" trocar de passo). Se voltar a falhar sozinho, repita antes de suspeitar de outra coisa.
  - O npm 11.6.1 deste PC tira os campos `libc` e as entradas `@emnapi` do `package-lock.json` ao rodar `npm install`. Revise o diff do lockfile antes de commitar.
  - UX (extra possível): se o Gestor envia a contestação enquanto as fotos ainda estão sendo processadas, ela fica em "Enviando ao ML" até a próxima tentativa (30 s ou mais). É o desenho do contrato §5.4.
  - A pasta vazia `C:\Users\JEFFERSON LIMA\devolucoes-wt\fase-4` ficou presa por outro processo. Apague-a à mão depois de fechar o VS Code.
  - A conferência à mão no DevTools (tamanho do `.mp4`, modo avião) e o teste da câmera em Android e iPhone ficam com o usuário.
- **Decisões tomadas no caminho:**
  - Citar o ERP **Bitbrain** nas telas está certo (spec §8 e §8.7): a NF de venda é baixada dele, o ZIP de XMLs é importado nele, e a série não pode colidir com a dele. A regra é só não usar domínio nem marca bitbrain no sistema.
  - O usuário aceitou as decisões dos planos das Fases 5 e 6 como estão (14/11).
- **Pergunta em aberto para o usuário (fica para o fim do sistema, a pedido dele em 14/11):** a empresa tem Inscrição Estadual ou é isenta? Hoje a configuração fiscal só aceita o número. Se for isenta, é preciso aceitar "ISENTO".
- **Segundo PC (usuário Windows "JEFFERSON LIMA"), preparado em 14/11:**
  - Worktrees em `/c/Users/JEFFERSON LIMA/devolucoes-wt/`, cada uma com `.env` próprio.
  - PostgreSQL 18 numa instância só do projeto, na **porta 5433**, com os dados em `C:\Users\JEFFERSON LIMA\pg-devolucoes\data`. A senha do `postgres` fica em `C:\Users\JEFFERSON LIMA\.postgres-superusuario.txt`. O PostgreSQL 18 da porta 5432 é de outra coisa: não mexa.
  - A instância não é serviço: depois de reiniciar o PC, suba com `"/c/Program Files/PostgreSQL/18/bin/pg_ctl.exe" -D "/c/Users/JEFFERSON LIMA/pg-devolucoes/data" -l "/c/Users/JEFFERSON LIMA/pg-devolucoes/postgres.log" start`.
  - Nos fluxos, passe também `"raiz":"/c/Users/JEFFERSON LIMA/MKT-_-DEV"` e a `pasta` deste PC.
- **Para rodar um time:** use o fluxo [workflows/fase-sdd.js](workflows/fase-sdd.js). Para cada tarefa, ele faz: implementar, revisar, até 2 rodadas de correção, enviar ao GitHub. Argumentos (exemplo da Fase 5 neste PC): `{"fase":5,"raiz":"/c/Users/JEFFERSON LIMA/MKT-_-DEV","pasta":"/c/Users/JEFFERSON LIMA/devolucoes-wt/fase-5","branch":"fase-5-remessas","pref":"f5","tarefas":[1,…,14],"porta":3105,"bancoTeste":"devolucoes_test_f5"}`.
  - O fluxo lê os resumos de cada tarefa e as regras comuns em `.superpowers/sdd/fases-2-6/`, que não vão para o git. Em outro computador, recrie esses resumos a partir dos planos: cada resumo é o trecho de uma tarefa `### Tarefa N:`, salvo em `fN-task-N-brief.md`. Recrie também o `contexto-comum.md`: pasta, banco e porta de cada time, regras de celular, TDD, relatório.
  - Se uma tarefa já tiver sido concluída, ela aparece no registro `progress-fN.md` e na branch. Retome a partir da seguinte.
  - A tarefa de Integração fica fora do fluxo dos times.
  - Quando o time termina as tarefas, rode o fluxo [workflows/fase-final.js](workflows/fase-final.js) na fase. Ele faz a revisão final (servidor e telas), as correções, a re-revisão e o push. Argumentos: os mesmos do outro fluxo, mais `"base":"<commit do main de onde a fase partiu>"`, `"plano":"docs/superpowers/plans/<plano da fase>.md"` e, se precisar, `"decisoes"`.
- **Atenção ao publicar na VPS:** antes de atualizar a imagem, acrescente `SEGREDO_LINKS` ao `.env.producao` (contrato E17). Sem isso, o sistema dá erro 500. As variáveis do backup vão num arquivo **separado**, o `.env.backup` (contrato E20), nunca no `.env.producao`.
- **Próximos passos, em ordem:**
  1. **Publicação na VPS de tudo de uma vez** (Fases 2 a 6; decisão do usuário em 14/11). Passe ao usuário o texto pronto para colar, que está no plano da Fase 6, seção "Depois da fase", item 1. Passos novos desde a Fase 1: `SEGREDO_LINKS` (E17), serviço `worker`, volume `/data`, `location /api/midia/` no nginx (só `nginx -t && systemctl reload nginx`), o `.env.backup` com as variáveis `BACKUP_*` (E20) e o serviço `backup`, mais um backup e uma restauração de teste (critério de pronto da spec §14). Antes, o usuário cria no B2 o bucket só de backup e a chave restrita a ele.
  2. Etapa **"Ligação das contas reais"**: ML, Focus NFe em homologação (certificado A1), B2 e domínio. O usuário deve separar o certificado A1, a conta da Focus e o app do ML. Depois, a passagem da NF-e para produção com a aprovação do contador (plano da Fase 6, "Depois da fase", item 2) e as conferências manuais que sobraram (item 3).
  3. A pergunta da Inscrição Estadual.
- O andamento resumido para o usuário fica no [README](../../README.md#andamento).

## Como trabalhamos
- **Usuário:**
  - Fala português do Brasil. Prefere respostas curtas e pede agilidade.
  - Gosta de usar agentes ("ative agentes para te ajudar"; "pode fazer com os times"; "pode meter marcha").
  - Pediu para construir tudo agora e ligar as contas reais no fim ("constroi ele inteiro e deixa para conectarmos no final").
- **Seguir o PDF e a spec à risca:**
  - Use os nomes exatos das etapas, das evidências e dos filtros.
  - Marque como "(extra)" tudo o que for além do PDF.
  - A spec manda: [specs/2026-11-11-gestao-devolucoes-design.md](specs/2026-11-11-gestao-devolucoes-design.md).
- **Celular primeiro, em todas as telas** ("esse sistema é focado para celular, então ele tem que ficar perfeito para o usuário final"):
  - Desenhe primeiro para 390×844, sem rolagem lateral.
  - Use cartões em vez de tabelas e a barra de abas embaixo.
  - Formulários em uma coluna, com o rodapé preso.
  - Alvos de toque de 44 px ou mais; contraste de 4,5:1 ou mais.
  - Escreva e2e nos projetos `computador` e `celular`.
- **Processo (desenvolvimento guiado por subagentes):**
  - Para cada tarefa do plano: um implementador; depois uma revisão da tarefa; depois rodadas de correção até a revisão ficar limpa.
  - No fim da fase: uma revisão final dividida em servidor e telas; depois uma onda de correções; depois o merge no `main` e o push.
  - Use TDD.
  - Cada commit termina com a linha `Co-Authored-By`.
- **O sistema não tem nada a ver com o bitbrain.** Nunca use domínio ou marca bitbrain.
- **A VPS é compartilhada:**
  - Não mexa em outros sites ou containers.
  - No nginx, use só `nginx -t && systemctl reload nginx`, nunca restart.
  - Nunca rode `docker image prune` global.
  - O usuário opera a VPS por uma sessão da Claude web. Passe a ele textos prontos para colar.
- **Segredos nunca vão para o git.** O ML Client Secret e as senhas ficam só no `.env` local ou da VPS.
- **Push frequente:** o usuário precisa poder continuar de outro computador.
  - Ao fechar cada passo (plano pronto, tarefa revisada), envie ao GitHub a branch em que está trabalhando: `fase-N-...`, `planos-fases-2-6`.
  - O `main` só recebe o que já foi juntado e revisado. Cada push no `main` faz o GitHub Actions gerar a imagem; a imagem não é publicada sozinha.
  - Atualize este arquivo antes de cada push.

## Ambiente de desenvolvimento
- O Windows não tem Docker (VT-x desligado na BIOS). Não insista nisso.
- Use o PostgreSQL 17 instalado direto no Windows. Usuário/senha `devolucoes`/`devolucoes`. Bancos: `devolucoes`, `devolucoes_test`, `devolucoes_f2/f3/f4` e `devolucoes_test_f2/f3/f4`.
- Em outro computador:
  1. Instale o Node 24 e o PostgreSQL 17.
  2. Crie os bancos acima.
  3. Rode `cp .env.example .env`, `npm install` e `npm run db:migrar`.
  4. Rode `npx playwright install chromium`.
- Os registros de progresso dos agentes (`.superpowers/`) **não** vão para o git. O que importa deles está resumido aqui.

## Pendências conhecidas, a resolver nas próximas fases
- **Fase 2:**
  - Fotos 1 e 2 do pacote não identificado;
  - testar a câmera real no Android e no iPhone;
  - `focus-visible`.
- **Fase 3:**
  - zod na resposta do token do ML;
  - não registrar o corpo cru dos erros;
  - tokens criptografados;
  - `state` no OAuth;
  - limite de requisições nas rotas públicas;
  - confirmar no ML real o formato do número do pedido (16 ou mais dígitos).
- **Fase 6:** nada pendente no código. O limite de login por IP, os cabeçalhos de segurança com `poweredByHeader: false`, o `/api/saude` com 503, o healthcheck dos containers e a limpeza dos uploads de planilha (LGPD) entraram na Fase 6. Falta só o que acontece na VPS e com o contador (ver "Próximos passos").
- **Riscos aceitos (não "corrigir" sem motivo):**
  - pedido duplicado e rastreio de pacote não identificado são conferidos com leitura antes da gravação, sem trava;
  - a checagem do ZIP da planilha confia nos tamanhos declarados.
