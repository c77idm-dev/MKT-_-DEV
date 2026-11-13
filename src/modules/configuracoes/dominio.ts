/** Vocabulário das Configurações (spec §5.1). Sem imports com "@/": o drizzle-kit lê este arquivo pelo schema. */

export const VIDEO_OBRIGATORIO = ['SEMPRE', 'SO_PROBLEMA'] as const;
export type VideoObrigatorio = (typeof VIDEO_OBRIGATORIO)[number];
export const ROTULO_VIDEO_OBRIGATORIO: Record<VideoObrigatorio, string> = {
  SEMPRE: 'Sempre',
  SO_PROBLEMA: 'Só quando alguma unidade for para o Estoque Problema ou estiver ausente',
};

export const REGIMES_TRIBUTARIOS = ['SIMPLES', 'PRESUMIDO', 'REAL'] as const;
export type RegimeTributario = (typeof REGIMES_TRIBUTARIOS)[number];
export const ROTULO_REGIME: Record<RegimeTributario, string> = {
  SIMPLES: 'Simples Nacional',
  PRESUMIDO: 'Lucro Presumido',
  REAL: 'Lucro Real',
};

export const AMBIENTES_NFE = ['HOMOLOGACAO', 'PRODUCAO'] as const;
export type AmbienteNfe = (typeof AMBIENTES_NFE)[number];
/** O texto da tela Configurações › Fiscal (Fase 4); a Fase 4 reexporta, não redefine (contrato §10, E2). */
export const ROTULO_AMBIENTE: Record<AmbienteNfe, string> = { HOMOLOGACAO: 'Homologação (sem valor fiscal)', PRODUCAO: 'Produção' };

/** Prazo de guarda das mídias (spec §9): padrão de 12 meses. */
export const MESES_RETENCAO_PADRAO = 12;
