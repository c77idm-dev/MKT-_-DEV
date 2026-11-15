# Tela de login com a faixa verde da marca: plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar este plano tarefa por tarefa. Os passos usam checkbox (`- [ ]`).

**Objetivo:** trocar o visual da tela `/login` pela opção B aprovada: faixa verde com a marca, formulário em folha, mostrar a senha (extra) e lembrar o e-mail no aparelho (extra), sem mudar a ação de entrar.

**Arquitetura:**
- **`page.tsx`:** só o layout. A faixa e a folha no celular, as duas metades no computador.
- **`FormularioLogin.tsx`:** ganha o botão "Ver" e a caixa "Lembrar de mim".
- **Módulo puro `lembrar.ts`:** guarda o e-mail com `try/catch`.
- **`MarcaLogin.tsx`:** a marca provisória, com o mesmo desenho do ícone do PWA (`IconeApp`).
- **O que não muda:** `acoes.ts`.

**Tecnologias:** Next.js 16.4.6 (App Router), React 19.3, Tailwind v4 (tokens de `src/app/globals.css`: `bg-destaque`, `text-texto-2`, `bg-superficie`, `border-borda-campo`, `bg-erro-suave`, `text-erro`, `bg-destaque-escuro`), Vitest + Testing Library (jsdom), Playwright (projetos `computador` e `celular`).

**Spec:** [docs/superpowers/specs/2026-11-15-login-design.md](../specs/2026-11-15-login-design.md)

## Restrições globais
- **Textos fixos:**
  - frase da faixa: "Recebimento, conferência, NF e remessas num só lugar.";
  - título da faixa: "Devoluções";
  - título da folha: "Entrar" (`h1`);
  - texto de ajuda: "Esqueceu a senha? Fale com o Gestor.";
  - caixa: "Lembrar de mim neste aparelho";
  - botão: "Ver" / "Ocultar".
- **Textos que não mudam:** "E-mail", "Senha", "Entrar", "Entrando…" e o `<title>` "Entrar · Gestão de Devoluções".
- **Nomes acessíveis novos:** não podem conter "senha" nem "e-mail". O e2e usa `getByLabel('Senha')`, `getByLabel('E-mail')` e `getByRole('button', { name: 'Entrar' })` sem `exact`.
  - Por isso o título da folha é um heading, não um botão.
  - E o único botão com "Entrar" no nome continua sendo o de enviar.
- **Chave do `localStorage`:** `devolucoes:email-lembrado`. Guarda só o e-mail, nunca a senha.
- **Celular:** 390×844, sem rolagem lateral, toques de 44 px ou mais (`min-h-11`/`h-11`), contraste de 4,5:1 ou mais.
- **Componentes puros:** sem `localStorage` durante a renderização. Leia num `useEffect`. Sem `setState` direto no corpo do efeito sem condição (regra do lint do React). Para preencher o campo, use `ref` no input e `ref.current.value`.
- **Arquivos que não mudam:** `src/app/login/acoes.ts`, `tests/e2e/apoio.ts`, `login.spec.ts`, `seguranca.spec.ts`, `usuarios.spec.ts`, `pwa.spec.ts`.
- **Commits:** terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Comandos de conferência:** `npm test`, `npm run typecheck`, `npm run lint`, `npm run test:e2e`. O banco de testes está em `localhost:5433` neste PC (veja o `.env`).

## Foco da revisão
1. **Navegação privada ou `localStorage` bloqueado:** a tela abre e entra normalmente. Nada de exceção nem de tela branca. Teste na Tarefa 1.
2. **Desmarcar "Lembrar de mim" e entrar:** o e-mail guardado é apagado, e na próxima visita o campo vem vazio. Teste na Tarefa 1.
3. **E-mail lembrado:** o foco vai para a senha, e o "Entrar" do teclado envia. Teste na Tarefa 1.
4. **Erro de senha errada:** continua aparecendo e é anunciado (`role="alert"`). Coberto pelo `login.spec.ts` existente.
5. **Computador estreito (768 a 1024 px):** as duas metades não espremem o formulário abaixo de cerca de 320 px, e nada rola de lado. Teste na Tarefa 2.

