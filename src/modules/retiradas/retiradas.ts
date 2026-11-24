import { and, desc, eq, ne, sql } from 'drizzle-orm';
import type { Db, DbOuTx } from '@/db/client';
import { evidencias, itensRetiradaFull, produtos, retiradasFull } from '@/db/schema';
import { ehUuid } from '@/lib/uuid';
import { pode } from '@/modules/auth/permissoes';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { darChegadaPeloPedido, procurarPeloPedidoML, type ResultadoRecebimento } from '@/modules/devolucoes/recebimento';
import { registrarEvento } from '@/modules/historico/eventos';
import { armazenamentoDoProvedor } from '@/modules/midia/armazenamento';
import { apagarTemporario } from '@/modules/midia/temporarios';
import {
  decidirLeitura,
  normalizarEan,
  novaQuantidade,
  pendenciasParaConcluir,
  TAMANHO_EAN,
  TAMANHO_ETIQUETA,
  validarDescricao,
} from './dominio';
import { contarChegadasEtiquetaAmarela } from './consultas';
import { ErroRetirada } from './erros';

/** Spec §6.9: Operador e Gestor criam, conferem e concluem; o Fiscal só vê. */
function exigirOperador(usuario: UsuarioSessao): void {
  if (!pode(usuario.perfil, 'operar_devolucoes')) throw new ErroRetirada('Seu perfil não pode registrar retiradas do Full.');
}

function etiquetaOuErro(bruta: string): string {
  const etiqueta = bruta.replace(/\s+/g, '').toUpperCase();
  if (!etiqueta) throw new ErroRetirada('Leia ou digite o código da etiqueta.');
  if (etiqueta.length > TAMANHO_ETIQUETA) throw new ErroRetirada('Código da etiqueta longo demais.');
  return etiqueta;
}

/** Trava a retirada até o fim da transação e exige que ainda esteja Aberta. Devolve o código (RF-…). */
async function travarAberta(tx: DbOuTx, retiradaId: string, travar = true): Promise<string> {
  if (!ehUuid(retiradaId)) throw new ErroRetirada('Retirada não encontrada.');
  const consulta = tx.select({ situacao: retiradasFull.situacao, codigo: retiradasFull.codigo }).from(retiradasFull).where(eq(retiradasFull.id, retiradaId));
  const [r] = travar ? await consulta.for('update') : await consulta;
  if (!r) throw new ErroRetirada('Retirada não encontrada.');
  if (r.situacao !== 'ABERTA') throw new ErroRetirada('Esta retirada já foi conferida.');
  return r.codigo;
}

/**
 * (extra, emenda E27) Etiqueta amarela: no meio da retirada vem um pacote com a etiqueta amarela do ML, que é devolução,
 * não estoque. A pessoa digita o número do pedido impresso nela; a busca é a mesma do Recebimento pelo pedido (regra 2
 * da E25, só nas devoluções do ML) e nada é registrado.
 */
export async function procurarPelaEtiquetaAmarela(db: DbOuTx, retiradaId: string, numeroBruto: string, usuario: UsuarioSessao): Promise<ResultadoRecebimento> {
  exigirOperador(usuario);
  await travarAberta(db, retiradaId, false);
  return procurarPeloPedidoML(db, numeroBruto, usuario);
}

/**
 * (extra, emenda E27) "Dar chegada nesta devolução": registra a chegada da devolução escolhida como no Receber pacote
 * (Pendente de chegada ou No CD → Aguardando conferência, com as garantias da E25), e o histórico dela guarda o código
 * da retirada (`retiradaFull`). O produto não entra nos itens da retirada (não é estoque). A retirada fica travada na
 * transação e precisa estar Aberta.
 */
export async function darChegadaPelaEtiquetaAmarela(
  db: Db,
  retiradaId: string,
  p: { devolucaoId: string; codigoLido: string },
  usuario: UsuarioSessao,
  agora: Date = new Date(),
): Promise<ResultadoRecebimento> {
  exigirOperador(usuario);
  return db.transaction(async (tx) => {
    const codigo = await travarAberta(tx, retiradaId);
    return darChegadaPeloPedido(tx, { ...p, retiradaFull: codigo }, usuario, agora);
  });
}

/**
 * Abre uma retirada para a etiqueta lida. Se a mesma etiqueta já tem uma retirada Aberta (toque duplo, o botão do
 * Recebimento e o atalho), devolve essa em vez de criar outra.
 */
