import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { MensagemSucesso } from '@/components/MensagemSucesso';
import { Selo } from '@/components/Selo';
import { ALERTA_ATENCAO, CARTAO, ITEM_LISTA, LINK_VOLTAR, ROTULO } from '@/components/estilos';
import { obterDb } from '@/db';
import { primeiroValor, type ParametrosBusca } from '@/lib/parametros';
import { pode } from '@/modules/auth/permissoes';
import { exigirPermissao } from '@/modules/auth/servidor';
import { formatarCnpj } from '@/modules/catalogo/documentos';
import { lerConfiguracao } from '@/modules/configuracoes/ler';
import { entradaDaConfiguracao, pendenciasFiscais, situacaoDoEmissor } from '@/modules/fiscal/configuracao';
import { ROTULO_AMBIENTE, ROTULO_REGIME } from '@/modules/fiscal/dominio';
import { listarRegras, rotuloRegra } from '@/modules/fiscal/regras';
import { salvarAmbienteAcao, salvarEmpresaAcao } from './acoes';
import { FormularioAmbiente } from './FormularioAmbiente';
import { FormularioEmpresa } from './FormularioEmpresa';

export const metadata: Metadata = { title: 'Configurações fiscais · Gestão de Devoluções' };

/** Confirmações (as ações redirecionam com ?ok=). */
const MENSAGEM_OK: Record<string, string> = {
  empresa: 'Dados da empresa salvos.',
  ambiente: 'Ambiente da NF-e alterado.',
  regra: 'Regra fiscal salva.',
};

function Dado({ rotulo, mono = false, children }: { rotulo: string; mono?: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className={ROTULO}>{rotulo}</dt>
      <dd className={`text-[15px] ${mono ? 'break-all font-mono' : ''}`}>{children}</dd>
    </div>
  );
}

/** Configurações › Fiscal (spec §6.8 e §8): o Gestor edita; o Fiscal vê (chega pelo aviso da etapa 4). */
export default async function PaginaConfiguracaoFiscal({ searchParams }: { searchParams: Promise<ParametrosBusca> }) {
  const usuario = await exigirPermissao('gerir_fiscal');
  const podeEditar = pode(usuario.perfil, 'administrar');
  const db = obterDb();
  const [config, { regime, regras }, pendencias] = await Promise.all([lerConfiguracao(db), listarRegras(db), pendenciasFiscais(db)]);
  const ok = MENSAGEM_OK[primeiroValor((await searchParams).ok)];
  const emissor = situacaoDoEmissor();
  const endereco = [config.logradouro, config.numero, config.complemento, config.bairro, config.cidade, config.uf, config.cep]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Link href={podeEditar ? '/configuracoes' : '/fluxo/etapa/4'} className={LINK_VOLTAR}>
          {podeEditar ? '← Configurações' : '← Destinação Fiscal e Estoque'}
        </Link>
        <h1 className="text-xl font-bold">Configurações fiscais</h1>
      </div>

      {ok && <MensagemSucesso texto={ok} />}
      {!podeEditar && <p className={ALERTA_ATENCAO}>Só o Gestor altera estas configurações. Peça a ele o que faltar.</p>}
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
        </section>
      )}

      <section aria-labelledby="titulo-empresa" className={`${CARTAO} flex flex-col gap-3`}>
        <h2 id="titulo-empresa" className="text-base font-bold">
          Dados da empresa
        </h2>
        {podeEditar ? (
          <FormularioEmpresa acao={salvarEmpresaAcao} valores={entradaDaConfiguracao(config)} />
        ) : (
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <Dado rotulo="Razão social">{config.razaoSocial ?? '—'}</Dado>
            <Dado rotulo="CNPJ" mono>
              {config.cnpj ? formatarCnpj(config.cnpj) : '—'}
            </Dado>
            <Dado rotulo="Inscrição estadual" mono>
              {config.ie ?? '—'}
            </Dado>
            <Dado rotulo="Endereço">{endereco || '—'}</Dado>
            <Dado rotulo="Regime tributário">{config.regimeTributario ? ROTULO_REGIME[config.regimeTributario] : '—'}</Dado>
            <Dado rotulo="Série da NF-e" mono>
              {config.serieNfe ?? '—'}
            </Dado>
          </dl>
        )}
      </section>

      <section aria-labelledby="titulo-ambiente" className={`${CARTAO} flex flex-col gap-3`}>
        <h2 id="titulo-ambiente" className="text-base font-bold">
          Ambiente da NF-e
        </h2>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Dado rotulo="Ambiente atual">
            <Selo texto={ROTULO_AMBIENTE[config.ambienteNfe]} tom={config.ambienteNfe === 'PRODUCAO' ? 'bom' : 'atencao'} />
          </Dado>
          <Dado rotulo="Emissor">{emissor.simulado ? 'Simulado (EMISSOR_NFE=falso): nenhuma nota vai à SEFAZ' : 'Focus NFe'}</Dado>
          {!emissor.simulado && (
            <>
              <Dado rotulo="Token de homologação">{emissor.tokenHomologacao ? 'Configurado no servidor' : 'Falta no .env (FOCUS_TOKEN_HOMOLOGACAO)'}</Dado>
              <Dado rotulo="Token de produção">{emissor.tokenProducao ? 'Configurado no servidor' : 'Falta no .env (FOCUS_TOKEN_PRODUCAO)'}</Dado>
            </>
          )}
        </dl>
        <p className="text-sm text-texto-2">
          O certificado A1, a série e a numeração ficam no cadastro da empresa na Focus NFe (spec §8.1). Os tokens ficam só no .env do servidor.
        </p>
        {podeEditar && <FormularioAmbiente acao={salvarAmbienteAcao} atual={config.ambienteNfe} />}
      </section>

      <section aria-labelledby="titulo-regras" className="flex flex-col gap-2">
        <h2 id="titulo-regras" className="text-base font-bold">
          Regras fiscais
        </h2>
        <p className="text-sm text-texto-2">
          CFOP, CST/CSOSN e natureza de cada nota. Os valores sugeridos (spec §8.3) só valem depois de salvos, e o contador valida antes.
        </p>
        {!regime && <p className={ALERTA_ATENCAO}>Escolha o regime tributário nos dados da empresa: ele define se o ICMS usa CSOSN ou CST.</p>}
        <ul className="grid gap-3 md:grid-cols-2">
          {regras.map((r) => (
            <li key={`${r.tipoNota}-${r.operacao}`}>
              <Link href={`/configuracoes/fiscal/regras/${r.tipoNota}/${r.operacao}`} className={ITEM_LISTA}>
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{rotuloRegra(r.tipoNota, r.operacao)}</span>
                  <Selo texto={r.salva ? 'Salva' : 'Sugestão, ainda não salva'} tom={r.salva ? 'bom' : 'atencao'} />
                </span>
                <span className="font-mono text-[13px] text-texto-2">
                  CFOP {r.cfop} · ICMS {r.icmsSituacaoTributaria} · PIS {r.pisSituacaoTributaria} · COFINS {r.cofinsSituacaoTributaria}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
