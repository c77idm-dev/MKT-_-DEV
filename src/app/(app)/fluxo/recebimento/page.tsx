import type { Metadata } from 'next';
import Link from 'next/link';
import { LINK_VOLTAR } from '@/components/estilos';
import { exigirPermissao } from '@/modules/auth/servidor';
import { FormularioRecebimento } from './FormularioRecebimento';

export const metadata: Metadata = { title: 'Recebimento · Gestão de Devoluções' };

export default async function PaginaRecebimento() {
  await exigirPermissao('operar_devolucoes');
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-3">
      <Link href="/fluxo/etapa/2" className={LINK_VOLTAR}>
        ← Pedidos Chegados - Aguardando Conferência
      </Link>
      <div>
        <h1 className="text-xl font-bold">Recebimento</h1>
        <p className="text-sm text-texto-2">Leia ou digite o código de rastreamento do pacote para registrar a chegada.</p>
      </div>
      <FormularioRecebimento />
    </div>
  );
}
