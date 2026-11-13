import type { Metadata } from 'next';
import type { ParametrosBusca } from '@/lib/parametros';
import { PaginaEstoque } from './PaginaEstoque';

export const metadata: Metadata = { title: 'Estoque Bom · Destinação Fiscal e Estoque · Gestão de Devoluções' };

export default function PaginaEstoqueBom({ searchParams }: { searchParams: Promise<ParametrosBusca> }) {
  return <PaginaEstoque aba="BOM" searchParams={searchParams} />;
}
