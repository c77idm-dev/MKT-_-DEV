import { describe, expect, it } from 'vitest';
import { selosDaDevolucao } from './selos';

const AGORA = new Date('2026-11-12T12:00:00Z');
const BASE = {
  canal: 'MERCADO_LIVRE' as const,
  status: 'PENDENTE_CHEGADA' as const,
  naoIdentificada: false,
  entregueSegundoCanalEm: null,
  prazoConferenciaCanal: null,
};

describe('selosDaDevolucao (cartão do protótipo C)', () => {
  it('sem nada a destacar', () => {
    expect(selosDaDevolucao(BASE, AGORA)).toEqual([]);
  });

  it('pacote não identificado', () => {
    expect(selosDaDevolucao({ ...BASE, canal: null, naoIdentificada: true, status: 'AGUARDANDO_CONFERENCIA' }, AGORA)).toEqual([
      { texto: 'Não identificada', tom: 'erro' },
    ]);
  });

  it('"Entregue (ML)" só enquanto o pacote não chegou fisicamente (spec §5.2)', () => {
    const entregue = { ...BASE, entregueSegundoCanalEm: new Date('2026-11-11T10:00:00Z') };
    expect(selosDaDevolucao(entregue, AGORA)).toEqual([{ texto: 'Entregue (ML)', tom: 'atencao' }]);
    expect(selosDaDevolucao({ ...entregue, status: 'AGUARDANDO_CONFERENCIA' }, AGORA)).toEqual([]);
  });

  it('prazo do canal: vermelho quando falta 1 dia ou menos', () => {
    expect(selosDaDevolucao({ ...BASE, prazoConferenciaCanal: new Date('2026-11-13T06:00:00Z') }, AGORA)).toEqual([
      { texto: 'Prazo 13/11', tom: 'erro' },
    ]);
    expect(selosDaDevolucao({ ...BASE, prazoConferenciaCanal: new Date('2026-11-20T12:00:00Z') }, AGORA)).toEqual([
      { texto: 'Prazo 20/11', tom: 'neutro' },
    ]);
  });
});
