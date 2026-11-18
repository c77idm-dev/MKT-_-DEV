# Integração pelo Bitbrain (devoluções do ML pelo Bitbrain): plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar este plano tarefa por tarefa. Os passos usam checkbox (`- [ ]`).

**Objetivo:** com `ML_CONECTOR=bitbrain`, o sistema lê as devoluções do Mercado Livre de várias contas pela rota do Bitbrain (só leitura). Ele guarda a conta de cada devolução, mostra 5 extras do ML (nos dois modos) e prepara as respostas ao ML para o Gestor dar à mão. O modo `api` continua exatamente como hoje.

**Arquitetura:**
- **Transporte:** `criarClienteViaBitbrain` implementa o `ClienteML` (o mesmo tipo que o `ConectorML` já usa). O `ConectorML`, os esquemas zod, o mapeamento e as regras de erro não mudam de lugar. Só o `fetch` e a URL mudam: `GET {BITBRAIN_URL}/integracao/devolucoes/ml?empresa=…&caminho=…` com `Authorization: Bearer`.
- **Contas:** tabela `contas_bitbrain`, preenchida pelo `GET /integracao/devolucoes/empresas`. O Gestor marca as que mandam devoluções. `reclamacoes_ml.conta` guarda a conta de cada reclamação.
- **Conector por conta:** `obterConector(db, canal, contexto?)` ganha um 3º argumento opcional `{ conta?, devolucaoId? }`. No modo `bitbrain`, ele monta um `ConectorML` com o `sellerId` da conta e o transporte pelo Bitbrain. A varredura roda conta por conta.
- **Extras:** 3 leituras opcionais novas no `ConectorML.obterReclamacao` (reputação, revisões da triagem, envio da venda), mapeadas por uma função pura e gravadas em colunas anuláveis de `reclamacoes_ml`.
- **Respostas à mão:** no modo `bitbrain`, `ml.enviar-resultado` grava `resposta_pendente = 'OK'` em vez de chamar o ML. A contestação mostra "Responda no ML" e "Marcar como respondida".
- **Testes:** um Bitbrain falso (`fetchBitbrainFalso`) por cima do ML falso que já existe. O e2e do modo `bitbrain` roda numa segunda configuração do Playwright (`npm run test:e2e:bitbrain`).

**Tecnologias:** Next.js 16.4.6 (App Router), React 19.3, TypeScript estrito, Tailwind v4, Drizzle 0.45 + postgres.js, zod 4, pg-boss + worker, Vitest 5 (unidade e `test:int`), Playwright (projetos `computador` e `celular`, Pixel 7 390×844, contra o build de produção).

**Spec:** [docs/superpowers/specs/2026-11-18-integracao-bitbrain-design.md](../specs/2026-11-18-integracao-bitbrain-design.md) (decisões B1–B6 e §4.1–§4.6 valem como lei). Contrato da rota: [docs/integracao/bitbrain-rota-devolucoes.md](../../integracao/bitbrain-rota-devolucoes.md). Spec principal: [2026-11-11-gestao-devolucoes-design.md](../specs/2026-11-11-gestao-devolucoes-design.md).

## Restrições globais
- **Onde:** só no worktree `/c/Users/idmpc/devolucoes-wt/bitbrain` (branch `integracao-bitbrain`). Banco de dev `devolucoes_f7`, banco de testes `devolucoes_test_f7`, `PORTA_E2E=3107` (já no `.env`). Não mexa em `/c/Users/idmpc/Dvoluções Markt` nem em `/c/Users/idmpc/bitbrain`.
- **Modo `api` igual a hoje:** nada muda no comportamento do modo `api` nem do `falso` (OAuth, aviso, varredura de uma conta, OK automático, envio da contestação). Os testes atuais continuam passando sem mudança de expectativa, exceto a lista de chamadas do `conector.test.ts`, que ganha as 3 leituras dos extras (Tarefa 3).
- **Textos fixos (da spec):** "Atualizar contas"; "Sincronizar agora"; conta "indisponível" (selo "Indisponível no Bitbrain"); "Responda no ML"; "Copiar"; "Marcar como respondida" (extra); "OK para responder no ML" (extra); "Marcar como respondido"; alerta "Respostas para dar no ML" (com o número N à direita, ver D10); selos "Urgente · até dd/mm", "Afeta reputação", "Full"; no detalhe "Triagem do ML: Não vendável" e "Dinheiro: retido" (rótulo + valor); erro "Bitbrain recusou: confira o BITBRAIN_TOKEN"; erro do envio no modo Bitbrain "responda no ML à mão".
- **Rótulos num lugar só:** valores e textos dos extras ficam em `src/modules/mercado-livre/dominio.ts`, em português. Esse arquivo não importa nada com `@/` (o schema o importa).
- **Segredos e LGPD:** o `BITBRAIN_TOKEN` nunca vai para log, evento, mensagem de erro, `job.output` ou resposta. Nos logs do modo Bitbrain vão só a empresa, o caminho sem a query e o código HTTP, nunca o corpo.
- **Permissões (spec §6.9):** Configurações › Mercado Livre e Contestações ML exigem `administrar` (Gestor). Toda página e toda Server Action chama `exigirPermissao(acao)` antes de ler o banco. Toda entrada de Server Action (campos ocultos ou argumentos ligados por `bind`) é validada no servidor com zod.
- **Celular primeiro:** 390×844 sem rolagem lateral; cartões, não tabelas; alvos de 44 px ou mais (`min-h-11`); erro em `role="alert"` com foco (`ListaErros` + `useEnvioFormulario`); confirmação em `role="status"`; ação sem volta com 2 toques (`BotaoConfirmar`). Todo e2e roda nos projetos `computador` e `celular`.
- **"(extra)":** marque na tela o que a spec chama de extra: os 5 extras no detalhe, "urgentes primeiro", "Marcar como respondida", "OK para responder no ML".
- **Suposições novas** (a confirmar com a conta real, como A1–A15):
  - **A16:** `GET /post-purchase/v1/returns/{id}/reviews` traz `{ "reviews": [ { "resource_reviews": [ { "product_condition", "stage" } ] } ] }` (ou a lista direto). Vale a última revisão com `product_condition`.
  - **A17:** `GET /post-purchase/v1/claims/{id}/affects-reputation` traz `{ "affects_reputation": "affected" | "not_affected" | "not_applies" }`. A `stage` da triagem usa `pending`/`closed`; outro valor aparece cru.
  - **A18:** com `x-format-new: true`, o tipo logístico vem em `logistic.type`; sem ele, em `logistic_type`. O sistema lê os dois.
  - **A19:** "urgente" = a loja tem ação com `mandatory: true` em `players[respondent].available_actions`.
- **Migração:** `npm run db:gerar -- --name bitbrain_contas_extras` gera `drizzle/0014_bitbrain_contas_extras.sql`. Não escreva SQL à mão.
- **Sem dependência nova.** Não comite mudanças no `package-lock.json` (o npm 11.6.1 deste PC mexe nele).
- **Commits:** terminam com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Não faça push (o controlador faz).
- **Comandos de conferência:** `npm test`, `npm run test:int`, `npm run typecheck`, `npm run lint`, `npm run build:scripts`, `npm run test:e2e`. A partir da Tarefa 11, também `npm run test:e2e:bitbrain`.
- **Next 16:** antes de usar uma API do Next que não aparece no código atual, leia o guia em `node_modules/next/dist/docs/`. Siga os padrões que já existem: Server Action com `useEnvioFormulario`, `revalidatePath` e `redirect`.

## Decisões do plano
Onde a spec é omissa ou o código a contradiz, este plano escolhe a menor mudança que mantém a intenção:
- **D1. Payload da sincronização.** `ml.sincronizar-reclamacao` continua com `claimId` (o nome que já existe) e ganha `conta?: string`. O `{ reclamacaoId, conta }` da spec é isso.
- **D2. Disponibilidade.** `contas_bitbrain` ganha a coluna `disponivel boolean not null default true`. A spec só diz "fica marcada como indisponível". A conta nunca é apagada.
- **D3. Bitbrain falso sem variável nova.** Ele é escolhido por `BITBRAIN_URL=http://bitbrain-falso.invalid` (a constante `URL_BITBRAIN_FALSO`, em `src/lib/env.ts`). O `lerEnv` só aceita essa URL com `PERMITIR_FALSOS=1` (regra E1, em qualquer `NODE_ENV`). O `fetchDoBitbrain` confere de novo com `config.permitirFalsos`.
- **D4. e2e do modo Bitbrain numa segunda configuração.** O e2e do modo Bitbrain roda no `playwright.bitbrain.config.ts` (`npm run test:e2e:bitbrain`), com os mesmos projetos `computador` e `celular`. Ele roda só os arquivos `tests/e2e/bitbrain-*.spec.ts`, e a configuração normal ignora esses arquivos. Motivo: o servidor e o worker leem o `ML_CONECTOR` ao subir, e o e2e do modo `api` precisa continuar rodando como hoje. As duas configurações são rodadas uma depois da outra, no mesmo banco de testes, que o `global-setup` limpa.
- **D5. Recusa da rota ≠ recusa do ML.** Uma resposta do Bitbrain com corpo `{"erro": …}` vira `ErroBitbrain`, e nunca `ErroML`: 401 é `token`, 403 é `caminho` e 404 é `empresa`. Assim ela nunca cai na "recusa definitiva" silenciosa do ML. A tarefa lança, tenta 5 vezes e vai para Falhas com "Bitbrain recusou: confira o BITBRAIN_TOKEN". Os erros do ML repassados continuam `ErroML`, com as regras de hoje. Não existe adivinhação para "rota desligada" no `/ml`: isso aparece como erro da varredura, no alerta de sincronização parada e na mensagem do "Atualizar contas".
- **D6. Varredura com várias contas.** A conta que falha vai para o log e é pulada. A `ultima_sincronizacao_em` dela não anda, e o alerta por conta aparece depois de 1 h. Se **todas** as contas marcadas falharem (Bitbrain fora do ar, token errado), a tarefa lança: tenta de novo e depois vai para Falhas. O 404 "empresa sem conta do ML" marca a conta como indisponível e não conta como falha.
- **D7. Urgente.** `urgente` = alguma ação da loja com `mandatory: true` (A19). `acao_pendente` = essa ação (a de prazo mais curto) ou, sem ação obrigatória, a revisão `return_review_*` com prazo; nesse caso `urgente` é `false`. Sem a loja entre os `players`, os dois ficam nulos. O selo "Urgente · até dd/mm" usa `devolucoes.prazo_conferencia_canal`; sem prazo, o selo é só "Urgente". No cartão urgente, ele substitui o selo "Prazo dd/mm".
- **D8. Gravação dos extras.**
  - `urgente` e `acao_pendente` são regravados a cada sincronização, porque somem quando o ML tira a ação.
  - `afeta_reputacao`, `eh_full`, `triagem_*` e `dinheiro` guardam o último valor conhecido quando a leitura nova vem nula (`coalesce`): uma leitura opcional recusada não apaga o que o ML já disse.
  - `conta` só é gravada quando é conhecida.
- **D9. Full no modo Bitbrain.** O filtro de dados pessoais do contrato (`/shipments`) deixa passar só `logistic_type`. No formato novo (`x-format-new`), o tipo vem em `logistic.type` (A18). O sistema lê os dois. A Tarefa 14 acrescenta ao contrato um adendo: manter `logistic.{mode,type,direction}`, que não é dado pessoal. Até a sessão do Bitbrain aplicar o adendo, o Full pode vir nulo no modo `bitbrain`.
- **D10. Alertas.**
  - "Respostas para dar no ML" (`respostas_ml`): para o Gestor, com o número N à direita, como os outros alertas do painel. Conta os "OK" pendentes mais as contestações `AGUARDANDO_GESTOR` ou `FALHOU`. Leva a `/contestacoes`. Só existe no modo `bitbrain`.
  - Alerta novo `conta_bitbrain_indisponivel` ("Conta do ML indisponível no Bitbrain"): para o Gestor, quando uma conta marcada está indisponível.
  - No modo `bitbrain`, o `sincronizacao_ml` mostra quantas contas marcadas estão paradas há mais de 1 h.
- **D11. Eventos novos e entidade nova** (emenda E21 ao contrato, registrada na Tarefa 14):
  - `ml_conta_bitbrain_marcada` e `ml_conta_bitbrain_desmarcada`, na entidade `conta_bitbrain`, com o id = a empresa;
  - `ml_resposta_manual_pendente`, `ml_contestacao_respondida_a_mao` e `ml_ok_respondido_a_mao`, na entidade `devolucao`.
  - Os rótulos entram em `src/modules/historico/rotulos/mercado-livre.ts`.
- **D12. "Sincronizar agora" sem chave única.** Ele enfileira `ml.varredura` sem `chaveUnica`: cada toque é uma varredura. As sincronizações repetidas já são cortadas por minuto pela `chaveTarefaReclamacao`. Com chave por minuto, o e2e do `celular`, logo depois do `computador`, não sincronizaria.
- **D13. Lista de contas.** Configurações › Mercado Livre atualiza as contas pelo `/empresas` ao abrir, com tempo limite de 5 s. Se falhar, a tela mostra a mensagem e a lista guardada.
- **D14. Contestação no modo Bitbrain.**
  - "Responda no ML" mostra o motivo e a mensagem como estão, sem edição; se precisar, o Gestor ajusta no ML.
  - As fotos são as candidatas da devolução, cada uma com o link "Baixar".
  - "Marcar como respondida" e "Marcar como respondido" usam o `BotaoConfirmar` (2 toques, sem desfazer).
  - A seção "OK para responder no ML (extra)" fica no topo de `/contestacoes`.
- **D15. OAuth e webhook no modo Bitbrain.**
  - `ml.renovar-token` não faz nada.
  - Os blocos de OAuth somem da tela, e `conectarAcao` recusa.
  - A rota do webhook fica como está: sem `contas_marketplace`, ela só grava o aviso.
- **D16. Erro do ML pelo Bitbrain.** `ErroML` ganha `empresa: string | null` (4º argumento opcional). O `logErroML` registra só `{ status, empresa, caminho }` quando há empresa (spec §5), e o caminho já vem sem a query.
- **D17. ML falso** (vale nos dois modos):
  - rotas novas de reputação e de revisões;
  - envio da venda com o id `7<i><c><seq>`;
  - o cenário 2 passa a ser urgente, afetar a reputação e ser Full;
  - o cenário 5 ganha a triagem `unsaleable`/`closed`.
  - Nenhum e2e atual usa os cenários 2 e 5.
- **D18. Conta no cartão.** O cartão mostra a conta na linha de cima: "Mercado Livre · <nome da conta>", com reticências.
- **D19. Interface congelada intacta.** `src/conectores/marketplace/tipos.ts` (E9) não muda. O contexto da conta entra pelo `registro.ts` e pelo `obterConectorML`.

## Foco da revisão
1. **Token nunca vaza:** nem no log, nem no `ErroML`/`ErroBitbrain`, nem no `job.output`, nem na mensagem do `lerEnv`. Testes nas Tarefas 1 e 2.
2. **Modo `api` igual a hoje:** a suíte atual passa, e o `obterConector(db, 'MERCADO_LIVRE')` sem contexto devolve o conector da conta ATIVA. Testes nas Tarefas 7, 9 e 10.
3. **Uma conta que falha não para as outras;** todas falhando, a tarefa lança. Teste na Tarefa 8.
4. **"OK" pendente não volta depois de respondido,** mesmo se `ml.enviar-resultado` rodar de novo. Teste na Tarefa 9.
5. **Lista fechada respeitada:** no modo `bitbrain` o sistema só chama os 12 caminhos (o Bitbrain falso devolve 403 para os outros). Teste na Tarefa 4.
6. **Extras nulos não apagam o que já se sabia** (D8). Teste na Tarefa 5.
7. **Celular:** cartão com conta longa e 3 selos, sem rolagem lateral; "Responda no ML" com mensagem longa. e2e nas Tarefas 12 e 13.

## Mapa de arquivos
- **Criar:**
  - `src/conectores/marketplace/bitbrain/cliente.ts`, `cliente.test.ts` (transporte, empresas, erros);
  - `src/conectores/marketplace/bitbrain/falso.ts`, `falso.test.ts` (Bitbrain falso com a lista fechada e o filtro de dados pessoais);
  - `src/modules/mercado-livre/contas-bitbrain.ts`, `contas-bitbrain.int.test.ts`;
  - `src/modules/mercado-livre/respostas-manuais.ts`, `respostas-manuais.int.test.ts`;
  - `src/modules/mercado-livre/bitbrain.int.test.ts` (conector por conta, sincronização, NF) e `varredura-bitbrain.int.test.ts`;
  - `tests/helpers/fabricas-bitbrain.ts` (sem vitest) e `tests/helpers/modo-bitbrain.ts` (com `vi.stubEnv`);
  - `drizzle/0014_bitbrain_contas_extras.sql` (gerado);
  - `playwright.bitbrain.config.ts`;
  - `tests/e2e/apoio-bitbrain.ts`, `bitbrain-configuracoes.spec.ts`, `bitbrain-devolucoes.spec.ts`, `bitbrain-respostas.spec.ts`;
  - telas: `configuracoes/mercado-livre/ContasBitbrain.tsx` (+ teste) e `acoes-bitbrain.ts`; `contestacoes/[id]/RespondaNoML.tsx` (+ teste); `contestacoes/OkParaResponder.tsx` (+ teste) e `contestacoes/acoes.ts`; `src/components/mercado-livre/BotaoCopiar.tsx` (+ teste).
- **Modificar:**
  - `src/lib/env.ts`, `src/modules/mercado-livre/config.ts`, `.env.example`, `.env.producao.example`, `scripts/infra.test.ts`;
  - no ML: `mercadolivre/{cliente,erros,esquemas,mapeamento,conector,falso,tipos}.ts`, `tests/fixtures/ml-falso/cenarios.json`, `tests/helpers/fabricas-ml.ts`;
  - `src/db/schema/mercado-livre.ts`;
  - `src/modules/mercado-livre/{dominio,sincronizar,fabrica-conector,conector,tarefas,resultado,contestacoes,consultas,selos}.ts`;
  - `src/conectores/marketplace/registro.ts`, `src/modules/fila/tarefas.ts`, `src/worker/manipuladores/mercado-livre.ts`, `src/modules/fiscal/nota-venda.ts`;
  - histórico: `src/modules/historico/{eventos.ts,rotulos/mercado-livre.ts}`;
  - alertas: `src/modules/acabamento/{alertas,alertas-regras}.ts`;
  - fluxo: `src/modules/devolucoes/{busca,selos,quadro}.ts`, `src/components/CartaoDevolucao.tsx`;
  - páginas: as de Configurações › Mercado Livre, Contestações, detalhe (`SecaoMercadoLivre.tsx`) e etapa;
  - e2e: `playwright.config.ts`, `tests/e2e/{dados,global-setup}.ts`, `package.json` (script), `tests/e2e/mercado-livre.spec.ts`;
  - documentação (Tarefa 14).

---

### Tarefa 1: Configuração do modo `bitbrain` (env e `configML`)

**Objetivo:** `ML_CONECTOR` aceita `bitbrain`. Com ele, `BITBRAIN_URL` e `BITBRAIN_TOKEN` são obrigatórios, e em produção a URL precisa ser `https`. A URL do Bitbrain falso só vale com `PERMITIR_FALSOS=1`. O `configML` expõe os campos novos.

**Arquivos:**
- Modificar: `src/lib/env.ts`, `src/lib/env.test.ts`, `src/modules/mercado-livre/config.ts`, `src/modules/mercado-livre/config.test.ts`, `tests/helpers/fabricas-ml.ts` (`configMLTeste`), `.env.example`, `.env.producao.example`, `scripts/infra.test.ts`

**Interfaces:**
- Produz (`src/lib/env.ts`):
  - `URL_BITBRAIN_FALSO = 'http://bitbrain-falso.invalid'`;
  - `TOKEN_BITBRAIN_FALSO = 'token-do-bitbrain-falso-so-para-testes'`;
  - `Env.ML_CONECTOR: 'api' | 'bitbrain' | 'falso'`;
  - `Env.BITBRAIN_URL?: string` e `Env.BITBRAIN_TOKEN?: string`.
- Produz (`config.ts`):
  - `ModoML = 'api' | 'bitbrain' | 'falso'`;
  - `ConfigML` ganha `bitbrainUrl: string` (sem a barra do fim), `bitbrainToken: string` e `permitirFalsos: boolean`;
  - `faltasConfigML` no modo `bitbrain` lista só `BITBRAIN_URL` e `BITBRAIN_TOKEN`.
- Produz (`tests/helpers/fabricas-ml.ts`): `configMLTeste()` com `bitbrainUrl: ''`, `bitbrainToken: ''` e `permitirFalsos: false` no padrão.

- [ ] **Passo 1: Testes que falham** (`src/lib/env.test.ts`, no fim do arquivo)

```ts
import { lerEnv, SEGREDO_LINKS_DESENVOLVIMENTO, TOKEN_BITBRAIN_FALSO, URL_BITBRAIN_FALSO } from './env';

describe('lerEnv: ML_CONECTOR=bitbrain (integração de 18/11)', () => {
  const BB = { ...BASE, ML_CONECTOR: 'bitbrain', BITBRAIN_URL: 'https://bitbrain.exemplo.com.br', BITBRAIN_TOKEN: 'a'.repeat(64) };

  it('aceita a URL e o token; o padrão continua api', () => {
    expect(lerEnv(BASE).ML_CONECTOR).toBe('api');
    expect(lerEnv(BB)).toMatchObject({ ML_CONECTOR: 'bitbrain', BITBRAIN_URL: 'https://bitbrain.exemplo.com.br' });
  });

  it('exige BITBRAIN_URL e BITBRAIN_TOKEN', () => {
    expect(() => lerEnv({ ...BASE, ML_CONECTOR: 'bitbrain' })).toThrow(/BITBRAIN_URL.*BITBRAIN_TOKEN/);
  });

  it('em produção a URL precisa ser https; fora dela, http serve; texto que não é URL é recusado', () => {
    const PROD = { ...BB, NODE_ENV: 'production', SEGREDO_LINKS: 'x'.repeat(32) };
    expect(() => lerEnv({ ...PROD, BITBRAIN_URL: 'http://bitbrain.exemplo.com.br' })).toThrow(/BITBRAIN_URL: em produção precisa começar com https/);
    expect(lerEnv(PROD).BITBRAIN_URL).toBe('https://bitbrain.exemplo.com.br');
    expect(lerEnv({ ...BB, BITBRAIN_URL: 'http://localhost:8000' }).BITBRAIN_URL).toBe('http://localhost:8000');
    expect(() => lerEnv({ ...BB, BITBRAIN_URL: 'bitbrain' })).toThrow(/BITBRAIN_URL: precisa ser um endereço http/);
  });

  it('o Bitbrain falso só vale com PERMITIR_FALSOS=1 (E1), em qualquer NODE_ENV', () => {
    const FALSO = { ...BB, BITBRAIN_URL: URL_BITBRAIN_FALSO, BITBRAIN_TOKEN: TOKEN_BITBRAIN_FALSO };
    expect(() => lerEnv(FALSO)).toThrow(/BITBRAIN_URL: o Bitbrain falso só vale com PERMITIR_FALSOS=1/);
    expect(lerEnv({ ...FALSO, PERMITIR_FALSOS: '1' }).BITBRAIN_URL).toBe(URL_BITBRAIN_FALSO);
    expect(lerEnv({ ...FALSO, PERMITIR_FALSOS: '1', NODE_ENV: 'production', SEGREDO_LINKS: 'x'.repeat(32) }).ML_CONECTOR).toBe('bitbrain');
  });

  it('a mensagem de erro nunca traz o token', () => {
    let mensagem = '';
    try {
      lerEnv({ ...BB, BITBRAIN_URL: 'ftp://x', BITBRAIN_TOKEN: 'segredo-que-nao-pode-vazar' });
    } catch (erro) {
      mensagem = String(erro);
    }
    expect(mensagem).toContain('BITBRAIN_URL');
    expect(mensagem).not.toContain('segredo-que-nao-pode-vazar');
  });
});
```

`src/modules/mercado-livre/config.test.ts`: troque o `toEqual` do 1º teste para incluir `bitbrainUrl: '', bitbrainToken: '', permitirFalsos: false` e acrescente:

```ts
describe('configML no modo bitbrain', () => {
  it('lê a URL (sem a barra do fim), o token e a liberação dos falsos', () => {
    const c = configML({ ML_CONECTOR: 'bitbrain', BITBRAIN_URL: ' https://bb.exemplo.com.br/ ', BITBRAIN_TOKEN: ' t ', PERMITIR_FALSOS: '1' });
    expect(c).toMatchObject({ modo: 'bitbrain', bitbrainUrl: 'https://bb.exemplo.com.br', bitbrainToken: 't', permitirFalsos: true });
  });

  it('faltas: no modo bitbrain só a URL e o token (o app do ML não é preciso)', () => {
    expect(faltasConfigML(configML({ ML_CONECTOR: 'bitbrain' }))).toEqual(['BITBRAIN_URL', 'BITBRAIN_TOKEN']);
    expect(faltasConfigML(configML({ ML_CONECTOR: 'bitbrain', BITBRAIN_URL: 'https://x', BITBRAIN_TOKEN: 't' }))).toEqual([]);
  });
});
```

- [ ] **Passo 2:** `npm test -- src/lib/env.test.ts src/modules/mercado-livre/config.test.ts` → FAIL (exports inexistentes e `bitbrain` recusado pela lista).

- [ ] **Passo 3: Implementação**

`src/lib/env.ts`:
- Depois de `SEGREDO_LINKS_DESENVOLVIMENTO`:

```ts
/** Só para testes (contrato §10, E1; plano Bitbrain D3): o Bitbrain falso. Esta URL só vale com PERMITIR_FALSOS=1. */
export const URL_BITBRAIN_FALSO = 'http://bitbrain-falso.invalid';
/** Token que o Bitbrain falso aceita. Não é segredo: só serve para o falso. */
export const TOKEN_BITBRAIN_FALSO = 'token-do-bitbrain-falso-so-para-testes';
```

- No esquema:
  - troque `ML_CONECTOR: lista(['api', 'falso'] as const, 'api')` por `lista(['api', 'bitbrain', 'falso'] as const, 'api')`;
  - acrescente, depois de `CHAVE_CRIPTOGRAFIA`:

```ts
  // Bitbrain (integração de 18/11): só com ML_CONECTOR=bitbrain. O token é o DEVOLUCOES_TOKEN do Bitbrain.
  BITBRAIN_URL: opcional(),
  BITBRAIN_TOKEN: opcional(),
```

- Em `problemas`, antes do `return erros`: `if (e.ML_CONECTOR === 'bitbrain') erros.push(...problemasBitbrain(e));`. Acima de `problemas`:

```ts
function protocoloDe(url: string): string {
  try {
    return new URL(url).protocol;
  } catch {
    return '';
  }
}

/** As mensagens nunca trazem o valor das variáveis (o token é segredo). */
function problemasBitbrain(e: EnvLido): string[] {
  const erros: string[] = [];
  const url = e.BITBRAIN_URL;
  if (!url) erros.push('BITBRAIN_URL: obrigatório com ML_CONECTOR=bitbrain');
  else if (url === URL_BITBRAIN_FALSO) {
    if (e.PERMITIR_FALSOS !== '1') erros.push('BITBRAIN_URL: o Bitbrain falso só vale com PERMITIR_FALSOS=1 (testes)');
  } else {
    const protocolo = protocoloDe(url);
    if (protocolo !== 'https:' && protocolo !== 'http:') erros.push('BITBRAIN_URL: precisa ser um endereço http(s) válido');
    else if (e.NODE_ENV === 'production' && protocolo !== 'https:') erros.push('BITBRAIN_URL: em produção precisa começar com https://');
  }
  if (!e.BITBRAIN_TOKEN) erros.push('BITBRAIN_TOKEN: obrigatório com ML_CONECTOR=bitbrain');
  return erros;
}
```

`src/modules/mercado-livre/config.ts`:

```ts
export type ModoML = 'api' | 'bitbrain' | 'falso';
export type ConfigML = {
  modo: ModoML;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  usarPkce: boolean;
  chaveBase64: string;
  /** Modo bitbrain: a base da rota do Bitbrain, sem a barra do fim. */
  bitbrainUrl: string;
  /** Modo bitbrain: o DEVOLUCOES_TOKEN do Bitbrain. Nunca vai para log. */
  bitbrainToken: string;
  /** PERMITIR_FALSOS=1 (só o e2e): libera o Bitbrain falso (D3). */
  permitirFalsos: boolean;
};

function modoDe(valor: string): ModoML {
  return valor === 'falso' || valor === 'bitbrain' ? valor : 'api';
}
```

- Em `configML`, use `modo: modoDe(texto(env.ML_CONECTOR))` e acrescente:

```ts
    bitbrainUrl: texto(env.BITBRAIN_URL).replace(/\/+$/, ''),
    bitbrainToken: texto(env.BITBRAIN_TOKEN),
    permitirFalsos: texto(env.PERMITIR_FALSOS) === '1',
```

- Em `faltasConfigML`, logo depois de `if (c.modo === 'falso') return [];`:

```ts
  if (c.modo === 'bitbrain') return [...(c.bitbrainUrl ? [] : ['BITBRAIN_URL']), ...(c.bitbrainToken ? [] : ['BITBRAIN_TOKEN'])];
```

- `tests/helpers/fabricas-ml.ts`: acrescente ao objeto do `configMLTeste` as chaves `bitbrainUrl: ''`, `bitbrainToken: ''` e `permitirFalsos: false`, antes de `...mudancas`.
- `.env.example`: depois do bloco do ML, acrescente:

```
# Bitbrain (integração de 18/11): com ML_CONECTOR=bitbrain, as devoluções do ML chegam pelo Bitbrain (várias contas).
# O Bitbrain falso (BITBRAIN_URL=http://bitbrain-falso.invalid) só vale no e2e, com PERMITIR_FALSOS=1.
BITBRAIN_URL=
BITBRAIN_TOKEN=
```

- `.env.producao.example`: logo depois de `CHAVE_CRIPTOGRAFIA=`, acrescente:

```
# Bitbrain: ML_CONECTOR=bitbrain liga as devoluções pelo Bitbrain. BITBRAIN_URL começa com https://.
# BITBRAIN_TOKEN = o mesmo DEVOLUCOES_TOKEN do .env do Bitbrain (openssl rand -hex 32). Nunca vai para o git.
BITBRAIN_URL=
BITBRAIN_TOKEN=
```

- `scripts/infra.test.ts`: nas duas listas `for (const segredo of [...])`, acrescente `'BITBRAIN_'`. O serviço `backup` não pode receber o token.

- [ ] **Passo 4:** `npm test -- src/lib src/modules/mercado-livre/config.test.ts scripts/infra.test.ts && npm run typecheck` → PASS. O `typecheck` acusa os `ConfigML` montados à mão: corrija cada um com as 3 chaves novas.

- [ ] **Passo 5: Commit**

