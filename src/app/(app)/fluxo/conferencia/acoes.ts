'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { obterDb } from '@/db';
import { textoDoForm } from '@/lib/formulario';
import { exigirPermissao } from '@/modules/auth/servidor';
import { localizarParaConferencia } from '@/modules/conferencia/localizar';
import { iniciarConferencia } from '@/modules/conferencia/trava';
import { ErroDevolucao } from '@/modules/devolucoes/erros';
import { fichasDasDevolucoes, type FichaVenda } from '@/modules/mercado-livre/ficha-venda';

/**
 * `pedido` (extra, E27): as devoluções abertas achadas pelo número do pedido do ML, na ficha da venda (uma) ou na lista
 * (mais de uma), cada uma com "Iniciar conferência". `lidaEm` muda a cada leitura (a tela remonta a ficha e a trava do
 * toque duplo recomeça).
 */
export type EstadoConferirPacote = { erros: string[]; pedido?: { codigoLido: string; lidaEm: number; fichas: FichaVenda[] } };

/**
 * Abre a conferência pelo código lido. `origem=ficha` (extra, E27): o "Iniciar conferência" da ficha, que manda o
 * código DEV da devolução tocada; se der erro, a ficha continua na tela com a mensagem.
 */
export async function abrirConferenciaAcao(anterior: EstadoConferirPacote, dados: FormData): Promise<EstadoConferirPacote> {
  const usuario = await exigirPermissao('operar_devolucoes');
  const db = obterDb();
  const daFicha = dados.get('origem') === 'ficha';
  let codigo: string;
  try {
    const achada = await localizarParaConferencia(db, textoDoForm(dados, 'codigo'), usuario);
    if (achada.tipo === 'pedido') {
      const fichas = await fichasDasDevolucoes(db, achada.ids);
      if (fichas.length === 0) return { erros: ['A situação desta devolução mudou agora. Leia o pacote de novo.'] };
      return { erros: [], pedido: { codigoLido: achada.codigoLido, lidaEm: Date.now(), fichas } };
    }
    await iniciarConferencia(db, achada.id, usuario);
    codigo = achada.codigo;
  } catch (erro) {
    if (erro instanceof ErroDevolucao) return { erros: [erro.message], ...(daFicha && anterior.pedido ? { pedido: anterior.pedido } : {}) };
    throw erro;
  }
  revalidatePath('/fluxo', 'layout');
  redirect(`/fluxo/devolucoes/${codigo}/conferencia`);
}
