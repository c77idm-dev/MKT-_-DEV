import type { Db } from '@/db/client';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import type { FilaMemoria } from '@/modules/fila/fila';
import { solicitarEmissao } from '@/modules/fiscal/emissao';
import { inserirNotaVendaTeste } from './fabricas-fiscal';
import { rodarTarefasFiscais } from './fila-fiscal';

/**
 * Só integração (usa a fila): grava a NF de venda, pede a NF de devolução e roda as tarefas fiscais até a autorização.
 * A autorização chama a porta de lotes, que aloca as unidades PROBLEMA.
 */
export async function autorizarDevolucaoTeste(
  db: Db,
  fila: FilaMemoria,
  p: { devolucaoId: string; codigosVenda: string[]; fiscal: UsuarioSessao; agora: Date },
): Promise<{ notaFiscalId: string }> {
  const quantidades = new Map<string, number>();
  for (const codigo of p.codigosVenda) quantidades.set(codigo, (quantidades.get(codigo) ?? 0) + 1);
  const itens = [...quantidades].map(([codigo, quantidade]) => ({ codigo, quantidade }));
  await inserirNotaVendaTeste(db, p.devolucaoId, { itens });
  const { notaFiscalId } = await solicitarEmissao(db, { tipo: 'DEVOLUCAO_VENDA', devolucaoId: p.devolucaoId }, p.fiscal);
  await rodarTarefasFiscais(db, fila, p.agora);
  return { notaFiscalId };
}
