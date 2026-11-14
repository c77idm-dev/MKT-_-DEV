import { readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { and, eq, inArray, isNotNull, lt, sql } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { evidencias, importacoes } from '@/db/schema';
import { idDoJob, SCHEMA_FILA } from '@/modules/fila/fila';
import type { NomeTarefa } from '@/modules/fila/tarefas';
import { registrarEvento } from '@/modules/historico/eventos';
import { pastaTus } from './temporarios';

const UM_DIA_MS = 24 * 60 * 60 * 1000;
const MENSAGEM_INTERROMPIDA = 'Processamento interrompido.';

function tarefaDaEvidencia(tipo: string): NomeTarefa {
  return tipo === 'VIDEO_PROVA' ? 'midia.transcodificar' : 'midia.processar-foto';
}

/**
 * Evidências em RECEBIDA/PROCESSANDO há mais de 1 dia sem job vivo no pg-boss: o worker morreu durante as tentativas
 * (falta de memória, kill no deploy) e ninguém marcaria FALHOU. Marca FALHOU + evento, na mesma transação.
 */
async function falharInterrompidas(db: Db, agora: Date, limite: Date, schemaFila: string): Promise<number> {
  if (!/^[a-z_][a-z0-9_]*$/.test(schemaFila)) throw new Error('Schema da fila inválido.');
  const candidatas = await db
    .select({ id: evidencias.id, tipo: evidencias.tipo, devolucaoId: evidencias.devolucaoId, itemId: evidencias.itemId })
    .from(evidencias)
    .where(and(inArray(evidencias.situacaoProcessamento, ['RECEBIDA', 'PROCESSANDO']), lt(evidencias.enviadoEm, limite)));
  if (candidatas.length === 0) return 0;

  const vivos = new Set<string>();
  const tabela = await db.execute<{ existe: string | null }>(sql`select to_regclass(${`${schemaFila}.job`}) as existe`);
  if (tabela[0]?.existe) {
    const ids = candidatas.map((c) => idDoJob(tarefaDaEvidencia(c.tipo), c.id));
    const achados = await db.execute<{ id: string }>(
      sql`select id from ${sql.raw(`"${schemaFila}"."job"`)} where id in (${sql.join(
        ids.map((i) => sql`${i}::uuid`),
        sql`, `,
      )}) and state in ('created', 'retry', 'active')`,
    );
    for (const a of achados) vivos.add(a.id);
  }

  let total = 0;
  for (const c of candidatas) {
    if (vivos.has(idDoJob(tarefaDaEvidencia(c.tipo), c.id))) continue;
    await db.transaction(async (tx) => {
      const [linha] = await tx
        .update(evidencias)
        .set({ situacaoProcessamento: 'FALHOU', erroProcessamento: MENSAGEM_INTERROMPIDA })
        .where(and(eq(evidencias.id, c.id), inArray(evidencias.situacaoProcessamento, ['RECEBIDA', 'PROCESSANDO'])))
        .returning({ id: evidencias.id });
      if (!linha) return;
      await registrarEvento(tx, {
        entidade: 'devolucao',
        entidadeId: c.devolucaoId,
        acao: 'evidencia_falhou',
        usuarioId: null,
        em: agora,
        dados: { evidenciaId: c.id, tipo: c.tipo, itemId: c.itemId, erro: MENSAGEM_INTERROMPIDA },
      });
      total += 1;
    });
  }
  return total;
}

/**
 * Tarefa diária limpeza.temporarios (contrato §5.1, extra): apaga arquivos do tus com mais de 1 dia que nenhuma
 * evidência usa (upload abandonado, .json, saída de vídeo que sobrou) e as importações de planilha não confirmadas
 * há mais de 1 dia (Fase 1, decisão 13). Também falha as evidências presas em processamento sem job vivo.
 */
export async function limparTemporarios(
  db: Db,
  opcoes: { agora: Date; pasta?: string; schemaFila?: string },
): Promise<{ arquivos: number; importacoes: number; interrompidas: number }> {
  const pasta = opcoes.pasta ?? pastaTus();
  const limite = opcoes.agora.getTime() - UM_DIA_MS;
  const interrompidas = await falharInterrompidas(db, opcoes.agora, new Date(limite), opcoes.schemaFila ?? SCHEMA_FILA);
  const emUso = new Set(
    (await db.select({ caminho: evidencias.caminhoTemporario }).from(evidencias).where(isNotNull(evidencias.caminhoTemporario))).map(
      (l) => l.caminho as string,
    ),
  );
  let arquivos = 0;
  const nomes = await readdir(pasta).catch(() => [] as string[]);
  for (const nome of nomes) {
    // "abc", "abc.json", "abc.saida.mp4" e "abc.saida.mp4.parcial" são todos do upload "abc".
    const upload = join(pasta, nome.split('.')[0]);
    if (emUso.has(upload)) continue;
    const caminho = join(pasta, nome);
    const info = await stat(caminho).catch(() => null);
    if (!info?.isFile() || info.mtimeMs >= limite) continue;
    await rm(caminho, { force: true });
    arquivos += 1;
  }
  const removidas = await db
    .delete(importacoes)
    .where(and(eq(importacoes.situacao, 'PENDENTE'), lt(importacoes.criadaEm, new Date(limite))))
    .returning({ id: importacoes.id });
  return { arquivos, importacoes: removidas.length, interrompidas };
}
