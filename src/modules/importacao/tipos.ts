/** Tipos de importação de planilha (spec §6.1 e §6.8). Sem imports com "@/": o drizzle-kit lê este arquivo pelo schema. */
export const TIPOS_IMPORTACAO = ['produtos', 'fornecedores', 'devolucoes'] as const;
export type TipoImportacao = (typeof TIPOS_IMPORTACAO)[number];

/** Campo do sistema → nome da coluna da planilha (null quando o campo não vem na planilha). */
export type Mapeamento = Record<string, string | null>;

export type LinhaPulada = { linha: number; erro: string };

export type ResumoImportacao = {
  criados: number;
  atualizados: number;
  ignorados: number;
  linhasComErro: number[];
  /** Linhas que passaram na prévia mas foram recusadas na gravação, com o motivo. */
  puladas?: LinhaPulada[];
};

export function ehTipoImportacao(texto: string): texto is TipoImportacao {
  return (TIPOS_IMPORTACAO as readonly string[]).includes(texto);
}
