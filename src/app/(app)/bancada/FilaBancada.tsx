'use client';

import Link from 'next/link';
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, LINK_VOLTAR, VAZIO } from '@/components/estilos';
import { FotoProduto } from '@/components/FotoProduto';
import { Selo } from '@/components/Selo';
import { formatarDataHora } from '@/lib/formatar';
import type { CartaoFila, FilaBancada as Fila } from '@/modules/bancada/fila';
import { BotaoConferir } from '../fluxo/conferencia/BotaoConferir';

const ITEM = 'flex flex-col gap-2 rounded-xl border border-borda bg-superficie p-3';
const BOTAO_FILA = `${BOTAO_PRIMARIO} min-h-12 w-full`;

/** O código (link para o detalhe, só leitura), a foto e o produto, quando chegou e os selos (urgente do ML, prazo…). */
function Devolucao({ d, extra }: { d: CartaoFila; extra?: string }) {
  return (
    <>
      <div className="flex w-0 min-w-full items-center gap-2.5">
        <FotoProduto url={d.foto} descricao={d.titulo} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Link href={`/fluxo/devolucoes/${d.codigo}`} className="inline-flex min-h-11 items-center self-start font-mono font-semibold text-destaque underline">
            {d.codigo}
          </Link>
          <span className="break-words text-sm">{d.titulo}</span>
          {d.chegouEm && <span className="text-xs text-texto-2">Chegou em {formatarDataHora(d.chegouEm)}</span>}
        </div>
      </div>
      {(extra || d.selos.length > 0) && (
        <span className="flex flex-wrap gap-1.5">
          {extra && <Selo texto={extra} tom="destaque" />}
          {d.selos.map((s) => (
            <Selo key={s.texto} texto={s.texto} tom={s.tom} />
          ))}
        </span>
      )}
    </>
  );
}

/**
 * (E29) A fila embaixo do "Chegou um pacote", na Bancada do Operador:
 * - "Esperando conferência (N)": primeiro as conferências da pessoa ("Continuar"), depois as que esperam, na ordem da
 *   etapa 2 (urgentes do ML primeiro), cada uma com "Conferir". A não identificada espera o Gestor;
 * - "Retirada do Full aberta": cada uma com "Continuar".
 * Cada lista vazia tem um texto curto.
 */
export function FilaBancada({ fila }: { fila: Fila }) {
  const tituloEsperando = `Esperando conferência (${fila.totalEsperando})`;
  const nada = fila.continuar.length === 0 && fila.esperando.length === 0;
  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="titulo-esperando" className="flex flex-col gap-2">
        <h2 id="titulo-esperando" className="text-base font-bold">
          {tituloEsperando}
        </h2>
        {fila.esperando.length < fila.totalEsperando && (
          <p className="text-[13px] text-texto-2">{`Mostrando ${fila.esperando.length} de ${fila.totalEsperando}, na ordem da conferência.`}</p>
        )}
        {nada ? (
          <p className={VAZIO}>Nenhuma devolução esperando conferência.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {fila.continuar.map((d) => (
              <li key={d.id} className={ITEM}>
                <Devolucao d={d} extra="Em conferência com você" />
                <Link href={`/fluxo/devolucoes/${d.codigo}/conferencia`} className={BOTAO_FILA}>
                  Continuar <span className="sr-only">{d.codigo}</span>
                </Link>
              </li>
            ))}
            {fila.esperando.map((d) => (
              <li key={d.id} className={ITEM}>
                <Devolucao d={d} />
                {d.naoIdentificada ? (
                  <p className="text-sm text-texto-2">O Gestor liga ao pedido antes da conferência.</p>
                ) : (
                  <BotaoConferir codigo={d.codigo} className={BOTAO_FILA}>
                    Conferir <span className="sr-only">{d.codigo}</span>
                  </BotaoConferir>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="titulo-retiradas" className="flex flex-col gap-2">
        <h2 id="titulo-retiradas" className="text-base font-bold">
          Retirada do Full aberta
        </h2>
        {fila.retiradas.length === 0 ? (
          <p className={VAZIO}>Nenhuma retirada do Full aberta.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {fila.retiradas.map((r) => (
              <li key={r.id} className={ITEM}>
                <span className="font-mono font-semibold">{r.codigo}</span>
                <span className="break-all text-sm">
                  Etiqueta: <span className="font-mono">{r.codigoEtiqueta}</span>
                </span>
                <span className="text-xs text-texto-2">Aberta em {formatarDataHora(r.abertaEm)}</span>
                <Link href={`/fluxo/retiradas-full/${r.codigo}`} className={`${BOTAO_SECUNDARIO} min-h-12 w-full`}>
                  Continuar <span className="sr-only">{r.codigo}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link href="/fluxo/retiradas-full" className={`${LINK_VOLTAR} self-start`}>
          Ver retiradas do Full
        </Link>
      </section>
    </div>
  );
}
