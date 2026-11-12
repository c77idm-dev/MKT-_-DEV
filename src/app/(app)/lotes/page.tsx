import type { Metadata } from 'next';
import { EmBreve } from '@/components/EmBreve';
import { exigirPermissao } from '@/modules/auth/servidor';

export const metadata: Metadata = { title: 'Lotes e Remessas · Gestão de Devoluções' };

export default async function PaginaLotes() {
  await exigirPermissao('gerir_fiscal');
  return <EmBreve titulo="Lotes e Remessas" fase={5} />;
}
