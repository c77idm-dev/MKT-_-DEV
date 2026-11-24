import { desc, eq } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { devolucoes } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { rotuloStatus, type StatusDevolucao } from '@/modules/devolucoes/dominio';
import { normalizarRastreio } from '@/modules/devolucoes/rastreio';
import { devolucoesDoPedidoML } from '@/modules/devolucoes/recebimento';
import { ErroConferencia } from './erros';

/**
 * O que o "Conferir pacote" achou: uma devolução (pelo código DEV ou pelo rastreio), que abre a conferência; ou (extra,
 * E27) as devoluções abertas de um pedido do ML, que a tela mostra na ficha da venda (ou na lista) para a pessoa tocar
 * em "Iniciar conferência".
 */
export type Localizada = { tipo: 'devolucao'; id: string; codigo: string } | { tipo: 'pedido'; codigoLido: string; ids: string[] };

/** Abertas para a conferência. */
const ABERTAS: StatusDevolucao[] = ['AGUARDANDO_CONFERENCIA', 'EM_CONFERENCIA'];

/** Esperam o pacote: a chegada vem antes, no Recebimento (a No CD também, desde a E25). */
const ESPERANDO_PACOTE: StatusDevolucao[] = ['PENDENTE_CHEGADA', 'NO_CD_MARKETPLACE'];

/** O rótulo do status no meio da frase: só a primeira letra em minúscula, para a sigla "CD" ficar. */
function statusNaFrase(status: StatusDevolucao): string {
  const rotulo = rotuloStatus(status);
  return rotulo.charAt(0).toLowerCase() + rotulo.slice(1);
}

/** Nenhuma aberta: diz como está a mais recente; (extra, E27) achada pelo pedido, diz isso também. */
function erroDaMaisRecente(d: { codigo: string; status: StatusDevolucao }, peloPedido = false): ErroConferencia {
  const dica = ESPERANDO_PACOTE.includes(d.status) ? ' Registre a chegada no Recebimento primeiro.' : '';
  const nota = peloPedido ? ' Achada pelo número do pedido do ML (extra).' : '';
  return new ErroConferencia(`${d.codigo} está ${statusNaFrase(d.status)}.${dica}${nota}`);
}

/**
 * "Conferir pacote" (extra, decisão 13): acha a devolução pelo código DEV ou pelo rastreio da etiqueta.
 * (extra, E27) Sem rastreio igual, o código só de dígitos é procurado como número do pedido do ML, pela mesma busca do
 * Recebimento (regra 2 da E25: só no canal ML, o número inteiro, e com 15 dígitos vale "2" + código). Pelo pedido a
 * conferência não abre sozinha: a resposta traz as devoluções abertas do pedido.
 * Quem decide se pode conferir (trava, não identificada, sem unidades) é o iniciarConferencia.
 */
export async function localizarParaConferencia(db: DbOuTx, texto: string, usuario: UsuarioSessao): Promise<Localizada> {
  void usuario;
  const limpo = texto.trim();
  if (!limpo) throw new ErroConferencia('Leia ou digite o código de rastreamento, o código DEV ou o número do pedido do ML (extra).');
  if (/^DEV-\d+$/i.test(limpo)) {
    const [d] = await db.select({ id: devolucoes.id, codigo: devolucoes.codigo }).from(devolucoes).where(eq(devolucoes.codigo, limpo.toUpperCase()));
    if (!d) throw new ErroConferencia(`Devolução ${limpo.toUpperCase()} não encontrada.`);
    return { tipo: 'devolucao', ...d };
  }
  const codigo = normalizarRastreio(limpo);
  const lista = await db
    .select({ id: devolucoes.id, codigo: devolucoes.codigo, status: devolucoes.status })
    .from(devolucoes)
    .where(eq(devolucoes.rastreio, codigo))
    .orderBy(desc(devolucoes.numero));
  if (lista.length === 0) {
    const doPedido = await devolucoesDoPedidoML(db, codigo);
    if (doPedido.length > 0) {
      const abertas = doPedido.filter((d) => ABERTAS.includes(d.status));
      if (abertas.length > 0) return { tipo: 'pedido', codigoLido: codigo, ids: abertas.map((d) => d.id) };
      throw erroDaMaisRecente(doPedido[doPedido.length - 1], true);
    }
    throw new ErroConferencia(
      'Nenhuma devolução com este código de rastreamento ou número do pedido do ML. Use o código DEV ou abra a devolução pela lista da etapa 2.',
    );
  }
  const abertas = lista.filter((d) => ABERTAS.includes(d.status));
  if (abertas.length > 1) {
    throw new ErroConferencia(
      `Este rastreio tem ${abertas.length} devoluções (${abertas.map((d) => d.codigo).join(', ')}). Abra a que vai conferir pela lista da etapa.`,
    );
  }
  if (abertas.length === 1) return { tipo: 'devolucao', id: abertas[0].id, codigo: abertas[0].codigo };
  throw erroDaMaisRecente(lista[0]);
}
