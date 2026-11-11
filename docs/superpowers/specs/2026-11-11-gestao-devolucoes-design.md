# Sistema de Gestão de Devoluções: Design

- **Data:** 2026-11-11
- **Situação:** design aprovado em conversa, documento aguardando revisão
- **Base:** PDF "Escopo do Projeto Operacional: Sistema & Processo de Gestão de Devoluções"
- **Princípio:** seguir a ideia do PDF. Os nomes das etapas, das evidências e dos filtros na tela são **iguais aos do PDF**. Tudo o que vai além do PDF está marcado como **(extra)**.

---

## 1. Objetivo

Controlar o ciclo físico e fiscal das devoluções vindas dos marketplaces (Mercado Livre, Amazon, Shopee, Magalu, TikTok Shop e Shein). O ciclo vai da postagem pelo cliente até a destinação em estoque. Para os itens com problema, continua até a remessa consolidada ao fornecedor. Tudo com evidências (4 fotos e Vídeo de Prova) e emissão de NF-e pelo próprio sistema.

## 2. Escopo

### 2.1 Dentro deste projeto
- As 5 etapas do PDF, com status, telas e histórico.
- **Mercado Livre automático**, pelo app próprio criado pela empresa no ML Developers.
- **Amazon, Shopee, Magalu, TikTok Shop e Shein:** cadastro manual e importação de planilha.
- Conferência pelo celular ou tablet: Fotos 1 a 4, Vídeo de Prova e leitura do código de barras pela câmera.
- Emissão de NF-e (devolução de venda e remessa ao fornecedor) por um emissor via API.
- Agrupamento automático em lotes por fornecedor, com vínculo dos números de série e lista consolidada.
- Login individual com perfis Operador, Fiscal e Gestor.
- Hospedagem na VPS própria (Docker Compose).

### 2.2 Fora (fases futuras)
- Integração automática com Amazon, Shopee, Magalu, TikTok Shop e Shein.
- Integração com o ERP **Bitbrain**. O conector fica reservado, e até lá vale a ponte por exportação de XML (§8.7).
- Rastreio automático nos Correios e transportadoras para os canais manuais.
- Mapeamento de colunas por canal na importação de planilha (a v1 usa um modelo padrão).
- App nativo, carta de correção (CC-e) e inutilização de numeração pelo sistema.

## 3. Decisões tomadas

| Tema | Decisão |
|---|---|
| ERP | O Bitbrain continua existindo (ele puxa as notas do ML). Conexão com ele: opcional, no futuro |
| Entrada do ML | Automática, pelo app próprio no ML Developers: avisos do ML mais varredura periódica |
| Outros canais | Cadastro manual e importação de planilha (modelo padrão) |
| Aparelho da conferência | Celular ou tablet na bancada: câmera no navegador e leitura de código pela câmera |
| Hospedagem | VPS própria |
| Volume | 20 a 100 devoluções por dia, o que exige compressão de vídeo e prazo de guarda |
| Fornecedor de cada produto | Vem de planilha, importada para um cadastro próprio do sistema |
| Usuários | Perfis Operador, Fiscal e Gestor, com histórico de quem fez cada ação |
| Notas fiscais | **O sistema emite** as NF-e de devolução e de remessa, via emissor por API (sugestão: Focus NFe) |
| Regime tributário | Escolhido pelo Gestor nas Configurações: Simples Nacional, Lucro Presumido ou Lucro Real |
| Contestação no ML | Se tudo estiver Bom, o aviso ao ML é automático. Se houver Problema, a contestação vai para revisão do Gestor, que envia com 1 clique |
| Evidências | Fotos 1 e 2 por pacote; Fotos 3 e 4 por item; um Vídeo de Prova contínuo por pacote |
| Tecnologia | Abordagem A: um sistema único em TypeScript (Next.js, PostgreSQL e um processo separado para as tarefas de fundo) |

## 4. Arquitetura

### 4.1 O que roda na VPS (Docker Compose)

```
VPS
├─ caddy     → HTTPS automático (ex.: devolucoes.<dominio>.com.br)
├─ web       → Next.js: telas, API, recebimento dos avisos do ML e upload
├─ worker    → processo Node que executa a fila pg-boss: sincronização com o ML,
│              compressão de vídeo (ffmpeg), emissão e consulta de NF-e,
│              renovação do acesso ao ML, prazo de guarda das mídias
├─ postgres  → dados e fila de tarefas (pg-boss usa o próprio PostgreSQL)
└─ backup    → rotina diária: cópia do banco e dos arquivos para fora da VPS
```

- O `web` e o `worker` saem do **mesmo repositório e da mesma base de código**. O que muda é só o ponto de entrada.

