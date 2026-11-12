'use server';

import { revalidatePath } from 'next/cache';
import { obterDb } from '@/db';
import { textoDoForm } from '@/lib/formulario';
import { exigirPermissao } from '@/modules/auth/servidor';
import { itensDoFormulario } from '@/modules/devolucoes/criar';
import { ErroDevolucao } from '@/modules/devolucoes/erros';
import { encerrarPendente, identificarDevolucao } from '@/modules/devolucoes/excecoes';

export type EstadoAcaoGestor = { erros: string[] };

export async function encerrarAcao(id: string, codigo: string, _anterior: EstadoAcaoGestor, dados: FormData): Promise<EstadoAcaoGestor> {
  const usuario = await exigirPermissao('administrar');
  const para = textoDoForm(dados, 'para');
  if (para !== 'CANCELADA' && para !== 'EXTRAVIADA') return { erros: ['Escolha o novo status.'] };
  try {
    await encerrarPendente(obterDb(), id, para, textoDoForm(dados, 'motivo'), usuario);
  } catch (erro) {
    if (erro instanceof ErroDevolucao) return { erros: [erro.message] };
    throw erro;
  }
  revalidatePath(`/fluxo/devolucoes/${codigo}`);
  return { erros: [] };
}

export async function identificarAcao(id: string, codigo: string, _anterior: EstadoAcaoGestor, dados: FormData): Promise<EstadoAcaoGestor> {
  const usuario = await exigirPermissao('administrar');
  try {
    await identificarDevolucao(
      obterDb(),
      id,
      {
        canal: textoDoForm(dados, 'canal'),
        pedido: textoDoForm(dados, 'pedido'),
        reclamacaoId: textoDoForm(dados, 'reclamacao'),
        transportadora: textoDoForm(dados, 'transportadora'),
        itens: itensDoFormulario(dados),
      },
      usuario,
    );
  } catch (erro) {
    if (erro instanceof ErroDevolucao) return { erros: [erro.message] };
    throw erro;
  }
  revalidatePath(`/fluxo/devolucoes/${codigo}`);
  return { erros: [] };
}
