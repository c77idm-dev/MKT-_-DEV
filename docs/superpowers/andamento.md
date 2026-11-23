# Andamento e como continuar (para qualquer sessão, em qualquer computador)

Atualizado em 23/11/2026, de manhã. Retomado depois da queda da sessão de 19/11 (os fluxos pararam no limite de 5 horas). A integração pelo Bitbrain e a opção C estão no ar na VPS. Em paralelo: produtos do ML com foto, filtro de reputação, dossiê de provas em PDF e catálogo inteiro (esperando o Bitbrain). Mantenha este arquivo em dia ao fechar cada etapa e envie-o ao GitHub.

## Onde paramos
- **Integração pelo Bitbrain: no `main` desde 19/11.** Spec [specs/2026-11-18-integracao-bitbrain-design.md](specs/2026-11-18-integracao-bitbrain-design.md) e plano [plans/2026-11-18-integracao-bitbrain.md](plans/2026-11-18-integracao-bitbrain.md).
  - **Revisão final aprovada** (run `wf_b85dc797-2e1`), com 10 itens corrigidos e nenhuma rodada extra. Os principais:
    - o nome longo da conta não alarga mais o cartão no celular;
    - o "Urgentes do ML primeiro (extra)" ficou marcado nas etapas 2 e 3;
    - o "Responda no ML" manda abrir a venda e a reclamação, não o código interno;
    - os dois e2e instáveis ficaram determinísticos: `estoque-bom.spec.ts:32`, que já falhava antes desta branch, e `bitbrain-devolucoes`;
    - o adendo do `logistic` entrou no texto para colar no Bitbrain;
    - o atalho `dc` ficou definido no `deploy-vps.md`.
  - **O que ficou de propósito** (riscos pequenos, cada um com o motivo) está no fim de `.superpowers/sdd/fases-2-6/progress-bb.md`, que é local e fica fora do git.
  - **O que entregou:**
    - `ML_CONECTOR=bitbrain`, com `BITBRAIN_URL` e `BITBRAIN_TOKEN`;
    - tabela `contas_bitbrain` e migração `0014_bitbrain_contas_extras`;
    - varredura conta por conta;
    - 5 extras nos dois modos;
    - respostas ao ML à mão: "Responda no ML" e "OK para responder no ML".
  - **Testes (19/11):** unidade 823; integração 497 (7 pulados); e2e do modo `api`/falso 214 (8 pulados); e2e do modo Bitbrain 12 (6 testes nos projetos `computador` e `celular`). O e2e do modo Bitbrain roda à parte, com `npm run test:e2e:bitbrain`. Typecheck, lint e `build:scripts` limpos.
  - **Falta:**
    - a rota do Bitbrain já foi construída e confere com o contrato (base `https://app.bitbrain.com.br`, limite `DEVOLUCOES_RPM` de 120/min por empresa). Falta mandar a ela o adendo do `logistic.type` ([../integracao/bitbrain-rota-devolucoes.md](../integracao/bitbrain-rota-devolucoes.md)) e publicá-la, se ainda não estiver no ar;
    - ✅ **Ligado na VPS em 19/11, às 16h45:**
      - imagem `e578f6b`; `ML_CONECTOR=bitbrain`, com o token lido do `/home/bitbrain/bitbrain/.env` sem aparecer na tela;
      - a rota respondeu 200, as migrações foram aplicadas e o `/api/saude` está ok;
      - backup antes da atualização: `/root/backups-devolucoes/banco-antes-bitbrain_20261119-1945.dump`, e cópia do env em `.env.producao.antes-bitbrain_20261119-1945`.
      - ✅ **As 5 contas foram marcadas e sincronizadas.** Na primeira tentativa a busca deu 400 em todas, porque o ML não aceita `players.user_id`/`players.role`. Corrigido para `player_user_id`/`player_role` (`2aafd82`, no ar às 17h10).
      - **Às 17h15:** 61 reclamações lidas, 13 devoluções do ML criadas, e cerca de 1.100 leituras ainda na fila, que vai andando sozinha.
      - Na VPS: opção C no ar (`1901f0d`). DEV-000002 a 000005, que eram de teste, foram apagadas; backup antes em `/root/backups-devolucoes/banco-antes-apagar-testes_20261119-1957.dump`. Sobrou só a DEV-000001, cancelada.
      - **Depois da entrega (19/11):**
        1. O ML devolve 401 em `/post-purchase/v2/claims/5614557128/returns`, numa reclamação só. Investigar; talvez a conta não seja a dona da devolução.
        2. Pedir o adendo do `logistic` à sessão do Bitbrain, para o selo Full funcionar.
        3. Apagar as fotos que ficaram sem dono no armazenamento, das antigas DEV-000004 e 000005, e perguntar ao usuário se apaga também a DEV-000001.
        4. Mover o arquivo solto `/opt/devolucoes/backup-antes-fase1-20261112-1928.sql` para `~/backups-devolucoes`.
      - **Produtos do ML com foto (extra), aprovado em 19/11:** construído na branch `produtos-do-ml` (`ae1ebf3` até `70801df`). **Revisado em equipe e junto no `main` em 23/11 (`97f1fdb`).** Falta só publicar na VPS.
        - **Testes:**
          - unidade: 853;
          - integração: 513 (7 pulados);
          - typecheck e lint limpos;
          - e2e novo `produtos-ml.spec.ts`: 6 de 6;
          - e2e do modo Bitbrain: 14 de 14.
        - **Bateria e2e completa:** 221 passaram e 1 falhou (`texto-longo` no celular: a foto alargava o detalhe). Corrigido em `f2f5595` (lista dos itens com coluna fixa e quebra de texto); o reteste deu 7 de 7.
        - **Prints (23/11):** `scratchpad\produtos-ml\etapa-1-cartoes-com-foto.png` e `conferencia-unidade-com-foto.png`.
        - **Revisão final (run `wf_61044862-f3c`): aprovada.** Corrigiu um IMPORTANTE em `a178e64`: o produto criado pelo ML ligava só a devolução sincronizada, e outra devolução com o mesmo SKU dava divergência falsa na bancada. Agora liga os itens de todas as devoluções ainda não lidas, dentro do savepoint. Também: o EAN livre ignora zeros à esquerda, há um teste provando que um erro no cadastro do produto não trava a sincronização, e a E22 lista o detalhe. Os menores ficaram para o adendo do catálogo: alt repetido no leitor de tela, não dá para trocar a foto pela tela, a foto de 64 px não amplia com um toque.
        - **Aviso das revisões:** e2e e `test:int` não podem rodar ao mesmo tempo no mesmo worktree e banco, porque o `limparTabelas` apaga os usuários do e2e.
        - **Falta:** publicar na VPS (imagem `97f1fdb558a64ff139af79fd6cdd6fd82c1d50f9`), que aplica a migração `0015_produtos_do_ml.sql` ao subir. Fazer o backup antes.
        - **O que se desviou do pedido, de propósito:**
          - a foto aparece só no passo da unidade da conferência, não na legenda do destino;
          - o GTIN só vale se passar no `normalizarEan`, que confere o dígito verificador;
          - a criação do produto roda num savepoint: se falhar, a devolução sincroniza do mesmo jeito;
          - eventos novos: `ml_produto_criado` e `ml_produto_completado`;
          - a emenda E22 está no contrato.
        - **Sem `include_attributes=all` por enquanto.** A rota do Bitbrain ainda recusa esse parâmetro. Ele entra quando o adendo do catálogo for publicado; até lá, o GTIN da variação nem sempre vem.
        - O que faz:
          - quando chega uma devolução do ML com um SKU não cadastrado, cria o produto com o título, o EAN (GTIN) e a foto principal do anúncio, sem fornecedor;
          - se o produto já existe, só preenche o que estiver vazio;
          - liga os itens das devoluções antigas na próxima atualização delas;
          - migração `0015` (`produtos.foto_url` e `produtos.ml_item_id`);
          - a fotinha aparece no cartão, na conferência, no detalhe e em Cadastros.
        - Só os produtos que aparecem nas devoluções. O catálogo inteiro é a frente abaixo.
      - **Frentes em paralelo (19/11, depois da entrega), cada uma no seu worktree:**

        | Frente | Branch | Worktree | Bancos | Porta |
        |---|---|---|---|---|
        | Produtos do ML com foto (extra) | `produtos-do-ml` | `C:/Users/idmpc/devolucoes-wt/bitbrain` | `devolucoes_test_f7` | 3107 |
        | Catálogo inteiro do ML (extra) | `catalogo-ml` | `C:/Users/idmpc/devolucoes-wt/catalogo` | só documentos por enquanto | — |
        | Filtro "Afetam a reputação" (extra) | `filtro-reputacao` | `C:/Users/idmpc/devolucoes-wt/reputacao` | `devolucoes_f8` e `devolucoes_test_f8` | 3108 |
        | Dossiê de provas (PDF) (extra) | `dossie-provas` | `C:/Users/idmpc/devolucoes-wt/dossie` | `devolucoes_f9` e `devolucoes_test_f9` | 3109 |

        - **Catálogo inteiro:**
          - primeiro saem o texto para a sessão do Bitbrain e o desenho e o plano do nosso lado, em `docs/integracao/bitbrain-rota-catalogo.md`, `specs/2026-11-19-catalogo-ml-design.md` e `plans/2026-11-19-catalogo-ml.md`;
          - **o texto foi conferido em equipe e entregue ao usuário em 19/11** (run `wf_436d321e-291`, branch `catalogo-ml` em `fd542a4`). A versão final pede:
            - o `logistic` no `/shipments`, para o selo Full;
            - o `include_attributes=all` no `/items/MLB…`;
            - o caminho 13, `/users/{seller}/items/search` com scan e `scroll_id`;
            - o caminho 14, `/items/bulk`, que substitui o `/items?ids=` que o ML desligou;
            - o limite de 2.000 caracteres;
            - os testes;
            - uma conferência ao vivo, as perguntas (a) e (b).
          - **Correções da conferência:** a leitura esgota o scroll antes dos lotes, porque o `scroll_id` vence em 5 minutos; a trava de páginas não corta mais o catálogo; a conferência (b) testa a chamada exata, com 20 ids e os 8 campos.
          - **Esperando:** o usuário colar o texto na sessão do Bitbrain e devolver as respostas (a) e (b), e o Nathan publicar. Depois, ajustar a spec e o plano com as respostas e construir, com `produtos-do-ml` já no `main`;
          - **decisões do usuário (19/11):** reimportação toda segunda às 4h, só nas contas já importadas; descrição com o nome da variação ("Título — Azul / M"), regra que vale também para `produtos-do-ml`; só anúncios ativos e pausados, sem os encerrados.
        - **Filtro de reputação:** o usuário escolheu o botão vermelho "Afetam a reputação · N" ao lado de Filtros, que só aparece quando há alguma, mais uma opção dentro de Filtros.
          - **Construído** na branch `filtro-reputacao` (`1a8b165` até `91707ce`, no GitHub).
          - **Testes:** unidade 837; integração 501; typecheck e lint limpos; e2e dos specs afetados nos dois projetos.
          - Corrigiu de quebra um bug antigo: depois de tirar um filtro pela etiqueta, o próximo "Buscar" trazia o filtro de volta. A correção foi um `key` no formulário.
          - **Decisão do usuário (19/11):** contar e listar também as devoluções "No CD do marketplace" (armazém do ML). Ficam de fora só as concluídas, canceladas e extraviadas.
          - **Revisão final** no run `wf_1c1d7469-b37` (`fase-final.js`, `pref` `rep`, `base` `c58aea0`), com essa decisão como correção obrigatória. Parou em 19/11 depois da metade do servidor (`.superpowers/sdd/fases-2-6/rep-final-servidor.md`); retomada em 23/11 no mesmo run.
        - **Ordem de junção no `main`:** `produtos-do-ml` primeiro, depois `filtro-reputacao` e por último `dossie-provas`. As duas primeiras mexem em `busca.ts`, mas em partes diferentes; o dossiê mexe no detalhe e no "Responda no ML". **O dossiê de provas foi aprovado em 19/11.** O primeiro fluxo (`wf_56f87cc3-2eb`) parou no limite de 5 horas com 3 commits locais (`823136e`, `fb831d0`, `696ebad`, ainda fora do GitHub) e os e2e pela metade. Retomado em 23/11 no run `wf_5f9f5de2-57b`, que continua a construção, revisa por 3 olhares com verificação cética, corrige e envia. A foto do anúncio entra no dossiê depois de `produtos-do-ml`.
        - **Dossiê de provas (PDF) (extra):** o usuário precisa apresentar provas ao ML nas contestações.
          - **Conteúdo do PDF:** capa (DEV, venda e reclamação do ML, rastreio, motivos, chegada e conferência), fotos do pacote, cada unidade (código de barras, nº de série, Fotos 3 e 4, avarias, destino), um quadro do vídeo, o histórico e um rodapé com o SHA-256 de cada arquivo.
          - **Onde baixar:** botão "Baixar dossiê de provas (PDF)" no detalhe, depois da conferência, e no "Responda no ML".
          - **Regras:** o vídeo vai à parte, porque o ML não aceita vídeo no PDF. Nenhum dado do comprador entra no documento. O PDF fica abaixo de 8 MB, reduzindo as fotos.
          - **Ao terminar:** mostrar ao usuário o PDF de exemplo (`scratchpad\dossie\exemplo-dossie.pdf`).
      - **Se esta sessão cair:**
        - os fluxos e agentes em segundo plano param, mas as branches estão no GitHub;
        - confira `git log` de cada branch da tabela acima e os arquivos `.superpowers/sdd/fases-2-6/progress-rep.md` e `progress-prod.md`;
        - retome com `resumeFromRunId` usando os ids dos runs acima;
        - nunca rode duas baterias e2e na mesma porta e no mesmo banco ao mesmo tempo.
