import type { Metadata } from 'next';
import Link from 'next/link';
import { ListaLotes } from '@/components/lotes/ListaLotes';
import { LINK_VOLTAR } from '@/components/estilos';
import { obterDb } from '@/db';
import { lerPagina, type ParametrosBusca } from '@/lib/parametros';
import { exigirOuBancada } from '@/modules/auth/servidor';
import { ETAPAS } from '@/modules/devolucoes/etapas';
import { lerFiltrosLotes, listarLotes, opcoesFornecedoresDosLotes } from '@/modules/lotes/consultas';

const TITULO = ETAPAS[4].titulo;

export const metadata: Metadata = { title: `${TITULO} · Gestão de Devoluções` };

/** Etapa 5 do PDF: os lotes por fornecedor, só leitura, para todos os perfis. A pendência "Sem fornecedor" fica em /lotes. */
export default async function PaginaEtapaLotes({ searchParams }: { searchParams: Promise<ParametrosBusca> }) {
  await exigirOuBancada('acompanhar'); // (E29) o Operador vai para a Bancada
  const parametros = await searchParams;
  const filtros = lerFiltrosLotes(parametros);
  const pagina = lerPagina(parametros);
  const db = obterDb();
  const [{ lotes, total }, fornecedores] = await Promise.all([listarLotes(db, filtros, { pagina }), opcoesFornecedoresDosLotes(db)]);
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <Link href="/fluxo" className={`${LINK_VOLTAR} -mb-2 self-start`}>
        ← Fluxo
      </Link>
      <ListaLotes
        titulo={TITULO}
        lotes={lotes}
        total={total}
        pagina={pagina}
        filtros={filtros}
        fornecedores={fornecedores}
        acaoFiltro="/fluxo/etapa/5"
        vazio="Nenhum lote ainda. As unidades com problema entram aqui quando a NF de devolução é autorizada."
      />
    </div>
  );
}
