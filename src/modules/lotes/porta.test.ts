import { describe, expect, it } from 'vitest';
import type { DbOuTx } from '@/db/client';
import { portaLotes } from './porta';

const tx = {} as DbOuTx;
const AGORA = new Date('2026-11-12T12:00:00Z');

describe('porta de lotes "sem lotes" (contrato §5.7, D11)', () => {
  it('na autorização e no cancelamento da NF de devolução não faz nada e não impede o cancelamento', async () => {
    await expect(portaLotes.alocarItensProblema(tx, 'dev', AGORA)).resolves.toBeUndefined();
    await expect(portaLotes.desfazerAlocacao(tx, 'dev', AGORA)).resolves.toBeUndefined();
    await expect(portaLotes.motivoParaNaoCancelarDevolucao(tx, 'dev')).resolves.toBeNull();
  });

  it('as remessas chegam na Fase 5', async () => {
    await expect(portaLotes.montarNotaRemessa(tx, 'lote', 'ref')).rejects.toThrow('As remessas chegam na Fase 5');
    await expect(portaLotes.aoAutorizarRemessa(tx, 'lote', 'nota', AGORA)).rejects.toThrow('As remessas chegam na Fase 5');
    await expect(portaLotes.aoCancelarRemessa(tx, 'lote', AGORA)).rejects.toThrow('As remessas chegam na Fase 5');
  });
});
