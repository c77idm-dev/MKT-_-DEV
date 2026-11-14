import Link from 'next/link';
import type { ReactNode } from 'react';
import { ALERTA_ATENCAO, BOTAO_PRIMARIO, CARTAO } from '@/components/estilos';
import { obterDb } from '@/db';
import { formatarDataHora } from '@/lib/formatar';
import { pode } from '@/modules/auth/permissoes';
import { obterConferencia, type DadosConferencia, type EvidenciaConferencia } from '@/modules/conferencia/leitura';
import { ROTULO_DESTINO, ROTULO_MOTIVO, ROTULO_STATUS_ITEM, type StatusDevolucao } from '@/modules/devolucoes/dominio';
import { ROTULO_EVIDENCIA, ROTULO_SITUACAO_PROCESSAMENTO } from '@/modules/midia/dominio';
import { linksDasEvidencias } from '@/modules/midia/links-evidencias';
import { iniciarConferenciaAcao, liberarTravaAcao } from './conferencia/acoes';
import { FormularioIniciarConferencia, FormularioLiberarTrava } from './conferencia/FormulariosConferencia';
import type { PropsSecao } from './tipos';

const ANTES_DA_CHEGADA: StatusDevolucao[] = ['PENDENTE_CHEGADA', 'CANCELADA', 'EXTRAVIADA', 'NO_CD_MARKETPLACE'];

function situacao(d: DadosConferencia): string {
  if (d.status === 'EM_CONFERENCIA') {
    const desde = d.conferenciaIniciadaEm ? ` desde ${formatarDataHora(d.conferenciaIniciadaEm)}` : '';
    return `Em conferência por ${d.conferenteNome ?? 'outra pessoa'}${desde}.`;
  }
  if (d.conferidaEm) return `Conferida em ${formatarDataHora(d.conferidaEm)}${d.conferenteNome ? ` por ${d.conferenteNome}` : ''}.`;
  if (d.status === 'AGUARDANDO_CONFERENCIA') return 'Aguardando conferência.';
  return 'Sem conferência.';
}

function nomeDaEvidencia(e: EvidenciaConferencia, d: DadosConferencia): string {
  const item = e.itemId ? d.itens.find((i) => i.id === e.itemId) : undefined;
  return item ? `${ROTULO_EVIDENCIA[e.tipo]} · Unidade ${item.unidade}` : ROTULO_EVIDENCIA[e.tipo];
}

function Galeria({ d, links }: { d: DadosConferencia; links: Map<string, string> }) {
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {d.evidencias.map((e) => {
        const nome = nomeDaEvidencia(e, d);
        const url = links.get(e.id);
        return (
          <li key={e.id} className="flex flex-col gap-1 rounded-lg border border-borda p-2">
            <span className="text-sm font-semibold">{nome}</span>
            {url && e.tipo !== 'VIDEO_PROVA' && (
              <a href={url} target="_blank" rel="noopener" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element -- link temporário de 10 min: não passa pelo otimizador */}
                <img src={url} alt={`${nome} da ${d.codigo}`} className="aspect-square w-full rounded-md object-cover" />
              </a>
            )}
            {url && e.tipo === 'VIDEO_PROVA' && (
              <video controls preload="metadata" src={url} aria-label={`${nome} da ${d.codigo}`} className="aspect-video w-full rounded-md bg-black" />
            )}
            <span className={`text-xs font-semibold ${e.situacao === 'FALHOU' ? 'text-erro' : 'text-texto-2'}`}>
              {ROTULO_SITUACAO_PROCESSAMENTO[e.situacao]}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function ResultadoUnidades({ d }: { d: DadosConferencia }) {
  return (
    <ol className="flex flex-col gap-2">
      {d.itens.map((i) => (
        <li key={i.id} className="flex flex-col gap-0.5 rounded-lg border border-borda p-3 text-sm">
          <span className="font-semibold">
            Unidade {i.unidade} · {i.destino ? ROTULO_DESTINO[i.destino] : ROTULO_STATUS_ITEM[i.status]}
            {i.motivo && i.motivo !== 'AUSENTE' ? ` · ${ROTULO_MOTIVO[i.motivo]}` : ''}
          </span>
          {i.observacao && <span>{i.observacao}</span>}
          <span className="font-mono text-xs text-texto-2">
            S/N {i.serial ?? '—'} · Lote {i.loteFabricacao ?? '—'} · Validade {i.validade ?? '—'}
            {i.eanLido ? ` · EAN lido ${i.eanLido}${i.divergente ? ' (divergente)' : ''}` : ''}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Conferência (Fase 2): situação e trava, os botões de quem pode, as evidências (links de 10 min) e o resultado. */
export async function SecaoConferencia({ devolucaoId, codigo, status, usuario }: PropsSecao): Promise<ReactNode> {
  const d = await obterConferencia(obterDb(), { id: devolucaoId });
  if (!d || (ANTES_DA_CHEGADA.includes(status) && d.evidencias.length === 0)) return null;
  const links = await linksDasEvidencias(d.evidencias);
  const podeConferir = pode(usuario.perfil, 'operar_devolucoes');
  const ehGestor = pode(usuario.perfil, 'administrar');
  const souConferente = d.conferenteId === usuario.id;

  return (
    <section id="conferencia" aria-labelledby="titulo-conferencia" className={`${CARTAO} flex flex-col gap-3`}>
      <h2 id="titulo-conferencia" className="text-base font-bold">
        Conferência
      </h2>
      <p role="status" className="text-[15px]">
        {situacao(d)}
      </p>

      {status === 'AGUARDANDO_CONFERENCIA' && podeConferir && d.naoIdentificada && (
        <p className={ALERTA_ATENCAO}>Pacote não identificado: o Gestor identifica o pedido antes da conferência.</p>
      )}
      {status === 'AGUARDANDO_CONFERENCIA' && podeConferir && !d.naoIdentificada && d.itens.length > 0 && (
        <FormularioIniciarConferencia acao={iniciarConferenciaAcao.bind(null, devolucaoId, codigo)} />
      )}
      {status === 'EM_CONFERENCIA' && souConferente && (
        <Link href={`/fluxo/devolucoes/${codigo}/conferencia`} className={`${BOTAO_PRIMARIO} min-h-14 w-full text-lg`}>
          Continuar conferência
        </Link>
      )}
      {status === 'EM_CONFERENCIA' && ehGestor && !souConferente && (
        <FormularioLiberarTrava acao={liberarTravaAcao.bind(null, devolucaoId, codigo)} conferente={d.conferenteNome ?? 'outra pessoa'} />
      )}

      {d.evidencias.length > 0 && (
        <>
          <h3 className="text-sm font-bold">Evidências</h3>
          <Galeria d={d} links={links} />
          <p className="text-xs text-texto-2">Os links das fotos e do vídeo valem 10 minutos. Para gerar novos, recarregue a página.</p>
        </>
      )}
      {d.conferidaEm && (
        <>
          <h3 className="text-sm font-bold">Resultado de cada unidade</h3>
          <ResultadoUnidades d={d} />
        </>
      )}
    </section>
  );
}
