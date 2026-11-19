import { EMPRESAS_FALSAS } from '@/conectores/marketplace/bitbrain/falso';
import type { DbOuTx } from '@/db/client';
import { contasBitbrain } from '@/db/schema';
import { TOKEN_BITBRAIN_FALSO, URL_BITBRAIN_FALSO } from '@/lib/env';
import type { ConfigML } from '@/modules/mercado-livre/config';
import { configMLTeste } from './fabricas-ml';

/** Config do modo bitbrain com o Bitbrain falso (D3). Sem vitest: o e2e também importa este arquivo. */
export function configBitbrainTeste(mudancas: Partial<ConfigML> = {}): ConfigML {
  return configMLTeste({ modo: 'bitbrain', bitbrainUrl: URL_BITBRAIN_FALSO, bitbrainToken: TOKEN_BITBRAIN_FALSO, permitirFalsos: true, ...mudancas });
}

/** As contas do Bitbrain falso no banco; as de `recebe` já marcadas. */
export async function contasFalsasTeste(db: DbOuTx, p: { recebe?: string[] } = {}): Promise<void> {
  for (const e of EMPRESAS_FALSAS) {
    const recebeDevolucoes = (p.recebe ?? []).includes(e.empresa);
    await db
      .insert(contasBitbrain)
      .values({ empresa: e.empresa, nome: e.nome, sellerId: e.seller_id, recebeDevolucoes })
      .onConflictDoUpdate({ target: contasBitbrain.empresa, set: { recebeDevolucoes, disponivel: true } });
  }
}
