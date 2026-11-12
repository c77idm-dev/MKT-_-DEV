import { describe, expect, it } from 'vitest';
import { interpretarCanal } from './canais';
import { ehCanal, rotuloStatus, statusDaEtapa } from './dominio';
import { normalizarRastreio } from './rastreio';

describe('vocabulário das devoluções', () => {
  it('cada etapa do PDF tem os seus status; a etapa 5 (lotes) não tem devolução', () => {
    expect(statusDaEtapa(1)).toEqual(['PENDENTE_CHEGADA']);
    expect(statusDaEtapa(2)).toEqual(['AGUARDANDO_CONFERENCIA']);
    expect(statusDaEtapa(3)).toEqual(['EM_CONFERENCIA']);
    expect(statusDaEtapa(4)).toEqual(['AGUARDANDO_NF']);
    expect(statusDaEtapa(5)).toEqual([]);
  });

  it('rótulos e verificações', () => {
    expect(rotuloStatus('AGUARDANDO_CONFERENCIA')).toBe('Aguardando conferência');
    expect(rotuloStatus('OUTRO')).toBe('OUTRO');
    expect(ehCanal('SHEIN')).toBe(true);
    expect(ehCanal('shein')).toBe(false);
  });
});

describe('interpretarCanal', () => {
  it.each([
    ['MERCADO_LIVRE', 'MERCADO_LIVRE'],
    ['Mercado Livre', 'MERCADO_LIVRE'],
    ['ML', 'MERCADO_LIVRE'],
    ['Amazon', 'AMAZON'],
    ['shopee', 'SHOPEE'],
    ['Magazine Luiza', 'MAGALU'],
    ['Tik Tok Shop', 'TIKTOK_SHOP'],
    ['TikTok', 'TIKTOK_SHOP'],
    ['SHEIN', 'SHEIN'],
  ])('%s → %s', (texto, canal) => {
    expect(interpretarCanal(texto)).toBe(canal);
  });

  it('recusa o que não conhece', () => {
    expect(interpretarCanal('Loja X')).toBeNull();
    expect(interpretarCanal('  ')).toBeNull();
  });
});

describe('normalizarRastreio', () => {
  it('tira espaços e põe em maiúsculas', () => {
    expect(normalizarRastreio(' br 123 456 789 br ')).toBe('BR123456789BR');
  });
});
