import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import type { Db, DbOuTx } from '@/db/client';
import { evidencias } from '@/db/schema';
import { mensagemDoErro } from '@/lib/log';
import { lerConfiguracao } from '@/modules/configuracoes/ler';
import { registrarEvento } from '@/modules/historico/eventos';
import { armazenamentoDoProvedor, provedorAtual } from '@/modules/midia/armazenamento';
import type { SituacaoProcessamento } from '@/modules/midia/dominio';
import { apagarTemporario } from '@/modules/midia/temporarios';

/** Spec §9 (decisões 7 e 8 da Fase 6). */
export const RODADA_RETENCAO = 50;
export const TEMPO_MAXIMO_RETENCAO_MS = 240_000;
export const DIAS_LINHAS_IMPORTACAO = 30;

/** Fora da retenção: APAGADA já foi; RECEBIDA e PROCESSANDO ainda estão em uso pelo processamento. (O SQL de devolucoesParaRetencao repete a lista.) */
const SITUACOES_APAGAVEIS_FORA: readonly SituacaoProcessamento[] = ['APAGADA', 'RECEBIDA', 'PROCESSANDO'];

/**
 * Devoluções CONCLUIDA há mais de `meses`, com mídia ainda não apagada, e sem pendência:
 * unidade PROBLEMA não resolvida, unidade em lote não FINALIZADO, contestação AGUARDANDO_GESTOR ou FALHOU.
 * `opcoes.id` restringe a uma devolução (nova conferência antes de apagar); `opcoes.excluir` tira as que já falharam.
 */
export async function devolucoesParaRetencao(
  db: DbOuTx,
  agora: Date,
  meses: number,
  limite: number,
  opcoes: { id?: string; excluir?: string[] } = {},
): Promise<string[]> {
  const filtroId = opcoes.id ? sql`and d.id = ${opcoes.id}::uuid` : sql``;
  const excluir = opcoes.excluir ?? [];
  const filtroExcluir = excluir.length > 0 ? sql`and d.id <> all(${sql`array[${sql.join(excluir.map((i) => sql`${i}`), sql`, `)}]::uuid[]`})` : sql``;
  const linhas = await db.execute<{ id: string }>(sql`
    select d.id from devolucoes d
    where d.status = 'CONCLUIDA'
      ${filtroId}
      ${filtroExcluir}
      and d.concluida_em < ${agora.toISOString()}::timestamptz - make_interval(months => ${meses})
      and exists (select 1 from evidencias e where e.devolucao_id = d.id and e.situacao_processamento not in ('APAGADA', 'RECEBIDA', 'PROCESSANDO'))
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

/**
 * Apaga arquivos (e temporários) das evidências da devolução; os hashes ficam. Devolve quantas evidências.
 * Confere a devolução de novo antes dos arquivos (a exclusão é irreversível e a seleção pode ter minutos).
 */
export async function apagarMidiasDaDevolucao(db: Db, devolucaoId: string, agora: Date, meses: number): Promise<number> {
  if ((await devolucoesParaRetencao(db, agora, meses, 1, { id: devolucaoId })).length === 0) return 0;
  const pendentes = (await db.select().from(evidencias).where(eq(evidencias.devolucaoId, devolucaoId))).filter(
    (e) => !SITUACOES_APAGAVEIS_FORA.includes(e.situacaoProcessamento),
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
      .where(and(inArray(evidencias.id, ids), notInArray(evidencias.situacaoProcessamento, [...SITUACOES_APAGAVEIS_FORA])))
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

/**
 * Uma devolução que falha não trava as outras: o id vai para a exclusão do laço, o erro é registrado
 * (sem dados pessoais) e, no fim, a tarefa lança para chegar a Falhas. O tempo é conferido antes de cada devolução.
 */
export async function aplicarRetencao(
  db: Db,
  opcoes: { agora: Date; rodada?: number; tempoMaximoMs?: number; relogio?: () => number },
): Promise<{ devolucoes: number; evidencias: number }> {
  const rodada = opcoes.rodada ?? RODADA_RETENCAO;
  const tempoMaximo = opcoes.tempoMaximoMs ?? TEMPO_MAXIMO_RETENCAO_MS;
  const relogio = opcoes.relogio ?? Date.now;
  const { mesesRetencaoMidia } = await lerConfiguracao(db);
  const inicio = relogio();
  const falhos = new Set<string>();
  let devolucoes = 0;
  let total = 0;
  let acabouOTempo = false;
  while (!acabouOTempo) {
    const ids = await devolucoesParaRetencao(db, opcoes.agora, mesesRetencaoMidia, rodada, { excluir: [...falhos] });
    if (ids.length === 0) break;
    for (const id of ids) {
      if (relogio() - inicio >= tempoMaximo) {
        acabouOTempo = true;
        break;
      }
      try {
        const n = await apagarMidiasDaDevolucao(db, id, opcoes.agora, mesesRetencaoMidia);
        if (n > 0) {
          devolucoes += 1;
          total += n;
        }
      } catch (erro) {
        falhos.add(id);
        console.error(JSON.stringify({ origem: 'worker', tarefa: 'midia.retencao', devolucao: id, mensagem: mensagemDoErro(erro) }));
      }
    }
  }
  if (falhos.size > 0) throw new Error(`Prazo de guarda: ${falhos.size} devolução(ões) não puderam ser limpas.`);
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