### 4.2 Tecnologias
- TypeScript, Next.js (App Router) e PostgreSQL com Drizzle ORM.
- pg-boss para a fila de tarefas.
- Tailwind e shadcn/ui no visual. A tela de conferência funciona como PWA (instalável no celular).
- Leitura de código de barras: `BarcodeDetector` do navegador, com ZXing como alternativa (iOS Safari).
- Upload que retoma de onde parou: protocolo tus.
- ffmpeg para os vídeos.
- Vitest e Playwright para os testes.
- A biblioteca de autenticação será definida no plano de implementação. Requisitos: e-mail e senha, sessão guardada no banco.

### 4.3 Módulos

| Módulo | Responsabilidade |
|---|---|
| `devolucoes` | A devolução e seus itens, as regras de mudança de status e o histórico |
| `conferencia` | O fluxo da bancada: evidências, leitura de código e decisão Bom ou Problema |
| `catalogo` | Produtos e fornecedores, com importação de planilha |
| `fiscal` | Configurações fiscais, regras de CFOP e de CST/CSOSN, montagem e ciclo de vida das NF-e |
| `lotes` | Agrupamento por fornecedor, fechamento, remessa e resultado de cada item |
| `midia` | Recebimento, compressão, armazenamento, links temporários e prazo de guarda |
| `auth` | Usuários, perfis e checagem de permissão no servidor |
| `conectores/marketplace` | Interface comum a todos os canais. Implementação: Mercado Livre |
| `conectores/nfe` | Interface do emissor. Implementação: Focus NFe |
| `conectores/erp` | Reservado (Bitbrain) |

**Regra:** o núcleo (`devolucoes`, `conferencia`, `fiscal`, `lotes`) nunca chama uma API externa diretamente. Ele só usa as interfaces abaixo, e os testes usam implementações falsas.

```ts
interface MarketplaceConnector {
  canal: Canal;
  listarAtualizadasDesde(desde: Date): AsyncIterable<DevolucaoExterna>;
  obter(idExterno: string): Promise<DevolucaoExterna>;
  enviarResultadoConferencia(idExterno: string, r: ResultadoConferencia): Promise<void>;
}

interface EmissorNFe {
  emitir(nota: NotaParaEmissao): Promise<{ referencia: string }>;
  consultar(referencia: string): Promise<SituacaoNota>; // autorizada | rejeitada | processando
  cancelar(referencia: string, justificativa: string): Promise<SituacaoNota>;
}

interface ArmazenamentoArquivos { // disco local ou armazenamento compatível com S3 (R2, B2)
  salvar(caminho: string, conteudo: Readable): Promise<void>;
  ler(caminho: string): Promise<Readable>;
  urlTemporaria(caminho: string, segundos: number): Promise<string>;
  apagar(caminho: string): Promise<void>;
}
```

## 5. Modelo de dados

### 5.1 Entidades

- **Devolucao:**
  - `codigo` (DEV-000123), `canal`, `origem` (api, manual ou planilha)
  - `pedido_externo` (um ou mais), `reclamacao_id`, `devolucao_externa_id` (no ML, é o `return_id`, chave única por canal)
  - `tipo` (devolução ou troca), `rastreio`, `transportadora`, `status`, `status_canal` (o valor bruto que veio do canal)
  - `entregue_segundo_canal_em`, `prazo_conferencia_canal` (o `due_date` do ML)
  - `nao_identificada` (booleano), `conferente_id` e `conferencia_iniciada_em` (a trava da conferência)
  - datas de cada etapa e `observacoes`
- **ItemDevolucao:** **uma linha por unidade física.** Um pedido com quantidade 3 vira 3 itens, para que cada unidade tenha seu próprio nº de série e seu próprio destino.
  - `devolucao_id`, `produto_esperado_id`, `produto_recebido_id`, `sku`, `ean_lido`
  - `serial`, `lote_fabricacao`, `validade`
  - `destino` (BOM ou PROBLEMA), `motivo` (avariado, usado, divergente, incompleto, com defeito, ausente, outro), `observacao`
  - `status`, `lote_id`, `resultado_fornecedor`
- **Evidencia:**
  - `devolucao_id`, `item_id` (preenchido nas Fotos 3 e 4)
  - `tipo` (FOTO_1_ETIQUETA, FOTO_2_EMBALAGEM, FOTO_3_PRODUTO, FOTO_4_CODIGO_SERIAL, VIDEO_PROVA, EXTRA)
  - `caminho`, `tamanho`, `sha256_original`, `sha256_final`
  - `situacao_processamento`, `enviado_por` e `enviado_em`
- **Produto:** `sku` (único), `ean`, `descricao`, `fornecedor_id`, `ncm`, `custo`, `unidade`.
- **Fornecedor:** `razao_social`, `cnpj` (único), `ie`, endereço completo com UF, `contato_sac` e `email_sac`.
- **Lote:**
  - `codigo` (LOT-000045), `fornecedor_id`, `tipo` (conserto, troca ou garantia; definido ao fechar)
  - `status`, `rastreio_envio`, `nota_fiscal_id`
