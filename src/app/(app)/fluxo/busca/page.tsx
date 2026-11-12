import type { Metadata } from 'next';
import { ListaDevolucoes } from '@/components/ListaDevolucoes';
import { obterDb } from '@/db';
import { lerPagina, type ParametrosBusca } from '@/lib/parametros';
import { exigirPermissao } from '@/modules/auth/servidor';
import { buscarDevolucoes } from '@/modules/devolucoes/busca';
import { lerFiltros } from '@/modules/devolucoes/filtros';

export const metadata: Metadata = { title: 'Busca Avançada · Gestão de Devoluções' };

/** Resultado da Busca Avançada feita no quadro: todas as etapas e status. */
export default async function PaginaBusca({ searchParams }: { searchParams: Promise<ParametrosBusca> }) {
  await exigirPermissao('ver_listas');
  const parametros = await searchParams;
  const filtros = lerFiltros(parametros);
  const pagina = lerPagina(parametros);
  const { devolucoes, total } = await buscarDevolucoes(obterDb(), filtros, { pagina });
  return (
    <ListaDevolucoes titulo="Busca Avançada" acaoBusca="/fluxo/busca" filtros={filtros} devolucoes={devolucoes} total={total} pagina={pagina} />
  );
}