---

### Tarefa 1: Formulário com "Ver", "Lembrar de mim" e foco na senha

**Arquivos:**
- Criar: `src/app/login/lembrar.ts`, `src/app/login/lembrar.test.ts`, `src/app/login/FormularioLogin.test.tsx`
- Modificar: `src/app/login/FormularioLogin.tsx`

**Interfaces:**
- Produz (`lembrar.ts`):
  - `CHAVE_EMAIL_LEMBRADO = 'devolucoes:email-lembrado'`;
  - `lerEmailLembrado(armazenamento?: Storage | null): string | null`;
  - `guardarEmailLembrado(email: string, lembrar: boolean, armazenamento?: Storage | null): void`.
  - O padrão de `armazenamento` é `globalThis.localStorage` lido dentro de `try`. Qualquer exceção vira `null` ou não faz nada.
  - `guardarEmailLembrado` faz `trim()` e grava só se `lembrar` for verdadeiro e o e-mail não estiver vazio. Se não, apaga a chave.
- Consome: `entrar` e `EstadoLogin` de `./acoes`, sem mudança.

- [ ] **Passo 1: Testes do módulo puro (`lembrar.test.ts`)**

```ts
import { describe, expect, it } from 'vitest';
import { CHAVE_EMAIL_LEMBRADO, guardarEmailLembrado, lerEmailLembrado } from './lembrar';

function memoria(): Storage {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k), clear: () => m.clear(), key: () => null, get length() { return m.size; } } as Storage;
}
const quebrado = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); }, removeItem() { throw new Error('bloqueado'); } } as unknown as Storage;

describe('lembrar o e-mail (extra)', () => {
  it('guarda o e-mail sem espaços e lê de volta', () => {
    const s = memoria();
    guardarEmailLembrado('  ana@empresa.com.br ', true, s);
    expect(s.getItem(CHAVE_EMAIL_LEMBRADO)).toBe('ana@empresa.com.br');
    expect(lerEmailLembrado(s)).toBe('ana@empresa.com.br');
  });
  it('desmarcado apaga o que estava guardado', () => {
    const s = memoria();
    guardarEmailLembrado('ana@empresa.com.br', true, s);
    guardarEmailLembrado('ana@empresa.com.br', false, s);
    expect(lerEmailLembrado(s)).toBeNull();
  });
  it('e-mail vazio não é guardado', () => {
    const s = memoria();
    guardarEmailLembrado('   ', true, s);
    expect(lerEmailLembrado(s)).toBeNull();
  });
  it('armazenamento bloqueado ou ausente não lança', () => {
    expect(() => guardarEmailLembrado('a@b.com', true, quebrado)).not.toThrow();
    expect(lerEmailLembrado(quebrado)).toBeNull();
    expect(lerEmailLembrado(null)).toBeNull();
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Rode: `npm test -- src/app/login/lembrar.test.ts`
Esperado: FAIL, porque `./lembrar` não existe.

- [ ] **Passo 3: Implementar `lembrar.ts`**

- [ ] **Passo 4: Testes do componente (`FormularioLogin.test.tsx`)**

Primeira linha: `// @vitest-environment jsdom`.
- **Mock:** `vi.mock('./acoes', () => ({ entrar: vi.fn(async () => ({ erro: null })) }))`.
- **Antes de cada teste:** `localStorage.clear()`.

Testes:
- **`'Ver mostra o que foi digitado e Ocultar esconde de novo'`:**
  - o campo `getByLabelText('Senha')` começa com `type` `password`;
  - um clique em `getByRole('button', { name: 'Ver' })` muda para `type` `text`, com `aria-pressed="true"` e o texto "Ocultar";
  - outro clique volta para `password`.
