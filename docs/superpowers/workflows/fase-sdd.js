export const meta = {
  name: 'fase-sdd',
  description: 'Executa as tarefas de uma fase numa worktree: implementar, revisar, corrigir e enviar ao GitHub',
  whenToUse: 'Times paralelos das Fases 2 a 4 do sistema de devoluções',
  phases: [{ title: 'Tarefas', detail: 'implementar → revisar → corrigir (até 2 rodadas) → push' }],
}

const A = args
const RAIZ = '/c/Users/idmpc/Dvoluções Markt'
const SDD = RAIZ + '/.superpowers/sdd/fases-2-6'

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
    problemas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          gravidade: { type: 'string', enum: ['CRITICO', 'IMPORTANTE', 'MENOR'] },
          onde: { type: 'string' },
          oque: { type: 'string' },
          correcao: { type: 'string' },
        },
        required: ['gravidade', 'oque'],
      },
    },
    resumo: { type: 'string' },
  },
  required: ['veredito', 'problemas', 'resumo'],
}

const LOCAL = `Where you work: ONLY in the git worktree ${A.pasta} (branch ${A.branch}; its .env sets the test DB ${A.bancoTeste} and PORTA_E2E=${A.porta}).
- The shell returns to the main repo on every call, so EVERY Bash command must start with: cd "${A.pasta}" && ...
- EVERY Read, Edit and Write uses an absolute path that starts with ${A.pasta}/.
- NEVER edit files under "${RAIZ}". That is main, plus files shared with the other teams working in parallel. The single exception is the report file you are told to write under ${SDD}.
- Never push. Never touch another worktree or database.
First read the shared rules: ${SDD}/contexto-comum.md (stack, mobile-first, the environment hook, the report contract). The binding contract is ${A.pasta}/docs/superpowers/plans/2026-11-12-contrato-fases-2-6.md (§3 frozen files, §10 amendments E1–E17).`

function graves(r) {
  return (r && r.problemas ? r.problemas : []).filter((p) => p.gravidade !== 'MENOR')
}
function texto(ps) {
  return ps.map((p, i) => `${i + 1}. [${p.gravidade}] ${p.onde || ''}: ${p.oque}${p.correcao ? ' -> fix: ' + p.correcao : ''}`).join('\n')
}

