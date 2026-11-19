import type { Metadata } from 'next';
import Link from 'next/link';
import { MensagemSucesso } from '@/components/MensagemSucesso';
import { Selo } from '@/components/Selo';
import { ALERTA_ATENCAO, ALERTA_ERRO, CARTAO, LINK_VOLTAR, VAZIO } from '@/components/estilos';
import { Dado } from '@/components/mercado-livre/Dado';
import { logErroML } from '@/conectores/marketplace/mercadolivre/erros';
import { obterDb } from '@/db';
import { URL_BITBRAIN_FALSO } from '@/lib/env';
import { formatarDataHora } from '@/lib/formatar';
import { primeiroValor } from '@/lib/parametros';
import { exigirPermissao } from '@/modules/auth/servidor';
import { configML } from '@/modules/mercado-livre/config';
import { ehErroConexao, MENSAGEM_ERRO_CONEXAO } from '@/modules/mercado-livre/conexao';
import {
  buscarEAtualizarContas,
  contaAtrasada,
  listarContasBitbrain,
  mensagemFalhaBitbrain,
} from '@/modules/mercado-livre/contas-bitbrain';
import { mensagemOkConexao } from '@/modules/mercado-livre/mensagem-ok';
import { listarSemEnvioFisico, resumoContaML } from '@/modules/mercado-livre/consultas';
import { ROTULO_SITUACAO_CONTA, rotuloStatusML } from '@/modules/mercado-livre/dominio';
import { BotaoConectar, BotaoDesconectar } from './AcoesConta';
import { acaoContasBitbrain } from './acoes-bitbrain';
import { ContasBitbrain } from './ContasBitbrain';
import type { ContaVista } from './tipos-bitbrain';

export const metadata: Metadata = { title: 'Mercado Livre · Gestão de Devoluções' };

type Props = { searchParams: Promise<{ ok?: string | string[]; erro?: string | string[] }> };

