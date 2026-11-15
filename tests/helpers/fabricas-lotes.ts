import { eq, inArray } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { itensDevolucao, lotes, produtos } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { salvarFornecedor, type DadosFornecedor } from '@/modules/catalogo/fornecedores';
import { salvarProduto } from '@/modules/catalogo/produtos';
import type { Canal } from '@/modules/devolucoes/dominio';
import type { StatusLote, TipoLote } from '@/modules/lotes/dominio';
import { criarDevolucaoNoEstoqueTeste, type DevolucaoNoEstoque, type UnidadeEstoqueTeste } from './fabricas-fiscal';

/**
 * Fábricas da Fase 5. Mesma regra das fábricas fiscais: nada de fila, armazenamento ou conector,
 * porque o e2e importa este arquivo.
 */

let sequencia = 0;

function digitoCnpj(base: string): string {
  const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const resto = [...base].reduce((soma, c, i) => soma + Number(c) * pesos[i], 0) % 11;
  return String(resto < 2 ? 0 : 11 - resto);
}

/** CNPJ válido e único por execução (o banco do e2e é o mesmo para o computador e o celular). */
export function cnpjDeTeste(): string {
  sequencia += 1;
  const base = `${String(Date.now() % 100_000_000).padStart(8, '0')}${String(sequencia % 10_000).padStart(4, '0')}`;
  const d1 = digitoCnpj(base);
  return `${base}${d1}${digitoCnpj(base + d1)}`;
}

/** Fornecedor com tudo o que a NF de remessa exige, em MG. */
export async function criarFornecedorCompletoTeste(
  db: DbOuTx,
  dados: Partial<DadosFornecedor> = {},
): Promise<{ id: string; cnpj: string; razaoSocial: string }> {
  sequencia += 1;
  const completo: DadosFornecedor = {
    razaoSocial: `Fornecedor Remessa ${sequencia} Ltda`,
    cnpj: cnpjDeTeste(),
    ie: '0623079040081',
    logradouro: 'Rua das Peças',
    numero: '200',
    complemento: null,
    bairro: 'Distrito Industrial',
    cidade: 'Contagem',
    uf: 'MG',
    cep: '32210000',
    contatoSac: 'SAC Teste',
    emailSac: 'sac@fornecedor.teste',
    ...dados,
  };
  const id = await salvarFornecedor(db, completo);
  return { id, cnpj: completo.cnpj, razaoSocial: completo.razaoSocial };
}

export async function criarProdutoDoFornecedorTeste(
  db: DbOuTx,
  p: { cnpjFornecedor: string | null; sku?: string; ncm?: string | null; custo?: string | null; ean?: string | null },
): Promise<{ id: string; sku: string }> {
  sequencia += 1;
  const sku = p.sku ?? `PRD-${Date.now().toString(36).toUpperCase()}-${sequencia}`;
  const id = await salvarProduto(db, {
    sku,
    ean: p.ean ?? null,
    descricao: 'Fone Bluetooth de teste',
    cnpjFornecedor: p.cnpjFornecedor,
    ncm: p.ncm === undefined ? '85183000' : p.ncm,
    custo: p.custo === undefined ? '35.90' : p.custo,
    unidade: 'UN',
  });
  return { id, sku };
}

export type UnidadeProblemaTeste = UnidadeEstoqueTeste & { produtoId?: string | null };

/** Devolução em AGUARDANDO_NF; as unidades com `produtoId` já trazem o produto recebido (e o esperado) gravado. */
export async function criarDevolucaoComProblemasTeste(
  db: DbOuTx,
  usuario: UsuarioSessao,
  p: { unidades: UnidadeProblemaTeste[]; canal?: Canal; pedido?: string },
): Promise<DevolucaoNoEstoque> {
  const idsProduto = [...new Set(p.unidades.flatMap((u) => (u.produtoId ? [u.produtoId] : [])))];
  const skuPorProduto = new Map<string, string>();
  if (idsProduto.length > 0) {
    const linhas = await db.select({ id: produtos.id, sku: produtos.sku }).from(produtos).where(inArray(produtos.id, idsProduto));
    for (const l of linhas) skuPorProduto.set(l.id, l.sku);
  }
  const unidades: UnidadeEstoqueTeste[] = p.unidades.map(({ produtoId, ...u }) => ({
    ...u,
    sku: u.sku ?? (produtoId ? skuPorProduto.get(produtoId) : undefined) ?? 'SKU-TESTE',
  }));
  const dev = await criarDevolucaoNoEstoqueTeste(db, usuario, {
    unidades,
    ...(p.canal ? { canal: p.canal } : {}),
    ...(p.pedido ? { pedido: p.pedido } : {}),
  });
  for (const [i, item] of dev.itens.entries()) {
    const produtoId = p.unidades[i].produtoId;
    if (!produtoId) continue;
    await db.update(itensDevolucao).set({ produtoRecebidoId: produtoId, produtoEsperadoId: produtoId }).where(eq(itensDevolucao.id, item.id));
  }
  return dev;
}

const STATUS_ITEM_DO_LOTE = {
  ABERTO: 'EM_LOTE',
  FECHADO: 'EM_LOTE',
  NF_EMITIDA: 'EM_LOTE',
  ENVIADO: 'ENVIADO',
  FINALIZADO: 'RESOLVIDO',
} as const;

/** Lote no status pedido, com as unidades dentro (o status do item acompanha o do lote). */
export async function criarLoteTeste(
  db: DbOuTx,
  p: { fornecedorId: string; status?: StatusLote; tipo?: TipoLote | null; itemIds?: string[]; rastreio?: string | null },
): Promise<{ id: string; codigo: string }> {
  const status = p.status ?? 'ABERTO';
  const agora = new Date();
  const adiante = status !== 'ABERTO';
  const [lote] = await db
    .insert(lotes)
    .values({
      fornecedorId: p.fornecedorId,
      status,
      tipo: p.tipo === undefined ? (adiante ? 'CONSERTO' : null) : p.tipo,
      rastreioEnvio: p.rastreio ?? null,
      fechadoEm: adiante ? agora : null,
      enviadoEm: status === 'ENVIADO' || status === 'FINALIZADO' ? agora : null,
      finalizadoEm: status === 'FINALIZADO' ? agora : null,
    })
    .returning({ id: lotes.id, codigo: lotes.codigo });
  if (p.itemIds && p.itemIds.length > 0) {
    const statusItem = STATUS_ITEM_DO_LOTE[status];
    await db
      .update(itensDevolucao)
      .set({ loteId: lote.id, status: statusItem, ...(statusItem === 'RESOLVIDO' ? { resultadoFornecedor: 'CONSERTADO' as const } : {}) })
      .where(inArray(itensDevolucao.id, p.itemIds));
  }
  return lote;
}
