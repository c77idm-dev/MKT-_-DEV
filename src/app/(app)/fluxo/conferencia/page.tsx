import type { Metadata } from 'next';
import Link from 'next/link';
import { LINK_VOLTAR } from '@/components/estilos';
import { RegistrarServiceWorker } from '@/components/pwa/RegistrarServiceWorker';
import { exigirPermissao } from '@/modules/auth/servidor';
import { abrirConferenciaAcao } from './acoes';
import { FormularioConferirPacote } from './FormularioConferirPacote';

export const metadata: Metadata = { title: 'Conferir pacote · Gestão de Devoluções' };

/** (extra, decisão 13) Na bancada: lê a etiqueta do pacote e abre a conferência dele. */
export default async function PaginaConferirPacote() {
  await exigirPermissao('operar_devolucoes');
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-3">
      <RegistrarServiceWorker />
      <Link href="/fluxo/etapa/2" className={`${LINK_VOLTAR} self-start`}>
        ← Pedidos Chegados - Aguardando Conferência
      </Link>
      <div>
        <h1 className="text-xl font-bold">Conferir pacote</h1>
        <p className="text-sm text-texto-2">Leia a etiqueta de rastreio do pacote (ou digite o código DEV) para abrir a conferência.</p>
      </div>
      <FormularioConferirPacote acao={abrirConferenciaAcao} />
    </div>
  );
}
