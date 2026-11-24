'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { ALERTA_ATENCAO, ALERTA_ERRO, ALERTA_OK, BOTAO_PRIMARIO, BOTAO_SECUNDARIO, CAMPO, CARTAO, ROTULO } from '@/components/estilos';
import { EscolhaDaDevolucao } from '@/components/venda/EscolhaDaDevolucao';
import { useTravaToqueDuplo } from '@/components/venda/useTravaToqueDuplo';
import type { FichaVenda } from '@/modules/mercado-livre/ficha-venda';
import type { ResultadoEtiquetaAmarela } from './acoes';

export type AcoesEtiquetaAmarela = {
  procurar: (retiradaId: string, numero: string) => Promise<ResultadoEtiquetaAmarela>;
  darChegada: (retiradaId: string, devolucaoId: string, codigoLido: string) => Promise<ResultadoEtiquetaAmarela>;
};

const ID_PAINEL = 'painel-etiqueta-amarela';

/** "Dar chegada nesta devolução", com a trava do toque duplo (a ficha aparece depois do "Procurar"). */
function DarChegada({ ficha, ocupado, aoTocar }: { ficha: FichaVenda; ocupado: boolean; aoTocar: () => void }) {
  const cedoDemais = useTravaToqueDuplo();
  return (
    <button
      type="button"
      disabled={ocupado}
      onClick={() => {
        if (!cedoDemais()) aoTocar();
      }}
      className={`${BOTAO_PRIMARIO} min-h-14 w-full text-lg`}
    >
      Dar chegada nesta devolução{' '}
      <span className="sr-only">{ficha.codigo}</span>
    </button>
  );
}

function LinksDevolucoes({ codigos }: { codigos: string[] }) {
  return (
    <span className="flex flex-wrap gap-x-4">
      {codigos.map((codigo) => (
        <Link key={codigo} href={`/fluxo/devolucoes/${codigo}`} className="inline-flex min-h-11 items-center font-mono font-semibold underline">
          {codigo}
        </Link>
      ))}
    </span>
  );
}

/**
 * (extra, emenda E27) Etiqueta amarela: no meio da retirada do Full vem um pacote com a etiqueta amarela do ML, que é
 * devolução, não estoque. O botão abre o campo do número do pedido impresso na etiqueta; achada, a ficha da venda mostra
 * "Dar chegada nesta devolução", que registra a chegada como no Receber pacote. O produto não entra nos itens da
 * retirada; os produtos sem etiqueta amarela continuam pelo EAN.
 */
export function EtiquetaAmarela({ retiradaId, acoes }: { retiradaId: string; acoes: AcoesEtiquetaAmarela }) {
  const [aberta, setAberta] = useState(false);
  const [numero, setNumero] = useState('');
  const [resultado, setResultado] = useState<ResultadoEtiquetaAmarela | null>(null);
  const [ocupado, iniciar] = useTransition();
  const campoRef = useRef<HTMLInputElement>(null);
  const avisoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (aberta) campoRef.current?.focus();
  }, [aberta]);
  // A resposta recebe o foco (o leitor de tela a lê); a ficha não, para o Enter não cair no botão de dar a chegada.
  useEffect(() => {
    if (resultado && resultado.tipo !== 'escolher') avisoRef.current?.focus();
  }, [resultado]);

  function procurar() {
    if (!numero.trim()) {
      setResultado({ tipo: 'erro', mensagem: 'Digite o número do pedido.' });
      return;
    }
    iniciar(async () => setResultado(await acoes.procurar(retiradaId, numero)));
  }

  function darChegada(ficha: FichaVenda, codigoLido: string) {
    iniciar(async () => {
      const r = await acoes.darChegada(retiradaId, ficha.devolucaoId, codigoLido);
      setResultado(r);
      if (r.tipo === 'chegada') setNumero('');
    });
  }

  return (
    <section aria-labelledby="titulo-etiqueta-amarela" className={`${CARTAO} flex flex-col gap-3`}>
      <h2 id="titulo-etiqueta-amarela" className="text-base font-bold">
        Devolução do ML no pacote? <span className="font-normal text-texto-2">(extra)</span>
      </h2>
      <p className="text-sm text-texto-2">Produto com a etiqueta amarela do ML é devolução, não estoque: não bipe o EAN dele.</p>
      <button
        type="button"
        aria-expanded={aberta}
        aria-controls={ID_PAINEL}
        onClick={() => setAberta((a) => !a)}
        className={`${BOTAO_SECUNDARIO} min-h-14 w-full`}
      >
        Etiqueta amarela (devolução do ML)
      </button>
      {aberta && (
        <div id={ID_PAINEL} className="flex flex-col gap-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              procurar();
            }}
            className="flex flex-col gap-1.5"
          >
            <label htmlFor="pedido-etiqueta-amarela" className={ROTULO}>
              Número do pedido (impresso na etiqueta)
            </label>
            <div className="flex gap-2">
              <input
                ref={campoRef}
                id="pedido-etiqueta-amarela"
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                enterKeyHint="search"
                className={`${CAMPO} min-w-0 font-mono`}
              />
              <button type="submit" disabled={ocupado} className={`${BOTAO_SECUNDARIO} shrink-0`}>
                Procurar
              </button>
            </div>
          </form>
          {resultado?.tipo === 'escolher' && (
            <div key={resultado.lidaEm} className="flex flex-col gap-3 rounded-xl border-2 border-destaque p-3">
              <p className="text-sm font-semibold">
                {resultado.fichas.length > 1
                  ? `Este pedido tem ${resultado.fichas.length} devoluções esperando o pacote. Toque em “Dar chegada nesta devolução” na que chegou.`
                  : 'Confira a venda e toque em “Dar chegada nesta devolução”. A chegada ainda não foi registrada.'}
              </p>
              <EscolhaDaDevolucao
                fichas={resultado.fichas}
                acao={(ficha) => <DarChegada ficha={ficha} ocupado={ocupado} aoTocar={() => darChegada(ficha, resultado.codigoLido)} />}
              />
            </div>
          )}
          {resultado?.tipo === 'chegada' && (
            <div ref={avisoRef} tabIndex={-1} role="status" className={`${ALERTA_OK} flex flex-col gap-1`}>
              <p className="font-bold">Chegada registrada</p>
              <p>{resultado.mensagem}</p>
              <p>A devolução vai para a conferência; não entra nos itens desta retirada.</p>
              <LinksDevolucoes codigos={resultado.codigos} />
            </div>
          )}
          {resultado?.tipo === 'aviso' && (
            <div ref={avisoRef} tabIndex={-1} role="alert" className={`${ALERTA_ATENCAO} flex flex-col gap-1`}>
              <p className="font-bold">{resultado.titulo}</p>
              <p>{resultado.mensagem}</p>
              <LinksDevolucoes codigos={resultado.codigos} />
            </div>
          )}
          {resultado?.tipo === 'erro' && (
            <div ref={avisoRef} tabIndex={-1} role="alert" className={ALERTA_ERRO}>
              {resultado.mensagem}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
