import type { Metadata } from 'next';
import Link from 'next/link';
import { CartaoBackup } from '@/components/acabamento/CartaoBackup';
import { ListaFalhas } from '@/components/acabamento/ListaFalhas';
import { LINK_VOLTAR } from '@/components/estilos';
import { Paginacao } from '@/components/Paginacao';
import { obterDb } from '@/db';
import { lerPagina, type ParametrosBusca } from '@/lib/parametros';
import { ultimoBackup, vistaDoBackup } from '@/modules/acabamento/backup';
import { listarFalhas } from '@/modules/acabamento/falhas';
import { exigirPermissao } from '@/modules/auth/servidor';
import { acaoFalha } from './acoes';

export const metadata: Metadata = { title: 'Falhas · Gestão de Devoluções' };
const POR_PAGINA = 20;

export default async function PaginaFalhas({ searchParams }: { searchParams: Promise<ParametrosBusca> }) {
  await exigirPermissao('administrar');
  const pagina = lerPagina(await searchParams);
  const db = obterDb();
  const [{ falhas, total }, backup] = await Promise.all([listarFalhas(db, { pagina, porPagina: POR_PAGINA }), ultimoBackup(db)]);
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
      <Link href="/configuracoes" className={`${LINK_VOLTAR} self-start`}>
        ← Configurações
      </Link>
      <h1 className="text-xl font-bold">Falhas</h1>
      <p className="text-sm text-texto-2">Tarefas de fundo que esgotaram as 5 tentativas.</p>
      <CartaoBackup backup={vistaDoBackup(backup, new Date())} />
      <ListaFalhas falhas={falhas} acao={acaoFalha} />
      <Paginacao pagina={pagina} total={total} porPagina={POR_PAGINA} hrefDaPagina={(p) => `/configuracoes/falhas?pagina=${p}`} />
    </div>
  );
}
