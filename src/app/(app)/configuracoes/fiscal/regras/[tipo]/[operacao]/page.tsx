import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { ALERTA_ATENCAO, CARTAO, LINK_VOLTAR, ROTULO } from '@/components/estilos';
import { obterDb } from '@/db';
import { formatarDataHora } from '@/lib/formatar';
import { pode } from '@/modules/auth/permissoes';
import { exigirPermissao } from '@/modules/auth/servidor';
import { ehOperacao, ehTipoNota } from '@/modules/fiscal/dominio';
import { listarRegras, rotuloRegra } from '@/modules/fiscal/regras';
import { salvarRegraAcao } from '../../../acoes';
import { FormularioRegra } from '../../../FormularioRegra';

type Props = { params: Promise<{ tipo: string; operacao: string }> };

export const metadata: Metadata = { title: 'Regra fiscal · Gestão de Devoluções' };

function Dado({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className={ROTULO}>{rotulo}</dt>
      <dd className="break-words text-[15px]">{children}</dd>
    </div>
  );
}

export default async function PaginaRegraFiscal({ params }: Props) {
  const usuario = await exigirPermissao('gerir_fiscal');
  const { tipo, operacao } = await params;
  if (!ehTipoNota(tipo) || !ehOperacao(operacao)) notFound();
  const { regime, regras } = await listarRegras(obterDb());
  const regra = regras.find((r) => r.tipoNota === tipo && r.operacao === operacao);
  if (!regra) notFound();
  const podeEditar = pode(usuario.perfil, 'administrar');

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Link href="/configuracoes/fiscal" className={LINK_VOLTAR}>
          ← Configurações fiscais
        </Link>
        <h1 className="text-xl font-bold">Regra fiscal: {rotuloRegra(tipo, operacao)}</h1>
      </div>
      <p className="text-sm text-texto-2">
        {regra.salva && regra.atualizadoEm
          ? `Salva em ${formatarDataHora(regra.atualizadoEm)}.`
          : 'Valores sugeridos (spec §8.3), ainda não salvos. O contador valida antes de salvar.'}
      </p>
      {!regime ? (
        <p className={ALERTA_ATENCAO}>Escolha o regime tributário nos dados da empresa antes de salvar as regras.</p>
      ) : podeEditar ? (
        <section className={CARTAO}>
          <FormularioRegra acao={salvarRegraAcao.bind(null, tipo, operacao)} regra={regra} regime={regime} />
        </section>
      ) : (
        <dl className={`${CARTAO} grid gap-x-6 gap-y-3 sm:grid-cols-2`}>
          <Dado rotulo="CFOP">{regra.cfop}</Dado>
          <Dado rotulo={regime === 'SIMPLES' ? 'CSOSN do ICMS' : 'CST do ICMS'}>{regra.icmsSituacaoTributaria}</Dado>
          <Dado rotulo="CST do PIS">{regra.pisSituacaoTributaria}</Dado>
          <Dado rotulo="CST do COFINS">{regra.cofinsSituacaoTributaria}</Dado>
          <Dado rotulo="Natureza da operação">{regra.naturezaOperacao}</Dado>
          <Dado rotulo="Informações complementares">{regra.informacoesComplementares ?? '—'}</Dado>
        </dl>
      )}
    </div>
  );
}
