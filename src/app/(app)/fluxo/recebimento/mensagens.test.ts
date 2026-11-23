import { describe, expect, it } from 'vitest';
import { mensagemChegada, notaAchada } from './mensagens';

const QUANDO = '23/11/2026 17:30';

describe('mensagemChegada', () => {
  it('sem pacote do armazém, fica como sempre foi: códigos e data', () => {
    expect(mensagemChegada(['DEV-000001'], [], QUANDO)).toBe('DEV-000001 · 23/11/2026 17:30');
    expect(mensagemChegada(['DEV-000001', 'DEV-000002'], [], QUANDO)).toBe('DEV-000001, DEV-000002 · 23/11/2026 17:30');
  });

  it('(extra, E25) o pacote que voltou do armazém do ML ganha o aviso logo depois do código', () => {
    expect(mensagemChegada(['DEV-000071'], ['DEV-000071'], QUANDO)).toBe('DEV-000071 · voltou do armazém do ML (extra) · 23/11/2026 17:30');
    expect(mensagemChegada(['DEV-000001', 'DEV-000002'], ['DEV-000001', 'DEV-000002'], QUANDO)).toBe(
      'DEV-000001, DEV-000002 · voltaram do armazém do ML (extra) · 23/11/2026 17:30',
    );
  });

  it('(extra, E25) com só uma parte do armazém, diz qual', () => {
    expect(mensagemChegada(['DEV-000001', 'DEV-000002'], ['DEV-000002'], QUANDO)).toBe(
      'DEV-000001, DEV-000002 · DEV-000002 voltou do armazém do ML (extra) · 23/11/2026 17:30',
    );
  });
});

describe('notaAchada (extra, E25)', () => {
  it('pelo rastreio não há nota', () => {
    expect(notaAchada(undefined, 1)).toBeUndefined();
  });

  it('diz por qual número da etiqueta do ML a devolução foi achada', () => {
    expect(notaAchada('PEDIDO_ML', 1)).toBe('Achada pelo número do pedido do ML (extra).');
    expect(notaAchada('ENVIO_ML', 1)).toBe('Achada pelo número do envio do ML (extra).');
    expect(notaAchada('PEDIDO_ML', 2)).toBe('Achadas pelo número do pedido do ML (extra).');
  });
});
