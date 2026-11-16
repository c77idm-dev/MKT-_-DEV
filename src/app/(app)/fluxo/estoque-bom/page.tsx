import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertaComFoco } from '@/components/AlertaComFoco';
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, CAMPO, CARTAO, LINK_VOLTAR, ROTULO, VAZIO } from '@/components/estilos';
import { Selo } from '@/components/Selo';
import { obterDb } from '@/db';
import { formatarDataHora } from '@/lib/formatar';
import type { ParametrosBusca } from '@/lib/parametros';
import { exigirPermissao } from '@/modules/auth/servidor';
import type { TomSelo } from '@/modules/devolucoes/selos';
import { listarVoltaAoArmazem } from '@/modules/volta-armazem/consulta';
import {
  atalhosDoPeriodo,
  CARTOES_MAXIMOS,
  hrefDaOrigem,
  lerPeriodo,
  MENSAGEM_PERIODO_INVALIDO,
  SITUACAO_RETIRADA,
  textoPeriodo,
  type LinhaVolta,
} from '@/modules/volta-armazem/dominio';

export const metadata: Metadata = { title: 'Estoque Bom · Gestão de Devoluções' };

const ATALHO = 'flex min-h-11 items-center justify-center rounded-full border px-4 text-[15px] font-semibold';

function tomDaSituacao(situacao: string): TomSelo {
  if (situacao === 'Aguardando NF') return 'atencao';
  if (situacao === 'Disponível para venda') return 'bom';
  if (situacao === SITUACAO_RETIRADA) return 'destaque';
  return 'neutro';
}

function CartaoVolta({ linha }: { linha: LinhaVolta }) {
  const titulo = `sku-${linha.chave}`;
  return (
    <article aria-labelledby={titulo} className={`${CARTAO} flex h-full flex-col gap-1.5 p-3`}>
      <div className="flex items-start justify-between gap-2">
        <h2 id={titulo} className="min-w-0 break-all font-mono font-semibold">
          {linha.sku || 'Sem cadastro'}
        </h2>
        <span className="shrink-0">
          <Selo texto={linha.situacao} tom={tomDaSituacao(linha.situacao)} />
        </span>
      </div>
      <p className="break-words text-sm">{linha.descricao || '—'}</p>
      <p className="text-sm">
        Quantidade: <strong>{linha.quantidade}</strong>
      </p>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 text-xs text-texto-2">
        <Link href={hrefDaOrigem(linha)} className="inline-flex min-h-11 items-center font-mono text-sm font-semibold text-destaque underline">
          {linha.origem}
        </Link>
        <span>{formatarDataHora(linha.data)}</span>
      </div>
    </article>
  );
}

/**
 * Melhoria 4: "Estoque Bom" (planilha Volta ao armazém). O que foi para o Estoque Bom no período: unidades BOM das
 * conferências concluídas e itens das retiradas do Full conferidas. Só leitura; todos os perfis (ver_listas).
 */
export default async function PaginaEstoqueBom({ searchParams }: { searchParams: Promise<ParametrosBusca> }) {
  await exigirPermissao('ver_listas');
  const periodo = lerPeriodo(await searchParams);
  const linhas = periodo.valido ? await listarVoltaAoArmazem(obterDb(), periodo) : [];
  const unidades = linhas.reduce((soma, l) => soma + l.quantidade, 0);
  const consulta = new URLSearchParams({ de: periodo.de, ate: periodo.ate });

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <Link href="/fluxo/etapa/4" className={`${LINK_VOLTAR} -mb-2 self-start`}>
        ← Etapa 4
      </Link>
      <div>
        <h1 className="text-xl font-bold">Estoque Bom</h1>
        <p className="text-sm text-texto-2">Volta ao armazém: o que foi para o Estoque Bom no período, para lançar no estoque.</p>
      </div>

      <nav aria-label="Atalhos do período" className="flex flex-wrap gap-2">
        {atalhosDoPeriodo().map((a) => {
          const ativo = periodo.de === a.de && periodo.ate === a.ate;
          return (
            <Link
              key={a.rotulo}
              href={`/fluxo/estoque-bom?${new URLSearchParams({ de: a.de, ate: a.ate })}`}
              aria-current={ativo ? 'true' : undefined}
              className={`${ATALHO} ${ativo ? 'border-destaque bg-destaque text-white' : 'border-borda-campo bg-superficie text-texto'}`}
            >
              {a.rotulo}
            </Link>
          );
        })}
      </nav>

      <form method="get" action="/fluxo/estoque-bom" className="grid grid-cols-2 gap-3 sm:flex sm:items-end">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="volta-de" className={ROTULO}>
            De
          </label>
          <input id="volta-de" name="de" type="date" required defaultValue={periodo.de} className={CAMPO} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="volta-ate" className={ROTULO}>
            Até
          </label>
          <input id="volta-ate" name="ate" type="date" required defaultValue={periodo.ate} className={CAMPO} />
        </div>
        <button type="submit" className={`${BOTAO_SECUNDARIO} col-span-2`}>
          Filtrar
        </button>
      </form>

      {!periodo.valido ? (
        <AlertaComFoco texto={MENSAGEM_PERIODO_INVALIDO} />
      ) : (
        <>
          <p className="text-sm text-texto-2">
            {unidades} {unidades === 1 ? 'unidade' : 'unidades'} de {textoPeriodo(periodo)}
          </p>
          {linhas.length === 0 ? (
            <p className={VAZIO}>Nada voltou ao armazém nesse período.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {linhas.slice(0, CARTOES_MAXIMOS).map((l) => (
                <li key={l.chave}>
                  <CartaoVolta linha={l} />
                </li>
              ))}
            </ul>
          )}
          {/* (extra) A página fica leve: além de 200 cartões, só a planilha traz tudo. */}
          {linhas.length > CARTOES_MAXIMOS && (
            <p className="text-sm text-texto-2">{`Mostrando as primeiras ${CARTOES_MAXIMOS} de ${linhas.length} linhas. Baixe a planilha para ver tudo.`}</p>
          )}
          <div className="acima-barra sticky z-20 -mx-4 border-t border-borda bg-superficie/95 px-4 py-3 sm:-mx-8 sm:px-8 md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
            {/* <a> e não <Link>: é um download (rota de API), não uma navegação do app. */}
            <a href={`/api/estoque-bom/planilha?${consulta}`} className={`${BOTAO_PRIMARIO} w-full md:w-auto`}>
              Baixar planilha
            </a>
          </div>
        </>
      )}
    </div>
  );
}
