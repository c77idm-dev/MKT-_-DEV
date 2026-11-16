import Link from 'next/link';
import { formatarDataHora } from '@/lib/formatar';
import type { RetiradaLista } from '@/modules/retiradas/consultas';
import { ROTULO_SITUACAO_RETIRADA } from '@/modules/retiradas/dominio';
import { Selo } from '../Selo';
import { ITEM_LISTA } from '../estilos';

/** Cartão de uma retirada do Full (melhoria 3): o cartão inteiro é o link para o detalhe. O nome acessível começa com o código. */
export function CartaoRetirada({ retirada }: { retirada: RetiradaLista }) {
  return (
    <Link href={`/fluxo/retiradas-full/${retirada.codigo}`} className={ITEM_LISTA}>
      <span className="flex items-center justify-between gap-2">
        <span className="font-mono font-semibold">{retirada.codigo}</span>
        <Selo texto={ROTULO_SITUACAO_RETIRADA[retirada.situacao]} tom={retirada.situacao === 'CONFERIDA' ? 'bom' : 'atencao'} />
      </span>
      <span className="break-all text-sm">
        Etiqueta: <span className="font-mono">{retirada.codigoEtiqueta}</span>
      </span>
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-texto-2">
        <span>{formatarDataHora(retirada.recebidaEm)}</span>
        <span aria-hidden="true">·</span>
        <span>{`${retirada.totalItens} ${retirada.totalItens === 1 ? 'item' : 'itens'}`}</span>
        <span aria-hidden="true">·</span>
        <span>Recebida por {retirada.recebidaPorNome ?? 'usuário removido'}</span>
      </span>
    </Link>
  );
}
