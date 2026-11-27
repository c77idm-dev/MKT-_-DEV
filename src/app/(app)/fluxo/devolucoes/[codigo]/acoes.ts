'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { obterDb } from '@/db';
import { textoDoForm } from '@/lib/formulario';
import { exigirPermissao } from '@/modules/auth/servidor';
import { normalizarSku } from '@/modules/catalogo/documentos';
import { idsDosProdutos } from '@/modules/catalogo/produtos';
import { AVISO_NADA_MUDOU, chaveDoAviso } from '@/modules/devolucoes/avisos-correcao';
import {
  apagarDevolucao,
  corrigirDados,
  desfazerChegada,
  reabrirConferencia,
  trocarDestinoItem,
  type CamposCorrigiveis,
  type ResultadoCorrecao,
} from '@/modules/devolucoes/correcoes';
import { itensDoFormulario } from '@/modules/devolucoes/criar';
import { MOTIVOS_ITEM, type MotivoItem } from '@/modules/devolucoes/dominio';
import { ErroDevolucao } from '@/modules/devolucoes/erros';
import { encerrarPendente, identificarDevolucao } from '@/modules/devolucoes/excecoes';

export type EstadoAcaoGestor = { erros: string[] };

/** O `codigo` chega ligado (bind) do cliente: confere o formato antes de usá-lo como caminho em revalidatePath. */
const CODIGO_VALIDO = /^DEV-\d+$/;
const NAO_ENCONTRADA: EstadoAcaoGestor = { erros: ['Devolução não encontrada.'] };

export async function encerrarAcao(id: string, codigo: string, _anterior: EstadoAcaoGestor, dados: FormData): Promise<EstadoAcaoGestor> {
  const usuario = await exigirPermissao('administrar');
  if (!CODIGO_VALIDO.test(codigo)) return NAO_ENCONTRADA;
  const para = textoDoForm(dados, 'para');
  if (para !== 'CANCELADA' && para !== 'EXTRAVIADA') return { erros: ['Escolha o novo status.'] };
  try {
    await encerrarPendente(obterDb(), id, para, textoDoForm(dados, 'motivo'), usuario);
  } catch (erro) {
    if (erro instanceof ErroDevolucao) return { erros: [erro.message] };
    throw erro;
  }
  // (extra, E29) Antes da NF a devolução sai das etapas 2 a 4: o quadro também muda.
  revalidatePath('/fluxo', 'layout');
  // Os formulários somem depois do sucesso: a página mostra a confirmação (?ok=) e o foco não cai no <body>.
  redirect(`/fluxo/devolucoes/${codigo}?ok=${para === 'CANCELADA' ? 'cancelada' : 'extraviada'}`);
}

export async function identificarAcao(id: string, codigo: string, _anterior: EstadoAcaoGestor, dados: FormData): Promise<EstadoAcaoGestor> {
  const usuario = await exigirPermissao('administrar');
  if (!CODIGO_VALIDO.test(codigo)) return NAO_ENCONTRADA;
  try {
    await identificarDevolucao(
      obterDb(),
      id,
      {
        canal: textoDoForm(dados, 'canal'),
        pedido: textoDoForm(dados, 'pedido'),
        reclamacaoId: textoDoForm(dados, 'reclamacao'),
        transportadora: textoDoForm(dados, 'transportadora'),
        itens: itensDoFormulario(dados),
      },
      usuario,
    );
  } catch (erro) {
    if (erro instanceof ErroDevolucao) return { erros: [erro.message] };
    throw erro;
  }
  revalidatePath(`/fluxo/devolucoes/${codigo}`);
  redirect(`/fluxo/devolucoes/${codigo}?ok=identificada`);
}

// --- Corrigir (Gestor) (extra, emenda E29). As regras ficam nos serviços (correcoes.ts); aqui só a tela. ---

/** A correção que deu certo volta ao detalhe com a confirmação (`?ok=`) e, se houver, a chave do aviso (`&aviso=`). */
function voltarAoDetalhe(codigo: string, ok: string, r: ResultadoCorrecao): never {
  revalidatePath('/fluxo', 'layout');
  const aviso = chaveDoAviso(r.aviso);
  redirect(`/fluxo/devolucoes/${codigo}?ok=${ok}${aviso ? `&aviso=${aviso}` : ''}`);
}

async function corrigir(fazer: () => Promise<ResultadoCorrecao>): Promise<ResultadoCorrecao | EstadoAcaoGestor> {
  try {
    return await fazer();
  } catch (erro) {
    if (erro instanceof ErroDevolucao) return { erros: [erro.message] };
    throw erro;
  }
}

function recusou(r: ResultadoCorrecao | EstadoAcaoGestor): r is EstadoAcaoGestor {
  return 'erros' in r;
}

function ehMotivo(texto: string): texto is MotivoItem {
  return (MOTIVOS_ITEM as readonly string[]).includes(texto);
}

