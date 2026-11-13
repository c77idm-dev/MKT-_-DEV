import { describe, expect, it } from 'vitest';
import { idDoEnvio, resultadoDoErro } from './transporteTus';

describe('transporte tus', () => {
  it('o id do upload é o último pedaço da URL', () => {
    expect(idDoEnvio('/api/midia/0123456789abcdef0123456789abcdef')).toBe('0123456789abcdef0123456789abcdef');
    expect(idDoEnvio('https://x.com/api/midia/abc?y=1')).toBe('abc');
  });

  it('rede, 5xx, 423 e 429 são passageiros; 401 pede login; o resto mostra a mensagem do servidor', () => {
    for (const status of [null, 0, 500, 503, 423, 429]) expect(resultadoDoErro(status, '')).toMatchObject({ ok: false, definitivo: false });
    expect(resultadoDoErro(401, '')).toEqual({ ok: false, definitivo: true, mensagem: 'Sua sessão terminou. Entre no sistema de novo e toque em "Tentar de novo".' });
    expect(resultadoDoErro(413, 'Foto grande demais (máximo 15 MB).\n')).toEqual({ ok: false, definitivo: true, mensagem: 'Foto grande demais (máximo 15 MB).' });
    expect(resultadoDoErro(400, '')).toEqual({ ok: false, definitivo: true, mensagem: 'O servidor recusou o arquivo (erro 400).' });
  });
});
