import { desc, eq } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { execucoesBackup } from '@/db/schema';
import { formatarDataHora } from '@/lib/formatar';
import { backupAtrasado } from './alertas-regras';
import type { SituacaoBackup } from './dominio';

export type ResumoBackup = {
  situacao: SituacaoBackup;
  iniciadoEm: Date;
  terminadoEm: Date | null;
  tamanhoBanco: number | null;
  erro: string | null;
};

/** A execução mais recente do backup diário (spec §10), ou null se nunca rodou. */
export async function ultimoBackup(db: DbOuTx): Promise<ResumoBackup | null> {
  const [linha] = await db
    .select({
      situacao: execucoesBackup.situacao,
      iniciadoEm: execucoesBackup.iniciadoEm,
      terminadoEm: execucoesBackup.terminadoEm,
      tamanhoBanco: execucoesBackup.tamanhoBanco,
      erro: execucoesBackup.erro,
    })
    .from(execucoesBackup)
    .orderBy(desc(execucoesBackup.iniciadoEm))
    .limit(1);
  return linha ?? null;
}

/** (extra, decisão 21) Sem backup OK em 26 h, só depois do primeiro registro de execução. */
export async function backupEstaAtrasado(db: DbOuTx, agora: Date): Promise<boolean> {
  const [ok] = await db
    .select({ iniciadoEm: execucoesBackup.iniciadoEm })
    .from(execucoesBackup)
    .where(eq(execucoesBackup.situacao, 'OK'))
    .orderBy(desc(execucoesBackup.iniciadoEm))
    .limit(1);
  const [alguma] = await db.select({ id: execucoesBackup.id }).from(execucoesBackup).limit(1);
  return backupAtrasado(ok?.iniciadoEm ?? null, alguma !== undefined, agora);
}

/** Uma execução "em andamento" há mais que isto foi interrompida (decisão 21). */
export const INTERROMPIDO_APOS_MS = 6 * 60 * 60 * 1000;

export type VistaBackup = { texto: string; tom: 'bom' | 'atencao' | 'erro'; erro: string | null };

function megabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

/** (extra, decisão 22) O que a tela Falhas mostra do último backup. Pura: a hora vem de fora. */
export function vistaDoBackup(b: ResumoBackup | null, agora: Date): VistaBackup | null {
  if (!b) return null;
  const quando = formatarDataHora(b.iniciadoEm);
  if (b.situacao === 'OK') {
    const tamanho = b.tamanhoBanco === null ? '' : ` (${megabytes(b.tamanhoBanco)})`;
    return { texto: `Último backup: ${quando}${tamanho}`, tom: 'bom', erro: null };
  }
  if (b.situacao === 'FALHOU') return { texto: `O último backup falhou em ${quando}.`, tom: 'erro', erro: b.erro };
  if (agora.getTime() - b.iniciadoEm.getTime() > INTERROMPIDO_APOS_MS) {
    return { texto: `Backup interrompido (começou em ${quando}).`, tom: 'erro', erro: null };
  }
  return { texto: `Backup em andamento desde ${quando.slice(-5)}.`, tom: 'atencao', erro: null };
}
