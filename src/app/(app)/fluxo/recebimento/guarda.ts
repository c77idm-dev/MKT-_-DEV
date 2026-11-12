import type { EstadoRecebimento } from './acoes';

/**
 * A câmera lê em sequência e pode "ver" outro código enquanto o anterior ainda é processado ou enquanto a pessoa
 * decide o que fazer com um rastreio desconhecido. Nesses momentos a leitura é ignorada.
 */
export function podeAceitarLeitura(pendente: boolean, estado: EstadoRecebimento): boolean {
  return !pendente && estado.tipo !== 'nao_encontrada';
}
