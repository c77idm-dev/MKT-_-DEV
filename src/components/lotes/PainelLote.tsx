'use client';

import { useState, type FormEvent } from 'react';
import type { DetalheLote } from '@/modules/lotes/consultas';
import { ListaErros } from '../ListaErros';
import { MensagemSucesso } from '../MensagemSucesso';
import { useEnvioFormulario } from '../useEnvioFormulario';
import { BlocoEnvio, BlocoFechar, BlocoListaConsolidada, BlocoNotaRemessa, BlocoReabrir, BlocoResultado, BlocoUnidades } from './BlocosLote';
import { ESTADO_INICIAL_LOTE, type EstadoAcaoLote } from './tipos';

type Props = {
  detalhe: DetalheLote;
  podeGerir: boolean;
  /** XML e DANFE da NF de Remessa autorizada. */
  links: { xml: string; danfe: string } | null;
  acao: (anterior: EstadoAcaoLote, dados: FormData) => Promise<EstadoAcaoLote>;
};

/**
 * Decisão 23: o estado da ação fica aqui, num só lugar para a página inteira. Cada ação muda o status e o
 * `revalidatePath` troca os blocos (ex.: "Fechar lote" some), mas a mensagem continua na área fixa do topo.
 */
export function PainelLote({ detalhe, podeGerir, links, acao }: Props) {
  const [estado, enviar, pendente] = useEnvioFormulario(acao, ESTADO_INICIAL_LOTE, 'erros-lote');
  // Um só `pendente` para a página: guarda qual operação foi enviada para o texto de andamento aparecer só nela.
  const [operacao, setOperacao] = useState('');
  function aoEnviar(evento: FormEvent<HTMLFormElement>) {
    setOperacao(String(new FormData(evento.currentTarget).get('operacao') ?? ''));
    enviar(evento);
  }
  const ocupado = (nome: string) => pendente && operacao === nome;
  const temUnidades = detalhe.unidades.length > 0;
  const podeReabrir = podeGerir && detalhe.status === 'FECHADO' && detalhe.editavel;
  return (
    <div className="flex flex-col gap-4">
      <div id="retorno-lote" aria-live="polite" className="flex flex-col gap-2">
        {estado.ok && <MensagemSucesso key={estado.ok} texto={estado.ok} />}
        <ListaErros erros={estado.erros} id="erros-lote" />
      </div>
      {podeGerir && detalhe.status === 'ABERTO' && temUnidades && <BlocoFechar aoEnviar={aoEnviar} pendente={pendente} ocupado={ocupado('fechar')} />}
      {detalhe.status !== 'ABERTO' && (
        <BlocoNotaRemessa
          nota={detalhe.nota}
          anteriores={detalhe.anteriores}
          links={links}
          status={detalhe.status}
          podeEmitir={podeGerir && detalhe.status === 'FECHADO' && !detalhe.nota && temUnidades}
          podeReenviar={podeGerir && detalhe.nota?.situacao === 'REJEITADA'}
          podeCancelar={podeGerir && detalhe.status === 'NF_EMITIDA' && Boolean(detalhe.nota?.podeCancelar)}
          aoEnviar={aoEnviar}
          pendente={pendente}
          operacaoAtual={pendente ? operacao : null}
        />
      )}
      {podeGerir && detalhe.temLista && <BlocoListaConsolidada codigo={detalhe.codigo} />}
      {podeGerir && detalhe.status === 'NF_EMITIDA' && <BlocoEnvio aoEnviar={aoEnviar} pendente={pendente} ocupado={ocupado('envio')} />}
      {podeGerir && detalhe.status === 'ENVIADO' && <BlocoResultado unidades={detalhe.unidades} aoEnviar={aoEnviar} pendente={pendente} ocupado={ocupado('resultado')} />}
      <BlocoUnidades unidades={detalhe.unidades} editavel={podeGerir && detalhe.editavel} destinos={detalhe.destinos} aoEnviar={aoEnviar} pendente={pendente} ocupado={ocupado('mover')} />
      {podeReabrir && <BlocoReabrir outroAberto={detalhe.outroAberto} vazio={!temUnidades} aoEnviar={aoEnviar} pendente={pendente} ocupado={ocupado('reabrir')} />}
    </div>
  );
}
