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

## Testes
| Comando | O que roda |
|---|---|
| `npm test` | Regras e componentes (sem banco) |
| `npm run test:int` | Integração com o banco de testes |
| `npm run test:e2e` | Navegador de ponta a ponta (login, abas, permissões) |
| `npm run typecheck` / `npm run lint` | Tipos e estilo |

## Teste real do Mercado Livre
1. Preencha `ML_CLIENT_ID`, `ML_CLIENT_SECRET` e `ML_REDIRECT_URI` no `.env`.
2. `npm run ml:autorizar` e abra o link com a **conta principal** do ML.
3. `npm run ml:trocar-codigo -- <code>`
4. `npm run ml:spike`: grava as respostas sem dados pessoais em `tests/fixtures/ml/`.
