import { describe, expect, it } from 'vitest';
import { mensagemAlertaCancelamento, mensagemCancelamentoBloqueado } from './alocacao';

describe('mensagem da recusa do cancelamento (spec §8.6)', () => {
  it('uma unidade', () => {
    expect(mensagemCancelamentoBloqueado([{ unidade: 2, loteCodigo: 'LOT-000045', loteStatus: 'FECHADO' }])).toBe(
      'Não dá para cancelar esta NF: a unidade 2 está no lote LOT-000045 (Fechado). O cancelamento só é aceito enquanto o lote está Aberto.',
    );
  });

  it('várias unidades e lotes, sem repetir o lote', () => {
    expect(
      mensagemCancelamentoBloqueado([
        { unidade: 1, loteCodigo: 'LOT-000045', loteStatus: 'FECHADO' },
        { unidade: 2, loteCodigo: 'LOT-000045', loteStatus: 'FECHADO' },
        { unidade: 3, loteCodigo: 'LOT-000046', loteStatus: 'NF_EMITIDA' },
      ]),
    ).toBe(
      'Não dá para cancelar esta NF: as unidades 1, 2 e 3 estão nos lotes LOT-000045 (Fechado) e LOT-000046 (NF emitida). O cancelamento só é aceito enquanto o lote está Aberto.',
    );
  });

  it('alerta da corrida: o texto depende do status do lote (decisão 13)', () => {
    expect(mensagemAlertaCancelamento({ unidade: 1, loteCodigo: 'LOT-000045', loteStatus: 'NF_EMITIDA' })).toBe(
      'A NF de devolução foi cancelada com a unidade 1 já no lote LOT-000045 (NF emitida). A unidade continua no lote: confira com o contador se a NF de Remessa precisa ser cancelada.',
    );
    expect(mensagemAlertaCancelamento({ unidade: 1, loteCodigo: 'LOT-000045', loteStatus: 'ENVIADO' })).toBe(
      'A NF de devolução foi cancelada com a unidade 1 já enviada ao fornecedor no lote LOT-000045 (Enviado). Confira com o contador.',
    );
  });
});
