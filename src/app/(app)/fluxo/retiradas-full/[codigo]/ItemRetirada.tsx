'use client';

import { useState } from 'react';
import { SlotEvidencia } from '@/components/conferencia/SlotEvidencia';
import type { EstadoSlot } from '@/components/conferencia/estadoSlot';
import { BOTAO_SECUNDARIO, CARTAO } from '@/components/estilos';
import { Selo } from '@/components/Selo';
import type { ItemRetiradaVista } from '@/modules/retiradas/consultas';
import { QUANTIDADE_MAXIMA } from '@/modules/retiradas/dominio';

type Props = {
  item: ItemRetiradaVista;
  ocupado: boolean;
  foto: EstadoSlot;
  aoMudarQuantidade: (delta: 1 | -1) => void;
  aoRemover: () => void;
  aoEscolherFoto: (arquivo: File) => void;
  aoTentarDeNovo: (idCliente: string) => void;
};

const BOTAO_PASSO = 'inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-borda-campo bg-superficie text-xl font-bold disabled:opacity-40';

/** Um produto da retirada: − e + (de 1 a 9999), "Remover" com segundo toque e a foto opcional do item. */
export function ItemRetirada({ item, ocupado, foto, aoMudarQuantidade, aoRemover, aoEscolherFoto, aoTentarDeNovo }: Props) {
  const [confirmar, setConfirmar] = useState(false);
  const idTitulo = `item-${item.id}`;
  return (
    <article aria-labelledby={idTitulo} className={`${CARTAO} flex flex-col gap-3`}>
      <div className="flex flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <h3 id={idTitulo} className="min-w-0 break-words text-base font-bold">
            {item.descricao}
          </h3>
          {item.semCadastro && <Selo texto="sem cadastro" tom="atencao" />}
        </div>
        <p className="break-all font-mono text-[13px] text-texto-2">
          {item.sku ? `${item.sku} · ` : ''}EAN {item.eanLido ?? '—'}
        </p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label={`Diminuir ${item.descricao}`}
            disabled={ocupado || item.quantidade <= 1}
            onClick={() => aoMudarQuantidade(-1)}
            className={BOTAO_PASSO}
          >
            −
          </button>
          <span className="min-w-10 text-center text-lg font-bold tabular-nums" aria-label={`Quantidade: ${item.quantidade}`}>
            {item.quantidade}
          </span>
          <button
            type="button"
            aria-label={`Aumentar ${item.descricao}`}
            disabled={ocupado || item.quantidade >= QUANTIDADE_MAXIMA}
            onClick={() => aoMudarQuantidade(1)}
            className={BOTAO_PASSO}
          >
            +
          </button>
        </div>
        {/* Um botão só (o foco fica nele entre os dois toques); sair dele desarma. */}
        <button
          type="button"
          aria-label={confirmar ? `Toque de novo para remover ${item.descricao}` : `Remover ${item.descricao}`}
          disabled={ocupado}
          onClick={() => (confirmar ? aoRemover() : setConfirmar(true))}
          onBlur={() => setConfirmar(false)}
          className={
            confirmar
              ? 'inline-flex min-h-11 items-center justify-center rounded-full border border-erro bg-erro-suave px-4 text-sm font-semibold text-erro disabled:opacity-60'
              : `${BOTAO_SECUNDARIO} px-4 text-sm`
          }
        >
          {confirmar ? 'Toque de novo para remover' : 'Remover'}
        </button>
      </div>

      <SlotEvidencia titulo="Foto do item" descricao="" opcional estado={foto} aoEscolher={aoEscolherFoto} aoTentarDeNovo={aoTentarDeNovo} />
    </article>
  );
}
