import type { Metadata } from 'next';
import { QuadroFluxo } from '@/components/QuadroFluxo';
import { exigirPermissao } from '@/modules/auth/servidor';
import { ETAPAS } from '@/modules/devolucoes/etapas';

export const metadata: Metadata = { title: 'Fluxo · Gestão de Devoluções' };

export default async function PaginaFluxo() {
  await exigirPermissao('ver_listas');
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">Fluxo de devoluções</h1>
      <QuadroFluxo colunas={ETAPAS.map((e) => ({ numero: e.numero, titulo: e.titulo, total: 0 }))} />
    </div>
  );
}
