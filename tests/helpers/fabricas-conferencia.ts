import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { devolucoes, evidencias, itensDevolucao } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import type { DadosNovaDevolucao, DevolucaoCriada } from '@/modules/devolucoes/criar';
import type { SituacaoProcessamento, TipoEvidencia } from '@/modules/midia/dominio';
import { criarDevolucaoTeste } from './fabricas';

/** Devolução que já chegou: "Aguardando conferência" (sem o evento de recebimento). */
export async function criarDevolucaoChegada(
  db: DbOuTx,
  usuario: UsuarioSessao,
  dados: Partial<DadosNovaDevolucao> = {},
): Promise<DevolucaoCriada> {
  const criada = await criarDevolucaoTeste(db, usuario, dados);
  await db
    .update(devolucoes)
    .set({ status: 'AGUARDANDO_CONFERENCIA', recebidaEm: new Date(), recebidaPor: usuario.id })
    .where(eq(devolucoes.id, criada.id));
  return criada;
}

/** Devolução em conferência, travada com `usuario`. `itens` vem na ordem das unidades. */
export async function criarDevolucaoEmConferencia(
  db: DbOuTx,
  usuario: UsuarioSessao,
  dados: Partial<DadosNovaDevolucao> = {},
): Promise<DevolucaoCriada & { itens: string[] }> {
  const criada = await criarDevolucaoChegada(db, usuario, dados);
  await db
    .update(devolucoes)
    .set({ status: 'EM_CONFERENCIA', conferenteId: usuario.id, conferenciaIniciadaEm: new Date() })
    .where(eq(devolucoes.id, criada.id));
  const itens = await db
    .select({ id: itensDevolucao.id })
    .from(itensDevolucao)
    .where(eq(itensDevolucao.devolucaoId, criada.id))
    .orderBy(asc(itensDevolucao.unidade));
  return { ...criada, itens: itens.map((i) => i.id) };
}

export async function criarEvidenciaTeste(
  db: DbOuTx,
  p: {
    devolucaoId: string;
    tipo: TipoEvidencia;
    itemId?: string | null;
    situacao?: SituacaoProcessamento;
    caminho?: string | null;
    caminhoTemporario?: string | null;
    provedor?: string | null;
    usuarioId?: string | null;
    sha256Original?: string;
  },
): Promise<string> {
  const [linha] = await db
    .insert(evidencias)
    .values({
      devolucaoId: p.devolucaoId,
      itemId: p.itemId ?? null,
      tipo: p.tipo,
      tipoConteudo: p.tipo === 'VIDEO_PROVA' ? 'video/mp4' : 'image/jpeg',
      caminho: p.caminho ?? null,
      caminhoTemporario: p.caminhoTemporario ?? null,
      provedor: p.provedor ?? null,
      tamanhoOriginal: 1000,
      sha256Original: p.sha256Original ?? 'a'.repeat(64),
      situacaoProcessamento: p.situacao ?? 'RECEBIDA',
      idCliente: randomUUID(),
      enviadoPor: p.usuarioId ?? null,
    })
    .returning({ id: evidencias.id });
  return linha.id;
}

/** Fotos 1 e 2, Vídeo de Prova e as Fotos 3 e 4 de cada unidade dada. */
export async function criarEvidenciasCompletas(db: DbOuTx, devolucaoId: string, itens: string[]): Promise<void> {
  for (const tipo of ['FOTO_1_ETIQUETA', 'FOTO_2_EMBALAGEM', 'VIDEO_PROVA'] as const) await criarEvidenciaTeste(db, { devolucaoId, tipo });
  for (const itemId of itens) {
    await criarEvidenciaTeste(db, { devolucaoId, tipo: 'FOTO_3_PRODUTO', itemId });
    await criarEvidenciaTeste(db, { devolucaoId, tipo: 'FOTO_4_CODIGO_SERIAL', itemId });
  }
}
