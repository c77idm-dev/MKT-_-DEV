'use client';

import { useState, type FormEvent } from 'react';
import { ListaErros } from '@/components/ListaErros';
import { Selo } from '@/components/Selo';
import { ALERTA_OK, BOTAO_PRIMARIO, BOTAO_SECUNDARIO, CARTAO, VAZIO } from '@/components/estilos';
import { useEnvioFormulario } from '@/components/useEnvioFormulario';
import { ESTADO_INICIAL_CONTAS, type ContaVista, type EstadoContasBitbrain } from './tipos-bitbrain';

type Props = { contas: ContaVista[]; acao: (anterior: EstadoContasBitbrain, dados: FormData) => Promise<EstadoContasBitbrain> };

/** §4.3: as contas do Bitbrain; o Gestor marca as que mandam devoluções. Um estado só para a tela (como ListaFalhas). */
export function ContasBitbrain({ contas, acao }: Props) {
  const [estado, enviar, pendente] = useEnvioFormulario(acao, ESTADO_INICIAL_CONTAS, 'erros-contas-bitbrain');
  const [chave, setChave] = useState<string | null>(null);
  function aoEnviar(evento: FormEvent<HTMLFormElement>) {
    setChave(String(new FormData(evento.currentTarget).get('chave')));
    enviar(evento);
  }
  const ocupado = (c: string) => pendente && chave === c;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-2 sm:flex">
        <form onSubmit={aoEnviar}>
          <input type="hidden" name="operacao" value="sincronizar" />
          <input type="hidden" name="chave" value="sincronizar" />
          <button type="submit" disabled={pendente} className={`${BOTAO_PRIMARIO} w-full sm:w-auto`}>
            {ocupado('sincronizar') ? 'Pedindo…' : 'Sincronizar agora'}
          </button>
        </form>
        <form onSubmit={aoEnviar}>
          <input type="hidden" name="operacao" value="atualizar" />
          <input type="hidden" name="chave" value="atualizar" />
          <button type="submit" disabled={pendente} className={`${BOTAO_SECUNDARIO} w-full sm:w-auto`}>
            {ocupado('atualizar') ? 'Atualizando…' : 'Atualizar contas'}
          </button>
        </form>
      </div>
      <div aria-live="polite" className="flex flex-col gap-2">
        {estado.ok ? (
          <p role="status" className={ALERTA_OK}>
            {estado.ok}
          </p>
        ) : null}
        <ListaErros erros={estado.erros} id="erros-contas-bitbrain" />
      </div>
      {contas.length === 0 ? (
        <p className={VAZIO}>Nenhuma conta do Bitbrain ainda. Toque em &quot;Atualizar contas&quot;.</p>
      ) : (
        <ul className="grid gap-2 md:grid-cols-2">
          {contas.map((c) => (
            <li key={c.empresa}>
              <article aria-labelledby={`conta-${c.empresa}`} className={`${CARTAO} flex flex-col gap-2 p-3`}>
                <h3 id={`conta-${c.empresa}`} className="text-[15px] font-bold [overflow-wrap:anywhere]">
                  {c.nome}
                </h3>
                <span className="break-all font-mono text-xs text-texto-2">
                  Vendedor {c.sellerId} · {c.empresa}
                </span>
                <span className="flex flex-wrap gap-1.5">
                  {!c.disponivel && <Selo texto="Indisponível no Bitbrain" tom="erro" />}
                  <Selo texto={c.recebeDevolucoes ? 'Recebe devoluções' : 'Não recebe'} tom={c.recebeDevolucoes ? 'bom' : 'neutro'} />
                  {c.atrasada && <Selo texto="Sincronização parada há mais de 1 hora" tom="atencao" />}
                </span>
                {c.recebeDevolucoes && (
                  <span className="text-xs text-texto-2">{c.ultimaSincronizacao ? `Última sincronização: ${c.ultimaSincronizacao}` : 'Ainda não sincronizou'}</span>
                )}
                <form onSubmit={aoEnviar}>
                  <input type="hidden" name="operacao" value="marcar" />
                  <input type="hidden" name="empresa" value={c.empresa} />
                  <input type="hidden" name="recebe" value={c.recebeDevolucoes ? 'nao' : 'sim'} />
                  <input type="hidden" name="chave" value={`marcar:${c.empresa}`} />
                  <button type="submit" disabled={pendente} className={`${BOTAO_SECUNDARIO} w-full sm:w-auto`}>
                    {ocupado(`marcar:${c.empresa}`) ? 'Salvando…' : c.recebeDevolucoes ? 'Parar de receber' : 'Receber devoluções'}
                  </button>
                </form>
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
