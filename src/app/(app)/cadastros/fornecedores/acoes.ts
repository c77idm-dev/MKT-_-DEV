'use server';

import { redirect } from 'next/navigation';
import { obterDb } from '@/db';
import { exigirPermissao } from '@/modules/auth/servidor';
import { ErroCadastro } from '@/modules/catalogo/erros';
import { interpretarLinhaFornecedor, salvarFornecedor } from '@/modules/catalogo/fornecedores';

export type EstadoFormulario = { erros: string[] };

const CAMPOS = ['razao_social', 'cnpj', 'ie', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf', 'cep', 'contato_sac', 'email_sac'];

export async function salvarFornecedorAcao(id: string | null, _anterior: EstadoFormulario, dados: FormData): Promise<EstadoFormulario> {
  await exigirPermissao('gerir_catalogo');
  const valores = Object.fromEntries(CAMPOS.map((c) => [c, String(dados.get(c) ?? '')]));
  const { dados: fornecedor, erros } = interpretarLinhaFornecedor(valores);
  if (!fornecedor) return { erros };
  try {
    await salvarFornecedor(obterDb(), fornecedor, id ?? undefined);
  } catch (erro) {
    if (erro instanceof ErroCadastro) return { erros: [erro.message] };
    throw erro;
  }
  redirect(`/cadastros/fornecedores?salvo=${encodeURIComponent(fornecedor.razaoSocial)}`);
}