- **NotaFiscal:**
  - `tipo` (DEVOLUCAO_VENDA, REMESSA_CONSERTO ou REMESSA_TROCA_GARANTIA), `devolucao_id` ou `lote_id`
  - `serie`, `numero`, `chave`, `chaves_referenciadas[]`
  - `situacao`, `motivo_rejeicao`, `referencia_emissor`, `xml_caminho` e `danfe_caminho`
- **RegraFiscal:** `tipo_nota`, `operacao` (dentro ou fora do estado) e, para essa combinação: CFOP, CST/CSOSN do ICMS, CST do PIS e do COFINS e modelo de informações complementares.
- **Configuracao:**
  - dados da empresa (razão social, CNPJ, IE, endereço e UF) e `regime_tributario` (SIMPLES, PRESUMIDO ou REAL)
  - `serie_nfe` e `ambiente_nfe` (homologação ou produção)
  - `video_obrigatorio` (SEMPRE ou SO_PROBLEMA; padrão SEMPRE) e `meses_retencao_midia` (padrão 12)
  - provedor de armazenamento
- **ContaMarketplace:** `canal`, `seller_id`, `access_token` e `refresh_token` (criptografados), `expira_em` e `situacao`.
- **ContestacaoCanal:**
  - `devolucao_id`, `motivo_canal` (ex.: SRF2), `mensagem`, `evidencias[]`, `prazo`
  - `status` (AGUARDANDO_GESTOR, ENVIADA ou FALHOU), `revisado_por`
- **EventoHistorico:** `entidade`, `entidade_id`, `de`, `para`, `acao`, `usuario_id` (vazio quando a ação é do sistema), `em` e `dados` (JSON).
- **Usuario:** `nome`, `email`, `senha_hash`, `perfil` (OPERADOR, FISCAL ou GESTOR) e `ativo`.

### 5.2 Status da devolução (o pacote)

```
PENDENTE_CHEGADA → AGUARDANDO_CONFERENCIA → EM_CONFERENCIA → AGUARDANDO_NF → CONCLUIDA
   (etapa 1)              (etapa 2)               (etapa 3)        (etapa 4)
Exceções: CANCELADA · EXTRAVIADA · NO_CD_MARKETPLACE
```

| De | Para | Gatilho | Quem |
|---|---|---|---|
| (nova) | PENDENTE_CHEGADA | Criação pelo ML, pelo cadastro manual ou pela planilha | sistema, Operador ou Gestor |
| PENDENTE_CHEGADA | AGUARDANDO_CONFERENCIA | Leitura do rastreio na recepção física | Operador |
| (nova) | AGUARDANDO_CONFERENCIA com `nao_identificada` | Rastreio lido sem nenhum cadastro correspondente | Operador |
| AGUARDANDO_CONFERENCIA | EM_CONFERENCIA | Operador abre a conferência (a devolução fica travada com ele) | Operador |
| EM_CONFERENCIA | AGUARDANDO_CONFERENCIA | Operador desiste, ou o Gestor libera a trava | Operador ou Gestor |
| EM_CONFERENCIA | AGUARDANDO_NF | Evidências obrigatórias completas e todos os itens com destino | Operador |
| AGUARDANDO_NF | CONCLUIDA | NF de devolução autorizada, ou nenhum item físico a dar entrada (todos AUSENTE) | sistema |
| CONCLUIDA | AGUARDANDO_NF | NF de devolução cancelada (só se os itens PROBLEMA ainda estiverem em lote ABERTO; eles saem do lote) | sistema |
| PENDENTE_CHEGADA | CANCELADA ou EXTRAVIADA | Status do canal, ou ação manual | sistema ou Gestor |
| PENDENTE_CHEGADA | NO_CD_MARKETPLACE | Destino do envio é o CD do marketplace (Full ou triagem) | sistema |
| NO_CD_MARKETPLACE | PENDENTE_CHEGADA | O ML reenvia ao vendedor (`return_from_triage`) | sistema |

- **"Entregue" segundo o ML não muda o status.** A etapa 2 do PDF é o **recebimento físico**, então só a leitura do rastreio na recepção move a devolução.
  - O aviso de entrega do ML preenche `entregue_segundo_canal_em`, e a devolução aparece no topo da etapa 1 com a marca "Entregue (ML)".
  - **(extra)** Se não houver leitura física em 2 dias úteis, surge um alerta no painel (possível extravio interno).
- **Pacote não identificado:** depois que o pedido certo é descoberto, o Gestor liga a devolução "não identificada" a ele (ou junta as duas) e a marca sai.
- Uma mudança que não está na tabela é recusada **no servidor**. Toda mudança gera um EventoHistorico.

