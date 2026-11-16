# Retirada do Full no Recebimento (design curto)

Aprovado pelo usuário em 16/11/2026. É a melhoria 3 das 5 tiradas dos vídeos do adm (transcrição, vídeo 1: "essa etiqueta aqui é uma retira do Full").

## Por quê
Uma "retirada do Full" é **mercadoria da empresa voltando do armazém do Mercado Livre para o estoque**. Não é devolução de cliente. Esses pacotes chegam na bancada misturados com as devoluções. Hoje, quando o operador bipa a etiqueta, o sistema não acha o rastreio e oferece "Registrar pacote não identificado", o que criaria uma devolução falsa (etapas, NF, alertas).

O usuário quer as três coisas: **avisar** o operador que não é devolução, **registrar** a chegada e **conferir** os itens.

## O que muda
1. **Entrada no Recebimento** (`src/app/(app)/fluxo/recebimento/`):
   - Quando o código lido não é de nenhuma devolução, o cartão "Rastreio não encontrado" ganha um segundo botão: **"É retirada do Full (não é devolução)"**. O botão "Registrar pacote não identificado" continua.
   - Um atalho fixo na tela do Recebimento, **"Retirada do Full"**, abre uma retirada nova pedindo o código da etiqueta (câmera ou digitação).
2. **Tela da retirada** (`/fluxo/retiradas-full/[codigo]`, código `RF-000001`):
   - Aviso no topo: **"Isto não é devolução. Confira os itens e guarde no estoque."**
   - **Foto da etiqueta**, obrigatória para concluir, pela mesma captura, compressão e fila offline das fotos da conferência.
   - **Bipar produto:** o leitor de código de barras que já existe lê o EAN. Se o EAN está no cadastro, soma 1 ao produto. Se não está, pede uma descrição curta e soma num item "sem cadastro".
   - Cada item tem − e +, e "Remover" com segundo toque.
   - **Foto opcional** por item (zero ou uma).
   - **"Concluir retirada"** fica no rodapé fixo e exige a foto da etiqueta e pelo menos 1 item. Concluída, a retirada fica **Conferida** e só leitura.
3. **Lista "Retiradas do Full"** (`/fluxo/retiradas-full`): cartões com código RF, data, código da etiqueta, situação (Aberta ou Conferida), total de itens e quem recebeu. Tem link a partir do Recebimento.
4. **Separada das devoluções:** não entra nas 5 etapas, na Busca Avançada, na NF, no ML, nos lotes nem nos alertas.
5. **Ponte com a melhoria 4:** os itens de uma retirada **Conferida** são entrada de estoque, e a lista da melhoria 4 (o que lançar no ERP) vai lê-los. Esta melhoria só deixa os dados prontos (produto, quantidade, data de conclusão).

## Modelo de dados (novo; migração `melhoria3_retirada_full`)
- `retiradas_full`: `id uuid`, `codigo` (sequência RF), `codigo_etiqueta` texto, `situacao` (`ABERTA` | `CONFERIDA`), `recebida_por` → usuários, `recebida_em`, `concluida_em`, `criado_em`.
- `itens_retirada_full`: `id`, `retirada_id`, `produto_id` (pode ser nulo), `ean_lido`, `descricao` (obrigatória quando não há produto), `quantidade` int > 0.
- Evidências: reaproveitar a tabela de evidências com uma referência à retirada, ou uma tabela própria simples. **Decisão de quem implementa**, desde que use o mesmo armazenamento, os mesmos links de 10 minutos e a mesma fila offline.
- Histórico: eventos com o prefixo `retirada_full_` (criada, item incluído, concluída), em `src/modules/historico/rotulos/` (arquivo novo `retiradas.ts`, exportado como os outros).

## Permissões (spec §6.9)
- Operador e Gestor (`operar_devolucoes`): criam, conferem e concluem.
- Todos (`ver_listas`): veem a lista e o detalhe.
- Fiscal: só vê.

## Restrições
- Celular primeiro: 390×844, sem rolagem lateral, cartões, uma coluna, botão principal no rodapé fixo, alvos de 44 px ou mais, botões de captura de 56 px, erro em `role="alert"` com foco.
- Nada de dados de comprador (não há comprador). Nenhuma dependência nova.
- Testes: unidade (somar e subtrair itens, EAN sem cadastro, regras de concluir), integração (criar a partir de um código não encontrado; bipar um EAN do cadastro e um sem cadastro; concluir sem foto ou sem item é recusado; a retirada não aparece nas listas de devoluções; permissões) e e2e nos projetos `computador` e `celular` (do "Rastreio não encontrado" até "Conferida", com a câmera falsa).

## Abordagens consideradas
- **Registro próprio, fora das devoluções (escolhida):** não suja as etapas, a NF nem os alertas.
- **Devolução com uma marca "Full":** cada tela e cada regra teria de saber pular essa marca, um risco alto de vazar para a NF e para o ML.
- **Só um aviso, sem registro:** perde a conferência e a ponte com o ERP, e o usuário pediu os três.

## Depois, com a conta do ML ligada (fora desta melhoria)
- Tentar reconhecer sozinho que a etiqueta é de retirada do Full e trazer os itens esperados para conferir contra o que chegou.
