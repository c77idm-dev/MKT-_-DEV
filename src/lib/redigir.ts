export const MARCA_REDIGIDO = '[REDIGIDO]';

/** Chaves com dados pessoais nas respostas do ML. O valor inteiro (texto ou objeto) é trocado pela marca. */
const CHAVES_PESSOAIS = new Set([
  'first_name',
  'last_name',
  'nickname',
  'email',
  'phone',
  'phones',
  'secondary_phone',
  'alternative_phone',
  'doc_number',
  'identification',
  'address_line',
  'street_name',
  'street_number',
  'zip_code',
  'receiver_name',
  'receiver_phone',
  'latitude',
  'longitude',
  'comment',
  'billing_info',
  'full_name',
  'buyer_name',
  'comments',
  'address',
  'receiver_address',
  'street',
  'apartment',
  'floor',
  'neighborhood',
  'document',
  'cpf',
  'cnpj',
  'tax_id',
]);

export function redigir<T>(valor: T): T {
  if (Array.isArray(valor)) return valor.map((item) => redigir(item)) as T;
  if (valor !== null && typeof valor === 'object') {
    return Object.fromEntries(
      Object.entries(valor).map(([chave, v]) => [chave, CHAVES_PESSOAIS.has(chave.toLowerCase()) ? MARCA_REDIGIDO : redigir(v)]),
    ) as T;
  }
  return valor;
}