- **Mudança de rumo (16/11): integração pelo Bitbrain, não direto com o ML.** O usuário decidiu que, por enquanto, o sistema puxa devoluções, notas e o que precisar do **Bitbrain** (hub que já está ligado ao ML), em vez de ligar o app do ML. A configuração do app do ML foi interrompida antes de gravar as chaves na VPS (`ML_CLIENT_SECRET` não foi gravada). Plano: um **conector Bitbrain** no mesmo encaixe `MarketplaceConnector` (`src/conectores/marketplace/tipos.ts`), sem mexer nas telas.
  - **Conector "Bitbrain" do claude.ai: autorizado e explorado em 18/11.**
    - **O que é:** o painel das lojas no ML, só de leitura.
    - **O que traz:** anúncios e análise, vendas por SKU, curva ABC, compras e reposição, o que mandar para o Full, Mercado Ads, Buy Box, catálogo, e o estado das integrações.
    - **O que NÃO traz:** reclamações e devoluções, pedidos um a um e XML de NF. Sem isso, as devoluções não chegam ao sistema por ele.
    - **Ele serve só às conversas com o Claude.** O sistema (o servidor na VPS) não consegue usar um conector do claude.ai.
  - **O Bitbrain tem o app do ML ligado em 5 contas de vendedor** (biociclo, general, how, megadino/IDMSHOP e megadino-2/MEGADINO).
    - Os tokens ficam válidos sozinhos: ele os renova a cada 6 h.
    - O escopo inclui `orders-shipments` e `invoices`, de leitura e escrita.
    - O Bitbrain recebe os avisos (webhook) do ML.
  - **Conclusão:** para o sistema puxar as devoluções pelo Bitbrain, o **Bitbrain precisa expor uma API** para o sistema. Seria uma rota interna com token, com:
    - as reclamações e devoluções de cada conta;
    - o pedido, com itens e SKU e sem dados pessoais;
    - o XML da NF de venda.
    - O conector Bitbrain do sistema chama essa API.
  - **Decidido com o usuário (18/11):**
    - **"Não toque no código do Bitbrain."**
      - O Bitbrain fica em `C:\Users\idmpc\bitbrain`, repositório `josiasdreher/bitbrain`, em Python com FastAPI. Só o Nathan publica.
      - A aba Devoluções de lá consulta a API de pós-venda do ML na hora.
      - A rota nova é **pedida por texto** a uma sessão do Claude Code aberta na pasta do Bitbrain.
    - **Só leitura.** A resposta ao ML (OK e contestação) fica à mão por enquanto, com o texto e as fotos prontos no sistema.
    - **Várias contas.** O Gestor marca quais mandam devoluções.
    - **Cinco extras já no primeiro passo:** urgente e prazo, afeta a reputação, Full, triagem do ML e dinheiro.
  - **Desenho (B1, espelho com lista fechada).** A rota do Bitbrain repassa ao ML só as 12 leituras que o nosso `ConectorML` faz e tira os dados pessoais. O nosso lado troca só o transporte (`ClienteViaBitbrain`) e reaproveita o mapeamento já testado.
    - Spec: `docs/superpowers/specs/2026-11-18-integracao-bitbrain-design.md`.
    - Contrato da rota, com o texto para colar na sessão do Bitbrain: `docs/integracao/bitbrain-rota-devolucoes.md`.
    - A branch `integracao-bitbrain` foi juntada no `main` em 19/11.
  - **Como foi construída:** 14 tarefas pelo fluxo [workflows/fase-sdd.js](workflows/fase-sdd.js) (run `wf_064982fb-f9b`), todas aprovadas de primeira, e a revisão final pelo [workflows/fase-final.js](workflows/fase-final.js) (run `wf_b85dc797-2e1`).
  - **Próximos passos:**
    1. **Pendente na tela Fluxo (pedido do usuário em 19/11):** o topo do Fluxo no celular, com Recebimento, Nova devolução, Retiradas do Full e Planilha Volta ao armazém, está confuso. As opções foram desenhadas em https://claude.ai/artifact/2szY5un7T73PeLAHZ3Si6D. **O usuário escolheu a C** ("gostei a C"): um botão "O que você quer fazer?" abre um painel que sobe de baixo. O painel tem: Receber pacote; Nova devolução; Retiradas do Full; Planilha Volta ao armazém. Cada linha diz quando usar, e o painel só mostra o que o perfil pode fazer. ✅ **No `main` desde 19/11 (`1901f0d`)**: 830 testes de unidade e os e2e das telas mexidas passaram, e a imagem foi publicada. Texto para a VPS entregue ao usuário às 16h55, junto com a remoção das devoluções de teste DEV-000002 a DEV-000005, que só acontece se elas não tiverem NF, não estiverem em lote e não tiverem vindo do ML. O guia ilustrado (versão 2) já mostra o menu novo.
    2. **Guia ilustrado etapa por etapa (19/11):** https://claude.ai/artifact/31b76FEK2BWz7tbuB5z4wG, com 45 telas reais do celular e dados de exemplo. Se a tela Fluxo mudar, as capturas precisam ser refeitas.
    3. ✅ **A rota do Bitbrain está publicada** (Bitbrain `50afdf8`, https://app.bitbrain.com.br): devolve `401` sem token, e com token lista as 5 contas.
       - O token já está no `.env` do Bitbrain na VPS.
       - **Falta o adendo do Full na sessão do Bitbrain:** manter `logistic` (`mode`, `type`, `direction`) no filtro de `/shipments` e publicar de novo.
       - Quem publica o Bitbrain é o usuário, com `cd ~/bitbrain-publicar && git pull --ff-only && scripts/deploy.sh` neste computador. Pela regra do Bitbrain, nenhuma sessão publica.
       - Quando o nosso lado estiver publicado:
       - na VPS: `ML_CONECTOR=bitbrain`, `BITBRAIN_URL` e `BITBRAIN_TOKEN`;
       - no sistema, em Configurações › Mercado Livre: marcar as contas e "Sincronizar agora".
- **Melhorias dos vídeos do adm (16/11), no `main` (`514add1`):** vieram da transcrição de 3 vídeos que o adm mandou. Cada uma tem spec e plano em `docs/superpowers/specs|plans/2026-11-16-*`, revisão independente aprovada e suíte inteira verde (762 de unidade, 453 de integração, 210 e2e).
  1. **Motivo da reclamação do ML** no cartão e no "Motivo do cliente" (consulta `/post-purchase/v1/claims/reasons/{id}` com cache; nunca sobrescreve motivo manual). Migração `0011`. Suposição A15 do formato da resposta, a confirmar com a conta real.
  2. **Fotos da avaria** na conferência: até 6 por unidade, com "Remover" (segundo toque). Migração `0012` (índice único ignora EXTRA).
  3. **Retirada do Full** (mercadoria voltando do armazém do ML, não é devolução): botão no "Rastreio não encontrado", atalho no Recebimento, tela RF-000001 com bipar EAN e foto da etiqueta, lista "Retiradas do Full". Fotos na tabela `evidencias` com dono único (devolução ou retirada). Migração `0013`. As fotos das retiradas não entram no prazo de guarda.
  4. **Planilha "Volta ao armazém"** em `/fluxo/estoque-bom`: unidades do Estoque Bom (pela data da conferência, sem depender da NF) e itens das retiradas conferidas; "Baixar planilha" (.xlsx). Sem migração.
  5. **Buscar o pedido no ML ao bipar:** adiada (depende da conta do ML).
  - **Teste no navegador da produção (16/11):** as 4 melhorias passaram (login, motivo pelo cartão e detalhe via planilha, fotos da avaria, retirada do Full, planilha baixada e relida). Prints e scripts só neste PC (scratchpad `teste-prod/`). Pontos menores achados: a tela "Nova devolução" não tem o campo "Motivo do cliente" (só planilha e ML gravam); miniatura mostra só o ícone enquanto a foto processa; SKU/EAN longos quebram no meio; "← Etapa 4" no Estoque Bom mesmo vindo do Painel.
  - **Dados apagados na VPS (16/11, 19h48), a pedido do usuário (era tudo inventado):** movimento, produtos, fornecedores, importações e mídias; numeração zerada (DEV/LOT/RF recomeçam em 000001). Ficaram os usuários (3), as configurações e as regras fiscais. O usuário de teste `teste.claude@exemplo.com.br` foi apagado. Cópia de antes: `~/backups-devolucoes/banco-antes-limpeza_2026-11-16_*.dump`.
  - **Publicadas na VPS em 16/11, 19h20** (imagem `6f084c8`): web e worker healthy, 14 migrações, `/api/saude` 200. Cópia de antes: `~/backups-devolucoes/banco-antes-melhorias_2026-11-16_1914.dump`; imagem anterior com a tag `antes-melhorias`.
  - **Visão do usuário (16/11):** por enquanto o sistema é **controle em tempo real**, sem integrações. Fluxo: o produto volta do e-commerce → chega no armazém MTC → vem para a bancada → bom volta ao armazém para venda; ruim fica agrupado com fotos e o processo aberto. O estoque fica no **AnyMarket** e no **ERP**, lançado à mão. O **Bitbrain** é só um hub que puxa dados do ML; o sistema não depende dele.
  - **Perguntas em aberto para o fim (o usuário não sabe responder agora):** (a) quem emite a NF de devolução hoje e onde; sem a Focus ligada as devoluções param na etapa 4 (a planilha da melhoria 4 já contorna isso); propostas: "NF emitida fora do sistema" (digitar o número) ou "Seguir sem NF". (b) Inscrição Estadual ou "ISENTO".
- **Resolvido (16/11): o celular do usuário não abria o site.** Era o **DNS privado** do Android, e o usuário arrumou. Fica de lição: quem tiver DNS com filtro (AdGuard, NextDNS etc.) pode cair no mesmo erro com `sslip.io`; um domínio próprio evita isso.
  - Sintoma: no Chrome do Android, "Não foi possível estabelecer uma conexão segura com este site … enviou uma resposta inválida", `ERR_SSL_PROTOCOL_ERROR`. Acontece no Wi-Fi e também só no 5G.
  - No PC do usuário o site abre normalmente.
  - Conferido pelo PC de desenvolvimento em 16/11: `/api/saude` 200 (banco e fila ok), `/login` 200 com a tela nova, certificado Let's Encrypt válido (12/11/2026 a 10/02/2027), TLS 1.2 e 1.3 funcionando, DNS `devolucoes.179-199-128-100.sslip.io` → `179.199.128.100`, sem registro IPv6, arquivos do PWA e os JS com 200. GitHub Actions verde nas 3 últimas imagens.
  - Conclusão até aqui: o servidor está bem; a causa está no próprio celular. Suspeita principal: **DNS privado** do Android (filtros como AdGuard/NextDNS bloqueiam domínios `sslip.io` e mandam o celular para um servidor de bloqueio, o que dá exatamente esse erro).
  - Próximos passos da investigação: (1) o usuário diz o que está marcado em Configurações › "DNS privado"; (2) se precisar, logo depois de tentar no celular, rodar na VPS `tail -n 20 /var/log/nginx/error.log | grep -i -E "ssl|handshake"; tail -n 5 /var/log/nginx/access.log` para ver se o celular chega na VPS; (3) solução definitiva possível: um domínio próprio no lugar do `sslip.io` (já previsto na "Ligação das contas reais").
  - Nada foi mudado no servidor por causa disso.
- **Fases 0 a 6:** prontas, no `main` e **publicadas na VPS em 15/11/2026** (https://devolucoes.179-199-128-100.sslip.io), imagem do commit `0fd1dc3`/`37f25e7`.
  - **Login novo (15/11):** faixa verde da marca com código de barras "DEV · CONFERÊNCIA · NF", mostrar a senha e "Lembrar de mim" (extras). Spec [specs/2026-11-15-login-design.md](specs/2026-11-15-login-design.md), plano [plans/2026-11-15-login-faixa-verde.md](plans/2026-11-15-login-faixa-verde.md). No `main` (`da56cee`) e publicado na VPS no mesmo dia. A imagem anterior ficou com a tag local `antes-login`. O componente `src/components/FaixaCodigoBarras.tsx` (tom claro ou escuro) pode ser usado em outras telas; o usuário ainda vai dizer onde.
  - Publicação feita passo a passo com o usuário (ele prefere receber um passo de cada vez e devolver a saída, em vez de um texto inteiro para a Claude web). Roteiro: [../operacao/publicar-fases-2-6.md](../operacao/publicar-fases-2-6.md).
  - Cópias de antes, na VPS em `~/backups-devolucoes/`: dump do banco (`banco-antes-fases2-6_2026-11-15_1139.dump`), commit anterior, nginx e `.env`. A imagem da Fase 1 ficou com a tag local `ghcr.io/c77idm-dev/devolucoes:fase1-antes`.
  - No ar: `web` e `worker` (healthy), 11 migrações, `/api/midia` no nginx, cabeçalhos de segurança, mídias no disco (`ARMAZENAMENTO=disco`, volume `/data`). O serviço `backup` **não** foi ligado (falta o bucket do B2); use sempre `dc up -d web worker`, nunca `dc up -d` sem nomes.
  - Na VPS, o `.env.producao` tem `ML_*`/`FOCUS_*`/`S3_*` vazias e o `.env.backup` está criado e vazio, à espera da "Ligação das contas reais". A `CHAVE_CRIPTOGRAFIA` foi gerada na VPS; o usuário guarda a cópia.
  - Observação: o nginx da VPS (configuração global, compartilhada) também manda `X-Frame-Options: SAMEORIGIN` e outros cabeçalhos, que saem duplicados com os do sistema (`DENY`). A CSP `frame-ancestors 'none'` vale por cima; não mexa no nginx global por causa disso.
- **Fases 2, 3 e 4:** prontas, com revisão final aprovada e **juntadas no `main`** em 14/11, na ordem 2 → 3 → 4 (`6abdf46`).
  - Suíte do `main` depois da junção: 566 de unidade, 314 de integração, 145 e2e (7 pulados de propósito), nos projetos `computador` e `celular`.
  - Migrações: `0006_fundacao`, `0007_fase3_mercado_livre`, `0008_fase4_fiscal`.
  - Testes entre fases criados: `tests/e2e/integracao-ml.spec.ts` (Fase 3) e `tests/e2e/integracao-fiscal.spec.ts` (Fase 4).
  - Publicadas na VPS em 15/11, junto com as Fases 5 e 6 (o ML e a NF-e só funcionam depois da "Ligação das contas reais").
- **Fase 5 (Remessas):** pronta, com revisão final aprovada e **juntada no `main`** em 14/11 (merge `6f19451`).
  - Suíte do `main` depois da junção: 610 de unidade, 369 de integração, 163 e2e (7 pulados de propósito), nos projetos `computador` e `celular`. O `conferencia.spec.ts:96` falhou e passou ao repetir.
  - Migração: `0009_fase5_remessas` (sem SQL escrito à mão). Dependência nova: `pdf-lib@1.17.1`.
  - Teste entre fases criado: `tests/e2e/integracao-remessas.spec.ts`.
  - A NF de remessa real em homologação fica para a "Ligação das contas reais". Publicada na VPS em 15/11.
- **Fase 6 (Acabamento):** pronta, com revisão final aprovada e **juntada no `main`** em 15/11 (merge `cf19052`). É a última fase: **as Fases 0 a 6 estão todas no `main`.**
  - Entregou: alertas no topo do Fluxo e a página `/fluxo/alertas` (extra), tela Falhas com "Tentar de novo" e "Dispensar" (extra), `midia.retencao` (prazo de guarda) e a limpeza LGPD das planilhas, limite de login por IP, cabeçalhos de segurança com CSP e sem `X-Powered-By`, `/api/saude` com 503, logs JSON do `web`, healthcheck do `web` e do `worker`, serviço `backup` (cifrado, bucket só de backup, 30 dias) com a restauração documentada.
  - Suíte do `main` depois da junção: 685 de unidade, 415 de integração, 187 e2e (7 pulados de propósito), nos projetos `computador` e `celular`. Na 1ª execução o PC dormiu no meio e dois testes de `cadastros.spec.ts` falharam em cascata (o 2º depende do mapeamento salvo pelo 1º); a 2ª execução passou inteira.
  - Migração: `0010_fase6_acabamento` (sem SQL escrito à mão). Nenhuma dependência npm nova.
  - Correção extra na integração (emenda **E20**): as variáveis `BACKUP_S3_*` e `BACKUP_SENHA` saíram do `.env.producao` e foram para o `.env.backup` (modelo `.env.backup.example`), lido só pelo serviço `backup`. Assim o `web` e o `worker` não enxergam a chave do bucket de backup nem a senha da cifra. O `scripts/infra.test.ts` garante isso.
  - Publicada na VPS em 15/11 (sem o serviço `backup`, que espera o B2). O critério de pronto da spec §14 ("restauração de backup testada; NF em produção aprovada pelo contador") acontece na VPS e com o contador.
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
- **Segundo PC (usuário Windows "JEFFERSON LIMA"), preparado em 14/11** (o PostgreSQL da porta 5433 foi religado em 16/11 depois de o PC reiniciar):
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
  0. Ligar o modo Bitbrain na VPS depois que o Bitbrain publicar a rota; testar com uma conta marcada e conferir A16–A19 com dados reais.
  1. ~~Publicação na VPS~~ **feita em 15/11.** Falta o usuário testar no celular (câmera real no Android e no iPhone, Foto 1, Falhas, Alertas). Texto antigo: **Publicação na VPS de tudo de uma vez** (Fases 2 a 6; decisão do usuário em 14/11). Passe ao usuário o texto pronto para colar, que está no plano da Fase 6, seção "Depois da fase", item 1. Passos novos desde a Fase 1: `SEGREDO_LINKS` (E17), serviço `worker`, volume `/data`, `location /api/midia/` no nginx (só `nginx -t && systemctl reload nginx`), o `.env.backup` com as variáveis `BACKUP_*` (E20) e o serviço `backup`, mais um backup e uma restauração de teste (critério de pronto da spec §14). Antes, o usuário cria no B2 o bucket só de backup e a chave restrita a ele.
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
  - O e2e tem duas rodadas: `npm run test:e2e` (modo `api`/falso) e `npm run test:e2e:bitbrain` (modo Bitbrain, arquivos `tests/e2e/bitbrain-*.spec.ts`).
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
