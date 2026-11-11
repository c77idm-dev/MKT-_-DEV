import { EmBreve } from '@/components/EmBreve';
import { exigirPermissao } from '@/modules/auth/servidor';

export default async function PaginaContestacoes() {
  await exigirPermissao('administrar');
  return <EmBreve titulo="Contestações ML" fase={3} />;
}
