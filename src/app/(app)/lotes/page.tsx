import { EmBreve } from '@/components/EmBreve';
import { exigirPermissao } from '@/modules/auth/servidor';

export default async function PaginaLotes() {
  await exigirPermissao('gerir_fiscal');
  return <EmBreve titulo="Lotes e Remessas" fase={5} />;
}
