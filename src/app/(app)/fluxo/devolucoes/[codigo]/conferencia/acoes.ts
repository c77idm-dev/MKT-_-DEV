'use server';

import { revalidatePath } from 'next/cache';
import type { RespostaAcao } from '@/components/conferencia/tipos';
import { obterDb } from '@/db';
import { ehUuid } from '@/lib/uuid';
import { exigirPermissao } from '@/modules/auth/servidor';
import { concluirConferencia } from '@/modules/conferencia/concluir';
import { ErroConclusao } from '@/modules/conferencia/erros';
import { registrarEan, salvarItem, type ResultadoEan } from '@/modules/conferencia/itens';
import { DECISOES, type EntradaItem } from '@/modules/conferencia/regras';
import { desistirConferencia } from '@/modules/conferencia/trava';
import { MOTIVOS_ITEM, type MotivoItem } from '@/modules/devolucoes/dominio';
import { ErroDevolucao } from '@/modules/devolucoes/erros';

const CODIGO_VALIDO = /^DEV-\d+$/;
const NAO_ENCONTRADA = { ok: false as const, erros: ['Devolução não encontrada.'] };

/** O que vem do celular não é confiável: só textos e valores das listas. */
function entradaSegura(x: unknown): EntradaItem {
  const o = (typeof x === 'object' && x !== null ? x : {}) as Record<string, unknown>;
  const texto = (v: unknown) => (typeof v === 'string' ? v : '');
  const decisao = (DECISOES as readonly unknown[]).includes(o.decisao) ? (o.decisao as EntradaItem['decisao']) : null;
  const motivo = (MOTIVOS_ITEM as readonly unknown[]).includes(o.motivo) ? (o.motivo as MotivoItem) : null;
  return { serial: texto(o.serial), loteFabricacao: texto(o.loteFabricacao), validade: texto(o.validade), decisao, motivo, observacao: texto(o.observacao) };
}

async function comTratamento<T extends object>(f: () => Promise<RespostaAcao<T>>): Promise<RespostaAcao<T>> {
  try {
    return await f();
  } catch (erro) {
    if (erro instanceof ErroConclusao) return { ok: false, erros: erro.pendencias.map((p) => `Falta: ${p}`) };
    if (erro instanceof ErroDevolucao) return { ok: false, erros: [erro.message] };
    throw erro;
  }
}

export async function salvarItemAcao(devolucaoId: string, itemId: string, entrada: EntradaItem): Promise<RespostaAcao> {
  const usuario = await exigirPermissao('operar_devolucoes');
  if (!ehUuid(String(devolucaoId)) || !ehUuid(String(itemId))) return NAO_ENCONTRADA;
  return comTratamento(async () => {
    await salvarItem(obterDb(), devolucaoId, itemId, entradaSegura(entrada), usuario);
    return { ok: true };
  });
}

export async function registrarEanAcao(devolucaoId: string, itemId: string, lido: string | null): Promise<RespostaAcao<{ resultado: ResultadoEan }>> {
  const usuario = await exigirPermissao('operar_devolucoes');
  if (!ehUuid(String(devolucaoId)) || !ehUuid(String(itemId))) return NAO_ENCONTRADA;
  return comTratamento(async () => ({
    ok: true,
    resultado: await registrarEan(obterDb(), devolucaoId, itemId, typeof lido === 'string' ? lido : null, usuario),
  }));
}

/** Não redireciona: devolve o destino e a tela navega (a chamada vem de um botão, não de um formulário). */
export async function concluirAcao(devolucaoId: string, codigo: string): Promise<RespostaAcao<{ destino: string }>> {
  const usuario = await exigirPermissao('operar_devolucoes');
  if (!ehUuid(String(devolucaoId)) || !CODIGO_VALIDO.test(String(codigo))) return NAO_ENCONTRADA;
  return comTratamento(async () => {
    await concluirConferencia(obterDb(), devolucaoId, usuario);
    revalidatePath('/fluxo', 'layout');
    return { ok: true, destino: `/fluxo/devolucoes/${codigo}` };
  });
}

export async function desistirAcao(devolucaoId: string, codigo: string): Promise<RespostaAcao<{ destino: string }>> {
  const usuario = await exigirPermissao('operar_devolucoes');
  if (!ehUuid(String(devolucaoId)) || !CODIGO_VALIDO.test(String(codigo))) return NAO_ENCONTRADA;
  return comTratamento(async () => {
    await desistirConferencia(obterDb(), devolucaoId, usuario);
    revalidatePath('/fluxo', 'layout');
    return { ok: true, destino: `/fluxo/devolucoes/${codigo}` };
  });
}
