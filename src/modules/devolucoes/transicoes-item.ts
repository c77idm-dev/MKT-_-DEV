import { ROTULO_PERFIL } from '@/modules/auth/perfis';
import { ROTULO_STATUS_ITEM, type StatusItem } from './dominio';
import { ErroDevolucao } from './erros';
import type { Ator } from './transicoes';

export type PedidoTransicaoItem = { de: StatusItem; para: StatusItem; ator: Ator };

type RegraItem = { de: StatusItem; para: StatusItem; atores: readonly Ator[] };

const QUEM_OPERA: readonly Ator[] = ['OPERADOR', 'GESTOR'];
const QUEM_GERE_LOTES: readonly Ator[] = ['FISCAL', 'GESTOR'];

/**
 * Tabela completa do contrato §4.6 (spec §5.3). Cada fase usa só as suas linhas:
 * Fase 2 (conferência), Fase 4 (NF de devolução), Fase 5 (lotes). Mudança fora dela é recusada no servidor.
 */
export const REGRAS_TRANSICAO_ITEM: readonly RegraItem[] = [
  { de: 'PENDENTE', para: 'AGUARDANDO_NF', atores: QUEM_OPERA },
  { de: 'PENDENTE', para: 'AUSENTE', atores: QUEM_OPERA },
  { de: 'AGUARDANDO_NF', para: 'DISPONIVEL_VENDA', atores: ['SISTEMA'] },
  { de: 'DISPONIVEL_VENDA', para: 'AGUARDANDO_NF', atores: ['SISTEMA'] },
  { de: 'AGUARDANDO_NF', para: 'EM_LOTE', atores: ['SISTEMA'] },
  { de: 'AGUARDANDO_NF', para: 'SEM_FORNECEDOR', atores: ['SISTEMA'] },
  { de: 'SEM_FORNECEDOR', para: 'EM_LOTE', atores: ['FISCAL', 'GESTOR', 'SISTEMA'] },
  { de: 'EM_LOTE', para: 'AGUARDANDO_NF', atores: ['SISTEMA'] },
  { de: 'SEM_FORNECEDOR', para: 'AGUARDANDO_NF', atores: ['SISTEMA'] },
  { de: 'EM_LOTE', para: 'ENVIADO', atores: QUEM_GERE_LOTES },
  { de: 'ENVIADO', para: 'RESOLVIDO', atores: QUEM_GERE_LOTES },
];

export function podeTransitarItem(p: PedidoTransicaoItem): boolean {
  return REGRAS_TRANSICAO_ITEM.some((r) => r.de === p.de && r.para === p.para && r.atores.includes(p.ator));
}

export class ErroTransicaoItem extends ErroDevolucao {
  constructor(p: PedidoTransicaoItem) {
    const quem = p.ator === 'SISTEMA' ? 'sistema' : ROTULO_PERFIL[p.ator];
    super(`Mudança de status do item não permitida: ${ROTULO_STATUS_ITEM[p.de]} → ${ROTULO_STATUS_ITEM[p.para]} (${quem}).`);
    this.name = 'ErroTransicaoItem';
  }
}

/** Chamada antes de toda gravação de status de um item. */
export function exigirTransicaoItem(p: PedidoTransicaoItem): void {
  if (!podeTransitarItem(p)) throw new ErroTransicaoItem(p);
}
