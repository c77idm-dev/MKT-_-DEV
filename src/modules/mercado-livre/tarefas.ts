import { ErroBitbrain } from '@/conectores/marketplace/bitbrain/cliente';
import { ehRecusaDefinitiva, logErroML } from '@/conectores/marketplace/mercadolivre/erros';
import type { DadosDevolucaoML } from '@/conectores/marketplace/mercadolivre/tipos';
import type { DbOuTx } from '@/db/client';
import type { Fila } from '@/modules/fila/fila';
import { CONFIG_TAREFAS, type NomeTarefa } from '@/modules/fila/tarefas';
import { configML } from './config';
import { obterConectorML } from './conector';
import { ErroContaReconectar, marcarSincronizacao, obterContaML, renovarContasAVencer } from './contas';
import { contasParaVarrer, marcarContaIndisponivel, marcarSincronizacaoBitbrain } from './contas-bitbrain';
import { contaDaReclamacao, fetchDoML } from './fabrica-conector';
import { garantirTextoMotivo } from './motivos';
import { chaveTarefaReclamacao, marcarNotificacoesProcessadas } from './notificacoes';
import { aplicarReclamacao, type ResultadoAplicacao } from './sincronizar';

/** Primeira varredura: 30 dias para trás; depois, desde a última menos 10 min (decisão 4 do plano). */
export const JANELA_INICIAL_MS = 30 * 24 * 60 * 60 * 1000;
export const SOBREPOSICAO_MS = 10 * 60 * 1000;

/** `tentativa` começa em 1 (Parte A); a última é a de número CONFIG_TAREFAS[nome].tentativas (spec §11: 5). */
export function ehUltimaTentativa(nome: NomeTarefa, tentativa: number): boolean {
  return tentativa >= CONFIG_TAREFAS[nome].tentativas;
}

/** Tarefa ml.sincronizar-reclamacao. No modo bitbrain, pela conta da tarefa ou da reclamação já gravada (§4.4); sem conta, nada. */
export async function sincronizarReclamacao(
  db: DbOuTx,
  fila: Fila,
  reclamacaoId: string,
  agora: Date,
  conta: string | null = null,
): Promise<ResultadoAplicacao | null> {
  const bitbrain = configML().modo === 'bitbrain';
  const contaUsada = bitbrain ? (conta ?? (await contaDaReclamacao(db, reclamacaoId))) : null;
  if (bitbrain && !contaUsada) return null;
  const conector = await obterConectorML(db, { conta: contaUsada });
  if (!conector) return null;
  let dados: DadosDevolucaoML;
  try {
    dados = await conector.obterReclamacao(reclamacaoId);
  } catch (erro) {
    if (erro instanceof ErroContaReconectar) return null;
    // D21: "empresa sem conta do ML" não melhora tentando de novo: a conta fica indisponível e o Gestor é avisado.
    if (erro instanceof ErroBitbrain && erro.motivo === 'empresa' && contaUsada) {
      logErroML('sincronizar reclamação', erro, { reclamacaoId });
      await marcarContaIndisponivel(db, contaUsada);
      return null;
    }
    if (!ehRecusaDefinitiva(erro)) throw erro;
    logErroML('sincronizar reclamação', erro, { reclamacaoId });
    await marcarNotificacoesProcessadas(db, reclamacaoId, agora);
    return null;
  }
  // Antes da transação: a consulta do texto do motivo não segura a trava nem derruba a sincronização se falhar.
  await garantirTextoMotivo(db, conector, dados.motivoId, agora);
  const resultado = await aplicarReclamacao(db, dados, agora, fila, contaUsada);
  await marcarNotificacoesProcessadas(db, reclamacaoId, agora);
  return resultado;
}

export type ResultadoVarreduraConta = { empresa: string; enfileiradas: number } | { empresa: string; erro: string };

