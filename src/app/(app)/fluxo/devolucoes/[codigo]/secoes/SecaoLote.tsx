import Link from 'next/link';
import type { ReactNode } from 'react';
import { Selo } from '@/components/Selo';
import { CARTAO } from '@/components/estilos';
import { obterDb } from '@/db';
import { pode } from '@/modules/auth/permissoes';
import { unidadesDaDevolucaoNosLotes } from '@/modules/lotes/consultas';
import type { PropsSecao } from './tipos';

/** Lote de remessa (Fase 5): em qual lote está cada unidade com problema. Só a Fase 5 edita este arquivo. */
export async function SecaoLote({ devolucaoId, usuario }: PropsSecao): Promise<ReactNode> {
  const unidades = await unidadesDaDevolucaoNosLotes(obterDb(), devolucaoId);
  if (unidades.length === 0) return null;
  const podeFiscal = pode(usuario.perfil, 'gerir_fiscal');
  return (
    <section aria-labelledby="titulo-lote" className={`${CARTAO} flex flex-col gap-3`}>
      <h2 id="titulo-lote" className="text-base font-bold">
        Lote
      </h2>
      <ul className="flex flex-col gap-2">
        {unidades.map((u) => (
          <li key={u.unidade} className="flex flex-col gap-1 rounded-lg border border-borda p-3">
            <span className="flex items-center justify-between gap-2">
              <span className="font-mono text-sm font-semibold">{`Unidade ${u.unidade} · ${u.sku}`}</span>
              <span className="text-xs font-semibold text-texto-2">{u.rotuloStatus}</span>
            </span>
            {u.lote ? (
              <span className="flex items-center justify-between gap-2">
                <Link href={`/lotes/${u.lote.codigo}`} className="inline-flex min-h-11 items-center font-mono text-sm font-semibold text-destaque-escuro">
                  {u.lote.codigo}
                </Link>
                <Selo texto={u.lote.rotuloStatus} tom={u.lote.tom} />
              </span>
            ) : (
              <span className="flex flex-wrap items-center justify-between gap-2">
                <Selo texto="Sem fornecedor" tom="atencao" />
                {podeFiscal && (
                  <Link href="/lotes/sem-fornecedor" className="inline-flex min-h-11 items-center text-sm font-semibold text-destaque-escuro">
                    Resolver em Lotes e Remessas
                  </Link>
                )}
              </span>
            )}
            {u.resultado && <span className="text-sm font-semibold">{`Resultado: ${u.resultado}`}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
