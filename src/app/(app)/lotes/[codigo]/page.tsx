import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { PainelLote } from '@/components/lotes/PainelLote';
import { Selo } from '@/components/Selo';
import { ALERTA_ERRO, CARTAO, LINK_VOLTAR, ROTULO } from '@/components/estilos';
import { obterDb } from '@/db';
import { primeiroValor } from '@/lib/parametros';
import { pode } from '@/modules/auth/permissoes';
import { exigirPermissao } from '@/modules/auth/servidor';
import { obterArmazenamento } from '@/modules/midia/armazenamento';
import { obterDetalheLote } from '@/modules/lotes/consultas';
import { ehCodigoLote } from '@/modules/lotes/dominio';
import { acaoLote } from './acoes';

const SEGUNDOS_LINK = 600;

type Props = { params: Promise<{ codigo: string }>; searchParams: Promise<{ erro?: string | string[] }> };

export async function generateMetadata({ params }: Pick<Props, 'params'>): Promise<Metadata> {
  const { codigo } = await params;
  return { title: `${codigo} · Lotes e Remessas · Gestão de Devoluções` };
}

function Dado({ rotulo, mono = false, children }: { rotulo: string; mono?: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className={ROTULO}>{rotulo}</dt>
      <dd className={`break-words text-[15px] ${mono ? 'break-all font-mono' : ''}`}>{children}</dd>
    </div>
  );
}

export default async function PaginaLoteDetalhe({ params, searchParams }: Props) {
  const usuario = await exigirPermissao('ver_listas');
  const { codigo } = await params;
  if (!ehCodigoLote(codigo)) notFound();
  const erroLista = primeiroValor((await searchParams).erro) === 'lista';
  const d = await obterDetalheLote(obterDb(), codigo);
  if (!d) notFound();
  const podeGerir = pode(usuario.perfil, 'gerir_fiscal');

  let links: { xml: string; danfe: string } | null = null;
  if (d.nota?.situacao === 'AUTORIZADA' && d.nota.xmlCaminho && d.nota.danfeCaminho) {
    const armazenamento = obterArmazenamento();
    links = {
      xml: await armazenamento.urlTemporaria(d.nota.xmlCaminho, SEGUNDOS_LINK),
      danfe: await armazenamento.urlTemporaria(d.nota.danfeCaminho, SEGUNDOS_LINK),
    };
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        {podeGerir ? (
          <Link href="/lotes" className={LINK_VOLTAR}>
            ← Lotes e Remessas
          </Link>
        ) : (
          <Link href="/fluxo/etapa/5" className={LINK_VOLTAR}>
            ← Agrupamento por Fornecedor (Remessas)
          </Link>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-mono text-2xl font-bold">{d.codigo}</h1>
          <Selo texto={d.rotuloStatus} tom={d.tom} />
          {d.rotuloTipo && <Selo texto={d.rotuloTipo} tom="neutro" />}
        </div>
        {d.unidades.length === 0 && <p className="text-sm text-texto-2">Lote vazio: as unidades foram movidas.</p>}
      </div>

      {erroLista && <p className={ALERTA_ERRO}>A lista consolidada sai depois da NF de Remessa autorizada.</p>}

      <section aria-labelledby="titulo-dados" className={CARTAO}>
        <h2 id="titulo-dados" className="mb-3 text-base font-bold">
          Dados
        </h2>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Dado rotulo="Fornecedor">{d.fornecedor.razaoSocial}</Dado>
          <Dado rotulo="CNPJ" mono>
            {d.fornecedor.cnpj}
          </Dado>
          <Dado rotulo="UF">{d.fornecedor.uf ?? '—'}</Dado>
          <Dado rotulo="Contato SAC">{d.fornecedor.contatoSac ?? '—'}</Dado>
          <Dado rotulo="E-mail SAC">{d.fornecedor.emailSac ?? '—'}</Dado>
          <Dado rotulo="Rastreio do envio" mono>
            {d.rastreioEnvio ?? '—'}
          </Dado>
          <Dado rotulo="Criado">{d.datas.criado}</Dado>
          <Dado rotulo="Fechado">{d.datas.fechado ?? '—'}</Dado>
          <Dado rotulo="Enviado">{d.datas.enviado ?? '—'}</Dado>
          <Dado rotulo="Finalizado">{d.datas.finalizado ?? '—'}</Dado>
        </dl>
      </section>

      <PainelLote detalhe={d} podeGerir={podeGerir} links={links} acao={acaoLote.bind(null, d.id, d.codigo)} />

      {/* (extra) Histórico do lote e das NF dele. */}
      <section aria-labelledby="titulo-historico" className={CARTAO}>
        <h2 id="titulo-historico" className="mb-3 text-base font-bold">
          Histórico
        </h2>
        {d.historico.length === 0 ? (
          <p className="text-sm text-texto-2">Nenhum evento ainda.</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {d.historico.map((e) => (
              <li key={e.id} className="flex flex-col text-sm">
                <span className="font-semibold">{e.texto}</span>
                <span className="text-xs text-texto-2">{`${e.em} · ${e.quem}`}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
