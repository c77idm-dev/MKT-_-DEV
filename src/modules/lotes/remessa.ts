import type { Db } from '@/db/client';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { cancelarNota, reenviarNota, solicitarEmissao } from '@/modules/fiscal/emissao';
import { exigirPodeEmitir } from '@/modules/fiscal/notas';
import { tipoNotaDoLote } from './dominio';
import { ErroLotes } from './erros';
import { notaAtivaDoLote, obterLote } from './repositorio';

/** Atalhos das telas para a NF de Remessa. Sem eventos próprios: a Fase 4 grava os da nota (decisão 18). */
export async function emitirNotaRemessa(db: Db, loteId: string, usuario: UsuarioSessao): Promise<{ notaFiscalId: string }> {
  exigirPodeEmitir(usuario);
  const lote = await obterLote(db, loteId);
  if (!lote) throw new ErroLotes('Lote não encontrado.');
  if (lote.status === 'ABERTO') throw new ErroLotes('Feche o lote antes de emitir a NF de Remessa.');
  if (lote.status !== 'FECHADO') throw new ErroLotes('O lote já tem NF de Remessa autorizada.');
  const ativa = await notaAtivaDoLote(db, loteId);
  if (ativa?.situacao === 'PROCESSANDO') throw new ErroLotes('O lote já tem NF de Remessa em processamento.');
  if (ativa?.situacao === 'REJEITADA') throw new ErroLotes('O lote tem NF de Remessa rejeitada: use "Corrigir e reenviar".');
  if (!lote.tipo) throw new ErroLotes('Escolha o tipo do lote ao fechar.');
  return solicitarEmissao(db, { tipo: tipoNotaDoLote(lote.tipo), loteId }, usuario);
}

export async function reenviarNotaRemessa(db: Db, loteId: string, usuario: UsuarioSessao): Promise<void> {
  exigirPodeEmitir(usuario);
  const nota = await notaAtivaDoLote(db, loteId);
  if (!nota || nota.situacao !== 'REJEITADA') throw new ErroLotes('Só uma NF de Remessa rejeitada pode ser corrigida e reenviada.');
  await reenviarNota(db, nota.id, usuario);
}

export async function cancelarNotaRemessa(db: Db, loteId: string, justificativa: string, usuario: UsuarioSessao, agora: Date = new Date()): Promise<void> {
  exigirPodeEmitir(usuario);
  const lote = await obterLote(db, loteId);
  if (!lote) throw new ErroLotes('Lote não encontrado.');
  if (lote.status !== 'NF_EMITIDA' || !lote.notaFiscalId) throw new ErroLotes('Só dá para cancelar a NF de Remessa antes de registrar o envio.');
  await cancelarNota(db, lote.notaFiscalId, justificativa, usuario, agora);
}
