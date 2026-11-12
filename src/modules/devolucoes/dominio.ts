/** Vocabulário das devoluções (spec §5.1 a §5.3). Sem imports com "@/": o drizzle-kit lê este arquivo pelo schema. */

export const CANAIS = ['MERCADO_LIVRE', 'AMAZON', 'SHOPEE', 'MAGALU', 'TIKTOK_SHOP', 'SHEIN'] as const;
export type Canal = (typeof CANAIS)[number];
export const ROTULO_CANAL: Record<Canal, string> = {
  MERCADO_LIVRE: 'Mercado Livre',
  AMAZON: 'Amazon',
  SHOPEE: 'Shopee',
  MAGALU: 'Magalu',
  TIKTOK_SHOP: 'TikTok Shop',
  SHEIN: 'Shein',
};
export function ehCanal(texto: string): texto is Canal {
  return (CANAIS as readonly string[]).includes(texto);
}

export const ORIGENS = ['API', 'MANUAL', 'PLANILHA'] as const;
export type Origem = (typeof ORIGENS)[number];
export const ROTULO_ORIGEM: Record<Origem, string> = {
  API: 'Automática (API do canal)',
  MANUAL: 'Cadastro manual',
  PLANILHA: 'Planilha',
};

export const TIPOS_DEVOLUCAO = ['DEVOLUCAO', 'TROCA'] as const;
export type TipoDevolucao = (typeof TIPOS_DEVOLUCAO)[number];
export const ROTULO_TIPO: Record<TipoDevolucao, string> = { DEVOLUCAO: 'Devolução', TROCA: 'Troca' };

/** Status do pacote (spec §5.2). */
export const STATUS_DEVOLUCAO = [
  'PENDENTE_CHEGADA',
  'AGUARDANDO_CONFERENCIA',
  'EM_CONFERENCIA',
  'AGUARDANDO_NF',
  'CONCLUIDA',
  'CANCELADA',
  'EXTRAVIADA',
  'NO_CD_MARKETPLACE',
] as const;
export type StatusDevolucao = (typeof STATUS_DEVOLUCAO)[number];
export const ROTULO_STATUS: Record<StatusDevolucao, string> = {
  PENDENTE_CHEGADA: 'Pendente de chegada',
  AGUARDANDO_CONFERENCIA: 'Aguardando conferência',
  EM_CONFERENCIA: 'Em conferência',
  AGUARDANDO_NF: 'Aguardando NF',
  CONCLUIDA: 'Concluída',
  CANCELADA: 'Cancelada',
  EXTRAVIADA: 'Extraviada',
  NO_CD_MARKETPLACE: 'No CD do marketplace',
};
export function ehStatus(texto: string): texto is StatusDevolucao {
  return (STATUS_DEVOLUCAO as readonly string[]).includes(texto);
}
/** Para textos vindos do histórico: o rótulo quando é um status, o próprio texto quando não é. */
export function rotuloStatus(texto: string): string {
  return ehStatus(texto) ? ROTULO_STATUS[texto] : texto;
}

/** Status de cada unidade (spec §5.3). Na Fase 1 todo item nasce e fica PENDENTE. */
export const STATUS_ITEM = [
  'PENDENTE',
  'AGUARDANDO_NF',
  'DISPONIVEL_VENDA',
  'EM_LOTE',
  'ENVIADO',
  'RESOLVIDO',
  'SEM_FORNECEDOR',
  'AUSENTE',
] as const;
export type StatusItem = (typeof STATUS_ITEM)[number];
export const ROTULO_STATUS_ITEM: Record<StatusItem, string> = {
  PENDENTE: 'Pendente',
  AGUARDANDO_NF: 'Aguardando NF',
  DISPONIVEL_VENDA: 'Disponível para venda',
  EM_LOTE: 'Em lote',
  ENVIADO: 'Enviado ao fornecedor',
  RESOLVIDO: 'Resolvido',
  SEM_FORNECEDOR: 'Sem fornecedor',
  AUSENTE: 'Ausente',
};

/** Coluna do quadro (etapa do PDF) de cada status. Os status de exceção não aparecem no quadro. */
export const ETAPA_DO_STATUS: Partial<Record<StatusDevolucao, number>> = {
  PENDENTE_CHEGADA: 1,
  AGUARDANDO_CONFERENCIA: 2,
  EM_CONFERENCIA: 3,
  AGUARDANDO_NF: 4,
};

export function statusDaEtapa(numero: number): StatusDevolucao[] {
  return STATUS_DEVOLUCAO.filter((s) => ETAPA_DO_STATUS[s] === numero);
}

/** Máximo de unidades de um mesmo SKU numa linha (formulário e planilha). */
export const LIMITE_QUANTIDADE = 50;
