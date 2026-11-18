# Integração com o Bitbrain (devoluções do ML pelo Bitbrain)

Data: 18/11/2026. Aprovado pelo usuário no chat ("manda"). Este documento vale junto com a spec principal (`2026-11-11-gestao-devolucoes-design.md`) e o contrato das fases (`plans/2026-11-12-contrato-fases-2-6.md`).

## 1. Por que
- O usuário decidiu em 16/11: por enquanto o sistema não liga o app do ML direto, e as devoluções vêm do **Bitbrain**. O Bitbrain é o painel das lojas no ML; já tem o app do ML ligado em 5 contas, com os tokens renovados sozinhos.
- O conector "Bitbrain" do claude.ai não serve. Ele não traz devoluções, pedidos nem NF, e um sistema não consegue usar um conector do claude.ai.
- A aba Devoluções do Bitbrain consulta a API de pós-venda do ML na hora. **Nenhuma rota do Bitbrain** entrega isso a outro sistema: a `/estudio/ml` só aceita as ações fixas do Estúdio.
- Regra do usuário: **não tocamos no código do Bitbrain**. A rota nova é pedida por texto à sessão do Bitbrain ([../../integracao/bitbrain-rota-devolucoes.md](../../integracao/bitbrain-rota-devolucoes.md)); quem constrói é ela, e quem publica é o Nathan.

## 2. Decisões
| # | Decisão |
|---|---|
| B1 | **Espelho com lista fechada.** A rota do Bitbrain faz, com o token da conta, só as leituras GET que o nosso `ConectorML` já faz (mais 3 para os extras). Ela devolve a resposta do ML como veio, sem os dados pessoais e com o mesmo código HTTP. Assim o nosso lado troca só o **transporte** (`ClienteML`) e reaproveita os esquemas zod, o mapeamento e o tratamento de erros, que já foram testados. |
| B2 | **Só leitura.** A resposta ao ML (o "OK" e a contestação com fotos) continua **à mão** no ML ou no Bitbrain. O sistema prepara o texto e as fotos e registra "respondida". A escrita fica para um segundo passo. |
| B3 | **Várias contas.** As contas vêm do Bitbrain. O Gestor marca, em Configurações › Mercado Livre, quais mandam devoluções para a bancada; nenhuma vem marcada. Cada devolução guarda e mostra a conta de origem. |
| B4 | **Cinco extras** no primeiro passo, nos dois modos (`api` e `bitbrain`), porque saem da mesma API do ML: urgente e prazo, afeta a reputação, Full, triagem do ML e situação do dinheiro. |
| B5 | `ML_CONECTOR` ganha o valor `bitbrain`. O modo `api` (ligação direta, Fase 3) fica guardado e desligado; o `falso` continua só para testes. |
| B6 | A varredura continua a cada 15 min, agora conta por conta. O webhook do ML não se aplica no modo `bitbrain`, porque quem recebe os avisos é o Bitbrain. |

## 3. A rota do Bitbrain (resumo; o contrato completo está no documento da integração)
- `GET {BITBRAIN_URL}/integracao/devolucoes/empresas` devolve as contas do ML com credencial válida: `empresa` (slug), `nome` e `seller_id`.
- `GET {BITBRAIN_URL}/integracao/devolucoes/ml?empresa=<slug>&caminho=<caminho do ML>` devolve a resposta do ML (JSON, ou XML na NF) com o mesmo código HTTP. Um 429 traz `Retry-After`.
- A autenticação é por `Authorization: Bearer <DEVOLUCOES_TOKEN>`. O token vazio no Bitbrain desliga a rota (404).
- Lista fechada de 12 formatos de caminho. O `seller_id` do caminho precisa ser o da empresa; qualquer outro caminho recebe 403.
- Sem dados pessoais nas respostas JSON (pedido, envio e endereços). O XML da NF de venda vai inteiro: a NF de devolução precisa do destinatário, como já é hoje na Fase 4.

## 4. O nosso lado

### 4.1 Configuração
- `ML_CONECTOR`: `api | bitbrain | falso` (padrão `api`, como hoje). Com `bitbrain`, `BITBRAIN_URL` e `BITBRAIN_TOKEN` são obrigatórios, e em produção a URL precisa ser `https`.
- O token nunca vai para log, evento ou resposta de erro.
- Para testes: um Bitbrain falso que só funciona com `PERMITIR_FALSOS=1` (regra E1). Ele reaproveita o ML falso (`fetchFalsoML`), traduzindo `caminho` para os cenários que já existem.

