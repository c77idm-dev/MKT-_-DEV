import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { FotoProduto } from '@/components/FotoProduto';
import { MensagemSucesso } from '@/components/MensagemSucesso';
import { Selo } from '@/components/Selo';
import { ALERTA_ATENCAO, CARTAO, LINK_VOLTAR, ROTULO, VAZIO } from '@/components/estilos';
import { obterDb } from '@/db';
import { formatarDataHora, formatarDataIso } from '@/lib/formatar';
import { primeiroValor } from '@/lib/parametros';
import { diasParaSumir, textoSomeEm } from '@/modules/apagadas/dominio';
import { pode } from '@/modules/auth/permissoes';
import { exigirPermissao } from '@/modules/auth/servidor';
import { textoDoAviso } from '@/modules/devolucoes/avisos-correcao';
import { obterDetalhe } from '@/modules/devolucoes/detalhe';
import {
  ETAPA_DO_STATUS,
  ROTULO_CANAL,
  ROTULO_ORIGEM,
  ROTULO_STATUS,
  ROTULO_STATUS_ITEM,
  ROTULO_TIPO,
  rotuloStatus,
} from '@/modules/devolucoes/dominio';
import { ETAPAS } from '@/modules/devolucoes/etapas';
import { TOM_DO_STATUS } from '@/modules/devolucoes/selos';
import { complementoDoEvento } from '@/modules/historico/complementos';
import { rotuloDaAcao } from '@/modules/historico/eventos';
import { identificarAcao } from './acoes';
import { FormularioIdentificar } from './AcoesGestor';
import { SecaoConferencia } from './secoes/SecaoConferencia';
import { SecaoCorrigir } from './secoes/SecaoCorrigir';
import { SecaoFiscal } from './secoes/SecaoFiscal';
import { SecaoLote } from './secoes/SecaoLote';
import { SecaoMercadoLivre } from './secoes/SecaoMercadoLivre';
import { SecaoVenda } from './secoes/SecaoVenda';

/** Confirmações das ações do Gestor (o redirecionamento leva `?ok=`). */
const MENSAGEM_OK: Record<string, string> = {
  cancelada: 'Devolução cancelada.',
  extraviada: 'Devolução marcada como extraviada.',
  identificada: 'Pacote identificado.',
  // Corrigir (Gestor) (extra, E29).
  estoque_trocado: 'Estoque da unidade trocado.',
  conferencia_reaberta: 'Conferência reaberta. A devolução voltou para Aguardando conferência.',
  chegada_desfeita: 'Chegada desfeita.',
  dados_corrigidos: 'Dados corrigidos.',
};

type Props = { params: Promise<{ codigo: string }>; searchParams: Promise<{ ok?: string | string[]; aviso?: string | string[] }> };

export async function generateMetadata({ params }: Pick<Props, 'params'>): Promise<Metadata> {
  const { codigo } = await params;
  return { title: `${codigo} · Gestão de Devoluções` };
}

function Dado({ rotulo, mono = false, children }: { rotulo: string; mono?: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className={ROTULO}>{rotulo}</dt>
      <dd className={`text-[15px] ${mono ? 'break-all font-mono' : ''}`}>{children}</dd>
    </div>
  );
}

function motivoDoEvento(dados: Record<string, unknown> | null): string | null {
  const motivo = dados?.motivo;
  return typeof motivo === 'string' ? motivo : null;
}

