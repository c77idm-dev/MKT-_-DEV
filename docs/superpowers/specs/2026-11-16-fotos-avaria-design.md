# Fotos da avaria na conferência (design curto)

Aprovado pelo usuário em 16/11/2026. É a melhoria 2 das 5 tiradas dos vídeos do adm (transcrição: "se tem alguma avaria ou detalhe, o cara tira uma foto mais detalhada").

## Por quê
O operador quer registrar de perto uma avaria ou um detalhe da unidade, além das Fotos 1 a 4. O servidor já aceita fotos do tipo `EXTRA` (sem limite, por unidade, só durante a conferência e só para quem está com a trava), e o detalhe da devolução já as mostra. Falta a tela.

## O que muda
1. **Bloco novo no passo de cada unidade** (`PassoItem.tsx`, logo abaixo da Foto 4): "Fotos da avaria (opcional)".
   - Botão **"Adicionar foto"** (56 px, largura total, ícone de câmera), que abre a câmera nativa (`<input type="file" accept="image/*" capture="environment">`), como as outras fotos.
   - Cada foto tirada vira uma miniatura com o mesmo andamento das outras vagas: "Enviando…", ✓, "Aguardando conexão" e erro. Ela usa a mesma compressão e a mesma fila offline (IndexedDB + tus) das Fotos 1 a 4.
   - **Remover (extra):** cada miniatura tem "Remover", que pede um segundo toque. A remoção só vale enquanto a conferência está aberta e só para quem está com a trava (as mesmas regras do envio). No servidor, a evidência `EXTRA` é apagada, com o arquivo e o evento no histórico. Fotos 1 a 4 e o Vídeo de Prova **não** podem ser removidos por aqui.
   - **Limite:** até **6** fotos `EXTRA` por unidade. O servidor recusa a 7ª com uma mensagem clara, e a tela esconde o botão ao chegar em 6.
2. **Opcional:** não muda o que é exigido para concluir a conferência.
3. **Contestação do ML:** a pré-seleção das até 10 fotos (`fotosParaContestacao`, `src/modules/mercado-livre/resultado.ts`) põe **as Fotos 1 a 4 primeiro** e só depois as `EXTRA`, em vez da ordem alfabética de hoje, em que "EXTRA" vem antes de "FOTO_".

## O que não muda
- Fotos 1 a 4, Vídeo de Prova, campos S/N, lote e validade, e o destino.
- O detalhe da devolução já lista as `EXTRA` com o rótulo "Extra · Unidade N".
- Nenhuma migração nova, a não ser que a remoção precise de um evento novo no histórico. Nesse caso, a chave nova usa o prefixo `evidencia_` em `rotulos/conferencia.ts`.

## Restrições
- Celular primeiro: 390×844, sem rolagem lateral; miniaturas em grade que quebra de linha; alvos de 44 px ou mais (o "Remover" incluído); erro em `role="alert"` com foco; progresso com `role="progressbar"`.
- A fila offline não pode perder nem duplicar uma foto extra. Remover uma foto que ainda está na fila tira ela da fila, sem enviar.
- Testes: unidade (o componente da lista de extras: adicionar, mostrar o progresso, segundo toque para remover, esconder o botão em 6; a ordem da pré-seleção da contestação), integração (o limite de 6 no servidor; a remoção só com a trava e só de `EXTRA`; o evento de remoção no histórico) e e2e (nos projetos `computador` e `celular`: tirar 2 fotos de avaria com a câmera falsa, remover 1, concluir e ver 1 "Extra · Unidade 1" no detalhe).

## Abordagens consideradas
- **Um bloco de lista por unidade (escolhida):** a avaria é de uma unidade, e a foto fica junto dela.
- **Um bloco único para a devolução inteira:** perde o vínculo com a unidade, o que atrapalha a contestação e os lotes.
- **Fotos 5, 6, 7 fixas:** limita e polui a tela de quem não tem avaria.
