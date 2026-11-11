import { EmBreve } from '@/components/EmBreve';
import { exigirPermissao } from '@/modules/auth/servidor';

export default async function PaginaConfiguracoes() {
  await exigirPermissao('administrar');
  return <EmBreve titulo="Configurações" fase={1} />;
}
