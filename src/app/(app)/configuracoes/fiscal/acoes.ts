'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { obterDb } from '@/db';
import { textoDoForm } from '@/lib/formulario';
import { exigirPermissao } from '@/modules/auth/servidor';
import { lerConfiguracao } from '@/modules/configuracoes/ler';
import {
  CAMPOS_EMPRESA,
  salvarAmbiente,
  salvarDadosEmpresa,
  situacaoDoEmissor,
  validarDadosEmpresa,
  validarTrocaAmbiente,
  type EntradaEmpresa,
} from '@/modules/fiscal/configuracao';
import { ehOperacao, ehTipoNota } from '@/modules/fiscal/dominio';
import { ErroFiscal } from '@/modules/fiscal/erros';
import { salvarRegra, validarRegra } from '@/modules/fiscal/regras';

export type EstadoFormulario = { erros: string[] };

const PAGINA = '/configuracoes/fiscal';

export async function salvarEmpresaAcao(_anterior: EstadoFormulario, dados: FormData): Promise<EstadoFormulario> {
  const usuario = await exigirPermissao('administrar');
  const entrada = Object.fromEntries(CAMPOS_EMPRESA.map((campo) => [campo, textoDoForm(dados, campo)])) as EntradaEmpresa;
  const { dados: empresa, erros } = validarDadosEmpresa(entrada);
  if (!empresa) return { erros };
  try {
    await salvarDadosEmpresa(obterDb(), empresa, usuario);
  } catch (erro) {
    if (erro instanceof ErroFiscal) return { erros: [erro.message] };
    throw erro;
  }
  revalidatePath(PAGINA);
  redirect(`${PAGINA}?ok=empresa`);
}

export async function salvarAmbienteAcao(_anterior: EstadoFormulario, dados: FormData): Promise<EstadoFormulario> {
  const usuario = await exigirPermissao('administrar');
  const { ambiente, erros } = validarTrocaAmbiente({
    ambiente: textoDoForm(dados, 'ambiente'),
    confirmado: textoDoForm(dados, 'confirmacao') === 'sim',
    emissor: situacaoDoEmissor(),
  });
  if (!ambiente) return { erros };
  try {
    await salvarAmbiente(obterDb(), ambiente, usuario);
  } catch (erro) {
    if (erro instanceof ErroFiscal) return { erros: [erro.message] };
    throw erro;
  }
  revalidatePath(PAGINA);
  redirect(`${PAGINA}?ok=ambiente`);
}

/** `tipo` e `operacao` chegam ligados (bind) do cliente: são conferidos antes de qualquer uso. */
export async function salvarRegraAcao(tipo: string, operacao: string, _anterior: EstadoFormulario, dados: FormData): Promise<EstadoFormulario> {
  const usuario = await exigirPermissao('administrar');
  if (!ehTipoNota(tipo) || !ehOperacao(operacao)) return { erros: ['Regra fiscal desconhecida.'] };
  const db = obterDb();
  const regime = (await lerConfiguracao(db)).regimeTributario;
  if (!regime) return { erros: ['Escolha o regime tributário nos dados da empresa antes de salvar as regras.'] };
  const { dados: regra, erros } = validarRegra(
    tipo,
    operacao,
    {
      cfop: textoDoForm(dados, 'cfop'),
      icms: textoDoForm(dados, 'icms'),
      pis: textoDoForm(dados, 'pis'),
      cofins: textoDoForm(dados, 'cofins'),
      natureza: textoDoForm(dados, 'natureza'),
      informacoes: textoDoForm(dados, 'informacoes'),
    },
    regime,
  );
  if (!regra) return { erros };
  try {
    await salvarRegra(db, regra, usuario);
  } catch (erro) {
    if (erro instanceof ErroFiscal) return { erros: [erro.message] };
    throw erro;
  }
  revalidatePath(PAGINA);
  redirect(`${PAGINA}?ok=regra`);
}
