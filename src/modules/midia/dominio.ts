/** Vocabulário das evidências (spec §5.1, §6.3 e §9). Sem imports com "@/": o drizzle-kit lê este arquivo pelo schema. */

export const TIPOS_EVIDENCIA = [
  'FOTO_1_ETIQUETA',
  'FOTO_2_EMBALAGEM',
  'FOTO_3_PRODUTO',
  'FOTO_4_CODIGO_SERIAL',
  'VIDEO_PROVA',
  'EXTRA',
] as const;
export type TipoEvidencia = (typeof TIPOS_EVIDENCIA)[number];

/** Os nomes do PDF. */
export const ROTULO_EVIDENCIA: Record<TipoEvidencia, string> = {
  FOTO_1_ETIQUETA: 'Foto 1',
  FOTO_2_EMBALAGEM: 'Foto 2',
  FOTO_3_PRODUTO: 'Foto 3',
  FOTO_4_CODIGO_SERIAL: 'Foto 4',
  VIDEO_PROVA: 'Vídeo de Prova',
  EXTRA: 'Extra',
};

/** O que cada evidência mostra (spec §6.3). */
export const DESCRICAO_EVIDENCIA: Record<TipoEvidencia, string> = {
  FOTO_1_ETIQUETA: 'Etiqueta de rastreio e declaração de conteúdo',
  FOTO_2_EMBALAGEM: 'Estado da embalagem externa',
  FOTO_3_PRODUTO: 'Produto fora da caixa (visão geral)',
  FOTO_4_CODIGO_SERIAL: 'Código de barras, nº de série (S/N) e lote/validade',
  VIDEO_PROVA: 'Vídeo contínuo do teste de funcionamento ou do defeito/avaria',
  EXTRA: 'Foto adicional',
};

/** Fotos 1 e 2 e o Vídeo de Prova são do pacote; Fotos 3 e 4 são de cada unidade (spec §3, "Evidências"). */
export const EVIDENCIAS_DO_PACOTE = ['FOTO_1_ETIQUETA', 'FOTO_2_EMBALAGEM'] as const;
export const EVIDENCIAS_DO_ITEM = ['FOTO_3_PRODUTO', 'FOTO_4_CODIGO_SERIAL'] as const;

export function ehTipoEvidencia(texto: string): texto is TipoEvidencia {
  return (TIPOS_EVIDENCIA as readonly string[]).includes(texto);
}

export function ehFoto(tipo: TipoEvidencia): boolean {
  return tipo !== 'VIDEO_PROVA';
}

export const SITUACOES_PROCESSAMENTO = ['RECEBIDA', 'PROCESSANDO', 'PRONTA', 'FALHOU', 'APAGADA'] as const;
export type SituacaoProcessamento = (typeof SITUACOES_PROCESSAMENTO)[number];
export const ROTULO_SITUACAO_PROCESSAMENTO: Record<SituacaoProcessamento, string> = {
  RECEBIDA: 'Recebida',
  PROCESSANDO: 'Processando',
  PRONTA: 'Pronta',
  FALHOU: 'Falhou',
  APAGADA: 'Apagada (prazo de guarda)',
};
