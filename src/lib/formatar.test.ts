import { describe, expect, it } from 'vitest';
import { formatarDataHora, formatarDataIso, formatarDiaMes, formatarMoeda } from './formatar';

describe('formatação', () => {
  it('data e hora no horário de Brasília', () => {
    expect(formatarDataHora(new Date('2026-11-12T17:32:00Z'))).toBe('12/11/2026 14:32');
    expect(formatarDataHora(new Date('2026-11-01T02:00:00Z'))).toBe('31/10/2026 23:00');
    expect(formatarDiaMes(new Date('2026-11-12T17:32:00Z'))).toBe('12/11');
  });

  it('data guardada como texto ISO', () => {
    expect(formatarDataIso('2026-11-05')).toBe('05/11/2026');
  });

  it('moeda em reais', () => {
    expect(formatarMoeda('1234.5')).toBe('R$ 1.234,50');
    expect(formatarMoeda('89.90')).toBe('R$ 89,90');
    expect(formatarMoeda(null)).toBe('—');
  });
});
