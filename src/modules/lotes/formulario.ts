import { textoDoForm } from '@/lib/formulario';
import { ehUuid } from '@/lib/uuid';
import { ehResultadoFornecedor, ehTipoLote, type TipoLote } from './dominio';
import type { ResultadoUnidade } from './envio';
import type { DestinoMover } from './gestao';

export type PedidoLote =
  | { operacao: 'fechar'; tipo: TipoLote }
  | { operacao: 'reabrir' }
  | { operacao: 'mover'; itemIds: string[]; destino: DestinoMover }
  | { operacao: 'emitir' }
  | { operacao: 'reenviar' }
  | { operacao: 'cancelar'; justificativa: string }
  | { operacao: 'envio'; rastreio: string }
  | { operacao: 'resultado'; resultados: ResultadoUnidade[] };

const PREFIXO_RESULTADO = 'resultado-';

function lerMover(dados: FormData): { pedido: PedidoLote } | { erro: string } {
  const itemIds: string[] = [];
  for (const valor of dados.getAll('itens')) {
    const id = typeof valor === 'string' ? valor : '';
    if (!ehUuid(id)) return { erro: 'Unidade inválida.' };
    if (!itemIds.includes(id)) itemIds.push(id);
  }
  if (itemIds.length === 0) return { erro: 'Marque pelo menos uma unidade.' };
  const destino = textoDoForm(dados, 'destino');
  if (destino === 'novo') {
    const tipo = textoDoForm(dados, 'tipoNovo');
    if (!ehTipoLote(tipo)) return { erro: 'Escolha o tipo do novo lote.' };
    return { pedido: { operacao: 'mover', itemIds, destino: { novo: tipo } } };
  }
  if (!ehUuid(destino)) return { erro: 'Escolha para onde mover.' };
  return { pedido: { operacao: 'mover', itemIds, destino: { loteId: destino } } };
}

function lerResultados(dados: FormData): { pedido: PedidoLote } | { erro: string } {
  const resultados: ResultadoUnidade[] = [];
  for (const [nome, valor] of dados.entries()) {
    if (!nome.startsWith(PREFIXO_RESULTADO) || typeof valor !== 'string' || valor === '') continue;
    const itemId = nome.slice(PREFIXO_RESULTADO.length);
    if (!ehUuid(itemId)) return { erro: 'Unidade inválida.' };
    if (!ehResultadoFornecedor(valor)) return { erro: 'Resultado inválido.' };
    resultados.push({ itemId, resultado: valor });
  }
  return { pedido: { operacao: 'resultado', resultados } };
}

/** O FormData da tela do lote vira um pedido validado. Rastreio e justificativa vão crus: quem apara e valida é o módulo. */
export function lerFormularioLote(dados: FormData): { pedido: PedidoLote } | { erro: string } {
  switch (textoDoForm(dados, 'operacao')) {
    case 'fechar': {
      const tipo = textoDoForm(dados, 'tipo');
      if (!ehTipoLote(tipo)) return { erro: 'Escolha o tipo do lote: Conserto, Troca ou Garantia.' };
      return { pedido: { operacao: 'fechar', tipo } };
    }
    case 'reabrir':
      return { pedido: { operacao: 'reabrir' } };
    case 'mover':
      return lerMover(dados);
    case 'emitir':
      return { pedido: { operacao: 'emitir' } };
    case 'reenviar':
      return { pedido: { operacao: 'reenviar' } };
    case 'cancelar':
      return { pedido: { operacao: 'cancelar', justificativa: textoDoForm(dados, 'justificativa') } };
    case 'envio':
      return { pedido: { operacao: 'envio', rastreio: textoDoForm(dados, 'rastreio') } };
    case 'resultado':
      return lerResultados(dados);
    default:
      return { erro: 'Ação desconhecida.' };
  }
}
