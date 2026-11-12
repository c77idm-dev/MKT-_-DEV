import type { DefinicaoImportacao } from '../definicao';
import { ehTipoImportacao, type TipoImportacao } from '../tipos';
import { definicaoDevolucoes } from './devolucoes';
import { definicaoFornecedores } from './fornecedores';
import { definicaoProdutos } from './produtos';

const DEFINICOES: Record<TipoImportacao, DefinicaoImportacao> = {
  produtos: definicaoProdutos,
  fornecedores: definicaoFornecedores,
  devolucoes: definicaoDevolucoes,
};

export function obterDefinicao(tipo: string): DefinicaoImportacao | null {
  return ehTipoImportacao(tipo) ? DEFINICOES[tipo] : null;
}
