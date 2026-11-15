'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import type { UnidadeSemFornecedorVista } from '@/modules/lotes/consultas';
import { ListaErros } from '../ListaErros';
import { MensagemSucesso } from '../MensagemSucesso';
import { useEnvioFormulario } from '../useEnvioFormulario';
import { BOTAO_PRIMARIO, CAMPO, CARTAO, ROTULO } from '../estilos';
import { ESTADO_INICIAL_LOTE, type EstadoAcaoLote } from './tipos';

type Props = {
  unidades: UnidadeSemFornecedorVista[];
  total: number;
  /** Href de "Ver todas (N)" ou null. */
  verTodas: string | null;
  acao: (anterior: EstadoAcaoLote, dados: FormData) => Promise<EstadoAcaoLote>;
};

/**
 * Spec §5.3: unidades PROBLEMA sem fornecedor. O Fiscal informa o SKU do produto que chegou de fato.
 * Um estado só para a seção (decisão 23): a mensagem de sucesso fica mesmo quando a última unidade sai da lista.
 */
export function PendenciasSemFornecedor({ unidades, total, verTodas, acao }: Props) {
  const [estado, enviar, pendente] = useEnvioFormulario(acao, ESTADO_INICIAL_LOTE, 'erros-sem-fornecedor');
  // Qual unidade foi enviada: só o botão do cartão tocado mostra "Associando…".
  const [enviado, setEnviado] = useState('');
  function aoEnviar(evento: FormEvent<HTMLFormElement>) {
    setEnviado(String(new FormData(evento.currentTarget).get('item') ?? ''));
    enviar(evento);
  }
  if (unidades.length === 0 && !estado.ok && estado.erros.length === 0) return null;
  return (
    <section id="sem-fornecedor" aria-labelledby="titulo-sem-fornecedor" className="flex scroll-mt-4 flex-col gap-3">
      <h2 id="titulo-sem-fornecedor" className="text-lg font-bold">{`Sem fornecedor (${total})`}</h2>
      <div id="retorno-sem-fornecedor" aria-live="polite" className="flex flex-col gap-2">
        {estado.ok && <MensagemSucesso key={estado.ok} texto={estado.ok} />}
        <ListaErros erros={estado.erros} id="erros-sem-fornecedor" />
      </div>
      {unidades.length > 0 && (
        <p className="text-sm text-texto-2">
          Escolha o produto que chegou de fato. Ele precisa ter fornecedor em{' '}
          <Link href="/cadastros/produtos" className="font-semibold text-destaque underline">
            Produtos e Fornecedores
          </Link>
          .
        </p>
      )}
      <ul className="grid gap-2 md:grid-cols-2">
        {unidades.map((u) => {
          const idCampo = `sku-${u.itemId}`;
          return (
            <li key={u.itemId} className={`${CARTAO} flex flex-col gap-2`}>
              <div className="flex flex-col gap-0.5 text-sm">
                <span className="font-mono font-semibold">{`${u.devolucaoCodigo} · unidade ${u.unidade}`}</span>
                <span className="break-words">{`${u.sku} · ${u.descricao}`}</span>
                <span className="text-xs text-texto-2">{`Motivo: ${u.motivo} · S/N: ${u.serial}`}</span>
              </div>
              <form onSubmit={aoEnviar} className="flex flex-col gap-2">
                <input type="hidden" name="item" value={u.itemId} />
                <label htmlFor={idCampo} className={ROTULO}>{`SKU do produto recebido (unidade ${u.unidade} da ${u.devolucaoCodigo})`}</label>
                <input id={idCampo} name="sku" defaultValue={u.skuSugerido} autoCapitalize="characters" autoComplete="off" className={CAMPO} />
                <button type="submit" disabled={pendente} className={`${BOTAO_PRIMARIO} w-full sm:w-auto`}>
                  {pendente && enviado === u.itemId ? 'Associando…' : 'Associar produto'}
                </button>
              </form>
            </li>
          );
        })}
      </ul>
      {verTodas && (
        <Link href={verTodas} className="inline-flex min-h-11 items-center text-sm font-semibold text-destaque">
          {`Ver todas (${total})`}
        </Link>
      )}
    </section>
  );
}
