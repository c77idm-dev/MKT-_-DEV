'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { obterDb } from '@/db';
import { exigirPermissao } from '@/modules/auth/servidor';
import { ErroRetirada } from '@/modules/retiradas/erros';
import { criarRetirada } from '@/modules/retiradas/retiradas';

export type EstadoNovaRetirada = { erro: string | null };

/**
 * Abre a retirada do Full (melhoria 3) pelo cartão "Rastreio não encontrado" do Recebimento ou pelo atalho
 * "Retirada do Full". A mesma etiqueta com uma retirada aberta volta para ela.
 */
export async function criarRetiradaAcao(_anterior: EstadoNovaRetirada, dados: FormData): Promise<EstadoNovaRetirada> {
  const usuario = await exigirPermissao('operar_devolucoes');
  let codigo: string;
  try {
    codigo = (await criarRetirada(obterDb(), String(dados.get('codigoEtiqueta') ?? ''), usuario)).codigo;
  } catch (erro) {
    if (erro instanceof ErroRetirada) return { erro: erro.message };
    throw erro;
  }
  revalidatePath('/fluxo/retiradas-full');
  redirect(`/fluxo/retiradas-full/${codigo}`);
}
