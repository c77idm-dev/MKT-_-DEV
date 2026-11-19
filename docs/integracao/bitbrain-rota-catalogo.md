# Rota do Bitbrain: adendo do catálogo (contrato)

Data: 19/11/2026. Complementa o contrato [bitbrain-rota-devolucoes.md](bitbrain-rota-devolucoes.md). O lado do sistema de devoluções está em [../superpowers/specs/2026-11-19-catalogo-ml-design.md](../superpowers/specs/2026-11-19-catalogo-ml-design.md).

**Quem constrói:** a sessão do Claude Code aberta na pasta do Bitbrain, seguindo o `CLAUDE.md` de lá. **Quem publica:** o Nathan. O sistema de devoluções **não mexe** no código do Bitbrain.

## Por que
O usuário quer cadastrar o **catálogo inteiro** das contas do ML (título, EAN e foto), e não só os anúncios que aparecem nas devoluções. Hoje a lista fechada só lê um anúncio por vez (`/items/{id}`) e não tem a busca dos anúncios do vendedor.

## O que muda na rota `/integracao/devolucoes/ml`
Tudo o que já vale continua: só GET; `CaminhoRecusado` dá 403 sem chamar o ML; `{seller}` igual ao vendedor da empresa; cada parâmetro uma vez (também `ids`, `attributes` e `include_attributes`); mesmo limite `DEVOLUCOES_RPM`; mesmo registro.

