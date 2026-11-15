# Tela de login: faixa verde da marca (design curto)

Aprovado pelo usuário em 15/11/2026 (opção "B" das três mostradas em https://claude.ai/artifact/5Gvy2rn3LtoU2NvyQBuH2X).

## Por quê
O usuário quer as três coisas: a cara da empresa, entrar rápido no celular da bancada e uma tela mais bonita e profissional. A tela de hoje é um cartão branco pequeno, sem marca, boiando no meio do celular.

## O que muda
- **Celular (390×844), primeiro:**
  - faixa verde no topo (`--color-destaque`, #0F766E) com a marca e o título "Devoluções";
  - abaixo do título, a frase "Recebimento, conferência, NF e remessas num só lugar.";
  - o formulário sobe como uma folha branca com cantos arredondados em cima;
  - o botão "Entrar" fica no pé da folha, ao alcance do polegar;
  - embaixo do botão: "Esqueceu a senha? Fale com o Gestor.".
- **Computador (`md:`):** duas metades. A faixa verde ocupa a esquerda, de cima a baixo, e o formulário fica à direita, centralizado, com largura máxima de cerca de 380 px.
- **Marca:** ainda não há logo. Entra um ícone simples (caixa com seta de devolução), em SVG embutido e na cor branca, num componente próprio. Quando a logo chegar, troca-se só esse componente.
- **Mostrar a senha (extra):** um botão "Ver"/"Ocultar" dentro do campo, com 44 px, `aria-pressed` e `aria-controls`. O nome acessível dele **não** contém "senha" nem "e-mail", porque o e2e usa `getByLabel('Senha')` e `getByLabel('E-mail')` sem `exact`.
- **Lembrar de mim (extra):** uma caixa "Lembrar de mim neste aparelho", marcada por padrão.
  - Ao entrar, guarda só o e-mail no `localStorage`, nunca a senha.
  - Na próxima visita, o e-mail vem preenchido e o foco vai para a senha.
  - Desmarcar e entrar apaga o e-mail guardado.
  - Todo acesso ao `localStorage` fica em `try/catch`, porque ele pode não existir em navegação privada.
  - O texto da caixa não contém "e-mail", pelo mesmo motivo do e2e.
- **Teclado:** e-mail com `inputMode="email"`, `autoCapitalize="none"` e `enterKeyHint="next"`; senha com `enterKeyHint="go"`.

## O que não muda
- `acoes.ts` (a ação `entrar`, a sessão, o limite de login por IP, as mensagens de erro).
- O erro continua numa caixa `role="alert"`.
- `<title>` da página, os rótulos "E-mail" e "Senha", o botão "Entrar" e o texto "Entrando…".
- Cores, fonte e tokens de `globals.css`. Nenhuma dependência nova.

## Restrições
- Celular primeiro: sem rolagem lateral em 390×844; áreas de toque de 44 px ou mais; contraste de 4,5:1 ou mais (texto claro sobre #0F766E passa).
- Componentes puros: nada de `localStorage` durante a renderização. A leitura acontece num efeito, depois da montagem.
- O e2e atual (`tests/e2e/apoio.ts`, `login.spec.ts`, `seguranca.spec.ts`, `usuarios.spec.ts`, `pwa.spec.ts`) tem de continuar passando sem mudança.

## Abordagens consideradas
- **A, cartão com a marca:** é a tela de hoje arrumada. É segura, mas é a mais neutra.
- **B, faixa verde da marca (escolhida):** é a que mais tem cara de aplicativo no celular e mostra a marca com força.
- **C, entrada rápida com o usuário lembrado:** a mais rápida, mas com mais estado no aparelho. O "lembrar de mim" da B pega a maior parte do ganho dela, com menos risco.

## Fica para quem implementa
- O desenho exato do ícone provisório.
- O espaçamento fino, dentro da escala do sistema.
- Os testes: unidade com Testing Library (mostrar/ocultar; lembrar grava, preenche e apaga; foco na senha) e um e2e curto nos projetos `computador` e `celular` (sem rolagem lateral, mostrar a senha, e-mail lembrado na segunda visita).
