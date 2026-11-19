# Rota do Bitbrain para o sistema de devoluções (contrato)

Data: 18/11/2026. O lado do sistema de devoluções está desenhado em [../superpowers/specs/2026-11-18-integracao-bitbrain-design.md](../superpowers/specs/2026-11-18-integracao-bitbrain-design.md).

**Quem constrói:** a sessão do Claude Code aberta na pasta do Bitbrain, seguindo as regras do Bitbrain (`CLAUDE.md` de lá). O Nathan publica. O sistema de devoluções **não mexe** no código do Bitbrain.

## O que a rota faz
O sistema de devoluções lê, **pelo Bitbrain**, as devoluções do Mercado Livre das contas que o Bitbrain já tem conectadas. O Bitbrain faz a chamada ao ML com o token da conta e devolve a resposta do ML como veio, sem os dados pessoais. A rota **só lê**: não aceita escrita nem caminho fora da lista.

## Autenticação
- Cabeçalho `Authorization: Bearer <DEVOLUCOES_TOKEN>`, comparado em tempo constante, como em `app/estudio/routes.py`.
- `DEVOLUCOES_TOKEN` é uma variável nova do `.env` do Bitbrain, gerada com `openssl rand -hex 32`. Vazia, a rota fica desligada e responde 404.
- Token ausente ou errado: 401 `{"erro": "token inválido"}`.
- Servidor a servidor, sem cookie de sessão. Se a barreira de Origin de `app/main.py` alcançar GET, a rota entra na lista de exceções, como a `/estudio/ml`.

## 1. `GET /integracao/devolucoes/empresas`
Resposta 200:
```json
{"empresas": [{"empresa": "megadino", "nome": "IDM Shop", "seller_id": "25255785"}]}
```
- Lista as empresas com credencial do ML válida. `empresa` é o `account_key`, e `seller_id` é texto.
- Não traz nenhum token, nem dado de pessoa.

## 2. `GET /integracao/devolucoes/ml?empresa=<slug>&caminho=<caminho>`
- `empresa`: o slug (`account_key`). Se não existir ou não tiver credencial válida: 404 `{"erro": "empresa sem conta do ML"}`.
- `caminho`: o caminho do ML **com** a query string, codificado na URL (ex.: `caminho=%2Fpost-purchase%2Fv1%2Fclaims%2F5123`).
- O Bitbrain faz `GET https://api.mercadolibre.com<caminho>` com o token da empresa. Por exemplo, `get_valid_credential(session, account_key=empresa)` e o `MLClient`, como em `app/devolucoes/service.py::_cliente`.
- **Resposta:**
  - o **mesmo código HTTP** do ML: 200, 400, 401, 403, 404, 429 ou 5xx;
  - o corpo do ML, com os dados pessoais tirados (veja abaixo);
  - o mesmo `Content-Type` (`application/json`, ou `application/xml` na NF);
  - num 429, repassar o `Retry-After`.
- **Caminho fora da lista:** 403 `{"erro": "caminho não permitido"}`, sem chamar o ML.

### Lista fechada (só GET)
`{seller}` precisa ser **igual** ao `seller_id` da empresa. Os ids são números, exceto onde estiver indicado.

| # | Caminho (sem a query) | Observação |
|---|---|---|
| 1 | `/post-purchase/v1/claims/search` | A query só pode ter `players.user_id={seller}`, `players.role=respondent`, `range=last_updated:after:<data ISO>`, `limit` (até 100) e `offset` (até 9900). Qualquer outro parâmetro dá 403. |
| 2 | `/post-purchase/v1/claims/{id}` | |
| 3 | `/post-purchase/v2/claims/{id}/returns` | |
| 4 | `/post-purchase/v1/claims/{id}/affects-reputation` | |
| 5 | `/post-purchase/v1/returns/{id}/reviews` | |
| 6 | `/post-purchase/v1/claims/reasons/{id}` | `{id}` são letras maiúsculas e números (ex.: `PDD9949`). |
| 7 | `/orders/{id}` | Tirar os dados pessoais (veja abaixo). |
| 8 | `/items/{id}` | `{id}` = `MLB` seguido de números. |
| 9 | `/shipments/{id}` | Mandar ao ML o cabeçalho `x-format-new: true`. Tirar os dados pessoais. |
| 10 | `/users/{seller}/invoices/orders/{id}` | |
| 11 | `/invoices/orders/{id}` | |
| 12 | `/users/{seller}/invoices/documents/xml/{id}/authorized` | `{id}` são letras, números, `-` e `_`. Devolve o **XML inteiro** (`application/xml`). |

### Dados pessoais (LGPD)
Nos JSON, devolver **só** os campos abaixo, mais o que já não é dado de pessoa (ids, situações, datas):
- **`/orders/{id}`:** `id`, `status`, `date_created`, `pack_id`, `tags`, `shipping.id` e `order_items[].{item.id, item.title, item.seller_sku, item.seller_custom_field, item.variation_id, quantity, unit_price}`. Sem `buyer`, sem `payments`, sem endereço.
- **`/shipments/{id}`:** `id`, `status`, `substatus`, `tracking_number`, `tracking_method`, `logistic_type`, `status_history`, `date_created` e `last_updated`. Sem os endereços e sem os nomes e telefones do destinatário e do remetente.
- **`/post-purchase/v2/claims/{id}/returns`:** em cada `shipments[].destination`, manter só `name` e tirar `shipping_address`.
- **Os outros JSON** (reclamação, busca, reputação, revisões, motivo, anúncio, nota) podem ir como vieram.
- **O XML da NF de venda** vai inteiro: a NF de devolução precisa do destinatário. O sistema de devoluções guarda o XML com acesso restrito, como já faz hoje.

