# Gestão de Devoluções

Sistema de gestão de devoluções dos marketplaces (Mercado Livre, Amazon, Shopee, Magalu, TikTok Shop e Shein).

- Design: [docs/superpowers/specs/2026-11-11-gestao-devolucoes-design.md](docs/superpowers/specs/2026-11-11-gestao-devolucoes-design.md)
- Planos: [docs/superpowers/plans/](docs/superpowers/plans/)
- Implantação: [docs/operacao/deploy-vps.md](docs/operacao/deploy-vps.md)

## Rodar no seu computador
Pré-requisitos:
- Node 24.
- PostgreSQL 17 com o usuário `devolucoes` (senha `devolucoes`), dono dos bancos `devolucoes` e `devolucoes_test`.

```sh
cp .env.example .env
npm install
npm run db:migrar
npm run usuario:criar -- --nome "Seu Nome" --email voce@empresa.com --perfil GESTOR
npm run dev                   # http://localhost:3000
```

## O que existe hoje (Fases 0, 1, 2, 3 e 4)
Tudo pensado primeiro para o celular (390×844): cartões no lugar de tabelas, formulários em uma coluna, barra de abas embaixo, alvos de toque de 44 px, app instalável (PWA).
- Login, três perfis (Operador, Fiscal, Gestor) e permissões por ação; barra de abas que muda conforme o perfil.
- Quadro de Fluxo com as 5 etapas do PDF e Busca Avançada.
- Devoluções: cadastro manual, importação por planilha agrupando por pedido (extra), histórico de eventos.
- Recebimento com a câmera em tela cheia (leitor de código de barras) ou digitando o código. Pacote não identificado com as Fotos 1 e 2.
- Conferência no celular, unidade por unidade: Fotos 1 a 4, leitura do código (EAN), Serial Number, lote e validade, Vídeo de Prova comprimido, destino e unidade ausente. Trava da conferência, que o Gestor pode liberar. Funciona sem rede: as fotos e os vídeos esperam no aparelho e sobem sozinhos quando a conexão volta.
- Mercado Livre (com o ML simulado até a "Ligação das contas reais"): conexão da conta administradora em Configurações › Mercado Livre, devoluções que entram sozinhas pelos avisos e pela varredura de 15 min, status do ML no detalhe da devolução, "OK" automático quando todas as unidades vão para o Estoque Bom e a tela Contestações ML, onde o Gestor revisa o motivo, a mensagem e as fotos e toca em "Enviar ao ML".
- Fiscal (com o emissor de NF-e simulado até a "Ligação das contas reais"): Configurações fiscais (dados da empresa, ambiente da NF-e e regras fiscais), etapa 4 "Destinação Fiscal e Estoque" com as abas Estoque Bom e Estoque Problema, NF de venda buscada no Mercado Livre ou anexada pelo XML, NF de devolução emitida, corrigida e reenviada depois de uma rejeição, cancelada em até 24 h, DANFE e XML de cada nota e o ZIP dos XMLs do período.
- Cadastros de produtos e fornecedores, com importação por planilha (extra).
- Usuários (só o Gestor): criar, mudar o perfil, desativar e reativar. Desativar encerra as sessões na hora, e o sistema nunca fica sem um Gestor ativo (extra).

Ainda não existem: lotes e remessas (com a NF de remessa) e relatórios. Ficam para as próximas fases.

## Conferência no celular (Fase 2)
A conferência (Fotos 1 a 4, leitura do código, Vídeo de Prova e destino de cada unidade) precisa de duas coisas além do site:

1. **ffmpeg** no PC, para comprimir o Vídeo de Prova em 720p: `winget install Gyan.FFmpeg`. Depois, abra um terminal novo e confira com `ffmpeg -version`. Sem o ffmpeg, os testes que o usam são pulados.
2. **Worker** rodando junto do site, em outro terminal: `npm run worker`. Ele faz as tarefas da fila: `midia.processar-foto` (hash e carimbo com data, DEV e nome, que é extra) e `midia.transcodificar` (vídeo em 720p). Sem o worker, as fotos e o vídeo ficam em "Enviada · processando".

