'use server';

import { revalidatePath } from 'next/cache';
import type { EstadoAcaoLote } from '@/components/lotes/tipos';
import { obterDb } from '@/db';
import { ehUuid } from '@/lib/uuid';
import { exigirPermissao } from '@/modules/auth/servidor';
import { ErroDevolucao } from '@/modules/devolucoes/erros';
import { ErroFiscal } from '@/modules/fiscal/erros';
import { associarProduto } from '@/modules/lotes/pendentes';

const SKU_MAXIMO = 60;

/** Spec §5.3: o Fiscal informa o produto que chegou de fato e a unidade entra no lote aberto do fornecedor dele. */
export async function acaoAssociarProduto(_anterior: EstadoAcaoLote, dados: FormData): Promise<EstadoAcaoLote> {
  const usuario = await exigirPermissao('gerir_fiscal');
  const item = String(dados.get('item') ?? '');
  const sku = String(dados.get('sku') ?? '').trim();
  if (!ehUuid(item)) return { erros: ['Unidade inválida.'], ok: null };
  if (!sku) return { erros: ['Informe o SKU do produto recebido.'], ok: null };
  if (sku.length > SKU_MAXIMO) return { erros: [`O SKU deve ter no máximo ${SKU_MAXIMO} caracteres.`], ok: null };
  try {
    const { loteCodigo, unidade, devolucaoCodigo } = await associarProduto(obterDb(), item, sku, usuario);
    revalidatePath('/lotes');
    revalidatePath('/lotes/sem-fornecedor');
    return { erros: [], ok: `Unidade ${unidade} da ${devolucaoCodigo} incluída no lote ${loteCodigo}.` };
  } catch (erro) {
    if (erro instanceof ErroFiscal || erro instanceof ErroDevolucao) return { erros: [erro.message], ok: null };
    throw erro;
  }
}
