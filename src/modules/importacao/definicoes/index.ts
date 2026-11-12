import type { DefinicaoImportacao } from '../definicao';
import { ehTipoImportacao, type TipoImportacao } from '../tipos';
import { definicaoFornecedores } from './fornecedores';
import { definicaoProdutos } from './produtos';

const DEFINICOES: Partial<Record<TipoImportacao, DefinicaoImportacao>> = {
  produtos: definicaoProdutos,
  fornecedores: definicaoFornecedores,
};

export function obterDefinicao(tipo: string): DefinicaoImportacao | null {
  return ehTipoImportacao(tipo) ? (DEFINICOES[tipo] ?? null) : null;
}
