export const meta = {
  name: 'fase-final',
  description: 'Revisão final de uma fase (servidor e telas), rodada de correções, re-revisão e envio ao GitHub',
  whenToUse: 'Fim de cada fase (2 a 4) do sistema de devoluções, antes da Integração',
  phases: [
    { title: 'Revisão final', detail: 'servidor e telas em paralelo, sobre todo o diff da fase' },
    { title: 'Correções', detail: 'servidor, depois telas; até 2 rodadas com re-revisão' },
    { title: 'Envio', detail: 'push da branch e registro no ledger' },
  ],
}

const A = args
const RAIZ = '/c/Users/idmpc/Dvoluções Markt'
const SDD = RAIZ + '/.superpowers/sdd/fases-2-6'
const LEDGER = `${SDD}/progress-${A.pref}.md`

const ITEM = {
  type: 'object',
  properties: {
    gravidade: { type: 'string', enum: ['CRITICO', 'IMPORTANTE', 'MENOR'] },
    onde: { type: 'string' },
    oque: { type: 'string' },
    correcao: { type: 'string' },
  },
  required: ['gravidade', 'onde', 'oque', 'correcao'],
}
const FINAL = {
  type: 'object',
  properties: {
    corrigir: { type: 'array', items: ITEM },
    deixar: {
      type: 'array',
      items: { type: 'object', properties: { onde: { type: 'string' }, oque: { type: 'string' }, motivo: { type: 'string' } }, required: ['oque', 'motivo'] },
    },
    resumo: { type: 'string' },
  },
  required: ['corrigir', 'deixar', 'resumo'],
}
const IMPL = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['DONE', 'DONE_WITH_CONCERNS', 'BLOCKED', 'NEEDS_CONTEXT'] },
    base: { type: 'string' },
    head: { type: 'string' },
    commits: { type: 'array', items: { type: 'string' } },
    testes: { type: 'string' },
    preocupacoes: { type: 'string' },
  },
  required: ['status', 'base', 'head', 'testes'],
}
const REV = {
  type: 'object',
  properties: {
    veredito: { type: 'string', enum: ['APROVADO', 'PRECISA_CORRIGIR'] },
    problemas: { type: 'array', items: ITEM },
    resumo: { type: 'string' },
  },
  required: ['veredito', 'problemas', 'resumo'],
}

const LOCAL = `Where you work: ONLY in the git worktree ${A.pasta} (branch ${A.branch}; its .env sets the test DB ${A.bancoTeste} and PORTA_E2E=${A.porta}).
- The shell returns to the main repo on every call, so EVERY Bash command must start with: cd "${A.pasta}" && ...
- EVERY Read, Edit and Write uses an absolute path that starts with ${A.pasta}/.
- NEVER edit files under "${RAIZ}" (main, shared with the other teams working in parallel), except the report file you are told to write under ${SDD}.
- Never push. Never touch another worktree or database.
First read the shared rules: ${SDD}/contexto-comum.md (stack, mobile-first, the environment hook, the report contract). The binding contract is ${A.pasta}/docs/superpowers/plans/2026-11-12-contrato-fases-2-6.md (§3 frozen files, §10 amendments E1–E17). The phase plan is ${A.pasta}/${A.plano}. The spec is ${A.pasta}/docs/superpowers/specs/2026-11-11-gestao-devolucoes-design.md.`

const DECISOES = `Rulings already made by the controller (do NOT flag these):
- Mentions of the Bitbrain ERP in UI text are CORRECT (spec §8 and §8.7: the NF de venda XML is downloaded from Bitbrain; the ZIP is imported into Bitbrain; the series must not collide with Bitbrain's). The project rule is only "no bitbrain domain or branding for this system".
- The Inscrição Estadual accepting "ISENTO" is a pending decision for the user. Do not change that rule.
- The Integração task (merge main, regenerate migrations, merge into main) is out of scope here; it runs later in merge order 2 → 3 → 4. Do not renumber migrations.
- Real accounts (ML, Focus NFe, B2) are connected at the end; fakes stay (contract E1).
${A.decisoes || ''}`

