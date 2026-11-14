import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { chaveCriptografia, configML, ErroConfiguracaoML, faltasConfigML } from './config';

describe('configML', () => {
  it('lê as variáveis do ML; ML_USAR_PKCE vale como texto ou booleano', () => {
    expect(
      configML({
        ML_CONECTOR: 'api',
        ML_CLIENT_ID: ' 999 ',
        ML_CLIENT_SECRET: 's',
        ML_REDIRECT_URI: 'https://x/api/ml/retorno',
        ML_USAR_PKCE: 'true',
        CHAVE_CRIPTOGRAFIA: 'abc',
      }),
    ).toEqual({ modo: 'api', clientId: '999', clientSecret: 's', redirectUri: 'https://x/api/ml/retorno', usarPkce: true, chaveBase64: 'abc' });
    expect(configML({ ML_USAR_PKCE: true }).usarPkce).toBe(true);
    expect(configML({ ML_USAR_PKCE: 'false' }).usarPkce).toBe(false);
  });

  it('o modo é "falso" só quando ML_CONECTOR=falso', () => {
    expect(configML({}).modo).toBe('api');
    expect(configML({ ML_CONECTOR: 'falso' }).modo).toBe('falso');
  });
});

describe('faltasConfigML', () => {
  it('no modo api lista o que falta; no falso não exige nada', () => {
    expect(faltasConfigML(configML({ ML_CONECTOR: 'api' }))).toEqual(['ML_CLIENT_ID', 'ML_CLIENT_SECRET', 'ML_REDIRECT_URI', 'CHAVE_CRIPTOGRAFIA']);
    expect(faltasConfigML(configML({ ML_CONECTOR: 'falso' }))).toEqual([]);
  });
});

describe('chaveCriptografia', () => {
  it('usa a chave do .env', () => {
    const chave = randomBytes(32);
    expect(chaveCriptografia(configML({ CHAVE_CRIPTOGRAFIA: chave.toString('base64') })).equals(chave)).toBe(true);
  });

  it('no modo falso sem chave usa a de desenvolvimento (o lerEnv recusa o falso em produção)', () => {
    expect(chaveCriptografia(configML({ ML_CONECTOR: 'falso' }))).toHaveLength(32);
  });

  it('no modo api sem chave, ou com chave de tamanho errado, é ErroConfiguracaoML', () => {
    expect(() => chaveCriptografia(configML({ ML_CONECTOR: 'api' }))).toThrow(ErroConfiguracaoML);
    expect(() => chaveCriptografia(configML({ CHAVE_CRIPTOGRAFIA: randomBytes(8).toString('base64') }))).toThrow(ErroConfiguracaoML);
  });
});
