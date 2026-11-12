# Fase 1 (Cadastros e recebimento): Plano de Implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar este plano tarefa por tarefa. Os passos usam checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** cadastrar produtos e fornecedores (com importação de planilha e mapeamento de colunas), cadastrar devoluções à mão e por planilha, registrar a chegada pela leitura do rastreio no celular, mostrar as etapas 1 e 2, a Busca Avançada, o Quadro de Fluxo com dados reais e a tela de Usuários. O critério de pronto da spec §14 é: "Devolução cadastrada e recebida pela leitura do rastreio no celular".

**Arquitetura:**
- A regra de negócio fica em módulos (`src/modules/<área>/...`). As telas (`src/app/(app)/...`) só leem `searchParams`, checam a permissão e chamam os módulos.
- Funções puras (normalização, leitura de planilha, sugestão de colunas, transições de status, filtros, selos) têm teste unitário. O que grava no banco tem teste de integração no PostgreSQL de testes. Os fluxos principais têm teste ponta a ponta no Playwright, **no computador e no celular**.
- Toda mudança de status passa pela função pura `exigirTransicao` (spec §5.2) e grava um `EventoHistorico`.
- O sistema é **mobile-first**: cada tela nasce para 390×844 e cresce para o computador.

**Tecnologias:** Next.js 16.4.6 (App Router, Turbopack, `cacheComponents` desligado), React 19.3, TypeScript strict, Tailwind v4 (`@tailwindcss/turbopack`), Drizzle ORM 0.45 + postgres.js 4, zod 4, Vitest 5, Testing Library, Playwright. Novas: `papaparse` 5.7.0 (CSV), `read-excel-file` 9.3.14 (XLSX), `barcode-detector` 3.2.3 (ZXing em WebAssembly) e, só para testes, `fflate` e `@types/papaparse`.

**Spec:** [docs/superpowers/specs/2026-11-11-gestao-devolucoes-design.md](../specs/2026-11-11-gestao-devolucoes-design.md). Leia §2, §3, §5.1, §5.2, §5.3, §6.0, §6.1, §6.2, §6.7, §6.8 (inclusive "Mapeamento de colunas" e "Usuários") e §6.9 antes de começar.

## Restrições globais

**Ambiente e ferramentas**
- Node **24** e **npm**. TypeScript em modo `strict`.
- Next.js **16.4.6** com mudanças em relação ao que você conhece (veja `AGENTS.md` e `node_modules/next/dist/docs/`):
  - `params` e `searchParams` das páginas e das rotas são **Promise** (`const { id } = await params`).
  - O limite do corpo das Server Actions fica em `experimental.serverActions.bodySizeLimit` (padrão 1 MB).
  - `redirect()` lança exceção: chame **fora** do `try/catch`.
  - Depois de gravar e continuar na mesma página, chame `revalidatePath(caminho)`.
  - Um arquivo com `'use server'` só pode **exportar funções async** (exportar `type` pode; constante não).
- Banco de desenvolvimento: **PostgreSQL 17 nativo no Windows** (não há Docker no PC).
  - `npm run db:gerar` gera a migração; `npm run db:migrar` aplica no banco `devolucoes`.
  - `npm run test:int` aplica as migrações no `devolucoes_test` sozinho e roda `limparTabelas(sql)` entre os testes.
  - Os arquivos em `src/db/schema/` e **tudo o que eles importam** usam **imports relativos**, nunca `@/` (o drizzle-kit pode não resolver o alias).
- Bibliotecas novas, com versão fixa (publicadas há mais de 2 semanas): `papaparse@5.7.0`, `read-excel-file@9.3.14` (importar de `read-excel-file/universal`), `barcode-detector@3.2.3`; dev: `@types/papaparse@5.5.2`, `fflate`. **Não use o pacote npm `xlsx`** (parado e com vulnerabilidades no npm).
- Windows com Git Bash. O caminho do projeto tem espaço e "ç" (`/c/Users/idmpc/Dvoluções Markt`): **sempre use aspas**.

**Produto e textos**
- Interface só em **português do Brasil**.
- Nomes das etapas, das evidências e dos filtros **exatamente como no PDF** (spec §6). As etapas vêm de `ETAPAS` (`src/modules/devolucoes/etapas.ts`). Os filtros da Busca Avançada, literalmente (spec §6.7):
  1. "Código de Rastreamento"
  2. "Número do Pedido e ID da Reclamação/Mediação"
  3. "Marketplace de Origem e Status Operacional Atual"
  4. "Fornecedor ou Código de Barras / Serial Number"
  5. "Período" **(extra)**
- O que vai além do PDF fica marcado como **(extra)** neste plano.
- Sem dados de demonstração em produção. Os testes criam o que precisam com as fábricas de `tests/helpers/fabricas.ts`.

**Mobile-first (exigência do usuário em 2026-11-12: "esse sistema é focado para celular, então ele tem que ficar perfeito para o usuário final")**
- Toda tela da Fase 1 é desenhada e testada primeiro em **390×844** e depois cresce para o computador (`md:` = 768 px ou mais).
- **Sem rolagem lateral da página em 390 px.** Uma faixa que rola por dentro (como o quadro de 5 colunas no computador) é permitida.
- **Listas são cartões**, em todas as larguras. Não há tabelas largas neste plano.
- Formulários em **uma coluna** no celular, com o teclado certo (`type="email"`, `inputMode="numeric"`, `inputMode="decimal"`, `autoCapitalize="characters"` para códigos) e o botão de enviar sempre ao alcance: nos formulários longos ele fica num **rodapé fixo** (`RodapeFormulario`).
- **Navegação no celular:** barra de abas **fixa embaixo**, com ícone e nome, só com as abas do perfil (`abasVisiveis`), respeitando `env(safe-area-inset-bottom)`. A partir de `md` ela vira as abas no topo.
- Áreas de toque com **no mínimo 44 px** (`min-h-11`) e **nada que dependa de passar o mouse**. Contraste de texto **≥ 4,5:1**.
- Use elementos reais: `<button>`, `<a>`/`<Link>`, `<label>` ligado ao `<input>`.
- **PWA básico** (instalar na tela inicial): manifesto, ícones e `viewport` com `themeColor`. **Sem service worker e sem modo offline** nesta fase (é da Fase 2).

**Visual (direção C, spec §6.0)**
- Use as classes de cor do `src/app/globals.css`: `bg-fundo`, `bg-superficie`, `border-borda`, `border-borda-forte`, `text-texto`, `text-texto-2`, `bg-coluna`, `bg-destaque`, `text-destaque`, `bg-destaque-suave`, `hover:bg-destaque-escuro`, `text-erro`, `bg-erro-suave`, `text-atencao`, `bg-atencao-suave`, `text-bom`, `bg-bom-suave`.
- `font-mono` (IBM Plex Mono) em códigos: DEV, rastreio, pedido, SKU, EAN e S/N.

**Segurança e regras**
- **Permissão checada no servidor** em toda página e em toda Server Action, com `exigirPermissao(acao)` de `@/modules/auth/servidor` (spec §10). Ações desta fase:
  - `ver_listas` (todos): listas, Busca Avançada, detalhe da devolução.
  - `operar_devolucoes` (Operador e Gestor): cadastrar, importar e receber devoluções.
  - `gerir_catalogo` (Fiscal e Gestor): produtos, fornecedores e as importações deles.
  - `administrar` (Gestor): usuários, cancelar ou marcar extravio, identificar pacote não identificado.
- Uma mudança de status fora da tabela da spec §5.2 é recusada **no servidor** (`exigirTransicao`) e toda mudança grava um evento no histórico.
- Componentes React são puros: **não chame `new Date()` nem `Date.now()` durante a renderização** (a regra de lint do React acusa). Datas e selos são calculados nos módulos.
- Formulários que podem voltar com erro usam `useEnvioFormulario` (o `<form action>` do React 19 limpa os campos depois de cada envio e o usuário perderia o que digitou).

**Testes e commits**
- TDD: escreva o teste, veja falhar, implemente, veja passar.
  - Unitário (`npm test`): `src/**/*.test.{ts,tsx}`.
  - Integração (`npm run test:int`): `src/**/*.int.test.ts`.
  - Ponta a ponta (`npm run test:e2e`): `tests/e2e/*.spec.ts`, em **dois projetos**: `computador` (Desktop Chrome) e `celular` (Pixel 7 em 390×844). Os fluxos principais rodam nos dois. Pare o `npm run dev` antes de rodar o e2e.
- Toda mensagem de commit termina com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Nunca rode `git push`.**

## Decisões que a spec não fixou (registradas aqui para o usuário poder vetar)

1. **SKU** é guardado aparado e em maiúsculas (`fone-01` vira `FONE-01`), no catálogo e nos itens.
2. **CNPJ alfanumérico** (IN RFB 2.229/2024, em vigor desde julho de 2026) é aceito. O CNPJ fica guardado sem pontuação. O Excel come zeros à esquerda; um CNPJ só com números e 12 ou 13 dígitos recebe os zeros de volta.
3. **Importação:** a confirmação grava só as linhas válidas; as com erro são listadas e ignoradas. Na importação de devoluções, se uma linha de um pedido tiver erro, o pedido inteiro é ignorado.
4. **A planilha nunca apaga dado:** célula vazia mantém o valor atual (upsert com `coalesce`). Para apagar um campo, use o formulário.
5. Produto com CNPJ de fornecedor **não cadastrado** é erro na linha (importe os fornecedores antes).
6. Devolução com **SKU fora do cadastro** recebe só um **aviso**: o item fica sem produto esperado e a bancada não para.
7. **Uma devolução em andamento por (canal, pedido).** Cadastro manual, planilha e identificação recusam outra enquanto a primeira não estiver Cancelada, Extraviada ou Concluída.
8. **Recepção:** se o mesmo rastreio estiver em mais de uma devolução Pendente de chegada, todas recebem a chegada (é o mesmo pacote).
9. Onde a tabela da spec §5.2 diz "Operador", o **Gestor** também pode (spec §6.9: o Gestor faz tudo o que o Operador faz).
10. **Identificar um pacote não identificado** = o Gestor preenche canal, pedido, reclamação, transportadora e itens, e a marca sai. "Juntar duas devoluções" (spec §5.2) fica para depois: se o pedido já tiver outra devolução pendente, o Gestor cancela a outra antes.
11. **Período (extra)** filtra pela data de cadastro, no horário de Brasília (America/Sao_Paulo).
12. **Planilha:** até 5 MB e 20.000 linhas; a primeira linha tem os nomes das colunas; CSV em UTF-8 ou Windows-1252 (padrão do Excel em português), separador `;`, `,` ou tabulação detectado sozinho.
13. Importações não confirmadas há mais de 1 dia são apagadas no próximo envio. Ao confirmar, as linhas brutas são descartadas e fica só o resumo.
14. **Leitor de código:** a câmera lê em sequência (um pacote atrás do outro) e ignora o mesmo código por 3 s. O `.wasm` do ZXing é servido pelo próprio sistema, sem CDN. **(extra)** Vibração curta a cada leitura, onde o aparelho permite.
15. **Busca Avançada no celular:** fica atrás do botão "Filtros", e o título "Busca Avançada" (nome do PDF) aparece dentro do painel. Os filtros ativos aparecem como etiquetas que se removem com um toque. No computador, o formulário fica aberto.
16. O Gestor **não muda o próprio perfil nem se desativa**. Isso garante que sempre sobra um Gestor ativo.
17. A Etapa 4 lista `AGUARDANDO_NF` (a divisão Estoque Bom / Estoque Problema entra na Fase 4). A coluna 5 (lotes) fica zerada até a Fase 5.
18. Ficam para a Fase 2, com a conferência: as Fotos 1 e 2 do pacote não identificado (spec §6.2), a trava `conferente_id`/`conferencia_iniciada_em` e os campos de conferência do item (`ean_lido`, `produto_recebido_id`, destino, motivo). O `serial` já existe no item para o filtro "Serial Number" da Busca Avançada.
19. **Celular no e2e:** o projeto `celular` usa o Pixel 7 do Playwright (Chromium) com a tela de 390×844, porque só o Chromium está instalado. A importação do **catálogo** roda só no `computador` (é feita no PC); a tela de colunas é testada no celular com a planilha de **devoluções**.

## Mapa de arquivos

```
src/
  app/
    manifest.ts                              manifesto do app instalável (PWA)
    icon.svg, apple-icon.tsx                 ícone da aba e do iPhone
    icones/[tamanho]/route.tsx               ícones PNG 192 e 512 do manifesto
    layout.tsx                               + viewport (themeColor, viewport-fit)
    globals.css                              + utilitários de área segura e foco visível
    (app)/fluxo/page.tsx                     quadro (computador) e etapas (celular)
    (app)/fluxo/etapa/[numero]/page.tsx      listas das etapas 1 a 5
    (app)/fluxo/busca/page.tsx               resultado da Busca Avançada
    (app)/fluxo/devolucoes/nova/...          Nova devolução
    (app)/fluxo/devolucoes/[codigo]/...      detalhe, cancelar/extraviar, identificar
    (app)/fluxo/recebimento/...              Recebimento com câmera
    (app)/cadastros/...                      Produtos e Fornecedores
    (app)/importacoes/[tipo]/...             envio, colunas, prévia e confirmação
    (app)/configuracoes/page.tsx             atalhos de Configurações
    (app)/configuracoes/usuarios/...         Usuários
  components/
    AppShell.tsx, NavAbas.tsx                barra de abas embaixo no celular
    IconeApp.tsx                             desenho do ícone
    estilos.ts, CampoTexto.tsx, ListaErros.tsx, RodapeFormulario.tsx,
    Paginacao.tsx, useEnvioFormulario.ts     peças dos formulários e listas
    Selo.tsx, CartaoDevolucao.tsx, BuscaAvancada.tsx, ListaDevolucoes.tsx
    CamposItens.tsx                          itens (SKU + quantidade)
    QuadroFluxo.tsx, EtapasCelular.tsx       quadro e seletor de etapas
    leitor/detector.ts, leitor/useLeitorCamera.ts
  db/
    client.ts (+ DbOuTx), erros.ts, sql.ts
    schema/catalogo.ts, importacao.ts, devolucoes.ts, historico.ts
  lib/
    manifesto.ts, texto.ts, valores.ts, uuid.ts, parametros.ts, formatar.ts
  modules/
    catalogo/documentos.ts, erros.ts, fornecedores.ts, produtos.ts
    importacao/tipos.ts, planilha.ts, mapeamento.ts, definicao.ts, servico.ts,
               definicoes/{index,produtos,fornecedores,devolucoes}.ts
    devolucoes/dominio.ts, canais.ts, rastreio.ts, erros.ts, transicoes.ts, criar.ts,
               recebimento.ts, excecoes.ts, detalhe.ts, filtros.ts, selos.ts, busca.ts, quadro.ts
    historico/eventos.ts
    auth/gestao.ts
scripts/copiar-zxing.mjs                     copia o .wasm do leitor para public/zxing
tests/
  helpers/fabricas.ts, helpers/xlsx.ts
  e2e/apoio.ts, pwa.spec.ts, permissoes.spec.ts, cadastros.spec.ts, devolucoes.spec.ts,
      recebimento.spec.ts, importacao-devolucoes.spec.ts, fluxo.spec.ts, usuarios.spec.ts
```

---

### Tarefa 1: Casca mobile-first, app instalável (PWA básico) e e2e no celular

**Arquivos:**
- Criar: `src/lib/manifesto.ts`, `src/app/manifest.ts`, `src/components/IconeApp.tsx`, `src/app/icones/[tamanho]/route.tsx`, `src/app/apple-icon.tsx`, `src/app/icon.svg`
- Apagar: `src/app/favicon.ico` (é o logotipo padrão do Next; o `icon.svg` entra no lugar)
- Modificar (substituir o conteúdo): `src/app/layout.tsx`, `src/components/NavAbas.tsx`, `src/components/AppShell.tsx`, `playwright.config.ts`, `tests/e2e/dados.ts`, `tests/e2e/global-setup.ts`, `tests/e2e/login.spec.ts`
- Modificar (acrescentar no final): `src/app/globals.css`
- Criar: `tests/e2e/apoio.ts`, `tests/e2e/pwa.spec.ts`
- Testes: `src/lib/manifesto.test.ts`, `src/components/NavAbas.test.tsx` (acrescentar)

**Interfaces:**
- Consome: `abasVisiveis`, `ROTULO_PERFIL`, `UsuarioSessao`, `iniciais`, `criarUsuario`, `migrar`, `criarDb`, `limparTabelas` (Fase 0)
- Produz:
  - utilitários CSS `espaco-barra` (respiro embaixo do conteúdo no celular), `acima-barra` (`bottom` logo acima da barra de abas), `seguro-inferior`, `painel-inferior`
  - `manifesto(): MetadataRoute.Manifest`, `COR_TEMA = '#0F766E'`, `COR_FUNDO = '#F2F4F3'`
  - `IconeApp({ tamanho }: { tamanho: number })`
  - `NavAbas({ abas })` com a mesma assinatura da Fase 0 (agora barra fixa embaixo no celular)
  - e2e: `entrar(page, usuario: { email: string; senha: string })`, `ehCelular(testInfo): boolean`, `semRolagemLateral(page)`, `USUARIOS_E2E.fiscal`, projetos Playwright `computador` e `celular`

- [ ] **Passo 1: Escrever os testes que falham**

`src/lib/manifesto.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { manifesto } from './manifesto';

describe('manifesto', () => {
  it('descreve o app instalável com as cores da direção C e abre no Fluxo', () => {
    const m = manifesto();
    expect(m).toMatchObject({
      name: 'Gestão de Devoluções',
      short_name: 'Devoluções',
      display: 'standalone',
      start_url: '/fluxo',
      theme_color: '#0F766E',
      background_color: '#F2F4F3',
      lang: 'pt-BR',
    });
    expect(m.icons?.map((i) => [i.src, i.sizes, i.purpose])).toEqual([
      ['/icones/192', '192x192', 'any'],
      ['/icones/512', '512x512', 'any'],
      ['/icones/512', '512x512', 'maskable'],
    ]);
  });
});
```

Acrescente no **final** de `src/components/NavAbas.test.tsx` (o arquivo já importa `render`, `screen`, `vi`, `mocks` e `ABAS`):

```tsx
describe('NavAbas no celular', () => {
  it('cada aba tem ícone e nome, e a navegação "Seções" é uma barra fixa', () => {
    mocks.caminho = '/fluxo';
    render(<NavAbas abas={ABAS} />);
    const links = screen.getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['Fluxo', 'Lotes e Remessas']);
    for (const link of links) {
      expect(link.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    }
    expect(screen.getByRole('navigation', { name: 'Seções' }).className).toContain('fixed');
  });
});
```

Rode: `npm test`
Esperado: FAIL (`./manifesto` não existe; a navegação não tem ícones nem a classe `fixed`).

- [ ] **Passo 2: Manifesto e ícones**

`src/lib/manifesto.ts`:

```ts
import type { MetadataRoute } from 'next';

export const COR_TEMA = '#0F766E';
export const COR_FUNDO = '#F2F4F3';

/** App instalável na tela inicial (PWA básico da Fase 1). Sem service worker: o modo offline é da Fase 2. */
export function manifesto(): MetadataRoute.Manifest {
  return {
    name: 'Gestão de Devoluções',
    short_name: 'Devoluções',
    description: 'Recebimento e conferência das devoluções dos marketplaces',
    lang: 'pt-BR',
    start_url: '/fluxo',
    scope: '/',
    display: 'standalone',
    background_color: COR_FUNDO,
    theme_color: COR_TEMA,
    icons: [
      { src: '/icones/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icones/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icones/512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
```

`src/app/manifest.ts`:

```ts
import type { MetadataRoute } from 'next';
import { manifesto } from '@/lib/manifesto';

export default function manifest(): MetadataRoute.Manifest {
  return manifesto();
}
```

`src/components/IconeApp.tsx` (desenho do logotipo da barra superior, com fundo cheio para servir também como ícone "maskable"):

```tsx
/** Usado pelo ImageResponse (Satori): só estilos inline e flexbox. */
export function IconeApp({ tamanho }: { tamanho: number }) {
  const desenho = Math.round(tamanho * 0.56);
  return (
    <div
      style={{
        width: tamanho,
        height: tamanho,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0F766E',
      }}
    >
      <svg
        width={desenho}
        height={desenho}
        viewBox="0 0 24 24"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 12a9 9 0 0115.5-6.2" />
        <path d="M19 3v4h-4" />
        <path d="M21 12a9 9 0 01-15.5 6.2" />
        <path d="M5 21v-4h4" />
      </svg>
    </div>
  );
}
```

`src/app/icones/[tamanho]/route.tsx`:

```tsx
import { ImageResponse } from 'next/og';
import { IconeApp } from '@/components/IconeApp';

const TAMANHOS = new Set([192, 512]);

/** Ícones PNG do manifesto. Ficam fora do grupo (app): o celular baixa sem login. */
export async function GET(_requisicao: Request, { params }: { params: Promise<{ tamanho: string }> }) {
  const tamanho = Number((await params).tamanho);
  if (!TAMANHOS.has(tamanho)) return new Response('Não encontrado', { status: 404 });
  return new ImageResponse(<IconeApp tamanho={tamanho} />, { width: tamanho, height: tamanho });
}
```

`src/app/apple-icon.tsx`:

```tsx
import { ImageResponse } from 'next/og';
import { IconeApp } from '@/components/IconeApp';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function IconeApple() {
  return new ImageResponse(<IconeApp tamanho={180} />, size);
}
```

`src/app/icon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#0F766E"/><g transform="translate(5 5) scale(0.9167)" fill="none" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0115.5-6.2"/><path d="M19 3v4h-4"/><path d="M21 12a9 9 0 01-15.5 6.2"/><path d="M5 21v-4h4"/></g></svg>
```

Apague o favicon padrão:

```bash
cd "/c/Users/idmpc/Dvoluções Markt"
git rm src/app/favicon.ico
```

- [ ] **Passo 3: Viewport, cor do tema e área segura**

`src/app/layout.tsx` (substitui todo o conteúdo):

```tsx
import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import type { ReactNode } from 'react';
import { COR_TEMA } from '@/lib/manifesto';
import './globals.css';

const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-plex-sans',
});
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '600'],
  variable: '--font-plex-mono',
});

export const metadata: Metadata = {
  title: 'Gestão de Devoluções',
  description: 'Sistema de gestão de devoluções dos marketplaces',
  applicationName: 'Gestão de Devoluções',
  appleWebApp: { capable: true, title: 'Devoluções', statusBarStyle: 'default' },
};

/** viewport-fit=cover libera env(safe-area-inset-*) para a barra de abas não ficar sob o gesto do iPhone. */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: COR_TEMA,
};

export default function LayoutRaiz({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={`${plexSans.variable} ${plexMono.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
```

Acrescente no **final** de `src/app/globals.css`:

```css
/* Mobile-first (Fase 1): espaço para a barra de abas fixa embaixo e para a área segura do celular.
   Cada utilitário já volta ao normal a partir de md (48rem), sem depender da ordem das classes. */
@utility espaco-barra {
  padding-bottom: calc(5rem + env(safe-area-inset-bottom));
  @media (width >= 48rem) {
    padding-bottom: 1.25rem;
  }
}

@utility acima-barra {
  bottom: calc(4rem + env(safe-area-inset-bottom));
  @media (width >= 48rem) {
    bottom: 0;
  }
}

@utility seguro-inferior {
  padding-bottom: env(safe-area-inset-bottom);
  @media (width >= 48rem) {
    padding-bottom: 0;
  }
}

@utility painel-inferior {
  padding-bottom: calc(1rem + env(safe-area-inset-bottom));
}

/* Foco visível para teclado e leitor de código USB (pendência da Fase 0). */
:focus-visible {
  outline: 2px solid var(--color-destaque);
  outline-offset: 2px;
}
```

- [ ] **Passo 4: Barra de abas embaixo no celular**

`src/components/NavAbas.tsx` (substitui todo o conteúdo):

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

export type AbaNav = { rotulo: string; href: string };

/** Traços dos ícones (viewBox 24×24), um por aba do menu (spec §6.0). */
const ICONES: Record<string, ReactNode> = {
  '/fluxo': (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16M15 4v16" />
    </>
  ),
  '/contestacoes': (
    <>
      <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <path d="M12 7v4M12 14h.01" />
    </>
  ),
  '/lotes': (
    <>
      <path d="M21 8l-9-5-9 5 9 5 9-5z" />
      <path d="M3 8v8l9 5 9-5V8M12 13v8" />
    </>
  ),
  '/cadastros': (
    <>
      <path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" />
      <path d="M7.5 7.5h.01" />
    </>
  ),
  '/configuracoes': <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />,
};

/**
 * No celular: barra fixa embaixo, com ícone e nome, respeitando a área segura.
 * A partir de md: as abas em pílula na barra superior, como na Fase 0.
 */
export function NavAbas({ abas }: { abas: AbaNav[] }) {
  const caminho = usePathname();
  return (
    <nav
      aria-label="Seções"
      className="seguro-inferior fixed inset-x-0 bottom-0 z-30 grid auto-cols-fr grid-flow-col border-t border-borda bg-superficie md:static md:z-auto md:flex md:flex-wrap md:gap-1 md:border-0 md:bg-transparent"
    >
      {abas.map((aba) => {
        const ativa = caminho === aba.href || caminho.startsWith(`${aba.href}/`);
        return (
          <Link
            key={aba.href}
            href={aba.href}
            aria-current={ativa ? 'page' : undefined}
            className={`flex min-h-16 flex-col items-center justify-center gap-0.5 px-1 text-center text-[11px] leading-tight [overflow-wrap:anywhere] md:min-h-11 md:flex-row md:rounded-full md:px-3.5 md:text-sm ${
              ativa ? 'font-semibold text-destaque md:bg-destaque-suave' : 'font-medium text-texto-2 md:hover:bg-fundo'
            }`}
          >
            <svg
              aria-hidden="true"
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="md:hidden"
            >
              {ICONES[aba.href]}
            </svg>
            <span>{aba.rotulo}</span>
          </Link>
        );
      })}
    </nav>
  );
}
```

`src/components/AppShell.tsx` (substitui todo o conteúdo):

```tsx
import type { ReactNode } from 'react';
import { iniciais } from '@/lib/iniciais';
import { ROTULO_PERFIL } from '@/modules/auth/perfis';
import { abasVisiveis } from '@/modules/auth/permissoes';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { NavAbas } from './NavAbas';

type Props = { usuario: UsuarioSessao; acaoSair: () => Promise<void>; children: ReactNode };

/** Casca da área logada. No celular a navegação vai para a barra fixa embaixo e o conteúdo ganha respiro (espaco-barra). */
export function AppShell({ usuario, acaoSair, children }: Props) {
  const abas = abasVisiveis(usuario.perfil).map(({ rotulo, href }) => ({ rotulo, href }));
  return (
    <div className="min-h-screen bg-fundo">
      <header className="flex items-center gap-x-6 gap-y-3 border-b border-borda bg-superficie px-4 py-2.5 sm:px-8 md:flex-wrap md:py-3">
        <div className="flex items-center gap-2.5">
          <span aria-hidden="true" className="flex size-[34px] items-center justify-center rounded-full bg-destaque">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 0115.5-6.2" />
              <path d="M19 3v4h-4" />
              <path d="M21 12a9 9 0 01-15.5 6.2" />
              <path d="M5 21v-4h4" />
            </svg>
          </span>
          <span className="text-lg font-bold">Devoluções</span>
        </div>
        <div className="md:flex-1 md:basis-[420px]">
          <NavAbas abas={abas} />
        </div>
        <div className="ml-auto flex items-center gap-3 md:ml-0">
          <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-full bg-borda text-[13px] font-semibold">
            {iniciais(usuario.nome)}
          </span>
          <div className="hidden flex-col leading-tight sm:flex">
            <span className="text-sm font-semibold">{usuario.nome}</span>
            <span className="text-xs text-texto-2">{ROTULO_PERFIL[usuario.perfil]}</span>
          </div>
          <form action={acaoSair}>
            <button type="submit" className="min-h-11 rounded-full border border-borda-forte px-4 text-sm font-semibold">
              Sair
            </button>
          </form>
        </div>
      </header>
      <main className="espaco-barra px-4 pt-5 sm:px-8">{children}</main>
    </div>
  );
}
```

- [ ] **Passo 5: Rodar os testes unitários, tipos e lint**

Rode: `npm test && npm run typecheck && npm run lint`
Esperado: tudo PASS (o teste do `AppShell` da Fase 0 continua passando: o nome e o perfil estão no DOM, só escondidos no celular).

- [ ] **Passo 6: Projeto `celular` no Playwright e apoio aos testes**

`playwright.config.ts` (substitui todo o conteúdo):

```ts
import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

if (existsSync('.env')) process.loadEnvFile('.env');

const PORTA = 3100;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  globalSetup: './tests/e2e/global-setup.ts',
  use: { baseURL: `http://localhost:${PORTA}`, trace: 'retain-on-failure' },
  // Mobile-first: todo spec roda no computador e no celular (390×844, Chromium).
  projects: [
    { name: 'computador', use: { ...devices['Desktop Chrome'] } },
    { name: 'celular', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORTA}`,
    url: `http://localhost:${PORTA}/api/saude`,
    reuseExistingServer: false,
    timeout: 120_000,
    // O Next não sobrescreve variáveis já definidas, então o servidor de teste usa o banco de testes.
    env: { DATABASE_URL: process.env.DATABASE_URL_TEST ?? '' },
  },
});
```

`tests/e2e/dados.ts` (substitui todo o conteúdo):

```ts
export const USUARIOS_E2E = {
  gestor: { nome: 'Gestora Teste', email: 'gestor@teste.local', senha: 'senha-gestor-123', perfil: 'GESTOR' as const },
  operador: { nome: 'Operador Teste', email: 'operador@teste.local', senha: 'senha-operador-123', perfil: 'OPERADOR' as const },
  fiscal: { nome: 'Fiscal Teste', email: 'fiscal@teste.local', senha: 'senha-fiscal-123', perfil: 'FISCAL' as const },
};
```

`tests/e2e/apoio.ts`:

```ts
import { expect, type Page, type TestInfo } from '@playwright/test';

export async function entrar(page: Page, usuario: { email: string; senha: string }) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(usuario.email);
  await page.getByLabel('Senha').fill(usuario.senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

export function ehCelular(testInfo: TestInfo): boolean {
  return testInfo.project.name === 'celular';
}

/** Mobile-first: a página nunca pode rolar para o lado. */
export async function semRolagemLateral(page: Page) {
  const { conteudo, tela } = await page.evaluate(() => ({
    conteudo: document.documentElement.scrollWidth,
    tela: window.innerWidth,
  }));
  expect(conteudo, 'a página não pode rolar para o lado').toBeLessThanOrEqual(tela);
}
```

`tests/e2e/global-setup.ts` (substitui todo o conteúdo):

```ts
import type { FullConfig } from '@playwright/test';
import { criarDb } from '../../src/db/client';
import { migrar } from '../../src/db/migrate';
import { criarUsuario } from '../../src/modules/auth/usuarios';
import { limparTabelas } from '../helpers/db';
import { USUARIOS_E2E } from './dados';

/** O primeiro acesso a uma rota no `next dev` compila a rota e é lento (pendência da Fase 0): aquece antes dos testes. */
const ROTAS_AQUECIMENTO = [
  '/login',
  '/fluxo',
  '/manifest.webmanifest',
  '/icones/192',
];

export default async function globalSetup(config: FullConfig) {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('Defina DATABASE_URL_TEST no .env');
  await migrar(url);
  const { db, sql } = criarDb(url);
  try {
    await limparTabelas(sql);
    await criarUsuario(db, USUARIOS_E2E.gestor);
    await criarUsuario(db, USUARIOS_E2E.operador);
    await criarUsuario(db, USUARIOS_E2E.fiscal);
  } finally {
    await sql.end();
  }
  await aquecer(config.projects[0]?.use.baseURL);
}

async function aquecer(base: string | undefined) {
  if (!base) return;
  for (const rota of ROTAS_AQUECIMENTO) {
    await fetch(new URL(rota, base), { redirect: 'manual' }).catch(() => undefined);
  }
}
```

`tests/e2e/login.spec.ts` (substitui todo o conteúdo):

```ts
import { expect, test } from '@playwright/test';
import { ETAPAS } from '../../src/modules/devolucoes/etapas';
import { entrar, semRolagemLateral } from './apoio';
import { USUARIOS_E2E } from './dados';

test('manda para o login quem não está autenticado', async ({ page }) => {
  await page.goto('/fluxo');
  await expect(page).toHaveURL(/\/login$/);
});

test('mostra erro com senha errada', async ({ page }) => {
  await entrar(page, { email: USUARIOS_E2E.operador.email, senha: 'senha-errada-000' });
  // O Next também injeta um role=alert vazio (anunciador de rotas); filtra pelo texto do erro.
  await expect(page.getByRole('alert').filter({ hasText: 'E-mail' })).toHaveText('E-mail ou senha incorretos.');
});

test('gestor entra, vê as 5 etapas do PDF e todas as abas, e sai', async ({ page }) => {
  await entrar(page, USUARIOS_E2E.gestor);
  await expect(page).toHaveURL(/\/fluxo$/);
  await semRolagemLateral(page);

  for (const etapa of ETAPAS) {
    await expect(page.getByRole('heading', { level: 2, name: etapa.titulo })).toBeVisible();
  }
  const nav = page.getByRole('navigation', { name: 'Seções' });
  await expect(nav.getByRole('link')).toHaveText([
    'Fluxo',
    'Contestações ML',
    'Lotes e Remessas',
    'Produtos e Fornecedores',
    'Configurações',
  ]);

  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/fluxo');
  await expect(page).toHaveURL(/\/login$/);
});

test('operador vê só a aba Fluxo e não acessa Configurações', async ({ page }) => {
  await entrar(page, USUARIOS_E2E.operador);
  await expect(page).toHaveURL(/\/fluxo$/);
  await expect(page.getByRole('navigation', { name: 'Seções' }).getByRole('link')).toHaveText(['Fluxo']);

  const resposta = await page.goto('/configuracoes');
  expect(resposta?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
});
```

`tests/e2e/pwa.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { semRolagemLateral } from './apoio';

test('o manifesto e os ícones PNG do app instalável respondem sem login', async ({ request }) => {
  const resposta = await request.get('/manifest.webmanifest');
  expect(resposta.ok()).toBe(true);
  expect(await resposta.json()).toMatchObject({
    name: 'Gestão de Devoluções',
    short_name: 'Devoluções',
    display: 'standalone',
    start_url: '/fluxo',
    theme_color: '#0F766E',
    background_color: '#F2F4F3',
  });
  for (const tamanho of [192, 512]) {
    const icone = await request.get(`/icones/${tamanho}`);
    expect(icone.ok()).toBe(true);
    expect(icone.headers()['content-type']).toBe('image/png');
  }
  expect((await request.get('/icones/64')).status()).toBe(404);
});

test('a tela de login cabe no celular e traz a cor do tema e o manifesto', async ({ page }) => {
  await page.goto('/login');
  await semRolagemLateral(page);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#0F766E');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', /manifest\.webmanifest/);
});
```

- [ ] **Passo 7: Rodar o e2e nos dois projetos**

Pare o `npm run dev`, se estiver rodando. Rode: `npm run test:e2e`
Esperado: PASS em `computador` e em `celular` (12 testes). O teste do operador também confirma que a página proibida responde **HTTP 404** (pendência da Fase 0). Se ela vier com 200, pare e avise: é um defeito real de permissão, não um teste a afrouxar.

- [ ] **Passo 8: Commit**

```bash
cd "/c/Users/idmpc/Dvoluções Markt"
git add -A
git commit -m "feat: casca mobile-first (abas embaixo no celular), PWA básico e e2e no celular" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 2: Catálogo no banco (normalização, produtos e fornecedores)

**Arquivos:**
- Modificar (substituir o conteúdo): `src/db/client.ts`, `src/db/schema/index.ts`
- Modificar: `src/modules/auth/usuarios.ts` (usar `ehViolacaoDeUnicidade` de `@/db/erros` e aceitar `DbOuTx`)
- Criar: `src/db/erros.ts`, `src/db/sql.ts`, `src/db/schema/catalogo.ts`
- Criar: `src/lib/texto.ts`, `src/lib/valores.ts`, `src/lib/uuid.ts`
- Criar: `src/modules/catalogo/documentos.ts`, `src/modules/catalogo/erros.ts`, `src/modules/catalogo/fornecedores.ts`, `src/modules/catalogo/produtos.ts`
- Criar: `tests/helpers/fabricas.ts`
- Gerado: `drizzle/0002_*.sql` e `drizzle/meta/*`
- Testes: `src/lib/texto.test.ts`, `src/lib/valores.test.ts`, `src/modules/catalogo/documentos.test.ts`, `src/modules/catalogo/fornecedores.int.test.ts`, `src/modules/catalogo/produtos.int.test.ts`

**Interfaces:**
- Consome: `criarDb`, `Db`, `usuarios`, `criarUsuario`, `UsuarioSessao`, `Perfil`, `criarDbTeste`, `limparTabelas` (Fase 0)
- Produz:
  - `type DbOuTx` (aceita a conexão ou uma transação) em `@/db/client`
  - `ehViolacaoDeUnicidade(erro: unknown): boolean` em `@/db/erros`
  - `manterSeVazio(tabela: string, coluna: string): SQL` e `FOI_INSERIDO: SQL<boolean>` em `@/db/sql`
  - `normalizarTexto(texto): string`, `escaparLike(texto): string` em `@/lib/texto`
  - `interpretarValor(texto): string | null`, `textoOpcional(valor, max, rotulo, erros): string | null` em `@/lib/valores`
  - `ehUuid(texto): boolean` em `@/lib/uuid`
  - em `@/modules/catalogo/documentos`: `somenteDigitos`, `cnpjValido`, `normalizarCnpj(texto): string | null`, `formatarCnpj`, `normalizarEan(texto): string | null`, `normalizarNcm`, `normalizarCep`, `UFS`, `normalizarUf`, `normalizarSku(texto): string`
  - `class ErroCadastro extends Error`
  - em `@/modules/catalogo/fornecedores`: `type DadosFornecedor`, `interpretarLinhaFornecedor(v: Record<string, string>): { dados: DadosFornecedor | null; erros: string[] }`, `salvarFornecedor(db, dados, id?): Promise<string>`, `upsertFornecedores(db, lista): Promise<{ criados: number; atualizados: number }>`, `listarFornecedores(db, { busca?, pagina? }): Promise<{ linhas: FornecedorLista[]; total: number }>`, `obterFornecedor(db, id)`, `opcoesFornecedores(db): Promise<{ cnpj: string; razaoSocial: string }[]>`, `idsDosFornecedores(db, cnpjs): Promise<Map<string, string>>`, `POR_PAGINA_FORNECEDORES = 50`
  - em `@/modules/catalogo/produtos`: `type DadosProduto`, `interpretarLinhaProduto(v)`, `salvarProduto(db, dados, id?): Promise<string>`, `upsertProdutos(db, lista)`, `listarProdutos(db, { busca?, pagina? }): Promise<{ linhas: ProdutoLista[]; total: number }>`, `obterProduto(db, id)`, `idsDosProdutos(db, skus): Promise<Map<string, string>>`, `POR_PAGINA_PRODUTOS = 50`
  - fábricas: `criarUsuarioTeste(db, perfil?)`, `criarFornecedorTeste(db, dados?)`, `criarProdutoTeste(db, dados?)`

- [ ] **Passo 1: Escrever os testes unitários que falham**

`src/lib/texto.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { escaparLike, normalizarTexto } from './texto';

describe('normalizarTexto', () => {
  it('tira acentos, maiúsculas e pontuação', () => {
    expect(normalizarTexto('  Código de Barras ')).toBe('codigo de barras');
    expect(normalizarTexto('E-mail SAC')).toBe('e mail sac');
    expect(normalizarTexto('Preço de custo (R$)')).toBe('preco de custo r');
  });
});

describe('escaparLike', () => {
  it('escapa %, _ e a barra invertida', () => {
    expect(escaparLike('50%_a\\b')).toBe('50\\%\\_a\\\\b');
  });
});
```

`src/lib/valores.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { interpretarValor, textoOpcional } from './valores';

describe('interpretarValor', () => {
  it.each([
    ['1.234,56', '1234.56'],
    ['12,5', '12.50'],
    ['12.5', '12.50'],
    ['1234', '1234.00'],
    ['1.234', '1234.00'],
    ['1,234.56', '1234.56'],
    ['R$ 89,90', '89.90'],
    [' 0 ', '0.00'],
  ])('%s → %s', (texto, esperado) => {
    expect(interpretarValor(texto)).toBe(esperado);
  });

  it.each(['', 'abc', '-5', '12,3,4', '1.2.3'])('recusa %j', (texto) => {
    expect(interpretarValor(texto)).toBeNull();
  });
});

describe('textoOpcional', () => {
  it('apara e devolve null quando vazio', () => {
    const erros: string[] = [];
    expect(textoOpcional('  Rua A ', 10, 'Logradouro', erros)).toBe('Rua A');
    expect(textoOpcional('   ', 10, 'Logradouro', erros)).toBeNull();
    expect(textoOpcional(undefined, 10, 'Logradouro', erros)).toBeNull();
    expect(erros).toEqual([]);
  });

  it('anota o erro quando passa do limite', () => {
    const erros: string[] = [];
    expect(textoOpcional('abcdef', 5, 'Número', erros)).toBeNull();
    expect(erros).toEqual(['Número: no máximo 5 caracteres']);
  });
});
```

`src/modules/catalogo/documentos.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  cnpjValido,
  formatarCnpj,
  normalizarCep,
  normalizarCnpj,
  normalizarEan,
  normalizarNcm,
  normalizarSku,
  normalizarUf,
} from './documentos';

describe('CNPJ', () => {
  it('aceita CNPJ numérico com ou sem pontuação', () => {
    expect(normalizarCnpj('11.222.333/0001-81')).toBe('11222333000181');
    expect(normalizarCnpj('12345678000195')).toBe('12345678000195');
  });

  it('aceita o CNPJ alfanumérico (IN RFB 2.229/2024)', () => {
    expect(normalizarCnpj('12.ABC.345/01DE-35')).toBe('12ABC34501DE35');
    expect(normalizarCnpj('12.abc.345/01de-35')).toBe('12ABC34501DE35');
  });

  it('repõe os zeros à esquerda que o Excel come', () => {
    expect(normalizarCnpj('1122233000120')).toBe('01122233000120');
  });

  it('recusa dígito verificador errado, tamanho errado e números repetidos', () => {
    expect(normalizarCnpj('11.222.333/0001-82')).toBeNull();
    expect(normalizarCnpj('1122233')).toBeNull();
    expect(cnpjValido('00000000000000')).toBe(false);
  });

  it('formata para exibição', () => {
    expect(formatarCnpj('11222333000181')).toBe('11.222.333/0001-81');
  });
});

describe('EAN / GTIN', () => {
  it('aceita GTIN-13 e GTIN-8 com dígito certo', () => {
    expect(normalizarEan('7891234567895')).toBe('7891234567895');
    expect(normalizarEan(' 789 1000 000014 ')).toBe('7891000000014');
    expect(normalizarEan('96385074')).toBe('96385074');
  });

  it('recusa dígito errado e tamanho estranho', () => {
    expect(normalizarEan('7891234567890')).toBeNull();
    expect(normalizarEan('12345')).toBeNull();
  });
});

describe('NCM, CEP, UF e SKU', () => {
  it('NCM tem 8 dígitos', () => {
    expect(normalizarNcm('8518.30.00')).toBe('85183000');
    expect(normalizarNcm('8518')).toBeNull();
  });

  it('CEP tem 8 dígitos e recupera o zero da esquerda', () => {
    expect(normalizarCep('01310-100')).toBe('01310100');
    expect(normalizarCep('1310100')).toBe('01310100');
    expect(normalizarCep('123')).toBeNull();
  });

  it('UF é uma das 27', () => {
    expect(normalizarUf(' sp ')).toBe('SP');
    expect(normalizarUf('XX')).toBeNull();
  });

  it('SKU fica aparado e em maiúsculas', () => {
    expect(normalizarSku('  fone-01 ')).toBe('FONE-01');
  });
});
```

Rode: `npm test`
Esperado: FAIL (os módulos ainda não existem).

- [ ] **Passo 2: Implementar as funções puras**

`src/lib/texto.ts`:

```ts
/** Minúsculas, sem acentos, só letras e números separados por um espaço. Usado para comparar nomes de coluna e de canal. */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Escapa %, _ e \ para usar o texto digitado dentro de LIKE/ILIKE. */
export function escaparLike(texto: string): string {
  return texto.replace(/[\\%_]/g, (c) => `\\${c}`);
}
```

`src/lib/valores.ts`:

```ts
/**
 * Valor em reais, não negativo: "1.234,56", "12,5", "12.5", "1,234.56" ou "R$ 89,90".
 * Devolve com 2 casas e ponto ("1234.56"), que é o formato da coluna numeric, ou null.
 */
export function interpretarValor(texto: string): string | null {
  const s = texto.trim().replace(/^R\$/i, '').replace(/\s/g, '');
  if (s === '') return null;
  let normal: string;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) || /^\d+,\d+$/.test(s)) {
    normal = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
    normal = s.replace(/,/g, '');
  } else if (/^\d+(\.\d+)?$/.test(s)) {
    normal = s;
  } else {
    return null;
  }
  const numero = Number(normal);
  return Number.isFinite(numero) ? numero.toFixed(2) : null;
}

/** Texto aparado; vazio vira null. Se passar do limite, anota o erro em `erros` e devolve null. */
export function textoOpcional(valor: string | undefined, max: number, rotulo: string, erros: string[]): string | null {
  const s = (valor ?? '').trim();
  if (s.length > max) {
    erros.push(`${rotulo}: no máximo ${max} caracteres`);
    return null;
  }
  return s === '' ? null : s;
}
```

`src/lib/uuid.ts`:

```ts
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Evita mandar ao PostgreSQL um texto que não é UUID (ele responderia com erro em vez de "não achei"). */
export function ehUuid(texto: string): boolean {
  return UUID.test(texto);
}
```

`src/modules/catalogo/documentos.ts`:

```ts
/** Normalização e validação dos documentos e códigos do cadastro (spec §5.1 e §6.8). Funções puras. */

export function somenteDigitos(texto: string): string {
  return texto.replace(/\D/g, '');
}

const PESOS_DV1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_DV2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

/** Valor de cada caractere no cálculo do dígito: '0'..'9' valem 0..9 e 'A'..'Z' valem 17..42 (código ASCII − 48). */
function digitoVerificador(base: string, pesos: number[]): number {
  const soma = base.split('').reduce((total, c, i) => total + (c.charCodeAt(0) - 48) * pesos[i], 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** CNPJ numérico ou alfanumérico: 12 caracteres [0-9A-Z] e 2 dígitos verificadores. */
export function cnpjValido(cnpj: string): boolean {
  if (!/^[0-9A-Z]{12}\d{2}$/.test(cnpj)) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;
  const dv1 = digitoVerificador(cnpj.slice(0, 12), PESOS_DV1);
  const dv2 = digitoVerificador(cnpj.slice(0, 12) + dv1, PESOS_DV2);
  return cnpj.endsWith(`${dv1}${dv2}`);
}

/** Tira a pontuação e devolve os 14 caracteres, ou null se for inválido. Repõe os zeros à esquerda que o Excel come. */
export function normalizarCnpj(texto: string): string | null {
  let limpo = texto.toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (/^\d{12,13}$/.test(limpo)) limpo = limpo.padStart(14, '0');
  return cnpjValido(limpo) ? limpo : null;
}

export function formatarCnpj(cnpj: string): string {
  if (cnpj.length !== 14) return cnpj;
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
}

/** GTIN-8, 12, 13 ou 14 com o dígito verificador certo. */
export function normalizarEan(texto: string): string | null {
  const d = somenteDigitos(texto);
  if (![8, 12, 13, 14].includes(d.length)) return null;
  const corpo = d.slice(0, -1).split('').reverse();
  const soma = corpo.reduce((total, c, i) => total + Number(c) * (i % 2 === 0 ? 3 : 1), 0);
  const dv = (10 - (soma % 10)) % 10;
  return dv === Number(d[d.length - 1]) ? d : null;
}

export function normalizarNcm(texto: string): string | null {
  const d = somenteDigitos(texto);
  return d.length === 8 ? d : null;
}

export function normalizarCep(texto: string): string | null {
  let d = somenteDigitos(texto);
  if (d.length === 7) d = d.padStart(8, '0');
  return d.length === 8 ? d : null;
}

export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;

export function normalizarUf(texto: string): string | null {
  const uf = texto.trim().toUpperCase();
  return (UFS as readonly string[]).includes(uf) ? uf : null;
}

/** O SKU é comparado sem diferenciar maiúsculas: fica aparado e em maiúsculas. */
export function normalizarSku(texto: string): string {
  return texto.trim().toUpperCase();
}
```

Rode: `npm test`
Esperado: PASS.

- [ ] **Passo 3: Tipos de conexão e erros do banco**

`src/db/client.ts` (substitui todo o conteúdo):

```ts
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import { drizzle, type PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export function criarDb(url: string) {
  const sql = postgres(url, { max: 10, onnotice: () => {} });
  const db = drizzle(sql, { schema });
  return { db, sql };
}

export type Db = ReturnType<typeof criarDb>['db'];

/** Aceita a conexão ou a transação de `db.transaction(async (tx) => ...)`. */
export type DbOuTx = PgDatabase<PostgresJsQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;
```

`src/db/erros.ts`:

```ts
function codigoDoErro(x: unknown): unknown {
  return typeof x === 'object' && x !== null && 'code' in x ? (x as { code?: unknown }).code : undefined;
}

/** 23505 = unique_violation. Versões recentes do Drizzle embrulham o erro do driver em `cause`. */
export function ehViolacaoDeUnicidade(erro: unknown): boolean {
  const causa = typeof erro === 'object' && erro !== null ? (erro as { cause?: unknown }).cause : undefined;
  return codigoDoErro(erro) === '23505' || codigoDoErro(causa) === '23505';
}
```

`src/db/sql.ts`:

```ts
import { sql, type SQL } from 'drizzle-orm';

/** Num upsert: usa o valor novo, mas mantém o atual quando o novo vem vazio (a planilha nunca apaga dado). */
export function manterSeVazio(tabela: string, coluna: string): SQL {
  return sql.raw(`coalesce(excluded."${coluna}", "${tabela}"."${coluna}")`);
}

/** No RETURNING de um upsert: true quando a linha foi inserida, false quando foi atualizada. */
export const FOI_INSERIDO = sql<boolean>`(xmax = 0)`;
```

Em `src/modules/auth/usuarios.ts`:
- troque a linha `import type { Db } from '@/db/client';` por:

```ts
import type { DbOuTx } from '@/db/client';
import { ehViolacaoDeUnicidade } from '@/db/erros';
```

- troque `export async function criarUsuario(db: Db, dados: DadosNovoUsuario)` por `export async function criarUsuario(db: DbOuTx, dados: DadosNovoUsuario)`;
- apague as funções `codigoDoErro` e `ehViolacaoDeUnicidade` do fim do arquivo (agora vêm de `@/db/erros`).

- [ ] **Passo 4: Tabelas do catálogo**

`src/db/schema/catalogo.ts`:

```ts
import { index, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** Spec §5.1 (Fornecedor). CNPJ sem pontuação, numérico ou alfanumérico. */
export const fornecedores = pgTable('fornecedores', {
  id: uuid('id').primaryKey().defaultRandom(),
  razaoSocial: text('razao_social').notNull(),
  cnpj: text('cnpj').notNull().unique(),
  ie: text('ie'),
  logradouro: text('logradouro'),
  numero: text('numero'),
  complemento: text('complemento'),
  bairro: text('bairro'),
  cidade: text('cidade'),
  uf: text('uf'),
  cep: text('cep'),
  contatoSac: text('contato_sac'),
  emailSac: text('email_sac'),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
});

/** Spec §5.1 (Produto). SKU único, em maiúsculas. */
export const produtos = pgTable(
  'produtos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sku: text('sku').notNull().unique(),
    ean: text('ean'),
    descricao: text('descricao').notNull(),
    fornecedorId: uuid('fornecedor_id').references(() => fornecedores.id, { onDelete: 'set null' }),
    ncm: text('ncm'),
    custo: numeric('custo', { precision: 12, scale: 2 }),
    unidade: text('unidade'),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('produtos_ean_idx').on(t.ean), index('produtos_fornecedor_idx').on(t.fornecedorId)],
);
```

`src/db/schema/index.ts` (substitui todo o conteúdo):

```ts
export * from './auth';
export * from './catalogo';
export * from './notificacoes';
```

Gere e aplique a migração:

```bash
cd "/c/Users/idmpc/Dvoluções Markt"
npm run db:gerar
npm run db:migrar
```

Esperado: um arquivo novo `drizzle/0002_<nome>.sql` com `CREATE TABLE "fornecedores"` e `CREATE TABLE "produtos"`, e "migrações aplicadas" no banco de desenvolvimento.

- [ ] **Passo 5: Escrever os testes de integração que falham**

`src/modules/catalogo/fornecedores.int.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { ErroCadastro } from './erros';
import {
  interpretarLinhaFornecedor,
  listarFornecedores,
  obterFornecedor,
  salvarFornecedor,
  upsertFornecedores,
  type DadosFornecedor,
} from './fornecedores';

const { db, sql } = criarDbTeste();
beforeEach(async () => {
  await limparTabelas(sql);
});
afterAll(async () => {
  await sql.end();
});

const ALFA: DadosFornecedor = {
  razaoSocial: 'Alfa Eletrônicos Ltda',
  cnpj: '11222333000181',
  ie: null,
  logradouro: null,
  numero: null,
  complemento: null,
  bairro: null,
  cidade: 'São Paulo',
  uf: 'SP',
  cep: null,
  contatoSac: null,
  emailSac: 'sac@alfa.com.br',
};

describe('interpretarLinhaFornecedor', () => {
  it('normaliza CNPJ, UF, CEP, IE e e-mail', () => {
    const { dados, erros } = interpretarLinhaFornecedor({
      razao_social: ' Alfa Ltda ',
      cnpj: '11.222.333/0001-81',
      ie: 'isento',
      uf: 'sp',
      cep: '1310100',
      email_sac: ' SAC@Alfa.com.br ',
    });
    expect(erros).toEqual([]);
    expect(dados).toMatchObject({ razaoSocial: 'Alfa Ltda', cnpj: '11222333000181', ie: 'ISENTO', uf: 'SP', cep: '01310100', emailSac: 'sac@alfa.com.br' });
  });

  it('junta todos os erros da linha', () => {
    const { dados, erros } = interpretarLinhaFornecedor({ razao_social: '', cnpj: '123', uf: 'XX', cep: '1', email_sac: 'sem-arroba' });
    expect(dados).toBeNull();
    expect(erros).toEqual(['Informe a razão social', 'CNPJ inválido: 123', 'UF inválida: XX', 'CEP inválido: 1', 'E-mail do SAC inválido: sem-arroba']);
  });
});

describe('fornecedores no banco', () => {
  it('cria, edita e recusa CNPJ repetido', async () => {
    const id = await salvarFornecedor(db, ALFA);
    await salvarFornecedor(db, { ...ALFA, razaoSocial: 'Alfa Eletrônicos SA' }, id);
    expect(await obterFornecedor(db, id)).toMatchObject({ razaoSocial: 'Alfa Eletrônicos SA', cnpj: '11222333000181' });
    await expect(salvarFornecedor(db, { ...ALFA, razaoSocial: 'Outro' })).rejects.toThrow(
      new ErroCadastro('Já existe um fornecedor com o CNPJ 11.222.333/0001-81'),
    );
  });

  it('obterFornecedor devolve null para id que não é UUID', async () => {
    expect(await obterFornecedor(db, 'abc')).toBeNull();
  });

  it('upsert pelo CNPJ conta novos e atualizados e não apaga o que veio vazio', async () => {
    await salvarFornecedor(db, ALFA);
    const resultado = await upsertFornecedores(db, [
      { ...ALFA, razaoSocial: 'Alfa Nova Razão', emailSac: null, cidade: 'Campinas' },
      { ...ALFA, cnpj: '12345678000195', razaoSocial: 'Beta Ltda', cidade: null, uf: null, emailSac: null },
    ]);
    expect(resultado).toEqual({ criados: 1, atualizados: 1 });
    const { linhas } = await listarFornecedores(db, { busca: 'alfa' });
    expect(linhas).toEqual([
      expect.objectContaining({ razaoSocial: 'Alfa Nova Razão', cidade: 'Campinas', emailSac: 'sac@alfa.com.br' }),
    ]);
  });

  it('lista em ordem alfabética e busca por nome ou CNPJ', async () => {
    await salvarFornecedor(db, { ...ALFA, cnpj: '12345678000195', razaoSocial: 'Beta Ltda' });
    await salvarFornecedor(db, ALFA);
    expect((await listarFornecedores(db)).linhas.map((f) => f.razaoSocial)).toEqual(['Alfa Eletrônicos Ltda', 'Beta Ltda']);
    expect((await listarFornecedores(db, { busca: '12.345.678' })).linhas.map((f) => f.razaoSocial)).toEqual(['Beta Ltda']);
    expect((await listarFornecedores(db, { busca: 'zzz' })).total).toBe(0);
  });
});
```

`src/modules/catalogo/produtos.int.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarFornecedorTeste } from '../../../tests/helpers/fabricas';
import { ErroCadastro } from './erros';
import {
  idsDosProdutos,
  interpretarLinhaProduto,
  listarProdutos,
  obterProduto,
  salvarProduto,
  upsertProdutos,
  type DadosProduto,
} from './produtos';

const { db, sql } = criarDbTeste();
beforeEach(async () => {
  await limparTabelas(sql);
});
afterAll(async () => {
  await sql.end();
});

const FONE: DadosProduto = {
  sku: 'FONE-01',
  ean: '7891000000014',
  descricao: 'Fone Bluetooth',
  cnpjFornecedor: null,
  ncm: '85183000',
  custo: '89.90',
  unidade: 'UN',
};

describe('interpretarLinhaProduto', () => {
  it('normaliza SKU, EAN, CNPJ do fornecedor, NCM, custo e unidade', () => {
    const { dados, erros } = interpretarLinhaProduto({
      sku: ' fone-01 ',
      ean: '7891000000014',
      descricao: 'Fone Bluetooth',
      cnpj_fornecedor: '11.222.333/0001-81',
      ncm: '8518.30.00',
      custo: '89,90',
      unidade: 'un',
    });
    expect(erros).toEqual([]);
    expect(dados).toEqual({ sku: 'FONE-01', ean: '7891000000014', descricao: 'Fone Bluetooth', cnpjFornecedor: '11222333000181', ncm: '85183000', custo: '89.90', unidade: 'UN' });
  });

  it('junta os erros da linha', () => {
    const { dados, erros } = interpretarLinhaProduto({ sku: '', descricao: '', ean: '7891000000099', cnpj_fornecedor: '1', ncm: '12', custo: 'abc' });
    expect(dados).toBeNull();
    expect(erros).toEqual([
      'Informe o SKU',
      'Informe a descrição',
      'EAN inválido: 7891000000099',
      'CNPJ do fornecedor inválido: 1',
      'NCM inválido (precisa ter 8 dígitos): 12',
      'Custo inválido: abc',
    ]);
  });
});

describe('produtos no banco', () => {
  it('liga o produto ao fornecedor pelo CNPJ e recusa fornecedor não cadastrado', async () => {
    await criarFornecedorTeste(db, { cnpj: '11222333000181', razaoSocial: 'Alfa Ltda' });
    const id = await salvarProduto(db, { ...FONE, cnpjFornecedor: '11222333000181' });
    expect(await obterProduto(db, id)).toMatchObject({ sku: 'FONE-01', cnpjFornecedor: '11222333000181', custo: '89.90' });
    await expect(salvarProduto(db, { ...FONE, sku: 'X-1', cnpjFornecedor: '12345678000195' })).rejects.toThrow(
      new ErroCadastro('Fornecedor não cadastrado (CNPJ 12.345.678/0001-95)'),
    );
  });

  it('recusa SKU repetido', async () => {
    await salvarProduto(db, FONE);
    await expect(salvarProduto(db, { ...FONE, descricao: 'Outro' })).rejects.toThrow(new ErroCadastro('Já existe um produto com o SKU FONE-01'));
  });

  it('upsert pelo SKU conta novos e atualizados e mantém o que veio vazio', async () => {
    await salvarProduto(db, FONE);
    const resultado = await upsertProdutos(db, [
      { ...FONE, descricao: 'Fone Bluetooth Preto', ean: null, custo: null },
      { ...FONE, sku: 'CABO-02', ean: '7891000000021', descricao: 'Cabo USB-C', ncm: null, custo: '12.50' },
    ]);
    expect(resultado).toEqual({ criados: 1, atualizados: 1 });
    const { linhas } = await listarProdutos(db, { busca: 'fone' });
    expect(linhas).toEqual([expect.objectContaining({ sku: 'FONE-01', descricao: 'Fone Bluetooth Preto', ean: '7891000000014', custo: '89.90' })]);
  });

  it('busca por SKU, EAN ou descrição e acha os ids pelo SKU', async () => {
    const id = await salvarProduto(db, FONE);
    await salvarProduto(db, { ...FONE, sku: 'CABO-02', ean: '7891000000021', descricao: 'Cabo USB-C' });
    expect((await listarProdutos(db, { busca: '7891000000021' })).linhas.map((p) => p.sku)).toEqual(['CABO-02']);
    expect((await listarProdutos(db)).linhas.map((p) => p.sku)).toEqual(['CABO-02', 'FONE-01']);
    expect(await idsDosProdutos(db, ['FONE-01', 'NAO-EXISTE'])).toEqual(new Map([['FONE-01', id]]));
    expect(await idsDosProdutos(db, [])).toEqual(new Map());
  });
});
```

Rode: `npm run test:int`
Esperado: FAIL (os módulos do catálogo e as fábricas ainda não existem).

- [ ] **Passo 6: Implementar o catálogo**

`src/modules/catalogo/erros.ts`:

```ts
/** Erro de regra do cadastro, com mensagem pronta para mostrar na tela. */
export class ErroCadastro extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroCadastro';
  }
}
```

`src/modules/catalogo/fornecedores.ts`:

```ts
import { asc, count, eq, ilike, inArray, like, or } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { ehViolacaoDeUnicidade } from '@/db/erros';
import { fornecedores } from '@/db/schema';
import { FOI_INSERIDO, manterSeVazio } from '@/db/sql';
import { escaparLike } from '@/lib/texto';
import { ehUuid } from '@/lib/uuid';
import { textoOpcional } from '@/lib/valores';
import { formatarCnpj, normalizarCep, normalizarCnpj, normalizarUf } from './documentos';
import { ErroCadastro } from './erros';

export const POR_PAGINA_FORNECEDORES = 50;
const LOTE = 500;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type DadosFornecedor = {
  razaoSocial: string;
  cnpj: string;
  ie: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  contatoSac: string | null;
  emailSac: string | null;
};

export type FornecedorLista = {
  id: string;
  razaoSocial: string;
  cnpj: string;
  cidade: string | null;
  uf: string | null;
  emailSac: string | null;
};

/**
 * Valida uma linha de fornecedor com as chaves do modelo da spec §6.8
 * (razao_social, cnpj, ie, logradouro, numero, complemento, bairro, cidade, uf, cep, contato_sac, email_sac).
 * Serve para a planilha e para o formulário.
 */
export function interpretarLinhaFornecedor(v: Record<string, string>): { dados: DadosFornecedor | null; erros: string[] } {
  const erros: string[] = [];
  const razaoSocial = textoOpcional(v.razao_social, 200, 'Razão social', erros);
  if ((v.razao_social ?? '').trim() === '') erros.push('Informe a razão social');
  const cnpjTexto = (v.cnpj ?? '').trim();
  const cnpj = cnpjTexto ? normalizarCnpj(cnpjTexto) : null;
  if (!cnpjTexto) erros.push('Informe o CNPJ');
  else if (!cnpj) erros.push(`CNPJ inválido: ${cnpjTexto}`);
  const ie = textoOpcional(v.ie, 20, 'Inscrição estadual', erros)?.toUpperCase() ?? null;
  const logradouro = textoOpcional(v.logradouro, 200, 'Logradouro', erros);
  const numero = textoOpcional(v.numero, 20, 'Número', erros);
  const complemento = textoOpcional(v.complemento, 100, 'Complemento', erros);
  const bairro = textoOpcional(v.bairro, 100, 'Bairro', erros);
  const cidade = textoOpcional(v.cidade, 100, 'Cidade', erros);
  const ufTexto = (v.uf ?? '').trim();
  const uf = ufTexto ? normalizarUf(ufTexto) : null;
  if (ufTexto && !uf) erros.push(`UF inválida: ${ufTexto}`);
  const cepTexto = (v.cep ?? '').trim();
  const cep = cepTexto ? normalizarCep(cepTexto) : null;
  if (cepTexto && !cep) erros.push(`CEP inválido: ${cepTexto}`);
  const contatoSac = textoOpcional(v.contato_sac, 100, 'Contato do SAC', erros);
  const emailSac = (v.email_sac ?? '').trim().toLowerCase();
  if (emailSac && !EMAIL.test(emailSac)) erros.push(`E-mail do SAC inválido: ${emailSac}`);
  if (erros.length > 0 || !razaoSocial || !cnpj) return { dados: null, erros };
  return {
    dados: { razaoSocial, cnpj, ie, logradouro, numero, complemento, bairro, cidade, uf, cep, contatoSac, emailSac: emailSac || null },
    erros: [],
  };
}

export async function salvarFornecedor(db: DbOuTx, dados: DadosFornecedor, id?: string): Promise<string> {
  if (id !== undefined && !ehUuid(id)) throw new ErroCadastro('Fornecedor não encontrado');
  try {
    if (id) {
      const [atualizado] = await db
        .update(fornecedores)
        .set({ ...dados, atualizadoEm: new Date() })
        .where(eq(fornecedores.id, id))
        .returning({ id: fornecedores.id });
      if (!atualizado) throw new ErroCadastro('Fornecedor não encontrado');
      return atualizado.id;
    }
    const [criado] = await db.insert(fornecedores).values(dados).returning({ id: fornecedores.id });
    return criado.id;
  } catch (erro) {
    if (ehViolacaoDeUnicidade(erro)) throw new ErroCadastro(`Já existe um fornecedor com o CNPJ ${formatarCnpj(dados.cnpj)}`);
    throw erro;
  }
}

/** Importação: atualiza pelo CNPJ (spec §6.8). Célula vazia mantém o valor atual. */
export async function upsertFornecedores(db: DbOuTx, lista: DadosFornecedor[]): Promise<{ criados: number; atualizados: number }> {
  let criados = 0;
  let atualizados = 0;
  for (let i = 0; i < lista.length; i += LOTE) {
    const linhas = await db
      .insert(fornecedores)
      .values(lista.slice(i, i + LOTE))
      .onConflictDoUpdate({
        target: fornecedores.cnpj,
        set: {
          razaoSocial: manterSeVazio('fornecedores', 'razao_social'),
          ie: manterSeVazio('fornecedores', 'ie'),
          logradouro: manterSeVazio('fornecedores', 'logradouro'),
          numero: manterSeVazio('fornecedores', 'numero'),
          complemento: manterSeVazio('fornecedores', 'complemento'),
          bairro: manterSeVazio('fornecedores', 'bairro'),
          cidade: manterSeVazio('fornecedores', 'cidade'),
          uf: manterSeVazio('fornecedores', 'uf'),
          cep: manterSeVazio('fornecedores', 'cep'),
          contatoSac: manterSeVazio('fornecedores', 'contato_sac'),
          emailSac: manterSeVazio('fornecedores', 'email_sac'),
          atualizadoEm: new Date(),
        },
      })
      .returning({ inserido: FOI_INSERIDO });
    for (const l of linhas) {
      if (l.inserido) criados++;
      else atualizados++;
    }
  }
  return { criados, atualizados };
}

export async function listarFornecedores(
  db: DbOuTx,
  opcoes: { busca?: string; pagina?: number } = {},
): Promise<{ linhas: FornecedorLista[]; total: number }> {
  const busca = (opcoes.busca ?? '').trim();
  const documento = busca.toUpperCase().replace(/[^0-9A-Z]/g, '');
  const onde = busca
    ? or(ilike(fornecedores.razaoSocial, `%${escaparLike(busca)}%`), documento ? like(fornecedores.cnpj, `%${documento}%`) : undefined)
    : undefined;
  const pagina = Math.max(1, opcoes.pagina ?? 1);
  const [{ total }] = await db.select({ total: count() }).from(fornecedores).where(onde);
  const linhas = await db
    .select({
      id: fornecedores.id,
      razaoSocial: fornecedores.razaoSocial,
      cnpj: fornecedores.cnpj,
      cidade: fornecedores.cidade,
      uf: fornecedores.uf,
      emailSac: fornecedores.emailSac,
    })
    .from(fornecedores)
    .where(onde)
    .orderBy(asc(fornecedores.razaoSocial))
    .limit(POR_PAGINA_FORNECEDORES)
    .offset((pagina - 1) * POR_PAGINA_FORNECEDORES);
  return { linhas, total };
}

export async function obterFornecedor(db: DbOuTx, id: string): Promise<(DadosFornecedor & { id: string }) | null> {
  if (!ehUuid(id)) return null;
  const [f] = await db.select().from(fornecedores).where(eq(fornecedores.id, id));
  return f ?? null;
}

export async function opcoesFornecedores(db: DbOuTx): Promise<{ cnpj: string; razaoSocial: string }[]> {
  return db
    .select({ cnpj: fornecedores.cnpj, razaoSocial: fornecedores.razaoSocial })
    .from(fornecedores)
    .orderBy(asc(fornecedores.razaoSocial));
}

export async function idsDosFornecedores(db: DbOuTx, cnpjs: string[]): Promise<Map<string, string>> {
  if (cnpjs.length === 0) return new Map();
  const linhas = await db
    .select({ id: fornecedores.id, cnpj: fornecedores.cnpj })
    .from(fornecedores)
    .where(inArray(fornecedores.cnpj, cnpjs));
  return new Map(linhas.map((l) => [l.cnpj, l.id]));
}
```

`src/modules/catalogo/produtos.ts`:

```ts
import { asc, count, eq, ilike, inArray, or } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { ehViolacaoDeUnicidade } from '@/db/erros';
import { fornecedores, produtos } from '@/db/schema';
import { FOI_INSERIDO, manterSeVazio } from '@/db/sql';
import { escaparLike } from '@/lib/texto';
import { ehUuid } from '@/lib/uuid';
import { interpretarValor, textoOpcional } from '@/lib/valores';
import { formatarCnpj, normalizarCnpj, normalizarEan, normalizarNcm, normalizarSku } from './documentos';
import { ErroCadastro } from './erros';
import { idsDosFornecedores } from './fornecedores';

export const POR_PAGINA_PRODUTOS = 50;
const LOTE = 500;

export type DadosProduto = {
  sku: string;
  ean: string | null;
  descricao: string;
  cnpjFornecedor: string | null;
  ncm: string | null;
  custo: string | null;
  unidade: string | null;
};

export type ProdutoLista = {
  id: string;
  sku: string;
  ean: string | null;
  descricao: string;
  custo: string | null;
  fornecedor: string | null;
};

/** Valida uma linha de produto com as chaves do modelo da spec §6.8 (sku, ean, descricao, cnpj_fornecedor, ncm, custo, unidade). */
export function interpretarLinhaProduto(v: Record<string, string>): { dados: DadosProduto | null; erros: string[] } {
  const erros: string[] = [];
  const sku = normalizarSku(v.sku ?? '');
  if (!sku) erros.push('Informe o SKU');
  else if (sku.length > 60) erros.push('SKU: no máximo 60 caracteres');
  const descricao = textoOpcional(v.descricao, 200, 'Descrição', erros);
  if ((v.descricao ?? '').trim() === '') erros.push('Informe a descrição');
  const eanTexto = (v.ean ?? '').trim();
  const ean = eanTexto ? normalizarEan(eanTexto) : null;
  if (eanTexto && !ean) erros.push(`EAN inválido: ${eanTexto}`);
  const cnpjTexto = (v.cnpj_fornecedor ?? '').trim();
  const cnpjFornecedor = cnpjTexto ? normalizarCnpj(cnpjTexto) : null;
  if (cnpjTexto && !cnpjFornecedor) erros.push(`CNPJ do fornecedor inválido: ${cnpjTexto}`);
  const ncmTexto = (v.ncm ?? '').trim();
  const ncm = ncmTexto ? normalizarNcm(ncmTexto) : null;
  if (ncmTexto && !ncm) erros.push(`NCM inválido (precisa ter 8 dígitos): ${ncmTexto}`);
  const custoTexto = (v.custo ?? '').trim();
  const custo = custoTexto ? interpretarValor(custoTexto) : null;
  if (custoTexto && !custo) erros.push(`Custo inválido: ${custoTexto}`);
  const unidade = textoOpcional(v.unidade, 6, 'Unidade', erros)?.toUpperCase() ?? null;
  if (erros.length > 0 || !descricao) return { dados: null, erros };
  return { dados: { sku, ean, descricao, cnpjFornecedor, ncm, custo, unidade }, erros: [] };
}

async function idDoFornecedor(db: DbOuTx, cnpj: string | null): Promise<string | null> {
  if (!cnpj) return null;
  const id = (await idsDosFornecedores(db, [cnpj])).get(cnpj);
  if (!id) throw new ErroCadastro(`Fornecedor não cadastrado (CNPJ ${formatarCnpj(cnpj)})`);
  return id;
}

export async function salvarProduto(db: DbOuTx, dados: DadosProduto, id?: string): Promise<string> {
  if (id !== undefined && !ehUuid(id)) throw new ErroCadastro('Produto não encontrado');
  const fornecedorId = await idDoFornecedor(db, dados.cnpjFornecedor);
  const valores = {
    sku: dados.sku,
    ean: dados.ean,
    descricao: dados.descricao,
    fornecedorId,
    ncm: dados.ncm,
    custo: dados.custo,
    unidade: dados.unidade,
  };
  try {
    if (id) {
      const [atualizado] = await db
        .update(produtos)
        .set({ ...valores, atualizadoEm: new Date() })
        .where(eq(produtos.id, id))
        .returning({ id: produtos.id });
      if (!atualizado) throw new ErroCadastro('Produto não encontrado');
      return atualizado.id;
    }
    const [criado] = await db.insert(produtos).values(valores).returning({ id: produtos.id });
    return criado.id;
  } catch (erro) {
    if (ehViolacaoDeUnicidade(erro)) throw new ErroCadastro(`Já existe um produto com o SKU ${dados.sku}`);
    throw erro;
  }
}

/** Importação: atualiza pelo SKU (spec §6.8). Célula vazia mantém o valor atual. */
export async function upsertProdutos(db: DbOuTx, lista: DadosProduto[]): Promise<{ criados: number; atualizados: number }> {
  const cnpjs = [...new Set(lista.flatMap((p) => (p.cnpjFornecedor ? [p.cnpjFornecedor] : [])))];
  const ids = await idsDosFornecedores(db, cnpjs);
  const faltando = cnpjs.find((c) => !ids.has(c));
  if (faltando) throw new ErroCadastro(`Fornecedor não cadastrado (CNPJ ${formatarCnpj(faltando)})`);
  let criados = 0;
  let atualizados = 0;
  for (let i = 0; i < lista.length; i += LOTE) {
    const valores = lista.slice(i, i + LOTE).map((p) => ({
      sku: p.sku,
      ean: p.ean,
      descricao: p.descricao,
      fornecedorId: p.cnpjFornecedor ? (ids.get(p.cnpjFornecedor) ?? null) : null,
      ncm: p.ncm,
      custo: p.custo,
      unidade: p.unidade,
    }));
    const linhas = await db
      .insert(produtos)
      .values(valores)
      .onConflictDoUpdate({
        target: produtos.sku,
        set: {
          descricao: manterSeVazio('produtos', 'descricao'),
          ean: manterSeVazio('produtos', 'ean'),
          fornecedorId: manterSeVazio('produtos', 'fornecedor_id'),
          ncm: manterSeVazio('produtos', 'ncm'),
          custo: manterSeVazio('produtos', 'custo'),
          unidade: manterSeVazio('produtos', 'unidade'),
          atualizadoEm: new Date(),
        },
      })
      .returning({ inserido: FOI_INSERIDO });
    for (const l of linhas) {
      if (l.inserido) criados++;
      else atualizados++;
    }
  }
  return { criados, atualizados };
}

export async function listarProdutos(
  db: DbOuTx,
  opcoes: { busca?: string; pagina?: number } = {},
): Promise<{ linhas: ProdutoLista[]; total: number }> {
  const busca = (opcoes.busca ?? '').trim();
  const termo = `%${escaparLike(busca)}%`;
  const onde = busca ? or(ilike(produtos.sku, termo), ilike(produtos.descricao, termo), ilike(produtos.ean, termo)) : undefined;
  const pagina = Math.max(1, opcoes.pagina ?? 1);
  const [{ total }] = await db.select({ total: count() }).from(produtos).where(onde);
  const linhas = await db
    .select({
      id: produtos.id,
      sku: produtos.sku,
      ean: produtos.ean,
      descricao: produtos.descricao,
      custo: produtos.custo,
      fornecedor: fornecedores.razaoSocial,
    })
    .from(produtos)
    .leftJoin(fornecedores, eq(fornecedores.id, produtos.fornecedorId))
    .where(onde)
    .orderBy(asc(produtos.sku))
    .limit(POR_PAGINA_PRODUTOS)
    .offset((pagina - 1) * POR_PAGINA_PRODUTOS);
  return { linhas, total };
}

export async function obterProduto(db: DbOuTx, id: string): Promise<(DadosProduto & { id: string }) | null> {
  if (!ehUuid(id)) return null;
  const [p] = await db
    .select({
      id: produtos.id,
      sku: produtos.sku,
      ean: produtos.ean,
      descricao: produtos.descricao,
      cnpjFornecedor: fornecedores.cnpj,
      ncm: produtos.ncm,
      custo: produtos.custo,
      unidade: produtos.unidade,
    })
    .from(produtos)
    .leftJoin(fornecedores, eq(fornecedores.id, produtos.fornecedorId))
    .where(eq(produtos.id, id));
  return p ?? null;
}

export async function idsDosProdutos(db: DbOuTx, skus: string[]): Promise<Map<string, string>> {
  if (skus.length === 0) return new Map();
  const linhas = await db.select({ id: produtos.id, sku: produtos.sku }).from(produtos).where(inArray(produtos.sku, skus));
  return new Map(linhas.map((l) => [l.sku, l.id]));
}
```

`tests/helpers/fabricas.ts`:

```ts
import type { DbOuTx } from '@/db/client';
import type { Perfil } from '@/modules/auth/perfis';
import { criarUsuario, type UsuarioSessao } from '@/modules/auth/usuarios';
import { salvarFornecedor, type DadosFornecedor } from '@/modules/catalogo/fornecedores';
import { salvarProduto, type DadosProduto } from '@/modules/catalogo/produtos';

/** Fábricas de dados para os testes de integração e ponta a ponta (não existem dados de demonstração). */
let contador = 0;
function proximo(): number {
  contador += 1;
  return contador;
}

export async function criarUsuarioTeste(db: DbOuTx, perfil: Perfil = 'OPERADOR'): Promise<UsuarioSessao> {
  const n = proximo();
  return criarUsuario(db, {
    nome: `Usuário Teste ${n}`,
    email: `usuario${n}-${Date.now()}@teste.local`,
    senha: 'senha-de-teste-123',
    perfil,
  });
}

export async function criarFornecedorTeste(db: DbOuTx, dados: Partial<DadosFornecedor> = {}): Promise<string> {
  return salvarFornecedor(db, {
    razaoSocial: 'Fornecedor Teste Ltda',
    cnpj: '11222333000181',
    ie: null,
    logradouro: null,
    numero: null,
    complemento: null,
    bairro: null,
    cidade: null,
    uf: null,
    cep: null,
    contatoSac: null,
    emailSac: null,
    ...dados,
  });
}

export async function criarProdutoTeste(db: DbOuTx, dados: Partial<DadosProduto> = {}): Promise<string> {
  return salvarProduto(db, {
    sku: `SKU-TESTE-${proximo()}`,
    ean: null,
    descricao: 'Produto de teste',
    cnpjFornecedor: null,
    ncm: null,
    custo: null,
    unidade: 'UN',
    ...dados,
  });
}
```

- [ ] **Passo 7: Rodar e confirmar que passa**

Rode: `npm test && npm run test:int && npm run typecheck && npm run lint`
Esperado: tudo PASS (inclusive os testes da Fase 0 de usuários, que agora usam `@/db/erros`).

- [ ] **Passo 8: Commit**

```bash
cd "/c/Users/idmpc/Dvoluções Markt"
git add -A
git commit -m "feat: catálogo de produtos e fornecedores com normalização e upsert" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 3: Leitura de planilhas (CSV e XLSX) e sugestão de colunas

**Por que estas bibliotecas:**
- **papaparse 5.7.0** (CSV): a mais usada e mantida para CSV em JavaScript; detecta sozinha o separador (`;` do Excel brasileiro, `,` ou tabulação) e trata aspas e quebras de linha dentro do campo. Sem dependências.
- **read-excel-file 9.3.14** (XLSX): só leitura, pequena e mantida (versões em 2026). A entrada `read-excel-file/universal` lê um `ArrayBuffer` sem abrir worker threads, o que funciona igual no Vitest e numa Server Action. Com `parseNumber: (t) => t` os números chegam como texto, sem perder zeros nem precisão (EAN, CNPJ).
- **Não** usamos `exceljs` (pesado e sem versão nova desde 2023) nem o pacote npm `xlsx` (parado no npm e com vulnerabilidades conhecidas).
- **fflate** (só nos testes): monta um `.xlsx` mínimo em memória, sem arquivo binário no repositório.

**Arquivos:**
- Criar: `src/modules/importacao/tipos.ts`, `src/modules/importacao/planilha.ts`, `src/modules/importacao/mapeamento.ts`
- Criar: `tests/helpers/xlsx.ts`
- Testes: `src/modules/importacao/planilha.test.ts`, `src/modules/importacao/mapeamento.test.ts`

**Interfaces:**
- Consome: `normalizarTexto` (Tarefa 2)
- Produz:
  - em `tipos.ts` (sem imports com `@/`; o schema importa este arquivo): `TIPOS_IMPORTACAO = ['produtos', 'fornecedores', 'devolucoes'] as const`, `type TipoImportacao`, `type Mapeamento = Record<string, string | null>`, `type ResumoImportacao = { criados: number; atualizados: number; ignorados: number; linhasComErro: number[] }`, `ehTipoImportacao(texto): texto is TipoImportacao`
  - em `planilha.ts`: `type Planilha = { cabecalhos: string[]; linhas: string[][] }`, `class ErroPlanilha`, `MAX_LINHAS = 20_000`, `lerPlanilha(nomeArquivo: string, conteudo: ArrayBuffer): Promise<Planilha>`, `decodificarTexto(bytes: Uint8Array): string`, `lerCsv(texto): string[][]`, `celulaParaTexto(valor: unknown): string`, `montarPlanilha(brutas: unknown[][]): Planilha`
  - em `mapeamento.ts`: `type CampoImportacao = { chave: string; rotulo: string; obrigatorio: boolean; sinonimos: readonly string[] }`, `type LinhaMapeada = { numeroLinha: number; valores: Record<string, string> }`, `sugerirMapeamento(campos, cabecalhos, salvo?): Mapeamento`, `sanitizarMapeamento(campos, cabecalhos, bruto: Record<string, unknown>): Mapeamento`, `camposFaltando(campos, mapeamento): CampoImportacao[]`, `aplicarMapeamento(planilha, campos, mapeamento): LinhaMapeada[]`
  - testes: `criarXlsx(linhas: (string | number | null)[][]): ArrayBuffer`, `paraArrayBuffer(bytes: Uint8Array): ArrayBuffer`

- [ ] **Passo 1: Instalar as bibliotecas**

```bash
cd "/c/Users/idmpc/Dvoluções Markt"
npm install --save-exact papaparse@5.7.0 read-excel-file@9.3.14
npm install --save-exact -D @types/papaparse@5.5.2 fflate@0.8.2
```

Esperado: as quatro aparecem no `package.json` sem `^`.

- [ ] **Passo 2: Ajudante de testes que monta um .xlsx**

`tests/helpers/xlsx.ts`:

```ts
import { strToU8, zipSync } from 'fflate';

export function paraArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copia = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copia).set(bytes);
  return copia;
}

function escapar(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function celula(valor: string | number | null, linha: number, coluna: number): string {
  if (valor === null) return '';
  const ref = `${String.fromCharCode(65 + coluna)}${linha + 1}`;
  if (typeof valor === 'number') return `<c r="${ref}"><v>${valor}</v></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t>${escapar(valor)}</t></is></c>`;
}

/** Monta em memória um .xlsx mínimo (uma aba, textos inline e números), como o Excel salvaria. */
export function criarXlsx(linhas: (string | number | null)[][]): ArrayBuffer {
  const dados = linhas
    .map((linha, r) => `<row r="${r + 1}">${linha.map((v, c) => celula(v, r, c)).join('')}</row>`)
    .join('');
  const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const arquivos = {
    '[Content_Types].xml': strToU8(
      `${xml}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    ),
    '_rels/.rels': strToU8(
      `${xml}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    'xl/workbook.xml': strToU8(
      `${xml}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Planilha1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      `${xml}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    ),
    'xl/worksheets/sheet1.xml': strToU8(
      `${xml}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${dados}</sheetData></worksheet>`,
    ),
  };
  return paraArrayBuffer(zipSync(arquivos));
}
```

- [ ] **Passo 3: Escrever os testes que falham**

`src/modules/importacao/planilha.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { criarXlsx, paraArrayBuffer } from '../../../tests/helpers/xlsx';
import { ErroPlanilha, lerPlanilha, MAX_LINHAS } from './planilha';

const utf8 = (texto: string) => paraArrayBuffer(new TextEncoder().encode(texto));

describe('lerPlanilha: CSV', () => {
  it('lê CSV com ";", BOM, aspas e linha vazia no meio', async () => {
    const csv = '﻿sku;descricao;custo\r\nA1;"Fone; sem fio";1.234,56\r\n\r\nB2;Cabo;\r\n';
    expect(await lerPlanilha('produtos.csv', utf8(csv))).toEqual({
      cabecalhos: ['sku', 'descricao', 'custo'],
      linhas: [
        ['A1', 'Fone; sem fio', '1.234,56'],
        ['', '', ''],
        ['B2', 'Cabo', ''],
      ],
    });
  });

  it('lê CSV com "," e CSV salvo em Windows-1252 pelo Excel', async () => {
    expect((await lerPlanilha('a.csv', utf8('a,b\n1,2\n'))).linhas).toEqual([['1', '2']]);
    const latin1 = Uint8Array.from('Código;Descrição\r\nA1;Pão\r\n', (c) => c.charCodeAt(0));
    expect(await lerPlanilha('b.csv', paraArrayBuffer(latin1))).toEqual({ cabecalhos: ['Código', 'Descrição'], linhas: [['A1', 'Pão']] });
  });

  it('dá nome às colunas sem título e diferencia nomes repetidos', async () => {
    const r = await lerPlanilha('c.csv', utf8('SKU;;SKU\nA;B;C\n'));
    expect(r.cabecalhos).toEqual(['SKU', 'Coluna 2', 'SKU (2)']);
  });
});

describe('lerPlanilha: XLSX', () => {
  it('lê a primeira aba, com números como texto (sem perder dígitos)', async () => {
    const xlsx = criarXlsx([
      ['Código', 'Descrição', 'Custo', 'GTIN'],
      ['SKU-1', 'Fone', 12.5, 7891234567895],
      ['SKU-2', 'Cabo & Cia', null, '0789'],
    ]);
    expect(await lerPlanilha('produtos.xlsx', xlsx)).toEqual({
      cabecalhos: ['Código', 'Descrição', 'Custo', 'GTIN'],
      linhas: [
        ['SKU-1', 'Fone', '12.5', '7891234567895'],
        ['SKU-2', 'Cabo & Cia', '', '0789'],
      ],
    });
  });

  it('explica quando o arquivo .xlsx não é uma planilha', async () => {
    await expect(lerPlanilha('falso.xlsx', utf8('isto não é xlsx'))).rejects.toThrow(
      new ErroPlanilha('Não foi possível ler o arquivo .xlsx. Abra no Excel, salve de novo e tente outra vez.'),
    );
  });
});

describe('lerPlanilha: recusas', () => {
  it('recusa .xls antigo e outras extensões', async () => {
    await expect(lerPlanilha('velho.xls', utf8('x'))).rejects.toThrow(
      'Arquivos .xls (Excel antigo) não são aceitos. No Excel, use "Salvar como" .xlsx ou .csv.',
    );
    await expect(lerPlanilha('foto.jpg', utf8('x'))).rejects.toThrow('Envie um arquivo .csv ou .xlsx.');
  });

  it('recusa planilha vazia, só com cabeçalho e grande demais', async () => {
    await expect(lerPlanilha('v.csv', utf8('\n\n'))).rejects.toThrow('A planilha está vazia.');
    await expect(lerPlanilha('c.csv', utf8('sku;descricao\n'))).rejects.toThrow('A planilha só tem a linha dos nomes das colunas.');
    const grande = `sku\n${'A\n'.repeat(MAX_LINHAS + 1)}`;
    await expect(lerPlanilha('g.csv', utf8(grande))).rejects.toThrow(`A planilha tem ${MAX_LINHAS + 1} linhas; o limite é ${MAX_LINHAS}. Divida o arquivo.`);
  });
});
```

`src/modules/importacao/mapeamento.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { aplicarMapeamento, camposFaltando, sanitizarMapeamento, sugerirMapeamento, type CampoImportacao } from './mapeamento';

const CAMPOS: CampoImportacao[] = [
  { chave: 'sku', rotulo: 'SKU', obrigatorio: true, sinonimos: ['codigo', 'cod', 'codigo do produto', 'referencia'] },
  { chave: 'ean', rotulo: 'EAN (código de barras)', obrigatorio: false, sinonimos: ['ean', 'gtin', 'codigo de barras', 'cod barras'] },
  { chave: 'descricao', rotulo: 'Descrição', obrigatorio: true, sinonimos: ['produto', 'nome do produto', 'nome'] },
  { chave: 'unidade', rotulo: 'Unidade', obrigatorio: false, sinonimos: ['un', 'unid', 'unidade de medida'] },
];

describe('sugerirMapeamento', () => {
  it('casa os exemplos da spec §6.8: "Código" → sku e "Código de barras"/"GTIN" → ean', () => {
    expect(sugerirMapeamento(CAMPOS, ['Código', 'Código de barras', 'Descrição'])).toEqual({
      sku: 'Código',
      ean: 'Código de barras',
      descricao: 'Descrição',
      unidade: null,
    });
    expect(sugerirMapeamento(CAMPOS, ['GTIN', 'SKU', 'Nome do Produto'])).toMatchObject({ sku: 'SKU', ean: 'GTIN', descricao: 'Nome do Produto' });
  });

  it('usa todas as palavras de um sinônimo dentro do nome da coluna, sem repetir coluna', () => {
    expect(sugerirMapeamento(CAMPOS, ['Cod. Produto', 'Código de Barras', 'Descrição curta'])).toEqual({
      sku: 'Cod. Produto',
      ean: 'Código de Barras',
      descricao: 'Descrição curta',
      unidade: null,
    });
  });

  it('o mapeamento salvo vence a sugestão quando a coluna existe', () => {
    const salvo = { sku: 'Ref. Interna', ean: 'Coluna que sumiu', descricao: null, unidade: 'Und' };
    expect(sugerirMapeamento(CAMPOS, ['Código', 'Ref. Interna', 'Descrição', 'Und'], salvo)).toEqual({
      sku: 'Ref. Interna',
      ean: null,
      descricao: 'Descrição',
      unidade: 'Und',
    });
  });
});

describe('sanitizarMapeamento e camposFaltando', () => {
  it('aceita só campos conhecidos e colunas que existem, uma coluna por campo', () => {
    const bruto = { sku: 'Código', ean: 'Código', descricao: 'Não existe', extra: 'Código', unidade: 42 };
    const m = sanitizarMapeamento(CAMPOS, ['Código', 'Descrição'], bruto);
    expect(m).toEqual({ sku: 'Código', ean: null, descricao: null, unidade: null });
    expect(camposFaltando(CAMPOS, m).map((c) => c.rotulo)).toEqual(['Descrição']);
  });
});

describe('aplicarMapeamento', () => {
  it('monta as linhas com o número da linha na planilha e pula as vazias', () => {
    const planilha = {
      cabecalhos: ['Código', 'Nome', 'Obs'],
      linhas: [
        ['A1', ' Fone ', 'x'],
        ['', '', 'só observação'],
        ['B2', 'Cabo', ''],
      ],
    };
    const linhas = aplicarMapeamento(planilha, CAMPOS, { sku: 'Código', ean: null, descricao: 'Nome', unidade: null });
    expect(linhas).toEqual([
      { numeroLinha: 2, valores: { sku: 'A1', ean: '', descricao: 'Fone', unidade: '' } },
      { numeroLinha: 4, valores: { sku: 'B2', ean: '', descricao: 'Cabo', unidade: '' } },
    ]);
  });
});
```

Rode: `npm test`
Esperado: FAIL (os módulos de importação ainda não existem).

- [ ] **Passo 4: Implementar**

`src/modules/importacao/tipos.ts`:

```ts
/** Tipos de importação de planilha (spec §6.1 e §6.8). Sem imports com "@/": o drizzle-kit lê este arquivo pelo schema. */
export const TIPOS_IMPORTACAO = ['produtos', 'fornecedores', 'devolucoes'] as const;
export type TipoImportacao = (typeof TIPOS_IMPORTACAO)[number];

/** Campo do sistema → nome da coluna da planilha (null quando o campo não vem na planilha). */
export type Mapeamento = Record<string, string | null>;

export type ResumoImportacao = { criados: number; atualizados: number; ignorados: number; linhasComErro: number[] };

export function ehTipoImportacao(texto: string): texto is TipoImportacao {
  return (TIPOS_IMPORTACAO as readonly string[]).includes(texto);
}
```

`src/modules/importacao/planilha.ts`:

```ts
import Papa from 'papaparse';
import { readSheet } from 'read-excel-file/universal';

export type Planilha = { cabecalhos: string[]; linhas: string[][] };

export class ErroPlanilha extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroPlanilha';
  }
}

export const MAX_LINHAS = 20_000;

/** Lê a planilha enviada (spec §6.8): CSV ou a primeira aba do XLSX. A primeira linha tem os nomes das colunas. */
export async function lerPlanilha(nomeArquivo: string, conteudo: ArrayBuffer): Promise<Planilha> {
  const extensao = nomeArquivo.toLowerCase().split('.').pop() ?? '';
  if (extensao === 'csv' || extensao === 'txt') return montarPlanilha(lerCsv(decodificarTexto(new Uint8Array(conteudo))));
  if (extensao === 'xlsx') return montarPlanilha(await lerXlsx(conteudo));
  if (extensao === 'xls') {
    throw new ErroPlanilha('Arquivos .xls (Excel antigo) não são aceitos. No Excel, use "Salvar como" .xlsx ou .csv.');
  }
  throw new ErroPlanilha('Envie um arquivo .csv ou .xlsx.');
}

/** UTF-8 (com ou sem BOM); se não for UTF-8 válido, Windows-1252, que é como o Excel em português salva CSV. */
export function decodificarTexto(bytes: Uint8Array): string {
  let texto: string;
  try {
    texto = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    texto = new TextDecoder('windows-1252').decode(bytes);
  }
  return texto.replace(/^﻿/, '');
}

/** O separador (";" do Excel brasileiro, "," ou tabulação) é detectado pelo papaparse. */
export function lerCsv(texto: string): string[][] {
  return Papa.parse<string[]>(texto, { skipEmptyLines: false }).data;
}

async function lerXlsx(conteudo: ArrayBuffer): Promise<unknown[][]> {
  try {
    // Números como texto: EAN e CNPJ não perdem dígitos nem zeros.
    return await readSheet(conteudo, { parseNumber: (texto: string) => texto });
  } catch {
    throw new ErroPlanilha('Não foi possível ler o arquivo .xlsx. Abra no Excel, salve de novo e tente outra vez.');
  }
}

export function celulaParaTexto(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? '' : valor.toISOString().slice(0, 10);
  return String(valor).trim();
}

function nomesUnicos(nomes: string[]): string[] {
  const vistos = new Map<string, number>();
  return nomes.map((nome) => {
    const vez = (vistos.get(nome) ?? 0) + 1;
    vistos.set(nome, vez);
    return vez === 1 ? nome : `${nome} (${vez})`;
  });
}

/** Transforma as linhas brutas em cabeçalhos + linhas de texto do mesmo tamanho, com as checagens de tamanho. */
export function montarPlanilha(brutas: unknown[][]): Planilha {
  const linhas = brutas.map((linha) => linha.map(celulaParaTexto));
  while (linhas.length > 0 && linhas[linhas.length - 1].every((c) => c === '')) linhas.pop();
  if (linhas.length === 0) throw new ErroPlanilha('A planilha está vazia.');
  const [primeira, ...dados] = linhas;
  while (primeira.length > 0 && primeira[primeira.length - 1] === '') primeira.pop();
  if (dados.length === 0) throw new ErroPlanilha('A planilha só tem a linha dos nomes das colunas.');
  if (dados.length > MAX_LINHAS) {
    throw new ErroPlanilha(`A planilha tem ${dados.length} linhas; o limite é ${MAX_LINHAS}. Divida o arquivo.`);
  }
  const cabecalhos = nomesUnicos(primeira.map((c, i) => c || `Coluna ${i + 1}`));
  return { cabecalhos, linhas: dados.map((linha) => cabecalhos.map((_, i) => linha[i] ?? '')) };
}
```

`src/modules/importacao/mapeamento.ts`:

```ts
import { normalizarTexto } from '@/lib/texto';
import type { Planilha } from './planilha';
import type { Mapeamento } from './tipos';

export type CampoImportacao = { chave: string; rotulo: string; obrigatorio: boolean; sinonimos: readonly string[] };
export type LinhaMapeada = { numeroLinha: number; valores: Record<string, string> };

function candidatos(campo: CampoImportacao): string[] {
  return [campo.chave.replace(/_/g, ' '), campo.rotulo, ...campo.sinonimos].map(normalizarTexto).filter(Boolean);
}

/**
 * Sugere a coluna de cada campo (spec §6.8): primeiro o último mapeamento salvo do tipo,
 * depois nome igual (sem acento, maiúscula e pontuação), por fim uma coluna que contém todas as palavras de um sinônimo.
 * Cada coluna vai para no máximo um campo.
 */
export function sugerirMapeamento(
  campos: readonly CampoImportacao[],
  cabecalhos: readonly string[],
  salvo?: Mapeamento | null,
): Mapeamento {
  const resultado: Mapeamento = Object.fromEntries(campos.map((c) => [c.chave, null]));
  const usados = new Set<string>();
  const escolher = (chave: string, cabecalho: string) => {
    resultado[chave] = cabecalho;
    usados.add(cabecalho);
  };

  if (salvo) {
    for (const campo of campos) {
      const cabecalho = salvo[campo.chave];
      if (cabecalho && cabecalhos.includes(cabecalho) && !usados.has(cabecalho)) escolher(campo.chave, cabecalho);
    }
  }

  const normalizados = cabecalhos.map((cabecalho) => ({ cabecalho, texto: normalizarTexto(cabecalho) }));

  for (const campo of campos) {
    if (resultado[campo.chave]) continue;
    const alvos = new Set(candidatos(campo));
    const achado = normalizados.find((n) => !usados.has(n.cabecalho) && alvos.has(n.texto));
    if (achado) escolher(campo.chave, achado.cabecalho);
  }

  for (const campo of campos) {
    if (resultado[campo.chave]) continue;
    const listas = candidatos(campo).map((c) => c.split(' '));
    const achado = normalizados.find((n) => {
      if (usados.has(n.cabecalho)) return false;
      const palavras = new Set(n.texto.split(' '));
      return listas.some((lista) => lista.every((p) => palavras.has(p)));
    });
    if (achado) escolher(campo.chave, achado.cabecalho);
  }

  return resultado;
}

/** Aceita só campos conhecidos e colunas que existem na planilha; cada coluna vai para no máximo um campo. */
export function sanitizarMapeamento(
  campos: readonly CampoImportacao[],
  cabecalhos: readonly string[],
  bruto: Record<string, unknown>,
): Mapeamento {
  const resultado: Mapeamento = {};
  const usados = new Set<string>();
  for (const campo of campos) {
    const valor = bruto[campo.chave];
    if (typeof valor === 'string' && cabecalhos.includes(valor) && !usados.has(valor)) {
      resultado[campo.chave] = valor;
      usados.add(valor);
    } else {
      resultado[campo.chave] = null;
    }
  }
  return resultado;
}

export function camposFaltando(campos: readonly CampoImportacao[], mapeamento: Mapeamento): CampoImportacao[] {
  return campos.filter((c) => c.obrigatorio && !mapeamento[c.chave]);
}

/** Uma LinhaMapeada por linha com algum valor. `numeroLinha` é o número da linha na planilha (o cabeçalho é a linha 1). */
export function aplicarMapeamento(planilha: Planilha, campos: readonly CampoImportacao[], mapeamento: Mapeamento): LinhaMapeada[] {
  const indices = campos.map((campo) => {
    const cabecalho = mapeamento[campo.chave];
    return { chave: campo.chave, indice: cabecalho ? planilha.cabecalhos.indexOf(cabecalho) : -1 };
  });
  const resultado: LinhaMapeada[] = [];
  planilha.linhas.forEach((linha, i) => {
    const valores: Record<string, string> = {};
    for (const { chave, indice } of indices) valores[chave] = indice >= 0 ? (linha[indice] ?? '').trim() : '';
    if (Object.values(valores).every((v) => v === '')) return;
    resultado.push({ numeroLinha: i + 2, valores });
  });
  return resultado;
}
```

- [ ] **Passo 5: Rodar e confirmar que passa**

Rode: `npm test && npm run typecheck && npm run lint`
Esperado: tudo PASS.

- [ ] **Passo 6: Commit**

```bash
cd "/c/Users/idmpc/Dvoluções Markt"
git add -A
git commit -m "feat: leitura de planilhas CSV/XLSX e sugestão de colunas" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 4: Serviço de importação com prévia (produtos e fornecedores)

**Arquivos:**
- Criar: `src/db/schema/importacao.ts`
- Modificar (substituir o conteúdo): `src/db/schema/index.ts`
- Criar: `src/modules/importacao/definicao.ts`, `src/modules/importacao/definicoes/fornecedores.ts`, `src/modules/importacao/definicoes/produtos.ts`, `src/modules/importacao/definicoes/index.ts`, `src/modules/importacao/servico.ts`
- Gerado: `drizzle/0003_*.sql`
- Teste: `src/modules/importacao/importacao.int.test.ts`

**Interfaces:**
- Consome: `interpretarLinhaFornecedor`, `upsertFornecedores`, `interpretarLinhaProduto`, `upsertProdutos`, `idsDosFornecedores`, `formatarCnpj`, `DbOuTx`, `ehUuid`, `criarUsuarioTeste`, `criarFornecedorTeste` (Tarefa 2); `Planilha`, `CampoImportacao`, `LinhaMapeada`, `sugerirMapeamento`, `sanitizarMapeamento`, `camposFaltando`, `aplicarMapeamento`, `Mapeamento`, `ResumoImportacao`, `TipoImportacao`, `ehTipoImportacao` (Tarefa 3); `Acao`, `UsuarioSessao` (Fase 0)
- Produz:
  - tabelas `importacoes` e `mapeamentos_importacao`
  - em `definicao.ts`: `type LinhaPrevia = LinhaMapeada & { erros: string[]; avisos: string[] }`, `type DefinicaoImportacao = { tipo; titulo; acao: Acao; voltarPara: string; rotuloCriados: string; rotuloAtualizados: string | null; campos: readonly CampoImportacao[]; validar(db, linhas): Promise<LinhaPrevia[]>; aplicar(db, linhas: LinhaPrevia[], usuario): Promise<{ criados: number; atualizados: number }> }`, `dadosOuErro<T>(resultado, numeroLinha): T`
  - `definicaoProdutos`, `definicaoFornecedores`, `obterDefinicao(tipo: string): DefinicaoImportacao | null`
  - em `servico.ts`: `TAMANHO_MAXIMO_BYTES` (5 MB), `class ErroImportacao`, `type Importacao`, `type Previa = { linhas: LinhaPrevia[]; validas: number; comErro: number; faltando: string[] }`, `registrarUpload(db, { tipo, nomeArquivo, planilha, usuarioId }, agora?): Promise<string>`, `obterImportacao(db, id, tipo): Promise<Importacao | null>`, `mapeamentoSalvo(db, tipo)`, `mapeamentoEfetivo(db, def, imp): Promise<Mapeamento>`, `definirMapeamento(db, def, imp, bruto): Promise<Mapeamento>`, `calcularPrevia(db, def, imp, mapeamento): Promise<Previa>`, `confirmarImportacao(db, def, imp, bruto, usuario, agora?): Promise<ResumoImportacao>`

- [ ] **Passo 1: Tabelas da importação**

`src/db/schema/importacao.ts`:

```ts
import { jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { TIPOS_IMPORTACAO, type Mapeamento, type ResumoImportacao } from '../../modules/importacao/tipos';
import { usuarios } from './auth';

export const tipoImportacaoEnum = pgEnum('tipo_importacao', TIPOS_IMPORTACAO);
export const situacaoImportacaoEnum = pgEnum('situacao_importacao', ['PENDENTE', 'CONCLUIDA']);

/** Planilha enviada, guardada entre o envio e a confirmação (spec §6.8: prévia antes de confirmar). */
export const importacoes = pgTable('importacoes', {
  id: uuid('id').primaryKey().defaultRandom(),
  tipo: tipoImportacaoEnum('tipo').notNull(),
  nomeArquivo: text('nome_arquivo').notNull(),
  cabecalhos: jsonb('cabecalhos').$type<string[]>().notNull(),
  linhas: jsonb('linhas').$type<string[][]>().notNull(),
  mapeamento: jsonb('mapeamento').$type<Mapeamento>(),
  situacao: situacaoImportacaoEnum('situacao').notNull().default('PENDENTE'),
  resumo: jsonb('resumo').$type<ResumoImportacao>(),
  criadoPor: uuid('criado_por')
    .notNull()
    .references(() => usuarios.id),
  criadaEm: timestamp('criada_em', { withTimezone: true }).notNull().defaultNow(),
  concluidaEm: timestamp('concluida_em', { withTimezone: true }),
});

/** Último mapeamento confirmado de cada tipo: vira a sugestão da próxima importação (spec §6.8). */
export const mapeamentosImportacao = pgTable('mapeamentos_importacao', {
  tipo: tipoImportacaoEnum('tipo').primaryKey(),
  mapeamento: jsonb('mapeamento').$type<Mapeamento>().notNull(),
  atualizadoPor: uuid('atualizado_por').references(() => usuarios.id, { onDelete: 'set null' }),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
});
```

`src/db/schema/index.ts` (substitui todo o conteúdo):

```ts
export * from './auth';
export * from './catalogo';
export * from './importacao';
export * from './notificacoes';
```

```bash
cd "/c/Users/idmpc/Dvoluções Markt"
npm run db:gerar
npm run db:migrar
```

Esperado: `drizzle/0003_<nome>.sql` com `CREATE TYPE "public"."tipo_importacao"`, `CREATE TABLE "importacoes"` e `CREATE TABLE "mapeamentos_importacao"`.

- [ ] **Passo 2: Escrever o teste de integração que falha**

`src/modules/importacao/importacao.int.test.ts`:

```ts
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { importacoes } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { listarFornecedores } from '@/modules/catalogo/fornecedores';
import { listarProdutos } from '@/modules/catalogo/produtos';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarFornecedorTeste, criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { obterDefinicao } from './definicoes';
import type { DefinicaoImportacao } from './definicao';
import {
  calcularPrevia,
  confirmarImportacao,
  definirMapeamento,
  ErroImportacao,
  mapeamentoEfetivo,
  mapeamentoSalvo,
  obterImportacao,
  registrarUpload,
} from './servico';

const { db, sql } = criarDbTeste();
let fiscal: UsuarioSessao;

function definicao(tipo: string): DefinicaoImportacao {
  const def = obterDefinicao(tipo);
  if (!def) throw new Error(`sem definição para ${tipo}`);
  return def;
}

async function enviar(tipo: 'produtos' | 'fornecedores', cabecalhos: string[], linhas: string[][], agora?: Date) {
  const id = await registrarUpload(db, { tipo, nomeArquivo: `${tipo}.csv`, planilha: { cabecalhos, linhas }, usuarioId: fiscal.id }, agora);
  const imp = await obterImportacao(db, id, tipo);
  if (!imp) throw new Error('importação não gravada');
  return imp;
}

beforeEach(async () => {
  await limparTabelas(sql);
  fiscal = await criarUsuarioTeste(db, 'FISCAL');
});
afterAll(async () => {
  await sql.end();
});

describe('definições', () => {
  it('existe definição para produtos e fornecedores, com a permissão da spec §6.9', () => {
    expect(definicao('produtos')).toMatchObject({ acao: 'gerir_catalogo', voltarPara: '/cadastros/produtos' });
    expect(definicao('fornecedores')).toMatchObject({ acao: 'gerir_catalogo', voltarPara: '/cadastros/fornecedores' });
    expect(obterDefinicao('qualquer')).toBeNull();
  });
});

describe('importação de fornecedores', () => {
  it('sugere as colunas, mostra a prévia e acusa CNPJ repetido no arquivo', async () => {
    const def = definicao('fornecedores');
    const imp = await enviar('fornecedores', ['Razão Social', 'CNPJ', 'UF'], [
      ['Alfa Ltda', '11.222.333/0001-81', 'SP'],
      ['Alfa de novo', '11222333000181', 'SP'],
      ['Beta SA', '123', 'MG'],
    ]);
    const mapeamento = await mapeamentoEfetivo(db, def, imp);
    expect(mapeamento).toMatchObject({ razao_social: 'Razão Social', cnpj: 'CNPJ', uf: 'UF', email_sac: null });
    const previa = await calcularPrevia(db, def, imp, mapeamento);
    expect(previa.validas).toBe(1);
    expect(previa.comErro).toBe(2);
    expect(previa.linhas.map((l) => [l.numeroLinha, l.erros])).toEqual([
      [2, []],
      [3, ['CNPJ 11.222.333/0001-81 repetido: já aparece na linha 2']],
      [4, ['CNPJ inválido: 123']],
    ]);
  });
});

describe('importação de produtos', () => {
  it('acusa fornecedor não cadastrado e SKU repetido', async () => {
    await criarFornecedorTeste(db, { cnpj: '11222333000181' });
    const def = definicao('produtos');
    const imp = await enviar('produtos', ['Código', 'Descrição', 'CNPJ Fornecedor'], [
      ['FONE-01', 'Fone', '11222333000181'],
      ['fone-01', 'Fone repetido', ''],
      ['CABO-02', 'Cabo', '12345678000195'],
    ]);
    const previa = await calcularPrevia(db, def, imp, await mapeamentoEfetivo(db, def, imp));
    expect(previa.linhas.map((l) => l.erros)).toEqual([
      [],
      ['SKU repetido: já aparece na linha 2'],
      ['Fornecedor não cadastrado (CNPJ 12.345.678/0001-95). Importe os fornecedores antes.'],
    ]);
  });

  it('avisa quais campos obrigatórios estão sem coluna', async () => {
    const def = definicao('produtos');
    const imp = await enviar('produtos', ['Coluna A', 'Coluna B'], [['x', 'y']]);
    const previa = await calcularPrevia(db, def, imp, await mapeamentoEfetivo(db, def, imp));
    expect(previa).toEqual({ linhas: [], validas: 0, comErro: 0, faltando: ['SKU', 'Descrição'] });
  });

  it('confirma: grava só as linhas válidas, guarda o resumo e o mapeamento do tipo, e não confirma duas vezes', async () => {
    const def = definicao('produtos');
    const imp = await enviar('produtos', ['Ref', 'Nome', 'GTIN'], [
      ['FONE-01', 'Fone', '7891000000014'],
      ['CABO-02', 'Cabo', '7891000000099'],
    ]);
    const mapeamento = await definirMapeamento(db, def, imp, { sku: 'Ref', descricao: 'Nome', ean: 'GTIN', ncm: 'Não existe' });
    expect(mapeamento).toMatchObject({ sku: 'Ref', descricao: 'Nome', ean: 'GTIN', ncm: null });

    const recarregada = await obterImportacao(db, imp.id, 'produtos');
    if (!recarregada) throw new Error('sumiu');
    expect(await mapeamentoEfetivo(db, def, recarregada)).toEqual(mapeamento);

    const resumo = await confirmarImportacao(db, def, recarregada, mapeamento, fiscal);
    expect(resumo).toEqual({ criados: 1, atualizados: 0, ignorados: 1, linhasComErro: [3] });
    expect((await listarProdutos(db)).linhas.map((p) => p.sku)).toEqual(['FONE-01']);

    const [gravada] = await db.select().from(importacoes).where(eq(importacoes.id, imp.id));
    expect(gravada).toMatchObject({ situacao: 'CONCLUIDA', linhas: [], resumo });
    expect(await mapeamentoSalvo(db, 'produtos')).toEqual(mapeamento);

    await expect(confirmarImportacao(db, def, recarregada, mapeamento, fiscal)).rejects.toThrow(
      new ErroImportacao('Esta importação já foi concluída.'),
    );
  });

  it('a próxima importação do mesmo tipo já vem com o mapeamento salvo', async () => {
    const def = definicao('produtos');
    // "Col X" e "Col Y" não lembram nenhum campo: só o mapeamento salvo explica a sugestão.
    const primeira = await enviar('produtos', ['Col X', 'Col Y'], [['FONE-01', 'Fone']]);
    await confirmarImportacao(db, def, primeira, { sku: 'Col X', descricao: 'Col Y' }, fiscal);
    const segunda = await enviar('produtos', ['Col Y', 'Col X'], [['Cabo', 'CABO-02']]);
    expect(await mapeamentoEfetivo(db, def, segunda)).toMatchObject({ sku: 'Col X', descricao: 'Col Y' });
  });

  it('recusa confirmar sem nenhuma linha válida (e não marca a importação como concluída)', async () => {
    const def = definicao('produtos');
    const imp = await enviar('produtos', ['Ref', 'Nome'], [['', 'Sem SKU']]);
    await expect(confirmarImportacao(db, def, imp, { sku: 'Ref', descricao: 'Nome' }, fiscal)).rejects.toThrow(
      'Nenhuma linha está pronta para importar. Corrija a planilha e envie de novo.',
    );
    expect((await obterImportacao(db, imp.id, 'produtos'))?.situacao).toBe('PENDENTE');
  });
});

describe('fornecedores confirmados atualizam pelo CNPJ', () => {
  it('upsert conta novos e atualizados', async () => {
    await criarFornecedorTeste(db, { cnpj: '11222333000181', razaoSocial: 'Alfa Antiga' });
    const def = definicao('fornecedores');
    const imp = await enviar('fornecedores', ['Razão Social', 'CNPJ'], [
      ['Alfa Nova', '11222333000181'],
      ['Beta', '12345678000195'],
    ]);
    const resumo = await confirmarImportacao(db, def, imp, { razao_social: 'Razão Social', cnpj: 'CNPJ' }, fiscal);
    expect(resumo).toMatchObject({ criados: 1, atualizados: 1, ignorados: 0 });
    expect((await listarFornecedores(db)).linhas.map((f) => f.razaoSocial)).toEqual(['Alfa Nova', 'Beta']);
  });
});

describe('limpeza', () => {
  it('apaga importações pendentes com mais de 1 dia no próximo envio', async () => {
    const antiga = await enviar('produtos', ['Ref'], [['A']], new Date('2026-11-10T12:00:00Z'));
    await enviar('produtos', ['Ref'], [['B']], new Date('2026-11-12T12:00:00Z'));
    expect(await obterImportacao(db, antiga.id, 'produtos')).toBeNull();
  });

  it('obterImportacao não acha id inválido nem de outro tipo', async () => {
    const imp = await enviar('produtos', ['Ref'], [['A']]);
    expect(await obterImportacao(db, 'nao-e-uuid', 'produtos')).toBeNull();
    expect(await obterImportacao(db, imp.id, 'fornecedores')).toBeNull();
  });
});
```

Rode: `npm run test:int`
Esperado: FAIL (`./definicoes` e `./servico` não existem).

- [ ] **Passo 3: Implementar as definições**

`src/modules/importacao/definicao.ts`:

```ts
import type { DbOuTx } from '@/db/client';
import type { Acao } from '@/modules/auth/permissoes';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import type { CampoImportacao, LinhaMapeada } from './mapeamento';
import type { TipoImportacao } from './tipos';

export type LinhaPrevia = LinhaMapeada & { erros: string[]; avisos: string[] };

/** O que muda de um tipo de importação para outro. O fluxo (envio → colunas → prévia → confirmação) é o mesmo. */
export type DefinicaoImportacao = {
  tipo: TipoImportacao;
  titulo: string;
  /** Permissão exigida (spec §6.9). */
  acao: Acao;
  /** Lista para onde o usuário volta. */
  voltarPara: string;
  rotuloCriados: string;
  /** null quando a importação só cria. */
  rotuloAtualizados: string | null;
  campos: readonly CampoImportacao[];
  validar(db: DbOuTx, linhas: LinhaMapeada[]): Promise<LinhaPrevia[]>;
  /** Recebe só linhas sem erro e roda dentro da transação da confirmação. */
  aplicar(db: DbOuTx, linhas: LinhaPrevia[], usuario: UsuarioSessao): Promise<{ criados: number; atualizados: number }>;
};

export function dadosOuErro<T>(resultado: { dados: T | null; erros: string[] }, numeroLinha: number): T {
  if (!resultado.dados) throw new Error(`Linha ${numeroLinha} inválida: ${resultado.erros.join('; ')}`);
  return resultado.dados;
}
```

`src/modules/importacao/definicoes/fornecedores.ts`:

```ts
import { formatarCnpj } from '@/modules/catalogo/documentos';
import { interpretarLinhaFornecedor, upsertFornecedores } from '@/modules/catalogo/fornecedores';
import { dadosOuErro, type DefinicaoImportacao } from '../definicao';

/** Modelo sugerido da spec §6.8: razao_social, cnpj, ie, logradouro, numero, complemento, bairro, cidade, uf, cep, contato_sac, email_sac. */
export const definicaoFornecedores: DefinicaoImportacao = {
  tipo: 'fornecedores',
  titulo: 'Fornecedores',
  acao: 'gerir_catalogo',
  voltarPara: '/cadastros/fornecedores',
  rotuloCriados: 'Fornecedores novos',
  rotuloAtualizados: 'Fornecedores atualizados',
  campos: [
    { chave: 'razao_social', rotulo: 'Razão social', obrigatorio: true, sinonimos: ['razao social', 'nome', 'fornecedor', 'empresa', 'nome empresarial'] },
    { chave: 'cnpj', rotulo: 'CNPJ', obrigatorio: true, sinonimos: ['cnpj', 'documento', 'cnpj do fornecedor'] },
    { chave: 'ie', rotulo: 'Inscrição estadual', obrigatorio: false, sinonimos: ['ie', 'inscricao estadual', 'insc estadual'] },
    { chave: 'logradouro', rotulo: 'Logradouro', obrigatorio: false, sinonimos: ['endereco', 'rua', 'logradouro'] },
    { chave: 'numero', rotulo: 'Número', obrigatorio: false, sinonimos: ['numero', 'num', 'n'] },
    { chave: 'complemento', rotulo: 'Complemento', obrigatorio: false, sinonimos: ['complemento'] },
    { chave: 'bairro', rotulo: 'Bairro', obrigatorio: false, sinonimos: ['bairro'] },
    { chave: 'cidade', rotulo: 'Cidade', obrigatorio: false, sinonimos: ['cidade', 'municipio'] },
    { chave: 'uf', rotulo: 'UF', obrigatorio: false, sinonimos: ['uf', 'estado'] },
    { chave: 'cep', rotulo: 'CEP', obrigatorio: false, sinonimos: ['cep'] },
    { chave: 'contato_sac', rotulo: 'Contato do SAC', obrigatorio: false, sinonimos: ['contato', 'sac', 'telefone', 'telefone sac', 'contato sac'] },
    { chave: 'email_sac', rotulo: 'E-mail do SAC', obrigatorio: false, sinonimos: ['email', 'e-mail', 'email sac', 'e-mail sac'] },
  ],
  async validar(_db, linhas) {
    const primeiraLinha = new Map<string, number>();
    return linhas.map((linha) => {
      const { dados, erros } = interpretarLinhaFornecedor(linha.valores);
      if (dados) {
        const anterior = primeiraLinha.get(dados.cnpj);
        if (anterior !== undefined) erros.push(`CNPJ ${formatarCnpj(dados.cnpj)} repetido: já aparece na linha ${anterior}`);
        else primeiraLinha.set(dados.cnpj, linha.numeroLinha);
      }
      return { ...linha, erros, avisos: [] };
    });
  },
  async aplicar(db, linhas) {
    return upsertFornecedores(db, linhas.map((l) => dadosOuErro(interpretarLinhaFornecedor(l.valores), l.numeroLinha)));
  },
};
```

`src/modules/importacao/definicoes/produtos.ts`:

```ts
import { formatarCnpj } from '@/modules/catalogo/documentos';
import { idsDosFornecedores } from '@/modules/catalogo/fornecedores';
import { interpretarLinhaProduto, upsertProdutos } from '@/modules/catalogo/produtos';
import { dadosOuErro, type DefinicaoImportacao } from '../definicao';

/** Modelo sugerido da spec §6.8: sku, ean, descricao, cnpj_fornecedor, ncm, custo, unidade. */
export const definicaoProdutos: DefinicaoImportacao = {
  tipo: 'produtos',
  titulo: 'Produtos',
  acao: 'gerir_catalogo',
  voltarPara: '/cadastros/produtos',
  rotuloCriados: 'Produtos novos',
  rotuloAtualizados: 'Produtos atualizados',
  campos: [
    { chave: 'sku', rotulo: 'SKU', obrigatorio: true, sinonimos: ['codigo', 'cod', 'codigo do produto', 'referencia', 'ref'] },
    { chave: 'ean', rotulo: 'EAN (código de barras)', obrigatorio: false, sinonimos: ['ean', 'gtin', 'codigo de barras', 'cod barras', 'ean13'] },
    { chave: 'descricao', rotulo: 'Descrição', obrigatorio: true, sinonimos: ['produto', 'nome do produto', 'nome'] },
    { chave: 'cnpj_fornecedor', rotulo: 'CNPJ do fornecedor', obrigatorio: false, sinonimos: ['cnpj fornecedor', 'fornecedor cnpj', 'cnpj'] },
    { chave: 'ncm', rotulo: 'NCM', obrigatorio: false, sinonimos: ['ncm'] },
    { chave: 'custo', rotulo: 'Custo', obrigatorio: false, sinonimos: ['custo', 'preco de custo', 'valor de custo', 'custo unitario'] },
    { chave: 'unidade', rotulo: 'Unidade', obrigatorio: false, sinonimos: ['un', 'unid', 'unidade de medida'] },
  ],
  async validar(db, linhas) {
    const interpretadas = linhas.map((linha) => ({ linha, ...interpretarLinhaProduto(linha.valores) }));
    const cnpjs = [...new Set(interpretadas.flatMap((i) => (i.dados?.cnpjFornecedor ? [i.dados.cnpjFornecedor] : [])))];
    const existentes = await idsDosFornecedores(db, cnpjs);
    const primeiraLinha = new Map<string, number>();
    return interpretadas.map(({ linha, dados, erros }) => {
      if (dados) {
        if (dados.cnpjFornecedor && !existentes.has(dados.cnpjFornecedor)) {
          erros.push(`Fornecedor não cadastrado (CNPJ ${formatarCnpj(dados.cnpjFornecedor)}). Importe os fornecedores antes.`);
        }
        const anterior = primeiraLinha.get(dados.sku);
        if (anterior !== undefined) erros.push(`SKU repetido: já aparece na linha ${anterior}`);
        else primeiraLinha.set(dados.sku, linha.numeroLinha);
      }
      return { ...linha, erros, avisos: [] };
    });
  },
  async aplicar(db, linhas) {
    return upsertProdutos(db, linhas.map((l) => dadosOuErro(interpretarLinhaProduto(l.valores), l.numeroLinha)));
  },
};
```

`src/modules/importacao/definicoes/index.ts`:

```ts
import type { DefinicaoImportacao } from '../definicao';
import { ehTipoImportacao, type TipoImportacao } from '../tipos';
import { definicaoFornecedores } from './fornecedores';
import { definicaoProdutos } from './produtos';

const DEFINICOES: Partial<Record<TipoImportacao, DefinicaoImportacao>> = {
  produtos: definicaoProdutos,
  fornecedores: definicaoFornecedores,
};

export function obterDefinicao(tipo: string): DefinicaoImportacao | null {
  return ehTipoImportacao(tipo) ? (DEFINICOES[tipo] ?? null) : null;
}
```

- [ ] **Passo 4: Implementar o serviço**

`src/modules/importacao/servico.ts`:

```ts
import { and, eq, lt } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { importacoes, mapeamentosImportacao } from '@/db/schema';
import { ehUuid } from '@/lib/uuid';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import type { DefinicaoImportacao, LinhaPrevia } from './definicao';
import { aplicarMapeamento, camposFaltando, sanitizarMapeamento, sugerirMapeamento } from './mapeamento';
import type { Planilha } from './planilha';
import type { Mapeamento, ResumoImportacao, TipoImportacao } from './tipos';

export const TAMANHO_MAXIMO_BYTES = 5 * 1024 * 1024;
const UM_DIA_MS = 24 * 60 * 60 * 1000;

export class ErroImportacao extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroImportacao';
  }
}

export type Importacao = typeof importacoes.$inferSelect;
export type Previa = { linhas: LinhaPrevia[]; validas: number; comErro: number; faltando: string[] };

/** Guarda a planilha lida até a confirmação. Aproveita para apagar envios abandonados há mais de 1 dia. */
export async function registrarUpload(
  db: DbOuTx,
  entrada: { tipo: TipoImportacao; nomeArquivo: string; planilha: Planilha; usuarioId: string },
  agora: Date = new Date(),
): Promise<string> {
  await db
    .delete(importacoes)
    .where(and(eq(importacoes.situacao, 'PENDENTE'), lt(importacoes.criadaEm, new Date(agora.getTime() - UM_DIA_MS))));
  const [criada] = await db
    .insert(importacoes)
    .values({
      tipo: entrada.tipo,
      nomeArquivo: entrada.nomeArquivo.slice(0, 200),
      cabecalhos: entrada.planilha.cabecalhos,
      linhas: entrada.planilha.linhas,
      criadoPor: entrada.usuarioId,
      criadaEm: agora,
    })
    .returning({ id: importacoes.id });
  return criada.id;
}

export async function obterImportacao(db: DbOuTx, id: string, tipo: TipoImportacao): Promise<Importacao | null> {
  if (!ehUuid(id)) return null;
  const [imp] = await db
    .select()
    .from(importacoes)
    .where(and(eq(importacoes.id, id), eq(importacoes.tipo, tipo)));
  return imp ?? null;
}

export async function mapeamentoSalvo(db: DbOuTx, tipo: TipoImportacao): Promise<Mapeamento | null> {
  const [linha] = await db
    .select({ mapeamento: mapeamentosImportacao.mapeamento })
    .from(mapeamentosImportacao)
    .where(eq(mapeamentosImportacao.tipo, tipo));
  return linha?.mapeamento ?? null;
}

/** O mapeamento escolhido nesta importação; se ainda não houver, a sugestão (que usa o último mapeamento salvo do tipo). */
export async function mapeamentoEfetivo(db: DbOuTx, def: DefinicaoImportacao, imp: Importacao): Promise<Mapeamento> {
  if (imp.mapeamento) return sanitizarMapeamento(def.campos, imp.cabecalhos, imp.mapeamento);
  return sugerirMapeamento(def.campos, imp.cabecalhos, await mapeamentoSalvo(db, def.tipo));
}

export async function definirMapeamento(
  db: DbOuTx,
  def: DefinicaoImportacao,
  imp: Importacao,
  bruto: Record<string, unknown>,
): Promise<Mapeamento> {
  if (imp.situacao !== 'PENDENTE') throw new ErroImportacao('Esta importação já foi concluída.');
  const mapeamento = sanitizarMapeamento(def.campos, imp.cabecalhos, bruto);
  await db.update(importacoes).set({ mapeamento }).where(eq(importacoes.id, imp.id));
  return mapeamento;
}

export async function calcularPrevia(db: DbOuTx, def: DefinicaoImportacao, imp: Importacao, mapeamento: Mapeamento): Promise<Previa> {
  const faltando = camposFaltando(def.campos, mapeamento).map((c) => c.rotulo);
  if (faltando.length > 0) return { linhas: [], validas: 0, comErro: 0, faltando };
  const mapeadas = aplicarMapeamento({ cabecalhos: imp.cabecalhos, linhas: imp.linhas }, def.campos, mapeamento);
  const linhas = await def.validar(db, mapeadas);
  const comErro = linhas.filter((l) => l.erros.length > 0).length;
  return { linhas, validas: linhas.length - comErro, comErro, faltando };
}

/**
 * Confirma com o mapeamento que a prévia mostrou: grava as linhas válidas numa transação,
 * marca a importação como concluída (só uma vez), descarta as linhas brutas e salva o mapeamento do tipo.
 */
export async function confirmarImportacao(
  db: DbOuTx,
  def: DefinicaoImportacao,
  imp: Importacao,
  bruto: Record<string, unknown>,
  usuario: UsuarioSessao,
  agora: Date = new Date(),
): Promise<ResumoImportacao> {
  if (imp.situacao !== 'PENDENTE') throw new ErroImportacao('Esta importação já foi concluída.');
  const mapeamento = sanitizarMapeamento(def.campos, imp.cabecalhos, bruto);
  const previa = await calcularPrevia(db, def, imp, mapeamento);
  if (previa.faltando.length > 0) throw new ErroImportacao(`Escolha a coluna de: ${previa.faltando.join(', ')}.`);
  if (previa.validas === 0) throw new ErroImportacao('Nenhuma linha está pronta para importar. Corrija a planilha e envie de novo.');
  const validas = previa.linhas.filter((l) => l.erros.length === 0);
  const linhasComErro = previa.linhas.filter((l) => l.erros.length > 0).map((l) => l.numeroLinha);

  return db.transaction(async (tx) => {
    const [travada] = await tx
      .update(importacoes)
      .set({ situacao: 'CONCLUIDA', concluidaEm: agora })
      .where(and(eq(importacoes.id, imp.id), eq(importacoes.situacao, 'PENDENTE')))
      .returning({ id: importacoes.id });
    if (!travada) throw new ErroImportacao('Esta importação já foi concluída.');
    const { criados, atualizados } = await def.aplicar(tx, validas, usuario);
    const resumo: ResumoImportacao = { criados, atualizados, ignorados: previa.comErro, linhasComErro: linhasComErro.slice(0, 200) };
    await tx.update(importacoes).set({ resumo, mapeamento, linhas: [] }).where(eq(importacoes.id, imp.id));
    await tx
      .insert(mapeamentosImportacao)
      .values({ tipo: def.tipo, mapeamento, atualizadoPor: usuario.id, atualizadoEm: agora })
      .onConflictDoUpdate({
        target: mapeamentosImportacao.tipo,
        set: { mapeamento, atualizadoPor: usuario.id, atualizadoEm: agora },
      });
    return resumo;
  });
}
```

- [ ] **Passo 5: Rodar e confirmar que passa**

Rode: `npm run test:int && npm run typecheck && npm run lint`
Esperado: tudo PASS.

- [ ] **Passo 6: Commit**

```bash
cd "/c/Users/idmpc/Dvoluções Markt"
git add -A
git commit -m "feat: importação de planilha com mapeamento salvo, prévia e confirmação" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 5: Telas de Produtos e Fornecedores (cartões e formulários de uma coluna)

**Arquivos:**
- Criar: `src/components/estilos.ts`, `src/components/CampoTexto.tsx`, `src/components/ListaErros.tsx`, `src/components/RodapeFormulario.tsx`, `src/components/Paginacao.tsx`, `src/components/useEnvioFormulario.ts`
- Criar: `src/lib/parametros.ts`, `src/lib/formatar.ts`
- Modificar (substituir o conteúdo): `src/app/(app)/cadastros/page.tsx`
- Criar: `src/app/(app)/cadastros/SubnavCadastros.tsx`
- Criar: `src/app/(app)/cadastros/produtos/page.tsx`, `.../produtos/novo/page.tsx`, `.../produtos/[id]/page.tsx`, `.../produtos/FormularioProduto.tsx`, `.../produtos/acoes.ts`
- Criar: `src/app/(app)/cadastros/fornecedores/page.tsx`, `.../fornecedores/novo/page.tsx`, `.../fornecedores/[id]/page.tsx`, `.../fornecedores/FormularioFornecedor.tsx`, `.../fornecedores/acoes.ts`
- Modificar: `tests/e2e/global-setup.ts` (rotas de aquecimento)
- Testes: `src/lib/parametros.test.ts`, `src/lib/formatar.test.ts`, `src/components/Paginacao.test.tsx`, `tests/e2e/permissoes.spec.ts`, `tests/e2e/cadastros.spec.ts`

**Interfaces:**
- Consome: `listarProdutos`, `obterProduto`, `salvarProduto`, `interpretarLinhaProduto`, `POR_PAGINA_PRODUTOS`, `listarFornecedores`, `obterFornecedor`, `salvarFornecedor`, `interpretarLinhaFornecedor`, `opcoesFornecedores`, `POR_PAGINA_FORNECEDORES`, `formatarCnpj`, `UFS`, `ErroCadastro` (Tarefa 2); `exigirPermissao`, `obterDb` (Fase 0); `entrar`, `ehCelular`, `semRolagemLateral` (Tarefa 1)
- Produz:
  - em `estilos.ts`: `CAMPO`, `ROTULO`, `BOTAO_PRIMARIO`, `BOTAO_SECUNDARIO`, `LINK_VOLTAR`, `CARTAO`, `ITEM_LISTA`, `ALERTA_ERRO`, `ALERTA_OK`, `ALERTA_ATENCAO`, `VAZIO`
  - `CampoTexto({ nome, rotulo, id?, valorInicial?, obrigatorio?, mono?, tipo?, modoTeclado?, maiusculas?, maximo?, autoComplete?, dica? })`
  - `ListaErros({ erros: string[] })`, `RodapeFormulario({ children })`
  - `Paginacao({ pagina, total, porPagina, hrefDaPagina: (p: number) => string })`
  - `useEnvioFormulario<E>(acao: (anterior: E, dados: FormData) => Promise<E>, inicial: E): readonly [E, (evento: FormEvent<HTMLFormElement>) => void, boolean]`
  - em `parametros.ts`: `type ParametrosBusca = Record<string, string | string[] | undefined>`, `primeiroValor(valor): string`, `lerPagina(parametros): number`
  - em `formatar.ts`: `formatarDataHora(data: Date)`, `formatarDiaMes(data: Date)`, `formatarDataIso(iso: string)`, `formatarMoeda(valor: string | null)`
  - rotas: `/cadastros` (vai para `/cadastros/produtos`), `/cadastros/produtos`, `/cadastros/produtos/novo`, `/cadastros/produtos/[id]`, e o mesmo para `fornecedores`

- [ ] **Passo 1: Escrever os testes unitários que falham**

`src/lib/parametros.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { lerPagina, primeiroValor } from './parametros';

describe('parâmetros da URL', () => {
  it('primeiroValor pega o primeiro e apara', () => {
    expect(primeiroValor(['a', 'b'])).toBe('a');
    expect(primeiroValor('  x ')).toBe('x');
    expect(primeiroValor(undefined)).toBe('');
  });

  it('lerPagina aceita só inteiros a partir de 1', () => {
    expect(lerPagina({ pagina: '3' })).toBe(3);
    expect(lerPagina({ pagina: '0' })).toBe(1);
    expect(lerPagina({ pagina: 'abc' })).toBe(1);
    expect(lerPagina({})).toBe(1);
  });
});
```

`src/lib/formatar.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatarDataHora, formatarDataIso, formatarDiaMes, formatarMoeda } from './formatar';

describe('formatação', () => {
  it('data e hora no horário de Brasília', () => {
    expect(formatarDataHora(new Date('2026-11-12T17:32:00Z'))).toBe('12/11/2026 14:32');
    expect(formatarDataHora(new Date('2026-11-01T02:00:00Z'))).toBe('31/10/2026 23:00');
    expect(formatarDiaMes(new Date('2026-11-12T17:32:00Z'))).toBe('12/11');
  });

  it('data guardada como texto ISO', () => {
    expect(formatarDataIso('2026-11-05')).toBe('05/11/2026');
  });

  it('moeda em reais', () => {
    expect(formatarMoeda('1234.5')).toBe('R$ 1.234,50');
    expect(formatarMoeda('89.90')).toBe('R$ 89,90');
    expect(formatarMoeda(null)).toBe('—');
  });
});
```

`src/components/Paginacao.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Paginacao } from './Paginacao';

describe('Paginacao', () => {
  it('mostra a página atual e os links de anterior e próxima', () => {
    render(<Paginacao pagina={2} total={120} porPagina={50} hrefDaPagina={(p) => `/lista?pagina=${p}`} />);
    expect(screen.getByText('Página 2 de 3')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Anterior' }).getAttribute('href')).toBe('/lista?pagina=1');
    expect(screen.getByRole('link', { name: 'Próxima' }).getAttribute('href')).toBe('/lista?pagina=3');
  });

  it('não aparece quando cabe numa página só', () => {
    const { container } = render(<Paginacao pagina={1} total={10} porPagina={50} hrefDaPagina={(p) => `/x?pagina=${p}`} />);
    expect(container.innerHTML).toBe('');
  });
});
```

Rode: `npm test`
Esperado: FAIL (os módulos ainda não existem).

- [ ] **Passo 2: Implementar as peças comuns**

`src/lib/parametros.ts`:

```ts
export type ParametrosBusca = Record<string, string | string[] | undefined>;

export function primeiroValor(valor: string | string[] | undefined): string {
  return (Array.isArray(valor) ? valor[0] : valor)?.trim() ?? '';
}

export function lerPagina(parametros: ParametrosBusca): number {
  const n = Number(primeiroValor(parametros.pagina));
  return Number.isInteger(n) && n >= 1 ? n : 1;
}
```

`src/lib/formatar.ts`:

```ts
const FORMATO = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function partes(data: Date): Record<string, string> {
  return Object.fromEntries(FORMATO.formatToParts(data).map((p) => [p.type, p.value]));
}

/** "12/11/2026 14:32", no horário de Brasília. */
export function formatarDataHora(data: Date): string {
  const p = partes(data);
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

/** "12/11", no horário de Brasília. */
export function formatarDiaMes(data: Date): string {
  const p = partes(data);
  return `${p.day}/${p.month}`;
}

/** Coluna date guardada como "2026-11-05" → "05/11/2026". */
export function formatarDataIso(iso: string): string {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

/** "1234.5" (coluna numeric) → "R$ 1.234,50". */
export function formatarMoeda(valor: string | null): string {
  if (valor === null) return '—';
  const [inteiro, centavos] = Number(valor).toFixed(2).split('.');
  return `R$ ${inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${centavos}`;
}
```

`src/components/estilos.ts`:

```ts
/** Classes repetidas nas telas (direção C, spec §6.0). Toque mínimo de 44 px (min-h-11). */
export const CAMPO = 'h-11 w-full rounded-lg border border-borda-forte bg-superficie px-3 text-[15px]';
export const ROTULO = 'text-[13px] font-semibold text-texto-2';
export const BOTAO_PRIMARIO =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-destaque px-5 text-[15px] font-semibold text-white hover:bg-destaque-escuro disabled:opacity-60';
export const BOTAO_SECUNDARIO =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-borda-forte bg-superficie px-5 text-[15px] font-semibold text-texto hover:bg-fundo disabled:opacity-60';
export const LINK_VOLTAR = 'inline-flex min-h-11 items-center text-sm font-semibold text-destaque';
export const CARTAO = 'rounded-xl border border-borda bg-superficie p-4';
/** Cartão de uma lista: o cartão inteiro é o link (alvo de toque grande). */
export const ITEM_LISTA = 'flex min-h-11 flex-col gap-1 rounded-xl border border-borda bg-superficie p-3 hover:border-destaque';
export const VAZIO = 'rounded-lg border border-dashed border-borda-forte px-3 py-6 text-center text-sm text-texto-2';
export const ALERTA_ERRO = 'rounded-lg bg-erro-suave px-3 py-2 text-sm font-medium text-erro';
export const ALERTA_OK = 'rounded-lg bg-bom-suave px-3 py-2 text-sm font-medium text-bom';
export const ALERTA_ATENCAO = 'rounded-lg bg-atencao-suave px-3 py-2 text-sm font-medium text-atencao';
```

`src/components/CampoTexto.tsx`:

```tsx
import { CAMPO, ROTULO } from './estilos';

type Props = {
  nome: string;
  rotulo: string;
  id?: string;
  valorInicial?: string;
  obrigatorio?: boolean;
  /** Códigos (SKU, EAN, pedido, rastreio): fonte mono e sem corretor. */
  mono?: boolean;
  tipo?: 'text' | 'email' | 'password' | 'date' | 'number';
  modoTeclado?: 'text' | 'numeric' | 'decimal' | 'email';
  /** Teclado do celular já em maiúsculas. */
  maiusculas?: boolean;
  maximo?: number;
  autoComplete?: string;
  dica?: string;
};

/** Rótulo em cima e campo na largura toda: uma coluna no celular. */
export function CampoTexto({
  nome,
  rotulo,
  id = nome,
  valorInicial = '',
  obrigatorio = false,
  mono = false,
  tipo = 'text',
  modoTeclado,
  maiusculas = false,
  maximo,
  autoComplete = 'off',
  dica,
}: Props) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={ROTULO}>
        {rotulo}
      </label>
      <input
        id={id}
        name={nome}
        type={tipo}
        defaultValue={valorInicial}
        required={obrigatorio}
        inputMode={modoTeclado}
        autoCapitalize={maiusculas ? 'characters' : undefined}
        spellCheck={mono ? false : undefined}
        maxLength={maximo}
        autoComplete={autoComplete}
        aria-describedby={dica ? `${id}-dica` : undefined}
        className={`${CAMPO}${mono ? ' font-mono' : ''}`}
      />
      {dica && (
        <p id={`${id}-dica`} className="text-xs text-texto-2">
          {dica}
        </p>
      )}
    </div>
  );
}
```

`src/components/ListaErros.tsx`:

```tsx
import { ALERTA_ERRO } from './estilos';

export function ListaErros({ erros }: { erros: string[] }) {
  if (erros.length === 0) return null;
  return (
    <div role="alert" className={ALERTA_ERRO}>
      {erros.length === 1 ? (
        <p>{erros[0]}</p>
      ) : (
        <ul className="list-disc pl-5">
          {erros.map((erro) => (
            <li key={erro}>{erro}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

`src/components/RodapeFormulario.tsx`:

```tsx
import type { ReactNode } from 'react';

/**
 * Botões do formulário. No celular ficam presos logo acima da barra de abas, sempre ao alcance do polegar.
 * Use dentro de um CARTAO (p-4): o -mx-4 estica o rodapé até as bordas do cartão.
 */
export function RodapeFormulario({ children }: { children: ReactNode }) {
  return (
    <div className="acima-barra sticky z-20 -mx-4 flex flex-col gap-2 border-t border-borda bg-superficie/95 px-4 py-3 md:static md:mx-0 md:flex-row md:border-0 md:bg-transparent md:p-0">
      {children}
    </div>
  );
}
```

`src/components/Paginacao.tsx`:

```tsx
import Link from 'next/link';
import { BOTAO_SECUNDARIO } from './estilos';

type Props = { pagina: number; total: number; porPagina: number; hrefDaPagina: (pagina: number) => string };

export function Paginacao({ pagina, total, porPagina, hrefDaPagina }: Props) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  if (paginas <= 1) return null;
  return (
    <nav aria-label="Páginas" className="flex items-center justify-between gap-3 text-sm">
      {pagina > 1 ? (
        <Link href={hrefDaPagina(pagina - 1)} className={BOTAO_SECUNDARIO}>
          Anterior
        </Link>
      ) : (
        <span />
      )}
      <span className="text-texto-2">
        Página {pagina} de {paginas}
      </span>
      {pagina < paginas ? (
        <Link href={hrefDaPagina(pagina + 1)} className={BOTAO_SECUNDARIO}>
          Próxima
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
```

`src/components/useEnvioFormulario.ts`:

```ts
'use client';

import { startTransition, useActionState, type FormEvent } from 'react';

/**
 * Envia o formulário para uma Server Action sem limpar os campos. O `<form action>` do React 19 limpa
 * o formulário depois de cada envio, e o usuário perderia o que digitou quando a ação devolve um erro.
 */
export function useEnvioFormulario<E>(acao: (anterior: E, dados: FormData) => Promise<E>, inicial: E) {
  const [estado, despachar, pendente] = useActionState(acao, inicial);
  function aoEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    startTransition(() => despachar(dados));
  }
  return [estado, aoEnviar, pendente] as const;
}
```

Rode: `npm test`
Esperado: PASS.

- [ ] **Passo 3: Telas de produtos**

`src/app/(app)/cadastros/page.tsx` (substitui todo o conteúdo):

```tsx
import { redirect } from 'next/navigation';
import { exigirPermissao } from '@/modules/auth/servidor';

export default async function PaginaCadastros() {
  await exigirPermissao('gerir_catalogo');
  redirect('/cadastros/produtos');
}
```

`src/app/(app)/cadastros/SubnavCadastros.tsx`:

```tsx
import Link from 'next/link';

const ITENS = [
  { chave: 'produtos', rotulo: 'Produtos', href: '/cadastros/produtos' },
  { chave: 'fornecedores', rotulo: 'Fornecedores', href: '/cadastros/fornecedores' },
] as const;

/** Alternância Produtos | Fornecedores: duas metades iguais no celular. */
export function SubnavCadastros({ atual }: { atual: 'produtos' | 'fornecedores' }) {
  return (
    <nav aria-label="Cadastros" className="grid grid-cols-2 gap-1 rounded-full bg-coluna p-1 md:max-w-sm">
      {ITENS.map((item) => {
        const ativo = item.chave === atual;
        return (
          <Link
            key={item.chave}
            href={item.href}
            aria-current={ativo ? 'page' : undefined}
            className={`flex min-h-11 items-center justify-center rounded-full px-4 text-sm ${
              ativo ? 'bg-superficie font-semibold text-destaque' : 'font-medium text-texto-2'
            }`}
          >
            {item.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
```

`src/app/(app)/cadastros/produtos/acoes.ts`:

```ts
'use server';

import { redirect } from 'next/navigation';
import { obterDb } from '@/db';
import { exigirPermissao } from '@/modules/auth/servidor';
import { ErroCadastro } from '@/modules/catalogo/erros';
import { interpretarLinhaProduto, salvarProduto } from '@/modules/catalogo/produtos';

export type EstadoFormulario = { erros: string[] };

const CAMPOS = ['sku', 'ean', 'descricao', 'cnpj_fornecedor', 'ncm', 'custo', 'unidade'];

export async function salvarProdutoAcao(id: string | null, _anterior: EstadoFormulario, dados: FormData): Promise<EstadoFormulario> {
  await exigirPermissao('gerir_catalogo');
  const valores = Object.fromEntries(CAMPOS.map((c) => [c, String(dados.get(c) ?? '')]));
  const { dados: produto, erros } = interpretarLinhaProduto(valores);
  if (!produto) return { erros };
  try {
    await salvarProduto(obterDb(), produto, id ?? undefined);
  } catch (erro) {
    if (erro instanceof ErroCadastro) return { erros: [erro.message] };
    throw erro;
  }
  redirect(`/cadastros/produtos?salvo=${encodeURIComponent(produto.sku)}`);
}
```

`src/app/(app)/cadastros/produtos/FormularioProduto.tsx`:

```tsx
'use client';

import { CampoTexto } from '@/components/CampoTexto';
import { ListaErros } from '@/components/ListaErros';
import { RodapeFormulario } from '@/components/RodapeFormulario';
import { BOTAO_PRIMARIO, CAMPO, CARTAO, ROTULO } from '@/components/estilos';
import { useEnvioFormulario } from '@/components/useEnvioFormulario';
import type { EstadoFormulario } from './acoes';

export type ValoresProduto = {
  sku: string;
  ean: string;
  descricao: string;
  cnpjFornecedor: string;
  ncm: string;
  custo: string;
  unidade: string;
};

type Props = {
  acao: (anterior: EstadoFormulario, dados: FormData) => Promise<EstadoFormulario>;
  valores: ValoresProduto;
  fornecedores: { cnpj: string; razaoSocial: string }[];
};

export function FormularioProduto({ acao, valores, fornecedores }: Props) {
  const [estado, aoEnviar, pendente] = useEnvioFormulario(acao, { erros: [] });
  return (
    <form onSubmit={aoEnviar} className={`${CARTAO} flex flex-col gap-4`}>
      <CampoTexto nome="sku" rotulo="SKU (obrigatório)" valorInicial={valores.sku} obrigatorio mono maiusculas maximo={60} />
      <CampoTexto nome="descricao" rotulo="Descrição (obrigatório)" valorInicial={valores.descricao} obrigatorio maximo={200} />
      <CampoTexto nome="ean" rotulo="EAN (código de barras)" valorInicial={valores.ean} mono modoTeclado="numeric" maximo={20} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="cnpj_fornecedor" className={ROTULO}>
          Fornecedor
        </label>
        <select id="cnpj_fornecedor" name="cnpj_fornecedor" defaultValue={valores.cnpjFornecedor} className={CAMPO}>
          <option value="">Sem fornecedor</option>
          {fornecedores.map((f) => (
            <option key={f.cnpj} value={f.cnpj}>
              {f.razaoSocial}
            </option>
          ))}
        </select>
      </div>
      <CampoTexto nome="ncm" rotulo="NCM" valorInicial={valores.ncm} mono modoTeclado="numeric" maximo={10} />
      <CampoTexto nome="custo" rotulo="Custo (R$)" valorInicial={valores.custo} modoTeclado="decimal" maximo={20} />
      <CampoTexto nome="unidade" rotulo="Unidade" valorInicial={valores.unidade} maiusculas maximo={6} />
      <ListaErros erros={estado.erros} />
      <RodapeFormulario>
        <button type="submit" disabled={pendente} className={BOTAO_PRIMARIO}>
          {pendente ? 'Salvando…' : 'Salvar'}
        </button>
      </RodapeFormulario>
    </form>
  );
}
```

`src/app/(app)/cadastros/produtos/page.tsx`:

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { CampoTexto } from '@/components/CampoTexto';
import { Paginacao } from '@/components/Paginacao';
import { ALERTA_OK, BOTAO_PRIMARIO, BOTAO_SECUNDARIO, ITEM_LISTA, VAZIO } from '@/components/estilos';
import { obterDb } from '@/db';
import { formatarMoeda } from '@/lib/formatar';
import { lerPagina, primeiroValor, type ParametrosBusca } from '@/lib/parametros';
import { exigirPermissao } from '@/modules/auth/servidor';
import { listarProdutos, POR_PAGINA_PRODUTOS } from '@/modules/catalogo/produtos';
import { SubnavCadastros } from '../SubnavCadastros';

export const metadata: Metadata = { title: 'Produtos · Gestão de Devoluções' };

export default async function PaginaProdutos({ searchParams }: { searchParams: Promise<ParametrosBusca> }) {
  await exigirPermissao('gerir_catalogo');
  const parametros = await searchParams;
  const busca = primeiroValor(parametros.busca);
  const pagina = lerPagina(parametros);
  const salvo = primeiroValor(parametros.salvo);
  const { linhas, total } = await listarProdutos(obterDb(), { busca, pagina });
  const hrefDaPagina = (p: number) =>
    `/cadastros/produtos?${new URLSearchParams({ ...(busca ? { busca } : {}), pagina: String(p) })}`;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Produtos e Fornecedores</h1>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
          <Link href="/importacoes/produtos" className={BOTAO_SECUNDARIO}>
            Importar planilha
          </Link>
          <Link href="/cadastros/produtos/novo" className={BOTAO_PRIMARIO}>
            Novo produto
          </Link>
        </div>
      </div>
      <SubnavCadastros atual="produtos" />
      {salvo && (
        <p role="status" className={ALERTA_OK}>
          Produto {salvo} salvo.
        </p>
      )}
      <form method="get" role="search" aria-label="Buscar produtos" className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <CampoTexto nome="busca" rotulo="Buscar por SKU, EAN ou descrição" valorInicial={busca} />
        </div>
        <button type="submit" className={BOTAO_SECUNDARIO}>
          Buscar
        </button>
      </form>
      <p className="text-sm text-texto-2">
        {total} {total === 1 ? 'produto' : 'produtos'}
      </p>
      {linhas.length === 0 ? (
        <p className={VAZIO}>Nenhum produto encontrado.</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {linhas.map((p) => (
            <li key={p.id}>
              <Link href={`/cadastros/produtos/${p.id}`} className={ITEM_LISTA}>
                <span className="flex items-baseline justify-between gap-2">
                  <span className="break-all font-mono text-[13px] font-semibold">
                    <span className="sr-only">Editar </span>
                    {p.sku}
                  </span>
                  <span className="shrink-0 text-sm font-semibold">{formatarMoeda(p.custo)}</span>
                </span>
                <span className="text-[15px]">{p.descricao}</span>
                <span className="text-xs text-texto-2">
                  {p.fornecedor ?? 'Sem fornecedor'}
                  {p.ean ? <span className="font-mono"> · EAN {p.ean}</span> : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Paginacao pagina={pagina} total={total} porPagina={POR_PAGINA_PRODUTOS} hrefDaPagina={hrefDaPagina} />
    </div>
  );
}
```

`src/app/(app)/cadastros/produtos/novo/page.tsx`:

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { LINK_VOLTAR } from '@/components/estilos';
import { obterDb } from '@/db';
import { exigirPermissao } from '@/modules/auth/servidor';
import { opcoesFornecedores } from '@/modules/catalogo/fornecedores';
import { salvarProdutoAcao } from '../acoes';
import { FormularioProduto } from '../FormularioProduto';

export const metadata: Metadata = { title: 'Novo produto · Gestão de Devoluções' };

export default async function PaginaNovoProduto() {
  await exigirPermissao('gerir_catalogo');
  const fornecedores = await opcoesFornecedores(obterDb());
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-3">
      <Link href="/cadastros/produtos" className={LINK_VOLTAR}>
        ← Produtos
      </Link>
      <h1 className="text-xl font-bold">Novo produto</h1>
      <FormularioProduto
        acao={salvarProdutoAcao.bind(null, null)}
        valores={{ sku: '', ean: '', descricao: '', cnpjFornecedor: '', ncm: '', custo: '', unidade: 'UN' }}
        fornecedores={fornecedores}
      />
    </div>
  );
}
```

`src/app/(app)/cadastros/produtos/[id]/page.tsx`:

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LINK_VOLTAR } from '@/components/estilos';
import { obterDb } from '@/db';
import { exigirPermissao } from '@/modules/auth/servidor';
import { opcoesFornecedores } from '@/modules/catalogo/fornecedores';
import { obterProduto } from '@/modules/catalogo/produtos';
import { salvarProdutoAcao } from '../acoes';
import { FormularioProduto } from '../FormularioProduto';

export const metadata: Metadata = { title: 'Editar produto · Gestão de Devoluções' };

export default async function PaginaEditarProduto({ params }: { params: Promise<{ id: string }> }) {
  await exigirPermissao('gerir_catalogo');
  const { id } = await params;
  const db = obterDb();
  const produto = await obterProduto(db, id);
  if (!produto) notFound();
  const fornecedores = await opcoesFornecedores(db);
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-3">
      <Link href="/cadastros/produtos" className={LINK_VOLTAR}>
        ← Produtos
      </Link>
      <h1 className="text-xl font-bold">
        Editar produto <span className="break-all font-mono">{produto.sku}</span>
      </h1>
      <FormularioProduto
        acao={salvarProdutoAcao.bind(null, produto.id)}
        valores={{
          sku: produto.sku,
          ean: produto.ean ?? '',
          descricao: produto.descricao,
          cnpjFornecedor: produto.cnpjFornecedor ?? '',
          ncm: produto.ncm ?? '',
          custo: produto.custo ? produto.custo.replace('.', ',') : '',
          unidade: produto.unidade ?? '',
        }}
        fornecedores={fornecedores}
      />
    </div>
  );
}
```

- [ ] **Passo 4: Telas de fornecedores**

`src/app/(app)/cadastros/fornecedores/acoes.ts`:

```ts
'use server';

import { redirect } from 'next/navigation';
import { obterDb } from '@/db';
import { exigirPermissao } from '@/modules/auth/servidor';
import { ErroCadastro } from '@/modules/catalogo/erros';
import { interpretarLinhaFornecedor, salvarFornecedor } from '@/modules/catalogo/fornecedores';

export type EstadoFormulario = { erros: string[] };

const CAMPOS = ['razao_social', 'cnpj', 'ie', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf', 'cep', 'contato_sac', 'email_sac'];

export async function salvarFornecedorAcao(id: string | null, _anterior: EstadoFormulario, dados: FormData): Promise<EstadoFormulario> {
  await exigirPermissao('gerir_catalogo');
  const valores = Object.fromEntries(CAMPOS.map((c) => [c, String(dados.get(c) ?? '')]));
  const { dados: fornecedor, erros } = interpretarLinhaFornecedor(valores);
  if (!fornecedor) return { erros };
  try {
    await salvarFornecedor(obterDb(), fornecedor, id ?? undefined);
  } catch (erro) {
    if (erro instanceof ErroCadastro) return { erros: [erro.message] };
    throw erro;
  }
  redirect(`/cadastros/fornecedores?salvo=${encodeURIComponent(fornecedor.razaoSocial)}`);
}
```

`src/app/(app)/cadastros/fornecedores/FormularioFornecedor.tsx`:

```tsx
'use client';

import { CampoTexto } from '@/components/CampoTexto';
import { ListaErros } from '@/components/ListaErros';
import { RodapeFormulario } from '@/components/RodapeFormulario';
import { BOTAO_PRIMARIO, CAMPO, CARTAO, ROTULO } from '@/components/estilos';
import { useEnvioFormulario } from '@/components/useEnvioFormulario';
import { UFS } from '@/modules/catalogo/documentos';
import type { EstadoFormulario } from './acoes';

export type ValoresFornecedor = Record<
  'razao_social' | 'cnpj' | 'ie' | 'logradouro' | 'numero' | 'complemento' | 'bairro' | 'cidade' | 'uf' | 'cep' | 'contato_sac' | 'email_sac',
  string
>;

type Props = { acao: (anterior: EstadoFormulario, dados: FormData) => Promise<EstadoFormulario>; valores: ValoresFornecedor };

export function FormularioFornecedor({ acao, valores }: Props) {
  const [estado, aoEnviar, pendente] = useEnvioFormulario(acao, { erros: [] });
  return (
    <form onSubmit={aoEnviar} className={`${CARTAO} flex flex-col gap-4`}>
      <CampoTexto nome="razao_social" rotulo="Razão social (obrigatório)" valorInicial={valores.razao_social} obrigatorio maximo={200} />
      <CampoTexto nome="cnpj" rotulo="CNPJ (obrigatório)" valorInicial={valores.cnpj} obrigatorio mono maiusculas maximo={18} dica="Aceita o CNPJ novo com letras." />
      <CampoTexto nome="ie" rotulo="Inscrição estadual" valorInicial={valores.ie} mono maiusculas maximo={20} />
      <CampoTexto nome="logradouro" rotulo="Logradouro" valorInicial={valores.logradouro} maximo={200} />
      <div className="grid grid-cols-2 gap-3">
        <CampoTexto nome="numero" rotulo="Número" valorInicial={valores.numero} maximo={20} />
        <CampoTexto nome="complemento" rotulo="Complemento" valorInicial={valores.complemento} maximo={100} />
      </div>
      <CampoTexto nome="bairro" rotulo="Bairro" valorInicial={valores.bairro} maximo={100} />
      <CampoTexto nome="cidade" rotulo="Cidade" valorInicial={valores.cidade} maximo={100} />
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="uf" className={ROTULO}>
            UF
          </label>
          <select id="uf" name="uf" defaultValue={valores.uf} className={CAMPO}>
            <option value="">—</option>
            {UFS.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </select>
        </div>
        <CampoTexto nome="cep" rotulo="CEP" valorInicial={valores.cep} mono modoTeclado="numeric" maximo={9} />
      </div>
      <CampoTexto nome="contato_sac" rotulo="Contato do SAC" valorInicial={valores.contato_sac} maximo={100} />
      <CampoTexto nome="email_sac" rotulo="E-mail do SAC" valorInicial={valores.email_sac} tipo="email" modoTeclado="email" maximo={200} />
      <ListaErros erros={estado.erros} />
      <RodapeFormulario>
        <button type="submit" disabled={pendente} className={BOTAO_PRIMARIO}>
          {pendente ? 'Salvando…' : 'Salvar'}
        </button>
      </RodapeFormulario>
    </form>
  );
}
```

`src/app/(app)/cadastros/fornecedores/page.tsx`:

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { CampoTexto } from '@/components/CampoTexto';
import { Paginacao } from '@/components/Paginacao';
import { ALERTA_OK, BOTAO_PRIMARIO, BOTAO_SECUNDARIO, ITEM_LISTA, VAZIO } from '@/components/estilos';
import { obterDb } from '@/db';
import { lerPagina, primeiroValor, type ParametrosBusca } from '@/lib/parametros';
import { exigirPermissao } from '@/modules/auth/servidor';
import { formatarCnpj } from '@/modules/catalogo/documentos';
import { listarFornecedores, POR_PAGINA_FORNECEDORES } from '@/modules/catalogo/fornecedores';
import { SubnavCadastros } from '../SubnavCadastros';

export const metadata: Metadata = { title: 'Fornecedores · Gestão de Devoluções' };

export default async function PaginaFornecedores({ searchParams }: { searchParams: Promise<ParametrosBusca> }) {
  await exigirPermissao('gerir_catalogo');
  const parametros = await searchParams;
  const busca = primeiroValor(parametros.busca);
  const pagina = lerPagina(parametros);
  const salvo = primeiroValor(parametros.salvo);
  const { linhas, total } = await listarFornecedores(obterDb(), { busca, pagina });
  const hrefDaPagina = (p: number) =>
    `/cadastros/fornecedores?${new URLSearchParams({ ...(busca ? { busca } : {}), pagina: String(p) })}`;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Produtos e Fornecedores</h1>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
          <Link href="/importacoes/fornecedores" className={BOTAO_SECUNDARIO}>
            Importar planilha
          </Link>
          <Link href="/cadastros/fornecedores/novo" className={BOTAO_PRIMARIO}>
            Novo fornecedor
          </Link>
        </div>
      </div>
      <SubnavCadastros atual="fornecedores" />
      {salvo && (
        <p role="status" className={ALERTA_OK}>
          Fornecedor {salvo} salvo.
        </p>
      )}
      <form method="get" role="search" aria-label="Buscar fornecedores" className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <CampoTexto nome="busca" rotulo="Buscar por razão social ou CNPJ" valorInicial={busca} />
        </div>
        <button type="submit" className={BOTAO_SECUNDARIO}>
          Buscar
        </button>
      </form>
      <p className="text-sm text-texto-2">
        {total} {total === 1 ? 'fornecedor' : 'fornecedores'}
      </p>
      {linhas.length === 0 ? (
        <p className={VAZIO}>Nenhum fornecedor encontrado.</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {linhas.map((f) => (
            <li key={f.id}>
              <Link href={`/cadastros/fornecedores/${f.id}`} className={ITEM_LISTA}>
                <span className="text-[15px] font-semibold">
                  <span className="sr-only">Editar </span>
                  {f.razaoSocial}
                </span>
                <span className="font-mono text-[13px]">{formatarCnpj(f.cnpj)}</span>
                <span className="text-xs text-texto-2">
                  {[f.cidade, f.uf].filter(Boolean).join(' / ') || 'Endereço não informado'}
                  {f.emailSac ? ` · ${f.emailSac}` : ''}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Paginacao pagina={pagina} total={total} porPagina={POR_PAGINA_FORNECEDORES} hrefDaPagina={hrefDaPagina} />
    </div>
  );
}
```

`src/app/(app)/cadastros/fornecedores/novo/page.tsx`:

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { LINK_VOLTAR } from '@/components/estilos';
import { exigirPermissao } from '@/modules/auth/servidor';
import { salvarFornecedorAcao } from '../acoes';
import { FormularioFornecedor } from '../FormularioFornecedor';

export const metadata: Metadata = { title: 'Novo fornecedor · Gestão de Devoluções' };

const SEM_VALORES = {
  razao_social: '',
  cnpj: '',
  ie: '',
  logradouro: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  uf: '',
  cep: '',
  contato_sac: '',
  email_sac: '',
};

export default async function PaginaNovoFornecedor() {
  await exigirPermissao('gerir_catalogo');
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-3">
      <Link href="/cadastros/fornecedores" className={LINK_VOLTAR}>
        ← Fornecedores
      </Link>
      <h1 className="text-xl font-bold">Novo fornecedor</h1>
      <FormularioFornecedor acao={salvarFornecedorAcao.bind(null, null)} valores={SEM_VALORES} />
    </div>
  );
}
```

`src/app/(app)/cadastros/fornecedores/[id]/page.tsx`:

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LINK_VOLTAR } from '@/components/estilos';
import { obterDb } from '@/db';
import { exigirPermissao } from '@/modules/auth/servidor';
import { formatarCnpj } from '@/modules/catalogo/documentos';
import { obterFornecedor } from '@/modules/catalogo/fornecedores';
import { salvarFornecedorAcao } from '../acoes';
import { FormularioFornecedor } from '../FormularioFornecedor';

export const metadata: Metadata = { title: 'Editar fornecedor · Gestão de Devoluções' };

export default async function PaginaEditarFornecedor({ params }: { params: Promise<{ id: string }> }) {
  await exigirPermissao('gerir_catalogo');
  const { id } = await params;
  const f = await obterFornecedor(obterDb(), id);
  if (!f) notFound();
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-3">
      <Link href="/cadastros/fornecedores" className={LINK_VOLTAR}>
        ← Fornecedores
      </Link>
      <h1 className="text-xl font-bold">Editar fornecedor</h1>
      <FormularioFornecedor
        acao={salvarFornecedorAcao.bind(null, f.id)}
        valores={{
          razao_social: f.razaoSocial,
          cnpj: formatarCnpj(f.cnpj),
          ie: f.ie ?? '',
          logradouro: f.logradouro ?? '',
          numero: f.numero ?? '',
          complemento: f.complemento ?? '',
          bairro: f.bairro ?? '',
          cidade: f.cidade ?? '',
          uf: f.uf ?? '',
          cep: f.cep ?? '',
          contato_sac: f.contatoSac ?? '',
          email_sac: f.emailSac ?? '',
        }}
      />
    </div>
  );
}
```

Rode: `npm run typecheck && npm run lint`
Esperado: sem erros.

- [ ] **Passo 5: Testes ponta a ponta (permissões e cadastro manual, no computador e no celular)**

Em `tests/e2e/global-setup.ts`, acrescente estas linhas na lista `ROTAS_AQUECIMENTO`, logo antes do `];`:

```ts
  '/cadastros/produtos',
  '/cadastros/produtos/novo',
  '/cadastros/fornecedores',
  '/cadastros/fornecedores/novo',
```

`tests/e2e/permissoes.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { entrar } from './apoio';
import { USUARIOS_E2E } from './dados';

test('operador não abre Produtos e Fornecedores (HTTP 404)', async ({ page }) => {
  await entrar(page, USUARIOS_E2E.operador);
  const resposta = await page.goto('/cadastros/produtos');
  expect(resposta?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
});

test('fiscal usa a barra de abas para chegar aos cadastros e não abre Contestações ML (HTTP 404)', async ({ page }) => {
  await entrar(page, USUARIOS_E2E.fiscal);
  const nav = page.getByRole('navigation', { name: 'Seções' });
  await expect(nav.getByRole('link')).toHaveText(['Fluxo', 'Lotes e Remessas', 'Produtos e Fornecedores']);
  await nav.getByRole('link', { name: 'Produtos e Fornecedores' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Produtos e Fornecedores' })).toBeVisible();
  const resposta = await page.goto('/contestacoes');
  expect(resposta?.status()).toBe(404);
});
```

`tests/e2e/cadastros.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { ehCelular, entrar, semRolagemLateral } from './apoio';
import { USUARIOS_E2E } from './dados';

test('fiscal cadastra um fornecedor e um produto pelo formulário', async ({ page }, testInfo) => {
  // Cada projeto (computador e celular) usa um CNPJ válido e um SKU diferentes: o banco é o mesmo.
  const celular = ehCelular(testInfo);
  const cnpj = celular ? '01.122.233/0001-20' : '98.765.432/0001-98';
  const sufixo = celular ? 'C' : 'D';
  const razao = `Fornecedor Manual ${sufixo} Ltda`;

  await entrar(page, USUARIOS_E2E.fiscal);
  await page.goto('/cadastros/fornecedores');
  await semRolagemLateral(page);
  await page.getByRole('link', { name: 'Novo fornecedor' }).click();
  await page.getByLabel('Razão social (obrigatório)').fill(razao);
  await page.getByLabel('CNPJ (obrigatório)').fill(cnpj);
  await page.getByLabel('UF').selectOption('SP');
  await page.getByLabel('E-mail do SAC').fill('sac@manual.com.br');
  await semRolagemLateral(page);
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('status')).toHaveText(`Fornecedor ${razao} salvo.`);

  await page.getByRole('link', { name: 'Produtos', exact: true }).click();
  await page.getByRole('link', { name: 'Novo produto' }).click();
  await page.getByLabel('SKU (obrigatório)').fill(`manual-${sufixo}`);
  await page.getByLabel('Descrição (obrigatório)').fill('Carregador Manual');
  await page.getByLabel('Fornecedor', { exact: true }).selectOption({ label: razao });
  await page.getByLabel('Custo (R$)').fill('19,90');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('status')).toHaveText(`Produto MANUAL-${sufixo} salvo.`);
  const cartao = page.getByRole('link', { name: new RegExp(`MANUAL-${sufixo}`) });
  await expect(cartao).toContainText('R$ 19,90');
  await expect(cartao).toContainText(razao);
  await semRolagemLateral(page);
});

test('um erro no formulário não apaga o que foi digitado', async ({ page }, testInfo) => {
  const sku = `DUP-${ehCelular(testInfo) ? 'C' : 'D'}`;
  await entrar(page, USUARIOS_E2E.fiscal);
  for (const vez of [1, 2]) {
    await page.goto('/cadastros/produtos/novo');
    await page.getByLabel('SKU (obrigatório)').fill(sku);
    await page.getByLabel('Descrição (obrigatório)').fill(`Tentativa ${vez}`);
    await page.getByRole('button', { name: 'Salvar' }).click();
    if (vez === 1) await expect(page.getByRole('status')).toHaveText(`Produto ${sku} salvo.`);
  }
  await expect(page.getByRole('alert').filter({ hasText: 'Já existe' })).toHaveText(`Já existe um produto com o SKU ${sku}`);
  await expect(page.getByLabel('Descrição (obrigatório)')).toHaveValue('Tentativa 2');
});
```

Rode: `npm run test:e2e`
Esperado: PASS em `computador` e `celular`.

- [ ] **Passo 6: Commit**

```bash
cd "/c/Users/idmpc/Dvoluções Markt"
git add -A
git commit -m "feat: telas de produtos e fornecedores em cartões, formulários com rodapé fixo" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 6: Telas da importação (envio, colunas, prévia e confirmação) e limite de 5 MB

**Arquivos:**
- Criar: `src/app/(app)/importacoes/[tipo]/page.tsx`, `src/app/(app)/importacoes/[tipo]/FormularioUpload.tsx`, `src/app/(app)/importacoes/[tipo]/acoes.ts`
- Criar: `src/app/(app)/importacoes/[tipo]/[id]/page.tsx`, `src/app/(app)/importacoes/[tipo]/[id]/FormularioConfirmacao.tsx`, `src/app/(app)/importacoes/[tipo]/[id]/CartoesPrevia.tsx`
- Modificar (substituir o conteúdo): `next.config.ts`
- Modificar: `docker/nginx/devolucoes.conf`, `docs/operacao/deploy-vps.md`, `tests/e2e/global-setup.ts`, `tests/e2e/permissoes.spec.ts`, `tests/e2e/cadastros.spec.ts`

**Interfaces:**
- Consome: `obterDefinicao`, `DefinicaoImportacao`, `LinhaPrevia`, `registrarUpload`, `obterImportacao`, `mapeamentoEfetivo`, `definirMapeamento`, `calcularPrevia`, `confirmarImportacao`, `ErroImportacao`, `TAMANHO_MAXIMO_BYTES` (Tarefa 4); `lerPlanilha`, `ErroPlanilha`, `CampoImportacao`, `Mapeamento` (Tarefa 3); `CampoTexto`, `ListaErros`, estilos (Tarefa 5)
- Produz:
  - rotas `/importacoes/[tipo]` (envio) e `/importacoes/[tipo]/[id]` (colunas, prévia, confirmação ou resumo), para qualquer tipo que tenha definição
  - Server Actions `enviarPlanilhaAcao(tipo, anterior, dados)`, `definirMapeamentoAcao(tipo, id, dados)`, `confirmarImportacaoAcao(tipo, id, anterior, dados)`
  - os selects das colunas têm `name="campo:<chave>"` e o rótulo do campo (ex.: "Unidade", "SKU (obrigatório)")

- [ ] **Passo 1: Aceitar planilhas de até 5 MB**

`next.config.ts` (substitui todo o conteúdo):

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    serverActions: {
      // Planilhas de até 5 MB (spec §6.8) mais a folga do multipart. O nginx da VPS precisa aceitar o mesmo (6m).
      bodySizeLimit: "6mb",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
```

Em `docker/nginx/devolucoes.conf`, troque a linha `    client_max_body_size 1m;` por:

```
    # Planilhas de até 5 MB (Fase 1) mais a folga do envio.
    client_max_body_size 6m;
```

Em `docs/operacao/deploy-vps.md`, acrescente no **final**:

````markdown
## Fase 1: planilhas de até 5 MB
A importação de planilhas envia arquivos de até 5 MB. Na VPS, aumente o limite do nginx uma vez:
```sh
sed -i 's/client_max_body_size 1m;/client_max_body_size 6m;/' /etc/nginx/sites-available/devolucoes
nginx -t && systemctl reload nginx
```
Se `nginx -t` acusar erro, não recarregue e confira o arquivo.
````

- [ ] **Passo 2: Server Actions da importação**

`src/app/(app)/importacoes/[tipo]/acoes.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
import { obterDb } from '@/db';
import { exigirPermissao } from '@/modules/auth/servidor';
import { obterDefinicao } from '@/modules/importacao/definicoes';
import { ErroPlanilha, lerPlanilha } from '@/modules/importacao/planilha';
import {
  confirmarImportacao,
  definirMapeamento,
  ErroImportacao,
  obterImportacao,
  registrarUpload,
  TAMANHO_MAXIMO_BYTES,
} from '@/modules/importacao/servico';

export type EstadoUpload = { erro: string | null };
export type EstadoConfirmacao = { erro: string | null };

function definicaoOu404(tipo: string) {
  const def = obterDefinicao(tipo);
  if (!def) notFound();
  return def;
}

function mapeamentoDoFormulario(chaves: string[], dados: FormData): Record<string, string> {
  return Object.fromEntries(chaves.map((chave) => [chave, String(dados.get(`campo:${chave}`) ?? '')]));
}

export async function enviarPlanilhaAcao(tipo: string, _anterior: EstadoUpload, dados: FormData): Promise<EstadoUpload> {
  const def = definicaoOu404(tipo);
  const usuario = await exigirPermissao(def.acao);
  const arquivo = dados.get('arquivo');
  if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: 'Escolha a planilha.' };
  if (arquivo.size > TAMANHO_MAXIMO_BYTES) return { erro: 'A planilha passa de 5 MB. Divida o arquivo.' };
  let id: string;
  try {
    const planilha = await lerPlanilha(arquivo.name, await arquivo.arrayBuffer());
    id = await registrarUpload(obterDb(), { tipo: def.tipo, nomeArquivo: arquivo.name, planilha, usuarioId: usuario.id });
  } catch (erro) {
    if (erro instanceof ErroPlanilha) return { erro: erro.message };
    throw erro;
  }
  redirect(`/importacoes/${def.tipo}/${id}`);
}

export async function definirMapeamentoAcao(tipo: string, id: string, dados: FormData): Promise<void> {
  const def = definicaoOu404(tipo);
  await exigirPermissao(def.acao);
  const db = obterDb();
  const imp = await obterImportacao(db, id, def.tipo);
  if (!imp) notFound();
  try {
    await definirMapeamento(db, def, imp, mapeamentoDoFormulario(def.campos.map((c) => c.chave), dados));
  } catch (erro) {
    if (!(erro instanceof ErroImportacao)) throw erro;
  }
  revalidatePath(`/importacoes/${def.tipo}/${id}`);
}

export async function confirmarImportacaoAcao(
  tipo: string,
  id: string,
  _anterior: EstadoConfirmacao,
  dados: FormData,
): Promise<EstadoConfirmacao> {
  const def = definicaoOu404(tipo);
  const usuario = await exigirPermissao(def.acao);
  const db = obterDb();
  const imp = await obterImportacao(db, id, def.tipo);
  if (!imp) notFound();
  try {
    await confirmarImportacao(db, def, imp, mapeamentoDoFormulario(def.campos.map((c) => c.chave), dados), usuario);
  } catch (erro) {
    if (erro instanceof ErroImportacao) return { erro: erro.message };
    throw erro;
  }
  revalidatePath(`/importacoes/${def.tipo}/${id}`);
  return { erro: null };
}
```

- [ ] **Passo 3: Tela de envio**

`src/app/(app)/importacoes/[tipo]/FormularioUpload.tsx`:

```tsx
'use client';

import { useActionState } from 'react';
import { ListaErros } from '@/components/ListaErros';
import { BOTAO_PRIMARIO, CARTAO, ROTULO } from '@/components/estilos';
import type { EstadoUpload } from './acoes';

type Props = { acao: (anterior: EstadoUpload, dados: FormData) => Promise<EstadoUpload> };

export function FormularioUpload({ acao }: Props) {
  const [estado, enviar, pendente] = useActionState(acao, { erro: null });
  return (
    <form action={enviar} className={`${CARTAO} flex flex-col gap-4`}>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="arquivo" className={ROTULO}>
          Planilha
        </label>
        <input
          id="arquivo"
          name="arquivo"
          type="file"
          required
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="min-h-11 w-full text-sm file:mr-3 file:min-h-11 file:rounded-full file:border file:border-borda-forte file:bg-superficie file:px-4 file:font-semibold"
        />
      </div>
      <ListaErros erros={estado.erro ? [estado.erro] : []} />
      <button type="submit" disabled={pendente} className={BOTAO_PRIMARIO}>
        {pendente ? 'Lendo a planilha…' : 'Enviar planilha'}
      </button>
    </form>
  );
}
```

`src/app/(app)/importacoes/[tipo]/page.tsx`:

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CARTAO, LINK_VOLTAR } from '@/components/estilos';
import { exigirPermissao } from '@/modules/auth/servidor';
import { obterDefinicao } from '@/modules/importacao/definicoes';
import { enviarPlanilhaAcao } from './acoes';
import { FormularioUpload } from './FormularioUpload';

export const metadata: Metadata = { title: 'Importar planilha · Gestão de Devoluções' };

export default async function PaginaImportar({ params }: { params: Promise<{ tipo: string }> }) {
  const { tipo } = await params;
  const def = obterDefinicao(tipo);
  if (!def) notFound();
  await exigirPermissao(def.acao);
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
      <Link href={def.voltarPara} className={LINK_VOLTAR}>
        ← {def.titulo}
      </Link>
      <h1 className="text-xl font-bold">Importar planilha: {def.titulo}</h1>
      <div className={`${CARTAO} flex flex-col gap-2 text-sm`}>
        <p>
          Envie um arquivo .csv ou .xlsx de até 5 MB. A primeira linha precisa ter os nomes das colunas. No próximo passo você
          diz qual coluna é cada campo; a planilha pode estar do jeito que ela já é.
        </p>
        <p className="text-texto-2">
          Modelo sugerido: <span className="font-mono [overflow-wrap:anywhere]">{def.campos.map((c) => c.chave).join(', ')}</span>
        </p>
      </div>
      <FormularioUpload acao={enviarPlanilhaAcao.bind(null, def.tipo)} />
    </div>
  );
}
```

- [ ] **Passo 4: Tela de colunas, prévia e confirmação**

`src/app/(app)/importacoes/[tipo]/[id]/CartoesPrevia.tsx`:

```tsx
import { Fragment } from 'react';
import type { LinhaPrevia } from '@/modules/importacao/definicao';
import type { CampoImportacao } from '@/modules/importacao/mapeamento';

/** Prévia em cartões (cabe no celular): uma linha da planilha por cartão, com os erros e avisos dela. */
export function CartoesPrevia({ campos, linhas }: { campos: CampoImportacao[]; linhas: LinhaPrevia[] }) {
  return (
    <ol className="grid gap-3 md:grid-cols-2">
      {linhas.map((linha) => {
        const pronta = linha.erros.length === 0;
        return (
          <li
            key={linha.numeroLinha}
            className={`flex flex-col gap-2 rounded-xl border bg-superficie p-3 ${pronta ? 'border-borda' : 'border-erro'}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold">Linha {linha.numeroLinha}</span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${pronta ? 'bg-bom-suave text-bom' : 'bg-erro-suave text-erro'}`}
              >
                {pronta ? 'Pronta' : 'Com erro'}
              </span>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              {campos.map((campo) => (
                <Fragment key={campo.chave}>
                  <dt className="text-texto-2">{campo.rotulo}</dt>
                  <dd className="[overflow-wrap:anywhere]">{linha.valores[campo.chave] || '—'}</dd>
                </Fragment>
              ))}
            </dl>
            {linha.erros.length > 0 && (
              <ul className="list-disc pl-5 text-sm font-medium text-erro">
                {linha.erros.map((erro) => (
                  <li key={erro}>{erro}</li>
                ))}
              </ul>
            )}
            {linha.avisos.length > 0 && (
              <ul className="list-disc pl-5 text-sm text-atencao">
                {linha.avisos.map((aviso) => (
                  <li key={aviso}>{aviso}</li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}
```

`src/app/(app)/importacoes/[tipo]/[id]/FormularioConfirmacao.tsx`:

```tsx
'use client';

import { useActionState } from 'react';
import { ListaErros } from '@/components/ListaErros';
import { RodapeFormulario } from '@/components/RodapeFormulario';
import { BOTAO_PRIMARIO } from '@/components/estilos';
import type { Mapeamento } from '@/modules/importacao/tipos';
import type { EstadoConfirmacao } from '../acoes';

type Props = {
  acao: (anterior: EstadoConfirmacao, dados: FormData) => Promise<EstadoConfirmacao>;
  /** O mesmo mapeamento que gerou a prévia: é ele que vai ser gravado. */
  mapeamento: Mapeamento;
  habilitado: boolean;
};

export function FormularioConfirmacao({ acao, mapeamento, habilitado }: Props) {
  const [estado, enviar, pendente] = useActionState(acao, { erro: null });
  return (
    <form action={enviar} className="flex flex-col gap-3">
      {Object.entries(mapeamento).map(([chave, cabecalho]) => (
        <input key={chave} type="hidden" name={`campo:${chave}`} value={cabecalho ?? ''} />
      ))}
      <ListaErros erros={estado.erro ? [estado.erro] : []} />
      {!habilitado && <p className="text-sm text-texto-2">Ajuste as colunas até haver pelo menos uma linha pronta.</p>}
      <RodapeFormulario>
        <button type="submit" disabled={!habilitado || pendente} className={BOTAO_PRIMARIO}>
          {pendente ? 'Importando…' : 'Confirmar importação'}
        </button>
      </RodapeFormulario>
    </form>
  );
}
```

`src/app/(app)/importacoes/[tipo]/[id]/page.tsx`:

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ALERTA_ATENCAO, BOTAO_PRIMARIO, BOTAO_SECUNDARIO, CAMPO, CARTAO, LINK_VOLTAR, ROTULO } from '@/components/estilos';
import { obterDb } from '@/db';
import { exigirPermissao } from '@/modules/auth/servidor';
import { obterDefinicao } from '@/modules/importacao/definicoes';
import { calcularPrevia, mapeamentoEfetivo, obterImportacao } from '@/modules/importacao/servico';
import { definirMapeamentoAcao, confirmarImportacaoAcao } from '../acoes';
import { CartoesPrevia } from './CartoesPrevia';
import { FormularioConfirmacao } from './FormularioConfirmacao';

export const metadata: Metadata = { title: 'Importar planilha · Gestão de Devoluções' };

const LIMITE_PREVIA = 200;

export default async function PaginaImportacao({ params }: { params: Promise<{ tipo: string; id: string }> }) {
  const { tipo, id } = await params;
  const def = obterDefinicao(tipo);
  if (!def) notFound();
  await exigirPermissao(def.acao);
  const db = obterDb();
  const imp = await obterImportacao(db, id, def.tipo);
  if (!imp) notFound();

  if (imp.situacao === 'CONCLUIDA') {
    const r = imp.resumo;
    const comErro = r?.linhasComErro ?? [];
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
        <h1 className="text-xl font-bold">Importação concluída: {def.titulo}</h1>
        <div role="status" className={`${CARTAO} flex flex-col gap-1 text-[15px]`}>
          <p>
            {def.rotuloCriados}: <strong>{r?.criados ?? 0}</strong>
          </p>
          {def.rotuloAtualizados && (
            <p>
              {def.rotuloAtualizados}: <strong>{r?.atualizados ?? 0}</strong>
            </p>
          )}
          <p>
            Linhas com erro (ignoradas): <strong>{r?.ignorados ?? 0}</strong>
            {comErro.length > 0 ? ` (${comErro.length === 1 ? 'linha' : 'linhas'} ${comErro.join(', ')})` : ''}
          </p>
        </div>
        <div className="grid gap-2 sm:flex">
          <Link href={def.voltarPara} className={BOTAO_PRIMARIO}>
            Voltar para {def.titulo}
          </Link>
          <Link href={`/importacoes/${def.tipo}`} className={BOTAO_SECUNDARIO}>
            Importar outra planilha
          </Link>
        </div>
      </div>
    );
  }

  const mapeamento = await mapeamentoEfetivo(db, def, imp);
  const previa = await calcularPrevia(db, def, imp, mapeamento);
  const exemplo = imp.linhas[0] ?? [];
  const camposMapeados = def.campos.filter((c) => mapeamento[c.chave]);
  // Mobile-first: as linhas com erro aparecem primeiro, para não precisar rolar procurando.
  const linhasOrdenadas = [...previa.linhas.filter((l) => l.erros.length > 0), ...previa.linhas.filter((l) => l.erros.length === 0)];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Link href={def.voltarPara} className={LINK_VOLTAR}>
          ← {def.titulo}
        </Link>
        <h1 className="text-xl font-bold">Importar planilha: {def.titulo}</h1>
        <p className="text-sm text-texto-2 [overflow-wrap:anywhere]">
          Arquivo <span className="font-mono">{imp.nomeArquivo}</span> · {imp.linhas.length} linhas
        </p>
      </div>

      <section aria-labelledby="titulo-colunas" className={`${CARTAO} flex flex-col gap-3`}>
        <h2 id="titulo-colunas" className="text-base font-bold">
          1. Colunas da planilha
        </h2>
        <p className="text-sm text-texto-2">Para cada campo do sistema, escolha a coluna da planilha. O que parece igual já vem sugerido.</p>
        <form action={definirMapeamentoAcao.bind(null, def.tipo, imp.id)} className="flex flex-col gap-3">
          <div className="grid gap-3 md:grid-cols-2">
            {def.campos.map((campo) => (
              <div key={campo.chave} className="flex flex-col gap-1.5">
                <label htmlFor={`campo-${campo.chave}`} className={ROTULO}>
                  {campo.rotulo}
                  {campo.obrigatorio ? ' (obrigatório)' : ''}
                </label>
                <select id={`campo-${campo.chave}`} name={`campo:${campo.chave}`} defaultValue={mapeamento[campo.chave] ?? ''} className={CAMPO}>
                  <option value="">Não importar</option>
                  {imp.cabecalhos.map((cabecalho, i) => (
                    <option key={cabecalho} value={cabecalho}>
                      {cabecalho}
                      {exemplo[i] ? ` (ex.: ${exemplo[i].slice(0, 30)})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <button type="submit" className={BOTAO_SECUNDARIO}>
            Atualizar prévia
          </button>
        </form>
      </section>

      <section aria-labelledby="titulo-previa" className="flex flex-col gap-3">
        <h2 id="titulo-previa" className="text-base font-bold">
          2. Prévia
        </h2>
        {previa.faltando.length > 0 ? (
          <p className={ALERTA_ATENCAO}>Escolha a coluna de: {previa.faltando.join(', ')}.</p>
        ) : (
          <>
            <p className="text-[15px]">
              <strong>{previa.validas}</strong> {previa.validas === 1 ? 'linha pronta' : 'linhas prontas'} para importar ·{' '}
              <strong>{previa.comErro}</strong> com erro (serão ignoradas)
            </p>
            <CartoesPrevia campos={camposMapeados} linhas={linhasOrdenadas.slice(0, LIMITE_PREVIA)} />
            {linhasOrdenadas.length > LIMITE_PREVIA && (
              <p className="text-sm text-texto-2">
                Mostrando {LIMITE_PREVIA} de {linhasOrdenadas.length} linhas. Todas foram verificadas.
              </p>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="titulo-confirmar" className={`${CARTAO} flex flex-col gap-3`}>
        <h2 id="titulo-confirmar" className="text-base font-bold">
          3. Confirmar
        </h2>
        <FormularioConfirmacao
          acao={confirmarImportacaoAcao.bind(null, def.tipo, imp.id)}
          mapeamento={mapeamento}
          habilitado={previa.faltando.length === 0 && previa.validas > 0}
        />
      </section>
    </div>
  );
}
```

Rode: `npm run typecheck && npm run lint`
Esperado: sem erros.

- [ ] **Passo 5: Testes ponta a ponta**

Em `tests/e2e/global-setup.ts`, acrescente na lista `ROTAS_AQUECIMENTO`, logo antes do `];`:

```ts
  '/importacoes/produtos',
  '/importacoes/fornecedores',
```

Acrescente no **final** de `tests/e2e/permissoes.spec.ts`:

```ts
test('operador não abre a importação de produtos (HTTP 404)', async ({ page }) => {
  await entrar(page, USUARIOS_E2E.operador);
  const resposta = await page.goto('/importacoes/produtos');
  expect(resposta?.status()).toBe(404);
});
```

Acrescente no **final** de `tests/e2e/cadastros.spec.ts`:

```ts
const CSV_FORNECEDORES = [
  'Razão Social;CNPJ;UF;E-mail SAC',
  'Fornecedor Alfa Ltda;11.222.333/0001-81;SP;sac@alfa.com.br',
  'Fornecedor Beta SA;12.345.678/0001-95;MG;',
].join('\r\n');

const CSV_PRODUTOS = [
  'Código;GTIN;Nome do produto;CNPJ Fornecedor;Preço de custo;Und',
  'FONE-01;7891000000014;Fone Bluetooth;11222333000181;89,90;UN',
  'CABO-02;7891000000021;Cabo USB-C;12345678000195;12,50;UN',
  'ERRO-03;7891000000099;Produto com EAN errado;;10,00;UN',
].join('\r\n');

test('fiscal importa fornecedores e produtos por planilha, ajustando uma coluna à mão', async ({ page }, testInfo) => {
  test.skip(
    ehCelular(testInfo),
    'A importação do catálogo é feita no computador; no celular a tela de colunas é testada com a planilha de devoluções.',
  );
  await entrar(page, USUARIOS_E2E.fiscal);

  await page.goto('/cadastros/fornecedores');
  await page.getByRole('link', { name: 'Importar planilha' }).click();
  await page.getByLabel('Planilha').setInputFiles({ name: 'fornecedores.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV_FORNECEDORES) });
  await page.getByRole('button', { name: 'Enviar planilha' }).click();
  await expect(page.getByRole('heading', { name: '2. Prévia' })).toBeVisible();
  await expect(page.getByText(/2 linhas prontas/)).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar importação' }).click();
  await expect(page.getByRole('status')).toContainText('Fornecedores novos: 2');

  await page.goto('/importacoes/produtos');
  await page.getByLabel('Planilha').setInputFiles({ name: 'produtos.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV_PRODUTOS) });
  await page.getByRole('button', { name: 'Enviar planilha' }).click();
  await expect(page.getByLabel('SKU (obrigatório)')).toHaveValue('Código');
  await expect(page.getByLabel('Unidade')).toHaveValue('');
  await page.getByLabel('Unidade').selectOption('Und');
  await page.getByRole('button', { name: 'Atualizar prévia' }).click();
  await expect(page.getByLabel('Unidade')).toHaveValue('Und');
  await expect(page.getByText('EAN inválido: 7891000000099')).toBeVisible();
  await expect(page.getByText(/2 linhas prontas/)).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar importação' }).click();
  await expect(page.getByRole('status')).toContainText('Produtos novos: 2');
  await expect(page.getByRole('status')).toContainText('Linhas com erro (ignoradas): 1 (linha 4)');

  await page.goto('/cadastros/produtos?busca=FONE-01');
  await page.getByRole('link', { name: /^Editar FONE-01/ }).click();
  await page.getByLabel('Descrição (obrigatório)').fill('Fone Bluetooth Preto');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('link', { name: /^Editar FONE-01/ })).toContainText('Fone Bluetooth Preto');
});
```

Rode: `npm run test:e2e`
Esperado: PASS (a importação do catálogo aparece como "skipped" no projeto `celular`).

- [ ] **Passo 6: Commit**

```bash
cd "/c/Users/idmpc/Dvoluções Markt"
git add -A
git commit -m "feat: telas de importação com colunas, prévia em cartões e limite de 5 MB" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 7: Devoluções no banco (vocabulário, transições de status e cadastro)

**Arquivos:**
- Criar: `src/modules/devolucoes/dominio.ts`, `src/modules/devolucoes/canais.ts`, `src/modules/devolucoes/rastreio.ts`, `src/modules/devolucoes/erros.ts`, `src/modules/devolucoes/transicoes.ts`, `src/modules/devolucoes/criar.ts`
- Criar: `src/modules/historico/eventos.ts`
- Criar: `src/db/schema/devolucoes.ts`, `src/db/schema/historico.ts`
- Modificar (substituir o conteúdo): `src/db/schema/index.ts`
- Modificar (acrescentar no final): `src/lib/valores.ts`, `src/lib/valores.test.ts`, `tests/helpers/fabricas.ts`
- Gerado: `drizzle/0004_*.sql`
- Testes: `src/modules/devolucoes/dominio.test.ts`, `src/modules/devolucoes/transicoes.test.ts`, `src/modules/devolucoes/criar.test.ts`, `src/modules/devolucoes/criar.int.test.ts`

**Interfaces:**
- Consome: `DbOuTx`, `textoOpcional`, `normalizarTexto`, `normalizarSku`, `idsDosProdutos`, `criarUsuarioTeste`, `criarProdutoTeste` (Tarefa 2); `Perfil`, `ROTULO_PERFIL`, `UsuarioSessao`, `usuarios` (Fase 0)
- Produz:
  - em `dominio.ts` (sem `@/`; o schema importa): `CANAIS`, `type Canal`, `ROTULO_CANAL`, `ehCanal`, `ORIGENS`, `type Origem`, `ROTULO_ORIGEM`, `TIPOS_DEVOLUCAO`, `type TipoDevolucao`, `ROTULO_TIPO`, `STATUS_DEVOLUCAO`, `type StatusDevolucao`, `ROTULO_STATUS`, `ehStatus`, `rotuloStatus(texto): string`, `STATUS_ITEM`, `type StatusItem`, `ROTULO_STATUS_ITEM`, `ETAPA_DO_STATUS`, `statusDaEtapa(numero): StatusDevolucao[]`, `LIMITE_QUANTIDADE = 50` (unidades por item; o formulário do celular também usa)
  - `interpretarCanal(texto): Canal | null`, `normalizarRastreio(texto): string`
  - `class ErroDevolucao extends Error`, `class ErroDevolucaoDuplicada extends ErroDevolucao` (campo `codigo`)
  - em `transicoes.ts`: `type Ator = Perfil | 'SISTEMA'`, `type PedidoTransicao = { de: StatusDevolucao | null; para: StatusDevolucao; ator: Ator; naoIdentificada?: boolean }`, `REGRAS_TRANSICAO`, `podeTransitar(p): boolean`, `class ErroTransicao extends ErroDevolucao`, `exigirTransicao(p): void`
  - em `criar.ts`: `type ItemPedido`, `type EntradaNovaDevolucao`, `type DadosNovaDevolucao`, `type DevolucaoCriada = { id: string; codigo: string; unidades: number }`, `validarNovaDevolucao(e, { exigirItens? }): { dados: DadosNovaDevolucao | null; erros: string[] }`, `expandirUnidades(itens): string[]`, `itensDoFormulario(dados: FormData): { sku: string; quantidade: string }[]`, `chavePedido(canal, pedido): string`, `codigosAtivosPorPedido(db, pares): Promise<Map<string, string>>`, `criarDevolucao(db, dados, { origem: 'MANUAL' | 'PLANILHA'; usuario }): Promise<DevolucaoCriada>`
  - em `historico/eventos.ts`: `type NovoEvento`, `registrarEvento(db, evento)`, `type EventoListado`, `listarEventos(db, entidade, entidadeId)`, `ROTULO_ACAO`, `rotuloDaAcao(acao)`
  - em `valores.ts`: `interpretarInteiro(texto): number | null`, `interpretarData(texto): string | null`
  - tabelas `devolucoes` (com `codigo` DEV-000123 gerado da sequência `numero`), `itens_devolucao` (uma linha por unidade física), `eventos_historico`
  - fábrica `criarDevolucaoTeste(db, usuario, dados?): Promise<DevolucaoCriada>`

- [ ] **Passo 1: Escrever os testes unitários que falham**

`src/modules/devolucoes/dominio.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { interpretarCanal } from './canais';
import { ehCanal, rotuloStatus, statusDaEtapa } from './dominio';
import { normalizarRastreio } from './rastreio';

describe('vocabulário das devoluções', () => {
  it('cada etapa do PDF tem os seus status; a etapa 5 (lotes) não tem devolução', () => {
    expect(statusDaEtapa(1)).toEqual(['PENDENTE_CHEGADA']);
    expect(statusDaEtapa(2)).toEqual(['AGUARDANDO_CONFERENCIA']);
    expect(statusDaEtapa(3)).toEqual(['EM_CONFERENCIA']);
    expect(statusDaEtapa(4)).toEqual(['AGUARDANDO_NF']);
    expect(statusDaEtapa(5)).toEqual([]);
  });

  it('rótulos e verificações', () => {
    expect(rotuloStatus('AGUARDANDO_CONFERENCIA')).toBe('Aguardando conferência');
    expect(rotuloStatus('OUTRO')).toBe('OUTRO');
    expect(ehCanal('SHEIN')).toBe(true);
    expect(ehCanal('shein')).toBe(false);
  });
});

describe('interpretarCanal', () => {
  it.each([
    ['MERCADO_LIVRE', 'MERCADO_LIVRE'],
    ['Mercado Livre', 'MERCADO_LIVRE'],
    ['ML', 'MERCADO_LIVRE'],
    ['Amazon', 'AMAZON'],
    ['shopee', 'SHOPEE'],
    ['Magazine Luiza', 'MAGALU'],
    ['Tik Tok Shop', 'TIKTOK_SHOP'],
    ['TikTok', 'TIKTOK_SHOP'],
    ['SHEIN', 'SHEIN'],
  ])('%s → %s', (texto, canal) => {
    expect(interpretarCanal(texto)).toBe(canal);
  });

  it('recusa o que não conhece', () => {
    expect(interpretarCanal('Loja X')).toBeNull();
    expect(interpretarCanal('  ')).toBeNull();
  });
});

describe('normalizarRastreio', () => {
  it('tira espaços e põe em maiúsculas', () => {
    expect(normalizarRastreio(' br 123 456 789 br ')).toBe('BR123456789BR');
  });
});
```

`src/modules/devolucoes/transicoes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { STATUS_DEVOLUCAO, type StatusDevolucao } from './dominio';
import { ErroTransicao, exigirTransicao, podeTransitar, type Ator } from './transicoes';

const ATORES: Ator[] = ['SISTEMA', 'OPERADOR', 'FISCAL', 'GESTOR'];

// Spec §5.2, escrita aqui de novo de propósito: o teste não lê a tabela do código.
// Onde a spec diz "Operador", o Gestor também pode (spec §6.9).
const PERMITIDAS: [StatusDevolucao | null, StatusDevolucao, Ator[], boolean][] = [
  [null, 'PENDENTE_CHEGADA', ['SISTEMA', 'OPERADOR', 'GESTOR'], false],
  ['PENDENTE_CHEGADA', 'AGUARDANDO_CONFERENCIA', ['OPERADOR', 'GESTOR'], false],
  [null, 'AGUARDANDO_CONFERENCIA', ['OPERADOR', 'GESTOR'], true],
  ['AGUARDANDO_CONFERENCIA', 'EM_CONFERENCIA', ['OPERADOR', 'GESTOR'], false],
  ['EM_CONFERENCIA', 'AGUARDANDO_CONFERENCIA', ['OPERADOR', 'GESTOR'], false],
  ['EM_CONFERENCIA', 'AGUARDANDO_NF', ['OPERADOR', 'GESTOR'], false],
  ['AGUARDANDO_NF', 'CONCLUIDA', ['SISTEMA'], false],
  ['CONCLUIDA', 'AGUARDANDO_NF', ['SISTEMA'], false],
  ['PENDENTE_CHEGADA', 'CANCELADA', ['SISTEMA', 'GESTOR'], false],
  ['PENDENTE_CHEGADA', 'EXTRAVIADA', ['SISTEMA', 'GESTOR'], false],
  ['PENDENTE_CHEGADA', 'NO_CD_MARKETPLACE', ['SISTEMA'], false],
  ['NO_CD_MARKETPLACE', 'PENDENTE_CHEGADA', ['SISTEMA'], false],
];

function esperado(de: StatusDevolucao | null, para: StatusDevolucao, ator: Ator, naoIdentificada: boolean): boolean {
  return PERMITIDAS.some(([d, p, atores, so]) => d === de && p === para && atores.includes(ator) && (!so || naoIdentificada));
}

describe('podeTransitar (spec §5.2)', () => {
  it.each(PERMITIDAS)('%s → %s é permitida para %j', (de, para, atores, soNaoIdentificada) => {
    for (const ator of atores) {
      expect(podeTransitar({ de, para, ator, naoIdentificada: soNaoIdentificada })).toBe(true);
    }
  });

  it('recusa toda combinação fora da tabela (de, para, quem e "não identificada")', () => {
    for (const de of [null, ...STATUS_DEVOLUCAO]) {
      for (const para of STATUS_DEVOLUCAO) {
        for (const ator of ATORES) {
          for (const naoIdentificada of [false, true]) {
            expect(podeTransitar({ de, para, ator, naoIdentificada }), `${de} → ${para} por ${ator} (não identificada: ${naoIdentificada})`).toBe(
              esperado(de, para, ator, naoIdentificada),
            );
          }
        }
      }
    }
  });

  it('a devolução nova só nasce em "Aguardando conferência" quando é não identificada', () => {
    expect(podeTransitar({ de: null, para: 'AGUARDANDO_CONFERENCIA', ator: 'OPERADOR' })).toBe(false);
    expect(podeTransitar({ de: null, para: 'AGUARDANDO_CONFERENCIA', ator: 'OPERADOR', naoIdentificada: true })).toBe(true);
  });

  it('o Fiscal não recebe, não cria e não cancela', () => {
    expect(podeTransitar({ de: 'PENDENTE_CHEGADA', para: 'AGUARDANDO_CONFERENCIA', ator: 'FISCAL' })).toBe(false);
    expect(podeTransitar({ de: null, para: 'PENDENTE_CHEGADA', ator: 'FISCAL' })).toBe(false);
    expect(podeTransitar({ de: 'PENDENTE_CHEGADA', para: 'CANCELADA', ator: 'FISCAL' })).toBe(false);
  });
});

describe('exigirTransicao', () => {
  it('lança ErroTransicao com a mensagem em português', () => {
    const pedido = { de: 'CANCELADA', para: 'AGUARDANDO_CONFERENCIA', ator: 'OPERADOR' } as const;
    expect(() => exigirTransicao(pedido)).toThrow(ErroTransicao);
    expect(() => exigirTransicao(pedido)).toThrow('Mudança de status não permitida: Cancelada → Aguardando conferência (Operador).');
  });

  it('não lança quando a mudança é permitida', () => {
    expect(() => exigirTransicao({ de: 'PENDENTE_CHEGADA', para: 'CANCELADA', ator: 'GESTOR' })).not.toThrow();
  });
});
```

`src/modules/devolucoes/criar.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { expandirUnidades, itensDoFormulario, validarNovaDevolucao } from './criar';

describe('validarNovaDevolucao', () => {
  it('normaliza canal pelo nome, rastreio, SKU, quantidade e data de postagem', () => {
    const { dados, erros } = validarNovaDevolucao({
      canal: 'Mercado Livre',
      pedido: ' 2000001 ',
      reclamacaoId: '',
      rastreio: ' br 123 456 ',
      transportadora: 'Correios',
      motivoCliente: '',
      postadaEm: '05/11/2026',
      itens: [
        { sku: 'fone-01', quantidade: '2' },
        { sku: 'cabo-02', quantidade: '' },
      ],
    });
    expect(erros).toEqual([]);
    expect(dados).toEqual({
      canal: 'MERCADO_LIVRE',
      pedido: '2000001',
      reclamacaoId: null,
      rastreio: 'BR123456',
      transportadora: 'Correios',
      motivoCliente: null,
      postadaEm: '2026-11-05',
      itens: [
        { sku: 'FONE-01', quantidade: 2 },
        { sku: 'CABO-02', quantidade: 1 },
      ],
    });
  });

  it('junta todos os erros', () => {
    const { dados, erros } = validarNovaDevolucao({
      canal: 'Loja X',
      pedido: '',
      postadaEm: '31/02/2026',
      itens: [
        { sku: 'A', quantidade: '0' },
        { sku: '', quantidade: '1' },
      ],
    });
    expect(dados).toBeNull();
    expect(erros).toEqual([
      'Canal desconhecido: Loja X',
      'Informe o número do pedido',
      'Data de postagem inválida: 31/02/2026',
      'Quantidade inválida (item 1): use um número de 1 a 50',
      'Informe o SKU (item 2)',
    ]);
  });

  it('exige pelo menos um item, a não ser quando a chamada dispensa', () => {
    expect(validarNovaDevolucao({ canal: 'SHOPEE', pedido: 'P1', itens: [] }).erros).toEqual(['Informe pelo menos um item (SKU e quantidade)']);
    expect(validarNovaDevolucao({ canal: 'SHOPEE', pedido: 'P1', itens: [] }, { exigirItens: false }).erros).toEqual([]);
  });
});

describe('unidades e formulário', () => {
  it('uma unidade física por linha (spec §5.1)', () => {
    expect(
      expandirUnidades([
        { sku: 'A', quantidade: 2 },
        { sku: 'B', quantidade: 1 },
      ]),
    ).toEqual(['A', 'A', 'B']);
  });

  it('lê os pares SKU + quantidade do formulário e ignora linhas sem SKU', () => {
    const dados = new FormData();
    dados.append('sku', 'A');
    dados.append('quantidade', '2');
    dados.append('sku', '  ');
    dados.append('quantidade', '1');
    dados.append('sku', 'B');
    dados.append('quantidade', '');
    expect(itensDoFormulario(dados)).toEqual([
      { sku: 'A', quantidade: '2' },
      { sku: 'B', quantidade: '' },
    ]);
  });
});
```

Acrescente no **final** de `src/lib/valores.test.ts` (e acrescente `interpretarData, interpretarInteiro` ao import do topo):

```ts
describe('interpretarInteiro', () => {
  it.each([
    ['3', 3],
    ['3.0', 3],
    ['3,0', 3],
  ])('%s → %d', (texto, n) => {
    expect(interpretarInteiro(texto)).toBe(n);
  });

  it.each(['2.5', 'abc', '', '-1'])('recusa %j', (texto) => {
    expect(interpretarInteiro(texto)).toBeNull();
  });
});

describe('interpretarData', () => {
  it.each([
    ['05/11/2026', '2026-11-05'],
    ['5/11/2026', '2026-11-05'],
    ['2026-11-05', '2026-11-05'],
  ])('%s → %s', (texto, iso) => {
    expect(interpretarData(texto)).toBe(iso);
  });

  it.each(['31/02/2026', '2026-13-01', 'ontem'])('recusa %j', (texto) => {
    expect(interpretarData(texto)).toBeNull();
  });
});
```

Rode: `npm test`
Esperado: FAIL (os módulos de devoluções ainda não existem).

- [ ] **Passo 2: Implementar o vocabulário, as transições e as validações**

Acrescente no **final** de `src/lib/valores.ts`:

```ts
/** "3", "3.0" ou "3,0" → 3 (o Excel às vezes manda inteiros com ".0"). Outros textos → null. */
export function interpretarInteiro(texto: string): number | null {
  const s = texto.trim().replace(',', '.');
  if (!/^\d+(\.0+)?$/.test(s)) return null;
  return Number.parseInt(s, 10);
}

/** "05/11/2026", "5/11/2026" ou "2026-11-05" → "2026-11-05". Datas que não existem → null. */
export function interpretarData(texto: string): string | null {
  const s = texto.trim();
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const partes = br ? [br[3], br[2], br[1]] : iso ? [iso[1], iso[2], iso[3]] : null;
  if (!partes) return null;
  const [ano, mes, dia] = partes.map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) return null;
  return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}
```

`src/modules/devolucoes/dominio.ts`:

```ts
/** Vocabulário das devoluções (spec §5.1 a §5.3). Sem imports com "@/": o drizzle-kit lê este arquivo pelo schema. */

export const CANAIS = ['MERCADO_LIVRE', 'AMAZON', 'SHOPEE', 'MAGALU', 'TIKTOK_SHOP', 'SHEIN'] as const;
export type Canal = (typeof CANAIS)[number];
export const ROTULO_CANAL: Record<Canal, string> = {
  MERCADO_LIVRE: 'Mercado Livre',
  AMAZON: 'Amazon',
  SHOPEE: 'Shopee',
  MAGALU: 'Magalu',
  TIKTOK_SHOP: 'TikTok Shop',
  SHEIN: 'Shein',
};
export function ehCanal(texto: string): texto is Canal {
  return (CANAIS as readonly string[]).includes(texto);
}

export const ORIGENS = ['API', 'MANUAL', 'PLANILHA'] as const;
export type Origem = (typeof ORIGENS)[number];
export const ROTULO_ORIGEM: Record<Origem, string> = {
  API: 'Automática (API do canal)',
  MANUAL: 'Cadastro manual',
  PLANILHA: 'Planilha',
};

export const TIPOS_DEVOLUCAO = ['DEVOLUCAO', 'TROCA'] as const;
export type TipoDevolucao = (typeof TIPOS_DEVOLUCAO)[number];
export const ROTULO_TIPO: Record<TipoDevolucao, string> = { DEVOLUCAO: 'Devolução', TROCA: 'Troca' };

/** Status do pacote (spec §5.2). */
export const STATUS_DEVOLUCAO = [
  'PENDENTE_CHEGADA',
  'AGUARDANDO_CONFERENCIA',
  'EM_CONFERENCIA',
  'AGUARDANDO_NF',
  'CONCLUIDA',
  'CANCELADA',
  'EXTRAVIADA',
  'NO_CD_MARKETPLACE',
] as const;
export type StatusDevolucao = (typeof STATUS_DEVOLUCAO)[number];
export const ROTULO_STATUS: Record<StatusDevolucao, string> = {
  PENDENTE_CHEGADA: 'Pendente de chegada',
  AGUARDANDO_CONFERENCIA: 'Aguardando conferência',
  EM_CONFERENCIA: 'Em conferência',
  AGUARDANDO_NF: 'Aguardando NF',
  CONCLUIDA: 'Concluída',
  CANCELADA: 'Cancelada',
  EXTRAVIADA: 'Extraviada',
  NO_CD_MARKETPLACE: 'No CD do marketplace',
};
export function ehStatus(texto: string): texto is StatusDevolucao {
  return (STATUS_DEVOLUCAO as readonly string[]).includes(texto);
}
/** Para textos vindos do histórico: o rótulo quando é um status, o próprio texto quando não é. */
export function rotuloStatus(texto: string): string {
  return ehStatus(texto) ? ROTULO_STATUS[texto] : texto;
}

/** Status de cada unidade (spec §5.3). Na Fase 1 todo item nasce e fica PENDENTE. */
export const STATUS_ITEM = [
  'PENDENTE',
  'AGUARDANDO_NF',
  'DISPONIVEL_VENDA',
  'EM_LOTE',
  'ENVIADO',
  'RESOLVIDO',
  'SEM_FORNECEDOR',
  'AUSENTE',
] as const;
export type StatusItem = (typeof STATUS_ITEM)[number];
export const ROTULO_STATUS_ITEM: Record<StatusItem, string> = {
  PENDENTE: 'Pendente',
  AGUARDANDO_NF: 'Aguardando NF',
  DISPONIVEL_VENDA: 'Disponível para venda',
  EM_LOTE: 'Em lote',
  ENVIADO: 'Enviado ao fornecedor',
  RESOLVIDO: 'Resolvido',
  SEM_FORNECEDOR: 'Sem fornecedor',
  AUSENTE: 'Ausente',
};

/** Coluna do quadro (etapa do PDF) de cada status. Os status de exceção não aparecem no quadro. */
export const ETAPA_DO_STATUS: Partial<Record<StatusDevolucao, number>> = {
  PENDENTE_CHEGADA: 1,
  AGUARDANDO_CONFERENCIA: 2,
  EM_CONFERENCIA: 3,
  AGUARDANDO_NF: 4,
};

export function statusDaEtapa(numero: number): StatusDevolucao[] {
  return STATUS_DEVOLUCAO.filter((s) => ETAPA_DO_STATUS[s] === numero);
}

/** Máximo de unidades de um mesmo SKU numa linha (formulário e planilha). */
export const LIMITE_QUANTIDADE = 50;
```

`src/modules/devolucoes/canais.ts`:

```ts
import { normalizarTexto } from '@/lib/texto';
import { CANAIS, type Canal } from './dominio';

const APELIDOS: Record<string, Canal> = {
  ml: 'MERCADO_LIVRE',
  meli: 'MERCADO_LIVRE',
  mercadolivre: 'MERCADO_LIVRE',
  mercadolibre: 'MERCADO_LIVRE',
  amazon: 'AMAZON',
  amazonbr: 'AMAZON',
  shopee: 'SHOPEE',
  magalu: 'MAGALU',
  magazineluiza: 'MAGALU',
  tiktok: 'TIKTOK_SHOP',
  tiktokshop: 'TIKTOK_SHOP',
  shein: 'SHEIN',
};

/** Aceita o código (MERCADO_LIVRE), o nome (Mercado Livre) ou apelidos comuns (ML, Magazine Luiza, TikTok). */
export function interpretarCanal(texto: string): Canal | null {
  const compacto = normalizarTexto(texto).replace(/ /g, '');
  if (!compacto) return null;
  const porCodigo = CANAIS.find((c) => c.toLowerCase().replace(/_/g, '') === compacto);
  return porCodigo ?? APELIDOS[compacto] ?? null;
}
```

`src/modules/devolucoes/rastreio.ts`:

```ts
/** O rastreio é guardado e comparado sem espaços e em maiúsculas (leitor, teclado e planilha chegam iguais). */
export function normalizarRastreio(texto: string): string {
  return texto.replace(/\s+/g, '').toUpperCase();
}
```

`src/modules/devolucoes/erros.ts`:

```ts
/** Erro de regra das devoluções, com mensagem pronta para mostrar na tela. */
export class ErroDevolucao extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroDevolucao';
  }
}

export class ErroDevolucaoDuplicada extends ErroDevolucao {
  readonly codigo: string;

  constructor(codigo: string) {
    super(`Já existe a devolução ${codigo} para este pedido neste canal.`);
    this.name = 'ErroDevolucaoDuplicada';
    this.codigo = codigo;
  }
}
```

`src/modules/devolucoes/transicoes.ts`:

```ts
import { ROTULO_PERFIL, type Perfil } from '@/modules/auth/perfis';
import { ROTULO_STATUS, type StatusDevolucao } from './dominio';
import { ErroDevolucao } from './erros';

export type Ator = Perfil | 'SISTEMA';
export type PedidoTransicao = { de: StatusDevolucao | null; para: StatusDevolucao; ator: Ator; naoIdentificada?: boolean };

type Regra = { de: StatusDevolucao | null; para: StatusDevolucao; atores: readonly Ator[]; soNaoIdentificada?: true };

/** Onde a spec diz "Operador", o Gestor também pode (spec §6.9). */
const QUEM_OPERA: readonly Ator[] = ['OPERADOR', 'GESTOR'];

/** Tabela da spec §5.2. Qualquer mudança fora dela é recusada no servidor. */
export const REGRAS_TRANSICAO: readonly Regra[] = [
  { de: null, para: 'PENDENTE_CHEGADA', atores: ['SISTEMA', 'OPERADOR', 'GESTOR'] },
  { de: 'PENDENTE_CHEGADA', para: 'AGUARDANDO_CONFERENCIA', atores: QUEM_OPERA },
  { de: null, para: 'AGUARDANDO_CONFERENCIA', atores: QUEM_OPERA, soNaoIdentificada: true },
  { de: 'AGUARDANDO_CONFERENCIA', para: 'EM_CONFERENCIA', atores: QUEM_OPERA },
  { de: 'EM_CONFERENCIA', para: 'AGUARDANDO_CONFERENCIA', atores: QUEM_OPERA },
  { de: 'EM_CONFERENCIA', para: 'AGUARDANDO_NF', atores: QUEM_OPERA },
  { de: 'AGUARDANDO_NF', para: 'CONCLUIDA', atores: ['SISTEMA'] },
  { de: 'CONCLUIDA', para: 'AGUARDANDO_NF', atores: ['SISTEMA'] },
  { de: 'PENDENTE_CHEGADA', para: 'CANCELADA', atores: ['SISTEMA', 'GESTOR'] },
  { de: 'PENDENTE_CHEGADA', para: 'EXTRAVIADA', atores: ['SISTEMA', 'GESTOR'] },
  { de: 'PENDENTE_CHEGADA', para: 'NO_CD_MARKETPLACE', atores: ['SISTEMA'] },
  { de: 'NO_CD_MARKETPLACE', para: 'PENDENTE_CHEGADA', atores: ['SISTEMA'] },
];

export function podeTransitar(p: PedidoTransicao): boolean {
  return REGRAS_TRANSICAO.some(
    (r) => r.de === p.de && r.para === p.para && r.atores.includes(p.ator) && (!r.soNaoIdentificada || p.naoIdentificada === true),
  );
}

export class ErroTransicao extends ErroDevolucao {
  constructor(p: PedidoTransicao) {
    const de = p.de ? ROTULO_STATUS[p.de] : '(nova)';
    const quem = p.ator === 'SISTEMA' ? 'sistema' : ROTULO_PERFIL[p.ator];
    super(`Mudança de status não permitida: ${de} → ${ROTULO_STATUS[p.para]} (${quem}).`);
    this.name = 'ErroTransicao';
  }
}

/** Chamada antes de toda gravação de status. */
export function exigirTransicao(p: PedidoTransicao): void {
  if (!podeTransitar(p)) throw new ErroTransicao(p);
}
```

Rode: `npm test`
Esperado: os testes de `dominio`, `transicoes` e `valores` passam; `criar.test.ts` ainda falha (o módulo `criar.ts` não existe).

- [ ] **Passo 3: Tabelas das devoluções e do histórico**

`src/db/schema/devolucoes.ts`:

```ts
import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { CANAIS, ORIGENS, STATUS_DEVOLUCAO, STATUS_ITEM, TIPOS_DEVOLUCAO } from '../../modules/devolucoes/dominio';
import { usuarios } from './auth';
import { produtos } from './catalogo';

export const canalEnum = pgEnum('canal', CANAIS);
export const origemDevolucaoEnum = pgEnum('origem_devolucao', ORIGENS);
export const tipoDevolucaoEnum = pgEnum('tipo_devolucao', TIPOS_DEVOLUCAO);
export const statusDevolucaoEnum = pgEnum('status_devolucao', STATUS_DEVOLUCAO);
export const statusItemEnum = pgEnum('status_item', STATUS_ITEM);

/** Spec §5.1 (Devolucao): o pacote. A trava e as datas da conferência entram na Fase 2. */
export const devolucoes = pgTable(
  'devolucoes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    numero: bigserial('numero', { mode: 'number' }).notNull().unique(),
    /** DEV-000123, gerado pelo banco a partir de `numero`. */
    codigo: text('codigo')
      .notNull()
      .unique()
      .generatedAlwaysAs(sql`'DEV-' || case when "numero" < 1000000 then lpad("numero"::text, 6, '0') else "numero"::text end`),
    /** Vazio só no pacote não identificado (regra no banco: devolucoes_canal_obrigatorio). */
    canal: canalEnum('canal'),
    origem: origemDevolucaoEnum('origem').notNull(),
    pedidosExternos: text('pedidos_externos').array().notNull().default(sql`'{}'::text[]`),
    reclamacaoId: text('reclamacao_id'),
    devolucaoExternaId: text('devolucao_externa_id'),
    tipo: tipoDevolucaoEnum('tipo').notNull().default('DEVOLUCAO'),
    rastreio: text('rastreio'),
    transportadora: text('transportadora'),
    status: statusDevolucaoEnum('status').notNull(),
    statusCanal: text('status_canal'),
    entregueSegundoCanalEm: timestamp('entregue_segundo_canal_em', { withTimezone: true }),
    prazoConferenciaCanal: timestamp('prazo_conferencia_canal', { withTimezone: true }),
    naoIdentificada: boolean('nao_identificada').notNull().default(false),
    motivoCliente: text('motivo_cliente'),
    postadaEm: date('postada_em', { mode: 'string' }),
    observacoes: text('observacoes'),
    criadoPor: uuid('criado_por').references(() => usuarios.id, { onDelete: 'set null' }),
    criadaEm: timestamp('criada_em', { withTimezone: true }).notNull().defaultNow(),
    recebidaEm: timestamp('recebida_em', { withTimezone: true }),
    recebidaPor: uuid('recebida_por').references(() => usuarios.id, { onDelete: 'set null' }),
    atualizadaEm: timestamp('atualizada_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('devolucoes_canal_externa_uq').on(t.canal, t.devolucaoExternaId),
    index('devolucoes_status_idx').on(t.status),
    index('devolucoes_rastreio_idx').on(t.rastreio),
    check('devolucoes_canal_obrigatorio', sql`"canal" is not null or "nao_identificada"`),
  ],
);

/** Spec §5.1 (ItemDevolucao): uma linha por unidade física. O resto dos campos da conferência entra na Fase 2. */
export const itensDevolucao = pgTable(
  'itens_devolucao',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    devolucaoId: uuid('devolucao_id')
      .notNull()
      .references(() => devolucoes.id, { onDelete: 'cascade' }),
    /** 1, 2, 3... dentro da devolução. */
    unidade: integer('unidade').notNull(),
    sku: text('sku').notNull(),
    produtoEsperadoId: uuid('produto_esperado_id').references(() => produtos.id, { onDelete: 'set null' }),
    /** Preenchido na conferência (Fase 2); já existe para o filtro "Serial Number" da Busca Avançada. */
    serial: text('serial'),
    status: statusItemEnum('status').notNull().default('PENDENTE'),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('itens_devolucao_devolucao_idx').on(t.devolucaoId),
    uniqueIndex('itens_devolucao_unidade_uq').on(t.devolucaoId, t.unidade),
  ],
);
```

`src/db/schema/historico.ts`:

```ts
import { bigserial, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { usuarios } from './auth';

/** Spec §5.1 (EventoHistorico): quem fez o quê e quando. Toda mudança de status grava uma linha (spec §5.2). */
export const eventosHistorico = pgTable(
  'eventos_historico',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    entidade: text('entidade').notNull(),
    entidadeId: text('entidade_id').notNull(),
    acao: text('acao').notNull(),
    de: text('de'),
    para: text('para'),
    /** Vazio quando a ação é do sistema. */
    usuarioId: uuid('usuario_id').references(() => usuarios.id, { onDelete: 'set null' }),
    em: timestamp('em', { withTimezone: true }).notNull().defaultNow(),
    dados: jsonb('dados').$type<Record<string, unknown>>(),
  },
  (t) => [index('eventos_historico_entidade_idx').on(t.entidade, t.entidadeId)],
);
```

`src/db/schema/index.ts` (substitui todo o conteúdo):

```ts
export * from './auth';
export * from './catalogo';
export * from './devolucoes';
export * from './historico';
export * from './importacao';
export * from './notificacoes';
```

```bash
cd "/c/Users/idmpc/Dvoluções Markt"
npm run db:gerar
npm run db:migrar
```

Esperado: `drizzle/0004_<nome>.sql` com os 5 `CREATE TYPE`, as 3 tabelas, a coluna `"codigo" text NOT NULL GENERATED ALWAYS AS (...) STORED` e o `CHECK` `devolucoes_canal_obrigatorio`.

- [ ] **Passo 4: Histórico**

`src/modules/historico/eventos.ts`:

```ts
import { and, asc, eq } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { eventosHistorico, usuarios } from '@/db/schema';

export type EntidadeHistorico = 'devolucao' | 'usuario';

export type NovoEvento = {
  entidade: EntidadeHistorico;
  entidadeId: string;
  acao: string;
  de?: string | null;
  para?: string | null;
  /** null quando a ação é do sistema. */
  usuarioId: string | null;
  dados?: Record<string, unknown>;
  em?: Date;
};

export async function registrarEvento(db: DbOuTx, e: NovoEvento): Promise<void> {
  await db.insert(eventosHistorico).values({
    entidade: e.entidade,
    entidadeId: e.entidadeId,
    acao: e.acao,
    de: e.de ?? null,
    para: e.para ?? null,
    usuarioId: e.usuarioId,
    dados: e.dados ?? null,
    ...(e.em ? { em: e.em } : {}),
  });
}

export type EventoListado = {
  id: number;
  acao: string;
  de: string | null;
  para: string | null;
  em: Date;
  usuarioNome: string | null;
  dados: Record<string, unknown> | null;
};

export async function listarEventos(db: DbOuTx, entidade: EntidadeHistorico, entidadeId: string): Promise<EventoListado[]> {
  return db
    .select({
      id: eventosHistorico.id,
      acao: eventosHistorico.acao,
      de: eventosHistorico.de,
      para: eventosHistorico.para,
      em: eventosHistorico.em,
      usuarioNome: usuarios.nome,
      dados: eventosHistorico.dados,
    })
    .from(eventosHistorico)
    .leftJoin(usuarios, eq(usuarios.id, eventosHistorico.usuarioId))
    .where(and(eq(eventosHistorico.entidade, entidade), eq(eventosHistorico.entidadeId, entidadeId)))
    // Ordem de gravação: o id cresce a cada evento.
    .orderBy(asc(eventosHistorico.id));
}

export const ROTULO_ACAO: Record<string, string> = {
  criada: 'Devolução cadastrada',
  criada_nao_identificada: 'Pacote não identificado registrado',
  recebida: 'Chegada registrada',
  identificada: 'Devolução identificada',
  cancelada: 'Devolução cancelada',
  extraviada: 'Devolução marcada como extraviada',
  usuario_criado: 'Usuário criado',
  perfil_alterado: 'Perfil alterado',
  usuario_desativado: 'Usuário desativado',
  usuario_reativado: 'Usuário reativado',
};

export function rotuloDaAcao(acao: string): string {
  return ROTULO_ACAO[acao] ?? acao;
}
```

- [ ] **Passo 5: Escrever o teste de integração que falha**

`src/modules/devolucoes/criar.int.test.ts`:

```ts
import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { devolucoes, itensDevolucao } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { listarEventos } from '@/modules/historico/eventos';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarProdutoTeste, criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { criarDevolucao, type DadosNovaDevolucao } from './criar';
import { ErroDevolucaoDuplicada } from './erros';
import { ErroTransicao } from './transicoes';

const { db, sql } = criarDbTeste();
let operador: UsuarioSessao;

const DADOS: DadosNovaDevolucao = {
  canal: 'SHOPEE',
  pedido: 'SHP-1001',
  reclamacaoId: null,
  rastreio: 'BR123456789BR',
  transportadora: 'Correios',
  motivoCliente: null,
  postadaEm: null,
  itens: [
    { sku: 'FONE-01', quantidade: 2 },
    { sku: 'CABO-02', quantidade: 1 },
  ],
};

beforeEach(async () => {
  await limparTabelas(sql);
  operador = await criarUsuarioTeste(db, 'OPERADOR');
});
afterAll(async () => {
  await sql.end();
});

describe('criarDevolucao', () => {
  it('cria com código DEV, uma linha por unidade física e o evento no histórico', async () => {
    const produtoId = await criarProdutoTeste(db, { sku: 'FONE-01', descricao: 'Fone' });
    const criada = await criarDevolucao(db, DADOS, { origem: 'MANUAL', usuario: operador });
    expect(criada).toEqual({ id: expect.any(String), codigo: 'DEV-000001', unidades: 3 });

    const [d] = await db.select().from(devolucoes).where(eq(devolucoes.id, criada.id));
    expect(d).toMatchObject({
      status: 'PENDENTE_CHEGADA',
      canal: 'SHOPEE',
      origem: 'MANUAL',
      pedidosExternos: ['SHP-1001'],
      rastreio: 'BR123456789BR',
      naoIdentificada: false,
      criadoPor: operador.id,
    });

    const itens = await db.select().from(itensDevolucao).where(eq(itensDevolucao.devolucaoId, criada.id)).orderBy(asc(itensDevolucao.unidade));
    expect(itens.map((i) => [i.unidade, i.sku, i.produtoEsperadoId, i.status])).toEqual([
      [1, 'FONE-01', produtoId, 'PENDENTE'],
      [2, 'FONE-01', produtoId, 'PENDENTE'],
      [3, 'CABO-02', null, 'PENDENTE'],
    ]);

    expect(await listarEventos(db, 'devolucao', criada.id)).toEqual([
      expect.objectContaining({ acao: 'criada', de: null, para: 'PENDENTE_CHEGADA', usuarioNome: operador.nome, dados: { origem: 'MANUAL', unidades: 3 } }),
    ]);
  });

  it('numera em sequência', async () => {
    const a = await criarDevolucao(db, DADOS, { origem: 'MANUAL', usuario: operador });
    const b = await criarDevolucao(db, { ...DADOS, pedido: 'SHP-1002' }, { origem: 'PLANILHA', usuario: operador });
    expect([a.codigo, b.codigo]).toEqual(['DEV-000001', 'DEV-000002']);
  });

  it('recusa outra devolução em andamento para o mesmo pedido no mesmo canal', async () => {
    await criarDevolucao(db, DADOS, { origem: 'MANUAL', usuario: operador });
    await expect(criarDevolucao(db, DADOS, { origem: 'MANUAL', usuario: operador })).rejects.toThrow(new ErroDevolucaoDuplicada('DEV-000001'));

    // o mesmo número de pedido em outro canal é outro pedido
    await expect(criarDevolucao(db, { ...DADOS, canal: 'AMAZON' }, { origem: 'MANUAL', usuario: operador })).resolves.toMatchObject({
      codigo: 'DEV-000002',
    });

    // depois de cancelada, o pedido pode ter uma devolução nova
    await db.update(devolucoes).set({ status: 'CANCELADA' }).where(eq(devolucoes.codigo, 'DEV-000001'));
    await expect(criarDevolucao(db, DADOS, { origem: 'MANUAL', usuario: operador })).resolves.toMatchObject({ codigo: 'DEV-000003' });
  });

  it('o Fiscal não cadastra devolução', async () => {
    const fiscal = await criarUsuarioTeste(db, 'FISCAL');
    await expect(criarDevolucao(db, DADOS, { origem: 'MANUAL', usuario: fiscal })).rejects.toBeInstanceOf(ErroTransicao);
  });

  it('o banco exige o canal, a não ser no pacote não identificado', async () => {
    await expect(db.insert(devolucoes).values({ origem: 'MANUAL', status: 'PENDENTE_CHEGADA' })).rejects.toThrow();
    await expect(
      db.insert(devolucoes).values({ origem: 'MANUAL', status: 'AGUARDANDO_CONFERENCIA', naoIdentificada: true }),
    ).resolves.toBeDefined();
  });
});
```

Rode: `npm run test:int`
Esperado: FAIL (`./criar` não existe).

- [ ] **Passo 6: Implementar o cadastro**

`src/modules/devolucoes/criar.ts`:

```ts
import { and, asc, inArray, notInArray, sql } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { devolucoes, itensDevolucao } from '@/db/schema';
import { interpretarData, interpretarInteiro, textoOpcional } from '@/lib/valores';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { normalizarSku } from '@/modules/catalogo/documentos';
import { idsDosProdutos } from '@/modules/catalogo/produtos';
import { registrarEvento } from '@/modules/historico/eventos';
import { interpretarCanal } from './canais';
import { LIMITE_QUANTIDADE, type Canal, type StatusDevolucao } from './dominio';
import { ErroDevolucaoDuplicada } from './erros';
import { normalizarRastreio } from './rastreio';
import { exigirTransicao } from './transicoes';

/** Uma devolução Cancelada, Extraviada ou Concluída não impede outra para o mesmo pedido. */
const ENCERRADAS: StatusDevolucao[] = ['CANCELADA', 'EXTRAVIADA', 'CONCLUIDA'];

export type ItemPedido = { sku: string; quantidade: number };

/** Entrada como chega do formulário ou da planilha (tudo texto). */
export type EntradaNovaDevolucao = {
  canal: string;
  pedido: string;
  reclamacaoId?: string;
  rastreio?: string;
  transportadora?: string;
  motivoCliente?: string;
  postadaEm?: string;
  itens: { sku: string; quantidade: string | number }[];
};

export type DadosNovaDevolucao = {
  canal: Canal;
  pedido: string;
  reclamacaoId: string | null;
  rastreio: string | null;
  transportadora: string | null;
  motivoCliente: string | null;
  postadaEm: string | null;
  itens: ItemPedido[];
};

export type DevolucaoCriada = { id: string; codigo: string; unidades: number };

/** Campos do formulário "Nova devolução" (spec §6.1) e das colunas da planilha de devoluções. */
export function validarNovaDevolucao(
  e: EntradaNovaDevolucao,
  opcoes: { exigirItens?: boolean } = {},
): { dados: DadosNovaDevolucao | null; erros: string[] } {
  const erros: string[] = [];
  const canalTexto = e.canal.trim();
  const canal = canalTexto ? interpretarCanal(canalTexto) : null;
  if (!canalTexto) erros.push('Escolha o canal (marketplace)');
  else if (!canal) erros.push(`Canal desconhecido: ${canalTexto}`);
  const pedido = e.pedido.trim();
  if (!pedido) erros.push('Informe o número do pedido');
  else if (pedido.length > 60) erros.push('Número do pedido: no máximo 60 caracteres');
  const reclamacaoId = textoOpcional(e.reclamacaoId, 60, 'ID da reclamação', erros);
  const rastreio = normalizarRastreio(e.rastreio ?? '') || null;
  if (rastreio && rastreio.length > 60) erros.push('Código de rastreamento: no máximo 60 caracteres');
  const transportadora = textoOpcional(e.transportadora, 60, 'Transportadora', erros);
  const motivoCliente = textoOpcional(e.motivoCliente, 500, 'Motivo do cliente', erros);
  const postagemTexto = (e.postadaEm ?? '').trim();
  const postadaEm = postagemTexto ? interpretarData(postagemTexto) : null;
  if (postagemTexto && !postadaEm) erros.push(`Data de postagem inválida: ${postagemTexto}`);

  const itens: ItemPedido[] = [];
  e.itens.forEach((item, i) => {
    const qual = e.itens.length > 1 ? ` (item ${i + 1})` : '';
    const sku = normalizarSku(item.sku);
    if (!sku) {
      erros.push(`Informe o SKU${qual}`);
      return;
    }
    if (sku.length > 60) {
      erros.push(`SKU${qual}: no máximo 60 caracteres`);
      return;
    }
    const quantidade = interpretarInteiro(String(item.quantidade).trim() || '1');
    if (quantidade === null || quantidade < 1 || quantidade > LIMITE_QUANTIDADE) {
      erros.push(`Quantidade inválida${qual}: use um número de 1 a ${LIMITE_QUANTIDADE}`);
      return;
    }
    itens.push({ sku, quantidade });
  });
  if ((opcoes.exigirItens ?? true) && e.itens.length === 0) erros.push('Informe pelo menos um item (SKU e quantidade)');

  if (erros.length > 0 || !canal) return { dados: null, erros };
  return { dados: { canal, pedido, reclamacaoId, rastreio, transportadora, motivoCliente, postadaEm, itens }, erros: [] };
}

/** Uma linha por unidade física (spec §5.1): 2 × A e 1 × B viram [A, A, B]. */
export function expandirUnidades(itens: ItemPedido[]): string[] {
  return itens.flatMap((item) => Array.from({ length: item.quantidade }, () => item.sku));
}

/** Pares "sku" + "quantidade" repetidos no formulário, na mesma ordem. Linhas sem SKU são ignoradas. */
export function itensDoFormulario(dados: FormData): { sku: string; quantidade: string }[] {
  const skus = dados.getAll('sku').map(String);
  const quantidades = dados.getAll('quantidade').map(String);
  return skus.map((sku, i) => ({ sku, quantidade: quantidades[i] ?? '' })).filter((item) => item.sku.trim() !== '');
}

export function chavePedido(canal: Canal, pedido: string): string {
  return `${canal}|${pedido}`;
}

/** Código da devolução em andamento de cada (canal, pedido) pedido, na chave `chavePedido(canal, pedido)`. */
export async function codigosAtivosPorPedido(db: DbOuTx, pares: { canal: Canal; pedido: string }[]): Promise<Map<string, string>> {
  if (pares.length === 0) return new Map();
  const canais = [...new Set(pares.map((p) => p.canal))];
  const pedidos = [...new Set(pares.map((p) => p.pedido))];
  const linhas = await db
    .select({ canal: devolucoes.canal, pedidos: devolucoes.pedidosExternos, codigo: devolucoes.codigo })
    .from(devolucoes)
    .where(
      and(
        inArray(devolucoes.canal, canais),
        notInArray(devolucoes.status, ENCERRADAS),
        sql`${devolucoes.pedidosExternos} && ARRAY[${sql.join(
          pedidos.map((p) => sql`${p}`),
          sql`, `,
        )}]::text[]`,
      ),
    )
    .orderBy(asc(devolucoes.numero));
  const procurados = new Set(pares.map((p) => chavePedido(p.canal, p.pedido)));
  const resultado = new Map<string, string>();
  for (const linha of linhas) {
    if (!linha.canal) continue;
    for (const pedido of linha.pedidos) {
      const chave = chavePedido(linha.canal, pedido);
      if (procurados.has(chave) && !resultado.has(chave)) resultado.set(chave, linha.codigo);
    }
  }
  return resultado;
}

/**
 * Cadastra a devolução em "Pendente de chegada" (spec §5.2, "(nova) → PENDENTE_CHEGADA"), com uma linha por unidade
 * e o evento no histórico. Funciona dentro de outra transação (a confirmação da planilha usa um savepoint).
 */
export async function criarDevolucao(
  db: DbOuTx,
  dados: DadosNovaDevolucao,
  opcoes: { origem: 'MANUAL' | 'PLANILHA'; usuario: UsuarioSessao },
): Promise<DevolucaoCriada> {
  exigirTransicao({ de: null, para: 'PENDENTE_CHEGADA', ator: opcoes.usuario.perfil });
  const existente = (await codigosAtivosPorPedido(db, [{ canal: dados.canal, pedido: dados.pedido }])).get(
    chavePedido(dados.canal, dados.pedido),
  );
  if (existente) throw new ErroDevolucaoDuplicada(existente);
  const unidades = expandirUnidades(dados.itens);
  const produtosPorSku = await idsDosProdutos(db, [...new Set(unidades)]);

  return db.transaction(async (tx) => {
    const [criada] = await tx
      .insert(devolucoes)
      .values({
        canal: dados.canal,
        origem: opcoes.origem,
        pedidosExternos: [dados.pedido],
        reclamacaoId: dados.reclamacaoId,
        rastreio: dados.rastreio,
        transportadora: dados.transportadora,
        motivoCliente: dados.motivoCliente,
        postadaEm: dados.postadaEm,
        status: 'PENDENTE_CHEGADA',
        criadoPor: opcoes.usuario.id,
      })
      .returning({ id: devolucoes.id, codigo: devolucoes.codigo });
    if (unidades.length > 0) {
      await tx.insert(itensDevolucao).values(
        unidades.map((sku, i) => ({
          devolucaoId: criada.id,
          unidade: i + 1,
          sku,
          produtoEsperadoId: produtosPorSku.get(sku) ?? null,
        })),
      );
    }
    await registrarEvento(tx, {
      entidade: 'devolucao',
      entidadeId: criada.id,
      acao: 'criada',
      de: null,
      para: 'PENDENTE_CHEGADA',
      usuarioId: opcoes.usuario.id,
      dados: { origem: opcoes.origem, unidades: unidades.length },
    });
    return { id: criada.id, codigo: criada.codigo, unidades: unidades.length };
  });
}
```

Acrescente no **final** de `tests/helpers/fabricas.ts` (e acrescente estes imports no topo):

```ts
import { criarDevolucao, type DadosNovaDevolucao, type DevolucaoCriada } from '@/modules/devolucoes/criar';
```

```ts
export async function criarDevolucaoTeste(
  db: DbOuTx,
  usuario: UsuarioSessao,
  dados: Partial<DadosNovaDevolucao> = {},
): Promise<DevolucaoCriada> {
  const n = proximo();
  const marca = Date.now().toString(36).toUpperCase();
  return criarDevolucao(
    db,
    {
      canal: 'SHOPEE',
      pedido: `PED-TESTE-${n}-${marca}`,
      reclamacaoId: null,
      rastreio: `TST${n}X${marca}`,
      transportadora: 'Correios',
      motivoCliente: null,
      postadaEm: null,
      itens: [{ sku: 'SKU-TESTE', quantidade: 1 }],
      ...dados,
    },
    { origem: 'MANUAL', usuario },
  );
}
```

- [ ] **Passo 7: Rodar e confirmar que passa**

Rode: `npm test && npm run test:int && npm run typecheck && npm run lint`
Esperado: tudo PASS.

- [ ] **Passo 8: Commit**

```bash
cd "/c/Users/idmpc/Dvoluções Markt"
git add -A
git commit -m "feat: devoluções com código DEV, uma linha por unidade, transições da spec e histórico" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 8: Recebimento, pacote não identificado, cancelamento/extravio e detalhe (serviço)

**Arquivos:**
- Criar: `src/modules/devolucoes/recebimento.ts`, `src/modules/devolucoes/excecoes.ts`, `src/modules/devolucoes/detalhe.ts`
- Testes: `src/modules/devolucoes/recebimento.int.test.ts`, `src/modules/devolucoes/excecoes.int.test.ts`, `src/modules/devolucoes/detalhe.int.test.ts`

**Interfaces:**
- Consome: `exigirTransicao`, `ErroTransicao`, `ErroDevolucao`, `normalizarRastreio`, `validarNovaDevolucao`, `expandirUnidades`, `codigosAtivosPorPedido`, `chavePedido`, `EntradaNovaDevolucao`, `registrarEvento`, `listarEventos`, `devolucoes`, `itensDevolucao`, `criarDevolucaoTeste` (Tarefa 7); `idsDosProdutos`, `ehUuid`, `criarUsuarioTeste`, `criarProdutoTeste`, `criarFornecedorTeste` (Tarefa 2); `pode` (Fase 0)
- Produz:
  - em `recebimento.ts`: `type ResultadoRecebimento = { tipo: 'recebidas'; codigos: string[]; em: Date } | { tipo: 'ja_recebida'; codigo: string; status: StatusDevolucao; recebidaEm: Date | null } | { tipo: 'bloqueada'; codigo: string; status: StatusDevolucao } | { tipo: 'nao_encontrada'; rastreio: string }`, `receberPorRastreio(db, rastreioBruto, usuario, agora?): Promise<ResultadoRecebimento>`, `criarNaoIdentificada(db, rastreioBruto, usuario, agora?): Promise<{ id: string; codigo: string }>`
  - em `excecoes.ts`: `encerrarPendente(db, id, para: 'CANCELADA' | 'EXTRAVIADA', motivo, usuario, agora?): Promise<void>`, `identificarDevolucao(db, id, entrada: EntradaNovaDevolucao, usuario, agora?): Promise<void>`
  - em `detalhe.ts`: `obterDetalhe(db, codigo): Promise<DetalheDevolucao | null>`, `type DetalheDevolucao` (dados da devolução + `criadoPorNome`, `recebidaPorNome`, `itens[]` com `unidade, sku, serial, status, descricao, ean, fornecedor`, e `eventos: EventoListado[]`)
  - Todos lançam `ErroDevolucao` (ou `ErroTransicao`) com mensagem pronta para a tela.

- [ ] **Passo 1: Escrever os testes de integração que falham**

`src/modules/devolucoes/recebimento.int.test.ts`:

```ts
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { devolucoes } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { listarEventos } from '@/modules/historico/eventos';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarDevolucaoTeste, criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { ErroDevolucao } from './erros';
import { criarNaoIdentificada, receberPorRastreio } from './recebimento';
import { ErroTransicao } from './transicoes';

const { db, sql } = criarDbTeste();
let operador: UsuarioSessao;

beforeEach(async () => {
  await limparTabelas(sql);
  operador = await criarUsuarioTeste(db, 'OPERADOR');
});
afterAll(async () => {
  await sql.end();
});

describe('receberPorRastreio (spec §6.2)', () => {
  it('registra a chegada com data, hora e usuário, e grava o histórico', async () => {
    const d = await criarDevolucaoTeste(db, operador, { rastreio: 'BR111' });
    const agora = new Date();
    expect(await receberPorRastreio(db, ' br 111 ', operador, agora)).toEqual({ tipo: 'recebidas', codigos: [d.codigo], em: agora });
    const [linha] = await db.select().from(devolucoes).where(eq(devolucoes.id, d.id));
    expect(linha).toMatchObject({ status: 'AGUARDANDO_CONFERENCIA', recebidaEm: agora, recebidaPor: operador.id });
    expect((await listarEventos(db, 'devolucao', d.id)).map((e) => [e.acao, e.de, e.para, e.usuarioNome])).toEqual([
      ['criada', null, 'PENDENTE_CHEGADA', operador.nome],
      ['recebida', 'PENDENTE_CHEGADA', 'AGUARDANDO_CONFERENCIA', operador.nome],
    ]);
  });

  it('na segunda leitura avisa que o pacote já chegou', async () => {
    const d = await criarDevolucaoTeste(db, operador, { rastreio: 'BR111' });
    const agora = new Date();
    await receberPorRastreio(db, 'BR111', operador, agora);
    expect(await receberPorRastreio(db, 'BR111', operador)).toEqual({
      tipo: 'ja_recebida',
      codigo: d.codigo,
      status: 'AGUARDANDO_CONFERENCIA',
      recebidaEm: agora,
    });
  });

  it('o mesmo rastreio em duas devoluções pendentes registra a chegada das duas', async () => {
    const a = await criarDevolucaoTeste(db, operador, { rastreio: 'BR222' });
    const b = await criarDevolucaoTeste(db, operador, { rastreio: 'BR222' });
    const resultado = await receberPorRastreio(db, 'BR222', operador);
    expect(resultado).toMatchObject({ tipo: 'recebidas', codigos: [a.codigo, b.codigo] });
  });

  it('devolução cancelada fica bloqueada', async () => {
    const d = await criarDevolucaoTeste(db, operador, { rastreio: 'BR333' });
    await db.update(devolucoes).set({ status: 'CANCELADA' }).where(eq(devolucoes.id, d.id));
    expect(await receberPorRastreio(db, 'BR333', operador)).toEqual({ tipo: 'bloqueada', codigo: d.codigo, status: 'CANCELADA' });
  });

  it('rastreio desconhecido', async () => {
    expect(await receberPorRastreio(db, 'xyz 9', operador)).toEqual({ tipo: 'nao_encontrada', rastreio: 'XYZ9' });
  });

  it('recusa rastreio vazio e o perfil Fiscal', async () => {
    await expect(receberPorRastreio(db, '   ', operador)).rejects.toThrow(new ErroDevolucao('Leia ou digite o código de rastreamento.'));
    const fiscal = await criarUsuarioTeste(db, 'FISCAL');
    await expect(receberPorRastreio(db, 'BR111', fiscal)).rejects.toBeInstanceOf(ErroTransicao);
  });
});

describe('criarNaoIdentificada (spec §5.2 e §6.2)', () => {
  it('cria já em "Aguardando conferência", sem canal, com a marca e a chegada registrada', async () => {
    const agora = new Date();
    const criada = await criarNaoIdentificada(db, 'nn 123', operador, agora);
    const [linha] = await db.select().from(devolucoes).where(eq(devolucoes.id, criada.id));
    expect(linha).toMatchObject({
      codigo: criada.codigo,
      canal: null,
      naoIdentificada: true,
      rastreio: 'NN123',
      status: 'AGUARDANDO_CONFERENCIA',
      recebidaEm: agora,
      recebidaPor: operador.id,
    });
    expect((await listarEventos(db, 'devolucao', criada.id)).map((e) => [e.acao, e.de, e.para])).toEqual([
      ['criada_nao_identificada', null, 'AGUARDANDO_CONFERENCIA'],
    ]);
  });

  it('recusa quando o rastreio já existe', async () => {
    const d = await criarDevolucaoTeste(db, operador, { rastreio: 'BR444' });
    await expect(criarNaoIdentificada(db, 'BR444', operador)).rejects.toThrow(
      new ErroDevolucao(`Já existe a devolução ${d.codigo} com este rastreio. Registre a chegada por ela.`),
    );
  });
});
```

`src/modules/devolucoes/excecoes.int.test.ts`:

```ts
import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { devolucoes, itensDevolucao } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { listarEventos } from '@/modules/historico/eventos';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarDevolucaoTeste, criarProdutoTeste, criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { ErroDevolucao } from './erros';
import { encerrarPendente, identificarDevolucao } from './excecoes';
import { criarNaoIdentificada, receberPorRastreio } from './recebimento';
import { ErroTransicao } from './transicoes';

const { db, sql } = criarDbTeste();
let operador: UsuarioSessao;
let gestor: UsuarioSessao;

beforeEach(async () => {
  await limparTabelas(sql);
  operador = await criarUsuarioTeste(db, 'OPERADOR');
  gestor = await criarUsuarioTeste(db, 'GESTOR');
});
afterAll(async () => {
  await sql.end();
});

async function statusDe(id: string) {
  const [linha] = await db.select({ status: devolucoes.status }).from(devolucoes).where(eq(devolucoes.id, id));
  return linha.status;
}

describe('encerrarPendente (spec §5.2: Pendente de chegada → Cancelada ou Extraviada, pelo Gestor)', () => {
  it('o Gestor cancela com motivo e o histórico guarda o motivo', async () => {
    const d = await criarDevolucaoTeste(db, operador);
    await encerrarPendente(db, d.id, 'CANCELADA', '  Cliente desistiu  ', gestor);
    expect(await statusDe(d.id)).toBe('CANCELADA');
    const eventos = await listarEventos(db, 'devolucao', d.id);
    expect(eventos[eventos.length - 1]).toMatchObject({
      acao: 'cancelada',
      de: 'PENDENTE_CHEGADA',
      para: 'CANCELADA',
      usuarioNome: gestor.nome,
      dados: { motivo: 'Cliente desistiu' },
    });
  });

  it('o Gestor marca como extraviada', async () => {
    const d = await criarDevolucaoTeste(db, operador);
    await encerrarPendente(db, d.id, 'EXTRAVIADA', 'Transportadora confirmou extravio', gestor);
    expect(await statusDe(d.id)).toBe('EXTRAVIADA');
  });

  it('o Operador não cancela e o motivo é obrigatório', async () => {
    const d = await criarDevolucaoTeste(db, operador);
    await expect(encerrarPendente(db, d.id, 'CANCELADA', 'Quero cancelar', operador)).rejects.toBeInstanceOf(ErroTransicao);
    await expect(encerrarPendente(db, d.id, 'CANCELADA', ' a ', gestor)).rejects.toThrow('Explique o motivo (pelo menos 3 letras).');
  });

  it('só encerra o que ainda está pendente de chegada', async () => {
    const d = await criarDevolucaoTeste(db, operador, { rastreio: 'BR900' });
    await receberPorRastreio(db, 'BR900', operador);
    await expect(encerrarPendente(db, d.id, 'CANCELADA', 'Tarde demais', gestor)).rejects.toThrow(
      new ErroDevolucao('Só dá para cancelar ou marcar como extraviada uma devolução Pendente de chegada.'),
    );
  });
});

describe('identificarDevolucao (spec §5.2: o Gestor liga o pacote ao pedido)', () => {
  it('preenche canal, pedido e itens, e a marca de não identificada sai', async () => {
    const produtoId = await criarProdutoTeste(db, { sku: 'FONE-01' });
    const pacote = await criarNaoIdentificada(db, 'NI-1', operador);
    await identificarDevolucao(
      db,
      pacote.id,
      { canal: 'Magalu', pedido: 'MGL-9', reclamacaoId: 'R-1', transportadora: 'Jadlog', itens: [{ sku: 'fone-01', quantidade: '2' }] },
      gestor,
    );
    const [linha] = await db.select().from(devolucoes).where(eq(devolucoes.id, pacote.id));
    expect(linha).toMatchObject({
      canal: 'MAGALU',
      pedidosExternos: ['MGL-9'],
      reclamacaoId: 'R-1',
      transportadora: 'Jadlog',
      naoIdentificada: false,
      rastreio: 'NI-1',
      status: 'AGUARDANDO_CONFERENCIA',
    });
    const itens = await db.select().from(itensDevolucao).where(eq(itensDevolucao.devolucaoId, pacote.id)).orderBy(asc(itensDevolucao.unidade));
    expect(itens.map((i) => [i.unidade, i.sku, i.produtoEsperadoId])).toEqual([
      [1, 'FONE-01', produtoId],
      [2, 'FONE-01', produtoId],
    ]);
    const eventos = await listarEventos(db, 'devolucao', pacote.id);
    expect(eventos[eventos.length - 1]).toMatchObject({ acao: 'identificada', dados: { canal: 'MAGALU', pedido: 'MGL-9', unidades: 2 } });
  });

  it('recusa pedido que já tem outra devolução em andamento', async () => {
    const outra = await criarDevolucaoTeste(db, operador, { canal: 'SHOPEE', pedido: 'SHP-7' });
    const pacote = await criarNaoIdentificada(db, 'NI-2', operador);
    await expect(identificarDevolucao(db, pacote.id, { canal: 'SHOPEE', pedido: 'SHP-7', itens: [] }, gestor)).rejects.toThrow(
      `O pedido já tem a devolução ${outra.codigo}. Se ela ainda está pendente de chegada, cancele-a e tente de novo.`,
    );
  });

  it('recusa quem não é Gestor, dados inválidos e devolução já identificada', async () => {
    const pacote = await criarNaoIdentificada(db, 'NI-3', operador);
    await expect(identificarDevolucao(db, pacote.id, { canal: 'SHOPEE', pedido: 'P1', itens: [] }, operador)).rejects.toThrow(
      'Só o Gestor identifica um pacote não identificado.',
    );
    await expect(identificarDevolucao(db, pacote.id, { canal: '', pedido: '', itens: [] }, gestor)).rejects.toThrow(
      'Escolha o canal (marketplace); Informe o número do pedido',
    );
    await identificarDevolucao(db, pacote.id, { canal: 'SHOPEE', pedido: 'P1', itens: [] }, gestor);
    await expect(identificarDevolucao(db, pacote.id, { canal: 'SHOPEE', pedido: 'P2', itens: [] }, gestor)).rejects.toThrow(
      'Esta devolução já foi identificada.',
    );
  });
});
```

`src/modules/devolucoes/detalhe.int.test.ts`:

```ts
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { itensDevolucao } from '@/db/schema';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarDevolucaoTeste, criarFornecedorTeste, criarProdutoTeste, criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { obterDetalhe } from './detalhe';
import { receberPorRastreio } from './recebimento';

const { db, sql } = criarDbTeste();
beforeEach(async () => {
  await limparTabelas(sql);
});
afterAll(async () => {
  await sql.end();
});

describe('obterDetalhe', () => {
  it('traz os dados, os itens com produto e fornecedor e o histórico com o nome de quem fez', async () => {
    const operador = await criarUsuarioTeste(db, 'OPERADOR');
    await criarFornecedorTeste(db, { cnpj: '11222333000181', razaoSocial: 'Alfa Ltda' });
    await criarProdutoTeste(db, { sku: 'FONE-01', descricao: 'Fone Bluetooth', ean: '7891000000014', cnpjFornecedor: '11222333000181' });
    const d = await criarDevolucaoTeste(db, operador, {
      pedido: 'SHP-55',
      rastreio: 'BR555',
      itens: [
        { sku: 'FONE-01', quantidade: 1 },
        { sku: 'SEM-CADASTRO', quantidade: 1 },
      ],
    });
    await db.update(itensDevolucao).set({ serial: 'SN-1' }).where(eq(itensDevolucao.unidade, 1));
    await receberPorRastreio(db, 'BR555', operador);

    const detalhe = await obterDetalhe(db, d.codigo.toLowerCase());
    expect(detalhe).toMatchObject({
      codigo: d.codigo,
      canal: 'SHOPEE',
      status: 'AGUARDANDO_CONFERENCIA',
      pedidos: ['SHP-55'],
      rastreio: 'BR555',
      criadoPorNome: operador.nome,
      recebidaPorNome: operador.nome,
    });
    expect(detalhe?.itens).toEqual([
      expect.objectContaining({ unidade: 1, sku: 'FONE-01', descricao: 'Fone Bluetooth', ean: '7891000000014', fornecedor: 'Alfa Ltda', serial: 'SN-1', status: 'PENDENTE' }),
      expect.objectContaining({ unidade: 2, sku: 'SEM-CADASTRO', descricao: null, ean: null, fornecedor: null }),
    ]);
    expect(detalhe?.eventos.map((e) => e.acao)).toEqual(['criada', 'recebida']);
  });

  it('devolve null para código desconhecido', async () => {
    expect(await obterDetalhe(db, 'DEV-999999')).toBeNull();
  });
});
```

Rode: `npm run test:int`
Esperado: FAIL (os módulos ainda não existem).

- [ ] **Passo 2: Implementar o recebimento**

`src/modules/devolucoes/recebimento.ts`:

```ts
import { and, desc, eq } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { devolucoes } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { registrarEvento } from '@/modules/historico/eventos';
import type { StatusDevolucao } from './dominio';
import { ErroDevolucao } from './erros';
import { normalizarRastreio } from './rastreio';
import { exigirTransicao } from './transicoes';

/** Pacote que chegou numa devolução nesses status precisa de decisão do Gestor. */
const BLOQUEADAS: StatusDevolucao[] = ['CANCELADA', 'EXTRAVIADA', 'NO_CD_MARKETPLACE'];

export type ResultadoRecebimento =
  | { tipo: 'recebidas'; codigos: string[]; em: Date }
  | { tipo: 'ja_recebida'; codigo: string; status: StatusDevolucao; recebidaEm: Date | null }
  | { tipo: 'bloqueada'; codigo: string; status: StatusDevolucao }
  | { tipo: 'nao_encontrada'; rastreio: string };

function rastreioOuErro(bruto: string): string {
  const rastreio = normalizarRastreio(bruto);
  if (!rastreio) throw new ErroDevolucao('Leia ou digite o código de rastreamento.');
  if (rastreio.length > 60) throw new ErroDevolucao('Código de rastreamento longo demais.');
  return rastreio;
}

async function maisRecentePorRastreio(db: DbOuTx, rastreio: string) {
  const [linha] = await db
    .select({ codigo: devolucoes.codigo, status: devolucoes.status, recebidaEm: devolucoes.recebidaEm })
    .from(devolucoes)
    .where(eq(devolucoes.rastreio, rastreio))
    .orderBy(desc(devolucoes.numero))
    .limit(1);
  return linha ?? null;
}

/**
 * Recepção física (spec §6.2): o rastreio lido move a devolução de "Pendente de chegada" para
 * "Aguardando conferência" e registra data, hora e usuário. É a única coisa que move a etapa 1 (spec §5.2).
 */
export async function receberPorRastreio(
  db: DbOuTx,
  rastreioBruto: string,
  usuario: UsuarioSessao,
  agora: Date = new Date(),
): Promise<ResultadoRecebimento> {
  exigirTransicao({ de: 'PENDENTE_CHEGADA', para: 'AGUARDANDO_CONFERENCIA', ator: usuario.perfil });
  const rastreio = rastreioOuErro(rastreioBruto);
  const pendentes = await db
    .select({ id: devolucoes.id })
    .from(devolucoes)
    .where(and(eq(devolucoes.rastreio, rastreio), eq(devolucoes.status, 'PENDENTE_CHEGADA')));

  if (pendentes.length > 0) {
    const codigos = await db.transaction(async (tx) => {
      const recebidas: string[] = [];
      for (const pendente of pendentes) {
        const [atualizada] = await tx
          .update(devolucoes)
          .set({ status: 'AGUARDANDO_CONFERENCIA', recebidaEm: agora, recebidaPor: usuario.id, atualizadaEm: agora })
          .where(and(eq(devolucoes.id, pendente.id), eq(devolucoes.status, 'PENDENTE_CHEGADA')))
          .returning({ id: devolucoes.id, codigo: devolucoes.codigo });
        if (!atualizada) continue; // outro operador registrou a chegada no mesmo instante
        await registrarEvento(tx, {
          entidade: 'devolucao',
          entidadeId: atualizada.id,
          acao: 'recebida',
          de: 'PENDENTE_CHEGADA',
          para: 'AGUARDANDO_CONFERENCIA',
          usuarioId: usuario.id,
          dados: { rastreio },
          em: agora,
        });
        recebidas.push(atualizada.codigo);
      }
      return recebidas;
    });
    if (codigos.length > 0) return { tipo: 'recebidas', codigos: codigos.sort(), em: agora };
  }

  const atual = await maisRecentePorRastreio(db, rastreio);
  if (!atual) return { tipo: 'nao_encontrada', rastreio };
  if (BLOQUEADAS.includes(atual.status)) return { tipo: 'bloqueada', codigo: atual.codigo, status: atual.status };
  return { tipo: 'ja_recebida', codigo: atual.codigo, status: atual.status, recebidaEm: atual.recebidaEm };
}

/** Rastreio sem cadastro (spec §6.2): nasce em "Aguardando conferência", marcada como não identificada, sem canal. */
export async function criarNaoIdentificada(
  db: DbOuTx,
  rastreioBruto: string,
  usuario: UsuarioSessao,
  agora: Date = new Date(),
): Promise<{ id: string; codigo: string }> {
  exigirTransicao({ de: null, para: 'AGUARDANDO_CONFERENCIA', ator: usuario.perfil, naoIdentificada: true });
  const rastreio = rastreioOuErro(rastreioBruto);
  const existente = await maisRecentePorRastreio(db, rastreio);
  if (existente) throw new ErroDevolucao(`Já existe a devolução ${existente.codigo} com este rastreio. Registre a chegada por ela.`);
  return db.transaction(async (tx) => {
    const [criada] = await tx
      .insert(devolucoes)
      .values({
        origem: 'MANUAL',
        rastreio,
        status: 'AGUARDANDO_CONFERENCIA',
        naoIdentificada: true,
        criadoPor: usuario.id,
        criadaEm: agora,
        recebidaEm: agora,
        recebidaPor: usuario.id,
        atualizadaEm: agora,
      })
      .returning({ id: devolucoes.id, codigo: devolucoes.codigo });
    await registrarEvento(tx, {
      entidade: 'devolucao',
      entidadeId: criada.id,
      acao: 'criada_nao_identificada',
      de: null,
      para: 'AGUARDANDO_CONFERENCIA',
      usuarioId: usuario.id,
      dados: { rastreio },
      em: agora,
    });
    return criada;
  });
}
```

- [ ] **Passo 3: Implementar cancelamento, extravio e identificação**

`src/modules/devolucoes/excecoes.ts`:

```ts
import { and, eq, sql } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { devolucoes, itensDevolucao } from '@/db/schema';
import { ehUuid } from '@/lib/uuid';
import { pode } from '@/modules/auth/permissoes';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { idsDosProdutos } from '@/modules/catalogo/produtos';
import { registrarEvento } from '@/modules/historico/eventos';
import { chavePedido, codigosAtivosPorPedido, expandirUnidades, validarNovaDevolucao, type EntradaNovaDevolucao } from './criar';
import { ErroDevolucao } from './erros';
import { exigirTransicao } from './transicoes';

/** Spec §5.2: Pendente de chegada → Cancelada ou Extraviada, por ação manual do Gestor, com motivo no histórico. */
export async function encerrarPendente(
  db: DbOuTx,
  id: string,
  para: 'CANCELADA' | 'EXTRAVIADA',
  motivoBruto: string,
  usuario: UsuarioSessao,
  agora: Date = new Date(),
): Promise<void> {
  exigirTransicao({ de: 'PENDENTE_CHEGADA', para, ator: usuario.perfil });
  const motivo = motivoBruto.trim();
  if (motivo.length < 3) throw new ErroDevolucao('Explique o motivo (pelo menos 3 letras).');
  if (motivo.length > 500) throw new ErroDevolucao('Motivo: no máximo 500 caracteres.');
  if (!ehUuid(id)) throw new ErroDevolucao('Devolução não encontrada.');
  await db.transaction(async (tx) => {
    const [atualizada] = await tx
      .update(devolucoes)
      .set({ status: para, atualizadaEm: agora })
      .where(and(eq(devolucoes.id, id), eq(devolucoes.status, 'PENDENTE_CHEGADA')))
      .returning({ id: devolucoes.id });
    if (!atualizada) throw new ErroDevolucao('Só dá para cancelar ou marcar como extraviada uma devolução Pendente de chegada.');
    await registrarEvento(tx, {
      entidade: 'devolucao',
      entidadeId: id,
      acao: para === 'CANCELADA' ? 'cancelada' : 'extraviada',
      de: 'PENDENTE_CHEGADA',
      para,
      usuarioId: usuario.id,
      dados: { motivo },
      em: agora,
    });
  });
}

/**
 * Spec §5.2: depois que o pedido certo é descoberto, o Gestor liga o pacote não identificado a ele e a marca sai.
 * Preenche canal, pedido, reclamação, transportadora e (opcionalmente) os itens. "Juntar duas devoluções" fica para depois.
 */
export async function identificarDevolucao(
  db: DbOuTx,
  id: string,
  entrada: EntradaNovaDevolucao,
  usuario: UsuarioSessao,
  agora: Date = new Date(),
): Promise<void> {
  if (!pode(usuario.perfil, 'administrar')) throw new ErroDevolucao('Só o Gestor identifica um pacote não identificado.');
  if (!ehUuid(id)) throw new ErroDevolucao('Devolução não encontrada.');
  const { dados, erros } = validarNovaDevolucao(entrada, { exigirItens: false });
  if (!dados) throw new ErroDevolucao(erros.join('; '));
  const outra = (await codigosAtivosPorPedido(db, [{ canal: dados.canal, pedido: dados.pedido }])).get(chavePedido(dados.canal, dados.pedido));
  if (outra) {
    throw new ErroDevolucao(`O pedido já tem a devolução ${outra}. Se ela ainda está pendente de chegada, cancele-a e tente de novo.`);
  }
  const unidades = expandirUnidades(dados.itens);
  const produtosPorSku = await idsDosProdutos(db, [...new Set(unidades)]);

  await db.transaction(async (tx) => {
    const [atualizada] = await tx
      .update(devolucoes)
      .set({
        canal: dados.canal,
        pedidosExternos: [dados.pedido],
        reclamacaoId: dados.reclamacaoId,
        transportadora: dados.transportadora,
        naoIdentificada: false,
        atualizadaEm: agora,
      })
      .where(and(eq(devolucoes.id, id), eq(devolucoes.naoIdentificada, true)))
      .returning({ id: devolucoes.id });
    if (!atualizada) throw new ErroDevolucao('Esta devolução já foi identificada.');
    if (unidades.length > 0) {
      const [{ maior }] = await tx
        .select({ maior: sql<number>`coalesce(max(${itensDevolucao.unidade}), 0)::int` })
        .from(itensDevolucao)
        .where(eq(itensDevolucao.devolucaoId, id));
      await tx.insert(itensDevolucao).values(
        unidades.map((sku, i) => ({ devolucaoId: id, unidade: maior + i + 1, sku, produtoEsperadoId: produtosPorSku.get(sku) ?? null })),
      );
    }
    await registrarEvento(tx, {
      entidade: 'devolucao',
      entidadeId: id,
      acao: 'identificada',
      usuarioId: usuario.id,
      dados: { canal: dados.canal, pedido: dados.pedido, unidades: unidades.length },
      em: agora,
    });
  });
}
```

- [ ] **Passo 4: Implementar o detalhe**

`src/modules/devolucoes/detalhe.ts`:

```ts
import { asc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { DbOuTx } from '@/db/client';
import { devolucoes, fornecedores, itensDevolucao, produtos, usuarios } from '@/db/schema';
import { listarEventos } from '@/modules/historico/eventos';

/** Tudo o que a página de detalhe mostra: dados, unidades e histórico. */
export async function obterDetalhe(db: DbOuTx, codigo: string) {
  const criador = alias(usuarios, 'criador');
  const recebedor = alias(usuarios, 'recebedor');
  const [d] = await db
    .select({
      id: devolucoes.id,
      codigo: devolucoes.codigo,
      canal: devolucoes.canal,
      origem: devolucoes.origem,
      tipo: devolucoes.tipo,
      status: devolucoes.status,
      pedidos: devolucoes.pedidosExternos,
      reclamacaoId: devolucoes.reclamacaoId,
      rastreio: devolucoes.rastreio,
      transportadora: devolucoes.transportadora,
      motivoCliente: devolucoes.motivoCliente,
      postadaEm: devolucoes.postadaEm,
      naoIdentificada: devolucoes.naoIdentificada,
      entregueSegundoCanalEm: devolucoes.entregueSegundoCanalEm,
      criadaEm: devolucoes.criadaEm,
      recebidaEm: devolucoes.recebidaEm,
      criadoPorNome: criador.nome,
      recebidaPorNome: recebedor.nome,
    })
    .from(devolucoes)
    .leftJoin(criador, eq(criador.id, devolucoes.criadoPor))
    .leftJoin(recebedor, eq(recebedor.id, devolucoes.recebidaPor))
    .where(eq(devolucoes.codigo, codigo.trim().toUpperCase()))
    .limit(1);
  if (!d) return null;
  const itens = await db
    .select({
      id: itensDevolucao.id,
      unidade: itensDevolucao.unidade,
      sku: itensDevolucao.sku,
      serial: itensDevolucao.serial,
      status: itensDevolucao.status,
      descricao: produtos.descricao,
      ean: produtos.ean,
      fornecedor: fornecedores.razaoSocial,
    })
    .from(itensDevolucao)
    .leftJoin(produtos, eq(produtos.id, itensDevolucao.produtoEsperadoId))
    .leftJoin(fornecedores, eq(fornecedores.id, produtos.fornecedorId))
    .where(eq(itensDevolucao.devolucaoId, d.id))
    .orderBy(asc(itensDevolucao.unidade));
  const eventos = await listarEventos(db, 'devolucao', d.id);
  return { ...d, itens, eventos };
}

export type DetalheDevolucao = NonNullable<Awaited<ReturnType<typeof obterDetalhe>>>;
```

- [ ] **Passo 5: Rodar e confirmar que passa**

Rode: `npm run test:int && npm run typecheck && npm run lint`
Esperado: tudo PASS.

- [ ] **Passo 6: Commit**

```bash
cd "/c/Users/idmpc/Dvoluções Markt"
git add -A
git commit -m "feat: recebimento por rastreio, pacote não identificado, cancelamento/extravio e detalhe" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 9: Busca Avançada (filtros do PDF, consulta, cartões e painel "Filtros" no celular)

**Arquivos:**
- Criar: `src/modules/devolucoes/filtros.ts`, `src/modules/devolucoes/selos.ts`, `src/modules/devolucoes/busca.ts`
- Criar: `src/components/Selo.tsx`, `src/components/CartaoDevolucao.tsx`, `src/components/BuscaAvancada.tsx`, `src/components/ListaDevolucoes.tsx`
- Testes: `src/modules/devolucoes/filtros.test.ts`, `src/modules/devolucoes/selos.test.ts`, `src/modules/devolucoes/busca.int.test.ts`, `src/components/CartaoDevolucao.test.tsx`, `src/components/BuscaAvancada.test.tsx`

**Interfaces:**
- Consome: `primeiroValor`, `ParametrosBusca`, `formatarDiaMes`, `formatarDataIso`, `Paginacao`, estilos (Tarefa 5); `ehCanal`, `ehStatus`, `ROTULO_CANAL`, `ROTULO_STATUS`, `CANAIS`, `STATUS_DEVOLUCAO`, `normalizarRastreio`, `devolucoes`, `itensDevolucao`, `criarDevolucaoTeste` (Tarefa 7); `escaparLike`, `somenteDigitos`, `produtos`, `fornecedores`, fábricas (Tarefa 2)
- Produz:
  - em `filtros.ts`: `POR_PAGINA_DEVOLUCOES = 30`, `type FiltrosBusca = { rastreio?; pedido?; reclamacao?; canal?: Canal; status?: StatusDevolucao; fornecedor?; codigo?; de?; ate? }`, `type ChaveFiltro`, `lerFiltros(parametros): FiltrosBusca`, `temFiltro(f): boolean`, `filtrosParaQuery(f, extra?): string` (com `?` ou vazio), `semFiltro(f, chave)`, `descreverFiltros(f): { chave: ChaveFiltro; texto: string }[]`
  - em `selos.ts`: `type TomSelo = 'erro' | 'atencao' | 'destaque' | 'neutro'`, `type DadosSelo = { texto: string; tom: TomSelo }`, `selosDaDevolucao(d, agora): DadosSelo[]`, `TOM_DO_STATUS`
  - em `busca.ts`: `type ResumoDevolucao = { id; codigo; canal: Canal | null; status; rastreio: string | null; pedidos: string[]; produto: string | null; unidades: number; naoIdentificada: boolean; criadaEm: Date; recebidaEm: Date | null; selos: DadosSelo[] }`, `type OpcoesBusca = { status?: readonly StatusDevolucao[]; ordem?: 'recentes' | 'chegada'; pagina?: number; porPagina?: number; agora?: Date }`, `buscarDevolucoes(db, filtros, opcoes?): Promise<{ devolucoes: ResumoDevolucao[]; total: number }>`
  - componentes: `Selo({ texto, tom })`, `CartaoDevolucao({ devolucao })`, `BuscaAvancada({ acao, filtros })` (client), `ListaDevolucoes({ titulo, acaoBusca, filtros, devolucoes, total, pagina, acoes? })`

- [ ] **Passo 1: Escrever os testes unitários que falham**

`src/modules/devolucoes/filtros.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { descreverFiltros, filtrosParaQuery, lerFiltros, semFiltro, temFiltro } from './filtros';

describe('filtros da Busca Avançada', () => {
  it('lê da URL só o que é válido', () => {
    expect(
      lerFiltros({ rastreio: ' br1 ', pedido: '', canal: 'AMAZON', status: 'XX', de: '2026-11-01', ate: '01/11/2026', codigo: ['789', 'x'] }),
    ).toEqual({ rastreio: 'br1', canal: 'AMAZON', codigo: '789', de: '2026-11-01' });
    expect(temFiltro({})).toBe(false);
    expect(temFiltro({ status: 'CANCELADA' })).toBe(true);
  });

  it('volta para a URL, com parâmetros extras', () => {
    expect(filtrosParaQuery({ rastreio: 'BR 1', canal: 'SHOPEE' }, { pagina: '2' })).toBe('?rastreio=BR+1&canal=SHOPEE&pagina=2');
    expect(filtrosParaQuery({})).toBe('');
    expect(semFiltro({ rastreio: 'A', canal: 'SHOPEE' }, 'rastreio')).toEqual({ canal: 'SHOPEE' });
  });

  it('descreve os filtros ativos para as etiquetas', () => {
    expect(descreverFiltros({ de: '2026-11-01', canal: 'MAGALU', status: 'PENDENTE_CHEGADA', rastreio: 'BR1' })).toEqual([
      { chave: 'rastreio', texto: 'Rastreio: BR1' },
      { chave: 'canal', texto: 'Marketplace: Magalu' },
      { chave: 'status', texto: 'Status: Pendente de chegada' },
      { chave: 'de', texto: 'De: 01/11/2026' },
    ]);
  });
});
```

`src/modules/devolucoes/selos.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { selosDaDevolucao } from './selos';

const AGORA = new Date('2026-11-12T12:00:00Z');
const BASE = {
  canal: 'MERCADO_LIVRE' as const,
  status: 'PENDENTE_CHEGADA' as const,
  naoIdentificada: false,
  entregueSegundoCanalEm: null,
  prazoConferenciaCanal: null,
};

describe('selosDaDevolucao (cartão do protótipo C)', () => {
  it('sem nada a destacar', () => {
    expect(selosDaDevolucao(BASE, AGORA)).toEqual([]);
  });

  it('pacote não identificado', () => {
    expect(selosDaDevolucao({ ...BASE, canal: null, naoIdentificada: true, status: 'AGUARDANDO_CONFERENCIA' }, AGORA)).toEqual([
      { texto: 'Não identificada', tom: 'erro' },
    ]);
  });

  it('"Entregue (ML)" só enquanto o pacote não chegou fisicamente (spec §5.2)', () => {
    const entregue = { ...BASE, entregueSegundoCanalEm: new Date('2026-11-11T10:00:00Z') };
    expect(selosDaDevolucao(entregue, AGORA)).toEqual([{ texto: 'Entregue (ML)', tom: 'atencao' }]);
    expect(selosDaDevolucao({ ...entregue, status: 'AGUARDANDO_CONFERENCIA' }, AGORA)).toEqual([]);
  });

  it('prazo do canal: vermelho quando falta 1 dia ou menos', () => {
    expect(selosDaDevolucao({ ...BASE, prazoConferenciaCanal: new Date('2026-11-13T06:00:00Z') }, AGORA)).toEqual([
      { texto: 'Prazo 13/11', tom: 'erro' },
    ]);
    expect(selosDaDevolucao({ ...BASE, prazoConferenciaCanal: new Date('2026-11-20T12:00:00Z') }, AGORA)).toEqual([
      { texto: 'Prazo 20/11', tom: 'neutro' },
    ]);
  });
});
```

`src/components/CartaoDevolucao.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ResumoDevolucao } from '@/modules/devolucoes/busca';
import { CartaoDevolucao } from './CartaoDevolucao';

const BASE: ResumoDevolucao = {
  id: '1',
  codigo: 'DEV-000001',
  canal: 'SHOPEE',
  status: 'PENDENTE_CHEGADA',
  rastreio: 'BR123',
  pedidos: ['SHP-1'],
  produto: 'Fone Bluetooth',
  unidades: 3,
  naoIdentificada: false,
  criadaEm: new Date('2026-11-12T12:00:00Z'),
  recebidaEm: null,
  selos: [{ texto: 'Entregue (ML)', tom: 'atencao' }],
};

describe('CartaoDevolucao', () => {
  it('mostra código, canal, produto, rastreio e selos, e o cartão inteiro leva ao detalhe', () => {
    render(<CartaoDevolucao devolucao={BASE} />);
    expect(screen.getByRole('link').getAttribute('href')).toBe('/fluxo/devolucoes/DEV-000001');
    for (const texto of ['DEV-000001', 'Shopee', 'Fone Bluetooth + 2 unidades', 'BR123', 'Entregue (ML)']) {
      expect(screen.getByText(texto)).toBeTruthy();
    }
  });

  it('pacote não identificado, sem canal e sem itens', () => {
    render(<CartaoDevolucao devolucao={{ ...BASE, canal: null, produto: null, unidades: 0, rastreio: null, selos: [] }} />);
    expect(screen.getByText('Canal a identificar')).toBeTruthy();
    expect(screen.getByText('Sem itens cadastrados')).toBeTruthy();
    expect(screen.getByText('Sem rastreio')).toBeTruthy();
  });
});
```

`src/components/BuscaAvancada.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BuscaAvancada } from './BuscaAvancada';

describe('BuscaAvancada (spec §6.7)', () => {
  it('tem os filtros do PDF, com os nomes exatos, num formulário GET', () => {
    render(<BuscaAvancada acao="/fluxo/etapa/1" filtros={{}} />);
    const formulario = screen.getByRole('search', { name: 'Busca Avançada' });
    expect(formulario.getAttribute('method')).toBe('get');
    expect(formulario.getAttribute('action')).toBe('/fluxo/etapa/1');
    expect(Array.from(formulario.querySelectorAll('legend')).map((l) => l.textContent)).toEqual([
      'Código de Rastreamento',
      'Número do Pedido e ID da Reclamação/Mediação',
      'Marketplace de Origem e Status Operacional Atual',
      'Fornecedor ou Código de Barras / Serial Number',
      'Período',
    ]);
    expect(screen.getByRole('combobox', { name: 'Marketplace de Origem' }).querySelectorAll('option')).toHaveLength(7);
    expect(screen.getByRole('combobox', { name: 'Status Operacional Atual' }).querySelectorAll('option')).toHaveLength(9);
  });

  it('no celular fica atrás do botão "Filtros", que abre e fecha o painel', () => {
    render(<BuscaAvancada acao="/fluxo/busca" filtros={{}} />);
    const botao = screen.getByRole('button', { name: 'Filtros' });
    expect(botao.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(botao);
    expect(botao.getAttribute('aria-expanded')).toBe('true');
  });

  it('mostra os filtros ativos como etiquetas que se removem com um toque, e preenche o formulário', () => {
    render(<BuscaAvancada acao="/fluxo/busca" filtros={{ rastreio: 'BR1', canal: 'SHOPEE' }} />);
    expect(screen.getByRole('button', { name: 'Filtros (2)' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Remover filtro Rastreio: BR1' }).getAttribute('href')).toBe('/fluxo/busca?canal=SHOPEE');
    expect((screen.getByRole('textbox', { name: 'Código de Rastreamento' }) as HTMLInputElement).value).toBe('BR1');
  });
});
```

Rode: `npm test`
Esperado: FAIL (os módulos ainda não existem).

- [ ] **Passo 2: Implementar filtros e selos**

`src/modules/devolucoes/filtros.ts`:

```ts
import { formatarDataIso } from '@/lib/formatar';
import { primeiroValor, type ParametrosBusca } from '@/lib/parametros';
import { ehCanal, ehStatus, ROTULO_CANAL, ROTULO_STATUS, type Canal, type StatusDevolucao } from './dominio';

export const POR_PAGINA_DEVOLUCOES = 30;

/** Busca Avançada (spec §6.7). Os nomes na tela são os do PDF; aqui ficam as chaves da URL. */
export type FiltrosBusca = {
  rastreio?: string;
  pedido?: string;
  reclamacao?: string;
  canal?: Canal;
  status?: StatusDevolucao;
  fornecedor?: string;
  codigo?: string;
  /** (extra) Período, pela data de cadastro: "2026-11-01". */
  de?: string;
  ate?: string;
};
export type ChaveFiltro = keyof FiltrosBusca;

const ORDEM: ChaveFiltro[] = ['rastreio', 'pedido', 'reclamacao', 'canal', 'status', 'fornecedor', 'codigo', 'de', 'ate'];
const ROTULO_FILTRO: Record<ChaveFiltro, string> = {
  rastreio: 'Rastreio',
  pedido: 'Pedido',
  reclamacao: 'Reclamação',
  canal: 'Marketplace',
  status: 'Status',
  fornecedor: 'Fornecedor',
  codigo: 'Código',
  de: 'De',
  ate: 'Até',
};
const TEXTO_MAXIMO = 100;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

export function lerFiltros(parametros: ParametrosBusca): FiltrosBusca {
  const f: FiltrosBusca = {};
  for (const chave of ['rastreio', 'pedido', 'reclamacao', 'fornecedor', 'codigo'] as const) {
    const valor = primeiroValor(parametros[chave]).slice(0, TEXTO_MAXIMO);
    if (valor) f[chave] = valor;
  }
  const canal = primeiroValor(parametros.canal);
  if (ehCanal(canal)) f.canal = canal;
  const status = primeiroValor(parametros.status);
  if (ehStatus(status)) f.status = status;
  for (const chave of ['de', 'ate'] as const) {
    const valor = primeiroValor(parametros[chave]);
    if (DATA.test(valor)) f[chave] = valor;
  }
  return f;
}

export function temFiltro(f: FiltrosBusca): boolean {
  return Object.keys(f).length > 0;
}

/** "?rastreio=BR1&pagina=2", ou "" quando não há nada. */
export function filtrosParaQuery(f: FiltrosBusca, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams();
  for (const [chave, valor] of Object.entries({ ...f, ...extra })) {
    if (valor) p.set(chave, valor);
  }
  const texto = p.toString();
  return texto ? `?${texto}` : '';
}

export function semFiltro(f: FiltrosBusca, chave: ChaveFiltro): FiltrosBusca {
  const copia = { ...f };
  delete copia[chave];
  return copia;
}

/** Etiquetas dos filtros ativos. No celular elas ficam à vista mesmo com o painel fechado. */
export function descreverFiltros(f: FiltrosBusca): { chave: ChaveFiltro; texto: string }[] {
  return ORDEM.flatMap((chave) => {
    const valor = f[chave];
    if (!valor) return [];
    let mostrado: string = valor;
    if (chave === 'canal' && f.canal) mostrado = ROTULO_CANAL[f.canal];
    if (chave === 'status' && f.status) mostrado = ROTULO_STATUS[f.status];
    if (chave === 'de' || chave === 'ate') mostrado = formatarDataIso(valor);
    return [{ chave, texto: `${ROTULO_FILTRO[chave]}: ${mostrado}` }];
  });
}
```

`src/modules/devolucoes/selos.ts`:

```ts
import { formatarDiaMes } from '@/lib/formatar';
import type { Canal, StatusDevolucao } from './dominio';

export type TomSelo = 'erro' | 'atencao' | 'destaque' | 'neutro';
export type DadosSelo = { texto: string; tom: TomSelo };

type Entrada = {
  canal: Canal | null;
  status: StatusDevolucao;
  naoIdentificada: boolean;
  entregueSegundoCanalEm: Date | null;
  prazoConferenciaCanal: Date | null;
};

const UM_DIA_MS = 24 * 60 * 60 * 1000;
const ANTES_DA_CONFERENCIA: StatusDevolucao[] = ['PENDENTE_CHEGADA', 'AGUARDANDO_CONFERENCIA', 'EM_CONFERENCIA'];

/** Selos do cartão (spec §6.0: prazo, entregue pelo ML etc.). Calculados aqui, fora do componente, porque dependem da hora. */
export function selosDaDevolucao(d: Entrada, agora: Date): DadosSelo[] {
  const selos: DadosSelo[] = [];
  if (d.naoIdentificada) selos.push({ texto: 'Não identificada', tom: 'erro' });
  if (d.entregueSegundoCanalEm && d.status === 'PENDENTE_CHEGADA') {
    selos.push({ texto: d.canal === 'MERCADO_LIVRE' ? 'Entregue (ML)' : 'Entregue pelo canal', tom: 'atencao' });
  }
  if (d.prazoConferenciaCanal && ANTES_DA_CONFERENCIA.includes(d.status)) {
    const vencendo = d.prazoConferenciaCanal.getTime() - agora.getTime() <= UM_DIA_MS;
    selos.push({ texto: `Prazo ${formatarDiaMes(d.prazoConferenciaCanal)}`, tom: vencendo ? 'erro' : 'neutro' });
  }
  return selos;
}

export const TOM_DO_STATUS: Record<StatusDevolucao, TomSelo> = {
  PENDENTE_CHEGADA: 'neutro',
  AGUARDANDO_CONFERENCIA: 'destaque',
  EM_CONFERENCIA: 'destaque',
  AGUARDANDO_NF: 'destaque',
  CONCLUIDA: 'neutro',
  CANCELADA: 'erro',
  EXTRAVIADA: 'erro',
  NO_CD_MARKETPLACE: 'atencao',
};
```

- [ ] **Passo 3: Implementar os componentes**

`src/components/Selo.tsx`:

```tsx
import type { TomSelo } from '@/modules/devolucoes/selos';

const CLASSES: Record<TomSelo, string> = {
  erro: 'bg-erro-suave text-erro',
  atencao: 'bg-atencao-suave text-atencao',
  destaque: 'bg-destaque-suave text-destaque',
  neutro: 'bg-fundo text-texto-2',
};

export function Selo({ texto, tom }: { texto: string; tom: TomSelo }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${CLASSES[tom]}`}>{texto}</span>;
}
```

`src/components/CartaoDevolucao.tsx`:

```tsx
import Link from 'next/link';
import type { ResumoDevolucao } from '@/modules/devolucoes/busca';
import { ROTULO_CANAL } from '@/modules/devolucoes/dominio';
import { Selo } from './Selo';

/** Cartão do quadro e das listas (protótipo C-Painel): código, canal, produto, rastreio e selos. O cartão inteiro é o link. */
export function CartaoDevolucao({ devolucao: d }: { devolucao: ResumoDevolucao }) {
  const outras = d.unidades - 1;
  return (
    <Link
      href={`/fluxo/devolucoes/${d.codigo}`}
      className="flex min-h-11 flex-col gap-1.5 rounded-lg border border-borda bg-superficie p-3 hover:border-destaque"
    >
      <span className="flex items-center justify-between gap-2">
        <span className="font-mono text-[13px] font-semibold">{d.codigo}</span>
        <span className="text-xs font-semibold text-texto-2">{d.canal ? ROTULO_CANAL[d.canal] : 'Canal a identificar'}</span>
      </span>
      <span className="text-sm">
        {d.produto ?? 'Sem itens cadastrados'}
        {outras > 0 ? ` + ${outras} ${outras === 1 ? 'unidade' : 'unidades'}` : ''}
      </span>
      <span className="break-all font-mono text-xs text-texto-2">{d.rastreio ?? 'Sem rastreio'}</span>
      {d.selos.length > 0 && (
        <span className="flex flex-wrap gap-1.5">
          {d.selos.map((s) => (
            <Selo key={s.texto} texto={s.texto} tom={s.tom} />
          ))}
        </span>
      )}
    </Link>
  );
}
```

`src/components/BuscaAvancada.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CANAIS, ROTULO_CANAL, ROTULO_STATUS, STATUS_DEVOLUCAO } from '@/modules/devolucoes/dominio';
import { descreverFiltros, filtrosParaQuery, semFiltro, type FiltrosBusca } from '@/modules/devolucoes/filtros';
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, CAMPO, ROTULO } from './estilos';

const GRUPO = 'flex min-w-0 flex-col gap-3 rounded-lg border border-borda p-3';
const LEGENDA = 'px-1 text-[13px] font-bold';

type PropsCampo = { nome: string; rotulo: string; valor?: string; mono?: boolean; tipo?: 'text' | 'date'; dica?: string };

function Campo({ nome, rotulo, valor, mono = false, tipo = 'text', dica }: PropsCampo) {
  const id = `filtro-${nome}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={ROTULO}>
        {rotulo}
      </label>
      <input
        id={id}
        name={nome}
        type={tipo}
        defaultValue={valor ?? ''}
        placeholder={dica}
        autoComplete="off"
        spellCheck={mono ? false : undefined}
        autoCapitalize={mono ? 'characters' : undefined}
        className={`${CAMPO}${mono ? ' font-mono' : ''}`}
      />
    </div>
  );
}

function Escolha({ nome, rotulo, valor, opcoes }: { nome: string; rotulo: string; valor?: string; opcoes: [string, string][] }) {
  const id = `filtro-${nome}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={ROTULO}>
        {rotulo}
      </label>
      <select id={id} name={nome} defaultValue={valor ?? ''} className={CAMPO}>
        <option value="">Todos</option>
        {opcoes.map(([codigo, texto]) => (
          <option key={codigo} value={codigo}>
            {texto}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Busca Avançada do PDF (spec §6.7). Formulário GET: os filtros ficam no endereço e funcionam sem JavaScript.
 * Celular: atrás do botão "Filtros", com as etiquetas dos filtros ativos sempre à vista. Computador (md+): aberto.
 */
export function BuscaAvancada({ acao, filtros }: { acao: string; filtros: FiltrosBusca }) {
  const [aberta, setAberta] = useState(false);
  const ativos = descreverFiltros(filtros);
  return (
    <section aria-labelledby="titulo-busca" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-expanded={aberta}
          aria-controls="painel-busca"
          onClick={() => setAberta((atual) => !atual)}
          className={`${BOTAO_SECUNDARIO} md:hidden`}
        >
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M3 5h18M6 12h12M10 19h4" />
          </svg>
          Filtros{ativos.length > 0 ? ` (${ativos.length})` : ''}
        </button>
        {ativos.map((a) => (
          <Link
            key={a.chave}
            href={`${acao}${filtrosParaQuery(semFiltro(filtros, a.chave))}`}
            aria-label={`Remover filtro ${a.texto}`}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-destaque-suave px-3 text-sm font-semibold text-destaque"
          >
            {a.texto}
            <span aria-hidden="true">×</span>
          </Link>
        ))}
      </div>
      <div id="painel-busca" className={`${aberta ? 'flex' : 'hidden'} flex-col gap-3 rounded-xl border border-borda bg-superficie p-4 md:flex`}>
        <h2 id="titulo-busca" className="text-base font-bold">
          Busca Avançada
        </h2>
        <form method="get" action={acao} role="search" aria-labelledby="titulo-busca" className="flex flex-col gap-3">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <fieldset className={GRUPO}>
              <legend className={LEGENDA}>Código de Rastreamento</legend>
              <Campo nome="rastreio" rotulo="Código de Rastreamento" valor={filtros.rastreio} mono />
            </fieldset>
            <fieldset className={GRUPO}>
              <legend className={LEGENDA}>Número do Pedido e ID da Reclamação/Mediação</legend>
              <Campo nome="pedido" rotulo="Número do Pedido" valor={filtros.pedido} mono />
              <Campo nome="reclamacao" rotulo="ID da Reclamação/Mediação" valor={filtros.reclamacao} mono />
            </fieldset>
            <fieldset className={GRUPO}>
              <legend className={LEGENDA}>Marketplace de Origem e Status Operacional Atual</legend>
              <Escolha nome="canal" rotulo="Marketplace de Origem" valor={filtros.canal} opcoes={CANAIS.map((c) => [c, ROTULO_CANAL[c]])} />
              <Escolha
                nome="status"
                rotulo="Status Operacional Atual"
                valor={filtros.status}
                opcoes={STATUS_DEVOLUCAO.map((s) => [s, ROTULO_STATUS[s]])}
              />
            </fieldset>
            <fieldset className={GRUPO}>
              <legend className={LEGENDA}>Fornecedor ou Código de Barras / Serial Number</legend>
              <Campo nome="fornecedor" rotulo="Fornecedor" valor={filtros.fornecedor} dica="Nome ou CNPJ" />
              <Campo nome="codigo" rotulo="Código de Barras / Serial Number" valor={filtros.codigo} mono />
            </fieldset>
            <fieldset className={GRUPO}>
              <legend className={LEGENDA}>Período</legend>
              <div className="grid grid-cols-2 gap-3">
                <Campo nome="de" rotulo="De" valor={filtros.de} tipo="date" />
                <Campo nome="ate" rotulo="Até" valor={filtros.ate} tipo="date" />
              </div>
            </fieldset>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <button type="submit" className={BOTAO_PRIMARIO}>
              Buscar
            </button>
            <Link href={acao} className={BOTAO_SECUNDARIO}>
              Limpar
            </Link>
          </div>
        </form>
      </div>
    </section>
  );
}
```

`src/components/ListaDevolucoes.tsx`:

```tsx
import type { ReactNode } from 'react';
import type { ResumoDevolucao } from '@/modules/devolucoes/busca';
import { filtrosParaQuery, POR_PAGINA_DEVOLUCOES, type FiltrosBusca } from '@/modules/devolucoes/filtros';
import { BuscaAvancada } from './BuscaAvancada';
import { CartaoDevolucao } from './CartaoDevolucao';
import { Paginacao } from './Paginacao';
import { VAZIO } from './estilos';

type Props = {
  titulo: string;
  /** Endereço da própria lista: a Busca Avançada e a paginação voltam para ele. */
  acaoBusca: string;
  filtros: FiltrosBusca;
  devolucoes: ResumoDevolucao[];
  total: number;
  pagina: number;
  acoes?: ReactNode;
};

/** Lista de devoluções em cartões (mobile-first), com a Busca Avançada no topo (spec §6.7: "disponível em todas as listas"). */
export function ListaDevolucoes({ titulo, acaoBusca, filtros, devolucoes, total, pagina, acoes }: Props) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">{titulo}</h1>
        {acoes && <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto">{acoes}</div>}
      </div>
      <BuscaAvancada acao={acaoBusca} filtros={filtros} />
      <p className="text-sm text-texto-2">
        {total} {total === 1 ? 'devolução' : 'devoluções'}
      </p>
      {devolucoes.length === 0 ? (
        <p className={VAZIO}>Nenhuma devolução encontrada.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {devolucoes.map((d) => (
            <li key={d.id}>
              <CartaoDevolucao devolucao={d} />
            </li>
          ))}
        </ul>
      )}
      <Paginacao
        pagina={pagina}
        total={total}
        porPagina={POR_PAGINA_DEVOLUCOES}
        hrefDaPagina={(p) => `${acaoBusca}${filtrosParaQuery(filtros, { pagina: String(p) })}`}
      />
    </div>
  );
}
```

Rode: `npm test`
Esperado: PASS dos testes de filtros, selos e componentes (o `busca.ts` só é importado como tipo).

- [ ] **Passo 4: Escrever o teste de integração que falha**

`src/modules/devolucoes/busca.int.test.ts`:

```ts
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { devolucoes, itensDevolucao } from '@/db/schema';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import {
  criarDevolucaoTeste,
  criarFornecedorTeste,
  criarProdutoTeste,
  criarUsuarioTeste,
} from '../../../tests/helpers/fabricas';
import { buscarDevolucoes, type OpcoesBusca } from './busca';
import type { DevolucaoCriada } from './criar';
import type { FiltrosBusca } from './filtros';

const { db, sql } = criarDbTeste();
let a: DevolucaoCriada;
let b: DevolucaoCriada;
let c: DevolucaoCriada;

async function codigos(filtros: FiltrosBusca, opcoes: OpcoesBusca = {}) {
  return (await buscarDevolucoes(db, filtros, opcoes)).devolucoes.map((d) => d.codigo).sort();
}

beforeEach(async () => {
  await limparTabelas(sql);
  const operador = await criarUsuarioTeste(db, 'OPERADOR');
  await criarFornecedorTeste(db, { razaoSocial: 'Alfa Eletrônicos Ltda', cnpj: '11222333000181' });
  await criarProdutoTeste(db, { sku: 'FONE-01', descricao: 'Fone Bluetooth', ean: '7891000000014', cnpjFornecedor: '11222333000181' });
  a = await criarDevolucaoTeste(db, operador, {
    canal: 'SHOPEE',
    pedido: 'SHP-100',
    reclamacaoId: 'REC-9',
    rastreio: 'BR111222333',
    itens: [{ sku: 'FONE-01', quantidade: 2 }],
  });
  b = await criarDevolucaoTeste(db, operador, { canal: 'AMAZON', pedido: 'AMZ-200', rastreio: 'AM999', itens: [{ sku: 'OUTRO-1', quantidade: 1 }] });
  c = await criarDevolucaoTeste(db, operador, { canal: 'MAGALU', pedido: 'MGL-300', rastreio: 'MG555' });
  await db.update(devolucoes).set({ status: 'AGUARDANDO_CONFERENCIA' }).where(eq(devolucoes.id, c.id));
});
afterAll(async () => {
  await sql.end();
});

describe('buscarDevolucoes (Busca Avançada, spec §6.7)', () => {
  it('sem filtro traz todas, da mais nova para a mais antiga', async () => {
    const r = await buscarDevolucoes(db, {});
    expect(r.total).toBe(3);
    expect(r.devolucoes.map((d) => d.codigo)).toEqual([c.codigo, b.codigo, a.codigo]);
  });

  it('Código de Rastreamento: parte do código, sem diferenciar maiúsculas', async () => {
    expect(await codigos({ rastreio: 'br111' })).toEqual([a.codigo]);
  });

  it('Número do Pedido e ID da Reclamação/Mediação', async () => {
    expect(await codigos({ pedido: 'amz' })).toEqual([b.codigo]);
    expect(await codigos({ reclamacao: 'rec-9' })).toEqual([a.codigo]);
  });

  it('Marketplace de Origem e Status Operacional Atual', async () => {
    expect(await codigos({ canal: 'SHOPEE' })).toEqual([a.codigo]);
    expect(await codigos({ status: 'AGUARDANDO_CONFERENCIA' })).toEqual([c.codigo]);
  });

  it('Fornecedor: pelo nome ou pelo CNPJ', async () => {
    expect(await codigos({ fornecedor: 'alfa' })).toEqual([a.codigo]);
    expect(await codigos({ fornecedor: '11.222.333' })).toEqual([a.codigo]);
    expect(await codigos({ fornecedor: 'Beta' })).toEqual([]);
  });

  it('Código de Barras / Serial Number', async () => {
    expect(await codigos({ codigo: '7891000000014' })).toEqual([a.codigo]);
    await db.update(itensDevolucao).set({ serial: 'SN-XYZ' }).where(eq(itensDevolucao.devolucaoId, b.id));
    expect(await codigos({ codigo: 'sn-xyz' })).toEqual([b.codigo]);
  });

  it('(extra) Período: pela data de cadastro, no horário de Brasília', async () => {
    await db.update(devolucoes).set({ criadaEm: new Date('2026-11-01T02:00:00Z') }).where(eq(devolucoes.id, a.id)); // 31/10 23:00
    await db.update(devolucoes).set({ criadaEm: new Date('2026-11-01T12:00:00Z') }).where(eq(devolucoes.id, b.id));
    await db.update(devolucoes).set({ criadaEm: new Date('2026-11-03T12:00:00Z') }).where(eq(devolucoes.id, c.id));
    expect(await codigos({ de: '2026-11-01', ate: '2026-11-01' })).toEqual([b.codigo]);
    expect(await codigos({ de: '2026-10-31', ate: '2026-10-31' })).toEqual([a.codigo]);
    expect(await codigos({ de: '2026-11-01' })).toEqual([b.codigo, c.codigo]);
  });

  it('os filtros combinam com a lista de status da etapa', async () => {
    expect(await codigos({ canal: 'MAGALU' }, { status: ['PENDENTE_CHEGADA'] })).toEqual([]);
    expect(await codigos({}, { status: ['PENDENTE_CHEGADA'] })).toEqual([a.codigo, b.codigo]);
    expect((await buscarDevolucoes(db, {}, { status: [] })).total).toBe(0);
  });

  it('o resumo do cartão traz o produto principal, as unidades e os selos; "Entregue (ML)" vai para o topo', async () => {
    await db
      .update(devolucoes)
      .set({ canal: 'MERCADO_LIVRE', entregueSegundoCanalEm: new Date() })
      .where(eq(devolucoes.id, a.id));
    const { devolucoes: lista } = await buscarDevolucoes(db, {}, { status: ['PENDENTE_CHEGADA'] });
    expect(lista.map((d) => d.codigo)).toEqual([a.codigo, b.codigo]);
    expect(lista[0]).toMatchObject({
      produto: 'Fone Bluetooth',
      unidades: 2,
      pedidos: ['SHP-100'],
      selos: [{ texto: 'Entregue (ML)', tom: 'atencao' }],
    });
    expect(lista[1]).toMatchObject({ produto: 'OUTRO-1', unidades: 1, selos: [] });
  });

  it('pagina', async () => {
    const r = await buscarDevolucoes(db, {}, { porPagina: 2, pagina: 2 });
    expect(r.total).toBe(3);
    expect(r.devolucoes.map((d) => d.codigo)).toEqual([a.codigo]);
  });

  it('ordem de chegada: quem chegou primeiro vem primeiro', async () => {
    await db.update(devolucoes).set({ recebidaEm: new Date('2026-11-12T15:00:00Z') }).where(eq(devolucoes.id, a.id));
    await db.update(devolucoes).set({ recebidaEm: new Date('2026-11-12T13:00:00Z') }).where(eq(devolucoes.id, b.id));
    const r = await buscarDevolucoes(db, {}, { ordem: 'chegada' });
    expect(r.devolucoes.map((d) => d.codigo)).toEqual([b.codigo, a.codigo, c.codigo]);
  });
});
```

Rode: `npm run test:int`
Esperado: FAIL (`./busca` não existe).

- [ ] **Passo 5: Implementar a consulta**

`src/modules/devolucoes/busca.ts`:

```ts
import { and, asc, count, desc, eq, exists, ilike, inArray, like, or, sql, type SQL } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { devolucoes, fornecedores, itensDevolucao, produtos } from '@/db/schema';
import { escaparLike } from '@/lib/texto';
import { somenteDigitos } from '@/modules/catalogo/documentos';
import type { Canal, StatusDevolucao } from './dominio';
import { POR_PAGINA_DEVOLUCOES, type FiltrosBusca } from './filtros';
import { normalizarRastreio } from './rastreio';
import { selosDaDevolucao, type DadosSelo } from './selos';

export type ResumoDevolucao = {
  id: string;
  codigo: string;
  canal: Canal | null;
  status: StatusDevolucao;
  rastreio: string | null;
  pedidos: string[];
  /** Descrição do produto da unidade 1 (ou o SKU, se estiver fora do cadastro). */
  produto: string | null;
  unidades: number;
  naoIdentificada: boolean;
  criadaEm: Date;
  recebidaEm: Date | null;
  selos: DadosSelo[];
};

export type OpcoesBusca = {
  /** Status da etapa da lista. Sem isso, busca em todos. */
  status?: readonly StatusDevolucao[];
  /** "recentes": "Entregue (ML)" no topo e depois as mais novas (spec §5.2). "chegada": quem chegou primeiro. */
  ordem?: 'recentes' | 'chegada';
  pagina?: number;
  porPagina?: number;
  agora?: Date;
};

function condicoes(db: DbOuTx, f: FiltrosBusca): SQL[] {
  const lista: SQL[] = [];
  if (f.rastreio) lista.push(ilike(devolucoes.rastreio, `%${escaparLike(normalizarRastreio(f.rastreio))}%`));
  if (f.pedido) lista.push(sql`array_to_string(${devolucoes.pedidosExternos}, ' ') ilike ${`%${escaparLike(f.pedido.trim())}%`}`);
  if (f.reclamacao) lista.push(ilike(devolucoes.reclamacaoId, `%${escaparLike(f.reclamacao.trim())}%`));
  if (f.canal) lista.push(eq(devolucoes.canal, f.canal));
  if (f.status) lista.push(eq(devolucoes.status, f.status));
  if (f.de) lista.push(sql`${devolucoes.criadaEm} >= (${f.de}::date::timestamp at time zone 'America/Sao_Paulo')`);
  if (f.ate) lista.push(sql`${devolucoes.criadaEm} < ((${f.ate}::date + 1)::timestamp at time zone 'America/Sao_Paulo')`);
  if (f.fornecedor) {
    const termo = `%${escaparLike(f.fornecedor.trim())}%`;
    const documento = f.fornecedor.toUpperCase().replace(/[^0-9A-Z]/g, '');
    lista.push(
      exists(
        db
          .select({ um: sql`1` })
          .from(itensDevolucao)
          .innerJoin(produtos, eq(produtos.id, itensDevolucao.produtoEsperadoId))
          .innerJoin(fornecedores, eq(fornecedores.id, produtos.fornecedorId))
          .where(
            and(
              eq(itensDevolucao.devolucaoId, devolucoes.id),
              or(ilike(fornecedores.razaoSocial, termo), documento ? like(fornecedores.cnpj, `${documento}%`) : undefined),
            ),
          ),
      ),
    );
  }
  if (f.codigo) {
    const codigo = f.codigo.trim();
    const digitos = somenteDigitos(codigo);
    lista.push(
      exists(
        db
          .select({ um: sql`1` })
          .from(itensDevolucao)
          .leftJoin(produtos, eq(produtos.id, itensDevolucao.produtoEsperadoId))
          .where(
            and(
              eq(itensDevolucao.devolucaoId, devolucoes.id),
              or(digitos ? eq(produtos.ean, digitos) : undefined, sql`upper(${itensDevolucao.serial}) = upper(${codigo})`),
            ),
          ),
      ),
    );
  }
  return lista;
}

export async function buscarDevolucoes(
  db: DbOuTx,
  filtros: FiltrosBusca,
  opcoes: OpcoesBusca = {},
): Promise<{ devolucoes: ResumoDevolucao[]; total: number }> {
  const porPagina = opcoes.porPagina ?? POR_PAGINA_DEVOLUCOES;
  const pagina = Math.max(1, opcoes.pagina ?? 1);
  const lista = condicoes(db, filtros);
  if (opcoes.status) lista.push(opcoes.status.length > 0 ? inArray(devolucoes.status, [...opcoes.status]) : sql`false`);
  const onde = lista.length > 0 ? and(...lista) : undefined;

  const [{ total }] = await db.select({ total: count() }).from(devolucoes).where(onde);
  const ordem =
    opcoes.ordem === 'chegada'
      ? [asc(devolucoes.recebidaEm), asc(devolucoes.numero)]
      : [sql`${devolucoes.entregueSegundoCanalEm} is null`, desc(devolucoes.numero)];

  const linhas = await db
    .select({
      id: devolucoes.id,
      codigo: devolucoes.codigo,
      canal: devolucoes.canal,
      status: devolucoes.status,
      rastreio: devolucoes.rastreio,
      pedidos: devolucoes.pedidosExternos,
      naoIdentificada: devolucoes.naoIdentificada,
      criadaEm: devolucoes.criadaEm,
      recebidaEm: devolucoes.recebidaEm,
      entregueSegundoCanalEm: devolucoes.entregueSegundoCanalEm,
      prazoConferenciaCanal: devolucoes.prazoConferenciaCanal,
      produto: sql<string | null>`(
        select coalesce(${produtos.descricao}, ${itensDevolucao.sku})
        from ${itensDevolucao}
        left join ${produtos} on ${produtos.id} = ${itensDevolucao.produtoEsperadoId}
        where ${itensDevolucao.devolucaoId} = ${devolucoes.id}
        order by ${itensDevolucao.unidade}
        limit 1
      )`,
      unidades: sql<number>`(select count(*) from ${itensDevolucao} where ${itensDevolucao.devolucaoId} = ${devolucoes.id})::int`,
    })
    .from(devolucoes)
    .where(onde)
    .orderBy(...ordem)
    .limit(porPagina)
    .offset((pagina - 1) * porPagina);

  const agora = opcoes.agora ?? new Date();
  return {
    total,
    devolucoes: linhas.map(({ entregueSegundoCanalEm, prazoConferenciaCanal, ...resto }) => ({
      ...resto,
      selos: selosDaDevolucao(
        { canal: resto.canal, status: resto.status, naoIdentificada: resto.naoIdentificada, entregueSegundoCanalEm, prazoConferenciaCanal },
        agora,
      ),
    })),
  };
}
```

- [ ] **Passo 6: Rodar e confirmar que passa**

Rode: `npm test && npm run test:int && npm run typecheck && npm run lint`
Esperado: tudo PASS.

- [ ] **Passo 7: Commit**

```bash
cd "/c/Users/idmpc/Dvoluções Markt"
git add -A
git commit -m "feat: Busca Avançada com os filtros do PDF, cartões e painel de filtros no celular" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 10: Telas das etapas, Nova devolução e detalhe da devolução

**Arquivos:**
- Criar: `src/components/CamposItens.tsx`
- Criar: `src/app/(app)/fluxo/etapa/[numero]/page.tsx`, `src/app/(app)/fluxo/busca/page.tsx`
- Criar: `src/app/(app)/fluxo/devolucoes/nova/page.tsx`, `.../nova/FormularioNovaDevolucao.tsx`, `.../nova/acoes.ts`
- Criar: `src/app/(app)/fluxo/devolucoes/[codigo]/page.tsx`, `.../[codigo]/AcoesGestor.tsx`, `.../[codigo]/acoes.ts`
- Modificar: `tests/e2e/apoio.ts` (acrescentar), `tests/e2e/global-setup.ts` (rotas de aquecimento)
- Testes: `src/components/CamposItens.test.tsx`, `tests/e2e/devolucoes.spec.ts`

**Interfaces:**
- Consome: `ListaDevolucoes`, `Selo`, `buscarDevolucoes`, `lerFiltros`, `TOM_DO_STATUS` (Tarefa 9); `obterDetalhe`, `DetalheDevolucao`, `encerrarPendente`, `identificarDevolucao` (Tarefa 8); `criarDevolucao`, `validarNovaDevolucao`, `itensDoFormulario`, `ErroDevolucao`, `rotuloDaAcao`, `ROTULO_*`, `ETAPA_DO_STATUS`, `statusDaEtapa`, `LIMITE_QUANTIDADE`, `rotuloStatus`, `criarDevolucaoTeste` (Tarefa 7); `CampoTexto`, `ListaErros`, `RodapeFormulario`, `useEnvioFormulario`, `lerPagina`, `formatarDataHora`, `formatarDataIso`, estilos (Tarefa 5); `ETAPAS`, `pode`, `exigirPermissao` (Fase 0)
- Produz:
  - `CamposItens({ iniciais?: ItemInicial[]; permitirVazio?: boolean })`, campos `sku` e `quantidade` repetidos, rótulos acessíveis "SKU do item N" e "Qtd. (quantidade do item N)"
  - rotas `/fluxo/etapa/[numero]` (1 a 5), `/fluxo/busca`, `/fluxo/devolucoes/nova`, `/fluxo/devolucoes/[codigo]`
  - na página da etapa, a função `acoesDaEtapa(numero: number, podeOperar: boolean): ReactNode` (as Tarefas 11 e 12 acrescentam botões nela)
  - Server Actions `criarDevolucaoAcao`, `encerrarAcao(id, codigo, ...)`, `identificarAcao(id, codigo, ...)`
  - e2e: `comBanco(fn)`, `usuarioPorEmail(db, email)`, `codigoUnico(prefixo)`, `abrirBusca(page)`

- [ ] **Passo 1: Escrever o teste do componente que falha**

`src/components/CamposItens.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CamposItens } from './CamposItens';

describe('CamposItens', () => {
  it('começa com um item e acrescenta e remove itens', () => {
    render(<CamposItens />);
    expect(screen.getAllByRole('textbox', { name: /^SKU do item/ })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /^Remover item/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar item' }));
    expect(screen.getAllByRole('textbox', { name: /^SKU do item/ })).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Remover item 1' }));
    expect(screen.getAllByRole('textbox', { name: /^SKU do item/ })).toHaveLength(1);
    expect(screen.getByRole('spinbutton', { name: /quantidade do item 1/ })).toBeTruthy();
  });

  it('pode começar vazio quando os itens são opcionais', () => {
    render(<CamposItens iniciais={[]} permitirVazio />);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Adicionar item' })).toBeTruthy();
  });
});
```

Rode: `npm test`
Esperado: FAIL (`./CamposItens` não existe).

- [ ] **Passo 2: Implementar `CamposItens`**

`src/components/CamposItens.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { LIMITE_QUANTIDADE } from '@/modules/devolucoes/dominio';
import { BOTAO_SECUNDARIO, CAMPO, ROTULO } from './estilos';

export type ItemInicial = { sku: string; quantidade: string };
type Linha = ItemInicial & { chave: number };

/** Itens da devolução (SKU + quantidade), uma linha por SKU. Cabe em 390 px: SKU, quantidade e o botão de remover. */
export function CamposItens({
  iniciais = [{ sku: '', quantidade: '1' }],
  permitirVazio = false,
}: {
  iniciais?: ItemInicial[];
  permitirVazio?: boolean;
}) {
  const [estado, setEstado] = useState<{ linhas: Linha[]; proxima: number }>(() => ({
    linhas: iniciais.map((item, i) => ({ ...item, chave: i })),
    proxima: iniciais.length,
  }));
  const { linhas } = estado;
  const podeRemover = permitirVazio || linhas.length > 1;

  function adicionar() {
    setEstado((atual) => ({ linhas: [...atual.linhas, { sku: '', quantidade: '1', chave: atual.proxima }], proxima: atual.proxima + 1 }));
  }

  function remover(chave: number) {
    setEstado((atual) => ({ ...atual, linhas: atual.linhas.filter((l) => l.chave !== chave) }));
  }

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-sm font-bold">Itens</legend>
      {linhas.length === 0 && <p className="text-sm text-texto-2">Nenhum item. Toque em &quot;Adicionar item&quot; se já souber o que veio.</p>}
      {linhas.map((linha, i) => (
        <div key={linha.chave} className="flex items-end gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <label htmlFor={`sku-${linha.chave}`} className={ROTULO}>
              SKU<span className="sr-only"> do item {i + 1}</span>
            </label>
            <input
              id={`sku-${linha.chave}`}
              name="sku"
              defaultValue={linha.sku}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={60}
              className={`${CAMPO} font-mono`}
            />
          </div>
          <div className="flex w-20 shrink-0 flex-col gap-1.5">
            <label htmlFor={`qtd-${linha.chave}`} className={ROTULO}>
              Qtd.<span className="sr-only"> (quantidade do item {i + 1})</span>
            </label>
            <input
              id={`qtd-${linha.chave}`}
              name="quantidade"
              type="number"
              inputMode="numeric"
              min={1}
              max={LIMITE_QUANTIDADE}
              defaultValue={linha.quantidade}
              className={CAMPO}
            />
          </div>
          {podeRemover && (
            <button
              type="button"
              onClick={() => remover(linha.chave)}
              aria-label={`Remover item ${i + 1}`}
              className="flex size-11 shrink-0 items-center justify-center rounded-full border border-borda-forte text-texto-2"
            >
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          )}
        </div>
      ))}
      <button type="button" onClick={adicionar} className={BOTAO_SECUNDARIO}>
        Adicionar item
      </button>
    </fieldset>
  );
}
```

Rode: `npm test`
Esperado: PASS.

- [ ] **Passo 3: Listas das etapas e da busca**

`src/app/(app)/fluxo/etapa/[numero]/page.tsx`:

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { ListaDevolucoes } from '@/components/ListaDevolucoes';
import { BOTAO_PRIMARIO } from '@/components/estilos';
import { obterDb } from '@/db';
import { lerPagina, type ParametrosBusca } from '@/lib/parametros';
import { pode } from '@/modules/auth/permissoes';
import { exigirPermissao } from '@/modules/auth/servidor';
import { buscarDevolucoes } from '@/modules/devolucoes/busca';
import { statusDaEtapa } from '@/modules/devolucoes/dominio';
import { ETAPAS } from '@/modules/devolucoes/etapas';
import { lerFiltros } from '@/modules/devolucoes/filtros';

export const metadata: Metadata = { title: 'Etapa · Gestão de Devoluções' };

type Props = { params: Promise<{ numero: string }>; searchParams: Promise<ParametrosBusca> };

/** Botões do topo de cada etapa (só para quem opera devoluções). */
function acoesDaEtapa(numero: number, podeOperar: boolean): ReactNode {
  if (!podeOperar) return null;
  if (numero === 1) {
    return (
      <Link href="/fluxo/devolucoes/nova" className={BOTAO_PRIMARIO}>
        Nova devolução
      </Link>
    );
  }
  return null;
}

export default async function PaginaEtapa({ params, searchParams }: Props) {
  const usuario = await exigirPermissao('ver_listas');
  const { numero } = await params;
  const etapa = ETAPAS.find((e) => String(e.numero) === numero);
  if (!etapa) notFound();
  const parametros = await searchParams;
  const filtros = lerFiltros(parametros);
  const pagina = lerPagina(parametros);
  const { devolucoes, total } = await buscarDevolucoes(obterDb(), filtros, {
    status: statusDaEtapa(etapa.numero),
    ordem: etapa.numero === 2 ? 'chegada' : 'recentes',
    pagina,
  });
  return (
    <ListaDevolucoes
      titulo={etapa.titulo}
      acaoBusca={`/fluxo/etapa/${etapa.numero}`}
      filtros={filtros}
      devolucoes={devolucoes}
      total={total}
      pagina={pagina}
      acoes={acoesDaEtapa(etapa.numero, pode(usuario.perfil, 'operar_devolucoes'))}
    />
  );
}
```

`src/app/(app)/fluxo/busca/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { ListaDevolucoes } from '@/components/ListaDevolucoes';
import { obterDb } from '@/db';
import { lerPagina, type ParametrosBusca } from '@/lib/parametros';
import { exigirPermissao } from '@/modules/auth/servidor';
import { buscarDevolucoes } from '@/modules/devolucoes/busca';
import { lerFiltros } from '@/modules/devolucoes/filtros';

export const metadata: Metadata = { title: 'Busca Avançada · Gestão de Devoluções' };

/** Resultado da Busca Avançada feita no quadro: todas as etapas e status. */
export default async function PaginaBusca({ searchParams }: { searchParams: Promise<ParametrosBusca> }) {
  await exigirPermissao('ver_listas');
  const parametros = await searchParams;
  const filtros = lerFiltros(parametros);
  const pagina = lerPagina(parametros);
  const { devolucoes, total } = await buscarDevolucoes(obterDb(), filtros, { pagina });
  return (
    <ListaDevolucoes titulo="Busca Avançada" acaoBusca="/fluxo/busca" filtros={filtros} devolucoes={devolucoes} total={total} pagina={pagina} />
  );
}
```

- [ ] **Passo 4: Nova devolução (spec §6.1)**

`src/app/(app)/fluxo/devolucoes/nova/acoes.ts`:

```ts
'use server';

import { redirect } from 'next/navigation';
import { obterDb } from '@/db';
import { exigirPermissao } from '@/modules/auth/servidor';
import { criarDevolucao, itensDoFormulario, validarNovaDevolucao } from '@/modules/devolucoes/criar';
import { ErroDevolucao } from '@/modules/devolucoes/erros';

export type EstadoNovaDevolucao = { erros: string[] };

function texto(dados: FormData, nome: string): string {
  return String(dados.get(nome) ?? '');
}

export async function criarDevolucaoAcao(_anterior: EstadoNovaDevolucao, dados: FormData): Promise<EstadoNovaDevolucao> {
  const usuario = await exigirPermissao('operar_devolucoes');
  const { dados: nova, erros } = validarNovaDevolucao({
    canal: texto(dados, 'canal'),
    pedido: texto(dados, 'pedido'),
    reclamacaoId: texto(dados, 'reclamacao'),
    rastreio: texto(dados, 'rastreio'),
    transportadora: texto(dados, 'transportadora'),
    itens: itensDoFormulario(dados),
  });
  if (!nova) return { erros };
  let codigo: string;
  try {
    codigo = (await criarDevolucao(obterDb(), nova, { origem: 'MANUAL', usuario })).codigo;
  } catch (erro) {
    if (erro instanceof ErroDevolucao) return { erros: [erro.message] };
    throw erro;
  }
  redirect(`/fluxo/devolucoes/${codigo}`);
}
```

`src/app/(app)/fluxo/devolucoes/nova/FormularioNovaDevolucao.tsx`:

```tsx
'use client';

import { CampoTexto } from '@/components/CampoTexto';
import { CamposItens } from '@/components/CamposItens';
import { ListaErros } from '@/components/ListaErros';
import { RodapeFormulario } from '@/components/RodapeFormulario';
import { BOTAO_PRIMARIO, CAMPO, CARTAO, ROTULO } from '@/components/estilos';
import { useEnvioFormulario } from '@/components/useEnvioFormulario';
import { CANAIS, ROTULO_CANAL } from '@/modules/devolucoes/dominio';
import { criarDevolucaoAcao } from './acoes';

/** Campos da spec §6.1: canal, pedido, ID da reclamação, rastreio, transportadora e itens por SKU e quantidade. */
export function FormularioNovaDevolucao() {
  const [estado, aoEnviar, pendente] = useEnvioFormulario(criarDevolucaoAcao, { erros: [] });
  return (
    <form onSubmit={aoEnviar} className={`${CARTAO} flex flex-col gap-4`}>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="canal" className={ROTULO}>
          Canal (obrigatório)
        </label>
        <select id="canal" name="canal" required defaultValue="" className={CAMPO}>
          <option value="" disabled>
            Escolha o marketplace
          </option>
          {CANAIS.map((c) => (
            <option key={c} value={c}>
              {ROTULO_CANAL[c]}
            </option>
          ))}
        </select>
      </div>
      <CampoTexto nome="pedido" rotulo="Número do pedido (obrigatório)" obrigatorio mono maximo={60} />
      <CampoTexto nome="reclamacao" rotulo="ID da reclamação" mono maximo={60} />
      <CampoTexto nome="rastreio" rotulo="Código de rastreamento" mono maiusculas maximo={60} />
      <CampoTexto nome="transportadora" rotulo="Transportadora" maximo={60} />
      <CamposItens />
      <ListaErros erros={estado.erros} />
      <RodapeFormulario>
        <button type="submit" disabled={pendente} className={BOTAO_PRIMARIO}>
          {pendente ? 'Cadastrando…' : 'Cadastrar devolução'}
        </button>
      </RodapeFormulario>
    </form>
  );
}
```

`src/app/(app)/fluxo/devolucoes/nova/page.tsx`:

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { LINK_VOLTAR } from '@/components/estilos';
import { exigirPermissao } from '@/modules/auth/servidor';
import { FormularioNovaDevolucao } from './FormularioNovaDevolucao';

export const metadata: Metadata = { title: 'Nova devolução · Gestão de Devoluções' };

export default async function PaginaNovaDevolucao() {
  await exigirPermissao('operar_devolucoes');
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-3">
      <Link href="/fluxo/etapa/1" className={LINK_VOLTAR}>
        ← Pedidos Pendentes de Chegada
      </Link>
      <h1 className="text-xl font-bold">Nova devolução</h1>
      <FormularioNovaDevolucao />
    </div>
  );
}
```

- [ ] **Passo 5: Detalhe da devolução e ações do Gestor**

`src/app/(app)/fluxo/devolucoes/[codigo]/acoes.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { obterDb } from '@/db';
import { exigirPermissao } from '@/modules/auth/servidor';
import { itensDoFormulario } from '@/modules/devolucoes/criar';
import { ErroDevolucao } from '@/modules/devolucoes/erros';
import { encerrarPendente, identificarDevolucao } from '@/modules/devolucoes/excecoes';

export type EstadoAcaoGestor = { erro: string | null };

function texto(dados: FormData, nome: string): string {
  return String(dados.get(nome) ?? '');
}

export async function encerrarAcao(id: string, codigo: string, _anterior: EstadoAcaoGestor, dados: FormData): Promise<EstadoAcaoGestor> {
  const usuario = await exigirPermissao('administrar');
  const para = texto(dados, 'para');
  if (para !== 'CANCELADA' && para !== 'EXTRAVIADA') return { erro: 'Escolha o novo status.' };
  try {
    await encerrarPendente(obterDb(), id, para, texto(dados, 'motivo'), usuario);
  } catch (erro) {
    if (erro instanceof ErroDevolucao) return { erro: erro.message };
    throw erro;
  }
  revalidatePath(`/fluxo/devolucoes/${codigo}`);
  return { erro: null };
}

export async function identificarAcao(id: string, codigo: string, _anterior: EstadoAcaoGestor, dados: FormData): Promise<EstadoAcaoGestor> {
  const usuario = await exigirPermissao('administrar');
  try {
    await identificarDevolucao(
      obterDb(),
      id,
      {
        canal: texto(dados, 'canal'),
        pedido: texto(dados, 'pedido'),
        reclamacaoId: texto(dados, 'reclamacao'),
        transportadora: texto(dados, 'transportadora'),
        itens: itensDoFormulario(dados),
      },
      usuario,
    );
  } catch (erro) {
    if (erro instanceof ErroDevolucao) return { erro: erro.message };
    throw erro;
  }
  revalidatePath(`/fluxo/devolucoes/${codigo}`);
  return { erro: null };
}
```

`src/app/(app)/fluxo/devolucoes/[codigo]/AcoesGestor.tsx`:

```tsx
'use client';

import { CampoTexto } from '@/components/CampoTexto';
import { CamposItens } from '@/components/CamposItens';
import { ListaErros } from '@/components/ListaErros';
import { RodapeFormulario } from '@/components/RodapeFormulario';
import { BOTAO_PRIMARIO, CAMPO, CARTAO, ROTULO } from '@/components/estilos';
import { useEnvioFormulario } from '@/components/useEnvioFormulario';
import { CANAIS, ROTULO_CANAL } from '@/modules/devolucoes/dominio';
import type { EstadoAcaoGestor } from './acoes';

type Acao = (anterior: EstadoAcaoGestor, dados: FormData) => Promise<EstadoAcaoGestor>;

/** Spec §5.2: Pendente de chegada → Cancelada ou Extraviada, por ação manual do Gestor. */
export function FormularioEncerrar({ acao }: { acao: Acao }) {
  const [estado, aoEnviar, pendente] = useEnvioFormulario(acao, { erro: null });
  return (
    <form onSubmit={aoEnviar} aria-labelledby="titulo-encerrar" className={`${CARTAO} flex flex-col gap-3`}>
      <h2 id="titulo-encerrar" className="text-base font-bold">
        Encerrar sem chegada
      </h2>
      <fieldset className="flex flex-col">
        <legend className={ROTULO}>Novo status</legend>
        <label className="flex min-h-11 items-center gap-3 text-[15px]">
          <input type="radio" name="para" value="CANCELADA" defaultChecked className="size-5" />
          Cancelada
        </label>
        <label className="flex min-h-11 items-center gap-3 text-[15px]">
          <input type="radio" name="para" value="EXTRAVIADA" className="size-5" />
          Extraviada
        </label>
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="motivo" className={ROTULO}>
          Motivo
        </label>
        <textarea
          id="motivo"
          name="motivo"
          required
          minLength={3}
          maxLength={500}
          rows={3}
          className="w-full rounded-lg border border-borda-forte bg-superficie px-3 py-2 text-[15px]"
        />
      </div>
      <ListaErros erros={estado.erro ? [estado.erro] : []} />
      <RodapeFormulario>
        <button type="submit" disabled={pendente} className={BOTAO_PRIMARIO}>
          {pendente ? 'Registrando…' : 'Registrar'}
        </button>
      </RodapeFormulario>
    </form>
  );
}

/** Spec §5.2: o Gestor liga o pacote não identificado ao pedido certo e a marca sai. */
export function FormularioIdentificar({ acao }: { acao: Acao }) {
  const [estado, aoEnviar, pendente] = useEnvioFormulario(acao, { erro: null });
  return (
    <form onSubmit={aoEnviar} aria-labelledby="titulo-identificar" className={`${CARTAO} flex flex-col gap-3`}>
      <h2 id="titulo-identificar" className="text-base font-bold">
        Identificar devolução
      </h2>
      <p className="text-sm text-texto-2">Ligue este pacote ao pedido certo. A marca &quot;Não identificada&quot; sai.</p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="identificar-canal" className={ROTULO}>
          Canal (obrigatório)
        </label>
        <select id="identificar-canal" name="canal" required defaultValue="" className={CAMPO}>
          <option value="" disabled>
            Escolha o marketplace
          </option>
          {CANAIS.map((c) => (
            <option key={c} value={c}>
              {ROTULO_CANAL[c]}
            </option>
          ))}
        </select>
      </div>
      <CampoTexto nome="pedido" id="identificar-pedido" rotulo="Número do pedido (obrigatório)" obrigatorio mono maximo={60} />
      <CampoTexto nome="reclamacao" id="identificar-reclamacao" rotulo="ID da reclamação" mono maximo={60} />
      <CampoTexto nome="transportadora" id="identificar-transportadora" rotulo="Transportadora" maximo={60} />
      <CamposItens iniciais={[]} permitirVazio />
      <ListaErros erros={estado.erro ? [estado.erro] : []} />
      <RodapeFormulario>
        <button type="submit" disabled={pendente} className={BOTAO_PRIMARIO}>
          {pendente ? 'Salvando…' : 'Salvar identificação'}
        </button>
      </RodapeFormulario>
    </form>
  );
}
```

`src/app/(app)/fluxo/devolucoes/[codigo]/page.tsx`:

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { Selo } from '@/components/Selo';
import { CARTAO, LINK_VOLTAR, ROTULO } from '@/components/estilos';
import { obterDb } from '@/db';
import { formatarDataHora, formatarDataIso } from '@/lib/formatar';
import { pode } from '@/modules/auth/permissoes';
import { exigirPermissao } from '@/modules/auth/servidor';
import { obterDetalhe } from '@/modules/devolucoes/detalhe';
import {
  ETAPA_DO_STATUS,
  ROTULO_CANAL,
  ROTULO_ORIGEM,
  ROTULO_STATUS,
  ROTULO_STATUS_ITEM,
  ROTULO_TIPO,
  rotuloStatus,
} from '@/modules/devolucoes/dominio';
import { ETAPAS } from '@/modules/devolucoes/etapas';
import { TOM_DO_STATUS } from '@/modules/devolucoes/selos';
import { rotuloDaAcao } from '@/modules/historico/eventos';
import { encerrarAcao, identificarAcao } from './acoes';
import { FormularioEncerrar, FormularioIdentificar } from './AcoesGestor';

export const metadata: Metadata = { title: 'Devolução · Gestão de Devoluções' };

function Dado({ rotulo, mono = false, children }: { rotulo: string; mono?: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className={ROTULO}>{rotulo}</dt>
      <dd className={`text-[15px] ${mono ? 'break-all font-mono' : ''}`}>{children}</dd>
    </div>
  );
}

function motivoDoEvento(dados: Record<string, unknown> | null): string | null {
  const motivo = dados?.motivo;
  return typeof motivo === 'string' ? motivo : null;
}

export default async function PaginaDevolucao({ params }: { params: Promise<{ codigo: string }> }) {
  const usuario = await exigirPermissao('ver_listas');
  const { codigo } = await params;
  const d = await obterDetalhe(obterDb(), codigo);
  if (!d) notFound();
  const ehGestor = pode(usuario.perfil, 'administrar');
  const etapa = ETAPAS.find((e) => e.numero === ETAPA_DO_STATUS[d.status]);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        {etapa && (
          <Link href={`/fluxo/etapa/${etapa.numero}`} className={LINK_VOLTAR}>
            ← {etapa.titulo}
          </Link>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-mono text-2xl font-bold">{d.codigo}</h1>
          <Selo texto={ROTULO_STATUS[d.status]} tom={TOM_DO_STATUS[d.status]} />
          {d.naoIdentificada && <Selo texto="Não identificada" tom="erro" />}
        </div>
      </div>

      <section aria-labelledby="titulo-dados" className={CARTAO}>
        <h2 id="titulo-dados" className="mb-3 text-base font-bold">
          Dados
        </h2>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Dado rotulo="Canal">{d.canal ? ROTULO_CANAL[d.canal] : 'A identificar'}</Dado>
          <Dado rotulo="Número do pedido" mono>
            {d.pedidos.join(', ') || '—'}
          </Dado>
          <Dado rotulo="ID da reclamação" mono>
            {d.reclamacaoId ?? '—'}
          </Dado>
          <Dado rotulo="Código de rastreamento" mono>
            {d.rastreio ?? '—'}
          </Dado>
          <Dado rotulo="Transportadora">{d.transportadora ?? '—'}</Dado>
          <Dado rotulo="Tipo">{ROTULO_TIPO[d.tipo]}</Dado>
          <Dado rotulo="Origem">{ROTULO_ORIGEM[d.origem]}</Dado>
          <Dado rotulo="Motivo do cliente">{d.motivoCliente ?? '—'}</Dado>
          <Dado rotulo="Data de postagem">{d.postadaEm ? formatarDataIso(d.postadaEm) : '—'}</Dado>
          <Dado rotulo="Cadastrada em">
            {formatarDataHora(d.criadaEm)}
            {d.criadoPorNome ? ` por ${d.criadoPorNome}` : ''}
          </Dado>
          <Dado rotulo="Chegada">
            {d.recebidaEm ? `${formatarDataHora(d.recebidaEm)}${d.recebidaPorNome ? ` por ${d.recebidaPorNome}` : ''}` : 'Ainda não chegou'}
          </Dado>
        </dl>
      </section>

      <section aria-labelledby="titulo-itens" className="flex flex-col gap-2">
        <h2 id="titulo-itens" className="text-base font-bold">
          Itens ({d.itens.length} {d.itens.length === 1 ? 'unidade' : 'unidades'})
        </h2>
        {d.itens.length === 0 ? (
          <p className="text-sm text-texto-2">Nenhum item cadastrado.</p>
        ) : (
          <ol className="grid gap-2 md:grid-cols-2">
            {d.itens.map((item) => (
              <li key={item.id} className={`${CARTAO} flex flex-col gap-1 p-3`}>
                <span className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-texto-2">Unidade {item.unidade}</span>
                  <span className="text-xs font-semibold text-texto-2">{ROTULO_STATUS_ITEM[item.status]}</span>
                </span>
                <span className="break-all font-mono text-[13px] font-semibold">{item.sku}</span>
                <span className="text-sm">{item.descricao ?? 'SKU fora do cadastro de produtos'}</span>
                <span className="text-xs text-texto-2">
                  {item.fornecedor ?? 'Sem fornecedor'}
                  {item.ean ? <span className="font-mono"> · EAN {item.ean}</span> : null}
                  <span className="font-mono"> · S/N {item.serial ?? '—'}</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="titulo-historico" className={CARTAO}>
        <h2 id="titulo-historico" className="mb-3 text-base font-bold">
          Histórico
        </h2>
        <ol className="flex flex-col gap-3">
          {d.eventos.map((e) => {
            const motivo = motivoDoEvento(e.dados);
            return (
              <li key={e.id} className="flex flex-col text-sm">
                <span className="font-semibold">{rotuloDaAcao(e.acao)}</span>
                {e.para && e.de !== e.para && (
                  <span className="text-texto-2">
                    {e.de ? `${rotuloStatus(e.de)} → ` : ''}
                    {rotuloStatus(e.para)}
                  </span>
                )}
                {motivo && <span>Motivo: {motivo}</span>}
                <span className="text-xs text-texto-2">
                  {formatarDataHora(e.em)} · {e.usuarioNome ?? 'Sistema'}
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      {ehGestor && d.status === 'PENDENTE_CHEGADA' && <FormularioEncerrar acao={encerrarAcao.bind(null, d.id, d.codigo)} />}
      {ehGestor && d.naoIdentificada && <FormularioIdentificar acao={identificarAcao.bind(null, d.id, d.codigo)} />}
    </div>
  );
}
```

Rode: `npm run typecheck && npm run lint`
Esperado: sem erros.

- [ ] **Passo 6: Apoio aos testes ponta a ponta**

Em `tests/e2e/apoio.ts`, acrescente no topo:

```ts
import { eq } from 'drizzle-orm';
import { criarDb, type Db } from '../../src/db/client';
import { usuarios } from '../../src/db/schema';
import type { UsuarioSessao } from '../../src/modules/auth/usuarios';
```

e no final:

```ts
/** Abre uma conexão com o banco de testes (o mesmo do servidor do e2e) só para preparar dados com as fábricas. */
export async function comBanco<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('Defina DATABASE_URL_TEST no .env');
  const { db, sql } = criarDb(url);
  try {
    return await fn(db);
  } finally {
    await sql.end();
  }
}

export async function usuarioPorEmail(db: Db, email: string): Promise<UsuarioSessao> {
  const [u] = await db
    .select({ id: usuarios.id, nome: usuarios.nome, email: usuarios.email, perfil: usuarios.perfil })
    .from(usuarios)
    .where(eq(usuarios.email, email));
  if (!u) throw new Error(`O usuário ${email} não existe no banco de testes`);
  return u;
}

/** Código único por execução (o banco do e2e é o mesmo para o computador e o celular). */
export function codigoUnico(prefixo: string): string {
  const sorte = Math.floor(Math.random() * 1296).toString(36).toUpperCase().padStart(2, '0');
  return `${prefixo}${Date.now().toString(36).toUpperCase()}${sorte}`;
}

/** No celular a Busca Avançada fica atrás do botão "Filtros"; no computador ela já está aberta. */
export async function abrirBusca(page: Page) {
  const botao = page.getByRole('button', { name: /^Filtros/ });
  if ((await botao.isVisible()) && (await botao.getAttribute('aria-expanded')) !== 'true') await botao.click();
}
```

Em `tests/e2e/global-setup.ts`, acrescente na lista `ROTAS_AQUECIMENTO`, logo antes do `];`:

```ts
  '/fluxo/etapa/1',
  '/fluxo/etapa/2',
  '/fluxo/busca',
  '/fluxo/devolucoes/nova',
  '/fluxo/devolucoes/DEV-000000',
```

- [ ] **Passo 7: Testes ponta a ponta (no computador e no celular)**

`tests/e2e/devolucoes.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { criarDevolucaoTeste } from '../helpers/fabricas';
import { abrirBusca, codigoUnico, comBanco, entrar, semRolagemLateral, usuarioPorEmail } from './apoio';
import { USUARIOS_E2E } from './dados';

async function devolucaoPendente(): Promise<string> {
  return comBanco(async (db) => {
    const operador = await usuarioPorEmail(db, USUARIOS_E2E.operador.email);
    return (await criarDevolucaoTeste(db, operador, { rastreio: codigoUnico('PD') })).codigo;
  });
}

test('operador cadastra uma devolução à mão e acha pela Busca Avançada', async ({ page }) => {
  const pedido = codigoUnico('PED');
  const rastreio = codigoUnico('BR');
  await entrar(page, USUARIOS_E2E.operador);
  await page.goto('/fluxo/etapa/1');
  await expect(page.getByRole('heading', { level: 1, name: 'Pedidos Pendentes de Chegada' })).toBeVisible();
  await semRolagemLateral(page);

  await page.getByRole('link', { name: 'Nova devolução' }).click();
  await page.getByLabel('Canal (obrigatório)').selectOption('SHOPEE');
  await page.getByLabel('Número do pedido (obrigatório)').fill(pedido);
  await page.getByLabel('Código de rastreamento').fill(rastreio.toLowerCase());
  await page.getByLabel('Transportadora').fill('Correios');
  await page.getByLabel('SKU do item 1').fill('fone-01');
  await page.getByLabel('quantidade do item 1').fill('2');
  await page.getByRole('button', { name: 'Adicionar item' }).click();
  await page.getByLabel('SKU do item 2').fill('CABO-02');
  await semRolagemLateral(page);
  await page.getByRole('button', { name: 'Cadastrar devolução' }).click();

  await expect(page).toHaveURL(/\/fluxo\/devolucoes\/DEV-\d{6}$/);
  const codigo = page.url().split('/').pop() ?? '';
  await expect(page.getByRole('heading', { level: 1, name: codigo })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Itens (3 unidades)' })).toBeVisible();
  await expect(page.getByText('Devolução cadastrada')).toBeVisible();
  await expect(page.getByText(rastreio, { exact: true })).toBeVisible();
  await semRolagemLateral(page);

  await page.goto('/fluxo/etapa/1');
  await abrirBusca(page);
  await page.getByRole('textbox', { name: 'Código de Rastreamento' }).fill(rastreio.slice(2).toLowerCase());
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(page.getByRole('link', { name: new RegExp(codigo) })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Remover filtro Rastreio/ })).toBeVisible();

  await abrirBusca(page);
  await page.getByRole('textbox', { name: 'Código de Rastreamento' }).fill('');
  await page.getByRole('textbox', { name: 'Número do Pedido' }).fill(pedido);
  await page.getByRole('combobox', { name: 'Marketplace de Origem' }).selectOption('AMAZON');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(page.getByText('Nenhuma devolução encontrada.')).toBeVisible();
});

test('gestor cancela uma devolução pendente e o histórico mostra o motivo', async ({ page }) => {
  const codigo = await devolucaoPendente();
  await entrar(page, USUARIOS_E2E.gestor);
  await page.goto(`/fluxo/devolucoes/${codigo}`);
  await semRolagemLateral(page);
  await page.getByLabel('Cancelada').check();
  await page.getByLabel('Motivo').fill('Cliente desistiu da devolução');
  await page.getByRole('button', { name: 'Registrar' }).click();
  await expect(page.getByText('Devolução cancelada')).toBeVisible();
  await expect(page.getByText('Motivo: Cliente desistiu da devolução')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Registrar' })).toHaveCount(0);
});

test('o Fiscal vê o detalhe, sem as ações do Gestor, e não cadastra devolução (HTTP 404)', async ({ page }) => {
  const codigo = await devolucaoPendente();
  await entrar(page, USUARIOS_E2E.fiscal);
  await page.goto(`/fluxo/devolucoes/${codigo}`);
  await expect(page.getByRole('heading', { level: 1, name: codigo })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Registrar' })).toHaveCount(0);
  const resposta = await page.goto('/fluxo/devolucoes/nova');
  expect(resposta?.status()).toBe(404);
});
```

Rode: `npm run test:e2e`
Esperado: PASS em `computador` e `celular`.

- [ ] **Passo 8: Commit**

```bash
cd "/c/Users/idmpc/Dvoluções Markt"
git add -A
git commit -m "feat: listas das etapas, nova devolução e detalhe com ações do gestor" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 11: Tela de Recebimento com câmera em tela cheia (spec §6.2)

**Por que esta biblioteca:**
- **barcode-detector 3.2.3** (de Sec-ant, mantida em 2026): implementa a mesma interface `BarcodeDetector` do navegador usando **ZXing-C++ compilado para WebAssembly** (`zxing-wasm`). Assim o código é um só: usa o `BarcodeDetector` nativo quando o aparelho tem (Chrome no Android) e o ZXing quando não tem (iPhone/Safari e computadores). O ZXing-C++ lê Code 128 (etiquetas dos Correios e do ML), QR, DataMatrix e EAN melhor que a versão em JavaScript puro (`@zxing/library`, hoje em modo de manutenção).
- O `.wasm` (≈ 950 KB) é copiado para `public/zxing/` antes do `dev` e do `build` (`scripts/copiar-zxing.mjs`): o celular baixa do próprio sistema, sem depender de CDN.
- O leitor fica isolado atrás de uma interface pequena: `criarDetector()` → `{ origem, detectar(video) }` e o hook `useLeitorCamera(aoLer)`. A tela não sabe qual leitor está por baixo.

**Arquivos:**
- Criar: `scripts/copiar-zxing.mjs`
- Modificar: `package.json` (dependência e scripts `predev`/`prebuild`), `.gitignore`
- Criar: `src/components/leitor/detector.ts`, `src/components/leitor/useLeitorCamera.ts`
- Criar: `src/app/(app)/fluxo/recebimento/page.tsx`, `.../recebimento/FormularioRecebimento.tsx`, `.../recebimento/acoes.ts`
- Modificar: `src/app/(app)/fluxo/etapa/[numero]/page.tsx` (botão "Recebimento" na etapa 2), `tests/e2e/global-setup.ts`
- Testes: `src/components/leitor/detector.test.ts`, `tests/e2e/recebimento.spec.ts`

**Interfaces:**
- Consome: `receberPorRastreio`, `criarNaoIdentificada`, `ResultadoRecebimento` (Tarefa 8); `ErroDevolucao`, `rotuloStatus`, `criarDevolucaoTeste` (Tarefa 7); `formatarDataHora`, estilos (Tarefa 5); `comBanco`, `usuarioPorEmail`, `codigoUnico` (Tarefa 10)
- Produz:
  - em `detector.ts`: `FORMATOS`, `type ConstrutorDetector`, `type Detector = { origem: 'nativo' | 'zxing'; detectar(fonte: ImageBitmapSource): Promise<string | null> }`, `criarDetector(ambiente?, carregarAlternativa?): Promise<Detector>`, `mensagemErroCamera(erro): string`
  - `useLeitorCamera(aoLer: (codigo: string) => void): { videoRef; situacao: 'parada' | 'abrindo' | 'lendo'; erro: string | null; abrir(): Promise<void>; fechar(): void }`
  - rota `/fluxo/recebimento` e a Server Action `registrarChegadaAcao(anterior, dados)` com `type EstadoRecebimento`

- [ ] **Passo 1: Instalar e servir o leitor sem CDN**

```bash
cd "/c/Users/idmpc/Dvoluções Markt"
npm install --save-exact barcode-detector@3.2.3
npm pkg set scripts.predev="node scripts/copiar-zxing.mjs" scripts.prebuild="node scripts/copiar-zxing.mjs"
```

`scripts/copiar-zxing.mjs`:

```js
// Copia o .wasm do leitor ZXing para public/zxing, para o celular baixar do próprio sistema (sem CDN).
// Roda sozinho antes do `npm run dev` e do `npm run build` (scripts predev e prebuild).
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const origem = require.resolve('zxing-wasm/reader/zxing_reader.wasm');
const destino = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'zxing', 'zxing_reader.wasm');
mkdirSync(dirname(destino), { recursive: true });
copyFileSync(origem, destino);
console.log(`zxing_reader.wasm copiado para ${destino}`);
```

Acrescente no **final** do `.gitignore`:

```
# .wasm do leitor de código, copiado de node_modules (scripts/copiar-zxing.mjs)
/public/zxing
```

Rode: `node scripts/copiar-zxing.mjs`
Esperado: "zxing_reader.wasm copiado para ...\public\zxing\zxing_reader.wasm". Se o `require.resolve` não achar `zxing-wasm`, instale a mesma versão que o `barcode-detector` usa (`npm ls zxing-wasm` mostra; hoje `3.1.6`) com `npm install --save-exact zxing-wasm@3.1.6` e rode de novo.

- [ ] **Passo 2: Escrever o teste do detector que falha**

`src/components/leitor/detector.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { criarDetector, mensagemErroCamera, type ConstrutorDetector } from './detector';

function construtorFalso(lidos: string[], suportados?: string[]): ConstrutorDetector {
  class Falso {
    static getSupportedFormats = suportados ? async () => suportados : undefined;
    async detect() {
      return lidos.map((rawValue) => ({ rawValue }));
    }
  }
  return Falso as unknown as ConstrutorDetector;
}

const VIDEO = {} as ImageBitmapSource;

describe('criarDetector', () => {
  it('usa o BarcodeDetector do navegador quando ele lê Code 128', async () => {
    const alternativa = vi.fn();
    const detector = await criarDetector({ BarcodeDetector: construtorFalso(['BR123'], ['code_128', 'qr_code']) }, alternativa);
    expect(detector.origem).toBe('nativo');
    expect(alternativa).not.toHaveBeenCalled();
    expect(await detector.detectar(VIDEO)).toBe('BR123');
  });

  it('usa o ZXing quando o navegador não tem o BarcodeDetector (iPhone)', async () => {
    const alternativa = vi.fn(async () => construtorFalso([' BR999 ']));
    const detector = await criarDetector({}, alternativa);
    expect(detector.origem).toBe('zxing');
    expect(alternativa).toHaveBeenCalledOnce();
    expect(await detector.detectar(VIDEO)).toBe('BR999');
  });

  it('usa o ZXing quando o nativo não lê Code 128', async () => {
    const detector = await criarDetector({ BarcodeDetector: construtorFalso([], ['qr_code']) }, async () => construtorFalso([]));
    expect(detector.origem).toBe('zxing');
  });

  it('devolve null quando não lê nada e ignora leituras vazias', async () => {
    const detector = await criarDetector({}, async () => construtorFalso(['  ']));
    expect(await detector.detectar(VIDEO)).toBeNull();
  });
});

describe('mensagemErroCamera', () => {
  it('explica em português o que fazer', () => {
    const bloqueada = Object.assign(new Error('x'), { name: 'NotAllowedError' });
    expect(mensagemErroCamera(bloqueada)).toBe('A câmera foi bloqueada. Libere o acesso à câmera no navegador ou digite o código.');
    expect(mensagemErroCamera(new Error('qualquer'))).toBe('Não foi possível abrir a câmera. Digite o código.');
  });
});
```

Rode: `npm test`
Esperado: FAIL (`./detector` não existe).

- [ ] **Passo 3: Implementar o detector e o hook da câmera**

`src/components/leitor/detector.ts`:

```ts
/**
 * Leitura de código de barras e QR (spec §4.2): o BarcodeDetector do navegador quando ele existe e lê Code 128;
 * senão, o ZXing em WebAssembly (pacote barcode-detector, mesma interface). O .wasm é servido em /zxing/.
 */
export const FORMATOS = [
  'code_128',
  'code_39',
  'code_93',
  'codabar',
  'ean_13',
  'ean_8',
  'itf',
  'upc_a',
  'upc_e',
  'qr_code',
  'data_matrix',
  'pdf417',
] as const;

type CodigoDetectado = { rawValue: string };

export type ConstrutorDetector = {
  new (opcoes?: { formats?: string[] }): { detect(fonte: ImageBitmapSource): Promise<CodigoDetectado[]> };
  getSupportedFormats?: () => Promise<readonly string[]>;
};

export type Detector = { origem: 'nativo' | 'zxing'; detectar(fonte: ImageBitmapSource): Promise<string | null> };

async function carregarZxing(): Promise<ConstrutorDetector> {
  const modulo = await import('barcode-detector/ponyfill');
  modulo.prepareZXingModule({
    overrides: {
      locateFile: (caminho: string, prefixo: string) => (caminho.endsWith('.wasm') ? `/zxing/${caminho}` : prefixo + caminho),
    },
  });
  return modulo.BarcodeDetector as unknown as ConstrutorDetector;
}

function embrulhar(origem: Detector['origem'], leitor: InstanceType<ConstrutorDetector>): Detector {
  return {
    origem,
    async detectar(fonte) {
      const achados = await leitor.detect(fonte);
      return achados.map((a) => a.rawValue.trim()).find((valor) => valor !== '') ?? null;
    },
  };
}

export async function criarDetector(
  ambiente: { BarcodeDetector?: ConstrutorDetector } = globalThis as unknown as { BarcodeDetector?: ConstrutorDetector },
  carregarAlternativa: () => Promise<ConstrutorDetector> = carregarZxing,
): Promise<Detector> {
  const Nativo = ambiente.BarcodeDetector;
  if (Nativo) {
    const suportados = (await Nativo.getSupportedFormats?.().catch(() => [])) ?? [];
    const formatos = FORMATOS.filter((f) => suportados.includes(f));
    if (formatos.includes('code_128')) return embrulhar('nativo', new Nativo({ formats: [...formatos] }));
  }
  const Alternativa = await carregarAlternativa();
  return embrulhar('zxing', new Alternativa({ formats: [...FORMATOS] }));
}

export function mensagemErroCamera(erro: unknown): string {
  const nome = erro instanceof Error ? erro.name : '';
  if (nome === 'NotAllowedError' || nome === 'SecurityError') {
    return 'A câmera foi bloqueada. Libere o acesso à câmera no navegador ou digite o código.';
  }
  if (nome === 'NotFoundError' || nome === 'OverconstrainedError') return 'Nenhuma câmera encontrada neste aparelho. Digite o código.';
  if (nome === 'NotReadableError') return 'A câmera está em uso por outro aplicativo. Feche-o ou digite o código.';
  return 'Não foi possível abrir a câmera. Digite o código.';
}
```

`src/components/leitor/useLeitorCamera.ts`:

```ts
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { criarDetector, mensagemErroCamera } from './detector';

export type SituacaoCamera = 'parada' | 'abrindo' | 'lendo';

const INTERVALO_MS = 200;
/** O mesmo código lido de novo dentro deste tempo é ignorado (o pacote ainda está na frente da câmera). */
const PAUSA_MESMO_CODIGO_MS = 3000;

/**
 * Câmera traseira lendo códigos em sequência, um pacote atrás do outro, até a pessoa fechar.
 * Tudo começa num toque (handler), nunca sozinho num efeito: o navegador exige um gesto para abrir a câmera.
 */
export function useLeitorCamera(aoLer: (codigo: string) => void) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pararRef = useRef<(() => void) | null>(null);
  const aoLerRef = useRef(aoLer);
  const [situacao, setSituacao] = useState<SituacaoCamera>('parada');
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    aoLerRef.current = aoLer;
  }, [aoLer]);

  // Ao sair da tela, desliga a câmera.
  useEffect(() => {
    const sessao = pararRef;
    return () => sessao.current?.();
  }, []);

  const fechar = useCallback(() => {
    pararRef.current?.();
    pararRef.current = null;
    setSituacao('parada');
  }, []);

  const abrir = useCallback(async () => {
    setErro(null);
    const video = videoRef.current;
    if (!video || !navigator.mediaDevices?.getUserMedia) {
      setErro('Este navegador não deixa usar a câmera aqui. Digite o código.');
      return;
    }
    setSituacao('abrindo');
    let fluxo: MediaStream | null = null;
    try {
      const [detector, midia] = await Promise.all([
        criarDetector(),
        navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }),
      ]);
      fluxo = midia;
      video.srcObject = midia;
      await video.play();
      let ativa = true;
      let temporizador: ReturnType<typeof setTimeout> | undefined;
      let ultimo = { codigo: '', em: 0 };
      pararRef.current = () => {
        ativa = false;
        clearTimeout(temporizador);
        midia.getTracks().forEach((t) => t.stop());
        video.srcObject = null;
      };
      setSituacao('lendo');
      const ler = async () => {
        if (!ativa) return;
        const codigo = video.readyState >= 2 ? await detector.detectar(video).catch(() => null) : null;
        if (!ativa) return;
        const agora = Date.now();
        if (codigo && (codigo !== ultimo.codigo || agora - ultimo.em > PAUSA_MESMO_CODIGO_MS)) {
          ultimo = { codigo, em: agora };
          navigator.vibrate?.(80); // (extra) confirma a leitura no Android; o iPhone não vibra
          aoLerRef.current(codigo);
        }
        temporizador = setTimeout(ler, INTERVALO_MS);
      };
      void ler();
    } catch (e) {
      fluxo?.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
      pararRef.current = null;
      setSituacao('parada');
      setErro(mensagemErroCamera(e));
    }
  }, []);

  return { videoRef, situacao, erro, abrir, fechar };
}
```

Rode: `npm test`
Esperado: PASS.

- [ ] **Passo 4: Server Action do Recebimento**

`src/app/(app)/fluxo/recebimento/acoes.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { obterDb } from '@/db';
import { formatarDataHora } from '@/lib/formatar';
import { exigirPermissao } from '@/modules/auth/servidor';
import { rotuloStatus } from '@/modules/devolucoes/dominio';
import { ErroDevolucao } from '@/modules/devolucoes/erros';
import { criarNaoIdentificada, receberPorRastreio } from '@/modules/devolucoes/recebimento';

export type EstadoRecebimento =
  | { tipo: 'inicial' }
  | { tipo: 'sucesso'; titulo: string; mensagem: string; codigos: string[] }
  | { tipo: 'aviso'; titulo: string; mensagem: string; codigos: string[] }
  | { tipo: 'nao_encontrada'; rastreio: string }
  | { tipo: 'erro'; mensagem: string };

export async function registrarChegadaAcao(_anterior: EstadoRecebimento, dados: FormData): Promise<EstadoRecebimento> {
  const usuario = await exigirPermissao('operar_devolucoes');
  const rastreio = String(dados.get('rastreio') ?? '');
  const db = obterDb();
  try {
    if (dados.get('intencao') === 'criar_nao_identificada') {
      const criada = await criarNaoIdentificada(db, rastreio, usuario);
      revalidatePath('/fluxo');
      return {
        tipo: 'sucesso',
        titulo: 'Pacote não identificado registrado',
        mensagem: `${criada.codigo} foi para "Pedidos Chegados - Aguardando Conferência", marcada como não identificada. O Gestor liga ao pedido depois.`,
        codigos: [criada.codigo],
      };
    }
    const r = await receberPorRastreio(db, rastreio, usuario);
    switch (r.tipo) {
      case 'recebidas':
        revalidatePath('/fluxo');
        return { tipo: 'sucesso', titulo: 'Chegada registrada', mensagem: `${r.codigos.join(', ')} · ${formatarDataHora(r.em)}`, codigos: r.codigos };
      case 'ja_recebida':
        return {
          tipo: 'aviso',
          titulo: 'Este pacote já chegou',
          mensagem: `${r.codigo} já tinha chegado${r.recebidaEm ? ` em ${formatarDataHora(r.recebidaEm)}` : ''}. Status: ${rotuloStatus(r.status)}.`,
          codigos: [r.codigo],
        };
      case 'bloqueada':
        return {
          tipo: 'aviso',
          titulo: 'Fale com o Gestor',
          mensagem: `${r.codigo} está ${rotuloStatus(r.status).toLowerCase()}. Separe o pacote e avise o Gestor.`,
          codigos: [r.codigo],
        };
      case 'nao_encontrada':
        return { tipo: 'nao_encontrada', rastreio: r.rastreio };
    }
  } catch (erro) {
    if (erro instanceof ErroDevolucao) return { tipo: 'erro', mensagem: erro.message };
    throw erro;
  }
}
```

- [ ] **Passo 5: Tela do Recebimento (uma mão, câmera em tela cheia)**

`src/app/(app)/fluxo/recebimento/FormularioRecebimento.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useActionState, useCallback, useRef } from 'react';
import { ALERTA_ERRO, BOTAO_PRIMARIO, CAMPO, ROTULO } from '@/components/estilos';
import { useLeitorCamera } from '@/components/leitor/useLeitorCamera';
import { registrarChegadaAcao, type EstadoRecebimento } from './acoes';

const INICIAL: EstadoRecebimento = { tipo: 'inicial' };

function LinksDevolucoes({ codigos }: { codigos: string[] }) {
  return (
    <span className="flex flex-wrap gap-x-4">
      {codigos.map((codigo) => (
        <Link key={codigo} href={`/fluxo/devolucoes/${codigo}`} className="inline-flex min-h-11 items-center font-mono font-semibold underline">
          {codigo}
        </Link>
      ))}
    </span>
  );
}

/** Resposta grande e clara depois de cada leitura. A área fica sempre no DOM para o leitor de tela anunciar (aria-live). */
function Resultado({ estado, acao, pendente }: { estado: EstadoRecebimento; acao: (dados: FormData) => void; pendente: boolean }) {
  return (
    <div role="status" aria-live="polite">
      {estado.tipo === 'sucesso' && (
        <div className="flex flex-col gap-1 rounded-2xl bg-bom-suave p-4 text-bom">
          <p className="text-lg font-bold">{estado.titulo}</p>
          <p className="text-[15px] font-medium">{estado.mensagem}</p>
          <LinksDevolucoes codigos={estado.codigos} />
        </div>
      )}
      {estado.tipo === 'aviso' && (
        <div className="flex flex-col gap-1 rounded-2xl bg-atencao-suave p-4 text-atencao">
          <p className="text-lg font-bold">{estado.titulo}</p>
          <p className="text-[15px] font-medium">{estado.mensagem}</p>
          <LinksDevolucoes codigos={estado.codigos} />
        </div>
      )}
      {estado.tipo === 'nao_encontrada' && (
        <div className="flex flex-col gap-3 rounded-2xl bg-atencao-suave p-4 text-atencao">
          <p className="text-lg font-bold">Rastreio não encontrado</p>
          <p className="text-[15px] font-medium">
            Nenhuma devolução com o rastreio <span className="break-all font-mono">{estado.rastreio}</span>.
          </p>
          <form action={acao}>
            <input type="hidden" name="intencao" value="criar_nao_identificada" />
            <input type="hidden" name="rastreio" value={estado.rastreio} />
            <button type="submit" disabled={pendente} className={`${BOTAO_PRIMARIO} w-full`}>
              Criar devolução não identificada
            </button>
          </form>
        </div>
      )}
      {estado.tipo === 'erro' && <p className={`${ALERTA_ERRO} text-[15px]`}>{estado.mensagem}</p>}
    </div>
  );
}

/**
 * Recebimento (spec §6.2). Mobile-first e para uma mão: a resposta em cima, o campo e os botões grandes embaixo.
 * O campo de texto fica sempre à vista (digitação ou leitor USB, que "digita" e manda Enter).
 * Com a câmera aberta, o vídeo ocupa a tela e o painel com o campo fica embaixo.
 */
export function FormularioRecebimento() {
  const [estado, acao, pendente] = useActionState(registrarChegadaAcao, INICIAL);
  const formularioRef = useRef<HTMLFormElement>(null);
  const campoRef = useRef<HTMLInputElement>(null);
  const aoLer = useCallback((codigo: string) => {
    const campo = campoRef.current;
    const formulario = formularioRef.current;
    if (!campo || !formulario) return;
    campo.value = codigo;
    formulario.requestSubmit();
  }, []);
  const camera = useLeitorCamera(aoLer);
  const cameraAberta = camera.situacao !== 'parada';

  return (
    <div className={cameraAberta ? 'fixed inset-0 z-50 flex flex-col bg-black' : 'flex flex-col gap-4'}>
      <div className={cameraAberta ? 'relative min-h-0 flex-1' : 'hidden'}>
        <video ref={camera.videoRef} playsInline muted aria-label="Imagem da câmera" className="h-full w-full object-cover" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-white/80" />
        {camera.situacao === 'abrindo' && (
          <p className="absolute inset-x-0 top-6 text-center text-sm font-semibold text-white">Abrindo a câmera…</p>
        )}
      </div>
      <div className={cameraAberta ? 'painel-inferior flex flex-col gap-3 rounded-t-2xl bg-superficie px-4 pt-4' : 'flex flex-col gap-4'}>
        <Resultado estado={estado} acao={acao} pendente={pendente} />
        <form ref={formularioRef} action={acao} className="flex flex-col gap-3">
          <input type="hidden" name="intencao" value="receber" />
          <label htmlFor="rastreio" className={ROTULO}>
            Código de Rastreamento
          </label>
          <input
            ref={campoRef}
            id="rastreio"
            name="rastreio"
            required
            autoFocus
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            className={`${CAMPO} h-14 font-mono text-lg`}
          />
          <button type="submit" disabled={pendente} className={`${BOTAO_PRIMARIO} min-h-14 text-lg`}>
            {pendente ? 'Registrando…' : 'Registrar chegada'}
          </button>
        </form>
        <button
          type="button"
          onClick={cameraAberta ? camera.fechar : camera.abrir}
          className={`flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl text-lg font-semibold ${
            cameraAberta ? 'border border-borda-forte bg-superficie text-texto' : 'bg-texto text-white'
          }`}
        >
          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2M7 12h10" />
          </svg>
          {cameraAberta ? 'Fechar câmera' : 'Ler com a câmera'}
        </button>
        {camera.erro && (
          <p role="alert" className={ALERTA_ERRO}>
            {camera.erro}
          </p>
        )}
      </div>
    </div>
  );
}
```

`src/app/(app)/fluxo/recebimento/page.tsx`:

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { LINK_VOLTAR } from '@/components/estilos';
import { exigirPermissao } from '@/modules/auth/servidor';
import { FormularioRecebimento } from './FormularioRecebimento';

export const metadata: Metadata = { title: 'Recebimento · Gestão de Devoluções' };

export default async function PaginaRecebimento() {
  await exigirPermissao('operar_devolucoes');
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-3">
      <Link href="/fluxo/etapa/2" className={LINK_VOLTAR}>
        ← Pedidos Chegados - Aguardando Conferência
      </Link>
      <div>
        <h1 className="text-xl font-bold">Recebimento</h1>
        <p className="text-sm text-texto-2">Leia ou digite o código de rastreamento do pacote para registrar a chegada.</p>
      </div>
      <FormularioRecebimento />
    </div>
  );
}
```

Em `src/app/(app)/fluxo/etapa/[numero]/page.tsx`, substitua a função `acoesDaEtapa` inteira por:

```tsx
/** Botões do topo de cada etapa (só para quem opera devoluções). */
function acoesDaEtapa(numero: number, podeOperar: boolean): ReactNode {
  if (!podeOperar) return null;
  if (numero === 1) {
    return (
      <Link href="/fluxo/devolucoes/nova" className={BOTAO_PRIMARIO}>
        Nova devolução
      </Link>
    );
  }
  if (numero === 2) {
    return (
      <Link href="/fluxo/recebimento" className={BOTAO_PRIMARIO}>
        Recebimento
      </Link>
    );
  }
  return null;
}
```

Rode: `npm run typecheck && npm run lint`
Esperado: sem erros.

- [ ] **Passo 6: Testes ponta a ponta (no computador e no celular)**

Em `tests/e2e/global-setup.ts`, acrescente `'/fluxo/recebimento',` na lista `ROTAS_AQUECIMENTO`, logo antes do `];`.

`tests/e2e/recebimento.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { criarDevolucaoTeste } from '../helpers/fabricas';
import { codigoUnico, comBanco, entrar, semRolagemLateral, usuarioPorEmail } from './apoio';
import { USUARIOS_E2E } from './dados';

test('operador registra a chegada digitando o rastreio (como faz o leitor USB)', async ({ page }) => {
  const rastreio = codigoUnico('RC');
  const codigo = await comBanco(async (db) => {
    const operador = await usuarioPorEmail(db, USUARIOS_E2E.operador.email);
    return (await criarDevolucaoTeste(db, operador, { rastreio })).codigo;
  });
  await entrar(page, USUARIOS_E2E.operador);
  await page.goto('/fluxo/etapa/2');
  await page.getByRole('link', { name: 'Recebimento' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Recebimento' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ler com a câmera' })).toBeVisible();
  await semRolagemLateral(page);

  const campo = page.getByLabel('Código de Rastreamento');
  const resultado = page.getByRole('status');
  await campo.fill(rastreio.toLowerCase());
  await campo.press('Enter');
  await expect(resultado).toContainText('Chegada registrada');
  await expect(resultado).toContainText(codigo);
  await expect(campo).toHaveValue('');

  await campo.fill(rastreio);
  await page.getByRole('button', { name: 'Registrar chegada' }).click();
  await expect(resultado).toContainText(`${codigo} já tinha chegado`);

  await page.goto('/fluxo/etapa/2');
  await page.getByRole('link', { name: new RegExp(codigo) }).click();
  await expect(page.getByText('Chegada registrada')).toBeVisible();
});

test('rastreio desconhecido vira devolução não identificada', async ({ page }) => {
  const rastreio = codigoUnico('NI');
  await entrar(page, USUARIOS_E2E.operador);
  await page.goto('/fluxo/recebimento');
  await page.getByLabel('Código de Rastreamento').fill(rastreio);
  await page.getByRole('button', { name: 'Registrar chegada' }).click();
  await expect(page.getByRole('status')).toContainText(`Nenhuma devolução com o rastreio ${rastreio}`);
  await page.getByRole('button', { name: 'Criar devolução não identificada' }).click();
  await expect(page.getByRole('status')).toContainText('Pacote não identificado registrado');
  await page.getByRole('status').getByRole('link').click();
  await expect(page.getByText('Não identificada').first()).toBeVisible();
});

test('o Fiscal não abre o Recebimento (HTTP 404)', async ({ page }) => {
  await entrar(page, USUARIOS_E2E.fiscal);
  const resposta = await page.goto('/fluxo/recebimento');
  expect(resposta?.status()).toBe(404);
});
```

Rode: `npm run test:e2e`
Esperado: PASS em `computador` e `celular`.

- [ ] **Passo 7: Commit**

```bash
cd "/c/Users/idmpc/Dvoluções Markt"
git add -A
git commit -m "feat: recebimento com câmera em tela cheia (BarcodeDetector ou ZXing) e campo de texto" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Passo 8: Teste no celular de verdade (com o usuário, depois do deploy)**

A câmera só abre em HTTPS, então este teste é feito na VPS, depois que o controlador fizer o merge e o deploy (o implementador não faz `git push`):
1. No celular da bancada, abra o endereço do sistema, entre como Operador e toque em **Recebimento**.
2. Toque em **Ler com a câmera** e permita a câmera. Aponte para a etiqueta de uma devolução cadastrada: deve aparecer "Chegada registrada" (no Android o aparelho vibra).
3. Aponte para um código desconhecido: deve aparecer "Rastreio não encontrado" e o botão "Criar devolução não identificada".
4. Repita num iPhone (usa o ZXing). Anote o modelo de cada aparelho testado (spec §16: testar os aparelhos reais da bancada).

---

### Tarefa 12: Importação de devoluções por planilha (spec §6.1)

**Arquivos:**
- Criar: `src/modules/importacao/definicoes/devolucoes.ts`
- Modificar (substituir o conteúdo): `src/modules/importacao/definicoes/index.ts`
- Modificar: `src/app/(app)/fluxo/etapa/[numero]/page.tsx` (botão "Importar planilha" na etapa 1), `tests/e2e/global-setup.ts`
- Testes: `src/modules/importacao/devolucoes.int.test.ts`, `tests/e2e/importacao-devolucoes.spec.ts`

**Interfaces:**
- Consome: `DefinicaoImportacao`, `dadosOuErro`, `registrarUpload`, `obterImportacao`, `mapeamentoEfetivo`, `calcularPrevia`, `confirmarImportacao` (Tarefa 4); telas de importação (Tarefa 6); `validarNovaDevolucao`, `criarDevolucao`, `codigosAtivosPorPedido`, `chavePedido`, `interpretarCanal`, `normalizarRastreio`, `DadosNovaDevolucao`, `ErroTransicao` (Tarefa 7); `obterDetalhe` (Tarefa 8); `idsDosProdutos` (Tarefa 2)
- Produz:
  - `definicaoDevolucoes` (tipo `devolucoes`, permissão `operar_devolucoes`, volta para `/fluxo/etapa/1`), registrada em `obterDefinicao`
  - colunas do modelo da spec §6.1: `canal, numero_pedido, id_reclamacao, rastreio, transportadora, sku, quantidade, motivo_cliente, data_postagem`
  - regra: linhas com o mesmo canal, pedido, rastreio e reclamação viram **uma** devolução, com um item (SKU + quantidade) por linha; um pedido com qualquer linha errada fica de fora inteiro

- [ ] **Passo 1: Escrever o teste de integração que falha**

`src/modules/importacao/devolucoes.int.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { obterDetalhe } from '@/modules/devolucoes/detalhe';
import { ErroTransicao } from '@/modules/devolucoes/transicoes';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarProdutoTeste, criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import type { DefinicaoImportacao } from './definicao';
import { obterDefinicao } from './definicoes';
import { calcularPrevia, confirmarImportacao, mapeamentoEfetivo, obterImportacao, registrarUpload } from './servico';

const { db, sql } = criarDbTeste();
let operador: UsuarioSessao;
const CABECALHOS = ['Marketplace', 'Pedido', 'Reclamação', 'Rastreio', 'Transportadora', 'SKU', 'Qtd', 'Motivo', 'Data de postagem'];

function definicao(): DefinicaoImportacao {
  const def = obterDefinicao('devolucoes');
  if (!def) throw new Error('sem definição de devoluções');
  return def;
}

async function enviar(linhas: string[][]) {
  const id = await registrarUpload(db, {
    tipo: 'devolucoes',
    nomeArquivo: 'devolucoes.csv',
    planilha: { cabecalhos: CABECALHOS, linhas },
    usuarioId: operador.id,
  });
  const imp = await obterImportacao(db, id, 'devolucoes');
  if (!imp) throw new Error('importação não gravada');
  return imp;
}

beforeEach(async () => {
  await limparTabelas(sql);
  operador = await criarUsuarioTeste(db, 'OPERADOR');
});
afterAll(async () => {
  await sql.end();
});

describe('importação de devoluções', () => {
  it('é feita por quem opera devoluções e volta para a etapa 1', () => {
    expect(definicao()).toMatchObject({ acao: 'operar_devolucoes', voltarPara: '/fluxo/etapa/1', rotuloAtualizados: null });
  });

  it('sugere as colunas do modelo da spec §6.1', async () => {
    const imp = await enviar([['Shopee', 'SHP-1', '', 'BR1', '', 'FONE-01', '1', '', '']]);
    expect(await mapeamentoEfetivo(db, definicao(), imp)).toEqual({
      canal: 'Marketplace',
      numero_pedido: 'Pedido',
      id_reclamacao: 'Reclamação',
      rastreio: 'Rastreio',
      transportadora: 'Transportadora',
      sku: 'SKU',
      quantidade: 'Qtd',
      motivo_cliente: 'Motivo',
      data_postagem: 'Data de postagem',
    });
  });

  it('junta as linhas do mesmo pedido, avisa SKU fora do cadastro e aponta os erros de cada linha', async () => {
    await criarProdutoTeste(db, { sku: 'FONE-01' });
    const imp = await enviar([
      ['Shopee', 'SHP-1', '', 'BR1', 'Correios', 'FONE-01', '1', 'Defeito', '05/11/2026'],
      ['Shopee', 'SHP-1', '', 'BR1', 'Correios', 'CABO-99', '2', 'Defeito', '05/11/2026'],
      ['Amazon', 'AMZ-2', '', 'BR2', 'Correios', 'FONE-01', '', '', ''],
      ['Loja X', 'X-3', '', 'BR3', '', 'FONE-01', '1', '', ''],
      ['Magalu', 'MGL-4', '', 'BR4', '', 'FONE-01', '1', '', ''],
      ['Magalu', 'MGL-4', '', 'BR4', '', '', '1', '', ''],
      ['Amazon', 'AMZ-2', '', 'BR9', '', 'FONE-01', '1', '', ''],
    ]);
    const def = definicao();
    const previa = await calcularPrevia(db, def, imp, await mapeamentoEfetivo(db, def, imp));
    expect(previa.linhas.map((l) => [l.numeroLinha, l.erros, l.avisos])).toEqual([
      [2, [], []],
      [3, [], ['SKU CABO-99 fora do cadastro de produtos']],
      [4, [], []],
      [5, ['Canal desconhecido: Loja X'], []],
      [6, ['Outra linha deste pedido tem erro (linha 7); o pedido inteiro fica de fora'], []],
      [7, ['Informe o SKU'], []],
      [8, ['O pedido AMZ-2 aparece com outro rastreio ou reclamação na linha 4'], []],
    ]);
    expect(previa.validas).toBe(3);
  });

  it('confirma: uma devolução por pedido, uma linha por unidade, com origem Planilha', async () => {
    const def = definicao();
    const imp = await enviar([
      ['Shopee', 'SHP-1', 'R-1', 'br 1', 'Correios', 'FONE-01', '1', 'Defeito', '05/11/2026'],
      ['Shopee', 'SHP-1', 'R-1', 'BR1', 'Correios', 'CABO-02', '2', 'Defeito', '05/11/2026'],
      ['Amazon', 'AMZ-2', '', 'BR2', '', 'FONE-01', '1', '', ''],
    ]);
    const resumo = await confirmarImportacao(db, def, imp, await mapeamentoEfetivo(db, def, imp), operador);
    expect(resumo).toEqual({ criados: 2, atualizados: 0, ignorados: 0, linhasComErro: [] });
    const shopee = await obterDetalhe(db, 'DEV-000001');
    expect(shopee).toMatchObject({
      canal: 'SHOPEE',
      origem: 'PLANILHA',
      pedidos: ['SHP-1'],
      reclamacaoId: 'R-1',
      rastreio: 'BR1',
      motivoCliente: 'Defeito',
      postadaEm: '2026-11-05',
      status: 'PENDENTE_CHEGADA',
    });
    expect(shopee?.itens.map((i) => i.sku)).toEqual(['FONE-01', 'CABO-02', 'CABO-02']);
  });

  it('a mesma planilha de novo não duplica: o pedido já tem devolução', async () => {
    const def = definicao();
    const linhas = [['Shopee', 'SHP-1', '', 'BR1', '', 'FONE-01', '1', '', '']];
    const primeira = await enviar(linhas);
    await confirmarImportacao(db, def, primeira, await mapeamentoEfetivo(db, def, primeira), operador);
    const segunda = await enviar(linhas);
    const previa = await calcularPrevia(db, def, segunda, await mapeamentoEfetivo(db, def, segunda));
    expect(previa.linhas[0].erros).toEqual(['Já existe a devolução DEV-000001 para este pedido neste canal']);
  });

  it('o Fiscal não importa devoluções e nada fica gravado', async () => {
    const def = definicao();
    const fiscal = await criarUsuarioTeste(db, 'FISCAL');
    const imp = await enviar([['Shopee', 'SHP-1', '', 'BR1', '', 'FONE-01', '1', '', '']]);
    await expect(confirmarImportacao(db, def, imp, await mapeamentoEfetivo(db, def, imp), fiscal)).rejects.toBeInstanceOf(ErroTransicao);
    expect((await obterImportacao(db, imp.id, 'devolucoes'))?.situacao).toBe('PENDENTE');
    expect(await obterDetalhe(db, 'DEV-000001')).toBeNull();
  });
});
```

Rode: `npm run test:int`
Esperado: FAIL (`obterDefinicao('devolucoes')` ainda devolve null).

- [ ] **Passo 2: Implementar a definição**

`src/modules/importacao/definicoes/devolucoes.ts`:

```ts
import { idsDosProdutos } from '@/modules/catalogo/produtos';
import { interpretarCanal } from '@/modules/devolucoes/canais';
import {
  chavePedido,
  codigosAtivosPorPedido,
  criarDevolucao,
  validarNovaDevolucao,
  type DadosNovaDevolucao,
} from '@/modules/devolucoes/criar';
import type { Canal } from '@/modules/devolucoes/dominio';
import { normalizarRastreio } from '@/modules/devolucoes/rastreio';
import { dadosOuErro, type DefinicaoImportacao } from '../definicao';

function interpretarLinha(v: Record<string, string>) {
  return validarNovaDevolucao({
    canal: v.canal ?? '',
    pedido: v.numero_pedido ?? '',
    reclamacaoId: v.id_reclamacao,
    rastreio: v.rastreio,
    transportadora: v.transportadora,
    motivoCliente: v.motivo_cliente,
    postadaEm: v.data_postagem,
    itens: [{ sku: v.sku ?? '', quantidade: v.quantidade ?? '' }],
  });
}

/** Linhas com o mesmo canal, pedido, rastreio e reclamação são o mesmo pacote: viram uma devolução só. */
function chaveDaLinha(v: Record<string, string>): string {
  const canalTexto = (v.canal ?? '').trim();
  return [
    interpretarCanal(canalTexto) ?? canalTexto.toUpperCase(),
    (v.numero_pedido ?? '').trim(),
    normalizarRastreio(v.rastreio ?? ''),
    (v.id_reclamacao ?? '').trim(),
  ].join('|');
}

/** Modelo sugerido da spec §6.1: canal, numero_pedido, id_reclamacao, rastreio, transportadora, sku, quantidade, motivo_cliente, data_postagem. */
export const definicaoDevolucoes: DefinicaoImportacao = {
  tipo: 'devolucoes',
  titulo: 'Devoluções',
  acao: 'operar_devolucoes',
  voltarPara: '/fluxo/etapa/1',
  rotuloCriados: 'Devoluções criadas',
  rotuloAtualizados: null,
  campos: [
    { chave: 'canal', rotulo: 'Canal (marketplace)', obrigatorio: true, sinonimos: ['marketplace', 'canal', 'loja', 'origem', 'plataforma'] },
    { chave: 'numero_pedido', rotulo: 'Número do pedido', obrigatorio: true, sinonimos: ['pedido', 'numero do pedido', 'n do pedido', 'id do pedido', 'order id'] },
    { chave: 'id_reclamacao', rotulo: 'ID da reclamação', obrigatorio: false, sinonimos: ['reclamacao', 'id reclamacao', 'mediacao', 'id da mediacao', 'claim'] },
    { chave: 'rastreio', rotulo: 'Código de rastreamento', obrigatorio: false, sinonimos: ['rastreio', 'rastreamento', 'codigo de rastreio', 'tracking', 'objeto'] },
    { chave: 'transportadora', rotulo: 'Transportadora', obrigatorio: false, sinonimos: ['transportadora', 'carrier'] },
    { chave: 'sku', rotulo: 'SKU', obrigatorio: true, sinonimos: ['sku', 'codigo', 'codigo do produto', 'referencia'] },
    { chave: 'quantidade', rotulo: 'Quantidade', obrigatorio: false, sinonimos: ['quantidade', 'qtd', 'qtde', 'quant'] },
    { chave: 'motivo_cliente', rotulo: 'Motivo do cliente', obrigatorio: false, sinonimos: ['motivo', 'motivo da devolucao', 'motivo cliente'] },
    { chave: 'data_postagem', rotulo: 'Data de postagem', obrigatorio: false, sinonimos: ['postagem', 'data postagem', 'data de envio'] },
  ],

  async validar(db, linhas) {
    const itens = linhas.map((linha) => ({ linha, chave: chaveDaLinha(linha.valores), ...interpretarLinha(linha.valores) }));
    const erros = itens.map((i) => [...i.erros]);
    const avisos = itens.map((): string[] => []);

    const grupos = new Map<string, number[]>();
    itens.forEach((item, i) => grupos.set(item.chave, [...(grupos.get(item.chave) ?? []), i]));

    // O pedido de cada grupo (quando ao menos uma linha dele é válida).
    const pedidos: { indices: number[]; canal: Canal; pedido: string }[] = [];
    for (const indices of grupos.values()) {
      const dados = indices.map((i) => itens[i].dados).find((d) => d !== null);
      if (dados) pedidos.push({ indices, canal: dados.canal, pedido: dados.pedido });
    }

    // O mesmo pedido em dois pacotes diferentes (outro rastreio ou outra reclamação).
    const primeiraLinhaDoPedido = new Map<string, number>();
    for (const p of pedidos) {
      const chave = chavePedido(p.canal, p.pedido);
      const anterior = primeiraLinhaDoPedido.get(chave);
      if (anterior !== undefined) {
        p.indices.forEach((i) => erros[i].push(`O pedido ${p.pedido} aparece com outro rastreio ou reclamação na linha ${anterior}`));
      } else {
        primeiraLinhaDoPedido.set(chave, itens[p.indices[0]].linha.numeroLinha);
      }
    }

    // O pedido já tem devolução em andamento (uma planilha enviada duas vezes não duplica).
    const ativos = await codigosAtivosPorPedido(db, pedidos.map(({ canal, pedido }) => ({ canal, pedido })));
    for (const p of pedidos) {
      const codigo = ativos.get(chavePedido(p.canal, p.pedido));
      if (codigo) p.indices.forEach((i) => erros[i].push(`Já existe a devolução ${codigo} para este pedido neste canal`));
    }

    // SKU fora do cadastro é só aviso: a bancada não para por isso.
    const skus = [...new Set(itens.flatMap((i) => i.dados?.itens.map((x) => x.sku) ?? []))];
    const cadastrados = await idsDosProdutos(db, skus);
    itens.forEach((item, i) =>
      item.dados?.itens.forEach((x) => {
        if (!cadastrados.has(x.sku)) avisos[i].push(`SKU ${x.sku} fora do cadastro de produtos`);
      }),
    );

    // Um pedido com qualquer linha errada fica de fora inteiro (não dá para gravar meia devolução).
    for (const indices of grupos.values()) {
      const comErro = indices.find((i) => erros[i].length > 0);
      if (comErro === undefined) continue;
      const numero = itens[comErro].linha.numeroLinha;
      indices.forEach((i) => {
        if (erros[i].length === 0) erros[i].push(`Outra linha deste pedido tem erro (linha ${numero}); o pedido inteiro fica de fora`);
      });
    }

    return itens.map(({ linha }, i) => ({ ...linha, erros: erros[i], avisos: avisos[i] }));
  },

  async aplicar(db, linhas, usuario) {
    const grupos = new Map<string, DadosNovaDevolucao>();
    for (const linha of linhas) {
      const dados = dadosOuErro(interpretarLinha(linha.valores), linha.numeroLinha);
      const chave = chaveDaLinha(linha.valores);
      const grupo = grupos.get(chave);
      if (grupo) grupo.itens.push(...dados.itens);
      else grupos.set(chave, { ...dados, itens: [...dados.itens] });
    }
    for (const dados of grupos.values()) {
      await criarDevolucao(db, dados, { origem: 'PLANILHA', usuario });
    }
    return { criados: grupos.size, atualizados: 0 };
  },
};
```

`src/modules/importacao/definicoes/index.ts` (substitui todo o conteúdo):

```ts
import type { DefinicaoImportacao } from '../definicao';
import { ehTipoImportacao, type TipoImportacao } from '../tipos';
import { definicaoDevolucoes } from './devolucoes';
import { definicaoFornecedores } from './fornecedores';
import { definicaoProdutos } from './produtos';

const DEFINICOES: Record<TipoImportacao, DefinicaoImportacao> = {
  produtos: definicaoProdutos,
  fornecedores: definicaoFornecedores,
  devolucoes: definicaoDevolucoes,
};

export function obterDefinicao(tipo: string): DefinicaoImportacao | null {
  return ehTipoImportacao(tipo) ? DEFINICOES[tipo] : null;
}
```

Rode: `npm run test:int`
Esperado: PASS.

- [ ] **Passo 3: Botão "Importar planilha" na etapa 1**

Em `src/app/(app)/fluxo/etapa/[numero]/page.tsx`:
- troque `import { BOTAO_PRIMARIO } from '@/components/estilos';` por `import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from '@/components/estilos';`
- substitua a função `acoesDaEtapa` inteira por:

```tsx
/** Botões do topo de cada etapa (só para quem opera devoluções). Spec §6.1: "Nova devolução" e "Importar planilha". */
function acoesDaEtapa(numero: number, podeOperar: boolean): ReactNode {
  if (!podeOperar) return null;
  if (numero === 1) {
    return (
      <>
        <Link href="/fluxo/devolucoes/nova" className={BOTAO_PRIMARIO}>
          Nova devolução
        </Link>
        <Link href="/importacoes/devolucoes" className={BOTAO_SECUNDARIO}>
          Importar planilha
        </Link>
      </>
    );
  }
  if (numero === 2) {
    return (
      <Link href="/fluxo/recebimento" className={BOTAO_PRIMARIO}>
        Recebimento
      </Link>
    );
  }
  return null;
}
```

Em `tests/e2e/global-setup.ts`, acrescente `'/importacoes/devolucoes',` na lista `ROTAS_AQUECIMENTO`, logo antes do `];`.

- [ ] **Passo 4: Teste ponta a ponta (no computador e no celular)**

`tests/e2e/importacao-devolucoes.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { codigoUnico, entrar, semRolagemLateral } from './apoio';
import { USUARIOS_E2E } from './dados';

test('operador importa devoluções por planilha: uma por pedido, uma linha por unidade', async ({ page }) => {
  const [p1, p2, r1, r2, r3] = [codigoUnico('SHP'), codigoUnico('AMZ'), codigoUnico('IM'), codigoUnico('IM'), codigoUnico('IM')];
  const csv = [
    'Marketplace;Pedido;Reclamação;Rastreio;Transportadora;SKU;Qtd;Motivo;Data de postagem',
    `Shopee;${p1};;${r1};Correios;FONE-01;1;Defeito;05/11/2026`,
    `Shopee;${p1};;${r1};Correios;CABO-02;2;Defeito;05/11/2026`,
    `Amazon;${p2};;${r2};Correios;FONE-01;1;Arrependimento;06/11/2026`,
    `Magalu;;;${r3};Correios;FONE-01;1;;`,
  ].join('\r\n');

  await entrar(page, USUARIOS_E2E.operador);
  await page.goto('/fluxo/etapa/1');
  await page.getByRole('link', { name: 'Importar planilha' }).click();
  await page.getByLabel('Planilha').setInputFiles({ name: 'devolucoes.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await page.getByRole('button', { name: 'Enviar planilha' }).click();

  await expect(page.getByLabel('Número do pedido (obrigatório)')).toHaveValue('Pedido');
  await expect(page.getByText(/3 linhas prontas/)).toBeVisible();
  await expect(page.getByText('Informe o número do pedido')).toBeVisible();
  await semRolagemLateral(page);
  await page.getByRole('button', { name: 'Confirmar importação' }).click();
  await expect(page.getByRole('status')).toContainText('Devoluções criadas: 2');
  await expect(page.getByRole('status')).toContainText('Linhas com erro (ignoradas): 1 (linha 5)');

  await page.goto(`/fluxo/busca?rastreio=${r1}`);
  await page.getByRole('link', { name: /DEV-\d{6}/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Itens (3 unidades)' })).toBeVisible();
  await expect(page.getByText('Planilha', { exact: true })).toBeVisible();
});
```

Rode: `npm run test:e2e`
Esperado: PASS em `computador` e `celular`.

- [ ] **Passo 5: Commit**

```bash
cd "/c/Users/idmpc/Dvoluções Markt"
git add -A
git commit -m "feat: importação de devoluções por planilha, agrupando por pedido" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 13: Quadro de Fluxo com dados reais (5 colunas no computador, seletor de etapas no celular)

**Arquivos:**
- Criar: `src/modules/devolucoes/quadro.ts`, `src/components/EtapasCelular.tsx`
- Modificar (substituir o conteúdo): `src/components/QuadroFluxo.tsx`, `src/components/QuadroFluxo.test.tsx`, `src/app/(app)/fluxo/page.tsx`
- Modificar: `tests/e2e/login.spec.ts` (as etapas no celular)
- Testes: `src/modules/devolucoes/quadro.int.test.ts`, `src/components/EtapasCelular.test.tsx`, `tests/e2e/fluxo.spec.ts`

**Interfaces:**
- Consome: `buscarDevolucoes`, `ResumoDevolucao`, `CartaoDevolucao`, `BuscaAvancada` (Tarefa 9); `statusDaEtapa`, `criarDevolucaoTeste` (Tarefa 7); `receberPorRastreio` (Tarefa 8); `primeiroValor`, `ParametrosBusca`, estilos (Tarefa 5); `ETAPAS`, `pode` (Fase 0); `abrirBusca`, `comBanco`, `usuarioPorEmail`, `codigoUnico`, `ehCelular` (Tarefas 1 e 10)
- Produz:
  - em `quadro.ts`: `CARTOES_POR_COLUNA = 5`, `type ColunaQuadro = { numero: number; titulo: string; total: number; cartoes: ResumoDevolucao[]; href: string }`, `montarQuadro(db, agora?): Promise<ColunaQuadro[]>`
  - `QuadroFluxo({ colunas })` com `type ColunaFluxo = { numero; titulo; total; cartoes?: ResumoDevolucao[]; href?: string }` (compatível com a Fase 0): total com texto para leitor de tela ("3 devoluções", pendência da Fase 0) e link "+ N devoluções" / "Ver lista"
  - `EtapasCelular({ colunas, selecionada })`: navegação "Etapas" com 5 botões (número e total; nome completo do PDF no nome acessível) e os cartões da etapa escolhida (`/fluxo?etapa=N`)

- [ ] **Passo 1: Escrever os testes que falham**

`src/components/QuadroFluxo.test.tsx` (substitui todo o conteúdo):

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ResumoDevolucao } from '@/modules/devolucoes/busca';
import { ETAPAS } from '@/modules/devolucoes/etapas';
import { QuadroFluxo } from './QuadroFluxo';

const CARTAO: ResumoDevolucao = {
  id: '1',
  codigo: 'DEV-000001',
  canal: 'SHOPEE',
  status: 'PENDENTE_CHEGADA',
  rastreio: 'BR123',
  pedidos: ['SHP-1'],
  produto: 'Fone Bluetooth',
  unidades: 1,
  naoIdentificada: false,
  criadaEm: new Date('2026-11-12T12:00:00Z'),
  recebidaEm: null,
  selos: [],
};
const ETAPA_1 = 'Pedidos Pendentes de Chegada';

describe('QuadroFluxo', () => {
  it('mostra uma coluna por etapa do PDF, com título, total e aviso de vazio', () => {
    render(<QuadroFluxo colunas={ETAPAS.map((e) => ({ numero: e.numero, titulo: e.titulo, total: 0 }))} />);
    for (const etapa of ETAPAS) {
      expect(screen.getByRole('heading', { level: 2, name: etapa.titulo })).toBeTruthy();
    }
    expect(screen.getAllByText('Nenhuma devolução nesta etapa')).toHaveLength(5);
  });

  it('o total da coluna tem texto para o leitor de tela', () => {
    render(<QuadroFluxo colunas={[{ numero: 1, titulo: ETAPA_1, total: 3 }]} />);
    expect(screen.queryByText('Nenhuma devolução nesta etapa')).toBeNull();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('3 devoluções')).toBeTruthy();
  });

  it('mostra os cartões e o link "+ N devoluções" para a lista da etapa', () => {
    render(<QuadroFluxo colunas={[{ numero: 1, titulo: ETAPA_1, total: 7, cartoes: [CARTAO], href: '/fluxo/etapa/1' }]} />);
    expect(screen.getByRole('link', { name: /DEV-000001/ }).getAttribute('href')).toBe('/fluxo/devolucoes/DEV-000001');
    expect(screen.getByRole('link', { name: `+ 6 devoluções em ${ETAPA_1}` }).getAttribute('href')).toBe('/fluxo/etapa/1');
  });

  it('quando todos os cartões cabem, o link é "Ver lista"', () => {
    render(<QuadroFluxo colunas={[{ numero: 1, titulo: ETAPA_1, total: 1, cartoes: [CARTAO], href: '/fluxo/etapa/1' }]} />);
    expect(screen.getByRole('link', { name: `Ver lista: ${ETAPA_1}` })).toBeTruthy();
  });
});
```

`src/components/EtapasCelular.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ResumoDevolucao } from '@/modules/devolucoes/busca';
import { ETAPAS } from '@/modules/devolucoes/etapas';
import { EtapasCelular } from './EtapasCelular';

const CARTAO: ResumoDevolucao = {
  id: '1',
  codigo: 'DEV-000001',
  canal: 'AMAZON',
  status: 'AGUARDANDO_CONFERENCIA',
  rastreio: 'BR123',
  pedidos: ['AMZ-1'],
  produto: 'Fone Bluetooth',
  unidades: 1,
  naoIdentificada: false,
  criadaEm: new Date('2026-11-12T12:00:00Z'),
  recebidaEm: new Date('2026-11-12T13:00:00Z'),
  selos: [],
};

const COLUNAS = ETAPAS.map((e) => ({
  numero: e.numero,
  titulo: e.titulo,
  total: e.numero === 2 ? 1 : 0,
  cartoes: e.numero === 2 ? [CARTAO] : [],
  href: `/fluxo/etapa/${e.numero}`,
}));

describe('EtapasCelular', () => {
  it('seletor das 5 etapas com o nome do PDF e o total, e os cartões da etapa escolhida', () => {
    render(<EtapasCelular colunas={COLUNAS} selecionada={2} />);
    const nav = screen.getByRole('navigation', { name: 'Etapas' });
    const links = within(nav).getAllByRole('link');
    expect(links).toHaveLength(5);
    expect(links[1].getAttribute('aria-current')).toBe('page');
    expect(links[1].getAttribute('href')).toBe('/fluxo?etapa=2');
    expect(within(nav).getByRole('link', { name: 'Pedidos Chegados - Aguardando Conferência: 1 devolução' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: '2. Pedidos Chegados - Aguardando Conferência' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /DEV-000001/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ver lista: Pedidos Chegados - Aguardando Conferência' }).getAttribute('href')).toBe('/fluxo/etapa/2');
  });

  it('etapa sem devoluções', () => {
    render(<EtapasCelular colunas={COLUNAS} selecionada={3} />);
    expect(screen.getByText('Nenhuma devolução nesta etapa')).toBeTruthy();
  });
});
```

`src/modules/devolucoes/quadro.int.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarDevolucaoTeste, criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { ETAPAS } from './etapas';
import { montarQuadro } from './quadro';
import { receberPorRastreio } from './recebimento';

const { db, sql } = criarDbTeste();
beforeEach(async () => {
  await limparTabelas(sql);
});
afterAll(async () => {
  await sql.end();
});

describe('montarQuadro', () => {
  it('conta por etapa e traz até 5 cartões por coluna', async () => {
    const operador = await criarUsuarioTeste(db, 'OPERADOR');
    for (let i = 0; i < 6; i++) await criarDevolucaoTeste(db, operador);
    const chegou = await criarDevolucaoTeste(db, operador, { rastreio: 'BRQUADRO' });
    await receberPorRastreio(db, 'BRQUADRO', operador);

    const quadro = await montarQuadro(db);
    expect(quadro.map((c) => c.titulo)).toEqual(ETAPAS.map((e) => e.titulo));
    expect(quadro.map((c) => [c.numero, c.total, c.cartoes.length, c.href])).toEqual([
      [1, 6, 5, '/fluxo/etapa/1'],
      [2, 1, 1, '/fluxo/etapa/2'],
      [3, 0, 0, '/fluxo/etapa/3'],
      [4, 0, 0, '/fluxo/etapa/4'],
      [5, 0, 0, '/fluxo/etapa/5'],
    ]);
    expect(quadro[1].cartoes[0].codigo).toBe(chegou.codigo);
  });
});
```

Rode: `npm test && npm run test:int`
Esperado: FAIL (`EtapasCelular` e `quadro` não existem; o `QuadroFluxo` não tem o texto "3 devoluções" nem os links).

- [ ] **Passo 2: Implementar**

`src/modules/devolucoes/quadro.ts`:

```ts
import type { DbOuTx } from '@/db/client';
import { buscarDevolucoes, type ResumoDevolucao } from './busca';
import { statusDaEtapa } from './dominio';
import { ETAPAS } from './etapas';

export const CARTOES_POR_COLUNA = 5;

export type ColunaQuadro = { numero: number; titulo: string; total: number; cartoes: ResumoDevolucao[]; href: string };

/** Uma coluna por etapa do PDF (spec §6.0), com o total e os primeiros cartões. A coluna 5 (lotes) fica zerada até a Fase 5. */
export async function montarQuadro(db: DbOuTx, agora: Date = new Date()): Promise<ColunaQuadro[]> {
  return Promise.all(
    ETAPAS.map(async (etapa) => {
      const href = `/fluxo/etapa/${etapa.numero}`;
      const status = statusDaEtapa(etapa.numero);
      if (status.length === 0) return { numero: etapa.numero, titulo: etapa.titulo, total: 0, cartoes: [], href };
      const { devolucoes, total } = await buscarDevolucoes(
        db,
        {},
        { status, ordem: etapa.numero === 2 ? 'chegada' : 'recentes', porPagina: CARTOES_POR_COLUNA, agora },
      );
      return { numero: etapa.numero, titulo: etapa.titulo, total, cartoes: devolucoes, href };
    }),
  );
}
```

`src/components/QuadroFluxo.tsx` (substitui todo o conteúdo):

```tsx
import Link from 'next/link';
import type { ResumoDevolucao } from '@/modules/devolucoes/busca';
import { CartaoDevolucao } from './CartaoDevolucao';

export type ColunaFluxo = { numero: number; titulo: string; total: number; cartoes?: ResumoDevolucao[]; href?: string };

export function rotuloTotal(total: number): string {
  return `${total} ${total === 1 ? 'devolução' : 'devoluções'}`;
}

/**
 * Painel da direção C no computador: uma coluna por etapa do PDF (spec §6.0), com os cartões.
 * A rolagem lateral fica dentro da caixa. No celular a página usa o EtapasCelular.
 */
export function QuadroFluxo({ colunas }: { colunas: ColunaFluxo[] }) {
  return (
    <div className="overflow-x-auto pb-1.5">
      <div className="flex min-w-[1300px] items-start gap-3.5">
        {colunas.map((coluna) => {
          const cartoes = coluna.cartoes ?? [];
          const escondidas = coluna.total - cartoes.length;
          return (
            <section
              key={coluna.numero}
              aria-labelledby={`coluna-${coluna.numero}`}
              className="flex flex-[1_0_248px] flex-col gap-2.5 rounded-xl bg-coluna p-3"
            >
              <div className="flex items-start gap-2 px-1 pb-1 pt-0.5">
                <span aria-hidden="true" className="flex size-6 flex-none items-center justify-center rounded-full bg-destaque text-xs font-bold text-white">
                  {coluna.numero}
                </span>
                <h2 id={`coluna-${coluna.numero}`} className="flex-1 text-sm font-bold leading-snug">
                  {coluna.titulo}
                </h2>
                <span className="text-[13px] font-semibold text-texto-2">
                  <span aria-hidden="true">{coluna.total}</span>
                  <span className="sr-only">{rotuloTotal(coluna.total)}</span>
                </span>
              </div>
              {coluna.total === 0 && (
                <p className="rounded-lg border border-dashed border-borda-forte px-3 py-6 text-center text-[13px] text-texto-2">
                  Nenhuma devolução nesta etapa
                </p>
              )}
              {cartoes.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {cartoes.map((d) => (
                    <li key={d.id}>
                      <CartaoDevolucao devolucao={d} />
                    </li>
                  ))}
                </ul>
              )}
              {coluna.href && coluna.total > 0 && (
                <Link
                  href={coluna.href}
                  className="flex min-h-11 items-center justify-center rounded-lg text-sm font-semibold text-destaque hover:bg-superficie"
                >
                  {escondidas > 0 ? `+ ${rotuloTotal(escondidas)}` : 'Ver lista'}
                  <span className="sr-only">
                    {escondidas > 0 ? ' em ' : ': '}
                    {coluna.titulo}
                  </span>
                </Link>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
```

`src/components/EtapasCelular.tsx`:

```tsx
import Link from 'next/link';
import { CartaoDevolucao } from './CartaoDevolucao';
import { rotuloTotal, type ColunaFluxo } from './QuadroFluxo';
import { BOTAO_SECUNDARIO, VAZIO } from './estilos';

/**
 * Quadro no celular (mobile-first): as 5 etapas viram botões com número e total, e os cartões da etapa
 * escolhida aparecem embaixo, um por linha. O nome acessível de cada botão traz o nome da etapa do PDF.
 */
export function EtapasCelular({ colunas, selecionada }: { colunas: ColunaFluxo[]; selecionada: number }) {
  const atual = colunas.find((c) => c.numero === selecionada) ?? colunas[0];
  const cartoes = atual.cartoes ?? [];
  return (
    <div className="flex flex-col gap-3">
      <nav aria-label="Etapas" className="grid grid-cols-5 gap-1.5">
        {colunas.map((c) => {
          const ativa = c.numero === atual.numero;
          return (
            <Link
              key={c.numero}
              href={`/fluxo?etapa=${c.numero}`}
              aria-current={ativa ? 'page' : undefined}
              className={`flex min-h-14 flex-col items-center justify-center rounded-xl border ${
                ativa ? 'border-destaque bg-destaque text-white' : 'border-borda bg-superficie text-texto'
              }`}
            >
              <span aria-hidden="true" className="text-xs font-semibold">
                {c.numero}
              </span>
              <span aria-hidden="true" className="text-lg font-bold leading-none">
                {c.total}
              </span>
              <span className="sr-only">
                {c.titulo}: {rotuloTotal(c.total)}
              </span>
            </Link>
          );
        })}
      </nav>
      <section aria-labelledby="etapa-selecionada" className="flex flex-col gap-2">
        <h2 id="etapa-selecionada" className="text-base font-bold">
          {atual.numero}. {atual.titulo}
        </h2>
        {cartoes.length === 0 ? (
          <p className={VAZIO}>Nenhuma devolução nesta etapa</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {cartoes.map((d) => (
              <li key={d.id}>
                <CartaoDevolucao devolucao={d} />
              </li>
            ))}
          </ul>
        )}
        {atual.href && atual.total > 0 && (
          <Link href={atual.href} className={BOTAO_SECUNDARIO}>
            {atual.total > cartoes.length ? `Ver todas as ${rotuloTotal(atual.total)}` : 'Ver lista'}
            <span className="sr-only">: {atual.titulo}</span>
          </Link>
        )}
      </section>
    </div>
  );
}
```

`src/app/(app)/fluxo/page.tsx` (substitui todo o conteúdo):

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { BuscaAvancada } from '@/components/BuscaAvancada';
import { EtapasCelular } from '@/components/EtapasCelular';
import { QuadroFluxo } from '@/components/QuadroFluxo';
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from '@/components/estilos';
import { obterDb } from '@/db';
import { primeiroValor, type ParametrosBusca } from '@/lib/parametros';
import { pode } from '@/modules/auth/permissoes';
import { exigirPermissao } from '@/modules/auth/servidor';
import { ETAPAS } from '@/modules/devolucoes/etapas';
import { montarQuadro } from '@/modules/devolucoes/quadro';

export const metadata: Metadata = { title: 'Fluxo · Gestão de Devoluções' };

export default async function PaginaFluxo({ searchParams }: { searchParams: Promise<ParametrosBusca> }) {
  const usuario = await exigirPermissao('ver_listas');
  const pedida = Number(primeiroValor((await searchParams).etapa));
  const selecionada = ETAPAS.some((e) => e.numero === pedida) ? pedida : 1;
  const colunas = await montarQuadro(obterDb());
  const podeOperar = pode(usuario.perfil, 'operar_devolucoes');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Fluxo de devoluções</h1>
        {podeOperar && (
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <Link href="/fluxo/recebimento" className={BOTAO_PRIMARIO}>
              Recebimento
            </Link>
            <Link href="/fluxo/devolucoes/nova" className={BOTAO_SECUNDARIO}>
              Nova devolução
            </Link>
          </div>
        )}
      </div>
      <BuscaAvancada acao="/fluxo/busca" filtros={{}} />
      <div className="md:hidden">
        <EtapasCelular colunas={colunas} selecionada={selecionada} />
      </div>
      <div className="hidden md:block">
        <QuadroFluxo colunas={colunas} />
      </div>
    </div>
  );
}
```

Rode: `npm test && npm run test:int && npm run typecheck && npm run lint`
Esperado: tudo PASS.

- [ ] **Passo 3: Testes ponta a ponta (no computador e no celular)**

Em `tests/e2e/login.spec.ts`:
- troque `import { entrar, semRolagemLateral } from './apoio';` por `import { ehCelular, entrar, semRolagemLateral } from './apoio';`
- troque a linha `test('gestor entra, vê as 5 etapas do PDF e todas as abas, e sai', async ({ page }) => {` por `test('gestor entra, vê as 5 etapas do PDF e todas as abas, e sai', async ({ page }, testInfo) => {`
- substitua o laço `for (const etapa of ETAPAS) { ... }` desse teste por:

```ts
  for (const etapa of ETAPAS) {
    if (ehCelular(testInfo)) {
      // No celular as etapas são os botões do seletor "Etapas", com o nome do PDF no nome acessível.
      await expect(page.getByRole('navigation', { name: 'Etapas' }).getByRole('link', { name: etapa.titulo })).toBeVisible();
    } else {
      await expect(page.getByRole('heading', { level: 2, name: etapa.titulo })).toBeVisible();
    }
  }
```

`tests/e2e/fluxo.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { criarDevolucaoTeste } from '../helpers/fabricas';
import { abrirBusca, codigoUnico, comBanco, ehCelular, entrar, semRolagemLateral, usuarioPorEmail } from './apoio';
import { USUARIOS_E2E } from './dados';

test('o quadro mostra a devolução nova na etapa 1 e a Busca Avançada do quadro acha pelo rastreio', async ({ page }, testInfo) => {
  const rastreio = codigoUnico('QF');
  const codigo = await comBanco(async (db) => {
    const operador = await usuarioPorEmail(db, USUARIOS_E2E.operador.email);
    return (await criarDevolucaoTeste(db, operador, { rastreio, canal: 'MAGALU' })).codigo;
  });
  await entrar(page, USUARIOS_E2E.fiscal);
  await expect(page).toHaveURL(/\/fluxo$/);
  await semRolagemLateral(page);

  if (ehCelular(testInfo)) {
    const etapas = page.getByRole('navigation', { name: 'Etapas' });
    await expect(etapas.getByRole('link', { name: /^Pedidos Pendentes de Chegada: \d+ devoluç/ })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('link', { name: new RegExp(codigo) })).toBeVisible();
    await etapas.getByRole('link', { name: /^Pedidos Chegados - Aguardando Conferência/ }).click();
    await expect(page).toHaveURL(/\/fluxo\?etapa=2$/);
    await expect(page.getByRole('heading', { level: 2, name: '2. Pedidos Chegados - Aguardando Conferência' })).toBeVisible();
  } else {
    const coluna = page.getByRole('region', { name: 'Pedidos Pendentes de Chegada' });
    await expect(coluna.getByRole('link', { name: new RegExp(codigo) })).toBeVisible();
    await expect(coluna).toContainText(/\d+ devoluç(ão|ões)/);
  }

  await abrirBusca(page);
  await page.getByRole('textbox', { name: 'Código de Rastreamento' }).fill(rastreio);
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(page).toHaveURL(/\/fluxo\/busca\?/);
  await expect(page.getByRole('link', { name: new RegExp(codigo) })).toBeVisible();
  await expect(page.getByText('1 devolução', { exact: true })).toBeVisible();
});
```

Rode: `npm run test:e2e`
Esperado: PASS em `computador` e `celular`.

- [ ] **Passo 4: Commit**

```bash
cd "/c/Users/idmpc/Dvoluções Markt"
git add -A
git commit -m "feat: quadro de fluxo com dados reais e seletor de etapas no celular" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 14: Usuários (Gestor) e fechamento da fase

**Arquivos:**
- Criar: `src/modules/auth/gestao.ts`
- Modificar: `src/modules/auth/perfis.ts` (acrescentar `ehPerfil`), `src/modules/auth/usuarios.ts` (erro de validação próprio)
- Modificar (substituir o conteúdo): `src/app/(app)/configuracoes/page.tsx`
- Criar: `src/app/(app)/configuracoes/usuarios/page.tsx`, `.../usuarios/FormularioNovoUsuario.tsx`, `.../usuarios/AcoesUsuario.tsx`, `.../usuarios/acoes.ts`
- Modificar: `tests/e2e/global-setup.ts`, `tests/e2e/permissoes.spec.ts`, `README.md`
- Testes: `src/modules/auth/gestao.int.test.ts`, `tests/e2e/usuarios.spec.ts`

**Interfaces:**
- Consome: `criarUsuario`, `ErroEmailEmUso`, `UsuarioSessao`, `DadosNovoUsuario`, `PERFIS`, `ROTULO_PERFIL`, `pode`, `usuarios`, `sessoes`, `criarSessao`, `validarSessao`, `autenticar` (Fase 0); `registrarEvento`, `listarEventos` (Tarefa 7); `DbOuTx`, `ehUuid`, `criarUsuarioTeste` (Tarefa 2); `CampoTexto`, `ListaErros`, `useEnvioFormulario`, estilos (Tarefa 5)
- Produz:
  - `ehPerfil(texto): texto is Perfil` em `perfis.ts`; `class ErroDadosUsuario extends Error` em `usuarios.ts`
  - em `gestao.ts`: `class ErroGestaoUsuario`, `type UsuarioLista`, `listarUsuarios(db)`, `criarUsuarioPeloGestor(db, dados, ator)`, `alterarPerfil(db, alvoId, perfil: string, ator)`, `definirAtivo(db, alvoId, ativo, ator)`
  - rotas `/configuracoes` (atalhos) e `/configuracoes/usuarios`

- [ ] **Passo 1: Escrever o teste de integração que falha**

`src/modules/auth/gestao.int.test.ts`:

```ts
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sessoes } from '@/db/schema';
import { listarEventos } from '@/modules/historico/eventos';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { autenticar } from './autenticar';
import { alterarPerfil, criarUsuarioPeloGestor, definirAtivo, ErroGestaoUsuario, listarUsuarios } from './gestao';
import { criarSessao, validarSessao } from './sessoes';
import type { UsuarioSessao } from './usuarios';

const { db, sql } = criarDbTeste();
let gestor: UsuarioSessao;

beforeEach(async () => {
  await limparTabelas(sql);
  gestor = await criarUsuarioTeste(db, 'GESTOR');
});
afterAll(async () => {
  await sql.end();
});

describe('Usuários (spec §6.8)', () => {
  it('o Gestor cria um usuário e o histórico registra quem criou', async () => {
    const novo = await criarUsuarioPeloGestor(db, { nome: 'Carla', email: 'carla@empresa.com', senha: 'senha-carla-123', perfil: 'OPERADOR' }, gestor);
    expect(novo).toMatchObject({ nome: 'Carla', perfil: 'OPERADOR' });
    expect(await listarEventos(db, 'usuario', novo.id)).toEqual([
      expect.objectContaining({ acao: 'usuario_criado', para: 'OPERADOR', usuarioNome: gestor.nome }),
    ]);
  });

  it('lista os ativos primeiro, em ordem alfabética', async () => {
    const zeca = await criarUsuarioPeloGestor(db, { nome: 'Zeca', email: 'zeca@empresa.com', senha: 'senha-zeca-123', perfil: 'FISCAL' }, gestor);
    await criarUsuarioPeloGestor(db, { nome: 'Ana', email: 'ana@empresa.com', senha: 'senha-ana-1234', perfil: 'OPERADOR' }, gestor);
    await definirAtivo(db, zeca.id, false, gestor);
    expect((await listarUsuarios(db)).map((u) => [u.nome, u.ativo])).toEqual([
      ['Ana', true],
      [gestor.nome, true],
      ['Zeca', false],
    ]);
  });

  it('muda o perfil, registra de → para, e a sessão aberta já vale com o perfil novo', async () => {
    const alvo = await criarUsuarioTeste(db, 'OPERADOR');
    const { token } = await criarSessao(db, alvo.id);
    await alterarPerfil(db, alvo.id, 'FISCAL', gestor);
    expect((await validarSessao(db, token))?.perfil).toBe('FISCAL');
    expect((await listarEventos(db, 'usuario', alvo.id)).at(-1)).toMatchObject({
      acao: 'perfil_alterado',
      de: 'OPERADOR',
      para: 'FISCAL',
      usuarioNome: gestor.nome,
    });
  });

  it('desativar encerra as sessões na hora; reativar deixa entrar de novo', async () => {
    const alvo = await criarUsuarioTeste(db, 'OPERADOR');
    await criarSessao(db, alvo.id);
    await criarSessao(db, alvo.id);
    await definirAtivo(db, alvo.id, false, gestor);
    expect(await db.select().from(sessoes).where(eq(sessoes.usuarioId, alvo.id))).toHaveLength(0);
    expect((await autenticar(db, alvo.email, 'senha-de-teste-123')).ok).toBe(false);
    await definirAtivo(db, alvo.id, true, gestor);
    expect((await autenticar(db, alvo.email, 'senha-de-teste-123')).ok).toBe(true);
    expect((await listarEventos(db, 'usuario', alvo.id)).map((e) => e.acao)).toEqual(['usuario_desativado', 'usuario_reativado']);
  });

  it('o Gestor não muda o próprio perfil nem se desativa (sempre sobra um Gestor ativo)', async () => {
    await expect(alterarPerfil(db, gestor.id, 'OPERADOR', gestor)).rejects.toThrow(new ErroGestaoUsuario('Você não pode mudar o próprio perfil.'));
    await expect(definirAtivo(db, gestor.id, false, gestor)).rejects.toThrow(new ErroGestaoUsuario('Você não pode desativar o próprio usuário.'));
  });

  it('só o Gestor gerencia usuários; perfil e usuário precisam existir', async () => {
    const operador = await criarUsuarioTeste(db, 'OPERADOR');
    const alvo = await criarUsuarioTeste(db, 'FISCAL');
    await expect(definirAtivo(db, alvo.id, false, operador)).rejects.toThrow('Só o Gestor gerencia usuários.');
    await expect(alterarPerfil(db, alvo.id, 'CHEFE', gestor)).rejects.toThrow('Perfil inválido.');
    await expect(alterarPerfil(db, '00000000-0000-0000-0000-000000000000', 'FISCAL', gestor)).rejects.toThrow('Usuário não encontrado.');
  });
});
```

Rode: `npm run test:int`
Esperado: FAIL (`./gestao` não existe).

- [ ] **Passo 2: Implementar**

Acrescente no **final** de `src/modules/auth/perfis.ts`:

```ts
export function ehPerfil(texto: string): texto is Perfil {
  return (PERFIS as readonly string[]).includes(texto);
}
```

Em `src/modules/auth/usuarios.ts`:
- acrescente, logo depois da classe `ErroEmailEmUso`:

```ts
/** Dado inválido no cadastro do usuário (mensagem pronta para a tela). */
export class ErroDadosUsuario extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroDadosUsuario';
  }
}
```

- troque `throw new Error(resultado.error.issues.map((i) => i.message).join('; '));` por `throw new ErroDadosUsuario(resultado.error.issues.map((i) => i.message).join('; '));`

`src/modules/auth/gestao.ts`:

```ts
import { asc, desc, eq } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { sessoes, usuarios } from '@/db/schema';
import { ehUuid } from '@/lib/uuid';
import { registrarEvento } from '@/modules/historico/eventos';
import { ehPerfil, type Perfil } from './perfis';
import { pode } from './permissoes';
import { criarUsuario, type DadosNovoUsuario, type UsuarioSessao } from './usuarios';

export class ErroGestaoUsuario extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroGestaoUsuario';
  }
}

export type UsuarioLista = { id: string; nome: string; email: string; perfil: Perfil; ativo: boolean };

function exigirGestor(ator: UsuarioSessao) {
  if (!pode(ator.perfil, 'administrar')) throw new ErroGestaoUsuario('Só o Gestor gerencia usuários.');
}

function exigirOutroUsuario(alvoId: string, ator: UsuarioSessao, mensagem: string) {
  if (alvoId === ator.id) throw new ErroGestaoUsuario(mensagem);
  if (!ehUuid(alvoId)) throw new ErroGestaoUsuario('Usuário não encontrado.');
}

export async function listarUsuarios(db: DbOuTx): Promise<UsuarioLista[]> {
  return db
    .select({ id: usuarios.id, nome: usuarios.nome, email: usuarios.email, perfil: usuarios.perfil, ativo: usuarios.ativo })
    .from(usuarios)
    .orderBy(desc(usuarios.ativo), asc(usuarios.nome));
}

export async function criarUsuarioPeloGestor(db: DbOuTx, dados: DadosNovoUsuario, ator: UsuarioSessao): Promise<UsuarioSessao> {
  exigirGestor(ator);
  const novo = await criarUsuario(db, dados);
  await registrarEvento(db, { entidade: 'usuario', entidadeId: novo.id, acao: 'usuario_criado', para: novo.perfil, usuarioId: ator.id });
  return novo;
}

/** A sessão aberta já passa a valer com o perfil novo: o perfil é lido do banco a cada página. */
export async function alterarPerfil(db: DbOuTx, alvoId: string, perfil: string, ator: UsuarioSessao): Promise<void> {
  exigirGestor(ator);
  exigirOutroUsuario(alvoId, ator, 'Você não pode mudar o próprio perfil.');
  if (!ehPerfil(perfil)) throw new ErroGestaoUsuario('Perfil inválido.');
  await db.transaction(async (tx) => {
    const [antes] = await tx.select({ perfil: usuarios.perfil }).from(usuarios).where(eq(usuarios.id, alvoId));
    if (!antes) throw new ErroGestaoUsuario('Usuário não encontrado.');
    if (antes.perfil === perfil) return;
    await tx.update(usuarios).set({ perfil }).where(eq(usuarios.id, alvoId));
    await registrarEvento(tx, { entidade: 'usuario', entidadeId: alvoId, acao: 'perfil_alterado', de: antes.perfil, para: perfil, usuarioId: ator.id });
  });
}

/** Spec §6.8: desativar encerra as sessões do usuário na hora. Reativar também zera o bloqueio por senha errada. */
export async function definirAtivo(db: DbOuTx, alvoId: string, ativo: boolean, ator: UsuarioSessao): Promise<void> {
  exigirGestor(ator);
  exigirOutroUsuario(alvoId, ator, 'Você não pode desativar o próprio usuário.');
  await db.transaction(async (tx) => {
    const [atualizado] = await tx
      .update(usuarios)
      .set(ativo ? { ativo: true, falhasLogin: 0, bloqueadoAte: null } : { ativo: false })
      .where(eq(usuarios.id, alvoId))
      .returning({ id: usuarios.id });
    if (!atualizado) throw new ErroGestaoUsuario('Usuário não encontrado.');
    if (!ativo) await tx.delete(sessoes).where(eq(sessoes.usuarioId, alvoId));
    await registrarEvento(tx, {
      entidade: 'usuario',
      entidadeId: alvoId,
      acao: ativo ? 'usuario_reativado' : 'usuario_desativado',
      usuarioId: ator.id,
    });
  });
}
```

Rode: `npm run test:int`
Esperado: PASS (inclusive o `usuarios.int.test.ts` da Fase 0: `ErroDadosUsuario` estende `Error` com a mesma mensagem).

- [ ] **Passo 3: Telas**

`src/app/(app)/configuracoes/page.tsx` (substitui todo o conteúdo):

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { CARTAO } from '@/components/estilos';
import { exigirPermissao } from '@/modules/auth/servidor';

export const metadata: Metadata = { title: 'Configurações · Gestão de Devoluções' };

export default async function PaginaConfiguracoes() {
  await exigirPermissao('administrar');
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
      <h1 className="text-xl font-bold">Configurações</h1>
      <Link href="/configuracoes/usuarios" className={`${CARTAO} flex min-h-11 flex-col gap-1 hover:border-destaque`}>
        <span className="text-base font-bold">Usuários</span>
        <span className="text-sm text-texto-2">Criar usuários, mudar o perfil, desativar e reativar.</span>
      </Link>
      <p className="text-sm text-texto-2">
        Dados da empresa, regras fiscais, conexão com o Mercado Livre, vídeo e prazo de guarda das mídias chegam nas próximas fases.
      </p>
    </div>
  );
}
```

`src/app/(app)/configuracoes/usuarios/acoes.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { obterDb } from '@/db';
import { alterarPerfil, criarUsuarioPeloGestor, definirAtivo, ErroGestaoUsuario } from '@/modules/auth/gestao';
import { ehPerfil } from '@/modules/auth/perfis';
import { exigirPermissao } from '@/modules/auth/servidor';
import { ErroDadosUsuario, ErroEmailEmUso } from '@/modules/auth/usuarios';

/** `versao` muda a cada usuário criado: o formulário recomeça vazio. Com erro, os campos ficam como estavam. */
export type EstadoNovoUsuario = { erros: string[]; criado: string | null; versao: number };
export type EstadoAcaoUsuario = { erro: string | null };

function ehErroConhecido(erro: unknown): erro is Error {
  return erro instanceof ErroDadosUsuario || erro instanceof ErroEmailEmUso || erro instanceof ErroGestaoUsuario;
}

export async function criarUsuarioAcao(anterior: EstadoNovoUsuario, dados: FormData): Promise<EstadoNovoUsuario> {
  const gestor = await exigirPermissao('administrar');
  const perfil = String(dados.get('perfil') ?? '');
  if (!ehPerfil(perfil)) return { ...anterior, erros: ['Escolha o perfil.'], criado: null };
  try {
    const novo = await criarUsuarioPeloGestor(
      obterDb(),
      { nome: String(dados.get('nome') ?? ''), email: String(dados.get('email') ?? ''), senha: String(dados.get('senha') ?? ''), perfil },
      gestor,
    );
    revalidatePath('/configuracoes/usuarios');
    return { erros: [], criado: novo.nome, versao: anterior.versao + 1 };
  } catch (erro) {
    if (ehErroConhecido(erro)) return { ...anterior, erros: [erro.message], criado: null };
    throw erro;
  }
}

export async function alterarPerfilAcao(alvoId: string, _anterior: EstadoAcaoUsuario, dados: FormData): Promise<EstadoAcaoUsuario> {
  const gestor = await exigirPermissao('administrar');
  try {
    await alterarPerfil(obterDb(), alvoId, String(dados.get('perfil') ?? ''), gestor);
  } catch (erro) {
    if (ehErroConhecido(erro)) return { erro: erro.message };
    throw erro;
  }
  revalidatePath('/configuracoes/usuarios');
  return { erro: null };
}

/** Usada com `.bind(null, id, ativo)`: o estado anterior e o formulário não são necessários. */
export async function definirAtivoAcao(alvoId: string, ativo: boolean): Promise<EstadoAcaoUsuario> {
  const gestor = await exigirPermissao('administrar');
  try {
    await definirAtivo(obterDb(), alvoId, ativo, gestor);
  } catch (erro) {
    if (ehErroConhecido(erro)) return { erro: erro.message };
    throw erro;
  }
  revalidatePath('/configuracoes/usuarios');
  return { erro: null };
}
```

`src/app/(app)/configuracoes/usuarios/FormularioNovoUsuario.tsx`:

```tsx
'use client';

import { CampoTexto } from '@/components/CampoTexto';
import { ListaErros } from '@/components/ListaErros';
import { ALERTA_OK, BOTAO_PRIMARIO, CAMPO, ROTULO } from '@/components/estilos';
import { useEnvioFormulario } from '@/components/useEnvioFormulario';
import { PERFIS, ROTULO_PERFIL } from '@/modules/auth/perfis';
import { criarUsuarioAcao } from './acoes';

export function FormularioNovoUsuario() {
  const [estado, aoEnviar, pendente] = useEnvioFormulario(criarUsuarioAcao, { erros: [], criado: null, versao: 0 });
  return (
    <div className="flex flex-col gap-3">
      {estado.criado && (
        <p role="status" className={ALERTA_OK}>
          Usuário {estado.criado} criado.
        </p>
      )}
      <form key={estado.versao} onSubmit={aoEnviar} className="flex flex-col gap-3">
        <CampoTexto nome="nome" rotulo="Nome" obrigatorio maximo={120} />
        <CampoTexto nome="email" rotulo="E-mail" tipo="email" modoTeclado="email" obrigatorio maximo={200} />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="perfil" className={ROTULO}>
            Perfil
          </label>
          <select id="perfil" name="perfil" defaultValue="OPERADOR" className={CAMPO}>
            {PERFIS.map((p) => (
              <option key={p} value={p}>
                {ROTULO_PERFIL[p]}
              </option>
            ))}
          </select>
        </div>
        <CampoTexto
          nome="senha"
          rotulo="Senha inicial"
          tipo="password"
          obrigatorio
          autoComplete="new-password"
          dica="Pelo menos 8 caracteres. A pessoa entra com esta senha."
        />
        <ListaErros erros={estado.erros} />
        <button type="submit" disabled={pendente} className={BOTAO_PRIMARIO}>
          {pendente ? 'Criando…' : 'Criar usuário'}
        </button>
      </form>
    </div>
  );
}
```

`src/app/(app)/configuracoes/usuarios/AcoesUsuario.tsx`:

```tsx
'use client';

import { useActionState } from 'react';
import { ListaErros } from '@/components/ListaErros';
import { BOTAO_SECUNDARIO, CAMPO, ROTULO } from '@/components/estilos';
import { PERFIS, ROTULO_PERFIL, type Perfil } from '@/modules/auth/perfis';
import { alterarPerfilAcao, definirAtivoAcao } from './acoes';

type Props = { usuario: { id: string; nome: string; perfil: Perfil; ativo: boolean } };

export function AcoesUsuario({ usuario }: Props) {
  const [estadoPerfil, enviarPerfil, mudandoPerfil] = useActionState(alterarPerfilAcao.bind(null, usuario.id), { erro: null });
  const [estadoAtivo, enviarAtivo, mudandoAtivo] = useActionState(definirAtivoAcao.bind(null, usuario.id, !usuario.ativo), { erro: null });
  const erros = [estadoPerfil.erro, estadoAtivo.erro].filter((e): e is string => e !== null);
  return (
    <div className="flex flex-col gap-2">
      <form action={enviarPerfil} className="flex items-end gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <label htmlFor={`perfil-${usuario.id}`} className={ROTULO}>
            Perfil<span className="sr-only"> de {usuario.nome}</span>
          </label>
          <select id={`perfil-${usuario.id}`} name="perfil" defaultValue={usuario.perfil} className={CAMPO}>
            {PERFIS.map((p) => (
              <option key={p} value={p}>
                {ROTULO_PERFIL[p]}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={mudandoPerfil} aria-label={`Salvar perfil de ${usuario.nome}`} className={BOTAO_SECUNDARIO}>
          Salvar
        </button>
      </form>
      <form action={enviarAtivo}>
        <button
          type="submit"
          disabled={mudandoAtivo}
          aria-label={`${usuario.ativo ? 'Desativar' : 'Reativar'} ${usuario.nome}`}
          className={`${BOTAO_SECUNDARIO} w-full`}
        >
          {usuario.ativo ? 'Desativar' : 'Reativar'}
        </button>
      </form>
      <ListaErros erros={erros} />
    </div>
  );
}
```

`src/app/(app)/configuracoes/usuarios/page.tsx`:

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { CARTAO, LINK_VOLTAR } from '@/components/estilos';
import { obterDb } from '@/db';
import { listarUsuarios } from '@/modules/auth/gestao';
import { ROTULO_PERFIL } from '@/modules/auth/perfis';
import { exigirPermissao } from '@/modules/auth/servidor';
import { AcoesUsuario } from './AcoesUsuario';
import { FormularioNovoUsuario } from './FormularioNovoUsuario';

export const metadata: Metadata = { title: 'Usuários · Gestão de Devoluções' };

export default async function PaginaUsuarios() {
  const gestor = await exigirPermissao('administrar');
  const lista = await listarUsuarios(obterDb());
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Link href="/configuracoes" className={LINK_VOLTAR}>
          ← Configurações
        </Link>
        <h1 className="text-xl font-bold">Usuários</h1>
      </div>
      <section aria-labelledby="titulo-novo" className={`${CARTAO} flex flex-col gap-3`}>
        <h2 id="titulo-novo" className="text-base font-bold">
          Novo usuário
        </h2>
        <FormularioNovoUsuario />
      </section>
      <section aria-labelledby="titulo-lista" className="flex flex-col gap-2">
        <h2 id="titulo-lista" className="text-base font-bold">
          Usuários cadastrados
        </h2>
        <ul className="grid gap-3 md:grid-cols-2">
          {lista.map((u) => (
            <li key={u.id} className={`${CARTAO} flex flex-col gap-3`}>
              <div>
                <p className="font-semibold">
                  {u.nome}
                  {u.id === gestor.id ? ' (você)' : ''}
                </p>
                <p className="text-sm text-texto-2 [overflow-wrap:anywhere]">
                  {u.email} · {ROTULO_PERFIL[u.perfil]} · {u.ativo ? 'Ativo' : 'Desativado'}
                </p>
              </div>
              {u.id !== gestor.id && <AcoesUsuario usuario={{ id: u.id, nome: u.nome, perfil: u.perfil, ativo: u.ativo }} />}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
```

Rode: `npm test && npm run typecheck && npm run lint`
Esperado: tudo PASS.

- [ ] **Passo 4: Testes ponta a ponta (no computador e no celular)**

Em `tests/e2e/global-setup.ts`, acrescente na lista `ROTAS_AQUECIMENTO`, logo antes do `];`:

```ts
  '/configuracoes',
  '/configuracoes/usuarios',
```

Acrescente no **final** de `tests/e2e/permissoes.spec.ts`:

```ts
test('operador não abre a tela de Usuários (HTTP 404)', async ({ page }) => {
  await entrar(page, USUARIOS_E2E.operador);
  const resposta = await page.goto('/configuracoes/usuarios');
  expect(resposta?.status()).toBe(404);
});
```

`tests/e2e/usuarios.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { entrar, semRolagemLateral } from './apoio';
import { USUARIOS_E2E } from './dados';

test('gestor cria, desativa, reativa e muda o perfil de um usuário; desativar encerra a sessão na hora', async ({ page, browser }, testInfo) => {
  // O banco do e2e é o mesmo para o computador e o celular: um usuário por projeto.
  const email = `carla-${testInfo.project.name}@teste.local`;
  const nome = `Carla Conferente ${testInfo.project.name}`;
  const senha = 'senha-carla-123';

  await entrar(page, USUARIOS_E2E.gestor);
  await page.getByRole('navigation', { name: 'Seções' }).getByRole('link', { name: 'Configurações' }).click();
  await page.getByRole('link', { name: /^Usuários/ }).click();
  await semRolagemLateral(page);
  await page.getByLabel('Nome', { exact: true }).fill(nome);
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Perfil', { exact: true }).selectOption('OPERADOR');
  await page.getByLabel('Senha inicial').fill(senha);
  await page.getByRole('button', { name: 'Criar usuário' }).click();
  await expect(page.getByRole('status')).toHaveText(`Usuário ${nome} criado.`);
  const cartao = page.getByRole('listitem').filter({ hasText: email });
  await expect(cartao).toContainText('Operador · Ativo');
  await semRolagemLateral(page);

  const contexto = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  const paginaCarla = await contexto.newPage();
  await entrar(paginaCarla, { email, senha });
  await expect(paginaCarla).toHaveURL(/\/fluxo$/);

  await cartao.getByRole('button', { name: `Desativar ${nome}` }).click();
  await expect(cartao).toContainText('Operador · Desativado');
  await paginaCarla.goto('/fluxo');
  await expect(paginaCarla).toHaveURL(/\/login$/);

  await cartao.getByRole('button', { name: `Reativar ${nome}` }).click();
  await expect(cartao).toContainText('Operador · Ativo');
  await entrar(paginaCarla, { email, senha });
  await expect(paginaCarla).toHaveURL(/\/fluxo$/);

  await cartao.getByLabel(`Perfil de ${nome}`).selectOption('FISCAL');
  await cartao.getByRole('button', { name: `Salvar perfil de ${nome}` }).click();
  await expect(cartao).toContainText('Fiscal · Ativo');
  await paginaCarla.reload();
  await expect(paginaCarla.getByRole('navigation', { name: 'Seções' }).getByRole('link')).toHaveText([
    'Fluxo',
    'Lotes e Remessas',
    'Produtos e Fornecedores',
  ]);
  await contexto.close();
});
```

Rode: `npm run test:e2e`
Esperado: PASS em `computador` e `celular`.

- [ ] **Passo 5: README**

Em `README.md`, substitua a tabela da seção "## Testes" e o parágrafo logo abaixo dela por:

```markdown
| Comando | O que roda |
|---|---|
| `npm test` | Regras e componentes (sem banco) |
| `npm run test:int` | Integração com o banco de testes |
| `npm run test:e2e` | Navegador de ponta a ponta, em dois projetos: `computador` e `celular` (390×844) |
| `npm run typecheck` / `npm run lint` | Tipos e estilo |

Antes do primeiro `npm run test:e2e`, rode `npx playwright install chromium` (uma vez). Pare o `npm run dev` antes de rodar o e2e: o Next 16 usa um arquivo de trava no modo dev e não sobe dois servidores juntos.

O `npm run dev` e o `npm run build` copiam antes o leitor de código de barras (`zxing_reader.wasm`) para `public/zxing/` (script `scripts/copiar-zxing.mjs`). A câmera só abre em HTTPS ou em `localhost`; para testar a leitura no celular, use o sistema publicado na VPS.
```

- [ ] **Passo 6: Verificação completa da fase**

Pare o `npm run dev`. Rode, nesta ordem:

```bash
cd "/c/Users/idmpc/Dvoluções Markt"
npm run lint && npm run typecheck && npm test && npm run test:int && npm run build && npm run test:e2e
```

Esperado: tudo verde. O `build` também confere os tipos das páginas do Next e copia o `.wasm`.

- [ ] **Passo 7: Commit**

```bash
cd "/c/Users/idmpc/Dvoluções Markt"
git add -A
git commit -m "feat: tela de usuários do gestor (criar, perfil, desativar encerra sessões)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Depois da fase (controlador e usuário)

- Fazer o merge, o `git push` e o deploy na VPS (`docs/operacao/deploy-vps.md`), **incluindo a mudança do nginx para 6 MB** (Tarefa 6).
- Fazer o teste no celular de verdade da Tarefa 11 (Passo 8): é o critério de pronto da spec §14.
- No celular, abrir o sistema no navegador e usar "Adicionar à tela inicial": o app abre em tela cheia, com o ícone e a cor do tema.
