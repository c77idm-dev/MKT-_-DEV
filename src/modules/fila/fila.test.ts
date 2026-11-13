import { describe, expect, it } from 'vitest';
import { definirFilaParaTestes, FilaMemoria, idDoJob, obterFila, opcoesDaFila } from './fila';

describe('idDoJob', () => {
  it('é o mesmo UUID para a mesma tarefa e chave, e muda com qualquer uma delas', () => {
    const a = idDoJob('ml.enviar-resultado', 'abc');
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(idDoJob('ml.enviar-resultado', 'abc')).toBe(a);
    expect(idDoJob('ml.enviar-resultado', 'abd')).not.toBe(a);
    expect(idDoJob('midia.processar-foto', 'abc')).not.toBe(a);
  });
});

describe('opcoesDaFila', () => {
  it('5 tentativas no total = 4 novas tentativas, com espera crescente de 30 s até 15 min', () => {
    expect(opcoesDaFila('midia.transcodificar')).toEqual({
      retryLimit: 4,
      retryDelay: 30,
      retryBackoff: true,
      retryDelayMax: 900,
      expireInSeconds: 3600,
    });
    expect(opcoesDaFila('nfe.emitir').expireInSeconds).toBe(300);
  });
});

describe('FilaMemoria e obterFila', () => {
  it('guarda os envios e substitui a fila nos testes', async () => {
    const fila = new FilaMemoria();
    definirFilaParaTestes(fila);
    try {
      await obterFila().enviar('ml.enviar-resultado', { devolucaoId: 'd1' }, { chaveUnica: 'd1' });
    } finally {
      definirFilaParaTestes(null);
    }
    expect(fila.enviadas).toEqual([{ nome: 'ml.enviar-resultado', dados: { devolucaoId: 'd1' }, opcoes: { chaveUnica: 'd1' } }]);
  });
});
