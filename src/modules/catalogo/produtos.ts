import { asc, count, eq, ilike, inArray, or } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { ehViolacaoDeUnicidade } from '@/db/erros';
import { fornecedores, produtos } from '@/db/schema';
import { FOI_INSERIDO, manterSeVazio } from '@/db/sql';
import { escaparLike } from '@/lib/texto';
import { ehUuid } from '@/lib/uuid';
import { interpretarValor, textoOpcional } from '@/lib/valores';
import { formatarCnpj, normalizarCnpj, normalizarEan, normalizarNcm, normalizarSku } from './documentos';
import { ErroCadastro } from './erros';
import { idsDosFornecedores } from './fornecedores';

export const POR_PAGINA_PRODUTOS = 50;
const LOTE = 500;

export type DadosProduto = {
  sku: string;
  ean: string | null;
  descricao: string;
  cnpjFornecedor: string | null;
  ncm: string | null;
  custo: string | null;
  unidade: string | null;
};

export type ProdutoLista = {
  id: string;
  sku: string;
  ean: string | null;
  descricao: string;
  custo: string | null;
  fornecedor: string | null;
};

const CUSTO_MAXIMO = 9999999999.99; // numeric(12,2)

/** Valida uma linha de produto com as chaves do modelo da spec §6.8 (sku, ean, descricao, cnpj_fornecedor, ncm, custo, unidade). */
export function interpretarLinhaProduto(v: Record<string, string>): { dados: DadosProduto | null; erros: string[] } {
  const erros: string[] = [];
  const sku = normalizarSku(v.sku ?? '');
  if (!sku) erros.push('Informe o SKU');
  else if (sku.length > 60) erros.push('SKU: no máximo 60 caracteres');
  const descricao = textoOpcional(v.descricao, 200, 'Descrição', erros);
  if ((v.descricao ?? '').trim() === '') erros.push('Informe a descrição');
  const eanTexto = (v.ean ?? '').trim();
  const ean = eanTexto ? normalizarEan(eanTexto) : null;
  if (eanTexto && !ean) erros.push(`EAN inválido: ${eanTexto}`);
  const cnpjTexto = (v.cnpj_fornecedor ?? '').trim();
  const cnpjFornecedor = cnpjTexto ? normalizarCnpj(cnpjTexto) : null;
  if (cnpjTexto && !cnpjFornecedor) erros.push(`CNPJ do fornecedor inválido: ${cnpjTexto}`);
  const ncmTexto = (v.ncm ?? '').trim();
  const ncm = ncmTexto ? normalizarNcm(ncmTexto) : null;
  if (ncmTexto && !ncm) erros.push(`NCM inválido (precisa ter 8 dígitos): ${ncmTexto}`);
  const custoTexto = (v.custo ?? '').trim();
  const custo = custoTexto ? interpretarValor(custoTexto) : null;
  if (custoTexto && !custo) erros.push(`Custo inválido: ${custoTexto}`);
  else if (custo && Number(custo) > CUSTO_MAXIMO) erros.push('Custo acima do máximo permitido (9.999.999.999,99)');
  const unidade = textoOpcional(v.unidade, 6, 'Unidade', erros)?.toUpperCase() ?? null;
  if (erros.length > 0 || !descricao) return { dados: null, erros };
  return { dados: { sku, ean, descricao, cnpjFornecedor, ncm, custo, unidade }, erros: [] };
}

async function idDoFornecedor(db: DbOuTx, cnpj: string | null): Promise<string | null> {
  if (!cnpj) return null;
  const id = (await idsDosFornecedores(db, [cnpj])).get(cnpj);
  if (!id) throw new ErroCadastro(`Fornecedor não cadastrado (CNPJ ${formatarCnpj(cnpj)})`);
  return id;
}

export async function salvarProduto(db: DbOuTx, dados: DadosProduto, id?: string): Promise<string> {
  if (id !== undefined && !ehUuid(id)) throw new ErroCadastro('Produto não encontrado');
  const fornecedorId = await idDoFornecedor(db, dados.cnpjFornecedor);
  const valores = {
    sku: dados.sku,
    ean: dados.ean,
    descricao: dados.descricao,
    fornecedorId,
    ncm: dados.ncm,
    custo: dados.custo,
    unidade: dados.unidade,
  };
  try {
    if (id) {
      const [atualizado] = await db
        .update(produtos)
        .set({ ...valores, atualizadoEm: new Date() })
        .where(eq(produtos.id, id))
        .returning({ id: produtos.id });
      if (!atualizado) throw new ErroCadastro('Produto não encontrado');
      return atualizado.id;
    }
    const [criado] = await db.insert(produtos).values(valores).returning({ id: produtos.id });
    return criado.id;
  } catch (erro) {
    if (ehViolacaoDeUnicidade(erro)) throw new ErroCadastro(`Já existe um produto com o SKU ${dados.sku}`);
    throw erro;
  }
}

