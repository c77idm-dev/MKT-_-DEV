'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { LeitorCodigo } from '@/components/conferencia/LeitorCodigo';
import { SlotEvidencia } from '@/components/conferencia/SlotEvidencia';
import { estadoDoSlot, type EvidenciaServidor } from '@/components/conferencia/estadoSlot';
import { ALERTA_ATENCAO, ALERTA_ERRO, BOTAO_PRIMARIO, BOTAO_SECUNDARIO, CAMPO, CARTAO, ROTULO } from '@/components/estilos';
import { comprimirFoto } from '@/components/midia/comprimirFoto';
import { novoIdCliente } from '@/components/midia/idCliente';
import { useFilaEnvios } from '@/components/midia/useFilaEnvios';
import type { TipoEvidencia } from '@/modules/midia/dominio';
import type { ItemRetiradaVista } from '@/modules/retiradas/consultas';
import { pendenciasParaConcluir, TAMANHO_DESCRICAO } from '@/modules/retiradas/dominio';
import type { ResultadoAcaoRetirada } from './acoes';
import { ItemRetirada } from './ItemRetirada';

export type AcoesRetirada = {
  bipar: (retiradaId: string, ean: string, descricao: string | null) => Promise<ResultadoAcaoRetirada>;
  quantidade: (retiradaId: string, itemId: string, delta: 1 | -1) => Promise<ResultadoAcaoRetirada>;
  remover: (retiradaId: string, itemId: string) => Promise<ResultadoAcaoRetirada>;
  concluir: (retiradaId: string) => Promise<ResultadoAcaoRetirada>;
};

type Props = {
  retirada: { id: string; codigo: string; codigoEtiqueta: string };
  itensIniciais: ItemRetiradaVista[];
  evidencias: EvidenciaServidor[];
  acoes: AcoesRetirada;
};

/** Erro com foco (spec: erro em role="alert" com foco): o leitor de tela anuncia e quem usa teclado já está nele. */
function Alerta({ mensagens }: { mensagens: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, [mensagens]);
  return (
    <div ref={ref} tabIndex={-1} role="alert" className={`${ALERTA_ERRO} flex flex-col gap-1`}>
      {mensagens.map((m) => (
        <p key={m}>{m}</p>
      ))}
    </div>
  );
}

const total = (itens: ItemRetiradaVista[]) => itens.reduce((n, i) => n + i.quantidade, 0);

/**
 * Tela da retirada do Full (melhoria 3), mobile-first: aviso, foto da etiqueta, "Bipar produto", os itens com − e + e
 * foto opcional, e "Concluir retirada" no rodapé fixo. As fotos usam a mesma captura, compressão e fila offline da conferência.
 */
