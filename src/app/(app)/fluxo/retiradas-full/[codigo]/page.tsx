import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import type { EvidenciaServidor } from '@/components/conferencia/estadoSlot';
import { CARTAO, LINK_VOLTAR, ROTULO } from '@/components/estilos';
import { RegistrarServiceWorker } from '@/components/pwa/RegistrarServiceWorker';
import { Selo } from '@/components/Selo';
import { obterDb } from '@/db';
import { formatarDataHora } from '@/lib/formatar';
import { pode } from '@/modules/auth/permissoes';
import { exigirPermissao } from '@/modules/auth/servidor';
import { listarEventos, rotuloDaAcao } from '@/modules/historico/eventos';
import { linksDasEvidencias } from '@/modules/midia/links-evidencias';
import { obterRetirada } from '@/modules/retiradas/consultas';
import { ehCodigoRetirada, ROTULO_SITUACAO_RETIRADA } from '@/modules/retiradas/dominio';
import { biparAcao, concluirAcao, darChegadaEtiquetaAmarelaAcao, procurarEtiquetaAmarelaAcao, quantidadeAcao, removerAcao } from './acoes';
import { TelaRetirada } from './TelaRetirada';

type Props = { params: Promise<{ codigo: string }> };

/** Na retirada as evidências são fotos (da etiqueta ou do item): o histórico fala de foto. */
const ROTULO_FOTO: Record<string, string> = {
  evidencia_enviada: 'Foto enviada',
  evidencia_refeita: 'Foto refeita',
  evidencia_processada: 'Foto processada',
  evidencia_falhou: 'Foto falhou no servidor',
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { codigo } = await params;
  return { title: `${codigo} · Retirada do Full · Gestão de Devoluções` };
}

function Dado({ rotulo, mono = false, children }: { rotulo: string; mono?: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className={ROTULO}>{rotulo}</dt>
      <dd className={`break-words text-[15px] ${mono ? 'break-all font-mono' : ''}`}>{children}</dd>
    </div>
  );
}

function Foto({ url, alt }: { url: string | undefined; alt: string }) {
  if (!url) return <span className="text-sm text-texto-2">Foto em processamento.</span>;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 w-fit">
      {/* eslint-disable-next-line @next/next/no-img-element -- link temporário de 10 min: não passa pelo otimizador de imagens */}
      <img src={url} alt={alt} className="size-24 rounded-lg object-cover" />
    </a>
  );
}