```bash
git add src/lib/env.ts src/lib/env.test.ts src/modules/mercado-livre/config.ts src/modules/mercado-livre/config.test.ts tests/helpers/fabricas-ml.ts .env.example .env.producao.example scripts/infra.test.ts
git commit -m "feat(ml): ML_CONECTOR=bitbrain com BITBRAIN_URL e BITBRAIN_TOKEN (https em producao, falso so com PERMITIR_FALSOS=1)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Tarefa 2: Transporte pelo Bitbrain (`criarClienteViaBitbrain`) e lista de empresas

**Objetivo:** um `ClienteML` que chama a rota do Bitbrain com o comportamento do cliente do ML (429 com `Retry-After`, tempo limite, `ErroML` com o código do ML). A rota recusar vira `ErroBitbrain` (D5). `post` e `postArquivo` lançam `ErroRespostaManual`. Também lê `/empresas`.

**Arquivos:**
- Criar: `src/conectores/marketplace/bitbrain/cliente.ts`, `src/conectores/marketplace/bitbrain/cliente.test.ts`
- Modificar: `src/conectores/marketplace/mercadolivre/cliente.ts` (`ErroML.empresa`), `src/conectores/marketplace/mercadolivre/erros.ts` (`logErroML`), `src/conectores/marketplace/mercadolivre/erros.test.ts`

**Interfaces:**
- Consome: `ClienteML`, `ErroML`, `esperaDo429`, `NOVAS_TENTATIVAS_429` e `analisarJson`, de `mercadolivre/cliente.ts`.
- Produz (`bitbrain/cliente.ts`):
  - `CAMINHO_EMPRESAS = '/integracao/devolucoes/empresas'`, `CAMINHO_ML = '/integracao/devolucoes/ml'`, `TIMEOUT_EMPRESAS_MS = 5_000`;
  - `MENSAGEM_RESPOSTA_MANUAL` e `class ErroRespostaManual extends Error`;
  - `type MotivoErroBitbrain = 'token' | 'caminho' | 'empresa' | 'fora_do_ar' | 'formato'`;
  - `class ErroBitbrain extends Error { status: number; motivo: MotivoErroBitbrain; empresa: string | null }`;
  - `type OpcoesBitbrain = { url: string; token: string; fetchFn?: typeof fetch; timeoutMs?: number }`;
  - `type OpcoesClienteBitbrain = OpcoesBitbrain & { empresa: string; esperar?: (ms: number) => Promise<void>; aleatorio?: () => number }`;
  - `criarClienteViaBitbrain(o: OpcoesClienteBitbrain): ClienteML`;
  - `type EmpresaBitbrain = { empresa: string; nome: string; sellerId: string }`;
  - `listarEmpresasBitbrain(o: OpcoesBitbrain): Promise<EmpresaBitbrain[]>`.
- Produz (`mercadolivre/cliente.ts`): `new ErroML(status, corpo, caminho, empresa: string | null = null)` e `readonly empresa: string | null`.

- [ ] **Passo 1: Testes que falham** (`src/conectores/marketplace/bitbrain/cliente.test.ts`)

```ts
import { describe, expect, it, vi } from 'vitest';
import { ErroML } from '../mercadolivre/cliente';
import { CAMINHO_EMPRESAS, CAMINHO_ML, criarClienteViaBitbrain, ErroBitbrain, ErroRespostaManual, listarEmpresasBitbrain } from './cliente';

const URL_BB = 'https://bitbrain.exemplo.com.br/';
const TOKEN = 'token-secreto-de-teste';
type Chamada = [string, RequestInit];

const resposta = (corpo: unknown, status = 200, cabecalhos: Record<string, string> = {}) =>
  new Response(typeof corpo === 'string' ? corpo : JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json', ...cabecalhos } });

function emSequencia(...respostas: Response[]) {
  return vi.fn(async (_url: string, _init?: RequestInit) => respostas.shift() ?? resposta({}));
}

const cliente = (fetchFn: unknown, extra: Record<string, unknown> = {}) =>
  criarClienteViaBitbrain({ url: URL_BB, token: TOKEN, empresa: 'megadino', fetchFn: fetchFn as typeof fetch, ...extra });

describe('criarClienteViaBitbrain (ClienteML pela rota do Bitbrain)', () => {
  it('GET vai à rota com a empresa e o caminho (com a query) e o Bearer do Bitbrain', async () => {
    const fetchFn = emSequencia(resposta({ id: 1 }));
    expect(await cliente(fetchFn).get('/post-purchase/v1/claims/search?players.role=respondent&offset=0', { 'x-format-new': 'true' })).toEqual({ id: 1 });
    const [url, init] = fetchFn.mock.calls[0] as unknown as Chamada;
    const u = new URL(url);
    expect(`${u.origin}${u.pathname}`).toBe(`https://bitbrain.exemplo.com.br${CAMINHO_ML}`);
    expect(Object.fromEntries(u.searchParams)).toEqual({ empresa: 'megadino', caminho: '/post-purchase/v1/claims/search?players.role=respondent&offset=0' });
    expect(init.headers).toMatchObject({ authorization: `Bearer ${TOKEN}` });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('getTexto devolve o XML como veio', async () => {
    const fetchFn = emSequencia(new Response('<nfeProc/>', { status: 200, headers: { 'content-type': 'application/xml' } }));
    expect(await cliente(fetchFn).getTexto('/users/1/invoices/documents/xml/ABC/authorized')).toBe('<nfeProc/>');
  });

  it('repassa o código do ML: 404 vira ErroML com o caminho sem a query e a empresa, sem o token', async () => {
    const fetchFn = emSequencia(resposta({ message: 'not_found', error: 'not_found', status: 404 }, 404));
    const erro = await cliente(fetchFn).get('/orders/1?x=1').catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroML);
    expect(erro).toMatchObject({ status: 404, caminho: '/orders/1', empresa: 'megadino' });
    expect(JSON.stringify(erro)).not.toContain(TOKEN);
    expect((erro as Error).message).not.toContain(TOKEN);
  });

  it('429 com Retry-After espera o que veio e tenta de novo (paridade com o cliente do ML)', async () => {
    const fetchFn = emSequencia(resposta({ error: 'local_rate_limited' }, 429, { 'retry-after': '2' }), resposta({ ok: true }));
    const esperar = vi.fn(async () => {});
    expect(await cliente(fetchFn, { esperar }).get('/x')).toEqual({ ok: true });
    expect(esperar.mock.calls).toEqual([[2000]]);
  });

  it('desiste depois de 3 novas tentativas com ErroML 429', async () => {
    const fetchFn = vi.fn(async () => resposta({ error: 'local_rate_limited' }, 429));
    const erro = await cliente(fetchFn, { esperar: async () => {} }).get('/x').catch((e: unknown) => e);
    expect(erro).toMatchObject({ status: 429 });
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });

  it('5xx do ML vira ErroML (a tarefa tenta de novo)', async () => {
    const erro = await cliente(emSequencia(resposta({ message: 'internal' }, 500))).get('/x').catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroML);
    expect(erro).toMatchObject({ status: 500 });
  });

  it('recusa da própria rota ({"erro": ...}) vira ErroBitbrain, nunca ErroML (D5)', async () => {
    const casos = [
      [401, { erro: 'token inválido' }, 'token'],
      [403, { erro: 'caminho não permitido' }, 'caminho'],
      [404, { erro: 'empresa sem conta do ML' }, 'empresa'],
    ] as const;
    for (const [status, corpo, motivo] of casos) {
      const erro = await cliente(emSequencia(resposta(corpo, status))).get('/x?y=1').catch((e: unknown) => e);
      expect(erro).toBeInstanceOf(ErroBitbrain);
      expect(erro).not.toBeInstanceOf(ErroML);
      expect(erro).toMatchObject({ status, motivo, empresa: 'megadino' });
    }
    const token = await cliente(emSequencia(resposta({ erro: 'token inválido' }, 401))).get('/x').catch((e: unknown) => e);
    expect((token as Error).message).toContain('Bitbrain recusou: confira o BITBRAIN_TOKEN');
  });

  it('2xx que não é JSON vira ErroML (e não SyntaxError)', async () => {
    const erro = await cliente(emSequencia(new Response('<html>x</html>', { status: 200 }))).get('/orders/1').catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroML);
  });

  it('tempo limite: o pedido é abortado depois de timeoutMs', async () => {
    const fetchFn = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_ok, falha) => init?.signal?.addEventListener('abort', () => falha(init.signal?.reason))),
    );
    const erro = await cliente(fetchFn, { timeoutMs: 20 }).get('/x').catch((e: unknown) => e);
    expect((erro as Error).name).toBe('TimeoutError');
  });

  it('post e postArquivo lançam ErroRespostaManual ("responda no ML à mão") sem chamar o Bitbrain', async () => {
    const fetchFn = vi.fn();
    const c = cliente(fetchFn);
    await expect(c.post('/post-purchase/v1/returns/1/return-review', {})).rejects.toBeInstanceOf(ErroRespostaManual);
    await expect(c.postArquivo('/x', { nome: 'a.jpg', conteudo: Buffer.from('a'), tipoConteudo: 'image/jpeg' })).rejects.toThrow(/responda no ML à mão/);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('listarEmpresasBitbrain', () => {
  it('lê as empresas (seller_id em texto ou número), sem repetir, com o Bearer', async () => {
    const fetchFn = emSequencia(
      resposta({
        empresas: [
          { empresa: 'megadino', nome: 'IDM Shop', seller_id: '25255785' },
          { empresa: 'how', nome: '', seller_id: 111 },
          { empresa: 'megadino', nome: 'IDM Shop', seller_id: '25255785' },
        ],
      }),
    );
    expect(await listarEmpresasBitbrain({ url: URL_BB, token: TOKEN, fetchFn: fetchFn as unknown as typeof fetch })).toEqual([
      { empresa: 'megadino', nome: 'IDM Shop', sellerId: '25255785' },
      { empresa: 'how', nome: 'how', sellerId: '111' },
    ]);
    const [url, init] = fetchFn.mock.calls[0] as unknown as Chamada;
    expect(new URL(url).pathname).toBe(CAMINHO_EMPRESAS);
    expect(init.headers).toMatchObject({ authorization: `Bearer ${TOKEN}` });
  });

  it('401 → token; 404 ou 5xx → fora_do_ar; corpo estranho → formato', async () => {
    const ler = (r: Response) => listarEmpresasBitbrain({ url: URL_BB, token: TOKEN, fetchFn: emSequencia(r) as unknown as typeof fetch }).catch((e: unknown) => e);
    expect(await ler(resposta({ erro: 'token inválido' }, 401))).toMatchObject({ motivo: 'token' });
    expect(await ler(resposta({ detail: 'Not Found' }, 404))).toMatchObject({ motivo: 'fora_do_ar' });
    expect(await ler(resposta('erro', 502))).toMatchObject({ motivo: 'fora_do_ar' });
    expect(await ler(resposta({ contas: [] }))).toMatchObject({ motivo: 'formato' });
  });
});
```

`src/conectores/marketplace/mercadolivre/erros.test.ts`, um teste novo:

```ts
it('erro pelo Bitbrain: o log tem só status, empresa e caminho, sem corpo (spec Bitbrain §5)', () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  logErroML('teste', new ErroML(500, '{"buyer":{"first_name":"Ana"}}', '/orders/1', 'megadino'));
  const linha = JSON.parse(String(log.mock.calls[0][0]));
  expect(linha).toMatchObject({ status: 500, empresa: 'megadino', caminho: '/orders/1' });
  expect(linha).not.toHaveProperty('corpo');
  expect(String(log.mock.calls[0][0])).not.toContain('Ana');
  log.mockRestore();
});
```

(Importe `vi` de `vitest` e `ErroML` de `./cliente` se o arquivo ainda não importar.)

- [ ] **Passo 2:** `npm test -- src/conectores/marketplace` → FAIL (o módulo não existe e o `ErroML` não tem `empresa`).

- [ ] **Passo 3: Implementação**

`mercadolivre/cliente.ts`, no `ErroML`:

```ts
  /** Empresa do Bitbrain quando o erro veio pela rota dele (D16); null no modo api. */
  readonly empresa: string | null;

  constructor(status: number, corpo: string, caminho: string, empresa: string | null = null) {
    super(`Mercado Livre respondeu ${status} em ${caminho}${empresa ? ` (conta ${empresa}, pelo Bitbrain)` : ''}`);
    this.name = 'ErroML';
    this.status = status;
    Object.defineProperty(this, 'corpo', { value: corpo, enumerable: false });
    this.caminho = caminho;
    this.empresa = empresa;
  }
```

`mercadolivre/erros.ts`:
- Importe `import { ErroBitbrain } from '../bitbrain/cliente';`. Não há ciclo: `bitbrain/cliente` importa só `mercadolivre/cliente`.
- Troque o `base` do `logErroML` por:

```ts
  const base =
    erro instanceof ErroML
      ? erro.empresa !== null
        ? { status: erro.status, empresa: erro.empresa, caminho: erro.caminho }
        : { status: erro.status, caminho: erro.caminho, corpo: resumirCorpoErro(erro.corpo) }
      : erro instanceof ErroBitbrain
        ? { status: erro.status, empresa: erro.empresa, mensagem: erro.message }
        : { mensagem: erro instanceof Error ? erro.message : String(erro) };
```

`src/conectores/marketplace/bitbrain/cliente.ts`:

```ts
import { z } from 'zod';
import { analisarJson, ErroML, esperaDo429, NOVAS_TENTATIVAS_429, type ClienteML } from '../mercadolivre/cliente';

/** Rotas do Bitbrain para o sistema de devoluções (contrato: docs/integracao/bitbrain-rota-devolucoes.md). */
export const CAMINHO_EMPRESAS = '/integracao/devolucoes/empresas';
export const CAMINHO_ML = '/integracao/devolucoes/ml';
/** Ao abrir Configurações › Mercado Livre, a lista de contas não pode segurar a tela por muito tempo (D13). */
export const TIMEOUT_EMPRESAS_MS = 5_000;

export const MENSAGEM_RESPOSTA_MANUAL = 'No modo Bitbrain o sistema não escreve no Mercado Livre: responda no ML à mão.';

/** B2: a rota só lê. Ninguém deve chamar post/postArquivo no modo bitbrain; se chamar, o erro explica. */
export class ErroRespostaManual extends Error {
  constructor() {
    super(MENSAGEM_RESPOSTA_MANUAL);
    this.name = 'ErroRespostaManual';
  }
}

export type MotivoErroBitbrain = 'token' | 'caminho' | 'empresa' | 'fora_do_ar' | 'formato';
const MENSAGEM_TOKEN = 'Bitbrain recusou: confira o BITBRAIN_TOKEN';

function mensagem(status: number, motivo: MotivoErroBitbrain, empresa: string | null, caminho: string | null): string {
  switch (motivo) {
    case 'token':
      return `${MENSAGEM_TOKEN} (HTTP ${status}).`;
    case 'caminho':
      return `${MENSAGEM_TOKEN} (HTTP ${status}, caminho não permitido: ${caminho ?? '?'}).`;
    case 'empresa':
      return `O Bitbrain não tem a conta do ML da empresa ${empresa ?? '?'} (HTTP ${status}).`;
    case 'fora_do_ar':
      return `O Bitbrain não respondeu (HTTP ${status}). Confira se a rota de devoluções está ligada.`;
    case 'formato':
      return 'A resposta do Bitbrain veio fora do formato esperado.';
  }
}

/** Recusa da própria rota do Bitbrain (corpo {"erro": ...}), e não do ML (D5). Não é ErroML: a tarefa lança e vai para Falhas. */
export class ErroBitbrain extends Error {
  readonly status: number;
  readonly motivo: MotivoErroBitbrain;
  readonly empresa: string | null;

  constructor(status: number, motivo: MotivoErroBitbrain, empresa: string | null, caminho: string | null = null) {
    super(mensagem(status, motivo, empresa, caminho));
    this.name = 'ErroBitbrain';
    this.status = status;
    this.motivo = motivo;
    this.empresa = empresa;
  }
}

export type OpcoesBitbrain = { url: string; token: string; fetchFn?: typeof fetch; timeoutMs?: number };
export type OpcoesClienteBitbrain = OpcoesBitbrain & { empresa: string; esperar?: (ms: number) => Promise<void>; aleatorio?: () => number };

const semBarraFinal = (url: string) => url.replace(/\/+$/, '');
const semQuery = (caminho: string) => caminho.split('?')[0];

function cabecalhos(token: string): Record<string, string> {
  return { accept: 'application/json, application/xml', authorization: `Bearer ${token}` };
}

/** O texto de {"erro": "..."} da própria rota; null quando o corpo é do ML (que usa message/error). */
function erroDaRota(texto: string): string | null {
  try {
    const valor: unknown = JSON.parse(texto);
    if (valor && typeof valor === 'object' && !Array.isArray(valor) && typeof (valor as { erro?: unknown }).erro === 'string') {
      return (valor as { erro: string }).erro;
    }
  } catch {
    // corpo que não é JSON: é do ML (ou de um proxy) e segue como ErroML
  }
  return null;
}

/**
 * ClienteML pela rota do Bitbrain (B1): a mesma interface do cliente do ML, então o ConectorML, os esquemas e o
 * mapeamento não mudam. Os cabeçalhos extras (x-format-new, accept XML) não vão: o Bitbrain sabe o que mandar ao ML.
 */
export function criarClienteViaBitbrain(p: OpcoesClienteBitbrain): ClienteML {
  const fetchFn = p.fetchFn ?? fetch;
  const esperar = p.esperar ?? ((ms: number) => new Promise<void>((ok) => setTimeout(ok, ms)));
  const aleatorio = p.aleatorio ?? Math.random;
  const timeoutMs = p.timeoutMs ?? 20_000;
  const base = semBarraFinal(p.url);

  async function chamar(caminho: string): Promise<{ status: number; texto: string }> {
    const url = `${base}${CAMINHO_ML}?${new URLSearchParams({ empresa: p.empresa, caminho })}`;
    const paraLog = semQuery(caminho);
    for (let tentativa = 0; ; tentativa += 1) {
      const resposta = await fetchFn(url, { headers: cabecalhos(p.token), signal: AbortSignal.timeout(timeoutMs) });
      const texto = await resposta.text();
      if (resposta.status === 429 && tentativa < NOVAS_TENTATIVAS_429) {
        await esperar(esperaDo429(tentativa, resposta.headers.get('retry-after'), aleatorio));
        continue;
      }
      if (resposta.ok) return { status: resposta.status, texto };
      if (erroDaRota(texto) !== null) {
        if (resposta.status === 401) throw new ErroBitbrain(401, 'token', p.empresa);
        if (resposta.status === 403) throw new ErroBitbrain(403, 'caminho', p.empresa, paraLog);
        if (resposta.status === 404) throw new ErroBitbrain(404, 'empresa', p.empresa);
      }
      throw new ErroML(resposta.status, texto, paraLog, p.empresa);
    }
  }

  function json<T>(r: { status: number; texto: string }, caminho: string): T {
    if (!r.texto) return null as T;
    try {
      return analisarJson(r.texto) as T;
    } catch {
      throw new ErroML(r.status, r.texto, semQuery(caminho), p.empresa);
    }
  }

  return {
    async get<T = unknown>(caminho: string): Promise<T> {
      return json<T>(await chamar(caminho), caminho);
    },
    async getTexto(caminho: string): Promise<string> {
      return (await chamar(caminho)).texto;
    },
    async post<T = unknown>(): Promise<T> {
      throw new ErroRespostaManual();
    },
    async postArquivo<T = unknown>(): Promise<T> {
      throw new ErroRespostaManual();
    },
  };
}

const esquemaEmpresas = z.object({
  empresas: z.array(
    z.looseObject({
      empresa: z.string().trim().min(1).max(100),
      nome: z.string().trim().max(200).catch(''),
      seller_id: z.union([z.string().trim().min(1), z.number().int()]).transform(String),
    }),
  ),
});

export type EmpresaBitbrain = { empresa: string; nome: string; sellerId: string };

/** GET /integracao/devolucoes/empresas: as contas do ML com credencial válida no Bitbrain (§4.3). */
export async function listarEmpresasBitbrain(p: OpcoesBitbrain): Promise<EmpresaBitbrain[]> {
  const resposta = await (p.fetchFn ?? fetch)(`${semBarraFinal(p.url)}${CAMINHO_EMPRESAS}`, {
    headers: cabecalhos(p.token),
    signal: AbortSignal.timeout(p.timeoutMs ?? TIMEOUT_EMPRESAS_MS),
  });
  const texto = await resposta.text();
  if (resposta.status === 401) throw new ErroBitbrain(401, 'token', null);
  if (!resposta.ok) throw new ErroBitbrain(resposta.status, 'fora_do_ar', null);
  let corpo: unknown;
  try {
    corpo = JSON.parse(texto);
  } catch {
    throw new ErroBitbrain(resposta.status, 'formato', null);
  }
  const lido = esquemaEmpresas.safeParse(corpo);
  if (!lido.success) throw new ErroBitbrain(resposta.status, 'formato', null);
  const unicas = new Map<string, EmpresaBitbrain>();
  for (const e of lido.data.empresas) {
    if (!unicas.has(e.empresa)) unicas.set(e.empresa, { empresa: e.empresa, nome: e.nome || e.empresa, sellerId: e.seller_id });
  }
  return [...unicas.values()];
}
```

- [ ] **Passo 4:** `npm test -- src/conectores/marketplace && npm run typecheck && npm run lint` → PASS.

- [ ] **Passo 5: Commit**

```bash
git add src/conectores/marketplace/bitbrain src/conectores/marketplace/mercadolivre/cliente.ts src/conectores/marketplace/mercadolivre/erros.ts src/conectores/marketplace/mercadolivre/erros.test.ts
git commit -m "feat(bitbrain): cliente do ML pela rota do Bitbrain (429, tempo limite, ErroBitbrain, resposta manual) e lista de empresas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Tarefa 3: Os 5 extras no conector do ML (modos `api` e `bitbrain`)

**Objetivo:** o `ConectorML.obterReclamacao` faz 3 leituras opcionais novas (reputação, revisões e envio da venda), e o mapeamento devolve `DadosDevolucaoML.extras`. Os rótulos e as traduções dos valores do ML ficam em `dominio.ts`. O ML falso ganha as rotas e os cenários (D17).

**Arquivos:**
- Modificar: `src/modules/mercado-livre/dominio.ts`, `dominio.test.ts`; `src/conectores/marketplace/mercadolivre/{tipos,esquemas,mapeamento,conector,falso}.ts`, `mapeamento.test.ts`, `conector.test.ts`, `falso.test.ts`; `tests/fixtures/ml-falso/cenarios.json`; `tests/helpers/fabricas-ml.ts` (`dadosDevolucaoMLTeste`)

**Interfaces:**
- Produz (`dominio.ts`, sem imports com `@/`):
  - `AFETA_REPUTACAO = ['AFETA', 'NAO_AFETA', 'NAO_SE_APLICA'] as const`, `AfetaReputacao`, `AFETA_REPUTACAO_DO_ML` e `ROTULO_AFETA_REPUTACAO`;
  - `CONDICOES_TRIAGEM = ['VENDAVEL', 'NAO_VENDAVEL', 'DESCARTE', 'FALTANDO'] as const`, `CondicaoTriagem`, `CONDICAO_TRIAGEM_DO_ML` e `ROTULO_CONDICAO_TRIAGEM`;
  - `SITUACOES_DINHEIRO = ['RETIDO', 'DEVOLVIDO', 'LIBERADO'] as const`, `SituacaoDinheiro`, `DINHEIRO_DO_ML` e `ROTULO_DINHEIRO`;
  - `SELO_URGENTE = 'Urgente'`, `SELO_AFETA_REPUTACAO = 'Afeta reputação'` e `SELO_FULL = 'Full'`;
  - `rotuloAcaoML(acao: string | null): string` e `rotuloEtapaTriagem(etapa: string | null): string | null`;
  - `RESPOSTAS_PENDENTES = ['OK'] as const` e `RespostaPendente`.
- Produz (`mercadolivre/tipos.ts`):
  - `ExtrasML = { acaoPendente: string | null; urgente: boolean | null; afetaReputacao: AfetaReputacao | null; ehFull: boolean | null; triagemCondicao: CondicaoTriagem | null; triagemEtapa: string | null; dinheiro: SituacaoDinheiro | null }`;
  - `DadosDevolucaoML.extras: ExtrasML`.
- Produz (`mapeamento.ts`):
  - `EXTRAS_VAZIOS: ExtrasML`;
  - `extrasDaReclamacao(e: { reclamacao: ReclamacaoJson; devolucao: DevolucaoJson | null; reputacao: unknown; revisoes: unknown; envioVenda: unknown }): ExtrasML`;
  - `idEnvioDaVenda(pedidos: unknown[]): string | null`;
  - `EntradaMapeamento` ganha `reputacao?`, `revisoes?` e `envioVenda?: unknown` (ausente = null).
- Produz (`esquemas.ts`):
  - `esquemaReputacao`, `esquemaRevisoes` (devolve sempre a lista de revisões) e `esquemaEnvioVenda`;
  - `mandatory` nas ações, `status_money` e `related_entities` na devolução, `shipping.id` no pedido.
- Produz (ML falso):
  - `IdsFalsos.enviosVenda: string[]` (`7<i><c><seq>`);
  - `CenarioFalso` ganha `urgente?`, `afetaReputacao?`, `full?` e `triagem?: { condicao: string; etapa: string }`.

- [ ] **Passo 1: Testes que falham**

`src/modules/mercado-livre/dominio.test.ts`:

```ts
describe('extras do ML (integração Bitbrain §4.5)', () => {
  it('traduz os valores do ML e tem rótulo em português para cada um', () => {
    expect(AFETA_REPUTACAO_DO_ML).toEqual({ affected: 'AFETA', not_affected: 'NAO_AFETA', not_applies: 'NAO_SE_APLICA' });
    expect(CONDICAO_TRIAGEM_DO_ML).toEqual({ saleable: 'VENDAVEL', unsaleable: 'NAO_VENDAVEL', discard: 'DESCARTE', missing: 'FALTANDO' });
    expect(DINHEIRO_DO_ML).toEqual({ retained: 'RETIDO', refunded: 'DEVOLVIDO', available: 'LIBERADO' });
    expect(ROTULO_CONDICAO_TRIAGEM.NAO_VENDAVEL).toBe('Não vendável');
    expect(ROTULO_DINHEIRO.RETIDO).toBe('retido');
    expect(ROTULO_AFETA_REPUTACAO.AFETA).toBe('Afeta a reputação');
    expect([SELO_URGENTE, SELO_AFETA_REPUTACAO, SELO_FULL]).toEqual(['Urgente', 'Afeta reputação', 'Full']);
  });

  it('rótulos de ação e de etapa da triagem: conhecidos em português, desconhecidos crus, nulo → traço/nulo', () => {
    expect(rotuloAcaoML('return_review_fail')).toBe('Revisar a devolução');
    expect(rotuloAcaoML('acao_nova')).toBe('acao_nova');
    expect(rotuloAcaoML(null)).toBe('—');
    expect(rotuloEtapaTriagem('closed')).toBe('concluída');
    expect(rotuloEtapaTriagem('outra')).toBe('outra');
    expect(rotuloEtapaTriagem(null)).toBeNull();
  });
});
```

`mapeamento.test.ts`:

```ts
import { esquemaDevolucao, esquemaReclamacao } from './esquemas';
import { EXTRAS_VAZIOS, extrasDaReclamacao, idEnvioDaVenda, mapearReclamacao } from './mapeamento';

describe('extrasDaReclamacao (integração Bitbrain §4.5)', () => {
  const r = esquemaReclamacao.parse(reclamacao);
  const d = esquemaDevolucao.parse(devolucao);
  const f = (m: Partial<Parameters<typeof extrasDaReclamacao>[0]> = {}) =>
    extrasDaReclamacao({ reclamacao: r, devolucao: d, reputacao: null, revisoes: null, envioVenda: null, ...m });

  it('só a reclamação e a devolução: a revisão com prazo, não urgente, e o dinheiro do status_money', () => {
    expect(f()).toEqual({ ...EXTRAS_VAZIOS, acaoPendente: 'return_review_ok', urgente: false, dinheiro: 'RETIDO' });
  });

  it('ação obrigatória (mandatory) da loja → urgente, com a ação de prazo mais curto (A19, D7)', () => {
    const urgente = esquemaReclamacao.parse({
      ...reclamacao,
      players: [
        {
          role: 'respondent',
          type: 'seller',
          user_id: 1,
          available_actions: [
            { action: 'send_message_to_complainant', due_date: '2026-11-22T10:00:00.000-03:00', mandatory: true },
            { action: 'return_review_fail', due_date: '2026-11-19T10:00:00.000-03:00', mandatory: true },
          ],
        },
      ],
    });
    expect(f({ reclamacao: urgente })).toMatchObject({ acaoPendente: 'return_review_fail', urgente: true });
  });

  it('sem a loja entre os players: ação e urgente nulos (o ML não informou)', () => {
    const semLoja = esquemaReclamacao.parse({ ...reclamacao, players: [{ role: 'complainant', type: 'buyer', user_id: 2, available_actions: [] }] });
    expect(f({ reclamacao: semLoja })).toMatchObject({ acaoPendente: null, urgente: null });
  });

  it('reputação: affected/not_affected/not_applies; valor estranho ou resposta ruim → nulo (A17)', () => {
    expect(f({ reputacao: { affects_reputation: 'affected' } }).afetaReputacao).toBe('AFETA');
    expect(f({ reputacao: { affects_reputation: 'not_affected' } }).afetaReputacao).toBe('NAO_AFETA');
    expect(f({ reputacao: { affects_reputation: 'not_applies' } }).afetaReputacao).toBe('NAO_SE_APLICA');
    expect(f({ reputacao: { affects_reputation: 'talvez' } }).afetaReputacao).toBeNull();
    expect(f({ reputacao: 'x' }).afetaReputacao).toBeNull();
  });

  it('Full pelo logistic_type ou pelo logistic.type (A18); outro tipo → false; sem envio → nulo', () => {
    expect(f({ envioVenda: { id: 1, logistic_type: 'fulfillment' } }).ehFull).toBe(true);
    expect(f({ envioVenda: { id: 1, logistic: { mode: 'me2', type: 'fulfillment' } } }).ehFull).toBe(true);
    expect(f({ envioVenda: { id: 1, logistic_type: 'drop_off' } }).ehFull).toBe(false);
    expect(f({ envioVenda: { id: 1 } }).ehFull).toBeNull();
    expect(f({ envioVenda: null }).ehFull).toBeNull();
  });

  it('triagem: a última revisão com product_condition, em { reviews } ou em lista (A16)', () => {
    const revisoes = {
      reviews: [
        { resource_reviews: [{ product_condition: 'saleable', stage: 'pending' }] },
        { resource_reviews: [{ product_condition: null, stage: 'x' }, { product_condition: 'unsaleable', stage: 'closed' }] },
      ],
    };
    expect(f({ revisoes })).toMatchObject({ triagemCondicao: 'NAO_VENDAVEL', triagemEtapa: 'closed' });
    expect(f({ revisoes: revisoes.reviews })).toMatchObject({ triagemCondicao: 'NAO_VENDAVEL', triagemEtapa: 'closed' });
    expect(f({ revisoes: { reviews: [] } })).toMatchObject({ triagemCondicao: null, triagemEtapa: null });
  });

  it('dinheiro: retained/refunded/available; sem devolução → nulo', () => {
    expect(f({ devolucao: esquemaDevolucao.parse({ ...devolucao, status_money: 'refunded' }) }).dinheiro).toBe('DEVOLVIDO');
    expect(f({ devolucao: esquemaDevolucao.parse({ ...devolucao, status_money: 'available' }) }).dinheiro).toBe('LIBERADO');
    expect(f({ devolucao: null }).dinheiro).toBeNull();
  });

  it('idEnvioDaVenda: o shipping.id do 1º pedido que tiver; nenhum → nulo', () => {
    expect(idEnvioDaVenda([pedido])).toBe('41800000001');
    expect(idEnvioDaVenda([{ id: 1, order_items: [] }])).toBeNull();
    expect(idEnvioDaVenda([])).toBeNull();
  });

  it('mapearReclamacao devolve os extras nos dois retornos', () => {
    const semDevolucao = mapearReclamacao({ reclamacao: { ...reclamacao, related_entities: [] }, devolucao: null, pedidos: [], anuncios: [], envio: null });
    expect(semDevolucao.extras).toMatchObject({ acaoPendente: 'return_review_ok', urgente: false, dinheiro: null });
    const comTudo = mapearReclamacao({
      reclamacao,
      devolucao,
      pedidos: [pedido],
      anuncios: [],
      envio: null,
      reputacao: { affects_reputation: 'affected' },
      envioVenda: { id: 41800000001, logistic_type: 'fulfillment' },
    });
    expect(comTudo.extras).toMatchObject({ afetaReputacao: 'AFETA', ehFull: true, dinheiro: 'RETIDO' });
  });
});
```

(Os fixtures `reclamacao`, `devolucao` e `pedido` já são importados no topo do `mapeamento.test.ts`. Se algum não for, importe de `tests/fixtures/ml/doc/*.json`, como no `conector.test.ts`.)

`conector.test.ts`, no 1º teste de `ConectorML.obterReclamacao`:
- acrescente a `ROTAS_RECLAMACAO`:

```ts
  'GET /post-purchase/v1/claims/5292183123/affects-reputation': json({ affects_reputation: 'affected', has_incentive: false }),
  'GET /shipments/41800000001': json({ ...envio, id: 41800000001, logistic_type: 'fulfillment' }),
```

- a lista esperada passa a ser a de hoje mais, no fim, `'GET /post-purchase/v1/claims/5292183123/affects-reputation'` e `'GET /shipments/41800000001'`;
- acrescente `expect(dados.extras).toMatchObject({ afetaReputacao: 'AFETA', ehFull: true, dinheiro: 'RETIDO', urgente: false })` e `expect(fetchFn.mock.calls[6][1]?.headers).toMatchObject({ 'x-format-new': 'true' })`.

Testes novos no mesmo `describe`:

```ts
  it('revisões (triagem) só quando a devolução tem "reviews" em related_entities', async () => {
    const { conector, chamadas } = montar({
      ...ROTAS_RECLAMACAO,
      'GET /post-purchase/v2/claims/5292183123/returns': json({ ...devolucao, related_entities: ['reviews'] }),
      'GET /post-purchase/v1/returns/14958493/reviews': json({ reviews: [{ resource_reviews: [{ product_condition: 'discard', stage: 'closed' }] }] }),
    });
    const dados = await conector.obterReclamacao('5292183123');
    expect(dados.extras).toMatchObject({ triagemCondicao: 'DESCARTE', triagemEtapa: 'closed' });
    expect(chamadas()).toContain('GET /post-purchase/v1/returns/14958493/reviews');
  });

  it('leituras dos extras recusadas (403/404) não impedem: extras nulos', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { conector } = montar({
      ...ROTAS_RECLAMACAO,
      'GET /post-purchase/v1/claims/5292183123/affects-reputation': json({ message: 'forbidden' }, 403),
      'GET /shipments/41800000001': json({ message: 'not_found' }, 404),
    });
    const dados = await conector.obterReclamacao('5292183123');
    expect(dados.devolucao).not.toBeNull();
    expect(dados.extras).toMatchObject({ afetaReputacao: null, ehFull: null });
  });
```

`falso.test.ts` (ML), no `describe` do ML falso:

```ts
  it('cenário 2: urgente, afeta a reputação e Full (extras, D17)', async () => {
    const dados = await conector().obterReclamacao(novo(2).id);
    expect(dados.extras).toMatchObject({ urgente: true, acaoPendente: 'return_review_ok', afetaReputacao: 'AFETA', ehFull: true, dinheiro: 'RETIDO' });
  });

  it('cenário 5: triagem do ML; cenário 1: não urgente, não afeta a reputação, não é Full', async () => {
    expect((await conector().obterReclamacao(novo(5).id)).extras).toMatchObject({ triagemCondicao: 'NAO_VENDAVEL', triagemEtapa: 'closed' });
    expect((await conector().obterReclamacao(novo(1).id)).extras).toMatchObject({ urgente: false, afetaReputacao: 'NAO_AFETA', ehFull: false, triagemCondicao: null });
  });
```

- [ ] **Passo 2:** `npm test -- src/modules/mercado-livre/dominio.test.ts src/conectores/marketplace/mercadolivre` → FAIL.

- [ ] **Passo 3: Implementação**

`dominio.ts` (no fim; sem imports novos):

```ts
/** Extras do ML (integração Bitbrain §4.5), nos modos api e bitbrain. Nulo = o ML não informou. */
export const AFETA_REPUTACAO = ['AFETA', 'NAO_AFETA', 'NAO_SE_APLICA'] as const;
export type AfetaReputacao = (typeof AFETA_REPUTACAO)[number];
export const AFETA_REPUTACAO_DO_ML: Record<string, AfetaReputacao> = { affected: 'AFETA', not_affected: 'NAO_AFETA', not_applies: 'NAO_SE_APLICA' };
export const ROTULO_AFETA_REPUTACAO: Record<AfetaReputacao, string> = {
  AFETA: 'Afeta a reputação',
  NAO_AFETA: 'Não afeta a reputação',
  NAO_SE_APLICA: 'Não se aplica',
};

export const CONDICOES_TRIAGEM = ['VENDAVEL', 'NAO_VENDAVEL', 'DESCARTE', 'FALTANDO'] as const;
export type CondicaoTriagem = (typeof CONDICOES_TRIAGEM)[number];
export const CONDICAO_TRIAGEM_DO_ML: Record<string, CondicaoTriagem> = {
  saleable: 'VENDAVEL',
  unsaleable: 'NAO_VENDAVEL',
  discard: 'DESCARTE',
  missing: 'FALTANDO',
};
export const ROTULO_CONDICAO_TRIAGEM: Record<CondicaoTriagem, string> = {
  VENDAVEL: 'Vendável',
  NAO_VENDAVEL: 'Não vendável',
  DESCARTE: 'Descarte',
  FALTANDO: 'Faltando',
};

export const SITUACOES_DINHEIRO = ['RETIDO', 'DEVOLVIDO', 'LIBERADO'] as const;
export type SituacaoDinheiro = (typeof SITUACOES_DINHEIRO)[number];
export const DINHEIRO_DO_ML: Record<string, SituacaoDinheiro> = { retained: 'RETIDO', refunded: 'DEVOLVIDO', available: 'LIBERADO' };
export const ROTULO_DINHEIRO: Record<SituacaoDinheiro, string> = { RETIDO: 'retido', DEVOLVIDO: 'devolvido ao comprador', LIBERADO: 'liberado' };

/** Selos do cartão, das listas e da Busca: só os extras que importam (§4.5). */
export const SELO_URGENTE = 'Urgente';
export const SELO_AFETA_REPUTACAO = 'Afeta reputação';
export const SELO_FULL = 'Full';

const ROTULO_ACAO_ML: Record<string, string> = {
  return_review: 'Revisar a devolução',
  return_review_ok: 'Revisar a devolução',
  return_review_fail: 'Revisar a devolução',
  send_message_to_complainant: 'Responder ao comprador',
  send_message_to_mediator: 'Responder à mediação',
  refund: 'Devolver o dinheiro',
  allow_return: 'Aceitar a devolução',
  open_dispute: 'Abrir disputa',
};
/** Ação pendente da loja no ML, em português; ação desconhecida aparece crua. */
export function rotuloAcaoML(acao: string | null): string {
  if (!acao) return '—';
  return ROTULO_ACAO_ML[acao] ?? acao;
}

/** Suposição A17: a etapa da triagem do ML. */
const ROTULO_ETAPA_TRIAGEM: Record<string, string> = { pending: 'em andamento', closed: 'concluída' };
export function rotuloEtapaTriagem(etapa: string | null): string | null {
  if (!etapa) return null;
  return ROTULO_ETAPA_TRIAGEM[etapa] ?? etapa;
}

/** Modo bitbrain (§4.6): o "OK" que falta responder no ML à mão. A contestação tem a tabela dela. */
export const RESPOSTAS_PENDENTES = ['OK'] as const;
export type RespostaPendente = (typeof RESPOSTAS_PENDENTES)[number];
```

`esquemas.ts`:
- Nas ações da reclamação, troque o item de `available_actions` por `z.looseObject({ action: z.string(), due_date: dataOuNula, mandatory: z.boolean().nullish().catch(null) })`.
- Em `esquemaDevolucao`, acrescente `status_money: textoOuNulo.catch(null)` e `related_entities: lista(z.string()).catch([])`.
- Em `esquemaPedido`, acrescente `shipping: z.looseObject({ id: idOuNulo }).nullish().catch(null)`.
- No fim do arquivo:

```ts
/** Suposição A17: GET /post-purchase/v1/claims/{id}/affects-reputation. */
export const esquemaReputacao = z.looseObject({ affects_reputation: textoOuNulo });

const esquemaRevisao = z.looseObject({
  resource_reviews: lista(z.looseObject({ product_condition: textoOuNulo, stage: textoOuNulo })),
});
/** Suposição A16: GET /post-purchase/v1/returns/{id}/reviews traz { reviews: [...] } ou a lista direto. Sai sempre a lista. */
export const esquemaRevisoes = z.union([z.array(esquemaRevisao), z.looseObject({ reviews: lista(esquemaRevisao) }).transform((v) => v.reviews)]);

/** Suposição A18: envio da venda; logistic_type no formato antigo, logistic.type no novo (x-format-new). */
export const esquemaEnvioVenda = z.looseObject({
  logistic_type: textoOuNulo,
  logistic: z.looseObject({ type: textoOuNulo }).nullish().catch(null),
});
```

`mercadolivre/tipos.ts`:

```ts
import type { AfetaReputacao, CondicaoTriagem, SituacaoDinheiro } from '@/modules/mercado-livre/dominio';

/** Os 5 extras (integração Bitbrain §4.5). Nulo = o ML não informou. */
export type ExtrasML = {
  acaoPendente: string | null;
  urgente: boolean | null;
  afetaReputacao: AfetaReputacao | null;
  ehFull: boolean | null;
  triagemCondicao: CondicaoTriagem | null;
  triagemEtapa: string | null;
  dinheiro: SituacaoDinheiro | null;
};
```

e `extras: ExtrasML;` em `DadosDevolucaoML` (depois de `atualizadaEm`).

`mapeamento.ts`:
- Importe `esquemaEnvioVenda`, `esquemaReputacao` e `esquemaRevisoes`; `AFETA_REPUTACAO_DO_ML`, `CONDICAO_TRIAGEM_DO_ML` e `DINHEIRO_DO_ML` de `@/modules/mercado-livre/dominio`; e o tipo `ExtrasML`.
- Acrescente:

```ts
export const EXTRAS_VAZIOS: ExtrasML = {
  acaoPendente: null,
  urgente: null,
  afetaReputacao: null,
  ehFull: null,
  triagemCondicao: null,
  triagemEtapa: null,
  dinheiro: null,
};

function porPrazo(a: { due_date: Date | null }, b: { due_date: Date | null }): number {
  return (a.due_date?.getTime() ?? Number.POSITIVE_INFINITY) - (b.due_date?.getTime() ?? Number.POSITIVE_INFINITY);
}

/** D7/A19: a ação obrigatória da loja (urgente) ou, sem ela, a revisão com prazo (não urgente). Sem a loja: nulos. */
function acaoDaLoja(r: ReclamacaoJson): Pick<ExtrasML, 'acaoPendente' | 'urgente'> {
  const loja = r.players.filter((p) => p.role === 'respondent' || p.type === 'seller');
  if (loja.length === 0) return { acaoPendente: null, urgente: null };
  const acoes = loja.flatMap((p) => p.available_actions);
  const obrigatoria = acoes.filter((a) => a.mandatory === true).sort(porPrazo)[0];
  if (obrigatoria) return { acaoPendente: obrigatoria.action, urgente: true };
  const revisao = acoes.filter((a) => ACOES_REVISAO.has(a.action) && a.due_date !== null).sort(porPrazo)[0];
  return { acaoPendente: revisao?.action ?? null, urgente: false };
}

function traduzir<T extends string>(mapa: Record<string, T>, valor: string | null | undefined): T | null {
  return valor && Object.hasOwn(mapa, valor) ? mapa[valor] : null;
}

/** Função pura (§4.5): os 5 extras a partir do que o ML devolveu. Leitura ausente ou fora do formato → nulo. */
export function extrasDaReclamacao(e: {
  reclamacao: ReclamacaoJson;
  devolucao: DevolucaoJson | null;
  reputacao: unknown;
  revisoes: unknown;
  envioVenda: unknown;
}): ExtrasML {
  const reputacao = esquemaReputacao.safeParse(e.reputacao);
  const envio = esquemaEnvioVenda.safeParse(e.envioVenda);
  const tipoLogistico = envio.success ? (envio.data.logistic_type ?? envio.data.logistic?.type ?? null) : null;
  const revisoes = esquemaRevisoes.safeParse(e.revisoes);
  const triagem = (revisoes.success ? revisoes.data.flatMap((r) => r.resource_reviews) : []).filter((x) => x.product_condition !== null).at(-1) ?? null;
  return {
    ...acaoDaLoja(e.reclamacao),
    afetaReputacao: reputacao.success ? traduzir(AFETA_REPUTACAO_DO_ML, reputacao.data.affects_reputation) : null,
    ehFull: tipoLogistico === null ? null : tipoLogistico === 'fulfillment',
    triagemCondicao: traduzir(CONDICAO_TRIAGEM_DO_ML, triagem?.product_condition),
    triagemEtapa: triagem?.stage ?? null,
    dinheiro: e.devolucao ? traduzir(DINHEIRO_DO_ML, e.devolucao.status_money) : null,
  };
}

/** O envio da venda (pedido.shipping.id) do 1º pedido que tiver: é nele que o ML diz se a venda foi Full. */
export function idEnvioDaVenda(pedidos: unknown[]): string | null {
  for (const p of pedidos) {
    const lido = esquemaPedido.safeParse(p);
    const id = lido.success ? (lido.data.shipping?.id ?? null) : null;
    if (id) return id;
  }
  return null;
}
```

- Em `EntradaMapeamento`, acrescente `reputacao?: unknown; revisoes?: unknown; envioVenda?: unknown;`.
- No retorno "sem devolução" de `mapearReclamacao`: `extras: extrasDaReclamacao({ reclamacao: r, devolucao: null, reputacao: e.reputacao ?? null, revisoes: null, envioVenda: null })`.
- No retorno com devolução: `extras: extrasDaReclamacao({ reclamacao: r, devolucao: d, reputacao: e.reputacao ?? null, revisoes: e.revisoes ?? null, envioVenda: e.envioVenda ?? null })`.

`conector.ts`, em `obterReclamacao`, troque a última linha (`const envio = …; return mapearReclamacao(...)`) por:

```ts
    const envio = envioDevolucao ? await this.opcional(`/shipments/${encodeURIComponent(envioDevolucao.shipment_id)}`, NOVO_FORMATO) : null;
    // Extras (integração Bitbrain §4.5): leituras opcionais, depois das que já existiam; recusa → null.
    const reputacao = await this.opcional(`/post-purchase/v1/claims/${id}/affects-reputation`);
    const revisoes = d.related_entities.includes('reviews') ? await this.opcional(`/post-purchase/v1/returns/${encodeURIComponent(d.id)}/reviews`) : null;
    const envioVendaId = idEnvioDaVenda(pedidos);
    const envioVenda = envioVendaId ? await this.opcional(`/shipments/${encodeURIComponent(envioVendaId)}`, NOVO_FORMATO) : null;
    return mapearReclamacao({ reclamacao, devolucao, pedidos, anuncios, envio, reputacao, revisoes, envioVenda });
```

(Importe `idEnvioDaVenda` de `./mapeamento`.)

`tests/fixtures/ml-falso/cenarios.json`:
- no cenário `"2"`, acrescente `"urgente": true, "afetaReputacao": "affected", "full": true`;
- no cenário `"5"`, acrescente `"triagem": { "condicao": "unsaleable", "etapa": "closed" }`.

`mercadolivre/falso.ts`:
- `CenarioFalso` ganha `urgente?: boolean; afetaReputacao?: string; full?: boolean; triagem?: { condicao: string; etapa: string };`.
- `IdsFalsos` ganha `enviosVenda: string[]`, e `idsFalsos` devolve `enviosVenda: posicoes.map((i) => \`7${i}${numero}${seq}\`)`. Atualize o comentário do topo com "envio da venda 7<i><c><seq>".
- Em `reclamacaoFalsa`: `mandatory: c.urgente === true` nas duas ações `return_review_ok`/`return_review_fail`.
- Em `devolucaoFalsa`: `related_entities: c.triagem ? ['reviews'] : []`.
- Em `pedidoFalso`: `shipping: { id: Number(ids.enviosVenda[i]) }`.
- Funções novas:

```ts
function envioVendaFalso(ids: IdsFalsos, i: number, c: CenarioFalso, agora: Date) {
  const tipo = c.full ? 'fulfillment' : 'drop_off';
  return {
    ...doc('envio.json'),
    id: Number(ids.enviosVenda[i]),
    status: 'delivered',
    tracking_number: `MLV${ids.cenario}${ids.seq}`,
    logistic_type: tipo,
    logistic: { mode: 'me2', type: tipo, direction: 'forward' },
    status_history: { date_shipped: new Date(agora.getTime() - 10 * DIA).toISOString(), date_delivered: new Date(agora.getTime() - 9 * DIA).toISOString() },
  };
}
```

- Em `ROTAS`, troque o `responder` de `/^\/shipments\/(\d+)$/` por:

```ts
    responder: (m, _url, agora) => {
      const venda = /^7(\d)([1-9])(\d{8})$/.exec(m[1]);
      if (venda) {
        const ids = idsFalsos(Number(venda[2]), venda[3]);
        const c = cenario(ids.cenario);
        const i = Number(venda[1]);
        return c && i < ids.enviosVenda.length ? respostaJson(envioVendaFalso(ids, i, c, agora)) : naoEncontrado();
      }
      const ids = idsPor(m[1], /^4([1-9])(\d{8})$/);
      const c = ids && cenario(ids.cenario);
      const envio = ids && c && envioFalso(ids, c, agora);
      return envio ? respostaJson(envio) : naoEncontrado();
    },
```

- Rotas novas (antes da rota `claims/reasons`):

```ts
  {
    metodo: 'GET',
    padrao: /^\/post-purchase\/v1\/claims\/(\d+)\/affects-reputation$/,
    responder: (m) => {
      const ids = idsDaReclamacaoFalsa(m[1]);
      const c = ids && cenario(ids.cenario);
      return c ? respostaJson({ affects_reputation: c.afetaReputacao ?? 'not_affected', has_incentive: false }) : naoEncontrado();
    },
  },
  {
    metodo: 'GET',
    padrao: /^\/post-purchase\/v1\/returns\/(\d+)\/reviews$/,
    responder: (m) => {
      const ids = idsPor(m[1], /^6([1-9])(\d{8})$/);
      const c = ids && cenario(ids.cenario);
      if (!ids || !c?.triagem) return naoEncontrado();
      return respostaJson({
        reviews: [
          {
            resource: 'order',
            resource_id: Number(ids.pedidos[0]),
            method: 'triage',
            resource_reviews: [{ stage: c.triagem.etapa, status: 'failed', product_condition: c.triagem.condicao, product_destination: 'seller' }],
          },
        ],
      });
    },
  },
```

`tests/helpers/fabricas-ml.ts`: em `dadosDevolucaoMLTeste`, acrescente `extras: EXTRAS_VAZIOS,` antes de `...extra` (importe de `@/conectores/marketplace/mercadolivre/mapeamento`).

- [ ] **Passo 4:** `npm test && npm run typecheck && npm run lint` → PASS. Rode também `npm run test:int -- src/modules/mercado-livre src/modules/fiscal`: o falso agora faz 2 a 3 chamadas a mais por reclamação, e nada pode quebrar.

- [ ] **Passo 5: Commit**

```bash
git add src/modules/mercado-livre/dominio.ts src/modules/mercado-livre/dominio.test.ts src/conectores/marketplace/mercadolivre tests/fixtures/ml-falso/cenarios.json tests/helpers/fabricas-ml.ts
git commit -m "feat(ml): cinco extras do ML no conector (urgente, reputacao, Full, triagem, dinheiro) nos dois modos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Tarefa 4: Bitbrain falso (lista fechada, dados pessoais e busca por empresa)

**Objetivo:** um `fetch` que imita a rota do Bitbrain para os testes e o e2e. Ele confere o Bearer, responde `/empresas`, aplica a lista fechada dos 12 caminhos (`{seller}` da empresa e só os parâmetros permitidos na busca) e repassa ao ML falso. Também tira os dados pessoais como o contrato manda e devolve, na busca, reclamações fixas por empresa.

**Arquivos:**
- Criar: `src/conectores/marketplace/bitbrain/falso.ts`, `src/conectores/marketplace/bitbrain/falso.test.ts`

**Interfaces:**
- Consome:
  - `URL_BITBRAIN_FALSO` e `TOKEN_BITBRAIN_FALSO` (Tarefa 1);
  - `criarClienteViaBitbrain`, `listarEmpresasBitbrain` e `ErroBitbrain` (Tarefa 2);
  - `fetchFalsoML`, `PREFIXO_TOKEN_FALSO`, `idsFalsos` e `vendedorFalso` (ML falso, Tarefa 3);
  - `API_ML`.
- Produz:
  - `EMPRESAS_FALSAS: readonly { empresa: string; nome: string; seller_id: string }[]`: `loja-falsa-1` (seller `123456789` = `vendedorFalso()`) e `loja-falsa-2` (seller `223456789`);
  - `EMPRESA_FALSA_FORA_DO_AR = 'loja-falsa-fora'`: fica fora do `/empresas` e responde 500 a todo `/ml`;
  - `RECLAMACOES_FALSAS_POR_EMPRESA: Record<string, string[]>`: `loja-falsa-1` tem `['5200000001']` (cenário 2: urgente, reputação, Full) e `loja-falsa-2` tem `['5500000002']` (cenário 5: triagem). Ids fixos, porque os bancos de teste começam vazios;
  - `caminhoPermitido(alvo: URL, sellerId: string): boolean`;
  - `semDadosPessoais(caminho: string, corpo: unknown): unknown`;
  - `fetchBitbrainFalso: typeof fetch`.

- [ ] **Passo 1: Testes que falham** (`bitbrain/falso.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { TOKEN_BITBRAIN_FALSO, URL_BITBRAIN_FALSO } from '@/lib/env';
import { API_ML, ErroML } from '../mercadolivre/cliente';
import { ConectorML } from '../mercadolivre/conector';
import { idsFalsos, vendedorFalso } from '../mercadolivre/falso';
import { criarClienteViaBitbrain, ErroBitbrain, listarEmpresasBitbrain } from './cliente';
import { caminhoPermitido, EMPRESA_FALSA_FORA_DO_AR, EMPRESAS_FALSAS, fetchBitbrainFalso, RECLAMACOES_FALSAS_POR_EMPRESA } from './falso';

const [loja1, loja2] = EMPRESAS_FALSAS;
const cliente = (empresa: string, token = TOKEN_BITBRAIN_FALSO) =>
  criarClienteViaBitbrain({ url: URL_BITBRAIN_FALSO, token, empresa, fetchFn: fetchBitbrainFalso });
const conector = (e: { empresa: string; seller_id: string }) => new ConectorML({ sellerId: e.seller_id, cliente: cliente(e.empresa) });

describe('Bitbrain falso (D3)', () => {
  it('/empresas lista as duas lojas falsas; a 1ª é o vendedor do ML falso', async () => {
    expect(await listarEmpresasBitbrain({ url: URL_BITBRAIN_FALSO, token: TOKEN_BITBRAIN_FALSO, fetchFn: fetchBitbrainFalso })).toEqual([
      { empresa: 'loja-falsa-1', nome: 'Loja Falsa 1', sellerId: '123456789' },
      { empresa: 'loja-falsa-2', nome: 'Loja Falsa 2', sellerId: '223456789' },
    ]);
    expect(loja1.seller_id).toBe(vendedorFalso());
  });

  it('token errado: 401 vira ErroBitbrain token', async () => {
    await expect(cliente(loja1.empresa, 'errado').get('/orders/1')).rejects.toMatchObject({ motivo: 'token', status: 401 });
  });

  it('a busca de cada empresa acha as reclamações fixas dela', async () => {
    for (const e of [loja1, loja2]) {
      const vistas: string[] = [];
      for await (const r of conector(e).reclamacoesAtualizadasDesde(new Date())) vistas.push(r.reclamacaoId);
      expect(vistas).toEqual(RECLAMACOES_FALSAS_POR_EMPRESA[e.empresa]);
    }
  });

  it('o ConectorML real sobre o Bitbrain falso: cenário 2 com os extras', async () => {
    const dados = await conector(loja1).obterReclamacao('5200000001');
    expect(dados.devolucao).toMatchObject({ reclamacaoId: '5200000001', statusCanal: 'delivered/delivered', itens: [{ sku: 'MLF-FONE-01', quantidade: 1 }] });
    expect(dados.extras).toMatchObject({ urgente: true, afetaReputacao: 'AFETA', ehFull: true, dinheiro: 'RETIDO' });
  });

  it('cenário 5 pela loja 2: triagem do ML', async () => {
    expect((await conector(loja2).obterReclamacao('5500000002')).extras).toMatchObject({ triagemCondicao: 'NAO_VENDAVEL' });
  });

  it('LGPD: o pedido sai sem buyer e payments, com shipping.id; o envio sai sem endereço; a devolução, sem shipping_address', async () => {
    const ids = idsFalsos(2, '00000001');
    const pedido = await cliente(loja1.empresa).get<Record<string, unknown>>(`/orders/${ids.pedidos[0]}`);
    expect(pedido).not.toHaveProperty('buyer');
    expect(pedido).not.toHaveProperty('payments');
    expect(pedido).toHaveProperty('shipping.id');
    const envio = await cliente(loja1.empresa).get<Record<string, unknown>>(`/shipments/${ids.enviosVenda[0]}`);
    expect(Object.keys(envio).sort()).toEqual(expect.arrayContaining(['id', 'logistic_type', 'status']));
    expect(envio).not.toHaveProperty('receiver_address');
    const devolucao = await cliente(loja1.empresa).get<{ shipments: { destination: Record<string, unknown> }[] }>(`/post-purchase/v2/claims/${ids.reclamacaoId}/returns`);
    expect(devolucao.shipments[0].destination).toEqual({ name: 'seller_address' });
  });

  it('NF de venda: o XML inteiro pela empresa', async () => {
    const xml = await conector(loja1).obterXmlNotaVenda(idsFalsos(2, '00000001').pedidos[0]);
    expect(xml).toContain('<nfeProc');
  });

  it('lista fechada: fora da lista, seller de outra empresa e parâmetro a mais dão 403 (ErroBitbrain caminho)', async () => {
    const c = cliente(loja1.empresa);
    await expect(c.get('/post-purchase/v1/returns/reasons?flow=seller_return_failed&claim_id=1')).rejects.toMatchObject({ motivo: 'caminho' });
    await expect(c.get(`/users/${loja2.seller_id}/invoices/orders/1`)).rejects.toMatchObject({ motivo: 'caminho' });
    const busca = `/post-purchase/v1/claims/search?players.user_id=${loja1.seller_id}&players.role=respondent&range=last_updated:after:x&limit=100&offset=0`;
    await expect(c.get(`${busca}&status=opened`)).rejects.toBeInstanceOf(ErroBitbrain);
  });

  it('empresa desconhecida: 404 ErroBitbrain empresa; empresa fora do ar: ErroML 500', async () => {
    await expect(cliente('nao-existe').get('/orders/1')).rejects.toMatchObject({ motivo: 'empresa' });
    const erro = await cliente(EMPRESA_FALSA_FORA_DO_AR).get('/orders/1').catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroML);
    expect(erro).toMatchObject({ status: 500 });
  });
});