const METADES = [
  {
    chave: 'servidor',
    titulo: 'SERVER half',
    foco: `Everything that runs on the server: src/modules/**, src/conectores/**, src/db/**, drizzle/**, src/app/api/**, the queue/worker jobs, and every Server Action file ('use server', e.g. acoes*.ts) for permission and validation.
Check: correctness and edge cases across tasks (the tasks were reviewed one by one, so look for what only shows up in the whole: inconsistent states between modules, missing state transitions, events/history, idempotency of queue jobs and retries, transactions and races around state changes, external calls outside transactions); security (exigirPermissao before any DB read in every page/action/route, server-side validation of every bound arg with zod/uuid, no secrets or personal data in logs, LGPD); contract names and frozen files (git diff ${A.base}..HEAD --stat, compare with contract §3); test quality (would the tests fail if the behavior broke?).`,
  },
  {
    chave: 'telas',
    titulo: 'UI half',
    foco: `Everything the user sees: pages (page.tsx, layout, loading/error) and client components under src/app/** and src/components/**, plus tests/e2e/**.
The system is MOBILE-FIRST; the user said "esse sistema é focado para celular então ele tem que ficar perfeito para o usuário final". Check at 390x844: no horizontal scroll, long text wraps (min-w-0 in flex/grid), cards not tables, single-column forms with the sticky RodapeFormulario, touch targets >= 44 px, nothing hover-only, errors via useEnvioFormulario + ListaErros (focused), success feedback in role="status", contrast >= 4.5:1 and control borders >= 3:1, destructive actions need confirmation (a mis-tap on a phone must not destroy data), loading/pending states on buttons, the flow makes sense for an operator on a phone. Also: exact PDF/spec names for stages, evidences and filters; additions marked "(extra)"; a11y (labels, headings, focus); e2e covers both projects computador and celular for each new screen.
You MAY run the phase's e2e specs (npm run test:e2e -- <spec files>) to see real behavior; leave no process running.`,
  },
]

function texto(ps) {
  return ps.map((p, i) => `${i + 1}. [${p.gravidade}] ${p.onde || ''}: ${p.oque}${p.correcao ? ' -> fix: ' + p.correcao : ''}`).join('\n')
}
function graves(r) {
  return (r && r.problemas ? r.problemas : []).filter((p) => p.gravidade !== 'MENOR')
}

phase('Revisão final')
const revisoes = await parallel(
  METADES.map((m) => () =>
    agent(
      `You are the END-OF-PHASE final reviewer (${m.titulo}) for Phase ${A.fase} of a returns-management system (Next.js 16, Drizzle, Postgres, Playwright).
${LOCAL}
This review is READ-ONLY: no edits, no commits. You may run npm test and npm run test:int.
The whole phase is: cd "${A.pasta}" && git diff ${A.base}..HEAD   (git log --oneline ${A.base}..HEAD lists the tasks).
Your focus:
${m.foco}
The per-task reviewers left deferred MENOR items in the ledger ${LEDGER}. For each deferred item in YOUR half, decide: fix now (put it in "corrigir") or leave (put it in "deixar" with a one-line reason). Fix now anything that can corrupt data, leave the system in a stuck state, leak data, break on a phone, or would let a regression pass silently in a central rule. Leave cosmetic items and speculative hardening.
${DECISOES}
Write your full review to ${SDD}/${A.pref}-final-${m.chave}.md.
Return "corrigir" (each with gravidade CRITICO|IMPORTANTE|MENOR, onde = file and function, oque, and a concrete correcao), "deixar" (onde, oque, motivo) and a short "resumo". Be concrete and verify each claim in the code before listing it.`,
      { label: `F${A.fase} revisão final: ${m.chave}`, phase: 'Revisão final', schema: FINAL },
    ).then((r) => ({ ...m, r })),
  ),
)

const ok = revisoes.filter((x) => x && x.r)
if (ok.length < METADES.length) {
  return { fase: A.fase, parado: true, motivo: 'a final reviewer died', revisoes: ok.map((x) => ({ metade: x.chave, ...x.r })) }
}

phase('Correções')
let head = null
const correcoes = []
for (const x of ok) {
  if (!x.r.corrigir.length) continue
  const rel = `${SDD}/${A.pref}-final-${x.chave}-correcoes.md`
  const fix = await agent(
    `You are fixing the END-OF-PHASE review findings (${x.titulo}) for Phase ${A.fase} of a returns-management system.
${LOCAL}
The full review is ${SDD}/${A.pref}-final-${x.chave}.md. Fix ALL of these items with TDD (show RED, then GREEN). If an item is wrong after you check the code, explain why in your report instead of changing the code.
${texto(x.r.corrigir)}
${DECISOES}
Record BASE = cd "${A.pasta}" && git rev-parse --short HEAD before you start.
Before finishing, run: npm test, npm run test:int, npm run typecheck, npm run lint and npm run test:e2e (Playwright on port ${A.porta}). Leave no process running.
Commit to ${A.branch} in small commits (one per theme). Each commit message ends with: Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Write the report to ${rel}.
Return: status, base, head, commits, a one-line test summary, concerns.`,
    { label: `F${A.fase} corrigir: ${x.chave}`, phase: 'Correções', model: 'sonnet', schema: IMPL },
  )
  if (!fix || fix.status === 'BLOCKED' || fix.status === 'NEEDS_CONTEXT') {
    return { fase: A.fase, parado: true, motivo: fix ? `fix ${x.chave} ${fix.status}: ${fix.preocupacoes || ''}` : `fixer ${x.chave} died`, revisoes: ok.map((y) => ({ metade: y.chave, ...y.r })), correcoes }
  }
  correcoes.push({ metade: x.chave, base: fix.base, head: fix.head, testes: fix.testes, preocupacoes: fix.preocupacoes || '' })
  head = fix.head
}

