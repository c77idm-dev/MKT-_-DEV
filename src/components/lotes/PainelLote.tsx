'use client';

import type { DetalheLote } from '@/modules/lotes/consultas';
import { ListaErros } from '../ListaErros';
import { MensagemSucesso } from '../MensagemSucesso';
import { useEnvioFormulario } from '../useEnvioFormulario';
import { BlocoFechar, BlocoReabrir, BlocoUnidades } from './BlocosLote';
import { ESTADO_INICIAL_LOTE, type EstadoAcaoLote } from './tipos';

type Props = {
  detalhe: DetalheLote;
  podeGerir: boolean;
  /** XML e DANFE da NF de Remessa autorizada (a Tarefa 12 os mostra). */
  links: { xml: string; danfe: string } | null;
  acao: (anterior: EstadoAcaoLote, dados: FormData) => Promise<EstadoAcaoLote>;
};

/**
 * Decisão 23: o estado da ação fica aqui, num só lugar para a página inteira. Cada ação muda o status e o
 * `revalidatePath` troca os blocos (ex.: "Fechar lote" some), mas a mensagem continua na área fixa do topo.
 */
export function PainelLote({ detalhe, podeGerir, links, acao }: Props) {
  void links;
  const [estado, aoEnviar, pendente] = useEnvioFormulario(acao, ESTADO_INICIAL_LOTE, 'erros-lote');
  const podeReabrir = podeGerir && detalhe.status === 'FECHADO' && detalhe.editavel;
  return (
    <div className="flex flex-col gap-4">
      <div id="retorno-lote" aria-live="polite" className="flex flex-col gap-2">
        {estado.ok && <MensagemSucesso key={estado.ok} texto={estado.ok} />}
        <ListaErros erros={estado.erros} id="erros-lote" />
      </div>
      {podeGerir && detalhe.status === 'ABERTO' && <BlocoFechar aoEnviar={aoEnviar} pendente={pendente} />}
      <BlocoUnidades unidades={detalhe.unidades} editavel={podeGerir && detalhe.editavel} destinos={detalhe.destinos} aoEnviar={aoEnviar} pendente={pendente} />
      {podeReabrir && <BlocoReabrir outroAberto={detalhe.outroAberto} aoEnviar={aoEnviar} pendente={pendente} />}
    </div>
  );
}