describe('caminhoPermitido (os 12 da lista fechada)', () => {
  const ok = (c: string, s = '123') => caminhoPermitido(new URL(c, API_ML), s);
  it('aceita os 12 formatos', () => {
    for (const c of [
      '/post-purchase/v1/claims/search?players.user_id=123&players.role=respondent&range=last_updated:after:2026-11-01T00:00:00.000-0300&limit=100&offset=9900',
      '/post-purchase/v1/claims/5',
      '/post-purchase/v2/claims/5/returns',
      '/post-purchase/v1/claims/5/affects-reputation',
      '/post-purchase/v1/returns/6/reviews',
      '/post-purchase/v1/claims/reasons/PDD9949',
      '/orders/2000000200000001',
      '/items/MLB123',
      '/shipments/4',
      '/users/123/invoices/orders/9',
      '/invoices/orders/9',
      '/users/123/invoices/documents/xml/ABC_1-2/authorized',
    ]) {
      expect(ok(c), c).toBe(true);
    }
  });

  it('recusa o resto', () => {
    for (const c of [
      '/post-purchase/v1/claims/search?players.user_id=999&players.role=respondent&range=last_updated:after:x&limit=100&offset=0',
      '/post-purchase/v1/claims/search?players.user_id=123&players.role=respondent&range=last_updated:after:x&limit=101&offset=0',
      '/post-purchase/v1/claims/search?players.user_id=123&players.role=respondent&range=last_updated:after:x&limit=100&offset=9901',
      '/post-purchase/v1/returns/reasons',
      '/post-purchase/v1/claims/5?x=1',
      '/items/ABC123',
      '/users/999/invoices/orders/9',
      '/users/me',
    ]) {
      expect(ok(c), c).toBe(false);
    }
  });
});
```

- [ ] **Passo 2:** `npm test -- src/conectores/marketplace/bitbrain` → FAIL (o módulo não existe).

- [ ] **Passo 3: Implementação** (`src/conectores/marketplace/bitbrain/falso.ts`)

```ts
import { TOKEN_BITBRAIN_FALSO, URL_BITBRAIN_FALSO } from '@/lib/env';
import { API_ML } from '../mercadolivre/cliente';
import { fetchFalsoML, PREFIXO_TOKEN_FALSO } from '../mercadolivre/falso';
import { CAMINHO_EMPRESAS, CAMINHO_ML } from './cliente';

/**
 * Bitbrain falso (D3): só para testes e e2e, e só vale com PERMITIR_FALSOS=1 (lerEnv e fetchDoBitbrain conferem).
 * Imita o contrato docs/integracao/bitbrain-rota-devolucoes.md por cima do ML falso: Bearer, /empresas, lista fechada,
 * dados pessoais tirados e o mesmo código HTTP. Sem estado, como o ML falso (o servidor e o worker respondem igual).
 */
