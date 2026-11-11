import { describe, expect, it } from 'vitest';
import { MARCA_REDIGIDO, redigir } from './redigir';

describe('redigir', () => {
  it('troca dados pessoais em qualquer nível, inclusive dentro de listas', () => {
    const entrada = {
      id: 10,
      status: 'delivered',
      buyer: { id: 5, first_name: 'Ana', last_name: 'Souza', email: 'ana@x.com' },
      shipments: [
        {
          destination: {
            name: 'seller_address',
            receiver_name: 'Ana Souza',
            shipping_address: { street_name: 'Rua A', street_number: '10', zip_code: '01000-000', city: { name: 'São Paulo' } },
          },
        },
      ],
      identification: { type: 'CPF', number: '12345678900' },
    };

    expect(redigir(entrada)).toEqual({
      id: 10,
      status: 'delivered',
      buyer: { id: 5, first_name: MARCA_REDIGIDO, last_name: MARCA_REDIGIDO, email: MARCA_REDIGIDO },
      shipments: [
        {
          destination: {
            name: 'seller_address',
            receiver_name: MARCA_REDIGIDO,
            shipping_address: {
              street_name: MARCA_REDIGIDO,
              street_number: MARCA_REDIGIDO,
              zip_code: MARCA_REDIGIDO,
              city: { name: 'São Paulo' },
            },
          },
        },
      ],
      identification: MARCA_REDIGIDO,
    });
  });

  it('não altera valores simples', () => {
    expect(redigir('texto')).toBe('texto');
    expect(redigir(null)).toBeNull();
  });

  it('redige as chaves pessoais de pedidos, reivindicações e envios, e preserva destination.name e city.name', () => {
    const entrada = {
      full_name: 'Ana Souza',
      buyer_name: 'Ana',
      comments: 'x',
      address: { line: 'Rua A' },
      receiver_address: { id: 1 },
      street: 'Rua A',
      apartment: '12',
      floor: '3',
      neighborhood: 'Centro',
      document: '123',
      cpf: '12345678900',
      cnpj: '00000000000100',
      tax_id: 'X',
      destination: { name: 'seller_address' },
      city: { name: 'São Paulo' },
    };

    expect(redigir(entrada)).toEqual({
      full_name: MARCA_REDIGIDO,
      buyer_name: MARCA_REDIGIDO,
      comments: MARCA_REDIGIDO,
      address: MARCA_REDIGIDO,
      receiver_address: MARCA_REDIGIDO,
      street: MARCA_REDIGIDO,
      apartment: MARCA_REDIGIDO,
      floor: MARCA_REDIGIDO,
      neighborhood: MARCA_REDIGIDO,
      document: MARCA_REDIGIDO,
      cpf: MARCA_REDIGIDO,
      cnpj: MARCA_REDIGIDO,
      tax_id: MARCA_REDIGIDO,
      destination: { name: 'seller_address' },
      city: { name: 'São Paulo' },
    });
  });
});
