import { eq, inArray, sql } from 'drizzle-orm';
import type { Db, DbOuTx } from '@/db/client';
import { evidencias } from '@/db/schema';
import { lerConfiguracao } from '@/modules/configuracoes/ler';
import { registrarEvento } from '@/modules/historico/eventos';
import { armazenamentoDoProvedor, provedorAtual } from '@/modules/midia/armazenamento';
import { apagarTemporario } from '@/modules/midia/temporarios';

/** Spec §9 (decisões 7 e 8 da Fase 6). */
export const RODADA_RETENCAO = 50;
export const TEMPO_MAXIMO_RETENCAO_MS = 240_000;
export const DIAS_LINHAS_IMPORTACAO = 30;

/**
 * Devoluções CONCLUIDA há mais de `meses`, com mídia ainda não apagada, e sem pendência:
 * unidade PROBLEMA não resolvida, unidade em lote não FINALIZADO, contestação AGUARDANDO_GESTOR ou FALHOU.
 */
export async function devolucoesParaRetencao(db: DbOuTx, agora: Date, meses: number, limite: number): Promise<string[]> {
  const linhas = await db.execute<{ id: string }>(sql`
    select d.id from devolucoes d
    where d.status = 'CONCLUIDA'
      and d.concluida_em < ${agora.toISOString()}::timestamptz - make_interval(months => ${meses})
      and exists (select 1 from evidencias e where e.devolucao_id = d.id and e.situacao_processamento <> 'APAGADA')
      and not exists (select 1 from itens_devolucao i where i.devolucao_id = d.id and i.destino = 'PROBLEMA' and i.status <> 'RESOLVIDO')
      and not exists (
        select 1 from itens_devolucao i join lotes l on l.id = i.lote_id
        where i.devolucao_id = d.id and l.status <> 'FINALIZADO'
      )
      and not exists (select 1 from contestacoes_canal c where c.devolucao_id = d.id and c.status in ('AGUARDANDO_GESTOR', 'FALHOU'))
    order by d.concluida_em asc
    limit ${limite}
  `);
  return Array.from(linhas, (l) => l.id);
}

/** Apaga arquivos (e temporários) das evidências da devolução; os hashes ficam. Devolve quantas evidências. */
export async function apagarMidiasDaDevolucao(db: Db, devolucaoId: string, agora: Date): Promise<number> {
  const pendentes = (await db.select().from(evidencias).where(eq(evidencias.devolucaoId, devolucaoId))).filter(
    (e) => e.situacaoProcessamento !== 'APAGADA',
  );
  if (pendentes.length === 0) return 0;
  for (const e of pendentes) {
    // apagar() é idempotente nos três provedores: arquivo que já sumiu não é erro.
    if (e.caminho) await armazenamentoDoProvedor(e.provedor ?? provedorAtual()).apagar(e.caminho);
    if (e.caminhoTemporario) await apagarTemporario(e.caminhoTemporario);
  }
  const ids = pendentes.map((e) => e.id);
  return db.transaction(async (tx) => {
    const feitas = await tx
      .update(evidencias)
      .set({ situacaoProcessamento: 'APAGADA', caminho: null, caminhoTemporario: null })
      .where(inArray(evidencias.id, ids))
      .returning({ id: evidencias.id });
    await registrarEvento(tx, {
      entidade: 'devolucao',
      entidadeId: devolucaoId,
      acao: 'midia_apagada_retencao',
      usuarioId: null,
      dados: { evidencias: feitas.length },
      em: agora,
    });
    return feitas.length;
  });
}

export async function aplicarRetencao(
  db: Db,
  opcoes: { agora: Date; rodada?: number; tempoMaximoMs?: number; relogio?: () => number },
): Promise<{ devolucoes: number; evidencias: number }> {
  const rodada = opcoes.rodada ?? RODADA_RETENCAO;
  const tempoMaximo = opcoes.tempoMaximoMs ?? TEMPO_MAXIMO_RETENCAO_MS;
  const relogio = opcoes.relogio ?? Date.now;
  const { mesesRetencaoMidia } = await lerConfiguracao(db);
  const inicio = relogio();
  let devolucoes = 0;
  let total = 0;
  for (;;) {
    const ids = await devolucoesParaRetencao(db, opcoes.agora, mesesRetencaoMidia, rodada);
    if (ids.length === 0) break;
    for (const id of ids) {
      const n = await apagarMidiasDaDevolucao(db, id, opcoes.agora);
      if (n > 0) {
        devolucoes += 1;
        total += n;
      }
    }
    if (relogio() - inicio >= tempoMaximo) break;
  }
  return { devolucoes, evidencias: total };
}

/** LGPD (decisão 8): as linhas da planilha concluída há mais de 30 dias saem; o resumo fica. */
export async function limparLinhasImportacoes(db: DbOuTx, agora: Date): Promise<number> {
  const feitas = await db.execute(sql`
    update importacoes set linhas = '[]'::jsonb
    where situacao = 'CONCLUIDA'
      and concluida_em < ${agora.toISOString()}::timestamptz - make_interval(days => ${DIAS_LINHAS_IMPORTACAO})
      and jsonb_array_length(linhas) > 0
    returning id
  `);
  return feitas.length;
}
