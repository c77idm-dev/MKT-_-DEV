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
| K1 | **Leitura:** a busca `scan` dos anúncios do vendedor (100 por página) e a leitura em lote de 20 (`/items/bulk`, que substitui o `/items?ids=` desde 25/10/2026). São as mesmas chamadas no modo `bitbrain`, pela rota, e no modo `api`, direto no ML. |
| K2 | **Ativos e pausados**, em duas buscas (`status=active` e `status=paused`), para não depender do padrão do ML. Os encerrados (`closed`) ficam fora: são anúncios mortos, e os que ainda aparecem em devoluções já entram por produtos-do-ml. |
| K3 | **Um produto por SKU**, na mesma ordem do `skuDoPedido`, para o SKU casar com o da devolução. **Com variações**, um produto por variação: `SELLER_SKU` da variação, senão `seller_custom_field` da variação. **Sem variações:** `SELLER_SKU` do anúncio, senão `seller_custom_field`. Sem SKU: pula e conta. O SKU passa por `normalizarSku`; acima de 60 caracteres, conta como erro. |
| K4 | **Reuso.** A extração (título, GTIN, foto, MLB) e a gravação, que cria ou só completa, são **a função de produtos-do-ml**. Não há regra nova de produto aqui. |
| K5 | **Tarefa nova `ml.catalogo`** (emenda E22 ao contrato §5.1), uma por conta. A fila roda uma de cada vez (`localConcurrency: 1`). A linha da conta impede pedir de novo enquanto ela está na fila ou rodando. |
| K6 | **Ritmo:** no máximo 1 chamada por segundo por conta, ou 60/min, metade do `DEVOLUCOES_RPM`. A varredura das devoluções continua com folga. |
| K7 | **Retomar é recomeçar.** O `scroll_id` vence em 5 min, então a nova tentativa recomeça a busca. A gravação é idempotente: o que já foi feito passa sem mudança. |
| K8 | **Gatilhos:** o botão do Gestor **"Importar catálogo do ML"** (extra), em Cadastros › Produtos, e a reimportação semanal (extra), segunda às 4h, só das contas que o Gestor já importou uma vez. |
| K9 | **A situação de cada conta** fica numa tabela pequena (migração `0016`), só com a última execução. Sem histórico. |

## 3. Leituras novas no `ConectorML`
Valem nos modos `api` e `bitbrain`; só o transporte (`ClienteML`) muda.
- **`buscarAnunciosDaConta(status: 'active' | 'paused'): AsyncGenerator<{ ids: string[]; total: number }>`:**
  - a 1ª chamada é `GET /users/{seller}/items/search?search_type=scan&limit=100&status=<status>`;
  - as seguintes são `?search_type=scan&scroll_id=<último>&limit=100`, com o `scroll_id` codificado;
  - para quando `results` vem vazio ou o `scroll_id` vem nulo;
  - trava de segurança: no máximo `ceil(total/100) + 2` páginas;
  - o zod lê `results` (ids `MLB…`), `paging.total` e `scroll_id`.
- **`lerAnunciosEmLote(ids: string[]): Promise<{ anuncios: AnuncioJson[]; falhas: number }>`, com no máximo 20 ids:**
  - `GET /items/bulk?ids=<ids>&include_attributes=all&attributes=body.id,body.title,body.status,body.pictures,body.secure_thumbnail,body.attributes,body.variations,body.seller_custom_field`;
  - a resposta é `[{ id, status_code, body }]`; aceita também `code`, do formato antigo;
  - um `status_code` diferente de 200 conta em `falhas`;
  - o `body` passa pelo esquema do anúncio de produtos-do-ml.
- **Erros:** seguem o `ClienteML` de hoje. O 429 espera e tenta de novo; o 401, o 403 e o 404 da rota viram `ErroBitbrain`.

## 4. Do anúncio ao produto
- Uma função pura, `produtosDoAnuncio(anuncio) → { itens: { sku, variacaoId }[]; semSku; invalidos }`.
- Cada item passa pela função de produtos-do-ml com `(anuncio, variacaoId)` e é gravado. A gravação devolve `criado`, `completado` ou `sem_mudanca`; se ainda não devolver, o plano acrescenta.

| Anúncio | Produtos | Contagem |
|---|---|---|
| sem variações, `SELLER_SKU` `FONE-01` | `FONE-01` | criado ou completado |
| 3 variações, 2 com SKU | 2 | +1 sem SKU |
| sem nenhum SKU | 0 | +1 sem SKU |
| `status_code` 404 no lote | 0 | +1 erro |

## 5. Tarefa `ml.catalogo`
- **Dados:** `{ conta?: string }`.
  - Com `conta`, importa essa conta: a `empresa` no modo `bitbrain`, ou `'api'` no modo `api`.
  - Sem `conta` (a agenda semanal), enfileira uma tarefa por conta já importada que continua marcada.
- **Configuração:** 5 tentativas (spec §11), `expiraEmSegundos: 7200` e agenda `0 4 * * 1`.
- **Passos:**
  1. marca a conta como `RODANDO`;
  2. busca os ativos;
  3. lê em lotes de 20; grava cada lote numa transação e atualiza a linha;
  4. busca os pausados, da mesma forma;
  5. marca como `CONCLUIDA`.
