const MENSAGEM_OK: Record<string, string> = {
  conectada: 'Conta do Mercado Livre conectada.',
  desconectada: 'Conta do Mercado Livre desconectada.',
};

/** Texto do ?ok= da tela do ML. Só chaves próprias: "constructor" ou "__proto__" não podem virar prop de componente de cliente. */
export function mensagemOkConexao(chave: string): string | null {
  return Object.hasOwn(MENSAGEM_OK, chave) ? MENSAGEM_OK[chave] : null;
}