export const EMPRESAS_FALSAS = [
  { empresa: 'loja-falsa-1', nome: 'Loja Falsa 1', seller_id: '123456789' },
  { empresa: 'loja-falsa-2', nome: 'Loja Falsa 2', seller_id: '223456789' },
] as const;
/** Fica fora do /empresas; todo /ml dela dá 500 ("uma conta que falha não para as outras", D6). */
export const EMPRESA_FALSA_FORA_DO_AR = 'loja-falsa-fora';
/** O que a busca de cada empresa acha: ids fixos dos cenários do ML falso (5<c><seq>). Os bancos de teste começam vazios. */
export const RECLAMACOES_FALSAS_POR_EMPRESA: Record<string, string[]> = {
  'loja-falsa-1': ['5200000001'],
  'loja-falsa-2': ['5500000002'],
};

function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });
}

const SIMPLES: RegExp[] = [
  /^\/post-purchase\/v1\/claims\/\d+$/,
  /^\/post-purchase\/v2\/claims\/\d+\/returns$/,
  /^\/post-purchase\/v1\/claims\/\d+\/affects-reputation$/,
  /^\/post-purchase\/v1\/returns\/\d+\/reviews$/,
  /^\/post-purchase\/v1\/claims\/reasons\/[A-Z0-9]+$/,
  /^\/orders\/\d+$/,
  /^\/items\/MLB\d+$/,
  /^\/shipments\/\d+$/,
  /^\/invoices\/orders\/\d+$/,
];
const DO_VENDEDOR: RegExp[] = [/^\/users\/(\d+)\/invoices\/orders\/\d+$/, /^\/users\/(\d+)\/invoices\/documents\/xml\/[A-Za-z0-9_-]+\/authorized$/];
const PARAMETROS_BUSCA = new Set(['players.user_id', 'players.role', 'range', 'limit', 'offset']);

/** A lista fechada do contrato: 12 formatos, só GET, {seller} igual ao da empresa e só os parâmetros da busca. */
export function caminhoPermitido(alvo: URL, sellerId: string): boolean {
  const caminho = alvo.pathname;
  if (caminho === '/post-purchase/v1/claims/search') {
    const q = alvo.searchParams;
    if ([...q.keys()].some((k) => !PARAMETROS_BUSCA.has(k))) return false;
    const limite = Number(q.get('limit') ?? '');
    const offset = Number(q.get('offset') ?? '0');
    return (
      q.get('players.user_id') === sellerId &&
      q.get('players.role') === 'respondent' &&
      /^last_updated:after:.+$/.test(q.get('range') ?? '') &&
      Number.isInteger(limite) &&
      limite >= 1 &&
      limite <= 100 &&
      Number.isInteger(offset) &&
      offset >= 0 &&
      offset <= 9900
    );
  }
  if (alvo.search) return false;
  if (SIMPLES.some((r) => r.test(caminho))) return true;
  return DO_VENDEDOR.some((r) => r.exec(caminho)?.[1] === sellerId);
}

type Objeto = Record<string, unknown>;
const ehObjeto = (v: unknown): v is Objeto => typeof v === 'object' && v !== null && !Array.isArray(v);
function apenas(valor: unknown, chaves: readonly string[]): Objeto {
  if (!ehObjeto(valor)) return {};
  return Object.fromEntries(chaves.filter((c) => c in valor).map((c) => [c, valor[c]]));
}
const CAMPOS_PEDIDO = ['id', 'status', 'date_created', 'pack_id', 'tags'] as const;
const CAMPOS_ITEM = ['id', 'title', 'seller_sku', 'seller_custom_field', 'variation_id'] as const;
const CAMPOS_ENVIO = ['id', 'status', 'substatus', 'tracking_number', 'tracking_method', 'logistic_type', 'status_history', 'date_created', 'last_updated'] as const;

function devolucaoSemEndereco(d: unknown): unknown {
  if (!ehObjeto(d) || !Array.isArray(d.shipments)) return d;
  return {
    ...d,
    shipments: d.shipments.map((s) => {
      if (!ehObjeto(s) || !ehObjeto(s.destination)) return s;
      return { ...s, destination: { name: s.destination.name ?? null } };
    }),
  };
}

/** Seção "Dados pessoais" do contrato: o que sai em /orders, /shipments e /returns. O resto vai como veio. */
export function semDadosPessoais(caminho: string, corpo: unknown): unknown {
  if (/^\/orders\/\d+$/.test(caminho) && ehObjeto(corpo)) {
    const itens = Array.isArray(corpo.order_items) ? corpo.order_items : [];
    return {
      ...apenas(corpo, CAMPOS_PEDIDO),
      ...(ehObjeto(corpo.shipping) ? { shipping: { id: corpo.shipping.id ?? null } } : {}),
      order_items: itens.map((l) => (ehObjeto(l) ? { item: apenas(l.item, CAMPOS_ITEM), quantity: l.quantity, unit_price: l.unit_price } : l)),
    };
  }
  if (/^\/shipments\/\d+$/.test(caminho)) return apenas(corpo, CAMPOS_ENVIO);
  if (/^\/post-purchase\/v2\/claims\/\d+\/returns$/.test(caminho)) return Array.isArray(corpo) ? corpo.map(devolucaoSemEndereco) : devolucaoSemEndereco(corpo);
  return corpo;
}

function buscaFalsa(empresa: string, alvo: URL): Response {
  const ids = RECLAMACOES_FALSAS_POR_EMPRESA[empresa] ?? [];
  const offset = Number(alvo.searchParams.get('offset') ?? 0);
  const agora = new Date().toISOString();
  return respostaJson({
    paging: { total: ids.length, offset, limit: 100 },
    data: offset > 0 ? [] : ids.map((id) => ({ id: Number(id), last_updated: agora, related_entities: ['return'] })),
  });
}

export const fetchBitbrainFalso: typeof fetch = async (entrada, init) => {
  const url = new URL(entrada instanceof Request ? entrada.url : String(entrada));
  if (url.origin !== new URL(URL_BITBRAIN_FALSO).origin) return respostaJson({ detail: 'Not Found' }, 404);
  if (new Headers(init?.headers).get('authorization') !== `Bearer ${TOKEN_BITBRAIN_FALSO}`) return respostaJson({ erro: 'token inválido' }, 401);
  if (url.pathname === CAMINHO_EMPRESAS) return respostaJson({ empresas: EMPRESAS_FALSAS });
  if (url.pathname !== CAMINHO_ML) return respostaJson({ detail: 'Not Found' }, 404);
  const empresa = url.searchParams.get('empresa') ?? '';
  const caminho = url.searchParams.get('caminho') ?? '';
  if (empresa === EMPRESA_FALSA_FORA_DO_AR) return respostaJson({ message: 'internal error', error: 'internal_error', status: 500 }, 500);
  const dados = EMPRESAS_FALSAS.find((e) => e.empresa === empresa);
  if (!dados || !caminho.startsWith('/')) return respostaJson({ erro: 'empresa sem conta do ML' }, 404);
  const alvo = new URL(caminho, API_ML);
  if (!caminhoPermitido(alvo, dados.seller_id)) return respostaJson({ erro: 'caminho não permitido' }, 403);
  if (alvo.pathname === '/post-purchase/v1/claims/search') return buscaFalsa(empresa, alvo);
  const resposta = await fetchFalsoML(`${API_ML}${alvo.pathname}${alvo.search}`, {
    headers: { authorization: `Bearer ${PREFIXO_TOKEN_FALSO}BITBRAIN`, ...(alvo.pathname.startsWith('/shipments/') ? { 'x-format-new': 'true' } : {}) },
  });
  const tipo = resposta.headers.get('content-type') ?? 'application/json';
  const texto = await resposta.text();
  if (!resposta.ok || !tipo.includes('json')) return new Response(texto, { status: resposta.status, headers: { 'content-type': tipo } });
  return respostaJson(semDadosPessoais(alvo.pathname, JSON.parse(texto)), resposta.status);
};
```

Se o `/shipments/{venda}` do teste de LGPD não passar porque o fixture `envio.json` tem campos de endereço com outros nomes, o filtro já os tira. Confira só que `logistic_type` sobra: o envio da venda do ML falso precisa trazer `logistic_type` no topo (Tarefa 3, D9).

- [ ] **Passo 4:** `npm test -- src/conectores/marketplace && npm run typecheck && npm run lint` → PASS.

- [ ] **Passo 5: Commit**

```bash
git add src/conectores/marketplace/bitbrain/falso.ts src/conectores/marketplace/bitbrain/falso.test.ts
git commit -m "test(bitbrain): Bitbrain falso com lista fechada, filtro de dados pessoais e busca por empresa

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Tarefa 5: Banco: `contas_bitbrain`, colunas novas em `reclamacoes_ml` e gravação dos extras e da conta

**Objetivo:** a tabela das contas e as colunas da conta, dos extras e da resposta pendente, com a migração gerada. O `aplicarReclamacao` passa a gravar os extras e a conta (D8).

**Arquivos:**
- Modificar: `src/db/schema/mercado-livre.ts`, `src/modules/mercado-livre/sincronizar.ts`, `src/modules/mercado-livre/tabelas.int.test.ts`, `src/modules/mercado-livre/sincronizar.int.test.ts`
- Criar (gerado): `drizzle/0014_bitbrain_contas_extras.sql`, `drizzle/meta/0014_snapshot.json`, `drizzle/meta/_journal.json` (atualizado)

**Interfaces:**
- Consome: `ExtrasML`, `DadosDevolucaoML.extras` e os tipos de `dominio.ts` (Tarefa 3).
- Produz (schema):
  - `contasBitbrain` com `empresa` (PK), `nome`, `sellerId`, `recebeDevolucoes` (padrão `false`), `disponivel` (padrão `true`, D2), `ultimaSincronizacaoEm`, `atualizadaEm` e `atualizadaPor`;
  - `reclamacoesMl` ganha `conta`, `acaoPendente`, `urgente`, `afetaReputacao`, `ehFull`, `triagemCondicao`, `triagemEtapa`, `dinheiro` e `respostaPendente`, todas anuláveis.
- Produz (`sincronizar.ts`): `aplicarReclamacao(db, dados, agora, fila?: Fila, conta: string | null = null)`. A lógica não muda; só a gravação em `reclamacoes_ml` muda.

- [ ] **Passo 1: Testes que falham**

`tabelas.int.test.ts` (importe `contasBitbrain` de `@/db/schema`):

```ts
  it('conta do Bitbrain: nasce sem receber devoluções e disponível', async () => {
    const [conta] = await db.insert(contasBitbrain).values({ empresa: 'megadino', nome: 'IDM Shop', sellerId: '25255785' }).returning();
    expect(conta).toMatchObject({ recebeDevolucoes: false, disponivel: true, ultimaSincronizacaoEm: null, atualizadaPor: null });
  });

  it('reclamacoes_ml: extras anuláveis; valores fora da lista são recusados pelo banco', async () => {
    await db.insert(reclamacoesMl).values({ claimId: '5000000101', sincronizadaEm: new Date() });
    const [r] = await db.select().from(reclamacoesMl).where(eq(reclamacoesMl.claimId, '5000000101'));
    expect(r).toMatchObject({ conta: null, urgente: null, afetaReputacao: null, ehFull: null, dinheiro: null, respostaPendente: null });
    const casos = [
      ['5000000102', { afetaReputacao: 'X' }, 'reclamacoes_ml_afeta_reputacao'],
      ['5000000103', { triagemCondicao: 'X' }, 'reclamacoes_ml_triagem_condicao'],
      ['5000000104', { dinheiro: 'X' }, 'reclamacoes_ml_dinheiro'],
      ['5000000105', { respostaPendente: 'X' }, 'reclamacoes_ml_resposta_pendente'],
    ] as const;
    for (const [claimId, valores, nome] of casos) {
      const erro = await db
        .insert(reclamacoesMl)
        .values({ claimId, sincronizadaEm: new Date(), ...(valores as Record<string, never>) })
        .catch((e: unknown) => e);
      expect(restricao(erro)).toBe(nome);
    }
  });
```

`sincronizar.int.test.ts` (importe `EXTRAS_VAZIOS` de `@/conectores/marketplace/mercadolivre/mapeamento` e `reclamacoesMl` de `@/db/schema`, se ainda não estiverem importados):

```ts
describe('extras e conta em reclamacoes_ml (integração Bitbrain, D8)', () => {
  const EXTRAS = {
    acaoPendente: 'return_review_ok',
    urgente: true,
    afetaReputacao: 'AFETA',
    ehFull: true,
    triagemCondicao: 'NAO_VENDAVEL',
    triagemEtapa: 'closed',
    dinheiro: 'RETIDO',
  } as const;
  const linha = async (claimId: string) => (await db.select().from(reclamacoesMl).where(eq(reclamacoesMl.claimId, claimId)))[0];

  it('grava os extras e a conta', async () => {
    const dados = dadosDevolucaoMLTeste(devolucaoExternaTeste(), { extras: EXTRAS });
    await aplicarReclamacao(db, dados, AGORA, undefined, 'loja-falsa-1');
    expect(await linha(dados.reclamacaoId)).toMatchObject({ ...EXTRAS, conta: 'loja-falsa-1', respostaPendente: null });
  });

  it('de novo: urgente e ação acompanham o ML; os outros extras nulos não apagam o que já se sabia; sem conta, a conta fica', async () => {
    const externa = devolucaoExternaTeste();
    await aplicarReclamacao(db, dadosDevolucaoMLTeste(externa, { extras: EXTRAS }), AGORA, undefined, 'loja-falsa-1');
    const depois = dadosDevolucaoMLTeste(externa, { extras: { ...EXTRAS_VAZIOS, urgente: false } });
    await aplicarReclamacao(db, depois, AGORA, undefined, null);
    expect(await linha(depois.reclamacaoId)).toMatchObject({
      urgente: false,
      acaoPendente: null,
      afetaReputacao: 'AFETA',
      ehFull: true,
      triagemCondicao: 'NAO_VENDAVEL',
      triagemEtapa: 'closed',
      dinheiro: 'RETIDO',
      conta: 'loja-falsa-1',
    });
  });

  it('modo api (sem conta): a conta fica nula; reclamação sem devolução também guarda os extras', async () => {
    const dados = dadosDevolucaoMLTeste(null, { extras: { ...EXTRAS_VAZIOS, urgente: true, acaoPendente: 'return_review_ok' } });
    await aplicarReclamacao(db, dados, AGORA);
    expect(await linha(dados.reclamacaoId)).toMatchObject({ conta: null, urgente: true, acaoPendente: 'return_review_ok' });
  });
});
```

- [ ] **Passo 2:** `npm run test:int -- src/modules/mercado-livre/tabelas.int.test.ts src/modules/mercado-livre/sincronizar.int.test.ts` → FAIL (a tabela e as colunas não existem).

- [ ] **Passo 3: Schema** (`src/db/schema/mercado-livre.ts`)
- Imports: acrescente `boolean` ao import de `drizzle-orm/pg-core`, e `import type { AfetaReputacao, CondicaoTriagem, RespostaPendente, SituacaoDinheiro } from '../../modules/mercado-livre/dominio';`.
- Nas colunas de `reclamacoesMl`, depois de `sincronizadaEm`:

```ts
    /** Empresa do Bitbrain (contas_bitbrain.empresa); nula no modo api e nas antigas (§4.3). */
    conta: text('conta'),
    /** Extras (§4.5): nulo = o ML não informou. */
    acaoPendente: text('acao_pendente'),
    urgente: boolean('urgente'),
    afetaReputacao: text('afeta_reputacao').$type<AfetaReputacao>(),
    ehFull: boolean('eh_full'),
    triagemCondicao: text('triagem_condicao').$type<CondicaoTriagem>(),
    triagemEtapa: text('triagem_etapa'),
    dinheiro: text('dinheiro').$type<SituacaoDinheiro>(),
    /** Modo bitbrain (§4.6): 'OK' = falta responder "OK" no ML, à mão. */
    respostaPendente: text('resposta_pendente').$type<RespostaPendente>(),
```

- No `(t) => [...]` de `reclamacoesMl`:

```ts
    index('reclamacoes_ml_resposta_pendente_idx').on(t.respostaPendente),
    check('reclamacoes_ml_afeta_reputacao', sql`"afeta_reputacao" in ('AFETA', 'NAO_AFETA', 'NAO_SE_APLICA')`),
    check('reclamacoes_ml_triagem_condicao', sql`"triagem_condicao" in ('VENDAVEL', 'NAO_VENDAVEL', 'DESCARTE', 'FALTANDO')`),
    check('reclamacoes_ml_dinheiro', sql`"dinheiro" in ('RETIDO', 'DEVOLVIDO', 'LIBERADO')`),
    check('reclamacoes_ml_resposta_pendente', sql`"resposta_pendente" in ('OK')`),
```

- Tabela nova (no fim do arquivo):

```ts
/** Contas do ML que o Bitbrain tem (integração de 18/11, §4.3). O Gestor marca as que mandam devoluções para a bancada. */
export const contasBitbrain = pgTable('contas_bitbrain', {
  /** O account_key do Bitbrain (ex.: "megadino"). */
  empresa: text('empresa').primaryKey(),
  nome: text('nome').notNull(),
  sellerId: text('seller_id').notNull(),
  /** Nenhuma vem marcada (B3). */
  recebeDevolucoes: boolean('recebe_devolucoes').notNull().default(false),
  /** D2: false = sumiu da lista do Bitbrain (ou ele disse "empresa sem conta do ML"). Nunca é apagada. */
  disponivel: boolean('disponivel').notNull().default(true),
  /** Última varredura bem-sucedida desta conta: alerta "sincronização parada" por conta (spec §11). */
  ultimaSincronizacaoEm: timestamp('ultima_sincronizacao_em', { withTimezone: true }),
  /** Quando e por quem a marcação mudou. */
  atualizadaEm: timestamp('atualizada_em', { withTimezone: true }).notNull().defaultNow(),
  atualizadaPor: uuid('atualizada_por').references(() => usuarios.id, { onDelete: 'set null' }),
});
```

- [ ] **Passo 4: Migração.** Rode `npm run db:gerar -- --name bitbrain_contas_extras`. Confira que `drizzle/0014_bitbrain_contas_extras.sql` só tem:
  - `CREATE TABLE "contas_bitbrain"`, com a FK de `atualizada_por`;
  - 9 `ALTER TABLE "reclamacoes_ml" ADD COLUMN`;
  - 4 `ADD CONSTRAINT ... CHECK`;
  - 1 `CREATE INDEX`.

  Nada pode ser apagado nem renomeado. Depois rode `npm run db:migrar`, no banco de dev `devolucoes_f7`. O banco de testes é migrado sozinho pelo `test:int`.

- [ ] **Passo 5: Gravação** (`sincronizar.ts`). Troque o `gravarReclamacao` por:

```ts
async function gravarReclamacao(tx: DbOuTx, dados: DadosDevolucaoML, devolucaoId: string | null, agora: Date, conta: string | null): Promise<void> {
  const x = dados.extras;
  const valores = {
    returnId: dados.devolucao?.devolucaoExternaId ?? null,
    motivoId: dados.motivoId,
    subtipo: dados.subtipo,
    statusReclamacao: dados.statusReclamacao,
    statusDevolucao: dados.statusDevolucao,
    devolucaoId,
    atualizadaNoMlEm: dados.atualizadaEm,
    sincronizadaEm: agora,
    acaoPendente: x.acaoPendente,
    urgente: x.urgente,
    afetaReputacao: x.afetaReputacao,
    ehFull: x.ehFull,
    triagemCondicao: x.triagemCondicao,
    triagemEtapa: x.triagemEtapa,
    dinheiro: x.dinheiro,
    ...(conta ? { conta } : {}),
  };
  await tx
    .insert(reclamacoesMl)
    .values({ claimId: dados.reclamacaoId, ...valores })
    .onConflictDoUpdate({
      target: reclamacoesMl.claimId,
      set: {
        ...valores,
        // D8: uma leitura opcional recusada (nulo) não apaga o que o ML já tinha dito. Urgente e ação seguem o ML.
        afetaReputacao: sql`coalesce(excluded."afeta_reputacao", ${reclamacoesMl.afetaReputacao})`,
        ehFull: sql`coalesce(excluded."eh_full", ${reclamacoesMl.ehFull})`,
        triagemCondicao: sql`coalesce(excluded."triagem_condicao", ${reclamacoesMl.triagemCondicao})`,
        triagemEtapa: sql`coalesce(excluded."triagem_etapa", ${reclamacoesMl.triagemEtapa})`,
        dinheiro: sql`coalesce(excluded."dinheiro", ${reclamacoesMl.dinheiro})`,
      },
    });
}
```

Mude `aplicarReclamacao` para `(db: DbOuTx, dados: DadosDevolucaoML, agora: Date, fila?: Fila, conta: string | null = null)` e passe `conta` às 3 chamadas de `gravarReclamacao`. O resto da função fica igual. A `resposta_pendente` nunca é tocada aqui.

- [ ] **Passo 6:** `npm run test:int -- src/modules/mercado-livre && npm run typecheck` → PASS.

- [ ] **Passo 7: Commit**

```bash
git add src/db/schema/mercado-livre.ts drizzle/0014_bitbrain_contas_extras.sql drizzle/meta src/modules/mercado-livre/sincronizar.ts src/modules/mercado-livre/tabelas.int.test.ts src/modules/mercado-livre/sincronizar.int.test.ts
git commit -m "feat(ml): tabela contas_bitbrain e conta, extras e resposta pendente em reclamacoes_ml (migracao 0014)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Tarefa 6: Contas do Bitbrain (atualizar pela lista, marcar e indisponível)

**Objetivo:** o módulo das contas. Ele atualiza a lista pelo `/empresas`: conta nova entra desmarcada, e a que sumiu fica indisponível. O Gestor marca e desmarca, e cada mudança gera evento com o usuário. O módulo também diz quais contas a varredura usa e quais estão atrasadas.

**Arquivos:**
- Criar: `src/modules/mercado-livre/contas-bitbrain.ts`, `src/modules/mercado-livre/contas-bitbrain.int.test.ts`, `tests/helpers/fabricas-bitbrain.ts`, `tests/helpers/modo-bitbrain.ts`
- Modificar: `src/modules/mercado-livre/fabrica-conector.ts` (só `fetchDoBitbrain`), `src/modules/historico/eventos.ts` (`EntidadeHistorico`), `src/modules/historico/rotulos/mercado-livre.ts`, `src/modules/historico/eventos.test.ts`

**Interfaces:**
- Consome: `listarEmpresasBitbrain`, `TIMEOUT_EMPRESAS_MS`, `ErroBitbrain` e `EmpresaBitbrain` (Tarefa 2); `fetchBitbrainFalso` e `EMPRESAS_FALSAS` (Tarefa 4); `contasBitbrain` (Tarefa 5); `ConfigML` (Tarefa 1); `sincronizacaoAtrasada` (`dominio.ts`).
- Produz (`fabrica-conector.ts`): `fetchDoBitbrain(config: ConfigML): typeof fetch`, que devolve o `fetchBitbrainFalso` só quando `config.bitbrainUrl === URL_BITBRAIN_FALSO && config.permitirFalsos` (D3); senão, o `fetch`.
- Produz (`contas-bitbrain.ts`):
  - `class ErroContaBitbrain extends Error`;
  - `type ContaBitbrain = { empresa: string; nome: string; sellerId: string; recebeDevolucoes: boolean; disponivel: boolean; ultimaSincronizacaoEm: Date | null; atualizadaEm: Date; atualizadaPorNome: string | null }`;
  - `listarContasBitbrain(db: DbOuTx): Promise<ContaBitbrain[]>` (por nome);
  - `atualizarContasBitbrain(db: DbOuTx, empresas: EmpresaBitbrain[], agora: Date): Promise<{ total: number; novas: number; indisponiveis: number }>`;
  - `buscarEAtualizarContas(db: DbOuTx, config: ConfigML, agora: Date, timeoutMs?: number)`, que devolve o mesmo do `atualizarContasBitbrain`;
  - `marcarContaBitbrain(db: DbOuTx, p: { empresa: string; recebe: boolean }, usuario: UsuarioSessao, agora: Date): Promise<void>`;
  - `contasParaVarrer(db: DbOuTx): Promise<{ empresa: string; ultimaSincronizacaoEm: Date | null }[]>` (marcadas e disponíveis);
  - `marcarSincronizacaoBitbrain(db: DbOuTx, empresa: string, agora: Date): Promise<void>`;
  - `marcarContaIndisponivel(db: DbOuTx, empresa: string): Promise<void>`;
  - `contaAtrasada(c: Pick<ContaBitbrain, 'recebeDevolucoes' | 'disponivel' | 'ultimaSincronizacaoEm' | 'atualizadaEm'>, agora: Date): boolean`;
  - `contarContasIndisponiveis(db: DbOuTx): Promise<number>` (marcadas e indisponíveis);
  - `mensagemFalhaBitbrain(erro: unknown): string`.
- Produz (histórico): `EntidadeHistorico` ganha `'conta_bitbrain'`. Os rótulos novos (D11) entram todos aqui, para o arquivo ser editado uma vez só:

| Chave | Rótulo |
|---|---|
| `ml_conta_bitbrain_marcada` | Conta do Bitbrain passou a mandar devoluções |
| `ml_conta_bitbrain_desmarcada` | Conta do Bitbrain deixou de mandar devoluções |
| `ml_resposta_manual_pendente` | Falta responder "OK" no Mercado Livre (à mão) |
| `ml_ok_respondido_a_mao` | "OK" respondido à mão no Mercado Livre |
| `ml_contestacao_respondida_a_mao` | Contestação respondida à mão no Mercado Livre |

- Produz (testes):
  - `tests/helpers/fabricas-bitbrain.ts` (sem `vitest`: o e2e também importa):
    - `configBitbrainTeste(mudancas?: Partial<ConfigML>): ConfigML`, com `modo: 'bitbrain'`, a URL e o token falsos e `permitirFalsos: true`;
    - `contasFalsasTeste(db, p?: { recebe?: string[] }): Promise<void>`, que grava as `EMPRESAS_FALSAS` e marca as de `recebe`.
  - `tests/helpers/modo-bitbrain.ts`: `usarModoBitbrain(): void`, que faz `vi.stubEnv` de `ML_CONECTOR`, `BITBRAIN_URL`, `BITBRAIN_TOKEN` e `PERMITIR_FALSOS`. Quem usa chama `vi.unstubAllEnvs()` no `afterEach`.

- [ ] **Passo 1: Ajudantes de teste**

`tests/helpers/fabricas-bitbrain.ts`:

```ts
import { EMPRESAS_FALSAS } from '@/conectores/marketplace/bitbrain/falso';
import type { DbOuTx } from '@/db/client';
import { contasBitbrain } from '@/db/schema';
import { TOKEN_BITBRAIN_FALSO, URL_BITBRAIN_FALSO } from '@/lib/env';
import type { ConfigML } from '@/modules/mercado-livre/config';
import { configMLTeste } from './fabricas-ml';

/** Config do modo bitbrain com o Bitbrain falso (D3). Sem vitest: o e2e também importa este arquivo. */
export function configBitbrainTeste(mudancas: Partial<ConfigML> = {}): ConfigML {
  return configMLTeste({ modo: 'bitbrain', bitbrainUrl: URL_BITBRAIN_FALSO, bitbrainToken: TOKEN_BITBRAIN_FALSO, permitirFalsos: true, ...mudancas });
}

/** As contas do Bitbrain falso no banco; as de `recebe` já marcadas. */
export async function contasFalsasTeste(db: DbOuTx, p: { recebe?: string[] } = {}): Promise<void> {
  for (const e of EMPRESAS_FALSAS) {
    const recebeDevolucoes = (p.recebe ?? []).includes(e.empresa);
    await db
      .insert(contasBitbrain)
      .values({ empresa: e.empresa, nome: e.nome, sellerId: e.seller_id, recebeDevolucoes })
      .onConflictDoUpdate({ target: contasBitbrain.empresa, set: { recebeDevolucoes, disponivel: true } });
  }
}
```

Os testes de integração importam esses ajudantes por caminho relativo (`../../../tests/helpers/...`), como os atuais. O `fabricas-ml.ts` já usa imports com `@/` e é importado pelo e2e (`apoio-ml.ts`), então o alias funciona nos dois lados.

`tests/helpers/modo-bitbrain.ts`:

```ts
import { vi } from 'vitest';
import { TOKEN_BITBRAIN_FALSO, URL_BITBRAIN_FALSO } from '@/lib/env';

/** Liga o modo bitbrain com o Bitbrain falso no process.env (o configML() lê a cada chamada). Use vi.unstubAllEnvs() no afterEach. */
export function usarModoBitbrain(): void {
  vi.stubEnv('ML_CONECTOR', 'bitbrain');
  vi.stubEnv('BITBRAIN_URL', URL_BITBRAIN_FALSO);
  vi.stubEnv('BITBRAIN_TOKEN', TOKEN_BITBRAIN_FALSO);
  vi.stubEnv('PERMITIR_FALSOS', '1');
}
```

- [ ] **Passo 2: Testes que falham** (`contas-bitbrain.int.test.ts`)

```ts
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ErroBitbrain } from '@/conectores/marketplace/bitbrain/cliente';
import { contasBitbrain } from '@/db/schema';
import { listarEventos } from '@/modules/historico/eventos';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { configBitbrainTeste, contasFalsasTeste } from '../../../tests/helpers/fabricas-bitbrain';
import {
  atualizarContasBitbrain,
  buscarEAtualizarContas,
  contaAtrasada,
  contarContasIndisponiveis,
  contasParaVarrer,
  ErroContaBitbrain,
  listarContasBitbrain,
  marcarContaBitbrain,
  mensagemFalhaBitbrain,
} from './contas-bitbrain';

const { db, sql } = criarDbTeste();
const AGORA = new Date('2026-11-18T15:00:00Z');
beforeEach(() => limparTabelas(sql));
afterAll(() => sql.end());

describe('lista de contas pelo Bitbrain (§4.3)', () => {
  it('conta nova entra desmarcada e disponível; a que sumiu fica indisponível; a que volta fica disponível e mantém a marcação', async () => {
    await db.insert(contasBitbrain).values({ empresa: 'antiga', nome: 'Antiga', sellerId: '9', recebeDevolucoes: true });
    const r = await atualizarContasBitbrain(db, [{ empresa: 'megadino', nome: 'IDM Shop', sellerId: '25255785' }], AGORA);
    expect(r).toEqual({ total: 1, novas: 1, indisponiveis: 1 });
    expect((await listarContasBitbrain(db)).map((c) => [c.empresa, c.recebeDevolucoes, c.disponivel])).toEqual([
      ['antiga', true, false],
      ['megadino', false, true],
    ]);
    await atualizarContasBitbrain(
      db,
      [
        { empresa: 'antiga', nome: 'Antiga Nova', sellerId: '9' },
        { empresa: 'megadino', nome: 'IDM Shop', sellerId: '25255785' },
      ],
      AGORA,
    );
    const [antiga] = await db.select().from(contasBitbrain).where(eq(contasBitbrain.empresa, 'antiga'));
    expect(antiga).toMatchObject({ nome: 'Antiga Nova', recebeDevolucoes: true, disponivel: true });
  });

  it('buscarEAtualizarContas lê o /empresas do Bitbrain falso', async () => {
    expect(await buscarEAtualizarContas(db, configBitbrainTeste(), AGORA)).toMatchObject({ total: 2, novas: 2 });
    expect((await listarContasBitbrain(db)).map((c) => c.nome)).toEqual(['Loja Falsa 1', 'Loja Falsa 2']);
  });

  it('token errado: ErroBitbrain com a mensagem do token e sem o valor dele; erro de rede: mensagem genérica', async () => {
    const erro = await buscarEAtualizarContas(db, configBitbrainTeste({ bitbrainToken: 'token-errado-secreto' }), AGORA).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroBitbrain);
    expect(mensagemFalhaBitbrain(erro)).toContain('Bitbrain recusou: confira o BITBRAIN_TOKEN');
    expect(mensagemFalhaBitbrain(erro)).not.toContain('token-errado-secreto');
    expect(mensagemFalhaBitbrain(new TypeError('fetch failed'))).toBe('O Bitbrain não respondeu agora. Toque em "Atualizar contas" em alguns minutos.');
  });
});

