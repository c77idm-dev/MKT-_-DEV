'use server';

import { revalidatePath } from 'next/cache';
import type { EstadoFalhas } from '@/components/acabamento/tipos';
import { obterDb } from '@/db';
import { ehUuid } from '@/lib/uuid';
import { ROTULO_TAREFA } from '@/modules/acabamento/dominio';
import { dispensarFalha, ErroFalhas, reenviarFalha } from '@/modules/acabamento/falhas';
import { exigirPermissao } from '@/modules/auth/servidor';

/** Spec §6.8: "Tentar de novo" (reenviar) e (extra) "Dispensar". */
export async function acaoFalha(_anterior: EstadoFalhas, dados: FormData): Promise<EstadoFalhas> {
  const usuario = await exigirPermissao('administrar');
  const operacao = dados.get('operacao');
  const falha = dados.get('falha');
  if ((operacao !== 'reenviar' && operacao !== 'dispensar') || typeof falha !== 'string' || !ehUuid(falha)) {
    return { erros: ['Pedido inválido.'], ok: null };
  }
  try {
    const db = obterDb();
    let ok: string;
    if (operacao === 'reenviar') {
      const { tarefa } = await reenviarFalha(db, falha, usuario);
      ok = `Tarefa "${ROTULO_TAREFA[tarefa]}" reenviada. Ela roda em instantes.`;
    } else {
      await dispensarFalha(db, falha, usuario);
      ok = 'Falha dispensada.';
    }
    revalidatePath('/configuracoes/falhas');
    return { erros: [], ok };
  } catch (erro) {
    if (erro instanceof ErroFalhas) return { erros: [erro.message], ok: null };
    throw erro;
  }
}
