import type { Metadata } from 'next';
import Link from 'next/link';
import { ALERTA_ATENCAO, LINK_VOLTAR } from '@/components/estilos';
import { exigirPermissao } from '@/modules/auth/servidor';
import { FormularioNovaRetirada } from './FormularioNovaRetirada';

export const metadata: Metadata = { title: 'Retirada do Full · Gestão de Devoluções' };

export default async function PaginaNovaRetirada() {
  await exigirPermissao('operar_devolucoes');
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-3">
      <Link href="/fluxo/recebimento" className={LINK_VOLTAR}>
        ← Recebimento
      </Link>
      <div>
        <h1 className="text-xl font-bold">Retirada do Full</h1>
        <p className="text-sm text-texto-2">Leia ou digite o código da etiqueta do pacote para abrir a retirada.</p>
      </div>
      <p className={ALERTA_ATENCAO}>Isto não é devolução. Confira os itens e guarde no estoque.</p>
      <FormularioNovaRetirada />
    </div>
  );
}
