import type { Metadata } from 'next';
import Link from 'next/link';
import { LINK_VOLTAR } from '@/components/estilos';
import { obterDb } from '@/db';
import { exigirPermissao } from '@/modules/auth/servidor';
import { opcoesFornecedores } from '@/modules/catalogo/fornecedores';
import { salvarProdutoAcao } from '../acoes';
import { FormularioProduto } from '../FormularioProduto';

export const metadata: Metadata = { title: 'Novo produto · Gestão de Devoluções' };

export default async function PaginaNovoProduto() {
  await exigirPermissao('gerir_catalogo');
  const fornecedores = await opcoesFornecedores(obterDb());
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-3">
      <Link href="/cadastros/produtos" className={LINK_VOLTAR}>
        ← Produtos
      </Link>
      <h1 className="text-xl font-bold">Novo produto</h1>
      <FormularioProduto
        acao={salvarProdutoAcao.bind(null, null)}
        valores={{ sku: '', ean: '', descricao: '', cnpjFornecedor: '', ncm: '', custo: '', unidade: 'UN' }}
        fornecedores={fornecedores}
      />
    </div>
  );
}
