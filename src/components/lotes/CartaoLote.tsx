import Link from 'next/link';
import type { CartaoLoteVista } from '@/modules/lotes/consultas';
import { Selo } from '../Selo';
import { ITEM_LISTA } from '../estilos';

/** Cartão de um lote (spec §6.5): o cartão inteiro é o link para o detalhe. O nome acessível começa com o código. */
export function CartaoLote({ lote, href }: { lote: CartaoLoteVista; href: string }) {
  return (
    <Link href={href} className={ITEM_LISTA}>
      <span className="flex items-center justify-between gap-2">
        <span className="font-mono font-semibold">{lote.codigo}</span>
        <Selo texto={lote.rotuloStatus} tom={lote.tom} />
      </span>
      <span className="break-words text-sm">{lote.fornecedor}</span>
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-texto-2">
        {lote.tipo && <span>{lote.tipo}</span>}
        <span>{`${lote.unidades} ${lote.unidades === 1 ? 'unidade' : 'unidades'}`}</span>
        {lote.seloNota && <Selo texto={lote.seloNota.texto} tom={lote.seloNota.tom} />}
      </span>
    </Link>
  );
}
