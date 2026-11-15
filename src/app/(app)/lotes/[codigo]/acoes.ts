'use server';

import { revalidatePath } from 'next/cache';
import type { EstadoAcaoLote } from '@/components/lotes/tipos';
import { obterDb } from '@/db';
import { ehUuid } from '@/lib/uuid';
import { exigirPermissao } from '@/modules/auth/servidor';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { ErroDevolucao } from '@/modules/devolucoes/erros';
import { ErroFiscal } from '@/modules/fiscal/erros';
import { ehCodigoLote } from '@/modules/lotes/dominio';
import { registrarEnvio, registrarResultados } from '@/modules/lotes/envio';
import { lerFormularioLote, type PedidoLote } from '@/modules/lotes/formulario';
import { fecharLote, moverUnidades, reabrirLote } from '@/modules/lotes/gestao';
import { cancelarNotaRemessa, emitirNotaRemessa, reenviarNotaRemessa } from '@/modules/lotes/remessa';

async function executar(loteId: string, pedido: PedidoLote, usuario: UsuarioSessao): Promise<string> {
  const db = obterDb();
  switch (pedido.operacao) {
    case 'fechar':
      await fecharLote(db, loteId, pedido.tipo, usuario);
      return 'Lote fechado.';
    case 'reabrir':
      await reabrirLote(db, loteId, usuario);
      return 'Lote reaberto.';
    case 'mover': {
      const { destinoCodigo } = await moverUnidades(db, { loteId, itemIds: pedido.itemIds, destino: pedido.destino }, usuario);
      return `Unidades movidas para ${destinoCodigo}.`;
    }
    case 'emitir':
      await emitirNotaRemessa(db, loteId, usuario);
      return 'NF de Remessa enviada à SEFAZ. A resposta chega em alguns segundos.';
    case 'reenviar':
      await reenviarNotaRemessa(db, loteId, usuario);
      return 'NF de Remessa reenviada à SEFAZ.';
    case 'cancelar':
      await cancelarNotaRemessa(db, loteId, pedido.justificativa, usuario);
      return 'NF de Remessa cancelada. O lote voltou para Fechado.';
    case 'envio':
      await registrarEnvio(db, loteId, pedido.rastreio, usuario);
      return 'Envio registrado.';
    case 'resultado': {
      const { finalizado } = await registrarResultados(db, loteId, pedido.resultados, usuario);
      return finalizado ? 'Resultado registrado. Lote finalizado.' : 'Resultado registrado.';
    }
  }
}

/** Todas as ações da tela do lote (spec §5.4 e §6.5). Um estado só para a página (decisão 23). */
export async function acaoLote(loteId: string, codigo: string, _anterior: EstadoAcaoLote, dados: FormData): Promise<EstadoAcaoLote> {
  const usuario = await exigirPermissao('gerir_fiscal');
  if (!ehUuid(loteId) || !ehCodigoLote(codigo)) return { erros: ['Lote inválido.'], ok: null };
  const lido = lerFormularioLote(dados);
  if ('erro' in lido) return { erros: [lido.erro], ok: null };
  try {
    const ok = await executar(loteId, lido.pedido, usuario);
    revalidatePath(`/lotes/${codigo}`);
    revalidatePath('/lotes');
    revalidatePath('/fluxo/etapa/5');
    revalidatePath('/fluxo');
    return { erros: [], ok };
  } catch (erro) {
    if (erro instanceof ErroFiscal || erro instanceof ErroDevolucao) return { erros: [erro.message], ok: null };
    throw erro;
  }
}