### 5.3 Status do item (uma unidade)

```
PENDENTE ──conferência──► AGUARDANDO_NF ──NF autorizada──┬─ BOM      → DISPONIVEL_VENDA
                                                          └─ PROBLEMA → EM_LOTE → ENVIADO → RESOLVIDO
                                                                         ▲
                                         SEM_FORNECEDOR ─(produto/fornecedor associado)─┘
PENDENTE ──conferência (motivo "ausente")──► AUSENTE   (não entra na NF nem no lote; gera contestação)
```

- **Quando a NF de devolução é autorizada,** cada item PROBLEMA entra **automaticamente** no lote ABERTO do fornecedor do `produto_recebido` (se não houver lote aberto, o sistema cria um).
  - Se não for possível saber o fornecedor, o item vai para `SEM_FORNECEDOR`, uma pendência visível ao Fiscal e ao Gestor.
- `RESOLVIDO` registra o `resultado_fornecedor`: trocado, consertado, crédito, descartado ou devolvido sem solução.

### 5.4 Status do lote

```
ABERTO → FECHADO → NF_EMITIDA → ENVIADO → FINALIZADO
   ▲________│ (reabrir antes da NF)
```

- Existe **no máximo um lote ABERTO por fornecedor.**
- Ao fechar, o Fiscal escolhe o tipo (conserto, troca ou garantia). Antes disso, pode mover itens para outro lote, por exemplo para separar conserto de troca.
- O lote passa para FINALIZADO quando todos os seus itens estão RESOLVIDO.

### 5.5 Status da nota fiscal

```
PROCESSANDO → AUTORIZADA → CANCELADA (dentro do prazo legal)
     └──────→ REJEITADA → (corrigir) → PROCESSANDO
```

## 6. Telas e fluxo operacional

O menu repete o organograma do PDF.

### 6.0 Painel
- Um cartão por etapa, com a contagem.
- Alertas:
  - prazo do ML vencendo
  - NF rejeitada
  - sincronização com o ML parada há mais de 1h
  - itens SEM_FORNECEDOR
  - **(extra)** devolução "Entregue (ML)" sem leitura física

### 6.1 Pedidos Pendentes de Chegada
- Lista com a Busca Avançada.
- Devoluções do ML entram sozinhas.
- Botões **Nova devolução** (formulário: canal, pedido, ID da reclamação, rastreio, transportadora, itens por SKU e quantidade) e **Importar planilha** (modelo padrão com as colunas `canal, numero_pedido, id_reclamacao, rastreio, transportadora, sku, quantidade, motivo_cliente, data_postagem`).
- A importação mostra uma prévia, com os erros de cada linha, antes de confirmar.

### 6.2 Pedidos Chegados: Aguardando Conferência
- A tela de **Recebimento** lê o rastreio pela câmera (ou por digitação) e registra a chegada: data, hora e usuário.
- Se não achar o rastreio, oferece criar uma devolução "não identificada", com Foto 1 e Foto 2.

### 6.3 Em Conferência / Triagem & Registro de Evidências (celular)

Assistente passo a passo:
1. **Foto 1:** etiqueta de rastreio e declaração de conteúdo.
2. **Foto 2:** estado da embalagem externa.
3. Para cada item (cada unidade):
   - **Foto 3:** produto fora da caixa (visão geral).
   - Leitura do código de barras. Se o EAN for diferente do esperado, o sistema sugere o motivo "divergente".
   - **Foto 4:** código de barras, nº de série (S/N) e lote/validade, com os campos série, lote e validade.
4. **Vídeo de Prova:** gravar na hora ou enviar um arquivo. O vídeo é contínuo e mostra o teste de funcionamento ou o defeito/avaria. É obrigatório conforme a configuração `video_obrigatorio`.
5. **Destino de cada item:** Estoque Bom ou Estoque Problema, com motivo e observação. Também é possível marcar o item como **ausente** (não veio no pacote).

Regras da conferência:
- **A conferência não termina** enquanto faltar evidência obrigatória ou algum arquivo não tiver subido.
- Ao terminar, se a devolução for do ML:
  - todos os itens BOM: o resultado "OK" vai **automaticamente** para o ML;
  - algum item PROBLEMA ou AUSENTE: é criada uma `ContestacaoCanal` AGUARDANDO_GESTOR, com motivo e fotos já preenchidos.

### 6.4 Destinação Fiscal e Estoque
- Abas **Estoque Bom** e **Estoque Problema**, ambas com as devoluções em AGUARDANDO_NF e com a Busca Avançada.
  - Uma devolução com itens dos dois destinos aparece nas duas abas.
