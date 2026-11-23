import { and, eq } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { evidencias } from '@/db/schema';
import { ehUuid } from '@/lib/uuid';
import { linksDasEvidencias } from '@/modules/midia/links-evidencias';

/** "Baixar vídeo" do bloco "Responda no ML" (extra): o link temporário (10 min) do Vídeo de Prova pronto, ou null. */
export async function linkDoVideoDeProva(db: DbOuTx, devolucaoId: string): Promise<string | null> {
  if (!ehUuid(devolucaoId)) return null;
  const [video] = await db
    .select({ id: evidencias.id, situacao: evidencias.situacaoProcessamento, caminho: evidencias.caminho, provedor: evidencias.provedor })
    .from(evidencias)
    .where(and(eq(evidencias.devolucaoId, devolucaoId), eq(evidencias.tipo, 'VIDEO_PROVA')))
    .limit(1);
  if (!video) return null;
  return (await linksDasEvidencias([video])).get(video.id) ?? null;
}
