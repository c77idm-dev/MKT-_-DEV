import type { Sql } from 'postgres';

export type ResultadoSaude = { status: 'ok' | 'erro'; banco: 'ok' | 'falhou'; fila: 'ok' | 'falhou' };

function comPrazo<T>(promessa: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolver, rejeitar) => {
    const relogio = setTimeout(() => rejeitar(new Error('tempo esgotado')), ms);
    promessa.then(
      (valor) => {
        clearTimeout(relogio);
        resolver(valor);
      },
      (erro: unknown) => {
        clearTimeout(relogio);
        rejeitar(erro);
      },
    );
  });
}

/** Spec §11: o /saude verifica o banco e a fila. Cada verificação tem um prazo, para o /saude nunca travar. */
export async function verificarSaude(sql: Sql, verificarFila: () => Promise<void>, prazoMs = 5000): Promise<ResultadoSaude> {
  const banco = await comPrazo(Promise.resolve(sql`select 1`), prazoMs).then(
    () => 'ok' as const,
    () => 'falhou' as const,
  );
  const fila = await comPrazo(verificarFila(), prazoMs).then(
    () => 'ok' as const,
    () => 'falhou' as const,
  );
  return { status: banco === 'ok' && fila === 'ok' ? 'ok' : 'erro', banco, fila };
}
