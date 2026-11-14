import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { cifrar, decifrar, ErroCifra, lerChave } from './cifra';

const CHAVE = randomBytes(32);

describe('cifra AES-256-GCM (spec §10: tokens do ML cifrados)', () => {
  it('decifra o que cifrou, e o texto cifrado não mostra o original', () => {
    const cifrado = cifrar('APP_USR-segredo', CHAVE);
    expect(cifrado.startsWith('v1.')).toBe(true);
    expect(cifrado).not.toContain('APP_USR');
    expect(decifrar(cifrado, CHAVE)).toBe('APP_USR-segredo');
  });

  it('cada cifragem usa um IV novo', () => {
    expect(cifrar('x', CHAVE)).not.toBe(cifrar('x', CHAVE));
  });

  it('recusa texto alterado, chave errada e formato desconhecido', () => {
    const cifrado = cifrar('segredo', CHAVE);
    const partes = cifrado.split('.');
    partes[3] = Buffer.from('outro').toString('base64url');
    expect(() => decifrar(partes.join('.'), CHAVE)).toThrow(ErroCifra);
    expect(() => decifrar(cifrado, randomBytes(32))).toThrow(ErroCifra);
    expect(() => decifrar('qualquer coisa', CHAVE)).toThrow(ErroCifra);
  });

  it('lerChave exige 32 bytes em base64', () => {
    expect(lerChave(randomBytes(32).toString('base64'))).toHaveLength(32);
    expect(() => lerChave(randomBytes(16).toString('base64'))).toThrow(/32 bytes/);
  });
});
