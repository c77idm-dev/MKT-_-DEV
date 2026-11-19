# Catálogo do ML no cadastro de produtos (extra)

Data: 19/11/2026. Pedido do usuário: "buscar o catálogo inteiro das empresas". Vale junto com:
- a spec da integração ([2026-11-18-integracao-bitbrain-design.md](2026-11-18-integracao-bitbrain-design.md));
- a branch `produtos-do-ml`, em construção. Este desenho fica **por cima** dela.

Tudo aqui é **(extra)**: o PDF não fala de catálogo do ML. O contrato da rota está em [../../integracao/bitbrain-rota-catalogo.md](../../integracao/bitbrain-rota-catalogo.md).

## 1. O que faz
- Traz para `produtos` **todos os anúncios ativos e pausados** das contas marcadas em Configurações › Mercado Livre (`recebe_devolucoes` e `disponivel`), e não só os que aparecem nas devoluções.
- Cada produto ganha o título (vira a descrição), o EAN, a foto e o id do anúncio, pela **função de produtos-do-ml**. O fornecedor fica vazio, porque o ML não tem fornecedor.
- **Nunca sobrescreve o que as pessoas preencheram:**
  - só completa `foto_url`, `ean` e `ml_item_id` que estiverem vazios;
  - não mexe em descrição, fornecedor, NCM, custo nem unidade.

## 2. Decisões
| # | Decisão |
|---|---|
| K1 | **Leitura:** a busca `scan` dos anúncios do vendedor (`limit=100` na 1ª página) e a leitura em lote de 20 (`/items/bulk`; o ML pediu a migração do `/items?ids=` para ele até 25/10/2026). São as mesmas chamadas no modo `bitbrain`, pela rota, e no modo `api`, direto no ML. |
| K2 | **Ativos e pausados**, em duas buscas (`status=active` e `status=paused`), para não depender do padrão do ML. Os encerrados (`closed`) ficam fora: são anúncios mortos, e os que ainda aparecem em devoluções já entram por produtos-do-ml. |
| K3 | **Um produto por SKU**, na mesma ordem do `skuDoPedido`, para o SKU casar com o da devolução. **Com variações**, um produto por variação: `SELLER_SKU` da variação, senão `seller_custom_field` da variação. **Sem variações:** `SELLER_SKU` do anúncio, senão `seller_custom_field`. Sem SKU: pula e conta. O SKU passa por `normalizarSku`; acima de 60 caracteres, conta como erro. |
| K4 | **Reuso.** A extração (título, GTIN, foto, MLB; hoje `produtoDoAnuncio`) e a gravação, que cria ou só completa (hoje `cadastrarProdutosDosAnuncios`), são **as de produtos-do-ml**. Não há regra nova de produto aqui. |
| K5 | **Tarefa nova `ml.catalogo`** (emenda E23 ao contrato §5.1; a E22 é de produtos-do-ml), uma por conta. A fila roda uma de cada vez (`localConcurrency: 1`). A linha da conta impede pedir de novo enquanto ela está na fila ou rodando, no pedido do Gestor e na semanal. |
| K6 | **Ritmo:** no máximo 1 chamada por segundo por conta, ou 60/min, metade do `DEVOLUCOES_RPM`. A cota do ML é por aplicação (a do Bitbrain), e o catálogo roda uma conta por vez. A varredura das devoluções continua com folga. |
| K7 | **Retomar é recomeçar.** O `scroll_id` vence em 5 min, então a nova tentativa recomeça a busca. Cada busca vai até o fim antes da primeira leitura em lote, para o scroll nunca ficar parado. A gravação é idempotente: o que já foi feito passa sem mudança. |
| K8 | **Gatilhos:** o botão do Gestor **"Importar catálogo do ML"** (extra), em Cadastros › Produtos, e a reimportação semanal (extra), segunda às 4h, só das contas que o Gestor já importou uma vez. |
| K9 | **A situação de cada conta** fica numa tabela pequena (migração `0016`), só com a última execução. Sem histórico. |

