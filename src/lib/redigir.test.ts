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
});
