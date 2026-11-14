import { ErroML } from '@/conectores/marketplace/mercadolivre/cliente';
import { codigoErroML, logErroML } from '@/conectores/marketplace/mercadolivre/erros';
import { trocarCodigo, type TokensML } from '@/conectores/marketplace/mercadolivre/oauth';
import type { DbOuTx } from '@/db/client';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import type { Fila } from '@/modules/fila/fila';
import { chaveCriptografia, ErroConfiguracaoML, type ConfigML } from './config';
import { conectarConta, ErroContaML } from './contas';
import { lerEstadoOAuth, mesmoState } from './oauth-estado';

export const ERROS_CONEXAO = ['estado', 'negada', 'sem_codigo', 'colaborador', 'outra_conta', 'troca', 'configuracao'] as const;
export type ErroConexao = (typeof ERROS_CONEXAO)[number];

export const MENSAGEM_ERRO_CONEXAO: Record<ErroConexao, string> = {
  estado: 'O pedido de conexão venceu ou não é deste navegador. Toque em "Conectar" de novo.',
  negada: 'A autorização foi cancelada no Mercado Livre.',
  sem_codigo: 'O Mercado Livre não devolveu o código de autorização. Tente de novo.',
  colaborador: 'Entre com a conta administradora principal do Mercado Livre (conta de colaborador não serve).',
  outra_conta: 'Já existe outra conta do Mercado Livre conectada. Desconecte-a antes.',
  troca: 'O Mercado Livre recusou a autorização. Tente de novo em alguns minutos.',
  configuracao: 'A integração não está configurada no servidor (veja CHAVE_CRIPTOGRAFIA no .env).',
};

export function ehErroConexao(texto: string): texto is ErroConexao {
  return (ERROS_CONEXAO as readonly string[]).includes(texto);
}

/** Retorno do OAuth (spec §7.1): confere o state, troca o código, grava a conta cifrada e pede a primeira varredura. */
export async function concluirConexaoML(
  db: DbOuTx,
  fila: Fila,
  p: { cookie: string | undefined; parametros: URLSearchParams; usuario: UsuarioSessao; config: ConfigML; fetchFn: typeof fetch; agora: Date },
): Promise<'conectada' | ErroConexao> {
  let chave: Buffer;
  try {
    chave = chaveCriptografia(p.config);
  } catch (erro) {
    if (erro instanceof ErroConfiguracaoML) return 'configuracao';
    throw erro;
  }
  const estado = lerEstadoOAuth(p.cookie, chave, p.agora);
  if (!estado || estado.usuarioId !== p.usuario.id || !mesmoState(estado.state, p.parametros.get('state'))) return 'estado';
  if (p.parametros.get('error')) return 'negada';
  const code = p.parametros.get('code');
  if (!code) return 'sem_codigo';
  let tokens: TokensML;
  try {
    tokens = await trocarCodigo({
      clientId: p.config.clientId,
      clientSecret: p.config.clientSecret,
      code,
      redirectUri: p.config.redirectUri,
      codeVerifier: estado.verifier ?? undefined,
      fetchFn: p.fetchFn,
      agora: p.agora,
    });
  } catch (erro) {
    if (!(erro instanceof ErroML)) throw erro;
    logErroML('trocar o código do OAuth', erro);
    return codigoErroML(erro) === 'invalid_operator_user_id' ? 'colaborador' : 'troca';
  }
  try {
    await conectarConta(db, tokens, p.usuario, p.config, p.agora);
  } catch (erro) {
    if (erro instanceof ErroContaML) return 'outra_conta';
    throw erro;
  }
  await fila.enviar('ml.varredura', {});
  return 'conectada';
}
