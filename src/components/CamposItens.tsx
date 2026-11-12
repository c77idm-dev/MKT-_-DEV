'use client';

import { useState } from 'react';
import { LIMITE_QUANTIDADE } from '@/modules/devolucoes/dominio';
import { BOTAO_SECUNDARIO, CAMPO, ROTULO } from './estilos';

export type ItemInicial = { sku: string; quantidade: string };
type Linha = ItemInicial & { chave: number };

/** Itens da devolução (SKU + quantidade), uma linha por SKU. Cabe em 390 px: SKU, quantidade e o botão de remover. */
export function CamposItens({
  iniciais = [{ sku: '', quantidade: '1' }],
  permitirVazio = false,
}: {
  iniciais?: ItemInicial[];
  permitirVazio?: boolean;
}) {
  const [estado, setEstado] = useState<{ linhas: Linha[]; proxima: number }>(() => ({
    linhas: iniciais.map((item, i) => ({ ...item, chave: i })),
    proxima: iniciais.length,
  }));
  const { linhas } = estado;
  const podeRemover = permitirVazio || linhas.length > 1;

  function adicionar() {
    setEstado((atual) => ({ linhas: [...atual.linhas, { sku: '', quantidade: '1', chave: atual.proxima }], proxima: atual.proxima + 1 }));
  }

  function remover(chave: number) {
    setEstado((atual) => ({ ...atual, linhas: atual.linhas.filter((l) => l.chave !== chave) }));
  }

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-sm font-bold">Itens</legend>
      {linhas.length === 0 && <p className="text-sm text-texto-2">Nenhum item. Toque em &quot;Adicionar item&quot; se já souber o que veio.</p>}
      {linhas.map((linha, i) => (
        <div key={linha.chave} className="flex items-end gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <label htmlFor={`sku-${linha.chave}`} className={ROTULO}>
              SKU <span className="sr-only">do item {i + 1}</span>
            </label>
            <input
              id={`sku-${linha.chave}`}
              name="sku"
              defaultValue={linha.sku}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={60}
              className={`${CAMPO} font-mono`}
            />
          </div>
          <div className="flex w-20 shrink-0 flex-col gap-1.5">
            <label htmlFor={`qtd-${linha.chave}`} className={ROTULO}>
              Qtd. <span className="sr-only">(quantidade do item {i + 1})</span>
            </label>
            <input
              id={`qtd-${linha.chave}`}
              name="quantidade"
              type="number"
              inputMode="numeric"
              min={1}
              max={LIMITE_QUANTIDADE}
              defaultValue={linha.quantidade}
              className={CAMPO}
            />
          </div>
          {podeRemover && (
            <button
              type="button"
              onClick={() => remover(linha.chave)}
              aria-label={`Remover item ${i + 1}`}
              className="flex size-11 shrink-0 items-center justify-center rounded-full border border-borda-forte text-texto-2"
            >
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          )}
        </div>
      ))}
      <button type="button" onClick={adicionar} className={BOTAO_SECUNDARIO}>
        Adicionar item
      </button>
    </fieldset>
  );
}
