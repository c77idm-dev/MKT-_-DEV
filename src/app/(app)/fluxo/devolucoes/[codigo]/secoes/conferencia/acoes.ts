'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { obterDb } from '@/db';
import { ehUuid } from '@/lib/uuid';
import { exigirPermissao } from '@/modules/auth/servidor';
import { iniciarConferencia, liberarTrava } from '@/modules/conferencia/trava';
import { ErroDevolucao } from '@/modules/devolucoes/erros';

export type EstadoSecaoConferencia = { erros: string[] };

const CODIGO_VALIDO = /^DEV-\d+$/;
const NAO_ENCONTRADA: EstadoSecaoConferencia = { erros: ['Devolução não encontrada.'] };

export async function iniciarConferenciaAcao(devolucaoId: string, codigo: string): Promise<EstadoSecaoConferencia> {
  const usuario = await exigirPermissao('operar_devolucoes');
  if (!ehUuid(devolucaoId) || !CODIGO_VALIDO.test(codigo)) return NAO_ENCONTRADA;
  try {
    await iniciarConferencia(obterDb(), devolucaoId, usuario);
  } catch (erro) {
    if (erro instanceof ErroDevolucao) return { erros: [erro.message] };
    throw erro;
  }
  revalidatePath('/fluxo', 'layout');
  redirect(`/fluxo/devolucoes/${codigo}/conferencia`);
}

export async function liberarTravaAcao(devolucaoId: string, codigo: string): Promise<EstadoSecaoConferencia> {
  const usuario = await exigirPermissao('administrar');
  if (!ehUuid(devolucaoId) || !CODIGO_VALIDO.test(codigo)) return NAO_ENCONTRADA;
  try {
    await liberarTrava(obterDb(), devolucaoId, usuario);
  } catch (erro) {
    if (erro instanceof ErroDevolucao) return { erros: [erro.message] };
    throw erro;
  }
  revalidatePath('/fluxo', 'layout');
  redirect(`/fluxo/devolucoes/${codigo}`);
}
