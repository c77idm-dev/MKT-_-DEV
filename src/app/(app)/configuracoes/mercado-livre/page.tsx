import type { Metadata } from 'next';
import { EmBreve } from '@/components/EmBreve';
import { exigirPermissao } from '@/modules/auth/servidor';

export const metadata: Metadata = { title: 'Mercado Livre · Gestão de Devoluções' };

/** Fase 3 troca esta página. */
export default async function PaginaMercadoLivre() {
  await exigirPermissao('administrar');
  return <EmBreve titulo="Mercado Livre" fase={3} />;
}
