function codigoDoErro(x: unknown): unknown {
  return typeof x === 'object' && x !== null && 'code' in x ? (x as { code?: unknown }).code : undefined;
}

/** 23505 = unique_violation. Versões recentes do Drizzle embrulham o erro do driver em `cause`. */
export function ehViolacaoDeUnicidade(erro: unknown): boolean {
  const causa = typeof erro === 'object' && erro !== null ? (erro as { cause?: unknown }).cause : undefined;
  return codigoDoErro(erro) === '23505' || codigoDoErro(causa) === '23505';
}
