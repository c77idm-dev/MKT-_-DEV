/** Texto de um campo do FormData; vazio quando o campo falta ou é um arquivo. */
export function textoDoForm(dados: FormData, nome: string): string {
  const valor = dados.get(nome);
  return typeof valor === 'string' ? valor : '';
}
