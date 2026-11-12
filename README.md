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

## O que existe hoje (Fases 0 e 1)
Tudo pensado primeiro para o celular (390×844): cartões no lugar de tabelas, formulários em uma coluna, barra de abas embaixo, alvos de toque de 44 px, app instalável (PWA).
- Login, três perfis (Operador, Fiscal, Gestor) e permissões por ação; barra de abas que muda conforme o perfil.
- Quadro de Fluxo com as 5 etapas do PDF e Busca Avançada.
- Devoluções: cadastro manual, importação por planilha agrupando por pedido (extra), histórico de eventos.
- Recebimento com a câmera em tela cheia (leitor de código de barras) ou digitando o código.
- Cadastros de produtos e fornecedores, com importação por planilha (extra).
- Usuários (só o Gestor): criar, mudar o perfil, desativar e reativar. Desativar encerra as sessões na hora, e o sistema nunca fica sem um Gestor ativo (extra).

Ainda não existem: conferência, lotes e remessas, contestações, integração com o Mercado Livre e relatórios. Ficam para as próximas fases.

## Andamento
No ar (provisório): https://devolucoes.179-199-128-100.sslip.io. A Fase 1 foi publicada em 12/11/2026.

| Fase | Entrega | Situação |
|---|---|---|
| 0. Fundação | Projeto, banco, login e perfis, visual, publicação na VPS com HTTPS | Pronta. Falta o teste real da API do ML, que vai para a etapa "Ligação das contas reais" |
| 1. Cadastros e recebimento | Produtos e fornecedores, devolução manual e por planilha, etapas 1 e 2, Busca Avançada, Recebimento com câmera, usuários | Pronta e publicada |
| 2. Conferência no celular | Fotos 1 a 4, Vídeo de Prova, leitura do código, destino, mídia (compressão, armazenamento e links) | Plano sendo escrito. Começa pela base comum (fila, armazenamento e tabelas novas) |
| 3. Mercado Livre | OAuth, avisos e varredura, resposta OK automática, Contestações | Plano sendo escrito. Roda em paralelo com as Fases 2 e 4 |
| 4. Fiscal | Configurações fiscais, Focus NFe, NF de devolução, etapa 4, ZIP de XMLs | Plano sendo escrito. Roda em paralelo com as Fases 2 e 3 |
| 5. Remessas | Lotes automáticos, NF de Remessa, lista consolidada | Depois da Fase 4 |
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