describe('marcar a conta (só o Gestor, com evento)', () => {
  it('Gestor marca e desmarca; cada mudança gera um evento com o usuário; repetir não gera outro', async () => {
    await contasFalsasTeste(db);
    const gestor = await criarUsuarioTeste(db, 'GESTOR');
    await marcarContaBitbrain(db, { empresa: 'loja-falsa-1', recebe: true }, gestor, AGORA);
    await marcarContaBitbrain(db, { empresa: 'loja-falsa-1', recebe: true }, gestor, AGORA);
    await marcarContaBitbrain(db, { empresa: 'loja-falsa-1', recebe: false }, gestor, AGORA);
    const eventos = await listarEventos(db, 'conta_bitbrain', 'loja-falsa-1');
    expect(eventos.map((e) => [e.acao, e.usuarioNome])).toEqual([
      ['ml_conta_bitbrain_marcada', gestor.nome],
      ['ml_conta_bitbrain_desmarcada', gestor.nome],
    ]);
    const [conta] = await db.select().from(contasBitbrain).where(eq(contasBitbrain.empresa, 'loja-falsa-1'));
    expect(conta).toMatchObject({ recebeDevolucoes: false, atualizadaPor: gestor.id, atualizadaEm: AGORA });
  });

  it('Operador é recusado; conta que não existe é recusada', async () => {
    await contasFalsasTeste(db);
    const operador = await criarUsuarioTeste(db, 'OPERADOR');
    await expect(marcarContaBitbrain(db, { empresa: 'loja-falsa-1', recebe: true }, operador, AGORA)).rejects.toBeInstanceOf(ErroContaBitbrain);
    const gestor = await criarUsuarioTeste(db, 'GESTOR');
    await expect(marcarContaBitbrain(db, { empresa: 'nao-existe', recebe: true }, gestor, AGORA)).rejects.toThrow('Conta não encontrada');
  });
});

describe('o que a varredura e os alertas usam', () => {
  it('contasParaVarrer: só marcadas e disponíveis; contarContasIndisponiveis: marcadas e indisponíveis', async () => {
    await contasFalsasTeste(db, { recebe: ['loja-falsa-1', 'loja-falsa-2'] });
    await db.update(contasBitbrain).set({ disponivel: false }).where(eq(contasBitbrain.empresa, 'loja-falsa-2'));
    expect((await contasParaVarrer(db)).map((c) => c.empresa)).toEqual(['loja-falsa-1']);
    expect(await contarContasIndisponiveis(db)).toBe(1);
  });

  it('contaAtrasada: marcada e disponível, mais de 1 h desde a última varredura (ou desde a marcação)', () => {
    const base = { recebeDevolucoes: true, disponivel: true, atualizadaEm: new Date('2026-11-18T14:30:00Z') };
    expect(contaAtrasada({ ...base, ultimaSincronizacaoEm: null }, AGORA)).toBe(false);
    expect(contaAtrasada({ ...base, ultimaSincronizacaoEm: new Date('2026-11-18T13:00:00Z') }, AGORA)).toBe(true);
    expect(contaAtrasada({ ...base, recebeDevolucoes: false, ultimaSincronizacaoEm: null, atualizadaEm: new Date('2026-11-18T10:00:00Z') }, AGORA)).toBe(false);
  });
});
```

`eventos.test.ts`: acrescente as 5 chaves novas à lista `RESERVADAS['mercado-livre']`.

- [ ] **Passo 3:** `npm run test:int -- src/modules/mercado-livre/contas-bitbrain.int.test.ts` → FAIL.

- [ ] **Passo 4: Implementação**

`fabrica-conector.ts`: acrescente os imports de `fetchBitbrainFalso` (`@/conectores/marketplace/bitbrain/falso`) e de `URL_BITBRAIN_FALSO` (`@/lib/env`), e:

```ts
/** D3: o Bitbrain falso só com a URL de testes E PERMITIR_FALSOS=1; fora disso, o fetch de verdade (a URL .invalid não resolve). */
export function fetchDoBitbrain(config: ConfigML): typeof fetch {
  return config.bitbrainUrl === URL_BITBRAIN_FALSO && config.permitirFalsos ? fetchBitbrainFalso : fetch;
}
```

`contas-bitbrain.ts`:

```ts
import { and, asc, count, eq, notInArray } from 'drizzle-orm';
import { ErroBitbrain, listarEmpresasBitbrain, TIMEOUT_EMPRESAS_MS, type EmpresaBitbrain } from '@/conectores/marketplace/bitbrain/cliente';
import type { DbOuTx } from '@/db/client';
import { contasBitbrain, usuarios } from '@/db/schema';
import { pode } from '@/modules/auth/permissoes';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { registrarEvento } from '@/modules/historico/eventos';
import type { ConfigML } from './config';
import { sincronizacaoAtrasada } from './dominio';
import { fetchDoBitbrain } from './fabrica-conector';

export class ErroContaBitbrain extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroContaBitbrain';
  }
}

export type ContaBitbrain = {
  empresa: string;
  nome: string;
  sellerId: string;
  recebeDevolucoes: boolean;
  disponivel: boolean;
  ultimaSincronizacaoEm: Date | null;
  atualizadaEm: Date;
  atualizadaPorNome: string | null;
};

export async function listarContasBitbrain(db: DbOuTx): Promise<ContaBitbrain[]> {
  return db
    .select({
      empresa: contasBitbrain.empresa,
      nome: contasBitbrain.nome,
      sellerId: contasBitbrain.sellerId,
      recebeDevolucoes: contasBitbrain.recebeDevolucoes,
      disponivel: contasBitbrain.disponivel,
      ultimaSincronizacaoEm: contasBitbrain.ultimaSincronizacaoEm,
      atualizadaEm: contasBitbrain.atualizadaEm,
      atualizadaPorNome: usuarios.nome,
    })
    .from(contasBitbrain)
    .leftJoin(usuarios, eq(usuarios.id, contasBitbrain.atualizadaPor))
    .orderBy(asc(contasBitbrain.nome), asc(contasBitbrain.empresa));
}

/** §4.3: conta nova entra desmarcada; a que sumiu fica indisponível, nunca apagada (D2); a que voltou fica disponível. */
export async function atualizarContasBitbrain(
  db: DbOuTx,
  empresas: EmpresaBitbrain[],
  agora: Date,
): Promise<{ total: number; novas: number; indisponiveis: number }> {
  return db.transaction(async (tx) => {
    const antes = new Set((await tx.select({ empresa: contasBitbrain.empresa }).from(contasBitbrain)).map((c) => c.empresa));
    for (const e of empresas) {
      await tx
        .insert(contasBitbrain)
        .values({ empresa: e.empresa, nome: e.nome, sellerId: e.sellerId, disponivel: true, atualizadaEm: agora })
        .onConflictDoUpdate({ target: contasBitbrain.empresa, set: { nome: e.nome, sellerId: e.sellerId, disponivel: true } });
    }
    const presentes = empresas.map((e) => e.empresa);
    const sumiram = await tx
      .update(contasBitbrain)
      .set({ disponivel: false })
      .where(and(eq(contasBitbrain.disponivel, true), presentes.length > 0 ? notInArray(contasBitbrain.empresa, presentes) : undefined))
      .returning({ empresa: contasBitbrain.empresa });
    return { total: empresas.length, novas: presentes.filter((p) => !antes.has(p)).length, indisponiveis: sumiram.length };
  });
}

/** "Atualizar contas" e a abertura da tela (D13). Erro do Bitbrain ou da rede lança: quem chama mostra a mensagem. */
export async function buscarEAtualizarContas(db: DbOuTx, config: ConfigML, agora: Date, timeoutMs: number = TIMEOUT_EMPRESAS_MS) {
  const empresas = await listarEmpresasBitbrain({ url: config.bitbrainUrl, token: config.bitbrainToken, fetchFn: fetchDoBitbrain(config), timeoutMs });
  return atualizarContasBitbrain(db, empresas, agora);
}

/** Texto para a tela. Nunca traz o token (o ErroBitbrain não o conhece). */
export function mensagemFalhaBitbrain(erro: unknown): string {
  if (erro instanceof ErroBitbrain) return erro.message;
  return 'O Bitbrain não respondeu agora. Toque em "Atualizar contas" em alguns minutos.';
}

/** Só o Gestor marca; cada mudança gera evento (§4.3). Marcar o que já está marcado não muda nada. */
export async function marcarContaBitbrain(db: DbOuTx, p: { empresa: string; recebe: boolean }, usuario: UsuarioSessao, agora: Date): Promise<void> {
  if (!pode(usuario.perfil, 'administrar')) throw new ErroContaBitbrain('Só o Gestor escolhe as contas que mandam devoluções.');
  await db.transaction(async (tx) => {
    const [mudou] = await tx
      .update(contasBitbrain)
      .set({ recebeDevolucoes: p.recebe, atualizadaEm: agora, atualizadaPor: usuario.id })
      .where(and(eq(contasBitbrain.empresa, p.empresa), eq(contasBitbrain.recebeDevolucoes, !p.recebe)))
      .returning({ empresa: contasBitbrain.empresa });
    if (!mudou) {
      const [existe] = await tx.select({ empresa: contasBitbrain.empresa }).from(contasBitbrain).where(eq(contasBitbrain.empresa, p.empresa));
      if (!existe) throw new ErroContaBitbrain('Conta não encontrada. Toque em "Atualizar contas".');
      return;
    }
    await registrarEvento(tx, {
      entidade: 'conta_bitbrain',
      entidadeId: p.empresa,
      acao: p.recebe ? 'ml_conta_bitbrain_marcada' : 'ml_conta_bitbrain_desmarcada',
      usuarioId: usuario.id,
      em: agora,
    });
  });
}

export async function contasParaVarrer(db: DbOuTx): Promise<{ empresa: string; ultimaSincronizacaoEm: Date | null }[]> {
  return db
    .select({ empresa: contasBitbrain.empresa, ultimaSincronizacaoEm: contasBitbrain.ultimaSincronizacaoEm })
    .from(contasBitbrain)
    .where(and(eq(contasBitbrain.recebeDevolucoes, true), eq(contasBitbrain.disponivel, true)))
    .orderBy(asc(contasBitbrain.empresa));
}

export async function marcarSincronizacaoBitbrain(db: DbOuTx, empresa: string, agora: Date): Promise<void> {
  await db.update(contasBitbrain).set({ ultimaSincronizacaoEm: agora }).where(eq(contasBitbrain.empresa, empresa));
}

export async function marcarContaIndisponivel(db: DbOuTx, empresa: string): Promise<void> {
  await db.update(contasBitbrain).set({ disponivel: false }).where(eq(contasBitbrain.empresa, empresa));
}

/** Alerta de sincronização parada (spec §11) por conta marcada: desde a última varredura, ou desde que foi marcada. */
export function contaAtrasada(
  c: Pick<ContaBitbrain, 'recebeDevolucoes' | 'disponivel' | 'ultimaSincronizacaoEm' | 'atualizadaEm'>,
  agora: Date,
): boolean {
  return c.recebeDevolucoes && c.disponivel && sincronizacaoAtrasada(c.ultimaSincronizacaoEm ?? c.atualizadaEm, agora);
}

/** "Conta indisponível no Bitbrain: a varredura pula essa conta e avisa no Painel" (§5): só as marcadas. */
export async function contarContasIndisponiveis(db: DbOuTx): Promise<number> {
  const [linha] = await db
    .select({ total: count() })
    .from(contasBitbrain)
    .where(and(eq(contasBitbrain.recebeDevolucoes, true), eq(contasBitbrain.disponivel, false)));
  return Number(linha?.total ?? 0);
}
```

`eventos.ts`: acrescente ao tipo a linha `/** Integração Bitbrain: a conta (id = empresa do Bitbrain). */ | 'conta_bitbrain'`.

`rotulos/mercado-livre.ts`: acrescente as 5 chaves da tabela acima, com o comentário "Integração Bitbrain (emenda E21)".

- [ ] **Passo 5:** `npm test -- src/modules/historico && npm run test:int -- src/modules/mercado-livre && npm run typecheck && npm run lint` → PASS.

- [ ] **Passo 6: Commit**

```bash
git add src/modules/mercado-livre/contas-bitbrain.ts src/modules/mercado-livre/contas-bitbrain.int.test.ts src/modules/mercado-livre/fabrica-conector.ts src/modules/historico tests/helpers/fabricas-bitbrain.ts tests/helpers/modo-bitbrain.ts
git commit -m "feat(bitbrain): contas do Bitbrain (lista pelo /empresas, marcar com evento, indisponivel)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Tarefa 7: Conector por conta, sincronização com a conta e NF de venda pela devolução

**Objetivo:** no modo `bitbrain`, `obterConector` monta o `ConectorML` da conta. A tarefa `ml.sincronizar-reclamacao` usa a conta da tarefa (ou a de `reclamacoes_ml`) e a grava. A NF de venda é buscada pela conta da devolução. O modo `api` não muda.

**Arquivos:**
- Modificar: `src/modules/mercado-livre/fabrica-conector.ts`, `src/conectores/marketplace/registro.ts`, `src/modules/mercado-livre/conector.ts`, `src/modules/mercado-livre/tarefas.ts`, `src/modules/fila/tarefas.ts`, `src/worker/manipuladores/mercado-livre.ts`, `src/modules/fiscal/nota-venda.ts`
- Criar: `src/modules/mercado-livre/bitbrain.int.test.ts`

**Interfaces:**
- Consome: `criarClienteViaBitbrain` e `ErroBitbrain` (Tarefa 2); `fetchDoBitbrain` (Tarefa 6); `contasBitbrain` e `reclamacoesMl.conta` (Tarefa 5); `aplicarReclamacao(…, conta)` (Tarefa 5); `usarModoBitbrain` e `contasFalsasTeste` (Tarefa 6).
- Produz (`fabrica-conector.ts`):
  - `type ContextoConectorML = { conta?: string | null; devolucaoId?: string | null }`;
  - `obterConectorDaConta(db: DbOuTx, empresa: string, o?: { config?: ConfigML; fetchFn?: typeof fetch }): Promise<ConectorMercadoLivre | null>`, que devolve null se a conta não existe em `contas_bitbrain`;
  - `contaDaDevolucao(db: DbOuTx, devolucaoId: string): Promise<string | null>` e `contaDaReclamacao(db: DbOuTx, claimId: string): Promise<string | null>`;
  - `criarConectorML(db: DbOuTx, contexto?: ContextoConectorML, o?: { config?: ConfigML; fetchFn?: typeof fetch; agora?: () => Date }): Promise<ConectorMercadoLivre | null>`: no modo `api` ou `falso`, chama o `criarConectorMLDaConta` de hoje; no modo `bitbrain`, usa a conta do contexto (ou a da devolução).
- Produz:
  - `obterConector(db, canal, contexto: ContextoConectorML = {})` (`registro.ts`, D19);
  - `obterConectorML(db, contexto: ContextoConectorML = {})` (`modules/mercado-livre/conector.ts`).
- Produz (`tarefas.ts`): `sincronizarReclamacao(db, fila, reclamacaoId, agora, conta: string | null = null)`.
- Produz (fila): `DadosTarefa['ml.sincronizar-reclamacao'] = { claimId: string; conta?: string }` (D1).

- [ ] **Passo 1: Testes que falham** (`src/modules/mercado-livre/bitbrain.int.test.ts`)

```ts
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConectorML } from '@/conectores/marketplace/mercadolivre/conector';
import { contasBitbrain, devolucoes, reclamacoesMl } from '@/db/schema';
import { FilaMemoria } from '@/modules/fila/fila';
import { buscarNotaVendaNoCanal } from '@/modules/fiscal/nota-venda';
import { manipuladoresMercadoLivre } from '@/worker/manipuladores/mercado-livre';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { contasFalsasTeste } from '../../../tests/helpers/fabricas-bitbrain';
import { contaMLTeste } from '../../../tests/helpers/fabricas-ml';
import { usarModoBitbrain } from '../../../tests/helpers/modo-bitbrain';
import { obterConectorML } from './conector';
import { sincronizarReclamacao } from './tarefas';

const { db, sql } = criarDbTeste();
const AGORA = new Date('2026-11-18T15:00:00Z');
let fila: FilaMemoria;

beforeEach(async () => {
  await limparTabelas(sql);
  fila = new FilaMemoria();
  usarModoBitbrain();
  await contasFalsasTeste(db, { recebe: ['loja-falsa-1'] });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
afterAll(() => sql.end());

const linha = async (claimId: string) => (await db.select().from(reclamacoesMl).where(eq(reclamacoesMl.claimId, claimId)))[0];
const devolucaoDa = async (claimId: string) => (await db.select({ id: devolucoes.id }).from(devolucoes).where(eq(devolucoes.reclamacaoId, claimId)))[0];

describe('conector por conta (modo bitbrain, §4.4)', () => {
  it('com a conta: ConectorML com o vendedor da conta; sem conta ou conta desconhecida: null', async () => {
    const c = await obterConectorML(db, { conta: 'loja-falsa-2' });
    expect(c).toBeInstanceOf(ConectorML);
    expect(c?.sellerId).toBe('223456789');
    expect(await obterConectorML(db)).toBeNull();
    expect(await obterConectorML(db, { conta: 'nao-existe' })).toBeNull();
  });
});

describe('ml.sincronizar-reclamacao com a conta (D1)', () => {
  it('pela conta da tarefa: cria a devolução e grava a conta e os extras', async () => {
    await manipuladoresMercadoLivre['ml.sincronizar-reclamacao']!({ claimId: '5200000001', conta: 'loja-falsa-1' }, { db, fila, agora: AGORA, tentativa: 1 });
    const r = await linha('5200000001');
    expect(r).toMatchObject({ conta: 'loja-falsa-1', urgente: true, afetaReputacao: 'AFETA', ehFull: true, dinheiro: 'RETIDO' });
    expect(r.devolucaoId).not.toBeNull();
  });

  it('sem conta na tarefa: usa a conta gravada em reclamacoes_ml', async () => {
    await sincronizarReclamacao(db, fila, '5200000001', AGORA, 'loja-falsa-1');
    expect(await sincronizarReclamacao(db, fila, '5200000001', AGORA)).toMatchObject({ acao: 'atualizada' });
    expect((await linha('5200000001')).conta).toBe('loja-falsa-1');
  });

  it('sem conta nenhuma: não faz nada (null)', async () => {
    expect(await sincronizarReclamacao(db, fila, '5200000001', AGORA)).toBeNull();
    expect(await db.select().from(devolucoes)).toEqual([]);
  });

  it('o Bitbrain recusa o token: lança ErroBitbrain (5 tentativas e Falhas), sem vazar o token', async () => {
    vi.stubEnv('BITBRAIN_TOKEN', 'token-errado-secreto');
    const erro = await sincronizarReclamacao(db, fila, '5200000001', AGORA, 'loja-falsa-1').catch((e: unknown) => e);
    expect((erro as Error).message).toContain('Bitbrain recusou: confira o BITBRAIN_TOKEN');
    expect(JSON.stringify(erro)).not.toContain('token-errado-secreto');
    expect((erro as Error).message).not.toContain('token-errado-secreto');
  });
});

describe('NF de venda pela conta da devolução (§4.4)', () => {
  it('busca o XML pela conta gravada em reclamacoes_ml', async () => {
    await sincronizarReclamacao(db, fila, '5200000001', AGORA, 'loja-falsa-1');
    const d = await devolucaoDa('5200000001');
    expect(await buscarNotaVendaNoCanal(db, d.id, await criarUsuarioTeste(db, 'FISCAL'))).toEqual({ consultou: true, encontradas: 1 });
  });

  it('devolução do ML sem conta conhecida: não consulta', async () => {
    await sincronizarReclamacao(db, fila, '5200000001', AGORA, 'loja-falsa-1');
    await db.update(reclamacoesMl).set({ conta: null });
    const d = await devolucaoDa('5200000001');
    expect(await buscarNotaVendaNoCanal(db, d.id, await criarUsuarioTeste(db, 'FISCAL'))).toEqual({ consultou: false, encontradas: 0 });
  });
});

describe('modo api continua igual (regressão)', () => {
  it('sem o modo bitbrain: o conector da conta ATIVA do ML, como hoje; o contexto é ignorado', async () => {
    vi.unstubAllEnvs();
    await contaMLTeste(db);
    expect(await obterConectorML(db)).toBeInstanceOf(ConectorML);
    expect((await obterConectorML(db, { conta: 'loja-falsa-2' }))?.sellerId).toBe('123456789');
    expect(await db.select().from(contasBitbrain)).toHaveLength(2);
  });
});
```

Se o `registrarNotaVenda` exigir algo a mais para aceitar o XML do falso (por exemplo, a configuração fiscal), prepare como o `src/modules/fiscal/nota-venda.int.test.ts` faz, sem mudar o código fiscal.

- [ ] **Passo 2:** `npm run test:int -- src/modules/mercado-livre/bitbrain.int.test.ts` → FAIL.

- [ ] **Passo 3: Implementação**

`fabrica-conector.ts` (acrescente os imports de `criarClienteViaBitbrain`, `contasBitbrain`, `reclamacoesMl`, `ehUuid` de `@/lib/uuid`, e `desc`, `isNotNull` e `type SQL` de `drizzle-orm`):

```ts
/** D19: o contexto que escolhe a conta no modo bitbrain. No modo api ele é ignorado. */
export type ContextoConectorML = { conta?: string | null; devolucaoId?: string | null };

/** §4.4: o ConectorML da conta do Bitbrain (vendedor da conta, transporte pela rota). Null se a conta não existe. */
export async function obterConectorDaConta(
  db: DbOuTx,
  empresa: string,
  o: { config?: ConfigML; fetchFn?: typeof fetch } = {},
): Promise<ConectorMercadoLivre | null> {
  const config = o.config ?? configML();
  const [conta] = await db.select({ sellerId: contasBitbrain.sellerId }).from(contasBitbrain).where(eq(contasBitbrain.empresa, empresa));
  if (!conta) return null;
  const cliente = criarClienteViaBitbrain({ url: config.bitbrainUrl, token: config.bitbrainToken, empresa, fetchFn: o.fetchFn ?? fetchDoBitbrain(config) });
  return new ConectorML({ sellerId: conta.sellerId, cliente });
}

async function contaPor(db: DbOuTx, onde: SQL): Promise<string | null> {
  const [r] = await db
    .select({ conta: reclamacoesMl.conta })
    .from(reclamacoesMl)
    .where(and(onde, isNotNull(reclamacoesMl.conta)))
    .orderBy(desc(reclamacoesMl.sincronizadaEm))
    .limit(1);
  return r?.conta ?? null;
}

export async function contaDaDevolucao(db: DbOuTx, devolucaoId: string): Promise<string | null> {
  return ehUuid(devolucaoId) ? contaPor(db, eq(reclamacoesMl.devolucaoId, devolucaoId)) : null;
}

export async function contaDaReclamacao(db: DbOuTx, claimId: string): Promise<string | null> {
  return contaPor(db, eq(reclamacoesMl.claimId, claimId));
}

/** obterConector do canal ML: modo api (ou falso) igual a hoje; modo bitbrain pela conta do contexto ou da devolução. */
export async function criarConectorML(
  db: DbOuTx,
  contexto: ContextoConectorML = {},
  o: { config?: ConfigML; fetchFn?: typeof fetch; agora?: () => Date } = {},
): Promise<ConectorMercadoLivre | null> {
  const config = o.config ?? configML();
  if (config.modo !== 'bitbrain') return criarConectorMLDaConta(db, { ...o, config });
  const conta = contexto.conta ?? (contexto.devolucaoId ? await contaDaDevolucao(db, contexto.devolucaoId) : null);
  return conta ? obterConectorDaConta(db, conta, { config, fetchFn: o.fetchFn }) : null;
}
```

`registro.ts`:

```ts
import { criarConectorML, type ContextoConectorML } from '@/modules/mercado-livre/fabrica-conector';

/** Contrato §5.3. No modo bitbrain, o contexto diz a conta (ou a devolução de onde ela sai); no modo api ele é ignorado. */
export async function obterConector(db: DbOuTx, canal: Canal, contexto: ContextoConectorML = {}): Promise<MarketplaceConnector | null> {
  const substituto = substitutos.get(canal);
  if (substituto) return substituto;
  if (canal === 'MERCADO_LIVRE') return criarConectorML(db, contexto);
  return null;
}
```

- `modules/mercado-livre/conector.ts`: `obterConectorML(db: DbOuTx, contexto: ContextoConectorML = {})` repassa o `contexto` ao `obterConector`.
- `modules/fila/tarefas.ts`: `'ml.sincronizar-reclamacao': { claimId: string; conta?: string }; // 3 (conta: empresa do Bitbrain no modo bitbrain, D1)`.
- `worker/manipuladores/mercado-livre.ts`:

```ts
  'ml.sincronizar-reclamacao': async ({ claimId, conta }, ctx) => {
    await sincronizarReclamacao(ctx.db, ctx.fila, claimId, ctx.agora, conta ?? null);
  },
```

- `tarefas.ts`: no `sincronizarReclamacao`, só o começo e a chamada do `aplicarReclamacao` mudam:

```ts
/** Tarefa ml.sincronizar-reclamacao. No modo bitbrain, pela conta da tarefa ou da reclamação já gravada (§4.4); sem conta, nada. */
export async function sincronizarReclamacao(
  db: DbOuTx,
  fila: Fila,
  reclamacaoId: string,
  agora: Date,
  conta: string | null = null,
): Promise<ResultadoAplicacao | null> {
  const bitbrain = configML().modo === 'bitbrain';
  const contaUsada = bitbrain ? (conta ?? (await contaDaReclamacao(db, reclamacaoId))) : null;
  if (bitbrain && !contaUsada) return null;
  const conector = await obterConectorML(db, { conta: contaUsada });
  if (!conector) return null;
  // (o try/catch, o garantirTextoMotivo e o marcarNotificacoesProcessadas de hoje, sem mudança)
  const resultado = await aplicarReclamacao(db, dados, agora, fila, contaUsada);
```

- `fiscal/nota-venda.ts`, no `buscarNotaVendaNoCanal`: `const conector = await obterConector(db, 'MERCADO_LIVRE', { devolucaoId });`.

- [ ] **Passo 4:** `npm run test:int && npm test && npm run typecheck && npm run lint && npm run build:scripts` → PASS. A suíte inteira de integração prova o modo `api` (registro, tarefas, fiscal).

- [ ] **Passo 5: Commit**

```bash
git add src/modules/mercado-livre/fabrica-conector.ts src/conectores/marketplace/registro.ts src/modules/mercado-livre/conector.ts src/modules/mercado-livre/tarefas.ts src/modules/fila/tarefas.ts src/worker/manipuladores/mercado-livre.ts src/modules/fiscal/nota-venda.ts src/modules/mercado-livre/bitbrain.int.test.ts
git commit -m "feat(bitbrain): conector por conta, sincronizacao com a conta e NF de venda pela conta da devolucao

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Tarefa 8: Varredura conta por conta, "Sincronizar agora" e `ml.renovar-token` sem efeito

**Objetivo:** no modo `bitbrain`, `ml.varredura` percorre as contas marcadas e disponíveis. Cada conta enfileira `ml.sincronizar-reclamacao` com `{ claimId, conta }` e grava a sua `ultima_sincronizacao_em`. Uma conta que falha não para as outras; se todas falharem, a tarefa lança (D6). Também entram o "Sincronizar agora" (do lado do servidor) e o `ml.renovar-token` sem efeito no modo `bitbrain`.

**Arquivos:**
- Modificar: `src/modules/mercado-livre/tarefas.ts`
- Criar: `src/modules/mercado-livre/varredura-bitbrain.int.test.ts`

**Interfaces:**
- Consome: `contasParaVarrer`, `marcarSincronizacaoBitbrain` e `marcarContaIndisponivel` (Tarefa 6); `obterConectorML(db, { conta })` (Tarefa 7); `ErroBitbrain` (Tarefa 2); `chaveTarefaReclamacao`; `JANELA_INICIAL_MS` e `SOBREPOSICAO_MS`.
- Produz:
  - `type ResultadoVarreduraConta = { empresa: string; enfileiradas: number } | { empresa: string; erro: string }`;
  - `varrerContasBitbrain(db: DbOuTx, fila: Fila, agora: Date): Promise<{ enfileiradas: number; contas: ResultadoVarreduraConta[] }>`;
  - `varrerReclamacoes`, que no modo `bitbrain` delega a `varrerContasBitbrain`;
  - `pedirSincronizacaoAgora(fila: Fila): Promise<void>` (D12);
  - `renovarTokensML`, que no modo `bitbrain` devolve `{ renovadas: 0, reconectar: 0 }` sem ler nada (D15).

- [ ] **Passo 1: Testes que falham** (`varredura-bitbrain.int.test.ts`)

```ts
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPRESA_FALSA_FORA_DO_AR } from '@/conectores/marketplace/bitbrain/falso';
import { ErroML } from '@/conectores/marketplace/mercadolivre/cliente';
import { ConectorML } from '@/conectores/marketplace/mercadolivre/conector';
import { contasBitbrain, contasMarketplace } from '@/db/schema';
import { FilaMemoria } from '@/modules/fila/fila';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { contasFalsasTeste } from '../../../tests/helpers/fabricas-bitbrain';
import { contaMLTeste, tokensTeste } from '../../../tests/helpers/fabricas-ml';
import { usarModoBitbrain } from '../../../tests/helpers/modo-bitbrain';
import { JANELA_INICIAL_MS, pedirSincronizacaoAgora, renovarTokensML, SOBREPOSICAO_MS, varrerReclamacoes } from './tarefas';

const { db, sql } = criarDbTeste();
const AGORA = new Date('2026-11-18T15:00:00Z');
let fila: FilaMemoria;

