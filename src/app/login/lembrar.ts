/**
 * "Lembrar de mim neste aparelho" (extra): guarda só o e-mail no `localStorage`, nunca a senha.
 * Todo acesso fica em `try/catch`: na navegação privada ou com o armazenamento bloqueado, o `localStorage`
 * pode lançar ou nem existir, e a tela de login tem de abrir e entrar do mesmo jeito.
 */
export const CHAVE_EMAIL_LEMBRADO = 'devolucoes:email-lembrado';

/** `undefined` usa o `localStorage` do navegador; `null` quer dizer "sem armazenamento". */
function resolver(armazenamento: Storage | null | undefined): Storage | null {
  if (armazenamento !== undefined) return armazenamento;
  return globalThis.localStorage ?? null;
}

export function lerEmailLembrado(armazenamento?: Storage | null): string | null {
  try {
    const s = resolver(armazenamento);
    const valor = s?.getItem(CHAVE_EMAIL_LEMBRADO)?.trim();
    return valor ? valor : null;
  } catch {
    return null;
  }
}

export function guardarEmailLembrado(email: string, lembrar: boolean, armazenamento?: Storage | null): void {
  try {
    const s = resolver(armazenamento);
    if (!s) return;
    const limpo = email.trim();
    if (lembrar && limpo) s.setItem(CHAVE_EMAIL_LEMBRADO, limpo);
    else s.removeItem(CHAVE_EMAIL_LEMBRADO);
  } catch {
    // Armazenamento bloqueado: segue sem lembrar.
  }
}