**Onde ficam as mídias no PC:** com `ARMAZENAMENTO=disco`, em `.dados/midia/` (arquivos finais, por evidência) e `.dados/tmp/` (envios em andamento). A pasta `.dados/` não vai para o git. Os testes de navegador usam `.dados-e2e/`.

**Variáveis novas do `.env`** (todas já estão no `.env.example`):

| Variável | Para quê |
|---|---|
| `ARMAZENAMENTO` | `disco` (PC e testes na bancada) ou `s3` (Backblaze B2 ou Cloudflare R2) |
| `MIDIA_DIR` / `MIDIA_TMP_DIR` | Pastas das mídias com `disco` (padrão `.dados/midia` e `.dados/tmp`) |
| `SEGREDO_LINKS` | Assina os links temporários das mídias (10 min). Obrigatório em produção, com 32 caracteres ou mais: gere com `openssl rand -hex 32` |
| `S3_ENDPOINT`, `S3_REGIAO`, `S3_BUCKET`, `S3_CHAVE_ID`, `S3_CHAVE_SECRETA` | Só com `ARMAZENAMENTO=s3` |
| `FFMPEG_PATH` / `FFPROBE_PATH` | Caminho do ffmpeg e do ffprobe, se não estiverem no PATH (padrão `ffmpeg` e `ffprobe`) |

As opções da conferência (vídeo obrigatório e prazo de guarda das mídias) ficam em Configurações › Conferência e mídias.

## Mercado Livre (Fase 3)
No PC e nos testes o sistema usa o **ML simulado** (`ML_CONECTOR=falso`): ele responde como a API do ML, com cenários fixos em `tests/fixtures/ml-falso/`, e nunca fala com o ML de verdade.

1. **Chave dos tokens:** `CHAVE_CRIPTOGRAFIA` no `.env`, com 32 bytes em base64. Gere com `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Os tokens do ML são guardados cifrados no banco. Se a chave se perder, basta conectar a conta de novo.
2. **Worker** rodando (`npm run worker`): ele busca as reclamações avisadas, faz a varredura a cada 15 min, renova os tokens a cada 5 h, manda o "OK" e envia as contestações.
3. **Conectar:** Configurações › Mercado Livre › "Conectar conta do Mercado Livre" (só o Gestor). No modo simulado a conexão volta direto, sem sair do sistema.

**Endereços para o app do ML Developers** (a tela Configurações › Mercado Livre mostra os dois): retorno `https://<domínio>/api/ml/retorno` e notificações `https://<domínio>/api/ml/notificacoes` (tópico `post_purchase`).

**Variáveis do `.env`** (todas já estão no `.env.example`):

| Variável | Para quê |
|---|---|
| `ML_CONECTOR` | `falso` (PC e testes) ou `api` (ML real, na "Ligação das contas reais") |
| `ML_CLIENT_ID`, `ML_CLIENT_SECRET`, `ML_REDIRECT_URI` | Dados do app no ML Developers. Só com `ML_CONECTOR=api` |
| `ML_USAR_PKCE` | `true` se o app do ML pedir PKCE |
| `CHAVE_CRIPTOGRAFIA` | Cifra os tokens do ML no banco (AES-256-GCM, 32 bytes em base64) |

**Como funciona:** a conferência concluída de uma devolução do ML põe na fila `ml.enviar-resultado`. Se todas as unidades foram para o Estoque Bom, o "OK" vai sozinho ao ML. Se alguma foi para o Estoque Problema, nasce uma contestação "Aguardando o Gestor" com as Fotos 1 a 4 (o Vídeo de Prova não vai ao ML). Ela aparece na aba Contestações ML com o prazo em destaque.

## Fiscal (Fase 4)
No PC e nos testes o sistema usa o **emissor simulado** (`EMISSOR_NFE=falso`): ele responde como a Focus NFe e autoriza a nota, a menos que a natureza da operação contenha "REJEITAR" (é assim que os testes simulam uma rejeição). Ele nunca fala com a Focus NFe nem com a SEFAZ.

