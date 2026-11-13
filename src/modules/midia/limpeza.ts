import { readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { and, eq, isNotNull, lt } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { evidencias, importacoes } from '@/db/schema';
import { pastaTus } from './temporarios';

const UM_DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Tarefa diária limpeza.temporarios (contrato §5.1, extra): apaga arquivos do tus com mais de 1 dia que nenhuma
 * evidência usa (upload abandonado, .json, saída de vídeo que sobrou) e as importações de planilha não confirmadas
 * há mais de 1 dia (Fase 1, decisão 13).
 */
export async function limparTemporarios(db: Db, opcoes: { agora: Date; pasta?: string }): Promise<{ arquivos: number; importacoes: number }> {
  const pasta = opcoes.pasta ?? pastaTus();
  const limite = opcoes.agora.getTime() - UM_DIA_MS;
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
  return { arquivos, importacoes: removidas.length };
}
