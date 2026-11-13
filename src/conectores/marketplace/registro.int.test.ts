import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { contasMarketplace } from '@/db/schema';
import { obterConectorML } from '@/modules/mercado-livre/conector';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { contaMLTeste } from '../../../tests/helpers/fabricas-ml';
import { ConectorML } from './mercadolivre/conector';
import { definirConectorParaTestes, obterConector } from './registro';
import type { MarketplaceConnector } from './tipos';

const { db, sql } = criarDbTeste();
beforeEach(async () => {
  await limparTabelas(sql);
});
afterEach(() => {
  definirConectorParaTestes('MERCADO_LIVRE', null);
});
afterAll(async () => {
  await sql.end();
});

describe('obterConector (contrato §5.3)', () => {
  it('sem conta ATIVA: null', async () => {
    expect(await obterConector(db, 'MERCADO_LIVRE')).toBeNull();
  });

  it('com conta ATIVA: o ConectorML do vendedor; outro canal: null', async () => {
    await contaMLTeste(db);
    const conector = await obterConector(db, 'MERCADO_LIVRE');
    expect(conector).toBeInstanceOf(ConectorML);
    expect((conector as ConectorML).sellerId).toBe('123456789');
    expect(await obterConectorML(db)).toBeInstanceOf(ConectorML);
    expect(await obterConector(db, 'SHOPEE')).toBeNull();
  });

  it('conta em RECONECTAR: null (spec §7.1)', async () => {
    const { contaId } = await contaMLTeste(db);
    await db.update(contasMarketplace).set({ situacao: 'RECONECTAR' }).where(eq(contasMarketplace.id, contaId));
    expect(await obterConector(db, 'MERCADO_LIVRE')).toBeNull();
  });

  it('definirConectorParaTestes substitui; com null, volta ao real', async () => {
    const substituto: MarketplaceConnector = {
      canal: 'MERCADO_LIVRE',
      listarAtualizadasDesde: () =>
        (async function* () {
          yield* [];
        })(),
      obter: async () => {
        throw new Error('não usado');
      },
      enviarResultadoConferencia: async () => {},
      obterXmlNotaVenda: async () => null,
    };
    definirConectorParaTestes('MERCADO_LIVRE', substituto);
    expect(await obterConector(db, 'MERCADO_LIVRE')).toBe(substituto);
    expect(await obterConectorML(db)).toBeNull();
    definirConectorParaTestes('MERCADO_LIVRE', null);
    expect(await obterConector(db, 'MERCADO_LIVRE')).toBeNull();
  });
});