/** Importação: atualiza pelo SKU (spec §6.8). Célula vazia mantém o valor atual. */
export async function upsertProdutos(db: DbOuTx, lista: DadosProduto[]): Promise<{ criados: number; atualizados: number }> {
  const cnpjs = [...new Set(lista.flatMap((p) => (p.cnpjFornecedor ? [p.cnpjFornecedor] : [])))];
  const ids = await idsDosFornecedores(db, cnpjs);
  const faltando = cnpjs.find((c) => !ids.has(c));
  if (faltando) throw new ErroCadastro(`Fornecedor não cadastrado (CNPJ ${formatarCnpj(faltando)})`);
  let criados = 0;
  let atualizados = 0;
  for (let i = 0; i < lista.length; i += LOTE) {
    const valores = lista.slice(i, i + LOTE).map((p) => ({
      sku: p.sku,
      ean: p.ean,
      descricao: p.descricao,
      fornecedorId: p.cnpjFornecedor ? (ids.get(p.cnpjFornecedor) ?? null) : null,
      ncm: p.ncm,
      custo: p.custo,
      unidade: p.unidade,
    }));
    const linhas = await db
      .insert(produtos)
      .values(valores)
      .onConflictDoUpdate({
        target: produtos.sku,
        set: {
          descricao: manterSeVazio('produtos', 'descricao'),
          ean: manterSeVazio('produtos', 'ean'),
          fornecedorId: manterSeVazio('produtos', 'fornecedor_id'),
          ncm: manterSeVazio('produtos', 'ncm'),
          custo: manterSeVazio('produtos', 'custo'),
          unidade: manterSeVazio('produtos', 'unidade'),
          atualizadoEm: new Date(),
        },
      })
      .returning({ inserido: FOI_INSERIDO });
    for (const l of linhas) {
      if (l.inserido) criados++;
      else atualizados++;
    }
  }
  return { criados, atualizados };
}

export async function listarProdutos(
  db: DbOuTx,
  opcoes: { busca?: string; pagina?: number } = {},
): Promise<{ linhas: ProdutoLista[]; total: number }> {
  const busca = (opcoes.busca ?? '').trim();
  const termo = `%${escaparLike(busca)}%`;
  const onde = busca ? or(ilike(produtos.sku, termo), ilike(produtos.descricao, termo), ilike(produtos.ean, termo)) : undefined;
  const pagina = Math.max(1, opcoes.pagina ?? 1);
  const [{ total }] = await db.select({ total: count() }).from(produtos).where(onde);
  const linhas = await db
    .select({
      id: produtos.id,
      sku: produtos.sku,
      ean: produtos.ean,
      descricao: produtos.descricao,
      custo: produtos.custo,
      fornecedor: fornecedores.razaoSocial,
    })
    .from(produtos)
    .leftJoin(fornecedores, eq(fornecedores.id, produtos.fornecedorId))
    .where(onde)
    .orderBy(asc(produtos.sku))
    .limit(POR_PAGINA_PRODUTOS)
    .offset((pagina - 1) * POR_PAGINA_PRODUTOS);
  return { linhas, total };
}

export async function obterProduto(db: DbOuTx, id: string): Promise<(DadosProduto & { id: string }) | null> {
  if (!ehUuid(id)) return null;
  const [p] = await db
    .select({
      id: produtos.id,
      sku: produtos.sku,
      ean: produtos.ean,
      descricao: produtos.descricao,
      cnpjFornecedor: fornecedores.cnpj,
      ncm: produtos.ncm,
      custo: produtos.custo,
      unidade: produtos.unidade,
    })
    .from(produtos)
    .leftJoin(fornecedores, eq(fornecedores.id, produtos.fornecedorId))
    .where(eq(produtos.id, id));
  return p ?? null;
}

export async function idsDosProdutos(db: DbOuTx, skus: string[]): Promise<Map<string, string>> {
  if (skus.length === 0) return new Map();
  const linhas = await db.select({ id: produtos.id, sku: produtos.sku }).from(produtos).where(inArray(produtos.sku, skus));
  return new Map(linhas.map((l) => [l.sku, l.id]));
}
