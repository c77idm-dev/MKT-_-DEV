import { describe, expect, it } from 'vitest';
import { rotuloFoto, validarRevisao } from './contestacoes';

const FOTOS = new Set(['f1', 'f2']);
const BASE = { motivo: 'SRF6', mensagem: 'O produto voltou usado, com marcas.', evidencias: [] as string[] };

describe('validarRevisao', () => {
  it('aceita e apara a mensagem, sem repetir foto', () => {
    expect(validarRevisao({ ...BASE, mensagem: `  ${BASE.mensagem}  `, evidencias: ['f1', 'f1'] }, FOTOS)).toEqual({
      dados: { motivo: 'SRF6', mensagem: BASE.mensagem, evidencias: ['f1'] },
      erros: [],
    });
  });

  it('junta os erros: motivo, mensagem curta e foto de outra devolução', () => {
    expect(validarRevisao({ motivo: 'SRF9', mensagem: 'curta', evidencias: ['outra'] }, FOTOS).erros).toEqual([
      'Escolha o motivo para o Mercado Livre.',
      'Escreva a mensagem para o Mercado Livre (pelo menos 10 letras).',
      'Uma das fotos escolhidas não é desta devolução.',
    ]);
  });

  it('SRF2 e SRF4 exigem pelo menos 1 foto (spec §7.4); mensagem até 2000 e até 10 fotos', () => {
    expect(validarRevisao({ ...BASE, motivo: 'SRF2' }, FOTOS).erros).toEqual(['O motivo "Produto avariado" exige pelo menos 1 foto.']);
    expect(validarRevisao({ ...BASE, mensagem: 'x'.repeat(2001) }, FOTOS).erros).toEqual(['Mensagem: no máximo 2000 caracteres.']);
    const onze = Array.from({ length: 11 }, (_, i) => `g${i}`);
    expect(validarRevisao({ ...BASE, evidencias: onze }, new Set(onze)).erros).toEqual(['Escolha no máximo 10 fotos.']);
  });
});

describe('rotuloFoto', () => {
  it('usa os nomes do PDF', () => {
    expect(rotuloFoto('FOTO_1_ETIQUETA', null)).toBe('Foto 1');
    expect(rotuloFoto('FOTO_3_PRODUTO', 2)).toBe('Foto 3 · unidade 2');
  });
});
