import { describe, expect, it } from 'vitest';
import { padraoRastreioDoEnvioML, pedidosDoCodigo } from './etiqueta-ml';

describe('(extra, E25) pedidosDoCodigo: o número do pedido do ML lido na etiqueta', () => {
  it('o código feito só de dígitos vale como está', () => {
    expect(pedidosDoCodigo('2000018992531744')).toEqual(['2000018992531744']);
    expect(pedidosDoCodigo('48515208229')).toEqual(['48515208229']);
  });

  it('com 15 dígitos também vale com o "2" na frente (a etiqueta corta o 2 do pedido de 16 dígitos)', () => {
    expect(pedidosDoCodigo('000018992531744')).toEqual(['000018992531744', '2000018992531744']);
  });

  it('com letra, espaço ou traço não é número de pedido', () => {
    expect(pedidosDoCodigo('MM48351759365BRSP06')).toEqual([]);
    expect(pedidosDoCodigo('PED123')).toEqual([]);
    expect(pedidosDoCodigo('2000-0189')).toEqual([]);
    expect(pedidosDoCodigo('')).toEqual([]);
  });
});

describe('(extra, E25) padraoRastreioDoEnvioML: o número do envio do ML dentro do rastreio do Mercado Envios', () => {
  const casa = (codigo: string, rastreio: string) => {
    const padrao = padraoRastreioDoEnvioML(codigo);
    return padrao !== null && new RegExp(padrao).test(rastreio);
  };

  it('acha o número de 11 dígitos entre as letras (MM…BR…, MEL…FM…)', () => {
    expect(casa('48503476449', 'MM48503476449BRSP02')).toBe(true);
    expect(casa('48348229363', 'MM48348229363BRPR01')).toBe(true);
    expect(casa('48249814112', 'MEL48249814112FMDOR01')).toBe(true);
  });

  it('aceita 10 a 12 dígitos, por segurança; fora disso, nada', () => {
    expect(casa('4850347644', 'MM4850347644BR')).toBe(true);
    expect(casa('485034764491', 'MM485034764491BR')).toBe(true);
    expect(padraoRastreioDoEnvioML('485034764')).toBeNull();
    expect(padraoRastreioDoEnvioML('4850347644912')).toBeNull();
  });

  it('não acha o número que só aparece dentro de outro número', () => {
    expect(casa('48515208229', 'MM148515208229BRSP02')).toBe(false);
    expect(casa('48515208229', 'MM485152082291BRSP02')).toBe(false);
    expect(casa('48515208229', 'X48515208229BR')).toBe(false);
    expect(casa('48515208229', 'MMMMM48515208229BR')).toBe(false);
    expect(casa('48515208229', 'MM48515208229')).toBe(false);
  });

  it('com letra no código não há padrão', () => {
    expect(padraoRastreioDoEnvioML('48515208229BR')).toBeNull();
    expect(padraoRastreioDoEnvioML('A4851520822')).toBeNull();
  });
});
