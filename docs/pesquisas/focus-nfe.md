# Focus NFe - Referência de integração para NF-e (devolução e remessa)

Pesquisa feita em 2026-11-12 sobre a documentação oficial (https://doc.focusnfe.com.br/, antigo https://focusnfe.com.br/doc/, que redireciona com 301).
Marcação: **NÃO CONFIRMADO** = não encontrado na documentação oficial consultada. **(inferência)** = conclusão minha, não está escrita na doc.
Os nomes de campos abaixo vêm de https://doc.focusnfe.com.br/reference/emitir_nfe.md e de https://campos.focusnfe.com.br/nfe/NotaFiscalXML.html (lista completa de campos).

**Importante: a spec usa nomes um pouco diferentes dos reais.** O NCM é `codigo_ncm` (não `ncm`), e `unidade_comercial` é opcional na página de Emitir mas obrigatória na página de campos. Enviar sempre.

## 1. Autenticação e ambientes

Fonte: https://doc.focusnfe.com.br/reference/ambiente.md e https://doc.focusnfe.com.br/reference/autenticacao.md

| Ambiente | Base URL |
|---|---|
| Homologação | `https://homologacao.focusnfe.com.br` (rotas em `/v2`) |
| Produção | `https://api.focusnfe.com.br` (rotas em `/v2`) |

- Esquema: **HTTP Basic**. O **token da empresa é o usuário e a senha fica vazia** (`curl -u 'TOKEN:' ...`). O mesmo esquema vale nos dois ambientes, mas o **token é diferente** em cada um (`token_homologacao` e `token_producao`).
- Tipos de token (https://doc.focusnfe.com.br/docs/como-cadastrar-uma-empresa.md): **Token Master** (administrativo da conta, usado para cadastrar empresas via API), **Token de Homologação** e **Token de Produção** (por emitente).
- Homologação não tem validade fiscal, mas **exige CNPJ real e certificado A1 válido** no cadastro (mesma página).
- Cadastro da empresa e do certificado:
  - Pelo painel: menu Empresas, informar CNPJ, razão social, contato e endereço, enviar o arquivo A1 com a senha e, por documento, definir ambiente, série e próximo número (https://doc.focusnfe.com.br/docs/como-cadastrar-uma-empresa.md).
  - Pela API: `POST https://api.focusnfe.com.br/v2/empresas` (a API de empresas **só roda em produção**; usa o Token Master; aceita `dry_run=1`). Campos: `nome`, `nome_fantasia`, `cnpj`, `cep`, `logradouro`, `numero`, `municipio`, `uf`, `regime_tributario` (1 Simples, 2 Simples excesso de sublimite, 3 Normal, 4 MEI), `habilita_nfe`, `habilita_nfce`, `arquivo_certificado_base64` (PFX/P12 em base64), `senha_certificado`, `serie_nfe_producao`, `proximo_numero_nfe_producao`, `serie_nfe_homologacao`, `proximo_numero_nfe_homologacao`. A resposta traz `id`, `token_producao`, `token_homologacao`. Fonte: https://doc.focusnfe.com.br/reference/criar_empresa.md. Observação: a doc mostra `senha_certificado` como string no schema e número no exemplo, então enviar como string e validar.
  - Também existem listar, consultar por ID, atualizar e excluir empresa (https://doc.focusnfe.com.br/reference/empresas.md).
- Só aceita certificado **e-CNPJ A1** (https://doc.focusnfe.com.br/docs/requisitos-de-credenciamento.md). Também exige IE ativa e credenciamento do emitente na SEFAZ do estado. Alguns estados (ex.: PR) exigem vincular o software house no portal da SEFAZ.
- Para o sistema: o certificado fica na Focus, como a spec §8.1 pede. A API de empresas é opcional, o cadastro pode ser só pelo painel.

## 2. Emissão de NF-e

Fonte principal: https://doc.focusnfe.com.br/reference/emitir_nfe.md

- **`POST /v2/nfe?ref={ref}`**, `Content-Type: application/json`.
- **`ref`** (query, obrigatório): referência única no seu sistema. Regras (https://doc.focusnfe.com.br/reference/referencia.md):
  - única no escopo do token (por empresa);
  - **só letras e números** (sem acento, espaço, `@`, `/` etc.);
  - se a autorização falhou (rejeição ou erro antes da autorização), **pode reenviar o mesmo `ref`** após corrigir o payload;
  - depois de autorizada, o `ref` fica atrelado ao documento para sempre, mesmo se cancelada. Não reutilizar;
  - sugestão da doc: usar o ID interno da nota.
- Resposta: **202** `processando_autorizacao` (fluxo assíncrono padrão) ou **201** `autorizado` (síncrono, só em SEFAZs que suportam e mediante pedido ao suporte; https://doc.focusnfe.com.br/docs/arquitetura-de-processamento-e-ambientes.md). Outros: 400 (`requisicao_invalida`, ex.: sem `ref`), 401, 415 (`formato_invalido`), 422 (`permissao_negada`, `pending_operation`, `already_processed`, `erro_validacao_schema` com `erros[{mensagem,campo}]`).
- Reenvio com o mesmo `ref` enquanto processa: 422 `pending_operation`; depois de autorizada: 422 `already_processed`. Esse é o comportamento de idempotência documentado, a doc não usa o termo "idempotência".

### 2.1 Campos comuns (nomes exatos)

Cabeçalho (obrigatórios em **negrito**): **`natureza_operacao`** (texto 1-60), **`data_emissao`** (ISO 8601 com fuso), `data_entrada_saida`, **`tipo_documento`** (0 entrada, 1 saída), **`local_destino`** (1 interna, 2 interestadual, 3 exterior; a página de campos marca como obrigatório), **`finalidade_emissao`** (1 normal, 2 complementar, 3 ajuste, **4 devolução**), **`consumidor_final`** (0 normal, 1 consumidor final), **`presenca_comprador`** (0 não se aplica, 1 presencial, 2 internet, 3 teleatendimento, 4 NFC-e entrega, 5, 9 outros), `modalidade_frete` (0, 1, 2, 9), `regime_tributario_emitente` (1 Simples, 2 sublimite, 3 Normal, 4 MEI), `serie`, `numero` (ver §5).

Emitente: `cnpj_emitente` (ou `cpf_emitente`), `inscricao_estadual_emitente`, `nome_emitente`, `nome_fantasia_emitente`, `logradouro_emitente`, `numero_emitente`, `bairro_emitente`, `municipio_emitente`, `uf_emitente`, `cep_emitente`. A página de campos diz que `uf_emitente` e `codigo_municipio_emitente` assumem o cadastro da empresa se omitidos. **NÃO CONFIRMADO** se os demais dados do emitente são preenchidos automaticamente a partir do cadastro da empresa (provável, mas o exemplo oficial envia `cnpj_emitente`, `nome_emitente`, `uf_emitente`). Enviar tudo para garantir.

Destinatário: `nome_destinatario` (obrigatório, 2-60), `cnpj_destinatario` **ou** `cpf_destinatario`, `indicador_inscricao_estadual_destinatario` (obrigatório: 1 contribuinte, 2 isento, 9 não contribuinte), `inscricao_estadual_destinatario`, `logradouro_destinatario`, `numero_destinatario`, `complemento_destinatario`, `bairro_destinatario`, `municipio_destinatario`, `codigo_municipio_destinatario` (opcional; a Focus resolve por nome e UF), `uf_destinatario`, `cep_destinatario`, `telefone_destinatario`, `email_destinatario`. Logradouro, número, bairro, município e UF são obrigatórios na página de campos.

Totais: `valor_produtos`, `valor_frete`, `valor_seguro`, `valor_desconto`, `valor_outras_despesas`, `valor_total` (obrigatório). Os totais de ICMS/PIS/COFINS são calculados automaticamente se omitidos.

Notas referenciadas: array **`notas_referenciadas`** (0 a 500 itens) com `chave_nfe` (44 dígitos; tag `refNFe`). Há também `chave_cte`, `modelo`, `serie`, `numero`, `cnpj`, `uf`, `mes` (NF modelo 1/2) e campos de NF de produtor e ECF. Fonte: https://campos.focusnfe.com.br/nfe/NotaFiscalXML.html. Formato do `chave_nfe`: **NÃO CONFIRMADO** se aceita o prefixo `NFe` (a resposta da Focus devolve `NFe` + 44 dígitos, mas a página de campos descreve 44 dígitos numéricos). Enviar só os 44 dígitos.

Informações adicionais: `informacoes_adicionais_contribuinte` (1-5000, tag `infCpl`), `informacoes_adicionais_fisco` (1-2000), `observacoes_contribuinte` / `observacoes_fisco` (até 10 itens `{campo, texto}`). Usar `informacoes_adicionais_contribuinte` para os nº de série e o código do lote (spec §8.5).

Itens (`items[]`): obrigatórios `numero_item` (a partir de 1), `codigo_produto` (1-60), `descricao` (1-120), **`codigo_ncm`** (8 dígitos), `cfop` (4 dígitos), `unidade_comercial` (1-6, ex.: `UN`), `quantidade_comercial` (até 4 casas), `valor_unitario_comercial` (até 10 casas), `valor_bruto` (a página de campos diz que é calculado se omitido, a de Emitir marca como obrigatório; enviar). Opcionais: `unidade_tributavel`, `quantidade_tributavel`, `valor_unitario_tributavel` (assumem os comerciais), `cest` (obrigatório se produto com ST), `codigo_barras_comercial`, `inclui_no_total` (0/1, padrão 1), `informacoes_adicionais_item` (até 500), `pedido_compra`.

Tributos do item:
- ICMS: `icms_origem` (0 a 8, obrigatório), **`icms_situacao_tributaria`** (obrigatório; o mesmo campo carrega CST ou CSOSN). Valores CST: 00, 02, 10, 15, 20, 30, 40, 41, 50, 51, 53, 60, 61, 70, 90 (e variantes `_partilha`, `_st`). Valores CSOSN: 101, 102, 103, 201, 202, 203, 300, 400, 500, 900. Campos auxiliares: `icms_modalidade_base_calculo`, `icms_base_calculo`, `icms_reducao_base_calculo`, `icms_aliquota`, `icms_valor`, `icms_aliquota_credito_simples` e `icms_valor_credito_simples` (CSOSN 101/201/900), e os de ST (`icms_base_calculo_st`, `icms_aliquota_st`, `icms_valor_st`...).
- PIS: `pis_situacao_tributaria` (obrigatório: 01-09, 49, 50-56, 60-67, 70-75, 98, 99), `pis_base_calculo`, `pis_aliquota_porcentual`, `pis_valor`.
- COFINS: `cofins_situacao_tributaria` (obrigatório, mesmos valores), `cofins_base_calculo`, `cofins_aliquota_porcentual`, `cofins_valor`.
- IPI (só se aplicável): `ipi_situacao_tributaria`, `ipi_codigo_enquadramento_legal` (999 se não se aplica), `ipi_base_calculo`, `ipi_aliquota`, `ipi_valor`.

Observação: PIS e COFINS aparecem como obrigatórios na página de campos mesmo no Simples. Para Simples, usar CST 49 (outras operações de saída) ou 99, ou o que o contador definir. **NÃO CONFIRMADO** qual CST de PIS/COFINS a Focus/SEFAZ exige para devolução de venda (entrada). O contador define (spec §8.3).

### 2.2 (a) NF-e de devolução de venda (entrada)

Mapa de decisão (campos da Focus; valores fiscais são sugestões que o contador valida):

| Tema | Valor |
|---|---|
| `finalidade_emissao` | `4` (devolução) |
| `tipo_documento` | `0` (entrada). Emitente = a empresa, destinatário = o comprador que devolve (o "destinatário" é a contraparte, mesmo na entrada). |
| `local_destino` | `1` se a UF do comprador = UF da empresa, senão `2` |
| `notas_referenciadas` | `[{ "chave_nfe": "<44 dígitos da NF de venda>" }]` (uma ou mais). Sem isso a SEFAZ rejeita (ver §6) |
| Comprador PF | `cpf_destinatario`, `indicador_inscricao_estadual_destinatario: 9`, `consumidor_final: 1`, `presenca_comprador: 2` ou `9` (inferência, venda por marketplace é não presencial) |
| `natureza_operacao` | texto livre até 60 caracteres, ex.: `Devolucao de venda` |
| CFOP | 1202 (dentro do estado) ou 2202 (fora), conforme spec §8.3 |
| Simples Nacional | `icms_situacao_tributaria`: 102 (sem crédito), 202 ou 900 conforme o contador |
| Lucro Presumido/Real | `icms_situacao_tributaria`: 00, 40, 41 ou 90 (com `icms_base_calculo`, `icms_aliquota`, `icms_valor` quando 00 ou 90) + PIS/COFINS (`pis_situacao_tributaria`, `cofins_situacao_tributaria`, bases, alíquotas, valores) |

Exemplo (Simples Nacional, comprador PF, mesma UF):

```json
{
  "natureza_operacao": "Devolucao de venda",
  "data_emissao": "2026-11-12T10:00:00-03:00",
  "data_entrada_saida": "2026-11-12T10:00:00-03:00",
  "tipo_documento": 0,
  "finalidade_emissao": 4,
  "local_destino": 1,
  "consumidor_final": 1,
  "presenca_comprador": 2,
  "modalidade_frete": 9,
  "regime_tributario_emitente": 1,
  "cnpj_emitente": "12345678000123",
  "inscricao_estadual_emitente": "123456789",
  "nome_emitente": "EMPRESA EXEMPLO LTDA",
  "logradouro_emitente": "Rua A",
  "numero_emitente": "100",
  "bairro_emitente": "Centro",
  "municipio_emitente": "Sao Paulo",
  "uf_emitente": "SP",
  "cep_emitente": "01001000",
  "cpf_destinatario": "12345678909",
  "nome_destinatario": "MARIA DA SILVA",
  "indicador_inscricao_estadual_destinatario": 9,
  "logradouro_destinatario": "Rua B",
  "numero_destinatario": "50",
  "bairro_destinatario": "Jardim",
  "municipio_destinatario": "Sao Paulo",
  "uf_destinatario": "SP",
  "cep_destinatario": "01002000",
  "notas_referenciadas": [
    { "chave_nfe": "35261112345678000123550010000000011234567890" }
  ],
  "valor_produtos": 199.90,
  "valor_total": 199.90,
  "informacoes_adicionais_contribuinte": "Devolucao ref. NF-e de venda; S/N: ABC123",
  "items": [
    {
      "numero_item": 1,
      "codigo_produto": "SKU-001",
      "descricao": "Produto exemplo",
      "codigo_ncm": "85171231",
      "cfop": "1202",
      "unidade_comercial": "UN",
      "quantidade_comercial": 1,
      "valor_unitario_comercial": 199.90,
      "unidade_tributavel": "UN",
      "quantidade_tributavel": 1,
      "valor_unitario_tributavel": 199.90,
      "valor_bruto": 199.90,
      "inclui_no_total": 1,
      "icms_origem": 0,
      "icms_situacao_tributaria": "102",
      "pis_situacao_tributaria": "49",
      "cofins_situacao_tributaria": "49"
    }
  ]
}
```

(Chave de exemplo fictícia, o DV não é válido. CST de PIS/COFINS 49 é uma suposição para o Simples, validar com o contador.)

Variante Lucro Presumido/Real, trecho do item: `"icms_situacao_tributaria": "00", "icms_modalidade_base_calculo": 3, "icms_base_calculo": 199.90, "icms_aliquota": 18, "icms_valor": 35.98, "pis_situacao_tributaria": "01", "pis_base_calculo": 199.90, "pis_aliquota_porcentual": 0.65, "pis_valor": 1.30, "cofins_situacao_tributaria": "01", "cofins_base_calculo": 199.90, "cofins_aliquota_porcentual": 3, "cofins_valor": 6.00`. Para devolução, o espelho dos tributos da NF de venda é o esperado (spec §8.4), com o CST que o contador definir (inclusive 49/98 para PIS/COFINS se for o caso).

### 2.3 (b) NF-e de remessa para conserto (CFOP 5915/6915) e remessa para troca/garantia

Mapa:
- `tipo_documento: 1` (saída), `finalidade_emissao: 1` (normal), `local_destino: 1` (5915) ou `2` (6915).
- Destinatário PJ: `cnpj_destinatario`, `nome_destinatario`, `inscricao_estadual_destinatario` + `indicador_inscricao_estadual_destinatario: 1` (contribuinte) ou `2` (isento) ou `9` (sem IE), endereço completo (`logradouro_destinatario`, `numero_destinatario`, `bairro_destinatario`, `municipio_destinatario`, `uf_destinatario`, `cep_destinatario`), opcional `codigo_municipio_destinatario`.
- `consumidor_final: 0`, `presenca_comprador: 0`.
- CFOP 5915/6915 (conserto). Troca/garantia: definido pelo contador (spec §8.3).
- ICMS no Simples: em geral CSOSN 400 (não tributada) para remessa; no regime normal CST 41. **NÃO CONFIRMADO**, é decisão do contador.
- Uso do `custo` do produto como `valor_unitario_comercial`, conforme spec §8.5.

```json
{
  "natureza_operacao": "Remessa para conserto",
  "data_emissao": "2026-11-12T10:00:00-03:00",
  "tipo_documento": 1,
  "finalidade_emissao": 1,
  "local_destino": 2,
  "consumidor_final": 0,
  "presenca_comprador": 0,
  "modalidade_frete": 9,
  "regime_tributario_emitente": 1,
  "cnpj_emitente": "12345678000123",
  "inscricao_estadual_emitente": "123456789",
  "nome_emitente": "EMPRESA EXEMPLO LTDA",
  "uf_emitente": "SP",
  "cnpj_destinatario": "98765432000199",
  "nome_destinatario": "FORNECEDOR EXEMPLO S/A",
  "inscricao_estadual_destinatario": "987654321",
  "indicador_inscricao_estadual_destinatario": 1,
  "logradouro_destinatario": "Av. Industrial",
  "numero_destinatario": "1000",
  "bairro_destinatario": "Distrito Industrial",
  "municipio_destinatario": "Manaus",
  "uf_destinatario": "AM",
  "cep_destinatario": "69000000",
  "valor_produtos": 350.00,
  "valor_total": 350.00,
  "informacoes_adicionais_contribuinte": "Lote L-0042. S/N: ABC123, DEF456",
  "items": [
    {
      "numero_item": 1,
      "codigo_produto": "SKU-001",
      "descricao": "Produto exemplo",
      "codigo_ncm": "85171231",
      "cfop": "6915",
      "unidade_comercial": "UN",
      "quantidade_comercial": 2,
      "valor_unitario_comercial": 175.00,
      "valor_bruto": 350.00,
      "inclui_no_total": 1,
      "icms_origem": 0,
      "icms_situacao_tributaria": "400",
      "pis_situacao_tributaria": "49",
      "cofins_situacao_tributaria": "49"
    }
  ]
}
```

## 3. Fluxo assíncrono

- **Consulta:** `GET /v2/nfe/{ref}` (opcional `?completa=1` para trazer requisição e protocolo). Fonte: https://doc.focusnfe.com.br/reference/consultar_nfe.md. HTTP 200 com o estado no corpo; 404 `nao_encontrado`.
- **Valores exatos de `status`:** `processando_autorizacao`, `autorizado`, `cancelado`, `erro_autorizacao`. Todos aparecem na doc de consulta. **`denegado`: NÃO CONFIRMADO** na doc de Consultar (a lista de status não inclui). NF-e denegada (cStat 110/301/302) é um caso da SEFAZ, tratar como estado desconhecido: se `status_sefaz` for 110/301/302 considerar denegada **(inferência)**.
- **Campos da resposta:** sempre `cnpj_emitente`, `ref`, `status`. Em `autorizado`: `status_sefaz` (ex.: `"100"`), `mensagem_sefaz`, `chave_nfe`, `numero`, `serie` (strings), `caminho_xml_nota_fiscal`, `caminho_danfe`, opcional `caminho_danfe_etiqueta`. Em `cancelado`: igual, mais `caminho_xml_cancelamento` (`status_sefaz` 135). Em `erro_autorizacao`: `status_sefaz` (ex.: `598`), `mensagem_sefaz` e `erros[{mensagem, campo, codigo}]`.
- **Rejeição:** vem em `status: "erro_autorizacao"` com `status_sefaz` e `mensagem_sefaz` (texto da SEFAZ em português). Rejeição de schema antes de enviar volta já no POST como 422 `erro_validacao_schema` com `erros[].campo`. Pode reenviar o mesmo `ref` depois de corrigir.
- **Download:** os `caminho_*` são caminhos relativos começando com `/arquivos/...`. A doc **não diz o host**. NÃO CONFIRMADO, mas o uso natural é prefixar com a mesma base URL do ambiente (`https://api.focusnfe.com.br` / `https://homologacao.focusnfe.com.br`) **(inferência)**. Testar em homologação. Se exigir autenticação, usar o mesmo Basic.
- **Webhook ("gatilho"):** https://doc.focusnfe.com.br/docs/webhooks.md, https://doc.focusnfe.com.br/reference/criar_webhook.md
  - `POST /v2/hooks` com `event` (para NF-e emitida use `nfe`; também `inutilizacao`), `url` (obrigatórios), opcionais `cnpj`, `cpf`, `authorization`, `authorization_header` (a Focus envia esse header em cada chamada para você validar a origem). `GET /v2/hooks`, `GET /v2/hooks/{id}`, `DELETE /v2/hooks/{id}`.
  - O corpo do POST enviado a você traz os mesmos dados do GET de consulta e um documento por chamada. O schema exato do payload não está na doc consultada (**NÃO CONFIRMADO**).
  - Responder HTTP 2xx rápido (a doc cita 200 ou 202) e processar em background. Retentativas: 1 min, 30 min, 1 h, 3 h, 24 h; depois não dispara mais (https://doc.focusnfe.com.br/docs/utilizando-webhooks.md cita até 48 h; as duas páginas divergem, tratar como "até ~24-48 h").
  - Reenvio de notificação perdida: `POST` de reenvio de hook da NF-e (https://doc.focusnfe.com.br/reference/reenviar_hook_nfe.md).
  - Cobertura para os eventos "autorizado" e "rejeitado": a doc só lista o evento `nfe` (documentos autorizados e seus dados). **NÃO CONFIRMADO** se rejeições e cancelamentos também disparam o gatilho. Por isso manter o polling como reserva (spec §8.6 já faz `nfe.consultar` com espera crescente).
- **Polling:** recomendação da doc é webhook, e se não der, backoff progressivo. Autorizações assíncronas levam de segundos a vários minutos (https://doc.focusnfe.com.br/docs/cuidado-com-o-rate-limit.md).
- **Contingência SVC:** existe mecanismo automático (https://doc.focusnfe.com.br/docs/mecanismo-de-contingencia-automatica-svc.md). Não lido em detalhe.

## 4. Cancelamento

Fonte: https://doc.focusnfe.com.br/reference/cancelar_nfe.md

- **`DELETE /v2/nfe/{ref}`** com corpo JSON `{"justificativa": "..."}`. Síncrono.
- Justificativa obrigatória, **15 a 255 caracteres** (fora disso: 400 `requisicao_invalida`).
- Prazo: **até 24 horas após a emissão** (autorização). A doc diz que alguns estados podem permitir prazo maior. O prazo geral do Ajuste SINIEF é 24 h (cancelamento extemporâneo depende de cada UF) **(inferência)**. A doc da Focus não detalha o que fazer depois do prazo (para devolução e remessa, em geral é necessária uma NF de entrada/saída de estorno, validar com o contador).
- Resposta 200: `status` = `cancelado` ou `erro_cancelamento`, `status_sefaz` (135), `mensagem_sefaz`, `caminho_xml_cancelamento`. Erros: 400, 401, 404 `nao_encontrado`, 415, 422 `nfe_nao_autorizada`.
- Outros eventos: Carta de Correção (`emitir_carta_correcao`) é síncrona, pode corrigir dados que não alterem valores ou destinatário.

## 5. Numeração e série

- A Focus **controla a numeração automaticamente por empresa, ambiente e série**. `serie` e `numero` no payload são opcionais, e a página de campos recomenda deixá-los em branco: "Leave blank for automatic numbering (recommended)" (https://campos.focusnfe.com.br/nfe/NotaFiscalXML.html). A inutilização só é necessária para justificar saltos (https://doc.focusnfe.com.br/reference/inutilizar_numeracao.md).
- A série e o próximo número configuram-se **no cadastro da empresa**: `serie_nfe_producao`, `proximo_numero_nfe_producao`, `serie_nfe_homologacao`, `proximo_numero_nfe_homologacao` (painel ou `POST/PUT /v2/empresas`).
- Para convivência com o Bitbrain no mesmo CNPJ: configurar a série **2** (ou outra livre) na empresa na Focus e definir o próximo número. Alternativa: enviar `serie` no payload de cada emissão. **NÃO CONFIRMADO** se, ao enviar `serie` diferente da cadastrada, a Focus mantém contador separado por série. O mais seguro é a série fixa no cadastro, e o Bitbrain continuar na série 1. Testar em homologação (emitir 2 notas e conferir `serie` e `numero` na resposta).
- A resposta da consulta traz `numero` e `serie` como strings. Salvar ambos e a `chave_nfe`.
- Inutilização: `POST /v2/nfe/inutilizacao` com `cnpj`, `serie`, `numero_inicial`, `numero_final`, `justificativa` (mínimo 15 caracteres).

## 6. Limites, erros e pegadinhas

- **Rate limit:** **100 requisições por minuto por token**; excedeu, HTTP **429**. Pode pedir aumento ao suporte (https://doc.focusnfe.com.br/docs/cuidado-com-o-rate-limit.md). Cabeçalhos de retry: NÃO CONFIRMADO.
- **Idempotência do `ref`:** ver §2. Reenviar o mesmo `ref` após erro é permitido; após autorização dá 422 `already_processed`. Usar o ID interno da nota fiscal como `ref` (só alfanumérico) e gerar um novo `ref` só para uma nota nova (inclusive após cancelar).
- **Erros da SEFAZ comuns em devolução** (NÃO CONFIRMADOS na doc da Focus; vêm do conhecimento do Manual de Orientação do Contribuinte NF-e, validar na tabela oficial de rejeições do portal nacional):
  - **321**: NF-e de devolução de mercadoria sem documento fiscal referenciado (falta `notas_referenciadas`/`chave_nfe` quando `finalidade_emissao` = 4);
  - **327/328**: CFOP de devolução incompatível com a finalidade da NF-e;
  - **539/204**: duplicidade de NF-e/número já usado (problema de numeração/série colidindo com o outro ERP);
  - **598**: em homologação, o nome do destinatário deve ser `NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL` (a doc usa 598 como exemplo de rejeição em `consultar_nfe.md` e o exemplo de emissão envia esse nome);
  - IE do destinatário inconsistente com `indicador_inscricao_estadual_destinatario` (209/233 e similares).
- **Homologação:** documentos sem validade fiscal; o nome do destinatário deve ser o texto acima (exemplo oficial em `emitir_nfe.md`). Dados de teste adicionais: a doc consultada não traz, existe a coleção Postman citada em https://doc.focusnfe.com.br/docs/teste-antes-de-implementar.md. CNPJ real + A1 válido são necessários mesmo em homologação.
- **Totais:** enviar `valor_total` e `valor_produtos` coerentes com os itens (a doc deixa o resto ser calculado).
- Respostas 401 vêm como `text/html` ("HTTP Basic: Access denied"), tratar antes de fazer `JSON.parse`.
- Erros JSON: `{ "codigo", "mensagem", "erros": [{ "mensagem", "campo" }] }`.
- Spec §8.6: o cancelamento da NF de devolução (24 h) pode ficar fora do prazo. Planejar o que fazer (ex.: bloquear o botão ou orientar emitir nota de estorno com o contador).

## 7. Alternativas (NFE.io e PlugNotas)

Não pesquisei a fundo (pedido: breve). NFE.io e PlugNotas também são APIs REST com cadastro de empresa e upload de certificado A1 e emissão assíncrona com webhook. Pelos resultados da busca, a NFE.io cadastra o certificado por upload multipart (`POST /v2/companies/{id}/certificates`), ao contrário da Focus, que usa `arquivo_certificado_base64` no JSON (https://nfe.io/docs/desenvolvedores/rest-api/nota-fiscal-de-consumidor-v2/v-2-companies-by-company-id-certificates-post/). A diferença material para o escopo é de formato (nomes de campos, autenticação, modelo de ref/idempotência), não de capacidade: devolução (`finNFe=4`, referência de chave) e remessa são campos padrão da NF-e em todos. PlugNotas: NÃO CONFIRMADO na doc oficial (não consultada). A interface `EmissorNFe` da spec isola essa troca.

## Resumo dos pontos NÃO CONFIRMADOS

1. Status `denegado` na consulta (a doc lista 4 estados, sem ele).
2. Host dos `caminho_xml_nota_fiscal` e `caminho_danfe` (relativos, `/arquivos/...`).
3. Se o webhook `nfe` dispara em rejeição e cancelamento, e o schema do payload.
4. Se informar `serie` no payload mantém contador separado por série.
5. Preenchimento automático dos dados do emitente a partir do cadastro.
6. Códigos de rejeição de devolução (321, 327, 328): vêm do manual SEFAZ, não da doc da Focus.
7. CST/CSOSN e CST de PIS/COFINS adequados para devolução e remessa (contador).
8. Formato de `chave_nfe` com ou sem o prefixo `NFe`.
9. PlugNotas e NFE.io: comparação superficial.
