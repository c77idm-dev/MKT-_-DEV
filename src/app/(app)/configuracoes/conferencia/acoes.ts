'use server';

import { revalidatePath } from 'next/cache';
import { obterDb } from '@/db';
import { textoDoForm } from '@/lib/formulario';
import { exigirPermissao } from '@/modules/auth/servidor';
import { ErroConfiguracao, salvarConfiguracaoMidia, validarConfiguracaoMidia } from '@/modules/midia/configuracao';

export type EstadoConfiguracaoMidia = { erros: string[]; salvoEm: string | null };

export async function salvarConfiguracaoMidiaAcao(_anterior: EstadoConfiguracaoMidia, dados: FormData): Promise<EstadoConfiguracaoMidia> {
  const usuario = await exigirPermissao('administrar');
  const { dados: validos, erros } = validarConfiguracaoMidia({
    videoObrigatorio: textoDoForm(dados, 'videoObrigatorio'),
    mesesRetencaoMidia: textoDoForm(dados, 'mesesRetencaoMidia'),
  });
  if (!validos) return { erros, salvoEm: null };
  try {
    await salvarConfiguracaoMidia(obterDb(), validos, usuario);
  } catch (erro) {
    if (erro instanceof ErroConfiguracao) return { erros: [erro.message], salvoEm: null };
    throw erro;
  }
  revalidatePath('/configuracoes/conferencia');
  return { erros: [], salvoEm: new Date().toISOString() };
}