export async function criarRetirada(
  db: Db,
  codigoEtiquetaBruto: string,
  usuario: UsuarioSessao,
  agora: Date = new Date(),
): Promise<{ id: string; codigo: string; nova: boolean }> {
  exigirOperador(usuario);
  const etiqueta = etiquetaOuErro(codigoEtiquetaBruto);
  return db.transaction(async (tx) => {
    // Espaço 3 das travas por texto (1 = rastreio do Recebimento, 2 = gestão de usuários).
    await tx.execute(sql`select pg_advisory_xact_lock(3, hashtext(${etiqueta}))`);
    const [aberta] = await tx
      .select({ id: retiradasFull.id, codigo: retiradasFull.codigo })
      .from(retiradasFull)
      .where(and(eq(retiradasFull.codigoEtiqueta, etiqueta), eq(retiradasFull.situacao, 'ABERTA')))
      .orderBy(desc(retiradasFull.numero))
      .limit(1);
    if (aberta) return { ...aberta, nova: false };
    const [criada] = await tx
      .insert(retiradasFull)
      .values({ codigoEtiqueta: etiqueta, recebidaPor: usuario.id, recebidaEm: agora, criadoEm: agora })
      .returning({ id: retiradasFull.id, codigo: retiradasFull.codigo });
    await registrarEvento(tx, {
      entidade: 'retirada_full',
      entidadeId: criada.id,
      acao: 'retirada_full_criada',
      de: null,
      para: 'ABERTA',
      usuarioId: usuario.id,
      dados: { codigoEtiqueta: etiqueta },
      em: agora,
    });
    return { ...criada, nova: true };
  });
}

export type ResultadoBipe = { tipo: 'somado'; itemId: string } | { tipo: 'pedir_descricao'; ean: string };

/**
 * Bipar produto: o EAN do cadastro soma 1 no produto; fora do cadastro, soma no item "sem cadastro" do mesmo EAN ou,
 * na primeira vez, pede uma descrição curta (`descricao` null devolve `pedir_descricao`).
 */
export async function biparProduto(
  db: Db,
  retiradaId: string,
  eanBruto: string,
  descricao: string | null,
  usuario: UsuarioSessao,
): Promise<ResultadoBipe> {
  exigirOperador(usuario);
  const ean = normalizarEan(eanBruto);
  if (ean.length === 0 || ean.length > TAMANHO_EAN) throw new ErroRetirada('Leia ou digite o código de barras (até 50 caracteres).');
  return db.transaction(async (tx) => {
    await travarAberta(tx, retiradaId);
    // Pelo EAN sem zeros à esquerda (como na conferência); o primeiro achado, em ordem fixa, vence.
    const [produto] = /^\d+$/.test(ean)
      ? await tx
          .select({ id: produtos.id })
          .from(produtos)
          .where(sql`ltrim(${produtos.ean}, '0') = ltrim(${ean}, '0')`)
          .orderBy(produtos.sku)
          .limit(1)
      : [];
    const itens = await tx
      .select({ id: itensRetiradaFull.id, produtoId: itensRetiradaFull.produtoId, eanLido: itensRetiradaFull.eanLido, quantidade: itensRetiradaFull.quantidade })
      .from(itensRetiradaFull)
      .where(eq(itensRetiradaFull.retiradaId, retiradaId));
    const decisao = decidirLeitura(itens, ean, produto?.id ?? null);
    if (decisao.tipo === 'somar') {
      const atual = itens.find((i) => i.id === decisao.itemId)!;
      await mudarQuantidade(tx, retiradaId, decisao.itemId, atual.quantidade, novaQuantidade(atual.quantidade, 1), usuario);
      return { tipo: 'somado', itemId: decisao.itemId };
    }
    let texto: string | null = null;
    if (decisao.tipo === 'pedir_descricao') {
      if (descricao === null) return { tipo: 'pedir_descricao', ean };
      texto = validarDescricao(descricao);
      if (!texto) throw new ErroRetirada('Escreva uma descrição curta do produto (até 120 caracteres).');
    }
    const [novo] = await tx
      .insert(itensRetiradaFull)
      .values({ retiradaId, produtoId: decisao.tipo === 'novo_produto' ? decisao.produtoId : null, eanLido: ean, descricao: texto, quantidade: 1 })
      .returning({ id: itensRetiradaFull.id });
    await registrarEvento(tx, {
      entidade: 'retirada_full',
      entidadeId: retiradaId,
      acao: 'retirada_full_item_incluido',
      usuarioId: usuario.id,
      dados: { itemId: novo.id, produtoId: decisao.tipo === 'novo_produto' ? decisao.produtoId : null, ean, descricao: texto },
    });
    return { tipo: 'somado', itemId: novo.id };
  });
}

async function mudarQuantidade(tx: DbOuTx, retiradaId: string, itemId: string, de: number, para: number, usuario: UsuarioSessao): Promise<void> {
  if (de === para) return;
  await tx.update(itensRetiradaFull).set({ quantidade: para }).where(eq(itensRetiradaFull.id, itemId));
  await registrarEvento(tx, {
    entidade: 'retirada_full',
    entidadeId: retiradaId,
    acao: 'retirada_full_quantidade_alterada',
    de: String(de),
    para: String(para),
    usuarioId: usuario.id,
    dados: { itemId },
  });
}

async function itemDaRetirada(tx: DbOuTx, retiradaId: string, itemId: string) {
  if (!ehUuid(itemId)) throw new ErroRetirada('Item não encontrado nesta retirada.');
  const [item] = await tx
    .select({ id: itensRetiradaFull.id, quantidade: itensRetiradaFull.quantidade })
    .from(itensRetiradaFull)
    .where(and(eq(itensRetiradaFull.id, itemId), eq(itensRetiradaFull.retiradaId, retiradaId)));
  if (!item) throw new ErroRetirada('Item não encontrado nesta retirada.');
  return item;
}

