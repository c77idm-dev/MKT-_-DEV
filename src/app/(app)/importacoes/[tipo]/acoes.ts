'use server';

import { revalidatePath } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
import { obterDb } from '@/db';
import { exigirPermissao } from '@/modules/auth/servidor';
import { obterDefinicao } from '@/modules/importacao/definicoes';
import { MENSAGEM_PLANILHA_GRANDE, TAMANHO_MAXIMO_BYTES } from '@/modules/importacao/limites';
import { ErroPlanilha, lerPlanilha } from '@/modules/importacao/planilha';
import {
  confirmarImportacao,
  definirMapeamento,
  ErroImportacao,
  obterImportacao,
  registrarUpload,
} from '@/modules/importacao/servico';

// `erros` (lista) para reaproveitar useEnvioFormulario: foco e rolagem até a mensagem, e os campos não são limpos.
export type EstadoUpload = { erros: string[] };
export type EstadoConfirmacao = { erros: string[] };

function definicaoOu404(tipo: string) {
  const def = obterDefinicao(tipo);
  if (!def) notFound();
  return def;
}

function mapeamentoDoFormulario(chaves: string[], dados: FormData): Record<string, string> {
  return Object.fromEntries(chaves.map((chave) => [chave, String(dados.get(`campo:${chave}`) ?? '')]));
}

export async function enviarPlanilhaAcao(tipo: string, _anterior: EstadoUpload, dados: FormData): Promise<EstadoUpload> {
  const def = definicaoOu404(tipo);
  const usuario = await exigirPermissao(def.acao);
  const arquivo = dados.get('arquivo');
  if (!(arquivo instanceof File) || arquivo.size === 0) return { erros: ['Escolha a planilha.'] };
  // Retaguarda: o formulário já confere no cliente (acima de ~6 MB o Next recusa o corpo antes da ação). Antes de ler o arquivo: um arquivo grande não deve ocupar memória só para ser recusado.
  if (arquivo.size > TAMANHO_MAXIMO_BYTES) return { erros: [MENSAGEM_PLANILHA_GRANDE] };
  let id: string;
  try {
    const planilha = await lerPlanilha(arquivo.name, await arquivo.arrayBuffer());
    id = await registrarUpload(obterDb(), { tipo: def.tipo, nomeArquivo: arquivo.name, planilha, usuarioId: usuario.id });
  } catch (erro) {
    if (erro instanceof ErroPlanilha) return { erros: [erro.message] };
    throw erro;
  }
  redirect(`/importacoes/${def.tipo}/${id}`);
}

export async function definirMapeamentoAcao(tipo: string, id: string, dados: FormData): Promise<void> {
  const def = definicaoOu404(tipo);
  await exigirPermissao(def.acao);
  const db = obterDb();
  const imp = await obterImportacao(db, id, def.tipo);
  if (!imp) notFound();
  try {
    await definirMapeamento(db, def, imp, mapeamentoDoFormulario(def.campos.map((c) => c.chave), dados));
  } catch (erro) {
    // Engolir é seguro: o único ErroImportacao aqui é "já concluída", e a página volta a mostrar o resumo.
    if (!(erro instanceof ErroImportacao)) throw erro;
  }
  revalidatePath(`/importacoes/${def.tipo}/${id}`);
}

export async function confirmarImportacaoAcao(
  tipo: string,
  id: string,
  _anterior: EstadoConfirmacao,
  dados: FormData,
): Promise<EstadoConfirmacao> {
  const def = definicaoOu404(tipo);
  const usuario = await exigirPermissao(def.acao);
  const db = obterDb();
  const imp = await obterImportacao(db, id, def.tipo);
  if (!imp) notFound();
  try {
    await confirmarImportacao(db, def, imp, mapeamentoDoFormulario(def.campos.map((c) => c.chave), dados), usuario);
  } catch (erro) {
    if (erro instanceof ErroImportacao) return { erros: [erro.message] };
    throw erro;
  }
  revalidatePath(`/importacoes/${def.tipo}/${id}`);
  return { erros: [] };
}