- O Fiscal seleciona uma ou mais devoluções e clica em **Emitir NF de devolução**. É emitida uma NF por devolução.
- Ao autorizar: itens BOM vão para DISPONIVEL_VENDA, e itens PROBLEMA vão para os lotes (§5.3).

### 6.5 Agrupamento por Fornecedor (Remessas)
- Lista de lotes, filtrável por fornecedor e por status.
- O detalhe do lote mostra itens, nº de série, motivo e um link para as evidências.
- **Fechar lote** (com a escolha do tipo) → **Emitir NF de Remessa** → **Lista consolidada** (PDF e Excel: fornecedor, NF de remessa, itens, nº de série, motivo, nº da devolução) para enviar ao SAC do fabricante.
- Depois: **Registrar envio** (rastreio) e **Registrar resultado** de cada item.

### 6.6 Contestações (Gestor, extra)
- Fila das `ContestacaoCanal` com o prazo do ML em destaque.
- O Gestor revisa o motivo, a mensagem e as fotos e clica em **Enviar ao ML**.

### 6.7 Busca Avançada (igual ao PDF; disponível em todas as listas)
- Código de Rastreamento (logística reversa, Correios ou transportadora)
- Número do Pedido e ID da Reclamação/Mediação do Marketplace
- Marketplace de Origem e Status Operacional Atual
- Fornecedor ou Código de Barras / Serial Number
- **(extra)** Período

### 6.8 Cadastros e Configurações
- **Produtos e Fornecedores:** listas editáveis e importação de planilha (CSV ou XLSX), com prévia e validação.
  - Produtos: `sku, ean, descricao, cnpj_fornecedor, ncm, custo, unidade`.
  - Fornecedores: `razao_social, cnpj, ie, logradouro, numero, complemento, bairro, cidade, uf, cep, contato_sac, email_sac`.
  - A importação atualiza o que já existe pelo SKU (produtos) ou pelo CNPJ (fornecedores).
- **Configurações (Gestor):** dados da empresa, regime tributário, regras fiscais, série e ambiente da NF-e, conexão com o ML, obrigatoriedade do vídeo, prazo de guarda das mídias, armazenamento e usuários.
- **Falhas (Gestor):** tarefas de fundo que esgotaram as tentativas, com o motivo e o botão "tentar de novo".

### 6.9 Permissões

| Ação | Operador | Fiscal | Gestor |
|---|:-:|:-:|:-:|
| Ver listas e busca | ✓ | ✓ | ✓ |
| Criar ou importar devolução, receber, conferir | ✓ | | ✓ |
| Emitir ou cancelar NF, gerir lotes | | ✓ | ✓ |
| Importar catálogo, editar produtos e fornecedores | | ✓ | ✓ |
| Contestações, Configurações, usuários, Falhas, liberar trava | | | ✓ |

## 7. Integração com o Mercado Livre

Referência: pesquisa na documentação oficial em pt_br, consultada em 2026-11-11.

### 7.1 Autorização
- OAuth2 (authorization code) em `https://auth.mercadolivre.com.br/authorization`, com troca do código em `POST https://api.mercadolibre.com/oauth/token`.
  - Usar PKCE se estiver ativado no app.
  - Quem autoriza é a **conta administradora principal**. Conta de colaborador falha com `invalid_operator_user_id`.
- **Prazos:** o access token dura 6h. O refresh token vale 6 meses e **é de uso único**: sempre guardar o novo.
  - Tarefa `ml.renovar-token` a cada ~5h, com trava para não haver duas renovações simultâneas.
- **Quando o token é invalidado:** troca de senha, troca do segredo do app, revogação, ou 4 meses sem chamadas.
  - Nesses casos, a ContaMarketplace fica `situacao=RECONECTAR` e aparece um alerta no painel.
- **Permissões do app:** "Vendas e envios", "Comunicação pré e pós-venda" e "Faturamento", em leitura e escrita.

### 7.2 Entrada de devoluções
- **Avisos (webhook):** tópico `post_purchase`, sub-tópicos `claims` e `claims_actions`.
  - O endpoint responde **HTTP 200 imediatamente** (o ML exige menos de 500 ms), grava o aviso e enfileira `ml.sincronizar-reclamacao`.
  - O conteúdo do aviso é usado só como gatilho: **o sistema sempre busca o recurso de novo na API**.
- **Varredura** a cada 15 min: `GET /post-purchase/v1/claims/search?players.user_id={seller}&players.role=respondent&range=last_updated:after:{iso-com-ms}`.
  - Paginação com `limit` de no máximo 100, e `offset+limit` abaixo de 10000.
- **Sincronizar uma reclamação:**
  1. `GET /post-purchase/v1/claims/{id}`
  2. se `related_entities` contém `return`, então `GET /post-purchase/v2/claims/{id}/returns`
  3. pedidos: `GET /orders/{id}`, que traz `seller_sku` e `variation_id`
  4. GTIN do produto: `/items/{id}`
  5. envios: `/shipments/{id}` com o cabeçalho `x-format-new: true`
  6. com tudo isso, a devolução é criada ou atualizada; a chave é `return.id`
