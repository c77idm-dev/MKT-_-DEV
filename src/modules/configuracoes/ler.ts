import { eq } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { configuracoes } from '@/db/schema';
import { MESES_RETENCAO_PADRAO } from './dominio';

export type Configuracao = typeof configuracoes.$inferSelect;

/** O que vale enquanto ninguém salvou as Configurações (os padrões da spec §5.1). */
export const CONFIGURACAO_PADRAO: Configuracao = {
  id: 1,
  razaoSocial: null,
  cnpj: null,
  ie: null,
  logradouro: null,
  numero: null,
  complemento: null,
  bairro: null,
  cidade: null,
  uf: null,
  cep: null,
  regimeTributario: null,
  serieNfe: null,
  ambienteNfe: 'HOMOLOGACAO',
  videoObrigatorio: 'SEMPRE',
  mesesRetencaoMidia: MESES_RETENCAO_PADRAO,
  atualizadoPor: null,
  atualizadoEm: null,
};

export async function lerConfiguracao(db: DbOuTx): Promise<Configuracao> {
  const [linha] = await db.select().from(configuracoes).where(eq(configuracoes.id, 1)).limit(1);
  return linha ?? CONFIGURACAO_PADRAO;
}
