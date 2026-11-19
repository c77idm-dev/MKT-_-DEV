'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { obterDb } from '@/db';
import { exigirPermissao } from '@/modules/auth/servidor';
import { ErroContestacao } from '@/modules/mercado-livre/contestacoes';
import { marcarOkRespondido } from '@/modules/mercado-livre/respostas-manuais';
import type { EstadoOk } from './tipos';

const esquema = z.object({ devolucao: z.uuid() });

/** "Marcar como respondido" (§4.6): limpa o "OK" pendente da devolução. Só o Gestor; o id é validado com zod. */
export async function marcarOkRespondidoAcao(_anterior: EstadoOk, dados: FormData): Promise<EstadoOk> {
  const usuario = await exigirPermissao('administrar');
  const lido = esquema.safeParse({ devolucao: dados.get('devolucao') });
  if (!lido.success) return { erros: ['Pedido inválido.'], ok: null };
  try {
    await marcarOkRespondido(obterDb(), lido.data.devolucao, usuario, new Date());
  } catch (erro) {
    if (erro instanceof ErroContestacao) return { erros: erro.erros, ok: null };
    throw erro;
  }
  revalidatePath('/contestacoes');
  return { erros: [], ok: '"OK" marcado como respondido no ML.' };
}
