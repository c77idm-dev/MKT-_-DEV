/**
 * Retirada do Full (melhoria 3): mercadoria da empresa voltando do armazém do Mercado Livre para o estoque.
 * Não é devolução. Sem imports com "@/": o drizzle-kit lê este arquivo pelo schema.
 */

export const SITUACOES_RETIRADA = ['ABERTA', 'CONFERIDA'] as const;
export type SituacaoRetirada = (typeof SITUACOES_RETIRADA)[number];

export const ROTULO_SITUACAO_RETIRADA: Record<SituacaoRetirada, string> = {
  ABERTA: 'Aberta',
  CONFERIDA: 'Conferida',
};

export const QUANTIDADE_MAXIMA = 9999;
export const TAMANHO_DESCRICAO = 120;
export const TAMANHO_ETIQUETA = 60;
export const TAMANHO_EAN = 50;

export function ehCodigoRetirada(codigo: string): boolean {
  return /^RF-\d{6,}$/.test(codigo);
}

/** Como o leitor manda (sem espaços, em maiúsculas), igual ao EAN lido na conferência. */
export function normalizarEan(bruto: string): string {
  return bruto.replace(/\s+/g, '').toUpperCase();
}

export type ItemLeitura = { id: string; produtoId: string | null; eanLido: string | null };
export type DecisaoLeitura = { tipo: 'somar'; itemId: string } | { tipo: 'novo_produto'; produtoId: string } | { tipo: 'pedir_descricao' };

/**
 * O que fazer com um EAN bipado. Produto do cadastro: soma no item do produto (ou cria). Fora do cadastro: soma no item
 * "sem cadastro" com o mesmo EAN, ou pede uma descrição curta para criar.
 */
export function decidirLeitura(itens: ItemLeitura[], ean: string, produtoId: string | null): DecisaoLeitura {
  if (produtoId) {
    const doProduto = itens.find((i) => i.produtoId === produtoId);
    return doProduto ? { tipo: 'somar', itemId: doProduto.id } : { tipo: 'novo_produto', produtoId };
  }
  const semCadastro = itens.find((i) => i.produtoId === null && i.eanLido === ean);
  return semCadastro ? { tipo: 'somar', itemId: semCadastro.id } : { tipo: 'pedir_descricao' };
}

/** "−" para em 1 (para tirar o item, "Remover"); "+" para em 9999. */
export function novaQuantidade(atual: number, delta: 1 | -1): number {
  return Math.min(QUANTIDADE_MAXIMA, Math.max(1, atual + delta));
}

export function validarDescricao(bruta: string): string | null {
  const texto = bruta.trim().replace(/\s+/g, ' ');
  return texto.length >= 1 && texto.length <= TAMANHO_DESCRICAO ? texto : null;
}

export function pendenciasParaConcluir(p: { fotoEtiqueta: boolean; itens: number }): string[] {
  const faltas: string[] = [];
  if (!p.fotoEtiqueta) faltas.push('Tire a foto da etiqueta.');
  if (p.itens < 1) faltas.push('Bipe pelo menos 1 produto.');
  return faltas;
}
