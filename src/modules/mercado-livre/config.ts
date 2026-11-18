import { createHash } from 'node:crypto';
import { ErroCifra, lerChave } from '@/lib/cifra';
import { lerEnv } from '@/lib/env';

export type ModoML = 'api' | 'bitbrain' | 'falso';
export type ConfigML = {
  modo: ModoML;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  usarPkce: boolean;
  chaveBase64: string;
  /** Modo bitbrain: a base da rota do Bitbrain, sem a barra do fim. */
  bitbrainUrl: string;
  /** Modo bitbrain: o DEVOLUCOES_TOKEN do Bitbrain. Nunca vai para log. */
  bitbrainToken: string;
  /** PERMITIR_FALSOS=1 (só o e2e): libera o Bitbrain falso (D3). */
  permitirFalsos: boolean;
};

export class ErroConfiguracaoML extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroConfiguracaoML';
  }
}

function modoDe(valor: string): ModoML {
  return valor === 'falso' || valor === 'bitbrain' ? valor : 'api';
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
    modo: modoDe(texto(env.ML_CONECTOR)),
    clientId: texto(env.ML_CLIENT_ID),
    clientSecret: texto(env.ML_CLIENT_SECRET),
    redirectUri: texto(env.ML_REDIRECT_URI),
    usarPkce: pkce === true || texto(pkce) === 'true',
    chaveBase64: texto(env.CHAVE_CRIPTOGRAFIA),
    bitbrainUrl: texto(env.BITBRAIN_URL).replace(/\/+$/, ''),
    bitbrainToken: texto(env.BITBRAIN_TOKEN),
    permitirFalsos: texto(env.PERMITIR_FALSOS) === '1',
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
  if (c.modo === 'bitbrain') return [...(c.bitbrainUrl ? [] : ['BITBRAIN_URL']), ...(c.bitbrainToken ? [] : ['BITBRAIN_TOKEN'])];
  const faltas: string[] = [];
  if (!c.clientId) faltas.push('ML_CLIENT_ID');
  if (!c.clientSecret) faltas.push('ML_CLIENT_SECRET');
  if (!c.redirectUri) faltas.push('ML_REDIRECT_URI');
  if (!c.chaveBase64) faltas.push('CHAVE_CRIPTOGRAFIA');
  return faltas;
}
