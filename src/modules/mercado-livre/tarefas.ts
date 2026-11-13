import { ehRecusaDefinitiva, logErroML } from '@/conectores/marketplace/mercadolivre/erros';
import type { DadosDevolucaoML } from '@/conectores/marketplace/mercadolivre/tipos';
import type { DbOuTx } from '@/db/client';
import type { Fila } from '@/modules/fila/fila';
import { CONFIG_TAREFAS, type NomeTarefa } from '@/modules/fila/tarefas';
import { configML } from './config';
import { obterConectorML } from './conector';
import { ErroContaReconectar, marcarSincronizacao, obterContaML, renovarContasAVencer } from './contas';
import { fetchDoML } from './fabrica-conector';
import { chaveTarefaReclamacao, marcarNotificacoesProcessadas } from './notificacoes';
import { aplicarReclamacao, type ResultadoAplicacao } from './sincronizar';

/** Primeira varredura: 30 dias para trás; depois, desde a última menos 10 min (decisão 4 do plano). */
export const JANELA_INICIAL_MS = 30 * 24 * 60 * 60 * 1000;
export const SOBREPOSICAO_MS = 10 * 60 * 1000;

/** `tentativa` começa em 1 (Parte A); a última é a de número CONFIG_TAREFAS[nome].tentativas (spec §11: 5). */
export function ehUltimaTentativa(nome: NomeTarefa, tentativa: number): boolean {
  return tentativa >= CONFIG_TAREFAS[nome].tentativas;
}

/** Tarefa ml.sincronizar-reclamacao. Sem conta ATIVA, ou com recusa definitiva do ML, termina sem erro. */
export async function sincronizarReclamacao(db: DbOuTx, fila: Fila, reclamacaoId: string, agora: Date): Promise<ResultadoAplicacao | null> {
  const conector = await obterConectorML(db);
  if (!conector) return null;
  let dados: DadosDevolucaoML;
  try {
    dados = await conector.obterReclamacao(reclamacaoId);
  } catch (erro) {
    if (erro instanceof ErroContaReconectar) return null;
    if (!ehRecusaDefinitiva(erro)) throw erro;
    logErroML('sincronizar reclamação', erro, { reclamacaoId });
    await marcarNotificacoesProcessadas(db, reclamacaoId, agora);
    return null;
  }
  const resultado = await aplicarReclamacao(db, dados, agora, fila);
  await marcarNotificacoesProcessadas(db, reclamacaoId, agora);
  return resultado;
}

/** Tarefa ml.varredura (a cada 15 min, spec §7.2): só lista e enfileira; grava a última sincronização no fim. */
export async function varrerReclamacoes(db: DbOuTx, fila: Fila, agora: Date): Promise<{ enfileiradas: number } | null> {
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
  return renovarContasAVencer(db, { config, fetchFn: fetchDoML(config), agora });
}
