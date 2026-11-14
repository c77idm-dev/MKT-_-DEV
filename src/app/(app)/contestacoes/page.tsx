import type { Metadata } from 'next';
import Link from 'next/link';
import { Selo } from '@/components/Selo';
import { ITEM_LISTA, VAZIO } from '@/components/estilos';
import { obterDb } from '@/db';
import { primeiroValor } from '@/lib/parametros';
import { exigirPermissao } from '@/modules/auth/servidor';
import { contarContestacoes, listarContestacoes } from '@/modules/mercado-livre/contestacoes';
import { ehStatusContestacao, ROTULO_MOTIVO_CANAL, ROTULO_STATUS_CONTESTACAO, type StatusContestacao } from '@/modules/mercado-livre/dominio';
import { TOM_STATUS_CONTESTACAO } from '@/modules/mercado-livre/selos';

export const metadata: Metadata = { title: 'Contestações ML · Gestão de Devoluções' };

const FILTROS: { status: StatusContestacao; rotulo: string; vazio: string }[] = [
  { status: 'AGUARDANDO_GESTOR', rotulo: 'Aguardando', vazio: 'Nenhuma contestação esperando o Gestor.' },
  { status: 'FALHOU', rotulo: 'Com falha', vazio: 'Nenhuma contestação com falha.' },
  { status: 'ENVIADA', rotulo: 'Enviadas', vazio: 'Nenhuma contestação enviada ainda.' },
];

type Props = { searchParams: Promise<{ status?: string | string[] }> };

/** Spec §6.6 (extra do PDF, aprovado na spec): fila das contestações com o prazo do ML em destaque. Só o Gestor (§6.9). */
export default async function PaginaContestacoes({ searchParams }: Props) {
  await exigirPermissao('administrar');
  const pedido = primeiroValor((await searchParams).status);
  const status: StatusContestacao = ehStatusContestacao(pedido) ? pedido : 'AGUARDANDO_GESTOR';
  const db = obterDb();
  const [lista, contagem] = await Promise.all([listarContestacoes(db, status), contarContestacoes(db)]);
  const filtro = FILTROS.find((f) => f.status === status) ?? FILTROS[0];
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <h1 className="text-xl font-bold">Contestações ML</h1>
      <nav aria-label="Filtrar contestações" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {FILTROS.map((f) => (
          <Link
            key={f.status}
            href={`/contestacoes?status=${f.status}`}
            aria-current={f.status === status ? 'page' : undefined}
            className={`inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-semibold ${
              f.status === status ? 'border-destaque bg-destaque-suave text-destaque' : 'border-borda bg-superficie text-texto-2'
            }`}
          >
            {f.rotulo} ({contagem[f.status]})
          </Link>
        ))}
      </nav>
      {lista.length === 0 ? (
        <p className={VAZIO}>{filtro.vazio}</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {lista.map((c) => (
            <li key={c.id}>
              <Link href={`/contestacoes/${c.id}`} className={ITEM_LISTA}>
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-[15px] font-bold">{c.codigo}</span>
                  <Selo
                    texto={c.enviando ? 'Enviando ao ML' : ROTULO_STATUS_CONTESTACAO[c.status]}
                    tom={c.enviando ? 'destaque' : TOM_STATUS_CONTESTACAO[c.status]}
                  />
                </span>
                <span className="text-sm">
                  <span className="font-mono">{c.motivo}</span> · {ROTULO_MOTIVO_CANAL[c.motivo]}
                </span>
                <span className="flex flex-wrap items-center gap-2 text-xs text-texto-2">
                  {c.selo && <Selo texto={c.selo.texto} tom={c.selo.tom} />}
                  <span>{c.fotos === 1 ? '1 foto' : `${c.fotos} fotos`}</span>
                </span>
                {c.status === 'FALHOU' && c.erro && <span className="text-sm text-erro [overflow-wrap:anywhere]">{c.erro}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
