import type { Metadata } from 'next';
import Link from 'next/link';
import { MensagemSucesso } from '@/components/MensagemSucesso';
import { Selo } from '@/components/Selo';
import { ALERTA_ATENCAO, ALERTA_ERRO, CARTAO, LINK_VOLTAR, VAZIO } from '@/components/estilos';
import { Dado } from '@/components/mercado-livre/Dado';
import { obterDb } from '@/db';
import { formatarDataHora } from '@/lib/formatar';
import { primeiroValor } from '@/lib/parametros';
import { exigirPermissao } from '@/modules/auth/servidor';
import { ehErroConexao, MENSAGEM_ERRO_CONEXAO } from '@/modules/mercado-livre/conexao';
import { mensagemOkConexao } from '@/modules/mercado-livre/mensagem-ok';
import { listarSemEnvioFisico, resumoContaML } from '@/modules/mercado-livre/consultas';
import { ROTULO_SITUACAO_CONTA, rotuloStatusML } from '@/modules/mercado-livre/dominio';
import { BotaoConectar, BotaoDesconectar } from './AcoesConta';

export const metadata: Metadata = { title: 'Mercado Livre · Gestão de Devoluções' };

type Props = { searchParams: Promise<{ ok?: string | string[]; erro?: string | string[] }> };

/** Spec §6.8 e §7.1: conexão com o ML (Gestor). */
export default async function PaginaMercadoLivre({ searchParams }: Props) {
  await exigirPermissao('administrar');
  const parametros = await searchParams;
  const ok = mensagemOkConexao(primeiroValor(parametros.ok));
  const codigoErro = primeiroValor(parametros.erro);
  const erro = ehErroConexao(codigoErro) ? MENSAGEM_ERRO_CONEXAO[codigoErro] : null;
  const db = obterDb();
  const [resumo, semEnvio] = await Promise.all([resumoContaML(db), listarSemEnvioFisico(db)]);
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

      <section aria-labelledby="titulo-conta" className={`${CARTAO} flex flex-col gap-3`}>
        <h2 id="titulo-conta" className="text-base font-bold">
          Conta
        </h2>
        {resumo.modo === 'falso' && <p className={ALERTA_ATENCAO}>Modo de teste: o sistema usa um Mercado Livre falso (ML_CONECTOR=falso).</p>}
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
        {(!conta || conta.situacao === 'RECONECTAR') && <BotaoConectar rotulo={conta ? 'Conectar de novo' : 'Conectar conta do Mercado Livre'} />}
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
