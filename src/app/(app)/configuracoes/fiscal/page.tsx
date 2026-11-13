import type { Metadata } from 'next';
import { EmBreve } from '@/components/EmBreve';
import { exigirPermissao } from '@/modules/auth/servidor';

export const metadata: Metadata = { title: 'Fiscal · Gestão de Devoluções' };

/** Fase 4 troca esta página. */
export default async function PaginaFiscal() {
  await exigirPermissao('administrar');
  return <EmBreve titulo="Fiscal" fase={4} />;
}
