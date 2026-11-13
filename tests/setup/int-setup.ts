import { beforeEach } from 'vitest';
import { definirConectorParaTestes } from '@/conectores/marketplace/registro';
import { CANAIS } from '@/modules/devolucoes/dominio';
import { definirFilaParaTestes, FilaMemoria } from '@/modules/fila/fila';
import { definirArmazenamentoParaTestes } from '@/modules/midia/armazenamento';
import { ArmazenamentoMemoria } from '@/modules/midia/armazenamento-memoria';

/**
 * Os testes de integração nunca falam com o pg-boss, o disco ou um canal de verdade sem pedir (contrato §2, P2 item 10).
 * Um teste que quer olhar a fila faz `const fila = new FilaMemoria(); definirFilaParaTestes(fila);` no próprio beforeEach
 * (que roda depois deste). Os testes do pg-boss criam o PgBoss direto, sem passar por obterFila.
 */
beforeEach(() => {
  definirFilaParaTestes(new FilaMemoria());
  definirArmazenamentoParaTestes(new ArmazenamentoMemoria());
  // null = volta ao padrão (contrato §10, E8): null até a Fase 3; depois, o conector real, que é null sem conta ATIVA.
  for (const canal of CANAIS) definirConectorParaTestes(canal, null);
});