- **Contadores:**
  - `total` (soma dos `paging.total`), `lidos`, `criados`, `completados`, `sem_sku` e `erros`;
  - numa nova tentativa da mesma execução, `lidos`, `sem_sku` e `erros` voltam a zero;
  - `criados` e `completados` continuam, porque cada produto só é criado ou completado uma vez.

## 6. Tela (celular primeiro)
- **Em Cadastros › Produtos, só o Gestor vê:** um cartão-link "Catálogo do Mercado Livre", com o resumo da última importação. Ele leva a `/cadastros/produtos/catalogo-ml`.
- **A página tem:**
  - o título (`h1`) "Catálogo do Mercado Livre";
  - uma linha de explicação: "Cadastra os produtos dos anúncios ativos e pausados das contas marcadas, com título, EAN e foto. Não muda o que já foi preenchido.";
  - o botão **"Importar catálogo do ML"**, de 56 px e largura total no celular;
  - um cartão por conta (`article` com o nome da conta), com:
    - **situação:** "Ainda não importado", "Na fila", "Importando: 340 de 1.200 anúncios", "Concluída em 19/11 às 14:32" ou "Erro: …";
    - **resultado:** "12 criados · 3 completados · 2 sem SKU · 0 erros".
- **Enquanto alguma conta está na fila ou rodando,** a página se atualiza sozinha a cada 5 s. Usa o `AtualizarEnquantoProcessa`, com um texto próprio.
- **Mensagens ao pedir (`role="status"`):**
  - "Importação pedida para N contas.";
  - se todas já estavam rodando: "Já tem importação em andamento.";
  - sem conta marcada: "Nenhuma conta marcada. Marque em Configurações › Mercado Livre.", com o link.
- **Conta parada:** "Importando" sem avançar há mais de 30 min (o worker caiu) aparece como "Erro: A importação parou. Toque em Importar de novo.", e o botão volta a valer para essa conta.
- **Histórico:** o evento `ml_catalogo_pedido` (entidade `catalogo_ml`, id = conta) guarda quem pediu.

## 7. Erros
| Situação | O que acontece | Mensagem na conta |
|---|---|---|
| 403 da rota (`caminho não permitido`) | para, sem nova tentativa | "A rota do Bitbrain ainda não libera o catálogo (falta publicar o adendo)." |
| 404 da rota (empresa sem conta) | para; a conta fica indisponível (D21) | a do `ErroBitbrain` |
| 401 da rota | para | "Bitbrain recusou: confira o BITBRAIN_TOKEN (HTTP 401)." |
| 403 ou 404 do ML na busca | para | "O Mercado Livre recusou a lista de anúncios desta conta (HTTP n)." |
| 429 | o cliente espera (até 60 s, 3 vezes); se continuar, a tarefa tenta de novo | — |
| 5xx, rede ou scroll vencido | tenta de novo, até 5 vezes; na última, `ERRO` e vai para Falhas | "O Mercado Livre não respondeu. Tente de novo mais tarde." |
| resposta fora do formato | para | "O Mercado Livre respondeu fora do formato esperado." |
| anúncio diferente de 200 no lote | segue e conta em `erros` | — |

- Uma conta que falha não para as outras, porque cada conta é uma tarefa.
- Os logs seguem a regra de hoje: conta, caminho sem a query e código.

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
- **Bitbrain falso:**
  - a lista fechada com o 13, o 14 e o `include_attributes=all` no 8, igual ao contrato;
  - a `loja-falsa-2` responde 403 no 13 e no 14, como a rota antes do adendo;
  - o envio passa a manter `logistic`.
- **Unidade:** as leituras novas, `produtosDoAnuncio`, os falsos e o ritmo.
- **Integração:**
  - importar a Loja Falsa 1;
  - produto existente só completado;
  - rodar de novo sem mudar nada;
  - a Loja Falsa 2 com a mensagem da rota;
  - 5xx com nova tentativa;
  - pedir duas vezes;
  - a semanal;
  - o modo `api`.
- **e2e:**
  - o Gestor importa e vê as duas contas;
  - o produto novo aparece com a foto;
  - o Fiscal não vê o botão;
  - nos projetos `computador` e `celular`, nos dois modos.

## 10. Suposições (conferir na conferência ao vivo do Bitbrain ou na 1ª importação real)
- **S1.** `limit=100` vale junto com `scroll_id`, como diz a doc de itens. Se o ML recusar (400), as páginas seguintes vão sem `limit`, com 50 por página. A mudança é só do nosso lado.
- **S2.** O `/items/bulk` aceita `include_attributes=all` e traz `variations[].attributes` (`SELLER_SKU`, `GTIN`) e o `seller_custom_field`. Se o `attributes=` cortar os atributos das variações, tiramos o `attributes=`, porque a rota aceita sem ele.
- **S3.** O `status` vale na busca `scan`.
- **S4.** O volume é de alguns milhares de anúncios por conta: cerca de 3 min para 3.000 anúncios.

## 11. Fora deste passo
- Anúncios encerrados, estoque, preço, atualizar a descrição e o fornecedor.
- Magalu e Shopee.
- **Notificações `items` do ML.** A doc diz que a busca não substitui essas notificações. Ficam para depois, se a reimportação semanal não bastar.
