const SEM_DETALHES = 'Sem detalhes do erro.';
const LIMITE = 500;
const TEMPO_ESGOTADO = 'Tempo esgotado';
// O pg-boss 12.38.0 também aborta o manipulador que passa do limite, com esta mensagem.
const ESTOURO_NO_MANIPULADOR = /^handler execution exceeded \d+s$/;

function textoBruto(saida: unknown): string {
  if (saida === null || saida === undefined || saida === '') return SEM_DETALHES;
  if (typeof saida === 'string') return saida;
  if (typeof saida === 'object') {
    const o = saida as { message?: unknown; value?: unknown };
    // Formato do tempo esgotado do pg-boss: { value: { message: 'job timed out' } }.
    if (o.value && typeof o.value === 'object') {
      const m = (o.value as { message?: unknown }).message;
      if (typeof m === 'string') return m === 'job timed out' ? TEMPO_ESGOTADO : m;
    }
    if (typeof o.message === 'string') return ESTOURO_NO_MANIPULADOR.test(o.message) ? TEMPO_ESGOTADO : o.message;
  }
  try {
    return JSON.stringify(saida) ?? SEM_DETALHES;
  } catch {
    return SEM_DETALHES;
  }
}

/** Texto curto e seguro para guardar/mostrar: só a mensagem, sem pilha nem caracteres de controle, até 500 caracteres. */
export function mensagemDoErro(saida: unknown): string {
  const limpo = textoBruto(saida).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
  if (limpo === '') return SEM_DETALHES;
  return limpo.length > LIMITE ? `${limpo.slice(0, LIMITE - 1)}…` : limpo;
}

/** Uma linha JSON por erro de requisição do web (decisão 18): sem query, cabeçalhos nem pilha. */
export function linhaErroRequisicao(
  erro: unknown,
  req: { path: string; method: string },
  ctx: { routePath: string; routeType: string },
  agora: Date,
): string {
  const digest =
    typeof erro === 'object' && erro !== null && 'digest' in erro && (erro as { digest?: unknown }).digest != null
      ? String((erro as { digest: unknown }).digest)
      : undefined;
  return JSON.stringify({
    em: agora.toISOString(),
    nivel: 'erro',
    origem: 'web',
    caminho: req.path.split('?')[0],
    metodo: req.method,
    rota: ctx.routePath,
    tipo: ctx.routeType,
    mensagem: mensagemDoErro(erro),
    ...(digest !== undefined ? { digest } : {}),
  });
}
