import { ROTULO_PERFIL } from '@/modules/auth/perfis';
import type { Ator } from '@/modules/devolucoes/transicoes';
import { ROTULO_STATUS_LOTE, type StatusLote } from './dominio';
import { ErroLotes } from './erros';

type Regra = { de: StatusLote | null; para: StatusLote; atores: readonly Ator[] };
type PedidoLote = { de: StatusLote | null; para: StatusLote; ator: Ator };

const FISCAL_GESTOR: readonly Ator[] = ['FISCAL', 'GESTOR'];

/** Spec §5.4, contrato §4.6 (e E18: (novo) → FECHADO). Qualquer mudança fora da tabela é recusada no servidor. */
export const REGRAS_TRANSICAO_LOTE: readonly Regra[] = [
  { de: null, para: 'ABERTO', atores: ['SISTEMA'] },
  { de: null, para: 'FECHADO', atores: FISCAL_GESTOR },
  { de: 'ABERTO', para: 'FECHADO', atores: FISCAL_GESTOR },
  { de: 'FECHADO', para: 'ABERTO', atores: FISCAL_GESTOR },
  { de: 'FECHADO', para: 'NF_EMITIDA', atores: ['SISTEMA'] },
  { de: 'NF_EMITIDA', para: 'FECHADO', atores: ['SISTEMA'] },
  { de: 'NF_EMITIDA', para: 'ENVIADO', atores: FISCAL_GESTOR },
  { de: 'ENVIADO', para: 'FINALIZADO', atores: ['SISTEMA'] },
];

export function podeTransitarLote(p: PedidoLote): boolean {
  return REGRAS_TRANSICAO_LOTE.some((r) => r.de === p.de && r.para === p.para && r.atores.includes(p.ator));
}

export function exigirTransicaoLote(p: PedidoLote): void {
  if (podeTransitarLote(p)) return;
  const de = p.de ? ROTULO_STATUS_LOTE[p.de] : '(novo)';
  const quem = p.ator === 'SISTEMA' ? 'sistema' : ROTULO_PERFIL[p.ator];
  throw new ErroLotes(`Mudança não permitida no lote: ${de} → ${ROTULO_STATUS_LOTE[p.para]} (${quem}).`);
}