1. **Configurações › Fiscal** (o Gestor edita; o Fiscal só consulta): dados da empresa (CNPJ, IE, endereço, regime tributário e série), ambiente da NF-e (homologação ou produção) e as regras fiscais (CFOP, CST/CSOSN e natureza) de cada tipo de nota, dentro e fora do estado. Os valores sugeridos só valem depois de salvos, e o contador valida antes da produção.
2. **Worker** rodando (`npm run worker`): a emissão é assíncrona. "Emitir NF de devolução" grava a nota como "Processando" e põe na fila `nfe.emitir`; o worker envia e consulta de novo (`nfe.consultar`) com espera crescente até a nota ser autorizada ou rejeitada.
3. **NF de venda:** numa devolução do Mercado Livre, o sistema busca o XML no ML (botão "Buscar no Mercado Livre", e também antes de emitir). Nos outros canais, o Fiscal anexa o XML da NF de venda na Seção Fiscal do detalhe da devolução.

**Como funciona:** a conferência concluída deixa a devolução em "Aguardando NF", na etapa 4, nas abas Estoque Bom e/ou Estoque Problema. Quando a NF de devolução é autorizada, as unidades do Estoque Bom ficam disponíveis para venda e a devolução vai para "Concluída". Uma NF rejeitada mostra o motivo, e o Gestor corrige a regra e toca em "Corrigir e reenviar". Em até 24 h a NF pode ser cancelada com uma justificativa, e a devolução volta para "Aguardando NF". Na etapa 4, "Baixar XMLs do período" gera o ZIP para a contabilidade.

**Variáveis do `.env`** (todas já estão no `.env.example`):

| Variável | Para quê |
|---|---|
| `EMISSOR_NFE` | `falso` (PC e testes) ou `focus` (Focus NFe, na "Ligação das contas reais") |
| `FOCUS_TOKEN_HOMOLOGACAO`, `FOCUS_TOKEN_PRODUCAO` | Tokens da empresa no painel da Focus NFe. Só com `EMISSOR_NFE=focus` |

Antes da produção, o contador valida os CFOP, os CST/CSOSN e os valores da NF de devolução, e a primeira NF real sai em homologação (checklist no fim do [plano da Fase 4](docs/superpowers/plans/2026-11-12-fase-4-fiscal.md)).

## Andamento
No ar (provisório): https://devolucoes.179-199-128-100.sslip.io. A Fase 1 foi publicada em 12/11/2026.

| Fase | Entrega | Situação |
|---|---|---|
| 0. Fundação | Projeto, banco, login e perfis, visual, publicação na VPS com HTTPS | Pronta. Falta o teste real da API do ML, que vai para a etapa "Ligação das contas reais" |
| 1. Cadastros e recebimento | Produtos e fornecedores, devolução manual e por planilha, etapas 1 e 2, Busca Avançada, Recebimento com câmera, usuários | Pronta e publicada |
| 2. Conferência no celular | Fotos 1 a 4, Vídeo de Prova, leitura do código, destino, mídia (compressão, armazenamento e links) | Pronta e no `main` (14/11/2026). Falta publicar na VPS e testar nos aparelhos reais da bancada |
| 3. Mercado Livre | OAuth, avisos e varredura, resposta OK automática, Contestações | Pronta e no `main` (14/11/2026), com o ML simulado. Falta publicar na VPS e ligar a conta real ("Ligação das contas reais") |
| 4. Fiscal | Configurações fiscais, Focus NFe, NF de devolução, etapa 4, ZIP de XMLs | Pronta e no `main` (14/11/2026), com o emissor simulado. Falta publicar na VPS, a validação do contador e a NF real em homologação ("Ligação das contas reais") |
| 5. Remessas | Lotes automáticos, NF de Remessa, lista consolidada | É a próxima |
| Ligação das contas reais | ML real, Focus NFe em homologação, B2 para as mídias, domínio próprio | Depois da Fase 5 |
| 6. Acabamento | Painel de alertas, Falhas, prazo de guarda, backup e passagem para produção | Por último |

A ordem e as regras do trabalho em paralelo estão no [contrato entre as fases](docs/superpowers/plans/2026-11-12-contrato-fases-2-6.md).

