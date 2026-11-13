import { createHash } from 'node:crypto';
import { ErroCifra, lerChave } from '@/lib/cifra';
import { lerEnv } from '@/lib/env';

export type ModoML = 'api' | 'falso';
export type ConfigML = {
  modo: ModoML;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  usarPkce: boolean;
  chaveBase64: string;
};

export class ErroConfiguracaoML extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroConfiguracaoML';
  }
}

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : '';
}

/**
 * Único lugar que lê as variáveis do ML (declaradas pela P2 em src/lib/env.ts). Aceita `unknown` de propósito: se a P2
 * tipou ML_USAR_PKCE como booleano ou texto, os dois funcionam.
 */
export function configML(env: Record<string, unknown> = lerEnv()): ConfigML {
  const pkce: unknown = env.ML_USAR_PKCE;
  return {
    modo: texto(env.ML_CONECTOR) === 'falso' ? 'falso' : 'api',
    clientId: texto(env.ML_CLIENT_ID),
    clientSecret: texto(env.ML_CLIENT_SECRET),
    redirectUri: texto(env.ML_REDIRECT_URI),
    usarPkce: pkce === true || texto(pkce) === 'true',
    chaveBase64: texto(env.CHAVE_CRIPTOGRAFIA),
  };
}

/** Só para o modo falso (que o lerEnv recusa em produção, D17), quando o .env não traz uma chave. */
const CHAVE_DESENVOLVIMENTO = createHash('sha256').update('devolucoes-ml-falso-desenvolvimento').digest();

export function chaveCriptografia(c: ConfigML): Buffer {
  if (c.chaveBase64) {
    try {
      return lerChave(c.chaveBase64);
    } catch (erro) {
      if (erro instanceof ErroCifra) throw new ErroConfiguracaoML(erro.message);
      throw erro;
    }
  }
  if (c.modo === 'falso') return CHAVE_DESENVOLVIMENTO;
  throw new ErroConfiguracaoML('Defina CHAVE_CRIPTOGRAFIA no .env (32 bytes em base64).');
}

/** O que falta no servidor para conectar a conta real (a tela mostra a lista). */
export function faltasConfigML(c: ConfigML): string[] {
  if (c.modo === 'falso') return [];
  const faltas: string[] = [];
  if (!c.clientId) faltas.push('ML_CLIENT_ID');
  if (!c.clientSecret) faltas.push('ML_CLIENT_SECRET');
  if (!c.redirectUri) faltas.push('ML_REDIRECT_URI');
  if (!c.chaveBase64) faltas.push('CHAVE_CRIPTOGRAFIA');
  return faltas;
}
