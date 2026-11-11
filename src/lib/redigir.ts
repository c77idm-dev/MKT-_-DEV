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
  'identifications',
  'invoice_key',
  'access_key',
]);

/** Quando o objeto pai é uma pessoa, a chave `name` dele também é dado pessoal. */
const PAIS_PESSOA = new Set(['buyer', 'recipient', 'receiver', 'payer', 'cardholder', 'contact', 'customer', 'destinatario']);

function redigirComPai<T>(valor: T, pai?: string): T {
  if (Array.isArray(valor)) return valor.map((item) => redigirComPai(item, pai)) as T;
  if (valor !== null && typeof valor === 'object') {
    return Object.fromEntries(
      Object.entries(valor).map(([chave, v]) => {
        const k = chave.toLowerCase();
        const pessoal = CHAVES_PESSOAIS.has(k) || (k === 'name' && pai !== undefined && PAIS_PESSOA.has(pai));
        return [chave, pessoal ? MARCA_REDIGIDO : redigirComPai(v, k)];
      }),
    ) as T;
  }
  return valor;
}

export function redigir<T>(valor: T): T {
  return redigirComPai(valor);
}
