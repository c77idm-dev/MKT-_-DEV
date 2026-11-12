import type { Metadata } from 'next';
import { EmBreve } from '@/components/EmBreve';
import { exigirPermissao } from '@/modules/auth/servidor';

export const metadata: Metadata = { title: 'Contestações ML · Gestão de Devoluções' };

export default async function PaginaContestacoes() {
  await exigirPermissao('administrar');
  return <EmBreve titulo="Contestações ML" fase={3} />;
}