### Adendo (18/11, plano do sistema de devoluções, D9)
- Em `/shipments/{id}`, mantenha também `logistic` só com `mode`, `type` e `direction`. Não é dado pessoal. Com `x-format-new: true`, o ML põe o tipo logístico (ex.: `fulfillment`, a venda Full) em `logistic.type`, e não em `logistic_type`. Sem esse campo, o sistema não sabe se a venda foi Full.

### Limites e registro
- **Respeitar o ritmo do ML** como as outras rotinas do Bitbrain. O sistema de devoluções faz cerca de 1 busca por conta a cada 15 minutos e algumas leituras por devolução nova ou alterada.
- **No registro** vão só a empresa, o caminho **sem a query** e o código HTTP. Nunca o corpo nem o token.

## Exemplo
```
GET /integracao/devolucoes/ml?empresa=megadino&caminho=%2Fpost-purchase%2Fv2%2Fclaims%2F5123456789%2Freturns
Authorization: Bearer 3f9c…

200 application/json
{"id": 38123, "claim_id": 5123456789, "status": "shipped", "subtype": "return_total", "status_money": "retained",
 "shipments": [{"shipment_id": 4433, "status": "shipped", "tracking_number": "AP593274533BR", "type": "return",
                "destination": {"name": "seller_address"}}],
 "orders": [{"order_id": 2000018824047452, "item_id": "MLB1234567890", "return_quantity": "1.0", "total_quantity": "1.0"}],
 "related_entities": ["reviews"], "date_created": "2026-11-17T10:00:00.000-03:00", "last_updated": "2026-11-18T09:00:00.000-03:00"}
```

## Testes que a rota precisa ter (no Bitbrain)
- Sem token: 401. Token errado: 401. Token vazio no `.env`: 404.
- Caminho fora da lista: 403, **sem** chamar o ML. Também 403 para o `{seller}` de outra empresa e para um parâmetro a mais na busca.
- Empresa desconhecida: 404.
- O código do ML é repassado (404, 429 com `Retry-After`, 500).
- `/orders` e `/shipments` saem sem `buyer` e sem endereços, e `returns` sai sem `shipping_address`.
- O XML sai inteiro, com `application/xml`.

---

## Texto para colar na sessão do Claude Code do Bitbrain

> Abra o Claude Code na pasta do Bitbrain e cole o texto abaixo.

```
Preciso de uma rota nova no bitbrain para o nosso sistema de gestão de devoluções (um sistema separado, que roda em
outro container na mesma VPS) ler as devoluções do Mercado Livre das nossas contas. Siga as regras do CLAUDE.md
e do docs/estado-atual.md do bitbrain.

O contrato completo está no arquivo:
C:\Users\idmpc\devolucoes-wt\bitbrain\docs\integracao\bitbrain-rota-devolucoes.md
(se não estiver neste computador, está no GitHub c77idm-dev/MKT-_-DEV, branch integracao-bitbrain, mesmo caminho
docs/integracao/bitbrain-rota-devolucoes.md). Leia esse arquivo inteiro antes de começar.

Resumo:
1. GET /integracao/devolucoes/empresas: as empresas com conta do ML válida (empresa, nome, seller_id).
2. GET /integracao/devolucoes/ml?empresa=<slug>&caminho=<caminho do ML>: repasse SÓ DE LEITURA, com LISTA FECHADA
   de 12 caminhos da API do ML. O bitbrain chama o ML com o token da empresa e devolve a resposta como veio, com o
   mesmo código HTTP e sem os dados pessoais (pedido e envio só com os campos listados; endereço da devolução tirado).
   Em /shipments/{id}, mantenha também `logistic` só com `mode`, `type` e `direction` (não é dado pessoal; veja a seção
   "Adendo (18/11…)" do contrato).
   O XML da NF de venda vai inteiro. Caminho fora da lista dá 403 sem chamar o ML.
3. Autenticação: Authorization: Bearer <DEVOLUCOES_TOKEN>, uma variável nova no .env, comparada em tempo constante,
   igual à da /estudio/ml. Token vazio = rota desligada (404).
4. O registro leva só a empresa, o caminho sem a query e o código. Nunca o corpo nem o token.
5. Os testes listados no contrato.

Não é repasse livre para a API do ML: só os 12 caminhos, só GET. Não mexa em outras rotas nem no que já existe na
aba Devoluções. Quando terminar, me diga:
- o endereço público da rota (domínio do bitbrain);
- os passos para o Nathan gerar o DEVOLUCOES_TOKEN e publicar.
O token eu ponho depois, à mão, no .env do sistema de devoluções.
```

### Adendo para colar agora (a rota já está no ar)

> **Substituído em 19/11** pelo texto único de [bitbrain-rota-catalogo.md](bitbrain-rota-catalogo.md), que já traz este `logistic` junto com o catálogo. Cole aquele, não este.

```
A rota /integracao/devolucoes/ml já está no ar. Falta o adendo de 18/11 do contrato (docs/integracao/bitbrain-rota-devolucoes.md): em /shipments/{id}, além dos campos já liberados, mantenha o objeto `logistic` só com `mode`, `type` e `direction`. Com x-format-new: true o ML põe o tipo logístico (ex.: fulfillment) em logistic.type. Acrescente um teste: /shipments traz logistic.{mode,type,direction} e continua sem endereços, nomes e telefones.
```
