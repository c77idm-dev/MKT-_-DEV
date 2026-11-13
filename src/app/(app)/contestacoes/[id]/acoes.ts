'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { obterDb } from '@/db';
import { textoDoForm } from '@/lib/formulario';
import { ehUuid } from '@/lib/uuid';
import { exigirPermissao } from '@/modules/auth/servidor';
import { obterFila } from '@/modules/fila/fila';
import { ErroContestacao, revisarEEnviar } from '@/modules/mercado-livre/contestacoes';

export type EstadoEnvio = { erros: string[] };

/** "Enviar ao ML" (spec §6.6). O `id` chega ligado (bind) do cliente: confere o formato antes de usar. */
export async function enviarAcao(id: string, _anterior: EstadoEnvio, dados: FormData): Promise<EstadoEnvio> {
  const usuario = await exigirPermissao('administrar');
  if (!ehUuid(id)) return { erros: ['Contestação não encontrada.'] };
  try {
    await revisarEEnviar(
      obterDb(),
      obterFila(),
      id,
      {
        motivo: textoDoForm(dados, 'motivo'),
        mensagem: textoDoForm(dados, 'mensagem'),
        evidencias: dados.getAll('foto').filter((v): v is string => typeof v === 'string'),
      },
      usuario,
      new Date(),
    );
  } catch (erro) {
    if (erro instanceof ErroContestacao) return { erros: erro.erros };
    throw erro;
  }
  revalidatePath('/contestacoes');
  redirect(`/contestacoes/${id}?ok=solicitado`);
}
