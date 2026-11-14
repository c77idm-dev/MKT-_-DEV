import type { ReactNode } from 'react';
import Link from 'next/link';
import { Selo } from '@/components/Selo';
import { ALERTA_ATENCAO, ALERTA_ERRO, ALERTA_OK, BOTAO_SECUNDARIO, CARTAO } from '@/components/estilos';
import { Dado } from '@/components/mercado-livre/Dado';
import { obterDb } from '@/db';
import { formatarDataHora } from '@/lib/formatar';
import { pode } from '@/modules/auth/permissoes';
import { resumoMLDaDevolucao, type ResultadoNoML } from '@/modules/mercado-livre/consultas';
import { ROTULO_MOTIVO_CANAL, ROTULO_STATUS_CONTESTACAO, rotuloStatusML } from '@/modules/mercado-livre/dominio';
import { TOM_STATUS_CONTESTACAO } from '@/modules/mercado-livre/selos';
import type { PropsSecao } from './tipos';

function Resultado({ resultado, ehGestor }: { resultado: ResultadoNoML | null; ehGestor: boolean }) {
  if (!resultado) return <p className="text-sm text-texto-2">O resultado vai ao ML quando a conferência terminar.</p>;
  switch (resultado.tipo) {
    case 'ok':
      return <p className={ALERTA_OK}>&quot;OK&quot; enviado ao ML em {formatarDataHora(resultado.em)}.</p>;
    case 'ok_recusado':
      return (
        <p className={`${ALERTA_ERRO} [overflow-wrap:anywhere]`}>
          O ML recusou o &quot;OK&quot; em {formatarDataHora(resultado.em)}: {resultado.erro}
        </p>
      );
    case 'sem_vinculo':
      return <p className={ALERTA_ATENCAO}>O resultado não foi ao ML: a devolução ainda não estava ligada ao Mercado Livre.</p>;
    case 'contestacao':
      return (
        <div className="flex flex-col gap-2">
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <span>
              Contestação <span className="font-mono">{resultado.motivo}</span> · {ROTULO_MOTIVO_CANAL[resultado.motivo]}
            </span>
            <Selo
              texto={resultado.enviando ? 'Enviando ao ML' : ROTULO_STATUS_CONTESTACAO[resultado.status]}
              tom={resultado.enviando ? 'destaque' : TOM_STATUS_CONTESTACAO[resultado.status]}
            />
          </p>
          {ehGestor && (
            <Link href={`/contestacoes/${resultado.id}`} className={`${BOTAO_SECUNDARIO} w-full md:w-auto`}>
              Ver a contestação
            </Link>
          )}
        </div>
      );
  }
}

/** Seção "Mercado Livre" do detalhe da devolução (contrato §2, P2 item 9). Some fora do canal ML. */
export async function SecaoMercadoLivre({ devolucaoId, usuario }: PropsSecao): Promise<ReactNode> {
  const r = await resumoMLDaDevolucao(obterDb(), devolucaoId);
  if (!r) return null;
  const ehGestor = pode(usuario.perfil, 'administrar');
  return (
    <section aria-labelledby="titulo-ml" className={`${CARTAO} flex flex-col gap-3`}>
      <h2 id="titulo-ml" className="text-base font-bold">
        Mercado Livre
      </h2>
      {r.vinculada ? (
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Dado rotulo="ID da reclamação" mono>
            {r.reclamacaoId ?? '—'}
          </Dado>
          <Dado rotulo="ID da devolução no ML" mono>
            {r.devolucaoExternaId ?? '—'}
          </Dado>
          <Dado rotulo="Status no ML">{rotuloStatusML(r.statusCanal)}</Dado>
          <Dado rotulo="Entregue (ML)">{r.entregueEm ? formatarDataHora(r.entregueEm) : '—'}</Dado>
          <Dado rotulo="Prazo para revisar">{r.prazo ? formatarDataHora(r.prazo) : '—'}</Dado>
          <Dado rotulo="Última sincronização">{r.sincronizadaEm ? formatarDataHora(r.sincronizadaEm) : '—'}</Dado>
        </dl>
      ) : (
        <p className="text-sm text-texto-2">Ainda sem vínculo com uma devolução do Mercado Livre. O vínculo é automático quando o ML avisa sobre este pedido.</p>
      )}
      <Resultado resultado={r.resultado} ehGestor={ehGestor} />
    </section>
  );
}
