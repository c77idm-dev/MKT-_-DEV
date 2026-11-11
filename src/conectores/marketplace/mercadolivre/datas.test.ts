import { describe, expect, it } from 'vitest';
import { formatarDataML } from './datas';

describe('formatarDataML', () => {
  it('formata no horário de Brasília, com milissegundos, como no exemplo da documentação do ML', () => {
    expect(formatarDataML(new Date('2026-03-19T15:31:54.000Z'))).toBe('2026-03-19T12:31:54.000-0300');
  });
});
