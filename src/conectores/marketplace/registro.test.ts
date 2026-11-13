import { describe, expect, it } from 'vitest';
import type { DbOuTx } from '@/db/client';
import { definirConectorParaTestes, obterConector } from './registro';
import type { MarketplaceConnector } from './tipos';

const db = {} as DbOuTx;

describe('registro de conectores (contrato §5.3)', () => {
  it('sem integração, devolve null', async () => {
    expect(await obterConector(db, 'MERCADO_LIVRE')).toBeNull();
  });

  it('nos testes, devolve o conector definido para o canal; com null, volta ao padrão', async () => {
    const falso = { canal: 'MERCADO_LIVRE' } as MarketplaceConnector;
    definirConectorParaTestes('MERCADO_LIVRE', falso);
    expect(await obterConector(db, 'MERCADO_LIVRE')).toBe(falso);
    expect(await obterConector(db, 'SHOPEE')).toBeNull();
    definirConectorParaTestes('MERCADO_LIVRE', null);
    expect(await obterConector(db, 'MERCADO_LIVRE')).toBeNull();
  });
});
