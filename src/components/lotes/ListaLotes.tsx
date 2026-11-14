import type { ReactNode } from 'react';
import { hrefDaPaginaLotes, LOTES_POR_PAGINA, type CartaoLoteVista, type FiltrosLotes } from '@/modules/lotes/consultas';
import { ROTULO_STATUS_LOTE, STATUS_LOTE } from '@/modules/lotes/dominio';
import { Paginacao } from '../Paginacao';
import { BOTAO_SECUNDARIO, CAMPO, ROTULO, VAZIO } from '../estilos';
import { CartaoLote } from './CartaoLote';

type Props = {
  titulo: string;
  lotes: CartaoLoteVista[];
  total: number;
  pagina: number;
  filtros: FiltrosLotes;
  fornecedores: { id: string; razaoSocial: string }[];
  acaoFiltro: string;
  vazio: string;
  antes?: ReactNode;
  depois?: ReactNode;
};

/** Lista de lotes com busca e filtros por fornecedor e status (spec §6.5 e §6.7). Servidor: o formulário é GET. */
export function ListaLotes({ titulo, lotes, total, pagina, filtros, fornecedores, acaoFiltro, vazio, antes, depois }: Props) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <h1 className="text-xl font-bold">{titulo}</h1>
      {antes}
      <form role="search" method="get" action={acaoFiltro} className="grid gap-2 md:grid-cols-[2fr_1fr_1fr_auto] md:items-end">
        <div className="flex flex-col gap-1">
          <label htmlFor="filtro-busca" className={ROTULO}>
            Buscar
          </label>
          <input id="filtro-busca" name="busca" type="search" defaultValue={filtros.busca ?? ''} placeholder="Lote, DEV, S/N, SKU ou rastreio" className={CAMPO} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="filtro-fornecedor" className={ROTULO}>
            Fornecedor
          </label>
          <select id="filtro-fornecedor" name="fornecedor" defaultValue={filtros.fornecedorId ?? ''} className={CAMPO}>
            <option value="">Todos</option>
            {fornecedores.map((f) => (
              <option key={f.id} value={f.id}>
                {f.razaoSocial}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="filtro-status" className={ROTULO}>
            Status
          </label>
          <select id="filtro-status" name="status" defaultValue={filtros.status ?? ''} className={CAMPO}>
            <option value="">Todos</option>
            {STATUS_LOTE.map((s) => (
              <option key={s} value={s}>
                {ROTULO_STATUS_LOTE[s]}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className={BOTAO_SECUNDARIO}>
          Filtrar
        </button>
      </form>
      {lotes.length === 0 ? (
        <p className={VAZIO}>{vazio}</p>
      ) : (
        <ul className="grid gap-2 md:grid-cols-2">
          {lotes.map((l) => (
            <li key={l.id} className="flex flex-col">
              <CartaoLote lote={l} href={`/lotes/${l.codigo}`} />
            </li>
          ))}
        </ul>
      )}
      <Paginacao pagina={pagina} total={total} porPagina={LOTES_POR_PAGINA} hrefDaPagina={(p) => hrefDaPaginaLotes(acaoFiltro, filtros, p)} />
      {depois}
    </div>
  );
}
