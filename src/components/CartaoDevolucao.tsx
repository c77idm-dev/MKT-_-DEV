import Link from 'next/link';
import type { ResumoDevolucao } from '@/modules/devolucoes/busca';
import { ROTULO_CANAL, ROTULO_STATUS } from '@/modules/devolucoes/dominio';
import { TOM_DO_STATUS } from '@/modules/devolucoes/selos';
import { Selo } from './Selo';

/** Cartão do quadro e das listas (protótipo C-Painel): código, canal, produto, rastreio e selos. O cartão inteiro é o link. */
export function CartaoDevolucao({ devolucao: d }: { devolucao: ResumoDevolucao }) {
  const outras = d.unidades - 1;
  return (
    <Link
      href={`/fluxo/devolucoes/${d.codigo}`}
      className="flex min-h-11 flex-col gap-1.5 rounded-xl border border-borda bg-superficie p-3 hover:border-destaque"
    >
      <span className="flex items-center justify-between gap-2">
        <span className="font-mono text-[13px] font-semibold">{d.codigo}</span>
        <span className="text-xs font-semibold text-texto-2">{d.canal ? ROTULO_CANAL[d.canal] : 'Canal a identificar'}</span>
      </span>
      <span className="text-sm">
        {d.produto ?? 'Sem itens cadastrados'}
        {outras > 0 ? ` + ${outras} ${outras === 1 ? 'unidade' : 'unidades'}` : ''}
      </span>
      <span className="break-all font-mono text-xs text-texto-2">{d.rastreio ?? 'Sem rastreio'}</span>
      <span className="flex flex-wrap gap-1.5">
        <Selo texto={ROTULO_STATUS[d.status]} tom={TOM_DO_STATUS[d.status]} />
        {d.selos.map((s) => (
          <Selo key={s.texto} texto={s.texto} tom={s.tom} />
        ))}
      </span>
    </Link>
  );
}
