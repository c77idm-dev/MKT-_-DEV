import type { Metadata } from 'next';
import Link from 'next/link';
import { Paginacao } from '@/components/Paginacao';
import { ITEM_LISTA, VAZIO } from '@/components/estilos';
import { obterDb } from '@/db';
import { lerPagina, primeiroValor, type ParametrosBusca } from '@/lib/parametros';
import { exigirPermissao } from '@/modules/auth/servidor';
import { formatarCnpj } from '@/modules/catalogo/documentos';
import { listarFornecedores, POR_PAGINA_FORNECEDORES } from '@/modules/catalogo/fornecedores';
import { CabecalhoCadastro } from '../CabecalhoCadastro';

export const metadata: Metadata = { title: 'Fornecedores · Gestão de Devoluções' };

export default async function PaginaFornecedores({ searchParams }: { searchParams: Promise<ParametrosBusca> }) {
  await exigirPermissao('gerir_catalogo');
  const parametros = await searchParams;
  const busca = primeiroValor(parametros.busca);
  const pagina = lerPagina(parametros);
  const salvo = primeiroValor(parametros.salvo);
  const { linhas, total } = await listarFornecedores(obterDb(), { busca, pagina });
  const hrefDaPagina = (p: number) =>
    `/cadastros/fornecedores?${new URLSearchParams({ ...(busca ? { busca } : {}), pagina: String(p) })}`;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <CabecalhoCadastro atual="fornecedores" busca={busca} salvo={salvo} />
      <p className="text-sm text-texto-2">
        {total} {total === 1 ? 'fornecedor' : 'fornecedores'}
      </p>
      {linhas.length === 0 ? (
        <p className={VAZIO}>Nenhum fornecedor encontrado.</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {linhas.map((f) => (
            <li key={f.id}>
              <Link href={`/cadastros/fornecedores/${f.id}`} className={ITEM_LISTA}>
                <span className="text-[15px] font-semibold">
                  <span className="sr-only">Editar </span>
                  {f.razaoSocial}
                </span>
                <span className="font-mono text-[13px]">{formatarCnpj(f.cnpj)}</span>
                <span className="text-xs text-texto-2">
                  {[f.cidade, f.uf].filter(Boolean).join(' / ') || 'Endereço não informado'}
                  {f.emailSac ? ` · ${f.emailSac}` : ''}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Paginacao pagina={pagina} total={total} porPagina={POR_PAGINA_FORNECEDORES} hrefDaPagina={hrefDaPagina} />
    </div>
  );
}
