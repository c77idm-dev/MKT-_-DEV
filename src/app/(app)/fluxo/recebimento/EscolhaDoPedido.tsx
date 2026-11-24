'use client';

import { BOTAO_PRIMARIO } from '@/components/estilos';
import { EscolhaDaDevolucao } from '@/components/venda/EscolhaDaDevolucao';
import { useTravaToqueDuplo } from '@/components/venda/useTravaToqueDuplo';
import type { FichaVenda } from '@/modules/mercado-livre/ficha-venda';
import type { EstadoRecebimento } from './acoes';

type Escolha = Extract<EstadoRecebimento, { tipo: 'escolher' }>;

export const TITULO_ESCOLHA = 'Confira antes de dar a chegada';

/** O que a pessoa faz: com uma devolução, conferir a venda; com mais de uma, tocar na que chegou. */
export function instrucaoDaEscolha(quantas: number): string {
  return quantas > 1
    ? `Este pedido tem ${quantas} devoluções esperando o pacote. Toque em “Dar chegada” na que chegou.`
    : 'A chegada ainda não foi registrada. Confira a venda e toque em “Dar chegada”.';
}

/**
 * "Dar chegada" de uma devolução: manda a devolução e o pedido lido para a mesma ação do Recebimento. A trava do toque
 * duplo vale desde que a ficha apareceu (ela empurra o "Registrar chegada" para baixo).
 */
function DarChegada({ ficha, codigoLido, acao, pendente }: { ficha: FichaVenda; codigoLido: string; acao: (dados: FormData) => void; pendente: boolean }) {
  const cedoDemais = useTravaToqueDuplo();
  return (
    <form
      action={acao}
      onSubmit={(evento) => {
        if (cedoDemais()) evento.preventDefault();
      }}
    >
      <input type="hidden" name="intencao" value="dar_chegada" />
      <input type="hidden" name="devolucaoId" value={ficha.devolucaoId} />
      <input type="hidden" name="codigoLido" value={codigoLido} />
      <button type="submit" disabled={pendente} className={`${BOTAO_PRIMARIO} min-h-14 w-full text-lg`}>
        Dar chegada{' '}
        <span className="sr-only">na {ficha.codigo}</span>
      </button>
    </form>
  );
}

/**
 * (extra, E27) Achada pelo número do pedido do ML, nada registrado: a ficha da venda (uma devolução esperando o pacote)
 * ou a lista (mais de uma), cada uma com "Dar chegada". A pessoa toca na que chegou.
 */
export function EscolhaDoPedido({ estado, acao, pendente }: { estado: Escolha; acao: (dados: FormData) => void; pendente: boolean }) {
  return (
    <section aria-labelledby="titulo-escolha-pedido" data-testid="escolha-pedido" className="flex flex-col gap-3 rounded-2xl border-2 border-destaque bg-superficie p-4">
      <div className="flex flex-col gap-1">
        <h2 id="titulo-escolha-pedido" className="text-lg font-bold">
          {TITULO_ESCOLHA}
        </h2>
        <p className="text-sm font-semibold">{estado.nota}</p>
        <p className="text-sm text-texto-2">{instrucaoDaEscolha(estado.fichas.length)}</p>
      </div>
      <EscolhaDaDevolucao
        fichas={estado.fichas}
        acao={(ficha) => <DarChegada ficha={ficha} codigoLido={estado.codigoLido} acao={acao} pendente={pendente} />}
      />
    </section>
  );
}
