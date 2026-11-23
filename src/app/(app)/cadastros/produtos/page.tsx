import type { Metadata } from 'next';
import Link from 'next/link';
import { FotoProduto } from '@/components/FotoProduto';
import { Paginacao } from '@/components/Paginacao';
import { ITEM_LISTA, VAZIO } from '@/components/estilos';
import { obterDb } from '@/db';
import { formatarMoeda } from '@/lib/formatar';
import { lerPagina, primeiroValor, type ParametrosBusca } from '@/lib/parametros';
import { exigirPermissao } from '@/modules/auth/servidor';
import { listarProdutos, POR_PAGINA_PRODUTOS } from '@/modules/catalogo/produtos';
import { CabecalhoCadastro } from '../CabecalhoCadastro';

export const metadata: Metadata = { title: 'Produtos · Gestão de Devoluções' };

export default async function PaginaProdutos({ searchParams }: { searchParams: Promise<ParametrosBusca> }) {
  await exigirPermissao('gerir_catalogo');
  const parametros = await searchParams;
  const busca = primeiroValor(parametros.busca);
  const pagina = lerPagina(parametros);
  const salvo = primeiroValor(parametros.salvo);
  const { linhas, total } = await listarProdutos(obterDb(), { busca, pagina });
  const hrefDaPagina = (p: number) =>
    `/cadastros/produtos?${new URLSearchParams({ ...(busca ? { busca } : {}), pagina: String(p) })}`;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <CabecalhoCadastro atual="produtos" busca={busca} salvo={salvo} />
      <p className="text-sm text-texto-2">
        {total} {total === 1 ? 'produto' : 'produtos'}
      </p>
      {linhas.length === 0 ? (
        <p className={VAZIO}>Nenhum produto encontrado.</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {linhas.map((p) => (
            <li key={p.id}>
              <Link href={`/cadastros/produtos/${p.id}`} className={ITEM_LISTA}>
                <span className="flex items-baseline justify-between gap-2">
                  <span className="break-all font-mono text-[13px] font-semibold">
                    <span className="sr-only">Editar </span>
                    {p.sku}
                  </span>
                  <span className="shrink-0 text-sm font-semibold">{formatarMoeda(p.custo)}</span>
                </span>
                {/* Produtos do ML (extra): a foto do anúncio ao lado da descrição. w-0 + min-w-full: a linha não alarga o cartão. */}
                <span className="flex w-0 min-w-full items-center gap-3">
                  <FotoProduto url={p.fotoUrl} descricao={p.descricao} />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="break-words text-[15px]">{p.descricao}</span>
                    <span className="text-xs text-texto-2">
                      {p.fornecedor ?? 'Sem fornecedor'}
                      {p.ean ? <span className="font-mono"> · EAN {p.ean}</span> : null}
                    </span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Paginacao pagina={pagina} total={total} porPagina={POR_PAGINA_PRODUTOS} hrefDaPagina={hrefDaPagina} />
    </div>
  );
}
