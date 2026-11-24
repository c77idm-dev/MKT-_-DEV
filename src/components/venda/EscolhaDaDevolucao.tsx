import type { ReactNode } from 'react';
import type { FichaVenda as DadosFicha } from '@/modules/mercado-livre/ficha-venda';
import { FichaVenda, ResumoDevolucaoDoPedido } from './FichaVenda';

/**
 * (extra, E27) As devoluções achadas pelo número do pedido do ML, para a pessoa tocar na certa: com uma, a ficha da venda
 * com o código DEV; com mais de uma, a lista (código DEV, foto e produto). `acao` monta o botão de cada devolução ("Dar
 * chegada", "Iniciar conferência"...). Sem moldura nem título: a tela põe o cartão e o texto.
 */
export function EscolhaDaDevolucao({ fichas, acao }: { fichas: DadosFicha[]; acao: (ficha: DadosFicha) => ReactNode }) {
  if (fichas.length === 1) {
    return (
      <FichaVenda ficha={fichas[0]} mostrarCodigo>
        {acao(fichas[0])}
      </FichaVenda>
    );
  }
  return (
    <ul aria-label="Devoluções do pedido" className="flex flex-col gap-3">
      {fichas.map((ficha, i) => (
        <li key={ficha.devolucaoId} className={i > 0 ? 'border-t border-borda pt-3' : undefined}>
          <ResumoDevolucaoDoPedido ficha={ficha}>{acao(ficha)}</ResumoDevolucaoDoPedido>
        </li>
      ))}
    </ul>
  );
}