## 3. Leituras novas no `ConectorML`
Valem nos modos `api` e `bitbrain`; só o transporte (`ClienteML`) muda.
- **`buscarAnunciosDaConta(status: 'active' | 'paused'): Promise<{ ids: string[]; total: number }>`** esgota o scroll só com buscas, sem nenhuma outra chamada entre as páginas:
  - a 1ª chamada é `GET /users/{seller}/items/search?search_type=scan&limit=100&status=<status>`;
  - as seguintes repetem `search_type` e `status`, com `scroll_id=<último>` codificado e **sem `limit`** (o FAQ do 429 não aceita `limit` com `scroll_id`);
  - termina quando `results` vem vazio ou o `scroll_id` vem nulo. Não para só porque a soma chegou ao `total`: o FAQ pede consumir o scroll até o fim;
  - guarda os ids num `Set`, sem repetir; o `total` é o `paging.total` da 1ª página;
  - trava: no máximo `ceil(total/50) + 2` páginas, porque 50 é o menor tamanho de página da doc. Se passar da trava sem o fim, lança `ErroBuscaSemFim`;
  - o zod lê `results` (ids `MLB…`), `paging.total` e `scroll_id`.
- **`lerAnunciosEmLote(ids: string[]): Promise<{ anuncios: AnuncioJson[]; falhas: number }>`:**
  - tira os ids repetidos antes de chamar (a rota recusa id repetido com 403); mais de 20 ids distintos lança;
  - `GET /items/bulk?ids=<ids>&include_attributes=all&attributes=body.id,body.title,body.status,body.pictures,body.secure_thumbnail,body.attributes,body.variations,body.seller_custom_field`;
  - a resposta é `[{ id, status_code, body }]`; aceita também `code`, do formato antigo;
  - um `status_code` diferente de 200 conta em `falhas`;
  - o `body` passa pelo esquema do anúncio de produtos-do-ml.
- **Leitura do anúncio das devoluções** (`obterReclamacao`, de produtos-do-ml): passa a ser `/items/{id}?include_attributes=all`, para as variações trazerem o `SELLER_SKU` e o GTIN. É o uso da mudança B do contrato, e só vai para a VPS depois que o Bitbrain publicar o adendo.
- **Erros:** seguem o `ClienteML` de hoje. O 429 espera e tenta de novo; o 401, o 403 e o 404 da rota viram `ErroBitbrain`.

## 4. Do anúncio ao produto
- Uma função pura, `produtosDoAnuncio(anuncio) → { itens: { sku, variacaoId }[]; semSku; invalidos }`.
- Cada item passa pela extração de produtos-do-ml com `(anuncio, variacaoId)` e vai para a gravação. Ela já devolve as listas `criados` e `completados`, e o catálogo conta pelo tamanho delas. Duas mudanças na gravação:
  - a `origem` passa a ser `{ reclamacaoId } | { catalogo: conta }`, e o evento grava a origem certa;
  - ela devolve também `semTitulo`, o SKU novo que ela pula porque o anúncio não tem título. Conta em `erros`.

| Anúncio | Produtos | Contagem |
|---|---|---|
| sem variações, `SELLER_SKU` `FONE-01` | `FONE-01` | criado ou completado |
| 3 variações, 2 com SKU | 2 | +1 sem SKU |
| sem nenhum SKU | 0 | +1 sem SKU |
| `status_code` 404 no lote | 0 | +1 erro |
| SKU novo, anúncio sem título | 0 | +1 erro |

## 5. Tarefa `ml.catalogo`
- **Dados:** `{ conta?: string; pedidaEm?: string }`.
  - Com `conta`, importa essa conta: a `empresa` no modo `bitbrain`, ou `'api'` no modo `api`. O `pedidaEm` vem junto: é o `pedida_em` gravado na linha pelo pedido (ISO).
  - Sem `conta` (a agenda semanal), pede uma importação por conta já importada que continua marcada, pela **mesma função de trava** do pedido do Gestor: conta `NA_FILA` ou `RODANDO` não ganha outra tarefa.
- **Configuração:** 5 tentativas (spec §11), `expiraEmSegundos: 7200` e agenda `0 4 * * 1`.
- **Passos:**
  1. se a linha da conta já for de outro pedido (`pedida_em` diferente do `pedidaEm`), termina sem fazer nada; senão, marca `RODANDO`;
  2. busca todos os ids ativos e depois os pausados, só com buscas (1/s; 10 mil ≈ 100 s), sem ler lotes entre as páginas; grava o `total` (soma dos `paging.total`) quando as buscas terminam;
  3. tira os ids repetidos entre as duas buscas. Se sobrarem menos ids que o `total`, a diferença conta em `erros`;
  4. depois, lê esses ids em lotes de 20; grava cada lote numa transação e atualiza a linha;
  5. marca como `CONCLUIDA`.
