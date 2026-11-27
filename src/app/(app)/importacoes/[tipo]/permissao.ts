import { exigirOuBancada, exigirPermissao } from '@/modules/auth/servidor';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import type { DefinicaoImportacao } from '@/modules/importacao/definicao';

/**
 * A permissão de cada importação, nas páginas e nas ações do servidor. (E29) A de devoluções (`cadastrar_devolucoes`) leva
 * o Operador à Bancada; a de produtos e fornecedores continua com o "não encontrada" do `exigirPermissao`.
 */
export function exigirDaImportacao(def: Pick<DefinicaoImportacao, 'acao'>): Promise<UsuarioSessao> {
  return def.acao === 'cadastrar_devolucoes' ? exigirOuBancada(def.acao) : exigirPermissao(def.acao);
}
