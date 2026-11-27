import { describe, expect, it } from 'vitest';
import { AVISOS_CORRECAO, chaveDoAviso, textoDoAviso } from './avisos-correcao';

describe('avisos das correções do Gestor (E29): a tela recebe a chave pela URL, nunca o texto', () => {
  it('cada texto tem a sua chave, e a chave volta ao mesmo texto', () => {
    for (const [chave, texto] of Object.entries(AVISOS_CORRECAO)) {
      expect(chaveDoAviso(texto)).toBe(chave);
      expect(textoDoAviso(chave)).toBe(texto);
    }
  });

  it('sem aviso, texto desconhecido ou chave desconhecida: nada', () => {
    expect(chaveDoAviso(null)).toBeNull();
    expect(chaveDoAviso('Qualquer outra coisa.')).toBeNull();
    expect(textoDoAviso('')).toBeNull();
    expect(textoDoAviso('toString')).toBeNull();
    expect(textoDoAviso('<script>')).toBeNull();
  });

  it('fala da contestação que ficou no ML', () => {
    expect(AVISOS_CORRECAO.contestacao_enviada).toBe('A contestação desta devolução já foi enviada ao Mercado Livre e continua lá.');
  });
});