/** Retirada do Full (melhoria 3). Aberta + quem opera: a tela de conferência. Senão (Conferida ou Fiscal): só leitura. */
export default async function PaginaRetirada({ params }: Props) {
  const usuario = await exigirPermissao('ver_listas');
  const { codigo } = await params;
  if (!ehCodigoRetirada(codigo)) notFound();
  const db = obterDb();
  const r = await obterRetirada(db, codigo);
  if (!r) notFound();
  const links = await linksDasEvidencias(r.evidencias);
  const podeOperar = pode(usuario.perfil, 'operar_devolucoes');
  const aberta = r.situacao === 'ABERTA';

  const cabecalho = (
    <div className="flex flex-col gap-1">
      <Link href={podeOperar && aberta ? '/fluxo/recebimento' : '/fluxo/retiradas-full'} className={LINK_VOLTAR}>
        ← {podeOperar && aberta ? 'Recebimento' : 'Retiradas do Full'}
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-mono text-xl font-bold">{r.codigo}</h1>
        <Selo texto={ROTULO_SITUACAO_RETIRADA[r.situacao]} tom={aberta ? 'atencao' : 'bom'} />
      </div>
      <p className="break-all text-sm text-texto-2">
        Retirada do Full · Etiqueta <span className="font-mono">{r.codigoEtiqueta}</span>
      </p>
    </div>
  );

  if (aberta && podeOperar) {
    const evidencias: EvidenciaServidor[] = r.evidencias.map((e) => ({
      id: e.id,
      tipo: e.tipo,
      itemId: e.itemId,
      situacao: e.situacao,
      erro: e.erro,
      url: links.get(e.id) ?? null,
    }));
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-3">
        <RegistrarServiceWorker />
        {cabecalho}
        <TelaRetirada
          retirada={{ id: r.id, codigo: r.codigo, codigoEtiqueta: r.codigoEtiqueta }}
          itensIniciais={r.itens}
          chegadasEtiquetaAmarelaIniciais={r.chegadasEtiquetaAmarela}
          evidencias={evidencias}
          acoes={{
            bipar: biparAcao,
            quantidade: quantidadeAcao,
            remover: removerAcao,
            concluir: concluirAcao,
            etiquetaAmarela: { procurar: procurarEtiquetaAmarelaAcao, darChegada: darChegadaEtiquetaAmarelaAcao },
          }}
        />
      </div>
    );
  }

  const fotoEtiqueta = r.evidencias.find((e) => e.tipo === 'FOTO_1_ETIQUETA' && e.itemId === null && e.situacao !== 'FALHOU');
  const eventos = await listarEventos(db, 'retirada_full', r.id);
  const unidades = r.itens.reduce((n, i) => n + i.quantidade, 0);
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-3">
      {cabecalho}
      <p className="rounded-lg bg-atencao-suave px-3 py-2 text-sm font-medium text-atencao">Isto não é devolução. Confira os itens e guarde no estoque.</p>
      <section aria-labelledby="titulo-dados" className={CARTAO}>
        <h2 id="titulo-dados" className="sr-only">
          Dados da retirada
        </h2>
        <dl className="flex flex-col gap-3">
          <Dado rotulo="Recebida em">{formatarDataHora(r.recebidaEm)}</Dado>
          <Dado rotulo="Recebida por">{r.recebidaPorNome ?? 'usuário removido'}</Dado>
          {r.concluidaEm && <Dado rotulo="Conferida em">{formatarDataHora(r.concluidaEm)}</Dado>}
          <Dado rotulo="Foto da etiqueta">
            {fotoEtiqueta ? <Foto url={links.get(fotoEtiqueta.id)} alt={`Foto da etiqueta ${r.codigoEtiqueta}`} /> : 'Sem foto'}
          </Dado>
        </dl>
      </section>
      <section aria-labelledby="titulo-itens" className="flex flex-col gap-3">
        <h2 id="titulo-itens" className="text-base font-bold">
          Itens ({unidades})
        </h2>
        {r.itens.length === 0 && <p className="text-sm text-texto-2">Nenhum produto bipado.</p>}
        {r.itens.map((item) => {
          const foto = r.evidencias.find((e) => e.itemId === item.id && e.situacao !== 'FALHOU');
          return (
            <article key={item.id} aria-labelledby={`item-${item.id}`} className={`${CARTAO} flex flex-col gap-2`}>
              <div className="flex items-start justify-between gap-2">
                <h3 id={`item-${item.id}`} className="min-w-0 break-words text-base font-bold">
                  {item.descricao}
                </h3>
                {item.semCadastro && (
                  <span className="shrink-0 whitespace-nowrap">
                    <Selo texto="sem cadastro" tom="atencao" />
                  </span>
                )}
              </div>
              <p className="break-all font-mono text-[13px] text-texto-2">
                {item.sku ? `${item.sku} · ` : ''}EAN {item.eanLido ?? '—'}
              </p>
              <p className="text-[15px]">
                Quantidade: <span className="font-bold">{item.quantidade}</span>
              </p>
              {foto && <Foto url={links.get(foto.id)} alt={`Foto do item ${item.descricao}`} />}
            </article>
          );
        })}
      </section>
      <section aria-labelledby="titulo-historico" className={CARTAO}>
        <h2 id="titulo-historico" className="mb-3 text-base font-bold">
          Histórico
        </h2>
        <ol className="flex flex-col gap-3">
          {eventos.map((e) => (
            <li key={e.id} className="flex flex-col text-sm">
              <span className="font-semibold">{ROTULO_FOTO[e.acao] ?? rotuloDaAcao(e.acao)}</span>
              <span className="text-xs text-texto-2">
                {formatarDataHora(e.em)} · {e.usuarioNome ?? 'Sistema'}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
