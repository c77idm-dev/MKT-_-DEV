'use server';

import { revalidatePath } from 'next/cache';
import { obterDb } from '@/db';
import { formatarDataHora } from '@/lib/formatar';
import { exigirPermissao } from '@/modules/auth/servidor';
import { rotuloStatus } from '@/modules/devolucoes/dominio';
import { ErroDevolucao } from '@/modules/devolucoes/erros';
import type { ResultadoRecebimento } from '@/modules/devolucoes/recebimento';
import { fichasDasDevolucoes, type FichaVenda } from '@/modules/mercado-livre/ficha-venda';
import { listarItensRetirada, type ItemRetiradaVista } from '@/modules/retiradas/consultas';
import { ErroRetirada } from '@/modules/retiradas/erros';
import {
  alterarQuantidade,
  biparProduto,
  concluirRetirada,
  darChegadaPelaEtiquetaAmarela,
  procurarPelaEtiquetaAmarela,
  removerItem,
} from '@/modules/retiradas/retiradas';
import { mensagemChegada } from '../../recebimento/mensagens';

export type ResultadoAcaoRetirada = { ok: true; itens: ItemRetiradaVista[]; pedirDescricao?: string } | { ok: false; mensagem: string };

/**
 * (extra, E27) Etiqueta amarela: a devolução do ML que vem no meio da retirada. `escolher`: a ficha da venda (ou a lista)
 * para "Dar chegada nesta devolução" (`lidaEm` remonta a ficha a cada busca, para a trava do toque duplo); `chegada`: a
 * chegada registrada (a devolução vai para a etapa 2, fora dos itens da retirada).
 */
export type ResultadoEtiquetaAmarela =
  | { tipo: 'escolher'; codigoLido: string; lidaEm: number; fichas: FichaVenda[] }
  | { tipo: 'chegada'; codigos: string[]; mensagem: string }
  | { tipo: 'aviso'; titulo: string; mensagem: string; codigos: string[] }
  | { tipo: 'erro'; mensagem: string };

const MENSAGEM_MUDOU = 'A situação desta devolução mudou agora. Procure o pedido de novo.';

async function respostaDaEtiqueta(db: ReturnType<typeof obterDb>, r: ResultadoRecebimento): Promise<ResultadoEtiquetaAmarela> {
  switch (r.tipo) {
    case 'escolher': {
      const fichas = await fichasDasDevolucoes(db, r.ids);
      if (fichas.length === 0) return { tipo: 'erro', mensagem: MENSAGEM_MUDOU };
      return { tipo: 'escolher', codigoLido: r.codigoLido, lidaEm: Date.now(), fichas };
    }
    case 'recebidas':
      revalidatePath('/fluxo');
      return { tipo: 'chegada', codigos: r.codigos, mensagem: mensagemChegada(r.codigos, r.doArmazemML ?? [], formatarDataHora(r.em)) };
    case 'ja_recebida':
      return {
        tipo: 'aviso',
        titulo: 'Este pacote já chegou',
        mensagem: `${r.codigo} já tinha chegado${r.recebidaEm ? ` em ${formatarDataHora(r.recebidaEm)}` : ''}. Status: ${rotuloStatus(r.status)}.`,
        codigos: [r.codigo],
      };
    case 'bloqueada':
      return {
        tipo: 'aviso',
        titulo: 'Fale com o Gestor',
        mensagem: `${r.codigo} está ${rotuloStatus(r.status).toLowerCase()}. Separe o pacote e avise o Gestor.`,
        codigos: [r.codigo],
      };
    case 'nao_encontrada':
      return { tipo: 'erro', mensagem: `Nenhuma devolução do ML com o pedido ${r.rastreio}. Confira o número na etiqueta amarela.` };
  }
}

async function naEtiqueta(fazer: (db: ReturnType<typeof obterDb>) => Promise<ResultadoRecebimento>): Promise<ResultadoEtiquetaAmarela> {
  const db = obterDb();
  try {
    return await respostaDaEtiqueta(db, await fazer(db));
  } catch (erro) {
    if (erro instanceof ErroRetirada || erro instanceof ErroDevolucao) return { tipo: 'erro', mensagem: erro.message };
    throw erro;
  }
}

/** (extra, E27) "Etiqueta amarela": procura o número do pedido impresso na etiqueta. Nada é registrado. */
export async function procurarEtiquetaAmarelaAcao(retiradaId: string, numero: string): Promise<ResultadoEtiquetaAmarela> {
  const usuario = await exigirPermissao('operar_devolucoes');
  return naEtiqueta((db) => procurarPelaEtiquetaAmarela(db, String(retiradaId), String(numero ?? ''), usuario));
}

/** (extra, E27) "Dar chegada nesta devolução": a chegada da devolução tocada, pela retirada. */
export async function darChegadaEtiquetaAmarelaAcao(retiradaId: string, devolucaoId: string, codigoLido: string): Promise<ResultadoEtiquetaAmarela> {
  const usuario = await exigirPermissao('operar_devolucoes');
  return naEtiqueta((db) =>
    darChegadaPelaEtiquetaAmarela(db, String(retiradaId), { devolucaoId: String(devolucaoId), codigoLido: String(codigoLido ?? '') }, usuario),
  );
}

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