beforeEach(async () => {
  await limparTabelas(sql);
  fila = new FilaMemoria();
  usarModoBitbrain();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
afterAll(() => sql.end());

const conta = async (empresa: string) => (await db.select().from(contasBitbrain).where(eq(contasBitbrain.empresa, empresa)))[0];
const contaForaDoAr = () =>
  db.insert(contasBitbrain).values({ empresa: EMPRESA_FALSA_FORA_DO_AR, nome: 'Loja Fora', sellerId: '323456789', recebeDevolucoes: true });

describe('ml.varredura no modo bitbrain (§4.4, B6)', () => {
  it('varre só as contas marcadas e disponíveis, enfileira com a conta e grava a última sincronização de cada uma', async () => {
    await contasFalsasTeste(db, { recebe: ['loja-falsa-1'] });
    expect(await varrerReclamacoes(db, fila, AGORA)).toMatchObject({ enfileiradas: 1, contas: [{ empresa: 'loja-falsa-1', enfileiradas: 1 }] });
    expect(fila.enviadas.map((e) => [e.nome, e.dados])).toEqual([['ml.sincronizar-reclamacao', { claimId: '5200000001', conta: 'loja-falsa-1' }]]);
    expect((await conta('loja-falsa-1')).ultimaSincronizacaoEm).toEqual(AGORA);
    expect((await conta('loja-falsa-2')).ultimaSincronizacaoEm).toBeNull();
  });

  it('duas contas marcadas: cada uma enfileira as suas', async () => {
    await contasFalsasTeste(db, { recebe: ['loja-falsa-1', 'loja-falsa-2'] });
    await varrerReclamacoes(db, fila, AGORA);
    expect(fila.enviadas.map((e) => e.dados)).toEqual([
      { claimId: '5200000001', conta: 'loja-falsa-1' },
      { claimId: '5500000002', conta: 'loja-falsa-2' },
    ]);
  });

  it('a conta que falha não para a outra (D6); a que falhou não anda a última sincronização', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await contasFalsasTeste(db, { recebe: ['loja-falsa-1'] });
    await contaForaDoAr();
    const r = await varrerReclamacoes(db, fila, AGORA);
    expect(r).toMatchObject({ enfileiradas: 1 });
    expect(r?.contas).toEqual(
      expect.arrayContaining([
        { empresa: 'loja-falsa-1', enfileiradas: 1 },
        expect.objectContaining({ empresa: EMPRESA_FALSA_FORA_DO_AR, erro: expect.any(String) }),
      ]),
    );
    expect((await conta(EMPRESA_FALSA_FORA_DO_AR)).ultimaSincronizacaoEm).toBeNull();
  });

  it('todas as contas falham: a tarefa lança (nova tentativa e depois Falhas)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await contaForaDoAr();
    await expect(varrerReclamacoes(db, fila, AGORA)).rejects.toBeInstanceOf(ErroML);
  });

  it('empresa que o Bitbrain não tem (404 da rota): fica indisponível e a varredura não lança', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await db.insert(contasBitbrain).values({ empresa: 'loja-sumida', nome: 'Loja Sumida', sellerId: '423456789', recebeDevolucoes: true });
    await expect(varrerReclamacoes(db, fila, AGORA)).resolves.toMatchObject({ enfileiradas: 0 });
    expect((await conta('loja-sumida')).disponivel).toBe(false);
  });

  it('primeira varredura olha 30 dias; depois, desde a última menos 10 min', async () => {
    const espiao = vi.spyOn(ConectorML.prototype, 'reclamacoesAtualizadasDesde');
    await contasFalsasTeste(db, { recebe: ['loja-falsa-1'] });
    await varrerReclamacoes(db, fila, AGORA);
    await varrerReclamacoes(db, fila, new Date(AGORA.getTime() + 15 * 60 * 1000));
    expect(espiao.mock.calls.map(([desde]) => desde)).toEqual([new Date(AGORA.getTime() - JANELA_INICIAL_MS), new Date(AGORA.getTime() - SOBREPOSICAO_MS)]);
  });

  it('sem conta marcada: nada a fazer', async () => {
    await contasFalsasTeste(db);
    expect(await varrerReclamacoes(db, fila, AGORA)).toEqual({ enfileiradas: 0, contas: [] });
  });
});

describe('"Sincronizar agora" e ml.renovar-token no modo bitbrain', () => {
  it('pedirSincronizacaoAgora enfileira ml.varredura sem chave única (D12)', async () => {
    await pedirSincronizacaoAgora(fila);
    await pedirSincronizacaoAgora(fila);
    expect(fila.enviadas).toEqual([
      { nome: 'ml.varredura', dados: {} },
      { nome: 'ml.varredura', dados: {} },
    ]);
  });

  it('renovarTokensML não faz nada (não há token do ML deste lado, §4.2)', async () => {
    await contaMLTeste(db, { tokens: tokensTeste({ expiraEm: new Date(AGORA.getTime() + 60_000).toISOString() }) });
    expect(await renovarTokensML(db, AGORA)).toEqual({ renovadas: 0, reconectar: 0 });
    expect(await db.select().from(contasMarketplace)).toHaveLength(1);
  });
});
```

- [ ] **Passo 2:** `npm run test:int -- src/modules/mercado-livre/varredura-bitbrain.int.test.ts` → FAIL.

- [ ] **Passo 3: Implementação** (`tarefas.ts`; acrescente os imports de `ErroBitbrain` e de `contasParaVarrer`, `marcarContaIndisponivel` e `marcarSincronizacaoBitbrain`, de `./contas-bitbrain`)

```ts
export type ResultadoVarreduraConta = { empresa: string; enfileiradas: number } | { empresa: string; erro: string };

/**
 * ml.varredura no modo bitbrain (§4.4, D6): conta por conta. A que falha vai para o log e não para as outras;
 * a "empresa sem conta do ML" fica indisponível; se nenhuma deu certo, lança (nova tentativa e depois Falhas).
 */
export async function varrerContasBitbrain(db: DbOuTx, fila: Fila, agora: Date): Promise<{ enfileiradas: number; contas: ResultadoVarreduraConta[] }> {
  const resultados: ResultadoVarreduraConta[] = [];
  let enfileiradas = 0;
  let falha: unknown = null;
  for (const conta of await contasParaVarrer(db)) {
    const conector = await obterConectorML(db, { conta: conta.empresa });
    if (!conector) continue;
    const desde = conta.ultimaSincronizacaoEm
      ? new Date(conta.ultimaSincronizacaoEm.getTime() - SOBREPOSICAO_MS)
      : new Date(agora.getTime() - JANELA_INICIAL_MS);
    try {
      let n = 0;
      for await (const r of conector.reclamacoesAtualizadasDesde(desde)) {
        await fila.enviar(
          'ml.sincronizar-reclamacao',
          { claimId: r.reclamacaoId, conta: conta.empresa },
          { chaveUnica: chaveTarefaReclamacao(r.reclamacaoId, agora) },
        );
        n += 1;
      }
      await marcarSincronizacaoBitbrain(db, conta.empresa, agora);
      enfileiradas += n;
      resultados.push({ empresa: conta.empresa, enfileiradas: n });
    } catch (erro) {
      logErroML('varredura da conta', erro, { empresa: conta.empresa });
      resultados.push({ empresa: conta.empresa, erro: erro instanceof Error ? erro.message : String(erro) });
      if (erro instanceof ErroBitbrain && erro.motivo === 'empresa') await marcarContaIndisponivel(db, conta.empresa);
      else falha ??= erro;
    }
  }
  if (falha && !resultados.some((r) => 'enfileiradas' in r)) throw falha;
  return { enfileiradas, contas: resultados };
}

/** "Sincronizar agora" (Configurações › Mercado Livre): a varredura entra na fila na hora (D12: sem chave única). */
export async function pedirSincronizacaoAgora(fila: Fila): Promise<void> {
  await fila.enviar('ml.varredura', {});
}
```

- Em `varrerReclamacoes`, na 1ª linha: `if (configML().modo === 'bitbrain') return varrerContasBitbrain(db, fila, agora);`. Ajuste o tipo de retorno para `Promise<{ enfileiradas: number; contas?: ResultadoVarreduraConta[] } | null>`.
- Em `renovarTokensML`, depois de `const config = configML();`: `if (config.modo === 'bitbrain') return { renovadas: 0, reconectar: 0 };`.

- [ ] **Passo 4:** `npm run test:int -- src/modules/mercado-livre && npm run typecheck && npm run lint` → PASS. O `tarefas.int.test.ts` atual (modo `api`) continua igual.

- [ ] **Passo 5: Commit**

```bash
git add src/modules/mercado-livre/tarefas.ts src/modules/mercado-livre/varredura-bitbrain.int.test.ts
git commit -m "feat(bitbrain): varredura conta por conta (a falha de uma nao para as outras), Sincronizar agora e renovar-token sem efeito

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Tarefa 9: Respostas à mão no modo `bitbrain` (servidor)

**Objetivo:** no modo `bitbrain`, `ml.enviar-resultado` não chama o ML.
- **Todos BOM:** grava `resposta_pendente = 'OK'` e o evento `ml_resposta_manual_pendente`, uma vez só.
- **Algum problema:** cria a contestação como hoje.

O Gestor marca a contestação como respondida (vai a `ENVIADA`, com evento e usuário) e marca o "OK" como respondido (limpa a pendência, com evento). O envio automático fica desligado nesse modo. No modo `api`, tudo segue igual.

**Arquivos:**
- Modificar: `src/modules/mercado-livre/resultado.ts`, `src/modules/mercado-livre/contestacoes.ts`
- Criar: `src/modules/mercado-livre/respostas-manuais.ts`, `src/modules/mercado-livre/respostas-manuais.int.test.ts`

**Interfaces:**
- Consome: `reclamacoesMl.respostaPendente` e `conta`, e `contasBitbrain` (Tarefa 5); `MENSAGEM_RESPOSTA_MANUAL` e `ErroRespostaManual` (Tarefa 2); `configBitbrainTeste`, `contasFalsasTeste` e `usarModoBitbrain` (Tarefa 6); `ConfigML` e `configML`.
- Produz (`resultado.ts`):
  - `processarResultadoConferencia(db, devolucaoId, agora, config: ConfigML = configML())`;
  - `ResultadoProcessamento` ganha `'ok_pendente_manual' | 'ok_pendente_ja_registrado'`;
  - `registrarOkPendente(db: DbOuTx, dev: { id: string; reclamacaoId: string | null }, agora: Date): Promise<'ok_pendente_manual' | 'ok_pendente_ja_registrado' | 'sem_vinculo'>`.
- Produz (`respostas-manuais.ts`):
  - `type OkPendente = { devolucaoId: string; codigo: string; pedidos: string[]; reclamacaoId: string; conta: string | null; prazo: Date | null; selo: DadosSelo | null }`;
  - `listarOkPendentes(db: DbOuTx, agora?: Date): Promise<OkPendente[]>`;
  - `marcarOkRespondido(db: DbOuTx, devolucaoId: string, usuario: UsuarioSessao, agora: Date, config?: ConfigML): Promise<void>`;
  - `marcarContestacaoRespondida(db: DbOuTx, id: string, usuario: UsuarioSessao, agora: Date, config?: ConfigML): Promise<void>`;
  - `contarRespostasParaDarNoML(db: DbOuTx): Promise<number>`.

  As duas funções de marcar lançam `ErroContestacao` (com a lista `erros`) para quem não é Gestor, fora do modo `bitbrain`, com id inválido ou quando já foi respondido.
- Produz (`contestacoes.ts`):
  - `revisarEEnviar(…, agora, config: ConfigML = configML())` recusa no modo `bitbrain`;
  - `enviarContestacao(db, id, o: { agora; ultimaTentativa; config?: ConfigML })` no modo `bitbrain` leva a contestação a `FALHOU` com `MENSAGEM_RESPOSTA_MANUAL`, sem chamar o ML;
  - `DetalheContestacao` ganha `conta: string | null` (o nome da conta do Bitbrain ou a empresa).

- [ ] **Passo 1: Testes que falham** (`respostas-manuais.int.test.ts`)

```ts
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { definirConectorParaTestes } from '@/conectores/marketplace/registro';
import { contestacoesCanal, reclamacoesMl } from '@/db/schema';
import { FilaMemoria } from '@/modules/fila/fila';
import { listarEventos } from '@/modules/historico/eventos';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { configBitbrainTeste, contasFalsasTeste } from '../../../tests/helpers/fabricas-bitbrain';
import { ConectorMLMemoria, configMLTeste, devolucaoMLConferidaTeste } from '../../../tests/helpers/fabricas-ml';
import { usarModoBitbrain } from '../../../tests/helpers/modo-bitbrain';
import { enviarContestacao, ErroContestacao, obterContestacao, revisarEEnviar } from './contestacoes';
import { contarRespostasParaDarNoML, listarOkPendentes, marcarContestacaoRespondida, marcarOkRespondido } from './respostas-manuais';
import { processarResultadoConferencia } from './resultado';

const { db, sql } = criarDbTeste();
const AGORA = new Date('2026-11-18T15:00:00Z');
const BB = configBitbrainTeste();
let conector: ConectorMLMemoria;

beforeEach(async () => {
  await limparTabelas(sql);
  conector = new ConectorMLMemoria();
  definirConectorParaTestes('MERCADO_LIVRE', conector);
});
afterEach(() => {
  definirConectorParaTestes('MERCADO_LIVRE', null);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
afterAll(() => sql.end());

const pendente = async (devolucaoId: string) =>
  (await db.select({ r: reclamacoesMl.respostaPendente }).from(reclamacoesMl).where(eq(reclamacoesMl.devolucaoId, devolucaoId)))[0]?.r ?? null;
const acoes = async (id: string) => (await listarEventos(db, 'devolucao', id)).map((e) => e.acao);
const conferidaBom = () => devolucaoMLConferidaTeste(db, { itens: [{ destino: 'BOM' }] });
const conferidaProblema = () => devolucaoMLConferidaTeste(db, { itens: [{ destino: 'PROBLEMA', motivo: 'AVARIADO' }] });
async function contestacaoDe(devolucaoId: string) {
  const [c] = await db.select().from(contestacoesCanal).where(eq(contestacoesCanal.devolucaoId, devolucaoId));
  return c;
}

describe('ml.enviar-resultado no modo bitbrain (§4.6)', () => {
  it('todos BOM: grava resposta_pendente OK e o evento, sem chamar o ML', async () => {
    const d = await conferidaBom();
    expect(await processarResultadoConferencia(db, d.id, AGORA, BB)).toBe('ok_pendente_manual');
    expect(conector.enviados).toEqual([]);
    expect(await pendente(d.id)).toBe('OK');
    expect(await acoes(d.id)).toContain('ml_resposta_manual_pendente');
  });

  it('rodar de novo não repete; depois de respondido, a pendência não volta', async () => {
    const d = await conferidaBom();
    await processarResultadoConferencia(db, d.id, AGORA, BB);
    await marcarOkRespondido(db, d.id, await criarUsuarioTeste(db, 'GESTOR'), AGORA, BB);
    expect(await processarResultadoConferencia(db, d.id, AGORA, BB)).toBe('ok_pendente_ja_registrado');
    expect(await pendente(d.id)).toBeNull();
    expect((await acoes(d.id)).filter((a) => a === 'ml_resposta_manual_pendente')).toHaveLength(1);
  });

  it('algum problema: a contestação nasce AGUARDANDO_GESTOR, como hoje, e não há OK pendente', async () => {
    const d = await conferidaProblema();
    expect(await processarResultadoConferencia(db, d.id, AGORA, BB)).toBe('contestacao_criada');
    expect((await contestacaoDe(d.id)).status).toBe('AGUARDANDO_GESTOR');
    expect(await pendente(d.id)).toBeNull();
  });

  it('modo api: o OK vai ao ML como hoje (regressão)', async () => {
    const d = await conferidaBom();
    expect(await processarResultadoConferencia(db, d.id, AGORA, configMLTeste())).toBe('ok_enviado');
    expect(conector.enviados).toHaveLength(1);
    expect(await pendente(d.id)).toBeNull();
  });
});

describe('contestação respondida à mão', () => {
  it('Gestor leva a ENVIADA com a data e o usuário, e registra o evento; o ML não é chamado', async () => {
    const d = await conferidaProblema();
    await processarResultadoConferencia(db, d.id, AGORA, BB);
    const gestor = await criarUsuarioTeste(db, 'GESTOR');
    const c = await contestacaoDe(d.id);
    await marcarContestacaoRespondida(db, c.id, gestor, AGORA, BB);
    expect(await contestacaoDe(d.id)).toMatchObject({ status: 'ENVIADA', enviadaEm: AGORA, revisadoPor: gestor.id, erro: null });
    const evento = (await listarEventos(db, 'devolucao', d.id)).find((e) => e.acao === 'ml_contestacao_respondida_a_mao');
    expect(evento).toMatchObject({ usuarioNome: gestor.nome, dados: { contestacaoId: c.id, motivo: 'SRF2' } });
    expect(conector.enviados).toEqual([]);
  });

  it('recusas: Operador, já respondida, id inválido e fora do modo bitbrain', async () => {
    const d = await conferidaProblema();
    await processarResultadoConferencia(db, d.id, AGORA, BB);
    const c = await contestacaoDe(d.id);
    const gestor = await criarUsuarioTeste(db, 'GESTOR');
    await expect(marcarContestacaoRespondida(db, c.id, await criarUsuarioTeste(db, 'OPERADOR'), AGORA, BB)).rejects.toBeInstanceOf(ErroContestacao);
    await expect(marcarContestacaoRespondida(db, c.id, gestor, AGORA, configMLTeste())).rejects.toThrow('só vale no modo Bitbrain');
    await expect(marcarContestacaoRespondida(db, 'nao-e-uuid', gestor, AGORA, BB)).rejects.toThrow('Contestação não encontrada.');
    await marcarContestacaoRespondida(db, c.id, gestor, AGORA, BB);
    await expect(marcarContestacaoRespondida(db, c.id, gestor, AGORA, BB)).rejects.toThrow('já está marcada como respondida');
  });

  it('contestação com falha (FALHOU) também pode ser marcada como respondida', async () => {
    const d = await conferidaProblema();
    await processarResultadoConferencia(db, d.id, AGORA, BB);
    const c = await contestacaoDe(d.id);
    await db.update(contestacoesCanal).set({ status: 'FALHOU', erro: 'x' }).where(eq(contestacoesCanal.id, c.id));
    await marcarContestacaoRespondida(db, c.id, await criarUsuarioTeste(db, 'GESTOR'), AGORA, BB);
    expect((await contestacaoDe(d.id)).status).toBe('ENVIADA');
  });

  it('o detalhe da contestação traz a conta (nome do Bitbrain)', async () => {
    await contasFalsasTeste(db);
    const d = await conferidaProblema();
    await db.insert(reclamacoesMl).values({ claimId: d.externa!.reclamacaoId, devolucaoId: d.id, conta: 'loja-falsa-1', sincronizadaEm: AGORA });
    await processarResultadoConferencia(db, d.id, AGORA, BB);
    expect((await obterContestacao(db, (await contestacaoDe(d.id)).id, AGORA))?.conta).toBe('Loja Falsa 1');
  });
});

describe('"OK para responder no ML"', () => {
  it('lista código, pedidos, reclamação e conta; marcar limpa a pendência e registra quem respondeu', async () => {
    await contasFalsasTeste(db);
    const d = await conferidaBom();
    await db.insert(reclamacoesMl).values({ claimId: d.externa!.reclamacaoId, devolucaoId: d.id, conta: 'loja-falsa-1', sincronizadaEm: AGORA });
    await processarResultadoConferencia(db, d.id, AGORA, BB);
    expect(await listarOkPendentes(db, AGORA)).toEqual([
      expect.objectContaining({ devolucaoId: d.id, codigo: d.codigo, reclamacaoId: d.externa!.reclamacaoId, conta: 'Loja Falsa 1', pedidos: d.externa!.pedidos }),
    ]);
    const gestor = await criarUsuarioTeste(db, 'GESTOR');
    await marcarOkRespondido(db, d.id, gestor, AGORA, BB);
    expect(await listarOkPendentes(db, AGORA)).toEqual([]);
    expect((await listarEventos(db, 'devolucao', d.id)).find((e) => e.acao === 'ml_ok_respondido_a_mao')?.usuarioNome).toBe(gestor.nome);
    await expect(marcarOkRespondido(db, d.id, gestor, AGORA, BB)).rejects.toThrow('não tem "OK" para responder');
  });

  it('contarRespostasParaDarNoML: OK pendentes + contestações AGUARDANDO_GESTOR ou FALHOU (ENVIADA não conta)', async () => {
    const ok = await conferidaBom();
    await processarResultadoConferencia(db, ok.id, AGORA, BB);
    const aguardando = await conferidaProblema();
    await processarResultadoConferencia(db, aguardando.id, AGORA, BB);
    const respondida = await conferidaProblema();
    await processarResultadoConferencia(db, respondida.id, AGORA, BB);
    await marcarContestacaoRespondida(db, (await contestacaoDe(respondida.id)).id, await criarUsuarioTeste(db, 'GESTOR'), AGORA, BB);
    expect(await contarRespostasParaDarNoML(db)).toBe(2);
  });
});

describe('envio automático desligado no modo bitbrain', () => {
  it('revisarEEnviar é recusado e nada entra na fila', async () => {
    const d = await conferidaProblema();
    await processarResultadoConferencia(db, d.id, AGORA, BB);
    const fila = new FilaMemoria();
    const c = await contestacaoDe(d.id);
    const pedido = revisarEEnviar(db, fila, c.id, { motivo: 'SRF6', mensagem: 'Mensagem de teste longa.', evidencias: [] }, await criarUsuarioTeste(db, 'GESTOR'), AGORA, BB);
    await expect(pedido).rejects.toThrow('Marcar como respondida');
    expect(fila.enviadas).toEqual([]);
  });

  it('enviarContestacao: FALHOU com "responda no ML à mão", sem chamar o ML', async () => {
    const d = await conferidaProblema();
    await processarResultadoConferencia(db, d.id, AGORA, BB);
    const c = await contestacaoDe(d.id);
    const gestor = await criarUsuarioTeste(db, 'GESTOR');
    await db.update(contestacoesCanal).set({ revisadoPor: gestor.id }).where(eq(contestacoesCanal.id, c.id));
    expect(await enviarContestacao(db, c.id, { agora: AGORA, ultimaTentativa: false, config: BB })).toBe('falhou');
    expect(await contestacaoDe(d.id)).toMatchObject({ status: 'FALHOU', erro: expect.stringContaining('responda no ML à mão') });
    expect(conector.enviados).toEqual([]);
  });

  it('pelo manipulador do worker (configML do ambiente): o modo bitbrain também vale', async () => {
    usarModoBitbrain();
    const d = await conferidaBom();
    expect(await processarResultadoConferencia(db, d.id, AGORA)).toBe('ok_pendente_manual');
  });
});
```

- [ ] **Passo 2:** `npm run test:int -- src/modules/mercado-livre/respostas-manuais.int.test.ts` → FAIL.

- [ ] **Passo 3: Implementação**

`resultado.ts`:
- Imports: `reclamacoesMl` (schema), `configML` e `type ConfigML` (`./config`).
- No `select` do `dev`, acrescente `reclamacaoId: devolucoes.reclamacaoId`.
- `ResultadoProcessamento` ganha `| 'ok_pendente_manual' | 'ok_pendente_ja_registrado'`.
- A assinatura passa a ser `processarResultadoConferencia(db: DbOuTx, devolucaoId: string, agora: Date, config: ConfigML = configML())`.
- Logo depois do bloco `if (decisao.tipo === 'CONTESTAR') { … }`, e antes da transação do OK:

```ts
  // §4.6: no modo bitbrain o sistema não escreve no ML; o "OK" fica pendente para o Gestor responder à mão.
  if (config.modo === 'bitbrain') return registrarOkPendente(db, { id: dev.id, reclamacaoId: dev.reclamacaoId }, agora);
```

- No fim do arquivo:

```ts
/**
 * Modo bitbrain (§4.6): grava resposta_pendente = 'OK' na reclamação e o evento ml_resposta_manual_pendente.
 * Idempotente pelo evento: rodar de novo (inclusive depois de "Marcar como respondido") não volta a pendência.
 */
export async function registrarOkPendente(
  db: DbOuTx,
  dev: { id: string; reclamacaoId: string | null },
  agora: Date,
): Promise<'ok_pendente_manual' | 'ok_pendente_ja_registrado' | 'sem_vinculo'> {
  const reclamacaoId = dev.reclamacaoId;
  if (!reclamacaoId) return 'sem_vinculo';
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(3, hashtext(${`resultado:${dev.id}`}))`);
    if (await jaTemEvento(tx, dev.id, 'ml_resposta_manual_pendente')) return 'ok_pendente_ja_registrado';
    await tx
      .insert(reclamacoesMl)
      .values({ claimId: reclamacaoId, devolucaoId: dev.id, sincronizadaEm: agora, respostaPendente: 'OK' })
      .onConflictDoUpdate({ target: reclamacoesMl.claimId, set: { respostaPendente: 'OK' } });
    await registrarEvento(tx, {
      entidade: 'devolucao',
      entidadeId: dev.id,
      acao: 'ml_resposta_manual_pendente',
      usuarioId: null,
      dados: { resposta: 'OK' },
      em: agora,
    });
    return 'ok_pendente_manual';
  });
}
```

`contestacoes.ts`:
- Imports: `ErroRespostaManual` e `MENSAGEM_RESPOSTA_MANUAL` (`@/conectores/marketplace/bitbrain/cliente`); `configML` e `type ConfigML` (`./config`); `contasBitbrain` e `reclamacoesMl` (schema).
- `revisarEEnviar(db, fila, id, e, usuario, agora, config: ConfigML = configML())`: logo depois da checagem do Gestor:

```ts
  if (config.modo === 'bitbrain') {
    throw new ErroContestacao(['No modo Bitbrain a contestação é respondida à mão no ML: use "Marcar como respondida".']);
  }
```

- `enviarContestacao(db, id, o: { agora: Date; ultimaTentativa: boolean; config?: ConfigML })`:
  - logo depois de `if (!c || c.status !== 'AGUARDANDO_GESTOR' || !c.revisadoPor) return 'ignorada';` e da definição do `falhar`, acrescente `if ((o.config ?? configML()).modo === 'bitbrain') return falhar(MENSAGEM_RESPOSTA_MANUAL);`;
  - no `catch` do envio, como primeira linha: `if (erro instanceof ErroRespostaManual) return falhar(erro.message);`.
- `DetalheContestacao` ganha `conta: string | null`. Em `obterContestacao`:
  - acrescente ao `select` `conta: sql<string | null>\`coalesce(${contasBitbrain.nome}, ${reclamacoesMl.conta})\``;
  - acrescente os joins `.leftJoin(reclamacoesMl, eq(reclamacoesMl.claimId, devolucoes.reclamacaoId)).leftJoin(contasBitbrain, eq(contasBitbrain.empresa, reclamacoesMl.conta))`;
  - devolva `conta: c.conta`.

`respostas-manuais.ts`:

```ts
import { and, asc, count, eq, inArray, sql } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { contasBitbrain, contestacoesCanal, devolucoes, reclamacoesMl } from '@/db/schema';
import { ehUuid } from '@/lib/uuid';
import { pode } from '@/modules/auth/permissoes';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import type { DadosSelo } from '@/modules/devolucoes/selos';
import { registrarEvento } from '@/modules/historico/eventos';
import { configML, type ConfigML } from './config';
import { ErroContestacao } from './contestacoes';
import { seloPrazoML } from './selos';

const SO_NO_BITBRAIN = 'A resposta à mão só vale no modo Bitbrain (ML_CONECTOR=bitbrain).';

function exigirGestorNoBitbrain(usuario: UsuarioSessao, config: ConfigML): void {
  if (!pode(usuario.perfil, 'administrar')) throw new ErroContestacao(['Só o Gestor marca as respostas dadas no ML.']);
  if (config.modo !== 'bitbrain') throw new ErroContestacao([SO_NO_BITBRAIN]);
}

export type OkPendente = {
  devolucaoId: string;
  codigo: string;
  pedidos: string[];
  reclamacaoId: string;
  conta: string | null;
  prazo: Date | null;
  selo: DadosSelo | null;
};

/** "OK para responder no ML" (extra, §4.6): as devoluções conferidas sem problema que esperam o "OK" à mão. */
export async function listarOkPendentes(db: DbOuTx, agora: Date = new Date()): Promise<OkPendente[]> {
  const linhas = await db
    .select({
      devolucaoId: devolucoes.id,
      codigo: devolucoes.codigo,
      pedidos: devolucoes.pedidosExternos,
      reclamacaoId: reclamacoesMl.claimId,
      conta: sql<string | null>`coalesce(${contasBitbrain.nome}, ${reclamacoesMl.conta})`,
      prazo: devolucoes.prazoConferenciaCanal,
    })
    .from(reclamacoesMl)
    .innerJoin(devolucoes, eq(devolucoes.id, reclamacoesMl.devolucaoId))
    .leftJoin(contasBitbrain, eq(contasBitbrain.empresa, reclamacoesMl.conta))
    .where(eq(reclamacoesMl.respostaPendente, 'OK'))
    .orderBy(sql`${devolucoes.prazoConferenciaCanal} asc nulls last`, asc(devolucoes.numero))
    .limit(200);
  return linhas.map((l) => ({ ...l, selo: seloPrazoML(l.prazo, agora) }));
}

/** "Marcar como respondido": limpa a pendência e registra quem respondeu (§4.6). */
export async function marcarOkRespondido(db: DbOuTx, devolucaoId: string, usuario: UsuarioSessao, agora: Date, config: ConfigML = configML()): Promise<void> {
  exigirGestorNoBitbrain(usuario, config);
  if (!ehUuid(devolucaoId)) throw new ErroContestacao(['Devolução não encontrada.']);
  await db.transaction(async (tx) => {
    const limpas = await tx
      .update(reclamacoesMl)
      .set({ respostaPendente: null })
      .where(and(eq(reclamacoesMl.devolucaoId, devolucaoId), eq(reclamacoesMl.respostaPendente, 'OK')))
      .returning({ claimId: reclamacoesMl.claimId });
    if (limpas.length === 0) throw new ErroContestacao(['Esta devolução não tem "OK" para responder no ML.']);
    await registrarEvento(tx, { entidade: 'devolucao', entidadeId: devolucaoId, acao: 'ml_ok_respondido_a_mao', usuarioId: usuario.id, em: agora });
  });
}

/** "Marcar como respondida" (extra, §4.6): a contestação vai a ENVIADA, com o evento e o usuário. */
export async function marcarContestacaoRespondida(db: DbOuTx, id: string, usuario: UsuarioSessao, agora: Date, config: ConfigML = configML()): Promise<void> {
  exigirGestorNoBitbrain(usuario, config);
  if (!ehUuid(id)) throw new ErroContestacao(['Contestação não encontrada.']);
  const [c] = await db
    .select({ status: contestacoesCanal.status, devolucaoId: contestacoesCanal.devolucaoId, motivo: contestacoesCanal.motivoCanal })
    .from(contestacoesCanal)
    .where(eq(contestacoesCanal.id, id));
  if (!c) throw new ErroContestacao(['Contestação não encontrada.']);
  if (c.status === 'ENVIADA') throw new ErroContestacao(['Esta contestação já está marcada como respondida.']);
  await db.transaction(async (tx) => {
    const [mudou] = await tx
      .update(contestacoesCanal)
      .set({ status: 'ENVIADA', enviadaEm: agora, revisadoPor: usuario.id, erro: null, atualizadaEm: agora })
      .where(and(eq(contestacoesCanal.id, id), eq(contestacoesCanal.status, c.status)))
      .returning({ id: contestacoesCanal.id });
    if (!mudou) throw new ErroContestacao(['Outra pessoa acabou de marcar esta contestação. Atualize a tela.']);
    await registrarEvento(tx, {
      entidade: 'devolucao',
      entidadeId: c.devolucaoId,
      acao: 'ml_contestacao_respondida_a_mao',
      usuarioId: usuario.id,
      dados: { contestacaoId: id, motivo: c.motivo },
      em: agora,
    });
  });
}

/** Alerta "Respostas para dar no ML" (D10): os "OK" pendentes mais as contestações que esperam o Gestor ou falharam. */
export async function contarRespostasParaDarNoML(db: DbOuTx): Promise<number> {
  const [ok] = await db.select({ total: count() }).from(reclamacoesMl).where(eq(reclamacoesMl.respostaPendente, 'OK'));
  const [contestacoes] = await db
    .select({ total: count() })
    .from(contestacoesCanal)
    .where(inArray(contestacoesCanal.status, ['AGUARDANDO_GESTOR', 'FALHOU']));
  return Number(ok?.total ?? 0) + Number(contestacoes?.total ?? 0);
}
```

