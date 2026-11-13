import { asc, eq } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { devolucoes, itensDevolucao } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import type { DevolucaoCriada } from '@/modules/devolucoes/criar';
import type { Canal } from '@/modules/devolucoes/dominio';
import { criarDevolucaoTeste } from './fabricas';

/**
 * Fábricas da Fase 4. O estado que a conferência (Fase 2) produz é gravado direto nas colunas (contrato §5.6),
 * sem chamar código da Fase 2. Não importe aqui nada que use a fila, o armazenamento ou o conector (o e2e importa este arquivo).
 */

export type MotivoProblemaTeste = 'AVARIADO' | 'USADO' | 'DIVERGENTE' | 'INCOMPLETO' | 'COM_DEFEITO' | 'OUTRO';
export type UnidadeEstoqueTeste = {
  sku?: string;
  destino: 'BOM' | 'PROBLEMA' | 'AUSENTE';
  motivo?: MotivoProblemaTeste;
  serial?: string | null;
  eanLido?: string | null;
};
export type DevolucaoNoEstoque = DevolucaoCriada & { itens: { id: string; unidade: number; sku: string }[] };

/** Devolução em AGUARDANDO_NF, uma unidade por entrada de `unidades` (contrato §5.6: casos a, b e c). */
export async function criarDevolucaoNoEstoqueTeste(
  db: DbOuTx,
  usuario: UsuarioSessao,
  opcoes: { unidades: UnidadeEstoqueTeste[]; canal?: Canal; pedido?: string; agora?: Date },
): Promise<DevolucaoNoEstoque> {
  const criada = await criarDevolucaoTeste(db, usuario, {
    ...(opcoes.canal ? { canal: opcoes.canal } : {}),
    ...(opcoes.pedido ? { pedido: opcoes.pedido } : {}),
    itens: opcoes.unidades.map((u) => ({ sku: u.sku ?? 'SKU-TESTE', quantidade: 1 })),
  });
  const itens = await db
    .select({ id: itensDevolucao.id, unidade: itensDevolucao.unidade, sku: itensDevolucao.sku })
    .from(itensDevolucao)
    .where(eq(itensDevolucao.devolucaoId, criada.id))
    .orderBy(asc(itensDevolucao.unidade));
  for (const [i, item] of itens.entries()) {
    const u = opcoes.unidades[i];
    await db
      .update(itensDevolucao)
      .set(
        u.destino === 'AUSENTE'
          ? { status: 'AUSENTE', destino: null, motivo: 'AUSENTE' }
          : {
              status: 'AGUARDANDO_NF',
              destino: u.destino,
              motivo: u.destino === 'PROBLEMA' ? (u.motivo ?? 'AVARIADO') : null,
              serial: u.serial ?? null,
              eanLido: u.eanLido ?? null,
            },
      )
      .where(eq(itensDevolucao.id, item.id));
  }
  const agora = opcoes.agora ?? new Date();
  await db.update(devolucoes).set({ status: 'AGUARDANDO_NF', recebidaEm: agora, conferidaEm: agora }).where(eq(devolucoes.id, criada.id));
  return { ...criada, itens };
}
