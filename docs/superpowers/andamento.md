# Andamento e como continuar (para qualquer sessão, em qualquer computador)

Atualizado em 13/11/2026. Mantenha este arquivo em dia ao fechar cada etapa e envie-o ao GitHub.

## Onde paramos
- **Fases 0 e 1:** prontas, no `main` e publicadas na VPS (https://devolucoes.179-199-128-100.sslip.io).
- **Planos e contrato:** prontos e conciliados.
  - Contrato (obrigatório para as Fases 2 a 6): [plans/2026-11-12-contrato-fases-2-6.md](plans/2026-11-12-contrato-fases-2-6.md). A §10 tem as emendas E1–E17.
  - Fase 2: [plans/2026-11-12-fase-2-conferencia.md](plans/2026-11-12-fase-2-conferencia.md), 23 tarefas: 1–8 são a Parte A (base comum), 9–22 a conferência, 23 a Integração.
  - Fase 3: [plans/2026-11-12-fase-3-mercado-livre.md](plans/2026-11-12-fase-3-mercado-livre.md), 17 tarefas; a 17 é a Integração.
  - Fase 4: [plans/2026-11-12-fase-4-fiscal.md](plans/2026-11-12-fase-4-fiscal.md), 11 tarefas; a 11 é a Integração.
- **P1 e Parte A (base comum) da Fase 2:** prontas, revisadas e no `main` (`f38e320`, enviado ao GitHub).
  - Inclui: variáveis de ambiente, migração 0006, vocabulário e rótulos, fila pg-boss com o worker, armazenamento com links assinados, tipos dos conectores e esqueletos das telas.
  - Testes: 293 de unidade, 144 de integração, 69 no navegador.
- **Times das Fases 2, 3 e 4:** começaram em 13/11 e **pararam no limite de uso da conta** antes de terminar a primeira tarefa. Nada foi perdido:
  - As worktrees existem e estão limpas: `C:/Users/idmpc/devolucoes-wt/fase-2`, `fase-3` e `fase-4`, nas branches `fase-2-conferencia`, `fase-3-mercado-livre` e `fase-4-fiscal`, todas a partir do `main` `f38e320`. Cada uma tem `.env` próprio (banco, banco de testes e porta), conforme o contrato §6.
  - O trabalho parcial da primeira tarefa das Fases 3 e 4 ficou guardado com `git stash` na própria worktree. A próxima execução recomeça a tarefa do zero.
  - Os bancos da Fase 4 (`devolucoes_f4` e `devolucoes_test_f4`) foram recriados até a 0006.
- **Para retomar os times:** use o fluxo [workflows/fase-sdd.js](workflows/fase-sdd.js). Para cada tarefa, ele faz: implementar, revisar, até 2 rodadas de correção, enviar ao GitHub. Rode um fluxo por fase, os três em paralelo, com os argumentos:
  - Fase 2: `{"fase":2,"pasta":"/c/Users/idmpc/devolucoes-wt/fase-2","branch":"fase-2-conferencia","pref":"f2","tarefas":[9,…,22],"porta":3102,"bancoTeste":"devolucoes_test_f2"}`
  - Fase 3: `{"fase":3,"pasta":".../fase-3","branch":"fase-3-mercado-livre","pref":"f3","tarefas":[1,…,16],"porta":3103,"bancoTeste":"devolucoes_test_f3"}`
  - Fase 4: `{"fase":4,"pasta":".../fase-4","branch":"fase-4-fiscal","pref":"f4","tarefas":[1,…,10],"porta":3104,"bancoTeste":"devolucoes_test_f4"}`
  - O fluxo lê os resumos de cada tarefa e as regras comuns em `.superpowers/sdd/fases-2-6/`, que não vão para o git. Em outro computador, recrie esses resumos a partir dos planos: cada resumo é o trecho de uma tarefa `### Tarefa N:`, salvo em `fN-task-N-brief.md`. Recrie também o `contexto-comum.md`: pasta, banco e porta de cada time, regras de celular, TDD, relatório.
  - Se uma tarefa já tiver sido concluída, ela aparece no registro `progress-fN.md` e na branch. Retome a partir da seguinte.
  - As tarefas de Integração (Fase 2 T23, Fase 3 T17, Fase 4 T11) ficam fora dos fluxos. Elas rodam na ordem de junção 2 → 3 → 4 (contrato §7).
- **Atenção ao publicar na VPS:** antes de atualizar a imagem, acrescente `SEGREDO_LINKS` ao `.env.producao` (contrato E17). Sem isso, o sistema dá erro 500.
- **Próximos passos, em ordem:**
  1. Retomar os três times (Fases 2, 3 e 4 em paralelo).
  2. Juntar na ordem 2 → 3 → 4, com a Integração de cada uma (contrato §7).
  3. Fase 5.
  4. Etapa **"Ligação das contas reais"**: ML, Focus NFe em homologação, B2 e domínio.
  5. Fase 6.
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
  - limpar os uploads de planilha abandonados (LGPD);
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
- **Fase 6:**
  - limite de login por IP;
  - cabeçalhos de segurança e `poweredByHeader: false`;
  - `/api/saude` responder 503;
  - healthcheck do container.
- **Riscos aceitos (não "corrigir" sem motivo):**
  - pedido duplicado e rastreio de pacote não identificado são conferidos com leitura antes da gravação, sem trava;
  - a checagem do ZIP da planilha confia nos tamanhos declarados.
