import { describe, expect, it } from 'vitest';
import { CHAVE_EMAIL_LEMBRADO, guardarEmailLembrado, lerEmailLembrado } from './lembrar';

function memoria(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    get length() {
      return m.size;
    },
  } as Storage;
}
const quebrado = {
  getItem() {
    throw new Error('bloqueado');
  },
  setItem() {
    throw new Error('bloqueado');
  },
  removeItem() {
    throw new Error('bloqueado');
  },
} as unknown as Storage;

describe('lembrar o e-mail (extra)', () => {
  it('guarda o e-mail sem espaços e lê de volta', () => {
    const s = memoria();
    guardarEmailLembrado('  ana@empresa.com.br ', true, s);
    expect(s.getItem(CHAVE_EMAIL_LEMBRADO)).toBe('ana@empresa.com.br');
    expect(lerEmailLembrado(s)).toBe('ana@empresa.com.br');
  });
  it('desmarcado apaga o que estava guardado', () => {
    const s = memoria();
    guardarEmailLembrado('ana@empresa.com.br', true, s);
    guardarEmailLembrado('ana@empresa.com.br', false, s);
    expect(lerEmailLembrado(s)).toBeNull();
  });
  it('e-mail vazio não é guardado', () => {
    const s = memoria();
    guardarEmailLembrado('   ', true, s);
    expect(lerEmailLembrado(s)).toBeNull();
  });
  it('armazenamento bloqueado ou ausente não lança', () => {
    expect(() => guardarEmailLembrado('a@b.com', true, quebrado)).not.toThrow();
    expect(lerEmailLembrado(quebrado)).toBeNull();
    expect(lerEmailLembrado(null)).toBeNull();
  });
});
