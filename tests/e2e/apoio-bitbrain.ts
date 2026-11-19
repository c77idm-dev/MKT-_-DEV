import { contasBitbrain } from '../../src/db/schema';
import { configML, type ConfigML } from '../../src/modules/mercado-livre/config';
import { contasFalsasTeste } from '../helpers/fabricas-bitbrain';
import { comBanco } from './apoio';
import { ambienteE2E } from './dados';

/** O config do servidor do e2e no modo bitbrain (o processo dos testes lê o .env, que está em ML_CONECTOR=falso). */
export function configBitbrainE2E(): ConfigML {
  return configML({ ...process.env, ...ambienteE2E('bitbrain') });
}

/** Começa sem contas: a tela recria a lista pelo /empresas do Bitbrain falso, todas desmarcadas. */
export async function semContasBitbrain(): Promise<void> {
  await comBanco(async (db) => {
    await db.delete(contasBitbrain);
  });
}

/** As contas do Bitbrain falso no banco, com só esta marcada. */
export async function marcarContaFalsa(empresa: string): Promise<void> {
  await comBanco((db) => contasFalsasTeste(db, { recebe: [empresa] }));
}
