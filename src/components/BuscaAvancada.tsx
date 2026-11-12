'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CANAIS, ROTULO_CANAL, ROTULO_STATUS, STATUS_DEVOLUCAO } from '@/modules/devolucoes/dominio';
import { descreverFiltros, filtrosParaQuery, semFiltro, type FiltrosBusca } from '@/modules/devolucoes/filtros';
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, CAMPO, ROTULO } from './estilos';

const GRUPO = 'flex min-w-0 flex-col gap-3 rounded-lg border border-borda p-3';
const LEGENDA = 'px-1 text-[13px] font-bold';

type PropsCampo = {
  nome: string;
  rotulo: string;
  valor?: string;
  mono?: boolean;
  tipo?: 'text' | 'date';
  dica?: string;
  modo?: 'text' | 'numeric' | 'search';
};

function Campo({ nome, rotulo, valor, mono = false, tipo = 'text', dica, modo }: PropsCampo) {
  const id = `filtro-${nome}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={ROTULO}>
        {rotulo}
      </label>
      <input
        id={id}
        name={nome}
        type={tipo}
        defaultValue={valor ?? ''}
        placeholder={dica}
        inputMode={modo ?? (mono ? 'search' : undefined)}
        autoComplete="off"
        spellCheck={mono ? false : undefined}
        autoCapitalize={mono ? 'characters' : undefined}
        className={`${CAMPO}${mono ? ' font-mono' : ''}`}
      />
    </div>
  );
}

function Escolha({ nome, rotulo, valor, opcoes }: { nome: string; rotulo: string; valor?: string; opcoes: [string, string][] }) {
  const id = `filtro-${nome}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={ROTULO}>
        {rotulo}
      </label>
      <select id={id} name={nome} defaultValue={valor ?? ''} className={CAMPO}>
        <option value="">Todos</option>
        {opcoes.map(([codigo, texto]) => (
          <option key={codigo} value={codigo}>
            {texto}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Busca Avançada do PDF (spec §6.7). Formulário GET: os filtros ficam no endereço e funcionam sem JavaScript.
 * Celular: atrás do botão "Filtros", com as etiquetas dos filtros ativos sempre à vista. Computador (md+): aberto.
 */
export function BuscaAvancada({ acao, filtros }: { acao: string; filtros: FiltrosBusca }) {
  const [aberta, setAberta] = useState(false);
  const ativos = descreverFiltros(filtros);
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-expanded={aberta}
          aria-controls="painel-busca"
          onClick={() => setAberta((atual) => !atual)}
          className={`${BOTAO_SECUNDARIO} md:hidden`}
        >
          <svg
            aria-hidden="true"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M3 5h18M6 12h12M10 19h4" />
          </svg>
          Filtros{ativos.length > 0 ? ` (${ativos.length})` : ''}
        </button>
        {ativos.map((a) => (
          <Link
            key={a.chave}
            href={`${acao}${filtrosParaQuery(semFiltro(filtros, a.chave))}`}
            aria-label={`Remover filtro: ${a.texto}`}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-destaque-suave px-3 text-sm font-semibold text-destaque"
          >
            {a.texto}
            <span aria-hidden="true">×</span>
          </Link>
        ))}
      </div>
      <div
        id="painel-busca"
        className={`${aberta ? 'flex' : 'hidden'} flex-col gap-3 rounded-xl border border-borda bg-superficie p-4 md:flex`}
      >
        <h2 id="titulo-busca" className="text-base font-bold">
          Busca Avançada
        </h2>
        <form method="get" action={acao} role="search" aria-labelledby="titulo-busca" className="flex flex-col gap-3">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <fieldset className={GRUPO}>
              <legend className={LEGENDA}>Código de Rastreamento</legend>
              <Campo nome="rastreio" rotulo="Código de Rastreamento" valor={filtros.rastreio} mono />
            </fieldset>
            <fieldset className={GRUPO}>
              <legend className={LEGENDA}>Número do Pedido e ID da Reclamação/Mediação do Marketplace</legend>
              <Campo nome="pedido" rotulo="Número do Pedido" valor={filtros.pedido} mono />
              <Campo nome="reclamacao" rotulo="ID da Reclamação/Mediação" valor={filtros.reclamacao} mono />
            </fieldset>
            <fieldset className={GRUPO}>
              <legend className={LEGENDA}>Marketplace de Origem e Status Operacional Atual</legend>
              <Escolha nome="canal" rotulo="Marketplace de Origem" valor={filtros.canal} opcoes={CANAIS.map((c) => [c, ROTULO_CANAL[c]])} />
              <Escolha
                nome="status"
                rotulo="Status Operacional Atual"
                valor={filtros.status}
                opcoes={STATUS_DEVOLUCAO.map((s) => [s, ROTULO_STATUS[s]])}
              />
            </fieldset>
            <fieldset className={GRUPO}>
              <legend className={LEGENDA}>Fornecedor ou Código de Barras/Serial Number</legend>
              <Campo nome="fornecedor" rotulo="Fornecedor" valor={filtros.fornecedor} dica="Nome ou CNPJ" />
              <Campo nome="codigo" rotulo="Código de Barras / Serial Number" valor={filtros.codigo} mono />
            </fieldset>
            <fieldset className={GRUPO}>
              <legend className={LEGENDA}>Período</legend>
              <div className="grid grid-cols-2 gap-3">
                <Campo nome="de" rotulo="De" valor={filtros.de} tipo="date" />
                <Campo nome="ate" rotulo="Até" valor={filtros.ate} tipo="date" />
              </div>
            </fieldset>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <button type="submit" className={BOTAO_PRIMARIO}>
              Buscar
            </button>
            <Link href={acao} className={BOTAO_SECUNDARIO}>
              Limpar
            </Link>
          </div>
        </form>
      </div>
    </section>
  );
}
