import Link from 'next/link';
import { BuscaAvancada } from '@/components/BuscaAvancada';
import { CartaoDevolucao } from '@/components/CartaoDevolucao';
import { Paginacao } from '@/components/Paginacao';
import { ALERTA_ATENCAO, ALERTA_ERRO, LINK_VOLTAR, VAZIO } from '@/components/estilos';
import { FormularioXmls } from '@/components/fiscal/FormularioXmls';
import { obterDb } from '@/db';
import { lerPagina, primeiroValor, type ParametrosBusca } from '@/lib/parametros';
import { pode } from '@/modules/auth/permissoes';
import { exigirPermissao } from '@/modules/auth/servidor';
import { buscarDevolucoes } from '@/modules/devolucoes/busca';
import { ETAPAS } from '@/modules/devolucoes/etapas';
import { filtrosParaQuery, lerFiltros, POR_PAGINA_DEVOLUCOES } from '@/modules/devolucoes/filtros';
import { contarEstoque } from '@/modules/devolucoes/quadro';
import { pendenciasFiscais } from '@/modules/fiscal/configuracao';
import { ABAS_ESTOQUE, type DestinoEstoque } from '@/modules/fiscal/dominio';
import { MENSAGEM_ERRO_XMLS, periodoDoMesAtual } from '@/modules/fiscal/periodo';
import { emitirNotasAcao } from './acoes';
import { ListaEstoque } from './ListaEstoque';

const TITULO = ETAPAS.find((e) => e.numero === 4)?.titulo ?? 'Destinação Fiscal e Estoque';
const ABA = 'flex min-h-11 items-center justify-center rounded-full border px-4 text-[15px] font-semibold';

/** Etapa 4 do PDF (spec §6.4): abas Estoque Bom e Estoque Problema, ambas com as devoluções em AGUARDANDO_NF. */
export async function PaginaEstoque({ aba, searchParams }: { aba: DestinoEstoque; searchParams: Promise<ParametrosBusca> }) {
  const usuario = await exigirPermissao('ver_listas');
  const parametros = await searchParams;
  const filtros = lerFiltros(parametros);
  const pagina = lerPagina(parametros);
  const atual = ABAS_ESTOQUE.find((a) => a.destino === aba) ?? ABAS_ESTOQUE[0];
  const podeEmitir = pode(usuario.perfil, 'gerir_fiscal');
  const db = obterDb();
  const [{ devolucoes, total }, contagem, pendencias] = await Promise.all([
    buscarDevolucoes(db, filtros, { status: ['AGUARDANDO_NF'], destino: aba, ordem: 'recentes', pagina }),
    contarEstoque(db),
    podeEmitir ? pendenciasFiscais(db) : Promise.resolve<string[]>([]),
  ]);
  const totais = { BOM: contagem.bom, PROBLEMA: contagem.problema };
  const selecionaveis = devolucoes.filter((d) => !d.situacaoNota).map((d) => d.id);
  const erroXmls = MENSAGEM_ERRO_XMLS[primeiroValor(parametros.xmls)];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <Link href="/fluxo" className={`${LINK_VOLTAR} -mb-2 self-start`}>
        ← Fluxo
      </Link>
      <h1 className="text-xl font-bold">{TITULO}</h1>
      <nav aria-label="Abas do estoque" className="grid grid-cols-2 gap-2 sm:flex">
        {ABAS_ESTOQUE.map((a) => {
          const ativa = a.destino === aba;
          return (
            <Link
              key={a.destino}
              href={a.href}
              aria-current={ativa ? 'page' : undefined}
              className={`${ABA} ${ativa ? 'border-destaque bg-destaque text-white' : 'border-borda-campo bg-superficie text-texto'}`}
            >
              {`${a.rotulo} (${totais[a.destino]})`}
            </Link>
          );
        })}
      </nav>
      {pendencias.length > 0 && (
        <section aria-labelledby="titulo-pendencias" className={`${ALERTA_ATENCAO} flex flex-col gap-1`}>
          <h2 id="titulo-pendencias" className="font-bold">
            A emissão de NF está bloqueada
          </h2>
          <ul className="list-disc pl-5">
            {pendencias.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <Link href="/configuracoes/fiscal" className="inline-flex min-h-11 items-center self-start font-semibold underline">
            Abrir Configurações › Fiscal
          </Link>
        </section>
      )}
      {erroXmls && (
        <p role="alert" className={ALERTA_ERRO}>
          {erroXmls}
        </p>
      )}
      <BuscaAvancada acao={atual.href} filtros={filtros} />
      <p className="text-sm text-texto-2">
        {total} {total === 1 ? 'devolução' : 'devoluções'} em {atual.rotulo}
      </p>
      {devolucoes.length === 0 ? (
        <p className={VAZIO}>Nenhuma devolução em {atual.rotulo}.</p>
      ) : podeEmitir ? (
        <ListaEstoque devolucoes={devolucoes} selecionaveis={selecionaveis} acao={emitirNotasAcao} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {devolucoes.map((d) => (
            <li key={d.id}>
              <CartaoDevolucao devolucao={d} />
            </li>
          ))}
        </ul>
      )}
      <Paginacao
        pagina={pagina}
        total={total}
        porPagina={POR_PAGINA_DEVOLUCOES}
        hrefDaPagina={(p) => `${atual.href}${filtrosParaQuery(filtros, { pagina: String(p) })}`}
      />
      {podeEmitir && <FormularioXmls {...periodoDoMesAtual()} />}
    </div>
  );
}
