const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Evita mandar ao PostgreSQL um texto que não é UUID (ele responderia com erro em vez de "não achei"). */
export function ehUuid(texto: string): boolean {
  return UUID.test(texto);
}