- Uma devolução pode cobrir **vários pedidos** (`orders[]`). As trocas (`type=change`) também geram devolução.
- **Limite de requisições:** a resposta 429 `local_rate_limited` exige nova tentativa com espera crescente e jitter.

### 7.3 Status do ML para as etapas

| `return.status` / envio | Sistema |
|---|---|
| pending, label_generated, scheduled, shipped, pending_delivered | PENDENTE_CHEGADA |
| delivered (com `destination.name=seller_address`) | preenche `entregue_segundo_canal_em`; **o status continua o mesmo** (§5.2) |
| cancelled, pending_cancel, expired, pending_expiration, return_to_buyer | CANCELADA (se ainda estava em PENDENTE_CHEGADA) |
| not_delivered, failed, pending_failure | EXTRAVIADA (se ainda estava em PENDENTE_CHEGADA) |
| envio com `destination.name=warehouse` (Full ou triagem) | NO_CD_MARKETPLACE |
| envio `return_from_triage` para o vendedor | PENDENTE_CHEGADA |
| `subtype=low_cost` sem envio físico | registrada só para consulta, fora do fluxo físico |

- Se o status do ML mudar depois que a devolução já chegou fisicamente, o status do sistema não muda: só aparece um alerta para o Gestor.

### 7.4 Saída: resultado da conferência
- **Tudo OK:** `POST /post-purchase/v1/returns/{return_id}/return-review` com o corpo `{}`.
- **Problema:**
  1. Subir as fotos com `POST /post-purchase/v1/claims/{claim_id}/returns/attachments` (multipart `file`), que devolve `file_name`.
  2. Enviar `return-review` com `[{reason, message, attachments[], order_id?}]`. Os motivos vêm de `GET /post-purchase/v1/returns/reasons?flow=seller_return_failed&claim_id=`.
- **Tradução dos motivos:**
  - avariado → SRF2 (anexo obrigatório)
  - incompleto → SRF3
  - divergente → SRF4 (anexo obrigatório)
  - ausente → SRF5
  - usado, com defeito ou outro → SRF6
- **Fotos:** enviar JPG de até 5 MB. **O vídeo não vai para o ML**: fica no sistema como prova.
- **Prazo:** o `due_date` da ação `return_review` (ou `return_review_ok` / `return_review_fail`) em `players[].available_actions` vira `prazo_conferencia_canal`.

### 7.5 NF de venda (para a NF de devolução)
- Notas emitidas pelo emissor do ML: `GET /invoices/orders/{order_id}` (ou `/users/{uid}/invoices/{id}`). O XML vem de `/invoices/documents/xml/{id}/authorized`.
- Se não houver nota no ML, **o Fiscal anexa o XML da NF de venda** (baixado do Bitbrain). O sistema extrai a chave, o destinatário e os valores.

### 7.6 Pontos a confirmar no teste da Fase 0
1. Se `/shipments/{id}` (com `x-format-new: true`) funciona para os IDs de envio de devolução e entrega transportadora e datas.
2. Se as notas de venda da conta aparecem em `/invoices/orders/{order_id}`.
3. Se o tópico `shipments` dispara para envios de devolução.
4. Se os avisos chegam à VPS dentro do limite de 500 ms.
5. O formato real de `type` (`return` ou `returns`) e das quantidades (que vêm como string, ex.: "1.0").

As respostas reais desse teste viram exemplos gravados para os testes automatizados.

## 8. Emissão de NF-e

### 8.1 Emissor
- **Focus NFe** (API REST), atrás da interface `EmissorNFe`. Pode ser trocado por NFE.io ou PlugNotas.
- O **certificado A1** é cadastrado no painel do emissor e não fica guardado no sistema.
- **Série exclusiva** (ex.: série 2), configurável, para não colidir com a numeração do Bitbrain.
- **Ambiente:** começa em **homologação**. A passagem para produção é uma ação do Gestor, depois da validação do contador.

### 8.2 Regime e regras
- O `regime_tributario` define se o ICMS usa **CSOSN** (Simples) ou **CST** (Presumido e Real).
- `RegraFiscal` define, por tipo de nota e por operação (dentro ou fora do estado): CFOP, CST/CSOSN, CST de PIS e COFINS e informações complementares.
- Se faltar a regra de uma combinação, a emissão é recusada, com uma mensagem dizendo qual regra falta.

### 8.3 Sugestões iniciais de CFOP (editáveis; **o contador valida**)

