import { describe, expect, it } from 'vitest';
import { assinaturaFalha, entradaDoJobMorto } from './falhas';

describe('assinaturaFalha (decisão 2)', () => {
  it('não depende da ordem das chaves', () => {
    expect(assinaturaFalha('nfe.consultar', { notaFiscalId: 'n1', consulta: 3 })).toBe(
      assinaturaFalha('nfe.consultar', { consulta: 3, notaFiscalId: 'n1' }),
    );
  });
  it('muda com a tarefa ou com os dados', () => {
    const a = assinaturaFalha('nfe.emitir', { notaFiscalId: 'n1' });
    expect(assinaturaFalha('nfe.consultar', { notaFiscalId: 'n1' })).not.toBe(a);
    expect(assinaturaFalha('nfe.emitir', { notaFiscalId: 'n2' })).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('entradaDoJobMorto', () => {
  it('pega a tarefa, os dados, o erro e as tentativas do job original', () => {
    const criado = new Date('2026-11-20T10:00:00Z');
    expect(
      entradaDoJobMorto({
        id: 'j-falhas', data: { devolucaoId: 'd1' }, sourceName: 'ml.enviar-resultado', sourceId: 'j-original',
        sourceOutput: { message: 'ML fora do ar' }, sourceRetryCount: 4, createdOn: criado,
      }),
    ).toEqual({ tarefa: 'ml.enviar-resultado', dados: { devolucaoId: 'd1' }, erro: { message: 'ML fora do ar' }, tentativas: 5, jobId: 'j-original', falhouEm: criado });
  });
  it('job sem origem (não veio de outra fila) é ignorado', () => {
    expect(entradaDoJobMorto({ id: 'j', data: {}, sourceName: null, sourceId: null, sourceOutput: null, sourceRetryCount: null, createdOn: new Date() })).toBeNull();
  });
});
