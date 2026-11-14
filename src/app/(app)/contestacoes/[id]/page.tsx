import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MensagemSucesso } from '@/components/MensagemSucesso';
import { Selo } from '@/components/Selo';
import { ALERTA_ATENCAO, ALERTA_ERRO, BOTAO_SECUNDARIO, CARTAO, LINK_VOLTAR } from '@/components/estilos';
import { Dado } from '@/components/mercado-livre/Dado';
import { obterDb } from '@/db';
import { formatarDataHora } from '@/lib/formatar';
import { primeiroValor } from '@/lib/parametros';
import { exigirPermissao } from '@/modules/auth/servidor';
import { obterContestacao } from '@/modules/mercado-livre/contestacoes';
import { ROTULO_MOTIVO_CANAL, ROTULO_STATUS_CONTESTACAO } from '@/modules/mercado-livre/dominio';
import { LIMITE_MENSAGEM } from '@/modules/mercado-livre/resultado';
import { TOM_STATUS_CONTESTACAO } from '@/modules/mercado-livre/selos';
import { armazenamentoDoProvedor, provedorAtual } from '@/modules/midia/armazenamento';
import { enviarAcao } from './acoes';
import { FormularioContestacao } from './FormularioContestacao';

export const metadata: Metadata = { title: 'Contestação · Gestão de Devoluções' };

/** Spec §9: links temporários de 10 min, nunca públicos. */
const VALIDADE_LINK_S = 600;

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string | string[] }> };

export default async function PaginaContestacao({ params, searchParams }: Props) {
  await exigirPermissao('administrar');
  const { id } = await params;
  const c = await obterContestacao(obterDb(), id);
  if (!c) notFound();
  const pedido = primeiroValor((await searchParams).ok) === 'solicitado';
  // Cada foto pelo provedor onde foi gravada (disco ou s3; contrato §10, E15).
  const fotos = await Promise.all(
    c.fotos.map(async (f) => ({
      id: f.id,
      rotulo: f.rotulo,
      selecionada: f.selecionada,
      url: f.caminho ? await armazenamentoDoProvedor(f.provedor ?? provedorAtual()).urlTemporaria(f.caminho, VALIDADE_LINK_S) : null,
    })),
  );
  const podeEditar = (c.status === 'AGUARDANDO_GESTOR' && !c.enviando) || c.status === 'FALHOU';

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Link href={`/contestacoes?status=${c.status}`} className={LINK_VOLTAR}>
          ← Contestações ML
        </Link>
        <h1 className="text-xl font-bold">
          Contestação <span className="font-mono">{c.codigo}</span>
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Selo texto={c.enviando ? 'Enviando ao ML' : ROTULO_STATUS_CONTESTACAO[c.status]} tom={c.enviando ? 'destaque' : TOM_STATUS_CONTESTACAO[c.status]} />
          {c.selo && <Selo texto={c.selo.texto} tom={c.selo.tom} />}
        </div>
      </div>

      {pedido && c.status !== 'FALHOU' && <MensagemSucesso texto="Envio pedido ao Mercado Livre. O resultado aparece aqui em instantes." />}
      {c.status === 'FALHOU' && c.erro && (
        <p role="alert" className={`${ALERTA_ERRO} [overflow-wrap:anywhere]`}>
          O envio falhou: {c.erro}
        </p>
      )}

      <section aria-labelledby="titulo-devolucao" className={CARTAO}>
        <h2 id="titulo-devolucao" className="mb-3 text-base font-bold">
          Devolução
        </h2>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Dado rotulo="Código" mono>
            <Link href={`/fluxo/devolucoes/${c.codigo}`} className="inline-flex min-h-11 items-center font-semibold text-destaque underline">
              {c.codigo}
            </Link>
          </Dado>
          <Dado rotulo="Número do pedido" mono>
            {c.pedidos.join(', ') || '—'}
          </Dado>
          <Dado rotulo="ID da reclamação" mono>
            {c.reclamacaoId ?? '—'}
          </Dado>
          <Dado rotulo="ID da devolução no ML" mono>
            {c.devolucaoExternaId ?? '—'}
          </Dado>
        </dl>
      </section>

      <section aria-labelledby="titulo-itens" className="flex flex-col gap-2">
        <h2 id="titulo-itens" className="text-base font-bold">
          Itens com problema
        </h2>
        <ul className="grid gap-2 md:grid-cols-2">
          {c.itensProblema.map((i) => (
            <li key={i.unidade} className={`${CARTAO} flex flex-col gap-1 p-3`}>
              <span className="text-xs font-semibold text-texto-2">Unidade {i.unidade}</span>
              <span className="break-all font-mono text-[13px] font-semibold">{i.sku}</span>
              <span className="text-sm">{i.motivoTexto}</span>
              {i.observacao && <span className="text-sm text-texto-2 [overflow-wrap:anywhere]">{i.observacao}</span>}
            </li>
          ))}
        </ul>
      </section>

      {c.enviando && (
        <section aria-labelledby="titulo-enviando" className={`${CARTAO} flex flex-col gap-3`}>
          <h2 id="titulo-enviando" className="text-base font-bold">
            Enviando ao ML
          </h2>
          <p className={ALERTA_ATENCAO}>
            O envio foi pedido{c.revisadoPorNome ? ` por ${c.revisadoPorNome}` : ''}. O resultado aparece aqui em instantes.
          </p>
          <Link href={`/contestacoes/${c.id}`} className={`${BOTAO_SECUNDARIO} w-full md:w-auto`}>
            Atualizar
          </Link>
        </section>
      )}

      {c.status === 'ENVIADA' && (
        <section aria-labelledby="titulo-enviada" className={`${CARTAO} flex flex-col gap-3`}>
          <h2 id="titulo-enviada" className="text-base font-bold">
            Enviada ao ML
          </h2>
          <dl className="grid gap-3">
            <Dado rotulo="Enviada em">
              {c.enviadaEm ? formatarDataHora(c.enviadaEm) : '—'}
              {c.revisadoPorNome ? ` por ${c.revisadoPorNome}` : ''}
            </Dado>
            <Dado rotulo="Motivo">
              {c.motivo} · {ROTULO_MOTIVO_CANAL[c.motivo]}
            </Dado>
            <Dado rotulo="Mensagem">
              <span className="whitespace-pre-wrap">{c.mensagem}</span>
            </Dado>
            <Dado rotulo="Fotos escolhidas">
              {fotos.filter((f) => f.selecionada).length}
              <span className="block text-xs text-texto-2">Fotos acima de 5 MB não vão ao ML (spec §7.4).</span>
            </Dado>
          </dl>
        </section>
      )}

      {podeEditar && (
        <FormularioContestacao acao={enviarAcao.bind(null, c.id)} motivo={c.motivo} mensagem={c.mensagem} limiteMensagem={LIMITE_MENSAGEM} fotos={fotos} />
      )}
    </div>
  );
}
