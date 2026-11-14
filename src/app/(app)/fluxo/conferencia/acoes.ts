'use server';

import { redirect } from 'next/navigation';
import { obterDb } from '@/db';
import { textoDoForm } from '@/lib/formulario';
import { exigirPermissao } from '@/modules/auth/servidor';
import { localizarParaConferencia } from '@/modules/conferencia/localizar';
import { iniciarConferencia } from '@/modules/conferencia/trava';
import { ErroDevolucao } from '@/modules/devolucoes/erros';

export type EstadoConferirPacote = { erros: string[] };

export async function abrirConferenciaAcao(_anterior: EstadoConferirPacote, dados: FormData): Promise<EstadoConferirPacote> {
  const usuario = await exigirPermissao('operar_devolucoes');
  const db = obterDb();
  let codigo: string;
  try {
    const d = await localizarParaConferencia(db, textoDoForm(dados, 'codigo'), usuario);
    await iniciarConferencia(db, d.id, usuario);
    codigo = d.codigo;
  } catch (erro) {
    if (erro instanceof ErroDevolucao) return { erros: [erro.message] };
    throw erro;
  }
  redirect(`/fluxo/devolucoes/${codigo}/conferencia`);
}
