export type Etapa = { numero: 1 | 2 | 3 | 4 | 5; titulo: string };

/** As 5 etapas do organograma do PDF, com os nomes exatamente como no documento. */
export const ETAPAS: readonly Etapa[] = [
  { numero: 1, titulo: 'Pedidos Pendentes de Chegada' },
  { numero: 2, titulo: 'Pedidos Chegados - Aguardando Conferência' },
  { numero: 3, titulo: 'Em Conferência / Triagem & Registro de Evidências' },
  { numero: 4, titulo: 'Destinação Fiscal e Estoque' },
  { numero: 5, titulo: 'Agrupamento por Fornecedor (Remessas)' },
];
