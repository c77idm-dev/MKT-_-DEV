import type { Metadata } from 'next';
import Link from 'next/link';
import { BOTAO_SECUNDARIO, LINK_VOLTAR, VAZIO } from '@/components/estilos';
import { Paginacao } from '@/components/Paginacao';
import { CartaoRetirada } from '@/components/retiradas/CartaoRetirada';
import { obterDb } from '@/db';
import { lerPagina, type ParametrosBusca } from '@/lib/parametros';
import { pode } from '@/modules/auth/permissoes';
import { exigirPermissao } from '@/modules/auth/servidor';
import { listarRetiradas, POR_PAGINA_RETIRADAS } from '@/modules/retiradas/consultas';

export const metadata: Metadata = { title: 'Retiradas do Full · Gestão de Devoluções' };

/** Lista "Retiradas do Full" (melhoria 3). Todos veem (ver_listas); só quem opera abre uma nova. */
export default async function PaginaRetiradas({ searchParams }: { searchParams: Promise<ParametrosBusca> }) {
  const usuario = await exigirPermissao('ver_listas');
  const pagina = lerPagina(await searchParams);
  const { retiradas, total } = await listarRetiradas(obterDb(), { pagina });
  const podeOperar = pode(usuario.perfil, 'operar_devolucoes');
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-3">
      {/* (E29) Quem recebe pacotes volta para a Bancada. */}
      <Link href={podeOperar ? '/bancada' : '/fluxo'} className={LINK_VOLTAR}>
        ← {podeOperar ? 'Bancada' : 'Fluxo'}
      </Link>
      <div>
        <h1 className="text-xl font-bold">Retiradas do Full</h1>
        <p className="text-sm text-texto-2">Mercadoria da empresa voltando do armazém do Mercado Livre. Não são devoluções.</p>
      </div>
      {podeOperar && (
        <Link href="/fluxo/retiradas-full/nova" className={`${BOTAO_SECUNDARIO} min-h-14 w-full`}>
          Retirada do Full
        </Link>
      )}
      {retiradas.length === 0 ? (
        <p className={VAZIO}>Nenhuma retirada do Full registrada.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {retiradas.map((r) => (
            <li key={r.id}>
              <CartaoRetirada retirada={r} />
            </li>
          ))}
        </ul>
      )}
      <Paginacao pagina={pagina} total={total} porPagina={POR_PAGINA_RETIRADAS} hrefDaPagina={(p) => `/fluxo/retiradas-full?pagina=${p}`} />
    </div>
  );
}
