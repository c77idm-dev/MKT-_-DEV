import { describe, expect, it } from 'vitest';
import { novoIdCliente, uuidDeBytes } from './idCliente';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('id do envio (idempotência no servidor)', () => {
  it('é um UUID v4', () => {
    expect(novoIdCliente()).toMatch(UUID_V4);
  });

  it('sem crypto.randomUUID (HTTP fora de localhost), monta o UUID v4 dos bytes', () => {
    expect(uuidDeBytes(new Uint8Array(16).fill(0xff))).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
  });
});