- **Toda escrita na linha filtra pelo `pedida_em`.** Assim, a tarefa antiga que o pg-boss devolve depois de o worker cair (até expirar, em 2 h) nunca mexe na linha de um pedido novo.
- **Contadores:**
  - `total` (soma dos `paging.total`), `lidos` (ids lidos nos lotes), `criados`, `completados`, `sem_sku` e `erros`;
  - numa nova tentativa da mesma execução, o `total` volta a nulo e `lidos`, `sem_sku` e `erros` voltam a zero;
  - `criados` e `completados` continuam, porque cada produto só é criado ou completado uma vez.

## 6. Tela (celular primeiro)
- **Em Cadastros › Produtos, só o Gestor vê:** um cartão-link "Catálogo do Mercado Livre", com o resumo da última importação. Ele leva a `/cadastros/produtos/catalogo-ml`.
- **A página tem:**
  - o título (`h1`) "Catálogo do Mercado Livre";
  - uma linha de explicação: "Cadastra os produtos dos anúncios ativos e pausados das contas marcadas, com título, EAN e foto. Não muda o que já foi preenchido.";
  - o botão **"Importar catálogo do ML"**, de 56 px e largura total no celular;
  - um cartão por conta (`article` com o nome da conta), com:
    - **situação:** "Ainda não importado", "Na fila", "Importando: buscando os anúncios" (sem `total` ainda), "Importando: 340 de 1.200 anúncios", "Concluída em 19/11 às 14:32" ou "Erro: …";
    - **resultado:** "12 criados · 3 completados · 2 sem SKU · 0 erros".
  - **Singular e plural:** "1 criado", "1 completado", "1 erro", "de 1 anúncio" e "para 1 conta"; com outro número, o plural. "sem SKU" não muda.
- **Enquanto alguma conta está na fila ou rodando,** a página se atualiza sozinha a cada 5 s. Usa o `AtualizarEnquantoProcessa`, com um texto próprio.
- **Mensagens ao pedir (`role="status"`):**
  - "Importação pedida para 1 conta." ou "Importação pedida para N contas.";
  - se todas já estavam rodando: "Já tem importação em andamento.";
  - sem conta marcada: "Nenhuma conta marcada. Marque em Configurações › Mercado Livre.", com o link.
- **Conta parada:** "Importando" sem avançar há mais de 30 min (o worker caiu) aparece como "Erro: A importação parou. Toque em Importar de novo.", e o botão volta a valer para essa conta. Se a tarefa antiga voltar depois, ela termina sem fazer nada (§5, passo 1).
- **Histórico:** o evento `ml_catalogo_pedido` (entidade `catalogo_ml`, id = conta) guarda quem pediu.

## 7. Erros
| Situação | O que acontece | Mensagem na conta |
|---|---|---|
| 403 da rota (`caminho não permitido`) | para, sem nova tentativa | "A rota do Bitbrain recusou a leitura do catálogo (adendo não publicado ou pedido fora do contrato)." |
| 404 da rota (empresa sem conta) | para; a conta fica indisponível (D21) | a do `ErroBitbrain` |
| 401 da rota | para | "Bitbrain recusou: confira o BITBRAIN_TOKEN (HTTP 401)." |
| 403 ou 404 do ML na busca | para | "O Mercado Livre recusou a lista de anúncios desta conta (HTTP n)." |
| a busca passa da trava sem chegar ao fim | para, sem nova tentativa | "A lista de anúncios do ML não terminou." |
| 429 | o cliente espera (até 60 s, 3 vezes); se continuar, a tarefa tenta de novo | — |
| 5xx, rede ou scroll vencido | tenta de novo, até 5 vezes; na última, `ERRO` e vai para Falhas | "O Mercado Livre não respondeu. Tente de novo mais tarde." |
| resposta fora do formato | para | "O Mercado Livre respondeu fora do formato esperado." |
| a busca termina com menos ids que o `total` | segue até `CONCLUIDA`; a diferença conta em `erros` | — |
| anúncio diferente de 200 no lote | segue e conta em `erros` | — |

