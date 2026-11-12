import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { ListaDevolucoes } from '@/components/ListaDevolucoes';
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, VAZIO } from '@/components/estilos';
import { obterDb } from '@/db';
import { lerPagina, type ParametrosBusca } from '@/lib/parametros';
import { pode } from '@/modules/auth/permissoes';
import { exigirPermissao } from '@/modules/auth/servidor';
import { buscarDevolucoes } from '@/modules/devolucoes/busca';
import { statusDaEtapa } from '@/modules/devolucoes/dominio';
import { ETAPAS } from '@/modules/devolucoes/etapas';
import { lerFiltros } from '@/modules/devolucoes/filtros';

export const metadata: Metadata = { title: 'Etapa · Gestão de Devoluções' };

type Props = { params: Promise<{ numero: string }>; searchParams: Promise<ParametrosBusca> };

/** Botões do topo de cada etapa (só para quem opera devoluções). */
function acoesDaEtapa(numero: number, podeOperar: boolean): ReactNode {
  if (!podeOperar) return null;
  if (numero === 1) {
    return (
      <>
        <Link href="/fluxo/devolucoes/nova" className={BOTAO_PRIMARIO}>
          Nova devolução
        </Link>
        <Link href="/importacoes/devolucoes" className={BOTAO_SECUNDARIO}>
          Importar planilha
        </Link>
      </>
    );
  }
  if (numero === 2) {
    return (
      <Link href="/fluxo/recebimento" className={BOTAO_PRIMARIO}>
        Recebimento
      </Link>
    );
  }
  return null;
}

export default async function PaginaEtapa({ params, searchParams }: Props) {
  const usuario = await exigirPermissao('ver_listas');
  const { numero } = await params;
  const etapa = ETAPAS.find((e) => String(e.numero) === numero);
  if (!etapa) notFound();
  // Etapa 5: os lotes por fornecedor (remessas) chegam numa fase posterior; até lá não há lista de devoluções aqui.
  if (etapa.numero === 5) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <h1 className="text-xl font-bold">{etapa.titulo}</h1>
        <p className={VAZIO}>Os lotes por fornecedor aparecem aqui quando a conferência estiver pronta.</p>
      </div>
    );
  }
  const parametros = await searchParams;
  const filtros = lerFiltros(parametros);
  const pagina = lerPagina(parametros);
  const { devolucoes, total } = await buscarDevolucoes(obterDb(), filtros, {
    status: statusDaEtapa(etapa.numero),
    ordem: etapa.numero === 2 ? 'chegada' : 'recentes',
    pagina,
  });
  return (
    <ListaDevolucoes
      titulo={etapa.titulo}
      acaoBusca={`/fluxo/etapa/${etapa.numero}`}
      filtros={filtros}
      devolucoes={devolucoes}
      total={total}
      pagina={pagina}
      acoes={acoesDaEtapa(etapa.numero, pode(usuario.perfil, 'operar_devolucoes'))}
    />
  );
}
