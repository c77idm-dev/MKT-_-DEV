import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertasPainel } from '@/components/acabamento/AlertasPainel';
import { CartaoDevolucao } from '@/components/CartaoDevolucao';
import { ITEM_LISTA, LINK_VOLTAR, VAZIO } from '@/components/estilos';
import { obterDb } from '@/db';
import { carregarAlertas, detalhesDosAlertas } from '@/modules/acabamento/alertas';
import { exigirOuBancada } from '@/modules/auth/servidor';
import { buscarDevolucoes } from '@/modules/devolucoes/busca';

export const metadata: Metadata = { title: 'Alertas · Gestão de Devoluções' };

/** (extra) Todos os alertas do perfil e, por alerta, as devoluções, lotes e contestações a que ele se refere. */
export default async function PaginaAlertas() {
  const usuario = await exigirOuBancada('acompanhar'); // (E29) o Operador vai para a Bancada
  const db = obterDb();
  const [todos, detalhes] = await Promise.all([carregarAlertas(db, usuario.perfil), detalhesDosAlertas(db, usuario.perfil)]);
  const secoes = await Promise.all(
    detalhes.map(async (d) => ({
      ...d,
      ...(d.devolucaoIds.length > 0
        ? await buscarDevolucoes(db, {}, { ids: d.devolucaoIds, porPagina: 100 })
        : { devolucoes: [], total: 0 }),
    })),
  );
  return (
    <div className="flex flex-col gap-4">
      <Link href="/fluxo" className={LINK_VOLTAR}>
        ← Fluxo
      </Link>
      <h1 className="text-xl font-bold">Alertas</h1>
      {todos.length === 0 && secoes.length === 0 && <p className={VAZIO}>Nenhum alerta agora.</p>}
      <AlertasPainel alertas={todos} />
      {secoes.map((s) => (
        <section key={s.id} id={s.id} aria-labelledby={`titulo-${s.id}`} className="flex scroll-mt-4 flex-col gap-2">
          <h2 id={`titulo-${s.id}`} className="text-base font-bold">
            {s.titulo} ({s.devolucaoIds.length + s.links.length})
          </h2>
          {s.devolucoes.length > 0 && (
            <div className="grid gap-2 md:grid-cols-2">
              {s.devolucoes.map((d) => (
                <CartaoDevolucao key={d.id} devolucao={d} />
              ))}
            </div>
          )}
          {s.total > s.devolucoes.length && (
            <p className="text-[13px] text-texto-2">
              Mostrando {s.devolucoes.length} de {s.total}
            </p>
          )}
          {s.links.length > 0 && (
            <ul className="flex flex-col gap-2">
              {s.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className={ITEM_LISTA}>
                    {l.texto}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
