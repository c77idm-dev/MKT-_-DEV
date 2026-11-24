import type { ReactNode } from 'react';
import { CARTAO } from '@/components/estilos';
import { FichaVenda } from '@/components/venda/FichaVenda';
import { obterDb } from '@/db';
import { fichaDaDevolucao } from '@/modules/mercado-livre/ficha-venda';
import type { PropsSecao } from './tipos';

/**
 * Seção "Venda (extra)" do detalhe da devolução (emenda E27): a ficha da venda do ML. Some fora do canal ML. O valor
 * aparece para todos que veem a devolução (decisão do usuário).
 */
export async function SecaoVenda({ devolucaoId }: PropsSecao): Promise<ReactNode> {
  const ficha = await fichaDaDevolucao(obterDb(), devolucaoId);
  if (!ficha) return null;
  return (
    <section aria-labelledby="titulo-venda" className={`${CARTAO} flex flex-col gap-3`}>
      <h2 id="titulo-venda" className="text-base font-bold">
        Venda <span className="font-normal text-texto-2">(extra)</span>
      </h2>
      <FichaVenda ficha={ficha} />
    </section>
  );
}
