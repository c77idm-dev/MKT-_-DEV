'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import type { FalhaVista } from '@/modules/acabamento/falhas';
import { ALERTA_OK, BOTAO_PERIGO, BOTAO_PRIMARIO, CARTAO, VAZIO } from '../estilos';
import { ListaErros } from '../ListaErros';
import { BotaoConfirmar } from '../mercado-livre/BotaoConfirmar';
import { useEnvioFormulario } from '../useEnvioFormulario';
import { ESTADO_INICIAL_FALHAS, type EstadoFalhas } from './tipos';

/** Spec §6.8: tarefas que esgotaram as tentativas, com "Tentar de novo" e (extra) "Dispensar". Um estado só para a lista. */
export function ListaFalhas({
  falhas,
  acao,
}: {
  falhas: FalhaVista[];
  acao: (anterior: EstadoFalhas, dados: FormData) => Promise<EstadoFalhas>;
}) {
  const [estado, enviar, pendente] = useEnvioFormulario(acao, ESTADO_INICIAL_FALHAS, 'erros-falhas');
  // Qual cartão e qual operação estão em andamento, para o rótulo "Reenviando…"/"Dispensando…" só no botão certo.
  const [enviando, setEnviando] = useState<{ id: string; operacao: string } | null>(null);
  function aoEnviar(evento: FormEvent<HTMLFormElement>) {
    const dados = new FormData(evento.currentTarget);
    setEnviando({ id: String(dados.get('falha')), operacao: String(dados.get('operacao')) });
    enviar(evento);
  }
  return (
    <div className="flex flex-col gap-3">
      <div id="retorno-falhas" aria-live="polite" className="flex flex-col gap-3">
        {estado.ok ? <p className={ALERTA_OK}>{estado.ok}</p> : null}
        <ListaErros erros={estado.erros} id="erros-falhas" />
      </div>
      {falhas.length === 0 ? (
        <p className={VAZIO}>Nenhuma tarefa em Falhas.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {falhas.map((f) => (
            <li key={f.id}>
              <article aria-labelledby={`falha-${f.id}`} className={`${CARTAO} flex flex-col gap-2`}>
                <h2 id={`falha-${f.id}`} className="text-base font-bold">
                  {f.rotuloTarefa}
                </h2>
                <p className="break-words text-sm">{f.erro}</p>
                <div className="flex flex-col gap-0.5 text-[13px] text-texto-2">
                  {f.ocorrencias > 1 ? <p>Falhou {f.ocorrencias} vezes</p> : null}
                  <p>{f.tentativas} tentativas</p>
                  <p>Última falha: {f.ultimaFalhaEm}</p>
                  {f.primeiraFalhaEm !== f.ultimaFalhaEm ? <p>Primeira falha: {f.primeiraFalhaEm}</p> : null}
                  {f.referencia ? (
                    <p>
                      Referência:{' '}
                      {f.referencia.href ? (
                        <Link href={f.referencia.href} className="inline-flex min-h-11 items-center font-semibold text-destaque">
                          {f.referencia.texto}
                        </Link>
                      ) : (
                        f.referencia.texto
                      )}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <form onSubmit={aoEnviar} className="sm:w-auto">
                    <input type="hidden" name="falha" value={f.id} />
                    <input type="hidden" name="operacao" value="reenviar" />
                    <button type="submit" disabled={pendente} className={`${BOTAO_PRIMARIO} w-full sm:w-auto`}>
                      {pendente && enviando?.id === f.id && enviando.operacao === 'reenviar' ? 'Reenviando…' : 'Tentar de novo'}
                    </button>
                  </form>
                  <form onSubmit={aoEnviar} className="sm:w-auto">
                    <input type="hidden" name="falha" value={f.id} />
                    <input type="hidden" name="operacao" value="dispensar" />
                    <BotaoConfirmar
                      rotulo="Dispensar"
                      rotuloConfirmar="Toque de novo para dispensar"
                      desabilitado={pendente}
                      pendente={pendente && enviando?.id === f.id && enviando.operacao === 'dispensar'}
                      rotuloPendente="Dispensando…"
                      className={`${BOTAO_PERIGO} sm:w-auto`}
                    />
                  </form>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
