import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LINK_VOLTAR } from '@/components/estilos';
import { obterDb } from '@/db';
import { exigirPermissao } from '@/modules/auth/servidor';
import { opcoesFornecedores } from '@/modules/catalogo/fornecedores';
import { obterProduto } from '@/modules/catalogo/produtos';
import { salvarProdutoAcao } from '../acoes';
import { FormularioProduto } from '../FormularioProduto';

export const metadata: Metadata = { title: 'Editar produto · Gestão de Devoluções' };

export default async function PaginaEditarProduto({ params }: { params: Promise<{ id: string }> }) {
  await exigirPermissao('gerir_catalogo');
  const { id } = await params;
  const db = obterDb();
  const produto = await obterProduto(db, id);
  if (!produto) notFound();
  const fornecedores = await opcoesFornecedores(db);
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-3">
      <Link href="/cadastros/produtos" className={LINK_VOLTAR}>
        ← Produtos
      </Link>
      <h1 className="text-xl font-bold">
        Editar produto <span className="break-all font-mono">{produto.sku}</span>
      </h1>
      <FormularioProduto
        acao={salvarProdutoAcao.bind(null, produto.id)}
        valores={{
          sku: produto.sku,
          ean: produto.ean ?? '',
          descricao: produto.descricao,
          cnpjFornecedor: produto.cnpjFornecedor ?? '',
          ncm: produto.ncm ?? '',
          custo: produto.custo ? produto.custo.replace('.', ',') : '',
          unidade: produto.unidade ?? '',
        }}
        fornecedores={fornecedores}
      />
    </div>
  );
}
