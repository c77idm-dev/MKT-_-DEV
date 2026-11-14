import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** Spec §10: AES-256-GCM, IV de 12 bytes. Formato: v1.<iv>.<tag>.<dados>, cada parte em base64url (sem ".", serve em cookie). */
const VERSAO = 'v1';

export class ErroCifra extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroCifra';
  }
}

export function lerChave(base64: string): Buffer {
  const chave = Buffer.from(base64.trim(), 'base64');
  if (chave.length !== 32) {
    throw new ErroCifra(
      'CHAVE_CRIPTOGRAFIA deve ter 32 bytes em base64. Gere com: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
    );
  }
  return chave;
}

export function cifrar(texto: string, chave: Buffer): string {
  const iv = randomBytes(12);
  const cifra = createCipheriv('aes-256-gcm', chave, iv);
  const dados = Buffer.concat([cifra.update(texto, 'utf8'), cifra.final()]);
  return [VERSAO, iv.toString('base64url'), cifra.getAuthTag().toString('base64url'), dados.toString('base64url')].join('.');
}

export function decifrar(cifrado: string, chave: Buffer): string {
  const [versao, iv, tag, dados] = cifrado.split('.');
  if (versao !== VERSAO || !iv || !tag || dados === undefined) throw new ErroCifra('Texto cifrado em formato desconhecido.');
  try {
    const decifra = createDecipheriv('aes-256-gcm', chave, Buffer.from(iv, 'base64url'));
    decifra.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decifra.update(Buffer.from(dados, 'base64url')), decifra.final()]).toString('utf8');
  } catch {
    throw new ErroCifra('Não foi possível decifrar (chave errada ou texto alterado).');
  }
}
