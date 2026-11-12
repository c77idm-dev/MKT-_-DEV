import { describe, expect, it } from 'vitest';
import type { EstadoRecebimento } from './acoes';
import { podeAceitarLeitura } from './guarda';

const INICIAL: EstadoRecebimento = { tipo: 'inicial' };

describe('podeAceitarLeitura', () => {
  it('aceita leitura quando está livre', () => {
    expect(podeAceitarLeitura(false, INICIAL)).toBe(true);
    expect(podeAceitarLeitura(false, { tipo: 'sucesso', titulo: 'a', mensagem: 'b', codigos: [] })).toBe(true);
  });

  it('ignora leitura enquanto um envio está pendente', () => {
    expect(podeAceitarLeitura(true, INICIAL)).toBe(false);
  });

  it('ignora leitura enquanto o cartão "não encontrada" espera a escolha da pessoa', () => {
    expect(podeAceitarLeitura(false, { tipo: 'nao_encontrada', rastreio: 'X' })).toBe(false);
  });
});