/** Item 1: Estoque Bom ↔ Estoque Problema de uma unidade (`item`), com o motivo só no Problema. */
export async function trocarEstoqueAcao(codigo: string, _anterior: EstadoAcaoGestor, dados: FormData): Promise<EstadoAcaoGestor> {
  const usuario = await exigirPermissao('administrar');
  if (!CODIGO_VALIDO.test(codigo)) return NAO_ENCONTRADA;
  const destino = textoDoForm(dados, 'destino');
  if (destino !== 'BOM' && destino !== 'PROBLEMA') return { erros: ['Escolha Estoque Bom ou Estoque Problema.'] };
  const motivo = textoDoForm(dados, 'motivo');
  const r = await corrigir(() =>
    trocarDestinoItem(obterDb(), textoDoForm(dados, 'item'), destino, destino === 'PROBLEMA' && ehMotivo(motivo) ? motivo : null, usuario),
  );
  if (recusou(r)) return r;
  voltarAoDetalhe(codigo, 'estoque_trocado', r);
}

/** Item 2: Aguardando NF → Aguardando conferência. */
export async function reabrirConferenciaAcao(id: string, codigo: string): Promise<EstadoAcaoGestor> {
  const usuario = await exigirPermissao('administrar');
  if (!CODIGO_VALIDO.test(codigo)) return NAO_ENCONTRADA;
  const r = await corrigir(() => reabrirConferencia(obterDb(), id, usuario));
  if (recusou(r)) return r;
  voltarAoDetalhe(codigo, 'conferencia_reaberta', r);
}

/** Item 3: a chegada some (volta a Pendente de chegada ou No CD), com a conferência e as fotos. */
export async function desfazerChegadaAcao(id: string, codigo: string): Promise<EstadoAcaoGestor> {
  const usuario = await exigirPermissao('administrar');
  if (!CODIGO_VALIDO.test(codigo)) return NAO_ENCONTRADA;
  const r = await corrigir(() => desfazerChegada(obterDb(), id, usuario));
  if (recusou(r)) return r;
  voltarAoDetalhe(codigo, 'chegada_desfeita', r);
}

/**
 * Item 4: as observações, o rastreio (o campo só vem quando a devolução não é do ML) e, por unidade (`item`), o SKU do
 * produto recebido (`sku-<id>`, trocado pelo id do cadastro) e a observação (`obs-<id>`).
 */
export async function corrigirDadosAcao(id: string, codigo: string, _anterior: EstadoAcaoGestor, dados: FormData): Promise<EstadoAcaoGestor> {
  const usuario = await exigirPermissao('administrar');
  if (!CODIGO_VALIDO.test(codigo)) return NAO_ENCONTRADA;
  const db = obterDb();
  const pedidos = dados.getAll('item').flatMap((v) => (typeof v === 'string' ? [v] : []));
  const skus = new Map(pedidos.map((itemId) => [itemId, normalizarSku(textoDoForm(dados, `sku-${itemId}`))]));
  const procurados = [...new Set([...skus.values()].filter(Boolean))];
  const produtos = procurados.length > 0 ? await idsDosProdutos(db, procurados) : new Map<string, string>();
  const fora = procurados.find((sku) => !produtos.has(sku));
  if (fora) return { erros: [`O SKU ${fora} não está no cadastro de produtos.`] };

  const campos: CamposCorrigiveis = {
    ...(dados.has('observacoes') ? { observacao: textoDoForm(dados, 'observacoes') } : {}),
    ...(dados.has('rastreio') ? { rastreio: textoDoForm(dados, 'rastreio') } : {}),
    itens: pedidos.map((itemId) => {
      const sku = skus.get(itemId);
      return {
        itemId,
        ...(sku ? { produtoRecebidoId: produtos.get(sku) } : {}),
        ...(dados.has(`obs-${itemId}`) ? { observacao: textoDoForm(dados, `obs-${itemId}`) } : {}),
      };
    }),
  };
  const r = await corrigir(() => corrigirDados(db, id, campos, usuario));
  if (recusou(r)) return r;
  // Sem mudança nenhuma, o formulário fica na tela com o que foi digitado.
  if (r.aviso === AVISO_NADA_MUDOU) return { erros: [AVISO_NADA_MUDOU] };
  voltarAoDetalhe(codigo, 'dados_corrigidos', r);
}

/** Item 6: apagar esconde (90 dias em Apagadas). A devolução some do detalhe: a tela vai para o Fluxo com o aviso. */
export async function apagarAcao(id: string, codigo: string): Promise<EstadoAcaoGestor> {
  const usuario = await exigirPermissao('administrar');
  if (!CODIGO_VALIDO.test(codigo)) return NAO_ENCONTRADA;
  const r = await corrigir(() => apagarDevolucao(obterDb(), id, usuario));
  if (recusou(r)) return r;
  revalidatePath('/fluxo', 'layout');
  redirect(`/fluxo?apagada=${codigo}`);
}
