import type { Metadata } from 'next';
import { EmBreve } from '@/components/EmBreve';
import { exigirPermissao } from '@/modules/auth/servidor';

export const metadata: Metadata = { title: 'Falhas · Gestão de Devoluções' };

/** Fase 6 troca esta página. */
export default async function PaginaFalhas() {
  await exigirPermissao('administrar');
  return <EmBreve titulo="Falhas" fase={6} />;
}
