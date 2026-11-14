'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { urlAutorizacaoFalsa } from '@/conectores/marketplace/mercadolivre/falso';
import { montarUrlAutorizacao } from '@/conectores/marketplace/mercadolivre/oauth';
import { obterDb } from '@/db';
import { exigirPermissao } from '@/modules/auth/servidor';
import { chaveCriptografia, configML, ErroConfiguracaoML, faltasConfigML } from '@/modules/mercado-livre/config';
import { desconectarConta } from '@/modules/mercado-livre/contas';
import { CAMINHO_RETORNO_ML, COOKIE_OAUTH_ML, criarEstadoOAuth, VALIDADE_ESTADO_MS } from '@/modules/mercado-livre/oauth-estado';

export type EstadoConta = { erros: string[] };

/** "Conectar conta do Mercado Livre" (spec §7.1): grava o state no cookie cifrado e manda o navegador ao ML. */
export async function conectarAcao(): Promise<EstadoConta> {
  const usuario = await exigirPermissao('administrar');
  const config = configML();
  const faltas = faltasConfigML(config);
  if (faltas.length > 0) return { erros: [`Faltam no servidor: ${faltas.join(', ')}.`] };
  let destino: string;
  try {
    const { cookie, state, challenge } = criarEstadoOAuth({ usuarioId: usuario.id, usarPkce: config.usarPkce, chave: chaveCriptografia(config), agora: new Date() });
    (await cookies()).set(COOKIE_OAUTH_ML, cookie, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: CAMINHO_RETORNO_ML,
      maxAge: VALIDADE_ESTADO_MS / 1000,
    });
    destino =
      config.modo === 'falso'
        ? urlAutorizacaoFalsa(state)
        : montarUrlAutorizacao({ clientId: config.clientId, redirectUri: config.redirectUri, state, codeChallenge: challenge ?? undefined });
  } catch (erro) {
    if (erro instanceof ErroConfiguracaoML) return { erros: [erro.message] };
    throw erro;
  }
  redirect(destino);
}

export async function desconectarAcao(): Promise<EstadoConta> {
  const usuario = await exigirPermissao('administrar');
  await desconectarConta(obterDb(), usuario, new Date());
  revalidatePath('/configuracoes/mercado-livre');
  redirect('/configuracoes/mercado-livre?ok=desconectada');
}
