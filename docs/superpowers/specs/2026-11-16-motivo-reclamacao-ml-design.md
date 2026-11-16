# Motivo da reclamação do ML no sistema (design curto)

Aprovado pelo usuário em 16/11/2026. É a melhoria 1 das 5 tiradas dos vídeos do adm (transcrição: "a gente consegue puxar … lá nas reclamações. Qual que é o motivo? Comprador se arrependeu").

## Por quê
Hoje a Melissa (Fiscal) e o Gestor precisam abrir o ML para saber por que o comprador devolveu. A reclamação do ML já traz o código do motivo (`reason_id`, por exemplo `PDD9949`), mas o sistema o ignora. O campo "Motivo do cliente" do detalhe já existe e aparece como "—" nas devoluções do ML.

## O que muda
1. **Ler o motivo:** o esquema e o mapeamento da reclamação (`esquemas.ts`, `mapeamento.ts`) passam a ler `reason_id`. Ele é guardado em `reclamacoes_ml.motivo_id` (coluna nova, texto, pode ser nula).
2. **Texto do motivo:** o conector ganha `obterMotivoReclamacao(reasonId)`, que chama `GET /post-purchase/v1/claims/reasons/{reason_id}` e devolve o texto em português (campo de nome/descrição da resposta).
   - **Cache:** tabela nova `motivos_reclamacao_ml (id texto PK, nome texto, consultado_em)`. Um código já consultado não é pedido de novo.
   - **Falha:** se a consulta falhar (rede, 404, formato), a sincronização **não falha** por isso. O motivo fica sem texto e é tentado na próxima sincronização.
   - O formato exato da resposta é uma suposição a confirmar na "Ligação das contas reais", como as outras suposições do ML. O mapeamento é uma função pura sobre o JSON, para o ajuste ser barato.
3. **Preencher o "Motivo do cliente":** na criação, no vínculo e na atualização pela sincronização, `devolucoes.motivo_cliente` recebe o texto **só se estiver vazio**. Um motivo digitado à mão ou vindo da planilha nunca é sobrescrito.
   - Sem texto (consulta falhou), fica vazio, sem mostrar o código cru.
4. **Cartão da devolução:** uma linha "Motivo: …" em `CartaoDevolucao.tsx` para toda devolução com `motivo_cliente` (ML, manual ou planilha), em uma linha com reticências, sem quebrar o cartão no celular.
5. **Conector falso:** a reclamação de exemplo continua com `PDD9949`. O falso ganha a rota de motivos com alguns exemplos (`PDD9949` → "Comprador se arrependeu", mais dois), e os cenários podem trocar o `reason_id`.

## O que não muda
- Os motivos de **contestação** (SRF2–SRF6, `returns/reasons`) não mudam.
- O motivo da **unidade** na conferência (Avariado, Divergente etc.) é outra coisa e não muda.
- Nada muda nas telas além do cartão (o detalhe já mostra "Motivo do cliente").

## Restrições
- Migração nova pelo procedimento do projeto (`npm run db:gerar`). Nenhuma dependência nova.
- Celular primeiro: o cartão não pode ganhar rolagem lateral em 390 px. O texto longo é cortado com reticências e o texto inteiro fica no detalhe.
- Nada de dados do comprador além do motivo. Sem log do corpo da resposta do ML (regra da Fase 3).
- Testes: unidade (mapeamento do `reason_id`; mapeamento da resposta de motivo; o cartão mostra e corta o motivo), integração (a sincronização preenche só quando vazio; não sobrescreve o manual; a falha da consulta não derruba a sincronização; o cache evita a segunda consulta) e e2e curto (a devolução do ML falso mostra "Comprador se arrependeu" no cartão e no detalhe, nos projetos `computador` e `celular`).

## Abordagens consideradas
- **Consultar o texto no ML e guardar em cache (escolhida):** acompanha os códigos novos do ML sem mudar o código.
- **Tabela fixa de códigos e textos no próprio sistema:** quebra quando o ML criar um código novo.
- **Mostrar só o código (`PDD9949`):** não ajuda quem lê.
