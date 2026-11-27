/**
 * Corrigir (Gestor) e Apagadas (extra, emenda E29, 27/11). Arquivo próprio: as chaves da retirada aqui não levam o
 * prefixo retirada_full_ (que é a regra só de `retiradas.ts`) para manter os nomes do plano da E29.
 */
export const ROTULOS_CORRECOES: Record<string, string> = {
  devolucao_apagada: 'Devolução apagada (Gestor)',
  devolucao_restaurada: 'Devolução restaurada (Gestor)',
  destino_trocado: 'Estoque do item trocado (Gestor)',
  conferencia_reaberta: 'Conferência reaberta (Gestor)',
  chegada_desfeita: 'Chegada desfeita (Gestor)',
  dados_corrigidos: 'Dados corrigidos (Gestor)',
  retirada_apagada: 'Retirada apagada (Gestor)',
  retirada_restaurada: 'Retirada restaurada (Gestor)',
  retirada_reaberta: 'Retirada reaberta (Gestor)',
};
