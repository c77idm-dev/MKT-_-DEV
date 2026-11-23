import { describe, expect, it } from 'vitest';
import type { EstadoRecebimento } from './acoes';
import { mesmaLeituraDaCamera, podeAceitarLeitura } from './guarda';

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

describe('mesmaLeituraDaCamera (extra, E25)', () => {
  const SUCESSO: EstadoRecebimento = { tipo: 'sucesso', titulo: 'Chegada registrada', mensagem: 'DEV-000071 · 23/11/2026 17:30', codigos: ['DEV-000071'] };

  it('pela câmera, o "já chegou" de uma devolução que está no cartão verde é outro código da mesma etiqueta: o cartão fica', () => {
    expect(mesmaLeituraDaCamera(SUCESSO, true, 'DEV-000071')).toBe(true);
  });

  it('pelo campo (digitação ou leitor USB) o aviso "já chegou" aparece como sempre', () => {
    expect(mesmaLeituraDaCamera(SUCESSO, false, 'DEV-000071')).toBe(false);
  });

  it('outra devolução, ou sem cartão verde na tela, o aviso aparece', () => {
    expect(mesmaLeituraDaCamera(SUCESSO, true, 'DEV-000072')).toBe(false);
    expect(mesmaLeituraDaCamera(INICIAL, true, 'DEV-000071')).toBe(false);
    expect(mesmaLeituraDaCamera({ tipo: 'aviso', titulo: 'Este pacote já chegou', mensagem: 'x', codigos: ['DEV-000071'] }, true, 'DEV-000071')).toBe(false);
  });
});