### 4.2 Transporte (`ClienteViaBitbrain`)
- Implementa o `ClienteML`:
  - `get(caminho)` e `getTexto(caminho)` chamam a rota com `empresa` e `caminho`;
  - os erros viram `ErroML` com o código do ML, então 429 com espera, 401/403/404 e 5xx seguem as regras de hoje;
  - o tempo limite e o `Retry-After` funcionam como no cliente do ML.
- `post` e `postArquivo` lançam `ErroRespostaManual`. Ninguém deve chamá-los no modo `bitbrain`; se chamar, o erro diz "responda no ML à mão".
- Não existe token do ML no nosso lado, então não há renovação nem `ml.renovar-token` no modo `bitbrain`.

### 4.3 Contas
- Tabela nova `contas_bitbrain`:
  - `empresa` (texto, chave primária), `nome`, `seller_id`;
  - `recebe_devolucoes` (booleano, padrão `false`);
  - `ultima_sincronizacao_em`, `atualizada_em`, `atualizada_por`.
- **Atualizar a lista:** ao abrir Configurações › Mercado Livre, e no botão "Atualizar contas", a tela busca as empresas do Bitbrain. Uma conta nova entra desmarcada. Uma conta que sumiu do Bitbrain fica marcada como "indisponível", sem ser apagada.
- **Quem altera:** só o Gestor marca e desmarca, e cada mudança gera evento.
- **Cada devolução** tem a coluna `conta` (empresa) em `reclamacoes_ml`, nula no modo `api` e nas antigas. O cartão e o detalhe mostram o nome da conta.

### 4.4 Conector e tarefas
- `obterConector(db, canal)`:
  - no modo `api` continua igual;
  - no modo `bitbrain` vale `obterConectorDaConta(db, conta)`: um `ConectorML` com `sellerId` da conta e transporte pelo Bitbrain.
- **Varredura** (`ml.varredura`, a cada 15 min):
  - para cada conta com `recebe_devolucoes`, lista as reclamações atualizadas e enfileira `ml.sincronizar-reclamacao` com `{ reclamacaoId, conta }`;
  - grava `ultima_sincronizacao_em` por conta;
  - a conta que falhar não para as outras.
- **`ml.sincronizar-reclamacao`:** usa a conta da tarefa, ou a de `reclamacoes_ml`. O resto (`aplicarReclamacao`) não muda.
- **NF de venda** (`obterXmlNotaVenda`): a conta sai da devolução, via `reclamacoes_ml`.
- **"Sincronizar agora"** em Configurações enfileira a varredura na hora.
- **Alerta de sincronização parada** (spec §11): vale por conta marcada.

### 4.5 Os cinco extras (modos `api` e `bitbrain`)
- **Onde ficam:** colunas novas em `reclamacoes_ml`, todas anuláveis. O nulo quer dizer "o ML não informou".
- **As leituras novas do `ConectorML.obterReclamacao`** são todas opcionais: uma recusa não impede o resto.
  - `GET /post-purchase/v1/claims/{id}/affects-reputation`;
  - `GET /post-purchase/v1/returns/{return_id}/reviews`, só quando `related_entities` tem `reviews`;
  - `GET /shipments/{id}` do envio da venda (`pedido.shipping.id`), para o `logistic_type`.
- **O que cada extra guarda e mostra:**

  | Extra | De onde vem | Coluna | Na tela |
  |---|---|---|---|
  | Urgente e prazo | ação obrigatória (`mandatory`) da loja em `players[respondent].available_actions`, ou a revisão `return_review_*` com prazo | `acao_pendente` (texto) e `urgente` (booleano); o prazo continua em `devolucoes.prazo_conferencia_canal` | selo "Urgente · até dd/mm" |
  | Afeta a reputação | `affects_reputation`: `affected`, `not_affected` ou `not_applies` | `afeta_reputacao`: `AFETA`, `NAO_AFETA` ou `NAO_SE_APLICA` | selo "Afeta reputação" |
  | Full | `logistic_type == "fulfillment"` no envio da venda | `eh_full` (booleano) | selo "Full" |
  | Triagem do ML | `resource_reviews[].product_condition` (`saleable`, `unsaleable`, `discard`, `missing`) e `stage` | `triagem_condicao`: `VENDAVEL`, `NAO_VENDAVEL`, `DESCARTE` ou `FALTANDO`; e `triagem_etapa` | "Triagem do ML: Não vendável" |
  | Dinheiro | `return.status_money` (`retained`, `refunded`, `available`) | `dinheiro`: `RETIDO`, `DEVOLVIDO` ou `LIBERADO` | "Dinheiro: retido" |