| Nota | Dentro do estado | Fora do estado |
|---|---|---|
| Devolução de venda (entrada) | 1202 | 2202 |
| Remessa para conserto | 5915 | 6915 |
| Remessa para troca ou garantia | definido pelo contador (ex.: 5949 ou 5202) | (ex.: 6949 ou 6202) |

### 8.4 Montagem da NF de devolução de venda
- **Emitente:** a empresa (Configurações). **Destinatário:** o comprador, com os dados tirados do XML da NF de venda.
- **Finalidade:** devolução. **Notas referenciadas:** as chaves das NF de venda (uma ou mais).
- **Itens:** os itens da devolução com status AGUARDANDO_NF, exceto os AUSENTE. Valores e tributos acompanham a NF de venda, proporcionais à quantidade devolvida.
- **Operação:** comparação entre a UF da empresa e a UF do destinatário.

### 8.5 Montagem da NF de remessa
- **Destinatário:** o fornecedor do lote (CNPJ, IE e endereço do cadastro).
- **Itens:** os itens do lote. NCM e valor vêm do `custo` do Produto. A base de valor deve ser validada pelo contador.
- **Informações complementares:** a lista de nº de série e o código do lote.

### 8.6 Ciclo de vida
- **Emitir:** a tarefa `nfe.emitir` deixa a nota em PROCESSANDO, e a tarefa `nfe.consultar` repete a consulta com espera crescente até sair o resultado:
  - **AUTORIZADA:** o XML e o DANFE ficam salvos e o efeito correspondente é aplicado (§6.4 ou §6.5).
  - **REJEITADA:** o motivo da SEFAZ aparece em português, com a ação "corrigir e reenviar".
- **Cancelar:** pelo Fiscal, dentro do prazo legal e com justificativa. O sistema recusa o cancelamento de uma NF de devolução se algum item PROBLEMA dela estiver num lote que já não está ABERTO. Ao cancelar, o efeito é desfeito:
  - **NF de devolução:** a devolução e os itens voltam para AGUARDANDO_NF, e os itens saem do lote.
  - **NF de remessa:** o lote volta para FECHADO.

### 8.7 Ponte com o Bitbrain
- O botão **Baixar XMLs do período** gera um ZIP com os XMLs autorizados, para importar no Bitbrain até existir a integração.

## 9. Fotos e vídeos (mídia)

- **Fotos:**
  - Comprimidas no celular antes do envio: JPEG com cerca de 1600 px no maior lado, ~400 KB.
  - **(extra)** Carimbo gravado na imagem no servidor: data e hora, código da devolução e usuário.
- **Vídeos:**
  - Upload em partes (tus), que retoma após queda de conexão.
  - A tarefa `midia.transcodificar` converte com ffmpeg para H.264 720p (cerca de 10 a 15 MB por minuto). O original só é apagado depois do sucesso.
- **Integridade:** o SHA-256 do arquivo é calculado ao receber (`sha256_original`) e depois de processado (`sha256_final`), e os dois ficam registrados no histórico.
- **Celular sem internet:** os arquivos pendentes ficam guardados no aparelho (IndexedDB) e sobem quando a conexão volta.
- **Armazenamento:** começa no disco da VPS (`/data/midia`). Pode passar para um armazenamento compatível com S3 (Cloudflare R2 ou Backblaze B2) só por configuração.
  - Estimativa: 35 a 50 GB por mês com 100 devoluções por dia.
- **Prazo de guarda:** a tarefa diária `midia.retencao` apaga a mídia de devoluções CONCLUIDA há mais de `meses_retencao_midia` (padrão 12).
  - **Nunca apaga** se houver item em lote ainda não FINALIZADO ou contestação ainda não resolvida.
- **Acesso:** sempre por link temporário (ex.: 10 min), nunca público.

## 10. Segurança

- HTTPS (Caddy).
- Senhas guardadas com hash (argon2 ou bcrypt). Bloqueio temporário depois de várias falhas de login.
- A permissão de cada perfil é checada **no servidor**, em toda ação. Esconder botão não basta.
- Os tokens do ML ficam criptografados no banco (AES-256-GCM, com a chave numa variável de ambiente).
- Segredos ficam no `.env`, fora do git.
- Os avisos do ML são usados só como gatilho: o sistema sempre consulta a API de novo (§7.2).
- **Dados pessoais (LGPD):** guardar só o mínimo do comprador, ou seja, o necessário para a NF.
- **Backup diário:** `pg_dump` mais os arquivos, para fora da VPS (ex.: B2 ou R2), guardados por 30 dias, com um procedimento de restauração documentado e testado.

## 11. Erros e monitoramento

