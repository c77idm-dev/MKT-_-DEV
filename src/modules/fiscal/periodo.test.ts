import { describe, expect, it } from 'vitest';
import { periodoDoMesAtual, validarPeriodo } from './periodo';

describe('período do ZIP de XMLs (spec §8.7)', () => {
  it('padrão: do dia 1 até hoje, no horário de Brasília', () => {
    expect(periodoDoMesAtual(new Date('2026-11-12T12:00:00Z'))).toEqual({ de: '2026-11-01', ate: '2026-11-12' });
    // 01/12 às 02:00 UTC ainda é 30/11 em Brasília.
    expect(periodoDoMesAtual(new Date('2026-12-01T02:00:00Z'))).toEqual({ de: '2026-11-01', ate: '2026-11-30' });
  });

  it('até 31 dias, "De" antes de "Até", datas de verdade', () => {
    expect(validarPeriodo('2026-11-01', '2026-11-30')).toBe(true);
    expect(validarPeriodo('2026-10-01', '2026-10-31')).toBe(true);
    expect(validarPeriodo('2026-10-01', '2026-11-01')).toBe(false);
    expect(validarPeriodo('2026-11-30', '2026-11-01')).toBe(false);
    expect(validarPeriodo('2026-02-30', '2026-03-01')).toBe(false);
    expect(validarPeriodo('01/11/2026', '2026-11-30')).toBe(false);
  });
});