- **`'com e-mail lembrado, preenche o campo e põe o foco na senha'`:**
  - antes do `render`, `localStorage.setItem('devolucoes:email-lembrado', 'ana@empresa.com.br')`;
  - depois, `await waitFor` até o campo `getByLabelText('E-mail')` ter `value` `ana@empresa.com.br` e `document.activeElement` ser o campo da senha.
- **`'ao enviar com Lembrar de mim marcado, guarda o e-mail; desmarcado, apaga'`:**
  - a caixa `getByRole('checkbox', { name: 'Lembrar de mim neste aparelho' })` começa marcada;
  - preencha o e-mail com `ana@empresa.com.br`, preencha a senha e faça `fireEvent.submit` no formulário;
  - o `localStorage` passa a ter o e-mail;
  - desmarque a caixa e envie de novo: a chave passa a ser `null`.
- **`'nenhum nome acessível novo contém "senha" ou "e-mail"'`:**
  - `getAllByRole('button')` filtrado por `/senha|e-mail/i` no nome tem tamanho 0;
  - o nome da caixa não casa com `/e-mail/i`.

- [ ] **Passo 5: Rodar e ver falhar**

Rode: `npm test -- src/app/login/FormularioLogin.test.tsx`
Esperado: FAIL, porque não existe botão "Ver" nem caixa "Lembrar de mim".

- [ ] **Passo 6: Implementar no `FormularioLogin.tsx`**
- **Campo da senha:** botão `type="button"` com o texto "Ver"/"Ocultar", `aria-pressed` e `aria-controls="senha"`, dentro do campo, à direita, com `h-11 min-w-11`. O input ganha `pr-16` e `enterKeyHint="go"`.
- **Campo do e-mail:** `inputMode="email"`, `autoCapitalize="none"`, `enterKeyHint="next"` e `ref`.
- **Caixa:** `<input type="checkbox" name="lembrar" defaultChecked>` com `<label>` "Lembrar de mim neste aparelho", alvo de 44 px de altura.
- **Ao enviar:** um `onSubmit` no `<form>`, sem `preventDefault`, porque a `action` continua rodando. Ele chama `guardarEmailLembrado(emailRef.current.value, caixa.checked)`.
- **Ao montar:** um `useEffect` com `[]` lê `lerEmailLembrado()`. Se vier valor, ele escreve no input do e-mail pela `ref` e foca a senha pela `ref`.
- **O que fica igual:** o erro em `role="alert"` e o texto do botão de enviar.

- [ ] **Passo 7: Rodar e ver passar**

Rode: `npm test -- src/app/login && npm run typecheck && npm run lint`
Esperado: tudo PASS e sem erro.

- [ ] **Passo 8: Commit**

