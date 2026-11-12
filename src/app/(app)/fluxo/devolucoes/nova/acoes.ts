'use server';

import { redirect } from 'next/navigation';
import { obterDb } from '@/db';
import { textoDoForm } from '@/lib/formulario';
import { exigirPermissao } from '@/modules/auth/servidor';
import { criarDevolucao, itensDoFormulario, validarNovaDevolucao } from '@/modules/devolucoes/criar';
import { ErroDevolucao } from '@/modules/devolucoes/erros';

export type EstadoNovaDevolucao = { erros: string[] };

export async function criarDevolucaoAcao(_anterior: EstadoNovaDevolucao, dados: FormData): Promise<EstadoNovaDevolucao> {
  const usuario = await exigirPermissao('operar_devolucoes');
  const { dados: nova, erros } = validarNovaDevolucao({
    canal: textoDoForm(dados, 'canal'),
    pedido: textoDoForm(dados, 'pedido'),
    reclamacaoId: textoDoForm(dados, 'reclamacao'),
    rastreio: textoDoForm(dados, 'rastreio'),
    transportadora: textoDoForm(dados, 'transportadora'),
    itens: itensDoFormulario(dados),
  });
  if (!nova) return { erros };
  let codigo: string;
  try {
    codigo = (await criarDevolucao(obterDb(), nova, { origem: 'MANUAL', usuario })).codigo;
  } catch (erro) {
    if (erro instanceof ErroDevolucao) return { erros: [erro.message] };
    throw erro;
  }
  redirect(`/fluxo/devolucoes/${codigo}`);
}