/**
 * ml.varredura no modo bitbrain (§4.4, D6): conta por conta. A que falha vai para o log e não para as outras;
 * a "empresa sem conta do ML" fica indisponível; se nenhuma deu certo, lança (nova tentativa e depois Falhas).
 */
export async function varrerContasBitbrain(db: DbOuTx, fila: Fila, agora: Date): Promise<{ enfileiradas: number; contas: ResultadoVarreduraConta[] }> {
  const resultados: ResultadoVarreduraConta[] = [];
  let enfileiradas = 0;
  let falha: unknown = null;
  for (const conta of await contasParaVarrer(db)) {
    const conector = await obterConectorML(db, { conta: conta.empresa });
    if (!conector) continue;
    const desde = conta.ultimaSincronizacaoEm
      ? new Date(conta.ultimaSincronizacaoEm.getTime() - SOBREPOSICAO_MS)
      : new Date(agora.getTime() - JANELA_INICIAL_MS);
    try {
      let n = 0;
      for await (const r of conector.reclamacoesAtualizadasDesde(desde)) {
        await fila.enviar(
          'ml.sincronizar-reclamacao',
          { claimId: r.reclamacaoId, conta: conta.empresa },
          { chaveUnica: chaveTarefaReclamacao(r.reclamacaoId, agora) },
        );
        n += 1;
      }
      await marcarSincronizacaoBitbrain(db, conta.empresa, agora);
      enfileiradas += n;
      resultados.push({ empresa: conta.empresa, enfileiradas: n });
    } catch (erro) {
      logErroML('varredura da conta', erro, { empresa: conta.empresa });
      resultados.push({ empresa: conta.empresa, erro: erro instanceof Error ? erro.message : String(erro) });
      if (erro instanceof ErroBitbrain && erro.motivo === 'empresa') await marcarContaIndisponivel(db, conta.empresa);
      else falha ??= erro;
    }
  }
  if (falha && !resultados.some((r) => 'enfileiradas' in r)) throw falha;
  return { enfileiradas, contas: resultados };
}

/** "Sincronizar agora" (Configurações › Mercado Livre): a varredura entra na fila na hora (D12: sem chave única). */
export async function pedirSincronizacaoAgora(fila: Fila): Promise<void> {
  await fila.enviar('ml.varredura', {});
}

/** Tarefa ml.varredura (a cada 15 min, spec §7.2): só lista e enfileira; grava a última sincronização no fim. */
export async function varrerReclamacoes(db: DbOuTx, fila: Fila, agora: Date): Promise<{ enfileiradas: number; contas?: ResultadoVarreduraConta[] } | null> {
  if (configML().modo === 'bitbrain') return varrerContasBitbrain(db, fila, agora);
  const conta = await obterContaML(db);
  if (!conta || conta.situacao !== 'ATIVA') return null;
  const conector = await obterConectorML(db);
  if (!conector) return null;
  const desde = conta.ultimaSincronizacaoEm
    ? new Date(conta.ultimaSincronizacaoEm.getTime() - SOBREPOSICAO_MS)
    : new Date(agora.getTime() - JANELA_INICIAL_MS);
  let enfileiradas = 0;
  try {
    for await (const r of conector.reclamacoesAtualizadasDesde(desde)) {
      await fila.enviar('ml.sincronizar-reclamacao', { claimId: r.reclamacaoId }, { chaveUnica: chaveTarefaReclamacao(r.reclamacaoId, agora) });
      enfileiradas += 1;
    }
  } catch (erro) {
    if (erro instanceof ErroContaReconectar) return null;
    throw erro;
  }
  await marcarSincronizacao(db, conta.id, agora);
  return { enfileiradas };
}

/** Tarefa ml.renovar-token (a cada 5 h). */
export async function renovarTokensML(db: DbOuTx, agora: Date) {
  const config = configML();
  if (config.modo === 'bitbrain') return { renovadas: 0, reconectar: 0 };
  return renovarContasAVencer(db, { config, fetchFn: fetchDoML(config), agora });
}
