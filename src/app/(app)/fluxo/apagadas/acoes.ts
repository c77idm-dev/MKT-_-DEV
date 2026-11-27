'use server';

import { revalidatePath } from 'next/cache';
import { obterDb } from '@/db';
import { exigirPermissao } from '@/modules/auth/servidor';
import { restaurarDevolucao } from '@/modules/devolucoes/correcoes';
import { ErroDevolucao } from '@/modules/devolucoes/erros';
import { restaurarRetirada } from '@/modules/retiradas/correcoes';
import { ErroRetirada } from '@/modules/retiradas/erros';

export type ResultadoRestaurar = { ok: true; aviso: string | null } | { ok: false; mensagem: string };

/**
 * "Restaurar" da lista Apagadas (extra, emenda E29): limpa a marca, e a devolução ou a retirada volta exatamente para
 * onde estava. Só o Gestor; as regras (a expurgada não volta) ficam nos serviços.
 */
export async function restaurarAcao(tipo: string, id: string): Promise<ResultadoRestaurar> {
  const usuario = await exigirPermissao('administrar');
  let aviso: string | null = null;
  try {
    if (tipo === 'devolucao') aviso = (await restaurarDevolucao(obterDb(), String(id), usuario)).aviso;
    else if (tipo === 'retirada') await restaurarRetirada(obterDb(), String(id), usuario);
    else return { ok: false, mensagem: 'Não encontrado.' };
  } catch (erro) {
    if (erro instanceof ErroDevolucao || erro instanceof ErroRetirada) return { ok: false, mensagem: erro.message };
    throw erro;
  }
  revalidatePath('/fluxo', 'layout');
  return { ok: true, aviso };
}
