# Andamento e como continuar (para qualquer sessão, em qualquer computador)

Atualizado em 12/11/2026. Mantenha este arquivo em dia ao fechar cada etapa e envie-o ao GitHub.

## Onde paramos
- **Fases 0 e 1:** prontas, no `main` e publicadas na VPS (https://devolucoes.179-199-128-100.sslip.io).
- **Fases 2, 3 e 4:** em andamento, em **paralelo, com um time de agentes por fase** (pedido do usuário).
  - As regras do paralelo estão no contrato [plans/2026-11-12-contrato-fases-2-6.md](plans/2026-11-12-contrato-fases-2-6.md). Ele é obrigatório para as Fases 2 a 6.
  - **P1 (isolamento dos testes por worktree):** feita.
  - **Planos de cada fase:**
    - Fase 2 (com a "Parte A", a base comum): [plans/2026-11-12-fase-2-conferencia.md](plans/2026-11-12-fase-2-conferencia.md)
    - Fase 3: [plans/2026-11-12-fase-3-mercado-livre.md](plans/2026-11-12-fase-3-mercado-livre.md)
    - Fase 4: [plans/2026-11-12-fase-4-fiscal.md](plans/2026-11-12-fase-4-fiscal.md)
  - Um plano está incompleto se tiver um marcador `<!-- CONTINUA -->` ou se ainda não estiver no repositório. Nesse caso, continue a partir da última tarefa escrita, seguindo o contrato.
- **Atenção ao publicar a Parte A na VPS:** antes de atualizar a imagem, acrescente `SEGREDO_LINKS` ao `.env.producao` (contrato E17). Sem isso, o sistema dá erro 500.
- **Próximos passos, em ordem:**
  1. Executar a **Parte A da Fase 2** no `main`.
  2. Criar as worktrees e os bancos (contrato §6).
  3. Executar as Fases 2, 3 e 4 em paralelo.
  4. Juntar na ordem 2 → 3 → 4 (contrato §7).
  5. Fase 5.
  6. Etapa **"Ligação das contas reais"**: ML, Focus NFe em homologação, B2 e domínio.
  7. Fase 6.
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