phase('Tarefas')
const resultado = []
for (const n of A.tarefas) {
  const brief = `${SDD}/${A.pref}-task-${n}-brief.md`
  const relatorio = `${SDD}/${A.pref}-task-${n}-report.md`

  const impl = await agent(
    `You are the implementer of Phase ${A.fase}, Task ${n}, of a returns-management system (Next.js 16, Drizzle, Postgres, Playwright). The system is mobile-first: the user said "esse sistema é focado para celular então ele tem que ficar perfeito para o usuário final".
${LOCAL}
Your task brief (the spec): ${brief}. Follow it step by step with TDD. Each test must show RED before GREEN, and you paste that output in the report.
Before you start, record BASE = the output of: cd "${A.pasta}" && git rev-parse --short HEAD
If the repo differs from the brief, make the smallest change that keeps the brief's intent and report it.
Before finishing, run: npm test, npm run test:int, npm run typecheck, npm run lint, and npm run test:e2e (Playwright on port ${A.porta}). Leave no process running.
Commit to ${A.branch}. Each commit message ends with: Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Write the full report to ${relatorio}.
Return: status, base, head (git rev-parse --short HEAD after your commits), commits (sha + subject), a one-line test summary, and concerns.`,
    { label: `F${A.fase} T${n} implementar`, phase: 'Tarefas', model: 'sonnet', schema: IMPL },
  )
  if (!impl || impl.status === 'BLOCKED' || impl.status === 'NEEDS_CONTEXT') {
    resultado.push({ tarefa: n, parado: true, motivo: impl ? `${impl.status}: ${impl.preocupacoes || ''}` : 'implementer died' })
    return { fase: A.fase, concluidas: resultado.filter((r) => !r.parado).map((r) => r.tarefa), resultado }
  }

  let rev = await agent(
    `You are the task reviewer for Phase ${A.fase}, Task ${n}, of a returns-management system.
${LOCAL}
This review is READ-ONLY: no edits, no commits. You may run npm test and npm run test:int in the worktree, but do not run e2e.
Review the change: cd "${A.pasta}" && git diff ${impl.base}..${impl.head}  (also: git log ${impl.base}..${impl.head})
The spec is the brief ${brief}. The binding contract is §3, §5 and §10.
The implementer's report is ${relatorio}. Treat its claims as claims, not facts: verify them.
Check:
- correctness and edge cases;
- concurrency, and DB transactions around state changes and history events;
- security: exigirPermissao before any DB read, server-side validation of bound args, no secrets or personal data in logs;
- contract names and the frozen files (did it edit a frozen file?);
- the mobile-first rules: 390x844 with no horizontal scroll, cards, 44 px touch targets, focused errors, role=status feedback, contrast;
- the exact PDF/spec names;
- test quality: would the tests fail if the behavior broke?
- scope creep.
Classify each issue: CRITICO, IMPORTANTE or MENOR, with where, what and a concrete fix.
Verdict APROVADO only if there are no CRITICO and no IMPORTANTE issues.`,
    { label: `F${A.fase} T${n} revisar`, phase: 'Tarefas', model: 'sonnet', schema: REV },
  )

  let head = impl.head
  let rodada = 0
  while (rev && graves(rev).length > 0 && rodada < 2) {
    rodada++
    const fix = await agent(
      `You are fixing review findings for Phase ${A.fase}, Task ${n} (fix round ${rodada}), of a returns-management system.
${LOCAL}
The task brief (the spec) is ${brief}. Your previous work is commits ${impl.base}..${head}.
Fix ALL of these CRITICO and IMPORTANTE findings with TDD (show RED, then GREEN). If a finding is wrong, explain why in the report instead of changing the code.
${texto(graves(rev))}
Run npm test, npm run test:int, npm run typecheck, npm run lint and npm run test:e2e. Leave no process running.
Commit to ${A.branch}. Each commit message ends with: Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Append a "Fix round ${rodada}" section to ${relatorio}.
Return: status, base (${head}), head, commits, tests, concerns.`,
      { label: `F${A.fase} T${n} corrigir ${rodada}`, phase: 'Tarefas', model: 'sonnet', schema: IMPL },
    )
    if (!fix || fix.status === 'BLOCKED' || fix.status === 'NEEDS_CONTEXT') {
      resultado.push({ tarefa: n, parado: true, motivo: fix ? `fix ${fix.status}: ${fix.preocupacoes || ''}` : 'fixer died', problemas: graves(rev) })
      return { fase: A.fase, concluidas: resultado.filter((r) => !r.parado).map((r) => r.tarefa), resultado }
    }
    const antes = head
    head = fix.head
    rev = await agent(
      `You are re-reviewing a fix round for Phase ${A.fase}, Task ${n}, of a returns-management system.
${LOCAL}
This review is READ-ONLY. You may run npm test and npm run test:int; do not run e2e. Make no edits and no commits.
Look at the fix diff: cd "${A.pasta}" && git diff ${antes}..${head}
These findings had to be fixed:
${texto(graves(rev))}
For each one, check that it is resolved, or that the fixer's explanation in the "Fix round ${rodada}" section of ${relatorio} is valid.
Also report any NEW CRITICO or IMPORTANTE breakage the fix introduced.
Verdict APROVADO only if every finding is resolved and nothing new is serious.`,
      { label: `F${A.fase} T${n} re-revisar ${rodada}`, phase: 'Tarefas', model: 'haiku', schema: REV },
    )
  }

  if (!rev || graves(rev).length > 0) {
    resultado.push({ tarefa: n, parado: true, motivo: 'still has serious findings after 2 fix rounds', problemas: rev ? graves(rev) : [] })
    return { fase: A.fase, concluidas: resultado.filter((r) => !r.parado).map((r) => r.tarefa), resultado }
  }

  const menores = (rev.problemas || []).filter((p) => p.gravidade === 'MENOR')
  await agent(
    `Two mechanical steps for Phase ${A.fase}. Do not change any code.
1) Run exactly: cd "${A.pasta}" && git push -q origin ${A.branch}
   If the push fails, retry it once. Report the error only if the retry also fails.
2) Append these lines to the ledger file ${SDD}/progress-${A.pref}.md (create it if missing; use Bash with a heredoc and >>):
Task ${n}: complete (commits ${impl.base}..${head}, fix rounds: ${rodada}). Implementer concerns: ${(impl.preocupacoes || 'none').replace(/\n/g, ' ')}
Task ${n}: minor (deferred): ${menores.length ? texto(menores).replace(/\n/g, ' | ') : 'none'}
Return "ok", or the push error.`,
    { label: `F${A.fase} T${n} push`, phase: 'Tarefas', model: 'haiku', effort: 'low' },
  )
  resultado.push({ tarefa: n, base: impl.base, head, rodadas: rodada, menores })
  log(`Phase ${A.fase}: task ${n} done (${rodada} fix rounds)`)
}
return { fase: A.fase, concluidas: resultado.map((r) => r.tarefa), resultado }
