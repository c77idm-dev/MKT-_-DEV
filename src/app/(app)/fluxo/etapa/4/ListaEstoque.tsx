'use client';

import { useState } from 'react';
import { CartaoDevolucao } from '@/components/CartaoDevolucao';
import { ListaErros } from '@/components/ListaErros';
import { MensagemSucesso } from '@/components/MensagemSucesso';
import { RodapeFormulario } from '@/components/RodapeFormulario';
import { BOTAO_PRIMARIO } from '@/components/estilos';
import { useEnvioFormulario } from '@/components/useEnvioFormulario';
import type { ResumoDevolucao } from '@/modules/devolucoes/busca';
import type { EstadoEmissao } from './acoes';

const ID_ERROS = 'erros-emissao';

type Props = {
  devolucoes: ResumoDevolucao[];
  /** Ids sem NF ativa: só elas têm a caixa de seleção. */
  selecionaveis: string[];
  acao: (anterior: EstadoEmissao, dados: FormData) => Promise<EstadoEmissao>;
};

/** Spec §6.4: o Fiscal seleciona uma ou mais devoluções e clica em "Emitir NF de devolução" (uma NF por devolução). */
export function ListaEstoque({ devolucoes, selecionaveis, acao }: Props) {
  const [estado, aoEnviar, pendente] = useEnvioFormulario(acao, { erros: [], ok: null }, ID_ERROS);
  const [marcadas, setMarcadas] = useState<string[]>([]);
  // Depois da emissão a lista volta do servidor e as que ganharam NF deixam de ser selecionáveis.
  const efetivas = marcadas.filter((id) => selecionaveis.includes(id));

  function alternar(id: string, marcada: boolean) {
    setMarcadas((atual) => (marcada ? [...atual.filter((x) => x !== id), id] : atual.filter((x) => x !== id)));
  }

  return (
    <form onSubmit={aoEnviar} aria-label="Emitir NF de devolução" className="flex flex-col gap-3">
      {estado.ok && <MensagemSucesso key={estado.ok} texto={estado.ok} />}
      <ListaErros erros={estado.erros} id={ID_ERROS} />
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {devolucoes.map((d) => (
          <li key={d.id} className="flex items-stretch gap-2">
            {selecionaveis.includes(d.id) ? (
              <label className="flex min-h-11 w-11 flex-none cursor-pointer items-center justify-center rounded-xl border border-borda bg-superficie">
                <input
                  type="checkbox"
                  name="devolucao"
                  value={d.id}
                  checked={efetivas.includes(d.id)}
                  onChange={(evento) => alternar(d.id, evento.currentTarget.checked)}
                  className="size-5"
                />
                <span className="sr-only">{`Selecionar ${d.codigo}`}</span>
              </label>
            ) : (
              <span aria-hidden="true" className="w-11 flex-none" />
            )}
            <div className="min-w-0 flex-1">
              <CartaoDevolucao devolucao={d} />
            </div>
          </li>
        ))}
      </ul>
      <RodapeFormulario>
        <button type="submit" disabled={pendente || efetivas.length === 0} className={BOTAO_PRIMARIO}>
          {pendente ? 'Enviando…' : `Emitir NF de devolução${efetivas.length > 0 ? ` (${efetivas.length})` : ''}`}
        </button>
      </RodapeFormulario>
    </form>
  );
}
