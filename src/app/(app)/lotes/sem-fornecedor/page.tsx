import type { Metadata } from 'next';
import Link from 'next/link';
import { PendenciasSemFornecedor } from '@/components/lotes/PendenciasSemFornecedor';
import { LINK_VOLTAR } from '@/components/estilos';
import { obterDb } from '@/db';
import { exigirPermissao } from '@/modules/auth/servidor';
import { listarSemFornecedor } from '@/modules/lotes/consultas';
import { acaoAssociarProduto } from '../acoes';

export const metadata: Metadata = { title: 'Sem fornecedor · Lotes e Remessas · Gestão de Devoluções' };

export default async function PaginaSemFornecedor() {
  await exigirPermissao('gerir_fiscal');
  const { unidades, total } = await listarSemFornecedor(obterDb());
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <Link href="/lotes" className={`${LINK_VOLTAR} -mb-2 self-start`}>
        ← Lotes e Remessas
      </Link>
      <h1 className="text-xl font-bold">Sem fornecedor</h1>
      <PendenciasSemFornecedor unidades={unidades} total={total} verTodas={null} acao={acaoAssociarProduto} />
    </div>
  );
}
