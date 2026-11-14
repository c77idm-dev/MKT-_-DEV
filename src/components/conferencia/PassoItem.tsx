'use client';

import { useState } from 'react';
import { ALERTA_ATENCAO, ALERTA_OK, BOTAO_SECUNDARIO, CAMPO, CARTAO, ROTULO } from '@/components/estilos';
import type { ResultadoEan } from '@/modules/conferencia/itens';
import type { ItemConferencia } from '@/modules/conferencia/leitura';
import type { EntradaItem } from '@/modules/conferencia/regras';
import { DESCRICAO_EVIDENCIA, type TipoEvidencia } from '@/modules/midia/dominio';
import type { EstadoSlot } from './estadoSlot';
import { LeitorCodigo } from './LeitorCodigo';
import { SlotEvidencia } from './SlotEvidencia';

function textoDaLeitura(ean: ResultadoEan): string {
  switch (ean.situacao) {
    case 'confere':
      return 'Confere com o esperado.';
    case 'confirmado':
      return 'Produto confirmado sem leitura.';
    case 'sem_referencia':
      return 'O produto esperado não tem EAN no cadastro: confira pela descrição.';
    case 'diverge':
      return `Diferente do esperado: ${ean.produtoRecebido ? `${ean.produtoRecebido.sku} · ${ean.produtoRecebido.descricao}` : 'produto fora do cadastro'}. Sugerimos Estoque Problema com o motivo Divergente.`;
  }
}

type Props = {
  item: ItemConferencia;
  valor: EntradaItem;
  ean: ResultadoEan | null;
  slot: (tipo: TipoEvidencia, itemId: string) => EstadoSlot;
  aoMudar: (parcial: Partial<EntradaItem>, salvarAgora?: boolean) => void;
  aoConferirEan: (lido: string | null) => void;
  aoEscolher: (tipo: TipoEvidencia, arquivo: File) => void;
  aoTentarDeNovo: (idCliente: string) => void;
};

/** Spec §6.3, passo 3: Foto 3, leitura do código de barras, Foto 4 com S/N, lote e validade; ou "não veio no pacote". */
export function PassoItem({ item, valor, ean, slot, aoMudar, aoConferirEan, aoEscolher, aoTentarDeNovo }: Props) {
  const [digitado, setDigitado] = useState('');
  const base = `unidade-${item.id}`;
  const confere = ean?.situacao === 'confere' || ean?.situacao === 'confirmado';
  return (
    <section aria-labelledby={`${base}-titulo`} className="flex flex-col gap-3">
      <div className={`${CARTAO} flex flex-col gap-1`}>
        <h2 id={`${base}-titulo`} className="text-lg font-bold">
          Unidade {item.unidade}
        </h2>
        <p className="break-all font-mono text-[13px] font-semibold">{item.sku}</p>
        <p className="text-[15px]">{item.descricao ?? 'SKU fora do cadastro de produtos'}</p>
        <p className="text-sm text-texto-2">
          EAN esperado: <span className="font-mono">{item.eanEsperado ?? 'sem EAN no cadastro'}</span>
        </p>
      </div>

      {valor.decisao === 'AUSENTE' ? (
        <div className={`${ALERTA_ATENCAO} flex flex-col gap-2`}>
          <p className="text-[15px] font-semibold">Unidade marcada como ausente (não veio no pacote).</p>
          <button type="button" onClick={() => aoMudar({ decisao: null, motivo: null }, true)} className={BOTAO_SECUNDARIO}>
            Desfazer: a unidade veio
          </button>
        </div>
      ) : (
        <>
          <SlotEvidencia
            titulo="Foto 3"
            descricao={DESCRICAO_EVIDENCIA.FOTO_3_PRODUTO}
            estado={slot('FOTO_3_PRODUTO', item.id)}
            aoEscolher={(a) => aoEscolher('FOTO_3_PRODUTO', a)}
            aoTentarDeNovo={aoTentarDeNovo}
          />

          <section aria-labelledby={`${base}-ean`} className={`${CARTAO} flex flex-col gap-3`}>
            <h3 id={`${base}-ean`} className="text-base font-bold">
              Código de barras
            </h3>
            <LeitorCodigo rotulo="Ler código de barras" titulo="Leitor do código de barras" aoLer={(codigo) => aoConferirEan(codigo)} />
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (digitado.trim()) aoConferirEan(digitado);
              }}
              className="flex flex-col gap-1.5"
            >
              <label htmlFor={`${base}-ean-lido`} className={ROTULO}>
                EAN lido
              </label>
              <div className="flex gap-2">
                <input
                  id={`${base}-ean-lido`}
                  value={digitado}
                  onChange={(e) => setDigitado(e.target.value)}
                  inputMode="numeric"
                  autoComplete="off"
                  spellCheck={false}
                  enterKeyHint="go"
                  className={`${CAMPO} min-w-0 font-mono`}
                />
                <button type="submit" className={`${BOTAO_SECUNDARIO} shrink-0`}>
                  Conferir
                </button>
              </div>
            </form>
            <button type="button" onClick={() => aoConferirEan(null)} className="min-h-11 text-left text-sm font-semibold text-destaque underline">
              Não dá para ler: o produto é o esperado
            </button>
            {ean && (
              <p role="status" className={confere ? ALERTA_OK : ALERTA_ATENCAO}>
                {confere && <span aria-hidden="true">✓ </span>}
                {textoDaLeitura(ean)}
              </p>
            )}
          </section>

          <SlotEvidencia
            titulo="Foto 4"
            descricao={DESCRICAO_EVIDENCIA.FOTO_4_CODIGO_SERIAL}
            estado={slot('FOTO_4_CODIGO_SERIAL', item.id)}
            aoEscolher={(a) => aoEscolher('FOTO_4_CODIGO_SERIAL', a)}
            aoTentarDeNovo={aoTentarDeNovo}
          />

          <div className={`${CARTAO} flex flex-col gap-3`}>
            {(
              [
                ['serial', 'Nº de série (S/N)', undefined],
                ['loteFabricacao', 'Lote', undefined],
                ['validade', 'Validade', '12/2027'],
              ] as const
            ).map(([campo, rotulo, exemplo]) => (
              <div key={campo} className="flex flex-col gap-1.5">
                <label htmlFor={`${base}-${campo}`} className={ROTULO}>
                  {rotulo}
                </label>
                <input
                  id={`${base}-${campo}`}
                  value={valor[campo]}
                  onChange={(e) => aoMudar({ [campo]: e.target.value })}
                  placeholder={exemplo}
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  className={`${CAMPO} font-mono`}
                />
              </div>
            ))}
          </div>

          <button type="button" onClick={() => aoMudar({ decisao: 'AUSENTE', motivo: 'AUSENTE' }, true)} className={BOTAO_SECUNDARIO}>
            Não veio no pacote (ausente)
          </button>
        </>
      )}
    </section>
  );
}
