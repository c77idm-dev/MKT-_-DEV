import { redirect } from 'next/navigation';
import { exigirPermissao } from '@/modules/auth/servidor';

export default async function PaginaCadastros() {
  await exigirPermissao('gerir_catalogo');
  redirect('/cadastros/produtos');
}
