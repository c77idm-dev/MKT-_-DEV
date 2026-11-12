import type { Metadata } from 'next';
import Link from 'next/link';
import { LINK_VOLTAR } from '@/components/estilos';
import { exigirPermissao } from '@/modules/auth/servidor';
import { ETAPAS } from '@/modules/devolucoes/etapas';
import { FormularioNovaDevolucao } from './FormularioNovaDevolucao';

export const metadata: Metadata = { title: 'Nova devolução · Gestão de Devoluções' };

export default async function PaginaNovaDevolucao() {
  await exigirPermissao('operar_devolucoes');
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-3">
      <Link href="/fluxo/etapa/1" className={LINK_VOLTAR}>
        ← {ETAPAS[0].titulo}
      </Link>
      <h1 className="text-xl font-bold">Nova devolução</h1>
      <FormularioNovaDevolucao />
    </div>
  );
}
