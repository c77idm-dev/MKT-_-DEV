'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { obterDb } from '@/db';
import { textoDoForm } from '@/lib/formulario';
import { ehUuid } from '@/lib/uuid';
import { exigirPermissao } from '@/modules/auth/servidor';
import { obterFila } from '@/modules/fila/fila';
import { ErroContestacao, revisarEEnviar } from '@/modules/mercado-livre/contestacoes';
import { marcarContestacaoRespondida } from '@/modules/mercado-livre/respostas-manuais';

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

const esquemaId = z.uuid();

/** "Marcar como respondida" (extra, modo bitbrain §4.6). O `id` chega ligado (bind): validado com zod antes de usar. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- assinatura de useActionState: o estado e o formulário não são usados
export async function marcarRespondidaAcao(id: string, _anterior: EstadoEnvio, _dados: FormData): Promise<EstadoEnvio> {
  const usuario = await exigirPermissao('administrar');
  const lido = esquemaId.safeParse(id);
  if (!lido.success) return { erros: ['Contestação não encontrada.'] };
  try {
    await marcarContestacaoRespondida(obterDb(), lido.data, usuario, new Date());
  } catch (erro) {
    if (erro instanceof ErroContestacao) return { erros: erro.erros };
    throw erro;
  }
  revalidatePath('/contestacoes');
  redirect(`/contestacoes/${lido.data}?ok=respondida`);
}
