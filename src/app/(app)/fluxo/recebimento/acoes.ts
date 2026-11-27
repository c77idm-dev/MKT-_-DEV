'use server';

import { revalidatePath } from 'next/cache';
import { obterDb } from '@/db';
import { formatarDataHora } from '@/lib/formatar';
import { exigirPermissao } from '@/modules/auth/servidor';
import { rotuloStatus } from '@/modules/devolucoes/dominio';
import { ErroDevolucao } from '@/modules/devolucoes/erros';
import { criarNaoIdentificada, darChegadaPeloPedido, receberPorRastreio, type ResultadoRecebimento } from '@/modules/devolucoes/recebimento';
import { fichasDasDevolucoes, type FichaVenda } from '@/modules/mercado-livre/ficha-venda';
import { comAvisoDoPedido, mesmaLeituraDaCamera, mesmoPedidoDaCamera } from './guarda';
import { mensagemChegada, notaAchada } from './mensagens';

/**
 * `nota` (extra, E25): por qual número da etiqueta do ML a devolução foi achada, quando não foi pelo rastreio.
 * `escolher` (extra, E27): achadas pelo número do pedido do ML, nada registrado; a tela mostra a ficha da venda (uma) ou a
 * lista (mais de uma), e a pessoa toca em "Dar chegada" na que chegou. `lidaEm` muda a cada leitura (a tela remonta a
 * ficha e a trava do toque duplo recomeça). `aindaEsperam` (extra, E27): no cartão verde (e, 24/11, no amarelo "Este
 * pacote já chegou") que ficou diante de outro código do mesmo pedido lido pela câmera, as devoluções desse pedido que
 * ainda esperam o pacote (ver comAvisoDoPedido). `jaChegou` (24/11): o aviso é o "Este pacote já chegou" (e não o "Fale
 * com o Gestor"), o único amarelo que fica diante do número do pedido lido pela câmera.
 */
export type EstadoRecebimento =
  | { tipo: 'inicial' }
  | {
      tipo: 'sucesso';
      titulo: string;
      mensagem: string;
      codigos: string[];
      nota?: string;
      naoIdentificada?: { id: string; codigo: string };
      aindaEsperam?: string[];
    }
  | { tipo: 'aviso'; titulo: string; mensagem: string; codigos: string[]; nota?: string; jaChegou?: true; aindaEsperam?: string[] }
  | { tipo: 'escolher'; codigoLido: string; lidaEm: number; fichas: FichaVenda[]; nota: string }
  | { tipo: 'nao_encontrada'; rastreio: string }
  | { tipo: 'erro'; mensagem: string };

const MENSAGEM_MUDOU = 'A situação desta devolução mudou agora. Leia o pacote de novo.';

/** Só põe a nota no estado quando há uma (o estado da leitura pelo rastreio fica como sempre foi). */
function comNota(nota: string | undefined): { nota?: string } {
  return nota ? { nota } : {};
}

/**
 * Pela câmera, o "já chegou" de outro código da mesma etiqueta: o cartão verde fica (E25). (extra, E27) Achada pelo
 * número do pedido, o "já chegou" ou o "Fale com o Gestor" fala da mais recente do pedido, que pode ser outra: se o
 * cartão (o verde ou, 24/11, o amarelo "Este pacote já chegou") é de uma devolução desse pedido, ele fica; nenhuma
 * devolução do pedido espera mais o pacote, e o aviso das que esperavam sai. Pelo rastreio ou pelo envio, o "já chegou"
 * da devolução do cartão (o verde ou, 24/11, o amarelo "já chegou") também deixa o cartão como está, com o aviso; o
 * "Fale com o Gestor" aparece como na E25.
 */
function mesmaEtiqueta(
  r: { tipo: 'ja_recebida' | 'bloqueada'; codigo: string; codigosDoPedido?: string[] },
  anterior: EstadoRecebimento,
  daCamera: boolean,
): EstadoRecebimento | null {
  if (r.codigosDoPedido) return mesmaLeituraDaCamera(anterior, daCamera, r.codigosDoPedido) ? comAvisoDoPedido(anterior, []) : null;
  return r.tipo === 'ja_recebida' && mesmaLeituraDaCamera(anterior, daCamera, [r.codigo]) ? anterior : null;
}

