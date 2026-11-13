# Andamento e como continuar (para qualquer sessão, em qualquer computador)

Atualizado em 13/11/2026, 18h22 (os três times trabalhando de novo depois da parada no limite de uso das 17h50). Mantenha este arquivo em dia ao fechar cada etapa e envie-o ao GitHub.

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
- **Times das Fases 2, 3 e 4:** trabalham em paralelo desde 13/11, cada um na sua worktree: `C:/Users/idmpc/devolucoes-wt/fase-2`, `fase-3` e `fase-4`, nas branches `fase-2-conferencia`, `fase-3-mercado-livre` e `fase-4-fiscal`, todas a partir do `main` `f38e320`. Cada uma tem `.env` próprio (banco, banco de testes e porta), conforme o contrato §6. O que cada tarefa já fechou fica na branch, no GitHub.
  - **Estado em 13/11, 18h22:** os três times pararam no limite de uso por volta das 17h50, voltaram com a troca de conta e estão trabalhando.

    | Fase | Prontas e revisadas | Em andamento | No GitHub |
    |---|---|---|---|
    | 2, conferência | Tarefas 9 a 18 (`55de648`). A T18 (assistente da conferência no celular) foi revisada e aprovada sem mudanças. | **T19**: a conferência a partir do detalhe e da etapa | `55de648` |
    | 3, Mercado Livre | Tarefas 1 a 14 (`e3c2778`). A T14 é a seção Mercado Livre no detalhe da devolução. | **T15**: Configurações › Mercado Livre (conectar a conta) | `e3c2778` |
    | 4, fiscal | Tarefas 1 a 10 (`27dc4cd`) | **Correções da revisão final**: 3 das 5 já têm commit, e falta enviar. | `27dc4cd` |

  - **As 5 correções da revisão final da Fase 4:**
    - Já feitas (falta enviar ao GitHub):
      - O XML do cancelamento ainda indisponível na Focus volta para a fila e, se não chegar, vai para Falhas. Antes ele sumia, e o ZIP do período saía sem esse cancelamento.
      - Um teste novo prova que a chave das consultas muda a cada reenvio (E4).
      - O botão "Remover" da NF de venda passa a pedir confirmação. Um toque errado no celular apagava a NF e as escolhas de item.
    - Ainda faltam:
      - O Fiscal poder trocar o item da NF de venda quando o casamento automático (pelo SKU ou pelo EAN) errou.
      - No celular, mostrar "NF de venda" e "Itens" antes do botão "Emitir NF de devolução".
    - Depois das correções, a re-revisão confere tudo, e só então a branch vai para o GitHub.
    - As revisões completas estão em `.superpowers/sdd/fases-2-6/f4-final-servidor.md` e `f4-final-telas.md`, só neste PC. Elas também listam o que fica de propósito e por quê.
  - **Runs atuais (para `resumeFromRunId` se pararem de novo):**
    - Fase 2: `wf_3b9280f3-f70`, com o script do fluxo dos times.
    - Fase 3: `wf_c5c15a75-faa`, com o script do fluxo dos times.
    - Fase 4: `wf_1a3f0cc6-104`, com o script da revisão final ([workflows/fase-final.js](workflows/fase-final.js)).
    - Os argumentos são os mesmos de antes (veja abaixo).
    - Em outro computador ou em outra sessão não há cache. Rode o fluxo só com as tarefas que faltam: a Fase 2 a partir da T19 (`[19,…,22]`) e a Fase 3 a partir da T15 (`[15,16]`). Antes, confira na branch o que já entrou. Para a Fase 4, rode de novo a revisão final, a partir do que estiver na branch.
  - Os `git stash` "parcial da T1" (Fases 3 e 4) e "parcial da T14" (Fase 3) são antigos e podem ser descartados: essas tarefas já foram refeitas.
- **Decisões tomadas no caminho:**
  - Citar o ERP **Bitbrain** nas telas está certo (spec §8 e §8.7): a NF de venda é baixada dele, o ZIP de XMLs é importado nele, e a série não pode colidir com a dele. A regra é só não usar domínio nem marca bitbrain no sistema.
- **Pergunta em aberto para o usuário:** a empresa tem Inscrição Estadual ou é isenta? Hoje a configuração fiscal só aceita o número. Se for isenta, é preciso aceitar "ISENTO".
- **Para retomar os times:** use o fluxo [workflows/fase-sdd.js](workflows/fase-sdd.js). Para cada tarefa, ele faz: implementar, revisar, até 2 rodadas de correção, enviar ao GitHub. Rode um fluxo por fase, os três em paralelo, com os argumentos:
  - Fase 2: `{"fase":2,"pasta":"/c/Users/idmpc/devolucoes-wt/fase-2","branch":"fase-2-conferencia","pref":"f2","tarefas":[9,…,22],"porta":3102,"bancoTeste":"devolucoes_test_f2"}`
  - Fase 3: `{"fase":3,"pasta":".../fase-3","branch":"fase-3-mercado-livre","pref":"f3","tarefas":[1,…,16],"porta":3103,"bancoTeste":"devolucoes_test_f3"}`
  - Fase 4: `{"fase":4,"pasta":".../fase-4","branch":"fase-4-fiscal","pref":"f4","tarefas":[1,…,10],"porta":3104,"bancoTeste":"devolucoes_test_f4"}`
  - O fluxo lê os resumos de cada tarefa e as regras comuns em `.superpowers/sdd/fases-2-6/`, que não vão para o git. Em outro computador, recrie esses resumos a partir dos planos: cada resumo é o trecho de uma tarefa `### Tarefa N:`, salvo em `fN-task-N-brief.md`. Recrie também o `contexto-comum.md`: pasta, banco e porta de cada time, regras de celular, TDD, relatório.
  - Se uma tarefa já tiver sido concluída, ela aparece no registro `progress-fN.md` e na branch. Retome a partir da seguinte.
  - As tarefas de Integração (Fase 2 T23, Fase 3 T17, Fase 4 T11) ficam fora dos fluxos. Elas rodam na ordem de junção 2 → 3 → 4 (contrato §7).
  - Quando um time termina as tarefas, rode o fluxo [workflows/fase-final.js](workflows/fase-final.js) na fase. Ele faz a revisão final (servidor e telas), as correções, a re-revisão e o push. Argumentos: os mesmos do outro fluxo, mais `"base":"f38e320"`, `"plano":"docs/superpowers/plans/<plano da fase>.md"` e, se precisar, `"decisoes"` (texto com decisões já tomadas).
- **Atenção ao publicar na VPS:** antes de atualizar a imagem, acrescente `SEGREDO_LINKS` ao `.env.producao` (contrato E17). Sem isso, o sistema dá erro 500.
- **Próximos passos, em ordem:**
  1. Retomar os três times depois das 19h50 (veja acima). Quando a Fase 2 terminar a T22 e a Fase 3 a T16, rode a revisão final de cada uma.
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
