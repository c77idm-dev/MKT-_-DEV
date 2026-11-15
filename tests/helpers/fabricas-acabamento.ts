import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { contestacoesCanal, devolucoes, execucoesBackup, falhasTarefas, itensDevolucao, notasFiscais } from '@/db/schema';
import type { SituacaoBackup, SituacaoFalha } from '@/modules/acabamento/dominio';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import type { NomeTarefa } from '@/modules/fila/tarefas';
import { criarDevolucaoNoEstoqueTeste, type DevolucaoNoEstoque, type UnidadeEstoqueTeste } from './fabricas-fiscal';

/** Fábricas da Fase 6. Sem fila, armazenamento ou conector (o e2e importa este arquivo). */

export async function criarFalhaTeste(
  db: DbOuTx,
  p: {
    tarefa?: NomeTarefa;
    dados?: Record<string, unknown>;
    situacao?: SituacaoFalha;
    erro?: string;
    ocorrencias?: number;
    ultimaFalhaEm?: Date;
    assinatura?: string;
  } = {},
): Promise<{ id: string }> {
  const ultima = p.ultimaFalhaEm ?? new Date();
  const [linha] = await db
    .insert(falhasTarefas)
    .values({
      tarefa: p.tarefa ?? 'nfe.emitir',
      dados: p.dados ?? { notaFiscalId: randomUUID() },
      assinatura: p.assinatura ?? randomUUID(),
      erro: p.erro ?? 'Falha de teste',
      tentativas: 5,
      ocorrencias: p.ocorrencias ?? 1,
      ultimoJobId: randomUUID(),
      primeiraFalhaEm: ultima,
      ultimaFalhaEm: ultima,
      situacao: p.situacao ?? 'ABERTA',
    })
    .returning({ id: falhasTarefas.id });
  return linha;
}

export async function criarExecucaoBackupTeste(
  db: DbOuTx,
  p: { situacao: SituacaoBackup; iniciadoEm: Date; terminadoEm?: Date | null; tamanhoBanco?: number | null; erro?: string | null },
): Promise<{ id: string }> {
  const [linha] = await db
    .insert(execucoesBackup)
    .values({
      situacao: p.situacao,
      iniciadoEm: p.iniciadoEm,
      terminadoEm: p.terminadoEm ?? null,
      tamanhoBanco: p.tamanhoBanco ?? null,
      erro: p.erro ?? null,
    })
    .returning({ id: execucoesBackup.id });
  return linha;
}

/** Devolução CONCLUIDA em `concluidaEm`; unidades BOM vão para DISPONIVEL_VENDA, as demais ficam como a fábrica fiscal deixou. */
export async function criarDevolucaoConcluidaTeste(
  db: DbOuTx,
  usuario: UsuarioSessao,
  p: { concluidaEm: Date; unidades?: UnidadeEstoqueTeste[] },
): Promise<DevolucaoNoEstoque> {
  const unidades = p.unidades ?? [{ destino: 'BOM' }];
  const dev = await criarDevolucaoNoEstoqueTeste(db, usuario, { unidades });
  for (const [i, item] of dev.itens.entries()) {
    if (unidades[i].destino === 'BOM') {
      await db.update(itensDevolucao).set({ status: 'DISPONIVEL_VENDA' }).where(eq(itensDevolucao.id, item.id));
    }
  }
  await db.update(devolucoes).set({ status: 'CONCLUIDA', concluidaEm: p.concluidaEm }).where(eq(devolucoes.id, dev.id));
  return dev;
}

export async function criarNotaRejeitadaTeste(
  db: DbOuTx,
  alvo: { devolucaoId: string } | { loteId: string },
): Promise<{ id: string }> {
  const [linha] = await db
    .insert(notasFiscais)
    .values({
      ...('devolucaoId' in alvo
        ? { devolucaoId: alvo.devolucaoId, tipo: 'DEVOLUCAO_VENDA' as const }
        : { loteId: alvo.loteId, tipo: 'REMESSA_CONSERTO' as const }),
      ambiente: 'HOMOLOGACAO',
      situacao: 'REJEITADA',
      motivoRejeicao: 'Rejeição 539: duplicidade (teste)',
      referenciaEmissor: randomUUID().replaceAll('-', ''),
    })
    .returning({ id: notasFiscais.id });
  return linha;
}

export async function criarContestacaoTeste(
  db: DbOuTx,
  devolucaoId: string,
  p: { status: 'AGUARDANDO_GESTOR' | 'ENVIADA' | 'FALHOU'; prazo: Date | null },
): Promise<{ id: string }> {
  const [linha] = await db
    .insert(contestacoesCanal)
    .values({ devolucaoId, motivoCanal: 'SRF2', mensagem: 'Teste', status: p.status, prazo: p.prazo })
    .returning({ id: contestacoesCanal.id });
  return linha;
}
