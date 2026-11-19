import { randomUUID } from 'node:crypto';
import { contasBitbrain, evidencias, reclamacoesMl } from '../../src/db/schema';
import { configML, type ConfigML } from '../../src/modules/mercado-livre/config';
import { processarResultadoConferencia } from '../../src/modules/mercado-livre/resultado';
import { contasFalsasTeste } from '../helpers/fabricas-bitbrain';
import { devolucaoMLConferidaTeste } from '../helpers/fabricas-ml';
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

/** Devolução do ML conferida sem problema, da Loja Falsa 1, com o "OK" pendente (modo bitbrain, §4.6). */
export async function okPendentePronto(): Promise<{ id: string; codigo: string }> {
  return comBanco(async (db) => {
    await contasFalsasTeste(db);
    const d = await devolucaoMLConferidaTeste(db, { itens: [{ sku: 'MLF-FONE-01', destino: 'BOM' }] });
    const reclamacaoId = d.externa?.reclamacaoId;
    if (!reclamacaoId) throw new Error('devolução sem reclamação');
    await db.insert(reclamacoesMl).values({ claimId: reclamacaoId, devolucaoId: d.id, conta: 'loja-falsa-1', sincronizadaEm: new Date() });
    await processarResultadoConferencia(db, d.id, new Date(), configBitbrainE2E());
    return { id: d.id, codigo: d.codigo };
  });
}

/** Foto PRONTA registrada no banco (sem o arquivo no disco): basta para a tela montar o link "Baixar". */
export async function fotoProntaSemArquivo(devolucaoId: string): Promise<void> {
  await comBanco(async (db) => {
    const id = randomUUID();
    await db.insert(evidencias).values({
      id,
      devolucaoId,
      itemId: null,
      tipo: 'FOTO_1_ETIQUETA',
      tipoConteudo: 'image/jpeg',
      caminho: `evidencias/${devolucaoId}/${id}.jpg`,
      provedor: 'disco',
      tamanhoOriginal: 10,
      tamanho: 10,
      sha256Original: '0'.repeat(64),
      sha256Final: '0'.repeat(64),
      situacaoProcessamento: 'PRONTA',
      idCliente: randomUUID(),
      processadoEm: new Date(),
    });
  });
}
