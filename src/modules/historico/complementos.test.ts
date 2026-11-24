import { describe, expect, it } from 'vitest';
import { complementoDoEvento } from './complementos';

describe('complementoDoEvento (extra, emenda E25)', () => {
  it('a chegada do pacote que voltou do armazém do ML ganha o aviso ao lado do rótulo', () => {
    expect(complementoDoEvento('recebida', { rastreio: 'BR1', voltouDoArmazemML: true })).toBe('(voltou do armazém do ML)');
    expect(complementoDoEvento('recebida', { codigoLido: '000018992531744', achadaPor: 'PEDIDO_ML', voltouDoArmazemML: true })).toBe(
      '(voltou do armazém do ML)',
    );
  });

  it('a chegada comum e os outros eventos ficam sem complemento', () => {
    expect(complementoDoEvento('recebida', { rastreio: 'BR1' })).toBeNull();
    expect(complementoDoEvento('recebida', null)).toBeNull();
    expect(complementoDoEvento('recebida', { voltouDoArmazemML: 'sim' })).toBeNull();
    expect(complementoDoEvento('ml_no_cd', { voltouDoArmazemML: true })).toBeNull();
  });
});

describe('complementoDoEvento: chegada pela Retirada do Full (extra, emenda E27)', () => {
  it('a chegada dada pela etiqueta amarela na Retirada do Full diz qual retirada', () => {
    expect(complementoDoEvento('recebida', { codigoLido: '2000018992531744', achadaPor: 'PEDIDO_ML', retiradaFull: 'RF-000012' })).toBe(
      '(pela Retirada do Full RF-000012)',
    );
  });

  it('junto com a volta do armazém do ML, os dois avisos', () => {
    expect(complementoDoEvento('recebida', { achadaPor: 'PEDIDO_ML', voltouDoArmazemML: true, retiradaFull: 'RF-000012' })).toBe(
      '(voltou do armazém do ML) (pela Retirada do Full RF-000012)',
    );
  });

  it('código que não é de retirada, ou outro evento, fica de fora', () => {
    expect(complementoDoEvento('recebida', { retiradaFull: 'qualquer coisa' })).toBeNull();
    expect(complementoDoEvento('recebida', { retiradaFull: 12 })).toBeNull();
    expect(complementoDoEvento('conferencia_iniciada', { retiradaFull: 'RF-000012' })).toBeNull();
  });
});