O `respostas-manuais.ts` importa `contestacoes.ts`, que importa `resultado.ts`. Por isso o `registrarOkPendente` mora no `resultado.ts`: assim não há ciclo.

- [ ] **Passo 4:** `npm run test:int -- src/modules/mercado-livre && npm test && npm run typecheck && npm run lint` → PASS. O `resultado.int.test.ts` e o `contestacoes.int.test.ts` atuais (modo `api`) continuam iguais.

- [ ] **Passo 5: Commit**

```bash
git add src/modules/mercado-livre/resultado.ts src/modules/mercado-livre/contestacoes.ts src/modules/mercado-livre/respostas-manuais.ts src/modules/mercado-livre/respostas-manuais.int.test.ts
git commit -m "feat(bitbrain): respostas a mao (OK pendente, contestacao e OK marcados como respondidos, envio automatico desligado)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Tarefa 10: Alertas do modo `bitbrain` (respostas para dar, sincronização por conta, conta indisponível)

**Objetivo:** o painel de alertas ganha, no modo `bitbrain` e só para o Gestor (D10):
- "Respostas para dar no ML", com o número de "OK" pendentes mais as contestações aguardando ou com falha, e o link para `/contestacoes`;
- "Conta do ML indisponível no Bitbrain";
- o alerta de sincronização parada contado por conta marcada.

No modo `api`, nada muda.

**Arquivos:**
- Modificar: `src/modules/acabamento/alertas-regras.ts`, `alertas-regras.test.ts`, `alertas.ts`, `alertas.int.test.ts`

**Interfaces:**
- Consome: `contarRespostasParaDarNoML` (Tarefa 9); `listarContasBitbrain`, `contaAtrasada` e `contarContasIndisponiveis` (Tarefa 6); `configML`.
- Produz (`alertas-regras.ts`):
  - `IDS_ALERTA` ganha `'respostas_ml'` (logo depois de `'prazo_ml'`) e `'conta_bitbrain_indisponivel'` (logo depois de `'conta_ml_reconectar'`);
  - `DEFINICAO_ALERTA.respostas_ml = { titulo: 'Respostas para dar no ML', perfis: ['GESTOR'], tom: 'atencao', href: '/contestacoes' }`;
  - `DEFINICAO_ALERTA.conta_bitbrain_indisponivel = { titulo: 'Conta do ML indisponível no Bitbrain', perfis: ['GESTOR'], tom: 'erro', href: '/configuracoes/mercado-livre' }`.

- [ ] **Passo 1: Testes que falham**

`alertas-regras.test.ts`:
- No teste dos perfis, troque `toHaveLength(11)` por `toHaveLength(13)`.
- Acrescente:

```ts
  it('alertas do modo Bitbrain (D10): títulos e links', () => {
    expect(DEFINICAO_ALERTA.respostas_ml).toMatchObject({ titulo: 'Respostas para dar no ML', perfis: ['GESTOR'], href: '/contestacoes' });
    expect(DEFINICAO_ALERTA.conta_bitbrain_indisponivel).toMatchObject({ titulo: 'Conta do ML indisponível no Bitbrain', perfis: ['GESTOR'] });
    expect(alertasDoPerfil('GESTOR').slice(0, 2)).toEqual(['prazo_ml', 'respostas_ml']);
  });
```

`alertas.int.test.ts`:
- Imports novos: `afterEach` e `vi` de `vitest`; `contasBitbrain` de `@/db/schema`; `processarResultadoConferencia` de `@/modules/mercado-livre/resultado`; `configBitbrainTeste` e `contasFalsasTeste` de `../../../tests/helpers/fabricas-bitbrain`; `devolucaoMLConferidaTeste` de `../../../tests/helpers/fabricas-ml`; `usarModoBitbrain` de `../../../tests/helpers/modo-bitbrain`.
- Os testes:

```ts
describe('modo bitbrain (integração de 18/11, D10)', () => {
  beforeEach(() => usarModoBitbrain());
  afterEach(() => vi.unstubAllEnvs());

  it('"Respostas para dar no ML": OK pendentes + contestações aguardando ou com falha; só o Gestor', async () => {
    const d = await devolucaoMLConferidaTeste(db, { itens: [{ destino: 'BOM' }] });
    await processarResultadoConferencia(db, d.id, AGORA, configBitbrainTeste());
    const outra = await criarDevolucaoTeste(db, await criarUsuarioTeste(db), { canal: 'MERCADO_LIVRE' });
    await criarContestacaoTeste(db, outra.id, { status: 'FALHOU', prazo: new Date('2026-12-30T12:00:00Z') });
    const alerta = (await carregarAlertas(db, 'GESTOR', AGORA, semDisco)).find((a) => a.id === 'respostas_ml');
    expect(alerta).toMatchObject({ titulo: 'Respostas para dar no ML', quantidade: 2, href: '/contestacoes' });
    expect(await ids('OPERADOR')).not.toContain('respostas_ml');
  });

  it('sincronização parada contada por conta marcada; conta marcada indisponível tem alerta próprio', async () => {
    await contasFalsasTeste(db, { recebe: ['loja-falsa-1', 'loja-falsa-2'] });
    await db.update(contasBitbrain).set({ ultimaSincronizacaoEm: new Date('2026-11-20T10:00:00Z'), atualizadaEm: new Date('2026-11-20T09:00:00Z') });
    await db.update(contasBitbrain).set({ disponivel: false }).where(eq(contasBitbrain.empresa, 'loja-falsa-2'));
    const alertas = await carregarAlertas(db, 'GESTOR', AGORA, semDisco);
    expect(alertas.find((a) => a.id === 'sincronizacao_ml')?.quantidade).toBe(1);
    expect(alertas.find((a) => a.id === 'conta_bitbrain_indisponivel')).toMatchObject({ titulo: 'Conta do ML indisponível no Bitbrain', quantidade: 1 });
  });

  it('conta em dia: sem alerta de sincronização', async () => {
    await contasFalsasTeste(db, { recebe: ['loja-falsa-1'] });
    await db.update(contasBitbrain).set({ ultimaSincronizacaoEm: new Date('2026-11-20T11:50:00Z') });
    expect(await ids('GESTOR')).not.toContain('sincronizacao_ml');
  });
});

describe('modo api: nada do Bitbrain aparece (regressão)', () => {
  it('OK pendente e conta indisponível não geram alerta fora do modo bitbrain', async () => {
    const d = await devolucaoMLConferidaTeste(db, { itens: [{ destino: 'BOM' }] });
    await processarResultadoConferencia(db, d.id, AGORA, configBitbrainTeste());
    await contasFalsasTeste(db, { recebe: ['loja-falsa-1'] });
    await db.update(contasBitbrain).set({ disponivel: false });
    expect(await ids('GESTOR')).toEqual([]);
  });
});
```

- [ ] **Passo 2:** `npm test -- src/modules/acabamento && npm run test:int -- src/modules/acabamento/alertas.int.test.ts` → FAIL.

- [ ] **Passo 3: Implementação**

`alertas-regras.ts`: acrescente os 2 ids em `IDS_ALERTA` e as 2 definições em `DEFINICAO_ALERTA`, como em **Interfaces**.

`alertas.ts`:
- Imports novos:
  - `configML`, de `@/modules/mercado-livre/config`;
  - `contaAtrasada`, `contarContasIndisponiveis` e `listarContasBitbrain`, de `@/modules/mercado-livre/contas-bitbrain`;
  - `contarRespostasParaDarNoML`, de `@/modules/mercado-livre/respostas-manuais`.
- No `calcular`, acrescente os casos e troque o `sincronizacao_ml`:

```ts
    case 'respostas_ml':
      // D10: só no modo bitbrain, onde as respostas ao ML são dadas à mão.
      return configML().modo === 'bitbrain' ? contagem(await contarRespostasParaDarNoML(db)) : null;
    case 'conta_bitbrain_indisponivel':
      return configML().modo === 'bitbrain' ? contagem(await contarContasIndisponiveis(db)) : null;
    case 'sincronizacao_ml': {
      // Modo bitbrain (§4.4): uma conta marcada parada há mais de 1 h já conta; a quantidade é o número de contas.
      if (configML().modo === 'bitbrain') return contagem((await listarContasBitbrain(db)).filter((c) => contaAtrasada(c, agora)).length);
      const conta = await obterContaML(db);
      return condicao(conta?.situacao === 'ATIVA' && sincronizacaoAtrasada(conta.ultimaSincronizacaoEm ?? conta.conectadaEm, agora));
    }
```

O `detalhar` não muda: os dois alertas novos levam a uma tela própria, e o `default` devolve listas vazias.

- [ ] **Passo 4:** `npm test && npm run test:int -- src/modules/acabamento && npm run typecheck && npm run lint` → PASS.

- [ ] **Passo 5: Commit**

```bash
git add src/modules/acabamento/alertas-regras.ts src/modules/acabamento/alertas-regras.test.ts src/modules/acabamento/alertas.ts src/modules/acabamento/alertas.int.test.ts
git commit -m "feat(bitbrain): alertas Respostas para dar no ML, conta indisponivel e sincronizacao parada por conta

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Tarefa 11: Configurações › Mercado Livre no modo `bitbrain` e a segunda configuração do e2e

**Objetivo:** no modo `bitbrain`, a tela mostra as contas do Bitbrain:
- a lista se atualiza ao abrir a tela (D13);
- cada conta tem nome, vendedor e selos ("Recebe devoluções", "Não recebe" e "Indisponível no Bitbrain");
- o Gestor marca e desmarca cada conta ("Receber devoluções" e "Parar de receber");
- no topo ficam "Atualizar contas" e "Sincronizar agora";
- cada conta mostra a última sincronização ou o aviso de parada.

Os blocos de OAuth somem nesse modo (D15). O e2e do modo `bitbrain` ganha a configuração própria (D4), nos projetos `computador` e `celular`.

**Arquivos:**
- Modificar: `playwright.config.ts`, `tests/e2e/dados.ts`, `tests/e2e/global-setup.ts`, `package.json` (só o script), `src/app/(app)/configuracoes/mercado-livre/page.tsx`, `src/app/(app)/configuracoes/mercado-livre/acoes.ts`
- Criar: `playwright.bitbrain.config.ts`, `tests/e2e/apoio-bitbrain.ts`, `tests/e2e/bitbrain-configuracoes.spec.ts`, `src/app/(app)/configuracoes/mercado-livre/acoes-bitbrain.ts`, `src/app/(app)/configuracoes/mercado-livre/tipos-bitbrain.ts`, `src/app/(app)/configuracoes/mercado-livre/ContasBitbrain.tsx`, `src/app/(app)/configuracoes/mercado-livre/ContasBitbrain.test.tsx`

**Interfaces:**
- Consome:
  - de `contas-bitbrain.ts` (Tarefa 6): `buscarEAtualizarContas`, `listarContasBitbrain`, `marcarContaBitbrain`, `contaAtrasada`, `mensagemFalhaBitbrain` e `ErroContaBitbrain`;
  - `pedirSincronizacaoAgora` (Tarefa 8);
  - `URL_BITBRAIN_FALSO` e `TOKEN_BITBRAIN_FALSO` (Tarefa 1);
  - `EMPRESAS_FALSAS` (Tarefa 4) e `contasFalsasTeste` (Tarefa 6).
- Produz (e2e):
  - `type ModoE2E = 'falso' | 'bitbrain'` e `ambienteE2E(modo?: ModoE2E): Record<string, string>`, em `tests/e2e/dados.ts`. O `AMBIENTE_E2E` fica como está;
  - `configE2E(modo: ModoE2E)` exportado pelo `playwright.config.ts`, cujo `default` é `configE2E('falso')`;
  - `metadata.modoML` no config, lido pelo `global-setup`;
  - script `"test:e2e:bitbrain": "playwright test -c playwright.bitbrain.config.ts"`.
- Produz (`tests/e2e/apoio-bitbrain.ts`): `configBitbrainE2E(): ConfigML`, `semContasBitbrain(): Promise<void>` e `marcarContaFalsa(empresa: string): Promise<void>`.
- Produz (tela):
  - `type ContaVista = { empresa: string; nome: string; sellerId: string; recebeDevolucoes: boolean; disponivel: boolean; ultimaSincronizacao: string | null; atrasada: boolean }`;
  - `type EstadoContasBitbrain = { erros: string[]; ok: string | null }` e `ESTADO_INICIAL_CONTAS` (em `tipos-bitbrain.ts`, porque um arquivo `'use server'` só exporta funções assíncronas);
  - `acaoContasBitbrain(_anterior: EstadoContasBitbrain, dados: FormData): Promise<EstadoContasBitbrain>`, com o campo `operacao` igual a `atualizar`, `sincronizar` ou `marcar` (este com `empresa` e `recebe=sim|nao`), validado com zod;
  - `ContasBitbrain({ contas, acao })` (componente de cliente).

- [ ] **Passo 1: e2e com duas configurações (D4)**

`tests/e2e/dados.ts` (no fim; o `AMBIENTE_E2E` não muda):

```ts
import { TOKEN_BITBRAIN_FALSO, URL_BITBRAIN_FALSO } from '../../src/lib/env';

export type ModoE2E = 'falso' | 'bitbrain';

/** O ambiente do servidor e do worker do e2e. No modo bitbrain, o ML chega pelo Bitbrain falso (D3, só com PERMITIR_FALSOS=1). */
export function ambienteE2E(modo: ModoE2E = 'falso'): Record<string, string> {
  if (modo === 'falso') return { ...AMBIENTE_E2E };
  return { ...AMBIENTE_E2E, ML_CONECTOR: 'bitbrain', BITBRAIN_URL: URL_BITBRAIN_FALSO, BITBRAIN_TOKEN: TOKEN_BITBRAIN_FALSO };
}
```

`playwright.config.ts`: troque `import { AMBIENTE_E2E, … }` por `import { ambienteE2E, PORTA_E2E as PORTA, URL_E2E, type ModoE2E } from './tests/e2e/dados';` e embrulhe o `defineConfig` numa função:

```ts
/** Os e2e do modo Bitbrain rodam só na configuração própria (playwright.bitbrain.config.ts, D4). */
const SPECS_BITBRAIN = /bitbrain-.*\.spec\.ts$/;

export function configE2E(modo: ModoE2E) {
  return defineConfig({
    testDir: 'tests/e2e',
    ...(modo === 'bitbrain' ? { testMatch: SPECS_BITBRAIN } : { testIgnore: SPECS_BITBRAIN }),
    metadata: { modoML: modo },
    // (fullyParallel, workers, globalSetup, expect, use e projects: iguais a hoje)
    webServer: {
      // (command, url, reuseExistingServer e timeout: iguais a hoje)
      env: {
        DATABASE_URL: process.env.DATABASE_URL_TEST ?? '',
        ...ambienteE2E(modo),
        ...(MODO_DEV ? {} : { NEXT_DIST_DIR: '.next-e2e' }),
      },
    },
  });
}

export default configE2E('falso');
```

`playwright.bitbrain.config.ts`:

```ts
import { configE2E } from './playwright.config';

/** e2e do modo Bitbrain (D4): o servidor e o worker sobem com ML_CONECTOR=bitbrain e o Bitbrain falso. `npm run test:e2e:bitbrain`. */
export default configE2E('bitbrain');
```

`tests/e2e/global-setup.ts`:
- `export default async function globalSetup(config: FullConfig)`, com `import type { FullConfig } from '@playwright/test'`;
- `const modo: ModoE2E = config.metadata?.modoML === 'bitbrain' ? 'bitbrain' : 'falso';`;
- o worker sobe com `env: { ...process.env, ...ambienteE2E(modo), DATABASE_URL: url }`.

`package.json`: acrescente `"test:e2e:bitbrain": "playwright test -c playwright.bitbrain.config.ts"`, logo depois de `test:e2e`. Não rode `npm install`.

`tests/e2e/apoio-bitbrain.ts`:

```ts
import { contasBitbrain } from '../../src/db/schema';
import { configML, type ConfigML } from '../../src/modules/mercado-livre/config';
import { contasFalsasTeste } from '../helpers/fabricas-bitbrain';
import { comBanco } from './apoio';
import { ambienteE2E } from './dados';

/** O config do servidor do e2e no modo bitbrain (o processo dos testes lê o .env, que está em ML_CONECTOR=falso). */
export function configBitbrainE2E(): ConfigML {
  return configML({ ...process.env, ...ambienteE2E('bitbrain') });
}

/** Começa sem contas: a tela recria a lista pelo /empresas do Bitbrain falso, todas desmarcadas. */
export async function semContasBitbrain(): Promise<void> {
  await comBanco(async (db) => {
    await db.delete(contasBitbrain);
  });
}

/** As contas do Bitbrain falso no banco, com só esta marcada. */
export async function marcarContaFalsa(empresa: string): Promise<void> {
  await comBanco((db) => contasFalsasTeste(db, { recebe: [empresa] }));
}
```

- [ ] **Passo 2: Testes que falham**

`ContasBitbrain.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ContasBitbrain } from './ContasBitbrain';
import type { ContaVista, EstadoContasBitbrain } from './tipos-bitbrain';

const CONTAS: ContaVista[] = [
  { empresa: 'loja-1', nome: 'Loja 1', sellerId: '123', recebeDevolucoes: false, disponivel: true, ultimaSincronizacao: null, atrasada: false },
  { empresa: 'loja-2', nome: 'Loja 2', sellerId: '223', recebeDevolucoes: true, disponivel: false, ultimaSincronizacao: '18/11/2026 10:00', atrasada: false },
  { empresa: 'loja-3', nome: 'Loja 3', sellerId: '323', recebeDevolucoes: true, disponivel: true, ultimaSincronizacao: '18/11/2026 08:00', atrasada: true },
];

beforeAll(() => {
  Element.prototype.scrollIntoView = () => undefined;
});

describe('ContasBitbrain (§4.3)', () => {
  it('um cartão por conta, com os selos e o botão certo', () => {
    render(<ContasBitbrain contas={CONTAS} acao={vi.fn()} />);
    const loja1 = screen.getByRole('article', { name: 'Loja 1' });
    expect(loja1.textContent).toContain('Não recebe');
    expect(screen.getByRole('button', { name: 'Receber devoluções' })).toBeTruthy();
    const loja2 = screen.getByRole('article', { name: 'Loja 2' });
    expect(loja2.textContent).toContain('Indisponível no Bitbrain');
    expect(loja2.textContent).toContain('Recebe devoluções');
    expect(screen.getByRole('article', { name: 'Loja 3' }).textContent).toContain('Sincronização parada há mais de 1 hora');
    expect(screen.getAllByRole('button', { name: 'Parar de receber' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Sincronizar agora' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Atualizar contas' })).toBeTruthy();
  });

  it('marcar manda operacao, empresa e recebe; a resposta aparece em role=status', async () => {
    const acao = vi.fn(async (): Promise<EstadoContasBitbrain> => ({ erros: [], ok: 'A conta passa a mandar devoluções para a bancada.' }));
    render(<ContasBitbrain contas={CONTAS} acao={acao} />);
    fireEvent.click(screen.getByRole('button', { name: 'Receber devoluções' }));
    expect((await screen.findByRole('status')).textContent).toBe('A conta passa a mandar devoluções para a bancada.');
    const dados = (acao.mock.calls[0] as unknown as [EstadoContasBitbrain, FormData])[1];
    expect([dados.get('operacao'), dados.get('empresa'), dados.get('recebe')]).toEqual(['marcar', 'loja-1', 'sim']);
  });

  it('erro aparece em role=alert e recebe o foco', async () => {
    const acao = vi.fn(async (): Promise<EstadoContasBitbrain> => ({ erros: ['Bitbrain recusou: confira o BITBRAIN_TOKEN (HTTP 401).'], ok: null }));
    render(<ContasBitbrain contas={[]} acao={acao} />);
    expect(screen.getByText('Nenhuma conta do Bitbrain ainda. Toque em "Atualizar contas".')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar contas' }));
    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain('BITBRAIN_TOKEN');
    await waitFor(() => expect(document.activeElement).toBe(alerta));
  });
});
```

`tests/e2e/bitbrain-configuracoes.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { contasBitbrain } from '../../src/db/schema';
import { comBanco, entrarComo, semRolagemLateral } from './apoio';
import { semContasBitbrain } from './apoio-bitbrain';
import { alvosDeToque44 } from './apoio-ml';
import { USUARIOS_E2E } from './dados';

test.beforeEach(async () => {
  await semContasBitbrain();
});

test('gestor vê as contas do Bitbrain, marca uma e pede "Sincronizar agora"', async ({ page }) => {
  await entrarComo(page, USUARIOS_E2E.gestor);
  await page.goto('/configuracoes/mercado-livre');
  await expect(page.getByRole('heading', { level: 1, name: 'Mercado Livre' })).toBeVisible();
  await expect(page.getByText('Modo de teste: o sistema usa um Bitbrain falso.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Conectar conta do Mercado Livre/ })).toHaveCount(0);
  const loja1 = page.getByRole('article', { name: 'Loja Falsa 1' });
  const loja2 = page.getByRole('article', { name: 'Loja Falsa 2' });
  await expect(loja1.getByText('Não recebe', { exact: true })).toBeVisible();
  await expect(loja2.getByText('Não recebe', { exact: true })).toBeVisible();
  await semRolagemLateral(page);
  await alvosDeToque44(page.locator('main'));

  await loja1.getByRole('button', { name: 'Receber devoluções' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'A conta passa a mandar devoluções para a bancada.' })).toBeVisible();
  await expect(loja1.getByText('Recebe devoluções', { exact: true })).toBeVisible();
  await expect(loja1.getByText('Ainda não sincronizou')).toBeVisible();

  await page.getByRole('button', { name: 'Sincronizar agora' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Sincronização pedida.' })).toBeVisible();
  // O worker do e2e (modo bitbrain) varre a conta marcada e grava a última sincronização.
  await expect
    .poll(
      async () => {
        await page.reload();
        return loja1.getByText('Ainda não sincronizou').count();
      },
      { timeout: 30_000, intervals: [1000, 2000] },
    )
    .toBe(0);
  await expect(loja2.getByText('Não recebe', { exact: true })).toBeVisible();
  await semRolagemLateral(page);
});

test('conta que sumiu do Bitbrain fica "Indisponível no Bitbrain"; "Atualizar contas" responde', async ({ page }) => {
  await comBanco(async (db) => {
    await db.insert(contasBitbrain).values({ empresa: 'loja-antiga', nome: 'Loja Antiga', sellerId: '999', recebeDevolucoes: true });
  });
  await entrarComo(page, USUARIOS_E2E.gestor);
  await page.goto('/configuracoes/mercado-livre');
  await expect(page.getByRole('article', { name: 'Loja Antiga' }).getByText('Indisponível no Bitbrain')).toBeVisible();
  await page.getByRole('button', { name: 'Atualizar contas' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Lista de contas atualizada: 2 contas no Bitbrain.' })).toBeVisible();
  await semRolagemLateral(page);
  await alvosDeToque44(page.locator('main'));
});
```

- [ ] **Passo 3:** `npm test -- "src/app/(app)/configuracoes/mercado-livre"` → FAIL (os componentes não existem).

- [ ] **Passo 4: Implementação**

`tipos-bitbrain.ts`:

```ts
export type ContaVista = {
  empresa: string;
  nome: string;
  sellerId: string;
  recebeDevolucoes: boolean;
  disponivel: boolean;
  /** Já formatada no servidor (horário de Brasília); null = ainda não sincronizou. */
  ultimaSincronizacao: string | null;
  atrasada: boolean;
};
export type EstadoContasBitbrain = { erros: string[]; ok: string | null };
export const ESTADO_INICIAL_CONTAS: EstadoContasBitbrain = { erros: [], ok: null };
```

`acoes-bitbrain.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { logErroML } from '@/conectores/marketplace/mercadolivre/erros';
import { obterDb } from '@/db';
import { exigirPermissao } from '@/modules/auth/servidor';
import { obterFila } from '@/modules/fila/fila';
import { configML } from '@/modules/mercado-livre/config';
import { buscarEAtualizarContas, ErroContaBitbrain, marcarContaBitbrain, mensagemFalhaBitbrain } from '@/modules/mercado-livre/contas-bitbrain';
import { pedirSincronizacaoAgora } from '@/modules/mercado-livre/tarefas';
import type { EstadoContasBitbrain } from './tipos-bitbrain';

const esquema = z.discriminatedUnion('operacao', [
  z.object({ operacao: z.literal('atualizar') }),
  z.object({ operacao: z.literal('sincronizar') }),
  z.object({ operacao: z.literal('marcar'), empresa: z.string().trim().min(1).max(100), recebe: z.enum(['sim', 'nao']) }),
]);

/** "Atualizar contas", "Sincronizar agora" e marcar/desmarcar a conta (§4.3 e §4.4). Só o Gestor. */
export async function acaoContasBitbrain(_anterior: EstadoContasBitbrain, dados: FormData): Promise<EstadoContasBitbrain> {
  const usuario = await exigirPermissao('administrar');
  const config = configML();
  if (config.modo !== 'bitbrain') return { erros: ['Esta ação só vale com ML_CONECTOR=bitbrain.'], ok: null };
  const lido = esquema.safeParse(Object.fromEntries(dados));
  if (!lido.success) return { erros: ['Pedido inválido.'], ok: null };
  const db = obterDb();
  const agora = new Date();
  let ok: string;
  switch (lido.data.operacao) {
    case 'atualizar': {
      try {
        const r = await buscarEAtualizarContas(db, config, agora);
        ok = `Lista de contas atualizada: ${r.total} ${r.total === 1 ? 'conta' : 'contas'} no Bitbrain.`;
      } catch (erro) {
        logErroML('atualizar as contas do Bitbrain', erro);
        return { erros: [mensagemFalhaBitbrain(erro)], ok: null };
      }
      break;
    }
    case 'sincronizar':
      await pedirSincronizacaoAgora(obterFila());
      ok = 'Sincronização pedida. As devoluções novas aparecem em instantes.';
      break;
    case 'marcar':
      try {
        await marcarContaBitbrain(db, { empresa: lido.data.empresa, recebe: lido.data.recebe === 'sim' }, usuario, agora);
      } catch (erro) {
        if (erro instanceof ErroContaBitbrain) return { erros: [erro.message], ok: null };
        throw erro;
      }
      ok = lido.data.recebe === 'sim' ? 'A conta passa a mandar devoluções para a bancada.' : 'A conta não manda mais devoluções para a bancada.';
      break;
  }
  revalidatePath('/configuracoes/mercado-livre');
  return { erros: [], ok };
}
```

`ContasBitbrain.tsx`:

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { ListaErros } from '@/components/ListaErros';
import { Selo } from '@/components/Selo';
import { ALERTA_OK, BOTAO_PRIMARIO, BOTAO_SECUNDARIO, CARTAO, VAZIO } from '@/components/estilos';
import { useEnvioFormulario } from '@/components/useEnvioFormulario';
import { ESTADO_INICIAL_CONTAS, type ContaVista, type EstadoContasBitbrain } from './tipos-bitbrain';

type Props = { contas: ContaVista[]; acao: (anterior: EstadoContasBitbrain, dados: FormData) => Promise<EstadoContasBitbrain> };

