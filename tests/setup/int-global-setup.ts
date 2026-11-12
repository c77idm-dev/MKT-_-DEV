import { migrar } from '../../src/db/migrate';
import { urlBancoTeste } from '../helpers/db';

export default async function aplicarMigracoes() {
  await migrar(urlBancoTeste());
}
