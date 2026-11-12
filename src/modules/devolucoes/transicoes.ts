import { ROTULO_PERFIL, type Perfil } from '@/modules/auth/perfis';
import { ROTULO_STATUS, type StatusDevolucao } from './dominio';
import { ErroDevolucao } from './erros';

export type Ator = Perfil | 'SISTEMA';
export type PedidoTransicao = { de: StatusDevolucao | null; para: StatusDevolucao; ator: Ator; naoIdentificada?: boolean };

type Regra = { de: StatusDevolucao | null; para: StatusDevolucao; atores: readonly Ator[]; soNaoIdentificada?: true };

/** Onde a spec diz "Operador", o Gestor também pode (spec §6.9). */
const QUEM_OPERA: readonly Ator[] = ['OPERADOR', 'GESTOR'];

/** Tabela da spec §5.2. Qualquer mudança fora dela é recusada no servidor. */
export const REGRAS_TRANSICAO: readonly Regra[] = [
  { de: null, para: 'PENDENTE_CHEGADA', atores: ['SISTEMA', 'OPERADOR', 'GESTOR'] },
  { de: 'PENDENTE_CHEGADA', para: 'AGUARDANDO_CONFERENCIA', atores: QUEM_OPERA },
  { de: null, para: 'AGUARDANDO_CONFERENCIA', atores: QUEM_OPERA, soNaoIdentificada: true },
  { de: 'AGUARDANDO_CONFERENCIA', para: 'EM_CONFERENCIA', atores: QUEM_OPERA },
  { de: 'EM_CONFERENCIA', para: 'AGUARDANDO_CONFERENCIA', atores: QUEM_OPERA },
  { de: 'EM_CONFERENCIA', para: 'AGUARDANDO_NF', atores: QUEM_OPERA },
  { de: 'AGUARDANDO_NF', para: 'CONCLUIDA', atores: ['SISTEMA'] },
  { de: 'CONCLUIDA', para: 'AGUARDANDO_NF', atores: ['SISTEMA'] },
  { de: 'PENDENTE_CHEGADA', para: 'CANCELADA', atores: ['SISTEMA', 'GESTOR'] },
  { de: 'PENDENTE_CHEGADA', para: 'EXTRAVIADA', atores: ['SISTEMA', 'GESTOR'] },
  { de: 'PENDENTE_CHEGADA', para: 'NO_CD_MARKETPLACE', atores: ['SISTEMA'] },
  { de: 'NO_CD_MARKETPLACE', para: 'PENDENTE_CHEGADA', atores: ['SISTEMA'] },
];

export function podeTransitar(p: PedidoTransicao): boolean {
  return REGRAS_TRANSICAO.some(
    (r) => r.de === p.de && r.para === p.para && r.atores.includes(p.ator) && (!r.soNaoIdentificada || p.naoIdentificada === true),
  );
}

export class ErroTransicao extends ErroDevolucao {
  constructor(p: PedidoTransicao) {
    const de = p.de ? ROTULO_STATUS[p.de] : '(nova)';
    const quem = p.ator === 'SISTEMA' ? 'sistema' : ROTULO_PERFIL[p.ator];
    super(`Mudança de status não permitida: ${de} → ${ROTULO_STATUS[p.para]} (${quem}).`);
    this.name = 'ErroTransicao';
  }
}

/** Chamada antes de toda gravação de status. */
export function exigirTransicao(p: PedidoTransicao): void {
  if (!podeTransitar(p)) throw new ErroTransicao(p);
}