- Uma conta que falha não para as outras, porque cada conta é uma tarefa.
- Os logs seguem a regra de hoje: conta, caminho sem a query e código. Num 403 da rota, também o tamanho do caminho com a query, sem os valores, para separar o adendo que falta de um pedido fora do contrato.

## 8. Modo `api` (`ML_CONECTOR=api`)
- Usa o `obterConectorML(db)` da conta `ATIVA`: as mesmas chamadas, direto no ML, com o token renovado como hoje e o mesmo ritmo.
- A tela mostra um cartão só, "Conta do Mercado Livre". Sem conta `ATIVA`, o cartão-link não aparece.

## 9. Falsos e testes
- **ML falso:** `tests/fixtures/ml-falso/catalogo.json`, do vendedor `123456789` (a Loja Falsa 1), com 5 anúncios `MLB8…`:
  - um com SKU e GTIN;
  - um com 2 variações, cada uma com SKU;
  - um sem SKU;
  - um pausado, só com `seller_custom_field`;
  - um que o lote devolve com 404.
  - A busca anda de 2 em 2, para exercitar o scroll, e o `scroll_id` tem `=` e `:`.
  - O `/items/{id}` aceita `?include_attributes=all`.
- **Bitbrain falso:**
  - a lista fechada com o 13, o 14 e o `include_attributes=all` no 8, igual ao contrato;
  - a `loja-falsa-2` responde 403 no 13 e no 14, como a rota antes do adendo;
  - o envio passa a manter `logistic`.
- **Unidade:** as leituras novas (com a trava e os ids repetidos), `produtosDoAnuncio`, os falsos e o ritmo.
- **Integração:**
  - importar a Loja Falsa 1;
  - produto existente só completado;
  - rodar de novo sem mudar nada;
  - a Loja Falsa 2 com a mensagem da rota;
  - 5xx com nova tentativa;
  - a busca sem fim (trava) dá `ERRO`;
  - pedir duas vezes;
  - a tarefa antiga não mexe no pedido novo;
  - a semanal;
  - o modo `api`.
- **e2e:**
  - o Gestor importa e vê as duas contas;
  - o produto novo aparece com a foto;
  - o Fiscal não vê o botão;
  - nos projetos `computador` e `celular`, nos dois modos.

## 10. Suposições (conferir na conferência ao vivo do Bitbrain ou na 1ª importação real)
- **S1.** As páginas seguintes vão sem `limit` (o FAQ do 429 não aceita `limit` com `scroll_id`) e trazem 100, como a 1ª, ou 50, o padrão. A trava conta com 50, então os dois casos funcionam. A conferência (a) diz quantos ids vêm na 2ª página.
- **S2.** O `/items/bulk` aceita `include_attributes=all` (a doc só o mostra no `/items/{id}`) e traz `variations[].attributes` (`SELLER_SKU`, `GTIN`) e o `seller_custom_field`. Se o `attributes=` cortar os atributos das variações, tiramos o `attributes=`, porque a rota aceita sem ele. A extração de produtos-do-ml já procura o código de barras em `GTIN` e `EAN`; se a (b) mostrar outro id (ex.: `UPC`), acrescentamos lá.
- **S3.** O `status` vale na busca `scan`, também nas páginas seguintes, que o repetem. A (b) conta quantos vêm `active`.
- **S4.** O volume é de alguns milhares de anúncios por conta: cerca de 3 min para 3.000 anúncios. A (a) traz o maior total. Só acima de ~25 mil por status a busca passaria de 5 min, se o prazo do scroll contar da criação.
- **S5.** O `/items/bulk` aceita 20 ids por chamada (a doc só dá o máximo do endpoint antigo). Se recusar, o lote diminui só do nosso lado; a rota aceita de 1 a 20.

## 11. Fora deste passo
- Anúncios encerrados, estoque, preço, atualizar a descrição e o fornecedor.
- Magalu e Shopee.
- **Notificações `items` do ML.** A doc diz que a busca não substitui essas notificações. Ficam para depois, se a reimportação semanal não bastar.
