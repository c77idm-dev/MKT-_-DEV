import { EmBreve } from '@/components/EmBreve';
import { exigirPermissao } from '@/modules/auth/servidor';

export default async function PaginaCadastros() {
  await exigirPermissao('gerir_catalogo');
  return <EmBreve titulo="Produtos e Fornecedores" fase={1} />;
}
