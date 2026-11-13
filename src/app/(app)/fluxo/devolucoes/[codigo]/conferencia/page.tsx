import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { AssistenteConferencia } from '@/components/conferencia/AssistenteConferencia';
import { obterDb } from '@/db';
import { primeiroValor } from '@/lib/parametros';
import { exigirPermissao } from '@/modules/auth/servidor';
import { obterConferencia } from '@/modules/conferencia/leitura';
import { linksDasEvidencias } from '@/modules/midia/links-evidencias';
import { concluirAcao, desistirAcao, registrarEanAcao, salvarItemAcao } from './acoes';

type Props = { params: Promise<{ codigo: string }>; searchParams: Promise<{ passo?: string | string[] }> };

export async function generateMetadata({ params }: Pick<Props, 'params'>): Promise<Metadata> {
  const { codigo } = await params;
  return { title: `Conferência ${codigo} · Gestão de Devoluções` };
}

/** Spec §6.3 (etapa "Em Conferência / Triagem & Registro de Evidências"). Só quem está com a trava abre. */
export default async function PaginaConferencia({ params, searchParams }: Props) {
  const usuario = await exigirPermissao('operar_devolucoes');
  const { codigo } = await params;
  const dados = await obterConferencia(obterDb(), { codigo });
  if (!dados) notFound();
  if (dados.status !== 'EM_CONFERENCIA' || dados.conferenteId !== usuario.id) redirect(`/fluxo/devolucoes/${dados.codigo}`);
  const links = await linksDasEvidencias(dados.evidencias);
  const passo = Number.parseInt(primeiroValor((await searchParams).passo), 10);
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <AssistenteConferencia
        devolucao={{ id: dados.id, codigo: dados.codigo, rastreio: dados.rastreio }}
        itens={dados.itens}
        evidencias={dados.evidencias.map((e) => ({ id: e.id, tipo: e.tipo, itemId: e.itemId, situacao: e.situacao, erro: e.erro, url: links.get(e.id) ?? null }))}
        videoObrigatorio={dados.videoObrigatorio}
        passoInicial={Number.isFinite(passo) ? passo : 0}
        acoes={{ salvarItem: salvarItemAcao, registrarEan: registrarEanAcao, concluir: concluirAcao, desistir: desistirAcao }}
      />
    </div>
  );
}
