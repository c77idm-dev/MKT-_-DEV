'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { ListaErros } from '@/components/ListaErros';
import { Selo } from '@/components/Selo';
import { ALERTA_OK, BOTAO_PRIMARIO, CARTAO, VAZIO } from '@/components/estilos';
import { BotaoConfirmar } from '@/components/mercado-livre/BotaoConfirmar';
import { useEnvioFormulario } from '@/components/useEnvioFormulario';
import { ESTADO_INICIAL_OK, type EstadoOk, type OkVista } from './tipos';

type Props = { itens: OkVista[]; acao: (anterior: EstadoOk, dados: FormData) => Promise<EstadoOk> };

/** "OK para responder no ML" (extra, §4.6): conferidas sem problema que esperam o "OK" à mão. Um estado só para a lista. */
export function OkParaResponder({ itens, acao }: Props) {
  const [estado, enviar, pendente] = useEnvioFormulario(acao, ESTADO_INICIAL_OK, 'erros-ok-ml');
  const [enviando, setEnviando] = useState<string | null>(null);
  function aoEnviar(evento: FormEvent<HTMLFormElement>) {
    setEnviando(String(new FormData(evento.currentTarget).get('devolucao')));
    enviar(evento);
  }
  return (
    <div className="flex flex-col gap-2">
      <div aria-live="polite" className="flex flex-col gap-2">
        {estado.ok ? (
          <p role="status" className={ALERTA_OK}>
            {estado.ok}
          </p>
        ) : null}
        <ListaErros erros={estado.erros} id="erros-ok-ml" />
      </div>
      {itens.length === 0 ? (
        <p className={VAZIO}>Nenhum &quot;OK&quot; para responder no ML.</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {itens.map((i) => (
            <li key={i.devolucaoId}>
              <article aria-labelledby={`ok-${i.devolucaoId}`} className={`${CARTAO} flex flex-col gap-2 p-3`}>
                <h3 id={`ok-${i.devolucaoId}`} className="font-mono text-[15px] font-bold">
                  {i.codigo}
                </h3>
                <span className="break-all font-mono text-xs text-texto-2">Pedido {i.pedidos || '—'}</span>
                <span className="break-all font-mono text-xs text-texto-2">Reclamação {i.reclamacaoId}</span>
                {i.conta && <span className="text-sm [overflow-wrap:anywhere]">Conta: {i.conta}</span>}
                {i.selo && (
                  <span className="flex flex-wrap gap-1.5">
                    <Selo texto={i.selo.texto} tom={i.selo.tom} />
                  </span>
                )}
                <Link href={`/fluxo/devolucoes/${i.codigo}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-destaque underline">
                  Ver a devolução
                </Link>
                <form onSubmit={aoEnviar}>
                  <input type="hidden" name="devolucao" value={i.devolucaoId} />
                  <BotaoConfirmar
                    rotulo="Marcar como respondido"
                    rotuloConfirmar="Toque de novo para marcar como respondido"
                    desabilitado={pendente}
                    pendente={pendente && enviando === i.devolucaoId}
                    rotuloPendente="Marcando…"
                    className={`${BOTAO_PRIMARIO} w-full sm:w-auto`}
                  />
                </form>
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
