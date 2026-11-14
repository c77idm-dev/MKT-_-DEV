import { describe, expect, it } from 'vitest';
import { decidirResultado, mensagemContestacao, type ItemConferido } from './resultado';

const item = (unidade: number, m: Partial<ItemConferido> = {}): ItemConferido => ({
  id: `i${unidade}`,
  unidade,
  sku: `SKU-${unidade}`,
  status: 'AGUARDANDO_NF',
  destino: 'BOM',
  motivo: null,
  observacao: null,
  ...m,
});

describe('decidirResultado (spec §6.3, contrato §5.4, D8)', () => {
  it('todos BOM → OK', () => {
    expect(decidirResultado([item(1), item(2)])).toEqual({ tipo: 'OK' });
  });

  it('algum PROBLEMA → contestação com o motivo do primeiro item com problema (pela unidade)', () => {
    const d = decidirResultado([item(2, { destino: 'PROBLEMA', motivo: 'AVARIADO' }), item(1, { destino: 'PROBLEMA', motivo: 'USADO' }), item(3)]);
    expect(d).toMatchObject({ tipo: 'CONTESTAR', motivo: 'SRF6' });
    expect(d.tipo === 'CONTESTAR' ? d.itensProblema.map((i) => i.unidade) : []).toEqual([1, 2]);
  });

  it('item AUSENTE → SRF5', () => {
    expect(decidirResultado([item(1, { status: 'AUSENTE', destino: null, motivo: 'AUSENTE' })])).toMatchObject({ tipo: 'CONTESTAR', motivo: 'SRF5' });
  });
});

describe('mensagemContestacao', () => {
  it('lista as unidades com problema, o motivo e a observação', () => {
    expect(
      mensagemContestacao({
        codigo: 'DEV-000123',
        itensProblema: [item(1, { destino: 'PROBLEMA', motivo: 'AVARIADO', observacao: 'Tela trincada.' }), item(2, { status: 'AUSENTE', destino: null, motivo: 'AUSENTE' })],
        fotos: 3,
      }),
    ).toBe(
      'Na conferência da devolução DEV-000123 encontramos:\n- Unidade 1 (SKU SKU-1): avariado. Tela trincada.\n- Unidade 2 (SKU SKU-2): não veio no pacote.\nAs fotos da conferência estão anexadas.',
    );
  });

  it('sem fotos não fala de anexo, e corta em 2000 caracteres', () => {
    const longa = mensagemContestacao({ codigo: 'DEV-1', itensProblema: [item(1, { destino: 'PROBLEMA', motivo: 'OUTRO', observacao: 'x'.repeat(3000) })], fotos: 0 });
    expect(longa).not.toContain('anexadas');
    expect(longa).toHaveLength(2000);
    expect(longa.endsWith('…')).toBe(true);
  });
});
