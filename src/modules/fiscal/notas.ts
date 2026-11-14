import { eq } from 'drizzle-orm';
import type { NotaParaEmissao } from '@/conectores/nfe/tipos';
import type { DbOuTx } from '@/db/client';
import { notasFiscais } from '@/db/schema';
import { pode } from '@/modules/auth/permissoes';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { portaLotes } from '@/modules/lotes/porta';
import { ErroFiscal } from './erros';
import { montarNotaDevolucao } from './montar-devolucao';

export type NotaFiscalLinha = typeof notasFiscais.$inferSelect;

export async function obterNota(db: DbOuTx, id: string, opcoes: { travar?: boolean } = {}): Promise<NotaFiscalLinha | null> {
  const consulta = db.select().from(notasFiscais).where(eq(notasFiscais.id, id));
  const [nota] = opcoes.travar ? await consulta.for('update') : await consulta;
  return nota ?? null;
}

/** Contrato §5.7: a montagem é escolhida pelo tipo (também ao reenviar). Remessa = porta de lotes (Fase 5). */
export async function montarNotaParaEmissao(
  db: DbOuTx,
  nota: Pick<NotaFiscalLinha, 'tipo' | 'devolucaoId' | 'loteId'>,
  referencia: string,
): Promise<NotaParaEmissao> {
  if (nota.tipo === 'DEVOLUCAO_VENDA') {
    if (!nota.devolucaoId) throw new ErroFiscal('NF de devolução sem devolução.');
    return montarNotaDevolucao(db, nota.devolucaoId, referencia);
  }
  if (!nota.loteId) throw new ErroFiscal('NF de remessa sem lote.');
  return portaLotes.montarNotaRemessa(db, nota.loteId, referencia);
}

/** Spec §6.9: emitir ou cancelar NF é do Fiscal e do Gestor. */
export function exigirPodeEmitir(usuario: UsuarioSessao): void {
  if (!pode(usuario.perfil, 'gerir_fiscal')) throw new ErroFiscal('Só o Fiscal ou o Gestor emitem, reenviam e cancelam NF.');
}
