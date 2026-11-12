'use server';

import { redirect } from 'next/navigation';
import { obterDb } from '@/db';
import { exigirPermissao } from '@/modules/auth/servidor';
import { ErroCadastro } from '@/modules/catalogo/erros';
import { interpretarLinhaProduto, salvarProduto } from '@/modules/catalogo/produtos';

export type EstadoFormulario = { erros: string[] };

const CAMPOS = ['sku', 'ean', 'descricao', 'cnpj_fornecedor', 'ncm', 'custo', 'unidade'];

export async function salvarProdutoAcao(id: string | null, _anterior: EstadoFormulario, dados: FormData): Promise<EstadoFormulario> {
  await exigirPermissao('gerir_catalogo');
  const valores = Object.fromEntries(CAMPOS.map((c) => [c, String(dados.get(c) ?? '')]));
  const { dados: produto, erros } = interpretarLinhaProduto(valores);
  if (!produto) return { erros };
  try {
    await salvarProduto(obterDb(), produto, id ?? undefined);
  } catch (erro) {
    if (erro instanceof ErroCadastro) return { erros: [erro.message] };
    throw erro;
  }
  redirect(`/cadastros/produtos?salvo=${encodeURIComponent(produto.sku)}`);
}
