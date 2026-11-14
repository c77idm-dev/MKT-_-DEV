import type { Metadata } from 'next';
import Link from 'next/link';
import { BuscaAvancada } from '@/components/BuscaAvancada';
import { EtapasCelular } from '@/components/EtapasCelular';
import { QuadroFluxo } from '@/components/QuadroFluxo';
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from '@/components/estilos';
import { DivisaoEstoque } from '@/components/fiscal/DivisaoEstoque';
import { obterDb } from '@/db';
import { primeiroValor, type ParametrosBusca } from '@/lib/parametros';
import { pode } from '@/modules/auth/permissoes';
import { exigirPermissao } from '@/modules/auth/servidor';
import { ETAPAS } from '@/modules/devolucoes/etapas';
import { montarQuadro, NOTA_ETAPA_LOTES } from '@/modules/devolucoes/quadro';

export const metadata: Metadata = { title: 'Fluxo · Gestão de Devoluções' };

export default async function PaginaFluxo({ searchParams }: { searchParams: Promise<ParametrosBusca> }) {
  const usuario = await exigirPermissao('ver_listas');
  const textoEtapa = primeiroValor((await searchParams).etapa);
  const pedida = /^\d+$/.test(textoEtapa) ? Number(textoEtapa) : 0;
  const quadro = await montarQuadro(obterDb());
  // Coluna 4: os links Estoque Bom e Estoque Problema substituem o "Ver lista" (spec §6.4, D16).
  const colunas = quadro.map((c) => (c.numero === 5 ? { ...c, nota: NOTA_ETAPA_LOTES } : c.numero === 4 ? { ...c, href: undefined } : c));
  const estoque = quadro.find((c) => c.numero === 4)?.estoque;
  // Sem etapa válida na URL, o celular abre a primeira etapa que tem devoluções (ou a 1).
  const selecionada = ETAPAS.some((e) => e.numero === pedida) ? pedida : (colunas.find((c) => c.total > 0)?.numero ?? 1);
  const podeOperar = pode(usuario.perfil, 'operar_devolucoes');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Fluxo de devoluções</h1>
        {podeOperar && (
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <Link href="/fluxo/recebimento" className={BOTAO_PRIMARIO}>
              Recebimento
            </Link>
            <Link href="/fluxo/devolucoes/nova" className={BOTAO_SECUNDARIO}>
              Nova devolução
            </Link>
          </div>
        )}
      </div>
      <BuscaAvancada acao="/fluxo/busca" filtros={{}} />
      <div className="md:hidden">
        {/* Mobile-first: Estoque Bom / Estoque Problema no TOPO da etapa 4, acima dos cartões, pelo ponto de extensão
            `conteudoEtapa` da Parte A (o EtapasCelular é congelado; contrato §10, E5). */}
        <EtapasCelular
          colunas={colunas}
          selecionada={selecionada}
          conteudoEtapa={estoque ? { 4: <DivisaoEstoque bom={estoque.bom} problema={estoque.problema} /> } : undefined}
        />
      </div>
      <div className="hidden md:block">
        <QuadroFluxo colunas={colunas} />
      </div>
    </div>
  );
}
