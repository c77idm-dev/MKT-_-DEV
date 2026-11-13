'use server';

import { revalidatePath } from 'next/cache';
import { obterDb } from '@/db';
import { ehUuid } from '@/lib/uuid';
import { exigirPermissao } from '@/modules/auth/servidor';
import { ErroDevolucao } from '@/modules/devolucoes/erros';
import { solicitarEmissao } from '@/modules/fiscal/emissao';
import { ErroFiscal } from '@/modules/fiscal/erros';
import { codigosDasDevolucoes } from '@/modules/fiscal/situacao';

export type EstadoEmissao = { erros: string[]; ok: string | null };

/** Uma NF por devolução (spec §6.4). Limite por envio, para a ação responder rápido. */
const MAXIMO_POR_VEZ = 30;

export async function emitirNotasAcao(_anterior: EstadoEmissao, dados: FormData): Promise<EstadoEmissao> {
  const usuario = await exigirPermissao('gerir_fiscal');
  const ids = [...new Set(dados.getAll('devolucao').map(String).filter(ehUuid))];
  if (ids.length === 0) return { erros: ['Selecione pelo menos uma devolução.'], ok: null };
  if (ids.length > MAXIMO_POR_VEZ) return { erros: [`Selecione no máximo ${MAXIMO_POR_VEZ} devoluções por vez.`], ok: null };
  const db = obterDb();
  const codigos = await codigosDasDevolucoes(db, ids);
  const erros: string[] = [];
  const enviadas: string[] = [];
  for (const id of ids) {
    const codigo = codigos.get(id);
    if (!codigo) {
      erros.push('Devolução não encontrada.');
      continue;
    }
    try {
      await solicitarEmissao(db, { tipo: 'DEVOLUCAO_VENDA', devolucaoId: id }, usuario);
      enviadas.push(codigo);
    } catch (erro) {
      if (erro instanceof ErroFiscal || erro instanceof ErroDevolucao) erros.push(`${codigo}: ${erro.message}`);
      else throw erro;
    }
  }
  revalidatePath('/fluxo');
  revalidatePath('/fluxo/etapa/4');
  revalidatePath('/fluxo/etapa/4/problema');
  return { erros, ok: enviadas.length > 0 ? `Emissão enviada: ${enviadas.join(', ')}. A SEFAZ responde em alguns segundos.` : null };
}
