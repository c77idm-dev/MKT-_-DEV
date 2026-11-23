import type { EstadoRecebimento } from './acoes';

/**
 * A câmera lê em sequência e pode "ver" outro código enquanto o anterior ainda é processado ou enquanto a pessoa
 * decide o que fazer com um rastreio desconhecido. Nesses momentos a leitura é ignorada.
 */
export function podeAceitarLeitura(pendente: boolean, estado: EstadoRecebimento): boolean {
  return !pendente && estado.tipo !== 'nao_encontrada';
}

/**
 * (extra, E25) A etiqueta do ML tem vários códigos (rastreio, pedido, envio) e a câmera continua lendo depois do cartão
 * verde. Outro código da mesma etiqueta acha a mesma devolução e o "Este pacote já chegou" cobriria o cartão verde (e o
 * aviso do armazém do ML) em menos de 1 s. Pela câmera, esse "já chegou" de uma devolução que já está no cartão verde é a
 * mesma leitura: o cartão fica. Pelo campo (digitação ou leitor USB) nada muda.
 */
export function mesmaLeituraDaCamera(anterior: EstadoRecebimento, daCamera: boolean, codigoJaRecebido: string): boolean {
  return daCamera && anterior.tipo === 'sucesso' && anterior.codigos.includes(codigoJaRecebido);
}