/** §4.3: as contas do Bitbrain; o Gestor marca as que mandam devoluções. Um estado só para a tela (como ListaFalhas). */
export function ContasBitbrain({ contas, acao }: Props) {
  const [estado, enviar, pendente] = useEnvioFormulario(acao, ESTADO_INICIAL_CONTAS, 'erros-contas-bitbrain');
  const [chave, setChave] = useState<string | null>(null);
  function aoEnviar(evento: FormEvent<HTMLFormElement>) {
    setChave(String(new FormData(evento.currentTarget).get('chave')));
    enviar(evento);
  }
  const ocupado = (c: string) => pendente && chave === c;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-2 sm:flex">
        <form onSubmit={aoEnviar}>
          <input type="hidden" name="operacao" value="sincronizar" />
          <input type="hidden" name="chave" value="sincronizar" />
          <button type="submit" disabled={pendente} className={`${BOTAO_PRIMARIO} w-full sm:w-auto`}>
            {ocupado('sincronizar') ? 'Pedindo…' : 'Sincronizar agora'}
          </button>
        </form>
        <form onSubmit={aoEnviar}>
          <input type="hidden" name="operacao" value="atualizar" />
          <input type="hidden" name="chave" value="atualizar" />
          <button type="submit" disabled={pendente} className={`${BOTAO_SECUNDARIO} w-full sm:w-auto`}>
            {ocupado('atualizar') ? 'Atualizando…' : 'Atualizar contas'}
          </button>
        </form>
      </div>
      <div aria-live="polite" className="flex flex-col gap-2">
        {estado.ok ? (
          <p role="status" className={ALERTA_OK}>
            {estado.ok}
          </p>
        ) : null}
        <ListaErros erros={estado.erros} id="erros-contas-bitbrain" />
      </div>
      {contas.length === 0 ? (
        <p className={VAZIO}>Nenhuma conta do Bitbrain ainda. Toque em &quot;Atualizar contas&quot;.</p>
      ) : (
        <ul className="grid gap-2 md:grid-cols-2">
          {contas.map((c) => (
            <li key={c.empresa}>
              <article aria-labelledby={`conta-${c.empresa}`} className={`${CARTAO} flex flex-col gap-2 p-3`}>
                <h3 id={`conta-${c.empresa}`} className="text-[15px] font-bold [overflow-wrap:anywhere]">
                  {c.nome}
                </h3>
                <span className="break-all font-mono text-xs text-texto-2">
                  Vendedor {c.sellerId} · {c.empresa}
                </span>
                <span className="flex flex-wrap gap-1.5">
                  {!c.disponivel && <Selo texto="Indisponível no Bitbrain" tom="erro" />}
                  <Selo texto={c.recebeDevolucoes ? 'Recebe devoluções' : 'Não recebe'} tom={c.recebeDevolucoes ? 'bom' : 'neutro'} />
                  {c.atrasada && <Selo texto="Sincronização parada há mais de 1 hora" tom="atencao" />}
                </span>
                {c.recebeDevolucoes && (
                  <span className="text-xs text-texto-2">{c.ultimaSincronizacao ? `Última sincronização: ${c.ultimaSincronizacao}` : 'Ainda não sincronizou'}</span>
                )}
                <form onSubmit={aoEnviar}>
                  <input type="hidden" name="operacao" value="marcar" />
                  <input type="hidden" name="empresa" value={c.empresa} />
                  <input type="hidden" name="recebe" value={c.recebeDevolucoes ? 'nao' : 'sim'} />
                  <input type="hidden" name="chave" value={`marcar:${c.empresa}`} />
                  <button type="submit" disabled={pendente} className={`${BOTAO_SECUNDARIO} w-full sm:w-auto`}>
                    {ocupado(`marcar:${c.empresa}`) ? 'Salvando…' : c.recebeDevolucoes ? 'Parar de receber' : 'Receber devoluções'}
                  </button>
                </form>
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

`acoes.ts` (OAuth): no `conectarAcao`, logo depois de `const config = configML();`: `if (config.modo === 'bitbrain') return { erros: ['No modo Bitbrain não há conexão direta com o Mercado Livre.'] };` (D15).

`page.tsx`:
- Imports novos:
  - `URL_BITBRAIN_FALSO`, de `@/lib/env`;
  - `logErroML`, de `@/conectores/marketplace/mercadolivre/erros`;
  - `configML`, de `@/modules/mercado-livre/config`;
  - de `@/modules/mercado-livre/contas-bitbrain`: `buscarEAtualizarContas`, `contaAtrasada`, `listarContasBitbrain` e `mensagemFalhaBitbrain`;
  - `acaoContasBitbrain`, de `./acoes-bitbrain`;
  - `ContasBitbrain`, de `./ContasBitbrain`;
  - o tipo `ContaVista`, de `./tipos-bitbrain`.
- Depois do `exigirPermissao` e da leitura dos parâmetros:

```tsx
  const config = configML();
  const db = obterDb();
  const bitbrain = config.modo === 'bitbrain';
  let erroBitbrain: string | null = null;
  if (bitbrain) {
    // D13: a lista se atualiza ao abrir; se o Bitbrain falhar, a tela mostra a lista guardada e o motivo (sem o token).
    try {
      await buscarEAtualizarContas(db, config, new Date());
    } catch (falha) {
      logErroML('atualizar as contas do Bitbrain', falha);
      erroBitbrain = mensagemFalhaBitbrain(falha);
    }
  }
  const agora = new Date();
  const [resumo, semEnvio, contas] = await Promise.all([
    resumoContaML(db, config),
    listarSemEnvioFisico(db),
    bitbrain ? listarContasBitbrain(db) : Promise.resolve([]),
  ]);
  const contasVista: ContaVista[] = contas.map((c) => ({
    empresa: c.empresa,
    nome: c.nome,
    sellerId: c.sellerId,
    recebeDevolucoes: c.recebeDevolucoes,
    disponivel: c.disponivel,
    ultimaSincronizacao: c.ultimaSincronizacaoEm ? formatarDataHora(c.ultimaSincronizacaoEm) : null,
    atrasada: contaAtrasada(c, agora),
  }));
```

- Na renderização, embrulhe as seções "Conta" e "App no ML Developers" em `{!bitbrain && (<>…</>)}` e acrescente, no lugar delas:

```tsx
      {bitbrain && (
        <section aria-labelledby="titulo-contas-bitbrain" className={`${CARTAO} flex flex-col gap-3`}>
          <h2 id="titulo-contas-bitbrain" className="text-base font-bold">
            Contas do Mercado Livre (pelo Bitbrain)
          </h2>
          <p className="text-sm text-texto-2">
            As devoluções do ML chegam pelo Bitbrain. Marque as contas que mandam devoluções para a bancada. As respostas ao ML (o
            &quot;OK&quot; e a contestação) são dadas à mão, em Contestações ML.
          </p>
          {config.bitbrainUrl === URL_BITBRAIN_FALSO && <p className={ALERTA_ATENCAO}>Modo de teste: o sistema usa um Bitbrain falso.</p>}
          {erroBitbrain && (
            <p role="alert" className={`${ALERTA_ERRO} [overflow-wrap:anywhere]`}>
              {erroBitbrain}
            </p>
          )}
          {resumo.faltas.length > 0 && <p className={ALERTA_ERRO}>Faltam no servidor: {resumo.faltas.join(', ')}.</p>}
          <ContasBitbrain contas={contasVista} acao={acaoContasBitbrain} />
        </section>
      )}
```

- A seção "Devoluções sem envio físico (low_cost)" fica nos dois modos.

- [ ] **Passo 5:** `npm test && npm run typecheck && npm run lint` → PASS. Depois rode `npm run test:e2e -- tests/e2e/mercado-livre.spec.ts tests/e2e/configuracoes.spec.ts` (modo `api`/falso igual, nos dois projetos) e `npm run test:e2e:bitbrain` (os 2 testes novos, no `computador` e no `celular`) → PASS. Tire prints em 390×844 da tela, com as contas e com o erro do Bitbrain.

- [ ] **Passo 6: Commit**

```bash
git add playwright.config.ts playwright.bitbrain.config.ts package.json tests/e2e/dados.ts tests/e2e/global-setup.ts tests/e2e/apoio-bitbrain.ts tests/e2e/bitbrain-configuracoes.spec.ts "src/app/(app)/configuracoes/mercado-livre"
git commit -m "feat(bitbrain): Configuracoes > Mercado Livre com as contas do Bitbrain (marcar, Atualizar contas, Sincronizar agora) e e2e do modo bitbrain

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Tarefa 12: Selos e conta nos cartões, urgentes primeiro nas etapas 2 e 3, e os extras no detalhe

**Objetivo:**
- o cartão do Quadro, das listas das etapas, da Busca Avançada e dos Alertas mostra a conta ("Mercado Livre · <conta>", D18) e os selos "Urgente · até dd/mm", "Afeta reputação" e "Full";
- nas etapas 2 e 3 (quadro e lista), as urgentes vêm primeiro (extra);
- a seção Mercado Livre do detalhe mostra a conta e todos os extras, em "Mais do Mercado Livre (extra)", e os resultados das respostas à mão.

Vale nos dois modos.

**Arquivos:**
- Modificar:
  - `src/modules/mercado-livre/selos.ts`, `selos.test.ts`, `consultas.ts`, `consultas.int.test.ts`;
  - `src/modules/devolucoes/selos.ts`, `selos.test.ts`, `busca.ts`, `busca.int.test.ts`, `quadro.ts`;
  - `src/app/(app)/fluxo/etapa/[numero]/page.tsx`;
  - `src/components/CartaoDevolucao.tsx`, `CartaoDevolucao.test.tsx`;
  - `src/app/(app)/fluxo/devolucoes/[codigo]/secoes/SecaoMercadoLivre.tsx`;
  - `tests/e2e/mercado-livre.spec.ts`.
- Criar: `tests/e2e/bitbrain-devolucoes.spec.ts`

**Interfaces:**
- Consome:
  - as colunas de `reclamacoes_ml` (Tarefa 5) e os rótulos de `dominio.ts` (Tarefa 3);
  - os eventos `ml_resposta_manual_pendente` e `ml_ok_respondido_a_mao` (Tarefa 9);
  - `marcarContaFalsa` (Tarefa 11) e `esperarDevolucaoDaReclamacao` e `alvosDeToque44` (`apoio-ml.ts`).
- Produz (`mercado-livre/selos.ts`): `type EntradaSelosML = { urgente: boolean | null; afetaReputacao: AfetaReputacao | null; ehFull: boolean | null }` e `selosExtrasML(e: EntradaSelosML, prazo: Date | null): DadosSelo[]`.
- Produz (`devolucoes/selos.ts`): a `Entrada` do `selosDaDevolucao` ganha `ml?: EntradaSelosML | null`. Com `ml.urgente`, o selo "Prazo dd/mm" não aparece (D7).
- Produz (`busca.ts`): `ResumoDevolucao.contaML?: string | null` e `OpcoesBusca.urgentesPrimeiro?: boolean`.
- Produz (`consultas.ts`):
  - `ResumoMLDevolucao` ganha `conta: string | null` e `extras: ExtrasML | null`;
  - `ResultadoNoML` ganha `{ tipo: 'ok_pendente_manual'; em: Date }` e `{ tipo: 'ok_respondido_a_mao'; em: Date }`.

- [ ] **Passo 1: Testes que falham**

`src/modules/mercado-livre/selos.test.ts`:

```ts
describe('selosExtrasML (§4.5)', () => {
  const prazo = new Date('2026-11-20T15:00:00Z');
  it('Urgente com o prazo, Afeta reputação e Full; nada quando o ML não informou ou disse não', () => {
    expect(selosExtrasML({ urgente: true, afetaReputacao: 'AFETA', ehFull: true }, prazo)).toEqual([
      { texto: 'Urgente · até 20/11', tom: 'erro' },
      { texto: 'Afeta reputação', tom: 'atencao' },
      { texto: 'Full', tom: 'destaque' },
    ]);
    expect(selosExtrasML({ urgente: true, afetaReputacao: null, ehFull: null }, null)).toEqual([{ texto: 'Urgente', tom: 'erro' }]);
    expect(selosExtrasML({ urgente: false, afetaReputacao: 'NAO_AFETA', ehFull: false }, prazo)).toEqual([]);
    expect(selosExtrasML({ urgente: null, afetaReputacao: 'NAO_SE_APLICA', ehFull: null }, prazo)).toEqual([]);
  });
});
```

`src/modules/devolucoes/selos.test.ts`:

```ts
it('urgente do ML: o selo "Urgente · até dd/mm" substitui o "Prazo dd/mm" (D7)', () => {
  const base = {
    canal: 'MERCADO_LIVRE' as const,
    status: 'PENDENTE_CHEGADA' as const,
    naoIdentificada: false,
    entregueSegundoCanalEm: null,
    prazoConferenciaCanal: new Date('2026-11-25T15:00:00Z'),
  };
  const agora = new Date('2026-11-18T15:00:00Z');
  expect(selosDaDevolucao(base, agora).map((s) => s.texto)).toEqual(['Prazo 25/11']);
  expect(selosDaDevolucao({ ...base, ml: { urgente: true, afetaReputacao: 'AFETA', ehFull: true } }, agora).map((s) => s.texto)).toEqual([
    'Urgente · até 25/11',
    'Afeta reputação',
    'Full',
  ]);
});
```

`busca.int.test.ts` (importe `contasBitbrain` e `reclamacoesMl` de `@/db/schema`):

```ts
describe('extras do ML e conta no resumo (integração Bitbrain)', () => {
  it('selos Urgente, Afeta reputação e Full, e a conta pelo nome do Bitbrain', async () => {
    const operador = await criarUsuarioTeste(db);
    const d = await criarDevolucaoTeste(db, operador, { canal: 'MERCADO_LIVRE' });
    await db.insert(contasBitbrain).values({ empresa: 'megadino', nome: 'IDM Shop', sellerId: '1' });
    await db.insert(reclamacoesMl).values({ claimId: '5000000201', devolucaoId: d.id, conta: 'megadino', urgente: true, afetaReputacao: 'AFETA', ehFull: true, sincronizadaEm: new Date() });
    const [r] = (await buscarDevolucoes(db, {}, { ids: [d.id] })).devolucoes;
    expect(r.contaML).toBe('IDM Shop');
    expect(r.selos.map((s) => s.texto)).toEqual(expect.arrayContaining(['Afeta reputação', 'Full', expect.stringMatching(/^Urgente/)]));
  });

  it('urgentesPrimeiro: a urgente vem antes, mesmo tendo chegado depois (extra)', async () => {
    const operador = await criarUsuarioTeste(db);
    const antiga = await criarDevolucaoTeste(db, operador, { canal: 'MERCADO_LIVRE' });
    const urgente = await criarDevolucaoTeste(db, operador, { canal: 'MERCADO_LIVRE' });
    await db.update(devolucoes).set({ status: 'AGUARDANDO_CONFERENCIA', recebidaEm: new Date('2026-11-18T10:00:00Z') }).where(eq(devolucoes.id, antiga.id));
    await db.update(devolucoes).set({ status: 'AGUARDANDO_CONFERENCIA', recebidaEm: new Date('2026-11-18T11:00:00Z') }).where(eq(devolucoes.id, urgente.id));
    await db.insert(reclamacoesMl).values({ claimId: '5000000202', devolucaoId: urgente.id, urgente: true, sincronizadaEm: new Date() });
    const ordem = async (urgentesPrimeiro: boolean) =>
      (await buscarDevolucoes(db, {}, { status: ['AGUARDANDO_CONFERENCIA'], ordem: 'chegada', urgentesPrimeiro })).devolucoes.map((x) => x.id);
    expect(await ordem(false)).toEqual([antiga.id, urgente.id]);
    expect(await ordem(true)).toEqual([urgente.id, antiga.id]);
  });
});
```

`CartaoDevolucao.test.tsx`:

```tsx
describe('CartaoDevolucao: conta do Bitbrain (D18)', () => {
  it('mostra "Mercado Livre · <conta>" numa linha com reticências; sem conta, só o canal', () => {
    const { unmount } = render(<CartaoDevolucao devolucao={{ ...BASE, canal: 'MERCADO_LIVRE', contaML: 'IDM Shop' }} />);
    const linha = screen.getByText('Mercado Livre · IDM Shop');
    expect(linha.className).toContain('truncate');
    unmount();
    render(<CartaoDevolucao devolucao={{ ...BASE, canal: 'MERCADO_LIVRE' }} />);
    expect(screen.getByText('Mercado Livre')).toBeTruthy();
  });
});
```

`consultas.int.test.ts`:

```ts
describe('resumoMLDaDevolucao: conta, extras e respostas à mão (integração Bitbrain)', () => {
  it('traz a conta pelo nome, os extras da última reclamação e o OK pendente e depois respondido', async () => {
    const d = await devolucaoMLConferidaTeste(db, { itens: [{ destino: 'BOM' }] });
    await db.insert(contasBitbrain).values({ empresa: 'megadino', nome: 'IDM Shop', sellerId: '1' });
    await db.insert(reclamacoesMl).values({
      claimId: d.externa!.reclamacaoId,
      devolucaoId: d.id,
      conta: 'megadino',
      urgente: false,
      afetaReputacao: 'NAO_AFETA',
      ehFull: true,
      triagemCondicao: 'VENDAVEL',
      triagemEtapa: 'closed',
      dinheiro: 'DEVOLVIDO',
      sincronizadaEm: AGORA,
    });
    await processarResultadoConferencia(db, d.id, AGORA, configBitbrainTeste());
    const r = await resumoMLDaDevolucao(db, d.id);
    expect(r).toMatchObject({
      conta: 'IDM Shop',
      extras: { urgente: false, afetaReputacao: 'NAO_AFETA', ehFull: true, triagemCondicao: 'VENDAVEL', triagemEtapa: 'closed', dinheiro: 'DEVOLVIDO' },
      resultado: { tipo: 'ok_pendente_manual' },
    });
    await marcarOkRespondido(db, d.id, await criarUsuarioTeste(db, 'GESTOR'), AGORA, configBitbrainTeste());
    expect((await resumoMLDaDevolucao(db, d.id))?.resultado).toMatchObject({ tipo: 'ok_respondido_a_mao' });
  });

  it('modo api, sem reclamação gravada: conta e extras nulos', async () => {
    const d = await devolucaoMLConferidaTeste(db, { itens: [{ destino: 'BOM' }] });
    expect(await resumoMLDaDevolucao(db, d.id)).toMatchObject({ conta: null, extras: null });
  });
});
```

(Importe `configBitbrainTeste` de `../../../tests/helpers/fabricas-bitbrain`, `processarResultadoConferencia` de `./resultado` e `marcarOkRespondido` de `./respostas-manuais`, além de `contasBitbrain`, `reclamacoesMl`, `devolucaoMLConferidaTeste` e `criarUsuarioTeste`, se ainda não estiverem importados. Use o `AGORA` que o arquivo já define.)

`tests/e2e/mercado-livre.spec.ts` (modo `api`/falso):
- Imports novos: `reclamacoesMl` (`../../src/db/schema`); `criarDevolucaoTeste` (`../helpers/fabricas`); `codigoUnico` e `usuarioPorEmail` (`./apoio`).
- Os testes:

```ts
test('extras do ML (cenário 2): Urgente, Afeta reputação e Full no cartão; os extras no detalhe', async ({ page, request }) => {
  await garantirContaFalsa();
  const reclamacaoId = idReclamacaoFalsa(2);
  await avisarML(request, reclamacaoId);
  const codigo = await esperarDevolucaoDaReclamacao(reclamacaoId);

  await entrarComo(page, USUARIOS_E2E.operador);
  await page.goto(`/fluxo/busca?reclamacao=${reclamacaoId}`);
  const cartao = page.getByRole('link', { name: new RegExp(codigo) });
  await expect(cartao).toContainText('Urgente · até');
  await expect(cartao).toContainText('Afeta reputação');
  await expect(cartao).toContainText('Full');
  await expect(cartao).not.toContainText('Mercado Livre ·');
  await semRolagemLateral(page);

  await page.goto(`/fluxo/devolucoes/${codigo}`);
  const secao = page.locator('section[aria-labelledby="titulo-ml"]');
  await expect(secao.getByText('Mais do Mercado Livre')).toBeVisible();
  await expect(secao.getByText('Afeta a reputação')).toBeVisible();
  await expect(secao.getByText('Revisar a devolução')).toBeVisible();
  await expect(secao.getByText('retido')).toBeVisible();
  await semRolagemLateral(page);
  await alvosDeToque44(secao);
});

test('nas etapas 2 e 3 as urgentes vêm primeiro (extra)', async ({ page }) => {
  const urgente = await comBanco(async (db) => {
    // Só esta fica urgente (o banco do e2e é o mesmo no computador e no celular).
    await db.update(reclamacoesMl).set({ urgente: false }).where(eq(reclamacoesMl.urgente, true));
    const operador = await usuarioPorEmail(db, USUARIOS_E2E.operador);
    const comum = await criarDevolucaoTeste(db, operador, { canal: 'MERCADO_LIVRE' });
    const nova = await criarDevolucaoTeste(db, operador, { canal: 'MERCADO_LIVRE' });
    await db.update(devolucoes).set({ status: 'AGUARDANDO_CONFERENCIA', recebidaEm: new Date(Date.now() - 3_600_000) }).where(eq(devolucoes.id, comum.id));
    await db.update(devolucoes).set({ status: 'AGUARDANDO_CONFERENCIA', recebidaEm: new Date() }).where(eq(devolucoes.id, nova.id));
    await db.insert(reclamacoesMl).values({ claimId: codigoUnico('CLM'), devolucaoId: nova.id, urgente: true, sincronizadaEm: new Date() });
    return nova;
  });
  await entrarComo(page, USUARIOS_E2E.operador);
  await page.goto('/fluxo/etapa/2');
  const primeiro = page.locator('main a[href^="/fluxo/devolucoes/DEV-"]').first();
  await expect(primeiro).toHaveAttribute('href', `/fluxo/devolucoes/${urgente.codigo}`);
  await expect(primeiro).toContainText('Urgente');
  await semRolagemLateral(page);
});
```

`tests/e2e/bitbrain-devolucoes.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { RECLAMACOES_FALSAS_POR_EMPRESA } from '../../src/conectores/marketplace/bitbrain/falso';
import { entrarComo, semRolagemLateral } from './apoio';
import { marcarContaFalsa } from './apoio-bitbrain';
import { alvosDeToque44, esperarDevolucaoDaReclamacao } from './apoio-ml';
import { USUARIOS_E2E } from './dados';

test('a varredura pela conta cria a devolução com a conta e os selos; o detalhe mostra a conta e os extras', async ({ page }) => {
  const [reclamacaoId] = RECLAMACOES_FALSAS_POR_EMPRESA['loja-falsa-1'];
  await marcarContaFalsa('loja-falsa-1');
  await entrarComo(page, USUARIOS_E2E.gestor);
  await page.goto('/configuracoes/mercado-livre');
  await page.getByRole('button', { name: 'Sincronizar agora' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Sincronização pedida.' })).toBeVisible();
  const codigo = await esperarDevolucaoDaReclamacao(reclamacaoId);

  await page.goto(`/fluxo/busca?reclamacao=${reclamacaoId}`);
  const cartao = page.getByRole('link', { name: new RegExp(codigo) });
  await expect(cartao).toContainText('Mercado Livre · Loja Falsa 1');
  await expect(cartao).toContainText('Urgente · até');
  await expect(cartao).toContainText('Afeta reputação');
  await expect(cartao).toContainText('Full');
  await semRolagemLateral(page);

  await page.goto(`/fluxo/devolucoes/${codigo}`);
  const secao = page.locator('section[aria-labelledby="titulo-ml"]');
  await expect(secao.getByText('Loja Falsa 1')).toBeVisible();
  await expect(secao.getByText('Afeta a reputação')).toBeVisible();
  await expect(secao.getByText('retido')).toBeVisible();
  await semRolagemLateral(page);
  await alvosDeToque44(secao);
});
```

- [ ] **Passo 2:** `npm test -- src/modules src/components && npm run test:int -- src/modules/devolucoes/busca.int.test.ts src/modules/mercado-livre/consultas.int.test.ts` → FAIL.

- [ ] **Passo 3: Implementação**

`src/modules/mercado-livre/selos.ts`:
- Imports: `formatarDiaMes`, junto do `formatarDataHora`; `SELO_AFETA_REPUTACAO`, `SELO_FULL`, `SELO_URGENTE` e `type AfetaReputacao`, de `./dominio`.
- Acrescente:

```ts
export type EntradaSelosML = { urgente: boolean | null; afetaReputacao: AfetaReputacao | null; ehFull: boolean | null };

/** §4.5: no cartão, nas listas das etapas e na Busca, só os extras que importam: Urgente, Afeta reputação e Full. */
export function selosExtrasML(e: EntradaSelosML, prazo: Date | null): DadosSelo[] {
  const selos: DadosSelo[] = [];
  if (e.urgente) selos.push({ texto: prazo ? `${SELO_URGENTE} · até ${formatarDiaMes(prazo)}` : SELO_URGENTE, tom: 'erro' });
  if (e.afetaReputacao === 'AFETA') selos.push({ texto: SELO_AFETA_REPUTACAO, tom: 'atencao' });
  if (e.ehFull) selos.push({ texto: SELO_FULL, tom: 'destaque' });
  return selos;
}
```

`src/modules/devolucoes/selos.ts`:
- Importe `selosExtrasML` e `type EntradaSelosML` de `@/modules/mercado-livre/selos`. O `mercado-livre/selos.ts` só importa *tipos* deste arquivo, então não há ciclo em tempo de execução.
- A `Entrada` ganha `/** Extras do ML (integração Bitbrain §4.5). */ ml?: EntradaSelosML | null;`.
- Em `selosDaDevolucao`:
  - logo depois do selo "Não identificada": `if (d.ml) selos.push(...selosExtrasML(d.ml, d.prazoConferenciaCanal));`;
  - a condição do selo de prazo ganha `&& !d.ml?.urgente`.

`busca.ts`:
- Imports: `type AfetaReputacao`, de `@/modules/mercado-livre/dominio`.
- Acima da função:

```ts
/** A reclamação do ML mais recente da devolução (extras e conta; integração Bitbrain). Colunas qualificadas à mão, como as outras subconsultas. */
const DA_ULTIMA_RECLAMACAO = sql`from "reclamacoes_ml" where "reclamacoes_ml"."devolucao_id" = "devolucoes"."id" order by "reclamacoes_ml"."sincronizada_em" desc limit 1`;
```

- `ResumoDevolucao` ganha `/** Nome da conta do Bitbrain (D18); null no modo api. */ contaML?: string | null;`. `OpcoesBusca` ganha `/** Etapas 2 e 3 (extra): urgentes do ML primeiro. */ urgentesPrimeiro?: boolean;`.
- No `select`:

```ts
      mlUrgente: sql<boolean | null>`(select "reclamacoes_ml"."urgente" ${DA_ULTIMA_RECLAMACAO})`,
      mlAfetaReputacao: sql<AfetaReputacao | null>`(select "reclamacoes_ml"."afeta_reputacao" ${DA_ULTIMA_RECLAMACAO})`,
      mlFull: sql<boolean | null>`(select "reclamacoes_ml"."eh_full" ${DA_ULTIMA_RECLAMACAO})`,
      contaML: sql<string | null>`(
        select coalesce("contas_bitbrain"."nome", "reclamacoes_ml"."conta")
        from "reclamacoes_ml"
        left join "contas_bitbrain" on "contas_bitbrain"."empresa" = "reclamacoes_ml"."conta"
        where "reclamacoes_ml"."devolucao_id" = "devolucoes"."id" and "reclamacoes_ml"."conta" is not null
        order by "reclamacoes_ml"."sincronizada_em" desc
        limit 1
      )`,
```

- Na ordem:

```ts
  const base =
    opcoes.ordem === 'chegada'
      ? [asc(devolucoes.recebidaEm), asc(devolucoes.numero)]
      : [sql`${devolucoes.entregueSegundoCanalEm} is null`, desc(devolucoes.numero)];
  const ordem = opcoes.urgentesPrimeiro ? [sql`coalesce((select "reclamacoes_ml"."urgente" ${DA_ULTIMA_RECLAMACAO}), false) desc`, ...base] : base;
```

- No `map`: desestruture também `mlUrgente`, `mlAfetaReputacao` e `mlFull`, e passe `ml: { urgente: mlUrgente, afetaReputacao: mlAfetaReputacao, ehFull: mlFull }` ao `selosDaDevolucao`. O `contaML` segue no `...resto`.

`quadro.ts`: no `buscarDevolucoes` da coluna, acrescente `urgentesPrimeiro: etapa.numero === 2 || etapa.numero === 3`. A página `fluxo/etapa/[numero]/page.tsx` faz o mesmo com `etapa.numero`.

`CartaoDevolucao.tsx`: a 1ª linha passa a ser:

```tsx
      <span className="flex items-center justify-between gap-2">
        <span className="shrink-0 font-mono text-[13px] font-semibold">{d.codigo}</span>
        <span className="min-w-0 truncate text-xs font-semibold text-texto-2" title={canal}>
          {canal}
        </span>
      </span>
```

com `const canal = \`${d.canal ? ROTULO_CANAL[d.canal] : 'Canal a identificar'}${d.contaML ? \` · ${d.contaML}\` : ''}\`;` no começo do componente.

`consultas.ts`:
- Imports: `contasBitbrain` (schema), `sql` (drizzle) e `type ExtrasML`.
- Tipos:
  - `ResultadoNoML` ganha `| { tipo: 'ok_pendente_manual'; em: Date } | { tipo: 'ok_respondido_a_mao'; em: Date }`;
  - `ResumoMLDevolucao` ganha `/** Nome da conta do Bitbrain (ou a empresa); null no modo api. */ conta: string | null;` e `/** Os 5 extras (§4.5); null sem reclamação gravada. */ extras: ExtrasML | null;`.
- `ACOES_RESULTADO` ganha `'ml_resposta_manual_pendente'` e `'ml_ok_respondido_a_mao'`.
- A consulta da reclamação passa a ser:

```ts
  const [reclamacao] = await db
    .select({
      sincronizadaEm: reclamacoesMl.sincronizadaEm,
      conta: sql<string | null>`coalesce(${contasBitbrain.nome}, ${reclamacoesMl.conta})`,
      acaoPendente: reclamacoesMl.acaoPendente,
      urgente: reclamacoesMl.urgente,
      afetaReputacao: reclamacoesMl.afetaReputacao,
      ehFull: reclamacoesMl.ehFull,
      triagemCondicao: reclamacoesMl.triagemCondicao,
      triagemEtapa: reclamacoesMl.triagemEtapa,
      dinheiro: reclamacoesMl.dinheiro,
    })
    .from(reclamacoesMl)
    .leftJoin(contasBitbrain, eq(contasBitbrain.empresa, reclamacoesMl.conta))
    .where(eq(reclamacoesMl.devolucaoId, devolucaoId))
    .orderBy(desc(reclamacoesMl.sincronizadaEm))
    .limit(1);
```

- Na escolha do `resultado`, depois do caso `ml_resultado_sem_vinculo`:

```ts
  } else if (evento?.acao === 'ml_resposta_manual_pendente') {
    resultado = { tipo: 'ok_pendente_manual', em: evento.em };
  } else if (evento?.acao === 'ml_ok_respondido_a_mao') {
    resultado = { tipo: 'ok_respondido_a_mao', em: evento.em };
  }
```

- No retorno: `conta: reclamacao?.conta ?? null` e `extras: reclamacao ? { acaoPendente, urgente, afetaReputacao, ehFull, triagemCondicao, triagemEtapa, dinheiro } : null` (com os valores tirados de `reclamacao`).

`SecaoMercadoLivre.tsx`:
- Imports: `ALERTA_OK` (já está); de `@/modules/mercado-livre/dominio`: `ROTULO_AFETA_REPUTACAO`, `ROTULO_CONDICAO_TRIAGEM`, `ROTULO_DINHEIRO`, `rotuloAcaoML` e `rotuloEtapaTriagem`.
- No `Resultado`, dois casos novos:

```tsx
    case 'ok_pendente_manual':
      return (
        <div className="flex flex-col gap-2">
          <p className={ALERTA_ATENCAO}>Conferência sem problema: falta responder &quot;OK&quot; no ML, à mão.</p>
          {ehGestor && (
            <Link href="/contestacoes" className={`${BOTAO_SECUNDARIO} w-full md:w-auto`}>
              Ir para Contestações ML
            </Link>
          )}
        </div>
      );
    case 'ok_respondido_a_mao':
      return <p className={ALERTA_OK}>&quot;OK&quot; respondido à mão no ML em {formatarDataHora(resultado.em)}.</p>;
```

- No `dl` da devolução vinculada, acrescente `{r.conta && <Dado rotulo="Conta">{r.conta}</Dado>}` logo no começo.
- Depois do `dl` (ainda dentro do `r.vinculada`):

```tsx
          {r.extras && (
            <div className="flex flex-col gap-2 border-t border-borda pt-3">
              <h3 className="text-sm font-bold">
                Mais do Mercado Livre <span className="font-normal text-texto-2">(extra)</span>
              </h3>
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                <Dado rotulo="Urgente">{r.extras.urgente === null ? 'Não informado' : r.extras.urgente ? 'Sim' : 'Não'}</Dado>
                <Dado rotulo="Ação pendente no ML">{rotuloAcaoML(r.extras.acaoPendente)}</Dado>
                <Dado rotulo="Reputação">{r.extras.afetaReputacao ? ROTULO_AFETA_REPUTACAO[r.extras.afetaReputacao] : 'Não informado'}</Dado>
                <Dado rotulo="Full">{r.extras.ehFull === null ? 'Não informado' : r.extras.ehFull ? 'Sim' : 'Não'}</Dado>
                <Dado rotulo="Triagem do ML">
                  {r.extras.triagemCondicao
                    ? `${ROTULO_CONDICAO_TRIAGEM[r.extras.triagemCondicao]}${r.extras.triagemEtapa ? ` (${rotuloEtapaTriagem(r.extras.triagemEtapa)})` : ''}`
                    : 'Não informado'}
                </Dado>
                <Dado rotulo="Dinheiro">{r.extras.dinheiro ? ROTULO_DINHEIRO[r.extras.dinheiro] : 'Não informado'}</Dado>
              </dl>
            </div>
          )}
```

- [ ] **Passo 4:** `npm test && npm run test:int && npm run typecheck && npm run lint` → PASS. Depois rode `npm run test:e2e -- tests/e2e/mercado-livre.spec.ts tests/e2e/fluxo.spec.ts tests/e2e/devolucoes.spec.ts` e `npm run test:e2e:bitbrain` → PASS nos dois projetos. Tire prints em 390×844 do cartão com conta longa e 3 selos e da seção Mercado Livre.

- [ ] **Passo 5: Commit**

```bash
git add src/modules/mercado-livre/selos.ts src/modules/mercado-livre/selos.test.ts src/modules/mercado-livre/consultas.ts src/modules/mercado-livre/consultas.int.test.ts src/modules/devolucoes src/components/CartaoDevolucao.tsx src/components/CartaoDevolucao.test.tsx "src/app/(app)/fluxo" tests/e2e/mercado-livre.spec.ts tests/e2e/bitbrain-devolucoes.spec.ts
git commit -m "feat(ml): selos Urgente, Afeta reputacao e Full, conta no cartao, urgentes primeiro nas etapas 2 e 3 e extras no detalhe

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

