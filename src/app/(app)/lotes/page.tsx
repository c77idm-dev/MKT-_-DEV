import type { Metadata } from 'next';
import { ListaLotes } from '@/components/lotes/ListaLotes';
import { PendenciasSemFornecedor } from '@/components/lotes/PendenciasSemFornecedor';
import { ALERTA_ATENCAO } from '@/components/estilos';
import { obterDb } from '@/db';
import { lerPagina, type ParametrosBusca } from '@/lib/parametros';
import { exigirPermissao } from '@/modules/auth/servidor';
import { lerFiltrosLotes, listarLotes, listarSemFornecedor, opcoesFornecedoresDosLotes } from '@/modules/lotes/consultas';
import { acaoAssociarProduto } from './acoes';

export const metadata: Metadata = { title: 'Lotes e Remessas · Gestão de Devoluções' };
const PENDENCIAS_NA_LISTA = 5;

export default async function PaginaLotes({ searchParams }: { searchParams: Promise<ParametrosBusca> }) {
  await exigirPermissao('gerir_fiscal');
  const parametros = await searchParams;
  const filtros = lerFiltrosLotes(parametros);
  const pagina = lerPagina(parametros);
  const db = obterDb();
  const [{ lotes, total }, fornecedores, pendencias] = await Promise.all([
    listarLotes(db, filtros, { pagina }),
    opcoesFornecedoresDosLotes(db),
    listarSemFornecedor(db, { limite: PENDENCIAS_NA_LISTA }),
  ]);
  return (
    <ListaLotes
      titulo="Lotes e Remessas"
      lotes={lotes}
      total={total}
      pagina={pagina}
      filtros={filtros}
      fornecedores={fornecedores}
      acaoFiltro="/lotes"
      vazio="Nenhum lote encontrado."
      antes={
        pendencias.total > 0 ? (
          <a href="#sem-fornecedor" className={`${ALERTA_ATENCAO} flex min-h-11 items-center`}>
            {`Sem fornecedor: ${pendencias.total} ${pendencias.total === 1 ? 'unidade' : 'unidades'}`}
          </a>
        ) : null
      }
      // Sempre montado: a mensagem de sucesso fica mesmo quando a última unidade sai (decisão 23).
      depois={
        <PendenciasSemFornecedor
          unidades={pendencias.unidades}
          total={pendencias.total}
          verTodas={pendencias.total > PENDENCIAS_NA_LISTA ? '/lotes/sem-fornecedor' : null}
          acao={acaoAssociarProduto}
        />
      }
    />
  );
}
