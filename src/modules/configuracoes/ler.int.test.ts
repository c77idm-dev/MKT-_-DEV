import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { configuracoes } from '@/db/schema';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { CONFIGURACAO_PADRAO, lerConfiguracao } from './ler';

const { db, sql } = criarDbTeste();
beforeEach(async () => {
  await limparTabelas(sql);
});
afterAll(async () => {
  await sql.end();
});

describe('lerConfiguracao (contrato §5.6)', () => {
  it('devolve os padrões quando a linha ainda não existe', async () => {
    expect(await lerConfiguracao(db)).toEqual(CONFIGURACAO_PADRAO);
    expect(CONFIGURACAO_PADRAO).toMatchObject({ videoObrigatorio: 'SEMPRE', mesesRetencaoMidia: 12, ambienteNfe: 'HOMOLOGACAO', regimeTributario: null });
  });

  it('lê a linha gravada', async () => {
    await db.insert(configuracoes).values({ id: 1, videoObrigatorio: 'SO_PROBLEMA', mesesRetencaoMidia: 6 });
    const c = await lerConfiguracao(db);
    expect(c.videoObrigatorio).toBe('SO_PROBLEMA');
    expect(c.mesesRetencaoMidia).toBe(6);
    expect(c.ambienteNfe).toBe('HOMOLOGACAO');
  });
});
