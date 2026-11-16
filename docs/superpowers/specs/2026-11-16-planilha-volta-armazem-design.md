# Planilha "Volta ao armazém" (design curto)

Aprovado pelo usuário em 16/11/2026. É a melhoria 4 das 5 tiradas dos vídeos do adm (transcrição, vídeo 3: "esse produto é bom, estoque bom, aí ele tem que ir lá e armazenar estoque bom e colocar no sistema dele").

## Por quê
O sistema é, por enquanto, um **controle do que acontece em tempo real**, sem integrações. O fluxo é este: o produto volta do e-commerce, chega no armazém MTC e vem para a bancada. Lá ele é separado em bom e ruim. **O bom volta ao armazém para venda.** O estoque fica no AnyMarket e no ERP, e lá é lançado à mão. O usuário quer **só uma planilha** do que volta ao armazém. Nada de integração agora.

A pergunta "quem emite a NF de devolução hoje" ficou sem resposta e foi anotada para o fim. Por isso a planilha **não depende da NF**.

## O que muda
1. **Página "Estoque Bom"** (`/fluxo/estoque-bom`), com link a partir da etapa 4 do Fluxo e do Painel. Usa a permissão `ver_listas`.
   - **Filtro por período** (de, até) da data em que a unidade foi para o Estoque Bom, ou seja, a conclusão da conferência. O período padrão é **hoje**. Atalhos: "Hoje", "Últimos 7 dias", "Este mês".
   - **Lista em cartões** (celular primeiro):
     - SKU e descrição;
     - quantidade (1 por unidade de devolução; a quantidade do item nas retiradas);
     - origem (DEV-000123 ou RF-000001, com link);
     - data;
     - Situação.
   - **Botão "Baixar planilha"** (rodapé fixo no celular): um arquivo `.xlsx` com o período escolhido. Usa o `gerarXlsx` que já existe (`src/modules/lotes/xlsx.ts`), sem dependência nova.
2. **O que entra:**
   - **Unidades de devolução** com `destino = BOM` de devoluções cuja conferência foi concluída, em qualquer status depois dela.
   - Coluna **Situação:**
     - "Aguardando NF" (item AGUARDANDO_NF);
     - "Disponível para venda" (item DISPONIVEL_VENDA);
     - para os outros status que existirem, o rótulo do próprio status.
   - **Itens das retiradas do Full** com situação **Conferida** (melhoria 3). A data é a da conclusão da retirada e a Situação é "Retirada do Full".
   - Unidades AUSENTE e Estoque Problema **não** entram.
3. **Colunas da planilha, nesta ordem:** Data · Origem · SKU · Descrição · EAN · Quantidade · Situação · Nº de série (só para devolução; vazio na retirada). O cabeçalho do arquivo traz o período.
4. **Nome do arquivo:** `volta-ao-armazem_AAAA-MM-DD_a_AAAA-MM-DD.xlsx`.

## O que não muda
- Nada de "Lançado ✓", nem de integração com o AnyMarket ou o ERP (fica para depois, se pedirem).
- A NF, os lotes e as etapas não mudam. Nenhuma migração, se as datas necessárias já existirem: a conclusão da conferência e a conclusão da retirada. Se faltar uma data de conclusão por unidade, use a data do evento de conclusão da conferência da devolução.

## Restrições
- Celular primeiro: 390×844, sem rolagem lateral, cartões, rodapé fixo com o botão, alvos de 44 px ou mais.
- Período máximo de 366 dias por planilha, para não pesar. Fora disso, mensagem clara.
- A rota de download exige `ver_listas` e não aceita período inválido.
- Testes: unidade (montar as linhas e as colunas na ordem; o nome do arquivo; validar o período), integração (a consulta junta as unidades BOM e os itens das retiradas conferidas, exclui AUSENTE, PROBLEMA e retiradas abertas, respeita o período e as permissões) e e2e nos projetos `computador` e `celular` (abrir, filtrar "Hoje", ver 1 unidade de devolução e 1 item de retirada, baixar o arquivo e conferir o cabeçalho e uma linha).

## Abordagens consideradas
- **Planilha a partir da conferência, independente da NF (escolhida):** funciona hoje sem a Focus e continua certa quando a NF entrar, por causa da coluna Situação.
- **Planilha só depois da NF autorizada:** ficaria vazia enquanto a NF não é emitida pelo sistema.
- **Lista com "Lançado ✓" e integração com o AnyMarket:** o usuário disse que conexões não são prioridade agora.
