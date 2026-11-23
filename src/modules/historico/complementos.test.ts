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