/** "−" e "+" do item: a quantidade fica entre 1 e 9999 (para tirar o item, "Remover"). */
export async function alterarQuantidade(db: Db, retiradaId: string, itemId: string, delta: 1 | -1, usuario: UsuarioSessao): Promise<void> {
  exigirOperador(usuario);
  await db.transaction(async (tx) => {
    await travarAberta(tx, retiradaId);
    const item = await itemDaRetirada(tx, retiradaId, itemId);
    await mudarQuantidade(tx, retiradaId, itemId, item.quantidade, novaQuantidade(item.quantidade, delta), usuario);
  });
}

/** Tira o item; a foto dele sai junto (linha em cascata, arquivo apagado depois da transação). */
export async function removerItem(db: Db, retiradaId: string, itemId: string, usuario: UsuarioSessao): Promise<void> {
  exigirOperador(usuario);
  const arquivos = await db.transaction(async (tx) => {
    await travarAberta(tx, retiradaId);
    const item = await itemDaRetirada(tx, retiradaId, itemId);
    const fotos = await tx
      .select({ caminho: evidencias.caminho, provedor: evidencias.provedor, temporario: evidencias.caminhoTemporario })
      .from(evidencias)
      .where(eq(evidencias.itemRetiradaId, itemId));
    await tx.delete(itensRetiradaFull).where(eq(itensRetiradaFull.id, itemId));
    await registrarEvento(tx, {
      entidade: 'retirada_full',
      entidadeId: retiradaId,
      acao: 'retirada_full_item_removido',
      usuarioId: usuario.id,
      dados: { itemId, quantidade: item.quantidade },
    });
    return fotos;
  });
  for (const a of arquivos) {
    if (a.caminho && a.provedor) await armazenamentoDoProvedor(a.provedor).apagar(a.caminho).catch(() => undefined);
    if (a.temporario) await apagarTemporario(a.temporario);
  }
}

/**
 * "Concluir retirada": exige a foto da etiqueta (que não falhou no servidor) e pelo menos 1 item, ou (extra, E27) pelo
 * menos 1 chegada dada pela etiqueta amarela nesta retirada. Depois, só leitura.
 */
export async function concluirRetirada(db: Db, retiradaId: string, usuario: UsuarioSessao, agora: Date = new Date()): Promise<void> {
  exigirOperador(usuario);
  await db.transaction(async (tx) => {
    const codigo = await travarAberta(tx, retiradaId);
    const [foto] = await tx
      .select({ id: evidencias.id })
      .from(evidencias)
      .where(
        and(
          eq(evidencias.retiradaId, retiradaId),
          eq(evidencias.tipo, 'FOTO_1_ETIQUETA'),
          sql`${evidencias.itemRetiradaId} is null`,
          ne(evidencias.situacaoProcessamento, 'FALHOU'),
          ne(evidencias.situacaoProcessamento, 'APAGADA'),
        ),
      )
      .limit(1);
    const [{ total }] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(itensRetiradaFull)
      .where(eq(itensRetiradaFull.retiradaId, retiradaId));
    // A trava da retirada também segura "Dar chegada nesta devolução" (darChegadaPelaEtiquetaAmarela) até aqui.
    const chegadasEtiquetaAmarela = total > 0 ? 0 : await contarChegadasEtiquetaAmarela(tx, codigo);
    const faltas = pendenciasParaConcluir({ fotoEtiqueta: Boolean(foto), itens: total, chegadasEtiquetaAmarela });
    if (faltas.length > 0) throw new ErroRetirada(faltas.join(' '));
    await tx.update(retiradasFull).set({ situacao: 'CONFERIDA', concluidaEm: agora }).where(eq(retiradasFull.id, retiradaId));
    await registrarEvento(tx, {
      entidade: 'retirada_full',
      entidadeId: retiradaId,
      acao: 'retirada_full_concluida',
      de: 'ABERTA',
      para: 'CONFERIDA',
      usuarioId: usuario.id,
      em: agora,
    });
  });
}

/** Para a recepção das fotos (src/modules/midia/recepcao.ts): a retirada existe, está Aberta e o item é dela. */
export async function situacaoParaEnvio(
  db: DbOuTx,
  retiradaId: string,
  itemId: string | null,
): Promise<{ existe: boolean; aberta: boolean; itemDaRetirada: boolean }> {
  const [r] = await db.select({ situacao: retiradasFull.situacao }).from(retiradasFull).where(eq(retiradasFull.id, retiradaId));
  if (!r) return { existe: false, aberta: false, itemDaRetirada: false };
  const itens = itemId
    ? await db
        .select({ id: itensRetiradaFull.id })
        .from(itensRetiradaFull)
        .where(and(eq(itensRetiradaFull.id, itemId), eq(itensRetiradaFull.retiradaId, retiradaId)))
    : [];
  return { existe: true, aberta: r.situacao === 'ABERTA', itemDaRetirada: itens.length > 0 };
}
