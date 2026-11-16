import type { DbOuTx } from '@/db/client';
import { itensRetiradaFull, retiradasFull } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';

/**
 * Melhoria 4: retirada do Full gravada direto no banco (o estado que a melhoria 3 deixa), sem a foto da etiqueta.
 * Não importe aqui nada que use a fila, o armazenamento ou o conector (o e2e importa este arquivo).
 */
export type ItemRetiradaTeste = { produtoId?: string | null; eanLido?: string | null; descricao?: string | null; quantidade: number };

export async function criarRetiradaTeste(
  db: DbOuTx,
  usuario: UsuarioSessao,
  opcoes: { itens: ItemRetiradaTeste[]; concluidaEm?: Date | null; etiqueta?: string },
): Promise<{ id: string; codigo: string }> {
  const concluidaEm = opcoes.concluidaEm ?? null;
  const [r] = await db
    .insert(retiradasFull)
    .values({
      codigoEtiqueta: opcoes.etiqueta ?? `FULL-TESTE-${Date.now().toString(36)}`,
      recebidaPor: usuario.id,
      recebidaEm: concluidaEm ?? new Date(),
      situacao: concluidaEm ? 'CONFERIDA' : 'ABERTA',
      concluidaEm,
    })
    .returning({ id: retiradasFull.id, codigo: retiradasFull.codigo });
  for (const item of opcoes.itens) {
    await db.insert(itensRetiradaFull).values({
      retiradaId: r.id,
      produtoId: item.produtoId ?? null,
      eanLido: item.eanLido ?? null,
      descricao: item.descricao ?? null,
      quantidade: item.quantidade,
    });
  }
  return r;
}