export default async function PaginaDevolucao({ params, searchParams }: Props) {
  const usuario = await exigirPermissao('ver_listas');
  const { codigo } = await params;
  const parametros = await searchParams;
  const ok = MENSAGEM_OK[primeiroValor(parametros.ok)];
  // A chave do aviso vem da URL; o texto, de uma lista fixa (um link não põe texto qualquer na página).
  const aviso = ok ? textoDoAviso(primeiroValor(parametros.aviso)) : null;
  const ehGestor = pode(usuario.perfil, 'administrar');
  // (extra, E29) Só o Gestor abre a apagada (pela lista Apagadas), só para ver: sem as seções e sem correções.
  const d = (await obterDetalhe(obterDb(), codigo)) ?? (ehGestor ? await obterDetalhe(obterDb(), codigo, { incluirApagada: true }) : null);
  if (!d || d.expurgadaEm) notFound();
  const apagada = d.apagadaEm !== null;
  const etapa = apagada ? undefined : ETAPAS.find((e) => e.numero === ETAPA_DO_STATUS[d.status]);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        {etapa ? (
          <Link href={`/fluxo/etapa/${etapa.numero}`} className={LINK_VOLTAR}>
            ← {etapa.titulo}
          </Link>
        ) : (
          <Link href="/fluxo" className={LINK_VOLTAR}>
            ← Fluxo
          </Link>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-mono text-2xl font-bold">{d.codigo}</h1>
          <Selo texto={ROTULO_STATUS[d.status]} tom={TOM_DO_STATUS[d.status]} />
          {d.naoIdentificada && <Selo texto="Não identificada" tom="erro" />}
          {apagada && <Selo texto="Apagada" tom="erro" />}
        </div>
      </div>

      {ok && <MensagemSucesso texto={ok} />}
      {aviso && (
        <p role="note" className={ALERTA_ATENCAO}>
          {aviso}
        </p>
      )}
      {d.apagadaEm && (
        <div className={`${ALERTA_ATENCAO} flex flex-col`}>
          <p>
            Apagada em {formatarDataHora(d.apagadaEm)}
            {d.apagadaPorNome ? ` por ${d.apagadaPorNome}` : ''}. {textoSomeEm(diasParaSumir(d.apagadaEm, new Date()))}. Para trazê-la de volta, use
            Restaurar em Apagadas. (extra)
          </p>
          <Link href="/fluxo/apagadas" className={LINK_VOLTAR}>
            Ir para Apagadas
          </Link>
        </div>
      )}

      <section aria-labelledby="titulo-dados" className={CARTAO}>
        <h2 id="titulo-dados" className="mb-3 text-base font-bold">
          Dados
        </h2>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Dado rotulo="Canal">{d.canal ? ROTULO_CANAL[d.canal] : 'A identificar'}</Dado>
          <Dado rotulo="Número do pedido" mono>
            {d.pedidos.join(', ') || '—'}
          </Dado>
          <Dado rotulo="ID da reclamação" mono>
            {d.reclamacaoId ?? '—'}
          </Dado>
          <Dado rotulo="Código de rastreamento" mono>
            {d.rastreio ?? '—'}
          </Dado>
          <Dado rotulo="Transportadora">{d.transportadora ?? '—'}</Dado>
          <Dado rotulo="Tipo">{ROTULO_TIPO[d.tipo]}</Dado>
          <Dado rotulo="Origem">{ROTULO_ORIGEM[d.origem]}</Dado>
          <Dado rotulo="Motivo do cliente">{d.motivoCliente ?? '—'}</Dado>
          <Dado rotulo="Data de postagem">{d.postadaEm ? formatarDataIso(d.postadaEm) : '—'}</Dado>
          <Dado rotulo="Cadastrada em">
            {formatarDataHora(d.criadaEm)}
            {d.criadoPorNome ? ` por ${d.criadoPorNome}` : ''}
          </Dado>
          <Dado rotulo="Chegada">
            {d.recebidaEm ? `${formatarDataHora(d.recebidaEm)}${d.recebidaPorNome ? ` por ${d.recebidaPorNome}` : ''}` : 'Ainda não chegou'}
          </Dado>
          {/* (extra, E29) As observações, que o Gestor corrige em "Corrigir (Gestor)". */}
          {d.observacoes && <Dado rotulo="Observações (extra)">{d.observacoes}</Dado>}
        </dl>
      </section>

      <section aria-labelledby="titulo-itens" className="flex flex-col gap-2">
        <h2 id="titulo-itens" className="text-base font-bold">
          Itens ({d.itens.length} {d.itens.length === 1 ? 'unidade' : 'unidades'})
        </h2>
        {d.itens.length === 0 ? (
          <p className={VAZIO}>Nenhum item cadastrado.</p>
        ) : (
          <ol className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {d.itens.map((item) => (
              <li key={item.id} className={`${CARTAO} flex gap-3 p-3`}>
                {/* Produtos do ML (extra): a foto do anúncio do produto. */}
                <FotoProduto url={item.fotoUrl} descricao={item.descricao ?? item.sku} />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-texto-2">Unidade {item.unidade}</span>
                    <span className="text-xs font-semibold text-texto-2">{ROTULO_STATUS_ITEM[item.status]}</span>
                  </span>
                  <span className="break-all font-mono text-[13px] font-semibold">{item.sku}</span>
                  <span className="text-sm [overflow-wrap:anywhere]">{item.descricao ?? 'SKU fora do cadastro de produtos'}</span>
                  <span className="text-xs text-texto-2 [overflow-wrap:anywhere]">
                    {item.fornecedor ?? 'Sem fornecedor'}
                    {item.ean ? <span className="font-mono"> · EAN {item.ean}</span> : null}
                    <span className="font-mono"> · S/N {item.serial ?? '—'}</span>
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {!apagada && (
        <>
          {/* (extra, E27) A ficha da venda do ML, logo depois dos itens: o que foi vendido. Some fora do canal ML. */}
          <SecaoVenda devolucaoId={d.id} codigo={d.codigo} status={d.status} usuario={usuario} />

          {/* Uma seção por fase (contrato §2, P2 item 9), nesta ordem, entre "Itens" e "Histórico". */}
          <SecaoConferencia devolucaoId={d.id} codigo={d.codigo} status={d.status} usuario={usuario} />
          <SecaoMercadoLivre devolucaoId={d.id} codigo={d.codigo} status={d.status} usuario={usuario} />
          <SecaoFiscal devolucaoId={d.id} codigo={d.codigo} status={d.status} usuario={usuario} />
          <SecaoLote devolucaoId={d.id} codigo={d.codigo} status={d.status} usuario={usuario} />
        </>
      )}

      <section aria-labelledby="titulo-historico" className={CARTAO}>
        <h2 id="titulo-historico" className="mb-3 text-base font-bold">
          Histórico
        </h2>
        <ol className="flex flex-col gap-3">
          {d.eventos.map((e) => {
            const motivo = motivoDoEvento(e.dados);
            // (extra, E25) Ex.: "Chegada registrada (voltou do armazém do ML)".
            const complemento = complementoDoEvento(e.acao, e.dados);
            return (
              <li key={e.id} className="flex flex-col text-sm">
                <span className="font-semibold">
                  {rotuloDaAcao(e.acao)}
                  {complemento && <span className="font-normal"> {complemento}</span>}
                </span>
                {e.para && e.de !== e.para && (
                  <span className="text-texto-2">
                    {e.de ? `${rotuloStatus(e.de)} → ` : ''}
                    {rotuloStatus(e.para)}
                  </span>
                )}
                {motivo && <span>Motivo: {motivo}</span>}
                <span className="text-xs text-texto-2">
                  {formatarDataHora(e.em)} · {e.usuarioNome ?? 'Sistema'}
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      {ehGestor && !apagada && d.naoIdentificada && <FormularioIdentificar acao={identificarAcao.bind(null, d.id, d.codigo)} />}
      {/* (extra, E29) Corrigir (Gestor): o último bloco da página, recolhido (o cancelar da E24 está dentro, por último). */}
      {ehGestor && !apagada && <SecaoCorrigir devolucaoId={d.id} codigo={d.codigo} status={d.status} usuario={usuario} />}
    </div>
  );
}
