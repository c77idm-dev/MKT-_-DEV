/** Monta um UUID v4 a partir de 16 bytes aleatórios. */
export function uuidDeBytes(b: Uint8Array): string {
  const bytes = Uint8Array.from(b);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = Array.from(bytes, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** Id do envio (o servidor não grava o mesmo duas vezes). crypto.randomUUID só existe em HTTPS ou localhost. */
export function novoIdCliente(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return uuidDeBytes(crypto.getRandomValues(new Uint8Array(16)));
}
