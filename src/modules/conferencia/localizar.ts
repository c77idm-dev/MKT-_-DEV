import { desc, eq } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { devolucoes } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { rotuloStatus } from '@/modules/devolucoes/dominio';
import { normalizarRastreio } from '@/modules/devolucoes/rastreio';
import { ErroConferencia } from './erros';

/**
 * "Conferir pacote" (extra, decisão 13): acha a devolução pelo código DEV ou pelo rastreio da etiqueta.
 * Quem decide se pode conferir (trava, não identificada, sem unidades) é o iniciarConferencia.
 */
export async function localizarParaConferencia(db: DbOuTx, texto: string, usuario: UsuarioSessao): Promise<{ id: string; codigo: string }> {
  void usuario;
  const limpo = texto.trim();
  if (!limpo) throw new ErroConferencia('Leia ou digite o código de rastreamento ou o código DEV.');
  if (/^DEV-\d+$/i.test(limpo)) {
    const [d] = await db.select({ id: devolucoes.id, codigo: devolucoes.codigo }).from(devolucoes).where(eq(devolucoes.codigo, limpo.toUpperCase()));
    if (!d) throw new ErroConferencia(`Devolução ${limpo.toUpperCase()} não encontrada.`);
    return d;
  }
  const lista = await db
    .select({ id: devolucoes.id, codigo: devolucoes.codigo, status: devolucoes.status })
    .from(devolucoes)
    .where(eq(devolucoes.rastreio, normalizarRastreio(limpo)))
    .orderBy(desc(devolucoes.numero));
  if (lista.length === 0) throw new ErroConferencia('Nenhuma devolução com este código de rastreamento.');
  const abertas = lista.filter((d) => d.status === 'AGUARDANDO_CONFERENCIA' || d.status === 'EM_CONFERENCIA');
  if (abertas.length > 1) {
    throw new ErroConferencia(
      `Este rastreio tem ${abertas.length} devoluções (${abertas.map((d) => d.codigo).join(', ')}). Abra a que vai conferir pela lista da etapa.`,
    );
  }
  if (abertas.length === 1) return { id: abertas[0].id, codigo: abertas[0].codigo };
  const d = lista[0];
  const dica = d.status === 'PENDENTE_CHEGADA' ? ' Registre a chegada no Recebimento primeiro.' : '';
  throw new ErroConferencia(`${d.codigo} está ${rotuloStatus(d.status).toLowerCase()}.${dica}`);
}
