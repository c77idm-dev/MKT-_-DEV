import Link from 'next/link';
import type { AlertaPainel } from '@/modules/acabamento/alertas';
import type { TomSelo } from '@/modules/devolucoes/selos';

/** Quantos alertas o painel do Fluxo mostra; o resto fica em /fluxo/alertas (decisão 13). */
export const ALERTAS_NO_PAINEL = 3;

const COR_DO_TOM: Record<TomSelo, string> = {
  erro: 'bg-erro-suave text-erro',
  atencao: 'bg-atencao-suave text-atencao',
  destaque: 'bg-destaque-suave text-destaque',
  bom: 'bg-bom-suave text-bom',
  neutro: 'bg-coluna text-texto-2',
};

/** Bloco "Alertas" (spec §6.0.1): uma linha por alerta, na ordem de prioridade. Nada quando não há alerta. */
export function AlertasPainel({ alertas, limite }: { alertas: AlertaPainel[]; limite?: number }) {
  if (alertas.length === 0) return null;
  const mostrados = limite !== undefined ? alertas.slice(0, limite) : alertas;
  return (
    <section aria-labelledby="titulo-alertas" className="flex flex-col gap-2">
      <h2 id="titulo-alertas" className="text-base font-bold">
        Alertas
      </h2>
      <ul className="flex flex-col gap-2">
        {mostrados.map((a) => (
          <li key={a.id}>
            <Link
              href={a.href}
              className={`flex min-h-11 items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${COR_DO_TOM[a.tom]}`}
            >
              <span className="min-w-0">{a.titulo}</span>
              {a.quantidade !== null ? (
                <span className="shrink-0 font-mono">{a.quantidade}</span>
              ) : a.detalhe ? (
                <span className="shrink-0 text-xs font-medium">{a.detalhe}</span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
      {mostrados.length < alertas.length && (
        <Link href="/fluxo/alertas" className="inline-flex min-h-11 items-center text-sm font-semibold text-destaque">
          Ver todos os alertas ({alertas.length})
        </Link>
      )}
    </section>
  );
}