let rodadas = 0
let rev = null
if (correcoes.length) {
  const todos = ok.flatMap((x) => x.r.corrigir)
  const base0 = correcoes[0].base
  rev = await agent(
    `You are re-reviewing the end-of-phase fixes for Phase ${A.fase} of a returns-management system.
${LOCAL}
This review is READ-ONLY. You may run npm test and npm run test:int; do not run e2e. Make no edits and no commits.
The fix diff: cd "${A.pasta}" && git diff ${base0}..${head}
These items had to be fixed:
${texto(todos)}
The fixers' reports: ${correcoes.map((c) => `${SDD}/${A.pref}-final-${c.metade}-correcoes.md`).join(', ')}.
For each item, check that it is resolved, or that the fixer's explanation is valid. Also report any NEW CRITICO or IMPORTANTE breakage the fixes introduced.
Verdict APROVADO only if every CRITICO/IMPORTANTE item is resolved and nothing new is serious. List unresolved MENOR items as MENOR.`,
    { label: `F${A.fase} re-revisar`, phase: 'Correções', model: 'sonnet', schema: REV },
  )
  while (rev && graves(rev).length > 0 && rodadas < 2) {
    rodadas++
    const antes = head
    const fix = await agent(
      `You are fixing re-review findings for Phase ${A.fase} (end-of-phase, round ${rodadas}) of a returns-management system.
${LOCAL}
Fix ALL of these with TDD (RED, then GREEN). If one is wrong, explain why in the report instead of changing code.
${texto(graves(rev))}
${DECISOES}
Run npm test, npm run test:int, npm run typecheck, npm run lint and npm run test:e2e. Leave no process running.
Commit to ${A.branch}. Each commit message ends with: Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Append a "Round ${rodadas}" section to ${SDD}/${A.pref}-final-correcoes-rodadas.md.
Return: status, base (${antes}), head, commits, tests, concerns.`,
      { label: `F${A.fase} corrigir rodada ${rodadas}`, phase: 'Correções', model: 'sonnet', schema: IMPL },
    )
    if (!fix || fix.status === 'BLOCKED' || fix.status === 'NEEDS_CONTEXT') {
      return { fase: A.fase, parado: true, motivo: fix ? `round ${rodadas} ${fix.status}: ${fix.preocupacoes || ''}` : 'round fixer died', pendentes: graves(rev), correcoes }
    }
    head = fix.head
    rev = await agent(
      `You are re-reviewing round ${rodadas} of end-of-phase fixes for Phase ${A.fase}.
${LOCAL}
READ-ONLY; you may run npm test and npm run test:int. Fix diff: cd "${A.pasta}" && git diff ${antes}..${head}
These had to be fixed:
${texto(graves(rev))}
Check each is resolved (or the explanation in ${SDD}/${A.pref}-final-correcoes-rodadas.md is valid) and that nothing new is serious.`,
      { label: `F${A.fase} re-revisar ${rodadas}`, phase: 'Correções', model: 'sonnet', schema: REV },
    )
  }
  if (!rev || graves(rev).length > 0) {
    return { fase: A.fase, parado: true, motivo: 'serious findings remain after the end-of-phase fix rounds', pendentes: rev ? graves(rev) : [], correcoes }
  }
}

phase('Envio')
const deixados = ok.flatMap((x) => x.r.deixar.map((d) => `${x.chave}: ${d.onde || ''} ${d.oque} (${d.motivo})`))
const restantes = rev ? (rev.problemas || []).filter((p) => p.gravidade === 'MENOR') : []
await agent(
  `Two mechanical steps for Phase ${A.fase}. Do not change any code.
1) Run exactly: cd "${A.pasta}" && git push -q origin ${A.branch}
   If the push fails, retry once. Report the error only if the retry also fails.
2) Append these lines to ${LEDGER} (use Bash with a heredoc and >>):
Final review: done (fixes ${correcoes.map((c) => `${c.metade} ${c.base}..${c.head}`).join(', ') || 'none needed'}, extra rounds: ${rodadas}). Fixed ${ok.reduce((s, x) => s + x.r.corrigir.length, 0)} items.
Final review: left on purpose: ${deixados.length ? deixados.join(' | ').replace(/\n/g, ' ') : 'none'}
Final review: minor left after re-review: ${restantes.length ? texto(restantes).replace(/\n/g, ' | ') : 'none'}
Return "ok", or the push error.`,
  { label: `F${A.fase} push final`, phase: 'Envio', model: 'haiku', effort: 'low' },
)
return {
  fase: A.fase,
  aprovado: true,
  head,
  rodadas,
  corrigidos: ok.map((x) => ({ metade: x.chave, itens: x.r.corrigir.map((p) => `[${p.gravidade}] ${p.onde}: ${p.oque}`) })),
  deixados,
  restantes,
  resumos: ok.map((x) => ({ metade: x.chave, resumo: x.r.resumo })),
}
