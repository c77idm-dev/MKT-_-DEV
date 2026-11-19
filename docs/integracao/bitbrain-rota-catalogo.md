# Rota do Bitbrain: adendo do catálogo (contrato)

Data: 19/11/2026. Complementa o contrato [bitbrain-rota-devolucoes.md](bitbrain-rota-devolucoes.md). O lado do sistema de devoluções está em [../superpowers/specs/2026-11-19-catalogo-ml-design.md](../superpowers/specs/2026-11-19-catalogo-ml-design.md).

**Quem constrói:** a sessão do Claude Code aberta na pasta do Bitbrain, seguindo o `CLAUDE.md` de lá. **Quem publica:** o Nathan. O sistema de devoluções **não mexe** no código do Bitbrain.

## Por que
O usuário quer cadastrar o **catálogo inteiro** das contas do ML (título, EAN e foto), e não só os anúncios que aparecem nas devoluções. Hoje a lista fechada só lê um anúncio por vez (`/items/{id}`) e não tem a busca dos anúncios do vendedor.

## O que muda na rota `/integracao/devolucoes/ml`
Tudo o que já vale continua: só GET; `CaminhoRecusado` dá 403 sem chamar o ML; `{seller}` igual ao vendedor da empresa; cada parâmetro uma vez; mesmo limite `DEVOLUCOES_RPM`; mesmo registro.

