import { describe, expect, it } from 'vitest';
import { validarConfiguracaoMidia } from './configuracao';

describe('validarConfiguracaoMidia', () => {
  it('aceita a obrigatoriedade da lista e de 1 a 120 meses', () => {
    expect(validarConfiguracaoMidia({ videoObrigatorio: 'SO_PROBLEMA', mesesRetencaoMidia: ' 18 ' })).toEqual({
      dados: { videoObrigatorio: 'SO_PROBLEMA', mesesRetencaoMidia: 18 },
      erros: [],
    });
  });

  it('junta os erros', () => {
    expect(validarConfiguracaoMidia({ videoObrigatorio: 'AS_VEZES', mesesRetencaoMidia: '0' })).toEqual({
      dados: null,
      erros: ['Escolha quando o Vídeo de Prova é obrigatório.', 'Prazo de guarda: de 1 a 120 meses.'],
    });
    expect(validarConfiguracaoMidia({ videoObrigatorio: 'SEMPRE', mesesRetencaoMidia: '1,5' }).erros).toEqual(['Prazo de guarda: de 1 a 120 meses.']);
  });
});
