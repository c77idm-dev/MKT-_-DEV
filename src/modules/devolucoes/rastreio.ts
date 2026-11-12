/** O rastreio é guardado e comparado sem espaços e em maiúsculas (leitor, teclado e planilha chegam iguais). */
export function normalizarRastreio(texto: string): string {
  return texto.replace(/\s+/g, '').toUpperCase();
}
