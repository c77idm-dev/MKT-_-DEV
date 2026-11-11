import { hash, verify } from '@node-rs/argon2';

export const TAMANHO_MINIMO_SENHA = 8;

/** argon2id com os parâmetros padrão da biblioteca (m=19456, t=2, p=1), que seguem a recomendação da OWASP. */
export async function gerarHashSenha(senha: string): Promise<string> {
  if (senha.length < TAMANHO_MINIMO_SENHA) {
    throw new Error(`A senha precisa ter pelo menos ${TAMANHO_MINIMO_SENHA} caracteres`);
  }
  return hash(senha);
}

export async function verificarSenha(hashArmazenado: string, senha: string): Promise<boolean> {
  try {
    return await verify(hashArmazenado, senha);
  } catch {
    return false;
  }
}
