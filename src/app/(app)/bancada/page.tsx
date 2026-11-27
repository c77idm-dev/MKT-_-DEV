import type { Metadata } from 'next';
import Link from 'next/link';
import { LINK_VOLTAR } from '@/components/estilos';
import { RegistrarServiceWorker } from '@/components/pwa/RegistrarServiceWorker';
import { obterDb } from '@/db';
import { pode } from '@/modules/auth/permissoes';
import { exigirPermissao } from '@/modules/auth/servidor';
import { listarFilaBancada } from '@/modules/bancada/fila';
import { FormularioRecebimento } from '../fluxo/recebimento/FormularioRecebimento';
import { FilaBancada } from './FilaBancada';

export const metadata: Metadata = { title: 'Bancada · Gestão de Devoluções' };

/**
 * (E29, extra) Bancada do Operador: a tela inicial de quem só recebe e confere. No topo, "Chegou um pacote" (o Receber
 * pacote, com as proteções da câmera da E27); embaixo, o que espera conferência e as retiradas do Full abertas. O Gestor
 * chega aqui pelo "Receber pacote" do menu do Fluxo.
 */
export default async function PaginaBancada() {
  const usuario = await exigirPermissao('operar_devolucoes');
  const fila = await listarFilaBancada(obterDb(), usuario.id);
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <RegistrarServiceWorker />
      {pode(usuario.perfil, 'acompanhar') && (
        <Link href="/fluxo" className={`${LINK_VOLTAR} -mb-2 self-start`}>
          ← Fluxo
        </Link>
      )}
      <div>
        <h1 className="text-xl font-bold">Bancada</h1>
        <p className="text-sm text-texto-2">Receba os pacotes e confira as devoluções (extra).</p>
      </div>
      <FormularioRecebimento />
      <FilaBancada fila={fila} />
    </div>
  );
}