- **Tarefas de fundo:** nova tentativa com espera crescente. Depois de 5 tentativas sem sucesso, a tarefa vai para a tela **Falhas** (§6.8).
- **Trava de conferência:** `conferente_id` faz com que um segundo operador veja "em conferência por Fulano". O Gestor pode liberar a trava.
- **Sem duplicatas:** cada devolução é única por (`canal`, `devolucao_externa_id`), e reprocessar o mesmo aviso não muda o resultado.
- **Registros e saúde:** logs estruturados (JSON) no `web` e no `worker`, e um endpoint `/saude` que verifica o banco e a fila.
- **Alerta no painel** se a última sincronização bem-sucedida com o ML tiver mais de 1h.

## 12. Testes

- **Regras do núcleo** (Vitest):
  - transições de status (§5.2 a §5.5), incluindo as recusas
  - alocação automática em lotes e o caso SEM_FORNECEDOR
  - tradução dos status e motivos do ML
  - montagem dos dados das NF (devolução e remessa) para cada regime
  - importação de planilhas (linhas válidas e inválidas)
- **Integração com banco:** PostgreSQL real (Docker), conectores falsos e respostas gravadas do ML (§7.6).
- **Ponta a ponta** (Playwright): recebimento → conferência (com upload de arquivos de teste) → NF (com o emissor falso) → lote → lista consolidada.
- **Fiscal:** toda NF passa pela homologação da SEFAZ antes da produção.

## 13. Deploy e ambientes

- **Repositório:** git privado (GitHub). Imagens Docker do `web` e do `worker`.
- **Deploy:** um comando (script, ou GitHub Actions via SSH) faz `docker compose pull && up -d`. As migrações do banco rodam automaticamente na subida.
- **Desfazer:** voltar para a tag da imagem anterior.
- **Desenvolvimento local:** Docker Desktop no PC (PostgreSQL e ffmpeg em contêiner) e `npm run dev`.
- **VPS:** mínimo de 2 vCPU, 4 GB de RAM e 200 GB de disco. **Recomendado:** 4 vCPU e 8 GB, por causa do ffmpeg.

## 14. Fases de entrega

| Fase | Entrega | Critério de pronto |
|---|---|---|
| 0. Fundação | Projeto, banco, login e perfis, visual base, deploy na VPS com HTTPS, teste real da API do ML (§7.6) | Login funcionando no subdomínio; respostas reais do ML gravadas |
| 1. Cadastros e recebimento | Importação de produtos e fornecedores, devolução manual e por planilha, etapas 1 e 2, Busca Avançada | Devolução cadastrada e recebida pela leitura do rastreio no celular |
| 2. Conferência no celular | Fotos 1 a 4, Vídeo de Prova, leitura do código, destino, mídia (compressão, armazenamento, links) | Conferência completa no celular, com o vídeo comprimido |
| 3. Mercado Livre | OAuth, avisos e varredura, mapeamento, resposta OK automática, Contestações | Devolução real do ML entra sozinha; contestação enviada pelo Gestor |
| 4. Fiscal | Configurações fiscais, Focus NFe, NF de devolução, etapa 4, ZIP de XMLs | NF de devolução autorizada em homologação |
| 5. Remessas | Lotes automáticos, fechamento, NF de Remessa, lista consolidada, envio e resultado | NF de remessa autorizada em homologação e lista gerada |
| 6. Acabamento | Painel com alertas, Falhas, prazo de guarda, backup, passagem para produção | Restauração de backup testada; NF em produção aprovada pelo contador |

- A partir da Fase 2 o sistema já pode ser usado na bancada, com as devoluções cadastradas manualmente ou por planilha.

## 15. O que a empresa precisa fornecer

| Quando | Item |
|---|---|
| Fase 0 | VPS (§13), subdomínio, Docker Desktop no PC de desenvolvimento |
| Fase 1 | Planilha de produtos (SKU, EAN, fornecedor, NCM, custo) e de fornecedores (CNPJ, IE, endereço, SAC) |
| Fase 3 | App no ML Developers (client_id e secret; URL de retorno e permissões indicadas na fase), acesso à conta administradora principal |
| Fase 4 | Conta na Focus NFe com o certificado A1, dados fiscais da empresa e validação dos CFOPs e CSTs pelo contador |

## 16. Riscos e pontos em aberto

- **Documentação do ML incompleta ou mudando** (datas e transportadora da devolução, descontinuação da visão detalhada de envios): será resolvido no teste da Fase 0, antes da Fase 3.
- **Regras fiscais:** CFOP, CST e a base de valor da remessa dependem do contador. O sistema não decide tributação sozinho.
- **Estoque fiscal no Bitbrain:** as notas emitidas pelo sistema não entram no Bitbrain automaticamente. A mitigação é o ZIP de XMLs (§8.7), até existir a integração.
- **iOS Safari:** a leitura de código de barras é limitada lá, por isso a alternativa ZXing. Os testes da Fase 2 devem incluir os aparelhos reais da bancada.
- **Espaço em disco:** monitorar o uso. O plano B é o armazenamento compatível com S3.
