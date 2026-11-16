import type { Metadata } from 'next';
import Link from 'next/link';
import { BOTAO_SECUNDARIO, LINK_VOLTAR } from '@/components/estilos';
import { RegistrarServiceWorker } from '@/components/pwa/RegistrarServiceWorker';
import { exigirPermissao } from '@/modules/auth/servidor';
import { ETAPAS } from '@/modules/devolucoes/etapas';
import { FormularioRecebimento } from './FormularioRecebimento';

const ETAPA_RECEBIMENTO = ETAPAS.find((e) => e.numero === 2);

export const metadata: Metadata = { title: 'Recebimento · Gestão de Devoluções' };

export default async function PaginaRecebimento() {
  await exigirPermissao('operar_devolucoes');
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-3">
      <RegistrarServiceWorker />
      <Link href="/fluxo/etapa/2" className={LINK_VOLTAR}>
        ← {ETAPA_RECEBIMENTO?.titulo}
      </Link>
      <div>
        <h1 className="text-xl font-bold">Recebimento</h1>
        <p className="text-sm text-texto-2">Leia ou digite o código de rastreamento do pacote para registrar a chegada.</p>
      </div>
      <FormularioRecebimento />
      {/* Melhoria 3: atalho fixo para o pacote que é retirada do Full (mercadoria da empresa, não devolução). */}
      <section aria-labelledby="titulo-retirada-full" className="mt-2 flex flex-col gap-2 border-t border-borda pt-4">
        <h2 id="titulo-retirada-full" className="text-sm font-semibold text-texto-2">
          Não é devolução?
        </h2>
        <Link href="/fluxo/retiradas-full/nova" className={`${BOTAO_SECUNDARIO} min-h-14 w-full`}>
          Retirada do Full
        </Link>
        <Link href="/fluxo/retiradas-full" className={`${LINK_VOLTAR} justify-center`}>
          Ver retiradas do Full
        </Link>
      </section>
    </div>
  );
}
