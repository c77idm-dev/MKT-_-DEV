'use server';

import { revalidatePath } from 'next/cache';
import type { EstadoAcaoFiscal } from '@/components/fiscal/tipos';
import { obterDb } from '@/db';
import { textoDoForm } from '@/lib/formulario';
import { ehUuid } from '@/lib/uuid';
import { exigirPermissao } from '@/modules/auth/servidor';
import { ErroDevolucao } from '@/modules/devolucoes/erros';
import { lerChaveAlvo } from '@/modules/fiscal/casamento';
import { cancelarNota, reenviarNota, solicitarEmissao } from '@/modules/fiscal/emissao';
import { ErroFiscal } from '@/modules/fiscal/erros';
import { escolherItemNotaVenda } from '@/modules/fiscal/escolha';
import { buscarNotaVendaNoCanal, registrarNotaVenda, removerNotaVenda } from '@/modules/fiscal/nota-venda';
import { notaPertenceADevolucao } from '@/modules/fiscal/situacao';
import { TAMANHO_MAXIMO_XML } from '@/modules/fiscal/xml-nota-venda';

/** `devolucaoId` e `codigo` chegam ligados (bind) do cliente: são conferidos antes de qualquer uso. */
const CODIGO_VALIDO = /^DEV-\d+$/;

async function executar(devolucaoId: string, codigo: string, acao: () => Promise<string>): Promise<EstadoAcaoFiscal> {
  if (!CODIGO_VALIDO.test(codigo) || !ehUuid(devolucaoId)) return { erros: ['Devolução não encontrada.'], ok: null };
  let ok: string;
  try {
    ok = await acao();
  } catch (erro) {
    if (erro instanceof ErroFiscal || erro instanceof ErroDevolucao) return { erros: [erro.message], ok: null };
    throw erro;
  }
  revalidatePath(`/fluxo/devolucoes/${codigo}`);
  revalidatePath('/fluxo/etapa/4');
  return { erros: [], ok };
}

/** NF de devolução: emitir (extra, decisão 14), corrigir e reenviar, cancelar (spec §6.4 e §8.6). */
export async function acaoNotaDevolucao(devolucaoId: string, codigo: string, _anterior: EstadoAcaoFiscal, dados: FormData): Promise<EstadoAcaoFiscal> {
  const usuario = await exigirPermissao('gerir_fiscal');
  const db = obterDb();
  const operacao = textoDoForm(dados, 'operacao');
  const notaId = textoDoForm(dados, 'nota');
  return executar(devolucaoId, codigo, async () => {
    if (operacao === 'emitir') {
      await solicitarEmissao(db, { tipo: 'DEVOLUCAO_VENDA', devolucaoId }, usuario);
      return 'NF de devolução enviada à SEFAZ. A resposta chega em alguns segundos.';
    }
    if (!ehUuid(notaId) || !(await notaPertenceADevolucao(db, notaId, devolucaoId))) throw new ErroFiscal('NF não encontrada.');
    if (operacao === 'reenviar') {
      await reenviarNota(db, notaId, usuario);
      return 'NF reenviada à SEFAZ.';
    }
    if (operacao === 'cancelar') {
      await cancelarNota(db, notaId, textoDoForm(dados, 'justificativa'), usuario);
      return 'NF cancelada. A devolução voltou para Aguardando NF.';
    }
    throw new ErroFiscal('Ação desconhecida.');
  });
}

/** NF de venda: anexar o XML, buscar no Mercado Livre (contrato §5.8) ou remover (extra). */
export async function acaoNotaVenda(devolucaoId: string, codigo: string, _anterior: EstadoAcaoFiscal, dados: FormData): Promise<EstadoAcaoFiscal> {
  const usuario = await exigirPermissao('gerir_fiscal');
  const db = obterDb();
  const operacao = textoDoForm(dados, 'operacao');
  return executar(devolucaoId, codigo, async () => {
    if (operacao === 'anexar') {
      const arquivo = dados.get('xml');
      if (!(arquivo instanceof File) || arquivo.size === 0) throw new ErroFiscal('Escolha o arquivo XML da NF de venda.');
      if (arquivo.size > TAMANHO_MAXIMO_XML) throw new ErroFiscal('O XML passa de 1 MB: confira se é o arquivo da NF de venda.');
      await registrarNotaVenda(db, devolucaoId, await arquivo.text(), 'ANEXO', usuario);
      return 'NF de venda anexada.';
    }
    if (operacao === 'buscar') {
      const resultado = await buscarNotaVendaNoCanal(db, devolucaoId, usuario);
      if (!resultado.consultou) throw new ErroFiscal('A integração com o Mercado Livre não está ligada: anexe o XML da NF de venda.');
      if (resultado.encontradas === 0) throw new ErroFiscal('O Mercado Livre não tem a NF de venda deste pedido: anexe o XML (baixado do Bitbrain).');
      return 'NF de venda obtida do Mercado Livre.';
    }
    if (operacao === 'remover') {
      const notaVendaId = textoDoForm(dados, 'notaVenda');
      if (!ehUuid(notaVendaId)) throw new ErroFiscal('NF de venda não encontrada.');
      await removerNotaVenda(db, devolucaoId, notaVendaId, usuario);
      return 'NF de venda removida.';
    }
    throw new ErroFiscal('Ação desconhecida.');
  });
}

/** D14: o Fiscal liga a unidade a um item da NF de venda (vazio desfaz a escolha). */
export async function acaoEscolherItem(devolucaoId: string, codigo: string, _anterior: EstadoAcaoFiscal, dados: FormData): Promise<EstadoAcaoFiscal> {
  const usuario = await exigirPermissao('gerir_fiscal');
  const itemId = textoDoForm(dados, 'item');
  const texto = textoDoForm(dados, 'alvo');
  return executar(devolucaoId, codigo, async () => {
    if (!ehUuid(itemId)) throw new ErroFiscal('Unidade não encontrada.');
    const alvo = texto ? lerChaveAlvo(texto) : null;
    if (texto && !alvo) throw new ErroFiscal('Item da NF de venda inválido.');
    await escolherItemNotaVenda(obterDb(), devolucaoId, itemId, alvo, usuario);
    return alvo ? 'Item da NF de venda escolhido.' : 'Escolha desfeita.';
  });
}