As Fases 3, 4 e 5 são construídas com versões simuladas do ML, da Focus NFe e do armazenamento. As contas reais entram na etapa "Ligação das contas reais". Até lá, as mídias ficam no disco da VPS, e isso serve só para testes na bancada.

**O que você vai precisar no fim:**
- o app no ML Developers;
- uma conta na Focus NFe com o certificado A1;
- a validação dos CFOP e CST pelo contador;
- uma conta B2 (ou R2) para as mídias;
- um domínio próprio, que é opcional (hoje o sistema usa o sslip.io).

## Testes
| Comando | O que roda |
|---|---|
| `npm test` | Regras e componentes (sem banco) |
| `npm run test:int` | Integração com o banco de testes |
| `npm run test:e2e` | Navegador de ponta a ponta, em dois projetos: `computador` e `celular` (390×844). Faz o build de produção e sobe o `next start` na porta 3100 |
| `E2E_DEV=1 npm run test:e2e` | O mesmo, mas contra o `next dev` (iteração local rápida; a 1ª visita de cada rota é lenta e o teste pode estourar o tempo) |
| `npm run typecheck` / `npm run lint` | Tipos e estilo |

Antes do primeiro `npm run test:e2e`, rode `npx playwright install chromium` (uma vez). O e2e roda contra um build de produção (`npm run build` com `NEXT_DIST_DIR=.next-e2e`, depois `next start`), o que evita a instabilidade da compilação sob demanda do `next dev`; a primeira execução leva alguns minutos a mais por causa do build, e o `.next` do dev não é tocado. O banco usado é o de testes (`DATABASE_URL_TEST`). Com `E2E_DEV=1` o servidor é o `next dev`: pare o seu `npm run dev` antes, porque o Next 16 usa um arquivo de trava e não sobe dois servidores juntos.

O `npm run dev` e o `npm run build` copiam antes o leitor de código de barras (`zxing_reader.wasm`) para `public/zxing/` (script `scripts/copiar-zxing.mjs`). A câmera só abre em HTTPS ou em `localhost`; para testar a leitura no celular, use o sistema publicado na VPS.

## Worktrees das fases
Cada fase trabalha em sua própria worktree, com banco e porta próprios, definidos no `.env` da worktree (o `.env` não vai para o git). `urlBancoTeste()` recusa um `DATABASE_URL_TEST` cujo banco não seja `devolucoes_test` ou `devolucoes_test_f<N>`.

| | `main` | Fase 2 | Fase 3 | Fase 4 |
|---|---|---|---|---|
| Worktree | a pasta do projeto | `C:/Users/idmpc/devolucoes-wt/fase-2` | `.../fase-3` | `.../fase-4` |
| Branch | `main` | `fase-2-conferencia` | `fase-3-mercado-livre` | `fase-4-fiscal` |
| `DATABASE_URL` (dev) | `devolucoes` | `devolucoes_f2` | `devolucoes_f3` | `devolucoes_f4` |
| `DATABASE_URL_TEST` | `devolucoes_test` | `devolucoes_test_f2` | `devolucoes_test_f3` | `devolucoes_test_f4` |
| `PORTA_E2E` | 3100 | 3102 | 3103 | 3104 |
| `next dev` | 3000 | `npm run dev -- --port 3002` | 3003 | 3004 |

## Publicar na VPS
Siga [docs/operacao/deploy-vps.md](docs/operacao/deploy-vps.md). A importação de planilhas aceita arquivos de até 5 MB, então o nginx da VPS precisa de `client_max_body_size 6m;` (o padrão, 1 MB, recusa a planilha antes de chegar ao sistema).

## Teste real do Mercado Livre
1. Preencha `ML_CLIENT_ID`, `ML_CLIENT_SECRET` e `ML_REDIRECT_URI` no `.env`.
2. `npm run ml:autorizar` e abra o link com a **conta principal** do ML.
3. `npm run ml:trocar-codigo -- <code>`
4. `npm run ml:spike`: grava as respostas sem dados pessoais em `tests/fixtures/ml/`.
