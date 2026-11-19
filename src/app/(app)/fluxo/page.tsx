import type { Metadata } from 'next';
import { AlertasPainel, ALERTAS_NO_PAINEL } from '@/components/acabamento/AlertasPainel';
import { BuscaAvancada } from '@/components/BuscaAvancada';
import { EtapasCelular } from '@/components/EtapasCelular';
import { MenuAcoesFluxo, type AcaoFluxo } from '@/components/MenuAcoesFluxo';
import { QuadroFluxo } from '@/components/QuadroFluxo';
import { VAZIO } from '@/components/estilos';
import { DivisaoEstoque } from '@/components/fiscal/DivisaoEstoque';
import { CartaoLote } from '@/components/lotes/CartaoLote';
import { obterDb } from '@/db';
import { primeiroValor, type ParametrosBusca } from '@/lib/parametros';
import { carregarAlertas } from '@/modules/acabamento/alertas';
import { pode, type Acao } from '@/modules/auth/permissoes';
import { exigirPermissao } from '@/modules/auth/servidor';
import { ETAPAS } from '@/modules/devolucoes/etapas';
import { montarQuadro } from '@/modules/devolucoes/quadro';

export const metadata: Metadata = { title: 'Fluxo · Gestão de Devoluções' };

/**
 * Opção C (decisão do usuário em 19/11/2026): o menu "O que você quer fazer?" substitui as 4 entradas soltas no topo
 * (Recebimento, Nova devolução, Retiradas do Full e Planilha Volta ao armazém). Cada perfil vê só o que pode usar;
 * o Fiscal chega às Retiradas do Full ((extra), melhoria 3) e à planilha por aqui.
 */
const ACOES_FLUXO: (AcaoFluxo & { permissao: Acao })[] = [
  {
    permissao: 'operar_devolucoes',
    href: '/fluxo/recebimento',
    quando: 'Chegou um pacote na bancada',
    rotulo: 'Receber pacote',
    icone: 'pacote',
    destaque: true,
  },
  { permissao: 'operar_devolucoes', href: '/fluxo/devolucoes/nova', quando: 'Vai chegar uma devolução', rotulo: 'Nova devolução', icone: 'mais' },
  { permissao: 'ver_listas', href: '/fluxo/retiradas-full', quando: 'Voltou do armazém do ML', rotulo: 'Retiradas do Full', icone: 'caminhao' },
  {
    permissao: 'ver_listas',
    href: '/fluxo/estoque-bom',
    quando: 'Ver o que volta para venda',
    rotulo: 'Planilha Volta ao armazém',
    icone: 'planilha',
  },
];

export default async function PaginaFluxo({ searchParams }: { searchParams: Promise<ParametrosBusca> }) {
  const usuario = await exigirPermissao('ver_listas');
  const textoEtapa = primeiroValor((await searchParams).etapa);
  const pedida = /^\d+$/.test(textoEtapa) ? Number(textoEtapa) : 0;
  const [quadro, alertas] = await Promise.all([montarQuadro(obterDb()), carregarAlertas(obterDb(), usuario.perfil)]);
  // Coluna 4: os links Estoque Bom e Estoque Problema substituem o "Ver lista" (spec §6.4, D16).
  // Coluna 5: os lotes por fornecedor (decisão 15), contados em "lotes".
  const colunas = quadro.map((c) => {
    if (c.numero === 4) return { ...c, href: undefined };
    if (c.numero !== 5) return c;
    const lotes = c.lotes ?? [];
    return {
      ...c,
      unidade: { singular: 'lote', plural: 'lotes' },
      exibidos: lotes.length,
      conteudo:
        lotes.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {lotes.map((l) => (
              <li key={l.id}>
                <CartaoLote lote={l} href={`/lotes/${l.codigo}`} />
              </li>
            ))}
          </ul>
        ) : (
          <p className={VAZIO}>Nenhum lote em andamento.</p>
        ),
    };
  });
  const estoque = quadro.find((c) => c.numero === 4)?.estoque;
  // Sem etapa válida na URL, o celular abre a primeira etapa que tem devoluções (ou a 1).
  const selecionada = ETAPAS.some((e) => e.numero === pedida) ? pedida : (colunas.find((c) => c.total > 0)?.numero ?? 1);
  const acoes = ACOES_FLUXO.filter((a) => pode(usuario.perfil, a.permissao));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Fluxo de devoluções</h1>
        <MenuAcoesFluxo acoes={acoes} />
      </div>
      <AlertasPainel alertas={alertas} limite={ALERTAS_NO_PAINEL} />
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