| # | Mudança |
|---|---|
| A | `/shipments/{id}`: manter também `logistic` só com `mode`, `type` e `direction`. É o adendo de 18/11, que ainda não foi feito (`_ENVIO` não tem `logistic`). Sem ele, o selo Full não funciona. |
| B | Caminho 8, `/items/MLB…`: aceita **um** parâmetro opcional, `include_attributes=all` (só esse valor). O sistema passa a mandá-lo na leitura do anúncio das devoluções: sem ele, as variações vêm sem o SKU e o GTIN. |
| C | Caminho 13 novo: `/users/{seller}/items/search` (busca `scan`). |
| D | Caminho 14 novo: `/items/bulk` (leitura em lote, até 20). |
| E | Tamanho máximo do caminho: de 500 para **2.000** caracteres, depois da decodificação. O `scroll_id` e os 20 ids com a lista de campos passam perto de 500. As outras regras de formato não mudam (sem `%`, `..`, `//`, `\`, `#`, espaço nem controle no caminho). |

### C. Caminho 13: `/users/{seller}/items/search` (nome `anuncios_do_vendedor`)
| Parâmetro | Obrigatório | Valor aceito |
|---|---|---|
| `search_type` | sim | `scan` |
| `scroll_id` | não | o valor inteiro casa com `[A-Za-z0-9+/=:._-]{1,1500}` |
| `limit` | não | 1 a 100, só dígitos ASCII |
| `status` | não | `active` ou `paused` |

- Qualquer outro parâmetro dá 403 (`offset`, `q`, `sku`, `seller_sku`, `orders`, `include_filters`…).
- O sistema manda `limit=100` só na 1ª página. As seguintes repetem `search_type` e `status`, com o `scroll_id` e sem `limit`.
- Resposta do ML, vai como veio. Formato esperado, montado a partir da doc (os exemplos dela são da busca sem `scan`); o real sai da conferência (a):
  ```json
  {"seller_id": "123456789", "query": null, "paging": {"limit": 100, "offset": 0, "total": 1234},
   "results": ["MLB1234567890", "…"], "scroll_id": "YXBpY29yZS1pdGVtcw==:ZHMtYXBp…==", "orders": […], "available_orders": […]}
  ```

### D. Caminho 14: `/items/bulk` (nome `anuncios_em_lote`)
| Parâmetro | Obrigatório | Valor aceito |
|---|---|---|
| `ids` | sim | 1 a 20 ids `MLB[0-9]{1,20}`, separados por vírgula, sem repetir e sem elemento vazio |
| `attributes` | não | lista separada por vírgula, sem elemento vazio, só destes: `body.id`, `body.title`, `body.status`, `body.pictures`, `body.secure_thumbnail`, `body.attributes`, `body.variations`, `body.seller_custom_field` |
| `include_attributes` | não | `all` |

- É o substituto do `/items?ids=`. O ML pediu a migração até 25/10/2026, e o `/items?ids=` **continua fora** da lista.
- Resposta, vai como veio: `[{"id": "MLB…", "status_code": 200, "body": {…}}, …]`.
- Anúncio não tem dado de pessoa. Os caminhos 13 e 14 não passam por `LIMPEZA`.

### O que a documentação do ML diz (conferido em 19/11)
- **Busca `scan`** ([Itens e buscas](https://developers.mercadolivre.com.br/pt_br/itens-e-buscas), atualizada em 31/08/2026):
  - serve para passar de 1.000 anúncios;
  - não usa `offset`;
  - a resposta traz um `scroll_id`, que vence em **5 minutos**;
  - as páginas seguintes repetem a chamada com o `scroll_id`;
  - no fim, ele vem nulo;
  - por padrão vêm 50 por página, e o máximo é 100.
- **Ritmo e cota** ([Rate limit / Erro 429](https://developers.mercadolivre.com.br/pt_br/rate-limit-erro-429)):
  - consumir o scroll sem parar e até o fim, dentro da validade;
  - não mandar `limit` junto com o `scroll_id`;
  - um scroll deixado aberto dá 429;
  - a cota é por aplicação (Client ID) e por endpoint.
- **Leitura em lote** (página de itens):
  - no máximo 20 por chamada (a doc diz isso só na seção Multiget, do `/items?ids=`; para o `/items/bulk` é suposição, conferida na (b));
  - `code` virou `status_code`;
  - `id` vem na raiz;
  - os campos levam o prefixo `body.`.
- **Variações** ([Variações](https://developers.mercadolivre.com.br/pt_br/variacoes)):
  - os `attributes` de cada variação (`SELLER_SKU`, `GTIN`) e o `seller_custom_field` só vêm com `include_attributes=all` (documentado só para `/items/{id}`; no `/items/bulk` é a pergunta (b), S2);
  - nos exemplos, o código de barras da variação vem em `EAN` ou `UPC`, e não só em `GTIN`;
  - o SKU certo é o atributo `SELLER_SKU`, e o `seller_custom_field` é de uso interno do vendedor.

## Ritmo e registro
- **Mesmo limite e mesmo contador por empresa** (`DEVOLUCOES_RPM`, 120/min). Nada novo no `.env`.
- **A cota do ML é por aplicação** (a do Bitbrain), a mesma das outras rotinas. Por isso o catálogo roda uma conta por vez, a no máximo 60/min (1 chamada por segundo, metade do limite), só quando o Gestor pede e, se ficar ligada, uma vez por semana (segunda, às 4h).
- **O sistema esgota o scroll antes de ler os lotes:** entre duas páginas da busca não há outra chamada.
- **Volume por conta:** de anúncios/100 a anúncios/50 buscas, mais anúncios/20 lotes. Exemplo: 3.000 anúncios dão de 30 a 60 + 150 = 180 a 210 chamadas.
- **Registro:** igual ao de hoje (empresa, caminho sem a query, código). O `scroll_id` e os ids nunca vão para o registro.

## Testes que o Bitbrain precisa acrescentar (`tests/test_integracao_devolucoes.py`)
- **`ListaFechadaTests`:**
  - `test_os_12_caminhos_passam` vira `…_14_…` e passa também com:
    - 13, primeira página (`search_type=scan&limit=100&status=active`);
    - 13, página seguinte (`search_type=scan&status=active&scroll_id=…`), com `scroll_id` que tem `==`, `:`, `+` e `/`;
    - 14 com 20 ids, `attributes` e `include_attributes=all`;
    - 8 com `include_attributes=all`.
  - Os parâmetros vão separados ao ML, e o `scroll_id` chega igual.
  - `test_fora_da_lista_403_sem_chamar_o_ml` ganha:
    - `/items?ids=MLB1`, `/items/bulk`, `/items/bulk?ids=`;
    - 21 ids, `ids=MLA1`, `ids=MLB1,MLB1`, `ids=MLB1,` e `ids` repetido (`ids=<20>&ids=<20>`);
    - `attributes=body.price`, `attributes=title`, `attributes=body.id,` e `attributes` repetido;
    - `include_attributes=x`;
    - no 8: `/items/MLB1?attributes=title` e `include_attributes=all&include_attributes=all`;
    - a busca do 13 sem `search_type`, com `search_type=normal`, `offset=0`, `status=closed`, `limit=0`, `limit=101`, `limit=١٠٠` (dígitos arábico-índicos, que o `int()` e o `isdigit()` do Python aceitam) e `q=x`;
    - `scroll_id` com caractere fora da lista no meio e **no fim** (terminando em `<`, que só o `fullmatch` pega);
    - `search_type` repetido.
  - `test_vendedor_de_outra_empresa_403` ganha `/users/{OUTRO}/items/search?search_type=scan`.
  - **Novo:** caminho com `scroll_id` de 1.500 caracteres passa; caminho com mais de 2.000 dá 403.
- **`DadosPessoaisTests`:**
  - `ENVIO_ML` ganha `"logistic": {"mode": "me2", "type": "fulfillment", "direction": "forward", "outro": "x"}`.
  - `test_envio_so_com_os_campos_da_lista` espera `logistic == {"mode", "type", "direction"}`, ainda sem nomes, telefones e endereços.
  - **Novo:** a resposta do 13 (objeto) e a do 14 (lista) saem como vieram.
- **`CodigoDoMLTests`:** **novo**, as chamadas do 13 e do 14 contam no mesmo limite da empresa (com `devolucoes_rpm=2`, a 3ª dá 429).
- **`RegistroTests`:** **novo**, o registro do 13 e do 14 sai sem a query: sem `scroll_id`, ids, token e `search_type`. O vendedor no caminho do 13 aparece no registro, como já acontece no 10 e no 12; o teste novo confere só essas ausências. Não mude `caminho_para_registro`.

## Conferência com o ML ao vivo (regra do Bitbrain)
Pedimos à sessão que, só lendo e com poucas chamadas, responda **só formatos e contagens**. Nunca dados de anúncio nem token. A busca `scan` roda numa conta só, que a aba Devoluções do Bitbrain também usa, e nenhum scroll fica aberto à toa.
1. **(a) Busca dos anúncios:**
   - **totais, sem abrir scroll:** em cada conta, a busca normal direto no ML, `/users/{seller}/items/search?status=active&limit=1` (sem `search_type`): o `paging.total`. Responder o maior. Na conta com **menos** ativos, também o total com `status=paused` e o total sem `status`;
   - **busca `scan`, nessa conta:**
     - 1ª página, `…/items/search?search_type=scan&limit=100&status=active`: o `paging.total`, se veio `scroll_id` e o tamanho dele, e quantos ids vieram;
     - 2ª página, `…?search_type=scan&status=active&scroll_id=<o da 1ª>` (sem `limit`): se responde 200 e quantos ids vieram;
     - com até 500 ativos, seguir até o fim e dizer quantas páginas foram e se o fim veio por `results` vazio ou `scroll_id` nulo. Com mais, parar na 2ª: é esperado o scroll vencer sozinho em 5 min.
2. **(b) Leitura em lote**, a chamada exata do sistema: `/items/bulk?ids=<20 ids da 1ª página da (a), pelo menos um com variações e um sem>&include_attributes=all&attributes=body.id,body.title,body.status,body.pictures,body.secure_thumbnail,body.attributes,body.variations,body.seller_custom_field`:
   - o código HTTP;
   - quantos elementos vieram e quantos trazem `id`, `status_code` 200 e `body`;
   - quantos têm `body.status` igual a `active`;
   - no anúncio sem variações, se o `attributes` traz `SELLER_SKU` e `GTIN`;
   - quantos trazem `pictures` e quantos trazem `secure_thumbnail`;
   - se o `seller_custom_field` vem no anúncio e em cada variação;
   - se as variações trazem `attributes` com `SELLER_SKU` e `GTIN`, e os ids dos atributos que aparecem nelas (só os ids, sem valores);
   - sem o `attributes=`, o que muda; e, sem o `include_attributes=all`, se as variações perdem os `attributes`.

Isso responde às suposições S1 a S5 da spec.

---

## Texto para colar na sessão do Claude Code do Bitbrain

> Abra o Claude Code na pasta do Bitbrain e cole o texto abaixo (depois do push da versão final). Ele **substitui** o "Adendo para colar agora" de [bitbrain-rota-devolucoes.md](bitbrain-rota-devolucoes.md), porque já traz o `logistic`.

```
Preciso de um adendo na rota /integracao/devolucoes/ml (a do sistema de gestão de devoluções, em
app/integracao_devolucoes/). Siga as regras do CLAUDE.md e do docs/estado-atual.md do bitbrain. Não mexa em outras
rotas nem na aba Devoluções. Não publique: quem publica é o Nathan.

O contrato do adendo está em:
C:\Users\idmpc\devolucoes-wt\catalogo\docs\integracao\bitbrain-rota-catalogo.md
Se não estiver neste computador, leia no GitHub (repositório c77idm-dev/MKT-_-DEV, branch catalogo-ml, caminho
docs/integracao/bitbrain-rota-catalogo.md):
https://raw.githubusercontent.com/c77idm-dev/MKT-_-DEV/catalogo-ml/docs/integracao/bitbrain-rota-catalogo.md
Leia o arquivo inteiro antes de começar.

O que já vale continua valendo: só GET; CaminhoRecusado = 403 sem chamar o ML; {seller} igual ao vendedor da
empresa; cada parâmetro uma vez (também ids, attributes e include_attributes); mesmo limite DEVOLUCOES_RPM e mesmo
contador; registro só com empresa, caminho sem a query e código.

1. /shipments/{id} (adendo de 18/11, ainda pendente): além dos campos de _ENVIO, mantenha o objeto `logistic` só com
   `mode`, `type` e `direction`. Com x-format-new: true o ML põe o tipo logístico (ex.: fulfillment) em logistic.type.
2. Caminho 8, /items/MLB…: passa a aceitar UM parâmetro opcional, include_attributes=all (só esse valor). Sem ele o ML
   não manda os attributes das variações (SELLER_SKU, GTIN) nem o seller_custom_field. O sistema passa a mandá-lo na
   leitura do anúncio das devoluções.
3. Caminho 13 (novo, "anuncios_do_vendedor"): /users/{seller}/items/search, só com:
   search_type=scan (obrigatório); scroll_id (opcional; o valor inteiro casa com [A-Za-z0-9+/=:._-]{1,1500});
   limit (opcional, 1 a 100, só dígitos ASCII); status (opcional, active ou paused). Qualquer outro parâmetro
   (offset, q, sku, orders, include_filters…) = 403. O sistema manda limit=100 só na 1ª página; as seguintes repetem
   search_type e status, com o scroll_id e sem limit.
4. Caminho 14 (novo, "anuncios_em_lote"): /items/bulk, só com:
   ids (obrigatório: 1 a 20 ids MLB[0-9]{1,20}, separados por vírgula, sem repetir e sem elemento vazio);
   attributes (opcional: lista separada por vírgula, sem elemento vazio, só destes: body.id, body.title, body.status,
   body.pictures, body.secure_thumbnail, body.attributes, body.variations, body.seller_custom_field);
   include_attributes (opcional: só all).
   É o substituto do /items?ids= (o ML pediu a migração até 25/10/2026); o /items?ids= continua fora da lista.
5. Tamanho máximo do caminho: de 500 para 2.000 caracteres (o scroll_id e os 20 ids passam perto de 500). O resto da
   checagem de formato não muda.
6. Anúncio não tem dado de pessoa: 13 e 14 vão como vieram (sem LIMPEZA). Os parâmetros vão separados ao ML, como na
   busca de reclamações.
7. Ritmo: a cota do ML é por aplicação (a do Bitbrain), a mesma das outras rotinas. O catálogo roda uma conta por
   vez, a no máximo 60/min, só quando o Gestor pede ou na segunda às 4h, e esgota o scroll antes de ler os lotes
   (de 180 a 210 chamadas para 3.000 anúncios).
8. Os testes da seção "Testes que o Bitbrain precisa acrescentar" do contrato, em tests/test_integracao_devolucoes.py.
   Atualize também a cópia do contrato em docs/integracao-devolucoes.md.

Conferência com o ML ao vivo (regra do bitbrain; só leitura, poucas chamadas, o scan numa conta só). Responda só
formatos e contagens, nunca dados de anúncio nem token:
a) Busca dos anúncios.
   - Totais, sem abrir scroll: em cada conta, a busca normal direto no ML,
     /users/{seller}/items/search?status=active&limit=1 (sem search_type): o paging.total. Responda o maior. Na conta
     com menos ativos, também o total com status=paused e o total sem status.
   - Busca scan nessa conta. 1ª página, ...?search_type=scan&limit=100&status=active: o paging.total, se veio
     scroll_id e o tamanho dele, e quantos ids vieram. 2ª página, ...?search_type=scan&status=active&scroll_id=<o da
     1ª> (sem limit): se responde 200 e quantos ids vieram. Com até 500 ativos, siga até o fim e diga quantas páginas
     foram e se o fim veio por results vazio ou scroll_id nulo; com mais, pare na 2ª (é esperado o scroll vencer
     sozinho em 5 min).
b) Leitura em lote, a chamada exata do sistema:
   /items/bulk?ids=<20 ids da 1ª página da (a), pelo menos um com variações e um sem>&include_attributes=all
   &attributes=body.id,body.title,body.status,body.pictures,body.secure_thumbnail,body.attributes,body.variations,
   body.seller_custom_field
   Responda: o código HTTP; quantos elementos vieram e quantos trazem id, status_code 200 e body; quantos têm
   body.status igual a active; no anúncio sem variações, se o attributes traz SELLER_SKU e GTIN; quantos trazem
   pictures e quantos trazem secure_thumbnail; se o seller_custom_field vem no anúncio e em cada variação; se as
   variações trazem attributes com SELLER_SKU e GTIN, e os ids dos atributos que aparecem nelas (só os ids, sem
   valores); sem o attributes=, o que muda; e, sem o include_attributes=all, se as variações perdem os attributes.

Quando terminar, me diga:
- o commit e o que o Nathan precisa fazer para publicar (cd ~/bitbrain-publicar && git pull --ff-only &&
  scripts/deploy.sh). Não há variável nova no .env;
- as respostas da conferência ao vivo (a e b).
```
