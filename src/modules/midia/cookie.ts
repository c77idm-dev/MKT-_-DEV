/** O mesmo nome de COOKIE_SESSAO em @/modules/auth/servidor (aquele arquivo só roda dentro do Next, por causa do next/headers). */
export const COOKIE_SESSAO = 'sessao';

export function lerCookie(cabecalho: string | null, nome: string): string | null {
  if (!cabecalho) return null;
  for (const parte of cabecalho.split(';')) {
    const i = parte.indexOf('=');
    if (i > 0 && parte.slice(0, i).trim() === nome) return parte.slice(i + 1).trim();
  }
  return null;
}
