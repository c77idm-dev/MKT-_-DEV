import type { TokensML } from '@/conectores/marketplace/mercadolivre/oauth';
import type { DbOuTx } from '@/db/client';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import type { ConfigML } from '@/modules/mercado-livre/config';
import { conectarConta } from '@/modules/mercado-livre/contas';
import { criarUsuarioTeste } from './fabricas';

/** Fábricas da Fase 3 (contrato §3: cada fase tem as suas; fabricas.ts fica congelado). */
export const VENDEDOR_TESTE = '123456789';
const CHAVE_TESTE = Buffer.alloc(32, 7).toString('base64');

export function configMLTeste(mudancas: Partial<ConfigML> = {}): ConfigML {
  return {
    modo: 'falso',
    clientId: 'APP-TESTE',
    clientSecret: 'SEGREDO-TESTE',
    redirectUri: 'http://localhost/api/ml/retorno',
    usarPkce: false,
    chaveBase64: CHAVE_TESTE,
    ...mudancas,
  };
}

export function tokensTeste(mudancas: Partial<TokensML> = {}): TokensML {
  return {
    accessToken: 'APP_USR-FALSO-TESTE',
    refreshToken: 'TG-FALSO-TESTE',
    expiraEm: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
    userId: Number(VENDEDOR_TESTE),
    escopo: 'offline_access read write',
    ...mudancas,
  };
}

export async function contaMLTeste(
  db: DbOuTx,
  p: { config?: ConfigML; tokens?: TokensML; gestor?: UsuarioSessao } = {},
): Promise<{ contaId: string; gestor: UsuarioSessao }> {
  const gestor = p.gestor ?? (await criarUsuarioTeste(db, 'GESTOR'));
  const { contaId } = await conectarConta(db, p.tokens ?? tokensTeste(), gestor, p.config ?? configMLTeste(), new Date());
  return { contaId, gestor };
}
