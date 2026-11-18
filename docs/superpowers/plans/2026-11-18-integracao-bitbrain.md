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

