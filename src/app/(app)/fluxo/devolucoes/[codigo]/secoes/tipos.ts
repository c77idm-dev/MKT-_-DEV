import type { UsuarioSessao } from '@/modules/auth/usuarios';
import type { StatusDevolucao } from '@/modules/devolucoes/dominio';

/** Props das seções do detalhe (contrato §2, P2 item 9). Cada seção busca os próprios dados. */
export type PropsSecao = { devolucaoId: string; codigo: string; status: StatusDevolucao; usuario: UsuarioSessao };