```bash
git add src/app/login/lembrar.ts src/app/login/lembrar.test.ts src/app/login/FormularioLogin.tsx src/app/login/FormularioLogin.test.tsx
git commit -m "feat(login): mostrar a senha e lembrar o e-mail neste aparelho (extra)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Tarefa 2: Layout da faixa verde, a marca e o e2e

**Arquivos:**
- Criar: `src/app/login/MarcaLogin.tsx`, `tests/e2e/login-visual.spec.ts`
- Modificar: `src/app/login/page.tsx`

**Interfaces:**
- Consome: `FormularioLogin`, da Tarefa 1, sem props.
- Produz: `MarcaLogin()`, sem props. Desenha um quadrado de 48 px com borda e fundo branco translúcidos e, dentro, o mesmo SVG de setas de `src/components/IconeApp.tsx` (4 `path`, `stroke="currentColor"`, branco). É `aria-hidden`, porque o nome vem do título ao lado. Fica num arquivo só para a logo de verdade trocar só ele.

- [ ] **Passo 1: Escrever o e2e (`tests/e2e/login-visual.spec.ts`)**

Use `semRolagemLateral` e `entrarComo` de `./apoio` e `USUARIOS_E2E` de `./dados`.
- **`'login com a faixa da marca, sem rolagem lateral'`:**
  - `page.goto('/login')`;
  - aparecem "Devoluções" e "Recebimento, conferência, NF e remessas num só lugar.";
  - o `heading` de nível 1 "Entrar" está visível;
  - `await semRolagemLateral(page)`;
  - a caixa do botão `Entrar` tem altura de 44 ou mais.
- **`'Ver mostra a senha digitada'`:**
  - preencha `getByLabel('Senha')` com `abc123`;
  - clique em `getByRole('button', { name: 'Ver' })`;
  - o campo passa a ter `type` `text`.
- **`'lembra o e-mail na próxima visita'`:**
  - `entrarComo(page, USUARIOS_E2E.operador)`;
  - clique em `getByRole('button', { name: 'Sair' })`;
  - na volta a `/login`, o campo `getByLabel('E-mail')` tem o valor do e-mail do operador e o foco está em `getByLabel('Senha')`.
- **`'computador estreito: o formulário não fica espremido'`:**
  - só no projeto `computador` (`test.skip(ehCelular(testInfo))`);
  - `page.setViewportSize({ width: 800, height: 700 })` e `goto('/login')`;
  - a largura de `getByLabel('E-mail')` é de 280 ou mais;
  - `semRolagemLateral`.

- [ ] **Passo 2: Rodar e ver falhar**

Rode: `npx playwright test tests/e2e/login-visual.spec.ts`
Esperado: FAIL, porque não existe a frase da faixa nem o `heading` "Entrar".

- [ ] **Passo 3: Implementar `MarcaLogin.tsx` e o novo `page.tsx`**
- **Fora do `page.tsx`:** o `redirect('/fluxo')` de quem já entrou e o `metadata` continuam iguais.
- **Celular:** `<main>` em coluna, com `min-h-dvh`.
  - **Faixa:** `bg-destaque text-white`, com padding em cima de cerca de 40 px e embaixo de cerca de 56 px. Dentro: `MarcaLogin`, o "Devoluções" (`text-2xl font-bold`, que **não** é heading, para o `h1` ser "Entrar") e a frase em `text-[#D6EFEB]` ou `text-white/85` (contraste de 4,5:1 ou mais sobre #0F766E).
  - **Folha:** `bg-superficie`, `rounded-t-3xl`, `-mt-6`, `flex-1`, com padding. Dentro: `h1` "Entrar", `FormularioLogin` e, no pé, o texto de ajuda.
  - **Botão "Entrar":** fica no pé da folha. O formulário ocupa a altura com um espaçador que cresce antes do botão.
- **Computador (`md:`):** `grid md:grid-cols-2`.
  - A faixa vira a metade esquerda, de cima a baixo, com o conteúdo centralizado verticalmente.
  - A folha vira a metade direita, sem cantos arredondados nem margem negativa, com o conteúdo centralizado e `max-w-[380px] w-full`.
- **Rotulagem:** a faixa é um `<section aria-label="Gestão de Devoluções">`.

- [ ] **Passo 4: Rodar e ver passar, e a suíte do login inteira**

Rode: `npx playwright test tests/e2e/login-visual.spec.ts tests/e2e/login.spec.ts tests/e2e/seguranca.spec.ts tests/e2e/usuarios.spec.ts tests/e2e/pwa.spec.ts`
Esperado: tudo PASS nos dois projetos.

- [ ] **Passo 5: Suíte completa**

Rode: `npm test && npm run typecheck && npm run lint && npm run test:e2e`
Esperado: tudo verde. Se o teste instável conhecido falhar sozinho, rode-o de novo antes de suspeitar desta mudança.

- [ ] **Passo 6: Commit**

```bash
git add src/app/login/page.tsx src/app/login/MarcaLogin.tsx tests/e2e/login-visual.spec.ts
git commit -m "feat(login): faixa verde da marca no celular e duas metades no computador" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