/** Spec §6.8 e §7.1: conexão com o ML (Gestor). */
export default async function PaginaMercadoLivre({ searchParams }: Props) {
  await exigirPermissao('administrar');
  const parametros = await searchParams;
  const ok = mensagemOkConexao(primeiroValor(parametros.ok));
  const codigoErro = primeiroValor(parametros.erro);
  const erro = ehErroConexao(codigoErro) ? MENSAGEM_ERRO_CONEXAO[codigoErro] : null;
  const config = configML();
  const db = obterDb();
  const bitbrain = config.modo === 'bitbrain';
  let erroBitbrain: string | null = null;
  if (bitbrain) {
    // D13: a lista se atualiza ao abrir; se o Bitbrain falhar, a tela mostra a lista guardada e o motivo (sem o token).
    try {
      await buscarEAtualizarContas(db, config, new Date());
    } catch (falha) {
      logErroML('atualizar as contas do Bitbrain', falha);
      erroBitbrain = mensagemFalhaBitbrain(falha);
    }
  }
  const agora = new Date();
  const [resumo, semEnvio, contas] = await Promise.all([
    resumoContaML(db, config),
    listarSemEnvioFisico(db),
    bitbrain ? listarContasBitbrain(db) : Promise.resolve([]),
  ]);
  const contasVista: ContaVista[] = contas.map((c) => ({
    empresa: c.empresa,
    nome: c.nome,
    sellerId: c.sellerId,
    recebeDevolucoes: c.recebeDevolucoes,
    disponivel: c.disponivel,
    ultimaSincronizacao: c.ultimaSincronizacaoEm ? formatarDataHora(c.ultimaSincronizacaoEm) : null,
    atrasada: contaAtrasada(c, agora),
  }));
  const { conta } = resumo;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Link href="/configuracoes" className={LINK_VOLTAR}>
          ← Configurações
        </Link>
        <h1 className="text-xl font-bold">Mercado Livre</h1>
      </div>

      {ok && <MensagemSucesso texto={ok} />}
      {erro && (
        <p role="alert" className={ALERTA_ERRO}>
          {erro}
        </p>
      )}

      {bitbrain && (
        <section aria-labelledby="titulo-contas-bitbrain" className={`${CARTAO} flex flex-col gap-3`}>
          <h2 id="titulo-contas-bitbrain" className="text-base font-bold">
            Contas do Mercado Livre (pelo Bitbrain)
          </h2>
          <p className="text-sm text-texto-2">
            As devoluções do ML chegam pelo Bitbrain. Marque as contas que mandam devoluções para a bancada. As respostas ao ML (o
            &quot;OK&quot; e a contestação) são dadas à mão, em Contestações ML.
          </p>
          {config.bitbrainUrl === URL_BITBRAIN_FALSO && <p className={ALERTA_ATENCAO}>Modo de teste: o sistema usa um Bitbrain falso.</p>}
          {erroBitbrain && (
            <p role="alert" className={`${ALERTA_ERRO} [overflow-wrap:anywhere]`}>
              {erroBitbrain}
            </p>
          )}
          {resumo.faltas.length > 0 && <p className={ALERTA_ERRO}>Faltam no servidor: {resumo.faltas.join(', ')}.</p>}
          <ContasBitbrain contas={contasVista} acao={acaoContasBitbrain} />
        </section>
      )}

      {!bitbrain && (
        <>
          <section aria-labelledby="titulo-conta" className={`${CARTAO} flex flex-col gap-3`}>
            <h2 id="titulo-conta" className="text-base font-bold">
              Conta
            </h2>
            {resumo.modo === 'falso' && (
              <p className={ALERTA_ATENCAO}>Modo de teste: o sistema usa um Mercado Livre falso (ML_CONECTOR=falso).</p>
            )}
            {conta ? (
              <>
                <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                  <Dado rotulo="Vendedor (ID no ML)" mono>
                    {conta.sellerId}
                  </Dado>
                  <Dado rotulo="Situação">
                    <Selo texto={ROTULO_SITUACAO_CONTA[conta.situacao]} tom={conta.situacao === 'ATIVA' ? 'bom' : 'erro'} />
                  </Dado>
                  <Dado rotulo="Conectada em">
                    {formatarDataHora(conta.conectadaEm)}
                    {conta.conectadaPorNome ? ` por ${conta.conectadaPorNome}` : ''}
                  </Dado>
                  <Dado rotulo="Última sincronização">
                    {conta.ultimaSincronizacaoEm ? formatarDataHora(conta.ultimaSincronizacaoEm) : 'Ainda não sincronizou'}
                  </Dado>
                </dl>
                {conta.situacao === 'RECONECTAR' && (
                  <p role="alert" className={ALERTA_ERRO}>
                    O Mercado Livre recusou o acesso (senha trocada, autorização revogada ou 4 meses sem uso). Conecte de novo.
                  </p>
                )}
                {resumo.sincronizacaoAtrasada && <p className={ALERTA_ATENCAO}>Sincronização parada há mais de 1 hora.</p>}
              </>
            ) : (
              <p className="text-sm text-texto-2">Nenhuma conta conectada.</p>
            )}
            {resumo.faltas.length > 0 && <p className={ALERTA_ERRO}>Faltam no servidor: {resumo.faltas.join(', ')}.</p>}
            {(!conta || conta.situacao === 'RECONECTAR') && (
              <BotaoConectar rotulo={conta ? 'Conectar de novo' : 'Conectar conta do Mercado Livre'} />
            )}
            {conta && <BotaoDesconectar />}
          </section>

          <section aria-labelledby="titulo-app" className={`${CARTAO} flex flex-col gap-3`}>
            <h2 id="titulo-app" className="text-base font-bold">
              App no ML Developers <span className="text-sm font-normal text-texto-2">(extra)</span>
            </h2>
            <dl className="grid gap-3">
              <Dado rotulo="URL de retorno (redirect URI)" mono>
                {resumo.redirectUri || '—'}
              </Dado>
              <Dado rotulo="URL de notificações" mono>
                {resumo.urlNotificacoes ?? '—'}
              </Dado>
              <Dado rotulo="Tópico">post_purchase (claims e claims_actions)</Dado>
              <Dado rotulo="Permissões">Vendas e envios; Comunicação pré e pós-venda; Faturamento (leitura e escrita)</Dado>
            </dl>
          </section>
        </>
      )}

      <section aria-labelledby="titulo-sem-envio" className="flex flex-col gap-2">
        <h2 id="titulo-sem-envio" className="text-base font-bold">
          Devoluções sem envio físico (low_cost)
        </h2>
        <p className="text-sm text-texto-2">Só para consulta: o ML reembolsou sem o produto voltar, então não entram no fluxo.</p>
        {semEnvio.length === 0 ? (
          <p className={VAZIO}>Nenhuma devolução sem envio físico.</p>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {semEnvio.map((s) => (
              <li key={s.reclamacaoId} className={`${CARTAO} flex flex-col gap-1 p-3`}>
                <span className="break-all font-mono text-[13px] font-semibold">Reclamação {s.reclamacaoId}</span>
                <span className="break-all font-mono text-xs text-texto-2">Devolução {s.returnId ?? '—'}</span>
                <span className="text-sm">{rotuloStatusML(s.statusDevolucao)}</span>
                <span className="text-xs text-texto-2">Sincronizada em {formatarDataHora(s.sincronizadaEm)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
