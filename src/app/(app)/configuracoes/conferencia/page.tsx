import type { Metadata } from 'next';
import { EmBreve } from '@/components/EmBreve';
import { exigirPermissao } from '@/modules/auth/servidor';

export const metadata: Metadata = { title: 'Conferência e mídias · Gestão de Devoluções' };

/** Fase 2 troca esta página. */
export default async function PaginaConferenciaMidias() {
  await exigirPermissao('administrar');
  return <EmBreve titulo="Conferência e mídias" fase={2} />;
}
