'use client';

import Link from 'next/link';
import type { FormEvent } from 'react';
import type { UnidadeLoteVista } from '@/modules/lotes/consultas';
import { ROTULO_TIPO_LOTE, TIPOS_LOTE } from '@/modules/lotes/dominio';
import { RodapeFormulario } from '../RodapeFormulario';
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, CAMPO, CARTAO, ROTULO, VAZIO } from '../estilos';

/** Blocos da tela do lote. Sem estado próprio (decisão 23): o `PainelLote` dá `aoEnviar` e `pendente`. */
type Envio = { aoEnviar: (evento: FormEvent<HTMLFormElement>) => void; pendente: boolean };

const ID_FORM_MOVER = 'form-mover';

export function BlocoUnidades({
  unidades,
  editavel,
  destinos,
  aoEnviar,
  pendente,
}: Envio & { unidades: UnidadeLoteVista[]; editavel: boolean; destinos: { valor: string; rotulo: string }[] }) {
  return (
    <section aria-labelledby="titulo-unidades" className="flex flex-col gap-3">
      <h2 id="titulo-unidades" className="text-base font-bold">
        Unidades
      </h2>
      {unidades.length === 0 ? (
        <p className={VAZIO}>Nenhuma unidade neste lote.</p>
      ) : (
        <ol className="grid gap-2 md:grid-cols-2">
          {unidades.map((u) => (
            <li key={u.itemId} className={`${CARTAO} flex flex-col gap-1 p-3`}>
              <span className="flex items-center justify-between gap-2">
                <span className="font-mono text-sm font-semibold">{`Unidade ${u.unidade} · ${u.devolucaoCodigo}`}</span>
                <span className="text-xs font-semibold text-texto-2">{u.rotuloStatus}</span>
              </span>
              <span className="break-all font-mono text-[13px] font-semibold">{u.sku}</span>
              <span className="break-words text-sm">{u.descricao}</span>
              <span className="break-all font-mono text-xs text-texto-2">{`S/N ${u.serial}`}</span>
              <span className="text-xs text-texto-2">{`Motivo: ${u.motivo}`}</span>
              {u.observacao && <span className="break-words text-xs text-texto-2">{`Observação: ${u.observacao}`}</span>}
              {u.resultado && <span className="text-sm font-semibold">{`Resultado: ${u.resultado}`}</span>}
              <Link href={`/fluxo/devolucoes/${u.devolucaoCodigo}#conferencia`} className="inline-flex min-h-11 items-center text-sm font-semibold text-destaque">
                Ver evidências
                <span className="sr-only">{` da unidade ${u.unidade} da ${u.devolucaoCodigo}`}</span>
              </Link>
              {editavel && (
                <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
                  <input type="checkbox" name="itens" value={u.itemId} form={ID_FORM_MOVER} className="size-5" />
                  {`Mover unidade ${u.unidade} da ${u.devolucaoCodigo}`}
                </label>
              )}
            </li>
          ))}
        </ol>
      )}
      {editavel && unidades.length > 0 && (
        <form id={ID_FORM_MOVER} onSubmit={aoEnviar} className={`${CARTAO} flex flex-col gap-3`}>
          <input type="hidden" name="operacao" value="mover" />
          <p className="text-sm text-texto-2">Marque as unidades acima e escolha o lote de destino (do mesmo fornecedor).</p>
          <div className="flex flex-col gap-1">
            <label htmlFor="destino-mover" className={ROTULO}>
              Para onde
            </label>
            <select id="destino-mover" name="destino" defaultValue="" className={CAMPO}>
              <option value="" disabled>
                Escolha o destino
              </option>
              <option value="novo">Novo lote</option>
              {destinos.map((d) => (
                <option key={d.valor} value={d.valor}>
                  {d.rotulo}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="tipo-novo-mover" className={ROTULO}>
              Tipo do novo lote
            </label>
            <select id="tipo-novo-mover" name="tipoNovo" defaultValue="" className={CAMPO}>
              <option value="">Só para o destino Novo lote</option>
              {TIPOS_LOTE.map((t) => (
                <option key={t} value={t}>
                  {ROTULO_TIPO_LOTE[t]}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" disabled={pendente} className={`${BOTAO_SECUNDARIO} w-full sm:w-auto sm:self-start`}>
            Mover unidades
          </button>
        </form>
      )}
    </section>
  );
}

export function BlocoFechar({ aoEnviar, pendente }: Envio) {
  return (
    <section aria-labelledby="titulo-fechar" className={CARTAO}>
      <form onSubmit={aoEnviar} className="flex flex-col gap-3">
        <h2 id="titulo-fechar" className="text-base font-bold">
          Fechar lote
        </h2>
        <input type="hidden" name="operacao" value="fechar" />
        <fieldset className="flex flex-col gap-1">
          <legend className={ROTULO}>Tipo do lote</legend>
          {TIPOS_LOTE.map((t) => (
            <label key={t} className="flex min-h-11 items-center gap-3 text-[15px]">
              <input type="radio" name="tipo" value={t} className="size-5" />
              {ROTULO_TIPO_LOTE[t]}
            </label>
          ))}
        </fieldset>
        <RodapeFormulario>
          <button type="submit" disabled={pendente} className={`${BOTAO_PRIMARIO} w-full md:w-auto`}>
            Fechar lote
          </button>
        </RodapeFormulario>
      </form>
    </section>
  );
}

export function BlocoReabrir({ outroAberto, aoEnviar, pendente }: Envio & { outroAberto: string | null }) {
  if (outroAberto) {
    return <p className="text-sm text-texto-2">{`O fornecedor já tem o lote ${outroAberto} aberto: mova as unidades deste lote para ele.`}</p>;
  }
  return (
    <form onSubmit={aoEnviar}>
      <input type="hidden" name="operacao" value="reabrir" />
      <button type="submit" disabled={pendente} className={`${BOTAO_SECUNDARIO} w-full sm:w-auto`}>
        Reabrir lote
      </button>
    </form>
  );
}