- **Telas:**
  - os selos aparecem no cartão do Quadro de Fluxo, nas listas das etapas e na Busca Avançada (só os que importam: Urgente, Afeta reputação e Full);
  - a seção Mercado Livre do detalhe mostra todos, mais a conta;
  - nas etapas 2 e 3, as **urgentes vêm primeiro** (extra).
- Os rótulos ficam num só lugar (`modules/mercado-livre/dominio.ts`), escritos em português.

### 4.6 Respostas à mão (modo `bitbrain`)
- **Quando a conferência é concluída**, a tarefa `ml.enviar-resultado` não chama o ML. Em vez disso:
  - **todos BOM:** grava `resposta_pendente = 'OK'` em `reclamacoes_ml` e o evento `ml_resposta_manual_pendente`;
  - **algum problema:** cria a contestação como hoje (`AGUARDANDO_GESTOR`), com o motivo, a mensagem e as fotos.
- **Tela Contestações ML**, no modo `bitbrain`:
  - o botão "Enviar ao ML" vira o bloco **"Responda no ML"**, com o motivo (código SRF e texto), a mensagem com o botão "Copiar", as fotos para baixar uma a uma e o botão **"Marcar como respondida"** (extra);
  - marcar leva a contestação a `ENVIADA`, com o evento `ml_contestacao_respondida_a_mao` e o usuário;
  - uma seção nova, **"OK para responder no ML"** (extra), lista as devoluções com `resposta_pendente = 'OK'`, cada uma com "Marcar como respondido", que limpa a pendência e gera evento.
- **Avisos:** o Painel de alertas ganha "N respostas para dar no ML" (OK e contestações), com link para a tela.
- No modo `api`, tudo segue como hoje, com envio automático.

## 5. Erros e LGPD
- **Bitbrain fora do ar ou 5xx:** a tarefa tenta de novo (5 vezes, spec §11) e depois vai para Falhas, como hoje.
- **401 ou 403 da rota** (token errado, ou caminho fora da lista): erro definitivo. Vai para Falhas com a mensagem "Bitbrain recusou: confira o BITBRAIN_TOKEN".
- **Conta indisponível no Bitbrain:** a varredura pula essa conta e avisa no Painel.
- **Os logs** registram só a empresa, o caminho sem a query e o código HTTP. Nunca registram corpo, token ou dados do comprador.

## 6. Testes
- **Unidade:** o `ClienteViaBitbrain` (URL, cabeçalho, erros, 429 e `Retry-After`), o mapeamento dos 5 extras e a validação do env.
- **Integração** (contra o Bitbrain falso):
  - a varredura com 2 contas, uma marcada e outra não;
  - uma conta que falha sem parar a outra;
  - a sincronização com a conta;
  - a NF de venda pela conta;
  - a resposta à mão (OK pendente e contestação marcada);
  - os extras gravados.
- **e2e, `computador` e `celular`:**
  - Configurações › Mercado Livre no modo `bitbrain`: a lista de contas, marcar, "Sincronizar agora";
  - a devolução criada pela varredura, com os selos;
  - Contestações ML com "Responda no ML" e "Marcar como respondida";
  - "OK para responder no ML".
- **A integração real** só é testada quando o Bitbrain publicar a rota. É um passo da etapa "Ligação das contas reais".

## 7. Como liga (depois do merge)
1. **No Bitbrain**, a sessão de lá constrói a rota, e o Nathan:
   - gera o `DEVOLUCOES_TOKEN` com `openssl rand -hex 32`;
   - põe o token no `.env` do Bitbrain;
   - publica.
2. **Na VPS do sistema**, no `.env.producao`:
   - `ML_CONECTOR=bitbrain`;
   - `BITBRAIN_URL=https://<domínio do Bitbrain>`;
   - `BITBRAIN_TOKEN=<o mesmo token>`.
   - Depois, `dc up -d web worker`.
3. **No sistema**, em Configurações › Mercado Livre:
   - "Atualizar contas";
   - marcar as contas;
   - "Sincronizar agora".

## 8. Fora deste passo
- A escrita no ML pelo Bitbrain: OK automático e contestação com fotos.
- Buscar o pedido no ML ao bipar (melhoria 5).
- Os outros canais (Magalu, Shopee) pelo Bitbrain.
