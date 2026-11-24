import { describe, expect, it } from 'vitest';
import { avisoAindaEsperam, mensagemChegada, mensagemComNota, notaAchada } from './mensagens';

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

describe('mensagemComNota (anúncio do leitor de tela, extra E25)', () => {
  it('sem nota, só a mensagem', () => {
    expect(mensagemComNota('DEV-000001 · 23/11/2026 17:30', undefined)).toBe('DEV-000001 · 23/11/2026 17:30');
  });

  it('a mensagem que termina na hora ganha um ponto antes da nota (pausa na leitura)', () => {
    expect(mensagemComNota('DEV-000071 · 23/11/2026 17:30', 'Achada pelo número do pedido do ML (extra).')).toBe(
      'DEV-000071 · 23/11/2026 17:30. Achada pelo número do pedido do ML (extra).',
    );
  });

  it('a mensagem que já termina em ponto leva só um espaço', () => {
    expect(mensagemComNota('DEV-000071 já tinha chegado. Status: Aguardando conferência.', 'Achada pelo número do envio do ML (extra).')).toBe(
      'DEV-000071 já tinha chegado. Status: Aguardando conferência. Achada pelo número do envio do ML (extra).',
    );
  });
});

describe('avisoAindaEsperam (extra, E27)', () => {
  it('uma devolução do pedido ainda espera o pacote', () => {
    expect(avisoAindaEsperam(['DEV-000002'])).toBe(
      'Do mesmo pedido, a DEV-000002 ainda espera o pacote. Se ele está com você, digite o número do pedido no campo abaixo (extra).',
    );
  });

  it('mais de uma: no plural, com "e" antes da última', () => {
    expect(avisoAindaEsperam(['DEV-000002', 'DEV-000003'])).toBe(
      'Do mesmo pedido, as DEV-000002 e DEV-000003 ainda esperam o pacote. Se algum deles está com você, digite o número do pedido no campo abaixo (extra).',
    );
    expect(avisoAindaEsperam(['DEV-000002', 'DEV-000003', 'DEV-000004'])).toContain('as DEV-000002, DEV-000003 e DEV-000004 ainda esperam');
  });
});