/** O cartão de cada resposta do Recebimento (menos a escolha pelo pedido, que monta a ficha). */
function estadoDaResposta(r: Exclude<ResultadoRecebimento, { tipo: 'escolher' }>, anterior: EstadoRecebimento, daCamera: boolean): EstadoRecebimento {
  switch (r.tipo) {
    case 'recebidas':
      revalidatePath('/fluxo');
      revalidatePath('/bancada'); // (E29) a fila da Bancada
      return {
        tipo: 'sucesso',
        titulo: 'Chegada registrada',
        mensagem: mensagemChegada(r.codigos, r.doArmazemML ?? [], formatarDataHora(r.em)),
        codigos: r.codigos,
        ...comNota(notaAchada(r.achadaPor, r.codigos.length)),
      };
    case 'ja_recebida':
      return (
        mesmaEtiqueta(r, anterior, daCamera) ?? {
          tipo: 'aviso',
          titulo: 'Este pacote já chegou',
          mensagem: `${r.codigo} já tinha chegado${r.recebidaEm ? ` em ${formatarDataHora(r.recebidaEm)}` : ''}. Status: ${rotuloStatus(r.status)}.`,
          codigos: [r.codigo],
          ...comNota(notaAchada(r.achadaPor, 1)),
          jaChegou: true,
        }
      );
    case 'bloqueada':
      return (
        mesmaEtiqueta(r, anterior, daCamera) ?? {
          tipo: 'aviso',
          titulo: 'Fale com o Gestor',
          mensagem: `${r.codigo} está ${rotuloStatus(r.status).toLowerCase()}. Separe o pacote e avise o Gestor.`,
          codigos: [r.codigo],
          ...comNota(notaAchada(r.achadaPor, 1)),
        }
      );
    case 'nao_encontrada':
      return { tipo: 'nao_encontrada', rastreio: r.rastreio };
  }
}

/**
 * `origem=camera` (extra, E25): a leitura veio da câmera, que manda pelo botão escondido do formulário.
 * `intencao=dar_chegada` (extra, E27): o toque em "Dar chegada" na ficha, com a devolução escolhida e o pedido lido.
 */
export async function registrarChegadaAcao(anterior: EstadoRecebimento, dados: FormData): Promise<EstadoRecebimento> {
  const usuario = await exigirPermissao('operar_devolucoes');
  const rastreio = String(dados.get('rastreio') ?? '');
  const daCamera = dados.get('origem') === 'camera';
  const intencao = dados.get('intencao');
  const db = obterDb();
  try {
    if (intencao === 'criar_nao_identificada') {
      const criada = await criarNaoIdentificada(db, rastreio, usuario);
      revalidatePath('/fluxo');
      revalidatePath('/bancada'); // (E29) a fila da Bancada
      return {
        tipo: 'sucesso',
        titulo: 'Pacote não identificado registrado',
        mensagem: `${criada.codigo} foi para "Pedidos Chegados - Aguardando Conferência", marcada como não identificada. Tire a Foto 1 e a Foto 2 abaixo; o Gestor liga ao pedido depois.`,
        codigos: [criada.codigo],
        naoIdentificada: { id: criada.id, codigo: criada.codigo },
      };
    }
    if (intencao === 'dar_chegada') {
      const devolucaoId = String(dados.get('devolucaoId') ?? '');
      const codigoLido = String(dados.get('codigoLido') ?? '');
      const r = await darChegadaPeloPedido(db, { devolucaoId, codigoLido }, usuario);
      if (r.tipo === 'escolher') return { tipo: 'erro', mensagem: MENSAGEM_MUDOU }; // não acontece: a chegada não procura
      return estadoDaResposta(r, anterior, false);
    }
    const r = await receberPorRastreio(db, rastreio, usuario);
    if (r.tipo !== 'escolher') return estadoDaResposta(r, anterior, daCamera);
    // (E27) A câmera continua lendo a mesma etiqueta: outro código do mesmo pedido não troca a ficha aberta, o cartão
    // verde de uma chegada desse pedido nem (24/11) o amarelo "Este pacote já chegou" de uma devolução dele; o cartão
    // ganha o aviso das devoluções que ainda esperam o pacote.
    if (mesmoPedidoDaCamera(anterior, daCamera, r.codigosDoPedido)) return comAvisoDoPedido(anterior, r.codigos);
    const fichas = await fichasDasDevolucoes(db, r.ids);
    if (fichas.length === 0) return { tipo: 'erro', mensagem: MENSAGEM_MUDOU };
    return { tipo: 'escolher', codigoLido: r.codigoLido, lidaEm: Date.now(), fichas, nota: notaAchada(r.achadaPor, fichas.length) ?? '' };
  } catch (erro) {
    if (erro instanceof ErroDevolucao) return { tipo: 'erro', mensagem: erro.message };
    throw erro;
  }
}
