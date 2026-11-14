import type { Metadata } from 'next';
import type { ParametrosBusca } from '@/lib/parametros';
import { PaginaEstoque } from '../PaginaEstoque';

export const metadata: Metadata = { title: 'Estoque Problema · Destinação Fiscal e Estoque · Gestão de Devoluções' };

export default function PaginaEstoqueProblema({ searchParams }: { searchParams: Promise<ParametrosBusca> }) {
  return <PaginaEstoque aba="PROBLEMA" searchParams={searchParams} />;
}
