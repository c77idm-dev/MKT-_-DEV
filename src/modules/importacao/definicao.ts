import type { DbOuTx } from '@/db/client';
import type { Acao } from '@/modules/auth/permissoes';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import type { CampoImportacao, LinhaMapeada } from './mapeamento';
import type { LinhaPulada, TipoImportacao } from './tipos';

export type LinhaPrevia = LinhaMapeada & { erros: string[]; avisos: string[] };

/** O que muda de um tipo de importação para outro. O fluxo (envio → colunas → prévia → confirmação) é o mesmo. */
export type DefinicaoImportacao = {
  tipo: TipoImportacao;
  titulo: string;
  /** Texto do link de volta (o nome da tela para onde ele leva). */
  rotuloVoltar: string;
  /** Permissão exigida (spec §6.9). */
  acao: Acao;
  /** Lista para onde o usuário volta. */
  voltarPara: string;
  rotuloCriados: string;
  /** null quando a importação só cria. */
  rotuloAtualizados: string | null;
  campos: readonly CampoImportacao[];
  validar(db: DbOuTx, linhas: LinhaMapeada[]): Promise<LinhaPrevia[]>;
  /** Recebe só linhas sem erro e roda dentro da transação da confirmação. */
  aplicar(db: DbOuTx, linhas: LinhaPrevia[], usuario: UsuarioSessao): Promise<{ criados: number; atualizados: number; puladas?: LinhaPulada[] }>;
};

export function dadosOuErro<T>(resultado: { dados: T | null; erros: string[] }, numeroLinha: number): T {
  if (!resultado.dados) throw new Error(`Linha ${numeroLinha} inválida: ${resultado.erros.join('; ')}`);
  return resultado.dados;
}
