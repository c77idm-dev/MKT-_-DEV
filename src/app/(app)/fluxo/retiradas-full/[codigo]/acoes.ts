'use server';

import { revalidatePath } from 'next/cache';
import { obterDb } from '@/db';
import { exigirPermissao } from '@/modules/auth/servidor';
import { listarItensRetirada, type ItemRetiradaVista } from '@/modules/retiradas/consultas';
import { ErroRetirada } from '@/modules/retiradas/erros';
import { alterarQuantidade, biparProduto, concluirRetirada, removerItem } from '@/modules/retiradas/retiradas';

export type ResultadoAcaoRetirada = { ok: true; itens: ItemRetiradaVista[]; pedirDescricao?: string } | { ok: false; mensagem: string };

/** Toda ação da tela devolve a lista de itens atualizada (a tela não precisa recarregar a página). */
async function executar(retiradaId: string, fazer: (db: ReturnType<typeof obterDb>) => Promise<string | void>): Promise<ResultadoAcaoRetirada> {
  const db = obterDb();
  try {
    const pedirDescricao = await fazer(db);
    const itens = await listarItensRetirada(db, String(retiradaId));
    return pedirDescricao ? { ok: true, itens, pedirDescricao } : { ok: true, itens };
  } catch (erro) {
    if (erro instanceof ErroRetirada) return { ok: false, mensagem: erro.message };
    throw erro;
  }
}

export async function biparAcao(retiradaId: string, ean: string, descricao: string | null): Promise<ResultadoAcaoRetirada> {
  const usuario = await exigirPermissao('operar_devolucoes');
  return executar(retiradaId, async (db) => {
    const r = await biparProduto(db, String(retiradaId), String(ean ?? ''), descricao === null ? null : String(descricao), usuario);
    return r.tipo === 'pedir_descricao' ? r.ean : undefined;
  });
}

export async function quantidadeAcao(retiradaId: string, itemId: string, delta: 1 | -1): Promise<ResultadoAcaoRetirada> {
  const usuario = await exigirPermissao('operar_devolucoes');
  return executar(retiradaId, (db) => alterarQuantidade(db, String(retiradaId), String(itemId), Number(delta) === 1 ? 1 : -1, usuario));
}

export async function removerAcao(retiradaId: string, itemId: string): Promise<ResultadoAcaoRetirada> {
  const usuario = await exigirPermissao('operar_devolucoes');
  return executar(retiradaId, (db) => removerItem(db, String(retiradaId), String(itemId), usuario));
}

export async function concluirAcao(retiradaId: string): Promise<ResultadoAcaoRetirada> {
  const usuario = await exigirPermissao('operar_devolucoes');
  const r = await executar(retiradaId, (db) => concluirRetirada(db, String(retiradaId), usuario));
  if (r.ok) revalidatePath('/fluxo/retiradas-full', 'layout');
  return r;
}
