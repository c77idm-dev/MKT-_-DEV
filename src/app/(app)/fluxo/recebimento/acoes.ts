'use server';

import { revalidatePath } from 'next/cache';
import { obterDb } from '@/db';
import { formatarDataHora } from '@/lib/formatar';
import { exigirPermissao } from '@/modules/auth/servidor';
import { rotuloStatus } from '@/modules/devolucoes/dominio';
import { ErroDevolucao } from '@/modules/devolucoes/erros';
import { criarNaoIdentificada, receberPorRastreio } from '@/modules/devolucoes/recebimento';
import { mensagemChegada, notaAchada } from './mensagens';

/** `nota` (extra, E25): por qual número da etiqueta do ML a devolução foi achada, quando não foi pelo rastreio. */
export type EstadoRecebimento =
  | { tipo: 'inicial' }
  | { tipo: 'sucesso'; titulo: string; mensagem: string; codigos: string[]; nota?: string; naoIdentificada?: { id: string; codigo: string } }
  | { tipo: 'aviso'; titulo: string; mensagem: string; codigos: string[]; nota?: string }
  | { tipo: 'nao_encontrada'; rastreio: string }
  | { tipo: 'erro'; mensagem: string };

/** Só põe a nota no estado quando há uma (o estado da leitura pelo rastreio fica como sempre foi). */
function comNota(nota: string | undefined): { nota?: string } {
  return nota ? { nota } : {};
}

export async function registrarChegadaAcao(_anterior: EstadoRecebimento, dados: FormData): Promise<EstadoRecebimento> {
  const usuario = await exigirPermissao('operar_devolucoes');
  const rastreio = String(dados.get('rastreio') ?? '');
  const db = obterDb();
  try {
    if (dados.get('intencao') === 'criar_nao_identificada') {
      const criada = await criarNaoIdentificada(db, rastreio, usuario);
      revalidatePath('/fluxo');
      return {
        tipo: 'sucesso',
        titulo: 'Pacote não identificado registrado',
        mensagem: `${criada.codigo} foi para "Pedidos Chegados - Aguardando Conferência", marcada como não identificada. Tire a Foto 1 e a Foto 2 abaixo; o Gestor liga ao pedido depois.`,
        codigos: [criada.codigo],
        naoIdentificada: { id: criada.id, codigo: criada.codigo },
      };
    }
    const r = await receberPorRastreio(db, rastreio, usuario);
    switch (r.tipo) {
      case 'recebidas':
        revalidatePath('/fluxo');
        return {
          tipo: 'sucesso',
          titulo: 'Chegada registrada',
          mensagem: mensagemChegada(r.codigos, r.doArmazemML ?? [], formatarDataHora(r.em)),
          codigos: r.codigos,
          ...comNota(notaAchada(r.achadaPor, r.codigos.length)),
        };
      case 'ja_recebida':
        return {
          tipo: 'aviso',
          titulo: 'Este pacote já chegou',
          mensagem: `${r.codigo} já tinha chegado${r.recebidaEm ? ` em ${formatarDataHora(r.recebidaEm)}` : ''}. Status: ${rotuloStatus(r.status)}.`,
          codigos: [r.codigo],
          ...comNota(notaAchada(r.achadaPor, 1)),
        };
      case 'bloqueada':
        return {
          tipo: 'aviso',
          titulo: 'Fale com o Gestor',
          mensagem: `${r.codigo} está ${rotuloStatus(r.status).toLowerCase()}. Separe o pacote e avise o Gestor.`,
          codigos: [r.codigo],
          ...comNota(notaAchada(r.achadaPor, 1)),
        };
      case 'nao_encontrada':
        return { tipo: 'nao_encontrada', rastreio: r.rastreio };
    }
  } catch (erro) {
    if (erro instanceof ErroDevolucao) return { tipo: 'erro', mensagem: erro.message };
    throw erro;
  }
}
