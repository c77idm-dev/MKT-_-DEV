import { describe, expect, it } from 'vitest';
import { ROTULO_ACAO, rotuloDaAcao } from './eventos';
import { ROTULOS_ACABAMENTO } from './rotulos/acabamento';
import { ROTULOS_BASE } from './rotulos/base';
import { ROTULOS_CONFERENCIA } from './rotulos/conferencia';
import { ROTULOS_FISCAL } from './rotulos/fiscal';
import { ROTULOS_LOTES } from './rotulos/lotes';
import { ROTULOS_MERCADO_LIVRE } from './rotulos/mercado-livre';

const ARQUIVOS: Record<string, Record<string, string>> = {
  base: ROTULOS_BASE,
  conferencia: ROTULOS_CONFERENCIA,
  'mercado-livre': ROTULOS_MERCADO_LIVRE,
  fiscal: ROTULOS_FISCAL,
  lotes: ROTULOS_LOTES,
  acabamento: ROTULOS_ACABAMENTO,
};

// Chaves do contrato §4.7: todas as que os planos das Fases 2 a 6 usam. Os arquivos congelam depois da Parte A (§10, E3).
const RESERVADAS: Record<string, string[]> = {
  base: [
    'criada', 'criada_nao_identificada', 'recebida', 'identificada', 'cancelada', 'extraviada',
    'usuario_criado', 'perfil_alterado', 'usuario_desativado', 'usuario_reativado',
    'item_status', 'concluida', 'configuracao_alterada',
  ],
  conferencia: [
    'conferencia_iniciada', 'conferencia_interrompida', 'conferencia_trava_liberada', 'conferencia_concluida',
    'item_conferido', 'evidencia_enviada', 'evidencia_processada', 'evidencia_refeita', 'evidencia_falhou',
  ],
  'mercado-livre': [
    'ml_vinculada', 'ml_status_atualizado', 'ml_entregue', 'ml_no_cd', 'ml_reenviada_ao_vendedor', 'ml_status_apos_chegada',
    'ml_resultado_ok_enviado', 'ml_resultado_ok_recusado', 'ml_resultado_sem_vinculo',
    'ml_conta_conectada', 'ml_conta_reconectar', 'ml_conta_desconectada',
    'contestacao_criada', 'contestacao_revisada', 'contestacao_enviada', 'contestacao_falhou',
  ],
  fiscal: [
    'nf_solicitada', 'nf_autorizada', 'nf_rejeitada', 'nf_reenviada', 'nf_cancelada', 'nf_item_escolhido',
    'nota_venda_anexada', 'nota_venda_obtida_ml', 'nota_venda_removida', 'devolucao_reaberta',
  ],
  lotes: [
    'lote_criado', 'lote_item_incluido', 'lote_item_movido', 'lote_fechado', 'lote_reaberto',
    'lote_enviado', 'lote_resultado_registrado', 'lote_finalizado',
  ],
  acabamento: ['midia_apagada_retencao', 'tarefa_reenviada'],
};

describe('rótulos do histórico (contrato §4.7)', () => {
  it('cada arquivo traz as chaves reservadas, todas com rótulo', () => {
    for (const [area, chaves] of Object.entries(RESERVADAS)) {
      expect(Object.keys(ARQUIVOS[area]), area).toEqual(expect.arrayContaining(chaves));
      for (const chave of chaves) expect(ARQUIVOS[area][chave].length, chave).toBeGreaterThan(0);
    }
  });

  it('nenhuma chave se repete entre os arquivos', () => {
    const total = Object.values(ARQUIVOS).reduce((n, r) => n + Object.keys(r).length, 0);
    expect(Object.keys(ROTULO_ACAO)).toHaveLength(total);
  });

  it('rotuloDaAcao usa o rótulo ou devolve a própria chave', () => {
    expect(rotuloDaAcao('conferencia_iniciada')).toBe('Conferência iniciada');
    expect(rotuloDaAcao('recebida')).toBe('Chegada registrada');
    expect(rotuloDaAcao('chave_desconhecida')).toBe('chave_desconhecida');
  });
});