export function TelaRetirada({ retirada, itensIniciais, evidencias, acoes }: Props) {
  const router = useRouter();
  const [itens, setItens] = useState(itensIniciais);
  const [ean, setEan] = useState('');
  const [pedido, setPedido] = useState<string | null>(null);
  const [descricao, setDescricao] = useState('');
  const [aviso, setAviso] = useState('');
  const [erroBipe, setErroBipe] = useState<string[] | null>(null);
  const [erroConcluir, setErroConcluir] = useState<string[] | null>(null);
  const [ocupado, iniciar] = useTransition();
  const campoEanRef = useRef<HTMLInputElement>(null);
  const campoDescricaoRef = useRef<HTMLInputElement>(null);
  const { envios, concluidos, adicionar, tentarDeNovo, descartar } = useFilaEnvios(retirada.id, undefined, 'retirada');
  const [erroFoto, setErroFoto] = useState<string | null>(null);

  useEffect(() => {
    if (pedido) campoDescricaoRef.current?.focus();
  }, [pedido]);

  const slot = (tipo: TipoEvidencia, itemId: string | null) => estadoDoSlot({ tipo, itemId }, { envios, concluidos, evidencias });
  const fotoEtiqueta = slot('FOTO_1_ETIQUETA', null);

  async function escolherFoto(tipo: TipoEvidencia, itemId: string | null, arquivo: File) {
    setErroFoto(null);
    try {
      await adicionar({ idCliente: novoIdCliente(), itemId, tipo, nome: `${tipo.toLowerCase()}.jpg`, tipoConteudo: 'image/jpeg', arquivo: await comprimirFoto(arquivo) });
    } catch {
      setErroFoto('Não foi possível ler esta foto. Tire de novo pela câmera.');
    }
  }

  function aplicar(r: ResultadoAcaoRetirada, aoErro: (m: string[]) => void): boolean {
    if (!r.ok) {
      aoErro([r.mensagem]);
      return false;
    }
    setItens(r.itens);
    return true;
  }

  function bipar(lido: string, texto: string | null) {
    if (!lido.trim()) return;
    setErroBipe(null);
    setAviso('');
    iniciar(async () => {
      const r = await acoes.bipar(retirada.id, lido, texto);
      if (!aplicar(r, setErroBipe) || !r.ok) return;
      if (r.pedirDescricao) {
        setPedido(r.pedirDescricao);
        setDescricao('');
        return;
      }
      setPedido(null);
      setEan('');
      const somado = r.itens.find((i) => i.eanLido === lido.replace(/\s+/g, '').toUpperCase()) ?? null;
      setAviso(somado ? `Somado: ${somado.descricao} (${somado.quantidade}).` : 'Produto somado.');
      if (window.matchMedia?.('(pointer: fine)').matches) campoEanRef.current?.focus();
    });
  }

  function mudarItem(fazer: () => Promise<ResultadoAcaoRetirada>) {
    setErroBipe(null);
    iniciar(async () => {
      aplicar(await fazer(), setErroBipe);
    });
  }

  /**
   * Remover o item: antes, tira da fila do aparelho as fotos dele que ainda não subiram. Sem o item, o servidor recusaria
   * o envio (400) e a foto ficaria presa no IndexedDB.
   */
  function remover(itemId: string) {
    mudarItem(async () => {
      for (const e of envios.filter((x) => x.itemId === itemId)) await descartar(e.idCliente);
      return acoes.remover(retirada.id, itemId);
    });
  }

  function concluir() {
    const faltas = pendenciasParaConcluir({ fotoEtiqueta: fotoEtiqueta.tipo === 'enviada', itens: itens.length });
    if (fotoEtiqueta.tipo === 'enviando' || fotoEtiqueta.tipo === 'aguardando') {
      faltas.splice(faltas.indexOf('Tire a foto da etiqueta.'), 1, 'Espere a foto da etiqueta terminar de enviar.');
    }
    // Depois de conferida, o servidor recusa fotos (409): a conclusão espera as dos itens que ainda estão subindo.
    if (envios.some((e) => e.itemId !== null && e.estado !== 'erro')) faltas.push('Espere as fotos dos itens terminarem de enviar.');
    if (faltas.length > 0) {
      setErroConcluir(faltas);
      return;
    }
    setErroConcluir(null);
    iniciar(async () => {
      const r = await acoes.concluir(retirada.id);
      if (!aplicar(r, setErroConcluir)) return;
      // As fotos de item recusadas de vez pelo servidor não têm mais para onde ir: saem do aparelho.
      for (const e of envios.filter((x) => x.itemId !== null && x.estado === 'erro')) await descartar(e.idCliente);
      router.refresh();
    });
  }

  const unidades = total(itens);
  return (
    <div className="flex flex-col gap-3">
      <p className={`${ALERTA_ATENCAO} text-[15px] font-semibold`}>Isto não é devolução. Confira os itens e guarde no estoque.</p>

      <section aria-labelledby="titulo-foto-etiqueta" className="flex flex-col gap-2">
        <h2 id="titulo-foto-etiqueta" className="text-base font-bold">
          Foto da etiqueta
        </h2>
        {erroFoto && <Alerta mensagens={[erroFoto]} />}
        <SlotEvidencia
          titulo="Foto da etiqueta"
          descricao={`Etiqueta ${retirada.codigoEtiqueta}`}
          estado={fotoEtiqueta}
          aoEscolher={(a) => void escolherFoto('FOTO_1_ETIQUETA', null, a)}
          aoTentarDeNovo={(id) => void tentarDeNovo(id)}
        />
      </section>

      <section aria-labelledby="titulo-bipar" className={`${CARTAO} flex flex-col gap-3`}>
        <h2 id="titulo-bipar" className="text-base font-bold">
          Bipar produto
        </h2>
        <LeitorCodigo
          rotulo="Ler código de barras"
          titulo="Leitor do código de barras"
          instrucao="Aponte para o código de barras do produto."
          aoLer={(codigo) => bipar(codigo, null)}
        />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            bipar(ean, null);
          }}
          className="flex flex-col gap-1.5"
        >
          <label htmlFor="ean-retirada" className={ROTULO}>
            EAN do produto
          </label>
          <div className="flex gap-2">
            <input
              ref={campoEanRef}
              id="ean-retirada"
              value={ean}
              onChange={(e) => setEan(e.target.value)}
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="go"
              className={`${CAMPO} min-w-0 font-mono`}
            />
            <button type="submit" disabled={ocupado} className={`${BOTAO_SECUNDARIO} shrink-0`}>
              Somar
            </button>
          </div>
        </form>
        {pedido && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              bipar(pedido, descricao);
            }}
            className={`${ALERTA_ATENCAO} flex flex-col gap-2`}
          >
            <p>
              O EAN <span className="break-all font-mono">{pedido}</span> não está no cadastro. Escreva uma descrição curta do produto.
            </p>
            <label htmlFor="descricao-retirada" className={ROTULO}>
              Descrição curta
            </label>
            <input
              ref={campoDescricaoRef}
              id="descricao-retirada"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              maxLength={TAMANHO_DESCRICAO}
              autoComplete="off"
              className={CAMPO}
            />
            <div className="flex flex-col gap-2 sm:flex-row">
              <button type="submit" disabled={ocupado || !descricao.trim()} className={BOTAO_PRIMARIO}>
                Incluir sem cadastro
              </button>
              <button type="button" onClick={() => setPedido(null)} className={BOTAO_SECUNDARIO}>
                Cancelar
              </button>
            </div>
          </form>
        )}
        {erroBipe && <Alerta mensagens={erroBipe} />}
        <p role="status" className={aviso ? 'text-sm font-semibold text-bom' : 'sr-only'}>
          {aviso}
        </p>
      </section>

      <section aria-labelledby="titulo-itens" className="flex flex-col gap-3">
        <h2 id="titulo-itens" className="text-base font-bold">
          Itens ({unidades})
        </h2>
        {itens.length === 0 ? (
          <p className="rounded-lg border border-dashed border-borda-forte px-3 py-6 text-center text-sm text-texto-2">Nenhum produto bipado ainda.</p>
        ) : (
          itens.map((item) => (
            <ItemRetirada
              key={item.id}
              item={item}
              ocupado={ocupado}
              foto={slot('FOTO_3_PRODUTO', item.id)}
              aoMudarQuantidade={(delta) => mudarItem(() => acoes.quantidade(retirada.id, item.id, delta))}
              aoRemover={() => remover(item.id)}
              aoEscolherFoto={(a) => void escolherFoto('FOTO_3_PRODUTO', item.id, a)}
              aoTentarDeNovo={(id) => void tentarDeNovo(id)}
            />
          ))
        )}
      </section>

      <div className="acima-barra sticky z-20 -mx-4 flex flex-col gap-2 border-t border-borda bg-superficie px-4 py-3 sm:-mx-8 sm:px-8 md:bottom-0">
        {erroConcluir && <Alerta mensagens={erroConcluir} />}
        <button type="button" onClick={concluir} disabled={ocupado} className={`${BOTAO_PRIMARIO} min-h-14 w-full text-lg`}>
          Concluir retirada
        </button>
        <p className="text-center text-xs text-texto-2">
          {unidades} {unidades === 1 ? 'item' : 'itens'} · {retirada.codigo}
        </p>
      </div>
    </div>
  );
}