| # | Mudança |
|---|---|
| A | `/shipments/{id}`: manter também `logistic` só com `mode`, `type` e `direction`. É o adendo de 18/11, que ainda não foi feito (`_ENVIO` não tem `logistic`). Sem ele, o selo Full não funciona. |
| B | Caminho 8, `/items/MLB…`: aceita **um** parâmetro opcional, `include_attributes=all` (só esse valor). |
| C | Caminho 13 novo: `/users/{seller}/items/search` (busca `scan`). |
| D | Caminho 14 novo: `/items/bulk` (leitura em lote, até 20). |
| E | Tamanho máximo do caminho: de 500 para **2.000** caracteres, depois da decodificação. O `scroll_id` e os 20 ids com a lista de campos passam perto de 500. As outras regras de formato não mudam (sem `%`, `..`, `//`, `\`, `#`, espaço nem controle no caminho). |

### C. Caminho 13: `/users/{seller}/items/search` (nome `anuncios_do_vendedor`)
| Parâmetro | Obrigatório | Valor aceito |
|---|---|---|
| `search_type` | sim | `scan` |
| `scroll_id` | não | `[A-Za-z0-9+/=:._-]{1,1500}` |
| `limit` | não | 1 a 100 |
| `status` | não | `active` ou `paused` |

- Qualquer outro parâmetro dá 403 (`offset`, `q`, `sku`, `seller_sku`, `orders`, `include_filters`…).
- Resposta do ML (exemplo da documentação), vai como veio:
  ```json
  {"seller_id": "123456789", "query": null, "paging": {"limit": 100, "offset": 0, "total": 1234},
   "results": ["MLB1234567890", "…"], "scroll_id": "YXBpY29yZS1pdGVtcw==:ZHMtYXBp…==", "orders": […]}
  ```

### D. Caminho 14: `/items/bulk` (nome `anuncios_em_lote`)
| Parâmetro | Obrigatório | Valor aceito |
|---|---|---|
| `ids` | sim | 1 a 20 ids `MLB[0-9]{1,20}`, separados por vírgula, sem repetir |
| `attributes` | não | lista separada por vírgula, só destes: `body.id`, `body.title`, `body.status`, `body.pictures`, `body.secure_thumbnail`, `body.attributes`, `body.variations`, `body.seller_custom_field` |
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
- **Ritmo** ([Rate limit / Erro 429](https://developers.mercadolivre.com.br/pt_br/rate-limit-erro-429)):
  - consumir o scroll sem parar, dentro da validade;
  - um scroll deixado aberto dá 429.
- **Leitura em lote** (mesma página):
  - no máximo 20 por chamada;
  - `code` virou `status_code`;
  - `id` vem na raiz;
  - os campos levam o prefixo `body.`.
- **Variações** ([Variações](https://developers.mercadolivre.com.br/pt_br/variacoes)):
  - os `attributes` de cada variação (`SELLER_SKU`, `GTIN`) e o `seller_custom_field` só vêm com `include_attributes=all`;
  - o SKU certo é o atributo `SELLER_SKU`, e o `seller_custom_field` é de uso interno do vendedor.

## Ritmo e registro
- **Mesmo limite e mesmo contador por empresa** (`DEVOLUCOES_RPM`, 120/min). Nada novo no `.env`.
- **Volume por conta:** cerca de anúncios/100 buscas + anúncios/20 lotes. Exemplo: 3.000 anúncios dão 30 + 150 = 180 chamadas.
- **O sistema se limita** a 1 chamada por segundo por empresa (60/min, metade do limite).
- **Quando roda:** só quando o Gestor pede e, se ficar ligada, uma vez por semana (segunda, às 4h).
- **Registro:** igual ao de hoje (empresa, caminho sem a query, código). O `scroll_id` e os ids nunca vão para o registro.

## Testes que o Bitbrain precisa acrescentar (`tests/test_integracao_devolucoes.py`)
- **`ListaFechadaTests`:**
  - `test_os_12_caminhos_passam` vira `…_14_…` e passa também com:
    - 13, primeira página (`search_type=scan&limit=100&status=active`);
    - 13 com `scroll_id` que tem `==`, `:`, `+` e `/`;
    - 14 com 20 ids, `attributes` e `include_attributes=all`;
    - 8 com `include_attributes=all`.
  - Os parâmetros vão separados ao ML, e o `scroll_id` chega igual.
  - `test_fora_da_lista_403_sem_chamar_o_ml` ganha:
    - `/items?ids=MLB1`, `/items/bulk`, `/items/bulk?ids=`;
    - 21 ids, `ids=MLA1`, `ids=MLB1,MLB1`;
    - `attributes=body.price` e `attributes=title`;
    - `include_attributes=x`;
    - `/items/MLB1?attributes=title`;
    - a busca do 13 sem `search_type`, com `search_type=normal`, `offset=0`, `status=closed`, `limit=0`, `limit=101`, `q=x`;
    - `scroll_id` com caractere fora da lista;
    - `search_type` repetido.
  - `test_vendedor_de_outra_empresa_403` ganha `/users/{OUTRO}/items/search?search_type=scan`.
  - **Novo:** caminho com `scroll_id` de 1.500 caracteres passa; caminho com mais de 2.000 dá 403.
- **`DadosPessoaisTests`:**
  - `ENVIO_ML` ganha `"logistic": {"mode": "me2", "type": "fulfillment", "direction": "forward", "outro": "x"}`.
  - `test_envio_so_com_os_campos_da_lista` espera `logistic == {"mode", "type", "direction"}`, ainda sem nomes, telefones e endereços.
  - **Novo:** a resposta do 13 (objeto) e a do 14 (lista) saem como vieram.
- **`CodigoDoMLTests`:** **novo**, as chamadas do 13 e do 14 contam no mesmo limite da empresa (com `devolucoes_rpm=2`, a 3ª dá 429).
- **`RegistroTests`:** **novo**, o registro do 13 e do 14 sai sem a query (sem `scroll_id` e sem ids).

## Conferência com o ML ao vivo (regra do Bitbrain)
Pedimos à sessão que, só lendo e com uma conta, responda **só formatos e contagens**. Nunca dados de anúncio nem token.
1. `…/items/search?search_type=scan&limit=100&status=active`:
   - o `paging.total`;
   - o tamanho do `scroll_id`;
   - se a 2ª página, com `scroll_id` e `limit=100`, responde 200;
   - o total com `status=paused`;
   - o total sem `status`.
2. `/items/bulk?ids=<2 anúncios, um com variações>&include_attributes=all&attributes=body.id,body.variations,body.seller_custom_field`:
   - se responde 200;
   - se cada elemento tem `id`, `status_code` e `body`;
   - se as variações trazem `attributes` com `SELLER_SKU`;
   - e, sem o `attributes=`, o que muda.

Isso responde às suposições S1 a S4 da spec.

---

## Texto para colar na sessão do Claude Code do Bitbrain

> Abra o Claude Code na pasta do Bitbrain e cole o texto abaixo. Ele **substitui** o "Adendo para colar agora" de [bitbrain-rota-devolucoes.md](bitbrain-rota-devolucoes.md), porque já traz o `logistic`.

```
Preciso de um adendo na rota /integracao/devolucoes/ml (a do sistema de gestão de devoluções, em
app/integracao_devolucoes/). Siga as regras do CLAUDE.md e do docs/estado-atual.md do bitbrain. Não mexa em outras
rotas nem na aba Devoluções. Não publique: quem publica é o Nathan.

O contrato do adendo está em:
C:\Users\idmpc\devolucoes-wt\catalogo\docs\integracao\bitbrain-rota-catalogo.md
(se não estiver neste computador: GitHub c77idm-dev/MKT-_-DEV, branch catalogo-ml, mesmo caminho
docs/integracao/bitbrain-rota-catalogo.md). Leia o arquivo inteiro antes de começar.

O que já vale continua valendo: só GET; CaminhoRecusado = 403 sem chamar o ML; {seller} igual ao vendedor da
empresa; cada parâmetro uma vez; mesmo limite DEVOLUCOES_RPM e mesmo contador; registro só com empresa, caminho sem
a query e código.

1. /shipments/{id} (adendo de 18/11, ainda pendente): além dos campos de _ENVIO, mantenha o objeto `logistic` só com
   `mode`, `type` e `direction`. Com x-format-new: true o ML põe o tipo logístico (ex.: fulfillment) em logistic.type.
2. Caminho 8, /items/MLB…: passa a aceitar UM parâmetro opcional, include_attributes=all (só esse valor). Sem ele o ML
   não manda os attributes das variações (SELLER_SKU, GTIN) nem o seller_custom_field.
3. Caminho 13 (novo, "anuncios_do_vendedor"): /users/{seller}/items/search, só com:
   search_type=scan (obrigatório); scroll_id (opcional, [A-Za-z0-9+/=:._-]{1,1500}); limit (opcional, 1 a 100);
   status (opcional, active ou paused). Qualquer outro parâmetro (offset, q, sku, orders, include_filters…) = 403.
4. Caminho 14 (novo, "anuncios_em_lote"): /items/bulk, só com:
   ids (obrigatório: 1 a 20 ids MLB[0-9]{1,20}, separados por vírgula, sem repetir);
   attributes (opcional: lista separada por vírgula só destes: body.id, body.title, body.status, body.pictures,
   body.secure_thumbnail, body.attributes, body.variations, body.seller_custom_field);
   include_attributes (opcional: só all).
   É o substituto do /items?ids= (o ML pediu a migração até 25/10/2026); o /items?ids= continua fora da lista.
5. Tamanho máximo do caminho: de 500 para 2.000 caracteres (o scroll_id e os 20 ids passam perto de 500). O resto da
   checagem de formato não muda.
6. Anúncio não tem dado de pessoa: 13 e 14 vão como vieram (sem LIMPEZA). Os parâmetros vão separados ao ML, como na
   busca de reclamações.
7. Os testes da seção "Testes que o Bitbrain precisa acrescentar" do contrato, em tests/test_integracao_devolucoes.py.
   Atualize também a cópia do contrato em docs/integracao-devolucoes.md.

Conferência com o ML ao vivo (regra do bitbrain; só leitura, uma conta, poucas chamadas). Responda só formatos e
contagens, nunca dados de anúncio nem token:
a) /users/{seller}/items/search?search_type=scan&limit=100&status=active: o paging.total; se veio scroll_id e o
   tamanho dele; se a 2ª página (com scroll_id e limit=100) responde 200; o total com status=paused; e o total sem
   status.
b) /items/bulk?ids=<2 anúncios, um com variações>&include_attributes=all&attributes=body.id,body.variations,
   body.seller_custom_field: se responde 200; se cada elemento tem id, status_code e body; se as variações trazem
   attributes com SELLER_SKU; e, sem o attributes=, o que muda.

Quando terminar, me diga:
- o commit e o que o Nathan precisa fazer para publicar (cd ~/bitbrain-publicar && git pull --ff-only &&
  scripts/deploy.sh). Não há variável nova no .env;
- as respostas da conferência ao vivo (a e b).
```
