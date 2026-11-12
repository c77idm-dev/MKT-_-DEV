/** Minúsculas, sem acentos, só letras e números separados por um espaço. Usado para comparar nomes de coluna e de canal. */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Escapa %, _ e \ para usar o texto digitado dentro de LIKE/ILIKE. */
export function escaparLike(texto: string): string {
  return texto.replace(/[\\%_]/g, (c) => `\\${c}`);
}
